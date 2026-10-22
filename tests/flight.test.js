// The flight scene: the cape that starts it, the sky lanes and their gates,
// the camera, and bots that fly every gate through the real update().

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState, createDog } from '../js/core/state.js';
import { update } from '../js/systems/update.js';
import { jump, duck } from '../js/systems/control.js';
import { getDogHurtboxes } from '../js/systems/collision.js';
import { makeObstacle, getObstacleHitbox } from '../js/systems/obstacleTypes.js';
import { forceScene, getScenePhase, setScenePhase, cameraLift } from '../js/systems/scenes.js';
import { flightScene, spawnGates, steerFlight } from '../js/systems/flight.js';
import { sceneMemory } from '../js/systems/encounters.js';
import {
  H, GROUND_Y, INITIAL_SPEED, MAX_SPEED, SPEED_INCREMENT,
  FLIGHT_FIRST_AT, FLIGHT_COOLDOWN, FLIGHT_LANES, FLIGHT_HUD_BAND, FLIGHT_GATES, FLIGHT_EASY_GATES,
} from '../js/config.js';
import { createTestServices } from './helpers.js';
import { createSilentSfx } from '../js/audio/sfx.js';

const SPEEDS = [INITIAL_SPEED, 4.5, MAX_SPEED];
const FRAME_MS = [1000 / 60, 1000 / 120, 1000 / 144];
const scoreForSpeed = speed => (speed - INITIAL_SPEED) / SPEED_INCREMENT;

// A run at `speed` with the flight scene forced (its cape on the way).
function capeState(speed = INITIAL_SPEED) {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.startingHearts = state.hearts = 99;
  state.score = scoreForSpeed(speed);
  forceScene(state, 'flight');
  return state;
}

// The lanes a hitbox reaches: those where a flying dog's hurtbox overlaps it vertically.
const flyingHurtbox = y => getDogHurtboxes({ ...createDog(), y, flying: true, jumping: true }, false)[0];
function lanesReached(obs) {
  const box = getObstacleHitbox(obs);
  return FLIGHT_LANES.flatMap((y, lane) => {
    const dog = flyingHurtbox(y);
    return box.y < dog.y + dog.h && box.y + box.h > dog.y ? [lane] : [];
  });
}

// Gates by x: { x: { birds: [lanes], bones: [lanes] } }.
function gatesOf(obstacles) {
  const gates = new Map();
  for (const o of obstacles) {
    if (o.type !== 'bird' && o.type !== 'bone') continue;
    const x = o.type === 'bone' ? o.x - 20 : o.x;
    const key = [...gates.keys()].find(k => Math.abs(k - x) < 1) ?? x;
    const gate = gates.get(key) ?? { birds: [], bones: [] };
    gate[o.type === 'bird' ? 'birds' : 'bones'].push(...lanesReached(o));
    gates.set(key, gate);
  }
  return [...gates.entries()].sort(([a], [b]) => a - b).map(([, gate]) => gate);
}

// --- Gates ---

test('gate birds and bones each sit in exactly one lane, and every gate leaves one open', () => {
  for (const seed of [0.05, 0.3, 0.5, 0.7, 0.95]) {
    const state = createState(() => 0.5);
    let n = 0;
    spawnGates(state, () => (seed * (++n * 7919)) % 1);
    for (const o of state.obstacles) assert.equal(lanesReached(o).length, 1, `${o.type} at y ${o.y}`);
    const gates = gatesOf(state.obstacles);
    assert.equal(gates.length, FLIGHT_GATES);
    gates.forEach(({ birds, bones }, i) => {
      assert.equal(birds.length, i < FLIGHT_EASY_GATES ? 1 : FLIGHT_LANES.length - 1, `gate ${i}`);
      bones.forEach(lane => assert.ok(!birds.includes(lane), `gate ${i}: a bone in a bird's lane`));
    });
  }
});

test('no gate bird is a jump-bonus bird', () => {
  const state = createState(() => 0.5);
  spawnGates(state, Math.random);
  state.obstacles.filter(o => o.type === 'bird').forEach(o => assert.ok(o.aerialWall));
});

