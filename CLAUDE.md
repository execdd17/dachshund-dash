# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dachshund Dash is a pixel-art endless runner (Chrome Dino-style) starring a dachshund. It's a static site built from native ES modules: `index.html` is a thin shell, `css/style.css` holds all styles, and the game lives in `js/` as vanilla-JS modules drawn onto a `<canvas>`. No build step, bundler, or framework; `package.json` exists only to run the unit tests.

Live at https://execdd17.github.io/dachshund-dash/ (GitHub Pages from this repo).

## Common Commands

```bash
# Run locally — must be served over HTTP (ES modules don't load from file://)
python3 -m http.server 8000      # then visit http://localhost:8000

# Unit tests (Node 18+ built-in test runner, zero dependencies)
npm test                         # or: node --test tests/*.test.js

# Browser verification (headless Chromium via playwright-core; Firestore blocked)
npm run verify:smoke                     # end-to-end run: sounds, menu, tutorial, every encounter, death; [url] to check a deployment
npm run verify:lockstep -- [ref=main]    # update() vs a baseline ref, frame by frame on seeded runs
npm run verify:render -- [ref=main]      # full-frame pixel diff vs a baseline ref; [--save] keeps every frame

# Firestore rules + indexes (Firebase CLI; see firebase/README.md)
npm run firebase:deploy
```

No lint or build tooling. Verify gameplay changes with the tests plus `verify:smoke`. For a refactor (or anything meant not to change behavior), `verify:lockstep` and `verify:render` compare against a git ref and name the first divergent field or frame; an intended change shows up there too, so read the diff rather than chasing zero. The tools (`tools/verify/`) serve the tree themselves on an ephemeral port and find Playwright's Chromium (`$CHROMIUM` overrides). `.claude/skills/verify/SKILL.md` covers driving the game by hand.

### Chrome DevTools MCP (interactive browser access)

A `chrome-devtools` MCP server is registered at **user scope** on the Beelink (in `~/.claude.json`, not this repo): navigate / click / press_key / evaluate_script / take_screenshot / console / network / performance-trace tools against headless Chromium. To re-register:

```bash
claude mcp add --scope user chrome-devtools -- npx -y chrome-devtools-mcp@1.11.0 \
  --headless --isolated \
  --executablePath ~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome \
  --chromeArg=--no-sandbox --viewport 1280x720 --screenshotMaxWidth 1280 \
  --usageStatistics=false --performanceCrux=false
```

- **Startup**: the server starts with the Claude session (one added mid-session needs a restart; `claude mcp list` shows health); Chromium launches on the first page tool call. Serve the game yourself first — on the Beelink use `python3 -m http.server 8123`, because **port 8000 is taken** there (another service on 127.0.0.1 404s everything, and the python server fails silently).
- **Usage**: call `list_pages` for a `pageId` first. The game is all canvas, so `take_snapshot` shows little — read state with `evaluate_script`, look with `take_screenshot`. `--isolated` gives a fresh profile per session (no stale modules, but no saved high scores/cosmetics/name either).
- **Shutdown**: the browser goes away with the session. Stop the http server with `fuser -k 8123/tcp` — **not** `pkill -f 'http.server 8123'`, which also kills the invoking shell.
- **Limitations**: headless, no audio. `--no-sandbox` is needed because Ubuntu's AppArmor userns restriction aborts sandboxed Chromium — fine for localhost, don't browse untrusted sites with it. The Chromium path is pinned to Playwright's `chromium-1228` (re-register if an update removes it) and the server version to 1.11.0 (bump on purpose). Save screenshots under the OS temp dir.
- **Leaderboard safety**: an automated browser that dies in-game posts a real score to the production leaderboard. Block `firestore.googleapis.com` (Playwright `page.route`) or go offline (MCP `emulate` with `networkConditions: 'Offline'`) after the page loads.

## Architecture

Game logic never touches the DOM, canvas, or Web Audio — everything effectful is injected — so all of `core/`, `systems/`, and `leaderboard/` runs under plain Node for the tests.

### Layers (js/)

