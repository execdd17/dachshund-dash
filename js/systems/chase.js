// Squirrel chase state machine: pending → entering → active → escaping.
// Triggered periodically by score; mutually exclusive with boss and giant.

import {
  W, CHASE_FIRST_AT, CHASE_COOLDOWN, CHASE_DURATION_FRAMES, SQUIRREL_OFFSET,
} from '../config.js';
import { giantBusy, bossBusy, trampBusy, goldenOnField, sceneGapElapsed, markSceneEnd } from './encounters.js';

export function updateChase(state, scale, now = 0) {
  if (state.chaseActive) {
    if (state.frameCount - state.chaseStartedFrame >= CHASE_DURATION_FRAMES) {
      state.chaseActive = false;
      state.chaseEscaping = true;
      state.squirrelEscapeX = state.dog.x + SQUIRREL_OFFSET;
      state.squirrelEscapeSpeed = 1.5;
      state.lastChaseEndScore = state.score;
    }
  } else if (state.chaseEscaping) {
    state.squirrelEscapeX += state.squirrelEscapeSpeed * scale;
    state.squirrelEscapeSpeed = Math.min(3.5, state.squirrelEscapeSpeed + 0.004 * scale);
    if (state.squirrelEscapeX > W + 80) {
      state.chaseEscaping = false;
      markSceneEnd(state, now);
    }
  } else if (state.chaseEntering) {
    state.squirrelEnterX -= state.squirrelEnterSpeed * scale;
    state.squirrelEnterSpeed = Math.min(3.5, state.squirrelEnterSpeed + 0.004 * scale);
    if (state.squirrelEnterX <= state.dog.x + SQUIRREL_OFFSET) {
      state.squirrelEnterX = state.dog.x + SQUIRREL_OFFSET;
      state.chaseEntering = false;
      state.chaseActive = true;
      state.chaseStartedFrame = state.frameCount;
      state.nextObstacleIn = 80;  // first chase obstacle spawns soon after squirrel arrives
    }
  } else if (state.chasePending) {
    // Giant mode won the race (a golden eaten after we armed): stand down so
    // giant mode keeps its hot-dog field instead of acorn-skinned chase
    // spawns. The score condition still holds, so we re-arm right after.
    if (giantBusy(state)) {
      state.chasePending = false;
    } else if (state.obstacles.length === 0) {
      state.chasePending = false;
      state.chaseEntering = true;
      state.squirrelEnterX = W + 80;  // start off-screen right
      state.squirrelEnterSpeed = 1.5;
    }
  } else {
    const canStart = !giantBusy(state) && !bossBusy(state) && !trampBusy(state)
      && !goldenOnField(state) && sceneGapElapsed(state, now)
      && ((state.lastChaseEndScore === 0 && state.score >= CHASE_FIRST_AT) ||
      (state.lastChaseEndScore > 0 && state.score >= state.lastChaseEndScore + CHASE_COOLDOWN));
    if (canStart) {
      state.chasePending = true;
    }
  }
}
