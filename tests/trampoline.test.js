// Trampoline scene: layout invariants, state machine, bounce mechanics,
// thorn collision behavior, and integration through the full update() loop.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState, resetRun } from '../js/core/state.js';
import { update } from '../js/systems/update.js';
import {
  updateTrampoline, getTrampLayout, spawnTrampRep,
} from '../js/systems/trampoline.js';
import { checkCollision } from '../js/systems/collision.js';
import { updateChase } from '../js/systems/chase.js';
import { updateBoss } from '../js/systems/boss.js';
import { spawnObstacle } from '../js/systems/spawning.js';
import { jump } from '../js/systems/control.js';
import {
  W, GROUND_Y, DT_BASELINE, MIN_OBSTACLE_GAP, HEART_HIT_INVULN,
  TRAMP_FIRST_AT, TRAMP_COOLDOWN, TRAMP_BOUNCES, TRAMP_BOUNCE_VY,
  TRAMP_BOUNCE_BONUS, TRAMP_BREATHER, TRAMP_REPS, TRAMP_TILE_W,
  CHASE_FIRST_AT, BOSS_MILESTONE, GIANT_FIRST_AT,
} from '../js/config.js';
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
  assert.equal(state.trampPending, true, 'arms once past the score gate');

  updateTrampoline(state, 1, services, 0);
  assert.equal(state.trampPending, true, 'stays pending while obstacles exist');
  assert.equal(state.trampActive, false);

  state.obstacles = [];
  updateTrampoline(state, 1, services, 0);
  assert.equal(state.trampPending, false);
  assert.equal(state.trampActive, true);
  assert.equal(state.trampRep, 0);
  assert.equal(state.trampBreatherFrames, TRAMP_BREATHER);

  // Run the breather down in one big step: rep 0 spawns
  updateTrampoline(state, TRAMP_BREATHER, services, 0);
  assert.equal(state.trampRep, 1);
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
    'giantActive', 'giantGrowing', 'giantShrinking',
    'chasePending', 'chaseEntering', 'chaseActive', 'chaseEscaping',
    'bossPending', 'bossChasing', 'bossLosing',
  ];
  for (const flag of blockers) {
    const state = runningState();
    state.score = TRAMP_FIRST_AT + 10;
    state[flag] = true;
    updateTrampoline(state, 1, createTestServices(), 0);
    assert.equal(state.trampPending, false, `${flag} must block arming`);
  }
});

test('a golden hot dog on the field blocks arming, and giant mode drops a pending scene', () => {
  const services = createTestServices();

  // A golden pickup on screen means giant mode is imminent: don't arm
  const state = runningState();
  state.score = TRAMP_FIRST_AT + 10;
  state.obstacles = [{ x: 400, y: GROUND_Y + 4, width: 36, height: 22, type: 'golden' }];
  updateTrampoline(state, 1, services, 0);
  assert.equal(state.trampPending, false, 'must not arm behind a golden pickup');

  // Giant mode starting while pending (debug G / race): stand down…
  const pendingState = runningState();
  pendingState.score = TRAMP_FIRST_AT + 10;
  pendingState.trampPending = true;
  pendingState.giantActive = true;
  pendingState.obstacles = [];
  updateTrampoline(pendingState, 1, services, 0);
  assert.equal(pendingState.trampPending, false, 'pending dropped when giant mode starts');
  assert.equal(pendingState.trampActive, false, 'scene must not activate mid-giant');

  // …through the shrink transition too…
  pendingState.trampPending = true;
  pendingState.giantActive = false;
  pendingState.giantShrinking = true;
  updateTrampoline(pendingState, 1, services, 0);
  assert.equal(pendingState.trampPending, false);

  // …then re-arm once giant mode has fully ended (score gate still holds)
  pendingState.giantShrinking = false;
  updateTrampoline(pendingState, 1, services, 0);
  assert.equal(pendingState.trampPending, true, 're-arms after giant mode ends');
});

test('active scene blocks chase, boss, goldens, and regular spawning', () => {
  const services = createTestServices();

  const chaseState = runningState();
  chaseState.trampActive = true;
  chaseState.score = CHASE_FIRST_AT + 10;
  updateChase(chaseState, 1);
  assert.equal(chaseState.chasePending, false, 'chase must not arm mid-scene');

  const bossState = runningState();
  bossState.trampActive = true;
  bossState.score = BOSS_MILESTONE + 10;
  updateBoss(bossState, 1, services);
  assert.equal(bossState.bossPending, false, 'boss must not arm mid-scene');

  const goldenState = runningState();
  goldenState.trampActive = true;
  goldenState.score = GIANT_FIRST_AT + 10;
  spawnObstacle(goldenState, () => 0);  // rng 0 always favors golden when eligible
  assert.ok(
    goldenState.obstacles.every(o => o.type !== 'golden'),
    'no golden spawns mid-scene',
  );

  const spawnState = runningState();
  spawnState.trampActive = true;
  spawnState.trampBreatherFrames = 10000;  // keep the scene itself from spawning
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

  state.trampActive = true;
  state.trampRep = 1;
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
  assert.equal(state.trampBounceEffects.length, 1);
  assert.equal(tramp.squashUntil, 1250, 'membrane squash window set');
  assert.equal(boings, 1);
});

// --- 5. Integration: bounce arc clears the patch ---

