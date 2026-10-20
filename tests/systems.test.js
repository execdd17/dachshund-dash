import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../js/core/state.js';
import {
  activateGiantMode, deactivateGiantMode, getGiantVisualScale, finishGiantTransition, giantScoreMultiplier,
} from '../js/systems/giant.js';
import { updateChase } from '../js/systems/chase.js';
import { updateBoss } from '../js/systems/boss.js';
import { updateTrampoline } from '../js/systems/trampoline.js';
import { markSceneEnd, getGiantPhase, setGiantPhase, sceneMemory } from '../js/systems/encounters.js';
import { getScenePhase, setScenePhase, forceScene, scenesBlockSpawning, SCENES } from '../js/systems/scenes.js';
import { killDog } from '../js/systems/death.js';
import { jump, duck } from '../js/systems/control.js';
import { update } from '../js/systems/update.js';
import { makeObstacle } from '../js/systems/obstacleTypes.js';
import {
  W, GIANT_SCALE, GIANT_SCALE_TRANSITION, GIANT_SCORE_MULTIPLIER, GIANT_END_INVULN,
  CHASE_FIRST_AT, CHASE_DURATION_FRAMES, SQUIRREL_OFFSET,
  BOSS_MILESTONE, BOSS_SQUIRREL_START_X, JUMP_FORCE, DOUBLE_JUMP_FORCE,
  SCENE_MIN_GAP, TRAMP_FIRST_AT, GROUND_Y,
} from '../js/config.js';
import { createTestServices } from './helpers.js';

// --- Giant mode ---

test('giant mode activation and timed visual scale easing', () => {
  const state = createState(() => 0.5);
  const services = createTestServices();
  activateGiantMode(state, services, 1000);
  assert.equal(getGiantPhase(state), 'growing');
  assert.equal(giantScoreMultiplier(state), GIANT_SCORE_MULTIPLIER);

  // Halfway through the grow transition: eased t=0.5 → 1 + (scale-1)*0.75
  const half = getGiantVisualScale(state, 1000 + GIANT_SCALE_TRANSITION / 2);
  assert.ok(Math.abs(half - (1 + (GIANT_SCALE - 1) * 0.75)) < 1e-9);

  // Past the transition: full scale; the frame's update then ends the grow
  assert.equal(getGiantVisualScale(state, 1000 + GIANT_SCALE_TRANSITION), GIANT_SCALE);
  finishGiantTransition(state, 1000 + GIANT_SCALE_TRANSITION - 1);
  assert.equal(getGiantPhase(state), 'growing', 'not before the transition time');
  finishGiantTransition(state, 1000 + GIANT_SCALE_TRANSITION);
  assert.equal(getGiantPhase(state), 'active');
  assert.equal(getGiantVisualScale(state, 2000), GIANT_SCALE);

  deactivateGiantMode(state, services, 5000);
  assert.equal(getGiantPhase(state), 'shrinking');
  assert.equal(giantScoreMultiplier(state), 1);
  assert.equal(state.invulnUntil, 5000 + GIANT_END_INVULN, 'grace i-frames after shrink');
  assert.equal(getGiantVisualScale(state, 5000 + GIANT_SCALE_TRANSITION), 1);
  finishGiantTransition(state, 5000 + GIANT_SCALE_TRANSITION);
  assert.equal(getGiantPhase(state), 'off');
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
  assert.equal(getScenePhase(state, 'chase'), 'pending', 'pending while obstacles on screen');

  state.obstacles = [];
  updateChase(state, 1);
  assert.notEqual(getScenePhase(state, 'chase'), 'pending');
  assert.equal(getScenePhase(state, 'chase'), 'entering');
  assert.equal(state.scene.squirrelX, W + 80);

  // Squirrel runs in until it reaches the offset ahead of the dog
  for (let i = 0; i < 10000 && getScenePhase(state, 'chase') === 'entering'; i++) updateChase(state, 1);
  assert.equal(getScenePhase(state, 'chase'), 'active');
  assert.equal(state.nextObstacleIn, 80);

  // Chase runs for its fixed frame duration, then the squirrel escapes
  state.frameCount = state.scene.startedFrame + CHASE_DURATION_FRAMES;
  updateChase(state, 1);
  assert.notEqual(getScenePhase(state, 'chase'), 'active');
  assert.equal(getScenePhase(state, 'chase'), 'exiting');
  assert.equal(state.scene.squirrelX, state.dog.x + SQUIRREL_OFFSET);
  assert.equal(state.sceneMemory.chase.lastEndScore, state.score);

  for (let i = 0; i < 10000 && getScenePhase(state, 'chase') === 'exiting'; i++) updateChase(state, 1);
  assert.notEqual(getScenePhase(state, 'chase'), 'exiting');
});

