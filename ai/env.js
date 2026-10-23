// The training environment: the real game logic (js/) with the usual RL
// contract. What spawns comes from a tier (tiers.js): the environment spawns
// the tier's kinds at the game's own gaps and pattern odds, and the game's
// golden hot dogs, the scenes the tier doesn't allow, and (unless the tier
// has it) the frenzy are held off.
// While an allowed scene holds the slot, the game's own spawner runs (the
// chase's acorns come from the squirrel, by the game's rules). One heart: any
// hit ends the run. Speed follows the normal ramp. A seed replays a run
// exactly.
//
//   const env = createEnv({ seed, tier }).reset();
//   const { reward, done } = env.step(action);   // reward: points this step
//   observe(env.state) (observe.js) is what an agent sees.

import { createState, resetRun } from '../js/core/state.js';
import { update } from '../js/systems/update.js';
import { jump, duck } from '../js/systems/control.js';
import { SPAWN_KINDS, SPAWN_PATTERNS, patternChance } from '../js/systems/spawning.js';
import { paceOf, runSpeed } from '../js/core/speed.js';
import { createSilentSfx } from '../js/audio/sfx.js';
import { createSilentMusic } from '../js/audio/music.js';
import { W, MIN_OBSTACLE_GAP, MAX_OBSTACLE_GAP, PATTERN_CLOSE_GAP, SPAWN_MIX, DT_BASELINE, FRENZY_DROP_CALM } from '../js/config.js';
import { TIERS } from './tiers.js';
import { getObstacleHitbox } from '../js/systems/obstacleTypes.js';
import { dogBody, pastDog } from '../js/systems/dogBody.js';

export const ACTIONS = ['none', 'jump', 'duck'];
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

// What spawned an obstacle the game put on the field (a scene's spawns).
function kindOf(o) {
  if (o.skin === 'chase') return 'chase';
  if (o.aerialWall) return 'birdStack';
  return o.type === 'frisbee' ? 'frisbeePair' : o.type;
}

