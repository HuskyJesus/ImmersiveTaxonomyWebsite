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
    10. Rendering — the taxonomy table
    11. Description viewer + editor dialogs
    12. Taxonomy search
    13. Edit Mode actions
    14. Selections, locks, and randomization
    15. The experience generator (AI provider or local)
    16. Page setup + wiring everything up

   THE WORKSPACE MODEL
   One flexible design workspace — not a wizard. Users freely
   enter a topic, select one element per dimension in the table,
   lock elements directly on the table, randomize the unlocked
   dimensions, generate, review, and save, in any order. Nothing
   is gated; missing pieces produce helpful prompts instead of
   locked controls.

   ELEMENT-LEVEL LOCKING
   Each dimension can be locked via a small lock control that
   appears on its selected element. Locked dimensions keep their
   selection through every randomization. Deliberately selecting
   a different element in a locked dimension moves the selection
   and keeps the dimension locked (the lock follows the user's
   explicit choice).

   DATA MODEL (schema version 3)
   Columns AND elements carry stable ids and descriptions, plus
   manuscript-content fields (design question, participant role,
   cautions, source chapter, …) that render only when filled:
     { schemaVersion: 3,
       columns: [{ id, name, shortDescription, detailedDescription,
                   example, subtitle, designQuestion, whyItMatters,
                   progression, source }],
       rows: [[{ id, text, shortDescription, detailedDescription,
                 example, participantRole, designerResponsibility,
                 useCases, cautions, source }, ...]] }
   Row index = element number (Element 0 at the top).

   The taxonomy is based on the immersive experience design
   taxonomy developed by JJ Ruscella in "Immersion: The New Art
   Form — A Handbook for the Immersive Experience Designer."
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
const EXPERIENCE_SCHEMA_VERSION = 2;   // v2 = the design-brief report shape

/* To show the walkthrough video, paste a YouTube or Loom EMBED
   URL here. Empty = the placeholder panel stays. */
const INTRO_VIDEO_EMBED_URL = "";

/* The ONLY administrators. Creating an account never grants admin
   access — this list (mirrored in firestore.rules, which is the
   real enforcement point) is the single source of truth. */
const ADMIN_UIDS = [
  "jtOD9eMDeETUXSALKFaQy0sCDiK2",   // Father
  "qN6weHvgweP171ka6dLtrOIU4203"    // Site maintainer
];

function isAdminUid(uid) {
  return ADMIN_UIDS.includes(uid);
}

const $ = (id) => document.getElementById(id);

/* Small inline SVG icons (no emojis anywhere) */
const ICON_LOCK_CLOSED =
  '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12 6h-.5V4.5A3.5 3.5 0 0 0 8 1zm2 5H6V4.5a2 2 0 1 1 4 0V6z"/></svg>';
const ICON_LOCK_OPEN =
  '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M11.5 1A3.5 3.5 0 0 0 8 4.5V6H4a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 14h8a1.5 1.5 0 0 0 1.5-1.5v-5A1.5 1.5 0 0 0 12 6H9.5V4.5a2 2 0 1 1 4 0V5h1.5v-.5A3.5 3.5 0 0 0 11.5 1z"/></svg>';
const ICON_INFO =
  '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true"><path d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM7.25 6.75h1.5v4.5h-1.5v-4.5ZM8 5.75a.9.9 0 1 1 0-1.8.9.9 0 0 1 0 1.8Z"/></svg>';

/* The manuscript-content fields carried by columns and elements */
const COLUMN_EXTRA_FIELDS = [
  ["subtitle", "Chapter framing subtitle"],
  ["designQuestion", "Central design question"],
  ["whyItMatters", "Why it matters"],
  ["progression", "Five-element progression"],
  ["source", "Source chapter"]
];
const VALUE_EXTRA_FIELDS = [
  ["participantRole", "Participant role"],
  ["designerResponsibility", "Designer responsibility"],
  ["useCases", "Appropriate use cases"],
  ["cautions", "Cautions"],
  ["source", "Source chapter and section"],
  ["keywords", "Search keywords"]
];

const LEGACY_COLUMN_NAMES = {
  Motivation: "Gamification",
  Tech: "Immersive Technology",
  Learning: "Didactic Capacity"
};

const LEGACY_VALUE_NAMES = {
  "Single Person": "Single Player",
  Predetermined: "Pre-Determined",
  Observer: "Watcher",
  "First Person POV": "First-Person POV",
  "Movement Control": "Movement",
  "Human to Human": "Human-to-Human Interaction",
  "One on One": "One-on-One",
  MMO: "MMO (Massively Multiplayer Online)",
  "Pre-created": "Pre-Created Story",
  "Choose your own": "Choose Your Own",
  "Adaptive Story": "Interactive Story",
  "Conversational Reality": "Convo-Reality",
  "Adjustible POV": "Adjustable POV",
  "Basic Mechanics": "Instruction",
  Challenge: "External Process",
  AR: "Augmented Reality (AR)",
  VR: "Virtual Reality (VR)",
  XR: "XR (Extended/Cross Reality)",
  "2D": "360° Media",
  Journey: "The Chosen Path",
  Character: "The Mirror Self",
  "World Editor": "The World Builder",
  "World Builder": "The World Master",
  Sythensis: "Synthesis",
  "In-session": "In-Game",
  Personalized: "Personalization",
  Biometric: "Biometrics"
};

const LEGACY_VALUE_NAMES_BY_COLUMN = {
  motivation: {
    None: "Ungamified"
  },
  story: {
    None: "No Story"
  },
  "meta-control": {
    None: "The Passive Watcher",
    Journey: "The Chosen Path",
    Character: "The Mirror Self"
  },
  tech: {
    none: "None",
    AR: "Augmented Reality (AR)",
    VR: "Virtual Reality (VR)",
    XR: "XR (Extended/Cross Reality)",
    "2D": "360° Media"
  }
};

function reorderKnownDefaultColumns(data) {
  const defaults = buildDefaultTaxonomy();
  const order = defaults.columns.map((c) => c.id);
  const indexById = Object.fromEntries(data.columns.map((c, i) => [c.id, i]));
  if (!order.every((id) => indexById[id] !== undefined)) return data;

  const remaining = data.columns
    .map((c, i) => ({ id: c.id, index: i }))
    .filter((entry) => !order.includes(entry.id))
    .map((entry) => entry.index);
  const newOrder = [...order.map((id) => indexById[id]), ...remaining];

  data.columns = newOrder.map((oldIndex) => data.columns[oldIndex]);
  data.rows = data.rows.map((row) => newOrder.map((oldIndex) => row[oldIndex]));
  return data;
}

