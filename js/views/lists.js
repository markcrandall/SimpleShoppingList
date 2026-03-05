import { store } from "../state.js";
import { escapeHtml, sortByCategory } from "../helpers.js";
import { renderItemTags } from "../components/tag-chips.js";
import { openModal, closeModal } from "../components/modal.js";

// Lists-local multi-select filter state
const activeFilters = new Set(); // values like "store:Costco" or "tag:Organic"

function toggleFilter(key) {
  if (activeFilters.has(key)) activeFilters.delete(key);
  else activeFilters.add(key);
}

function clearListFilters() {
  activeFilters.clear();
}

function filterCollectionItems(items, state) {
  if (!activeFilters.size) return items;
  return items.filter(item => {
    const catItem = state.catalog?.[item.baseId];
    if (!catItem) return false;
    const tags = catItem.tags || [];
    const stores = catItem.stores || [];
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

function collectCollectionStores(items, state) {
  const storeSet = new Set();
  items.forEach(item => {
    (state.catalog?.[item.baseId]?.stores || []).forEach(s => storeSet.add(s));
  });
  return [...storeSet].sort();
}

function collectCollectionTags(items, state) {
  const tagSet = new Set();
  items.forEach(item => {
    (state.catalog?.[item.baseId]?.tags || []).forEach(t => tagSet.add(t));
  });
  return [...tagSet].sort();
}

function renderListFilterBar(allStores, allTags) {
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

let listSearchQuery = "";

export function renderLists(state, container, collectionId) {
  if (collectionId) {
    renderCollectionDetail(state, container, collectionId);
  } else {
    renderCollectionIndex(state, container);
  }
}

function renderCollectionIndex(state, container) {
  const collections = Object.values(state.collections);

  let html = `
    <div class="view-header">
      <h2>Lists</h2>
      <div class="view-header-actions">
        <button class="btn btn-primary btn-small" data-action="add-collection">+ New List</button>
      </div>
    </div>`;

  if (!collections.length) {
    html += `<div class="empty-state"><p>No lists yet. Create one to get started.</p></div>`;
  } else {
    for (const col of collections) {
      const count = Object.keys(col.items).length;
      const neededCount = Object.values(col.items).filter(i => i.needed).length;
      html += `
        <div class="collection-card">
          <div data-action="manage-collection" data-id="${col.id}" style="flex:1;cursor:pointer">
            <div class="collection-label">${escapeHtml(col.label)}</div>
            <div class="collection-count">${count} item${count !== 1 ? "s" : ""}${neededCount ? `, ${neededCount} needed` : ""}</div>
          </div>
          <span class="collection-arrow" data-action="open-collection" data-id="${col.id}" style="cursor:pointer;padding:8px">&#8250;</span>
        </div>`;
    }
  }

  container.innerHTML = html;
  attachIndexEvents(container);
}

function attachIndexEvents(container) {
  if (container._indexEventsAttached) return;
  container._indexEventsAttached = true;
  container.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;

    switch (target.dataset.action) {
      case "open-collection":
        location.hash = `#lists/${target.dataset.id}`;
        break;
      case "manage-collection":
        openManageCollectionModal(target.dataset.id);
        break;
      case "add-collection":
        openAddCollectionModal();
        break;
    }
  });
}

function openAddCollectionModal() {
  const html = `
    <div class="modal-header">
      <h3>New List</h3>
      <button class="btn-icon" data-action="close">&times;</button>
    </div>
    <div class="input-row">
      <input class="input-field" type="text" id="collection-name-input" placeholder="List name...">
      <button class="btn btn-primary" data-action="create-collection">Create</button>
    </div>`;

  openModal(html, (action) => {
    switch (action) {
      case "close":
        closeModal();
        break;
      case "create-collection": {
        const input = document.getElementById("collection-name-input");
        const name = input.value.trim();
        if (name) {
          store.addCollection(name);
          closeModal();
        }
        break;
      }
    }
  });

  requestAnimationFrame(() => {
    const input = document.getElementById("collection-name-input");
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const name = input.value.trim();
          if (name) {
            store.addCollection(name);
            closeModal();
          }
        }
      });
    }
  });
}

