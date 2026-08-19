/**
 * Meridian CRM — Lead Management
 */
import { initShell, getCurrentUser, getCurrentProfile } from "./app-shell.js";
import { db, storage, COL } from "./firebase-config.js";
import { can } from "./roles.js";
import {
  toast, confirmDialog, openModal, closeModal, wireModalDismiss,
  skeletonRows, formatDate, timeAgo, initials, escapeHtml, debounce, qs, qsa, logActivity
} from "./utils.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query,
  orderBy, serverTimestamp, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import {
  ref, uploadBytes, getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

const STAGES = ["new", "contacted", "qualified", "proposal_sent", "negotiation", "won", "lost"];
const STAGE_LABELS = { new: "New", contacted: "Contacted", qualified: "Qualified", proposal_sent: "Proposal Sent", negotiation: "Negotiation", won: "Won", lost: "Lost" };
const STAGE_BADGE = { new: "badge-blue", contacted: "badge-amber", qualified: "badge-teal", proposal_sent: "badge-gold", negotiation: "badge-amber", won: "badge-teal", lost: "badge-red" };

const content = document.getElementById("pageContent");
let allLeads = [];
let staffList = [];
let currentPage = 1;
const PAGE_SIZE = 8;
let filters = { stage: "", assignedTo: "", search: "" };
let sortKey = "createdAt", sortDir = "desc";

content.innerHTML = `
  <div class="page-header">
    <div>
      <h1 class="page-title">Leads</h1>
      <p class="page-subtitle">Track and convert every incoming opportunity.</p>
    </div>
    <button class="btn btn-primary" id="addLeadBtn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      Add Lead
    </button>
  </div>

  <div class="card">
    <div class="table-toolbar">
      <div class="global-search" style="max-width:280px;height:36px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="text" id="leadSearch" placeholder="Search leads...">
      </div>
      <div class="filter-bar" id="stageChips"></div>
      <div class="spacer"></div>
      <div class="filter-popover">
        <button class="chip" id="assignFilterBtn">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          Assigned to <span id="assignFilterLabel">Anyone</span>
        </button>
        <div class="filter-popover-panel" id="assignFilterPanel">
          <div class="field"><label>Filter by owner</label><select id="assignFilterSelect"><option value="">Anyone</option></select></div>
        </div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th style="width:36px;"><input type="checkbox" class="row-checkbox" id="selectAll"></th>
            <th class="sortable" data-key="name">Lead</th>
            <th>Company</th>
            <th>Stage</th>
            <th>Owner</th>
            <th class="sortable" data-key="value">Est. Value</th>
            <th class="sortable" data-key="createdAt">Created</th>
            <th style="width:110px;"></th>
          </tr>
        </thead>
        <tbody id="leadsTbody">
          <tr><td colspan="8">${skeletonRows(6, 3)}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="pagination" id="pagination"></div>
  </div>
`;

// ---- Stage filter chips ----
document.getElementById("stageChips").innerHTML = `<button class="chip active" data-stage="">All</button>` +
  STAGES.map((s) => `<button class="chip" data-stage="${s}">${STAGE_LABELS[s]}</button>`).join("");

initShell("leads").then(async ({ user, profile }) => {
  await loadStaff();
  listenLeads(user, profile);
  wireToolbar(profile);
  wireLeadModal(profile);
});

/* ------------------------------------------------------------ Data */
function listenLeads(user, profile) {
  const q = query(collection(db, COL.LEADS), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    allLeads = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!can(profile.role, "leads.viewAll")) {
      allLeads = allLeads.filter((l) => l.assignedTo === user.uid);
    }
    renderTable();
  }, (err) => {
    console.error(err);
    document.getElementById("leadsTbody").innerHTML = `<tr><td colspan="8">${emptyRow("Couldn't load leads. Check your Firestore rules/indexes.")}</td></tr>`;
  });
}

async function loadStaff() {
  try {
    const snap = await getDocs(collection(db, COL.USERS));
    staffList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const sel = document.getElementById("assignFilterSelect");
    staffList.forEach((s) => sel.insertAdjacentHTML("beforeend", `<option value="${s.id}">${s.name}</option>`));
    const modalSel = document.getElementById("leadAssignedTo");
    if (modalSel) staffList.forEach((s) => modalSel.insertAdjacentHTML("beforeend", `<option value="${s.id}">${s.name}</option>`));
  } catch (e) { /* staff list optional */ }
}

