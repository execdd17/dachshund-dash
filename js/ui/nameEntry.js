// New-high-score name entry overlay (DOM). On submit, records the score
// locally and pushes it to the global leaderboard.

import { normalizeName, insertScore, saveHighScores } from '../leaderboard/local.js';

export function createNameEntry(state, { storage, globalScores }) {
  function show() {
    const overlay = document.getElementById('nameEntryOverlay');
    const input = document.getElementById('nameInput');
    overlay.classList.add('visible');
    input.value = '';
    input.focus();
  }

  function hide() {
    document.getElementById('nameEntryOverlay').classList.remove('visible');
  }

  function submit() {
    if (state.gameState !== 'enteringName' || state.pendingScore == null) return;
    const name = document.getElementById('nameInput').value;
    const displayName = normalizeName(name);
    state.highScores = insertScore(state.highScores, displayName, state.pendingScore);
    saveHighScores(storage, state.highScores);
    state.highScore = state.highScores[0]?.score ?? 0;
    globalScores.submit(displayName, state.pendingScore);
    state.pendingScore = null;
    state.gameState = 'dead';
    hide();
  }

  function wireControls() {
    document.getElementById('nameSubmitBtn').addEventListener('click', submit);
  }

  return { show, hide, submit, wireControls };
}
