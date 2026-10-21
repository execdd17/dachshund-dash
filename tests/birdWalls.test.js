// Bird walls against the real jump physics: what each formation looks like it
// asks of the player is what it actually takes.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createState } from '../js/core/state.js';
import { update } from '../js/systems/update.js';
import { jump, duck } from '../js/systems/control.js';
import { birdStack, birdTriangle } from '../js/systems/birdWalls.js';
import { DT_BASELINE, INITIAL_SPEED, SPEED_INCREMENT, MAX_SPEED } from '../js/config.js';
import { createTestServices } from './helpers.js';

const SPEEDS = [3.1, 4, 5, MAX_SPEED];  // walls start at BIRD_WALL_FIRST_AT, speed ~3.1

// Runs the dog at `speed` into `wall`, with a jump at frame `jumpAt` and a
// second `doubleAfter` frames later (each optional), or duck held throughout.
// True if it gets past without a hit.
function passes(wall, speed, { jumpAt = null, doubleAfter = null, ducking = false } = {}) {
  const state = createState(() => 0.5);
  const services = createTestServices();
  state.gameState = 'running';
  state.score = (speed - INITIAL_SPEED) / SPEED_INCREMENT;
  state.nextObstacleIn = Infinity;
  state.obstacles = wall(500);
  const hearts = state.hearts;
  if (ducking) duck(state, true, services);
  for (let f = 0, now = 0; state.obstacles.length; f++) {
    if (f === jumpAt) jump(state, services, now);
    if (doubleAfter !== null && f === jumpAt + doubleAfter) jump(state, services, now);
    update(state, DT_BASELINE, services, () => 0.5, now += DT_BASELINE);
    if (state.hearts < hearts) return false;
  }
  return true;
}

// For each jump frame, the number of second-press frames that clear the wall.
function doubleJumpWindows(wall, speed) {
  const windows = [];
  for (let jumpAt = 0; jumpAt < 220; jumpAt += 2) {
    let window = 0;
    for (let doubleAfter = 1; doubleAfter < 70; doubleAfter++) if (passes(wall, speed, { jumpAt, doubleAfter })) window++;
    windows.push(window);
  }
  return windows;
}

test('ducking passes under both walls at every speed', () => {
  for (const speed of SPEEDS) {
    assert.ok(passes(birdStack, speed, { ducking: true }), `stack at ${speed}`);
    assert.ok(passes(birdTriangle, speed, { ducking: true }), `triangle at ${speed}`);
  }
});

test('the bird stack can only be ducked: no jump or double jump gets over or through it', () => {
  for (const speed of SPEEDS) {
    for (let jumpAt = 0; jumpAt < 220; jumpAt += 2) {
      assert.equal(passes(birdStack, speed, { jumpAt }), false, `single jump at ${jumpAt}, speed ${speed}`);
    }
    assert.equal(Math.max(...doubleJumpWindows(birdStack, speed)), 0, `double jump at speed ${speed}`);
  }
});

test('the bird triangle can be double-jumped at every speed, with a skilled but fair window', () => {
  for (const speed of SPEEDS) {
    const best = Math.max(...doubleJumpWindows(birdTriangle, speed));
    assert.ok(best >= 12, `speed ${speed}: best second-press window ${best} frames (~${Math.round(best * DT_BASELINE)}ms)`);
  }
});
