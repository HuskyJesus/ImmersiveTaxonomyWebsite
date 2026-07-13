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
       value: string,             // the chosen value
       valueDescription: string,  // what the value means
       valueExample: string
     }]
   }

   idea = {
     title, pitch, audience, flow, interaction, immersion,
     goal, dataUse, techFit, expansion: string,
     rationale: [{ col, colMeaning, values: [string], note }]
   }

   To add a provider (Claude, Gemini, Ollama, …): add an entry to
   PROVIDERS below with isConfigured() and generate(context), and
   add its settings to ai-config.js. Nothing else changes.
   ============================================================ */

import { aiConfig } from "./ai-config.js";

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
        (s.valueExample ? ` (example of this value in use: ${s.valueExample})` : "")
    )
    .join("\n");

  const system =
    "You are an expert immersive experience designer. You turn a topic plus a set of " +
    "design decisions into a concrete, vivid experience concept. You write like a designer " +
    "presenting to a client: specific, grounded, and human. NEVER write abstract statements " +
    'like "the participant solves puzzles" — instead write concrete user stories like ' +
    '"a middle-school student explores an abandoned research station while guided by an AI ' +
    'historian; each room presents a historical mystery that must be solved before progressing." ' +
    "Every concept must establish WHO the participant is, WHERE the experience happens, WHY " +
    "they are there, WHAT they actually do, and must have a clear beginning, middle, and end.";

  const user =
`TOPIC: ${context.topic}

DESIGN DECISIONS (each is one dimension of the taxonomy and the chosen value, with its meaning):
${decisions}

Write one immersive experience concept honoring every decision above. Respond with ONLY a JSON object, no markdown fences, with exactly these string fields:
- "title": an evocative name for the experience
- "pitch": 1-2 sentences that make someone want to build it — concrete, not abstract
- "audience": who the participant is (a specific kind of person) and the role they play
- "flow": the participant's journey as a story — beginning (arrival, who/where/why), middle (what they actually do, moment to moment), end (how it resolves and what they leave with)
- "interaction": what participants concretely DO, honoring the Interactivity/Dynamics/Motivation decisions
- "immersion": how presence is created, honoring the Embodiment/Meta Control decisions
- "goal": the learning and emotional outcome, honoring the Learning decision
- "dataUse": what the experience knows about participants and how it uses it, honoring the Data decision
- "techFit": how the chosen technology serves the experience, honoring the Tech decision
- "expansion": one optional way to extend or scale the experience
and one array field:
- "rationale": one entry per design decision, each an object {"col": dimension name, "colMeaning": what the dimension controls, "values": [chosen value], "note": one sentence on how this concept honors that choice}`;

  return { system, user };
}

/* Validates that a provider response has the shape the app needs */
function isValidIdea(idea) {
  const strings = ["title", "pitch", "audience", "flow", "interaction", "immersion", "goal", "dataUse", "techFit", "expansion"];
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
