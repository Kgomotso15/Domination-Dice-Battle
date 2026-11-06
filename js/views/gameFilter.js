// ============================================================================
// gameFilter.js
// Two small PURE functions (numbers/lists in, list out) that power the search
// boxes and filters. They live apart from the screens so they can be unit tested.
// ============================================================================

// Filters the list of games by a search word and a status ('all' | 'active' | 'finished').
export function filterGames(games, { query = '', status = 'all' } = {}) {
  const q = query.trim().toLowerCase()   // search text, ignoring case and spaces at the ends
  return games.filter((g) => {
    const finished = g.status === 'finished'
    // Status filter: drop games that do not match the chosen status.
    if (status === 'finished' && !finished) return false
    if (status === 'active' && finished) return false
    // No search text: keep everything that passed the status filter.
    if (!q) return true
    // Otherwise the search word must appear in the country name or the owner's name.
    return `${g.humanCountry ?? ''} ${g.ownerName ?? ''}`.toLowerCase().includes(q)
  })
}

// Filters countries by a search word and a starting-soldier band such as '4-6' (or 'all').
export function filterCountries(countries, { query = '', band = 'all', soldiersFor }) {
  const q = query.trim().toLowerCase()
  // Turn '4-6' into the numbers 4 and 6; 'all' means 0 to 99.
  const [lo, hi] = band === 'all' ? [0, 99] : band.split('-').map(Number)
  return countries.filter((c) => {
    const n = soldiersFor(c.population)   // this country's starting soldiers
    // Keep it if its soldiers are inside the band AND its name contains the search text.
    return n >= lo && n <= hi && (!q || c.name.toLowerCase().includes(q))
  })
}
