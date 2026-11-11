# -*- coding: utf-8 -*-
"""Сжимает Каталог.json в лёгкий набор для веб-просмотрщика."""
import gzip
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# Актуальне джерело: оновлений експорт (fallback — старий Каталог.json)
SRC = ROOT / "Каталог оновлен.json"
if not SRC.exists():
    SRC = ROOT / "Каталог.json"
OUT = ROOT / "web" / "data"

# Префикс KMAT/группы → понятный раздел каталога (не «семейство»).
CATEGORY_MAP = {
    "P1": {
        "name": "Упаковка под продукты",
        "hint": "Пакеты, плёнка, этикетки и ярлыки под хлеб, пряники, торты и т.п.",
    },
    "P0": {
        "name": "Ингредиенты и сырьё",
        "hint": "Сахар, смеси, улучшители, ароматизаторы, масла.",
    },
    "P2": {
        "name": "Плёнка, бумага, расходники упаковки",
        "hint": "Полимерные плёнки, пергамент, скотч, краски.",
    },
    "P3": {
        "name": "Гофротара и ящики",
        "hint": "Гофроящики, лотки, поддоны.",
    },
    "M1": {
        "name": "Чёрный металлопрокат",
        "hint": "Круг, труба, лист, уголок и пр. по ГОСТ/ДСТУ.",
    },
    "M2": {
        "name": "Нержавейка и спецстали",
        "hint": "AISI и спецстали: круг, труба, лист, сетка.",
    },
    "M3": {
        "name": "Цветные металлы",
        "hint": "Латунь, бронза, алюминий и изделия из них.",
    },
    "M4": {
        "name": "Сварочные материалы",
        "hint": "Электроды, проволока, припои.",
    },
    "M5": {
        "name": "Редукторы и насосы",
        "hint": "Мотор-редукторы, насосы, сервоприводы.",
    },
    "M6": {
        "name": "Подшипники и уплотнения",
        "hint": "Шарико-/роликоподшипники, манжеты, корпуса.",
    },
    "M7": {
        "name": "Электрика и IT",
        "hint": "Двигатели, выключатели, компьютеры, сеть.",
    },
    "M8": {
        "name": "Кабели и провода",
        "hint": "Кабель с медной/алюминиевой жилой, СИП.",
    },
    "M9": {
        "name": "Ленты, ремни и профили",
        "hint": "Тканевые/пластиковые ленты, клиновые и зубчатые профили.",
    },
    "M0": {
        "name": "Литейные сплавы",
        "hint": "Чугун, бронзы и заготовки.",
    },
    "MM": {
        "name": "Хозтовары и химия для уборки",
        "hint": "Моющие средства, губки, швабры, пакеты для мусора.",
    },
    "MD": {
        "name": "Техническая резина и пластики",
        "hint": "Пластины, капролон, паронит, фторопласт.",
    },
    "MF": {
        "name": "Краски, лаки, клеи",
        "hint": "Эмали, растворители, клеи.",
    },
    "MK": {
        "name": "Фитинги / отводы",
        "hint": "Отводы и соединительные элементы.",
    },
    "FU": {
        "name": "Масла и смазки",
        "hint": "Моторные, гидравлические, компрессорные масла, СОЖ.",
    },
    "R0": {
        "name": "Спецодежда и СИЗ",
        "hint": "Костюмы, халаты, перчатки, средства защиты.",
    },
    "BB": {
        "name": "Стройматериалы: камень",
        "hint": "Бутовый и бортовой камень.",
    },
    "BS": {
        "name": "Стройматериалы: щебень/песок",
        "hint": "Щебень, песок, смеси.",
    },
    "BK": {
        "name": "Стройматериалы: битум",
        "hint": "Битумные материалы.",
    },
    "TT": {
        "name": "Тестовые позиции",
        "hint": "Служебная/тестовая группа.",
    },
}

STOP_WORDS = {
    "для", "або", "или", "and", "the", "из", "на", "по", "под", "при",
    "доп", "дополнение", "нові", "новые", "фасети", "фасеты", "размер",
    "доп.размер", "этил", "этикетки", "етикеток", "вместо", "основной",
    "с", "і", "та", "и", "к", "в", "у", "от", "до", "без", "прочие",
    "прочее", "різні", "разные", "номерные", "обозначением",
}

