# Cosmetics Menu Design

## Context

Dachshund Dash currently has one cosmetic item — the Purple Wizard Hat — toggled via a secret `KeyH` hotkey (`index.html:3229`). The goal is to replace this with a discoverable, extensible GUI that will grow to support multiple cosmetic categories: hats, sunglasses, and clothes (a single body garment, e.g. a vest — not separately tracked shirt/pants).

## Goals

- Replace the secret hotkey with a visible, in-game way to browse and equip cosmetics.
- Support multiple independent cosmetic slots that can be worn simultaneously (a hat *and* sunglasses *and* clothes at once), not a single mutually-exclusive selection.
- Design for a growing item list per category without reworking the UI or data model each time an item is added.
- Let players preview a combo before committing to it.

## Non-goals

- This round does not add real sunglasses or clothes art/items — it ships the menu, state, and rendering *infrastructure* only. See "Phased rollout" below.
- No server-side/account-synced cosmetics; this stays local (`localStorage`), same trust level as high scores.
- No combinatorial art (e.g. a single baked image of "dog + hat + sunglasses + vest" together) — see Rendering Architecture.

## Rendering architecture

Today's hat art (`png/hats/Purple Wizard Hat/*.png`) is a **fully baked image of the whole dog wearing the hat**, at the same 512×1024 canvas as the base dog sprites. This doesn't support combining independent slots — you'd need a baked image for every combination of hat × sunglasses × clothes, which explodes as items are added.

Instead, cosmetic items become **transparent-background overlay images**, one per animation frame, drawn at the exact same canvas size, anchor, and `drawImage` parameters as the base dog frame. This means equipping multiple slots is just additional `drawImage` calls layered on top of the base dog frame at *identical* coordinates/scale — no new positioning math, anchor data, or per-item offsets required. This also means the existing Purple Wizard Hat frames must be redone as hat-only transparent overlays; the current baked frames can't be reused as-is.

Draw order (back to front): base dog → clothes → sunglasses → hat.

## Data model

```js
const COSMETIC_SLOTS = ['hat', 'sunglasses', 'clothes'];

const COSMETIC_DEFS = {
  hat:        [ /* { id, name, dir, thumbnail } entries */ ],
  sunglasses: [ /* ... */ ],
  clothes:    [ /* ... */ ],
};
```

Each item definition: `{ id, name, dir, thumbnail }`. `dir` points at a folder of same-named animation frames (`dachshund_run_00.png`, `dachshund_pancake_00.png`, `dachshund_jump_00.png`, `dachshund_flip_00.png`, `bite_3_image_sequence.png`) mirroring the base dog's animation set. `thumbnail` is a standalone icon image used in the menu grid (the existing hat folders already contain a suitable standalone icon, e.g. `hat_rotated.png`).

Sprites load eagerly at startup (same pattern as `loadDogSprites()` today) into a nested structure: `cosmeticSpritesById[slot][itemId][anim][frameIndex]`. Eager loading is fine at this scale (single-digit items per slot); revisit only if the roster grows large enough to matter.

## State & persistence

```js
let equipped = { hat: null, sunglasses: null, clothes: null }; // null = "None"
```

Persisted as JSON under a new `localStorage` key (e.g. `EQUIPPED_COSMETICS_KEY`), loaded at startup alongside `loadHighScores()`. Replaces the current `hatEnabled` boolean entirely.

## Rendering integration

Wherever the game currently draws the dog (main game canvas, at any `gameState`), after drawing the base `dogSprites[anim]` frame, loop `COSMETIC_SLOTS` in draw order and, for each slot where `equipped[slot]` is set and that item has frames for the current `anim`, draw its overlay frame at the same position/scale as the base frame just drawn. This same draw-dog routine is reused for the menu's preview box.

## Menu UI

**Entry point:** a "CUSTOMIZE" text button on the idle screen (`gameState === 'idle'`), styled like existing buttons (`#4a8f3f` accent, Courier New), positioned below the "Press SPACE to start!" banner. Implemented as a DOM element (not canvas-drawn), shown/hidden via a CSS class toggled based on `gameState`, matching how `#nameEntryOverlay` is shown/hidden today.

**Menu panel:** a new full-canvas DOM overlay (`#cosmeticsMenu`), same absolute-overlay pattern as `#nameEntryOverlay` (dark `rgba(0,0,0,0.55)` backdrop, centered panel, `z-index` above the canvas). Contents, top to bottom:

1. **Preview box** — a small canvas or `<img>`-based static render of the dog in its idle pose with everything currently in `equipped` composited on top. Redrawn immediately on every tile click. Static pose only (no animation loop) — keeps this to a single draw call, no extra `requestAnimationFrame` loop scoped to the menu's lifetime.
2. **Tab row** — one tab per entry in `COSMETIC_SLOTS` (HAT / SUNGLASSES / CLOTHES), styled like the tile borders (green underline/border on the active tab). Clicking a tab sets `activeSlot` and re-renders the grid below it.
3. **Item grid** — tiles for `COSMETIC_DEFS[activeSlot]`, always prefixed with a "None" tile. Selected tile (matching `equipped[activeSlot]`) gets the green-border/light-green-fill selected state. Clicking a tile sets `equipped[activeSlot]` to that item's id (or `null` for "None"), updates the preview, persists to `localStorage`, and — since it's the same `equipped` state the main render loop reads — updates the live game canvas immediately too.
4. **DONE button** — closes the overlay (removes the visible class).

## Debug hotkey

`KeyH` remains wired up (`index.html:3229`) but changes behavior: toggles `equipped.hat` between `null` and the first entry in `COSMETIC_DEFS.hat`, for quick manual testing during development. It does not touch `sunglasses` or `clothes`.

## Phased rollout

This implementation round ships the full menu, state, persistence, and compositing renderer — but `COSMETIC_DEFS` starts with **all three slots empty** (`[]`). Every tab will show only the "None" tile until art is added. This is an acceptable, intentionally minimal state — no "coming soon" placeholder tiles or empty-state messaging needed (YAGNI; the tab + "None" tile alone communicates the category exists).

As part of this round, the current `hatSprites`/`hatEnabled` loading and drawing code (`index.html:575-637`, `1066`, `1081-1085`) is removed and replaced by the new `COSMETIC_DEFS`-driven loader/compositor described above. The existing baked `png/hats/Purple Wizard Hat/*.png` frames are not loaded by the new system (they're the wrong format — baked, not overlay) and are left on disk unused until redone.

Follow-up work, tracked separately and not part of this round:

- Redo the Purple Wizard Hat frames as transparent hat-only overlays and add its entry to `COSMETIC_DEFS.hat`.
- Produce sunglasses and clothes art/entries.

## Testing / verification

No test framework exists in this repo (per `CLAUDE.md`); verification is manual in-browser:

- Open the idle screen, confirm the CUSTOMIZE button appears and opens the menu.
- Confirm all three tabs render with only a "None" tile each (pre-art state).
- Confirm `KeyH` still toggles the hat slot for debugging once a hat entry exists.
- Once real items are added: confirm tile selection updates the preview instantly, persists across a page reload, and reflects on the live game canvas both on the idle screen and during a run.
