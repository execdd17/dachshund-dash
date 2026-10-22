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
    fastFalling: false,  // Down pressed mid-air (systems/control.js)
    underground: false,  // crawling through the tunnel scene's tunnel (systems/burrow.js)
    burrowChangedAt: 0,  // when it last dropped in or popped out (drives the dive drawing)
    flying: false,       // in the flight scene's sky lanes (systems/flight.js)
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
    globalPlacement: null,  // 1-based global-board rank of this run's saved score (null = none saved)
    pendingScore: null,     // { score, difficulty, placement } while the name prompt asks about a global-board score
    speed: INITIAL_SPEED,
    dog: createDog(),
    flightHintPending: true,  // flash ↑ ↓ above the flying dog until its first lane change (systems/flight.js)
    tunnelHintPending: true,  // flash HOLD ↓ over the tunnel's first hole until the dog first drops in (systems/tunnel.js)

    // --- Hearts (extra lives) ---
    hearts: startingHearts,
    invulnUntil: 0,   // timestamp: collisions are ignored until then (post-hit i-frames)
    heartLostAt: 0,   // timestamp of the last heart loss (drives the HUD blink)
    heartGainedAt: 0, // timestamp of the last heart regained (systems/hearts.js; same blink)

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
    giantStreak: 0,             // bones fetched in a row this giant mode (a bone that gets past breaks it)
    giantFeast: 0,              // bonus points this giant mode, tallied when it ends
    giantPatternIn: 0,          // px until the bone round's next pattern (systems/giantBones.js)
    giantLastPattern: null,     // so the same pattern never comes twice running
    giantPatternsLeft: {},      // the patterns this round has yet to deal out
    lastGoldenScore: 0,         // the last golden's spawn score, then the score its giant mode ended at
    goldenSinceScene: false,    // a golden has spawned since the last scene ended (one per gap)

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
    playerName: null,  // the last name saved with a global score (loaded by main.js; prefills the name prompt)
    touchDevice: false,  // set by main.js; switches HUD prompts to tap wording
    difficulty: DEFAULT_DIFFICULTY.label,  // label of the session difficulty; recorded with global scores
    startingHearts: DEFAULT_HEARTS,  // set by the start overlay's difficulty slider
    tutorialPending: false,  // run the controls tutorial at the next run start (systems/tutorial.js; set by main.js)
    duckHeld: false,  // duck key/touch is down; outlives runs so a held key carries into a restart

    groundOffset: 0,
    clouds: createClouds(),
    flowers: createFlowers(rng),  // decor spots along the path; each biome draws its own there (render/biomes.js)
    biomeSkip: 0,  // the N debug key's shift along the biome order (cosmetic)
    skyTop: 0,  // top of visible sky in world coords (≤0; set by the app-mode view)

    ...createRunState(),
  };
}

// Fresh run: reapply every run-scoped default. Used by the idle→running and
// dead→running transitions in jump(); music reset is the caller's job.
export function resetRun(state) {
  Object.assign(state, createRunState(state.startingHearts));
}

// Between runs (idle or dead) with nothing waiting on the player: the menus
// beside the game show, and a jump starts the next run.
export function isBetweenRuns(state) {
  return (state.gameState === 'idle' || state.gameState === 'dead') && !state.pendingScore;
}
