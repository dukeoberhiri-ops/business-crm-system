/**
 * Meridian CRM — Dashboard (fully real-time)
 * A small number of live onSnapshot listeners feed a shared in-memory
 * cache; every render function recomputes from that cache, so any change
 * anywhere in the app (by this user or a teammate) updates the dashboard
 * instantly with no refresh needed.
 */
import { initShell } from "./app-shell.js";
import { db, COL } from "./firebase-config.js";
import { can } from "./roles.js";
import { formatCurrency, formatDateTime, timeAgo, skeletonCards, initials, qs, toast } from "./utils.js";
import {
  collection, query, where, orderBy, limit, onSnapshot, getDocs, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let content, revenueChartInstance, pipelineChartInstance;
let ctxUser, ctxProfile;
let statsLoadFailed = false;

const cache = { customers: [], leads: [], deals: [], tasks: [], events: [] };
const loaded = { customers: false, leads: false, deals: false, tasks: false, events: false };

initShell("dashboard").then(({ user, profile }) => {
  ctxUser = user; ctxProfile = profile;
  content = document.getElementById("pageContent");
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Welcome back<span id="greetName"></span> 👋</h1>
        <p class="page-subtitle">Here's what's happening across your pipeline today — live.</p>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-secondary" id="exportBtn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>
          Export snapshot
        </button>
        <a href="leads.html" class="btn btn-primary">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          New Lead
        </a>
      </div>
    </div>

    <div class="stat-grid" id="statGrid">${skeletonCards(6)}</div>

    <div class="grid-2">
      <div class="card" style="margin-bottom:var(--sp-5);">
        <div class="card-header">
          <h3>Revenue &amp; Deals Won</h3>
          <span class="badge badge-teal" style="gap:5px;"><span class="live-dot"></span>Live</span>
        </div>
        <div class="card-body"><canvas id="revenueChart" height="230"></canvas></div>
      </div>

      <div class="card" style="margin-bottom:var(--sp-5);">
        <div class="card-header"><h3>Sales Target Progress</h3></div>
        <div class="card-body" id="targetProgress">
          <div class="skeleton skeleton-text" style="width:60%;"></div>
        </div>
        <div class="card-header" style="border-top:1px solid var(--border);"><h3>Pipeline by Stage</h3></div>
        <div class="card-body"><canvas id="pipelineChart" height="180"></canvas></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <div class="card-header">
          <h3>Tasks Due Today</h3>
          <a href="tasks.html" class="btn btn-ghost btn-sm">View all</a>
        </div>
        <div id="tasksToday"><div class="skeleton-row"><div class="skeleton skeleton-circle"></div><div style="flex:1;"><div class="skeleton skeleton-text"></div></div></div></div>
      </div>
      <div class="card">
        <div class="card-header">
          <h3>Upcoming Meetings</h3>
          <a href="calendar.html" class="btn btn-ghost btn-sm">View calendar</a>
        </div>
        <div id="upcomingMeetings"><div class="skeleton-row"><div class="skeleton skeleton-circle"></div><div style="flex:1;"><div class="skeleton skeleton-text"></div></div></div></div>
      </div>
    </div>

    <div class="card" style="margin-top:var(--sp-5);">
      <div class="card-header"><h3>Recent Activity</h3></div>
      <div id="activityFeed"><div class="skeleton-row"><div class="skeleton skeleton-circle"></div><div style="flex:1;"><div class="skeleton skeleton-text"></div></div></div></div>
    </div>

    ${can(profile.role, "leads.viewAll") ? "" : `
    <div class="card" style="margin-top:var(--sp-5);">
      <div class="card-header"><h3>Message Your Manager</h3></div>
      <div class="card-body">
        <div class="flex gap-2" style="align-items:flex-start;">
          <textarea id="managerMessageInput" placeholder="Ask a question, flag a blocker, or share an update — it'll land in your manager's notifications instantly." style="flex:1;min-height:56px;"></textarea>
          <button class="btn btn-primary" id="sendManagerMessageBtn" style="flex:none;">Send</button>
        </div>
      </div>
    </div>`}
  `;

  if (!can(profile.role, "leads.viewAll")) wireManagerMessage(user, profile);

  qs("#greetName").textContent = `, ${profile.name.split(" ")[0]}`;
  startRealtimeListeners(user, profile);
  loadActivityFeed();
});

/* ------------------------------------------------------------- Live listeners */
function startRealtimeListeners(user, profile) {
  const isManager = can(profile.role, "leads.viewAll");

  listenCollection(COL.CUSTOMERS, "customers", []);
  listenCollection(COL.LEADS, "leads", isManager ? [] : [where("assignedTo", "==", user.uid)]);
  listenCollection(COL.DEALS, "deals", isManager ? [] : [where("ownerId", "==", user.uid)]);
  listenCollection(COL.TASKS, "tasks", isManager ? [] : [where("assignedTo", "==", user.uid)]);
  listenCollection(COL.EVENTS, "events", []);
}

function listenCollection(colName, key, constraints) {
  try {
    const q = query(collection(db, colName), ...constraints);
    onSnapshot(q, (snap) => {
      cache[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      loaded[key] = true;
      renderDashboard();
    }, (err) => {
      console.error(`Dashboard: realtime listener failed for "${colName}"`, err);
      statsLoadFailed = true;
      loaded[key] = true;
      renderDashboard();
    });
  } catch (e) {
    console.error(`Dashboard: couldn't attach listener for "${colName}"`, e);
    statsLoadFailed = true;
    loaded[key] = true;
    renderDashboard();
  }
}

function renderDashboard() {
  if (!Object.values(loaded).every(Boolean)) return; // wait for the first snapshot of every collection
  renderStats();
  renderRevenueChart();
  renderPipelineChart();
  renderTasksToday();
  renderUpcomingMeetings();
}

/* ------------------------------------------------------------- Manager message */
async function wireManagerMessage(user, profile) {
  const btn = document.getElementById("sendManagerMessageBtn");
  const input = document.getElementById("managerMessageInput");
  if (!btn || !input) return;
  btn.addEventListener("click", async () => {
    const text = input.value.trim();
    if (!text) return;
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      const snap = await getDocs(query(collection(db, COL.USERS), where("role", "in", ["admin", "super_admin", "sales_manager"])));
      await Promise.all(snap.docs.map((d) => addDoc(collection(db, COL.NOTIFICATIONS), {
        userId: d.id, title: `Message from ${profile.name}`, message: text,
        type: "team_message", read: false, createdAt: serverTimestamp()
      })));
      await addDoc(collection(db, COL.ACTIVITY), {
        description: "sent a message to their manager", actorName: profile.name, createdAt: serverTimestamp()
      });
      input.value = "";
      toast({ type: "success", title: "Message sent", message: snap.empty ? "No managers found yet, but it's on record." : "Your manager will see it in their notifications instantly." });
    } catch (err) {
      toast({ type: "error", title: "Couldn't send message", message: err.message });
    }
    btn.disabled = false; btn.textContent = "Send";
  });
}

