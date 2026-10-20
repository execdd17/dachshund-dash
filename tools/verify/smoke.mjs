// End-to-end smoke run in headless Chromium: the start overlay, every sound,
// the cosmetics menu, the controls tutorial, each encounter via its debug
// key, a death, and the restart lockout. Fails on page errors, console errors/warnings, and failed
// requests; screenshots key moments for eyeballing.
//
// Usage: node tools/verify/smoke.mjs [url]
//   Without a url it serves the working tree itself; pass one to check a
//   deployment (e.g. https://dachshund-dash.home/). Firestore is blocked, so
//   nothing reaches the production leaderboard.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launchBrowser, newPage, ROOT, serve } from './lib.mjs';

const outDir = path.join(os.tmpdir(), 'dachshund-smoke');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const server = process.argv[2] ? null : await serve(ROOT);
const base = process.argv[2] ?? server.url;

const EQUIPPED = { hat: 'tophat', sunglasses: 'aviator', clothes: 'sneakers-red', body: 'cape-hero' };
const problems = [];
// Expected noise: Firestore's client logging its blocked connection, and
// Chrome nudging about this script's own canvas pixel polling.
const isToolNoise = t => /firestore|Failed to load resource: net::ERR_FAILED$|willReadFrequently/i.test(t);

async function newGame(browser, label, difficulty, { tutorial = false } = {}) {
  const page = await newPage(browser);
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`[${label}] console.${m.type()}: ${m.text()}`); });
  page.on('pageerror', e => problems.push(`[${label}] pageerror: ${e.message}`));
  page.on('requestfailed', r => { if (!/firestore\.googleapis\.com/.test(r.url())) problems.push(`[${label}] request failed: ${r.url()}`); });
  page.on('response', r => { if (r.status() >= 400) problems.push(`[${label}] HTTP ${r.status()}: ${r.url()}`); });
  await page.addInitScript(({ eq, tutorial }) => {
    localStorage.setItem('dachshundDashEquippedCosmetics', JSON.stringify(eq));
    // A fresh profile would otherwise open every run with the tutorial.
    if (!tutorial) localStorage.setItem('dachshundDashTutorial', JSON.stringify({ version: Number.MAX_SAFE_INTEGER, seenAt: Date.now() }));
  }, { eq: EQUIPPED, tutorial });
  await page.goto(base);
  await page.waitForSelector('#nameEntryOverlay.visible');
  await page.fill('#nameInput', 'SMOKE');
  await page.$eval('#difficultySlider', (el, v) => { el.value = String(v); el.dispatchEvent(new Event('input')); }, difficulty);
  await page.click('#nameSubmitBtn');
  await page.$eval('#nameSubmitBtn', el => el.blur());  // else Space re-presses the button
  return page;
}

const shot = (page, file) => page.screenshot({ path: path.join(outDir, file) });

// Waits until the tutorial's gold prompt text (JUMP!, AGAIN!, DUCK!) is on
// screen, or with `shown` false, until it's gone.
const waitForPrompt = (page, shown = true) => page.waitForFunction(want => {
  const c = document.getElementById('game');
  const s = c.width / 800, top = c.height / s - 250;
  const d = c.getContext('2d').getImageData(330 * s, (58 + top) * s, 140 * s, 28 * s).data;
  let gold = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 1] > 130 && d[i + 2] < 90) gold++;
  return (gold > 40) === want;
}, shown, { timeout: 15000, polling: 50 });
const isRunning = page => page.evaluate(() => !document.getElementById('customizeBtn').classList.contains('visible'));
const VERY_EASY = 0, VERY_HARD = 4;  // 6 hearts survive unattended; 1 heart dies fast

const browser = await launchBrowser();
try {
  // Idle screen, every sound effect, the cosmetics menu.
  let page = await newGame(browser, 'idle', VERY_EASY);
  await page.waitForTimeout(400);
  await shot(page, '01-idle.png');
  await page.screenshot({ path: path.join(outDir, '00-fullpage.png'), fullPage: true });
  const played = await page.evaluate(async () => {
    const { createSfx, SFX_NAMES } = await import(new URL('js/audio/sfx.js', document.baseURI).href);  // the site may live under a subpath
    const sfx = createSfx();
    await new Promise(r => setTimeout(r, 300));  // let the chomp sample decode
    for (const name of SFX_NAMES) sfx[name]();
    return SFX_NAMES.length;
  });
  console.log(`played ${played} sound effects`);
  await page.click('#customizeBtn', { force: true });  // its idle animation never counts as "stable"
  await page.waitForTimeout(400);
  await shot(page, '02-cosmetics-menu.png');
  await page.click('#cosmeticsDoneBtn', { force: true });
  await page.close();

  // The tutorial, as a first visit sees it: wait for each gold prompt, act.
  page = await newGame(browser, 'tutorial', VERY_EASY, { tutorial: true });
  await page.click('#game');
  for (const [n, name, act] of [[1, 'jump', 'Space'], [2, 'tower-jump', 'Space'], [3, 'jump-again', 'Space'], [4, 'duck', 'ArrowDown']]) {
    await waitForPrompt(page);
    await shot(page, `tutorial-${n}-${name}.png`);
    await page.keyboard.down(act);
    await waitForPrompt(page, false);
    if (act === 'Space') await page.keyboard.up(act);
  }
  await page.waitForTimeout(700);
  await shot(page, 'tutorial-5-ready.png');
  await page.keyboard.up('ArrowDown');
  await page.waitForFunction(() => localStorage.getItem('dachshundDashTutorial'), null, { timeout: 5000 })
    .catch(() => problems.push('tutorial: not recorded as seen after finishing'));
  await page.close();

  // Each encounter: start a run, press its debug key, capture moments.
  const encounters = [
    { name: 'giant', key: 'KeyG', shots: [1500, 4000] },
    { name: 'chase', key: 'KeyC', shots: [3000, 7000] },
    { name: 'boss', key: 'KeyB', shots: [2500, 6000] },
    { name: 'tramp', key: 'KeyT', shots: [2500, 5000] },
    { name: 'rain', key: 'KeyR', shots: [2500] },
  ];
  for (const e of encounters) {
    page = await newGame(browser, e.name, VERY_EASY);
    await page.click('#game');
    await page.waitForTimeout(1500);
    await page.keyboard.press(e.key);
    let t = 0;
    for (const at of e.shots) {
      await page.waitForTimeout(at - t);
      t = at;
      await shot(page, `${e.name}-${at}.png`);
    }
    await page.close();
  }

  // Death (never jump), then the restart lockout: Space right after death is
  // ignored, Space a second later restarts.
  page = await newGame(browser, 'death', VERY_HARD);
  await page.click('#game');
  await page.waitForFunction(() => !document.getElementById('customizeBtn').classList.contains('visible'));
  await page.waitForFunction(() => document.getElementById('customizeBtn').classList.contains('visible'), null, { timeout: 30000 });
  await page.waitForTimeout(100);
  await shot(page, 'death.png');
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const restartedEarly = await isRunning(page);
  await page.waitForTimeout(1000);
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const restartedLate = await isRunning(page);
  if (restartedEarly || !restartedLate) problems.push(`restart lockout: restarted early=${restartedEarly} (want false), later=${restartedLate} (want true)`);
  await page.close();
} catch (e) {
  problems.push(`smoke run aborted: ${e.message}`);
} finally {
  await browser.close();
  server?.close();
}

const real = problems.filter(p => !isToolNoise(p));
console.log(real.length ? `PROBLEMS:\n${real.join('\n')}` : 'no problems');
console.log(`screenshots in ${outDir}`);
process.exit(real.length ? 1 : 0);
