// The frenzy's looks (systems/frenzy.js): the drop (flash, shockwave,
// FRENZY! banner, screen shake), hazards bursting into rainbows, and, for the
// rest of the run, the inferno: a burning horizon behind the hills, the path
// burning behind the dog (a comet tail when it flies), speed lines (the
// flight's own wind lines, set alight, while it flies), embers, and the
// score's fire, a speedometer. Everything is a function of `now` and the
// state, so none of it needs state of its own. The inferno eases in over
// INFERNO_RAMP_MS from the drop.

import {
  W, H, GROUND_Y, FRENZY_AT, FRENZY_DROP_MS, FRENZY_SHAKE_MS, FRENZY_SHAKE_PX, BURST_MS,
  INITIAL_SPEED, MAX_SPEED, SPEED_INCREMENT,
} from '../config.js';
import { drawSparkle, hash01 } from './primitives.js';
import { lerpColor } from '../core/color.js';
import { inFrenzy } from '../systems/frenzy.js';
import { isGiant } from '../systems/giant.js';

const INFERNO_RAMP_MS = 1500;
const FLASH_MS = 260;
const SHOCKWAVE_MS = 750;
const BANNER = { text: 'FRENZY!', size: 46, popMs: 220, fadeMs: 450, y: 78 };
const FIRE = { outer: '#E8401A', mid: '#FF9A26', core: '#FFE680', outline: '#4A1004' };
const RAINBOW = ['#FF4D4D', '#FF9F1C', '#FFE14D', '#4CD964', '#3DA5FF', '#A66BFF'];
const BURST_RAYS = 12;

const easeOut = k => 1 - (1 - k) * (1 - k);

const blazing = state => state.gameState === 'running' && inFrenzy(state);
const infernoLevel = (state, now) => (blazing(state) ? Math.min(1, (now - state.frenzyAt) / INFERNO_RAMP_MS) : 0);

// One flame tongue from (x, baseY), `h` tall and `w` wide at the base, its
// tip swaying by `sway`. With `outline`, its sides are stroked first (the
// path is left open: fill() closes the base, and the outline skips it).
function tongue(ctx, x, baseY, h, w, sway, outline = null) {
  ctx.beginPath();
  ctx.moveTo(x - w, baseY);
  ctx.quadraticCurveTo(x - w, baseY - h * 0.55, x + sway, baseY - h);
  ctx.quadraticCurveTo(x + w, baseY - h * 0.55, x + w, baseY);
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.fill();
}

// --- The drop and the bursts (EFFECT_DRAWERS entries) ---

