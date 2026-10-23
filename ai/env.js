// A training environment on the real game logic (js/), cut down to the two
// basic obstacles: chocolate bars and single birds (at duck height, so a bird
// is ducked under or jumped over). The game's own spawner, scenes, golden hot
// dogs, and frenzy are held off; the environment spawns at the game's own
// gaps. One heart: any hit ends the run. Speed follows the normal ramp.
//
//   const env = createEnv(seed); env.reset(); env.step(action) → { done }
//   env.state is the live game state (observe.js reads it).

import { createState, resetRun } from '../js/core/state.js';
import { update } from '../js/systems/update.js';
import { jump, duck } from '../js/systems/control.js';
import { makeObstacle } from '../js/systems/obstacleTypes.js';
import { createSilentSfx } from '../js/audio/sfx.js';
import { createSilentMusic } from '../js/audio/music.js';
import { W, BIRD_LOW_Y, MIN_OBSTACLE_GAP, MAX_OBSTACLE_GAP, SPAWN_MIX, DT_BASELINE } from '../js/config.js';

export const ACTIONS = ['none', 'jump', 'duck'];
export const BIRD_SHARE = 0.4;     // of spawns; the rest are chocolate bars
export const DECIDE_EVERY = 4;     // frames per decision: 30 a second at 120Hz
const FRAME_MS = DT_BASELINE;      // the game's own 120Hz step

// mulberry32: a small seeded generator, so a seed always replays the same run.
export function seededRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createEnv(seed) {
  const services = { sfx: createSilentSfx(), music: createSilentMusic(), recordRun() {} };
  const rng = seededRng(seed);
  const env = { state: null, now: 0, untilNext: 0, lastType: null };

  // A chocolate bar or a bird at the right edge, then the game's gap to the next.
  function spawn() {
    const type = rng() < BIRD_SHARE ? 'bird' : 'hotdog';
    env.state.obstacles.push(makeObstacle(type, W + 10, type === 'bird' ? { y: BIRD_LOW_Y } : {}));
    const minGap = type === env.lastType ? MIN_OBSTACLE_GAP : MIN_OBSTACLE_GAP * SPAWN_MIX.typeChangeGapMult;
    env.untilNext = minGap + rng() * MAX_OBSTACLE_GAP;
    env.lastType = type;
  }

  function frame() {
    const state = env.state;
    state.nextObstacleIn = Infinity;  // the game's spawner stays off
    env.now += FRAME_MS;
    update(state, FRAME_MS, services, rng, env.now);
    state.scene = null;               // and no scene ever takes a turn
    state.sceneQueue = [];
    env.untilNext -= state.speed;     // one 120Hz frame covers `speed` px
    if (env.untilNext <= 0) spawn();
  }

  env.reset = () => {
    const state = createState(rng);
    state.gameState = 'running';
    state.startingHearts = 1;
    resetRun(state);
    state.frenzyAt = 1;               // past the frenzy's drop, so it never brings its boss
    env.state = state;
    env.now = 0;
    env.untilNext = 200;
    env.lastType = null;
    return env;
  };

  // Hold `action` for DECIDE_EVERY frames: 'jump' presses once, 'duck' holds duck.
  env.step = action => {
    const state = env.state;
    duck(state, action === 'duck', services);
    if (action === 'jump') jump(state, services, env.now);
    for (let i = 0; i < DECIDE_EVERY && state.gameState === 'running'; i++) frame();
    return { done: state.gameState !== 'running' };
  };

  return env;
}