test('chase does not arm during giant or boss modes', () => {
  const state = createState(() => 0.5);
  state.score = CHASE_FIRST_AT + 100;
  setGiantPhase(state, 'active');
  updateChase(state, 1);
  assert.notEqual(getScenePhase(state, 'chase'), 'pending');

  setGiantPhase(state, 'off');
  setScenePhase(state, 'boss', 'active');
  updateChase(state, 1);
  assert.notEqual(getScenePhase(state, 'chase'), 'pending');
});

test('chase and boss do not arm behind a golden pickup, and stand down if giant wins', () => {
  // A golden on the field blocks arming (giant mode is imminent)
  const golden = { x: 400, y: 0, width: 36, height: 22, type: 'golden' };
  const chaseState = createState(() => 0.5);
  chaseState.score = CHASE_FIRST_AT + 100;
  chaseState.obstacles = [golden];
  updateChase(chaseState, 1);
  assert.notEqual(getScenePhase(chaseState, 'chase'), 'pending');

  const bossState = createState(() => 0.5);
  bossState.score = BOSS_MILESTONE + 5;
  bossState.obstacles = [golden];
  updateBoss(bossState, 1, createTestServices());
  assert.notEqual(getScenePhase(bossState, 'boss'), 'pending');
  assert.deepEqual(bossState.sceneQueue, ['boss'], 'milestone turn queued, not lost');

  // Giant activating while pending: both stand down but keep their turn at
  // the head of the queue, so they re-arm right after the giant ends
  const chasePend = createState(() => 0.5);
  setScenePhase(chasePend, 'chase', 'pending');
  setGiantPhase(chasePend, 'active');
  updateChase(chasePend, 1);
  assert.notEqual(getScenePhase(chasePend, 'chase'), 'pending');
  assert.notEqual(getScenePhase(chasePend, 'chase'), 'entering');
  assert.deepEqual(chasePend.sceneQueue, ['chase'], 'turn kept at queue head');

  const bossPend = createState(() => 0.5);
  setScenePhase(bossPend, 'boss', 'pending');
  sceneMemory(bossPend, 'boss').lastMilestone = 1;
  bossPend.sceneQueue = ['tramp'];
  setGiantPhase(bossPend, 'active');
  updateBoss(bossPend, 1, createTestServices());
  assert.notEqual(getScenePhase(bossPend, 'boss'), 'pending');
  assert.notEqual(getScenePhase(bossPend, 'boss'), 'active');
  assert.deepEqual(bossPend.sceneQueue, ['boss', 'tramp'], 'boss requeued ahead of waiting scenes');
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
  assert.notEqual(getScenePhase(chaseState, 'chase'), 'pending', 'chase blocked inside the gap');
  updateChase(chaseState, 1, endedAt + SCENE_MIN_GAP);
  assert.equal(getScenePhase(chaseState, 'chase'), 'pending', 'chase arms after the gap');

  // Boss: a blocked milestone stays queued rather than being lost
  const bossState = createState(() => 0.5);
  bossState.score = BOSS_MILESTONE + 5;
  markSceneEnd(bossState, endedAt);
  updateBoss(bossState, 1, services, endedAt + SCENE_MIN_GAP - 1);
  assert.notEqual(getScenePhase(bossState, 'boss'), 'pending', 'boss blocked inside the gap');
  assert.deepEqual(bossState.sceneQueue, ['boss'], 'milestone turn queued while blocked');
  updateBoss(bossState, 1, services, endedAt + SCENE_MIN_GAP);
  assert.equal(getScenePhase(bossState, 'boss'), 'pending', 'boss arms after the gap');

  // Trampoline likewise
  const trampState = createState(() => 0.5);
  trampState.score = TRAMP_FIRST_AT + 1;
  markSceneEnd(trampState, endedAt);
  updateTrampoline(trampState, 1, services, endedAt + SCENE_MIN_GAP - 1);
  assert.notEqual(getScenePhase(trampState, 'tramp'), 'pending', 'tramp blocked inside the gap');
  updateTrampoline(trampState, 1, services, endedAt + SCENE_MIN_GAP);
  assert.equal(getScenePhase(trampState, 'tramp'), 'pending', 'tramp arms after the gap');
});

