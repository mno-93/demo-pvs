"""Lässt die fotografierten Seiten wie Scans aussehen und schreibt sie in die Bildmodule der Demo.

Aufruf aus dem Repository-Wurzelverzeichnis, nach seite-fotografieren.mjs:
    python3 werkzeuge/scans/als-scan.py <vorbefund.png> <medikationsuebersicht.png>
Braucht Pillow. Feste Zufallszahlen: Gleiche Eingabe ergibt dasselbe Bild.
"""
import base64, io, re, random, sys
from PIL import Image, ImageFilter, ImageEnhance


def altern(roh, winkel, seed, breite, rand):
    random.seed(seed)
    im = Image.open(roh).convert('L')
    im = im.rotate(winkel, resample=Image.BICUBIC, expand=False, fillcolor=234)
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    im = ImageEnhance.Contrast(im).enhance(1.33)
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            px[x, y] = max(0, min(255, int(px[x, y] * 0.86 + 15 + random.gauss(0, 7))))
    rand(px, w, h)
    im = im.resize((breite, int(breite * h / w)), Image.LANCZOS)
    puffer = io.BytesIO()
    im.save(puffer, 'JPEG', quality=45, optimize=True)
    return im.size, puffer.getvalue()


def rand_links_oben(px, w, h):
    for y in range(h):
        for x in range(12):
            px[x, y] = int(px[x, y] * 0.55)
    for y in range(9):
        for x in range(w):
            px[x, y] = int(px[x, y] * 0.6)


def rand_rechts(px, w, h):
    for y in range(h):
        for x in range(w - 10, w):
            px[x, y] = int(px[x, y] * 0.55)


def eintragen(modul, groesse, jpeg):
    w, h = groesse
    s = open(modul).read()
    s = re.sub(r"jpegBase64:\n    '[A-Za-z0-9+/=]+'", f"jpegBase64:\n    '{base64.b64encode(jpeg).decode()}'", s)
    s = re.sub(r'breite: \d+', f'breite: {w}', s)
    s = re.sub(r'hoehe: \d+', f'hoehe: {h}', s)
    open(modul, 'w').write(s)
    print(modul, w, h)


vorbefund, uebersicht = sys.argv[1], sys.argv[2]
eintragen('packages/epa-sim/src/scanbild.ts', *altern(vorbefund, 0.9, 2019, 850, rand_links_oben))
eintragen('packages/pvs/src/daten/scanbild.ts', *altern(uebersicht, -0.7, 2026, 1000, rand_rechts))
