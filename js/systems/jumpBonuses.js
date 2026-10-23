// Jump bonuses: what the game pays for getting over an obstacle, judged by
// where its hitbox is against the dog's body. In normal mode a lone bird
// jumped pays BIRD_JUMP_BONUS (walls are meant to be ducked or jumped
// through, not bonused); hyper pays clean jumps instead (cleanJump.js).
// Every bonus pays only if the dog was in the air the whole time the hitbox
// passed it: one that crossed the dog's body with the dog on the ground
// (ducked or run under) is marked `passedUnder` and never pays — or ducking
// under a bird and hopping as it cleared the tail would (the AI found that
// one). Hitboxes, not sprites, so a jump that clears one pays. Giant mode
// has its own (giant.js: a giant dog's birds are bones).

import { BIRD_JUMP_BONUS } from '../config.js';
import { getObstacleHitbox } from './obstacleTypes.js';
import { addEffect } from './effects.js';
import { dogBody, overDog, pastDog } from './dogBody.js';
import { stepCleanJumps } from './cleanJump.js';

// Once per frame, after obstacles move (and outside giant mode).
export function stepJumpBonuses(state, now) {
  const { dog } = state;
  const body = dogBody(dog);
  for (const o of state.obstacles) {
    if (!dog.jumping && overDog(getObstacleHitbox(o), body)) o.passedUnder = true;
  }
  if (state.hyper) stepCleanJumps(state, body, now);
  else payBirdJumps(state, body, now);
}

function payBirdJumps(state, body, now) {
  for (const o of state.obstacles) {
    if (o.type !== 'bird' || o.aerialWall || o.jumped || o.passedUnder || !state.dog.jumping) continue;
    if (!pastDog(getObstacleHitbox(o), body)) continue;
    o.jumped = true;
    state.score += BIRD_JUMP_BONUS;
    addEffect(state, 'birdJump', now, { x: o.x + o.width / 2, y: o.y });
  }
}
