/* ============================================================
   IXD — Immersive Experience Design Taxonomy — script.js

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
    11. Description viewer + editor dialogs
    12. Taxonomy search
    13. Edit Mode actions
    14. Selection actions + the guided workflow
    15. The experience generator (AI provider or local)
    16. Page setup + wiring everything up

   THE GUIDED WORKFLOW
   The page walks a first-time visitor through one linear process:
     Step 1  choose a topic
     Step 2  make design decisions on the taxonomy (one per column)
     Step 3  generate — the button appears only once a topic exists
             and at least MIN_DECISIONS dimensions are decided
     Step 4  review, save, or start over

   GENERATION
   generateIdea() asks the AI provider layer (ai-provider.js)
   first; if no provider is configured or the call fails, it falls
   back to the built-in local generator. The rest of the app never
   knows which one produced the idea.

   DATA MODEL (schema version 3)
   Columns AND values carry stable ids and descriptions:
     { schemaVersion: 3,
       columns: [{ id, name, shortDescription, detailedDescription, example }],
       rows: [[{ id, text, shortDescription, detailedDescription, example }, ...]] }
   ============================================================ */

import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";
import { DEFAULT_COLUMNS, VALUE_STARTERS, buildDefaultTaxonomy } from "./starter-content.js";
import { aiAvailable, generateWithAI } from "./ai-provider.js";

/* ------------------------------------------------------------
   1. CONSTANTS + ADMIN ALLOWLIST
   ------------------------------------------------------------ */
const STORAGE_KEY = "immersive-taxonomy-v3";
const LEGACY_KEYS = ["immersive-taxonomy-v2", "immersive-taxonomy-v1"];
const FIREBASE_VERSION = "10.12.2";
const CLOUD_DOC_PATH = ["taxonomy", "current"];
const SCHEMA_VERSION = 3;
const EXPERIENCE_SCHEMA_VERSION = 1;

/* Minimum number of decided dimensions before Generate appears */
const MIN_DECISIONS = 3;

/* To show the walkthrough video, paste a YouTube or Loom EMBED
   URL here, e.g. "https://www.youtube-nocookie.com/embed/VIDEOID"
   or "https://www.loom.com/embed/VIDEOID". Empty = placeholder. */
const INTRO_VIDEO_EMBED_URL = "";

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

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------
   2. APP STATE
   ------------------------------------------------------------ */
/* Sync metadata recovered from the localStorage cache. Populated
   by loadLocalTaxonomy() below — declared first to avoid TDZ. */
let cloudMetaFromCache = { revision: null, dirty: false, dirtyAt: null };

let taxonomy = loadLocalTaxonomy();  // the current framework data
let mode = "design";                 // "design" | "edit"
let selectedCells = new Set();       // selections, as "row:col" strings
let lastGeneration = null;           // { topic, idea, selections } — for variations + saving

