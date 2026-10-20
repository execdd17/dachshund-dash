// The silent sfx stub is generated from the same table as the real one, so
// this guards the contract from the other side: every sound gameplay code
// asks for must exist in that table.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { SFX_NAMES, createSilentSfx } from '../js/audio/sfx.js';

test('every sfx method called by gameplay systems exists', () => {
  const dir = new URL('../js/systems/', import.meta.url);
  const called = new Set();
  for (const file of readdirSync(dir)) {
    for (const m of readFileSync(new URL(file, dir), 'utf8').matchAll(/sfx\.(play\w+)/g)) called.add(m[1]);
  }
  assert.ok(called.size > 5, 'scan found the sfx calls');
  for (const name of called) assert.ok(SFX_NAMES.includes(name), `${name} missing from SFX_NAMES`);
  const silent = createSilentSfx();
  for (const name of SFX_NAMES) assert.equal(typeof silent[name], 'function');
});
