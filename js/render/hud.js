// HUD: score readout, giant-mode timer, hearts, music icon,
// idle/game-over text, tutorial prompts, the tunnel's HOLD ↓ hint.

import {
  W, GIANT_DURATION, GIANT_WARN_AT, GIANT_SCORE_MULTIPLIER,
  HEART_FLASH_MS,
} from '../config.js';
import { roundRect, drawPixelHeart, drawPopupText, HEART_BITMAP_W } from './primitives.js';
import { formatOrdinal } from '../leaderboard/global.js';
import { isGiant } from '../systems/giant.js';
import { TUTORIAL_STEP_COUNT } from '../systems/tutorial.js';
import { inScene } from '../systems/encounters.js';

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
  if (isGiant(state)) {
    const remaining = GIANT_DURATION - (now - state.giantStartTime);
    const flash = remaining < GIANT_WARN_AT ? (Math.sin(now * 0.015) > 0) : true;
    if (flash) {
      ctx.fillStyle = '#FFD700';
      ctx.font = 'bold 14px Courier New';
      ctx.textAlign = 'left';
      ctx.fillText('x' + GIANT_SCORE_MULTIPLIER, hud.left, hud.top + 48);
    }
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

const HEART_PX = 2;                       // canvas px per bitmap pixel
const HEART_W = HEART_BITMAP_W * HEART_PX;  // 14

// Hearts sit under the giant-mode timer bar slot (top-left, below the speaker).
// Remaining hearts are filled; spent slots stay as dim silhouettes, and the
// just-lost or just-regained heart blinks briefly.
export function drawHearts(ctx, state, view, now = performance.now()) {
  const hud = hudOrigin(view);
  const y = hud.top + 62;
  const blinking = since => now - since < HEART_FLASH_MS;
  for (let i = 0; i < state.startingHearts; i++) {
    const x = hud.left + i * (HEART_W + 6);
    let filled = i < state.hearts;
    if ((i === state.hearts && blinking(state.heartLostAt)) || (i === state.hearts - 1 && blinking(state.heartGainedAt))) {
      filled = Math.sin(now * 0.03) > 0;
    }
    drawPixelHeart(ctx, x, y, { px: HEART_PX, filled });
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
}

export function drawGameOverScreen(ctx, state) {
  // Global-placement banner above the GAME OVER box (only when the run
  // actually placed on the loaded global board — see leaderboard/recorder.js).
  if (state.globalPlacement) {
    const msg = `You got ${formatOrdinal(state.globalPlacement)} place on the global leaderboard!`;
    ctx.font = 'bold 14px Courier New';
    ctx.textAlign = 'center';
    const bannerW = ctx.measureText(msg).width + 28;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    roundRect(ctx, W / 2 - bannerW / 2, 4, bannerW, 26, 8);
    ctx.fillStyle = '#FFD700';
    ctx.fillText(msg, W / 2, 22);
  }

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
}

// Tutorial text, per step (shown while its obstacle approaches) and per
// prompt (flashing while the game waits on the action), worded per device.
const TUTORIAL_STEP_TITLES = ['Jump over the chocolate!', 'Too tall? Jump twice!', 'Too high to jump? Duck!'];
const TUTORIAL_PROMPTS = {
  jump: { text: 'JUMP!', keys: 'SPACE or ↑', touch: 'TAP the right side' },
  jumpAgain: { text: 'AGAIN!', keys: 'press again in the air', touch: 'tap again in the air' },
  duck: {
    text: 'DUCK!', keys: 'HOLD ↓', touch: 'HOLD the left side',
    tip: { keys: 'tip: ↓ in the air drops you fast', touch: 'tip: hold left in the air to drop fast' },
  },
};

export function drawTutorialOverlay(ctx, state, now = performance.now()) {
  const scene = state.scene;
  if (scene?.id !== 'tutorial' || scene.phase === 'pending') return;
  const device = state.touchDevice ? 'touch' : 'keys';
  const lastStep = scene.step === TUTORIAL_STEP_COUNT - 1;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  roundRect(ctx, W / 2 - 170, 30, 340, 90, 8);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.font = 'bold 12px Courier New';
  ctx.fillText(`HOW TO PLAY  ${Math.min(scene.step + 1, TUTORIAL_STEP_COUNT)}/${TUTORIAL_STEP_COUNT}`, W / 2, 47);

  const prompt = TUTORIAL_PROMPTS[scene.prompt];
  if (scene.phase === 'praise') {
    ctx.fillStyle = '#7CFC00';
    ctx.font = 'bold 30px Courier New';
    ctx.fillText(lastStep ? "YOU'RE READY!" : 'NICE!', W / 2, 88);
  } else if (scene.phase === 'retry') {
    ctx.fillStyle = '#FF6347';
    ctx.font = 'bold 30px Courier New';
    ctx.fillText('TRY AGAIN!', W / 2, 88);
  } else if (prompt) {
    ctx.save();
    ctx.globalAlpha = Math.sin(now * 0.012) > 0 ? 1 : 0.55;
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 32px Courier New';
    ctx.fillText(prompt.text, W / 2, 80);
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 15px Courier New';
    ctx.fillText(prompt[device], W / 2, 100);
    if (prompt.tip) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
      ctx.font = '12px Courier New';
      ctx.fillText(prompt.tip[device], W / 2, 114);
    }
  } else {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px Courier New';
    ctx.fillText(TUTORIAL_STEP_TITLES[scene.step], W / 2, 86);
  }
}

// Each run's first tunnel: HOLD ↓ flashing over the first hole, with an
// arrow bobbing down into it, until the dog drops in.
const TUNNEL_HINT = { text: 'HOLD ↓', keys: 'to dig in!', touch: 'hold the left side to dig in!' };

export function drawTunnelHint(ctx, state, now = performance.now()) {
  if (!state.tunnelHintPending || !inScene(state, 'tunnel', 'active') || state.dog.underground) return;
  const hole = state.obstacles.find(o => o.type === 'tunnelHole' && o.holeIndex === 0 && !o.used);
  if (!hole || hole.x > W) return;
  const cx = hole.x + hole.width / 2;
  const flash = Math.sin(now * 0.012) > 0 ? 1 : 0.55;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  roundRect(ctx, cx - 75, 112, 150, 46, 8);
  drawPopupText(ctx, TUNNEL_HINT.text, cx, 138, { color: '#FFD700', size: 26, alpha: flash });
  drawPopupText(ctx, TUNNEL_HINT[state.touchDevice ? 'touch' : 'keys'], cx, 152, { color: '#fff', size: 10, alpha: 1 });

  const bob = Math.abs(Math.sin(now * 0.008)) * 8;
  ctx.fillStyle = '#FFD700';
  ctx.globalAlpha = flash;
  ctx.beginPath();
  ctx.moveTo(cx - 7, 170 + bob);
  ctx.lineTo(cx + 7, 170 + bob);
  ctx.lineTo(cx, 180 + bob);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(cx - 2.5, 160 + bob, 5, 10);
  ctx.globalAlpha = 1;
}
