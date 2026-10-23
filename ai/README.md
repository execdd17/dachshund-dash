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
  frenzy (from 5.5: the drop, its boss, then the rest of the run). Tier 5:
  tier 4's game in hyper mode, for points: a run is 10 minutes of game time,
  scored by its points with no cap, so a bird's jump bonus counts (and, since
  speed follows score, brings top speed sooner). A new tier is one entry.
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
  on fixed validation runs (12; `--validation` sets how many); the best of
  those is saved, and training ends once one clears them all. `--from`
  starts from an earlier model (a curriculum); `--name` names the model
  (`tier<N>` by default); `--cap` raises the score a run counts as cleared
  at, to train for staying power once a tier is cleared.
- **Models** (`models.js`, `models/<name>.json`): weights plus the observation
  version (a model won't load against other inputs), its tier, and the tiers
  it trained through.
- **Evaluation** (`evaluate.mjs`): a model on 50 runs it never saw, in any tier.
- **Rules** (`rules.js`): the baseline. Hand-written if-statements on the
  same 22 inputs, deciding as often, played through the same `playRun` and
  scored by the same `evaluate.mjs` on the same seeds (`play.js` takes any
  player: `netPlayer(net)` or `rulesPlayer(ruleSet)`). A rule set is a list of
  rules in plain words, each with its condition and action; the first that
  holds decides. Named `rules-<key>` wherever a model has a name.
  `tune-rules.mjs` picks the tuned set's numbers on seeds the evaluation
  never uses.
- **Viewer** (`watch.html`): see below.

A run counts as cleared at 8,000 points (`SCORE_CAP`), past top speed (7,500).

## Running it

```bash
node ai/train.mjs --tier 2 [--minutes 30] [--from ai/models/tier1.json] [--name tier2-from-tier1]
node ai/evaluate.mjs --model ai/models/tier2.json [--tier 2] [--runs 50] [--cap 30000]
node ai/evaluate.mjs --model rules-naive --tier 2      # a rule set: by name, with a tier
AI_REMOTE=user@host ai/remote-train.sh --tier 5 ...   # train.mjs on a machine with more cores
```

Training spreads every (network, seed) run over all cores, each to whichever
worker is free (runs last from seconds to a timed tier's 10 minutes, so equal
chunks left workers idle). `remote-train.sh` copies this tree to another
machine, trains there detached, and copies the model and results back: on a
Ryzen 7 7800X3D (16 threads) it's 5.7× the Beelink (Intel N150, 4 cores), and
the same seeds give the same results generation for generation, so a model
doesn't depend on where it trained. Use the same Node version on both.

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
trained model and then the rule sets (`models/index.json`, which training
keeps up to date; `node ai/model-index.mjs` rebuilds it), and a tier picker
beside it: a model starts on its own tier, a rule set keeps the tier that's
showing, so both play the same tier. For a rule set, the
network diagram gives way to its rules, the one firing highlighted. The URL
keeps both (`?model=tier2&tier=3`). 1× / 2× / 4× / 10×; a run that ends restarts on a new seed.
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
- **The same bug, twice.** Tier 4's first model was trained with no
  obstacles during the bosses: the environment keeps the game's spawner off
  by setting its count to Infinity, and the chase resets it when it starts,
  but the boss doesn't, so a boss was 27 empty seconds. Found by watching a
  run in the viewer. Handing the environment's count to the game as a scene
  starts fixed it, and the tier-4 test now requires obstacles in every boss.
- **Validate on enough runs for the goal.** Retrained on the fixed tier 4,
  training stopped after 2 generations on a model that cleared 12 of 12
  validation runs but only 93 of 100 unseen ones: at a 30,000 cap a 93% model
  clears 12 in a row 4 times in 10. With 48 validation runs (3 in 100), it
  trained 29 generations to a model that clears all 100.
- **The curriculum matters more as tiers stack up.** On tier 2, starting from
  the tier-1 champion only saved generations. On tier 3, it decided the
  outcome: from the tier-2 champion, 288 of 300 unseen runs at once; from
  scratch, after 30 minutes and 1,498 generations, 68 of 300 (dying to 149
  towers and 67 acorns), having to learn the tower's double jump and the
  chase's short reaction times all at once.

## The baseline: is a network worth it?

A fair question: wouldn't a few if-statements do as well? The radar already
does much of the work (times rather than distances, bands that say jump or
duck), so the baseline gets exactly the network's inputs and nothing more.

`rules-naive` is the obvious rules, written once and never tuned: something
in the ground band within ⅕ s, on the ground: jump; something in the head
band within ⅕ s: duck; a tower (ground and high air both near): jump, then
again as it starts to fall. 100 unseen runs per tier, the same seeds as the
networks:

| Tier | Mean | Best | Cleared | What ended its runs |
|---|---|---|---|---|
| 0 | 82 | 419 | 0 / 100 | chocolate bar 100 |
| 1 | 144 | 2,785 | 0 / 100 | chocolate bar 98, bird stack 2 |
| 2 | 47 | 167 | 0 / 100 | tower 62, chocolate bar 38 |
| 3–4 | 47 | 167 | 0 / 100 | the same: every run ends before the first chase or boss |

The rules do what they say (`tests/ai.test.js` checks each one on hand-made
inputs); the obvious number is what fails. A jump lasts about ⅓ s, and a
chocolate bar plus the dog's own length take about 0.37 s to pass, so
jumping when the bar is ⅕ s off lands the dog on its far end. Timing is the
whole problem, and the network found its timings by itself, in 19 seconds
for tier 0.

`rules-tuned` is the best version that stays maintainable: a handful of
general rules, each a principle rather than a case, with 4 named numbers
(`TUNED`) tuned one at a time on separate seeds (`tune-rules.mjs`).

1. A tower ahead (its high-air and ground parts arrive together: one
   column), on the ground, and it'll be past within 0.95 (a double jump's
   airtime): jump.
