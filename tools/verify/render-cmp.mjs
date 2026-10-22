// Render check for changes that shouldn't alter how the game looks: draws the
// same full frames with a baseline checkout and with the working tree in
// headless Chromium and compares pixels. Frames cover the time-of-day cycle,
// every obstacle type, every scene phase, giant mode, effects, rain, death,
// dog poses (including the tunnel crawl), and equipped cosmetics, all with
// the real sprites loaded.
//
// Usage: node tools/verify/render-cmp.mjs [baseline=main] [--save]
//   Differing frames are written as baseline-*.png / current-*.png to the
//   output dir; --save writes every current frame there too, for eyeballing.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkout, launchBrowser, newPage, ROOT, serve } from './lib.mjs';

const args = process.argv.slice(2);
const saveAll = args.includes('--save');
const baseline = args.find(a => !a.startsWith('--')) ?? 'main';
const outDir = path.join(os.tmpdir(), 'dachshund-render-cmp');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

// Runs in the page against that side's modules. Returns [{ name, hash, png } | { name, error }].
async function renderFrames() {
  const imp = p => import(`/js/${p}`);
  const [{ createState }, { draw }, sprites, { createCosmetics, COSMETIC_DEFS }, { OBSTACLE_TYPES, makeObstacle },
    { SCENES, setScenePhase }, { addEffect }, { initRain }] = await Promise.all([
    imp('core/state.js'), imp('render/draw.js'), imp('assets/sprites.js'), imp('cosmetics/cosmetics.js'),
    imp('systems/obstacleTypes.js'), imp('systems/scenes.js'), imp('systems/effects.js'), imp('systems/weather.js')]);

  const store = sprites.createSpriteStore();
  sprites.loadDogSprites(store); sprites.loadSquirrelSprites(store); sprites.loadBirdSprites(store);
  const noStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  const cosmetics = createCosmetics(noStorage);
  cosmetics.loadImages();
  const images = [];
  const collect = v => { if (v instanceof HTMLImageElement) images.push(v); else if (v && typeof v === 'object') Object.values(v).forEach(collect); };
  collect(store); collect(cosmetics.imageById);
  await Promise.all(images.map(img => img.decode().catch(() => {})));
  await new Promise(r => setTimeout(r, 50));  // let the all-loaded callbacks run

  let seed = 1;
  const rng = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const NOW = 100000;
  const fresh = () => {
    seed = 1;
    const s = createState(rng);
    s.gameState = 'running'; s.frameCount = 17; s.speed = 6;
    return s;
  };
  const allEquipped = Object.fromEntries(Object.entries(COSMETIC_DEFS).map(([slot, items]) => [slot, items[0]?.id ?? null]));

  const frames = [];
  const add = (name, setup, { equipped = {} } = {}) => frames.push({ name, setup, equipped });
  add('setup', s => { s.gameState = 'setup'; });
  add('idle', s => { s.gameState = 'idle'; });
  for (const score of [0, 300, 450, 650, 1000]) add(`score-${score}`, s => { s.score = score; });
  // Types without a default height (birds, the trampoline's heart) are placed by their spawner.
  const placed = type => (OBSTACLE_TYPES[type].y === undefined ? { y: 120 } : {});
  Object.keys(OBSTACLE_TYPES).forEach(type => add(`obstacle-${type}`, s => { s.obstacles = [makeObstacle(type, 260, placed(type)), makeObstacle(type, 520, placed(type))]; }));
  // A stretch of each scene's own field; other scenes share a generic one.
  const SCENE_FIELDS = {
    tramp: () => [makeObstacle('trampoline', 300), makeObstacle('thorns', 400), makeObstacle('thorns', 432), makeObstacle('heart', 470, { y: -37 })],
    tunnel: () => [
      makeObstacle('tunnel', 60, { width: 700 }), makeObstacle('tunnelHole', 60, { holeIndex: 0 }),
      makeObstacle('hedge', 300), makeObstacle('treat', 420), makeObstacle('tunnelHole', 500, { holeIndex: 1 }), makeObstacle('rock', 640),
    ],
  };
  const genericField = () => [makeObstacle('bird', 400), makeObstacle('frisbee', 600)];
  for (const def of SCENES) {
    for (const phase of ['pending', ...Object.keys(def.phases)]) {
      add(`scene-${def.id}-${phase}`, s => {
        setScenePhase(s, def.id, phase);
        s.obstacles = (SCENE_FIELDS[def.id] ?? genericField)();
      });
    }
  }
  if (OBSTACLE_TYPES.tunnel) {
    const tunnelField = s => { setScenePhase(s, 'tunnel', 'active'); s.obstacles = SCENE_FIELDS.tunnel(); };
    add('tunnel-hint', s => { tunnelField(s); s.obstacles.forEach(o => { o.x += 240; }); s.tunnelHintPending = true; });
    add('dog-underground', s => { tunnelField(s); s.obstacles.forEach(o => { o.x -= 100; }); Object.assign(s.dog, { underground: true, ducking: true }); });
    add('dog-diving', s => { tunnelField(s); Object.assign(s.dog, { underground: true, ducking: true, burrowChangedAt: NOW - 70 }); });
  }
  if (OBSTACLE_TYPES.cape) {
    const fly = (s, lane) => {
      setScenePhase(s, 'flight', 'active');
      Object.assign(s.scene, { lane, lift: 150 });
      Object.assign(s.dog, { flying: true, jumping: true, y: [-105, -40, 25][lane] });
      s.obstacles = [makeObstacle('bird', 420, { y: -61.5, aerialWall: true }), makeObstacle('treat', 600, { y: -42.5 })];
    };
    add('flight-hint', s => { fly(s, 1); s.flightHintPending = true; });
    add('dog-flying', s => { fly(s, 2); s.flightHintPending = false; addEffect(s, 'flightCall', NOW - 300); });
    add('dog-flying-rain', s => { fly(s, 0); s.flightHintPending = false; s.weatherRain = true; initRain(s, rng); });
    add('cape-away', s => { addEffect(s, 'capeAway', NOW - 300, { x: 90, y: 180, vx: -1.2, vy: -1.6, rotation: -0.3 }); });
  }
  for (const phase of ['growing', 'active', 'shrinking']) {
    add(`giant-${phase}`, s => { s.giantPhase = phase; s.giantStartTime = NOW - 2000; s.giantTransitionStart = NOW - 300; });
  }
  add('effects', s => {
    addEffect(s, 'chomp', NOW - 100, { x: 200, y: 150 });
    addEffect(s, 'bonk', NOW - 200, { x: 300, y: 120, width: 36, height: 22, vx: 0, vy: 0, rotation: 0.7, rotSpeed: 0, type: 'hotdog', skin: 'normal' });
    addEffect(s, 'birdJump', NOW - 150, { x: 400, y: 160 });
    addEffect(s, 'trampBounce', NOW - 50, { x: 500, y: 170 });
    addEffect(s, 'heartGain', NOW - 100, { x: 600, y: 60 });
    addEffect(s, 'heartBonus', NOW - 100, { x: 700, y: 100 });
    addEffect(s, 'pointsPickup', NOW - 100, { x: 100, y: 120, points: 25 });
  });
  add('hearts-regained', s => { s.startingHearts = 4; s.hearts = 3; s.heartGainedAt = NOW - 10; });
  add('rain', s => { s.weatherRain = true; initRain(s, rng); });
  add('dead', s => { s.gameState = 'dead'; s.deathTime = NOW - 5000; });
  add('invulnerable', s => { s.invulnUntil = NOW + 1000; });
  add('dog-jump', s => { Object.assign(s.dog, { jumping: true, vy: -4, y: s.dog.y - 60 }); });
  add('dog-doublejump', s => { Object.assign(s.dog, { jumping: true, doubleJumped: true, vy: 2, y: s.dog.y - 90 }); });
  add('dog-duck', s => { s.dog.ducking = true; });
  add('cosmetics-idle', s => { s.gameState = 'idle'; }, { equipped: allEquipped });
  add('cosmetics-run', () => {}, { equipped: allEquipped });
  add('cosmetics-jump', s => { Object.assign(s.dog, { jumping: true, vy: -4, y: s.dog.y - 60 }); }, { equipped: allEquipped });

  const canvas = document.createElement('canvas');
  canvas.width = 1600; canvas.height = 600;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const view = { scale: 2, extraTop: 50, offsetX: 0, safe: { top: 0, left: 0, right: 0, bottom: 0 } };
  const out = [];
  for (const f of frames) {
    try {
      const state = fresh();
      f.setup(state);
      cosmetics.equipped = { hat: null, sunglasses: null, clothes: null, body: null, ...f.equipped };
      // Every frame starts from the same animation clock, whatever pose the frame before left
      Object.assign(store, { dogSpriteAnim: 'idle', dogSpriteFrame: 0, dogSpriteLastAdvance: 0, squirrelSpriteFrame: 0, squirrelSpriteLastAdvance: 0, birdSpriteFrame: 0, birdSpriteLastAdvance: 0 });
      draw({ canvas, ctx, state, sprites: store, cosmetics, music: { isOn: () => true }, view, now: NOW });
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let hash = 0;
      for (let i = 0; i < d.length; i++) hash = (hash * 31 + d[i]) | 0;
      out.push({ name: f.name, hash, png: canvas.toDataURL('image/png') });
    } catch (e) {
      out.push({ name: f.name, error: e.message });
    }
  }
  return out;
}

