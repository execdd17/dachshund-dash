// Squirrel chase state machine: pending → entering → active → escaping.
// Triggered periodically by score; mutually exclusive with boss and giant.

import {
  W, CHASE_FIRST_AT, CHASE_COOLDOWN, CHASE_DURATION_FRAMES, SQUIRREL_OFFSET,
  SQUIRREL_RUN_SPEED, SQUIRREL_RUN_ACCEL, SQUIRREL_MAX_RUN_SPEED, SQUIRREL_OFFSCREEN_PAD,
} from '../config.js';
import { giantBusy, markSceneEnd, requestScene, requeueSceneFront, tryStartScene } from './encounters.js';

const accelerate = (speed, scale) => Math.min(SQUIRREL_MAX_RUN_SPEED, speed + SQUIRREL_RUN_ACCEL * scale);

export function updateChase(state, scale, now = 0) {
  if (state.chaseActive) {
    if (state.frameCount - state.chaseStartedFrame >= CHASE_DURATION_FRAMES) {
      state.chaseActive = false;
      state.chaseEscaping = true;
      state.squirrelEscapeX = state.dog.x + SQUIRREL_OFFSET;
      state.squirrelEscapeSpeed = SQUIRREL_RUN_SPEED;
      state.lastChaseEndScore = state.score;
    }
  } else if (state.chaseEscaping) {
    state.squirrelEscapeX += state.squirrelEscapeSpeed * scale;
    state.squirrelEscapeSpeed = accelerate(state.squirrelEscapeSpeed, scale);
    if (state.squirrelEscapeX > W + SQUIRREL_OFFSCREEN_PAD) {
      state.chaseEscaping = false;
      markSceneEnd(state, now);
    }
  } else if (state.chaseEntering) {
    state.squirrelEnterX -= state.squirrelEnterSpeed * scale;
    state.squirrelEnterSpeed = accelerate(state.squirrelEnterSpeed, scale);
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
    // spawns. The queued turn is kept — we go back to the queue head and
    // re-arm right after the giant ends.
    if (giantBusy(state)) {
      state.chasePending = false;
      requeueSceneFront(state, 'chase');
    } else if (state.obstacles.length === 0) {
      state.chasePending = false;
      state.chaseEntering = true;
      state.squirrelEnterX = W + SQUIRREL_OFFSCREEN_PAD;
      state.squirrelEnterSpeed = SQUIRREL_RUN_SPEED;
    }
  } else {
    const wantsTurn = (state.lastChaseEndScore === 0 && state.score >= CHASE_FIRST_AT)
      || (state.lastChaseEndScore > 0 && state.score >= state.lastChaseEndScore + CHASE_COOLDOWN);
    if (wantsTurn) requestScene(state, 'chase');
    if (tryStartScene(state, 'chase', now)) {
      state.chasePending = true;
    }
  }
}
