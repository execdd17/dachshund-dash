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
// collect: what a pickup does — 'giant' (giant mode), 'heart' (restores a heart), 'flight'
//   (the flight scene's cape), or 'bone' (+BONE_POINTS; in giant mode, GIANT_BONE_POINTS
//   times the streak level); see collision.js.
// giant: what giant mode does to a hazard — 'eat' (+GIANT_EAT_BONUS), 'fetch' (a bone: +GIANT_BONE_POINTS
//   times the streak level), or 'bonk' (knocked away; only scene terrain, which giant mode never meets).
// aerial: flying obstacles; chase mode re-skins them as acorns at duck height.
//
// Any obstacle can also bob: made with `bob: { amp, period, phase }`, it
// moves up and down around its starting y (see stepBob).

import {
  GROUND_Y, BIRD_W, BIRD_H, ACORN_W, ACORN_H, CHASE_ACORN_Y, TRAMP_TILE_W, TOWER_BARS, TOWER_TALL_FROM_SPEED,
  TUNNEL_DEPTH, TUNNEL_HOLE_W, BONE_W, BONE_H,
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
  frisbee: { width: 44, height: 14, y: GROUND_Y - 12, inset: AERIAL_INSET, contact: 'hazard', giant: 'fetch', aerial: true },
  bird: { width: BIRD_W, height: BIRD_H, inset: BIRD_INSET, contact: 'hazard', giant: 'fetch', aerial: true },
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
  // The tunnel scene (systems/tunnel.js). The tunnel runs under the path
  // (spawnTunnel sizes it to its holes); the holes are just doorways.
  tunnel: { width: 200, height: 32, y: GROUND_Y + 18, inset: DEFAULT_INSET, contact: 'none' },
  tunnelHole: { width: TUNNEL_HOLE_W, height: 8, y: GROUND_Y + 14, inset: DEFAULT_INSET, contact: 'none' },
  // Taller than a double jump reaches (its hitbox top sits above a double
  // jump's lowest hitbox bottom), so the only way past is underneath.
  hedge: { width: 34, height: 220, y: GROUND_Y + 26 - 220, inset: { dx: 5, dy: 6, dw: 10, dh: 6 }, contact: 'hazard', giant: 'bonk' },
  // Sits in the bore at the crawling dog's height, below anything a dog on
  // the surface can touch (and the crawling dog is below every surface hitbox).
  rock: { width: 28, height: 18, y: GROUND_Y + 6 + TUNNEL_DEPTH, inset: { dx: 3, dy: 2, dw: 6, dh: 4 }, contact: 'hazard', giant: 'bonk' },
  // A warning sign planted in the path above each rock (scenery: it stays put when the rock is bonked).
  rockSign: { width: 18, height: 24, y: GROUND_Y - 1, inset: DEFAULT_INSET, contact: 'none' },
  // The flight scene's Hero Cape, floating at running height: a ducking dog
  // still reaches it, and only a jump timed over it misses.
  cape: { width: 30, height: 30, y: GROUND_Y - 14, inset: { dx: 0, dy: 0, dw: 0, dh: 0 }, contact: 'pickup', collect: 'flight' },
  // The one collectible: it floats at jump height over the tunnel's surface
  // route (its default y), sits in the flight's open lanes, and makes up
  // giant mode's bone round (giantBones.js, at GIANT_BONE_W × GIANT_BONE_H).
  bone: { width: BONE_W, height: BONE_H, y: GROUND_Y - 50, inset: { dx: 0, dy: 0, dw: 0, dh: 0 }, contact: 'pickup', collect: 'bone' },
};

// A new obstacle of `type` at x with the type's default size and height;
// overrides (y, width, skin, wall tags…) are merged on top.
export function makeObstacle(type, x, overrides = {}) {
  const def = OBSTACLE_TYPES[type];
  const obs = { type, x, y: def.y, width: def.width, height: def.height, ...overrides };
  if (obs.bob) obs.bob = { phase: 0, ...obs.bob, baseY: obs.y, t: 0 };
  return obs;
}

// One frame of a bobbing obstacle: `amp` px above and below where it was
// made, one cycle per `period` baseline frames, starting `phase` (0–1) into
// the cycle. It moves on game time (scale), so any frame rate sees the same
// path, and its hitbox moves with it.
export function stepBob(obs, scale) {
  const b = obs.bob;
  b.t += scale;
  obs.y = b.baseY + Math.sin((b.t / b.period + b.phase) * 2 * Math.PI) * b.amp;
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
