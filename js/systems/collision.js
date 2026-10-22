// Collision: dog hitbox math + the effectful resolution pass (eat/bonk in
// giant mode, pickups, heart loss, or death).

import {
  GROUND_Y, GIANT_SCALE, BONE_POINTS,
  DOG_HITBOX_STAND, DOG_HITBOX_DUCK, DOG_HITBOX_RUN_REAR, TUNNEL_DEPTH,
} from '../config.js';
import { activateGiantMode, giantEat, fetchBone, giantPivot, triggerBonkEffect, isGiant } from './giant.js';
import { spendHeart, gainHeart } from './hearts.js';
import { addEffect } from './effects.js';
import { grabCape } from './flight.js';
import { OBSTACLE_TYPES, getObstacleHitbox } from './obstacleTypes.js';

export { getObstacleHitbox };

// Ducking lowers the profile (frisbees pass over). The giant dog's box is
// the standing box scaled like the sprite, about giantPivot, and reaches
// down to its drawn feet so it still eats hot dogs. Scaling about a point
// under the feet doubles a jump's height on screen; the box rises with it.
export function getDogHitbox(dog, giant) {
  const box = dog.ducking ? DOG_HITBOX_DUCK : DOG_HITBOX_STAND;
  const dx = dog.x + box.dx;
  const dy = dog.y + box.dy;
  if (!giant) return { x: dx, y: dy, w: box.w, h: box.h };
  const pivot = giantPivot(dog);
  const top = pivot.y + (dy - pivot.y) * GIANT_SCALE;
  const feet = pivot.y + (dog.y - GROUND_Y) * GIANT_SCALE;
  return { x: pivot.x + (dx - pivot.x) * GIANT_SCALE, y: top, w: box.w * GIANT_SCALE, h: feet - top };
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
  flight: (state, obs, services, now) => grabCape(state, services, now),
  // A bone pays BONE_POINTS, or in giant mode its place in the streak.
  bone: (state, obs, services, now) => {
    if (isGiant(state)) {
      fetchBone(state, obs, now);
    } else {
      state.score += BONE_POINTS;
      addEffect(state, 'pointsPickup', now, { x: obs.x + obs.width / 2, y: obs.y, points: BONE_POINTS });
    }
    services.sfx.playFetch();
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
        if (def.giant === 'fetch') {
          COLLECT_ACTIONS.bone(state, obs, services, now);
        } else if (def.giant === 'eat') {
          giantEat(state, obs, now);
          services.sfx.playCrunch();
        } else {
          triggerBonkEffect(state, obs, now);
          services.sfx.playBonk();
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
