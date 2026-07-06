// Glasses cosmetic generator: emits 440x260 transparent pixel-art PNGs into
// png/sunglasses/, matching the canvas size and chunky-pixel look of the
// hand-generated originals (aviator/pixel/heart/visor). Each design is built
// on a coarse cell grid (10px cells -> 44x26) from simple shape tests, then
// blitted to full resolution. Alpha matters: "glass" lenses are translucent
// so the dog's eyes show through in-game.
// Usage: node tools/gen-glasses.cjs [repoDir]
const path = require('path');
const { writePng } = require('./pnglib.cjs');

const repo = process.argv[2] || '.';
const W = 440, H = 260, PX = 10, COLS = W / PX, ROWS = H / PX;

function makeGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}
function set(g, x, y, c) {
  if (x >= 0 && x < COLS && y >= 0 && y < ROWS) g[y][x] = c;
}
function rect(g, x0, y0, x1, y1, c) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(g, x, y, c);
}
// Fill cells whose center falls inside dist range [rIn, rOut) of (cx, cy).
function annulus(g, cx, cy, rIn, rOut, c) {
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
    if (d >= rIn && d < rOut) set(g, x, y, c);
  }
}
function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// 5-point star (point-up) vertex list.
function starPts(cx, cy, R, r) {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const a = (-90 + k * 36) * Math.PI / 180;
    const rad = k % 2 === 0 ? R : r;
    pts.push([cx + rad * Math.cos(a), cy + rad * Math.sin(a)]);
  }
  return pts;
}
function fillPoly(g, pts, c) {
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (pointInPoly(pts, x + 0.5, y + 0.5)) set(g, x, y, c);
  }
}
function blit(g) {
  const rgba = Buffer.alloc(W * H * 4);
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const c = g[y][x];
    if (!c) continue;
    const [r, gr, b, a = 255] = c;
    for (let dy = 0; dy < PX; dy++) for (let dx = 0; dx < PX; dx++) {
      const i = ((y * PX + dy) * W + (x * PX + dx)) * 4;
      rgba[i] = r; rgba[i + 1] = gr; rgba[i + 2] = b; rgba[i + 3] = a;
    }
  }
  return rgba;
}

// --- Star Shades: big vivid-violet star frames, bright translucent lenses.
// Violet pops against the dog's brown/tan coat (gold blended right in), and
// the stars sit close together so the connecting bridge is short. ---
function genStar() {
  const g = makeGrid();
  const OUT = [70, 16, 104], VIOLET = [186, 64, 255], LENS = [225, 170, 255, 110], HI = [246, 222, 255];
  // arms + bridge behind the stars (stars overdraw the bridge ends, leaving a
  // short visible connector in the middle)
  rect(g, 0, 11, 3, 12, OUT);
  rect(g, 40, 11, 43, 12, OUT);
  rect(g, 18, 12, 26, 13, OUT);
  for (const cx of [12.5, 31.5]) {
    fillPoly(g, starPts(cx, 13, 9.5, 4.0), OUT);
    fillPoly(g, starPts(cx, 13, 8.1, 3.4), VIOLET);
    fillPoly(g, starPts(cx, 13, 5.4, 2.3), LENS);
    // sparkle on the upper-left frame edge
    set(g, Math.round(cx - 3), 8, HI);
    set(g, Math.round(cx - 4), 9, HI);
  }
  return g;
}

// --- Reading Glasses: small round wire frames, near-clear lenses ---
function genRound() {
  const g = makeGrid();
  const WIRE = [186, 148, 62], OUT = [92, 68, 24], GLASS = [205, 232, 255, 55], GLINT = [255, 255, 255, 170];
  rect(g, 0, 12, 9, 12, WIRE);   // arms
  rect(g, 34, 12, 43, 12, WIRE);
  rect(g, 20, 11, 23, 11, WIRE); // bridge
  for (const cx of [15, 29]) {
    annulus(g, cx, 13.5, 5.0, 6.1, OUT);
    annulus(g, cx, 13.5, 4.4, 5.4, WIRE);
    annulus(g, cx, 13.5, 0, 4.4, GLASS);
    set(g, cx - 3, 11, GLINT);
    set(g, cx - 2, 10, GLINT);
  }
  return g;
}

// --- 3D Glasses: chunky white frame, red / cyan translucent lenses ---
function genThreeD() {
  const g = makeGrid();
  const OUT = [96, 100, 110], WHITE = [240, 240, 245], RED = [232, 44, 44, 160], CYAN = [40, 200, 232, 160];
  rect(g, 0, 9, 2, 10, WHITE);   // arms
  rect(g, 41, 9, 43, 10, WHITE);
  rect(g, 2, 7, 41, 19, OUT);
  rect(g, 3, 8, 40, 18, WHITE);
  // round the frame corners
  for (const [x, y] of [[2, 7], [41, 7], [2, 19], [41, 19]]) set(g, x, y, null);
  rect(g, 5, 10, 19, 17, RED);
  rect(g, 24, 10, 38, 17, CYAN);
  return g;
}

// --- Shutter Shades: neon green slatted party glasses ---
function genShutter() {
  const g = makeGrid();
  const OUT = [16, 92, 30], NEON = [70, 228, 80], GAP = [8, 40, 14, 80];
  rect(g, 0, 9, 1, 10, OUT);     // arms
  rect(g, 42, 9, 43, 10, OUT);
  rect(g, 1, 6, 42, 19, OUT);
  rect(g, 2, 7, 41, 18, NEON);
  for (const [x, y] of [[1, 6], [42, 6], [1, 19], [42, 19]]) set(g, x, y, null);
  // lens wells with horizontal slats left solid
  rect(g, 4, 10, 18, 17, GAP);
  rect(g, 25, 10, 39, 17, GAP);
  rect(g, 4, 12, 18, 12, NEON);
  rect(g, 4, 15, 18, 15, NEON);
  rect(g, 25, 12, 39, 12, NEON);
  rect(g, 25, 15, 39, 15, NEON);
  return g;
}

// --- Monocle: single gold-rimmed clear lens over the front eye, hanging chain ---
function genMonocle() {
  const g = makeGrid();
  const OUT = [110, 80, 20], GOLD = [230, 190, 60], GLASS = [220, 240, 255, 60], GLINT = [255, 255, 255, 180];
  annulus(g, 31.5, 10.5, 5.6, 6.8, OUT);
  annulus(g, 31.5, 10.5, 4.7, 5.8, GOLD);
  annulus(g, 31.5, 10.5, 0, 4.7, GLASS);
  set(g, 29, 8, GLINT);
  set(g, 28, 9, GLINT);
  // chain dangling from the lower-left rim (2-cell links so it survives the
  // heavy downscale to sprite size)
  for (const [x, y] of [[26, 16], [25, 18], [24, 20], [24, 22], [25, 24]]) {
    set(g, x, y, GOLD); set(g, x + 1, y, GOLD);
  }
  for (const [x, y] of [[25, 17], [24, 19], [24, 21], [25, 23]]) {
    set(g, x, y, OUT); set(g, x + 1, y, OUT);
  }
  return g;
}

const DESIGNS = {
  'star.png': genStar,
  'round.png': genRound,
  '3d.png': genThreeD,
  'shutter.png': genShutter,
  'monocle.png': genMonocle,
};

for (const [file, gen] of Object.entries(DESIGNS)) {
  const out = path.join(repo, 'png/sunglasses', file);
  writePng(out, W, H, blit(gen()));
  console.log('wrote', out);
}
