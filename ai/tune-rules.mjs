// Picks the tuned rule set's numbers (rules.js, TUNED) one at a time, the way
// you'd tune by hand: try each candidate for one number with the others held,
// keep the best, move to the next, and go round twice. Every try plays the
// same tuning runs, on seeds the evaluation never uses. Re-run it if jump
// physics change, and copy the result into TUNED.
//
//   node ai/tune-rules.mjs [--tier 4] [--runs 40]

import { parseArgs } from 'node:util';
import { playRun, rulesPlayer } from './play.js';
import { tunedRules, TUNED } from './rules.js';

const { values } = parseArgs({ options: { tier: { type: 'string', default: '4' }, runs: { type: 'string', default: '40' } } });
const tier = Number(values.tier);
const seeds = Array.from({ length: Number(values.runs) }, (_, i) => 700000 + i);  // evaluation uses 5000000 on

const CANDIDATES = {
  jumpBy: [0.45, 0.5, 0.55, 0.6, 0.65, 0.7],
  towerBy: [0.8, 0.85, 0.9, 0.95, 0.99],
  doubleAt: [0.6, 0.7, 0.8, 0.9, 1.0, 1.1],
  duckWithin: [0.1, 0.2, 0.3, 0.4],
};

const meanScore = params => seeds.reduce((sum, seed) => sum + playRun(rulesPlayer(tunedRules(params)), seed, tier).score, 0) / seeds.length;

let best = { ...TUNED };
let bestMean = meanScore(best);
console.log(`start ${JSON.stringify(best)}: mean ${Math.round(bestMean)}`);
for (let pass = 1; pass <= 2; pass++) {
  for (const [key, options] of Object.entries(CANDIDATES)) {
    for (const value of options) {
      if (value === best[key]) continue;
      const mean = meanScore({ ...best, [key]: value });
      if (mean > bestMean) [best, bestMean] = [{ ...best, [key]: value }, mean];
    }
    console.log(`pass ${pass}, ${key}: ${JSON.stringify(best)}, mean ${Math.round(bestMean)}`);
  }
}
