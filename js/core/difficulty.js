// Lookups over DIFFICULTY_LEVELS and HYPER_LEVEL (config.js).

import { DIFFICULTY_LEVELS, DEFAULT_DIFFICULTY_INDEX, HYPER_LEVEL } from '../config.js';

export const DEFAULT_DIFFICULTY = DIFFICULTY_LEVELS[DEFAULT_DIFFICULTY_INDEX];

// The level at a slider index, falling back to the default for bad input.
export function difficultyAt(index) {
  return DIFFICULTY_LEVELS[index] ?? DEFAULT_DIFFICULTY;
}

// The leaderboard's boards: one per difficulty, and hyper mode's.
export const BOARD_LABELS = [...DIFFICULTY_LEVELS, HYPER_LEVEL].map(level => level.label);

export function isBoardLabel(label) {
  return BOARD_LABELS.includes(label);
}
