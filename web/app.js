/* global fetch */
(() => {
  const state = {
    data: null,
    mode: "ksm", // ksm | ksmo
    view: "home", // home | groups | items
    category: null,
    group: null,
    selectedKsmo: null,
    query: "",
    groupFilter: "",
    categoryFilter: "",
    ksmoStatus: "",
    ksmoNameFilter: "",
    itemFilter: "",
    itemStatus: "",
    nameMatch: "", // "" | "ok" | "bad" — чи назва зібрана з фасетів
    sort: "name",
    facetFilters: {},
    showAllFacets: false,
    selectedKmat: null,
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    loader: $("loader"),
    search: $("search"),
    searchClear: $("search-clear"),
    stage: $("stage"),
    homeTitle: $("home-title"),
    homeMeta: $("home-meta"),
    categoryGrid: $("category-grid"),
    categoryFilter: $("category-filter"),
    viewHome: $("view-home"),
    viewGroups: $("view-groups"),
    viewItems: $("view-items"),
    groupsTitle: $("groups-title"),
    groupsCode: $("groups-code"),
    groupsCount: $("groups-count"),
    groupFilter: $("group-filter"),
    groupGrid: $("group-grid"),
    brandHome: $("brand-home"),
    backHome: $("back-to-home"),
    backGroups: $("back-to-groups"),
    crumbs: $("crumbs"),
    itemsTitle: $("items-title"),
    itemsCode: $("items-code"),
    itemsSub: $("items-sub"),
    sort: $("sort"),
    itemStatusSeg: $("item-status-seg"),
    itemMatchSeg: $("item-match-seg"),
    resultCount: $("result-count"),
    filters: $("filters"),
    facetFilters: $("facet-filters"),
    clearFacets: $("clear-facets"),
    rows: $("rows"),
    empty: $("empty"),
    detail: $("detail"),
    mainThead: $("main-thead"),
    ksmoPanelFilters: $("ksmo-panel-filters"),
    ksmoNameFilter: $("ksmo-name-filter"),
    itemFilter: $("item-filter"),
    itemFilterWrap: $("item-filter-wrap"),
    ksmoStatusSeg: $("ksmo-status-seg"),
    membersWrap: $("members-wrap"),
    membersTitle: $("members-title"),
    membersCount: $("members-count"),
    membersSub: $("members-sub"),
    memberStatusSeg: $("member-status-seg"),
    memberRows: $("member-rows"),
    membersEmpty: $("members-empty"),
    mainTableWrap: $("main-table-wrap"),
    membersTableWrap: $("members-table-wrap"),
  };

  // Таблиці KSM/KSMO: спочатку 50 рядків, далі +20 при прокрутці вниз
  const PAGE_INITIAL = 50;
  const PAGE_MORE = 20;
  const infinite = {
    main: { list: [], visible: 0, rowHtml: null, scroller: null, tbody: null },
    members: { list: [], visible: 0, rowHtml: null, scroller: null, tbody: null },
  };

  const fmt = (n) => Number(n || 0).toLocaleString("uk-UA");

  // Кружечок-бейдж у картці: код / кількість / фасети. data-tip — миттєва підказка (CSS).
  function chip(kind, text, tip) {
    const t = escapeHtml(tip);
    return `<span class="chip chip-${kind}" data-tip="${t}" aria-label="${t}">${escapeHtml(String(text))}</span>`;
  }

  // 1 позиція · 2 позиції · 5 позицій
  function plural(n, [one, few, many]) {
    const m10 = n % 10;
    const m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // «890 позицій» або «802 з 890», якщо діють фільтри
  function countLabel(shown, total, forms) {
    if (shown === total) return `${fmt(total)} ${plural(total, forms)}`;
    return `${fmt(shown)} з ${fmt(total)}`;
  }

  function setTitleCode(el, code) {
    if (!el) return;
    const value = (code || "").trim();
    if (!value) {
      el.textContent = "";
      el.removeAttribute("title");
      el.hidden = true;
      return;
    }
    el.textContent = value;
    el.title = value;
    el.hidden = false;
  }

  const FORMS_ITEMS = ["позиція", "позиції", "позицій"];
  const FORMS_TYPES = ["тип", "типи", "типів"];
  const FORMS_KSMO = ["код KSMO", "коди KSMO", "кодів KSMO"];

  function resetInfinite(key, list, rowHtml, scroller, tbody, ensureIdx = -1) {
    const slot = infinite[key];
    slot.list = list || [];
    slot.rowHtml = rowHtml;
    slot.scroller = scroller;
    slot.tbody = tbody;
    if (!rowHtml || !slot.list.length) {
      slot.visible = 0;
      if (tbody) tbody.innerHTML = "";
      if (scroller) scroller.scrollTop = 0;
      return;
    }
    let visible = Math.min(PAGE_INITIAL, slot.list.length);
    if (ensureIdx >= visible) visible = Math.min(slot.list.length, ensureIdx + 1);
    slot.visible = visible;
    if (scroller) scroller.scrollTop = 0;
    paintInfinite(key);
  }

  function paintInfinite(key) {
    const slot = infinite[key];
    if (!slot.tbody || !slot.rowHtml) return;
    slot.tbody.innerHTML = slot.list.slice(0, slot.visible).map(slot.rowHtml).join("");
    requestAnimationFrame(() => fillInfiniteIfNeeded(key));
  }

  function appendInfinite(key) {
    const slot = infinite[key];
    if (!slot.tbody || !slot.rowHtml || slot.visible >= slot.list.length) return false;
    const from = slot.visible;
    const to = Math.min(slot.list.length, slot.visible + PAGE_MORE);
    slot.tbody.insertAdjacentHTML("beforeend", slot.list.slice(from, to).map(slot.rowHtml).join(""));
    slot.visible = to;
    return true;
  }

  // Якщо 50 рядків не заповнюють висоту — догружаємо, щоб зʼявився скрол
  function fillInfiniteIfNeeded(key) {
    const slot = infinite[key];
    const scroller = slot.scroller;
    if (!scroller) return;
    let guard = 0;
    while (
      slot.visible < slot.list.length &&
      scroller.scrollHeight <= scroller.clientHeight + 4 &&
      guard++ < 200
    ) {
      if (!appendInfinite(key)) break;
    }
  }

  function bindInfiniteScroll(scroller, key) {
    if (!scroller || scroller.dataset.infiniteBound) return;
    scroller.dataset.infiniteBound = "1";
    scroller.addEventListener(
      "scroll",
      () => {
        if (scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight - 96) return;
        if (appendInfinite(key)) fillInfiniteIfNeeded(key);
      },
      { passive: true }
    );
  }

  // Перемикач статусу з кількістю: [{value, label, count}].
  // maxCount — найбільше можливе число в цьому контексті: під нього резервуємо ширину
  // лічильників, щоб перемикач (і поле фільтра поруч) не стрибали при зміні фільтрів.
  function renderSeg(el, options, current, maxCount) {
    if (!el) return;
    const digits = fmt(Math.max(maxCount || 0, ...options.map((o) => o.count || 0))).length;
    // 1.15ch на символ: цифри Manrope (8, 9) трохи ширші за «0», тож запас, щоб ширина була сталою
    el.style.setProperty("--seg-count-w", `${(digits * 1.15).toFixed(2)}ch`);
    el.innerHTML = options
      .map((o) => {
        const on = o.value === current;
        const empty = !on && o.value !== "" && !o.count;
        return `<button type="button" class="seg-btn${on ? " is-on" : ""}${o.tone ? ` tone-${o.tone}` : ""}" data-status="${escapeHtml(o.value)}" aria-pressed="${on}"${empty ? " disabled" : ""}>
          ${escapeHtml(o.label)} <span class="seg-count">${fmt(o.count)}</span>
        </button>`;
      })
      .join("");
  }

  function theadKsm(showGroup) {
    return `
    <tr>
      <th class="col-status">Статус</th>
      <th>Що це</th>
      ${showGroup ? "<th>Тип / група</th>" : ""}
      <th class="col-match" title="Чи складена назва зі значень фасетів">Збіг</th>
      <th class="col-int">Код 1С</th>
      <th class="codes-only">Код позиції</th>
      <th>Од.</th>
      <th title="Кількість фасетів у позиції">Фас.</th>
    </tr>`;
  }

  const THEAD_KSMO = `
    <tr>
      <th class="col-status">Статус</th>
      <th>KSMO / найменування</th>
      <th class="col-int">Код інтеграції</th>
      <th class="col-count">KSM</th>
    </tr>`;

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const copyBtn = (value) => {
    const text = String(value ?? "");
    if (!text) return "";
    return `<button type="button" class="copy-btn" data-copy="${escapeHtml(text)}" title="Копіювати" aria-label="Копіювати">
      <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M5.5 2A1.5 1.5 0 0 0 4 3.5V4h-.5A1.5 1.5 0 0 0 2 5.5v7A1.5 1.5 0 0 0 3.5 14h6a1.5 1.5 0 0 0 1.5-1.5V12h.5a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 12 2H5.5zm5 9H11v.5a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5H5v.5A1.5 1.5 0 0 0 6.5 6h5A1.5 1.5 0 0 0 13 4.5V4h.5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-.5zM6.5 3h5a.5.5 0 0 1 .5.5V4H6v-.5a.5.5 0 0 1 .5-.5z"/></svg>
      <svg class="copy-check" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><path fill="currentColor" d="M6.7 11.3 3.4 8l1.2-1.2 2.1 2.1 4.7-4.7L12.6 5.4z"/></svg>
    </button>`;
  };

  const codeWithCopy = (code) => {
    const text = String(code ?? "");
    if (!text) return "";
    return `<span class="detail-code-chip">
      <span class="detail-code-text mono">${escapeHtml(text)}</span>
      ${copyBtn(text)}
    </span>`;
  };

  async function copyToClipboard(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    if (!btn) return;
    btn.classList.add("is-copied");
    btn.title = "Скопійовано";
    btn.setAttribute("aria-label", "Скопійовано");
    clearTimeout(btn._copyTimer);
    btn._copyTimer = setTimeout(() => {
      btn.classList.remove("is-copied");
      btn.title = "Копіювати";
      btn.setAttribute("aria-label", "Копіювати");
    }, 1400);
  }

  const normalize = (value) =>
    String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  // \u0424\u0456\u043b\u044c\u0442\u0440 \u0431\u043b\u043e\u043a\u0456\u0432: \u043a\u0456\u043b\u044c\u043a\u0430 \u0441\u043b\u0456\u0432 \u0447\u0435\u0440\u0435\u0437 \u043f\u0440\u043e\u0431\u0456\u043b \u2014 \u043c\u0430\u044e\u0442\u044c \u0437\u043d\u0430\u0439\u0442\u0438\u0441\u044f \u0432\u0441\u0456 (\u0443 \u043d\u0430\u0437\u0432\u0456 \u0430\u0431\u043e \u043a\u043e\u0434\u0456)
  const filterTokens = (value) => normalize(value).split(/\s+/).filter(Boolean);
  const matchesTokens = (hay, tokens) => {
    if (!tokens.length) return true;
    const h = normalize(hay);
    return tokens.every((t) => h.includes(t));
  };

  const STATUS_LABEL = {
    active: "активна",
    cancelled: "скасована",
    mixed: "змішана",
  };

  function statusPill(status, cancelled) {
    if (cancelled === true) status = "cancelled";
    if (cancelled === false && !status) status = "active";
    if (!status) return "";
    const cls =
      status === "cancelled" ? "pill-warn" : status === "mixed" ? "pill-neutral" : "pill-ok";
    return `<span class="pill pill-status ${cls}">${STATUS_LABEL[status] || status}</span>`;
  }

  // Індекси «код → запис»: будуються один раз у hydrate(), пошук O(1) замість перебору
  const idx = { categories: new Map(), groups: new Map(), ksmo: new Map(), items: new Map() };

  function categoryByCode(code) {
    return idx.categories.get(code) || null;
  }
  function groupByCode(code) {
    return idx.groups.get(code) || null;
  }
  function ksmoByCode(code) {
    return idx.ksmo.get(code) || null;
  }
  function itemByKmat(kmat) {
    return idx.items.get(kmat) || null;
  }

  // Порівняння рядків українською: один спільний Intl.Collator — швидше, ніж створювати порівняння щоразу
  const ukCompare = new Intl.Collator("uk").compare;

  // build_web_data.py прибирає дублікати з файлу (meta.compact) — тут відновлюємо повну структуру
  function hydrate(data) {
    const facetNames = new Map(data.facets.map((f) => [f.code, f.name]));
    for (const c of data.categories) idx.categories.set(c.code, c);
    for (const g of data.groups) idx.groups.set(g.code, g);
    for (const it of data.items) idx.items.set(it.kmat, it);
    for (const e of data.ksmo_entries || []) idx.ksmo.set(e.code, e);
    if (!data.meta?.compact) return data;

    for (const it of data.items) {
      const g = idx.groups.get(it.group);
      it.category_name = idx.categories.get(it.category)?.name ?? null;
      it.group_name = g?.name ?? null;
      it.group_raw = g?.raw_name ?? null;
      for (const key of ["short", "gost", "descr", "unit"]) {
        if (!(key in it)) it[key] = null;
      }
      for (const c of it.chars) c.name = facetNames.get(c.code) ?? c.code;
    }
    for (const e of data.ksmo_entries || []) {
      e.category_name = idx.categories.get(e.category)?.name ?? null;
      e.items = e.items.map((kmat) => {
        const it = idx.items.get(kmat);
        return {
          kmat,
          name: it?.name ?? kmat,
          cancelled: !!it?.cancelled,
          group: it?.group ?? null,
          group_name: it?.group_name ?? null,
        };
      });
    }
    return data;
  }

  function updateModeButtons() {
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      const on = btn.dataset.mode === state.mode;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.body.classList.toggle("mode-ksmo", state.mode === "ksmo");
  }

  function setLoaderStatus(title, detail) {
    const strong = els.loader.querySelector("strong");
    const p = els.loader.querySelector("p");
    if (strong) strong.textContent = title;
    if (p) p.textContent = detail;
  }

  async function decompressGzip(bytes) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error("Потрібен сучасний браузер (Chrome, Edge, Firefox)");
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(stream).text();
  }

  async function loadEmbeddedCatalog() {
    const embedded = document.getElementById("catalog-data");
    const b64 = embedded?.textContent?.trim();
    if (!b64) return null;
    setLoaderStatus("Розпаковую каталог…", "Дані вже в сторінці — майже готово");
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const text = await decompressGzip(bytes);
    return JSON.parse(text);
  }

  async function loadCatalogJson() {
    // 1) Embedded (GitHub Pages standalone) — no extra network request
    const embedded = await loadEmbeddedCatalog();
    if (embedded) return embedded;

    // 2) gzip (~1.5 MB), then raw JSON fallback for local serve.py
    setLoaderStatus("Завантажую каталог…", "Тягну стиснуті дані (~1.5 МБ)");
    const gzRes = await fetch("./data/catalog.min.json.gz", { cache: "no-cache" });
    if (gzRes.ok) {
      const bytes = await gzRes.arrayBuffer();
      setLoaderStatus("Розпаковую каталог…", "Готую зрозумілий вигляд для 18 тисяч позицій");
      const text = await decompressGzip(bytes);
      setLoaderStatus("Читаю каталог…", "Майже готово");
      return JSON.parse(text);
    }
    setLoaderStatus("Завантажую каталог…", "Запасний варіант без стиснення (повільніше)");
    const res = await fetch("./data/catalog.min.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`Не вдалося завантажити дані: ${res.status}`);
    return res.json();
  }

  async function loadData() {
    state.data = hydrate(await loadCatalogJson());
    els.loader.classList.add("hidden");
    applyRoute(true); // відкрити те, що в адресі (або головну)
  }

  function renderHome() {
    const isKsmo = state.mode === "ksmo";
    const ksmoTotal = (state.data.ksmo_entries || []).length;
    const m = state.data.meta;

    els.homeTitle.textContent = isKsmo ? "Оберіть категорію KSMO" : "Оберіть категорію";
    els.homeMeta.textContent = isKsmo
      ? `${m.categories} категорій · ${fmt(ksmoTotal)} кодів 1С`
      : `${m.categories} категорій · ${m.groups} типів · ${fmt(m.items)} позицій`;

    const tokens = filterTokens(state.categoryFilter);
    const available = state.data.categories.filter((c) => !isKsmo || c.ksmo_count);
    const shown = available.filter((c) => matchesTokens([c.code, c.name].join(" "), tokens));
    if (tokens.length) {
      els.homeMeta.textContent = `${shown.length} з ${available.length} ${plural(available.length, ["категорії", "категорій", "категорій"])}`;
    }

    els.categoryGrid.innerHTML = shown
      .map((c) => {
        const count = isKsmo ? c.ksmo_count || 0 : c.count;
        return `
          <button type="button" class="cat-card" data-category="${escapeHtml(c.code)}">
            <div class="card-top">
              ${chip("code", c.code, "Код категорії")}
              <div class="card-title">${escapeHtml(c.name)}</div>
              <div class="card-badges">
                ${chip("count", fmt(count), isKsmo
                  ? `${fmt(count)} ${plural(count, ["код 1С", "коди 1С", "кодів 1С"])} у категорії`
                  : `${fmt(count)} ${plural(count, ["позиція", "позиції", "позицій"])} у категорії`)}
              </div>
            </div>
            <div class="card-hint">${escapeHtml(c.hint || "")}</div>
          </button>
        `;
      })
      .join("");
    if (!shown.length) {
      els.categoryGrid.innerHTML = `<div class="empty">Немає категорій за цим фільтром</div>`;
    }
  }

  const ksmoHayCache = new WeakMap();
  // opts.ignoreStatus — для лічильників у перемикачі статусу; opts.ignoreText — для «N з M»
  function filteredKsmoEntries(opts = {}) {
    const q = opts.ignoreText ? "" : normalize(state.ksmoNameFilter || state.groupFilter || state.query);
    return (state.data.ksmo_entries || []).filter((e) => {
      if (state.category && e.category !== state.category) return false;
      if (!opts.ignoreStatus && state.ksmoStatus && e.status !== state.ksmoStatus) return false;
      if (!q) return true;
      // лише назва / код KSMO зліва — без пошуку по підвʼязаних KSM
      let hay = ksmoHayCache.get(e);
      if (hay === undefined) {
        hay = normalize([e.code, e.name].join(" "));
        ksmoHayCache.set(e, hay);
      }
      return queryTokens(q).every((t) => hay.includes(t));
    });
  }

  function sortedKsmoEntries(entries) {
    const list = entries.slice();
    if (state.sort === "kmat") {
      return list.sort((a, b) => ukCompare(a.code, b.code));
    }
    if (state.sort === "group") {
      return list.sort(
        (a, b) => b.count - a.count || ukCompare(a.name, b.name)
      );
    }
    return list.sort((a, b) => ukCompare(a.name, b.name));
  }

  function ksmoMemberItems(entry) {
    if (!entry?.items?.length) return [];
    return entry.items
      .map((m) => {
        const full = itemByKmat(m.kmat);
        return {
          kmat: m.kmat,
          name: full?.name || m.name,
          cancelled: !!m.cancelled,
          group: full?.group || m.group,
          group_name: full?.group_name || m.group_name || "—",
          unit: full?.unit || "—",
          charsLen: full?.chars?.length ?? 0,
        };
      })
      .filter((m) => {
        if (state.itemStatus === "cancelled") return m.cancelled;
        if (state.itemStatus === "active") return !m.cancelled;
        return true;
      })
      .sort((a, b) => {
        if (state.sort === "kmat") return ukCompare(a.kmat, b.kmat);
        if (state.sort === "group") {
          return (
            ukCompare(a.group_name, b.group_name) ||
            ukCompare(a.name, b.name)
          );
        }
        return ukCompare(a.name, b.name);
      });
  }

  function setItemsLayout(isKsmo) {
    if (els.mainThead) {
      els.mainThead.innerHTML = isKsmo ? THEAD_KSMO : theadKsm(!state.group);
    }
    if (els.ksmoPanelFilters) els.ksmoPanelFilters.hidden = !isKsmo;
    if (els.membersWrap) els.membersWrap.hidden = !isKsmo;
    if (els.detail) els.detail.hidden = isKsmo;
    if (els.itemStatusSeg) els.itemStatusSeg.hidden = isKsmo;
    if (els.itemMatchSeg) els.itemMatchSeg.hidden = isKsmo;
    if (els.ksmoStatusSeg) els.ksmoStatusSeg.hidden = !isKsmo;
    if (els.itemFilterWrap) els.itemFilterWrap.hidden = isKsmo;
  }

  function renderKsmoMembers(entry) {
    if (!els.memberRows) return;
    if (!entry) {
      resetInfinite("members", [], null, els.membersTableWrap, els.memberRows);
      els.memberRows.innerHTML = "";
      els.membersTitle.textContent = "Оберіть KSMO зліва";
      els.membersCount.textContent = "";
      els.membersSub.textContent = "";
      if (els.memberStatusSeg) els.memberStatusSeg.innerHTML = "";
      if (els.membersEmpty) {
        els.membersEmpty.hidden = false;
        els.membersEmpty.textContent =
          "Оберіть KSMO зліва — тут зʼявляться підвʼязані найменування KSM.";
      }
      return;
    }
    const all = entry.items || [];
    const activeCount = all.filter((m) => !m.cancelled).length;
    const members = ksmoMemberItems(entry);
    els.membersTitle.textContent = entry.name;
    els.membersTitle.title = entry.name;
    els.membersSub.textContent = `Код 1С ${entry.code}`;
    els.membersCount.textContent = countLabel(members.length, all.length, ["KSM", "KSM", "KSM"]);
    renderSeg(
      els.memberStatusSeg,
      [
        { value: "", label: "Усі", count: all.length },
        { value: "active", label: "Активні", count: activeCount, tone: "ok" },
        { value: "cancelled", label: "Скасовані", count: all.length - activeCount, tone: "warn" },
      ],
      state.itemStatus
    );
    if (els.membersEmpty) {
      els.membersEmpty.hidden = members.length > 0;
      els.membersEmpty.textContent = "У цього KSMO немає підвʼязаних KSM.";
    }
    const ensureIdx = state.selectedKmat
      ? members.findIndex((m) => m.kmat === state.selectedKmat)
      : -1;
    resetInfinite(
      "members",
      members,
      (m) => {
        const active = m.kmat === state.selectedKmat ? "active" : "";
        return `
          <tr class="${active}${m.cancelled ? " is-cancelled" : ""}" data-kmat="${escapeHtml(m.kmat)}">
            <td class="col-status">${statusPill(null, !!m.cancelled)}</td>
            <td>
              <div class="name-cell">${escapeHtml(m.name)}</div>
            </td>
            <td>
              <div class="name-cell" style="font-weight:600">${escapeHtml(m.group_name)}</div>
              <div class="sub codes-only mono">${escapeHtml(m.group || "")}</div>
            </td>
            <td>${escapeHtml(m.unit || "—")}</td>
            <td><span class="badge">${m.charsLen}</span></td>
            <td class="mono codes-only">${escapeHtml(m.kmat)}</td>
            <td class="col-go">
              <button type="button" class="go-ksm-btn" data-open-in-ksm="${escapeHtml(m.kmat)}" title="Відкрити цю позицію в каталозі KSM" aria-label="Відкрити в каталозі KSM">→</button>
            </td>
          </tr>`;
      },
      els.membersTableWrap,
      els.memberRows,
      ensureIdx
    );
  }

  function renderGroups() {
    const cat = categoryByCode(state.category);
    els.groupFilter.placeholder = "Фільтр типів…";
    els.groupsTitle.textContent = cat ? cat.name : "Типи";
    setTitleCode(els.groupsCode, cat?.code);

    const tokens = filterTokens(state.groupFilter);
    const inCategory = state.data.groups.filter(
      (g) => !state.category || g.category === state.category
    );
    const groups = inCategory.filter((g) =>
      matchesTokens([g.code, g.name, g.raw_name, g.technical_name].join(" "), tokens)
    );
    els.groupsCount.textContent = countLabel(groups.length, inCategory.length, FORMS_TYPES);

    const card = (g) => `
          <button type="button" class="group-card" data-group="${escapeHtml(g.code)}">
            <div class="card-top">
              ${chip("code", g.code, "Код типу")}
              <div class="card-title">${escapeHtml(g.name)}</div>
              <div class="card-badges">
                ${chip("count", fmt(g.count), `${fmt(g.count)} ${plural(g.count, ["позиція", "позиції", "позицій"])} цього типу`)}
                ${chip("props", g.facet_codes.length, `${g.facet_codes.length} ${plural(g.facet_codes.length, ["фасет", "фасети", "фасетів"])} для уточнення`)}
              </div>
            </div>
          </button>
        `;

    // розбиваємо типи на смислові блоки (правила — у SECTION_RULES нижче)
    const sections = state.category && inCategory.length >= SECTION_MIN_TYPES
      ? groupSections(state.category, inCategory)
      : [];
    if (sections.length > 1) {
      els.groupGrid.innerHTML = sections
        .map((s) => {
          const list = s.groups.filter((g) => groups.includes(g));
          if (!list.length) return "";
          const items = list.reduce((sum, g) => sum + g.count, 0);
          return `
          <section class="group-section">
            <div class="group-section-head">
              <h3>${escapeHtml(s.title)}</h3>
              <span class="group-section-meta">${list.length} ${plural(list.length, ["тип", "типи", "типів"])} · ${fmt(items)} ${plural(items, ["позиція", "позиції", "позицій"])}</span>
              <span class="group-section-codes">${s.prefixes.map(escapeHtml).join(" · ")}</span>
            </div>
            <div class="card-grid group-section-grid">${list.map(card).join("")}</div>
          </section>`;
        })
        .join("");
    } else {
      els.groupGrid.innerHTML = groups.map(card).join("");
    }

    if (!groups.length) {
      els.groupGrid.innerHTML = `<div class="empty">Немає типів за цим фільтром</div>`;
    }
  }

  // Блоки типів усередині категорії. Правило: [назва блоку, префікси коду типу, регулярка
  // за назвою типу]. Тип іде в перший блок, чиє правило підходить; решта → «Інше».
  // Префікс коду (P11… ярлики, P12… етикетки, FU42… оливи) — основа; регулярка
  // потрібна там, де під одним префіксом лежать різні речі (M75 — уся IT-техніка).
  // Щоб розбити ще одну категорію — додайте її правила сюди.
  const SECTION_MIN_TYPES = 12;
  const SECTION_RULES = {
    P1: [
      ["Етикетки самоклейні", ["P12", "P13"]],
      ["Пакети та плівка", ["P17"]],
      ["Ярлики", ["P11"]],
      ["Коробки та шоубокси", ["P14", "P15"]],
      ["Стрічки, корекс, підложки", ["P16", "P19", "P1C"]],
    ],
    P0: [
      ["Борошно, жири, молочне, яйця", ["P01"]],
      ["Горіхи, насіння, фрукти, овочі", ["P02"],
        /^(арахис|абрикос|фундук|вишн|картопл|грецк|виноград|яблок|цибул|журавлин|миндал|смородин|банан|груш|морк|томат|кешью|апельсин|лимон|малин|черник|капуст|часник|соки|семена)/i],
      ["Суміші, начинки, декор", ["P02"]],
      ["Цукор і харчові добавки", ["P03"]],
      ["Зернопродукти, сіль, інше", ["P09"]],
    ],
    M1: [
      ["Круг, квадрат, шестигранник, дріт", ["M10"]],
      ["Лист і рулон", ["M13"]],
      ["Сітка, рельси, профілі, інше", ["M14"]],
      ["Кутник, швелер, балка, профнастил", ["M12"]],
      ["Труби", ["M11"]],
    ],
    M2: [
      ["Круг, квадрат, шестигранник, дріт", ["M20"]],
      ["Лист і рулон", ["M23"]],
      ["Труби", ["M21"]],
      ["Сітка, перфолист, кутник", ["M22", "M24"]],
    ],
    MM: [
      ["Канцтовари", ["MM1"]],
      ["Миючі та дезинфікуючі засоби", ["MM2"],
        /^(миючі|засоби для прання|дезинф|спеціальні миючі|мило|освіжувачі|дозатори|емкости для мыла)/i],
      ["Інвентар для прибирання", ["MM2"],
        /^(губки|мопи|стяжки|пакети для сміття|миски|мусорні|рушники паперові|туалетний|держатели)/i],
      ["Посуд і кухня", ["MM2"]],
      ["Техніка, меблі, інше", ["MM3", "MM4", "MM8"]],
    ],
    R0: [
      ["Робочий одяг", ["R01"]],
      ["Взуття", ["R02"]],
      ["Засоби індивідуального захисту", ["R03"]],
    ],
    P2: [
      ["Плівки та гранули", ["P23"], /^(гранул|пленк|буфлен)/i],
      ["Фарби, лаки, клеї, розчинники", ["P23"]],
      ["Папір, пергамент, картон", ["P21"]],
      ["Скотч, гільзи, форми", ["P22", "P24"]],
    ],
    FU: [
      ["Оливи (масла)", ["FU42"]],
      ["Мастила: пластичні та аерозольні", ["FU41", "FU43"]],
      ["Технічні рідини та гази", ["FU45", "FU46"]],
      ["Паливо", ["FU2", "FU3"]],
    ],
    M4: [
      ["Електроди", ["M40"], /електрод|чугун/i],
      ["Зварювальний дріт", ["M40", "M41", "M42"]],
      ["Припої та флюси", ["M43", "M44"]],
    ],
    M6: [
      ["Кулькові, роликові, голчасті підшипники", ["M65"], /^(шарико|ролико|игольчат)/i],
      ["Корпуси, вузли, лінійні підшипники", ["M65"]],
      ["Манжети, кільця, ущільнення", ["M61"]],
      ["Шайби, фланці, відводи", ["M60", "M69"]],
    ],
    M9: [
      ["Конвеєрні стрічки та сітки", ["M98"]],
      ["Клинові ремені", ["M9D"], /(Z, A, B|SPZ|XPZ|AX, BX|VX)/],
      ["Зубчасті ремені", ["M9D"], /(Т, АТ|HTD|GT|MXL|STD|3M|RPP|SLV|Профиль L|DT|DXL)/],
      ["Поліклинові, круглі та інші ремені", ["M9D"]],
    ],
    M3: [
      ["Пруток і дріт", ["M30"]],
      ["Лист, смуга, профіль", ["M32", "M33"]],
      ["Труби", ["M31"]],
    ],
    M7: [
      ["Електродвигуни та вимикачі", ["M71"]],
      ["Комп'ютери та комплектуючі", ["M75"],
        /^(ноутбук|компьютер|видеокарт|монитор|миша|материнск|жестк|оперативн|процессор|блоки питания|планшет|сервер|аксессуар)/i],
      ["Мережа та відеоспостереження", ["M75"], /^(wi-fi|коммутатор|видеокамер|видеорегистр|шасси)/i],
      ["Принтери та картриджі", ["M75"]],
    ],
    M8: [
      ["Силові кабелі", ["M81"]],
      ["Проводи", ["M86", "M87"]],
      ["Контрольні та сигнальні кабелі", ["M82", "M84"]],
      ["Мережеві, телефонні, акустичні", ["M85"]],
    ],
    MD: [
      ["Пластини, пароніт, гума", ["MD1"]],
      ["Капролон і полімерні прутки", ["MD3"]],
    ],
    P3: [
      ["Ящики та короби", ["P31"]],
      ["Лотки, піддони, вкладиші", ["P32"]],
    ],
    M5: [
      ["Мотор-редуктори та редуктори", ["M58"], /редуктор|сервопривод|вариатор/i],
      ["Насоси", ["M58"], /^насос/i],
    ],
  };
  const OTHER_SECTION = "Інше";

  function groupSections(category, list) {
    const rules = SECTION_RULES[category];
    if (!rules) return [];
    const byTitle = new Map(rules.map(([title]) => [title, { title, groups: [], prefixes: new Set() }]));
    byTitle.set(OTHER_SECTION, { title: OTHER_SECTION, groups: [], prefixes: new Set() });
    for (const g of list) {
      let prefix = g.code.slice(0, 3);
      const rule = rules.find(([, prefixes, re]) => {
        const p = prefixes?.find((x) => g.code.startsWith(x));
        if ((prefixes && !p) || (re && !re.test(g.name))) return false;
        if (p) prefix = p;
        return true;
      });
      const s = byTitle.get(rule ? rule[0] : OTHER_SECTION);
      s.groups.push(g);
      s.prefixes.add(prefix);
    }
    const weight = (s) => s.groups.reduce((sum, g) => sum + g.count, 0);
    return [...byTitle.values()]
      .filter((s) => s.groups.length)
      .map((s) => ({ ...s, prefixes: [...s.prefixes].sort() }))
      .sort((a, b) => (a.title === OTHER_SECTION) - (b.title === OTHER_SECTION) || weight(b) - weight(a));
  }

  // q → токени; кеш, щоб не різати рядок пошуку для кожної з 18 тис. позицій
  let tokensFor = "";
  let tokensCache = [];
  function queryTokens(q) {
    if (q !== tokensFor) {
      tokensFor = q;
      tokensCache = q.split(/\s+/).filter(Boolean);
    }
    return tokensCache;
  }

  const itemHayCache = new WeakMap();
  function itemMatches(item, q) {
    if (!q) return true;
    let hay = itemHayCache.get(item);
    if (hay === undefined) {
      hay = itemHaystack(item);
      itemHayCache.set(item, hay);
    }
    return queryTokens(q).every((token) => hay.includes(token));
  }

  function itemHaystack(item) {
    return normalize(
      [
        item.kmat,
        item.name,
        item.short,
        item.gost,
        item.descr,
        item.doc_name,
        item.int_code,
        item.group,
        item.group_name,
        item.group_raw,
        item.category_name,
        item.unit,
        item.related_doc?.kmat,
        item.related_doc?.name,
        ...(item.related_int || []).flatMap((r) => [r.kmat, r.name]),
        ...item.chars.flatMap((c) => [c.code, c.name, c.value, c.value_code]),
      ]
        .filter(Boolean)
        .join(" ")
    );
  }

  // Позиції поточного розділу/типу без жодних фільтрів — знаменник для «N з M»
  function scopeItems() {
    let list = state.data.items;
    if (state.category) list = list.filter((i) => i.category === state.category);
    if (state.group) list = list.filter((i) => i.group === state.group);
    return list;
  }

  const matchKindOk = (item) => nameFacetFit(item).kind === "ok";
  const matchKindBad = (item) => {
    const k = nameFacetFit(item).kind;
    return k === "bad" || k === "partial";
  };

  const applyStatus = (list) => {
    if (state.itemStatus === "cancelled") return list.filter((item) => !!item.cancelled);
    if (state.itemStatus === "active") return list.filter((item) => !item.cancelled);
    return list;
  };
  const applyNameMatch = (list) => {
    if (state.nameMatch === "ok") return list.filter(matchKindOk);
    if (state.nameMatch === "bad") return list.filter(matchKindBad);
    return list;
  };

  // Повертає { items, base, matchBase, total }:
  // base — усі фільтри, крім статусу (лічильники статусу);
  // matchBase — усі, крім збігу назви↔фасети (лічильники збігу).
  function filteredItems() {
    const q = normalize(state.query);
    const scope = scopeItems();
    let pool = scope;

    const facetEntries = Object.entries(state.facetFilters).filter(([, v]) => v);
    if (facetEntries.length) {
      pool = pool.filter((item) =>
        facetEntries.every(([code, value]) =>
          item.chars.some(
            (c) => c.code === code && String(c.value_code ?? c.value ?? "") === value
          )
        )
      );
    }
    if (q) pool = pool.filter((item) => itemMatches(item, q));
    const local = normalize(state.itemFilter);
    if (local) pool = pool.filter((item) => itemMatches(item, local));

    const base = applyNameMatch(pool);
    const matchBase = applyStatus(pool);
    const list = applyNameMatch(matchBase);

    const sorter = {
      name: (a, b) => ukCompare(a.name, b.name),
      kmat: (a, b) => ukCompare(a.kmat, b.kmat),
      group: (a, b) =>
        ukCompare(a.group_name, b.group_name) || ukCompare(a.name, b.name),
    }[state.sort];
    // без розділу (глобальний пошук) знаменник — усе, що знайшов пошук
    const total = state.category || state.group ? scope.length : base.length;
    return {
      items: list.slice().sort(sorter),
      base,
      matchBase,
      total,
    };
  }

  let facetFitWidth = -1;
  function renderFacetFilters() {
    if (state.mode === "ksmo") {
      els.filters.hidden = true;
      els.facetFilters.innerHTML = "";
      return;
    }

    const group = groupByCode(state.group);
    if (!group || !group.facet_codes.length) {
      els.filters.hidden = true;
      els.facetFilters.innerHTML = "";
      return;
    }

    const facetMap = new Map(state.data.facets.map((f) => [f.code, f]));
    const codes = group.facet_codes
      .map((code) => facetMap.get(code))
      .filter(Boolean)
      .sort((a, b) => {
        const sa = a.values.length <= 40 ? 0 : 1;
        const sb = b.values.length <= 40 ? 0 : 1;
        return sa - sb || b.uses - a.uses;
      })
      .map((f) => f.code);

    const localByFacet = new Map();
    if (state.group) {
      for (const it of state.data.items) {
        if (it.group !== state.group) continue;
        for (const c of it.chars) {
          let m = localByFacet.get(c.code);
          if (!m) {
            m = new Map();
            localByFacet.set(c.code, m);
          }
          const key = String(c.value_code ?? c.value ?? "");
          m.set(key, (m.get(key) || 0) + 1);
        }
      }
    }

    const renderChip = (code) => {
      const facet = facetMap.get(code);
      if (!facet) return "";
      const selected = state.facetFilters[code] || "";
      const scoped = (facet.values || []).filter((v) => {
        if (!state.group || !Array.isArray(v.groups) || !v.groups.length) return true;
        return v.groups.includes(state.group);
      });
      const localCounts = localByFacet.get(code);
      const withLocalCount = scoped
        .map((v) => {
          if (!localCounts) return v;
          const key = String(v.value_code ?? v.value ?? "");
          return { ...v, count: localCounts.get(key) || 0 };
        })
        .filter((v) => !localCounts || v.count > 0);
      const byName = withLocalCount
        .slice()
        .sort((a, b) => ukCompare(String(a.value || ""), String(b.value || "")));
      const byCount = withLocalCount
        .slice()
        .sort(
          (a, b) =>
            b.count - a.count || ukCompare(String(a.value || ""), String(b.value || ""))
        );
      let limited = byName;
      if (byName.length > 80) {
        const top = byCount.slice(0, 60);
        const keys = new Set(top.map((v) => String(v.value_code ?? v.value ?? "")));
        if (selected && !keys.has(selected)) {
          const current = byName.find((v) => String(v.value_code ?? v.value ?? "") === selected);
          if (current) top.push(current);
        }
        limited = top.sort((a, b) => ukCompare(String(a.value || ""), String(b.value || "")));
      }
      const options = limited
        .map((v) => {
          const key = String(v.value_code ?? v.value ?? "");
          return `<option value="${escapeHtml(key)}" ${selected === key ? "selected" : ""}>${escapeHtml(`${v.value ?? "—"} (${v.count})`)}</option>`;
        })
        .join("");
      const note =
        byName.length > 80
          ? `<option disabled>— показано ${limited.length} частих з ${byName.length} —</option>`
          : "";
      const current = selected
        ? withLocalCount.find((v) => String(v.value_code ?? v.value ?? "") === selected)
        : null;
      const valueText = selected ? String(current?.value ?? selected) : "";
      // нативний select лежить прозорим шаром поверх чіпа: клік відкриває звичайний список
      return `
        <span class="facet-chip${selected ? " is-on" : ""}" data-chip-on="${selected ? 1 : 0}" title="${escapeHtml(selected ? `${facet.name}: ${valueText}` : facet.name)}">
          <span class="facet-chip-text">${escapeHtml(facet.name)}${selected ? `: <b>${escapeHtml(valueText)}</b>` : ""}</span>
          ${selected ? "" : `<span class="facet-chip-caret" aria-hidden="true">▾</span>`}
          <select data-facet="${escapeHtml(code)}" aria-label="${escapeHtml(facet.name)}">
            <option value="">Будь-яке значення</option>
            ${note}
            ${options}
          </select>
          ${selected ? `<button type="button" class="facet-chip-clear" data-clear-facet="${escapeHtml(code)}" aria-label="Скинути «${escapeHtml(facet.name)}»">✕</button>` : ""}
        </span>`;
    };

    els.filters.hidden = false;
    els.facetFilters.innerHTML =
      codes.map(renderChip).join("") +
      `<button type="button" class="facet-more" data-more-facets hidden></button>`;
    els.clearFacets.hidden = !Object.values(state.facetFilters).some(Boolean);
    facetFitWidth = -1;
    fitFacetChips();
  }

  // Ховаємо лише ті чіпи, що не влазять в один рядок; вибрані видно завжди.
  function fitFacetChips() {
    const box = els.facetFilters;
    const width = box.clientWidth;
    if (!width || width === facetFitWidth) return;
    facetFitWidth = width;

    const btn = box.querySelector("[data-more-facets]");
    const chips = [...box.querySelectorAll(".facet-chip")];
    if (!btn || !chips.length) return;
    chips.forEach((c) => (c.hidden = false));
    btn.hidden = true;

    const top = chips[0].offsetTop;
    const overflows = () =>
      [...box.children].some((el) => !el.hidden && el.offsetTop > top + 2);
    if (!overflows()) return; // усе влазить — кнопка не потрібна

    btn.hidden = false;
    btn.setAttribute("aria-expanded", String(state.showAllFacets));
    if (state.showAllFacets) {
      btn.textContent = "Менше";
      return;
    }

    const candidates = chips.filter((c) => c.dataset.chipOn !== "1").reverse();
    let hidden = 0;
    const label = () =>
      (btn.textContent = `+${hidden} ${plural(hidden, ["фасет", "фасети", "фасетів"])}`);
    for (const chip of candidates) {
      chip.hidden = true;
      hidden++;
      label();
      if (!overflows()) break;
    }
  }

  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => fitFacetChips()).observe(els.facetFilters);
  } else {
    window.addEventListener("resize", () => {
      facetFitWidth = -1;
      fitFacetChips();
    });
  }

  function renderDetail(item) {
    if (!item) {
      els.detail.innerHTML = `
        <div class="detail-empty">
          <strong>Картка позиції</strong>
          <p>Натисніть рядок зліва — тут розберемо, з чого вона складається.</p>
        </div>`;
      return;
    }

    const chars = item.chars
      .slice()
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999) || a.code.localeCompare(b.code));

    const segParts = chars.map((c, i) => ({ seg: String(i), value: c.value }));
    const segStyle = (seg) => {
      const [c, bg] = SEG_COLORS[Number(seg) % SEG_COLORS.length];
      return `--c:${c};--c-bg:${bg}`;
    };
    const ksmSegs = findNameSegments(item.name, segParts);

    const activeFilter = (c) =>
      state.mode === "ksm" &&
      state.group === item.group &&
      state.facetFilters[c.code] === String(c.value_code ?? c.value ?? "");

    const charCards = chars
      .map((c, i) => {
        const seg = String(i);
        const inName = ksmSegs.found.has(seg);
        const on = activeFilter(c);
        return `
      <button type="button" class="np${inName ? "" : " np--absent"}${on ? " is-on" : ""}" data-seg="${seg}" data-filter-char="${escapeHtml(c.code)}" style="${segStyle(seg)}" title="${on ? "Прибрати фільтр" : "Показати всі позиції з таким значенням"}">
        <div class="np-top"><span>${escapeHtml(c.name)}</span><code>${escapeHtml(c.code)}${c.value_code != null ? " / " + escapeHtml(c.value_code) : ""}</code></div>
        <strong>${escapeHtml(c.value ?? "—")}</strong>
        <span class="np-foot">${on ? "✓ фільтр увімкнено" : inName ? "Фільтрувати →" : "немає в назві · Фільтрувати →"}</span>
      </button>`;
      })
      .join("");

    const ksmo = item.int_code ? ksmoByCode(item.int_code) : null;
    const ksmoName = ksmo?.name || "";
    const namesEqual = !!(ksmoName && normalize(item.name) === normalize(ksmoName));
    const showNameBridge = !!ksmoName;
    const bridgeTitle = namesEqual
      ? "Найменування в SmartTender (KSM) і в 1С (KSMO) однакові"
      : "Найменування в SmartTender (KSM) і в 1С (KSMO) різні — порівняйте їх";
    // підпис на дужці між двома блоками
    const chainLink = (ok, text, tip) => `
      <div class="name-link name-link--${ok ? "ok" : "bad"}" data-tip="${escapeHtml(tip)}" role="note" aria-label="${escapeHtml(tip)}">
        <span class="name-link-icon" aria-hidden="true">${ok ? "✓" : "✕"}</span>
        <span class="name-link-text">${escapeHtml(text)}</span>
      </div>`;
    // плече дужки: up — до підпису вище, down — до підпису нижче;
    // де саме торкається блоку, рахує layoutChainArms() після рендеру
    const chainArm = (dir, ok) =>
      `<span class="chain-arm chain-arm--${dir} chain-arm--${ok ? "ok" : "bad"}" aria-hidden="true"></span>`;
    const chainGap = `<div class="chain-gap"></div>`;

    const nameLink = showNameBridge
      ? chainLink(namesEqual, namesEqual ? "Назви збігаються" : "Назви відрізняються", bridgeTitle)
      : chainGap;

    // чи складається найменування KSM повністю зі значень фасетів
    const fit = nameFacetFit(item);
    const showCtorBridge = fit.kind !== "none";
    const ctorOk = fit.kind === "ok";
    const ctorTip = fit.tip;
    const ctorText = fit.label;
    const ctorLink = showCtorBridge ? chainLink(ctorOk, ctorText, ctorTip) : chainGap;
    const ksmoBlock = item.int_code
      ? `
      <div class="detail-name-block detail-name-block--ksmo ksmo-link" data-open-ksmo="${escapeHtml(item.int_code)}" role="button" tabindex="0" title="Відкрити KSMO">
        <div class="detail-name-head">
          <div class="chars-title">Найменування 1С (KSMO)</div>
          <div class="detail-pills">
            ${ksmo ? statusPill(ksmo.status) : `<span class="pill pill-neutral">немає в довіднику</span>`}
          </div>
        </div>
        <div class="detail-name-row">
          <h2>${ksmoName ? findNameSegments(ksmoName, segParts).html : "Код є в позиції, але запису KSMO не знайдено"}</h2>
          ${ksmoName ? copyBtn(ksmoName) : ""}
        </div>
        <div class="detail-code-row">
          <span class="detail-code-label">Код 1С</span>
          ${codeWithCopy(item.int_code)}
          <span class="ksmo-link-go" aria-hidden="true">Відкрити</span>
        </div>
      </div>`
      : `
      <div class="detail-name-block detail-name-block--empty">
        <div class="detail-name-head">
          <div class="chars-title">Найменування 1С (KSMO)</div>
        </div>
        <div class="muted tiny">Немає коду 1С</div>
      </div>`;

    els.detail.innerHTML = `
      <div class="name-chain">
      <div class="chain-item">
        ${ksmoBlock}
        ${showNameBridge ? chainArm("down", namesEqual) : ""}
      </div>
      ${nameLink}
      <div class="chain-item">
      <div class="detail-name-block">
        <div class="detail-name-head">
          <div class="chars-title">Найменування SmartTender (KSM)</div>
          <div class="detail-pills">
            ${statusPill(null, !!item.cancelled)}
          </div>
        </div>
        <div class="detail-name-row">
          <h2>${ksmSegs.html}</h2>
          ${copyBtn(item.name)}
        </div>
        <div class="detail-code-row">
          <span class="detail-code-label">Код позиції</span>
          ${codeWithCopy(item.kmat)}
        </div>
      </div>
        ${showNameBridge ? chainArm("up", namesEqual) : ""}
        ${showCtorBridge ? chainArm("down", ctorOk) : ""}
      </div>
      ${ctorLink}
      <div class="chain-item">
      <div class="detail-ctor">
        <div class="np-head">
          <div class="chars-title">З чого зібрана назва</div>
          <span class="muted tiny">${chars.length} ${plural(chars.length, ["фасет", "фасети", "фасетів"])} · наведіть, щоб побачити в назві</span>
        </div>
        <div class="np-grid">
          ${charCards || `<div class="muted tiny">У цієї позиції немає додаткових фасетів</div>`}
        </div>
      </div>
        ${showCtorBridge ? chainArm("up", ctorOk) : ""}
      </div>
      </div>

      <section class="detail-card">
        <div class="detail-card-head"><div class="chars-title">Характеристики</div></div>
        <dl class="meta-grid">
          <dt>Категорія</dt><dd>${escapeHtml(item.category_name)}</dd>
          <dt>Тип</dt><dd>${escapeHtml(item.group_name)}</dd>
          <dt>Одиниця</dt><dd>${escapeHtml(item.unit || "—")}</dd>
          <dt>ГОСТ/ДСТУ</dt><dd>${escapeHtml(item.gost || "—")}</dd>
          <dt>Коротко</dt><dd>${escapeHtml(item.short || "—")}</dd>
        </dl>
      </section>
    `;
    watchChainArms(els.detail.querySelector(".name-chain"));
  }

  // Дужки між блоками: точка дотику — на CHAIN_REACH висоти блоку від краю,
  // що дивиться на підпис. Обидва плечі однієї дужки беруть цю частку від НИЖЧОГО
  // з двох блоків, тож вони завжди однакової довжини, а точки стоять майже по центру.
  const CHAIN_REACH = 0.45;
  let chainObserver = null;
  function layoutChainArms(chain) {
    if (!chain || !chain.isConnected) return;
    for (const link of chain.querySelectorAll(":scope > .name-link")) {
      const above = link.previousElementSibling;
      const below = link.nextElementSibling;
      const armDown = above && above.querySelector(":scope > .chain-arm--down");
      const armUp = below && below.querySelector(":scope > .chain-arm--up");
      if (!armDown || !armUp) continue;
      const hAbove = above.firstElementChild.offsetHeight;
      const hBelow = below.firstElementChild.offsetHeight;
      if (!hAbove || !hBelow) continue; // панель ще прихована — порахуємо, коли зʼявиться
      const reach = `${Math.round(CHAIN_REACH * Math.min(hAbove, hBelow))}px`;
      armDown.style.setProperty("--reach", reach);
      armUp.style.setProperty("--reach", reach);
    }
  }
  function watchChainArms(chain) {
    if (chainObserver) chainObserver.disconnect();
    if (!chain) return;
    layoutChainArms(chain);
    if (typeof ResizeObserver === "function") {
      chainObserver = new ResizeObserver(() => layoutChainArms(chain));
      for (const item of chain.querySelectorAll(":scope > .chain-item")) chainObserver.observe(item);
    }
  }

  // колір частин, знайдених у назві: один для всіх (текст/рамка, фон підсвітки)
  const SEG_COLORS = [["#2f7d5b", "#d6f0e2"]];

  // Наскільки назва зібрана зі значень фасетів (кеш на обʼєкті позиції).
  const nameFitCache = new WeakMap();
  function nameFacetFit(item) {
    const hit = nameFitCache.get(item);
    if (hit) return hit;

    const chars = item?.chars || [];
    if (!chars.length) {
      const empty = {
        kind: "none",
        matched: 0,
        total: 0,
        missing: [],
        rest: [],
        tip: "У позиції немає фасетів",
        label: "—",
        short: "—",
      };
      nameFitCache.set(item, empty);
      return empty;
    }

    const segParts = chars.map((c, i) => ({ seg: String(i), value: c.value }));
    const segs = findNameSegments(item.name, segParts);
    const missing = chars.filter(
      (c, i) => String(c.value ?? "").trim() && !segs.found.has(String(i))
    );
    const valued = chars.filter((c) => String(c.value ?? "").trim());
    const total = valued.length;
    const matched = total - missing.length;
    const rest = segs.rest;

    const problems = [];
    if (missing.length)
      problems.push(
        `У назві немає ${missing.length} ${plural(missing.length, ["фасету", "фасетів", "фасетів"])}: ${missing
          .map((c) => `${c.name} — «${c.value}»`)
          .join("; ")}`
      );
    if (rest.length)
      problems.push(
        `У назві є частини, яких немає серед фасетів: ${rest.map((r) => `«${r}»`).join(", ")}`
      );

    let kind;
    let label;
    let short;
    let tip;
    if (!total) {
      kind = "none";
      label = "—";
      short = "—";
      tip = "У фасетів немає значень для порівняння";
    } else if (!missing.length && !rest.length) {
      kind = "ok";
      label = "Назва зібрана з фасетів";
      short = "збіг";
      tip = "Найменування SmartTender (KSM) повністю складене зі значень фасетів";
    } else if (!matched) {
      kind = "bad";
      label = "Назва не збігається з фасетами";
      short = "ні";
      tip = problems.join(". ");
    } else {
      kind = "partial";
      label =
        missing.length && !rest.length
          ? `Не вистачає ${missing.length} ${plural(missing.length, ["фасету", "фасетів", "фасетів"])}`
          : "Назва не збігається з фасетами";
      short = `${matched}/${total}`;
      tip = problems.join(". ");
    }

    const result = { kind, matched, total, missing, rest, tip, label, short };
    nameFitCache.set(item, result);
    return result;
  }

  function matchPill(item) {
    const fit = nameFacetFit(item);
    if (fit.kind === "none") {
      return `<span class="match-pill match-none" title="${escapeHtml(fit.tip)}">—</span>`;
    }
    const tone = fit.kind === "ok" ? "ok" : fit.kind === "partial" ? "mid" : "bad";
    const icon = fit.kind === "ok" ? "✓" : fit.kind === "partial" ? "≈" : "✕";
    return `<span class="match-pill match-${tone}" title="${escapeHtml(fit.tip)}"><span class="match-ico" aria-hidden="true">${icon}</span>${escapeHtml(fit.short)}</span>`;
  }

  // Знаходимо в назві шматки, що збігаються зі значеннями фасетів, і обгортаємо їх.
  function findNameSegments(name, parts) {
    const text = String(name || "");
    const lower = text.toLocaleLowerCase("uk");
    const taken = [];
    const found = new Set();
    const order = parts
      .filter((p) => p.value && String(p.value).trim().length > 1)
      .sort((a, b) => String(b.value).length - String(a.value).length);
    for (const p of order) {
      const needle = String(p.value).trim().toLocaleLowerCase("uk");
      let from = 0;
      while (from <= lower.length) {
        const at = lower.indexOf(needle, from);
        if (at < 0) break;
        const end = at + needle.length;
        if (!taken.some((r) => at < r.end && end > r.start)) {
          taken.push({ start: at, end, seg: p.seg });
          found.add(p.seg);
          break;
        }
        from = at + 1;
      }
    }
    taken.sort((a, b) => a.start - b.start);
    let html = "";
    let pos = 0;
    // шматки назви, що не належать жодному фасету (без пробілів і розділових знаків)
    const rest = [];
    const pushRest = (s) => {
      const t = s.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      if (t) rest.push(t);
    };
    for (const r of taken) {
      pushRest(text.slice(pos, r.start));
      html += escapeHtml(text.slice(pos, r.start));
      const [c, bg] = SEG_COLORS[Number(r.seg) % SEG_COLORS.length];
      html += `<span class="name-seg" data-seg="${r.seg}" style="--c:${c};--c-bg:${bg}">${escapeHtml(text.slice(r.start, r.end))}</span>`;
      pos = r.end;
    }
    pushRest(text.slice(pos));
    html += escapeHtml(text.slice(pos));
    return { html, found, rest };
  }

  function toggleCharFilter(code) {
    const item = itemByKmat(state.selectedKmat);
    const ch = item?.chars.find((c) => c.code === code);
    if (!item || !ch) return;
    const key = String(ch.value_code ?? ch.value ?? "");
    if (state.mode !== "ksm" || state.group !== item.group) {
      openGroup(item.group);
      state.selectedKmat = item.kmat;
    }
    if (state.facetFilters[code] === key) delete state.facetFilters[code];
    else state.facetFilters[code] = key;
    renderItems();
    renderDetail(item);
  }

  function renderItems() {
    const cat = categoryByCode(state.category);
    const group = groupByCode(state.group);
    const isKsmo = state.mode === "ksmo";
    setItemsLayout(isKsmo);

    if (isKsmo) {
      renderKsmoBrowse(cat);
      return;
    }

    if (state.query && !state.group) {
      els.crumbs.innerHTML = `<button type="button" data-crumb="home">Усі категорії</button> <span class="crumb-sep">›</span> Пошук`;
      els.itemsTitle.textContent = `«${state.query}»`;
      setTitleCode(els.itemsCode, null);
      els.itemsSub.textContent = "з усього каталогу";
    } else if (group) {
      // crumbs — лише предки; поточну назву показує h1
      els.crumbs.innerHTML = `
        <button type="button" data-crumb="home">Усі категорії</button> <span class="crumb-sep">›</span>
        <button type="button" data-crumb="category">${escapeHtml(cat?.name || group.category_name)}</button>
      `;
      els.itemsTitle.textContent = group.name;
      setTitleCode(els.itemsCode, group.code);
      els.itemsSub.textContent = "";
    } else if (cat) {
      els.crumbs.innerHTML = `
        <button type="button" data-crumb="home">Усі категорії</button>
      `;
      els.itemsTitle.textContent = cat.name;
      setTitleCode(els.itemsCode, cat.code);
      els.itemsSub.textContent = "усі позиції розділу";
    }

    renderFacetFilters();
    const { items, base, matchBase, total } = filteredItems();
    const ensureIdx = state.selectedKmat ? items.findIndex((i) => i.kmat === state.selectedKmat) : -1;

    const activeCount = base.filter((i) => !i.cancelled).length;
    renderSeg(
      els.itemStatusSeg,
      [
        { value: "", label: "Усі", count: base.length },
        { value: "active", label: "Активні", count: activeCount, tone: "ok" },
        { value: "cancelled", label: "Скасовані", count: base.length - activeCount, tone: "warn" },
      ],
      state.itemStatus,
      total
    );
    const matchOkCount = matchBase.filter(matchKindOk).length;
    const matchBadCount = matchBase.filter(matchKindBad).length;
    renderSeg(
      els.itemMatchSeg,
      [
        { value: "", label: "Усі", count: matchBase.length },
        { value: "ok", label: "Збіг", count: matchOkCount, tone: "ok" },
        { value: "bad", label: "Ні", count: matchBadCount, tone: "warn" },
      ],
      state.nameMatch,
      total
    );
    const showGroup = !state.group;
    els.resultCount.textContent = countLabel(items.length, total, FORMS_ITEMS);
    els.empty.hidden = items.length > 0;
    resetInfinite(
      "main",
      items,
      (item) => {
        const active = item.kmat === state.selectedKmat ? "active" : "";
        const groupCell = showGroup
          ? `<td><div class="name-cell" style="font-weight:600">${escapeHtml(item.group_name)}</div></td>`
          : "";
        return `
          <tr class="${active}${item.cancelled ? " is-cancelled" : ""}" data-kmat="${escapeHtml(item.kmat)}">
            <td class="col-status">${statusPill(null, !!item.cancelled)}</td>
            <td>
              <div class="name-cell">${escapeHtml(item.name)}</div>
            </td>
            ${groupCell}
            <td class="col-match">${matchPill(item)}</td>
            <td class="col-int mono">${item.int_code ? escapeHtml(item.int_code) : "—"}</td>
            <td class="mono codes-only">${escapeHtml(item.kmat)}</td>
            <td>${escapeHtml(item.unit || "—")}</td>
            <td><span class="badge">${item.chars.length}</span></td>
          </tr>`;
      },
      els.mainTableWrap,
      els.rows,
      ensureIdx
    );

    if (state.selectedKmat && !items.some((i) => i.kmat === state.selectedKmat)) {
      state.selectedKmat = items[0]?.kmat || null;
    } else if (!state.selectedKmat && items[0]) {
      state.selectedKmat = items[0].kmat;
    }

    const selected = items.find((i) => i.kmat === state.selectedKmat) || null;
    if (selected) renderDetail(selected);
    else renderDetail(null);
    syncUrl();
  }

  function renderKsmoBrowse(cat) {
    els.filters.hidden = true;
    els.facetFilters.innerHTML = "";

    // лічильники статусу — з урахуванням текстового фільтра, але без самого статусу
    const byStatus = filteredKsmoEntries({ ignoreStatus: true });
    const entries = sortedKsmoEntries(
      state.ksmoStatus ? byStatus.filter((e) => e.status === state.ksmoStatus) : byStatus
    );
    const ensureIdx = state.selectedKsmo
      ? entries.findIndex((e) => e.code === state.selectedKsmo)
      : -1;

    if (state.query && !state.category) {
      els.crumbs.innerHTML = `<button type="button" data-crumb="home">Довідник KSMO</button> <span class="crumb-sep">›</span> Пошук`;
      els.itemsTitle.textContent = `«${state.query}»`;
      setTitleCode(els.itemsCode, null);
      els.itemsSub.textContent = "";
    } else if (cat) {
      // crumbs — лише предки; поточну назву показує h1
      els.crumbs.innerHTML = `
        <button type="button" data-crumb="home">Довідник KSMO</button>
      `;
      els.itemsTitle.textContent = cat.name;
      setTitleCode(els.itemsCode, cat.code);
      els.itemsSub.textContent = "";
    } else {
      els.crumbs.innerHTML = `KSMO`;
      els.itemsTitle.textContent = "Довідник KSMO";
      setTitleCode(els.itemsCode, null);
      els.itemsSub.textContent = "коди інтеграції 1С";
    }

    const countOf = (s) => byStatus.filter((e) => e.status === s).length;
    const total = state.category
      ? filteredKsmoEntries({ ignoreStatus: true, ignoreText: true }).length
      : byStatus.length;
    renderSeg(
      els.ksmoStatusSeg,
      [
        { value: "", label: "Усі", count: byStatus.length },
        { value: "active", label: "Активні", count: countOf("active"), tone: "ok" },
        { value: "mixed", label: "Змішані", count: countOf("mixed") },
        { value: "cancelled", label: "Скасовані", count: countOf("cancelled"), tone: "warn" },
      ],
      state.ksmoStatus,
      total
    );
    els.resultCount.textContent = countLabel(entries.length, total, FORMS_KSMO);
    els.empty.hidden = entries.length > 0;
    resetInfinite(
      "main",
      entries,
      (e) => {
        const active = e.code === state.selectedKsmo ? "active" : "";
        return `
          <tr class="${active}${e.status === "cancelled" ? " is-cancelled" : ""}" data-ksmo="${escapeHtml(e.code)}">
            <td class="col-status">${statusPill(e.status)}</td>
            <td>
              <div class="name-cell">${escapeHtml(e.name)}</div>
            </td>
            <td class="col-int mono">${escapeHtml(e.code)}</td>
            <td class="col-count"><span class="badge">${e.count}</span></td>
          </tr>`;
      },
      els.mainTableWrap,
      els.rows,
      ensureIdx
    );

    if (state.selectedKsmo && !entries.some((e) => e.code === state.selectedKsmo)) {
      state.selectedKsmo = entries[0]?.code || null;
      state.selectedKmat = null;
    } else if (!state.selectedKsmo && entries[0]) {
      state.selectedKsmo = entries[0].code;
      state.selectedKmat = null;
    }

    const selected = state.selectedKsmo ? ksmoByCode(state.selectedKsmo) : null;
    if (selected && !state.selectedKmat) {
      state.selectedKmat = selected.items?.[0]?.kmat || null;
    }
    renderKsmoMembers(selected);
  }

  function showView(view) {
    state.view = view;
    els.viewHome.hidden = view !== "home";
    els.viewGroups.hidden = view !== "groups";
    els.viewItems.hidden = view !== "items";

    if (view === "home") renderHome();
    if (view === "groups") renderGroups();
    if (view === "items") renderItems();
    syncUrl();
  }

  function goHome() {
    state.category = null;
    state.group = null;
    state.selectedKsmo = null;
    state.facetFilters = {};
    state.query = "";
    els.search.value = "";
    els.searchClear.hidden = true;
    showView("home");
  }

  function resetNavSoft() {
    state.facetFilters = {};
    state.selectedKmat = null;
    state.groupFilter = "";
    if (els.groupFilter) els.groupFilter.value = "";
    state.ksmoNameFilter = "";
    if (els.ksmoNameFilter) els.ksmoNameFilter.value = "";
    state.itemFilter = "";
    if (els.itemFilter) els.itemFilter.value = "";
  }

  function openCategory(code) {
    state.category = code;
    state.group = null;
    state.selectedKsmo = null;
    resetNavSoft();
    state.query = "";
    els.search.value = "";
    els.searchClear.hidden = true;
    // KSMO: одразу табличний довідник (зліва KSMO, справа KSM)
    showView(state.mode === "ksmo" ? "items" : "groups");
  }

  function openGroup(code) {
    const g = groupByCode(code);
    if (!g) return;
    state.mode = "ksm";
    updateModeButtons();
    state.group = code;
    state.category = g.category;
    state.selectedKsmo = null;
    state.facetFilters = {};
    state.selectedKmat = null;
    state.itemFilter = "";
    if (els.itemFilter) els.itemFilter.value = "";
    if (!state.query) {
      els.search.value = "";
      els.searchClear.hidden = true;
    }
    showView("items");
  }

  function openKsmo(code, opts = {}) {
    const entry = ksmoByCode(code);
    if (!entry) return;
    state.mode = "ksmo";
    updateModeButtons();
    state.selectedKsmo = code;
    pickedKsmo = code;
    if (opts.kmat) pickedKmat = opts.kmat;
    state.category = entry.category;
    state.group = null;
    state.facetFilters = {};
    state.selectedKmat = opts.kmat || entry.items?.[0]?.kmat || null;
    if (!opts.keepQuery) {
      state.query = "";
      els.search.value = "";
      els.searchClear.hidden = true;
    }
    showView("items");
  }

  function openKmat(kmat) {
    const item = itemByKmat(kmat);
    if (!item) return;
    state.selectedKmat = kmat;
    pickedKmat = kmat;
    if (state.mode === "ksmo" && item.int_code) {
      if (state.selectedKsmo !== item.int_code) {
        openKsmo(item.int_code, { kmat, keepQuery: true });
        return;
      }
      renderItems();
      syncUrl();
      return;
    }
    // у режимі KSM — відкрити групу позиції
    state.group = item.group;
    state.category = item.category;
    state.selectedKsmo = null;
    showView("items");
  }

  // З довідника KSMO — у каталог KSM: тип цієї позиції, вона вибрана й прокручена в поле зору.
  // Фільтри скидаємо, щоб позиція точно була в списку (скасовані теж).
  function openInKsmCatalog(kmat) {
    const item = itemByKmat(kmat);
    if (!item) return;
    state.mode = "ksm";
    updateModeButtons();
    state.category = item.category;
    state.group = item.group;
    state.selectedKsmo = null;
    state.facetFilters = {};
    state.itemStatus = "";
    state.nameMatch = "";
    state.itemFilter = "";
    if (els.itemFilter) els.itemFilter.value = "";
    state.query = "";
    els.search.value = "";
    els.searchClear.hidden = true;
    state.selectedKmat = kmat;
    pickedKmat = kmat;
    showView("items");
    requestAnimationFrame(() => {
      const row = els.rows.querySelector(`tr[data-kmat="${CSS.escape(kmat)}"]`);
      row?.scrollIntoView({ block: "center" });
    });
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    state.category = null;
    state.group = null;
    state.selectedKsmo = null;
    state.ksmoStatus = "";
    state.ksmoNameFilter = "";
    if (els.ksmoNameFilter) els.ksmoNameFilter.value = "";
    state.itemStatus = "";
    state.nameMatch = "";
    state.showAllFacets = false;
    resetNavSoft();
    state.query = "";
    els.search.value = "";
    els.searchClear.hidden = true;
    setItemsLayout(mode === "ksmo");
    updateModeButtons();
    showView("home");
  }

  function runSearch(q) {
    state.query = q.trim();
    els.searchClear.hidden = !state.query;
    if (!state.query) {
      if (state.mode === "ksmo") {
        if (state.category || state.selectedKsmo) showView("items");
        else showView("home");
        return;
      }
      if (state.group) showView("items");
      else if (state.category) showView("groups");
      else showView("home");
      return;
    }

    if (state.mode === "ksmo") {
      // глобальний пошук по всіх KSMO; локальний фільтр — якщо вже в категорії
      if (!state.category) {
        state.selectedKsmo = null;
        state.selectedKmat = null;
      }
      state.group = null;
      showView("items");
      return;
    }

    state.group = null;
    state.category = null;
    state.selectedKsmo = null;
    state.facetFilters = {};
    state.selectedKmat = null;
    showView("items");
  }

  // ---- Адреса сторінки: #/ksm/<категорія>/<група>/<позиція>?q=… ----
  // Хеш працює і на serve.py, і на GitHub Pages, і у standalone-файлі — без налаштувань сервера.
  // Ключ — код (кодуємо, бо в кодах бувають «/», «#», пробіли), після «~» — назва лише для читабельності.
  const BASE_TITLE = document.title;
  let pickedKmat = null; // позиція/KSMO, обрана явно (клік), а не автоматично перший рядок
  let pickedKsmo = null;
  let applyingRoute = false;

  const slug = (s) =>
    String(s || "")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .slice(0, 60)
      .replace(/^-+|-+$/g, "");

  function buildRoute() {
    const parts = [];
    let title = "";
    const add = (code, name) => {
      if (!code) return;
      const s = slug(name);
      parts.push(encodeURIComponent(code) + (s ? `~${s}` : ""));
      title = name || code;
    };
    const isItems = state.view === "items";
    add(state.category, categoryByCode(state.category)?.name);
    if (state.mode === "ksmo") {
      if (isItems && state.selectedKsmo && state.selectedKsmo === pickedKsmo) {
        add(state.selectedKsmo, ksmoByCode(state.selectedKsmo)?.name);
      }
    } else if (isItems && state.group) {
      add(state.group, groupByCode(state.group)?.name);
    }
    if (isItems && state.selectedKmat && state.selectedKmat === pickedKmat) {
      add(state.selectedKmat, itemByKmat(state.selectedKmat)?.name);
    }
    if (state.query) title = `«${state.query}»`;
    const isHome = state.mode === "ksm" && !parts.length && !state.query;
    const path = isHome ? "" : `#/${[state.mode, ...parts].join("/")}`;
    const hash = state.query ? `${path || "#/ksm"}?q=${encodeURIComponent(state.query)}` : path;
    return { hash, title };
  }

  const routeUrl = (hash) => new URL(hash || location.pathname + location.search, location.href);

  function syncUrl() {
    if (!state.data) return;
    const { hash, title } = buildRoute();
    document.title = title ? `${title} — Каталог SmartTender` : BASE_TITLE;
    const target = routeUrl(hash);
    if (target.hash === location.hash) return;
    // зміна лише пошукового запиту (набір тексту) не плодить записи в історії «Назад»
    const samePath = target.hash.split("?")[0] === location.hash.split("?")[0];
    try {
      history[applyingRoute || samePath ? "replaceState" : "pushState"](null, "", target.href);
    } catch {
      location.replace(target.href); // file:// у деяких браузерах не дозволяє history API
    }
  }

  function parseRoute(hash) {
    let raw = hash.replace(/^#\/?/, "");
    let q = "";
    const qi = raw.indexOf("?");
    if (qi >= 0) {
      q = (new URLSearchParams(raw.slice(qi + 1)).get("q") || "").trim();
      raw = raw.slice(0, qi);
    }
    const segs = raw
      .split("/")
      .filter(Boolean)
      .map((s) => {
        const code = s.split("~")[0];
        try {
          return decodeURIComponent(code);
        } catch {
          return code;
        }
      });
    const r = { mode: "ksm", cat: null, group: null, ksmo: null, kmat: null, q };
    if (segs[0] === "ksm" || segs[0] === "ksmo") r.mode = segs.shift();
    for (const code of segs) {
      if (!r.cat && !r.group && idx.categories.has(code)) r.cat = code;
      else if (idx.groups.has(code)) r.group = code;
      else if (idx.ksmo.has(code)) r.ksmo = code;
      else if (idx.items.has(code)) r.kmat = code;
    }
    return r;
  }

  function applyRoute(force = false) {
    if (!state.data) return;
    // адреса вже відповідає екрану (напр. після нашого ж pushState) — нічого не робимо
    if (!force && routeUrl(buildRoute().hash).hash === location.hash) return;
    const r = parseRoute(location.hash);
    const item = r.kmat ? itemByKmat(r.kmat) : null;
    // коротке посилання лише з кодом позиції/KSMO: решту ланцюжка відновлюємо з даних
    if (!r.q && item) {
      if (r.mode === "ksm") r.group ||= item.group;
      else r.ksmo ||= item.int_code || null;
    }
    if (!r.q && !r.cat) {
      r.cat = groupByCode(r.group)?.category || ksmoByCode(r.ksmo)?.category || item?.category || null;
    }

    applyingRoute = true;
    try {
      state.mode = r.mode;
      updateModeButtons();
      setItemsLayout(r.mode === "ksmo");
      resetNavSoft();
      state.ksmoStatus = "";
      state.itemStatus = "";
      state.nameMatch = "";
      state.category = r.cat;
      state.group = r.mode === "ksm" ? r.group : null;
      state.selectedKsmo = r.mode === "ksmo" ? r.ksmo : null;
      state.selectedKmat = r.kmat;
      if (state.selectedKsmo) pickedKsmo = state.selectedKsmo;
      if (r.kmat) pickedKmat = r.kmat;
      state.query = r.q;
      els.search.value = r.q;
      els.searchClear.hidden = !r.q;

      let view = "home";
      if (r.mode === "ksmo") {
        if (state.category || state.selectedKsmo || r.q) view = "items";
      } else if (state.group || r.q || r.kmat) view = "items";
      else if (state.category) view = "groups";
      showView(view);
    } finally {
      applyingRoute = false;
    }
  }

  window.addEventListener("popstate", () => applyRoute());
  window.addEventListener("hashchange", () => applyRoute());

  // events
  bindInfiniteScroll(els.mainTableWrap, "main");
  bindInfiniteScroll(els.membersTableWrap, "members");

  document.querySelector(".mode-switch")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (btn) setMode(btn.dataset.mode);
  });

  els.categoryGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-category]");
    if (btn) openCategory(btn.dataset.category);
  });

  els.groupGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-group]");
    if (btn) openGroup(btn.dataset.group);
  });

  els.brandHome?.addEventListener("click", goHome);

  els.backHome.addEventListener("click", goHome);

  els.backGroups.addEventListener("click", () => {
    if (state.mode === "ksmo") {
      state.selectedKsmo = null;
      state.selectedKmat = null;
      state.category = null;
      state.query = "";
      els.search.value = "";
      els.searchClear.hidden = true;
      showView("home");
      return;
    }
    if (state.query && !state.group) {
      state.query = "";
      els.search.value = "";
      els.searchClear.hidden = true;
      showView("home");
      return;
    }
    state.group = null;
    state.facetFilters = {};
    state.selectedKmat = null;
    if (state.category) showView("groups");
    else showView("home");
  });

  // крихти є і на сторінці типів, і в тулбарі таблиці
  els.stage.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-crumb]");
    if (!btn) return;
    if (btn.dataset.crumb === "home") {
      goHome();
    }
    if (btn.dataset.crumb === "category") {
      state.group = null;
      state.selectedKsmo = null;
      state.facetFilters = {};
      state.query = "";
      els.search.value = "";
      els.searchClear.hidden = true;
      showView(state.mode === "ksmo" ? "items" : "groups");
    }
  });

  let searchTimer = null;
  els.search.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(els.search.value), 160);
  });
  els.searchClear.addEventListener("click", () => {
    els.search.value = "";
    runSearch("");
  });

  // «Як це працює?» у шапці розкриває довідку над картками категорій
  const howToggle = $("how-toggle");
  const howPanel = $("how-it-works");
  howToggle?.addEventListener("click", () => {
    const open = howPanel.hidden;
    howPanel.hidden = !open;
    howToggle.setAttribute("aria-expanded", String(open));
  });

  els.categoryFilter?.addEventListener("input", () => {
    state.categoryFilter = els.categoryFilter.value.trim();
    renderHome();
  });

  els.groupFilter.addEventListener("input", () => {
    state.groupFilter = els.groupFilter.value.trim();
    renderGroups();
  });

  // перемикачі статусу: KSMO зліва, позиції KSM, підвʼязані KSM справа
  const onSeg = (el, apply) =>
    el?.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-status]");
      if (!btn || btn.disabled) return;
      apply(btn.dataset.status);
      renderItems();
    });
  onSeg(els.ksmoStatusSeg, (v) => {
    state.ksmoStatus = v;
  });
  onSeg(els.itemStatusSeg, (v) => {
    state.itemStatus = v;
  });
  onSeg(els.itemMatchSeg, (v) => {
    state.nameMatch = v;
  });
  onSeg(els.memberStatusSeg, (v) => {
    state.itemStatus = v;
  });

  let ksmoNameTimer = null;
  els.ksmoNameFilter?.addEventListener("input", () => {
    clearTimeout(ksmoNameTimer);
    ksmoNameTimer = setTimeout(() => {
      state.ksmoNameFilter = els.ksmoNameFilter.value.trim();
      renderItems();
    }, 120);
  });

  let itemFilterTimer = null;
  els.itemFilter?.addEventListener("input", () => {
    clearTimeout(itemFilterTimer);
    itemFilterTimer = setTimeout(() => {
      state.itemFilter = els.itemFilter.value.trim();
      renderItems();
    }, 120);
  });

  els.sort.addEventListener("change", () => {
    state.sort = els.sort.value;
    renderItems();
  });

  els.clearFacets.addEventListener("click", () => {
    state.facetFilters = {};
    renderItems();
  });

  els.facetFilters.addEventListener("click", (e) => {
    const clear = e.target.closest("[data-clear-facet]");
    if (clear) {
      delete state.facetFilters[clear.dataset.clearFacet];
      renderItems();
      return;
    }
    if (e.target.closest("[data-more-facets]")) {
      state.showAllFacets = !state.showAllFacets;
      renderFacetFilters();
    }
  });

  els.facetFilters.addEventListener("change", (e) => {
    const select = e.target.closest("select[data-facet]");
    if (!select) return;
    const code = select.dataset.facet;
    if (select.value) state.facetFilters[code] = select.value;
    else delete state.facetFilters[code];
    renderItems();
  });

  els.rows.addEventListener("click", (e) => {
    const ksmoRow = e.target.closest("tr[data-ksmo]");
    if (ksmoRow) {
      state.selectedKsmo = ksmoRow.dataset.ksmo;
      pickedKsmo = state.selectedKsmo;
      state.selectedKmat = null;
      [...els.rows.querySelectorAll("tr[data-ksmo]")].forEach((tr) => {
        tr.classList.toggle("active", tr.dataset.ksmo === state.selectedKsmo);
      });
      const entry = ksmoByCode(state.selectedKsmo);
      state.selectedKmat = entry?.items?.[0]?.kmat || null;
      renderKsmoMembers(entry);
      syncUrl();
      return;
    }
    const row = e.target.closest("tr[data-kmat]");
    if (!row) return;
    state.selectedKmat = row.dataset.kmat;
    [...els.rows.querySelectorAll("tr[data-kmat]")].forEach((tr) => {
      tr.classList.toggle("active", tr.dataset.kmat === state.selectedKmat);
    });
    pickedKmat = state.selectedKmat;
    const item = itemByKmat(state.selectedKmat);
    renderDetail(item);
    syncUrl();
  });

  els.memberRows?.addEventListener("click", (e) => {
    const goBtn = e.target.closest("[data-open-in-ksm]");
    if (goBtn) {
      openInKsmCatalog(goBtn.dataset.openInKsm);
      return;
    }
    const row = e.target.closest("tr[data-kmat]");
    if (!row) return;
    state.selectedKmat = row.dataset.kmat;
    [...els.memberRows.querySelectorAll("tr[data-kmat]")].forEach((tr) => {
      tr.classList.toggle("active", tr.dataset.kmat === state.selectedKmat);
    });
    pickedKmat = state.selectedKmat;
    syncUrl();
  });

  els.detail.addEventListener("click", (e) => {
    const copyEl = e.target.closest("[data-copy]");
    if (copyEl) {
      e.preventDefault();
      e.stopPropagation();
      copyToClipboard(copyEl.dataset.copy, copyEl);
      return;
    }
    const charBtn = e.target.closest("[data-filter-char]");
    if (charBtn) {
      toggleCharFilter(charBtn.dataset.filterChar);
      return;
    }
    const ksmoBtn = e.target.closest("[data-open-ksmo]");
    if (ksmoBtn) {
      openKsmo(ksmoBtn.dataset.openKsmo);
      return;
    }
    const kmatBtn = e.target.closest("[data-open-kmat]");
    if (kmatBtn) openKmat(kmatBtn.dataset.openKmat);
  });

  // наведення на фасет або шматок назви підсвічує всю пару
  const setSegHighlight = (seg, on) => {
    els.detail
      .querySelectorAll(`[data-seg="${seg}"]`)
      .forEach((el) => el.classList.toggle("is-hl", on));
  };
  els.detail.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-seg]");
    if (el) setSegHighlight(el.dataset.seg, true);
  });
  els.detail.addEventListener("mouseout", (e) => {
    const el = e.target.closest("[data-seg]");
    if (el && !el.contains(e.relatedTarget)) setSegHighlight(el.dataset.seg, false);
  });
  els.detail.addEventListener("focusin", (e) => {
    const el = e.target.closest("[data-seg]");
    if (el) setSegHighlight(el.dataset.seg, true);
  });
  els.detail.addEventListener("focusout", (e) => {
    const el = e.target.closest("[data-seg]");
    if (el) setSegHighlight(el.dataset.seg, false);
  });

  els.detail.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target.closest("[data-copy]")) return;
    const openEl = e.target.closest("[data-open-ksmo], [data-open-kmat]");
    if (!openEl || e.target !== openEl) return;
    e.preventDefault();
    if (openEl.dataset.openKsmo) openKsmo(openEl.dataset.openKsmo);
    else if (openEl.dataset.openKmat) openKmat(openEl.dataset.openKmat);
  });

  loadData().catch((err) => {
    els.loader.querySelector("strong").textContent = "Помилка завантаження";
    els.loader.querySelector("p").textContent = String(err.message || err);
  });
})();
