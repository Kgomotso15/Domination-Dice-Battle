// Automated tests. Ran with:  npm test
// Each test() states one rule from the brief and checks the code obeys it.
// 'assert.equal(a, b)' fails the test if a and b are different.

import test from 'node:test'
import assert from 'node:assert/strict'
import { conquestReward, diceCount, resolveRound, soldiersForPopulation } from '../js/engine/rules.js'
import { Game, RuleError } from '../js/engine/Game.js'
import { COUNTRIES } from '../js/data/countries.js'

// A fake random-number source that returns the given values in turn (so dice rolls are predictable)
const seq = (...values) => { let i = 0; return () => values[i++ % values.length] }
// rollDie = 1 + floor(rng*6), so these map to faces 1..6
// Converts a die face (1-6) into the random number that makes rollDie() produce it.
const face = (n) => (n - 1) / 6 + 0.01

// Checks the population table: e.g. Vatican City = 1 soldier, India = 9
test('soldier bands follow the brief', () => {
  assert.equal(soldiersForPopulation(506), 1)
  assert.equal(soldiersForPopulation(5_000_000), 1)
  assert.equal(soldiersForPopulation(5_000_001), 2)
  assert.equal(soldiersForPopulation(65_453_084), 5) // South Africa
  assert.equal(soldiersForPopulation(1_476_625_576), 9) // India
  assert.equal(soldiersForPopulation(150_000_000), 8)
})

// The three dice-count examples written in the brief
test('dice count examples from the brief', () => {
  assert.equal(diceCount(10, 2), 2)
  assert.equal(diceCount(3, 5), 2)
  assert.equal(diceCount(2, 5), 1)
})

// India (value 9) gives 4, Vatican City (value 1) gives the minimum of 2
test('conquest reward examples from the brief', () => {
  assert.equal(conquestReward(9), 4) // India
  assert.equal(conquestReward(1), 2) // Vatican City
})

// The brief's worked example: one pair lost, one pair won, so each side loses 1
test('dice resolution example from the brief (1v2 and 4v3)', () => {
  // attacker 1, defender 2, attacker 4, defender 3  -> order of rolls: a1, d1, a2, d2
  const r = resolveRound(10, 2, seq(face(1), face(2), face(4), face(3)))
  assert.deepEqual(r.pairs.map((p) => p.winner), ['defender', 'attacker'])
  assert.equal(r.attackerLosses, 1)
  assert.equal(r.defenderLosses, 1)
})

// Equal dice change nothing.
test('ties kill nobody', () => {
  const r = resolveRound(4, 4, seq(face(3)))
  assert.equal(r.attackerLosses + r.defenderLosses, 0)
})

// Helper: creates a fresh game for the tests.
function newGame(rng) {
  return Game.create({ ownerUid: 'u', humanName: 'Tester', humanCode: 'ZA', countries: COUNTRIES, rng })
}

// A new game has 10 countries, 10 different owners, and soldiers set by population.
test('setup: 10 distinct countries, one per player, soldiers by population', () => {
  const g = newGame()
  assert.equal(g.countries.length, 10)
  assert.equal(new Set(g.countries.map((c) => c.ownerId)).size, 10)
  assert.equal(g.country('ZA').soldiers, 5)
  assert.equal(g.state.round, 1)
  assert.equal(g.state.phase, 'action') // no reinforcements in round 1
})

// Soldiers can only move between your own countries and one must always stay behind.
test('transfers must leave 1 soldier and stay between own countries', () => {
  const g = newGame()
  const me = g.currentPlayer.id
  const [a, b] = g.ownedBy(me)
  assert.equal(g.ownedBy(me).length, 1) // only one country at the start
  assert.throws(() => g.transfer(a.code, 'XX', 1), RuleError)
  // give the player a second country by hand to test a legal transfer
  const other = g.countries.find((c) => c.ownerId !== me)
  other.ownerId = me
  a.soldiers = 5
  g.transfer(a.code, other.code, 4)
  assert.equal(a.soldiers, 1)
  assert.throws(() => g.transfer(a.code, other.code, 1), /at least 1/)
})

// Attack rules: 2+ soldiers needed, and stopping an attack ends your turn.
test('one attack per turn, needs 2 soldiers, stopping ends the turn', () => {
  const g = newGame()
  const me = g.currentPlayer
  const src = g.ownedBy(me.id)[0]
  const tgt = g.countries.find((c) => c.ownerId !== me.id)
  src.soldiers = 1
  assert.throws(() => g.startAttack(src.code, tgt.code), /at least 2/)
  src.soldiers = 6
  g.startAttack(src.code, tgt.code)
  assert.throws(() => g.endTurn(), RuleError) // cannot skip mid-attack
  g.stopAttack()
  assert.notEqual(g.currentPlayer.id, me.id)
})

