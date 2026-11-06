# Domination - Dice Battle

*Your nation, your strategy. Your fate.*


##  What is this project?

Domination - Dice Battle is a single-player, Risk-style strategy game that runs in a web browser.

You choose a real country. The game then picks nine other countries at random, and each one is controlled by a computer-run **Rival**. Everyone has soldiers. On their turn a player can attack a neighbour by rolling dice, and whoever rolls higher wins soldiers from the other side. If you take every country, you win. If you lose all of yours, you are out.


##  How to play


### The idea in one minute
Imagine a board game where every player owns one country and has a little army. You take turns picking fights. Each fight is decided by rolling dice. If you win a fight you can take over that country. The player who ends up owning all ten countries wins!

### Step 1 - Get in
1. Open the website link: https://domination-dice-battle.vercel.app/
2. Press **Sign in** and choose **Create an account**. Type a name, your email and a password (at least 6 characters). Next time just sign in.

### Step 2 - Start a game
1. Press **Play**, then **New campaign**.
2. Pick your country. You can type in the search box to find it fast. Countries with more people start with more soldiers.
3. Press **Confirm**. Nine Rivals are picked for you at random and every Rival gets a made-up name like "Iron Accord" or "Crimson Pact".

### Step 3 - Understand the board
- Every country shows its flag, name and number of soldiers. Your countries are in your colour.
- The big picture on the side/middle is the battle scene, where fights are shown.
- The Game log on the bottom tells you everything that happens, including why each Rival made its choice.

### Step 4 - Take your turn
The Rivals may play first, because who goes first is random. Watch the log or press **Skip ahead to my turn** (the fast-forward button). When a **"Your turn"** banner appears, the buttons turn on.

1. Place new soldiers (from round 2). You get 2 new soldiers for every country you own. Use the **+** and **-** buttons to put them where you want, then confirm.
2. Attack!
   - Tap one of your countries (it needs at least 2 soldiers).
   - Tap an enemy country.
   - Press **Attack**, then **Roll the dice!**
3. How a fight works: Both sides roll dice, one die per fighting soldier, and the dice are compared in pairs. The higher number wins and the other side loses a soldier. If the numbers are the same, nobody loses anything.
4. Keep going or stop. You can keep rolling until the enemy country has no soldiers left (you take it!), or until you are down to 1 soldier, or you press Stop attack.
   Note: You only get one attack per turn. When you stop, your turn ends.