GOST_RE = re.compile(r"(ГОСТ|ДСТУ|ТУ|ISO|EN|AISI|AWS)", re.I)


def category_of(code: str) -> dict:
    p2 = (code or "")[:2].upper()
    meta = CATEGORY_MAP.get(p2)
    if meta:
        return {"code": p2, "name": meta["name"], "hint": meta["hint"]}
    return {
        "code": p2 or "?",
        "name": f"Прочее ({p2 or '?'})",
        "hint": "Раздел по префиксу кода позиции.",
    }


def is_technical_name(name: str) -> bool:
    if not name:
        return True
    if GOST_RE.search(name):
        return True
    # почти только код/цифры
    letters = sum(ch.isalpha() for ch in name)
    return letters < 3


def meaningful_tokens(text: str):
    cleaned = re.sub(r"[()\[\]{},.;:/\\|+]+", " ", text or "")
    for raw in cleaned.split():
        w = raw.strip("-_").lower()
        if len(w) < 3 or w in STOP_WORDS:
            continue
        if w.isdigit():
            continue
        if GOST_RE.match(w):
            continue
        if sum(ch.isdigit() for ch in w) > 2:
            continue
        yield w


def guess_title_from_names(names: list[str], fallback: str) -> str:
    """Из названий позиций вытаскивает короткое человеческое имя группы."""
    first_words = Counter()
    bigrams = Counter()
    for name in names:
        toks = list(meaningful_tokens(name))
        if not toks:
            continue
        first_words[toks[0]] += 1
        if len(toks) >= 2:
            bigrams[(toks[0], toks[1])] += 1

    if not first_words:
        return fallback

    top_word, top_count = first_words.most_common(1)[0]
    # если биграмма заметно частотная — берём её
    if bigrams:
        (a, b), bc = bigrams.most_common(1)[0]
        if bc >= max(2, top_count * 0.45) and a == top_word:
            title = f"{a} {b}"
            return title[:1].upper() + title[1:]

    return top_word[:1].upper() + top_word[1:]


def _is_formula_name(value: str) -> bool:
    s = value.strip()
    return s.startswith("&") or "iif(" in s.lower() or "{" in s


def pick_item_name(ksm: dict) -> str:
    """Имя как в SmartTender (номенклатура), не реконструкция из фасетов.

    Приоритет: nmat → n_res → short → itemdescr → n_res_doc
    (n_res_doc часто устаревший/документный и может расходиться с кодом).
    """
    preferred = [
        ksm.get("nmat"),
        ksm.get("n_res"),
        ksm.get("naimkm_s"),
        ksm.get("itemdescr"),
        ksm.get("n_res_doc"),
    ]
    for c in preferred:
        if not c or not str(c).strip():
            continue
        s = str(c).strip()
        if _is_formula_name(s):
            continue
        return s
    for c in preferred:
        if c and str(c).strip():
            return str(c).strip()
    return ""


def family_of(kmat: str) -> str:
    return (kmat or "")[:5]


def link_ref(kmat: str, name: str, cancelled: bool | None = None) -> dict:
    ref = {"kmat": kmat, "name": name}
    if cancelled:
        ref["cancelled"] = True
    return ref


def is_junk_integration(code: str, group_items: list) -> bool:
    if not code or code in {"РП", "RP"}:
        return True
    fams = {family_of(x["kmat"]) for x in group_items}
    return len(fams) >= 8 or (len(group_items) >= 30 and len(fams) >= 4)


