// Name prompt (DOM) for a score that made its difficulty's global board:
// shown while state.pendingScore is set (leaderboard/recorder.js sets it at
// death), prefilled with the last name saved on this device. SAVE names and
// submits the score; SKIP lets it go. The next run waits until one is chosen.

import { formatOrdinal } from '../leaderboard/global.js';

export function createScoreNamePrompt(state, { nameScore, skipScore }) {
  const overlay = document.getElementById('scoreNameOverlay');
  const input = document.getElementById('scoreNameInput');
  const saveBtn = document.getElementById('scoreNameSaveBtn');
  const isOpen = () => overlay.classList.contains('visible');

  function open() {
    const { placement, difficulty } = state.pendingScore;
    document.getElementById('scoreNamePlace').textContent = formatOrdinal(placement);
    document.getElementById('scoreNameDifficulty').textContent = difficulty;
    input.value = state.playerName ?? '';
    saveBtn.disabled = !input.value.trim();
    overlay.classList.add('visible');
    input.focus();
    input.select();
  }

  function close() {
    overlay.classList.remove('visible');
    input.blur();
  }

  // Once a frame: follow state.pendingScore.
  function update() {
    if (state.pendingScore && !isOpen()) open();
    else if (!state.pendingScore && isOpen()) close();
  }

  const save = () => { if (input.value.trim()) nameScore(state, input.value); };
  const skip = () => skipScore(state);

  function wireControls() {
    saveBtn.addEventListener('click', save);
    document.getElementById('scoreNameSkipBtn').addEventListener('click', skip);
    input.addEventListener('input', () => { saveBtn.disabled = !input.value.trim(); });
    input.addEventListener('keydown', e => {
      if (e.code === 'Enter') save();
      else if (e.code === 'Escape') skip();
    });
  }

  return { update, wireControls };
}