const cloud = {
  configured: isFirebaseConfigured(),
  ready: false,
  db: null,
  auth: null,
  fns: null,
  user: null,
  revision: null,
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

function makeCell(text = "") {
  return { id: makeValueId(text), text, shortDescription: "", detailedDescription: "", example: "" };
}

function starterFor(columnId, text) {
  return (VALUE_STARTERS[columnId] || {})[text] || { short: "", detailed: "", example: "" };
}

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
   Existing ids are kept; missing descriptions are populated from
   starter content for known defaults; custom text is never
   overwritten. */
function normalizeTaxonomy(data) {
  if (isValidV3(data)) return tidyV3(data);

  if (isValidV2(data)) {
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
    for (const key of LEGACY_KEYS) {
      const legacy = localStorage.getItem(key);
      if (!legacy) continue;
      const parsed = JSON.parse(legacy);
      const tax = normalizeTaxonomy(parsed.taxonomy || parsed);
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
      if (v && typeof v === "object") {
        return {
          id: v.id || makeValueId(v.text || ""),
          text: v.text || "",
          shortDescription: v.shortDescription || "",
          detailedDescription: v.detailedDescription || "",
          example: v.example || ""
        };
      }
      return upgradeCell(typeof v === "string" ? v : "", columns[ci].id);
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
  renderTable();
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
    renderTable();
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
    cloud.dirty = false;
    saveLocal();
    setSyncStatus("local", "Saved in this browser (cloud sync not configured)");
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
   ------------------------------------------------------------ */
let authMode = "signin";   // "signin" | "signup" | "reset"

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
  if (cloud.dirty && isAdminUid(cloud.user?.uid)) await saveToCloud();
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

  $("account-area").hidden = !cloud.configured;
  if (cloud.configured) {
    const signedIn = !!cloud.user;
    $("auth-buttons").hidden = signedIn;
    $("account-menu-wrap").hidden = !signedIn;
    if (signedIn) {
      const name = cloud.user.displayName || cloud.user.email;
      $("account-name").textContent = name;
      $("account-initial").textContent = name.charAt(0).toUpperCase();
    }
  }

  if (mode === "edit" && !canEdit()) setMode("design");
  renderIdeaActions();
}

function onAuthChanged(user) {
  cloud.user = user;
  applyAccessControl();
  if (user && isAdminUid(user.uid)) {
    setSyncStatus(cloud.dirty ? "pending" : "ok",
      cloud.dirty ? "Unsaved changes — they save automatically as you edit, or press Save Now." : "All changes saved");
  }
}

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
   ------------------------------------------------------------ */
function experiencesCollection() {
  const { collection } = cloud.fns;
  return collection(cloud.db, "users", cloud.user.uid, "savedExperiences");
}

/* Snapshot of the current selections with STABLE ids */
function captureSelections() {
  const sels = [];
  selectedCells.forEach((key) => {
    const [r, c] = key.split(":").map(Number);
    const cell = taxonomy.rows[r][c];
    if (cell.text.trim() === "") return;
    sels.push({ columnId: taxonomy.columns[c].id, columnName: taxonomy.columns[c].name, valueId: cell.id, valueText: cell.text });
  });
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
      kind: "full",
      notes: "",
      favorite: false,
      selections: lastGeneration.selections,
      content: lastGeneration.idea,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    if (btn) { btn.textContent = "Saved — view in Saved Experiences"; }
  } catch (err) {
    console.error("Could not save experience:", err);
    if (btn) { btn.disabled = false; btn.textContent = "Save Experience (failed — try again)"; }
  }
}

/* ------------------------------------------------------------
   9. EXPERIENCE LIBRARY UI
   ------------------------------------------------------------ */
let libraryItems = [];
let libraryOpenItem = null;

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
      <span class="lib-item-main"><strong></strong><small></small></span>`;
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
    $("lib-save-changes").textContent = "Saved";
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

/* Maps saved selections back onto the CURRENT taxonomy */
function loadSelectionsIntoGenerator(saved) {
  setMode("design");
  selectedCells.clear();
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
  updateReadiness();
}

function libraryLoad() {
  if (!libraryOpenItem) return;
  loadSelectionsIntoGenerator(libraryOpenItem.data);
  $("library-modal").close();
  $("step-2").scrollIntoView({ behavior: "smooth" });
}

function libraryRegenerate() {
  if (!libraryOpenItem) return;
  loadSelectionsIntoGenerator(libraryOpenItem.data);
  $("library-modal").close();
  generateIdea();
}

/* ------------------------------------------------------------
   10. RENDERING — THE TAXONOMY GRID
   Each column reads as one design decision: the header names it,
   the tooltip explains it, and one value per column is the goal.
   ------------------------------------------------------------ */
function renderTable() {
  const container = $("table-container");
  container.innerHTML = "";

  const table = document.createElement("table");

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
        col.name = name.textContent.trim() || "Untitled";
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
      th.setAttribute("aria-label", `About the ${col.name} decision`);
      th.title = col.shortDescription
        ? `${col.shortDescription} Click for the full explanation.`
        : `Click to learn about ${col.name}.`;
      th.innerHTML = `<span class="th-decision">Decision ${colIndex + 1}</span><span class="th-label"></span>`;
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

  const tbody = document.createElement("tbody");

  taxonomy.rows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");

    row.forEach((cell, colIndex) => {
      const td = document.createElement("td");

      if (mode === "edit") {
        td.className = "edit-cell";
        const text = document.createElement("span");
        text.className = "cell-text";
        text.contentEditable = "true";
        text.spellcheck = false;
        text.textContent = cell.text;
        text.addEventListener("blur", () => {
          cell.text = text.textContent.trim();
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
        td.className = "selectable";
        const key = `${rowIndex}:${colIndex}`;
        if (selectedCells.has(key)) td.classList.add("is-selected");
        if (cell.shortDescription) {
          td.title = `${cell.shortDescription} Click to choose this for ${taxonomy.columns[colIndex].name}.`;
        } else if (cell.text.trim() !== "") {
          td.title = `Click to choose “${cell.text}” for ${taxonomy.columns[colIndex].name}.`;
        }

        const label = document.createElement("span");
        label.className = "cell-text";
        label.textContent = cell.text;
        td.append(label);

        if (cell.text.trim() !== "") {
          const info = document.createElement("button");
          info.className = "cell-info-btn";
          info.setAttribute("aria-label", `About ${cell.text}`);
          info.title = `What does “${cell.text}” mean?`;
          info.textContent = "i";
          info.addEventListener("click", (e) => {
            e.stopPropagation();   // info never changes the selection
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

  updateReadiness();
}

/* ------------------------------------------------------------
   11. DESCRIPTION VIEWER + EDITOR
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
    rec.text = name;
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
   12. TAXONOMY SEARCH
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
   13. EDIT MODE ACTIONS
   ------------------------------------------------------------ */
function addRow() {
  taxonomy.rows.push(taxonomy.columns.map(() => makeCell()));
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
   14. SELECTION ACTIONS + THE GUIDED WORKFLOW
   ------------------------------------------------------------ */
function toggleCell(key, td) {
  const [, c] = key.split(":").map(Number);
  if (selectedCells.has(key)) {
    selectedCells.delete(key);
    td.classList.remove("is-selected");
  } else {
    // One decision per dimension: choosing a value replaces any
    // other selection in the same column.
    [...selectedCells].forEach((k) => {
      if (Number(k.split(":")[1]) === c) selectedCells.delete(k);
    });
    td.closest("tbody").querySelectorAll(`td:nth-child(${c + 1}).is-selected`)
      .forEach((el) => el.classList.remove("is-selected"));
    selectedCells.add(key);
    td.classList.add("is-selected");
  }
  updateReadiness();
}

function rowsWithValue(colIndex) {
  const candidates = [];
  taxonomy.rows.forEach((row, rowIndex) => {
    if (row[colIndex].text.trim() !== "") candidates.push(rowIndex);
  });
  return candidates;
}

/* Count of columns that have a selection */
function decidedColumns() {
  const cols = new Set();
  selectedCells.forEach((k) => cols.add(Number(k.split(":")[1])));
  return cols.size;
}

/* Keeps every decision the user made and randomly fills the rest —
   the result is always a complete recipe (one value per column). */
function completeRandomly() {
  taxonomy.columns.forEach((_, colIndex) => {
    const alreadyDecided = [...selectedCells].some((k) => Number(k.split(":")[1]) === colIndex);
    if (alreadyDecided) return;
    const candidates = rowsWithValue(colIndex);
    if (candidates.length > 0) selectedCells.add(`${pick(candidates)}:${colIndex}`);
  });
  renderTable();
}

function clearSelection() {
  selectedCells.clear();
  renderTable();
}

/* Step 3 gatekeeper: Generate appears only when the workflow is
   ready — a topic plus at least MIN_DECISIONS decided dimensions. */
function updateReadiness() {
  const topicOk = $("topic-input").value.trim().length > 0;
  const decided = decidedColumns();
  const totalCols = taxonomy.columns.length;
  const selOk = decided >= Math.min(MIN_DECISIONS, totalCols);

  // Step 2 status line
  $("selection-summary").textContent =
    decided === 0
      ? "No decisions yet — click one value in any column, or let the framework decide for you."
      : `${decided} of ${totalCols} dimensions decided.`;

  // Step 3 readiness + button
  const missing = [];
  if (!topicOk) missing.push("add a topic in Step 1");
  if (!selOk) missing.push(`decide at least ${Math.min(MIN_DECISIONS, totalCols)} dimensions in Step 2 (or use “Complete My Selections Randomly”)`);

  const ready = missing.length === 0;
  $("generate-btn").hidden = !ready;
  $("readiness").textContent = ready
    ? `Ready — topic set and ${decided} of ${totalCols} dimensions decided.`
    : `To generate: ${missing.join(", then ")}.`;
  $("readiness").classList.toggle("is-ready", ready);
}

function startOver() {
  selectedCells.clear();
  lastGeneration = null;
  $("topic-input").value = "";
  $("step-4").hidden = true;
  $("idea-output").innerHTML = "";
  renderTable();
  $("step-1").scrollIntoView({ behavior: "smooth" });
  $("topic-input").focus();
}

/* ------------------------------------------------------------
   15. THE EXPERIENCE GENERATOR
   Tries the configured AI provider first (ai-provider.js); falls
   back to the built-in local generator automatically. The output
   shape is identical either way.
   ------------------------------------------------------------ */

/* Generic fallback role per default dimension */
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

/* Chosen cells grouped by column name */
function buildGroups() {
  const groups = {};
  selectedCells.forEach((key) => {
    const [r, c] = key.split(":").map(Number);
    const cell = taxonomy.rows[r][c];
    if (cell.text.trim() === "") return;
    const colName = taxonomy.columns[c].name;
    if (!groups[colName]) groups[colName] = [];
    groups[colName].push(cell);
  });
  return groups;
}

/* Rich selection details for the AI provider */
function buildAIContext(topic) {
  const selections = [];
  selectedCells.forEach((key) => {
    const [r, c] = key.split(":").map(Number);
    const cell = taxonomy.rows[r][c];
    if (cell.text.trim() === "") return;
    const col = taxonomy.columns[c];
    selections.push({
      column: col.name,
      columnDescription: col.shortDescription,
      value: cell.text,
      valueDescription: cell.shortDescription,
      valueExample: cell.example
    });
  });
  return { topic, selections };
}

function proseCells(cells = []) {
  return cells.filter((cell) => cell.text.toLowerCase() !== "none");
}

/* --- Topic analysis for the local generator --- */
const DOMAIN_PROFILES = [
  {
    keywords: ["cook", "food", "recipe", "kitchen", "bak", "cuisine", "chef", "meal", "taste", "dining"],
    personas: ["a first-time home cook", "a curious teenager who lives on takeout", "a retiree finally learning the family recipes"],
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
    personas: ["a high-school student who plays but has never designed", "a teacher who wants to understand what their students love", "an aspiring indie developer"],
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
    personas: ["an adult with one true story they've never written down", "a college student drowning in essay structure rules", "a journaler ready to write for readers"],
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
    personas: ["a middle-school student who thinks history is a list of dates", "a museum visitor with twenty minutes", "a lifelong documentary watcher who wants to go deeper"],
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
    personas: ["a student who decided years ago they're 'not a science person'", "a curious adult who never got past the textbook", "a young tinkerer who learns with their hands"],
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
    personas: ["an adult who stopped making art in fourth grade", "a technically skilled student searching for a personal style", "a fan who wants to understand what they love"],
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
  personas: ["a curious newcomer to the subject", "a student meeting the topic for the first time", "an enthusiast ready to go deeper"],
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

/* The local generator: interprets the descriptions of the chosen
   values and their categories, anchored to a concrete persona so
   the result reads as a user story (who/where/why/what). */
function composeIdea(topic, groups, profile) {
  const columnNames = Object.keys(groups);
  const columnByName = Object.fromEntries(taxonomy.columns.map((c) => [c.name, c]));

  const allCells = proseCells(columnNames.flatMap((c) => groups[c]));
  const signature = allCells.length > 0 ? pick(allCells).text : "Immersive";
  const persona = pick(profile.personas);

  const cellOf = (col) => proseCells(groups[col] || [])[0] || null;

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
    `${capitalize(persona)} steps into ${profile.place} to experience ${topic} firsthand — an experience where ${valueMeaning("Interactivity", "they explore freely")}.`,
    `An immersive take on ${topic}: ${persona} enters ${profile.place}, and ${naturalJoin(pickSome(profile.artifacts, 2))} become things to handle, not read about.`,
    `${capitalize(profile.place)} becomes the classroom — ${persona} experiences ${topic} in a world where ${valueMeaning("Interactivity", "they set their own pace")}.`
  ]);

  const audience = `Designed for ${persona} — and anyone like them. ${capitalize(valueMeaning("Co-Participation", "the experience works solo or in small groups"))}. ${capitalize(valueMeaning("Embodiment", "participants are present through their own natural perspective"))}.`;

  const storyCell = cellOf("Story");
  const flow =
    `Beginning: ${persona} arrives in ${profile.place} with a reason to be there — ${pick(["a question that needs answering", "a task only they can finish", "an invitation that felt impossible to refuse"])}${storyCell ? `, and ${valueMeaning("Story", "")}` : ""}. ` +
    `Middle: they ${actionA}, then ${actionB}, while ${valueMeaning("Dynamics", "the experience responds to whatever they try")}. ` +
    `End: the session resolves with ${profile.payoff} — and a clear moment that marks the experience as complete.`;

  const interaction = `${capitalize(valueMeaning("Interactivity", "participants explore at their own pace"))}. In practice: they ${actionA} — with ${valueMeaning("Motivation", "curiosity as the only incentive")}.`;

  const immersion = `${capitalize(valueMeaning("Embodiment", "presence comes from attention to detail rather than hardware"))}. ${capitalize(valueMeaning("Meta Control", "the world stays in the designer's hands, so every moment can be tuned"))} — which keeps the immersion feeling ${pick(["earned", "personal", "alive", "coherent"])}.`;

  const goal = `${capitalize(valueMeaning("Learning", "learning happens through doing"))}. The target: ${profile.payoff}. Emotionally, ${persona.replace(/^an? /, "the ")} should leave feeling ${pick([
    "capable and curious for more",
    `personally connected to ${topic}`,
    "like an insider rather than an audience member",
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

/* Renders an idea object as a structured report (no emojis, no raw
   dumps): pitch lead, a grid of section cards, rationale, and an
   expansion callout. Also used by the library detail view. */
function renderIdeaBody(idea, kind) {
  const card = (label, body) =>
    `<div class="report-card"><h3>${label}</h3><p>${escapeHTML(body)}</p></div>`;

  const rationaleHTML = `<ul>${(idea.rationale || [])
    .map(
      (r) =>
        `<li><strong>${escapeHTML(r.col)}</strong>${r.colMeaning ? ` <span class="rationale-role">(${escapeHTML(r.colMeaning)})</span>` : ""}: <em>${escapeHTML(naturalJoin(r.values))}</em> — ${escapeHTML(r.note)}.</li>`
    )
    .join("")}</ul>`;

  /* Legacy "spark" items saved before this redesign still render */
  if (kind === "spark") {
    return `
      <p class="report-pitch">${escapeHTML(idea.pitch)}</p>
      <div class="report-card"><h3>Sparks</h3>${rationaleHTML}</div>
      <div class="report-card report-expansion"><h3>If It Has Legs</h3><p>${escapeHTML(idea.expansion)}</p></div>
    `;
  }

  return `
    <p class="report-pitch">${escapeHTML(idea.pitch)}</p>
    <div class="report-grid">
      ${card("Audience & Role", idea.audience)}
      ${card("Experience Flow", idea.flow)}
      ${card("Interaction Model", idea.interaction)}
      ${card("Immersion Strategy", idea.immersion)}
      ${card("Learning & Emotional Goal", idea.goal)}
      ${card("Data & Personalization", idea.dataUse)}
      ${card("Technology Fit", idea.techFit)}
    </div>
    <div class="report-card report-rationale"><h3>Design Rationale</h3>${rationaleHTML}</div>
    <div class="report-card report-expansion"><h3>Optional Expansion</h3><p>${escapeHTML(idea.expansion)}</p></div>
  `;
}

/* Basic shape check on whatever the AI returned */
function isUsableIdea(idea) {
  return idea && typeof idea.title === "string" && typeof idea.pitch === "string" && Array.isArray(idea.rationale);
}

async function generateIdea() {
  const topic = $("topic-input").value.trim();
  const groups = buildGroups();
  if (!topic || Object.keys(groups).length === 0) {
    updateReadiness();
    $("step-3").scrollIntoView({ behavior: "smooth" });
    return;
  }

  const btn = $("generate-btn");
  btn.disabled = true;
  btn.textContent = "Generating…";

  let idea = null;

  // 1) Try the configured AI provider (ai-provider.js)…
  if (aiAvailable()) {
    try {
      idea = await generateWithAI(buildAIContext(topic));
      if (!isUsableIdea(idea)) idea = null;
    } catch (err) {
      console.warn("AI generation failed, using the local generator.", err);
      idea = null;
    }
  }

  // 2) …fall back to the built-in local generator.
  if (!idea) {
    idea = composeIdea(topic, groups, analyzeTopic(topic));
  }

  lastGeneration = { topic, idea, selections: captureSelections() };

  const chips = Object.keys(groups)
    .map((col) => `<span class="chip">${escapeHTML(col)} · ${escapeHTML(groups[col].map((cell) => cell.text).join(", "))}</span>`)
    .join("");

  $("idea-output").innerHTML = `
    <div class="recipe-chips">${chips}</div>
    <h2 class="report-title">${escapeHTML(idea.title)}</h2>
    ${renderIdeaBody(idea, "full")}
  `;
  renderIdeaActions();

  btn.disabled = false;
  btn.textContent = "Generate Experience";
  $("step-4").hidden = false;
  $("step-4").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* Step 4 actions: Save · New Variation · Start Over */
function renderIdeaActions() {
  const holder = $("idea-actions");
  if (!holder) return;
  holder.innerHTML = "";
  if (!lastGeneration) return;

  if (cloud.configured) {
    const save = document.createElement("button");
    save.id = "save-experience-btn";
    save.className = "btn btn-primary";
    save.type = "button";
    save.textContent = cloud.user ? "Save Experience" : "Sign in to save this experience";
    save.addEventListener("click", saveCurrentExperience);
    holder.append(save);
  }

  const again = document.createElement("button");
  again.className = "btn btn-brand";
  again.type = "button";
  again.title = "Same topic and decisions, a fresh interpretation";
  again.textContent = "Generate New Variation";
  again.addEventListener("click", generateIdea);
  holder.append(again);

  const over = document.createElement("button");
  over.className = "btn btn-quiet";
  over.type = "button";
  over.title = "Clear the topic, selections, and result to begin again";
  over.textContent = "Start Over";
  over.addEventListener("click", startOver);
  holder.append(over);
}

/* ------------------------------------------------------------
   16. PAGE SETUP + WIRING EVERYTHING UP
   ------------------------------------------------------------ */
function setMode(newMode) {
  if (newMode === "edit" && !canEdit()) newMode = "design";
  mode = newMode;
  const editing = mode === "edit";

  $("edit-mode-btn").textContent = editing ? "Done Editing" : "Edit Taxonomy";
  $("edit-tools").hidden = !editing;

  // While editing, the guided steps step aside — only the grid matters
  $("step-1").hidden = editing;
  $("step-3").hidden = editing;
  if (editing) $("step-4").hidden = true;

  renderTable();
}

/* Renders the walkthrough video iframe once a URL is configured */
function setupVideo() {
  if (!INTRO_VIDEO_EMBED_URL) return;   // keep the placeholder
  const frame = $("video-frame");
  frame.innerHTML = "";
  const iframe = document.createElement("iframe");
  iframe.src = INTRO_VIDEO_EMBED_URL;
  iframe.title = "Taxonomy walkthrough video";
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
  iframe.allowFullscreen = true;
  frame.append(iframe);
}

function init() {
  // Header
  $("edit-mode-btn").addEventListener("click", () => setMode(mode === "edit" ? "design" : "edit"));

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

  // Guided workflow
  $("topic-input").addEventListener("input", updateReadiness);
  $("topic-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !$("generate-btn").hidden) generateIdea();
  });
  $("complete-random-btn").addEventListener("click", completeRandomly);
  $("clear-btn").addEventListener("click", clearSelection);
  $("generate-btn").addEventListener("click", generateIdea);

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

  // Footer + video
  $("footer-copyright").textContent = `© ${new Date().getFullYear()} Ruscella Immersive. All rights reserved.`;
  setupVideo();

  applyAccessControl();
  setMode("design");
  if (!cloud.configured) {
    setSyncStatus("local", "Local mode — edits save in this browser only.");
  }
  initCloud();
}

init();

/* Debug/testing handle for the browser console */
window.TaxonomyApp = {
  state: () => ({
    mode,
    cloud: { configured: cloud.configured, ready: cloud.ready, dirty: cloud.dirty, revision: cloud.revision, user: cloud.user ? { uid: cloud.user.uid, email: cloud.user.email, admin: isAdminUid(cloud.user.uid) } : null },
    schemaVersion: taxonomy.schemaVersion,
    columns: taxonomy.columns.map((c) => c.name),
    rows: taxonomy.rows.length,
    selected: selectedCells.size,
    decided: decidedColumns()
  }),
  canEdit,
  isAdminUid
};
