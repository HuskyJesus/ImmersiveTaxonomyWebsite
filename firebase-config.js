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
  apiKey: "AIzaSyAWByBOCCSF4GL-sSuafariIbu-3tTy8MY",
  authDomain: "immersivetaxonomywebsite.firebaseapp.com",
  projectId: "immersivetaxonomywebsite",
  storageBucket: "immersivetaxonomywebsite.firebasestorage.app",
  messagingSenderId: "768236145566",
  appId: "1:768236145566:web:e1297b81aed482b7b2648f"
};

/* True once real values have been pasted in above */
export function isFirebaseConfigured() {
  return Object.values(firebaseConfig).every(
    (v) => typeof v === "string" && v.length > 0 && !v.startsWith("PASTE_")
  );
}
