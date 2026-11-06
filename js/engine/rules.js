// no screen, no database, no network. Every function here only 
// takes numbers in and gives numbers out, so it is easy to test in Node

// How many countries are in every game (the player's plus 9 random ones)
export const WORLD_SIZE = 10

// From round 2 onwards a player gets this many new soldiers per country they own
export const REINFORCEMENTS_PER_COUNTRY = 2

// Safety net: if a game somehow runs this many rounds, we stop it and pick a winner
export const MAX_ROUNDS = 150

// The population table from the brief, written as [upper population limit, soldiers]
// "Up to 5 million" means 5,000,000 or fewer, so each limit is inclusive
const SOLDIER_BANDS = [
  [5e6, 1],    // up to 5 million   -> 1 soldier
  [10e6, 2],   // up to 10 million  -> 2 soldiers
  [25e6, 3],   // up to 25 million  -> 3 soldiers
  [50e6, 4],   // up to 50 million  -> 4 soldiers
  [75e6, 5],   // up to 75 million  -> 5 soldiers
  [100e6, 6],  // up to 100 million -> 6 soldiers
  [125e6, 7],  // up to 125 million -> 7 soldiers
  [150e6, 8]   // up to 150 million -> 8 soldiers
]

// Turns a country's population into its starting soldier count
export function soldiersForPopulation(population) {
  // Walk through the table from the smallest band to the largest
  for (const [limit, soldiers] of SOLDIER_BANDS) {
    // The first band whose limit is big enough is the right one
    if (population <= limit) return soldiers
  }
  // "Anything more" than 150 million gets the maximum of 9 soldiers
  return 9
}

// Soldiers gained for conquering a country: the greater of 2 and half its value (rounded down)
// IMPORTANT: pass the country's ORIGINAL soldier value (from its population), not its current count
export function conquestReward(originalSoldierValue) {
  // Math.floor rounds down; Math.max picks the bigger of the two numbers
  return Math.max(2, Math.floor(originalSoldierValue / 2))
}

// How many dice each side rolls. The attacker must leave 1 soldier behind,
// so at most (attackers - 1) can fight, and a side can never roll more dice than the defender has
export function diceCount(attackerSoldiers, defenderSoldiers) {
  // Math.min takes the smaller side; Math.max(0, ...) stops the result going negative
  return Math.max(0, Math.min(attackerSoldiers - 1, defenderSoldiers))
}

// Rolls one six-sided die. `rng` is a random-number function (0 up to but not including 1)
// It is a parameter so tests can pass in a fake "random" that gives predictable rolls
export function rollDie(rng = Math.random) {
  // rng() * 6 gives 0-5.99, Math.floor makes it 0-5, and + 1 makes it 1-6
  return 1 + Math.floor(rng() * 6)
}

// Plays ONE round of an attack: both sides roll dice at the same time and
// each attacking die is compared with one defending die, in order
export function resolveRound(attackerSoldiers, defenderSoldiers, rng = Math.random) {
  // n = how many dice each side rolls this round
  const n = diceCount(attackerSoldiers, defenderSoldiers)
  // This list will hold one entry per pair of dice.
  const pairs = []
  // Repeat once for every die
  for (let i = 0; i < n; i++) {
    // The attacker's die.
    const a = rollDie(rng)
    // The defender's die.
    const d = rollDie(rng)
    // Record both numbers and who won: the higher die wins, equal dice are a tie
    pairs.push({ a, d, winner: a > d ? 'attacker' : a < d ? 'defender' : 'tie' })
  }
  return {
    dice: n,
    pairs,
    // Every pair the defender won costs the attacker one soldier...
    attackerLosses: pairs.filter((p) => p.winner === 'defender').length,
    // ...and every pair the attacker won costs the defender one soldier. Ties cost nobody
    defenderLosses: pairs.filter((p) => p.winner === 'attacker').length
  }
}

// Returns a shuffled copy of a list (Fisher-Yates shuffle). The original list is left alone
export function shuffle(items, rng = Math.random) {
  // Work on a copy so we do not change the caller's list
  const copy = [...items]
  // Go from the last position down to the second one.
  for (let i = copy.length - 1; i > 0; i--) {
    // Pick a random position from 0 up to and including i
    const j = Math.floor(rng() * (i + 1))
    // Swap the two items (the leading ; stops JavaScript joining this line to the one above)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}
