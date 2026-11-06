// ============================================================================
// simulation.test.js
// Plays 20 COMPLETE games where every player (including the human seat) is driven by
// the AI. After every move it checks the rules still hold, and at the end that every
// game finished with a valid winner. This catches bugs no single-rule test would find.
// ============================================================================
import test from 'node:test'
import assert from 'node:assert/strict'
import { Game } from '../js/engine/Game.js'
import { NpcStrategy } from '../js/engine/NpcStrategy.js'
import { COUNTRIES } from '../js/data/countries.js'

// Plays complete all-NPC games (the human seat is driven by the same strategy)
// and checks the invariants the brief cares about after every move.
function playFullGame(seed) {
  let s = seed
  const rng = () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296)
  const g = Game.create({ ownerUid: 'u', humanName: 'Bot', humanCode: 'ZA', countries: COUNTRIES, rng })
  let steps = 0
  const check = () => {
    for (const c of g.countries) assert.ok(c.soldiers >= 1, `${c.name} has ${c.soldiers}`)
    assert.equal(g.countries.length, 10)
  }
  while (!g.isFinished && steps++ < 20000) {
    const me = g.currentPlayer
    const npc = new NpcStrategy(me.profile ?? 'balanced', rng)
    if (g.state.phase === 'reinforce') g.allocateReinforcements(npc.planReinforcements(g, me.id).allocations)
    const cons = npc.planConsolidation(g, me.id)
    if (cons) for (const m of cons.moves) g.transfer(m.from, m.to, m.count)
    const { attack } = npc.chooseAttack(g, me.id)
    if (!attack) { g.endTurn(); check(); continue }
    g.startAttack(attack.source.code, attack.target.code)
    let last = null
    while (g.state.phase === 'attack') {
      last = g.attackRound(rng)
      check()
      if (g.state.phase === 'attack' && !npc.decideContinue(g).continue) { g.stopAttack(); break }
    }
    // after a conquest, garrison the new country (same step the real game performs)
    if (g.state.phase === 'postAttack' && last?.outcome === 'conquered') {
      const plan = npc.planGarrison(g, me.id, last.sourceCode, last.targetCode)
      if (plan) g.transfer(plan.from, plan.to, plan.count)
    }
    if (g.state.phase === 'postAttack') g.endTurn()
    check()
  }
  return g
}

test('20 full NPC games all terminate with a valid winner', () => {
  const rounds = []
  for (let seed = 1; seed <= 20; seed++) {
    const g = playFullGame(seed)
    assert.ok(g.isFinished, `seed ${seed} did not finish`)
    assert.ok(g.state.winnerId)
    if (!g.state.endedByRoundLimit) assert.equal(g.ownedBy(g.state.winnerId).length, 10)
    rounds.push(g.state.round)
  }
  console.log('rounds per game:', rounds.join(', '))
})
