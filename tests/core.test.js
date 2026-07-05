import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lerpColor } from '../js/core/color.js';
import { getTimeOfDay } from '../js/core/timeOfDay.js';
import { createState, resetRun } from '../js/core/state.js';
import { INITIAL_SPEED, GROUND_Y, DOG_BASE_X, STARTING_HEARTS } from '../js/config.js';

test('lerpColor returns endpoints at t=0 and t=1', () => {
  assert.equal(lerpColor('#000000', '#ffffff', 0), '#000000');
  assert.equal(lerpColor('#000000', '#ffffff', 1), '#ffffff');
});

test('lerpColor interpolates midpoint', () => {
  assert.equal(lerpColor('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(lerpColor('#ff0000', '#00ff00', 0.5), '#808000');
});

test('getTimeOfDay stages across one cycle', () => {
  assert.equal(getTimeOfDay(0).stage, 'day');
  assert.equal(getTimeOfDay(249).stage, 'day');
  assert.equal(getTimeOfDay(250).stage, 'sunset');
  assert.equal(getTimeOfDay(349).stage, 'sunset');
  assert.equal(getTimeOfDay(350).stage, 'night');
  assert.equal(getTimeOfDay(599).stage, 'night');
  assert.equal(getTimeOfDay(600).stage, 'dawn');
  assert.equal(getTimeOfDay(699).stage, 'dawn');
});

test('getTimeOfDay wraps every 700 points', () => {
  assert.deepEqual(getTimeOfDay(700), getTimeOfDay(0));
  assert.deepEqual(getTimeOfDay(1050), getTimeOfDay(350));
});

test('getTimeOfDay phase is 0 during day, 0.5 during night, reaches 1 at end of dawn', () => {
  assert.equal(getTimeOfDay(100).phase, 0);
  assert.equal(getTimeOfDay(400).phase, 0.5);
  assert.ok(getTimeOfDay(699).phase > 0.99);
});

test('createState starts idle with defaults', () => {
  const s = createState(() => 0.5);
  assert.equal(s.gameState, 'idle');
  assert.equal(s.score, 0);
  assert.equal(s.speed, INITIAL_SPEED);
  assert.equal(s.dog.y, GROUND_Y);
  assert.equal(s.flowers.length, 12);
  assert.equal(s.clouds.length, 5);
});

test('resetRun restores a dirty state to run defaults', () => {
  const s = createState(() => 0.5);
  s.score = 1234;
  s.speed = 15;
  s.obstacles.push({ x: 1, y: 2, width: 3, height: 4, type: 'hotdog' });
  s.dog.x = 210;
  s.dog.y = 50;
  s.dog.jumping = true;
  s.chaseActive = true;
  s.bossChasing = true;
  s.giantActive = true;
  s.giantScoreMultiplier = 2;
  s.weatherRain = true;
  s.lastTimeStage = 'night';
  s.hearts = 1;
  s.invulnUntil = 9999;
  s.heartLostAt = 5555;

  resetRun(s);

  assert.equal(s.score, 0);
  assert.equal(s.speed, INITIAL_SPEED);
  assert.deepEqual(s.obstacles, []);
  assert.equal(s.dog.x, DOG_BASE_X);
  assert.equal(s.dog.y, GROUND_Y);
  assert.equal(s.dog.jumping, false);
  assert.equal(s.chaseActive, false);
  assert.equal(s.bossChasing, false);
  assert.equal(s.giantActive, false);
  assert.equal(s.giantScoreMultiplier, 1);
  assert.equal(s.weatherRain, false);
  assert.equal(s.lastTimeStage, 'day');
  assert.equal(s.hearts, STARTING_HEARTS);
  assert.equal(s.invulnUntil, 0);
  assert.equal(s.heartLostAt, 0);
});
