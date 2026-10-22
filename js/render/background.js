// Procedurally drawn background: sky, sun/moon/stars, clouds, parallax
// hills/mountains, ground, decor (flowers and the like), rain. Colors follow
// the day/night cycle driven by getTimeOfDay(score); the scenery itself —
// colors, hill shapes, decor — comes from the current biome (biomes.js).

import { W, H, GROUND_Y } from '../config.js';
import { lerpColor } from '../core/color.js';
import { getTimeOfDay } from '../core/timeOfDay.js';
import { biomeAt } from './biomes.js';

// A [day, sunset, night, dawn] palette at `phase`: the stage it's in and how
// far toward the next.
function cycleStep(phase) {
  const p = phase * 4;
  return [Math.floor(p) % 4, p % 1];
}
const cycleColor = (palette, phase) => {
  const [i, t] = cycleStep(phase);
  return lerpColor(palette[i], palette[(i + 1) % 4], t);
};
const cycleNumber = (palette, phase) => {
  const [i, t] = cycleStep(phase);
  return palette[i] + (palette[(i + 1) % 4] - palette[i]) * t;
};

// The scenery for this frame: the biome blend plus the time of day.
function sceneryOf(state) {
  const { from, to, k } = biomeAt(state.score, state.biomeSkip);
  const { phase } = getTimeOfDay(state.score);
  const blending = from !== to && k > 0;
  return {
    from, to, k: blending ? k : 0, phase,
    // A palette picked from each biome by `pick`, at this time of day and blend.
    color: pick => {
      const c = cycleColor(pick(from), phase);
      return blending ? lerpColor(c, cycleColor(pick(to), phase), k) : c;
    },
    number: pick => {
      const n = cycleNumber(pick(from), phase);
      return blending ? n + (cycleNumber(pick(to), phase) - n) * k : n;
    },
  };
}

// extraTop: logical units of extended sky above world y=0 (app mode; see view.js)
export function drawSky(ctx, state, extraTop = 0) {
  const { color } = sceneryOf(state);
  const top = color(b => b.sky.top);
  const mid = color(b => b.sky.mid);
  const bottom = color(b => b.sky.bottom);
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
  const { color, number } = sceneryOf(state);
  let fillC = color(b => b.clouds.fill);
  let shadowC = color(b => b.clouds.shadow);
  let highlightAlpha = number(b => b.clouds.highlight);
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

// Hill layer n (far to near) as a filled path. In a handover it morphs from
// one biome's silhouette to the next's.
function drawHillLayer(ctx, state, n) {
  const { from, to, k, phase, color } = sceneryOf(state);
  const a = from.hills[n];
  const b = to.hills[n];
  const heightAt = (layer, x) => layer.baseY - layer.shape(x, state.groundOffset * layer.scroll, layer.amp, layer.freq);

  ctx.fillStyle = color(biome => biome.hills[n].fill);
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y + 20);
  const dx = k > 0 ? Math.min(a.step, b.step) : a.step;
  for (let x = 0; x <= W; x += dx) {
    const y = k > 0 ? heightAt(a, x) + (heightAt(b, x) - heightAt(a, x)) * k : heightAt(a, x);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(W, GROUND_Y + 20);
  ctx.closePath();
  ctx.fill();

  // A layer's own details on top (the autumn ridge's tree colors). In a
  // handover they fade with their biome.
  const layers = k > 0 ? [[a, 1 - k], [b, k]] : [[a, 1]];
  layers.forEach(([layer, weight]) => {
    if (!layer.details) return;
    ctx.globalAlpha = weight;
    layer.details(ctx, layer, state.groundOffset * layer.scroll, palette => cycleColor(palette, phase));
    ctx.globalAlpha = 1;
  });
}

export function drawFarHills(ctx, state) {
  drawHillLayer(ctx, state, 0);
}

export function drawNearHills(ctx, state) {
  drawHillLayer(ctx, state, 1);
  drawHillLayer(ctx, state, 2);
}

// Deep earth below the world's bottom edge, shown when a scene dips the camera
// (the tunnel's, at most TUNNEL_CAMERA_DROP): the same dark brown as the
// tunnel's bore, so the underground reads as one space.
export const DEEP_EARTH = '#3A2614';
const DEEP_EARTH_DEPTH = 40;

export function drawGround(ctx, state) {
  const { color } = sceneryOf(state);
  const groundOffset = state.groundOffset;

  const pathTopC = color(b => b.path.top);
  const pathBottomC = color(b => b.path.bottom);
  const pathTexC = color(b => b.path.texture);

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

  const grassTopC = color(b => b.grass.top);
  const grassMidC = color(b => b.grass.mid);
  const grassBottomC = color(b => b.grass.bottom);
  const grassBladeC = color(b => b.grass.blade);

  const grassGrad = ctx.createLinearGradient(0, GROUND_Y + 36, 0, H);
  grassGrad.addColorStop(0, grassTopC);
  grassGrad.addColorStop(0.4, grassMidC);
  grassGrad.addColorStop(1, grassBottomC);
  ctx.fillStyle = grassGrad;
  ctx.fillRect(0, GROUND_Y + 36, W, H - GROUND_Y - 36);
  ctx.fillStyle = DEEP_EARTH;
  ctx.fillRect(0, H, W, DEEP_EARTH_DEPTH);

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

// The biome's decor at each state.flowers spot; in a handover the old biome's
// fades out as the next one's fades in.
export function drawDecor(ctx, state) {
  const { from, to, k, phase } = sceneryOf(state);
  const layers = k > 0 ? [[from, 1 - k], [to, k]] : [[from, 1]];
  layers.forEach(([biome, weight]) => {
    const opacity = cycleNumber(biome.decor.opacity, phase) * weight;
    state.flowers.forEach(f => {
      const fx = (f.x - state.groundOffset * 0.8 % W + W) % W;
      ctx.globalAlpha = opacity;
      biome.decor.draw(ctx, f, fx, phase);
      ctx.globalAlpha = 1;
    });
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
