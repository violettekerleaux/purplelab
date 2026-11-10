#!/usr/bin/env python3
"""Construit la page « Testez vos connaissances » + l'encart d'accueil, à partir du site en production."""
import re, shutil, pathlib, sys
SRC = pathlib.Path('/mnt/project-files/purple-lab/site-seo/site')
OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '/mnt/project-files/purple-lab/test-harcelement/pret-a-publier')
OUT.mkdir(parents=True, exist_ok=True)
HERE = pathlib.Path(__file__).parent
SLUG = 'test-harcelement-au-travail'

QUIZ = (HERE / 'quiz.html').read_text()

# --- 1. Nouvelle page, gabarit = politique de confidentialité
p = (SRC / 'politique-de-confidentialite.html').read_text()
title = 'Violences au travail : votre entreprise est-elle en règle ? · Purple Lab'
desc = "Autodiagnostic gratuit sur le harcèlement et les discriminations : référent, procédure de signalement, DUERP, égalité femmes-hommes… Vérifiez si votre entreprise respecte ses obligations légales."
p = re.sub(r'<title>.*?</title>', f'<title>{title}</title>', p)
p = p.replace('https://purplelab.fr/politique-de-confidentialite', f'https://purplelab.fr/{SLUG}')
old_desc = "Données personnelles, cookies et hébergement du site purplelab.fr : ce que Purple Lab collecte, et ce qu&#x27;il ne collecte pas."
old_desc2 = "Données personnelles, cookies et hébergement du site purplelab.fr : ce que Purple Lab collecte, et ce qu'il ne collecte pas."
for d in (old_desc, old_desc2):
    p = p.replace(d, desc)
p = p.replace('Politique de confidentialité · Purple Lab', title)
assert desc in p, 'description non remplacée'
# contenu
a = p.index('<section class="section_hero is-contact-page">')
b = p.index('<section class="section_footer">')
p = p[:a] + QUIZ + p[b:]
# le lien du pied de page n'est plus la page courante
p = p.replace("<a aria-current='page' class='link-footer-tiny w--current' href='/politique-de-confidentialite'>", "<a class='link-footer-tiny' href='/politique-de-confidentialite'>")
(OUT / f'{SLUG}.html').write_text(p)

# --- 2. Encart sur l'accueil, avant la FAQ
ENCART = (HERE / 'encart.html').read_text()
for page in ['index.html', 'formations-et-sensibilisations.html']:
    h = (SRC / page).read_text()
    # retire une version précédente de l'encart, puis l'insère en haut de la section FAQ
    h = re.sub(r'<section class="pl-encart-test".*?</div></section>', '', h, flags=re.S)
    i = h.index('<section class="section_faq"')
    j = h.index('>', i) + 1
    h = h[:j] + ENCART + h[j:]
    (OUT / page).write_text(h)

# --- 2b. Fichiers : illustration + bibliothèque PDF
import shutil as _sh
(OUT/'assets/site').mkdir(parents=True, exist_ok=True); (OUT/'assets/vendor').mkdir(parents=True, exist_ok=True)
for f in (HERE/'img').iterdir(): _sh.copyfile(f, OUT/'assets/site'/f.name)
for f in (HERE/'vendor').iterdir(): _sh.copyfile(f, OUT/'assets/vendor'/f.name)

# --- 3. Redirection .html + sitemap
t = (SRC / 'netlify.toml').read_text()
if SLUG not in t:
    t = t.replace('# Fichiers Webflow', f'[[redirects]]\n  from = "/{SLUG}.html"\n  to = "/{SLUG}"\n  status = 301\n  force = true\n\n# Fichiers Webflow', 1)
(OUT / 'netlify.toml').write_text(t)
s = (SRC / 'sitemap.xml').read_text()
if SLUG not in s:
    s = s.replace('</urlset>', f'  <url>\n    <loc>https://purplelab.fr/{SLUG}</loc>\n    <lastmod>2026-11-10</lastmod>\n    <changefreq>yearly</changefreq>\n    <priority>0.7</priority>\n  </url>\n</urlset>')
(OUT / 'sitemap.xml').write_text(s)
print('ok ->', OUT)
