# Prise de rendez-vous Purple Lab (remplace Calendly)

La page lit les créneaux libres dans Google Agenda, propose uniquement ceux-là,
et envoie une invitation (fichier ICS) au visiteur et à Purple Lab.

Rien n'est en ligne pour l'instant. Calendly et rdv.purplelab.fr n'ont pas été touchés.

## Pages privées pour un client (enquête sur site)

Chaque client peut avoir sa propre page, accessible seulement par un lien secret :
`https://<adresse du site>/c/<clé>`. Elle n'est liée nulle part et n'est pas indexée par Google.

Ce que voit le client :
- une grille semaine par semaine (lundi–vendredi, 9h–20h, cases d'une heure) avec, pour chaque case,
  « libre » ou « indisponible » ; jamais le titre ni le détail de tes rendez-vous ;
- un bandeau des semaines à venir avec le nombre d'heures libres, et un résumé texte
  (« lun. 23 nov. : 9h–12h, 14h–18h ») qu'il peut copier pour comparer avec son agenda ;
- il coche une ou plusieurs cases (ou une journée entière), remplit nom, e-mail, adresse, précisions, et valide.

Ce qui se passe à la validation :
- les cases qui se suivent deviennent un seul rendez-vous (ex. 9h–12h) ;
- les créneaux sont bloqués aussitôt (personne d'autre ne peut les prendre) ;
- toi et le client recevez une invitation par rendez-vous, qui s'ajoute à Google Agenda.

Réglages par défaut d'une page client (modifiables client par client dans `clients.json`) :
créneaux de 1 h, 9h–20h, 30 min de marge autour de tes rendez-vous (trajet),
réservation au plus tôt 48 h à l'avance, sur 60 jours, 20 créneaux maximum par demande.

Ajouter un client (une action par ligne) :
1. `node outils/nouveau-client.mjs "Nom du client" "adresse du site"`
2. Copier le lien affiché et le garder : il n'est enregistré nulle part ailleurs.
3. Redéployer le projet Netlify, puis envoyer le lien au client.

Ne pas demander l'adresse au client : mettre `"demanderAdresse": false` sur ce client (c'est le cas pour TF1).

Couper un lien : mettre `"actif": false` sur le client dans `clients.json`, puis redéployer.

Démonstration en local : `npm run local`, puis http://localhost:8888/c/demo-enquete-sur-site-2026
(ce client de démonstration ne fonctionne qu'en local).

## Ce qui est dans ce dossier

- `public/index.html` : la page (calendrier, créneaux, formulaire, confirmation).
- `netlify/functions/creneaux.mjs` : donne les créneaux libres.
- `netlify/functions/reserver.mjs` : vérifie le créneau, l'enregistre, envoie les e-mails.
- `lib/agenda.mjs` : lecture de l'agenda et calcul des créneaux.
- `rdv.config.json` : les réglages (horaires, durée, jours fériés…).
- `public/client.html`, `lib/client.mjs`, `netlify/functions/client-*.mjs`, `clients.json` : pages privées clients.
- `outils/nouveau-client.mjs` : crée le lien d'un nouveau client.
- `test/` : faux agenda et tests.
- `apercu-*.png` : captures de la page.

## Réglages (rdv.config.json)

- Durée : 30 min, un créneau toutes les 30 min.
- Jours : lundi à vendredi, 9h30–12h30 et 14h–18h (heure de Paris).
- 15 min de marge avant et après chaque rendez-vous de l'agenda.
- Réservation au plus tôt 24 h à l'avance, au plus tard 30 jours.
- 4 rendez-vous maximum par jour pris via la page.
- Jours fériés 2026–2027 exclus.

Un évènement de l'agenda bloque le créneau, sauf s'il est annulé,
marqué « Disponible » ou refusé.

## Plusieurs agendas

La page additionne les créneaux occupés de tous tes agendas : il suffit d'être pris dans un seul pour que la case soit « indisponible ».
Si un des agendas ne répond pas, la page n'affiche rien plutôt que de montrer un créneau libre par erreur.

Récupérer le lien de chaque agenda Google (une action par ligne) :
1. Ouvrir Google Agenda sur ordinateur.
2. Roue dentée > Paramètres.
3. À gauche, sous « Paramètres de mes agendas », cliquer sur un agenda.
4. Descendre jusqu'à « Adresse secrète au format iCal » et copier le lien.
5. Recommencer pour chaque agenda.

Agenda Outlook / Microsoft 365 : Paramètres > Calendrier > Calendriers partagés > « Publier un calendrier » > choisir « Peut afficher toutes les informations » > copier le lien ICS.

Les mettre dans Netlify :
1. Netlify > le projet de prise de rendez-vous > Project configuration > Environment variables.
2. Add a variable > Key : `AGENDA_ICS_URL`.
3. Value : coller tous les liens à la suite, séparés par une virgule.
4. Save, puis Deploys > Trigger deploy.

## Mise en ligne, le moment venu (une action par ligne)

1. Google Agenda > Paramètres > ton agenda > « Adresse secrète au format iCal » : copier le lien.
2. Dans Google Workspace, créer l'alias rdv@purplelab.fr sur violette@purplelab.fr.
3. Dans ton compte Google, créer un « mot de passe d'application » pour la messagerie.
4. Sur Netlify, créer un nouveau projet à partir de ce dossier.
5. Dans ce projet Netlify, ajouter les variables d'environnement ci-dessous.
6. Tester une réservation sur l'adresse netlify.app.
7. Seulement ensuite : faire pointer rdv.purplelab.fr vers ce projet et arrêter Calendly.

Variables d'environnement Netlify :

| Variable | Valeur |
|---|---|
| AGENDA_ICS_URL | le lien secret iCal (plusieurs agendas possibles, séparés par des virgules) |
| AGENDA_EMAIL | violette@purplelab.fr (pour ignorer les invitations refusées) |
| SMTP_HOST | smtp.gmail.com |
| SMTP_PORT | 465 |
| SMTP_USER | violette@purplelab.fr |
| SMTP_PASS | le mot de passe d'application |
| MAIL_EXPEDITEUR | rdv@purplelab.fr |
| MAIL_PURPLELAB | violette@purplelab.fr (reçoit les nouveaux rendez-vous) |

Le lien secret iCal donne accès à tout l'agenda : il reste dans Netlify, jamais dans le code.

## Tester en local

    npm install
    npm test                 # 28 tests (créneaux publics et pages clients)
    npm run local            # puis ouvrir http://localhost:8888

En local, l'agenda est `test/agenda-test.ics` et les e-mails sont écrits dans
`test/mails-test/` au lieu d'être envoyés.
