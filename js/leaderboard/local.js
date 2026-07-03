// Local top-5 high scores, persisted in localStorage. Storage is injected so
// the logic runs under Node for tests.

import { HIGH_SCORES_KEY, MAX_HIGH_SCORES } from '../config.js';

export function loadHighScores(storage) {
  try {
    const raw = storage.getItem(HIGH_SCORES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(e => e && typeof e.name === 'string' && typeof e.score === 'number').slice(0, MAX_HIGH_SCORES);
  } catch {
    return [];
  }
}

export function saveHighScores(storage, scores) {
  try {
    storage.setItem(HIGH_SCORES_KEY, JSON.stringify(scores));
  } catch (_) {}
}

// Normalize a raw player name for display: trimmed, defaulted, capped, upper.
export function normalizeName(name) {
  const n = (name || '').trim() || 'Player';
  return n.slice(0, 12).toUpperCase();
}

// Pure insert: returns the new sorted, capped list (does not mutate input).
export function insertScore(highScores, displayName, scoreVal) {
  return [...highScores, { name: displayName, score: scoreVal }]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_HIGH_SCORES);
}

// Whether a score would make the local leaderboard.
export function qualifiesLocally(highScores, score) {
  return highScores.length < MAX_HIGH_SCORES
    || score > (highScores[MAX_HIGH_SCORES - 1]?.score ?? 0);
}
