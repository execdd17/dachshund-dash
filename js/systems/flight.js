// Flight scene: a Hero Cape floats in at running height (a ducking dog still
// gets it; only a jump timed over it misses). Grabbing it puts it on the dog,
// the camera pans up, and the dog rises to the middle of three sky lanes
// while a row of bird gates comes through: jump moves up a lane, duck moves
// down one. Bones sometimes sit in an open lane. A missed cape ends the
// scene and tries again after half the cooldown.
//   pending → cape → rising → active → landing

import {
  W, H, GROUND_Y, MIN_OBSTACLE_GAP, BONE_H,
  FLIGHT_FIRST_AT, FLIGHT_COOLDOWN, FLIGHT_LANES as LANES, FLIGHT_HUD_BAND,
  FLIGHT_RISE_FRAMES, FLIGHT_LAND_FRAMES, FLIGHT_GLIDE_PER_FRAME,
  FLIGHT_GATES, FLIGHT_GATE_BEAT_FRAMES, FLIGHT_EASY_GATES, FLIGHT_BONE_CHANCE,
} from '../config.js';
import { makeObstacle } from './obstacleTypes.js';
import { addEffect } from './effects.js';
import { sceneMemory, scoreCooldownTrigger } from './encounters.js';

// Centers an obstacle's hitbox on a lane (the dog's hitbox center is dog.y + 3).
const BIRD_Y = lane => LANES[lane] - 21.5;
const BONE_Y = lane => LANES[lane] + 3 - BONE_H / 2;

// How far the camera pans up so the lanes center in the screen below the
// HUD. Taller screens show more sky (state.skyTop), so they pan less.
function fullLift(state) {
  const extraTop = -(state.skyTop ?? 0);
  const lanesMid = (LANES[0] + LANES[LANES.length - 1]) / 2 + 3;
  const screenMid = (FLIGHT_HUD_BAND + extraTop + H) / 2;
  return Math.max(0, screenMid - extraTop - lanesMid);
}

const ease = k => k * k * (3 - 2 * k);
const lerp = (a, b, k) => a + (b - a) * k;

// A little cloud of `n` puffs left behind at (x, y).
function puff(state, x, y, n, color = 'rgba(255, 255, 255, 0.85)') {
  for (let i = 0; i < n; i++) {
    const spread = i - (n - 1) / 2;
    state.landingParticles.push({
      x: x + spread * 3, y: y + (i % 3) * 3 - 3,
      vx: -1.2 - (i % 2) * 0.6, vy: -0.6 + spread * 0.15,
      life: 1, color, size: 2.5 + (i % 2),
    });
  }
}

// The cape's pickup action (collision.js): on with the cape, and up.
export function grabCape(state, services, now) {
  const scene = state.scene;
  if (scene?.id !== 'flight' || scene.phase !== 'cape') return;
  Object.assign(scene, { phase: 'rising', t: 0, fromY: state.dog.y });
  Object.assign(state.dog, {
    flying: true, jumping: true, doubleJumped: false, ducking: false, fastFalling: false, vy: 0,
  });
  puff(state, state.dog.x + 45, GROUND_Y + 14, 9);
  addEffect(state, 'flightCall', now);
  services.sfx.playLiftoff();
}

// Jump (-1) or duck (+1) while flying.
export function steerFlight(state, dir, services) {
  const scene = state.scene;
  if (scene?.id !== 'flight' || scene.phase !== 'active') return;
  const lane = Math.max(0, Math.min(LANES.length - 1, scene.lane + dir));
  if (lane === scene.lane) return;
  scene.lane = lane;
  state.flightHintPending = false;
  puff(state, state.dog.x + 28, state.dog.y + 4, 5);
  if (dir < 0) services.sfx.playWhooshUp(); else services.sfx.playWhooshDown();
}

// FLIGHT_GATES gates from the right edge, one beat apart. The first few put a
// bird in one lane, the rest in all but one; a bone sometimes sits in a lane
// left open.
export function spawnGates(state, rng) {
  const beat = FLIGHT_GATE_BEAT_FRAMES * state.speed;
  for (let g = 0; g < FLIGHT_GATES; g++) {
    const x = W + 40 + g * beat;
    const lanes = [0, 1, 2].sort(() => rng() - 0.5);
    const [open, ...rest] = lanes;
    const blocked = g < FLIGHT_EASY_GATES ? rest.slice(0, 1) : rest;
    for (const lane of blocked) {
      state.obstacles.push(makeObstacle('bird', x, { y: BIRD_Y(lane), aerialWall: true }));
    }
    if (rng() < FLIGHT_BONE_CHANCE) {
      state.obstacles.push(makeObstacle('bone', x + 20, { y: BONE_Y(open) }));
    }
  }
}

function glide(dog, targetY, step) {
  const d = targetY - dog.y;
  dog.y += Math.sign(d) * Math.min(Math.abs(d), step);
}

// Back to normal play, with `cooldown` points until the next try.
function finish(state, cooldown) {
  sceneMemory(state, 'flight').lastEndScore = Math.max(1, state.score - (FLIGHT_COOLDOWN - cooldown));
  state.nextObstacleIn = MIN_OBSTACLE_GAP;
  return 'done';
}

export const flightScene = {
  id: 'flight',
  quietPhases: ['cape', 'rising', 'active', 'landing'],
  initialData: () => ({ lift: 0, t: 0, lane: 1, fromY: GROUND_Y }),
  wantsTurn: (state, memory) => scoreCooldownTrigger(state, memory, FLIGHT_FIRST_AT, FLIGHT_COOLDOWN),

  start(state, scene) {
    scene.phase = 'cape';
    state.obstacles.push(makeObstacle('cape', W + 10));
  },

  phases: {
    // Waits for the grab (grabCape moves on to 'rising'); a cape that
    // scrolls off was missed.
    cape(state) {
      if (state.obstacles.some(o => o.type === 'cape')) return undefined;
      return finish(state, FLIGHT_COOLDOWN / 2);
    },

    rising(state, scene, { scale, rng }) {
      scene.t += scale;
      const k = ease(Math.min(1, scene.t / FLIGHT_RISE_FRAMES));
      scene.lift = fullLift(state) * k;
      state.dog.y = lerp(scene.fromY, LANES[scene.lane], k);
      if (k < 1) return undefined;
      spawnGates(state, rng);
      return 'active';
    },

    active(state, scene, { scale }) {
      scene.lift = fullLift(state);  // follows a resize mid-flight
      glide(state.dog, LANES[scene.lane], FLIGHT_GLIDE_PER_FRAME * scale);
      if (state.obstacles.length > 0) return undefined;
      scene.t = 0;
      scene.fromY = state.dog.y;
      return 'landing';
    },

    landing(state, scene, { scale, services, now }) {
      scene.t += scale;
      const k = ease(Math.min(1, scene.t / FLIGHT_LAND_FRAMES));
      scene.lift = fullLift(state) * (1 - k);
      state.dog.y = lerp(scene.fromY, GROUND_Y, k);
      if (k < 1) return undefined;
      Object.assign(state.dog, { flying: false, jumping: false, vy: 0 });
      puff(state, state.dog.x + 45, GROUND_Y + 14, 7, 'rgba(160, 130, 90, 0.8)');
      addEffect(state, 'capeAway', now, { x: state.dog.x + 30, y: state.dog.y - 20, vx: -1.2, vy: -1.6, rotation: 0 });
      services.sfx.playLand();
      return finish(state, FLIGHT_COOLDOWN);
    },
  },
};
