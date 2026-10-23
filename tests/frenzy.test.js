// The frenzy (systems/frenzy.js): the drop at FRENZY_SPEED, what holds it
// back, the boss it puts first, the scenes it skips, and hazards bursting
// once the dog is past them.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../js/core/state.js';
import { update } from '../js/systems/update.js';
import { jump } from '../js/systems/control.js';
import { stepFrenzy, inFrenzy } from '../js/systems/frenzy.js';
import { makeObstacle } from '../js/systems/obstacleTypes.js';
import { activateGiantMode } from '../js/systems/giant.js';
import { setScenePhase } from '../js/systems/scenes.js';
import { W, FRENZY_SPEED, FRENZY_DROP_CALM, BIRD_JUMP_BONUS } from '../js/config.js';
import { createTestServices, normalScoreAt } from './helpers.js';

const FRENZY_AT = normalScoreAt(FRENZY_SPEED);  // the frenzy's speed, in a normal run

function runningState(score) {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.startingHearts = state.hearts = 99;
  state.score = score;
  state.nextObstacleIn = 0;
  return state;
}
const kinds = state => state.effects.map(e => e.kind);

test('the drop: at FRENZY_AT everything on screen bursts and the field clears for the boss', () => {
  const state = runningState(FRENZY_AT - 1);
  state.obstacles = [
    makeObstacle('hotdog', 300), makeObstacle('bird', 500, { y: 150 }), makeObstacle('bone', 400),
    makeObstacle('golden', 600), makeObstacle('tower', W + 50),
  ];
  stepFrenzy(state, createTestServices(), 1000);
  assert.ok(!inFrenzy(state), 'not before the score gets there');
  state.score = FRENZY_AT;
  stepFrenzy(state, createTestServices(), 2000);
  assert.equal(state.frenzyAt, 2000);
  assert.deepEqual(state.obstacles, [], 'no golden hot dog left to beat the boss to it');
  assert.equal(kinds(state).filter(k => k === 'burst').length, 4, 'the four on screen burst');
  assert.ok(kinds(state).includes('frenzyDrop'));
  assert.equal(state.scene?.id, 'boss');
  assert.ok(state.nextObstacleIn >= FRENZY_DROP_CALM, 'a breath before the next spawn');
  stepFrenzy(state, createTestServices(), 3000);
  assert.equal(state.frenzyAt, 2000, 'it drops once');
});

test('the drop waits for giant mode and for a running scene, but not for one still waiting its turn', () => {
  const services = createTestServices();
  const giant = runningState(FRENZY_AT);
  activateGiantMode(giant, services, 0);
  stepFrenzy(giant, createTestServices(), 100);
  assert.ok(!inFrenzy(giant));
  giant.giantPhase = 'off';
  stepFrenzy(giant, createTestServices(), 200);
  assert.ok(inFrenzy(giant));

  const scene = runningState(FRENZY_AT);
  setScenePhase(scene, 'chase', 'active');
  stepFrenzy(scene, createTestServices(), 100);
  assert.ok(!inFrenzy(scene));
  setScenePhase(scene, 'chase', 'pending');
  stepFrenzy(scene, createTestServices(), 200);
  assert.ok(inFrenzy(scene), 'the drop clears the field the waiting scene needs');
});

test('after the drop a hazard the dog gets past bursts behind it, scenes included; anything ahead, pickups, and giant mode do not', () => {
  const state = runningState(FRENZY_AT);
  state.frenzyAt = 1;
  const dogX = state.dog.x;
  state.obstacles = [
    makeObstacle('hotdog', dogX - 37), makeObstacle('hotdog', dogX - 30), makeObstacle('bone', dogX - 40),
  ];
  stepFrenzy(state, createTestServices(), 500);
  assert.deepEqual(state.obstacles.map(o => o.x), [dogX - 30, dogX - 40], 'only the one wholly behind the dog');
  assert.deepEqual(kinds(state), ['burst']);

  setScenePhase(state, 'flight', 'active');
  state.obstacles = [makeObstacle('bird', dogX - 120, { y: 100, aerialWall: true })];
  stepFrenzy(state, createTestServices(), 600);
  assert.equal(state.obstacles.length, 0, 'a gate bird behind the flying dog bursts too');

  state.scene = null;
  activateGiantMode(state, createTestServices(), 700);
  state.obstacles = [makeObstacle('hotdog', dogX - 60)];
  stepFrenzy(state, createTestServices(), 800);
  assert.equal(state.obstacles.length, 1, 'giant mode keeps its own field');
});

