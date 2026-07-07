/* ============================================================
   Immersive Experience Design Taxonomy — script.js

   How this file is organized:
     1. Default taxonomy data
     2. App state (taxonomy, mode, selections, recipe, locks)
     3. localStorage save/load
     4. Rendering — the taxonomy grid (Edit / Design Ideas modes)
     5. Rendering — the recipe board (Inspiration mode)
     6. Edit Mode actions (rows, columns, import/export, reset)
     7. Design Ideas Mode actions (select, randomize, clear)
     8. Inspiration Mode actions (new recipe, reroll, lock)
     9. The idea generator (template-based — no API needed)
    10. Mode switching + wiring everything up

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
let recipe = null;                 // Inspiration mode: array of row indexes, one per column (-1 = no value)
let lockedColumns = new Set();     // column indexes that keep their value on "New Recipe"

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

/* Small line under the Design Ideas toolbar, e.g. "3 cells selected" */
function updateSelectionSummary() {
  const el = $("selection-summary");
  const count = selectedCells.size;
  el.textContent =
    count === 0
      ? "No cells selected yet — click cells in the framework below, or use Randomize."
      : `${count} cell${count === 1 ? "" : "s"} selected.`;
}

/* ------------------------------------------------------------
   5. RENDERING — THE RECIPE BOARD (Inspiration Mode)
   One card per column: the dimension name, the randomly chosen
   value, a reroll button, and a lock toggle.
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
    lock.addEventListener("click", () => toggleLock(colIndex));

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

/* When rows/columns change shape, old selections, recipes, and locks
   may point at cells that no longer exist — reset them all. */
function afterStructureChange() {
  selectedCells.clear();
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
    td.classList.remove("is-selected");
  } else {
    selectedCells.add(key);
    td.classList.add("is-selected");
  }
  updateSelectionSummary();
}

/* Picks a handful of random non-empty cells (3–5) */
function randomizeSelection() {
  selectedCells.clear();

  const positions = [];
  taxonomy.rows.forEach((row, r) =>
    row.forEach((cell, c) => {
      if (cell.trim() !== "") positions.push(`${r}:${c}`);
    })
  );

  const howMany = Math.min(positions.length, 3 + Math.floor(Math.random() * 3)); // 3, 4, or 5
  shuffle(positions);
  positions.slice(0, howMany).forEach((key) => selectedCells.add(key));
  renderTable();
}

/* Selects one cell from EVERY column — a complete design path —
   then generates an idea from it right away. (For finer control,
   Inspiration Mode does the same thing with per-column locks.) */
function randomPath() {
  selectedCells.clear();
  taxonomy.columns.forEach((_, colIndex) => {
    const candidates = rowsWithValue(colIndex);
    if (candidates.length > 0) {
      selectedCells.add(`${pick(candidates)}:${colIndex}`);
    }
  });
  renderTable();
  generateIdea();
}

function clearSelection() {
  selectedCells.clear();
  renderTable();
  $("idea-output").hidden = true;
}

/* ------------------------------------------------------------
   8. INSPIRATION MODE ACTIONS
   A "recipe" holds one randomly chosen row index per column.
   Locked columns survive a reroll.
   ------------------------------------------------------------ */

/* Row indexes that have a non-empty value in the given column */
function rowsWithValue(colIndex) {
  const candidates = [];
  taxonomy.rows.forEach((row, rowIndex) => {
    if (row[colIndex].trim() !== "") candidates.push(rowIndex);
  });
  return candidates;
}

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

function toggleLock(colIndex) {
  if (lockedColumns.has(colIndex)) {
    lockedColumns.delete(colIndex);
  } else {
    lockedColumns.add(colIndex);
  }
  renderRecipeBoard();
}

/* ------------------------------------------------------------
   9. THE IDEA GENERATOR
   Template-based: it combines the topic with the chosen taxonomy
   elements — grouped by column/dimension — into a readable design
   concept. Runs entirely locally, no API.
   ------------------------------------------------------------ */

/* Plain-language meaning of each default dimension, used in the
   "why it fits" section. Unknown (custom) columns get a fallback. */
