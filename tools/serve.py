"""
Serveur local pour tester le quiz (utilisé par launch.bat).

Différences avec `python -m http.server` :
- désactive le cache du navigateur : après une modification, un simple F5 suffit ;
- force les bons types MIME pour .js, .svg et .json (sous Windows, le registre
  peut les déclarer de travers, ce qui empêche les modules JS ou les SVG de s'afficher).

Usage : python tools/serve.py [port]
"""

import http.server
import sys
from functools import partial
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".svg": "image/svg+xml",
        ".json": "application/json",
        ".css": "text/css",
        ".html": "text/html",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format, *args):
        pass  # console silencieuse


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    handler = partial(Handler, directory=str(ROOT))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"Quiz disponible sur http://localhost:{port}  (Ctrl+C pour arrêter)")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
