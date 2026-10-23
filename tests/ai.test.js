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
import { PATTERN_CLOSE_GAP } from '../js/config.js';
import { seededRng } from '../ai/env.js';

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
