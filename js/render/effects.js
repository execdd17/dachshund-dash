// Transient visual effects: CHOMP!/BONK! popups, bird-jump bonus text,
// landing dust particles.

import { BIRD_JUMP_BONUS, TRAMP_BOUNCE_BONUS } from '../config.js';
import {
  drawFrisbee, drawBird, drawBirdSprite, drawChocolateBar, drawChocolateStack, drawAcorn, drawAcornPile,
} from './obstacles.js';

export function drawChompEffects(ctx, state, now = performance.now()) {
  state.giantChompEffects.forEach(e => {
    const age = (now - e.startTime) / 500;
    if (age > 1) return;
    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = '#FFD700';
    ctx.font = `bold ${14 + age * 8}px Courier New`;
    ctx.textAlign = 'center';
    ctx.fillText('CHOMP!', e.x + 18, e.y - 10 - age * 20);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + age * 2;
      const dist = age * 20;
      ctx.fillStyle = ['#D4951A', '#D94438', '#F5D000'][i % 3];
      ctx.beginPath();
      ctx.arc(e.x + 18 + Math.cos(angle) * dist, e.y + 11 + Math.sin(angle) * dist, 2 - age, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

// The knocked-away obstacle keeps its original look, mirroring the skin/type
// dispatch in drawObstacle (birds keep flapping: sprite frames keep advancing
// via the shared store, with the procedural bird as the loading fallback).
function drawBonkedObstacle(ctx, e, frameCount, sprites) {
  if (e.skin === 'chase') {
    if (e.type === 'frisbee' || e.type === 'bird') drawAcorn(ctx, e.x, e.y - 8, frameCount * 0.15);
    else if (e.type === 'stack') drawAcornPile(ctx, e.x, e.y);
    else drawAcorn(ctx, e.x, e.y);
  } else if (e.type === 'bird') {
    if (!drawBirdSprite(ctx, sprites, e)) drawBird(ctx, e.x, e.y, frameCount);
  } else if (e.type === 'stack') {
    drawChocolateStack(ctx, e.x, e.y, frameCount);
  } else if (e.type === 'hotdog') {
    drawChocolateBar(ctx, e.x, e.y);
  } else {
    drawFrisbee(ctx, e.x, e.y, frameCount);
  }
}

export function drawBonkEffects(ctx, state, sprites, now = performance.now()) {
  state.giantBonkEffects.forEach(e => {
    const age = (now - e.startTime) / 1500;
    if (age > 1) return;
    const cx = e.x + e.width / 2;
    const cy = e.y + e.height / 2;
    ctx.save();
    ctx.globalAlpha = 1 - age * 0.7;
    ctx.translate(cx, cy);
    ctx.rotate(e.rotation);
    ctx.translate(-cx, -cy);
    drawBonkedObstacle(ctx, e, state.frameCount, sprites);
    ctx.restore();
    if (age < 0.4) {
      ctx.save();
      ctx.globalAlpha = 1 - age / 0.4;
      ctx.fillStyle = '#FF69B4';
      ctx.font = `bold ${12 + age * 15}px Courier New`;
      ctx.textAlign = 'center';
      ctx.fillText('BONK!', cx, e.y - 15 - age * 30);
      ctx.restore();
    }
  });
}

export function drawBirdJumpEffects(ctx, state, now = performance.now()) {
  state.birdJumpEffects.forEach(e => {
    const age = (now - e.startTime) / 800;
    if (age > 1) return;
    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = '#3B7DD8';
    ctx.font = `bold ${12 + age * 6}px Courier New`;
    ctx.textAlign = 'center';
    ctx.fillText('NICE! +' + BIRD_JUMP_BONUS, e.x, e.y - 5 - age * 30);
    ctx.restore();
  });
}

export function drawTrampBounceEffects(ctx, state, now = performance.now()) {
  state.trampBounceEffects.forEach(e => {
    const age = (now - e.startTime) / 800;
    if (age > 1) return;
    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.fillStyle = '#7A4FBF';
    ctx.font = `bold ${12 + age * 6}px Courier New`;
    ctx.textAlign = 'center';
    ctx.fillText('BOING! +' + TRAMP_BOUNCE_BONUS, e.x, e.y - 5 - age * 30);
    ctx.restore();
  });
}

export function drawLandingParticles(ctx, state) {
  // Tiny rainbow dust burst on landing
  state.landingParticles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = `hsla(${p.hue}, 85%, 65%, 0.9)`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.5 + (1 - p.life) * 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}
