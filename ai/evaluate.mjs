// The saved best network on seeds it never trained or was chosen on: its
// scores, how many runs it clears (SCORE_CAP), and what ends the rest.
//
//   node ai/evaluate.mjs [runs=50]

import { readFileSync, writeFileSync } from 'node:fs';
import { fromJSON } from './net.js';
import { playRun, SCORE_CAP } from './play.js';

const runs = Number(process.argv[2] ?? 50);
const model = JSON.parse(readFileSync(new URL('models/best.json', import.meta.url), 'utf8'));
const net = fromJSON(model);
const results = Array.from({ length: runs }, (_, i) => playRun(net, 5000000 + i));

const scores = results.map(r => r.score).sort((a, b) => a - b);
const killers = {};
for (const r of results) if (r.killer) killers[r.killer] = (killers[r.killer] ?? 0) + 1;
const speedAtDeath = results.filter(r => r.killer).map(r => r.speed);
const report = {
  model: `generation ${model.generation}, validation mean ${Math.round(model.validation)}`,
  runs,
  mean: Math.round(scores.reduce((a, b) => a + b, 0) / runs),
  median: Math.round(scores[Math.floor(runs / 2)]),
  min: Math.round(scores[0]),
  max: Math.round(scores.at(-1)),
  cleared: `${results.filter(r => r.score >= SCORE_CAP).length}/${runs} reached ${SCORE_CAP}`,
  killedBy: killers,
  speedAtDeath: speedAtDeath.length ? `${Math.min(...speedAtDeath).toFixed(2)}–${Math.max(...speedAtDeath).toFixed(2)}` : 'none',
};
console.log(JSON.stringify(report, null, 2));
writeFileSync(new URL('results/evaluation.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
