// Which music track (a TRACKS key, audio/music.js) the game wants right now.
// update() hands it to services.music every frame; the player switches only
// when it changes. Once the frenzy starts (systems/frenzy.js, from
// FRENZY_SPEED), the rest of the run keeps the frenzy track, giant mode
// included (cutting away from it was jarring); before that, giant mode has
// its own track; otherwise, and between runs, the mode's own: the main one,
// or in hyper mode (core/speed.js) the hyper one.

import { isGiant } from './giant.js';
import { inFrenzy } from './frenzy.js';

export function soundtrackFor(state) {
  const resting = state.hyper ? 'hyper' : 'main';
  if (state.gameState !== 'running') return resting;
  if (inFrenzy(state)) return 'frenzy';
  if (isGiant(state)) return 'giant';
  return resting;
}
