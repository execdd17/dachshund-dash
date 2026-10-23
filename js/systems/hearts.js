// The heart economy: hits spend hearts, heart pickups (the trampoline's
// skill reward) give them back, up to the run's starting count.

import { HEART_HIT_INVULN, HEART_FULL_BONUS } from '../config.js';
import { addEffect } from './effects.js';

// Spends a heart and starts the post-hit i-frames. False when it was the last one.
export function spendHeart(state, services, now) {
  state.hearts--;
  state.cleanStreak = 0;  // a hit breaks the clean-jump streak (cleanJump.js)
  if (state.hearts <= 0) return false;
  state.heartLostAt = now;
  state.invulnUntil = now + HEART_HIT_INVULN;
  services.sfx.playBonk();
  return true;
}

// Restores a spent heart, or with every heart full, pays HEART_FULL_BONUS instead.
export function gainHeart(state, services, now, at) {
  if (state.hearts < state.startingHearts) {
    state.hearts++;
    state.heartGainedAt = now;
    addEffect(state, 'heartGain', now, at);
  } else {
    state.score += HEART_FULL_BONUS;
    addEffect(state, 'heartBonus', now, at);
  }
  services.sfx.playHeart();
}
