import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  COSMETIC_SLOTS, COSMETIC_DEFS, HEAD_ANCHORS, SLOT_ANCHOR_OFFSET,
  getHeadAnchor, getItemAnchorOffset, getOverlayFrame,
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
  saveEquippedCosmetics(storage, { hat: 'wizard', sunglasses: null, clothes: null, body: null });
  assert.deepEqual(loadEquippedCosmetics(storage), { hat: 'wizard', sunglasses: null, clothes: null, body: null });
});

test('loadEquippedCosmetics falls back on junk data and ignores unknown keys', () => {
  const fallback = { hat: null, sunglasses: null, clothes: null, body: null };
  const storage = createFakeStorage();
  assert.deepEqual(loadEquippedCosmetics(storage), fallback);

  storage.setItem(EQUIPPED_COSMETICS_KEY, 'garbage');
  assert.deepEqual(loadEquippedCosmetics(storage), fallback);

  storage.setItem(EQUIPPED_COSMETICS_KEY, JSON.stringify({ hat: 'wizard', bogus: 'x', sunglasses: 42 }));
  assert.deepEqual(loadEquippedCosmetics(storage), { hat: 'wizard', sunglasses: null, clothes: null, body: null });
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

test('getItemAnchorOffset merges per-item overrides onto the slot offset', () => {
  // aviator has no override: slot offset comes back as-is
  assert.deepEqual(getItemAnchorOffset('sunglasses', 'aviator'), SLOT_ANCHOR_OFFSET.sunglasses);
  // heart overrides scale only; dx/dy/angleOffset stay from the slot
  const heart = getItemAnchorOffset('sunglasses', 'heart');
  assert.equal(heart.scale, 0.27);
  assert.equal(heart.dx, SLOT_ANCHOR_OFFSET.sunglasses.dx);
  assert.equal(heart.dy, SLOT_ANCHOR_OFFSET.sunglasses.dy);
  // unknown item falls back to the slot offset
  assert.deepEqual(getItemAnchorOffset('hat', 'nope'), SLOT_ANCHOR_OFFSET.hat);
});

test('every item has id/name/image and ids are unique within a slot', () => {
  COSMETIC_SLOTS.forEach(slot => {
    const ids = new Set();
    COSMETIC_DEFS[slot].forEach(item => {
      assert.ok(item.id && typeof item.id === 'string', `${slot} item missing id`);
      assert.ok(item.name && typeof item.name === 'string', `${slot}/${item.id} missing name`);
      assert.match(item.image, new RegExp(`^png/`), `${slot}/${item.id} image not under png/`);
      assert.ok(!ids.has(item.id), `duplicate id ${item.id} in slot ${slot}`);
      ids.add(item.id);
    });
  });
});

test('getOverlayFrame mirrors base-sprite frame selection', () => {
  const entry = {
    frames: {
      run: ['r0', 'r1', 'r2'],
      jump: ['j0', 'j1', 'j2'],
      doublejump: ['d0', 'd1', 'd2'],
      slide: ['s0', 's1', 's2'],
    },
    biteSheet: 'sheet',
  };
  assert.equal(getOverlayFrame(entry, 'run', 1), 'r1');
  assert.equal(getOverlayFrame(entry, 'run', 4), 'r1');            // wraps
  assert.equal(getOverlayFrame(entry, 'idle', 0), 'r0');           // idle/dead -> run[0]
  assert.equal(getOverlayFrame(entry, 'dead', 2), 'r0');
  assert.equal(getOverlayFrame(entry, 'doublejump', 2), 'j2');     // flip frame 2 reuses jump[2]
  assert.equal(getOverlayFrame(entry, 'doublejump', 0), 'd0');
  assert.equal(getOverlayFrame(entry, 'bite', 1), null);           // bite drawn via biteSheet
  assert.equal(getOverlayFrame(null, 'run', 0), null);
  assert.equal(getOverlayFrame({}, 'run', 0), null);               // anchor items have no frames
});

test('per-frame clothes and body items declare a frames dir under png/', () => {
  [...COSMETIC_DEFS.clothes, ...COSMETIC_DEFS.body].forEach(item => {
    assert.match(item.frames, /^png\//, `${item.id} frames not under png/`);
  });
});
