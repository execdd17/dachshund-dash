// Clean jumps (hyper mode only): a chocolate bar cleared with a single jump —
// the dog in the air the whole time it passed, the double jump unused — pays
// CLEAN_JUMP_POINTS, more at lower speeds (where a slow bar asks for a well
// timed jump and the double jump is the crutch), times the streak's level:
// clean jumps in a row climb to CLEAN_STREAK_MAX. Any other way past a bar,
// or a hit (hearts.js), breaks the streak.

import { CLEAN_JUMP_POINTS, CLEAN_STREAK_MAX, MAX_SPEED, SPEED_PROFILES } from '../config.js';
import { addEffect } from './effects.js';

// A clean jump's base points at `speed`: atStart at hyper's starting speed, down to atTop at MAX_SPEED.
export function cleanJumpPoints(speed) {
  const start = SPEED_PROFILES.hyper.start;
  const t = Math.min(1, Math.max(0, (speed - start) / (MAX_SPEED - start)));
  return Math.round(CLEAN_JUMP_POINTS.atStart + (CLEAN_JUMP_POINTS.atTop - CLEAN_JUMP_POINTS.atStart) * t);
}

// Judges a chocolate bar once, as it clears the dog's tail (update.js marks
// `passedUnder` on any obstacle that crossed the dog's body with it on the ground).
export function judgeCleanJump(state, bar, now) {
  bar.judged = true;
  const { dog } = state;
  if (bar.passedUnder || !dog.jumping || dog.doubleJumped) {
    state.cleanStreak = 0;
    return;
  }
  bar.clean = true;
  state.cleanStreak++;
  const level = Math.min(state.cleanStreak, CLEAN_STREAK_MAX);
  const points = cleanJumpPoints(state.speed) * level;
  state.score += points;
  addEffect(state, 'cleanJump', now, { x: bar.x + bar.width / 2, y: bar.y, points, level });
}
