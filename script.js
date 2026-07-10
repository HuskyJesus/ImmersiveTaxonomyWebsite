/* ============================================================
   Immersive Experience Design Taxonomy — script.js

   How this file is organized:
     1. Default taxonomy data (columns now carry descriptions)
     2. App state
     3. Local persistence (localStorage cache + v1 migration)
     4. Cloud sync (Firebase Auth + Firestore, optional)
     5. Access control (public view vs. admin edit)
     6. Rendering — the taxonomy grid
     7. Rendering — the recipe board (Inspiration mode)
     8. Category description modal + editor dialogs
     9. Edit Mode actions (rows, columns, import/export, reset)
    10. Design Ideas Mode actions (select, lock, randomize)
    11. Inspiration Mode actions (new recipe, reroll, lock)
    12. The idea generator — knowledge maps
    13. The idea generator — topic analysis
    14. The idea generator — composing and rendering ideas
    15. Mode switching + wiring everything up

   DATA MODEL (schema version 2)
   Each column is an object with a STABLE id — renaming a column
   never breaks its description or anything keyed to it:
     {
       schemaVersion: 2,
       columns: [{ id, name, shortDescription, detailedDescription, example }],
       rows: [["Passive", ...], ...]    // one cell per column, per row
     }

   CLOUD SAVING is optional. Until firebase-config.js is filled in,
   the site runs exactly like a local-only app (edits stay in this
   browser). Once configured:
     - everyone can view the published taxonomy (Firestore read)
     - only signed-in admins listed in firestore.rules can write
   ============================================================ */

import { firebaseConfig, isFirebaseConfigured } from "./firebase-config.js";

/* ------------------------------------------------------------
   1. DEFAULT TAXONOMY
   The descriptions below are EDITABLE STARTER CONTENT — clear,
   professional placeholders, not final academic definitions.
   Edit them in the site (Edit Mode → ✎ beside a column) or here.
   ------------------------------------------------------------ */
const DEFAULT_COLUMNS = [
  {
    id: "interactivity",
    name: "Interactivity",
    shortDescription: "How much, and in what way, participants can act within the experience.",
    detailedDescription: "Interactivity ranges from purely watching to solving problems, moving physically, or engaging other people. It sets the baseline for what a participant is invited — or required — to do, and every other design choice tends to build on it.",
    example: "A museum exhibit is Passive when visitors only view it; it becomes Problem Solving when visitors must decode a cipher to open the next room."
  },
  {
    id: "embodiment",
    name: "Embodiment",
    shortDescription: "How present participants feel inside the experience — where their body and point of view sit.",
    detailedDescription: "Embodiment describes the participant's relationship to the world: watching it from outside, standing invisibly within it, seeing through their own eyes, having their movement mirrored, or being met by real humans. Stronger embodiment usually means stronger immersion — and higher design stakes.",
    example: "The same battlefield scene feels documentary-like from a Detached view, and overwhelming in First Person POV as musket fire passes overhead."
  },
  {
    id: "co-participation",
    name: "Co-Participation",
    shortDescription: "The social structure — how many people share the experience and how they relate.",
    detailedDescription: "Co-Participation covers everything from a solo session to intimate one-on-one encounters, small groups, massive shared worlds, and asymmetric setups where some people act while others watch and influence. It determines whether meaning comes from private reflection or shared negotiation.",
    example: "An escape room is a Group experience; the same puzzles reworked as a play-by-post with an audience voting on hints becomes Secondary Perspective."
  },
  {
    id: "story",
    name: "Story",
    shortDescription: "How narrative is structured — from none at all to a story that adapts around the participant.",
    detailedDescription: "Story sets the narrative spine: an experience can rely on pure activity with no plot, imply a story through its setting, deliver a fixed authored narrative, branch on participant choices, or continuously reshape itself. More narrative flexibility generally trades authorial control for participant ownership.",
    example: "A cooking class has no story; a themed dinner where each course reveals a chapter of a chef's journey uses a Pre-created narrative."
  },
  {
    id: "dynamics",
    name: "Dynamics",
    shortDescription: "How much agency participants have and how the system responds to what they do.",
    detailedDescription: "Dynamics describes the rules of cause and effect: events may run on rails, pause at decision points, respond to free action, negotiate through open dialogue, or let participants shift their point of view on the system itself. It is the dimension participants feel most directly, moment to moment.",
    example: "A haunted house is Predetermined — everyone gets the same scares. An improv-driven version where actors build on whatever guests do runs on Free Will."
  },
  {
    id: "motivation",
    name: "Motivation",
    shortDescription: "Why participants keep going — the engagement engine of the experience.",
    detailedDescription: "Motivation covers the incentives that sustain attention: pure curiosity, inherently satisfying mechanics, difficulty and mastery, steady reinforcement, or explicit reward systems. Matching the motivation style to the audience is often the difference between an experience people finish and one they abandon.",
    example: "A language-learning quest can rely on Challenge (beat the conversation boss) or a Reward System (streaks, badges, and unlockable dialects)."
  },
  {
    id: "meta-control",
    name: "Meta Control",
    shortDescription: "Whether participants can shape the world and its rules, not just act inside them.",
    detailedDescription: "Meta Control ranges from playing the world exactly as given, to steering your own journey, defining your character, editing parts of the world, or building the world itself. High meta control turns participants into co-designers — powerful for ownership, demanding for the design.",
    example: "In a historical simulation, students who can redraw supply lines and re-run the campaign are using World Editor control rather than following a fixed scenario."
  },
  {
    id: "learning",
    name: "Learning",
    shortDescription: "How knowledge is delivered and absorbed within the experience.",
    detailedDescription: "Learning may arrive as small foundational pieces, direct explicit instruction, implicit absorption through doing, structured recall of prior knowledge, or synthesis where participants combine ideas into something new. Immersive design shines when the learning style is woven into the activity instead of bolted on.",
    example: "A chemistry escape room teaches Implicitly — players internalize reaction rules because the door will not open otherwise."
  },
  {
    id: "data",
    name: "Data",
    shortDescription: "What the experience knows about participants — personalization and tracking.",
    detailedDescription: "Data ranges from fully anonymous sessions, to knowing names and identities, tracking behavior within a session, maintaining persistent personal profiles, or responding to live biometric signals. More data enables deeper personalization and raises the bar for trust and transparency.",
    example: "A meditation space that softens its soundscape when a wearable reports rising heart rate is using Biometric data."
  },
  {
    id: "tech",
    name: "Tech",
    shortDescription: "The delivery platform — from no technology at all to fully mixed physical-digital systems.",
    detailedDescription: "Tech sets the platform assumptions: analog and physical, flat screens, augmented overlays on the real world, fully simulated virtual spaces, or mixed systems that span physical and digital. The strongest designs choose the lightest technology that still delivers the intended presence.",
    example: "A city history walk works on 2D (a map app), in AR (ghost buildings overlaid on real streets), or with no tech at all (props, actors, and good writing)."
  }
];

