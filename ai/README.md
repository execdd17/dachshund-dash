# ai/: teaching a network to play

Networks learn to play Dachshund Dash by neuroevolution, on the real game
logic in `js/` (no browser, no drawing), so a run takes milliseconds instead
of minutes. It's built to grow: tiers add what the game throws at the agent,
the observation doesn't change as they do, and the environment has the usual
reinforcement-learning contract, so a stronger trainer can be swapped in.
Nothing here is part of the game or touches the leaderboard.

## The pieces

- **Environment** (`env.js`): `createEnv({ seed, tier }).reset()`, then
  `step(action)` → `{ reward, done }`. The real `update()`, with golden hot
  dogs, the frenzy, and the scenes the tier doesn't allow held off; it spawns
  the tier's kinds itself, at the game's own gaps and close-gap pattern odds,
  and hands spawning to the game's own spawner while an allowed scene runs
  (carrying on the game's gap when it hands back). One heart.
  Normal speed ramp (3.0 up to 6.75). A seed replays a run exactly.
- **Tiers** (`tiers.js`): what spawns, built from the game's own `SPAWN_KINDS`
  and `SPAWN_PATTERNS`. Tier 0: chocolate bars and lone birds. Tier 1:
  everything before the tower (+ frisbee pairs, bird stacks, the close-gap
  pairs), at the game's early odds. Tier 2: + the tower (a double jump; it
  grows to 6 bars at speed 4.0, as in the game). Tier 3: + the squirrel chase
  (the first scene: while it runs, the game's own spawner throws acorns from
  the squirrel, close ahead of the dog). Tier 4: + the bosses (at speeds 3.5
  and 4.5: everything up to 25% faster, the dog pushed forward) and the
  frenzy (from 5.5: the drop, its boss, then the rest of the run). A new tier
  is one entry.
- **Observation** (`observe.js`, `radar-1`): the dog's own state and the speed,
  plus a radar of the screen ahead in four height bands, cut where the dog's
  hitboxes change what an obstacle asks: ground (hits even a ducking dog),
  head (a standing dog, not a ducking one), low air and high air (a dog in the
  air). For each band, the next two things in it: when each reaches the dog's
  nose and when it's past its tail, in time (distance ÷ how fast things are
  really coming, which a boss speeds up). No obstacle
  types: a bird stack is three bands at once, and a new obstacle needs no new
  inputs. 22 numbers.
- **Actions**: 30 times a second, nothing, jump, or duck (held).
- **Network** (`net.js`): 22 → 24 (tanh) → 3.
- **Training** (`train.mjs`): 150 networks play the same 3 fresh runs a
  generation; the best 6 carry over, the rest are bred from the fitter half
  by crossover and mutation, on every core. Each generation's best is checked
  on 12 fixed validation runs; the best of those is saved. `--from` starts from
  an earlier model (a curriculum); `--name` names the model (`tier<N>` by
  default); `--cap` raises the score a run counts as cleared at, to train
  for staying power once a tier is cleared.
