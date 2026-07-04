// Procedurally drawn background: sky, sun/moon/stars, clouds, parallax
// hills/mountains, ground, flowers, rain. All support the day/night
// color-lerp cycle driven by getTimeOfDay(score).

import { W, H, GROUND_Y } from '../config.js';
import { lerpColor } from '../core/color.js';
import { getTimeOfDay } from '../core/timeOfDay.js';

// --- Rolling hills / mountain parallax shape functions (pure) ---

// Smooth rolling hills (mid/near layers)
export function hillY(x, offset, amp, freq) {
  const v = x + offset;
  return amp * (
    Math.sin(v * freq) * 0.50 +
    Math.sin(v * freq * 2.1 + 1.3) * 0.30 +
    Math.sin(v * freq * 0.6 + 0.8) * 0.20
  );
}

// Mountain range (far layer) — layered abs(sin) with pow sharpening
export function mountainY(x, offset, amp, freq) {
  const v = x + offset;
  // Broad mountain masses
  const base = Math.abs(Math.sin(v * freq * 0.45 + 0.8)) * 0.25;
  // Main peaks — pow < 1 sharpens the tips
  const peaks = Math.pow(Math.abs(Math.sin(v * freq * 1.1)), 0.7) * 0.30;
  // Secondary ridges
  const ridges = Math.abs(Math.sin(v * freq * 2.3 + 1.5)) * 0.20;
  // Fine jagged detail
  const jag = Math.abs(Math.sin(v * freq * 4.7 + 3.2)) * 0.15;
  // Subtle craggy texture
  const crag = Math.abs(Math.sin(v * freq * 8.3 + 5.1)) * 0.10;
  return amp * (base + peaks + ridges + jag + crag);
}

// extraTop: logical units of extended sky above world y=0 (app mode; see view.js)
export function drawSky(ctx, state, extraTop = 0) {
  // Sky gradient colors per stage: [day, sunset, night, dawn] -> top, mid, bottom
  const skyTop = ['#4AB8E8', '#FF8C42', '#0D1B2A', '#6B4E71'];
  const skyMid = ['#87CEEB', '#FF6B6B', '#1B263B', '#9B8AA6'];
  const skyBottom = ['#B0E0F0', '#FFB88C', '#415A77', '#4AB8E8'];
  const { phase } = getTimeOfDay(state.score);
  const p = phase * 4;
  const i = Math.floor(p) % 4;
  const t = p % 1;
  const top = lerpColor(skyTop[i], skyTop[(i + 1) % 4], t);
  const mid = lerpColor(skyMid[i], skyMid[(i + 1) % 4], t);
  const bottom = lerpColor(skyBottom[i], skyBottom[(i + 1) % 4], t);
  const grad = ctx.createLinearGradient(0, -extraTop, 0, GROUND_Y + 20);
  grad.addColorStop(0, top);
  grad.addColorStop(0.7, mid);
  grad.addColorStop(1, bottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, -extraTop, W, extraTop + GROUND_Y + 20);

  // Overcast overlay when raining
  if (state.weatherRain) {
    const { stage } = getTimeOfDay(state.score);
    const overcastAlpha = stage === 'night' ? 0.15 : stage === 'sunset' ? 0.3 : 0.4;
    const overGrad = ctx.createLinearGradient(0, -extraTop, 0, GROUND_Y + 20);
    overGrad.addColorStop(0, `rgba(120, 125, 135, ${overcastAlpha})`);
    overGrad.addColorStop(0.6, `rgba(140, 145, 155, ${overcastAlpha * 0.8})`);
    overGrad.addColorStop(1, `rgba(160, 165, 170, ${overcastAlpha * 0.5})`);
    ctx.fillStyle = overGrad;
    ctx.fillRect(0, -extraTop, W, extraTop + GROUND_Y + 20);
  }
}

