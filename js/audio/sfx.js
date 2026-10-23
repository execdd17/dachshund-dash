// Sound effects synthesized at runtime via the Web Audio API (no files,
// except the preloaded chomp sample). Browser-only module.
//
// createSfx() returns a plain object of play* methods so gameplay systems
// depend on that interface, not on the Web Audio API — tests pass a stub.

// Each effect is a list of tones. A tone starts `at` seconds in, sweeps
// exponentially from `from` Hz to `to` Hz over `sweep` seconds (no sweep when
// `to` is omitted), and decays from `gain` to silence over `dur` seconds.
const TONES = {
  playJump: [{ type: 'sine', from: 280, to: 560, sweep: 0.1, gain: 0.15, dur: 0.15 }],
  playDoubleJump: [{ type: 'sine', from: 440, to: 880, sweep: 0.08, gain: 0.13, dur: 0.12 }],
  playDuck: [{ type: 'sine', from: 400, to: 150, sweep: 0.08, gain: 0.1, dur: 0.1 }],
  playDeath: [{ type: 'square', from: 400, to: 120, sweep: 0.4, gain: 0.1, dur: 0.4 }],
  playBonk: [
    { type: 'triangle', from: 800, to: 200, sweep: 0.15, gain: 0.18, dur: 0.2 },
    { type: 'sine', from: 1200, to: 400, sweep: 0.1, gain: 0.08, dur: 0.12 },
  ],
  playBoing: [
    { type: 'sine', from: 150, to: 600, sweep: 0.25, gain: 0.2, dur: 0.3 },
    { type: 'triangle', from: 300, to: 1200, sweep: 0.2, gain: 0.08, dur: 0.22 },
  ],
  playHeart: [523, 659, 784, 1047].map((from, i) => ({ type: 'sine', from, gain: 0.12, dur: 0.14, at: i * 0.06 })),
  playDig: [
    { type: 'triangle', from: 320, to: 90, sweep: 0.12, gain: 0.16, dur: 0.14 },
    { type: 'square', from: 140, to: 60, sweep: 0.08, gain: 0.04, dur: 0.1, at: 0.03 },
  ],
  playPop: [{ type: 'sine', from: 220, to: 950, sweep: 0.07, gain: 0.16, dur: 0.1 }],
  // The flight scene (systems/flight.js)
  playLiftoff: [
    { type: 'sine', from: 180, to: 900, sweep: 0.5, gain: 0.12, dur: 0.55 },
    { type: 'triangle', from: 360, to: 1400, sweep: 0.45, gain: 0.04, dur: 0.5, at: 0.05 },
  ],
  playWhooshUp: [{ type: 'sine', from: 300, to: 750, sweep: 0.14, gain: 0.08, dur: 0.18 }],
  playWhooshDown: [{ type: 'sine', from: 750, to: 300, sweep: 0.14, gain: 0.08, dur: 0.18 }],
  playLand: [
    { type: 'triangle', from: 200, to: 60, sweep: 0.1, gain: 0.2, dur: 0.16 },
    { type: 'sine', from: 120, to: 50, sweep: 0.08, gain: 0.1, dur: 0.12 },
  ],
  playFetch: [660, 990].map((from, i) => ({ type: 'triangle', from, gain: 0.12, dur: 0.1, at: i * 0.05 })),
  playGiantActivate: [330, 440, 660].map((from, i) => ({ type: 'square', from, gain: 0.1, dur: 0.15, at: i * 0.08 })),
  playGiantDeactivate: [660, 440, 330].map((from, i) => ({ type: 'square', from, gain: 0.08, dur: 0.12, at: i * 0.08 })),
  // The frenzy's drop (systems/frenzy.js): a boom with the flash, and a rumble
  // through the silence while the old track tape-stops (audio/music.js)
  playFrenzyDrop: [
    { type: 'sine', from: 150, to: 34, sweep: 1.1, gain: 0.45, dur: 1.6 },
    { type: 'triangle', from: 95, to: 28, sweep: 0.9, gain: 0.22, dur: 1.2 },
    { type: 'square', from: 65, to: 30, sweep: 0.3, gain: 0.05, dur: 0.35 },
    { type: 'sine', from: 48, to: 30, sweep: 1.4, gain: 0.3, dur: 1.5, at: 0.15 },
  ],
};

export const SFX_NAMES = [...Object.keys(TONES), 'playCrunch'];

export function createSfx() {
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function playTone(ctx, { type, from, to, sweep, gain, dur, at = 0 }) {
    const start = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, start + sweep);
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.start(start);
    osc.stop(start + dur);
  }

  let chompBuffer = null;
  fetch('sound/chomp.mp3')
    .then(r => r.arrayBuffer())
    .then(buf => getAudioCtx().decodeAudioData(buf))
    .then(decoded => { chompBuffer = decoded; })
    .catch(() => {});

  function playCrunch() {
    if (!chompBuffer) return;
    const ctx = getAudioCtx();
    const source = ctx.createBufferSource();
    source.buffer = chompBuffer;
    const gain = ctx.createGain();
    gain.gain.value = 0.4;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start(ctx.currentTime);
  }

  const sfx = { playCrunch };
  for (const [name, tones] of Object.entries(TONES)) {
    sfx[name] = () => {
      const ctx = getAudioCtx();
      tones.forEach(tone => playTone(ctx, tone));
    };
  }
  return sfx;
}

// No-op implementation of the same interface, for tests.
export function createSilentSfx() {
  return Object.fromEntries(SFX_NAMES.map(name => [name, () => {}]));
}
