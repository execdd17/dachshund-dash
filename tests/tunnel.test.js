// The tunnel scene: its layouts, the burrowing rules, the layer split in
// collision, and bots that play every layout through the real update().

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState, createDog, resetRun } from '../js/core/state.js';
import { update } from '../js/systems/update.js';
import { jump, duck } from '../js/systems/control.js';
import { checkCollision, getDogHitbox, getDogHurtboxes } from '../js/systems/collision.js';
import { OBSTACLE_TYPES, makeObstacle, getObstacleHitbox } from '../js/systems/obstacleTypes.js';
import { setScenePhase, getScenePhase, cameraLift } from '../js/systems/scenes.js';
import { tunnelScene, spawnTunnel, TUNNEL_STRETCHES } from '../js/systems/tunnel.js';
import {
  DT_BASELINE, INITIAL_SPEED, MAX_SPEED, SPEED_INCREMENT, DOG_HITBOX_STAND,
  TUNNEL_LAYOUTS, TUNNEL_BEAT_FRAMES, TUNNEL_FIRST_AT, TUNNEL_COOLDOWN, TUNNEL_POP_VY, JUMP_FORCE,
  TUNNEL_CAMERA_DROP, TUNNEL_CAMERA_SPEED,
} from '../js/config.js';
import { createTestServices } from './helpers.js';
import { createSilentSfx } from '../js/audio/sfx.js';

const SPEEDS = [INITIAL_SPEED, 4.5, MAX_SPEED];
const FRAME_MS = [1000 / 60, 1000 / 120, 1000 / 144];
const scoreForSpeed = speed => (speed - INITIAL_SPEED) / SPEED_INCREMENT;

// A running state holding the tunnel scene with `layout` already spawned.
function tunnelState(layout, speed = INITIAL_SPEED) {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.startingHearts = state.hearts = 99;
  state.score = scoreForSpeed(speed);
  state.speed = speed;
  setScenePhase(state, 'tunnel', 'active');
  spawnTunnel(state, layout);
  return state;
}

const holeOf = (state, index) => state.obstacles.find(o => o.type === 'tunnelHole' && o.holeIndex === index);
const dogCenterX = dog => dog.x + DOG_HITBOX_STAND.dx + DOG_HITBOX_STAND.w / 2;
// Slides the whole field so the dog stands at the middle of hole `index`
// (or `fraction` of a beat past it).
function placeDogAt(state, index, fraction = 0) {
  const hole = holeOf(state, index);
  const dx = dogCenterX(state.dog) - (hole.x + hole.width / 2) - fraction * TUNNEL_BEAT_FRAMES * state.speed;
  state.obstacles.forEach(o => { o.x += dx; });
}
const stepScene = (state, services, now = 1000) => tunnelScene.phases.active(state, state.scene, { scale: 1, services, now });

// --- Layouts ---

test('every layout opens with a stretch that needs the tunnel and also needs the surface somewhere', () => {
  for (const layout of TUNNEL_LAYOUTS) {
    layout.forEach(stretch => assert.ok(TUNNEL_STRETCHES[stretch], `unknown stretch ${stretch}`));
    assert.equal(TUNNEL_STRETCHES[layout[0]].needs, 'underground', `${layout} starts with a reason to drop in`);
    assert.ok(layout.some(stretch => TUNNEL_STRETCHES[stretch].needs === 'surface'), `${layout} never needs the surface`);
  }
});

// Which layers a hitbox blocks: the crawling dog's rows in the tunnel, or
// anything at or above the lowest a dog on the surface reaches (ducking).
const crawlBox = getDogHurtboxes({ ...createDog(), underground: true, ducking: true }, false)[0];
const surfaceFloor = (box => box.y + box.h)(getDogHitbox({ ...createDog(), ducking: true }, false));
function layersBlocked(obs) {
  const box = getObstacleHitbox(obs);
  const blocks = [];
  if (box.y < surfaceFloor) blocks.push('surface');
  if (box.y < crawlBox.y + crawlBox.h && box.y + box.h > crawlBox.y) blocks.push('underground');
  return blocks;
}

test("each stretch's hazards block the layer it doesn't need, never the tunnel on an open stretch", () => {
  for (const [name, { needs, obstacles }] of Object.entries(TUNNEL_STRETCHES)) {
    const blocked = obstacles
      .filter(([, type]) => OBSTACLE_TYPES[type].contact === 'hazard')
      .flatMap(([, type, overrides]) => layersBlocked(makeObstacle(type, 0, overrides)));
    if (needs === 'underground') assert.ok(blocked.includes('surface') && !blocked.includes('underground'), name);
    if (needs === 'surface') assert.ok(blocked.includes('underground'), name);
    if (needs === null) {
      assert.ok(!blocked.includes('underground'), `${name}: the tunnel route stays safe`);
      // A bone to collect, or a bird whose jump bonus pays
      const pays = obstacles.some(([, type]) => type === 'bird' || OBSTACLE_TYPES[type].contact === 'pickup');
      assert.ok(pays, `${name}: the surface route pays`);
    }
  }
});