/* ------------------------------------------------------------- Stat cards */
function renderStats() {
  const now = new Date();
  const leadsNew = cache.leads.filter((l) => l.stage === "new");
  const dealsWon = cache.deals.filter((d) => d.stage === "closed_won");
  const dealsLost = cache.deals.filter((d) => d.stage === "closed_lost");
  const activeOpps = cache.deals.filter((d) => !["closed_won", "closed_lost"].includes(d.stage));

  const monthlyRevenue = dealsWon.reduce((sum, d) => {
    const closedAt = d.closedAt?.toDate ? d.closedAt.toDate() : null;
    if (closedAt && closedAt.getMonth() === now.getMonth() && closedAt.getFullYear() === now.getFullYear()) {
      return sum + (Number(d.value) || 0);
    }
    return sum;
  }, 0);

  const cards = [
    { label: "Total Customers", value: cache.customers.length, icon: "building", cls: "teal" },
    { label: "New Leads", value: leadsNew.length, icon: "user-plus", cls: "blue" },
    { label: "Deals Won", value: dealsWon.length, icon: "trending-up", cls: "gold" },
    { label: "Deals Lost", value: dealsLost.length, icon: "grid", cls: "red" },
    { label: "Active Opportunities", value: activeOpps.length, icon: "trending-up", cls: "blue" },
    { label: "Monthly Revenue", value: formatCurrency(monthlyRevenue), icon: "bar-chart", cls: "teal" }
  ];

  document.getElementById("statGrid").innerHTML = cards.map((c) => `
    <div class="stat-card">
      <div class="stat-icon ${c.cls}">${iconSvg(c.icon)}</div>
      <div class="stat-label">${c.label}</div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-delta up"><span class="live-dot"></span>Live</div>
    </div>
  `).join("") + (statsLoadFailed ? `<div class="verify-banner" style="grid-column:1/-1;background:var(--danger-soft);border-color:var(--danger);color:var(--danger);">Some dashboard data couldn't load — this usually means a Firestore permission issue for your role. Check the browser console for details.</div>` : "");

  const target = ctxProfile.monthlyTarget || 100000;
  const pct = Math.min(100, Math.round((monthlyRevenue / target) * 100));
  document.getElementById("targetProgress").innerHTML = `
    <div class="flex" style="justify-content:space-between;margin-bottom:8px;font-size:var(--fs-sm);">
      <span class="text-muted">${formatCurrency(monthlyRevenue)} of ${formatCurrency(target)}</span>
      <span style="font-weight:700;">${pct}%</span>
    </div>
    <div class="progress-bar"><div class="progress-bar-fill" style="width:${pct}%;"></div></div>
    <p class="text-faint" style="font-size:11px;margin-top:8px;">Target resets on the 1st of each month.</p>
  `;
}

