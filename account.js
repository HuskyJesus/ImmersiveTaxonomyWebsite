/* ============================================================
   account.js — shared authentication + account UI

   Loaded by every page (landing, about, and — via script.js —
   the design workspace). It owns the single Firebase Auth setup:
   the auth-state observer, the sign in / sign up / reset modal,
   the account menu, and Account Settings. Pages that need to react
   to sign-in/out (the design page) register a listener with
   onAuthState() instead of duplicating any of this.

   The design workspace additionally uses the shared Firestore
   handles exposed on `account` (db, fns, user) for taxonomy and
   saved-experience storage — there is only one login system.
   ============================================================ */

import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

const FIREBASE_VERSION = "10.12.2";

/* Shared auth state + Firebase handles. */
export const account = {
  configured: isFirebaseConfigured(),
  ready: false,
  db: null,
  auth: null,
  fns: null,
  user: null
};

const $ = (id) => document.getElementById(id);
const on = (id, evt, fn) => { const el = $(id); if (el) el.addEventListener(evt, fn); };

/* ---- Hooks so pages can extend behavior without duplication ---- */
const authListeners = [];      // called on every auth-state change
const beforeSignOutHooks = []; // awaited before sign-out (e.g. flush edits)
let libraryOpener = null;      // set by the design page

export function onAuthState(fn) {
  authListeners.push(fn);
  if (account.ready) fn(account.user);   // late registration gets current state
}
export function onBeforeSignOut(fn) { beforeSignOutHooks.push(fn); }
export function registerLibraryOpener(fn) { libraryOpener = fn; }

/* ------------------------------------------------------------
   Error messages (never surface raw Firebase error objects)
   ------------------------------------------------------------ */
function authErrorMessage(err) {
  const code = err?.code || "";
  const messages = {
    "auth/invalid-email": "That doesn't look like a valid email address.",
    "auth/email-already-in-use": "An account with that email already exists — try signing in instead.",
    "auth/weak-password": "Please choose a longer password (at least 6 characters).",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/wrong-password": "Email or password is incorrect.",
    "auth/user-not-found": "No account found with that email.",
    "auth/too-many-requests": "Too many attempts — please wait a minute and try again.",
    "auth/network-request-failed": "Network problem — check your connection and try again."
  };
  return messages[code] || `Something went wrong (${code || "unknown error"}). Please try again.`;
}

/* Friendly messages for the signed-in security flow (re-authenticate,
   change password, reset). Never surfaces a raw Firebase error. */
function securityErrorMessage(err) {
  const code = err?.code || "";
  const messages = {
    "auth/invalid-credential": "The current password is incorrect.",
    "auth/wrong-password": "The current password is incorrect.",
    "auth/user-mismatch": "Those credentials are for a different account.",
    "auth/weak-password": "Please choose a longer new password (at least 6 characters).",
    "auth/requires-recent-login": "For your security, please sign out and sign back in, then change your password.",
    "auth/user-token-expired": "Your session has expired — please sign out and sign back in, then try again.",
    "auth/too-many-requests": "Too many attempts — please wait a minute and try again.",
    "auth/network-request-failed": "Network problem — check your connection and try again."
  };
  return messages[code] || `Could not complete that (${code || "unknown error"}). Please try again.`;
}

/* ------------------------------------------------------------
   Sign in / sign up / reset modal
   ------------------------------------------------------------ */
let authMode = "signin";

export function openAuthModal(startMode) {
  setAuthMode(startMode);
  $("auth-error").hidden = true;
  $("auth-info").hidden = true;
  $("auth-email").value = "";
  $("auth-password").value = "";
  $("auth-confirm").value = "";
  $("auth-name").value = "";
  $("auth-modal").showModal();
  ($(authMode === "signup" ? "auth-name" : "auth-email")).focus();
}

function setAuthMode(next) {
  authMode = next;
  const titles = { signin: "Sign In", signup: "Create Account", reset: "Reset Password" };
  const submits = { signin: "Sign In", signup: "Sign Up", reset: "Send Reset Email" };
  $("auth-title").textContent = titles[next];
  $("auth-submit").textContent = submits[next];
  $("auth-name-field").hidden = next !== "signup";
  $("auth-confirm-field").hidden = next !== "signup";
  $("auth-password-field").hidden = next === "reset";
  $("auth-to-signup").hidden = next !== "signin";
  $("auth-to-signin").hidden = next === "signin";
  $("auth-to-reset").hidden = next !== "signin";
  $("auth-error").hidden = true;
  $("auth-info").hidden = true;
}

function showAuthError(message) {
  $("auth-error").textContent = message;
  $("auth-error").hidden = false;
  $("auth-info").hidden = true;
}

