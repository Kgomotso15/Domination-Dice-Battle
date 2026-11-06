// The action panel under the battle scene. It only draws buttons and sends
// every click to the controller; the Game class decides if a move is allowed.
// What it shows depends on the situation: placing reinforcements, picking an
// attack, rolling dice, waiting for the rival, watching as a visitor, or game over.

// Makes text safe to put inside HTML
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export class ControlsView {
  // 'root' = the panel element; 'handlers' = functions to call when buttons are pressed.
  constructor(root, handlers) {
    this.root = root
    this.h = handlers
    this.alloc = {}       // soldiers the player has placed so far, e.g. { ZA: 2 }
    this.allocKey = ''    // identifies the current reinforcement round, to reset 'alloc' when it changes
    // One click listener for the whole panel (event delegation).
    root.addEventListener('click', (e) => this.#click(e))
    // Typing in the "soldiers to move" box tells the controller the new number.
    root.addEventListener('input', (e) => {
      if (e.target.id === 'moveCount') this.h.onMoveCount(Number(e.target.value))
    })
  }

  // Redraws the panel. 'mode' is 'play' (the owner) or 'watch' (a visitor).
  render({ game, mode, selection, fast, thinking, moveCount, turnsUntil }) {
    const s = game.state
    const me = game.human
    let html = ''

    if (game.isFinished) {
      // ----------------------------------- Game over: show who won -----------------------------------------
      const winner = game.player(s.winnerId)
      html = `<p class="banner ${winner.isHuman ? 'win' : 'lose'}">${
        winner.isHuman ? 'You conquered the world!' : `${esc(winner.name)} conquered the world.`}${
        s.endedByRoundLimit ? ' (Round limit reached: winner decided on countries and soldiers.)' : ''}</p>`
    } else if (mode === 'watch') {
      // ----------------------------------- A visitor watching: read-only -----------------------------------------
      html = `<p class="hint">You are watching this game live. ${game.currentPlayer.isHuman ? `${esc(game.currentPlayer.name)} is deciding.` : `${esc(game.currentPlayer.name)} is playing.`}</p>
        <button type="button" class="btn-primary" data-act="signin">Sign in to play your own game</button>`
    } else if (!game.currentPlayer.isHuman) {
      // ----------------------------------- A rival general is playing: the human just waits (or skips ahead) -----------------------------------------
      const wait = turnsUntil === null ? '' : turnsUntil === 0 ? ' You are next.' : ` ${turnsUntil} more Rival turn${turnsUntil === 1 ? '' : 's'} before yours.`
      html = `<p class="hint"><b>Waiting for the rivals.</b> ${esc(game.currentPlayer.name)} is playing${thinking ? '…' : '.'}${wait} Nothing is needed from you yet. Every Rival decision and its reason appears in the log.</p>
        <button type="button" class="${fast ? 'btn-primary' : 'btn-soft'}" data-act="fast">${
          fast ? 'Skipping ahead. Tap to slow down' : 'Skip ahead to my turn'}</button>`
    } else {
      // ---- It is the human's turn ----
      html = this.#humanControls(game, me, selection, moveCount)
    }
    this.root.innerHTML = html
  }

  // The buttons shown on the human's own turn.
  #humanControls(game, me, selection, moveCount) {
    const s = game.state
    const mine = game.ownedBy(me.id)
    // The countries the player has tapped on the board.
    const from = selection.from ? game.country(selection.from) : null
    const to = selection.to ? game.country(selection.to) : null

    // ----------------------------------------- Phase 1: placing reinforcements -----------------------------------------
    if (s.phase === 'reinforce') {
      // Start with a clean allocation whenever a new reinforcement round begins.
      const key = `${s.round}:${s.reinforcePool}`
      if (key !== this.allocKey) { this.allocKey = key; this.alloc = {} }
      const used = Object.values(this.alloc).reduce((a, b) => a + b, 0)
      const left = s.reinforcePool - used   // soldiers still to place
      return `<p class="hint"><b>Round ${s.round}.</b> You receive ${s.reinforcePool} new soldiers. Place them anywhere you like.</p>
        <ul class="alloc">${mine.map((c) => `<li><span>${esc(c.name)} <small>${c.soldiers}${this.alloc[c.code] ? ` + ${this.alloc[c.code]}` : ''}</small></span>
          <button type="button" data-act="alloc-" data-code="${c.code}" ${this.alloc[c.code] ? '' : 'disabled'} aria-label="Remove one">−</button>
          <button type="button" data-act="alloc+" data-code="${c.code}" ${left ? '' : 'disabled'} aria-label="Add one">+</button></li>`).join('')}</ul>
        <button type="button" class="btn-primary" data-act="alloc-confirm" ${left ? 'disabled' : ''}>${left ? `Place ${left} more` : 'Confirm placement'}</button>`
    }

    // ---------------------------------------- Phase 3: an attack is in progress -----------------------------------------
    if (s.phase === 'attack') {
      const a = game.country(s.attack.sourceCode)
      const d = game.country(s.attack.targetCode)
      return `<p class="hint">${esc(a.name)} (${a.soldiers}) is attacking ${esc(d.name)} (${d.soldiers}). Roll again or stop. Stopping ends your turn.</p>
        <div class="row"><button type="button" class="roll" data-act="roll">Roll the dice!</button>
        <button type="button" data-act="stop">Stop attack</button></div>`
    }

    // ----------------------------------------- Phase 2 / 4: choosing an attack or moving soldiers -----------------------------------------
    // Attack needs: your country (2+ soldiers) selected first, an enemy second, and no attack used yet.
    const canAttack = s.phase === 'action' && from && to && from.ownerId === me.id && to.ownerId !== me.id && from.soldiers >= 2
    // Moving needs two of your own countries, with the source having at least 2 soldiers.
    const canMove = from && to && from.ownerId === me.id && to.ownerId === me.id && from.soldiers >= 2
    // You can move at most (soldiers - 1), because 1 must stay behind.
    const max = from ? Math.max(from.soldiers - 1, 1) : 1
    // Keep the typed number inside the allowed range.
    const count = Math.min(Math.max(moveCount || 1, 1), max)
    // A sentence that tells the player what their current selection means.
    const pickText = !from ? 'Tap one of your countries, then a second country.'
      : !to ? `${esc(from.name)} selected. Tap an enemy to attack, or one of your countries to move soldiers.`
      : to.ownerId !== me.id ? `${esc(from.name)} (${from.soldiers}) → ${esc(to.name)} (${to.soldiers})${from.soldiers < 2 ? '. Needs at least 2 soldiers to attack.' : ''}`
      : `Move soldiers from ${esc(from.name)} to ${esc(to.name)}.`

    return `<p class="hint">${s.phase === 'postAttack' ? 'Attack over. Choose how many extra soldiers to move in, or end your turn.' : `<b>Round ${s.round}.</b> Your turn.`} ${pickText}</p>
      <div class="row">
        ${s.phase === 'action' ? `<button type="button" class="btn-primary" data-act="attack" ${canAttack ? '' : 'disabled'}>Attack</button>` : ''}
        <label class="move"><input id="moveCount" type="number" min="1" max="${max}" value="${count}" ${canMove ? '' : 'disabled'} aria-label="Soldiers to move">
        <button type="button" data-act="move-max" ${canMove ? '' : 'disabled'} title="Move everyone except 1 soldier">Max</button>
        <button type="button" data-act="move" ${canMove ? '' : 'disabled'}>Move soldiers</button></label>
        <button type="button" data-act="end">${s.phase === 'postAttack' ? 'End turn' : 'Skip turn'}</button>
      </div>`
  }

  // Handles every button press in the panel.
  #click(e) {
    // Find the button (if any) that was clicked, and ignore disabled ones.
    const btn = e.target.closest('button[data-act]')
    if (!btn || btn.disabled) return
    // data-act says WHAT the button does; data-code says which country (for + / -).
    const { act, code } = btn.dataset
    if (act === 'alloc+') { this.alloc[code] = (this.alloc[code] ?? 0) + 1; this.h.onRefresh() }
    else if (act === 'alloc-') { this.alloc[code] = Math.max((this.alloc[code] ?? 0) - 1, 0); this.h.onRefresh() }
    else if (act === 'alloc-confirm') this.h.onCommand({ type: 'allocate', allocations: { ...this.alloc } })
    else if (act === 'attack') this.h.onCommand({ type: 'attack' })
    else if (act === 'roll') this.h.onCommand({ type: 'roll' })
    else if (act === 'stop') this.h.onCommand({ type: 'stop' })
    else if (act === 'move') this.h.onCommand({ type: 'move' })
    else if (act === 'move-max') this.h.onMoveMax()
    else if (act === 'end') this.h.onCommand({ type: 'end' })
    else if (act === 'fast') this.h.onToggleFast()
    else if (act === 'signin') this.h.onSignIn()
  }
}
