#!/usr/bin/env node
// Bulk-delete scores where difficulty matches. Uses Admin SDK (bypasses client rules).
//
// Usage:
//   node firebase/delete-scores-by-difficulty.mjs NORMAL
//   node firebase/delete-scores-by-difficulty.mjs "VERY HARD" --dry-run

import { getAdminDb } from './lib/init.mjs';

const VALID = ['VERY EASY', 'EASY', 'NORMAL', 'HARD', 'VERY HARD'];
const BATCH_SIZE = 500;

function usage() {
  console.error(`Usage: node firebase/delete-scores-by-difficulty.mjs <difficulty> [--dry-run]

Difficulties: ${VALID.join(', ')}`);
  process.exit(1);
}

const args = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = args.includes('--dry-run');
const difficulty = args.find((a) => a !== '--dry-run');

if (!difficulty) usage();
if (!VALID.includes(difficulty)) {
  console.error(`Unknown difficulty "${difficulty}". Must be one of: ${VALID.join(', ')}`);
  process.exit(1);
}

const db = getAdminDb();
let total = 0;

while (true) {
  const snap = await db.collection('scores')
    .where('difficulty', '==', difficulty)
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
  ? `Dry run complete. Would delete ${total} document(s) with difficulty "${difficulty}".`
  : `Done. Deleted ${total} document(s) with difficulty "${difficulty}".`);