/* ------------------------------------------------------------- Charts */
function renderRevenueChart() {
  const won = cache.deals.filter((d) => d.stage === "closed_won");
  const months = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (11 - i));
    return { label: d.toLocaleString("default", { month: "short" }), month: d.getMonth(), year: d.getFullYear() };
  });
  const revenue = months.map((m) => won.reduce((sum, d) => {
    const closedAt = d.closedAt?.toDate ? d.closedAt.toDate() : null;
    if (closedAt && closedAt.getMonth() === m.month && closedAt.getFullYear() === m.year) return sum + (Number(d.value) || 0);
    return sum;
  }, 0));
  const wonCounts = months.map((m) => won.filter((d) => {
    const closedAt = d.closedAt?.toDate ? d.closedAt.toDate() : null;
    return closedAt && closedAt.getMonth() === m.month && closedAt.getFullYear() === m.year;
  }).length);

  const ctx = document.getElementById("revenueChart");
  if (!ctx) return;
  if (revenueChartInstance) revenueChartInstance.destroy();
  revenueChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: months.map((m) => m.label),
      datasets: [
        { label: "Revenue", data: revenue, borderColor: "#145C4B", backgroundColor: "rgba(20,92,75,.1)", fill: true, tension: 0.35, yAxisID: "y" },
        { label: "Deals Won", data: wonCounts, borderColor: "#C9A227", backgroundColor: "rgba(201,162,39,.1)", fill: false, tension: 0.35, yAxisID: "y1", borderDash: [4, 3] }
      ]
    },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { position: "bottom", labels: { boxWidth: 10, usePointStyle: true } } },
      scales: {
        y: { position: "left", grid: { color: "rgba(150,150,150,.1)" }, ticks: { callback: (v) => "$" + v / 1000 + "k" } },
        y1: { position: "right", grid: { display: false }, ticks: { precision: 0 } }
      }
    }
  });
}

function renderPipelineChart() {
  const stages = ["new_lead", "contacted", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"];
  const stageLabels = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
  const counts = stages.map((s) => cache.deals.filter((d) => d.stage === s).length);

  const ctx = document.getElementById("pipelineChart");
  if (!ctx) return;
  if (pipelineChartInstance) pipelineChartInstance.destroy();
  pipelineChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: stageLabels,
      datasets: [{ data: counts, backgroundColor: ["#1F8A6F", "#3BA98A", "#C9A227", "#2F6FED", "#E0A130", "#145C4B", "#D64545"], borderRadius: 6 }]
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { precision: 0 }, grid: { color: "rgba(150,150,150,.1)" } }, y: { grid: { display: false } } }
    }
  });
}

