// Boss scene: a longer, higher-stakes squirrel chase at every BOSS_MILESTONE
// points: pending → active (closing in) → exiting (falling back).

import {
  GROUND_Y, DOG_BASE_X,
  BOSS_MILESTONE, BOSS_MAX_DOG_SHIFT, BOSS_DOG_SHIFT_SPEED, BOSS_DOG_RETURN_SPEED,
  BOSS_SQUIRREL_START_X, BOSS_SQUIRREL_LOSE_SPEED, BOSS_CHASE_DURATION,
  BOSS_APPROACH_FRAC, BOSS_RETREAT_FRAC, BOSS_TAIL_GAP, BOSS_EXIT_PAD, BOSS_SPEED_MULTIPLIER,
} from '../config.js';
import { getDogHitbox, rectsOverlap } from './collision.js';
import { killDog } from './death.js';
import { inScene, stepScene } from './encounters.js';

export const isBossChasing = state => inScene(state, 'boss', 'active');

// Game-speed multiplier: ramps up over the approach, back to 1 once the dog escapes.
export function bossSpeedMultiplier(state) {
  if (!isBossChasing(state)) return 1;
  const ramp = Math.min(1, state.scene.chaseFrames / (BOSS_CHASE_DURATION * BOSS_APPROACH_FRAC));
  return 1 + (BOSS_SPEED_MULTIPLIER - 1) * ramp;
}

export const bossScene = {
  id: 'boss',
  quietPhases: ['exiting'],
  initialData: () => ({ squirrelX: BOSS_SQUIRREL_START_X, chaseFrames: 0, dogShift: 0 }),

  // A turn at 1000, 2000, 3000… The request waits in the scene queue, so a
  // milestone crossed while blocked is never lost (and crossing another while
  // queued doesn't stack a second boss — one queued request per scene).
  wantsTurn(state, memory) {
    const milestone = Math.floor(state.score / BOSS_MILESTONE);
    if (milestone <= (memory.lastMilestone ?? 0)) return false;
    memory.lastMilestone = milestone;
    return true;
  },

  start(state, scene) {
    scene.phase = 'active';
    scene.squirrelX = BOSS_SQUIRREL_START_X;
    scene.chaseFrames = 0;
  },

  phases: {
    // The squirrel closes in from the left while the dog is pushed right
    // (less reaction time); if it catches the dog, game over.
    active(state, scene, { scale, services }) {
      // Frame-based timer: the encounter lasts the same regardless of game speed
      scene.chaseFrames += scale;
      const progress = Math.min(1, scene.chaseFrames / BOSS_CHASE_DURATION);
      // Ease in, hold right on the dog's tail, then ease back out.
      const retreatAt = 1 - BOSS_RETREAT_FRAC;
      let approachCurve;
      if (progress < BOSS_APPROACH_FRAC) {
        const t = progress / BOSS_APPROACH_FRAC;
        approachCurve = t * t;
      } else if (progress < retreatAt) {
        approachCurve = 1;
      } else {
        const t = (progress - retreatAt) / BOSS_RETREAT_FRAC;
        approachCurve = 1 - t * t;
      }

      scene.dogShift = Math.min(BOSS_MAX_DOG_SHIFT, scene.dogShift + BOSS_DOG_SHIFT_SPEED * scale);
      state.dog.x = DOG_BASE_X + scene.dogShift;
      const peakX = state.dog.x - BOSS_TAIL_GAP;
      scene.squirrelX = BOSS_SQUIRREL_START_X + (peakX - BOSS_SQUIRREL_START_X) * approachCurve;

      const squirrelBox = { x: scene.squirrelX, y: GROUND_Y + 4, w: 30, h: 20 };
      if (rectsOverlap(squirrelBox, getDogHitbox(state.dog, false))) killDog(state, services);
      return scene.chaseFrames >= BOSS_CHASE_DURATION ? 'exiting' : undefined;
    },
    // The squirrel falls back; the dog eases home, but only while grounded.
    // The scene ends once the dog is home and the squirrel is off-screen.
    exiting(state, scene, { scale }) {
      if (!state.dog.jumping) {
        scene.dogShift = Math.max(0, scene.dogShift - BOSS_DOG_RETURN_SPEED * scale);
      }
      state.dog.x = DOG_BASE_X + scene.dogShift;
      scene.squirrelX -= BOSS_SQUIRREL_LOSE_SPEED * scale;
      const gone = scene.squirrelX < BOSS_SQUIRREL_START_X - BOSS_EXIT_PAD && scene.dogShift <= 0;
      return gone ? 'done' : undefined;
    },
  },
};

export function updateBoss(state, scale, services, now = 0) {
  stepScene(state, bossScene, { scale, services, now });
}
