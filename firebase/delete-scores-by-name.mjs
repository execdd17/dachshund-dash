#!/usr/bin/env node
// Bulk-delete scores where name matches. Uses Admin SDK (bypasses client rules).
//
// Empty setup names become "PLAYER" via normalizeName() in js/leaderboard/local.js.
//
// Usage:
//   node firebase/delete-scores-by-name.mjs              # default: PLAYER
//   node firebase/delete-scores-by-name.mjs PLAYER --dry-run
//   node firebase/delete-scores-by-name.mjs TESTER

import { normalizeName } from '../js/leaderboard/local.js';
import { getAdminDb } from './lib/init.mjs';

const BATCH_SIZE = 500;
const DEFAULT_NAME = normalizeName('');

function usage() {
  console.error(`Usage: node firebase/delete-scores-by-name.mjs [name] [--dry-run]

  name       Stored player name (default: ${DEFAULT_NAME} — empty setup input)
  --dry-run  Count matches without deleting`);
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = args.includes('--dry-run');
const rawName = args.find((a) => a !== '--dry-run');
const name = rawName ? normalizeName(rawName) : DEFAULT_NAME;

if (args.some((a) => a === '--help' || a === '-h')) usage();

const db = getAdminDb();
let total = 0;

while (true) {
  const snap = await db.collection('scores')
    .where('name', '==', name)
    .limit(BATCH_SIZE)
    .get();

  if (snap.empty) break;

  if (dryRun) {
    total += snap.size;
    console.log(`[dry-run] would delete ${snap.size} (total ${total})`);
    if (snap.size < BATCH_SIZE) break;
    continue;
  }

  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  total += snap.size;
  console.log(`Deleted ${total}…`);
}

console.log(dryRun
  ? `Dry run complete. Would delete ${total} document(s) with name "${name}".`
  : `Done. Deleted ${total} document(s) with name "${name}".`);
