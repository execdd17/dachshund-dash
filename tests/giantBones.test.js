// Giant mode's bone round: the bob mechanic, the giant hitbox that follows
// the drawn dog, and bots playing each bone pattern through the real update().

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState, createDog } from '../js/core/state.js';
import { update } from '../js/systems/update.js';
import { jump } from '../js/systems/control.js';
import { getDogHitbox, getObstacleHitbox, rectsOverlap } from '../js/systems/collision.js';
import { makeObstacle, stepBob } from '../js/systems/obstacleTypes.js';
import { activateGiantMode, isGiant, isBone } from '../js/systems/giant.js';
import { GIANT_PATTERNS } from '../js/systems/giantBones.js';
import {
  W, GROUND_Y, GIANT_SCALE, GIANT_FIRST_AT, INITIAL_SPEED, MAX_SPEED, SPEED_INCREMENT,
  GIANT_ARC_BONES, GIANT_RUN_BONES, GIANT_STREAK_MAX, GIANT_BOB, GIANT_BONE_POINTS, GIANT_ROUND,
} from '../js/config.js';
import { createTestServices } from './helpers.js';

const SPEEDS = [INITIAL_SPEED + GIANT_FIRST_AT * SPEED_INCREMENT, 4.5, MAX_SPEED];
const FRAME_MS = [1000 / 60, 1000 / 120, 1000 / 144];
const scoreForSpeed = speed => (speed - INITIAL_SPEED) / SPEED_INCREMENT;
const ROUND_BONES = GIANT_ROUND.arc * GIANT_ARC_BONES + GIANT_ROUND.run * GIANT_RUN_BONES + GIANT_ROUND.bobber;

// --- Bobbing ---

test('a bobbing obstacle moves up and down around where it was made, on game time', () => {
  const y = 100;
  const amp = 30;
  const period = 90;
  const at = (frameMs, ms) => {
    const o = makeObstacle('bone', 0, { y, bob: { amp, period, phase: 0.25 } });
    for (let f = Math.round(ms / frameMs); f > 0; f--) stepBob(o, frameMs / (1000 / 120));
    return o.y;
  };
  // A quarter of the way in, it starts at the top of its swing (sin = 1).
  assert.ok(Math.abs(at(1000 / 120, 1000 / 120) - (y + amp)) < 1);
  const ys = [];
  const o = makeObstacle('bone', 0, { y, bob: { amp, period } });
  for (let f = 0; f < period * 2; f++) { stepBob(o, 1); ys.push(o.y); }
  assert.ok(Math.abs(Math.max(...ys) - (y + amp)) < 0.5 && Math.abs(Math.min(...ys) - (y - amp)) < 0.5, 'swings amp each way');
  assert.equal(getObstacleHitbox(o).y, o.y, 'its hitbox moves with it');
  // Any frame rate sees the same path.
  const ms = 7 * (1000 / 12);  // a whole number of frames at 60, 120, and 144Hz
  for (const frameMs of FRAME_MS) assert.ok(Math.abs(at(frameMs, ms) - at(1000 / 120, ms)) < 1, `${frameMs}ms`);
});

// --- The giant dog's hitbox ---

test('the giant hitbox rises with the drawn dog and still reaches the ground', () => {
  const dog = createDog();
  const ground = getDogHitbox(dog, true);
  const hotdog = getObstacleHitbox(makeObstacle('hotdog', ground.x + 20));
  assert.ok(rectsOverlap(ground, hotdog), 'a grounded giant eats hot dogs');
  for (const rise of [-40, -115]) {
    const up = getDogHitbox({ ...dog, y: GROUND_Y + rise }, true);
    // The sprite is scaled about a point under the feet, so a jump draws GIANT_SCALE times as high.
    assert.ok(Math.abs(up.y - (ground.y + rise * GIANT_SCALE)) < 1e-9);
    assert.ok(Math.abs(up.y + up.h - (ground.y + ground.h + rise * GIANT_SCALE)) < 1e-9);
    assert.equal(up.x, ground.x);
  }
});

// --- Patterns ---