- **`config.js`** — every tuning constant. Pure data; a new tunable goes here, never inline.
- **`core/`** — `state.js` (the single mutable state object: `createState()` = session fields + `createRunState()`; `resetRun()` reapplies `createRunState()`), `difficulty.js`, `timeOfDay.js` (score-driven day/night), `color.js`.
- **`systems/`** — gameplay on `(state, …, services)`, with `services = { sfx, music, recordRun }` and injectable `rng`/`now`:
  - `update.js` — the per-frame orchestrator.
  - `control.js` (jump/duck, run start), `spawning.js`, `obstacleTypes.js` (obstacle registry), `birdWalls.js` (multi-bird formations), `collision.js` (dog hitbox + contact resolution), `hearts.js` (spending and regaining hearts), `effects.js` (transient effects list), `giant.js`, `weather.js`, `death.js`.
  - Scenes: `encounters.js` (exclusion rules, scene queue, generic runner `stepScene`), `scenes.js` (registry, phase accessors, `forceScene`), and the scene definitions `tutorial.js` / `chase.js` / `boss.js` / `trampoline.js`.
- **`render/`** — canvas drawing only: `draw.js` (frame orchestrator + per-scene `SCENE_ACTORS`), `view.js` (world→canvas mapping), `background.js`, `obstacles.js` (`OBSTACLE_LOOKS`), `actors.js` (dog/squirrel + cosmetic overlays), `effects.js` (`EFFECT_DRAWERS`), `hud.js`, `primitives.js`.
- **`audio/`** — `sfx.js` (sounds as data in `TONES`; `createSilentSfx()` derives from the same names) and `music.js` (normal + giant-mode tracks); both have silent test doubles.
- **`assets/`** — `sprites.js` (loading + frame advance for dog/squirrel/bird), `dogFrames.js` (the one dog frame list and `resolveDogFrame`, shared with `tools/`), `images.js`.
- **`cosmetics/`** — `cosmetics.js` (`COSMETIC_DEFS`, calibrated `HEAD_ANCHORS`, equipped-state persistence) and `menu.js` (DOM overlay).
- **`leaderboard/`** — `local.js` (localStorage top list), `global.js` (Firestore boards), `recorder.js` (`recordRun`: placement, local list, global submit for a finished run), `checksum.js`, `ui.js` (HTML table).
- **`input/`** — `input.js` (keyboard/touch/mouse) and `debug.js` (`DEBUG_KEYS`: P slow-mo, C chase, B boss, T trampoline, G golden hot dog, R rain, H hat).
- **`ui/`** — `nameEntry.js` (start overlay: name + difficulty, once per page load) and `howToPlay.js` (the HOW TO PLAY button beside ACCESSORIZE: replays the tutorial).
- **`main.js`** — composition root: builds services, wires the DOM, runs the rAF loop (`update()` then `draw()`).

### Invariants and runtime facts

