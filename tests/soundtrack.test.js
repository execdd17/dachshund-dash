// The soundtrack: which track the game wants (systems/soundtrack.js), that
// update() hands it to the music player every frame, and the player's own
// rules (audio/music.js) against a stand-in for the browser's Audio.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import { createState } from '../js/core/state.js';
import { update } from '../js/systems/update.js';
import { soundtrackFor } from '../js/systems/soundtrack.js';
import { killDog } from '../js/systems/death.js';
import { activateGiantMode, deactivateGiantMode } from '../js/systems/giant.js';
import { TRACKS, createMusic } from '../js/audio/music.js';
import { FRENZY_SPEED, MUSIC_FADE_MS, TAPE_STOP_MS, DROP_SILENCE_MS, INITIAL_SPEED, SPEED_INCREMENT, MAX_SPEED } from '../js/config.js';
import { createTestServices, normalScoreAt } from './helpers.js';
import { drawScore } from '../js/render/hud.js';

const FRENZY_AT = normalScoreAt(FRENZY_SPEED);  // the frenzy's speed, in a normal run

function runningState(score = 0) {
  const state = createState(() => 0.5);
  state.gameState = 'running';
  state.startingHearts = state.hearts = 99;
  state.score = score;
  return state;
}
const frenzied = score => Object.assign(runningState(score), { frenzyAt: 1 });

test('the main track until the frenzy, giant mode its own; the frenzy track then holds through giant mode', () => {
  const services = createTestServices();
  assert.equal(soundtrackFor(runningState(FRENZY_AT)), 'main', 'the score alone starts nothing');
  const early = runningState(1000);
  activateGiantMode(early, services, 0);
  assert.equal(soundtrackFor(early), 'giant');
  deactivateGiantMode(early, services, 1000);  // the shrink already hands back
  assert.equal(soundtrackFor(early), 'main');
  const late = frenzied(FRENZY_AT + 500);
  assert.equal(soundtrackFor(late), 'frenzy');
  activateGiantMode(late, services, 0);
  assert.equal(soundtrackFor(late), 'frenzy', 'no cut away from the frenzy track');
  for (const gameState of ['setup', 'idle', 'dead']) {
    assert.equal(soundtrackFor({ ...frenzied(FRENZY_AT + 500), gameState }), 'main', gameState);
  }
});

test('hyper mode rests on its own track, in a run and between runs, and keeps the frenzy track', () => {
  const hyper = Object.assign(runningState(300), { hyper: true });
  assert.equal(soundtrackFor(hyper), 'hyper');
  assert.equal(soundtrackFor({ ...hyper, gameState: 'dead' }), 'hyper');
  assert.equal(soundtrackFor({ ...hyper, frenzyAt: 1 }), 'frenzy');
});

test('every track the game can ask for exists, with its file', () => {
  for (const id of ['main', 'hyper', 'frenzy', 'giant']) {
    assert.ok(TRACKS[id], id);
    assert.ok(existsSync(new URL(`../${TRACKS[id].src}`, import.meta.url)), TRACKS[id].src);
  }
  assert.deepEqual(Object.keys(TRACKS).filter(id => TRACKS[id].main), ['main', 'hyper'], 'each mode rests on one track');
});

test('update() keeps the music on the wanted track, between runs too', () => {
  const services = createTestServices();
  const state = runningState(FRENZY_AT - 0.01);
  state.nextObstacleIn = Infinity;
  update(state, 1000 / 120, services, () => 0.5, 10);
  assert.equal(services.music.current(), 'main');
  update(state, 1000 / 120, services, () => 0.5, 20);  // the score crosses FRENZY_AT: the drop
  update(state, 1000 / 120, services, () => 0.5, 30);
  assert.equal(services.music.current(), 'frenzy');
  killDog(state, services, 40);
  update(state, 1000 / 120, services, () => 0.5, 50);
  assert.equal(services.music.current(), 'main', 'game over: back to the main track');
});

// Counts the flame curves drawScore draws for a state.
function flameCurves(state) {
  let curves = 0;
  const ctx = new Proxy({}, {
    get: (target, key) => {
      if (key in target) return target[key];
      if (key === 'measureText') return () => ({ width: 54 });
      return () => { if (key === 'quadraticCurveTo') curves++; };
    },
    set: (target, key, value) => { target[key] = value; return true; },
  });
  drawScore(ctx, state, null, 1000);
  return curves;
}

