import { test } from 'node:test';
import assert from 'node:assert/strict';

import { spawnObstacle, SPAWN_PATTERNS } from '../js/systems/spawning.js';
import { createState } from '../js/core/state.js';
import {
  W, GROUND_Y, SQUIRREL_OFFSET, GIANT_FIRST_AT, MIN_OBSTACLE_GAP,
  BIRD_HIGH_Y, BIRD_LOW_Y, BIRD_TRI_DX, BIRD_TRI_ROW2_DX,
  BIRD_WALL_MID_Y, BIRD_WALL_HIGH_Y, PATTERN_CLOSE_GAP, BIRD_WALL_FIRST_AT,
  PATTERN_CHANCE,
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
  spawnObstacle(state, createSequenceRng([0.99, 0.1]));
  assert.equal(state.obstacles[0].type, 'stack');
});

test('frisbee roll past score 80 spawns bird or stacked frisbee pair', () => {
  // Third rng value 0.4 (< 0.5) → bird
  let state = createState(() => 0.5);
  state.score = 100;
  spawnObstacle(state, createSequenceRng([0.3, 0.4]));
  assert.deepEqual(state.obstacles.map(o => o.type), ['bird']);

  // Third rng value 0.9 (>= 0.5) → two stacked frisbees
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

test('bird stack spawns two vertically aligned birds past BIRD_WALL_FIRST_AT', () => {
  const state = createState(() => 0.5);
  state.score = BIRD_WALL_FIRST_AT;
  spawnObstacle(state, createSequenceRng([0.99, 0.2, 0.1]));
  assert.equal(state.obstacles.length, 2);
  assert.ok(state.obstacles.every(o => o.type === 'bird' && o.aerialWall));
  assert.deepEqual(state.obstacles.map(o => o.y), [BIRD_HIGH_Y, BIRD_LOW_Y]);
});

test('bird triangle: low pair, mid pair, lowered high pair', () => {
  const state = createState(() => 0.5);
  state.score = BIRD_WALL_FIRST_AT;
  const spawnX = W + 10;
  spawnObstacle(state, createSequenceRng([0.99, 0.2, 0.5]));
  assert.equal(state.obstacles.length, 6);
  assert.ok(state.obstacles.every(o => o.type === 'bird' && o.aerialWall));
  assert.deepEqual(state.obstacles.map(o => o.wallRow), [
    'low', 'low', 'mid', 'mid', 'high', 'high',
  ]);
  assert.deepEqual(state.obstacles.map(o => o.y), [
    BIRD_LOW_Y, BIRD_LOW_Y,
    BIRD_WALL_MID_Y, BIRD_WALL_MID_Y,
    BIRD_WALL_HIGH_Y, BIRD_WALL_HIGH_Y,
  ]);
  assert.equal(state.obstacles[0].x, spawnX - BIRD_TRI_DX);
  assert.equal(state.obstacles[1].x, spawnX + BIRD_TRI_DX);
  assert.equal(state.obstacles[2].x, spawnX - BIRD_TRI_ROW2_DX);
  assert.equal(state.obstacles[3].x, spawnX + BIRD_TRI_ROW2_DX);
  assert.equal(state.obstacles[4].x, spawnX - BIRD_TRI_ROW2_DX);
  assert.equal(state.obstacles[5].x, spawnX + BIRD_TRI_ROW2_DX);
});

test('spawn pattern arms on a low roll and sets close gap between beats', () => {
  const state = createState(() => 0.5);
  state.score = 200;
  state.lastObstacleType = 'hotdog';
  spawnObstacle(state, createSequenceRng([PATTERN_CHANCE - 0.01, 0.0]));
  assert.ok(state.activeSpawnPattern);
  assert.equal(state.obstacles.length, 2); // frisbeeHotdog opens with a pair
  assert.equal(state.nextObstacleIn, PATTERN_CLOSE_GAP);
});

test('pattern second beat spawns on the next call', () => {
  const state = createState(() => 0.5);
  state.score = 200;
  state.activeSpawnPattern = { ...SPAWN_PATTERNS[0], index: 0 };
  spawnObstacle(state, createSequenceRng([0.99]));
  assert.equal(state.obstacles.length, 2);
  assert.equal(state.obstacles[0].type, 'frisbee');
  assert.equal(state.nextObstacleIn, PATTERN_CLOSE_GAP);

  state.nextObstacleIn = 0;
  spawnObstacle(state, createSequenceRng([0.99]));
  assert.equal(state.obstacles.length, 3);
  assert.equal(state.obstacles[2].type, 'hotdog');
  assert.equal(state.activeSpawnPattern, null);
});