/* ------------------------------------------------------------- Tasks & meetings */
function renderTasksToday() {
  const el = document.getElementById("tasksToday");
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const todays = cache.tasks.filter((t) => {
    const d = t.dueDate?.toDate ? t.dueDate.toDate() : null;
    return d && d >= start && d <= end;
  });
  if (!todays.length) {
    el.innerHTML = emptyState("check-square", "Nothing due today", "Enjoy the clear runway — new tasks will show up here.");
    return;
  }
  el.innerHTML = todays.slice(0, 6).map((t) => `<div class="notif-item">
      <div class="notif-dot" style="background:${priorityColor(t.priority)};"></div>
      <div style="flex:1;">
        <div class="notif-text"><b>${t.title}</b></div>
        <div class="notif-time">${t.priority || "normal"} priority</div>
      </div>
      <span class="badge badge-gray">${(t.status || "pending").replace("_", " ")}</span>
    </div>`).join("");
}

function renderUpcomingMeetings() {
  const el = document.getElementById("upcomingMeetings");
  const now = new Date();
  const upcoming = cache.events
    .filter((e) => { const d = e.startTime?.toDate ? e.startTime.toDate() : null; return d && d >= now; })
    .sort((a, b) => (a.startTime?.toMillis() || 0) - (b.startTime?.toMillis() || 0));
  if (!upcoming.length) {
    el.innerHTML = emptyState("calendar", "No upcoming meetings", "Schedule a call or meeting from the Calendar page.");
    return;
  }
  el.innerHTML = upcoming.slice(0, 6).map((e) => `<div class="notif-item">
      <div class="notif-dot" style="background:var(--info);"></div>
      <div style="flex:1;">
        <div class="notif-text"><b>${e.title}</b></div>
        <div class="notif-time">${formatDateTime(e.startTime)}</div>
      </div>
      <span class="badge badge-blue">${e.type || "meeting"}</span>
    </div>`).join("");
}

/* ------------------------------------------------------------- Activity feed */
function loadActivityFeed() {
  const el = document.getElementById("activityFeed");
  try {
    const q = query(collection(db, COL.ACTIVITY), orderBy("createdAt", "desc"), limit(10));
    onSnapshot(q, (snap) => {
      if (snap.empty) {
        el.innerHTML = emptyState("bar-chart", "No recent activity", "Actions across leads, deals, and tasks will appear here.");
        return;
      }
      el.innerHTML = snap.docs.map((d) => {
        const a = d.data();
        return `<div class="notif-item">
          <div class="avatar" style="width:30px;height:30px;font-size:11px;">${initials(a.actorName || "?")}</div>
          <div style="flex:1;">
            <div class="notif-text"><b>${a.actorName || "Someone"}</b> ${a.description}</div>
            <div class="notif-time">${timeAgo(a.createdAt)}</div>
          </div>
        </div>`;
      }).join("");
    }, (err) => {
      console.error("Dashboard: activity feed listener failed", err);
      el.innerHTML = emptyState("bar-chart", "No recent activity", "Actions across leads, deals, and tasks will appear here.");
    });
  } catch (e) {
    el.innerHTML = emptyState("bar-chart", "No recent activity", "Actions across leads, deals, and tasks will appear here.");
  }
}

/* ------------------------------------------------------------- Helpers */
function priorityColor(p) {
  return p === "high" ? "var(--danger)" : p === "medium" ? "var(--warning)" : "var(--text-faint)";
}
function iconSvg(name) {
  const paths = {
    building: `<path d="M3 21h18M6 21V5a1 1 0 011-1h6a1 1 0 011 1v16M18 21V10a1 1 0 00-1-1h-2"/>`,
    "user-plus": `<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>`,
    "trending-up": `<path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/>`,
    grid: `<path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/>`,
    "bar-chart": `<path d="M12 20V10M18 20V4M6 20v-4"/>`
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ""}</svg>`;
}
function emptyState(iconName, title, msg) {
  return `<div class="empty-state">
    <div class="empty-icon">${iconSvg(iconName)}</div>
    <h4>${title}</h4><p>${msg}</p>
  </div>`;
}
