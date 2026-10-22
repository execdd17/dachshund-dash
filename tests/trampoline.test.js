// Trampoline scene: layout invariants, state machine, bounce mechanics,
// thorn collision behavior, and integration through the full update() loop.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState, resetRun } from '../js/core/state.js';
import { update } from '../js/systems/update.js';
import {
  updateTrampoline, getTrampLayout, spawnTrampRep,
} from '../js/systems/trampoline.js';
import { checkCollision, getDogHitbox } from '../js/systems/collision.js';
import { updateChase } from '../js/systems/chase.js';
import { updateBoss } from '../js/systems/boss.js';
import { spawnObstacle } from '../js/systems/spawning.js';
import { jump } from '../js/systems/control.js';
import {
  W, GROUND_Y, DT_BASELINE, MIN_OBSTACLE_GAP, HEART_HIT_INVULN,
  TRAMP_FIRST_AT, TRAMP_COOLDOWN, TRAMP_BOUNCES, TRAMP_BOUNCE_VY,
  TRAMP_BOUNCE_BONUS, TRAMP_BREATHER, TRAMP_REPS, TRAMP_TILE_W,
  CHASE_FIRST_AT, BOSS_AT, GIANT_FIRST_AT,
  INITIAL_SPEED, SPEED_INCREMENT,
} from '../js/config.js';
import { setGiantPhase, sceneMemory } from '../js/systems/encounters.js';
import { getScenePhase, setScenePhase } from '../js/systems/scenes.js';
import { effectsOfKind } from '../js/systems/effects.js';
import { createTestServices } from './helpers.js';

const DT = DT_BASELINE;

function runningState() {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  return state;
}

// --- 1. Layout invariants (the guardrail for all future tuning) ---

test('layout: patch is never double-jump bypassable and leading-edge bounce clears the exit', () => {
  for (let rep = 0; rep < TRAMP_REPS.length; rep++) {
    for (let s = 3.0; s <= 7.0; s += 0.5) {
      const layout = getTrampLayout(rep, s);
      assert.ok(
        layout.patchWidth > 62 * s,
        `rep ${rep} at speed ${s}: patch ${layout.patchWidth} must exceed double-jump carry ${62 * s}`,
      );
      if (s >= 3.35) {
        // Uses the real ceil'd tile widths, not the raw exitFactor: this is
        // the guarantee that the bounce alone (no double jump) clears the
        // exit even from the island's leading edge.
        assert.ok(
          56 * s >= layout.trampWidth + layout.exitTiles * TRAMP_TILE_W,
          `rep ${rep} at speed ${s}: leading-edge bounce must clear trampoline + exit tiles`,
        );
      }
    }
  }
});

// --- 2. Arming & activation ---

test('scene arms past TRAMP_FIRST_AT, waits for a clear field, then spawns rep 0', () => {
  const state = runningState();
  const services = createTestServices();
  state.score = TRAMP_FIRST_AT + 1;
  state.obstacles = [{ x: 400, y: GROUND_Y + 4, width: 36, height: 22, type: 'hotdog' }];

  updateTrampoline(state, 1, services, 0);
  assert.equal(getScenePhase(state, 'tramp'), 'pending', 'arms once past the score gate');

  updateTrampoline(state, 1, services, 0);
  assert.equal(getScenePhase(state, 'tramp'), 'pending', 'stays pending while obstacles exist');
  assert.notEqual(getScenePhase(state, 'tramp'), 'active');

  state.obstacles = [];
  updateTrampoline(state, 1, services, 0);
  assert.notEqual(getScenePhase(state, 'tramp'), 'pending');
  assert.equal(getScenePhase(state, 'tramp'), 'active');
  assert.equal(state.scene.rep, 0);
  assert.equal(state.scene.breatherFrames, TRAMP_BREATHER);

  // Run the breather down in one big step: rep 0 spawns
  updateTrampoline(state, TRAMP_BREATHER, services, 0);
  assert.equal(state.scene.rep, 1);
  const thorns = state.obstacles.filter(o => o.type === 'thorns');
  const tramps = state.obstacles.filter(o => o.type === 'trampoline');
  assert.equal(tramps.length, 1, 'exactly one trampoline');
  const layout = getTrampLayout(0, state.speed);
  assert.equal(thorns.length, layout.entryTiles + layout.exitTiles);

  // x-ordering: entry tiles < trampoline < exit tiles
  const tramp = tramps[0];
  const entry = thorns.filter(o => o.x < tramp.x);
  const exit = thorns.filter(o => o.x > tramp.x);
  assert.equal(entry.length, layout.entryTiles);
  assert.equal(exit.length, layout.exitTiles);
  entry.forEach(o => assert.ok(o.x + o.width <= tramp.x));
  exit.forEach(o => assert.ok(o.x >= tramp.x + tramp.width));
});

