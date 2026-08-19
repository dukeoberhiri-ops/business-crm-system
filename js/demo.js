/**
 * Meridian CRM — Demo Experience
 * Self-provisioning demo accounts, one-click login, a dismissible welcome
 * banner, and admin-only "Seed / Reset Demo Data" tools that generate
 * realistic, cross-linked data between the two permanent demo accounts.
 */
import { auth, db, COL } from "./firebase-config.js";
import { registerUser, loginUser } from "./auth.js";
import { ROLES } from "./roles.js";
import {
  collection, addDoc, doc, getDocs, deleteDoc, query, where, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

export const DEMO_ADMIN_EMAIL = "admin@example.com";
export const DEMO_USER_EMAIL = "user@example.com";
export const DEMO_PASSWORD = "Demo123!";

export function isDemoEmail(email) {
  return email === DEMO_ADMIN_EMAIL || email === DEMO_USER_EMAIL;
}

/**
 * Signs in to a permanent demo account, self-provisioning it on first use.
 * @param {"admin"|"user"} kind
 */
export async function loginAsDemo(kind) {
  const email = kind === "admin" ? DEMO_ADMIN_EMAIL : DEMO_USER_EMAIL;
  const name = kind === "admin" ? "Demo Admin" : "Demo User";
  const role = kind === "admin" ? ROLES.ADMIN : ROLES.SALES_REP;

  try {
    await loginUser(email, DEMO_PASSWORD);
    return;
  } catch (loginErr) {
    // Most likely this demo account doesn't exist yet — create it permanently.
    try {
      await registerUser({ name, email, password: DEMO_PASSWORD, role });
      return;
    } catch (registerErr) {
      if (registerErr.code === "auth/email-already-in-use") {
        // The account DOES exist, so the original sign-in failure was for
        // some other reason (e.g. its password was changed outside the app).
        throw loginErr;
      }
      throw registerErr;
    }
  }
}

/** Looks up the Firestore uid for a demo account by email, if it's been created yet. */
async function findUidByEmail(email) {
  try {
    const snap = await getDocs(query(collection(db, COL.USERS), where("email", "==", email)));
    return snap.empty ? null : snap.docs[0].id;
  } catch (e) { return null; }
}

/* ------------------------------------------------------------------ Welcome banner */
export function maybeShowDemoBanner(profile) {
  if (!isDemoEmail(profile.email)) return;
  if (sessionStorage.getItem("meridian_demo_banner_dismissed")) return;
  if (document.getElementById("demoWelcomeBanner")) return;
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;

  const banner = document.createElement("div");
  banner.id = "demoWelcomeBanner";
  banner.className = "demo-banner";
  banner.innerHTML = `
    <div class="demo-banner-inner">
      <div class="demo-banner-icon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4.5L6 21l1.5-7.5L2 9h7z"/></svg>
      </div>
      <div class="demo-banner-text">
        <b>Welcome to the demo!</b>
        <p>Feel free to explore all features of the application using this demonstration account. Any changes you make are for testing purposes only and may be reset at any time.</p>
      </div>
      <button class="demo-banner-close" aria-label="Dismiss">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>`;
  topbar.insertAdjacentElement("afterend", banner);
  banner.querySelector(".demo-banner-close").addEventListener("click", () => {
    banner.remove();
    sessionStorage.setItem("meridian_demo_banner_dismissed", "1");
  });
}

/* ------------------------------------------------------------------ Seed / Reset */
const DEMO_COLLECTIONS = [COL.CUSTOMERS, COL.LEADS, COL.DEALS, COL.TASKS, COL.EVENTS, COL.NOTES, COL.NOTIFICATIONS, COL.ACTIVITY];

export async function resetDemoData(adminUser, onLog) {
  onLog("Clearing existing demo data…");
  for (const col of DEMO_COLLECTIONS) {
    try {
      const snap = await getDocs(query(collection(db, col), where("demoSeed", "==", true)));
      await Promise.all(snap.docs.map((d) => deleteDoc(doc(db, col, d.id))));
      onLog(`✔ Cleared ${snap.size} doc(s) from ${col}`);
    } catch (e) {
      onLog(`⚠️ Couldn't clear ${col}: ${e.message}`);
    }
  }
  onLog("Reseeding fresh demo data…");
  await seedDemoData(adminUser, onLog);
}

export async function seedDemoData(adminUser, onLog) {
  const log = onLog || (() => {});
  const adminUid = adminUser.uid;
  const demoUserUid = (await findUidByEmail(DEMO_USER_EMAIL)) || adminUid;
  if (demoUserUid === adminUid) {
    log("ℹ️ Demo User hasn't logged in yet — assigning everything to you for now. Log in as Demo User once, then reseed for realistic two-account data.");
  }

  const industries = ["Healthcare", "Fintech", "Legal", "Retail", "Manufacturing", "SaaS"];
  const companyNames = ["Northwind Health", "Bluepeak Capital", "Harlow & Reed Law", "Cedar Retail Co.", "Ironclad Manufacturing", "Skyline SaaS Labs"];
  const customerIds = [];

  for (let i = 0; i < companyNames.length; i++) {
    const owner = i % 2 === 0 ? adminUid : demoUserUid;
    const docRef = await addDoc(collection(db, COL.CUSTOMERS), {
      companyName: companyNames[i],
      contactPerson: ["Alex Rivera", "Jamie Chen", "Morgan Blake", "Taylor Osei", "Priya Nair", "Sam Whitfield"][i],
      phone: "+1 (555) 01" + i + "-0100",
      email: `contact@${companyNames[i].toLowerCase().replace(/[^a-z]/g, "")}.com`,
      address: `${100 + i} Market Street, Suite ${200 + i}`,
      industry: industries[i],
      website: `https://${companyNames[i].toLowerCase().replace(/[^a-z]/g, "")}.com`,
      customerType: ["active", "vip", "prospect", "active", "churned", "vip"][i],
      assignedStaff: owner,
      notes: "Sample account created by the Meridian CRM demo seeder.",
      demoSeed: true,
      createdAt: serverTimestamp(),
      createdBy: owner
    });
    customerIds.push(docRef.id);
  }
  log(`✔ ${companyNames.length} customers created`);

  const leadStages = ["new", "contacted", "qualified", "proposal_sent", "negotiation", "won", "lost"];
  for (let i = 0; i < 14; i++) {
    const owner = i % 2 === 0 ? adminUid : demoUserUid;
    await addDoc(collection(db, COL.LEADS), {
      name: sampleName(i),
      email: `lead${i}@example.com`,
      company: companyNames[i % companyNames.length],
      phone: "+1 (555) 02" + i + "-0200",
      stage: leadStages[i % leadStages.length],
      value: 2000 + i * 750,
      assignedTo: owner,
      source: ["website", "referral", "cold_call", "event", "other"][i % 5],
      notes: "Auto-generated sample lead.",
      demoSeed: true,
      createdAt: serverTimestamp(),
      createdBy: owner
    });
  }
  log("✔ 14 leads created (split between both demo accounts)");

  const dealStages = ["new_lead", "contacted", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"];
  for (let i = 0; i < 16; i++) {
    const owner = i % 2 === 0 ? adminUid : demoUserUid;
    const stage = dealStages[i % dealStages.length];
    const payload = {
      title: `${companyNames[i % companyNames.length]} — ${["Platform License", "Annual Contract", "Expansion Deal", "Renewal", "Pilot Program"][i % 5]}`,
      value: 5000 + i * 1200,
      stage,
      customerId: customerIds[i % customerIds.length],
      ownerId: owner,
      expectedCloseDate: null,
      demoSeed: true,
      createdAt: serverTimestamp(),
      createdBy: owner
    };
    if (stage === "closed_won" || stage === "closed_lost") payload.closedAt = serverTimestamp();
    await addDoc(collection(db, COL.DEALS), payload);
  }
  log("✔ 16 deals created across the pipeline");

  const now = new Date();
  for (let i = 0; i < 8; i++) {
    const owner = i % 2 === 0 ? adminUid : demoUserUid;
    const due = new Date(now); due.setDate(now.getDate() + (i - 2));
    await addDoc(collection(db, COL.TASKS), {
      title: ["Follow up on proposal", "Prepare contract draft", "Call to confirm renewal", "Send onboarding docs", "Check in after demo", "Collect signed NDA", "Schedule kickoff call", "Review support ticket"][i],
      description: "Auto-generated sample task.",
      priority: ["high", "medium", "low"][i % 3],
      relatedType: ["lead", "customer", "deal", "general"][i % 4],
      dueDate: Timestamp.fromDate(due),
      assignedTo: owner,
      status: i < 2 ? "completed" : "pending",
      demoSeed: true,
      createdAt: serverTimestamp(),
      createdBy: owner
    });
  }
  log("✔ 8 tasks created");

  for (let i = 0; i < 6; i++) {
    const owner = i % 2 === 0 ? adminUid : demoUserUid;
    const start = new Date(now); start.setDate(now.getDate() + i); start.setHours(9 + i, 0, 0, 0);
    const end = new Date(start); end.setHours(start.getHours() + 1);
    await addDoc(collection(db, COL.EVENTS), {
      title: ["Discovery call", "Contract review meeting", "Quarterly check-in", "Product demo", "Renewal discussion", "Onboarding kickoff"][i],
      type: ["call", "meeting", "meeting", "meeting", "call", "appointment"][i],
      location: i % 2 === 0 ? "Zoom" : "Client office",
      startTime: Timestamp.fromDate(start),
      endTime: Timestamp.fromDate(end),
      notes: "Auto-generated sample event.",
      demoSeed: true,
      createdAt: serverTimestamp(),
      createdBy: owner
    });
  }
  log("✔ 6 calendar events created");

  // A note from the Demo User's perspective, visible instantly to Demo Admin.
  await addDoc(collection(db, COL.NOTES), {
    entityId: customerIds[0], entityType: "customer",
    text: "Had a great intro call — they're evaluating us against two competitors. Sending pricing next.",
    authorId: demoUserUid, authorName: "Demo User",
    demoSeed: true, createdAt: serverTimestamp()
  });

  // A message from Demo User to Demo Admin, so the interaction is visible immediately.
  if (demoUserUid !== adminUid) {
    await addDoc(collection(db, COL.NOTIFICATIONS), {
      userId: adminUid,
      title: "Message from Demo User",
      message: "Hey — just closed the Skyline SaaS Labs deal! 🎉 Can you review the contract when you get a chance?",
      type: "team_message", read: false,
      demoSeed: true, createdAt: serverTimestamp()
    });
    await addDoc(collection(db, COL.NOTIFICATIONS), {
      userId: demoUserUid,
      title: "Message from Demo Admin",
      message: "Nice work! I'll take a look this afternoon. Keep the momentum going.",
      type: "team_message", read: false,
      demoSeed: true, createdAt: serverTimestamp()
    });
  }
  await addDoc(collection(db, COL.ACTIVITY), {
    description: "closed the Skyline SaaS Labs deal", actorName: "Demo User",
    demoSeed: true, createdAt: serverTimestamp()
  });
  log("✔ Sample notes, team messages, and activity created");
}

function sampleName(i) {
  const first = ["Ava", "Noah", "Mia", "Liam", "Zoe", "Ethan", "Nora", "Lucas", "Ivy", "Owen", "Ruby", "Kai", "Elena", "Theo"];
  const last = ["Bennett", "Coleman", "Ferreira", "Grant", "Hollis", "Iqbal", "Jansen", "Kowalski", "Larsen", "Mendez", "Nakamura", "Osei", "Patel", "Quinn"];
  return `${first[i % first.length]} ${last[i % last.length]}`;
}
