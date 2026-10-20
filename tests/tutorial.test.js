import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState, resetRun } from '../js/core/state.js';
import { update } from '../js/systems/update.js';
import { jump, duck } from '../js/systems/control.js';
import { checkCollision } from '../js/systems/collision.js';
import { makeObstacle } from '../js/systems/obstacleTypes.js';
import { isTutorialDue, markTutorialSeen } from '../js/systems/tutorial.js';
import { DT_BASELINE, TUTORIAL_VERSION, TUTORIAL_REFRESH_MS, TUTORIAL_SLOW_SCALE, TUTORIAL_RETRY_MS } from '../js/config.js';
import { createFakeStorage, createTestServices } from './helpers.js';

function startRun({ tutorial = true } = {}) {
  const state = createState(() => 0.5);
  state.tutorialPending = tutorial;
  let seen = 0;
  const services = createTestServices({ tutorialSeen: () => seen++ });
  jump(state, services, 0);  // as a player starts a run: the dog jumps too
  return { state, services, seenCount: () => seen };
}

// Plays the tutorial with a bot that acts `reactFrames` after each prompt
// appears (never, if Infinity). With `early`, it also jumps once just before
// step 0's prompt, too soon to clear the bar. Returns what it saw.
function playTutorial({ reactFrames = 0, early = false, maxFrames = 30000 } = {}) {
  const run = startRun();
  const { state, services } = run;
  let now = 0, waited = 0, lastPrompt = null, jumpedEarly = !early;
  const seen = { retries: 0, firstPromptRetries: null, minHearts: state.hearts, maxScore: 0 };
  for (let f = 0; f < maxFrames; f++) {
    const scene = state.scene?.id === 'tutorial' ? state.scene : null;
    if (!scene && f > 0 && !state.tutorialPending) return { ...run, seen, done: true };
    if (scene) {
      if (scene.phase === 'retry' && scene.until === now + TUTORIAL_RETRY_MS) seen.retries++;
      if (scene.prompt && seen.firstPromptRetries === null) seen.firstPromptRetries = seen.retries;
      const target = scene.targets[0];
      if (!jumpedEarly && scene.phase === 'teach' && !state.dog.jumping && target.x < state.dog.x + 150) {  // gap ~90
        jumpedEarly = true;
        jump(state, services, now);
      }
      if (scene.prompt !== lastPrompt) { waited = 0; lastPrompt = scene.prompt; }
      if (scene.prompt && waited++ >= reactFrames) {
        if (scene.prompt === 'duck') duck(state, true, services); else jump(state, services, now);
      }
      if (scene.phase === 'praise' && state.duckHeld) duck(state, false, services);
    }
    update(state, DT_BASELINE, services, () => 0.5, now += DT_BASELINE);
    seen.minHearts = Math.min(seen.minHearts, state.hearts);
    seen.maxScore = Math.max(seen.maxScore, state.score);
  }
  return { ...run, seen, done: false };
}

test('a player who acts on each prompt finishes without a miss', () => {
  for (const reactFrames of [0, 30, 60]) {  // up to half a second
    const { state, seen, done, seenCount } = playTutorial({ reactFrames });
    assert.ok(done, `finished (react after ${reactFrames} frames)`);
    assert.equal(seen.firstPromptRetries, 0, 'the very first step prompts, though the run started with a jump');
    assert.equal(seen.retries, 0, 'no step missed');
    assert.ok(seen.maxScore < 1, 'score held at zero');
    assert.equal(state.score, 0, 'the real run starts from zero');
    assert.equal(seenCount(), 1, 'recorded as seen once');
    assert.equal(state.tutorialPending, false);
    assert.equal(state.scene, null);
  }
});

test('too early or too late misses, costs no heart, and repeats', () => {
  const early = playTutorial({ early: true });
  assert.ok(early.done, 'still finishes after the miss');
  assert.equal(early.seen.retries, 1, 'the early jump missed once');
  assert.equal(early.seen.minHearts, early.state.startingHearts, 'no heart spent');

  const never = playTutorial({ reactFrames: Infinity, maxFrames: 3000 });
  assert.equal(never.done, false);
  assert.ok(never.seen.retries >= 1, 'not acting misses');
  assert.equal(never.seen.minHearts, never.state.startingHearts, 'no heart spent');
});

test('time slows while a prompt waits, and runs normally once the player acts', () => {
  const { state, services } = startRun();
  let now = 0;
  const step = () => update(state, DT_BASELINE, services, () => 0.5, now += DT_BASELINE);
  const target = () => state.scene.targets[0];
  const moved = () => { const x0 = target().x; step(); return x0 - target().x; };
  while (!state.scene?.prompt) step();
  assert.ok(Math.abs(moved() - state.speed * TUTORIAL_SLOW_SCALE) < 1e-9, 'slowed');
  jump(state, services, now);
  step();
  assert.equal(state.scene.prompt, null, 'the jump answered the prompt');
  assert.ok(Math.abs(moved() - state.speed) < 1e-9, 'full speed again');
});

test('no tutorial unless pending', () => {
  const { state, services } = startRun({ tutorial: false });
  let now = 0;
  for (let f = 0; f < 600; f++) {
    update(state, DT_BASELINE, services, () => 0.5, now += DT_BASELINE);
    assert.notEqual(state.scene?.id, 'tutorial');
  }
  assert.ok(state.score > 0, 'scores normally');
});

test('practice obstacles never cost a heart', () => {
  const { state, services } = startRun({ tutorial: false });
  state.hearts = 1;
  const practice = makeObstacle('hotdog', state.dog.x + 30, { practice: true });
  state.obstacles = [practice];
  assert.equal(checkCollision(state, services, 1000), false, 'no death');
  assert.equal(state.hearts, 1);
  assert.equal(practice.hit, true);
  assert.equal(state.obstacles.length, 0, 'knocked away');
});

test('tutorial is due on a first visit, after the refresh period, or for a newer version', () => {
  const storage = createFakeStorage();
  assert.equal(isTutorialDue(storage, 1000), true, 'first visit');
  markTutorialSeen(storage, 1000);
  assert.equal(isTutorialDue(storage, 1000 + TUTORIAL_REFRESH_MS), false, 'within the refresh period');
  assert.equal(isTutorialDue(storage, 1001 + TUTORIAL_REFRESH_MS), true, 'refresh period passed');
  storage.setItem('dachshundDashTutorial', JSON.stringify({ version: TUTORIAL_VERSION - 1, seenAt: 1000 }));
  assert.equal(isTutorialDue(storage, 1000), true, 'older version');
  storage.setItem('dachshundDashTutorial', '{not json');
  assert.equal(isTutorialDue(storage, 1000), true, 'unreadable record');
});
