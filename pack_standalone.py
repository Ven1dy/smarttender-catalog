# -*- coding: utf-8 -*-
"""Збирає один HTML з вбудованим gzip-каталогом — для пошти та GitHub Pages."""
from __future__ import annotations

import base64
import gzip
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"
OUT = ROOT / "Каталог SmartTender.html"
PAGES_OUT = WEB / "standalone.html"

JSON_PATH = WEB / "data" / "catalog.min.json"
GZ_PATH = WEB / "data" / "catalog.min.json.gz"


def main() -> None:
    html = (WEB / "index.html").read_text(encoding="utf-8-sig")
    css = (WEB / "styles.css").read_text(encoding="utf-8-sig")
    js = (WEB / "app.js").read_text(encoding="utf-8-sig")

    print("Gzip catalog...")
    raw = JSON_PATH.read_bytes()
    gz = gzip.compress(raw, compresslevel=9)
    GZ_PATH.write_bytes(gz)
    b64 = base64.b64encode(gz).decode("ascii")

    html = html.replace(
        '<link rel="stylesheet" href="styles.css" />',
        f"<style>\n{css}\n</style>",
    )
    html = html.replace(
        '<script src="app.js"></script>',
        (
            f'<script type="text/plain" id="catalog-data">\n{b64}\n</script>\n'
            f"<script>\n{js}\n</script>"
        ),
    )

    OUT.write_text(html, encoding="utf-8")
    PAGES_OUT.write_text(html, encoding="utf-8")
    size_mb = OUT.stat().st_size / (1024 * 1024)
    print(f"Wrote {OUT.name} and web/standalone.html: {size_mb:.2f} MB")
    print(
        f"  json={len(raw)/1024/1024:.2f} MB  "
        f"gzip={len(gz)/1024/1024:.2f} MB  "
        f"b64={len(b64)/1024/1024:.2f} MB"
    )


if __name__ == "__main__":
    main()
