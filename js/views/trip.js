import { store } from "../state.js";
import { getTripItemName, getTripItemSource, getTagsForTripItem, getStoresForTripItem, escapeHtml, sortByCategory } from "../helpers.js";
import { renderItemTags } from "../components/tag-chips.js";
import { openModal, closeModal } from "../components/modal.js";

// Trip-local multi-select filter state
const activeFilters = new Set(); // values like "store:Costco" or "tag:Organic"

function toggleFilter(key) {
  if (activeFilters.has(key)) activeFilters.delete(key);
  else activeFilters.add(key);
}

function clearTripFilters() {
  activeFilters.clear();
}

function filterTripItems(items, state) {
  if (!activeFilters.size) return items;
  return items.filter(item => {
    const tags = getTagsForTripItem(state, item);
    const stores = getStoresForTripItem(state, item);
    for (const key of activeFilters) {
      if (key.startsWith("store:")) {
        if (stores.includes(key.slice(6))) return true;
      } else if (key.startsWith("tag:")) {
        if (tags.includes(key.slice(4))) return true;
      }
    }
    return false;
  });
}

function collectTripStores(items, state) {
  const storeSet = new Set();
  items.forEach(item => {
    getStoresForTripItem(state, item).forEach(s => storeSet.add(s));
  });
  return [...storeSet].sort();
}

function collectTripTags(items, state) {
  const tagSet = new Set();
  items.forEach(item => {
    getTagsForTripItem(state, item).forEach(t => tagSet.add(t));
  });
  return [...tagSet].sort();
}

function renderTripFilterBar(allStores, allTags) {
  if (!allStores.length && !allTags.length) return "";
  let chips = "";
  for (const s of allStores) {
    const key = `store:${s}`;
    const active = activeFilters.has(key) ? "active" : "";
    chips += `<span class="store-chip-filter ${active}" data-action="filter-chip" data-filter-key="${escapeHtml(key)}">${escapeHtml(s)}</span>`;
  }
  for (const t of allTags) {
    const key = `tag:${t}`;
    const active = activeFilters.has(key) ? "active" : "";
    chips += `<span class="tag-chip ${active}" data-action="filter-chip" data-filter-key="${escapeHtml(key)}">${escapeHtml(t)}</span>`;
  }
  return `<div class="tag-filter-bar">${chips}</div>`;
}

let tripSearchQuery = "";

export function renderTrip(state, container) {
  const scrollTop = container.scrollTop;
  const allItems = state.trip.items;
  const filtered = filterTripItems(allItems, state);
  const uncheckedUnsorted = filtered.filter(i => !i.checked);
  const unchecked = sortByCategory(uncheckedUnsorted, state.catalog);
  const checked = filtered.filter(i => i.checked);
  const hasChecked = allItems.some(i => i.checked);
  const allStores = collectTripStores(allItems, state);
  const allTags = collectTripTags(allItems, state);

  let html = `
    <div class="view-header">
      <h2>Shopping Trip</h2>
      <div class="view-header-actions">
        <button class="btn btn-secondary btn-small" data-action="import-csv">Import</button>
        <button class="btn btn-secondary btn-small" data-action="export-csv">Export</button>
        ${hasChecked ? `<button class="btn btn-secondary btn-small" data-action="clear-checked">Clear Done</button>` : ""}
        <button class="btn btn-primary btn-small" data-action="add-trip-item">+ Add</button>
        <input type="file" id="import-trip-csv-input" accept=".csv,text/csv" style="display:none">
      </div>
    </div>
    ${renderTripFilterBar(allStores, allTags)}
    <div class="search-row">
      <input class="input-field" type="text" id="trip-search-input" placeholder="Search items..." value="${escapeHtml(tripSearchQuery)}">
      ${tripSearchQuery ? `<button class="btn-icon search-clear" data-action="clear-search" title="Clear">&times;</button>` : ""}
    </div>`;

  const searchUnchecked = tripSearchQuery
    ? unchecked.filter(i => getTripItemName(state, i).toLowerCase().includes(tripSearchQuery.toLowerCase()))
    : unchecked;
  const searchChecked = tripSearchQuery
    ? checked.filter(i => getTripItemName(state, i).toLowerCase().includes(tripSearchQuery.toLowerCase()))
    : checked;

  if (!allItems.length) {
    html += `<div class="empty-state"><p>Your trip list is empty.<br>Add items from your lists or create a one-off item.</p></div>`;
  } else if (!searchUnchecked.length && !searchChecked.length) {
    html += `<div class="empty-state"><p>No items match your search.</p></div>`;
  } else {
    html += `<ul class="item-list">`;
    for (const item of searchUnchecked) {
      html += renderTripItem(state, item);
    }
    if (searchChecked.length && searchUnchecked.length) {
      html += `</ul><div class="section-separator">Completed</div><ul class="item-list">`;
    }
    for (const item of searchChecked) {
      html += renderTripItem(state, item);
    }
    html += `</ul>`;
  }

  container.innerHTML = html;
  container.scrollTop = scrollTop;
  attachTripEvents(container);
}

