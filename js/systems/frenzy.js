// Frenzy: the run's last act, when the music turns frantic. From
// FRENZY_SPEED (normal: score 5000; hyper gets there sooner), at the first
// moment the field is free (giant mode over, no scene past waiting for its
// turn), it starts with the drop: everything on screen bursts, the screen
// flashes, a shockwave rolls out from the dog, the camera shakes, FRENZY!
// comes up, and the boss starts that same frame — it kicks the frenzy off. Its music (systems/soundtrack.js) and the score's
// fire start with it. Scenes marked `skipsFrenzy` (the boss, the tunnel)
// never ask for a turn again. From then on, every hazard the dog gets
// past bursts behind it (a show: nothing behind the dog can hit it), outside
// giant mode. render/frenzy.js has the looks.
//   state.frenzyAt: when it started (ms), 0 until then

import { W, FRENZY_SPEED, FRENZY_DROP_CALM } from '../config.js';
import { runSpeed } from '../core/speed.js';
import { OBSTACLE_TYPES } from './obstacleTypes.js';
import { addEffect } from './effects.js';
import { SCENES, forceScene } from './scenes.js';

export const inFrenzy = state => state.frenzyAt > 0;

const isHazard = o => OBSTACLE_TYPES[o.type].contact === 'hazard' && !o.practice;
// A scene that's only waiting for its turn hasn't put anything on the field yet.
const fieldIsFree = state => state.giantPhase === 'off' && (!state.scene || state.scene.phase === 'pending');

const SKIPS_FRENZY = new Set(SCENES.filter(def => def.skipsFrenzy).map(def => def.id));

// The boss, now, on a cleared field (it starts this same frame, in
// updateScenes). A scene waiting for its turn goes next; the scenes that skip
// the frenzy lose their queued turns.
function bossNow(state) {
  const waiting = state.scene?.phase === 'pending' ? state.scene.id : null;
  state.scene = null;
  state.sceneQueue = [waiting, ...state.sceneQueue].filter(id => id && !SKIPS_FRENZY.has(id));
  forceScene(state, 'boss');
}

function detonate(state, o, now) {
  addEffect(state, 'burst', now, { x: o.x + o.width / 2, y: o.y + o.height / 2, size: Math.max(o.width, Math.min(o.height, 60)) });
}

function drop(state, services, now) {
  state.frenzyAt = now;
  state.obstacles.forEach(o => { if (o.x < W) detonate(state, o, now); });  // the rest go with the clear
  state.nextObstacleIn = Math.max(state.nextObstacleIn, FRENZY_DROP_CALM);
  addEffect(state, 'frenzyDrop', now, { x: state.dog.x + 50, y: state.dog.y });
  services.sfx.playFrenzyDrop();
  bossNow(state);
}

// Once per frame, after obstacles move.
export function stepFrenzy(state, services, now) {
  if (!inFrenzy(state)) {
    if (runSpeed(state) >= FRENZY_SPEED && fieldIsFree(state)) drop(state, services, now);
    return;
  }
  if (state.giantPhase !== 'off') return;  // giant mode eats or fetches what it meets
  state.obstacles = state.obstacles.filter(o => {
    if (!isHazard(o) || o.x + o.width >= state.dog.x) return true;
    detonate(state, o, now);
    return false;
  });
}
