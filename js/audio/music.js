// Music playback: the soundtrack's tracks as data, and a player that follows
// whichever one the game wants (systems/soundtrack.js picks it each frame).
// Browser-only module (uses HTMLAudioElement and Web Audio); gameplay systems
// depend on the returned interface only — tests pass createSilentMusic().
//
// A switch fades the old track out over MUSIC_FADE_MS, then fades the next
// one in, except that `restart` tracks (giant mode) cut in at once and from
// the top. A track resumes where it was paused, and going back to the `main`
// track rewinds the rest (each run hears them from the start). Volume goes
// through a Web Audio gain per track, because iOS ignores an audio element's
// own volume (no fades, no mix); without Web Audio, switches just cut.

import { MUSIC_FADE_MS } from '../config.js';

export const TRACKS = {
  main: { src: 'sound/who_let_the_dogs_out_soul_version.mp3', volume: 0.30, main: true },
  // The frenzy, from its drop to the end of the run: "The Clockwork Gauntlet"
  frenzy: { src: 'sound/clockwork_gauntlet.mp3', volume: 0.25 },
  // Giant mode: 15s, matching GIANT_DURATION
  giant: { src: 'sound/who_let_the_dogs_out_edm_short.mp3', volume: 0.25, restart: true },
};

export function createMusic() {
  let musicOn = true;
  let musicStarted = false;
  let currentId = 'main';
  let gains = null;  // { id: GainNode } once the first interaction builds the Web Audio graph
  let audioCtx = null;
  const timers = {};  // per track: its pending fade-in start or fade-out pause

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

  function stop(id) {
    clearTimeout(timers[id]);
    audio[id].pause();
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
    else Object.keys(audio).forEach(id => { clearTimeout(timers[id]); audio[id].pause(); });
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