async function renderSide(browser, dir) {
  const srv = await serve(dir);
  const page = await newPage(browser);
  // A blank page on the side's origin, so the game itself doesn't start.
  await page.route(`${srv.url}__blank`, r => r.fulfill({ contentType: 'text/html', body: '<!doctype html>' }));
  await page.goto(`${srv.url}__blank`);
  const result = await page.evaluate(renderFrames).catch(e => ({ error: e.message }));
  await page.close();
  srv.close();
  return result;
}

const browser = await launchBrowser();
const [base, cur] = [await renderSide(browser, checkout(baseline)), await renderSide(browser, ROOT)];
await browser.close();
for (const [label, r] of [['baseline', base], ['current', cur]]) {
  if (r.error) { console.error(`${label} failed to render: ${r.error}`); process.exit(2); }
}

const writePng = (file, dataUrl) => fs.writeFileSync(path.join(outDir, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
const baseByName = Object.fromEntries(base.map(f => [f.name, f]));
let differ = 0;
for (const c of cur) {
  const b = baseByName[c.name];
  let verdict;
  if (c.error || b?.error) verdict = `ERROR  baseline: ${b?.error ?? 'ok'} / current: ${c.error ?? 'ok'}`;
  else if (!b) verdict = 'NEW    (no baseline frame)';
  else if (b.hash === c.hash) verdict = 'SAME';
  else {
    verdict = 'DIFF';
    writePng(`baseline-${c.name}.png`, b.png);
    writePng(`current-${c.name}.png`, c.png);
  }
  if (saveAll && c.png) writePng(`current-${c.name}.png`, c.png);
  if (verdict !== 'SAME') differ++;
  console.log(`${verdict.padEnd(6)} ${c.name}`);
}
console.log(`\n${cur.length} frames compared against ${baseline}; ${differ} differ${differ || saveAll ? ` (images in ${outDir})` : ''}`);
process.exit(differ ? 1 : 0);