/* ------------------------------------------------------------
   2. APP STATE
   ------------------------------------------------------------ */
let cloudMetaFromCache = { revision: null, dirty: false, dirtyAt: null };

let taxonomy = loadLocalTaxonomy();  // the current framework data
let mode = "design";                 // "design" | "edit"
let selectedCells = new Set();       // one "row:col" per selected dimension
let lockedDims = new Set();          // column indexes whose selection is locked
let lastGeneration = null;           // { topic, idea, selections }

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
  saving: false,
  savePending: false
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

function blankColumnExtras() {
  return {
    ...Object.fromEntries(COLUMN_EXTRA_FIELDS.map(([k]) => [k, ""])),
    sourceType: "custom",
    hasCustomEdits: true,
    lastEditedAt: "",
    lastEditedBy: ""
  };
}

function blankValueExtras() {
  return {
    ...Object.fromEntries(VALUE_EXTRA_FIELDS.map(([k]) => [k, ""])),
    sourceType: "custom",
    hasCustomEdits: true,
    lastEditedAt: "",
    lastEditedBy: ""
  };
}

function makeCell(text = "") {
  return { id: makeValueId(text), text, shortDescription: "", detailedDescription: "", example: "", ...blankValueExtras() };
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
    example: starter.example,
    ...blankValueExtras()
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

/* Fills in optional fields that older data might lack — this is
   how pre-existing cloud/local data gains the new manuscript
   fields without losing anything. */
function tidyV3(data) {
  data = reorderKnownDefaultColumns(data);
  const defaults = buildDefaultTaxonomy();
  const defaultsByColumnId = Object.fromEntries(defaults.columns.map((c, i) => [c.id, { col: c, index: i }]));

  data.columns.forEach((c) => {
    c.name = LEGACY_COLUMN_NAMES[c.name] || c.name;
    const def = defaultsByColumnId[c.id]?.col;
    if (def && (!c.hasCustomEdits || c.sourceType === "manuscript-derived")) {
      Object.assign(c, structuredClone(def), { id: c.id });
    }
    c.shortDescription = c.shortDescription || "";
    c.detailedDescription = c.detailedDescription || "";
    c.example = c.example || "";
    COLUMN_EXTRA_FIELDS.forEach(([k]) => { c[k] = c[k] || ""; });
    c.sourceType = c.sourceType || "custom";
    c.hasCustomEdits = !!c.hasCustomEdits;
    c.lastEditedAt = c.lastEditedAt || "";
    c.lastEditedBy = c.lastEditedBy || "";
  });
  data.rows.forEach((row, rowIndex) =>
    row.forEach((cell, cIndex) => {
      const colId = data.columns[cIndex]?.id;
      cell.text = LEGACY_VALUE_NAMES_BY_COLUMN[colId]?.[cell.text] || LEGACY_VALUE_NAMES[cell.text] || cell.text;
      const defMeta = defaultsByColumnId[data.columns[cIndex]?.id];
      const defCell = defMeta && rowIndex < defaults.rows.length ? defaults.rows[rowIndex][defMeta.index] : null;
      if (defCell && (!cell.hasCustomEdits || cell.sourceType === "manuscript-derived")) {
        Object.assign(cell, structuredClone(defCell), { id: cell.id });
      }
      cell.shortDescription = cell.shortDescription || "";
      cell.detailedDescription = cell.detailedDescription || "";
      cell.example = cell.example || "";
      VALUE_EXTRA_FIELDS.forEach(([k]) => { cell[k] = cell[k] || ""; });
      cell.sourceType = cell.sourceType || "custom";
      cell.hasCustomEdits = !!cell.hasCustomEdits;
      cell.lastEditedAt = cell.lastEditedAt || "";
      cell.lastEditedBy = cell.lastEditedBy || "";
    })
  );
  return data;
}

/* MIGRATION: accepts v3, v2, or v1 shapes and returns v3.
   Existing ids are kept; custom text is never overwritten. */
function normalizeTaxonomy(data) {
  if (isValidV3(data)) return tidyV3(data);

  if (isValidV2(data)) {
    return tidyV3({
      schemaVersion: 3,
      columns: data.columns.map((c) => ({ ...c })),
      rows: data.rows.map((row) => row.map((text, c) => upgradeCell(text, data.columns[c].id)))
    });
  }

  if (isValidV1(data)) {
    const byName = Object.fromEntries(DEFAULT_COLUMNS.map((c) => [c.name, c]));
    const columns = data.columns.map((name) => {
      const preset = byName[name];
      return preset
        ? structuredClone(preset)
        : { id: makeColumnId(name), name, shortDescription: "", detailedDescription: "", example: "" };
    });
    return tidyV3({
      schemaVersion: 3,
      columns,
      rows: data.rows.map((row) => row.map((text, c) => upgradeCell(text, columns[c].id)))
    });
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
      ...col,                                              // includes manuscript fields
      values: taxonomy.rows.map((row) => ({ ...row[c] }))
    })),
    rowCount: taxonomy.rows.length
  };
}

