// Shared test utilities.

import { createSilentSfx } from '../js/audio/sfx.js';
import { scoreAtSpeed } from '../js/core/speed.js';
import { SPEED_PROFILES } from '../js/config.js';
import { createSilentMusic } from '../js/audio/music.js';

// Minimal localStorage stand-in.
export function createFakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    dump: () => Object.fromEntries(map),
  };
}

// Deterministic rng that cycles through the provided values.
export function createSequenceRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

// Full services object accepted by update()/checkCollision()/killDog().
export function createTestServices(overrides = {}) {
  return {
    sfx: createSilentSfx(),
    music: createSilentMusic(),
    recordRun: () => {},
    tutorialSeen: () => {},
    ...overrides,
  };
}

// The normal-run score at `speed`: the bosses and the frenzy are set by speed
// (core/speed.js), and tests mostly set a run's score.
export const normalScoreAt = speed => Math.round(scoreAtSpeed(speed, SPEED_PROFILES.normal));