const DEFAULT_TAXONOMY = {
  schemaVersion: 2,
  columns: DEFAULT_COLUMNS,
  rows: [
    ["Passive", "Detached", "Single Person", "None", "Predetermined", "None", "None", "Elemental", "Anonymous", "none"],
    ["Interactive", "Observer", "One on One", "Setting", "Choice", "Basic Mechanics", "Journey", "Explicit", "Identity", "2D"],
    ["Problem Solving", "First Person POV", "Group", "Pre-created", "Free Will", "Challenge", "Character", "Implicit", "In-session", "AR"],
    ["Physicalized", "Movement Control", "MMO", "Choose your own", "Conversational Reality", "Reinforcement", "World Editor", "Recall", "Personalized", "VR"],
    ["Interpersonal", "Human to Human", "Secondary Perspective", "Adaptive Story", "Adjustible POV", "Reward System", "World Builder", "Sythensis", "Biometric", "XR"]
  ]
};

/* localStorage keys (v1 was the pre-descriptions format) */
const STORAGE_KEY = "immersive-taxonomy-v2";
const LEGACY_STORAGE_KEY = "immersive-taxonomy-v1";

/* ------------------------------------------------------------
   2. APP STATE
   ------------------------------------------------------------ */
/* Sync metadata recovered from the localStorage cache (whether the
   cached taxonomy has unsaved edits, and which cloud revision it
   was based on). Populated by loadLocalTaxonomy() below. */
let cloudMetaFromCache = { revision: null, dirty: false, dirtyAt: null };

let taxonomy = loadLocalTaxonomy();  // the current framework data
let mode = "idea";                   // "edit" | "idea" | "inspire"
let selectedCells = new Set();       // Design Ideas selections, as "row:col" strings
let lockedSelection = new Set();     // subset of selections protected from Randomize
let recipe = null;                   // Inspiration mode: row index per column (-1 = none)
let lockedColumns = new Set();       // Inspiration mode: locked column indexes
let lastGeneration = null;           // "spark" | "full" — what Regenerate repeats

/* Cloud sync state — populated by initCloud() when configured */
const cloud = {
  configured: isFirebaseConfigured(),
  ready: false,        // SDK loaded and initial fetch attempted
  db: null,
  auth: null,
  fns: null,           // firestore/auth functions from the dynamic imports
  user: null,          // signed-in Firebase user (admins sign in here)
  revision: null,      // updatedAt millis of the cloud version we're based on
  dirty: false,        // unsaved changes exist
  saveTimer: null,     // debounce timer
  saving: false
};

/* Shortcut for grabbing elements by id */
const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------
   3. LOCAL PERSISTENCE
   localStorage is the backup layer: it caches the latest known
   taxonomy and preserves unsaved edits across refreshes.
   Stored shape: { taxonomy, cloudRevision, dirty, dirtyAt }
   ------------------------------------------------------------ */
function makeColumnId(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "column";
  return `${slug}-${Math.random().toString(36).slice(2, 8)}`;
}

/* Upgrades a v1 taxonomy ({columns: [names], rows}) to v2.
   Default columns get their starter descriptions back. */
function migrateV1(old) {
  const byName = Object.fromEntries(DEFAULT_COLUMNS.map((c) => [c.name, c]));
  return {
    schemaVersion: 2,
    columns: old.columns.map((name) => {
      const preset = byName[name];
      return preset
        ? structuredClone(preset)
        : { id: makeColumnId(name), name, shortDescription: "", detailedDescription: "", example: "" };
    }),
    rows: old.rows
  };
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
    data.rows.every((row) => Array.isArray(row) && row.length === data.columns.length)
  );
}

/* Normalizes any accepted import/cache shape into v2 */
function normalizeTaxonomy(data) {
  if (isValidV2(data)) {
    data.columns.forEach((c) => {         // tolerate missing optional fields
      c.shortDescription = c.shortDescription || "";
      c.detailedDescription = c.detailedDescription || "";
      c.example = c.example || "";
    });
    return data;
  }
  if (isValidV1(data)) return migrateV1(data);
  return null;
}

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
    // One-time migration from the old v1 key
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const tax = normalizeTaxonomy(JSON.parse(legacy));
      if (tax) return tax;
    }
  } catch (err) {
    console.warn("Could not load saved taxonomy, using default.", err);
  }
  return structuredClone(DEFAULT_TAXONOMY);
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
   4. CLOUD SYNC (Firebase Auth + Cloud Firestore)
   Loaded on demand so the site stays fast — and fully functional
   — when firebase-config.js has not been filled in yet.
   ------------------------------------------------------------ */
