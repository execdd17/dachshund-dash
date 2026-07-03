// Dachshund and squirrel rendering: PNG sprite sequences with a procedural
// fallback for the squirrel, plus the cosmetic overlay compositing.

import {
  GROUND_Y,
  DOG_SPRITE_SCALE, DOG_SPRITE_ANCHOR, DOG_SPRITE_GROUND_OFFSET,
  SQUIRREL_SPRITE_SCALE, SQUIRREL_SPRITE_GROUND_OFFSET,
} from '../config.js';
import { getDogSpriteAnim, getDogJumpFrameIndex } from '../assets/sprites.js';
import { COSMETIC_DRAW_ORDER, SLOT_ANCHOR_OFFSET, getHeadAnchor } from '../cosmetics/cosmetics.js';

export function drawSpriteFrameLayer(targetCtx, img, anchorX, groundY, scale, groundOffset) {
  if (!img || !img.complete || !img.naturalWidth) return;
  const sw = img.naturalWidth, sh = img.naturalHeight;
  const dw = sw * scale, dh = sh * scale;
  const dx = anchorX - dw / 2;
  const dy = groundY - dh + groundOffset;
  targetCtx.drawImage(img, 0, 0, sw, sh, dx, dy, dw, dh);
}

export function drawSpriteSheetLayer(targetCtx, sheet, frameIdx, anchorX, groundY, scale, groundOffset) {
  if (!sheet || !sheet.complete || !sheet.naturalWidth) return;
  const frameW = 512, frameH = 1024;
  const dw = frameW * scale, dh = frameH * scale;
  const dx = anchorX - dw / 2;
  const dy = groundY - dh + groundOffset;
  const sx = (frameIdx % 3) * frameW;
  targetCtx.drawImage(sheet, sx, 0, frameW, frameH, dx, dy, dw, dh);
}

export function drawCosmeticOverlay(targetCtx, img, anchor, offset, anchorX, groundY, scale, groundOffset) {
  if (!img || !img.complete || !img.naturalWidth) return;
  const dw = 512 * scale, dh = 1024 * scale;
  const dx = anchorX - dw / 2;
  const dy = groundY - dh + groundOffset;
  const px = dx + (anchor.x + offset.dx) * scale;
  const py = dy + (anchor.y + offset.dy) * scale;
  const angleRad = (anchor.angle + offset.angleOffset) * Math.PI / 180;
  const iw = img.naturalWidth * scale * offset.scale;
  const ih = img.naturalHeight * scale * offset.scale;
  targetCtx.save();
  targetCtx.translate(px, py);
  targetCtx.rotate(angleRad);
  targetCtx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
  targetCtx.restore();
}

function drawEquippedCosmetics(ctx, cosmetics, anim, frameIdx, anchorX, y) {
  COSMETIC_DRAW_ORDER.forEach(slot => {
    const itemId = cosmetics.equipped[slot];
    if (!itemId) return;
    const img = cosmetics.imageById[slot][itemId];
    const anchor = getHeadAnchor(anim, frameIdx);
    drawCosmeticOverlay(ctx, img, anchor, SLOT_ANCHOR_OFFSET[slot], anchorX, y, DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET);
  });
}

function drawDachshundSprite(ctx, state, sprites, cosmetics, x, y) {
  const anim = getDogSpriteAnim(state);
  const anchorX = x + state.dog.width * DOG_SPRITE_ANCHOR;
  const dogSprites = sprites.dogSprites;

  // Bite animation: 3-frame horizontal sprite sheet, source-rect slicing
  if (anim === 'bite' && dogSprites.bite && dogSprites.bite[0]) {
    const sheet = dogSprites.bite[0];
    if (!sheet.complete || !sheet.naturalWidth) return false;
    drawSpriteSheetLayer(ctx, sheet, sprites.dogSpriteFrame, anchorX, y, DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET);
    drawEquippedCosmetics(ctx, cosmetics, 'bite', sprites.dogSpriteFrame, anchorX, y);
    return true;
  }

  const baseFrames = dogSprites[anim];
  const frameIdx = (anim === 'jump' || anim === 'doublejump')
    ? getDogJumpFrameIndex(state.dog)
    : (sprites.dogSpriteFrame % (baseFrames?.length || 1));
  const baseImg = (anim === 'doublejump' && frameIdx === 2) ? dogSprites.jump[2] : (baseFrames && baseFrames[frameIdx]);
  if (!baseImg || !baseImg.complete || !baseImg.naturalWidth) return false;
  drawSpriteFrameLayer(ctx, baseImg, anchorX, y, DOG_SPRITE_SCALE, DOG_SPRITE_GROUND_OFFSET);
  drawEquippedCosmetics(ctx, cosmetics, anim, frameIdx, anchorX, y);
  return true;
}

export function drawDachshund(ctx, state, sprites, cosmetics, x, y) {
  if (sprites.dogSpritesReady) drawDachshundSprite(ctx, state, sprites, cosmetics, x, y);
}

