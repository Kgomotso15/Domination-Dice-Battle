# Domination - Dice Battle (INF4001 Geopolitics Game)

*Your nation, your strategy. Your fate.*

A single-player, Risk-style game. You pick a country, nine random rivals are drawn, and the last nation standing wins. Built from the original samurai fighting game: its sprites, background and canvas animation now stage each dice duel.

**Stack:** vanilla JavaScript (ES modules, no build step), Firebase Authentication + Firestore (NoSQL), one Vercel serverless function for the AI commentary.

## How the code is organised (MVC)

| Layer | Folder | Notes |
|---|---|---|
| Model / rules | `js/engine/` | `Game.js` owns all state and validates every move. `rules.js` holds the pure rules. `NpcStrategy.js` decides NPC moves. No DOM, no Firebase, unit tested. |
| Database layer | `js/services/`, `firestore.rules` | `GameRepository.js` is the only file that talks to Firestore. `AuthService.js` wraps Firebase Auth. |
| View | `js/views/`, `css/`, `index.html` | Menu, command centre (searchable game lists), country picker, board, log, controls, battle scene (`Arena.js` + `sprites.js`, adapted from the fighting game). |
| Controller | `js/controllers/` | `GameController.js` runs a game. `AppController.js` handles sign in, lobby and routing. |
| Audio | `js/services/AudioService.js` | Music and sound effects synthesised with Web Audio (no audio files). Volumes live in the Settings dialog. |
| AI commentary | `api/commentary.js`, `js/services/CommentaryService.js` | Calls the Google Gemini API from the server so the API key never reaches the browser. Falls back to local templates if unreachable. |

## Setup

### 1. Firebase
1. Create a project at https://console.firebase.google.com
2. **Build > Authentication > Get started**, enable **Email/Password**.
3. **Build > Firestore Database > Create database** (production mode).
4. **Firestore > Rules**, paste the contents of `firestore.rules`, publish.
5. **Project settings > Your apps > Web app**, copy the config into `js/config/firebase-config.js`.
6. **Authentication > Settings > Authorized domains**, add your Vercel domain after deploying.

### 2. Give the examiners database access
Firebase console > Project settings > **Users and permissions** > Add member, role **Editor**, for:
`ammarcanani@gmail.com`, `mc.tanner@uct.ac.za`, `ridewaan.hanslo@uct.ac.za`.

### 3. Deploy (Vercel, free)
1. Push this folder to a GitHub repo, import it at https://vercel.com (framework preset: Other, no build command).
2. Add environment variables: `GEMINI_API_KEY` (from Google AI Studio) and `FIREBASE_API_KEY` (the same `apiKey` as in the config file). Optional: `GEMINI_MODEL` (default `gemini-3.5-flash`).
3. Deploy, then add the Vercel domain to Firebase authorized domains (step 1.6).
4. Create a demo account in the deployed app and put its login in your submission.

### Run locally
```
npx vercel dev      # serves the site and /api/commentary
# or, without AI commentary (templates are used instead):
npx serve .
npm test            # rules and full-game simulations
```

## Rules as implemented
- Soldiers by population band (up to 5M = 1 ... over 150M = 9), using Worldometer 2026 data for 196 countries (`js/data/countries.js`).
- Random first player. No reinforcements in round 1, then 2 per controlled country at the start of each turn.
- One attack per turn. Dice per side = min(attacker soldiers - 1, defender soldiers), paired in order, higher die wins, ties change nothing.
- An attack ends on conquest, when the attacker is down to 1 soldier, or when the player stops (which ends the turn).
- Conquest reward = max(2, floor(ORIGINAL soldier value / 2)), using the country's population-based starting value, not its current count (as the marking checklist requires). The player then chooses how many extra soldiers to move in; AI generals garrison their conquests automatically.
- Transfers are allowed between your own countries when no attack is running, always leaving 1.
- AI generals have their own names (e.g. Obsidian Order, Jade Covenant) so they are never confused with countries.
- **Added rule (opening shield):** the AI generals cannot attack the human player before the human has taken their first turn, so you are never wiped out before you can act. To remove it, delete the `shielded` filter in `NpcStrategy.chooseAttack`.
- Eliminated players are skipped. A 150-round safety cap decides a winner on countries then soldiers if a game never ends (in 20 simulated all-NPC games none reached it).

