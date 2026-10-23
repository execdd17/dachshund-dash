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

// The activation each layer after the inputs applies to its weighted sums:
// tanh in the hidden layers, none (linear) at the outputs.
export const activationOf = (net, layer) => (layer === net.sizes.length - 1 ? 'linear' : 'tanh');

// Where neuron `j` of layer `layer` keeps its bias; its weight from input `i` follows at +1+i.
export function weightIndex(net, layer, j) {
  let w = 0;
  for (let l = 1; l < layer; l++) w += (net.sizes[l - 1] + 1) * net.sizes[l];
  return w + j * (net.sizes[layer - 1] + 1);
}

// Every layer's values for `inputs`: the inputs, then each layer's activations.
export function activations(net, inputs) {
  const layers = [inputs];
  for (let l = 1; l < net.sizes.length; l++) {
    const prev = layers[l - 1];
    const out = new Array(net.sizes[l]);
    for (let j = 0; j < out.length; j++) {
      let w = weightIndex(net, l, j);
      let sum = net.weights[w++];  // bias
      for (const v of prev) sum += v * net.weights[w++];
      out[j] = activationOf(net, l) === 'tanh' ? Math.tanh(sum) : sum;
    }
    layers.push(out);
  }
  return layers;
}

export const forward = (net, inputs) => activations(net, inputs).at(-1);

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