test('a chase escape completing stamps lastSceneEndAt', () => {
  const state = createState(() => 0.5);
  setScenePhase(state, 'chase', 'exiting');
  state.scene.squirrelX = W + 100;  // already past the exit threshold
  updateChase(state, 1, 12345);
  assert.notEqual(getScenePhase(state, 'chase'), 'exiting');
  assert.equal(state.lastSceneEndAt, 12345);
});

// --- Boss state machine ---

test('boss queues at each BOSS_MILESTONE and waits out a pending chase', () => {
  const state = createState(() => 0.5);
  state.score = BOSS_MILESTONE + 5;
  setScenePhase(state, 'chase', 'pending');
  updateBoss(state, 1, createTestServices());
  assert.notEqual(getScenePhase(state, 'boss'), 'pending', 'chasePending blocks boss start');

  setScenePhase(state, 'chase', 'idle');
  updateBoss(state, 1, createTestServices());
  assert.equal(getScenePhase(state, 'boss'), 'pending');
  assert.equal(state.sceneMemory.boss.lastMilestone, 1);
});

// --- Scene queue fairness ---

test('a scene that requested first gets the next turn, regardless of update order', () => {
  // Regression: chase's short score cooldown used to let it win every tie
  // against the trampoline scene (update() runs chase first), starving the
  // trampoline for entire runs. The queue grants turns in request order.
  const services = createTestServices();
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.score = TRAMP_FIRST_AT + 10;
  setScenePhase(state, 'chase', 'active');  // tramp requests its turn mid-chase
  updateTrampoline(state, 1, services, 0);
  assert.deepEqual(state.sceneQueue, ['tramp']);
  assert.notEqual(getScenePhase(state, 'tramp'), 'pending', 'blocked while the chase runs');

  // Chase ends; on the next checks both scenes want a turn (chase cooldown
  // long elapsed), but chase runs first in update() — it must still yield.
  setScenePhase(state, 'chase', 'idle');
  sceneMemory(state, 'chase').lastEndScore = 1;  // makes chase instantly re-eligible
  updateChase(state, 1, 0);
  assert.notEqual(getScenePhase(state, 'chase'), 'pending', 'chase waits behind the queued tramp');
  assert.deepEqual(state.sceneQueue, ['tramp', 'chase']);
  updateTrampoline(state, 1, services, 0);
  assert.equal(getScenePhase(state, 'tramp'), 'pending', 'tramp takes its queued turn');
  assert.deepEqual(state.sceneQueue, ['chase'], 'chase is next in line');
});

test('a queued scene holds only one turn even if its condition re-fires', () => {
  const services = createTestServices();
  const state = createState(() => 0.5);
  state.gameState = 'running';
  setScenePhase(state, 'chase', 'active');  // block starts so requests pile up
  state.score = BOSS_MILESTONE + 5;
  updateBoss(state, 1, services, 0);
  state.score = BOSS_MILESTONE * 2 + 5;  // second milestone while still queued
  updateBoss(state, 1, services, 0);
  assert.deepEqual(state.sceneQueue, ['boss'], 'no duplicate boss entry');
  assert.equal(state.sceneMemory.boss.lastMilestone, 2);
});