function renderTripItem(state, item) {
  const name = escapeHtml(getTripItemName(state, item));
  const source = getTripItemSource(state, item);
  const tags = getTagsForTripItem(state, item);
  const itemStores = getStoresForTripItem(state, item);
  const category = item.baseId ? (state.catalog[item.baseId]?.category || "") : "";
  const checkedClass = item.checked ? "checked" : "";
  const checkClass = item.checked ? "checked" : "";

  const storeChipsHtml = itemStores.map(s => `<span class="store-chip">${escapeHtml(s)}</span>`).join("");

  return `
    <li class="item-row ${checkedClass}" data-action="toggle-checked" data-id="${item.id}">
      <div class="check-box ${checkClass}">${item.checked ? "&#10003;" : ""}</div>
      <div class="item-content">
        <span class="item-name">${name}</span>
        ${source ? `<span class="item-source">(${escapeHtml(source)})</span>` : ""}
        <div class="item-meta">
          ${category ? `<span class="item-category">${escapeHtml(category)}</span>` : ""}
          ${storeChipsHtml}
          ${renderItemTags(tags)}
        </div>
      </div>
      <div class="item-actions">
        <button class="btn-icon danger" data-action="remove-trip-item" data-id="${item.id}" title="Remove">&times;</button>
      </div>
    </li>`;
}

function attachTripEvents(container) {
  if (container._tripEventsAttached) return;
  container._tripEventsAttached = true;
  container.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;

    switch (action) {
      case "toggle-checked":
        e.preventDefault();
        store.toggleTripItemChecked(target.dataset.id);
        break;
      case "remove-trip-item":
        e.stopPropagation();
        store.removeTripItem(target.dataset.id);
        break;
      case "clear-checked":
        store.clearCheckedTripItems();
        break;
      case "add-trip-item":
        openAddTripModal();
        break;
      case "clear-search":
        e.stopPropagation();
        tripSearchQuery = "";
        renderTrip(store.getState(), container);
        break;
      case "import-csv":
        document.getElementById("import-trip-csv-input")?.click();
        break;
      case "export-csv":
        exportTripCsv(store.getState());
        break;
      case "filter-chip":
        toggleFilter(target.dataset.filterKey);
        renderTrip(store.getState(), container);
        break;
    }
  });

  // Handle CSV file import
  container.addEventListener("change", async (e) => {
    if (e.target.id !== "import-trip-csv-input") return;
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const items = parseTripCsv(text);
      if (items.length) {
        store.importCatalogItems(items);
        const norm = s => s.trim().toLowerCase().replace(/\s+/g, " ");
        const catalogByName = new Map(
          Object.values(store.getState().catalog).map(it => [norm(it.name), it])
        );
        for (const item of items) {
          const cat = catalogByName.get(norm(item.name));
          if (cat) {
            store.addTripItemFromCatalog(cat.id);
          }
        }
      }
    } catch (err) {
      alert(err.message);
    }
    e.target.value = "";
  });

  container.addEventListener("input", (e) => {
    if (e.target.id === "trip-search-input") {
      tripSearchQuery = e.target.value;
      renderTrip(store.getState(), container);
      const input = document.getElementById("trip-search-input");
      if (input) {
        input.focus();
        input.selectionStart = input.selectionEnd = input.value.length;
      }
    }
  });
}

