// A saved model on seeds it never trained or was chosen on, in its own tier
// or another: its scores, how many runs it clears (SCORE_CAP), and which kinds
// of obstacle end the rest. Writes results/<model name>/evaluation-tier<N>.json.
// A hand-written rule set (rules.js) is measured the same way, on the same
// seeds, by name and with a tier.
//
//   node ai/evaluate.mjs --model ai/models/tier1.json [--tier 1] [--runs 50] [--cap 8000]
//   node ai/evaluate.mjs --model rules-naive --tier 1

import { parseArgs } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { playRun, netPlayer, rulesPlayer, SCORE_CAP } from './play.js';
import { RULES_PREFIX, ruleSetNamed } from './rules.js';
import { TIERS } from './tiers.js';
import { basename } from 'node:path';
import { loadNet, resultsDir } from './models.js';

const { values } = parseArgs({ options: {
  model: { type: 'string' }, tier: { type: 'string' }, runs: { type: 'string', default: '50' }, cap: { type: 'string', default: String(SCORE_CAP) },
} });
const cap = Number(values.cap);
const name = basename(values.model, '.json');
const ruleSet = name.startsWith(RULES_PREFIX) && ruleSetNamed(name);
if (name.startsWith(RULES_PREFIX) && !ruleSet) throw new Error(`no rule set '${name}' in rules.js`);
const model = ruleSet ? null : JSON.parse(readFileSync(values.model, 'utf8'));
const player = ruleSet ? rulesPlayer(ruleSet) : netPlayer(loadNet(model));
const tier = Number(values.tier ?? model?.tier);
if (Number.isNaN(tier)) throw new Error('a rule set needs --tier');
const runs = Number(values.runs);
const results = Array.from({ length: runs }, (_, i) => playRun(player, 5000000 + i, tier, cap));

const scores = results.map(r => r.score).sort((a, b) => a - b);
const killedBy = {};
for (const r of results) if (r.killer) killedBy[r.killer] = (killedBy[r.killer] ?? 0) + 1;
const speeds = results.filter(r => r.killer).map(r => r.speed);
const report = {
  model: ruleSet
    ? `${name}: ${ruleSet.rules.length} hand-written rules (${ruleSet.summary})`
    : `${values.model}: tier ${model.tier} (trained on ${model.trainedOn.join(' → ')}), generation ${model.generation}`,
  tier,
  runs,
  mean: Math.round(scores.reduce((a, b) => a + b, 0) / runs),
  median: Math.round(scores[Math.floor(runs / 2)]),
  min: Math.round(scores[0]),
  max: Math.round(scores.at(-1)),
  cleared: TIERS[tier].minutes
    ? `${results.filter(r => !r.killer).length}/${runs} lasted the ${TIERS[tier].minutes} minutes`
    : `${results.filter(r => r.score >= cap).length}/${runs} reached ${cap}`,
  birdJumps: (({ passed, jumped }) => `${jumped}/${passed} lone birds jumped (${passed ? Math.round((100 * jumped) / passed) : 0}%)`)(
    results.reduce((t, r) => ({ passed: t.passed + r.birds.passed, jumped: t.jumped + r.birds.jumped }), { passed: 0, jumped: 0 }),
  ),
  killedBy,
  speedAtDeath: speeds.length ? `${Math.min(...speeds).toFixed(2)}–${Math.max(...speeds).toFixed(2)}` : 'none',
};
console.log(JSON.stringify(report, null, 2));
const out = new URL(resultsDir(name), import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL(`evaluation-tier${tier}${cap === SCORE_CAP ? '' : `-cap${cap}`}.json`, out), JSON.stringify(report, null, 2) + '\n');
