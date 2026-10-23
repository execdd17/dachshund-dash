// Hyper's clean jumps (systems/cleanJump.js): a chocolate bar cleared with a
// single jump pays, more at lower speeds, times the streak; a double jump
// while clearing it, running into it, or normal mode pays nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../js/core/state.js';
import { update } from '../js/systems/update.js';
import { jump } from '../js/systems/control.js';
import { makeObstacle, getObstacleHitbox } from '../js/systems/obstacleTypes.js';
import { cleanJumpPoints, judgeCleanJump } from '../js/systems/cleanJump.js';
import { EFFECT_DRAWERS } from '../js/render/effects.js';
import { CLEAN_JUMP_POINTS, CLEAN_STREAK_MAX, MAX_SPEED, SPEED_PROFILES, DOG_HITBOX_STAND } from '../js/config.js';
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

// One bar, played with the real physics: jump when its hitbox is `jumpAt` px
// past the dog's nose, and with `double`, again at the top of that jump.
function playBar(state, { jumpAt, double = false }) {
  const services = createTestServices();
  const bar = makeObstacle('hotdog', 400);
  state.obstacles = [bar];
  let now = 0, jumped = false, doubled = false;
  const startScore = state.score;
  for (let f = 0; f < 600 && !bar.judged && state.obstacles.includes(bar); f++) {
    const nose = state.dog.x + DOG_HITBOX_STAND.dx + DOG_HITBOX_STAND.w;
    if (!jumped && getObstacleHitbox(bar).x - nose < jumpAt) { jump(state, services, now); jumped = true; }
    if (double && jumped && !doubled && state.dog.vy >= 0) { jump(state, services, now); doubled = true; }
    update(state, 1000 / 120, services, () => 0.5, now += 1000 / 120);
  }
  const cleanEffects = state.effects.filter(e => e.kind === 'cleanJump');
  return { bonus: cleanEffects.reduce((sum, e) => sum + e.points, 0), effects: cleanEffects, scored: state.score - startScore };
}

test('a clean jump pays 25 at hyper\'s starting speed, tapering to 5 at top speed', () => {
  assert.equal(cleanJumpPoints(SPEED_PROFILES.hyper.start), CLEAN_JUMP_POINTS.atStart);
  assert.equal(cleanJumpPoints(MAX_SPEED), CLEAN_JUMP_POINTS.atTop);
  assert.equal(cleanJumpPoints((SPEED_PROFILES.hyper.start + MAX_SPEED) / 2), 15);
  assert.ok(cleanJumpPoints(5) < cleanJumpPoints(4.5));
});

test('a single jump over a chocolate bar in hyper pays and starts the streak', () => {
  for (const [score, points] of [[0, 25], [HYPER_TOP, 5]]) {
    const state = hyperState(score);
    const { bonus, effects } = playBar(state, { jumpAt: 50 });
    assert.equal(bonus, points, `at score ${score}`);
    assert.equal(effects[0].level, 1);
    assert.equal(state.cleanStreak, 1);
    assert.equal(state.hearts, 99, 'cleared, not hit');
  }
});

test('a double jump while clearing the bar pays nothing and breaks the streak', () => {
  const state = hyperState();
  state.cleanStreak = 3;
  const { bonus } = playBar(state, { jumpAt: 120, double: true });
  assert.equal(state.hearts, 99, 'cleared');
  assert.equal(bonus, 0);
  assert.equal(state.cleanStreak, 0);
});

test('running into a bar breaks the streak; normal mode pays no clean jumps', () => {
  const hit = hyperState();
  hit.cleanStreak = 3;
  playBar(hit, { jumpAt: -Infinity });  // never jumps
  assert.ok(hit.hearts < 99, 'it hit the bar');
  assert.equal(hit.cleanStreak, 0);

  const normal = hyperState(0, false);
  const { bonus, effects } = playBar(normal, { jumpAt: 50 });
  assert.equal(normal.hearts, 99, 'cleared');
  assert.equal(bonus, 0);
  assert.equal(effects.length, 0);
});

test('the streak climbs in levels to CLEAN_STREAK_MAX, and every level has a look', () => {
  const state = hyperState();
  Object.assign(state.dog, { jumping: true, doubleJumped: false });
  const paid = [];
  for (let i = 0; i < CLEAN_STREAK_MAX + 2; i++) {
    const before = state.score;
    judgeCleanJump(state, makeObstacle('hotdog', 0), i);
    paid.push(state.score - before);
  }
  assert.deepEqual(paid, [25, 50, 75, 100, 125, 125, 125]);
  // Each level's popup draws (a level without a look would throw).
  const ctx = new Proxy({}, { get: () => () => ({ width: 10 }) });
  for (const e of state.effects) EFFECT_DRAWERS.cleanJump(ctx, e, { now: e.startTime + 10 });
  assert.equal(new Set(state.effects.map(e => e.level)).size, CLEAN_STREAK_MAX);
});
