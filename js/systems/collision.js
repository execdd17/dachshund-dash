// Collision: dog hitbox math + the effectful resolution pass (eat/bonk in
// giant mode, pickups, heart loss, or death).

import {
  GIANT_SCALE, GIANT_EAT_BONUS, GIANT_BONK_BONUS,
  DOG_HITBOX_STAND, DOG_HITBOX_DUCK, DOG_HITBOX_RUN_REAR, TUNNEL_DEPTH,
} from '../config.js';
import { activateGiantMode, triggerChompEffect, triggerBonkEffect, isGiant } from './giant.js';
import { spendHeart, gainHeart } from './hearts.js';
import { addEffect } from './effects.js';
import { OBSTACLE_TYPES, getObstacleHitbox } from './obstacleTypes.js';

export { getObstacleHitbox };

// Ducking lowers the profile (frisbees pass over); giant mode expands it.
export function getDogHitbox(dog, giant) {
  const box = dog.ducking ? DOG_HITBOX_DUCK : DOG_HITBOX_STAND;
  let dx = dog.x + box.dx;
  let dy = dog.y + box.dy;
  let dw = box.w;
  let dh = box.h;

  if (giant) {
    const expansion = (GIANT_SCALE - 1) * 0.5;
    dx -= dw * expansion * 0.5;
    dy -= dh * expansion;
    dw *= (1 + expansion);
    dh *= (1 + expansion);
  }
  return { x: dx, y: dy, w: dw, h: dh };
}

// The boxes that collide with obstacles. Running on the ground, the standing
// box's rear is lowered to the back line (DOG_HITBOX_RUN_REAR); ducking,
// airborne, and giant poses use their one box. In the tunnel the dog crawls
// (always ducking) TUNNEL_DEPTH below the path, under every surface hitbox.
export function getDogHurtboxes(dog, giant) {
  const box = getDogHitbox(dog, giant);
  if (dog.underground) return [{ ...box, y: box.y + TUNNEL_DEPTH }];
  if (giant || dog.ducking || dog.jumping) return [box];
  const rearW = DOG_HITBOX_RUN_REAR.w;
  const backLine = dog.y + DOG_HITBOX_RUN_REAR.dy;
  return [
    { x: box.x, y: backLine, w: rearW, h: box.y + box.h - backLine },  // back, hips
    { x: box.x + rearW, y: box.y, w: box.w - rearW, h: box.h },         // shoulders, head
  ];
}

export function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// What each pickup's `collect` rule (OBSTACLE_TYPES) does when touched.
export const COLLECT_ACTIONS = {
  giant: (state, obs, services, now) => activateGiantMode(state, services, now),
  heart: (state, obs, services, now) => gainHeart(state, services, now, { x: obs.x + obs.width / 2, y: obs.y }),
  points: (state, obs, services, now) => {
    const { points } = OBSTACLE_TYPES[obs.type];
    state.score += points;
    addEffect(state, 'pointsPickup', now, { x: obs.x + obs.width / 2, y: obs.y, points });
    services.sfx.playTreat();
  },
};

// Walk obstacles, resolving overlaps by each type's contact rule
// (OBSTACLE_TYPES). Returns true if the dog died.
export function checkCollision(state, services, now = performance.now()) {
  const dogBoxes = getDogHurtboxes(state.dog, isGiant(state));

  for (let i = state.obstacles.length - 1; i >= 0; i--) {
    const obs = state.obstacles[i];
    const obsBox = getObstacleHitbox(obs);
    if (!dogBoxes.some(box => rectsOverlap(box, obsBox))) continue;
    const def = OBSTACLE_TYPES[obs.type];

    if (def.contact === 'pickup') {
      COLLECT_ACTIONS[def.collect](state, obs, services, now);
      state.obstacles.splice(i, 1);
    } else if (def.contact === 'terrain') {
      // A rising dog (fresh jump or trampoline bounce) is leaving the
      // terrain: the bounce must win over a same-frame overlap at the
      // island edge, and a grazing upward arc shouldn't count either.
      if (state.dog.vy < 0 || now < state.invulnUntil) continue;
      if (!spendHeart(state, services, now)) return true;
    } else if (def.contact === 'hazard') {
      // Tutorial practice obstacles (systems/tutorial.js) never cost a heart:
      // knocked away and marked, so the step can repeat.
      if (obs.practice) {
        obs.hit = true;
        triggerBonkEffect(state, obs, now);
        services.sfx.playBonk();
        state.obstacles.splice(i, 1);
        continue;
      }
      if (isGiant(state)) {
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
