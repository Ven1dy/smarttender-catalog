# -*- coding: utf-8 -*-
"""Локальний сервер для перегляду каталогу."""
import webbrowser
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

ROOT = Path(__file__).resolve().parent / "web"
PORT = 8765


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)


def main() -> None:
    data = ROOT / "data" / "catalog.min.json"
    if not data.exists():
        raise SystemExit(
            "Немає web/data/catalog.min.json — спочатку запустіть build_web_data.py"
        )

    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}/"
    print(f"Каталог: {url}")
    print("Ctrl+C щоб зупинити")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped")


if __name__ == "__main__":
    main()
