// Hyper's clean jumps (systems/cleanJump.js): a chocolate bar or lone bird
// cleared with a single jump pays, more at lower speeds, times one shared
// streak; a bird counts double. A failed single jump (cleared with the double
// jump), ducking under a bird, or a hit breaks it; the unavoidable (bird
// stacks, the chase's acorns, the tunnel, the flight, a double jump a tower
// needed) leaves it be. Normal mode has no clean jumps.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../js/core/state.js';
import { update } from '../js/systems/update.js';
import { jump } from '../js/systems/control.js';
import { makeObstacle, getObstacleHitbox } from '../js/systems/obstacleTypes.js';
import { SPAWN_KINDS } from '../js/systems/spawning.js';
import { cleanJumpPoints, judgeCleanJump, settleCleanJump } from '../js/systems/cleanJump.js';
import { EFFECT_DRAWERS } from '../js/render/effects.js';
import { CLEAN_JUMP_POINTS, CLEAN_STREAK_MAX, MAX_SPEED, SPEED_PROFILES, DOG_HITBOX_STAND, BIRD_LOW_Y, BIRD_JUMP_BONUS } from '../js/config.js';
import { createTestServices } from './helpers.js';

const HYPER_TOP = (MAX_SPEED - SPEED_PROFILES.hyper.start) / SPEED_PROFILES.hyper.perPoint;  // score at top speed

// A running hyper run at `score`, past the frenzy's drop (which would clear the field), spawning nothing.
function hyperState(score = 0, hyper = true) {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.hyper = hyper;
  state.startingHearts = state.hearts = 99;
  state.score = score;
  state.frenzyAt = 1;
  state.nextObstacleIn = Infinity;
  return state;
}

const obstacle = (kind, x = 400) => (kind === 'bird' ? makeObstacle('bird', x, { y: BIRD_LOW_Y }) : makeObstacle(kind, x));

// Plays `obstacles` with the real physics until the last has cleared the dog and it has landed:
// jump when the first's hitbox is `jumpAt` px past the dog's nose, `double` again at the top of
// that jump, and `duck` hold duck throughout. Returns the clean-jump points paid.
function play(state, obstacles, { jumpAt = -Infinity, double = false, duck = false } = {}) {
  const services = createTestServices();
  state.obstacles = obstacles;
  state.duckHeld = duck;
  let now = 0, jumped = false, doubled = false;
  const tail = () => state.dog.x + DOG_HITBOX_STAND.dx;
  for (let f = 0; f < 900; f++) {
    const last = obstacles.at(-1);
    if (getObstacleHitbox(last).x + getObstacleHitbox(last).w < tail() && !state.dog.jumping) break;
    const nose = tail() + DOG_HITBOX_STAND.w;
    if (!jumped && getObstacleHitbox(obstacles[0]).x - nose < jumpAt) { jump(state, services, now); jumped = true; }
    if (double && jumped && !doubled && state.dog.vy >= 0) { jump(state, services, now); doubled = true; }
    update(state, 1000 / 120, services, () => 0.5, now += 1000 / 120);
  }
  return state.effects.filter(e => e.kind === 'cleanJump').reduce((sum, e) => sum + e.points, 0);
}

test('a clean jump pays 25 at hyper\'s starting speed, tapering to 5 at top speed', () => {
  assert.equal(cleanJumpPoints(SPEED_PROFILES.hyper.start), CLEAN_JUMP_POINTS.atStart);
  assert.equal(cleanJumpPoints(MAX_SPEED), CLEAN_JUMP_POINTS.atTop);
  assert.equal(cleanJumpPoints((SPEED_PROFILES.hyper.start + MAX_SPEED) / 2), 15);
});

test('a single jump over a bar pays and builds the streak; a lone bird counts double', () => {
  // [kind, score, jumpAt, points, streak]: a bird adds two levels and pays twice a bar at the new level.
  for (const [kind, score, jumpAt, points, streak] of [
    ['hotdog', 0, 50, 25, 1], ['hotdog', HYPER_TOP, 50, 5, 1], ['bird', 0, 35, 2 * 25 * 2, 2], ['bird', HYPER_TOP, 100, 2 * 5 * 2, 2],
  ]) {
    const state = hyperState(score);
    assert.equal(play(state, [obstacle(kind)], { jumpAt }), points, `${kind} at score ${score}`);
    assert.equal(state.cleanStreak, streak, kind);
    assert.equal(state.hearts, 99, `${kind}: cleared, not hit`);
  }
});

test('bars and birds share one streak; a lone bird pays no normal-mode bonus in hyper', () => {
  const state = hyperState(HYPER_TOP);
  state.cleanStreak = 2;
  const before = state.score;
  assert.equal(play(state, [obstacle('bird')], { jumpAt: 100 }), 2 * 5 * 4, 'level 4: twice 5 × 4');
  assert.equal(state.cleanStreak, 4);
  assert.ok(state.score - before - 40 < BIRD_JUMP_BONUS, 'distance on top of the 40, but no NICE +50');
  assert.equal(state.effects.filter(e => e.kind === 'birdJump').length, 0);
});

test('a double jump while clearing a bar or a bird breaks the streak', () => {
  for (const [kind, jumpAt] of [['hotdog', 120], ['bird', 90]]) {
    const state = hyperState();
    state.cleanStreak = 3;
    assert.equal(play(state, [obstacle(kind)], { jumpAt, double: true }), 0, kind);
    assert.equal(state.hearts, 99, `${kind}: cleared`);
    assert.equal(state.cleanStreak, 0, kind);
  }
});

