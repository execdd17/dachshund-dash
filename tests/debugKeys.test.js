// Debug keys run their command only when it applies.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEBUG_KEYS, runDebugKey } from '../js/input/debug.js';
import { createState } from '../js/core/state.js';
import { getScenePhase } from '../js/systems/scenes.js';

test('scene and golden keys only act mid-run', () => {
  const state = createState(() => 0.5);
  state.gameState = 'idle';
  assert.equal(runDebugKey('KeyC', state, {}), false);
  assert.equal(getScenePhase(state, 'chase'), 'idle');

  state.gameState = 'running';
  assert.equal(runDebugKey('KeyC', state, {}), true);
  assert.equal(getScenePhase(state, 'chase'), 'pending');
  runDebugKey('KeyG', state, {});
  assert.deepEqual(state.obstacles.map(o => o.type), ['golden']);
});

test('+500 adds to a running score and marks the run', () => {
  const state = createState(() => 0.5);
  runDebugKey('Equal', state, {});
  assert.equal(state.score, 0, 'not between runs');
  state.gameState = 'running';
  state.score = 120;
  runDebugKey('Equal', state, {});
  assert.equal(state.score, 620);
  assert.equal(state.scoreBoosted, true);
});

test('slow motion, rain, and hat toggle in any state; unbound keys do nothing', () => {
  const state = createState(() => 0.5);
  let hats = 0;
  const deps = { cosmetics: { toggleDefaultHat: () => { hats++; } } };
  runDebugKey('KeyP', state, deps);
  runDebugKey('KeyR', state, deps);
  runDebugKey('KeyH', state, deps);
  assert.equal(state.slowMode, true);
  assert.equal(state.weatherRain, true);
  assert.ok(state.rainDrops.length > 0);
  assert.equal(hats, 1);
  assert.equal(runDebugKey('KeyZ', state, deps), false);
  assert.ok(Object.values(DEBUG_KEYS).every(k => typeof k.run === 'function' && k.label));
});
