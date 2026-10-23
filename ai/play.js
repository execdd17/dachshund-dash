// One run of a network in the environment: its score, and what ended it.

import { createEnv, ACTIONS } from './env.js';
import { observe } from './observe.js';
import { choose } from './net.js';

export const SCORE_CAP = 8000;  // past top speed (7500): a run this long counts as cleared

export function playRun(net, seed) {
  const env = createEnv(seed).reset();
  const { state } = env;
  while (!env.step(ACTIONS[choose(net, observe(state))]).done && state.score < SCORE_CAP);
  const killer = state.gameState === 'running' ? null : nearestObstacle(state);
  return { score: Math.min(state.score, SCORE_CAP), speed: state.speed, killer };
}

// The obstacle at the dog when it died (knocked away, it's in the effects).
function nearestObstacle(state) {
  const candidates = [...state.obstacles, ...state.effects.filter(e => e.kind === 'bonk')];
  candidates.sort((a, b) => Math.abs(a.x - state.dog.x) - Math.abs(b.x - state.dog.x));
  return candidates[0]?.type ?? 'unknown';
}
