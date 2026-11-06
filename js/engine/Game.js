// ============================================================================
// Game.js
// The heart of the project. A Game owns ALL the game state (countries, players,
// whose turn it is...) and is the ONLY place that is allowed to change it.
// Every public method checks the move is legal and throws a RuleError if not,
// so neither the buttons on screen nor rival general can ever cheat.
//
// A turn moves through these phases:
//   reinforce -> action -> attack -> postAttack -> (next player's turn) ...
// ============================================================================
import {
  MAX_ROUNDS,
  REINFORCEMENTS_PER_COUNTRY,
  WORLD_SIZE,
  conquestReward,
  resolveRound,
  shuffle,
  soldiersForPopulation
} from './rules.js'

// A special kind of Error used for "that move is not allowed" problems,
// so the UI can tell them apart from real bugs.
export class RuleError extends Error {}

// One colour per player, used for the stripes on the board. The first is the human's (rose).
const PLAYER_COLORS = [
  '#E85D9E', '#8B4BC2', '#F7B8D0', '#4FD1C5', '#F6C177',
  '#7AA2F7', '#C3E88D', '#FF9E64', '#B4A7FF', '#D9D9E3'
]

// Names for the rival generals. They are deliberately NOT country names, so
// "Crimson Accord" can never be confused with a country on the board.
const NPC_NAMES = [
  'Jasper', 'Emerald', 'Pearl', 'Sapphire', 'Topaz',
  'Dorian', 'Rose', 'Amari', 'Raphael', 'Lysander',
  'Saint', 'Aurum'
]

// The three rival personalities. Nine rival generals are dealt from this list in turn.
const NPC_PROFILE_KEYS = ['aggressor', 'balanced', 'defender']

export class Game {
  // `state` is a plain object (so it can be saved to the database as-is).
  constructor(state) {
    this.state = state
  }

  // ---------------------------------------------------------------- setup ----

  // Builds a brand-new game. `countries` is the full world list; `rng` can be faked in tests.
  static create({ ownerUid, humanName, humanCode, countries, rng = Math.random }) {
    // Find the country the player picked.
    const human = countries.find((c) => c.code === humanCode)
    // If the code does not exist, refuse to start.
    if (!human) throw new RuleError('Unknown starting country')
    // Shuffle everyone else and keep the first 9: these are the random rivals.
    const others = shuffle(countries.filter((c) => c.code !== humanCode), rng).slice(0, WORLD_SIZE - 1)
    // The player's country comes first, then the 9 rivals: 10 countries in total.
    const chosen = [human, ...others]
    // Deal out personalities to the 9 AI generals, then shuffle so they are mixed up.
    const profiles = shuffle(
      Array.from({ length: WORLD_SIZE - 1 }, (_, i) => NPC_PROFILE_KEYS[i % NPC_PROFILE_KEYS.length]),
      rng
    )
    // Shuffle the pool of AI names and take 9 of them.
    const names = shuffle(NPC_NAMES, rng).slice(0, WORLD_SIZE - 1)

    // Build the list of players: one per country, player 0 is the human.
    const players = chosen.map((country, i) => ({
      id: `p${i}`,                                  // p0, p1, p2 ... unique id
      name: i === 0 ? humanName : names[i - 1],     // the human's name, or an AI general's name
      isHuman: i === 0,                             // only player 0 is human
      profile: i === 0 ? null : profiles[i - 1],    // AI personality (humans have none)
      color: PLAYER_COLORS[i],                      // colour used on the board
      eliminated: false                             // nobody is out yet
    }))

    // Build the countries as an object keyed by country code, e.g. countryMap.ZA.
    const countryMap = {}
    chosen.forEach((c, i) => {
      // Starting soldiers come from the population table.
      const soldiers = soldiersForPopulation(c.population)
      countryMap[c.code] = {
        code: c.code,
        name: c.name,
        population: c.population,
        baseSoldiers: soldiers,        // the ORIGINAL soldier value, used for conquest rewards
        soldiers,                      // the current soldier count (changes during the game)
        ownerId: players[i].id         // every player starts owning exactly their own country
      }
    })

    // Random first player: rotate the seating order by a random amount.
    const start = Math.floor(rng() * WORLD_SIZE)
    const ids = players.map((p) => p.id)
    const order = [...ids.slice(start), ...ids.slice(0, start)]

    // Assemble the full game state.
    const game = new Game({
      version: 1,
      ownerUid,                  // the signed-in user who owns this game
      status: 'active',          // 'active' until someone wins
      players,
      countries: countryMap,
      order,                     // the seating order, starting with whoever plays first
      seat: 0,                   // index into `order` of whose turn it is
      seatAdvances: 0,           // how many times the turn has moved on (used to count rounds)
      round: 1,
      phase: 'action',           // overwritten by beginTurn() just below
      reinforcePool: 0,          // new soldiers waiting to be placed
      turn: null,                // details about the current turn
      attack: null,              // details about an attack in progress, or null
      winnerId: null,
      endedByRoundLimit: false,
      openingShield: true,       // AI cannot attack the human before the human's first turn
      eventSeq: 0                // counter used to number log events
    })
    // Start the first turn.
    game.beginTurn()
    return game
  }

