// Obstacle rendering — all drawn with canvas primitives, no image assets.
// drawObstacle() dispatches on obstacle type/skin; individual draw functions
// take (ctx, x, y, ...) so they stay independently testable/reusable.

import { GROUND_Y } from '../config.js';
import { roundRect, drawSparkle } from './primitives.js';

export function drawHotDog(ctx, x, y) {
  const hw = 36;
  const hh = 22;
  const mid = hh / 2;

  // --- Dark outline (drawn first, slightly larger) ---
  ctx.strokeStyle = '#5C3A1E';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Outline: full bun silhouette
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 1);
  ctx.quadraticCurveTo(x + hw / 2, y - 1, x + hw - 10, y + 1);
  ctx.quadraticCurveTo(x + hw - 4, y + 1, x + hw - 2, y + 5);
  ctx.quadraticCurveTo(x + hw + 1, y + mid, x + hw + 1, y + mid + 4);
  ctx.quadraticCurveTo(x + hw + 1, y + hh + 1, x + hw - 7, y + hh + 1);
  ctx.lineTo(x + 7, y + hh + 1);
  ctx.quadraticCurveTo(x - 1, y + hh + 1, x - 1, y + mid + 4);
  ctx.quadraticCurveTo(x - 1, y + mid, x + 2, y + 5);
  ctx.quadraticCurveTo(x + 4, y + 1, x + 10, y + 1);
  ctx.stroke();

  // --- Bun bottom half ---
  ctx.fillStyle = '#D4951A';
  ctx.beginPath();
  ctx.moveTo(x + 5, y + mid + 1);
  ctx.lineTo(x + hw - 5, y + mid + 1);
  ctx.quadraticCurveTo(x + hw, y + mid + 1, x + hw, y + mid + 4);
  ctx.quadraticCurveTo(x + hw, y + hh, x + hw - 7, y + hh);
  ctx.lineTo(x + 7, y + hh);
  ctx.quadraticCurveTo(x, y + hh, x, y + mid + 4);
  ctx.quadraticCurveTo(x, y + mid + 1, x + 5, y + mid + 1);
  ctx.fill();

  // Bottom bun shadow
  ctx.fillStyle = '#B8800F';
  ctx.beginPath();
  ctx.moveTo(x + 7, y + hh - 3);
  ctx.quadraticCurveTo(x + hw / 2, y + hh, x + hw - 7, y + hh - 3);
  ctx.lineTo(x + hw - 7, y + hh);
  ctx.quadraticCurveTo(x + hw / 2, y + hh + 1, x + 7, y + hh);
  ctx.closePath();
  ctx.fill();

  // --- Sausage (pokes out both ends!) ---
  ctx.fillStyle = '#D94438';
  roundRect(ctx, x - 4, y + 6, hw + 8, 12, 6);

  // Sausage highlight (shiny top)
  ctx.fillStyle = '#EF6B5E';
  ctx.beginPath();
  ctx.ellipse(x + hw / 2, y + 9, hw / 2 - 2, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sausage dark ends
  ctx.fillStyle = '#A42A1C';
  ctx.beginPath();
  ctx.arc(x - 2, y + 12, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + hw + 2, y + 12, 5, 0, Math.PI * 2);
  ctx.fill();

  // Sausage end highlights
  ctx.fillStyle = '#D94438';
  ctx.beginPath();
  ctx.arc(x - 1, y + 11, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + hw + 3, y + 11, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // --- Bun top half ---
  ctx.fillStyle = '#DBA328';
  ctx.beginPath();
  ctx.moveTo(x + 5, y + mid + 1);
  ctx.lineTo(x + hw - 5, y + mid + 1);
  ctx.quadraticCurveTo(x + hw - 2, y + mid, x + hw - 3, y + 5);
  ctx.quadraticCurveTo(x + hw - 5, y + 1, x + hw - 9, y + 1);
  ctx.lineTo(x + 9, y + 1);
  ctx.quadraticCurveTo(x + 5, y + 1, x + 3, y + 5);
  ctx.quadraticCurveTo(x + 2, y + mid, x + 5, y + mid + 1);
  ctx.fill();

  // Bun top crust highlight
  ctx.fillStyle = '#EDBE45';
  ctx.beginPath();
  ctx.moveTo(x + 11, y + 3);
  ctx.quadraticCurveTo(x + hw / 2, y, x + hw - 11, y + 3);
  ctx.lineTo(x + hw - 11, y + 6);
  ctx.quadraticCurveTo(x + hw / 2, y + 3, x + 11, y + 6);
  ctx.closePath();
  ctx.fill();

  // --- Bun seam (dark line where bun splits open) ---
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x + 3, y + mid);
  ctx.quadraticCurveTo(x + hw / 2, y + mid - 1, x + hw - 3, y + mid);
  ctx.stroke();

  // --- Sesame seeds on top ---
  ctx.fillStyle = '#FFF5D6';
  const seeds = [[x + 9, y + 4], [x + 16, y + 2.5], [x + 24, y + 3.5], [x + hw - 9, y + 4.5]];
  seeds.forEach(([sx, sy]) => {
    ctx.beginPath();
    ctx.ellipse(sx, sy, 2, 1, 0.3, 0, Math.PI * 2);
    ctx.fill();
  });

  // --- Mustard zigzag ---
  ctx.strokeStyle = '#F5D000';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 5, y + mid);
  for (let i = 0; i < 7; i++) {
    ctx.lineTo(x + 7 + i * 4, y + (i % 2 === 0 ? mid - 3 : mid + 3));
  }
  ctx.stroke();

  // --- Ketchup drizzle ---
  ctx.strokeStyle = '#E8392E';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 8, y + mid + 1);
  for (let i = 0; i < 6; i++) {
    ctx.lineTo(x + 10 + i * 4, y + (i % 2 === 0 ? mid + 4 : mid - 1));
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
}

