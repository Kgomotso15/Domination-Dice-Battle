// ============================================================================
// GameController.js
// Runs ONE game page. It connects the three layers together:
//   Game (rules)  <->  GameController  <->  views (screen) and repository (database)
//
// It works in one of two modes:
//   OWNER mode:   the signed-in owner "drives" the game. Human turns wait for button
//                 clicks; AI turns are played automatically with short pauses.
//   WATCH mode:   anyone else just follows the saved state and the event log live.
// ============================================================================
import { Game, RuleError } from '../engine/Game.js'
import { NPC_PROFILES, NpcStrategy } from '../engine/NpcStrategy.js'
import { CommentaryService } from '../services/CommentaryService.js'

// A special error used to stop the game loop cleanly when the player leaves the page.
class Cancelled extends Error {}
// Waits for `ms` milliseconds.
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
// How many times faster everything runs when "Skip ahead" is on.
const FAST = 4

export class GameController {
  // `repo` = database, `commentary` = AI commentary, `screen` = the views, `toast` = shows a message.
  constructor({ gameId, user, repo, commentary, screen, toast, requestSignIn }) {
    // Copy all the named arguments onto `this` in one go.
    Object.assign(this, { gameId, user, repo, commentary, screen, toast, requestSignIn })
    this.game = null            // the Game object (set when the database sends the state)
    this.mode = 'watch'         // 'play' for the owner, 'watch' for everyone else
    this.driving = false        // true once the owner's game loop is running
    this.stopped = false        // true once the player has left this game page
    this.fast = false           // is "Skip ahead" on?
    this.thinking = false       // is an AI general in the middle of a turn?
    this.selection = {}         // the countries the human has tapped: { from, to }
    this.moveCount = 1          // the "soldiers to move" number
    this.waiter = null          // the promise the loop is waiting on for the next human click
    this.saveChain = Promise.resolve() // saves are queued one after another so they stay in order
    this.watchQueue = Promise.resolve() // spectator animations are queued the same way
    this.rng = Math.random      // the random number source for dice
  }

