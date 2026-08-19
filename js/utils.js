/**
 * Meridian CRM — Shared Utilities
 * Toasts, modals, confirm dialogs, skeleton loaders, formatters, debounce.
 */

/* ------------------------------------------------------------------ Toasts */
const ICONS = {
  success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`,
  error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>`,
  info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>`,
  warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/></svg>`
};

function ensureToastRegion() {
  let region = document.querySelector(".toast-region");
  if (!region) {
    region = document.createElement("div");
    region.className = "toast-region";
    document.body.appendChild(region);
  }
  return region;
}

export function toast({ type = "info", title, message, duration = 4200 }) {
  const region = ensureToastRegion();
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `
    <div class="toast-icon">${ICONS[type] || ICONS.info}</div>
    <div>
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-msg">${message}</div>` : ""}
    </div>
    <button class="toast-close" aria-label="Dismiss">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>`;
  region.appendChild(el);
  const remove = () => {
    el.classList.add("closing");
    setTimeout(() => el.remove(), 200);
  };
  el.querySelector(".toast-close").addEventListener("click", remove);
  if (duration) setTimeout(remove, duration);
  return el;
}

/* ------------------------------------------------------------------ Modal */
export function openModal(overlayEl) {
  overlayEl.classList.add("open");
  document.body.style.overflow = "hidden";
}
export function closeModal(overlayEl) {
  overlayEl.classList.remove("open");
  document.body.style.overflow = "";
}
export function wireModalDismiss(overlayEl) {
  overlayEl.addEventListener("click", (e) => {
    if (e.target === overlayEl) closeModal(overlayEl);
  });
  overlayEl.querySelectorAll("[data-close-modal]").forEach((btn) =>
    btn.addEventListener("click", () => closeModal(overlayEl))
  );
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && overlayEl.classList.contains("open")) closeModal(overlayEl);
  });
}

/* ------------------------------------------------------------------ Confirm dialog */
let confirmOverlay = null;
export function confirmDialog({ title, message, confirmText = "Confirm", danger = true }) {
  return new Promise((resolve) => {
    if (!confirmOverlay) {
      confirmOverlay = document.createElement("div");
      confirmOverlay.className = "modal-overlay";
      document.body.appendChild(confirmOverlay);
    }
    confirmOverlay.innerHTML = `
      <div class="modal modal-sm">
        <div class="modal-body" style="text-align:center;padding-top:32px;">
          <div class="confirm-icon ${danger ? "danger" : "warn"}" style="margin-left:auto;margin-right:auto;">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>
            </svg>
          </div>
          <h3 style="margin-bottom:8px;">${title}</h3>
          <p class="text-muted" style="font-size:var(--fs-sm);">${message}</p>
        </div>
        <div class="modal-footer" style="justify-content:center;">
          <button class="btn btn-secondary" data-act="cancel">Cancel</button>
          <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok">${confirmText}</button>
        </div>
      </div>`;
    openModal(confirmOverlay);
    const cleanup = (result) => {
      closeModal(confirmOverlay);
      resolve(result);
    };
    confirmOverlay.querySelector('[data-act="cancel"]').onclick = () => cleanup(false);
    confirmOverlay.querySelector('[data-act="ok"]').onclick = () => cleanup(true);
    confirmOverlay.onclick = (e) => { if (e.target === confirmOverlay) cleanup(false); };
  });
}

/* ------------------------------------------------------------------ Skeletons */
export function skeletonRows(count = 5, cols = 4) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `<div class="skeleton-row">
      <div class="skeleton skeleton-circle"></div>
      <div style="flex:1;">
        ${Array.from({ length: cols }).map((_, c) =>
          `<div class="skeleton skeleton-text" style="width:${90 - c * 12}%;"></div>`).join("")}
      </div>
    </div>`;
  }
  return html;
}

export function skeletonCards(count = 4) {
  let html = "";
  for (let i = 0; i < count; i++) {
    html += `<div class="stat-card">
      <div class="skeleton" style="width:36px;height:36px;border-radius:10px;margin-bottom:12px;"></div>
      <div class="skeleton skeleton-text" style="width:60%;"></div>
      <div class="skeleton skeleton-text" style="width:40%;height:24px;"></div>
    </div>`;
  }
  return html;
}

/* ------------------------------------------------------------------ Formatters */
export function formatCurrency(n) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
}
export function formatDate(d) {
  if (!d) return "—";
  const date = d.toDate ? d.toDate() : new Date(d);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}
export function formatDateTime(d) {
  if (!d) return "—";
  const date = d.toDate ? d.toDate() : new Date(d);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}
export function timeAgo(d) {
  if (!d) return "";
  const date = d.toDate ? d.toDate() : new Date(d);
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return formatDate(date);
}
export function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() || "").join("") || "?";
}
export function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
export function debounce(fn, wait = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}
export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

/* ------------------------------------------------------------------ Activity log */
export async function logActivity(description, actorName) {
  try {
    const { db, COL } = await import("./firebase-config.js");
    const { collection, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
    await addDoc(collection(db, COL.ACTIVITY), { description, actorName: actorName || "Someone", createdAt: serverTimestamp() });
  } catch (e) { /* non-fatal: activity feed is a nice-to-have */ }
}

/* ------------------------------------------------------------------ Theme */
export function initTheme() {
  const saved = localStorage.getItem("meridian_theme") || "light";
  document.documentElement.setAttribute("data-theme", saved);
  return saved;
}
export function setTheme(mode) {
  document.documentElement.setAttribute("data-theme", mode);
  localStorage.setItem("meridian_theme", mode);
}
