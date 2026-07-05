# Trampoline Scene — Implementation Plan

A new encounter for Dachshund Dash: a wide **thorn patch** blocks the ground, with a
**trampoline island** partway into it. The player must jump *onto* the trampoline;
the super-bounce it grants is the only way to clear the rest of the patch. The scene
runs **three** trampoline/patch reps, with a short breather between each, then normal
play resumes. Like the chase and boss scenes, it is mutually exclusive with the other
encounters and spawns no ordinary obstacles while active.

## Locked design decisions

- Hazard is a **thorn patch** (canvas primitives, pixel-art style like every other obstacle — no PNGs).
- The trampoline sits **inside** the patch (an island), not in front of it. Running on the ground into the patch means thorns; the only safe path is jump → land on island → auto-bounce → clear the exit thorns.
- **Bounce is automatic on contact** — the skill is landing there, not pressing a button on time.
- The bounce **resets the double jump** (`doubleJumped = false`), so the player gets one mid-air correction on both the approach and the bounce arc.
- **Miss = heart loss, never scene-end.** Thorn contact spends a heart via the existing heart/i-frame system; the 1500 ms i-frames carry the dog through the rest of the patch and the scene continues to the next rep. Losing the last heart in thorns kills, as any hit does.
- **No pickups, no heart refills.** The reward is a flat score bonus per clean bounce.
- Chained double-bounce finale is **v2 — out of scope** for this plan.
- Debug hotkey **T** triggers the scene immediately (like C = chase, B = boss).

## Physics math (do not re-derive — these drive the layout constants)

All time in *baseline frames* (`dt / DT_BASELINE`, the 120 Hz-equivalent unit every
system uses). `GRAVITY = 0.5`, `GROUND_Y = 200`, speed `S = state.speed` (3.0 → 7.0).

| Motion | vy | Airtime (frames) | Height (px) | Horizontal (px) |
|---|---|---|---|---|
| Single jump | −11 | 44 | 121 | 44·S |
| Optimal double jump | −11 then −7 at apex | ≈62 | ≈170 | ≈62·S |
| **Trampoline bounce** | **−14** | **56** | **196** | **56·S** |

- Bounce vy is −14, **not** −15: apex sits at world y = 200 − 196 = **4**, i.e. just inside the base world, so the arc is fully visible even on a viewport with zero `extraTop`. (−15 would put the apex at y = −25, off-screen on wide desktop windows.)
- **Anti-bypass invariant**: total patch width must exceed the max double-jump carry (62·S) at every speed, so the trampoline is never skippable. The per-rep numbers below satisfy this for all S ≤ 7 — a unit test must assert it (see Tests).
- **Bounce-clearance invariant**: a bounce from the island's *leading* edge (earliest possible contact) must clear `trampWidth + exitWidth`: `56·S ≥ trampWidth + 30·S` ⟺ `26·S ≥ trampWidth`. Holds from S ≈ 3.23 up; the scene first triggers at score 350 (S ≈ 3.35). Margins are thin at minimum speed by design — the double jump is the correction mechanism. If playtests show unfair leading-edge bounces, lower `exitFactor` before touching the bounce velocity.

## Layout (computed per rep at spawn time from current speed)

Layout **must scale with `state.speed`** — airborne distance is speed-dependent, so
fixed pixel widths would be trivial at speed 7 and impossible at speed 3.

Per-rep difficulty ramp (rep 0 teaches, rep 2 tests):

```js
export const TRAMP_REPS = [
  { islandOffsetFactor: 22, trampWidth: 84, exitFactor: 30 },  // rep 0: close, wide
  { islandOffsetFactor: 26, trampWidth: 72, exitFactor: 30 },  // rep 1
  { islandOffsetFactor: 30, trampWidth: 60, exitFactor: 30 },  // rep 2: deep, narrow
];
```

A rep, spawned at `x = W + 10` and scrolled left like any obstacle:

```
[ entry thorns: islandOffsetFactor·S px ][ trampoline: trampWidth px ][ exit thorns: exitFactor·S px ]
```

