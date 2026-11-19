// Logique partagée : lecture de l'agenda (flux iCal), calcul des créneaux libres,
// stockage des réservations et fabrication de l'invitation ICS.
import ICAL from "ical.js";
import { DateTime } from "luxon";
import config from "../rdv.config.json" with { type: "json" };

export { config };

const env = (k) => (typeof Netlify !== "undefined" ? Netlify.env.get(k) : process.env[k]);
export const modeTest = () => env("RDV_MODE_TEST") === "1";

// ---------------------------------------------------------------------------
// 1. Lecture de l'agenda
// ---------------------------------------------------------------------------

// Renvoie la liste des plages occupées [{debut: Date, fin: Date}] entre `de` et `a`.
export async function plagesOccupees(de, a) {
  // Les liens iPhone / iCloud commencent par webcal:// : c'est du https.
  const urls = ["", "_2", "_3", "_4", "_5"].map((n) => env("AGENDA_ICS_URL" + n) || "").join(",").split(/[\s,]+/).filter(Boolean).map((u) => u.replace(/^webcals?:\/\//i, "https://"));
  if (!urls.length) throw new Error("AGENDA_ICS_URL n'est pas renseignée");
  const monEmail = (env("AGENDA_EMAIL") || "").toLowerCase();
  const toutes = [];
  for (const url of urls) {
    const rep = await fetch(url, { headers: { "user-agent": "purplelab-rdv" } });
    if (!rep.ok) throw new Error(`Agenda illisible (${rep.status})`);
    const lues = lireIcs(await rep.text(), de, a, monEmail);
    console.log(`agenda ${urls.indexOf(url) + 1}/${urls.length} : ${lues.length} plages occupées`);
    toutes.push(...lues);
  }
  return toutes;
}

export function lireIcs(texte, de, a, monEmail = "") {
  const racine = new ICAL.Component(ICAL.parse(texte));
  for (const tz of racine.getAllSubcomponents("vtimezone")) {
    const id = tz.getFirstPropertyValue("tzid");
    if (!ICAL.TimezoneService.has(id)) ICAL.TimezoneService.register(tz);
  }

  const principaux = new Map();
  const exceptions = [];
  for (const v of racine.getAllSubcomponents("vevent")) {
    const ev = new ICAL.Event(v);
    if (ev.isRecurrenceException()) exceptions.push(ev);
    else principaux.set(ev.uid, ev);
  }
  for (const ex of exceptions) {
    const p = principaux.get(ex.uid);
    if (p) p.relateException(ex);
    else principaux.set(ex.uid + ex.recurrenceId.toString(), ex);
  }

  const occupe = [];
  const ajouter = (comp, debut, fin) => {
    if (!estBloquant(comp, monEmail)) return;
    const d = enDate(debut), f = enDate(fin, true, debut);
    if (f > de && d < a) occupe.push({ debut: d, fin: f });
  };

  for (const ev of principaux.values()) {
    if (!ev.isRecurring()) {
      ajouter(ev.component, ev.startDate, ev.endDate || ev.startDate);
      continue;
    }
    const it = ev.iterator();
    let suivant, garde = 0;
    while ((suivant = it.next()) && garde++ < 20000) {
      const det = ev.getOccurrenceDetails(suivant);
      const d = enDate(det.startDate);
      if (d >= a) break;
      ajouter(det.item.component, det.startDate, det.endDate);
    }
  }
  return occupe;
}

// Un évènement bloque l'agenda sauf s'il est annulé, marqué « disponible »
// ou refusé par la propriétaire de l'agenda.
function estBloquant(comp, monEmail) {
  const statut = (comp.getFirstPropertyValue("status") || "").toUpperCase();
  if (statut === "CANCELLED") return false;
  const transp = (comp.getFirstPropertyValue("transp") || "OPAQUE").toUpperCase();
  if (transp === "TRANSPARENT") return false;
  if (monEmail) {
    for (const p of comp.getAllProperties("attendee")) {
      const mail = String(p.getFirstValue() || "").replace(/^mailto:/i, "").toLowerCase();
      if (mail === monEmail && String(p.getParameter("partstat") || "").toUpperCase() === "DECLINED") return false;
    }
  }
  return true;
}

// Convertit une date ICAL en Date JS. Les journées entières (sans heure)
// sont interprétées dans le fuseau de l'agenda.
function enDate(t, estFin = false, debut = null) {
  if (t.isDate) {
    return DateTime.fromObject({ year: t.year, month: t.month, day: t.day }, { zone: config.fuseau }).toJSDate();
  }
  if (estFin && debut && !debut.isDate && t.compare(debut) < 0) return enDate(debut);
  return t.toJSDate();
}

// ---------------------------------------------------------------------------
// 2. Créneaux libres
// ---------------------------------------------------------------------------

export function calculerCreneaux({ occupe, reservations = [], maintenant = new Date() }) {
  const z = config.fuseau;
  const debutMin = DateTime.fromJSDate(maintenant).plus({ hours: config.delaiMinimumHeures });
  const marge = config.margeMinutes * 60000;
  const bloque = [
    ...occupe.map((o) => ({ debut: +o.debut - marge, fin: +o.fin + marge })),
    ...reservations.map((r) => ({ debut: +new Date(r.debut) - marge, fin: +new Date(r.fin) + marge })),
  ];
  const parJour = new Map();
  for (const r of reservations) {
    const j = DateTime.fromISO(r.debut).setZone(z).toISODate();
    parJour.set(j, (parJour.get(j) || 0) + 1);
  }
  const jours = {};
  let jour = DateTime.fromJSDate(maintenant).setZone(z).startOf("day");
  for (let i = 0; i <= config.horizonJours; i++, jour = jour.plus({ days: 1 })) {
    if (!config.joursOuvres.includes(jour.weekday)) continue;
    const iso = jour.toISODate();
    if (config.joursFermes.includes(iso)) continue;
    const dejaPris = parJour.get(iso) || 0;
    if (config.maxRdvParJour && dejaPris >= config.maxRdvParJour) continue;
    const liste = [];
    for (const p of config.plages) {
      const [hd, md] = p.debut.split(":").map(Number);
      const [hf, mf] = p.fin.split(":").map(Number);
      const finPlage = jour.set({ hour: hf, minute: mf });
      for (let s = jour.set({ hour: hd, minute: md }); s.plus({ minutes: config.dureeMinutes }) <= finPlage; s = s.plus({ minutes: config.pasMinutes })) {
        const f = s.plus({ minutes: config.dureeMinutes });
        if (s < debutMin) continue;
        if (bloque.some((b) => b.debut < +f && b.fin > +s)) continue;
        liste.push({ debut: s.toUTC().toISO(), heure: s.toFormat("HH:mm") });
      }
    }
    if (liste.length) jours[iso] = liste;
  }
  return jours;
}

export async function creneauxDisponibles(maintenant = new Date()) {
  const de = new Date(+maintenant - 86400000);
  const a = new Date(+maintenant + (config.horizonJours + 2) * 86400000);
  const [occupe, reservations] = await Promise.all([plagesOccupees(de, a), listerReservations()]);
  return calculerCreneaux({ occupe, reservations, maintenant });
}

// ---------------------------------------------------------------------------
// 3. Réservations (Netlify Blobs) : bloque le créneau tout de suite,
//    avant même que l'invitation n'apparaisse dans Google Agenda.
// ---------------------------------------------------------------------------

const memoire = new Map();
async function magasin() {
  if (modeTest()) return null;
  const { getStore } = await import("@netlify/blobs");
  return getStore({ name: "reservations", consistency: "strong" });
}

export async function listerReservations() {
  const m = await magasin();
  const maintenant = Date.now();
  if (!m) return [...memoire.values()].filter((r) => +new Date(r.fin) > maintenant);
  const { blobs } = await m.list();
  const out = [];
  for (const b of blobs) {
    const r = await m.get(b.key, { type: "json" });
    if (r && +new Date(r.fin) > maintenant) out.push(r);
  }
  return out;
}

export async function enregistrerReservation(r) {
  const m = await magasin();
  const cle = r.debut.replace(/[^0-9TZ]/g, "");
  if (!m) {
    if (memoire.has(cle)) return false;
    memoire.set(cle, r);
    return true;
  }
  if (await m.get(cle)) return false;
  await m.setJSON(cle, r);
  return true;
}

export async function supprimerReservation(debutIso) {
  const m = await magasin();
  const cle = debutIso.replace(/[^0-9TZ]/g, "");
  if (!m) return memoire.delete(cle);
  await m.delete(cle);
}

// ---------------------------------------------------------------------------
// 4. Invitation ICS
// ---------------------------------------------------------------------------

const echap = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
function plier(ligne) {
  const out = [];
  let reste = ligne;
  while (Buffer.byteLength(reste, "utf8") > 74) {
    let n = 74;
    while (Buffer.byteLength(reste.slice(0, n), "utf8") > 74) n--;
    out.push(reste.slice(0, n));
    reste = " " + reste.slice(n);
  }
  out.push(reste);
  return out.join("\r\n");
}

export function fabriquerIcs({ uid, debut, fin, titre, description, lieu, organisateur, invites }) {
  const lignes = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Purple Lab//Prise de rendez-vous//FR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(debut)}`,
    `DTEND:${icsDate(fin)}`,
    `SUMMARY:${echap(titre)}`,
    `DESCRIPTION:${echap(description)}`,
    `LOCATION:${echap(lieu)}`,
    `ORGANIZER;CN=${echap(organisateur.nom)}:mailto:${organisateur.email}`,
    ...invites.map(
      (i) => `ATTENDEE;CN=${echap(i.nom)};ROLE=REQ-PARTICIPANT;PARTSTAT=${i.statut || "NEEDS-ACTION"};RSVP=TRUE:mailto:${i.email}`
    ),
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "TRANSP:OPAQUE",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    "DESCRIPTION:Rappel",
    "TRIGGER:-PT15M",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lignes.map(plier).join("\r\n") + "\r\n";
}

export const reponse = (corps, statut = 200, entetes = {}) =>
  new Response(JSON.stringify(corps), {
    status: statut,
    headers: { "content-type": "application/json; charset=utf-8", ...entetes },
  });

export { env, DateTime };
