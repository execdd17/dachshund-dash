// Watch a trained network play its tier in real time, drawn by the game's own
// renderer, with what it sees shown: on the game, each obstacle its radar is
// tracking boxed (the nearest solid), a strip in each height band over what's
// in it, and its choice above the dog; below, a panel with its 22 inputs as it
// last read them, its scores for each action, and the network itself, live. The picker lists the trained
// models (models/index.json); ?model=tier2 opens one. 1× to 10× speed. A run
// that ends restarts on a new random seed.

import { createEnv, ACTIONS, DECIDE_EVERY } from './env.js';
import { observe, radar, BANDS, DOG_INPUTS, PER_BAND, INPUT_LABELS } from './observe.js';
import { activations, activationOf, weightIndex } from './net.js';
import { loadNet, modelFile } from './models.js';
import { TIERS } from './tiers.js';
import { draw } from '../js/render/draw.js';
import { createView } from '../js/render/view.js';
import { createSpriteStore, loadDogSprites, loadSquirrelSprites, loadBirdSprites } from '../js/assets/sprites.js';
import { createCosmetics } from '../js/cosmetics/cosmetics.js';
import { createSilentMusic } from '../js/audio/music.js';
import { OBSTACLE_TYPES, getObstacleHitbox } from '../js/systems/obstacleTypes.js';
import { DT_BASELINE, W } from '../js/config.js';

const STEP_MS = DECIDE_EVERY * DT_BASELINE;  // game time per decision
const RESTART_MS = 2500;                     // real time on the game-over screen before the next run
const BAND_COLORS = ['#B48CFF', '#6FB6FF', '#FFD84A', '#FF7A59'];  // high air, low air, head, ground
const ACTION_LOOK = { jump: { text: 'JUMP', color: '#7CFF8A' }, duck: { text: 'DUCK', color: '#7CC8FF' } };
const PANEL_MS = 100;  // how often the inputs panel refreshes (real time)

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

const picker = document.getElementById('model');
let model, net, tier;

// The picker's models, labeled with their tier and what they trained through.
const index = await (await fetch('ai/models/index.json')).json();
for (const m of index) {
  const option = document.createElement('option');
  option.value = m.name;
  option.textContent = `${m.name}: tier ${m.tier} (${TIERS[m.tier]?.name ?? '?'}), trained ${m.trainedOn.join(' → ')}, gen ${m.generation}`;
  picker.append(option);
}

// Load a model by name and start a run with it; the URL keeps the choice.
async function useModel(name) {
  try {
    const path = `ai/${modelFile(name)}`;
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path}: ${response.status}`);
    model = await response.json();
    net = loadNet(model);
  } catch (e) {
    // Say why, rather than leave a blank page.
    document.getElementById('stats').textContent = `Couldn't load the model (${e.message}).`;
    throw e;
  }
  tier = model.tier;
  picker.value = name;
  // Only the query changes: a relative URL here would resolve against <base> (the repo root).
  const url = new URL(location.href);
  url.searchParams.set('model', name);
  history.replaceState(null, '', url);
  best = 0;
  runs = 0;
  newRun();
}

let env, action = 'none', speed = 1, budget = 0, endedAt = 0, runs = 0, best = 0;
let layers = null, panelAt = 0;  // the network's last pass: its inputs, hidden values, and scores
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
  layers = activations(net, observe(env.state));
}

// --- The inputs panel ---

const el = (tag, className, parent, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  parent?.append(node);
  return node;
};
const barRow = (parent, label) => {
  const row = el('div', 'row', parent);
  el('span', 'label', row, label);
  const fill = el('i', '', el('div', 'bar', row));
  return { row, fill, value: el('span', 'value', row) };
};
const dogRows = DOG_INPUTS.map(name => barRow(document.getElementById('dogInputs'), name));
const bandRows = BANDS.map((band, i) => {
  const box = el('div', 'band', document.getElementById('radarInputs'));
  const name = el('div', 'name', box);
  el('b', '', name, band.name).style.color = BAND_COLORS[i];
  el('span', '', name, band.means);
  const track = el('div', 'track', box);
  return Array.from({ length: PER_BAND }, (_, k) => {
    const segment = el('i', k ? 'next' : '', track);
    segment.style.background = BAND_COLORS[i];
    return segment;
  });
});
const choiceRows = ACTIONS.map(name => {
  const r = barRow(document.getElementById('choice'), name);
  r.value.remove();
  return r;
});

