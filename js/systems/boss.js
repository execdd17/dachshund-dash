// Boss encounter: a longer, higher-stakes squirrel chase at every
// BOSS_MILESTONE points. The dog is pushed right (less reaction time) while
// a giant squirrel closes in from the left; if it catches the dog, game over.

import {
  GROUND_Y, DOG_BASE_X,
  BOSS_MILESTONE, BOSS_MAX_DOG_SHIFT, BOSS_DOG_SHIFT_SPEED, BOSS_DOG_RETURN_SPEED,
  BOSS_SQUIRREL_START_X, BOSS_SQUIRREL_LOSE_SPEED, BOSS_CHASE_DURATION,
} from '../config.js';
import { killDog } from './death.js';

export function updateBoss(state, scale, services) {
  if (state.bossChasing) {
    // Frame-based timer: encounter duration is constant regardless of game speed
    state.bossChaseFrames += scale;
    const escapeProgress = Math.min(1, state.bossChaseFrames / BOSS_CHASE_DURATION);
    // Asymmetric curve: approach (15%), long hold at peak (75%), quick retreat (10%)
    let approachCurve;
    if (escapeProgress < 0.15) {
      const t = escapeProgress / 0.15;
      approachCurve = t * t;  // ease-in approach
    } else if (escapeProgress < 0.90) {
      approachCurve = 1;      // hold at peak — squirrel right on the dog's tail
    } else {
      const t = (escapeProgress - 0.90) / 0.10;
      approachCurve = 1 - t * t;  // ease-out retreat
    }

    // Dog shifts right (less reaction time to obstacles)
    state.bossDogShift = Math.min(BOSS_MAX_DOG_SHIFT, state.bossDogShift + BOSS_DOG_SHIFT_SPEED * scale);
    state.dog.x = DOG_BASE_X + state.bossDogShift;

    // Squirrel follows behind the shifted dog
    const peakX = state.dog.x - 70;
    state.bossSquirrelX = BOSS_SQUIRREL_START_X + (peakX - BOSS_SQUIRREL_START_X) * approachCurve;

    // Transition: dog escapes
    if (state.bossChaseFrames >= BOSS_CHASE_DURATION) {
      state.bossLosing = true;
      state.bossChasing = false;
    }
    // Collision: squirrel catches dog
    const sqRight = state.bossSquirrelX + 30;
    const sqLeft = state.bossSquirrelX;
    const sqTop = GROUND_Y + 4;
    const sqBottom = sqTop + 20;
    const dog = state.dog;
    let dx, dy, dw, dh;
    if (dog.ducking) {
      dx = dog.x + 23; dy = dog.y + 10; dw = 50; dh = 8;
    } else {
      dx = dog.x + 23; dy = dog.y - 8; dw = 50; dh = 22;
    }
    if (sqRight > dx && sqLeft < dx + dw && sqBottom > dy && sqTop < dy + dh) {
      // Squirrel caught the dog — game over
      killDog(state, services);
    }
  } else if (state.bossLosing) {
    // Dog returns to base position smoothly — but only while grounded
    if (!state.dog.jumping) {
      state.bossDogShift = Math.max(0, state.bossDogShift - BOSS_DOG_RETURN_SPEED * scale);
    }
    state.dog.x = DOG_BASE_X + state.bossDogShift;
    // Squirrel retreats left
    state.bossSquirrelX -= BOSS_SQUIRREL_LOSE_SPEED * scale;
    // Boss ends only when dog is fully back AND squirrel has exited
    if (state.bossSquirrelX < BOSS_SQUIRREL_START_X - 60 && state.bossDogShift <= 0) {
      state.bossLosing = false;
    }
  } else if (state.bossPending) {
    if (state.obstacles.length === 0) {
      state.bossPending = false;
      state.bossChasing = true;
      state.bossSquirrelX = BOSS_SQUIRREL_START_X;
      state.bossChaseFrames = 0;
    }
  } else {
    // Boss trigger check: fires at 1000, 2000, 3000... (mutual exclusion with chase)
    const currentMilestone = Math.floor(state.score / BOSS_MILESTONE);
    const bossCanStart = !state.giantActive && !state.chasePending && !state.chaseActive
      && !state.chaseEntering && !state.chaseEscaping
      && currentMilestone > state.lastBossMilestone;
    if (bossCanStart) {
      state.bossPending = true;
      state.lastBossMilestone = currentMilestone;
      state.chasePending = false;  // cancel any pending chase
    }
  }
}
