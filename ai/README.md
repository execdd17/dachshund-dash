# ai/ — teaching a network to play

A modest experiment: a small neural network learns, by neuroevolution, to play
a cut-down Dachshund Dash with only the two basic obstacles, chocolate bars
and single birds. It runs on the real game logic in `js/` (no browser, no
drawing), so a run takes milliseconds instead of minutes. Nothing here is
part of the game, and nothing here touches the leaderboard.

## The setup

- **Environment** (`env.js`): the real `update()`, with the game's spawner,
  scenes, golden hot dogs, and frenzy held off; it spawns chocolate bars and
  single birds (at duck height) itself, at the game's own gaps. One heart:
  any hit ends the run. Speed follows the normal ramp, 3.0 up to 6.75.
- **What the network sees** (`observe.js`, 12 numbers): the dog's height,
  vertical speed, whether it's jumping, has double-jumped, or is ducking; the
  speed; and for each of the next two obstacles, the time until it reaches the
  dog's nose and its type.
- **What it does**: 30 times a second, one of nothing, jump, or duck (held).
- **The network** (`net.js`): 12 inputs → 16 hidden (tanh) → 3 actions.
- **Training** (`train.mjs`): a population of 150 networks plays the same 3
  fresh random runs each generation; the best 6 carry over, and the rest are
  bred from the fitter half by crossover and mutation. On every core. Each
  generation's best is checked on 12 fixed validation runs, and the best of
  those is saved to `models/best.json`.
- **Evaluation** (`evaluate.mjs`): the saved network on 50 runs it never saw.

A run counts as cleared at 8,000 points (`SCORE_CAP`), past top speed (7,500).

## Running it

```bash
node ai/train.mjs [minutes=30]    # → ai/models/best.json, ai/results/curve.csv
node ai/evaluate.mjs [runs=50]    # → ai/results/evaluation.json
```

## Watch it

`ai/watch.html` plays the saved network in real time with the game's own
graphics: the obstacle it's reacting to is outlined (the next one dashed), and
its choice (JUMP / DUCK) shows above the dog. 1× / 2× / 4× speed; a run that
ends restarts on a new random seed. Serve the repo root and open
`/ai/watch.html` (dachshund-dash.home, or `python3 -m http.server` locally).

## What mattered

Feeding each obstacle's *distance* (as a share of the screen) left the
population stuck around 200 points: the right moment to jump is a narrow band
of distances that also shifts with speed. Feeding the *time until contact*
(distance ÷ speed) instead made that moment one large, speed-independent
value, and the first minute of training went from ~200 to ~7,700.
