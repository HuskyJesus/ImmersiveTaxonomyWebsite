/* ============================================================
   Immersive Experience Design Taxonomy — script.js

   How this file is organized:
     1. Default taxonomy data
     2. App state (taxonomy, mode, selections, locks, recipe)
     3. localStorage save/load
     4. Rendering — the taxonomy grid (Edit / Design Ideas modes)
     5. Rendering — the recipe board (Inspiration mode)
     6. Edit Mode actions (rows, columns, import/export, reset)
     7. Design Ideas Mode actions (select, lock, randomize, clear)
     8. Inspiration Mode actions (new recipe, reroll, lock)
     9. The idea generator — knowledge maps
    10. The idea generator — topic analysis
    11. The idea generator — composing and rendering ideas
    12. Mode switching + wiring everything up

   The taxonomy is stored as a plain object:
     { columns: ["Interactivity", ...], rows: [["Passive", ...], ...] }
   Every row has exactly one cell per column. Each COLUMN is treated
   as a design dimension; each cell is one possibility within it.
   ============================================================ */

/* ------------------------------------------------------------
   1. DEFAULT TAXONOMY
   To permanently replace the starter taxonomy, edit this object
   (spelling is preserved exactly as provided for now).
   ------------------------------------------------------------ */
const DEFAULT_TAXONOMY = {
  columns: [
    "Interactivity", "Embodiment", "Co-Participation", "Story", "Dynamics",
    "Motivation", "Meta Control", "Learning", "Data", "Tech"
  ],
  rows: [
    ["Passive", "Detached", "Single Person", "None", "Predetermined", "None", "None", "Elemental", "Anonymous", "none"],
    ["Interactive", "Observer", "One on One", "Setting", "Choice", "Basic Mechanics", "Journey", "Explicit", "Identity", "2D"],
    ["Problem Solving", "First Person POV", "Group", "Pre-created", "Free Will", "Challenge", "Character", "Implicit", "In-session", "AR"],
    ["Physicalized", "Movement Control", "MMO", "Choose your own", "Conversational Reality", "Reinforcement", "World Editor", "Recall", "Personalized", "VR"],
    ["Interpersonal", "Human to Human", "Secondary Perspective", "Adaptive Story", "Adjustible POV", "Reward System", "World Builder", "Sythensis", "Biometric", "XR"]
  ]
};

/* Key used to save the taxonomy in the browser's localStorage */
const STORAGE_KEY = "immersive-taxonomy-v1";

/* ------------------------------------------------------------
   2. APP STATE
   ------------------------------------------------------------ */
let taxonomy = loadTaxonomy();     // the current framework data
let mode = "edit";                 // "edit" | "idea" | "inspire"
let selectedCells = new Set();     // Design Ideas selections, as "row:col" strings
let lockedSelection = new Set();   // subset of selections protected from Randomize
let recipe = null;                 // Inspiration mode: array of row indexes, one per column (-1 = no value)
let lockedColumns = new Set();     // Inspiration mode: column indexes kept on "New Recipe"
let lastGeneration = null;         // "spark" | "full" — what Regenerate should repeat

/* Shortcut for grabbing elements by id */
const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------
   3. SAVE / LOAD (localStorage)
   ------------------------------------------------------------ */
function loadTaxonomy() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      if (isValidTaxonomy(data)) return data;
    }
  } catch (err) {
    console.warn("Could not load saved taxonomy, using default.", err);
  }
  // structuredClone gives a fresh copy so edits never touch the default
  return structuredClone(DEFAULT_TAXONOMY);
}

function saveTaxonomy(showMessage = false) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(taxonomy));
  if (showMessage) flashSaveStatus("Saved ✓");
}

/* Checks that imported/loaded data has the right shape */
function isValidTaxonomy(data) {
  return (
    data &&
    Array.isArray(data.columns) &&
    data.columns.length > 0 &&
    data.columns.every((c) => typeof c === "string") &&
    Array.isArray(data.rows) &&
    data.rows.every(
      (row) =>
        Array.isArray(row) &&
        row.length === data.columns.length &&
        row.every((cell) => typeof cell === "string")
    )
  );
}

/* Briefly shows a message next to the Save button, then clears it */
let saveStatusTimer = null;
function flashSaveStatus(message) {
  const el = $("save-status");
  el.textContent = message;
  clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(() => (el.textContent = ""), 2000);
}

