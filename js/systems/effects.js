// Transient visual effects — popups and knocked-away obstacles — kept in one
// list, state.effects: [{ kind, startTime, ...props }]. Gameplay adds them,
// update() ages them out, and render/effects.js draws each kind.

import { CHOMP_EFFECT_MS, BONK_EFFECT_MS, SCORE_POPUP_MS } from '../config.js';

// Per kind: how long it lives (ms) and, optionally, how it moves each frame.
export const EFFECT_KINDS = {
  chomp: { ttl: CHOMP_EFFECT_MS },
  // A knocked-away obstacle: flung up and back, tumbling under gravity.
  bonk: {
    ttl: BONK_EFFECT_MS,
    step(e, scale) {
      e.x += e.vx * scale;
      e.y += e.vy * scale;
      e.vy += 0.3 * scale;
      e.rotation += e.rotSpeed * scale;
    },
  },
  birdJump: { ttl: SCORE_POPUP_MS },
  trampBounce: { ttl: SCORE_POPUP_MS },
  heartGain: { ttl: SCORE_POPUP_MS },
  heartBonus: { ttl: SCORE_POPUP_MS },
  pointsPickup: { ttl: SCORE_POPUP_MS },
};

export function addEffect(state, kind, now, props) {
  state.effects.push({ kind, startTime: now, ...props });
}

export function updateEffects(state, scale, now) {
  state.effects = state.effects.filter(e => {
    const kind = EFFECT_KINDS[e.kind];
    kind.step?.(e, scale);
    return now - e.startTime < kind.ttl;
  });
}

export function effectsOfKind(state, kind) {
  return state.effects.filter(e => e.kind === kind);
}
