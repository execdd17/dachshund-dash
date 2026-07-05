// Shared mutual-exclusion predicates. Encounters (giant, chase, boss,
// trampoline) never overlap: each one's arming check must see every other
// encounter as fully idle — including transition phases like the giant
// grow/shrink, the chase squirrel's enter/escape runs, and the boss retreat.
// Centralizing the flag lists here means a new encounter (or a new phase on
// an existing one) only has to be registered once.

export function giantBusy(state) {
  return state.giantActive || state.giantGrowing || state.giantShrinking;
}

export function chaseBusy(state) {
  return state.chasePending || state.chaseEntering || state.chaseActive || state.chaseEscaping;
}

export function bossBusy(state) {
  return state.bossPending || state.bossChasing || state.bossLosing;
}

export function trampBusy(state) {
  return state.trampPending || state.trampActive;
}

// A golden pickup on the field means giant mode is imminent — score-armed
// encounters must not arm behind it, or they'd activate mid-giant once the
// field clears.
export function goldenOnField(state) {
  return state.obstacles.some(o => o.type === 'golden');
}
