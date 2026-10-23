// Model files: a network plus what it takes to use it right (the observation
// it was trained on, its tier) and how it did. Shared by training, evaluation,
// and the viewer.

import { OBSERVATION } from './observe.js';
import { toJSON, fromJSON } from './net.js';

// A model's file and results folder go by its name (tier<N> unless training says otherwise).
export const modelFile = name => `models/${name}.json`;
export const resultsDir = name => `results/${name}/`;

export const saveable = (net, meta) => ({ observation: OBSERVATION, ...meta, ...toJSON(net) });

// The network in `json`, refusing one trained on different inputs.
export function loadNet(json) {
  if (json.observation !== OBSERVATION) {
    throw new Error(`model expects observation '${json.observation}', this code provides '${OBSERVATION}'`);
  }
  return fromJSON(json);
}
