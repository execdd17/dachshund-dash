import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getDogHitbox, getObstacleHitbox, rectsOverlap, checkCollision,
} from '../js/systems/collision.js';
import { createState, createDog } from '../js/core/state.js';
import { GROUND_Y, GIANT_EAT_BONUS, GIANT_BONK_BONUS } from '../js/config.js';
import { createTestServices } from './helpers.js';

test('dog hitbox is lower-profile when ducking', () => {
  const dog = createDog();
  const standing = getDogHitbox(dog, false);
  dog.ducking = true;
  const ducking = getDogHitbox(dog, false);
  assert.ok(ducking.h < standing.h);
  assert.ok(ducking.y > standing.y);
});

test('giant mode expands the dog hitbox', () => {
  const dog = createDog();
  const normal = getDogHitbox(dog, false);
  const giant = getDogHitbox(dog, true);
  assert.ok(giant.w > normal.w);
  assert.ok(giant.h > normal.h);
  assert.ok(giant.x < normal.x);
  assert.ok(giant.y < normal.y);
});

test('obstacle hitboxes are inset per type', () => {
  const frisbee = getObstacleHitbox({ type: 'frisbee', x: 0, y: 0, width: 44, height: 14 });
  assert.deepEqual(frisbee, { x: 6, y: 2, w: 32, h: 10 });
  const stack = getObstacleHitbox({ type: 'stack', x: 0, y: 0, width: 36, height: 42 });
  assert.deepEqual(stack, { x: 8, y: 4, w: 20, h: 36 });
  const hotdog = getObstacleHitbox({ type: 'hotdog', x: 0, y: 0, width: 36, height: 22 });
  assert.deepEqual(hotdog, { x: 12, y: 8, w: 12, h: 12 });
});

test('rectsOverlap detects overlap and separation', () => {
  const a = { x: 0, y: 0, w: 10, h: 10 };
  assert.equal(rectsOverlap(a, { x: 5, y: 5, w: 10, h: 10 }), true);
  assert.equal(rectsOverlap(a, { x: 10, y: 0, w: 5, h: 5 }), false); // touching edges don't overlap
  assert.equal(rectsOverlap(a, { x: 20, y: 20, w: 5, h: 5 }), false);
});

function stateWithObstacleAtDog(type) {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  // Place obstacle square on the dog's standing hitbox
  state.obstacles = [{
    x: state.dog.x + 20, y: GROUND_Y + 4, width: 36, height: 22, type,
  }];
  return state;
}

test('normal collision with a hotdog kills the dog', () => {
  const state = stateWithObstacleAtDog('hotdog');
  assert.equal(checkCollision(state, createTestServices()), true);
});

test('golden hot dog activates giant mode instead of killing', () => {
  const state = stateWithObstacleAtDog('golden');
  const died = checkCollision(state, createTestServices());
  assert.equal(died, false);
  assert.equal(state.giantActive, true);
  assert.equal(state.giantScoreMultiplier, 2);
  assert.deepEqual(state.obstacles, []);
});

test('giant mode eats ground obstacles for bonus points', () => {
  const state = stateWithObstacleAtDog('hotdog');
  state.giantActive = true;
  const before = state.score;
  const died = checkCollision(state, createTestServices());
  assert.equal(died, false);
  assert.equal(state.score, before + GIANT_EAT_BONUS);
  assert.deepEqual(state.obstacles, []);
  assert.equal(state.giantChompEffects.length, 1);
});

test('giant mode bonks birds for a smaller bonus', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.giantActive = true;
  // Giant hitbox reaches higher; put the bird overlapping it
  state.obstacles = [{ x: state.dog.x + 20, y: GROUND_Y - 49, width: 66, height: 51, type: 'bird' }];
  const before = state.score;
  const died = checkCollision(state, createTestServices());
  assert.equal(died, false);
  assert.equal(state.score, before + GIANT_BONK_BONUS);
  assert.equal(state.giantBonkEffects.length, 1);
});

test('ducking avoids a frisbee at head height', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.obstacles = [{ x: state.dog.x + 20, y: GROUND_Y - 12, width: 44, height: 14, type: 'frisbee' }];
  assert.equal(checkCollision(state, createTestServices()), true, 'standing dog is hit');
  state.dog.ducking = true;
  assert.equal(checkCollision(state, createTestServices()), false, 'ducking dog slides under');
});