test('the score catches fire with the frenzy, and only then', () => {
  assert.equal(flameCurves(runningState(FRENZY_AT)), 0, 'not before the drop');
  assert.ok(flameCurves(frenzied(FRENZY_AT)) > 0);
  assert.equal(flameCurves({ ...frenzied(FRENZY_AT + 500), gameState: 'dead' }), 0, 'out with the music at game over');
});

test('at max speed the fire gains a white-hot core', () => {
  const catching = frenzied(FRENZY_AT);
  catching.speed = INITIAL_SPEED + FRENZY_AT * SPEED_INCREMENT;
  const maxed = frenzied(FRENZY_AT + 3000);
  maxed.speed = MAX_SPEED;
  assert.ok(flameCurves(maxed) > flameCurves(catching), 'one more layer of tongues');
});

// --- The player, with fake Audio and document ---

// A Web Audio stand-in: each gain's value jumps to its latest scheduled
// target (`ramps` records the ramp lengths in seconds).
function fakeAudioContext(ramps) {
  return class {
    constructor() { this.currentTime = 0; }
    createGain() {
      const param = {
        value: 1,
        cancelScheduledValues() {},
        setValueAtTime(v) { param.value = v; },
        linearRampToValueAtTime(v, t) { ramps.push(t); param.value = v; },
      };
      return { gain: param, connect: dest => dest };
    }
    createMediaElementSource() { return { connect: gain => gain }; }
    get destination() { return {}; }
  };
}

// Runs fn(music, audioOf, gainOf) with a started player; audioOf(id) is a
// track's fake Audio, gainOf(id) its gain (with `webAudio`).
function withFakeBrowser(fn, { webAudio = null } = {}) {
  const saved = { Audio: globalThis.Audio, document: globalThis.document, AudioContext: globalThis.AudioContext };
  globalThis.AudioContext = webAudio ?? undefined;
  const made = new Map();
  const listeners = [];
  globalThis.Audio = class {
    constructor(src) { this.currentTime = 0; this.paused = true; made.set(src, this); }
    play() { this.paused = false; return Promise.resolve(); }
    pause() { this.paused = true; }
  };
  globalThis.document = { addEventListener: (type, f) => listeners.push([type, f]), removeEventListener() {} };
  const gains = new Map();
  if (webAudio) {
    const Ctx = webAudio;
    globalThis.AudioContext = class extends Ctx {
      createMediaElementSource(a) { return { connect: gain => { gains.set(a, gain); return gain; } }; }
    };
  }
  try {
    const music = createMusic();
    music.attachAutoplayUnlock();
    listeners[0][1]();  // the first interaction starts the music
    const audioOf = id => made.get(TRACKS[id].src);
    const fire = type => listeners.filter(([t]) => t === type).forEach(([, f]) => f());
    fn(music, audioOf, id => gains.get(audioOf(id)).gain, fire);
  } finally {
    Object.assign(globalThis, saved);
  }
}

test('without Web Audio the player cuts: main tracks resume, giant mode restarts, and going back rewinds the rest', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  withFakeBrowser((music, audioOf) => {
    const playing = () => Object.keys(TRACKS).filter(id => !audioOf(id).paused);
    assert.deepEqual(playing(), ['main']);

    audioOf('main').currentTime = 40;
    music.follow('giant');
    assert.deepEqual(playing(), ['giant']);
    audioOf('giant').currentTime = 15;
    music.follow('main');
    assert.equal(audioOf('main').currentTime, 40, 'the main track resumes');
    assert.equal(audioOf('giant').currentTime, 0, 'rewound for next time');
    music.follow('giant');
    assert.equal(audioOf('giant').currentTime, 0, 'giant mode starts from the top every time');

    music.follow('main');
    music.follow('frenzy');
    t.mock.timers.tick(TAPE_STOP_MS + DROP_SILENCE_MS);
    assert.deepEqual(playing(), ['frenzy']);
    audioOf('frenzy').currentTime = 12;
    music.follow('main');
    assert.deepEqual(playing(), ['main']);
    assert.equal(audioOf('frenzy').currentTime, 0, 'the next run hears the frenzy track from the start');

    music.toggle();
    assert.deepEqual(playing(), []);
    music.follow('giant');
    assert.deepEqual(playing(), [], 'muted: switching plays nothing');
    music.toggle();
    assert.deepEqual(playing(), ['giant'], 'unmuted: the wanted track');
  });
});

