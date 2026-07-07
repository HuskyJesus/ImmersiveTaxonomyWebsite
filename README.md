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
- **✨ Generate Experience Idea** — combines your topic with the selected elements into a full report card: Experience Title, Summary, Audience, Environment, Interaction, Learning Goal, Technology, Design Rationale (naming both the dimension and the value for every chosen element), and an Optional Expansion idea.
- **🎲 Generate From Random Path** — selects one cell from *every* column and generates immediately.
- **Randomize Selection / Clear Selection** — quick ways to reset the board.

## ✨ Inspiration Mode

A brainstorming tool for workshops and teaching:

- The site rolls a complete **experience recipe** — one value from every dimension, shown as a board of cards.
- **🔄** on a card rerolls just that dimension; **🔓/🔒** locks it (e.g. *always VR*, *always Group*) so **🎲 New Recipe** keeps it while randomizing the rest.
- Enter a topic ("Ancient Egypt", "Cooking"…) and **✨ Generate Experience Idea** turns the recipe into a fleshed-out concept.

The generator is template-based and runs locally — no API, no internet connection, no cost.

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
