# -*- coding: utf-8 -*-
"""Знайти активні KSM з однаковими / майже однаковими назвами."""
import json
import re
import unicodedata
from collections import Counter, defaultdict
from difflib import SequenceMatcher
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "web" / "data" / "catalog.min.json"

PUNCT_RE = re.compile(r"[\s\-–—_/\\.,;:()\[\]{}«»\"'`°%№#+*=~]+")
CYR_MAP = str.maketrans(
    {"ё": "е", "Ё": "е", "і": "и", "ї": "и", "є": "е", "ґ": "г"}
)
DROP_UNITS = {
    "мм",
    "см",
    "м",
    "м2",
    "м3",
    "кг",
    "т",
    "шт",
    "л",
    "мл",
    "квт",
    "вт",
    "а",
    "в",
    "гост",
    "дсту",
    "ту",
    "iso",
    "din",
}


def normalize(s: str) -> str:
    s = (s or "").strip().lower().translate(CYR_MAP)
    s = unicodedata.normalize("NFKC", s)
    s = PUNCT_RE.sub(" ", s)
    return re.sub(r"\s+", " ", s).strip()


def soft_key(s: str) -> str:
    n = normalize(s)
    toks = [t for t in n.split() if t not in DROP_UNITS]
    return " ".join(toks)


def pack_group(items):
    return [
        {
            "kmat": x["kmat"],
            "name": x.get("name"),
            "group": x.get("group"),
            "category": x.get("category"),
            "unit": x.get("unit"),
            "short": x.get("short"),
        }
        for x in sorted(items, key=lambda z: z["kmat"])
    ]


