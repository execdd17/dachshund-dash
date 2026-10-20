// Shared plumbing for the verification tools: baseline checkouts, a static
// server, and headless Chromium with the production leaderboard blocked.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// A directory holding `refOrDir`: an existing directory is used as is; a git
// ref is exported into a temp dir that's removed on exit.
export function checkout(refOrDir) {
  if (fs.existsSync(refOrDir) && fs.statSync(refOrDir).isDirectory()) return path.resolve(refOrDir);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dachshund-base-'));
  execSync(`git archive ${refOrDir} | tar -x -C ${dir}`, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  process.on('exit', () => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Seeded PRNG (mulberry32), so both sides of a comparison see the same stream.
export function seededRng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ico': 'image/x-icon',
};

// Serves `dir` on an ephemeral localhost port. Resolves to { url, close }.
export function serve(dir) {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(dir, rel);
    if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
    url: `http://127.0.0.1:${server.address().port}/`,
    close: () => server.close(),
  })));
}

// $CHROMIUM, else the newest Playwright-downloaded Chromium.
function chromiumPath() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const cache = path.join(os.homedir(), '.cache/ms-playwright');
  const builds = fs.existsSync(cache) ? fs.readdirSync(cache).filter(d => /^chromium-\d+$/.test(d)) : [];
  builds.sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
  const exe = builds.map(d => path.join(cache, d, 'chrome-linux64/chrome')).find(p => fs.existsSync(p));
  if (!exe) throw new Error('No Chromium found: set $CHROMIUM or run `npx playwright install chromium`');
  return exe;
}

// --no-sandbox: Ubuntu's AppArmor userns restriction aborts sandboxed Chromium.
export async function launchBrowser() {
  const { chromium } = await import('playwright-core');
  return chromium.launch({
    executablePath: chromiumPath(),
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
  });
}

// Every page these tools open goes through here: a headless death would
// otherwise post a real score to the global leaderboard.
export async function newPage(browser, options = {}) {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 }, ...options });
  const page = await context.newPage();
  await page.route(/firestore\.googleapis\.com/, r => r.abort());
  return page;
}
