import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lerpColor } from '../js/core/color.js';
import { getDogSpriteAnim } from '../js/assets/sprites.js';
import { getTimeOfDay } from '../js/core/timeOfDay.js';
import { createState, createRunState, resetRun } from '../js/core/state.js';
import { difficultyAt, isDifficultyLabel, DEFAULT_DIFFICULTY } from '../js/core/difficulty.js';
import { getScenePhase, setScenePhase } from '../js/systems/scenes.js';
import { getGiantPhase, setGiantPhase } from '../js/systems/encounters.js';
import {
  INITIAL_SPEED, GROUND_Y, DOG_BASE_X,
  DIFFICULTY_LEVELS, DEFAULT_DIFFICULTY_INDEX,
} from '../js/config.js';

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
  setScenePhase(s, 'chase', 'active');
  setScenePhase(s, 'boss', 'active');
  setGiantPhase(s, 'active');
  s.weatherRain = true;
  s.lastTimeStage = 'night';
  s.hearts = 1;
  s.invulnUntil = 9999;
  s.heartLostAt = 5555;
  s.heartGainedAt = 6666;

  resetRun(s);

  assert.equal(s.score, 0);
  assert.equal(s.speed, INITIAL_SPEED);
  assert.deepEqual(s.obstacles, []);
  assert.equal(s.dog.x, DOG_BASE_X);
  assert.equal(s.dog.y, GROUND_Y);
  assert.equal(s.dog.jumping, false);
  assert.notEqual(getScenePhase(s, 'chase'), 'active');
  assert.notEqual(getScenePhase(s, 'boss'), 'active');
  assert.equal(getGiantPhase(s), 'off');
  assert.equal(s.weatherRain, false);
  assert.equal(s.lastTimeStage, 'day');
  assert.equal(s.hearts, DIFFICULTY_LEVELS[DEFAULT_DIFFICULTY_INDEX].hearts);
  assert.equal(s.invulnUntil, 0);
  assert.equal(s.heartLostAt, 0);
  assert.equal(s.heartGainedAt, 0);
});

test('resetRun refills hearts from the session difficulty', () => {
  const s = createState(() => 0.5);
  s.startingHearts = 3;  // NORMAL, picked on the start overlay
  s.hearts = 1;
  resetRun(s);
  assert.equal(s.hearts, 3);
});

test('difficulty levels map to the expected starting hearts', () => {
  assert.deepEqual(DIFFICULTY_LEVELS.map(l => l.hearts), [6, 4, 3, 2, 1]);
  assert.equal(DIFFICULTY_LEVELS[DEFAULT_DIFFICULTY_INDEX].label, 'VERY EASY');
});

test('dog sprite anim per game state: setup and idle stand still, running runs', () => {
  const s = createState(() => 0.5);
  s.gameState = 'setup';
  assert.equal(getDogSpriteAnim(s, 0), 'idle', 'dog must not run behind the start overlay');
  s.gameState = 'idle';
  assert.equal(getDogSpriteAnim(s, 0), 'idle');
  s.gameState = 'running';
  assert.equal(getDogSpriteAnim(s, 0), 'run');
  s.gameState = 'dead';
  assert.equal(getDogSpriteAnim(s, 0), 'dead');
});

test('difficultyAt falls back to the default level; isDifficultyLabel matches labels only', () => {
  assert.equal(difficultyAt(0).label, 'VERY EASY');
  assert.equal(difficultyAt(99), DEFAULT_DIFFICULTY);
  assert.equal(difficultyAt(Number('x')), DEFAULT_DIFFICULTY);
  assert.equal(isDifficultyLabel('HARD'), true);
  assert.equal(isDifficultyLabel('hard'), false);
});

test('resetRun restores exactly the createRunState defaults and keeps the session', () => {
  const s = createState(() => 0.5);
  s.startingHearts = 5;
  s.playerName = 'ALEX';
  s.highScores = [{ name: 'ALEX', score: 10 }];
  for (const key of Object.keys(createRunState())) s[key] = 'dirty';
  resetRun(s);
  assert.deepEqual(
    Object.fromEntries(Object.keys(createRunState()).map(k => [k, s[k]])),
    createRunState(5),
  );
  assert.equal(s.playerName, 'ALEX');
  assert.deepEqual(s.highScores, [{ name: 'ALEX', score: 10 }]);
});
