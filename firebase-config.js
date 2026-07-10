/* ============================================================
   FIREBASE CONFIGURATION — PASTE YOUR VALUES HERE
   ============================================================

   This is the ONLY file you need to edit to turn on cloud saving.

   Where to find these values:
     Firebase Console → Project settings (gear icon) → General
     → "Your apps" → select your Web app → "SDK setup and
     configuration" → Config

   Replace every "PASTE_..." string below with the matching value.
   Full step-by-step instructions are in README.md.

   NOTE: it is normal and safe for these values to be public in a
   static website. They only identify the project — all real
   security comes from Firebase Authentication and the Firestore
   Security Rules in firestore.rules.

   Until this file is filled in, the site simply runs in
   local-only mode (edits stay in this browser), exactly like
   before cloud saving existed.
   ============================================================ */

export const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_AUTH_DOMAIN",            // e.g. my-project.firebaseapp.com
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_STORAGE_BUCKET",      // e.g. my-project.appspot.com
  messagingSenderId: "PASTE_MESSAGING_SENDER_ID",
  appId: "PASTE_APP_ID"
};

/* True once real values have been pasted in above */
export function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every(
    (v) => typeof v === "string" && v.length > 0 && !v.startsWith("PASTE_")
  );
}