/* ------------------------------------------------------------
   4. RENDERING — THE TAXONOMY GRID
   Used by Edit Mode (editable) and Design Ideas Mode (selectable).
   ------------------------------------------------------------ */
function renderTable() {
  const container = $("table-container");
  container.innerHTML = "";

  const table = document.createElement("table");

  /* ----- Header row (the design dimensions) ----- */
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  taxonomy.columns.forEach((colName, colIndex) => {
    const th = document.createElement("th");

    if (mode === "edit") {
      // Editable dimension name + a × button to delete the column
      const wrap = document.createElement("div");
      wrap.className = "header-cell";

      const name = document.createElement("span");
      name.className = "header-name";
      name.contentEditable = "true";
      name.spellcheck = false;
      name.textContent = colName;
      name.addEventListener("blur", () => {
        taxonomy.columns[colIndex] = name.textContent.trim() || "Untitled";
        name.textContent = taxonomy.columns[colIndex];
        saveTaxonomy();
      });

      const del = document.createElement("button");
      del.className = "delete-btn";
      del.title = `Delete column “${colName}”`;
      del.textContent = "×";
      del.addEventListener("click", () => deleteColumn(colIndex));

      wrap.append(name, del);
      th.append(wrap);
    } else {
      th.textContent = colName;
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
        // EDIT MODE: click into a cell and type
        td.contentEditable = "true";
        td.spellcheck = false;
        td.textContent = cellText;
        td.addEventListener("blur", () => {
          taxonomy.rows[rowIndex][colIndex] = td.textContent.trim();
          saveTaxonomy();
        });
      } else {
        // DESIGN IDEAS MODE: click a cell to select/deselect it
        td.textContent = cellText;
        td.className = "selectable";
        const key = `${rowIndex}:${colIndex}`;
        if (selectedCells.has(key)) td.classList.add("is-selected");
        if (lockedSelection.has(key)) td.classList.add("is-locked-cell");
        td.addEventListener("click", () => toggleCell(key, td));
      }

      tr.append(td);
    });

    // Trailing × button that deletes this row (Edit Mode only)
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
      ? "No cells selected yet — click cells in the framework below, or use Randomize."
      : `${count} cell${count === 1 ? "" : "s"} selected.`;
  if (locked > 0) text += ` ${locked} locked — Randomize fills only the unlocked dimensions.`;
  el.textContent = text;

  $("lock-selection-btn").textContent =
    locked > 0 ? "🔓 Unlock Selection" : "🔒 Lock Selection";
}

/* ------------------------------------------------------------
   5. RENDERING — THE RECIPE BOARD (Inspiration Mode)
   ------------------------------------------------------------ */
