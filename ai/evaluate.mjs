// A saved model on seeds it never trained or was chosen on, in its own tier
// or another: its scores, how many runs it clears (SCORE_CAP), and which kinds
// of obstacle end the rest. Writes results/<model name>/evaluation-tier<N>.json.
//
//   node ai/evaluate.mjs --model ai/models/tier1.json [--tier 1] [--runs 50]

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { playRun, SCORE_CAP } from './play.js';
import { basename } from 'node:path';
import { loadNet, resultsDir } from './models.js';

const { values } = parseArgs({ options: { model: { type: 'string' }, tier: { type: 'string' }, runs: { type: 'string', default: '50' } } });
const model = JSON.parse(readFileSync(values.model, 'utf8'));
const net = loadNet(model);
const tier = Number(values.tier ?? model.tier);
const runs = Number(values.runs);
const results = Array.from({ length: runs }, (_, i) => playRun(net, 5000000 + i, tier));

const scores = results.map(r => r.score).sort((a, b) => a - b);
const killedBy = {};
for (const r of results) if (r.killer) killedBy[r.killer] = (killedBy[r.killer] ?? 0) + 1;
const speeds = results.filter(r => r.killer).map(r => r.speed);
const report = {
  model: `${values.model}: tier ${model.tier} (trained on ${model.trainedOn.join(' → ')}), generation ${model.generation}`,
  tier,
  runs,
  mean: Math.round(scores.reduce((a, b) => a + b, 0) / runs),
  median: Math.round(scores[Math.floor(runs / 2)]),
  min: Math.round(scores[0]),
  max: Math.round(scores.at(-1)),
  cleared: `${results.filter(r => r.score >= SCORE_CAP).length}/${runs} reached ${SCORE_CAP}`,
  killedBy,
  speedAtDeath: speeds.length ? `${Math.min(...speeds).toFixed(2)}–${Math.max(...speeds).toFixed(2)}` : 'none',
};
console.log(JSON.stringify(report, null, 2));
const out = new URL(resultsDir(basename(values.model, '.json')), import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL(`evaluation-tier${tier}.json`, out), JSON.stringify(report, null, 2) + '\n');