/* ------------------------------------------------------------ Render */
function renderTable() {
  let rows = [...allLeads];
  if (filters.stage) rows = rows.filter((r) => r.stage === filters.stage);
  if (filters.assignedTo) rows = rows.filter((r) => r.assignedTo === filters.assignedTo);
  if (filters.search) {
    const s = filters.search.toLowerCase();
    rows = rows.filter((r) => (r.name || "").toLowerCase().includes(s) || (r.company || "").toLowerCase().includes(s) || (r.email || "").toLowerCase().includes(s));
  }
  rows.sort((a, b) => {
    let av = a[sortKey], bv = b[sortKey];
    if (sortKey === "createdAt") { av = av?.toMillis ? av.toMillis() : 0; bv = bv?.toMillis ? bv.toMillis() : 0; }
    if (typeof av === "string") return sortDir === "asc" ? av.localeCompare(bv || "") : (bv || "").localeCompare(av);
    return sortDir === "asc" ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0);
  });

  const tbody = document.getElementById("leadsTbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8">${emptyRow(
      allLeads.length ? "No leads match your filters." : "No leads yet. Add your first lead to get started."
    )}</td></tr>`;
    document.getElementById("pagination").innerHTML = "";
    return;
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  tbody.innerHTML = pageRows.map((l) => {
    const owner = staffList.find((s) => s.id === l.assignedTo);
    return `<tr data-id="${l.id}">
      <td><input type="checkbox" class="row-checkbox"></td>
      <td>
        <div class="cell-primary">${escapeHtml(l.name || "Unnamed lead")}</div>
        <div class="cell-sub">${escapeHtml(l.email || "")}</div>
      </td>
      <td>${escapeHtml(l.company || "—")}</td>
      <td><span class="badge ${STAGE_BADGE[l.stage] || "badge-gray"} stage-select" data-id="${l.id}">${STAGE_LABELS[l.stage] || l.stage}</span></td>
      <td>
        ${owner ? `<div class="flex items-center gap-2"><div class="avatar" style="width:24px;height:24px;font-size:10px;">${initials(owner.name)}</div><span style="font-size:12px;">${owner.name}</span></div>` : `<span class="text-faint" style="font-size:12px;">Unassigned</span>`}
      </td>
      <td class="mono">${l.value ? "$" + Number(l.value).toLocaleString() : "—"}</td>
      <td class="cell-sub">${formatDate(l.createdAt)}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn btn-sm view-lead" data-id="${l.id}" aria-label="View">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
          <button class="icon-btn btn-sm edit-lead" data-id="${l.id}" aria-label="Edit">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg>
          </button>
          <button class="icon-btn btn-sm delete-lead" data-id="${l.id}" aria-label="Delete" style="color:var(--danger);">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
  }).join("");

  document.getElementById("pagination").innerHTML = `
    <div class="pagination-info">Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, rows.length)} of ${rows.length}</div>
    <div class="pagination-controls">
      <button class="page-btn" data-page="prev" ${currentPage === 1 ? "disabled" : ""}>‹</button>
      ${Array.from({ length: totalPages }).map((_, i) => `<button class="page-btn ${i + 1 === currentPage ? "active" : ""}" data-page="${i + 1}">${i + 1}</button>`).join("")}
      <button class="page-btn" data-page="next" ${currentPage === totalPages ? "disabled" : ""}>›</button>
    </div>`;

  wireRowActions();
}

function emptyRow(msg) {
  return `<div class="empty-state">
    <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></svg></div>
    <h4>No leads found</h4><p>${msg}</p>
  </div>`;
}