Build the thorn spans out of **tiles** (`TRAMP_TILE_W = 32`), each tile one obstacle
`{ type: 'thorns' }` — `entryTiles = Math.ceil(islandOffsetFactor * S / 32)`, same for
exit. Tiles reuse the existing obstacle scroll/cull/draw machinery, keep every
obstacle narrow, and make the repeated-bramble art natural. The trampoline is a single
obstacle `{ type: 'trampoline', squashUntil: 0 }` at `y = GROUND_Y - 12` (its top
surface), thorn tiles at `y = GROUND_Y - 14, width: 32, height: 30`.

These are starting values — expect to tune with the T hotkey. Every number goes in
`config.js`, never inline.

## New config constants (`js/config.js`)

```js
// --- Trampoline scene ---
export const TRAMP_FIRST_AT = 350;        // score before the first scene can arm
export const TRAMP_COOLDOWN = 400;        // score between scenes (from lastTrampEndScore)
export const TRAMP_BOUNCES = 3;           // reps per scene
export const TRAMP_BOUNCE_VY = -14;       // super-bounce launch velocity (see physics table)
export const TRAMP_BOUNCE_BONUS = 50;     // points per clean bounce
export const TRAMP_BREATHER = 120;        // baseline frames of empty field between reps (~1s)
export const TRAMP_TILE_W = 32;           // thorn tile width
export const TRAMP_HITBOX_PAD = 8;        // horizontal forgiveness on the trampoline surface
export const TRAMP_REPS = [ /* table above */ ];
```

## New state fields (`js/core/state.js`)

In `createState()` (grouped like the other encounters) **and reset in `resetRun()`**:

```js
// --- Trampoline scene ---
trampPending: false,        // waiting for obstacles to clear
trampActive: false,         // scene running (spawns its own field)
trampRep: 0,                // reps spawned so far (0..TRAMP_BOUNCES)
trampBreatherFrames: 0,     // countdown between reps
lastTrampEndScore: 0,       // 0 = never run (gates TRAMP_FIRST_AT vs cooldown)
trampBounceEffects: [],     // [{x, y, startTime}] "+50" popups
```

## New module: `js/systems/trampoline.js`

Follows the `chase.js`/`boss.js` shape exactly: a pure state machine over
`(state, scale, services, now)`, no DOM/canvas imports, all randomness/clock
injectable — must run under Node.

```
updateTrampoline(state, scale, services, now)
  if (state.trampActive)
    ── bounce check (every frame, see below)
    ── const sceneObstacles = state.obstacles.some(o => o.type === 'thorns' || o.type === 'trampoline')
    ── if (!sceneObstacles)
         if (state.trampRep >= TRAMP_BOUNCES)
           scene over: trampActive = false; lastTrampEndScore = state.score;
           state.nextObstacleIn = MIN_OBSTACLE_GAP   // don't instantly spawn on top of the dog
         else
           trampBreatherFrames -= scale
           if (trampBreatherFrames <= 0) { spawnTrampRep(state); trampRep++; trampBreatherFrames = TRAMP_BREATHER }
  else if (state.trampPending)
    ── if (state.obstacles.length === 0) { trampPending = false; trampActive = true; trampRep = 0; trampBreatherFrames = TRAMP_BREATHER }
  else
    ── canStart = !giantActive && !giantGrowing && !giantShrinking
                && !chasePending && !chaseEntering && !chaseActive && !chaseEscaping
                && !bossPending && !bossChasing && !bossLosing
                && ((lastTrampEndScore === 0 && score >= TRAMP_FIRST_AT)
                 || (lastTrampEndScore > 0 && score >= lastTrampEndScore + TRAMP_COOLDOWN))
    ── if (canStart) trampPending = true
```

Also export two pure helpers (both unit-tested directly):

- `getTrampLayout(rep, speed)` → `{ entryTiles, trampWidth, exitTiles, patchWidth }` — all width math lives here.
- `spawnTrampRep(state)` — pushes the tile/trampoline obstacles at `x = W + 10` using `getTrampLayout(state.trampRep, state.speed)`.

### Bounce detection (inside `updateTrampoline`, runs while `trampActive`)

For the trampoline obstacle `t` (if present):

