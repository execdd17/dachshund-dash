// Music playback: the soundtrack's tracks as data, and a player that follows
// whichever one the game wants (systems/soundtrack.js picks it each frame).
// Browser-only module (uses HTMLAudioElement and Web Audio); gameplay systems
// depend on the returned interface only — tests pass createSilentMusic().
//
// Switches: the old track fades out over MUSIC_FADE_MS, then the next fades
// in. A `restart` track (giant mode) cuts in at once, from the top. A `drop`
// track (the frenzy's) follows a tape-stop instead: the old track winds down,
// pitch falling, over TAPE_STOP_MS, then DROP_SILENCE_MS of silence, then it
// starts from the top at full volume, so songs in different keys never meet.
// A track resumes where it paused; going back to a `main` track (a mode's
// resting one: normal's or hyper's) rewinds the rest. Volume goes through a
// Web Audio gain per track, since iOS ignores an element's own volume;
// without Web Audio, fades become cuts.

import { MUSIC_FADE_MS, TAPE_STOP_MS, DROP_SILENCE_MS } from '../config.js';

export const TRACKS = {
  main: { src: 'sound/who_let_the_dogs_out_soul_version.mp3', volume: 0.30, main: true },
  // Hyper mode's in place of main: "Golden Ascent" (or sound/clockwork_run.mp3, "The Clockwork Run")
  hyper: { src: 'sound/golden_ascent.mp3', volume: 0.25, main: true },
  // The frenzy, from its drop to the end of the run: "The Clockwork Gauntlet"
  frenzy: { src: 'sound/clockwork_gauntlet.mp3', volume: 0.25, drop: true },
  // Giant mode: 15s, matching GIANT_DURATION
  giant: { src: 'sound/who_let_the_dogs_out_edm_short.mp3', volume: 0.25, restart: true },
};

const TAPE_STEP_MS = 30;    // how often a tape-stop slows the track
const TAPE_MIN_RATE = 0.1;  // its slowest, just before it stops

