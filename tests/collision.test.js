import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  getDogHitbox, getDogHurtboxes, getObstacleHitbox, rectsOverlap, checkCollision,
} from '../js/systems/collision.js';
import { update } from '../js/systems/update.js';
import { duck } from '../js/systems/control.js';
import { makeObstacle } from '../js/systems/obstacleTypes.js';
import { createState, createDog } from '../js/core/state.js';
import { activateGiantMode, deactivateGiantMode, giantScoreMultiplier, giantStreakLevel } from '../js/systems/giant.js';
import {
  GROUND_Y, BONE_POINTS, GIANT_EAT_BONUS, GIANT_BONE_POINTS, GIANT_STREAK_MAX, GIANT_END_INVULN, BIRD_JUMP_BONUS, CHASE_ACORN_Y, HEART_FULL_BONUS,
  BIRD_LOW_Y, BIRD_SPRITE_W, DOG_HITBOX_STAND, DOG_HITBOX_RUN_REAR, DT_BASELINE, INITIAL_SPEED, SPEED_INCREMENT, MAX_SPEED,
} from '../js/config.js';
import { getGiantPhase, setGiantPhase } from '../js/systems/encounters.js';
import { effectsOfKind } from '../js/systems/effects.js';
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
  const tower = getObstacleHitbox({ type: 'tower', x: 0, y: 0, width: 36, height: 122 });
  assert.deepEqual(tower, { x: 8, y: 4, w: 20, h: 116 });
  const hotdog = getObstacleHitbox({ type: 'hotdog', x: 0, y: 0, width: 36, height: 22 });
  assert.deepEqual(hotdog, { x: 12, y: 8, w: 12, h: 12 });
});

test('aerial chase acorns pin to duck-under height: standing hits, ducking clears', () => {
  const bird = getObstacleHitbox({
    type: 'bird', skin: 'chase', x: 60, y: GROUND_Y - 49, width: 66, height: 51,
  });
  const frisbee = getObstacleHitbox({
    type: 'frisbee', skin: 'chase', x: 60, y: GROUND_Y - 12, width: 44, height: 14,
  });
  const pinned = { x: 72, y: CHASE_ACORN_Y + 8, w: 12, h: 12 };
  assert.deepEqual(bird, pinned);
  assert.deepEqual(frisbee, pinned);

  const dog = createDog();
  dog.x = 60;
  for (const box of [bird, frisbee]) {
    assert.equal(rectsOverlap(getDogHitbox(dog, false), box), true, 'standing dog is hit');
  }
  dog.ducking = true;
  for (const box of [bird, frisbee]) {
    assert.equal(rectsOverlap(getDogHitbox(dog, false), box), false, 'ducking clears the acorn');
  }
});

