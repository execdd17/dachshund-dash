// Which music track (a TRACKS key, audio/music.js) the game wants right now.
// update() hands it to services.music every frame; the player switches only
// when it changes. Once the frenzy starts (systems/frenzy.js, from
// FRENZY_AT), the rest of the run keeps the frenzy track, giant mode
// included (cutting away from it was jarring); before that, giant mode has
// its own track; otherwise, and between runs, the main one.

import { isGiant } from './giant.js';
import { inFrenzy } from './frenzy.js';

export function soundtrackFor(state) {
  if (state.gameState !== 'running') return 'main';
  if (inFrenzy(state)) return 'frenzy';
  if (isGiant(state)) return 'giant';
  return 'main';
}
