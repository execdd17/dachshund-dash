// Squirrel chase scene: pending → entering (squirrel runs in from the right)
// → active (acorn obstacles spawn at the squirrel) → exiting (it runs off).
// Triggered periodically by score; see encounters.js for the scene runner.

import {
  W, CHASE_FIRST_AT, CHASE_COOLDOWN, CHASE_DURATION_FRAMES, SQUIRREL_OFFSET,
  SQUIRREL_RUN_SPEED, SQUIRREL_RUN_ACCEL, SQUIRREL_MAX_RUN_SPEED, SQUIRREL_OFFSCREEN_PAD,
} from '../config.js';
import { inScene, sceneMemory, scoreCooldownTrigger, stepScene } from './encounters.js';

const accelerate = (speed, scale) => Math.min(SQUIRREL_MAX_RUN_SPEED, speed + SQUIRREL_RUN_ACCEL * scale);

export const isChaseActive = state => inScene(state, 'chase', 'active');

export const chaseScene = {
  id: 'chase',
  quietPhases: ['entering'],
  initialData: () => ({ squirrelX: 0, squirrelSpeed: SQUIRREL_RUN_SPEED, startedFrame: 0 }),
  wantsTurn: (state, memory) => scoreCooldownTrigger(state, memory, CHASE_FIRST_AT, CHASE_COOLDOWN),

  start(state, scene) {
    scene.phase = 'entering';
    scene.squirrelX = W + SQUIRREL_OFFSCREEN_PAD;
    scene.squirrelSpeed = SQUIRREL_RUN_SPEED;
  },

  phases: {
    entering(state, scene, { scale }) {
      scene.squirrelX -= scene.squirrelSpeed * scale;
      scene.squirrelSpeed = accelerate(scene.squirrelSpeed, scale);
      if (scene.squirrelX > state.dog.x + SQUIRREL_OFFSET) return undefined;
      scene.squirrelX = state.dog.x + SQUIRREL_OFFSET;
      scene.startedFrame = state.frameCount;
      state.nextObstacleIn = 80;  // first chase obstacle spawns soon after the squirrel arrives
      return 'active';
    },
    active(state, scene) {
      if (state.frameCount - scene.startedFrame < CHASE_DURATION_FRAMES) return undefined;
      scene.squirrelX = state.dog.x + SQUIRREL_OFFSET;
      scene.squirrelSpeed = SQUIRREL_RUN_SPEED;
      sceneMemory(state, 'chase').lastEndScore = state.score;
      return 'exiting';
    },
    exiting(state, scene, { scale }) {
      scene.squirrelX += scene.squirrelSpeed * scale;
      scene.squirrelSpeed = accelerate(scene.squirrelSpeed, scale);
      return scene.squirrelX > W + SQUIRREL_OFFSCREEN_PAD ? 'done' : undefined;
    },
  },
};

export function updateChase(state, scale, now = 0) {
  stepScene(state, chaseScene, { scale, now });
}
