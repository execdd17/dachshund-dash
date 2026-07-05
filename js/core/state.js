// Central mutable game state. One object, created by createState(), passed
// explicitly to every system and renderer — no module-level game globals.
// Field names match the original single-file implementation to keep the
// gameplay code recognizable.

import {
  W, GROUND_Y, INITIAL_SPEED, DOG_BASE_X, BOSS_SQUIRREL_START_X,
  DIFFICULTY_LEVELS, DEFAULT_DIFFICULTY_INDEX,
} from '../config.js';

const DEFAULT_HEARTS = DIFFICULTY_LEVELS[DEFAULT_DIFFICULTY_INDEX].hearts;

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

export function createState(rng = Math.random) {
  return {
    // --- Game state machine: setup (start overlay), idle, running, dead ---
    gameState: 'idle',
    score: 0,
    highScore: 0,
    speed: INITIAL_SPEED,
    frameCount: 0,
    lastMilestone: 0,
    deathTime: 0,
    slowMode: false,
    playerName: null,  // chosen once on the start overlay; reused for every score submit
    touchDevice: false,  // set by main.js; switches HUD prompts to tap wording

    // --- Local high scores (loaded from storage at startup) ---
    highScores: [],

    // --- Dog ---
    dog: createDog(),

    // --- Hearts (extra lives) ---
    difficulty: DIFFICULTY_LEVELS[DEFAULT_DIFFICULTY_INDEX].label,  // label of the session difficulty; recorded with global scores
    startingHearts: DEFAULT_HEARTS,  // set by the start overlay's difficulty slider
    hearts: DEFAULT_HEARTS,
    invulnUntil: 0,   // timestamp: collisions are ignored until then (post-hit i-frames)
    heartLostAt: 0,   // timestamp of the last heart loss (drives the HUD blink)

    // --- Landing dust particles ---
    landingParticles: [],

    // --- Obstacles ---
    obstacles: [],
    nextObstacleIn: 100,
    lastObstacleType: 'hotdog',

    // --- Chase mode ---
    chaseActive: false,
    chasePending: false,   // waiting for obstacles to clear before chase starts
    chaseEntering: false,  // squirrel running in from right when chase starts
    chaseEscaping: false,  // squirrel running off-screen after chase ends
    chaseStartedFrame: 0,
    lastChaseEndScore: 0,
    squirrelEnterX: 0,
    squirrelEnterSpeed: 1.5,
    squirrelEscapeX: 0,
    squirrelEscapeSpeed: 1.5,

    // --- Boss chase ---
    bossPending: false,
    bossChasing: false,
    bossLosing: false,
    lastBossMilestone: 0,
    bossSquirrelX: BOSS_SQUIRREL_START_X,
    bossChaseFrames: 0,
    bossDogShift: 0,

    // --- Giant mode ---
    giantActive: false,
    giantStartTime: 0,
    giantGrowing: false,
    giantShrinking: false,
    giantTransitionStart: 0,
    giantScoreMultiplier: 1,
    lastGoldenSpawnScore: 0,
    giantChompEffects: [],  // [{x, y, startTime}]
    giantBonkEffects: [],   // [{x, y, vx, vy, rotation, rotSpeed, startTime}]
    birdJumpEffects: [],    // [{x, y, startTime}]

    // --- Weather ---
    weatherRain: false,
    lastTimeStage: 'day',   // track stage transitions for weather rolls
    rainDrops: [],

    // --- Scenery ---
    groundOffset: 0,
    clouds: createClouds(),
    flowers: createFlowers(rng),
    skyTop: 0,  // top of visible sky in world coords (≤0; set by the app-mode view)
  };
}

// Reset everything a fresh run needs. Shared by the idle→running and
// dead→running transitions in jump(). Music reset is the caller's job.
export function resetRun(state) {
  state.score = 0;
  state.lastMilestone = 0;
  state.speed = INITIAL_SPEED;
  state.obstacles = [];
  state.landingParticles = [];
  state.nextObstacleIn = 60;
  state.lastObstacleType = 'hotdog';

  state.hearts = state.startingHearts;
  state.invulnUntil = 0;
  state.heartLostAt = 0;

  state.dog.x = DOG_BASE_X;
  state.dog.y = GROUND_Y;
  state.dog.vy = 0;
  state.dog.jumping = false;
  state.dog.doubleJumped = false;
  state.dog.ducking = false;

  state.chaseActive = false;
  state.chasePending = false;
  state.chaseEntering = false;
  state.chaseEscaping = false;
  state.lastChaseEndScore = 0;

  state.bossPending = false;
  state.bossChasing = false;
  state.bossLosing = false;
  state.lastBossMilestone = 0;
  state.bossDogShift = 0;

  state.giantActive = false;
  state.giantGrowing = false;
  state.giantShrinking = false;
  state.giantScoreMultiplier = 1;
  state.giantChompEffects = [];
  state.giantBonkEffects = [];
  state.birdJumpEffects = [];
  state.lastGoldenSpawnScore = 0;

  state.weatherRain = false;
  state.rainDrops = [];
  state.lastTimeStage = 'day';
}
