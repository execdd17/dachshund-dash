// The dog in the tunnel scene's tunnel. Ducking over a hole drops it in; it
// stays down while duck is held, and once duck is let go it pops up at the
// next hole (jumping under any hole pops it up at once, with a full jump).
// Each hole works once, so a duck pressed early for the next hole can't drop
// the dog back into the one it just came out of.

import {
  GROUND_Y, DOG_HITBOX_STAND, TUNNEL_HOLE_SLACK, TUNNEL_POP_VY, TUNNEL_DEPTH,
} from '../config.js';

const CRUMB_EVERY_FRAMES = 9;  // dirt crumbs falling behind the crawling dog

const dogCenterX = dog => dog.x + DOG_HITBOX_STAND.dx + DOG_HITBOX_STAND.w / 2;
const spansDog = (o, dog) => {
  const cx = dogCenterX(dog);
  return cx >= o.x - TUNNEL_HOLE_SLACK && cx <= o.x + o.width + TUNNEL_HOLE_SLACK;
};

// The unused hole the dog is over, if any.
function holeUnderDog(state) {
  return state.obstacles.find(o => o.type === 'tunnelHole' && !o.used && spansDog(o, state.dog));
}

function tunnelUnderDog(state) {
  return state.obstacles.some(o => o.type === 'tunnel' && spansDog(o, state.dog));
}

function throwDirt(state, x) {
  for (let i = 0; i < 10; i++) {
    const spread = i - 4.5;
    state.landingParticles.push({
      x: x + spread * 4,
      y: GROUND_Y + 16,
      vx: spread * 0.3,
      vy: -2.2 - (i % 3) * 0.7,
      life: 1,
      color: ['#6B4423', '#8B5A2B', '#4A2F17'][i % 3],
      size: 1.4 + (i % 2),
    });
  }
}

function dropIn(state, hole, services, now) {
  state.dog.underground = true;
  state.dog.burrowChangedAt = now;
  hole.used = true;
  throwDirt(state, hole.x + hole.width / 2);
  services.sfx.playDig();
}

function popOut(state, hole, services, now, vy) {
  const dog = state.dog;
  Object.assign(dog, {
    underground: false, burrowChangedAt: now, ducking: false,
    vy, jumping: true, doubleJumped: false, fastFalling: false,
  });
  if (hole) hole.used = true;
  throwDirt(state, hole ? hole.x + hole.width / 2 : dogCenterX(dog));
  services.sfx.playPop();
}

// A jump pressed in the tunnel: out through the hole above, if there is one.
export function jumpOutOfTunnel(state, services, now, vy) {
  const hole = holeUnderDog(state);
  if (hole) popOut(state, hole, services, now, vy);
}

// Crumbs knocked loose behind the crawling dog.
function dropCrumbs(state) {
  if (state.frameCount % CRUMB_EVERY_FRAMES !== 0) return;
  state.landingParticles.push({
    x: state.dog.x + DOG_HITBOX_STAND.dx + 4,
    y: GROUND_Y + 8 + TUNNEL_DEPTH,
    vx: -0.4,
    vy: -0.8,
    life: 0.8,
    color: '#7A5230',
    size: 1,
  });
}

// Once a frame while the tunnel scene runs (before collision).
export function stepBurrow(state, services, now) {
  const dog = state.dog;
  const hole = holeUnderDog(state);
  if (!dog.underground) {
    if (dog.ducking && hole) dropIn(state, hole, services, now);
  } else if (!state.duckHeld && hole) {
    popOut(state, hole, services, now, TUNNEL_POP_VY);  // duck let go: up at this hole
  } else if (!tunnelUnderDog(state)) {
    popOut(state, null, services, now, TUNNEL_POP_VY);  // the tunnel ran out
  } else {
    dropCrumbs(state);
  }
}
