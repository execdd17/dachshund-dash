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

// One frame of a centered popup label (CHOMP!, BONK!, NICE! +50…).
export function drawPopupText(ctx, text, x, y, { color, size, alpha }) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px Courier New`;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
  ctx.restore();
}