// --- 3. Mutual exclusion, both directions ---

test('scene never arms while another encounter is running', () => {
  const blockers = [
    ['giant', 'growing'], ['giant', 'active'], ['giant', 'shrinking'],
    ['chase', 'pending'], ['chase', 'entering'], ['chase', 'active'], ['chase', 'exiting'],
    ['boss', 'pending'], ['boss', 'active'], ['boss', 'exiting'],
  ];
  for (const [id, phase] of blockers) {
    const state = runningState();
    state.score = TRAMP_FIRST_AT + 10;
    if (id === 'giant') setGiantPhase(state, phase); else setScenePhase(state, id, phase);
    updateTrampoline(state, 1, createTestServices(), 0);
    assert.notEqual(getScenePhase(state, 'tramp'), 'pending', `${id} ${phase} must block arming`);
  }
});

test('a golden hot dog on the field blocks arming, and giant mode drops a pending scene', () => {
  const services = createTestServices();

  // A golden pickup on screen means giant mode is imminent: don't arm
  const state = runningState();
  state.score = TRAMP_FIRST_AT + 10;
  state.obstacles = [{ x: 400, y: GROUND_Y + 4, width: 36, height: 22, type: 'golden' }];
  updateTrampoline(state, 1, services, 0);
  assert.notEqual(getScenePhase(state, 'tramp'), 'pending', 'must not arm behind a golden pickup');

  // Giant mode starting while pending (debug G / race): stand down…
  const pendingState = runningState();
  pendingState.score = TRAMP_FIRST_AT + 10;
  setScenePhase(pendingState, 'tramp', 'pending');
  setGiantPhase(pendingState, 'active');
  pendingState.obstacles = [];
  updateTrampoline(pendingState, 1, services, 0);
  assert.notEqual(getScenePhase(pendingState, 'tramp'), 'pending', 'pending dropped when giant mode starts');
  assert.notEqual(getScenePhase(pendingState, 'tramp'), 'active', 'scene must not activate mid-giant');

  // …through the shrink transition too…
  setScenePhase(pendingState, 'tramp', 'pending');
  setGiantPhase(pendingState, 'shrinking');
  updateTrampoline(pendingState, 1, services, 0);
  assert.notEqual(getScenePhase(pendingState, 'tramp'), 'pending');

  // …then re-arm once giant mode has fully ended (score gate still holds)
  setGiantPhase(pendingState, 'off');
  updateTrampoline(pendingState, 1, services, 0);
  assert.equal(getScenePhase(pendingState, 'tramp'), 'pending', 're-arms after giant mode ends');
});

test('active scene blocks chase, boss, goldens, and regular spawning', () => {
  const services = createTestServices();

  const chaseState = runningState();
  setScenePhase(chaseState, 'tramp', 'active');
  chaseState.score = CHASE_FIRST_AT + 10;
  updateChase(chaseState, 1);
  assert.notEqual(getScenePhase(chaseState, 'chase'), 'pending', 'chase must not arm mid-scene');

  const bossState = runningState();
  setScenePhase(bossState, 'tramp', 'active');
  bossState.score = BOSS_AT[0] + 10;
  updateBoss(bossState, 1, services);
  assert.notEqual(getScenePhase(bossState, 'boss'), 'pending', 'boss must not arm mid-scene');

  const goldenState = runningState();
  setScenePhase(goldenState, 'tramp', 'active');
  goldenState.score = GIANT_FIRST_AT + 10;
  spawnObstacle(goldenState, () => 0);  // rng 0 always favors golden when eligible
  assert.ok(
    goldenState.obstacles.every(o => o.type !== 'golden'),
    'no golden spawns mid-scene',
  );

  const spawnState = runningState();
  setScenePhase(spawnState, 'tramp', 'active');
  spawnState.scene.breatherFrames = 10000;  // keep the scene itself from spawning
  spawnState.nextObstacleIn = -1;
  update(spawnState, DT, services, () => 0.99, 0);
  assert.equal(spawnState.obstacles.length, 0, 'regular spawning suppressed mid-scene');
});

// --- 4. Bounce mechanics ---

