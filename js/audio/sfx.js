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
  playScore: [520, 680].map((from, i) => ({ type: 'sine', from, gain: 0.12, dur: 0.2, at: i * 0.1 })),
  playBonk: [
    { type: 'triangle', from: 800, to: 200, sweep: 0.15, gain: 0.18, dur: 0.2 },
    { type: 'sine', from: 1200, to: 400, sweep: 0.1, gain: 0.08, dur: 0.12 },
  ],
  playBoing: [
    { type: 'sine', from: 150, to: 600, sweep: 0.25, gain: 0.2, dur: 0.3 },
    { type: 'triangle', from: 300, to: 1200, sweep: 0.2, gain: 0.08, dur: 0.22 },
  ],
  playGiantActivate: [330, 440, 660].map((from, i) => ({ type: 'square', from, gain: 0.1, dur: 0.15, at: i * 0.08 })),
  playGiantDeactivate: [660, 440, 330].map((from, i) => ({ type: 'square', from, gain: 0.08, dur: 0.12, at: i * 0.08 })),
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
