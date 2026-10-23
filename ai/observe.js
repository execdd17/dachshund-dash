// What the network sees, as numbers scaled to about 0..1: the dog's own
// motion, the speed, and the next two obstacles ahead of its nose, each as
// the time until it reaches the nose (distance ÷ speed, so the right moment
// to jump looks the same at any speed) and its type. Shared by training and
// anything that plays a trained network, so they can't differ.

import { GROUND_Y, INITIAL_SPEED, MAX_SPEED, DOG_HITBOX_STAND } from '../js/config.js';

const AHEAD = 2;
const SOON_FRAMES = 60;  // times until contact are in units of half a second (120Hz frames), capped at 1
export const INPUTS = 6 + AHEAD * 3;

export function observe(state) {
  const { dog } = state;
  const nose = dog.x + DOG_HITBOX_STAND.dx + DOG_HITBOX_STAND.w;
  const ahead = state.obstacles
    .filter(o => o.x + o.width > dog.x + DOG_HITBOX_STAND.dx)
    .sort((a, b) => a.x - b.x)
    .slice(0, AHEAD);
  const inputs = [
    (GROUND_Y - dog.y) / 120,
    dog.vy / 8,
    dog.jumping ? 1 : 0,
    dog.doubleJumped ? 1 : 0,
    state.duckHeld ? 1 : 0,
    (state.speed - INITIAL_SPEED) / (MAX_SPEED - INITIAL_SPEED),
  ];
  for (let i = 0; i < AHEAD; i++) {
    const o = ahead[i];
    const soon = o ? Math.min(1, Math.max(-1, (o.x - nose) / state.speed / SOON_FRAMES)) : 1;
    inputs.push(soon, o?.type === 'hotdog' ? 1 : 0, o?.type === 'bird' ? 1 : 0);
  }
  return inputs;
}
