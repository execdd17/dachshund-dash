// Clean jumps (hyper mode only): a chocolate bar or a lone bird cleared with
// a single jump — the dog in the air the whole time it passed, the double jump
// unused while it did — pays CLEAN_JUMP_POINTS, more at lower speeds (where a
// slow obstacle asks for a well-timed jump and the double jump is the crutch),
// times the level of one streak: clean jumps in a row, capped at
// CLEAN_STREAK_MAX. A lone bird is the risky one (at speed 4 a single jump
// has a 50 ms window), so a clean bird counts double: two levels, and twice a
// bar's points at the new level. In hyper a lone bird pays only this way, not
// normal mode's BIRD_JUMP_BONUS.
//
// The streak breaks on a failed single jump (a bar or bird cleared with the
// double jump), on ducking under a lone bird (the safe way out), and on a hit
// (hearts.js). What the game makes unavoidable leaves it be: bird walls and
// stacks, the chase's acorns, anything passing in the tunnel or during the
// flight, and a double jump the same jump needed for a tower (its verdict
// waits for the landing, so a tower before or after the bar in one arc counts).

import { CLEAN_JUMP_POINTS, CLEAN_STREAK_MAX, MAX_SPEED, SPEED_PROFILES, DOG_HITBOX_STAND } from '../config.js';
import { addEffect } from './effects.js';
import { getObstacleHitbox } from './obstacleTypes.js';

// A clean jump's base points at `speed`: atStart at hyper's starting speed, down to atTop at MAX_SPEED.
export function cleanJumpPoints(speed) {
  const start = SPEED_PROFILES.hyper.start;
  const t = Math.min(1, Math.max(0, (speed - start) / (MAX_SPEED - start)));
  return Math.round(CLEAN_JUMP_POINTS.atStart + (CLEAN_JUMP_POINTS.atTop - CLEAN_JUMP_POINTS.atStart) * t);
}

// What a clean jump can clear: a chocolate bar, or a lone bird (not a wall's), but not the chase's acorns.
export const isCleanJumpable = o => o.skin !== 'chase' && (o.type === 'hotdog' || (o.type === 'bird' && !o.aerialWall));
const isLoneBird = o => o.type === 'bird';

// Every frame in hyper (update.js, after it marks `passedUnder` on anything
// that crossed the dog's body with it on the ground): notes a double jump used
// while something passes, judges each bar, lone bird, and tower as its hitbox
// clears the dog's tail, then settles a landed jump's double-jumped clears.
export function stepCleanJumps(state, now) {
  const { dog } = state;
  const tail = dog.x + DOG_HITBOX_STAND.dx;
  for (const o of state.obstacles) {
    if (o.judged) continue;
    const box = getObstacleHitbox(o);
    if (dog.doubleJumped && box.x < tail + DOG_HITBOX_STAND.w && box.x + box.w > tail) o.doubledOver = true;
    if (box.x + box.w >= tail) continue;
    if (o.type === 'tower') {
      o.judged = true;
      if (dog.jumping) state.cleanArcTower = true;
    } else if (isCleanJumpable(o)) {
      judgeCleanJump(state, o, now);
    }
  }
  if (!dog.jumping) {
    if (state.cleanPending && !state.cleanArcTower) state.cleanStreak = 0;
    state.cleanPending = false;
    state.cleanArcTower = false;
  }
}

// Judges a bar or lone bird once, as it clears the dog's tail.
export function judgeCleanJump(state, o, now) {
  o.judged = true;
  const { dog } = state;
  if (dog.underground || dog.flying) return;  // the tunnel and the flight move the dog: no verdict
  if (o.passedUnder) {
    state.cleanStreak = 0;  // ducked under a bird (a bar under the dog was a hit: hearts.js broke it already)
    return;
  }
  if (o.doubledOver) {
    state.cleanPending = true;  // a break, unless this jump also clears a tower (stepCleanJumps, on landing)
    return;
  }
  o.clean = true;
  const counts = isLoneBird(o) ? 2 : 1;
  state.cleanStreak += counts;
  const level = Math.min(state.cleanStreak, CLEAN_STREAK_MAX);
  const points = cleanJumpPoints(state.speed) * counts * level;
  state.score += points;
  addEffect(state, 'cleanJump', now, { x: o.x + o.width / 2, y: o.y, points, level, bird: counts > 1 });
}