def enrich_item_links(slim_items: list[dict]) -> dict:
    """Зіставляє ksmo: n_res_doc → інша SKU, integrationCode → cancelled/active."""
    by_name: dict[str, list[dict]] = defaultdict(list)
    by_int: dict[str, list[dict]] = defaultdict(list)
    for it in slim_items:
        by_name[it["name"]].append(it)
        code = it.get("int_code")
        if code:
            by_int[code].append(it)

    junk_int = {code for code, group in by_int.items() if is_junk_integration(code, group)}
    doc_links = 0
    int_links = 0

    for it in slim_items:
        doc = (it.get("doc_name") or "").strip()
        related = []
        if doc and doc != it["name"]:
            cands = [x for x in by_name.get(doc, []) if x["kmat"] != it["kmat"]]
            if cands:
                fam = family_of(it["kmat"])
                cands.sort(
                    key=lambda x: (
                        0 if family_of(x["kmat"]) == fam else 1,
                        0 if x["kmat"][:2] == it["kmat"][:2] else 1,
                        0 if not x.get("cancelled") else 1,
                        x["kmat"],
                    )
                )
                best = cands[0]
                if family_of(best["kmat"]) == fam or best["kmat"][:2] == it["kmat"][:2]:
                    it["related_doc"] = link_ref(
                        best["kmat"], best["name"], bool(best.get("cancelled"))
                    )
                    doc_links += 1

        code = it.get("int_code")
        if code and code not in junk_int:
            siblings = [x for x in by_int.get(code, []) if x["kmat"] != it["kmat"]]
            fam = family_of(it["kmat"])
            same_fam = [x for x in siblings if family_of(x["kmat"]) == fam]
            pool = same_fam or [x for x in siblings if x["kmat"][:2] == it["kmat"][:2]]
            # спочатку активні замінники, потім cancelled «попередники»
            pool.sort(
                key=lambda x: (
                    0 if not x.get("cancelled") else 1,
                    x["kmat"],
                )
            )
            for sib in pool[:4]:
                related.append(
                    link_ref(sib["kmat"], sib["name"], bool(sib.get("cancelled")))
                )
            if related:
                it["related_int"] = related
                int_links += 1

        # прибрати службові поля що не потрібні в UI окремо якщо порожні
        if not it.get("doc_name") or it.get("doc_name") == it["name"]:
            it.pop("doc_name", None)
        if not it.get("int_code"):
            it.pop("int_code", None)
        if not it.get("cancelled"):
            it.pop("cancelled", None)

    return {"doc_links": doc_links, "int_links": int_links, "junk_int": len(junk_int)}


def build_ksmo_directory(slim_items: list[dict]) -> tuple[list[dict], dict]:
    """Довідник KSMO: один запис = один валідний integrationCode."""
    by_int: dict[str, list[dict]] = defaultdict(list)
    for it in slim_items:
        code = it.get("int_code")
        if code:
            by_int[code].append(it)

    junk_int = {code for code, group in by_int.items() if is_junk_integration(code, group)}
    entries: list[dict] = []

    for code, group in by_int.items():
        if code in junk_int:
            continue
        active = [x for x in group if not x.get("cancelled")]
        cancelled = [x for x in group if x.get("cancelled")]
        if active and cancelled:
            status = "mixed"
        elif active:
            status = "active"
        else:
            status = "cancelled"

        primary = sorted(
            active or group,
            key=lambda x: (x.get("name") or "", x["kmat"]),
        )[0]

        members = sorted(
            group,
            key=lambda x: (
                0 if not x.get("cancelled") else 1,
                x.get("name") or "",
                x["kmat"],
            ),
        )
        entries.append(
            {
                "code": code,
                "name": primary.get("name") or code,
                "status": status,
                "category": primary.get("category"),
                "category_name": primary.get("category_name"),
                "active_count": len(active),
                "cancelled_count": len(cancelled),
                "count": len(group),
                "items": [
                    {
                        "kmat": x["kmat"],
                        "name": x.get("name") or x["kmat"],
                        "cancelled": bool(x.get("cancelled")),
                        "group": x.get("group"),
                        "group_name": x.get("group_name"),
                    }
                    for x in members
                ],
            }
        )

    entries.sort(key=lambda e: (-e["count"], e.get("name") or "", e["code"]))
    stats = {
        "entries": len(entries),
        "junk_skipped": len(junk_int),
        "active": sum(1 for e in entries if e["status"] == "active"),
        "cancelled": sum(1 for e in entries if e["status"] == "cancelled"),
        "mixed": sum(1 for e in entries if e["status"] == "mixed"),
    }
    return entries, stats