// A giant dog at `speed` with one pattern spawned at the right edge (the
// round itself held off). Plays until its bones have all gone, pressing jump
// on frame `pressAt` (if given). Returns how many bones the dog fetched.
function playPattern(id, speed, frameMs, { pressAt = -1, rng = () => 0.5 } = {}) {
  let lowest = -Infinity;
  let highest = Infinity;
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.startingHearts = state.hearts = 99;
  state.score = scoreForSpeed(speed);
  state.speed = speed;
  const services = createTestServices();
  activateGiantMode(state, services, 0);
  state.giantPatternIn = Infinity;
  state.obstacles = [];
  GIANT_PATTERNS[id](state, W + 10, rng);
  const bones = state.obstacles.filter(isBone);
  let now = 0;
  for (let f = 0; f < 2000 && bones.some(b => state.obstacles.includes(b)); f++) {
    now += frameMs;
    if (f === pressAt) jump(state, services, now);
    update(state, frameMs, services, () => 0.5, now);
    for (const b of bones) { lowest = Math.max(lowest, b.y); highest = Math.min(highest, b.y); }
  }
  assert.ok(isGiant(state), 'played inside one giant mode');
  return { fetched: bones.filter(b => !b.missed).length, total: bones.length, travel: lowest - highest };
}

test('an arc: one jump timed right takes every bone, early or late misses some, and running takes few', () => {
  for (const speed of SPEEDS) {
    for (const frameMs of FRAME_MS) {
      const label = `speed ${speed.toFixed(2)}, ${frameMs.toFixed(1)}ms`;
      const results = [];
      for (let f = 0; f < 300; f++) results.push(playPattern('arc', speed, frameMs, { pressAt: f }).fetched);
      const all = results.filter(n => n === GIANT_ARC_BONES).length;
      assert.ok(all * frameMs >= 80, `${label}: a window to take them all (${(all * frameMs).toFixed(0)}ms)`);
      assert.ok(all * frameMs <= 400, `${label}: it takes timing (${(all * frameMs).toFixed(0)}ms)`);
      assert.ok(results.some(n => n > 0 && n < GIANT_ARC_BONES), `${label}: a mistimed jump gets some`);
      assert.ok(playPattern('arc', speed, frameMs).fetched <= 2, `${label}: running gets the ends at most`);
    }
  }
});

test('a run: a dog that stays down takes every bone', () => {
  for (const speed of SPEEDS) {
    for (const frameMs of FRAME_MS) {
      assert.equal(playPattern('run', speed, frameMs).fetched, GIANT_RUN_BONES, `speed ${speed}, ${frameMs}ms`);
    }
  }
});

test('a bobbing bone: always above a running dog, always reachable with a jump', () => {
  for (const speed of SPEEDS) {
    for (const frameMs of FRAME_MS) {
      for (const phase of [0, 0.25, 0.5, 0.75]) {
        const label = `speed ${speed.toFixed(2)}, ${frameMs.toFixed(1)}ms, phase ${phase}`;
        const rng = () => phase;
        const running = playPattern('bobber', speed, frameMs, { rng });
        assert.equal(running.fetched, 0, `${label}: running misses`);
        assert.ok(running.travel > GIANT_BOB.amp * 1.5, `${label}: it bobs (${running.travel.toFixed(0)}px)`);
        let hits = 0;
        for (let f = 0; f < 300; f += 2) hits += playPattern('bobber', speed, frameMs, { rng, pressAt: f }).fetched;
        assert.ok(hits * 2 * frameMs >= 60, `${label}: a jump meets it (${(hits * 2 * frameMs).toFixed(0)}ms of presses)`);
      }
    }
  }
});

// --- The round ---

