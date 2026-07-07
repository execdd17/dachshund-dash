# Dachshund Dash

A pixel-art endless runner starring the world's most determined wiener dog. Jump over hershey bars, duck under frisbees, and chase down squirrels — all from your browser.

Inspired by Chrome's Dino Run, but with more personality (and more hot dogs).

**[Play it now](https://execdd17.github.io/dachshund-dash/)**

## How to Play

- **Jump**: Space, Up Arrow, tap, or click
- **Duck**: Down Arrow or S
- **Double jump**: Press jump again mid-air

That's it. No tutorials, no loading screens, no accounts. Just run.

On mobile, turn your phone sideways — tap the right side to jump, hold the left side to duck.

## What You'll Find

- A hand-animated dachshund with pixel-art sprites
- A day/night cycle with sunsets, starry skies, and dynamic weather
- A soulful soundtrack (with an EDM remix for special occasions)
- Squirrel chases and a boss encounter
- Giant mode — grab a golden hot dog and become unstoppable
- Trampoline scenes — thorn patches where a super-bounce off a trampoline island is the only way through
- Global high score leaderboard (plus a local best shown as `HI` in the HUD)

## Run It Locally

Clone the repo and serve it with any static file server — the game uses native ES modules, which browsers won't load from `file://`:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

No build step, no dependencies, no framework.

## Run the Tests

The game logic has a unit test suite that runs on Node's built-in test runner (Node 18+, no packages to install):

```bash
npm test          # or: node --test tests/*.test.js
```

## Firebase — One-Time Setup

The global leaderboard uses Firestore (`scores` collection). Rules, indexes, and bulk data ops are managed locally from this repo — not by hand in the Firebase console.

Install dev dependencies and log in to Firebase CLI (once per machine):

```bash
npm install
npx firebase login
```

**Deploy rules and indexes** (`firestore.rules`, `firestore.indexes.json`):

```bash
npm run firebase:deploy          # rules + indexes
npm run firebase:deploy:rules    # rules only
npm run firebase:deploy:indexes  # indexes only
```

If indexes already exist in the console and you need to sync them into the repo first:

```bash
npx firebase firestore:indexes > firestore.indexes.json
# review the file, then:
npm run firebase:deploy:indexes
```

**Admin SDK credentials** (for data scripts below): Firebase console → Project settings → Service accounts → Generate new private key. Save as `firebase/service-account.json` (git-ignored). Or set `GOOGLE_APPLICATION_CREDENTIALS` to the key path.

The `scores` collection is created automatically on the first submitted score — nothing else to provision.

More detail: [`firebase/README.md`](firebase/README.md).

## Firebase — Admin SDK

Data scripts use the [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) with the service account key above. They bypass client security rules (the game only allows creates, not deletes).

**Delete all scores for one difficulty:**

```bash
# Preview count
node firebase/delete-scores-by-difficulty.mjs NORMAL --dry-run

# Delete
node firebase/delete-scores-by-difficulty.mjs NORMAL
node firebase/delete-scores-by-difficulty.mjs "VERY HARD"
```

Valid difficulty labels: `VERY EASY`, `EASY`, `NORMAL`, `HARD`, `VERY HARD`.

**Delete all scores for the default test name** (empty setup input → stored as `PLAYER`):

```bash
node firebase/delete-scores-by-name.mjs --dry-run
node firebase/delete-scores-by-name.mjs
```

Pass a name to target something else: `node firebase/delete-scores-by-name.mjs TESTER`

**Add new admin scripts:** use `getAdminDb()` from `firebase/lib/init.mjs` (same credentials, batch writes/deletes in chunks of 500). See [`firebase/README.md`](firebase/README.md).

## Code Layout

- `index.html` — thin HTML shell
- `css/style.css` — all styles
- `js/` — ES modules: `config.js` (tuning constants), `core/` (state, day/night cycle), `systems/` (physics, spawning, collision, giant mode, and the chase/boss/trampoline scenes, which take turns via a fair scene queue), `render/` (canvas drawing), `audio/`, `assets/`, `cosmetics/`, `leaderboard/`, `input/`, and `main.js` (wires it all together)
- `tests/` — unit tests for the game logic
- `firebase/` — Firestore admin scripts (Admin SDK); rules/indexes at repo root

## Controls

| Action | Keyboard | Mobile |
|--------|----------|--------|
| Jump | Space / Up | Tap right side |
| Duck | Down / S | Hold left side |
| Toggle music | Click speaker icon | Tap speaker icon |

