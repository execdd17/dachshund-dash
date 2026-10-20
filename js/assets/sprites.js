// PNG sprite loading and frame-advance state for the dachshund and squirrel.
// Image loading is browser-only; the frame-selection helpers
// (getDogSpriteAnim, getDogJumpFrameIndex) are pure and unit-testable.

import { GROUND_Y, DOG_SPRITE_FPS, SQUIRREL_SPRITE_FPS, BIRD_SPRITE_FPS, BITE_ANIM_MS } from '../config.js';
import { DOG_SPRITE_DIR, DOG_BITE_SHEET, DOG_BITE_FRAMES, DOG_FRAME_FILES } from './dogFrames.js';
import { loadImages } from './images.js';
import { isGiant } from '../systems/giant.js';

export function createSpriteStore() {
  return {
    dogSprites: { idle: [], run: [], jump: [], slide: [], fall: [], dead: [], doublejump: [], bite: [] },
    dogSpritesReady: false,
    dogSpriteAnim: 'idle',
    dogSpriteFrame: 0,
    dogSpriteLastAdvance: 0,

    squirrelSprites: { run: [] },
    squirrelSpritesReady: false,
    squirrelSpriteFrame: 0,
    squirrelSpriteLastAdvance: 0,

    birdSprites: { fly: [] },
    birdSpritesReady: false,
    birdSpriteFrame: 0,
    birdSpriteLastAdvance: 0,
  };
}

export function loadDogSprites(store) {
  const sprites = store.dogSprites;
  const anims = Object.keys(DOG_FRAME_FILES);
  const paths = anims.flatMap(anim => DOG_FRAME_FILES[anim].map(f => `${DOG_SPRITE_DIR}/${f}`));
  const images = loadImages([...paths, `${DOG_SPRITE_DIR}/${DOG_BITE_SHEET}`], () => { store.dogSpritesReady = true; });
  let i = 0;
  for (const anim of anims) sprites[anim] = DOG_FRAME_FILES[anim].map(() => images[i++]);
  sprites.bite = [images[i]];
  sprites.idle = sprites.run.slice(0, 1);
  sprites.dead = sprites.run.slice(0, 1);
}

const numbered = (prefix, count) => Array.from({ length: count }, (_, i) => `${prefix}_${String(i).padStart(2, '0')}.png`);

export function loadSquirrelSprites(store) {
  store.squirrelSprites.run = loadImages(numbered('png/squirrel/squirrel_run', 3), () => { store.squirrelSpritesReady = true; });
}

export function loadBirdSprites(store) {
  store.birdSprites.fly = loadImages(numbered('png/bird/bird_fly', 6), () => { store.birdSpritesReady = true; });
}

// Which animation set the dog should be showing, given game state.
// `now` is injected for testability (defaults to performance.now()).
export function getDogSpriteAnim(state, now = performance.now()) {
  if (state.gameState === 'dead') return 'dead';
  if (isGiant(state) && state.giantChompEffects.length > 0
    && now - state.giantChompEffects[state.giantChompEffects.length - 1].startTime < BITE_ANIM_MS) return 'bite';
  if (state.dog.ducking) return 'slide';
  if (state.dog.jumping) return state.dog.doubleJumped ? 'doublejump' : 'jump';
  if (state.gameState === 'idle' || state.gameState === 'setup') return 'idle';
  return 'run';
}

// Jump arc → frame: rising = 0, near ground = 2, apex/falling = 1.
export function getDogJumpFrameIndex(dog) {
  if (dog.vy < 0) return 0;
  if (dog.y >= GROUND_Y - 25) return 2;
  return 1;
}

// True (and stamps the time) once a frame period has passed for this sprite.
function frameDue(store, lastKey, fps, now) {
  if (now - store[lastKey] < 1000 / fps) return false;
  store[lastKey] = now;
  return true;
}

const nextLoopFrame = (frame, frames) => (frames?.length ? (frame + 1) % frames.length : frame);

export function advanceDogSpriteFrame(store, state, now = performance.now()) {
  if (!frameDue(store, 'dogSpriteLastAdvance', DOG_SPRITE_FPS, now)) return;
  const anim = getDogSpriteAnim(state, now);
  if (anim !== store.dogSpriteAnim) {
    store.dogSpriteAnim = anim;
    store.dogSpriteFrame = 0;
  } else if (anim === 'bite') {
    store.dogSpriteFrame = Math.min(store.dogSpriteFrame + 1, DOG_BITE_FRAMES - 1);  // play once, hold the last frame
  } else {
    store.dogSpriteFrame = nextLoopFrame(store.dogSpriteFrame, store.dogSprites[anim]);
  }
}

export function advanceBirdSpriteFrame(store, now = performance.now()) {
  if (frameDue(store, 'birdSpriteLastAdvance', BIRD_SPRITE_FPS, now)) {
    store.birdSpriteFrame = nextLoopFrame(store.birdSpriteFrame, store.birdSprites.fly);
  }
}

export function advanceSquirrelSpriteFrame(store, now = performance.now()) {
  if (frameDue(store, 'squirrelSpriteLastAdvance', SQUIRREL_SPRITE_FPS, now)) {
    store.squirrelSpriteFrame = nextLoopFrame(store.squirrelSpriteFrame, store.squirrelSprites.run);
  }
}
