// Start-of-session setup overlay (DOM): asks for the player's name and a
// difficulty (starting hearts) once per page load. The name is reused for
// every qualifying score afterwards (leaderboard/recorder.js), so death never
// re-prompts; the difficulty is locked for the session (reload to change it).

import { normalizeName } from '../leaderboard/local.js';
import { DEFAULT_DIFFICULTY_INDEX } from '../config.js';
import { difficultyAt } from '../core/difficulty.js';

export function createNameEntry(state, { onDifficultyChosen = () => {} } = {}) {
  function difficultyText(idx) {
    const level = difficultyAt(idx);
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
    const level = difficultyAt(idx);
    state.difficulty = level.label;
    state.startingHearts = level.hearts;
    state.hearts = level.hearts;
    state.gameState = 'idle';
    hide();
    onDifficultyChosen(level.label);
  }

  function wireControls() {
    document.getElementById('nameSubmitBtn').addEventListener('click', submit);
    const slider = document.getElementById('difficultySlider');
    slider.addEventListener('input', () => {
      document.getElementById('difficultyValue').textContent = difficultyText(Number(slider.value));
    });
  }

  return { show, hide, submit, wireControls };
}
