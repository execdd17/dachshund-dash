// Sound effects synthesized at runtime via the Web Audio API (no files,
// except the preloaded chomp sample). Browser-only module.
//
// createSfx() returns a plain object of play* methods so gameplay systems
// depend on that interface, not on the Web Audio API — tests pass a stub.

export function createSfx() {
  let audioCtx = null;
  function getAudioCtx() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  // Preload chomp.mp3 as an AudioBuffer
  let chompBuffer = null;
  fetch('sound/chomp.mp3')
    .then(r => r.arrayBuffer())
    .then(buf => {
      const a = getAudioCtx();
      return a.decodeAudioData(buf);
    })
    .then(decoded => { chompBuffer = decoded; })
    .catch(() => {});

  function playJump() {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    // Quick upward pitch sweep — a little "boing"
    osc.frequency.setValueAtTime(280, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(560, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }

  function playScore() {
    const ctx = getAudioCtx();
    // Two-note chime
    [520, 680].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
      gain.gain.setValueAtTime(0.12, ctx.currentTime + i * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.2);
      osc.start(ctx.currentTime + i * 0.1);
      osc.stop(ctx.currentTime + i * 0.1 + 0.2);
    });
  }

  function playDeath() {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'square';
    // Descending sad tone
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.4);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  }

  function playDoubleJump() {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    // Higher pitched boing
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.13, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.12);
  }

  function playDuck() {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    // Quick downward "whoosh"
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.1);
  }

  function playCrunch() {
    if (!chompBuffer) return;
    const a = getAudioCtx();
    const source = a.createBufferSource();
    source.buffer = chompBuffer;
    const gain = a.createGain();
    gain.gain.value = 0.4;
    source.connect(gain);
    gain.connect(a.destination);
    source.start(a.currentTime);
  }

  function playBonk() {
    const a = getAudioCtx();
    // Hollow metallic "bonk"
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.connect(gain);
    gain.connect(a.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(800, a.currentTime);
    osc.frequency.exponentialRampToValueAtTime(200, a.currentTime + 0.15);
    gain.gain.setValueAtTime(0.18, a.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.2);
    osc.start(a.currentTime);
    osc.stop(a.currentTime + 0.2);
    // Secondary harmonic
    const osc2 = a.createOscillator();
    const gain2 = a.createGain();
    osc2.connect(gain2);
    gain2.connect(a.destination);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1200, a.currentTime);
    osc2.frequency.exponentialRampToValueAtTime(400, a.currentTime + 0.1);
    gain2.gain.setValueAtTime(0.08, a.currentTime);
    gain2.gain.exponentialRampToValueAtTime(0.001, a.currentTime + 0.12);
    osc2.start(a.currentTime);
    osc2.stop(a.currentTime + 0.12);
  }

  function playGiantActivate() {
    const a = getAudioCtx();
    // Ascending power-up fanfare
    [330, 440, 660].forEach((freq, i) => {
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.connect(gain);
      gain.connect(a.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, a.currentTime + i * 0.08);
      gain.gain.setValueAtTime(0.1, a.currentTime + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + i * 0.08 + 0.15);
      osc.start(a.currentTime + i * 0.08);
      osc.stop(a.currentTime + i * 0.08 + 0.15);
    });
  }

  function playGiantDeactivate() {
    const a = getAudioCtx();
    // Descending three tones
    [660, 440, 330].forEach((freq, i) => {
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.connect(gain);
      gain.connect(a.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, a.currentTime + i * 0.08);
      gain.gain.setValueAtTime(0.08, a.currentTime + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + i * 0.08 + 0.12);
      osc.start(a.currentTime + i * 0.08);
      osc.stop(a.currentTime + i * 0.08 + 0.12);
    });
  }

  return {
    playJump, playScore, playDeath, playDoubleJump, playDuck,
    playCrunch, playBonk, playGiantActivate, playGiantDeactivate,
  };
}

// No-op implementation of the same interface, for tests.
export function createSilentSfx() {
  const noop = () => {};
  return {
    playJump: noop, playScore: noop, playDeath: noop, playDoubleJump: noop,
    playDuck: noop, playCrunch: noop, playBonk: noop,
    playGiantActivate: noop, playGiantDeactivate: noop,
  };
}