export function createMusic() {
  let musicOn = true;
  let musicStarted = false;
  let currentId = 'main';
  let gains = null;  // { id: GainNode } once the first interaction builds the Web Audio graph
  let audioCtx = null;
  const timers = {};  // per track: its pending fade-in start or fade-out pause
  const winding = {};  // per track: the interval of a tape-stop in progress

  const audio = Object.fromEntries(Object.entries(TRACKS).map(([id, track]) => {
    const a = new Audio(track.src);
    a.loop = true;
    a.volume = track.volume;
    return [id, a];
  }));
  const playing = () => musicOn && musicStarted;

  // Track `id`'s volume to `value`, ramped over `ms` when Web Audio is there.
  function setVolume(id, value, ms = 0) {
    if (!gains) { audio[id].volume = value; return; }
    const gain = gains[id].gain;
    const t = audioCtx.currentTime;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    if (ms > 0) gain.linearRampToValueAtTime(value, t + ms / 1000); else gain.setValueAtTime(value, t);
  }

  function later(id, ms, fn) {
    clearTimeout(timers[id]);
    timers[id] = setTimeout(fn, ms);
  }

  // An element's pitch normally holds when its rate changes; a tape-stop lets it fall.
  function lockPitch(a, on) {
    a.preservesPitch = on;
    a.webkitPreservesPitch = on;
  }

  // Slows track `id` like a tape losing power, faster toward the end, its
  // pitch (and with Web Audio, its volume) falling with it; follow() stops it.
  function tapeStop(id) {
    const a = audio[id];
    unwind(id);
    lockPitch(a, false);
    if (gains) setVolume(id, 0, TAPE_STOP_MS);
    const steps = Math.max(1, Math.round(TAPE_STOP_MS / TAPE_STEP_MS));
    let step = 0;
    winding[id] = setInterval(() => {
      step = Math.min(steps, step + 1);
      a.playbackRate = 1 - (1 - TAPE_MIN_RATE) * (step / steps) ** 2;
    }, TAPE_STOP_MS / steps);
  }

  // Back to normal speed and pitch (a tape-stop over, or cut short).
  function unwind(id) {
    clearInterval(winding[id]);
    winding[id] = null;
    audio[id].playbackRate = 1;
    lockPitch(audio[id], true);
  }

  // Silences track `id` where it is: no pending switch, normal speed, paused.
  function halt(id) {
    clearTimeout(timers[id]);
    unwind(id);
    audio[id].pause();
  }

  function stop(id) {
    halt(id);
    if (TRACKS[currentId].main && !TRACKS[id].main) audio[id].currentTime = 0;
  }

  function start(id, fadeMs = 0) {
    if (!playing()) return;
    setVolume(id, fadeMs ? 0 : TRACKS[id].volume);
    audio[id].play().catch(() => {});
    if (fadeMs) setVolume(id, TRACKS[id].volume, fadeMs);
  }

  // Each track through its own gain (see the header); iOS needs it.
  function buildGraph() {
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctx) return;
    try {
      audioCtx = new Ctx();
      gains = Object.fromEntries(Object.entries(audio).map(([id, a]) => {
        const gain = audioCtx.createGain();
        gain.gain.value = TRACKS[id].volume;
        audioCtx.createMediaElementSource(a).connect(gain).connect(audioCtx.destination);
        a.volume = 1;
        return [id, gain];
      }));
      audioCtx.resume?.().catch(() => {});
    } catch {
      gains = null;  // plain element volume, as before
    }
  }

  // Browsers block autoplay — start music on first user interaction
  function startOnInteraction() {
    if (musicStarted) return;
    musicStarted = true;
    buildGraph();
    start(currentId);
    document.removeEventListener('click', startOnInteraction);
    document.removeEventListener('keydown', startOnInteraction);
    document.removeEventListener('touchstart', startOnInteraction);
  }

  // iOS suspends (or "interrupts") the Web Audio context when the page is
  // hidden or a call comes in, and the music would stay silent: resume it on
  // the way back and on the next touch or key.
  function resumeIfStopped() {
    if (audioCtx && audioCtx.state !== 'running' && playing()) audioCtx.resume?.().catch(() => {});
  }

  function attachAutoplayUnlock() {
    document.addEventListener('click', startOnInteraction);
    document.addEventListener('keydown', startOnInteraction);
    document.addEventListener('touchstart', startOnInteraction);
    for (const type of ['visibilitychange', 'click', 'keydown', 'touchstart']) {
      document.addEventListener(type, resumeIfStopped, { passive: true });
    }
  }

  function toggle() {
    musicOn = !musicOn;
    if (musicOn) start(currentId);
    else Object.keys(audio).forEach(halt);
  }

  // Switch to track `id` (a TRACKS key); a no-op while it's already the one.
  function follow(id) {
    if (id === currentId) return;
    const old = currentId;
    currentId = id;
    if (TRACKS[id].main) {
      Object.keys(audio).forEach(other => { if (other !== old && !TRACKS[other].main) audio[other].currentTime = 0; });
    }
    if (TRACKS[id].restart) audio[id].currentTime = 0;
    clearTimeout(timers[id]);
    unwind(id);  // coming back mid tape-stop

    if (TRACKS[id].drop && playing()) {
      tapeStop(old);
      later(old, TAPE_STOP_MS, () => stop(old));
      audio[id].currentTime = 0;
      later(id, TAPE_STOP_MS + DROP_SILENCE_MS, () => start(id));
      return;
    }

    const fade = playing() && gains && !TRACKS[id].restart;
    if (!fade) {
      stop(old);
      start(id);
      return;
    }
    setVolume(old, 0, MUSIC_FADE_MS);
    later(old, MUSIC_FADE_MS, () => stop(old));
    later(id, MUSIC_FADE_MS, () => start(id, MUSIC_FADE_MS));
  }

  return {
    isOn: () => musicOn,
    current: () => currentId,
    attachAutoplayUnlock,
    toggle,
    follow,
  };
}

// No-op implementation of the same interface, for tests (it remembers the track).
export function createSilentMusic() {
  let currentId = 'main';
  return {
    isOn: () => false,
    current: () => currentId,
    attachAutoplayUnlock: () => {},
    toggle: () => {},
    follow: id => { currentId = id; },
  };
}
