# -*- coding: utf-8 -*-
import json
from collections import Counter, defaultdict
from pathlib import Path

data = json.loads(
    Path(r"c:\Projects\фигня для смарттендер\web\data\catalog.min.json").read_text(
        encoding="utf-8"
    )
)
items = data["items"]
groups = data["groups"]

gostish = sum(
    1
    for g in groups
    if any(x in g["name"] for x in ("ГОСТ", "ДСТУ", "ТУ ", "ТУ№", "ISO"))
)
print("groups", len(groups), "gost-like", gostish)
print("sample groups:")
for g in groups[:40]:
    print(f"  {g['code']}: {g['name']} ({g['count']})")

print("\nkmat startswith group:", sum(1 for i in items if i["kmat"].startswith(i["group"])), "/", len(items))
print("group code len", Counter(len(g["code"]) for g in groups))
print("group first2", Counter(g["code"][:2] for g in groups).most_common(20))
print("group first3", Counter(g["code"][:3] for g in groups).most_common(20))

# For each family, top group names
by_fam = defaultdict(list)
for g in groups:
    by_fam[g["family"]].append(g)

print("\n=== families via top groups ===")
for fam, glist in sorted(by_fam.items(), key=lambda x: -sum(g["count"] for g in x[1])):
    total = sum(g["count"] for g in glist)
    top = sorted(glist, key=lambda g: -g["count"])[:8]
    print(f"\n{fam} ({total} items, {len(glist)} groups)")
    for g in top:
        print(f"  {g['code']}: {g['name']} ({g['count']})")

# Better category: use dominant words from group names weighted by count
STOP = {
    "для", "або", "или", "and", "the", "с", "из", "на", "по", "доп", "дополнение",
    "номерные", "обозначением", "универсальные", "прочее", "размер", "доп.размер",
}


def tokens(name: str):
    cleaned = (
        name.replace("(", " ")
        .replace(")", " ")
        .replace(",", " ")
        .replace(".", " ")
        .replace("-", " ")
        .replace("/", " ")
    )
    for w in cleaned.split():
        wl = w.lower()
        if len(wl) < 3 or wl.isdigit() or wl in STOP:
            continue
        if any(ch.isdigit() for ch in wl) and len(wl) <= 4:
            continue
        if wl.startswith("гост") or wl.startswith("дсту"):
            continue
        yield wl


print("\n=== suggested category labels ===")
for fam, glist in sorted(by_fam.items(), key=lambda x: -sum(g["count"] for g in x[1])):
    words = Counter()
    for g in glist:
        for t in tokens(g["name"]):
            words[t] += g["count"]
    # also from item short names first word
    for i in items:
        if i["family"] != fam:
            continue
        first = (i["name"] or "").split()
        if first:
            w = first[0].lower().strip(",.;")
            if len(w) >= 3 and w not in STOP:
                words[w] += 1
    print(fam, "->", ", ".join(f"{w}({c})" for w, c in words.most_common(6)))
