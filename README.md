# IXD — Immersive Experience Design Taxonomy

A guided design methodology for immersive experiences — a static site built with plain HTML, CSS, and JavaScript, with Firebase for accounts, cloud saving, and per-user experience libraries. All URLs are relative, so the site works on GitHub Pages or any custom domain.

**Live site:** https://immersiveexperiencedesign.org/

Each **column** of the taxonomy is one *design decision* (Interactivity, Embodiment, Story, Tech, …) and each cell is one **value** within it. Both columns and values have descriptions — click a column heading or the i beside any value to read them, or use the search bar to find anything by name, description, or example.

## Access levels

| | Public visitor | Signed-in user | Administrator |
|---|---|---|---|
| Explore, read descriptions, search | ✓ | ✓ | ✓ |
| Select cells, randomize, generate | ✓ | ✓ | ✓ |
| Save experiences to a personal library | | ✓ | ✓ |
| Edit the taxonomy + descriptions | | | ✓ |

Administrators are fixed by a UID allowlist in [`firestore.rules`](firestore.rules) — creating an account never grants edit access, and nothing a user can write is consulted for authorization, so self-promotion is impossible.

## Using the site

### Accounts (header, upper right)

- **Sign Up** — display name, email, password (+ confirmation). Registration signs you in automatically and creates your profile.
- **Sign In / Forgot password?** — standard email/password sign-in with password-reset emails.
- Signed in, your name appears in the header with a menu: **Saved Experiences** and **Sign Out**.

### The guided workflow (everyone)

The homepage walks visitors through one linear process:

1. **Choose your topic** — any subject.
2. **Shape your experience** — pick one value per column (choosing a second value in the same column replaces the first). The **i** beside a value explains it without selecting it; hover tooltips give a one-line preview. **Complete My Selections Randomly** keeps your decisions and fills the rest.
3. **Generate** — the button appears only once a topic exists and at least three dimensions are decided; a status line explains what's missing.
4. **Review and save** — the concept renders as a structured report (pitch, section cards, design rationale, expansion). Actions: **Save Experience**, **Generate New Variation**, **Start Over**.

The generator reads the *descriptions* of the chosen values and their categories — the same editable text in the info dialogs — so ideas are interpreted, not concatenated. See "AI generation" below for the optional AI provider; without one, everything runs locally in the browser.

### Saved Experiences

Search, sort (newest/oldest/title/favorites), and filter your saved experiences. Opening one shows the full concept, its taxonomy selections, notes, and dates. You can rename it, edit notes, favorite it, duplicate it, delete it, **load its selections back into the generator**, or **regenerate a fresh variation from the same recipe** (saving that creates a separate entry).

### Edit Taxonomy (administrators)

Admins get an **Edit Taxonomy** button in the header that switches the grid into editing:

- Edit any cell's text inline; the **✎** inside a cell edits that value's descriptions; **✎** beside a column name edits the category. Save/Cancel with a discard warning.
- Columns **and values** have stable internal IDs — renaming never loses descriptions or breaks saved experiences.
- Add/delete rows and columns (deletions confirm first, since descriptions go with them). New columns and rows get blank description records automatically.
- Changes autosave to the cloud (~1.2 s debounce) with visible status, Save Now, Retry, and Last-saved time. **Backup Tools** holds JSON export/import (validated, confirmed) and Restore Last Cloud Version.

All starter descriptions — for the 10 categories and all 50 values — are **editable placeholder content** in [`starter-content.js`](starter-content.js), not final academic definitions.

## Firestore schema

```
taxonomy/current                        ← the published taxonomy (public read, admin write)
{
  schemaVersion: 3,
  columns: [{
    id, name,                           ← id is stable across renames
    shortDescription, detailedDescription, example,
    values: [{                          ← this column's cells, top to bottom
      id, text,                         ← id is stable across renames
      shortDescription, detailedDescription, example
    }]
  }],
  rowCount, updatedAt, updatedBy
}

users/{uid}                             ← owner-only
{ displayName, email, createdAt, lastLoginAt }   ← never passwords, never roles

users/{uid}/savedExperiences/{id}       ← owner-only
{
  schemaVersion: 1,
  title, topic, kind ("full"|"spark"), notes, favorite,
  selections: [{ columnId, columnName, valueId, valueText }],
  content: { pitch, audience, flow, interaction, immersion,
             goal, dataUse, techFit, rationale[], expansion },   ← structured text, no HTML
  createdAt, updatedAt
}
```

Older data migrates automatically on load: v1/v2 localStorage, v2 cloud documents, and old JSON exports are upgraded to schema 3 — existing IDs are kept, known default values receive starter descriptions, and custom text is never overwritten.

## Security rules summary

[`firestore.rules`](firestore.rules):

- `isAdmin()` — the single admin UID allowlist (currently Father + site maintainer). Edit the list, publish, done.
- `taxonomy/*` — public read; write only via `isAdmin()`.
- `users/{uid}` and `users/{uid}/savedExperiences/*` — full access only for that user (`request.auth.uid == uid`).
- Everything else — denied.

## Firebase setup

Already done for this project (config in [`firebase-config.js`](firebase-config.js)). For a fresh deployment: create a Firebase project, enable **Firestore** and **Email/Password authentication**, paste [`firestore.rules`](firestore.rules) into Firestore → Rules (updating the admin UIDs), and paste the web-app config values into `firebase-config.js`. Push to `main` — GitHub Pages redeploys automatically.

**After every change to `firestore.rules` in this repository, the rules must be re-published in the Firebase Console** (Firestore Database → Rules) — deployments only serve the website, not the rules.

When using a custom domain, add it under **Firebase Console → Authentication → Settings → Authorized domains** so sign-in works there.

## AI generation (optional)

The generator can use an AI provider instead of the built-in local generator. The provider layer ([`ai-provider.js`](ai-provider.js)) is an abstraction: providers implement `isConfigured()` and `generate(context)` and return the same idea shape the local generator produces, so the rest of the app never knows which one ran. OpenAI is implemented; Claude, Gemini, or a local Ollama can be added as new entries.

Configure in [`ai-config.js`](ai-config.js). If no provider is configured — or a request fails — the site falls back to the local generator automatically. **Read the security warning in that file before adding an API key**: keys in a static site are visible to visitors; for production, route through a small proxy and point `baseUrl` at it.

## The walkthrough video

The homepage has a video section with a placeholder. To show your video, set `INTRO_VIDEO_EMBED_URL` near the top of [`script.js`](script.js) to a YouTube or Loom *embed* URL (e.g. `https://www.youtube-nocookie.com/embed/VIDEOID` or `https://www.loom.com/embed/VIDEOID`).

## Project structure

| File | Purpose |
|---|---|
| `index.html` | Page structure + dialogs (info viewer, editor, auth, library) |
| `styles.css` | All styling — theme variables at the top |
| `script.js` | All logic — workflow, data model, cloud sync, auth, library, local generator |
| `starter-content.js` | Default taxonomy + all editable starter descriptions |
| `ai-provider.js` | AI provider abstraction (OpenAI implemented, local fallback) |
| `ai-config.js` | AI provider configuration |
| `firebase-config.js` | Firebase web config |
| `firestore.rules` | Security rules (publish these in the Firebase Console) |

Version 4.0
