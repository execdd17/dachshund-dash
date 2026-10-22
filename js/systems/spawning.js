// Obstacle spawning. All randomness goes through the injected rng so tests
// can drive spawn decisions deterministically.

import {
  W, SQUIRREL_OFFSET,
  MIN_OBSTACLE_GAP, MAX_OBSTACLE_GAP,
  GIANT_FIRST_AT, GIANT_COOLDOWN, GIANT_SPAWN_CHANCE,
  BIRD_LOW_Y,
  PATTERN_FIRST_AT, PATTERN_CHANCE, PATTERN_CLOSE_GAP, BIRD_WALL_FIRST_AT, SPAWN_MIX,
} from '../config.js';
import { giantBusy, anySceneBusy } from './encounters.js';
import { isChaseActive } from './chase.js';
import { makeObstacle, towerSizeFor } from './obstacleTypes.js';
import { birdStack } from './birdWalls.js';

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

// Spawn kinds: what one spawn (or pattern beat) puts on the field.
const SPAWN_KINDS = {
  hotdog: (x, skin) => [makeObstacle('hotdog', x, { skin })],
  tower: (x, skin, speed) => [makeObstacle('tower', x, { skin, ...towerSizeFor(speed) })],
  // Two frisbees, one above the other.
  frisbeePair: (x, skin) => {
    const low = makeObstacle('frisbee', x, { skin });
    return [low, makeObstacle('frisbee', x, { skin, y: low.y - low.height - 6 })];
  },
  bird: (x, skin) => [makeObstacle('bird', x, { y: BIRD_LOW_Y, skin })],
  birdStack: (x, skin) => birdStack(x, { skin }),
};

function spawnKind(state, spawnX, skin, kind) {
  state.obstacles.push(...(SPAWN_KINDS[kind] ?? SPAWN_KINDS.hotdog)(spawnX, skin, state.speed));
}

function patternEligible(state) {
  return !state.activeSpawnPattern && !anySceneBusy(state) && state.score >= PATTERN_FIRST_AT;
}

export function patternChance(score) {
  const { start, full, fullAt } = PATTERN_CHANCE;
  if (score < PATTERN_FIRST_AT) return 0;
  return start + (full - start) * Math.min(1, (score - PATTERN_FIRST_AT) / (fullAt - PATTERN_FIRST_AT));
}

function tryStartPattern(state, rng) {
  if (!patternEligible(state) || rng() >= patternChance(state.score)) return null;
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
  const { tower, aerial, aerialSplit, frisbee } = SPAWN_MIX;
  let type = 'hotdog';
  const r = rng();
  if (state.score > tower.after && r < tower.below) {
    type = 'tower';
  } else if (state.score >= BIRD_WALL_FIRST_AT && r < aerial.below) {
    const r2 = rng();
    if (r2 < aerialSplit.birdStack) type = 'birdStack';
    else if (!isChaseActive(state) && r2 < aerialSplit.bird) type = 'bird';
    else type = 'frisbee';
  } else if (state.score > frisbee.after && r < frisbee.below) {
    type = 'frisbee';
  }

  if (type === 'frisbee') {
    const asBird = !isChaseActive(state) && rng() < SPAWN_MIX.frisbeeAsBird;
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
  // At most one golden in each stretch between two scenes, so giant mode
  // never chains or crowds the scenes out; and none while a boss waits for
  // its turn (giant mode's points would carry it far past its score, and up
  // against the frenzy's boss).
  const goldenEligible = !giantBusy(state) && !anySceneBusy(state) && !state.goldenSinceScene
    && !state.sceneQueue.includes('boss')
    && state.score >= GIANT_FIRST_AT
    && state.score >= state.lastGoldenScore + GIANT_COOLDOWN
    && rng() < GIANT_SPAWN_CHANCE;
  if (goldenEligible) {
    state.activeSpawnPattern = null;
    state.obstacles.push(makeObstacle('golden', W + 10));
    state.lastGoldenScore = state.score;
    state.goldenSinceScene = true;
    state.nextObstacleIn = MIN_OBSTACLE_GAP + rng() * MAX_OBSTACLE_GAP;
    state.lastObstacleType = 'golden';
    return;
  }

  const spawnX = isChaseActive(state) ? (state.dog.x + SQUIRREL_OFFSET) : (W + 10);
  const skin = isChaseActive(state) ? 'chase' : undefined;

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
