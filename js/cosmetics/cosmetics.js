// Cosmetics: slot/item definitions, head-anchor data, and equipped-state
// persistence. Extensible: hat / sunglasses / clothes slots, stack together.
// Adding a new item = adding an entry to COSMETIC_DEFS (plus its PNG).
//
// Everything here except createCosmetics().loadImages() is pure / storage-
// injected, so it runs under Node for tests.

import { EQUIPPED_COSMETICS_KEY } from '../config.js';

export const COSMETIC_SLOTS = ['hat', 'sunglasses', 'clothes']; // canonical slot list + menu tab order
export const COSMETIC_DRAW_ORDER = ['clothes', 'hat', 'sunglasses']; // back-to-front compositing order
export const COSMETIC_SLOT_LABELS = { hat: 'HAT', sunglasses: 'SUNGLASSES', clothes: 'CLOTHES' };

export const COSMETIC_DEFS = {
  hat: [
    { id: 'wizard', name: 'Wizard Hat', image: 'png/hats/Purple Wizard Hat/pixel-art-purple-hat-free-png.png' },
  ],
  sunglasses: [
    { id: 'aviator', name: 'Aviators', image: 'png/sunglasses/aviator.png' },
  ],
  clothes: [],
};

// Where the dog's head is in each pose, in the same local 512x1024 sprite-pixel
// space as the base dachshund frames. Live-calibrated against the actual
// running game (screenshots + a static-render harness reproducing the exact
// drawCosmeticOverlay math), per pose and sub-frame.
export const HEAD_ANCHORS = {
  run:        [{ x: 340, y: 400, angle: -6 },  { x: 318, y: 402, angle: -3 },  { x: 303, y: 406, angle: -8 }],
  jump:       [{ x: 353, y: 330, angle: -15 }, { x: 343, y: 357, angle: -8 }, { x: 278, y: 387, angle: -3 }],
  doublejump: [{ x: 418, y: 482, angle: 20 },  { x: 313, y: 482, angle: -150 }], // index 2 reuses jump[2], see getHeadAnchor
  slide:      [{ x: 343, y: 462, angle: -4 },  { x: 318, y: 477, angle: -2 },  { x: 303, y: 482, angle: -4 }],
  bite:       [{ x: 338, y: 467, angle: -6 },  { x: 263, y: 367, angle: -25 }, { x: 343, y: 532, angle: -6 }],
};

// Per-slot fine-tune relative to the shared head anchor above (hat sits above
// the crown, sunglasses sit at eye level). Live-calibrated.
export const SLOT_ANCHOR_OFFSET = {
  hat:        { dx: 0,  dy: -38, angleOffset: 0, scale: 0.68 },
  sunglasses: { dx: 12, dy: 38,  angleOffset: 0, scale: 0.20 },
};

// anim/frameIdx use the exact same values as getDogSpriteAnim()/dogSpriteFrame
// (or getDogJumpFrameIndex() for jump/doublejump) that drawDachshundSprite computes.
export function getHeadAnchor(anim, frameIdx) {
  if (anim === 'idle' || anim === 'dead') return HEAD_ANCHORS.run[0];
  if (anim === 'doublejump' && frameIdx === 2) return HEAD_ANCHORS.jump[2];
  const frames = HEAD_ANCHORS[anim];
  return frames[frameIdx % frames.length];
}

export function loadEquippedCosmetics(storage) {
  const fallback = { hat: null, sunglasses: null, clothes: null };
  try {
    const raw = storage.getItem(EQUIPPED_COSMETICS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return fallback;
    const result = { ...fallback };
    COSMETIC_SLOTS.forEach(slot => {
      if (typeof parsed[slot] === 'string') result[slot] = parsed[slot];
    });
    return result;
  } catch {
    return fallback;
  }
}

export function saveEquippedCosmetics(storage, state) {
  try {
    storage.setItem(EQUIPPED_COSMETICS_KEY, JSON.stringify(state));
  } catch (_) {}
}

// Runtime cosmetics service: equipped state + loaded overlay images.
export function createCosmetics(storage) {
  const imageById = { hat: {}, sunglasses: {}, clothes: {} };
  const service = {
    equipped: loadEquippedCosmetics(storage),
    imageById,

    // Cosmetic overlay images: one isolated image per item, positioned at
    // render time via HEAD_ANCHORS + SLOT_ANCHOR_OFFSET (see getHeadAnchor /
    // drawCosmeticOverlay). Browser-only.
    loadImages() {
      COSMETIC_SLOTS.forEach(slot => {
        COSMETIC_DEFS[slot].forEach(item => {
          const img = new Image();
          img.src = item.image;
          imageById[slot][item.id] = img;
        });
      });
    },

    select(slot, itemId) {
      service.equipped[slot] = itemId || null;
      saveEquippedCosmetics(storage, service.equipped);
    },

    // Debug 'H' key: toggle the default hat on/off.
    toggleDefaultHat() {
      const defaultHatId = COSMETIC_DEFS.hat[0]?.id ?? null;
      service.equipped.hat = service.equipped.hat ? null : defaultHatId;
      saveEquippedCosmetics(storage, service.equipped);
    },
  };
  return service;
}