def display_group_name(raw_name: str, sample_names: list[str]) -> tuple[str, str | None]:
    """
    Возвращает (понятное имя, исходное имя если оно техническое).
    """
    raw = (raw_name or "").strip()
    guessed = guess_title_from_names(sample_names, raw or "Без названия")

    if not raw:
        return guessed, None

    if is_technical_name(raw):
        # ГОСТ в подписи, человеческое имя сверху
        if guessed and guessed.lower() not in raw.lower():
            return guessed, raw
        return raw, None

    # обычное имя группы — оставляем, но если оно слишком общее и guess богаче
    return raw, None


# Поля позиції, які можуть бути null: у файлі не пишемо, сайт відновлює як null.
NULLABLE_ITEM_FIELDS = ("short", "gost", "descr", "unit")


def compact_payload(payload: dict) -> dict:
    """Прибирає дублікати перед записом (−30% розміру). Сайт відновлює їх у hydrate() в app.js.

    - позиція: category_name, group_name, group_raw — беруться з categories/groups;
      chars[].name — з facets; null-поля не пишуться; unit_code сайт не використовує.
    - KSMO: category_name — з categories; items — лише список kmat (решта — з позиції).
    """
    cat_names = {c["code"]: c["name"] for c in payload["categories"]}
    groups = {g["code"]: g for g in payload["groups"]}
    facet_names = {f["code"]: f["name"] for f in payload["facets"]}
    by_kmat = {it["kmat"]: it for it in payload["items"]}

    items = []
    for it in payload["items"]:
        g = groups[it["group"]]
        assert it["category_name"] == cat_names[it["category"]], it["kmat"]
        assert it["group_name"] == g["name"] and it["group_raw"] == g["raw_name"], it["kmat"]
        out = {}
        for key, value in it.items():
            if key in ("category_name", "group_name", "group_raw", "unit_code"):
                continue
            if key in NULLABLE_ITEM_FIELDS and value is None:
                continue
            if key == "chars":
                chars = []
                for c in value:
                    assert c["name"] == facet_names[c["code"]], (it["kmat"], c["code"])
                    chars.append({k: v for k, v in c.items() if k != "name"})
                value = chars
            out[key] = value
        items.append(out)

    ksmo_entries = []
    for e in payload["ksmo_entries"]:
        assert e.get("category_name") == cat_names.get(e.get("category")), e["code"]
        members = []
        for m in e["items"]:
            full = by_kmat[m["kmat"]]
            assert (
                m["name"] == full["name"]
                and m["cancelled"] == bool(full.get("cancelled"))
                and m["group"] == full["group"]
                and m["group_name"] == full["group_name"]
            ), (e["code"], m["kmat"])
            members.append(m["kmat"])
        out = {k: v for k, v in e.items() if k != "category_name"}
        out["items"] = members
        ksmo_entries.append(out)

    meta = dict(payload["meta"], compact=1)
    return {**payload, "meta": meta, "items": items, "ksmo_entries": ksmo_entries}


