// ============================================================================
// AppController.js
// Page-level wiring for the whole app: which screen is showing (menu, command
// centre, country picker, game), sign in / sign out, the settings dialog, music,
// and opening a game from the web address (?game=ID).
// ============================================================================
import { COUNTRIES } from '../data/countries.js'
import { Game } from '../engine/Game.js'
import { AudioService } from '../services/AudioService.js'
import { AuthService } from '../services/AuthService.js'
import { CommentaryService } from '../services/CommentaryService.js'
import { GameRepository } from '../services/GameRepository.js'
import { CountryPicker } from '../views/CountryPicker.js'
import { GameListView } from '../views/GameListView.js'
import { GameScreen } from '../views/GameScreen.js'
import { GameController } from './GameController.js'

// Shortcut: find one element on the page by CSS selector.
const $ = (sel) => document.querySelector(sel)
// Makes text safe to put inside HTML.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
// The four full-page screens. Exactly one is visible at a time.
const SCREENS = ['menu', 'hub', 'select', 'game']

export class AppController {
  constructor() {
    this.auth = new AuthService()                    // sign in / out
    this.repo = new GameRepository()                 // database
    this.audio = new AudioService()                  // music and sound effects
    this.commentary = new CommentaryService(() => this.auth.idToken())  // AI commentary
    this.user = null                                 // the signed-in user (null = visitor)
    this.current = null                              // the GameController of the open game
    this.authMode = 'signin'                         // sign-in dialog shows 'signin' or 'signup'
    this.afterAuth = null                            // what to do right after a successful sign-in
    this.screen = null                               // the GameScreen (created the first time a game opens)
  }

  // Starts the app.
  init() {
    // The two searchable game lists and the country picker.
    this.myList = new GameListView($('#myBlock'))
    this.liveList = new GameListView($('#liveBlock'))
    this.picker = new CountryPicker($('#select'), COUNTRIES, (code) => this.#startNewGame(code))
    this.#bindStaticUi()
    // Failsafe: never trap the player behind the loading screen.
    setTimeout(() => this.#loading(false), 6000)
    // Runs now, and again whenever someone signs in or out.
    this.auth.onChange((user) => {
      const changed = (user?.uid ?? null) !== (this.user?.uid ?? null)
      this.user = user
      if (user) this.repo.saveUserProfile(user).catch(() => {})
      this.#renderUser()
      // Re-route on the first run and whenever the signed-in user really changes.
      if (changed || !this.routed) {
        this.routed = true
        this.#route()
      }
      // If we are not opening a game, hide the loading screen now.
      if (!new URLSearchParams(location.search).get('game')) this.#loading(false)
    })
  }

  // ------------------------------------------------- screens and routing ----

  // Shows one screen and hides the others. Also switches the music track:
  // the soft menu track on every screen except the game itself.
  #show(name) {
    SCREENS.forEach((s) => { $(`#${s}`).hidden = s !== name })
    this.audio.setTrack(name === 'game' ? 'game' : 'menu')
    window.scrollTo(0, 0)
  }

  // Shows or hides the full-screen loading overlay.
  #loading(on) { $('#loading').classList.toggle('done', !on) }

  // Decides what to show based on the web address: ?game=ID opens that game, otherwise the menu.
  #route() {
    this.current?.stop()            // leave any game we were in
    this.current = null
    const gameId = new URLSearchParams(location.search).get('game')
    if (gameId) this.#openGame(gameId)
    else this.#show('menu')
  }

