// Neuroevolution: a population of networks plays a tier; the best carry over,
// and the rest are bred from the fitter half by crossover and mutation. Runs
// on every core (worker threads), logs each generation to
// results/<name>/curve.csv, and saves the best network so far, judged on
// fixed validation seeds, to models/<name>.json (name: tier<N> by default).
// With --from, the population starts as variations of an earlier model (a
// curriculum: tier 1's champion continuing on tier 2).
//
//   node ai/train.mjs --tier 2 [--minutes 30] [--from ai/models/tier1.json] [--name tier2-from-tier1] [--cap 8000] [--validation 12]
//
// --cap is the score a run counts as cleared at (SCORE_CAP); raise it once a
// tier is cleared, to train for staying power at top speed. --validation is
// how many fixed runs pick the champion and end training once all clear: at
// a high cap, a model that clears 93% of runs clears 12 in a row 4 times in
// 10, so use more (48: 3 in 100). --mix adds other tiers' runs to every
// network's fitness (as many seeds each as the tier's own): rehearsal of old
// skills, or drills that make a new one cheap to try (tier 6). The champion
// is still judged on the tier's own validation runs.
//
//   node ai/train.mjs --tier 5 --mix 6 --minutes 60 --validation 48 --from ai/models/tier4-from-tier3.json

import { Worker, isMainThread, parentPort } from 'node:worker_threads';
import { availableParallelism } from 'node:os';
import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createNet, mutate, crossover, toJSON, fromJSON } from './net.js';
import { INPUTS } from './observe.js';
import { ACTIONS, seededRng } from './env.js';
import { playRun, netPlayer, SCORE_CAP } from './play.js';
import { TIERS } from './tiers.js';
import { modelFile, resultsDir, saveable, loadNet } from './models.js';
import { writeModelIndex } from './model-index.mjs';

const SIZES = [INPUTS, 24, ACTIONS.length];
const POPULATION = 150;
const ELITE = 6;                   // carried over unchanged (and re-tested on new seeds)
const SEEDS_PER_GENERATION = 3;    // every network plays the same fresh seeds
const MUTATION = { sigma: 0.25, rate: 0.15 };

const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

// Worker: score a batch of networks on the given seeds.
if (!isMainThread) {
  parentPort.on('message', ({ nets, seeds, tier, cap }) => {
    parentPort.postMessage(nets.map(json => mean(seeds.map(seed => playRun(netPlayer(fromJSON(json)), seed, tier, cap).score))));
  });
} else {
  const { values } = parseArgs({ options: {
    tier: { type: 'string' }, minutes: { type: 'string', default: '30' }, from: { type: 'string' }, name: { type: 'string' },
    cap: { type: 'string', default: String(SCORE_CAP) }, validation: { type: 'string', default: '12' },
    mix: { type: 'string', default: '' },
  } });
  const mix = values.mix ? values.mix.split(',').map(Number) : [];
  const cap = Number(values.cap);
  const validationSeeds = Array.from({ length: Number(values.validation) }, (_, i) => 900000 + i);
  const tier = Number(values.tier);
  const minutes = Number(values.minutes);
  const name = values.name ?? `tier${tier}`;
  const dir = new URL('.', import.meta.url);
  const results = new URL(resultsDir(name), dir);
  mkdirSync(results, { recursive: true });
  mkdirSync(new URL('models/', dir), { recursive: true });

  const workers = Array.from({ length: availableParallelism() }, () => new Worker(new URL(import.meta.url)));
  // Every (network, seed) run is its own task, handed to whichever worker is
  // free: runs last from seconds to a timed tier's full length, and equal
  // chunks per worker left most of them idle while one finished its long runs.
  const runAll = tasks => new Promise(resolve => {
    const scores = new Array(tasks.length);
    let next = 0, done = 0;
    const feed = w => {
      if (next >= tasks.length) return;
      const i = next++;
      w.once('message', ([s]) => {
        scores[i] = s;
        if (++done === tasks.length) resolve(scores);
        else feed(w);
      });
      w.postMessage({ nets: [tasks[i].json], seeds: [tasks[i].seed], tier: tasks[i].tier, cap });
    };
    workers.forEach(feed);
  });
  // Each network's mean score over `runs` ([{ seed, tier }]).
  const score = async (nets, runs) => {
    const jsons = nets.map(toJSON);
    const scores = await runAll(jsons.flatMap(json => runs.map(({ seed, tier: runTier }) => ({ json, seed, tier: runTier }))));
    return nets.map((_, n) => mean(scores.slice(n * runs.length, (n + 1) * runs.length)));
  };
  // One network on the validation seeds, in the tier it trains for.
  const validate = async net => (await score([net], validationSeeds.map(seed => ({ seed, tier }))))[0];

  const rng = seededRng(12345);
  const ancestor = values.from && JSON.parse(readFileSync(values.from, 'utf8'));
  const trainedOn = [...(ancestor?.trainedOn ?? []), tier];
  let population = ancestor
    ? [loadNet(ancestor), ...Array.from({ length: POPULATION - 1 }, () => mutate(loadNet(ancestor), rng, MUTATION))]
    : Array.from({ length: POPULATION }, () => createNet(SIZES, rng));
  const started = Date.now();
  const curve = ['generation,seconds,best,mean,median,validation'];
  let champion = { validation: -1 };

  for (let gen = 0; (Date.now() - started) / 60000 < minutes; gen++) {
    // This generation's runs: the tier's own fresh seeds, then as many for each --mix tier.
    const runs = [tier, ...mix].flatMap(runTier => Array.from({ length: SEEDS_PER_GENERATION }, () => ({ seed: Math.floor(rng() * 1e9), tier: runTier })));
    const fitness = await score(population, runs);
    const ranked = population.map((net, i) => ({ net, fit: fitness[i] })).sort((a, b) => b.fit - a.fit);

    // The generation's best, on the fixed validation seeds: the champion is the best of those.
    const validation = await validate(ranked[0].net);
    if (validation > champion.validation) {
      champion = { validation, gen, net: ranked[0].net };
      const meta = { tier, trainedOn, generation: gen, validation, cap, validationRuns: validationSeeds.length, mix, from: values.from ?? null };
      writeFileSync(new URL(modelFile(name), dir), JSON.stringify(saveable(champion.net, meta)));
      writeModelIndex();
    }
    const fits = ranked.map(r => r.fit);
    const seconds = Math.round((Date.now() - started) / 1000);
    curve.push([gen, seconds, fits[0], mean(fits), fits[Math.floor(fits.length / 2)], validation].map(v => Math.round(v)).join(','));
    writeFileSync(new URL('curve.csv', results), curve.join('\n') + '\n');
    console.log(`gen ${gen} (${seconds}s): best ${Math.round(fits[0])}, mean ${Math.round(mean(fits))}, validation ${Math.round(validation)}, champion ${Math.round(champion.validation)} (gen ${champion.gen})`);
    if (!TIERS[tier].minutes && champion.validation >= cap) break;  // clears every validation run (a timed tier has no cap: it trains to the end)

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
