/**
 * Meridian CRM — Calendar
 */
import { initShell, getCurrentUser } from "./app-shell.js";
import { db, COL } from "./firebase-config.js";
import { toast, confirmDialog, openModal, closeModal, wireModalDismiss, escapeHtml, qs } from "./utils.js";
import {
  collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const TYPE_COLOR = {
  meeting: "var(--info)", call: "var(--success)", follow_up: "var(--warning)",
  deadline: "var(--danger)", appointment: "var(--gold-600)"
};
const TYPE_BG = {
  meeting: "var(--info-soft)", call: "var(--success-soft)", follow_up: "var(--warning-soft)",
  deadline: "var(--danger-soft)", appointment: "var(--accent-soft)"
};

const content = document.getElementById("pageContent");
let viewDate = new Date();
let allEvents = [];

content.innerHTML = `
  <div class="page-header">
    <div><h1 class="page-title">Calendar</h1><p class="page-subtitle">Meetings, calls, follow-ups, and deadlines.</p></div>
    <button class="btn btn-primary" id="addEventBtn">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      New Event
    </button>
  </div>
  <div class="card">
    <div class="table-toolbar">
      <button class="icon-btn" id="prevMonth"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>
      <h3 id="monthLabel" style="font-size:var(--fs-lg);flex:1;min-width:120px;text-align:center;"></h3>
      <button class="icon-btn" id="nextMonth"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>
      <button class="btn btn-secondary btn-sm" id="todayBtn" style="margin-left:8px;">Today</button>
      <div class="spacer"></div>
      <div class="filter-bar">
        ${Object.keys(TYPE_COLOR).map((t) => `<span class="chip legend-chip" style="color:${TYPE_COLOR[t]};border-color:${TYPE_COLOR[t]}22;"><span style="width:8px;height:8px;border-radius:50%;background:${TYPE_COLOR[t]};display:inline-block;margin-right:4px;flex:none;"></span><span class="legend-label">${t.replace("_", " ")}</span></span>`).join("")}
      </div>
    </div>
    <div id="calendarGrid"></div>
  </div>
`;

initShell("calendar").then(() => {
  listenEvents();
  document.getElementById("prevMonth").addEventListener("click", () => { viewDate.setMonth(viewDate.getMonth() - 1); renderCalendar(); });
  document.getElementById("nextMonth").addEventListener("click", () => { viewDate.setMonth(viewDate.getMonth() + 1); renderCalendar(); });
  document.getElementById("todayBtn").addEventListener("click", () => { viewDate = new Date(); renderCalendar(); });
  document.getElementById("addEventBtn").addEventListener("click", () => openEventModal(null, new Date()));
});

function listenEvents() {
  const q = query(collection(db, COL.EVENTS));
  onSnapshot(q, (snap) => {
    allEvents = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderCalendar();
  }, () => { document.getElementById("calendarGrid").innerHTML = `<div class="empty-state"><h4>Couldn't load calendar</h4><p>Check Firestore rules/indexes for the events collection.</p></div>`; });
}

function renderCalendar() {
  document.getElementById("monthLabel").textContent = viewDate.toLocaleString("default", { month: "long", year: "numeric" });
  const year = viewDate.getFullYear(), month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const today = new Date();

  const cells = [];
  for (let i = startOffset - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, other: true, date: new Date(year, month - 1, daysInPrevMonth - i) });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, other: false, date: new Date(year, month, d) });
  while (cells.length % 7 !== 0 || cells.length < 42) cells.push({ day: cells.length - startOffset - daysInMonth + 1, other: true, date: new Date(year, month + 1, cells.length - startOffset - daysInMonth + 1) });

  const weekdayHtml = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((w) => `<div class="calendar-weekday">${w}</div>`).join("");

  const cellsHtml = cells.map((c) => {
    const isToday = !c.other && c.date.toDateString() === today.toDateString();
    const dayEvents = allEvents.filter((e) => {
      const start = e.startTime?.toDate ? e.startTime.toDate() : null;
      return start && start.toDateString() === c.date.toDateString();
    }).sort((a, b) => (a.startTime?.toMillis() || 0) - (b.startTime?.toMillis() || 0));

    return `<div class="calendar-cell ${c.other ? "other-month" : ""} ${isToday ? "today" : ""}" data-date="${c.date.toISOString()}">
      <div class="cell-date">${c.day}</div>
      ${dayEvents.slice(0, 3).map((e) => `<div class="calendar-event" data-id="${e.id}" style="background:${TYPE_BG[e.type] || "var(--surface-sunken)"};color:${TYPE_COLOR[e.type] || "var(--text)"};">${escapeHtml(e.title)}</div>`).join("")}
      ${dayEvents.length > 3 ? `<div class="text-faint" style="font-size:10px;padding-left:2px;">+${dayEvents.length - 3} more</div>` : ""}
    </div>`;
  }).join("");

  document.getElementById("calendarGrid").innerHTML = `<div class="calendar-grid">${weekdayHtml}${cellsHtml}</div>`;

  document.querySelectorAll(".calendar-cell").forEach((cell) => cell.addEventListener("dblclick", () => openEventModal(null, new Date(cell.dataset.date))));
  document.querySelectorAll(".calendar-event").forEach((ev) => ev.addEventListener("click", (e) => { e.stopPropagation(); openEventModal(ev.dataset.id); }));
}

