"""
Génère les galons d'épaule (fourreaux) en SVG à partir de data/grades.json.

Usage (depuis la racine du projet) :
    python tools/generate_galons.py

Chaque grade décrit son galon dans grades.json :
    emblem   : "ancre_or" | "ancre_rouge" | "major"
    bandes   : liste de galons verticaux, de gauche à droite
               ("or", "argent", "or_large", "or_fin", "argent_fin", "aspirant")
    chevrons : {"nombre": n, "couleur": "or"|"rouge", "liseres": "bleu"|"pourpre"}
    etoiles  : nombre d'étoiles (officiers généraux)

Le script n'a besoin d'aucune dépendance externe.
"""

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "grades.json"
OUT = ROOT / "galons"

# Couleurs
NOIR = "#101218"
NOIR_REFLET = "#262a35"
OR = "#e8b02a"
OR_FONCE = "#b7841a"
ARGENT = "#dfe3ea"
ARGENT_FONCE = "#9aa1ad"
ROUGE = "#e3241b"
BLEU_ASPIRANT = "#3f7fe0"
LISERES = {"bleu": "#8ea6c8", "pourpre": "#c42a4a"}

# Géométrie du fourreau (vue horizontale, comme sur la planche officielle)
W, H = 300, 110
BOARD = "M8,16 L290,6 Q296,6 296,12 L296,98 Q296,104 290,104 L8,94 Q4,94 4,90 L4,20 Q4,16 8,16 Z"
TOP, BOTTOM = 6, 104          # étendue verticale utile (bord droit, le plus haut)
RIGHT_MARGIN = 272            # les galons s'arrêtent avant le bout du fourreau


def defs():
    return f"""
  <defs>
    <clipPath id="board"><path d="{BOARD}"/></clipPath>
    <linearGradient id="fond" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{NOIR_REFLET}"/>
      <stop offset="0.45" stop-color="{NOIR}"/>
      <stop offset="1" stop-color="#07080b"/>
    </linearGradient>
    <linearGradient id="or" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="{OR_FONCE}"/>
      <stop offset="0.5" stop-color="{OR}"/>
      <stop offset="1" stop-color="{OR_FONCE}"/>
    </linearGradient>
    <linearGradient id="argent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="{ARGENT_FONCE}"/>
      <stop offset="0.5" stop-color="{ARGENT}"/>
      <stop offset="1" stop-color="{ARGENT_FONCE}"/>
    </linearGradient>
  </defs>"""


def anchor(cx, cy, color, scale=1.0, rotate=0):
    """Ancre de marine centrée sur (cx, cy). rotate=-90 : couchée, anneau à gauche, comme sur les fourreaux."""
    s = scale
    return f"""
  <g transform="translate({cx},{cy}) rotate({rotate}) scale({s})" fill="none" stroke="{color}"
     stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="0" cy="-30" r="5.5"/>
    <line x1="-14" y1="-18" x2="14" y2="-18"/>
    <line x1="0" y1="-24" x2="0" y2="28"/>
    <path d="M-24,8 Q-21,28 0,29 Q21,28 24,8"/>
    <path d="M-29,13 L-24,6 L-18,12" />
    <path d="M29,13 L24,6 L18,12" />
  </g>"""


def emblem(kind):
    if kind == "ancre_or":
        return anchor(64, 55, OR, 1, -90)
    if kind == "ancre_rouge":
        return anchor(64, 55, ROUGE, 1, -90)
    if kind == "major":
        # Insigne de major : deux ancres croisées
        return anchor(64, 55, OR, 0.82, -120) + anchor(64, 55, OR, 0.82, -60)
    raise ValueError(f"Emblème inconnu : {kind}")


BANDES = {
    # nom : (largeur, remplissage)
    "or": (11, "url(#or)"),
    "argent": (11, "url(#argent)"),
    "or_large": (18, "url(#or)"),
    "or_fin": (5, "url(#or)"),
    "argent_fin": (5, "url(#argent)"),
    "aspirant": (11, "url(#or)"),
}
GAP = 6


