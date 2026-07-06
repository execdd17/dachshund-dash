// Trampoline scene: thorn patch with a trampoline island. Three reps per
// scene, mutually exclusive with chase/boss/giant.

import {
  W, GROUND_Y, MIN_OBSTACLE_GAP,
  TRAMP_FIRST_AT, TRAMP_COOLDOWN, TRAMP_BOUNCES, TRAMP_BOUNCE_VY,
  TRAMP_BOUNCE_BONUS, TRAMP_BREATHER, TRAMP_TILE_W, TRAMP_HITBOX_PAD,
  TRAMP_REPS,
} from '../config.js';
import { getDogHitbox } from './collision.js';
import { giantBusy, chaseBusy, bossBusy, goldenOnField, sceneGapElapsed, markSceneEnd } from './encounters.js';

export function getTrampLayout(rep, speed) {
  const spec = TRAMP_REPS[rep];
  const entryTiles = Math.ceil(spec.islandOffsetFactor * speed / TRAMP_TILE_W);
  const exitTiles = Math.ceil(spec.exitFactor * speed / TRAMP_TILE_W);
  const entryWidth = entryTiles * TRAMP_TILE_W;
  const exitWidth = exitTiles * TRAMP_TILE_W;
  return {
    entryTiles,
    trampWidth: spec.trampWidth,
    exitTiles,
    patchWidth: entryWidth + spec.trampWidth + exitWidth,
  };
}

export function spawnTrampRep(state) {
  const layout = getTrampLayout(state.trampRep, state.speed);
  let x = W + 10;

  for (let i = 0; i < layout.entryTiles; i++) {
    state.obstacles.push({
      x,
      y: GROUND_Y - 14,
      width: TRAMP_TILE_W,
      height: 30,
      type: 'thorns',
      seed: x,
    });
    x += TRAMP_TILE_W;
  }

  state.obstacles.push({
    x,
    y: GROUND_Y - 12,
    width: layout.trampWidth,
    height: 12,
    type: 'trampoline',
    squashUntil: 0,
  });
  x += layout.trampWidth;

  for (let i = 0; i < layout.exitTiles; i++) {
    state.obstacles.push({
      x,
      y: GROUND_Y - 14,
      width: TRAMP_TILE_W,
      height: 30,
      type: 'thorns',
      seed: x,
    });
    x += TRAMP_TILE_W;
  }
}

function checkTrampolineBounce(state, services, now) {
  const tramp = state.obstacles.find(o => o.type === 'trampoline');
  if (!tramp) return;

  const dogBox = getDogHitbox(state.dog, false);
  const overlapX = dogBox.x < tramp.x + tramp.width + TRAMP_HITBOX_PAD
    && dogBox.x + dogBox.w > tramp.x - TRAMP_HITBOX_PAD;
  if (overlapX && state.dog.vy >= 0 && state.dog.y >= tramp.y - 2) {
    state.dog.y = tramp.y;
    state.dog.vy = TRAMP_BOUNCE_VY;
    state.dog.jumping = true;
    state.dog.doubleJumped = false;
    state.dog.ducking = false;
    state.score += TRAMP_BOUNCE_BONUS;
    state.trampBounceEffects.push({ x: tramp.x + tramp.width / 2, y: tramp.y, startTime: now });
    tramp.squashUntil = now + 250;
    services.sfx.playBoing();
  }
}

export function updateTrampoline(state, scale, services, now) {
  if (state.trampActive) {
    checkTrampolineBounce(state, services, now);

    const sceneObstacles = state.obstacles.some(o => o.type === 'thorns' || o.type === 'trampoline');
    if (!sceneObstacles) {
      if (state.trampRep >= TRAMP_BOUNCES) {
        state.trampActive = false;
        state.lastTrampEndScore = state.score;
        markSceneEnd(state, now);
        state.nextObstacleIn = MIN_OBSTACLE_GAP;
      } else {
        state.trampBreatherFrames -= scale;
        if (state.trampBreatherFrames <= 0) {
          spawnTrampRep(state);
          state.trampRep++;
          state.trampBreatherFrames = TRAMP_BREATHER;
        }
      }
    }
  } else if (state.trampPending) {
    // Giant mode won the race (e.g. a golden eaten via debug G after we
    // armed): stand down so giant mode keeps its normal field of edible
    // obstacles. The score condition still holds, so we re-arm right after.
    if (giantBusy(state)) {
      state.trampPending = false;
    } else if (state.obstacles.length === 0) {
      state.trampPending = false;
      state.trampActive = true;
      state.trampRep = 0;
      state.trampBreatherFrames = TRAMP_BREATHER;
    }
  } else {
    const canStart = !giantBusy(state) && !chaseBusy(state) && !bossBusy(state)
      && !goldenOnField(state) && sceneGapElapsed(state, now)
      && ((state.lastTrampEndScore === 0 && state.score >= TRAMP_FIRST_AT)
        || (state.lastTrampEndScore > 0 && state.score >= state.lastTrampEndScore + TRAMP_COOLDOWN));
    if (canStart) {
      state.trampPending = true;
    }
  }
}