  // Opens the command centre (lists of games).
  #goHub() {
    this.#show('hub')
    $('#myBlock').hidden = !this.user     // "Your campaigns" only makes sense when signed in
    this.#loadLists()
  }

  // Opens the country picker.
  #goSelect() {
    this.#show('select')
    this.picker.show()
  }

  // Runs `action` now if signed in; otherwise asks the player to sign in first, then runs it.
  #requireLogin(action) {
    if (this.user) return action()
    this.afterAuth = action
    this.#openAuth('signin')
  }

  // Opens a game page for the given game id.
  #openGame(gameId) {
    this.#show('game')
    this.#loading(true)
    // Create the GameScreen once, the first time a game is opened.
    if (!this.screen) {
      this.screen = new GameScreen($('#game'), {
        // These callbacks are how the views talk back to the current GameController.
        onPick: (code) => this.current?.pick(code),
        onCommand: (cmd) => this.current?.dispatch(cmd),
        onToggleFast: () => this.current?.toggleFast(),
        onMoveCount: (n) => this.current?.setMoveCount(n),
        onMoveMax: () => this.current?.setMoveMax(),
        onRefresh: () => this.current?.refresh(),
        onSignIn: () => this.#openAuth('signin'),
        onResult: (action) => this.#onResult(action)
      }, this.audio)
    }
    // Reset the screen for the new game.
    this.screen.log.clear()
    this.screen.battle.end('Waiting for the first battle')
    this.screen.battle.setCaption('')
    // Create and start the controller that runs this game.
    this.current = new GameController({
      gameId, user: this.user, repo: this.repo, commentary: this.commentary, screen: this.screen,
      toast: (m) => this.#toast(m), requestSignIn: () => this.#openAuth('signin')
    })
    this.current.start()
    // Failsafe: never leave the loading screen up if the game cannot be reached.
    setTimeout(() => this.#loading(false), 8000)
  }

  // The player pressed a button in the victory/defeat popup.
  #onResult(action) {
    if (action === 'watch') return                      // "Watch it play out": just close the popup
    this.current?.stop()
    this.current = null
    history.pushState({}, '', location.pathname)        // remove ?game=ID from the address bar
    if (action === 'new') this.#requireLogin(() => this.#goSelect())
    else this.#goHub()
  }

  // ----------------------------------------------------------------- hub ----

  // Loads both game lists from the database.
  async #loadLists() {
    // Helper: show "Loading…", then the games, or an error message.
    const load = async (list, loader) => {
      list.setMessage('Loading…')
      try { list.setGames(await loader()) }
      catch (e) { list.setMessage(`Could not load games (${e.code ?? e.message}).`) }
    }
    load(this.liveList, () => this.repo.listRecent())
    if (this.user) load(this.myList, () => this.repo.listMine(this.user.uid))
  }

  // Creates a new game for the chosen country and opens it.
  async #startNewGame(code) {
    // Only signed-in users can start games.
    if (!this.user) return this.#requireLogin(() => this.#startNewGame(code))
    this.#loading(true)
    try {
      // Build the game (picks 9 random rivals, deals soldiers, picks who goes first).
      const game = Game.create({
        ownerUid: this.user.uid,
        humanName: this.user.displayName || 'You',
        humanCode: code,
        countries: COUNTRIES
      })
      // Save it to the database and get its id.
      const id = await this.repo.createGame(this.user.uid, this.user.displayName || 'Player', game.toJSON())
      // Put ?game=ID in the address bar so the link can be shared, then open it.
      history.pushState({}, '', `?game=${id}`)
      this.#route()
    } catch (e) {
      this.#loading(false)
      this.#toast(`Could not create the game: ${e.message}`)
    }
  }

  // ---------------------------------------------------------------- auth ----

  // Updates the top-right corner: the user's name + Sign out, or a Sign in button.
  #renderUser() {
    const box = $('#userBox')
    if (this.user) {
      box.innerHTML = `<span>${esc(this.user.displayName || this.user.email)}</span><button type="button" id="signOutBtn">Sign out</button>`
      $('#signOutBtn').onclick = () => this.auth.signOut()
    } else {
      box.innerHTML = '<button type="button" id="signInBtn">Sign in</button>'
      $('#signInBtn').onclick = () => this.#openAuth('signin')
    }
  }

  // Opens the sign-in / sign-up dialog.
  #openAuth(mode) {
    this.authMode = mode
    this.#paintAuth()
    $('#authError').textContent = ''
    $('#authDialog').showModal()
  }

  // Adjusts the dialog's wording for sign-in versus sign-up.
  #paintAuth() {
    const up = this.authMode === 'signup'
    $('#authTitle').textContent = up ? 'Create your account' : 'Sign in'
    $('#nameField').hidden = !up                  // the display-name box only appears when signing up
    $('#authSubmit').textContent = up ? 'Sign up' : 'Sign in'
    $('#authSwitch').textContent = up ? 'I have an account' : 'Create account'
    $('#authPassword').autocomplete = up ? 'new-password' : 'current-password'
  }

  // Handles the sign-in / sign-up form being submitted.
  async #submitAuth(e) {
    e.preventDefault()                            // stop the browser reloading the page
    const email = $('#authEmail').value.trim()
    const password = $('#authPassword').value
    const name = $('#authName').value.trim()
    $('#authError').textContent = ''
    try {
      if (this.authMode === 'signup') {
        // Validate the display name before contacting Firebase.
        if (name.length < 2) throw { message: 'Enter a display name of at least 2 characters.' }
        await this.auth.signUp(name, email, password)
        this.#renderUser()                        // the display name is set just after the account is created
      } else await this.auth.signIn(email, password)
      $('#authDialog').close()
      $('#authForm').reset()
      // Carry on with whatever the player was trying to do before being asked to sign in.
      const next = this.afterAuth
      this.afterAuth = null
      next?.()
    } catch (err) {
      $('#authError').textContent = AuthService.explain(err)
    }
  }

  // ------------------------------------------------ static buttons, settings ----

  // Attaches click handlers to all the fixed buttons in index.html.
  #bindStaticUi() {
    const on = (sel, fn) => $(sel).addEventListener('click', fn)
    on('#menuPlay', () => this.#requireLogin(() => this.#goHub()))     // Play needs a login
    on('#menuWatch', () => this.#goHub())                              // watching does not
    on('#menuHow', () => $('#howDialog').showModal())
    on('#menuSettings', () => this.#openSettings())
    on('#settingsBtn', () => this.#openSettings())
    on('#howClose', () => $('#howDialog').close())
    on('#settingsClose', () => $('#settingsDialog').close())
    on('#hubBack', () => this.#show('menu'))
    on('#newGameBtn', () => this.#requireLogin(() => this.#goSelect()))
    on('#pickerBack', () => this.#goHub())
    on('#authCancel', () => { this.afterAuth = null; $('#authDialog').close() })
    on('#authSwitch', () => { this.authMode = this.authMode === 'signin' ? 'signup' : 'signin'; this.#paintAuth() })
    $('#authForm').addEventListener('submit', (e) => this.#submitAuth(e))
    // "Copy watch link" puts the page address on the clipboard.
    on('#shareBtn', async () => {
      try { await navigator.clipboard.writeText(location.href); this.#toast('Link copied. Anyone with it can watch this game live.') }
      catch { this.#toast(location.href) }
    })
    // Settings sliders: change the volume as the player drags.
    $('#musicVol').addEventListener('input', (e) => { this.audio.unlock(); this.audio.setMusic(e.target.value / 100) })
    $('#sfxVol').addEventListener('input', (e) => { this.audio.unlock(); this.audio.setSfx(e.target.value / 100) })
    $('#sfxVol').addEventListener('change', () => this.audio.click())   // a click sample so they can hear the level
    // Fullscreen switch.
    $('#fsToggle').addEventListener('change', (e) => {
      if (e.target.checked) document.documentElement.requestFullscreen?.().catch(() => {})
      else if (document.fullscreenElement) document.exitFullscreen()
    })
    // Keep the switch in step if the player leaves fullscreen with the Escape key.
    document.addEventListener('fullscreenchange', () => { $('#fsToggle').checked = Boolean(document.fullscreenElement) })
    // Browsers only allow sound after a click: wake the audio on any click, and click-sound every button.
    document.addEventListener('click', (e) => {
      this.audio.unlock()
      if (e.target.closest('button')) this.audio.click()
    })
    // The browser's Back / Forward buttons re-run the routing.
    window.addEventListener('popstate', () => this.#route())
  }

  // Opens the settings dialog with the sliders showing the saved volumes.
  #openSettings() {
    $('#musicVol').value = Math.round(this.audio.music * 100)
    $('#sfxVol').value = Math.round(this.audio.sfx * 100)
    $('#fsToggle').checked = Boolean(document.fullscreenElement)
    $('#settingsDialog').showModal()
  }

  // Shows a small message at the bottom of the screen for a few seconds.
  #toast(message) {
    const el = $('#toast')
    el.textContent = message
    el.classList.add('show')
    clearTimeout(this.toastTimer)
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 4500)
  }
}
