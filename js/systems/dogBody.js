// The dog's body along the run, for judging what it got over: its standing
// hitbox's back (tail) and front (nose), in world x, and where an obstacle's
// hitbox is against them (jumpBonuses.js, cleanJump.js).

import { DOG_HITBOX_STAND } from '../config.js';

export function dogBody(dog) {
  const tail = dog.x + DOG_HITBOX_STAND.dx;
  return { tail, nose: tail + DOG_HITBOX_STAND.w };
}

// A hitbox over the dog's body, and one wholly past its tail.
export const overDog = (box, body) => box.x < body.nose && box.x + box.w > body.tail;
export const pastDog = (box, body) => box.x + box.w < body.tail;
