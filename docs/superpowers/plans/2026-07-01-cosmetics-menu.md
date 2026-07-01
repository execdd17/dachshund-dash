# Cosmetics Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the secret `KeyH` hat-toggle hotkey with a discoverable, tabbed cosmetics menu (Hat / Sunglasses / Clothes) that supports stacking independent cosmetic slots, backed by a reusable compositing renderer — shipped with all item lists empty (infrastructure only; no real cosmetic art in this round).

**Architecture:** A generic `COSMETIC_SLOTS`/`COSMETIC_DEFS` data model replaces the current single hardcoded hat. Rendering becomes layered compositing: draw the base dog frame, then draw each equipped slot's same-position overlay frame on top, via two small shared helper functions reused by both the main game canvas and a static-pose preview canvas inside the menu. The menu itself is a DOM overlay (mirroring the existing `#nameEntryOverlay` pattern), opened from a new "CUSTOMIZE" button shown only on the idle screen.

**Tech Stack:** Vanilla JS, HTML, CSS, all inline in `index.html`. No build step, no bundler, no test framework — per `CLAUDE.md`, verification is manual: serve with `python3 -m http.server 8000` and check behavior in a browser plus the DevTools console.

## Global Constraints

- Single-file implementation: all changes go in `index.html`. No new files, no build step.
- No test framework exists in this repo — every task's verification is a manual browser check, not an automated test run.
- Visual style must match existing conventions: `Courier New` monospace font, `#4a8f3f` green accent (borders/buttons), `#535353` body text gray, `rgba(0,0,0,0.5–0.55)` dark modal backdrops, `border-radius: 4–8px`.
- `localStorage` keys follow the existing `dachshundDash*` naming convention (see `HIGH_SCORES_KEY = 'dachshundDashHighScores'`).
- Sprite math (`DOG_SPRITE_SCALE`, `DOG_SPRITE_ANCHOR`, `DOG_SPRITE_GROUND_OFFSET`) must stay exactly as-is for the main game canvas — this plan reuses those constants for the new compositing helpers rather than replacing them, so existing visuals do not change.
- Per the approved spec (`docs/superpowers/specs/2026-07-01-cosmetics-menu-design.md`), `COSMETIC_DEFS` ships with all three slots as empty arrays (`[]`). Do not add real hat/sunglasses/clothes entries as part of this plan — that's explicitly follow-up work once art exists.

---

### Task 1: Cosmetics data model, sprite loading, and persistence

**Files:**
- Modify: `index.html:574-577` (sprite state declarations)
- Modify: `index.html:618-637` (hat-specific sprite loading, inside `loadDogSprites()`)
- Modify: `index.html:391-424` (add persistence functions near the existing high-scores persistence block)
- Modify: `index.html:3320` (startup sequence — load equipped cosmetics)

**Interfaces:**
- Produces: `COSMETIC_SLOTS` (array of slot id strings in menu-tab order, `['hat', 'sunglasses', 'clothes']`), `COSMETIC_DRAW_ORDER` (array of the same slot ids in back-to-front render order, `['clothes', 'sunglasses', 'hat']`), `COSMETIC_DEFS` (object keyed by slot → array of `{ id, name, dir, thumbnail }`), `cosmeticSpritesById` (object keyed by slot → itemId → `{ idle, run, jump, slide, fall, dead, doublejump, bite }` frame arrays, same shape as `dogSprites`), `equipped` (mutable object `{ hat, sunglasses, clothes }`, each `string | null`), `loadEquippedCosmetics()` (returns `equipped`-shaped object), `saveEquippedCosmetics(state)` (persists it).
- Consumes: nothing new from other tasks (this is the foundation task).

- [ ] **Step 1: Add the cosmetics data model alongside the existing hat state**

`hatSprites`/`hatEnabled` are still read by `drawDachshundSprite()` and the `KeyH` handler until Task 2 rewrites them — do not delete the declarations yet, or the game will crash on the next frame with `ReferenceError: hatEnabled is not defined`. This step only adds the new model alongside the old one; Task 2 removes the old declarations once their last consumers are migrated.

