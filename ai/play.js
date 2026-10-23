// One run of a player in a tier: its score, its speed at the end, and the
// kind of obstacle that ended it (null when it reached SCORE_CAP). A player
// turns the inputs into an action: a trained network (netPlayer) or a
// hand-written rule set (rulesPlayer), so both are measured the same way.

import { createEnv, ACTIONS } from './env.js';
import { TIERS } from './tiers.js';
import { observe } from './observe.js';
import { choose } from './net.js';
import { decide } from './rules.js';
import { getDogHurtboxes, rectsOverlap, getObstacleHitbox } from '../js/systems/collision.js';

export const SCORE_CAP = 8000;  // past top speed (7500): a run this long counts as cleared

export const netPlayer = net => inputs => ACTIONS[choose(net, inputs)];
export const rulesPlayer = ruleSet => inputs => decide(ruleSet, inputs).action;

// A timed tier's run ends when its time is up and keeps every point (no cap).
export function playRun(player, seed, tier, cap = SCORE_CAP) {
  const limit = TIERS[tier].minutes ? Infinity : cap;
  const env = createEnv({ seed, tier }).reset();
  const { state } = env;
  while (!env.step(player(observe(state))).done && state.score < limit);
  const dead = state.gameState !== 'running';
  return {
    score: Math.min(state.score, limit),
    speed: state.speed,
    seconds: env.now / 1000,
    birds: env.birds,
    killer: dead ? killerOf(state, env.lastScene) : null,
  };
}

// The obstacle the dog ran into, or the boss squirrel if none touches it.
function killerOf(state, scene) {
  const dog = getDogHurtboxes(state.dog, false);
  const hit = state.obstacles.find(o => dog.some(box => rectsOverlap(box, getObstacleHitbox(o))));
  if (hit) return hit.kind ?? 'unknown';
  if (scene === 'boss') return 'boss squirrel';
  const near = [...state.obstacles].sort((a, b) => Math.abs(a.x - state.dog.x) - Math.abs(b.x - state.dog.x))[0];
  return near?.kind ?? 'unknown';
}
