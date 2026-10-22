// Transient visual effects: the state.effects popups and knocked-away
// obstacles, plus landing dust particles.

import {
  W, BIRD_JUMP_BONUS, TRAMP_BOUNCE_BONUS, HEART_FULL_BONUS, CHOMP_EFFECT_MS, BONK_EFFECT_MS, BONK_TEXT_MS, SCORE_POPUP_MS,
  GIANT_FEAST_MS,
} from '../config.js';
import { drawPopupText, drawSparkle } from './primitives.js';
import { drawObstacleLook } from './obstacles.js';
import { FLIGHT_EFFECT_DRAWERS } from './flight.js';
import { FRENZY_EFFECT_DRAWERS } from './frenzy.js';

// A knocked-away obstacle keeps the look it had on the field (birds keep flapping).
function drawBonkedObstacle(ctx, e, frameCount, sprites) {
  const skin = e.skin === 'chase' ? 'chase' : 'normal';
  drawObstacleLook(ctx, e, skin, { frameCount, sprites, acornY: e.y - 8 });
}

const drawScorePopup = (text, color) => (ctx, e, { now }) => {
  const age = (now - e.startTime) / SCORE_POPUP_MS;
  if (age > 1) return;
  drawPopupText(ctx, text, e.x, e.y - 5 - age * 30, { color, size: 12 + age * 6, alpha: 1 - age });
};

// Giant-mode points popups by streak level (0: food).
const GIANT_TEXT_OUTLINE = '#3A2614';
const GIANT_POINTS_LOOK = [
  { color: '#FFD700', size: 14 },
  { color: '#FFFFFF', size: 14 },
  { color: '#8FE3FF', size: 16 },
  { color: '#FF9A3C', size: 18 },
];

// One draw function per effect kind (systems/effects.js), in draw order.
export const EFFECT_DRAWERS = {
  // Giant mode's points where the food or bone was: crumbs for food, a
  // sparkle for a bone, its color and size climbing with the streak.
  chomp(ctx, e, { now }) {
    const age = (now - e.startTime) / CHOMP_EFFECT_MS;
    if (age > 1) return;
    const { color, size } = GIANT_POINTS_LOOK[e.level ?? 0];
    ctx.save();
    ctx.globalAlpha = 1 - age;
    drawPopupText(ctx, `+${e.points}`, e.x, e.y - 10 - age * 20, { color, size: size + age * 8, alpha: 1 - age, outline: GIANT_TEXT_OUTLINE });
    if (e.level) {
      drawSparkle(ctx, e.x, e.y + 14, 6 + age * 8);
    } else {
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + age * 2;
        const dist = age * 20;
        ctx.fillStyle = ['#D4951A', '#D94438', '#F5D000'][i % 3];
        ctx.beginPath();
        ctx.arc(e.x + Math.cos(angle) * dist, e.y + 11 + Math.sin(angle) * dist, 2 - age, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  },
  // Giant mode's bonus points, tallied as it ends.
  giantFeast(ctx, e, { now }) {
    const age = (now - e.startTime) / GIANT_FEAST_MS;
    if (age > 1) return;
    const alpha = Math.min(1, (1 - age) / 0.3);
    drawPopupText(ctx, 'GIANT FEAST!', W / 2, 70 - age * 10, { color: '#FFD700', size: 20, alpha, outline: GIANT_TEXT_OUTLINE });
    drawPopupText(ctx, `+${e.points}`, W / 2, 92 - age * 10, { color: '#fff', size: 18, alpha, outline: GIANT_TEXT_OUTLINE });
  },
  bonk(ctx, e, { now, frameCount, sprites }) {
    const age = (now - e.startTime) / BONK_EFFECT_MS;
    if (age > 1) return;
    const cx = e.x + e.width / 2;
    const cy = e.y + e.height / 2;
    ctx.save();
    ctx.globalAlpha = 1 - age * 0.7;
    ctx.translate(cx, cy);
    ctx.rotate(e.rotation);
    ctx.translate(-cx, -cy);
    drawBonkedObstacle(ctx, e, frameCount, sprites);
    ctx.restore();
    const textAge = (now - e.startTime) / BONK_TEXT_MS;
    if (textAge < 1) {
      drawPopupText(ctx, 'BONK!', cx, e.y - 15 - age * 30, { color: '#FF69B4', size: 12 + age * 15, alpha: 1 - textAge });
    }
  },
  birdJump: drawScorePopup('NICE! +' + BIRD_JUMP_BONUS, '#3B7DD8'),
  trampBounce: drawScorePopup('BOING! +' + TRAMP_BOUNCE_BONUS, '#7A4FBF'),
  heartGain: drawScorePopup('+1 HEART!', '#FF4D6D'),
  heartBonus: drawScorePopup('FULL! +' + HEART_FULL_BONUS, '#FF4D6D'),
  pointsPickup: (ctx, e, view) => drawScorePopup('+' + e.points, '#E08A1E')(ctx, e, view),
  ...FLIGHT_EFFECT_DRAWERS,
  ...FRENZY_EFFECT_DRAWERS,
};

export function drawEffects(ctx, state, sprites, now = performance.now()) {
  const view = { now, frameCount: state.frameCount, sprites, dog: state.dog };
  for (const [kind, drawEffect] of Object.entries(EFFECT_DRAWERS)) {
    for (const e of state.effects) if (e.kind === kind) drawEffect(ctx, e, view);
  }
}

// Dust: a tiny rainbow burst on landing, or (with `color` and `size`) dirt
// clods thrown up by the tunnel's holes.
export function drawLandingParticles(ctx, state) {
  state.landingParticles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color ?? `hsla(${p.hue}, 85%, 65%, 0.9)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, (p.size ?? 1.5) + (1 - p.life) * 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}
