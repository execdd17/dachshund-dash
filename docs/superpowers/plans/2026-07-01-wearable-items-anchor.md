# Wearable Items (Anchor-Based Rendering) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a real, equippable hat and sunglasses item using a single-image-per-item + shared head-anchor rendering model, replacing the currently-empty `COSMETIC_DEFS` and the per-item 13-frame overlay architecture it was originally wired for.

**Architecture:** Each head-slot item becomes one isolated transparent PNG. A shared `HEAD_ANCHORS` table records the dog's head position/rotation for every animation pose (in the same local 512×1024 coordinate space as the base sprite frames); a per-slot `SLOT_ANCHOR_OFFSET` nudges that shared point to where a hat vs. sunglasses actually sits. Rendering an item is one `translate`/`rotate`/`drawImage` call driven by those two lookups, reusing whatever `ctx` transform (giant mode, boss scale) is already active.

**Tech Stack:** Vanilla JS + `<canvas>` (index.html), Python 3 + Pillow (one-off asset generation only, not part of the shipped app).

## Global Constraints

- No build step, bundler, or test framework exists in this repo — all verification is manual, in-browser (per `CLAUDE.md`).
- Everything lives in `index.html`; there are no other JS/CSS files to split into.
- Timezone/date conventions, secrets handling, etc. from the top-level `CLAUDE.md` don't apply to this static-site subproject.
- Full design reference: `docs/superpowers/specs/2026-07-01-wearable-items-anchor-design.md`.

---

### Task 1: Generate the sunglasses asset

**Files:**
- Create: `png/sunglasses/aviator.png`
- Create (scratch, not committed): `/tmp/claude-1000/-home-execdd17-markii-dachshund-dash/2a1a6369-5a9b-4145-8163-e5ea8434c3a8/scratchpad/make_sunglasses.py`

**Interfaces:**
- Consumes: nothing (standalone asset generation).
- Produces: `png/sunglasses/aviator.png` — an isolated, transparent-background PNG, consumed by Task 2's `COSMETIC_DEFS.sunglasses` entry.

- [ ] **Step 1: Write the generator script**

Write to `/tmp/claude-1000/-home-execdd17-markii-dachshund-dash/2a1a6369-5a9b-4145-8163-e5ea8434c3a8/scratchpad/make_sunglasses.py`:

```python
from PIL import Image, ImageDraw

SMALL_W, SMALL_H = 44, 26
SCALE = 10

img = Image.new('RGBA', (SMALL_W, SMALL_H), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

FRAME = (20, 20, 20, 255)
LENS = (35, 40, 60, 255)
HIGHLIGHT = (90, 100, 130, 200)

# Left lens
draw.rounded_rectangle([2, 4, 18, 20], radius=4, fill=LENS, outline=FRAME, width=2)
# Right lens
draw.rounded_rectangle([26, 4, 42, 20], radius=4, fill=LENS, outline=FRAME, width=2)
# Bridge
draw.rectangle([18, 9, 26, 12], fill=FRAME)
# Temple stubs toward the edges
draw.rectangle([0, 8, 2, 11], fill=FRAME)
draw.rectangle([42, 8, 44, 11], fill=FRAME)
# Lens highlights
draw.rectangle([4, 6, 8, 9], fill=HIGHLIGHT)
draw.rectangle([28, 6, 32, 9], fill=HIGHLIGHT)

img = img.resize((SMALL_W * SCALE, SMALL_H * SCALE), Image.NEAREST)
img.save('png/sunglasses/aviator.png')
print('saved', img.size)
```

- [ ] **Step 2: Run it**

Run (from the repo root, `/home/execdd17/markii/dachshund-dash`):

```bash
mkdir -p png/sunglasses
python3 /tmp/claude-1000/-home-execdd17-markii-dachshund-dash/2a1a6369-5a9b-4145-8163-e5ea8434c3a8/scratchpad/make_sunglasses.py
```

