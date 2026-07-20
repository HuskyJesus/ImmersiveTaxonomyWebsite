/* ============================================================
   TAXONOMY DATA MODEL — validation, hydration, and migration

   This module is pure data logic (no DOM, no Firebase) so it can
   be unit-tested in Node (`node --test test/`) and shared by
   script.js.

   THE TWO PATHS — never mix them:

   1. MIGRATION (migrateLegacyTaxonomy / the v1+v2 branches of
      normalizeTaxonomy). Runs ONLY when the data is genuinely
      old, detected by EXPLICIT schema shape: v1 (string columns)
      or v2 (schemaVersion 2, string cells). Migration may apply
      the historical LEGACY_* name maps, restore canonical column
      order, refresh never-customized records from the shipped
      defaults, and mint stable ids. It stamps
      contentMigrationVersion so it can never run again on the
      same data after it is saved.

   2. HYDRATION (hydrateTaxonomy). Runs on every load of
      CURRENT-schema (v3) data — localStorage, Firestore, and
      JSON import. It only repairs shape: fills fields that are
      completely ABSENT (undefined/null), coerces metadata types,
      and mints ids for records that lack one. It must NEVER
      rename a column or element, apply legacy aliases, reorder
      columns, or replace a record with a shipped default —
      current data is authoritative exactly as stored, whether or
      not hasCustomEdits is set.

   Visible names are display text only; identity lives in the
   stable `id` fields. Renaming never changes an id.
   ============================================================ */

import { DEFAULT_COLUMNS, VALUE_STARTERS, buildDefaultTaxonomy } from "./starter-content.js?v=20260716-ixd2";

export const SCHEMA_VERSION = 3;

/* Bumped only when a new one-time CONTENT migration is added
   (historical renames, structural repairs). Data at the current
   version — or any v3 data with no version stamp, which predates
   this field — is treated as already migrated. */
export const CONTENT_MIGRATION_VERSION = 1;

/* The manuscript-content fields carried by columns and elements */
export const COLUMN_EXTRA_FIELDS = [
  ["subtitle", "Chapter framing subtitle"],
  ["designQuestion", "Central design question"],
  ["whyItMatters", "Why it matters"],
  ["useCases", "Use cases"],
  ["cautions", "Cautions"],
  ["progression", "Five-element progression"],
  ["source", "Source chapter"]
];
export const VALUE_EXTRA_FIELDS = [
  ["participantRole", "Participant role"],
  ["designerResponsibility", "Designer responsibility"],
  ["useCases", "Appropriate use cases"],
  ["cautions", "Cautions"],
  ["source", "Source chapter and section"],
  ["keywords", "Search keywords"]
];

/* ------------------------------------------------------------
   HISTORICAL NAME MAPS — used ONLY while migrating genuine v1/v2
   data. A current-schema (v3) load must never consult these:
   an administrator is free to name a category "Motivation" or an
   element "Observer" today, and that exact text must persist.
   ------------------------------------------------------------ */
export const LEGACY_COLUMN_NAMES = {
  Motivation: "Gamification",
  Tech: "Immersive Technology",
  Learning: "Didactic Capacity"
};

