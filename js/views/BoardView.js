// Draws the strip of players and the grid of the 10 countries. Both are always
// visible during a game and always show live soldier counts.

import { flagUrl } from '../data/countries.js'
import { NPC_PROFILES } from '../engine/NpcStrategy.js'

// Makes text safe to put inside HTML.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export class BoardView {
  // 'boardEl' = where the country cards go, 'playersEl' = where the player chips go,
  // 'onPick(code)' = called when a country card is clicked.
  constructor(boardEl, playersEl, onPick) {
    this.boardEl = boardEl
    this.playersEl = playersEl
    this.previous = {}   // soldier counts from the last draw, used to spot changes
    // One click listener on the whole board (event delegation) instead of one per card.
    boardEl.addEventListener('click', (e) => {
      const card = e.target.closest('[data-code]')   // find the card that was clicked
      if (card) onPick(card.dataset.code)
    })
  }

  // Redraws everything from the current game state.
  // 'selection' = { from, to } country codes; 'interactive' = can the human click cards now?
  render(game, { selection = {}, interactive = false } = {}) {
    const s = game.state
    const current = game.currentPlayer.id   // whose turn it is

    // -------------------------------------------------- The player strip --------------------------------------------------
    this.playersEl.innerHTML = s.players.map((p) => {
      const owned = game.ownedBy(p.id)
      const soldiers = owned.reduce((n, c) => n + c.soldiers, 0)
      // Humans get the tag "You"; rival generals show their personality (Aggressor, Balanced, Defender).
      const tag = p.isHuman ? 'You' : NPC_PROFILES[p.profile]?.label ?? ''
      // CSS classes: dim eliminated players, highlight the player whose turn it is.
      const cls = [p.eliminated ? 'out' : '', p.id === current && !game.isFinished ? 'turn' : ''].join(' ')
      return `<li class="${cls}" style="--c:${p.color}" title="${esc(p.name)}">
        <i></i><b>${esc(p.name)}</b><span>${tag}</span>
        <em>${p.eliminated ? 'eliminated' : `${owned.length} countries, ${soldiers} soldiers`}</em></li>`
    }).join('')

    // -------------------------------------------------- The country cards --------------------------------------------------
    // Show the human's countries first, then group the rest by owner.
    const order = [...game.countries].sort((a, b) =>
      (game.player(a.ownerId).isHuman ? -1 : 0) - (game.player(b.ownerId).isHuman ? -1 : 0) ||
      a.ownerId.localeCompare(b.ownerId, undefined, { numeric: true }))

    this.boardEl.innerHTML = order.map((c) => {
      const owner = game.player(c.ownerId)
      // CSS classes decide the look of the card.
      const cls = [
        'country',
        owner.isHuman ? 'mine' : '',                                // the human's countries glow
        selection.from === c.code ? 'from' : '',                    // selected as the attacker/source
        selection.to === c.code ? 'to' : '',                        // selected as the target
        // "changed" makes the number pulse when its soldier count changed since the last draw.
        this.previous[c.code] !== undefined && this.previous[c.code] !== c.soldiers ? 'changed' : '',
        interactive ? 'pickable' : ''                               // shows a pointer cursor
      ].join(' ')
      return `<button type="button" class="${cls}" data-code="${c.code}" style="--c:${owner.color}">
        <img src="${flagUrl(c.code, 80)}" alt="" onerror="this.style.visibility='hidden'">
        <span class="name">${esc(c.name)}</span>
        <span class="owner">${owner.isHuman ? 'Yours: ' : 'Held by '}${esc(owner.name)}</span>
        <span class="n">${c.soldiers}</span>
      </button>`
    }).join('')

    // Remember these counts so the NEXT draw can tell what changed.
    this.previous = Object.fromEntries(game.countries.map((c) => [c.code, c.soldiers]))
  }
}
