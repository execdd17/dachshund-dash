# Firebase administration (local)

Repeatable Firestore setup and data ops from this machine. The game client (`js/firebase.js`) only reads/writes scores under security rules; everything here uses elevated credentials.

## One-time setup

### 1. Firebase CLI (rules + indexes)

```bash
npm install
npx firebase login
```

`firebase.json`, `.firebaserc`, `firestore.rules`, and `firestore.indexes.json` are the source of truth. Deploy with:

```bash
npm run firebase:deploy          # rules + indexes
npm run firebase:deploy:rules    # rules only
npm run firebase:deploy:indexes  # indexes only
```

After the first deploy, edit rules/indexes in the repo and redeploy — no more hand-pasting in the console.

To pull indexes that already exist in the console into the repo (one-time migration):

```bash
npx firebase firestore:indexes > firestore.indexes.json
```

Review the file, then `npm run firebase:deploy:indexes` so console and repo match.

### 2. Admin SDK (data scripts)

Download a service account key: **Firebase console → Project settings → Service accounts → Generate new private key**.

Save it as `firebase/service-account.json` (git-ignored). Or point elsewhere:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json
```

Firestore creates the `scores` collection automatically when the first score is submitted — there is nothing to provision for the collection itself.

## Data operations

### Delete all scores for one difficulty

```bash
# Preview
node firebase/delete-scores-by-difficulty.mjs NORMAL --dry-run

# Delete
node firebase/delete-scores-by-difficulty.mjs NORMAL
node firebase/delete-scores-by-difficulty.mjs "VERY HARD"
```

Valid labels: `VERY EASY`, `EASY`, `NORMAL`, `HARD`, `VERY HARD`, `HYPER` (must match `BOARD_LABELS` in `js/core/difficulty.js` and `firestore.rules`).

### Delete all scores for one player name

Older builds stored a blank name as `PLAYER` (see `normalizeName()` in `js/leaderboard/local.js`); the game no longer submits one.

```bash
# Preview default-name test runs
node firebase/delete-scores-by-name.mjs --dry-run

# Delete default-name scores
node firebase/delete-scores-by-name.mjs

# Delete a specific name (normalized to uppercase, max 12 chars)
node firebase/delete-scores-by-name.mjs TESTER --dry-run
node firebase/delete-scores-by-name.mjs TESTER
```

### Delete all scores above a threshold

On every board, scores strictly above the given value; the dry run lists each one (keep it as a record). Used when the game's late-run rules changed (the frenzy, from 5000).

```bash
node firebase/delete-scores-above.mjs 5000 --dry-run
node firebase/delete-scores-above.mjs 5000
```

### Trim each board to its top 25

The game only ever reads and shows a difficulty's top `GLOBAL_MAX_SCORES` (25). This deletes everything below that, ranked the way the game ranks (score desc, earlier timestamp first). It reads every score once, so run it now and then, not on a schedule.

```bash
node firebase/prune-scores.mjs --dry-run
node firebase/prune-scores.mjs
```

### Backup before bulk deletes

```bash
gcloud firestore export gs://YOUR_BUCKET/backups/$(date +%Y%m%d)
```

Requires a GCS bucket and `gcloud` authenticated to the same project (`dachshund-dash-b835a`).

## Adding more admin scripts

Put shared init in `firebase/lib/init.mjs` (`getAdminDb()`). New scripts go alongside `delete-scores-by-difficulty.mjs` and use the Admin SDK — same credential file, same batching pattern for large writes/deletes.
