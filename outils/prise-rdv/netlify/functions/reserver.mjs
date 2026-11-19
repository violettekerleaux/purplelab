// POST /api/reserver : vérifie que le créneau est toujours libre, l'enregistre,
// puis envoie l'invitation (fichier ICS) au visiteur et à Purple Lab.
import { randomUUID } from "node:crypto";
import {
  config as rdv,
  creneauxDisponibles,
  enregistrerReservation,
  supprimerReservation,
  fabriquerIcs,
  reponse,
  env,
  DateTime,
} from "../../lib/agenda.mjs";
import { transporteur, gabarit, ligne, html } from "../../lib/mails.mjs";

const SUJETS = ["Formation ou sensibilisation", "Conseil, enquête ou gestion de crise", "Autre demande"];
const nettoyer = (v, max = 200) => String(v ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
const nettoyerTexte = (v, max = 2000) => String(v ?? "").replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, " ").trim().slice(0, max);

export default async (req) => {
  if (req.method !== "POST") return reponse({ erreur: "Méthode non autorisée" }, 405);
  let d;
  try {
    d = await req.json();
  } catch {
    return reponse({ erreur: "Requête invalide" }, 400);
  }

  // Champ piège invisible : un humain le laisse vide.
  if (d.site) return reponse({ ok: true });

  const prenom = nettoyer(d.prenom, 80);
  const nom = nettoyer(d.nom, 80);
  const email = nettoyer(d.email, 160).toLowerCase();
  const organisation = nettoyer(d.organisation, 160);
  const telephone = nettoyer(d.telephone, 40);
  const sujet = SUJETS.includes(d.sujet) ? d.sujet : SUJETS[2];
  const message = nettoyerTexte(d.message);
  const debutIso = nettoyer(d.debut, 40);

  if (!prenom || !nom) return reponse({ erreur: "Merci d'indiquer votre prénom et votre nom." }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return reponse({ erreur: "Adresse e-mail invalide." }, 400);
  if (!d.consentement) return reponse({ erreur: "Merci d'accepter l'utilisation de vos données pour ce rendez-vous." }, 400);

  // Le créneau doit faire partie des créneaux libres recalculés à l'instant.
  let jours;
  try {
    jours = await creneauxDisponibles();
  } catch (e) {
    console.error("reserver/agenda", e);
    return reponse({ erreur: "Impossible de vérifier l'agenda. Réessayez dans un instant." }, 503);
  }
  const libre = Object.values(jours).flat().some((c) => c.debut === debutIso);
  if (!libre) return reponse({ erreur: "Ce créneau vient d'être pris. Merci d'en choisir un autre.", code: "pris" }, 409);

  const debut = DateTime.fromISO(debutIso, { zone: "utc" });
  const fin = debut.plus({ minutes: rdv.dureeMinutes });
  const uid = `${randomUUID()}@purplelab.fr`;

  const ok = await enregistrerReservation({
    uid,
    debut: debut.toISO(),
    fin: fin.toISO(),
    prenom,
    nom,
    email,
    organisation,
    creeLe: new Date().toISOString(),
  });
  if (!ok) return reponse({ erreur: "Ce créneau vient d'être pris. Merci d'en choisir un autre.", code: "pris" }, 409);

  const expediteur = env("MAIL_EXPEDITEUR") || env("SMTP_USER") || "rdv@purplelab.fr";
  const destPurple = env("MAIL_PURPLELAB") || "violette@purplelab.fr";
  const nomPurple = env("NOM_PURPLELAB") || "Purple Lab";
  const lieu = rdv.lienVisio || rdv.lieu;
  const quand = debut.setZone(rdv.fuseau).setLocale("fr").toFormat("cccc d LLLL yyyy 'à' HH'h'mm");
  const qui = `${prenom} ${nom}${organisation ? ` (${organisation})` : ""}`;

  const ics = fabriquerIcs({
    uid,
    debut: debut.toJSDate(),
    fin: fin.toJSDate(),
    titre: `${rdv.titre} · ${qui}`,
    description: [
      `Rendez-vous pris sur purplelab.fr`,
      `Sujet : ${sujet}`,
      `Contact : ${prenom} ${nom}, ${email}${telephone ? `, ${telephone}` : ""}`,
      organisation && `Organisation : ${organisation}`,
      message && `Message : ${message}`,
      rdv.lienVisio && `Visio : ${rdv.lienVisio}`,
    ]
      .filter(Boolean)
      .join("\n"),
    lieu,
    organisateur: { nom: nomPurple, email: expediteur },
    invites: [
      { nom: nomPurple, email: destPurple, statut: "ACCEPTED" },
      { nom: `${prenom} ${nom}`, email },
    ],
  });

  const invitation = { method: "REQUEST", content: ics };

  const mails = [
    {
      from: `${nomPurple} <${expediteur}>`,
      to: `${prenom} ${nom} <${email}>`,
      replyTo: destPurple,
      subject: `Rendez-vous confirmé avec Purple Lab, ${quand}`,
      text: `Bonjour ${prenom},\n\nVotre rendez-vous est confirmé : ${quand} (heure de Paris), ${rdv.dureeMinutes} minutes.\nLieu : ${lieu}\n\nL'invitation est jointe à ce message pour l'ajouter à votre agenda.\nPour déplacer ou annuler, il suffit de répondre à ce mail.\n\nÀ bientôt,\nPurple Lab`,
      html: gabarit(
        `${quand.charAt(0).toUpperCase() + quand.slice(1)}`,
        `Bonjour ${html(prenom)}, votre rendez-vous avec Purple Lab est confirmé. L'invitation est jointe pour l'ajouter à votre agenda. Pour déplacer ou annuler, il suffit de répondre à ce mail.`,
        ligne("Durée", `${rdv.dureeMinutes} minutes`) + ligne("Lieu", lieu) + ligne("Sujet", sujet)
      ),
      icalEvent: invitation,
    },
    {
      from: `${nomPurple} <${expediteur}>`,
      to: destPurple,
      replyTo: `${prenom} ${nom} <${email}>`,
      subject: `Nouveau rendez-vous : ${qui}, ${quand}`,
      text: `Nouveau rendez-vous pris sur le site.\n\n${quand} (${rdv.dureeMinutes} min)\n${qui}\n${email}${telephone ? `\n${telephone}` : ""}\nSujet : ${sujet}\n${message ? `\nMessage :\n${message}\n` : ""}`,
      html: gabarit(
        `Nouveau rendez-vous`,
        `${html(qui)} a réservé un créneau le ${html(quand)}.`,
        ligne("E-mail", email) + ligne("Téléphone", telephone) + ligne("Organisation", organisation) + ligne("Sujet", sujet) + ligne("Message", message)
      ),
      icalEvent: invitation,
    },
  ];

  // Purple Lab d'abord : si ce mail-là échoue, on annule la réservation
  // (sinon personne ne saurait qu'elle existe).
  const [mailVisiteur, mailPurple] = mails;
  let transport;
  try {
    transport = await transporteur();
    await transport.envoyer(mailPurple);
  } catch (e) {
    console.error("reserver/mail-purplelab", e);
    await supprimerReservation(debut.toISO()).catch(() => {});
    return reponse({ erreur: "La réservation n'a pas pu être envoyée. Réessayez ou écrivez à contact@purplelab.fr." }, 502);
  }
  try {
    await transport.envoyer(mailVisiteur);
  } catch (e) {
    console.error("reserver/mail-visiteur", e);
    return reponse({ ok: true, quand, dureeMinutes: rdv.dureeMinutes, lieu, avertissement: "Votre rendez-vous est enregistré, mais l'e-mail de confirmation n'a pas pu vous être envoyé. Purple Lab vous écrira." });
  }

  return reponse({ ok: true, quand, dureeMinutes: rdv.dureeMinutes, lieu });
};

export const config = { path: "/api/reserver" };