Expected output: `saved (440, 260)` and a new file at `png/sunglasses/aviator.png`.

- [ ] **Step 3: Verify transparency and appearance**

Run:

```bash
python3 -c "
from PIL import Image
im = Image.open('png/sunglasses/aviator.png').convert('RGBA')
a = im.getchannel('A')
hist = a.histogram()
print('size', im.size, 'transparent(a=0):', hist[0], 'opaque(a=255):', hist[255])
print('bbox', im.getbbox())
"
```

Expected: `transparent(a=0)` is a large majority of the pixel count, and `bbox` is well inside the canvas (not touching all four edges) — confirming an isolated cutout, not a filled rectangle. Then view the file directly (e.g. with the Read tool) to confirm it visually reads as sunglasses (two dark lenses, black frame, small bridge) and not a garbled shape. If it looks wrong, adjust the coordinates in the script and re-run Steps 2–3.

- [ ] **Step 4: Commit**

```bash
git add png/sunglasses/aviator.png
git commit -m "$(cat <<'EOF'
Add generated sunglasses cutout asset

Simple pixel-art aviator shape, isolated on a transparent background,
for the sunglasses cosmetic slot.
EOF
)"
```

---

### Task 2: Rewire cosmetics data model and rendering to the anchor system

**Files:**
- Modify: `index.html:746-755` (cosmetics consts)
- Modify: `index.html:796-823` (loadDogSprites cosmetic-loading block)
- Modify: `index.html:1254` area (add `drawCosmeticOverlay` helper after `drawSpriteSheetLayer`)
- Modify: `index.html:1275-1280` (bite-branch overlay loop in `drawDachshundSprite`)
- Modify: `index.html:1290-1301` (normal-branch overlay loop in `drawDachshundSprite`)
- Modify: `index.html:1342-1357` (`renderCosmeticsPreview`)

**Interfaces:**
- Consumes: `png/hats/Purple Wizard Hat/pixel-art-purple-hat-free-png.png` (existing asset), `png/sunglasses/aviator.png` (from Task 1).
- Produces: `getHeadAnchor(anim, frameIdx) -> {x, y, angle}`, `drawCosmeticOverlay(targetCtx, img, anchor, offset, anchorX, groundY, scale, groundOffset)`, `cosmeticImageById[slot][itemId] -> HTMLImageElement`, updated `COSMETIC_DEFS` (real `hat`/`sunglasses` entries), `HEAD_ANCHORS`, `SLOT_ANCHOR_OFFSET`. These are consumed by Task 3 (calibration only tunes the data, not the functions).

- [ ] **Step 1: Replace the cosmetics consts block**

In `index.html`, replace (starting at line 746):

```js
// --- Cosmetics (extensible: hat / sunglasses / clothes slots, stack together) ---
const COSMETIC_SLOTS = ['hat', 'sunglasses', 'clothes']; // canonical slot list + menu tab order
const COSMETIC_DRAW_ORDER = ['clothes', 'sunglasses', 'hat']; // back-to-front compositing order
const COSMETIC_DEFS = {
  hat: [],
  sunglasses: [],
  clothes: [],
};
const cosmeticSpritesById = { hat: {}, sunglasses: {}, clothes: {} };
let equipped = { hat: null, sunglasses: null, clothes: null };
```

with:

