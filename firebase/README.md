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

Valid labels: `VERY EASY`, `EASY`, `NORMAL`, `HARD`, `VERY HARD` (must match `DIFFICULTY_LEVELS` in `js/config.js` and `firestore.rules`).

### Delete all scores for one player name

Empty setup names are stored as `PLAYER` (see `normalizeName()` in `js/leaderboard/local.js`).

```bash
# Preview default-name test runs
node firebase/delete-scores-by-name.mjs --dry-run

# Delete default-name scores
node firebase/delete-scores-by-name.mjs

# Delete a specific name (normalized to uppercase, max 12 chars)
node firebase/delete-scores-by-name.mjs TESTER --dry-run
node firebase/delete-scores-by-name.mjs TESTER
```

### Backup before bulk deletes

```bash
gcloud firestore export gs://YOUR_BUCKET/backups/$(date +%Y%m%d)
```

Requires a GCS bucket and `gcloud` authenticated to the same project (`dachshund-dash-b835a`).

## Adding more admin scripts

Put shared init in `firebase/lib/init.mjs` (`getAdminDb()`). New scripts go alongside `delete-scores-by-difficulty.mjs` and use the Admin SDK — same credential file, same batching pattern for large writes/deletes.
