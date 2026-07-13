# IXD — Immersive Experience Design Taxonomy

A landing page and flexible design workspace for the immersive experience design taxonomy — a static site built with plain HTML, CSS, and JavaScript, with Firebase for accounts, cloud saving, and per-user experience libraries. All internal paths are relative, so the site works on GitHub Pages, a custom domain, or a local preview without changes.

**Live site:** https://immersiveexperiencedesign.org/

> Based on the immersive experience design taxonomy developed by JJ Ruscella in
> *“Immersion: The New Art Form — A Handbook for the Immersive Experience Designer.”*

## How the site works

### The landing page

Visitors arrive on a brief introduction: what the taxonomy is (a **map of design possibilities** — not a checklist, not a score; Element 4 is never automatically "better" than Element 0), who it's for, the problem it solves, and how it works. **Start Designing** scrolls to the workspace; **About the Taxonomy** and the video section offer more depth. The full table never appears before the visitor chooses to design.

### The design workspace

One flexible workspace — not a wizard. Nothing is gated; everything is reachable in any order:

- **Experience Focus** — a compact topic input with a helper sentence and concrete examples (cooking, the history of the Civil War, onboarding new nurses, …).
- **Generation controls** — primary: **Generate Experience**; secondary: **Generate From Random Path**, **Regenerate**; supporting: **Randomize Unlocked Elements**, **Clear Selections**, **Clear Locks**.
- **Search** — matches dimension names, element names, all descriptions, manuscript fields, and examples. Opening a result shows its description; a **Select This Element** button inside the dialog applies it — search alone never changes your profile.
- **The taxonomy table** — the centerpiece. Ten dimensions as columns, Elements 0–4 as rows. Headers show the dimension name and a one-line subtitle; every element shows its number, name, a short meaning, an information control, and (when selected) a lock control.
- **The generated result** — appears beneath the table as a design brief.

### Selecting and locking

- Clicking an element selects it for that dimension; selecting another element in the same dimension replaces it (one element per dimension). Selection is shown by color, border, weight, and a check marker.
- **Locks live on the table**: the selected element of a dimension carries a small padlock. Locked dimensions keep their element through every randomization and show a distinct green treatment with a closed padlock. Deliberately selecting a different element in a locked dimension moves the selection and keeps the lock (the lock follows your explicit choice — the tooltip says so). Deselecting removes the dimension's lock. **Clear Locks** releases all of them.
- The three per-element controls never interfere: click selects, the **i** informs, the padlock locks.

### Randomization

- **Randomize Unlocked Elements** — keeps the topic and every locked element, selects one random element in each unlocked dimension, and does *not* generate.
- **Generate From Random Path** — same, then generates immediately. With no topic entered, the randomized selections are kept and the workspace asks for a topic instead of inventing vague copy. Random profiles are framed as starting points to revise, never as finished designs.
- **Generate Experience** with unselected dimensions offers a choice: randomize the missing ones, or generate from only your selected dimensions. There is no completion gate.

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
| `index.html` | Landing, about, workspace, book section, dialogs |
| `styles.css` | All styling — theme variables at the top |
| `script.js` | All logic — workspace, locks, generator, cloud sync, auth, library |
| `starter-content.js` | Default taxonomy + editable starter descriptions |
| `ai-provider.js` | AI provider abstraction (OpenAI implemented, local fallback) |
| `ai-config.js` | AI provider configuration |
| `firebase-config.js` | Firebase web config |
| `firestore.rules` | Security rules (publish these in the Firebase Console) |

Version 5.0
