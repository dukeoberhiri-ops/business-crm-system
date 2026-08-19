/**
 * Meridian CRM — Firebase Initialization
 * ------------------------------------------------------------------
 * PASTE YOUR FIREBASE SDK CONFIG BELOW (and nowhere else).
 * Get this from: Firebase Console → Project Settings → General →
 * "Your apps" → Web app → SDK setup and configuration → Config.
 * ------------------------------------------------------------------
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, setPersistence, browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js";

// =====================================================================
// 🔧 PASTE YOUR FIREBASE CONFIG OBJECT HERE — REPLACE ALL VALUES BELOW
// =====================================================================
const firebaseConfig = {
  apiKey: "AIzaSyCe389gcpL22lcjQ3CXIRoJA1Pnp_JOUz8",
  authDomain: "meridian-crm-ff8eb.firebaseapp.com",
  projectId: "meridian-crm-ff8eb",
  storageBucket: "meridian-crm-ff8eb.firebasestorage.app",
  messagingSenderId: "293478179464",
  appId: "1:293478179464:web:a2d4f8cc7b58df13ee353d"
};
// =====================================================================

export const firebaseApp = initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
setPersistence(auth, browserLocalPersistence).catch(() => {});

// Firestore (standard in-memory cache — kept simple and dependency-free)
export const db = getFirestore(firebaseApp);

export const storage = getStorage(firebaseApp);

// Collection name constants — keep in sync with firestore.rules
export const COL = {
  USERS: "users",
  LEADS: "leads",
  CUSTOMERS: "customers",
  DEALS: "deals",
  TASKS: "tasks",
  EVENTS: "events",
  NOTES: "notes",
  FILES: "files",
  COMMUNICATIONS: "communications",
  NOTIFICATIONS: "notifications",
  ACTIVITY: "activity_log"
};