function renderRecipeBoard() {
  const board = $("recipe-board");
  board.innerHTML = "";
  if (!recipe) return;

  taxonomy.columns.forEach((colName, colIndex) => {
    const rowIndex = recipe[colIndex];
    const value = rowIndex >= 0 ? taxonomy.rows[rowIndex][colIndex] : "—";
    const locked = lockedColumns.has(colIndex);

    const card = document.createElement("div");
    card.className = "recipe-card" + (locked ? " is-locked" : "");

    const dim = document.createElement("div");
    dim.className = "recipe-dimension";
    dim.textContent = colName;

    const val = document.createElement("div");
    val.className = "recipe-value";
    val.textContent = value;

    const actions = document.createElement("div");
    actions.className = "recipe-actions";

    // Reroll just this one dimension
    const reroll = document.createElement("button");
    reroll.className = "icon-btn";
    reroll.title = `Reroll ${colName}`;
    reroll.textContent = "🔄";
    reroll.addEventListener("click", () => rerollColumn(colIndex));

    // Lock/unlock this dimension so "New Recipe" keeps it
    const lock = document.createElement("button");
    lock.className = "icon-btn";
    lock.title = locked ? `Unlock ${colName}` : `Lock ${colName}`;
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
   6. EDIT MODE ACTIONS
   ------------------------------------------------------------ */
function addRow() {
  taxonomy.rows.push(taxonomy.columns.map(() => ""));
  afterStructureChange();
}

function addColumn() {
  taxonomy.columns.push(`New Dimension ${taxonomy.columns.length + 1}`);
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

function deleteColumn(colIndex) {
  if (taxonomy.columns.length <= 1) {
    alert("The framework needs at least one column.");
    return;
  }
  taxonomy.columns.splice(colIndex, 1);
  taxonomy.rows.forEach((row) => row.splice(colIndex, 1));
  afterStructureChange();
}

/* When rows/columns change shape, selections, locks, and recipes
   may point at cells that no longer exist — reset them all. */
function afterStructureChange() {
  selectedCells.clear();
  lockedSelection.clear();
  recipe = null;
  lockedColumns.clear();
  saveTaxonomy();
  renderTable();
}

/* Download the current taxonomy as a .json file */
function exportJSON() {
  const blob = new Blob([JSON.stringify(taxonomy, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "taxonomy.json";
  link.click();
  URL.revokeObjectURL(url);
}

/* Read a .json file chosen by the user and replace the taxonomy */
function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!isValidTaxonomy(data)) {
        alert(
          "That file doesn't look like a valid taxonomy.\n\n" +
          'Expected shape: { "columns": ["..."], "rows": [["..."]] } ' +
          "where every row has one cell per column."
        );
        return;
      }
      taxonomy = data;
      afterStructureChange();
      flashSaveStatus("Imported ✓");
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
  flashSaveStatus("Reset ✓");
}

/* ------------------------------------------------------------
   7. DESIGN IDEAS MODE ACTIONS
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
   8. INSPIRATION MODE ACTIONS
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
   9. THE IDEA GENERATOR — KNOWLEDGE MAPS
   Each column plays a specific role in the design, and every
   default value has a short interpretation. Custom columns and
   values still work — they fall back to generic wording.
   ------------------------------------------------------------ */

/* What each dimension controls in the design */
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

/* What each specific value means for the design */
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

/* Look up the meaning of a value within its dimension, with a
   graceful fallback for custom columns/values. */
function interpret(col, value) {
  const map = INTERPRETATIONS[col];
  if (map && map[value]) return map[value];
  const role = COLUMN_ROLES[col] || "a key aspect of the design";
  return `“${value}” defines ${role}`;
}

/* ------------------------------------------------------------
   10. THE IDEA GENERATOR — TOPIC ANALYSIS
   A small keyword scan matches the topic to a domain profile so
   generated ideas use vocabulary that fits the subject.
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

/* Used when the topic doesn't match any profile */
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

/* Scans the topic for domain keywords and returns the best profile */
function analyzeTopic(topic) {
  const t = topic.toLowerCase();
  for (const profile of DOMAIN_PROFILES) {
    if (profile.keywords.some((k) => t.includes(k))) return profile;
  }
  return GENERIC_PROFILE;
}

/* ------------------------------------------------------------
   11. THE IDEA GENERATOR — COMPOSING & RENDERING
   ------------------------------------------------------------ */

/* --- Small utilities --- */
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

/* Escape text before putting it into HTML */
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
    taxonomy.columns.forEach((colName, colIndex) => {
      const rowIndex = recipe[colIndex];
      if (rowIndex < 0) return;
      const value = taxonomy.rows[rowIndex][colIndex].trim();
      if (value !== "") groups[colName] = [value];
    });
  } else {
    selectedCells.forEach((key) => {
      const [r, c] = key.split(":").map(Number);
      const colName = taxonomy.columns[c];
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

  // First chosen value in a dimension (or null), and its interpretation
  const v = (col) => (groups[col] || [])[0] || null;
  const meaning = (col, fallback) => (v(col) ? interpret(col, v(col)) : fallback);

  const [actionA, actionB] = pickSome(profile.actions, 2);

  /* ----- Title & pitch ----- */
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

  /* ----- Audience / user role ----- */
  const audience = `${capitalize(meaning("Co-Participation", "designed for solo or small-group participation"))}. ${capitalize(meaning("Embodiment", "participants are present through their own natural perspective"))} — cast as ${pick([
    "curious newcomers",
    "hands-on apprentices",
    "investigators with a real question",
    "co-creators with a stake in the outcome"
  ])} among ${profile.community}.`;

  /* ----- Experience flow (arrival → core → resolution) ----- */
  const flow =
    `Arrival: participants step into ${profile.place}${v("Story") ? ` — ${interpret("Story", v("Story"))}` : ""}. ` +
    `The core: they ${actionA}, then ${actionB}, while ${meaning("Dynamics", "the experience responds to whatever they try")}. ` +
    `Resolution: the session closes with ${profile.payoff}.`;

  /* ----- Interaction model ----- */
  const interaction = `${capitalize(meaning("Interactivity", "participants explore at their own pace"))}. In practice that means they ${actionA} — with ${meaning("Motivation", "curiosity as the only incentive")}.`;

  /* ----- Immersion strategy ----- */
  const immersion = `${capitalize(meaning("Embodiment", "presence comes from attention to detail rather than hardware"))}. ${capitalize(meaning("Meta Control", "the world stays in the designer's hands, so every moment can be tuned"))} — which keeps the immersion feeling ${pick(["earned", "personal", "alive", "coherent"])}.`;

  /* ----- Learning / emotional goal ----- */
  const goal = `${capitalize(meaning("Learning", "learning happens through doing"))}. The target: ${profile.payoff}. Emotionally, participants should leave feeling ${pick([
    "capable and curious for more",
    `personally connected to ${topic}`,
    "like insiders rather than audience members",
    "that they made something worth keeping"
  ])}.`;

  /* ----- Data / personalization ----- */
  const dataUse = `${capitalize(meaning("Data", "no tracking is required — the experience treats every participant the same and stays private by default"))}.`;

  /* ----- Technology fit ----- */
  const techFit = `${capitalize(meaning("Tech", "no particular platform is required — the design works in a plain physical space"))}. ${pick([
    "The platform is a means, not the message: it should disappear behind the experience.",
    `The technology earns its place only where it makes ${topic} feel closer.`,
    "Delivery matches the design instead of driving it."
  ])}`;

  /* ----- Design rationale: one line per chosen dimension ----- */
  const rationale = columnNames.map((col) => ({
    col,
    values: groups[col],
    note: interpret(col, groups[col][0])
  }));

  /* ----- Optional expansion ----- */
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

  /* "Dimension · Value" chips summarizing the recipe used */
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
    // Brainstorm card: pitch + three quick sparks to riff on
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

/* Regenerate: same selections + topic, new variation. Falls back to
   a full generation if nothing has been generated yet. */
function regenerate() {
  generateIdea(lastGeneration || "full");
}

/* ------------------------------------------------------------
   12. MODE SWITCHING + WIRING EVERYTHING UP
   ------------------------------------------------------------ */
const MODE_HINTS = {
  edit: "Click any cell or column header to edit its text. Changes save automatically.",
  idea: "Click cells to choose design elements — lock favorites, randomize the rest, then generate.",
  inspire: "A complete experience recipe — one element per dimension. Lock favorites, reroll the rest, then generate."
};

function setMode(newMode) {
  mode = newMode;

  // Highlight the active mode button
  $("edit-mode-btn").classList.toggle("is-active", mode === "edit");
  $("idea-mode-btn").classList.toggle("is-active", mode === "idea");
  $("inspire-mode-btn").classList.toggle("is-active", mode === "inspire");

  // Show the toolbar for the active mode
  $("edit-tools").hidden = mode !== "edit";
  $("idea-tools").hidden = mode !== "idea";
  $("inspire-tools").hidden = mode !== "inspire";

  // The workspace shows the grid (edit/idea) or the recipe board (inspire)
  $("table-container").hidden = mode === "inspire";
  $("recipe-board").hidden = mode !== "inspire";

  // The generated idea only makes sense in the generating modes
  if (mode === "edit") $("idea-output").hidden = true;

  // Move the shared topic input into the active panel
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
    if (!recipe) newRecipe();   // first visit: roll a starting recipe
    renderRecipeBoard();
  } else {
    renderTable();
  }

  // Gentle fade-in of the workspace content on every mode switch
  const activeView = mode === "inspire" ? $("recipe-board") : $("table-container");
  activeView.classList.remove("fade-in");
  void activeView.offsetWidth;   // forces a reflow so the animation restarts
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
  $("save-btn").addEventListener("click", () => saveTaxonomy(true));
  $("export-btn").addEventListener("click", exportJSON);
  $("import-btn").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", (e) => {
    if (e.target.files.length > 0) importJSON(e.target.files[0]);
    e.target.value = ""; // allow importing the same file twice in a row
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

  // Pressing Enter in the topic box generates a full experience
  $("topic-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") generateIdea("full");
  });

  setMode("edit"); // start in Edit Mode
}

init();
