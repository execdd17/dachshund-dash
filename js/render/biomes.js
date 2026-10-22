// Biomes: the scenery's looks, taking turns as the score climbs. Purely
// cosmetic, and only render/background.js reads them. A biome is data: every
// color is a [day, sunset, night, dawn] palette that the time of day blends
// through, each hill layer has a silhouette (a shape function), a scroll
// rate, and optional `details` drawn over its fill (the autumn ridge's tree
// colors), and `decor` draws the little things along the path. Each biome lasts
// BIOME_CYCLES day cycles and hands over to the next across the last one's
// full night: colors blend and hills morph in the dark, so the player runs
// into the night in one place and out into the dawn in another.
//
// Adding a biome: one entry in BIOMES (spread MEADOW for the parts it keeps).

import { W, GROUND_Y, BIOME_CYCLES } from '../config.js';
import { lerpColor } from '../core/color.js';
import { DAY_CYCLE, SUNSET_END, NIGHT_END } from '../core/timeOfDay.js';

// --- Hill silhouettes: height above a layer's base at x (pure) ---

// Smooth rolling hills
export function hillY(x, offset, amp, freq) {
  const v = x + offset;
  return amp * (
    Math.sin(v * freq) * 0.50 +
    Math.sin(v * freq * 2.1 + 1.3) * 0.30 +
    Math.sin(v * freq * 0.6 + 0.8) * 0.20
  );
}

// Mountain range — layered abs(sin) with pow sharpening
export function mountainY(x, offset, amp, freq) {
  const v = x + offset;
  // Broad mountain masses
  const base = Math.abs(Math.sin(v * freq * 0.45 + 0.8)) * 0.25;
  // Main peaks — pow < 1 sharpens the tips
  const peaks = Math.pow(Math.abs(Math.sin(v * freq * 1.1)), 0.7) * 0.30;
  // Secondary ridges
  const ridges = Math.abs(Math.sin(v * freq * 2.3 + 1.5)) * 0.20;
  // Fine jagged detail
  const jag = Math.abs(Math.sin(v * freq * 4.7 + 3.2)) * 0.15;
  // Subtle craggy texture
  const crag = Math.abs(Math.sin(v * freq * 8.3 + 5.1)) * 0.10;
  return amp * (base + peaks + ridges + jag + crag);
}

// Mesas: separate flat-topped buttes of different heights with steep sides
// (a clipped sine), a little weathered on top
export function mesaY(x, offset, amp, freq) {
  const v = (x + offset) * freq;
  const s = Math.sin(v) * 0.6 + Math.sin(v * 0.37 + 2.1) * 0.4;
  const butte = Math.min(1, Math.max(0, (s - 0.3) * 6));
  const height = 0.55 + 0.35 * Math.abs(Math.sin(v * 0.23 + 0.6));
  return amp * (0.1 + butte * (height + Math.abs(Math.sin(v * 11)) * 0.04));
}

// Dunes: long windward slopes and short steep faces (a skewed sine)
export function duneY(x, offset, amp, freq) {
  const v = (x + offset) * freq;
  const u = v + 0.45 * Math.sin(v);
  return amp * (Math.sin(u) * 0.7 + Math.sin(u * 0.53 + 1.7) * 0.3);
}

// A forest edge: rounded crowns along a gently rolling line
export function treelineY(x, offset, amp, freq) {
  const v = (x + offset) * freq;
  const roll = Math.sin(v) * 0.3 + Math.sin(v * 2.3 + 0.7) * 0.15;
  const crowns = Math.pow(Math.abs(Math.sin(v * 9)), 0.4) * 0.45 + Math.pow(Math.abs(Math.sin(v * 5.3 + 1.1)), 0.4) * 0.15;
  return amp * (roll + crowns);
}

// A forested ridge: a low rolling hill line studded with pointed trees of
// mixed heights, a few gaps between them. Each tree is a triangle around a
// jittered spot every PINE_SPACING px; the outline is the tallest one there.
const PINE_SPACING = 13;
const hash = n => {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
};
const ridgeY = (v, amp, freq) => amp * (0.3 + Math.sin(v * freq) * 0.12 + Math.sin(v * freq * 2.7 + 1.1) * 0.06);
// Tree i's height above the ridge at v (0 off the tree, or in a gap).
function pineAt(i, v, amp) {
  if (hash(i) < 0.12) return 0;
  const center = (i + 0.2 + hash(i + 0.5) * 0.6) * PINE_SPACING;
  const height = amp * (0.35 + hash(i + 0.25) * 0.45);
  return Math.max(0, height * (1 - Math.abs(v - center) / (height * 0.32)));
}
export function pinesY(x, offset, amp, freq) {
  const v = x + offset;
  const slot = Math.floor(v / PINE_SPACING);
  let tree = 0;
  for (let i = slot - 1; i <= slot + 1; i++) tree = Math.max(tree, pineAt(i, v, amp));
  return ridgeY(v, amp, freq) + tree;
}

