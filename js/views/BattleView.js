// The battle panel: the two country banners (flag, name, health bar, soldier
// icons), the dice, the canvas arena and the commentary line underneath.
// It only displays what it is told; the real fight happens in Game.js.

import { flagUrl } from '../data/countries.js'
import { Arena } from './Arena.js'

// Waits for ms milliseconds.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// At most this many little soldier icons are drawn per side.
const MAX_ICONS = 12

// Makes text safe to put inside HTML (so a name like "<b>" cannot break the page).
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// Builds one die element showing `value` (1-6). It contains 9 hidden dots; CSS shows the right ones.
function makeDie(value) {
  const d = document.createElement('div')
  d.className = 'die'
  d.dataset.v = value                                   // CSS reads data-v to pick the dot pattern
  d.setAttribute('role', 'img')                         // tells screen readers it is a picture...
  d.setAttribute('aria-label', `Die showing ${value}`)  // ...and what it shows
  d.innerHTML = '<i></i>'.repeat(9)                     // the nine possible dots
  return d
}

// Changes the number a die shows.
function setDie(d, value) {
  d.dataset.v = value
  d.setAttribute('aria-label', `Die showing ${value}`)
}

export class BattleView {
  constructor(root, audio) {
    this.root = root                                          // the whole battle panel element
    this.audio = audio                                        // for dice and hit sounds
    this.arena = new Arena(root.querySelector('#arena'))      // the canvas scene
    // The two banners at the top of the scene.
    this.hud = {
      attacker: root.querySelector('#hudAttacker'),
      defender: root.querySelector('#hudDefender')
    }
    // The two rows where dice appear.
    this.diceA = root.querySelector('#diceAttacker')
    this.diceD = root.querySelector('#diceDefender')
    this.caption = root.querySelector('#caption')             // the commentary line
    this.max = { attacker: 1, defender: 1 }                   // soldiers at battle start (for the health bar)
    this.speed = 1
    this.live = false                                         // true while a battle is being shown
  }

  // Speeds up (fast-forward) or slows down every animation in the panel.
  setSpeed(speed) {
    this.speed = speed
    this.arena.setSpeed(speed)
  }

  // Starts showing a battle. Each side = { code, name, owner, soldiers }.
  begin(attacker, defender) {
    this.live = true
    this.arena.begin()
    this.#paintSide('attacker', attacker)
    this.#paintSide('defender', defender)
    this.diceA.replaceChildren()    // clear any old dice
    this.diceD.replaceChildren()
    this.setCaption('')
    this.root.classList.add('live') // CSS reveals the banners and the VS sign
  }

  // Shows one round of dice. `data` is the details of a 'battle_round' event.
  async playRound(data) {
    // Spectators may join mid-battle; start the scene if it is not running yet.
    if (!this.live) {
      this.begin(this.#side(data, 'source'), this.#side(data, 'target'))
    }
    const n = data.pairs.length                       // how many dice per side
    // Show the soldier counts as they were BEFORE this round.
    this.#setCount('attacker', data.attackerBefore)
    this.#setCount('defender', data.defenderBefore)
    this.#rollDice(n)                                 // dice tumble with random faces
    this.audio?.dice()
    await sleep(560 / this.speed)                     // let them tumble for a moment
    this.#showDice(data.pairs)                        // reveal the real numbers
    await sleep(250 / this.speed)

    // Play one duel animation per pair of dice.
    for (let i = 0; i < n; i++) {
      this.#markDuel(i, true)                         // highlight this pair
      data.pairs[i].winner === 'tie' ? this.audio?.clash() : this.audio?.hit()
      await this.arena.duel(data.pairs[i].winner)
      this.#markDuel(i, false)
    }
    // Finally update the counts to the AFTER-round values.
    this.#setCount('attacker', data.attackerBefore - data.attackerLosses)
    this.#setCount('defender', data.defenderBefore - data.defenderLosses)
  }

  // Plays the ending of a battle: a fanfare/sad tone and the loser falling.
  async finish(outcome) {
    if (outcome === 'conquered') this.audio?.conquer()
    else if (outcome === 'failed') this.audio?.defeat()
    await this.arena.finish(outcome)
  }

  // Closes the battle scene and shows a short message on the canvas.
  end(message = '') {
    this.live = false
    this.arena.clear(message)
    this.root.classList.remove('live')
  }

  // Sets the commentary text. `source` is 'Rival' or 'local' (CSS shows a label for each).
  setCaption(text, source) {
    this.caption.textContent = text
    this.caption.dataset.source = source ?? ''
    this.caption.title = source === 'Rival' ? 'Commentary written by a Rival' : source === 'local' ? 'Fallback commentary' : ''
  }

  // ------------------------------------------------------------ internals ------------------------------------------------

  // Extracts the attacker or defender info from a round event's data.
  #side(data, which) {
    const isSource = which === 'source'
    return {
      code: isSource ? data.sourceCode : data.targetCode,
      name: isSource ? data.attackerName : data.defenderName,
      owner: isSource ? data.attackerPlayer : data.defenderPlayer,
      soldiers: isSource ? data.attackerBefore : data.defenderBefore
    }
  }