test('descending onto the trampoline launches, resets double jump, scores, and boings', () => {
  const state = runningState();
  let boings = 0;
  const services = createTestServices();
  services.sfx = { ...services.sfx, playBoing: () => { boings++; } };

  setScenePhase(state, 'tramp', 'active');
  state.scene.rep = 1;
  const tramp = { x: 60, y: GROUND_Y - 12, width: 84, height: 12, type: 'trampoline', squashUntil: 0 };
  state.obstacles = [tramp];

  state.dog.y = GROUND_Y - 12;  // at the membrane, descending
  state.dog.vy = 3;
  state.dog.jumping = true;
  state.dog.doubleJumped = true;
  const scoreBefore = state.score;

  updateTrampoline(state, 1, services, 1000);

  assert.equal(state.dog.vy, TRAMP_BOUNCE_VY);
  assert.equal(state.dog.jumping, true);
  assert.equal(state.dog.doubleJumped, false, 'double jump reset for a fresh air correction');
  assert.equal(state.score, scoreBefore + TRAMP_BOUNCE_BONUS);
  assert.equal(effectsOfKind(state, 'trampBounce').length, 1);
  assert.equal(tramp.squashUntil, 1250, 'membrane squash window set');
  assert.equal(boings, 1);
});

// --- 5. Integration: bounce arc clears the patch ---

test('a jump onto the island carries the dog across the whole patch unharmed', () => {
  const state = runningState();
  const services = createTestServices();
  // Score chosen so the actual speed (recomputed from score inside update())
  // is 3.5 — inside the s >= 3.35 band where the layout invariant guarantees
  // the bounce alone clears the exit. Below that band the post-bounce double
  // jump is required, which this single-jump script doesn't model.
  state.score = (3.5 - INITIAL_SPEED) / SPEED_INCREMENT;
  sceneMemory(state, 'boss').lastMilestone = 99;  // keep the boss milestone check out of this scene
  const speed = INITIAL_SPEED + state.score * SPEED_INCREMENT;

  setScenePhase(state, 'tramp', 'active');
  state.speed = speed;
  spawnTrampRep(state, 0);       // rep 0 at x = W + 10
  state.scene.rep = TRAMP_BOUNCES;  // no further reps; scene ends when field clears

  const heartsBefore = state.hearts;
  let jumped = false;
  for (let i = 0; i < 5000; i++) {
    state.speed = speed;  // pin — score drift during update() must not retime the jump
    const thorns = state.obstacles.filter(o => o.type === 'thorns');
    // Single jump at the last safe moment: two frames before the entry thorns
    // reach the standing dog. The ~44-frame arc then lands on the island left
    // of center, and the layout invariant (test 1) guarantees even a
    // leading-edge bounce clears the exit thorns.
    const thornFront = Math.min(...thorns.map(o => o.x));
    const dogBox = getDogHitbox(state.dog, false);
    if (!jumped && thorns.length && !state.dog.jumping
      && thornFront <= dogBox.x + dogBox.w + 2 * speed) {
      jump(state, services);
      jumped = true;
    }
    update(state, DT, services, () => 0.99, i * DT);
    if (!state.obstacles.some(o => o.type === 'thorns' || o.type === 'trampoline')
      && !state.dog.jumping) break;
  }

  assert.ok(jumped, 'the scripted jump fired');
  assert.ok(effectsOfKind(state, 'trampBounce').length >= 1, 'the bounce happened');
  assert.equal(state.hearts, heartsBefore, 'no thorn contact anywhere in the patch');
  assert.equal(state.gameState, 'running');
  assert.equal(state.dog.y, GROUND_Y, 'dog ended grounded past the patch');
  assert.equal(state.obstacles.some(o => o.type === 'thorns' || o.type === 'trampoline'), false);
});

// --- 6. Miss = heart loss, patch persists, scene continues ---

