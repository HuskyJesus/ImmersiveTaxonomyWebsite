/* ============================================================
   Immersive Experience Design Taxonomy — script.js

   How this file is organized:
     1. Imports, constants, admin allowlist
     2. App state
     3. Data model helpers + migration (v1/v2 → v3)
     4. Local persistence (localStorage cache)
     5. Cloud sync (Firestore, optional)
     6. Authentication + user accounts
     7. Access control (public / user / admin)
     8. Saved experiences (Firestore subcollection)
     9. Experience library UI
    10. Rendering — the taxonomy grid
    11. Rendering — the recipe board (Inspiration mode)
    12. Description viewer + editor dialogs
    13. Taxonomy search
    14. Edit Mode actions
    15. Design Ideas Mode actions
    16. Inspiration Mode actions
    17. The idea generator
    18. Mode switching + wiring everything up

   DATA MODEL (schema version 3)
   Columns AND values carry stable ids and descriptions — renaming
   either never loses anything keyed to it:
     {
       schemaVersion: 3,
       columns: [{ id, name, shortDescription, detailedDescription, example }],
       rows: [[{ id, text, shortDescription, detailedDescription, example }, ...], ...]
     }

   ACCESS LEVELS
     Public       — view, read descriptions, select, randomize, generate
     Signed-in    — everything public + save experiences to their library
     Administrator— everything + Edit Mode + cloud taxonomy saving
   The Firestore Security Rules (firestore.rules) are the real
   authority; the ADMIN_UIDS list below only shapes the UI.
   ============================================================ */

import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
import { DEFAULT_COLUMNS, VALUE_STARTERS, buildDefaultTaxonomy } from "./starter-content.js";

/* ------------------------------------------------------------
   1. CONSTANTS + ADMIN ALLOWLIST
   ------------------------------------------------------------ */
const STORAGE_KEY = "immersive-taxonomy-v3";
const LEGACY_KEYS = ["immersive-taxonomy-v2", "immersive-taxonomy-v1"];
const FIREBASE_VERSION = "10.12.2";
const CLOUD_DOC_PATH = ["taxonomy", "current"];
const SCHEMA_VERSION = 3;
const EXPERIENCE_SCHEMA_VERSION = 1;

/* The ONLY administrators. Creating an account never grants admin
   access — this list (mirrored in firestore.rules, which is the
   real enforcement point) is the single source of truth. */
const ADMIN_UIDS = [
  "jtOD9eMDeETUXSALKFaQy0sCDiK2",   // Father
  "qN6weHvgweP171ka6dLtrOIU4203"    // Site maintainer
];

/* Reusable admin check — use this everywhere, never inline UIDs */
function isAdminUid(uid) {
  return ADMIN_UIDS.includes(uid);
}

/* Shortcut for grabbing elements by id */
const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------
   2. APP STATE
   ------------------------------------------------------------ */
/* Sync metadata recovered from the localStorage cache. Populated
   by loadLocalTaxonomy() below — declared first to avoid TDZ. */
let cloudMetaFromCache = { revision: null, dirty: false, dirtyAt: null };

let taxonomy = loadLocalTaxonomy();  // the current framework data
let mode = "idea";                   // "edit" | "idea" | "inspire"
let selectedCells = new Set();       // Design Ideas selections, as "row:col" strings
let lockedSelection = new Set();     // subset protected from Randomize
let recipe = null;                   // Inspiration: row index per column (-1 = none)
let lockedColumns = new Set();       // Inspiration: locked column indexes
let lastGeneration = null;           // { kind, topic, idea, selections } — for Regenerate + Save

const cloud = {
  configured: isFirebaseConfigured(),
  ready: false,
  db: null,
  auth: null,
  fns: null,           // firestore + auth functions from the dynamic imports
  user: null,          // signed-in Firebase user (any account)
  revision: null,      // updatedAt millis of the cloud version we're based on
  dirty: false,
  saveTimer: null,
  saving: false
};

/* ------------------------------------------------------------
   3. DATA MODEL HELPERS + MIGRATION
   ------------------------------------------------------------ */