test('with Web Audio a switch fades out, then in; giant mode cuts in; the mix holds on iOS', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const ramps = [];
  withFakeBrowser((music, audioOf, gainOf) => {
    const playing = () => Object.keys(TRACKS).filter(id => !audioOf(id).paused);
    assert.equal(audioOf('main').volume, 1, 'the element at full; its gain sets the level');
    assert.equal(gainOf('main').value, TRACKS.main.volume);

    music.follow('frenzy');
    t.mock.timers.tick(TAPE_STOP_MS + DROP_SILENCE_MS);
    audioOf('frenzy').currentTime = 30;
    ramps.length = 0;
    music.follow('main');  // game over
    assert.deepEqual(playing(), ['frenzy'], 'the old track fades out first');
    assert.equal(gainOf('frenzy').value, 0);
    t.mock.timers.tick(MUSIC_FADE_MS);
    assert.deepEqual(playing(), ['main'], 'then the next one fades in');
    assert.equal(gainOf('main').value, TRACKS.main.volume);
    assert.deepEqual(ramps, [MUSIC_FADE_MS / 1000, MUSIC_FADE_MS / 1000]);
    assert.equal(audioOf('frenzy').currentTime, 0, 'rewound for the next run once faded out');

    music.follow('giant');
    assert.deepEqual(playing(), ['giant'], 'giant mode cuts in at once');
    assert.equal(gainOf('giant').value, TRACKS.giant.volume);

    music.follow('main');
    music.follow('giant');  // back before the fade-in started
    t.mock.timers.tick(MUSIC_FADE_MS * 3);
    assert.deepEqual(playing(), ['giant'], 'a cancelled fade-in never starts');
  }, { webAudio: fakeAudioContext(ramps) });
});

test('into the frenzy the old track tape-stops, a beat of silence, then the frenzy track from the top at full volume', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  withFakeBrowser((music, audioOf, gainOf) => {
    const playing = () => Object.keys(TRACKS).filter(id => !audioOf(id).paused);
    const main = audioOf('main');
    audioOf('frenzy').currentTime = 50;
    music.follow('frenzy');
    assert.deepEqual(playing(), ['main'], 'the old track winds down');
    assert.equal(main.preservesPitch, false, 'its pitch falls with its speed');
    assert.equal(gainOf('main').value, 0, 'and its volume tapers');
    t.mock.timers.tick(TAPE_STOP_MS / 2);
    assert.ok(main.playbackRate < 1 && main.playbackRate > 0.1, `halfway: rate ${main.playbackRate}`);
    t.mock.timers.tick(TAPE_STOP_MS / 2);
    assert.deepEqual(playing(), [], 'stopped: the beat of silence');
    assert.equal(main.playbackRate, 1, 'back to normal speed for next time');
    assert.equal(main.preservesPitch, true);
    t.mock.timers.tick(DROP_SILENCE_MS);
    assert.deepEqual(playing(), ['frenzy']);
    assert.equal(audioOf('frenzy').currentTime, 0, 'from the top');
    assert.equal(gainOf('frenzy').value, TRACKS.frenzy.volume, 'at full volume, no fade');

    music.follow('main');
    t.mock.timers.tick(MUSIC_FADE_MS * 2);
    music.follow('frenzy');
    t.mock.timers.tick(TAPE_STOP_MS / 2);
    music.follow('main');  // game over in the middle of the drop
    t.mock.timers.tick(MUSIC_FADE_MS * 3);
    assert.deepEqual(playing(), ['main'], 'the frenzy track never comes in');
    assert.equal(main.playbackRate, 1, 'and the main track plays at normal speed');
  }, { webAudio: fakeAudioContext([]) });
});

test('with Web Audio a suspended context (iOS, after the page was hidden) resumes on return or the next touch', () => {
  let ctx = null;
  const Base = fakeAudioContext([]);
  class Suspendable extends Base {
    constructor() { super(); this.state = 'running'; this.resumes = 0; ctx = this; }
    resume() { this.state = 'running'; this.resumes++; return Promise.resolve(); }
  }
  withFakeBrowser((music, audioOf, gainOf, fire) => {
    const before = ctx.resumes;
    ctx.state = 'interrupted';
    fire('visibilitychange');
    assert.equal(ctx.state, 'running');
    ctx.state = 'suspended';
    fire('touchstart');
    assert.equal(ctx.state, 'running');
    fire('touchstart');
    assert.equal(ctx.resumes, before + 2, 'a running context is left alone');
  }, { webAudio: Suspendable });
});
