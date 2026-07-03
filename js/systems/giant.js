// Giant mode lifecycle: triggered by eating a golden hot dog; scales the dog,
// switches music, doubles score, and makes obstacles edible.

import {
  GIANT_SCALE, GIANT_SCALE_TRANSITION, GIANT_SCORE_MULTIPLIER,
} from '../config.js';

export function activateGiantMode(state, { sfx, music }, now = performance.now()) {
  state.giantActive = true;
  state.giantStartTime = now;
  state.giantGrowing = true;
  state.giantShrinking = false;
  state.giantTransitionStart = now;
  state.giantScoreMultiplier = GIANT_SCORE_MULTIPLIER;
  sfx.playGiantActivate();
  if (music.isOn()) music.switchToGiant();
}

export function deactivateGiantMode(state, { sfx, music }, now = performance.now()) {
  state.giantActive = false;
  state.giantShrinking = true;
  state.giantGrowing = false;
  state.giantTransitionStart = now;
  state.giantScoreMultiplier = 1;
  sfx.playGiantDeactivate();
  if (music.isGiantActive()) music.switchToNormal();
}

// Current visual scale of the dog, easing through grow/shrink transitions.
// Clears the growing/shrinking flags when a transition completes.
export function getGiantVisualScale(state, now = performance.now()) {
  if (state.giantGrowing) {
    const t = Math.min(1, (now - state.giantTransitionStart) / GIANT_SCALE_TRANSITION);
    const eased = t * (2 - t); // ease-out
    if (t >= 1) state.giantGrowing = false;
    return 1 + (GIANT_SCALE - 1) * eased;
  }
  if (state.giantShrinking) {
    const t = Math.min(1, (now - state.giantTransitionStart) / GIANT_SCALE_TRANSITION);
    const eased = t * (2 - t);
    if (t >= 1) state.giantShrinking = false;
    return GIANT_SCALE - (GIANT_SCALE - 1) * eased;
  }
  if (state.giantActive) return GIANT_SCALE;
  return 1;
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
    vx: 3 + rng() * 2,
    vy: -6 - rng() * 3,
    rotation: 0,
    rotSpeed: 0.3 + rng() * 0.3,
    startTime: now,
    type: obs.type,
  });
}
