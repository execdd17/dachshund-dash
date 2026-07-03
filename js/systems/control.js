// Player intents: jump (also starts/restarts a run) and duck.

import { JUMP_FORCE, DOUBLE_JUMP_FORCE } from '../config.js';
import { resetRun } from '../core/state.js';

export function jump(state, services) {
  if (state.gameState === 'enteringName') return;
  if (state.gameState === 'idle') {
    state.gameState = 'running';
    resetRun(state);
    services.music.resetToNormal();
  }
  if (state.gameState === 'dead') {
    if (Date.now() - state.deathTime < 1000) return;  // brief input lockout after death
    state.gameState = 'running';
    resetRun(state);
    services.music.resetToNormal();
  }
  if (state.gameState !== 'running') return;
  if (state.dog.ducking) return;

  if (!state.dog.jumping) {
    state.dog.vy = JUMP_FORCE;
    state.dog.jumping = true;
    state.dog.doubleJumped = false;
    services.sfx.playJump();
  } else if (!state.dog.doubleJumped) {
    state.dog.vy = DOUBLE_JUMP_FORCE;
    state.dog.doubleJumped = true;
    services.sfx.playDoubleJump();
  }
}

export function duck(state, active, services) {
  if (state.gameState !== 'running') return;
  if (active && !state.dog.jumping) {
    if (!state.dog.ducking) services.sfx.playDuck();
    state.dog.ducking = true;
  } else {
    state.dog.ducking = false;
  }
}
