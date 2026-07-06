import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeScoreChecksum } from '../js/leaderboard/checksum.js';
import {
  loadHighScores, saveHighScores, normalizeName, insertScore, qualifiesLocally,
} from '../js/leaderboard/local.js';
import {
  createGlobalScores, getFilteredScores, getScoresForDifficulty,
  getGlobalPlacement, formatOrdinal,
} from '../js/leaderboard/global.js';
import { HIGH_SCORES_KEY, MAX_HIGH_SCORES, GLOBAL_MAX_SCORES } from '../js/config.js';
import { createFakeStorage } from './helpers.js';

// Minimal Firestore stand-in: one `scores` collection whose docs are the
// provided plain objects; add() appends and records the payload.
function createFakeDb(initialDocs = []) {
  const docs = [...initialDocs];
  const added = [];
  const query = {
    orderBy: () => query,
    limit: () => query,
    get: async () => ({ docs: docs.map(d => ({ data: () => d })) }),
  };
  return {
    added,
    collection: () => ({
      ...query,
      add: async (doc) => { added.push(doc); docs.push(doc); },
    }),
  };
}

test('checksum is deterministic and input-sensitive', () => {
  const a = computeScoreChecksum('REX', 1000, 1700000000000);
  assert.equal(a, computeScoreChecksum('REX', 1000, 1700000000000));
  assert.notEqual(a, computeScoreChecksum('REX', 1001, 1700000000000));
  assert.notEqual(a, computeScoreChecksum('MAX', 1000, 1700000000000));
  assert.notEqual(a, computeScoreChecksum('REX', 1000, 1700000000001));
  assert.notEqual(a, computeScoreChecksum('REX', 1000, 1700000000000, 'HARD'));
  assert.notEqual(
    computeScoreChecksum('REX', 1000, 1700000000000, 'HARD'),
    computeScoreChecksum('REX', 1000, 1700000000000, 'EASY'),
  );
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

test('getScoresForDifficulty slices one difficulty and caps the board', () => {
  const scores = [
    { name: 'A', score: 300, difficulty: 'NORMAL' },
    { name: 'B', score: 250, difficulty: 'HARD' },
    { name: 'C', score: 200, difficulty: 'NORMAL' },
  ];
  assert.deepEqual(getScoresForDifficulty(scores, 'NORMAL').map(e => e.name), ['A', 'C']);
  assert.deepEqual(getScoresForDifficulty(scores, 'HARD').map(e => e.name), ['B']);
  assert.deepEqual(getScoresForDifficulty(scores, 'VERY HARD'), []);

  const many = Array.from({ length: GLOBAL_MAX_SCORES + 5 },
    (_, i) => ({ name: 'P' + i, score: 1000 - i, difficulty: 'EASY' }));
  assert.equal(getScoresForDifficulty(many, 'EASY').length, GLOBAL_MAX_SCORES);
});

test('getGlobalPlacement ranks per difficulty, ties below existing entries', () => {
  const scores = [
    { name: 'A', score: 300, difficulty: 'NORMAL' },
    { name: 'B', score: 250, difficulty: 'HARD' },
    { name: 'C', score: 200, difficulty: 'NORMAL' },
  ];
  assert.equal(getGlobalPlacement(scores, 'NORMAL', 400), 1);
  assert.equal(getGlobalPlacement(scores, 'NORMAL', 250), 2);   // between A and C
  assert.equal(getGlobalPlacement(scores, 'NORMAL', 200), 3);   // tie ranks below C
  assert.equal(getGlobalPlacement(scores, 'NORMAL', 10), 3);
  assert.equal(getGlobalPlacement(scores, 'HARD', 10), 2);      // other boards don't count
  assert.equal(getGlobalPlacement(scores, 'VERY HARD', 1), 1);  // empty board

  // A full board: only scores that make the cut place.
  const full = Array.from({ length: GLOBAL_MAX_SCORES },
    (_, i) => ({ name: 'P' + i, score: 5000 - i, difficulty: 'EASY' }));
  assert.equal(getGlobalPlacement(full, 'EASY', 1), null);
  assert.equal(getGlobalPlacement(full, 'EASY', 6000), 1);
});

test('formatOrdinal handles st/nd/rd/th including the teens', () => {
  assert.equal(formatOrdinal(1), '1st');
  assert.equal(formatOrdinal(2), '2nd');
  assert.equal(formatOrdinal(3), '3rd');
  assert.equal(formatOrdinal(4), '4th');
  assert.equal(formatOrdinal(11), '11th');
  assert.equal(formatOrdinal(12), '12th');
  assert.equal(formatOrdinal(13), '13th');
  assert.equal(formatOrdinal(21), '21st');
  assert.equal(formatOrdinal(22), '22nd');
  assert.equal(formatOrdinal(23), '23rd');
  assert.equal(formatOrdinal(100), '100th');
});

test('placement on the store is null until loaded, then ranks the score', async () => {
  const db = createFakeDb([
    { name: 'A', score: 300, timestamp: 1, difficulty: 'NORMAL' },
    { name: 'C', score: 200, timestamp: 2, difficulty: 'NORMAL' },
  ]);
  const store = createGlobalScores({ db, ready: true });
  assert.equal(store.placement(250, 'NORMAL'), null);  // not fetched yet
  await store.fetch();
  assert.equal(store.placement(250, 'NORMAL'), 2);
  assert.equal(store.placement(50, 'NORMAL'), 3);
});

test('fetch keeps only scores that carry a difficulty (legacy docs hidden)', async () => {
  const db = createFakeDb([
    { name: 'OLD', score: 900, timestamp: 1 },              // pre-difficulty legacy doc
    { name: 'NEW', score: 100, timestamp: 2, difficulty: 'NORMAL' },
  ]);
  const store = createGlobalScores({ db, ready: true });
  await store.fetch();
  assert.equal(store.loaded, true);
  assert.deepEqual(store.scores, [{ name: 'NEW', score: 100, difficulty: 'NORMAL' }]);
});

test('submit records the difficulty and a matching checksum', async () => {
  const db = createFakeDb();
  const store = createGlobalScores({ db, ready: true });
  await store.submit('REX', 1234, 'VERY HARD');
  assert.equal(db.added.length, 1);
  const doc = db.added[0];
  assert.equal(doc.name, 'REX');
  assert.equal(doc.score, 1234);
  assert.equal(doc.difficulty, 'VERY HARD');
  assert.equal(doc.checksum,
    computeScoreChecksum('REX', 1234, doc.timestamp, 'VERY HARD'));
});

test('qualifies is judged against the board for that difficulty only', async () => {
  // A full HARD board, an empty NORMAL board.
  const hardBoard = Array.from({ length: GLOBAL_MAX_SCORES },
    (_, i) => ({ name: 'H' + i, score: 5000 - i, timestamp: i, difficulty: 'HARD' }));
  const store = createGlobalScores({ db: createFakeDb(hardBoard), ready: true });
  await store.fetch();
  assert.equal(store.qualifies(10, 'NORMAL'), true);   // empty board: anything qualifies
  assert.equal(store.qualifies(10, 'HARD'), false);    // full board, below the cutoff
  assert.equal(store.qualifies(6000, 'HARD'), true);   // beats the board
});
