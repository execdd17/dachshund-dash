// The AI training environment (ai/): it replays a seed exactly, each tier
// spawns only its kinds, and the radar reads each obstacle into the bands
// where it can hit the dog.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createEnv, ACTIONS } from '../ai/env.js';
import { TIERS } from '../ai/tiers.js';
import { observe, radar, INPUTS, BANDS, OBSERVATION } from '../ai/observe.js';
import { createNet } from '../ai/net.js';
import { saveable, loadNet } from '../ai/models.js';
import { SPAWN_KINDS } from '../js/systems/spawning.js';
import { PATTERN_CLOSE_GAP, BOSS_SPEED_MULTIPLIER, BOSS_CHASE_DURATION, DOG_HITBOX_STAND } from '../js/config.js';
import { setScenePhase } from '../js/systems/scenes.js';
import { makeObstacle, getObstacleHitbox } from '../js/systems/obstacleTypes.js';
import { seededRng } from '../ai/env.js';
import { RULE_SETS, decide } from '../ai/rules.js';
import { playRun, rulesPlayer } from '../ai/play.js';
import { DOG_INPUTS, PER_BAND } from '../ai/observe.js';

// Steps a tier with random actions until it ends (or `steps`), returning what it spawned and its score.
function run(tier, seed, steps = 4000) {
  const env = createEnv({ seed, tier }).reset();
  const actions = seededRng(seed + 1);
  const kinds = new Set();
  for (let i = 0; i < steps && !env.step(ACTIONS[Math.floor(actions() * 3)]).done; i++) {
    env.state.obstacles.forEach(o => kinds.add(o.kind));
  }
  return { kinds, score: env.state.score, obstacles: env.state.obstacles.map(o => `${o.kind}@${o.x.toFixed(2)}`) };
}

test('a seed replays the same run', () => {
  assert.deepEqual(run(1, 42), run(1, 42));
  assert.notDeepEqual(run(1, 42).obstacles, run(1, 43).obstacles);
});

test('each tier spawns only its kinds, and every one of them; only its scenes run', () => {
  for (const [tier, { solo, scenes = [] }] of Object.entries(TIERS)) {
    // An agent that never dies, so the runs go long: invulnerable, as if it always dodged.
    const kinds = new Set();
    const ran = new Set();
    for (const seed of [1, 2, 3]) {
      const env = createEnv({ seed, tier: Number(tier) }).reset();
      for (let i = 0; i < 6000 && !env.step('none').done; i++) {
        env.state.invulnUntil = Infinity;
        env.state.obstacles.forEach(o => kinds.add(o.kind));
        if (env.state.scene && env.state.scene.phase !== 'pending') ran.add(env.state.scene.id);
      }
    }
    // A chase's acorns are the 'chase' kind; whatever else it throws is one of the tier's.
    const expected = [...Object.keys(solo), ...(scenes.includes('chase') ? ['chase'] : [])];
    assert.deepEqual([...kinds].sort(), expected.sort(), `tier ${tier}`);
    for (const kind of kinds) assert.ok(SPAWN_KINDS[kind] || kind === 'chase', `${kind} is one of the game's kinds`);
    assert.deepEqual([...ran].sort(), [...scenes].sort(), `tier ${tier}: scenes that ran`);
  }
});

test('no two spawns come closer than the game\'s tightest gap, scenes ending included', () => {
  for (const tier of Object.keys(TIERS).map(Number)) {
    for (const seed of [1, 2, 3]) {
      const env = createEnv({ seed, tier }).reset();
      let closest = Infinity;
      for (let i = 0; i < 6000 && !env.step('none').done; i++) {
        env.state.invulnUntil = Infinity;
        // Obstacles spawned together (a stack, a pair) share an x; distinct spawns' left edges must be a gap apart.
        const xs = [...new Set(env.state.obstacles.map(o => Math.round(o.x)))].sort((a, b) => a - b);
        for (let k = 1; k < xs.length; k++) closest = Math.min(closest, xs[k] - xs[k - 1]);
      }
      assert.ok(closest >= PATTERN_CLOSE_GAP - 8, `tier ${tier}, seed ${seed}: spawns ${closest}px apart`);
    }
  }
});

