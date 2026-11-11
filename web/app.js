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
    ksmoStatus: "",
    ksmoNameFilter: "",
    itemStatus: "",
    sort: "name",
    facetFilters: {},
    selectedKmat: null,
    showCodes: false,
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    loader: $("loader"),
    search: $("search"),
    searchClear: $("search-clear"),
    showCodes: $("show-codes"),
    steps: $("steps"),
    homeTitle: $("home-title"),
    homeMeta: $("home-meta"),
    categoryGrid: $("category-grid"),
    viewHome: $("view-home"),
    viewGroups: $("view-groups"),
    viewItems: $("view-items"),
    groupsTitle: $("groups-title"),
    groupsSub: $("groups-sub"),
    groupFilter: $("group-filter"),
    ksmoStatusWrap: $("ksmo-status-wrap"),
    ksmoStatus: $("ksmo-status"),
    groupGrid: $("group-grid"),
    brandHome: $("brand-home"),
    backHome: $("back-to-home"),
    backGroups: $("back-to-groups"),
    crumbs: $("crumbs"),
    itemsTitle: $("items-title"),
    itemsSub: $("items-sub"),
    sort: $("sort"),
    itemStatus: $("item-status"),
    itemStatusWrap: $("item-status-wrap"),
    resultCount: $("result-count"),
    filters: $("filters"),
    facetFilters: $("facet-filters"),
    clearFacets: $("clear-facets"),
    rows: $("rows"),
    empty: $("empty"),
    detail: $("detail"),
    mainThead: $("main-thead"),
    mainTableLabel: $("main-table-label"),
    ksmoPanelFilters: $("ksmo-panel-filters"),
    ksmoNameFilter: $("ksmo-name-filter"),
    ksmoPanelStatus: $("ksmo-panel-status"),
    membersWrap: $("members-wrap"),
    memberPanelFilters: $("member-panel-filters"),
    memberStatus: $("member-status"),
    memberRows: $("member-rows"),
    membersEmpty: $("members-empty"),
  };

  const THEAD_KSM = `
    <tr>
      <th class="col-status">Статус</th>
      <th>Що це</th>
      <th>Тип / група</th>
      <th class="col-int">Код 1С</th>
      <th class="codes-only">Код позиції</th>
      <th>Од.</th>
      <th title="Кількість характеристик у позиції">Хар.</th>
    </tr>`;

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
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M5.5 2A1.5 1.5 0 0 0 4 3.5V4h-.5A1.5 1.5 0 0 0 2 5.5v7A1.5 1.5 0 0 0 3.5 14h6a1.5 1.5 0 0 0 1.5-1.5V12h.5a1.5 1.5 0 0 0 1.5-1.5v-7A1.5 1.5 0 0 0 12 2H5.5zm5 9H11v.5a.5.5 0 0 1-.5.5h-6a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5H5v.5A1.5 1.5 0 0 0 6.5 6h5A1.5 1.5 0 0 0 13 4.5V4h.5a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5h-.5zM6.5 3h5a.5.5 0 0 1 .5.5V4H6v-.5a.5.5 0 0 1 .5-.5z"/></svg>
      <svg class="copy-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M6.7 11.3 3.4 8l1.2-1.2 2.1 2.1 4.7-4.7L12.6 5.4z"/></svg>
    </button>`;
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
    clearTimeout(btn._copyTimer);
    btn._copyTimer = setTimeout(() => {
      btn.classList.remove("is-copied");
      btn.title = "Копіювати";
    }, 1200);
  }

  const normalize = (value) =>
    String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

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
    return `<span class="pill ${cls}">${STATUS_LABEL[status] || status}</span>`;
  }

  function categoryByCode(code) {
    return state.data.categories.find((c) => c.code === code) || null;
  }
  function groupByCode(code) {
    return state.data.groups.find((g) => g.code === code) || null;
  }
  function ksmoByCode(code) {
    return (state.data.ksmo_entries || []).find((e) => e.code === code) || null;
  }
  function itemByKmat(kmat) {
    return state.data.items.find((i) => i.kmat === kmat) || null;
  }

  function updateStepLabels() {
    const isKsmo = state.mode === "ksmo";
    const map = isKsmo
      ? { home: "Категорія", groups: "KSMO", items: "KSMO → KSM" }
      : { home: "Категорія", groups: "Тип", items: "Позиція" };
    els.steps.querySelectorAll("[data-step-label]").forEach((el) => {
      el.textContent = map[el.dataset.stepLabel] || el.textContent;
    });

    // KSMO: лише 2 кроки (категорія → таблиця), без окремого «типу»
    const groupsStep = els.steps.querySelector('[data-goto="groups"]');
    const itemsStep = els.steps.querySelector('[data-goto="items"]');
    if (groupsStep && itemsStep) {
      groupsStep.hidden = isKsmo;
      const arrow = groupsStep.nextElementSibling;
      if (arrow?.classList.contains("step-arrow")) arrow.hidden = isKsmo;
      const itemsNum = itemsStep.querySelector(".step-num");
      if (itemsNum) itemsNum.textContent = isKsmo ? "2" : "3";
    }
  }

  function updateModeButtons() {
    document.querySelectorAll(".mode-btn").forEach((btn) => {
      const on = btn.dataset.mode === state.mode;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
    document.body.classList.toggle("mode-ksmo", state.mode === "ksmo");
  }

  async function loadCatalogJson() {
    // Prefer gzip (~1.5 MB) for GitHub Pages / slow networks; fall back to raw JSON.
    const gzRes = await fetch("./data/catalog.min.json.gz");
    if (gzRes.ok && typeof DecompressionStream !== "undefined") {
      const stream = gzRes.body.pipeThrough(new DecompressionStream("gzip"));
      return JSON.parse(await new Response(stream).text());
    }
    const res = await fetch("./data/catalog.min.json");
    if (!res.ok) throw new Error(`Не вдалося завантажити дані: ${res.status}`);
    return res.json();
  }

  async function loadData() {
    state.data = await loadCatalogJson();
    els.loader.classList.add("hidden");
    updateModeButtons();
    updateStepLabels();
    renderHome();
    showView("home");
  }

  function renderHome() {
    const isKsmo = state.mode === "ksmo";
    const ksmoTotal = (state.data.ksmo_entries || []).length;
    const m = state.data.meta;

    els.homeTitle.textContent = isKsmo ? "Оберіть категорію KSMO" : "Оберіть категорію";
    els.homeMeta.textContent = isKsmo
      ? `${ksmoTotal.toLocaleString("uk-UA")} кодів 1С · ${m.categories} категорій`
      : `${m.items.toLocaleString("uk-UA")} позицій · ${m.categories} категорій · ${m.groups} типів`;

    els.categoryGrid.innerHTML = state.data.categories
      .map((c) => {
        const count = isKsmo ? c.ksmo_count || 0 : c.count;
        if (isKsmo && !count) return "";
        const sample = isKsmo
          ? (state.data.ksmo_entries || [])
              .filter((e) => e.category === c.code)
              .slice(0, 2)
              .map((e) => e.name)
              .join(", ")
          : state.data.groups
              .filter((g) => g.category === c.code)
              .slice(0, 2)
              .map((g) => g.name)
              .join(", ");
        return `
          <button type="button" class="cat-card" data-category="${escapeHtml(c.code)}">
            <div class="card-top">
              <div class="card-title">${escapeHtml(c.name)}</div>
              <div class="card-badges">
                <span class="card-prefix" title="${escapeHtml(c.code)}">${escapeHtml(c.code)}</span>
                <div class="card-count">${count}</div>
              </div>
            </div>
            <div class="card-hint">${escapeHtml(c.hint || "")}</div>
            <div class="card-sample">Наприклад: ${escapeHtml(sample || "—")}</div>
          </button>
        `;
      })
      .filter(Boolean)
      .join("");
  }

  function filteredKsmoEntries() {
    const q = normalize(state.ksmoNameFilter || state.groupFilter || state.query);
    return (state.data.ksmo_entries || []).filter((e) => {
      if (state.category && e.category !== state.category) return false;
      if (state.ksmoStatus && e.status !== state.ksmoStatus) return false;
      if (!q) return true;
      // лише назва / код KSMO зліва — без пошуку по підвʼязаних KSM
      const hay = normalize([e.code, e.name].join(" "));
      return q.split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
    });
  }

  function sortedKsmoEntries(entries) {
    const list = entries.slice();
    if (state.sort === "kmat") {
      return list.sort((a, b) => a.code.localeCompare(b.code, "uk"));
    }
    if (state.sort === "group") {
      return list.sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name, "uk")
      );
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, "uk"));
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
        if (state.sort === "kmat") return a.kmat.localeCompare(b.kmat, "uk");
        if (state.sort === "group") {
          return (
            a.group_name.localeCompare(b.group_name, "uk") ||
            a.name.localeCompare(b.name, "uk")
          );
        }
        return a.name.localeCompare(b.name, "uk");
      });
  }

  function setItemsLayout(isKsmo) {
    if (els.mainThead) els.mainThead.innerHTML = isKsmo ? THEAD_KSMO : THEAD_KSM;
    if (els.mainTableLabel) els.mainTableLabel.hidden = !isKsmo;
    if (els.ksmoPanelFilters) els.ksmoPanelFilters.hidden = !isKsmo;
    if (els.memberPanelFilters) els.memberPanelFilters.hidden = !isKsmo;
    if (els.membersWrap) els.membersWrap.hidden = !isKsmo;
    if (els.detail) els.detail.hidden = isKsmo;
    if (els.itemStatusWrap) els.itemStatusWrap.hidden = isKsmo;
  }

  function renderKsmoMembers(entry) {
    if (!els.memberRows) return;
    if (!entry) {
      els.memberRows.innerHTML = "";
      if (els.membersEmpty) {
        els.membersEmpty.hidden = false;
        els.membersEmpty.textContent =
          "Оберіть KSMO зліва — тут зʼявляться підвʼязані найменування KSM.";
      }
      return;
    }
    const members = ksmoMemberItems(entry);
    if (els.membersEmpty) {
      els.membersEmpty.hidden = members.length > 0;
      els.membersEmpty.textContent = "У цього KSMO немає підвʼязаних KSM.";
    }
    els.memberRows.innerHTML = members
      .map((m) => {
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
          </tr>`;
      })
      .join("");
  }

  function renderGroups() {
    const cat = categoryByCode(state.category);
    const isKsmo = state.mode === "ksmo";
    els.ksmoStatusWrap.hidden = !isKsmo;
    els.groupFilter.placeholder = isKsmo ? "Фільтр KSMO / код 1С…" : "Фільтр типів…";

    if (isKsmo) {
      els.groupsTitle.textContent = cat ? cat.name : "KSMO";
      els.groupsSub.textContent = cat
        ? `коди 1С у розділі · ${STATUS_LABEL.active}/${STATUS_LABEL.mixed}/${STATUS_LABEL.cancelled}`
        : "Оберіть запис KSMO";

      const entries = filteredKsmoEntries().sort(
        (a, b) => b.count - a.count || a.name.localeCompare(b.name, "uk")
      );
      els.groupGrid.innerHTML = entries
        .map((e) => {
          const sample = e.items?.[0]
            ? `<div class="card-sample">KSM: ${escapeHtml(e.items[0].name)}</div>`
            : "";
          return `
          <button type="button" class="group-card" data-ksmo="${escapeHtml(e.code)}">
            <div class="card-top">
              <div class="card-title">${escapeHtml(e.name)}</div>
              <div class="card-badges">
                <span class="card-prefix" title="Код 1С">${escapeHtml(e.code)}</span>
                <div class="card-count">${e.count}</div>
              </div>
            </div>
            <div class="card-hint">${statusPill(e.status)} · живих ${e.active_count} · скасованих ${e.cancelled_count}</div>
            ${sample}
          </button>`;
        })
        .join("");
      if (!entries.length) {
        els.groupGrid.innerHTML = `<div class="empty">Немає KSMO за цим фільтром</div>`;
      }
      return;
    }

    els.groupsTitle.textContent = cat ? cat.name : "Типи";
    els.groupsSub.textContent = cat
      ? `${cat.hint} · оберіть конкретний тип`
      : "Оберіть тип номенклатури";

    const q = normalize(state.groupFilter);
    const groups = state.data.groups.filter((g) => {
      if (state.category && g.category !== state.category) return false;
      if (!q) return true;
      return normalize(
        [g.name, g.raw_name, g.technical_name, g.code, ...(g.sample_names || [])].join(" ")
      ).includes(q);
    });

    els.groupGrid.innerHTML = groups
      .map((g) => {
        const sample = g.sample_names?.[0]
          ? `<div class="card-sample">Приклад: ${escapeHtml(g.sample_names[0])}</div>`
          : "";
        const tech = g.technical_name
          ? `<div class="card-tech">У SmartTender: ${escapeHtml(g.technical_name)}</div>`
          : "";
        return `
          <button type="button" class="group-card" data-group="${escapeHtml(g.code)}">
            <div class="card-top">
              <div class="card-title">${escapeHtml(g.name)}</div>
              <div class="card-badges">
                <span class="card-prefix" title="${escapeHtml(g.code)}">${escapeHtml(g.code)}</span>
                <div class="card-count">${g.count}</div>
              </div>
            </div>
            <div class="card-hint">${g.facet_codes.length} властивостей для уточнення</div>
            ${sample}
            ${tech}
          </button>
        `;
      })
      .join("");

    if (!groups.length) {
      els.groupGrid.innerHTML = `<div class="empty">Немає типів за цим фільтром</div>`;
    }
  }

  function itemMatches(item, q) {
    if (!q) return true;
    const hay = normalize(
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
    return q.split(/\s+/).filter(Boolean).every((token) => hay.includes(token));
  }

  function filteredItems() {
    const q = normalize(state.query);
    let list = state.data.items;

    if (state.mode === "ksmo" && state.selectedKsmo) {
      list = list.filter((i) => i.int_code === state.selectedKsmo);
    } else {
      if (state.category) list = list.filter((i) => i.category === state.category);
      if (state.group) list = list.filter((i) => i.group === state.group);
    }

    const facetEntries = Object.entries(state.facetFilters).filter(([, v]) => v);
    if (facetEntries.length) {
      list = list.filter((item) =>
        facetEntries.every(([code, value]) =>
          item.chars.some(
            (c) => c.code === code && String(c.value_code ?? c.value ?? "") === value
          )
        )
      );
    }
    if (state.itemStatus === "cancelled") {
      list = list.filter((item) => !!item.cancelled);
    } else if (state.itemStatus === "active") {
      list = list.filter((item) => !item.cancelled);
    }
    if (q && !(state.mode === "ksmo" && state.selectedKsmo)) {
      list = list.filter((item) => itemMatches(item, q));
    } else if (q && state.mode === "ksmo" && state.selectedKsmo) {
      list = list.filter((item) => itemMatches(item, q));
    }

    const sorter = {
      name: (a, b) => a.name.localeCompare(b.name, "uk"),
      kmat: (a, b) => a.kmat.localeCompare(b.kmat, "uk"),
      group: (a, b) =>
        a.group_name.localeCompare(b.group_name, "uk") || a.name.localeCompare(b.name, "uk"),
    }[state.sort];
    return list.slice().sort(sorter);
  }

  function renderFacetFilters() {
    if (state.mode === "ksmo") {
      els.filters.hidden = true;
      els.facetFilters.innerHTML = "";
      return;
    }

    const group = groupByCode(state.group);
    if (!group || !group.facet_codes.length || state.query) {
      if (!group || !group.facet_codes.length) {
        els.filters.hidden = true;
        els.facetFilters.innerHTML = "";
        return;
      }
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

    const primary = codes.slice(0, 4);
    const extra = codes.slice(4);

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

    const renderSelect = (code) => {
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
        .sort((a, b) => String(a.value || "").localeCompare(String(b.value || ""), "uk"));
      const byCount = withLocalCount
        .slice()
        .sort(
          (a, b) =>
            b.count - a.count || String(a.value || "").localeCompare(String(b.value || ""), "uk")
        );
      let limited = byName;
      if (byName.length > 80) {
        const top = byCount.slice(0, 60);
        const keys = new Set(top.map((v) => String(v.value_code ?? v.value ?? "")));
        if (selected && !keys.has(selected)) {
          const current = byName.find((v) => String(v.value_code ?? v.value ?? "") === selected);
          if (current) top.push(current);
        }
        limited = top.sort((a, b) => String(a.value || "").localeCompare(String(b.value || ""), "uk"));
      }
      const options = limited
        .map((v) => {
          const key = String(v.value_code ?? v.value ?? "");
          return `<option value="${escapeHtml(key)}" ${selected === key ? "selected" : ""}>${escapeHtml(`${v.value ?? "—"} (${v.count})`)}</option>`;
        })
        .join("");
      const note =
        byName.length > 80
          ? `<span class="tiny muted">Показано часті значення · усього ${byName.length}</span>`
          : "";
      return `
        <label class="facet-filter">
          <span>${escapeHtml(facet.name)}</span>
          <select data-facet="${escapeHtml(code)}">
            <option value="">Будь-яке значення</option>
            ${options}
          </select>
          ${note}
        </label>`;
    };

    els.filters.hidden = false;
    els.facetFilters.innerHTML = `
      ${primary.map(renderSelect).join("")}
      ${
        extra.length
          ? `<details class="more-facets"><summary>Ще властивості (${extra.length})</summary><div class="facet-filters">${extra
              .map(renderSelect)
              .join("")}</div></details>`
          : ""
      }
    `;
  }

  function renderKsmoDetail(entry) {
    if (!entry) {
      els.detail.innerHTML = `
        <div class="detail-empty">
          <strong>Картка KSMO</strong>
          <p>Оберіть код 1С зліва — побачите всі повʼязані KSM.</p>
        </div>`;
      return;
    }
    const members = entry.items || [];
    els.detail.innerHTML = `
      <div class="detail-name-block detail-name-block--ksmo">
        <div class="detail-name-head">
          <div class="chars-title">Найменування KSMO</div>
          <div class="detail-pills">
            ${statusPill(entry.status)}
            <span class="pill pill-neutral">${entry.count} KSM</span>
          </div>
        </div>
        <div class="detail-name-row">
          <h2>${escapeHtml(entry.name)}</h2>
          ${copyBtn(entry.name)}
        </div>
        <div class="detail-code-row">
          <span class="detail-code-label">Код 1С</span>
          <span class="detail-code-value mono">${escapeHtml(entry.code)}</span>
          ${copyBtn(entry.code)}
        </div>
      </div>
      <dl class="meta-grid">
        <dt>Категорія</dt><dd>${escapeHtml(entry.category_name || "—")}</dd>
        <dt>Живих</dt><dd>${entry.active_count}</dd>
        <dt>Скасованих</dt><dd>${entry.cancelled_count}</dd>
      </dl>
      <div class="chars-title">Повʼязані KSM (${members.length})</div>
      <div class="related-list">
        ${members
          .map(
            (m) => `
          <div class="related-chip ${m.kmat === state.selectedKmat ? "active" : ""}" data-open-kmat="${escapeHtml(m.kmat)}" role="button" tabindex="0">
            <div class="related-top">
              <span class="related-kind">${escapeHtml(m.group_name || "KSM")}</span>
              ${statusPill(null, !!m.cancelled)}
            </div>
            <div class="related-name-row">
              <div class="related-name">${escapeHtml(m.name)}</div>
              ${copyBtn(m.name)}
            </div>
            <div class="related-kmat mono codes-only copy-inline">
              <span>${escapeHtml(m.kmat)}</span>
              ${copyBtn(m.kmat)}
            </div>
          </div>`
          )
          .join("")}
      </div>
    `;
  }

  function renderDetail(item) {
    if (!item) {
      if (state.mode === "ksmo" && state.selectedKsmo) {
        renderKsmoDetail(ksmoByCode(state.selectedKsmo));
        return;
      }
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

    const ctorParts = [
      `<div class="ctor-part"><span class="ctor-label">Тип</span><strong>${escapeHtml(item.group_name)}</strong></div>`,
      ...chars.map(
        (c) =>
          `<span class="ctor-plus">+</span><div class="ctor-part"><span class="ctor-label">${escapeHtml(c.name)}</span><strong>${escapeHtml(c.value ?? "—")}</strong></div>`
      ),
    ].join("");

    const ksmo = item.int_code ? ksmoByCode(item.int_code) : null;
    const ksmoName = ksmo?.name || "";
    const ksmoBlock = item.int_code
      ? `
      <div class="detail-name-block detail-name-block--ksmo ksmo-link" data-open-ksmo="${escapeHtml(item.int_code)}" role="button" tabindex="0" title="Відкрити KSMO">
        <div class="detail-name-head">
          <div class="chars-title">Найменування KSMO</div>
          <div class="detail-pills">
            ${ksmo ? statusPill(ksmo.status) : `<span class="pill pill-neutral">немає в довіднику</span>`}
          </div>
        </div>
        <div class="detail-name-row">
          <h2>${escapeHtml(ksmoName || "Код є в позиції, але запису KSMO не знайдено")}</h2>
          ${ksmoName ? copyBtn(ksmoName) : ""}
        </div>
        <div class="detail-code-row">
          <span class="detail-code-label">Код 1С</span>
          <span class="detail-code-value mono">${escapeHtml(item.int_code)}</span>
          ${copyBtn(item.int_code)}
          <span class="ksmo-link-go" aria-hidden="true">Відкрити</span>
        </div>
      </div>`
      : `
      <div class="detail-name-block detail-name-block--empty">
        <div class="detail-name-head">
          <div class="chars-title">Найменування KSMO</div>
        </div>
        <div class="muted tiny">Немає коду 1С</div>
      </div>`;

    els.detail.innerHTML = `
      <div class="detail-name-block">
        <div class="detail-name-head">
          <div class="chars-title">Найменування KSM</div>
          <div class="detail-pills">
            ${statusPill(null, !!item.cancelled)}
          </div>
        </div>
        <div class="detail-name-row">
          <h2>${escapeHtml(item.name)}</h2>
          ${copyBtn(item.name)}
        </div>
        <div class="detail-code-row">
          <span class="detail-code-label">Код позиції</span>
          <span class="detail-code-value mono">${escapeHtml(item.kmat)}</span>
          ${copyBtn(item.kmat)}
        </div>
      </div>

      ${ksmoBlock}

      <div class="detail-ctor">
        <div class="chars-title">З чого зібрана назва</div>
        <div class="muted tiny">Тип + властивості коду.</div>
        <div class="constructor">${ctorParts}</div>
      </div>

      <dl class="meta-grid">
        <dt>Категорія</dt><dd>${escapeHtml(item.category_name)}</dd>
        <dt>Тип</dt><dd>${escapeHtml(item.group_name)}</dd>
        <dt>Одиниця</dt><dd>${escapeHtml(item.unit || "—")}</dd>
        <dt>ГОСТ/ДСТУ</dt><dd>${escapeHtml(item.gost || "—")}</dd>
        <dt>Коротко</dt><dd>${escapeHtml(item.short || "—")}</dd>
      </dl>

      <div class="chars-title">Усі властивості (${chars.length})</div>
      <div class="char-list">
        ${
          chars.length
            ? chars
                .map(
                  (c) => `
              <div class="char-item">
                <div class="char-top">
                  <span class="char-name">${escapeHtml(c.name)}</span>
                  <span class="char-code">${escapeHtml(c.code)}${c.value_code != null ? " / " + escapeHtml(c.value_code) : ""}</span>
                </div>
                <div class="char-value">${escapeHtml(c.value ?? "—")}</div>
              </div>`
                )
                .join("")
            : `<div class="muted">У цієї позиції немає додаткових властивостей</div>`
        }
      </div>
    `;
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
      els.crumbs.innerHTML = `Пошук`;
      els.itemsTitle.textContent = `«${state.query}»`;
      els.itemsSub.textContent = "з усього каталогу";
    } else if (group) {
      // crumbs — лише предки; поточну назву показує h1
      els.crumbs.innerHTML = `
        <button type="button" data-crumb="home">Усі категорії</button> /
        <button type="button" data-crumb="category">${escapeHtml(cat?.name || group.category_name)}</button>
      `;
      els.itemsTitle.textContent = group.name;
      els.itemsSub.textContent = "";
    } else if (cat) {
      els.crumbs.innerHTML = `
        <button type="button" data-crumb="home">Усі категорії</button>
      `;
      els.itemsTitle.textContent = cat.name;
      els.itemsSub.textContent = "усі позиції розділу";
    }

    renderFacetFilters();
    const items = filteredItems();
    const limit = 300;
    const slice = items.slice(0, limit);

    els.resultCount.textContent = items.length.toLocaleString("uk-UA");
    els.empty.hidden = slice.length > 0;
    els.rows.innerHTML = slice
      .map((item) => {
        const active = item.kmat === state.selectedKmat ? "active" : "";
        return `
          <tr class="${active}${item.cancelled ? " is-cancelled" : ""}" data-kmat="${escapeHtml(item.kmat)}">
            <td class="col-status">${statusPill(null, !!item.cancelled)}</td>
            <td>
              <div class="name-cell">${escapeHtml(item.name)}</div>
              ${item.gost ? `<div class="sub">${escapeHtml(item.gost)}</div>` : ""}
              ${item.short && item.short !== item.name ? `<div class="sub">${escapeHtml(item.short)}</div>` : ""}
            </td>
            <td>
              <div class="name-cell" style="font-weight:600">${escapeHtml(item.group_name)}</div>
              <div class="sub codes-only mono">${escapeHtml(item.group)}</div>
            </td>
            <td class="col-int mono">${item.int_code ? escapeHtml(item.int_code) : "—"}</td>
            <td class="mono codes-only">${escapeHtml(item.kmat)}</td>
            <td>${escapeHtml(item.unit || "—")}</td>
            <td><span class="badge">${item.chars.length}</span></td>
          </tr>`;
      })
      .join("");

    if (items.length > limit) {
      els.rows.insertAdjacentHTML(
        "beforeend",
        `<tr><td colspan="7" class="muted">Показано перші ${limit} з ${items.length}. Уточніть пошук або властивості.</td></tr>`
      );
    }

    if (state.selectedKmat && !items.some((i) => i.kmat === state.selectedKmat)) {
      state.selectedKmat = items[0]?.kmat || null;
    } else if (!state.selectedKmat && items[0]) {
      state.selectedKmat = items[0].kmat;
    }

    const selected = items.find((i) => i.kmat === state.selectedKmat) || null;
    if (selected) renderDetail(selected);
    else renderDetail(null);
  }

  function renderKsmoBrowse(cat) {
    els.filters.hidden = true;
    els.facetFilters.innerHTML = "";

    const entries = sortedKsmoEntries(filteredKsmoEntries());
    const limit = 400;
    const slice = entries.slice(0, limit);

    if (state.query && !state.category) {
      els.crumbs.innerHTML = `Пошук KSMO`;
      els.itemsTitle.textContent = `«${state.query}»`;
      els.itemsSub.textContent = "зліва — коди 1С, справа — підвʼязані KSM";
    } else if (cat) {
      // crumbs — лише предки; поточну назву показує h1
      els.crumbs.innerHTML = `
        <button type="button" data-crumb="home">Усі категорії</button>
      `;
      els.itemsTitle.textContent = cat.name;
      els.itemsSub.textContent = "довідник KSMO · оберіть код зліва";
    } else {
      els.crumbs.innerHTML = `KSMO`;
      els.itemsTitle.textContent = "Довідник KSMO";
      els.itemsSub.textContent = "коди інтеграції 1С";
    }

    els.resultCount.textContent = entries.length.toLocaleString("uk-UA");
    els.empty.hidden = slice.length > 0;
    els.rows.innerHTML = slice
      .map((e) => {
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
      })
      .join("");

    if (entries.length > limit) {
      els.rows.insertAdjacentHTML(
        "beforeend",
        `<tr><td colspan="4" class="muted">Показано перші ${limit} з ${entries.length}. Уточніть пошук.</td></tr>`
      );
    }

    if (state.selectedKsmo && !entries.some((e) => e.code === state.selectedKsmo)) {
      state.selectedKsmo = slice[0]?.code || null;
      state.selectedKmat = null;
    } else if (!state.selectedKsmo && slice[0]) {
      state.selectedKsmo = slice[0].code;
      state.selectedKmat = null;
    }

    const selected = state.selectedKsmo ? ksmoByCode(state.selectedKsmo) : null;
    if (selected && !state.selectedKmat) {
      state.selectedKmat = selected.items?.[0]?.kmat || null;
    }
    renderKsmoMembers(selected);
  }

  function updateSteps() {
    const buttons = [...els.steps.querySelectorAll(".step")];
    const [homeBtn, groupsBtn, itemsBtn] = buttons;

    buttons.forEach((b) => b.classList.remove("active", "done"));
    homeBtn.disabled = false;

    if (state.mode === "ksmo") {
      groupsBtn.disabled = true;
      itemsBtn.disabled = !(
        state.view === "items" ||
        state.category ||
        state.selectedKsmo ||
        state.query
      );
      if (state.view === "home") {
        homeBtn.classList.add("active");
      } else {
        homeBtn.classList.add("done");
        itemsBtn.classList.add("active");
        itemsBtn.disabled = false;
      }
      return;
    }

    groupsBtn.disabled = !(state.category || state.group || state.view === "groups");
    itemsBtn.disabled = !(state.view === "items" || state.group || state.query);

    if (state.view === "home") {
      homeBtn.classList.add("active");
    } else if (state.view === "groups") {
      homeBtn.classList.add("done");
      groupsBtn.classList.add("active");
      groupsBtn.disabled = false;
    } else {
      homeBtn.classList.add("done");
      if (state.category || state.group) {
        groupsBtn.classList.add("done");
        groupsBtn.disabled = false;
      }
      itemsBtn.classList.add("active");
      itemsBtn.disabled = false;
    }
  }

  function showView(view) {
    state.view = view;
    els.viewHome.hidden = view !== "home";
    els.viewGroups.hidden = view !== "groups";
    els.viewItems.hidden = view !== "items";
    updateSteps();

    if (view === "home") renderHome();
    if (view === "groups") renderGroups();
    if (view === "items") renderItems();
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
    updateStepLabels();
    state.group = code;
    state.category = g.category;
    state.selectedKsmo = null;
    state.facetFilters = {};
    state.selectedKmat = null;
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
    updateStepLabels();
    state.selectedKsmo = code;
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
    if (state.mode === "ksmo" && item.int_code) {
      if (state.selectedKsmo !== item.int_code) {
        openKsmo(item.int_code, { kmat, keepQuery: true });
        return;
      }
      renderItems();
      return;
    }
    // у режимі KSM — відкрити групу позиції
    state.group = item.group;
    state.category = item.category;
    state.selectedKsmo = null;
    showView("items");
  }

  function setMode(mode) {
    if (state.mode === mode) return;
    state.mode = mode;
    state.category = null;
    state.group = null;
    state.selectedKsmo = null;
    state.ksmoStatus = "";
    if (els.ksmoStatus) els.ksmoStatus.value = "";
    if (els.ksmoPanelStatus) els.ksmoPanelStatus.value = "";
    state.ksmoNameFilter = "";
    if (els.ksmoNameFilter) els.ksmoNameFilter.value = "";
    state.itemStatus = "";
    if (els.itemStatus) els.itemStatus.value = "";
    if (els.memberStatus) els.memberStatus.value = "";
    resetNavSoft();
    state.query = "";
    els.search.value = "";
    els.searchClear.hidden = true;
    setItemsLayout(mode === "ksmo");
    updateModeButtons();
    updateStepLabels();
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

  // events
  document.querySelector(".mode-switch")?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (btn) setMode(btn.dataset.mode);
  });

  els.categoryGrid.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-category]");
    if (btn) openCategory(btn.dataset.category);
  });

  els.groupGrid.addEventListener("click", (e) => {
    const ksmoBtn = e.target.closest("[data-ksmo]");
    if (ksmoBtn) {
      openKsmo(ksmoBtn.dataset.ksmo);
      return;
    }
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

  els.crumbs.addEventListener("click", (e) => {
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

  els.steps.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-goto]");
    if (!btn || btn.disabled) return;
    const goto = btn.dataset.goto;
    if (goto === "home") {
      goHome();
    } else if (goto === "groups") {
      if (state.mode === "ksmo") {
        if (state.category || state.query) showView("items");
      } else if (state.category) showView("groups");
    } else if (goto === "items") {
      if (state.mode === "ksmo") {
        if (state.category || state.query || state.selectedKsmo) showView("items");
      } else if (state.group || state.query) showView("items");
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

  els.groupFilter.addEventListener("input", () => {
    state.groupFilter = els.groupFilter.value.trim();
    renderGroups();
  });

  els.ksmoStatus?.addEventListener("change", () => {
    state.ksmoStatus = els.ksmoStatus.value;
    if (els.ksmoPanelStatus) els.ksmoPanelStatus.value = state.ksmoStatus;
    if (state.mode === "ksmo" && state.view === "items") renderItems();
    else renderGroups();
  });

  els.ksmoPanelStatus?.addEventListener("change", () => {
    state.ksmoStatus = els.ksmoPanelStatus.value;
    if (els.ksmoStatus) els.ksmoStatus.value = state.ksmoStatus;
    renderItems();
  });

  let ksmoNameTimer = null;
  els.ksmoNameFilter?.addEventListener("input", () => {
    clearTimeout(ksmoNameTimer);
    ksmoNameTimer = setTimeout(() => {
      state.ksmoNameFilter = els.ksmoNameFilter.value.trim();
      renderItems();
    }, 120);
  });

  els.sort.addEventListener("change", () => {
    state.sort = els.sort.value;
    renderItems();
  });

  els.itemStatus?.addEventListener("change", () => {
    state.itemStatus = els.itemStatus.value;
    if (els.memberStatus) els.memberStatus.value = state.itemStatus;
    renderItems();
  });

  els.memberStatus?.addEventListener("change", () => {
    state.itemStatus = els.memberStatus.value;
    if (els.itemStatus) els.itemStatus.value = state.itemStatus;
    renderItems();
  });

  els.clearFacets.addEventListener("click", () => {
    state.facetFilters = {};
    renderItems();
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
      state.selectedKmat = null;
      [...els.rows.querySelectorAll("tr[data-ksmo]")].forEach((tr) => {
        tr.classList.toggle("active", tr.dataset.ksmo === state.selectedKsmo);
      });
      const entry = ksmoByCode(state.selectedKsmo);
      state.selectedKmat = entry?.items?.[0]?.kmat || null;
      renderKsmoMembers(entry);
      return;
    }
    const row = e.target.closest("tr[data-kmat]");
    if (!row) return;
    state.selectedKmat = row.dataset.kmat;
    [...els.rows.querySelectorAll("tr[data-kmat]")].forEach((tr) => {
      tr.classList.toggle("active", tr.dataset.kmat === state.selectedKmat);
    });
    const item = itemByKmat(state.selectedKmat);
    renderDetail(item);
  });

  els.memberRows?.addEventListener("click", (e) => {
    const row = e.target.closest("tr[data-kmat]");
    if (!row) return;
    state.selectedKmat = row.dataset.kmat;
    [...els.memberRows.querySelectorAll("tr[data-kmat]")].forEach((tr) => {
      tr.classList.toggle("active", tr.dataset.kmat === state.selectedKmat);
    });
  });

  els.detail.addEventListener("click", (e) => {
    const copyEl = e.target.closest("[data-copy]");
    if (copyEl) {
      e.preventDefault();
      e.stopPropagation();
      copyToClipboard(copyEl.dataset.copy, copyEl);
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

  els.detail.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.target.closest("[data-copy]")) return;
    const openEl = e.target.closest("[data-open-ksmo], [data-open-kmat]");
    if (!openEl || e.target !== openEl) return;
    e.preventDefault();
    if (openEl.dataset.openKsmo) openKsmo(openEl.dataset.openKsmo);
    else if (openEl.dataset.openKmat) openKmat(openEl.dataset.openKmat);
  });

  els.showCodes.addEventListener("change", () => {
    state.showCodes = els.showCodes.checked;
    document.body.classList.toggle("show-codes", state.showCodes);
  });

  loadData().catch((err) => {
    els.loader.querySelector("strong").textContent = "Помилка завантаження";
    els.loader.querySelector("p").textContent = String(err.message || err);
  });
})();
