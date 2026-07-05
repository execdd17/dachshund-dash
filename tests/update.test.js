// Integration tests: drive the full per-frame update() headlessly.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../js/core/state.js';
import { update } from '../js/systems/update.js';
import { jump } from '../js/systems/control.js';
import {
  GROUND_Y, DT_BASELINE, GIANT_DURATION, BIRD_JUMP_BONUS,
} from '../js/config.js';
import { createTestServices } from './helpers.js';

const DT = DT_BASELINE; // one baseline tick per update

function runningState() {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  return state;
}

test('update is a no-op unless running', () => {
  const state = createState(() => 0.5);
  update(state, DT, createTestServices(), () => 0.5, 0);
  assert.equal(state.frameCount, 0);
  assert.equal(state.score, 0);
});

test('score, speed and scroll advance while running', () => {
  const state = runningState();
  for (let i = 0; i < 100; i++) update(state, DT, createTestServices(), () => 0.99, 0);
  assert.ok(state.score > 0);
  assert.ok(state.groundOffset > 0);
  assert.equal(state.frameCount, 100);
});

test('jump arc: dog rises, falls, and lands with dust particles', () => {
  const state = runningState();
  const services = createTestServices();
  jump(state, services);
  assert.ok(state.dog.vy < 0);
  let minY = GROUND_Y;
  for (let i = 0; i < 500 && (state.dog.jumping || i === 0); i++) {
    update(state, DT, services, () => 0.99, 0);
    minY = Math.min(minY, state.dog.y);
  }
  assert.ok(minY < GROUND_Y - 30, 'dog actually left the ground');
  assert.equal(state.dog.y, GROUND_Y, 'dog landed');
  assert.equal(state.dog.jumping, false);
  assert.ok(state.landingParticles.length > 0, 'landing dust spawned');
});

test('obstacles spawn, scroll left, and are culled off-screen', () => {
  const state = runningState();
  // rng 0.99 → plain hotdogs, no goldens
  for (let i = 0; i < 200 && state.gameState === 'running'; i++) {
    update(state, DT, createTestServices(), () => 0.99, 0);
  }
  assert.ok(state.obstacles.length > 0, 'something spawned');
  const first = state.obstacles[0];
  const xBefore = first.x;
  update(state, DT, createTestServices(), () => 0.99, 0);
  if (state.obstacles[0] === first) {
    assert.ok(first.x < xBefore, 'obstacle moved left');
  }
});

test('running into an obstacle kills the dog', () => {
  const state = runningState();
  let died = false;
  const services = createTestServices({ showNameEntryOverlay: () => { died = true; } });
  // Advance the clock each frame so post-hit i-frames expire between hits
  for (let i = 0; i < 20000 && state.gameState === 'running'; i++) {
    update(state, DT, services, () => 0.99, i * DT);
  }
  assert.notEqual(state.gameState, 'running', 'dog eventually hit something');
  assert.equal(state.hearts, 0, 'both hearts were spent');
  assert.ok(state.gameState === 'dead' || died);
});

test('giant mode expires after GIANT_DURATION', () => {
  const state = runningState();
  const services = createTestServices();
  state.giantActive = true;
  state.giantStartTime = 0;
  state.giantScoreMultiplier = 2;
  update(state, DT, services, () => 0.99, GIANT_DURATION + 1);
  assert.equal(state.giantActive, false);
  assert.equal(state.giantShrinking, true);
  assert.equal(state.giantScoreMultiplier, 1);
});

test('jumping over a bird awards the bonus once', () => {
  const state = runningState();
  const services = createTestServices();
  state.dog.jumping = true;
  state.dog.y = 100;
  state.dog.vy = -1;
  // Bird already fully behind the dog's hitbox front edge
  state.obstacles = [{ x: 0, y: GROUND_Y - 49, width: 66, height: 51, type: 'bird' }];
  const before = state.score;
  update(state, DT, services, () => 0.99, 0);
  assert.ok(state.score >= before + BIRD_JUMP_BONUS);
  assert.equal(state.birdJumpEffects.length, 1);
  const after = state.score;
  update(state, DT, services, () => 0.99, 1);
  assert.ok(state.score < after + BIRD_JUMP_BONUS, 'bonus not granted twice');
});

test('milestone chime fires every 100 points', () => {
  const state = runningState();
  let chimes = 0;
  const services = createTestServices();
  services.sfx = { ...services.sfx, playScore: () => { chimes++; } };
  state.score = 99.99; // one tick adds ~0.06 points, crossing 100
  update(state, DT, services, () => 0.99, 0);
  assert.equal(chimes, 1);
  assert.equal(state.lastMilestone, 1);
});

test('slow mode halves the simulation scale', () => {
  // Single step from identical states: same speed, so scroll is exactly halved.
  // (Over many steps they diverge because score — and thus speed — ramps slower.)
  const normal = runningState();
  const slow = runningState();
  slow.slowMode = true;
  update(normal, DT, createTestServices(), () => 0.99, 0);
  update(slow, DT, createTestServices(), () => 0.99, 0);
  assert.ok(Math.abs(slow.groundOffset - normal.groundOffset / 2) < 1e-9);
});