test('every rock has a warning sign above it, which is only scenery', () => {
  assert.equal(OBSTACLE_TYPES.rockSign.contact, 'none');
  for (const layout of TUNNEL_LAYOUTS) {
    const state = tunnelState(layout);
    const center = o => o.x + o.width / 2;
    const rocks = state.obstacles.filter(o => o.type === 'rock');
    const signs = state.obstacles.filter(o => o.type === 'rockSign');
    assert.equal(signs.length, rocks.length, `${layout}`);
    rocks.forEach(rock => assert.ok(signs.some(sign => Math.abs(center(sign) - center(rock)) < 0.5), `${layout}: a sign over each rock`));
  }
});

test('no jump or double jump clears the hedge', () => {
  const hedgeTop = getObstacleHitbox(makeObstacle('hedge', 0)).y;
  for (const secondPress of [null, ...Array.from({ length: 45 }, (_, i) => i + 1)]) {
    const state = createState(() => 0.5);
    state.gameState = 'running';
    state.nextObstacleIn = Infinity;
    const services = createTestServices();
    jump(state, services, 0);
    let lowestBottom = Infinity;
    for (let f = 0; f < 120 && (f === 0 || state.dog.jumping); f++) {
      if (f === secondPress) jump(state, services, f);
      update(state, DT_BASELINE, services, () => 0.5, f);
      const box = getDogHitbox(state.dog, false);
      lowestBottom = Math.min(lowestBottom, box.y + box.h);
    }
    assert.ok(lowestBottom > hedgeTop, `second press at frame ${secondPress}: dog bottom ${lowestBottom} vs hedge top ${hedgeTop}`);
  }
});

// --- Burrowing ---

test('ducking over a hole drops the dog into the tunnel; ducking between holes does not', () => {
  let dug = 0;
  const services = createTestServices({ sfx: { ...createSilentSfx(), playDig: () => dug++ } });
  const between = tunnelState(TUNNEL_LAYOUTS[0]);
  placeDogAt(between, 0, 0.5);
  duck(between, true, services);
  stepScene(between, services);
  assert.equal(between.dog.underground, false);

  const atHole = tunnelState(TUNNEL_LAYOUTS[0]);
  placeDogAt(atHole, 0);
  duck(atHole, true, services);
  stepScene(atHole, services);
  assert.equal(atHole.dog.underground, true);
  assert.equal(holeOf(atHole, 0).used, true);
  assert.equal(dug, 1);
});

test('holding duck stays down past a hole; letting go pops the dog up at the next one', () => {
  const services = createTestServices();
  const state = tunnelState(TUNNEL_LAYOUTS[0]);
  placeDogAt(state, 0);
  duck(state, true, services);
  stepScene(state, services);

  duck(state, false, services);
  stepScene(state, services);
  assert.equal(state.dog.underground, true, 'not back out through the hole it went in by');

  duck(state, true, services);
  placeDogAt(state, 1);
  stepScene(state, services);
  assert.equal(state.dog.underground, true, 'duck still held: stays down');

  duck(state, false, services);
  placeDogAt(state, 2);
  stepScene(state, services);
  assert.equal(state.dog.underground, false);
  assert.equal(state.dog.vy, TUNNEL_POP_VY);
  assert.equal(state.dog.jumping, true);
});

test('jumping under a hole pops out with a full jump; between holes it does nothing', () => {
  const services = createTestServices();
  const state = tunnelState(TUNNEL_LAYOUTS[0]);
  placeDogAt(state, 0);
  duck(state, true, services);
  stepScene(state, services);

  placeDogAt(state, 0, 0.5);
  jump(state, services, 1000);
  assert.equal(state.dog.underground, true);
  assert.equal(state.dog.vy, 0);

  placeDogAt(state, 1);
  jump(state, services, 1000);
  assert.equal(state.dog.underground, false);
  assert.equal(state.dog.vy, JUMP_FORCE);
  assert.equal(state.dog.doubleJumped, false, 'the double jump is still there');
});

test('a hole the dog popped out of cannot drop it straight back in', () => {
  const services = createTestServices();
  const state = tunnelState(TUNNEL_LAYOUTS[0]);
  placeDogAt(state, 0);
  duck(state, true, services);
  stepScene(state, services);
  duck(state, false, services);
  placeDogAt(state, 1);
  stepScene(state, services);
  assert.equal(state.dog.underground, false);

  Object.assign(state.dog, { jumping: false, vy: 0 });  // landed while still over hole 1
  duck(state, true, services);
  stepScene(state, services);
  assert.equal(state.dog.underground, false);
});

