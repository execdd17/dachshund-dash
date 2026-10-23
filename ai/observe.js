// What an agent sees: the dog's own state, the speed, and a radar of the
// screen ahead in height bands. For each band, the next two things in it, as
// when each arrives at the dog's nose and when it's gone past its tail, in
// time (distance ÷ speed, so the right moment looks the same at any speed).
// No obstacle types: a bird stack is three bands filled at once, a chocolate
// bar the ground band, and a new obstacle needs no new inputs. Shared by
// training and anything that plays a trained network; models record
// OBSERVATION, so a model can't be fed inputs it wasn't trained on.

import { GROUND_Y, INITIAL_SPEED, MAX_SPEED, DOG_HITBOX_STAND, DOG_HITBOX_DUCK } from '../js/config.js';
import { OBSTACLE_TYPES, getObstacleHitbox } from '../js/systems/obstacleTypes.js';

export const OBSERVATION = 'radar-1';

// Height bands, world y, top to bottom, cut where the dog's hitboxes change
// what an obstacle asks: the ground band hits even a ducking dog (jump); the
// head band a standing dog but not a ducking one (duck); the air bands only a
// dog in the air.
export const BANDS = [
  { name: 'high air', means: 'only a dog jumping high meets these', top: -Infinity, bottom: GROUND_Y - 60 },
  { name: 'low air', means: 'a dog in the air meets these', top: GROUND_Y - 60, bottom: GROUND_Y + DOG_HITBOX_STAND.dy },
  { name: 'head', means: 'hits a standing dog, not a ducking one: duck', top: GROUND_Y + DOG_HITBOX_STAND.dy, bottom: GROUND_Y + DOG_HITBOX_DUCK.dy },
  { name: 'ground', means: 'hits even a ducking dog: jump', top: GROUND_Y + DOG_HITBOX_DUCK.dy, bottom: Infinity },
];
export const PER_BAND = 2;
export const SOON_SECONDS = 0.5;  // times are in units of this, clamped to ±1
const SOON_FRAMES = SOON_SECONDS * 120;  // 120Hz frames

// The dog's own inputs, by name, in the order observe() gives them.
export const DOG_INPUTS = ['height', 'vertical speed', 'in the air', 'double jump used', 'ducking', 'game speed'];

export const INPUTS = DOG_INPUTS.length + BANDS.length * PER_BAND * 2;

// Every input's name, in order: the dog's, then each band's next things (when it reaches the dog, when it's past).
export const INPUT_LABELS = [
  ...DOG_INPUTS,
  ...BANDS.flatMap(band => Array.from({ length: PER_BAND }, (_, k) => [`${band.name} ${k ? '2nd' : '1st'}: reaches`, `${band.name} ${k ? '2nd' : '1st'}: past`]).flat()),
];

const hurts = o => ['hazard', 'terrain'].includes(OBSTACLE_TYPES[o.type].contact);
const clampTime = (px, speed) => Math.max(-1, Math.min(1, px / speed / SOON_FRAMES));

// Per band, the not-yet-passed hitboxes in it, nearest first (each with its `obstacle`).
export function radar(state) {
  const { dog } = state;
  const tail = dog.x + DOG_HITBOX_STAND.dx;
  const boxes = state.obstacles.filter(hurts).map(o => ({ ...getObstacleHitbox(o), obstacle: o })).filter(b => b.x + b.w > tail);
  return BANDS.map(band => boxes
    .filter(b => b.y < band.bottom && b.y + b.h > band.top)
    .sort((a, b) => a.x - b.x)
    .slice(0, PER_BAND));
}

export function observe(state) {
  const { dog, speed } = state;
  const nose = dog.x + DOG_HITBOX_STAND.dx + DOG_HITBOX_STAND.w;
  const tail = dog.x + DOG_HITBOX_STAND.dx;
  const inputs = [
    (GROUND_Y - dog.y) / 120,
    dog.vy / 8,
    dog.jumping ? 1 : 0,
    dog.doubleJumped ? 1 : 0,
    state.duckHeld ? 1 : 0,
    (speed - INITIAL_SPEED) / (MAX_SPEED - INITIAL_SPEED),
  ];
  for (const band of radar(state)) {
    for (let i = 0; i < PER_BAND; i++) {
      const b = band[i];
      inputs.push(b ? clampTime(b.x - nose, speed) : 1, b ? clampTime(b.x + b.w - tail, speed) : 1);
    }
  }
  return inputs;
}
