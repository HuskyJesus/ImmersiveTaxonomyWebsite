# Immersive Experience Design Taxonomy

An interactive design framework for immersive experience design — a static site built with plain HTML, CSS, and JavaScript, hosted on GitHub Pages, with optional cloud saving through Firebase.

**Live site:** https://huskyjesus.github.io/ImmersiveTaxonomyWebsite/

Each **column** of the taxonomy is a *design dimension* (Interactivity, Embodiment, Story, Tech, …) and each cell is one possibility within it. Click any column heading (the ⓘ) to read what that dimension means.

## Using the site

### 💡 Design Ideas mode (everyone)

- **Click cells** to choose design elements; **click column headings** for their descriptions.
- **Randomize Selection** builds a complete design recipe — exactly one cell from every column.
- **🔒 Lock Selection** protects your picks (shown in green); Randomize fills only the unlocked dimensions.
- **✨ Generate Full Experience / 💡 Generate Inspiration / 🔁 Regenerate** turn a topic plus your selections into an experience concept. The generator is rule-based and runs entirely in the browser.

### ✨ Inspiration mode (everyone)

Rolls a complete experience recipe — one value per dimension, shown as cards. 🔄 rerolls one card, 🔓/🔒 locks it, 🎲 New Recipe rerolls the rest. Enter a topic and generate.

### ✏️ Edit mode (administrators)

Visible after signing in via the **Admin sign in** link in the footer (or always, in local mode — see below):

- Edit any cell or column name in place; **✎** beside a column name opens the full category editor (name, short description, detailed description, example) with Save/Cancel.
- Add or delete rows and columns. Deleting a column asks for confirmation because its description goes with it. Every column has a stable internal ID, so renaming never loses a description.
- **Changes save automatically** about a second after you stop typing. The status line shows *Saving… / All changes saved / Save failed / Offline changes pending*, plus a *Last saved* time. **Save Now** forces a save; **Retry Save** appears if one fails.
- **Backup Tools (advanced)** holds JSON export/import (with validation and a confirmation preview), **Restore Last Cloud Version**, and Reset to Default. None of this is needed for everyday editing.

The starter category descriptions are **editable placeholder content**, not final academic definitions — edit them freely in the site (or in `DEFAULT_COLUMNS` in `script.js`).

## The two operating modes

1. **Local mode (out of the box).** Until Firebase is configured, everything works exactly like a local app: anyone can open Edit mode, and changes save to that browser's localStorage only. Good for trying the site out.
2. **Cloud mode (after Firebase setup).** The taxonomy is published in Cloud Firestore. Every visitor sees the same published version. Edit mode is hidden until an administrator signs in; admin edits autosave to the cloud. localStorage remains as an offline cache and crash-safety net — if the connection drops, edits are kept locally and flagged as *pending* until an admin saves them.

Load priority: Firestore → local cache → built-in default. If a browser holds unsaved local edits when a (newer) cloud version exists, the site asks whether to keep or discard them — it never silently overwrites either side.

## Firebase setup (one-time, ~15 minutes)

Cloud saving needs a free Firebase project. **No code changes are required beyond pasting six values into one file.**

### 1. Create the Firebase project

1. Go to https://console.firebase.google.com and sign in with a Google account.
2. Click **Add project**, name it (e.g. `immersive-taxonomy`), and create it. Google Analytics can be off.

### 2. Enable Cloud Firestore

1. In the left sidebar: **Build → Firestore Database → Create database**.
2. Choose a location near you, and start in **production mode** (we'll paste real rules next).

### 3. Paste the security rules

1. In Firestore, open the **Rules** tab.
2. Replace everything with the contents of [`firestore.rules`](firestore.rules) from this repository.
3. Leave `PASTE_ADMIN_UID_HERE` for now — you'll fill it in at step 5. Click **Publish**.

### 4. Enable email/password sign-in and create the admin account

1. **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable **Email/Password** (just the first toggle).
3. Under the **Users** tab, click **Add user** and create the administrator account (e.g. your father's email plus a strong password). This is the only account that will ever be needed.

### 5. Put the admin UID into the rules

1. Still in **Authentication → Users**, copy the value in the **User UID** column for the account you just created.
2. Go back to **Firestore Database → Rules** and replace `PASTE_ADMIN_UID_HERE` with that UID (keep the quotes), e.g. `["a1B2c3D4e5F6..."]`. Click **Publish**.

Creating a Firebase account does **not** grant edit access — only UIDs in this list can write.

### 6. Add the web configuration to the site

1. **Project settings** (gear icon) → **General** → under *Your apps* click the web icon (`</>`), register an app (any nickname, no hosting needed).
2. Firebase shows a `firebaseConfig` object. Copy its six values into [`firebase-config.js`](firebase-config.js) in this repository, replacing each `PASTE_...` string.
3. These values are safe to publish — security comes from Authentication + the rules, not from hiding the config.

### 7. Deploy the updated site

Commit and push `firebase-config.js` (and any other changes) to the `main` branch — GitHub Pages redeploys automatically in about a minute. (Uploading the edited file through the GitHub website works too: open the file → pencil icon → paste → Commit.)

### 8. Test both access levels

- **Public:** open the site in a private/incognito window. You should see Design Ideas and Inspiration but **no Edit tab**. Everything read-only works.
- **Admin:** click **Admin sign in** in the footer, sign in with the account from step 4, and the Edit tab appears. Make a small edit — the status should show *Saving…* then *All changes saved* with a timestamp. Your first save creates the published `taxonomy/current` document; refresh the incognito window to confirm the public site shows the change.

## Data model

Firestore holds one document, `taxonomy/current`:

```
{
  schemaVersion: 2,
  columns: [
    {
      id: "interactivity",          // stable — survives renames
      name: "Interactivity",
      shortDescription: "...",
      detailedDescription: "...",
      example: "...",
      values: ["Passive", "Interactive", ...]   // this column's cells, top to bottom
    },
    ...
  ],
  rowCount: 5,
  updatedAt: <server timestamp>,
  updatedBy: <admin uid>
}
```

(Cell values are stored per-column because Firestore doesn't allow arrays nested directly inside arrays.) The same structure, minus timestamps, is what JSON export produces and import accepts — old exports from the previous version are migrated automatically.

## Project structure

| File | Purpose |
|---|---|
| `index.html` | Page structure, dialogs (description viewer/editor, admin sign-in) |
| `styles.css` | All styling — theme variables at the top |
| `script.js` | All logic — data model, rendering, generator, cloud sync |
| `firebase-config.js` | **The only file to edit for cloud setup** — paste your Firebase web config |
| `firestore.rules` | Firestore security rules (public read, admin-allowlist write) |

Version 2.0
