// Hyper mode (core/speed.js): faster from the start and climbing faster, with
// the bosses, the frenzy, and the obstacle ease-in following speed; no
// tutorial and no golden hot dog; its own leaderboard board.

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
import { HYPER_UNLOCK_AT, isHyperUnlocked } from '../js/systems/hyper.js';
import {
  SPEED_PROFILES, MAX_SPEED, FRENZY_SPEED, BOSS_SPEEDS, PATTERN_CHANCE, SPAWN_MIX, BIRD_WALL_FIRST_AT, GIANT_FIRST_AT, HYPER_LEVEL,
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

test('a hyper run goes on the HYPER board, and not on the device\'s list', () => {
  const storage = createFakeStorage();
  const asked = [];
  const globalScores = { placement: (score, board) => { asked.push(board); return 1; }, submit() {}, refreshIfStale() {} };
  const state = runningState(9000);
  Object.assign(state, { gameState: 'dead', difficulty: HYPER_LEVEL.label });
  createScoreRecorder({ storage, globalScores }).recordRun(state);
  assert.deepEqual(asked, ['HYPER']);
  assert.deepEqual(state.pendingScore, { score: 9000, difficulty: 'HYPER', placement: 1 }, 'the name prompt opens for it');
  assert.equal(state.highScore, 0, 'the HUD\'s HI and the unlock stay normal runs\'');
  assert.deepEqual(state.highScores, []);
  assert.deepEqual(storage.dump(), {});
});

// --- Unlocking it ---

test('hyper unlocks at 2000, the score where a normal run reaches hyper\'s starting speed', () => {
  assert.equal(HYPER_UNLOCK_AT, 2000);
  assert.equal(speedAt(HYPER_UNLOCK_AT, normal), hyper.start);
  const best = (list, session = 0) => Object.assign(createState(() => 0.5), { highScores: list, highScore: session });
  assert.ok(!isHyperUnlocked(best([])));
  assert.ok(!isHyperUnlocked(best([{ name: '', score: 1999 }])));
  assert.ok(isHyperUnlocked(best([{ name: '', score: 2000 }])), 'the device\'s best');
  assert.ok(isHyperUnlocked(best([], 2400)), 'or this session\'s');
});

// Plays a normal-mode run from just under the mark past it; the popups it raised.
function crossTheMark(setup = () => {}) {
  const state = runningState(HYPER_UNLOCK_AT - 0.5, false);
  state.nextObstacleIn = Infinity;
  setup(state);
  const services = createTestServices();
  let now = 0;
  for (let f = 0; f < 300; f++) update(state, 1000 / 120, services, () => 0.5, now += 1000 / 120);
  assert.ok(state.score > HYPER_UNLOCK_AT);
  return state.effects.filter(e => e.kind === 'hyperUnlocked').length;
}

test('the run that first crosses 2000 says HYPER MODE UNLOCKED!, once', () => {
  assert.equal(crossTheMark(), 1);
  assert.equal(crossTheMark(s => { s.highScore = 2100; }), 0, 'already unlocked');
  assert.equal(crossTheMark(s => { s.scoreBoosted = true; }), 0, 'a boosted run unlocks nothing');
  assert.equal(crossTheMark(s => { s.hyper = true; s.score = HYPER_UNLOCK_AT - 0.5; }), 0, 'not from hyper');
});