// Conquer every country one by one: ownership changes, rewards are right, players are eliminated, the game is won.
test('conquest, elimination, reward and win', () => {
  const g = newGame()
  const me = g.currentPlayer
  const src = g.ownedBy(me.id)[0]
  src.soldiers = 9
  // make every other country a 1-soldier country so each attack is one round
  for (const c of g.countries) if (c.ownerId !== me.id) c.soldiers = 1
  const targets = g.countries.filter((c) => c.ownerId !== me.id)
  let guard = 0
  for (const t of targets) {
    if (g.state.phase === 'postAttack') {
      // next turn for the same player requires everyone else to play: simulate by forcing the seat
      g.state.phase = 'action'
      g.state.turn.attackUsed = false
    }
    g.startAttack(src.code, t.code)
    let res
    while (!res || res.outcome === 'continue') {
      res = g.attackRound(() => 0.99) // attacker always rolls 6, defender always rolls 6 -> ties
      if (++guard > 500) break
      if (res.outcome === 'continue') {
        // rig: attacker 6, defender 1
        res = g.attackRound(seq(face(6), face(1)))
      }
    }
    assert.equal(res.outcome, 'conquered')
    assert.equal(res.reward, conquestReward(g.country(t.code).baseSoldiers)) // reward uses the ORIGINAL soldier value
    assert.equal(g.country(t.code).ownerId, me.id)
    assert.ok(res.defenderEliminated)
    if (res.gameWon) break
  }
  assert.ok(g.isFinished)
  assert.equal(g.state.winnerId, me.id)
})

// Round 1 gives nothing; round 2 gives 2 soldiers per country and must be placed exactly.
test('reinforcements: none in round 1, 2 per country from round 2', () => {
  const g = newGame()
  for (let i = 0; i < 10; i++) g.endTurn() // everyone skips once
  assert.equal(g.state.round, 2)
  assert.equal(g.state.phase, 'reinforce')
  assert.equal(g.state.reinforcePool, 2)
  assert.throws(() => g.allocateReinforcements({ [g.ownedBy(g.currentPlayer.id)[0].code]: 1 }), /exactly 2/)
})

import { filterCountries, filterGames } from '../js/views/gameFilter.js'

// The search box and status filter on the game lists.
test('game list search and status filter', () => {
  const games = [
    { humanCountry: 'South Africa', ownerName: 'Noksss', status: 'active' },
    { humanCountry: 'Brazil', ownerName: 'Ana', status: 'finished' }
  ]
  assert.equal(filterGames(games, { query: 'brazil' }).length, 1)
  assert.equal(filterGames(games, { query: 'noks' })[0].humanCountry, 'South Africa')
  assert.equal(filterGames(games, { status: 'finished' }).length, 1)
  assert.equal(filterGames(games, { status: 'active', query: 'ana' }).length, 0)
})

// The search box and soldier-band filter on the country picker.
test('country picker search and soldier-band filter', () => {
  const soldiersFor = soldiersForPopulation
  const all = COUNTRIES
  const big = filterCountries(all, { band: '9-9', soldiersFor })
  assert.ok(big.every((c) => soldiersFor(c.population) === 9) && big.length > 5)
  assert.deepEqual(filterCountries(all, { query: 'vatican', soldiersFor }).map((c) => c.code), ['VA'])
})

import { NpcStrategy } from '../js/engine/NpcStrategy.js'

// rivals cannot attack the human before the human's first turn.
test('opening shield: Rival never targets the human before the human has played', () => {
  for (let i = 0; i < 40; i++) {
    const g = Game.create({ ownerUid: 'u', humanName: 'T', humanCode: 'ZA', countries: COUNTRIES })
    if (g.currentPlayer.id === 'p0') { assert.equal(g.state.openingShield, false); continue } // human goes first: nothing to shield
    assert.equal(g.state.openingShield, true)
    // make the Rivals as strong as possible so the human would be an attractive target
    for (const c of g.countries) if (c.ownerId !== 'p0') c.soldiers = 9
    g.country('ZA').soldiers = 1
    while (g.currentPlayer.id !== 'p0') {
      const me = g.currentPlayer
      const { attack } = new NpcStrategy(me.profile).chooseAttack(g, me.id)
      if (attack) assert.notEqual(attack.target.ownerId, 'p0')
      g.endTurn()
    }
    assert.equal(g.state.openingShield, false) // switched off once the human's turn begins
  }
})

test('Rival players get unique faction names that never match a country on the board', () => {
  for (let i = 0; i < 30; i++) {
    const g = Game.create({ ownerUid: 'u', humanName: 'John', humanCode: 'FR', countries: COUNTRIES })
    const rivals = g.state.players.filter((p) => !p.isHuman)
    assert.equal(new Set(rivals.map((p) => p.name)).size, 9)
    const countryNames = new Set(g.countries.map((c) => c.name))
    assert.ok(rivals.every((p) => !countryNames.has(p.name) && !p.name.endsWith(' Rival')))
  }
})

// Rivals must never be the same as a country name, and must all be different.
test('Rivals have names that are not country names', () => {
  const g = newGame()
  const countryNames = new Set(COUNTRIES.map((c) => c.name))
  for (const p of g.state.players.filter((x) => !x.isHuman)) assert.ok(!countryNames.has(p.name), p.name)
  assert.equal(new Set(g.state.players.map((p) => p.name)).size, 10) // all names unique
})

// A whittled-down big country still pays its ORIGINAL value (floor(9/2) = 4).
test('reward uses the original value even if the country was reinforced', () => {
  const g = newGame()
  const me = g.currentPlayer
  const tgt = g.countries.find((c) => c.ownerId !== me.id)
  const src = g.ownedBy(me.id)[0]
  tgt.soldiers = 1; tgt.baseSoldiers = 9 // pretend a big country that has been whittled down
  src.soldiers = 9
  g.startAttack(src.code, tgt.code)
  const r = g.attackRound(seq(face(6), face(1)))
  assert.equal(r.outcome, 'conquered')
  assert.equal(r.reward, 4) // floor(9 / 2), not the current 1
})
