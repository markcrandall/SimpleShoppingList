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
        ${hasChecked ? `<button class="btn btn-secondary btn-small" data-action="clear-checked">Clear Done</button>` : ""}
        <button class="btn btn-primary btn-small" data-action="add-trip-item">+ Add</button>
      </div>
    </div>
    ${renderTripFilterBar(allStores, allTags)}`;

  if (!allItems.length) {
    html += `<div class="empty-state"><p>Your trip list is empty.<br>Add items from your lists or create a one-off item.</p></div>`;
  } else if (!filtered.length) {
    html += `<div class="empty-state"><p>No items match the current filter.</p></div>`;
  } else {
    html += `<ul class="item-list">`;
    for (const item of unchecked) {
      html += renderTripItem(state, item);
    }
    if (checked.length && unchecked.length) {
      html += `</ul><div class="section-separator">Completed</div><ul class="item-list">`;
    }
    for (const item of checked) {
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
      case "filter-chip":
        toggleFilter(target.dataset.filterKey);
        renderTrip(store.getState(), container);
        break;
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
