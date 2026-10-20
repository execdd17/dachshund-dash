import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeScoreChecksum } from '../js/leaderboard/checksum.js';
import {
  loadHighScores, saveHighScores, normalizeName, insertScore, qualifiesLocally,
} from '../js/leaderboard/local.js';
import {
  createGlobalScores, getFilteredScores, getGlobalPlacement, formatOrdinal,
} from '../js/leaderboard/global.js';
import { createScoreRecorder } from '../js/leaderboard/recorder.js';
import { createState } from '../js/core/state.js';
import {
  HIGH_SCORES_KEY, MAX_HIGH_SCORES, GLOBAL_MAX_SCORES,
} from '../js/config.js';
import { createFakeStorage } from './helpers.js';

function compareField(a, b, field, dir) {
  const av = a[field], bv = b[field];
  if (av === bv) return 0;
  if (dir === 'desc') return bv > av ? 1 : -1;
  return av > bv ? 1 : -1;
}

function sortDocs(docs, orderBys) {
  return [...docs].sort((a, b) => {
    for (const { field, dir } of orderBys) {
      const cmp = compareField(a, b, field, dir);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
}

// Firestore stand-in with where/orderBy/limit/startAfter/count support.
function createFakeDb(initialDocs = []) {
  const docs = [...initialDocs];
  const added = [];

  function buildQuery(collectionName, state) {
    if (collectionName !== 'scores') throw new Error('unknown collection');
    const query = {
      _state: state,
      where(field, op, value) {
        return buildQuery(collectionName, {
          ...state,
          wheres: [...state.wheres, [field, op, value]],
        });
      },
      orderBy(field, dir = 'asc') {
        return buildQuery(collectionName, {
          ...state,
          orderBys: [...state.orderBys, { field, dir }],
        });
      },
      limit(n) {
        return buildQuery(collectionName, { ...state, limit: n });
      },
      startAfter(cursor) {
        return buildQuery(collectionName, { ...state, startAfter: cursor });
      },
      count() {
        return {
          get: async () => {
            const filtered = filterDocs(state);
            return { data: () => ({ count: filtered.length }) };
          },
        };
      },
      get: async () => {
        let filtered = filterDocs(state);
        if (state.startAfter) {
          const idx = filtered.findIndex(d => d === state.startAfter.data());
          filtered = idx >= 0 ? filtered.slice(idx + 1) : filtered;
        }
        if (state.limit != null) filtered = filtered.slice(0, state.limit);
        return {
          docs: filtered.map(d => ({
            data: () => d,
          })),
        };
      },
    };
    return query;
  }

  function filterDocs(state) {
    let result = docs.filter(d => typeof d.difficulty === 'string');
    for (const [field, op, value] of state.wheres) {
      result = result.filter(d => {
        if (op === '==') return d[field] === value;
        if (op === '>') return d[field] > value;
        return true;
      });
    }
    if (state.orderBys.length > 0) {
      result = sortDocs(result, state.orderBys);
    }
    return result;
  }

  return {
    added,
    collection: (name) => ({
      ...buildQuery(name, { wheres: [], orderBys: [], limit: null, startAfter: null }),
      add: async (doc) => { added.push(doc); docs.push(doc); },
      where(field, op, value) {
        return buildQuery(name, { wheres: [[field, op, value]], orderBys: [], limit: null, startAfter: null });
      },
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
  assert.deepEqual(filtered.map(e => e.rank), [1, 3]);
});

test('getGlobalPlacement ranks on one board, ties below existing entries', () => {
  const board = [{ name: 'A', score: 300 }, { name: 'C', score: 200 }];
  assert.equal(getGlobalPlacement(board, 400), 1);
  assert.equal(getGlobalPlacement(board, 250), 2);
  assert.equal(getGlobalPlacement(board, 200), 3);
  assert.equal(getGlobalPlacement(board, 10), 3);
  assert.equal(getGlobalPlacement([], 1), 1);

  const full = Array.from({ length: GLOBAL_MAX_SCORES }, (_, i) => ({ name: 'P' + i, score: 5000 - i }));
  assert.equal(getGlobalPlacement(full, 1), null);
  assert.equal(getGlobalPlacement(full, 6000), 1);
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

test('setSessionDifficulty loads one difficulty board for qualify and placement', async () => {
  const db = createFakeDb([
    { name: 'A', score: 300, timestamp: 1, difficulty: 'NORMAL' },
    { name: 'C', score: 200, timestamp: 2, difficulty: 'NORMAL' },
  ]);
  const store = createGlobalScores({ db, ready: true });
  assert.equal(store.placement(250, 'NORMAL'), null);
  await store.setSessionDifficulty('NORMAL');
  assert.equal(store.loaded, true);
  assert.equal(store.placement(250, 'NORMAL'), 2);
  assert.equal(store.placement(50, 'NORMAL'), 3);
  assert.equal(store.qualifies(10, 'HARD'), false);
});

test('fetch keeps only scores that carry a difficulty (legacy docs hidden)', async () => {
  const db = createFakeDb([
    { name: 'OLD', score: 900, timestamp: 1 },
    { name: 'NEW', score: 100, timestamp: 2, difficulty: 'NORMAL' },
  ]);
  const store = createGlobalScores({ db, ready: true });
  await store.setSessionDifficulty('NORMAL');
  assert.equal(store.loaded, true);
  assert.deepEqual(store.scores, [{ name: 'NEW', score: 100, difficulty: 'NORMAL' }]);
});

test('submit records the difficulty and a matching checksum', async () => {
  const db = createFakeDb();
  const store = createGlobalScores({ db, ready: true });
  await store.setSessionDifficulty('VERY HARD');
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
  const hardBoard = Array.from({ length: GLOBAL_MAX_SCORES },
    (_, i) => ({ name: 'H' + i, score: 5000 - i, timestamp: i, difficulty: 'HARD' }));
  const store = createGlobalScores({ db: createFakeDb(hardBoard), ready: true });
  await store.setSessionDifficulty('HARD');
  assert.equal(store.qualifies(10, 'NORMAL'), false);
  assert.equal(store.qualifies(10, 'HARD'), false);
  assert.equal(store.qualifies(6000, 'HARD'), true);
  await store.setSessionDifficulty('NORMAL');
  assert.equal(store.qualifies(10, 'NORMAL'), true);
});

// --- Score recorder (what happens to a finished run) ---

function fakeGlobalBoard({ qualifies = false, placement = null } = {}) {
  const submitted = [];
  return {
    submitted,
    qualifies: () => qualifies,
    placement: (score, difficulty) => (typeof placement === 'function' ? placement(score, difficulty) : placement),
    submit: (name, score, difficulty) => { submitted.push({ name, score, difficulty }); },
  };
}

function finishedRun(overrides) {
  const state = createState(() => 0.5);
  Object.assign(state, { gameState: 'dead', difficulty: 'NORMAL', ...overrides });
  return state;
}

test('recorder: a score that makes no board only moves the session best', () => {
  const storage = createFakeStorage();
  const globalScores = fakeGlobalBoard();
  const full = [500, 400, 300, 200, 100].map(s => ({ name: 'X', score: s }));
  const state = finishedRun({ score: 10, highScores: full, highScore: 5 });
  createScoreRecorder({ storage, globalScores }).recordRun(state);
  assert.deepEqual(state.highScores, full);
  assert.equal(state.highScore, 10);
  assert.deepEqual(globalScores.submitted, []);
  assert.deepEqual(storage.dump(), {});
});

test('recorder: a qualifying score is saved locally and submitted under the setup name', () => {
  const storage = createFakeStorage();
  const globalScores = fakeGlobalBoard();
  const state = finishedRun({ score: 999, playerName: 'KID' });
  createScoreRecorder({ storage, globalScores }).recordRun(state);
  assert.deepEqual(state.highScores, [{ name: 'KID', score: 999 }]);
  assert.equal(state.highScore, 999);
  assert.deepEqual(loadHighScores(storage), [{ name: 'KID', score: 999 }]);
  assert.deepEqual(globalScores.submitted, [{ name: 'KID', score: 999, difficulty: 'NORMAL' }]);
});

test('recorder: a global-only qualifier is still recorded, and placement feeds the banner', () => {
  const full = [500, 400, 300, 200, 100].map(s => ({ name: 'X', score: s }));
  let asked = null;
  const globalScores = fakeGlobalBoard({
    qualifies: true,
    placement: (score, difficulty) => { asked = { score, difficulty }; return 4; },
  });
  const state = finishedRun({ score: 50, highScores: full });
  createScoreRecorder({ storage: createFakeStorage(), globalScores }).recordRun(state);
  assert.equal(state.globalPlacement, 4);
  assert.deepEqual(asked, { score: 50, difficulty: 'NORMAL' });
  assert.equal(globalScores.submitted.length, 1);
  assert.equal(globalScores.submitted[0].name, 'PLAYER', 'no setup name falls back to the default');
});