```js
// --- Cosmetics (extensible: hat / sunglasses / clothes slots, stack together) ---
const COSMETIC_SLOTS = ['hat', 'sunglasses', 'clothes']; // canonical slot list + menu tab order
const COSMETIC_DRAW_ORDER = ['clothes', 'hat', 'sunglasses']; // back-to-front compositing order
const COSMETIC_DEFS = {
  hat: [
    { id: 'wizard', name: 'Wizard Hat', image: 'png/hats/Purple Wizard Hat/pixel-art-purple-hat-free-png.png' },
  ],
  sunglasses: [
    { id: 'aviator', name: 'Aviators', image: 'png/sunglasses/aviator.png' },
  ],
  clothes: [],
};
const cosmeticImageById = { hat: {}, sunglasses: {}, clothes: {} };
let equipped = { hat: null, sunglasses: null, clothes: null };

// Where the dog's head is in each pose, in the same local 512x1024 sprite-pixel
// space as the base dachshund frames. Seed values only -- Task 3 tunes every
// number here live against the actual game rendering, so treat these as rough
// starting points, not final positions.
const HEAD_ANCHORS = {
  run:        [{ x: 340, y: 400, angle: -6 },  { x: 345, y: 390, angle: -3 },  { x: 335, y: 405, angle: -8 }],
  jump:       [{ x: 330, y: 380, angle: -10 }, { x: 340, y: 400, angle: -5 },  { x: 345, y: 420, angle: 0 }],
  doublejump: [{ x: 300, y: 380, angle: -30 }, { x: 300, y: 420, angle: -150 }], // index 2 reuses jump[2], see getHeadAnchor
  slide:      [{ x: 380, y: 440, angle: -4 },  { x: 385, y: 445, angle: -2 },  { x: 380, y: 440, angle: -4 }],
  bite:       [{ x: 340, y: 400, angle: -6 },  { x: 345, y: 390, angle: -3 },  { x: 335, y: 405, angle: -8 }],
};

// Per-slot fine-tune relative to the shared head anchor above (hat sits above
// the crown, sunglasses sit at eye level).
const SLOT_ANCHOR_OFFSET = {
  hat:        { dx: 0, dy: -34, angleOffset: 0, scale: 1.0 },
  sunglasses: { dx: 0, dy: -6,  angleOffset: 0, scale: 0.8 },
};

// anim/frameIdx here use the exact same values as getDogSpriteAnim()/dogSpriteFrame
// (or getDogJumpFrameIndex() for jump/doublejump) that drawDachshundSprite already computes.
function getHeadAnchor(anim, frameIdx) {
  if (anim === 'idle' || anim === 'dead') return HEAD_ANCHORS.run[0];
  if (anim === 'doublejump' && frameIdx === 2) return HEAD_ANCHORS.jump[2];
  const frames = HEAD_ANCHORS[anim];
  return frames[frameIdx % frames.length];
}
```

- [ ] **Step 2: Simplify the cosmetic image loading in `loadDogSprites()`**

Replace (the block starting `// Cosmetic overlay sprites: ...` at line 796):

```js
  // Cosmetic overlay sprites: same animation set/filenames as the base dog,
  // loaded per item. COSMETIC_DEFS starts empty per slot, so this is a no-op
  // until real items are added.
  const cosmeticAnimKeys = ['run', 'slide', 'jump', 'doublejump'];
  COSMETIC_SLOTS.forEach(slot => {
    COSMETIC_DEFS[slot].forEach(item => {
      const sprites = { idle: [], run: [], jump: [], slide: [], fall: [], dead: [], doublejump: [], bite: [] };
      const animPaths = {
        run: [`${item.dir}/dachshund_run_00.png`, `${item.dir}/dachshund_run_01.png`, `${item.dir}/dachshund_run_02.png`],
        slide: [`${item.dir}/dachshund_pancake_00.png`, `${item.dir}/dachshund_pancake_01.png`, `${item.dir}/dachshund_pancake_02.png`],
        jump: [`${item.dir}/dachshund_jump_00.png`, `${item.dir}/dachshund_jump_01.png`, `${item.dir}/dachshund_jump_02.png`],
        doublejump: [`${item.dir}/dachshund_flip_00.png`, `${item.dir}/dachshund_flip_01.png`, `${item.dir}/dachshund_flip_02.png`],
      };
      cosmeticAnimKeys.forEach(key => {
        animPaths[key].forEach((path, i) => {
          const img = new Image();
          img.src = path;
          sprites[key][i] = img;
        });
      });
      sprites.idle = sprites.run.slice(0, 1);
      sprites.dead = sprites.run.slice(0, 1);
      const biteSheet = new Image();
      biteSheet.src = `${item.dir}/bite_3_image_sequence.png`;
      sprites.bite = [biteSheet];
      cosmeticSpritesById[slot][item.id] = sprites;
    });
  });
}
```

