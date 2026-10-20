// Collision: dog hitbox math + the effectful resolution pass (eat/bonk in
// giant mode, golden pickup, heart loss, or death).

import {
  GIANT_SCALE, GIANT_EAT_BONUS, GIANT_BONK_BONUS, HEART_HIT_INVULN,
  DOG_HITBOX_STAND, DOG_HITBOX_DUCK,
} from '../config.js';
import { activateGiantMode, triggerChompEffect, triggerBonkEffect } from './giant.js';
import { OBSTACLE_TYPES, getObstacleHitbox } from './obstacleTypes.js';

export { getObstacleHitbox };

// Ducking lowers the profile (frisbees pass over); giant mode expands it.
export function getDogHitbox(dog, giantActive) {
  const box = dog.ducking ? DOG_HITBOX_DUCK : DOG_HITBOX_STAND;
  let dx = dog.x + box.dx;
  let dy = dog.y + box.dy;
  let dw = box.w;
  let dh = box.h;

  if (giantActive) {
    const expansion = (GIANT_SCALE - 1) * 0.5;
    dx -= dw * expansion * 0.5;
    dy -= dh * expansion;
    dw *= (1 + expansion);
    dh *= (1 + expansion);
  }
  return { x: dx, y: dy, w: dw, h: dh };
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Spends a heart and starts the post-hit i-frames. False when it was the last one.
function spendHeart(state, services, now) {
  state.hearts--;
  if (state.hearts <= 0) return false;
  state.heartLostAt = now;
  state.invulnUntil = now + HEART_HIT_INVULN;
  services.sfx.playBonk();
  return true;
}

// Walk obstacles, resolving overlaps by each type's contact rule
// (OBSTACLE_TYPES). Returns true if the dog died.
export function checkCollision(state, services, now = performance.now()) {
  const dogBox = getDogHitbox(state.dog, state.giantActive);

  for (let i = state.obstacles.length - 1; i >= 0; i--) {
    const obs = state.obstacles[i];
    if (!rectsOverlap(dogBox, getObstacleHitbox(obs))) continue;
    const def = OBSTACLE_TYPES[obs.type];

    if (def.contact === 'pickup') {
      activateGiantMode(state, services, now);
      state.obstacles.splice(i, 1);
    } else if (def.contact === 'terrain') {
      // A rising dog (fresh jump or trampoline bounce) is leaving the
      // terrain: the bounce must win over a same-frame overlap at the
      // island edge, and a grazing upward arc shouldn't count either.
      if (state.dog.vy < 0 || now < state.invulnUntil) continue;
      if (!spendHeart(state, services, now)) return true;
    } else if (def.contact === 'hazard') {
      if (state.giantActive) {
        if (def.giant === 'bonk') {
          triggerBonkEffect(state, obs, now);
          services.sfx.playBonk();
          state.score += GIANT_BONK_BONUS;
        } else {
          triggerChompEffect(state, obs, now);
          services.sfx.playCrunch();
          state.score += GIANT_EAT_BONUS;
        }
        state.obstacles.splice(i, 1);
        continue;
      }
      if (now < state.invulnUntil) continue;
      if (!spendHeart(state, services, now)) return true;
      triggerBonkEffect(state, obs, now);
      state.obstacles.splice(i, 1);
    }
  }
  return false;
}
