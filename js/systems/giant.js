// Giant mode lifecycle: triggered by eating a golden hot dog; scales the dog,
// switches music, multiplies score, and makes obstacles edible.

import {
  GIANT_SCALE, GIANT_SCALE_TRANSITION, GIANT_SCORE_MULTIPLIER, GIANT_END_INVULN,
} from '../config.js';
import { isChaseActive } from './chase.js';

// Giant mode runs off → growing → active → shrinking → off. Growing counts
// as giant (score multiplier, edible obstacles, bigger hitbox).
export const isGiant = state => state.giantPhase === 'growing' || state.giantPhase === 'active';

export function giantScoreMultiplier(state) {
  return isGiant(state) ? GIANT_SCORE_MULTIPLIER : 1;
}

export function activateGiantMode(state, { sfx, music }, now = performance.now()) {
  state.giantPhase = 'growing';
  state.giantStartTime = now;
  state.giantTransitionStart = now;
  sfx.playGiantActivate();
  if (music.isOn()) music.switchToGiant();
}

export function deactivateGiantMode(state, { sfx, music }, now = performance.now()) {
  state.giantPhase = 'shrinking';
  state.giantTransitionStart = now;
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

export function triggerChompEffect(state, obs, now = performance.now()) {
  state.giantChompEffects.push({
    x: obs.x,
    y: obs.y,
    startTime: now,
  });
}

export function triggerBonkEffect(state, obs, now = performance.now(), rng = Math.random) {
  state.giantBonkEffects.push({
    x: obs.x,
    y: obs.y,
    width: obs.width,
    height: obs.height,
    vx: 3 + rng() * 2,
    vy: -6 - rng() * 3,
    rotation: 0,
    rotSpeed: 0.3 + rng() * 0.3,
    startTime: now,
    type: obs.type,
    skin: obs.skin ?? (isChaseActive(state) ? 'chase' : 'normal'),
  });
}
