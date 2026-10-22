// Frame rendering orchestration: background → obstacles → squirrels → dog →
// effects → HUD → state-dependent overlays.

import {
  GROUND_Y, SQUIRREL_OFFSET,
  GIANT_DURATION, GIANT_WARN_AT, GIANT_SCALE_TRANSITION,
  DEATH_SHAKE_MS, DEATH_SHAKE_PX, BOSS_SQUIRREL_SCALE,
} from '../config.js';
import {
  drawSky, drawSun, drawClouds, drawFarHills, drawNearHills,
  drawGround, drawDecor, drawRain,
} from './background.js';
import { drawObstacle } from './obstacles.js';
import { drawDachshund, drawSquirrel } from './actors.js';
import { tunnelDiveOffset } from './tunnel.js';
import { drawFlightWind, flightBobOffset, withFlightCape, drawFlightHint } from './flight.js';
import { drawEffects, drawLandingParticles } from './effects.js';
import {
  drawScore, drawHearts, drawMusicIcon, drawIdleScreen, drawGameOverScreen, drawTutorialOverlay, drawTunnelHint,
} from './hud.js';
import { scaleAbout } from './primitives.js';
import { advanceDogSpriteFrame, advanceSquirrelSpriteFrame, advanceBirdSpriteFrame } from '../assets/sprites.js';
import { getGiantVisualScale, giantPivot, isGiant } from '../systems/giant.js';
import { cameraLift } from '../systems/scenes.js';

// Per-scene actors, keyed by scene id (scenes with none, like the trampoline, are absent).
const SCENE_ACTORS = {
  // Comically oversized squirrel closing in from the left — scaled about its
  // feet so it stays grounded; it turns tail once the dog escapes.
  boss(ctx, state, scene, sprites, now) {
    advanceSquirrelSpriteFrame(sprites, now);
    const retreating = scene.phase === 'exiting';
    ctx.save();
    scaleAbout(ctx, scene.squirrelX + 10, GROUND_Y + 24, BOSS_SQUIRREL_SCALE);
    drawSquirrel(ctx, state, sprites, scene.squirrelX, GROUND_Y + 4, retreating, retreating);
    ctx.restore();
  },
  // Squirrel ahead of the dog: runs in (facing left), taunts, runs off.
  chase(ctx, state, scene, sprites, now) {
    advanceSquirrelSpriteFrame(sprites, now);
    if (scene.phase === 'active') {
      drawSquirrel(ctx, state, sprites, state.dog.x + SQUIRREL_OFFSET, GROUND_Y + 4, false);
    } else {
      drawSquirrel(ctx, state, sprites, scene.squirrelX, GROUND_Y + 4, true, scene.phase === 'entering');
    }
  },
};

