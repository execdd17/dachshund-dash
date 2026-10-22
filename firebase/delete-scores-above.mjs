#!/usr/bin/env node
// Bulk-delete scores strictly above a threshold, on every board. Uses Admin
// SDK (bypasses client rules). The dry run lists each one (keep its output as
// a record of what was there).
//
// Usage:
//   node firebase/delete-scores-above.mjs 5000 --dry-run
//   node firebase/delete-scores-above.mjs 5000

import { getAdminDb } from './lib/init.mjs';

const BATCH_SIZE = 500;

const args = process.argv.slice(2).filter((a) => a !== '--');
const dryRun = args.includes('--dry-run');
const threshold = Number(args.find((a) => a !== '--dry-run'));

if (!Number.isFinite(threshold)) {
  console.error('Usage: node firebase/delete-scores-above.mjs <score> [--dry-run]');
  process.exit(1);
}

const db = getAdminDb();
const query = () => db.collection('scores').where('score', '>', threshold).limit(BATCH_SIZE);

if (dryRun) {
  const snap = await db.collection('scores').where('score', '>', threshold).get();
  const rows = snap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .sort((a, b) => b.score - a.score);
  for (const r of rows) {
    const when = r.timestamp?.toDate?.().toISOString() ?? r.timestamp;
    console.log(`[dry-run] ${String(r.score).padStart(6)}  ${(r.difficulty ?? '?').padEnd(9)}  ${(r.name ?? '').padEnd(12)}  ${when}  ${r.id}`);
  }
  console.log(`Dry run complete. Would delete ${rows.length} document(s) with score > ${threshold}.`);
  process.exit(0);
}

let total = 0;
while (true) {
  const snap = await query().get();
  if (snap.empty) break;
  const batch = db.batch();
  snap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  total += snap.size;
  console.log(`Deleted ${total}…`);
}
console.log(`Done. Deleted ${total} document(s) with score > ${threshold}.`);