export const LEGACY_VALUE_NAMES = {
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

export const LEGACY_VALUE_NAMES_BY_COLUMN = {
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

/* ------------------------------------------------------------
   IDS AND RECORD SCAFFOLDING
   ------------------------------------------------------------ */
export function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function makeColumnId(name) {
  return `${slugify(name) || "column"}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeValueId(text) {
  return `${slugify(text) || "value"}-${Math.random().toString(36).slice(2, 8)}`;
}

export function blankColumnExtras() {
  return {
    ...Object.fromEntries(COLUMN_EXTRA_FIELDS.map(([k]) => [k, ""])),
    sourceType: "custom",
    hasCustomEdits: true,
    lastEditedAt: "",
    lastEditedBy: ""
  };
}

export function blankValueExtras() {
  return {
    ...Object.fromEntries(VALUE_EXTRA_FIELDS.map(([k]) => [k, ""])),
    sourceType: "custom",
    hasCustomEdits: true,
    lastEditedAt: "",
    lastEditedBy: ""
  };
}

export function makeCell(text = "") {
  return { id: makeValueId(text), text, shortDescription: "", detailedDescription: "", example: "", ...blankValueExtras() };
}

function starterFor(columnId, text) {
  return (VALUE_STARTERS[columnId] || {})[text] || { short: "", detailed: "", example: "" };
}

/* Builds a full v3 cell from a bare v1/v2 string value. */
export function upgradeCell(text, columnId) {
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

/* ------------------------------------------------------------
   SCHEMA VALIDATORS — explicit structure detection. Old data is
   recognized by SHAPE + version number, never by a visible name
   happening to match a historical label.
   ------------------------------------------------------------ */
export function isValidV3(data) {
  return (
    data && data.schemaVersion === 3 &&
    Array.isArray(data.columns) && data.columns.length > 0 &&
    data.columns.every((c) => c && typeof c.id === "string" && typeof c.name === "string") &&
    Array.isArray(data.rows) &&
    data.rows.every((row) => Array.isArray(row) && row.length === data.columns.length &&
      row.every((cell) => cell && typeof cell.id === "string" && typeof cell.text === "string"))
  );
}

export function isValidV2(data) {
  return (
    data && data.schemaVersion === 2 &&
    Array.isArray(data.columns) && data.columns.length > 0 &&
    data.columns.every((c) => c && typeof c.id === "string" && typeof c.name === "string") &&
    Array.isArray(data.rows) &&
    data.rows.every((row) => Array.isArray(row) && row.length === data.columns.length &&
      row.every((cell) => typeof cell === "string"))
  );
}

export function isValidV1(data) {
  return (
    data && Array.isArray(data.columns) && data.columns.length > 0 &&
    data.columns.every((c) => typeof c === "string") &&
    Array.isArray(data.rows) &&
    data.rows.every((row) => Array.isArray(row) && row.length === data.columns.length &&
      row.every((cell) => typeof cell === "string"))
  );
}

/* ------------------------------------------------------------
   MIGRATION-ONLY HELPERS
   ------------------------------------------------------------ */

/* Restores the canonical manuscript column order. Migration-only:
   a current-schema document's order is administrator-controlled
   and authoritative, so hydration never calls this. */
export function reorderKnownDefaultColumns(data) {
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

/* One-time content migration for data just upgraded from v1/v2:
   historical default names become their canonical replacements,
   canonical column order is restored, and never-customized
   records are refreshed from the shipped defaults. Idempotent —
   running it twice produces the same result — and stamped with
   contentMigrationVersion so a saved result never re-enters it. */
function applyLegacyContentMigration(data) {
  data = reorderKnownDefaultColumns(data);
  const defaults = buildDefaultTaxonomy();
  const defaultsByColumnId = Object.fromEntries(defaults.columns.map((c, i) => [c.id, { col: c, index: i }]));

  data.columns.forEach((c) => {
    c.name = LEGACY_COLUMN_NAMES[c.name] || c.name;
    const def = defaultsByColumnId[c.id]?.col;
    if (def && !c.hasCustomEdits) {
      Object.assign(c, structuredClone(def), { id: c.id });
    }
  });
  data.rows.forEach((row, rowIndex) =>
    row.forEach((cell, cIndex) => {
      const colId = data.columns[cIndex]?.id;
      cell.text = LEGACY_VALUE_NAMES_BY_COLUMN[colId]?.[cell.text] || LEGACY_VALUE_NAMES[cell.text] || cell.text;
      const defMeta = defaultsByColumnId[colId];
      const defCell = defMeta && rowIndex < defaults.rows.length ? defaults.rows[rowIndex][defMeta.index] : null;
      if (defCell && !cell.hasCustomEdits) {
        Object.assign(cell, structuredClone(defCell), { id: cell.id });
      }
    })
  );
  data.contentMigrationVersion = CONTENT_MIGRATION_VERSION;
  return hydrateTaxonomy(data);
}

/* ------------------------------------------------------------
   HYDRATION — current-schema (v3) data on every load
   ------------------------------------------------------------ */

/* Copies a default record's value into a record ONLY for fields
   the record does not have at all (undefined/null). Existing
   values — including empty strings the admin saved — win. */
function fillAbsentFields(rec, def, protectedKeys) {
  if (!def) return;
  Object.keys(def).forEach((k) => {
    if (protectedKeys.includes(k)) return;
    if (rec[k] === undefined || rec[k] === null) rec[k] = structuredClone(def[k]);
  });
}

/* Shape repair for CURRENT data. Adds truly missing fields (so a
   document saved before a field existed gains it), mints ids
   where absent, coerces metadata types — and changes nothing
   else. Names, descriptions, ordering, and all visible text are
   preserved exactly, regardless of hasCustomEdits. */
export function hydrateTaxonomy(data) {
  const defaults = buildDefaultTaxonomy();
  const defaultsByColumnId = Object.fromEntries(defaults.columns.map((c, i) => [c.id, { col: c, index: i }]));

  data.schemaVersion = SCHEMA_VERSION;
  if (typeof data.contentMigrationVersion !== "number") {
    // v3 data predating this field is already-current content.
    data.contentMigrationVersion = CONTENT_MIGRATION_VERSION;
  }

  data.columns.forEach((c) => {
    if (typeof c.id !== "string" || !c.id) c.id = makeColumnId(c.name || "column");
    if (typeof c.name !== "string") c.name = "Untitled";
    fillAbsentFields(c, defaultsByColumnId[c.id]?.col, ["id", "name"]);
    c.shortDescription = c.shortDescription ?? "";
    c.detailedDescription = c.detailedDescription ?? "";
    c.example = c.example ?? "";
    COLUMN_EXTRA_FIELDS.forEach(([k]) => { c[k] = c[k] ?? ""; });
    c.sourceType = c.sourceType || "custom";
    c.hasCustomEdits = !!c.hasCustomEdits;
    c.lastEditedAt = c.lastEditedAt || "";
    c.lastEditedBy = c.lastEditedBy || "";
  });
  data.rows.forEach((row, rowIndex) =>
    row.forEach((cell, cIndex) => {
      if (typeof cell.id !== "string" || !cell.id) cell.id = makeValueId(cell.text || "");
      if (typeof cell.text !== "string") cell.text = "";
      const defMeta = defaultsByColumnId[data.columns[cIndex]?.id];
      const defCell = defMeta && rowIndex < defaults.rows.length ? defaults.rows[rowIndex][defMeta.index] : null;
      fillAbsentFields(cell, defCell, ["id", "text"]);
      cell.shortDescription = cell.shortDescription ?? "";
      cell.detailedDescription = cell.detailedDescription ?? "";
      cell.example = cell.example ?? "";
      VALUE_EXTRA_FIELDS.forEach(([k]) => { cell[k] = cell[k] ?? ""; });
      cell.sourceType = cell.sourceType || "custom";
      cell.hasCustomEdits = !!cell.hasCustomEdits;
      cell.lastEditedAt = cell.lastEditedAt || "";
      cell.lastEditedBy = cell.lastEditedBy || "";
    })
  );
  return data;
}

/* ------------------------------------------------------------
   ENTRY POINT — accepts v3, v2, or v1 shapes and returns v3.
   v3 → hydration only (authoritative content, preserved exactly).
   v2/v1 → structural upgrade + one-time legacy content migration.
   Anything else → null.
   ------------------------------------------------------------ */
export function normalizeTaxonomy(data) {
  if (isValidV3(data)) return hydrateTaxonomy(data);

  if (isValidV2(data)) {
    return applyLegacyContentMigration({
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
    return applyLegacyContentMigration({
      schemaVersion: 3,
      columns,
      rows: data.rows.map((row) => row.map((text, c) => upgradeCell(text, columns[c].id)))
    });
  }

  return null;
}

/* ------------------------------------------------------------
   CLOUD (Firestore) DOCUMENT SHAPE
   Columns carry their values inline; rowCount preserves empty
   trailing rows. Round-trips byte-identical visible content.
   ------------------------------------------------------------ */
export function serializeTaxonomy(taxonomy) {
  return {
    schemaVersion: SCHEMA_VERSION,
    contentMigrationVersion: taxonomy.contentMigrationVersion ?? CONTENT_MIGRATION_VERSION,
    columns: taxonomy.columns.map((col, c) => ({
      ...col,                                              // includes manuscript fields
      values: taxonomy.rows.map((row) => ({ ...row[c] }))
    })),
    rowCount: taxonomy.rows.length
  };
}

export function deserializeCloudTaxonomy(data) {
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
  const tax = {
    schemaVersion: 3,
    contentMigrationVersion: typeof data.contentMigrationVersion === "number" ? data.contentMigrationVersion : undefined,
    columns,
    rows
  };
  // The cloud document is always current-schema data: hydrate
  // only. It must never pass through legacy-name migration.
  return isValidV3(tax) ? hydrateTaxonomy(tax) : null;
}