```js
const dogBox = getDogHitbox(state.dog, false);   // giant impossible mid-scene (mutual exclusion)
const overlapX = dogBox.x < t.x + t.width + TRAMP_HITBOX_PAD
              && dogBox.x + dogBox.w > t.x - TRAMP_HITBOX_PAD;
if (overlapX && state.dog.vy >= 0 && state.dog.y >= t.y - 2) {
  state.dog.y = t.y;                    // snap feet to the membrane
  state.dog.vy = TRAMP_BOUNCE_VY;
  state.dog.jumping = true;
  state.dog.doubleJumped = false;       // fresh air correction
  state.dog.ducking = false;
  state.score += TRAMP_BOUNCE_BONUS;
  state.trampBounceEffects.push({ x: t.x + t.width / 2, y: t.y, startTime: now });
  t.squashUntil = now + 250;            // render: membrane depression
  services.sfx.playBoing();
}
```

Notes: `vy >= 0` means a grounded dog (vy = 0, y = 200 ≥ t.y) that somehow reaches the
island also bounces — forgiving, and no retrigger is possible because the dog leaves
with vy = −14 immediately. No `invulnUntil` check — bouncing is not damage, and it must
work while i-frames from a previous thorn hit are running.

## Collision changes (`js/systems/collision.js`)

**`getObstacleHitbox`** — add:

```js
if (obs.type === 'thorns') {
  // Forgiving: inset sides, top starts below the visual bramble crown so a
  // grazing arc doesn't count.
  return { x: obs.x + 4, y: obs.y + 8, w: obs.width - 8, h: obs.height - 8 };
}
```

**`checkCollision`** — two new branches, placed **after the golden branch and before
the giant branch** (giant can only coexist with the scene via debug keys; terrain
should still hurt a giant dog rather than be "eaten"):

```js
if (obs.type === 'trampoline') continue;   // never harmful; bounce handled in trampoline.js

if (obs.type === 'thorns') {
  if (now < state.invulnUntil) continue;
  // Terrain, not a projectile: spend a heart but do NOT bonk-fling or splice
  // the tile — the patch must stay so the i-frames visibly carry the dog through.
  state.hearts--;
  if (state.hearts > 0) {
    state.heartLostAt = now;
    state.invulnUntil = now + HEART_HIT_INVULN;
    services.sfx.playBonk();
    continue;
  }
  return true;   // last heart → killDog path in update.js
}
```

Why i-frames are always enough to cross: 1500 ms at pixel-rate `speed × 120 px/s`
covers `180·S` px, vs a worst-case patch of `~52·S + 84` px. Holds at every speed.

## Integration edits (each is small — do not miss any)

1. **`js/systems/update.js`**
   - Suppress normal spawning during the scene — extend the condition at the `spawnObstacle` call: `&& !state.trampPending && !state.trampActive`.
   - **Cull fix**: change `state.obstacles = state.obstacles.filter(o => o.x > -40)` to right-edge-based: `state.obstacles.filter(o => o.x + o.width > -10)`. The 84 px trampoline would otherwise vanish while still partly on screen. Behavior for all existing (≤ 66 px) types is equivalent.
   - Call `updateTrampoline(state, scale, services, now)` next to `updateChase`/`updateBoss` — i.e. **after** obstacle movement, **before** `checkCollision` (the bounce must win over any same-frame thorn overlap at the island edge).
   - Expire bounce popups alongside the others: `state.trampBounceEffects = state.trampBounceEffects.filter(e => now - e.startTime < 800);`
2. **`js/systems/chase.js`** — add `&& !state.trampPending && !state.trampActive` to `canStart`.
3. **`js/systems/boss.js`** — same addition to `bossCanStart`. (A boss milestone crossed mid-scene arms naturally right after — same behavior chase/boss already have with each other.)
4. **`js/systems/spawning.js`** — add the same two flags to `goldenEligible`.
5. **`js/systems/death.js`** — `killDog` clears `trampPending`, `trampActive` (pattern: it already clears every other encounter flag).
6. **`js/core/state.js`** — `resetRun` resets all six new fields.
7. **`js/audio/sfx.js`** — add `playBoing()`: a bouncy rising sweep (e.g. sine ~150 → 600 Hz over ~0.25 s, quick decay), following the existing synth style. **Also add the noop to `createSilentSfx()`** — tests break otherwise.
8. **`js/input/input.js`** — debug key, same pattern as C/B:
   ```js
   // Debug: T = trigger trampoline scene (when running)
   if (e.code === 'KeyT' && state.gameState === 'running' && !state.trampActive && !state.trampPending) {
     e.preventDefault();
     state.trampPending = true;
     state.obstacles = [];  // clear field so the scene starts immediately
   }
   ```
   (T is unused; existing debug keys are P, H, C, B, G, R.)