  // Builds the banner HTML for one side.
  #paintSide(side, info) {
    this.max[side] = Math.max(info.soldiers, 1)       // remember the starting size for the health bar
    this.hud[side].innerHTML = `
      <img class="flag" src="${flagUrl(info.code, 80)}" alt="" onerror="this.style.visibility='hidden'">
      <div class="who"><strong>${esc(info.name)}</strong><span>${esc(info.owner)}</span></div>
      <div class="count"></div>
      <div class="bar"><i></i></div>
      <div class="icons"></div>`
    this.#setCount(side, info.soldiers)
  }

  // Updates a banner's soldier text, health bar and soldier icons.
  #setCount(side, n) {
    const el = this.hud[side]
    const max = this.max[side]
    const shown = Math.min(max, MAX_ICONS)            // never draw more than 12 icons
    el.querySelector('.count').textContent = `${n} Soldier${n === 1 ? '' : 's'}`
    // The health bar width is the share of soldiers still alive (0% to 100%).
    el.querySelector('.bar i').style.width = `${Math.max(0, Math.min(1, n / max)) * 100}%`
    // Lit icons are living soldiers; dimmed ("dead") icons are lost ones.
    el.querySelector('.icons').innerHTML = Array.from({ length: shown }, (_, i) =>
      `<svg class="sico ${i < Math.min(n, shown) ? '' : 'dead'}" viewBox="0 0 100 140"><use href="#soldier"/></svg>`).join('')
  }

  // Creates 'n' tumbling dice on each side and keeps changing their faces.
  #rollDice(n) {
    const make = () => Array.from({ length: n }, () => {
      const d = makeDie(1 + Math.floor(Math.random() * 6))
      d.classList.add('rolling')                      // CSS makes rolling dice wobble
      return d
    })
    this.diceA.replaceChildren(...make())
    this.diceD.replaceChildren(...make())
    clearInterval(this._rollTimer)
    // Every 70ms give each rolling die a new random face
    this._rollTimer = setInterval(() => {
      this.root.querySelectorAll('.die.rolling').forEach((d) => setDie(d, 1 + Math.floor(Math.random() * 6)))
    }, 70)
  }

  // Stops the tumbling and shows the real numbers, coloured as winner/loser/tie
  #showDice(pairs) {
    clearInterval(this._rollTimer)
    pairs.forEach((p, i) => {
      const a = this.diceA.children[i]
      const d = this.diceD.children[i]
      a.classList.remove('rolling')
      d.classList.remove('rolling')
      setDie(a, p.a)
      setDie(d, p.d)
      // The winning die glows, the losing die fades, tied dice get a grey ring
      a.classList.add(p.winner === 'attacker' ? 'won' : p.winner === 'defender' ? 'lost' : 'tied')
      d.classList.add(p.winner === 'defender' ? 'won' : p.winner === 'attacker' ? 'lost' : 'tied')
    })
  }

  // Lifts the pair of dice currently being fought
  #markDuel(i, on) {
    this.diceA.children[i]?.classList.toggle('now', on)
    this.diceD.children[i]?.classList.toggle('now', on)
  }
}
