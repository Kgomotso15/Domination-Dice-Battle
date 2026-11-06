// Produces the live battle commentary. It asks our server function
// (/api/commentary), which calls the Gemini AI. If that server is unreachable or
// slow, it falls back to local template sentences so the game never stalls.

export class CommentaryService {
  // 'getToken' is a function that returns the signed-in user's login token.
  constructor(getToken) {
    this.getToken = getToken
  }

  // Returns { text, source } where source is 'Rival' (from Gemini) or 'local' (fallback template).
  async generate(ctx, { timeoutMs = 4000 } = {}) {
    try {
      const token = await this.getToken()
      // Only signed-in players may use .
      if (!token) throw new Error('not signed in')
      // An AbortController lets us cancel the request if it takes too long.
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      // Send the battle facts to our server function.
      const res = await fetch('/api/commentary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(ctx),
        signal: controller.signal
      })
      clearTimeout(timer)
      // Any error status means "use the fallback".
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const { text } = await res.json()
      if (!text) throw new Error('empty')
      return { text, source: 'ai' }
    } catch {
      // Anything went wrong: use a local sentence instead.
      return { text: CommentaryService.template(ctx), source: 'local' }
    }
  }

  // Builds a sentence from the real battle facts.
  static template(c) {
    // Picks one of several sentences so the commentary is not identical every time.
    const pick = (list) => list[(c.round + c.attackerLosses * 3 + c.defenderLosses) % list.length]
    if (c.outcome === 'conquered') {
      return pick([
        `${c.attacker} raises its flag over ${c.defender}! The last defenders fall and ${c.reward} soldiers move in.`,
        `That is the end for ${c.defender}. ${c.attacker} takes the territory and garrisons it with ${c.reward}.`
      ])
    }
    if (c.outcome === 'failed') {
      return `${c.attacker} is down to its last soldier and has to call off the assault on ${c.defender}.`
    }
    if (c.attackerLosses === 0 && c.defenderLosses === 0) return `Neither side gives ground. Every die ends in a tie.`
    if (c.defenderLosses > c.attackerLosses) {
      return pick([
        `${c.attacker} breaks through and ${c.defender} loses ${c.defenderLosses}.`,
        `A strong roll for ${c.attacker}. ${c.defender} is pushed back, down ${c.defenderLosses}.`
      ])
    }
    if (c.attackerLosses > c.defenderLosses) {
      return pick([
        `${c.defender} holds the line and ${c.attacker} bleeds ${c.attackerLosses}.`,
        `The defence stands firm. ${c.attacker} loses ${c.attackerLosses} for little gain.`
      ])
    }
    return `Both sides trade blows and lose ${c.attackerLosses} each.`
  }
}
