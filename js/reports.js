/**
 * Meridian CRM — Reports
 */
import { initShell } from "./app-shell.js";
import { db, COL } from "./firebase-config.js";
import { formatCurrency, escapeHtml, qs, qsa } from "./utils.js";
import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const content = document.getElementById("pageContent");
let charts = {};
let cache = { leads: [], deals: [], customers: [], users: [] };
let activeTab = "sales";
const loaded = { leads: false, deals: false, customers: false, users: false };
const failedCols = new Set();

content.innerHTML = `
  <div class="page-header">
    <div><h1 class="page-title">Reports</h1><p class="page-subtitle">Sales, revenue, and team performance at a glance.</p></div>
    <div class="flex gap-2">
      <button class="btn btn-secondary" id="exportCsvBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
        Export CSV
      </button>
      <button class="btn btn-secondary" id="exportPdfBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>
        Export PDF
      </button>
    </div>
  </div>

  <div class="tabs" id="reportTabs">
    <button class="tab-btn active" data-tab="sales">Sales</button>
    <button class="tab-btn" data-tab="revenue">Revenue</button>
    <button class="tab-btn" data-tab="growth">Customer Growth</button>
    <button class="tab-btn" data-tab="conversion">Lead Conversion</button>
    <button class="tab-btn" data-tab="staff">Staff Performance</button>
    <button class="tab-btn" data-tab="annual">Annual</button>
    <span class="badge badge-teal" style="margin-left:auto;flex:none;align-self:center;gap:5px;"><span class="live-dot"></span>Live</span>
  </div>

  <div id="reportRoot" style="margin-top:var(--sp-5);">
    <div class="stat-grid" id="reportSkeleton">
      <div class="skeleton" style="height:120px;border-radius:14px;"></div>
      <div class="skeleton" style="height:120px;border-radius:14px;"></div>
      <div class="skeleton" style="height:120px;border-radius:14px;"></div>
      <div class="skeleton" style="height:120px;border-radius:14px;"></div>
    </div>
  </div>
`;

