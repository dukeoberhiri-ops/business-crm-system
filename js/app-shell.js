/**
 * Meridian CRM — App Shell
 * Renders sidebar + topbar into any protected page and wires up
 * theme toggling, the user menu, notifications, and global search.
 */
import { requireAuth, logoutUser } from "./auth.js";
import { db, COL } from "./firebase-config.js";
import { can, ROLE_LABELS, roleBadgeClass } from "./roles.js";
import { initTheme, setTheme, initials, timeAgo, qs, qsa, debounce } from "./utils.js";
import {
  collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc, writeBatch, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const NAV = [
  { section: "Overview", items: [
    { id: "dashboard", label: "Dashboard", href: "dashboard.html", icon: "grid" }
  ]},
  { section: "Sales", items: [
    { id: "leads", label: "Leads", href: "leads.html", icon: "user-plus" },
    { id: "pipeline", label: "Pipeline", href: "pipeline.html", icon: "trending-up" },
    { id: "customers", label: "Customers", href: "customers.html", icon: "building" }
  ]},
  { section: "Work", items: [
    { id: "tasks", label: "Tasks", href: "tasks.html", icon: "check-square" },
    { id: "calendar", label: "Calendar", href: "calendar.html", icon: "calendar" }
  ]},
  { section: "Insights", items: [
    { id: "reports", label: "Reports", href: "reports.html", icon: "bar-chart", permission: "reports.view" }
  ]},
  { section: "Account", items: [
    { id: "settings", label: "Settings", href: "settings.html", icon: "settings" }
  ]}
];

const ICONS = {
  grid: `<path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/>`,
  "user-plus": `<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>`,
  "trending-up": `<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>`,
  building: `<path d="M3 21h18M6 21V5a1 1 0 011-1h6a1 1 0 011 1v16M18 21V10a1 1 0 00-1-1h-2M9 8h.01M9 12h.01M9 16h.01"/>`,
  "check-square": `<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>`,
  calendar: `<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>`,
  "bar-chart": `<path d="M12 20V10M18 20V4M6 20v-4"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09A1.65 1.65 0 0015 4.6a1.65 1.65 0 001.82.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9c.14.32.44.55.8.62.36.07.7-.02.98-.24"/>`
};

function icon(name, extra = "") {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ${extra}>${ICONS[name] || ""}</svg>`;
}

let currentProfile = null;
let currentUser = null;

/**
 * Bootstraps a protected page: auth guard, shell render, listeners.
 * @param {string} activeNavId - id of the nav item to highlight
 * @returns {Promise<{user, profile}>}
 */
export async function initShell(activeNavId) {
  document.body.classList.add("shell-loading");
  const { user, profile } = await requireAuth();
  currentUser = user; currentProfile = profile;
  initTheme();
  renderShell(activeNavId, profile);
  wireShellEvents(profile);
  listenNotifications(user.uid);
  document.body.classList.remove("shell-loading");
  document.dispatchEvent(new CustomEvent("shell:ready", { detail: { user, profile } }));
  return { user, profile };
}

export function getCurrentProfile() { return currentProfile; }
export function getCurrentUser() { return currentUser; }

function renderShell(activeNavId, profile) {
  const mount = document.getElementById("app-shell");
  if (!mount) return;

  // If a page script already built #pageContent (before the shell existed),
  // detach it now so we can slot the same populated node back in below —
  // this avoids ever needing page scripts to wait on the shell to exist.
  const existingContent = document.getElementById("pageContent");
  if (existingContent && existingContent.parentElement) {
    existingContent.parentElement.removeChild(existingContent);
  }

  const navHtml = NAV.map((section) => {
    const items = section.items.filter((it) => !it.permission || can(profile.role, it.permission));
    if (!items.length) return "";
    return `
      <div class="nav-section-title">${section.section}</div>
      ${items.map((it) => `
        <a href="${it.href}" class="nav-item ${it.id === activeNavId ? "active" : ""}" data-nav="${it.id}">
          ${icon(it.icon)}
          <span class="nav-label">${it.label}</span>
        </a>`).join("")}
    `;
  }).join("");

  mount.innerHTML = `
    <div class="sidebar-scrim" id="sidebarScrim"></div>
    <aside class="sidebar" id="sidebar">
      <div class="brand">
        <div class="brand-mark">M</div>
        <span class="brand-name">Meridian</span>
      </div>
      <nav>${navHtml}</nav>
      <div class="sidebar-footer">
        <button class="collapse-btn" id="collapseBtn">
          ${icon("trending-up")}
          <span>Collapse</span>
        </button>
      </div>
    </aside>
    <div class="main-col">
      <header class="topbar">
        <button class="icon-btn mobile-menu-btn" id="mobileMenuBtn" aria-label="Open menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
        <div class="global-search" id="globalSearchWrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
          <input type="text" id="globalSearchInput" placeholder="Search leads, customers, deals, tasks..." autocomplete="off"/>
          <span class="kbd-hint">⌘K</span>
          <div class="dropdown-panel" id="searchResults" style="width:420px;"></div>
        </div>
        <div class="topbar-actions">
          <div class="theme-toggle" id="themeToggle">
            <button data-mode="light" aria-label="Light mode"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/></svg></button>
            <button data-mode="dark" aria-label="Dark mode"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg></button>
          </div>
          <div style="position:relative;">
            <button class="icon-btn" id="notifBtn" aria-label="Notifications">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
              <span class="dot-badge" id="notifDot" style="display:none;"></span>
            </button>
            <div class="dropdown-panel" id="notifPanel">
              <div class="dropdown-header"><span>Notifications</span><button class="btn btn-ghost btn-sm" id="markAllRead">Mark all read</button></div>
              <div id="notifList"><div class="empty-state" style="padding:32px 16px;"><p>You're all caught up.</p></div></div>
            </div>
          </div>
          <div style="position:relative;">
            <button class="user-menu" id="userMenuBtn">
              <div class="avatar" style="background:${profile.avatarColor || "var(--primary-soft)"}22;color:${profile.avatarColor || "var(--primary)"}">${initials(profile.name)}</div>
              <div style="text-align:left;">
                <div class="user-menu-name">${profile.name}</div>
                <div class="user-menu-role">${ROLE_LABELS[profile.role] || profile.role}</div>
              </div>
            </button>
            <div class="dropdown-panel" id="userMenuPanel" style="width:200px;">
              <a href="settings.html" class="menu-item">${icon("settings")} Profile Settings</a>
              <div class="menu-divider"></div>
              <button class="menu-item" id="logoutBtn" style="width:100%;color:var(--danger);">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>
                Log out
              </button>
            </div>
          </div>
        </div>
      </header>
      <main class="content" id="pageContentSlot"></main>
    </div>
  `;

  // Slot the pre-built content back in (preferred), or leave the fresh
  // empty placeholder in place for pages that build content after the
  // shell is ready (e.g. dashboard.js).
  const slot = document.getElementById("pageContentSlot");
  if (existingContent) {
    slot.replaceWith(existingContent);
    existingContent.style.display = "";
  } else {
    slot.id = "pageContent";
  }
}

function wireShellEvents(profile) {
  const shell = document.getElementById("app-shell");
  const sidebar = document.getElementById("sidebar");
  const scrim = document.getElementById("sidebarScrim");

  document.getElementById("mobileMenuBtn")?.addEventListener("click", () => {
    sidebar.classList.add("open"); scrim.classList.add("open");
  });
  scrim?.addEventListener("click", () => { sidebar.classList.remove("open"); scrim.classList.remove("open"); });

  document.getElementById("collapseBtn")?.addEventListener("click", () => {
    document.querySelector(".app-shell").classList.toggle("sidebar-collapsed");
  });

  // Theme toggle
  const themeToggle = document.getElementById("themeToggle");
  const applyThemeUI = () => {
    const mode = document.documentElement.getAttribute("data-theme");
    themeToggle.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  };
  themeToggle.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => { setTheme(b.dataset.mode); applyThemeUI(); })
  );
  applyThemeUI();

  // Dropdowns
  setupDropdown("notifBtn", "notifPanel");
  setupDropdown("userMenuBtn", "userMenuPanel");

  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await logoutUser();
    window.location.href = "index.html";
  });

  document.getElementById("markAllRead")?.addEventListener("click", markAllNotificationsRead);

  // Global search
  const searchInput = document.getElementById("globalSearchInput");
  const searchResults = document.getElementById("searchResults");
  searchInput?.addEventListener("input", debounce(async (e) => {
    const term = e.target.value.trim();
    if (term.length < 2) { searchResults.classList.remove("open"); return; }
    const results = await runGlobalSearch(term, profile);
    renderSearchResults(results, searchResults);
  }, 250));
  document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault(); searchInput?.focus();
    }
  });
  document.addEventListener("click", (e) => {
    if (!document.getElementById("globalSearchWrap").contains(e.target)) searchResults.classList.remove("open");
  });
}

function setupDropdown(btnId, panelId) {
  const btn = document.getElementById(btnId);
  const panel = document.getElementById(panelId);
  if (!btn || !panel) return;
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    qsa(".dropdown-panel").forEach((p) => { if (p !== panel) p.classList.remove("open"); });
    panel.classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!panel.contains(e.target) && e.target !== btn) panel.classList.remove("open");
  });
}

/* ------------------------------------------------------------- Search */
async function runGlobalSearch(term, profile) {
  const lower = term.toLowerCase();
  const collections = [
    { col: COL.LEADS, field: "name", type: "Lead", href: "leads.html" },
    { col: COL.CUSTOMERS, field: "companyName", type: "Customer", href: "customers.html" },
    { col: COL.DEALS, field: "title", type: "Deal", href: "pipeline.html" },
    { col: COL.TASKS, field: "title", type: "Task", href: "tasks.html" }
  ];
  const out = [];
  for (const c of collections) {
    try {
      const snap = await getDocs(query(collection(db, c.col), orderBy(c.field), limit(200)));
      snap.forEach((d) => {
        const data = d.data();
        const val = (data[c.field] || "").toString().toLowerCase();
        if (val.includes(lower)) out.push({ id: d.id, type: c.type, href: c.href, label: data[c.field], sub: data.companyName || data.email || "" });
      });
    } catch (e) { /* collection may not exist yet */ }
    if (out.length > 20) break;
  }
  return out.slice(0, 12);
}

function renderSearchResults(results, panel) {
  if (!results.length) {
    panel.innerHTML = `<div class="empty-state" style="padding:24px;"><p>No matches. Try a different term.</p></div>`;
  } else {
    panel.innerHTML = results.map((r) => `
      <a href="${r.href}" class="menu-item" style="padding:10px 16px;">
        <span class="badge badge-gray" style="min-width:64px;justify-content:center;">${r.type}</span>
        <span>
          <div style="font-weight:600;">${r.label}</div>
          ${r.sub ? `<div class="text-faint" style="font-size:11px;">${r.sub}</div>` : ""}
        </span>
      </a>`).join("");
  }
  panel.classList.add("open");
}

/* ------------------------------------------------------------- Notifications */
function listenNotifications(uid) {
  try {
    const q = query(collection(db, COL.NOTIFICATIONS), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(20));
    onSnapshot(q, (snap) => {
      const list = document.getElementById("notifList");
      const dot = document.getElementById("notifDot");
      if (!list) return;
      if (snap.empty) {
        list.innerHTML = `<div class="empty-state" style="padding:32px 16px;"><p>You're all caught up.</p></div>`;
        dot.style.display = "none";
        return;
      }
      let unread = false;
      list.innerHTML = snap.docs.map((d) => {
        const n = d.data();
        if (!n.read) unread = true;
        return `<div class="notif-item ${n.read ? "read" : ""}" data-id="${d.id}">
          <div class="notif-dot"></div>
          <div>
            <div class="notif-text"><b>${n.title}</b><br>${n.message || ""}</div>
            <div class="notif-time">${timeAgo(n.createdAt)}</div>
          </div>
        </div>`;
      }).join("");
      dot.style.display = unread ? "block" : "none";
    });
  } catch (e) { console.warn("Notification listener failed", e); }
}

async function markAllNotificationsRead() {
  if (!currentUser) return;
  const snap = await getDocs(query(collection(db, COL.NOTIFICATIONS), where("userId", "==", currentUser.uid), where("read", "==", false)));
  const batch = writeBatch(db);
  snap.forEach((d) => batch.update(doc(db, COL.NOTIFICATIONS, d.id), { read: true }));
  await batch.commit();
}

export { icon };
