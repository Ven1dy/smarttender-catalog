# -*- coding: utf-8 -*-
import json
from pathlib import Path

data = json.loads(
    Path(r"c:\Projects\фигня для смарттендер\web\data\catalog.min.json").read_text(
        encoding="utf-8"
    )
)
print("CATEGORIES:")
for c in data["categories"][:12]:
    print(f"  {c['code']}: {c['name']} — {c['hint']}")

print("\nGOST-like groups enriched:")
n = 0
for g in data["groups"]:
    if g.get("technical_name"):
        print(f"  {g['code']}: {g['name']}  <<  {g['technical_name']}")
        n += 1
        if n >= 20:
            break
print("enriched count", sum(1 for g in data["groups"] if g.get("technical_name")))