test('chase bird walls: low row ducks, high row keeps aerial height', () => {
  const pinned = { x: 72, y: CHASE_ACORN_Y + 8, w: 12, h: 12 };
  const low = getObstacleHitbox({
    type: 'bird', skin: 'chase', aerialWall: true, wallRow: 'low',
    x: 60, y: GROUND_Y - 49, width: 66, height: 51,
  });
  const high = getObstacleHitbox({
    type: 'bird', skin: 'chase', aerialWall: true, wallRow: 'high',
    x: 88, y: 48, width: 66, height: 51,
  });
  assert.deepEqual(low, pinned);
  assert.deepEqual(high, { x: 100, y: 56, w: 12, h: 12 });
  assert.notDeepEqual(low, high);
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

test('first hit spends a heart instead of killing', () => {
  const state = stateWithObstacleAtDog('hotdog');
  const died = checkCollision(state, createTestServices(), 1000);
  assert.equal(died, false);
  assert.equal(state.hearts, state.startingHearts - 1);
  assert.deepEqual(state.obstacles, [], 'obstacle knocked away');
  assert.equal(effectsOfKind(state, 'bonk').length, 1);
  assert.equal(state.heartLostAt, 1000);
  assert.ok(state.invulnUntil > 1000, 'i-frames granted');
});

test('hit on the last heart kills the dog', () => {
  const state = stateWithObstacleAtDog('hotdog');
  state.hearts = 1;
  assert.equal(checkCollision(state, createTestServices(), 1000), true);
  assert.equal(state.hearts, 0);
});

test('collisions are ignored during post-hit invulnerability', () => {
  const state = stateWithObstacleAtDog('hotdog');
  state.hearts = 1;
  state.invulnUntil = 2000;
  const died = checkCollision(state, createTestServices(), 1500);
  assert.equal(died, false);
  assert.equal(state.hearts, 1);
  assert.equal(state.obstacles.length, 1, 'obstacle passes through untouched');
});

test('overlapping an obstacle right as giant mode ends does not kill', () => {
  const state = stateWithObstacleAtDog('hotdog');
  state.hearts = 1;
  activateGiantMode(state, createTestServices(), 0);
  deactivateGiantMode(state, createTestServices(), 1000);
  const died = checkCollision(state, createTestServices(), 1000 + GIANT_END_INVULN - 1);
  assert.equal(died, false);
  assert.equal(state.hearts, 1, 'no heart spent during the grace period');
});

test('golden hot dog still works during invulnerability', () => {
  const state = stateWithObstacleAtDog('golden');
  state.invulnUntil = 2000;
  const died = checkCollision(state, createTestServices(), 1500);
  assert.equal(died, false);
  assert.equal(getGiantPhase(state), 'growing');
});

test('a heart pickup restores a spent heart, even during i-frames, and blinks it in', () => {
  const state = stateWithObstacleAtDog('heart');
  state.hearts = state.startingHearts - 1;
  state.invulnUntil = 2000;
  const died = checkCollision(state, createTestServices(), 1500);
  assert.equal(died, false);
  assert.equal(state.hearts, state.startingHearts);
  assert.equal(state.heartGainedAt, 1500);
  assert.equal(effectsOfKind(state, 'heartGain').length, 1);
  assert.deepEqual(state.obstacles, [], 'collected');
});

test('a heart pickup with every heart full pays a bonus instead', () => {
  const state = stateWithObstacleAtDog('heart');
  const before = state.score;
  checkCollision(state, createTestServices(), 1000);
  assert.equal(state.hearts, state.startingHearts, 'never above the starting count');
  assert.equal(state.score, before + HEART_FULL_BONUS);
  assert.equal(effectsOfKind(state, 'heartBonus').length, 1);
  assert.equal(state.heartGainedAt, 0, 'no HUD blink: nothing changed there');
});

test('golden hot dog activates giant mode instead of killing', () => {
  const state = stateWithObstacleAtDog('golden');
  const died = checkCollision(state, createTestServices());
  assert.equal(died, false);
  assert.equal(getGiantPhase(state), 'growing');
  assert.equal(giantScoreMultiplier(state), 2);
  assert.deepEqual(state.obstacles, []);
});

test('giant mode eats ground obstacles for bonus points', () => {
  const state = stateWithObstacleAtDog('hotdog');
  setGiantPhase(state, 'active');
  const before = state.score;
  const died = checkCollision(state, createTestServices());
  assert.equal(died, false);
  assert.equal(state.score, before + GIANT_EAT_BONUS);
  assert.deepEqual(state.obstacles, []);
  assert.deepEqual(effectsOfKind(state, 'chomp').map(e => e.points), [GIANT_EAT_BONUS], 'the popup shows the points');
});

// A giant dog with a bone (a bird, or a frisbee) on its hitbox.
function giantWithBone(state, type = 'bird') {
  state.obstacles = [type === 'bird'
    ? makeObstacle('bird', state.dog.x + 20, { y: GROUND_Y - 49 })
    : makeObstacle('frisbee', state.dog.x + 20)];
}

test('giant mode fetches bones, each one in a row worth more up to the cap', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  activateGiantMode(state, createTestServices(), 0);
  const paid = [];
  for (let i = 0; i < GIANT_STREAK_MAX + 2; i++) {
    giantWithBone(state, i % 2 ? 'frisbee' : 'bird');
    const before = state.score;
    assert.equal(checkCollision(state, createTestServices()), false);
    paid.push(state.score - before);
    if (i === 1) {  // food in between keeps the streak going
      state.obstacles = [{ x: state.dog.x + 20, y: GROUND_Y + 4, width: 36, height: 22, type: 'hotdog' }];
      checkCollision(state, createTestServices());
    }
  }
  const levels = [1, 2, 3, 3, 3].map(n => Math.min(n, GIANT_STREAK_MAX));
  assert.deepEqual(paid, levels.map(n => n * GIANT_BONE_POINTS));
  assert.equal(giantStreakLevel(state), GIANT_STREAK_MAX);
  assert.equal(effectsOfKind(state, 'bonk').length, 0, 'bones are fetched, not bonked');
  assert.deepEqual(effectsOfKind(state, 'chomp').map(e => e.level), [1, 2, 0, 3, 3, 3]);
});

test('a bone pays a flat BONE_POINTS outside giant mode, and its place in the streak inside it', () => {
  const services = createTestServices();
  const state = createState(() => 0.5);
  state.gameState = 'running';
  const atDog = () => [makeObstacle('bone', state.dog.x + 30, { y: GROUND_Y - 4 })];
  for (let i = 0; i < 3; i++) {
    state.obstacles = atDog();
    const before = state.score;
    checkCollision(state, services);
    assert.equal(state.score - before, BONE_POINTS, `bone ${i + 1}: flat`);
  }
  assert.equal(state.giantStreak, 0, 'no streak outside giant mode');
  activateGiantMode(state, services, 0);
  const paid = [];
  for (let i = 0; i < 2; i++) {
    state.obstacles = atDog();
    const before = state.score;
    checkCollision(state, services);
    paid.push(state.score - before);
  }
  assert.deepEqual(paid, [GIANT_BONE_POINTS, GIANT_BONE_POINTS * 2]);
});

test('a bone that gets past the giant dog breaks the streak, and jumping it pays nothing', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  const services = createTestServices();
  activateGiantMode(state, services, 0);
  state.giantStreak = 2;
  Object.assign(state.dog, { jumping: true, vy: -2, y: GROUND_Y - 200 });  // high over the bone
  state.obstacles = [makeObstacle('bird', state.dog.x + 40, { y: BIRD_LOW_Y })];
  const before = state.score;
  let now = 0;
  for (let f = 0; f < 60 && state.giantStreak > 0; f++) {
    now += 1000 / 120;
    Object.assign(state.dog, { y: GROUND_Y - 200, vy: -2 });  // keep it above everything
    update(state, 1000 / 120, services, () => 0.99, now);
  }
  assert.equal(state.giantStreak, 0, 'the passed bone broke the streak');
  assert.ok(state.score - before < BIRD_JUMP_BONUS, 'no bird-jump bonus over a bone');
  assert.equal(effectsOfKind(state, 'birdJump').length, 0);
});