function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function makeColumnId(name) {
  return `${slugify(name) || "column"}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeValueId(text) {
  return `${slugify(text) || "value"}-${Math.random().toString(36).slice(2, 8)}`;
}

/* A brand-new empty cell — every value gets a stable id and a
   blank description record from the moment it exists. */
function makeCell(text = "") {
  return { id: makeValueId(text), text, shortDescription: "", detailedDescription: "", example: "" };
}

/* Starter descriptions for a known default value (or blanks) */
function starterFor(columnId, text) {
  return (VALUE_STARTERS[columnId] || {})[text] || { short: "", detailed: "", example: "" };
}

/* Wraps a plain-string cell (v1/v2 data) into a v3 cell object,
   pulling in starter descriptions when the value is a known
   default. Existing text is never altered. */
function upgradeCell(text, columnId) {
  const starter = starterFor(columnId, text);
  return {
    id: makeValueId(text),
    text,
    shortDescription: starter.short,
    detailedDescription: starter.detailed,
    example: starter.example
  };
}

function isValidV3(data) {
  return (
    data && data.schemaVersion === 3 &&
    Array.isArray(data.columns) && data.columns.length > 0 &&
    data.columns.every((c) => c && typeof c.id === "string" && typeof c.name === "string") &&
    Array.isArray(data.rows) &&
    data.rows.every((row) => Array.isArray(row) && row.length === data.columns.length &&
      row.every((cell) => cell && typeof cell.id === "string" && typeof cell.text === "string"))
  );
}

function isValidV2(data) {
  return (
    data && data.schemaVersion === 2 &&
    Array.isArray(data.columns) && data.columns.length > 0 &&
    data.columns.every((c) => c && typeof c.id === "string" && typeof c.name === "string") &&
    Array.isArray(data.rows) &&
    data.rows.every((row) => Array.isArray(row) && row.length === data.columns.length &&
      row.every((cell) => typeof cell === "string"))
  );
}

function isValidV1(data) {
  return (
    data && Array.isArray(data.columns) && data.columns.length > 0 &&
    data.columns.every((c) => typeof c === "string") &&
    Array.isArray(data.rows) &&
    data.rows.every((row) => Array.isArray(row) && row.length === data.columns.length &&
      row.every((cell) => typeof cell === "string"))
  );
}

/* Fills in optional fields that older v3 data might lack */
function tidyV3(data) {
  data.columns.forEach((c) => {
    c.shortDescription = c.shortDescription || "";
    c.detailedDescription = c.detailedDescription || "";
    c.example = c.example || "";
  });
  data.rows.forEach((row) =>
    row.forEach((cell) => {
      cell.shortDescription = cell.shortDescription || "";
      cell.detailedDescription = cell.detailedDescription || "";
      cell.example = cell.example || "";
    })
  );
  return data;
}

/* MIGRATION: accepts v3, v2, or v1 shapes and returns v3.
   - all existing ids are kept
   - missing descriptions are populated from starter content when
     the value/column matches a known default; custom text is
     never overwritten
   - schemaVersion is bumped to 3 */
function normalizeTaxonomy(data) {
  if (isValidV3(data)) return tidyV3(data);

  if (isValidV2(data)) {
    // v2: column objects (keep their ids + descriptions), string cells
    return {
      schemaVersion: 3,
      columns: data.columns.map((c) => ({
        id: c.id,
        name: c.name,
        shortDescription: c.shortDescription || "",
        detailedDescription: c.detailedDescription || "",
        example: c.example || ""
      })),
      rows: data.rows.map((row) => row.map((text, c) => upgradeCell(text, data.columns[c].id)))
    };
  }

  if (isValidV1(data)) {
    // v1: plain column names + string cells
    const byName = Object.fromEntries(DEFAULT_COLUMNS.map((c) => [c.name, c]));
    const columns = data.columns.map((name) => {
      const preset = byName[name];
      return preset
        ? structuredClone(preset)
        : { id: makeColumnId(name), name, shortDescription: "", detailedDescription: "", example: "" };
    });
    return {
      schemaVersion: 3,
      columns,
      rows: data.rows.map((row) => row.map((text, c) => upgradeCell(text, columns[c].id)))
    };
  }

  return null;
}

/* ------------------------------------------------------------
   4. LOCAL PERSISTENCE
   Stored shape: { taxonomy, cloudRevision, dirty, dirtyAt }
   ------------------------------------------------------------ */
function loadLocalTaxonomy() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const entry = JSON.parse(saved);
      const tax = normalizeTaxonomy(entry.taxonomy);
      if (tax) {
        cloudMetaFromCache = { revision: entry.cloudRevision ?? null, dirty: !!entry.dirty, dirtyAt: entry.dirtyAt ?? null };
        return tax;
      }
    }
    // One-time migration from older storage keys
    for (const key of LEGACY_KEYS) {
      const legacy = localStorage.getItem(key);
      if (!legacy) continue;
      const parsed = JSON.parse(legacy);
      const tax = normalizeTaxonomy(parsed.taxonomy || parsed);   // v2 wrapped, v1 bare
      if (tax) {
        if (parsed.dirty) cloudMetaFromCache = { revision: parsed.cloudRevision ?? null, dirty: true, dirtyAt: parsed.dirtyAt ?? null };
        return tax;
      }
    }
  } catch (err) {
    console.warn("Could not load saved taxonomy, using default.", err);
  }
  return buildDefaultTaxonomy();
}

function saveLocal() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    taxonomy,
    cloudRevision: cloud.revision,
    dirty: cloud.dirty,
    dirtyAt: cloud.dirty ? Date.now() : null
  }));
}

/* ------------------------------------------------------------
   5. CLOUD SYNC (Cloud Firestore)
   Firestore can't store arrays-of-arrays, so the grid is saved
   column-major: each column carries its own values list.
   ------------------------------------------------------------ */
function serializeForCloud() {
  return {
    schemaVersion: SCHEMA_VERSION,
    columns: taxonomy.columns.map((col, c) => ({
      id: col.id,
      name: col.name,
      shortDescription: col.shortDescription,
      detailedDescription: col.detailedDescription,
      example: col.example,
      values: taxonomy.rows.map((row) => ({ ...row[c] }))
    })),
    rowCount: taxonomy.rows.length
  };
}

/* Accepts v3 cloud docs (value objects) AND v2 docs (value strings),
   so existing published data migrates transparently on load. */
function deserializeFromCloud(data) {
  if (!data || !Array.isArray(data.columns) || data.columns.length === 0) return null;
  const rowCount = data.rowCount ?? Math.max(...data.columns.map((c) => (c.values || []).length), 0);
  const columns = data.columns.map((c) => ({
    id: c.id || makeColumnId(c.name || "column"),
    name: c.name || "Untitled",
    shortDescription: c.shortDescription || "",
    detailedDescription: c.detailedDescription || "",
    example: c.example || ""
  }));
  const rows = Array.from({ length: rowCount }, (_, r) =>
    data.columns.map((c, ci) => {
      const v = (c.values || [])[r];
      if (v && typeof v === "object") {                    // v3 cell
        return {
          id: v.id || makeValueId(v.text || ""),
          text: v.text || "",
          shortDescription: v.shortDescription || "",
          detailedDescription: v.detailedDescription || "",
          example: v.example || ""
        };
      }
      return upgradeCell(typeof v === "string" ? v : "", columns[ci].id);   // v2 cell
    })
  );
  const tax = { schemaVersion: 3, columns, rows };
  return isValidV3(tax) ? tax : null;
}

async function initCloud() {
  if (!cloud.configured) {
    setSyncStatus("local", "Local mode — edits save in this browser only.");
    return;
  }
  setSyncStatus("info", "Connecting…");
  try {
    const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
    const [appMod, fsMod, authMod] = await Promise.all([
      import(`${base}/firebase-app.js`),
      import(`${base}/firebase-firestore.js`),
      import(`${base}/firebase-auth.js`)
    ]);
    const app = appMod.initializeApp(firebaseConfig);
    cloud.db = fsMod.getFirestore(app);
    cloud.auth = authMod.getAuth(app);
    cloud.fns = { ...fsMod, ...authMod };

    authMod.onAuthStateChanged(cloud.auth, onAuthChanged);
    await loadFromCloud();
  } catch (err) {
    console.warn("Cloud unavailable, using local cache.", err);
    setSyncStatus("error", "Cloud unavailable — showing the last locally cached version.");
  }
  cloud.ready = true;
}

/* Priority: Firestore → local cache (already loaded) → default */
async function loadFromCloud() {
  const { doc, getDoc } = cloud.fns;
  const snap = await getDoc(doc(cloud.db, ...CLOUD_DOC_PATH));
  if (!snap.exists()) {
    setSyncStatus("info", "No cloud taxonomy published yet — an admin's first save creates it.");
    return;
  }
  const data = snap.data();
  const cloudTax = deserializeFromCloud(data);
  if (!cloudTax) {
    setSyncStatus("error", "Cloud data looks invalid — using the local version.");
    return;
  }
  const cloudRevision = data.updatedAt?.toMillis?.() ?? null;

  // If this browser holds unsaved edits, don't silently discard either side.
  if (cloudMetaFromCache.dirty) {
    const cloudIsNewer =
      cloudRevision && cloudMetaFromCache.revision && cloudRevision > cloudMetaFromCache.revision;
    const keepLocal = confirm(
      "This browser has unsaved taxonomy edits from a previous session.\n\n" +
      (cloudIsNewer ? "Note: the cloud version is NEWER than the version those edits were based on.\n\n" : "") +
      "OK = keep the unsaved local edits (an admin can then save them to the cloud)\n" +
      "Cancel = discard them and load the current cloud version"
    );
    if (keepLocal) {
      cloud.dirty = true;
      cloud.revision = cloudMetaFromCache.revision;
      setSyncStatus("pending", "Offline changes pending — sign in as admin and save to publish them.");
      return;
    }
  }

  taxonomy = cloudTax;
  cloud.revision = cloudRevision;
  cloud.dirty = false;
  saveLocal();
  refreshWorkspace();
  setSyncStatus("ok", "All changes saved");
  updateLastSaved(cloudRevision);
}

function scheduleCloudSave() {
  if (!cloud.configured || !cloud.user || !isAdminUid(cloud.user.uid)) return;
  clearTimeout(cloud.saveTimer);
  setSyncStatus("info", "Saving…");
  cloud.saveTimer = setTimeout(saveToCloud, 1200);
}

async function saveToCloud() {
  if (!cloud.configured || !cloud.user || cloud.saving) return;
  cloud.saving = true;
  setSyncStatus("info", "Saving…");
  try {
    const { doc, setDoc, serverTimestamp, getDoc } = cloud.fns;
    const ref = doc(cloud.db, ...CLOUD_DOC_PATH);
    await setDoc(ref, {
      ...serializeForCloud(),
      updatedAt: serverTimestamp(),
      updatedBy: cloud.user.uid
    });
    const snap = await getDoc(ref);
    cloud.revision = snap.data()?.updatedAt?.toMillis?.() ?? Date.now();
    cloud.dirty = false;
    saveLocal();
    setSyncStatus("ok", "All changes saved");
    updateLastSaved(cloud.revision);
    $("retry-save-btn").hidden = true;
  } catch (err) {
    console.error("Save failed:", err);
    const denied = String(err?.code || "").includes("permission");
    setSyncStatus(
      "error",
      denied
        ? "Save failed: this account is not on the admin allowlist (see firestore.rules)."
        : "Save failed — your edits are kept in this browser. Check your connection and retry."
    );
    $("retry-save-btn").hidden = false;
  }
  cloud.saving = false;
}

async function restoreCloudVersion() {
  if (!cloud.configured || !cloud.fns) return;
  if (!confirm("Replace the taxonomy on screen with the last saved cloud version?")) return;
  try {
    const { doc, getDoc } = cloud.fns;
    const snap = await getDoc(doc(cloud.db, ...CLOUD_DOC_PATH));
    if (!snap.exists()) { alert("There is no saved cloud version yet."); return; }
    const tax = deserializeFromCloud(snap.data());
    if (!tax) { alert("The cloud data could not be read."); return; }
    taxonomy = tax;
    cloud.revision = snap.data().updatedAt?.toMillis?.() ?? null;
    cloud.dirty = false;
    resetSelections();
    saveLocal();
    refreshWorkspace();
    setSyncStatus("ok", "Restored the last saved cloud version.");
    updateLastSaved(cloud.revision);
  } catch (err) {
    alert("Could not reach the cloud: " + err.message);
  }
}

function setSyncStatus(kind, message) {
  const el = $("sync-status");
  el.textContent = message;
  el.className = `sync-status is-${kind}`;
}

function updateLastSaved(millis) {
  $("last-saved").textContent = millis
    ? `Last saved ${new Date(millis).toLocaleString()}`
    : "";
}

/* Every taxonomy edit funnels through here */
function markChanged() {
  cloud.dirty = true;
  saveLocal();
  if (cloud.configured) {
    if (cloud.user && isAdminUid(cloud.user.uid)) {
      scheduleCloudSave();
    } else {
      setSyncStatus("pending", "Offline changes pending — sign in as admin to save them to the cloud.");
    }
  } else {
    cloud.dirty = false;   // local mode: localStorage IS the save
    saveLocal();
    setSyncStatus("local", "Saved in this browser ✓ (cloud sync not configured)");
  }
}

window.addEventListener("beforeunload", (e) => {
  if (cloud.configured && cloud.dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/* ------------------------------------------------------------
   6. AUTHENTICATION + USER ACCOUNTS
   Email/password via Firebase Auth. Registration creates a
   users/{uid} profile document. Passwords never touch Firestore.
   ------------------------------------------------------------ */
let authMode = "signin";   // "signin" | "signup" | "reset"

/* Friendly messages for common Firebase auth error codes */
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

function openAuthModal(startMode) {
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
      await cloud.fns.sendPasswordResetEmail(cloud.auth, email);
      $("auth-info").textContent = "Reset email sent — check your inbox (and spam folder), then sign in with your new password.";
      $("auth-info").hidden = false;
      $("auth-error").hidden = true;

    } else if (authMode === "signup") {
      const name = $("auth-name").value.trim();
      const confirm = $("auth-confirm").value;
      if (!name) { showAuthError("Please choose a display name."); submitBtn.disabled = false; return; }
      if (password.length < 6) { showAuthError("Please choose a password of at least 6 characters."); submitBtn.disabled = false; return; }
      if (password !== confirm) { showAuthError("The two passwords don't match."); submitBtn.disabled = false; return; }

      // Creating the account signs the user in automatically
      const cred = await cloud.fns.createUserWithEmailAndPassword(cloud.auth, email, password);
      await cloud.fns.updateProfile(cred.user, { displayName: name });
      await writeUserProfile(cred.user, name, true);
      $("auth-modal").close();

    } else {
      const cred = await cloud.fns.signInWithEmailAndPassword(cloud.auth, email, password);
      await writeUserProfile(cred.user, cred.user.displayName || "", false);
      $("auth-modal").close();
    }
  } catch (err) {
    showAuthError(authErrorMessage(err));
  }
  submitBtn.disabled = false;
}

/* Creates or refreshes users/{uid}. Only profile metadata is
   stored — never passwords, never roles. */
async function writeUserProfile(user, displayName, isNew) {
  try {
    const { doc, setDoc, serverTimestamp } = cloud.fns;
    const payload = {
      displayName: displayName || user.displayName || "",
      email: user.email,
      lastLoginAt: serverTimestamp()
    };
    if (isNew) payload.createdAt = serverTimestamp();
    await setDoc(doc(cloud.db, "users", user.uid), payload, { merge: true });
  } catch (err) {
    console.warn("Could not update user profile document:", err);
  }
}

async function signOutUser() {
  if (cloud.dirty && isAdminUid(cloud.user?.uid)) await saveToCloud();   // don't lose admin work
  await cloud.fns.signOut(cloud.auth);
  closeAccountDropdown();
}

/* ------------------------------------------------------------
   7. ACCESS CONTROL
   ------------------------------------------------------------ */
function canEdit() {
  return !cloud.configured || (!!cloud.user && isAdminUid(cloud.user.uid));
}

function applyAccessControl() {
  $("edit-mode-btn").hidden = !canEdit();
  $("restore-cloud-btn").hidden = !(cloud.configured && cloud.user && isAdminUid(cloud.user.uid));

  // Header account controls
  $("account-area").hidden = !cloud.configured;
  if (cloud.configured) {
    const signedIn = !!cloud.user;
    $("auth-buttons").hidden = signedIn;
    $("account-menu-wrap").hidden = !signedIn;
    if (signedIn) {
      $("account-name").textContent = cloud.user.displayName || cloud.user.email;
    }
  }

  if (mode === "edit" && !canEdit()) setMode("idea");
  refreshSaveButton();
}

function onAuthChanged(user) {
  cloud.user = user;
  applyAccessControl();
  if (user && isAdminUid(user.uid)) {
    setSyncStatus(cloud.dirty ? "pending" : "ok",
      cloud.dirty ? "Unsaved changes — they save automatically as you edit, or press Save Now." : "All changes saved");
  }
}

/* Account dropdown open/close */
function toggleAccountDropdown() {
  const dd = $("account-dropdown");
  dd.hidden = !dd.hidden;
  $("account-btn").setAttribute("aria-expanded", String(!dd.hidden));
}

function closeAccountDropdown() {
  $("account-dropdown").hidden = true;
  $("account-btn").setAttribute("aria-expanded", "false");
}

/* ------------------------------------------------------------
   8. SAVED EXPERIENCES (users/{uid}/savedExperiences/{id})
   Structured content only — no raw HTML is ever stored.
   ------------------------------------------------------------ */
function experiencesCollection() {
  const { collection } = cloud.fns;
  return collection(cloud.db, "users", cloud.user.uid, "savedExperiences");
}

/* Snapshot of the current selections with STABLE ids, so a saved
   experience survives renames and can be reloaded later. */
function captureSelections() {
  const sels = [];
  if (mode === "inspire" && recipe) {
    taxonomy.columns.forEach((col, c) => {
      const r = recipe[c];
      if (r >= 0 && taxonomy.rows[r][c].text.trim() !== "") {
        const cell = taxonomy.rows[r][c];
        sels.push({ columnId: col.id, columnName: col.name, valueId: cell.id, valueText: cell.text });
      }
    });
  } else {
    selectedCells.forEach((key) => {
      const [r, c] = key.split(":").map(Number);
      const cell = taxonomy.rows[r][c];
      if (cell.text.trim() === "") return;
      sels.push({ columnId: taxonomy.columns[c].id, columnName: taxonomy.columns[c].name, valueId: cell.id, valueText: cell.text });
    });
  }
  return sels;
}

async function saveCurrentExperience() {
  if (!cloud.user) { openAuthModal("signin"); return; }
  if (!lastGeneration) return;
  const btn = $("save-experience-btn");
  if (btn) { btn.disabled = true; btn.textContent = "Saving…"; }
  try {
    const { addDoc, serverTimestamp } = cloud.fns;
    await addDoc(experiencesCollection(), {
      schemaVersion: EXPERIENCE_SCHEMA_VERSION,
      title: lastGeneration.idea.title,
      topic: lastGeneration.topic,
      kind: lastGeneration.kind,                 // "full" | "spark"
      notes: "",
      favorite: false,
      selections: lastGeneration.selections,
      content: lastGeneration.idea,              // structured strings, no HTML
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    if (btn) { btn.textContent = "Saved ✓ — view in Saved Experiences"; }
  } catch (err) {
    console.error("Could not save experience:", err);
    if (btn) { btn.disabled = false; btn.textContent = "💾 Save Experience (failed — try again)"; }
  }
}

/* ------------------------------------------------------------
   9. EXPERIENCE LIBRARY UI
   ------------------------------------------------------------ */
let libraryItems = [];        // [{id, data}]
let libraryOpenItem = null;   // the item shown in detail view

async function openLibrary() {
  closeAccountDropdown();
  if (!cloud.user) { openAuthModal("signin"); return; }
  $("library-list-view").hidden = false;
  $("library-detail-view").hidden = true;
  $("library-modal").showModal();
  await reloadLibrary();
}

async function reloadLibrary() {
  try {
    const { getDocs, query, orderBy } = cloud.fns;
    const snap = await getDocs(query(experiencesCollection(), orderBy("createdAt", "desc")));
    libraryItems = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  } catch (err) {
    console.error("Could not load saved experiences:", err);
    libraryItems = [];
  }
  renderLibraryList();
}

function renderLibraryList() {
  const term = $("lib-search").value.trim().toLowerCase();
  const sort = $("lib-sort").value;
  const favOnly = $("lib-fav-only").checked;

  let items = [...libraryItems];
  if (favOnly) items = items.filter((it) => it.data.favorite);
  if (term) {
    items = items.filter((it) =>
      `${it.data.title} ${it.data.topic} ${it.data.notes}`.toLowerCase().includes(term)
    );
  }
  const created = (it) => it.data.createdAt?.toMillis?.() ?? 0;
  if (sort === "newest") items.sort((a, b) => created(b) - created(a));
  if (sort === "oldest") items.sort((a, b) => created(a) - created(b));
  if (sort === "title") items.sort((a, b) => a.data.title.localeCompare(b.data.title));
  if (sort === "favorite") items.sort((a, b) => (b.data.favorite ? 1 : 0) - (a.data.favorite ? 1 : 0) || created(b) - created(a));

  const list = $("lib-list");
  list.innerHTML = "";
  $("lib-empty").hidden = items.length > 0;

  items.forEach((it) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "lib-item";
    const when = it.data.createdAt?.toMillis?.()
      ? new Date(it.data.createdAt.toMillis()).toLocaleDateString()
      : "";
    row.innerHTML = `
      <span class="lib-item-fav">${it.data.favorite ? "★" : "☆"}</span>
      <span class="lib-item-main"><strong></strong><small></small></span>
      <span class="lib-item-kind">${it.data.kind === "spark" ? "💡" : "✨"}</span>`;
    row.querySelector("strong").textContent = it.data.title;
    row.querySelector("small").textContent = `${it.data.topic} · ${when}`;
    row.addEventListener("click", () => openLibraryDetail(it));
    list.append(row);
  });
}

function openLibraryDetail(item) {
  libraryOpenItem = item;
  const d = item.data;
  $("library-list-view").hidden = true;
  $("library-detail-view").hidden = false;
  $("lib-title").value = d.title;
  $("lib-notes").value = d.notes || "";
  $("lib-fav").textContent = d.favorite ? "★" : "☆";
  const fmt = (ts) => (ts?.toMillis?.() ? new Date(ts.toMillis()).toLocaleString() : "—");
  $("lib-meta").textContent = `Topic: ${d.topic} · Created ${fmt(d.createdAt)} · Last edited ${fmt(d.updatedAt)}`;
  $("lib-chips").innerHTML = (d.selections || [])
    .map((s) => `<span class="chip">${escapeHTML(s.columnName)} · ${escapeHTML(s.valueText)}</span>`)
    .join("");
  $("lib-content").innerHTML = renderIdeaBody(d.content, d.kind);
}

async function saveLibraryChanges() {
  if (!libraryOpenItem) return;
  try {
    const { doc, updateDoc, serverTimestamp } = cloud.fns;
    const newTitle = $("lib-title").value.trim() || "Untitled experience";
    const newNotes = $("lib-notes").value;
    await updateDoc(doc(cloud.db, "users", cloud.user.uid, "savedExperiences", libraryOpenItem.id), {
      title: newTitle,
      notes: newNotes,
      updatedAt: serverTimestamp()
    });
    libraryOpenItem.data.title = newTitle;
    libraryOpenItem.data.notes = newNotes;
    $("lib-save-changes").textContent = "Saved ✓";
    setTimeout(() => ($("lib-save-changes").textContent = "Save Changes"), 1500);
  } catch (err) {
    alert("Could not save changes: " + err.message);
  }
}

async function toggleLibraryFavorite() {
  if (!libraryOpenItem) return;
  try {
    const { doc, updateDoc, serverTimestamp } = cloud.fns;
    const next = !libraryOpenItem.data.favorite;
    await updateDoc(doc(cloud.db, "users", cloud.user.uid, "savedExperiences", libraryOpenItem.id), {
      favorite: next, updatedAt: serverTimestamp()
    });
    libraryOpenItem.data.favorite = next;
    $("lib-fav").textContent = next ? "★" : "☆";
  } catch (err) {
    alert("Could not update favorite: " + err.message);
  }
}

async function duplicateLibraryItem() {
  if (!libraryOpenItem) return;
  try {
    const { addDoc, serverTimestamp } = cloud.fns;
    const copy = structuredClone(libraryOpenItem.data);
    copy.title = `${copy.title} (copy)`;
    copy.favorite = false;
    copy.createdAt = serverTimestamp();
    copy.updatedAt = serverTimestamp();
    await addDoc(experiencesCollection(), copy);
    $("library-detail-view").hidden = true;
    $("library-list-view").hidden = false;
    await reloadLibrary();
  } catch (err) {
    alert("Could not duplicate: " + err.message);
  }
}

async function deleteLibraryItem() {
  if (!libraryOpenItem) return;
  if (!confirm(`Delete “${libraryOpenItem.data.title}”? This cannot be undone.`)) return;
  try {
    const { doc, deleteDoc } = cloud.fns;
    await deleteDoc(doc(cloud.db, "users", cloud.user.uid, "savedExperiences", libraryOpenItem.id));
    libraryOpenItem = null;
    $("library-detail-view").hidden = true;
    $("library-list-view").hidden = false;
    await reloadLibrary();
  } catch (err) {
    alert("Could not delete: " + err.message);
  }
}

/* Maps saved selections (stable ids, name fallbacks) back onto the
   CURRENT taxonomy and selects them in Design Ideas mode. */
function loadSelectionsIntoGenerator(saved) {
  setMode("idea");
  selectedCells.clear();
  lockedSelection.clear();
  (saved.selections || []).forEach((s) => {
    let c = taxonomy.columns.findIndex((col) => col.id === s.columnId);
    if (c < 0) c = taxonomy.columns.findIndex((col) => col.name === s.columnName);
    if (c < 0) return;
    let r = taxonomy.rows.findIndex((row) => row[c].id === s.valueId);
    if (r < 0) r = taxonomy.rows.findIndex((row) => row[c].text === s.valueText);
    if (r < 0) return;
    selectedCells.add(`${r}:${c}`);
  });
  $("topic-input").value = saved.topic || "";
  renderTable();
}

function libraryLoad() {
  if (!libraryOpenItem) return;
  loadSelectionsIntoGenerator(libraryOpenItem.data);
  $("library-modal").close();
}

/* Regenerate from the same recipe: a fresh variation appears in the
   generator; saving it creates a separate library entry. */
function libraryRegenerate() {
  if (!libraryOpenItem) return;
  const kind = libraryOpenItem.data.kind || "full";
  loadSelectionsIntoGenerator(libraryOpenItem.data);
  $("library-modal").close();
  generateIdea(kind);
}

/* ------------------------------------------------------------
   10. RENDERING — THE TAXONOMY GRID
   ------------------------------------------------------------ */
function refreshWorkspace() {
  if (mode === "inspire") {
    recipe = null;
    lockedColumns.clear();
    newRecipe();
  } else {
    renderTable();
  }
}

function renderTable() {
  const container = $("table-container");
  container.innerHTML = "";

  const table = document.createElement("table");

  /* ----- Header row (the design dimensions) ----- */
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  taxonomy.columns.forEach((col, colIndex) => {
    const th = document.createElement("th");

    if (mode === "edit") {
      const wrap = document.createElement("div");
      wrap.className = "header-cell";

      const name = document.createElement("span");
      name.className = "header-name";
      name.contentEditable = "true";
      name.spellcheck = false;
      name.textContent = col.name;
      name.addEventListener("blur", () => {
        col.name = name.textContent.trim() || "Untitled";   // id stays stable
        name.textContent = col.name;
        markChanged();
      });

      const edit = document.createElement("button");
      edit.className = "delete-btn";
      edit.title = `Edit the description of “${col.name}”`;
      edit.textContent = "✎";
      edit.addEventListener("click", () => openEditor({ type: "column", c: colIndex }));

      const del = document.createElement("button");
      del.className = "delete-btn";
      del.title = `Delete column “${col.name}”`;
      del.textContent = "×";
      del.addEventListener("click", () => deleteColumn(colIndex));

      wrap.append(name, edit, del);
      th.append(wrap);
    } else {
      th.className = "th-info";
      th.tabIndex = 0;
      th.setAttribute("role", "button");
      th.setAttribute("aria-label", `About the ${col.name} dimension`);
      if (col.shortDescription) th.title = col.shortDescription;
      th.innerHTML = `<span class="th-label"></span> <span class="info-icon" aria-hidden="true">ⓘ</span>`;
      th.querySelector(".th-label").textContent = col.name;
      const open = () => openInfoModal({ type: "column", c: colIndex });
      th.addEventListener("click", open);
      th.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    }

    headRow.append(th);
  });

  if (mode === "edit") {
    const spacer = document.createElement("th");
    spacer.className = "row-tools";
    headRow.append(spacer);
  }

  thead.append(headRow);
  table.append(thead);

  /* ----- Body rows (the values) ----- */
  const tbody = document.createElement("tbody");

  taxonomy.rows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");

    row.forEach((cell, colIndex) => {
      const td = document.createElement("td");

      if (mode === "edit") {
        // Editable text + a ✎ button for the value's descriptions
        td.className = "edit-cell";
        const text = document.createElement("span");
        text.className = "cell-text";
        text.contentEditable = "true";
        text.spellcheck = false;
        text.textContent = cell.text;
        text.addEventListener("blur", () => {
          cell.text = text.textContent.trim();   // id + descriptions stay
          markChanged();
        });

        const edit = document.createElement("button");
        edit.className = "cell-info-btn";
        edit.title = `Edit the description of “${cell.text || "this value"}”`;
        edit.textContent = "✎";
        edit.addEventListener("click", (e) => {
          e.stopPropagation();
          openEditor({ type: "value", c: colIndex, r: rowIndex });
        });

        td.append(text, edit);
      } else {
        // Selectable value + ⓘ info button (info never changes selection)
        td.className = "selectable";
        const key = `${rowIndex}:${colIndex}`;
        if (selectedCells.has(key)) td.classList.add("is-selected");
        if (lockedSelection.has(key)) td.classList.add("is-locked-cell");

        const label = document.createElement("span");
        label.className = "cell-text";
        label.textContent = cell.text;
        td.append(label);

        if (cell.text.trim() !== "") {
          const info = document.createElement("button");
          info.className = "cell-info-btn";
          info.setAttribute("aria-label", `About ${cell.text}`);
          if (cell.shortDescription) info.title = cell.shortDescription;
          info.textContent = "ⓘ";
          info.addEventListener("click", (e) => {
            e.stopPropagation();   // the ⓘ opens info; it never selects
            openInfoModal({ type: "value", c: colIndex, r: rowIndex });
          });
          td.append(info);
        }

        td.addEventListener("click", () => toggleCell(key, td));
      }

      tr.append(td);
    });

    if (mode === "edit") {
      const tools = document.createElement("td");
      tools.className = "row-tools";
      const del = document.createElement("button");
      del.className = "delete-btn";
      del.title = "Delete this row";
      del.textContent = "×";
      del.addEventListener("click", () => deleteRow(rowIndex));
      tools.append(del);
      tr.append(tools);
    }

    tbody.append(tr);
  });

  table.append(tbody);
  container.append(table);

  updateSelectionSummary();
}

function updateSelectionSummary() {
  const el = $("selection-summary");
  const count = selectedCells.size;
  const locked = lockedSelection.size;

  let text =
    count === 0
      ? "No cells selected yet — click cells in the framework below, or use Randomize. ⓘ opens a value's meaning without selecting it."
      : `${count} cell${count === 1 ? "" : "s"} selected.`;
  if (locked > 0) text += ` ${locked} locked — Randomize fills only the unlocked dimensions.`;
  el.textContent = text;

  $("lock-selection-btn").textContent =
    locked > 0 ? "🔓 Unlock Selection" : "🔒 Lock Selection";
}

/* ------------------------------------------------------------
   11. RENDERING — THE RECIPE BOARD (Inspiration Mode)
   ------------------------------------------------------------ */
function renderRecipeBoard() {
  const board = $("recipe-board");
  board.innerHTML = "";
  if (!recipe) return;

  taxonomy.columns.forEach((col, colIndex) => {
    const rowIndex = recipe[colIndex];
    const cell = rowIndex >= 0 ? taxonomy.rows[rowIndex][colIndex] : null;
    const locked = lockedColumns.has(colIndex);

    const card = document.createElement("div");
    card.className = "recipe-card" + (locked ? " is-locked" : "");

    const dim = document.createElement("button");
    dim.className = "recipe-dimension recipe-dimension-btn";
    dim.type = "button";
    dim.title = col.shortDescription || `About ${col.name}`;
    dim.innerHTML = `<span></span> <span class="info-icon" aria-hidden="true">ⓘ</span>`;
    dim.querySelector("span").textContent = col.name;
    dim.addEventListener("click", () => openInfoModal({ type: "column", c: colIndex }));

    const val = document.createElement("button");
    val.className = "recipe-value recipe-value-btn";
    val.type = "button";
    val.textContent = cell ? cell.text : "—";
    if (cell && cell.shortDescription) val.title = cell.shortDescription;
    if (cell) val.addEventListener("click", () => openInfoModal({ type: "value", c: colIndex, r: rowIndex }));

    const actions = document.createElement("div");
    actions.className = "recipe-actions";

    const reroll = document.createElement("button");
    reroll.className = "icon-btn";
    reroll.title = `Reroll ${col.name}`;
    reroll.textContent = "🔄";
    reroll.addEventListener("click", () => rerollColumn(colIndex));

    const lock = document.createElement("button");
    lock.className = "icon-btn";
    lock.title = locked ? `Unlock ${col.name}` : `Lock ${col.name}`;
    lock.textContent = locked ? "🔒" : "🔓";
    lock.addEventListener("click", () => toggleColumnLock(colIndex));

    actions.append(reroll, lock);
    card.append(dim, val, actions);
    board.append(card);
  });

  updateLockSummary();
}

function updateLockSummary() {
  const count = lockedColumns.size;
  $("lock-summary").textContent =
    count === 0 ? "" : `${count} dimension${count === 1 ? "" : "s"} locked.`;
}

/* ------------------------------------------------------------
   12. DESCRIPTION VIEWER + EDITOR
   One pair of dialogs serves both columns and values.
   target = { type: "column"|"value", c, r? }
   ------------------------------------------------------------ */
function targetRecord(target) {
  return target.type === "column"
    ? taxonomy.columns[target.c]
    : taxonomy.rows[target.r][target.c];
}

function openInfoModal(target) {
  const rec = targetRecord(target);
  const isValue = target.type === "value";
  $("desc-modal-context").hidden = !isValue;
  if (isValue) $("desc-modal-context").textContent = taxonomy.columns[target.c].name;
  $("desc-modal-title").textContent = isValue ? rec.text : rec.name;
  $("desc-modal-short").textContent =
    rec.shortDescription || "No description has been written for this yet.";
  $("desc-modal-detail").textContent = rec.detailedDescription;
  $("desc-modal-detail-wrap").hidden = !rec.detailedDescription;
  $("desc-modal-example").textContent = rec.example;
  $("desc-modal-example-wrap").hidden = !rec.example;
  $("desc-modal").showModal();
}

let editingTarget = null;

function openEditor(target) {
  editingTarget = target;
  const rec = targetRecord(target);
  const isValue = target.type === "value";
  $("desc-editor-title").textContent = isValue
    ? `Edit value in “${taxonomy.columns[target.c].name}”`
    : `Edit “${rec.name}”`;
  $("edit-cat-name-label").textContent = isValue ? "Value text" : "Category name";
  $("edit-cat-name").value = isValue ? rec.text : rec.name;
  $("edit-cat-short").value = rec.shortDescription;
  $("edit-cat-detail").value = rec.detailedDescription;
  $("edit-cat-example").value = rec.example;
  $("desc-editor").showModal();
}

function editorIsDirty() {
  if (!editingTarget) return false;
  const rec = targetRecord(editingTarget);
  const currentName = editingTarget.type === "value" ? rec.text : rec.name;
  return (
    $("edit-cat-name").value.trim() !== currentName ||
    $("edit-cat-short").value.trim() !== rec.shortDescription ||
    $("edit-cat-detail").value.trim() !== rec.detailedDescription ||
    $("edit-cat-example").value.trim() !== rec.example
  );
}

function saveEditor() {
  const rec = targetRecord(editingTarget);
  const name = $("edit-cat-name").value.trim();
  if (editingTarget.type === "value") {
    rec.text = name;                                  // may be empty; id stays stable
  } else {
    rec.name = name || "Untitled";
  }
  rec.shortDescription = $("edit-cat-short").value.trim();
  rec.detailedDescription = $("edit-cat-detail").value.trim();
  rec.example = $("edit-cat-example").value.trim();
  $("desc-editor").close();
  editingTarget = null;
  markChanged();
  renderTable();
}

function cancelEditor() {
  if (editorIsDirty() && !confirm("Discard your changes?")) return;
  $("desc-editor").close();
  editingTarget = null;
}

/* ------------------------------------------------------------
   13. TAXONOMY SEARCH
   Searches category names, value names, all descriptions, and
   examples. Selecting a result opens its information dialog.
   ------------------------------------------------------------ */
function searchTaxonomy(term) {
  const t = term.toLowerCase();
  const results = [];
  taxonomy.columns.forEach((col, c) => {
    const hay = `${col.name} ${col.shortDescription} ${col.detailedDescription} ${col.example}`.toLowerCase();
    if (hay.includes(t)) {
      results.push({ type: "column", c, label: col.name, context: "Category", snippet: col.shortDescription });
    }
  });
  taxonomy.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell.text.trim() === "") return;
      const hay = `${cell.text} ${cell.shortDescription} ${cell.detailedDescription} ${cell.example}`.toLowerCase();
      if (hay.includes(t)) {
        results.push({ type: "value", c, r, label: cell.text, context: taxonomy.columns[c].name, snippet: cell.shortDescription });
      }
    });
  });
  return results.slice(0, 10);
}

function renderSearchResults() {
  const term = $("search-input").value.trim();
  const box = $("search-results");
  if (term.length < 2) { box.hidden = true; box.innerHTML = ""; return; }

  const results = searchTaxonomy(term);
  box.innerHTML = "";
  if (results.length === 0) {
    box.innerHTML = `<p class="search-empty">No matches.</p>`;
  } else {
    results.forEach((res) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "search-result";
      btn.setAttribute("role", "option");
      btn.innerHTML = `<span class="search-context"></span><strong></strong><small></small>`;
      btn.querySelector(".search-context").textContent = res.context;
      btn.querySelector("strong").textContent = res.label;
      btn.querySelector("small").textContent = res.snippet || "";
      btn.addEventListener("click", () => {
        box.hidden = true;
        openInfoModal(res.type === "column" ? { type: "column", c: res.c } : { type: "value", c: res.c, r: res.r });
      });
      box.append(btn);
    });
  }
  box.hidden = false;
}

/* ------------------------------------------------------------
   14. EDIT MODE ACTIONS
   ------------------------------------------------------------ */
function addRow() {
  taxonomy.rows.push(taxonomy.columns.map(() => makeCell()));   // blank descriptions auto-created
  afterStructureChange();
}

function addColumn() {
  const name = `New Dimension ${taxonomy.columns.length + 1}`;
  taxonomy.columns.push({
    id: makeColumnId(name),
    name,
    shortDescription: "",
    detailedDescription: "",
    example: ""
  });
  taxonomy.rows.forEach((row) => row.push(makeCell()));
  afterStructureChange();
}

function deleteRow(rowIndex) {
  if (taxonomy.rows.length <= 1) {
    alert("The framework needs at least one row.");
    return;
  }
  if (!confirm("Delete this row? Its values and their descriptions will be removed.")) return;
  taxonomy.rows.splice(rowIndex, 1);
  afterStructureChange();
}

function deleteColumn(colIndex) {
  if (taxonomy.columns.length <= 1) {
    alert("The framework needs at least one column.");
    return;
  }
  const col = taxonomy.columns[colIndex];
  if (!confirm(`Delete the column “${col.name}”? Its description and all of its values' descriptions will be removed.`)) return;
  taxonomy.columns.splice(colIndex, 1);
  taxonomy.rows.forEach((row) => row.splice(colIndex, 1));
  afterStructureChange();
}

