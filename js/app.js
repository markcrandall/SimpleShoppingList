import { store } from "./state.js";
import { renderTrip } from "./views/trip.js";
import { renderLists } from "./views/lists.js";
import { renderItems } from "./views/items.js";
import { clearFilter } from "./components/tag-chips.js";

const views = {
  trip: { render: renderTrip, container: () => document.getElementById("view-trip") },
  lists: { render: renderLists, container: () => document.getElementById("view-lists") },
  items: { render: renderItems, container: () => document.getElementById("view-items") },
};

let currentView = "trip";
let currentParams = [];

function navigate() {
  const hash = location.hash.slice(1) || "trip";
  const [view, ...params] = hash.split("/");
  const newView = views[view] ? view : "trip";

  if (newView !== currentView) {
    clearFilter();
  }

  currentView = newView;
  currentParams = params;

  // Update tab active state
  document.querySelectorAll(".tab").forEach(el => {
    el.classList.toggle("active", el.dataset.view === currentView);
  });

  // Toggle view containers
  document.querySelectorAll(".view-container").forEach(el => {
    el.classList.toggle("active", el.id === `view-${currentView}`);
  });

  renderCurrentView();
}

function renderCurrentView() {
  const v = views[currentView];
  if (v) {
    v.render(store.getState(), v.container(), ...currentParams);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  store.init();
  store.subscribe(() => renderCurrentView());
  window.addEventListener("hashchange", navigate);
  navigate();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(err => {
      console.warn("SW registration failed:", err);
    });
  }
});