## Rendering (`js/render/`)

All primitives, matching the existing obstacle art style (bold dark outlines,
saturated fills — see `drawHotDog`/`drawBird` for the idiom).

- **`obstacles.js`** — two new draw functions plus dispatch:
  - `drawTrampoline(ctx, x, y, width, frameCount, squashed)`: two splayed dark legs (#3A3A3A), a rounded frame bar with red safety pads (#D94438 — already in the palette), a blue membrane (#2E5FB7, lighter sheen line). Membrane has a constant idle wobble (`Math.sin(frameCount * 0.15) * 1.5` px center dip) so it *reads as bouncy* on first sight — this is the primary telegraph for a mechanic the player has never seen. While `squashed` (`now < obs.squashUntil`), dip the membrane ~6 px and ease back.
  - `drawThorns(ctx, x, y, seed)`: one 32 px bramble tile — a low mound of 2–3 crossing curved stems (#4A5D23 / #5C3A1E), 5–7 small thorn triangles along them (pale tips, e.g. #C7CBA0), and 1–2 tiny red berry accents. Vary each tile deterministically (hash of the tile's spawn index or initial x passed as `seed` on the obstacle — **not** `Math.random()` per frame, tiles must not shimmer).
  - `drawObstacle`: dispatch `'trampoline'` and `'thorns'` **before** the chase-skin logic (like `'golden'`), passing `state.frameCount` and squash state.
- **`effects.js`** — `drawTrampBounceEffects(ctx, state, now)`: copy the `drawBirdJumpEffects` pattern; text `'BOING! +' + TRAMP_BOUNCE_BONUS`, distinct color (e.g. #7A4FBF), rising and fading over 800 ms.
- **`draw.js`** — call `drawTrampBounceEffects` alongside the other effect passes.

Optional polish (separate commit, safe to skip): dog somersault during the bounce arc —
in `render/actors.js`, rotate the sprite around its center by
`2π · arcProgress` while airborne from a bounce (needs a `state.dog.bouncing` flag set
on bounce, cleared on any landing). The bounce apex is the most GIF-able moment in the
game; this is where the charm budget goes if there is one.

## Tests — new file `tests/trampoline.test.js`

Node built-in runner, using `tests/helpers.js` (`createTestServices`,
`createSequenceRng`) and the stepping pattern from `tests/systems.test.js`: build a
state with `createState`, set `gameState = 'running'`, and loop
`update(state, DT_BASELINE, services, rng, now)` with a hand-advanced `now`.

1. **Layout invariants (pure, analytic)** — for every rep in `TRAMP_REPS` and speeds 3.0 → 7.0 (step 0.5): `getTrampLayout(rep, S).patchWidth > 62 * S` (double-jump can't bypass) and `56 * S >= trampWidth + exitFactor * S` for S ≥ 3.35 (leading-edge bounce clears the exit). These tests are the guardrail for all future tuning.
2. **Arming & activation** — score set past `TRAMP_FIRST_AT`: `trampPending` goes true; stays pending while obstacles exist; on a clear field, activates and after the breather spawns rep 0 (assert thorn tiles + one trampoline in `state.obstacles`, correct x-ordering: entry tiles < trampoline < exit tiles).
3. **Mutual exclusion, both directions** — with `giantActive`/`chaseActive`/`bossChasing` set, the scene never arms; with `trampActive` set, `updateChase` doesn't arm a chase, `updateBoss` doesn't arm a boss, and `spawnObstacle` never produces a golden (drive `rng` to always favor golden). Also: no regular obstacle spawns while `trampActive` even when `nextObstacleIn <= 0`.
4. **Bounce** — place the dog descending (vy > 0) onto the trampoline top: after one update, `vy === TRAMP_BOUNCE_VY`, `doubleJumped === false`, `jumping === true`, score increased by `TRAMP_BOUNCE_BONUS`, one entry in `trampBounceEffects`, and a boing was played (override `sfx` in `createTestServices` with a counting stub).
5. **Bounce arc clears the patch (integration)** — spawn rep 0 at speed 3.5, script the dog: single jump timed to land on the island, then let physics run with no further input. Assert the dog crosses the entire patch with `state.hearts` unchanged and ends grounded past the last exit tile.
6. **Miss = heart, not scene-end, patch persists** — run the grounded dog into the entry thorns: exactly one heart lost, `invulnUntil` set, **thorn tiles still present** (no splice, no `giantBonkEffects` entry), and while i-frames last, further thorn overlap costs nothing. Scene proceeds: after the patch scrolls off, rep 1 spawns.
7. **Last-heart thorn hit kills** — `hearts = 1`, thorn contact → `gameState === 'dead'` and `killDog` cleared `trampActive`/`trampPending`.
8. **Trampoline is never harmful** — force `checkCollision` with the dog overlapping only the trampoline obstacle: no heart loss, returns false.
9. **Scene completion** — run all three reps to completion: `trampActive` false, `lastTrampEndScore === state.score` (approx), `trampRep === 3`, `nextObstacleIn` was reset, and normal spawning resumes on the next eligible frame. Then: no re-arm until `lastTrampEndScore + TRAMP_COOLDOWN`.
10. **resetRun** — set all six fields dirty, `resetRun`, assert defaults.
11. **Wide-obstacle cull** — an obstacle with `width: 84` at `x = -30` survives the cull; at `x = -95` it is removed (covers the update.js filter change).

Run: `npm test`. **All pre-existing tests must stay green** — the collision and update
edits touch shared paths (watch `collision.test.js` and `update.test.js`).

## How to know it's actually working

### Automated
- `npm test` — everything green, including the 11 new tests.

### Manual playtest (the real acceptance bar)
`python3 -m http.server 8000`, hard-refresh (stale-module gotcha), start a run, press **T**:

1. Field clears, then a thorn patch with a visibly wobbling trampoline island scrolls in. Nothing else spawns during the scene.
2. Jumping onto (or near — the pad is forgiving) the trampoline: loud boing, membrane squashes, dog launches visibly higher than any jump, "BOING! +50" popup, dog lands safely past the thorns. Double jump works mid-arc.
3. Deliberately running into thorns: exactly one heart disappears from the HUD, the dog flickers (i-frames) through the rest of the patch, the patch does **not** vanish or fling away, and the scene continues to the next rep.
4. Three reps with ~1 s breathers, then normal obstacles resume. T does nothing while the scene runs; a second T works after it ends.
5. Regression sweep: C (chase), B (boss), G (golden/giant) still behave; die and restart mid-scene — no leftover thorns or flags on the new run; DevTools console clean throughout.
6. Organic trigger: play past score 350 without T — the scene arms itself; after it ends it doesn't re-arm before +400 score.
7. Mobile sanity (touch or DevTools device mode): right-side tap timing can hit the island; the high arc stays on screen.

### Headless (per `.claude/skills/verify/SKILL.md`)
Serve + playwright-core against the system Chromium. Start a run (`Space`), press `T`,
wait ~2 s, screenshot and **Read the PNG** — eyeball the patch, island, and (with a
second screenshot timed after a jump) the bounce arc. Assert zero `pageerror`s across
a full scripted scene. Pixel probes if wanted: sample logical ground-level y≈195 ahead
of the dog for bramble greens (#4A5D23) vs grass. Timing a precise island landing
headlessly is not worth automating — the unit tests own logic correctness; headless
owns "it renders and nothing throws".

## Documentation updates (required by repo convention)

- **`dachshund-dash/CLAUDE.md`**: add T to the debug-key list (input section), mention the trampoline scene wherever chase/boss/giant encounters are enumerated (key runtime facts + `systems/` list), and note the new obstacle types in the "extending the game" section.
- **`.claude/skills/verify/SKILL.md`**: add T to its debug-key list.
- **`README.md`**: check whether it lists gameplay features; if so, add the scene.

## Suggested commit order

1. Config + state fields + `systems/trampoline.js` + collision changes + update.js wiring + mutual exclusion + death/reset + tests (the game is fully playable-logic-complete here, rendered as invisible boxes).
2. Rendering (trampoline, thorn tiles, bounce popup) + `playBoing` + hotkey T + docs.
3. Optional: dog somersault polish.

## Explicitly out of scope (v2 ideas, do not build)

- Chained double-bounce finale (two islands in one patch).
- Timed-press bounce boost, apex pickups, heart refills (hearts never refill in this game), scene-specific music track.