  // ----------------------------------------------------------- read helpers ----

  // Looks up a player by id.
  player(id) { return this.state.players.find((p) => p.id === id) }
  // Looks up a country by its code.
  country(code) { return this.state.countries[code] }
  // All countries as a list.
  get countries() { return Object.values(this.state.countries) }
  // The player whose turn it is right now.
  get currentPlayer() { return this.player(this.state.order[this.state.seat]) }
  // True once someone has won.
  get isFinished() { return this.state.status === 'finished' }
  // All countries owned by a given player.
  ownedBy(playerId) { return this.countries.filter((c) => c.ownerId === playerId) }
  // The human player.
  get human() { return this.state.players.find((p) => p.isHuman) }
  // A plain copy of the state, safe to hand to the database.
  toJSON() { return JSON.parse(JSON.stringify(this.state)) }

  // -------------------------------------------------------- turn lifecycle ----

  // Sets everything up for whoever's turn it now is.
  beginTurn() {
    const s = this.state
    const p = this.currentPlayer
    // Record whose turn it is and that they have not attacked yet (max ONE attack per turn).
    s.turn = { playerId: p.id, attackUsed: false }
    // Once the human's first turn starts, the opening shield is no longer needed.
    if (p.isHuman) s.openingShield = false
    // No attack is running at the start of a turn.
    s.attack = null
    // Round 1 gives no reinforcements; from round 2 it is 2 per country owned.
    s.reinforcePool = s.round >= 2 ? this.ownedBy(p.id).length * REINFORCEMENTS_PER_COUNTRY : 0
    // If there are soldiers to place, start in the reinforce phase; otherwise go straight to action.
    s.phase = s.reinforcePool > 0 ? 'reinforce' : 'action'
  }

