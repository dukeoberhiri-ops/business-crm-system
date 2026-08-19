/**
 * Meridian CRM — Task Management
 */
import { initShell, getCurrentUser, getCurrentProfile } from "./app-shell.js";
import { db, COL } from "./firebase-config.js";
import { can } from "./roles.js";
import {
  toast, confirmDialog, openModal, closeModal, wireModalDismiss,
  skeletonRows, formatDate, escapeHtml, debounce, qs, qsa
} from "./utils.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query,
  orderBy, serverTimestamp, getDocs, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const PRIORITY_BADGE = { high: "badge-red", medium: "badge-amber", low: "badge-gray" };
const STATUS_BADGE = { pending: "badge-blue", in_progress: "badge-amber", completed: "badge-teal" };

const content = document.getElementById("pageContent");
let allTasks = [];
let staffList = [];
let filters = { status: "", search: "" };

content.innerHTML = `
  <div class="page-header">
    <div><h1 class="page-title">Tasks</h1><p class="page-subtitle">Stay on top of every follow-up and deadline.</p></div>
    <button class="btn btn-primary" id="addTaskBtn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      New Task
    </button>
  </div>

  <div class="card">
    <div class="table-toolbar">
      <div class="global-search" style="max-width:280px;height:36px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <input type="text" id="taskSearch" placeholder="Search tasks...">
      </div>
      <div class="filter-bar" id="statusChips">
        <button class="chip active" data-status="">All</button>
        <button class="chip" data-status="pending">Pending</button>
        <button class="chip" data-status="in_progress">In Progress</button>
        <button class="chip" data-status="completed">Completed</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th style="width:36px;"></th><th>Task</th><th>Related to</th><th>Priority</th><th>Assigned</th><th>Due</th><th>Status</th><th></th></tr></thead>
        <tbody id="taskTbody"><tr><td colspan="8">${skeletonRows(6, 3)}</td></tr></tbody>
      </table>
    </div>
  </div>
`;

initShell("tasks").then(async ({ user, profile }) => {
  await loadStaff();
  listenTasks(user, profile);
  wireToolbar(profile);
});

async function loadStaff() {
  try {
    const snap = await getDocs(collection(db, COL.USERS));
    staffList = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const sel = document.getElementById("taskAssignedTo");
    if (sel) staffList.forEach((s) => sel.insertAdjacentHTML("beforeend", `<option value="${s.id}">${s.name}</option>`));
  } catch (e) {}
}

function listenTasks(user, profile) {
  const q = query(collection(db, COL.TASKS), orderBy("dueDate", "asc"));
  onSnapshot(q, (snap) => {
    allTasks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (!can(profile.role, "tasks.assignOthers")) allTasks = allTasks.filter((t) => t.assignedTo === user.uid);
    renderTable();
  }, () => { document.getElementById("taskTbody").innerHTML = `<tr><td colspan="8">${emptyRow("Couldn't load tasks. Check Firestore rules/indexes.")}</td></tr>`; });
}

function renderTable() {
  let rows = [...allTasks];
  if (filters.status) rows = rows.filter((r) => r.status === filters.status);
  if (filters.search) { const s = filters.search.toLowerCase(); rows = rows.filter((r) => (r.title || "").toLowerCase().includes(s)); }

  const tbody = document.getElementById("taskTbody");
  if (!rows.length) { tbody.innerHTML = `<tr><td colspan="8">${emptyRow(allTasks.length ? "No tasks match your filters." : "No tasks yet. Create your first task.")}</td></tr>`; return; }

  tbody.innerHTML = rows.map((t) => {
    const owner = staffList.find((s) => s.id === t.assignedTo);
    const overdue = t.dueDate && t.dueDate.toDate && t.dueDate.toDate() < new Date() && t.status !== "completed";
    return `<tr data-id="${t.id}">
      <td><input type="checkbox" class="row-checkbox complete-check" data-id="${t.id}" ${t.status === "completed" ? "checked" : ""}></td>
      <td>
        <div class="cell-primary" style="${t.status === "completed" ? "text-decoration:line-through;color:var(--text-faint);" : ""}">${escapeHtml(t.title)}</div>
        ${t.description ? `<div class="cell-sub">${escapeHtml(t.description)}</div>` : ""}
      </td>
      <td class="cell-sub" style="text-transform:capitalize;">${escapeHtml(t.relatedType || "—")}</td>
      <td><span class="badge ${PRIORITY_BADGE[t.priority] || "badge-gray"}">${t.priority || "normal"}</span></td>
      <td>${owner ? owner.name : "Unassigned"}</td>
      <td class="cell-sub" style="${overdue ? "color:var(--danger);font-weight:700;" : ""}">${formatDate(t.dueDate)}${overdue ? " (overdue)" : ""}</td>
      <td><span class="badge ${STATUS_BADGE[t.status] || "badge-gray"}">${(t.status || "pending").replace("_", " ")}</span></td>
      <td>
        <div class="row-actions">
          <button class="icon-btn btn-sm edit-task" data-id="${t.id}"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z"/></svg></button>
          <button class="icon-btn btn-sm delete-task" data-id="${t.id}" style="color:var(--danger);"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg></button>
        </div>
      </td>
    </tr>`;
  }).join("");

  qsa(".edit-task").forEach((b) => b.addEventListener("click", () => openTaskModal(b.dataset.id)));
  qsa(".delete-task").forEach((b) => b.addEventListener("click", () => deleteTask(b.dataset.id)));
  qsa(".complete-check").forEach((b) => b.addEventListener("change", (e) => toggleComplete(b.dataset.id, e.target.checked)));
}

