// Shared death handling: stop all encounter modes, decide whether the score
// qualifies for name entry (local or global leaderboard), and transition the
// state machine.

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
  if (qualifies) {
    state.gameState = 'enteringName';
    state.pendingScore = state.score;
    services.showNameEntryOverlay();
  } else {
    state.gameState = 'dead';
    if (state.score > state.highScore) state.highScore = state.score;
  }
}