export const FRENZY_EFFECT_DRAWERS = {
  // A rainbow burst: rays in rainbow colors shoot out from a sparkle, a ring
  // swells behind them, and confetti flies out and falls.
  burst(ctx, e, { now }) {
    const age = (now - e.startTime) / BURST_MS;
    if (age > 1) return;
    const seed = e.startTime * 0.001 + e.x;
    const spread = easeOut(Math.min(1, age * 1.5));
    const reach = e.size * (0.5 + 0.9 * spread);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalAlpha = (1 - age) * 0.6;
    ctx.lineWidth = 3 * (1 - age) + 1;
    ctx.strokeStyle = RAINBOW[Math.floor(hash01(seed) * RAINBOW.length)];
    ctx.beginPath();
    ctx.arc(e.x, e.y, reach * 0.85, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1 - age;
    ctx.lineWidth = 3.5 * (1 - age) + 1;
    for (let i = 0; i < BURST_RAYS; i++) {
      const angle = (i / BURST_RAYS) * Math.PI * 2 + hash01(seed) * Math.PI;
      const inner = reach * (0.25 + 0.35 * spread);
      const outer = reach * (0.7 + 0.3 * hash01(seed + i));
      ctx.strokeStyle = RAINBOW[i % RAINBOW.length];
      ctx.beginPath();
      ctx.moveTo(e.x + Math.cos(angle) * inner, e.y + Math.sin(angle) * inner);
      ctx.lineTo(e.x + Math.cos(angle) * outer, e.y + Math.sin(angle) * outer);
      ctx.stroke();
    }
    if (age < 0.4) {
      ctx.globalAlpha = 1 - age / 0.4;
      drawSparkle(ctx, e.x, e.y, e.size * 0.45 * (0.6 + spread));
    }
    for (let i = 0; i < 14; i++) {
      const angle = hash01(seed + i + 0.25) * Math.PI * 2;
      const dist = spread * e.size * (0.7 + hash01(seed + i + 0.5));
      ctx.globalAlpha = 1 - age;
      ctx.fillStyle = RAINBOW[(i + 3) % RAINBOW.length];
      ctx.save();
      ctx.translate(e.x + Math.cos(angle) * dist, e.y + Math.sin(angle) * dist * 0.8 + age * age * 34);
      ctx.rotate(angle + age * 6);
      ctx.fillRect(-2, -1, 4, 2.5);
      ctx.restore();
    }
    ctx.restore();
  },

  // The drop: a white flash, a shockwave from the dog, and the banner.
  frenzyDrop(ctx, e, { now }) {
    const t = now - e.startTime;
    if (t > FRENZY_DROP_MS) return;
    ctx.save();
    if (t < FLASH_MS) {
      ctx.globalAlpha = 0.85 * (1 - t / FLASH_MS);
      ctx.fillStyle = '#FFF6E0';
      ctx.fillRect(-W, -2 * H - 1000, 3 * W, 4 * H + 2000);  // the whole screen, however tall
    }
    if (t < SHOCKWAVE_MS) {
      const k = t / SHOCKWAVE_MS;
      ctx.globalAlpha = 1 - k;
      ctx.lineWidth = 10 * (1 - k) + 1;
      ctx.strokeStyle = FIRE.mid;
      ctx.beginPath();
      ctx.arc(e.x, e.y, 20 + easeOut(k) * 620, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 4 * (1 - k) + 1;
      ctx.strokeStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(e.x, e.y, 10 + easeOut(k) * 520, 0, Math.PI * 2);
      ctx.stroke();
    }
    const pop = Math.min(1, t / BANNER.popMs);
    const scale = 1.8 - 0.8 * easeOut(pop);
    ctx.globalAlpha = Math.min(1, (FRENZY_DROP_MS - t) / BANNER.fadeMs) * pop;
    ctx.translate(W / 2 + Math.sin(t * 0.09) * 2 * (1 - pop), BANNER.y);
    ctx.scale(scale, scale);
    ctx.font = `bold ${BANNER.size}px Courier New`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const grad = ctx.createLinearGradient(0, -BANNER.size / 2, 0, BANNER.size / 2);
    grad.addColorStop(0, FIRE.core);
    grad.addColorStop(0.5, FIRE.mid);
    grad.addColorStop(1, FIRE.outer);
    ctx.lineJoin = 'round';
    ctx.lineWidth = 7;
    ctx.strokeStyle = FIRE.outline;
    ctx.strokeText(BANNER.text, 0, 0);
    ctx.fillStyle = grad;
    ctx.fillText(BANNER.text, 0, 0);
    ctx.restore();
  },
};

// The drop's camera shake: an offset for draw() to apply, decaying to nothing.
export function frenzyShake(state, now) {
  const drop = state.effects.find(e => e.kind === 'frenzyDrop');
  const t = drop ? now - drop.startTime : Infinity;
  if (t >= FRENZY_SHAKE_MS) return null;
  const intensity = FRENZY_SHAKE_PX * (1 - t / FRENZY_SHAKE_MS);
  return { x: (Math.random() - 0.5) * 2 * intensity, y: (Math.random() - 0.5) * 2 * intensity };
}

// --- The inferno ---

// A burning horizon: a faint red over the sky, glowing orange down behind
// the hills (drawn after the clouds, before the hills). A strong red over the
// whole sky turned a blue day sky gray.
export function drawInfernoSky(ctx, state, extraTop, now) {
  const level = infernoLevel(state, now);
  if (!level) return;
  const grad = ctx.createLinearGradient(0, -extraTop, 0, GROUND_Y + 20);
  grad.addColorStop(0, `rgba(170, 30, 10, ${0.16 * level})`);
  grad.addColorStop(0.55, `rgba(255, 80, 20, ${0.16 * level})`);
  grad.addColorStop(1, `rgba(255, 110, 20, ${0.55 * level})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, -extraTop, W, extraTop + GROUND_Y + 20);
}

const TRAIL_SPACING = 9;
const TRAIL_BASE_Y = GROUND_Y + 27;

// The path burning behind the dog: flames fixed to the ground, so they scroll
// away behind it, tallest where it just ran (drawn before the obstacles).
// `bob`: how far the flying dog is drawn off its y (render/flight.js).
export function drawFireTrail(ctx, state, now, bob = 0) {
  const level = infernoLevel(state, now);
  const dog = state.dog;
  if (!level || dog.underground || isGiant(state)) return;
  if (dog.flying) {
    drawCometTail(ctx, dog, dog.y + bob, level, now);
    return;
  }
  const tail = dog.x + 22;
  const shift = state.groundOffset % TRAIL_SPACING;
  const first = Math.floor(state.groundOffset / TRAIL_SPACING);
  ctx.save();
  for (const [color, scale] of [[FIRE.outer, 1], [FIRE.mid, 0.68], [FIRE.core, 0.38]]) {
    ctx.fillStyle = color;
    for (let k = 0; tail - k * TRAIL_SPACING - shift > -10; k++) {
      const x = tail - k * TRAIL_SPACING - shift;
      const id = first - k;  // the same flame frame to frame
      const fresh = 1 - (tail - x) / (tail + 10);
      const flicker = 0.6 + 0.4 * Math.sin(now * 0.017 + id * 2.3) * Math.sin(now * 0.011 + id * 1.1);
      const h = (9 + 24 * fresh) * flicker * level * scale;
      ctx.globalAlpha = 0.85 * (0.4 + 0.6 * fresh);
      tongue(ctx, x, TRAIL_BASE_Y, h, 4.5 * scale, Math.sin(now * 0.008 + id) * 1.5);
    }
  }
  ctx.restore();
}

// A flying dog trails fire behind it like a comet: tongues pointing back,
// longest in the middle.
const COMET_TONGUES = 5;
function drawCometTail(ctx, dog, drawnY, level, now) {
  const x = dog.x + 24;
  const y = drawnY + 4;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);  // a tongue's "up" now points back along the flight
  for (const [color, scale] of [[FIRE.outer, 1], [FIRE.mid, 0.7], [FIRE.core, 0.4]]) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < COMET_TONGUES; i++) {
      const offset = (i - (COMET_TONGUES - 1) / 2) * 3.2;
      const middle = 1 - Math.abs(offset) / 9;
      const flicker = 0.7 + 0.3 * Math.sin(now * 0.02 + i * 2.1);
      tongue(ctx, offset, 0, (18 + 40 * middle) * flicker * level * scale, 4 * scale, Math.sin(now * 0.012 + i) * 2);
    }
  }
  ctx.restore();
}

// The flight's wind lines (render/flight.js) in the frenzy's colors.
export const FLIGHT_WIND_FIRE = ['#FFD08A', '#FF9A26', '#FFE680'];
export const flightWindAlight = (state, now) => infernoLevel(state, now) > 0;

const SPEED_LINES = 12;
const EMBERS = 18;

// Speed lines streaking past (not while flying) and embers blowing through
// (drawn over the play field).
export function drawInfernoForeground(ctx, state, extraTop, now) {
  const level = infernoLevel(state, now);
  if (!level) return;
  const top = -extraTop;
  const span = H - top;
  ctx.save();
  ctx.lineCap = 'round';
  // A flying dog has the flight's wind lines (set alight) instead: one set of lines.
  for (let i = 0; i < (state.dog.flying ? 0 : SPEED_LINES); i++) {
    const speed = 1.4 + hash01(i) * 1.2;            // px per ms
    const len = 40 + hash01(i + 0.3) * 70;
    const x = W + 100 - ((now * speed + hash01(i + 0.6) * 4000) % (W + 300));
    const y = top + 10 + hash01(i + 0.9) * (span - 40);
    ctx.globalAlpha = 0.22 * level;
    ctx.strokeStyle = i % 3 ? '#FFFFFF' : '#FFD08A';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len, y);
    ctx.stroke();
  }
  for (let i = 0; i < EMBERS; i++) {
    const speed = 0.12 + hash01(i + 1.7) * 0.18;     // px per ms, leftward and up
    const x = W + 20 - ((now * speed * 1.6 + hash01(i + 2.1) * 3000) % (W + 40));
    const y = H - ((now * speed * 0.5 + hash01(i + 2.5) * 2000) % span);
    ctx.globalAlpha = level * (0.5 + 0.5 * Math.sin(now * 0.02 + i * 3.1));
    ctx.fillStyle = i % 2 ? '#FFC23A' : '#FF6A1A';
    ctx.fillRect(x, y, 2, 2);
  }
  ctx.restore();
}

// --- The score's fire ---

// From the drop, with the music, flames rise from the score so the player
// sees why the music changed. The fire is a speedometer from there: it
// catches small, then grows taller, hotter, and thicker with embers as speed
// climbs, and at MAX_SPEED burns white-hot at the core. It flares as it
// catches and again as it maxes out.
const FLAME_LAYERS = [  // outside in; colors go from `cool` (catching) to `hot` (max speed)
  { cool: '#D63014', hot: '#FF7A18', alpha: 0.85, height: 1, width: 1 },
  { cool: '#FF8018', hot: '#FFC83A', alpha: 0.9, height: 0.72, width: 0.7 },
  { cool: '#FFDC5A', hot: '#FFF6D0', alpha: 0.95, height: 0.42, width: 0.42 },
];
const FLAME_CORE = { cool: '#FFFFFF', hot: '#FFFFFF', alpha: 0.95, height: 0.7, width: 0.26 };  // max speed only: white-hot, tall enough to rise above the digits
const FLAME_HEIGHT = { catching: 26, max: 40 };  // px above the base, at full flicker
const FLAME_EMBERS = { catching: 5, max: 14 };
const FLAME_SPACING = 7;     // px between tongues
const FLAME_FLARE_POINTS = 60;  // the flare at max speed dies down over this many points (the catch's, over the drop)
const FLAME_OUTLINE = 'rgba(70, 14, 0, 0.7)';  // around the outer tongues, so the fire reads on any sky

// Speed is a fixed function of score, so the score where it maxes out is too.
const MAX_SPEED_AT = (MAX_SPEED - INITIAL_SPEED) / SPEED_INCREMENT;
const flareAfter = (score, at) => 0.7 * Math.max(0, 1 - (score - at) / FLAME_FLARE_POINTS) * (score >= at);
const flareSince = (now, at) => 0.7 * Math.max(0, 1 - (now - at) / FRENZY_DROP_MS);

// Draws the fire under the score spanning left..right, while the frenzy
// burns; true when it drew (the HUD then outlines the digits).
export function drawScoreFire(ctx, left, right, baseY, state, now) {
  if (!blazing(state)) return false;
  const startSpeed = Math.min(MAX_SPEED, INITIAL_SPEED + FRENZY_AT * SPEED_INCREMENT);
  const heat = Math.min(1, Math.max(0, (state.speed - startSpeed) / (MAX_SPEED - startSpeed || 1)));
  const maxed = state.speed >= MAX_SPEED;
  const flare = 1 + Math.max(flareSince(now, state.frenzyAt), flareAfter(state.score, MAX_SPEED_AT));
  const height = FLAME_HEIGHT.catching + (FLAME_HEIGHT.max - FLAME_HEIGHT.catching) * heat;
  const tongues = Math.max(2, Math.round((right - left) / FLAME_SPACING) + 1);
  ctx.save();
  for (const layer of maxed ? [...FLAME_LAYERS, FLAME_CORE] : FLAME_LAYERS) {
    ctx.fillStyle = lerpColor(layer.cool, layer.hot, heat);
    ctx.globalAlpha = layer.alpha;
    for (let j = 0; j < tongues; j++) {
      const x = left + (j / (tongues - 1)) * (right - left);
      const flicker = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(now * 0.011 + j * 1.7)) * (0.6 + 0.4 * Math.sin(now * 0.019 + j * 2.9));
      const h = height * flare * flicker * (0.75 + 0.25 * hash01(j)) * layer.height;
      const w = 6.5 * layer.width;
      const sway = Math.sin(now * 0.007 + j * 1.3) * 2.5;
      tongue(ctx, x, baseY, h, w, sway, layer === FLAME_LAYERS[0] ? FLAME_OUTLINE : null);
    }
  }
  // Embers drifting up off the fire, more as it heats up
  const embers = Math.round(FLAME_EMBERS.catching + (FLAME_EMBERS.max - FLAME_EMBERS.catching) * heat);
  for (let k = 0; k < embers; k++) {
    const period = 900 + k * 137;
    const t = (now / period + hash01(k + 0.5)) % 1;
    ctx.globalAlpha = 1 - t;
    ctx.fillStyle = k % 2 ? '#FFD45A' : '#FF8A2A';
    ctx.fillRect(left + hash01(k + 0.25) * (right - left) + Math.sin(now * 0.004 + k) * 3, baseY - 12 - t * height * 0.8 * flare, 2, 2);
  }
  ctx.restore();
  return true;
}