export function drawGoldenHotDog(ctx, x, y, frameCount) {
  const hw = 36;
  const hh = 22;
  const mid = hh / 2;
  const shimmer = 0.5 + 0.5 * Math.sin(frameCount * 0.1);

  // Outer glow
  ctx.save();
  ctx.globalAlpha = 0.3 + shimmer * 0.3;
  ctx.shadowColor = '#FFD700';
  ctx.shadowBlur = 8 + shimmer * 6;

  // --- Dark outline ---
  ctx.strokeStyle = '#8B6914';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 10, y + 1);
  ctx.quadraticCurveTo(x + hw / 2, y - 1, x + hw - 10, y + 1);
  ctx.quadraticCurveTo(x + hw - 4, y + 1, x + hw - 2, y + 5);
  ctx.quadraticCurveTo(x + hw + 1, y + mid, x + hw + 1, y + mid + 4);
  ctx.quadraticCurveTo(x + hw + 1, y + hh + 1, x + hw - 7, y + hh + 1);
  ctx.lineTo(x + 7, y + hh + 1);
  ctx.quadraticCurveTo(x - 1, y + hh + 1, x - 1, y + mid + 4);
  ctx.quadraticCurveTo(x - 1, y + mid, x + 2, y + 5);
  ctx.quadraticCurveTo(x + 4, y + 1, x + 10, y + 1);
  ctx.stroke();

  // --- Bun bottom (golden) ---
  ctx.fillStyle = '#FFC107';
  ctx.beginPath();
  ctx.moveTo(x + 5, y + mid + 1);
  ctx.lineTo(x + hw - 5, y + mid + 1);
  ctx.quadraticCurveTo(x + hw, y + mid + 1, x + hw, y + mid + 4);
  ctx.quadraticCurveTo(x + hw, y + hh, x + hw - 7, y + hh);
  ctx.lineTo(x + 7, y + hh);
  ctx.quadraticCurveTo(x, y + hh, x, y + mid + 4);
  ctx.quadraticCurveTo(x, y + mid + 1, x + 5, y + mid + 1);
  ctx.fill();

  // --- Sausage (golden amber) ---
  ctx.fillStyle = '#FFB300';
  roundRect(ctx, x - 4, y + 6, hw + 8, 12, 6);
  ctx.fillStyle = '#FFD54F';
  ctx.beginPath();
  ctx.ellipse(x + hw / 2, y + 9, hw / 2 - 2, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FF8F00';
  ctx.beginPath();
  ctx.arc(x - 2, y + 12, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + hw + 2, y + 12, 5, 0, Math.PI * 2);
  ctx.fill();

  // --- Bun top (golden) ---
  ctx.fillStyle = '#FFD700';
  ctx.beginPath();
  ctx.moveTo(x + 5, y + mid + 1);
  ctx.lineTo(x + hw - 5, y + mid + 1);
  ctx.quadraticCurveTo(x + hw - 2, y + mid, x + hw - 3, y + 5);
  ctx.quadraticCurveTo(x + hw - 5, y + 1, x + hw - 9, y + 1);
  ctx.lineTo(x + 9, y + 1);
  ctx.quadraticCurveTo(x + 5, y + 1, x + 3, y + 5);
  ctx.quadraticCurveTo(x + 2, y + mid, x + 5, y + mid + 1);
  ctx.fill();

  // Bun highlight
  ctx.fillStyle = '#FFEA70';
  ctx.beginPath();
  ctx.moveTo(x + 11, y + 3);
  ctx.quadraticCurveTo(x + hw / 2, y, x + hw - 11, y + 3);
  ctx.lineTo(x + hw - 11, y + 6);
  ctx.quadraticCurveTo(x + hw / 2, y + 3, x + 11, y + 6);
  ctx.closePath();
  ctx.fill();

  // Seam
  ctx.strokeStyle = '#B8860B';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x + 3, y + mid);
  ctx.quadraticCurveTo(x + hw / 2, y + mid - 1, x + hw - 3, y + mid);
  ctx.stroke();

  ctx.restore(); // restore glow state

  // --- Sparkle particles orbiting ---
  for (let i = 0; i < 3; i++) {
    const angle = frameCount * 0.05 + i * (Math.PI * 2 / 3);
    const sparkX = x + hw / 2 + Math.cos(angle) * (hw / 2 + 8);
    const sparkY = y + mid + Math.sin(angle) * (hh / 2 + 6);
    ctx.fillStyle = `rgba(255, 215, 0, ${0.5 + shimmer * 0.5})`;
    drawSparkle(ctx, sparkX, sparkY, 3 + shimmer * 2);
  }

  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
}

