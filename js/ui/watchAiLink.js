// The robot button beside HOW TO PLAY on the idle and game-over screens:
// opens the AI viewer (ai/watch.html) in a new tab, where a trained network
// plays the game.

import { isBetweenRuns } from '../core/state.js';

export function createWatchAiLink(state) {
  const link = document.getElementById('watchAiBtn');

  function updateVisibility() {
    link.classList.toggle('visible', isBetweenRuns(state));
  }

  function wireControls() {
    link.addEventListener('click', () => link.blur());  // else Space would follow it again instead of jumping
  }

  return { updateVisibility, wireControls };
}
