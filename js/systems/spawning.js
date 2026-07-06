// Obstacle spawning. All randomness goes through the injected rng so tests
// can drive spawn decisions deterministically.

import {
  W, GROUND_Y, SQUIRREL_OFFSET,
  MIN_OBSTACLE_GAP, MAX_OBSTACLE_GAP,
  GIANT_FIRST_AT, GIANT_COOLDOWN, GIANT_SPAWN_CHANCE,
  BIRD_W, BIRD_H, BIRD_LOW_Y, BIRD_HIGH_Y, BIRD_TRI_DX, BIRD_TRI_ROW2_DX,
  BIRD_WALL_MID_Y, BIRD_WALL_HIGH_Y,
  PATTERN_FIRST_AT, PATTERN_CHANCE, PATTERN_CLOSE_GAP, BIRD_WALL_FIRST_AT,
} from '../config.js';
import { giantBusy, chaseBusy, bossBusy, trampBusy } from './encounters.js';

// Close-gap sequences: duck under the first beat, then answer the second
// (or jump the ground beat, then duck the aerial one). Gaps are short enough
// that staying airborne through both beats fails.
export const SPAWN_PATTERNS = [
  {
    id: 'frisbeeHotdog',
    minScore: 100,
    beats: [
      { kind: 'frisbeePair', gapAfter: PATTERN_CLOSE_GAP },
      { kind: 'hotdog' },
    ],
  },
  {
    id: 'hotdogFrisbee',
    minScore: 100,
    beats: [
      { kind: 'hotdog', gapAfter: PATTERN_CLOSE_GAP },
      { kind: 'frisbeePair' },
    ],
  },
  {
    id: 'birdStackHotdog',
    minScore: BIRD_WALL_FIRST_AT,
    beats: [
      { kind: 'birdStack', gapAfter: PATTERN_CLOSE_GAP },
      { kind: 'hotdog' },
    ],
  },
  {
    id: 'hotdogBirdStack',
    minScore: BIRD_WALL_FIRST_AT,
    beats: [
      { kind: 'hotdog', gapAfter: PATTERN_CLOSE_GAP },
      { kind: 'birdStack' },
    ],
  },
  {
    id: 'frisbeeBirdStack',
    minScore: BIRD_WALL_FIRST_AT + 20,
    beats: [
      { kind: 'frisbeePair', gapAfter: PATTERN_CLOSE_GAP },
      { kind: 'birdStack' },
    ],
  },
];

function birdObs(x, y, skin, extra = {}) {
  const wallRow = extra.wallRow ?? (
    y === BIRD_HIGH_Y || y === BIRD_WALL_HIGH_Y ? 'high'
      : y === BIRD_WALL_MID_Y ? 'mid'
        : y === BIRD_LOW_Y ? 'low'
          : undefined
  );
  return { x, y, width: BIRD_W, height: BIRD_H, type: 'bird', skin, wallRow, ...extra };
}

function pushHotdog(state, spawnX, skin) {
  state.obstacles.push({
    x: spawnX,
    y: GROUND_Y + 4,
    width: 36,
    height: 22,
    type: 'hotdog',
    skin,
  });
}

function pushStack(state, spawnX, skin) {
  state.obstacles.push({
    x: spawnX,
    y: GROUND_Y + 4 - 20,
    width: 36,
    height: 42,
    type: 'stack',
    skin,
  });
}

function pushFrisbeePair(state, spawnX, skin) {
  state.obstacles.push({
    x: spawnX,
    y: GROUND_Y - 12,
    width: 44,
    height: 14,
    type: 'frisbee',
    skin,
  });
  state.obstacles.push({
    x: spawnX,
    y: GROUND_Y - 12 - 14 - 6,
    width: 44,
    height: 14,
    type: 'frisbee',
    skin,
  });
}

function pushBird(state, spawnX, skin) {
  state.obstacles.push(birdObs(spawnX, BIRD_LOW_Y, skin));
}

// Two birds stacked with no vertical gap — blocks every jump timing.
function pushBirdStack(state, spawnX, skin) {
  const tag = { aerialWall: true };
  state.obstacles.push(birdObs(spawnX, BIRD_HIGH_Y, skin, tag));
  state.obstacles.push(birdObs(spawnX, BIRD_LOW_Y, skin, tag));
}

// Low outer pair (duck) + mid/high staggered rows — no jump lane between tiers.
function pushBirdTriangle(state, spawnX, skin) {
  const tag = { aerialWall: true };
  state.obstacles.push(birdObs(spawnX - BIRD_TRI_DX, BIRD_LOW_Y, skin, tag));
  state.obstacles.push(birdObs(spawnX + BIRD_TRI_DX, BIRD_LOW_Y, skin, tag));
  state.obstacles.push(birdObs(spawnX - BIRD_TRI_ROW2_DX, BIRD_WALL_MID_Y, skin, tag));
  state.obstacles.push(birdObs(spawnX + BIRD_TRI_ROW2_DX, BIRD_WALL_MID_Y, skin, tag));
  state.obstacles.push(birdObs(spawnX - BIRD_TRI_ROW2_DX, BIRD_WALL_HIGH_Y, skin, tag));
  state.obstacles.push(birdObs(spawnX + BIRD_TRI_ROW2_DX, BIRD_WALL_HIGH_Y, skin, tag));
}