export function drawHotDogStack(ctx, x, y, frameCount) {
  // Two hot dogs stacked on the ground — wobbly pile look
  const offsets = [
    { dx: 2, dy: 20 },
    { dx: -2, dy: 0 },
  ];
  for (const off of offsets) {
    drawHotDog(ctx, x + off.dx, y + off.dy);
  }
  // Exclamation mark warning above the stack
  const wobble = Math.sin(frameCount * 0.15) * 2;
  ctx.fillStyle = '#FF1493';
  ctx.font = 'bold 14px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('!', x + 18, y - 8 + wobble);
}

// ============ Chocolate: Classic Segmented Bar ============
export function drawChocolateBar(ctx, x, y) {
  const hw = 36, hh = 22;

  // --- Dark outline (drawn first, slightly larger) ---
  ctx.strokeStyle = '#2A1206';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 3, y + 1);
  ctx.lineTo(x + hw - 3, y + 1);
  ctx.quadraticCurveTo(x + hw + 1, y + 1, x + hw + 1, y + 4);
  ctx.lineTo(x + hw + 1, y + hh - 3);
  ctx.quadraticCurveTo(x + hw + 1, y + hh + 1, x + hw - 3, y + hh + 1);
  ctx.lineTo(x + 3, y + hh + 1);
  ctx.quadraticCurveTo(x - 1, y + hh + 1, x - 1, y + hh - 3);
  ctx.lineTo(x - 1, y + 4);
  ctx.quadraticCurveTo(x - 1, y + 1, x + 3, y + 1);
  ctx.stroke();

  // --- Main chocolate body ---
  ctx.fillStyle = '#6B3A20';
  roundRect(ctx, x + 1, y + 2, hw - 2, hh - 3, 2);

  // --- Bottom shadow ---
  ctx.fillStyle = '#4A2510';
  roundRect(ctx, x + 2, y + hh - 6, hw - 4, 4, 1);

  // --- Top highlight band ---
  ctx.fillStyle = '#8B5A3A';
  roundRect(ctx, x + 2, y + 3, hw - 4, 5, 1);

  // --- Score lines (3 columns x 2 rows) ---
  ctx.strokeStyle = '#4A2510';
  ctx.lineWidth = 0.8;
  for (let i = 1; i < 3; i++) {
    ctx.beginPath();
    ctx.moveTo(x + 1 + i * 11.3, y + 3);
    ctx.lineTo(x + 1 + i * 11.3, y + hh - 3);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(x + 2, y + hh / 2 + 1);
  ctx.lineTo(x + hw - 2, y + hh / 2 + 1);
  ctx.stroke();

  // --- Bite mark (top-right corner) ---
  ctx.fillStyle = '#3B1E0E';
  ctx.beginPath();
  ctx.moveTo(x + hw - 2, y + 2);
  ctx.lineTo(x + hw - 2, y + 7);
  ctx.quadraticCurveTo(x + hw - 5, y + 6, x + hw - 8, y + 8);
  ctx.quadraticCurveTo(x + hw - 6, y + 4, x + hw - 8, y + 2);
  ctx.closePath();
  ctx.fill();
  // Bite edge
  ctx.strokeStyle = '#2A1206';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + hw - 8, y + 2);
  ctx.quadraticCurveTo(x + hw - 6, y + 4, x + hw - 8, y + 8);
  ctx.stroke();
  // Crumbs
  ctx.fillStyle = '#6B3A20';
  ctx.beginPath();
  ctx.arc(x + hw + 2, y + 5, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + hw - 1, y + 9, 0.8, 0, Math.PI * 2);
  ctx.fill();

  // --- Glossy shine (upper-left) ---
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.beginPath();
  ctx.ellipse(x + 10, y + 6, 7, 2.5, -0.15, 0, Math.PI * 2);
  ctx.fill();

  // --- "HERSHEY" label ---
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 8px Arial Black, Arial';
  ctx.textAlign = 'center';
  ctx.fillText('HERSHEY', x + hw / 2, y + hh / 2 + 3, hw - 6);

  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
}