async function submitAuth() {
  const email = $("auth-email").value.trim();
  const password = $("auth-password").value;
  const submitBtn = $("auth-submit");

  if (!email) { showAuthError("Please enter your email address."); return; }

  submitBtn.disabled = true;
  try {
    if (authMode === "reset") {
      await account.fns.sendPasswordResetEmail(account.auth, email);
      $("auth-info").textContent = "Reset email sent — check your inbox (and spam folder), then sign in with your new password.";
      $("auth-info").hidden = false;
      $("auth-error").hidden = true;

    } else if (authMode === "signup") {
      const name = $("auth-name").value.trim();
      const confirm = $("auth-confirm").value;
      if (!name) { showAuthError("Please choose a display name."); submitBtn.disabled = false; return; }
      if (password.length < 6) { showAuthError("Please choose a password of at least 6 characters."); submitBtn.disabled = false; return; }
      if (password !== confirm) { showAuthError("The two passwords don't match."); submitBtn.disabled = false; return; }

      const cred = await account.fns.createUserWithEmailAndPassword(account.auth, email, password);
      await account.fns.updateProfile(cred.user, { displayName: name });
      await writeUserProfile(cred.user, name, true);
      $("auth-modal").close();

    } else {
      const cred = await account.fns.signInWithEmailAndPassword(account.auth, email, password);
      await writeUserProfile(cred.user, cred.user.displayName || "", false);
      $("auth-modal").close();
    }
  } catch (err) {
    showAuthError(authErrorMessage(err));
  }
  submitBtn.disabled = false;
}

/* ------------------------------------------------------------
   Profile document (users/{uid}) — display metadata only
   ------------------------------------------------------------ */
async function writeUserProfile(user, displayName, isNew) {
  try {
    const { doc, setDoc, getDoc, serverTimestamp } = account.fns;
    const ref = doc(account.db, "users", user.uid);
    const payload = {
      displayName: displayName || user.displayName || "",
      email: user.email,
      lastLoginAt: serverTimestamp()
    };
    if (isNew) {
      payload.createdAt = serverTimestamp();
    } else {
      // Accounts created before profile documents existed (for
      // example the original admin accounts) get a complete profile
      // on their next sign-in.
      const existing = await getDoc(ref);
      if (!existing.exists() || !existing.data()?.createdAt) {
        payload.createdAt = serverTimestamp();
      }
    }
    await setDoc(ref, payload, { merge: true });
  } catch (err) {
    console.warn("Could not update user profile document:", err);
  }
}

/* On auth-state load, repair the Firestore profile from Firebase
   Authentication (the primary source for name + email). Only writes
   when something is missing or out of sync — never overwrites a valid
   stored name with a blank Auth name, and never loops, because it
   writes nothing when the two already agree. */
async function reconcileUserProfile(user) {
  if (!account.configured || !user) return;
  try {
    const { doc, getDoc, setDoc, serverTimestamp } = account.fns;
    const ref = doc(account.db, "users", user.uid);
    const snap = await getDoc(ref);
    const data = snap.exists() ? snap.data() : null;
    const payload = {};
    if (!data) {
      payload.displayName = user.displayName || "";
      payload.email = user.email || "";
      payload.createdAt = serverTimestamp();
      payload.lastLoginAt = serverTimestamp();
    } else {
      // Prefer the Auth profile, but keep a valid stored name if Auth
      // has none (do not replace good data with a blank).
      if (user.displayName && data.displayName !== user.displayName) payload.displayName = user.displayName;
      if (user.email && data.email !== user.email) payload.email = user.email;
      if (!data.createdAt) payload.createdAt = serverTimestamp();
    }
    if (Object.keys(payload).length > 0) {
      await setDoc(ref, payload, { merge: true });
    }
  } catch (err) {
    console.warn("Could not reconcile user profile:", err);
  }
}

/* ------------------------------------------------------------
   Account UI in the header (shared by every page)
   ------------------------------------------------------------ */
export function applyAccountUI() {
  const area = $("account-area");
  if (!area) return;
  area.hidden = !account.configured;
  if (!account.configured) return;
  const signedIn = !!account.user;
  $("auth-buttons").hidden = signedIn;
  $("account-menu-wrap").hidden = !signedIn;
  if (signedIn) {
    const name = account.user.displayName || account.user.email || "";
    $("account-name").textContent = name;
    $("account-initial").textContent = (name.charAt(0) || "?").toUpperCase();
  }
}

function toggleAccountDropdown() {
  const dd = $("account-dropdown");
  dd.hidden = !dd.hidden;
  $("account-btn").setAttribute("aria-expanded", String(!dd.hidden));
}