function spawnKind(state, spawnX, skin, kind, rng) {
  switch (kind) {
    case 'hotdog':
      pushHotdog(state, spawnX, skin);
      break;
    case 'stack':
      pushStack(state, spawnX, skin);
      break;
    case 'frisbeePair':
      pushFrisbeePair(state, spawnX, skin);
      break;
    case 'bird':
      pushBird(state, spawnX, skin);
      break;
    case 'birdStack':
      pushBirdStack(state, spawnX, skin);
      break;
    case 'birdTriangle':
      pushBirdTriangle(state, spawnX, skin);
      break;
    default:
      pushHotdog(state, spawnX, skin);
  }
}

function patternEligible(state) {
  return !state.activeSpawnPattern
    && !state.chaseActive
    && !chaseBusy(state)
    && !bossBusy(state)
    && !trampBusy(state)
    && state.score >= PATTERN_FIRST_AT;
}

function tryStartPattern(state, rng) {
  if (!patternEligible(state) || rng() >= PATTERN_CHANCE) return null;
  const eligible = SPAWN_PATTERNS.filter(p => state.score >= p.minScore);
  if (!eligible.length) return null;
  return eligible[Math.floor(rng() * eligible.length)];
}

function spawnPatternBeat(state, spawnX, skin, rng) {
  const ap = state.activeSpawnPattern;
  const beat = ap.beats[ap.index];
  spawnKind(state, spawnX, skin, beat.kind, rng);
  state.lastObstacleType = beat.kind;

  const hasMore = ap.index + 1 < ap.beats.length;
  if (hasMore) {
    state.nextObstacleIn = beat.gapAfter ?? PATTERN_CLOSE_GAP;
    ap.index++;
    return;
  }

  state.activeSpawnPattern = null;
}

function spawnSingleton(state, spawnX, skin, rng) {
  const prevType = state.lastObstacleType;
  let type = 'hotdog';
  const r = rng();
  if (state.score > 150 && r < 0.15) {
    type = 'stack';
  } else if (state.score >= BIRD_WALL_FIRST_AT && r < 0.48) {
    // Aerial band: bird walls, single bird, or frisbee pair.
    const r2 = rng();
    if (r2 < 0.34) type = 'birdStack';
    else if (r2 < 0.67) type = 'birdTriangle';
    else if (!state.chaseActive && r2 < 0.82) type = 'bird';
    else type = 'frisbee';
  } else if (state.score > 80 && r < 0.40) {
    type = 'frisbee';
  }

  if (type === 'frisbee' && !state.chaseActive && rng() < 0.5) {
    spawnKind(state, spawnX, skin, 'bird', rng);
  } else if (type === 'frisbee') {
    spawnKind(state, spawnX, skin, 'frisbeePair', rng);
  } else {
    spawnKind(state, spawnX, skin, type, rng);
  }

  if (type !== prevType) {
    state.nextObstacleIn = MIN_OBSTACLE_GAP * 1.5 + rng() * MAX_OBSTACLE_GAP;
  }
  state.lastObstacleType = type;
}

export function spawnObstacle(state, rng = Math.random) {
  // --- Golden hot dog spawn check ---
  const goldenEligible = !giantBusy(state) && !chaseBusy(state) && !bossBusy(state)
    && !trampBusy(state)
    && state.score >= GIANT_FIRST_AT
    && state.score >= state.lastGoldenSpawnScore + GIANT_COOLDOWN
    && rng() < GIANT_SPAWN_CHANCE;
  if (goldenEligible) {
    state.activeSpawnPattern = null;
    state.obstacles.push({
      x: W + 10,
      y: GROUND_Y + 4,
      width: 36,
      height: 22,
      type: 'golden',
    });
    state.lastGoldenSpawnScore = state.score;
    state.nextObstacleIn = MIN_OBSTACLE_GAP + rng() * MAX_OBSTACLE_GAP;
    state.lastObstacleType = 'golden';
    return;
  }

  const spawnX = state.chaseActive ? (state.dog.x + SQUIRREL_OFFSET) : (W + 10);
  const skin = state.chaseActive ? 'chase' : undefined;

  if (!state.activeSpawnPattern) {
    const picked = tryStartPattern(state, rng);
    if (picked) {
      state.activeSpawnPattern = { id: picked.id, beats: picked.beats, index: 0 };
    }
  }

  if (state.activeSpawnPattern) {
    spawnPatternBeat(state, spawnX, skin, rng);
    return;
  }

  spawnSingleton(state, spawnX, skin, rng);
}
