/**
 * Meridian CRM — Sample Data Seeder
 * Run from seed.html (admin only). Populates customers, leads, deals,
 * tasks, and events so the app looks alive on first login.
 * Safe to run multiple times — it always adds fresh sample docs.
 */
import { requireAuth } from "./auth.js";
import { db, COL } from "./firebase-config.js";
import { can } from "./roles.js";
import { toast } from "./utils.js";
import {
  collection, addDoc, serverTimestamp, Timestamp, getDocs
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

const logEl = document.getElementById("seedLog");
function log(msg) { logEl.innerHTML += `<div>${msg}</div>`; logEl.scrollTop = logEl.scrollHeight; }

requireAuth().then(async ({ user, profile }) => {
  document.getElementById("seedUser").textContent = `${profile.name} (${profile.role})`;
  if (!can(profile.role, "staff.manage")) {
    const btn = document.getElementById("seedBtn");
    btn.disabled = true;
    document.getElementById("seedLog").insertAdjacentHTML("beforebegin", `
      <div class="verify-banner" style="background:var(--danger-soft);border-color:var(--danger);color:var(--danger);margin-bottom:var(--sp-4);">
        Your account's role is "<b>${profile.role}</b>", which can't run the seeder — only Admin or Super Admin can.
        To fix this: open <b>Firebase Console → Firestore Database → users → ${user.uid}</b>,
        change the <b>role</b> field to <code>admin</code>, then reload this page.
      </div>`);
    log("⚠️ Only Admins and Super Admins can run the seeder.");
    return;
  }
  document.getElementById("seedBtn").addEventListener("click", () => runSeed(user));
});

async function runSeed(user) {
  const btn = document.getElementById("seedBtn");
  btn.disabled = true;
  btn.textContent = "Seeding…";
  log("Starting seed…");

  try {
    await seedAll(user);
    log("🎉 Done! Visit the Dashboard to see your data.");
    toast({ type: "success", title: "Sample data created", message: "Your workspace now has demo records." });
  } catch (err) {
    console.error("Seeder failed:", err);
    log(`❌ Seeding stopped: ${err.code ? err.code + " — " : ""}${err.message}`);
    toast({ type: "error", title: "Seeding failed", message: err.message || "Check the browser console for details." });
  } finally {
    btn.disabled = false;
    btn.textContent = "Run Seeder";
  }
}

async function seedAll(user) {

  const industries = ["Healthcare", "Fintech", "Legal", "Retail", "Manufacturing", "SaaS"];
  const companyNames = ["Northwind Health", "Bluepeak Capital", "Harlow & Reed Law", "Cedar Retail Co.", "Ironclad Manufacturing", "Skyline SaaS Labs"];
  const customerIds = [];

  for (let i = 0; i < companyNames.length; i++) {
    const docRef = await addDoc(collection(db, COL.CUSTOMERS), {
      companyName: companyNames[i],
      contactPerson: ["Alex Rivera", "Jamie Chen", "Morgan Blake", "Taylor Osei", "Priya Nair", "Sam Whitfield"][i],
      phone: "+1 (555) 01" + i + "-0100",
      email: `contact@${companyNames[i].toLowerCase().replace(/[^a-z]/g, "")}.com`,
      address: `${100 + i} Market Street, Suite ${200 + i}`,
      industry: industries[i],
      website: `https://${companyNames[i].toLowerCase().replace(/[^a-z]/g, "")}.com`,
      customerType: ["active", "vip", "prospect", "active", "churned", "vip"][i],
      assignedStaff: user.uid,
      notes: "Sample account created by the Meridian CRM seeder.",
      createdAt: serverTimestamp(),
      createdBy: user.uid
    });
    customerIds.push(docRef.id);
    log(`✔ Customer: ${companyNames[i]}`);
  }

  const leadStages = ["new", "contacted", "qualified", "proposal_sent", "negotiation", "won", "lost"];
  for (let i = 0; i < 14; i++) {
    await addDoc(collection(db, COL.LEADS), {
      name: sampleName(i),
      email: `lead${i}@example.com`,
      company: companyNames[i % companyNames.length],
      phone: "+1 (555) 02" + i + "-0200",
      stage: leadStages[i % leadStages.length],
      value: 2000 + i * 750,
      assignedTo: user.uid,
      source: ["website", "referral", "cold_call", "event", "other"][i % 5],
      notes: "Auto-generated sample lead.",
      createdAt: serverTimestamp(),
      createdBy: user.uid
    });
  }
  log("✔ 14 sample leads created");

  const dealStages = ["new_lead", "contacted", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"];
  for (let i = 0; i < 16; i++) {
    const stage = dealStages[i % dealStages.length];
    const payload = {
      title: `${companyNames[i % companyNames.length]} — ${["Platform License", "Annual Contract", "Expansion Deal", "Renewal", "Pilot Program"][i % 5]}`,
      value: 5000 + i * 1200,
      stage,
      customerId: customerIds[i % customerIds.length],
      ownerId: user.uid,
      expectedCloseDate: null,
      createdAt: serverTimestamp(),
      createdBy: user.uid
    };
    if (stage === "closed_won" || stage === "closed_lost") payload.closedAt = serverTimestamp();
    await addDoc(collection(db, COL.DEALS), payload);
  }
  log("✔ 16 sample deals created across the pipeline");

  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const due = new Date(now); due.setDate(now.getDate() + (i - 2));
    await addDoc(collection(db, COL.TASKS), {
      title: ["Follow up on proposal", "Prepare contract draft", "Call to confirm renewal", "Send onboarding docs", "Check in after demo", "Collect signed NDA", "Schedule kickoff call", "Review support ticket"][i],
      description: "Auto-generated sample task.",
      priority: ["high", "medium", "low"][i % 3],
      relatedType: ["lead", "customer", "deal", "general"][i % 4],
      dueDate: Timestamp.fromDate(due),
      assignedTo: user.uid,
      status: i < 2 ? "completed" : "pending",
      createdAt: serverTimestamp(),
      createdBy: user.uid
    });
  }
  log("✔ 8 sample tasks created");

  for (let i = 0; i < 6; i++) {
    const start = new Date(now); start.setDate(now.getDate() + i); start.setHours(9 + i, 0, 0, 0);
    const end = new Date(start); end.setHours(start.getHours() + 1);
    await addDoc(collection(db, COL.EVENTS), {
      title: ["Discovery call", "Contract review meeting", "Quarterly check-in", "Product demo", "Renewal discussion", "Onboarding kickoff"][i],
      type: ["call", "meeting", "meeting", "meeting", "call", "appointment"][i],
      location: i % 2 === 0 ? "Zoom" : "Client office",
      startTime: Timestamp.fromDate(start),
      endTime: Timestamp.fromDate(end),
      notes: "Auto-generated sample event.",
      createdAt: serverTimestamp(),
      createdBy: user.uid
    });
  }
  log("✔ 6 sample calendar events created");
}

function sampleName(i) {
  const first = ["Ava", "Noah", "Mia", "Liam", "Zoe", "Ethan", "Nora", "Lucas", "Ivy", "Owen", "Ruby", "Kai", "Elena", "Theo"];
  const last = ["Bennett", "Coleman", "Ferreira", "Grant", "Hollis", "Iqbal", "Jansen", "Kowalski", "Larsen", "Mendez", "Nakamura", "Osei", "Patel", "Quinn"];
  return `${first[i % first.length]} ${last[i % last.length]}`;
}
