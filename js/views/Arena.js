// The canvas battle scene from the original fighting game, reused as a stage for
// the dice battles. The attacker (samurai) and defender (Kenji) fight one little
// duel for every pair of dice.

import { Sprite, createKenji, createSamurai } from './sprites.js'

// Waits for `ms` milliseconds.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// Waits for an animation but gives up after `ms`, so a stalled animation (for example in a
// background browser tab) can never freeze the whole game.
const capped = (promise, ms = 2500) => Promise.race([promise, sleep(ms)])

export class Arena {
  constructor(canvas) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')   // the tool used to draw on the canvas
    canvas.width = 1024                  // internal drawing size (CSS scales it to fit the page)
    canvas.height = 576
    // The forest background picture.
    this.background = new Sprite({ position: { x: 0, y: 0 }, imageSrc: './img/background.png' })
    // The animated shop in the corner (6 frames).
    this.shop = new Sprite({ position: { x: 600, y: 128 }, imageSrc: './img/shop.png', scale: 2.75, framesMax: 6 })
    this.attacker = null                 // the samurai, only present during a battle
    this.defender = null                 // Kenji, only present during a battle
    this.speed = 1                       // 1 = normal, 4 = fast-forward
    this.message = 'No battle yet'       // text shown on the canvas between battles
    this.last = performance.now()        // time of the previous screen refresh
    // Start the never-ending drawing loop.
    requestAnimationFrame(() => this.#frame())
  }

  // Changes how fast animations play (fast-forward uses 4).
  setSpeed(speed) { this.speed = speed }

  // Puts both fighters on the stage for a new battle.
  begin() {
    this.attacker = createSamurai(200)
    this.defender = createKenji(690)
    this.message = ''
  }

  // Removes the fighters and shows a message instead (for example "Attack called off").
  clear(message = '') {
    this.attacker = this.defender = null
    this.message = message
  }

  // True while a battle is on stage.
  get active() { return Boolean(this.attacker) }

  // One duel: the winner strikes, the loser reacts. A tie is a clash where nobody is hurt.
  async duel(winner) {
    if (!this.active) return
    if (winner === 'tie') {
      // Both swing at the same time.
      await capped(Promise.all([this.attacker.play('attack1'), this.defender.play('attack1')]))
      return
    }
    // Work out who strikes and who takes the hit.
    const striker = winner === 'attacker' ? this.attacker : this.defender
    const victim = winner === 'attacker' ? this.defender : this.attacker
    // The samurai steps right, Kenji steps left.
    const dir = winner === 'attacker' ? 1 : -1
    striker.position.x += dir * 190                   // step in towards the enemy
    const swing = striker.play('attack1')             // start the swing
    // Wait until about 60% of the swing, which is when it would land...
    await sleep((striker.duration('attack1') * 0.6 * 1000) / this.speed)
    const hit = victim.play('takeHit')                // ...then the victim reacts
    await capped(Promise.all([swing, hit]))
    striker.position.x -= dir * 190                   // step back to the starting spot
  }

  // Ends the battle scene: the loser of the whole battle falls over.
  async finish(outcome) {
    if (!this.active) return
    // If the country was conquered the defender falls; if the attack failed the attacker falls.
    const fallen = outcome === 'conquered' ? this.defender : outcome === 'failed' ? this.attacker : null
    if (fallen) await capped(fallen.play('death'), 3000)
    await sleep(500 / this.speed)
  }

  // Draws one screen refresh. Called about 60 times a second.
  #frame() {
    // Ask the browser to call us again for the next refresh.
    requestAnimationFrame(() => this.#frame())
    const now = performance.now()
    // Seconds since the last refresh (capped at 0.1 so a lag spike does not skip animations).
    const dt = Math.min((now - this.last) / 1000, 0.1) * this.speed
    this.last = now
    const { ctx, canvas } = this
    // Paint everything black first.
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // Draw the background and the shop.
    this.background.update(ctx, dt)
    this.shop.update(ctx, dt)
    // A translucent plum-pink wash gives the scene the game's colour theme.
    ctx.fillStyle = 'rgba(70, 20, 90, 0.38)'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // Draw the fighters (if a battle is on).
    this.attacker?.update(ctx, dt)
    this.defender?.update(ctx, dt)
    // Show the message banner between battles.
    if (this.message) {
      ctx.fillStyle = 'rgba(30, 10, 45, 0.75)'
      ctx.fillRect(0, 230, canvas.width, 90)
      ctx.fillStyle = '#F8E9F0'
      ctx.font = '600 34px "Playfair Display", Georgia, serif'
      ctx.textAlign = 'center'
      ctx.fillText(this.message.toUpperCase(), canvas.width / 2, 288)
    }
  }
}