const FIREBASE_VERSION = "10.12.2";
const CLOUD_DOC_PATH = ["taxonomy", "current"];

/* Firestore cannot store arrays-of-arrays, so the grid is saved
   column-major: each column object carries its own values list. */
function serializeForCloud() {
  return {
    schemaVersion: 2,
    columns: taxonomy.columns.map((col, c) => ({
      id: col.id,
      name: col.name,
      shortDescription: col.shortDescription,
      detailedDescription: col.detailedDescription,
      example: col.example,
      values: taxonomy.rows.map((row) => row[c])
    })),
    rowCount: taxonomy.rows.length
  };
}

function deserializeFromCloud(data) {
  if (!data || !Array.isArray(data.columns) || data.columns.length === 0) return null;
  const rowCount = data.rowCount ?? Math.max(...data.columns.map((c) => (c.values || []).length), 0);
  const tax = {
    schemaVersion: 2,
    columns: data.columns.map((c) => ({
      id: c.id || makeColumnId(c.name || "column"),
      name: c.name || "Untitled",
      shortDescription: c.shortDescription || "",
      detailedDescription: c.detailedDescription || "",
      example: c.example || ""
    })),
    rows: Array.from({ length: rowCount }, (_, r) =>
      data.columns.map((c) => ((c.values || [])[r] ?? ""))
    )
  };
  return isValidV2(tax) ? tax : null;
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

    // Watch sign-in state (persists across visits automatically)
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
      return;   // keep the locally loaded taxonomy
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

/* Debounced automatic save: called after every edit */
function scheduleCloudSave() {
  if (!canEdit()) return;
  if (!cloud.configured || !cloud.user) return;   // local-only mode saves instantly anyway
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
    // Read back the server timestamp so revisions stay comparable
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

/* Restore the last saved cloud version (discarding local edits) */
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

/* --- Save status UI --- */
function setSyncStatus(kind, message) {
  const el = $("sync-status");
  el.textContent = message;
  el.className = `sync-status is-${kind}`;   // is-ok / is-info / is-pending / is-error / is-local
}

function updateLastSaved(millis) {
  $("last-saved").textContent = millis
    ? `Last saved ${new Date(millis).toLocaleString()}`
    : "";
}

/* Every edit funnels through here: persist locally right away,
   then (for signed-in admins) autosave to the cloud after a pause. */
function markChanged() {
  cloud.dirty = true;
  saveLocal();
  if (cloud.configured) {
    if (cloud.user) {
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

/* Warn before leaving with unsaved cloud changes */
window.addEventListener("beforeunload", (e) => {
  if (cloud.configured && cloud.dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
});

/* ------------------------------------------------------------
   5. ACCESS CONTROL
   Public visitors explore and generate; editing requires either
   an admin sign-in (when cloud is configured) or local mode.
   ------------------------------------------------------------ */
function canEdit() {
  return !cloud.configured || !!cloud.user;
}

function applyAccessControl() {
  $("edit-mode-btn").hidden = !canEdit();
  $("restore-cloud-btn").hidden = !(cloud.configured && cloud.user);
  const adminBtn = $("admin-btn");
  const status = $("admin-status");
  if (!cloud.configured) {
    adminBtn.hidden = true;
    status.textContent = "";
  } else if (cloud.user) {
    adminBtn.hidden = false;
    adminBtn.textContent = "Sign out";
    status.textContent = `Signed in as ${cloud.user.email}`;
  } else {
    adminBtn.hidden = false;
    adminBtn.textContent = "Admin sign in";
    status.textContent = "";
  }
  if (mode === "edit" && !canEdit()) setMode("idea");
}

function onAuthChanged(user) {
  cloud.user = user;
  applyAccessControl();
  if (user) {
    setSyncStatus(cloud.dirty ? "pending" : "ok", cloud.dirty ? "Unsaved changes — they will save automatically as you edit, or press Save Now." : "All changes saved");
    if (cloud.dirty) $("retry-save-btn").hidden = true;
  }
}

async function handleAdminButton() {
  if (cloud.user) {
    if (!confirm("Sign out of the administrator account?")) return;
    if (cloud.dirty) await saveToCloud();   // don't lose pending work on sign-out
    await cloud.fns.signOut(cloud.auth);
    return;
  }
  $("login-error").hidden = true;
  $("login-email").value = "";
  $("login-password").value = "";
  $("login-modal").showModal();
  $("login-email").focus();
}

async function submitLogin() {
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  const errEl = $("login-error");
  if (!email || !password) {
    errEl.textContent = "Enter both email and password.";
    errEl.hidden = false;
    return;
  }
  $("login-submit").disabled = true;
  try {
    await cloud.fns.signInWithEmailAndPassword(cloud.auth, email, password);
    $("login-modal").close();
  } catch (err) {
    errEl.textContent =
      "Sign-in failed. Check the email and password. (" + (err.code || "unknown error") + ")";
    errEl.hidden = false;
  }
  $("login-submit").disabled = false;
}

/* ------------------------------------------------------------
   6. RENDERING — THE TAXONOMY GRID
   ------------------------------------------------------------ */
function refreshWorkspace() {
  if (mode === "inspire") {
    recipe = null;           // taxonomy may have changed shape
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
      // Editable name + ✎ description editor + × delete
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
      edit.addEventListener("click", () => openDescriptionEditor(colIndex));

      const del = document.createElement("button");
      del.className = "delete-btn";
      del.title = `Delete column “${col.name}”`;
      del.textContent = "×";
      del.addEventListener("click", () => deleteColumn(colIndex));

      wrap.append(name, edit, del);
      th.append(wrap);
    } else {
      // Clickable header: opens the category description modal.
      // (Clicking a header never selects cells — that's cells only.)
      th.className = "th-info";
      th.tabIndex = 0;
      th.setAttribute("role", "button");
      th.setAttribute("aria-label", `About the ${col.name} dimension`);
      if (col.shortDescription) th.title = col.shortDescription;   // hover tooltip
      th.innerHTML = `<span class="th-label"></span> <span class="info-icon" aria-hidden="true">ⓘ</span>`;
      th.querySelector(".th-label").textContent = col.name;
      const open = () => openDescriptionModal(colIndex);
      th.addEventListener("click", open);
      th.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
      });
    }

    headRow.append(th);
  });

  // Extra empty header over the row-delete column (Edit Mode only)
  if (mode === "edit") {
    const spacer = document.createElement("th");
    spacer.className = "row-tools";
    headRow.append(spacer);
  }

  thead.append(headRow);
  table.append(thead);

  /* ----- Body rows (the possibilities) ----- */
  const tbody = document.createElement("tbody");

  taxonomy.rows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");

    row.forEach((cellText, colIndex) => {
      const td = document.createElement("td");

      if (mode === "edit") {
        td.contentEditable = "true";
        td.spellcheck = false;
        td.textContent = cellText;
        td.addEventListener("blur", () => {
          taxonomy.rows[rowIndex][colIndex] = td.textContent.trim();
          markChanged();
        });
      } else {
        td.textContent = cellText;
        td.className = "selectable";
        const key = `${rowIndex}:${colIndex}`;
        if (selectedCells.has(key)) td.classList.add("is-selected");
        if (lockedSelection.has(key)) td.classList.add("is-locked-cell");
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

/* Status line + lock button label under the Design Ideas toolbar */
function updateSelectionSummary() {
  const el = $("selection-summary");
  const count = selectedCells.size;
  const locked = lockedSelection.size;

  let text =
    count === 0
      ? "No cells selected yet — click cells in the framework below, or use Randomize. Click a column heading (ⓘ) to learn what it means."
      : `${count} cell${count === 1 ? "" : "s"} selected.`;
  if (locked > 0) text += ` ${locked} locked — Randomize fills only the unlocked dimensions.`;
  el.textContent = text;

  $("lock-selection-btn").textContent =
    locked > 0 ? "🔓 Unlock Selection" : "🔒 Lock Selection";
}

/* ------------------------------------------------------------
   7. RENDERING — THE RECIPE BOARD (Inspiration Mode)
   ------------------------------------------------------------ */
function renderRecipeBoard() {
  const board = $("recipe-board");
  board.innerHTML = "";
  if (!recipe) return;

  taxonomy.columns.forEach((col, colIndex) => {
    const rowIndex = recipe[colIndex];
    const value = rowIndex >= 0 ? taxonomy.rows[rowIndex][colIndex] : "—";
    const locked = lockedColumns.has(colIndex);

    const card = document.createElement("div");
    card.className = "recipe-card" + (locked ? " is-locked" : "");

    const dim = document.createElement("button");
    dim.className = "recipe-dimension recipe-dimension-btn";
    dim.type = "button";
    dim.title = col.shortDescription || `About ${col.name}`;
    dim.innerHTML = `<span></span> <span class="info-icon" aria-hidden="true">ⓘ</span>`;
    dim.querySelector("span").textContent = col.name;
    dim.addEventListener("click", () => openDescriptionModal(colIndex));

    const val = document.createElement("div");
    val.className = "recipe-value";
    val.textContent = value;

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
   8. CATEGORY DESCRIPTION MODAL + EDITOR
   ------------------------------------------------------------ */

/* Read-only modal (Idea/Inspiration modes) */
function openDescriptionModal(colIndex) {
  const col = taxonomy.columns[colIndex];
  $("desc-modal-title").textContent = col.name;
  $("desc-modal-short").textContent =
    col.shortDescription || "No description has been written for this category yet.";
  $("desc-modal-detail").textContent = col.detailedDescription;
  $("desc-modal-detail-wrap").hidden = !col.detailedDescription;
  $("desc-modal-example").textContent = col.example;
  $("desc-modal-example-wrap").hidden = !col.example;
  $("desc-modal").showModal();
}

/* Editor dialog (Edit mode) — Save / Cancel, with a guard against
   accidentally losing changes on Cancel or Escape. */
let editingColIndex = null;

function openDescriptionEditor(colIndex) {
  editingColIndex = colIndex;
  const col = taxonomy.columns[colIndex];
  $("desc-editor-title").textContent = `Edit “${col.name}”`;
  $("edit-cat-name").value = col.name;
  $("edit-cat-short").value = col.shortDescription;
  $("edit-cat-detail").value = col.detailedDescription;
  $("edit-cat-example").value = col.example;
  $("desc-editor").showModal();
}

function editorIsDirty() {
  if (editingColIndex === null) return false;
  const col = taxonomy.columns[editingColIndex];
  return (
    $("edit-cat-name").value.trim() !== col.name ||
    $("edit-cat-short").value.trim() !== col.shortDescription ||
    $("edit-cat-detail").value.trim() !== col.detailedDescription ||
    $("edit-cat-example").value.trim() !== col.example
  );
}

function saveDescriptionEditor() {
  const col = taxonomy.columns[editingColIndex];
  col.name = $("edit-cat-name").value.trim() || "Untitled";   // id stays stable
  col.shortDescription = $("edit-cat-short").value.trim();
  col.detailedDescription = $("edit-cat-detail").value.trim();
  col.example = $("edit-cat-example").value.trim();
  $("desc-editor").close();
  editingColIndex = null;
  markChanged();
  renderTable();
}

function cancelDescriptionEditor() {
  if (editorIsDirty() && !confirm("Discard your changes to this category?")) return;
  $("desc-editor").close();
  editingColIndex = null;
}

/* ------------------------------------------------------------
   9. EDIT MODE ACTIONS
   ------------------------------------------------------------ */
function addRow() {
  taxonomy.rows.push(taxonomy.columns.map(() => ""));
  afterStructureChange();
}

/* New columns automatically get an empty description record */
function addColumn() {
  const name = `New Dimension ${taxonomy.columns.length + 1}`;
  taxonomy.columns.push({
    id: makeColumnId(name),
    name,
    shortDescription: "",
    detailedDescription: "",
    example: ""
  });
  taxonomy.rows.forEach((row) => row.push(""));
  afterStructureChange();
}

function deleteRow(rowIndex) {
  if (taxonomy.rows.length <= 1) {
    alert("The framework needs at least one row.");
    return;
  }
  taxonomy.rows.splice(rowIndex, 1);
  afterStructureChange();
}

/* Deleting a column deletes its description too — confirm first */
function deleteColumn(colIndex) {
  if (taxonomy.columns.length <= 1) {
    alert("The framework needs at least one column.");
    return;
  }
  const col = taxonomy.columns[colIndex];
  if (!confirm(`Delete the column “${col.name}” and its description? This cannot be undone here.`)) return;
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

/* When rows/columns change shape, selections and recipes may point
   at cells that no longer exist — reset them all. */
function afterStructureChange() {
  resetSelections();
  markChanged();
  renderTable();
}

/* Download the current taxonomy (v2, with descriptions) as JSON */
function exportJSON() {
  const blob = new Blob([JSON.stringify(taxonomy, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "taxonomy-backup.json";
  link.click();
  URL.revokeObjectURL(url);
}

/* Import: validate → preview/confirm → apply. Never silently
   overwrites cloud data — applying goes through the normal save
   flow, and the confirmation says so. */
function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const raw = JSON.parse(reader.result);
      const tax = normalizeTaxonomy(raw);
      if (!tax) {
        alert(
          "That file doesn't look like a valid taxonomy.\n\n" +
          "Expected either the current format (schemaVersion 2 with column objects) " +
          'or the older { "columns": ["..."], "rows": [["..."]] } format.'
        );
        return;
      }
      const preview =
        `Import this taxonomy?\n\n` +
        `Columns (${tax.columns.length}): ${tax.columns.map((c) => c.name).join(", ")}\n` +
        `Rows: ${tax.rows.length}\n\n` +
        `This replaces the taxonomy on screen` +
        (cloud.configured && cloud.user ? ` and will be saved to the cloud automatically.` : `.`);
      if (!confirm(preview)) return;

      taxonomy = tax;
      resetSelections();
      markChanged();
      renderTable();
      setSyncStatus(cloud.configured && cloud.user ? "info" : "local", "Imported ✓");
    } catch {
      alert("Could not read that file as JSON.");
    }
  };
  reader.readAsText(file);
}

function resetToDefault() {
  const sure = confirm("Reset to the default starter taxonomy? This replaces your current framework.");
  if (!sure) return;
  taxonomy = structuredClone(DEFAULT_TAXONOMY);
  afterStructureChange();
}

/* ------------------------------------------------------------
   10. DESIGN IDEAS MODE ACTIONS
   ------------------------------------------------------------ */

/* Toggles one cell in place (no full re-render) so the selection
   animation only plays on the cell that was actually clicked. */
function toggleCell(key, td) {
  if (selectedCells.has(key)) {
    selectedCells.delete(key);
    lockedSelection.delete(key);   // deselecting also unlocks it
    td.classList.remove("is-selected", "is-locked-cell");
  } else {
    selectedCells.add(key);
    td.classList.add("is-selected");
  }
  updateSelectionSummary();
}

/* Row indexes that have a non-empty value in the given column */
function rowsWithValue(colIndex) {
  const candidates = [];
  taxonomy.rows.forEach((row, rowIndex) => {
    if (row[colIndex].trim() !== "") candidates.push(rowIndex);
  });
  return candidates;
}

/* The first (top-most) locked cell in a column, or null */
function lockedCellInColumn(colIndex) {
  for (let r = 0; r < taxonomy.rows.length; r++) {
    if (lockedSelection.has(`${r}:${colIndex}`)) return `${r}:${colIndex}`;
  }
  return null;
}

/* Lock Selection: protects the current selection from Randomize.
   If a column has multiple selected cells, only the first is kept
   (a recipe needs exactly one value per dimension). */
function toggleSelectionLock() {
  if (lockedSelection.size > 0) {
    lockedSelection.clear();          // acting as "Unlock Selection"
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
        lockedSelection.add(key);     // first selected cell in this column wins
        keptOne = true;
      } else {
        selectedCells.delete(key);    // extra cells in the same column are dropped
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

/* Randomize Selection: builds a COMPLETE recipe — exactly one cell
   per column. Locked cells keep their column; every other column
   (with at least one usable value) gets one random cell. */
function randomizeSelection() {
  const next = new Set();
  taxonomy.columns.forEach((_, colIndex) => {
    const locked = lockedCellInColumn(colIndex);
    if (locked) {
      next.add(locked);               // locked column: keep the chosen cell
      return;
    }
    const candidates = rowsWithValue(colIndex);
    if (candidates.length > 0) next.add(`${pick(candidates)}:${colIndex}`);
    // columns with no usable values are skipped — nothing to select
  });
  selectedCells = next;
  renderTable();
}

/* Generate From Random Path: same complete-recipe fill (respecting
   locks), then immediately generates a full experience. */
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
   11. INSPIRATION MODE ACTIONS
   ------------------------------------------------------------ */

/* Rolls a fresh recipe, keeping any locked columns as they are */
function newRecipe() {
  const previous = recipe;
  recipe = taxonomy.columns.map((_, colIndex) => {
    if (lockedColumns.has(colIndex) && previous && previous[colIndex] >= 0) {
      return previous[colIndex];   // locked: keep the existing choice
    }
    const candidates = rowsWithValue(colIndex);
    return candidates.length > 0 ? pick(candidates) : -1;
  });
  renderRecipeBoard();
}

/* Rerolls a single column (tries to land on a different value) */
function rerollColumn(colIndex) {
  const candidates = rowsWithValue(colIndex);
  if (candidates.length === 0) return;
  const others = candidates.filter((r) => r !== recipe[colIndex]);
  recipe[colIndex] = others.length > 0 ? pick(others) : candidates[0];
  lockedColumns.delete(colIndex);   // rerolling implies you want it unlocked
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
   12. THE IDEA GENERATOR — KNOWLEDGE MAPS
   Keyed by column NAME: if a column is renamed, its values fall
   back to generic wording (the description record survives via
   the stable column id).
   ------------------------------------------------------------ */
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

const INTERPRETATIONS = {
  "Interactivity": {
    "Passive": "participants primarily observe as the experience unfolds around them",
    "Interactive": "participants make simple choices that visibly change the moment",
    "Problem Solving": "participants solve puzzles and challenges to move forward",
    "Physicalized": "participants act through movement and embodied action",
    "Interpersonal": "participants interact socially — other people are the core interface"
  },
  "Embodiment": {
    "Detached": "participants view the world from outside it, like studying a living diorama",
    "Observer": "participants stand inside the world but remain unseen by it",
    "First Person POV": "participants inhabit the world through their own eyes",
    "Movement Control": "participants' physical movement is tracked and mirrored in the world",
    "Human to Human": "presence comes from real people responding to real people"
  },
  "Co-Participation": {
    "Single Person": "a solo experience tuned for individual focus and pacing",
    "One on One": "an intimate pairing — one participant with one partner or guide",
    "Group": "a small group shares the experience and shapes it together",
    "MMO": "many participants inhabit the same persistent world at once",
    "Secondary Perspective": "some participants act while others watch and influence from a second vantage point"
  },
  "Story": {
    "None": "no imposed narrative — meaning emerges from what participants do",
    "Setting": "a rich setting implies a story without dictating one",
    "Pre-created": "a crafted narrative carries participants from beginning to end",
    "Choose your own": "branching paths let participants steer where the narrative goes",
    "Adaptive Story": "the story quietly reshapes itself around participant behavior"
  },
  "Dynamics": {
    "Predetermined": "events run on rails, giving the designer full control of pacing and reveals",
    "Choice": "discrete decision points hand participants agency at key beats",
    "Free Will": "participants act freely and the system responds to whatever they try",
    "Conversational Reality": "the world negotiates with participants through open-ended dialogue",
    "Adjustible POV": "participants can shift their point of view to see the system from new angles"
  },
  "Motivation": {
    "None": "engagement rides on curiosity alone — no external incentives",
    "Basic Mechanics": "simple, satisfying mechanics keep hands and minds engaged",
    "Challenge": "difficulty itself is the draw, so mastery feels earned",
    "Reinforcement": "steady feedback loops reward every bit of progress",
    "Reward System": "explicit rewards give structure to long-term engagement"
  },
  "Meta Control": {
    "None": "participants play within the world exactly as designed",
    "Journey": "participants control their own path through the world, not the world itself",
    "Character": "participants shape who they are within the world",
    "World Editor": "participants can modify parts of the world as they go",
    "World Builder": "participants construct the world itself — creation is the experience"
  },
  "Learning": {
    "Elemental": "knowledge arrives in small foundational pieces that stack",
    "Explicit": "learning goals are named openly and taught directly",
    "Implicit": "learning happens through doing — absorbed rather than taught",
    "Recall": "participants retrieve and apply what they already know",
    "Sythensis": "participants combine ideas into something new of their own"
  },
  "Data": {
    "Anonymous": "no participant data is kept — every session starts clean",
    "Identity": "the experience knows who participants are and greets them accordingly",
    "In-session": "behavior is tracked within a session so the experience adapts in the moment",
    "Personalized": "a persistent profile tailors the experience across visits",
    "Biometric": "physiological signals — heart rate, gaze, motion — tune the experience live"
  },
  "Tech": {
    "none": "no technology at all — a fully physical, analog experience",
    "2D": "a screen-based experience on ordinary displays",
    "AR": "digital content overlaid onto the real world",
    "VR": "a fully immersive simulated space",
    "XR": "a mixed system spanning physical and digital space"
  }
};

function interpret(col, value) {
  const map = INTERPRETATIONS[col];
  if (map && map[value]) return map[value];
  const role = COLUMN_ROLES[col] || "a key aspect of the design";
  return `“${value}” defines ${role}`;
}

/* ------------------------------------------------------------
   13. THE IDEA GENERATOR — TOPIC ANALYSIS
   ------------------------------------------------------------ */
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

/* ------------------------------------------------------------
   14. THE IDEA GENERATOR — COMPOSING & RENDERING
   ------------------------------------------------------------ */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/* Picks n DIFFERENT items from an array (or fewer if it's short) */
function pickSome(arr, n) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {   // Fisher–Yates shuffle
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

function capitalize(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* Join words naturally — "A", "A and B", "A, B, and C" */
function naturalJoin(items) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function escapeHTML(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/* Collects the chosen elements as { columnName: [values] } —
   from the recipe in Inspiration mode, from selected cells otherwise. */
function buildGroups() {
  const groups = {};

  if (mode === "inspire") {
    if (!recipe) return groups;
    taxonomy.columns.forEach((col, colIndex) => {
      const rowIndex = recipe[colIndex];
      if (rowIndex < 0) return;
      const value = taxonomy.rows[rowIndex][colIndex].trim();
      if (value !== "") groups[col.name] = [value];
    });
  } else {
    selectedCells.forEach((key) => {
      const [r, c] = key.split(":").map(Number);
      const colName = taxonomy.columns[c].name;
      const value = taxonomy.rows[r][c].trim();
      if (value === "") return;
      if (!groups[colName]) groups[colName] = [];
      groups[colName].push(value);
    });
  }

  return groups;
}

/* Values like "none" read badly inside prose; the rationale section
   still lists every chosen element faithfully. */
function proseValues(values = []) {
  return values.filter((v) => v.toLowerCase() !== "none");
}

/* Composes a complete idea object from the topic + chosen elements.
   Every field mixes randomized sentence templates with the
   interpretation maps, so regenerating gives fresh variations. */
function composeIdea(topic, groups, profile) {
  const columnNames = Object.keys(groups);
  const allValues = proseValues(columnNames.flatMap((c) => groups[c]));
  const signature = allValues.length > 0 ? pick(allValues) : "Immersive";

  const v = (col) => (groups[col] || [])[0] || null;
  const meaning = (col, fallback) => (v(col) ? interpret(col, v(col)) : fallback);

  const [actionA, actionB] = pickSome(profile.actions, 2);

  const title = pick([
    `${capitalize(topic)}: The ${signature} Experience`,
    `Inside ${capitalize(topic)}`,
    `${capitalize(topic)}, ${pick(["Reimagined", "Unlocked", "Up Close", "From the Inside"])}`,
    `The ${signature} ${capitalize(topic)} Project`
  ]);

  const pitch = pick([
    `An immersive take on ${topic} where ${meaning("Interactivity", "participants explore freely")} — set in ${profile.place}, built around ${naturalJoin(pickSome(profile.artifacts, 2))}.`,
    `${capitalize(profile.place)} becomes the classroom: an experience about ${topic} in which ${meaning("Interactivity", "participants set their own pace")}.`,
    `A designed experience that turns ${topic} into a place — one where ${meaning("Embodiment", "participants feel genuinely present")} and ${naturalJoin(pickSome(profile.artifacts, 2))} are things you handle, not read about.`
  ]);

  const audience = `${capitalize(meaning("Co-Participation", "designed for solo or small-group participation"))}. ${capitalize(meaning("Embodiment", "participants are present through their own natural perspective"))} — cast as ${pick([
    "curious newcomers",
    "hands-on apprentices",
    "investigators with a real question",
    "co-creators with a stake in the outcome"
  ])} among ${profile.community}.`;

  const flow =
    `Arrival: participants step into ${profile.place}${v("Story") ? ` — ${interpret("Story", v("Story"))}` : ""}. ` +
    `The core: they ${actionA}, then ${actionB}, while ${meaning("Dynamics", "the experience responds to whatever they try")}. ` +
    `Resolution: the session closes with ${profile.payoff}.`;

  const interaction = `${capitalize(meaning("Interactivity", "participants explore at their own pace"))}. In practice that means they ${actionA} — with ${meaning("Motivation", "curiosity as the only incentive")}.`;

  const immersion = `${capitalize(meaning("Embodiment", "presence comes from attention to detail rather than hardware"))}. ${capitalize(meaning("Meta Control", "the world stays in the designer's hands, so every moment can be tuned"))} — which keeps the immersion feeling ${pick(["earned", "personal", "alive", "coherent"])}.`;

  const goal = `${capitalize(meaning("Learning", "learning happens through doing"))}. The target: ${profile.payoff}. Emotionally, participants should leave feeling ${pick([
    "capable and curious for more",
    `personally connected to ${topic}`,
    "like insiders rather than audience members",
    "that they made something worth keeping"
  ])}.`;

  const dataUse = `${capitalize(meaning("Data", "no tracking is required — the experience treats every participant the same and stays private by default"))}.`;

  const techFit = `${capitalize(meaning("Tech", "no particular platform is required — the design works in a plain physical space"))}. ${pick([
    "The platform is a means, not the message: it should disappear behind the experience.",
    `The technology earns its place only where it makes ${topic} feel closer.`,
    "Delivery matches the design instead of driving it."
  ])}`;

  const rationale = columnNames.map((col) => ({
    col,
    values: groups[col],
    note: interpret(col, groups[col][0])
  }));

  const expansion = pick([
    `Add a second session where participants swap roles and experience ${topic} from a completely different perspective.`,
    `Extend the experience with a take-home artifact — ${pick(profile.artifacts)} that participants made or discovered, keeping ${topic} alive afterward.`,
    `Scale it up: connect multiple groups so their choices ripple into each other's version of the experience.`,
    `Layer in a facilitator character who can adjust difficulty and pacing in real time.`,
    `Swap one dimension (a different Tech or Story element, say) and run it again — comparing the two versions is a design lesson in itself.`
  ]);

  return { title, pitch, audience, flow, interaction, immersion, goal, dataUse, techFit, rationale, expansion, groups, columnNames };
}

/* Generates and renders an idea.
   kind = "full"  → the complete design concept
   kind = "spark" → a shorter, brainstorm-style version */
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
  lastGeneration = kind;

  const chips = idea.columnNames
    .map((col) => `<span class="chip">${escapeHTML(col)} · ${escapeHTML(idea.groups[col].join(", "))}</span>`)
    .join("");

  const section = (icon, label, bodyHTML) =>
    `<h3><span class="section-icon" aria-hidden="true">${icon}</span>${label}</h3>${bodyHTML}`;

  const rationaleHTML = `<ul>${idea.rationale
    .map(
      (r) =>
        `<li><strong>${escapeHTML(r.col)}:</strong> <em>${escapeHTML(naturalJoin(r.values))}</em> — ${escapeHTML(r.note)}.</li>`
    )
    .join("")}</ul>`;

  let body;
  if (kind === "spark") {
    const sparks = [
      `Open with this: participants ${pick(profile.actions)}.`,
      ...pickSome(idea.rationale, Math.min(2, idea.rationale.length)).map(
        (r) => `${capitalize(r.note)} (${r.col}: ${naturalJoin(r.values)}).`
      )
    ];
    body = `
      ${section("⚡", "Pitch", `<p>${escapeHTML(idea.pitch)}</p>`)}
      ${section("💭", "Sparks", `<ul>${sparks.map((s) => `<li>${escapeHTML(s)}</li>`).join("")}</ul>`)}
      ${section("🚀", "If It Has Legs", `<p>${escapeHTML(idea.expansion)}</p>`)}
    `;
  } else {
    body = `
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

  const output = $("idea-output");
  output.innerHTML = `
    <div class="recipe-chips">${chips}</div>
    <h2>${escapeHTML(idea.title)}</h2>
    ${body}
  `;
  output.hidden = false;
  output.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function regenerate() {
  generateIdea(lastGeneration || "full");
}

/* ------------------------------------------------------------
   15. MODE SWITCHING + WIRING EVERYTHING UP
   ------------------------------------------------------------ */
const MODE_HINTS = {
  edit: "Click any cell to edit its text. ✎ beside a column name edits its description. Changes save automatically.",
  idea: "Click cells to choose design elements — lock favorites, randomize the rest, then generate. Click a column heading for its meaning.",
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

  // Edit Mode buttons
  $("add-row-btn").addEventListener("click", addRow);
  $("add-col-btn").addEventListener("click", addColumn);
  $("save-now-btn").addEventListener("click", () => {
    if (cloud.configured && cloud.user) saveToCloud();
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

  // Design Ideas Mode buttons
  $("gen-full-btn").addEventListener("click", () => generateIdea("full"));
  $("gen-spark-btn").addEventListener("click", () => generateIdea("spark"));
  $("regen-btn").addEventListener("click", regenerate);
  $("random-path-btn").addEventListener("click", randomPath);
  $("randomize-btn").addEventListener("click", randomizeSelection);
  $("lock-selection-btn").addEventListener("click", toggleSelectionLock);
  $("clear-btn").addEventListener("click", clearSelection);

  // Inspiration Mode buttons
  $("inspire-full-btn").addEventListener("click", () => generateIdea("full"));
  $("inspire-spark-btn").addEventListener("click", () => generateIdea("spark"));
  $("inspire-regen-btn").addEventListener("click", regenerate);
  $("new-recipe-btn").addEventListener("click", newRecipe);

  // Topic box: Enter generates a full experience
  $("topic-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") generateIdea("full");
  });

  // Description modal (read-only)
  $("desc-modal-close").addEventListener("click", () => $("desc-modal").close());

  // Description editor: Save / Cancel, guard Escape against data loss
  $("desc-editor-save").addEventListener("click", saveDescriptionEditor);
  $("desc-editor-cancel").addEventListener("click", cancelDescriptionEditor);
  $("desc-editor-close").addEventListener("click", cancelDescriptionEditor);
  $("desc-editor").addEventListener("cancel", (e) => {
    if (editorIsDirty() && !confirm("Discard your changes to this category?")) e.preventDefault();
    else editingColIndex = null;
  });

  // Admin sign-in
  $("admin-btn").addEventListener("click", handleAdminButton);
  $("login-submit").addEventListener("click", submitLogin);
  $("login-cancel").addEventListener("click", () => $("login-modal").close());
  $("login-close").addEventListener("click", () => $("login-modal").close());
  $("login-password").addEventListener("keydown", (e) => {
    if (e.key === "Enter") submitLogin();
  });

  applyAccessControl();
  setMode("idea");   // public visitors land in Design Ideas mode
  if (!cloud.configured) {
    setSyncStatus("local", "Local mode — edits save in this browser only.");
  }
  initCloud();       // async: may adopt the cloud version and re-render
}

init();

/* Debug/testing handle (harmless to leave in production):
   lets the browser console inspect state, e.g. TaxonomyApp.state().mode */
window.TaxonomyApp = {
  state: () => ({ mode, cloud: { ...cloud, db: undefined, auth: undefined, fns: undefined }, columns: taxonomy.columns.map((c) => c.name), rows: taxonomy.rows.length, selected: selectedCells.size, locked: lockedSelection.size }),
  canEdit
};
