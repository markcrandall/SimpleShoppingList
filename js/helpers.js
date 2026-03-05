export function generateId(prefix = "t") {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function catalogIdFromName(name) {
  const base = name.toLowerCase().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").trim();
  return base || generateId("item");
}

export function getTagsForTripItem(state, tripItem) {
  const baseId =
    tripItem.baseId ||
    state.collections?.[tripItem.link?.collectionId]?.items?.[tripItem.link?.itemId]?.baseId;
  return baseId ? (state.catalog?.[baseId]?.tags || []) : [];
}

export function getTripItemName(state, tripItem) {
  if (tripItem.name) return tripItem.name;
  if (tripItem.baseId && state.catalog[tripItem.baseId]) {
    return state.catalog[tripItem.baseId].name;
  }
  return "Unknown item";
}

export function getTripItemSource(state, tripItem) {
  if (tripItem.link?.collectionId) {
    return state.collections[tripItem.link.collectionId]?.label || null;
  }
  return null;
}

export function collectAllTags(items, getTagsFn, state) {
  const tagSet = new Set();
  items.forEach(item => {
    getTagsFn(state, item).forEach(tag => tagSet.add(tag));
  });
  return [...tagSet].sort();
}

export function getStoresForTripItem(state, tripItem) {
  const baseId =
    tripItem.baseId ||
    state.collections?.[tripItem.link?.collectionId]?.items?.[tripItem.link?.itemId]?.baseId;
  return baseId ? (state.catalog?.[baseId]?.stores || []) : [];
}

export function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

export function sortByCategory(items, catalog) {
  return [...items].sort((a, b) => {
    const catA = catalog[a.baseId || a.id]?.category || "";
    const catB = catalog[b.baseId || b.id]?.category || "";
    // Uncategorized ("") sorts last
    if (catA && !catB) return -1;
    if (!catA && catB) return 1;
    if (catA !== catB) return catA.localeCompare(catB);
    const nameA = catalog[a.baseId || a.id]?.name || a.name || "";
    const nameB = catalog[b.baseId || b.id]?.name || b.name || "";
    return nameA.localeCompare(nameB);
  });
}
