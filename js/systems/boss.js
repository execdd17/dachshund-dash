// Boss encounter: a longer, higher-stakes squirrel chase at every
// BOSS_MILESTONE points. The dog is pushed right (less reaction time) while
// a giant squirrel closes in from the left; if it catches the dog, game over.

import {
  GROUND_Y, DOG_BASE_X,
  BOSS_MILESTONE, BOSS_MAX_DOG_SHIFT, BOSS_DOG_SHIFT_SPEED, BOSS_DOG_RETURN_SPEED,
  BOSS_SQUIRREL_START_X, BOSS_SQUIRREL_LOSE_SPEED, BOSS_CHASE_DURATION,
} from '../config.js';
import { killDog } from './death.js';
import { giantBusy, markSceneEnd, requestScene, requeueSceneFront, tryStartScene } from './encounters.js';

export function updateBoss(state, scale, services, now = 0) {
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
      markSceneEnd(state, now);
    }
  } else if (state.bossPending) {
    // Giant mode won the race (a golden eaten after we armed): stand down so
    // giant mode keeps its normal edible field. The queued turn is kept — we
    // go back to the queue head and re-arm right after the shrink ends.
    if (giantBusy(state)) {
      state.bossPending = false;
      requeueSceneFront(state, 'boss');
    } else if (state.obstacles.length === 0) {
      state.bossPending = false;
      state.bossChasing = true;
      state.bossSquirrelX = BOSS_SQUIRREL_START_X;
      state.bossChaseFrames = 0;
    }
  } else {
    // Boss trigger: request a turn at 1000, 2000, 3000... The request sits in
    // the scene queue until it's the boss's turn, so a blocked milestone is
    // never lost (and crossing another milestone while queued doesn't stack a
    // second boss — one queued request per scene).
    const currentMilestone = Math.floor(state.score / BOSS_MILESTONE);
    if (currentMilestone > state.lastBossMilestone) {
      state.lastBossMilestone = currentMilestone;
      requestScene(state, 'boss');
    }
    if (tryStartScene(state, 'boss', now)) {
      state.bossPending = true;
    }
  }
}
