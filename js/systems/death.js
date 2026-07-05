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
  state.trampPending = false;
  state.trampActive = false;
  state.giantActive = false;
  state.giantGrowing = false;
  state.giantShrinking = false;
  state.giantScoreMultiplier = 1;
  state.trampPending = false;
  state.trampActive = false;
  services.music.resetToNormal();

  const qualifies = qualifiesLocally(state.highScores, state.score)
    || services.globalScores.qualifies(state.score, state.difficulty);
  state.gameState = 'dead';
  if (qualifies) {
    services.recordScore(state.score);
  } else if (state.score > state.highScore) {
    state.highScore = state.score;
  }
}