export function drawChocolateStack(ctx, x, y, frameCount) {
  const offsets = [{ dx: 2, dy: 20 }, { dx: -2, dy: 0 }];
  offsets.forEach(o => drawChocolateBar(ctx, x + o.dx, y + o.dy));
  const wobble = Math.sin(frameCount * 0.15) * 2;
  ctx.fillStyle = '#FF1493';
  ctx.font = 'bold 14px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('!', x + 18, y - 8 + wobble);
}

export function drawFrisbee(ctx, x, y, frameCount) {
  const fw = 44;
  const fh = 14;
  const spin = frameCount * 0.15;
  const cx = x + fw / 2;
  const cy = y + fh / 2;

  // Shadow on ground (drawn before wobble)
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.ellipse(cx, GROUND_Y + 26, fw / 2 + 2, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Very subtle x-axis wobble
  const wobble = 0.04 * Math.sin(spin * 1.3);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(wobble);

  // Outer rim
  ctx.fillStyle = '#FF1493';
  ctx.beginPath();
  ctx.ellipse(0, 0, fw / 2, fh / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Inner disc
  ctx.fillStyle = '#FF69B4';
  ctx.beginPath();
  ctx.ellipse(0, 0, fw / 2 - 6, fh / 2 - 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // White ring
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, fw / 2 - 4, fh / 2 - 2, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Spin lines
  ctx.strokeStyle = '#D1006E';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const angle = spin + i * Math.PI / 2;
    const rx = fw / 2 - 4;
    const ry = fh / 2 - 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * rx * 0.3, Math.sin(angle) * ry * 0.3);
    ctx.lineTo(Math.cos(angle) * rx * 0.7, Math.sin(angle) * ry * 0.7);
    ctx.stroke();
  }

  // Highlight
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.ellipse(-6, -3, 8, 3, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawBird(ctx, ox, oy, frameCount) {
  const bw = 44, bh = 34;
  const sc = 1.5;

  // --- Ground shadow (world coordinates, before transform) ---
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.beginPath();
  ctx.ellipse(ox + bw * sc / 2, GROUND_Y + 26, 16 * sc, 4 * sc, 0, 0, Math.PI * 2);
  ctx.fill();

  // Scale up from bottom edge so the base height stays the same
  ctx.save();
  ctx.translate(ox, oy + bh * sc);
  ctx.scale(sc, sc);
  ctx.translate(0, -bh);

  // All drawing now in original 44x34 local space
  const x = 0, y = 0;
  const cx = x + 24;
  const cy = y + 16;
  const wingFlap = Math.sin(frameCount * 0.2) * 7;

  // --- Tail feathers (behind body) ---
  ctx.fillStyle = '#1A4A8A';
  ctx.beginPath();
  ctx.moveTo(cx + 10, cy - 1);
  ctx.lineTo(x + bw + 2, cy - 7);
  ctx.lineTo(x + bw + 1, cy - 3);
  ctx.lineTo(x + bw - 1, cy + 1);
  ctx.lineTo(cx + 8, cy + 2);
  ctx.closePath();
  ctx.fill();
  // Tail outline
  ctx.strokeStyle = '#0E2E5C';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx + 10, cy - 1);
  ctx.lineTo(x + bw + 2, cy - 7);
  ctx.lineTo(x + bw - 1, cy + 1);
  ctx.stroke();

  // --- Body (round oval) ---
  ctx.fillStyle = '#3B7DD8';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 14, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body outline
  ctx.strokeStyle = '#1A3A6A';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(cx, cy, 14, 10, 0, 0, Math.PI * 2);
  ctx.stroke();

  // --- Belly (cream underside) ---
  ctx.fillStyle = '#EBE3D3';
  ctx.beginPath();
  ctx.ellipse(cx - 2, cy + 3, 9, 5, -0.1, 0, Math.PI * 2);
  ctx.fill();

  // --- Wing (animated flap) ---
  ctx.fillStyle = '#2A5FA0';
  ctx.beginPath();
  ctx.moveTo(cx - 2, cy - 5);
  ctx.quadraticCurveTo(cx + 6, cy - 16 + wingFlap, cx + 16, cy - 10 + wingFlap);
  ctx.quadraticCurveTo(cx + 12, cy - 4, cx + 4, cy - 1);
  ctx.closePath();
  ctx.fill();
  // Wing outline
  ctx.strokeStyle = '#1A3A6A';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 2, cy - 5);
  ctx.quadraticCurveTo(cx + 6, cy - 16 + wingFlap, cx + 16, cy - 10 + wingFlap);
  ctx.stroke();
  // Wing feather lines
  ctx.strokeStyle = '#1A4A8A';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(cx + 2, cy - 4);
  ctx.quadraticCurveTo(cx + 8, cy - 12 + wingFlap, cx + 13, cy - 9 + wingFlap);
  ctx.stroke();

  // --- Head ---
  ctx.fillStyle = '#3B7DD8';
  ctx.beginPath();
  ctx.arc(x + 10, cy - 4, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1A3A6A';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x + 10, cy - 4, 8, 0, Math.PI * 2);
  ctx.stroke();

  // --- Eye ---
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x + 8, cy - 5, 3, 0, Math.PI * 2);
  ctx.fill();
  // Pupil
  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(x + 7, cy - 5, 1.8, 0, Math.PI * 2);
  ctx.fill();
  // Glint
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(x + 7.5, cy - 6, 0.7, 0, Math.PI * 2);
  ctx.fill();

  // --- Beak ---
  ctx.fillStyle = '#E8A830';
  ctx.beginPath();
  ctx.moveTo(x + 3, cy - 5);
  ctx.lineTo(x - 2, cy - 3);
  ctx.lineTo(x + 3, cy - 1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#B87A10';
  ctx.lineWidth = 0.8;
  ctx.stroke();

  // --- Feet (dangling below body) ---
  ctx.strokeStyle = '#E8A830';
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 5, cy + 9);
  ctx.lineTo(cx - 6, cy + 16);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy + 16);
  ctx.lineTo(cx - 4, cy + 16);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + 1, cy + 9);
  ctx.lineTo(cx, cy + 16);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - 2, cy + 16);
  ctx.lineTo(cx + 2, cy + 16);
  ctx.stroke();

  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.restore();
}

