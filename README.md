# IXD — Immersive Experience Design Taxonomy

A landing page and flexible design workspace for the immersive experience design taxonomy — a static site built with plain HTML, CSS, and JavaScript, with Firebase for accounts, cloud saving, and per-user experience libraries. All internal paths are relative, so the site works on GitHub Pages, a custom domain, or a local preview without changes.

**Live site:** https://immersiveexperiencedesign.org/

> Based on the immersive experience design taxonomy developed by JJ Ruscella in
> *“Immersion: The New Art Form — A Handbook for the Immersive Experience Designer.”*

## How the site works

The site is three separate pages that share one header (branding left, centered navigation, account controls right) and one authentication system:

- **`index.html` — landing.** A simple welcome ("Hi! Would you like to start designing or learn about the site?") with two choices: **Start Designing** (to the design workspace) and **Learn More** (to the About page). Account controls are always in the header.
- **`design.html` — the design workspace.** The taxonomy table, generation, saved experiences, and admin editing.
- **`about.html` — about.** What the taxonomy is, who it is for, how it is used, and that it is a map of possibilities rather than a score (a higher element is not automatically better; the right choice depends on the experience's purpose). Includes its own **Start Designing** action.

The landing and About pages load only the shared account module (`account.js`), never the taxonomy editor or generator.

### The design workspace

One flexible workspace — not a wizard. Nothing is gated; everything is reachable in any order:

- **Experience Focus** — a compact topic input with a helper sentence and concrete examples (cooking, the history of the Civil War, onboarding new nurses, …).
- **Search** — matches dimension names, element names, all descriptions, manuscript fields, and examples. Opening a result shows its description; a **Select This Element** button inside the dialog applies it — search alone never changes your profile.
- **The taxonomy table** — the centerpiece. Ten dimensions as columns, Elements 0–4 as rows. Headers show the dimension name and a one-line subtitle; every element shows its number, name, a short meaning, an information control, and (when selected) a lock control. Table-specific controls sit above the table: **Randomize Unlocked Elements**, **Clear Selections**, **Clear Locks**.
- **Generation** — a single primary button sits directly below the table. It reads **Generate Experience** until the current inputs (topic plus selected elements) have been generated, then reads **Regenerate Experience**; pressing it again produces a fresh variation of the same topic, selections, and locks. Changing the topic or a selection returns the label to **Generate Experience**. Toggling a lock without changing the selected element does not reset it.
- **The generated result** — appears beneath the generation button as a design brief.

### Selecting and locking

- Clicking an element selects it for that dimension; selecting another element in the same dimension replaces it (one element per dimension). Selection is shown by color, border, weight, and a check marker.
- **Locks live on the table**: the selected element of a dimension carries a small padlock. Locked dimensions keep their element through every randomization and show a distinct green treatment with a closed padlock. Deliberately selecting a different element in a locked dimension moves the selection and keeps the lock (the lock follows your explicit choice — the tooltip says so). Deselecting removes the dimension's lock. **Clear Locks** releases all of them.
- The three per-element controls never interfere: click selects, the **i** informs, the padlock locks.

### Randomization

- **Randomize Unlocked Elements** — keeps the topic and every locked element, selects one random element in each unlocked dimension, and does *not* generate.
- **Generate Experience** with unselected dimensions offers a choice: randomize the missing ones, or generate from only your selected dimensions. There is no completion gate. With no topic entered, generation is declined and the topic field is highlighted instead of inventing vague copy.

### The generated design brief

Sections: Experience Title, One-Sentence Concept, Intended Audience, Participant Roles, Setting, Purpose, Beginning / Middle / End, Core Interactions, Social Structure, Story Structure, Consequences & Agency, Gamification, Technology, Learning & Didactic Intent, Data Use, Facilitator & Secondary Perspective, Taxonomy Rationale, and Design Risks & Open Questions. Content is grounded in concrete actors, and each section honors the selected elements semantically — Passive requires no meaningful choices, No Story adds no narrative arc, Ungamified adds no points, None under Immersive Technology assumes no AR/VR, Anonymous depends on no identity tracking.

The generator can run through an optional AI provider ([`ai-provider.js`](ai-provider.js), configured in [`ai-config.js`](ai-config.js) — read its security warning); without one it uses the built-in local generator. Either way the output shape is identical.

## The taxonomy structure

Ten dimensions, each with Elements 0–4 (row position = element number):

Interactivity · Embodiment · Co-Participation · Story · Dynamics · Gamification · Immersive Technology · Meta-Control · Didactic Capacity · Data

Every dimension and element has a stable internal ID plus editable descriptions: short, detailed, and example, plus manuscript fields (dimensions: chapter subtitle, central design question, why it matters, Element 0→4 progression, source chapter; elements: participant role, designer responsibility, use cases, cautions, source chapter and section). Manuscript fields render in the info dialogs only when filled. **The description text currently in [`starter-content.js`](starter-content.js) is editable placeholder wording written for this site; the manuscript fields ship empty and should be filled from the manuscript** — via Edit Taxonomy on the site or in that file.

## Authentication roles

| | Public visitor | Signed-in user | Administrator |
|---|---|---|---|
| Explore, read descriptions, search, select, lock, randomize, generate | ✓ | ✓ | ✓ |
| Save experiences to a personal library | | ✓ | ✓ |
| Edit the taxonomy + descriptions | | | ✓ |

Administrators are exactly the two UIDs allowlisted in [`firestore.rules`](firestore.rules) — creating an account never grants edit access, and the rules are the authority. An unsaved generated result survives signing in.

### Account settings

The account menu (top right) opens **Account Settings**, available to any signed-in user. It has a Profile section (read-only email, editable display name) and a Security section (change password with current-password re-authentication, and send-yourself-a-password-reset-email). It exposes no administrator controls, and changing a display name or password never affects admin access, which stays governed only by the UID allowlist. Password values are used solely for Firebase Authentication and are never written to Firestore, local storage, or logs.

### Saved experiences

Signed-in users save generated briefs to their private library: search, sort, favorite, rename, edit notes, duplicate, delete, **Load Into Workspace** (selections map back by stable ID), and **Regenerate Variation**. Experiences saved by earlier versions of the site still render.

### Edit Taxonomy (administrators)

The header's **Edit Taxonomy** button switches the table into editing: inline name edits, per-element and per-dimension description editors (including all manuscript fields) with Save/Cancel, a **Compare / Restore Default** button inside the editor, add/delete dimensions and element rows (with confirmation), **Restore Manuscript Defaults**, cloud autosave with visible status, **Save Now**, and JSON backup tools. Edit controls never appear in the normal workspace.

## Testing locally and in the cloud

- **Local:** serve the folder with any static server (e.g. `python3 -m http.server`) and open it. With `firebase-config.js` placeholders the site runs in local-only mode (edits stay in the browser). With the real config it loads the published cloud taxonomy; sign in to test accounts and saving.
- **Cloud:** the published taxonomy lives in Firestore at `taxonomy/current` (public read, admin write). After changing `firestore.rules`, re-publish them in the Firebase Console — deployments only serve the website. When adding a domain, list it under Authentication → Settings → Authorized domains.

## Project structure

| File | Purpose |
|---|---|
| `index.html` | Landing page (welcome + two choices) |
| `about.html` | About the taxonomy |
| `design.html` | The design workspace, generation, and dialogs |
| `styles.css` | All styling — theme variables at the top |
| `account.js` | Shared authentication + account menu + Account Settings (loaded by every page) |
| `script.js` | Design-workspace logic — table, locks, generator, cloud taxonomy sync, saved-experience library |
| `starter-content.js` | Default taxonomy + editable starter descriptions |
| `ai-provider.js` | AI provider abstraction (OpenAI implemented, local fallback) |
| `ai-config.js` | AI provider configuration |
| `firebase-config.js` | Firebase web config |
| `firestore.rules` | Security rules (publish these in the Firebase Console) |

Version 5.0
