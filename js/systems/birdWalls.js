// Bird walls: multi-bird formations. Each bird carries aerialWall (no jump
// bonus) and its wallRow, so chase can drop the low row to acorn duck height
// (chaseAcornY). Geometry and what each wall asks of the player: config.js.

import { BIRD_LOW_Y, BIRD_STACK_HIGH_Y, BIRD_STACK_MID_Y } from '../config.js';
import { makeObstacle } from './obstacleTypes.js';

const wallBird = (x, y, wallRow, props) => makeObstacle('bird', x, { y, wallRow, aerialWall: true, ...props });

// A column of three: must be ducked. The tutorial teaches duck with it.
export function birdStack(x, props = {}) {
  return [
    wallBird(x, BIRD_STACK_HIGH_Y, 'high', props),
    wallBird(x, BIRD_STACK_MID_Y, 'mid', props),
    wallBird(x, BIRD_LOW_Y, 'low', props),
  ];
}