def bandes(liste):
    widths = [BANDES[b][0] for b in liste]
    total = sum(widths) + GAP * (len(liste) - 1)
    x = RIGHT_MARGIN - total
    parts = []
    for b, w in zip(liste, widths):
        fill = BANDES[b][1]
        parts.append(f'<rect x="{x}" y="{TOP}" width="{w}" height="{BOTTOM - TOP}" fill="{fill}"/>')
        if b == "aspirant":
            # Galon d'aspirant : or interrompu de bleu
            for y in (22, 52, 82):
                parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="7" fill="{BLEU_ASPIRANT}"/>')
        x += w + GAP
    return '\n  <g clip-path="url(#board)">\n    ' + "\n    ".join(parts) + "\n  </g>"


def chevrons(spec):
    n = spec["nombre"]
    color = OR if spec["couleur"] == "or" else ROUGE
    depth, step, width = 30, 19, 11
    mid = (TOP + BOTTOM) / 2
    # Le dernier chevron touche presque le bout du fourreau
    x_last = 292 - depth - width / 2
    parts = []
    for i in range(n):
        x = x_last - (n - 1 - i) * step
        parts.append(
            f'<polyline points="{x + depth},{TOP - 8} {x},{mid} {x + depth},{BOTTOM + 8}" '
            f'fill="none" stroke="{color}" stroke-width="{width}" stroke-linejoin="miter"/>'
        )
    if spec.get("liseres"):
        c = LISERES[spec["liseres"]]
        x0 = x_last - (n - 1) * step + depth * 0.3
        for y in (TOP + 12, BOTTOM - 15):
            parts.append(f'<rect x="{x0}" y="{y}" width="{300 - x0}" height="3.5" fill="{c}"/>')
    return '\n  <g clip-path="url(#board)">\n    ' + "\n    ".join(parts) + "\n  </g>"


def star(cx, cy, r=13):
    pts = []
    for i in range(10):
        rad = r if i % 2 == 0 else r * 0.42
        a = -math.pi / 2 + i * math.pi / 5
        pts.append(f"{cx + rad * math.cos(a):.1f},{cy + rad * math.sin(a):.1f}")
    return f'<polygon points="{" ".join(pts)}" fill="url(#argent)" stroke="{ARGENT_FONCE}" stroke-width="0.6"/>'


STAR_LAYOUTS = {
    2: [(225, 36), (225, 74)],
    3: [(208, 38), (242, 38), (225, 74)],
    4: [(225, 28), (200, 55), (250, 55), (225, 82)],
    5: [(202, 32), (248, 32), (225, 55), (202, 78), (248, 78)],
}


def etoiles(n):
    return "\n  " + "\n  ".join(star(x, y) for x, y in STAR_LAYOUTS[n])


def galon_svg(grade):
    g = grade["galon"]
    body = f'\n  <path d="{BOARD}" fill="url(#fond)" stroke="#000" stroke-width="1"/>'
    if "bandes" in g:
        body += bandes(g["bandes"])
    if "chevrons" in g:
        body += chevrons(g["chevrons"])
    if "etoiles" in g:
        body += etoiles(g["etoiles"])
    body += emblem(g["emblem"])
    # Le titre aide l'accessibilité mais n'apparaît pas à l'écran (pas d'indice visuel)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" role="img" aria-label="Galon">'
        f"{defs()}{body}\n</svg>\n"
    )


def signature(grade):
    """Représentation canonique du galon, pour détecter deux grades identiques."""
    return json.dumps(grade["galon"], sort_keys=True)


def main():
    data = json.loads(DATA.read_text(encoding="utf-8"))
    grades = data["grades"]

    sigs = {}
    for g in grades:
        s = signature(g)
        if s in sigs:
            raise SystemExit(f"Galons identiques : {sigs[s]} et {g['id']}")
        sigs[s] = g["id"]

    OUT.mkdir(exist_ok=True)
    for g in grades:
        (OUT / f"{g['id']}.svg").write_text(galon_svg(g), encoding="utf-8")
    print(f"{len(grades)} galons générés dans {OUT}")


if __name__ == "__main__":
    main()
