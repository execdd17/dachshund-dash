// Clean jumps (hyper mode only): a jump that never uses its double jump,
// judged when the dog lands. Every chocolate bar and lone bird it cleared —
// the dog in the air the whole time each passed — pays CLEAN_JUMP_POINTS, more
// at lower speeds (where a slow obstacle asks for a well-timed jump and the
// double jump is the crutch), times the level of one streak: clean jumps in a
// row, capped at CLEAN_STREAK_MAX. A lone bird is the risky one (at speed 4 a
// single jump has a 50 ms window), so a clean bird counts double: two levels,
// and twice a bar's points. In hyper a lone bird pays only this way, not
// normal mode's BIRD_JUMP_BONUS. Judging the whole jump, not the moment each
// obstacle passed, is what catches the crutch at speed: there the bar is past
// before the top of the jump, where the second press usually comes.
//
// The streak breaks on a jump that cleared a bar or bird with the double jump
// used anywhere in it, on ducking under a lone bird (the safe way out), and on
// a hit (hearts.js). What the game makes unavoidable leaves it be: bird walls
// and stacks, the chase's acorns, anything passing in the tunnel or during
// the flight, and a double jump in a jump that also clears a tower.

import { CLEAN_JUMP_POINTS, CLEAN_STREAK_MAX, MAX_SPEED, SPEED_PROFILES, DOG_HITBOX_STAND } from '../config.js';
import { addEffect } from './effects.js';
import { getObstacleHitbox } from './obstacleTypes.js';
import { pastDog } from './dogBody.js';

// A clean jump's base points at `speed`: atStart at hyper's starting speed, down to atTop at MAX_SPEED.
export function cleanJumpPoints(speed) {
  const start = SPEED_PROFILES.hyper.start;
  const t = Math.min(1, Math.max(0, (speed - start) / (MAX_SPEED - start)));
  return Math.round(CLEAN_JUMP_POINTS.atStart + (CLEAN_JUMP_POINTS.atTop - CLEAN_JUMP_POINTS.atStart) * t);
}

// What a clean jump can clear: a chocolate bar, or a lone bird (not a wall's), but not the chase's acorns.
export const isCleanJumpable = o => o.skin !== 'chase' && (o.type === 'hotdog' || (o.type === 'bird' && !o.aerialWall));
// How many clean jumps one cleared counts as: a lone bird, the risky one, counts double.
const countOf = o => (o.type === 'bird' ? 2 : 1);

// This jump so far (state.cleanArc; core/state.js starts each run with the same shape).
const freshArc = () => ({ cleared: [], doubled: false, tower: false, broken: false });

// Breaks the streak, and with it this jump: a hit mid-jump leaves nothing in
// it to pay on landing, before or after the hit.
export function breakCleanStreak(state) {
  state.cleanStreak = 0;
  state.cleanArc.broken = true;
}

// Every frame in hyper (jumpBonuses.js, after it marks `passedUnder` on
// anything that crossed the dog's body with it on the ground): notes this
// jump's double jump and towers, judges each bar and lone bird as its hitbox
// clears the dog's tail, and settles the jump when the dog lands.
export function stepCleanJumps(state, body, now) {
  const { dog } = state;
  const arc = state.cleanArc;
  if (dog.jumping && dog.doubleJumped) arc.doubled = true;
  for (const o of state.obstacles) {
    if (o.judged || !pastDog(getObstacleHitbox(o), body)) continue;
    o.judged = true;
    if (o.type === 'tower') {
      if (dog.jumping) arc.tower = true;
    } else if (isCleanJumpable(o)) {
      judgeCleanJump(state, o);
    }
  }
  if (!dog.jumping) settleCleanJump(state, now);
}

// A bar or lone bird clearing the dog's tail: cleared by this jump (settled on
// landing), ducked under, or passed where nothing counts.
export function judgeCleanJump(state, o) {
  const { dog } = state;
  if (dog.underground || dog.flying) return;  // the tunnel and the flight move the dog: no verdict
  if (o.passedUnder) {
    breakCleanStreak(state);  // ducked under a bird (a bar under the dog was a hit: hearts.js broke it already)
    return;
  }
  if (dog.jumping) state.cleanArc.cleared.push(o);
}

// The dog is down: pays the jump's clears if it never used its double jump;
// with it used, breaks the streak, unless the jump also cleared a tower. A
// jump the streak broke in (a hit) pays nothing.
export function settleCleanJump(state, now) {
  const arc = state.cleanArc;
  if (arc.cleared.length && !arc.broken) {
    if (!arc.doubled) payCleanJump(state, arc.cleared, now);
    else if (!arc.tower) state.cleanStreak = 0;
  }
  state.cleanArc = freshArc();
}

function payCleanJump(state, cleared, now) {
  let points = 0;
  for (const o of cleared) {
    o.clean = true;
    state.cleanStreak += countOf(o);
    points += cleanJumpPoints(state.speed) * countOf(o) * Math.min(state.cleanStreak, CLEAN_STREAK_MAX);
  }
  state.score += points;
  const level = Math.min(state.cleanStreak, CLEAN_STREAK_MAX);
  const x = state.dog.x + DOG_HITBOX_STAND.dx + DOG_HITBOX_STAND.w / 2;  // over the dog's middle
  addEffect(state, 'cleanJump', now, { x, y: state.dog.y - 10, points, level, bird: cleared.some(o => countOf(o) > 1) });
}
