// The effects list: each kind ages out at its own lifetime, bonks tumble, and
// every kind has a drawer.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { EFFECT_KINDS, addEffect, updateEffects, effectsOfKind } from '../js/systems/effects.js';
import { EFFECT_DRAWERS } from '../js/render/effects.js';
import { createState } from '../js/core/state.js';

test('each effect kind expires at its own lifetime', () => {
  for (const [kind, { ttl }] of Object.entries(EFFECT_KINDS)) {
    const state = createState(() => 0.5);
    addEffect(state, kind, 1000, { x: 0, y: 0, vx: 0, vy: 0, rotation: 0, rotSpeed: 0 });
    updateEffects(state, 1, 1000 + ttl - 1);
    assert.equal(effectsOfKind(state, kind).length, 1, `${kind} alive just before ${ttl}ms`);
    updateEffects(state, 1, 1000 + ttl);
    assert.equal(state.effects.length, 0, `${kind} gone at ${ttl}ms`);
  }
});

test('a bonked obstacle tumbles under gravity', () => {
  const state = createState(() => 0.5);
  addEffect(state, 'bonk', 0, { x: 10, y: 50, vx: 3, vy: -6, rotation: 0, rotSpeed: 0.5 });
  updateEffects(state, 2, 1);
  const [e] = state.effects;
  assert.deepEqual([e.x, e.y, e.vy, e.rotation], [16, 38, -5.4, 1]);
});

test('every effect kind has exactly one drawer', () => {
  assert.deepEqual(Object.keys(EFFECT_DRAWERS).sort(), Object.keys(EFFECT_KINDS).sort());
});