// deps: { canvas, ctx, state, sprites, cosmetics, music, view, now } — now is the
// frame's timestamp (the same clock update() ran on); every time-based visual reads it.
export function draw(deps) {
  const { canvas, ctx, state, sprites, cosmetics, music, view, now = performance.now() } = deps;
  const extraTop = view?.extraTop ?? 0;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(view?.scale ?? 2, view?.scale ?? 2);
  ctx.translate(view?.offsetX ?? 0, extraTop);

  // Screen shake on death, decaying to nothing
  if (state.gameState === 'dead' && state.deathTime > 0) {
    const elapsed = now - state.deathTime;
    if (elapsed < DEATH_SHAKE_MS) {
      const intensity = DEATH_SHAKE_PX * (1 - elapsed / DEATH_SHAKE_MS);
      ctx.translate((Math.random() - 0.5) * 2 * intensity, (Math.random() - 0.5) * 2 * intensity);
    }
  }

  // A scene can pan the camera (cameraLift): the flight pans up, the tunnel
  // down a little. The world moves by `lift`, while the sky, sun, and rain
  // stay put on screen and clouds move at half the rate.
  const lift = cameraLift(state);
  ctx.save();
  ctx.translate(0, lift);
  drawSky(ctx, state, extraTop + lift);
  drawSun(ctx, state, extraTop + lift);
  drawClouds(ctx, state, extraTop + lift / 2);
  drawFarHills(ctx, state);
  drawNearHills(ctx, state);
  drawGround(ctx, state);
  drawDecor(ctx, state);
  ctx.save();
  ctx.translate(0, -lift);
  drawRain(ctx, state);
  ctx.restore();

  drawFlightHint(ctx, state, now);
  advanceBirdSpriteFrame(sprites, now);
  state.obstacles.forEach(o => drawObstacle(ctx, state, o, sprites, now));

  // The running scene's actors, behind the dog
  const scene = state.scene;
  if (scene && scene.phase !== 'pending') SCENE_ACTORS[scene.id]?.(ctx, state, scene, sprites, now);

  drawFlightWind(ctx, state, now);

  // Dachshund (with giant-mode scaling and golden glow)
  advanceDogSpriteFrame(sprites, state, now);
  const dog = state.dog;
  const giantScale = getGiantVisualScale(state, now);

  // Post-hit invulnerability: flicker the dog while i-frames last
  ctx.save();
  if (state.gameState === 'running' && now < state.invulnUntil) {
    ctx.globalAlpha = Math.sin(now * 0.04) > 0 ? 0.85 : 0.3;
  }
  if (giantScale !== 1) {
    const { x: pivotX, y: pivotY } = giantPivot(dog);  // the hitbox scales about it too

    // Golden glow: draw the dog sprite slightly larger with shadowBlur behind the real sprite
    if (state.giantPhase !== 'off') {
      const glowAlpha = state.giantPhase === 'shrinking'
        ? Math.max(0, 1 - (now - state.giantTransitionStart) / GIANT_SCALE_TRANSITION)
        : 1;
      const remaining = GIANT_DURATION - (now - state.giantStartTime);
      const flash = (isGiant(state) && remaining < GIANT_WARN_AT)
        ? (Math.sin(now * 0.015) > 0 ? 1 : 0.3)
        : 1;
      const glowPulse = 0.85 + 0.15 * Math.sin(now * 0.004);
      const glowScale = giantScale * (1 + 0.06 * glowPulse);
      ctx.save();
      scaleAbout(ctx, pivotX, pivotY, glowScale);
      ctx.globalAlpha = 0.45 * glowAlpha * flash * glowPulse;
      ctx.shadowColor = '#FFD700';
      ctx.shadowBlur = 28;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      drawDachshund(ctx, state, sprites, cosmetics, dog.x, dog.y);
      ctx.restore();
    }

    // Draw the actual giant dog on top
    ctx.save();
    scaleAbout(ctx, pivotX, pivotY, giantScale);
    drawDachshund(ctx, state, sprites, cosmetics, dog.x, dog.y);
    ctx.restore();
  } else {
    const drawnY = dog.y + tunnelDiveOffset(dog, now) + flightBobOffset(dog, now);
    drawDachshund(ctx, state, sprites, withFlightCape(cosmetics, dog), dog.x, drawnY);
  }
  ctx.restore();

  drawEffects(ctx, state, sprites, now);
  drawLandingParticles(ctx, state);
  drawTunnelHint(ctx, state, now);
  ctx.restore();

  drawScore(ctx, state, view, now);
  if (state.gameState !== 'idle' && state.gameState !== 'setup') drawHearts(ctx, state, view, now);
  drawMusicIcon(ctx, music.isOn(), view);
  drawTutorialOverlay(ctx, state, now);

  if (state.gameState === 'idle') {
    drawIdleScreen(ctx, state);
  }

  // While the name prompt is up it stands in for the game-over box
  if (state.gameState === 'dead' && !state.pendingScore) {
    drawGameOverScreen(ctx, state);
  }

  ctx.restore();
}
