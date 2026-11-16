# -*- coding: utf-8 -*-
import json
import re
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent
rep = json.loads((ROOT / "_name_near_dupes_active.json").read_text(encoding="utf-8"))
pairs = rep["similar_pairs"]
exact = rep["exact_duplicates"]
norm = rep["normalized_near"]
soft = rep["soft_near"]

SIZE = re.compile(r"^(xxxl|xxl|xl|xs|s|m|l)$", re.I)


def toks(s: str) -> list[str]:
    s = s.lower().replace("ё", "е")
    s = re.sub(r"[\s\-–—_/\\.,;:()\[\]{}«»\"'`°%№#+*=~]+", " ", s)
    return s.split()


def size_like(t: str) -> bool:
    return bool(SIZE.match(t)) or (t.isdigit() and len(t) <= 3)


def classify(a: str, b: str) -> str:
    ta, tb = toks(a), toks(b)
    sa, sb = set(ta), set(tb)
    only_a, only_b = sa - sb, sb - sa
    if only_a and only_b and all(size_like(x) for x in only_a | only_b):
        return "size_variant"
    if len(only_a) <= 1 and len(only_b) <= 1 and (only_a or only_b):
        return "one_token"
    r = SequenceMatcher(None, " ".join(ta), " ".join(tb)).ratio()
    if r >= 0.97 and len(only_a | only_b) <= 2:
        return "tiny_diff"
    if r >= 0.92:
        return "high_sim"
    return "other"


c = Counter()
buckets = {k: [] for k in ["size_variant", "one_token", "tiny_diff", "high_sim", "other"]}
for p in pairs:
    k = classify(p["a"]["name"], p["b"]["name"])
    c[k] += 1
    if len(buckets[k]) < 30:
        buckets[k].append(p)

print("pair classes", dict(c))
print("exact groups", len(exact), "items", sum(g["count"] for g in exact))
print("norm groups", len(norm))
print("soft groups", len(soft))

soft_cat = []
soft_suffix = []
soft_other = []
for g in soft:
    vs = g["variants"]
    if len(vs) == 2 and all("Категор" in v for v in vs):
        soft_cat.append(g)
    elif any(re.search(r"\d+-В\b", v) for v in vs):
        soft_suffix.append(g)
    else:
        soft_other.append(g)
print("soft category A/B", len(soft_cat))
print("soft suffix -V", len(soft_suffix))
print("soft other", len(soft_other))

print("\n=== EXACT all ===")
for g in exact:
    print(f"[{g['count']}] cat={g['items'][0]['category']} {g['name'][:100]}")
    print("   ", ", ".join(i["kmat"] for i in g["items"]))

print("\n=== NORM all ===")
for g in norm:
    print(f"[{g['count']}] {g['variants']}")
    print("   ", ", ".join(i["kmat"] for i in g["items"]))

print("\n=== SOFT other ===")
for g in soft_other:
    print(f"[{g['count']}] {g['variants'][:4]}")
    print("   ", ", ".join(i["kmat"] for i in g["items"]))

print("\n=== ONE_TOKEN sample ===")
for p in buckets["one_token"][:20]:
    print(f"r={p['ratio']} | {p['a']['name'][:80]}")
    print(f"          | {p['b']['name'][:80]}")

print("\n=== TINY_DIFF sample ===")
for p in buckets["tiny_diff"][:15]:
    print(f"r={p['ratio']} | {p['a']['name'][:80]}")
    print(f"          | {p['b']['name'][:80]}")

print("\n=== HIGH_SIM sample ===")
for p in buckets["high_sim"][:15]:
    print(f"r={p['ratio']} | {p['a']['name'][:80]}")
    print(f"          | {p['b']['name'][:80]}")

# compact classified export
out = {
    "summary": {
        **rep["summary"],
        "similar_pair_classes": dict(c),
        "note": "Більшість similar — size_variant (L/XL) або one_token (параметр). "
        "Для дублів дивись exact + norm + soft.",
        "exact_duplicate_groups": len(exact),
        "norm_encoding_groups": len(norm),
        "soft_category_AB": len(soft_cat),
        "soft_suffix_V": len(soft_suffix),
        "soft_other": len(soft_other),
    },
    "exact": [
        {
            "name": g["name"],
            "count": g["count"],
            "category": g["items"][0]["category"],
            "kmats": [i["kmat"] for i in g["items"]],
        }
        for g in exact
    ],
    "norm": [
        {
            "variants": g["variants"],
            "count": g["count"],
            "category": g["items"][0]["category"],
            "kmats": [i["kmat"] for i in g["items"]],
        }
        for g in norm
    ],
    "soft_other": [
        {
            "variants": g["variants"],
            "count": g["count"],
            "category": g["items"][0]["category"],
            "kmats": [i["kmat"] for i in g["items"]],
        }
        for g in soft_other
    ],
    "soft_suffix_V_sample": [
        {
            "variants": g["variants"],
            "kmats": [i["kmat"] for i in g["items"]],
        }
        for g in soft_suffix[:15]
    ],
    "one_token_sample": buckets["one_token"][:40],
    "tiny_diff_sample": buckets["tiny_diff"][:40],
    "high_sim_sample": buckets["high_sim"][:40],
}
(ROOT / "_name_near_dupes_compact.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8"
)
print("\nWrote _name_near_dupes_compact.json")
