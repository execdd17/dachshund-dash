// HUD: score readout, giant-mode timer, local leaderboard panel, music icon,
// idle/game-over text.

import {
  W, GIANT_DURATION, GIANT_WARN_AT, GIANT_SCORE_MULTIPLIER,
} from '../config.js';
import { roundRect } from './primitives.js';

// In app mode the HUD hugs the visible top edge (above world y=0, inside the
// device safe areas) instead of the world's top — see view.js.
export function hudOrigin(view) {
  const safe = view?.safe ?? { top: 0, left: 0, right: 0 };
  return {
    top: -(view?.extraTop ?? 0) + safe.top,
    left: 14 + safe.left,
    right: W - safe.right,
  };
}

export function drawScore(ctx, state, view, now = performance.now()) {
  const hud = hudOrigin(view);
  ctx.font = 'bold 18px Courier New';
  ctx.textAlign = 'right';

  const scoreStr = String(Math.floor(state.score)).padStart(5, '0');
  const hi = state.highScores[0]?.score ?? state.highScore;
  if (hi > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('HI ' + String(Math.floor(hi)).padStart(5, '0') + '  ', hud.right - 100, hud.top + 30);
  }
  ctx.fillStyle = '#fff';
  ctx.fillText(scoreStr, hud.right - 15, hud.top + 30);

  // Giant mode multiplier + timer bar
  if (state.giantActive) {
    const remaining = GIANT_DURATION - (now - state.giantStartTime);
    const flash = remaining < GIANT_WARN_AT ? (Math.sin(now * 0.015) > 0) : true;
    if (flash) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 14px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText('x' + GIANT_SCORE_MULTIPLIER, hud.left, hud.top + 48);
    }
    // Timer bar
    const barW = 60;
    const barH = 4;
    const barX = hud.left;
    const barY = hud.top + 52;
    const fill = Math.max(0, remaining / GIANT_DURATION);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = remaining < GIANT_WARN_AT ? '#FF6347' : '#FFD700';
    ctx.fillRect(barX, barY, barW * fill, barH);
  }
}

export function drawLocalLeaderboard(ctx, state, baseY) {
  const highScores = state.highScores;
  const panelW = 280;
  const panelH = highScores.length === 0 ? 44 : 28 + highScores.length * 18;
  const px = W / 2 - panelW / 2;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  roundRect(ctx, px, baseY, panelW, panelH, 8);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('HIGH SCORES', W / 2, baseY + 20);

  if (highScores.length === 0) {
    ctx.font = '14px Courier New';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.fillText('(no scores yet)', W / 2, baseY + 38);
  } else {
    ctx.font = '16px Courier New';
    highScores.forEach((entry, i) => {
      const lineY = baseY + 38 + i * 18;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      ctx.fillText(`${i + 1}. ${entry.name.padEnd(10)}`, px + 16, lineY);
      ctx.textAlign = 'right';
      ctx.fillText(String(Math.floor(entry.score)).padStart(5, '0'), px + panelW - 16, lineY);
    });
  }
}

export function drawMusicIcon(ctx, musicOn, view) {
  const hud = hudOrigin(view);
  const ix = hud.left, iy = hud.top + 16;
  // Speaker body
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.beginPath();
  ctx.moveTo(ix, iy);
  ctx.lineTo(ix + 6, iy);
  ctx.lineTo(ix + 12, iy - 5);
  ctx.lineTo(ix + 12, iy + 11);
  ctx.lineTo(ix + 6, iy + 6);
  ctx.lineTo(ix, iy + 6);
  ctx.closePath();
  ctx.fill();

  if (musicOn) {
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(ix + 14, iy + 3, 4, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ix + 14, iy + 3, 8, -Math.PI / 3, Math.PI / 3);
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(255,100,100,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ix + 15, iy - 2);
    ctx.lineTo(ix + 23, iy + 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ix + 23, iy - 2);
    ctx.lineTo(ix + 15, iy + 8);
    ctx.stroke();
  }
}

export function drawIdleScreen(ctx, state) {
  // Text background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  roundRect(ctx, W / 2 - 160, 58, 320, 40, 8);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText(state.touchDevice ? 'Tap to start!' : 'Press SPACE to start!', W / 2, 84);
  drawLocalLeaderboard(ctx, state, 108);
}

export function drawGameOverScreen(ctx, state) {
  // Text background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  roundRect(ctx, W / 2 - 150, 38, 300, 70, 8);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', W / 2, 65);
  ctx.font = '16px Courier New';
  ctx.fillText(state.touchDevice ? 'Tap to restart' : 'Press SPACE to restart', W / 2, 93);

  // Draw a little dizzy effect (X eyes on new head position)
  const dog = state.dog;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(dog.x + 82, dog.y - 5, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e02020';
  ctx.font = 'bold 7px Courier New';
  ctx.textAlign = 'center';
  ctx.fillText('X', dog.x + 82, dog.y - 3);
  drawLocalLeaderboard(ctx, state, 118);
}
