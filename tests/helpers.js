// Shared test utilities.

import { createSilentSfx } from '../js/audio/sfx.js';
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
    globalScores: { qualifies: () => false, submit: async () => {}, maybeRefresh: () => {} },
    showNameEntryOverlay: () => {},
    ...overrides,
  };
}