function resetSelections() {
  selectedCells.clear();
  lockedSelection.clear();
  recipe = null;
  lockedColumns.clear();
}

function afterStructureChange() {
  resetSelections();
  markChanged();
  renderTable();
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(taxonomy, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "taxonomy-backup.json";
  link.click();
  URL.revokeObjectURL(url);
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = JSON.parse(reader.result);
      const tax = normalizeTaxonomy(raw.taxonomy || raw);
      if (!tax) {
        alert(
          "That file doesn't look like a valid taxonomy.\n\n" +
          "Accepted formats: the current schema (v3), the previous column-object schema (v2), " +
          'or the original { "columns": ["..."], "rows": [["..."]] } format.'
        );
        return;
      }
      const preview =
        `Import this taxonomy?\n\n` +
        `Columns (${tax.columns.length}): ${tax.columns.map((c) => c.name).join(", ")}\n` +
        `Rows: ${tax.rows.length}\n\n` +
        `This replaces the taxonomy on screen` +
        (cloud.configured && cloud.user && isAdminUid(cloud.user.uid)
          ? ` and will be saved to the cloud automatically.` : `.`);
      if (!confirm(preview)) return;

      taxonomy = tax;
      resetSelections();
      markChanged();
      renderTable();
    } catch {
      alert("Could not read that file as JSON.");
    }
  };
  reader.readAsText(file);
}

