// Model files: a network plus what it takes to use it right (the observation
// it was trained on, its tier) and how it did. Shared by training, evaluation,
// and the viewer.

import { OBSERVATION } from './observe.js';
import { toJSON, fromJSON } from './net.js';

export const modelFile = tier => `models/tier${tier}.json`;

export const saveable = (net, meta) => ({ observation: OBSERVATION, ...meta, ...toJSON(net) });

// The network in `json`, refusing one trained on different inputs.
export function loadNet(json) {
  if (json.observation !== OBSERVATION) {
    throw new Error(`model expects observation '${json.observation}', this code provides '${OBSERVATION}'`);
  }
  return fromJSON(json);
}
