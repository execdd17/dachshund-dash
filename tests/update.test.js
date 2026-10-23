// Integration tests: drive the full per-frame update() headlessly.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../js/core/state.js';
import { update } from '../js/systems/update.js';
import { jump } from '../js/systems/control.js';
import {
  GROUND_Y, DT_BASELINE, GIANT_DURATION, BIRD_JUMP_BONUS, DOG_HITBOX_STAND,
} from '../js/config.js';
import { getGiantPhase, setGiantPhase } from '../js/systems/encounters.js';
import { giantScoreMultiplier } from '../js/systems/giant.js';
import { effectsOfKind } from '../js/systems/effects.js';
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
  const services = createTestServices();
  // Advance the clock each frame so post-hit i-frames expire between hits
  for (let i = 0; i < 20000 && state.gameState === 'running'; i++) {
    update(state, DT, services, () => 0.99, i * DT);
  }
  assert.equal(state.gameState, 'dead', 'dog eventually hit something');
  assert.equal(state.hearts, 0, 'all hearts were spent');
});

test('giant mode expires after GIANT_DURATION', () => {
  const state = runningState();
  const services = createTestServices();
  setGiantPhase(state, 'active');
  state.giantStartTime = 0;
  update(state, DT, services, () => 0.99, GIANT_DURATION + 1);
  assert.equal(getGiantPhase(state), 'shrinking');
  assert.equal(giantScoreMultiplier(state), 1);
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
  assert.equal(effectsOfKind(state, 'birdJump').length, 1);
  const after = state.score;
  update(state, DT, services, () => 0.99, 1);
  assert.ok(state.score < after + BIRD_JUMP_BONUS, 'bonus not granted twice');
});

test('ducking under a bird and jumping as it clears pays no bonus', () => {
  const state = runningState();
  const services = createTestServices();
  const tail = state.dog.x + DOG_HITBOX_STAND.dx;
  // The bird over the ducking dog's body, the dog on the ground...
  state.duckHeld = true;
  state.obstacles = [{ x: tail - 40, y: GROUND_Y - 49, width: 66, height: 51, type: 'bird' }];
  update(state, DT, services, () => 0.99, 0);
  // ...then the dog jumps just as the bird's back edge clears its tail.
  state.duckHeld = false;
  Object.assign(state.dog, { jumping: true, y: 180, vy: -9 });
  state.obstacles[0].x = tail - 80;
  const before = state.score;
  update(state, DT, services, () => 0.99, 1);
  assert.equal(state.obstacles[0].jumped, undefined);
  assert.equal(effectsOfKind(state, 'birdJump').length, 0);
  assert.ok(state.score - before < BIRD_JUMP_BONUS);
});

test('jumping over a bird wall does not award the solo-bird bonus', () => {
  const state = runningState();
  const services = createTestServices();
  state.dog.jumping = true;
  state.dog.y = 100;
  state.obstacles = [{
    x: 0, y: GROUND_Y - 49, width: 66, height: 51, type: 'bird', aerialWall: true,
  }];
  update(state, DT, services, () => 0.99, 0);
  assert.equal(state.obstacles[0].jumped, undefined);
  assert.equal(effectsOfKind(state, 'birdJump').length, 0);
});

test('no sound for crossing a hundred or for a bird jump bonus', () => {
  // A chime every 100 points sounded random (and, often landing on a +50
  // bird bonus, like the bird's own sound), so the score is silent.
  const played = [];
  const services = createTestServices();
  services.sfx = Object.fromEntries(Object.keys(services.sfx).map(name => [name, () => played.push(name)]));
  const state = runningState();
  state.score = 99.99;  // one tick crosses 100
  update(state, DT, services, () => 0.99, 0);
  Object.assign(state.dog, { jumping: true, y: 100, vy: -1 });
  state.obstacles = [{ x: 0, y: GROUND_Y - 49, width: 66, height: 51, type: 'bird' }];
  update(state, DT, services, () => 0.99, 1);
  assert.equal(effectsOfKind(state, 'birdJump').length, 1, 'the bonus still pays');
  assert.deepEqual(played, []);
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
