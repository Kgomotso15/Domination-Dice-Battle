// ============================================================================
// NpcStrategy.js
// The "brain" of the AI generals. It NEVER changes the game itself. It only
// looks at the board and returns a plan plus a plain-English reason, which the
// controller then applies through the Game class (so the AI obeys the same
// rules as the human) and shows in the game log.
// ============================================================================
import { conquestReward, resolveRound } from './rules.js'

// Three personalities. They share the same logic and differ only in these numbers.
export const NPC_PROFILES = {
  aggressor: {
    label: 'Aggressor',
    minWin: 0.35,      // attacks when the chance of conquering is at least 35%
    stopBelow: 0.18,   // gives up an attack if the chance drops under 18%
    reserve: 4,        // keeps up to 4 soldiers in each non-main country when consolidating
    reinforce: 'concentrate', // puts all new soldiers into its strongest country
    blurb: 'Attacks on thin odds and piles reinforcements onto one strike force.'
  },
  balanced: {
    label: 'Balanced',
    minWin: 0.5,
    stopBelow: 0.3,
    reserve: 5,
    reinforce: 'spread',      // spreads new soldiers across weak countries
    blurb: 'Attacks when the odds favour it and keeps its holdings evenly garrisoned.'
  },
  defender: {
    label: 'Defender',
    minWin: 0.65,
    stopBelow: 0.4,
    reserve: 6,
    reinforce: 'spread',
    blurb: 'Only attacks safe targets and spreads reinforcements.'
  }
}

// Formats 0.734 as "73%" for the explanations.
const pct = (p) => `${Math.round(p * 100)}%`

// Estimates the chance of conquering a country by simulating the whole attack many times
// (a "Monte Carlo" estimate). It keeps rolling until the defender is out or the attacker hits 1.
export function winProbability(attackerSoldiers, defenderSoldiers, sims = 300, rng = Math.random) {
  // With fewer than 2 soldiers you cannot attack at all.
  if (attackerSoldiers < 2) return 0
  let wins = 0
  // Run the attack `sims` times.
  for (let i = 0; i < sims; i++) {
    let a = attackerSoldiers
    let d = defenderSoldiers
    // Keep fighting while the attacker has more than 1 soldier and the defender has some.
    while (a > 1 && d > 0) {
      const r = resolveRound(a, d, rng)
      a -= r.attackerLosses
      d -= r.defenderLosses
    }
    // If the defender ran out of soldiers, that simulated attack was a win.
    if (d <= 0) wins++
  }
  // The share of simulated attacks that won is our estimate of the chance.
  return wins / sims
}

export class NpcStrategy {
  // `profileKey` is 'aggressor' | 'balanced' | 'defender'. `rng` can be faked in tests.
  constructor(profileKey, rng = Math.random) {
    // Fall back to "balanced" if the key is unknown.
    this.profile = NPC_PROFILES[profileKey] ?? NPC_PROFILES.balanced
    this.rng = rng
  }

  // Decides where to place this turn's new soldiers.
  planReinforcements(game, playerId) {
    const pool = game.state.reinforcePool          // how many soldiers to place
    const owned = game.ownedBy(playerId)           // the countries this AI owns
    const allocations = {}                         // result, e.g. { FR: 4 }
    const sim = Object.fromEntries(owned.map((c) => [c.code, c.soldiers])) // working copy of counts
    // Gives one soldier to a country (in the plan only; the real change happens later).
    const give = (code) => { sim[code]++; allocations[code] = (allocations[code] ?? 0) + 1 }
    // The weakest country right now.
    const weakest = () => Object.keys(sim).sort((a, b) => sim[a] - sim[b])[0]

    // Step 1: SECURE. Bring weak countries up to the safe floor first, so a rival's big stack
    // cannot simply take them (without this, two big players just trade countries forever).
    const floor = this.#safeFloor(game, playerId)
    let left = pool
    while (left > 0 && sim[weakest()] < floor) { give(weakest()); left-- }
    const secured = pool - left

    // Step 2: the rest follows this personality's style.
    let style
    if (this.profile.reinforce === 'concentrate') {
      // Put everything left into the country that already has the most soldiers.
      const strongest = Object.keys(sim).sort((a, b) => sim[b] - sim[a])[0]
      for (; left > 0; left--) give(strongest)
      style = `the rest into ${game.country(strongest).name} to build one strong attacking force`
    } else {
      // Spread: one soldier at a time to whichever country is weakest.
      for (; left > 0; left--) give(weakest())
      style = 'the rest spread across its weakest holdings'
    }
    return {
      allocations,
      reason: `Placing ${pool} new soldiers: ${secured ? `${secured} to bring weak holdings up to ${floor}, ` : ''}${style}.`
    }
  }

