import { store } from "../state.js";
import { collectAllTags, escapeHtml, sortByCategory } from "../helpers.js";
import { renderTagFilterBar, renderEditableTags, filterByTag, setActiveFilter } from "../components/tag-chips.js";
import { openModal, closeModal } from "../components/modal.js";

export function renderItems(state, container) {
  const scrollTop = container.scrollTop;
  const catalogItems = Object.values(state.catalog);

  function getCatalogItemTags(_state, item) {
    return item.tags || [];
  }

  const allTags = collectAllTags(catalogItems, getCatalogItemTags, state);
  const filtered = filterByTag(catalogItems, getCatalogItemTags, state);
  const sorted = sortByCategory(filtered, state.catalog);

  let html = `
    <div class="view-header">
      <h2>Items</h2>
      <div class="view-header-actions">
        <button class="btn btn-secondary btn-small" data-action="import-csv">Import</button>
        <button class="btn btn-secondary btn-small" data-action="export-csv">Export</button>
        <button class="btn btn-primary btn-small" data-action="add-catalog-item">+ New Item</button>
        <input type="file" id="import-csv-input" accept=".csv,text/csv" style="display:none">
      </div>
    </div>
    ${renderTagFilterBar(allTags)}`;

  if (!catalogItems.length) {
    html += `<div class="empty-state"><p>No items in your catalog.<br>Create your first item.</p></div>`;
  } else if (!filtered.length) {
    html += `<div class="empty-state"><p>No items match the current filter.</p></div>`;
  } else {
    // Group by category
    const groups = groupByCategory(sorted, state.catalog);
    for (const group of groups) {
      html += `<div class="category-header">${group.label}</div>`;
      html += `<ul class="item-list">`;
      for (const item of group.items) {
        const inCollections = Object.values(state.collections)
          .filter(col => col.items[item.id])
          .map(col => col.label);

        const storeChips = (item.stores || [])
          .map(s => `<span class="store-chip">${escapeHtml(s)}</span>`)
          .join("");

        html += `
          <li class="item-row catalog-item-row" data-action="edit-catalog-item" data-base-id="${item.id}">
            <div class="item-content">
              <span class="item-name">${escapeHtml(item.name)}</span>
              ${inCollections.length ? `<span class="item-source">(${inCollections.map(escapeHtml).join(", ")})</span>` : ""}
              <div class="item-meta">
                ${renderEditableTags(item.tags, item.id)}
                ${storeChips}
              </div>
            </div>
            <div class="item-actions">
              <button class="btn-icon danger" data-action="delete-catalog-item" data-base-id="${item.id}" title="Delete">&times;</button>
            </div>
          </li>`;
      }
      html += `</ul>`;
    }
  }

  container.innerHTML = html;
  container.scrollTop = scrollTop;
  attachItemsEvents(container);
}

function groupByCategory(sortedItems, catalog) {
  const groups = [];
  const groupMap = new Map();
  for (const item of sortedItems) {
    const cat = catalog[item.id]?.category || "";
    const label = cat || "Uncategorized";
    if (!groupMap.has(label)) {
      const group = { label, items: [] };
      groupMap.set(label, group);
      groups.push(group);
    }
    groupMap.get(label).items.push(item);
  }
  return groups;
}