function resetToDefault() {
  if (!confirm("Reset to the default starter taxonomy? This replaces your current framework.")) return;
  taxonomy = buildDefaultTaxonomy();
  afterStructureChange();
}

/* ------------------------------------------------------------
   15. DESIGN IDEAS MODE ACTIONS
   ------------------------------------------------------------ */
function toggleCell(key, td) {
  if (selectedCells.has(key)) {
    selectedCells.delete(key);
    lockedSelection.delete(key);
    td.classList.remove("is-selected", "is-locked-cell");
  } else {
    selectedCells.add(key);
    td.classList.add("is-selected");
  }
  updateSelectionSummary();
}

function rowsWithValue(colIndex) {
  const candidates = [];
  taxonomy.rows.forEach((row, rowIndex) => {
    if (row[colIndex].text.trim() !== "") candidates.push(rowIndex);
  });
  return candidates;
}

function lockedCellInColumn(colIndex) {
  for (let r = 0; r < taxonomy.rows.length; r++) {
    if (lockedSelection.has(`${r}:${colIndex}`)) return `${r}:${colIndex}`;
  }
  return null;
}

function toggleSelectionLock() {
  if (lockedSelection.size > 0) {
    lockedSelection.clear();
    renderTable();
    return;
  }
  if (selectedCells.size === 0) {
    alert("Select some cells first, then lock them.");
    return;
  }

  let trimmed = 0;
  taxonomy.columns.forEach((_, colIndex) => {
    let keptOne = false;
    for (let r = 0; r < taxonomy.rows.length; r++) {
      const key = `${r}:${colIndex}`;
      if (!selectedCells.has(key)) continue;
      if (!keptOne) {
        lockedSelection.add(key);
        keptOne = true;
      } else {
        selectedCells.delete(key);
        trimmed++;
      }
    }
  });

  renderTable();
  if (trimmed > 0) {
    $("selection-summary").textContent +=
      ` (${trimmed} extra cell${trimmed === 1 ? "" : "s"} removed — a recipe keeps one value per dimension.)`;
  }
}