test('the dog pops out on its own where the tunnel ends', () => {
  const services = createTestServices();
  const layout = TUNNEL_LAYOUTS[0];
  const state = tunnelState(layout);
  placeDogAt(state, 0);
  duck(state, true, services);
  stepScene(state, services);
  placeDogAt(state, layout.length, 0.5);  // past the last hole, duck still held
  stepScene(state, services);
  assert.equal(state.dog.underground, false);
});

test('a dog in the tunnel passes under the hedge but meets the rock, which a dog on the surface runs over', () => {
  const services = createTestServices();
  const dogAt = (state, type) => {
    const box = getDogHitbox(state.dog, false);
    const obs = makeObstacle(type, 0);
    obs.x = box.x + box.w / 2 - obs.width / 2;
    state.obstacles = [obs];
  };
  const crawling = createState(() => 0.5);
  Object.assign(crawling, { gameState: 'running', hearts: 3 });
  Object.assign(crawling.dog, { underground: true, ducking: true });
  dogAt(crawling, 'hedge');
  checkCollision(crawling, services, 0);
  assert.equal(crawling.hearts, 3, 'passes under the hedge');
  dogAt(crawling, 'rock');
  checkCollision(crawling, services, 0);
  assert.equal(crawling.hearts, 2, 'runs into the rock');

  const running = createState(() => 0.5);
  Object.assign(running, { gameState: 'running', hearts: 3 });
  dogAt(running, 'rock');
  checkCollision(running, services, 0);
  assert.equal(running.hearts, 3, 'runs over the buried rock');
});

// --- The scene ---

test('the tunnel arms at TUNNEL_FIRST_AT, then TUNNEL_COOLDOWN after it last ended', () => {
  const state = createState(() => 0.5);
  state.score = TUNNEL_FIRST_AT - 1;
  assert.equal(tunnelScene.wantsTurn(state, {}), false);
  state.score = TUNNEL_FIRST_AT;
  assert.equal(tunnelScene.wantsTurn(state, {}), true);
  state.score = 2000;
  assert.equal(tunnelScene.wantsTurn(state, { lastEndScore: 2000 - TUNNEL_COOLDOWN + 1 }), false);
  assert.equal(tunnelScene.wantsTurn(state, { lastEndScore: 2000 - TUNNEL_COOLDOWN }), true);
});

test('a scene never plays the same layout as the one before', () => {
  for (let previous = 0; previous < TUNNEL_LAYOUTS.length; previous++) {
    for (const roll of [0, 0.4, 0.999]) {
      const state = createState(() => 0.5);
      state.sceneMemory.tunnel = { lastLayout: previous };
      setScenePhase(state, 'tunnel', 'pending');
      tunnelScene.start(state, state.scene, { rng: () => roll });
      assert.notEqual(state.sceneMemory.tunnel.lastLayout, previous);
      const holes = state.obstacles.filter(o => o.type === 'tunnelHole').length;
      assert.equal(holes, TUNNEL_LAYOUTS[state.sceneMemory.tunnel.lastLayout].length + 1);
    }
  }
});

test('every run shows the HOLD ↓ hint until its first drop into the tunnel', () => {
  const services = createTestServices();
  const state = tunnelState(TUNNEL_LAYOUTS[0]);
  assert.equal(state.tunnelHintPending, true);
  stepScene(state, services);
  assert.equal(state.tunnelHintPending, true, 'still running toward the first hole');

  placeDogAt(state, 0);
  duck(state, true, services);
  stepScene(state, services);
  assert.equal(state.tunnelHintPending, false);

  resetRun(state);
  assert.equal(state.tunnelHintPending, true, 'back for the next run');
});

// --- Bots through the real update() ---