2. In the air, falling, double jump unused, a tower still ahead, and down to
   height 0.8: jump again.
3. Something at head height comes first, within 0.2 (or it's at the dog):
   duck.
4. Something on the ground, on the ground, and it'll be past within 0.65
   (before a jump lands): jump.
5. Otherwise: do nothing.

The same 100 unseen runs per tier, against the networks:

| Tier | `rules-naive` | `rules-tuned` | The network |
|---|---|---|---|
| 0 | 0 / 100 (mean 82) | **100 / 100** | 50 / 50 (`tier0`, 19 s of training) |
| 1 | 0 / 100 (mean 144) | **92 / 100** (mean 7,931) | 300 / 300 (`tier1`) |
| 2 | 0 / 100 (mean 47) | 1 / 100 (mean 4,537) | 293 / 300 (`tier2`) |
| 3 | 0 / 100 | 0 / 100 (mean 4,365) | 288 / 300 (`tier3-from-tier2`) |
| 4 | 0 / 100 | 1 / 100 (mean 4,084) | 100 / 100, to 30,000 and to 100,000 (`tier4-from-tier3`) |

Rule 4 is the whole difference on tiers 0 and 1: "jump so it's past before
you land" covers every width at every speed with one number. Towers are what
the rules can't manage, and not as a wall: below speed 4.0 they cleared all
1,934 towers they met (100 tier-2 runs); from 4.0 each tower is a small risk
that grows with speed, 1.7% at 4.0–4.5, 4–5% to 5.5, 7–9% above. A run meets
dozens, so the risk adds up. It's a combination:

- **A tower right behind a chocolate bar.** All 95 fatal towers came into
  range with the dog in the air, 90 of them behind a bar within 0.6 s (of
  the 2,141 cleared, 4% had anything that close). Spawn gaps are set in
  pixels, so in time they shrink with speed: the shortest gap before a
  change of type is 1.25 s at speed 3, 0.94 s at 4, and 0.56 s at the top.
  The dog is still coming down from the bar when it should start the tower's
  early jump.
- **The sixth bar** (from `TOWER_TALL_FROM_SPEED`, 4.0) needs that early jump
  more. With every tower kept at 5 bars (a temporary experiment), failures
  start at 5.0 instead of 4.0 and run about a third as often.

The radar can't tell a 5-bar tower from a 6-bar one (both fill all four
bands), and they want different double jumps; nor does a rule know it's in
a squeeze until it's in one. Tuning can't split the difference (the sweep
moved the mean from 4,343 to 4,571), and the fixes tried each needed a new
threshold to stop them misfiring (a fast-fall rule, to get down in time for
the tower, dropped the dog onto the very tower it was jumping). The network
handles it, from the same inputs; a rule would have to name the case ("a bar
then a tower, above speed 4"), and that's the start of the mountain of
if-statements.

So the coworker is half right: a few well-chosen rules on these inputs play
the early game as well as the network does. They don't scale. Each new thing
the game throws needs a person to find the principle, the threshold, and
the case it breaks; the network took each new tier in a few generations.

## Points, not just survival (tier 5)

Every tier before 5 rewarded survival: fitness was the score at death,
capped, so a run that reached the cap scored the same however it got there.
The tier-4 champion ducked all 1,483 lone birds it met in 20 runs, leaving
about 3,700 points a run uncollected (a jumped lone bird pays 50; ducking is
safer, and a bonus also speeds the game up). Tier 5 fixes the objective: the
most points in 10 minutes of hyper, where dying early costs everything after.
Hyper reaches the 4.5 boss about 50 s in, the frenzy about 2 minutes in, and
top speed about 3, so a run covers all of it; the game itself still has no
time limit (`TIERS[5].minutes` is the environment's rule).

**The first model found an exploit** (`tier5-exploit`). An hour of training
sat near 9,000 for 180 generations, then jumped to 11,436 in the last few:
10,919 points a run, 35% of lone birds "jumped". Watching it in the viewer,
the bird count went up while the dog ducked. The game paid the bonus if the
dog was in the air when the bird's back edge passed its tail, and never
checked it had been over the bird: ducking under and hopping as the bird
cleared paid the same. All 137 of its bonuses in 10 runs were that; it never
jumped over a bird. Evolution optimized exactly what the score rewarded, not
what it meant: reward hacking. The game now pays only if the dog was in the
air the whole time the bird passed it (`update.js`, with a test), which
closes it for players too. Under the fixed rule the exploit model scores
8,483, worse than the champion it came from, still taking risks for a bonus
that no longer pays.

With the exploit closed, an hour on the faster PC (693 generations, about
5.7 hours of the Beelink's) never beat 9,038 (`results/tier5-fixed-birds/`):
the population got steadily better at surviving (its mean rose from 3,269 to
7,587) and no network found a real bird jump. The exploit was one small
change from ducking; a real jump means giving up the duck and timing a
take-off, and the halfway versions hit the bird. Fitness is a whole run's
points, so one jump's +50 is noise beside a death's thousands.

**Drills and the clean jump broke the crutch** (`tier5-mixed`). Hyper now
pays a clean jump (a jump that never uses its double jump; see CLAUDE.md),
which the tier-4 champion never made: it double-jumped all 3,715 bars it met
in 10 runs. Training with `--mix 6` (the drills, where a failed jump costs a
heart, not the run) went from 9,038 to 15,459 points in 76 generations (10
minutes on the PC): it single-jumps 78% of bars and still survives every
run. It still ducks every lone bird, which in hyper breaks the streak.

It also forgot normal mode: on normal tier 4 it averaged 93 points, dying to
chocolate bars at speed 3.0–3.2, where its parent clears 100 of 100. Hyper
never goes below speed 4, and 187 generations without slow speeds were
enough to lose them. Hyper is the AI's mode from here.

On 100 unseen tier-5 runs, under the fixed rule:

| Player | Points (mean) | Median | Lasted 10 min | Lone birds jumped |
|---|---|---|---|---|
| `tier4-from-tier3` | 9,038 | 9,038 | 100 / 100 | 0 / 8,106 (0%) |
| `rules-tuned` | 1,531 | 1,439 | 0 / 100 | 0% |
| `tier5-exploit` | 8,483 | 9,038 | 90 / 100 | 0% (its 35% was the exploit) |

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
| `tier4-from-tier3` | 4, to 30,000 | generation 29, 21 min (48 validation runs) | 100 / 100 to 30,000; 100 / 100 to 100,000 |

The tier-3 champion already cleared tier 4 to 8,000 in 93 of 100 runs: the
bosses and the frenzy asked little new of it. Its limit was staying power at
top speed: to 30,000 it cleared 61 of 100 (31 deaths to the tall tower). So
tier 4 trained with `--cap 30000` and `--validation 48`, and the champion
clears every run to 30,000 and to 100,000.

