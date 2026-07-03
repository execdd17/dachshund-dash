// Composition root: builds every service, wires them together, and starts
// the game loop. This is the only module that touches all the others; each
// subsystem only sees the collaborators it's handed.

import { createState } from './core/state.js';
import { createSfx } from './audio/sfx.js';
import { createMusic } from './audio/music.js';
import { createSpriteStore, loadDogSprites, loadSquirrelSprites } from './assets/sprites.js';
import { createCosmetics } from './cosmetics/cosmetics.js';
import { createCosmeticsMenu } from './cosmetics/menu.js';
import { initFirebase } from './firebase.js';
import { createGlobalScores } from './leaderboard/global.js';
import { createLeaderboardUi } from './leaderboard/ui.js';
import { loadHighScores } from './leaderboard/local.js';
import { createNameEntry } from './ui/nameEntry.js';
import { update } from './systems/update.js';
import { draw } from './render/draw.js';
import { wireInput, isTouchDevice } from './input/input.js';

// --- DOM / device setup ---
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const touchDevice = isTouchDevice();
if (touchDevice) document.body.classList.add('touch-device');

// --- State ---
const state = createState();
state.highScores = loadHighScores(localStorage);
state.highScore = state.highScores[0]?.score ?? 0;

// --- Services ---
const sfx = createSfx();
const music = createMusic();
music.attachAutoplayUnlock();

const sprites = createSpriteStore();
loadDogSprites(sprites);
loadSquirrelSprites(sprites);

const cosmetics = createCosmetics(localStorage);
cosmetics.loadImages();

const globalScores = createGlobalScores(initFirebase());
const leaderboardUi = createLeaderboardUi(globalScores);
globalScores.onChange = leaderboardUi.render;

const nameEntry = createNameEntry(state, { storage: localStorage, globalScores });
const cosmeticsMenu = createCosmeticsMenu(cosmetics, sprites, state);

// Everything update() needs to cause effects outside the state object.
const services = {
  sfx,
  music,
  globalScores,
  showNameEntryOverlay: nameEntry.show,
};

// --- Wiring ---
wireInput({ state, canvas, services, nameEntry, cosmetics, cosmeticsMenu, music, touchDevice });
nameEntry.wireControls();
cosmeticsMenu.wireControls();
leaderboardUi.wireControls();

// --- Main loop ---
let lastFrameTime = 0;
function gameLoop(now) {
  now = now ?? performance.now();
  const dt = lastFrameTime ? Math.min(now - lastFrameTime, 100) : 16.67;
  lastFrameTime = now;
  update(state, dt, services);
  cosmeticsMenu.updateCustomizeButtonVisibility();
  draw({
    canvas, ctx, state, sprites, cosmetics, music,
    // Periodic global score refresh while sitting on the idle screen
    onIdleFrame: () => globalScores.maybeRefresh(),
  });
  requestAnimationFrame(gameLoop);
}

// --- Start ---
leaderboardUi.render();
globalScores.fetch();
gameLoop();
