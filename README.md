# Copie du site purplelab.fr (Webflow), 7 novembre 2026

Copie statique et autonome du site en ligne : HTML, CSS, scripts Webflow, images, logos, polices Inter.
Rien n'a été modifié dans le contenu ni la mise en page.

## Ouvrir la copie
Site en ligne : https://purplelab.fr (hébergé sur Netlify, déployé automatiquement depuis la branche main).

Pour le voir en local, depuis ce dossier : `python3 -m http.server 8000`, puis http://localhost:8000


## Pages
- index.html (accueil)
- formations-et-sensibilisations.html
- conseil-enquete-et-gestion-de-crise.html
- contact.html
- politique-de-confidentialite.html

## Dossiers
- assets/cdn/ : fichiers hébergés par Webflow (images, CSS, JS, polices)
- assets/d3e54v103j8qbb/ : jQuery fourni par Webflow
- assets/vendor/ : scripts tiers copiés en local (GSAP, Lenis, Swiper, SplitType, Finsweet cookies et filtres, slider Flowbase)

## Ce qui reste branché sur l'extérieur
- Calendly (prise de rendez-vous), réseaux sociaux, LinkedIn de l'équipe
- Adobe Fonts (kit Typekit kni4bdw), chargé mais aucune police du kit n'est utilisée dans le CSS
- Google Analytics, Google Tag Manager et pixel Facebook : présents mais jamais configurés (identifiants factices)

## Points notés
- Le lien "Expertises" du menu pointe vers /expertises, qui renvoie une erreur 404 sur le site en ligne.
- Le texte courant utilise la police système (San Francisco sur Mac, Segoe sur Windows) ; Inter n'est utilisé que sur certains intitulés.