function openManageCollectionModal(collectionId) {
  const state = store.getState();
  const col = state.collections[collectionId];
  if (!col) return;

  const html = `
    <div class="modal-header">
      <h3>Manage List</h3>
      <button class="btn-icon" data-action="close">&times;</button>
    </div>
    <div class="modal-section">
      <label class="form-label">Rename</label>
      <div class="input-row">
        <input class="input-field" type="text" id="rename-collection-input" value="${escapeHtml(col.label)}">
        <button class="btn btn-primary" data-action="rename-collection" data-id="${collectionId}">Save</button>
      </div>
    </div>
    <div class="modal-section">
      <label class="form-label">Delete</label>
      <p style="font-size:14px;color:var(--color-text-secondary);margin-bottom:8px">This will remove the list and all its items from the trip.</p>
      <button class="btn btn-danger" data-action="delete-collection" data-id="${collectionId}">Delete List</button>
    </div>`;

  openModal(html, (action, data) => {
    switch (action) {
      case "close":
        closeModal();
        break;
      case "rename-collection": {
        const input = document.getElementById("rename-collection-input");
        const name = input.value.trim();
        if (name) {
          store.renameCollection(data.id, name);
          closeModal();
        }
        break;
      }
      case "delete-collection":
        openDeleteCollectionConfirmModal(data.id);
        break;
    }
  });

  requestAnimationFrame(() => {
    const input = document.getElementById("rename-collection-input");
    if (input) {
      input.select();
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const name = input.value.trim();
          if (name) {
            store.renameCollection(collectionId, name);
            closeModal();
          }
        }
      });
    }
  });
}

function openDeleteCollectionConfirmModal(collectionId) {
  const state = store.getState();
  const col = state.collections[collectionId];
  if (!col) return;

  const count = Object.keys(col.items).length;
  const html = `
    <div class="modal-header">
      <h3>Delete List</h3>
      <button class="btn-icon" data-action="close">&times;</button>
    </div>
    <p>Delete <strong>${escapeHtml(col.label)}</strong>${count ? ` and its ${count} item${count !== 1 ? "s" : ""}` : ""}? This cannot be undone.</p>
    <div class="confirm-actions">
      <button class="btn btn-secondary" data-action="close">Cancel</button>
      <button class="btn btn-danger" data-action="confirm-delete" data-id="${collectionId}">Delete</button>
    </div>`;

  openModal(html, (action, data) => {
    switch (action) {
      case "close":
        closeModal();
        break;
      case "confirm-delete":
        store.removeCollection(data.id);
        closeModal();
        break;
    }
  });
}

// --- Collection Detail ---

function renderCollectionDetail(state, container, collectionId) {
  const col = state.collections[collectionId];
  if (!col) {
    container.innerHTML = `<div class="empty-state"><p>List not found.</p></div>`;
    return;
  }

  const scrollTop = container.scrollTop;
  const items = Object.values(col.items);
  const allStores = collectCollectionStores(items, state);
  const allTags = collectCollectionTags(items, state);
  const filteredUnsorted = filterCollectionItems(items, state);
  const filtered = sortByCategory(filteredUnsorted, state.catalog);

  let html = `
    <button class="back-btn" data-action="back">&#8249; Lists</button>
    <div class="view-header">
      <h2>${escapeHtml(col.label)}</h2>
      <div class="view-header-actions">
        <button class="btn btn-primary btn-small" data-action="add-item-to-collection">+ Add Item</button>
      </div>
    </div>
    ${renderListFilterBar(allStores, allTags)}
    <div class="search-row">
      <input class="input-field" type="text" id="list-search-input" placeholder="Search items..." value="${escapeHtml(listSearchQuery)}">
      ${listSearchQuery ? `<button class="btn-icon search-clear" data-action="clear-search" title="Clear">&times;</button>` : ""}
    </div>`;

  const searchFiltered = listSearchQuery
    ? filtered.filter(item => {
        const catItem = state.catalog[item.baseId];
        return catItem && catItem.name.toLowerCase().includes(listSearchQuery.toLowerCase());
      })
    : filtered;

  if (!items.length) {
    html += `<div class="empty-state"><p>No items in this list.<br>Add items from the catalog.</p></div>`;
  } else if (!searchFiltered.length) {
    html += `<div class="empty-state"><p>No items match your search.</p></div>`;
  } else {
    html += `<ul class="item-list">`;
    for (const item of searchFiltered) {
      const catItem = state.catalog[item.baseId];
      if (!catItem) continue;
      const tags = renderItemTags(catItem.tags);
      const storeChips = (catItem.stores || [])
        .map(s => `<span class="store-chip">${escapeHtml(s)}</span>`)
        .join("");
      const category = catItem.category || "";
      const neededClass = item.needed ? "needed" : "";

      html += `
        <li class="item-row" data-action="toggle-needed" data-item="${item.id}" data-collection="${collectionId}">
          <div class="check-box ${neededClass}">${item.needed ? "&#10003;" : ""}</div>
          <div class="item-content">
            <span class="item-name">${escapeHtml(catItem.name)}</span>
            <div class="item-meta">
              ${category ? `<span class="item-category">${escapeHtml(category)}</span>` : ""}
              ${storeChips}
              ${tags}
            </div>
          </div>
          <div class="item-actions">
            <button class="btn-icon danger" data-action="remove-from-collection" data-item="${item.id}" data-collection="${collectionId}" title="Remove">&times;</button>
          </div>
        </li>`;
    }
    html += `</ul>`;
  }

  container.innerHTML = html;
  container.scrollTop = scrollTop;
  attachDetailEvents(container, collectionId);
}

