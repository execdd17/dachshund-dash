// PNG sprite loading and frame-advance state for the dachshund and squirrel.
// Image loading is browser-only; the frame-selection helpers
// (getDogSpriteAnim, getDogJumpFrameIndex) are pure and unit-testable.

import { GROUND_Y, DOG_SPRITE_FPS, SQUIRREL_SPRITE_FPS, BIRD_SPRITE_FPS } from '../config.js';

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
  const runPaths = ['png/dachshund/dachshund_run_00.png', 'png/dachshund/dachshund_run_01.png', 'png/dachshund/dachshund_run_02.png'];
  const pancakePaths = ['png/dachshund/dachshund_pancake_00.png', 'png/dachshund/dachshund_pancake_01.png', 'png/dachshund/dachshund_pancake_02.png'];
  const jumpPaths = ['png/dachshund/dachshund_jump_00.png', 'png/dachshund/dachshund_jump_01.png', 'png/dachshund/dachshund_jump_02.png'];
  const doublejumpPaths = ['png/dachshund/dachshund_flip_00.png', 'png/dachshund/dachshund_flip_01.png', 'png/dachshund/dachshund_flip_02.png'];
  let pending = runPaths.length + pancakePaths.length + jumpPaths.length + doublejumpPaths.length + 1; // +1 for bite sheet
  const onLoad = () => { pending--; if (pending === 0) store.dogSpritesReady = true; };
  runPaths.forEach((path, i) => {
    const img = new Image();
    img.onload = img.onerror = onLoad;
    img.src = path;
    sprites.run[i] = img;
  });
  pancakePaths.forEach((path, i) => {
    const img = new Image();
    img.onload = img.onerror = onLoad;
    img.src = path;
    sprites.slide[i] = img;
  });
  jumpPaths.forEach((path, i) => {
    const img = new Image();
    img.onload = img.onerror = onLoad;
    img.src = path;
    sprites.jump[i] = img;
  });
  doublejumpPaths.forEach((path, i) => {
    const img = new Image();
    img.onload = img.onerror = onLoad;
    img.src = path;
    sprites.doublejump[i] = img;
  });
  sprites.idle = sprites.run.slice(0, 1);
  sprites.dead = sprites.run.slice(0, 1);
  // Bite sprite sheet (3 horizontal frames in one image)
  const biteSheet = new Image();
  biteSheet.onload = biteSheet.onerror = onLoad;
  biteSheet.src = 'png/dachshund/bite_3_image_sequence.png';
  sprites.bite = [biteSheet];
}

export function loadSquirrelSprites(store) {
  const runPaths = ['png/squirrel/squirrel_run_00.png', 'png/squirrel/squirrel_run_01.png', 'png/squirrel/squirrel_run_02.png'];
  let pending = runPaths.length;
  const onLoad = () => { pending--; if (pending === 0) store.squirrelSpritesReady = true; };
  runPaths.forEach((path, i) => {
    const img = new Image();
    img.onload = img.onerror = onLoad;
    img.src = path;
    store.squirrelSprites.run[i] = img;
  });
}

export function loadBirdSprites(store) {
  const flyPaths = [
    'png/bird/bird_fly_00.png', 'png/bird/bird_fly_01.png', 'png/bird/bird_fly_02.png',
    'png/bird/bird_fly_03.png', 'png/bird/bird_fly_04.png', 'png/bird/bird_fly_05.png',
  ];
  let pending = flyPaths.length;
  const onLoad = () => { pending--; if (pending === 0) store.birdSpritesReady = true; };
  flyPaths.forEach((path, i) => {
    const img = new Image();
    img.onload = img.onerror = onLoad;
    img.src = path;
    store.birdSprites.fly[i] = img;
  });
}

// Which animation set the dog should be showing, given game state.
// `now` is injected for testability (defaults to performance.now()).
export function getDogSpriteAnim(state, now = performance.now()) {
  if (state.gameState === 'dead') return 'dead';
  if (state.giantActive && state.giantChompEffects.length > 0
    && now - state.giantChompEffects[state.giantChompEffects.length - 1].startTime < 250) return 'bite';
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

export function advanceDogSpriteFrame(store, state, now = performance.now()) {
  const frameDuration = 1000 / DOG_SPRITE_FPS;
  if (now - store.dogSpriteLastAdvance >= frameDuration) {
    store.dogSpriteLastAdvance = now;
    const anim = getDogSpriteAnim(state, now);
    if (anim !== store.dogSpriteAnim) {
      store.dogSpriteAnim = anim;
      store.dogSpriteFrame = 0;
    } else {
      if (store.dogSpriteAnim === 'bite') {
        store.dogSpriteFrame = Math.min(store.dogSpriteFrame + 1, 2); // cap at 3 frames, hold last
      } else {
        const frames = store.dogSprites[store.dogSpriteAnim];
        if (frames && frames.length > 0) {
          store.dogSpriteFrame = (store.dogSpriteFrame + 1) % frames.length;  // loop
        }
      }
    }
  }
}

export function advanceBirdSpriteFrame(store, now = performance.now()) {
  const frameDuration = 1000 / BIRD_SPRITE_FPS;
  if (now - store.birdSpriteLastAdvance >= frameDuration) {
    store.birdSpriteLastAdvance = now;
    const frames = store.birdSprites.fly;
    if (frames && frames.length > 0) {
      store.birdSpriteFrame = (store.birdSpriteFrame + 1) % frames.length;
    }
  }
}

export function advanceSquirrelSpriteFrame(store, now = performance.now()) {
  const frameDuration = 1000 / SQUIRREL_SPRITE_FPS;
  if (now - store.squirrelSpriteLastAdvance >= frameDuration) {
    store.squirrelSpriteLastAdvance = now;
    const frames = store.squirrelSprites.run;
    if (frames && frames.length > 0) {
      store.squirrelSpriteFrame = (store.squirrelSpriteFrame + 1) % frames.length;
    }
  }
}
