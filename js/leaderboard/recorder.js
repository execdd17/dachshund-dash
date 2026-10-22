// What happens to a finished run's score. Locally: the session best and the
// device's top list (the HUD's HI). Globally: nothing yet — a score that
// makes its difficulty's board becomes state.pendingScore, and the name
// prompt (ui/scoreNamePrompt.js) either names it, which submits it (the
// run's only Firestore write), or skips it. Storage and the global board are
// injected, so this runs under Node.

import { qualifiesLocally, insertScore, saveHighScores, normalizeName, savePlayerName } from './local.js';

export function createScoreRecorder({ storage, globalScores }) {
  // Called once per death (services.recordRun).
  function recordRun(state) {
    const { score, difficulty } = state;
    // A run boosted with the +500 debug key counts nowhere.
    if (state.scoreBoosted) {
      state.pendingScore = null;
      return;
    }
    state.highScore = Math.max(state.highScore, score);
    if (qualifiesLocally(state.highScores, score)) {
      state.highScores = insertScore(state.highScores, state.playerName ?? '', score);
      saveHighScores(storage, state.highScores);
    }
    const placement = globalScores.placement(score, difficulty);
    state.pendingScore = placement ? { score, difficulty, placement } : null;
    globalScores.refreshIfStale();
  }

  // The prompt's SAVE: submits the pending score under `rawName` and
  // remembers the name for next time. A blank name saves nothing.
  function nameScore(state, rawName) {
    const pending = state.pendingScore;
    if (!pending || !rawName?.trim()) return;
    const name = normalizeName(rawName);
    state.playerName = name;
    savePlayerName(storage, name);
    state.globalPlacement = pending.placement;
    state.pendingScore = null;
    globalScores.submit(name, pending.score, pending.difficulty);
  }

  // The prompt's SKIP: the score stays off the global board.
  function skipScore(state) {
    state.pendingScore = null;
  }

  return { recordRun, nameScore, skipScore };
}
