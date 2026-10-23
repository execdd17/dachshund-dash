// Watch the trained network (models/best.json) play the training environment
// in real time, drawn by the game's own renderer. The two obstacles it looks
// at are outlined, and its current choice shows above the dog. A run that
// ends restarts on a new random seed.

import { createEnv, ACTIONS, DECIDE_EVERY } from './env.js';
import { observe } from './observe.js';
import { choose, fromJSON } from './net.js';
import { draw } from '../js/render/draw.js';
import { createView } from '../js/render/view.js';
import { createSpriteStore, loadDogSprites, loadSquirrelSprites, loadBirdSprites } from '../js/assets/sprites.js';
import { createCosmetics } from '../js/cosmetics/cosmetics.js';
import { createSilentMusic } from '../js/audio/music.js';
import { DT_BASELINE, DOG_HITBOX_STAND } from '../js/config.js';

const STEP_MS = DECIDE_EVERY * DT_BASELINE;  // game time per decision
const RESTART_MS = 2500;                     // real time on the game-over screen before the next run
const LOOK_COLORS = ['#FFD84A', 'rgba(255, 216, 74, 0.45)'];
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

const model = await (await fetch('ai/models/best.json')).json();
const net = fromJSON(model);

let env, action = 'none', speed = 1, budget = 0, endedAt = 0, runs = 0, best = 0;
const resize = () => {
  view.resize();
  if (env) env.state.skyTop = -view.extraTop;
};
new ResizeObserver(resize).observe(canvas);

function newRun() {
  env = createEnv(Math.floor(Math.random() * 1e9)).reset();
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

// The network's view: its two obstacles outlined, its choice above the dog.
function drawVision(state) {
  const { dog } = state;
  const ahead = state.obstacles
    .filter(o => o.x + o.width > dog.x + DOG_HITBOX_STAND.dx)
    .sort((a, b) => a.x - b.x)
    .slice(0, LOOK_COLORS.length);
  ctx.save();
  ctx.scale(view.scale, view.scale);
  ctx.translate(view.offsetX, view.extraTop);
  ctx.lineWidth = 2;
  ahead.forEach((o, i) => {
    ctx.strokeStyle = LOOK_COLORS[i];
    ctx.setLineDash(i ? [4, 3] : []);
    ctx.strokeRect(o.x - 3, o.y - 3, o.width + 6, o.height + 6);
  });
  const look = ACTION_LOOK[action];
  if (look && state.gameState === 'running') {
    ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'center';
    ctx.fillStyle = look.color;
    ctx.fillText(look.text, dog.x + 48, dog.y - 22);
  }
  ctx.restore();
}

function showStats(state) {
  best = Math.max(best, state.score);
  document.getElementById('stats').innerHTML =
    `run <b>${runs}</b> · score <b>${Math.floor(state.score)}</b> · speed <b>${state.speed.toFixed(2)}</b>` +
    ` · best <b>${Math.floor(best)}</b> · model gen ${model.generation}`;
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
