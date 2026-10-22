import { test } from 'node:test';
import assert from 'node:assert/strict';

import { spawnObstacle, SPAWN_PATTERNS, patternChance } from '../js/systems/spawning.js';
import { towerSize } from '../js/systems/obstacleTypes.js';
import { createState } from '../js/core/state.js';
import {
  W, GROUND_Y, SQUIRREL_OFFSET, GIANT_FIRST_AT, GIANT_COOLDOWN, MIN_OBSTACLE_GAP,
  BIRD_LOW_Y, BIRD_STACK_HIGH_Y, BIRD_STACK_MID_Y,
  PATTERN_CLOSE_GAP, BIRD_WALL_FIRST_AT,
  PATTERN_CHANCE, PATTERN_FIRST_AT, TOWER_BARS, TOWER_TALL_FROM_SPEED,
} from '../js/config.js';
import { setScenePhase } from '../js/systems/scenes.js';
import { markSceneEnd } from '../js/systems/encounters.js';
import { activateGiantMode, deactivateGiantMode } from '../js/systems/giant.js';
import { createSequenceRng, createTestServices } from './helpers.js';

test('early game spawns only hotdogs regardless of roll', () => {
  const state = createState(() => 0.5);
  state.score = 50; // below the frisbee (80) and tower (400) thresholds
  spawnObstacle(state, createSequenceRng([0.0]));
  assert.equal(state.obstacles.length, 1);
  assert.equal(state.obstacles[0].type, 'hotdog');
  assert.equal(state.obstacles[0].x, W + 10);
});

test('tower spawns past score 400 on a low roll, not before', () => {
  const state = createState(() => 0.5);
  state.score = 450;
  spawnObstacle(state, createSequenceRng([0.99, 0.1]));
  assert.equal(state.obstacles[0].type, 'tower');
  const early = createState(() => 0.5);
  early.score = 350;
  spawnObstacle(early, createSequenceRng([0.99, 0.1]));
  assert.notEqual(early.obstacles[0].type, 'tower');
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
  setScenePhase(state, 'chase', 'active');
  spawnObstacle(state, createSequenceRng([0.99]));
  assert.equal(state.obstacles[0].skin, 'chase');
  assert.equal(state.obstacles[0].x, state.dog.x + SQUIRREL_OFFSET);
});

test('golden hot dog spawns when eligible and roll succeeds', () => {
  const state = createState(() => 0.5);
  state.score = GIANT_FIRST_AT + 700; // past first-at + cooldown
  spawnObstacle(state, createSequenceRng([0.01, 0.5]));
  assert.equal(state.obstacles[0].type, 'golden');
  assert.equal(state.lastGoldenScore, state.score);
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
  state.lastGoldenScore = state.score - 10; // within cooldown
  spawnObstacle(state, createSequenceRng([0.0, 0.99]));
  assert.notEqual(state.obstacles[0].type, 'golden');

  const state2 = createState(() => 0.5);
  state2.score = GIANT_FIRST_AT + 700;
  setScenePhase(state2, 'boss', 'active');
  spawnObstacle(state2, createSequenceRng([0.0, 0.99]));
  assert.notEqual(state2.obstacles[0].type, 'golden');
});

// Spawns once with a winning golden roll; true if it was a golden.
function goldenRoll(state) {
  state.obstacles = [];
  spawnObstacle(state, createSequenceRng([0.0, 0.99]));
  return state.obstacles[0]?.type === 'golden';
}

test('no golden while a boss waits for its turn', () => {
  const state = createState(() => 0.5);
  state.score = GIANT_FIRST_AT + 700;
  state.sceneQueue = ['boss', 'tramp'];
  assert.ok(!goldenRoll(state), 'the boss is waiting');
  state.sceneQueue = ['tramp'];
  assert.ok(goldenRoll(state), 'another scene waiting is fine');
});

