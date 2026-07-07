# Immersive Experience Design Taxonomy

An interactive design framework for immersive experience design — built as a static site with plain HTML, CSS, and JavaScript. It runs entirely in the browser: no server, no build step, no accounts, no APIs.

**Live site (once GitHub Pages is enabled):** https://huskyjesus.github.io/ImmersiveTaxonomyWebsite/

Each **column** of the taxonomy is a *design dimension* of an immersive experience (Interactivity, Embodiment, Story, Tech, …) and each cell is one possibility within that dimension. The site has three modes:

## ✏️ Edit Mode

The taxonomy is fully editable:

- **Edit any cell or column header** — click into it and type. Changes save automatically to your browser's localStorage.
- **+ Add Row / + Add Column** — extend the framework.
- **× buttons** — delete a column (in its header) or a row (at the row's right edge).
- **Save** — forces a save and shows confirmation (edits also auto-save).
- **Export JSON** — downloads the current taxonomy as `taxonomy.json`.
- **Import JSON** — loads a taxonomy from a JSON file (format below).
- **Reset to Default** — restores the built-in starter taxonomy.

> localStorage is per-browser, per-device. Use **Export JSON** to back up a taxonomy or move it between machines.

## 💡 Design Ideas Mode

The framework becomes selectable:

- **Click cells** to select design elements (they highlight).
- **Topic box** — enter any subject: "cooking", "video games", "creative writing within non-fiction", "history of the Civil War"…
- **✨ Generate Full Experience** — a complete design concept: Experience Title, Pitch, Audience & Role, Experience Flow, Interaction Model, Immersion Strategy, Learning & Emotional Goal, Data & Personalization, Technology Fit, Design Rationale (naming both the dimension and the value for every chosen element), and an Optional Expansion.
- **💡 Generate Inspiration** — a shorter, brainstorm-style card: pitch + a few sparks to riff on.
- **🔁 Regenerate** — keeps the same selections and topic but produces a new variation.
- **Randomize Selection** — builds a complete design recipe: exactly one cell from every column, never two from the same dimension.
- **🔒 Lock Selection** — protects your current picks (shown in green); Randomize then fills only the unlocked dimensions. If a column has multiple selected cells, locking keeps the first — a recipe needs one value per dimension.
- **🎲 Generate From Random Path** — fills a complete recipe (respecting locks) and generates immediately.
- **Clear Selection** — resets the board and locks.

## ✨ Inspiration Mode

A brainstorming tool for workshops and teaching:

- The site rolls a complete **experience recipe** — one value from every dimension, shown as a board of cards.
- **🔄** on a card rerolls just that dimension; **🔓/🔒** locks it (e.g. *always VR*, *always Group*) so **🎲 New Recipe** keeps it while randomizing the rest.
- Enter a topic ("Ancient Egypt", "Cooking"…) and generate a Full Experience or a quick Inspiration from the recipe.

## How the generator works

The generator is rule-based and runs entirely locally — no API, no internet connection, no cost:

- Every **column** has a defined design role (Interactivity → what participants do, Data → personalization/tracking, Tech → platform assumptions, …) and every **default value** has a short interpretation (e.g. *Problem Solving* → "participants solve puzzles and challenges to move forward"; *AR* → "digital content overlaid onto the real world"). These live in `INTERPRETATIONS` and `COLUMN_ROLES` in `script.js`.
- A small **topic analyzer** matches your topic against domain profiles (cooking, games, writing, history, science, art) and pulls fitting vocabulary — a history topic gets primary sources and pivotal decisions; a cooking topic gets ingredients and plating. Unmatched topics use a general-purpose profile. Add your own profiles in `DOMAIN_PROFILES`.
- Sentence templates are randomized, so **Regenerate** produces a fresh variation from the same ingredients.
- Custom columns and values still work — they get generic wording until you add interpretations for them.

## Deploying to GitHub Pages

1. Push this repository to GitHub (it's already just static files — nothing to build).
2. On github.com, open the repository and go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to "Deploy from a branch", choose the `main` branch and the `/ (root)` folder, then click **Save**.
4. After a minute or two the site is live at `https://<your-username>.github.io/ImmersiveTaxonomyWebsite/`.

Every push to `main` updates the live site automatically.

## Replacing the starter taxonomy

**Option A — no code editing (per browser):** use Edit Mode directly, or **Import JSON** with a file shaped like this:

```json
{
  "columns": ["Interactivity", "Embodiment", "Tech"],
  "rows": [
    ["Passive", "Detached", "none"],
    ["Interactive", "Observer", "2D"]
  ]
}
```

Every row must have exactly one entry per column (use `""` for empty cells).

**Option B — change the built-in default (for everyone):** edit the `DEFAULT_TAXONOMY` object at the top of `script.js` (same shape as the JSON above). This changes what "Reset to Default" restores and what new visitors see. Optionally update `COLUMN_MEANINGS` (same file) so the idea generator describes new dimensions nicely — unknown columns still work with generic wording.

## Project structure

| File | Purpose |
|---|---|
| `index.html` | Page structure: header, hero, mode panels, workspace, report card, footer |
| `styles.css` | All styling — the theme lives in CSS variables at the top of the file |
| `script.js` | All logic — data, rendering, the three modes, and the idea generator |

Version 1.0