test('a double jump after the bar has passed still makes the jump unclean (the crutch at speed)', () => {
  // At top speed a bar is past before the top of the jump, where the second press usually comes.
  const state = hyperState(HYPER_TOP);
  state.cleanStreak = 3;
  const bar = obstacle('hotdog');
  let doubledAfterPass = false;
  const services = createTestServices();
  state.obstacles = [bar];
  let now = 0, jumped = false;
  for (let f = 0; f < 600 && !(jumped && !state.dog.jumping); f++) {
    const nose = state.dog.x + DOG_HITBOX_STAND.dx + DOG_HITBOX_STAND.w;
    if (!jumped && getObstacleHitbox(bar).x - nose < 60) { jump(state, services, now); jumped = true; }
    if (jumped && !state.dog.doubleJumped && state.dog.vy >= 0) { doubledAfterPass = bar.judged; jump(state, services, now); }
    update(state, 1000 / 120, services, () => 0.5, now += 1000 / 120);
  }
  assert.ok(doubledAfterPass, 'the second press came after the bar had passed');
  assert.equal(state.hearts, 99, 'cleared');
  assert.equal(state.effects.filter(e => e.kind === 'cleanJump').length, 0, 'no CLEAN');
  assert.equal(state.cleanStreak, 0, 'and the streak breaks');
});

test('a hit breaks the streak', () => {
  const state = hyperState();
  state.cleanStreak = 3;
  play(state, [obstacle('hotdog')]);  // never jumps
  assert.ok(state.hearts < 99, 'it hit the bar');
  assert.equal(state.cleanStreak, 0);
});

test('a hit mid-jump leaves nothing in that jump to pay on landing', () => {
  // A bar cleared, then a bird hit, all in one jump: the landing pays nothing.
  const state = hyperState();
  state.cleanStreak = 3;
  play(state, [obstacle('hotdog', 400), obstacle('bird', 440)], { jumpAt: 50 });
  assert.ok(state.hearts < 99, 'the bird hit it');
  assert.equal(state.effects.filter(e => e.kind === 'cleanJump').length, 0, 'no CLEAN for the bar');
  assert.equal(state.cleanStreak, 0);
});

test('ducking under a lone bird, the safe way out, breaks the streak', () => {
  const state = hyperState();
  state.cleanStreak = 3;
  play(state, [obstacle('bird')], { duck: true });
  assert.equal(state.hearts, 99, 'ducked under it');
  assert.equal(state.cleanStreak, 0);
});

test('the unavoidable leaves the streak be: bird stacks, the chase\'s acorns, the tunnel, the flight, a tower\'s double jump', () => {
  for (const [what, obstacles] of [
    ['a bird stack', SPAWN_KINDS.birdStack(400, undefined, 4)],
    ['a thrown acorn', [makeObstacle('bird', 400, { y: BIRD_LOW_Y, skin: 'chase' })]],
  ]) {
    const state = hyperState();
    state.cleanStreak = 3;
    play(state, obstacles, { duck: true });
    assert.equal(state.hearts, 99, `${what}: ducked under it`);
    assert.equal(state.cleanStreak, 3, what);
  }
  const rolled = hyperState();
  rolled.cleanStreak = 3;
  assert.equal(play(rolled, [makeObstacle('hotdog', 400, { skin: 'chase' })], { jumpAt: 50 }), 0, 'a rolled acorn pays nothing');
  assert.equal(rolled.cleanStreak, 3, 'and leaves the streak be');

  for (const flag of ['underground', 'flying']) {
    const state = hyperState();
    state.cleanStreak = 3;
    const bar = obstacle('hotdog', 0);
    state.dog[flag] = true;
    judgeCleanJump(state, bar, 0);
    assert.equal(state.cleanStreak, 3, flag);
  }

  // A tower then a bar close behind it, in one arc: the double jump was the tower's.
  const arc = hyperState();
  arc.cleanStreak = 3;
  play(arc, [obstacle('tower', 400), obstacle('hotdog', 470)], { jumpAt: 90, double: true });
  assert.equal(arc.hearts, 99, 'cleared both');
  assert.equal(arc.cleanStreak, 3, 'the tower needed the double jump');
});

test('normal mode has no clean jumps', () => {
  const state = hyperState(0, false);
  assert.equal(play(state, [obstacle('hotdog')], { jumpAt: 50 }), 0);
  assert.equal(state.hearts, 99, 'cleared');
  assert.equal(state.effects.filter(e => e.kind === 'cleanJump').length, 0);
});

test('the streak climbs in levels to CLEAN_STREAK_MAX, and every level has a look', () => {
  const state = hyperState();
  const paid = [];
  for (let i = 0; i < CLEAN_STREAK_MAX + 2; i++) {
    const before = state.score;
    state.dog.jumping = true;
    judgeCleanJump(state, obstacle('hotdog', 0));
    state.dog.jumping = false;  // lands: the jump is settled
    settleCleanJump(state, i);
    paid.push(state.score - before);
  }
  assert.deepEqual(paid, [25, 50, 75, 100, 125, 125, 125]);
  // Each level's popup draws (a level without a look would throw).
  const ctx = new Proxy({}, { get: () => () => ({ width: 10 }) });
  for (const e of state.effects) EFFECT_DRAWERS.cleanJump(ctx, e, { now: e.startTime + 10 });
  assert.equal(new Set(state.effects.map(e => e.level)).size, CLEAN_STREAK_MAX);
});
