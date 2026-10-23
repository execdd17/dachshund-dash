// Neuroevolution: a population of networks plays the environment; the best
// carry over, and the rest are bred from the fitter half by crossover and
// mutation. Runs on every core (worker threads), logs each generation to
// ai/results/curve.csv, and saves the best network so far — judged on fixed
// validation seeds — to ai/models/best.json.
//
//   node ai/train.mjs [minutes=30]

import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { createNet, mutate, crossover, toJSON, fromJSON } from './net.js';
import { INPUTS } from './observe.js';
import { ACTIONS, seededRng } from './env.js';
import { playRun, SCORE_CAP } from './play.js';

const SIZES = [INPUTS, 16, ACTIONS.length];
const POPULATION = 150;
const ELITE = 6;                   // carried over unchanged (and re-tested on new seeds)
const SEEDS_PER_GENERATION = 3;    // every network plays the same fresh seeds
const VALIDATION_SEEDS = Array.from({ length: 12 }, (_, i) => 900000 + i);
const MUTATION = { sigma: 0.25, rate: 0.15 };

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

// Worker: score a batch of networks on the given seeds.
if (!isMainThread) {
  parentPort.on('message', ({ nets, seeds }) => {
    parentPort.postMessage(nets.map(json => mean(seeds.map(seed => playRun(fromJSON(json), seed).score))));
  });
} else {
  const minutes = Number(process.argv[2] ?? 30);
  const dir = new URL('.', import.meta.url);
  mkdirSync(new URL('models/', dir), { recursive: true });
  mkdirSync(new URL('results/', dir), { recursive: true });

  const workers = Array.from({ length: availableParallelism() }, () => new Worker(new URL(import.meta.url)));
  const score = (nets, seeds) => {
    const chunk = Math.ceil(nets.length / workers.length);
    return Promise.all(workers.map((w, i) => new Promise(resolve => {
      w.once('message', resolve);
      w.postMessage({ nets: nets.slice(i * chunk, (i + 1) * chunk).map(toJSON), seeds });
    }))).then(parts => parts.flat());
  };

  const rng = seededRng(12345);
  let population = Array.from({ length: POPULATION }, () => createNet(SIZES, rng));
  const started = Date.now();
  const curve = ['generation,seconds,best,mean,median,validation'];
  let champion = { validation: -1 };

  for (let gen = 0; (Date.now() - started) / 60000 < minutes; gen++) {
    const seeds = Array.from({ length: SEEDS_PER_GENERATION }, () => Math.floor(rng() * 1e9));
    const fitness = await score(population, seeds);
    const ranked = population.map((net, i) => ({ net, fit: fitness[i] })).sort((a, b) => b.fit - a.fit);

    // The generation's best, on the fixed validation seeds: the champion is the best of those.
    const [validation] = await score([ranked[0].net], VALIDATION_SEEDS);
    if (validation > champion.validation) {
      champion = { validation, gen, net: ranked[0].net };
      writeFileSync(new URL('models/best.json', dir), JSON.stringify({ generation: gen, validation, ...toJSON(champion.net) }));
    }
    const fits = ranked.map(r => r.fit);
    const seconds = Math.round((Date.now() - started) / 1000);
    curve.push([gen, seconds, fits[0], mean(fits), fits[Math.floor(fits.length / 2)], validation].map(v => Math.round(v)).join(','));
    writeFileSync(new URL('results/curve.csv', dir), curve.join('\n') + '\n');
    console.log(`gen ${gen} (${seconds}s): best ${Math.round(fits[0])}, mean ${Math.round(mean(fits))}, validation ${Math.round(validation)}, champion ${Math.round(champion.validation)} (gen ${champion.gen})`);
    if (champion.validation >= SCORE_CAP) break;  // clears every validation run

    // Next generation: the elite, then children of tournament winners from the fitter half.
    const parents = ranked.slice(0, POPULATION / 2);
    const pick = () => {
      let best = parents[Math.floor(rng() * parents.length)];
      for (let k = 0; k < 3; k++) {
        const other = parents[Math.floor(rng() * parents.length)];
        if (other.fit > best.fit) best = other;
      }
      return best.net;
    };
    population = [
      ...ranked.slice(0, ELITE).map(r => r.net),
      ...Array.from({ length: POPULATION - ELITE }, () => {
        const child = rng() < 0.5 ? crossover(pick(), pick(), rng) : pick();
        return mutate(child, rng, MUTATION);
      }),
    ];
  }
  await Promise.all(workers.map(w => w.terminate()));
  console.log(`done: champion from generation ${champion.gen}, validation mean ${Math.round(champion.validation)}`);
}