// The sun/moon/stars hug the top of the visible sky, so shift them up by
// extraTop when the sky is extended.
export function drawSun(ctx, state, extraTop = 0) {
  const sunX = 700;
  const skyShift = -extraTop;
  const { phase, stage, t } = getTimeOfDay(state.score);

  // Sun visible: day + sunset; hidden: night; fading in: dawn
  const rainDim = state.weatherRain ? 0.15 : 1;
  const sunOpacity = (phase < 0.5 ? 1 : phase < 0.75 ? 0 : t) * rainDim;
  const moonOpacity = phase < 0.5 ? 0 : phase < 0.75 ? 1 : 1 - t;

  // Sun Y: day=45, sunset=sinks to 65
  const sunY = skyShift + (phase < 0.25 ? 45 : phase < 0.5 ? 45 + (phase - 0.25) / 0.25 * 20 : 65);

  // Sun color: yellow (day) -> orange (sunset)
  const sunColor = phase < 0.25 ? '#FFD700' : phase < 0.5 ? lerpColor('#FFD700', '#FF8C00', (phase - 0.25) / 0.25) : '#FF8C00';

  // Stars (night/dawn only) — deterministic positions
  if (moonOpacity > 0.01) {
    const starPositions = [[120, 35], [280, 22], [420, 48], [550, 28], [650, 40], [180, 55], [340, 62], [480, 38]];
    starPositions.forEach(([sx, sy]) => {
      ctx.globalAlpha = moonOpacity * (0.6 + Math.sin(sx * 0.1 + state.frameCount * 0.02) * 0.4);
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(sx, sy + skyShift, 1.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // Moon (night/dawn)
  if (moonOpacity > 0.01) {
    const moonX = 700;
    const moonY = 50 + skyShift;
    const moonR = 12;
    ctx.globalAlpha = moonOpacity;
    ctx.fillStyle = '#E8E8E8';
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#D0D0D0';
    ctx.beginPath();
    ctx.arc(moonX - 3, moonY - 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(moonX + 4, moonY + 2, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Sun (day/sunset/dawn)
  if (sunOpacity > 0.01) {
    const drawY = phase >= 0.75 ? 45 + skyShift : sunY;
    const glow = ctx.createRadialGradient(sunX, drawY, 15, sunX, drawY, 50);
    glow.addColorStop(0, `rgba(255, 244, 130, ${0.4 * sunOpacity})`);
    glow.addColorStop(1, 'rgba(255, 244, 130, 0)');
    ctx.globalAlpha = sunOpacity;
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 50, drawY - 50, 100, 100);

    if (stage !== 'night') {
      ctx.save();
      ctx.translate(sunX, drawY);
      ctx.rotate(state.frameCount * 0.005);
      ctx.fillStyle = stage === 'sunset' ? '#FFB366' : '#FFE066';
      for (let i = 0; i < 8; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-2, 20, 4, 10);
      }
      ctx.restore();
    }

    ctx.fillStyle = sunColor;
    ctx.beginPath();
    ctx.arc(sunX, drawY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = stage === 'sunset' ? '#FFCC80' : '#FFF176';
    ctx.beginPath();
    ctx.arc(sunX - 4, drawY - 4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export function drawClouds(ctx, state, extraTop = 0) {
  const { phase } = getTimeOfDay(state.score);
  const p = phase * 4;
  const i = Math.floor(p) % 4;
  const t = p % 1;
  // Cloud colors: [day=white, sunset=pinkish, night=dark gray, dawn=lightening]
  const cloudFill = ['#FFFFFF', '#FFD4D4', '#3A3A4A', '#E8E8F0'];
  const cloudShadow = ['#B4DCF0', '#E8B4C0', '#2A2A35', '#B0B8D0'];
  let fillC = lerpColor(cloudFill[i], cloudFill[(i + 1) % 4], t);
  let shadowC = lerpColor(cloudShadow[i], cloudShadow[(i + 1) % 4], t);
  const highlightAlphas = [0.8, 0.6, 0.2, 0.5];
  let highlightAlpha = highlightAlphas[i] + (highlightAlphas[(i + 1) % 4] - highlightAlphas[i]) * t;
  if (state.weatherRain) {
    fillC = lerpColor(fillC, '#8A8E96', 0.6);
    shadowC = lerpColor(shadowC, '#6A6E76', 0.6);
    highlightAlpha *= 0.3;
  }

  state.clouds.forEach(c => {
    const s = c.size;
    // Spread cloud heights proportionally over the (possibly extended) sky:
    // world y=0 maps to the visible top, GROUND_Y stays put.
    const cy = c.y * (GROUND_Y + extraTop) / GROUND_Y - extraTop;
    ctx.fillStyle = shadowC + '80';
    ctx.beginPath();
    ctx.arc(c.x + 18 * s, cy + 6 * s, 14 * s, 0, Math.PI * 2);
    ctx.arc(c.x + 34 * s, cy + 4 * s, 10 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = fillC;
    ctx.beginPath();
    ctx.arc(c.x + 10 * s, cy, 10 * s, 0, Math.PI * 2);
    ctx.arc(c.x + 24 * s, cy - 6 * s, 14 * s, 0, Math.PI * 2);
    ctx.arc(c.x + 38 * s, cy - 2 * s, 10 * s, 0, Math.PI * 2);
    ctx.arc(c.x + 20 * s, cy + 2 * s, 12 * s, 0, Math.PI * 2);
    ctx.arc(c.x + 34 * s, cy + 2 * s, 8 * s, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255,255,255,${highlightAlpha})`;
    ctx.beginPath();
    ctx.arc(c.x + 22 * s, cy - 8 * s, 8 * s, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Draw a single hill/mountain layer as a filled path
function drawHillLayer(ctx, state, scrollRate, baseY, amp, freq, fillColors, shapeFn, step) {
  const { phase } = getTimeOfDay(state.score);
  const p = phase * 4;
  const idx = Math.floor(p) % 4;
  const t = p % 1;

  const fill = lerpColor(fillColors[idx], fillColors[(idx + 1) % 4], t);
  const offset = state.groundOffset * scrollRate;
  const yFn = shapeFn || hillY;
  const dx = step || 4;

  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 20);
  for (let x = 0; x <= W; x += dx) {
    const y = baseY - yFn(x, offset, amp, freq);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, GROUND_Y + 20);
  ctx.closePath();
  ctx.fill();
}

export function drawFarHills(ctx, state) {
  // Mountain range: jagged peaks, taller, slower, finer step for crisper ridgeline
  drawHillLayer(ctx, state, 0.06, GROUND_Y - 20, 50, 0.0028,
    ['#8090A8', '#B88878', '#161C28', '#686080'], mountainY, 2);
}

export function drawNearHills(ctx, state) {
  // Mid hills: medium undulations
  drawHillLayer(ctx, state, 0.20, GROUND_Y - 2, 20, 0.006,
    ['#7BA888', '#B08860', '#162420', '#688070']);
  // Near hills: smaller, fastest, most saturated
  drawHillLayer(ctx, state, 0.38, GROUND_Y + 4, 14, 0.010,
    ['#5D9E58', '#988050', '#1A2E1A', '#5A7858']);
}

export function drawGround(ctx, state) {
  const { phase } = getTimeOfDay(state.score);
  const p = phase * 4;
  const i = Math.floor(p) % 4;
  const t = p % 1;
  const groundOffset = state.groundOffset;

  // Path colors: [day=sandy, sunset=warm amber, night=dark brown, dawn=sandy]
  const pathTop = ['#E8D5A3', '#E8B870', '#5C4033', '#E8D5A3'];
  const pathBottom = ['#D4C08E', '#D4A055', '#3D2B1F', '#D4C08E'];
  const pathTex = ['#C9B57A', '#C9A055', '#4A3728', '#C9B57A'];
  const pathTopC = lerpColor(pathTop[i], pathTop[(i + 1) % 4], t);
  const pathBottomC = lerpColor(pathBottom[i], pathBottom[(i + 1) % 4], t);
  const pathTexC = lerpColor(pathTex[i], pathTex[(i + 1) % 4], t);

  const pathGrad = ctx.createLinearGradient(0, GROUND_Y + 16, 0, GROUND_Y + 34);
  pathGrad.addColorStop(0, pathTopC);
  pathGrad.addColorStop(1, pathBottomC);
  ctx.fillStyle = pathGrad;
  ctx.fillRect(0, GROUND_Y + 16, W, 20);

  ctx.fillStyle = pathTexC;
  for (let i = 0; i < W; i += 18) {
    const gx = (i - groundOffset % 18 + W) % W;
    ctx.fillRect(gx, GROUND_Y + 22, 4, 2);
    ctx.fillRect((gx + 9) % W, GROUND_Y + 28, 3, 2);
  }

  // Grass: [day=green, sunset=warm-tinted, night=very dark, dawn=returning]
  const grassTop = ['#5DBE3E', '#6B8E3E', '#1A2E1A', '#5DBE3E'];
  const grassMid = ['#4CAF30', '#5A7E30', '#152515', '#4CAF30'];
  const grassBottom = ['#3D8B28', '#4A6B28', '#0F1F0F', '#3D8B28'];
  const grassBlade = ['#6ECF4A', '#7A9F4A', '#2A3A2A', '#6ECF4A'];
  const grassTopC = lerpColor(grassTop[i], grassTop[(i + 1) % 4], t);
  const grassMidC = lerpColor(grassMid[i], grassMid[(i + 1) % 4], t);
  const grassBottomC = lerpColor(grassBottom[i], grassBottom[(i + 1) % 4], t);
  const grassBladeC = lerpColor(grassBlade[i], grassBlade[(i + 1) % 4], t);

  const grassGrad = ctx.createLinearGradient(0, GROUND_Y + 36, 0, H);
  grassGrad.addColorStop(0, grassTopC);
  grassGrad.addColorStop(0.4, grassMidC);
  grassGrad.addColorStop(1, grassBottomC);
  ctx.fillStyle = grassGrad;
  ctx.fillRect(0, GROUND_Y + 36, W, H - GROUND_Y - 36);

  ctx.fillStyle = grassBladeC;
  for (let i = 0; i < W; i += 6) {
    const gx = (i - groundOffset % 6 + W) % W;
    const h = 3 + Math.sin(gx * 0.5) * 2;
    ctx.fillRect(gx, GROUND_Y + 34 - h, 3, h + 3);
  }
  for (let i = 0; i < W; i += 8) {
    const gx = (i - groundOffset % 8 + W) % W;
    const h = 2 + Math.sin(gx * 0.7) * 2;
    ctx.fillRect(gx, GROUND_Y + 14 - h, 2, h + 3);
  }
}

export function drawFlowers(ctx, state) {
  const { phase } = getTimeOfDay(state.score);
  const p = phase * 4;
  const i = Math.floor(p) % 4;
  const t = p % 1;
  const flowerVis = [1, 0.9, 0.35, 0.7];
  const flowerOp = flowerVis[i] + (flowerVis[(i + 1) % 4] - flowerVis[i]) * t;

  state.flowers.forEach(f => {
    const fx = (f.x - state.groundOffset * 0.8 % W + W) % W;
    const s = f.size;

    ctx.globalAlpha = flowerOp;
    ctx.fillStyle = phase >= 0.5 && phase < 0.75 ? '#2A3A2A' : '#2E8B2E';
    ctx.fillRect(fx, f.baseY - f.size * 2, 2, f.size * 2 + 2);

    ctx.fillStyle = phase >= 0.5 && phase < 0.75 ? lerpColor(f.color, '#2A2A3A', 0.6) : f.color;
    ctx.fillRect(fx - s + 1, f.baseY - s * 3, s, s);
    ctx.fillRect(fx + 2, f.baseY - s * 3, s, s);
    ctx.fillRect(fx - s + 1, f.baseY - s * 1.5, s, s);
    ctx.fillRect(fx + 2, f.baseY - s * 1.5, s, s);

    ctx.fillStyle = phase >= 0.5 && phase < 0.75 ? '#4A4A40' : '#FFD700';
    ctx.fillRect(fx, f.baseY - s * 2.5 + 1, s - 1, s - 1);
    ctx.globalAlpha = 1;
  });
}

export function drawRain(ctx, state) {
  if (!state.weatherRain || state.rainDrops.length === 0) return;
  const { stage } = getTimeOfDay(state.score);
  const nightDim = (stage === 'night') ? 0.6 : 1;
  ctx.save();
  ctx.lineWidth = 1;
  state.rainDrops.forEach(d => {
    ctx.strokeStyle = `rgba(180, 210, 240, ${d.opacity * nightDim})`;
    ctx.beginPath();
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x - 1, d.y + d.length);
    ctx.stroke();
  });
  ctx.restore();
}
