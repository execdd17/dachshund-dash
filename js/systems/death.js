// Shared death handling: stop all encounters, hand the run's score to the
// leaderboard (services.recordRun), and go straight to dead — no prompting.

export function killDog(state, services, now = performance.now()) {
  state.deathTime = now;
  services.sfx.playDeath();

  state.sceneQueue = [];
  state.scene = null;
  state.giantPhase = 'off';
  services.music.resetToNormal();

  state.gameState = 'dead';
  services.recordRun(state);
}
