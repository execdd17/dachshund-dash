// Hand-written players: if-statements on the same 22 inputs a network reads
// (observe.js), deciding as often, as a baseline for what training adds. A
// rule set is a list of rules, tried in order; the first whose `when` holds
// picks the action, and with none it does nothing.
//
// `naive` is the obvious few rules, written once and never tuned against
// results: jump what's on the ground, duck what's at head height, and jump
// twice for a tower. `tuned` keeps to a handful of general rules, each a
// principle rather than a case ("jump so it's past before you land", not a
// rule per obstacle), with a few named numbers (TUNED) picked by a sweep on
// seeds the evaluation never uses (tune-rules.mjs).

import { DOG_INPUTS, PER_BAND } from './observe.js';

const HIGH_AIR = 0, LOW_AIR = 1, HEAD = 2, GROUND = 3;  // band indexes, as in BANDS
const [HEIGHT, VERTICAL_SPEED, IN_AIR, DOUBLE_JUMP_USED] = ['height', 'vertical speed', 'in the air', 'double jump used'].map(name => DOG_INPUTS.indexOf(name));

// The k-th thing in a band (0: nearest): when it reaches the dog and when it's
// past, in half seconds (1: half a second away or more, or nothing there).
const thing = (inputs, band, k = 0) => {
  const at = DOG_INPUTS.length + (band * PER_BAND + k) * 2;
  return { reaches: inputs[at], past: inputs[at + 1] };
};
// Something in `band` reaches the dog within `within` half seconds and isn't past yet.
const near = (inputs, band, within) => {
  const { reaches, past } = thing(inputs, band);
  return reaches < within && past > 0;
};

const SOON = 0.4;  // a fifth of a second

// A tower is one column across the bands: its high-air and ground parts arrive together.
const towerAhead = x => thing(x, HIGH_AIR).reaches < 1 && thing(x, GROUND).past > 0
  && Math.abs(thing(x, HIGH_AIR).reaches - thing(x, GROUND).reaches) < 0.05;
// Something at head height comes before the next thing on the ground (or there's none).
const headFirst = x => thing(x, HEAD).past > 0 && thing(x, HEAD).reaches < thing(x, GROUND).reaches;

// The tuned rules' numbers: times in half seconds (radar units; a single jump
// is in the air 0.73, a double jump at its top 1.07), heights as the dog's
// height input (px above the ground ÷ 120; a single jump peaks at 0.96).
export const TUNED = { jumpBy: 0.65, towerBy: 0.95, doubleAt: 0.8, duckWithin: 0.2 };

export function tunedRules({ jumpBy, towerBy, doubleAt, duckWithin }) {
  return {
    summary: 'a few general rules and 4 tuned numbers',
    rules: [
      {
        says: `A tower ahead, on the ground, and it'll be past within ${towerBy} (a double jump's airtime): jump`,
        when: x => !x[IN_AIR] && towerAhead(x) && thing(x, GROUND).past < towerBy,
        action: 'jump',
      },
      {
        says: `In the air, falling, double jump unused, a tower still ahead, and down to height ${doubleAt}: jump again`,
        when: x => x[IN_AIR] && !x[DOUBLE_JUMP_USED] && x[VERTICAL_SPEED] > 0 && x[HEIGHT] < doubleAt && towerAhead(x),
        action: 'jump',
      },
      {
        says: `Something at head height comes first, within ${duckWithin} (or it's at the dog): duck`,
        when: x => !x[IN_AIR] && headFirst(x) && thing(x, HEAD).reaches < duckWithin,
        action: 'duck',
      },
      {
        says: `Something on the ground, on the ground, and it'll be past within ${jumpBy} (before a jump lands): jump`,
        when: x => !x[IN_AIR] && near(x, GROUND, 1) && thing(x, GROUND).past < jumpBy,
        action: 'jump',
      },
      {
        says: 'Otherwise: do nothing',
        when: () => true,
        action: 'none',
      },
    ],
  };
}
export const RULE_SETS = {
  naive: {
    summary: 'the obvious ones, written once, never tuned',
    rules: [
      {
        says: 'A tower (ground and high air both near), in the air, double jump unused, starting to fall: jump again',
        when: x => near(x, GROUND, SOON) && near(x, HIGH_AIR, SOON) && x[IN_AIR] && !x[DOUBLE_JUMP_USED] && x[VERTICAL_SPEED] >= 0,
        action: 'jump',
      },
      {
        says: 'Something in the ground band within ⅕ s, on the ground: jump',
        when: x => near(x, GROUND, SOON) && !x[IN_AIR],
        action: 'jump',
      },
      {
        says: 'Something in the head band within ⅕ s (or at the dog): duck',
        when: x => near(x, HEAD, SOON),
        action: 'duck',
      },
      {
        says: 'Otherwise: do nothing',
        when: () => true,
        action: 'none',
      },
    ],
  },
  tuned: tunedRules(TUNED),
};

// Rule sets go by `rules-<key>` wherever models go by name (the picker, results/).
export const RULES_PREFIX = 'rules-';
export const ruleSetNamed = name => RULE_SETS[name.slice(RULES_PREFIX.length)];

// The rule that fires for `inputs`, by index, and its action.
export function decide(ruleSet, inputs) {
  const rule = ruleSet.rules.findIndex(r => r.when(inputs));
  return { rule, action: rule < 0 ? 'none' : ruleSet.rules[rule].action };
}