let _currentCollectionId = null;

function attachDetailEvents(container, collectionId) {
  _currentCollectionId = collectionId;
  if (container._detailEventsAttached) return;
  container._detailEventsAttached = true;
  container.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;

    switch (target.dataset.action) {
      case "back":
        clearListFilters();
        listSearchQuery = "";
        location.hash = "#lists";
        break;
      case "clear-search":
        e.stopPropagation();
        listSearchQuery = "";
        renderCollectionDetail(store.getState(), container, _currentCollectionId);
        break;
      case "toggle-needed": {
        e.preventDefault();
        const state = store.getState();
        const col = state.collections[_currentCollectionId];
        const item = col?.items[target.dataset.item];
        if (item) {
          store.toggleNeeded(_currentCollectionId, target.dataset.item, !item.needed);
        }
        break;
      }
      case "remove-from-collection":
        e.stopPropagation();
        store.removeItemFromCollection(target.dataset.collection, target.dataset.item);
        break;
      case "add-item-to-collection":
        openAddItemToCollectionModal(_currentCollectionId);
        break;
      case "filter-chip":
        toggleFilter(target.dataset.filterKey);
        renderCollectionDetail(store.getState(), container, _currentCollectionId);
        break;
    }
  });

  container.addEventListener("input", (e) => {
    if (e.target.id === "list-search-input") {
      listSearchQuery = e.target.value;
      renderCollectionDetail(store.getState(), container, _currentCollectionId);
      const input = document.getElementById("list-search-input");
      if (input) {
        input.focus();
        input.selectionStart = input.selectionEnd = input.value.length;
      }
    }
  });
}

function openAddItemToCollectionModal(collectionId) {
  const state = store.getState();
  const col = state.collections[collectionId];
  if (!col) return;

  const existingIds = new Set(Object.keys(col.items));
  const available = Object.values(state.catalog).filter(item => !existingIds.has(item.id));

  let listHtml = "";
  if (available.length) {
    listHtml = `<ul class="selectable-list">`;
    for (const item of available) {
      const tags = renderItemTags(item.tags);
      listHtml += `
        <li class="selectable-item" data-action="select-catalog-item" data-base-id="${item.id}">
          <span class="item-name">${escapeHtml(item.name)}</span>
          ${tags ? `<span class="item-meta">${tags}</span>` : ""}
        </li>`;
    }
    listHtml += `</ul>`;
  }

  const html = `
    <div class="modal-header">
      <h3>Add to ${escapeHtml(col.label)}</h3>
      <button class="btn-icon" data-action="close">&times;</button>
    </div>
    <div class="modal-section">
      <div class="modal-section-title">Create new item</div>
      <div class="input-row">
        <input class="input-field" type="text" id="new-item-input" placeholder="Item name...">
        <button class="btn btn-primary" data-action="create-and-add">Add</button>
      </div>
    </div>
    ${available.length ? `<div class="modal-section"><div class="modal-section-title">From catalog</div>${listHtml}</div>` : ""}`;

  openModal(html, (action, data) => {
    switch (action) {
      case "close":
        closeModal();
        break;
      case "create-and-add": {
        const input = document.getElementById("new-item-input");
        const name = input.value.trim();
        if (name) {
          const baseId = store.addCatalogItem(name);
          store.addItemToCollection(collectionId, baseId);
          closeModal();
        }
        break;
      }
      case "select-catalog-item":
        store.addItemToCollection(collectionId, data.baseId);
        closeModal();
        break;
    }
  });

  requestAnimationFrame(() => {
    const input = document.getElementById("new-item-input");
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          const name = input.value.trim();
          if (name) {
            const baseId = store.addCatalogItem(name);
            store.addItemToCollection(collectionId, baseId);
            closeModal();
          }
        }
      });
    }
  });
}
