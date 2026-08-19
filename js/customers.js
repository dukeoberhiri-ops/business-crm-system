/**
 * Meridian CRM — Customer Management
 */
import { initShell, getCurrentUser, getCurrentProfile } from "./app-shell.js";
import { db, storage, COL } from "./firebase-config.js";
import { can } from "./roles.js";
import {
  toast, confirmDialog, openModal, closeModal, wireModalDismiss,
  skeletonRows, formatDate, timeAgo, initials, escapeHtml, debounce, qs, qsa
} from "./utils.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query,
  orderBy, serverTimestamp, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

const TYPES = ["prospect", "active", "vip", "churned"];
const TYPE_BADGE = { prospect: "badge-blue", active: "badge-teal", vip: "badge-gold", churned: "badge-red" };

const content = document.getElementById("pageContent");
let allCustomers = [];
let staffList = [];
let currentPage = 1;
const PAGE_SIZE = 8;
let filters = { type: "", search: "" };

content.innerHTML = `
  <div class="page-header">
    <div>
      <h1 class="page-title">Customers</h1>
      <p class="page-subtitle">Every account, contact, and interaction in one place.</p>
    </div>
    <button class="btn btn-primary" id="addCustomerBtn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      Add Customer
    </button>
  </div>

  <div class="card">
    <div class="table-toolbar">
      <div class="global-search" style="max-width:280px;height:36px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="text" id="custSearch" placeholder="Search customers...">
      </div>
      <div class="filter-bar" id="typeChips">
        <button class="chip active" data-type="">All</button>
        ${TYPES.map((t) => `<button class="chip" data-type="${t}">${t[0].toUpperCase() + t.slice(1)}</button>`).join("")}
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Company</th><th>Contact</th><th>Industry</th><th>Type</th><th>Assigned</th><th></th>
          </tr>
        </thead>
        <tbody id="custTbody"><tr><td colspan="6">${skeletonRows(6, 3)}</td></tr></tbody>
      </table>
    </div>
    <div class="pagination" id="pagination"></div>
  </div>
`;

initShell("customers").then(async ({ user, profile }) => {
  await loadStaff();
  listenCustomers();
  wireToolbar();
});

function listenCustomers() {
  const q = query(collection(db, COL.CUSTOMERS), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    allCustomers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderTable();
  }, () => {
    document.getElementById("custTbody").innerHTML = `<tr><td colspan="6">${emptyRow("Couldn't load customers. Check Firestore rules/indexes.")}</td></tr>`;
  });
}

async function loadStaff() {
  try {
    const snap = await getDocs(collection(db, COL.USERS));
    staffList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const sel = document.getElementById("custAssignedTo");
    if (sel) staffList.forEach((s) => sel.insertAdjacentHTML("beforeend", `<option value="${s.id}">${s.name}</option>`));
  } catch (e) {}
}