test('a jump onto the island carries the dog across the whole patch unharmed', () => {
  const state = runningState();
  const services = createTestServices();
  state.score = 500;  // speed = 3.0 + 0.5 = 3.5

  state.trampActive = true;
  state.speed = 3.5;
  spawnTrampRep(state);          // rep 0 at x = W + 10
  state.trampRep = TRAMP_BOUNCES;  // no further reps; scene ends when field clears

  const heartsBefore = state.hearts;
  let jumped = false;
  for (let i = 0; i < 5000; i++) {
    const tramp = state.obstacles.find(o => o.type === 'trampoline');
    // Single jump timed so the ~42-frame arc lands just past the island
    // center — the latest line that never stands in the entry thorns first
    if (!jumped && tramp && !state.dog.jumping
      && (tramp.x + tramp.width / 2) - (state.dog.x + 48) <= 48 * state.speed) {
      jump(state, services);
      jumped = true;
    }
    update(state, DT, services, () => 0.99, i * DT);
    if (!state.obstacles.some(o => o.type === 'thorns' || o.type === 'trampoline')
      && !state.dog.jumping) break;
  }

  assert.ok(jumped, 'the scripted jump fired');
  assert.equal(state.trampBounceEffects.length >= 1 || state.score > 500 + TRAMP_BOUNCE_BONUS, true, 'the bounce happened');
  assert.equal(state.hearts, heartsBefore, 'no thorn contact anywhere in the patch');
  assert.equal(state.gameState, 'running');
  assert.equal(state.dog.y, GROUND_Y, 'dog ended grounded past the patch');
  assert.equal(state.obstacles.some(o => o.type === 'thorns' || o.type === 'trampoline'), false);
});

// --- 6. Miss = heart loss, patch persists, scene continues ---

test('thorn contact spends one heart, keeps the patch, and i-frames cover the rest', () => {
  const state = runningState();
  const services = createTestServices();
  state.trampActive = true;
  const thorn = { x: 90, y: GROUND_Y - 14, width: 32, height: 30, type: 'thorns', seed: 90 };
  state.obstacles = [thorn];

  const died = checkCollision(state, services, 1000);
  assert.equal(died, false);
  assert.equal(state.hearts, 2, 'exactly one heart lost');
  assert.equal(state.invulnUntil, 1000 + HEART_HIT_INVULN);
  assert.equal(state.obstacles.length, 1, 'thorn tile not spliced');
  assert.equal(state.giantBonkEffects.length, 0, 'no bonk-fling for terrain');

  // Further overlap during i-frames costs nothing
  const died2 = checkCollision(state, services, 1000 + HEART_HIT_INVULN - 1);
  assert.equal(died2, false);
  assert.equal(state.hearts, 2);

  // Scene proceeds: patch scrolls off, next rep spawns after the breather
  state.trampRep = 1;
  state.obstacles = [];
  state.trampBreatherFrames = 1;
  updateTrampoline(state, 1, services, 5000);
  assert.equal(state.trampRep, 2);
  assert.ok(state.obstacles.some(o => o.type === 'trampoline'), 'rep 1 spawned');
});

// --- 7. Last-heart thorn hit kills ---

test('thorn contact on the last heart kills and clears the scene flags', () => {
  const state = runningState();
  const services = createTestServices();
  state.hearts = 1;
  state.trampActive = true;
  state.obstacles = [{ x: 90, y: GROUND_Y - 14, width: 32, height: 30, type: 'thorns', seed: 90 }];

  update(state, DT, services, () => 0.99, 0);

  assert.equal(state.gameState, 'dead');
  assert.equal(state.trampActive, false);
  assert.equal(state.trampPending, false);
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
  assert.equal(state.trampActive, true);

  let spawns = 0;
  for (let i = 0; i < 10000 && state.trampActive; i++) {
    const before = state.obstacles.length;
    updateTrampoline(state, 1, services, i);
    if (state.obstacles.length > before) {
      spawns++;
      state.obstacles = [];  // simulate the patch scrolling off
    }
  }

  assert.equal(spawns, TRAMP_BOUNCES, 'three reps spawned');
  assert.equal(state.trampRep, TRAMP_BOUNCES);
  assert.equal(state.trampActive, false);
  assert.equal(state.lastTrampEndScore, state.score);
  assert.equal(state.nextObstacleIn, MIN_OBSTACLE_GAP, 'spawn gap reset on scene end');

  // Normal spawning resumes through update() once the gap elapses
  for (let i = 0; i < 500 && state.obstacles.length === 0 && state.gameState === 'running'; i++) {
    update(state, DT, services, () => 0.99, i * DT);
  }
  assert.ok(state.obstacles.length > 0, 'regular obstacles resumed');

  // No re-arm before the cooldown, re-arms after
  const cooldownState = runningState();
  cooldownState.lastTrampEndScore = 1000;
  cooldownState.score = 1000 + TRAMP_COOLDOWN - 1;
  updateTrampoline(cooldownState, 1, services, 0);
  assert.equal(cooldownState.trampPending, false, 'still cooling down');
  cooldownState.score = 1000 + TRAMP_COOLDOWN;
  updateTrampoline(cooldownState, 1, services, 0);
  assert.equal(cooldownState.trampPending, true, 'cooldown elapsed');
});

// --- 10. resetRun clears every scene field ---

test('resetRun restores all six trampoline fields to defaults', () => {
  const state = createState(() => 0.5);
  state.trampPending = true;
  state.trampActive = true;
  state.trampRep = 2;
  state.trampBreatherFrames = 55;
  state.lastTrampEndScore = 777;
  state.trampBounceEffects = [{ x: 1, y: 2, startTime: 3 }];

  resetRun(state);

  assert.equal(state.trampPending, false);
  assert.equal(state.trampActive, false);
  assert.equal(state.trampRep, 0);
  assert.equal(state.trampBreatherFrames, 0);
  assert.equal(state.lastTrampEndScore, 0);
  assert.deepEqual(state.trampBounceEffects, []);
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