with:

```js
  // Cosmetic overlay images: one isolated image per item, positioned at render
  // time via HEAD_ANCHORS + SLOT_ANCHOR_OFFSET (see getHeadAnchor / drawCosmeticOverlay).
  COSMETIC_SLOTS.forEach(slot => {
    COSMETIC_DEFS[slot].forEach(item => {
      const img = new Image();
      img.src = item.image;
      cosmeticImageById[slot][item.id] = img;
    });
  });
}
```

- [ ] **Step 3: Add the `drawCosmeticOverlay` helper**

Directly after `drawSpriteSheetLayer`'s closing brace (the function ending at line 1264, just before `function drawDachshundSprite(x, y) {`), insert:

```js
function drawCosmeticOverlay(targetCtx, img, anchor, offset, anchorX, groundY, scale, groundOffset) {
  if (!img || !img.complete || !img.naturalWidth) return;
  const dw = 512 * scale, dh = 1024 * scale;
  const dx = anchorX - dw / 2;
  const dy = groundY - dh + groundOffset;
  const px = dx + (anchor.x + offset.dx) * scale;
  const py = dy + (anchor.y + offset.dy) * scale;
  const angleRad = (anchor.angle + offset.angleOffset) * Math.PI / 180;
  const iw = img.naturalWidth * scale * offset.scale;
  const ih = img.naturalHeight * scale * offset.scale;
  targetCtx.save();
  targetCtx.translate(px, py);
  targetCtx.rotate(angleRad);
  targetCtx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  targetCtx.restore();
}
```

- [ ] **Step 4: Rewire the bite-branch overlay loop in `drawDachshundSprite`**

Replace:

```js
    COSMETIC_DRAW_ORDER.forEach(slot => {
      const itemId = equipped[slot];
      const itemSprites = itemId && cosmeticSpritesById[slot][itemId];
      const overlaySheet = itemSprites && itemSprites.bite && itemSprites.bite[0];
      if (overlaySheet) drawSpriteSheetLayer(ctx, overlaySheet, dogSpriteFrame, anchorX, y, DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET);
    });
```

with:

```js
    COSMETIC_DRAW_ORDER.forEach(slot => {
      const itemId = equipped[slot];
      if (!itemId) return;
      const img = cosmeticImageById[slot][itemId];
      const anchor = getHeadAnchor('bite', dogSpriteFrame);
      drawCosmeticOverlay(ctx, img, anchor, SLOT_ANCHOR_OFFSET[slot], anchorX, y, DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET);
    });
```

- [ ] **Step 5: Rewire the normal-branch overlay loop in `drawDachshundSprite`**

Replace:

```js
  COSMETIC_DRAW_ORDER.forEach(slot => {
    const itemId = equipped[slot];
    if (!itemId) return;
    const itemSprites = cosmeticSpritesById[slot][itemId];
    if (!itemSprites) return;
    const overlayFrames = itemSprites[anim];
    if (!overlayFrames || overlayFrames.length === 0) return;
    const overlayImg = (anim === 'doublejump' && frameIdx === 2)
      ? (itemSprites.jump[2] || null)
      : overlayFrames[frameIdx % overlayFrames.length];
    drawSpriteFrameLayer(ctx, overlayImg, anchorX, y, DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET);
  });
```

with:

```js
  COSMETIC_DRAW_ORDER.forEach(slot => {
    const itemId = equipped[slot];
    if (!itemId) return;
    const img = cosmeticImageById[slot][itemId];
    const anchor = getHeadAnchor(anim, frameIdx);
    drawCosmeticOverlay(ctx, img, anchor, SLOT_ANCHOR_OFFSET[slot], anchorX, y, DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET);
  });
```

