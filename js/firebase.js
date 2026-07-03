// Firebase bootstrap. The compat SDKs are loaded via CDN <script> tags in
// index.html and expose a global `firebase` object.
//
// This config/API key is a public client-side Firebase web config (expected
// to be visible in a static site) — not a secret, but also not a security
// boundary. Firestore rules (not in this repo) gate write access.

const firebaseConfig = {
  apiKey: "AIzaSyA_fHbRyoebo-g54Mn9T_BVIStNxNS8hJ4",
  authDomain: "dachshund-dash-b835a.firebaseapp.com",
  projectId: "dachshund-dash-b835a",
  storageBucket: "dachshund-dash-b835a.firebasestorage.app",
  messagingSenderId: "41936067257",
  appId: "1:41936067257:web:bebc6d4a5a8df272555968"
};

// Returns { db, ready }. On any failure the global leaderboard is disabled
// and the game runs fine without it.
export function initFirebase() {
  try {
    const firebase = window.firebase;
    if (typeof firebase !== 'undefined' && firebase.initializeApp) {
      firebase.initializeApp(firebaseConfig);
      return { db: firebase.firestore(), ready: true };
    }
  } catch (e) {
    console.warn('Firebase init failed, global leaderboard disabled:', e);
  }
  return { db: null, ready: false };
}
