// Player intents: jump (also starts/restarts a run) and duck.

import { JUMP_FORCE, DOUBLE_JUMP_FORCE, FAST_FALL_VY, RESTART_LOCKOUT_MS } from '../config.js';
import { resetRun } from '../core/state.js';

export function jump(state, services, now = performance.now()) {
  const canStart = state.gameState === 'idle'
    || (state.gameState === 'dead' && now - state.deathTime >= RESTART_LOCKOUT_MS);
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
    state.dog.fastFalling = false;
    services.sfx.playDoubleJump();
  }
}

// Duck is a held input, not a one-shot press: holding it through a jump
// ducks on the landing frame (applyDuck runs every frame from update()).
// Pressing it mid-air also fast-falls until landing or release; a duck held
// since before the dog left the ground (a trampoline bounce) doesn't.
export function duck(state, active, services) {
  const pressed = active && !state.duckHeld;  // key auto-repeat isn't a new press
  state.duckHeld = active;
  const dog = state.dog;
  if (!active) {
    dog.fastFalling = false;
  } else if (pressed && dog.jumping && state.gameState === 'running') {
    dog.fastFalling = true;
    dog.vy = Math.max(dog.vy, FAST_FALL_VY);
  }
  applyDuck(state, services);
}

// The dog ducks while duck is held and it's on the ground.
export function applyDuck(state, services) {
  if (state.gameState !== 'running') return;
  const ducking = state.duckHeld && !state.dog.jumping;
  if (ducking && !state.dog.ducking) services.sfx.playDuck();
  state.dog.ducking = ducking;
}
