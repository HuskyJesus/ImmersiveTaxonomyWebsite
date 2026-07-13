/* ============================================================
   AI GENERATION CONFIGURATION
   ============================================================

   The generator can optionally use an AI provider to write the
   experience concept. When no provider is configured (the default
   below), the site automatically uses its built-in local
   generator — nothing else changes, and the rest of the app never
   knows which one produced the result.

   To enable a provider, set `provider` to its name and fill in
   its settings. Supported today: "openai". The provider layer
   (ai-provider.js) is designed so more providers — Claude,
   Gemini, a local Ollama — can be added without touching the
   rest of the application.

   ⚠️ SECURITY WARNING — READ BEFORE ADDING A KEY
   This is a static website: anything in this file is visible to
   every visitor, INCLUDING an API key. Only put a key here if it
   is a restricted, spend-capped key you are comfortable exposing,
   or while testing locally. For real production use, route
   requests through a small proxy (e.g. a Cloudflare Worker or
   Firebase Function) and point `baseUrl` at it instead — then the
   key lives on the server, never in this file.
   ============================================================ */

export const aiConfig = {
  /* "none" = always use the built-in local generator */
  provider: "none",

  openai: {
    apiKey: "",                                 // see the warning above
    model: "gpt-4o-mini",
    baseUrl: "https://api.openai.com/v1"        // point at a proxy in production
  }
};