/* ------------------------------------------------------------ Toolbar */
function wireToolbar(profile) {
  document.getElementById("leadSearch").addEventListener("input", debounce((e) => {
    filters.search = e.target.value; currentPage = 1; renderTable();
  }, 200));

  qsa("#stageChips .chip").forEach((chip) => chip.addEventListener("click", () => {
    qsa("#stageChips .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    filters.stage = chip.dataset.stage; currentPage = 1; renderTable();
  }));

  const assignBtn = document.getElementById("assignFilterBtn");
  const assignPanel = document.getElementById("assignFilterPanel");
  assignBtn.addEventListener("click", (e) => { e.stopPropagation(); assignPanel.classList.toggle("open"); });
  document.addEventListener("click", (e) => { if (!assignPanel.contains(e.target) && e.target !== assignBtn) assignPanel.classList.remove("open"); });
  document.getElementById("assignFilterSelect").addEventListener("change", (e) => {
    filters.assignedTo = e.target.value;
    const label = e.target.selectedOptions[0]?.textContent || "Anyone";
    document.getElementById("assignFilterLabel").textContent = label;
    currentPage = 1; renderTable();
  });

  qsa("thead th.sortable").forEach((th) => th.addEventListener("click", () => {
    const key = th.dataset.key;
    sortDir = sortKey === key && sortDir === "desc" ? "asc" : "desc";
    sortKey = key; renderTable();
  }));

  document.getElementById("pagination").addEventListener("click", (e) => {
    const btn = e.target.closest(".page-btn");
    if (!btn || btn.disabled) return;
    if (btn.dataset.page === "prev") currentPage--;
    else if (btn.dataset.page === "next") currentPage++;
    else currentPage = Number(btn.dataset.page);
    renderTable();
  });

  document.getElementById("addLeadBtn").addEventListener("click", () => openLeadModal(null, profile));
}

function wireRowActions() {
  qsa(".edit-lead").forEach((b) => b.addEventListener("click", () => openLeadModal(b.dataset.id, getCurrentProfile())));
  qsa(".view-lead").forEach((b) => b.addEventListener("click", () => openLeadDetail(b.dataset.id)));
  qsa(".delete-lead").forEach((b) => b.addEventListener("click", () => deleteLead(b.dataset.id)));
  qsa(".stage-select").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); openStagePicker(b); }));
}

/* ------------------------------------------------------------ Delete */
async function deleteLead(id) {
  const ok = await confirmDialog({ title: "Delete this lead?", message: "This action can't be undone. All notes and file references on this lead will be removed.", confirmText: "Delete lead" });
  if (!ok) return;
  await deleteDoc(doc(db, COL.LEADS, id));
  toast({ type: "success", title: "Lead deleted" });
}

/* ------------------------------------------------------------ Inline stage change */
function openStagePicker(badgeEl) {
  qsa(".stage-picker-menu").forEach((m) => m.remove());
  const menu = document.createElement("div");
  menu.className = "dropdown-panel open stage-picker-menu";
  menu.style.cssText = "position:absolute;width:180px;";
  menu.innerHTML = STAGES.map((s) => `<button class="menu-item" style="width:100%;" data-stage="${s}">${STAGE_LABELS[s]}</button>`).join("");
  badgeEl.style.position = "relative";
  badgeEl.appendChild(menu);
  const rect = menu.getBoundingClientRect();
  menu.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-stage]");
    if (!btn) return;
    await updateDoc(doc(db, COL.LEADS, badgeEl.dataset.id), { stage: btn.dataset.stage, updatedAt: serverTimestamp() });
    toast({ type: "success", title: `Stage updated to ${STAGE_LABELS[btn.dataset.stage]}` });
    menu.remove();
  });
  setTimeout(() => document.addEventListener("click", function closeOnce(ev) {
    if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener("click", closeOnce); }
  }), 0);
}

/* ------------------------------------------------------------ Add/Edit modal */
content.insertAdjacentHTML("afterend", `
  <div class="modal-overlay" id="leadModalOverlay">
    <div class="modal modal-lg">
      <div class="modal-header">
        <h3 id="leadModalTitle">Add Lead</h3>
        <button class="modal-close" data-close-modal>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="modal-body">
        <form id="leadForm">
          <input type="hidden" id="leadId">
          <div class="field-row">
            <div class="field"><label>Full name<span class="req">*</span></label><input type="text" id="leadName" required></div>
            <div class="field"><label>Company</label><input type="text" id="leadCompany"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Email<span class="req">*</span></label><input type="email" id="leadEmail" required></div>
            <div class="field"><label>Phone</label><input type="tel" id="leadPhone"></div>
          </div>
          <div class="field-row">
            <div class="field">
              <label>Stage</label>
              <select id="leadStage">${STAGES.map((s) => `<option value="${s}">${STAGE_LABELS[s]}</option>`).join("")}</select>
            </div>
            <div class="field"><label>Estimated value (USD)</label><input type="number" id="leadValue" min="0" step="100"></div>
          </div>
          <div class="field">
            <label>Assign to</label>
            <select id="leadAssignedTo"><option value="">Unassigned</option></select>
          </div>
          <div class="field"><label>Source</label>
            <select id="leadSource">
              <option value="website">Website</option><option value="referral">Referral</option>
              <option value="cold_call">Cold Call</option><option value="event">Event</option><option value="other">Other</option>
            </select>
          </div>
          <div class="field"><label>Notes</label><textarea id="leadNotes" placeholder="Any context about this lead..."></textarea></div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="saveLeadBtn">Save Lead</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="leadDetailOverlay">
    <div class="modal modal-lg">
      <div class="modal-header"><h3>Lead Details</h3><button class="modal-close" data-close-modal><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
      <div class="modal-body" id="leadDetailBody"></div>
      <div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Close</button></div>
    </div>
  </div>
`);