function openAddTripModal() {
  const state = store.getState();

  // Gather available collection items (not already in trip)
  const tripLinks = new Set(
    state.trip.items
      .filter(t => t.link)
      .map(t => `${t.link.collectionId}:${t.link.itemId}`)
  );

  let fromListsHtml = "";
  for (const col of Object.values(state.collections)) {
    const available = Object.values(col.items).filter(
      item => !tripLinks.has(`${col.id}:${item.id}`)
    );
    if (!available.length) continue;

    fromListsHtml += `<div class="modal-section-title">${escapeHtml(col.label)}</div>`;
    fromListsHtml += `<ul class="selectable-list">`;
    for (const item of available) {
      const catItem = state.catalog[item.baseId];
      if (!catItem) continue;
      const tags = renderItemTags(catItem.tags);
      fromListsHtml += `
        <li class="selectable-item" data-action="add-from-list" data-collection="${col.id}" data-item="${item.id}">
          <span class="item-name">${escapeHtml(catItem.name)}</span>
          ${tags ? `<span class="item-meta">${tags}</span>` : ""}
        </li>`;
    }
    fromListsHtml += `</ul>`;
  }

  const html = `
    <div class="modal-header">
      <h3>Add to Trip</h3>
      <button class="btn-icon" data-action="close">&times;</button>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">One-off item</div>
      <div class="input-row">
        <input class="input-field" type="text" id="oneoff-input" placeholder="Item name...">
        <button class="btn btn-primary" data-action="add-oneoff">Add</button>
      </div>
    </div>
    ${fromListsHtml ? `<div class="modal-section"><div class="modal-section-title">From your lists</div>${fromListsHtml}</div>` : ""}`;

  openModal(html, (action, data) => {
    switch (action) {
      case "close":
        closeModal();
        break;
      case "add-oneoff": {
        const input = document.getElementById("oneoff-input");
        const name = input.value.trim();
        if (name) {
          store.addTripItemOneOff(name);
          closeModal();
        }
        break;
      }
      case "add-from-list":
        store.addTripItemFromCollection(data.collection, data.item);
        closeModal();
        break;
    }
  });

  // Allow Enter key on one-off input
  requestAnimationFrame(() => {
    const input = document.getElementById("oneoff-input");
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const name = input.value.trim();
          if (name) {
            store.addTripItemOneOff(name);
            closeModal();
          }
        }
      });
    }
  });
}

// --- CSV Import/Export ---

function parseCsv(text) {
  const rows = [];
  let row = [], cur = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === `"` && next === `"`) { cur += `"`; i++; }
      else if (ch === `"`) inQuotes = false;
      else cur += ch;
    } else {
      if (ch === `"`) inQuotes = true;
      else if (ch === ",") { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && next === "\n") i++;
        row.push(cur); cur = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else cur += ch;
    }
  }
  row.push(cur);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

function parseTripCsv(csvText) {
  const rows = parseCsv(csvText);
  if (!rows.length) return [];
  const norm = s => s.trim().toLowerCase();
  const header = rows[0].map(norm);
  const nameIdx = header.indexOf("name");
  const tagsIdx = header.indexOf("tags");
  const categoryIdx = header.indexOf("category");
  const storesIdx = header.indexOf("stores");
  if (nameIdx === -1) throw new Error('CSV must have a "name" column.');
  const items = [];
  for (const r of rows.slice(1)) {
    const name = (r[nameIdx] || "").trim();
    if (!name) continue;
    const tagCell = tagsIdx >= 0 ? (r[tagsIdx] || "") : "";
    const tags = [...new Set(tagCell.split("|").map(t => t.trim()).filter(Boolean))];
    const category = categoryIdx >= 0 ? (r[categoryIdx] || "").trim() : "";
    const storeCell = storesIdx >= 0 ? (r[storesIdx] || "") : "";
    const stores = [...new Set(storeCell.split("|").map(s => s.trim()).filter(Boolean))];
    items.push({ name, tags, category, stores });
  }
  return items;
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsvRow(cols) {
  return cols.map(csvEscape).join(",");
}

function exportTripCsv(state) {
  const items = state.trip.items;
  if (!items.length) return;
  const rows = [
    toCsvRow(["name", "category", "stores", "tags", "source", "checked"]),
    ...items.map(item => {
      const name = getTripItemName(state, item);
      const category = item.baseId ? (state.catalog[item.baseId]?.category || "") : "";
      const stores = getStoresForTripItem(state, item);
      const tags = getTagsForTripItem(state, item);
      const source = getTripItemSource(state, item);
      return toCsvRow([
        name,
        category,
        stores.join("|"),
        tags.join("|"),
        source,
        item.checked ? "yes" : "",
      ]);
    }),
  ];
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "shopping-trip.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}
