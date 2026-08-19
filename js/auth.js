/**
 * Meridian CRM — Authentication
 */
import { auth, db, COL } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut,
  sendPasswordResetEmail, sendEmailVerification, onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  doc, setDoc, getDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { ROLES } from "./roles.js";

/** Register a new user, create their Firestore profile, and send a verification email. */
export async function registerUser({ name, email, password, role }) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(cred.user, { displayName: name });
  await setDoc(doc(db, COL.USERS, cred.user.uid), {
    uid: cred.user.uid,
    name,
    email,
    role: role || ROLES.SALES_REP,
    status: "active",
    avatarColor: randomAvatarColor(),
    createdAt: serverTimestamp(),
    lastLoginAt: serverTimestamp()
  });
  await sendEmailVerification(cred.user);
  return cred.user;
}

export async function loginUser(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  try {
    await setDoc(doc(db, COL.USERS, cred.user.uid), { lastLoginAt: serverTimestamp() }, { merge: true });
  } catch (e) { /* non-fatal */ }
  return cred.user;
}

export function logoutUser() {
  return signOut(auth);
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

export function resendVerification() {
  if (auth.currentUser) return sendEmailVerification(auth.currentUser);
}

/** Fetch the Firestore profile document (role, name, etc.) for a user. */
export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db, COL.USERS, uid));
  return snap.exists() ? snap.data() : null;
}

function randomAvatarColor() {
  const palette = ["#145C4B", "#C9A227", "#2F6FED", "#D64545", "#1F8A6F", "#8A6A14"];
  return palette[Math.floor(Math.random() * palette.length)];
}

/**
 * Guard for every protected page. Redirects to /index.html if not logged in.
 * Resolves with { user, profile } once auth state + Firestore profile are ready.
 */
export function requireAuth() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = "index.html";
        return;
      }
      let profile;
      try {
        profile = await getUserProfile(user.uid);
      } catch (err) {
        console.error("requireAuth: failed to load user profile", err);
        window.location.href = "index.html?error=profile";
        return;
      }
      // Self-heal: the Auth account exists but its Firestore profile doc is
      // missing (usually because Firestore wasn't set up yet at signup time).
      // Recreate a default profile instead of permanently locking the user out.
      if (!profile) {
        try {
          const { doc: fdoc, setDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js");
          const defaultProfile = {
            uid: user.uid,
            name: user.displayName || user.email.split("@")[0],
            email: user.email,
            role: "sales_rep",
            status: "active",
            avatarColor: "#145C4B",
            createdAt: serverTimestamp(),
            lastLoginAt: serverTimestamp()
          };
          await setDoc(fdoc(db, "users", user.uid), defaultProfile);
          profile = defaultProfile;
          console.warn("requireAuth: recreated a missing profile document for this account.");
        } catch (err) {
          console.error("requireAuth: could not recreate missing profile", err);
          window.location.href = "index.html?error=profile";
          return;
        }
      }
      if (profile.status === "suspended") {
        await signOut(auth);
        window.location.href = "index.html?suspended=1";
        return;
      }
      resolve({ user, profile });
    });
  });
}

/** For auth pages: if already logged in, skip straight to the dashboard.
 *  Checks once at page load only — does NOT keep listening, so it can't
 *  fire again mid-registration and race against profile creation. */
export function redirectIfAuthed() {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    unsubscribe();
    if (user) window.location.href = "dashboard.html";
  });
}

export function authErrorMessage(err) {
  const map = {
    "auth/email-already-in-use": "That email is already registered. Try logging in instead.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Password should be at least 6 characters.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password. Try again.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again."
  };
  return map[err.code] || err.message || "Something went wrong. Please try again.";
}