// Refresh the panel from what the network last read and how it scored the actions.
function showPanel() {
  const [inputs, , scores] = layers;
  dogRows.forEach((r, i) => {
    const v = inputs[i];
    r.fill.style.width = `${Math.min(1, Math.abs(v)) * 100}%`;
    r.value.textContent = v.toFixed(2);
  });
  // Radar inputs come in (reaches the dog, gone past) pairs, in units of the
  // track's span (half a second), clamped to ±1: draw each as a segment.
  bandRows.forEach((segments, band) => segments.forEach((segment, k) => {
    const at = DOG_INPUTS.length + (band * PER_BAND + k) * 2;
    const from = Math.max(0, inputs[at]);
    const to = Math.min(1, Math.max(0, inputs[at + 1]));
    segment.style.display = to > from || (from === 0 && to > 0) ? '' : 'none';
    segment.style.left = `${from * 100}%`;
    segment.style.width = `${Math.max(0, to - from) * 100}%`;
  }));
  // The scores as shares (softmax), the chosen action highlighted.
  const top = Math.max(...scores);
  const weights = scores.map(s => Math.exp(s - top));
  const total = weights.reduce((a, b) => a + b, 0);
  choiceRows.forEach((r, i) => {
    r.fill.style.width = `${(weights[i] / total) * 100}%`;
    r.row.classList.toggle('chosen', ACTIONS[i] === action);
  });
}

// What to draw: a tier without the frenzy holds it off by marking it started
// (env.js), so draw that as never started, without its bursts.
function shown(state) {
  if (TIERS[tier].frenzy) return state;
  return { ...state, frenzyAt: 0, effects: state.effects.filter(e => e.kind !== 'burst') };
}

// Where an obstacle shows: its sprite, except a thrown acorn, drawn at its
// hitbox's height rather than its own (chaseAcornY), so its hitbox, padded.
function outlineOf(o) {
  if (o.skin === 'chase' && OBSTACLE_TYPES[o.type].aerial) {
    const b = getObstacleHitbox(o);
    return { x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 };
  }
  return { x: o.x - 3, y: o.y - 3, w: o.width + 6, h: o.height + 6 };
}

// What it sees: a strip in each band (clipped to the visible sky) over what's
// in it, and a box around each obstacle it's tracking, the nearest solid.
function drawVision(state) {
  const bands = radar(state);
  const seen = [...new Set(bands.flat().map(b => b.obstacle))].sort((a, b) => a.x - b.x);
  ctx.save();
  ctx.scale(view.scale, view.scale);
  ctx.translate(view.offsetX, view.extraTop);
  bands.forEach((boxes, i) => {
    const top = Math.max(BANDS[i].top, -view.extraTop);
    const bottom = Math.min(BANDS[i].bottom, 250);
    ctx.fillStyle = BAND_COLORS[i];
    ctx.globalAlpha = 0.3;
    ctx.fillRect(0, top, 6, bottom - top);  // the band's legend, at the left edge
    boxes.forEach((b, k) => {
      ctx.globalAlpha = k ? 0.14 : 0.3;
      ctx.fillRect(b.x, top, Math.min(b.w, W - b.x), bottom - top);
    });
  });
  ctx.globalAlpha = 1;
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#FFD84A';
  const nearestX = seen[0]?.x;
  for (const o of seen) {
    const box = outlineOf(o);
    ctx.setLineDash(o.x === nearestX ? [] : [4, 3]);
    ctx.strokeRect(box.x, box.y, box.w, box.h);
  }
  ctx.setLineDash([]);
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
    ` · best <b>${Math.floor(best)}</b>`;
}

// --- The network diagram ---

const netCanvas = document.getElementById('net');
const netCtx = netCanvas.getContext('2d');
const POSITIVE = [255, 154, 60];
const NEGATIVE = [77, 163, 255];
const NEUTRAL = [58, 62, 72];