In `index.html`, immediately after line 577 (`let hatEnabled = false;`), insert:

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

Leave the pre-existing lines 574-577 (`dogSprites`, `hatSprites`, `dogSpritesReady`, `hatEnabled`) untouched.

- [ ] **Step 2: Replace the hardcoded hat-loading block with a generic loader**

In `index.html`, replace lines 618-637 (the `// Hat variant sprites` block, from `const hatDir = ...` through `hatSprites.bite = [hatBiteSheet];`) with:

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
```

- [ ] **Step 3: Add equipped-cosmetics persistence functions**

In `index.html`, immediately after `saveHighScores()` (after line 424, before `function addToHighScores`), add:

```js
// --- Equipped cosmetics (localStorage) ---
const EQUIPPED_COSMETICS_KEY = 'dachshundDashEquippedCosmetics';

function loadEquippedCosmetics() {
  const fallback = { hat: null, sunglasses: null, clothes: null };
  try {
    const raw = localStorage.getItem(EQUIPPED_COSMETICS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    const result = { ...fallback };
    COSMETIC_SLOTS.forEach(slot => {
      if (typeof parsed[slot] === 'string') result[slot] = parsed[slot];
    });
    return result;
  } catch {
    return fallback;
  }
}

function saveEquippedCosmetics(state) {
  try {
    localStorage.setItem(EQUIPPED_COSMETICS_KEY, JSON.stringify(state));
  } catch (_) {}
}
```

- [ ] **Step 4: Load equipped cosmetics at startup**

In `index.html`, in the `// --- Start ---` block (around line 3320), change:

```js
highScores = loadHighScores();
```

to:

```js
highScores = loadHighScores();
equipped = loadEquippedCosmetics();
```

(leave the rest of the startup block — `highScore = ...`, `renderHtmlLeaderboard()`, etc. — unchanged)

- [ ] **Step 5: Verify no regressions**

Run: `python3 -m http.server 8000` from the repo root, then open `http://localhost:8000/` in a browser.

Expected: the game loads and plays exactly as before (idle screen, running, jumping, ducking, death) with no visible change and no errors in the DevTools console. In the console, run `equipped` and confirm it prints `{hat: null, sunglasses: null, clothes: null}`.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Add extensible cosmetics data model and persistence"
```

---

### Task 2: Layered compositing renderer and debug hotkey update

**Files:**
- Modify: `index.html:1061-1097` (`drawDachshundSprite`, plus two new helper functions immediately before it)
- Modify: `index.html:3229-3232` (`KeyH` debug hotkey handler)
- Modify: `index.html` (delete the now-dead `hatSprites`/`hatEnabled` declarations that Task 1 deliberately left in place — see Step 4)

**Interfaces:**
- Consumes: `COSMETIC_DRAW_ORDER`, `cosmeticSpritesById`, `equipped`, `COSMETIC_DEFS` (from Task 1); `saveEquippedCosmetics` (from Task 1).
- Produces: `drawSpriteFrameLayer(targetCtx, img, anchorX, groundY, scale, groundOffset)` and `drawSpriteSheetLayer(targetCtx, sheet, frameIdx, anchorX, groundY, scale, groundOffset)` — reused by Task 3's preview renderer.

- [ ] **Step 1: Add the shared layer-drawing helpers**

In `index.html`, immediately before `function drawDachshundSprite(x, y) {` (line 1061), add:

```js
function drawSpriteFrameLayer(targetCtx, img, anchorX, groundY, scale, groundOffset) {
  if (!img || !img.complete || !img.naturalWidth) return;
  const sw = img.naturalWidth, sh = img.naturalHeight;
  const dw = sw * scale, dh = sh * scale;
  const dx = anchorX - dw / 2;
  const dy = groundY - dh + groundOffset;
  targetCtx.drawImage(img, 0, 0, sw, sh, dx, dy, dw, dh);
}

function drawSpriteSheetLayer(targetCtx, sheet, frameIdx, anchorX, groundY, scale, groundOffset) {
  if (!sheet || !sheet.complete || !sheet.naturalWidth) return;
  const frameW = 512, frameH = 1024;
  const dw = frameW * scale, dh = frameH * scale;
  const dx = anchorX - dw / 2;
  const dy = groundY - dh + groundOffset;
  const sx = (frameIdx % 3) * frameW;
  targetCtx.drawImage(sheet, sx, 0, frameW, frameH, dx, dy, dw, dh);
}
```

- [ ] **Step 2: Rewrite `drawDachshundSprite` to composite equipped overlays**

In `index.html`, replace the full body of `drawDachshundSprite` (lines 1061-1097, from `function drawDachshundSprite(x, y) {` through its closing `}`) with:

```js
function drawDachshundSprite(x, y) {
  const anim = getDogSpriteAnim();
  const anchorX = x + dog.width * DOG_SPRITE_ANCHOR;

  // Bite animation: 3-frame horizontal sprite sheet, source-rect slicing
  if (anim === 'bite' && dogSprites.bite && dogSprites.bite[0]) {
    const sheet = dogSprites.bite[0];
    if (!sheet.complete || !sheet.naturalWidth) return false;
    drawSpriteSheetLayer(ctx, sheet, dogSpriteFrame, anchorX, y, DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET);
    COSMETIC_DRAW_ORDER.forEach(slot => {
      const itemId = equipped[slot];
      const itemSprites = itemId && cosmeticSpritesById[slot][itemId];
      const overlaySheet = itemSprites && itemSprites.bite && itemSprites.bite[0];
      if (overlaySheet) drawSpriteSheetLayer(ctx, overlaySheet, dogSpriteFrame, anchorX, y, DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET);
    });
    return true;
  }

  const baseFrames = dogSprites[anim];
  const frameIdx = (anim === 'jump' || anim === 'doublejump') ? getDogJumpFrameIndex() : (dogSpriteFrame % (baseFrames?.length || 1));
  const baseImg = (anim === 'doublejump' && frameIdx === 2) ? dogSprites.jump[2] : (baseFrames && baseFrames[frameIdx]);
  if (!baseImg || !baseImg.complete || !baseImg.naturalWidth) return false;
  drawSpriteFrameLayer(ctx, baseImg, anchorX, y, DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET);

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

  return true;
}
```

- [ ] **Step 3: Update the `KeyH` debug hotkey**

In `index.html`, replace lines 3229-3232:

```js
  if (e.code === 'KeyH') {
    e.preventDefault();
    hatEnabled = !hatEnabled;
  }
```

with:

```js
  if (e.code === 'KeyH') {
    e.preventDefault();
    const defaultHatId = COSMETIC_DEFS.hat[0]?.id ?? null;
    equipped.hat = equipped.hat ? null : defaultHatId;
    saveEquippedCosmetics(equipped);
  }
```

- [ ] **Step 4: Delete the now-dead `hatSprites`/`hatEnabled` declarations**

After Steps 2 and 3, nothing in `index.html` reads `hatSprites` or `hatEnabled` anymore (Task 1 left them declared-but-unpopulated specifically so Task 2 could retire them once their last consumers were migrated). Find and delete these two lines (they sit right after `let dogSpritesReady = false;` and immediately before the `// --- Cosmetics` comment):

```js
const hatSprites = { idle: [], run: [], jump: [], slide: [], fall: [], dead: [], doublejump: [], bite: [] };
let hatEnabled = false;
```

Confirm via `grep -n "hatSprites\|hatEnabled" index.html` that no references remain anywhere in the file.

- [ ] **Step 5: Verify rendering is unchanged and the hotkey is a harmless no-op**

Run: `python3 -m http.server 8000`, open `http://localhost:8000/`.

Expected: play through idle, running, jumping, double-jumping, ducking, giant mode (press `G` to spawn a golden hot dog, or use existing debug keys), and death — the dog's visuals are pixel-identical to before this task (no cosmetics are equipped, so no overlays draw). Press `H`: no visual change and no console errors (expected, since `COSMETIC_DEFS.hat` is still empty — `equipped.hat` toggles between `null` and `null`).

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Refactor dog rendering into layered cosmetic compositing"
```

---

### Task 3: Cosmetics menu UI — markup, styling, and interaction

**Files:**
- Modify: `index.html:217` (CSS — insert new rules before `</style>`)
- Modify: `index.html:230` (HTML — insert new markup inside `.game-wrapper`, after `#nameEntryOverlay`'s closing `</div>`)
- Modify: `index.html:2947-2948` (`draw()` — call button-visibility update)
- Modify: `index.html:3302` (JS — add new event listeners near the existing `nameSubmitBtn` listener)

**Interfaces:**
- Consumes: `COSMETIC_SLOTS`, `COSMETIC_DRAW_ORDER`, `COSMETIC_DEFS`, `cosmeticSpritesById`, `equipped`, `saveEquippedCosmetics` (Task 1); `drawSpriteFrameLayer`, `dogSprites` (Task 2); `gameState` (existing global).
- Produces: `openCosmeticsMenu()`, `closeCosmeticsMenu()`, `renderCosmeticsPreview()`, `updateCustomizeButtonVisibility()` — all self-contained, nothing later depends on them within this plan.

- [ ] **Step 1: Add CSS for the customize button and menu overlay**

In `index.html`, immediately before the closing `</style>` tag (line 217), add:

```css
  /* --- Customize button (idle screen only) --- */
  #customizeBtn {
    display: none;
    position: absolute;
    top: 100px;
    left: 50%;
    transform: translateX(-50%);
    font-family: 'Courier New', monospace;
    font-size: 12px;
    font-weight: bold;
    letter-spacing: 1px;
    padding: 6px 16px;
    background: rgba(255,255,255,0.85);
    color: #4a8f3f;
    border: 2px solid #4a8f3f;
    border-radius: 4px;
    cursor: pointer;
    z-index: 5;
  }
  #customizeBtn.visible { display: block; }
  #customizeBtn:hover { background: #fff; }

  /* --- Cosmetics menu overlay --- */
  #cosmeticsMenu {
    display: none;
    position: absolute;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.55);
    align-items: center;
    justify-content: center;
    font-family: 'Courier New', monospace;
    z-index: 10;
  }
  #cosmeticsMenu.visible { display: flex; }
  #cosmeticsMenu .cosmetics-panel {
    background: #fdfdfd;
    border: 2px solid #4a8f3f;
    border-radius: 8px;
    width: 320px;
    padding: 14px 16px;
  }
  #cosmeticsMenu h2 {
    text-align: center;
    font-size: 14px;
    letter-spacing: 2px;
    color: #535353;
    margin-bottom: 10px;
  }
  #cosmeticsMenu .cosmetics-preview {
    background: #eaf6ff;
    border: 2px solid #cde;
    border-radius: 6px;
    height: 110px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 12px;
  }
  .cosmetics-tabs {
    display: flex;
    gap: 4px;
    margin-bottom: 10px;
    justify-content: center;
  }
  .cosmetics-tab {
    font-family: 'Courier New', monospace;
    font-size: 10px;
    font-weight: bold;
    padding: 6px 12px;
    border: 2px solid #ddd;
    border-radius: 4px 4px 0 0;
    background: #f0f0f0;
    color: #999;
    cursor: pointer;
  }
  .cosmetics-tab.active {
    border-color: #4a8f3f;
    background: #fff;
    color: #4a8f3f;
  }
  .cosmetics-grid {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    justify-content: center;
    min-height: 70px;
  }
  .cosmetics-tile {
    width: 64px;
    border: 2px solid #ddd;
    border-radius: 5px;
    padding: 6px 3px 5px;
    text-align: center;
    background: #fff;
    cursor: pointer;
  }
  .cosmetics-tile.selected {
    border-color: #4a8f3f;
    background: #eef8ec;
  }
  .cosmetics-tile-icon {
    width: 36px; height: 36px;
    margin: 0 auto 3px;
    display: flex; align-items: center; justify-content: center;
  }
  .cosmetics-tile-icon img { max-width: 100%; max-height: 100%; image-rendering: pixelated; }
  .cosmetics-tile-none {
    width: 28px; height: 28px;
    border: 2px dashed #ccc;
    border-radius: 50%;
    margin: 0 auto 3px;
    display: flex; align-items: center; justify-content: center;
    color: #bbb;
    font-size: 13px;
  }
  .cosmetics-tile-label { font-size: 9px; color: #535353; }
  #cosmeticsDoneBtn {
    display: block;
    margin: 12px auto 0;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    font-weight: bold;
    padding: 6px 20px;
    background: #4a8f3f;
    color: #fff;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }
  #cosmeticsDoneBtn:hover { background: #5a9f4f; }
```

- [ ] **Step 2: Add the customize button and menu markup**

In `index.html`, inside `<div class="game-wrapper">`, immediately after the closing `</div>` of `#nameEntryOverlay` (after line 230, before the `.game-wrapper` closing `</div>` on line 231), add:

```html
  <button type="button" id="customizeBtn">CUSTOMIZE</button>
  <div id="cosmeticsMenu">
    <div class="cosmetics-panel">
      <h2>CUSTOMIZE YOUR DOG</h2>
      <div class="cosmetics-preview">
        <canvas id="cosmeticsPreviewCanvas" width="160" height="110"></canvas>
      </div>
      <div class="cosmetics-tabs" id="cosmeticsTabs"></div>
      <div class="cosmetics-grid" id="cosmeticsGrid"></div>
      <button type="button" id="cosmeticsDoneBtn">DONE</button>
    </div>
  </div>
```

`#customizeBtn`'s `top: 100px` (set in Step 1's CSS) is a starting value, positioned to sit just below the in-canvas "Press SPACE to start!" banner — since the canvas scales responsively with viewport width while this is a fixed pixel offset, confirm it looks right in Step 5 and adjust the CSS value if it overlaps the banner or drifts too far below it.

- [ ] **Step 3: Add menu state and render functions**

In `index.html`, immediately after the `drawDachshundSprite` function from Task 2 (after its closing `}`, before `function drawDachshund(x, y, legFrame) {`), add:

```js
// --- Cosmetics menu ---
let activeCosmeticTab = COSMETIC_SLOTS[0];
const COSMETIC_SLOT_LABELS = { hat: 'HAT', sunglasses: 'SUNGLASSES', clothes: 'CLOTHES' };

function renderCosmeticsTabs() {
  const tabsEl = document.getElementById('cosmeticsTabs');
  tabsEl.innerHTML = '';
  COSMETIC_SLOTS.forEach(slot => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'cosmetics-tab' + (slot === activeCosmeticTab ? ' active' : '');
    tab.textContent = COSMETIC_SLOT_LABELS[slot];
    tab.dataset.slot = slot;
    tabsEl.appendChild(tab);
  });
}

function renderCosmeticsGrid() {
  const gridEl = document.getElementById('cosmeticsGrid');
  gridEl.innerHTML = '';

  const noneTile = document.createElement('div');
  noneTile.className = 'cosmetics-tile' + (equipped[activeCosmeticTab] === null ? ' selected' : '');
  noneTile.dataset.itemId = '';
  noneTile.innerHTML = '<div class="cosmetics-tile-none">&empty;</div><div class="cosmetics-tile-label">None</div>';
  gridEl.appendChild(noneTile);

  COSMETIC_DEFS[activeCosmeticTab].forEach(item => {
    const tile = document.createElement('div');
    tile.className = 'cosmetics-tile' + (equipped[activeCosmeticTab] === item.id ? ' selected' : '');
    tile.dataset.itemId = item.id;
    tile.innerHTML = `<div class="cosmetics-tile-icon"><img src="${item.thumbnail}" alt="${item.name}"></div><div class="cosmetics-tile-label">${item.name}</div>`;
    gridEl.appendChild(tile);
  });
}

function renderCosmeticsPreview() {
  const canvas = document.getElementById('cosmeticsPreviewCanvas');
  const pctx = canvas.getContext('2d');
  pctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!dogSpritesReady) return;
  const anchorX = canvas.width / 2;
  const groundY = canvas.height - 15;
  drawSpriteFrameLayer(pctx, dogSprites.idle[0], anchorX, groundY, DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET);
  COSMETIC_DRAW_ORDER.forEach(slot => {
    const itemId = equipped[slot];
    if (!itemId) return;
    const itemSprites = cosmeticSpritesById[slot][itemId];
    const overlayImg = itemSprites && itemSprites.idle && itemSprites.idle[0];
    if (overlayImg) drawSpriteFrameLayer(pctx, overlayImg, anchorX, groundY, DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET);
  });
}

function selectCosmeticItem(slot, itemId) {
  equipped[slot] = itemId || null;
  saveEquippedCosmetics(equipped);
  renderCosmeticsGrid();
  renderCosmeticsPreview();
}

function openCosmeticsMenu() {
  activeCosmeticTab = COSMETIC_SLOTS[0];
  renderCosmeticsTabs();
  renderCosmeticsGrid();
  renderCosmeticsPreview();
  document.getElementById('cosmeticsMenu').classList.add('visible');
}

function closeCosmeticsMenu() {
  document.getElementById('cosmeticsMenu').classList.remove('visible');
}

function updateCustomizeButtonVisibility() {
  document.getElementById('customizeBtn').classList.toggle('visible', gameState === 'idle');
}
```

`renderCosmeticsPreview` starting values (`canvas` at 160×110, reusing `DOG_SPRITE_SCALE`/`DOG_SPRITE_GROUND_OFFSET` directly) are a starting point, not exact — confirm/adjust framing visually in Step 5 below. If the dog is clipped or off-center, adjust `cosmeticsPreviewCanvas`'s `width`/`height` attributes (in the Step 2 markup) and/or the `groundY` calculation here — do not change `DOG_SPRITE_SCALE`/`DOG_SPRITE_GROUND_OFFSET` themselves, since those drive the main game canvas too.

- [ ] **Step 4: Wire up event listeners and the per-frame visibility check**

In `index.html`, immediately after `document.getElementById('nameSubmitBtn').addEventListener('click', submitNameEntry);` (line 3302), add:

```js
document.getElementById('customizeBtn').addEventListener('click', openCosmeticsMenu);
document.getElementById('cosmeticsDoneBtn').addEventListener('click', closeCosmeticsMenu);
document.getElementById('cosmeticsTabs').addEventListener('click', e => {
  const tab = e.target.closest('.cosmetics-tab');
  if (!tab) return;
  activeCosmeticTab = tab.dataset.slot;
  renderCosmeticsTabs();
  renderCosmeticsGrid();
});
document.getElementById('cosmeticsGrid').addEventListener('click', e => {
  const tile = e.target.closest('.cosmetics-tile');
  if (!tile) return;
  selectCosmeticItem(activeCosmeticTab, tile.dataset.itemId);
});
```

Then, in `function draw() {` (line 2947), add a call at the very top of the function body, right after the opening brace and before `ctx.clearRect(0, 0, canvas.width, canvas.height);` (line 2948):

```js
function draw() {
  updateCustomizeButtonVisibility();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
```

- [ ] **Step 5: Verify the full menu flow manually**

Run: `python3 -m http.server 8000`, open `http://localhost:8000/`.

Expected, checking each in order:
1. On the idle screen ("Press SPACE to start!"), the "CUSTOMIZE" button is visible below the banner.
2. Click it: the menu overlay opens with three tabs (HAT / SUNGLASSES / CLOTHES), HAT active by default, a preview box showing the plain idle dog, and a grid with only a "None" tile (selected, green-highlighted).
3. The preview dog is fully visible (not clipped) and roughly centered in its box — if not, adjust per the note in Step 3.
4. Click the SUNGLASSES and CLOTHES tabs: each shows its own "None"-only grid, tab styling updates to show the active tab.
5. Click "DONE": the overlay closes, returning to the idle screen.
6. Start a run (press Space): the "CUSTOMIZE" button disappears (it's idle-only). Let the dog die and return to the idle screen: the button reappears.
7. Open the DevTools console and run `localStorage.getItem('dachshundDashEquippedCosmetics')` — confirm it prints a JSON string matching `{"hat":null,"sunglasses":null,"clothes":null}`.
8. Confirm no errors appear in the console throughout.

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "Add tabbed cosmetics menu UI with live preview"
```