- **Models** (`models.js`, `models/<name>.json`): weights plus the observation
  version (a model won't load against other inputs), its tier, and the tiers
  it trained through.
- **Evaluation** (`evaluate.mjs`): a model on 50 runs it never saw, in any tier.
- **Viewer** (`watch.html`): see below.

A run counts as cleared at 8,000 points (`SCORE_CAP`), past top speed (7,500).

## Running it

```bash
node ai/train.mjs --tier 2 [--minutes 30] [--from ai/models/tier1.json] [--name tier2-from-tier1]
node ai/evaluate.mjs --model ai/models/tier2.json [--tier 2] [--runs 50] [--cap 30000]
```

Results land in `results/<name>/` (`curve.csv`, `train.log`,
`evaluation-tier<N>.json`). `tests/ai.test.js` checks the environment replays a seed,
each tier spawns only its kinds, and the radar reads each obstacle into the
right bands.

## Watch it

`ai/watch.html` plays a model in real time with the game's own graphics and
what it sees shown: on the game, the obstacles its radar tracks boxed and a
tinted strip in each height band, with its choice (JUMP / DUCK) above the
dog; below, a live panel of its 22 inputs and its scores, a live diagram of
the network (each neuron colored by its value, each weight as bright as the
signal it's passing, each layer's activation named), and a plain-language
explanation of how it works. A picker lists every
trained model (`models/index.json`, which training keeps up to date;
`node ai/model-index.mjs` rebuilds it), and the URL keeps the choice
(`?model=tier2`). 1× / 2× / 4× / 10×; a run that ends restarts on a new seed.
Serve the repo root and open `/ai/watch.html`.

## What mattered

- **Time, not distance.** The first observation gave each obstacle's distance
  as a share of the screen; the population stalled near 200 points, since the
  moment to jump was a narrow band of distances that shifted with speed.
  Time until contact (distance ÷ speed) made it one large, speed-independent
  value: about 7,700 within a minute.
- **The radar over slots.** The first model saw "the next two obstacles" by
  type (`results/slots-tier0/`): 86 generations to clear the validation runs,
  then 40 of 50 unseen runs cleared. The radar, on the same tier 0: 4
  generations (19 seconds), then 50 of 50.
- **A curriculum halves the generations, not the result.** Tier 2 from
  scratch cleared the validation runs at generation 86 (199 s); starting from
  the tier-1 champion, at 26 (128 s; each generation runs longer, as its
  networks survive longer). Both then cleared about 292 of 300 unseen runs,
  every loss a tall tower near top speed, and both still clear tier 1
  perfectly. They play differently: the curriculum model kept tier 1's habit
  of ducking by default (84% of the time) and stands only to jump; the fresh
  one ducks 17% of the time. Both double-jump every tower. The tier-1 model
  alone, on tier 2: 80 points on average, dead at the first tower.

- **When it can't learn, suspect the environment.** Tier 3 first came out at
  about 80% with no real gain from training, and its runs died to plain
  chocolate bars at speed 3.15, nothing like tier 2's tall towers at top
  speed. A post-mortem found 25 of 26 deaths came right after a chase ended,
  with the next obstacle 9–70 px behind (the game never spawns closer than
  ~185): taking spawning back from the game, the environment resumed its own
  count, stopped since the chase began, and dropped obstacles almost on top
  of the chase's last ones. Carrying on the game's own gap fixed it, a test
  now holds every tier to the game's tightest spacing, and the tier-2
  champion's offspring then cleared tier 3 at once.
- **The curriculum matters more as tiers stack up.** On tier 2, starting from
  the tier-1 champion only saved generations. On tier 3, it decided the
  outcome: from the tier-2 champion, 288 of 300 unseen runs at once; from
  scratch, after 30 minutes and 1,498 generations, 68 of 300 (dying to 149
  towers and 67 acorns), having to learn the tower's double jump and the
  chase's short reaction times all at once.

## Results so far

| Model | Tier | Validation cleared at | Unseen runs cleared |
|---|---|---|---|
| slots (first try) | 0 | generation 86, ~5 min | 40 / 50 |
| `tier0` | 0 | generation 4, 19 s | 50 / 50 |
| `tier1` | 1 | generation 12, 67 s | 300 / 300 |
| `tier2` | 2 | generation 86, 199 s | 293 / 300 |
| `tier2-from-tier1` | 2 | generation 26, 128 s | 292 / 300 |
| `tier3-from-tier2` | 3 | generation 0 (the tier-2 champion's offspring already did) | 288 / 300 |
| `tier3` | 3 | never (6,990 of 8,000 after 1,498 generations, 30 min) | 68 / 300 |
| `tier4-from-tier3` | 4, to 30,000 | generation 8, 296 s | 100 / 100 to 30,000; 100 / 100 to 100,000; 9 / 10 to 1,000,000 |

The tier-3 champion already cleared tier 4 to 8,000 (99 of 100 runs): the
bosses and the frenzy asked nothing new of it. Its limit was staying power at
top speed: to 30,000 it cleared 58 of 100 (33 deaths to the tall tower). So
tier 4 trained with `--cap 30000`, and eight generations later the champion
cleared all 100 runs to 30,000 and to 100,000, and nine of ten to a million
points (the tenth fell to an acorn at 319,027).

