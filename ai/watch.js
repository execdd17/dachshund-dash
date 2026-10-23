// Watch a trained network play its tier in real time, drawn by the game's own
// renderer, with its radar shown: in each height band, a strip over each thing
// it sees there, and its choice above the dog. ?model=ai/models/tier1.json
// picks the model (tier 2's by default). A run that ends restarts on a new
// random seed.

import { createEnv, ACTIONS, DECIDE_EVERY } from './env.js';
import { observe, radar, BANDS } from './observe.js';
import { choose } from './net.js';
import { loadNet, modelFile } from './models.js';
import { TIERS } from './tiers.js';
import { draw } from '../js/render/draw.js';
import { createView } from '../js/render/view.js';
import { createSpriteStore, loadDogSprites, loadSquirrelSprites, loadBirdSprites } from '../js/assets/sprites.js';
import { createCosmetics } from '../js/cosmetics/cosmetics.js';
import { createSilentMusic } from '../js/audio/music.js';
import { DT_BASELINE, W } from '../js/config.js';

const STEP_MS = DECIDE_EVERY * DT_BASELINE;  // game time per decision
const RESTART_MS = 2500;                     // real time on the game-over screen before the next run
const BAND_COLORS = ['#B48CFF', '#6FB6FF', '#FFD84A', '#FF7A59'];  // high air, low air, head, ground
const ACTION_LOOK = { jump: { text: 'JUMP', color: '#7CFF8A' }, duck: { text: 'DUCK', color: '#7CC8FF' } };

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const view = createView(canvas);
const sprites = createSpriteStore();
loadDogSprites(sprites);
loadSquirrelSprites(sprites);
loadBirdSprites(sprites);
const cosmetics = createCosmetics(localStorage);  // the dog wears what you equipped in the game
cosmetics.loadImages();
const music = createSilentMusic();

const path = new URLSearchParams(location.search).get('model') ?? `ai/${modelFile('tier2')}`;
let model, net;
try {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  model = await response.json();
  net = loadNet(model);
} catch (e) {
  // Say why, rather than leave a blank page.
  document.getElementById('stats').textContent = `Couldn't load the model (${e.message}).`;
  throw e;
}
const { tier } = model;

let env, action = 'none', speed = 1, budget = 0, endedAt = 0, runs = 0, best = 0;
const resize = () => {
  view.resize();
  if (env) env.state.skyTop = -view.extraTop;
};
new ResizeObserver(resize).observe(canvas);

function newRun() {
  env = createEnv({ seed: Math.floor(Math.random() * 1e9), tier }).reset();
  env.state.skyTop = -view.extraTop;
  runs++;
  budget = 0;
  endedAt = 0;
  action = 'none';
}

// What to draw: the environment holds the frenzy off by marking it started
// (env.js), so draw it as never started, without its bursts.
function shown(state) {
  return { ...state, frenzyAt: 0, effects: state.effects.filter(e => e.kind !== 'burst') };
}

// The radar: in each band (clipped to the visible sky), a strip over what it sees there.
function drawVision(state) {
  ctx.save();
  ctx.scale(view.scale, view.scale);
  ctx.translate(view.offsetX, view.extraTop);
  radar(state).forEach((boxes, i) => {
    const top = Math.max(BANDS[i].top, -view.extraTop);
    const bottom = Math.min(BANDS[i].bottom, 250);
    ctx.fillStyle = BAND_COLORS[i];
    ctx.globalAlpha = 0.12;
    ctx.fillRect(0, top, 6, bottom - top);  // the band's legend, at the left edge
    boxes.forEach((b, k) => {
      ctx.globalAlpha = k ? 0.12 : 0.28;
      ctx.fillRect(b.x, top, Math.min(b.w, W - b.x), bottom - top);
    });
  });
  ctx.globalAlpha = 1;
  const look = ACTION_LOOK[action];
  if (look && state.gameState === 'running') {
    ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'center';
    ctx.fillStyle = look.color;
    ctx.fillText(look.text, state.dog.x + 48, state.dog.y - 22);
  }
  ctx.restore();
}

function showStats(state) {
  best = Math.max(best, state.score);
  document.getElementById('stats').innerHTML =
    `run <b>${runs}</b> · score <b>${Math.floor(state.score)}</b> · speed <b>${state.speed.toFixed(2)}</b>` +
    ` · best <b>${Math.floor(best)}</b> · tier ${tier} (${TIERS[tier].name}) · gen ${model.generation}`;
}

let last = performance.now();
function frame(t) {
  const elapsed = Math.min(t - last, 100);
  last = t;
  const { state } = env;
  if (state.gameState === 'running') {
    budget += elapsed * speed;
    while (budget >= STEP_MS && state.gameState === 'running') {
      action = ACTIONS[choose(net, observe(state))];
      env.step(action);
      budget -= STEP_MS;
    }
    if (state.gameState !== 'running') endedAt = t;
  } else if (t - endedAt > RESTART_MS) {
    newRun();
  }
  draw({ canvas, ctx, state: shown(env.state), sprites, cosmetics, music, view, now: env.now });
  drawVision(env.state);
  showStats(env.state);
  requestAnimationFrame(frame);
}

document.getElementById('newRun').addEventListener('click', newRun);
for (const btn of document.querySelectorAll('[data-speed]')) {
  btn.addEventListener('click', () => {
    speed = Number(btn.dataset.speed);
    document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', b === btn));
  });
}

newRun();
resize();
requestAnimationFrame(frame);
