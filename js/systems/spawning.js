// Obstacle spawning. All randomness goes through the injected rng so tests
// can drive spawn decisions deterministically.

import {
  W, GROUND_Y, SQUIRREL_OFFSET,
  MIN_OBSTACLE_GAP, MAX_OBSTACLE_GAP,
  GIANT_FIRST_AT, GIANT_COOLDOWN, GIANT_SPAWN_CHANCE,
} from '../config.js';
import { giantBusy, chaseBusy, bossBusy, trampBusy } from './encounters.js';

export function spawnObstacle(state, rng = Math.random) {
  // --- Golden hot dog spawn check ---
  const goldenEligible = !giantBusy(state) && !chaseBusy(state) && !bossBusy(state)
    && !trampBusy(state)
    && state.score >= GIANT_FIRST_AT
    && state.score >= state.lastGoldenSpawnScore + GIANT_COOLDOWN
    && rng() < GIANT_SPAWN_CHANCE;
  if (goldenEligible) {
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

  let type = 'hotdog';
  const r = rng();
  if (state.score > 150 && r < 0.15) {
    type = 'stack';
  } else if (state.score > 80 && r < 0.40) {
    type = 'frisbee';
  }

  const spawnX = state.chaseActive ? (state.dog.x + SQUIRREL_OFFSET) : (W + 10);
  const skin = state.chaseActive ? 'chase' : undefined;

  if (type === 'frisbee' && !state.chaseActive && rng() < 0.5) {
    // Single bird (duck-under, scaled 1.5x so it can't be jumped over)
    state.obstacles.push({
      x: spawnX,
      y: GROUND_Y - 49,
      width: 66,
      height: 51,
      type: 'bird',
      skin,
    });
  } else if (type === 'frisbee') {
    // Lower frisbee (duck-under)
    state.obstacles.push({
      x: spawnX,
      y: GROUND_Y - 12,
      width: 44,
      height: 14,
      type: 'frisbee',
      skin,
    });
    // Upper frisbee stacked above — discourages jumping over
    state.obstacles.push({
      x: spawnX,
      y: GROUND_Y - 12 - 14 - 6,
      width: 44,
      height: 14,
      type: 'frisbee',
      skin,
    });
  } else if (type === 'stack') {
    state.obstacles.push({
      x: spawnX,
      y: GROUND_Y + 4 - 20,
      width: 36,
      height: 42,
      type: 'stack',
      skin,
    });
  } else {
    state.obstacles.push({
      x: spawnX,
      y: GROUND_Y + 4,
      width: 36,
      height: 22,
      type: 'hotdog',
      skin,
    });
  }

  // When switching types, give extra gap so player can react
  if (type !== state.lastObstacleType) {
    state.nextObstacleIn = MIN_OBSTACLE_GAP * 1.5 + rng() * MAX_OBSTACLE_GAP;
  }
  state.lastObstacleType = type;
}