// Plays one layout. The bot settles its duck for each hole 0.3 of a beat
// ahead, choosing the layer `route(stretch)` for the stretch after it (and
// the surface after the last hole); on the surface it jumps chocolate bars
// and double-jumps birds. Speed is held fixed.
function playTunnel(layout, speed, frameMs, route) {
  const services = createTestServices();
  const state = tunnelState(layout, speed);
  const score = state.score;
  const beat = TUNNEL_BEAT_FRAMES * speed;
  let hits = 0;
  let points = 0;
  let now = 0;
  let liftAtFirstHole = null;  // the camera's dip when the dog reaches the first hole
  let biggestCameraStep = 0;   // the camera never snaps, even as the scene ends
  for (let frame = 0; frame < 20000 && getScenePhase(state, 'tunnel') !== 'idle'; frame++) {
    const hearts = state.hearts;
    const effectsBefore = state.effects.length;
    const liftBefore = cameraLift(state);
    update(state, frameMs, services, () => 0.5, now);
    biggestCameraStep = Math.max(biggestCameraStep, Math.abs(cameraLift(state) - liftBefore));
    now += frameMs;
    state.score = score;
    if (state.hearts < hearts) hits++;
    state.effects.slice(effectsBefore).forEach(e => { if (e.kind === 'pointsPickup') points += e.points; });

    const dogBox = getDogHitbox(state.dog, false);
    const cx = dogCenterX(state.dog);
    const firstHole = holeOf(state, 0);
    if (liftAtFirstHole === null && firstHole && firstHole.x + firstHole.width / 2 <= cx) liftAtFirstHole = cameraLift(state);
    const next = state.obstacles
      .filter(o => o.type === 'tunnelHole' && !o.used && o.x + o.width / 2 >= cx)
      .sort((a, b) => a.holeIndex - b.holeIndex)[0];
    if (next && next.x + next.width / 2 - cx < beat * 0.3) {
      const wantDown = next.holeIndex < layout.length && route(layout[next.holeIndex]) === 'underground';
      if (wantDown !== state.duckHeld) duck(state, wantDown, services);
    }
    const ahead = type => state.obstacles.find(o => o.type === type && getObstacleHitbox(o).x + getObstacleHitbox(o).w > dogBox.x);
    if (ahead('bird') && state.dog.jumping && !state.dog.doubleJumped && state.dog.vy > -1) jump(state, services, now);
    if (!state.dog.underground && !state.dog.jumping && !state.duckHeld) {
      const gaps = ['hotdog', 'bird'].map(ahead).filter(Boolean).map(o => getObstacleHitbox(o).x - (dogBox.x + dogBox.w));
      if (gaps.some(gap => gap > 0 && gap <= speed * 14)) jump(state, services, now);
    }
  }
  return {
    hits, points, liftAtFirstHole, biggestCameraStep,
    finished: getScenePhase(state, 'tunnel') === 'idle', underground: state.dog.underground,
  };
}

const safeRoute = stretch => TUNNEL_STRETCHES[stretch].needs ?? 'underground';
const surfaceRoute = stretch => TUNNEL_STRETCHES[stretch].needs ?? 'surface';

test('every layout plays clean at every speed, staying under or taking the surface where either works', () => {
  for (const layout of TUNNEL_LAYOUTS) {
    for (const speed of SPEEDS) {
      for (const frameMs of FRAME_MS) {
        for (const [name, route] of [['tunnel', safeRoute], ['surface', surfaceRoute]]) {
          const run = playTunnel(layout, speed, frameMs, route);
          const label = `${layout} at ${speed}, ${Math.round(1000 / frameMs)}Hz, ${name} route`;
          assert.equal(run.hits, 0, label);
          assert.ok(run.finished && !run.underground, `${label}: scene ends with the dog up top`);
          assert.equal(run.liftAtFirstHole, -TUNNEL_CAMERA_DROP, `${label}: camera fully dipped by the first hole`);
          assert.ok(run.biggestCameraStep <= TUNNEL_CAMERA_SPEED * frameMs / DT_BASELINE + 1e-9, `${label}: the camera eases, never snaps`);
        }
      }
    }
  }
});

test('staying in one layer the whole way gets hit on every layout', () => {
  for (const layout of TUNNEL_LAYOUTS) {
    assert.ok(playTunnel(layout, 4.5, 1000 / 120, () => 'surface').hits > 0, `${layout}: surface only`);
    assert.ok(playTunnel(layout, 4.5, 1000 / 120, () => 'underground').hits > 0, `${layout}: tunnel only`);
  }
});

test('a jump over the bone bar can collect both bones at every speed', () => {
  for (const speed of SPEEDS) {
    for (const frameMs of FRAME_MS) {
      let best = 0;
      for (let pressFrame = 0; pressFrame < 4 * TUNNEL_BEAT_FRAMES; pressFrame++) {
        const services = createTestServices();
        const state = tunnelState(['boneBar'], speed);
        const score = state.score;
        let now = 0;
        let bones = 0;
        let frame = 0;
        while (getScenePhase(state, 'tunnel') !== 'idle' && frame < 20000) {
          if (frame === Math.round(pressFrame * DT_BASELINE / frameMs)) jump(state, services, now);
          const effectsBefore = state.effects.length;
          update(state, frameMs, services, () => 0.5, now);
          now += frameMs;
          frame++;
          state.score = score;
          bones += state.effects.slice(effectsBefore).filter(e => e.kind === 'pointsPickup').length;
          if (state.hearts < 99) break;
        }
        if (state.hearts === 99) best = Math.max(best, bones);
      }
      assert.equal(best, 2, `speed ${speed}, ${Math.round(1000 / frameMs)}Hz`);
    }
  }
});