export function createEnv({ seed, tier }) {
  const { solo, patterns, scenes = [], frenzy = false, hyper = false, minutes = Infinity, hearts = 1 } = TIERS[tier];
  const soloKinds = Object.entries(solo);
  const soloTotal = soloKinds.reduce((sum, [, w]) => sum + w, 0);
  const services = { sfx: createSilentSfx(), music: createSilentMusic(), recordRun() {} };
  const rng = seededRng(seed);
  const env = { state: null, now: 0, untilNext: 0, lastKind: null, pattern: null };

  function pickSolo() {
    let r = rng() * soloTotal;
    for (const [kind, w] of soloKinds) if ((r -= w) < 0) return kind;
    return soloKinds.at(-1)[0];
  }

  function put(kind) {
    // Each obstacle is tagged with the kind it came from (a bird of a stack is a 'birdStack').
    const placed = SPAWN_KINDS[kind](W + 10, undefined, env.state.speed);
    for (const o of placed) o.kind = kind;
    env.state.obstacles.push(...placed);
  }

  // As the game's spawner does: a pattern's next beat, or maybe a new
  // pattern, or a single obstacle; then the gap to the next spawn.
  function spawn() {
    const pace = paceOf(env.state);
    if (!env.pattern && patterns && rng() < patternChance(pace)) {
      const eligible = SPAWN_PATTERNS.filter(p => pace >= p.minScore);
      if (eligible.length) env.pattern = { beats: eligible[Math.floor(rng() * eligible.length)].beats, index: 0 };
    }
    if (env.pattern) {
      const beat = env.pattern.beats[env.pattern.index++];
      put(beat.kind);
      env.lastKind = beat.kind;
      if (env.pattern.index < env.pattern.beats.length) {
        env.untilNext = beat.gapAfter ?? PATTERN_CLOSE_GAP;
        return;
      }
      env.pattern = null;
      env.untilNext = MIN_OBSTACLE_GAP + rng() * MAX_OBSTACLE_GAP;
      return;
    }
    const kind = pickSolo();
    put(kind);
    const minGap = kind === env.lastKind ? MIN_OBSTACLE_GAP : MIN_OBSTACLE_GAP * SPAWN_MIX.typeChangeGapMult;
    env.untilNext = minGap + rng() * MAX_OBSTACLE_GAP;
    env.lastKind = kind;
  }

  function frame() {
    const state = env.state;
    env.lastScene = state.scene?.id ?? null;  // death clears the slot: play.js asks what was running
    const inScene = Boolean(state.scene);
    if (!inScene) state.nextObstacleIn = Infinity;  // the game's spawner runs only in a scene
    env.now += FRAME_MS;
    update(state, FRAME_MS, services, rng, env.now);
    // Scenes the tier doesn't allow never take a turn.
    state.sceneQueue = state.sceneQueue.filter(id => scenes.includes(id));
    if (state.scene && !scenes.includes(state.scene.id)) state.scene = null;
    for (const o of state.obstacles) {
      o.kind ??= kindOf(o);
      // Lone birds (not the chase's acorns) and (in hyper) judged chocolate bars, once each as they
      // pass the dog. Kept, not tallied, because hyper pays a clean jump on landing, often after
      // the obstacle has left.
      if (o.counted) continue;
      if (o.type === 'bird' && !o.aerialWall && o.skin !== 'chase' && pastDog(getObstacleHitbox(o), dogBody(state.dog))) {
        o.counted = true;
        env.passedBirds.push(o);
      } else if (o.type === 'hotdog' && o.judged) {
        o.counted = true;
        env.passedBars.push(o);
      }
    }
    if (!inScene && state.scene && state.nextObstacleIn === Infinity) {
      // A scene took over this frame, and it didn't set the game's spawn count
      // (the chase does; the boss doesn't): hand over the environment's count,
      // which the frenzy's drop holds back as the game would. Left at Infinity,
      // nothing spawned all through a boss.
      state.nextObstacleIn = state.frenzyAt === env.now ? Math.max(env.untilNext, FRENZY_DROP_CALM) : env.untilNext;
    }
    if (inScene) {
      // Taking spawning back as a scene ends, carry on with the game's gap to its
      // next spawn: the environment's own count stopped when the scene began, and
      // picking it up again dropped obstacles almost on top of the scene's last ones.
      if (!state.scene) env.untilNext = state.nextObstacleIn;
      return;
    }
    env.untilNext -= state.speed;     // one 120Hz frame covers `speed` px
    if (env.untilNext <= 0) spawn();
  }

  env.reset = () => {
    const state = createState(rng);
    state.gameState = 'running';
    state.startingHearts = hearts;
    resetRun(state);
    state.hyper = hyper;
    state.speed = runSpeed(state);
    if (!frenzy) state.frenzyAt = 1;  // past the frenzy's drop, so it never brings its boss
    Object.assign(env, { state, now: 0, untilNext: 200, lastKind: null, pattern: null, passedBirds: [], passedBars: [] });
    return env;
  };

  // Lone birds passed and jumped (in hyper, a clean jump over one: its only bonus there), and
  // chocolate bars hyper judged and cleared with a single jump (cleanJump.js).
  Object.defineProperties(env, {
    birds: { get: () => ({ passed: env.passedBirds.length, jumped: env.passedBirds.filter(o => o.jumped || o.clean).length }) },
    bars: { get: () => ({ passed: env.passedBars.length, clean: env.passedBars.filter(o => o.clean).length }) },
  });

  // Out of game time: a timed tier's run is over, with the dog still running.
  env.timeUp = () => env.now >= minutes * 60000;
  // The run is over: the dog died, or time is up.
  env.over = () => env.state.gameState !== 'running' || env.timeUp();

  // Hold `action` for DECIDE_EVERY frames: 'jump' presses once, 'duck' holds duck.
  env.step = action => {
    const state = env.state;
    const before = state.score;
    duck(state, action === 'duck', services);
    if (action === 'jump') jump(state, services, env.now);
    for (let i = 0; i < DECIDE_EVERY && !env.over(); i++) frame();
    return { reward: state.score - before, done: env.over() };
  };

  return env;
}