- **State machine**: `state.gameState` goes `setup` → `idle` → `running` → `dead` → `running`. Death records qualifying scores under the setup name via `services.recordRun`; there is no post-death prompt.
- **Coordinates**: the logical world is `W=800, H=250`. `render/view.js` fits it to the viewport width, pins the ground to the bottom, and turns extra height into sky above y=0 (`view.extraTop`; systems see `state.skyTop ≤ 0`). Use `view.scale`/`view.extraTop`, never a hardcoded scale.
- **One clock**: `main.js` passes the rAF timestamp as `now` to `update()` and `draw()`; everything time-based reads it, and renderers never read the clock themselves. Only the leaderboard (Firestore timestamps) and the tutorial's last-seen record use `Date.now()`, since both span visits. Physics was tuned at a 120Hz baseline: `update()` scales by `dt / DT_BASELINE`, with dt capped at 100ms.
- **Encounters never overlap** (giant mode and the four scenes), including transition phases. Scenes share one slot, `state.scene = { id, phase, …data } | null`; trigger bookkeeping that outlives a scene (`lastEndScore`, boss `lastMilestone`) lives in `state.sceneMemory[id]`. Scenes keep `SCENE_MIN_GAP` of normal play between one another.
- **Scene engine**: a scene definition provides `initialData`, `wantsTurn`, `start`, `phases`, and `quietPhases`; `stepScene` handles the shared lifecycle — request a turn → wait at the head of the FIFO `state.sceneQueue` → `'pending'` until the field clears → phases → `'done'`. The queue is what keeps chase's short cooldown from starving the trampoline. A pending scene stands down if giant mode starts but keeps its turn at the queue front.
- **Giant mode**: `state.giantPhase` runs `off → growing → active → shrinking`; `isGiant()` means growing-or-active, and the score multiplier derives from it. `finishGiantTransition` ends grow/shrink at the end of `update()` (drawing never mutates state). Ending grants `GIANT_END_INVULN` i-frames.
- **Hitboxes favor the player**: they sit inside the sprites, never in the air around them. `getDogHitbox` is the dog's bounding box (used for placement checks such as the trampoline bounce and the tutorial's gaps); `checkCollision` uses `getDogHurtboxes`, which in the grounded run pose lowers the box's rear to the back line (`DOG_HITBOX_RUN_REAR`, measured from the run frames), so standing up under a bird that's past the head doesn't hit. Birds' hitboxes stop short of their tail feathers (`BIRD_INSET`). The dog's shaping only lowers the top of its rear on the ground, so every jump clearance is unchanged; the bird trim only makes clearing a bird slightly more forgiving (the bird-wall tests hold either way).
- **Hearts**: `state.startingHearts` comes from the difficulty slider (`DIFFICULTY_LEVELS`, locked per session). A non-fatal hit spends a heart, knocks the obstacle away, and grants `HEART_HIT_INVULN` i-frames; the last heart kills. Boss catches bypass hearts. The only way back is the trampoline's heart pickup (`hearts.js`): it restores one, never past `startingHearts`; with all full it pays `HEART_FULL_BONUS` instead.
- **Tutorial scene** (`systems/tutorial.js`): runs at the start of a run while `state.tutorialPending`, which `main.js` sets from `isTutorialDue` (a device's first visit, `TUTORIAL_REFRESH_MS` since last seen, or a newer `TUTORIAL_VERSION` — bump it when the controls or the tutorial change, not on every deploy) and the HOW TO PLAY button sets. Three steps (chocolate bar: jump; `tower`: double jump; bird wall: duck), each a `practice` obstacle — collision knocks it away without a heart and the step repeats (TRY AGAIN). A prompt appears, and time slows to `TUTORIAL_SLOW_SCALE`, inside each step's `TUTORIAL_GAPS` window; only an action taken while prompted counts, and a jump prompts only with the dog grounded (the jump that starts a run must not count). The windows were measured by sweeping press timings — re-measure if jump physics, speed, or the tower change (`tests/tutorial.test.js` plays it with a bot at several reaction times). The score stays 0 (`scoreless`).
- **Tower** (`tower` obstacle, from score `SPAWN_MIX.tower.after`): too tall for one jump, so it's the double-jump obstacle. It grows with speed (`towerSizeFor`): `TOWER_BARS.short` (5) below `TOWER_TALL_FROM_SPEED`, forgiving of second-press timing, then `.tall` (6), which a faster single jump would otherwise clear. The tutorial gets the short one at its starting speed. Measured by sweeping jump timings against speed — re-sweep if jump physics or `MAX_SPEED` change.
- **Spawn patterns** ease in: none before `PATTERN_FIRST_AT`, then `patternChance` ramps from `PATTERN_CHANCE.start` to `.full` by `.fullAt`.
- **Trampoline scene**: reps scale with speed (`getTrampLayout`) so the thorn patch can't be double-jumped; landing on the island auto-bounces. Thorns are terrain — they cost a heart but stay, and a rising dog passes over them. The obstacle cull is right-edge-based so the wide trampoline doesn't vanish early. A rep with `heart` in `TRAMP_REPS` (the last one) floats a heart pickup just above the bounce's apex, a fixed time after the bounce (`leadFactor * speed` past the island): the bounce resets the double jump, and only a second jump pressed near the apex reaches it. Its placement was measured by sweeping landing spots and press timings at 60/120/144Hz — re-sweep if jump physics, `TRAMP_BOUNCE_VY`, or hitboxes change (`tests/trampoline.test.js` asserts the bounce alone falls short and every landing spot keeps a ≥8-frame window).
- **Layout**: full-bleed everywhere; the CSS splits on `touch-device`. Touch landscape is game-only, touch portrait shows a rotate prompt + leaderboard, desktop scrolls to hints + leaderboard below the game. Installable as a home-screen PWA (`manifest.json`). `?app=1` is a no-op kept for old links.
- Music needs a user interaction to start (autoplay policy): `music.attachAutoplayUnlock()`.

### Extending the game

- **Obstacle type**: an `OBSTACLE_TYPES` entry (`systems/obstacleTypes.js`: size/y, hitbox `inset`, `contact` — `hazard`/`terrain`/`pickup`/`none` — plus `giant: 'eat'|'bonk'` for hazards, `collect` for pickups (a `COLLECT_ACTIONS` entry in `collision.js`), and `aerial`) and an `OBSTACLE_LOOKS` entry (`render/obstacles.js`: `normal`, optional `chase`/`giant`). Build with `makeObstacle`; spawn via a `SPAWN_KINDS` entry or from a scene. `tests/obstacleTypes.test.js` catches a missing registration or look.
- **Spawn mix and patterns**: `SPAWN_MIX` (config) sets the solo mix; `SPAWN_PATTERNS` (`spawning.js`) are close-gap multi-beat sequences; bird walls (`birdWalls.js`) carry `aerialWall` and earn no jump bonus. Each wall's look must match what it takes: the stack (a three-bird column, also the tutorial's duck step) can only be ducked; the triangle (∧) can be ducked or double-jumped. `tests/birdWalls.test.js` holds both against the real physics at every speed. In chase, aerials become acorns at `chaseAcornY()`, the one source for their height in both hitbox and draw.
- **Scene**: a definition object in its own file, added to `SCENES` (`scenes.js`), plus `SCENE_ACTORS` (`render/draw.js`) if it draws actors. Optional `timeScale(scene)` slows game time and `scoreless` stops distance points (see the field list in `encounters.js`). Scene tests use `getScenePhase`/`setScenePhase`, never raw state.
- **Effect**: an `EFFECT_KINDS` entry (`systems/effects.js`: lifetime + optional `step`) and an `EFFECT_DRAWERS` entry (`render/effects.js`); spawn with `addEffect(state, kind, now, props)`.
- **Run-scoped state**: add it to `createRunState()`; a test checks `resetRun` restores exactly that set.
- **Sound**: one `TONES` entry in `audio/sfx.js`; `tests/audio.test.js` checks every `sfx.play*` call exists.
- **Cosmetic item**: an entry in `COSMETIC_DEFS`. *Anchor items* (hats, sunglasses) are one PNG placed by `HEAD_ANCHORS` + `SLOT_ANCHOR_OFFSET` (+ optional per-item `offset`). *Per-frame items* (shoes, body outfits) are one full-size overlay per dog frame plus the bite sheet, generated by `tools/gen-shoes.cjs`, `gen-tutu.cjs`, or `gen-outfits.cjs` (`node tools/gen-X.cjs . [previewDir]`; the preview dir gets alignment composites). Those share `tools/spritelib.cjs` and the frame list in `js/assets/dogFrames.js`. Five sunglasses come from `tools/gen-glasses.cjs`.
- **Tests**: `tests/*.test.js` with `tests/helpers.js` (fake storage, sequence rng, silent services). Keep DOM-touching modules (input.js, ui/, menu, main) out; importing a render module for its tables is fine.