function attachItemsEvents(container) {
  if (container._itemsEventsAttached) return;
  container._itemsEventsAttached = true;
  container.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;

    switch (target.dataset.action) {
      case "import-csv":
        document.getElementById("import-csv-input")?.click();
        break;
      case "export-csv":
        exportItemsCsv(store.getState());
        break;
      case "add-catalog-item":
        openAddCatalogItemModal();
        break;
      case "edit-catalog-item":
        openEditCatalogItemModal(target.dataset.baseId);
        break;
      case "delete-catalog-item":
        e.stopPropagation();
        openDeleteConfirmModal(target.dataset.baseId);
        break;
      case "remove-tag": {
        e.stopPropagation();
        const state = store.getState();
        const item = state.catalog[target.dataset.baseId];
        if (item) {
          const newTags = item.tags.filter(t => t !== target.dataset.tag);
          store.updateCatalogItemTags(target.dataset.baseId, newTags);
        }
        break;
      }
      case "filter-tag":
        setActiveFilter(target.dataset.tag);
        renderItems(store.getState(), container);
        break;
    }
  });

  // Handle CSV file import
  container.addEventListener("change", async (e) => {
    if (e.target.id !== "import-csv-input") return;
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const items = parseCsvToItems(text);
      if (items.length) {
        store.importCatalogItems(items);
      }
    } catch (err) {
      alert(err.message);
    }
    e.target.value = "";
  });

  // Handle tag input Enter key
  container.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.dataset.action === "tag-input") {
      const tag = e.target.value.trim();
      const baseId = e.target.dataset.baseId;
      if (tag && baseId) {
        const state = store.getState();
        const item = state.catalog[baseId];
        if (item && !item.tags.includes(tag)) {
          store.updateCatalogItemTags(baseId, [...item.tags, tag]);
        }
      }
    }
  });
}

// --- CSV Import ---

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

function parseCsvToItems(csvText) {
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

// --- CSV Export ---

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsvRow(cols) {
  return cols.map(csvEscape).join(",");
}

function exportItemsCsv(state) {
  const items = Object.values(state.catalog || {});
  const rows = [
    toCsvRow(["name", "category", "stores", "tags"]),
    ...items
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(it => toCsvRow([
        it.name,
        it.category || "",
        (it.stores || []).join("|"),
        (it.tags || []).join("|"),
      ])),
  ];

  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "simple-shopping-list-items.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

// --- Add/Edit Modals ---

function renderCategorySelect(state, selectedCategory) {
  const cats = state.categories || [];
  let options = `<option value="">Uncategorized</option>`;
  for (const cat of cats) {
    const sel = cat === selectedCategory ? "selected" : "";
    options += `<option value="${escapeHtml(cat)}" ${sel}>${escapeHtml(cat)}</option>`;
  }
  options += `<option value="__new__">+ New category...</option>`;
  return `<select class="select-field" id="catalog-category-select">${options}</select>`;
}

function renderStoreChips(state, selectedStores) {
  const allStores = state.stores || [];
  let html = `<div class="chip-row" id="store-chips-row">`;
  for (const s of allStores) {
    const active = selectedStores.includes(s) ? "active" : "";
    html += `<span class="chip-toggle ${active}" data-action="toggle-store" data-store="${escapeHtml(s)}">${escapeHtml(s)}</span>`;
  }
  html += `<button class="btn btn-text btn-small" data-action="show-add-store">+</button>`;
  html += `</div>`;
  return html;
}

function setupModalStoreAndCategoryHandlers(modalContent, getSelectedStores, setSelectedStores) {
  // Handle category "new" selection
  const catSelect = modalContent.querySelector("#catalog-category-select");
  if (catSelect) {
    catSelect.addEventListener("change", () => {
      if (catSelect.value === "__new__") {
        const container = catSelect.parentElement;
        const existing = container.querySelector(".inline-add");
        if (existing) return;
        const inlineAdd = document.createElement("div");
        inlineAdd.className = "inline-add";
        inlineAdd.style.marginTop = "6px";
        inlineAdd.innerHTML = `<input type="text" id="new-category-input" placeholder="Category name...">
          <button class="btn btn-primary btn-small" id="new-category-btn">Add</button>`;
        container.appendChild(inlineAdd);
        const newCatInput = inlineAdd.querySelector("#new-category-input");
        const newCatBtn = inlineAdd.querySelector("#new-category-btn");
        newCatInput.focus();

        const addNewCat = () => {
          const val = newCatInput.value.trim();
          if (val) {
            store.addCategory(val);
            const state = store.getState();
            // Rebuild select options
            const newOpt = document.createElement("option");
            newOpt.value = val;
            newOpt.textContent = val;
            newOpt.selected = true;
            // Insert before the "+ New category..." option
            const newCatOpt = catSelect.querySelector('option[value="__new__"]');
            catSelect.insertBefore(newOpt, newCatOpt);
            catSelect.value = val;
            inlineAdd.remove();
          }
        };

        newCatBtn.addEventListener("click", addNewCat);
        newCatInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") addNewCat();
          if (e.key === "Escape") {
            catSelect.value = "";
            inlineAdd.remove();
          }
        });
      }
    });
  }

  // Handle store chip toggles and add store
  modalContent.addEventListener("click", (e) => {
    const tgt = e.target.closest("[data-action]");
    if (!tgt) return;

    if (tgt.dataset.action === "toggle-store") {
      e.stopPropagation();
      e.preventDefault();
      const storeName = tgt.dataset.store;
      const sel = getSelectedStores();
      if (sel.includes(storeName)) {
        setSelectedStores(sel.filter(s => s !== storeName));
        tgt.classList.remove("active");
      } else {
        setSelectedStores([...sel, storeName]);
        tgt.classList.add("active");
      }
    }

    if (tgt.dataset.action === "show-add-store") {
      e.stopPropagation();
      e.preventDefault();
      const row = modalContent.querySelector("#store-chips-row");
      const existing = row.querySelector(".inline-add");
      if (existing) return;
      const inlineAdd = document.createElement("span");
      inlineAdd.className = "inline-add";
      inlineAdd.innerHTML = `<input type="text" id="new-store-input" placeholder="Store name...">`;
      row.insertBefore(inlineAdd, tgt);
      const newStoreInput = inlineAdd.querySelector("#new-store-input");
      newStoreInput.focus();

      newStoreInput.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          const val = newStoreInput.value.trim();
          if (val) {
            store.addStore(val);
            // Add chip
            const chip = document.createElement("span");
            chip.className = "chip-toggle active";
            chip.dataset.action = "toggle-store";
            chip.dataset.store = val;
            chip.textContent = val;
            row.insertBefore(chip, inlineAdd);
            setSelectedStores([...getSelectedStores(), val]);
            inlineAdd.remove();
          }
        }
        if (ev.key === "Escape") {
          inlineAdd.remove();
        }
      });

      newStoreInput.addEventListener("blur", () => {
        const val = newStoreInput.value.trim();
        if (val) {
          store.addStore(val);
          const chip = document.createElement("span");
          chip.className = "chip-toggle active";
          chip.dataset.action = "toggle-store";
          chip.dataset.store = val;
          chip.textContent = val;
          row.insertBefore(chip, inlineAdd);
          setSelectedStores([...getSelectedStores(), val]);
        }
        inlineAdd.remove();
      });
    }
  });
}

