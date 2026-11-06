// ============================================================================
// AuthService.js
// A thin wrapper around Firebase Authentication (email + password).
// The rest of the app talks to this class and never touches Firebase Auth directly.
// ============================================================================
import {
  createUserWithEmailAndPassword,  // makes a new account
  onAuthStateChanged,              // tells us when someone signs in or out
  signInWithEmailAndPassword,      // logs an existing user in
  signOut,                         // logs the user out
  updateProfile                    // lets us save the display name on the account
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'
import { auth } from './firebase.js'

export class AuthService {
  // The currently signed-in user, or null if nobody is signed in.
  get user() { return auth.currentUser }

  // Calls `callback(user)` now and again every time the sign-in state changes.
  onChange(callback) { return onAuthStateChanged(auth, callback) }

  // Creates an account, then stores the chosen display name on it.
  async signUp(displayName, email, password) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName })
    return cred.user
  }

  // Logs in and returns the user.
  async signIn(email, password) {
    return (await signInWithEmailAndPassword(auth, email, password)).user
  }

  // Logs out.
  signOut() { return signOut(auth) }

  // A short-lived "proof of login" token. The commentary server function uses it
  // to check the request really comes from a signed-in player.
  idToken() { return auth.currentUser ? auth.currentUser.getIdToken() : null }

  // Turns Firebase's technical error codes into sentences a player can act on.
  static explain(error) {
    const map = {
      'auth/invalid-credential': 'Email or password is incorrect.',
      'auth/email-already-in-use': 'That email already has an account. Sign in instead.',
      'auth/weak-password': 'Use a password with at least 6 characters.',
      'auth/invalid-email': 'That email address does not look right.',
      'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.'
    }
    // Use our friendly text if we have it, otherwise fall back to Firebase's own message.
    return map[error?.code] ?? error?.message ?? 'Something went wrong.'
  }
}
