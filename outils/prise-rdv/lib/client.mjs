// Pages privées par client : chaque client a un lien secret (/c/<clé>).
// La clé n'est jamais stockée en clair : clients.json ne garde que son empreinte SHA-256.
// La page montre uniquement « libre / pris » : aucun titre ni détail de l'agenda ne sort d'ici.
import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import { config as base, plagesOccupees, listerReservations, modeTest } from "./agenda.mjs";
import liste from "../clients.json" with { type: "json" };

const DEFAUTS = {
  titre: "Planifier l'enquête sur site",
  description:
    "Choisissez les créneaux où Purple Lab peut venir dans vos locaux. Les cases violettes sont libres dans notre agenda\u00a0: comparez-les avec vos disponibilités, cochez celles qui vous conviennent, puis validez.",
  lieu: "Dans vos locaux",
  adresse: "",
  pasMinutes: 60,
  plages: [{ debut: "09:00", fin: "20:00" }],
  margeMinutes: 30,
  delaiMinimumHeures: 48,
  horizonJours: 60,
  maxCreneaux: 20,
  demanderAdresse: true,
};

export const empreinte = (cle) => createHash("sha256").update(String(cle)).digest("hex");

// Retrouve le client à partir de la clé du lien. Renvoie null si la clé est inconnue.
export function trouverClient(cle, clients = liste.clients) {
  if (!cle || typeof cle !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(cle)) return null;
  const h = empreinte(cle);
  const c = clients.find((x) => x.cleSha256 === h && x.actif !== false && (!x.testSeulement || modeTest()));
  return c ? { ...base, ...DEFAUTS, ...c } : null;
}

// Grille complète de la période : chaque créneau est « libre » ou non.
// Le motif de l'indisponibilité n'est jamais transmis.
export function grilleClient({ client, occupe, reservations = [], maintenant = new Date() }) {
  const z = client.fuseau;
  const debutMin = DateTime.fromJSDate(maintenant).plus({ hours: client.delaiMinimumHeures });
  const marge = client.margeMinutes * 60000;
  const bloque = [
    ...occupe.map((o) => ({ debut: +o.debut - marge, fin: +o.fin + marge })),
    ...reservations.map((r) => ({ debut: +new Date(r.debut) - marge, fin: +new Date(r.fin) + marge })),
  ];
  const jours = {};
  let jour = DateTime.fromJSDate(maintenant).setZone(z).startOf("day");
  for (let i = 0; i <= client.horizonJours; i++, jour = jour.plus({ days: 1 })) {
    if (!client.joursOuvres.includes(jour.weekday)) continue;
    const iso = jour.toISODate();
    const ferme = client.joursFermes.includes(iso);
    const cases = [];
    for (const p of client.plages) {
      const [hd, md] = p.debut.split(":").map(Number);
      const [hf, mf] = p.fin.split(":").map(Number);
      const finPlage = jour.set({ hour: hf, minute: mf });
      for (let s = jour.set({ hour: hd, minute: md }); s.plus({ minutes: client.pasMinutes }) <= finPlage; s = s.plus({ minutes: client.pasMinutes })) {
        const f = s.plus({ minutes: client.pasMinutes });
        const libre = !ferme && s >= debutMin && !bloque.some((b) => b.debut < +f && b.fin > +s);
        cases.push({ debut: s.toUTC().toISO(), heure: s.toFormat("HH:mm"), fin: f.toFormat("HH:mm"), libre });
      }
    }
    jours[iso] = cases;
  }
  return jours;
}

export async function grilleDuClient(client, maintenant = new Date()) {
  const de = new Date(+maintenant - 86400000);
  const a = new Date(+maintenant + (client.horizonJours + 2) * 86400000);
  const [occupe, reservations] = await Promise.all([plagesOccupees(de, a), listerReservations()]);
  return grilleClient({ client, occupe, reservations, maintenant });
}

// Regroupe des créneaux consécutifs en blocs [{debut, fin}] (ISO UTC).
export function enBlocs(debuts, pasMinutes) {
  const tries = [...new Set(debuts)].sort();
  const blocs = [];
  for (const d of tries) {
    const debut = DateTime.fromISO(d, { zone: "utc" });
    const fin = debut.plus({ minutes: pasMinutes });
    const dernier = blocs[blocs.length - 1];
    if (dernier && +dernier.fin === +debut) dernier.fin = fin;
    else blocs.push({ debut, fin });
  }
  return blocs.map((b) => ({ debut: b.debut.toISO(), fin: b.fin.toISO() }));
}

// Ce que la page a le droit de savoir sur le client (jamais l'empreinte).
export const profilPublic = (c) => ({
  nom: c.nom,
  titre: c.titre,
  description: c.description,
  lieu: c.lieu,
  adresse: c.adresse,
  contact: c.contact || null,
  pasMinutes: c.pasMinutes,
  maxCreneaux: c.maxCreneaux,
  demanderAdresse: c.demanderAdresse,
  fuseau: c.fuseau,
});
