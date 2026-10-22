// Biomes (render/biomes.js): when each one shows, the handover in the dark,
// and that every biome supplies the whole look the background draws from.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { BIOMES, biomeAt, isDim } from '../js/render/biomes.js';
import { getTimeOfDay, DAY_CYCLE } from '../js/core/timeOfDay.js';
import { BIOME_CYCLES, W } from '../js/config.js';
import { createFlowers } from '../js/core/state.js';

const STRETCH = BIOME_CYCLES * DAY_CYCLE;

test('a run starts in the first biome and holds it until its last night', () => {
  for (let score = 0; score < STRETCH - DAY_CYCLE / 2; score += 5) {
    const { from, to, k } = biomeAt(score);
    assert.equal(from, BIOMES[0], `score ${score}`);
    assert.equal(to, BIOMES[0]);
    assert.equal(k, 0);
  }
});

test('each biome hands over to the next only during a full night, smoothly, wrapping around', () => {
  let prev = biomeAt(0);
  const seen = [BIOMES[0]];
  for (let score = 1; score <= STRETCH * BIOMES.length; score++) {
    const now = biomeAt(score);
    if (now.k > 0) {
      assert.equal(getTimeOfDay(score).stage, 'night', `handover at ${score}`);
      assert.equal(now.to, BIOMES[(BIOMES.indexOf(now.from) + 1) % BIOMES.length], 'to the next biome');
    }
    // The blend only moves forward, a small step at a time (biome index + k, wrapping).
    const mix = s => BIOMES.indexOf(s.from) + s.k;
    const step = (mix(now) - mix(prev) + BIOMES.length) % BIOMES.length;
    assert.ok(step < 0.02, `score ${score}: jumped ${step}`);
    if (now.from !== seen.at(-1)) seen.push(now.from);
    prev = now;
  }
  assert.deepEqual(seen.map(b => b.id), [...BIOMES, BIOMES[0]].map(b => b.id), 'every biome in order, then around again');
});

test('the N debug key skips along the order', () => {
  assert.equal(biomeAt(0, 1).from, BIOMES[1 % BIOMES.length]);
  assert.equal(biomeAt(0, BIOMES.length).from, BIOMES[0]);
});

const isPalette = (p, check) => Array.isArray(p) && p.length === 4 && p.every(check);
const isHex = c => /^#[0-9A-F]{6}$/i.test(c);

test('every biome has a full look: palettes, hill layers, and decor', () => {
  const ids = new Set();
  for (const b of BIOMES) {
    assert.ok(!ids.has(b.id), `duplicate id ${b.id}`);
    ids.add(b.id);
    for (const group of ['sky', 'path', 'grass']) {
      for (const [name, palette] of Object.entries(b[group])) assert.ok(isPalette(palette, isHex), `${b.id}.${group}.${name}`);
    }
    assert.ok(isPalette(b.clouds.fill, isHex) && isPalette(b.clouds.shadow, isHex), `${b.id} cloud colors`);
    assert.ok(isPalette(b.clouds.highlight, Number.isFinite), `${b.id} cloud highlight`);
    // Layers blend by position with the next biome's, so every biome has the same count.
    assert.equal(b.hills.length, BIOMES[0].hills.length, `${b.id} hill layers`);
    b.hills.forEach((layer, n) => {
      assert.ok(isPalette(layer.fill, isHex), `${b.id} hill ${n} fill`);
      assert.ok(layer.step > 0 && layer.scroll > 0, `${b.id} hill ${n}`);
      for (let x = 0; x <= W; x += 50) assert.ok(Number.isFinite(layer.shape(x, 1234, layer.amp, layer.freq)));
      if (layer.details) assert.equal(typeof layer.details, 'function', `${b.id} hill ${n} details`);
      if (layer.trees) {
        layer.trees.forEach(([, palette], i) => assert.ok(isPalette(palette, isHex), `${b.id} hill ${n} tree ${i}`));
        assert.ok(Math.abs(layer.trees.reduce((sum, [share]) => sum + share, 0) - 1) < 1e-9, `${b.id} hill ${n} tree shares sum to 1`);
      }
    });
    assert.equal(typeof b.decor.draw, 'function');
    assert.ok(isPalette(b.decor.opacity, Number.isFinite), `${b.id} decor opacity`);
  }
});

test('every decor draws at every spot and time of day', () => {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (target, key) => (key in target ? target[key] : (...args) => { calls.push(key); assert.ok(args.every(a => typeof a !== 'number' || Number.isFinite(a))); }),
    set: (target, key, value) => { target[key] = value; return true; },
  });
  for (const b of BIOMES) {
    for (const phase of [0, 0.25, 0.5, 0.75]) {
      createFlowers(Math.random).forEach(f => b.decor.draw(ctx, f, f.x, phase));
    }
  }
  assert.ok(calls.length > 0);
  assert.ok(isDim(0.5) && !isDim(0) && !isDim(0.75));
});