/* ---------------------------------------------------------- Modal */
content.insertAdjacentHTML("afterend", `
  <div class="modal-overlay" id="eventModalOverlay">
    <div class="modal">
      <div class="modal-header"><h3 id="eventModalTitle">New Event</h3><button class="modal-close" data-close-modal><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
      <div class="modal-body">
        <form id="eventForm">
          <input type="hidden" id="eventId">
          <div class="field"><label>Title<span class="req">*</span></label><input type="text" id="eventTitle" required></div>
          <div class="field-row">
            <div class="field"><label>Type</label>
              <select id="eventType">
                <option value="meeting">Meeting</option><option value="call">Call</option>
                <option value="follow_up">Follow-up</option><option value="deadline">Deadline</option>
                <option value="appointment">Customer Appointment</option>
              </select>
            </div>
            <div class="field"><label>Location / link</label><input type="text" id="eventLocation" placeholder="Zoom, office, etc."></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Start<span class="req">*</span></label><input type="datetime-local" id="eventStart" required></div>
            <div class="field"><label>End</label><input type="datetime-local" id="eventEnd"></div>
          </div>
          <div class="field"><label>Notes</label><textarea id="eventNotes"></textarea></div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-danger" id="deleteEventBtn" style="margin-right:auto;display:none;">Delete</button>
        <button class="btn btn-secondary" data-close-modal>Cancel</button>
        <button class="btn btn-primary" id="saveEventBtn">Save Event</button>
      </div>
    </div>
  </div>
`);
const eventModalOverlay = document.getElementById("eventModalOverlay");
wireModalDismiss(eventModalOverlay);

function toLocalInput(date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

function openEventModal(id, defaultDate) {
  document.getElementById("eventForm").reset();
  document.getElementById("eventId").value = id || "";
  document.getElementById("eventModalTitle").textContent = id ? "Edit Event" : "New Event";
  document.getElementById("deleteEventBtn").style.display = id ? "inline-flex" : "none";
  if (id) {
    const e = allEvents.find((x) => x.id === id);
    if (e) {
      qs("#eventTitle").value = e.title || "";
      qs("#eventType").value = e.type || "meeting";
      qs("#eventLocation").value = e.location || "";
      qs("#eventStart").value = e.startTime?.toDate ? toLocalInput(e.startTime.toDate()) : "";
      qs("#eventEnd").value = e.endTime?.toDate ? toLocalInput(e.endTime.toDate()) : "";
      qs("#eventNotes").value = e.notes || "";
    }
  } else if (defaultDate) {
    defaultDate.setHours(9, 0, 0, 0);
    qs("#eventStart").value = toLocalInput(defaultDate);
  }
  openModal(eventModalOverlay);
}

document.getElementById("saveEventBtn").addEventListener("click", async () => {
  const title = qs("#eventTitle").value.trim();
  const start = qs("#eventStart").value;
  if (!title || !start) { toast({ type: "warning", title: "Title and start time are required" }); return; }
  const id = qs("#eventId").value;
  const payload = {
    title, type: qs("#eventType").value, location: qs("#eventLocation").value.trim(),
    startTime: Timestamp.fromDate(new Date(start)),
    endTime: qs("#eventEnd").value ? Timestamp.fromDate(new Date(qs("#eventEnd").value)) : null,
    notes: qs("#eventNotes").value.trim(),
    updatedAt: serverTimestamp()
  };
  const btn = document.getElementById("saveEventBtn");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    if (id) {
      await updateDoc(doc(db, COL.EVENTS, id), payload);
      toast({ type: "success", title: "Event updated" });
    } else {
      payload.createdAt = serverTimestamp();
      payload.createdBy = getCurrentUser()?.uid || null;
      await addDoc(collection(db, COL.EVENTS), payload);
      toast({ type: "success", title: "Event scheduled" });
    }
    closeModal(eventModalOverlay);
  } catch (err) {
    toast({ type: "error", title: "Couldn't save event", message: err.message });
  }
  btn.disabled = false; btn.textContent = "Save Event";
});

document.getElementById("deleteEventBtn").addEventListener("click", async () => {
  const id = qs("#eventId").value;
  if (!id) return;
  const ok = await confirmDialog({ title: "Delete this event?", message: "This action can't be undone.", confirmText: "Delete event" });
  if (!ok) return;
  await deleteDoc(doc(db, COL.EVENTS, id));
  toast({ type: "success", title: "Event deleted" });
  closeModal(eventModalOverlay);
});
