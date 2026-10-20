// What happens to a finished run's score: the game-over placement, the local
// top list, and the global board, all under the name chosen at setup.
// Storage and the global board are injected, so this runs under Node.

import { qualifiesLocally, insertScore, saveHighScores, normalizeName } from './local.js';

export function createScoreRecorder({ storage, globalScores }) {
  // Called once per death (services.recordRun). Records the score if it makes
  // either board; otherwise only the session best can move.
  function recordRun(state) {
    const { score, difficulty } = state;
    state.globalPlacement = globalScores.placement(score, difficulty);
    const qualifies = qualifiesLocally(state.highScores, score) || globalScores.qualifies(score, difficulty);
    if (!qualifies) {
      state.highScore = Math.max(state.highScore, score);
      return;
    }
    const name = state.playerName ?? normalizeName('');
    state.highScores = insertScore(state.highScores, name, score);
    saveHighScores(storage, state.highScores);
    state.highScore = state.highScores[0]?.score ?? 0;
    globalScores.submit(name, score, difficulty);
  }

  return { recordRun };
}