test('tier 4: obstacles keep coming through every boss, including the frenzy boss, and no boss catches the dog', () => {
  const env = createEnv({ seed: 7, tier: 4 }).reset();
  const { state } = env;
  const bosses = [];  // each boss as it starts, and how many obstacles came while it ran
  const seen = new Set();
  let current = null;
  while (state.score < 6500 && !env.step('none').done) {
    state.invulnUntil = Infinity;  // obstacles can't hurt it; only the boss squirrel's catch could end the run
    const active = state.scene?.id === 'boss' && state.scene.phase === 'active';
    if (active && !current) bosses.push(current = { name: state.frenzyAt > 0 ? 'the frenzy boss' : `the boss at ${Math.round(state.score)}`, spawned: 0 });
    if (!active) current = null;
    for (const o of state.obstacles) if (!seen.has(o)) { seen.add(o); if (current) current.spawned++; }
  }
  assert.equal(state.gameState, 'running', 'no boss caught it');
  assert.ok(state.frenzyAt > 0, 'the frenzy started');
  assert.deepEqual(bosses.map(b => b.name.replace(/\d+/, 'N')), ['the boss at N', 'the boss at N', 'the frenzy boss']);
  // The real game spawns 10-21 in a boss (at a boss's wider gaps); before the fix, the environment spawned none.
  for (const { name, spawned } of bosses) assert.ok(spawned >= 8, `${name}: ${spawned} obstacles spawned during it`);
});

test('tier 5: hyper speed, its bosses and the frenzy, and a run that ends after 10 minutes with every point kept', () => {
  const env = createEnv({ seed: 3, tier: 5 }).reset();
  const { state } = env;
  assert.equal(state.speed, 4, 'hyper starts at 4.0');
  const bosses = [];
  let wasBoss = false;
  while (!env.step('none').done) {
    state.invulnUntil = Infinity;  // a dog that never dies: only time ends the run
    const boss = state.scene?.id === 'boss' && state.scene.phase === 'active';
    if (boss && !wasBoss) bosses.push(state.frenzyAt > 0 ? 'frenzy' : state.speed.toFixed(1));
    wasBoss = boss;
  }
  assert.ok(env.timeUp() && state.gameState === 'running', 'time, not death, ended it');
  assert.ok(Math.abs(env.now - 10 * 60000) < 100, `ended at ${env.now} ms`);
  assert.deepEqual(bosses, ['4.5', 'frenzy'], 'no 3.5 boss: hyper starts above it');
  assert.ok(env.birds.passed > 20 && env.birds.jumped === 0, `${env.birds.passed} birds passed, none jumped by a dog that never jumps`);
  const run = playRun(() => 'none', 3, 5);
  assert.ok(run.killer, 'a dog that never jumps dies');
  assert.ok(state.score > 8000, `no score cap on a timed tier: ${Math.round(state.score)}`);
});

test('the radar times things by how fast they really come: faster in a boss', () => {
  const env = createEnv({ seed: 1, tier: 4 }).reset();
  const { state } = env;
  const bar = makeObstacle('hotdog', 200);  // near enough to read under the radar's half-second cap
  state.obstacles = [bar];
  const nose = state.dog.x + DOG_HITBOX_STAND.dx + DOG_HITBOX_STAND.w;
  const groundReaches = () => observe(state)[observe(state).length - 4];  // the ground band's 1st: reaches
  const calm = groundReaches();
  setScenePhase(state, 'boss', 'active');
  state.scene.chaseFrames = BOSS_CHASE_DURATION / 2;  // the boss at full speed
  const boss = groundReaches();
  assert.ok(Math.abs(calm * state.speed * 60 - (getObstacleHitbox(bar).x - nose)) < 1e-6, 'distance ÷ speed, in half seconds');
  assert.ok(Math.abs(boss - calm / BOSS_SPEED_MULTIPLIER) < 1e-9, 'a boss brings it sooner');
});

// The bands a kind fills, as the radar reads it in front of the dog.
function bandsOf(kind, skin) {
  const env = createEnv({ seed: 1, tier: 1 }).reset();
  env.state.obstacles = SPAWN_KINDS[kind](300, skin, env.state.speed);
  return radar(env.state).flatMap((boxes, i) => (boxes.length ? [BANDS[i].name] : []));
}

test('the radar reads each obstacle into the bands where it can hit the dog', () => {
  assert.deepEqual(bandsOf('hotdog'), ['ground'], 'a chocolate bar: hits even a ducking dog');
  assert.deepEqual(bandsOf('bird'), ['low air', 'head'], 'a lone bird: a standing dog, not a ducking one');
  assert.deepEqual(bandsOf('frisbeePair'), ['low air', 'head']);
  assert.deepEqual(bandsOf('birdStack'), ['high air', 'low air', 'head'], 'a bird stack: too tall to jump');
  assert.deepEqual(bandsOf('tower'), ['high air', 'low air', 'head', 'ground'], 'a tower: every band, so the ground band tells it from a bird stack');
  assert.deepEqual(bandsOf('hotdog', 'chase'), ['ground'], 'a rolled acorn: jumped, like a chocolate bar');
  assert.deepEqual(bandsOf('bird', 'chase'), ['low air', 'head'], 'a thrown acorn: ducked');
});