function drawSquirrelSprite(ctx, sprites, x, y, flipHorizontal) {
  const frames = sprites.squirrelSprites.run;
  const frameIdx = sprites.squirrelSpriteFrame % (frames?.length || 1);
  const img = frames && frames[frameIdx];
  if (!img || !img.complete || !img.naturalWidth) return false;
  const sw = img.naturalWidth;
  const sh = img.naturalHeight;
  const dw = sw * SQUIRREL_SPRITE_SCALE;
  const dh = sh * SQUIRREL_SPRITE_SCALE;
  const anchorX = 10;  // center of procedural squirrel (spans x-12 to x+32)
  const dx = x + anchorX - dw / 2;
  const dy = y - dh + SQUIRREL_SPRITE_GROUND_OFFSET;
  if (flipHorizontal) {
    ctx.save();
    ctx.translate(dx + dw / 2, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(dx + dw / 2), 0);
    ctx.drawImage(img, 0, 0, sw, sh, dx, dy, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(img, 0, 0, sw, sh, dx, dy, dw, dh);
  }
  return true;
}

export function drawSquirrel(ctx, state, sprites, x, y, escaping, flipHorizontal) {
  if (sprites.squirrelSpritesReady && drawSquirrelSprite(ctx, sprites, x, y, flipHorizontal || false)) return;

  // Pixel-art squirrel inspired by Elthen/OpenGameArt: bushy tail, compact body, pointy ears.
  // escaping=true: horizontal running pose, tail streaming back.
  const frameCount = state.frameCount;
  const flip = flipHorizontal || false;
  if (flip) {
    ctx.save();
    ctx.translate(x + 10, 0);
    ctx.scale(-1, 1);
    ctx.translate(-(x + 10), 0);
  }
  const runCycle = escaping ? frameCount * 0.4 : frameCount * 0.25;
  const bounce = escaping ? 0 : Math.sin(runCycle) * 2;
  const sy = y - bounce;

  if (escaping) {
    // Fleeing pose: body stretched, tail whipped back, legs in run stride
    ctx.fillStyle = '#5C4435';
    ctx.beginPath();
    ctx.ellipse(x - 12, sy + 10, 12, 8, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6B5344';
    ctx.beginPath();
    ctx.ellipse(x - 14, sy + 12, 10, 6, 0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8B7355';
    ctx.beginPath();
    ctx.ellipse(x + 4, sy + 10, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7A6345';
    ctx.beginPath();
    ctx.ellipse(x + 2, sy + 11, 7, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8B7355';
    ctx.beginPath();
    ctx.arc(x + 20, sy + 7, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#7A6345';
    ctx.beginPath();
    ctx.moveTo(x + 24, sy + 2);
    ctx.lineTo(x + 28, sy - 4);
    ctx.lineTo(x + 26, sy + 3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 26, sy + 4);
    ctx.lineTo(x + 30, sy - 2);
    ctx.lineTo(x + 28, sy + 5);
    ctx.closePath();
    ctx.fill();

    const legOffset = Math.sin(runCycle) * 3;
    ctx.fillStyle = '#6B5344';
    ctx.fillRect(x + 6, sy + 14, 4, 6 + legOffset);
    ctx.fillRect(x + 14, sy + 14, 4, 6 - legOffset);

    ctx.fillStyle = '#222';
  } else {
    // Idle/teasing pose: upright, bushy tail
    ctx.fillStyle = '#6B5344';
    ctx.beginPath();
    ctx.ellipse(x - 8, sy + 8, 14, 10, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5C4435';
    ctx.beginPath();
    ctx.ellipse(x - 10, sy + 10, 10, 6, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8B7355';
    ctx.beginPath();
    ctx.ellipse(x + 8, sy + 10, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7A6345';
    ctx.beginPath();
    ctx.ellipse(x + 6, sy + 12, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#8B7355';
    ctx.beginPath();
    ctx.arc(x + 22, sy + 6, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#6B5344';
    ctx.beginPath();
    ctx.ellipse(x + 18, sy + 4, 4, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#7A6345';
    ctx.beginPath();
    ctx.moveTo(x + 26, sy);
    ctx.lineTo(x + 30, sy - 6);
    ctx.lineTo(x + 28, sy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 28, sy - 2);
    ctx.lineTo(x + 32, sy - 5);
    ctx.lineTo(x + 30, sy + 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#222';
  }

  ctx.beginPath();
  ctx.arc(x + (escaping ? 22 : 24), sy + (escaping ? 8 : 5), 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + (escaping ? 22.5 : 24.5), sy + (escaping ? 7.5 : 4.5), 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#5C3A1E';
  ctx.beginPath();
  ctx.arc(x + (escaping ? 26 : 28), sy + (escaping ? 9 : 7), 2.5, 0, Math.PI * 2);
  ctx.fill();
  if (flip) ctx.restore();
}