const COLUMN_MEANINGS = {
  "Interactivity": "how participants act within the experience",
  "Embodiment": "how participants are present in the world",
  "Co-Participation": "how many people share the experience, and how",
  "Story": "how the narrative is structured",
  "Dynamics": "how much the experience adapts and responds",
  "Motivation": "what keeps participants engaged",
  "Meta Control": "how much participants can shape the world itself",
  "Learning": "how knowledge is absorbed",
  "Data": "how participant information shapes the experience",
  "Tech": "the technology that delivers the experience"
};

/* --- Small utilities --- */
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {  // Fisher–Yates, in place
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
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
   from the recipe in Inspiration mode, from clicked cells otherwise. */
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

/* Some cell values (like "none") read badly inside sentences.
   This filters them out for prose, while the "why" section still
   lists every chosen element faithfully. */
function proseValues(values = []) {
  return values.filter((v) => v.toLowerCase() !== "none");
}

function generateIdea() {
  const topicRaw = $("topic-input").value.trim();
  const groups = buildGroups();
  const columnNames = Object.keys(groups);

  if (columnNames.length === 0) {
    alert(
      mode === "inspire"
        ? "Roll a recipe first (press New Recipe)."
        : "Select at least one cell first (or press Randomize Selection)."
    );
    return;
  }

  const topic = topicRaw || "a topic of your choice";

  // All chosen values, minus awkward "none" entries, for use in prose
  const allValues = proseValues(columnNames.flatMap((c) => groups[c]));
  // A "signature" term featured in the title
  const signature = allValues.length > 0 ? pick(allValues) : "Immersive";

  // Convenience getter for specific dimensions (with graceful fallbacks)
  const firstOf = (col, fallback) => proseValues(groups[col] || [])[0] || fallback;

  const interactivity = firstOf("Interactivity", "open exploration");
  const embodiment = firstOf("Embodiment", "their own natural perspective");
  const coParticipation = firstOf("Co-Participation", "solo or small-group");
  const story = firstOf("Story", "a lightly structured");
  const dynamics = firstOf("Dynamics", "responsive");
  const motivation = firstOf("Motivation", "curiosity");
  const learning = firstOf("Learning", "hands-on discovery");
  const tech = firstOf("Tech", "a low-tech physical space");

  /* ----- Title ----- */
  const title = pick([
    `${capitalize(topic)}: The ${signature} Experience`,
    `Inside ${capitalize(topic)}`,
    `${capitalize(topic)}, Reimagined`,
    `The ${signature} ${capitalize(topic)} Project`,
    `${capitalize(topic)} Unlocked`
  ]);

  /* ----- Core concept ----- */
  const concept = pick([
    `An immersive experience built around ${topic}, weaving together ${naturalJoin(allValues.slice(0, 3))} into one participatory world.`,
    `A designed experience that turns ${topic} into something participants step inside of, shaped by ${naturalJoin(allValues.slice(0, 3))}.`,
    `Participants don't just learn about ${topic} — they inhabit it, through an experience defined by ${naturalJoin(allValues.slice(0, 3))}.`
  ]);

  /* ----- Audience / player role ----- */
  const role = `Designed as a ${coParticipation} experience. Each participant is present through ${embodiment}, taking the role of ${pick([
    "an active explorer",
    "a curious apprentice",
    "an investigator piecing things together",
    "a co-creator of the world",
    "a traveler moving through the experience"
  ])} within the world of ${topic}.`;

  /* ----- Interaction style ----- */
  const interaction = `Interaction centers on ${interactivity}, with ${dynamics} dynamics guiding how the experience unfolds. Engagement is sustained through ${motivation}.`;

  /* ----- Environment / setting ----- */
  const environment = pick([
    `Framed by ${story} story structure, the world of ${topic} becomes a place participants move through — with a clear sense of where they are and why it matters.`,
    `The setting wraps participants in ${topic}, using ${story} story structure to give every space a purpose and every moment a sense of place.`
  ]);

  /* ----- Technology ----- */
  const technology = pick([
    `Delivered through ${tech}. The technology stays in service of the experience — creating presence rather than drawing attention to itself.`,
    `${capitalize(tech)} carries the experience, chosen so the delivery amplifies immersion instead of distracting from ${topic}.`
  ]);

  /* ----- Learning / emotional goal ----- */
  const goal = pick([
    `Participants come away with ${learning} understanding of ${topic}, and an emotional memory of having been part of it rather than just observing it.`,
    `The goal is ${learning} learning about ${topic} — paired with the feeling of genuine presence and accomplishment.`,
    `By the end, participants should feel personally connected to ${topic}, having absorbed it through ${learning} engagement.`
  ]);

  /* ----- Why the chosen elements fit -----
     One line per dimension, always naming both the column and value. */
  const whyItems = columnNames.map((col) => {
    const meaning = COLUMN_MEANINGS[col] || "a key dimension of the design";
    return `<li><strong>${escapeHTML(col)}:</strong> this design uses <em>${escapeHTML(
      naturalJoin(groups[col])
    )}</em> — shaping ${escapeHTML(meaning)}.</li>`;
  });

  /* ----- "Column · Value" chips summarizing the recipe ----- */
  const chips = columnNames
    .map((col) => `<span class="chip">${escapeHTML(col)} · ${escapeHTML(groups[col].join(", "))}</span>`)
    .join("");

  /* ----- Optional expansion idea ----- */
  const expansion = pick([
    `Add a second session where participants swap roles and experience ${topic} from a completely different perspective.`,
    `Extend the experience with a take-home artifact — something participants made or discovered that keeps ${topic} alive afterward.`,
    `Scale it up: connect multiple groups so their choices ripple into each other's version of the experience.`,
    `Layer in a facilitator or guide character who can adjust difficulty and pacing in real time.`,
    `Try shifting one taxonomy dimension (for example, a different Tech or Story element) and compare how the experience changes.`
  ]);

  /* ----- Render the report card -----
     Small helper keeps each section consistent: icon + label + body. */
  const section = (icon, label, bodyHTML) =>
    `<h3><span class="section-icon" aria-hidden="true">${icon}</span>${label}</h3>${bodyHTML}`;

  const output = $("idea-output");
  output.innerHTML = `
    <div class="recipe-chips">${chips}</div>
    <h2>${escapeHTML(title)}</h2>
    ${section("📋", "Summary", `<p>${escapeHTML(concept)}</p>`)}
    ${section("👥", "Audience", `<p>${escapeHTML(role)}</p>`)}
    ${section("🌍", "Environment", `<p>${escapeHTML(environment)}</p>`)}
    ${section("🕹️", "Interaction", `<p>${escapeHTML(interaction)}</p>`)}
    ${section("🎯", "Learning Goal", `<p>${escapeHTML(goal)}</p>`)}
    ${section("🥽", "Technology", `<p>${escapeHTML(technology)}</p>`)}
    ${section("🧩", "Design Rationale", `<ul>${whyItems.join("")}</ul>`)}
    ${section("🚀", "Optional Expansion", `<p>${escapeHTML(expansion)}</p>`)}
  `;
  output.hidden = false;
  output.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

/* ------------------------------------------------------------
   10. MODE SWITCHING + WIRING EVERYTHING UP
   ------------------------------------------------------------ */
const MODE_HINTS = {
  edit: "Click any cell or column header to edit its text. Changes save automatically.",
  idea: "Click cells to select design elements, then enter a topic and generate an idea.",
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
  $("generate-btn").addEventListener("click", generateIdea);
  $("random-path-btn").addEventListener("click", randomPath);
  $("randomize-btn").addEventListener("click", randomizeSelection);
  $("clear-btn").addEventListener("click", clearSelection);

  // Inspiration Mode buttons
  $("inspire-generate-btn").addEventListener("click", generateIdea);
  $("new-recipe-btn").addEventListener("click", newRecipe);

  // Pressing Enter in the topic box generates an idea
  $("topic-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") generateIdea();
  });

  setMode("edit"); // start in Edit Mode
}

init();