- [ ] **Step 6: Rewire `renderCosmeticsPreview`**

Replace:

```js
function renderCosmeticsPreview() {
  const canvas = document.getElementById('cosmeticsPreviewCanvas');
  const pctx = canvas.getContext('2d');
  pctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!dogSpritesReady) return;
  const anchorX = canvas.width / 2;
  const groundY = canvas.height - 40;
  drawSpriteFrameLayer(pctx, dogSprites.idle[0], anchorX, groundY, DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET);
  COSMETIC_DRAW_ORDER.forEach(slot => {
    const itemId = equipped[slot];
    if (!itemId) return;
    const itemSprites = cosmeticSpritesById[slot][itemId];
    const overlayImg = itemSprites && itemSprites.idle && itemSprites.idle[0];
    if (overlayImg) drawSpriteFrameLayer(pctx, overlayImg, anchorX, groundY, DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET);
  });
}
```

with:

```js
function renderCosmeticsPreview() {
  const canvas = document.getElementById('cosmeticsPreviewCanvas');
  const pctx = canvas.getContext('2d');
  pctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!dogSpritesReady) return;
  const anchorX = canvas.width / 2;
  const groundY = canvas.height - 40;
  drawSpriteFrameLayer(pctx, dogSprites.idle[0], anchorX, groundY, DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET);
  const anchor = getHeadAnchor('idle', 0);
  COSMETIC_DRAW_ORDER.forEach(slot => {
    const itemId = equipped[slot];
    if (!itemId) return;
    const img = cosmeticImageById[slot][itemId];
    drawCosmeticOverlay(pctx, img, anchor, SLOT_ANCHOR_OFFSET[slot], anchorX, groundY, DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET);
  });
}
```

- [ ] **Step 7: Verify no leftover references to the old structure**

Run:

```bash
grep -n "cosmeticSpritesById\|item.dir\|\.dir}" index.html
```

Expected: no output (every reference was replaced in Steps 1-6).

- [ ] **Step 8: Manual smoke test in-browser**

Run:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in a browser, open DevTools console, and confirm:
- No console errors on load.
- On the idle screen, clicking "CUSTOMIZE" opens the menu; the HAT tab shows "None" and "Wizard Hat" tiles; the SUNGLASSES tab shows "None" and "Aviators" tiles.
- Clicking "Wizard Hat" then "Aviators" shows both overlaid on the preview canvas dog — roughly on the head (exact alignment is Task 3's job, not this one's).
- Closing the menu and starting a run shows both items still overlaid on the live game-canvas dog.

Stop the server (Ctrl+C) once confirmed.

- [ ] **Step 9: Commit**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Rewire cosmetics rendering to single-image + head-anchor model

Replaces the per-item 13-frame overlay architecture (which required
13 hand-made transparent images per item) with one isolated image per
item plus a shared HEAD_ANCHORS table describing where the dog's head
is in each pose. Wires up real Wizard Hat and Aviators entries.
Corrects cosmetic draw order to clothes -> hat -> sunglasses.

Anchor coordinates are rough seed values; see follow-up commit for the
live-calibrated final numbers.
EOF
)"
```

---

### Task 3: Live-calibrate anchors and verify full behavior

**Files:**
- Modify: `index.html` (only the numeric values inside `HEAD_ANCHORS` and `SLOT_ANCHOR_OFFSET` from Task 2, no structural changes)

**Interfaces:**
- Consumes: `getHeadAnchor`, `drawCosmeticOverlay`, `HEAD_ANCHORS`, `SLOT_ANCHOR_OFFSET` (all from Task 2) — this task only edits the data values, not the functions.
- Produces: final tuned `HEAD_ANCHORS`/`SLOT_ANCHOR_OFFSET` values that later work (if any) can read as ground truth for where the head sits in each pose.

This task is inherently iterative and visual — there's no fixed expected diff to write in advance. Work through it as a loop:

- [ ] **Step 1: Launch the game**

Use the `/run` skill (or `python3 -m http.server 8000` + open `http://localhost:8000`) to get the game running in a real browser.

