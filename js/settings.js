/**
 * Meridian CRM — Settings
 */
import { initShell, getCurrentUser } from "./app-shell.js";
import { db, auth, COL } from "./firebase-config.js";
import { can, ROLES, ROLE_LABELS, roleBadgeClass } from "./roles.js";
import { toast, confirmDialog, initials, escapeHtml, qs, qsa } from "./utils.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc, updateDoc, collection, onSnapshot, query
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { resetPassword, resendVerification } from "./auth.js";

const content = document.getElementById("pageContent");

content.innerHTML = `
  <div class="page-header"><div><h1 class="page-title">Settings</h1><p class="page-subtitle">Manage your profile, team, and workspace preferences.</p></div></div>
  <div class="tabs" id="settingsTabs">
    <button class="tab-btn active" data-tab="profile">Profile</button>
    <button class="tab-btn" data-tab="staff" id="staffTabBtn" style="display:none;">Team &amp; Roles</button>
    <button class="tab-btn" data-tab="preferences">Preferences</button>
  </div>
  <div style="margin-top:var(--sp-5);">
    <div class="tab-panel active" data-tab="profile">
      <div class="card card-pad" style="max-width:520px;">
        <div class="flex items-center gap-3" style="margin-bottom:var(--sp-5);">
          <div class="avatar lg" id="profileAvatar"></div>
          <div><h3 id="profileName"></h3><span class="badge" id="profileRoleBadge"></span></div>
        </div>
        <div class="field"><label>Full name</label><input type="text" id="settingsName"></div>
        <div class="field"><label>Email</label><input type="email" id="settingsEmail" disabled></div>
        <div id="verifyBanner" class="verify-banner" style="display:none;">
          Your email isn't verified yet.
          <button class="btn btn-ghost btn-sm" id="resendVerifyBtn" style="margin-left:auto;">Resend</button>
        </div>
        <button class="btn btn-primary" id="saveProfileBtn">Save changes</button>
        <div class="divider"></div>
        <button class="btn btn-secondary" id="sendResetBtn">Send password reset email</button>
      </div>
    </div>

    <div class="tab-panel" data-tab="staff">
      <div class="card">
        <div class="card-header"><h3>Team Members</h3></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody id="staffTbody"><tr><td colspan="5"><div class="skeleton skeleton-text"></div></td></tr></tbody>
        </table></div>
      </div>
    </div>

    <div class="tab-panel" data-tab="preferences">
      <div class="card card-pad" style="max-width:520px;">
        <div class="field"><label>Monthly sales target (USD)</label><input type="number" id="monthlyTarget" min="0" step="1000"></div>
        <button class="btn btn-primary" id="saveTargetBtn">Save target</button>
      </div>
    </div>
  </div>
`;

initShell("settings").then(({ user, profile }) => {
  qs("#settingsName").value = profile.name;
  qs("#settingsEmail").value = profile.email;
  qs("#profileName").textContent = profile.name;
  qs("#profileAvatar").textContent = initials(profile.name);
  qs("#profileRoleBadge").textContent = ROLE_LABELS[profile.role] || profile.role;
  qs("#profileRoleBadge").className = `badge ${roleBadgeClass(profile.role)}`;
  qs("#monthlyTarget").value = profile.monthlyTarget || 100000;
  if (!user.emailVerified) qs("#verifyBanner").style.display = "flex";

  if (can(profile.role, "staff.manage")) {
    qs("#staffTabBtn").style.display = "block";
    listenStaff(profile);
  }

  wireTabs();

  qs("#saveProfileBtn").addEventListener("click", async () => {
    const name = qs("#settingsName").value.trim();
    if (!name) return;
    await updateProfile(auth.currentUser, { displayName: name });
    await updateDoc(doc(db, COL.USERS, user.uid), { name });
    toast({ type: "success", title: "Profile updated" });
  });

  qs("#sendResetBtn").addEventListener("click", async () => {
    await resetPassword(profile.email);
    toast({ type: "success", title: "Reset email sent", message: "Check your inbox for a link to change your password." });
  });

  qs("#resendVerifyBtn")?.addEventListener("click", async () => {
    await resendVerification();
    toast({ type: "success", title: "Verification email sent" });
  });

  qs("#saveTargetBtn").addEventListener("click", async () => {
    const target = Number(qs("#monthlyTarget").value) || 0;
    await updateDoc(doc(db, COL.USERS, user.uid), { monthlyTarget: target });
    toast({ type: "success", title: "Target saved" });
  });
});

function wireTabs() {
  qsa("#settingsTabs .tab-btn").forEach((btn) => btn.addEventListener("click", () => {
    qsa("#settingsTabs .tab-btn").forEach((b) => b.classList.remove("active"));
    qsa(".tab-panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    qs(`.tab-panel[data-tab="${btn.dataset.tab}"]`).classList.add("active");
  }));
}

function listenStaff(currentProfile) {
  const q = query(collection(db, COL.USERS));
  onSnapshot(q, (snap) => {
    const staff = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    document.getElementById("staffTbody").innerHTML = staff.map((s) => `
      <tr>
        <td><div class="flex items-center gap-2"><div class="avatar" style="width:26px;height:26px;font-size:10px;">${initials(s.name)}</div>${escapeHtml(s.name)}</div></td>
        <td class="cell-sub">${escapeHtml(s.email)}</td>
        <td>
          <select class="role-select" data-id="${s.id}" style="width:auto;height:32px;font-size:12px;" ${s.id === currentProfile.uid ? "disabled" : ""}>
            ${Object.values(ROLES).map((r) => `<option value="${r}" ${s.role === r ? "selected" : ""}>${ROLE_LABELS[r]}</option>`).join("")}
          </select>
        </td>
        <td><span class="badge ${s.status === "suspended" ? "badge-red" : "badge-teal"}">${s.status || "active"}</span></td>
        <td>
          <button class="btn btn-ghost btn-sm toggle-status" data-id="${s.id}" data-status="${s.status || "active"}" ${s.id === currentProfile.uid ? "disabled" : ""}>
            ${s.status === "suspended" ? "Reactivate" : "Suspend"}
          </button>
        </td>
      </tr>`).join("");

    qsa(".role-select").forEach((sel) => sel.addEventListener("change", async () => {
      await updateDoc(doc(db, COL.USERS, sel.dataset.id), { role: sel.value });
      toast({ type: "success", title: "Role updated" });
    }));
    qsa(".toggle-status").forEach((btn) => btn.addEventListener("click", async () => {
      const suspending = btn.dataset.status !== "suspended";
      const ok = await confirmDialog({
        title: suspending ? "Suspend this user?" : "Reactivate this user?",
        message: suspending ? "They will be signed out and unable to log back in until reactivated." : "They'll be able to sign in again immediately.",
        confirmText: suspending ? "Suspend" : "Reactivate", danger: suspending
      });
      if (!ok) return;
      await updateDoc(doc(db, COL.USERS, btn.dataset.id), { status: suspending ? "suspended" : "active" });
      toast({ type: "success", title: suspending ? "User suspended" : "User reactivated" });
    }));
  });
}
