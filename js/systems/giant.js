// Giant mode lifecycle: triggered by eating a golden hot dog; scales the dog,
// switches music, multiplies score, and makes obstacles edible. Hot dogs and
// towers are eaten automatically; birds and frisbees turn into bones, and
// bones fetched in a row pay more (a bone that gets past breaks the streak).

import {
  GIANT_SCALE, GIANT_SCALE_TRANSITION, GIANT_SCORE_MULTIPLIER, GIANT_END_INVULN, GIANT_PIVOT_Y,
  GIANT_EAT_BONUS, GIANT_BONE_POINTS, GIANT_STREAK_MAX, GIANT_ROUND, DOG_SPRITE_ANCHOR,
} from '../config.js';
import { isChaseActive } from './chase.js';
import { OBSTACLE_TYPES } from './obstacleTypes.js';
import { addEffect } from './effects.js';

// Giant mode runs off → growing → active → shrinking → off. Growing counts
// as giant (score multiplier, edible obstacles, bigger hitbox).
export const isGiant = state => state.giantPhase === 'growing' || state.giantPhase === 'active';

// The point the giant dog is scaled about, under its feet: draw.js scales
// the sprite about it and getDogHitbox the hitbox, so the two stay together.
export const giantPivot = dog => ({ x: dog.x + dog.width * DOG_SPRITE_ANCHOR, y: GIANT_PIVOT_Y });

export function giantScoreMultiplier(state) {
  return isGiant(state) ? GIANT_SCORE_MULTIPLIER : 1;
}

export function activateGiantMode(state, { sfx, music }, now = performance.now()) {
  state.giantPhase = 'growing';
  state.giantStartTime = now;
  state.giantTransitionStart = now;
  state.giantStreak = 0;
  state.giantFeast = 0;
  state.giantPatternIn = 0;
  state.giantLastPattern = null;
  state.giantPatternsLeft = { ...GIANT_ROUND };  // the bone round's patterns (giantBones.js)
  sfx.playGiantActivate();
  if (music.isOn()) music.switchToGiant();
}

export function deactivateGiantMode(state, { sfx, music }, now = performance.now()) {
  state.giantPhase = 'shrinking';
  state.giantTransitionStart = now;
  // One giant mode earns more than GIANT_COOLDOWN, so the cooldown counts from here.
  state.lastGoldenScore = state.score;
  if (state.giantFeast > 0) addEffect(state, 'giantFeast', now, { points: state.giantFeast });
  // Grace period: the shrink can land the dog inside an obstacle the player
  // meant to eat, so reuse the post-hit i-frames instead of killing them.
  state.invulnUntil = Math.max(state.invulnUntil, now + GIANT_END_INVULN);
  sfx.playGiantDeactivate();
  if (music.isGiantActive()) music.switchToNormal();
}

// Ends a grow or shrink once its GIANT_SCALE_TRANSITION has run. Called at
// the end of each update(), after the frame's gameplay.
export function finishGiantTransition(state, now) {
  const transitioning = state.giantPhase === 'growing' || state.giantPhase === 'shrinking';
  if (!transitioning || now - state.giantTransitionStart < GIANT_SCALE_TRANSITION) return;
  state.giantPhase = state.giantPhase === 'growing' ? 'active' : 'off';
}

// Current visual scale of the dog, easing out through grow/shrink transitions.
export function getGiantVisualScale(state, now = performance.now()) {
  const t = Math.min(1, (now - state.giantTransitionStart) / GIANT_SCALE_TRANSITION);
  const eased = t * (2 - t);
  switch (state.giantPhase) {
    case 'growing': return 1 + (GIANT_SCALE - 1) * eased;
    case 'shrinking': return GIANT_SCALE - (GIANT_SCALE - 1) * eased;
    case 'active': return GIANT_SCALE;
    default: return 1;
  }
}

// The streak level a bone is paid at: 1 up to GIANT_STREAK_MAX.
export const giantStreakLevel = state => Math.min(state.giantStreak, GIANT_STREAK_MAX);

// Points for an eaten obstacle or a fetched bone, popped up where it was
// (the 'chomp' effect also starts the dog's bite pose).
function award(state, obs, points, now, level) {
  state.score += points;
  state.giantFeast += points;
  addEffect(state, 'chomp', now, { x: obs.x + obs.width / 2, y: obs.y, points, level });
}

export function giantEat(state, obs, now = performance.now()) {
  award(state, obs, GIANT_EAT_BONUS, now, 0);
}

export function fetchBone(state, obs, now = performance.now()) {
  state.giantStreak++;
  const level = giantStreakLevel(state);
  award(state, obs, GIANT_BONE_POINTS * level, now, level);
}

// A bone: the bone round's own, or a bird or frisbee while the dog is giant.
export function isBone(obs) {
  const def = OBSTACLE_TYPES[obs.type];
  return def?.collect === 'bone' || def?.giant === 'fetch';
}

// A bone the giant dog let past (its right edge behind `dogLeft`) breaks the streak.
export function missPassedBones(state, dogLeft) {
  for (const o of state.obstacles) {
    if (o.missed || !isBone(o) || o.x + o.width >= dogLeft) continue;
    o.missed = true;
    state.giantStreak = 0;
  }
}

// The obstacle flies off keeping its look (type + skin) — see the 'bonk' effect.
export function triggerBonkEffect(state, obs, now = performance.now(), rng = Math.random) {
  addEffect(state, 'bonk', now, {
    x: obs.x,
    y: obs.y,
    width: obs.width,
    height: obs.height,
    vx: 3 + rng() * 2,
    vy: -6 - rng() * 3,
    rotation: 0,
    rotSpeed: 0.3 + rng() * 0.3,
    type: obs.type,
    skin: obs.skin ?? (isChaseActive(state) ? 'chase' : 'normal'),
  });
}