test('thorn contact spends one heart, keeps the patch, and i-frames cover the rest', () => {
  const state = runningState();
  const services = createTestServices();
  setScenePhase(state, 'tramp', 'active');
  const thorn = { x: 90, y: GROUND_Y - 14, width: 32, height: 30, type: 'thorns', seed: 90 };
  state.obstacles = [thorn];
  const hearts = state.hearts;

  const died = checkCollision(state, services, 1000);
  assert.equal(died, false);
  assert.equal(state.hearts, hearts - 1, 'exactly one heart lost');
  assert.equal(state.invulnUntil, 1000 + HEART_HIT_INVULN);
  assert.equal(state.obstacles.length, 1, 'thorn tile not spliced');
  assert.equal(effectsOfKind(state, 'bonk').length, 0, 'no bonk-fling for terrain');

  // Further overlap during i-frames costs nothing
  const died2 = checkCollision(state, services, 1000 + HEART_HIT_INVULN - 1);
  assert.equal(died2, false);
  assert.equal(state.hearts, hearts - 1);

  // Scene proceeds: patch scrolls off, next rep spawns after the breather
  state.scene.rep = 1;
  state.obstacles = [];
  state.scene.breatherFrames = 1;
  updateTrampoline(state, 1, services, 5000);
  assert.equal(state.scene.rep, 2);
  assert.ok(state.obstacles.some(o => o.type === 'trampoline'), 'rep 1 spawned');
});

// --- 7. Last-heart thorn hit kills ---

test('thorn contact on the last heart kills and clears the scene flags', () => {
  const state = runningState();
  const services = createTestServices();
  state.hearts = 1;
  setScenePhase(state, 'tramp', 'active');
  state.obstacles = [{ x: 90, y: GROUND_Y - 14, width: 32, height: 30, type: 'thorns', seed: 90 }];

  update(state, DT, services, () => 0.99, 0);

  assert.equal(state.gameState, 'dead');
  assert.notEqual(getScenePhase(state, 'tramp'), 'active');
  assert.notEqual(getScenePhase(state, 'tramp'), 'pending');
});

// --- 8. Trampoline is never harmful ---

test('overlapping only the trampoline never costs a heart', () => {
  const state = runningState();
  const services = createTestServices();
  // Fully overlapping the dog hitbox
  state.obstacles = [{ x: 60, y: GROUND_Y - 12, width: 84, height: 12, type: 'trampoline', squashUntil: 0 }];
  state.dog.y = GROUND_Y - 6;

  const died = checkCollision(state, services, 0);
  assert.equal(died, false);
  assert.equal(state.hearts, state.startingHearts);
});

// --- 9. Scene completion, spawn handoff, and cooldown ---

test('scene runs three reps, ends cleanly, and respects the cooldown before re-arming', () => {
  const state = runningState();
  const services = createTestServices();
  state.score = TRAMP_FIRST_AT + 1;

  updateTrampoline(state, 1, services, 0);   // arms
  updateTrampoline(state, 1, services, 0);   // activates (field already clear)
  assert.equal(getScenePhase(state, 'tramp'), 'active');

  let spawns = 0;
  for (let i = 0; i < 10000 && getScenePhase(state, 'tramp') === 'active'; i++) {
    const before = state.obstacles.length;
    updateTrampoline(state, 1, services, i);
    if (state.obstacles.length > before) {
      spawns++;
      state.obstacles = [];  // simulate the patch scrolling off
    }
  }

  assert.equal(spawns, TRAMP_BOUNCES, 'three reps spawned');
  assert.notEqual(getScenePhase(state, 'tramp'), 'active');
  assert.equal(state.sceneMemory.tramp.lastEndScore, state.score);
  assert.equal(state.nextObstacleIn, MIN_OBSTACLE_GAP, 'spawn gap reset on scene end');

  // Normal spawning resumes through update() once the gap elapses
  for (let i = 0; i < 500 && state.obstacles.length === 0 && state.gameState === 'running'; i++) {
    update(state, DT, services, () => 0.99, i * DT);
  }
  assert.ok(state.obstacles.length > 0, 'regular obstacles resumed');

  // No re-arm before the cooldown, re-arms after
  const cooldownState = runningState();
  sceneMemory(cooldownState, 'tramp').lastEndScore = 1000;
  cooldownState.score = 1000 + TRAMP_COOLDOWN - 1;
  updateTrampoline(cooldownState, 1, services, 0);
  assert.notEqual(getScenePhase(cooldownState, 'tramp'), 'pending', 'still cooling down');
  cooldownState.score = 1000 + TRAMP_COOLDOWN;
  updateTrampoline(cooldownState, 1, services, 0);
  assert.equal(getScenePhase(cooldownState, 'tramp'), 'pending', 'cooldown elapsed');
});

// --- 9. The last rep's heart: a double jump off the bounce reaches it ---

