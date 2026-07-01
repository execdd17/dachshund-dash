# Wearable Items: Anchor-Based Rendering Design

## Context

The cosmetics menu (`docs/superpowers/specs/2026-07-01-cosmetics-menu-design.md`) shipped the UI, state, and persistence for hat/sunglasses/clothes slots, but `COSMETIC_DEFS` was left empty on purpose — populating it required deciding how item art actually gets positioned on the dog across its 13 animation poses (3 run frames, 3 jump frames, 3 slide/pancake frames, 3 doublejump/flip frames, 3-frame bite sheet; idle/dead reuse run frame 0).

The previous spec assumed each item would ship as its own full 13-frame transparent overlay set (mirroring the old baked Purple Wizard Hat frames, but hat-only). In practice this makes every new item 13x the art effort. This spec supersedes that rendering-architecture decision for head-slot items (`hat`, `sunglasses`) with a single-image-per-item + shared anchor-table approach, and scopes this round to shipping exactly two real items: a hat and sunglasses.

## Goals

- Add a real hat item and a real sunglasses item, equippable independently or together (and with either/both off), matching the already-built menu/state infrastructure.
- Make adding the *next* head-slot item (another hat, another pair of glasses) cost one image file, not thirteen.
- Preserve existing behavior: giant-mode scaling, boss/chase scaling, and the menu preview must all continue to work without special-casing cosmetics.

## Non-goals

- `clothes` slot stays empty this round. Clothing needs a body/torso anchor, which deforms more across poses (running gait, pancake slide) than a head does — different-enough problem to defer.
- No combinatorial baked art (unchanged from the prior spec).
- No new menu UI/interaction changes — `COSMETIC_SLOTS`, tabs, grid, and persistence are reused as-is, aside from the draw-order fix below.

## Rendering architecture

Each head-slot item is **one isolated, transparent-background image** (not a per-frame set). A shared `HEAD_ANCHORS` table records where the dog's head is — position and rotation angle, in the same local coordinate space as the base 512×1024 sprite frames — for every pose. Per-slot offsets (`SLOT_ANCHOR_OFFSET`) nudge the shared head position to where a hat sits (above the crown) versus where sunglasses sit (over the eyes).

Rendering an equipped item becomes: look up `HEAD_ANCHORS[anim][frameIdx]`, apply the slot's offset, then `ctx.translate`/`ctx.rotate`/`drawImage` the item's single image at that transform, inside the same `ctx.save()/restore()` used to draw the base dog frame. Because this reuses the exact `ctx` and transform stack already in effect (including any active `ctx.scale` from giant mode or boss scaling), no cosmetic-specific scale handling is needed.

Draw order (back to front): base dog → clothes → hat → sunglasses. This corrects `COSMETIC_DRAW_ORDER`, which currently draws hat last (on top of sunglasses); the desired stacking is sunglasses on top so they stay visible over a hat brim that might otherwise overlap the eye area.

## Data model

```js
// Shared across all head-slot items. Calibrated once, in-browser, against the
// real game rendering (not static PNGs), since it must match live gameplay scale/positioning.
const HEAD_ANCHORS = {
  run:        [{x, y, angle}, {x, y, angle}, {x, y, angle}],
  jump:       [{x, y, angle}, {x, y, angle}, {x, y, angle}],
  doublejump: [{x, y, angle}, {x, y, angle}], // index 2 reuses jump[2], matching
                                                // getDogSpriteAnim's existing frame-2 sharing
  slide:      [{x, y, angle}, {x, y, angle}, {x, y, angle}],
  bite:       [{x, y, angle}, {x, y, angle}, {x, y, angle}],
  // idle and dead reuse run[0] (mirrors dogSprites.idle / dogSprites.dead today)
};

// Per-slot fine-tune relative to the shared head anchor.
const SLOT_ANCHOR_OFFSET = {
  hat:        { dx: 0, dy: -34, angleOffset: 0, scale: 1.0 },
  sunglasses: { dx: 0, dy: -6,  angleOffset: 0, scale: 0.8 },
};
```

`COSMETIC_DEFS` entries drop the `dir` (folder-of-frames) shape from the prior spec in favor of a single `image` path; `thumbnail` is dropped as a separate field since the isolated item image doubles as its own menu icon:

```js
const COSMETIC_DEFS = {
  hat:        [{ id: 'wizard',  name: 'Wizard Hat', image: 'png/hats/wizard.png' }],
  sunglasses: [{ id: 'aviator', name: 'Aviators',   image: 'png/sunglasses/aviator.png' }],
  clothes:    [],
};
```

Sprite loading (`loadDogSprites()`'s cosmetic-loading block) simplifies from loading a 13-image animation set per item to loading one `Image` per item, cached as `cosmeticImageById[slot][itemId]`.

## Rendering integration

`drawDachshundSprite()` currently has two overlay loops: one in the bite-sheet branch, one in the normal per-frame branch. Both change from "fetch this item's matching-frame overlay image" to "fetch the single item image, compute its transform from `HEAD_ANCHORS[anim][frameIdx]` + `SLOT_ANCHOR_OFFSET[slot]`, draw it." `renderCosmeticsPreview()` (the menu's static preview canvas) uses the same lookup at the idle pose (`HEAD_ANCHORS.run[0]`).

## Assets

- **Hat**: reuse `png/hats/Purple Wizard Hat/pixel-art-purple-hat-free-png.png` as-is — it's already an isolated transparent cutout (verified: 350×350, alpha channel present, content bbox `(43,92)-(301,285)`). No new art. `hat_rotated.png` is not needed since rotation is now handled by `HEAD_ANCHORS[...].angle`, not a pre-rotated source image.
- **Sunglasses**: no existing asset. Generate a small transparent pixel-art PNG via a one-off Python/Pillow script — aviator-style, black frame, dark lenses, small bridge — matching the hat's flat pixel-art outline weight, saved to `png/sunglasses/aviator.png`.

## Calibration

`HEAD_ANCHORS` is seeded with initial estimates, then refined live: launch the game (`/run` skill), cycle through idle, run, jump, doublejump, slide, bite, and a giant-mode run, and adjust each pose's `x`/`y`/`angle` (and the two `SLOT_ANCHOR_OFFSET` entries) until the hat and sunglasses track the head correctly in every pose at both normal and giant scale.

## Testing / verification

No test framework exists in this repo; verification is manual in-browser, per `CLAUDE.md`:

- Menu: HAT and SUNGLASSES tabs each show a real item tile plus "None"; CLOTHES still shows only "None".
- Equip hat alone, sunglasses alone, both together, and neither — confirm all four combinations render correctly in the live game canvas and the menu preview, and persist across a page reload.
- Cycle every pose (idle, run, jump, doublejump, slide, bite via giant-mode chomp) with both items equipped — confirm no drift, flicker, or misalignment.
- Trigger giant mode with both items equipped — confirm items scale with the dog (no stretching, no fixed-size artifacts).
- Trigger a boss/chase sequence with items equipped — confirm the existing boss-scale `ctx.scale` wrapping still composites correctly.
