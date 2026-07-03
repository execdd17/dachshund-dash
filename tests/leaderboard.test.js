import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeScoreChecksum } from '../js/leaderboard/checksum.js';
import {
  loadHighScores, saveHighScores, normalizeName, insertScore, qualifiesLocally,
} from '../js/leaderboard/local.js';
import { getFilteredScores } from '../js/leaderboard/global.js';
import { HIGH_SCORES_KEY, MAX_HIGH_SCORES } from '../js/config.js';
import { createFakeStorage } from './helpers.js';

test('checksum is deterministic and input-sensitive', () => {
  const a = computeScoreChecksum('REX', 1000, 1700000000000);
  assert.equal(a, computeScoreChecksum('REX', 1000, 1700000000000));
  assert.notEqual(a, computeScoreChecksum('REX', 1001, 1700000000000));
  assert.notEqual(a, computeScoreChecksum('MAX', 1000, 1700000000000));
  assert.notEqual(a, computeScoreChecksum('REX', 1000, 1700000000001));
});

test('normalizeName trims, defaults, caps at 12 chars, uppercases', () => {
  assert.equal(normalizeName('  rex  '), 'REX');
  assert.equal(normalizeName(''), 'PLAYER');
  assert.equal(normalizeName(null), 'PLAYER');
  assert.equal(normalizeName('abcdefghijklmnop'), 'ABCDEFGHIJKL');
});

test('insertScore keeps list sorted desc and capped', () => {
  let scores = [];
  for (const v of [100, 300, 200, 50, 400, 250]) {
    scores = insertScore(scores, 'P' + v, v);
  }
  assert.equal(scores.length, MAX_HIGH_SCORES);
  assert.deepEqual(scores.map(e => e.score), [400, 300, 250, 200, 100]);
});

test('qualifiesLocally: always with room, else must beat the last entry', () => {
  assert.equal(qualifiesLocally([], 1), true);
  const full = [500, 400, 300, 200, 100].map(s => ({ name: 'X', score: s }));
  assert.equal(qualifiesLocally(full, 100), false);
  assert.equal(qualifiesLocally(full, 101), true);
});

test('loadHighScores round-trips through storage and rejects junk', () => {
  const storage = createFakeStorage();
  const scores = [{ name: 'REX', score: 42 }];
  saveHighScores(storage, scores);
  assert.deepEqual(loadHighScores(storage), scores);

  storage.setItem(HIGH_SCORES_KEY, 'not json');
  assert.deepEqual(loadHighScores(storage), []);

  storage.setItem(HIGH_SCORES_KEY, JSON.stringify({ nope: true }));
  assert.deepEqual(loadHighScores(storage), []);

  storage.setItem(HIGH_SCORES_KEY, JSON.stringify([
    { name: 'OK', score: 1 }, { name: 5, score: 'x' }, null,
  ]));
  assert.deepEqual(loadHighScores(storage), [{ name: 'OK', score: 1 }]);
});

test('getFilteredScores ranks then filters by name substring', () => {
  const scores = [
    { name: 'ALPHA', score: 300 },
    { name: 'BETA', score: 200 },
    { name: 'ALBERT', score: 100 },
  ];
  const all = getFilteredScores(scores, '');
  assert.deepEqual(all.map(e => e.rank), [1, 2, 3]);

  const filtered = getFilteredScores(scores, 'al');
  assert.deepEqual(filtered.map(e => e.name), ['ALPHA', 'ALBERT']);
  // Ranks stay global, not renumbered after filtering
  assert.deepEqual(filtered.map(e => e.rank), [1, 3]);
});