function emptyRow(msg) {
  return `<div class="empty-state">
    <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg></div>
    <h4>No tasks found</h4><p>${msg}</p>
  </div>`;
}

async function toggleComplete(id, checked) {
  await updateDoc(doc(db, COL.TASKS, id), { status: checked ? "completed" : "pending", completedAt: checked ? serverTimestamp() : null });
  toast({ type: "success", title: checked ? "Task marked complete" : "Task reopened" });
}

async function deleteTask(id) {
  const ok = await confirmDialog({ title: "Delete this task?", message: "This action can't be undone.", confirmText: "Delete task" });
  if (!ok) return;
  await deleteDoc(doc(db, COL.TASKS, id));
  toast({ type: "success", title: "Task deleted" });
}

function wireToolbar(profile) {
  document.getElementById("taskSearch").addEventListener("input", debounce((e) => { filters.search = e.target.value; renderTable(); }, 200));
  qsa("#statusChips .chip").forEach((chip) => chip.addEventListener("click", () => {
    qsa("#statusChips .chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active"); filters.status = chip.dataset.status; renderTable();
  }));
  document.getElementById("addTaskBtn").addEventListener("click", () => openTaskModal(null));
}

/* ---------------------------------------------------------- Modal */
content.insertAdjacentHTML("afterend", `
  <div class="modal-overlay" id="taskModalOverlay">
    <div class="modal">
      <div class="modal-header"><h3 id="taskModalTitle">New Task</h3><button class="modal-close" data-close-modal><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
      <div class="modal-body">
        <form id="taskForm">
          <input type="hidden" id="taskId">
          <div class="field"><label>Task title<span class="req">*</span></label><input type="text" id="taskTitle" required></div>
          <div class="field"><label>Description</label><textarea id="taskDescription"></textarea></div>
          <div class="field-row">
            <div class="field"><label>Priority</label><select id="taskPriority"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option></select></div>
            <div class="field"><label>Related to</label><select id="taskRelatedType"><option value="general">General</option><option value="lead">Lead</option><option value="customer">Customer</option><option value="deal">Deal</option></select></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Due date<span class="req">*</span></label><input type="date" id="taskDueDate" required></div>
            <div class="field"><label>Assign to</label><select id="taskAssignedTo"><option value="">Unassigned</option></select></div>
          </div>
        </form>
      </div>
      <div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Cancel</button><button class="btn btn-primary" id="saveTaskBtn">Save Task</button></div>
    </div>
  </div>
`);
const taskModalOverlay = document.getElementById("taskModalOverlay");
wireModalDismiss(taskModalOverlay);

function openTaskModal(id) {
  document.getElementById("taskForm").reset();
  document.getElementById("taskId").value = id || "";
  document.getElementById("taskModalTitle").textContent = id ? "Edit Task" : "New Task";
  if (id) {
    const t = allTasks.find((x) => x.id === id);
    if (t) {
      qs("#taskTitle").value = t.title || "";
      qs("#taskDescription").value = t.description || "";
      qs("#taskPriority").value = t.priority || "medium";
      qs("#taskRelatedType").value = t.relatedType || "general";
      qs("#taskDueDate").value = t.dueDate?.toDate ? t.dueDate.toDate().toISOString().slice(0, 10) : "";
      qs("#taskAssignedTo").value = t.assignedTo || "";
    }
  } else {
    qs("#taskAssignedTo").value = getCurrentUser()?.uid || "";
  }
  openModal(taskModalOverlay);
}

document.getElementById("saveTaskBtn").addEventListener("click", async () => {
  const title = qs("#taskTitle").value.trim();
  const dueDate = qs("#taskDueDate").value;
  if (!title || !dueDate) { toast({ type: "warning", title: "Title and due date are required" }); return; }
  const id = qs("#taskId").value;
  const payload = {
    title, description: qs("#taskDescription").value.trim(),
    priority: qs("#taskPriority").value,
    relatedType: qs("#taskRelatedType").value,
    dueDate: Timestamp.fromDate(new Date(dueDate + "T09:00:00")),
    assignedTo: qs("#taskAssignedTo").value || null,
    updatedAt: serverTimestamp()
  };
  const btn = document.getElementById("saveTaskBtn");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    if (id) {
      await updateDoc(doc(db, COL.TASKS, id), payload);
      toast({ type: "success", title: "Task updated" });
    } else {
      payload.status = "pending";
      payload.createdAt = serverTimestamp();
      payload.createdBy = getCurrentUser()?.uid || null;
      const ref = await addDoc(collection(db, COL.TASKS), payload);
      if (payload.assignedTo && payload.assignedTo !== getCurrentUser()?.uid) {
        await addDoc(collection(db, COL.NOTIFICATIONS), {
          userId: payload.assignedTo, title: "New task assigned", message: title,
          type: "task_assigned", read: false, createdAt: serverTimestamp(), relatedId: ref.id
        });
      }
      toast({ type: "success", title: "Task created" });
    }
    closeModal(taskModalOverlay);
  } catch (err) {
    toast({ type: "error", title: "Couldn't save task", message: err.message });
  }
  btn.disabled = false; btn.textContent = "Save Task";
});
