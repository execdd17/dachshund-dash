// A small fully connected network (inputs → tanh hidden layer → one score per
// action; the highest score is the action), with the mutation and crossover
// neuroevolution breeds it by. Weights live in one flat array.

export function createNet(sizes, rng) {
  const net = { sizes, weights: new Float64Array(countWeights(sizes)) };
  for (let i = 0; i < net.weights.length; i++) net.weights[i] = gaussian(rng) * 0.5;
  return net;
}

function countWeights(sizes) {
  let n = 0;
  for (let l = 1; l < sizes.length; l++) n += (sizes[l - 1] + 1) * sizes[l];  // +1: bias
  return n;
}

export function forward(net, inputs) {
  let values = inputs;
  let w = 0;
  for (let l = 1; l < net.sizes.length; l++) {
    const out = new Array(net.sizes[l]);
    const last = l === net.sizes.length - 1;
    for (let j = 0; j < out.length; j++) {
      let sum = net.weights[w++];  // bias
      for (const v of values) sum += v * net.weights[w++];
      out[j] = last ? sum : Math.tanh(sum);
    }
    values = out;
  }
  return values;
}

export const choose = (net, inputs) => {
  const scores = forward(net, inputs);
  return scores.indexOf(Math.max(...scores));
};

// Each weight nudged by N(0, sigma) with probability `rate`.
export function mutate(net, rng, { sigma, rate }) {
  const child = { sizes: net.sizes, weights: Float64Array.from(net.weights) };
  for (let i = 0; i < child.weights.length; i++) if (rng() < rate) child.weights[i] += gaussian(rng) * sigma;
  return child;
}

// Each weight from one parent or the other.
export function crossover(a, b, rng) {
  return { sizes: a.sizes, weights: a.weights.map((w, i) => (rng() < 0.5 ? w : b.weights[i])) };
}

export const toJSON = net => ({ sizes: net.sizes, weights: Array.from(net.weights) });
export const fromJSON = json => ({ sizes: json.sizes, weights: Float64Array.from(json.weights) });

function gaussian(rng) {
  const u = 1 - rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