function closeAccountDropdown() {
  const dd = $("account-dropdown");
  if (!dd) return;
  dd.hidden = true;
  $("account-btn").setAttribute("aria-expanded", "false");
}

async function signOutUser() {
  for (const hook of beforeSignOutHooks) {
    try { await hook(); } catch (err) { console.warn("Before-sign-out hook failed:", err); }
  }
  await account.fns.signOut(account.auth);
  closeAccountDropdown();
}

/* Saved Experiences lives in the design workspace. On the design
   page a library opener is registered; elsewhere, navigate there. */
function openLibraryFromMenu() {
  closeAccountDropdown();
  if (libraryOpener) libraryOpener();
  else location.href = "design.html?panel=saved";
}

/* ------------------------------------------------------------
   Account Settings (any signed-in user — no admin controls here)
   Profile (display name, read-only email) + Security (change
   password, password reset). UID and admin status are never
   editable here.
   ------------------------------------------------------------ */
let settingsNameBaseline = "";     // display name shown when the modal opened
let resetEmailCooldown = false;    // blocks rapid repeat reset-email sends

function setSettingsStatus(el, kind, message) {
  el.textContent = message;
  el.className = `sync-status settings-status is-${kind}`;
  el.hidden = false;
}

function openAccountSettings() {
  closeAccountDropdown();
  if (!account.user) { openAuthModal("signin"); return; }
  const name = account.user.displayName || "";
  $("settings-email").value = account.user.email || "";
  $("settings-name").value = name;
  settingsNameBaseline = name;
  $("settings-current-pw").value = "";
  $("settings-new-pw").value = "";
  $("settings-confirm-pw").value = "";
  $("settings-name-status").hidden = true;
  $("settings-pw-status").hidden = true;
  $("account-settings-modal").showModal();
  $("settings-name").focus();
}

function settingsHasUnsavedName() {
  const current = $("settings-name").value.trim();
  return current !== "" && current !== settingsNameBaseline;
}

function closeAccountSettings() {
  if (settingsHasUnsavedName() &&
      !confirm("You have an unsaved display name change. Close without saving?")) {
    return;
  }
  $("account-settings-modal").close();
}

/* Syncs users/{uid}.displayName to Firestore. Returns true on
   success. Never writes any password field. */