function deserializeFromCloud(data) {
  if (!data || !Array.isArray(data.columns) || data.columns.length === 0) return null;
  const rowCount = data.rowCount ?? Math.max(...data.columns.map((c) => (c.values || []).length), 0);
  const columns = data.columns.map((c) => {
    const { values, ...rest } = c;
    return {
      id: rest.id || makeColumnId(rest.name || "column"),
      name: rest.name || "Untitled",
      ...rest
    };
  });
  const rows = Array.from({ length: rowCount }, (_, r) =>
    data.columns.map((c, ci) => {
      const v = (c.values || [])[r];
      if (v && typeof v === "object") {
        return { ...v, id: v.id || makeValueId(v.text || ""), text: v.text || "" };
      }
      return upgradeCell(typeof v === "string" ? v : "", columns[ci].id);
    })
  );
  const tax = { schemaVersion: 3, columns, rows };
  return isValidV3(tax) ? tidyV3(tax) : null;
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
  if (!cloud.configured || !cloud.user) return;
  if (cloud.saving) {
    // A save is already in flight — remember to run again so edits
    // made during the upload are not silently dropped.
    cloud.savePending = true;
    return;
  }
  cloud.saving = true;
  setSyncStatus("info", "Saving…");
  try {
    const { doc, setDoc, serverTimestamp, getDoc } = cloud.fns;
    const ref = doc(cloud.db, ...CLOUD_DOC_PATH);

    // Conflict guard: if another admin saved a newer version since
    // this browser last loaded it, do not silently overwrite it.
    const existing = await getDoc(ref);
    const remoteRevision = existing.exists() ? existing.data()?.updatedAt?.toMillis?.() ?? null : null;
    if (remoteRevision && cloud.revision && remoteRevision > cloud.revision) {
      const overwrite = confirm(
        "The cloud taxonomy was updated by another administrator after this browser loaded it " +
        `(cloud version: ${new Date(remoteRevision).toLocaleString()}).\n\n` +
        "OK = overwrite it with the version on this screen\n" +
        "Cancel = keep your edits unsaved here (use Restore Cloud Version to review theirs first)"
      );
      if (!overwrite) {
        cloud.saving = false;
        cloud.savePending = false;
        setSyncStatus("pending", "Not saved — a newer cloud version exists. Your edits are kept in this browser.");
        $("retry-save-btn").hidden = false;
        return;
      }
    }

    await setDoc(ref, {
      ...serializeForCloud(),
      updatedAt: serverTimestamp(),
      updatedBy: cloud.user.uid
    });
    const snap = await getDoc(ref);
    cloud.revision = snap.data()?.updatedAt?.toMillis?.() ?? Date.now();
    // Edits made while this save was uploading still need saving —
    // only report "all saved" when nothing is pending.
    if (!cloud.savePending) {
      cloud.dirty = false;
    }
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
  if (cloud.savePending) {
    cloud.savePending = false;
    saveToCloud();
  }
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
let authMode = "signin";

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
    const { doc, setDoc, getDoc, serverTimestamp } = cloud.fns;
    const ref = doc(cloud.db, "users", user.uid);
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
  // Re-render only the actions row — an unsaved generated result
  // must survive signing in or out.
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
      <span class="lib-item-fav">${it.data.favorite ? "Favorite" : ""}</span>
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
  $("lib-fav").textContent = d.favorite ? "Unfavorite" : "Favorite";
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
    $("lib-fav").textContent = next ? "Unfavorite" : "Favorite";
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

function loadSelectionsIntoGenerator(saved) {
  setMode("design");
  selectedCells.clear();
  lockedDims.clear();
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
  $("workspace").scrollIntoView({ behavior: "smooth" });
}

function libraryRegenerate() {
  if (!libraryOpenItem) return;
  loadSelectionsIntoGenerator(libraryOpenItem.data);
  $("library-modal").close();
  generateIdea();
}

/* ------------------------------------------------------------
   10. RENDERING — THE TAXONOMY TABLE
   Headers: dimension name + optional subtitle + info affordance.
   Public cells show only the element name plus info/lock controls.
   The three controls never interfere: click selects, "i" informs,
   the padlock locks.
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
      del.title = `Delete dimension “${col.name}”`;
      del.textContent = "×";
      del.addEventListener("click", () => deleteColumn(colIndex));

      wrap.append(name, edit, del);
      th.append(wrap);
    } else {
      th.className = "th-info";
      th.tabIndex = 0;
      th.setAttribute("role", "button");
      th.setAttribute("aria-label", `About the ${col.name} dimension`);
      th.title = col.shortDescription
        ? `${col.shortDescription} Click for the full explanation.`
        : `Click to learn about ${col.name}.`;
      const sub = col.subtitle || col.shortDescription || "";
      th.innerHTML = `<span class="th-label"></span><span class="th-sub"></span>`;
      th.querySelector(".th-label").textContent = col.name;
      th.querySelector(".th-sub").textContent = sub;
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
        const num = document.createElement("span");
        num.className = "cell-num";
        num.textContent = `E${rowIndex}`;

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
        edit.title = `Edit the description of “${cell.text || "this element"}”`;
        edit.textContent = "✎";
        edit.addEventListener("click", (e) => {
          e.stopPropagation();
          openEditor({ type: "value", c: colIndex, r: rowIndex });
        });

        td.append(num, text, edit);
      } else {
        td.className = "selectable";
        const key = `${rowIndex}:${colIndex}`;
        const isSelected = selectedCells.has(key);
        const isLocked = isSelected && lockedDims.has(colIndex);
        if (isSelected) td.classList.add("is-selected");
        if (isLocked) td.classList.add("is-locked");
        if (cell.text.trim() !== "") {
          td.title = cell.shortDescription
            ? `${cell.shortDescription} Click to choose this for ${taxonomy.columns[colIndex].name}.`
            : `Click to choose “${cell.text}” for ${taxonomy.columns[colIndex].name}.`;
        }

        const label = document.createElement("span");
        label.className = "cell-text";
        label.textContent = cell.text;

        const top = document.createElement("span");
        top.className = "cell-top";
        top.append(label);

        if (cell.text.trim() !== "") {
          const info = document.createElement("button");
          info.className = "cell-info-btn";
          info.setAttribute("aria-label", `About ${cell.text}`);
          info.title = `What does “${cell.text}” mean?`;
          info.innerHTML = ICON_INFO;
          info.addEventListener("click", (e) => {
            e.stopPropagation();   // info never selects or locks
            openInfoModal({ type: "value", c: colIndex, r: rowIndex });
          });
          top.append(info);

          if (isSelected) {
            const lock = document.createElement("button");
            lock.className = "cell-lock-btn" + (isLocked ? " is-on" : "");
            lock.setAttribute("aria-label", isLocked ? `Unlock ${taxonomy.columns[colIndex].name}` : `Lock ${taxonomy.columns[colIndex].name}`);
            lock.title = isLocked
              ? "Locked: randomization keeps this element. Click to unlock. Selecting a different element moves the lock with your choice."
              : "Lock this element so randomization keeps it.";
            lock.innerHTML = isLocked ? ICON_LOCK_CLOSED : ICON_LOCK_OPEN;
            lock.addEventListener("click", (e) => {
              e.stopPropagation();   // the lock never opens info or changes selection
              toggleDimLock(colIndex);
            });
            top.append(lock);
          }
        }

        td.append(top);

        td.addEventListener("click", () => toggleCell(key, colIndex));
      }

      tr.append(td);
    });

    if (mode === "edit") {
      const tools = document.createElement("td");
      tools.className = "row-tools";
      const del = document.createElement("button");
      del.className = "delete-btn";
      del.title = "Delete this element row";
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
  const decided = decidedColumns().size;
  const total = taxonomy.columns.length;
  const locked = lockedDims.size;
  let text = decided === 0
    ? "Nothing selected yet — click an element in any dimension, or use the randomize controls to explore."
    : `${decided} of ${total} dimensions selected.`;
  if (locked > 0) text += ` ${locked} locked — randomization keeps locked elements.`;
  $("selection-summary").textContent = text;
}

/* ------------------------------------------------------------
   11. DESCRIPTION VIEWER + EDITOR
   target = { type: "column"|"value", c, r? }
   ------------------------------------------------------------ */
function targetRecord(target) {
  return target.type === "column"
    ? taxonomy.columns[target.c]
    : taxonomy.rows[target.r][target.c];
}

let infoTarget = null;   // remembered so "Select This Element" works

function openInfoModal(target) {
  infoTarget = target;
  const rec = targetRecord(target);
  const isValue = target.type === "value";

  $("desc-modal-context").hidden = false;
  $("desc-modal-context").textContent = isValue
    ? taxonomy.columns[target.c].name
    : (rec.subtitle || "Design dimension");
  $("desc-modal-title").textContent = isValue ? rec.text : rec.name;
  $("desc-modal-short").textContent =
    rec.shortDescription || "No description has been written for this yet.";

  // Build the detail sections — manuscript fields render only when filled
  const sections = [];
  const add = (label, value) => { if (value) sections.push([label, value]); };
  add("In depth", rec.detailedDescription);
  if (isValue) {
    add("Participant role", rec.participantRole);
    add("Designer responsibility", rec.designerResponsibility);
    add("Appropriate use cases", rec.useCases);
    add("Cautions", rec.cautions);
    add("Example", rec.example);
    add("Source", rec.source);
  } else {
    add("Central design question", rec.designQuestion);
    add("Why it matters", rec.whyItMatters);
    add("Five-element progression", rec.progression);
    add("Example", rec.example);
    add("Source", rec.source);
  }
  $("desc-modal-sections").innerHTML = sections
    .map(([label, value]) => `<h3>${escapeHTML(label)}</h3><p>${escapeHTML(value)}</p>`)
    .join("");

  // "Select This Element" — only for elements, only outside edit mode
  const selectBtn = $("desc-modal-select");
  selectBtn.hidden = !(isValue && mode === "design");
  $("desc-modal").showModal();
}

function selectFromInfoModal() {
  if (!infoTarget || infoTarget.type !== "value") return;
  selectElement(infoTarget.r, infoTarget.c);
  $("desc-modal").close();
  renderTable();
}

let editingTarget = null;

function extrasFor(type) {
  return type === "column" ? COLUMN_EXTRA_FIELDS : VALUE_EXTRA_FIELDS;
}

function openEditor(target) {
  editingTarget = target;
  const rec = targetRecord(target);
  const isValue = target.type === "value";
  $("desc-editor-title").textContent = isValue
    ? `Edit “${rec.text}” in “${taxonomy.columns[target.c].name}”`
    : `Edit “${rec.name}”`;
  $("edit-cat-name-label").textContent = isValue ? "Element name" : "Dimension name";
  $("edit-cat-name").value = isValue ? rec.text : rec.name;
  $("edit-cat-short").value = rec.shortDescription;
  $("edit-cat-detail").value = rec.detailedDescription;
  $("edit-cat-example").value = rec.example;

  extrasFor(target.type).forEach(([key, label], i) => {
    $(`edit-extra-label-${i + 1}`).textContent = label;
    $(`edit-extra-${i + 1}`).value = rec[key] || "";
  });

  // Compare/restore only exists for items that have a manuscript default
  const def = defaultRecordFor(target);
  $("desc-editor-default").hidden = !def;
  $("editor-default-hint").textContent = "";
  $("desc-editor").showModal();
}

/* Finds the default (starter) record matching this target by
   stable column id + row position, for compare/restore. */
function defaultRecordFor(target) {
  const defaults = buildDefaultTaxonomy();
  if (target.type === "column") {
    return defaults.columns.find((c) => c.id === taxonomy.columns[target.c].id) || null;
  }
  const colId = taxonomy.columns[target.c].id;
  const defColIndex = defaults.columns.findIndex((c) => c.id === colId);
  if (defColIndex < 0 || target.r >= defaults.rows.length) return null;
  return defaults.rows[target.r][defColIndex];
}

/* First press shows the default text for comparison; second press
   fills the editor fields with it (still requires Save to apply). */
let defaultShown = false;

function compareOrRestoreDefault() {
  const def = defaultRecordFor(editingTarget);
  if (!def) return;
  const isValue = editingTarget.type === "value";
  if (!defaultShown) {
    $("editor-default-hint").textContent =
      `Default: “${isValue ? def.text : def.name}” — ${def.shortDescription || "(no short description)"} ` +
      `Press the button again to fill the editor with these defaults (Save still required).`;
    defaultShown = true;
    return;
  }
  $("edit-cat-name").value = isValue ? def.text : def.name;
  $("edit-cat-short").value = def.shortDescription || "";
  $("edit-cat-detail").value = def.detailedDescription || "";
  $("edit-cat-example").value = def.example || "";
  extrasFor(editingTarget.type).forEach(([key], i) => {
    $(`edit-extra-${i + 1}`).value = def[key] || "";
  });
  $("editor-default-hint").textContent = "Defaults loaded into the editor — press Save to apply, Cancel to discard.";
  defaultShown = false;
}

function editorIsDirty() {
  if (!editingTarget) return false;
  const rec = targetRecord(editingTarget);
  const currentName = editingTarget.type === "value" ? rec.text : rec.name;
  if ($("edit-cat-name").value.trim() !== currentName) return true;
  if ($("edit-cat-short").value.trim() !== rec.shortDescription) return true;
  if ($("edit-cat-detail").value.trim() !== rec.detailedDescription) return true;
  if ($("edit-cat-example").value.trim() !== rec.example) return true;
  return extrasFor(editingTarget.type).some(
    ([key], i) => $(`edit-extra-${i + 1}`).value.trim() !== (rec[key] || "")
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
  extrasFor(editingTarget.type).forEach(([key], i) => {
    rec[key] = $(`edit-extra-${i + 1}`).value.trim();
  });
  rec.sourceType = rec.sourceType || "manuscript-derived";
  rec.hasCustomEdits = true;
  rec.lastEditedAt = new Date().toISOString();
  rec.lastEditedBy = cloud.user?.uid || "local";
  $("desc-editor").close();
  editingTarget = null;
  defaultShown = false;
  markChanged();
  renderTable();
}

function cancelEditor() {
  if (editorIsDirty() && !confirm("Discard your changes?")) return;
  $("desc-editor").close();
  editingTarget = null;
  defaultShown = false;
}

/* ------------------------------------------------------------
   12. TAXONOMY SEARCH
   Searches names, subtitles, all descriptions, and examples.
   Opening a result shows its description; the dialog offers
   "Select This Element" — search never changes the profile
   by itself.
   ------------------------------------------------------------ */
function columnHaystack(col) {
  return [col.name, col.subtitle, col.shortDescription, col.detailedDescription, col.example,
    col.designQuestion, col.whyItMatters, col.progression].join(" ").toLowerCase();
}

function cellHaystack(cell) {
  return [cell.text, cell.shortDescription, cell.detailedDescription, cell.example,
    cell.participantRole, cell.designerResponsibility, cell.useCases, cell.cautions].join(" ").toLowerCase();
}

function searchTaxonomy(term) {
  const t = term.toLowerCase();
  const results = [];
  taxonomy.columns.forEach((col, c) => {
    if (columnHaystack(col).includes(t)) {
      results.push({ type: "column", c, label: col.name, context: "Dimension", snippet: col.shortDescription });
    }
  });
  taxonomy.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (cell.text.trim() === "") return;
      if (cellHaystack(cell).includes(t)) {
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
    example: "",
    ...blankColumnExtras()
  });
  taxonomy.rows.forEach((row) => row.push(makeCell()));
  afterStructureChange();
}

function deleteRow(rowIndex) {
  if (taxonomy.rows.length <= 1) {
    alert("The framework needs at least one element row.");
    return;
  }
  if (!confirm("Delete this element row? Its elements and their descriptions will be removed.")) return;
  taxonomy.rows.splice(rowIndex, 1);
  afterStructureChange();
}

function deleteColumn(colIndex) {
  if (taxonomy.columns.length <= 1) {
    alert("The framework needs at least one dimension.");
    return;
  }
  const col = taxonomy.columns[colIndex];
  if (!confirm(`Delete the dimension “${col.name}”? Its description and all of its elements' descriptions will be removed.`)) return;
  taxonomy.columns.splice(colIndex, 1);
  taxonomy.rows.forEach((row) => row.splice(colIndex, 1));
  afterStructureChange();
}

function resetSelections() {
  selectedCells.clear();
  lockedDims.clear();
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
        `Dimensions (${tax.columns.length}): ${tax.columns.map((c) => c.name).join(", ")}\n` +
        `Element rows: ${tax.rows.length}\n\n` +
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
  if (!confirm("Restore the manuscript-derived default taxonomy? This replaces the current framework (descriptions included).")) return;
  taxonomy = buildDefaultTaxonomy();
  afterStructureChange();
}

/* ------------------------------------------------------------
   14. SELECTIONS, LOCKS, AND RANDOMIZATION
   One selected element per dimension. Locks live on the table:
   the selected element of a dimension carries the lock control.
   ------------------------------------------------------------ */
function decidedColumns() {
  const cols = new Set();
  selectedCells.forEach((k) => cols.add(Number(k.split(":")[1])));
  return cols;
}

/* Selects (row, col), replacing any other selection in that
   dimension. If the dimension is locked, the lock follows the
   user's deliberate new choice. */
function selectElement(rowIndex, colIndex) {
  [...selectedCells].forEach((k) => {
    if (Number(k.split(":")[1]) === colIndex) selectedCells.delete(k);
  });
  selectedCells.add(`${rowIndex}:${colIndex}`);
}

function toggleCell(key, colIndex) {
  if (selectedCells.has(key)) {
    selectedCells.delete(key);
    lockedDims.delete(colIndex);   // deselecting removes the dimension's lock
  } else {
    selectElement(Number(key.split(":")[0]), colIndex);
  }
  renderTable();
}

function toggleDimLock(colIndex) {
  if (lockedDims.has(colIndex)) {
    lockedDims.delete(colIndex);
  } else {
    lockedDims.add(colIndex);
  }
  renderTable();
}

function clearLocks() {
  lockedDims.clear();
  renderTable();
}

function clearSelection() {
  selectedCells.clear();
  lockedDims.clear();
  renderTable();
}

function rowsWithValue(colIndex) {
  const candidates = [];
  taxonomy.rows.forEach((row, rowIndex) => {
    if (row[colIndex].text.trim() !== "") candidates.push(rowIndex);
  });
  return candidates;
}

/* Randomize Unlocked Elements: keeps the topic and every locked
   element; selects one random element in each unlocked dimension.
   Does NOT generate. */
function randomizeUnlocked() {
  taxonomy.columns.forEach((_, colIndex) => {
    if (lockedDims.has(colIndex)) return;   // locked: keep as is
    const candidates = rowsWithValue(colIndex);
    if (candidates.length === 0) return;
    selectElement(pick(candidates), colIndex);
  });
  renderTable();
}

/* Generate From Random Path: randomizes every unlocked dimension
   (exactly one element per dimension), then generates. If there is
   no topic, the randomized selections are kept and the user is
   asked to enter one. */
function randomPath() {
  randomizeUnlocked();
  const topic = $("topic-input").value.trim();
  if (!topic) {
    showTopicHint("Your randomized starting point is ready — add a topic above and press Generate Experience. Remember: a random profile is a starting point to revise, not a finished design.");
    return;
  }
  generateIdea({ note: "random-path" });
}

function showTopicHint(message) {
  const hint = $("topic-hint");
  hint.textContent = message;
  hint.hidden = false;
  $("topic-input").focus();
  $("topic-input").scrollIntoView({ behavior: "smooth", block: "center" });
}

function hideTopicHint() {
  $("topic-hint").hidden = true;
}

/* ------------------------------------------------------------
   15. THE EXPERIENCE GENERATOR
   Tries the configured AI provider first; falls back to the local
   generator. Output: a design brief whose sections respect the
   selected elements (Passive means no required choices, No Story
   means no narrative arc, None under Immersive Technology means
   no AR/VR, and so on) — the semantics come from each element's
   own description text.
   ------------------------------------------------------------ */
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

/* Chosen cell per column id (stable across renames) */
function selectionByColumnId() {
  const map = {};
  selectedCells.forEach((key) => {
    const [r, c] = key.split(":").map(Number);
    const cell = taxonomy.rows[r][c];
    if (cell.text.trim() === "") return;
    map[taxonomy.columns[c].id] = { cell, col: taxonomy.columns[c], row: r };
  });
  return map;
}

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
      columnDetail: col.detailedDescription,
      designQuestion: col.designQuestion,
      whyItMatters: col.whyItMatters,
      elementNumber: r,
      value: cell.text,
      valueDescription: cell.shortDescription,
      valueDetail: cell.detailedDescription,
      participantRole: cell.participantRole,
      designerResponsibility: cell.designerResponsibility,
      cautions: cell.cautions,
      valueExample: cell.example,
      source: cell.source
    });
  });
  return { topic, selections };
}

