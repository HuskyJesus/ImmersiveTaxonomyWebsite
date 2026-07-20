/* ============================================================
   TAXONOMY MODEL TEST SUITE
   Runs in the browser: open test/tests.html from any static
   server at the repo root (e.g. `python3 -m http.server`).
   No framework — a tiny assert harness with deep equality.
   ============================================================ */

import {
  CONTENT_MIGRATION_VERSION,
  LEGACY_COLUMN_NAMES, LEGACY_VALUE_NAMES, LEGACY_VALUE_NAMES_BY_COLUMN,
  normalizeTaxonomy, hydrateTaxonomy, serializeTaxonomy, deserializeCloudTaxonomy,
  isValidV3
} from "../taxonomy-model.js?v=20260720-migration1";
import { buildDefaultTaxonomy } from "../starter-content.js?v=20260716-ixd2";

const results = [];
function test(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (err) { results.push({ name, ok: false, error: String(err && err.message || err) }); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function deepEqual(a, b, path = "$") {
  if (a === b) return;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
    throw new Error(`${path}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) deepEqual(a[k], b[k], `${path}.${k}`);
}
const clone = (o) => structuredClone(o);

/* --- fixtures ------------------------------------------------ */

/* A current-schema taxonomy whose visible names deliberately
   collide with historical legacy labels, plus arbitrary names. */
function currentTaxonomyWithLegacyLookalikes() {
  const cell = (id, text, extra = {}) => ({
    id, text,
    shortDescription: "custom short " + text,
    detailedDescription: "custom detail " + text,
    example: "custom example " + text,
    participantRole: "role " + text,
    designerResponsibility: "resp " + text,
    useCases: "uses " + text,
    cautions: "care " + text,
    source: "src",
    keywords: "kw",
    sourceType: "custom",
    hasCustomEdits: true,
    lastEditedAt: "2026-07-01T00:00:00.000Z",
    lastEditedBy: "qN6weHvgweP171ka6dLtrOIU4203",
    ...extra
  });
  const col = (id, name, extra = {}) => ({
    id, name,
    shortDescription: "col short " + name,
    detailedDescription: "col detail " + name,
    example: "",
    subtitle: "sub " + name,
    designQuestion: "q?", whyItMatters: "matters", useCases: "u", cautions: "c",
    progression: "p", source: "s",
    sourceType: "custom", hasCustomEdits: true,
    lastEditedAt: "2026-07-01T00:00:00.000Z", lastEditedBy: "qN6weHvgweP171ka6dLtrOIU4203",
    ...extra
  });
  return {
    schemaVersion: 3,
    contentMigrationVersion: CONTENT_MIGRATION_VERSION,
    columns: [
      col("motivation", "Motivation"),   // renamed FROM Gamification
      col("tech", "Tech"),
      col("learning", "Learning"),
      col("custom-abc123", "jbsfa")      // arbitrary custom column
    ],
    rows: [
      [cell("motivation-r0", "Observer"), cell("tech-r0", "AR"), cell("learning-r0", "Challenge"), cell("x1", "VR")],
      [cell("motivation-r1", "zzcustom"), cell("tech-r1", "2D"), cell("learning-r1", "In-session"), cell("x2", "qwerty")]
    ]
  };
}

/* --- 1–9: current-schema names survive loading --------------- */

test("current-schema legacy-lookalike names survive hydration exactly (deep equal)", () => {
  const input = currentTaxonomyWithLegacyLookalikes();
  const out = normalizeTaxonomy(clone(input));
  deepEqual(out, input);
});

["Motivation", "Tech", "Learning"].forEach((name, i) => {
  test(`current-schema category "${name}" remains "${name}"`, () => {
    const out = normalizeTaxonomy(clone(currentTaxonomyWithLegacyLookalikes()));
    assert(out.columns[i].name === name, `got ${out.columns[i].name}`);
  });
});

[["Observer", 0, 0], ["Challenge", 0, 2], ["AR", 0, 1], ["VR", 0, 3]].forEach(([name, r, c]) => {
  test(`current-schema element "${name}" remains "${name}"`, () => {
    const out = normalizeTaxonomy(clone(currentTaxonomyWithLegacyLookalikes()));
    assert(out.rows[r][c].text === name, `got ${out.rows[r][c].text}`);
  });
});

test("every legacy-map key survives when used intentionally in current data", () => {
  const names = [
    ...Object.keys(LEGACY_COLUMN_NAMES),
    ...Object.keys(LEGACY_VALUE_NAMES),
    ...Object.values(LEGACY_VALUE_NAMES_BY_COLUMN).flatMap((m) => Object.keys(m))
  ];
  const columns = names.map((n, i) => ({
    id: `col-${i}`, name: n, shortDescription: "", detailedDescription: "", example: "",
    sourceType: "custom", hasCustomEdits: false, lastEditedAt: "", lastEditedBy: ""
  }));
  const rows = [names.map((n, i) => ({
    id: `cell-${i}`, text: n, shortDescription: "", detailedDescription: "", example: "",
    sourceType: "custom", hasCustomEdits: false, lastEditedAt: "", lastEditedBy: ""
  }))];
  const out = normalizeTaxonomy({ schemaVersion: 3, columns: clone(columns), rows: clone(rows) });
  names.forEach((n, i) => {
    assert(out.columns[i].name === n, `column "${n}" became "${out.columns[i].name}"`);
    assert(out.rows[0][i].text === n, `element "${n}" became "${out.rows[0][i].text}"`);
  });
});

test("arbitrary custom names remain unchanged", () => {
  const out = normalizeTaxonomy(clone(currentTaxonomyWithLegacyLookalikes()));
  assert(out.columns[3].name === "jbsfa");
  assert(out.rows[1][0].text === "zzcustom");
  assert(out.rows[1][3].text === "qwerty");
});

/* --- 10–12: hasCustomEdits must not gate preservation -------- */

test("current data WITHOUT hasCustomEdits keeps names/descriptions (not replaced by defaults)", () => {
  const defaults = buildDefaultTaxonomy();
  const input = clone(defaults);
  // simulate an older current doc: default ids, edited text, NO hasCustomEdits flag
  input.columns[0].name = "Renamed Dimension";
  delete input.columns[0].hasCustomEdits;
  input.rows[0][0].text = "Renamed Element";
  input.rows[0][0].shortDescription = "my own words";
  delete input.rows[0][0].hasCustomEdits;
  const out = normalizeTaxonomy(clone(input));
  assert(out.columns[0].name === "Renamed Dimension", `got ${out.columns[0].name}`);
  assert(out.rows[0][0].text === "Renamed Element", `got ${out.rows[0][0].text}`);
  assert(out.rows[0][0].shortDescription === "my own words", `got ${out.rows[0][0].shortDescription}`);
  assert(out.columns[0].hasCustomEdits === false && out.rows[0][0].hasCustomEdits === false);
});

test("current custom descriptions, examples and expanded fields remain unchanged", () => {
  const input = currentTaxonomyWithLegacyLookalikes();
  const out = normalizeTaxonomy(clone(input));
  const c = out.rows[0][0];
  deepEqual(
    { d: c.detailedDescription, e: c.example, pr: c.participantRole, dr: c.designerResponsibility, u: c.useCases, ca: c.cautions },
    { d: "custom detail Observer", e: "custom example Observer", pr: "role Observer", dr: "resp Observer", u: "uses Observer", ca: "care Observer" }
  );
});

test("hydration fills absent fields without touching present ones (empty string preserved)", () => {
  const input = clone(currentTaxonomyWithLegacyLookalikes());
  delete input.columns[0].designQuestion;      // absent → filled
  input.columns[0].whyItMatters = "";          // present-but-empty → kept empty
  const out = normalizeTaxonomy(input);
  assert(typeof out.columns[0].designQuestion === "string");
  assert(out.columns[0].whyItMatters === "");
});

/* --- 13–15: round trips -------------------------------------- */

test("current-schema JSON import path (normalizeTaxonomy) preserves exact content", () => {
  const input = currentTaxonomyWithLegacyLookalikes();
  deepEqual(normalizeTaxonomy(JSON.parse(JSON.stringify(input))), input);
});

test("Firestore serialize → deserialize preserves exact content incl. versions", () => {
  const input = currentTaxonomyWithLegacyLookalikes();
  const doc = serializeTaxonomy(clone(input));
  assert(doc.schemaVersion === 3 && doc.contentMigrationVersion === CONTENT_MIGRATION_VERSION);
  const out = deserializeCloudTaxonomy(JSON.parse(JSON.stringify(doc)));
  deepEqual(out, input);
});

test("localStorage-style JSON round trip preserves exact content", () => {
  const input = currentTaxonomyWithLegacyLookalikes();
  const stored = JSON.stringify({ taxonomy: input, cloudRevision: 1, dirty: false });
  const out = normalizeTaxonomy(JSON.parse(stored).taxonomy);
  deepEqual(out, input);
});

/* --- 16–17: stable ids --------------------------------------- */

test("stable ids are unchanged by renaming and by loading", () => {
  const input = currentTaxonomyWithLegacyLookalikes();
  const out = normalizeTaxonomy(clone(input));
  assert(out.columns[0].id === "motivation");           // renamed to "Motivation", id untouched
  assert(out.rows[0][0].id === "motivation-r0");
});

test("saved-experience style selections keep resolving by stable id after a rename", () => {
  const tax = normalizeTaxonomy(clone(currentTaxonomyWithLegacyLookalikes()));
  const selection = { columnId: "motivation", valueId: "motivation-r0" };
  tax.columns[0].name = "Something Entirely New";
  tax.rows[0][0].text = "New Element Name";
  const reloaded = normalizeTaxonomy(clone(tax));
  const col = reloaded.columns.find((c) => c.id === selection.columnId);
  assert(col && col.name === "Something Entirely New");
  const ci = reloaded.columns.indexOf(col);
  const cell = reloaded.rows.map((r) => r[ci]).find((v) => v.id === selection.valueId);
  assert(cell && cell.text === "New Element Name");
});

/* --- 18–22: genuine legacy migration ------------------------- */

test("genuine v1 data migrates to v3 with canonical names and version stamp", () => {
  const v1 = {
    columns: ["Motivation", "Tech", "Learning"],
    rows: [["Observer", "AR", "Challenge"], ["None", "VR", "Basic Mechanics"]]
  };
  const out = normalizeTaxonomy(clone(v1));
  assert(isValidV3(out));
  assert(out.contentMigrationVersion === CONTENT_MIGRATION_VERSION);
  const names = out.columns.map((c) => c.name);
  assert(names.includes("Gamification") && names.includes("Immersive Technology") && names.includes("Didactic Capacity"),
    `got ${names.join(", ")}`);
  const texts = out.rows.flat().map((c) => c.text);
  assert(texts.includes("Watcher") && texts.includes("Augmented Reality (AR)") &&
         texts.includes("Virtual Reality (VR)") && texts.includes("External Process") &&
         texts.includes("Instruction"), `got ${texts.join(" | ")}`);
});

test("genuine v2 data migrates to v3 with canonical names", () => {
  const v2 = {
    schemaVersion: 2,
    columns: [
      { id: "motivation", name: "Motivation" },
      { id: "tech", name: "Tech" }
    ],
    rows: [["Observer", "2D"], ["In-session", "XR"]]
  };
  const out = normalizeTaxonomy(clone(v2));
  assert(isValidV3(out) && out.contentMigrationVersion === CONTENT_MIGRATION_VERSION);
  const names = out.columns.map((c) => c.name);
  assert(names.includes("Gamification") && names.includes("Immersive Technology"), names.join(","));
  const texts = out.rows.flat().map((c) => c.text);
  assert(texts.includes("360° Media") && texts.includes("XR (Extended/Cross Reality)") && texts.includes("In-Game"),
    texts.join(" | "));
});

test("migration is idempotent: migrating twice equals migrating once", () => {
  const v2 = {
    schemaVersion: 2,
    columns: [{ id: "motivation", name: "Motivation" }],
    rows: [["Observer"], ["None"]]
  };
  const once = normalizeTaxonomy(clone(v2));
  const twice = normalizeTaxonomy(clone(once));
  deepEqual(twice, once);
});

test("saving and reloading migrated data does not migrate it again (cloud round trip)", () => {
  const migrated = normalizeTaxonomy({
    schemaVersion: 2,
    columns: [{ id: "motivation", name: "Motivation" }],
    rows: [["Observer"]]
  });
  // Admin now renames it back to a legacy label on purpose:
  migrated.columns[0].name = "Motivation";
  migrated.rows[0][0].text = "Observer";
  const reloaded = deserializeCloudTaxonomy(JSON.parse(JSON.stringify(serializeTaxonomy(migrated))));
  assert(reloaded.columns[0].name === "Motivation", `got ${reloaded.columns[0].name}`);
  assert(reloaded.rows[0][0].text === "Observer", `got ${reloaded.rows[0][0].text}`);
  assert(reloaded.contentMigrationVersion === CONTENT_MIGRATION_VERSION);
});

/* --- 23: restore default is intentional ---------------------- */

test("buildDefaultTaxonomy (Restore Default) yields canonical names, hydration keeps them", () => {
  const out = hydrateTaxonomy(buildDefaultTaxonomy());
  const names = out.columns.map((c) => c.name);
  assert(names.includes("Gamification"), names.join(","));
  deepEqual(normalizeTaxonomy(clone(out)).columns.map((c) => c.name), names);
});

/* --- 24–25: ordering ----------------------------------------- */

test("current taxonomy column order survives a normal load", () => {
  const input = clone(currentTaxonomyWithLegacyLookalikes());
  // Admin-controlled order: reversed from canonical
  const order = [3, 2, 1, 0];
  input.columns = order.map((i) => input.columns[i]);
  input.rows = input.rows.map((r) => order.map((i) => r[i]));
  const out = normalizeTaxonomy(clone(input));
  deepEqual(out.columns.map((c) => c.id), input.columns.map((c) => c.id));
});

test("old (v2) data is reordered to canonical order during migration", () => {
  const defaults = buildDefaultTaxonomy();
  const canonicalIds = defaults.columns.map((c) => c.id);
  const shuffled = [...canonicalIds].reverse();
  const v2 = {
    schemaVersion: 2,
    columns: shuffled.map((id) => ({ id, name: id })),
    rows: [shuffled.map(() => "x")]
  };
  const out = normalizeTaxonomy(clone(v2));
  deepEqual(out.columns.map((c) => c.id), canonicalIds);
});

/* --- report -------------------------------------------------- */
export function report() {
  const failed = results.filter((r) => !r.ok);
  const summary = `${results.length - failed.length}/${results.length} passed` +
    (failed.length ? `, ${failed.length} FAILED` : "");
  console.log("TAXONOMY TESTS:", summary);
  failed.forEach((f) => console.error("FAIL:", f.name, "—", f.error));
  window.__TEST_RESULTS = { summary, results, failed };
  return { summary, results, failed };
}