test('giant mode ending tallies its bonus points', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  const services = createTestServices();
  activateGiantMode(state, services, 0);
  giantWithBone(state);
  checkCollision(state, services);
  state.obstacles = [{ x: state.dog.x + 20, y: GROUND_Y + 4, width: 36, height: 22, type: 'hotdog' }];
  checkCollision(state, services);
  deactivateGiantMode(state, services, 15000);
  assert.deepEqual(effectsOfKind(state, 'giantFeast').map(e => e.points), [GIANT_BONE_POINTS + GIANT_EAT_BONUS]);
  activateGiantMode(state, services, 20000);
  assert.equal(state.giantFeast, 0, 'the next giant mode starts its own tally');
  assert.equal(state.giantStreak, 0);
});

test('ducking avoids a frisbee at head height', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.obstacles = [{ x: state.dog.x + 20, y: GROUND_Y - 12, width: 44, height: 14, type: 'frisbee' }];
  state.hearts = 1;  // no spare heart, so a hit is fatal
  assert.equal(checkCollision(state, createTestServices()), true, 'standing dog is hit');
  state.dog.ducking = true;
  assert.equal(checkCollision(state, createTestServices()), false, 'ducking dog slides under');
});

// --- Standing up from a duck under a low bird ---

// Where the dog's shoulders begin: in front of the lowered rear of the run pose.
const shouldersX = dog => dog.x + DOG_HITBOX_STAND.dx + DOG_HITBOX_RUN_REAR.w;
// The bird sprite's right edge, tail feathers included (drawBirdSprite centers it on the obstacle).
const birdTailTip = o => o.x + o.width / 2 + BIRD_SPRITE_W / 2;

test('only the grounded run pose lowers its rear; ducking, airborne, and giant keep one box', () => {
  const dog = createDog();
  assert.equal(getDogHurtboxes(dog, false).length, 2);
  assert.equal(getDogHurtboxes({ ...dog, ducking: true }, false).length, 1);
  assert.equal(getDogHurtboxes({ ...dog, jumping: true }, false).length, 1);
  assert.equal(getDogHurtboxes(dog, true).length, 1);
  const [rear, front] = getDogHurtboxes(dog, false);
  const whole = getDogHitbox(dog, false);
  assert.equal(rear.x, whole.x);
  assert.equal(front.x + front.w, whole.x + whole.w, 'same footprint as the standing box');
  assert.equal(rear.y + rear.h, whole.y + whole.h, 'same bottom: jump clearances are unchanged');
  assert.equal(front.y, whole.y, 'the head is as tall as ever');
  assert.ok(rear.y > whole.y, 'the back is lower');
});

test('a low bird over the head still hits a standing dog', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  const bird = makeObstacle('bird', shouldersX(state.dog), { y: BIRD_LOW_Y });
  state.obstacles = [bird];
  checkCollision(state, createTestServices(), 1000);
  assert.equal(state.hearts, state.startingHearts - 1);
});

test('standing up once a ducked-under bird, tail and all, is past the shoulders never hits', () => {
  for (const speed of [INITIAL_SPEED, 4.5, MAX_SPEED]) {
    const state = createState(() => 0.5);
    const services = createTestServices();
    state.gameState = 'running';
    state.score = (speed - INITIAL_SPEED) / SPEED_INCREMENT;
    state.nextObstacleIn = Infinity;
    const bird = makeObstacle('bird', 400, { y: BIRD_LOW_Y });
    state.obstacles = [bird];
    duck(state, true, services);
    for (let f = 0, now = 0; state.obstacles.length && f < 1000; f++) {
      if (state.duckHeld && birdTailTip(bird) <= shouldersX(state.dog)) duck(state, false, services);
      update(state, DT_BASELINE, services, () => 0.5, now += DT_BASELINE);
    }
    assert.equal(state.duckHeld, false, `speed ${speed}: stood up under the bird`);
    assert.equal(state.hearts, state.startingHearts, `speed ${speed}: no hit`);
  }
});
