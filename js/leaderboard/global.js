// Global high scores backed by a Firebase Firestore `scores` collection.
// Fetches up to GLOBAL_MAX_SCORES rows for one difficulty at a time. The
// player's session difficulty is loaded after setup and drives qualifies,
// placement, and the default tab; browsing another tab fetches that board.
// Legacy docs without a difficulty field are ignored entirely.

import { GLOBAL_MAX_SCORES, GLOBAL_FETCH_INTERVAL } from '../config.js';
import { computeScoreChecksum } from './checksum.js';

export function createGlobalScores({ db, ready }) {
  const store = {
    scores: [],              // board for the difficulty tab currently shown
    viewDifficulty: null,
    sessionDifficulty: null, // player's chosen difficulty (after setup)
    sessionLoaded: false,
    loaded: false,
    error: false,
    onChange: () => {},
  };

  const cache = new Map();     // difficulty label → score rows
  let lastFetchTime = 0;
  let fetchToken = 0;

  function scoresQuery(difficulty) {
    return db.collection('scores')
      .where('difficulty', '==', difficulty)
      .orderBy('score', 'desc')
      .orderBy('timestamp', 'asc');
  }

  function docsToScores(snapshot) {
    return snapshot.docs.map(doc => {
      const d = doc.data();
      return { name: d.name, score: d.score, difficulty: d.difficulty };
    });
  }

  async function fetchBoard(difficulty) {
    const token = ++fetchToken;
    if (!ready || !db) {
      store.error = true;
      store.loaded = false;
      store.onChange();
      return;
    }
    store.loaded = false;
    store.onChange();
    try {
      const snapshot = await scoresQuery(difficulty)
        .limit(GLOBAL_MAX_SCORES)
        .get();
      if (token !== fetchToken) return;
      const scores = docsToScores(snapshot);
      cache.set(difficulty, scores);
      if (difficulty === store.viewDifficulty) store.scores = scores;
      if (difficulty === store.sessionDifficulty) {
        store.sessionLoaded = true;
      }
      store.loaded = true;
      store.error = false;
      lastFetchTime = Date.now();
    } catch (e) {
      if (token !== fetchToken) return;
      console.warn('Failed to fetch global scores:', e);
      store.error = true;
      const cached = cache.get(difficulty);
      if (cached?.length) {
        if (difficulty === store.viewDifficulty) store.scores = [...cached];
        store.loaded = true;
      }
    }
    store.onChange();
  }

  // Player picked a difficulty on the start overlay — load their board and
  // show that tab by default.
  function setSessionDifficulty(difficulty) {
    store.sessionDifficulty = difficulty;
    store.viewDifficulty = difficulty;
    store.scores = cache.get(difficulty) ?? [];
    return fetchBoard(difficulty);
  }

  // User switched the HTML leaderboard tab (may differ from session difficulty).
  function loadView(difficulty) {
    store.viewDifficulty = difficulty;
    if (cache.has(difficulty)) {
      store.scores = cache.get(difficulty);
      store.loaded = true;
      store.error = false;
      store.onChange();
      return Promise.resolve();
    }
    store.scores = [];
    return fetchBoard(difficulty);
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
        checksum: checksum,
      });
      cache.delete(difficulty);
      await fetchBoard(difficulty);
      if (difficulty !== store.viewDifficulty) {
        await fetchBoard(store.viewDifficulty);
      }
    } catch (e) {
      console.warn('Failed to submit global score:', e);
    }
  }

  function maybeRefresh(now = Date.now()) {
    if (!store.sessionDifficulty) return;
    if (now - lastFetchTime > GLOBAL_FETCH_INTERVAL) {
      cache.delete(store.sessionDifficulty);
      if (store.viewDifficulty === store.sessionDifficulty) {
        cache.delete(store.viewDifficulty);
      }
      void fetchBoard(store.sessionDifficulty);
      if (store.viewDifficulty && store.viewDifficulty !== store.sessionDifficulty) {
        void fetchBoard(store.viewDifficulty);
      }
    }
  }

  function sessionBoard() {
    if (!store.sessionLoaded || !store.sessionDifficulty) return [];
    return cache.get(store.sessionDifficulty) ?? [];
  }

  function qualifies(score, difficulty) {
    if (difficulty !== store.sessionDifficulty || !store.sessionLoaded) return false;
    const board = sessionBoard();
    return board.length < GLOBAL_MAX_SCORES
      || score > (board[GLOBAL_MAX_SCORES - 1]?.score ?? 0);
  }

  function placement(score, difficulty) {
    if (difficulty !== store.sessionDifficulty || !store.sessionLoaded) return null;
    return getGlobalPlacement(sessionBoard(), difficulty, score);
  }

  store.setSessionDifficulty = setSessionDifficulty;
  store.loadView = loadView;
  store.submit = submit;
  store.maybeRefresh = maybeRefresh;
  store.qualifies = qualifies;
  store.placement = placement;
  return store;
}

// Pure: the capped leaderboard for one difficulty, preserving fetch order
// (score desc, timestamp asc).
export function getScoresForDifficulty(scores, difficulty) {
  return scores.filter(e => e.difficulty === difficulty).slice(0, GLOBAL_MAX_SCORES);
}

// Pure: the 1-based rank a score would take on one difficulty's board, or
// null if it wouldn't make the capped board. Ties rank below the existing
// entries (the board is ordered score desc, timestamp asc, so an equal score
// already on the board got there first).
export function getGlobalPlacement(scores, difficulty, score) {
  const board = getScoresForDifficulty(scores, difficulty);
  const rank = board.filter(e => e.score >= score).length + 1;
  return rank <= GLOBAL_MAX_SCORES ? rank : null;
}

// Pure: 1 → '1st', 2 → '2nd', 3 → '3rd', 11–13 → 'th', 21 → '21st', …
export function formatOrdinal(n) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return n + 'th';
  return n + ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th');
}

// Pure: rank + optional name filter, used by the HTML leaderboard.
export function getFilteredScores(scores, searchTerm) {
  const withRank = scores.map((e, i) => ({ ...e, rank: i + 1 }));
  if (!searchTerm) return withRank;
  const term = searchTerm.toUpperCase();
  return withRank.filter(e => e.name.includes(term));
}
