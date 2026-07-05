# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dachshund Dash is a pixel-art endless runner (Chrome Dino-style) starring a dachshund. It's a static site built from native ES modules: `index.html` is a thin HTML shell, `css/style.css` holds all styles, and the game lives in `js/` as vanilla-JS modules rendered onto a `<canvas>`. There is no build step, bundler, or framework; `package.json` exists only to run the unit tests.

Live at https://execdd17.github.io/dachshund-dash/ (deployed via GitHub Pages from this repo).

## Common Commands

```bash
# Run locally — must be served over HTTP (ES modules don't load from file://)
python3 -m http.server 8000      # then visit http://localhost:8000

# Unit tests (Node 18+ built-in test runner, zero dependencies)
npm test                         # or: node --test tests/*.test.js
```

There is no lint or build tooling. Verify gameplay changes by running the tests and playing the game in a browser (check the DevTools console for errors, especially around asset loading and Firebase init). For headless verification, `.claude/skills/verify/SKILL.md` documents a working playwright-core recipe (driving the game, reading canvas state, DOM signals).

## Architecture

The code is layered so that game logic never touches the DOM, canvas, or Web Audio directly — everything effectful is injected. That's what makes the `tests/` suite possible: all of `core/`, `systems/`, and `leaderboard/` runs under plain Node.

### Layers (js/)

- **`config.js`** — every tuning constant (physics, speeds, spawn chances, encounter timings, sprite scales, storage keys). Pure data; imported everywhere.
- **`core/`** — `state.js` (the single mutable state object: `createState()`, `resetRun()`; field names match the pre-refactor globals), `timeOfDay.js` (score-driven day/night cycle), `color.js` (lerpColor).
- **`systems/`** — pure-ish gameplay logic operating on `(state, …, services)`:
  - `update.js` — per-frame orchestrator (physics, scrolling, scoring, weather) that calls the others
  - `control.js` (jump/duck + run reset), `spawning.js`, `collision.js` (hitbox math + resolution, incl. heart spend/i-frames), `giant.js`, `chase.js`, `boss.js`, `death.js`, `weather.js`
  - `services` = `{ sfx, music, globalScores, recordScore }`; randomness and clock are injectable (`rng`, `now`) for deterministic tests.
- **`render/`** — canvas drawing only, all functions take `(ctx, state, …)`: `draw.js` (frame orchestrator), `view.js` (world→canvas mapping: full-viewport sizing on every device, extended sky, safe-area insets), `background.js`, `obstacles.js` (incl. the per-type/skin dispatch in `drawObstacle`), `actors.js` (dog/squirrel sprites + cosmetic overlays), `effects.js`, `hud.js`, `primitives.js`.
- **`audio/`** — `sfx.js` (Web Audio-synthesized effects behind a `createSfx()` interface; `createSilentSfx()` for tests) and `music.js` (normal + giant-mode EDM tracks, autoplay unlock, `createSilentMusic()` for tests).
- **`assets/sprites.js`** — PNG sprite loading and frame-advance state for dog/squirrel; the frame-selection helpers are pure.
- **`cosmetics/`** — `cosmetics.js` (slot/item registry `COSMETIC_DEFS`, head-anchor calibration data, equipped-state persistence) and `menu.js` (DOM overlay UI).
- **`leaderboard/`** — `local.js` (localStorage top-5, storage injected), `checksum.js`, `global.js` (Firestore fetch/submit + pure filtering), `ui.js` (HTML table).
- **`input/input.js`** — keyboard/touch/mouse wiring, including debug keys (P slow-mo, C chase, B boss, G golden hot dog, R rain, H hat).
- **`ui/nameEntry.js`** — high-score name overlay.
- **`main.js`** — composition root: the only module that imports everything; builds services, wires DOM controls, runs `requestAnimationFrame` loop calling `update()` then `draw()`.

### Key runtime facts

