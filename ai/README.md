# ai/: teaching a network to play

Networks learn to play Dachshund Dash by neuroevolution, on the real game
logic in `js/` (no browser, no drawing), so a run takes milliseconds instead
of minutes. It's built to grow: tiers add what the game throws at the agent,
the observation doesn't change as they do, and the environment has the usual
reinforcement-learning contract, so a stronger trainer can be swapped in.
Nothing here is part of the game or touches the leaderboard.

## The pieces

- **Environment** (`env.js`): `createEnv({ seed, tier }).reset()`, then
  `step(action)` → `{ reward, done }`. The real `update()`, with the game's
  spawner, scenes, golden hot dogs, and frenzy held off; it spawns the tier's
  kinds itself, at the game's own gaps and close-gap pattern odds. One heart.
  Normal speed ramp (3.0 up to 6.75). A seed replays a run exactly.
- **Tiers** (`tiers.js`): what spawns, built from the game's own `SPAWN_KINDS`
  and `SPAWN_PATTERNS`. Tier 0: chocolate bars and lone birds. Tier 1:
  everything before the tower (+ frisbee pairs, bird stacks, the close-gap
  pairs), at the game's early odds. Tier 2: + the tower (a double jump; it
  grows to 6 bars at speed 4.0, as in the game). A new tier is one entry.
- **Observation** (`observe.js`, `radar-1`): the dog's own state and the speed,
  plus a radar of the screen ahead in four height bands, cut where the dog's
  hitboxes change what an obstacle asks: ground (hits even a ducking dog),
  head (a standing dog, not a ducking one), low air and high air (a dog in the
  air). For each band, the next two things in it: when each reaches the dog's
  nose and when it's past its tail, in time (distance ÷ speed). No obstacle
  types: a bird stack is three bands at once, and a new obstacle needs no new
  inputs. 22 numbers.
- **Actions**: 30 times a second, nothing, jump, or duck (held).
- **Network** (`net.js`): 22 → 24 (tanh) → 3.
- **Training** (`train.mjs`): 150 networks play the same 3 fresh runs a
  generation; the best 6 carry over, the rest are bred from the fitter half
  by crossover and mutation, on every core. Each generation's best is checked
  on 12 fixed validation runs; the best of those is saved. `--from` starts from
  an earlier model (a curriculum); `--name` names the model (`tier<N>` by
  default).
- **Models** (`models.js`, `models/<name>.json`): weights plus the observation
  version (a model won't load against other inputs), its tier, and the tiers
  it trained through.
- **Evaluation** (`evaluate.mjs`): a model on 50 runs it never saw, in any tier.
- **Viewer** (`watch.html`): see below.

A run counts as cleared at 8,000 points (`SCORE_CAP`), past top speed (7,500).

## Running it

```bash
node ai/train.mjs --tier 2 [--minutes 30] [--from ai/models/tier1.json] [--name tier2-from-tier1]
node ai/evaluate.mjs --model ai/models/tier2.json [--tier 2] [--runs 50]
```

Results land in `results/<name>/` (`curve.csv`, `train.log`,
`evaluation-tier<N>.json`). `tests/ai.test.js` checks the environment replays a seed,
each tier spawns only its kinds, and the radar reads each obstacle into the
right bands.

## Watch it

`ai/watch.html` plays a model in real time with the game's own graphics and
its radar shown: a tinted strip in each height band over each thing it sees
there, and its choice (JUMP / DUCK) above the dog. 1× / 2× / 4×; a run that
ends restarts on a new seed. `?model=ai/models/tier1.json` picks the model
(tier 2's by default). Serve the repo root and open `/ai/watch.html`.

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

## Results so far

| Model | Tier | Validation cleared at | Unseen runs cleared |
|---|---|---|---|
| slots (first try) | 0 | generation 86, ~5 min | 40 / 50 |
| `tier0` | 0 | generation 4, 19 s | 50 / 50 |
| `tier1` | 1 | generation 12, 67 s | 300 / 300 |
| `tier2` | 2 | generation 86, 199 s | 293 / 300 |
| `tier2-from-tier1` | 2 | generation 26, 128 s | 292 / 300 |