## Requirements checklist (INF4001 brief)
| Requirement | Where |
|---|---|
| Single-player vs NPCs, win by conquering all 10 | `Game.js`, `NpcStrategy.js` |
| Pick a country from the world list, 9 random others | `CountryPicker.js`, `Game.create()` (196 countries) |
| Soldiers from the population table | `rules.js` `soldiersForPopulation` |
| Random first player, NPC turns simulated | `Game.create()`, `GameController.#npcTurn` |
| One attack per turn, skip, transfers (keep 1), no transfer mid-attack | `Game.js` |
| Fast-forward that still shows the play | "Fast-forward" button, 4x speed, log stays visible |
| Dice rules: min(attacker-1, defender) dice, paired, ties, stop/1-soldier/defeat | `rules.js`, `Game.attackRound` |
| Conquest gives Max(2, half), player chooses extra soldiers to move in | `Game.attackRound`, post-conquest move prompt with Max button |
| Reinforcements: none in round 1, then 2 per country, free allocation | `Game.beginTurn`, `allocateReinforcements` |
| Elimination and skipped turns | `Game.#advance` |
| All countries and soldier counts always visible | `BoardView` |
| Battles shown visually, with LLM commentary | `Arena`, `BattleView`, `api/commentary.js` |
| NPCs play to win, justify every decision, visible in fast-forward | `NpcStrategy.js`, log |
| Anyone can watch via link, only logged-in owner plays, anyone can sign up | `firestore.rules`, `GameController` modes |
| Several games, resume any session | Command centre "Your campaigns" |
| Bonus feature | NPC personality profiles (Aggressor, Balanced, Defender) |
| NoSQL database, deployed | Firestore, Vercel |
| Submission items | Zip, DB access (below), URL, login, this README |

## Marksheet map
- **Database layer / design:** Firestore `users`, `games`, `games/{id}/events`; repository class; security rules with data validation.
- **Security:** only the signed-in owner can write (rules enforce it, not just the UI). Anyone with the link can watch live. The commentary endpoint verifies the Firebase ID token.
- **AI application:** live battle commentary from Gemini, plus NPC decisions explained in plain English in the log (also during fast-forward).
- **Sophistication:** battle engine with simultaneous dice, Monte Carlo odds for NPC attack and stop decisions, resumable games, live spectating.
- **Bonus feature:** NPC personality profiles (Aggressor, Balanced, Defender) with different risk thresholds and reinforcement styles.
- **Functionality (lists, searching, filtering, viewing):** the command centre has search and status filters on both game lists, and the country picker has search plus soldier-band filters.
- **UI:** menu, command centre, country picker, battle screen, settings (music, effects, fullscreen), loading screen and victory/defeat popups.
- **Anti-cheat:** state is saved before each of your rolls resolves on screen, so closing the tab cannot undo a bad roll.

## Known limits
- Firestore free tier allows 20,000 writes a day, roughly 6 full games.
- Opening the same game in two tabs as the owner is not blocked.

## Look and sound
- Pink luxury theme: Blush `#F7B8D0`, Rose `#E85D9E`, Purple `#8B4BC2`, Plum `#301746`, Pearl `#F8E9F0` (all defined as variables at the top of `css/styles.css`).
- Two music tracks, both generated in code: a soft harp-like theme on the menu screens and a moody pad during a game (`AudioService.js`).

## Known gap (be honest in your submission)
All game rules run in the browser (the `Game` class validates every move). Firestore rules stop other people writing to your game and check the shape of the data, but a technically skilled owner could edit their own game's saved state with browser tools. Fully server-side validation would need a backend that runs the rules and holds the only database write access.