test('only the last rep floats a heart, past the island, above the bounce', () => {
  for (let rep = 0; rep < TRAMP_REPS.length; rep++) {
    const state = runningState();
    spawnTrampRep(state, rep);
    const hearts = state.obstacles.filter(o => o.type === 'heart');
    assert.equal(hearts.length, rep === TRAMP_BOUNCES - 1 ? 1 : 0, `rep ${rep}`);
    if (!hearts.length) continue;
    const tramp = state.obstacles.find(o => o.type === 'trampoline');
    assert.equal(hearts[0].x, tramp.x + TRAMP_REPS[rep].heart.leadFactor * state.speed);
    assert.ok(hearts[0].y + hearts[0].height < 0, 'up in the sky, above the play field');
  }
});

// Plays the last rep at `speed`: one jump at frame `jumpAt` (onto the island,
// for the jumps that matter), then a second jump `secondJumpDelay` frames
// after the bounce (or none). Reports whether the dog bounced off a jump
// (rather than walking on or jumping after) and whether it got the heart.
function playLastRep(speed, jumpAt, secondJumpDelay = null) {
  const state = runningState();
  const services = createTestServices();
  state.score = (speed - INITIAL_SPEED) / SPEED_INCREMENT;
  state.startingHearts = 99;
  state.hearts = 98;  // room for the heart; thorn misses can't end the run
  setScenePhase(state, 'tramp', 'active');
  Object.assign(state.scene, { rep: TRAMP_BOUNCES - 1, breatherFrames: 0 });
  let bounceFrame = null, bouncedFromJump = false;
  for (let f = 0, now = 0; f < 1000 && state.scene; f++) {
    if (f === jumpAt) jump(state, services, now);
    if (secondJumpDelay !== null && bounceFrame !== null && f === bounceFrame + secondJumpDelay) jump(state, services, now);
    const airborne = state.dog.jumping && f > jumpAt;
    const bounces = effectsOfKind(state, 'trampBounce').length;
    update(state, DT, services, () => 0.99, now += DT);
    if (bounceFrame === null && effectsOfKind(state, 'trampBounce').length > bounces) {
      bounceFrame = f;
      bouncedFromJump = airborne;
    }
  }
  return { bouncedFromJump, gotHeart: state.heartGainedAt > 0 };
}

test('the heart takes the bounce plus a double jump near its apex, from any landing spot', () => {
  for (const speed of [3.4, 5, 6.5]) {
    let landings = 0;
    for (let jumpAt = 0; jumpAt < 400; jumpAt += 3) {
      const bounceOnly = playLastRep(speed, jumpAt);
      if (!bounceOnly.bouncedFromJump) continue;
      landings++;
      assert.equal(bounceOnly.gotHeart, false, `speed ${speed}, jump at ${jumpAt}: the bounce alone falls short`);
      let window = 0;
      for (let delay = 1; delay < 60; delay++) if (playLastRep(speed, jumpAt, delay).gotHeart) window++;
      // 8 frames at the 120Hz baseline: a skilled press, not a pixel-perfect one
      assert.ok(window >= 8, `speed ${speed}, jump at ${jumpAt}: second-jump window ${window} frames`);
    }
    assert.ok(landings >= 3, `speed ${speed}: swept ${landings} landing spots`);
  }
});

// --- 10. resetRun clears every scene field ---

test('resetRun clears the running scene, its memory, and its effects', () => {
  const state = createState(() => 0.5);
  setScenePhase(state, 'tramp', 'active');
  state.scene.rep = 2;
  state.scene.breatherFrames = 55;
  sceneMemory(state, 'tramp').lastEndScore = 777;
  state.effects = [{ kind: 'trampBounce', x: 1, y: 2, startTime: 3 }];

  resetRun(state);

  assert.equal(state.scene, null);
  assert.deepEqual(state.sceneMemory, {});
  assert.deepEqual(state.effects, []);
});

// --- 11. Wide-obstacle cull is right-edge based ---

test('an 84px-wide obstacle survives the cull while its right edge is on screen', () => {
  const survivor = runningState();
  survivor.obstacles = [{ x: -30, y: GROUND_Y - 12, width: 84, height: 12, type: 'trampoline', squashUntil: 0 }];
  update(survivor, DT, createTestServices(), () => 0.99, 0);
  assert.equal(survivor.obstacles.length, 1, 'right edge still past -10: kept');

  const goner = runningState();
  goner.obstacles = [{ x: -95, y: GROUND_Y - 12, width: 84, height: 12, type: 'trampoline', squashUntil: 0 }];
  update(goner, DT, createTestServices(), () => 0.99, 0);
  assert.equal(goner.obstacles.length, 0, 'fully off-screen: culled');
});
