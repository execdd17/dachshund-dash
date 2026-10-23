// What the game throws at the agent, tier by tier, built from the game's own
// obstacle kinds (SPAWN_KINDS) and close-gap patterns (SPAWN_PATTERNS, at the
// game's own chance by speed). Adding a tier is one entry here.
//   solo: weights of the single-obstacle kinds
//   patterns: whether the close-gap patterns come too

export const TIERS = {
  // The first experiment: chocolate bars and lone birds.
  0: { name: 'chocolate and birds', solo: { hotdog: 0.6, bird: 0.4 }, patterns: false },
  // Everything a new player meets before the tower, at the game's early odds
  // (SPAWN_MIX past the bird walls): frisbee pairs and bird stacks, and the
  // close-gap pairs of them with chocolate bars.
  1: { name: 'before the tower', solo: { hotdog: 0.52, bird: 0.27, birdStack: 0.16, frisbeePair: 0.05 }, patterns: true },
};