### Leaderboards

- **Local**: top scores in localStorage (`MAX_HIGH_SCORES`); surfaced only as the `HI` figure in the HUD.
- **Global**: Firestore `scores`, one board per difficulty. After setup the game fetches the player's board (up to `GLOBAL_MAX_SCORES`); other tabs load on demand and are cached. Qualification and game-over placement read the cached session board, so death makes no extra Firestore reads; ties rank below existing entries. Submissions carry a salted checksum (`checksum.js`) as friction, not security. Composite index (`firestore.indexes.json`): `difficulty` ASC, `score` DESC, `timestamp` ASC.
- The Firebase config in `js/firebase.js` is a public web config — not a secret, not a security boundary.
- **Rules are strict**: `firestore.rules` allows exactly `name, score, difficulty, timestamp, checksum` with type/range checks. **Any change to the submitted doc needs `firestore.rules` (and indexes if relevant) updated and `npm run firebase:deploy`**, or submissions fail with PERMISSION_DENIED (only a `console.warn` in-game). Admin scripts and bulk deletes (`firebase/delete-scores-by-*.mjs`) are documented in `firebase/README.md`; the service-account key is git-ignored.

### Input

- Desktop: Space/Up jump (twice for a double jump), Down/S duck, click jumps.
- Touch: the right side jumps, holding the left `DUCK_ZONE_RATIO` (40%) ducks (tracked per finger, so a jump tap doesn't end it); the speaker icon top-left toggles music.
- Duck is a held input (`state.duckHeld`), applied every frame by `applyDuck`: the dog ducks whenever duck is held and it's grounded, so holding it through a jump ducks on the landing frame, before collision.
- Fast-fall: a duck *pressed* mid-air cuts any rise to `FAST_FALL_VY` and multiplies gravity by `FAST_FALL_GRAVITY_MULT` until landing, release, a double jump, or a trampoline bounce (`dog.fastFalling`). A duck held since the ground (into a bounce) doesn't trigger it.