/* Randomize: a COMPLETE recipe — exactly one cell per column,
   locked columns kept, columns with no usable values skipped. */
function randomizeSelection() {
  const next = new Set();
  taxonomy.columns.forEach((_, colIndex) => {
    const locked = lockedCellInColumn(colIndex);
    if (locked) { next.add(locked); return; }
    const candidates = rowsWithValue(colIndex);
    if (candidates.length > 0) next.add(`${pick(candidates)}:${colIndex}`);
  });
  selectedCells = next;
  renderTable();
}

function randomPath() {
  randomizeSelection();
  generateIdea("full");
}

function clearSelection() {
  selectedCells.clear();
  lockedSelection.clear();
  renderTable();
  $("idea-output").hidden = true;
}

/* ------------------------------------------------------------
   16. INSPIRATION MODE ACTIONS
   ------------------------------------------------------------ */
function newRecipe() {
  const previous = recipe;
  recipe = taxonomy.columns.map((_, colIndex) => {
    if (lockedColumns.has(colIndex) && previous && previous[colIndex] >= 0) {
      return previous[colIndex];
    }
    const candidates = rowsWithValue(colIndex);
    return candidates.length > 0 ? pick(candidates) : -1;
  });
  renderRecipeBoard();
}

function rerollColumn(colIndex) {
  const candidates = rowsWithValue(colIndex);
  if (candidates.length === 0) return;
  const others = candidates.filter((r) => r !== recipe[colIndex]);
  recipe[colIndex] = others.length > 0 ? pick(others) : candidates[0];
  lockedColumns.delete(colIndex);
  renderRecipeBoard();
}

