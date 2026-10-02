"""
Version Streamlit du quiz.

Le quiz est entièrement en HTML/CSS/JS (index.html, style.css, js/). Streamlit l'affiche
dans un cadre avec st.components.v1.html. Ce cadre ne peut pas charger de fichiers à côté
de lui : ce script assemble donc tout en une seule page (CSS, JS, données, galons SVG).

Le même code continue de fonctionner tel quel sur GitHub Pages.

Lancer en local :
    streamlit run streamlit_app.py
"""

import base64
import json
import re
import runpy
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

ROOT = Path(__file__).resolve().parent
HAUTEUR_CADRE = 860  # px ; le quiz défile à l'intérieur du cadre

st.set_page_config(page_title="Grades de la Marine", page_icon="⚓", layout="centered")


def _signature():
    """Change dès qu'un fichier source change : invalide le cache de construction."""
    fichiers = [ROOT / "index.html", ROOT / "style.css", ROOT / "data" / "grades.json",
                ROOT / "tools" / "generate_galons.py", *sorted((ROOT / "js").glob("*.js"))]
    return tuple((str(f), f.stat().st_mtime) for f in fichiers)


def _json_dans_script(obj):
    # Empêche une chaîne « </script> » de fermer la balise prématurément
    return json.dumps(obj, ensure_ascii=False).replace("</", "<\\/")


@st.cache_data(show_spinner=False)
def construire_page(sig):
    # 1. Galons à jour (le générateur n'a aucune dépendance)
    runpy.run_path(str(ROOT / "tools" / "generate_galons.py"), run_name="__main__")

    data = json.loads((ROOT / "data" / "grades.json").read_text(encoding="utf-8"))
    galons = {}
    for svg in sorted((ROOT / "galons").glob("*.svg")):
        b64 = base64.b64encode(svg.read_bytes()).decode("ascii")
        galons[svg.stem] = f"data:image/svg+xml;base64,{b64}"

    # 2. Un seul script : quiz.js sans ses `export`, puis main.js sans son `import`
    quiz = (ROOT / "js" / "quiz.js").read_text(encoding="utf-8")
    quiz = re.sub(r"^export\s+", "", quiz, flags=re.M)
    main = (ROOT / "js" / "main.js").read_text(encoding="utf-8")
    main = re.sub(r"^import\s*\{[\s\S]*?\}\s*from\s*\"\./quiz\.js[^\"]*\";[^\n]*\n", "", main, flags=re.M)
    script = f"{quiz}\n\n// ---- main.js ----\n\n{main}".replace("</script", "<\\/script")

    css = (ROOT / "style.css").read_text(encoding="utf-8")
    html = (ROOT / "index.html").read_text(encoding="utf-8")

    # 3. Remplacements dans index.html
    html, n_css = re.subn(r'<link rel="stylesheet" href="style\.css[^"]*">', lambda _: f"<style>\n{css}\n</style>", html)
    embarque = _json_dans_script({"data": data, "galons": galons})
    html, n_js = re.subn(
        r'<script type="module" src="js/main\.js[^"]*"></script>',
        lambda _: f"<script>window.__QUIZ_EMBARQUE__ = {embarque};</script>\n"
                  f'<script type="module">\n{script}\n</script>',
        html,
    )
    if n_css != 1 or n_js != 1:
        raise RuntimeError("index.html a changé : impossible d'y intégrer style.css ou js/main.js.")

    # Les galons cités en dur dans le HTML (image d'accueil, icône)
    html = re.sub(r'galons/([a-z0-9_]+)\.svg', lambda m: galons.get(m.group(1), m.group(0)), html)
    return html


# Mise en page Streamlit réduite au minimum : le quiz prend toute la place
st.markdown(
    """
    <style>
      .block-container { padding-top: 1rem; padding-bottom: 0; max-width: 700px; }
      header[data-testid="stHeader"] { background: transparent; }
      footer { visibility: hidden; }
    </style>
    """,
    unsafe_allow_html=True,
)

try:
    page = construire_page(_signature())
except Exception as e:  # message lisible plutôt qu'une trace brute
    st.error(f"Impossible de construire le quiz : {e}")
    st.stop()

components.html(page, height=HAUTEUR_CADRE, scrolling=True)
