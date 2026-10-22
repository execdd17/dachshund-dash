#!/usr/bin/env node
// Keep only each difficulty's top GLOBAL_MAX_SCORES scores (the most the game
// ever shows or reads) and delete the rest. Uses Admin SDK (bypasses client
// rules). Ranks the way the game does: score desc, then earlier timestamp.
// Reads every score once, so run it occasionally, not on a schedule.
//
// Usage:
//   node firebase/prune-scores.mjs --dry-run
//   node firebase/prune-scores.mjs

import { DIFFICULTY_LEVELS, GLOBAL_MAX_SCORES } from '../js/config.js';
import { getAdminDb } from './lib/init.mjs';

const BATCH_SIZE = 500;
const dryRun = process.argv.includes('--dry-run');
const db = getAdminDb();
let total = 0;

for (const { label } of DIFFICULTY_LEVELS) {
  const snap = await db.collection('scores')
    .where('difficulty', '==', label)
    .orderBy('score', 'desc')
    .orderBy('timestamp', 'asc')
    .get();
  const extra = snap.docs.slice(GLOBAL_MAX_SCORES);
  const lowestKept = snap.docs[Math.min(snap.size, GLOBAL_MAX_SCORES) - 1]?.data().score;
  console.log(`${label}: ${snap.size} scores, ${dryRun ? 'would delete' : 'deleting'} ${extra.length}`
    + (extra.length ? ` (keeping ${Math.floor(lowestKept)} and up)` : ''));
  if (dryRun) {
    total += extra.length;
    continue;
  }
  for (let i = 0; i < extra.length; i += BATCH_SIZE) {
    const batch = db.batch();
    extra.slice(i, i + BATCH_SIZE).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
  total += extra.length;
}

console.log(dryRun
  ? `Dry run complete. Would delete ${total} document(s).`
  : `Done. Deleted ${total} document(s).`);