export function drawAcorn(ctx, x, y, rotation) {
  // Teardrop acorn: brown nut, tan cap. Fits ~36x22 like hot dog.
  // rotation: optional radians for spinning (e.g. duck-under acorn)
  const hw = 36;
  const hh = 22;

  if (rotation !== undefined) {
    const cx = x + hw / 2;
    const cy = y + hh / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.translate(-cx, -cy);
  }

  // --- Dark outline (drawn first, slightly larger) ---
  ctx.strokeStyle = '#2A1A0A';
  ctx.lineWidth = 1.5;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  // Outline: nut body
  ctx.beginPath();
  ctx.ellipse(x + hw / 2, y + hh / 2 + 2, 12, 10, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Outline: cap
  ctx.beginPath();
  ctx.ellipse(x + hw / 2, y + 6, 14, 8, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Outline: stem
  ctx.strokeRect(x + hw / 2 - 1.5, y + 0.5, 3, 4.5);

  // --- Nut body (brown oval) ---
  ctx.fillStyle = '#6B4423';
  ctx.beginPath();
  ctx.ellipse(x + hw / 2, y + hh / 2 + 2, 12, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#8B5A2B';
  ctx.beginPath();
  ctx.ellipse(x + hw / 2 - 2, y + hh / 2, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Cap (tan) ---
  ctx.fillStyle = '#A67C52';
  ctx.beginPath();
  ctx.ellipse(x + hw / 2, y + 6, 14, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#D4A574';
  ctx.beginPath();
  ctx.ellipse(x + hw / 2 - 2, y + 5, 10, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Stem ---
  ctx.fillStyle = '#5D4037';
  ctx.fillRect(x + hw / 2 - 1, y + 1, 2, 4);

  if (rotation !== undefined) ctx.restore();
}

export function drawAcornPile(ctx, x, y) {
  // 2-3 acorns stacked, same footprint as hot dog stack
  drawAcorn(ctx, x + 4, y + 22);
  drawAcorn(ctx, x, y + 10);
  drawAcorn(ctx, x + 8, y + 4);
}

// Trampoline island: splayed legs, red-padded frame bar, blue membrane with
// a constant idle wobble so it reads as bouncy on first sight.
export function drawTrampoline(ctx, x, y, width, frameCount, squashed) {
  const barY = y + 2;          // frame bar center
  const legTop = y + 4;
  const legBottom = GROUND_Y + 24;  // feet on the visual ground line

  // --- Legs (two splayed dark legs) ---
  ctx.strokeStyle = '#3A3A3A';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 10, legTop);
  ctx.lineTo(x + 4, legBottom);
  ctx.moveTo(x + width - 10, legTop);
  ctx.lineTo(x + width - 4, legBottom);
  ctx.stroke();

  // --- Membrane (sags visibly below the frame bar; the constant wobble is
  // the primary "this is bouncy" telegraph) ---
  const idleDip = 3 + Math.sin(frameCount * 0.15) * 1.5;
  const dip = squashed ? 9 : idleDip;
  ctx.fillStyle = '#2E5FB7';
  ctx.beginPath();
  ctx.moveTo(x + 4, barY);
  ctx.quadraticCurveTo(x + width / 2, barY + dip + 4, x + width - 4, barY);
  ctx.lineTo(x + width - 4, barY + 4);
  ctx.quadraticCurveTo(x + width / 2, barY + dip + 9, x + 4, barY + 4);
  ctx.closePath();
  ctx.fill();
  // Sheen line on the membrane
  ctx.strokeStyle = '#6E9BE0';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x + 8, barY + 3);
  ctx.quadraticCurveTo(x + width / 2, barY + dip + 6, x + width - 8, barY + 3);
  ctx.stroke();

  // --- Frame bar with red safety pads ---
  ctx.strokeStyle = '#2A2A2A';
  ctx.lineWidth = 2;
  ctx.strokeRect(x, barY - 3, width, 6);
  ctx.fillStyle = '#D94438';
  ctx.fillRect(x, barY - 3, width, 6);
  // Pad segment lines
  ctx.strokeStyle = '#A42A1C';
  ctx.lineWidth = 1;
  for (let px = x + 12; px < x + width - 6; px += 12) {
    ctx.beginPath();
    ctx.moveTo(px, barY - 3);
    ctx.lineTo(px, barY + 3);
    ctx.stroke();
  }
}

// One 32px bramble tile, modeled on the classic platformer bramble look:
// fat coiling vine canes (dark edge + green body + pale highlight stripe)
// with big ivory spikes jutting off them, plus a berry accent. Deterministic
// per-tile variation via seed — no per-frame randomness (tiles must not
// shimmer).
export function drawThorns(ctx, x, y, seed = 0) {
  // Cheap deterministic hash → repeatable pseudo-randoms per tile
  let h = (Math.floor(seed) * 2654435761) >>> 0;
  const rand = () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return h / 4294967296;
  };

  // Three-pass thick stroke so the cane reads as a fat vine, not a wire:
  // dark silhouette, green body, thin pale highlight down the middle.
  const strokeVine = (buildPath, w) => {
    ctx.lineCap = 'round';
    const passes = [['#1E3A12', w], ['#3E6B22', w - 2.6], ['#6E9E3C', 1.7]];
    for (const [color, width] of passes) {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      buildPath();
      ctx.stroke();
    }
  };

  // Spikes are queued and drawn last so they sit on top of every cane.
  const spikes = [];

  // Canes root at staggered depths across the whole dirt-path band
  // (GROUND_Y+16 → +36), same as the scenery flowers, so the brambles read
  // as growing out of the path instead of hovering at its top edge.
  const baseY = y + 30;

  // --- Arching canes ---
  for (let s = 0; s < 2; s++) {
    const x0 = x - 2 + rand() * 8;
    const x1 = x + 24 + rand() * 10;
    const peak = y + 1 + rand() * 6;
    const cpX = x + 8 + rand() * 16;
    const stemBase = baseY + s * 4 + rand() * 5;  // deeper with each cane

    strokeVine(() => {
      ctx.moveTo(x0, stemBase);
      ctx.quadraticCurveTo(cpX, peak, x1, stemBase);
    }, 6.5);

    // Spikes along the arc, oriented outward along the curve normal
    for (let t = 0; t < 3; t++) {
      const u = 0.15 + t * 0.3 + rand() * 0.12;
      const qx = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cpX + u * u * x1;
      const qy = (1 - u) * (1 - u) * stemBase + 2 * (1 - u) * u * peak + u * u * stemBase;
      const tx = 2 * (1 - u) * (cpX - x0) + 2 * u * (x1 - cpX);
      const ty = 2 * (1 - u) * (peak - stemBase) + 2 * u * (stemBase - peak);
      let normal = Math.atan2(ty, tx) - Math.PI / 2;
      // Bias upward/outward so spikes don't bury into the dirt
      if (Math.sin(normal) > 0.25) normal += Math.PI;
      spikes.push([qx + Math.cos(normal) * 2, qy + Math.sin(normal) * 2, normal, 6 + rand() * 2]);
    }
  }

  // --- Coiled loops: the signature bramble spirals ---
  const coils = 1 + Math.floor(rand() * 2);
  for (let l = 0; l < coils; l++) {
    const lx = x + 9 + rand() * 14;
    const ly = y + 10 + rand() * 9;
    const r = 5 + rand() * 2.5;

    strokeVine(() => ctx.arc(lx, ly, r, 0, Math.PI * 2), 5.5);
    // Inner curl so the loop reads as a spiral, not a donut
    ctx.strokeStyle = '#1E3A12';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(lx + r * 0.15, ly, r * 0.4, Math.PI * 0.3, Math.PI * 1.5);
    ctx.stroke();

    // Spikes radiating outward from the coil rim
    const spikeCount = 3 + Math.floor(rand() * 2);
    const a0 = rand() * Math.PI * 2;
    for (let t = 0; t < spikeCount; t++) {
      const a = a0 + t * (Math.PI * 2 / spikeCount) + rand() * 0.5;
      spikes.push([lx + Math.cos(a) * r, ly + Math.sin(a) * r, a, 5.5 + rand() * 2]);
    }
  }

  // --- Spikes: chunky ivory triangles with a dark edge ---
  for (const [px, py, angle, len] of spikes) {
    const bw = len * 0.42;
    const bx = Math.cos(angle + Math.PI / 2) * bw;
    const by = Math.sin(angle + Math.PI / 2) * bw;
    ctx.beginPath();
    ctx.moveTo(px - bx, py - by);
    ctx.lineTo(px + bx, py + by);
    ctx.lineTo(px + Math.cos(angle) * len, py + Math.sin(angle) * len);
    ctx.closePath();
    ctx.fillStyle = '#EDE6C4';
    ctx.fill();
    ctx.strokeStyle = '#1E3A12';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Berry accents tucked into the tangle
  const berries = 1 + Math.floor(rand() * 2);
  for (let b = 0; b < berries; b++) {
    ctx.fillStyle = '#C9312B';
    ctx.beginPath();
    ctx.arc(x + 5 + rand() * 22, y + 8 + rand() * 20, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.lineCap = 'butt';
}

// Dispatch a single obstacle to its draw function, honoring the chase skin
// (acorns) and giant mode (chocolate bars become edible hot dogs).
export function drawObstacle(ctx, state, o) {
  if (o.type === 'golden') {
    drawGoldenHotDog(ctx, o.x, o.y, state.frameCount);
    return;
  }
  if (o.type === 'trampoline') {
    drawTrampoline(ctx, o.x, o.y, o.width, state.frameCount, performance.now() < (o.squashUntil ?? 0));
    return;
  }
  if (o.type === 'thorns') {
    drawThorns(ctx, o.x, o.y, o.seed ?? 0);
    return;
  }
  const useChaseSkin = (o.skin ?? (state.chaseActive ? 'chase' : 'normal')) === 'chase';
  if (useChaseSkin) {
    if (o.type === 'frisbee' || o.type === 'bird') drawAcorn(ctx, o.x, o.y - 8, state.frameCount * 0.15);
    else if (o.type === 'stack') drawAcornPile(ctx, o.x, o.y);
    else drawAcorn(ctx, o.x, o.y);
  } else if (o.type === 'bird') {
    drawBird(ctx, o.x, o.y, state.frameCount);
  } else if (o.type === 'frisbee') {
    drawFrisbee(ctx, o.x, o.y, state.frameCount);
  } else if (state.giantActive || state.giantGrowing) {
    if (o.type === 'stack') drawHotDogStack(ctx, o.x, o.y, state.frameCount);
    else drawHotDog(ctx, o.x, o.y);
  } else {
    if (o.type === 'stack') drawChocolateStack(ctx, o.x, o.y, state.frameCount);
    else drawChocolateBar(ctx, o.x, o.y);
  }
}
