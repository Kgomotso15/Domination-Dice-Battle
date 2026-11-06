// ============================================================================
// CountryPicker.js
// The "Select your country" screen: a searchable grid of all 196 countries with
// filters for how many soldiers each starts with.
// ============================================================================
import { flagUrl } from '../data/countries.js'
import { soldiersForPopulation } from '../engine/rules.js'
import { filterCountries } from './gameFilter.js'

// Makes text safe to put inside HTML.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
// Formats a population, e.g. 65453084 -> "65.5M".
const millions = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M` : n.toLocaleString())

export class CountryPicker {
  // 'root' = the screen element, 'countries' = the world list, 'onConfirm(code)' = called when the player confirms.
  constructor(root, countries, onConfirm) {
    this.root = root
    // Show the biggest countries first.
    this.countries = [...countries].sort((a, b) => b.population - a.population)
    this.selected = 'ZA'     // South Africa is pre-selected
    this.band = 'all'        // current soldier-band filter
    this.grid = root.querySelector('#countryGrid')
    this.search = root.querySelector('#countrySearch')
    this.info = root.querySelector('#pickerInfo')
    this.onConfirm = onConfirm

    // Redraw the grid as the player types in the search box
    this.search.addEventListener('input', () => this.#render())
    // Clicking a filter chip changes the band.
    root.querySelector('#bandChips').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-band]')
      if (!b) return
      this.band = b.dataset.band
      // Highlight only the chip that was clicked
      root.querySelectorAll('#bandChips button').forEach((x) => x.classList.toggle('on', x === b))
      this.#render()
    })
    // Clicking a country card selects it
    this.grid.addEventListener('click', (e) => {
      const card = e.target.closest('[data-code]')
      if (!card) return
      this.selected = card.dataset.code
      this.#render()
    })
    // The Confirm button hands the chosen country to the app
    root.querySelector('#pickerConfirm').addEventListener('click', () => this.onConfirm(this.selected))
  }

  // Draws the grid and scrolls the selected country into view
  show() {
    this.#render()
    this.grid.querySelector('[aria-checked="true"]')?.scrollIntoView({ block: 'center' })
  }

  #render() {
    // Apply the search text and the soldier-band filter
    const shown = filterCountries(this.countries, { query: this.search.value, band: this.band, soldiersFor: soldiersForPopulation })
    // One card per country; aria-checked marks the selected one (also used by CSS and screen readers).
    this.grid.innerHTML = shown.map((c) => {
      const n = soldiersForPopulation(c.population)
      return `<button type="button" role="radio" class="pick" data-code="${c.code}" aria-checked="${c.code === this.selected}">
        <img src="${flagUrl(c.code, 80)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">
        <b>${esc(c.name)}</b><span>${n} Soldier${n === 1 ? '' : 's'}</span></button>`
    }).join('') || '<p class="muted">No countries match.</p>'

    // The info bar under the grid describes the selected country
    const c = this.countries.find((x) => x.code === this.selected)
    const n = soldiersForPopulation(c.population)
    this.info.textContent = `${c.name}. Population: ${millions(c.population)} | Soldiers: ${n}`
  }
}