function openAddCatalogItemModal() {
  const state = store.getState();
  let selectedStores = [];

  const html = `
    <div class="modal-header">
      <h3>New Catalog Item</h3>
      <button class="btn-icon" data-action="close">&times;</button>
    </div>
    <div class="modal-section">
      <label class="form-label">Name</label>
      <div class="input-row">
        <input class="input-field" type="text" id="catalog-name-input" placeholder="Item name...">
      </div>
    </div>
    <div class="modal-section">
      <label class="form-label">Category</label>
      <div>${renderCategorySelect(state, "")}</div>
    </div>
    <div class="modal-section">
      <label class="form-label">Stores</label>
      ${renderStoreChips(state, [])}
    </div>
    <div class="modal-section">
      <label class="form-label">Tags</label>
      <div class="input-row">
        <input class="input-field" type="text" id="catalog-tags-input" placeholder="Tags (comma-separated)...">
      </div>
    </div>
    <div style="text-align:right">
      <button class="btn btn-primary" data-action="create-catalog-item">Create</button>
    </div>`;

  openModal(html, (action) => {
    switch (action) {
      case "close":
        closeModal();
        break;
      case "create-catalog-item": {
        const nameInput = document.getElementById("catalog-name-input");
        const tagsInput = document.getElementById("catalog-tags-input");
        const catSelect = document.getElementById("catalog-category-select");
        const name = nameInput.value.trim();
        if (name) {
          const tags = tagsInput.value
            .split(",")
            .map(t => t.trim())
            .filter(Boolean);
          const category = catSelect.value === "__new__" ? "" : catSelect.value;
          store.addCatalogItem(name, tags, category, selectedStores);
          closeModal();
        }
        break;
      }
    }
  });

  requestAnimationFrame(() => {
    const modalContent = document.getElementById("modal-content");
    setupModalStoreAndCategoryHandlers(
      modalContent,
      () => selectedStores,
      (s) => { selectedStores = s; }
    );

    const input = document.getElementById("catalog-name-input");
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          document.querySelector("[data-action='create-catalog-item']")?.click();
        }
      });
    }
  });
}