test('the golden cooldown counts from the end of its giant mode', () => {
  // One giant mode earns more than the cooldown, so counting from the spawn
  // would let the next golden roll in the moment it ends.
  const services = createTestServices();
  const state = createState(() => 0.5);
  state.score = GIANT_FIRST_AT;
  assert.ok(goldenRoll(state));
  markSceneEnd(state, 0);  // a scene in between, so only the cooldown is in play
  activateGiantMode(state, services, 0);
  state.score += GIANT_COOLDOWN * 2;  // what a giant mode earns
  deactivateGiantMode(state, services, 15000);
  state.giantPhase = 'off';
  state.score += GIANT_COOLDOWN - 1;
  assert.ok(!goldenRoll(state), 'still cooling down after the giant ended');
  state.score += 1;
  assert.ok(goldenRoll(state));
});

test('one golden per stretch between scenes, eaten or missed', () => {
  const state = createState(() => 0.5);
  state.score = GIANT_FIRST_AT;
  assert.ok(goldenRoll(state));
  state.score += GIANT_COOLDOWN * 10;  // a missed golden: no giant mode, cooldown long over
  assert.ok(!goldenRoll(state), 'no second golden before a scene runs');
  markSceneEnd(state, 0);
  assert.ok(goldenRoll(state), 'a scene ended: the next stretch gets its golden');
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

test('bird stack spawns a column of three past BIRD_WALL_FIRST_AT', () => {
  const state = createState(() => 0.5);
  state.score = BIRD_WALL_FIRST_AT;
  spawnObstacle(state, createSequenceRng([0.2, 0.1]));  // below PATTERN_FIRST_AT: no pattern roll
  assert.equal(state.obstacles.length, 3);
  assert.ok(state.obstacles.every(o => o.type === 'bird' && o.aerialWall && o.x === W + 10));
  assert.deepEqual(state.obstacles.map(o => o.y), [BIRD_STACK_HIGH_Y, BIRD_STACK_MID_Y, BIRD_LOW_Y]);
  assert.deepEqual(state.obstacles.map(o => o.wallRow), ['high', 'mid', 'low']);
});

test('spawn pattern arms on a low roll and sets close gap between beats', () => {
  const state = createState(() => 0.5);
  state.score = PATTERN_FIRST_AT;  // below GIANT_FIRST_AT, so no golden roll comes first
  state.lastObstacleType = 'hotdog';
  spawnObstacle(state, createSequenceRng([PATTERN_CHANCE.start - 0.01, 0.0]));
  assert.ok(state.activeSpawnPattern);
  assert.equal(state.obstacles.length, 2); // frisbeeHotdog opens with a pair
  assert.equal(state.nextObstacleIn, PATTERN_CLOSE_GAP);
});

test('pattern chance eases in: none before PATTERN_FIRST_AT, ramping to full', () => {
  assert.equal(patternChance(PATTERN_FIRST_AT - 1), 0);
  assert.equal(patternChance(PATTERN_FIRST_AT), PATTERN_CHANCE.start);
  const mid = patternChance((PATTERN_FIRST_AT + PATTERN_CHANCE.fullAt) / 2);
  assert.ok(Math.abs(mid - (PATTERN_CHANCE.start + PATTERN_CHANCE.full) / 2) < 1e-9);
  assert.ok(Math.abs(patternChance(PATTERN_CHANCE.fullAt) - PATTERN_CHANCE.full) < 1e-9);
  assert.ok(Math.abs(patternChance(PATTERN_CHANCE.fullAt * 3) - PATTERN_CHANCE.full) < 1e-9);
});

test('tower grows with speed: short early, tall from TOWER_TALL_FROM_SPEED', () => {
  const spawnTower = speed => {
    const state = createState(() => 0.5);
    state.score = 450;
    state.speed = speed;
    spawnObstacle(state, createSequenceRng([0.99, 0.1]));
    return state.obstacles[0];
  };
  assert.equal(spawnTower(TOWER_TALL_FROM_SPEED - 0.01).height, towerSize(TOWER_BARS.short).height);
  assert.equal(spawnTower(TOWER_TALL_FROM_SPEED).height, towerSize(TOWER_BARS.tall).height);
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
