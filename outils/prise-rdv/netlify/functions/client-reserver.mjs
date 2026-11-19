// POST /api/client/reserver (en-tête x-cle) : le client réserve un ou plusieurs créneaux.
// Les créneaux qui se suivent sont regroupés en un seul rendez-vous.
// Chaque rendez-vous bloque l'agenda tout de suite et part en invitation (ICS)
// à Purple Lab et au client.
import { randomUUID } from "node:crypto";
import { reponse, enregistrerReservation, supprimerReservation, fabriquerIcs, env, DateTime } from "../../lib/agenda.mjs";
import { trouverClient, grilleDuClient, enBlocs } from "../../lib/client.mjs";
import { transporteur, gabarit, ligne, html } from "../../lib/mails.mjs";

const prive = { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow" };
const nettoyer = (v, max = 200) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const nettoyerTexte = (v, max = 2000) => String(v ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max);

export default async (req) => {
  if (req.method !== "POST") return reponse({ erreur: "Méthode non autorisée" }, 405, prive);
  const client = trouverClient(req.headers.get("x-cle"));
  if (!client) return reponse({ erreur: "Lien invalide ou expiré." }, 404, prive);
  let d;
  try {
    d = await req.json();
  } catch {
    return reponse({ erreur: "Requête invalide" }, 400, prive);
  }

  const prenom = nettoyer(d.prenom, 80);
  const nom = nettoyer(d.nom, 80);
  const email = nettoyer(d.email, 160).toLowerCase();
  const telephone = nettoyer(d.telephone, 40);
  const adresse = (client.demanderAdresse && nettoyer(d.adresse, 300)) || client.adresse || "";
  const message = nettoyerTexte(d.message);
  const MODES = ["presentiel", "visio"];
  const choix = (Array.isArray(d.creneaux) ? d.creneaux : [])
    .map((c) => (typeof c === "string" ? { debut: c, mode: "presentiel" } : { debut: nettoyer(c?.debut, 40), mode: MODES.includes(c?.mode) ? c.mode : "presentiel" }))
    .filter((c) => c.debut);

  if (!prenom || !nom) return reponse({ erreur: "Merci d'indiquer votre prénom et votre nom." }, 400, prive);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return reponse({ erreur: "Adresse e-mail invalide." }, 400, prive);
  if (!choix.length) return reponse({ erreur: "Choisissez au moins un créneau." }, 400, prive);
  if (choix.length > client.maxCreneaux) return reponse({ erreur: `${client.maxCreneaux} créneaux au maximum par demande.` }, 400, prive);

  // Tous les créneaux doivent être libres à l'instant même.
  let jours;
  try {
    jours = await grilleDuClient(client);
  } catch (e) {
    console.error("client-reserver/agenda", e);
    return reponse({ erreur: "Impossible de vérifier l'agenda. Réessayez dans un instant." }, 503, prive);
  }
  const libres = new Set(Object.values(jours).flat().filter((c) => c.libre).map((c) => c.debut));
  const pris = choix.filter((c) => !libres.has(c.debut)).map((c) => c.debut);
  if (pris.length) return reponse({ erreur: "Un des créneaux choisis vient d'être pris. La grille a été mise à jour.", code: "pris", pris }, 409, prive);

  // Présentiel : l'heure avant chaque rendez-vous doit rester libre pour le trajet,
  // y compris par rapport aux autres créneaux demandés ici.
  const parDebut = new Map(Object.values(jours).flat().map((c) => [c.debut, c]));
  const choisis = new Set(choix.map((c) => c.debut));
  const blocsBruts = MODES.flatMap((m) =>
    enBlocs(choix.filter((c) => c.mode === m).map((c) => c.debut), client.pasMinutes).map((b) => ({ ...b, mode: m, uid: `${randomUUID()}@purplelab.fr` }))
  ).sort((a, b) => a.debut.localeCompare(b.debut));
  const trajetMs = (client.trajetMinutes || 0) * 60000;
  for (const b of blocsBruts.filter((x) => x.mode === "presentiel")) {
    const avant = new Date(+new Date(b.debut) - trajetMs).toISOString();
    const autreChoisi = [...choisis].some((d) => d >= avant && d < b.debut);
    if (!parDebut.get(b.debut)?.trajetLibre || autreChoisi)
      return reponse({ erreur: "En présentiel, il faut une heure libre avant le rendez-vous pour le trajet. Choisissez un autre créneau ou la visio.", code: "trajet" }, 400, prive);
  }
  const blocs = blocsBruts;
  const enregistres = [];
  for (const b of blocs) {
    const debutBloque = b.mode === "presentiel" ? new Date(+new Date(b.debut) - trajetMs).toISOString() : b.debut;
    b.cle = debutBloque;
    const ok = await enregistrerReservation({ uid: b.uid, debut: debutBloque, fin: b.fin, rdvDebut: b.debut, mode: b.mode, client: client.id, prenom, nom, email, creeLe: new Date().toISOString() });
    if (!ok) {
      for (const e of enregistres) await supprimerReservation(e.cle).catch(() => {});
      return reponse({ erreur: "Un des créneaux choisis vient d'être pris. La grille a été mise à jour.", code: "pris" }, 409, prive);
    }
    enregistres.push(b);
  }

  const expediteur = env("MAIL_EXPEDITEUR") || env("SMTP_USER") || "rdv@purplelab.fr";
  const destPurple = env("MAIL_PURPLELAB") || "violette@purplelab.fr";
  const nomPurple = env("NOM_PURPLELAB") || "Purple Lab";
  const z = client.fuseau;
  const quand = (b) => {
    const d0 = DateTime.fromISO(b.debut).setZone(z).setLocale("fr");
    const f0 = DateTime.fromISO(b.fin).setZone(z);
    return `${d0.toFormat("cccc d LLLL")} de ${d0.toFormat("H'h'mm")} à ${f0.toFormat("H'h'mm")}`.replace(/h00/g, "h") + (b.mode === "visio" ? " (visio)" : " (présentiel)");
  };
  const listeTexte = blocs.map((b) => `• ${quand(b)}`).join("\n");
  const listeHtml = blocs.map((b) => `<li style="margin:2px 0">${html(quand(b))}</li>`).join("");
  const lieuSite = adresse ? `${client.nom}, ${adresse}` : client.nom;
  const lieuVisio = client.lienVisio || "Visioconférence (le lien vous sera envoyé par Purple Lab)";
  const lieuDe = (b) => (b.mode === "visio" ? lieuVisio : lieuSite);
  const qui = `${prenom} ${nom} (${client.nom})`;

  const mailsPour = (b) => {
    const ics = fabriquerIcs({
      uid: b.uid,
      debut: new Date(b.debut),
      fin: new Date(b.fin),
      titre: `Purple Lab ${b.mode === "visio" ? "en visio" : "sur site"} · ${client.nom}`,
      description: [
        `Réservé par ${prenom} ${nom}, ${email}${telephone ? `, ${telephone}` : ""}`,
        adresse && `Adresse : ${adresse}`,
        message && `Précisions : ${message}`,
      ].filter(Boolean).join("\n"),
      lieu: lieuDe(b),
      organisateur: { nom: nomPurple, email: expediteur },
      invites: [
        { nom: nomPurple, email: destPurple, statut: "ACCEPTED" },
        { nom: `${prenom} ${nom}`, email },
      ],
    });
    return { method: "REQUEST", content: ics };
  };

  let transport;
  try {
    transport = await transporteur();
    // Une invitation par rendez-vous pour Purple Lab : chacune s'ajoute à l'agenda.
    for (const [i, b] of blocs.entries()) {
      await transport.envoyer({
        from: `${nomPurple} <${expediteur}>`,
        to: destPurple,
        replyTo: `${prenom} ${nom} <${email}>`,
        subject: `${client.nom} a réservé : ${quand(b)}${blocs.length > 1 ? ` (${i + 1}/${blocs.length})` : ""}`,
        text: `${qui} a réservé ${blocs.length > 1 ? "ces créneaux" : "ce créneau"} pour l'enquête :\n${listeTexte}\n\n${email}${telephone ? `\n${telephone}` : ""}${adresse ? `\nAdresse : ${adresse}` : ""}${message ? `\n\nPrécisions :\n${message}` : ""}`,
        html: gabarit("Nouvelle réservation", `${html(qui)} a réservé pour l'enquête :<ul style="padding-left:18px;margin:8px 0">${listeHtml}</ul>`, ligne("E-mail", email) + ligne("Téléphone", telephone) + ligne("Adresse", adresse) + ligne("Précisions", message), "Réservation client"),
        icalEvent: mailsPour(b),
      });
    }
  } catch (e) {
    console.error("client-reserver/mail-purplelab", e);
    for (const b of blocs) await supprimerReservation(b.cle).catch(() => {});
    return reponse({ erreur: "La réservation n'a pas pu être envoyée. Réessayez ou écrivez à contact@purplelab.fr." }, 502, prive);
  }

  let avertissement = null;
  try {
    for (const [i, b] of blocs.entries()) {
      await transport.envoyer({
        from: `${nomPurple} <${expediteur}>`,
        to: `${prenom} ${nom} <${email}>`,
        replyTo: destPurple,
        subject: `Rendez-vous Purple Lab : ${quand(b)}${blocs.length > 1 ? ` (${i + 1}/${blocs.length})` : ""}`,
        text: `Bonjour ${prenom},\n\nC'est noté, voici vos rendez-vous avec Purple Lab :\n${listeTexte}\n\nL'invitation est jointe pour l'ajouter à votre agenda. Pour déplacer ou annuler, il suffit de répondre à ce mail.\n\nÀ bientôt,\nPurple Lab`,
        html: gabarit("C'est noté", `Bonjour ${html(prenom)}, voici vos rendez-vous avec Purple Lab :<ul style="padding-left:18px;margin:8px 0">${listeHtml}</ul>L'invitation est jointe pour l'ajouter à votre agenda. Pour déplacer ou annuler, il suffit de répondre à ce mail.`, ligne("Lieu", lieuSite) + (blocs.some((b) => b.mode === "visio") ? ligne("Visio", lieuVisio) : ""), "Réservation confirmée"),
        icalEvent: mailsPour(b),
      });
    }
  } catch (e) {
    console.error("client-reserver/mail-client", e);
    avertissement = "Vos créneaux sont bien réservés, mais l'e-mail de confirmation n'a pas pu vous être envoyé. Purple Lab vous écrira.";
  }

  return reponse({ ok: true, rendezVous: blocs.map((b) => ({ debut: b.debut, fin: b.fin, texte: quand(b) })), avertissement }, 200, prive);
};

export const config = { path: "/api/client/reserver" };