test('observations have a fixed size; a model only loads with the observation it was trained on', () => {
  const env = createEnv({ seed: 1, tier: 1 }).reset();
  for (let i = 0; i < 300 && !env.step('none').done; i++) assert.equal(observe(env.state).length, INPUTS);
  const net = createNet([INPUTS, 4, ACTIONS.length], seededRng(1));
  assert.ok(loadNet(saveable(net, {})));
  assert.throws(() => loadNet({ ...saveable(net, {}), observation: 'slots-0' }), new RegExp(OBSERVATION));
});

// Inputs with nothing near, the dog on the ground, then `set` applied: dog inputs by name, things as [band, reaches, past].
function inputsWith({ dog = {}, things = [] } = {}) {
  const x = Array(INPUTS).fill(1);
  DOG_INPUTS.forEach((name, i) => { x[i] = dog[name] ?? 0; });
  for (const [band, reaches, past] of things) {
    const at = DOG_INPUTS.length + band * PER_BAND * 2;
    x[at] = reaches;
    x[at + 1] = past;
  }
  return x;
}

test('the naive rules do what they say', () => {
  const [HIGH_AIR, , HEAD, GROUND] = BANDS.keys();
  const naive = RULE_SETS.naive;
  const act = setup => decide(naive, inputsWith(setup)).action;
  assert.equal(act(), 'none', 'nothing near: nothing');
  assert.equal(act({ things: [[GROUND, 0.3, 0.6]] }), 'jump', 'a chocolate bar a fifth of a second off: jump');
  assert.equal(act({ things: [[GROUND, 0.6, 0.9]] }), 'none', 'still too far: wait');
  assert.equal(act({ dog: { 'in the air': 1 }, things: [[GROUND, 0.3, 0.6]] }), 'none', 'already in the air: no double jump for a bar');
  assert.equal(act({ things: [[HEAD, 0.3, 0.6]] }), 'duck', 'a bird at head height: duck');
  assert.equal(act({ things: [[HEAD, -0.2, 0.2]] }), 'duck', 'still at the dog: keep ducking');
  const tower = { things: [[HIGH_AIR, 0.2, 0.5], [GROUND, 0.2, 0.5]] };
  assert.equal(act({ ...tower, dog: { 'in the air': 1, 'vertical speed': -0.5 } }), 'none', 'a tower, still rising: wait');
  assert.equal(act({ ...tower, dog: { 'in the air': 1, 'vertical speed': 0.1 } }), 'jump', 'a tower, starting to fall: jump again');
  assert.equal(act({ ...tower, dog: { 'in the air': 1, 'vertical speed': 0.1, 'double jump used': 1 } }), 'none', 'double jump spent');
  // And it plays a run like a network does, through the same playRun.
  const run = playRun(rulesPlayer(naive), 1, 0);
  assert.ok(run.score > 0 && run.killer, 'it runs, and the naive rules die');
});

test('the tuned rules: jump so it is past before landing; a tower is one column, not an empty field or a bird stack', () => {
  const [HIGH_AIR, LOW_AIR, HEAD, GROUND] = BANDS.keys();
  const act = setup => decide(RULE_SETS.tuned, inputsWith(setup)).action;
  assert.equal(act(), 'none', 'nothing near: nothing');
  assert.equal(act({ things: [[GROUND, 0.3, 0.6]] }), 'jump', 'a bar that will be past before a jump lands: jump');
  assert.equal(act({ things: [[GROUND, 0.3, 0.8]] }), 'none', 'a wider one: not yet');
  assert.equal(act({ dog: { 'in the air': 1, 'vertical speed': 0.5, height: 0.5 } }), 'none', 'empty bands are no tower: no double jump');
  const stack = [[HIGH_AIR, 0.1, 0.4], [LOW_AIR, 0.1, 0.4], [HEAD, 0.1, 0.4]];
  assert.equal(act({ things: [...stack, [GROUND, 0.9, 1]] }), 'duck', 'a bird stack with a bar behind it is no tower: duck');
  const tower = [[HIGH_AIR, 0.5, 0.9], [LOW_AIR, 0.5, 0.9], [HEAD, 0.5, 0.9], [GROUND, 0.5, 0.9]];
  assert.equal(act({ things: tower }), 'jump', 'a tower: jump early, for a double jump');
  const falling = height => ({ 'in the air': 1, 'vertical speed': 0.3, height });
  assert.equal(act({ things: tower, dog: falling(0.9) }), 'none', 'over a tower, still high: wait');
  assert.equal(act({ things: tower, dog: falling(0.7) }), 'jump', 'over a tower, down to its height: jump again');
});
