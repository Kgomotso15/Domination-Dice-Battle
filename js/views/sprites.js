// ============================================================================
// sprites.js
// Sprite and Fighter classes adapted from the ORIGINAL fighting game.
// A "sprite" is a picture made of several frames side by side in one image
// (a sprite sheet). Showing the frames one after another makes an animation.
// The keyboard controls, gravity and hit boxes from the old game are gone:
// fighters now just play scripted animations (idle, attack, take hit, death)
// that the Arena starts once per pair of dice.
// ============================================================================

// A drawable picture, optionally animated.
export class Sprite {
  constructor({ position, imageSrc, scale = 1, framesMax = 1, offset = { x: 0, y: 0 } }) {
    this.position = position          // where on the canvas to draw it { x, y }
    this.image = new Image()          // the browser image object
    this.image.src = imageSrc         // start loading the picture file
    this.scale = scale                // how much to enlarge it (2.5 = two and a half times)
    this.framesMax = framesMax        // how many frames are in the sheet
    this.framesCurrent = 0            // which frame is showing now
    this.elapsed = 0                  // time since the frame last changed
    this.interval = 1 / 16            // seconds per frame (16 frames per second, as in the original)
    this.offset = offset              // nudges the drawing so the character lines up
  }

  // True once the image file has finished loading.
  get ready() {
    return this.image.complete && this.image.naturalWidth > 0
  }

  // Draws the current frame onto the canvas.
  draw(ctx) {
    // Do nothing until the picture has loaded.
    if (!this.ready) return
    // Each frame is an equal slice of the sheet's width.
    const frameWidth = this.image.width / this.framesMax
    ctx.drawImage(
      this.image,
      // Source rectangle: which slice of the sheet to cut out.
      this.framesCurrent * frameWidth, 0, frameWidth, this.image.height,
      // Destination rectangle: where and how big to paint it.
      this.position.x - this.offset.x, this.position.y - this.offset.y,
      frameWidth * this.scale, this.image.height * this.scale
    )
  }

  // Moves the animation forward by `dt` seconds.
  animate(dt) {
    this.elapsed += dt
    // If enough time passed, step to the next frame (possibly several if the screen lagged).
    while (this.elapsed > this.interval) {
      this.elapsed -= this.interval
      this.advanceFrame()
    }
  }

  // Goes to the next frame, looping back to the first after the last.
  advanceFrame() {
    this.framesCurrent = this.framesCurrent < this.framesMax - 1 ? this.framesCurrent + 1 : 0
  }

  // Draw then advance: called once per screen refresh.
  update(ctx, dt) {
    this.draw(ctx)
    this.animate(dt)
  }
}

// A character that can play different animations: idle, attack1, takeHit, death.
export class Fighter extends Sprite {
  constructor({ position, scale, offset, sprites }) {
    // Start by showing the idle animation.
    super({ position, imageSrc: sprites.idle.imageSrc, scale, framesMax: sprites.idle.framesMax, offset })
    this.sprites = sprites
    // Pre-load an image object for every animation.
    for (const s of Object.values(sprites)) {
      s.image = new Image()
      s.image.src = s.imageSrc
    }
    this.anim = 'idle'      // name of the animation playing now
    this.dead = false       // true once the death animation has finished
    this.finished = null    // function to call when a one-shot animation ends
  }

  // How many seconds an animation takes to play once at normal speed.
  duration(name) {
    return this.sprites[name].framesMax * this.interval
  }

  // Starts an animation. Returns a promise that resolves when a one-shot animation
  // (attack, take hit, death) has played all the way through.
  play(name) {
    // A dead fighter stays dead.
    if (this.dead) return Promise.resolve()
    const s = this.sprites[name]
    this.anim = name
    this.image = s.image
    this.framesMax = s.framesMax
    this.framesCurrent = 0
    this.elapsed = 0
    // Idle loops forever, so there is nothing to wait for.
    if (name === 'idle') return Promise.resolve()
    return new Promise((resolve) => { this.finished = resolve })
  }

  // Overrides Sprite.advanceFrame to handle one-shot animations.
  advanceFrame() {
    if (this.anim === 'death') {
      // Death plays once and then freezes on its last frame.
      if (this.framesCurrent < this.framesMax - 1) this.framesCurrent++
      else {
        this.dead = true
        this.finished?.()
        this.finished = null
      }
      return
    }
    // Idle simply loops, like a normal sprite.
    if (this.anim === 'idle') return super.advanceFrame()
    // Attack / take hit: step through the frames...
    if (this.framesCurrent < this.framesMax - 1) {
      this.framesCurrent++
      return
    }
    // ...then go back to idle and tell whoever was waiting that we are done.
    const done = this.finished
    this.finished = null
    this.play('idle')
    done?.()
  }
}

// Small helper that builds the description of one animation sheet.
const sheet = (folder, file, framesMax) => ({ imageSrc: `./img/${folder}/${file}`, framesMax })

// Creates the samurai (the attacker) standing at horizontal position x.
export function createSamurai(x) {
  return new Fighter({
    position: { x, y: 330 },          // y = the ground line
    scale: 2.5,
    offset: { x: 215, y: 157 },       // lines the drawing up with the position
    sprites: {
      idle: sheet('samuraiMack', 'Idle.png', 8),
      attack1: sheet('samuraiMack', 'Attack1.png', 6),
      takeHit: sheet('samuraiMack', 'Take Hit - white silhouette.png', 4),
      death: sheet('samuraiMack', 'Death.png', 6)
    }
  })
}

// Creates Kenji (the defender) standing at horizontal position x.
export function createKenji(x) {
  return new Fighter({
    position: { x, y: 330 },
    scale: 2.5,
    offset: { x: 215, y: 167 },
    sprites: {
      idle: sheet('kenji', 'Idle.png', 4),
      attack1: sheet('kenji', 'Attack1.png', 4),
      takeHit: sheet('kenji', 'Take hit.png', 3),
      death: sheet('kenji', 'Death.png', 7)
    }
  })
}
