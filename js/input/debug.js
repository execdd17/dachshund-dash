// Debug keys (desktop): key code → command. No DOM access, so tests can drive
// them. `running` commands only apply mid-run.

import { initRain } from '../systems/weather.js';
import { makeObstacle } from '../systems/obstacleTypes.js';
import { forceScene } from '../systems/scenes.js';
import { isGiant } from '../systems/giant.js';

export const DEBUG_KEYS = {
  KeyP: { label: 'slow motion', run: state => { state.slowMode = !state.slowMode; } },
  KeyH: { label: 'default hat', run: (state, { cosmetics }) => cosmetics.toggleDefaultHat() },
  KeyC: { label: 'chase scene', running: true, run: state => forceScene(state, 'chase') },
  KeyB: { label: 'boss scene', running: true, run: state => forceScene(state, 'boss') },
  KeyT: { label: 'trampoline scene', running: true, run: state => forceScene(state, 'tramp') },
  KeyG: {
    label: 'golden hot dog',
    running: true,
    run: state => { if (!isGiant(state)) state.obstacles.push(makeObstacle('golden', state.dog.x + 120)); },
  },
  KeyR: {
    label: 'rain',
    run: state => {
      state.weatherRain = !state.weatherRain;
      if (state.weatherRain) initRain(state); else state.rainDrops = [];
    },
  },
};

// Runs the command bound to `code`; true when one ran (the caller then
// suppresses the key's default action).
export function runDebugKey(code, state, deps) {
  const command = DEBUG_KEYS[code];
  if (!command || (command.running && state.gameState !== 'running')) return false;
  command.run(state, deps);
  return true;
}
