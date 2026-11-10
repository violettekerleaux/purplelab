#!/usr/bin/env python3
"""Retire le bandeau cookies Finsweet et les scripts Google/Facebook d'exemple (codes jamais configurés) de toutes les pages."""
import pathlib, sys
site = pathlib.Path(sys.argv[1])
def cut(s, start, end, page, what):
    a = s.find(start)
    if a < 0: return s
    b = s.index(end, a) + len(end)
    print(f'  {page}: retiré {what} ({b-a} caractères)')
    return s[:a] + s[b:]
for f in sorted(site.glob('*.html')):
    s = f.read_text(); o = s
    s = cut(s, '<!-- Finsweet Cookie Consent -->', '<!-- End Facebook Pixel Code. The <noscript> tag has been removed -->', f.name, 'scripts cookies/Google/Facebook')
    s = cut(s, '<div class="tag-manager w-embed w-iframe">', '<!-- End Google Tag Manager (noscript) --></div>', f.name, 'Google Tag Manager noscript')
    s = cut(s, '<div fs-cc="banner"', '<div fs-cc="interaction" class="fs-cc-prefs_trigger"></div></div>', f.name, 'bandeau + fenêtre préférences')
    s = s.replace("<a class='link-footer-tiny' fs-cc='open-preferences' href='#' target='_blank'>Préférences cookies</a>", '')
    for bad in ['fs-cc', 'googletagmanager', 'fbevents', 'G-XXXXXXXXXX']:
        assert bad not in s, (f.name, bad)
    if s != o: f.write_text(s)
