// Shared death handling: stop all encounter modes, record the score if it
// qualifies (local or global leaderboard) under the name chosen at setup,
// and transition the state machine. No prompting — straight to dead.

import { qualifiesLocally } from '../leaderboard/local.js';

export function killDog(state, services) {
  state.deathTime = Date.now();
  services.sfx.playDeath();

  state.chaseActive = false;
  state.chasePending = false;
  state.chaseEntering = false;
  state.chaseEscaping = false;
  state.bossPending = false;
  state.bossChasing = false;
  state.bossLosing = false;
  state.giantActive = false;
  state.giantGrowing = false;
  state.giantShrinking = false;
  state.giantScoreMultiplier = 1;
  services.music.resetToNormal();

  const qualifies = qualifiesLocally(state.highScores, state.score)
    || services.globalScores.qualifies(state.score);
  state.gameState = 'dead';
  if (qualifies) {
    services.recordScore(state.score);
  } else if (state.score > state.highScore) {
    state.highScore = state.score;
  }
}