function renderTable() {
  let rows = [...allCustomers];
  if (filters.type) rows = rows.filter((r) => r.customerType === filters.type);
  if (filters.search) {
    const s = filters.search.toLowerCase();
    rows = rows.filter((r) => (r.companyName || "").toLowerCase().includes(s) || (r.contactPerson || "").toLowerCase().includes(s));
  }
  const tbody = document.getElementById("custTbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6">${emptyRow(allCustomers.length ? "No customers match your filters." : "No customers yet. Add your first account.")}</td></tr>`;
    document.getElementById("pagination").innerHTML = "";
    return;
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, totalPages);
  const pageRows = rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  tbody.innerHTML = pageRows.map((c) => {
    const owner = staffList.find((s) => s.id === c.assignedStaff);
    return `<tr data-id="${c.id}">
      <td>
        <div class="cell-primary">${escapeHtml(c.companyName || "—")}</div>
        <div class="cell-sub">${escapeHtml(c.website || "")}</div>
      </td>
      <td>
        <div>${escapeHtml(c.contactPerson || "—")}</div>
        <div class="cell-sub">${escapeHtml(c.email || "")}</div>
      </td>
      <td>${escapeHtml(c.industry || "—")}</td>
      <td><span class="badge ${TYPE_BADGE[c.customerType] || "badge-gray"}">${c.customerType || "prospect"}</span></td>
      <td>${owner ? `<div class="flex items-center gap-2"><div class="avatar" style="width:24px;height:24px;font-size:10px;">${initials(owner.name)}</div><span style="font-size:12px;">${owner.name}</span></div>` : `<span class="text-faint" style="font-size:12px;">Unassigned</span>`}</td>
      <td>
        <div class="row-actions">
          <button class="icon-btn btn-sm view-cust" data-id="${c.id}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>
          <button class="icon-btn btn-sm edit-cust" data-id="${c.id}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg></button>
          <button class="icon-btn btn-sm delete-cust" data-id="${c.id}" style="color:var(--danger);"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>
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

  qsa(".edit-cust").forEach((b) => b.addEventListener("click", () => openCustomerModal(b.dataset.id)));
  qsa(".view-cust").forEach((b) => b.addEventListener("click", () => openCustomerDetail(b.dataset.id)));
  qsa(".delete-cust").forEach((b) => b.addEventListener("click", () => deleteCustomer(b.dataset.id)));
}

function emptyRow(msg) {
  return `<div class="empty-state">
    <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M6 21V5a1 1 0 011-1h6a1 1 0 011 1v16"/></svg></div>
    <h4>No customers found</h4><p>${msg}</p>
  </div>`;
}

function wireToolbar() {
  document.getElementById("custSearch").addEventListener("input", debounce((e) => { filters.search = e.target.value; currentPage = 1; renderTable(); }, 200));
  qsa("#typeChips .chip").forEach((chip) => chip.addEventListener("click", () => {
    qsa("#typeChips .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    filters.type = chip.dataset.type; currentPage = 1; renderTable();
  }));
  document.getElementById("pagination").addEventListener("click", (e) => {
    const btn = e.target.closest(".page-btn");
    if (!btn || btn.disabled) return;
    if (btn.dataset.page === "prev") currentPage--; else if (btn.dataset.page === "next") currentPage++; else currentPage = Number(btn.dataset.page);
    renderTable();
  });
  document.getElementById("addCustomerBtn").addEventListener("click", () => openCustomerModal(null));
}

async function deleteCustomer(id) {
  const ok = await confirmDialog({ title: "Delete this customer?", message: "This removes the account record permanently. Related notes and files will remain orphaned.", confirmText: "Delete customer" });
  if (!ok) return;
  await deleteDoc(doc(db, COL.CUSTOMERS, id));
  toast({ type: "success", title: "Customer deleted" });
}

/* ---------------------------------------------------------- Modals */
content.insertAdjacentHTML("afterend", `
  <div class="modal-overlay" id="custModalOverlay">
    <div class="modal modal-lg">
      <div class="modal-header"><h3 id="custModalTitle">Add Customer</h3><button class="modal-close" data-close-modal><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
      <div class="modal-body">
        <form id="custForm">
          <input type="hidden" id="custId">
          <div class="field-row">
            <div class="field"><label>Company name<span class="req">*</span></label><input type="text" id="custCompany" required></div>
            <div class="field"><label>Contact person<span class="req">*</span></label><input type="text" id="custContact" required></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Phone</label><input type="tel" id="custPhone"></div>
            <div class="field"><label>Email</label><input type="email" id="custEmail"></div>
          </div>
          <div class="field"><label>Address</label><input type="text" id="custAddress"></div>
          <div class="field-row">
            <div class="field"><label>Industry</label><input type="text" id="custIndustry" placeholder="e.g. Healthcare"></div>
            <div class="field"><label>Website</label><input type="url" id="custWebsite" placeholder="https://"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Customer type</label><select id="custType">${TYPES.map((t) => `<option value="${t}">${t[0].toUpperCase() + t.slice(1)}</option>`).join("")}</select></div>
            <div class="field"><label>Assigned staff</label><select id="custAssignedTo"><option value="">Unassigned</option></select></div>
          </div>
          <div class="field"><label>Notes</label><textarea id="custNotes"></textarea></div>
        </form>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary" id="saveCustBtn">Save Customer</button></div>
    </div>
  </div>

  <div class="modal-overlay" id="custDetailOverlay">
    <div class="modal modal-lg">
      <div class="modal-header"><h3>Customer Details</h3><button class="modal-close" data-close-modal><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
      <div class="modal-body" id="custDetailBody"></div>
      <div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Close</button></div>
    </div>
  </div>
`);

const custModalOverlay = document.getElementById("custModalOverlay");
const custDetailOverlay = document.getElementById("custDetailOverlay");
wireModalDismiss(custModalOverlay);
wireModalDismiss(custDetailOverlay);

function openCustomerModal(id) {
  document.getElementById("custForm").reset();
  document.getElementById("custId").value = id || "";
  document.getElementById("custModalTitle").textContent = id ? "Edit Customer" : "Add Customer";
  if (id) {
    const c = allCustomers.find((x) => x.id === id);
    if (c) {
      qs("#custCompany").value = c.companyName || "";
      qs("#custContact").value = c.contactPerson || "";
      qs("#custPhone").value = c.phone || "";
      qs("#custEmail").value = c.email || "";
      qs("#custAddress").value = c.address || "";
      qs("#custIndustry").value = c.industry || "";
      qs("#custWebsite").value = c.website || "";
      qs("#custType").value = c.customerType || "prospect";
      qs("#custAssignedTo").value = c.assignedStaff || "";
      qs("#custNotes").value = c.notes || "";
    }
  }
  openModal(custModalOverlay);
}

document.getElementById("saveCustBtn").addEventListener("click", async () => {
  const companyName = qs("#custCompany").value.trim();
  const contactPerson = qs("#custContact").value.trim();
  if (!companyName || !contactPerson) { toast({ type: "warning", title: "Company and contact person are required" }); return; }
  const id = qs("#custId").value;
  const payload = {
    companyName, contactPerson,
    phone: qs("#custPhone").value.trim(),
    email: qs("#custEmail").value.trim(),
    address: qs("#custAddress").value.trim(),
    industry: qs("#custIndustry").value.trim(),
    website: qs("#custWebsite").value.trim(),
    customerType: qs("#custType").value,
    assignedStaff: qs("#custAssignedTo").value || null,
    notes: qs("#custNotes").value.trim(),
    updatedAt: serverTimestamp()
  };
  const btn = document.getElementById("saveCustBtn");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    if (id) {
      await updateDoc(doc(db, COL.CUSTOMERS, id), payload);
      toast({ type: "success", title: "Customer updated" });
    } else {
      payload.createdAt = serverTimestamp();
      payload.createdBy = getCurrentUser()?.uid || null;
      await addDoc(collection(db, COL.CUSTOMERS), payload);
      toast({ type: "success", title: "Customer added" });
    }
    closeModal(custModalOverlay);
  } catch (err) {
    toast({ type: "error", title: "Couldn't save customer", message: err.message });
  }
  btn.disabled = false; btn.textContent = "Save Customer";
});

function openCustomerDetail(id) {
  const c = allCustomers.find((x) => x.id === id);
  if (!c) return;
  document.getElementById("custDetailBody").innerHTML = `
    <div class="flex items-center gap-3" style="margin-bottom:var(--sp-5);">
      <div class="avatar lg">${initials(c.companyName)}</div>
      <div>
        <h3 style="margin-bottom:2px;">${escapeHtml(c.companyName)}</h3>
        <p class="text-muted" style="font-size:var(--fs-sm);">${escapeHtml(c.contactPerson || "")} · ${escapeHtml(c.industry || "")}</p>
      </div>
      <span class="badge ${TYPE_BADGE[c.customerType] || "badge-gray"}" style="margin-left:auto;">${c.customerType || "prospect"}</span>
    </div>
    <div class="tabs">
      <button class="tab-btn active" data-tab="info">Info</button>
      <button class="tab-btn" data-tab="history">History</button>
      <button class="tab-btn" data-tab="notes">Notes</button>
      <button class="tab-btn" data-tab="files">Files</button>
    </div>
    <div class="tab-panel active" data-tab="info" style="padding-top:var(--sp-4);">
      <div class="field-row">
        <div><label>Phone</label><p>${escapeHtml(c.phone || "—")}</p></div>
        <div><label>Email</label><p>${escapeHtml(c.email || "—")}</p></div>
      </div>
      <div class="field-row" style="margin-top:var(--sp-4);">
        <div><label>Address</label><p>${escapeHtml(c.address || "—")}</p></div>
        <div><label>Website</label><p>${escapeHtml(c.website || "—")}</p></div>
      </div>
    </div>
    <div class="tab-panel" data-tab="history" style="padding-top:var(--sp-4);" id="commHistory">
      <div class="skeleton skeleton-text"></div>
    </div>
    <div class="tab-panel" data-tab="notes" style="padding-top:var(--sp-4);">
      <div class="flex gap-2" style="margin-bottom:var(--sp-4);"><input type="text" id="newNoteInput" placeholder="Add a note..."><button class="btn btn-primary" id="addNoteBtn">Add</button></div>
      <div id="notesList"><div class="skeleton skeleton-text"></div></div>
    </div>
    <div class="tab-panel" data-tab="files" style="padding-top:var(--sp-4);">
      <div class="field"><label>Upload document</label><input type="file" id="fileUploadInput"></div>
      <div id="filesList"><p class="text-faint" style="font-size:var(--fs-xs);">No files uploaded yet.</p></div>
    </div>
  `;
  qsa(".tab-btn", document.getElementById("custDetailBody")).forEach((btn) => btn.addEventListener("click", () => {
    qsa(".tab-btn", document.getElementById("custDetailBody")).forEach((b) => b.classList.remove("active"));
    qsa(".tab-panel", document.getElementById("custDetailBody")).forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    qs(`.tab-panel[data-tab="${btn.dataset.tab}"]`, document.getElementById("custDetailBody")).classList.add("active");
  }));
  wireNotes(id, "customer");
  wireFileUpload(id, "customer");
  wireHistory(id);
  openModal(custDetailOverlay);
}

function wireHistory(customerId) {
  const q = query(collection(db, COL.COMMUNICATIONS), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((c) => c.customerId === customerId);
    const el = document.getElementById("commHistory");
    if (!el) return;
    el.innerHTML = items.length ? items.map((i) => `
      <div class="notif-item">
        <div class="notif-dot" style="background:var(--info);"></div>
        <div><div class="notif-text"><b>${i.type || "Note"}</b>: ${escapeHtml(i.summary || "")}</div><div class="notif-time">${timeAgo(i.createdAt)}</div></div>
      </div>`).join("") : `<p class="text-faint" style="font-size:var(--fs-xs);">No communication history yet.</p>`;
  });
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
    await addDoc(collection(db, COL.NOTES), { entityId, entityType, text, authorId: getCurrentUser()?.uid, authorName: profile?.name || "Team member", createdAt: serverTimestamp() });
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
      await addDoc(collection(db, COL.FILES), { entityId, entityType, name: file.name, url, path, uploadedBy: getCurrentUser()?.uid, uploadedAt: serverTimestamp(), size: file.size });
      toast({ type: "success", title: "File uploaded", message: file.name });
    } catch (err) {
      toast({ type: "error", title: "Upload failed", message: err.message });
    }
    input.value = "";
  };
}