- [ ] **Step 2: Equip both items**

Open CUSTOMIZE, equip "Wizard Hat" and "Aviators" together, close the menu.

- [ ] **Step 3: Check every pose, one at a time**

For each of the following, trigger the pose, take a screenshot, and compare hat/sunglasses position against the dog's actual head:

- Idle (just loaded, before pressing Space)
- Run (press Space to start, let it run normally)
- Jump (press Space/Up mid-run) — check all three sub-frames if possible (rising/peak/landing) by timing screenshots
- Double-jump (jump again while airborne)
- Slide/duck (press Down or S while running)
- Bite (trigger giant mode via the `KeyG` debug hotkey documented at `index.html:3533-3542`, eat a hot dog, screenshot during the chomp effect)
- Giant mode scale (confirm both items scale up 2x along with the dog, per `GIANT_SCALE` at `index.html:467`, with no stretching or fixed-size artifacts)

For any pose where the item looks offset, rotated wrong, or floats away from the head: adjust the corresponding `HEAD_ANCHORS[anim][frameIdx]` `x`/`y`/`angle` (shared by both items) or, if only one item looks wrong relative to the other, adjust that item's `SLOT_ANCHOR_OFFSET[slot]` instead. Save, reload, re-screenshot. Repeat until every pose looks right for both items simultaneously.

- [ ] **Step 4: Verify equip combinations and persistence**

In the CUSTOMIZE menu, confirm all four combinations render correctly and update the preview immediately: hat only, sunglasses only, both, neither. Reload the page after setting a combination and confirm it persists (reads back from `localStorage` via `loadEquippedCosmetics()`).

- [ ] **Step 5: Verify boss/chase scaling**

Trigger a boss chase via the `KeyB` debug hotkey (`index.html:3528-3532`) with both items equipped; confirm they still track the head correctly under the boss's `ctx.scale` wrapping (around `index.html:3286-3288`).

- [ ] **Step 6: Commit the tuned constants**

```bash
git add index.html
git commit -m "$(cat <<'EOF'
Calibrate head anchor positions against live gameplay

Tunes HEAD_ANCHORS/SLOT_ANCHOR_OFFSET values from Task 2's rough seed
estimates to match the dog's actual head position in every animation
pose, verified in-browser across normal, giant, and boss-scaled play.
EOF
)"
```

---

## Self-Review Notes

- **Spec coverage:** Data model (HEAD_ANCHORS/SLOT_ANCHOR_OFFSET/COSMETIC_DEFS) → Task 2 Step 1. Rendering integration (loadDogSprites, drawDachshundSprite x2, renderCosmeticsPreview) → Task 2 Steps 2-6. Draw-order fix → Task 2 Step 1. Assets (hat reuse, sunglasses generation) → Task 1 + Task 2 Step 1. Calibration → Task 3. Testing/verification section of the spec → Task 2 Step 8 (smoke test) + Task 3 Steps 3-5 (full pose/combo/scaling checks). `clothes` deferred → untouched (`COSMETIC_DEFS.clothes: []` unchanged).
- **Type consistency:** `cosmeticImageById[slot][itemId]` is an `HTMLImageElement` everywhere it's used (Task 2 Steps 2, 4, 5, 6). `getHeadAnchor(anim, frameIdx)` signature matches all three call sites (bite branch passes `'bite'`/`dogSpriteFrame`; normal branch passes `anim`/`frameIdx`; preview passes `'idle'`/`0`). `SLOT_ANCHOR_OFFSET[slot]` is only ever read after an `if (!itemId) return` guard, so the missing `clothes` entry in that object is never dereferenced.
- **No placeholders:** Task 3's exact numeric outcomes aren't pre-specified because they're the product of live visual tuning against a running game — this is the task's actual deliverable, not a skipped design decision. Every other step has concrete code, commands, or expected output.