// A whole giant mode with no input (dealing `round`, if given). Logs each
// pattern and every new obstacle type.
function playRound(speed, frameMs, rng, round) {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.startingHearts = state.hearts = 99;
  state.score = scoreForSpeed(speed);
  const services = createTestServices();
  activateGiantMode(state, services, 1);
  if (round) state.giantPatternsLeft = round;
  state.obstacles = [];
  const patterns = [];
  const types = new Set();
  let firstBoneAt = null;
  let bones = 0;
  const seen = new Set();
  let now = 1;
  while (isGiant(state)) {
    now += frameMs;
    update(state, frameMs, services, rng, now);
    if (state.giantLastPattern && state.giantLastPattern !== patterns.at(-1)?.id) patterns.push({ id: state.giantLastPattern });
    for (const o of state.obstacles) {
      if (seen.has(o)) continue;
      seen.add(o);
      types.add(o.type);
      if (isBone(o)) bones++;
    }
    // Reached: fetched (gone) or level with the dog.
    const box = getDogHitbox(state.dog, true);
    const reached = [...seen].some(o => isBone(o) && (!state.obstacles.includes(o) || o.x < box.x + box.w));
    if (firstBoneAt === null && reached) firstBoneAt = now;
  }
  return { state, patterns, types, firstBoneAt, bones, endedAt: now };
}

test('the bone round: bones from the start, only bones and hot dogs, and a clear field at the end', () => {
  for (const speed of SPEEDS) {
    for (const frameMs of [1000 / 60, 1000 / 144]) {
      for (const seed of [0.1, 0.5, 0.9]) {
        let n = 0;
        const rng = () => (seed + (++n) * 0.618) % 1;
        const label = `speed ${speed.toFixed(2)}, ${frameMs.toFixed(1)}ms, seed ${seed}`;
        const { state, patterns, types, firstBoneAt, bones } = playRound(speed, frameMs, rng);
        assert.ok(firstBoneAt < 3000, `${label}: the first bone reaches the dog in ${firstBoneAt}ms`);
        assert.deepEqual([...types].sort(), ['bone', 'hotdog'], label);
        patterns.slice(1).forEach((p, i) => assert.notEqual(p.id, patterns[i].id, `${label}: the same pattern twice running`));
        const dealt = {};
        patterns.forEach(p => { dealt[p.id] = (dealt[p.id] ?? 0) + 1; });
        assert.deepEqual(dealt, GIANT_ROUND, `${label}: the whole round, in ${patterns.map(p => p.id)}`);
        assert.equal(bones, ROUND_BONES, label);
        assert.equal(state.obstacles.filter(isBone).length, 0, `${label}: no bone left when the dog shrinks`);
      }
    }
  }
});

test('a round too long for one giant mode stops dealing in time to clear the field', () => {
  for (const speed of SPEEDS) {
    const { state, patterns } = playRound(speed, 1000 / 120, () => 0.5, { arc: 20, run: 20, bobber: 20 });
    assert.ok(patterns.length < 60);
    assert.equal(state.obstacles.filter(isBone).length, 0, `speed ${speed}: no bone left when the dog shrinks`);
  }
});

test('a perfect round pays a bounded bonus', () => {
  // Every bone fetched in one streak: what the bones can add at most.
  let perfect = 0;
  for (let i = 1; i <= ROUND_BONES; i++) perfect += GIANT_BONE_POINTS * Math.min(i, GIANT_STREAK_MAX);
  assert.ok(perfect <= 700, `${ROUND_BONES} bones could pay ${perfect}`);
});

test('the round never deals the same pattern twice running, whatever the rolls', () => {
  for (const roll of [0, 0.2, 0.49, 0.51, 0.8, 0.999]) {
    const { patterns } = playRound(4.5, 1000 / 120, () => roll);
    patterns.slice(1).forEach((p, i) => assert.notEqual(p.id, patterns[i].id, `roll ${roll}: ${patterns.map(q => q.id)}`));
    assert.equal(patterns.length, Object.values(GIANT_ROUND).reduce((a, b) => a + b, 0), `roll ${roll}`);
  }
});

test('normal spawning picks up again when the dog shrinks', () => {
  const { state, endedAt } = playRound(4.5, 1000 / 120, () => 0.5);
  const services = createTestServices();
  const left = new Set(state.obstacles);
  let now = endedAt;
  for (let f = 0; f < 120 * 3 && state.obstacles.every(o => left.has(o)); f++) {
    now += 1000 / 120;
    update(state, 1000 / 120, services, () => 0.5, now);
  }
  assert.ok(state.obstacles.some(o => !left.has(o)), 'a normal spawn within 3s');
  assert.ok(state.obstacles.every(o => !isBone(o)), 'and no more bones');
});
