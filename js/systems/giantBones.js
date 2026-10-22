// Giant mode's bone round: normal spawning stops while the dog is giant, and
// the GIANT_ROUND patterns come one after another in random order (never
// the same twice running), a hot dog in each gap. Patterns are laid out at
// the current speed in baseline frames, so their timing holds at any speed:
//   arc     — bones along the giant dog's own jump path: one jump timed
//             right takes them all; early or late gets an end and breaks the streak
//   run     — a line at running height, free for a dog that stays down
//   bobber  — one bone bobbing above the running dog: jump to meet it
// No pattern starts within GIANT_PATTERNS_STOP_MS of the end, so the field
// is clear when the dog shrinks.

import {
  W, GROUND_Y, GRAVITY, JUMP_FORCE, GIANT_BONE_W, GIANT_BONE_H,
  GIANT_DURATION, GIANT_PATTERN_GAP_FRAMES, GIANT_PATTERNS_STOP_MS,
  GIANT_ARC_BONES, GIANT_RUN_BONES, GIANT_RUN_BONE_FRAMES, GIANT_BOB,
} from '../config.js';
import { makeObstacle } from './obstacleTypes.js';
import { getDogHitbox } from './collision.js';

// How far a jump has lifted the dog `n` baseline frames after the press
// (update()'s integration: gravity, then move).
export function jumpRise(n) {
  let y = 0;
  let vy = JUMP_FORCE;
  for (let k = 0; k < n; k++) {
    vy += GRAVITY;
    y += vy;
  }
  return y;
}

// Baseline frames from the press back to the ground.
export const JUMP_FRAMES = (() => {
  let n = 1;
  while (jumpRise(n) < 0) n++;
  return n;
})();

// Where on the giant dog's hitbox (0 top, 1 feet) a bone lines up, with the dog lifted by `rise`.
function giantBoxAt(dog, rise, k) {
  const box = getDogHitbox({ ...dog, y: GROUND_Y + rise, ducking: false }, true);
  return box.y + box.h * k;
}

const ARC_ON_BODY = 0.7;  // an arc runs along the dog's lower body (0 top of its hitbox, 1 its feet)

// A giant-size bone centered on (cx, cy), optionally bobbing.
const bone = (cx, cy, extra) => makeObstacle('bone', cx - GIANT_BONE_W / 2,
  { y: cy - GIANT_BONE_H / 2, width: GIANT_BONE_W, height: GIANT_BONE_H, ...extra });

// Each pattern spawns its bones starting at x (the right edge) and returns
// how far it reaches past x.
export const GIANT_PATTERNS = {
  // Bone i sits where the dog's lower body will be ARC frame n_i into a
  // jump, so a press when the first bone is the right distance ahead runs
  // through them all. The lower body, not the middle, keeps the top bone
  // clear of the HUD on a phone (a giant jump draws twice as high). The ends
  // skip the first and last few frames of the jump, which a running dog
  // would reach anyway.
  arc(state, x) {
    const first = Math.round(JUMP_FRAMES * 0.12);
    const last = Math.round(JUMP_FRAMES * 0.88);
    for (let i = 0; i < GIANT_ARC_BONES; i++) {
      const n = first + ((last - first) * i) / (GIANT_ARC_BONES - 1);
      const y = giantBoxAt(state.dog, jumpRise(n), ARC_ON_BODY);
      state.obstacles.push(bone(x + GIANT_BONE_W / 2 + (n - first) * state.speed, y));
    }
    return (last - first) * state.speed + GIANT_BONE_W;
  },

  run(state, x) {
    const y = giantBoxAt(state.dog, 0, 0.5);
    const step = GIANT_RUN_BONE_FRAMES * state.speed;
    for (let i = 0; i < GIANT_RUN_BONES; i++) state.obstacles.push(bone(x + GIANT_BONE_W / 2 + i * step, y));
    return (GIANT_RUN_BONES - 1) * step + GIANT_BONE_W;
  },

  // Bobs between just above the running dog and well inside a jump's reach.
  bobber(state, x, rng) {
    const low = giantBoxAt(state.dog, 0, 0) - GIANT_BONE_H / 2 - 8;
    state.obstacles.push(bone(x + GIANT_BONE_W / 2, low - GIANT_BOB.amp, { bob: { ...GIANT_BOB, phase: rng() } }));
    return GIANT_BONE_W;
  },
};

// A random pattern still in the round, never the last one again. A pattern
// with more left than all the others together has to go now, or it would
// end up back to back.
function nextPattern(state, rng) {
  const left = state.giantPatternsLeft;
  const total = Object.values(left).reduce((a, b) => a + b, 0);
  const ids = Object.keys(left).filter(id => left[id] > 0 && id !== state.giantLastPattern);
  const forced = ids.find(id => left[id] > total - left[id]);
  if (forced) return forced;
  return ids.length ? ids[Math.floor(rng() * ids.length)] : null;
}

// One frame of the bone round: `distance` is how far the field scrolled.
// activateGiantMode deals a new round (state.giantPatternsLeft).
export function stepGiantPatterns(state, distance, rng, now) {
  state.giantPatternIn -= distance;
  if (state.giantPatternIn > 0) return;
  if (GIANT_DURATION - (now - state.giantStartTime) < GIANT_PATTERNS_STOP_MS) return;
  const id = nextPattern(state, rng);
  if (!id) return;
  state.giantPatternsLeft[id]--;
  const x = W + 10;
  const length = GIANT_PATTERNS[id](state, x, rng);
  const gap = GIANT_PATTERN_GAP_FRAMES * state.speed;
  state.obstacles.push(makeObstacle('hotdog', x + length + gap / 2 - 18));
  state.giantPatternIn = length + gap;
  state.giantLastPattern = id;
}