initShell("reports").then(() => {
  startRealtimeListeners();
  qsa("#reportTabs .tab-btn").forEach((btn) => btn.addEventListener("click", () => {
    qsa("#reportTabs .tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    activeTab = btn.dataset.tab;
    renderTab(activeTab);
  }));
  document.getElementById("exportCsvBtn").addEventListener("click", exportCsv);
  document.getElementById("exportPdfBtn").addEventListener("click", () => window.print());
});

function startRealtimeListeners() {
  listenCol(COL.LEADS, "leads");
  listenCol(COL.DEALS, "deals");
  listenCol(COL.CUSTOMERS, "customers");
  listenCol(COL.USERS, "users");
}

function listenCol(colName, key) {
  try {
    onSnapshot(collection(db, colName), (snap) => {
      cache[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      loaded[key] = true;
      failedCols.delete(colName);
      renderErrorBanner();
      if (Object.values(loaded).every(Boolean)) renderTab(activeTab);
    }, (err) => {
      console.error(`Reports: realtime listener failed for "${colName}"`, err);
      failedCols.add(colName);
      loaded[key] = true;
      renderErrorBanner();
      if (Object.values(loaded).every(Boolean)) renderTab(activeTab);
    });
  } catch (e) {
    console.error(`Reports: couldn't attach listener for "${colName}"`, e);
    failedCols.add(colName);
    loaded[key] = true;
    renderErrorBanner();
  }
}

function renderErrorBanner() {
  const existing = document.getElementById("reportErrorBanner");
  if (!failedCols.size) { existing?.remove(); return; }
  const html = `<div class="verify-banner" id="reportErrorBanner" style="background:var(--danger-soft);border-color:var(--danger);color:var(--danger);margin-bottom:var(--sp-4);">
    Couldn't load live data for: <b>${[...failedCols].join(", ")}</b>.
    This usually means a Firestore permission issue for your account's role — reports need Admin, Super Admin, or Sales Manager. Open the browser console for full details.
  </div>`;
  if (existing) existing.outerHTML = html;
  else document.getElementById("reportRoot").insertAdjacentHTML("beforebegin", html);
}

function months(n = 12) {
  return Array.from({ length: n }).map((_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - (n - 1 - i));
    return { label: d.toLocaleString("default", { month: "short" }), m: d.getMonth(), y: d.getFullYear() };
  });
}
function inMonth(ts, m) {
  const d = ts?.toDate ? ts.toDate() : null;
  return d && d.getMonth() === m.m && d.getFullYear() === m.y;
}

function renderTab(tab) {
  const root = document.getElementById("reportRoot");
  const { leads, deals, customers, users } = cache;

  if (tab === "sales") {
    const won = deals.filter((d) => d.stage === "closed_won");
    const lost = deals.filter((d) => d.stage === "closed_lost");
    const open = deals.filter((d) => !["closed_won", "closed_lost"].includes(d.stage));
    root.innerHTML = `
      <div class="stat-grid">
        ${statCard("Deals Won", won.length, "teal")}
        ${statCard("Deals Lost", lost.length, "red")}
        ${statCard("Open Opportunities", open.length, "blue")}
        ${statCard("Win Rate", (won.length + lost.length) ? Math.round((won.length / (won.length + lost.length)) * 100) + "%" : "—", "gold")}
      </div>
      <div class="card"><div class="card-header"><h3>Deals Closed by Month</h3></div><div class="card-body"><canvas id="chartSales" height="90"></canvas></div></div>
    `;
    drawChart("chartSales", "bar", months().map((m) => m.label), [
      { label: "Won", data: months().map((m) => deals.filter((d) => d.stage === "closed_won" && inMonth(d.closedAt, m)).length), backgroundColor: "#1F8A6F" },
      { label: "Lost", data: months().map((m) => deals.filter((d) => d.stage === "closed_lost" && inMonth(d.closedAt, m)).length), backgroundColor: "#D64545" }
    ]);
  }

  if (tab === "revenue") {
    const won = deals.filter((d) => d.stage === "closed_won");
    const totalRevenue = won.reduce((s, d) => s + (Number(d.value) || 0), 0);
    root.innerHTML = `
      <div class="stat-grid">
        ${statCard("Total Revenue", formatCurrency(totalRevenue), "teal")}
        ${statCard("Avg. Deal Size", formatCurrency(won.length ? totalRevenue / won.length : 0), "gold")}
        ${statCard("Deals Won", won.length, "blue")}
        ${statCard("Pipeline Value", formatCurrency(deals.filter((d) => !["closed_won", "closed_lost"].includes(d.stage)).reduce((s, d) => s + (Number(d.value) || 0), 0)), "blue")}
      </div>
      <div class="card"><div class="card-header"><h3>Revenue by Month</h3></div><div class="card-body"><canvas id="chartRevenue" height="90"></canvas></div></div>
    `;
    drawChart("chartRevenue", "line", months().map((m) => m.label), [
      { label: "Revenue", data: months().map((m) => won.filter((d) => inMonth(d.closedAt, m)).reduce((s, d) => s + (Number(d.value) || 0), 0)), borderColor: "#145C4B", backgroundColor: "rgba(20,92,75,.12)", fill: true, tension: .35 }
    ]);
  }

  if (tab === "growth") {
    root.innerHTML = `
      <div class="stat-grid">
        ${statCard("Total Customers", customers.length, "teal")}
        ${statCard("New This Month", customers.filter((c) => inMonth(c.createdAt, months(1)[0])).length, "gold")}
      </div>
      <div class="card"><div class="card-header"><h3>Customer Growth</h3></div><div class="card-body"><canvas id="chartGrowth" height="90"></canvas></div></div>
    `;
    let running = 0;
    const cumulative = months().map((m) => {
      running += customers.filter((c) => inMonth(c.createdAt, m)).length;
      return running;
    });
    drawChart("chartGrowth", "line", months().map((m) => m.label), [
      { label: "Total Customers", data: cumulative, borderColor: "#2F6FED", backgroundColor: "rgba(47,111,237,.12)", fill: true, tension: .35 }
    ]);
  }

  if (tab === "conversion") {
    const won = leads.filter((l) => l.stage === "won").length;
    const total = leads.length;
    const rate = total ? Math.round((won / total) * 100) : 0;
    root.innerHTML = `
      <div class="stat-grid">
        ${statCard("Total Leads", total, "blue")}
        ${statCard("Converted (Won)", won, "teal")}
        ${statCard("Conversion Rate", rate + "%", "gold")}
        ${statCard("Lost", leads.filter((l) => l.stage === "lost").length, "red")}
      </div>
      <div class="card"><div class="card-header"><h3>Lead Funnel</h3></div><div class="card-body"><canvas id="chartFunnel" height="100"></canvas></div></div>
    `;
    const stages = ["new", "contacted", "qualified", "proposal_sent", "negotiation", "won"];
    drawChart("chartFunnel", "bar", stages.map((s) => s.replace("_", " ")), [
      { label: "Leads", data: stages.map((s) => leads.filter((l) => l.stage === s).length), backgroundColor: "#1F8A6F", borderRadius: 6 }
    ], true);
  }

  if (tab === "staff") {
    const rows = users.map((u) => {
      const userDeals = deals.filter((d) => d.ownerId === u.id);
      const won = userDeals.filter((d) => d.stage === "closed_won");
      const revenue = won.reduce((s, d) => s + (Number(d.value) || 0), 0);
      const userLeads = leads.filter((l) => l.assignedTo === u.id);
      return { name: u.name, role: u.role, deals: userDeals.length, won: won.length, revenue, leads: userLeads.length };
    }).sort((a, b) => b.revenue - a.revenue);

    root.innerHTML = `
      <div class="card">
        <div class="card-header"><h3>Staff Performance</h3></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Staff</th><th>Role</th><th>Leads</th><th>Deals</th><th>Won</th><th>Revenue</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map((r) => `<tr><td class="cell-primary">${escapeHtml(r.name)}</td><td style="text-transform:capitalize;">${(r.role || "").replace("_", " ")}</td><td>${r.leads}</td><td>${r.deals}</td><td>${r.won}</td><td class="mono">${formatCurrency(r.revenue)}</td></tr>`).join("") : `<tr><td colspan="6"><div class="empty-state"><h4>No staff data yet</h4><p>Performance will populate once deals are assigned.</p></div></td></tr>`}
          </tbody>
        </table></div>
      </div>
    `;
  }

  if (tab === "annual") {
    const thisYear = new Date().getFullYear();
    const yearDeals = deals.filter((d) => d.stage === "closed_won" && d.closedAt?.toDate?.().getFullYear() === thisYear);
    const revenue = yearDeals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    root.innerHTML = `
      <div class="stat-grid">
        ${statCard(`${thisYear} Revenue`, formatCurrency(revenue), "teal")}
        ${statCard("Deals Won (YTD)", yearDeals.length, "gold")}
        ${statCard("New Customers (YTD)", customers.filter((c) => c.createdAt?.toDate?.().getFullYear() === thisYear).length, "blue")}
        ${statCard("New Leads (YTD)", leads.filter((l) => l.createdAt?.toDate?.().getFullYear() === thisYear).length, "blue")}
      </div>
      <div class="card"><div class="card-header"><h3>${thisYear} Monthly Breakdown</h3></div><div class="card-body"><canvas id="chartAnnual" height="90"></canvas></div></div>
    `;
    const monthLabels = Array.from({ length: 12 }).map((_, i) => new Date(thisYear, i).toLocaleString("default", { month: "short" }));
    drawChart("chartAnnual", "bar", monthLabels, [
      { label: "Revenue", data: monthLabels.map((_, i) => deals.filter((d) => d.stage === "closed_won" && d.closedAt?.toDate?.().getMonth() === i && d.closedAt?.toDate?.().getFullYear() === thisYear).reduce((s, d) => s + (Number(d.value) || 0), 0)), backgroundColor: "#145C4B", borderRadius: 6 }
    ]);
  }
}

function statCard(label, value, cls) {
  return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="color:var(--${cls === "teal" ? "success" : cls === "gold" ? "accent" : cls === "red" ? "danger" : "info"});">${value}</div></div>`;
}

function drawChart(canvasId, type, labels, datasets, horizontal = false) {
  const ctx = document.getElementById(canvasId);
  if (!ctx) return;
  if (charts[canvasId]) charts[canvasId].destroy();
  charts[canvasId] = new Chart(ctx, {
    type,
    data: { labels, datasets },
    options: {
      indexAxis: horizontal ? "y" : "x",
      responsive: true,
      plugins: { legend: { display: datasets.length > 1, position: "bottom", labels: { boxWidth: 10, usePointStyle: true } } },
      scales: { y: { grid: { color: "rgba(150,150,150,.1)" } }, x: { grid: { display: false } } }
    }
  });
}

function exportCsv() {
  const { deals } = cache;
  const rows = [["Title", "Stage", "Value", "Owner", "Expected Close"]];
  deals.forEach((d) => rows.push([d.title, d.stage, d.value || 0, d.ownerId || "", d.expectedCloseDate || ""]));
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `meridian-deals-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}
