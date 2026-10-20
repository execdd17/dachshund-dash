// The dachshund's animation frames — the one list of sprite files, shared by
// the sprite loader, the per-frame cosmetic overlays, and the tools/
// generators (which require() this module).

export const DOG_SPRITE_DIR = 'png/dachshund';
export const DOG_BITE_SHEET = 'bite_3_image_sequence.png';
export const DOG_BITE_FRAMES = 3;
export const DOG_FRAME_W = 512;   // every frame (and each bite-sheet cell) is 512x1024
export const DOG_FRAME_H = 1024;

export const DOG_FRAME_FILES = {
  run: ['dachshund_run_00.png', 'dachshund_run_01.png', 'dachshund_run_02.png'],
  slide: ['dachshund_pancake_00.png', 'dachshund_pancake_01.png', 'dachshund_pancake_02.png'],
  jump: ['dachshund_jump_00.png', 'dachshund_jump_01.png', 'dachshund_jump_02.png'],
  doublejump: ['dachshund_flip_00.png', 'dachshund_flip_01.png', 'dachshund_flip_02.png'],
};

// Poses without art of their own borrow another pose's frame: idle/dead
// stand on run[0], and the flip lands on the jump's landing frame. Every
// per-frame lookup (base sprite, head anchors, cosmetic overlays) goes
// through here so they always agree.
export function resolveDogFrame(anim, frameIdx) {
  if (anim === 'idle' || anim === 'dead') return { anim: 'run', frameIdx: 0 };
  if (anim === 'doublejump' && frameIdx === 2) return { anim: 'jump', frameIdx: 2 };
  return { anim, frameIdx };
}
