// Start-of-session setup overlay (DOM): asks for the player's name and a
// difficulty (starting hearts) once per page load. The stored name is reused
// for every qualifying score afterwards, so death never re-prompts; the
// difficulty is locked for the session (reload the page to change it).

import { normalizeName, insertScore, saveHighScores } from '../leaderboard/local.js';
import { DIFFICULTY_LEVELS, DEFAULT_DIFFICULTY_INDEX } from '../config.js';

export function createNameEntry(state, { storage, globalScores }) {
  function difficultyText(idx) {
    const level = DIFFICULTY_LEVELS[idx] ?? DIFFICULTY_LEVELS[DEFAULT_DIFFICULTY_INDEX];
    return `${level.label} — ${level.hearts} HEART${level.hearts === 1 ? '' : 'S'}`;
  }

  function show() {
    state.gameState = 'setup';
    const overlay = document.getElementById('nameEntryOverlay');
    const input = document.getElementById('nameInput');
    const slider = document.getElementById('difficultySlider');
    slider.value = String(DEFAULT_DIFFICULTY_INDEX);
    document.getElementById('difficultyValue').textContent = difficultyText(DEFAULT_DIFFICULTY_INDEX);
    overlay.classList.add('visible');
    input.value = '';
    input.focus();
  }

  function hide() {
    document.getElementById('nameEntryOverlay').classList.remove('visible');
  }

  function submit() {
    if (state.gameState !== 'setup') return;
    state.playerName = normalizeName(document.getElementById('nameInput').value);
    const idx = Number(document.getElementById('difficultySlider').value);
    const level = DIFFICULTY_LEVELS[idx] ?? DIFFICULTY_LEVELS[DEFAULT_DIFFICULTY_INDEX];
    state.startingHearts = level.hearts;
    state.hearts = level.hearts;
    state.gameState = 'idle';
    hide();
  }

  // Records a qualifying score locally and globally under the setup name.
  // Called from killDog via services.recordScore.
  function recordScore(scoreVal) {
    const displayName = state.playerName ?? normalizeName('');
    state.highScores = insertScore(state.highScores, displayName, scoreVal);
    saveHighScores(storage, state.highScores);
    state.highScore = state.highScores[0]?.score ?? 0;
    globalScores.submit(displayName, scoreVal);
  }

  function wireControls() {
    document.getElementById('nameSubmitBtn').addEventListener('click', submit);
    const slider = document.getElementById('difficultySlider');
    slider.addEventListener('input', () => {
      document.getElementById('difficultyValue').textContent = difficultyText(Number(slider.value));
    });
  }

  return { show, hide, submit, recordScore, wireControls };
}
