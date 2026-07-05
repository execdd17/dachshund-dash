---
name: verify
description: Headless browser verification recipe for Dachshund Dash gameplay changes
---

# Verifying Dachshund Dash in a headless browser

Serve the repo and drive it with playwright-core against the system Playwright
Chromium (no npm install in the repo needed):

```bash
python3 -m http.server 8123 &          # ES modules need HTTP, not file://
cd <scratchpad> && npm init -y && npm install playwright-core
```

```js
const { chromium } = require('playwright-core');
const browser = await chromium.launch({
  executablePath: process.env.HOME + '/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
});
```

## Driving the game

- Start/restart a run: `page.keyboard.press('Space')` or click the `#game` canvas.
- To force collisions, just never jump — the dog hits the first obstacle in ~5s.
- Debug keys (running state): P slow-mo, C chase, B boss, G golden hot dog, R rain.
- Collect `pageerror` / console errors — CLAUDE.md says asset/Firebase init errors show there.

## Reading game state (it's all canvas — no DOM text)

- The canvas fills the viewport on every device, so the logical→pixel scale depends on the window size: scale = `canvas.width / 800`, and extra height is sky above world y=0 (`extraTop = canvas.height/scale - 250`). Sample logical `(x, y)` via `getImageData(x*scale, (y+extraTop)*scale, 1, 1)`. HUD origin is `(14, top)` — e.g. hearts sit at logical y≈62.
- DOM signals: `#customizeBtn.visible` ⇔ gameState idle/dead; `#nameEntryOverlay.visible` ⇔ enteringName (death with qualifying score — always qualifies on a fresh profile).
- After death there is a 1s input lockout (`control.js`) before restart works.

## Gotchas

- After clicking `#nameSubmitBtn`, the button keeps focus, so a subsequent
  `Space` activates the button instead of restarting — click the canvas or blur first.
- Screenshot the page and Read the PNG to eyeball rendering; pixel probes for assertions.
