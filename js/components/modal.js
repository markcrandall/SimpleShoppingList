let currentHandler = null;

export function openModal(contentHtml, onAction) {
  const overlay = document.getElementById("modal-overlay");
  const content = document.getElementById("modal-content");
  content.innerHTML = contentHtml;
  overlay.classList.remove("hidden");

  // Clean up previous handler
  if (currentHandler) {
    content.removeEventListener("click", currentHandler);
  }

  currentHandler = (e) => {
    const target = e.target.closest("[data-action]");
    if (target) {
      onAction(target.dataset.action, target.dataset);
    }
  };

  content.addEventListener("click", currentHandler);

  // Close on backdrop click
  overlay.onclick = (e) => {
    if (e.target === overlay) closeModal();
  };

  // Focus first input if present
  requestAnimationFrame(() => {
    const input = content.querySelector("input");
    if (input) input.focus();
  });
}

export function closeModal() {
  const overlay = document.getElementById("modal-overlay");
  overlay.classList.add("hidden");
  document.getElementById("modal-content").innerHTML = "";
  if (currentHandler) {
    document.getElementById("modal-content").removeEventListener("click", currentHandler);
    currentHandler = null;
  }
}