// A value in −1…1 as a color: grey at 0, toward orange (+) or blue (−).
function tint(v, alpha = 1) {
  const k = Math.min(1, Math.abs(v));
  const to = v >= 0 ? POSITIVE : NEGATIVE;
  const [r, g, b] = NEUTRAL.map((c, i) => Math.round(c + (to[i] - c) * k));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// The network as columns of neurons, each colored by its value, joined by
// lines as bright as the signal each weight is passing right now.
function drawNetwork() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const width = netCanvas.clientWidth;
  const height = netCanvas.clientHeight;
  if (netCanvas.width !== width * dpr) netCanvas.width = width * dpr;
  if (netCanvas.height !== height * dpr) netCanvas.height = height * dpr;
  const g = netCtx;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, width, height);

  const narrow = width < 560;
  const labelFont = `${narrow ? 9 : 10}px Courier New`;
  g.font = labelFont;
  const labelW = Math.ceil(Math.max(...INPUT_LABELS.map(label => g.measureText(label).width))) + 12;
  const outLabelW = narrow ? 48 : 64;
  const top = narrow ? 42 : 34;
  const xs = [labelW + 8, labelW + 8 + (width - labelW - outLabelW - 16) * 0.5, width - outLabelW - 8];
  const ys = layers.map(values => values.map((_, i) => top + 6 + (i + 0.5) * ((height - top - 12) / values.length)));
  const scores = layers.at(-1);
  const scale = Math.max(1, ...scores.map(Math.abs));  // outputs aren't squashed: shade them relative to the largest
  const value = (l, i) => (l === layers.length - 1 ? layers[l][i] / scale : layers[l][i]);

  // Column headers: what each layer is and its activation, pinned left, centered, and right.
  g.font = `${narrow ? 10 : 11}px Courier New`;
  g.fillStyle = '#a3a7b1';
  const headers = [`${layers[0].length} inputs (none)`, `${layers[1].length} hidden (${activationOf(net, 1)})`, `${scores.length} outputs (${activationOf(net, 2)})`];
  [['left', 2], ['center', xs[1]], ['right', width - 2]].forEach(([align, x], l) => {
    g.textAlign = align;
    g.fillText(headers[l], x, l === 1 && narrow ? 30 : 16);  // on a phone the middle one drops a line
  });

  // Lines: each weight's signal (weight × the value feeding it), brightest per layer = most opaque.
  for (let l = 1; l < layers.length; l++) {
    const signals = [];
    let strongest = 1e-9;
    layers[l].forEach((_, j) => {
      const w = weightIndex(net, l, j) + 1;
      layers[l - 1].forEach((v, i) => {
        const s = net.weights[w + i] * v;
        signals.push([i, j, s]);
        strongest = Math.max(strongest, Math.abs(s));
      });
    });
    g.lineWidth = 1;
    for (const [i, j, s] of signals) {
      const k = Math.abs(s) / strongest;
      if (k < 0.04) continue;
      g.strokeStyle = tint(Math.sign(s), 0.08 + 0.75 * k);
      g.beginPath();
      g.moveTo(xs[l - 1], ys[l - 1][i]);
      g.lineTo(xs[l], ys[l][j]);
      g.stroke();
    }
  }

  // Neurons, colored by their values; the chosen output ringed.
  const chosen = scores.indexOf(Math.max(...scores));
  layers.forEach((values, l) => values.forEach((_, i) => {
    const r = l === layers.length - 1 ? 8 : narrow ? 4 : 5;
    g.fillStyle = tint(value(l, i));
    g.beginPath();
    g.arc(xs[l], ys[l][i], r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = l === layers.length - 1 && i === chosen ? '#7CFF8A' : '#15171b';
    g.lineWidth = l === layers.length - 1 && i === chosen ? 3 : 1;
    g.stroke();
  }));

  // Labels: the inputs on the left, the actions on the right.
  g.textAlign = 'right';
  g.font = labelFont;
  INPUT_LABELS.forEach((label, i) => {
    g.fillStyle = i < DOG_INPUTS.length ? '#cfd2d8' : BAND_COLORS[Math.floor((i - DOG_INPUTS.length) / (PER_BAND * 2))];
    g.fillText(label, xs[0] - 9, ys[0][i] + 3);
  });
  g.textAlign = 'left';
  g.font = `bold ${narrow ? 11 : 12}px Courier New`;
  ACTIONS.forEach((name, i) => {
    g.fillStyle = i === chosen ? '#7CFF8A' : '#a3a7b1';
    g.fillText(name, xs[2] + 13, ys[2][i] + 4);
  });
}

let last = performance.now();
function frame(t) {
  const elapsed = Math.min(t - last, 100);
  last = t;
  const { state } = env;
  if (state.gameState === 'running') {
    budget += elapsed * speed;
    while (budget >= STEP_MS && state.gameState === 'running') {
      layers = activations(net, observe(state));
      const scores = layers.at(-1);
      action = ACTIONS[scores.indexOf(Math.max(...scores))];
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
  if (t - panelAt > PANEL_MS) {
    showPanel();
    drawNetwork();
    panelAt = t;
  }
  requestAnimationFrame(frame);
}

document.getElementById('newRun').addEventListener('click', newRun);
for (const btn of document.querySelectorAll('[data-speed]')) {
  btn.addEventListener('click', () => {
    speed = Number(btn.dataset.speed);
    document.querySelectorAll('[data-speed]').forEach(b => b.classList.toggle('on', b === btn));
  });
}

picker.addEventListener('change', () => useModel(picker.value));
const asked = new URLSearchParams(location.search).get('model')?.replace(/^.*\/|\.json$/g, '');
await useModel(index.some(m => m.name === asked) ? asked : index.at(-1).name);
resize();
requestAnimationFrame(frame);