/* --- Topic analysis for the local generator --- */
const DOMAIN_PROFILES = [
  {
    keywords: ["cook", "food", "recipe", "kitchen", "bak", "cuisine", "chef", "meal", "taste", "dining"],
    personas: ["a first-time home cook", "a curious teenager who lives on takeout", "a retiree finally learning the family recipes"],
    guides: ["a working chef", "a food historian", "the restaurant's veteran line cook"],
    artifacts: ["ingredients", "recipes", "technique", "flavor pairings", "food traditions"],
    actions: [
      "prep and combine real ingredients",
      "balance flavors against the clock",
      "reverse-engineer a dish by taste",
      "plate and present a finished dish",
      "trace a recipe back through its food culture"
    ],
    place: "a working kitchen",
    payoff: "a dish they can actually make — and the confidence to improvise the next one"
  },
  {
    keywords: ["game", "gaming", "esports", "arcade", "video"],
    personas: ["a high-school student who plays but has never designed", "a teacher who wants to understand what their students love", "an aspiring indie developer"],
    guides: ["a game designer", "a playtest coordinator", "a speedrunner who knows every seam"],
    artifacts: ["mechanics", "levels", "progression systems", "genres", "player strategies"],
    actions: [
      "learn a system by playing it",
      "take a level apart to see why it works",
      "prototype a mechanic and watch players break it",
      "iterate on a strategy against real opponents",
      "trace how a genre evolved one design decision at a time"
    ],
    place: "a living game world",
    payoff: "a designer's eye — they stop just playing games and start reading them"
  },
  {
    keywords: ["writ", "essay", "memoir", "non-fiction", "nonfiction", "journal", "poet", "author"],
    personas: ["an adult with one true story they've never written down", "a college student drowning in essay structure rules", "a journaler ready to write for readers"],
    guides: ["a working editor", "a memoirist", "a patient writing mentor"],
    artifacts: ["voice", "memory", "structure", "evidence", "perspective", "revision"],
    actions: [
      "gather raw material from real life",
      "test the same true story in two different structures",
      "revise a passage until the voice is unmistakably theirs",
      "weigh evidence against memory",
      "read their work aloud and feel where it lands"
    ],
    place: "a writer's room of drafts, sources, and voices",
    payoff: "a piece of true writing with a voice of its own"
  },
  {
    keywords: ["history", "war", "civil", "ancient", "egypt", "rome", "greek", "revolution", "medieval", "century", "historical", "nurse", "onboard"],
    personas: ["a middle-school student who thinks history is a list of dates", "a museum visitor with twenty minutes", "a lifelong documentary watcher who wants to go deeper"],
    guides: ["a museum educator", "an archivist", "a costumed interpreter who never breaks character"],
    artifacts: ["primary sources", "competing perspectives", "maps and geography", "pivotal decisions", "consequences"],
    actions: [
      "examine primary sources firsthand",
      "stand inside a pivotal decision as it's being made",
      "hear the same event told from opposing sides",
      "trace causes forward into consequences",
      "walk the actual geography where it happened"
    ],
    place: "a reconstructed historical moment",
    payoff: "history felt as lived experience rather than memorized dates"
  },
  {
    keywords: ["science", "physic", "chem", "bio", "space", "astro", "math", "engineer", "nature", "climate", "marine", "conservation", "ocean"],
    personas: ["a student who decided years ago they're 'not a science person'", "a curious adult who never got past the textbook", "a young tinkerer who learns with their hands"],
    guides: ["a field researcher", "a lab technician who has seen everything fail", "a park ranger"],
    artifacts: ["experiments", "models", "data", "phenomena", "predictions"],
    actions: [
      "run an experiment and watch it disagree with them",
      "build a model, then break it on purpose",
      "predict first, observe second",
      "scale the invisible up to human size",
      "follow one measurement all the way to a conclusion"
    ],
    place: "a laboratory with no safety limits",
    payoff: "an intuition for how the system really behaves"
  },
  {
    keywords: ["music", "art", "paint", "danc", "theat", "film", "design", "photo", "sculpt", "conflict", "resolution", "negotiat"],
    personas: ["an adult who stopped making art in fourth grade", "a technically skilled student searching for a personal style", "a fan who wants to understand what they love"],
    guides: ["a working artist", "a rehearsal director", "a mediator with decades of rooms behind them"],
    artifacts: ["techniques", "styles", "materials", "compositions", "influences"],
    actions: [
      "study a master's choices from the inside",
      "experiment with materials until something surprises them",
      "compose, perform, and get an honest response",
      "remix an established style into their own",
      "watch one work change meaning in different contexts"
    ],
    place: "an open studio",
    payoff: "a made thing that carries their own choices in it"
  }
];

