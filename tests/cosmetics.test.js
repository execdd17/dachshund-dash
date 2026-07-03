import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COSMETIC_SLOTS, COSMETIC_DEFS, HEAD_ANCHORS, getHeadAnchor,
  loadEquippedCosmetics, saveEquippedCosmetics, createCosmetics,
} from '../js/cosmetics/cosmetics.js';
import { EQUIPPED_COSMETICS_KEY } from '../js/config.js';
import { createFakeStorage } from './helpers.js';

test('getHeadAnchor: idle and dead fall back to run[0]', () => {
  assert.equal(getHeadAnchor('idle', 0), HEAD_ANCHORS.run[0]);
  assert.equal(getHeadAnchor('dead', 2), HEAD_ANCHORS.run[0]);
});

test('getHeadAnchor: doublejump frame 2 reuses jump[2]', () => {
  assert.equal(getHeadAnchor('doublejump', 2), HEAD_ANCHORS.jump[2]);
  assert.equal(getHeadAnchor('doublejump', 0), HEAD_ANCHORS.doublejump[0]);
});

test('getHeadAnchor wraps frame index within pose frames', () => {
  assert.equal(getHeadAnchor('run', 4), HEAD_ANCHORS.run[1]);
  assert.equal(getHeadAnchor('slide', 3), HEAD_ANCHORS.slide[0]);
});

test('equipped cosmetics round-trip through storage', () => {
  const storage = createFakeStorage();
  saveEquippedCosmetics(storage, { hat: 'wizard', sunglasses: null, clothes: null });
  assert.deepEqual(loadEquippedCosmetics(storage), { hat: 'wizard', sunglasses: null, clothes: null });
});

test('loadEquippedCosmetics falls back on junk data and ignores unknown keys', () => {
  const fallback = { hat: null, sunglasses: null, clothes: null };
  const storage = createFakeStorage();
  assert.deepEqual(loadEquippedCosmetics(storage), fallback);

  storage.setItem(EQUIPPED_COSMETICS_KEY, 'garbage');
  assert.deepEqual(loadEquippedCosmetics(storage), fallback);

  storage.setItem(EQUIPPED_COSMETICS_KEY, JSON.stringify({ hat: 'wizard', bogus: 'x', sunglasses: 42 }));
  assert.deepEqual(loadEquippedCosmetics(storage), { hat: 'wizard', sunglasses: null, clothes: null });
});

test('cosmetics service select() persists and toggleDefaultHat() flips', () => {
  const storage = createFakeStorage();
  const cosmetics = createCosmetics(storage);
  assert.equal(cosmetics.equipped.hat, null);

  cosmetics.select('hat', 'wizard');
  assert.equal(loadEquippedCosmetics(storage).hat, 'wizard');

  cosmetics.toggleDefaultHat();
  assert.equal(cosmetics.equipped.hat, null);
  cosmetics.toggleDefaultHat();
  assert.equal(cosmetics.equipped.hat, 'wizard');

  // empty itemId (the "None" tile) clears the slot
  cosmetics.select('hat', '');
  assert.equal(cosmetics.equipped.hat, null);
});

test('every slot has a defs entry', () => {
  COSMETIC_SLOTS.forEach(slot => assert.ok(Array.isArray(COSMETIC_DEFS[slot])));
});