  // Starts listening to the database.
  start() {
    // Live updates of the game state document.
    this.unsubGame = this.repo.subscribeGame(this.gameId, (doc) => this.#onDoc(doc), (e) => this.toast(`Could not load game: ${e.message}`))
    // Live updates of the event log.
    this.unsubEvents = this.repo.subscribeEvents(this.gameId, (events, initial) => this.#onEvents(events, initial), () => {})
  }

  // Stops everything (the player left this game page).
  stop() {
    this.stopped = true
    this.unsubGame?.()
    this.unsubEvents?.()
    // If the loop is waiting for a click, wake it up with a Cancelled error so it ends.
    this.waiter?.reject(new Cancelled())
  }

  // ------------------------------------------------------- UI -> controller ----

  // A button press from the human. If the game loop is waiting for a command, give it this one.
  dispatch(cmd) {
    if (this.waiter) {
      const w = this.waiter
      this.waiter = null
      w.resolve(cmd)
    }
  }

  // The human tapped a country card on the board.
  pick(code) {
    // Ignore taps when it is not the human's turn.
    if (!this.#interactive()) return
    const c = this.game.country(code)
    const sel = this.selection
    const mine = c.ownerId === this.game.human.id
    if (sel.from === code) this.selection = {}                         // tapping the selected country again clears it
    else if (!sel.from) {
      // The FIRST tap must be one of your own countries.
      if (!mine) return this.toast('Pick one of your own countries first.')
      this.selection = { from: code }
    } else this.selection = { from: sel.from, to: code }               // the SECOND tap is the target
    this.moveCount = 1
    this.#render()
  }

  // Turns "Skip ahead" on or off.
  toggleFast() {
    this.fast = !this.fast
    this.screen.battle.setSpeed(this.fast ? FAST : 1)
    this.#render()
  }

  // Remembers the number typed into the "soldiers to move" box (no redraw, so typing is not interrupted).
  setMoveCount(n) { this.moveCount = n }

  // The "Max" button: move every soldier except the one that must stay.
  setMoveMax() {
    const from = this.selection.from ? this.game.country(this.selection.from) : null
    if (!from) return
    this.moveCount = Math.max(from.soldiers - 1, 1)
    this.#render()
  }

  // Redraws the screen.
  refresh() { this.#render() }

  // ---------------------------------------------------- database -> controller ----

  // Called every time the game document changes in the database.
  #onDoc(doc) {
    if (this.stopped) return
    if (!doc) return this.toast('That game does not exist.')
    this.meta = doc
    this.screen.setLoading(false)              // we have data, so hide the loading screen
    if (this.driving) return                   // while we run the game ourselves, our own copy is the truth
    this.game = new Game(doc.state)            // rebuild the Game from the saved state
    // Only the owner (signed in, matching ownerUid) can play.
    const isOwner = this.user && doc.ownerUid === this.user.uid
    this.mode = isOwner ? 'play' : 'watch'
    if (isOwner && !this.driver && !this.game.isFinished) {
      // Start the game loop; if it crashes, tell the player (unless it was just cancelled).
      this.driver = this.#drive().catch((e) => {
        if (!(e instanceof Cancelled)) { console.error(e); this.toast(`Game stopped: ${e.message}`) }
      })
    } else this.#render()
  }

  // Called when new log events arrive from the database.
  #onEvents(events, initial) {
    if (this.stopped) return
    if (initial) {
      // The first batch is the existing history: just show it all in the log.
      events.forEach((e) => this.screen.log.add(e))
      // Show the most recent commentary line under the battle scene.
      const last = [...events].reverse().find((e) => e.type === 'commentary' || e.data?.commentary)
      if (last) this.screen.battle.setCaption(last.data?.commentary ?? last.text, last.data?.commentarySource ?? last.data?.source)
      return
    }
    if (this.driving) return   // the owner already added these to the log locally
    // A watcher replays each new event, one after another, so animations do not overlap.
    for (const e of events) this.watchQueue = this.watchQueue.then(() => this.#watch(e)).catch(() => {})
  }

  // A watcher shows one event (and animates it if it is a battle).
  async #watch(e) {
    const b = this.screen.battle
    this.screen.log.add(e)
    if (e.type === 'battle_start') b.begin(e.data.attacker, e.data.defender)
    else if (e.type === 'battle_round') {
      await b.playRound(e.data)
      if (e.data.commentary) b.setCaption(e.data.commentary, e.data.commentarySource)
      if (e.data.outcome !== 'continue') await b.finish(e.data.outcome)
    } else if (e.type === 'commentary') b.setCaption(e.text, e.data?.source)
    else if (e.type === 'battle_end') b.end(e.data?.message ?? '')
  }

  // ------------------------------------------------ game loop (owner only) ----

