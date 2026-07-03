// Transient visual effects: CHOMP!/BONK! popups, bird-jump bonus text,
// landing dust particles.

import { BIRD_JUMP_BONUS } from '../config.js';
import { drawFrisbee } from './obstacles.js';

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

export function drawBonkEffects(ctx, state, now = performance.now()) {
  state.giantBonkEffects.forEach(e => {
    const age = (now - e.startTime) / 1500;
    if (age > 1) return;
    ctx.save();
    ctx.globalAlpha = 1 - age * 0.7;
    ctx.translate(e.x + 22, e.y + 7);
    ctx.rotate(e.rotation);
    ctx.translate(-(e.x + 22), -(e.y + 7));
    drawFrisbee(ctx, e.x, e.y, state.frameCount);
    ctx.restore();
    if (age < 0.4) {
      ctx.save();
      ctx.globalAlpha = 1 - age / 0.4;
      ctx.fillStyle = '#FF69B4';
      ctx.font = `bold ${12 + age * 15}px Courier New`;
      ctx.textAlign = 'center';
      ctx.fillText('BONK!', e.x + 22, e.y - 15 - age * 30);
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
