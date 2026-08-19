/**
 * Meridian CRM — Sales Pipeline (Drag & Drop Kanban)
 */
import { initShell, getCurrentUser, getCurrentProfile } from "./app-shell.js";
import { db, COL } from "./firebase-config.js";
import {
  toast, confirmDialog, openModal, closeModal, wireModalDismiss,
  formatCurrency, escapeHtml, qs, qsa, logActivity
} from "./utils.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query,
  orderBy, serverTimestamp, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const STAGES = [
  { id: "new_lead", label: "New Lead" },
  { id: "contacted", label: "Contacted" },
  { id: "qualified", label: "Qualified" },
  { id: "proposal", label: "Proposal" },
  { id: "negotiation", label: "Negotiation" },
  { id: "closed_won", label: "Closed Won" },
  { id: "closed_lost", label: "Closed Lost" }
];

const content = document.getElementById("pageContent");
let allDeals = [];
let staffList = [];
let customersList = [];

content.innerHTML = `
  <div class="page-header">
    <div>
      <h1 class="page-title">Sales Pipeline</h1>
      <p class="page-subtitle">Drag opportunities between stages as deals progress.</p>
    </div>
    <div class="flex gap-2 items-center">
      <span class="text-muted" style="font-size:var(--fs-sm);">Total pipeline: <b id="pipelineTotal" class="mono">$0</b></span>
      <button class="btn btn-primary" id="addDealBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        New Deal
      </button>
    </div>
  </div>
  <div class="kanban-wrap" id="kanbanWrap"></div>
`;

initShell("pipeline").then(async () => {
  await Promise.all([loadStaff(), loadCustomers()]);
  listenDeals();
  document.getElementById("addDealBtn").addEventListener("click", () => openDealModal(null));
});

async function loadStaff() {
  try {
    const snap = await getDocs(collection(db, COL.USERS));
    staffList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const sel = document.getElementById("dealOwner");
    if (sel) staffList.forEach((s) => sel.insertAdjacentHTML("beforeend", `<option value="${s.id}">${s.name}</option>`));
  } catch (e) {}
}
async function loadCustomers() {
  try {
    const snap = await getDocs(collection(db, COL.CUSTOMERS));
    customersList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const sel = document.getElementById("dealCustomer");
    if (sel) customersList.forEach((c) => sel.insertAdjacentHTML("beforeend", `<option value="${c.id}">${c.companyName}</option>`));
  } catch (e) {}
}

function listenDeals() {
  const q = query(collection(db, COL.DEALS), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    allDeals = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderBoard();
  }, () => {
    document.getElementById("kanbanWrap").innerHTML = `<div class="empty-state" style="width:100%;"><h4>Couldn't load the pipeline</h4><p>Check your Firestore rules/indexes for the deals collection.</p></div>`;
  });
}

function renderBoard() {
  const total = allDeals.filter((d) => !["closed_won", "closed_lost"].includes(d.stage)).reduce((s, d) => s + (Number(d.value) || 0), 0);
  document.getElementById("pipelineTotal").textContent = formatCurrency(total);

  const wrap = document.getElementById("kanbanWrap");
  wrap.innerHTML = STAGES.map((stage) => {
    const deals = allDeals.filter((d) => d.stage === stage.id);
    const stageTotal = deals.reduce((s, d) => s + (Number(d.value) || 0), 0);
    return `
      <div class="kanban-col" data-stage="${stage.id}">
        <div class="kanban-col-header">
          <div class="kanban-col-title">${stage.label} <span class="kanban-col-count">${deals.length}</span></div>
        </div>
        <div class="kanban-col-total">${formatCurrency(stageTotal)}</div>
        <div class="kanban-cards" data-stage="${stage.id}">
          ${deals.length ? deals.map(cardHtml).join("") : `<div class="text-faint" style="font-size:11px;text-align:center;padding:16px 8px;">No deals here yet</div>`}
        </div>
      </div>`;
  }).join("");

  wireDragDrop();
  qsa(".kanban-card").forEach((c) => c.addEventListener("click", () => openDealModal(c.dataset.id)));
}

function cardHtml(deal) {
  const owner = staffList.find((s) => s.id === deal.ownerId);
  const customer = customersList.find((c) => c.id === deal.customerId);
  return `<div class="kanban-card" draggable="true" data-id="${deal.id}">
    <div class="kanban-card-title">${escapeHtml(deal.title)}</div>
    <div class="kanban-card-company">${escapeHtml(customer?.companyName || deal.companyName || "No company linked")}</div>
    <div class="kanban-card-foot">
      <span class="kanban-card-value">${formatCurrency(deal.value)}</span>
      ${owner ? `<div class="avatar tooltip" data-tip="${escapeHtml(owner.name)}" style="width:22px;height:22px;font-size:9px;">${owner.name.split(" ").map((p) => p[0]).join("").slice(0, 2)}</div>` : ""}
    </div>
  </div>`;
}

