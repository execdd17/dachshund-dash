// Transient visual effects — popups and knocked-away obstacles — kept in one
// list, state.effects: [{ kind, startTime, ...props }]. Gameplay adds them,
// update() ages them out, and render/effects.js draws each kind.

import {
  CHOMP_EFFECT_MS, BONK_EFFECT_MS, SCORE_POPUP_MS, FLIGHT_CALL_MS, CAPE_AWAY_MS, GIANT_FEAST_MS, FRENZY_DROP_MS, BURST_MS, HYPER_UNLOCKED_MS,
} from '../config.js';

// Per kind: how long it lives (ms) and, optionally, how it moves each frame.
export const EFFECT_KINDS = {
  // Giant mode's points: an eaten obstacle or a fetched bone (level = its streak level, 0 for food).
  chomp: { ttl: CHOMP_EFFECT_MS },
  giantFeast: { ttl: GIANT_FEAST_MS },
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
  // Hyper's clean jump over a chocolate bar (level = its streak level).
  cleanJump: { ttl: SCORE_POPUP_MS },
  // The flight scene's call on grabbing the cape, and the cape drifting off after the landing.
  flightCall: { ttl: FLIGHT_CALL_MS },
  capeAway: {
    ttl: CAPE_AWAY_MS,
    step(e, scale) {
      e.x += e.vx * scale;
      e.y += e.vy * scale;
      e.vy -= 0.01 * scale;
      e.rotation -= 0.03 * scale;
    },
  },
  // Hyper mode just unlocked (systems/hyper.js).
  hyperUnlocked: { ttl: HYPER_UNLOCKED_MS },
  // The frenzy (systems/frenzy.js): its drop, and a hazard bursting into a rainbow (drifting back a little).
  frenzyDrop: { ttl: FRENZY_DROP_MS },
  burst: {
    ttl: BURST_MS,
    step(e, scale) { e.x -= 1.2 * scale; },
  },
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
