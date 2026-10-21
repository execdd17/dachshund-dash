// Obstacle type registry: everything gameplay needs to know about each type
// — default size and placement, hitbox inset, and what touching it does —
// in one table. A new obstacle type is one entry here plus a look in
// render/obstacles.js (OBSTACLE_LOOKS).
//
// contact:
//   'hazard'  — costs a heart and is knocked away (or eaten/bonked in giant mode)
//   'terrain' — costs a heart but stays put; a rising dog passes over it
//   'pickup'  — collected on touch, even during i-frames
//   'none'    — never harmful
// collect: what a pickup does — 'giant' (giant mode) or 'heart' (restores a heart); see collision.js.
// giant: what giant mode does to a hazard — 'eat' (+GIANT_EAT_BONUS) or 'bonk' (+GIANT_BONK_BONUS).
// aerial: flying obstacles; chase mode re-skins them as acorns at duck height.

import {
  GROUND_Y, BIRD_W, BIRD_H, ACORN_W, ACORN_H, CHASE_ACORN_Y, TRAMP_TILE_W, TOWER_BARS, TOWER_TALL_FROM_SPEED,
} from '../config.js';

// Hitbox insets from the obstacle's box: x + dx, y + dy, width - dw, height - dh.
const DEFAULT_INSET = { dx: 12, dy: 8, dw: 24, dh: 10 };
const AERIAL_INSET = { dx: 6, dy: 2, dw: 12, dh: 4 };
// Birds fly left, so the trailing edge is the tail: thin feathers riding
// above the feet and wings, drawn past the hitbox rather than inside it.
const BIRD_INSET = { dx: 6, dy: 2, dw: 16, dh: 4 };
// A tower of `bars` bars, 20px apart, standing on the ground line.
export function towerSize(bars) {
  const height = 22 + 20 * (bars - 1);
  return { height, y: GROUND_Y + 26 - height };
}

// The tower's size at a game speed: taller once speed makes a short one jumpable.
export function towerSizeFor(speed) {
  return towerSize(speed < TOWER_TALL_FROM_SPEED ? TOWER_BARS.short : TOWER_BARS.tall);
}
const TOWER = towerSize(TOWER_BARS.tall);

export const OBSTACLE_TYPES = {
  // Drawn as a chocolate bar normally and as a hot dog in giant mode.
  hotdog: { width: 36, height: 22, y: GROUND_Y + 4, inset: DEFAULT_INSET, contact: 'hazard', giant: 'eat' },
  frisbee: { width: 44, height: 14, y: GROUND_Y - 12, inset: AERIAL_INSET, contact: 'hazard', giant: 'bonk', aerial: true },
  bird: { width: BIRD_W, height: BIRD_H, inset: BIRD_INSET, contact: 'hazard', giant: 'bonk', aerial: true },
  golden: { width: 36, height: 22, y: GROUND_Y + 4, inset: DEFAULT_INSET, contact: 'pickup', collect: 'giant' },
  // Floats in the sky over the last trampoline rep, at TRAMP_REPS[].heart.y.
  heart: { width: 21, height: 18, inset: { dx: 1, dy: 1, dw: 3, dh: 2 }, contact: 'pickup', collect: 'heart' },
  // Top inset (+14) puts the hitbox top exactly at ground level, which is
  // also the trampoline bounce-trigger height: on any frame where thorns
  // could hurt a descending dog, a bounce in range has already fired
  // (updateTrampoline runs first), so island-edge landings never clip the
  // neighboring tile.
  thorns: { width: TRAMP_TILE_W, height: 30, y: GROUND_Y - 14, inset: { dx: 4, dy: 14, dw: 8, dh: 14 }, contact: 'terrain' },
  trampoline: { height: 12, y: GROUND_Y - 12, inset: DEFAULT_INSET, contact: 'none' },
  // Too tall for one jump: the double-jump obstacle. Spawned at towerSizeFor(speed).
  tower: { width: 36, ...TOWER, inset: { dx: 8, dy: 4, dw: 16, dh: 6 }, contact: 'hazard', giant: 'eat' },
};

// A new obstacle of `type` at x with the type's default size and height;
// overrides (y, width, skin, wall tags…) are merged on top.
export function makeObstacle(type, x, overrides = {}) {
  const def = OBSTACLE_TYPES[type];
  return { type, x, y: def.y, width: def.width, height: def.height, ...overrides };
}

export function isAerial(obs) {
  return Boolean(OBSTACLE_TYPES[obs.type]?.aerial);
}

// Where a chase-skinned aerial's acorn sits: solo aerials and low wall rows
// drop to duck height; higher wall rows keep their own y.
export function chaseAcornY(obs) {
  return obs.aerialWall && obs.wallRow !== 'low' ? obs.y : CHASE_ACORN_Y;
}

function insetBox(x, y, width, height, { dx, dy, dw, dh }) {
  return { x: x + dx, y: y + dy, w: width - dw, h: height - dh };
}

export function getObstacleHitbox(obs) {
  if (obs.skin === 'chase' && isAerial(obs)) {
    return insetBox(obs.x, chaseAcornY(obs), ACORN_W, ACORN_H, DEFAULT_INSET);
  }
  return insetBox(obs.x, obs.y, obs.width, obs.height, OBSTACLE_TYPES[obs.type].inset);
}