// Layer details: each tree on the ridge in a color picked by hash(i) from
// the layer's `trees` ([share, palette], shares summing to 1), drawn over
// the fill along the same outline, in order, so a later tree overlaps an
// earlier one.
function drawPineColors(ctx, layer, offset, color) {
  const { baseY, amp, freq, trees } = layer;
  const first = Math.floor(offset / PINE_SPACING) - 2;
  const last = Math.ceil((offset + W) / PINE_SPACING) + 2;
  for (let i = first; i <= last; i++) {
    const v0 = (i - 1) * PINE_SPACING;  // a tree stays within a slot of its own
    const v1 = (i + 2) * PINE_SPACING;
    let pick = hash(i + 0.75);
    const [, palette] = trees.find(([share]) => (pick -= share) < 0) ?? trees.at(-1);
    ctx.fillStyle = color(palette);
    ctx.beginPath();
    let open = false;
    for (let v = v0; v <= v1; v += 0.5) {
      const h = pineAt(i, v, amp);
      if (h <= 0) continue;
      const y = baseY - ridgeY(v, amp, freq) - h;
      if (!open) { ctx.moveTo(v - offset, baseY - ridgeY(v, amp, freq)); open = true; }
      ctx.lineTo(v - offset, y);
    }
    if (!open) continue;
    ctx.closePath();
    ctx.fill();
  }
}

// The time of day is dark enough to dim decorations (night and early dawn).
export const isDim = phase => phase >= 0.5 && phase < 0.75;

// --- Decor: drawn at fx with its baseline at f.baseY (state.flowers) ---

function drawFlower(ctx, f, fx, phase) {
  const s = f.size;
  const dim = isDim(phase);
  ctx.fillStyle = dim ? '#2A3A2A' : '#2E8B2E';
  ctx.fillRect(fx, f.baseY - f.size * 2, 2, f.size * 2 + 2);

  ctx.fillStyle = dim ? lerpColor(f.color, '#2A2A3A', 0.6) : f.color;
  ctx.fillRect(fx - s + 1, f.baseY - s * 3, s, s);
  ctx.fillRect(fx + 2, f.baseY - s * 3, s, s);
  ctx.fillRect(fx - s + 1, f.baseY - s * 1.5, s, s);
  ctx.fillRect(fx + 2, f.baseY - s * 1.5, s, s);

  ctx.fillStyle = dim ? '#4A4A40' : '#FFD700';
  ctx.fillRect(fx, f.baseY - s * 2.5 + 1, s - 1, s - 1);
}

// Which of n looks a decor spot gets (fixed per spot)
const variant = (f, n) => Math.floor(f.x * 7.31) % n;
// Decor colors go dusky in the dark, like the flowers' petals
const dusk = (color, phase) => (isDim(phase) ? lerpColor(color, '#2A2A3A', 0.6) : color);

const LEAVES = ['#E8A317', '#D2691E', '#B5341F', '#C8552A'];

