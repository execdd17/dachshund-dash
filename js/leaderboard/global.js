// Global high scores backed by a Firebase Firestore `scores` collection.
// The store holds fetched data + status flags; a render callback (injected)
// is invoked whenever data changes so the UI layer stays decoupled.

import { GLOBAL_MAX_SCORES, GLOBAL_FETCH_INTERVAL } from '../config.js';
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
      const snapshot = await db.collection('scores')
        .orderBy('score', 'desc')
        .orderBy('timestamp', 'asc')
        .limit(GLOBAL_MAX_SCORES)
        .get();
      store.scores = snapshot.docs.map(doc => {
        const d = doc.data();
        return { name: d.name, score: d.score };
      });
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

  async function submit(name, scoreVal) {
    if (!ready || !db) return;
    const timestamp = Date.now();
    const checksum = computeScoreChecksum(name, scoreVal, timestamp);
    try {
      await db.collection('scores').add({
        name: name,
        score: scoreVal,
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

  // Whether a score would make the global leaderboard.
  function qualifies(score) {
    return store.loaded && (store.scores.length < GLOBAL_MAX_SCORES
      || score > (store.scores[GLOBAL_MAX_SCORES - 1]?.score ?? 0));
  }

  store.fetch = fetch;
  store.submit = submit;
  store.maybeRefresh = maybeRefresh;
  store.qualifies = qualifies;
  return store;
}

// Pure: rank + optional name filter, used by the HTML leaderboard.
export function getFilteredScores(scores, searchTerm) {
  const withRank = scores.map((e, i) => ({ ...e, rank: i + 1 }));
  if (!searchTerm) return withRank;
  const term = searchTerm.toUpperCase();
  return withRank.filter(e => e.name.includes(term));
}
