// ============================================================================
// GameScreen.js
// Ties the game page's HTML elements to the individual views (battle panel,
// board, log, controls) and owns the popups (Your turn banner, intro card,
// victory/defeat dialog). It contains NO game logic.
// ============================================================================
import { BattleView } from './BattleView.js'
import { BoardView } from './BoardView.js'
import { ControlsView } from './ControlsView.js'
import { LogView } from './LogView.js'

// Small SVG pictures for the result popup: a crown for victory, a skull for defeat.
const CROWN = '<svg viewBox="0 0 64 64"><path d="M6 20l12 12 14-20 14 20 12-12-5 32H11zM12 56h40v4H12z"/></svg>'
const SKULL = '<svg viewBox="0 0 64 64"><path d="M32 4C18 4 8 14 8 28c0 8 4 14 10 17v9h8v-5h4v5h4v-5h4v5h8v-9c6-3 10-9 10-17C56 14 46 4 32 4zM22 36a6 6 0 1 1 0-12 6 6 0 0 1 0 12zm20 0a6 6 0 1 1 0-12 6 6 0 0 1 0 12z"/></svg>'

export class GameScreen {
  // `root` = the game section, `handlers` = callbacks from the app, `audio` = sound player.
  constructor(root, handlers, audio) {
    this.root = root
    this.audio = audio
    this.handlers = handlers
    // Create each view and give it the part of the page it controls.
    this.battle = new BattleView(root.querySelector('#arenaPanel'), audio)
    this.board = new BoardView(root.querySelector('#board'), root.querySelector('#players'), handlers.onPick)
    this.log = new LogView(root.querySelector('#log'))
    this.controls = new ControlsView(root.querySelector('#controls'), handlers)
    // Header elements.
    this.titleEl = root.querySelector('#gameTitle')
    this.statusEl = root.querySelector('#statusLine')
    this.modeEl = root.querySelector('#modeBadge')
    this.roundEl = root.querySelector('#roundBadge')
    // The victory / defeat popup and the "Your turn" banner.
    this.dialog = document.querySelector('#resultDialog')
    this.flashEl = root.querySelector('#turnFlash')
  }

  // Updates the page header: title, status line, Playing/Watching badge and round number.
  setHeader({ title, status, mode, round }) {
    this.titleEl.textContent = title
    this.statusEl.textContent = status
    this.modeEl.textContent = mode === 'play' ? 'Playing' : 'Watching'
    this.modeEl.dataset.mode = mode
    this.roundEl.textContent = `Round ${round}`
  }

  // Shows or hides the full-screen loading overlay.
  setLoading(on) {
    document.querySelector('#loading').classList.toggle('done', !on)
  }

  // A big banner across the battle scene, e.g. "Your turn".
  flash(text) {
    this.flashEl.textContent = text
    this.flashEl.classList.remove('show')
    void this.flashEl.offsetWidth          // forces the browser to restart the CSS animation
    this.flashEl.classList.add('show')
  }

  // Shows the "how your game works" card once per browser. Resolves when the player clicks Start.
  showIntro() {
    const KEY = 'gdb.intro'
    // If they have seen it before, skip straight on.
    try { if (localStorage.getItem(KEY)) return Promise.resolve() } catch { /* ignore */ }
    const d = document.querySelector('#introDialog')
    return new Promise((resolve) => {
      d.querySelector('#introStart').onclick = () => {
        try { localStorage.setItem(KEY, '1') } catch { /* ignore */ }   // remember they have seen it
        d.close()
        resolve()
      }
      d.showModal()
    })
  }

  // Shows the victory or defeat popup. kind = 'victory' | 'defeat'; `buttons` = [{label, action, primary}].
  showResult(kind, text, buttons) {
    const d = this.dialog
    d.className = `modal result ${kind}`                                   // CSS colours it gold/rose or dark
    d.querySelector('#resultIcon').innerHTML = kind === 'victory' ? CROWN : SKULL
    d.querySelector('#resultTitle').textContent = kind === 'victory' ? 'Victory!' : 'Defeat'
    d.querySelector('#resultText').textContent = text
    const row = d.querySelector('#resultButtons')
    row.innerHTML = buttons.map((b) => `<button type="button" class="${b.primary ? 'btn-primary' : 'btn-soft'}" data-action="${b.action}">${b.label}</button>`).join('')
    // When a button is pressed, close the popup and tell the app which action was chosen.
    row.onclick = (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action
      if (!action) return
      d.close()
      this.handlers.onResult(action)
    }
    if (!d.open) d.showModal()
    kind === 'victory' ? this.audio?.victory() : this.audio?.defeat()
  }
}
