// ============================================================================
// firebase.js
// The one place where the Firebase SDK is started up. Every other file imports
// `auth` and `db` from here instead of setting Firebase up again.
// ============================================================================

// Load the Firebase libraries straight from Google's CDN (no install or build step needed).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js'
// Our own settings from the config file.
import { firebaseConfig, isFirebaseConfigured } from '../config/firebase-config.js'

// Start Firebase, but only if the config has been filled in.
export const app = isFirebaseConfigured ? initializeApp(firebaseConfig) : null
// `auth` handles sign up / sign in. `db` is the Firestore database.
export const auth = app ? getAuth(app) : null
export const db = app ? getFirestore(app) : null
// Re-export the flag so other files can check it without importing the config.
export { isFirebaseConfigured }
