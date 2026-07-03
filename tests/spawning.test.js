import { test } from 'node:test';
import assert from 'node:assert/strict';

import { spawnObstacle } from '../js/systems/spawning.js';
import { createState } from '../js/core/state.js';
import {
  W, GROUND_Y, SQUIRREL_OFFSET, GIANT_FIRST_AT, MIN_OBSTACLE_GAP,
} from '../js/config.js';
import { createSequenceRng } from './helpers.js';

test('early game spawns only hotdogs regardless of roll', () => {
  const state = createState(() => 0.5);
  state.score = 50; // below frisbee (80) and stack (150) thresholds
  spawnObstacle(state, createSequenceRng([0.0]));
  assert.equal(state.obstacles.length, 1);
  assert.equal(state.obstacles[0].type, 'hotdog');
  assert.equal(state.obstacles[0].x, W + 10);
});

test('stack spawns past score 150 on a low roll', () => {
  const state = createState(() => 0.5);
  state.score = 200;
  spawnObstacle(state, createSequenceRng([0.1]));
  assert.equal(state.obstacles[0].type, 'stack');
});

test('frisbee roll past score 80 spawns bird or stacked frisbee pair', () => {
  // Second rng value 0.4 (< 0.5) → bird
  let state = createState(() => 0.5);
  state.score = 100;
  spawnObstacle(state, createSequenceRng([0.3, 0.4]));
  assert.deepEqual(state.obstacles.map(o => o.type), ['bird']);

  // Second rng value 0.9 (>= 0.5) → two stacked frisbees
  state = createState(() => 0.5);
  state.score = 100;
  spawnObstacle(state, createSequenceRng([0.3, 0.9]));
  assert.deepEqual(state.obstacles.map(o => o.type), ['frisbee', 'frisbee']);
  assert.ok(state.obstacles[1].y < state.obstacles[0].y);
});

test('chase mode spawns acorn-skinned obstacles at the squirrel offset', () => {
  const state = createState(() => 0.5);
  state.score = 100;
  state.chaseActive = true;
  spawnObstacle(state, createSequenceRng([0.99]));
  assert.equal(state.obstacles[0].skin, 'chase');
  assert.equal(state.obstacles[0].x, state.dog.x + SQUIRREL_OFFSET);
});

test('golden hot dog spawns when eligible and roll succeeds', () => {
  const state = createState(() => 0.5);
  state.score = GIANT_FIRST_AT + 700; // past first-at + cooldown
  spawnObstacle(state, createSequenceRng([0.01, 0.5]));
  assert.equal(state.obstacles[0].type, 'golden');
  assert.equal(state.lastGoldenSpawnScore, state.score);
});

test('golden hot dog never spawns below GIANT_FIRST_AT', () => {
  const state = createState(() => 0.5);
  state.score = GIANT_FIRST_AT - 1;
  spawnObstacle(state, createSequenceRng([0.0, 0.99]));
  assert.notEqual(state.obstacles[0].type, 'golden');
});

test('golden hot dog respects cooldown and encounter exclusions', () => {
  const state = createState(() => 0.5);
  state.score = GIANT_FIRST_AT + 700;
  state.lastGoldenSpawnScore = state.score - 10; // within cooldown
  spawnObstacle(state, createSequenceRng([0.0, 0.99]));
  assert.notEqual(state.obstacles[0].type, 'golden');

  const state2 = createState(() => 0.5);
  state2.score = GIANT_FIRST_AT + 700;
  state2.bossChasing = true;
  spawnObstacle(state2, createSequenceRng([0.0, 0.99]));
  assert.notEqual(state2.obstacles[0].type, 'golden');
});

test('type switch pads the next obstacle gap', () => {
  const state = createState(() => 0.5);
  state.score = 100;
  state.lastObstacleType = 'hotdog';
  state.nextObstacleIn = 0;
  spawnObstacle(state, createSequenceRng([0.3, 0.9, 0.0])); // frisbee after hotdog
  assert.ok(state.nextObstacleIn >= MIN_OBSTACLE_GAP * 1.5);
  assert.equal(state.lastObstacleType, 'frisbee');
});

test('spawned ground obstacles sit at ground level', () => {
  const state = createState(() => 0.5);
  spawnObstacle(state, createSequenceRng([0.99]));
  assert.equal(state.obstacles[0].y, GROUND_Y + 4);
});
