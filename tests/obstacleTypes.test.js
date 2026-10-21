// The obstacle registry is the one place a type is defined; these checks keep
// spawning, collision, and rendering from drifting away from it.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { OBSTACLE_TYPES, makeObstacle, chaseAcornY } from '../js/systems/obstacleTypes.js';
import { OBSTACLE_LOOKS } from '../js/render/obstacles.js';
import { COLLECT_ACTIONS } from '../js/systems/collision.js';
import { spawnObstacle } from '../js/systems/spawning.js';
import { spawnTrampRep } from '../js/systems/trampoline.js';
import { tutorialScene, TUTORIAL_STEP_COUNT } from '../js/systems/tutorial.js';
import { createState } from '../js/core/state.js';
import { CHASE_ACORN_Y, TRAMP_REPS } from '../js/config.js';
import { createSequenceRng, createTestServices } from './helpers.js';

test('every spawnable obstacle type is registered', () => {
  const seen = new Set();
  const rolls = [0.01, 0.2, 0.3, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9, 0.99];
  for (const chaseActive of [false, true]) {
    for (let i = 0; i < rolls.length; i++) {
      const state = createState(() => 0.5);
      Object.assign(state, { gameState: 'running', chaseActive, score: 600 + i * 90 });
      const rng = createSequenceRng(rolls.slice(i).concat(rolls.slice(0, i)));
      for (let n = 0; n < 40; n++) spawnObstacle(state, rng);
      state.obstacles.forEach(o => seen.add(o.type));
    }
  }
  for (let rep = 0; rep < TRAMP_REPS.length; rep++) {
    const state = createState(() => 0.5);
    spawnTrampRep(state, rep);
    state.obstacles.forEach(o => seen.add(o.type));
  }
  // The tutorial spawns its own practice obstacles, one step at a time.
  const tutorial = createState(() => 0.5);
  const scene = { id: 'tutorial', phase: 'pending', ...tutorialScene.initialData() };
  tutorialScene.start(tutorial, scene);
  for (let step = 0; step < TUTORIAL_STEP_COUNT; step++) {
    tutorial.obstacles.forEach(o => seen.add(o.type));
    tutorialScene.phases.praise(tutorial, scene, { now: Infinity, services: createTestServices() });
  }
  assert.deepEqual([...seen].sort(), Object.keys(OBSTACLE_TYPES).sort());
});

test('every registered type has a valid contact rule and a normal look', () => {
  for (const [type, def] of Object.entries(OBSTACLE_TYPES)) {
    assert.ok(['hazard', 'terrain', 'pickup', 'none'].includes(def.contact), type);
    if (def.contact === 'hazard') assert.ok(['eat', 'bonk'].includes(def.giant), `${type} giant rule`);
    if (def.contact === 'pickup') assert.equal(typeof COLLECT_ACTIONS[def.collect], 'function', `${type} collect rule`);
    assert.equal(typeof OBSTACLE_LOOKS[type]?.normal, 'function', `${type} look`);
  }
  assert.deepEqual(Object.keys(OBSTACLE_LOOKS).sort(), Object.keys(OBSTACLE_TYPES).sort());
});

test('makeObstacle fills type defaults and lets overrides win', () => {
  const h = makeObstacle('hotdog', 10);
  assert.deepEqual([h.type, h.x, h.y, h.width, h.height], ['hotdog', 10, OBSTACLE_TYPES.hotdog.y, 36, 22]);
  const t = makeObstacle('trampoline', 5, { width: 80 });
  assert.equal(t.width, 80);
  assert.equal(t.y, OBSTACLE_TYPES.trampoline.y);
});

test('chase acorns drop to duck height except on mid/high wall rows', () => {
  assert.equal(chaseAcornY({ y: 151 }), CHASE_ACORN_Y);
  assert.equal(chaseAcornY({ y: 151, aerialWall: true, wallRow: 'low' }), CHASE_ACORN_Y);
  assert.equal(chaseAcornY({ y: 98, aerialWall: true, wallRow: 'high' }), 98);
});
