// Scene registry. Order is the per-frame update order; fairness between
// scenes comes from the queue in encounters.js, not from this order.

import { chaseScene } from './chase.js';
import { bossScene } from './boss.js';
import { trampScene } from './trampoline.js';
import { tutorialScene } from './tutorial.js';
import { tunnelScene } from './tunnel.js';
import { stepScene, sceneBlocksSpawning } from './encounters.js';

export const SCENES = [tutorialScene, chaseScene, bossScene, trampScene, tunnelScene];
const SCENE_BY_ID = Object.fromEntries(SCENES.map(def => [def.id, def]));
const runningDef = state => SCENE_BY_ID[state.scene?.id];

export function updateScenes(state, scale, services, now, rng) {
  for (const def of SCENES) stepScene(state, def, { scale, services, now, rng });
}

export function scenesBlockSpawning(state) {
  const def = runningDef(state);
  return Boolean(def && sceneBlocksSpawning(state, def));
}

// Multiplier on game time from the running scene's timeScale(scene), if any.
export function sceneTimeScale(state) {
  return runningDef(state)?.timeScale?.(state.scene) ?? 1;
}

// True while the running scene is `scoreless` (no distance points).
export function scenesFreezeScore(state) {
  return Boolean(runningDef(state)?.scoreless);
}

// 'idle' unless scene `id` holds the slot.
export function getScenePhase(state, id) {
  return state.scene?.id === id ? state.scene.phase : 'idle';
}

// Puts scene `id` in `phase` (keeping its data if it already holds the slot),
// or clears it with 'idle'. For tests and debugging — gameplay goes through
// the queue.
export function setScenePhase(state, id, phase) {
  if (phase === 'idle') {
    if (state.scene?.id === id) state.scene = null;
  } else if (state.scene?.id === id) {
    state.scene.phase = phase;
  } else {
    state.scene = { id, phase, ...SCENE_BY_ID[id].initialData() };
  }
}

// Debug keys: start scene `id` right away (clearing the field), unless a
// scene is already running. Skips the queue and the gap between scenes, but
// still stands down for giant mode like any pending scene.
export function forceScene(state, id) {
  if (state.scene) return;
  state.sceneQueue = state.sceneQueue.filter(queued => queued !== id);
  state.obstacles = [];
  setScenePhase(state, id, 'pending');
}
