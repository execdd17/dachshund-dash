import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../js/core/state.js';
import {
  activateGiantMode, deactivateGiantMode, getGiantVisualScale,
} from '../js/systems/giant.js';
import { updateChase } from '../js/systems/chase.js';
import { updateBoss } from '../js/systems/boss.js';
import { updateTrampoline } from '../js/systems/trampoline.js';
import { markSceneEnd } from '../js/systems/encounters.js';
import { killDog } from '../js/systems/death.js';
import { jump, duck } from '../js/systems/control.js';
import {
  W, GIANT_SCALE, GIANT_SCALE_TRANSITION, GIANT_SCORE_MULTIPLIER, GIANT_END_INVULN,
  CHASE_FIRST_AT, CHASE_DURATION_FRAMES, SQUIRREL_OFFSET,
  BOSS_MILESTONE, BOSS_SQUIRREL_START_X, JUMP_FORCE, DOUBLE_JUMP_FORCE,
  SCENE_MIN_GAP, TRAMP_FIRST_AT,
} from '../js/config.js';
import { createTestServices } from './helpers.js';

// --- Giant mode ---

test('giant mode activation and timed visual scale easing', () => {
  const state = createState(() => 0.5);
  const services = createTestServices();
  activateGiantMode(state, services, 1000);
  assert.equal(state.giantActive, true);
  assert.equal(state.giantScoreMultiplier, GIANT_SCORE_MULTIPLIER);
  assert.equal(state.giantGrowing, true);

  // Halfway through the grow transition: eased t=0.5 → 1 + (scale-1)*0.75
  const half = getGiantVisualScale(state, 1000 + GIANT_SCALE_TRANSITION / 2);
  assert.ok(Math.abs(half - (1 + (GIANT_SCALE - 1) * 0.75)) < 1e-9);

  // Past the transition: full scale, growing flag cleared
  assert.equal(getGiantVisualScale(state, 1000 + GIANT_SCALE_TRANSITION), GIANT_SCALE);
  assert.equal(state.giantGrowing, false);
  assert.equal(getGiantVisualScale(state, 2000), GIANT_SCALE);

  deactivateGiantMode(state, services, 5000);
  assert.equal(state.giantActive, false);
  assert.equal(state.giantShrinking, true);
  assert.equal(state.giantScoreMultiplier, 1);
  assert.equal(state.invulnUntil, 5000 + GIANT_END_INVULN, 'grace i-frames after shrink');
  assert.equal(getGiantVisualScale(state, 5000 + GIANT_SCALE_TRANSITION), 1);
  assert.equal(state.giantShrinking, false);
});

test('giant-end grace period does not shorten longer existing i-frames', () => {
  const state = createState(() => 0.5);
  state.invulnUntil = 5000 + GIANT_END_INVULN + 1000;
  deactivateGiantMode(state, createTestServices(), 5000);
  assert.equal(state.invulnUntil, 5000 + GIANT_END_INVULN + 1000);
});

// --- Chase state machine ---

test('chase arms at CHASE_FIRST_AT, enters when obstacles clear, runs, escapes', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.score = CHASE_FIRST_AT;
  state.obstacles = [{ x: 100, y: 0, width: 10, height: 10, type: 'hotdog' }];

  updateChase(state, 1);
  assert.equal(state.chasePending, true, 'pending while obstacles on screen');

  state.obstacles = [];
  updateChase(state, 1);
  assert.equal(state.chasePending, false);
  assert.equal(state.chaseEntering, true);
  assert.equal(state.squirrelEnterX, W + 80);

  // Squirrel runs in until it reaches the offset ahead of the dog
  for (let i = 0; i < 10000 && state.chaseEntering; i++) updateChase(state, 1);
  assert.equal(state.chaseActive, true);
  assert.equal(state.nextObstacleIn, 80);

  // Chase runs for its fixed frame duration, then the squirrel escapes
  state.frameCount = state.chaseStartedFrame + CHASE_DURATION_FRAMES;
  updateChase(state, 1);
  assert.equal(state.chaseActive, false);
  assert.equal(state.chaseEscaping, true);
  assert.equal(state.squirrelEscapeX, state.dog.x + SQUIRREL_OFFSET);
  assert.equal(state.lastChaseEndScore, state.score);

  for (let i = 0; i < 10000 && state.chaseEscaping; i++) updateChase(state, 1);
  assert.equal(state.chaseEscaping, false);
});

test('chase does not arm during giant or boss modes', () => {
  const state = createState(() => 0.5);
  state.score = CHASE_FIRST_AT + 100;
  state.giantActive = true;
  updateChase(state, 1);
  assert.equal(state.chasePending, false);

  state.giantActive = false;
  state.bossChasing = true;
  updateChase(state, 1);
  assert.equal(state.chasePending, false);
});