- `state.gameState` is the state machine: `setup` (start overlay: name + difficulty, once per page load) → `idle` → `running` → `dead` → back to `running`. Qualifying scores are recorded on death under the setup name (`services.recordScore`) — there is no post-death name prompt.
- Logical world is `W=800, H=250` (config.js); all coordinates are in logical space. The canvas fills the viewport on every device: `render/view.js` fits the world to the width (ground pinned to the bottom, extra height becomes sky above y=0 — `extraTop`; systems see it as `state.skyTop ≤ 0`) and recomputes `view.scale` on resize, so canvas-pixel positions depend on the window size (use `view.scale`/`view.extraTop`, never a hardcoded scale).
- The game was tuned at a 120Hz-equivalent baseline; `update()` scales by `dt / DT_BASELINE` for frame-rate independence, and dt is capped at 100ms.
- The dachshund/squirrel are PNG sprite sequences (`png/…`); every other obstacle is drawn with canvas primitives.
- Encounters (squirrel chase, boss, giant mode) are mutually exclusive; each is its own module under `systems/`.
- Music requires a user interaction to start (browser autoplay policy) — see `music.attachAutoplayUnlock()`.
- **Hearts (lives)**: runs start with `state.startingHearts`, set by the difficulty slider on the start overlay (`DIFFICULTY_LEVELS` in config.js: VERY EASY 6 → VERY HARD 1, default NORMAL 3; locked per session — reload to change). A non-fatal hit in `checkCollision` spends a heart, knocks the obstacle away with the giant-mode bonk effect, and grants `HEART_HIT_INVULN` ms of i-frames (`state.invulnUntil`; the dog flickers in `draw.js`). A hit on the last heart kills. The HUD hearts (`drawHearts` in `render/hud.js`, pixel-art bitmap) sit top-left below the speaker/giant-timer slot; boss catches bypass hearts and kill directly. When giant mode ends, `deactivateGiantMode` grants `GIANT_END_INVULN` ms of the same i-frames, so an obstacle overlapping the dog at the shrink moment can't kill.
- **Layout** (full-bleed everywhere): `main.js` puts `app-mode` on `<body>` unconditionally; the CSS then splits on `touch-device`. Touch devices lock to the viewport — landscape is game-only (page furniture hidden), portrait hides the game and shows a rotate prompt plus the browsable leaderboard. Desktop (no touch — a laptop can't rotate) shows the full-viewport game at the top of a normally scrollable page with hints + global leaderboard below the fold; the setup-state keydown handler in `input/input.js` suppresses Space/arrow page scrolling under the overlay. The legacy `?app=1` query param is accepted but now a no-op. The game is also installable to a phone home screen (`manifest.json` + `icons/`), which just gets the same touch layout without browser chrome.

### Extending the game

- **New obstacle type**: add spawn logic in `systems/spawning.js`, a hitbox case in `systems/collision.js` (`getObstacleHitbox`), and a draw case in `render/obstacles.js` (`drawObstacle`).
- **New cosmetic item**: two kinds. *Anchor items* (hats, sunglasses): drop the PNG under `png/<slot>/…` and add an entry to `COSMETIC_DEFS` in `cosmetics/cosmetics.js`; per-slot placement is `SLOT_ANCHOR_OFFSET` + the pose-calibrated `HEAD_ANCHORS`. *Per-frame items* (the shoes in the clothes slot, the tutu in the body slot): one full-size transparent overlay PNG per dog frame plus the bite sheet (`item.frames` dir; `item.image` is just the menu icon), selected by `getOverlayFrame` and drawn with the base frame's exact geometry so they track the paws in every pose. The sneaker overlays are generated by `node tools/gen-shoes.cjs .` from hand-picked per-frame paw boxes — add a palette to `STYLES` there for a new colorway. The tutu overlays come from `node tools/gen-tutu.cjs . [previewDir]`, which paints a waistband + tulle frills around a hand-picked per-frame waist anchor (`SPECS` there), auto-fitting to the body silhouette.
- **New tunable**: add it to `config.js`, never inline.
- **New test**: `tests/*.test.js`, Node built-in runner; use `tests/helpers.js` (fake storage, sequence rng, silent services). Keep browser-only imports (render/, input/, ui/, menu, main) out of tests.

### Leaderboards

- **Local**: top scores in localStorage (`leaderboard/local.js`, capped at `MAX_HIGH_SCORES`).
- **Global**: Firebase Firestore `scores` collection (`firebase.js` + `leaderboard/global.js`), **per difficulty**: every submission carries the session's difficulty label (`state.difficulty`, e.g. `'NORMAL'`), the UI (`leaderboard/ui.js`) shows one board per difficulty with tabs to switch (defaults to NORMAL; jumps to the player's chosen difficulty after setup), and `qualifies(score, difficulty)` judges against that difficulty's board only. Fetch is a single mixed query (limit `GLOBAL_MAX_SCORES × #difficulties`) bucketed client-side by the pure `getScoresForDifficulty`; legacy docs without a `difficulty` field are filtered out entirely. Submissions carry a simple non-cryptographic checksum (`checksum.js`, DJB2-style salted hash over name|score|timestamp|difficulty) as friction against casual tampering — not real security.
- The Firebase config/API key in `js/firebase.js` is a public client-side web config (expected to be visible in a static site) — don't treat it as a secret to redact, but also don't assume it's a security boundary. Firestore rules gate write access.
- **Firestore rules**: `firestore.rules` is a reference copy of the live rules, which are edited by hand in the Firebase console (nothing in this repo deploys them). The rules strictly validate the score doc shape — exactly the keys `name, score, difficulty, timestamp, checksum`, plus type/range checks (name 1–12 chars, difficulty one of the five labels, score 0–100000, timestamp near server time). **Any change to the submitted doc shape or these constraints (new field, new difficulty label, higher score cap, etc.) requires updating `firestore.rules` AND explicitly telling the user to paste it into the Firebase console** — otherwise every submission fails with PERMISSION_DENIED, silently (just a `console.warn` in-game).

### Input

- Desktop: keyboard (Space/Up jump, Down/S duck) and mouse click/tap.
- Mobile: touch-only, screen-position-based — right side jumps, holding the left `DUCK_ZONE_RATIO` (40%) ducks. Touch detection adds a `touch-device` body class used by the CSS for mobile hints.
