// A searchable, filterable list of games (used for "Your campaigns" and "Live games").
// Expects a search box, a status dropdown and a <ul> inside the element it is given.

import { flagUrl } from '../data/countries.js'
import { filterGames } from './gameFilter.js'

// Makes text safe to put inside HTML
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

export class GameListView {
  constructor(root) {
    this.root = root
    this.search = root.querySelector('input[type="search"]')   // the search box
    this.status = root.querySelector('select')                 // the status dropdown
    this.list = root.querySelector('ul')                       // where the rows go
    this.games = []                                            // all games received from the database
    // Redraw the list whenever the player types or changes the dropdown
    this.search.addEventListener('input', () => this.#render())
    this.status.addEventListener('change', () => this.#render())
  }

  // Gives the list its data and draws it
  setGames(games) { this.games = games; this.#render() }
  // Shows a single message instead of games (for "Loading…" or errors).
  setMessage(text) { this.list.innerHTML = `<li class="empty">${esc(text)}</li>` }

  // Draws the rows that match the current search and filter
  #render() {
    const shown = filterGames(this.games, { query: this.search.value, status: this.status.value })
    // Nothing to show: say why.
    if (!shown.length) {
      return this.setMessage(this.games.length ? 'No games match your search.' : 'Nothing here yet.')
    }
    this.list.innerHTML = shown.map((g) => {
      const done = g.status === 'finished'
      const won = done && g.winnerId === 'p0'   // p0 is always the human player
      // A small status chip: "Won", "Lost" or "Round N".
      const chip = done ? `<span class="chip ${won ? 'won' : 'lost'}">${won ? 'Won' : 'Lost'}</span>` : `<span class="chip">Round ${g.round ?? 1}</span>`
      const flag = g.humanCode ? `<img src="${flagUrl(g.humanCode, 40)}" alt="" onerror="this.style.visibility='hidden'">` : '<span></span>'
      // Each row is a link to ?game=ID, which opens that game.
      return `<li><a href="?game=${esc(g.id)}">${flag}<span><strong>${esc(g.humanCountry)}</strong><small>${esc(g.ownerName)}</small></span>${chip}</a></li>`
    }).join('')
  }
}