const GENERIC_PROFILE = {
  keywords: [],
  personas: ["a curious newcomer to the subject", "a student meeting the topic for the first time", "an enthusiast ready to go deeper"],
  guides: ["a knowledgeable facilitator", "a mentor who has lived the subject"],
  artifacts: ["core ideas", "real examples", "open questions", "turning points"],
  actions: [
    "explore the territory at their own pace",
    "test their understanding against real cases",
    "piece together the big picture from fragments",
    "apply what they find to a problem that matters"
  ],
  place: "a world built from the topic itself",
  payoff: "an understanding they built themselves"
};

function analyzeTopic(topic) {
  const t = topic.toLowerCase();
  for (const profile of DOMAIN_PROFILES) {
    if (profile.keywords.some((k) => t.includes(k))) return profile;
  }
  return GENERIC_PROFILE;
}

/* The local generator: a design brief grounded in a concrete
   persona, honoring each selected element's own description. */
function composeIdea(topic, profile) {
  const sel = selectionByColumnId();
  const columnByName = {};
  taxonomy.columns.forEach((c) => (columnByName[c.name] = c));

  // meaning(id): the selected element's short description as a clause
  const meaning = (id, fallback) => {
    const s = sel[id];
    if (!s) return fallback;
    return s.cell.shortDescription ? asClause(s.cell.shortDescription) : `the design uses “${s.cell.text}”`;
  };
  const has = (id) => !!sel[id];
  const nameOf = (id) => sel[id]?.cell.text || "";

  const persona = pick(profile.personas);
  const guide = pick(profile.guides);
  const [actionA, actionB] = pickSome(profile.actions, 2);
  const allNames = Object.values(sel).map((s) => s.cell.text).filter((t) => !/^(none|no story|ungamified|anonymous|the passive watcher)$/i.test(t));
  const signature = allNames.length > 0 ? pick(allNames) : "Immersive";

  const title = pick([
    `${capitalize(topic)}: The ${signature} Experience`,
    `Inside ${capitalize(topic)}`,
    `${capitalize(topic)}, ${pick(["Reimagined", "Up Close", "From the Inside"])}`,
    `The ${signature} ${capitalize(topic)} Project`
  ]);

  const concept = `${capitalize(persona)} steps into ${profile.place} to experience ${topic} firsthand, guided by ${guide}.`;

  const audience = `Designed for ${persona} — and anyone like them. No prior background in ${topic} is assumed.`;

  const roles = has("co-participation")
    ? `${capitalize(meaning("co-participation", ""))}. The participant plays ${pick(["an active investigator", "a hands-on apprentice", "an invited insider"])}, with ${guide} in a supporting role.`
    : `The participant plays ${pick(["an active investigator", "a hands-on apprentice", "an invited insider"])}, supported by ${guide}.`;

  const setting = `${capitalize(profile.place)}${has("story") ? ` — where ${meaning("story", "")}` : ""}. Every prop, sound, and sightline exists to make ${topic} feel present rather than described.`;

  const purpose = `To give ${persona.replace(/^an? /, "")} a direct, personal encounter with ${topic} — ${profile.payoff}.`;

  const beginning = `${capitalize(persona)} arrives with a reason to be there: ${pick([
    "a question that needs answering",
    "a task only they can finish",
    "an invitation that felt impossible to refuse"
  ])}. ${guide ? capitalize(guide) + " sets the frame without over-explaining it." : ""}`;

  const middle = `They ${actionA}, then ${actionB}, while ${meaning("dynamics", "the experience proceeds at its own designed pace")}. ${has("interactivity") ? capitalize(meaning("interactivity", "")) + "." : ""}`;

  const end = `The session resolves with ${profile.payoff} — and a clear closing moment that marks the experience as complete rather than simply over.`;

  const interactions = `${capitalize(meaning("interactivity", "participants take the experience in at their own pace"))}. ${has("motivation") ? capitalize(meaning("motivation", "")) + "." : ""}`;

  const social = capitalize(meaning("co-participation", "the experience works for one participant at a time, with no team required")) + ".";

  const story = capitalize(meaning("story", "no narrative is imposed — meaning comes from the activity itself")) + ".";

  const agency = `${capitalize(meaning("dynamics", "the sequence of events is fixed by design"))}. ${capitalize(meaning("meta-control", "participants act within the world as given — they do not reshape it"))}.`;

  const gamification = capitalize(meaning("motivation", "no game structures are used — no points, badges, or scores; the subject carries the engagement")) + ".";

  const technology = `${capitalize(meaning("tech", "no particular technology is required — the design works in a fully physical space"))}. Technology amplifies the immersion here; it does not create it.`;

  const didactic = `${capitalize(meaning("learning", "learning happens through doing"))}. The intended takeaway: ${profile.payoff}.`;

  const dataUse = capitalize(meaning("data", "nothing about participants is tracked or stored — every session starts and ends clean")) + ".";

  const facilitator = nameOf("co-participation") === "Secondary Perspective"
    ? `A second layer of participants observes and influences from outside the primary action — ${meaning("co-participation", "")}.`
    : `${capitalize(guide)} facilitates: framing the arrival, reading the room, and adjusting pacing without breaking the world.`;

  const rationale = Object.values(sel).map(({ cell, col, row }) => ({
    col: col.name,
    colMeaning: col.shortDescription ? capitalize(asClause(col.shortDescription)) : "",
    values: [cell.text],
    note: cell.shortDescription ? cell.shortDescription.replace(/\.$/, "") : `a deliberate choice for ${col.name}`
  }));

  const riskPool = [];
  Object.values(sel).forEach(({ cell, col }) => {
    if (cell.cautions) riskPool.push(`${col.name} (${cell.text}): ${cell.cautions}`);
  });
  if (/^(vr|xr)$/i.test(nameOf("tech"))) riskPool.push("Hardware throughput: headset-based delivery limits how many participants can pass through per hour — plan sessions and staffing around it.");
  if (/free will|conversational/i.test(nameOf("dynamics"))) riskPool.push("Open dynamics demand robust response coverage: what happens when a participant tries something the design never anticipated?");
  if (/ungamified/i.test(nameOf("motivation"))) riskPool.push("With no game structures, engagement rests entirely on the strength of the content — is the subject matter genuinely compelling at every beat?");
  if (/anonymous/i.test(nameOf("data"))) riskPool.push("With no participant data, the experience cannot adapt across visits — is a single-session arc enough for the learning goal?");
  riskPool.push(`Does every dimension choice here serve the purpose of the experience, or is any of them riding on novelty? Revisit the weakest one.`);
  const risks = pickSome(riskPool, Math.min(2, riskPool.length)).join(" ");

  return {
    title, concept, audience, roles, setting, purpose,
    beginning, middle, end,
    interactions, social, story, agency, gamification, technology, didactic, dataUse, facilitator,
    rationale, risks
  };
}

