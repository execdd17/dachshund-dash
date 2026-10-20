// Shared death handling: stop all encounter modes, record the score if it
// qualifies (local or global leaderboard) under the name chosen at setup,
// and transition the state machine. No prompting — straight to dead.

import { qualifiesLocally } from '../leaderboard/local.js';

export function killDog(state, services, now = performance.now()) {
  state.deathTime = now;
  services.sfx.playDeath();

  state.sceneQueue = [];
  state.scene = null;
  state.giantPhase = 'off';
  services.music.resetToNormal();

  const qualifies = qualifiesLocally(state.highScores, state.score)
    || services.globalScores.qualifies(state.score, state.difficulty);
  state.globalPlacement = services.globalScores.placement(state.score, state.difficulty);
  state.gameState = 'dead';
  if (qualifies) {
    services.recordScore(state.score);
  } else if (state.score > state.highScore) {
    state.highScore = state.score;
  }
}
