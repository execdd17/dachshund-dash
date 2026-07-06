# Dachshund Dash

A pixel-art endless runner starring the world's most determined wiener dog. Jump over hershey bars, duck under frisbees, and chase down squirrels — all from your browser.

Inspired by Chrome's Dino Run, but with more personality (and more hot dogs).

**[Play it now](https://execdd17.github.io/dachshund-dash/)**

## How to Play

- **Jump**: Space, Up Arrow, tap, or click
- **Duck**: Down Arrow or S
- **Double jump**: Press jump again mid-air

That's it. No tutorials, no loading screens, no accounts. Just run.

On mobile, turn your phone sideways — tap the right side to jump, hold the left side to duck.

## What You'll Find

- A hand-animated dachshund with pixel-art sprites
- A day/night cycle with sunsets, starry skies, and dynamic weather
- A soulful soundtrack (with an EDM remix for special occasions)
- Squirrel chases and a boss encounter
- Giant mode — grab a golden hot dog and become unstoppable
- Trampoline scenes — thorn patches where a super-bounce off a trampoline island is the only way through
- Global high score leaderboard (plus a local best shown as `HI` in the HUD)

## Run It Locally

Clone the repo and serve it with any static file server — the game uses native ES modules, which browsers won't load from `file://`:

```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

No build step, no dependencies, no framework.

## Run the Tests

The game logic has a unit test suite that runs on Node's built-in test runner (Node 18+, no packages to install):

```bash
npm test          # or: node --test tests/*.test.js
```

## Code Layout

- `index.html` — thin HTML shell
- `css/style.css` — all styles
- `js/` — ES modules: `config.js` (tuning constants), `core/` (state, day/night cycle), `systems/` (physics, spawning, collision, chase/boss/giant modes), `render/` (canvas drawing), `audio/`, `assets/`, `cosmetics/`, `leaderboard/`, `input/`, and `main.js` (wires it all together)
- `tests/` — unit tests for the game logic

## Controls

| Action | Keyboard | Mobile |
|--------|----------|--------|
| Jump | Space / Up | Tap right side |
| Duck | Down / S | Hold left side |
| Toggle music | Click speaker icon | Tap speaker icon |

