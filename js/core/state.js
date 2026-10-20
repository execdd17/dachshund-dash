// Central mutable game state. One object, created by createState(), passed
// explicitly to every system and renderer — no module-level game globals.

import {
  W, GROUND_Y, INITIAL_SPEED, DOG_BASE_X,
} from '../config.js';
import { DEFAULT_DIFFICULTY } from './difficulty.js';

const DEFAULT_HEARTS = DEFAULT_DIFFICULTY.hearts;

export function createDog() {
  return {
    x: DOG_BASE_X,
    y: GROUND_Y,
    width: 100,
    height: 30,
    vy: 0,
    jumping: false,
    doubleJumped: false,
    ducking: false,
    legFrame: 0,
  };
}

export function createClouds() {
  return [
    { x: 100, y: 40, size: 1.0 },
    { x: 350, y: 25, size: 1.3 },
    { x: 600, y: 50, size: 0.8 },
    { x: 200, y: 60, size: 0.6 },
    { x: 750, y: 35, size: 1.1 },
  ];
}

export function createFlowers(rng = Math.random) {
  const flowers = [];
  for (let i = 0; i < 12; i++) {
    flowers.push({
      x: rng() * W,
      baseY: GROUND_Y + 22 + rng() * 8,
      size: 3 + rng() * 3,
      color: ['#FFD700', '#FFA500', '#FF6347', '#FF69B4'][Math.floor(rng() * 4)],
    });
  }
  return flowers;
}

// Everything a single run owns. createState() starts from it, and resetRun()
// reapplies it, so a new run-scoped field is declared here once.
export function createRunState(startingHearts = DEFAULT_HEARTS) {
  return {
    score: 0,
    lastMilestone: 0,
    globalPlacement: null,  // 1-based global-board rank set at death (null = didn't place / board unknown)
    speed: INITIAL_SPEED,
    dog: createDog(),

    // --- Hearts (extra lives) ---
    hearts: startingHearts,
    invulnUntil: 0,   // timestamp: collisions are ignored until then (post-hit i-frames)
    heartLostAt: 0,   // timestamp of the last heart loss (drives the HUD blink)

    landingParticles: [],

    // --- Obstacles ---
    obstacles: [],
    nextObstacleIn: 60,
    lastObstacleType: 'hotdog',
    activeSpawnPattern: null,  // { id, beats, index } — multi-beat close-gap sequence

    // --- Scenes (chase, boss, trampoline; see systems/encounters.js) ---
    scene: null,                // the running scene: { id, phase, ...its data }
    sceneQueue: [],             // scene ids waiting for a turn, FIFO, one entry per scene
    sceneMemory: {},            // per-scene trigger bookkeeping that outlives each run of it
    lastSceneEndAt: -Infinity,  // ms timestamp when the last scene fully ended; -Infinity = none yet

    // --- Giant mode ---
    giantPhase: 'off',          // 'off' | 'growing' | 'active' | 'shrinking' (systems/giant.js)
    giantStartTime: 0,
    giantTransitionStart: 0,
    lastGoldenSpawnScore: 0,

    effects: [],  // popups + knocked-away obstacles: [{ kind, startTime, ... }] (systems/effects.js)

    // --- Weather ---
    weatherRain: false,
    lastTimeStage: 'day',   // track stage transitions for weather rolls
    rainDrops: [],
  };
}

export function createState(rng = Math.random) {
  return {
    // --- Session: game state machine (setup → idle → running → dead), player, scenery ---
    gameState: 'idle',
    highScore: 0,
    highScores: [],    // local top scores, loaded from storage at startup
    frameCount: 0,
    deathTime: 0,
    slowMode: false,
    playerName: null,  // chosen once on the start overlay; reused for every score submit
    touchDevice: false,  // set by main.js; switches HUD prompts to tap wording
    difficulty: DEFAULT_DIFFICULTY.label,  // label of the session difficulty; recorded with global scores
    startingHearts: DEFAULT_HEARTS,  // set by the start overlay's difficulty slider
    duckHeld: false,  // duck key/touch is down; outlives runs so a held key carries into a restart

    groundOffset: 0,
    clouds: createClouds(),
    flowers: createFlowers(rng),
    skyTop: 0,  // top of visible sky in world coords (≤0; set by the app-mode view)

    ...createRunState(),
  };
}

// Fresh run: reapply every run-scoped default. Used by the idle→running and
// dead→running transitions in jump(); music reset is the caller's job.
export function resetRun(state) {
  Object.assign(state, createRunState(state.startingHearts));
}
