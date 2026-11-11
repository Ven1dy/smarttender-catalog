# -*- coding: utf-8 -*-
"""Збирає один HTML з вбудованим gzip-каталогом — зручно надсилати поштою."""
from __future__ import annotations

import base64
import gzip
from pathlib import Path

ROOT = Path(r"c:\Projects\фигня для смарттендер")
WEB = ROOT / "web"
OUT = ROOT / "Каталог SmartTender.html"

JSON_PATH = WEB / "data" / "catalog.min.json"
GZ_PATH = WEB / "data" / "catalog.min.json.gz"

OLD_LOAD = """  async function loadData() {
    const res = await fetch("./data/catalog.min.json");
    if (!res.ok) throw new Error(`Не вдалося завантажити дані: ${res.status}`);
    state.data = await res.json();
    els.loader.classList.add("hidden");

    const m = state.data.meta;
    els.homeMeta.textContent = `${m.items.toLocaleString("uk-UA")} позицій · ${m.categories} категорій · ${m.groups} типів`;

    renderHome();
    showView("home");
  }"""

NEW_LOAD = """  async function decodeEmbeddedCatalog(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Потрібен сучасний браузер (Chrome, Edge, Firefox) для відкриття цього файлу.");
    }
    const ds = new DecompressionStream("gzip");
    const stream = new Blob([bytes]).stream().pipeThrough(ds);
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }

  async function loadData() {
    const embedded = document.getElementById("catalog-data");
    if (!embedded || !embedded.textContent.trim()) {
      throw new Error("У файлі немає вбудованих даних каталогу");
    }
    state.data = await decodeEmbeddedCatalog(embedded.textContent.trim());
    els.loader.classList.add("hidden");

    const m = state.data.meta;
    els.homeMeta.textContent = `${m.items.toLocaleString("uk-UA")} позицій · ${m.categories} категорій · ${m.groups} типів`;

    renderHome();
    showView("home");
  }"""


def main() -> None:
    html = (WEB / "index.html").read_text(encoding="utf-8")
    css = (WEB / "styles.css").read_text(encoding="utf-8")
    js = (WEB / "app.js").read_text(encoding="utf-8")

    if OLD_LOAD not in js:
        raise SystemExit("Не знайдено loadData() у app.js — оновіть шаблон заміни.")

    print("Gzip catalog...")
    raw = JSON_PATH.read_bytes()
    gz = gzip.compress(raw, compresslevel=9)
    GZ_PATH.write_bytes(gz)
    b64 = base64.b64encode(gz).decode("ascii")

    js = js.replace(OLD_LOAD, NEW_LOAD)

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
    size_mb = OUT.stat().st_size / (1024 * 1024)
    print(f"Wrote {OUT.name}: {size_mb:.2f} MB")
    print(f"  json={len(raw)/1024/1024:.2f} MB  gzip={len(gz)/1024/1024:.2f} MB  b64={len(b64)/1024/1024:.2f} MB")


if __name__ == "__main__":
    main()
