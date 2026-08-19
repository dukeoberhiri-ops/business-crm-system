/**
 * Meridian CRM — Dashboard
 */
import { initShell, getCurrentProfile } from "./app-shell.js";
import { db, COL } from "./firebase-config.js";
import { can } from "./roles.js";
import { formatCurrency, formatDateTime, timeAgo, skeletonCards, initials, qs } from "./utils.js";
import {
  collection, query, where, orderBy, limit, getDocs, onSnapshot, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

let content, revenueChartInstance, pipelineChartInstance;

initShell("dashboard").then(({ user, profile }) => {
  content = document.getElementById("pageContent");
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Welcome back<span id="greetName"></span> 👋</h1>
        <p class="page-subtitle">Here's what's happening across your pipeline today.</p>
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
          <select id="chartRange" style="width:auto;height:32px;font-size:12px;">
            <option value="6">Last 6 months</option>
            <option value="12" selected>Last 12 months</option>
          </select>
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
  `;

  qs("#greetName").textContent = `, ${profile.name.split(" ")[0]}`;
  loadStats(profile);
  loadRevenueChart();
  loadPipelineChart();
  loadTasksToday(user, profile);
  loadUpcomingMeetings(user, profile);
  loadActivityFeed();
});

let statsLoadFailed = false;
async function safeCount(colName, constraints = []) {
  try {
    const snap = await getDocs(query(collection(db, colName), ...constraints));
    return { size: snap.size, docs: snap.docs };
  } catch (e) {
    console.error(`Dashboard: failed to query "${colName}"`, e);
    statsLoadFailed = true;
    return { size: 0, docs: [] };
  }
}

async function loadStats(profile) {
  const [customers, leadsNew, dealsWon, dealsLost, activeOpps, tasksToday] = await Promise.all([
    safeCount(COL.CUSTOMERS),
    safeCount(COL.LEADS, [where("stage", "==", "new")]),
    safeCount(COL.DEALS, [where("stage", "==", "closed_won")]),
    safeCount(COL.DEALS, [where("stage", "==", "closed_lost")]),
    safeCount(COL.DEALS, [where("stage", "not-in", ["closed_won", "closed_lost"])]),
    safeCount(COL.TASKS, [where("status", "!=", "completed")])
  ]);

  const monthlyRevenue = dealsWon.docs.reduce((sum, d) => {
    const data = d.data();
    const closedAt = data.closedAt?.toDate ? data.closedAt.toDate() : null;
    const now = new Date();
    if (closedAt && closedAt.getMonth() === now.getMonth() && closedAt.getFullYear() === now.getFullYear()) {
      return sum + (data.value || 0);
    }
    return sum;
  }, 0);

  const cards = [
    { label: "Total Customers", value: customers.size, icon: "building", cls: "teal", delta: "+4.2%", up: true },
    { label: "New Leads", value: leadsNew.size, icon: "user-plus", cls: "blue", delta: "+12%", up: true },
    { label: "Deals Won", value: dealsWon.size, icon: "trending-up", cls: "gold", delta: "+8%", up: true },
    { label: "Deals Lost", value: dealsLost.size, icon: "grid", cls: "red", delta: "-2%", up: false },
    { label: "Active Opportunities", value: activeOpps.size, icon: "trending-up", cls: "blue", delta: "+5%", up: true },
    { label: "Monthly Revenue", value: formatCurrency(monthlyRevenue), icon: "bar-chart", cls: "teal", delta: "+18%", up: true }
  ];

  document.getElementById("statGrid").innerHTML = cards.map((c) => `
    <div class="stat-card">
      <div class="stat-icon ${c.cls}">${iconSvg(c.icon)}</div>
      <div class="stat-label">${c.label}</div>
      <div class="stat-value">${c.value}</div>
      <div class="stat-delta ${c.up ? "up" : "down"}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          ${c.up ? '<path d="M18 15l-6-6-6 6"/>' : '<path d="M6 9l6 6 6-6"/>'}
        </svg>
        ${c.delta} vs last month
      </div>
    </div>
  `).join("") + (statsLoadFailed ? `<div class="verify-banner" style="grid-column:1/-1;background:var(--danger-soft);border-color:var(--danger);color:var(--danger);">Some dashboard data couldn't load — this usually means a Firestore permission issue for your role. Check the browser console for details.</div>` : "");

  // Sales target
  const target = profile.monthlyTarget || 100000;
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

async function loadRevenueChart() {
  const { docs } = await safeCount(COL.DEALS, [where("stage", "==", "closed_won")]);
  const months = Array.from({ length: 12 }).map((_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (11 - i));
    return { label: d.toLocaleString("default", { month: "short" }), month: d.getMonth(), year: d.getFullYear() };
  });
  const revenue = months.map((m) => docs.reduce((sum, d) => {
    const data = d.data();
    const closedAt = data.closedAt?.toDate ? data.closedAt.toDate() : null;
    if (closedAt && closedAt.getMonth() === m.month && closedAt.getFullYear() === m.year) return sum + (data.value || 0);
    return sum;
  }, 0));
  const wonCounts = months.map((m) => docs.filter((d) => {
    const data = d.data();
    const closedAt = data.closedAt?.toDate ? data.closedAt.toDate() : null;
    return closedAt && closedAt.getMonth() === m.month && closedAt.getFullYear() === m.year;
  }).length);

  const ctx = document.getElementById("revenueChart");
  if (revenueChartInstance) revenueChartInstance.destroy();
  revenueChartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: months.map((m) => m.label),
      datasets: [
        {
          label: "Revenue", data: revenue, borderColor: "#145C4B", backgroundColor: "rgba(20,92,75,.1)",
          fill: true, tension: 0.35, yAxisID: "y"
        },
        {
          label: "Deals Won", data: wonCounts, borderColor: "#C9A227", backgroundColor: "rgba(201,162,39,.1)",
          fill: false, tension: 0.35, yAxisID: "y1", borderDash: [4, 3]
        }
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

async function loadPipelineChart() {
  const { docs } = await safeCount(COL.DEALS);
  const stages = ["new_lead", "contacted", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"];
  const stageLabels = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Won", "Lost"];
  const counts = stages.map((s) => docs.filter((d) => d.data().stage === s).length);

  const ctx = document.getElementById("pipelineChart");
  if (pipelineChartInstance) pipelineChartInstance.destroy();
  pipelineChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels: stageLabels,
      datasets: [{ data: counts, backgroundColor: ["#1F8A6F","#3BA98A","#C9A227","#2F6FED","#E0A130","#145C4B","#D64545"], borderRadius: 6 }]
    },
    options: {
      indexAxis: "y",
      plugins: { legend: { display: false } },
      scales: { x: { ticks: { precision: 0 }, grid: { color: "rgba(150,150,150,.1)" } }, y: { grid: { display: false } } }
    }
  });
}

async function loadTasksToday(user, profile) {
  const el = document.getElementById("tasksToday");
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const constraints = [
    where("dueDate", ">=", Timestamp.fromDate(start)),
    where("dueDate", "<=", Timestamp.fromDate(end))
  ];
  if (!can(profile.role, "tasks.assignOthers")) constraints.push(where("assignedTo", "==", user.uid));
  const { docs } = await safeCount(COL.TASKS, constraints);
  if (!docs.length) {
    el.innerHTML = emptyState("check-square", "Nothing due today", "Enjoy the clear runway — new tasks will show up here.");
    return;
  }
  el.innerHTML = docs.slice(0, 6).map((d) => {
    const t = d.data();
    return `<div class="notif-item">
      <div class="notif-dot" style="background:${priorityColor(t.priority)};"></div>
      <div style="flex:1;">
        <div class="notif-text"><b>${t.title}</b></div>
        <div class="notif-time">${t.priority || "normal"} priority</div>
      </div>
      <span class="badge badge-gray">${(t.status || "pending").replace("_", " ")}</span>
    </div>`;
  }).join("");
}

async function loadUpcomingMeetings(user, profile) {
  const el = document.getElementById("upcomingMeetings");
  const now = Timestamp.fromDate(new Date());
  const { docs } = await safeCount(COL.EVENTS, [where("startTime", ">=", now), orderBy("startTime", "asc"), limit(6)]);
  if (!docs.length) {
    el.innerHTML = emptyState("calendar", "No upcoming meetings", "Schedule a call or meeting from the Calendar page.");
    return;
  }
  el.innerHTML = docs.map((d) => {
    const e = d.data();
    return `<div class="notif-item">
      <div class="notif-dot" style="background:var(--info);"></div>
      <div style="flex:1;">
        <div class="notif-text"><b>${e.title}</b></div>
        <div class="notif-time">${formatDateTime(e.startTime)}</div>
      </div>
      <span class="badge badge-blue">${e.type || "meeting"}</span>
    </div>`;
  }).join("");
}

async function loadActivityFeed() {
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
    });
  } catch (e) {
    el.innerHTML = emptyState("bar-chart", "No recent activity", "Actions across leads, deals, and tasks will appear here.");
  }
}

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