// A pumpkin, or a little drift of fallen leaves
function drawAutumnDecor(ctx, f, fx, phase) {
  const s = f.size;
  const y = f.baseY;
  if (variant(f, 3) === 0) {
    const cx = fx + 1;
    const rx = s * 1.1;
    const ry = s * 0.8;
    const cy = y - ry;
    ctx.fillStyle = dusk('#E07A1F', phase);                // body
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = dusk('#B35A12', phase);              // ribs
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 0.45, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = dusk('#F59A3C', phase);                // shine
    ctx.fillRect(cx - rx * 0.75, cy - ry * 0.45, 1.5, ry * 0.6);
    ctx.fillStyle = dusk('#5A6B2A', phase);                // stem
    ctx.fillRect(cx - 1, cy - ry - s * 0.45, 2, s * 0.55);
    return;
  }
  for (let j = 0; j < 4; j++) {
    ctx.fillStyle = dusk(LEAVES[(variant(f, 4) + j) % 4], phase);
    ctx.beginPath();
    ctx.ellipse(fx + (j - 1.5) * s * 0.9, y - (j % 2) * s * 0.5, s * 0.6, s * 0.32, j * 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
}

// A saguaro (the bigger spots), or a sandstone rock
function drawDesertDecor(ctx, f, fx, phase) {
  const s = f.size;
  const y = f.baseY;
  if (s < 4.2) {
    ctx.fillStyle = dusk('#A8876A', phase);
    ctx.beginPath();
    ctx.ellipse(fx + s * 0.5, y, s * 1.1, s * 0.7, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = dusk('#C9AB8A', phase);
    ctx.fillRect(fx - s * 0.1, y - s * 0.55, s * 0.7, 1.5);
    return;
  }
  const h = s * 3.4;
  const w = Math.round(s * 0.8);
  const arm = w * 0.7;
  const top = y - h;
  ctx.fillStyle = dusk('#4E9A42', phase);
  ctx.fillRect(fx, top, w, h + 2);                                     // trunk
  ctx.fillRect(fx - s, top + h * 0.45, s, arm);                        // left arm, out...
  ctx.fillRect(fx - s, top + h * 0.15, arm, h * 0.3 + arm);            // ...and up
  ctx.fillRect(fx + w, top + h * 0.3, s * 0.8, arm);                   // right arm, out...
  ctx.fillRect(fx + w + s * 0.8 - arm, top + h * 0.05, arm, h * 0.25 + arm);  // ...and up
  ctx.fillStyle = dusk('#3A7A32', phase);
  ctx.fillRect(fx + w - 1, top, 1, h + 2);                             // shaded side
}

// --- The biomes ---

const MEADOW = {
  id: 'meadow',
  sky: {
    top: ['#4AB8E8', '#FF8C42', '#0D1B2A', '#6B4E71'],
    mid: ['#87CEEB', '#FF6B6B', '#1B263B', '#9B8AA6'],
    bottom: ['#B0E0F0', '#FFB88C', '#415A77', '#4AB8E8'],
  },
  clouds: {
    fill: ['#FFFFFF', '#FFD4D4', '#3A3A4A', '#E8E8F0'],
    shadow: ['#B4DCF0', '#E8B4C0', '#2A2A35', '#B0B8D0'],
    highlight: [0.8, 0.6, 0.2, 0.5],
  },
  // Far to near. A layer blends with the same layer of the next biome.
  hills: [
    // Mountain range: jagged peaks, taller, slower, finer step for a crisper ridgeline
    { scroll: 0.06, baseY: GROUND_Y - 20, amp: 50, freq: 0.0028, shape: mountainY, step: 2, fill: ['#8090A8', '#B88878', '#161C28', '#686080'] },
    // Mid hills: medium undulations
    { scroll: 0.20, baseY: GROUND_Y - 2, amp: 20, freq: 0.006, shape: hillY, step: 4, fill: ['#7BA888', '#B08860', '#162420', '#688070'] },
    // Near hills: smaller, fastest, most saturated
    { scroll: 0.38, baseY: GROUND_Y + 4, amp: 14, freq: 0.010, shape: hillY, step: 4, fill: ['#5D9E58', '#988050', '#1A2E1A', '#5A7858'] },
  ],
  // The running path: [day=sandy, sunset=warm amber, night=dark brown, dawn=sandy]
  path: {
    top: ['#E8D5A3', '#E8B870', '#5C4033', '#E8D5A3'],
    bottom: ['#D4C08E', '#D4A055', '#3D2B1F', '#D4C08E'],
    texture: ['#C9B57A', '#C9A055', '#4A3728', '#C9B57A'],
  },
  // The verge below it and the blades along both edges
  grass: {
    top: ['#5DBE3E', '#6B8E3E', '#1A2E1A', '#5DBE3E'],
    mid: ['#4CAF30', '#5A7E30', '#152515', '#4CAF30'],
    bottom: ['#3D8B28', '#4A6B28', '#0F1F0F', '#3D8B28'],
    blade: ['#6ECF4A', '#7A9F4A', '#2A3A2A', '#6ECF4A'],
  },
  decor: { draw: drawFlower, opacity: [1, 0.9, 0.35, 0.7] },
};

// Golden grass, evergreens behind a forest edge in reds and oranges, pumpkins and leaves
const AUTUMN = {
  ...MEADOW,
  id: 'autumn',
  sky: {
    top: ['#5AA8D8', '#F07838', '#0F1828', '#6A4A68'],
    mid: ['#9CCCE4', '#F2875A', '#1C2438', '#A08898'],
    bottom: ['#E4DCC4', '#FFB080', '#3E4C68', '#D8B898'],
  },
  hills: [
    // A forested ridge: mostly evergreens, a few turned gold or rust, on a hazy taupe hillside
    {
      scroll: 0.06, baseY: GROUND_Y - 14, amp: 46, freq: 0.004, shape: pinesY, step: 1,
      fill: ['#8C8078', '#8A6A5C', '#181616', '#6A5E62'],
      details: drawPineColors,
      trees: [  // [share, palette]
        [0.80, ['#4F7366', '#6E6458', '#121C1A', '#4A5E58']],  // evergreen
        [0.12, ['#B89A50', '#B88450', '#201C14', '#8A7C5C']],  // gold
        [0.08, ['#9A5E46', '#985446', '#1E1410', '#785450']],  // rust
      ],
    },
    { scroll: 0.20, baseY: GROUND_Y - 4, amp: 22, freq: 0.006, shape: treelineY, step: 2, fill: ['#D08A3C', '#C0703A', '#2A1E14', '#987058'] },
    { scroll: 0.38, baseY: GROUND_Y + 4, amp: 14, freq: 0.010, shape: hillY, step: 4, fill: ['#B5532E', '#A04830', '#26150F', '#80503C'] },
  ],
  grass: {
    top: ['#B8A03A', '#A88A36', '#2A2814', '#B0983A'],
    mid: ['#A08A30', '#90752E', '#211F10', '#988430'],
    bottom: ['#7E6C26', '#6E5A24', '#16140A', '#7A6A26'],
    blade: ['#CDB54C', '#BBA046', '#3A3620', '#C8B04A'],
  },
  decor: { draw: drawAutumnDecor, opacity: [1, 0.9, 0.35, 0.7] },
};

// A hot sky, red mesas, dunes, a sandy verge, saguaros and rocks
const DESERT = {
  ...MEADOW,
  id: 'desert',
  sky: {
    top: ['#3FA6E0', '#FF7A30', '#0E1626', '#6E4A6A'],
    mid: ['#8CCBEA', '#FF8C5A', '#1C2640', '#B08AA0'],
    bottom: ['#F4E4C4', '#FFC48A', '#46506E', '#F0D0A0'],
  },
  hills: [
    { scroll: 0.06, baseY: GROUND_Y - 20, amp: 50, freq: 0.009, shape: mesaY, step: 2, fill: ['#C27A5A', '#C0644A', '#21151A', '#8E5E6A'] },
    { scroll: 0.20, baseY: GROUND_Y - 2, amp: 18, freq: 0.005, shape: duneY, step: 4, fill: ['#E2BC7E', '#E09A62', '#2C2218', '#B49274'] },
    { scroll: 0.38, baseY: GROUND_Y + 4, amp: 12, freq: 0.008, shape: duneY, step: 4, fill: ['#D6A35E', '#CC8A4E', '#251B12', '#A88062'] },
  ],
  path: {
    top: ['#F0DDB0', '#F0C080', '#5E4634', '#EED8A8'],
    bottom: ['#DEC694', '#DCA866', '#40301F', '#DCC290'],
    texture: ['#CDB27A', '#CFA060', '#4C3A2A', '#CBAF78'],
  },
  grass: {
    top: ['#E4C27E', '#E0A868', '#3A2C1C', '#D8B880'],
    mid: ['#D8B270', '#D29A5C', '#302416', '#CCA872'],
    bottom: ['#C49A58', '#BC844A', '#221A10', '#B89660'],
    blade: ['#C8A060', '#C08850', '#2C2216', '#BC9A62'],
  },
  decor: { draw: drawDesertDecor, opacity: [1, 0.9, 0.35, 0.7] },
};

export const BIOMES = [MEADOW, AUTUMN, DESERT];

// --- Which biome, when ---

const STRETCH = BIOME_CYCLES * DAY_CYCLE;
const HANDOVER_START = STRETCH - DAY_CYCLE + SUNSET_END;  // the last cycle's full night
const HANDOVER_END = STRETCH - DAY_CYCLE + NIGHT_END;

const ease = k => k * k * (3 - 2 * k);

// The scenery at `score`: biome `from` blending into `to` by k (0 = all
// `from`; outside a handover, from === to and k is 0). `skip` moves the whole
// order along (the N debug key).
export function biomeAt(score, skip = 0) {
  const stretch = Math.floor(score / STRETCH);
  const s = score - stretch * STRETCH;
  const pick = n => BIOMES[(n + skip) % BIOMES.length];
  if (s < HANDOVER_START) return { from: pick(stretch), to: pick(stretch), k: 0 };
  if (s >= HANDOVER_END) return { from: pick(stretch + 1), to: pick(stretch + 1), k: 0 };
  return { from: pick(stretch), to: pick(stretch + 1), k: ease((s - HANDOVER_START) / (HANDOVER_END - HANDOVER_START)) };
}
