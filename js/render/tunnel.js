// The tunnel scene's looks: the tunnel as a cut-away of the soil under the
// path, its holes, the hedge, the rock, and the treat, plus the dog's slide
// into and out of a hole. Texture comes from a hash of each detail's index
// along the tunnel, so it scrolls with the tunnel and never shimmers.

import { W, H, GROUND_Y, TUNNEL_DEPTH, TUNNEL_DIVE_MS } from '../config.js';
import { drawSparkle } from './primitives.js';

const SOIL_TOP = GROUND_Y + 23;       // just under the path's running line
const BORE_TOP = SOIL_TOP + 3;
const BORE_BOTTOM = H;
const SOIL = { base: '#6B4423', dark: '#55361B', speck: '#8A5E36', pebble: '#9C8B7A', root: '#C9A27A' };
const BORE = { top: '#24160B', bottom: '#3A2614', floor: '#4E331B' };
const HOLE = { mouth: '#140B04', lip: '#9C6B3C', mound: '#8F5F33', moundLit: '#B07A45', moundEdge: '#4A2F17' };
const HEDGE = {
  outline: '#173F1A', lit: '#4CAF50', mid: '#2E7D32', shade: '#1F5E24', leafLight: '#66BB6A', leafDark: '#1B5E20',
};

// Repeatable pseudo-random in [0, 1) for detail number n of a given kind
// (murmur3's finalizer, so neighboring n and different salts don't correlate).
function hash01(n, salt) {
  let h = (Math.imul(n | 0, 0x9E3779B1) ^ Math.imul(salt, 0x85EBCA77)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B);
  h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Calls draw(k, x) for every detail slot `spacing` apart along the tunnel
// that's on screen (k counts from the tunnel's left end).
function eachVisibleSlot(o, spacing, draw) {
  const first = Math.max(0, Math.floor(-o.x / spacing));
  const last = Math.min(Math.floor(o.width / spacing), Math.ceil((W - o.x) / spacing));
  for (let k = first; k <= last; k++) draw(k, o.x + k * spacing);
}

function drawTunnel(ctx, o) {
  const left = Math.max(o.x, -20);
  const right = Math.min(o.x + o.width, W + 20);
  if (right <= left) return;

  // Soil, with rounded shoulders where the cut-away begins and ends, flecked with grit
  ctx.fillStyle = SOIL.base;
  ctx.beginPath();
  ctx.roundRect(o.x - 4, SOIL_TOP, o.width + 8, H - SOIL_TOP + 8, [6, 6, 0, 0]);
  ctx.fill();
  eachVisibleSlot(o, 9, (k, x) => {
    ctx.fillStyle = hash01(k, 1) < 0.5 ? SOIL.speck : SOIL.dark;
    ctx.fillRect(x + hash01(k, 2) * 8, SOIL_TOP + 0.5 + hash01(k, 3) * 1.5, 1.5, 1);
  });

  // The bore: a dark passage with rounded ends under the first and last holes,
  // its ceiling picked out by a lighter lip of packed earth
  const grad = ctx.createLinearGradient(0, BORE_TOP, 0, BORE_BOTTOM);
  grad.addColorStop(0, BORE.top);
  grad.addColorStop(1, BORE.bottom);
  ctx.fillStyle = grad;
  ctx.strokeStyle = SOIL.speck;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(o.x + 6, BORE_TOP, o.width - 12, BORE_BOTTOM - BORE_TOP + 8, [12, 12, 0, 0]);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = BORE.floor;
  ctx.fillRect(Math.max(o.x + 10, left), BORE_BOTTOM - 2, Math.min(o.x + o.width - 10, right) - Math.max(o.x + 10, left), 2);

  // Roots trailing from the ceiling, pebbles on the floor
  eachVisibleSlot(o, 64, (k, x) => {
    if (x < o.x + 24 || x > o.x + o.width - 40) return;
    const rootX = x + hash01(k, 4) * 40;
    const len = 4 + hash01(k, 5) * 5;
    ctx.strokeStyle = SOIL.root;
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(rootX, BORE_TOP);
    ctx.lineTo(rootX + 1, BORE_TOP + len);
    ctx.moveTo(rootX + 0.5, BORE_TOP + len * 0.45);
    ctx.lineTo(rootX + 3, BORE_TOP + len * 0.8);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = SOIL.pebble;
    ctx.beginPath();
    ctx.ellipse(x + 10 + hash01(k, 6) * 40, BORE_BOTTOM - 3, 2 + hash01(k, 7) * 1.5, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

// A burrow mouth: a dark opening into the bore between two mounds of
// thrown-up dirt, clods scattered on top.
function drawTunnelHole(ctx, o) {
  const cx = o.x + o.width / 2;
  const half = o.width / 2;
  const mouthY = SOIL_TOP - 1;

  // Shaft from the mouth down into the bore
  ctx.fillStyle = BORE.top;
  ctx.fillRect(cx - half + 8, mouthY, o.width - 16, BORE_TOP - mouthY + 2);
  // The mouth, with the far lip lit
  ctx.fillStyle = HOLE.mouth;
  ctx.beginPath();
  ctx.ellipse(cx, mouthY, half - 6, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = HOLE.lip;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(cx, mouthY, half - 6, 4.5, 0, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
  // Mounds either side: outlined, lit on top, a few clods
  for (const side of [-1, 1]) {
    const mx = cx + side * (half - 2);
    ctx.fillStyle = HOLE.moundEdge;
    ctx.beginPath();
    ctx.ellipse(mx, mouthY + 1, 11, 6.5, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = HOLE.mound;
    ctx.beginPath();
    ctx.ellipse(mx, mouthY + 1, 10, 5.5, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = HOLE.moundLit;
    ctx.beginPath();
    ctx.ellipse(mx - side * 1.5, mouthY - 2, 6, 2.2, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = HOLE.moundEdge;
    ctx.fillRect(mx + side * 4, mouthY - 3, 2, 2);
    ctx.fillRect(mx - side * 3, mouthY - 1, 1.5, 1.5);
  }
}

// A towering clipped hedge: a leafy column with a scalloped edge and a domed
// top, leaning a little in the wind (a shear, so its foot stays planted).
function drawHedge(ctx, o, frameCount) {
  const { x, y, width: w, height: h } = o;
  const bottom = y + h;
  const lean = Math.sin(frameCount * 0.04 + x * 0.005) * 0.012;

  ctx.save();
  ctx.transform(1, 0, lean, 1, -lean * bottom, 0);

  // Shadow at the foot
  ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.beginPath();
  ctx.ellipse(x + w / 2, bottom - 1, w * 0.7, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body, lit from the left; bumps along both sides break up the outline
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, HEDGE.lit);
  grad.addColorStop(0.45, HEDGE.mid);
  grad.addColorStop(1, HEDGE.shade);
  ctx.fillStyle = HEDGE.outline;
  ctx.beginPath();
  ctx.roundRect(x - 1, y - 1, w + 2, h + 1, [w / 2 + 1, w / 2 + 1, 3, 3]);
  ctx.fill();
  for (let k = 0, by = bottom - 6; by > y + w / 2; k++, by -= 7) {
    for (const [side, edgeX] of [[0, x], [1, x + w]]) {
      ctx.beginPath();
      ctx.arc(edgeX + (side ? -1 : 1) * hash01(k, 11 + side), by, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, [w / 2, w / 2, 2, 2]);
  ctx.fill();
  for (let k = 0, by = bottom - 6; by > y + w / 2; k++, by -= 7) {
    ctx.fillStyle = HEDGE.lit;
    ctx.beginPath();
    ctx.arc(x + 1 + hash01(k, 11), by, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = HEDGE.shade;
    ctx.beginPath();
    ctx.arc(x + w - 1 - hash01(k, 12), by, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Leaves: little tilted ovals in light and dark greens
  for (let k = 0; k < (w * h) / 36; k++) {
    const lx = x + 3 + hash01(k, 13) * (w - 6);
    const ly = y + 4 + hash01(k, 14) * (h - 6);
    if (ly < y + w / 2 && Math.hypot(lx - (x + w / 2), ly - (y + w / 2)) > w / 2 - 3) continue;  // outside the dome
    ctx.fillStyle = hash01(k, 15) < 0.55 ? HEDGE.leafLight : HEDGE.leafDark;
    ctx.beginPath();
    ctx.ellipse(lx, ly, 2.2, 1.2, hash01(k, 16) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }

  // A few flowers
  for (let k = 0; k < h / 30; k++) {
    ctx.fillStyle = hash01(k, 17) < 0.5 ? '#FFF3B0' : '#FFB3C7';
    ctx.beginPath();
    ctx.arc(x + 5 + hash01(k, 18) * (w - 10), y + w / 2 + hash01(k, 19) * (h - w), 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// A grey boulder wedged in the bore.
function drawRock(ctx, o) {
  const { x, y, width: w, height: h } = o;
  ctx.fillStyle = '#4A4A4A';
  ctx.beginPath();
  ctx.moveTo(x + 2, y + h);
  ctx.lineTo(x, y + h * 0.55);
  ctx.lineTo(x + w * 0.2, y + h * 0.15);
  ctx.lineTo(x + w * 0.55, y);
  ctx.lineTo(x + w * 0.85, y + h * 0.2);
  ctx.lineTo(x + w, y + h * 0.6);
  ctx.lineTo(x + w - 2, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8A8A8A';
  ctx.beginPath();
  ctx.moveTo(x + 3, y + h * 0.55);
  ctx.lineTo(x + w * 0.22, y + h * 0.22);
  ctx.lineTo(x + w * 0.55, y + h * 0.08);
  ctx.lineTo(x + w * 0.8, y + h * 0.26);
  ctx.lineTo(x + w * 0.6, y + h * 0.5);
  ctx.lineTo(x + w * 0.25, y + h * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#B5B5B5';
  ctx.fillRect(x + w * 0.3, y + h * 0.2, w * 0.18, 2);
  // Crack
  ctx.strokeStyle = '#2E2E2E';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.62, y + h * 0.3);
  ctx.lineTo(x + w * 0.7, y + h * 0.55);
  ctx.lineTo(x + w * 0.64, y + h * 0.8);
  ctx.stroke();
}

// A bone-shaped dog biscuit, bobbing and twinkling (the hitbox stays put).
function drawTreat(ctx, o, frameCount) {
  const bob = Math.sin(frameCount * 0.1 + o.x * 0.01) * 2;
  const { x, width: w, height: h } = o;
  const y = o.y + bob;
  const r = h * 0.3;
  const knobs = [[x + r, y + r], [x + r, y + h - r], [x + w - r, y + r], [x + w - r, y + h - r]];
  const bone = (color, grow) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + r, y + h * 0.28 - grow, w - 2 * r, h * 0.44 + 2 * grow);
    for (const [kx, ky] of knobs) {
      ctx.beginPath();
      ctx.arc(kx, ky, r + grow, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  ctx.save();
  ctx.shadowColor = '#FFD27A';
  ctx.shadowBlur = 6;
  bone('#7A4A1E', 1);
  ctx.restore();
  bone('#D9A25F', 0);
  ctx.fillStyle = '#F0C88A';
  ctx.fillRect(x + r, y + h * 0.3, w - 2 * r, 1.5);
  ctx.fillStyle = '#9C6A35';
  for (const dx of [0.38, 0.5, 0.62]) ctx.fillRect(x + w * dx, y + h * 0.55, 1, 1);

  ctx.fillStyle = 'rgba(255, 245, 210, 0.9)';
  const twinkle = Math.max(0, Math.sin(frameCount * 0.08 + o.x * 0.02));
  drawSparkle(ctx, x + w + 2, y - 2, 1 + twinkle * 2.5);
}

export const TUNNEL_LOOKS = {
  tunnel: { normal: (ctx, o) => drawTunnel(ctx, o) },
  tunnelHole: { normal: (ctx, o) => drawTunnelHole(ctx, o) },
  hedge: { normal: (ctx, o, v) => drawHedge(ctx, o, v.frameCount) },
  rock: { normal: (ctx, o) => drawRock(ctx, o) },
  treat: { normal: (ctx, o, v) => drawTreat(ctx, o, v.frameCount) },
};

// How far below its physics y to draw the dog: it slides down into a hole
// over TUNNEL_DIVE_MS, and back up as it pops out.
export function tunnelDiveOffset(dog, now) {
  const t = Math.min(1, Math.max(0, (now - dog.burrowChangedAt) / TUNNEL_DIVE_MS));
  const eased = 1 - (1 - t) ** 2;
  return TUNNEL_DEPTH * (dog.underground ? eased : 1 - eased);
}