test('chase and boss do not arm behind a golden pickup, and stand down if giant wins', () => {
  // A golden on the field blocks arming (giant mode is imminent)
  const golden = { x: 400, y: 0, width: 36, height: 22, type: 'golden' };
  const chaseState = createState(() => 0.5);
  chaseState.score = CHASE_FIRST_AT + 100;
  chaseState.obstacles = [golden];
  updateChase(chaseState, 1);
  assert.equal(chaseState.chasePending, false);

  const bossState = createState(() => 0.5);
  bossState.score = BOSS_MILESTONE + 5;
  bossState.obstacles = [golden];
  updateBoss(bossState, 1, createTestServices());
  assert.equal(bossState.bossPending, false, 'milestone not consumed either');
  assert.equal(bossState.lastBossMilestone, 0);

  // Giant activating while pending: both stand down; boss refunds its milestone
  const chasePend = createState(() => 0.5);
  chasePend.chasePending = true;
  chasePend.giantActive = true;
  updateChase(chasePend, 1);
  assert.equal(chasePend.chasePending, false);
  assert.equal(chasePend.chaseEntering, false);

  const bossPend = createState(() => 0.5);
  bossPend.bossPending = true;
  bossPend.lastBossMilestone = 1;
  bossPend.giantActive = true;
  updateBoss(bossPend, 1, createTestServices());
  assert.equal(bossPend.bossPending, false);
  assert.equal(bossPend.bossChasing, false);
  assert.equal(bossPend.lastBossMilestone, 0, 'milestone refunded for re-arm after giant');
});

// --- Cross-scene minimum gap ---

test('no scene arms until SCENE_MIN_GAP has elapsed since the last scene ended', () => {
  const services = createTestServices();
  const endedAt = 50000;

  // Chase: blocked one ms short of the gap, arms once it elapses
  const chaseState = createState(() => 0.5);
  chaseState.score = CHASE_FIRST_AT + 100;
  markSceneEnd(chaseState, endedAt);
  updateChase(chaseState, 1, endedAt + SCENE_MIN_GAP - 1);
  assert.equal(chaseState.chasePending, false, 'chase blocked inside the gap');
  updateChase(chaseState, 1, endedAt + SCENE_MIN_GAP);
  assert.equal(chaseState.chasePending, true, 'chase arms after the gap');

  // Boss: blocked check must not consume the milestone
  const bossState = createState(() => 0.5);
  bossState.score = BOSS_MILESTONE + 5;
  markSceneEnd(bossState, endedAt);
  updateBoss(bossState, 1, services, endedAt + SCENE_MIN_GAP - 1);
  assert.equal(bossState.bossPending, false, 'boss blocked inside the gap');
  assert.equal(bossState.lastBossMilestone, 0, 'milestone not consumed while blocked');
  updateBoss(bossState, 1, services, endedAt + SCENE_MIN_GAP);
  assert.equal(bossState.bossPending, true, 'boss arms after the gap');

  // Trampoline likewise
  const trampState = createState(() => 0.5);
  trampState.score = TRAMP_FIRST_AT + 1;
  markSceneEnd(trampState, endedAt);
  updateTrampoline(trampState, 1, services, endedAt + SCENE_MIN_GAP - 1);
  assert.equal(trampState.trampPending, false, 'tramp blocked inside the gap');
  updateTrampoline(trampState, 1, services, endedAt + SCENE_MIN_GAP);
  assert.equal(trampState.trampPending, true, 'tramp arms after the gap');
});

test('a chase escape completing stamps lastSceneEndAt', () => {
  const state = createState(() => 0.5);
  state.chaseEscaping = true;
  state.squirrelEscapeX = W + 100;  // already past the exit threshold
  updateChase(state, 1, 12345);
  assert.equal(state.chaseEscaping, false);
  assert.equal(state.lastSceneEndAt, 12345);
});

// --- Boss state machine ---

test('boss arms at each BOSS_MILESTONE and cancels pending chase', () => {
  const state = createState(() => 0.5);
  state.score = BOSS_MILESTONE + 5;
  state.chasePending = true;
  updateBoss(state, 1, createTestServices());
  assert.equal(state.bossPending, false, 'chasePending blocks boss trigger');

  state.chasePending = false;
  updateBoss(state, 1, createTestServices());
  assert.equal(state.bossPending, true);
  assert.equal(state.lastBossMilestone, 1);
});

