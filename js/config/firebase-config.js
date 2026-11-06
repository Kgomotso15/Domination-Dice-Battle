// The settings that tell the app WHICH Firebase project to talk to.
// Copied from: Firebase console > Project settings > Your apps > Web app.
// These values only identify the project; real security
// comes from the rules in firestore.rules.

export const firebaseConfig = {
  apiKey: 'AIzaSyC_JJYnLO1nXzlCYe2QYiiIrSXA9ffYWAM',        // identifies the project to Google's servers
  authDomain: 'geo-game-53507.firebaseapp.com',               // domain used by the sign-in system
  projectId: 'geo-game-53507',                                 // the project's permanent id
  storageBucket: 'geo-game-53507.firebasestorage.app',         // file storage (not used by this app)
  messagingSenderId: '451640499850',                           // push messages (not used by this app)
  appId: '1:451640499850:web:8eb32674b0a6194f2f9773'           // identifies this web app
}

// True once real values have replaced the "YOUR_..." placeholders. main.js checks this
// so it can show a helpful message instead of crashing when the config is missing.
export const isFirebaseConfigured = !firebaseConfig.apiKey.startsWith('YOUR_')
