// Speed: what gameplay difficulty follows. A run's speed is a fixed function
// of its score and mode (SPEED_PROFILES: normal, or hyper, which starts
// faster and climbs faster), up to MAX_SPEED. The milestones that make a run
// harder key off speed, not score, so each mode reaches them at its own
// score: the frenzy (FRENZY_SPEED), the bosses (BOSS_SPEEDS), and the
// obstacle ease-in (via paceOf). What's about progress through a run rather
// than difficulty stays on score: scene cooldowns, biomes, golden spacing.

import { SPEED_PROFILES, MAX_SPEED } from '../config.js';

export const profileOf = state => SPEED_PROFILES[state.hyper ? 'hyper' : 'normal'];

export const speedAt = (score, profile) => Math.min(MAX_SPEED, profile.start + score * profile.perPoint);

// The run's speed at its score (the same value update() keeps in state.speed).
export const runSpeed = state => speedAt(state.score, profileOf(state));

// The score at which `profile` reaches `speed` (0 if it starts there or above).
export const scoreAtSpeed = (speed, profile) => Math.max(0, (speed - profile.start) / profile.perPoint);

// How far into a normal run the current speed is, in normal-run points: the
// obstacle ease-in was tuned in those terms (towers after 400, patterns
// ramping to 1500...), and hyper, starting faster, starts past all of it.
// Straight from the score (a round trip through speed loses a hair, and 180
// came back as 179.99...): exactly the score in a normal run.
export function paceOf(state) {
  const { normal } = SPEED_PROFILES;
  const profile = profileOf(state);
  const pace = (profile.start - normal.start) / normal.perPoint + state.score * (profile.perPoint / normal.perPoint);
  return Math.min(pace, scoreAtSpeed(MAX_SPEED, normal));
}
