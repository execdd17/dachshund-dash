// Obstacle spawning. All randomness goes through the injected rng so tests
// can drive spawn decisions deterministically.

import {
  W, SQUIRREL_OFFSET,
  MIN_OBSTACLE_GAP, MAX_OBSTACLE_GAP,
  GIANT_FIRST_AT, GIANT_COOLDOWN, GIANT_SPAWN_CHANCE,
  BIRD_LOW_Y, BIRD_HIGH_Y, BIRD_TRI_DX, BIRD_TRI_ROW2_DX,
  BIRD_WALL_MID_Y, BIRD_WALL_HIGH_Y,
  PATTERN_FIRST_AT, PATTERN_CHANCE, PATTERN_CLOSE_GAP, BIRD_WALL_FIRST_AT, SPAWN_MIX,
} from '../config.js';
import { giantBusy, anySceneBusy } from './encounters.js';
import { makeObstacle } from './obstacleTypes.js';

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
  return makeObstacle('bird', x, { y, skin, wallRow, ...extra });
}

const WALL = { aerialWall: true };

// Spawn kinds: what one spawn (or pattern beat) puts on the field.
const SPAWN_KINDS = {
  hotdog: (x, skin) => [makeObstacle('hotdog', x, { skin })],
  stack: (x, skin) => [makeObstacle('stack', x, { skin })],
  // Two frisbees, one above the other.
  frisbeePair: (x, skin) => {
    const low = makeObstacle('frisbee', x, { skin });
    return [low, makeObstacle('frisbee', x, { skin, y: low.y - low.height - 6 })];
  },
  bird: (x, skin) => [birdObs(x, BIRD_LOW_Y, skin)],
  // Two birds stacked with no vertical gap — blocks every jump timing.
  birdStack: (x, skin) => [birdObs(x, BIRD_HIGH_Y, skin, WALL), birdObs(x, BIRD_LOW_Y, skin, WALL)],
  // Low outer pair (duck) + mid/high staggered rows — no jump lane between tiers.
  birdTriangle: (x, skin) => [
    birdObs(x - BIRD_TRI_DX, BIRD_LOW_Y, skin, WALL),
    birdObs(x + BIRD_TRI_DX, BIRD_LOW_Y, skin, WALL),
    birdObs(x - BIRD_TRI_ROW2_DX, BIRD_WALL_MID_Y, skin, WALL),
    birdObs(x + BIRD_TRI_ROW2_DX, BIRD_WALL_MID_Y, skin, WALL),
    birdObs(x - BIRD_TRI_ROW2_DX, BIRD_WALL_HIGH_Y, skin, WALL),
    birdObs(x + BIRD_TRI_ROW2_DX, BIRD_WALL_HIGH_Y, skin, WALL),
  ],
};

function spawnKind(state, spawnX, skin, kind) {
  state.obstacles.push(...(SPAWN_KINDS[kind] ?? SPAWN_KINDS.hotdog)(spawnX, skin));
}

function patternEligible(state) {
  return !state.activeSpawnPattern && !anySceneBusy(state) && state.score >= PATTERN_FIRST_AT;
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
  spawnKind(state, spawnX, skin, beat.kind);
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
  const { stack, aerial, aerialSplit, frisbee } = SPAWN_MIX;
  let type = 'hotdog';
  const r = rng();
  if (state.score > stack.after && r < stack.below) {
    type = 'stack';
  } else if (state.score >= BIRD_WALL_FIRST_AT && r < aerial.below) {
    const r2 = rng();
    if (r2 < aerialSplit.birdStack) type = 'birdStack';
    else if (r2 < aerialSplit.birdTriangle) type = 'birdTriangle';
    else if (!state.chaseActive && r2 < aerialSplit.bird) type = 'bird';
    else type = 'frisbee';
  } else if (state.score > frisbee.after && r < frisbee.below) {
    type = 'frisbee';
  }

  if (type === 'frisbee') {
    const asBird = !state.chaseActive && rng() < SPAWN_MIX.frisbeeAsBird;
    spawnKind(state, spawnX, skin, asBird ? 'bird' : 'frisbeePair');
  } else {
    spawnKind(state, spawnX, skin, type);
  }

  if (type !== prevType) {
    state.nextObstacleIn = MIN_OBSTACLE_GAP * SPAWN_MIX.typeChangeGapMult + rng() * MAX_OBSTACLE_GAP;
  }
  state.lastObstacleType = type;
}

export function spawnObstacle(state, rng = Math.random) {
  // --- Golden hot dog spawn check ---
  const goldenEligible = !giantBusy(state) && !anySceneBusy(state)
    && state.score >= GIANT_FIRST_AT
    && state.score >= state.lastGoldenSpawnScore + GIANT_COOLDOWN
    && rng() < GIANT_SPAWN_CHANCE;
  if (goldenEligible) {
    state.activeSpawnPattern = null;
    state.obstacles.push(makeObstacle('golden', W + 10));
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