test('boss waits for clear field, chases, then squirrel retreats', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  setScenePhase(state, 'boss', 'pending');
  state.obstacles = [];
  const services = createTestServices();

  updateBoss(state, 1, services);
  assert.equal(getScenePhase(state, 'boss'), 'active');
  assert.equal(state.scene.squirrelX, BOSS_SQUIRREL_START_X);

  // Dog stays airborne (jumping) so the grounded-squirrel hitbox never
  // catches it; run the full encounter
  state.dog.jumping = true;
  state.dog.y = 100;
  for (let i = 0; i < 5000 && getScenePhase(state, 'boss') === 'active'; i++) updateBoss(state, 1, services);
  assert.notEqual(getScenePhase(state, 'boss'), 'active');
  assert.equal(getScenePhase(state, 'boss'), 'exiting');
  assert.equal(state.gameState, 'running', 'dog survived');

  state.dog.jumping = false;
  state.dog.y = 200;
  for (let i = 0; i < 5000 && getScenePhase(state, 'boss') === 'exiting'; i++) updateBoss(state, 1, services);
  assert.notEqual(getScenePhase(state, 'boss'), 'exiting');
});

test('boss squirrel trails the dog without catching it (peak stays behind hitbox)', () => {
  // By design: at peak the squirrel spans dog.x-70..dog.x-40, short of the dog
  // hitbox at dog.x+23. The boss challenge is the reduced reaction distance,
  // not the squirrel itself. Pin that down so tuning changes don't break it.
  const state = createState(() => 0.5);
  state.gameState = 'running';
  setScenePhase(state, 'boss', 'pending');
  state.obstacles = [];
  const services = createTestServices();
  updateBoss(state, 1, services); // start chase
  for (let i = 0; i < 5000 && getScenePhase(state, 'boss') === 'active'; i++) {
    updateBoss(state, 1, services);
    assert.ok(state.scene.squirrelX + 30 <= state.dog.x + 23, 'squirrel stays behind the dog hitbox');
  }
  assert.equal(state.gameState, 'running', 'grounded running dog survives the boss squirrel');
});

// --- Death handling ---

test('killDog ends the run, then hands it to the leaderboard', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.score = 999;
  let recordedState = null;
  let gameStateWhenRecorded = null;
  killDog(state, createTestServices({
    recordRun: s => { recordedState = s; gameStateWhenRecorded = s.gameState; },
  }));
  assert.equal(state.gameState, 'dead');
  assert.equal(recordedState, state);
  assert.equal(gameStateWhenRecorded, 'dead');
});