5. Winning a country: You get a free reward of soldiers (half of the enemy's soldiers, but never fewer than 2). You can also choose to move more of your own soldiers in.
6. Moving soldiers: When you are not in the middle of an attack you can move soldiers between your own countries. Every country must always keep at least 1 soldier at home.
7. Press **End turn** when you are done (before attacking it reads **Skip turn**).

### Step 5 - Win or lose
- Lose every country: you are out.
- Own all ten countries: you win!

### Handy buttons
| Button | What it does |
|---|---|
| **Skip ahead to my turn** | Fast-forward: the Rivals play at high speed until it is your turn, and every move and reason still appears in the log. Tap it again to slow down |
| **Settings** | Music, sound effects and fullscreen |
| **How to play** | Shows the short rules in the game |
**Tip:** Rolling more dice is better, so attack with a country that has lots of soldiers, and try to take weak countries first.


##  Main features and game mechanics

**Game rules (from the brief)**
- Ten players: you plus nine random Rivals, one country each (196 countries to choose from, including South Africa).
- Starting soldiers depend on a country's population, from 1 soldier (up to 5 million people) to 9 soldiers (over 150 million). Population data is Worldometer 2026 (`js/data/countries.js`).
- Random first player. Round 1 has no reinforcements; from round 2 you get 2 soldiers per country you control, placed freely.
- One attack per turn. Dice per side = the smaller of (attacker soldiers - 1) and (defender soldiers), compared in pairs, higher die wins, ties change nothing.
- An attack ends when the country is conquered, when the attacker is down to 1 soldier, or when the player stops (which ends the turn).
- Conquest reward = Max(2, half of the defender's soldiers); the player can move extra soldiers in.
- Transfers between your own countries are allowed when no attack is running, always leaving 1 soldier behind.
- Eliminated players are skipped. The game is won by owning all ten countries.

**Application features**
- Account sign-up and sign-in.
- **Command centre**: your saved campaigns (searchable, filter by *In progress* / *Finished*) and a list of live games anyone can watch (search by country or player, same filter).
- **Country picker** with search and a filter by starting soldiers.
- Resume any unfinished game at any time. Several games can exist at once.
- **Public watch-only links**: anyone with the link watches live; only the signed-in owner can play.
- **Rivals that play to win** and explain every decision in the log (also during fast-forward).
- **Battle scene** with sprites and animation adapted from my earlier fighting game, plus music and sound effects made with the Web Audio API.
- **AI battle commentary** written by Google Gemini (see section 10).
- Victory and defeat pop-ups, loading screen, settings dialog, "How to play" and a short intro on the first game.


##  Technologies used

| Area | Technology |
|---|---|
| Front end | HTML5, CSS3, vanilla JavaScript (ES modules, no build step), Canvas for the battle animation, Web Audio API for sound |
| Database | **Google Firebase Cloud Firestore** (NoSQL, online) |
| Authentication | **Firebase Authentication** (email and password) |
| Back end | One **Vercel serverless function** (`api/commentary.js`, Node.js) |
| AI | **Google Gemini API** (default model `gemini-3.5-flash`, set with `GEMINI_MODEL`) |
| Hosting | **Vercel** (static site + serverless function) |
| Testing | Node's built-in test runner (`node --test`) |
| Tools | Visual Studio Code, Git/GitHub, Claude (AI coding assistant, see section 10) |


##  How the project is built

The code follows **MVC** with a separate database layer, so each file has one job.

| Layer | Folder / files | Responsibility |
|---|---|---|
| **Model** (game rules) | `js/engine/` | `Game.js` is the only place game state changes, and it checks every move, throwing a `RuleError` when a move is illegal. `rules.js` holds pure functions (soldier bands, dice, rewards). `NpcStrategy.js` decides Rival moves. `factions.js` holds the Rival names. No screen code and no Firebase code lives here, so it is unit tested. |
| **Database layer** | `js/services/GameRepository.js`, `js/services/firebase.js`, `firestore.rules` | `GameRepository` is the **only** file that talks to Firestore. `firebase.js` is the only file that configures the SDK. |
| **Auth service** | `js/services/AuthService.js` | A small wrapper around Firebase Authentication, with friendly error messages. |
| **AI service** | `js/services/CommentaryService.js`, `api/commentary.js` | Browser side asks the server; the server calls Gemini. Falls back to local text. |
| **View** | `js/views/`, `css/`, `index.html` | `BoardView`, `LogView`, `ControlsView`, `BattleView`, `Arena` (canvas), `CountryPicker`, `GameListView`, `GameScreen`. Views only draw things and report clicks. |
| **Controller** | `js/controllers/` | `AppController` handles sign-in, the command centre and routing. `GameController` runs a game: it connects the engine, the Rivals, the views, the database and the commentary. |

**Object-oriented ideas used:** classes (`Game`, `NpcStrategy`, `GameRepository`, `AuthService`, `CommentaryService`, the view classes), **encapsulation** (the `Game` class keeps its state and private helpers such as `#advance()` and `#expect()` hidden; the rest of the app can only change the game through validated public methods), single responsibility, and separation of concerns.

**Tests:** `npm test` runs rule tests (soldier bands, dice, rewards, naming) and full simulated games between Rivals to prove a game always finishes.

```
api/commentary.js        serverless AI endpoint
css/styles.css           styling
firestore.rules          database security rules
index.html               the single page
js/config/               Firebase web config
js/controllers/          AppController, GameController
js/data/countries.js     196 countries + populations
js/engine/               Game, rules, NpcStrategy, factions
js/services/             firebase, GameRepository, AuthService, CommentaryService, AudioService
js/views/                all screens and widgets
tests/                   automated tests
```


##  Install and run locally

You need **Node.js 18 or newer** ([nodejs.org](https://nodejs.org)) and a modern browser.

```bash
# 1. unzip the project and open a terminal in the folder
cd domination-dice-battle

# 2. run the automated tests (no installs needed)
npm test

# 3a. run the site only (Rivals use local commentary text)
npx serve .
#     then open the address it prints, e.g. http://localhost:3000

# 3b. OR run the site AND the AI commentary endpoint
npx vercel dev
```

For **3b** create a file called `.env` in the project folder:

```
GEMINI_API_KEY=your-gemini-key
FIREBASE_API_KEY=the-apiKey-from-js/config/firebase-config.js
```

The project already points at my Firebase project, so sign-in and saving work straight away. To use **your own** Firebase project instead, follow section 9 and paste your config into `js/config/firebase-config.js`.


##  How the database is connected

**Database:** Cloud Firestore, a NoSQL document database, online in Google's cloud (project `geo-game-53507`). NoSQL fits because a game is one self-contained document that changes often, and a game's move history is a growing list.

**Connection:** `js/config/firebase-config.js` holds the project's web config. `js/services/firebase.js` initialises the SDK once and exports `auth` and `db`. Only `GameRepository.js` uses `db`.

**Collections**

```
users/{uid}                 profile of a signed-in user (private to them)
games/{gameId}              one game
    ownerUid, ownerName     who owns it
    status                  "active" | "finished"
    humanCountry, ...       summary fields used by the lists and search
    state                   the whole game: players, countries, soldiers, phase, round...
    createdAt, updatedAt    server timestamps
    events/{eventId}        append-only game log (subcollection)
        seq, type, text, ts   type = system | decision | battle_start |
                              battle_round | battle_end | commentary
```

**How it is used**
- Creating a game: `createGame()` writes the game document.
- Every move: `save()` writes the new state and the log entry together in one **batch**, so they can never get out of step.
- Live watching: `onSnapshot()` listeners stream the game and its log to every viewer in real time.
- Lists: `listMine(uid)` (where `ownerUid == uid`) and `listRecent()` (newest first).
- Saved before the dice animation finishes, so closing the tab cannot undo a bad roll.

**Design choices:** the game state is stored in one document (cheap, atomic, easy to resume); the log is a subcollection ordered by `seq` so it can grow without making the game document large; the log is **append-only** (rules forbid edits and deletes).


##  How authentication and access control work

**Authentication** uses Firebase Authentication with **email + password**.
1. *Create an account:* `AuthService.signUp` creates the user and stores the display name.
2. *Sign in:* `AuthService.signIn`. Firebase issues a signed **ID token** and keeps the user logged in.
3. The app listens for changes with `onAuthStateChanged`, so the screens always match the login state.
4. Error codes are translated to plain sentences ("Email or password is incorrect").

**Authorization (who may do what)** is enforced by the **database itself** in `firestore.rules`, not only by hiding buttons:

| Action | Who is allowed |
|---|---|
| Read a game or its log | Anyone with the link (public, so watch links work) |
| Create a game | Signed-in user, and only with their own `ownerUid` |
| Change or delete a game | Only the owner; the owner cannot be reassigned |
| Add log events | Only the owner of that game |
| Edit or delete log events | Nobody (append-only) |
| Read or write `users/{uid}` | Only that user |

**Data validation** (also in the rules): required fields must exist, `status` must be `active` or `finished`, names are limited to 40 characters, log entries must have an allowed `type` and at most 800 characters. A tampered browser cannot write junk.

**In the app:** the game screen has a *play* mode (owner) and a *watch* mode (everyone else, controls hidden). The AI endpoint also checks the caller's Firebase token (section 10).

**Links**
- Firebase console: https://console.firebase.google.com (project `geo-game-53507`)
- Vercel dashboard: https://vercel.com
- Google AI Studio (Gemini key): https://aistudio.google.com


##  How AI was used

###  AI inside the application
1. **Live battle commentary (LLM).** After a battle round the browser (`CommentaryService`) sends the battle facts (attacker, defender, dice pairs, losses, soldiers left, outcome) to `/api/commentary`. That serverless function builds a prompt and calls the **Google Gemini API**, which returns one or two exciting sentences. The text appears in the log as a "commentary" entry and is saved to the database so watchers see it too.
   - *Key safety:* the Gemini key lives only in Vercel environment variables, never in the browser.
   - *Access control:* the endpoint accepts POST only and checks the caller's Firebase ID token (via Google's `accounts:lookup`), so only signed-in players can spend the AI budget. Watching never calls it.
   - *Input safety:* every field is trimmed, numbers are clamped, and the outcome must be one of three allowed words before it goes into the prompt.
   - *Free-tier protection:* the app sends one request at a time, waits a few seconds between requests, backs off for a minute after a rate-limit reply, and uses AI mainly for the important moments. Anything else, and any failure or timeout, uses **local template sentences**, so a battle is never silent and the game never stalls.
2. **Rival decision-making ("game AI").** Rivals do not move randomly. `NpcStrategy` estimates the chance of conquering a target with a **Monte Carlo simulation** (hundreds of simulated fights), compares it with the personality's risk threshold, picks the best target or stops, decides where to put reinforcements, and writes the reason as a plain-English "decision" entry in the log. Each log line names the target, the estimated chance of winning and why the Rival acted.


##  The bonus feature: Rival personalities

Each Rival is randomly given one of three **personalities**, and each plays differently. The personality is shown next to the Rival's name in the log, so you can learn who is dangerous.

| Personality | Attacks when win chance is above | Gives up an attack below | Reinforcements | Style |
|---|---|---|---|---|
| **Aggressor** | 35% | 18% | all onto one strong country | Reckless, builds one big strike force |
| **Balanced** | 50% | 30% | spread evenly | Takes fair fights |
| **Defender** | 65% | 40% | spread evenly | Only attacks safe targets |

Every Rival's reasoning, including which personality drove the choice, is written to the log. A second small extra is the **opening shield**: Rivals cannot attack the human before the human's first turn.


##  Assumptions and known limits

- **Conquest reward:** I used the defender's soldier count at the **start of the attack**. To use the original population-based value instead, change `targetSoldiersAtStart` in `Game.js`.
- **Opening shield** is an added rule so you are never wiped out before your first turn (remove the `shielded` filter in `NpcStrategy.chooseAttack` to disable it).
- A 150-round safety limit decides a winner on countries, then soldiers, if a game somehow never ends (none of 20 simulated all-Rival games reached it).
- Rival names are invented (for example "Iron Accord") rather than "<Country> AI", so a Rival is never confused with a country it happens to own. Games saved before this change keep their older names.
- The free Firestore tier allows about 20,000 writes per day (roughly 6 full games). The free Gemini tier is rate limited, which is why local commentary is the fallback.
- Opening the same game as the owner in two tabs is not blocked.
