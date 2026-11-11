# -*- coding: utf-8 -*-
import json
from collections import Counter, defaultdict

path = r"c:\Projects\фигня для смарттендер\Каталог.json"
print("Loading...")
with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

items = data["items"]
print("items:", len(items))
print("meta stats:", data["meta"]["stats"])
print("item keys:", list(items[0].keys()))

groups = Counter()
group_names = {}
for it in items:
    g = it["group"]["code"]
    groups[g] += 1
    group_names[g] = it["group"]["name"]

print("unique groups:", len(groups))
print("top 20 groups:")
for code, n in groups.most_common(20):
    print(f"  {code}: {n} — {group_names[code]}")

facets = Counter()
facet_names = {}
facet_values = defaultdict(set)
chars_per_item = []
for it in items:
    chars_per_item.append(len(it["characteristics"]))
    for c in it["characteristics"]:
        facets[c["code"]] += 1
        facet_names[c["code"]] = c["name"]
        facet_values[c["code"]].add((c.get("value_code"), c.get("value")))

print("unique facets:", len(facets))
print(
    "chars/item: min",
    min(chars_per_item),
    "max",
    max(chars_per_item),
    "avg",
    round(sum(chars_per_item) / len(chars_per_item), 1),
)
print("top 25 facets:")
for code, n in facets.most_common(25):
    print(f"  {code}: {n} uses, {len(facet_values[code])} values — {facet_names[code]}")

# Prefix families (first 2 letters of kmat / group)
prefixes = Counter(it["kmat"][:2] for it in items)
print("kmat prefixes:", prefixes.most_common(30))