  // Places the new soldiers. `allocations` looks like { ZA: 2, BR: 1 }.
  allocateReinforcements(allocations) {
    // Only legal during the reinforce phase.
    this.#expect('reinforce')
    const s = this.state
    let total = 0
    // Check every entry.
    for (const [code, n] of Object.entries(allocations)) {
      // Each amount must be a whole number that is not negative.
      if (!Number.isInteger(n) || n < 0) throw new RuleError('Invalid soldier count')
      // You can only reinforce countries you own.
      if (n > 0 && this.#owner(code) !== this.currentPlayer.id) throw new RuleError(`You do not control ${code}`)
      total += n
    }
    // You must place exactly the number of soldiers you were given.
    if (total !== s.reinforcePool) throw new RuleError(`Place exactly ${s.reinforcePool} soldiers`)
    // Everything is valid, so add the soldiers.
    for (const [code, n] of Object.entries(allocations)) this.country(code).soldiers += n
    // The pool is now empty and the turn moves on to the action phase.
    s.reinforcePool = 0
    s.phase = 'action'
  }

  // Moves soldiers between two countries owned by the current player.
  transfer(fromCode, toCode, count) {
    // Only allowed when no attack is in progress.
    if (!['action', 'postAttack'].includes(this.state.phase)) {
      throw new RuleError('Soldiers can only be transferred when no attack is in progress')
    }
    const from = this.country(fromCode)
    const to = this.country(toCode)
    const me = this.currentPlayer.id
    // Both countries must exist and be different.
    if (!from || !to || fromCode === toCode) throw new RuleError('Pick two different countries')
    // Both countries must belong to the current player.
    if (from.ownerId !== me || to.ownerId !== me) throw new RuleError('You can only move soldiers between your own countries')
    // Move at least one soldier, and only whole soldiers.
    if (!Number.isInteger(count) || count < 1) throw new RuleError('Move at least 1 soldier')
    // The country giving soldiers must keep at least 1.
    if (from.soldiers - count < 1) throw new RuleError(`${from.name} must keep at least 1 soldier`)
    // Do the move.
    from.soldiers -= count
    to.soldiers += count
  }

  // Begins an attack from one of your countries on someone else's country.
  startAttack(sourceCode, targetCode) {
    // Attacks can only start during the action phase.
    this.#expect('action')
    const src = this.country(sourceCode)
    const tgt = this.country(targetCode)
    const me = this.currentPlayer.id
    // Only one attack per turn.
    if (this.state.turn.attackUsed) throw new RuleError('Only one attack per turn')
    // Both countries must exist.
    if (!src || !tgt) throw new RuleError('Unknown country')
    // You must attack FROM a country you own...
    if (src.ownerId !== me) throw new RuleError('Attack from a country you control')
    // ...and TO a country you do not own (distance does not matter).
    if (tgt.ownerId === me) throw new RuleError('You cannot attack your own country')
    // You need at least 2 soldiers: 1 to fight and 1 to stay behind.
    if (src.soldiers < 2) throw new RuleError(`${src.name} needs at least 2 soldiers to attack`)
    // Record the attack and use up this turn's one attack.
    this.state.attack = { sourceCode, targetCode, rounds: 0 }
    this.state.turn.attackUsed = true
    this.state.phase = 'attack'
  }

  // Rolls ONE round of the current attack and applies the losses.
  attackRound(rng = Math.random) {
    // Only legal while an attack is running.
    this.#expect('attack')
    const s = this.state
    const src = this.country(s.attack.sourceCode)
    const tgt = this.country(s.attack.targetCode)
    const attacker = this.currentPlayer
    const defender = this.player(tgt.ownerId)

    // Roll the dice and work out the losses.
    const round = resolveRound(src.soldiers, tgt.soldiers, rng)
    // Remove the dead soldiers from both sides.
    src.soldiers -= round.attackerLosses
    tgt.soldiers -= round.defenderLosses
    // Count this round.
    s.attack.rounds++

    // Build the result that we hand back to the caller (the UI shows it).
    const result = {
      ...round,                              // dice, pairs, attackerLosses, defenderLosses
      sourceCode: src.code,
      targetCode: tgt.code,
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerSoldiers: src.soldiers,        // soldiers left after this round
      defenderSoldiers: tgt.soldiers,
      outcome: 'continue',                   // may change to 'conquered' or 'failed' below
      reward: 0,
      defenderEliminated: false,
      gameWon: false
    }

    if (tgt.soldiers <= 0) {
      // ---- The defender has no soldiers left: the country is conquered. ----
      // The reward uses the country's ORIGINAL soldier value, as the brief requires.
      const reward = conquestReward(tgt.baseSoldiers)
      // Ownership changes hands...
      tgt.ownerId = attacker.id
      // ...and the conquering garrison is the reward.
      tgt.soldiers = reward
      result.outcome = 'conquered'
      result.reward = reward
      result.defenderSoldiers = reward
      // The attack is over.
      s.attack = null
      // If the loser owns nothing now, they are eliminated.
      if (this.ownedBy(defender.id).length === 0) {
        defender.eliminated = true
        result.defenderEliminated = true
      }
      // If the attacker now owns every country, they win the game.
      if (this.ownedBy(attacker.id).length === this.countries.length) {
        this.#finish(attacker.id)
        result.gameWon = true
      } else {
        // Otherwise the attacker may still move soldiers around before ending the turn.
        s.phase = 'postAttack'
      }
    } else if (src.soldiers <= 1) {
      // ---- The attacker is down to 1 soldier: the attack fails but they keep their country. ----
      result.outcome = 'failed'
      s.attack = null
      s.phase = 'postAttack'
    }
    return result
  }

  // Walking away from an attack ends the turn.
  stopAttack() {
    this.#expect('attack')
    this.state.attack = null
    this.#advance()
  }

  // Ends the turn without (or after) attacking. This is also how "skip turn" works.
  endTurn() {
    if (!['action', 'postAttack'].includes(this.state.phase)) {
      throw new RuleError('Finish reinforcements or the current attack first')
    }
    this.#advance()
  }

  // ------------------------------------------------------------ internals ----
  // Names starting with # are private: code outside this class cannot call them.

  // Throws unless the game is currently in the given phase.
  #expect(phase) {
    if (this.isFinished) throw new RuleError('The game is over')
    if (this.state.phase !== phase) throw new RuleError(`Not allowed during the ${this.state.phase} phase`)
  }

  // Who owns a country (or undefined if the code is unknown).
  #owner(code) { return this.country(code)?.ownerId }

  // Hands control to the next player who is still in the game.
  #advance() {
    const s = this.state
    const n = s.order.length
    // Keep moving to the next seat until we find someone who has not been eliminated.
    do {
      s.seat = (s.seat + 1) % n   // % n wraps back to seat 0 after the last seat
      s.seatAdvances++
    } while (this.player(s.order[s.seat]).eliminated)
    // A round is complete every time the turn has moved past all n seats.
    s.round = Math.floor(s.seatAdvances / n) + 1
    // If the game has dragged on too long, stop it and pick a winner by score.
    if (s.round > MAX_ROUNDS) return this.#finishByScore()
    // Otherwise start the next player's turn.
    this.beginTurn()
  }

  // Marks the game as over with the given winner.
  #finish(winnerId) {
    this.state.status = 'finished'
    this.state.phase = 'finished'
    this.state.winnerId = winnerId
    this.state.attack = null
  }

  // Only used by the round-limit safety net: most countries wins, then most soldiers.
  #finishByScore() {
    const score = (p) => {
      const owned = this.ownedBy(p.id)
      return owned.length * 1000 + owned.reduce((sum, c) => sum + c.soldiers, 0)
    }
    const leader = [...this.state.players].sort((a, b) => score(b) - score(a))[0]
    this.state.endedByRoundLimit = true
    this.#finish(leader.id)
  }
}
