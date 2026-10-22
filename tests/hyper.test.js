// Hyper mode (core/speed.js): faster from the start and climbing faster, with
// the bosses, the frenzy, and the obstacle ease-in following speed; no
// leaderboard, no tutorial, and no golden hot dog.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../js/core/state.js';
import { speedAt, runSpeed, paceOf, scoreAtSpeed } from '../js/core/speed.js';
import { update } from '../js/systems/update.js';
import { bossScene } from '../js/systems/boss.js';
import { tutorialScene } from '../js/systems/tutorial.js';
import { inFrenzy } from '../js/systems/frenzy.js';
import { patternChance, spawnObstacle } from '../js/systems/spawning.js';
import { createScoreRecorder } from '../js/leaderboard/recorder.js';
import {
  SPEED_PROFILES, MAX_SPEED, FRENZY_SPEED, BOSS_SPEEDS, PATTERN_CHANCE, SPAWN_MIX, BIRD_WALL_FIRST_AT, GIANT_FIRST_AT,
} from '../js/config.js';
import { createTestServices, createFakeStorage, createSequenceRng } from './helpers.js';

const { normal, hyper } = SPEED_PROFILES;

function runningState(score, isHyper = true) {
  const state = createState(() => 0.5);
  Object.assign(state, { gameState: 'running', hyper: isHyper, score });
  state.startingHearts = state.hearts = 99;
  return state;
}

test('hyper starts faster and climbs faster, to the same top speed', () => {
  assert.ok(hyper.start > normal.start && hyper.perPoint > normal.perPoint);
  assert.equal(runSpeed(runningState(0)), hyper.start);
  assert.equal(runSpeed(runningState(0, false)), normal.start);
  assert.equal(speedAt(1e6, hyper), MAX_SPEED);
  const state = runningState(0);
  update(state, 1000 / 120, createTestServices(), () => 0.5, 10);
  assert.equal(state.speed, hyper.start, 'update() keeps state.speed on the hyper curve');
});

test('hyper starts below every boss speed but the first, and its bosses come at their speeds', () => {
  assert.ok(hyper.start < BOSS_SPEEDS[1], 'the second boss still comes');
  const asked = isHyper => {
    const memory = {};
    const out = [];
    for (let score = 0; score <= 9000; score += 25) {
      if (bossScene.wantsTurn(runningState(score, isHyper), memory)) out.push(score);
    }
    return out;
  };
  assert.deepEqual(asked(false), BOSS_SPEEDS.map(s => scoreAtSpeed(s, normal)));
  assert.deepEqual(asked(true), BOSS_SPEEDS.filter(s => s > hyper.start).map(s => scoreAtSpeed(s, hyper)),
    'not one at the start for the speed hyper begins past');
});

test('the frenzy comes at its speed, which hyper reaches far sooner', () => {
  const frenzyScore = isHyper => {
    const state = runningState(0, isHyper);
    state.startingHearts = state.hearts = 1e9;
    const services = createTestServices();
    let now = 0;
    while (!inFrenzy(state)) update(state, 1000 / 120, services, Math.random, now += 1000 / 120);
    return { score: state.score, speed: runSpeed(state), seconds: now / 1000 };
  };
  const h = frenzyScore(true);
  assert.ok(h.speed >= FRENZY_SPEED);
  assert.ok(h.score < scoreAtSpeed(FRENZY_SPEED, hyper) + 400, `hyper frenzy at ${Math.round(h.score)}`);
  const n = frenzyScore(false);
  assert.ok(h.seconds < n.seconds / 2, `hyper reaches it in ${h.seconds.toFixed(0)}s, normal in ${n.seconds.toFixed(0)}s`);
});

test('hyper starts past the whole obstacle ease-in', () => {
  const state = runningState(0);
  const pace = paceOf(state);
  assert.ok(pace >= PATTERN_CHANCE.fullAt, `pace ${pace}`);
  assert.ok(Math.abs(patternChance(pace) - PATTERN_CHANCE.full) < 1e-9, 'patterns at full chance');
  assert.ok(pace > SPAWN_MIX.tower.after && pace > SPAWN_MIX.frisbee.after && pace >= BIRD_WALL_FIRST_AT);
  assert.equal(paceOf(runningState(180, false)), 180, 'a normal run\'s pace is its score, exactly');
});

test('a hyper run can spawn a tower in its first second; a normal one cannot', () => {
  const spawned = isHyper => {
    const state = runningState(0, isHyper);
    spawnObstacle(state, createSequenceRng([0.99, 0.0, 0.0, 0.0]));  // no pattern, then the lowest solo roll
    return state.obstacles[0].type;
  };
  assert.equal(spawned(true), 'tower');
  assert.notEqual(spawned(false), 'tower');
});

test('no golden hot dog in hyper mode', () => {
  const golden = isHyper => {
    const state = runningState(GIANT_FIRST_AT + 1000, isHyper);
    spawnObstacle(state, createSequenceRng([0.0, 0.99, 0.99]));  // a winning golden roll
    return state.obstacles[0].type === 'golden';
  };
  assert.ok(golden(false), 'a normal run gets it on that roll');
  assert.ok(!golden(true));
});

test('the tutorial waits for a normal run', () => {
  const state = runningState(0);
  state.tutorialPending = true;
  assert.ok(!tutorialScene.wantsTurn(state, {}));
  state.hyper = false;
  assert.ok(tutorialScene.wantsTurn(state, {}));
});

test('a hyper run records nothing: no leaderboard, no local best', () => {
  const storage = createFakeStorage();
  const submitted = [];
  const globalScores = { placement: () => 1, submit: (...a) => submitted.push(a), refreshIfStale() {} };
  const state = runningState(9000);
  state.gameState = 'dead';
  createScoreRecorder({ storage, globalScores }).recordRun(state);
  assert.equal(state.pendingScore, null);
  assert.equal(state.highScore, 0);
  assert.deepEqual(state.highScores, []);
  assert.deepEqual(storage.dump(), {});
  assert.deepEqual(submitted, []);
});
