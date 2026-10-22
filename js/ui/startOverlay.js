// Start-of-session overlay (DOM): picks a difficulty (starting hearts) and
// hyper mode (core/speed.js) once per page load, locked for the session
// (reload to change them); the HYPER switch is remembered on the device. It
// asks for no name: one is asked for only when a score makes the global
// board (ui/scoreNamePrompt.js).

import { DEFAULT_DIFFICULTY_INDEX, HYPER_MODE_KEY } from '../config.js';
import { difficultyAt } from '../core/difficulty.js';

export function createStartOverlay(state, { onDifficultyChosen = () => {} } = {}) {
  const overlay = document.getElementById('startOverlay');
  const slider = document.getElementById('difficultySlider');
  const sliderLabel = document.getElementById('difficultyValue');
  const hyperToggle = document.getElementById('hyperToggle');

  // Storage can be unavailable (private mode, blocked site data): then the switch just starts off.
  const rememberedHyper = () => { try { return localStorage.getItem(HYPER_MODE_KEY) === '1'; } catch { return false; } };
  const rememberHyper = on => { try { localStorage.setItem(HYPER_MODE_KEY, on ? '1' : '0'); } catch { /* not remembered */ } };

  function difficultyText(idx) {
    const level = difficultyAt(idx);
    return `${level.label} — ${level.hearts} HEART${level.hearts === 1 ? '' : 'S'}`;
  }

  function show() {
    state.gameState = 'setup';
    slider.value = String(DEFAULT_DIFFICULTY_INDEX);
    sliderLabel.textContent = difficultyText(DEFAULT_DIFFICULTY_INDEX);
    hyperToggle.checked = rememberedHyper();
    overlay.classList.add('visible');
    document.getElementById('startBtn').focus();
  }

  function submit() {
    if (state.gameState !== 'setup') return;
    const level = difficultyAt(Number(slider.value));
    state.difficulty = level.label;
    state.startingHearts = level.hearts;
    state.hearts = level.hearts;
    state.hyper = hyperToggle.checked;
    rememberHyper(state.hyper);
    state.gameState = 'idle';
    overlay.classList.remove('visible');
    document.getElementById('startBtn').blur();  // else Space would press it again
    onDifficultyChosen(level.label);
  }

  function wireControls() {
    document.getElementById('startBtn').addEventListener('click', submit);
    slider.addEventListener('input', () => { sliderLabel.textContent = difficultyText(Number(slider.value)); });
  }

  return { show, submit, wireControls };
}
