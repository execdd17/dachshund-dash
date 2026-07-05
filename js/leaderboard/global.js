// Global high scores backed by a Firebase Firestore `scores` collection.
// Every submission carries the session difficulty label, and the leaderboard
// is per-difficulty: the store holds one mixed fetched list, and the pure
// helpers below slice out a capped, ranked board for a single difficulty.
// Legacy docs without a difficulty field are ignored entirely.
// The store holds fetched data + status flags; a render callback (injected)
// is invoked whenever data changes so the UI layer stays decoupled.

import { GLOBAL_MAX_SCORES, GLOBAL_FETCH_INTERVAL, DIFFICULTY_LEVELS } from '../config.js';
import { computeScoreChecksum } from './checksum.js';

export function createGlobalScores({ db, ready }) {
  const store = {
    scores: [],
    loaded: false,
    error: false,
    onChange: () => {},   // set by the UI layer
  };
  let cached = [];
  let lastFetchTime = 0;

  async function fetch() {
    if (!ready || !db) {
      store.error = true;
      store.onChange();
      return;
    }
    try {
      // One query for all difficulties (avoids needing a composite index per
      // where-clause); the per-difficulty cap is applied client-side.
      const snapshot = await db.collection('scores')
        .orderBy('score', 'desc')
        .orderBy('timestamp', 'asc')
        .limit(GLOBAL_MAX_SCORES * DIFFICULTY_LEVELS.length)
        .get();
      store.scores = snapshot.docs
        .map(doc => {
          const d = doc.data();
          return { name: d.name, score: d.score, difficulty: d.difficulty };
        })
        .filter(e => typeof e.difficulty === 'string');
      cached = [...store.scores];
      store.loaded = true;
      store.error = false;
    } catch (e) {
      console.warn('Failed to fetch global scores:', e);
      store.error = true;
      if (cached.length > 0) {
        store.scores = [...cached];
        store.loaded = true;
      }
    }
    store.onChange();
  }

  async function submit(name, scoreVal, difficulty) {
    if (!ready || !db) return;
    const timestamp = Date.now();
    const checksum = computeScoreChecksum(name, scoreVal, timestamp, difficulty);
    try {
      await db.collection('scores').add({
        name: name,
        score: scoreVal,
        difficulty: difficulty,
        timestamp: timestamp,
        checksum: checksum
      });
      await fetch();
    } catch (e) {
      console.warn('Failed to submit global score:', e);
    }
  }

  // Called from the idle screen each frame; throttles to one fetch per interval.
  function maybeRefresh(now = Date.now()) {
    if (now - lastFetchTime > GLOBAL_FETCH_INTERVAL) {
      lastFetchTime = now;
      fetch();
    }
  }

  // Whether a score would make the global leaderboard for its difficulty.
  function qualifies(score, difficulty) {
    if (!store.loaded) return false;
    const board = getScoresForDifficulty(store.scores, difficulty);
    return board.length < GLOBAL_MAX_SCORES
      || score > (board[GLOBAL_MAX_SCORES - 1]?.score ?? 0);
  }

  store.fetch = fetch;
  store.submit = submit;
  store.maybeRefresh = maybeRefresh;
  store.qualifies = qualifies;
  return store;
}

// Pure: the capped leaderboard for one difficulty, preserving fetch order
// (score desc, timestamp asc).
export function getScoresForDifficulty(scores, difficulty) {
  return scores.filter(e => e.difficulty === difficulty).slice(0, GLOBAL_MAX_SCORES);
}

// Pure: rank + optional name filter, used by the HTML leaderboard.
export function getFilteredScores(scores, searchTerm) {
  const withRank = scores.map((e, i) => ({ ...e, rank: i + 1 }));
  if (!searchTerm) return withRank;
  const term = searchTerm.toUpperCase();
  return withRank.filter(e => e.name.includes(term));
}