  // The main loop: keeps playing turns until someone wins.
  async #drive() {
    this.driving = true
    const g = this.game
    // A brand-new game gets a first log line.
    if (g.state.eventSeq === 0) {
      const first = g.currentPlayer
      this.#commit('system', `New game. You lead ${g.ownedBy(g.human.id)[0].name}. ${first.isHuman ? 'You' : first.name} will go first.`, { state: true })
    }
    this.#resumeBattleUi()            // if we reloaded mid-attack, redraw the battle
    this.#render()                    // draw the board first so it is visible behind the intro card
    await this.screen.showIntro()     // show the "how it works" card (once per browser)
    while (!g.isFinished) {
      const p = g.currentPlayer
      if (p.isHuman) {
        this.fast = false                    // "Skip ahead" always stops when it is the human's turn
        this.screen.battle.setSpeed(1)
        await this.#humanTurn()
      } else await this.#npcTurn(p)
    }
    // The game is over: log the result and show the victory/defeat popup.
    this.#commit('system', this.#winnerText(), { state: true })
    this.#render()
    const winner = g.player(g.state.winnerId)
    if (winner.isHuman) {
      this.screen.showResult('victory', 'You conquered all ten nations.', [{ label: 'Continue', action: 'hub', primary: true }])
    } else if (!this.defeatShown) {
      this.screen.showResult('defeat', `${winner.name} conquered the world.`, [
        { label: 'Try again', action: 'new', primary: true },
        { label: 'Back to menu', action: 'hub' }
      ])
    }
  }

  // If the page was reloaded in the middle of an attack, bring the battle scene back.
  #resumeBattleUi() {
    const a = this.game.state.attack
    if (!a || this.screen.battle.live) return
    const src = this.game.country(a.sourceCode)
    const tgt = this.game.country(a.targetCode)
    this.screen.battle.begin(this.#side(src), this.#side(tgt))
  }

  // Waits for and applies the human's commands until their turn ends.
  async #humanTurn() {
    const g = this.game
    const me = g.human
    this.screen.flash('Your turn')          // big banner
    this.screen.audio?.conquer()            // little chime
    while (!g.isFinished && g.currentPlayer.id === me.id) {
      this.#render()
      const cmd = await this.#nextCommand() // pause here until a button is pressed
      try {
        await this.#applyHuman(cmd, me)
      } catch (e) {
        // A broken rule (like "not enough soldiers") just shows a message; anything else is a real bug.
        if (e instanceof RuleError) this.toast(e.message)
        else throw e
      }
    }
  }

  // Returns a promise that resolves with the next button press.
  #nextCommand() {
    return new Promise((resolve, reject) => { this.waiter = { resolve, reject } })
  }

  // Carries out one human command by calling the matching Game method.
  async #applyHuman(cmd, me) {
    const g = this.game
    const sel = this.selection
    switch (cmd.type) {
      case 'allocate': {
        // Place the reinforcements, then log what was placed.
        g.allocateReinforcements(cmd.allocations)
        const placed = Object.entries(cmd.allocations).filter(([, n]) => n > 0)
          .map(([code, n]) => `${n} to ${g.country(code).name}`).join(', ')
        this.#commit('system', `You placed reinforcements: ${placed}.`, { actor: me.name, state: true })
        break
      }
      case 'attack': {
        if (!sel.from || !sel.to) throw new RuleError('Select your attacking country, then the target.')
        g.startAttack(sel.from, sel.to)
        this.selection = {}
        this.#announceAttack(me, `You attack ${g.country(sel.to).name} from ${g.country(sel.from).name}.`, true)
        break
      }
      case 'roll':
        await this.#playRound(me, true)
        break
      case 'stop': {
        const a = g.state.attack
        const text = `You called off the attack on ${g.country(a.targetCode).name}. Your turn ends.`
        g.stopAttack()
        this.#commit('battle_end', text, { actor: me.name, state: true, data: { message: 'Attack called off' } })
        this.screen.battle.end('Attack called off')
        break
      }
      case 'move': {
        if (!sel.from || !sel.to) throw new RuleError('Select the country to take soldiers from, then the one to give them to.')
        const n = Math.floor(this.moveCount)
        g.transfer(sel.from, sel.to, n)
        this.#commit('system', `You moved ${n} soldier${n === 1 ? '' : 's'} from ${g.country(sel.from).name} to ${g.country(sel.to).name}.`, { actor: me.name, state: true })
        this.selection = {}
        break
      }
      case 'end':
        g.endTurn()
        this.selection = {}
        this.#commit('system', 'You end your turn.', { actor: me.name, state: true })
        break
    }
  }

  // Plays a whole turn for an AI general, step by step, explaining every decision.
  async #npcTurn(p) {
    const g = this.game
    const npc = new NpcStrategy(p.profile, this.rng)      // that general's brain
    const label = `${p.name} (${NPC_PROFILES[p.profile].label})`
    this.thinking = true
    this.#render()
    await this.#pause(900)

    // Step 1: place reinforcements (round 2 onwards).
    if (g.state.phase === 'reinforce') {
      const plan = npc.planReinforcements(g, p.id)
      g.allocateReinforcements(plan.allocations)
      this.#commit('decision', plan.reason, { actor: label, data: { kind: 'reinforce' } })
      this.#render()
      await this.#pause(800)
    }

    if (g.state.phase === 'action') {
      // Step 2: move spare soldiers into the strongest country, if worthwhile.
      const cons = npc.planConsolidation(g, p.id)
      if (cons) {
        for (const m of cons.moves) g.transfer(m.from, m.to, m.count)
        this.#commit('decision', cons.reason, { actor: label, data: { kind: 'transfer' } })
        this.#render()
        await this.#pause(800)
      }
      // Step 3: choose an attack, or skip the turn.
      const choice = npc.chooseAttack(g, p.id)
      if (!choice.attack) {
        this.#commit('decision', `${choice.reason} Turn skipped.`, { actor: label, data: { kind: 'skip' } })
        g.endTurn()
        this.#saveState()
        this.thinking = false
        return
      }
      const { source, target } = choice.attack
      this.#commit('decision', choice.reason, { actor: label, data: { kind: 'attack' } })
      g.startAttack(source.code, target.code)
      this.#announceAttack(p, `${p.name} attacks ${target.name} from ${source.name}.`, false)
      this.#render()
      await this.#pause(900)
    }

    // Step 4: fight, one round at a time, deciding after each round whether to continue.
    if (g.state.phase === 'attack') this.#resumeBattleUi()
    let last = null   // the result of the most recent round
    while (g.state.phase === 'attack') {
      last = await this.#playRound(p, false)
      if (g.state.phase !== 'attack') break          // the attack ended (conquered or failed)
      const verdict = npc.decideContinue(g)
      this.#commit('decision', verdict.reason, { actor: label, data: { kind: 'continue', go: verdict.continue } })
      await this.#pause(700)
      if (!verdict.continue) {
        // The AI decided to withdraw: that ends its turn.
        const text = `${p.name} withdraws from the attack. Turn ends.`
        g.stopAttack()
        this.#commit('battle_end', text, { state: true, data: { message: 'Attack called off' } })
        this.screen.battle.end('Attack called off')
        this.thinking = false
        return
      }
    }
    // After a conquest the AI garrisons the new country (like a human choosing how many soldiers to move in).
    if (g.state.phase === 'postAttack' && last?.outcome === 'conquered') {
      const plan = npc.planGarrison(g, p.id, last.sourceCode, last.targetCode)
      if (plan) {
        g.transfer(plan.from, plan.to, plan.count)
        this.#commit('decision', plan.reason, { actor: label, data: { kind: 'transfer' } })
        this.#render()
        await this.#pause(700)
      }
    }
    // Then the turn ends (also after a failed attack).
    if (g.state.phase === 'postAttack') {
      g.endTurn()
      this.#saveState()
    }
    this.thinking = false
    this.#render()
  }

  // ---------------------------------------------------------------- battles ----

  // Logs "X attacks Y" and opens the battle scene.
  #announceAttack(player, text, human) {
    const g = this.game
    const a = g.state.attack
    const attacker = this.#side(g.country(a.sourceCode))
    const defender = this.#side(g.country(a.targetCode))
    this.#commit('battle_start', text, { actor: human ? player.name : null, state: human, data: { attacker, defender } })
    this.screen.battle.begin(attacker, defender)
  }

  // Describes one country for the battle banner.
  #side(country) {
    return { code: country.code, name: country.name, owner: this.game.player(country.ownerId).name, soldiers: country.soldiers }
  }

  // Plays ONE round of the current attack (for the human or an AI), then shows and saves it.
  async #playRound(player, human) {
    const g = this.game
    const a = g.state.attack
    const src = g.country(a.sourceCode)
    const tgt = g.country(a.targetCode)
    const before = { attacker: src.soldiers, defender: tgt.soldiers }   // counts BEFORE the dice
    const defenderPlayer = g.player(tgt.ownerId)

    // The real rules run here: dice are rolled and soldiers are lost.
    const res = g.attackRound(this.rng)
    // Package everything the screen (and any spectator) needs to replay this round.
    const data = {
      sourceCode: src.code, targetCode: tgt.code,
      attackerName: src.name, defenderName: tgt.name,
      attackerPlayer: player.name, defenderPlayer: defenderPlayer.name,
      attackerProfile: player.profile ?? 'player',
      attackerBefore: before.attacker, defenderBefore: before.defender,
      pairs: res.pairs,
      attackerLosses: res.attackerLosses, defenderLosses: res.defenderLosses,
      attackerSoldiers: res.attackerSoldiers, defenderSoldiers: res.defenderSoldiers,
      outcome: res.outcome, reward: res.reward,
      defenderEliminated: res.defenderEliminated, gameWon: res.gameWon,
      round: g.state.round
    }
    const text = `${src.name} [${res.pairs.map((p) => p.a).join(', ')}] vs ${tgt.name} [${res.pairs.map((p) => p.d).join(', ')}]. ` +
      `Attacker loses ${res.attackerLosses}, defender loses ${res.defenderLosses}.`
    // For the human, save the state NOW (before the animation) so closing the tab cannot undo a bad roll.
    const event = this.#commit('battle_round', text, { actor: player.name, data, state: human, persist: human })

    // The facts the AI commentator needs to describe THIS battle round.
    const ctx = {
      attacker: src.name, defender: tgt.name, attackerProfile: data.attackerProfile, pairs: res.pairs,
      attackerLosses: res.attackerLosses, defenderLosses: res.defenderLosses,
      attackerSoldiers: res.attackerSoldiers, defenderSoldiers: res.defenderSoldiers,
      outcome: res.outcome, reward: res.reward, round: g.state.round
    }
    // Ask for the commentary now, so it is being written while the animation plays.
    const pending = this.commentary.generate(ctx)

    // Animate the dice and duels.
    await this.screen.battle.playRound(data)
    // Wait for the commentary, but not forever (shorter wait when skipping ahead).
    const note = await Promise.race([
      pending,
      wait(this.fast ? 1200 : 4500).then(() => ({ text: CommentaryService.template(ctx), source: 'local' }))
    ])
    this.screen.battle.setCaption(note.text, note.source)

    if (human) {
      // The round event was already saved; save the commentary as its own event.
      this.#commit('commentary', note.text, { data: { source: note.source } })
    } else {
      // For AI rounds the commentary is stored inside the round event (one database write instead of two).
      event.data.commentary = note.text
      event.data.commentarySource = note.source
      this.screen.log.add({ seq: `${event.seq}c`, type: 'commentary', text: note.text, data: { source: note.source } })
      this.#persist(event, false)
    }

    if (res.outcome !== 'continue') {
      // The battle is over: play the ending and log the outcome.
      await this.screen.battle.finish(res.outcome)
      const verb = res.outcome === 'conquered'
        ? `${player.name} conquered ${tgt.name} and gains ${res.reward} soldiers.${res.defenderEliminated ? ` ${defenderPlayer.name} is eliminated.` : ''}`
        : `${player.name}'s attack on ${tgt.name} failed with only 1 soldier left in ${src.name}.`
      const message = res.outcome === 'conquered' ? `${tgt.name} conquered` : 'Attack failed'
      this.#commit('battle_end', verb, { state: true, data: { message } })
      this.screen.battle.end(message)
      if (human && res.outcome === 'conquered') {
        // Pre-select the attacker and the new country so the player can choose how many extra soldiers to move in.
        this.selection = { from: src.code, to: tgt.code }
        this.moveCount = 1
      }
      if (res.defenderEliminated && defenderPlayer.isHuman && !this.defeatShown) {
        // The human just lost their last country.
        this.defeatShown = true
        this.screen.showResult('defeat', 'Your last country has fallen. The war carries on without you.', [
          { label: 'Watch it play out', action: 'watch', primary: true },
          { label: 'New campaign', action: 'new' }
        ])
      }
    }
    this.#render()
    return res   // the NPC turn uses this to know how the battle ended
  }

  // ------------------------------------------- events, saving and drawing ----

  // Adds an event to the on-screen log and (optionally) saves it. Returns the event.
  #commit(type, text, { actor = null, data = {}, state = false, persist = true } = {}) {
    // Each event gets the next sequence number so the log stays in order.
    const event = { seq: ++this.game.state.eventSeq, type, text, actor, round: this.game.state.round, data }
    this.screen.log.add(event)
    if (persist) this.#persist(event, state)
    return event
  }

  // Saves an event (and, if `withState`, the whole game state too) in the background.
  #persist(event, withState) {
    // Take a copy of the state NOW, so a later change cannot sneak into this save.
    const snapshot = withState ? this.game.toJSON() : null
    // Chain onto the previous save so saves happen in order.
    this.saveChain = this.saveChain
      .then(() => (snapshot ? this.repo.save(this.gameId, snapshot, event) : this.repo.addEvent(this.gameId, event)))
      .catch((e) => this.toast(`Could not save: ${e.message}`))
  }

  // Saves just the game state (no event).
  #saveState() {
    const snapshot = this.game.toJSON()
    this.saveChain = this.saveChain.then(() => this.repo.save(this.gameId, snapshot)).catch((e) => this.toast(`Could not save: ${e.message}`))
  }

  // Can the human tap countries right now?
  #interactive() {
    return this.mode === 'play' && this.driving && !this.game.isFinished && this.game.currentPlayer.isHuman &&
      ['action', 'postAttack'].includes(this.game.state.phase)
  }

  // The sentence announcing the winner.
  #winnerText() {
    const g = this.game
    const w = g.player(g.state.winnerId)
    return w.isHuman ? 'You conquered the world!' : `${w.name} conquered the world.`
  }

  // Redraws the header, board and controls from the current state.
  #render() {
    const g = this.game
    if (!g || this.stopped) return
    const s = g.state
    const status = g.isFinished ? 'Game over' : `Round ${s.round}. ${g.currentPlayer.isHuman ? 'Your turn' : `${g.currentPlayer.name} is playing`}`
    this.screen.setHeader({
      title: `${this.meta?.humanCountry ?? 'World'} campaign`,
      status,
      mode: this.mode,
      round: s.round
    })
    this.screen.board.render(g, { selection: this.selection, interactive: this.#interactive() })
    this.screen.controls.render({
      game: g, mode: this.mode, selection: this.selection,
      fast: this.fast, thinking: this.thinking, moveCount: this.moveCount, turnsUntil: this.#turnsUntilHuman()
    })
  }

  // How many AI turns will be played before the human's next turn (null if the human is out).
  #turnsUntilHuman() {
    const g = this.game
    const order = g.state.order
    let count = 0
    // Walk forward through the seats starting after the current player.
    for (let i = 1; i <= order.length; i++) {
      const id = order[(g.state.seat + i) % order.length]
      // Reaching the human ends the count.
      if (id === g.human.id) return g.human.eliminated ? null : count
      // Eliminated players are skipped, so they do not count as a turn.
      if (!g.player(id).eliminated) count++
    }
    return null
  }

  // A pause between AI steps; shorter when skipping ahead. Also checks the page was not left.
  async #pause(ms) {
    await wait(ms / (this.fast ? FAST : 1))
    if (this.stopped) throw new Cancelled()
  }
}
