// "How to play" button on the idle and game-over screens: starts a run with
// the controls tutorial (systems/tutorial.js) queued.

export function createHowToPlayButton(state, { startRun }) {
  const button = document.getElementById('howToPlayBtn');

  function updateVisibility() {
    button.classList.toggle('visible', state.gameState === 'idle' || state.gameState === 'dead');
  }

  function wireControls() {
    button.addEventListener('click', () => {
      button.blur();  // else Space would press it again instead of jumping
      state.tutorialPending = true;
      startRun();
    });
  }

  return { updateVisibility, wireControls };
}
