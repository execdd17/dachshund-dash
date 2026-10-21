// Trampoline scene: a thorn patch with a trampoline island, TRAMP_BOUNCES reps
// per scene: pending → active. The last rep floats a heart that only a double
// jump off the bounce reaches.

import {
  W, MIN_OBSTACLE_GAP,
  TRAMP_FIRST_AT, TRAMP_COOLDOWN, TRAMP_BOUNCES, TRAMP_BOUNCE_VY,
  TRAMP_BOUNCE_BONUS, TRAMP_BREATHER, TRAMP_TILE_W, TRAMP_HITBOX_PAD,
  TRAMP_REPS, TRAMP_SQUASH_MS,
} from '../config.js';
import { getDogHitbox } from './collision.js';
import { makeObstacle } from './obstacleTypes.js';
import { addEffect } from './effects.js';
import { sceneMemory, scoreCooldownTrigger, stepScene } from './encounters.js';

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

// One rep: entry thorns, the trampoline island, exit thorns, and the rep's
// heart, if it has one.
export function spawnTrampRep(state, rep) {
  const layout = getTrampLayout(rep, state.speed);
  let x = W + 10;
  const pushThorns = count => {
    for (let i = 0; i < count; i++, x += TRAMP_TILE_W) {
      state.obstacles.push(makeObstacle('thorns', x, { seed: x }));
    }
  };

  pushThorns(layout.entryTiles);
  const islandX = x;
  state.obstacles.push(makeObstacle('trampoline', islandX, { width: layout.trampWidth, squashUntil: 0 }));
  x += layout.trampWidth;
  pushThorns(layout.exitTiles);

  const heart = TRAMP_REPS[rep].heart;
  if (heart) state.obstacles.push(makeObstacle('heart', islandX + heart.leadFactor * state.speed, { y: heart.y }));
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
    state.dog.fastFalling = false;
    state.score += TRAMP_BOUNCE_BONUS;
    addEffect(state, 'trampBounce', now, { x: tramp.x + tramp.width / 2, y: tramp.y });
    tramp.squashUntil = now + TRAMP_SQUASH_MS;
    services.sfx.playBoing();
  }
}

const isTrampScenery = o => o.type === 'thorns' || o.type === 'trampoline' || o.type === 'heart';

export const trampScene = {
  id: 'tramp',
  quietPhases: ['active'],  // the scene spawns its own field
  initialData: () => ({ rep: 0, breatherFrames: 0 }),
  wantsTurn: (state, memory) => scoreCooldownTrigger(state, memory, TRAMP_FIRST_AT, TRAMP_COOLDOWN),

  start(state, scene) {
    scene.phase = 'active';
    scene.rep = 0;
    scene.breatherFrames = TRAMP_BREATHER;
  },

  phases: {
    // TRAMP_BOUNCES reps, each spawned once the previous one has scrolled off
    // and a breather has passed. The bounce runs before collision resolves
    // thorns on the same frame.
    active(state, scene, { scale, services, now }) {
      checkTrampolineBounce(state, services, now);
      if (state.obstacles.some(isTrampScenery)) return undefined;
      if (scene.rep >= TRAMP_BOUNCES) {
        sceneMemory(state, 'tramp').lastEndScore = state.score;
        state.nextObstacleIn = MIN_OBSTACLE_GAP;
        return 'done';
      }
      scene.breatherFrames -= scale;
      if (scene.breatherFrames <= 0) {
        spawnTrampRep(state, scene.rep);
        scene.rep++;
        scene.breatherFrames = TRAMP_BREATHER;
      }
      return undefined;
    },
  },
};

export function updateTrampoline(state, scale, services, now) {
  stepScene(state, trampScene, { scale, services, now });
}