test('killDog clears all encounter modes', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.highScores = [500, 400, 300, 200, 100].map(s => ({ name: 'X', score: s }));
  state.score = 1;
  setScenePhase(state, 'chase', 'active');
  setScenePhase(state, 'boss', 'active');
  setGiantPhase(state, 'active');
  killDog(state, createTestServices());
  assert.equal(getScenePhase(state, 'chase'), 'idle');
  assert.equal(getScenePhase(state, 'boss'), 'idle');
  assert.equal(getGiantPhase(state), 'off');
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
  state.deathTime = 5000;
  jump(state, services, 5999);
  assert.equal(state.gameState, 'dead', 'too soon to restart');
  jump(state, services, 6000);
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

test('duck held through a jump ducks on the landing frame', () => {
  const state = createState(() => 0.5);
  const played = [];
  const services = createTestServices({ sfx: { ...createTestServices().sfx, playDuck: () => played.push('duck') } });
  state.gameState = 'running';
  state.nextObstacleIn = 1e9;
  jump(state, services, 0);
  duck(state, true, services);  // pressed mid-air, in anticipation
  let now = 0, frames = 0;
  while (state.dog.jumping) {
    assert.equal(state.dog.ducking, false, 'no duck while airborne');
    update(state, 8, services, () => 0.5, now += 8);
    if (++frames > 1000) assert.fail('never landed');
  }
  assert.equal(state.dog.ducking, true, 'ducking on the landing frame');
  assert.deepEqual(played, ['duck'], 'duck sound once, on touchdown');

  duck(state, false, services);
  assert.equal(state.dog.ducking, false, 'release stands up');
});

test('a held duck clears a duck-height obstacle met on the landing frame', () => {
  const landOnAcorn = holdDuck => {
    const state = createState(() => 0.5);
    const services = createTestServices();
    state.gameState = 'running';
    state.nextObstacleIn = 1e9;
    state.hearts = 1;
    Object.assign(state.dog, { jumping: true, y: GROUND_Y - 1, vy: 2 });  // lands this frame
    duck(state, holdDuck, services);
    state.obstacles = [makeObstacle('frisbee', state.dog.x + 30, { skin: 'chase' })];  // acorn at duck height
    update(state, 8, services, () => 0.5, 8);
    return state.gameState;
  };
  assert.equal(landOnAcorn(false), 'dead', 'standing up, the acorn hits');
  assert.equal(landOnAcorn(true), 'running', 'the held duck counts before collision');
});

test('phase accessors round-trip and keep each lifecycle to a single phase', () => {
  const state = createState(() => 0.5);
  const phases = {
    chase: ['pending', 'entering', 'active', 'exiting'],
    boss: ['pending', 'active', 'exiting'],
    tramp: ['pending', 'active'],
  };
  for (const [id, list] of Object.entries(phases)) {
    assert.equal(getScenePhase(state, id), 'idle');
    for (const phase of list) {
      setScenePhase(state, id, phase);
      assert.equal(getScenePhase(state, id), phase);
    }
    setScenePhase(state, id, 'idle');
    assert.equal(getScenePhase(state, id), 'idle');
  }
  for (const phase of ['growing', 'active', 'shrinking', 'off']) {
    setGiantPhase(state, phase);
    assert.equal(getGiantPhase(state), phase);
  }
});

// --- Scene registry ---

test('every scene definition is complete and its quiet phases exist', () => {
  for (const def of SCENES) {
    for (const key of ['id', 'initialData', 'wantsTurn', 'start', 'phases', 'quietPhases']) {
      assert.ok(def[key] !== undefined, `${def.id}.${key}`);
    }
    def.quietPhases.forEach(p => assert.equal(typeof def.phases[p], 'function', `${def.id} quiet phase ${p}`));
    const state = createState(() => 0.5);
    setScenePhase(state, def.id, 'pending');
    def.start(state, state.scene);
    assert.equal(typeof def.phases[state.scene.phase], 'function', `${def.id} starts in a real phase`);
  }
});

test('normal spawning pauses only while pending or in a quiet phase', () => {
  const state = createState(() => 0.5);
  assert.equal(scenesBlockSpawning(state), false);
  const expectations = {
    chase: { pending: true, entering: true, active: false, exiting: false },
    boss: { pending: true, active: false, exiting: true },
    tramp: { pending: true, active: true },
  };
  for (const [id, phases] of Object.entries(expectations)) {
    for (const [phase, blocks] of Object.entries(phases)) {
      setScenePhase(state, id, phase);
      assert.equal(scenesBlockSpawning(state), blocks, `${id} ${phase}`);
    }
    setScenePhase(state, id, 'idle');
  }
});

test('forceScene starts a scene on a cleared field but never on top of another', () => {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.obstacles = [{ x: 300, y: 0, width: 10, height: 10, type: 'hotdog' }];
  state.sceneQueue = ['boss', 'tramp'];
  forceScene(state, 'boss');
  assert.equal(getScenePhase(state, 'boss'), 'pending');
  assert.deepEqual(state.obstacles, []);
  assert.deepEqual(state.sceneQueue, ['tramp'], 'its queued turn is used up');

  forceScene(state, 'chase');
  assert.equal(getScenePhase(state, 'chase'), 'idle', 'no overlap with the running boss');
  assert.equal(getScenePhase(state, 'boss'), 'pending');
});