const leadModalOverlay = document.getElementById("leadModalOverlay");
const leadDetailOverlay = document.getElementById("leadDetailOverlay");
wireModalDismiss(leadModalOverlay);
wireModalDismiss(leadDetailOverlay);

function openLeadModal(id, profile) {
  document.getElementById("leadForm").reset();
  document.getElementById("leadId").value = id || "";
  document.getElementById("leadModalTitle").textContent = id ? "Edit Lead" : "Add Lead";
  if (id) {
    const lead = allLeads.find((l) => l.id === id);
    if (lead) {
      qs("#leadName").value = lead.name || "";
      qs("#leadCompany").value = lead.company || "";
      qs("#leadEmail").value = lead.email || "";
      qs("#leadPhone").value = lead.phone || "";
      qs("#leadStage").value = lead.stage || "new";
      qs("#leadValue").value = lead.value || "";
      qs("#leadAssignedTo").value = lead.assignedTo || "";
      qs("#leadSource").value = lead.source || "website";
      qs("#leadNotes").value = lead.notes || "";
    }
  } else {
    qs("#leadAssignedTo").value = getCurrentUser()?.uid || "";
  }
  openModal(leadModalOverlay);
}

function wireLeadModal(profile) {
  document.getElementById("saveLeadBtn").addEventListener("click", async () => {
    const name = qs("#leadName").value.trim();
    const email = qs("#leadEmail").value.trim();
    if (!name || !email) { toast({ type: "warning", title: "Name and email are required" }); return; }

    const id = qs("#leadId").value;
    const payload = {
      name, email,
      company: qs("#leadCompany").value.trim(),
      phone: qs("#leadPhone").value.trim(),
      stage: qs("#leadStage").value,
      value: Number(qs("#leadValue").value) || 0,
      assignedTo: qs("#leadAssignedTo").value || null,
      source: qs("#leadSource").value,
      notes: qs("#leadNotes").value.trim(),
      updatedAt: serverTimestamp()
    };

    const btn = document.getElementById("saveLeadBtn");
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      if (id) {
        await updateDoc(doc(db, COL.LEADS, id), payload);
        toast({ type: "success", title: "Lead updated" });
      } else {
        payload.createdAt = serverTimestamp();
        payload.createdBy = getCurrentUser()?.uid || null;
        await addDoc(collection(db, COL.LEADS), payload);
        toast({ type: "success", title: "Lead added", message: `${name} is now in your pipeline.` });
        logActivity(`added a new lead: ${name}`, profile.name);
      }
      closeModal(leadModalOverlay);
    } catch (err) {
      toast({ type: "error", title: "Couldn't save lead", message: err.message });
    }
    btn.disabled = false; btn.textContent = "Save Lead";
  });
}