def main():
    data = json.loads(SRC.read_text(encoding="utf-8"))
    items_all = data["items"]
    active = [x for x in items_all if not x.get("cancelled")]
    print(f"active={len(active)} total={len(items_all)}")

    by_exact: dict[str, list] = defaultdict(list)
    by_norm: dict[str, list] = defaultdict(list)
    by_soft: dict[str, list] = defaultdict(list)
    for it in active:
        name = (it.get("name") or "").strip()
        by_exact[name].append(it)
        by_norm[normalize(name)].append(it)
        by_soft[soft_key(name)].append(it)

    exact_groups = {k: v for k, v in by_exact.items() if k and len(v) > 1}
    norm_groups = {k: v for k, v in by_norm.items() if k and len(v) > 1}

    soft_groups = {}
    for k, v in by_soft.items():
        if not k or len(v) < 2 or len(k) < 8:
            continue
        norms = {normalize(x.get("name") or "") for x in v}
        if len(norms) >= 2:
            soft_groups[k] = v

    # Near-duplicates by block: category + first 3 tokens
    blocks: dict[tuple, list] = defaultdict(list)
    for it in active:
        n = normalize(it.get("name") or "")
        toks = n.split()
        if len(toks) < 2:
            continue
        blocks[(it.get("category") or "", " ".join(toks[:3]))].append(it)

    near_pairs = []
    seen_pair = set()
    for _key, group in blocks.items():
        if len(group) < 2 or len(group) > 80:
            continue
        for i, a in enumerate(group):
            na = normalize(a.get("name") or "")
            for b in group[i + 1 :]:
                nb = normalize(b.get("name") or "")
                if na == nb:
                    continue
                if abs(len(na) - len(nb)) > max(8, int(0.25 * max(len(na), len(nb)))):
                    continue
                ratio = SequenceMatcher(None, na, nb).ratio()
                if ratio < 0.88:
                    continue
                pair_key = tuple(sorted((a["kmat"], b["kmat"])))
                if pair_key in seen_pair:
                    continue
                seen_pair.add(pair_key)
                near_pairs.append(
                    {
                        "ratio": round(ratio, 3),
                        "category": a.get("category"),
                        "a": {
                            "kmat": a["kmat"],
                            "name": a.get("name"),
                            "group": a.get("group"),
                        },
                        "b": {
                            "kmat": b["kmat"],
                            "name": b.get("name"),
                            "group": b.get("group"),
                        },
                    }
                )
    near_pairs.sort(key=lambda x: (-x["ratio"], x["a"]["name"]))

    exact_list = sorted(
        [
            {"name": k, "count": len(v), "items": pack_group(v)}
            for k, v in exact_groups.items()
        ],
        key=lambda x: (-x["count"], x["name"]),
    )

    norm_list = []
    for k, v in norm_groups.items():
        raws = sorted({(x.get("name") or "").strip() for x in v})
        if len(raws) == 1:
            continue
        norm_list.append(
            {
                "norm": k,
                "count": len(v),
                "variants": raws,
                "items": pack_group(v),
            }
        )
    norm_list.sort(key=lambda x: (-x["count"], x["norm"]))

    soft_list = []
    for k, v in soft_groups.items():
        raws = sorted({(x.get("name") or "").strip() for x in v})
        soft_list.append(
            {
                "soft": k,
                "count": len(v),
                "variants": raws,
                "items": pack_group(v),
            }
        )
    soft_list.sort(key=lambda x: (-x["count"], x["soft"]))

    cat_counter = Counter()
    for g in exact_list:
        cat_counter[g["items"][0]["category"]] += g["count"]
    for g in norm_list:
        cat_counter[g["items"][0]["category"]] += g["count"]
    for p in near_pairs:
        cat_counter[p["category"]] += 2

    kmats = set()
    for g in exact_list:
        for it in g["items"]:
            kmats.add(it["kmat"])
    for g in norm_list:
        for it in g["items"]:
            kmats.add(it["kmat"])
    for g in soft_list:
        for it in g["items"]:
            kmats.add(it["kmat"])
    for p in near_pairs:
        kmats.add(p["a"]["kmat"])
        kmats.add(p["b"]["kmat"])

    report = {
        "summary": {
            "active": len(active),
            "exact_duplicate_groups": len(exact_list),
            "exact_duplicate_items": sum(g["count"] for g in exact_list),
            "norm_near_groups": len(norm_list),
            "norm_near_items": sum(g["count"] for g in norm_list),
            "soft_near_groups": len(soft_list),
            "soft_near_items": sum(g["count"] for g in soft_list),
            "high_similarity_pairs": len(near_pairs),
            "unique_items_involved": len(kmats),
            "criteria": {
                "exact": "однакова name серед active",
                "norm": "однакова після lower/пробіли/пунктуація/ё→е/укр→рос, різні raw",
                "soft": "як norm без одиниць (мм/кг/гост...), різні norm",
                "similar": "SequenceMatcher>=0.88, той самий category+перші 3 токени",
            },
        },
        "by_category_top": [
            {"code": c, "items_touched": n} for c, n in cat_counter.most_common(20)
        ],
        "exact_duplicates": exact_list,
        "normalized_near": norm_list,
        "soft_near": soft_list,
        "similar_pairs": near_pairs,
    }

    (ROOT / "_name_near_dupes_active.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8"
    )
    compact = {
        "summary": report["summary"],
        "by_category_top": report["by_category_top"],
        "exact_top": [
            {
                "name": g["name"],
                "count": g["count"],
                "kmats": [i["kmat"] for i in g["items"]],
                "category": g["items"][0]["category"],
            }
            for g in exact_list[:50]
        ],
        "norm_top": [
            {
                "variants": g["variants"],
                "count": g["count"],
                "kmats": [i["kmat"] for i in g["items"]],
                "category": g["items"][0]["category"],
            }
            for g in norm_list[:50]
        ],
        "soft_top": [
            {
                "variants": g["variants"][:8],
                "variant_count": len(g["variants"]),
                "count": g["count"],
                "kmats": [i["kmat"] for i in g["items"]][:15],
                "category": g["items"][0]["category"],
            }
            for g in soft_list[:50]
        ],
        "similar_top": near_pairs[:80],
    }
    (ROOT / "_name_near_dupes_compact.json").write_text(
        json.dumps(compact, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    s = report["summary"]
    print(json.dumps(s, ensure_ascii=False, indent=2))
    print("--- EXACT top 12 ---")
    for g in exact_list[:12]:
        print(
            f"  [{g['count']}] {g['name'][:110]} | "
            + ", ".join(i["kmat"] for i in g["items"])
        )
    print("--- NORM top 12 ---")
    for g in norm_list[:12]:
        print(f"  [{g['count']}] {g['variants']}")
    print("--- SOFT top 12 ---")
    for g in soft_list[:12]:
        print(f"  [{g['count']}] nvar={len(g['variants'])} | {g['variants'][:3]}")
    print("--- SIMILAR top 12 ---")
    for p in near_pairs[:12]:
        print(f"  r={p['ratio']} | {p['a']['name'][:75]}")
        print(f"           | {p['b']['name'][:75]}")


if __name__ == "__main__":
    main()