// --- The cape ---

// Plays the cape phase: `act(state, cape, now)` each frame. Returns the phase it ends in.
function playCape(state, frameMs, act = () => {}) {
  const services = createTestServices();
  let now = 0;
  for (let f = 0; f < 5000; f++) {
    now += frameMs;
    act(state, state.obstacles.find(o => o.type === 'cape'), now, services);
    update(state, frameMs, services, () => 0.5, now);
    const phase = getScenePhase(state, 'flight');
    if (phase !== 'pending' && phase !== 'cape') return phase;
  }
  return getScenePhase(state, 'flight');
}

test('running or ducking into the cape puts it on and lifts off, at any speed and frame rate', () => {
  for (const speed of SPEEDS) {
    for (const frameMs of FRAME_MS) {
      const state = capeState(speed);
      assert.equal(playCape(state, frameMs), 'rising', `ran in at ${speed}, ${frameMs}ms`);
      assert.ok(state.dog.flying);
      assert.ok(state.effects.some(e => e.kind === 'flightCall'));
      const ducking = capeState(speed);
      assert.equal(playCape(ducking, frameMs, (s, cape, now, services) => duck(s, true, services)), 'rising', `ducked at ${speed}, ${frameMs}ms`);
    }
  }
});

test('only a jump timed over the cape misses it, and a miss tries again after half the cooldown', () => {
  const misses = [];
  for (let lead = 0; lead <= 300; lead += 5) {
    const state = capeState();
    state.score = FLIGHT_FIRST_AT + 100;  // a real miss comes at FLIGHT_FIRST_AT or later
    let pressed = false;
    const phase = playCape(state, 1000 / 120, (s, cape, now, services) => {
      if (!pressed && cape && cape.x - s.dog.x <= lead) { jump(s, services, now); pressed = true; }
    });
    if (phase === 'idle') {
      misses.push(lead);
      assert.ok(Math.abs(sceneMemory(state, 'flight').lastEndScore - (state.score - FLIGHT_COOLDOWN / 2)) < 1);
      assert.ok(!state.dog.flying);
    }
  }
  assert.ok(misses.length > 0, 'a well-timed jump can skip the cape');
  assert.ok(misses.length < 61 / 4, `most jump timings still grab it (missed at ${misses})`);
});

test('the scene arms at FLIGHT_FIRST_AT, then FLIGHT_COOLDOWN after it last ended', () => {
  const state = createState(() => 0.5);
  const memory = {};
  state.score = FLIGHT_FIRST_AT - 1;
  assert.ok(!flightScene.wantsTurn(state, memory));
  state.score = FLIGHT_FIRST_AT;
  assert.ok(flightScene.wantsTurn(state, memory));
  memory.lastEndScore = 900;
  state.score = 900 + FLIGHT_COOLDOWN - 1;
  assert.ok(!flightScene.wantsTurn(state, memory));
  state.score = 900 + FLIGHT_COOLDOWN;
  assert.ok(flightScene.wantsTurn(state, memory));
});

// --- Steering ---

test('jump and duck move one lane at a time, only among the gates, and clear the hint', () => {
  const played = [];
  const sfx = { ...createSilentSfx(), playWhooshUp: () => played.push('up'), playWhooshDown: () => played.push('down') };
  const services = createTestServices({ sfx });
  const state = createState(() => 0.5);
  state.gameState = 'running';
  setScenePhase(state, 'flight', 'rising');
  Object.assign(state.dog, { flying: true, jumping: true });  // as grabCape leaves it
  steerFlight(state, -1, services);
  assert.equal(state.scene.lane, 1, 'no steering on the way up');
  assert.ok(state.flightHintPending);

  setScenePhase(state, 'flight', 'active');
  jump(state, services, 0);
  assert.equal(state.scene.lane, 0);
  assert.ok(!state.flightHintPending);
  jump(state, services, 0);
  assert.equal(state.scene.lane, 0, 'the top lane is the ceiling');
  duck(state, true, services);
  duck(state, true, services);  // a held key's repeat isn't a new press
  assert.equal(state.scene.lane, 1);
  duck(state, false, services);
  duck(state, true, services);
  duck(state, false, services);
  duck(state, true, services);
  assert.equal(state.scene.lane, 2, 'the bottom lane is the floor');
  assert.deepEqual(played, ['up', 'down', 'down']);
  assert.ok(!state.dog.ducking, 'a flying dog never ducks');
});

