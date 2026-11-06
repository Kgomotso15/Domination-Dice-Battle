// ============================================================================
// LogView.js
// The scrolling game log. Every AI decision (with its reason), every dice roll
// and every commentary line is added here, including during fast-forward.
// ============================================================================

// Makes text safe to put inside HTML.
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// The small label shown on the left of each log line, by event type.
const LABELS = {
  decision: 'Decision',
  battle_start: 'Battle',
  battle_round: 'Roll',
  battle_end: 'Battle',
  commentary: 'Commentary',
  system: 'Game'
}

export class LogView {
  constructor(root) {
    this.root = root       // the <ol> element holding the log
    this.seen = new Set()  // events already shown, so none appears twice
  }

  // Empties the log (used when opening a different game).
  clear() {
    this.root.replaceChildren()
    this.seen.clear()
  }

  // Adds one event to the bottom of the log.
  add(event) {
    // A unique key per event; skip it if we have already shown it.
    const key = `${event.seq}:${event.type}`
    if (event.seq !== undefined && this.seen.has(key)) return
    this.seen.add(key)

    const li = document.createElement('li')
    li.className = `log ${event.type}`                // CSS styles each type differently
    const actor = event.actor ? `<b>${esc(event.actor)}</b> ` : ''
    // Commentary that came from the local fallback is labelled as such.
    const label = event.type === 'commentary' && event.data?.source === 'local' ? 'Commentary (local)' : LABELS[event.type] ?? ''
    li.innerHTML = `<span class="tag">${label}</span><p>${actor}${esc(event.text)}</p>`
    this.root.append(li)

    // Spectators receive the commentary stored INSIDE the round event, so show it as its own line.
    if (event.type === 'battle_round' && event.data?.commentary) {
      this.add({ seq: `${event.seq}c`, type: 'commentary', text: event.data.commentary, data: { source: event.data.commentarySource } })
    }
    // Keep the log from growing forever: drop the oldest lines beyond 400.
    while (this.root.children.length > 400) this.root.firstChild.remove()
    // Scroll to the newest line.
    this.root.scrollTop = this.root.scrollHeight
  }
}
