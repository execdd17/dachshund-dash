// One run of a network in a tier: its score, its speed at the end, and the
// kind of obstacle that ended it (null when it reached SCORE_CAP).

import { createEnv, ACTIONS } from './env.js';
import { observe } from './observe.js';
import { choose } from './net.js';

export const SCORE_CAP = 8000;  // past top speed (7500): a run this long counts as cleared

export function playRun(net, seed, tier) {
  const env = createEnv({ seed, tier }).reset();
  const { state } = env;
  while (!env.step(ACTIONS[choose(net, observe(state))]).done && state.score < SCORE_CAP);
  const dead = state.gameState !== 'running';
  return { score: Math.min(state.score, SCORE_CAP), speed: state.speed, killer: dead ? killerOf(state) : null };
}

function killerOf(state) {
  const near = [...state.obstacles].sort((a, b) => Math.abs(a.x - state.dog.x) - Math.abs(b.x - state.dog.x))[0];
  return near?.kind ?? 'unknown';
}