function wireDragDrop() {
  let draggedId = null;
  qsa(".kanban-card").forEach((card) => {
    card.addEventListener("dragstart", () => { draggedId = card.dataset.id; card.classList.add("dragging"); });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
  });
  qsa(".kanban-col").forEach((col) => {
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("drag-over"); });
    col.addEventListener("dragleave", () => col.classList.remove("drag-over"));
    col.addEventListener("drop", async (e) => {
      e.preventDefault();
      col.classList.remove("drag-over");
      const newStage = col.dataset.stage;
      const deal = allDeals.find((d) => d.id === draggedId);
      if (!deal || deal.stage === newStage) return;
      const update = { stage: newStage, updatedAt: serverTimestamp() };
      if (newStage === "closed_won" || newStage === "closed_lost") update.closedAt = serverTimestamp();
      await updateDoc(doc(db, COL.DEALS, draggedId), update);
      toast({ type: newStage === "closed_won" ? "success" : newStage === "closed_lost" ? "warning" : "info", title: `Moved to ${STAGES.find((s) => s.id === newStage).label}`, message: deal.title });
      const profile = getCurrentProfile();
      if (newStage === "closed_won") logActivity(`won the deal: ${deal.title}`, profile?.name);
      else if (newStage === "closed_lost") logActivity(`lost the deal: ${deal.title}`, profile?.name);
      else logActivity(`moved "${deal.title}" to ${STAGES.find((s) => s.id === newStage).label}`, profile?.name);
    });
  });
}

/* ---------------------------------------------------------- Deal modal */
content.insertAdjacentHTML("afterend", `
  <div class="modal-overlay" id="dealModalOverlay">
    <div class="modal">
      <div class="modal-header"><h3 id="dealModalTitle">New Deal</h3><button class="modal-close" data-close-modal><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
      <div class="modal-body">
        <form id="dealForm">
          <input type="hidden" id="dealId">
          <div class="field"><label>Deal title<span class="req">*</span></label><input type="text" id="dealTitle" required></div>
          <div class="field-row">
            <div class="field"><label>Value (USD)</label><input type="number" id="dealValue" min="0" step="100"></div>
            <div class="field"><label>Stage</label><select id="dealStage">${STAGES.map((s) => `<option value="${s.id}">${s.label}</option>`).join("")}</select></div>
          </div>
          <div class="field"><label>Customer</label><select id="dealCustomer"><option value="">— none —</option></select></div>
          <div class="field"><label>Owner</label><select id="dealOwner"><option value="">Unassigned</option></select></div>
          <div class="field"><label>Expected close date</label><input type="date" id="dealCloseDate"></div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-danger" id="deleteDealBtn" style="margin-right:auto;">Delete</button>
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="saveDealBtn">Save Deal</button>
      </div>
    </div>
  </div>
`);
const dealModalOverlay = document.getElementById("dealModalOverlay");
wireModalDismiss(dealModalOverlay);

function openDealModal(id) {
  document.getElementById("dealForm").reset();
  document.getElementById("dealId").value = id || "";
  document.getElementById("dealModalTitle").textContent = id ? "Edit Deal" : "New Deal";
  document.getElementById("deleteDealBtn").style.display = id ? "inline-flex" : "none";
  if (id) {
    const d = allDeals.find((x) => x.id === id);
    if (d) {
      qs("#dealTitle").value = d.title || "";
      qs("#dealValue").value = d.value || "";
      qs("#dealStage").value = d.stage || "new_lead";
      qs("#dealCustomer").value = d.customerId || "";
      qs("#dealOwner").value = d.ownerId || "";
      qs("#dealCloseDate").value = d.expectedCloseDate || "";
    }
  } else {
    qs("#dealOwner").value = getCurrentUser()?.uid || "";
  }
  openModal(dealModalOverlay);
}

document.getElementById("saveDealBtn").addEventListener("click", async () => {
  const title = qs("#dealTitle").value.trim();
  if (!title) { toast({ type: "warning", title: "Deal title is required" }); return; }
  const id = qs("#dealId").value;
  const stage = qs("#dealStage").value;
  const payload = {
    title, value: Number(qs("#dealValue").value) || 0, stage,
    customerId: qs("#dealCustomer").value || null,
    ownerId: qs("#dealOwner").value || null,
    expectedCloseDate: qs("#dealCloseDate").value || null,
    updatedAt: serverTimestamp()
  };
  if (stage === "closed_won" || stage === "closed_lost") payload.closedAt = serverTimestamp();
  const btn = document.getElementById("saveDealBtn");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    if (id) {
      await updateDoc(doc(db, COL.DEALS, id), payload);
      toast({ type: "success", title: "Deal updated" });
    } else {
      payload.createdAt = serverTimestamp();
      payload.createdBy = getCurrentUser()?.uid || null;
      await addDoc(collection(db, COL.DEALS), payload);
      toast({ type: "success", title: "Deal created" });
    }
    closeModal(dealModalOverlay);
  } catch (err) {
    toast({ type: "error", title: "Couldn't save deal", message: err.message });
  }
  btn.disabled = false; btn.textContent = "Save Deal";
});

document.getElementById("deleteDealBtn").addEventListener("click", async () => {
  const id = qs("#dealId").value;
  if (!id) return;
  const ok = await confirmDialog({ title: "Delete this deal?", message: "This removes the opportunity from your pipeline permanently.", confirmText: "Delete deal" });
  if (!ok) return;
  await deleteDoc(doc(db, COL.DEALS, id));
  toast({ type: "success", title: "Deal deleted" });
  closeModal(dealModalOverlay);
});
