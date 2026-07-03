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