test('the boss opens the frenzy and never comes again; the tunnel is out', () => {
  const state = runningState(FRENZY_AT);
  state.sceneQueue = ['chase', 'tunnel', 'flight'];
  setScenePhase(state, 'tramp', 'pending');
  stepFrenzy(state, createTestServices(), 1000);
  assert.equal(state.scene?.id, 'boss', 'the boss takes the slot');
  assert.deepEqual(state.sceneQueue, ['tramp', 'chase', 'flight'], 'the waiting trampoline goes next; the tunnel is out');

  // Over many thousands of points in the frenzy, the opener is the only boss,
  // and no tunnel comes.
  const services = createTestServices();
  state.sceneQueue = [];
  const asked = new Set();
  let bossRuns = 1;  // the opener, in the slot now
  let now = 2000;
  for (let f = 0; f < 60000 && state.gameState === 'running'; f++) {
    const before = state.scene?.id;
    update(state, 1000 / 120, services, Math.random, now += 1000 / 120);
    state.sceneQueue.forEach(id => asked.add(id));
    if (state.scene) asked.add(state.scene.id);
    if (state.scene?.id === 'boss' && before !== 'boss') bossRuns++;
    state.hearts = 99;
  }
  assert.ok(state.score > FRENZY_AT + 4000, `played far into the frenzy (${Math.round(state.score)})`);
  assert.equal(bossRuns, 1, 'the boss never comes again');
  assert.ok(!state.sceneQueue.includes('boss'));
  assert.ok(!asked.has('tunnel'), [...asked].join(', '));
  assert.ok(asked.has('chase') && asked.has('flight'), 'other scenes still come');
});

test('in a real run the boss is on as the drop happens, whatever was on the field', () => {
  const services = createTestServices();
  for (const seed of [1, 2, 3, 4, 5]) {
    let n = seed;
    const rng = () => { n = (n * 16807) % 2147483647; return n / 2147483647; };
    const state = runningState(FRENZY_AT - 200);
    state.startingHearts = state.hearts = 999;
    let now = 0;
    while (!inFrenzy(state)) update(state, 1000 / 120, services, rng, now += 1000 / 120);
    assert.equal(state.scene?.id, 'boss', `seed ${seed}`);
    assert.equal(state.scene.phase, 'active', `seed ${seed}: started in the drop's own frame`);
  }
});

test('a bird jumped in the frenzy still pays its bonus before it blows up', () => {
  const state = runningState(FRENZY_AT);
  state.frenzyAt = 1;
  state.nextObstacleIn = Infinity;
  state.obstacles = [makeObstacle('bird', state.dog.x + 160, { y: 150 })];
  const services = createTestServices();
  let now = 0;
  jump(state, services, now);
  const before = state.score;
  for (let f = 0; f < 400 && state.obstacles.length; f++) update(state, 1000 / 120, services, () => 0.5, now += 1000 / 120);
  assert.equal(state.obstacles.length, 0);
  assert.ok(state.score - before >= BIRD_JUMP_BONUS, 'bonus paid');
  assert.ok(kinds(state).includes('birdJump') && kinds(state).includes('burst'));
});

test('a run in the frenzy plays on: the drop happens inside update(), and play continues after it', () => {
  const state = runningState(FRENZY_AT - 0.5);
  const services = createTestServices();
  let now = 0;
  for (let f = 0; f < 3000 && state.gameState === 'running'; f++) update(state, 1000 / 120, services, Math.random, now += 1000 / 120);
  assert.ok(inFrenzy(state));
  assert.ok(state.score > FRENZY_AT + 100);
});
