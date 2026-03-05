let activeTagFilter = null;

export function getActiveFilter() {
  return activeTagFilter;
}

export function setActiveFilter(tag) {
  activeTagFilter = activeTagFilter === tag ? null : tag;
}

export function clearFilter() {
  activeTagFilter = null;
}

export function renderTagFilterBar(allTags) {
  if (!allTags.length) return "";
  return `<div class="tag-filter-bar">${allTags
    .map(
      tag =>
        `<span class="tag-chip ${tag === activeTagFilter ? "active" : ""}" data-action="filter-tag" data-tag="${tag}">${tag}</span>`
    )
    .join("")}</div>`;
}

export function renderItemTags(tags) {
  if (!tags.length) return "";
  return tags
    .map(tag => `<span class="tag-chip">${tag}</span>`)
    .join("");
}

export function renderEditableTags(tags, baseId) {
  const chips = tags
    .map(
      tag =>
        `<span class="tag-chip" data-action="remove-tag" data-base-id="${baseId}" data-tag="${tag}">${tag}<span class="tag-remove">&times;</span></span>`
    )
    .join("");

  return `${chips}<span class="tag-input-wrap"><input class="tag-input" type="text" placeholder="+ tag" data-action="tag-input" data-base-id="${baseId}"></span>`;
}

export function filterByTag(items, getTagsFn, state) {
  if (!activeTagFilter) return items;
  return items.filter(item =>
    getTagsFn(state, item).includes(activeTagFilter)
  );
}
