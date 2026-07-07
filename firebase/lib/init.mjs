import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_KEY = resolve(__dirname, '../service-account.json');

export function getAdminDb() {
  if (getApps().length) return getFirestore();

  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
    || process.env.FIREBASE_SERVICE_ACCOUNT
    || DEFAULT_KEY;

  if (!existsSync(credPath)) {
    throw new Error(
      `Service account key not found at ${credPath}.\n`
      + 'Download one: Firebase console → Project settings → Service accounts '
      + '→ Generate new private key → save as firebase/service-account.json\n'
      + 'Or set GOOGLE_APPLICATION_CREDENTIALS to the key path.',
    );
  }

  initializeApp({
    credential: cert(JSON.parse(readFileSync(credPath, 'utf8'))),
  });
  return getFirestore();
}
