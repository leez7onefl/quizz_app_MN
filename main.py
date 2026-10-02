"""
Lance le quiz en local : régénère les galons, démarre un serveur sans cache
et ouvre le navigateur.

Usage :
    python main.py            # port 8000 (ou le suivant libre)
    python main.py 8080       # port au choix

Ctrl+C (ou fermer la fenêtre) arrête le serveur.
Aucune dépendance : uniquement la bibliothèque standard de Python.
"""

import http.server
import runpy
import socket
import sys
import threading
import webbrowser
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent
GENERATEUR = ROOT / "tools" / "generate_galons.py"


class Handler(http.server.SimpleHTTPRequestHandler):
    """Sert le dossier du projet, sans cache et avec les bons types MIME."""

    # Sous Windows, le registre peut déclarer ces types de travers,
    # ce qui empêche les modules JS ou les SVG de s'afficher.
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".html": "text/html",
        ".css": "text/css",
        ".js": "text/javascript",
        ".json": "application/json",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        # Après une modification, un simple F5 recharge les nouveaux fichiers
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format, *args):
        pass  # console silencieuse


def port_libre(depart):
    """Renvoie le premier port libre à partir de `depart`."""
    for port in range(depart, depart + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex(("127.0.0.1", port)) != 0:
                return port
    raise SystemExit(f"Aucun port libre entre {depart} et {depart + 19}.")


def generer_galons():
    print("Génération des galons...")
    try:
        runpy.run_path(str(GENERATEUR), run_name="__main__")
    except SystemExit as e:
        if e.code not in (None, 0):
            raise SystemExit(f"Erreur pendant la génération des galons : {e.code}")


def main():
    generer_galons()

    port = port_libre(int(sys.argv[1]) if len(sys.argv) > 1 else 8000)
    url = f"http://localhost:{port}"
    handler = partial(Handler, directory=str(ROOT))

    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"\nQuiz disponible sur {url}")
        print("Ctrl+C pour arrêter le serveur.\n")
        threading.Timer(0.5, webbrowser.open, args=(url,)).start()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServeur arrêté.")


if __name__ == "__main__":
    main()