async function writeProfileDisplayName(name) {
  try {
    const { doc, setDoc, serverTimestamp } = account.fns;
    await setDoc(doc(account.db, "users", account.user.uid), {
      displayName: name,
      updatedAt: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (err) {
    console.warn("Could not sync display name to the profile record:", err);
    return false;
  }
}

async function saveDisplayName() {
  if (!account.user) return;
  const status = $("settings-name-status");
  const btn = $("settings-name-save");
  const name = $("settings-name").value.trim();
  if (!name) { setSettingsStatus(status, "error", "Please enter a display name (it cannot be blank)."); return; }

  btn.disabled = true;
  setSettingsStatus(status, "info", "Saving…");

  // Firebase Authentication is the primary source for the name.
  try {
    await account.fns.updateProfile(account.user, { displayName: name });
  } catch (err) {
    btn.disabled = false;
    setSettingsStatus(status, "error", "Update failed — " + securityErrorMessage(err));
    return;
  }

  // Auth succeeded: reflect it in the header/menu right away, and let
  // every page listener (e.g. the design page) react too.
  applyAccountUI();
  authListeners.forEach((fn) => { try { fn(account.user); } catch (e) { console.warn(e); } });

  // Sync Firestore; retry once before reporting a partial failure so
  // the UI never claims full success while the record is stale.
  let profileOk = await writeProfileDisplayName(name);
  if (!profileOk) profileOk = await writeProfileDisplayName(name);

  btn.disabled = false;
  settingsNameBaseline = name;
  if (profileOk) {
    setSettingsStatus(status, "ok", "Display name updated.");
  } else {
    setSettingsStatus(status, "pending",
      "Your name was updated on your account, but saving it to your profile record failed. It will re-sync the next time you sign in.");
  }
}

async function changePassword() {
  if (!account.user) return;
  const status = $("settings-pw-status");
  const btn = $("settings-pw-change");
  const currentPassword = $("settings-current-pw").value;
  const newPassword = $("settings-new-pw").value;
  const confirmPassword = $("settings-confirm-pw").value;

  if (!currentPassword || !newPassword || !confirmPassword) {
    setSettingsStatus(status, "error", "Please fill in all three password fields."); return;
  }
  if (newPassword !== confirmPassword) {
    setSettingsStatus(status, "error", "The new passwords don't match."); return;
  }
  if (newPassword.length < 6) {
    setSettingsStatus(status, "error", "Please choose a new password of at least 6 characters."); return;
  }
  if (newPassword === currentPassword) {
    setSettingsStatus(status, "error", "The new password must be different from your current password."); return;
  }

  btn.disabled = true;
  setSettingsStatus(status, "info", "Updating password…");
  try {
    const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = account.fns;
    // Re-authenticate first (this is a security-sensitive action and
    // may require recent login) — then change the password.
    const credential = EmailAuthProvider.credential(account.user.email, currentPassword);
    await reauthenticateWithCredential(account.user, credential);
    await updatePassword(account.user, newPassword);
    // Passwords are never persisted anywhere — clear the fields.
    $("settings-current-pw").value = "";
    $("settings-new-pw").value = "";
    $("settings-confirm-pw").value = "";
    setSettingsStatus(status, "ok", "Password changed. You're still signed in.");
  } catch (err) {
    setSettingsStatus(status, "error", securityErrorMessage(err));
  }
  btn.disabled = false;
}

async function sendResetFromSettings() {
  if (!account.user || resetEmailCooldown) return;
  const status = $("settings-pw-status");
  const btn = $("settings-pw-reset");
  btn.disabled = true;
  resetEmailCooldown = true;
  try {
    await account.fns.sendPasswordResetEmail(account.auth, account.user.email);
    setSettingsStatus(status, "ok", "Password reset email sent — check your inbox and spam folder.");
    // Brief cooldown to prevent rapid repeat submissions.
    setTimeout(() => { btn.disabled = false; resetEmailCooldown = false; }, 30000);
  } catch (err) {
    setSettingsStatus(status, "error", securityErrorMessage(err));
    btn.disabled = false;
    resetEmailCooldown = false;
  }
}

/* ------------------------------------------------------------
   Firebase init + auth observer
   ------------------------------------------------------------ */
function handleAuthChanged(user) {
  account.user = user;
  applyAccountUI();                       // header/menu refresh immediately from Auth
  if (user) reconcileUserProfile(user);   // repair Firestore profile if needed (non-blocking)
  authListeners.forEach((fn) => { try { fn(user); } catch (e) { console.warn("Auth listener failed:", e); } });
}

async function initFirebaseAccounts() {
  if (!account.configured) { account.ready = true; return; }
  try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const [appMod, fsMod, authMod] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-firestore.js`),
      import(`${base}/firebase-auth.js`)
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    account.db = fsMod.getFirestore(app);
    account.auth = authMod.getAuth(app);
    account.fns = { ...fsMod, ...authMod };
    authMod.onAuthStateChanged(account.auth, handleAuthChanged);
  } catch (err) {
    console.warn("Accounts unavailable (cloud offline or not configured).", err);
  }
  account.ready = true;
}

/* ------------------------------------------------------------
   Wire the shared account UI (present on every page)
   ------------------------------------------------------------ */
function wireAccountUI() {
  on("signin-btn", "click", () => openAuthModal("signin"));
  on("signup-btn", "click", () => openAuthModal("signup"));
  on("auth-submit", "click", submitAuth);
  on("auth-cancel", "click", () => $("auth-modal").close());
  on("auth-close", "click", () => $("auth-modal").close());
  on("auth-to-signup", "click", () => setAuthMode("signup"));
  on("auth-to-signin", "click", () => setAuthMode("signin"));
  on("auth-to-reset", "click", () => setAuthMode("reset"));
  ["auth-password", "auth-confirm"].forEach((id) =>
    on(id, "keydown", (e) => { if (e.key === "Enter") submitAuth(); })
  );

  on("account-btn", "click", toggleAccountDropdown);
  on("menu-settings-btn", "click", openAccountSettings);
  on("menu-signout-btn", "click", signOutUser);
  on("menu-library-btn", "click", openLibraryFromMenu);

  on("settings-close", "click", closeAccountSettings);
  on("settings-name-save", "click", saveDisplayName);
  on("settings-pw-change", "click", changePassword);
  on("settings-pw-reset", "click", sendResetFromSettings);
  on("account-settings-modal", "cancel", (e) => {
    if (settingsHasUnsavedName() &&
        !confirm("You have an unsaved display name change. Close without saving?")) {
      e.preventDefault();
    }
  });

  // Close the account dropdown when clicking outside it.
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".account-menu-wrap")) closeAccountDropdown();
  });

  const copyright = $("footer-copyright");
  if (copyright) {
    copyright.textContent = `© ${new Date().getFullYear()} Ruscella Immersive. All rights reserved.`;
  }
}

/* Module scripts run after the DOM is parsed, so the elements exist. */
wireAccountUI();
applyAccountUI();
export const accountsReady = initFirebaseAccounts();
