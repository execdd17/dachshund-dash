// What the game throws at the agent, tier by tier, built from the game's own
// obstacle kinds (SPAWN_KINDS) and close-gap patterns (SPAWN_PATTERNS, at the
// game's own chance by speed), plus the scenes it lets in. Adding a tier is
// one entry here.
//   solo: weights of the single-obstacle kinds
//   patterns: whether the close-gap patterns come too
//   scenes: scene ids allowed to take their turns (the rest are held off)
//   frenzy: whether the frenzy runs (else it's held off, and its boss with it)

export const TIERS = {
  // The first experiment: chocolate bars and lone birds.
  0: { name: 'chocolate and birds', solo: { hotdog: 0.6, bird: 0.4 }, patterns: false },
  // Everything a new player meets before the tower, at the game's early odds
  // (SPAWN_MIX past the bird walls): frisbee pairs and bird stacks, and the
  // close-gap pairs of them with chocolate bars.
  1: { name: 'before the tower', solo: { hotdog: 0.52, bird: 0.27, birdStack: 0.16, frisbeePair: 0.05 }, patterns: true },
  // + the tower (a double jump; 5 bars, then 6 from TOWER_TALL_FROM_SPEED), at
  // the game's odds once towers are in (SPAWN_MIX past tower.after).
  2: { name: 'the tower', solo: { tower: 0.15, hotdog: 0.52, bird: 0.19, birdStack: 0.11, frisbeePair: 0.03 }, patterns: true },
  // + the squirrel chase: it runs ahead and throws acorns from close range
  // (the game's own spawner, while it runs), ground ones to jump, high ones to duck.
  3: { name: 'the squirrel chase', solo: { tower: 0.15, hotdog: 0.52, bird: 0.19, birdStack: 0.11, frisbeePair: 0.03 }, patterns: true, scenes: ['chase'] },
  // + the bosses (at BOSS_SPEEDS: everything faster, the dog pushed forward)
  // and the frenzy (from FRENZY_SPEED: the drop, its boss, then the rest of the run).
  4: { name: 'bosses and the frenzy', solo: { tower: 0.15, hotdog: 0.52, bird: 0.19, birdStack: 0.11, frisbeePair: 0.03 }, patterns: true, scenes: ['chase', 'boss'], frenzy: true },
};