test('boss waits for clear field, chases, then squirrel retreats', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.bossPending = true;
  state.obstacles = [];
  const services = createTestServices();

  updateBoss(state, 1, services);
  assert.equal(state.bossChasing, true);
  assert.equal(state.bossSquirrelX, BOSS_SQUIRREL_START_X);

  // Dog stays airborne (jumping) so the grounded-squirrel hitbox never
  // catches it; run the full encounter
  state.dog.jumping = true;
  state.dog.y = 100;
  for (let i = 0; i < 5000 && state.bossChasing; i++) updateBoss(state, 1, services);
  assert.equal(state.bossChasing, false);
  assert.equal(state.bossLosing, true);
  assert.equal(state.gameState, 'running', 'dog survived');

  state.dog.jumping = false;
  state.dog.y = 200;
  for (let i = 0; i < 5000 && state.bossLosing; i++) updateBoss(state, 1, services);
  assert.equal(state.bossLosing, false);
});

test('boss squirrel trails the dog without catching it (peak stays behind hitbox)', () => {
  // By design: at peak the squirrel spans dog.x-70..dog.x-40, short of the dog
  // hitbox at dog.x+23. The boss challenge is the reduced reaction distance,
  // not the squirrel itself. Pin that down so tuning changes don't break it.
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.bossPending = true;
  state.obstacles = [];
  const services = createTestServices();
  updateBoss(state, 1, services); // start chase
  for (let i = 0; i < 5000 && state.bossChasing; i++) {
    updateBoss(state, 1, services);
    assert.ok(state.bossSquirrelX + 30 <= state.dog.x + 23, 'squirrel stays behind the dog hitbox');
  }
  assert.equal(state.gameState, 'running', 'grounded running dog survives the boss squirrel');
});

// --- Death handling ---

test('killDog: non-qualifying score goes straight to dead without recording', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.score = 10;
  state.highScores = [500, 400, 300, 200, 100].map(s => ({ name: 'X', score: s }));
  let recorded = false;
  killDog(state, createTestServices({ recordScore: () => { recorded = true; } }));
  assert.equal(state.gameState, 'dead');
  assert.equal(recorded, false);
});

test('killDog: qualifying score is recorded immediately, no name prompt', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.score = 999;
  state.playerName = 'KID';
  let recordedScore = null;
  const services = createTestServices({ recordScore: (s) => { recordedScore = s; } });
  killDog(state, services);
  assert.equal(state.gameState, 'dead');
  assert.equal(recordedScore, 999);
});

test('killDog stores the global placement for the game-over banner', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.score = 300;
  state.difficulty = 'NORMAL';
  let asked = null;
  const services = createTestServices({
    globalScores: {
      qualifies: () => false,
      placement: (score, difficulty) => { asked = { score, difficulty }; return 4; },
      submit: async () => {},
      maybeRefresh: () => {},
      setSessionDifficulty: async () => {},
      loadView: async () => {},
    },
  });
  killDog(state, services);
  assert.equal(state.globalPlacement, 4);
  assert.deepEqual(asked, { score: 300, difficulty: 'NORMAL' });
});

test('killDog clears all encounter modes', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.highScores = [500, 400, 300, 200, 100].map(s => ({ name: 'X', score: s }));
  state.score = 1;
  state.chaseActive = true;
  state.bossChasing = true;
  state.giantActive = true;
  killDog(state, createTestServices());
  assert.equal(state.chaseActive, false);
  assert.equal(state.bossChasing, false);
  assert.equal(state.giantActive, false);
});

// --- Controls ---

test('jump starts a run from idle and applies jump force', () => {
  const state = createState(() => 0.5);
  const services = createTestServices();
  jump(state, services);
  assert.equal(state.gameState, 'running');
  assert.equal(state.dog.jumping, true);
  assert.equal(state.dog.vy, JUMP_FORCE);
});

test('double jump only works once per airtime', () => {
  const state = createState(() => 0.5);
  const services = createTestServices();
  jump(state, services);          // start + first jump
  jump(state, services);          // double jump
  assert.equal(state.dog.doubleJumped, true);
  assert.equal(state.dog.vy, DOUBLE_JUMP_FORCE);
  const vyBefore = state.dog.vy;
  jump(state, services);          // third press: ignored
  assert.equal(state.dog.vy, vyBefore);
});

test('restart from dead is locked out for 1s after death', () => {
  const state = createState(() => 0.5);
  const services = createTestServices();
  state.gameState = 'dead';
  state.deathTime = Date.now();
  jump(state, services);
  assert.equal(state.gameState, 'dead', 'too soon to restart');
  state.deathTime = Date.now() - 1500;
  jump(state, services);
  assert.equal(state.gameState, 'running');
});

test('duck only applies while running and grounded', () => {
  const state = createState(() => 0.5);
  const services = createTestServices();
  duck(state, true, services);
  assert.equal(state.dog.ducking, false, 'idle: no duck');
  state.gameState = 'running';
  duck(state, true, services);
  assert.equal(state.dog.ducking, true);
  duck(state, false, services);
  assert.equal(state.dog.ducking, false);
  state.dog.jumping = true;
  duck(state, true, services);
  assert.equal(state.dog.ducking, false, 'airborne: no duck');
});