function openEditCatalogItemModal(baseId) {
  const state = store.getState();
  const item = state.catalog[baseId];
  if (!item) return;

  let selectedStores = [...(item.stores || [])];

  const html = `
    <div class="modal-header">
      <h3>Edit Item</h3>
      <button class="btn-icon" data-action="close">&times;</button>
    </div>
    <div class="modal-section">
      <label class="form-label">Name</label>
      <div class="input-row">
        <input class="input-field" type="text" id="edit-name-input" value="${escapeHtml(item.name)}">
      </div>
    </div>
    <div class="modal-section">
      <label class="form-label">Category</label>
      <div>${renderCategorySelect(state, item.category || "")}</div>
    </div>
    <div class="modal-section">
      <label class="form-label">Stores</label>
      ${renderStoreChips(state, selectedStores)}
    </div>
    <div class="modal-section">
      <label class="form-label">Tags</label>
      <div class="input-row">
        <input class="input-field" type="text" id="edit-tags-input" value="${escapeHtml((item.tags || []).join(", "))}">
      </div>
    </div>
    <div style="text-align:right">
      <button class="btn btn-primary" data-action="save-catalog-item" data-base-id="${baseId}">Save</button>
    </div>`;

  openModal(html, (action, data) => {
    switch (action) {
      case "close":
        closeModal();
        break;
      case "save-catalog-item": {
        const nameInput = document.getElementById("edit-name-input");
        const tagsInput = document.getElementById("edit-tags-input");
        const catSelect = document.getElementById("catalog-category-select");
        const name = nameInput.value.trim();
        if (name) {
          const tags = tagsInput.value
            .split(",")
            .map(t => t.trim())
            .filter(Boolean);
          const category = catSelect.value === "__new__" ? "" : catSelect.value;
          store.updateCatalogItem(data.baseId, name);
          store.updateCatalogItemTags(data.baseId, tags);
          store.updateCatalogItemCategory(data.baseId, category);
          store.updateCatalogItemStores(data.baseId, selectedStores);
          closeModal();
        }
        break;
      }
    }
  });

  requestAnimationFrame(() => {
    const modalContent = document.getElementById("modal-content");
    setupModalStoreAndCategoryHandlers(
      modalContent,
      () => selectedStores,
      (s) => { selectedStores = s; }
    );
  });
}

function openDeleteConfirmModal(baseId) {
  const state = store.getState();
  const item = state.catalog[baseId];
  if (!item) return;

  const html = `
    <div class="modal-header">
      <h3>Delete Item</h3>
      <button class="btn-icon" data-action="close">&times;</button>
    </div>
    <p>Delete <strong>${escapeHtml(item.name)}</strong>? This will also remove it from all lists and the current trip.</p>
    <div class="confirm-actions">
      <button class="btn btn-secondary" data-action="close">Cancel</button>
      <button class="btn btn-danger" data-action="confirm-delete" data-base-id="${baseId}">Delete</button>
    </div>`;

  openModal(html, (action, data) => {
    switch (action) {
      case "close":
        closeModal();
        break;
      case "confirm-delete":
        store.removeCatalogItem(data.baseId);
        closeModal();
        break;
    }
  });
}