// --- The camera ---

test('the camera centers the lanes between the HUD and the bottom of any screen', () => {
  for (const extraTop of [0, 120, 205, 300]) {
    const state = capeState();
    state.skyTop = -extraTop;
    playCape(state, 1000 / 120);
    flightScene.phases.rising(state, state.scene, { scale: 1e6, rng: () => 0.5 });
    const lift = cameraLift(state);
    const top = flyingHurtbox(FLIGHT_LANES[0]);
    const bottom = flyingHurtbox(FLIGHT_LANES.at(-1));
    const toScreen = y => y + lift + extraTop;
    const above = toScreen(top.y) - FLIGHT_HUD_BAND;
    const below = extraTop + H - toScreen(bottom.y + bottom.h);
    assert.ok(above > 0 && below > 0, `extraTop ${extraTop}: lanes on screen below the HUD`);
    assert.ok(Math.abs(above - below) < 1, `extraTop ${extraTop}: centered (${above} above, ${below} below)`);
  }
});

// --- Bots ---

// Steers toward the nearest open lane of the next gate the dog hasn't passed.
function steerBot(state, services, now) {
  const dogLeft = getDogHurtboxes(state.dog, false)[0].x;
  const ahead = state.obstacles.filter(o => o.type === 'bird' && o.x + o.width > dogLeft - 5);
  if (!ahead.length) return;
  const gateX = Math.min(...ahead.map(o => o.x));
  const blocked = ahead.filter(o => Math.abs(o.x - gateX) < 1).flatMap(lanesReached);
  const open = FLIGHT_LANES.map((_, lane) => lane).filter(lane => !blocked.includes(lane));
  const lane = state.scene.lane;
  const target = open.sort((a, b) => Math.abs(a - lane) - Math.abs(b - lane))[0];
  if (target < lane) jump(state, services, now);
  if (target > lane) { duck(state, true, services); duck(state, false, services); }
}

test('a bot flies every gate without a hit and lands back on the path, at any speed and frame rate', () => {
  for (const speed of SPEEDS) {
    for (const frameMs of FRAME_MS) {
      const state = capeState(speed);
      const services = createTestServices();
      const phases = [];
      let now = 0;
      let outOfLanes = 0;  // frames among the gates spent above the top lane or below the bottom one
      for (let f = 0; f < 20000 && state.gameState === 'running'; f++) {
        now += frameMs;
        if (getScenePhase(state, 'flight') === 'active') steerBot(state, services, now);
        update(state, frameMs, services, Math.random, now);
        const phase = getScenePhase(state, 'flight');
        if (phase === 'active' && (state.dog.y < FLIGHT_LANES[0] || state.dog.y > FLIGHT_LANES.at(-1))) outOfLanes++;
        if (phase !== phases.at(-1)) phases.push(phase);
        if (phase === 'idle') break;
      }
      const label = `speed ${speed}, ${frameMs.toFixed(1)}ms`;
      assert.deepEqual(phases, ['cape', 'rising', 'active', 'landing', 'idle'], label);
      assert.equal(state.hearts, 99, label);
      assert.equal(outOfLanes, 0, `${label}: the dog stays in the lanes`);
      assert.equal(state.dog.y, GROUND_Y, label);
      assert.ok(!state.dog.flying && !state.dog.jumping, label);
      assert.equal(cameraLift(state), 0, label);
      assert.ok(state.effects.some(e => e.kind === 'capeAway'), label);
    }
  }
});

test('a dog that never steers runs into gate birds', () => {
  const state = capeState();
  const services = createTestServices();
  let now = 0;
  for (let f = 0; f < 20000 && getScenePhase(state, 'flight') !== 'idle'; f++) {
    now += 1000 / 120;
    update(state, 1000 / 120, services, () => 0.4, now);
  }
  assert.ok(state.hearts < 99);
});
