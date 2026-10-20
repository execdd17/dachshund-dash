// Lockstep check for changes that shouldn't alter gameplay: runs a baseline
// checkout's update() and the working tree's side by side on identical seeds,
// frame times, and inputs, and compares the gameplay state after every frame.
//
// Usage: node tools/verify/lockstep.mjs [baseline=main] [frames=40000] [seeds=8]
//   baseline: a git ref or a directory. Exits 1 on the first divergence per seed.
//
// Both sides must share the current entry points (createState/resetRun,
// update, jump/duck, getScenePhase). An intended behavior change will show
// up here as a divergence; the report says where and in which fields.

import { checkout, ROOT, seededRng } from './lib.mjs';

const [baseline = 'main', framesArg = '40000', seedsArg = '8'] = process.argv.slice(2);
const FRAMES = Number(framesArg), SEEDS = Number(seedsArg);
const SCENE_IDS = ['chase', 'boss', 'tramp'];

async function load(root) {
  const mod = p => import(`${root}/${p}`);
  const [{ update }, { createState, resetRun }, { jump, duck }, { getScenePhase }, { createTestServices }] = await Promise.all([
    mod('js/systems/update.js'), mod('js/core/state.js'), mod('js/systems/control.js'),
    mod('js/systems/scenes.js'), mod('tests/helpers.js'),
  ]);
  return { update, createState, resetRun, jump, duck, getScenePhase, createTestServices };
}

// The gameplay-relevant state, one entry per field so a mismatch names it.
const project = s => ({
  gameState: s.gameState, score: s.score, hearts: s.hearts, speed: s.speed, nextObstacleIn: s.nextObstacleIn,
  dog: [s.dog.x, s.dog.y, s.dog.vy, s.dog.jumping, s.dog.doubleJumped, s.dog.ducking],
  invulnUntil: s.invulnUntil, giantPhase: s.giantPhase,
  scene: s.scene, sceneQueue: s.sceneQueue, lastSceneEndAt: s.lastSceneEndAt,
  obstacles: s.obstacles.map(o => `${o.type}:${o.x.toFixed(6)}:${o.y}:${o.skin ?? ''}`),
  effects: s.effects.map(e => `${e.kind}:${e.startTime}`),
  weatherRain: s.weatherRain,
});

function startRun(V, seed) {
  const s = V.createState(() => 0.5);
  s.gameState = 'running';
  s.startingHearts = 1e9;  // never die, so a run covers every encounter
  V.resetRun(s);
  return { V, s, services: V.createTestServices(), rng: seededRng(seed), now: 0 };
}

const [A, B] = await Promise.all([
  load(checkout(baseline)).catch(e => { console.error(`baseline ${baseline} lacks the current entry points: ${e.message}`); process.exit(2); }),
  load(ROOT),
]);
let frames = 0, diverged = 0;
const seen = new Set();

for (let seed = 1; seed <= SEEDS; seed++) {
  const runs = [startRun(A, seed), startRun(B, seed)];
  const input = seededRng(seed * 7919);
  let ok = true;
  for (let f = 0; f < FRAMES; f++) {
    const dt = 6 + input() * 14;  // 50–166 Hz frame times
    const act = input();
    for (const r of runs) {
      r.now += dt;
      if (act < 0.02) r.V.jump(r.s, r.services, r.now);
      else if (act < 0.03) r.V.duck(r.s, true, r.services);
      else if (act < 0.05) r.V.duck(r.s, false, r.services);
      r.V.update(r.s, dt, r.services, r.rng, r.now);
    }
    frames++;
    const [pa, pb] = runs.map(r => project(r.s));
    SCENE_IDS.forEach(id => seen.add(`${id}:${B.getScenePhase(runs[1].s, id)}`));
    seen.add(`giant:${pb.giantPhase}`);
    const fields = Object.keys(pa).filter(k => JSON.stringify(pa[k]) !== JSON.stringify(pb[k]));
    if (fields.length) {
      diverged++;
      ok = false;
      console.log(`seed ${seed}: DIVERGED at frame ${f} (t=${runs[0].now.toFixed(1)}ms, score ${Math.round(pa.score)}) in ${fields.join(', ')}`);
      for (const k of fields) console.log(`  ${k}\n    baseline ${JSON.stringify(pa[k])}\n    current  ${JSON.stringify(pb[k])}`);
      break;
    }
  }
  if (ok) console.log(`seed ${seed}: score ${Math.round(runs[1].s.score)}`);
}

console.log(`\n${frames} frames compared against ${baseline}; ${diverged} of ${SEEDS} seeds diverged`);
console.log(`phases reached: ${[...seen].sort().join(' ')}`);
process.exit(diverged ? 1 : 0);
