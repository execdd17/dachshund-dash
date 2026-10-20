---
name: verify
description: Headless browser verification recipe for Dachshund Dash gameplay changes
---

# Verifying Dachshund Dash in a headless browser

Start with the scripted checks (see CLAUDE.md, Common Commands):

```bash
npm run verify:smoke                    # end-to-end run; screenshots in $TMPDIR/dachshund-smoke
npm run verify:lockstep -- main         # behavior-preserving changes: update() frame by frame
npm run verify:render -- main           # behavior-preserving changes: full-frame pixels
```

For anything they don't cover, write a playwright-core script (it's a
devDependency) reusing `tools/verify/lib.mjs`: `serve(dir)` for an ephemeral
static server, `launchBrowser()` for the Playwright Chromium, and
`newPage(browser)`, which already blocks Firestore.

## Driving the game

- **Block the production leaderboard first** (`newPage` does): `await page.route(/firestore\.googleapis\.com/, r => r.abort())` before `goto`. A headless death otherwise posts a real score to the global board (and with the route blocked, the game-over banner shows "1st place" because the board looks empty — expected).
- Get past the start overlay: fill `#nameInput`, optionally set `#difficultySlider` (0 = VERY EASY, 6 hearts — good for unattended runs; 4 = VERY HARD, 1 heart — quick deaths) and dispatch `input`, then click `#nameSubmitBtn`.
- Start/restart a run: `page.keyboard.press('Space')` or click the `#game` canvas.
- To force collisions, just never jump — the dog hits the first obstacle in ~5s.
- A fresh profile opens its first run with the controls tutorial, and debug scene keys do nothing while it runs. To skip it, `addInitScript` setting `localStorage.dachshundDashTutorial` to `JSON.stringify({ version: Number.MAX_SAFE_INTEGER, seenAt: Date.now() })` (not `Infinity`: JSON turns it into `null`). To drive it, wait for its gold prompt text, as `tools/verify/smoke.mjs` does.
- Debug keys (`js/input/debug.js`): P slow-mo, C chase, B boss, T trampoline scene, G golden hot dog, R rain, H hat. C/B/T/G only act mid-run; C/B/T never start a scene on top of a running one.
- Collect `pageerror` / console errors — CLAUDE.md says asset/Firebase init errors show there.

## Reading game state (it's all canvas — no DOM text)

- The canvas fills the viewport on every device, so the logical→pixel scale depends on the window size: scale = `canvas.width / 800`, and extra height is sky above world y=0 (`extraTop = canvas.height/scale - 250`). Sample logical `(x, y)` via `getImageData(x*scale, (y+extraTop)*scale, 1, 1)`. HUD origin is `(14, top)` — e.g. hearts sit at logical y≈62.
- DOM signals: `#customizeBtn.visible` ⇔ gameState idle/dead (wait for it to clear first to know a run started); `#nameEntryOverlay.visible` ⇔ the start overlay (setup state). Game state itself isn't global — pure modules can be imported in `page.evaluate` (`await import('/js/…')`) but the live `state` object can't be reached.
- After death there is a 1s input lockout (`control.js`) before restart works.

## Gotchas

- After clicking `#nameSubmitBtn`, the button keeps focus, so a subsequent
  `Space` activates the button instead of restarting — click the canvas or blur first.
- `#customizeBtn` has an idle animation, so Playwright never sees it as stable — click it with `{ force: true }`.
- Screenshot the page and Read the PNG to eyeball rendering; pixel probes for assertions.
- On the Beelink, port 8000 is taken — serve by hand on 8123 (see CLAUDE.md); the tools pick a free port.
