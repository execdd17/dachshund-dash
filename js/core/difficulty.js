// Lookups over DIFFICULTY_LEVELS (config.js).

import { DIFFICULTY_LEVELS, DEFAULT_DIFFICULTY_INDEX } from '../config.js';

export const DEFAULT_DIFFICULTY = DIFFICULTY_LEVELS[DEFAULT_DIFFICULTY_INDEX];

// The level at a slider index, falling back to the default for bad input.
export function difficultyAt(index) {
  return DIFFICULTY_LEVELS[index] ?? DEFAULT_DIFFICULTY;
}

export function isDifficultyLabel(label) {
  return DIFFICULTY_LEVELS.some(level => level.label === label);
}