/* Renders an idea object as a design brief. Handles the current
   shape and both legacy shapes saved by earlier versions. */
function renderIdeaBody(idea, kind) {
  const card = (label, body) =>
    body ? `<div class="report-card"><h3>${escapeHTML(label)}</h3><p>${escapeHTML(body)}</p></div>` : "";

  const rationaleHTML = `<ul>${(idea.rationale || [])
    .map(
      (r) =>
        `<li><strong>${escapeHTML(r.col)}</strong>${r.colMeaning ? ` <span class="rationale-role">(${escapeHTML(r.colMeaning)})</span>` : ""}: <em>${escapeHTML(naturalJoin(r.values))}</em> — ${escapeHTML(r.note)}.</li>`
    )
    .join("")}</ul>`;

  /* Legacy shapes from earlier versions still render in the library */
  if (idea.pitch !== undefined) {
    if (kind === "spark") {
      return `
        <p class="report-pitch">${escapeHTML(idea.pitch)}</p>
        <div class="report-card"><h3>Sparks</h3>${rationaleHTML}</div>
        <div class="report-card report-expansion"><h3>If It Has Legs</h3><p>${escapeHTML(idea.expansion)}</p></div>`;
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
      <div class="report-card report-expansion"><h3>Optional Expansion</h3><p>${escapeHTML(idea.expansion)}</p></div>`;
  }

  /* Current design-brief shape */
  return `
    <p class="report-pitch">${escapeHTML(idea.concept)}</p>
    <div class="report-grid">
      ${card("Intended Audience", idea.audience)}
      ${card("Participant Roles", idea.roles)}
      ${card("Setting", idea.setting)}
      ${card("Purpose", idea.purpose)}
    </div>
    <h3 class="report-group-label">The Arc</h3>
    <div class="report-grid">
      ${card("Beginning", idea.beginning)}
      ${card("Middle", idea.middle)}
      ${card("End", idea.end)}
    </div>
    <h3 class="report-group-label">Design Decisions in Action</h3>
    <div class="report-grid">
      ${card("Core Interactions", idea.interactions)}
      ${card("Social Structure", idea.social)}
      ${card("Story Structure", idea.story)}
      ${card("Consequences & Agency", idea.agency)}
      ${card("Gamification", idea.gamification)}
      ${card("Technology", idea.technology)}
      ${card("Learning & Didactic Intent", idea.didactic)}
      ${card("Data Use", idea.dataUse)}
      ${card("Facilitator & Secondary Perspective", idea.facilitator)}
    </div>
    <div class="report-card report-rationale"><h3>Taxonomy Rationale</h3>${rationaleHTML}</div>
    <div class="report-card report-expansion"><h3>Design Risks & Open Questions</h3><p>${escapeHTML(idea.risks)}</p></div>
  `;
}

function isUsableIdea(idea) {
  return idea && typeof idea.title === "string" &&
    (typeof idea.concept === "string" || typeof idea.pitch === "string") &&
    Array.isArray(idea.rationale);
}

async function generateIdea() {
  const topic = $("topic-input").value.trim();
  if (!topic) {
    showTopicHint("Enter a topic first — the subject, lesson, story, or problem you want to turn into an experience.");
    return;
  }
  hideTopicHint();

  // Unselected dimensions? Offer to randomize them — never a hard gate.
  const decided = decidedColumns();
  if (decided.size === 0) {
    if (confirm("No elements are selected yet. Randomize one element in every dimension as a starting point?\n\n(OK = randomize and generate · Cancel = go back and choose)")) {
      randomizeUnlocked();
    } else {
      return;
    }
  } else if (decided.size < taxonomy.columns.length) {
    const names = taxonomy.columns.filter((_, c) => !decided.has(c)).map((c) => c.name).join(", ");
    if (confirm(`Unselected dimensions: ${names}.\n\nOK = randomize those and generate · Cancel = generate using only your selected dimensions`)) {
      randomizeUnlocked();
    }
  }

  const btn = $("generate-btn");
  btn.disabled = true;
  btn.textContent = "Generating…";

  let idea = null;
  if (aiAvailable()) {
    try {
      idea = await generateWithAI(buildAIContext(topic));
      if (!isUsableIdea(idea)) idea = null;
    } catch (err) {
      console.warn("AI generation failed, using the local generator.", err);
      idea = null;
    }
  }
  if (!idea) {
    idea = composeIdea(topic, analyzeTopic(topic));
  }

  lastGeneration = { topic, idea, selections: captureSelections() };

  const sel = selectionByColumnId();
  const chips = Object.values(sel)
    .map(({ cell, col }) => `<span class="chip">${escapeHTML(col.name)} · ${escapeHTML(cell.text)}</span>`)
    .join("");

  $("idea-output").innerHTML = `
    <div class="recipe-chips">${chips}</div>
    <h2 class="report-title">${escapeHTML(idea.title)}</h2>
    ${renderIdeaBody(idea, "full")}
  `;
  renderIdeaActions();

  btn.disabled = false;
  btn.textContent = "Generate Experience";
  $("result-section").hidden = false;
  $("result-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

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
  again.title = "Same topic and selections, a fresh interpretation";
  again.textContent = "Regenerate";
  again.addEventListener("click", generateIdea);
  holder.append(again);

  const over = document.createElement("button");
  over.className = "btn btn-quiet";
  over.type = "button";
  over.title = "Clear the topic, selections, locks, and result";
  over.textContent = "Start Over";
  over.addEventListener("click", startOver);
  holder.append(over);
}

function startOver() {
  selectedCells.clear();
  lockedDims.clear();
  lastGeneration = null;
  $("topic-input").value = "";
  hideTopicHint();
  $("result-section").hidden = true;
  $("idea-output").innerHTML = "";
  renderTable();
  $("workspace").scrollIntoView({ behavior: "smooth" });
  $("topic-input").focus();
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
  if (editing) $("result-section").hidden = true;

  renderTable();
}

function setupVideo() {
  if (!INTRO_VIDEO_EMBED_URL) return;
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

  // Workspace controls
  $("topic-input").addEventListener("input", hideTopicHint);
  $("topic-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") generateIdea();
  });
  $("generate-btn").addEventListener("click", generateIdea);
  $("random-path-btn").addEventListener("click", randomPath);
  $("regen-btn").addEventListener("click", () => {
    if (lastGeneration) generateIdea();
    else showTopicHint("Generate an experience first — Regenerate then produces a fresh variation of it.");
  });
  $("randomize-btn").addEventListener("click", randomizeUnlocked);
  $("clear-btn").addEventListener("click", clearSelection);
  $("clear-locks-btn").addEventListener("click", clearLocks);

  // Description viewer + editor
  $("desc-modal-close").addEventListener("click", () => $("desc-modal").close());
  $("desc-modal-select").addEventListener("click", selectFromInfoModal);
  $("desc-editor-save").addEventListener("click", saveEditor);
  $("desc-editor-cancel").addEventListener("click", cancelEditor);
  $("desc-editor-close").addEventListener("click", cancelEditor);
  $("desc-editor-default").addEventListener("click", compareOrRestoreDefault);
  $("desc-editor").addEventListener("cancel", (e) => {
    if (editorIsDirty() && !confirm("Discard your changes?")) e.preventDefault();
    else { editingTarget = null; defaultShown = false; }
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
    lockedDims: [...lockedDims]
  }),
  canEdit,
  isAdminUid
};
