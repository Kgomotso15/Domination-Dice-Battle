// ============================================================================
// GameRepository.js
// The ONLY file that talks to the Firestore database. Game rules live in the
// engine; screens live in the views; saving and loading lives here. Keeping
// these apart means the database could be swapped without touching the game.
//
// Firestore layout (NoSQL: collections of documents):
//   users/{uid}                    one profile document per user
//   games/{gameId}                 summary fields + the full game `state`
//   games/{gameId}/events/{id}     an append-only log: decisions, dice rolls, commentary
// Anyone can READ games and events; only the owner can WRITE (see firestore.rules).
// ============================================================================
import {
  addDoc, collection, doc, getDocs, limit, onSnapshot, orderBy, query,
  serverTimestamp, setDoc, where, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js'
import { db } from './firebase.js'

// Firestore refuses `undefined` values, so we round-trip through JSON to strip them out.
const clean = (value) => JSON.parse(JSON.stringify(value))

// A few small fields copied to the top of the game document so the game LISTS can show
// them without loading the whole state.
const summary = (state) => ({
  status: state.status,
  round: state.round,
  phase: state.phase,
  winnerId: state.winnerId,
  countriesOwnedByHuman: Object.values(state.countries).filter((c) => c.ownerId === 'p0').length
})

export class GameRepository {
  // Saves (or updates) the user's profile document.
  async saveUserProfile(user) {
    await setDoc(
      doc(db, 'users', user.uid),
      { displayName: user.displayName ?? '', email: user.email, lastSeen: serverTimestamp() },
      { merge: true } // merge = only change these fields, keep any others
    )
  }

  // Creates a new game document and returns its id.
  async createGame(ownerUid, ownerName, state) {
    // The human player is always player 'p0'; find their starting country.
    const mine = Object.values(state.countries).find((c) => c.ownerId === 'p0')
    const ref = await addDoc(collection(db, 'games'), {
      ownerUid,                      // who owns the game (checked by the security rules)
      ownerName,
      humanCountry: mine.name,       // shown in the lists
      humanCode: mine.code,          // used to show the flag in the lists
      ...summary(state),
      state: clean(state),           // the full game state, so it can be resumed
      createdAt: serverTimestamp(),  // the server fills in the time
      updatedAt: serverTimestamp()
    })
    return ref.id
  }

  // Saves the new state and (optionally) one log event in ONE atomic write:
  // either both are saved or neither is.
  async save(gameId, state, event = null) {
    const batch = writeBatch(db)
    batch.update(doc(db, 'games', gameId), { ...summary(state), state: clean(state), updatedAt: serverTimestamp() })
    if (event) {
      batch.set(doc(collection(db, 'games', gameId, 'events')), { ...clean(event), ts: serverTimestamp() })
    }
    await batch.commit()
  }

  // Adds one log event without touching the game state.
  async addEvent(gameId, event) {
    await addDoc(collection(db, 'games', gameId, 'events'), { ...clean(event), ts: serverTimestamp() })
  }

  // Live updates of one game. Used by the owner (to resume) and by anyone watching a shared link.
  // Returns a function that stops the subscription.
  subscribeGame(gameId, onData, onError) {
    return onSnapshot(doc(db, 'games', gameId), (snap) => onData(snap.exists() ? { id: snap.id, ...snap.data() } : null), onError)
  }

  // Live updates of the event log. `onBatch(events, initial)` receives new events oldest-first;
  // `initial` is true only for the first batch (the history that already existed).
  subscribeEvents(gameId, onBatch, onError, max = 300) {
    let first = true
    // Newest 300 events, ordered by their sequence number.
    const q = query(collection(db, 'games', gameId, 'events'), orderBy('seq', 'desc'), limit(max))
    return onSnapshot(q, (snap) => {
      // Only look at events that were newly added since the last update.
      const added = snap.docChanges().filter((c) => c.type === 'added').map((c) => c.doc.data())
      // Put them back into oldest-first order.
      added.sort((a, b) => a.seq - b.seq)
      onBatch(added, first)
      first = false
    }, onError)
  }

  // The most recently created games (anyone can watch these).
  async listRecent(max = 50) {
    const snap = await getDocs(query(collection(db, 'games'), orderBy('createdAt', 'desc'), limit(max)))
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  }

  // Only the games owned by one user. Sorted here (not in the query) to avoid needing a database index.
  async listMine(uid) {
    const snap = await getDocs(query(collection(db, 'games'), where('ownerUid', '==', uid)))
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0))
  }
}
