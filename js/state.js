import { createSeedData } from "./seed.js";
import { generateId, catalogIdFromName } from "./helpers.js";

const STORAGE_KEY = "simpleShoppingList";

export const store = {
  _state: null,
  _listeners: [],

  init() {
    const saved = localStorage.getItem(STORAGE_KEY);
    this._state = saved ? JSON.parse(saved) : createSeedData();

    // Migrate: add categories/stores arrays if missing
    if (!Array.isArray(this._state.categories)) {
      this._state.categories = [];
    }
    if (!Array.isArray(this._state.stores)) {
      this._state.stores = [];
    }

    // Migrate: add category/stores to existing catalog items if missing
    for (const item of Object.values(this._state.catalog)) {
      if (item.category === undefined) item.category = "";
      if (!Array.isArray(item.stores)) item.stores = [];
    }

    this._notify();
  },

  getState() {
    return this._state;
  },

  subscribe(fn) {
    this._listeners.push(fn);
    return () => {
      this._listeners = this._listeners.filter(l => l !== fn);
    };
  },

  _persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._state));
  },

  _notify() {
    this._persist();
    this._listeners.forEach(fn => fn(this._state));
  },

  // --- Category mutations ---

  addCategory(name) {
    const trimmed = name.trim();
    if (!trimmed || this._state.categories.includes(trimmed)) return;
    this._state.categories.push(trimmed);
    this._state.categories.sort((a, b) => a.localeCompare(b));
    this._notify();
  },

  removeCategory(name) {
    this._state.categories = this._state.categories.filter(c => c !== name);
    for (const item of Object.values(this._state.catalog)) {
      if (item.category === name) item.category = "";
    }
    this._notify();
  },

  // --- Store mutations ---

  addStore(name) {
    const trimmed = name.trim();
    if (!trimmed || this._state.stores.includes(trimmed)) return;
    this._state.stores.push(trimmed);
    this._state.stores.sort((a, b) => a.localeCompare(b));
    this._notify();
  },

  removeStore(name) {
    this._state.stores = this._state.stores.filter(s => s !== name);
    for (const item of Object.values(this._state.catalog)) {
      item.stores = item.stores.filter(s => s !== name);
    }
    this._notify();
  },

  // --- Catalog mutations ---

  addCatalogItem(name, tags = [], category = "", stores = []) {
    let id = catalogIdFromName(name);
    // Handle collision
    if (this._state.catalog[id]) {
      let i = 2;
      while (this._state.catalog[id + "-" + i]) i++;
      id = id + "-" + i;
    }
    this._state.catalog[id] = { id, name, category, stores, tags };
    this._notify();
    return id;
  },

  updateCatalogItem(baseId, name) {
    if (!this._state.catalog[baseId]) return;
    this._state.catalog[baseId].name = name;
    this._notify();
  },

  updateCatalogItemTags(baseId, tags) {
    if (!this._state.catalog[baseId]) return;
    this._state.catalog[baseId].tags = tags;
    this._notify();
  },

  updateCatalogItemCategory(baseId, category) {
    if (!this._state.catalog[baseId]) return;
    this._state.catalog[baseId].category = category;
    this._notify();
  },

  updateCatalogItemStores(baseId, stores) {
    if (!this._state.catalog[baseId]) return;
    this._state.catalog[baseId].stores = stores;
    this._notify();
  },

  importCatalogItems(parsedItems) {
    // parsedItems: array of { name, tags, category?, stores? }
    const norm = s => s.trim().toLowerCase().replace(/\s+/g, " ");
    const uniq = arr => [...new Set(arr)];

    const existingByName = new Map(
      Object.values(this._state.catalog).map(it => [norm(it.name), it])
    );

    for (const { name, tags, category, stores } of parsedItems) {
      if (!name.trim()) continue;
      const key = norm(name);
      const existing = existingByName.get(key);

      if (existing) {
        existing.tags = uniq([...(existing.tags || []), ...tags]).sort();
        if (category) existing.category = category;
        if (stores && stores.length) {
          existing.stores = uniq([...(existing.stores || []), ...stores]).sort();
        }
      } else {
        let id = catalogIdFromName(name);
        if (this._state.catalog[id]) {
          let i = 2;
          while (this._state.catalog[id + "-" + i]) i++;
          id = id + "-" + i;
        }
        const it = {
          id,
          name: name.trim(),
          category: category || "",
          stores: stores || [],
          tags,
        };
        this._state.catalog[id] = it;
        existingByName.set(key, it);
      }

      // Auto-create categories/stores encountered during import
      if (category && !this._state.categories.includes(category)) {
        this._state.categories.push(category);
      }
      if (stores) {
        for (const s of stores) {
          if (s && !this._state.stores.includes(s)) {
            this._state.stores.push(s);
          }
        }
      }
    }

    this._state.categories.sort((a, b) => a.localeCompare(b));
    this._state.stores.sort((a, b) => a.localeCompare(b));
    this._notify();
  },

  removeCatalogItem(baseId) {
    if (!this._state.catalog[baseId]) return;
    delete this._state.catalog[baseId];

    // Cascade: remove from all collections
    for (const col of Object.values(this._state.collections)) {
      for (const [itemId, item] of Object.entries(col.items)) {
        if (item.baseId === baseId) {
          delete col.items[itemId];
        }
      }
    }

    // Cascade: remove from trip
    this._state.trip.items = this._state.trip.items.filter(t => t.baseId !== baseId);

    this._notify();
  },

  // --- Collection mutations ---

  addCollection(label) {
    const id = catalogIdFromName(label);
    let finalId = id;
    if (this._state.collections[finalId]) {
      let i = 2;
      while (this._state.collections[finalId + "-" + i]) i++;
      finalId = finalId + "-" + i;
    }
    this._state.collections[finalId] = { id: finalId, label, items: {} };
    this._notify();
    return finalId;
  },

  removeCollection(collectionId) {
    if (!this._state.collections[collectionId]) return;

    // Remove linked trip items
    this._state.trip.items = this._state.trip.items.filter(
      t => t.link?.collectionId !== collectionId
    );

    delete this._state.collections[collectionId];
    this._notify();
  },

  addItemToCollection(collectionId, baseId) {
    const col = this._state.collections[collectionId];
    if (!col || !this._state.catalog[baseId]) return;
    if (col.items[baseId]) return; // already exists

    col.items[baseId] = { id: baseId, baseId, needed: false };
    this._notify();
  },

  removeItemFromCollection(collectionId, itemId) {
    const col = this._state.collections[collectionId];
    if (!col || !col.items[itemId]) return;

    // Remove linked trip item
    this._state.trip.items = this._state.trip.items.filter(
      t => !(t.link?.collectionId === collectionId && t.link?.itemId === itemId)
    );

    delete col.items[itemId];
    this._notify();
  },

  toggleNeeded(collectionId, itemId, needed) {
    const col = this._state.collections[collectionId];
    if (!col || !col.items[itemId]) return;

    col.items[itemId].needed = needed;

    if (needed) {
      // Add to trip if not already there
      const alreadyInTrip = this._state.trip.items.some(
        t => t.link?.collectionId === collectionId && t.link?.itemId === itemId
      );
      if (!alreadyInTrip) {
        const baseId = col.items[itemId].baseId;
        this._state.trip.items.push({
          id: generateId(),
          baseId,
          checked: false,
          link: { collectionId, itemId },
        });
      }
    } else {
      // Remove from trip
      this._state.trip.items = this._state.trip.items.filter(
        t => !(t.link?.collectionId === collectionId && t.link?.itemId === itemId)
      );
    }

    this._notify();
  },

  // --- Trip mutations ---

  addTripItemFromCollection(collectionId, itemId) {
    const col = this._state.collections[collectionId];
    if (!col || !col.items[itemId]) return;

    // Check for duplicates
    const exists = this._state.trip.items.some(
      t => t.link?.collectionId === collectionId && t.link?.itemId === itemId
    );
    if (exists) return;

    const baseId = col.items[itemId].baseId;
    col.items[itemId].needed = true;

    this._state.trip.items.push({
      id: generateId(),
      baseId,
      checked: false,
      link: { collectionId, itemId },
    });

    this._notify();
  },

  addTripItemOneOff(name) {
    this._state.trip.items.push({
      id: generateId(),
      name,
      checked: false,
    });
    this._notify();
  },

  toggleTripItemChecked(tripItemId) {
    const item = this._state.trip.items.find(t => t.id === tripItemId);
    if (item) {
      item.checked = !item.checked;
      this._notify();
    }
  },

  removeTripItem(tripItemId) {
    const item = this._state.trip.items.find(t => t.id === tripItemId);
    if (!item) return;

    // Reset needed on source collection
    if (item.link) {
      const col = this._state.collections[item.link.collectionId];
      if (col?.items[item.link.itemId]) {
        col.items[item.link.itemId].needed = false;
      }
    }

    this._state.trip.items = this._state.trip.items.filter(t => t.id !== tripItemId);
    this._notify();
  },

  clearCheckedTripItems() {
    const checked = this._state.trip.items.filter(t => t.checked);

    // Reset needed on source collections
    for (const item of checked) {
      if (item.link) {
        const col = this._state.collections[item.link.collectionId];
        if (col?.items[item.link.itemId]) {
          col.items[item.link.itemId].needed = false;
        }
      }
    }

    this._state.trip.items = this._state.trip.items.filter(t => !t.checked);
    this._notify();
  },
};
