/* ============================================================
   AI PROVIDER LAYER
   ============================================================

   A small abstraction between the app and any AI service.

   The contract: a provider receives a generation CONTEXT and
   returns an IDEA OBJECT with exactly the same shape the local
   generator produces — so the rest of the application never
   knows (or cares) which provider generated an experience.

   context = {
     topic: string,
     selections: [{
       column: string,            // dimension name
       columnDescription: string, // what the dimension controls
       value: string,             // the chosen element
       valueDescription: string,  // what the element means
       valueDetail: string,
       participantRole: string,
       designerResponsibility: string,
       cautions: string,
       valueExample: string
     }]
   }

   idea = {
     title, concept, audience, roles, setting, purpose,
     beginning, middle, end,
     interactions, social, story, agency, gamification,
     technology, didactic, dataUse, facilitator, risks: string,
     rationale: [{ col, colMeaning, values: [string], note }]
   }

   To add a provider (Claude, Gemini, Ollama, …): add an entry to
   PROVIDERS below with isConfigured() and generate(context), and
   add its settings to ai-config.js. Nothing else changes.
   ============================================================ */

import { aiConfig } from "./ai-config.js?v=20260716-ixd2";

/* ------------------------------------------------------------
   Shared prompt builder — providers may reuse this.
   The prompt pushes the model toward concrete user stories
   (who / where / why / what, with a beginning, middle, and end)
   rather than abstract statements.
   ------------------------------------------------------------ */
function buildPrompt(context) {
  const decisions = context.selections
    .map(
      (s) =>
        `- ${s.column} (${s.columnDescription || "a design dimension"}): ` +
        `"${s.value}" — ${s.valueDescription || "no description"}` +
        (s.valueDetail ? ` Details: ${s.valueDetail}` : "") +
        (s.participantRole ? ` Participant role: ${s.participantRole}` : "") +
        (s.designerResponsibility ? ` Designer responsibility: ${s.designerResponsibility}` : "") +
        (s.cautions ? ` Caution: ${s.cautions}` : "") +
        (s.valueExample ? ` (example of this element in use: ${s.valueExample})` : "")
    )
    .join("\n");

  const system =
    "You are an expert immersive experience designer working with JJ Ruscella's immersive " +
    "experience design taxonomy. You turn a topic plus a set of design decisions into a " +
    "concrete, vivid experience concept written like a professional design brief. NEVER write " +
    'abstract statements like "the participant solves puzzles" — instead write concrete user ' +
    'stories like "two high-school students take the roles of archival investigators; a museum ' +
    'educator guides them as they compare conflicting Civil War letters and decide how to ' +
    'present the accounts in a public exhibit." Every concept must establish WHO the ' +
    "participants are, WHERE the experience happens, WHY they are there, WHAT they actually " +
    "do, with a clear beginning, middle, and end. CRITICAL: honor each selected element's " +
    "meaning exactly — a Passive selection must not require meaningful choices, Single Player " +
    "must not require a team, No Story must not add a narrative arc, Pre-Determined must not " +
    "offer branching outcomes, Ungamified must not add points or achievements, None under " +
    "Immersive Technology must not assume AR or VR, Anonymous must not depend on identity " +
    "tracking. The elements are possibilities, not rankings — never imply higher-numbered " +
    "elements are better.";

  const user =
`TOPIC: ${context.topic}

DESIGN DECISIONS (one element chosen per dimension, with its meaning — honor each exactly):
${decisions}

Write one immersive experience concept as a design brief. Respond with ONLY a JSON object, no markdown fences, with exactly these string fields:
- "title": an evocative name for the experience
- "concept": one sentence that establishes who, where, and why — concrete, not abstract
- "audience": who this is designed for
- "roles": the concrete roles participants (and any facilitators) play
- "setting": where the experience happens and what makes the place feel real
- "purpose": what the experience is for
- "beginning": how participants arrive and why they are there
- "middle": what they actually do, moment to moment
- "end": how it resolves and what they leave with
- "interactions": the core things participants do (honor Interactivity and Gamification)
- "social": the social structure (honor Co-Participation)
- "story": the narrative structure (honor Story)
- "agency": consequences and agency (honor Dynamics and Meta-Control)
- "gamification": game structures used or deliberately absent (honor Gamification)
- "technology": the delivery platform and why it fits (honor Immersive Technology)
- "didactic": the learning intent and how knowledge arrives (honor Didactic Capacity)
- "dataUse": what the experience knows about participants (honor Data)
- "facilitator": the facilitator or secondary-perspective layer, if any
- "risks": 1-2 design risks or open questions the designer should resolve
and one array field:
- "rationale": one entry per design decision, each an object {"col": dimension name, "colMeaning": what the dimension controls, "values": ["chosen element"], "note": one sentence on how this concept honors that choice}`;

  return { system, user };
}

/* Validates that a provider response has the shape the app needs */
function isValidIdea(idea) {
  const strings = ["title", "concept", "audience", "roles", "setting", "purpose",
    "beginning", "middle", "end", "interactions", "social", "story", "agency",
    "gamification", "technology", "didactic", "dataUse", "facilitator", "risks"];
  return (
    idea &&
    strings.every((k) => typeof idea[k] === "string" && idea[k].length > 0) &&
    Array.isArray(idea.rationale) &&
    idea.rationale.every((r) => r && typeof r.col === "string" && Array.isArray(r.values))
  );
}

/* ------------------------------------------------------------
   Providers
   ------------------------------------------------------------ */
const PROVIDERS = {
  openai: {
    isConfigured() {
      const c = aiConfig.openai;
      return !!(c && c.apiKey && c.model && c.baseUrl);
    },
    async generate(context) {
      const c = aiConfig.openai;
      const { system, user } = buildPrompt(context);
      const res = await fetch(`${c.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${c.apiKey}`
        },
        body: JSON.stringify({
          model: c.model,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user }
          ]
        })
      });
      if (!res.ok) throw new Error(`OpenAI request failed (${res.status})`);
      const data = await res.json();
      const idea = JSON.parse(data.choices?.[0]?.message?.content ?? "{}");
      if (!isValidIdea(idea)) throw new Error("Provider returned an unexpected shape");
      return idea;
    }
  }

  /* Future providers plug in here, e.g.:
     claude: { isConfigured() {...}, async generate(context) {...} },
     ollama: { isConfigured() {...}, async generate(context) {...} } */
};

/* ------------------------------------------------------------
   Public API
   ------------------------------------------------------------ */
export function aiAvailable() {
  const p = PROVIDERS[aiConfig.provider];
  return !!(p && p.isConfigured());
}

/* Returns an idea object, or throws — the caller decides whether
   to fall back to the local generator. */
export async function generateWithAI(context) {
  const p = PROVIDERS[aiConfig.provider];
  if (!p || !p.isConfigured()) throw new Error("No AI provider configured");
  return p.generate(context);
}