def main() -> None:
    # Консоль Windows (cp1251) падає на символах на кшталт «→» у логах
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    print("Loading source...")
    with SRC.open("r", encoding="utf-8") as f:
        raw = json.load(f)

    items_raw = raw["items"]
    OUT.mkdir(parents=True, exist_ok=True)

    # Сначала собираем имена позиций по группам для подписей
    names_by_group: dict[str, list[str]] = defaultdict(list)
    for it in items_raw:
        gcode = it["group"]["code"]
        ksm = it.get("ksm") or {}
        n = pick_item_name(ksm)
        if n and len(names_by_group[gcode]) < 80:
            names_by_group[gcode].append(n)

    groups: dict[str, dict] = {}
    facets: dict[str, dict] = {}
    category_counts: Counter = Counter()
    slim_items = []

    for it in items_raw:
        kmat = it["kmat"]
        group = it["group"]
        unit = it["unit"]
        ksm = it.get("ksm") or {}
        cat = category_of(kmat)
        category_counts[cat["code"]] += 1

        gcode = group["code"]
        if gcode not in groups:
            raw_name = group.get("name") or gcode
            title, technical = display_group_name(raw_name, names_by_group.get(gcode, []))
            groups[gcode] = {
                "code": gcode,
                "name": title,
                "raw_name": raw_name,
                "technical_name": technical,
                "category": cat["code"],
                "category_name": cat["name"],
                "count": 0,
                "facet_codes": set(),
                "sample_names": names_by_group.get(gcode, [])[:3],
            }
        groups[gcode]["count"] += 1

        chars = []
        for c in it.get("characteristics") or []:
            code = c["code"]
            name = c.get("name") or code
            value = c.get("value")
            value_code = c.get("value_code")
            chars.append(
                {
                    "code": code,
                    "name": name,
                    "value": value,
                    "value_code": value_code,
                    "position": c.get("position"),
                }
            )
            groups[gcode]["facet_codes"].add(code)
            if code not in facets:
                facets[code] = {
                    "code": code,
                    "name": name,
                    "values": {},
                    "uses": 0,
                    "groups": set(),
                    "kmats": set(),
                }
            facets[code]["uses"] += 1
            facets[code]["groups"].add(gcode)
            facets[code]["kmats"].add(kmat)
            facets[code]["name"] = name or facets[code]["name"]
            key = str(value_code) if value_code is not None else str(value)
            if key not in facets[code]["values"]:
                facets[code]["values"][key] = {
                    "value_code": value_code,
                    "value": value,
                    "count": 0,
                    "groups": set(),
                }
            facets[code]["values"][key]["count"] += 1
            facets[code]["values"][key]["groups"].add(gcode)

        item_name = pick_item_name(ksm) or kmat
        ksmo = it.get("ksmo") or {}
        doc_name = (
            ksmo.get("n_res_doc")
            or ksm.get("n_res_doc")
            or ""
        )
        doc_name = str(doc_name).strip() if doc_name else ""
        int_code = str(ksmo.get("integrationCode") or "").strip() or None
        slim_items.append(
            {
                "kmat": kmat,
                "name": item_name,
                "short": ksm.get("naimkm_s"),
                "gost": ksm.get("gost"),
                "descr": ksm.get("itemdescr")
                if ksm.get("itemdescr") and not str(ksm.get("itemdescr", "")).startswith("&")
                else None,
                "group": gcode,
                "group_name": groups[gcode]["name"],
                "group_raw": groups[gcode]["raw_name"],
                "category": cat["code"],
                "category_name": cat["name"],
                "unit": unit.get("name"),
                "unit_code": unit.get("code"),
                "chars": chars,
                "cancelled": bool(ksmo.get("cancelled")),
                "int_code": int_code,
                "doc_name": doc_name or None,
            }
        )

    link_stats = enrich_item_links(slim_items)
    print(
        f"KSMO links: doc→SKU {link_stats['doc_links']}, "
        f"int siblings {link_stats['int_links']}, "
        f"junk int codes {link_stats['junk_int']}"
    )

    ksmo_entries, ksmo_stats = build_ksmo_directory(slim_items)
    print(
        f"KSMO directory: {ksmo_stats['entries']} entries "
        f"(active {ksmo_stats['active']}, mixed {ksmo_stats['mixed']}, "
        f"cancelled {ksmo_stats['cancelled']}, junk skipped {ksmo_stats['junk_skipped']})"
    )

    # Категорії KSM (за кількістю позицій) і KSMO (за кількістю кодів 1С)
    ksmo_cat_counts: Counter = Counter()
    for e in ksmo_entries:
        if e.get("category"):
            ksmo_cat_counts[e["category"]] += 1

    categories = []
    for code, count in sorted(category_counts.items(), key=lambda x: (-x[1], x[0])):
        meta = category_of(code + "00")
        categories.append(
            {
                "code": code,
                "name": meta["name"],
                "hint": meta["hint"],
                "count": count,
                "ksmo_count": ksmo_cat_counts.get(code, 0),
            }
        )

    groups_out = []
    for g in sorted(groups.values(), key=lambda x: (-x["count"], x["code"])):
        groups_out.append(
            {
                "code": g["code"],
                "name": g["name"],
                "raw_name": g["raw_name"],
                "technical_name": g["technical_name"],
                "category": g["category"],
                "category_name": g["category_name"],
                "count": g["count"],
                "facet_codes": sorted(g["facet_codes"]),
                "sample_names": g["sample_names"],
            }
        )

    facets_out = []
    for f in sorted(facets.values(), key=lambda x: (-x["uses"], x["code"])):
        values = []
        for v in sorted(
            f["values"].values(),
            key=lambda v: (-v["count"], str(v["value"] or "")),
        ):
            values.append(
                {
                    "value_code": v["value_code"],
                    "value": v["value"],
                    "count": v["count"],
                    "groups": sorted(v["groups"]),
                }
            )
        group_codes = sorted(f["groups"])
        facets_out.append(
            {
                "code": f["code"],
                "name": f["name"],
                "uses": f["uses"],
                # До яких груп (сімейств SKU) прив’язаний фасет
                "groups": group_codes,
                "group_count": len(group_codes),
                # Скільки унікальних SKU мають цей фасет
                "sku_count": len(f["kmats"]),
                "values": values,
            }
        )

    meta = {
        "generated_at": (raw.get("meta") or {}).get("generated_at"),
        "source_stats": (raw.get("meta") or {}).get("stats"),
        "items": len(slim_items),
        "groups": len(groups_out),
        "facets": len(facets_out),
        "categories": len(categories),
        "conflicts": (raw.get("meta") or {}).get("conflicts") or [],
        "legend": {
            "category": "Крупный раздел по префиксу кода (P1, M6…). Это не поле SmartTender, а удобная навигация.",
            "group": "Номенклатурная группа SmartTender. Код группы — начало кода позиции (KMAT).",
            "kmat": "Полный код позиции = код группы + значения фасетов.",
            "facet": "Характеристика позиции (размер, материал, фасовка и т.д.).",
            "facet.groups": "Коды номенклатурных групп (семейств SKU), где встречается фасет.",
            "facet.sku_count": "Сколько уникальных SKU (kmat) содержат этот фасет.",
            "related_doc": "Позиция, чья текущая назва збігається з n_res_doc (документна/попередня назва).",
            "related_int": "Інші SKU з тим самим integrationCode у тій самій сімʼї коду.",
            "ksmo_entries": "Довідник KSMO: один запис = один integrationCode (код 1С) з членами KSM.",
            "ksmo.status": "active — є живі KSM; cancelled — усі скасовані; mixed — і ті й ті.",
        },
        "ksmo_links": link_stats,
        "ksmo_directory": ksmo_stats,
    }

    payload = {
        "meta": meta,
        "categories": categories,
        "groups": groups_out,
        "facets": facets_out,
        "items": slim_items,
        "ksmo_entries": ksmo_entries,
    }

    out_path = OUT / "catalog.min.json"
    print(f"Writing {out_path}...")
    raw = json.dumps(
        compact_payload(payload), ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")
    out_path.write_bytes(raw)

    gz_path = OUT / "catalog.min.json.gz"
    print(f"Writing {gz_path}...")
    with gzip.open(gz_path, "wb", compresslevel=9) as f:
        f.write(raw)

    size_mb = out_path.stat().st_size / (1024 * 1024)
    gz_mb = gz_path.stat().st_size / (1024 * 1024)
    print(
        f"Done: {len(slim_items)} items, {len(groups_out)} groups, "
        f"{len(facets_out)} facets, {len(ksmo_entries)} ksmo"
    )
    print(f"Size: {size_mb:.1f} MB  gzip: {gz_mb:.1f} MB")

    # быстрый sanity-check подписей
    print("\nSample enriched groups:")
    for g in groups_out[:12]:
        extra = f"  [{g['technical_name']}]" if g.get("technical_name") else ""
        print(f"  {g['code']}: {g['name']}{extra}")


if __name__ == "__main__":
    main()