/* ------------------------------------------------------------ Detail view (notes / files) */
function openLeadDetail(id) {
  const lead = allLeads.find((l) => l.id === id);
  if (!lead) return;
  const owner = staffList.find((s) => s.id === lead.assignedTo);
  document.getElementById("leadDetailBody").innerHTML = `
    <div class="flex items-center gap-3" style="margin-bottom:var(--sp-5);">
      <div class="avatar lg">${initials(lead.name)}</div>
      <div>
        <h3 style="margin-bottom:2px;">${escapeHtml(lead.name)}</h3>
        <p class="text-muted" style="font-size:var(--fs-sm);">${escapeHtml(lead.company || "No company")} · ${escapeHtml(lead.email)}</p>
      </div>
      <span class="badge ${STAGE_BADGE[lead.stage] || "badge-gray"}" style="margin-left:auto;">${STAGE_LABELS[lead.stage] || lead.stage}</span>
    </div>
    <div class="tabs">
      <button class="tab-btn active" data-tab="info">Info</button>
      <button class="tab-btn" data-tab="notes">Notes</button>
      <button class="tab-btn" data-tab="files">Files</button>
    </div>
    <div class="tab-panel active" data-tab="info" style="padding-top:var(--sp-4);">
      <div class="field-row">
        <div><label>Phone</label><p>${escapeHtml(lead.phone || "—")}</p></div>
        <div><label>Owner</label><p>${owner ? escapeHtml(owner.name) : "Unassigned"}</p></div>
      </div>
      <div class="field-row" style="margin-top:var(--sp-4);">
        <div><label>Estimated value</label><p class="mono">${lead.value ? "$" + Number(lead.value).toLocaleString() : "—"}</p></div>
        <div><label>Source</label><p style="text-transform:capitalize;">${lead.source || "—"}</p></div>
      </div>
      <div style="margin-top:var(--sp-4);"><label>Background</label><p>${escapeHtml(lead.notes || "No background notes yet.")}</p></div>
    </div>
    <div class="tab-panel" data-tab="notes" style="padding-top:var(--sp-4);">
      <div class="flex gap-2" style="margin-bottom:var(--sp-4);">
        <input type="text" id="newNoteInput" placeholder="Add a note about this lead...">
        <button class="btn btn-primary" id="addNoteBtn">Add</button>
      </div>
      <div id="notesList"><div class="skeleton skeleton-text"></div></div>
    </div>
    <div class="tab-panel" data-tab="files" style="padding-top:var(--sp-4);">
      <div class="field"><label>Upload document</label><input type="file" id="fileUploadInput"></div>
      <div id="filesList"><p class="text-faint" style="font-size:var(--fs-xs);">No files uploaded yet.</p></div>
    </div>
  `;

  qsa(".tab-btn", document.getElementById("leadDetailBody")).forEach((btn) => btn.addEventListener("click", () => {
    qsa(".tab-btn", document.getElementById("leadDetailBody")).forEach((b) => b.classList.remove("active"));
    qsa(".tab-panel", document.getElementById("leadDetailBody")).forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    qs(`.tab-panel[data-tab="${btn.dataset.tab}"]`, document.getElementById("leadDetailBody")).classList.add("active");
  }));

  wireNotes(id, "lead");
  wireFileUpload(id, "lead");
  openModal(leadDetailOverlay);
}

function wireNotes(entityId, entityType) {
  const list = document.getElementById("notesList");
  const q = query(collection(db, COL.NOTES), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    const notes = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((n) => n.entityId === entityId && n.entityType === entityType);
    list.innerHTML = notes.length ? notes.map((n) => `
      <div style="padding:var(--sp-3) 0;border-bottom:1px solid var(--border);">
        <p style="font-size:var(--fs-sm);">${escapeHtml(n.text)}</p>
        <p class="text-faint" style="font-size:11px;margin-top:4px;">${escapeHtml(n.authorName || "Team member")} · ${timeAgo(n.createdAt)}</p>
      </div>`).join("") : `<p class="text-faint" style="font-size:var(--fs-xs);">No notes yet.</p>`;
  });
  document.getElementById("addNoteBtn").onclick = async () => {
    const input = document.getElementById("newNoteInput");
    const text = input.value.trim();
    if (!text) return;
    const profile = getCurrentProfile();
    await addDoc(collection(db, COL.NOTES), {
      entityId, entityType, text,
      authorId: getCurrentUser()?.uid, authorName: profile?.name || "Team member",
      createdAt: serverTimestamp()
    });
    input.value = "";
  };
}

function wireFileUpload(entityId, entityType) {
  const input = document.getElementById("fileUploadInput");
  const list = document.getElementById("filesList");
  const q = query(collection(db, COL.FILES), orderBy("uploadedAt", "desc"));
  onSnapshot(q, (snap) => {
    const files = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((f) => f.entityId === entityId && f.entityType === entityType);
    list.innerHTML = files.length ? files.map((f) => `
      <a href="${f.url}" target="_blank" class="menu-item" style="border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:6px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
        ${escapeHtml(f.name)}
      </a>`).join("") : `<p class="text-faint" style="font-size:var(--fs-xs);">No files uploaded yet.</p>`;
  });
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      const path = `${entityType}s/${entityId}/${Date.now()}_${file.name}`;
      const sref = ref(storage, path);
      await uploadBytes(sref, file);
      const url = await getDownloadURL(sref);
      await addDoc(collection(db, COL.FILES), {
        entityId, entityType, name: file.name, url, path,
        uploadedBy: getCurrentUser()?.uid, uploadedAt: serverTimestamp(), size: file.size
      });
      toast({ type: "success", title: "File uploaded", message: file.name });
    } catch (err) {
      toast({ type: "error", title: "Upload failed", message: err.message });
    }
    input.value = "";
  };
}
