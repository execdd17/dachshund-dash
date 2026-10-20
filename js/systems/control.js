// Player intents: jump (also starts/restarts a run) and duck.

import { JUMP_FORCE, DOUBLE_JUMP_FORCE, RESTART_LOCKOUT_MS } from '../config.js';
import { resetRun } from '../core/state.js';

export function jump(state, services) {
  const canStart = state.gameState === 'idle'
    || (state.gameState === 'dead' && Date.now() - state.deathTime >= RESTART_LOCKOUT_MS);
  if (canStart) {
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
