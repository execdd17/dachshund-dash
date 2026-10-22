// Small shared canvas drawing helpers.

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.fill();
}

export function drawSparkle(ctx, cx, cy, size) {
  ctx.beginPath();
  ctx.moveTo(cx, cy - size);
  ctx.lineTo(cx + size * 0.3, cy - size * 0.3);
  ctx.lineTo(cx + size, cy);
  ctx.lineTo(cx + size * 0.3, cy + size * 0.3);
  ctx.lineTo(cx, cy + size);
  ctx.lineTo(cx - size * 0.3, cy + size * 0.3);
  ctx.lineTo(cx - size, cy);
  ctx.lineTo(cx - size * 0.3, cy - size * 0.3);
  ctx.closePath();
  ctx.fill();
}

// Scales the current transform about (px, py) — e.g. growing a sprite from
// its feet, or mirroring it with sx = -1. Callers own save()/restore().
export function scaleAbout(ctx, px, py, sx, sy = sx) {
  ctx.translate(px, py);
  ctx.scale(sx, sy);
  ctx.translate(-px, -py);
}

// Pixel-art heart bitmap: R = fill, W = highlight, . = transparent.
const HEART_PIXELS = [
  '.RR.RR.',
  'RWRRRRR',
  'RRRRRRR',
  '.RRRRR.',
  '..RRR..',
  '...R...',
];
const HEART_COLORS = { R: '#FF4D6D', W: '#FFD9E0' };
export const HEART_BITMAP_W = HEART_PIXELS[0].length;
export const HEART_BITMAP_H = HEART_PIXELS.length;

// The heart with its top-left at (x, y), `px` canvas px per bitmap pixel;
// unfilled draws the dim silhouette of a spent HUD heart.
export function drawPixelHeart(ctx, x, y, { px, filled = true }) {
  for (let row = 0; row < HEART_PIXELS.length; row++) {
    for (let col = 0; col < HEART_PIXELS[row].length; col++) {
      const ch = HEART_PIXELS[row][col];
      if (ch === '.') continue;
      ctx.fillStyle = filled ? HEART_COLORS[ch] : 'rgba(255,255,255,0.25)';
      ctx.fillRect(x + col * px, y + row * px, px, px);
    }
  }
}

// A cartoon bone centered on (cx, cy): a shaft with two knobs at each end.
const BONE_COLORS = { fill: '#FFF8E7', shade: '#E2D3B4', outline: '#4A3A2A' };
export function drawBone(ctx, cx, cy, len, thick, rotation = 0) {
  const r = thick * 0.42;
  const half = len / 2 - r;
  const shape = () => {
    ctx.beginPath();
    ctx.rect(-half, -thick * 0.22, half * 2, thick * 0.44);
    for (const sx of [-half, half]) {
      for (const sy of [-r * 0.8, r * 0.8]) {
        ctx.moveTo(sx + r, sy);
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
      }
    }
  };
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.lineWidth = 2;
  ctx.strokeStyle = BONE_COLORS.outline;
  shape();
  ctx.stroke();
  ctx.fillStyle = BONE_COLORS.fill;
  shape();
  ctx.fill();
  ctx.fillStyle = BONE_COLORS.shade;
  ctx.fillRect(-half, thick * 0.04, half * 2, thick * 0.18);
  ctx.restore();
}

// One frame of a centered popup label (+25, BONK!, NICE! +50…).
// An `outline` color strokes the text first so it reads against any sky.
export function drawPopupText(ctx, text, x, y, { color, size, alpha, outline }) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px Courier New`;
  ctx.textAlign = 'center';
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
  }
  ctx.fillText(text, x, y);
  ctx.restore();
}

// A repeatable pseudo-random value in [0, 1) for n: for details that must
// look random but stay put frame to frame.
export function hash01(n) {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}
