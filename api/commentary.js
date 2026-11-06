// --------------------------API STUFF---------------------------------------------------

// A Vercel "serverless function": a small piece of server code that runs only when
// the game asks for it. It turns ONE battle round into 1-2 sentences of live
// commentary using Google's Gemini AI (Gemini API key).
//
// I used a server function instead of calling Gemini from the browser because the
// API key must stay a secret. Anything in the browser can be read by anyone.
//
// Environment variables (set in Vercel > Project > Settings > Environment Variables):
//   GEMINI_API_KEY    your Gemini API key
//   FIREBASE_API_KEY  the same web apiKey as in js/config/firebase-config.js (used to check who is asking)
//   GEMINI_MODEL      optional; which Gemini model to use (default below)
//
// 

// Which Gemini model to ask. Can be changed without editing code via GEMINI_MODEL.
const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash'

// Cleans a text value: turns it into a string and cuts it to at most `max` characters.
const str = (v, max = 60) => String(v ?? '').slice(0, max)
// Cleans a number value: whole number between 0 and 99 (anything else becomes 0).
const int = (v) => Math.max(0, Math.min(99, Number.parseInt(v, 10) || 0))

// Asks Firebase whether a login token is genuine. Returns true or false.
async function verifyFirebaseUser(idToken) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }) }
  )
  return res.ok
}

// Vercel calls this function for every request to /api/commentary.
export default async function handler(req, res) {
  // Only POST requests are accepted.
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })

  // The browser sends the player's login token in the Authorization header.
  // Only signed-in players may use the AI, so nobody else can spend the API budget.
  // (Watching a game never calls this function.)
  const token = (req.headers.authorization || '').replace(/^Bearer /, '')
  if (!token || !(await verifyFirebaseUser(token))) return res.status(401).json({ error: 'Sign in first' })

  // clean every field before using it.
  const b = req.body || {}
  const facts = {
    attacker: str(b.attacker),
    defender: str(b.defender),
    attackerProfile: str(b.attackerProfile, 20),
    // Turn the dice pairs into text like "6 vs 2, 3 vs 3".
    dice: (Array.isArray(b.pairs) ? b.pairs : []).slice(0, 9).map((p) => `${int(p.a)} vs ${int(p.d)}`).join(', '),
    attackerLosses: int(b.attackerLosses),
    defenderLosses: int(b.defenderLosses),
    attackerLeft: int(b.attackerSoldiers),
    defenderLeft: int(b.defenderSoldiers),
    // Only three outcomes are valid; anything else is treated as "continue".
    outcome: ['continue', 'conquered', 'failed'].includes(b.outcome) ? b.outcome : 'continue',
    reward: int(b.reward)
  }

  // The instruction given to the rival. It contains the REAL battle facts, so the
  // commentary describes what actually happened.
  const prompt =
    `You are the excitable live commentator of a Risk-style world conquest game. ` +
    `Describe this single battle round in 1-2 vivid sentences, maximum 35 words, plain text, no emojis, no markdown, no quotes.\n` +
    `Attacker: ${facts.attacker} (${facts.attackerProfile || 'player'}). Defender: ${facts.defender}.\n` +
    `Dice (attacker vs defender): ${facts.dice || 'none'}.\n` +
    `Losses: attacker ${facts.attackerLosses}, defender ${facts.defenderLosses}. ` +
    `Soldiers left: attacker ${facts.attackerLeft}, defender ${facts.defenderLeft}.\n` +
    `Outcome: ${facts.outcome}${facts.outcome === 'conquered' ? ` (attacker gains ${facts.reward} soldiers)` : ''}.`

  try {
    // Call the Gemini API. The secret key travels in a header, never in the web address.
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        //length cap
        generationConfig: { maxOutputTokens: 400, temperature: 0.9 }
      })
    })
    if (!r.ok) return res.status(502).json({ error: 'LLM request failed' })
    const data = await r.json()
    // The answer is a list of text parts; join them and tidy the spaces.
    const parts = data.candidates?.[0]?.content?.parts ?? []
    const text = parts.map((p) => p.text ?? '').join(' ').replace(/\s+/g, ' ').trim()
    if (!text) return res.status(502).json({ error: 'Empty response' })
    return res.status(200).json({ text })
  } catch {
    // Any network problem: tell the browser, which will use its local fallback sentences.
    return res.status(502).json({ error: 'LLM unavailable' })
  }
}
