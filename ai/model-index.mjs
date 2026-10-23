// models/index.json: what's in models/, for the viewer's picker (a browser
// can't list a folder). Training rewrites it whenever it saves a model; run
// this file to rebuild it by hand.
//
//   node ai/model-index.mjs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const MODELS = new URL('models/', import.meta.url);

export function writeModelIndex() {
  const models = readdirSync(MODELS)
    .filter(file => file.endsWith('.json') && file !== 'index.json')
    .map(file => {
      const { tier, trainedOn, generation, validation } = JSON.parse(readFileSync(new URL(file, MODELS), 'utf8'));
      return { name: file.replace(/\.json$/, ''), tier, trainedOn, generation, validation: Math.round(validation) };
    })
    .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  writeFileSync(new URL('index.json', MODELS), JSON.stringify(models, null, 2) + '\n');
  return models;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(writeModelIndex().map(m => m.name).join('\n'));