function toggleColumnLock(colIndex) {
  if (lockedColumns.has(colIndex)) {
    lockedColumns.delete(colIndex);
  } else {
    lockedColumns.add(colIndex);
  }
  renderRecipeBoard();
}

/* ------------------------------------------------------------
   17. THE IDEA GENERATOR
   The generator now reads the DESCRIPTIONS of both the selected
   values and their categories — the same editable text shown in
   the info dialogs — so ideas are interpreted, not concatenated.
   Everything runs locally.
   ------------------------------------------------------------ */

/* Generic fallback role per default dimension (used only when a
   custom column has no description of its own) */
const COLUMN_ROLES = {
  "Interactivity": "what participants do",
  "Embodiment": "how present participants feel",
  "Co-Participation": "the social structure",
  "Story": "the narrative structure",
  "Dynamics": "agency and system behavior",
  "Motivation": "why participants keep going",
  "Meta Control": "whether participants shape the world and its rules",
  "Learning": "how knowledge is delivered",
  "Data": "personalization and tracking",
  "Tech": "the platform assumptions"
};

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickSome(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* Turns a stored description sentence into a mid-sentence phrase:
   lowercases the first letter and strips the trailing period. */
function asClause(sentence) {
  const s = sentence.trim().replace(/\.$/, "");
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function naturalJoin(items) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function escapeHTML(text) {
  const div = document.createElement("div");
  div.textContent = String(text ?? "");
  return div.innerHTML;
}

/* Collects the chosen CELLS grouped by column name */
function buildGroups() {
  const groups = {};

  if (mode === "inspire") {
    if (!recipe) return groups;
    taxonomy.columns.forEach((col, colIndex) => {
      const rowIndex = recipe[colIndex];
      if (rowIndex < 0) return;
      const cell = taxonomy.rows[rowIndex][colIndex];
      if (cell.text.trim() !== "") groups[col.name] = [cell];
    });
  } else {
    selectedCells.forEach((key) => {
      const [r, c] = key.split(":").map(Number);
      const cell = taxonomy.rows[r][c];
      if (cell.text.trim() === "") return;
      const colName = taxonomy.columns[c].name;
      if (!groups[colName]) groups[colName] = [];
      groups[colName].push(cell);
    });
  }

  return groups;
}

function proseCells(cells = []) {
  return cells.filter((cell) => cell.text.toLowerCase() !== "none");
}

/* --- Topic analysis: matches the topic against domain profiles
   so generated ideas use vocabulary that fits the subject --- */
const DOMAIN_PROFILES = [
  {
    keywords: ["cook", "food", "recipe", "kitchen", "bak", "cuisine", "chef", "meal", "taste", "dining"],
    artifacts: ["ingredients", "recipes", "technique", "flavor pairings", "food traditions"],
    actions: [
      "prep and combine real ingredients",
      "balance flavors against the clock",
      "reverse-engineer a dish by taste",
      "plate and present a finished dish",
      "trace a recipe back through its food culture"
    ],
    place: "a working kitchen",
    community: "fellow cooks",
    payoff: "a dish they can actually make — and the confidence to improvise the next one"
  },
  {
    keywords: ["game", "gaming", "esports", "arcade", "video"],
    artifacts: ["mechanics", "levels", "progression systems", "genres", "player strategies"],
    actions: [
      "learn a system by playing it",
      "take a level apart to see why it works",
      "prototype a mechanic and watch players break it",
      "iterate on a strategy against real opponents",
      "trace how a genre evolved one design decision at a time"
    ],
    place: "a living game world",
    community: "other players",
    payoff: "a designer's eye — they stop just playing games and start reading them"
  },
  {
    keywords: ["writ", "essay", "memoir", "non-fiction", "nonfiction", "journal", "poet", "author"],
    artifacts: ["voice", "memory", "structure", "evidence", "perspective", "revision"],
    actions: [
      "gather raw material from real life",
      "test the same true story in two different structures",
      "revise a passage until the voice is unmistakably theirs",
      "weigh evidence against memory",
      "read their work aloud and feel where it lands"
    ],
    place: "a writer's room of drafts, sources, and voices",
    community: "fellow writers and readers",
    payoff: "a piece of true writing with a voice of its own"
  },
  {
    keywords: ["history", "war", "civil", "ancient", "egypt", "rome", "greek", "revolution", "medieval", "century", "historical"],
    artifacts: ["primary sources", "competing perspectives", "maps and geography", "pivotal decisions", "consequences"],
    actions: [
      "examine primary sources firsthand",
      "stand inside a pivotal decision as it's being made",
      "hear the same event told from opposing sides",
      "trace causes forward into consequences",
      "walk the actual geography where it happened"
    ],
    place: "a reconstructed historical moment",
    community: "the people who lived it",
    payoff: "history felt as lived experience rather than memorized dates"
  },
  {
    keywords: ["science", "physic", "chem", "bio", "space", "astro", "math", "engineer", "nature", "climate"],
    artifacts: ["experiments", "models", "data", "phenomena", "predictions"],
    actions: [
      "run an experiment and watch it disagree with them",
      "build a model, then break it on purpose",
      "predict first, observe second",
      "scale the invisible up to human size",
      "follow one measurement all the way to a conclusion"
    ],
    place: "a laboratory with no safety limits",
    community: "fellow investigators",
    payoff: "an intuition for how the system really behaves"
  },
  {
    keywords: ["music", "art", "paint", "danc", "theat", "film", "design", "photo", "sculpt"],
    artifacts: ["techniques", "styles", "materials", "compositions", "influences"],
    actions: [
      "study a master's choices from the inside",
      "experiment with materials until something surprises them",
      "compose, perform, and get an honest response",
      "remix an established style into their own",
      "watch one work change meaning in different contexts"
    ],
    place: "an open studio",
    community: "fellow makers",
    payoff: "a made thing that carries their own choices in it"
  }
];

const GENERIC_PROFILE = {
  keywords: [],
  artifacts: ["core ideas", "real examples", "open questions", "turning points"],
  actions: [
    "explore the territory at their own pace",
    "test their understanding against real cases",
    "piece together the big picture from fragments",
    "apply what they find to a problem that matters"
  ],
  place: "a world built from the topic itself",
  community: "fellow explorers",
  payoff: "an understanding they built themselves"
};

function analyzeTopic(topic) {
  const t = topic.toLowerCase();
  for (const profile of DOMAIN_PROFILES) {
    if (profile.keywords.some((k) => t.includes(k))) return profile;
  }
  return GENERIC_PROFILE;
}

/* Composes a complete idea object (plain strings only — this is
   exactly what gets stored when a user saves the experience). */
function composeIdea(topic, groups, profile) {
  const columnNames = Object.keys(groups);
  const columnByName = Object.fromEntries(taxonomy.columns.map((c) => [c.name, c]));

  const allCells = proseCells(columnNames.flatMap((c) => groups[c]));
  const signature = allCells.length > 0 ? pick(allCells).text : "Immersive";

  // First chosen cell in a dimension (skipping "none"-style values)
  const cellOf = (col) => proseCells(groups[col] || [])[0] || null;

  /* The heart of the smarter generator: the meaning of a chosen
     value is its EDITED short description; the meaning of its
     dimension is the category's short description. Both fall back
     gracefully for custom content. */
  const valueMeaning = (col, fallback) => {
    const cell = cellOf(col);
    if (!cell) return fallback;
    if (cell.shortDescription) return asClause(cell.shortDescription);
    const role = columnByName[col]?.shortDescription
      ? asClause(columnByName[col].shortDescription)
      : (COLUMN_ROLES[col] || "a key aspect of the design");
    return `“${cell.text}” shapes ${role}`;
  };
  const columnMeaning = (col) => {
    const c = columnByName[col];
    return c?.shortDescription ? asClause(c.shortDescription) : (COLUMN_ROLES[col] || "a key dimension of the design");
  };

  const [actionA, actionB] = pickSome(profile.actions, 2);

  const title = pick([
    `${capitalize(topic)}: The ${signature} Experience`,
    `Inside ${capitalize(topic)}`,
    `${capitalize(topic)}, ${pick(["Reimagined", "Unlocked", "Up Close", "From the Inside"])}`,
    `The ${signature} ${capitalize(topic)} Project`
  ]);

  const pitch = pick([
    `An immersive take on ${topic} where ${valueMeaning("Interactivity", "participants explore freely")} — set in ${profile.place}, built around ${naturalJoin(pickSome(profile.artifacts, 2))}.`,
    `${capitalize(profile.place)} becomes the classroom: an experience about ${topic} in which ${valueMeaning("Interactivity", "participants set their own pace")}.`,
    `A designed experience that turns ${topic} into a place — one where ${valueMeaning("Embodiment", "participants feel genuinely present")}, and ${naturalJoin(pickSome(profile.artifacts, 2))} are things you handle, not read about.`
  ]);

  const audience = `${capitalize(valueMeaning("Co-Participation", "designed for solo or small-group participation"))}. ${capitalize(valueMeaning("Embodiment", "participants are present through their own natural perspective"))} — cast as ${pick([
    "curious newcomers",
    "hands-on apprentices",
    "investigators with a real question",
    "co-creators with a stake in the outcome"
  ])} among ${profile.community}.`;

  const storyCell = cellOf("Story");
  const flow =
    `Arrival: participants step into ${profile.place}${storyCell ? ` — ${valueMeaning("Story", "")}` : ""}. ` +
    `The core: they ${actionA}, then ${actionB}, while ${valueMeaning("Dynamics", "the experience responds to whatever they try")}. ` +
    `Resolution: the session closes with ${profile.payoff}.`;

  const interaction = `${capitalize(valueMeaning("Interactivity", "participants explore at their own pace"))}. In practice that means they ${actionA} — with ${valueMeaning("Motivation", "curiosity as the only incentive")}. ${pick([
    `This is the layer that decides ${columnMeaning("Interactivity")}.`,
    `Everything else in the design builds on this choice.`,
    ""
  ])}`.trim();

  const immersion = `${capitalize(valueMeaning("Embodiment", "presence comes from attention to detail rather than hardware"))}. ${capitalize(valueMeaning("Meta Control", "the world stays in the designer's hands, so every moment can be tuned"))} — which keeps the immersion feeling ${pick(["earned", "personal", "alive", "coherent"])}.`;

  const goal = `${capitalize(valueMeaning("Learning", "learning happens through doing"))}. The target: ${profile.payoff}. Emotionally, participants should leave feeling ${pick([
    "capable and curious for more",
    `personally connected to ${topic}`,
    "like insiders rather than audience members",
    "that they made something worth keeping"
  ])}.`;

  const dataUse = `${capitalize(valueMeaning("Data", "no tracking is required — the experience treats every participant the same and stays private by default"))}. ${pick([
    `In this design, ${columnMeaning("Data")}.`,
    "Whatever is collected should be visible, explained, and easy to decline.",
    ""
  ])}`.trim();

  const techFit = `${capitalize(valueMeaning("Tech", "no particular platform is required — the design works in a plain physical space"))}. ${pick([
    "The platform is a means, not the message: it should disappear behind the experience.",
    `The technology earns its place only where it makes ${topic} feel closer.`,
    "Delivery matches the design instead of driving it."
  ])}`;

  /* Design rationale: category meaning + value meaning, per dimension */
  const rationale = columnNames.map((col) => {
    const cells = groups[col];
    const first = cells[0];
    const note = first.shortDescription
      ? first.shortDescription.replace(/\.$/, "")
      : `“${first.text}” shapes ${columnMeaning(col)}`;
    return {
      col,
      colMeaning: capitalize(columnMeaning(col)),
      values: cells.map((cell) => cell.text),
      note
    };
  });

  const expansion = pick([
    `Add a second session where participants swap roles and experience ${topic} from a completely different perspective.`,
    `Extend the experience with a take-home artifact — ${pick(profile.artifacts)} that participants made or discovered, keeping ${topic} alive afterward.`,
    `Scale it up: connect multiple groups so their choices ripple into each other's version of the experience.`,
    `Layer in a facilitator character who can adjust difficulty and pacing in real time.`,
    `Swap one dimension (a different Tech or Story element, say) and run it again — comparing the two versions is a design lesson in itself.`
  ]);

  return { title, pitch, audience, flow, interaction, immersion, goal, dataUse, techFit, rationale, expansion };
}

/* Renders a stored/fresh idea object to HTML (viewer for both the
   main output and the library detail — content itself stays data) */
function renderIdeaBody(idea, kind) {
  const section = (icon, label, bodyHTML) =>
    `<h3><span class="section-icon" aria-hidden="true">${icon}</span>${label}</h3>${bodyHTML}`;

  const rationaleHTML = `<ul>${(idea.rationale || [])
    .map(
      (r) =>
        `<li><strong>${escapeHTML(r.col)}</strong> <span class="rationale-role">(${escapeHTML(r.colMeaning || "")})</span>: <em>${escapeHTML(naturalJoin(r.values))}</em> — ${escapeHTML(r.note)}.</li>`
    )
    .join("")}</ul>`;

  if (kind === "spark") {
    const sparks = (idea.rationale || []).slice(0, 3).map(
      (r) => `${capitalize(r.note)} (${r.col}: ${naturalJoin(r.values)}).`
    );
    return `
      ${section("⚡", "Pitch", `<p>${escapeHTML(idea.pitch)}</p>`)}
      ${section("💭", "Sparks", `<ul>${sparks.map((s) => `<li>${escapeHTML(s)}</li>`).join("")}</ul>`)}
      ${section("🚀", "If It Has Legs", `<p>${escapeHTML(idea.expansion)}</p>`)}
    `;
  }
  return `
    ${section("⚡", "Pitch", `<p>${escapeHTML(idea.pitch)}</p>`)}
    ${section("👥", "Audience & Role", `<p>${escapeHTML(idea.audience)}</p>`)}
    ${section("🗺️", "Experience Flow", `<p>${escapeHTML(idea.flow)}</p>`)}
    ${section("🕹️", "Interaction Model", `<p>${escapeHTML(idea.interaction)}</p>`)}
    ${section("🌊", "Immersion Strategy", `<p>${escapeHTML(idea.immersion)}</p>`)}
    ${section("🎯", "Learning & Emotional Goal", `<p>${escapeHTML(idea.goal)}</p>`)}
    ${section("📊", "Data & Personalization", `<p>${escapeHTML(idea.dataUse)}</p>`)}
    ${section("🥽", "Technology Fit", `<p>${escapeHTML(idea.techFit)}</p>`)}
    ${section("🧩", "Design Rationale", rationaleHTML)}
    ${section("🚀", "Optional Expansion", `<p>${escapeHTML(idea.expansion)}</p>`)}
  `;
}

function generateIdea(kind) {
  const topicRaw = $("topic-input").value.trim();
  const groups = buildGroups();

  if (Object.keys(groups).length === 0) {
    alert(
      mode === "inspire"
        ? "Roll a recipe first (press New Recipe)."
        : "Select at least one cell first (or press Randomize Selection)."
    );
    return;
  }

  const topic = topicRaw || "a topic of your choice";
  const profile = analyzeTopic(topic);
  const idea = composeIdea(topic, groups, profile);
  lastGeneration = { kind, topic, idea, selections: captureSelections() };

  const chips = Object.keys(groups)
    .map((col) => `<span class="chip">${escapeHTML(col)} · ${escapeHTML(groups[col].map((cell) => cell.text).join(", "))}</span>`)
    .join("");

  const output = $("idea-output");
  output.innerHTML = `
    <div class="recipe-chips">${chips}</div>
    <h2>${escapeHTML(idea.title)}</h2>
    ${renderIdeaBody(idea, kind)}
    <div class="idea-actions" id="idea-actions"></div>
  `;
  refreshSaveButton();
  output.hidden = false;
  output.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* The Save button under a generated idea (signed-in users only) */
function refreshSaveButton() {
  const holder = $("idea-actions");
  if (!holder) return;
  holder.innerHTML = "";
  if (!cloud.configured || !lastGeneration) return;
  const btn = document.createElement("button");
  btn.id = "save-experience-btn";
  btn.className = "btn btn-primary";
  btn.type = "button";
  btn.textContent = cloud.user ? "💾 Save Experience" : "💾 Sign in to save this experience";
  btn.addEventListener("click", saveCurrentExperience);
  holder.append(btn);
}

function regenerate() {
  generateIdea(lastGeneration?.kind || "full");
}

/* ------------------------------------------------------------
   18. MODE SWITCHING + WIRING EVERYTHING UP
   ------------------------------------------------------------ */
const MODE_HINTS = {
  edit: "Click any cell to edit its text; ✎ edits its description. ✎ beside a column name edits the category. Changes save automatically.",
  idea: "Click cells to choose design elements — ⓘ shows what a value means without selecting it. Lock favorites, randomize the rest, then generate.",
  inspire: "A complete experience recipe — one element per dimension. Lock favorites, reroll the rest, then generate."
};

function setMode(newMode) {
  if (newMode === "edit" && !canEdit()) {
    setMode("idea");
    return;
  }
  mode = newMode;

  $("edit-mode-btn").classList.toggle("is-active", mode === "edit");
  $("idea-mode-btn").classList.toggle("is-active", mode === "idea");
  $("inspire-mode-btn").classList.toggle("is-active", mode === "inspire");

  $("edit-tools").hidden = mode !== "edit";
  $("idea-tools").hidden = mode !== "idea";
  $("inspire-tools").hidden = mode !== "inspire";

  $("table-container").hidden = mode === "inspire";
  $("recipe-board").hidden = mode !== "inspire";

  if (mode === "edit") $("idea-output").hidden = true;

  const topicRow = $("topic-row");
  if (mode === "idea") {
    $("idea-topic-slot").append(topicRow);
    topicRow.hidden = false;
  } else if (mode === "inspire") {
    $("inspire-topic-slot").append(topicRow);
    topicRow.hidden = false;
  } else {
    topicRow.hidden = true;
  }

  $("mode-hint").textContent = MODE_HINTS[mode];

  if (mode === "inspire") {
    if (!recipe) newRecipe();
    renderRecipeBoard();
  } else {
    renderTable();
  }

  const activeView = mode === "inspire" ? $("recipe-board") : $("table-container");
  activeView.classList.remove("fade-in");
  void activeView.offsetWidth;
  activeView.classList.add("fade-in");
}

function init() {
  // Mode switcher
  $("edit-mode-btn").addEventListener("click", () => setMode("edit"));
  $("idea-mode-btn").addEventListener("click", () => setMode("idea"));
  $("inspire-mode-btn").addEventListener("click", () => setMode("inspire"));

  // Edit Mode
  $("add-row-btn").addEventListener("click", addRow);
  $("add-col-btn").addEventListener("click", addColumn);
  $("save-now-btn").addEventListener("click", () => {
    if (cloud.configured && cloud.user && isAdminUid(cloud.user.uid)) saveToCloud();
    else markChanged();
  });
  $("retry-save-btn").addEventListener("click", saveToCloud);
  $("restore-cloud-btn").addEventListener("click", restoreCloudVersion);
  $("export-btn").addEventListener("click", exportJSON);
  $("import-btn").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", (e) => {
    if (e.target.files.length > 0) importJSON(e.target.files[0]);
    e.target.value = "";
  });
  $("reset-btn").addEventListener("click", resetToDefault);

  // Design Ideas Mode
  $("gen-full-btn").addEventListener("click", () => generateIdea("full"));
  $("gen-spark-btn").addEventListener("click", () => generateIdea("spark"));
  $("regen-btn").addEventListener("click", regenerate);
  $("random-path-btn").addEventListener("click", randomPath);
  $("randomize-btn").addEventListener("click", randomizeSelection);
  $("lock-selection-btn").addEventListener("click", toggleSelectionLock);
  $("clear-btn").addEventListener("click", clearSelection);

  // Inspiration Mode
  $("inspire-full-btn").addEventListener("click", () => generateIdea("full"));
  $("inspire-spark-btn").addEventListener("click", () => generateIdea("spark"));
  $("inspire-regen-btn").addEventListener("click", regenerate);
  $("new-recipe-btn").addEventListener("click", newRecipe);

  $("topic-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") generateIdea("full");
  });

  // Description viewer + editor
  $("desc-modal-close").addEventListener("click", () => $("desc-modal").close());
  $("desc-editor-save").addEventListener("click", saveEditor);
  $("desc-editor-cancel").addEventListener("click", cancelEditor);
  $("desc-editor-close").addEventListener("click", cancelEditor);
  $("desc-editor").addEventListener("cancel", (e) => {
    if (editorIsDirty() && !confirm("Discard your changes?")) e.preventDefault();
    else editingTarget = null;
  });

  // Search
  $("search-input").addEventListener("input", renderSearchResults);
  $("search-input").addEventListener("keydown", (e) => {
    if (e.key === "Escape") { $("search-results").hidden = true; }
    if (e.key === "Enter") {
      const first = $("search-results").querySelector(".search-result");
      if (first) first.click();
    }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-bar")) $("search-results").hidden = true;
    if (!e.target.closest(".account-menu-wrap")) closeAccountDropdown();
  });

  // Authentication
  $("signin-btn").addEventListener("click", () => openAuthModal("signin"));
  $("signup-btn").addEventListener("click", () => openAuthModal("signup"));
  $("auth-submit").addEventListener("click", submitAuth);
  $("auth-cancel").addEventListener("click", () => $("auth-modal").close());
  $("auth-close").addEventListener("click", () => $("auth-modal").close());
  $("auth-to-signup").addEventListener("click", () => setAuthMode("signup"));
  $("auth-to-signin").addEventListener("click", () => setAuthMode("signin"));
  $("auth-to-reset").addEventListener("click", () => setAuthMode("reset"));
  ["auth-password", "auth-confirm"].forEach((id) =>
    $(id).addEventListener("keydown", (e) => { if (e.key === "Enter") submitAuth(); })
  );

  // Account dropdown
  $("account-btn").addEventListener("click", toggleAccountDropdown);
  $("menu-signout-btn").addEventListener("click", signOutUser);
  $("menu-library-btn").addEventListener("click", openLibrary);

  // Experience library
  $("library-close").addEventListener("click", () => $("library-modal").close());
  $("lib-back").addEventListener("click", () => {
    $("library-detail-view").hidden = true;
    $("library-list-view").hidden = false;
    renderLibraryList();
  });
  $("lib-search").addEventListener("input", renderLibraryList);
  $("lib-sort").addEventListener("change", renderLibraryList);
  $("lib-fav-only").addEventListener("change", renderLibraryList);
  $("lib-save-changes").addEventListener("click", saveLibraryChanges);
  $("lib-fav").addEventListener("click", toggleLibraryFavorite);
  $("lib-duplicate").addEventListener("click", duplicateLibraryItem);
  $("lib-delete").addEventListener("click", deleteLibraryItem);
  $("lib-load").addEventListener("click", libraryLoad);
  $("lib-regen").addEventListener("click", libraryRegenerate);

  applyAccessControl();
  setMode("idea");
  if (!cloud.configured) {
    setSyncStatus("local", "Local mode — edits save in this browser only.");
  }
  initCloud();
}

init();

/* Debug/testing handle: lets the browser console inspect state,
   e.g. TaxonomyApp.state().mode */
window.TaxonomyApp = {
  state: () => ({
    mode,
    cloud: { configured: cloud.configured, ready: cloud.ready, dirty: cloud.dirty, revision: cloud.revision, user: cloud.user ? { uid: cloud.user.uid, email: cloud.user.email, admin: isAdminUid(cloud.user.uid) } : null },
    schemaVersion: taxonomy.schemaVersion,
    columns: taxonomy.columns.map((c) => c.name),
    rows: taxonomy.rows.length,
    selected: selectedCells.size,
    locked: lockedSelection.size
  }),
  canEdit,
  isAdminUid
};