  // How many soldiers a country should have to be reasonably safe: about 60% of the biggest
  // enemy stack. (Attackers rarely bother when the odds are below 50%.)
  #safeFloor(game, playerId) {
    const biggestEnemy = Math.max(0, ...game.countries.filter((c) => c.ownerId !== playerId).map((c) => c.soldiers))
    return Math.ceil(biggestEnemy * 0.6)
  }

  // Decides whether to move spare soldiers into the strongest country before attacking.
  planConsolidation(game, playerId) {
    // Sort the AI's countries from most to fewest soldiers.
    const owned = [...game.ownedBy(playerId)].sort((a, b) => b.soldiers - a.soldiers)
    // With only one country there is nothing to move.
    if (owned.length < 2) return null
    const [strongest, ...rest] = owned
    // Each other country keeps at least its personality's reserve AND the safe floor.
    const keep = Math.max(this.profile.reserve, this.#safeFloor(game, playerId))
    // Every other country with more than that gives the extra to the strongest.
    const moves = rest
      .filter((c) => c.soldiers > keep)
      .map((c) => ({ from: c.code, to: strongest.code, count: c.soldiers - keep }))
    if (!moves.length) return null
    const total = moves.reduce((s, m) => s + m.count, 0)
    return {
      moves,
      reason: `Moving ${total} spare soldiers into ${strongest.name}, leaving ${keep} at each other holding, to attack with more dice.`
    }
  }

  // Looks at every possible attack and picks the best one (or decides to skip).
  chooseAttack(game, playerId) {
    // Only countries with 2+ soldiers can attack.
    const owned = game.ownedBy(playerId).filter((c) => c.soldiers >= 2)
    // While the opening shield is up, AI generals may not attack the human.
    const shielded = (c) => game.state.openingShield && game.player(c.ownerId).isHuman
    // Possible targets: every country not owned by this AI (and not shielded).
    const enemies = game.countries.filter((c) => c.ownerId !== playerId && !shielded(c))
    let best = null     // best option that meets this personality's minimum odds
    let bestAny = null  // best option overall (used to explain a skipped turn)

    // Try every (my country, enemy country) pair.
    for (const src of owned) {
      for (const tgt of enemies) {
        // Chance of conquering this target from this source.
        const p = winProbability(src.soldiers, tgt.soldiers, 150, this.rng)
        // The reward uses the target's ORIGINAL soldier value, matching the real rule.
        const reward = conquestReward(tgt.baseSoldiers)
        // How many countries the target's owner has (fewer = easier to knock out).
        const ownerCountries = game.ownedBy(tgt.ownerId).length
        const eliminates = ownerCountries === 1
        // How attractive the target is: the reward, +2 for the extra income every new country
        // brings, a big bonus for eliminating a rival, and a small bonus for focusing on small rivals.
        const value = reward + 2 + (eliminates ? 4 : 0) + 3 / ownerCountries
        // Expected gain minus a penalty for the soldiers likely lost if the attack fails.
        const score = p * value - (1 - p) * (src.soldiers - 1) * 0.25
        const option = { source: src, target: tgt, winProb: p, reward, eliminates, score }
        // Remember the best overall option...
        if (!bestAny || score > bestAny.score) bestAny = option
        // ...and the best option that is good enough for this personality.
        if (p >= this.profile.minWin && (!best || score > best.score)) best = option
      }
    }

    // Nothing good enough: skip the attack and explain why.
    if (!best) {
      if (!bestAny) return { attack: null, reason: 'No country has 2 or more soldiers, so there is nothing to attack with.' }
      return {
        attack: null,
        reason: `Best option was ${bestAny.source.name} (${bestAny.source.soldiers}) vs ${bestAny.target.name} (${bestAny.target.soldiers}) at only ${pct(bestAny.winProb)}. The ${this.profile.label} profile needs ${pct(this.profile.minWin)}, so it skips the attack.`
      }
    }
    // Otherwise attack, and explain the choice.
    const { source: s, target: t } = best
    const extras = [best.eliminates ? `it would knock ${game.player(t.ownerId).name} out of the game` : null].filter(Boolean)
    return {
      attack: best,
      reason: `Attacking ${t.name} (${t.soldiers}) from ${s.name} (${s.soldiers}): about ${pct(best.winProb)} to conquer for +${best.reward} soldiers${extras.length ? `, and ${extras.join(' and ')}` : ''}.`
    }
  }

  // After conquering a country, decides how many soldiers to move into it from the attacking
  // country. A fresh conquest only holds the 2-soldier reward, so without this it would be
  // retaken immediately and the two sides would just trade the same countries back and forth.
  planGarrison(game, playerId, sourceCode, targetCode) {
    const src = game.country(sourceCode)
    const tgt = game.country(targetCode)
    // Both countries must belong to this AI (the conquest must have succeeded).
    if (!src || !tgt || src.ownerId !== playerId || tgt.ownerId !== playerId) return null
    // Even the two out: move half of the difference (rounded down).
    const count = Math.floor((src.soldiers - tgt.soldiers) / 2)
    if (count < 1) return null
    return {
      from: src.code,
      to: tgt.code,
      count,
      reason: `Moving ${count} soldiers from ${src.name} into newly conquered ${tgt.name} so it cannot be retaken easily.`
    }
  }

  // After each round of an attack, decides whether to keep going or withdraw.
  decideContinue(game) {
    const { sourceCode, targetCode } = game.state.attack
    const a = game.country(sourceCode).soldiers
    const d = game.country(targetCode).soldiers
    // Re-estimate the odds from the CURRENT soldier counts.
    const p = winProbability(a, d, 250, this.rng)
    if (p >= this.profile.stopBelow) {
      return { continue: true, winProb: p, reason: `Odds are still ${pct(p)} at ${a} vs ${d}, above the ${pct(this.profile.stopBelow)} cut-off. Pressing on.` }
    }
    return { continue: false, winProb: p, reason: `Odds have dropped to ${pct(p)} at ${a} vs ${d}, below the ${pct(this.profile.stopBelow)} cut-off. Withdrawing to keep the soldiers.` }
  }
}
