// Collision: pure hitbox math + the effectful resolution pass (eat/bonk in
// giant mode, golden pickup, or death).

import {
  GIANT_SCALE, GIANT_EAT_BONUS, GIANT_BONK_BONUS, HEART_HIT_INVULN,
} from '../config.js';
import { activateGiantMode, triggerChompEffect, triggerBonkEffect } from './giant.js';

// Dog hitbox changes when ducking (lower profile avoids frisbees);
// when giant, it expands proportionally.
export function getDogHitbox(dog, giantActive) {
  let dx, dy, dw, dh;
  if (dog.ducking) {
    dx = dog.x + 23;
    dy = dog.y + 10;
    dw = 50;
    dh = 8;
  } else {
    dx = dog.x + 23;
    dy = dog.y - 8;
    dw = 50;
    dh = 22;
  }

  if (giantActive) {
    const expansion = (GIANT_SCALE - 1) * 0.5;
    dx -= dw * expansion * 0.5;
    dy -= dh * expansion;
    dw *= (1 + expansion);
    dh *= (1 + expansion);
  }
  return { x: dx, y: dy, w: dw, h: dh };
}

export function getObstacleHitbox(obs) {
  if (obs.type === 'frisbee' || obs.type === 'bird') {
    return { x: obs.x + 6, y: obs.y + 2, w: obs.width - 12, h: obs.height - 4 };
  }
  if (obs.type === 'stack') {
    return { x: obs.x + 8, y: obs.y + 4, w: obs.width - 16, h: obs.height - 6 };
  }
  return { x: obs.x + 12, y: obs.y + 8, w: obs.width - 24, h: obs.height - 10 };
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Walk obstacles, resolving overlaps. Returns true if the dog died.
export function checkCollision(state, services, now = performance.now()) {
  const dogBox = getDogHitbox(state.dog, state.giantActive);

  for (let i = state.obstacles.length - 1; i >= 0; i--) {
    const obs = state.obstacles[i];
    if (rectsOverlap(dogBox, getObstacleHitbox(obs))) {
      // Golden hot dog: activate giant mode
      if (obs.type === 'golden') {
        activateGiantMode(state, services);
        state.obstacles.splice(i, 1);
        continue;
      }

      // Giant mode: eat or bonk
      if (state.giantActive) {
        if (obs.type === 'frisbee' || obs.type === 'bird') {
          triggerBonkEffect(state, obs);
          services.sfx.playBonk();
          state.score += GIANT_BONK_BONUS;
        } else {
          triggerChompEffect(state, obs);
          services.sfx.playCrunch();
          state.score += GIANT_EAT_BONUS;
        }
        state.obstacles.splice(i, 1);
        continue;
      }

      // Post-hit invulnerability: pass through unharmed
      if (now < state.invulnUntil) continue;

      // Normal collision: spend a heart, knock the obstacle away, and keep
      // running behind brief i-frames — until the last heart is gone.
      state.hearts--;
      if (state.hearts > 0) {
        state.heartLostAt = now;
        state.invulnUntil = now + HEART_HIT_INVULN;
        triggerBonkEffect(state, obs, now);
        services.sfx.playBonk();
        state.obstacles.splice(i, 1);
        continue;
      }
      return true;
    }
  }
  return false;
}
