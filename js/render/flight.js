// The flight scene's looks: the Hero Cape pickup (and the cape
// the flying dog wears), wind streaks rushing past the dog, its float bob,
// the SUPER DOG! call, and each run's first ↑ ↓ hint.

import { GROUND_Y, FLIGHT_CALL_MS, CAPE_AWAY_MS } from '../config.js';
import { inScene } from '../systems/encounters.js';
import { drawPopupText, roundRect } from './primitives.js';

const FLIGHT_CAPE_ID = 'cape-hero';  // the body outfit worn while flying
const CAPE_COLORS = { body: '#2F4FC8', fold: '#1E3590', outline: '#142466', gold: '#F2C230' };
const HINT = { text: '↑ ↓', keys: 'to fly up and down!', touch: 'tap right to rise, left to dive!' };

const BOB_PX = 2.5;             // float bob amplitude
const BOB_SPEED = 0.0045;       // radians per ms
const BOB_FADE_NEAR_GROUND = 30;  // the bob fades out over the last stretch of the landing

const STREAK_PERIOD_MS = 520;   // time for one streak to sweep from mid-body to past the tail
const STREAK_TRAVEL = 140;      // how far a streak sweeps (logical units)
const STREAK_START_DX = 50;     // where a streak starts, from dog.x: mid-body, behind the sprite
// Each streak: height relative to dog.y, length, phase offset (0–1), width.
const STREAKS = [
  { dy: -16, len: 26, phase: 0.00, w: 1.6 },
  { dy: -6, len: 18, phase: 0.55, w: 1.2 },
  { dy: 2, len: 34, phase: 0.25, w: 2.0 },
  { dy: 10, len: 22, phase: 0.80, w: 1.4 },
  { dy: 18, len: 28, phase: 0.40, w: 1.6 },
  { dy: -24, len: 16, phase: 0.68, w: 1.0 },
];

// Streaks sweep from behind the dog's middle to well past its tail, fading
// in and out, with a slight wobble so they read as moving air.
export function drawFlightWind(ctx, state, now) {
  const dog = state.dog;
  if (!dog.flying) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#FFFFFF';
  for (const s of STREAKS) {
    const t = (now / STREAK_PERIOD_MS + s.phase) % 1;
    const x = dog.x + STREAK_START_DX - t * STREAK_TRAVEL;
    const y = dog.y + s.dy + Math.sin(now * 0.006 + s.phase * 9) * 1.5;
    ctx.globalAlpha = 0.75 * Math.sin(Math.PI * t);
    ctx.lineWidth = s.w;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + s.len, y);
    ctx.stroke();
  }
  ctx.restore();
}

// How far the flying dog is drawn off its y as it floats up and down.
export function flightBobOffset(dog, now) {
  if (!dog.flying) return 0;
  const height = Math.max(0, Math.min(1, (GROUND_Y - dog.y) / BOB_FADE_NEAR_GROUND));
  return Math.sin(now * BOB_SPEED) * BOB_PX * height;
}

// The Hero Cape (matching the outfit's icon): blue, widening to a gold zigzag
// hem that ripples with `flutter` (radians), with a gold clasp at the top.
export function drawCape(ctx, cx, top, w, h, flutter) {
  const bottom = top + h;
  const halfTop = w * 0.22;
  const zigs = 5;
  const hem = [];
  for (let i = 0; i <= zigs * 2; i++) {
    const f = i / (zigs * 2);
    const wave = Math.sin(flutter + f * 5) * w * 0.05;
    hem.push([cx + w / 2 - f * w + wave, bottom - (i % 2 ? h * 0.12 : 0)]);
  }
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - halfTop, top);
  ctx.lineTo(cx + halfTop, top);
  hem.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fillStyle = CAPE_COLORS.body;
  ctx.fill();
  ctx.strokeStyle = CAPE_COLORS.fold;
  ctx.lineWidth = 1.5;
  for (const t of [-0.35, 0.35]) {
    ctx.beginPath();
    ctx.moveTo(cx + t * halfTop * 2, top + h * 0.12);
    ctx.lineTo(cx + t * w * 0.6, bottom - h * 0.2);
    ctx.stroke();
  }
  ctx.strokeStyle = CAPE_COLORS.gold;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  hem.forEach(([x, y], i) => (i ? ctx.lineTo(x, y - 2) : ctx.moveTo(x, y - 2)));
  ctx.stroke();
  ctx.strokeStyle = CAPE_COLORS.outline;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - halfTop, top);
  ctx.lineTo(cx + halfTop, top);
  hem.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.stroke();
  ctx.fillStyle = CAPE_COLORS.gold;
  ctx.beginPath();
  ctx.arc(cx, top, w * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// The pickup: a cape bobbing in a pulsing golden glow.
export const FLIGHT_LOOKS = {
  cape: {
    normal(ctx, o, { now }) {
      const cx = o.x + o.width / 2;
      const cy = o.y + o.height / 2 + Math.sin(now * 0.005) * 2;
      const pulse = 0.75 + 0.25 * Math.sin(now * 0.008);
      const glow = ctx.createRadialGradient(cx, cy, 2, cx, cy, o.width * 0.95);
      glow.addColorStop(0, `rgba(255, 215, 0, ${0.55 * pulse})`);
      glow.addColorStop(1, 'rgba(255, 215, 0, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - o.width, cy - o.height, o.width * 2, o.height * 2);
      drawCape(ctx, cx, cy - o.height * 0.4, o.width * 0.9, o.height * 0.85, now * 0.01);
    },
  },
};

export const FLIGHT_EFFECT_DRAWERS = {
  // Rides along above the rising dog.
  flightCall(ctx, e, { now, dog }) {
    const age = (now - e.startTime) / FLIGHT_CALL_MS;
    drawPopupText(ctx, 'SUPER DOG!', dog.x + 50, dog.y - 30 - age * 25, { color: '#FFD700', size: 18 + age * 6, alpha: 1 - age * age });
  },
  capeAway(ctx, e, { now }) {
    const age = (now - e.startTime) / CAPE_AWAY_MS;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - age);
    ctx.translate(e.x, e.y);
    ctx.rotate(e.rotation);
    drawCape(ctx, 0, -12, 24, 24, now * 0.012);
    ctx.restore();
  },
};

// The cosmetics to draw the dog with: the Hero Cape stands in for its outfit while it flies.
export function withFlightCape(cosmetics, dog) {
  if (!dog.flying) return cosmetics;
  return { ...cosmetics, equipped: { ...cosmetics.equipped, body: FLIGHT_CAPE_ID } };
}

// Each run's first flight: ↑ ↓ flashing above the dog until its first lane
// change. Drawn behind the obstacles so it never hides a bird.
export function drawFlightHint(ctx, state, now) {
  if (!state.flightHintPending || !inScene(state, 'flight', 'active')) return;
  const cx = state.dog.x + 60;
  const cy = state.dog.y - 42;
  const flash = Math.sin(now * 0.012) > 0 ? 1 : 0.55;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  roundRect(ctx, cx - 85, cy - 26, 170, 46, 8);
  drawPopupText(ctx, HINT.text, cx, cy, { color: '#FFD700', size: 26, alpha: flash });
  drawPopupText(ctx, HINT[state.touchDevice ? 'touch' : 'keys'], cx, cy + 14, { color: '#fff', size: 10, alpha: 1 });
}
