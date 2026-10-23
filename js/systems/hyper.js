// Unlocking hyper mode (core/speed.js): a device unlocks it once its best
// normal score reaches HYPER_UNLOCK_AT — 2000, where a normal run reaches
// hyper's starting speed: handle that, and you may start there. Boosted runs
// (the + debug key) and hyper runs record no scores (leaderboard/recorder.js),
// so neither can unlock it. The run that crosses it gets a popup at once.

import { SPEED_PROFILES } from '../config.js';
import { scoreAtSpeed } from '../core/speed.js';
import { addEffect } from './effects.js';

export const HYPER_UNLOCK_AT = scoreAtSpeed(SPEED_PROFILES.hyper.start, SPEED_PROFILES.normal);

// The device's best (its local list), or this session's, before the current run ends.
export const isHyperUnlocked = state => Math.max(state.highScores[0]?.score ?? 0, state.highScore) >= HYPER_UNLOCK_AT;

// Once per frame: the popup in the run whose score first crosses the mark.
export function stepHyperUnlock(state, now) {
  if (state.hyperUnlockShown || state.hyper || state.scoreBoosted) return;
  if (state.score < HYPER_UNLOCK_AT || isHyperUnlocked(state)) return;
  state.hyperUnlockShown = true;
  addEffect(state, 'hyperUnlocked', now);
}
