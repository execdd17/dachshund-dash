// Frame rendering orchestration: background → obstacles → squirrels → dog →
// effects → HUD → state-dependent overlays.

import {
  GROUND_Y, SQUIRREL_OFFSET, DOG_SPRITE_ANCHOR,
  GIANT_DURATION, GIANT_WARN_AT, GIANT_SCALE_TRANSITION,
  DEATH_SHAKE_MS, DEATH_SHAKE_PX, BOSS_SQUIRREL_SCALE,
} from '../config.js';
import {
  drawSky, drawSun, drawClouds, drawFarHills, drawNearHills,
  drawGround, drawFlowers, drawRain,
} from './background.js';
import { drawObstacle } from './obstacles.js';
import { drawDachshund, drawSquirrel } from './actors.js';
import {
  drawChompEffects, drawBonkEffects, drawBirdJumpEffects, drawTrampBounceEffects,
  drawLandingParticles,
} from './effects.js';
import { drawScore, drawHearts, drawMusicIcon, drawIdleScreen, drawGameOverScreen } from './hud.js';
import { scaleAbout } from './primitives.js';
import { advanceDogSpriteFrame, advanceSquirrelSpriteFrame, advanceBirdSpriteFrame } from '../assets/sprites.js';
import { getGiantVisualScale } from '../systems/giant.js';

// Per-scene actors, keyed by scene id (scenes with none, like the trampoline, are absent).
const SCENE_ACTORS = {
  // Comically oversized squirrel closing in from the left — scaled about its
  // feet so it stays grounded; it turns tail once the dog escapes.
  boss(ctx, state, scene, sprites) {
    advanceSquirrelSpriteFrame(sprites);
    const retreating = scene.phase === 'exiting';
    ctx.save();
    scaleAbout(ctx, scene.squirrelX + 10, GROUND_Y + 24, BOSS_SQUIRREL_SCALE);
    drawSquirrel(ctx, state, sprites, scene.squirrelX, GROUND_Y + 4, retreating, retreating);
    ctx.restore();
  },
  // Squirrel ahead of the dog: runs in (facing left), taunts, runs off.
  chase(ctx, state, scene, sprites) {
    advanceSquirrelSpriteFrame(sprites);
    if (scene.phase === 'active') {
      drawSquirrel(ctx, state, sprites, state.dog.x + SQUIRREL_OFFSET, GROUND_Y + 4, false);
    } else {
      drawSquirrel(ctx, state, sprites, scene.squirrelX, GROUND_Y + 4, true, scene.phase === 'entering');
    }
  },
};

// deps: { canvas, ctx, state, sprites, cosmetics, music, view, globalScores, onIdleFrame }
export function draw(deps) {
  const { canvas, ctx, state, sprites, cosmetics, music, view } = deps;
  const extraTop = view?.extraTop ?? 0;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(view?.scale ?? 2, view?.scale ?? 2);
  ctx.translate(view?.offsetX ?? 0, extraTop);

  // Screen shake on death, decaying to nothing
  if (state.gameState === 'dead' && state.deathTime > 0) {
    const elapsed = Date.now() - state.deathTime;
    if (elapsed < DEATH_SHAKE_MS) {
      const intensity = DEATH_SHAKE_PX * (1 - elapsed / DEATH_SHAKE_MS);
      ctx.translate((Math.random() - 0.5) * 2 * intensity, (Math.random() - 0.5) * 2 * intensity);
    }
  }

  drawSky(ctx, state, extraTop);
  drawSun(ctx, state, extraTop);
  drawClouds(ctx, state, extraTop);
  drawFarHills(ctx, state);
  drawNearHills(ctx, state);
  drawGround(ctx, state);
  drawFlowers(ctx, state);
  drawRain(ctx, state);

  // Obstacles
  advanceBirdSpriteFrame(sprites);
  state.obstacles.forEach(o => drawObstacle(ctx, state, o, sprites));

  // The running scene's actors, behind the dog
  const scene = state.scene;
  if (scene && scene.phase !== 'pending') SCENE_ACTORS[scene.id]?.(ctx, state, scene, sprites);

  // Dachshund (with giant-mode scaling and golden glow)
  advanceDogSpriteFrame(sprites, state);
  const dog = state.dog;
  const giantScale = getGiantVisualScale(state);

  // Post-hit invulnerability: flicker the dog while i-frames last
  ctx.save();
  if (state.gameState === 'running' && performance.now() < state.invulnUntil) {
    ctx.globalAlpha = Math.sin(performance.now() * 0.04) > 0 ? 0.85 : 0.3;
  }
  if (giantScale !== 1) {
    const pivotX = dog.x + dog.width * DOG_SPRITE_ANCHOR;
    const pivotY = GROUND_Y + 24;

    // Golden glow: draw the dog sprite slightly larger with shadowBlur behind the real sprite
    if (state.giantActive || state.giantShrinking) {
      const glowAlpha = state.giantShrinking
        ? Math.max(0, 1 - (performance.now() - state.giantTransitionStart) / GIANT_SCALE_TRANSITION)
        : 1;
      const remaining = GIANT_DURATION - (performance.now() - state.giantStartTime);
      const flash = (state.giantActive && remaining < GIANT_WARN_AT)
        ? (Math.sin(performance.now() * 0.015) > 0 ? 1 : 0.3)
        : 1;
      const glowPulse = 0.85 + 0.15 * Math.sin(performance.now() * 0.004);
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
    drawDachshund(ctx, state, sprites, cosmetics, dog.x, dog.y);
  }
  ctx.restore();

  drawChompEffects(ctx, state);
  drawBonkEffects(ctx, state, sprites);
  drawBirdJumpEffects(ctx, state);
  drawTrampBounceEffects(ctx, state);
  drawLandingParticles(ctx, state);

  drawScore(ctx, state, view);
  if (state.gameState !== 'idle' && state.gameState !== 'setup') drawHearts(ctx, state, view);
  drawMusicIcon(ctx, music.isOn(), view);

  if (state.gameState === 'idle') {
    deps.onIdleFrame?.();
    drawIdleScreen(ctx, state);
  }

  if (state.gameState === 'dead') {
    drawGameOverScreen(ctx, state);
  }

  ctx.restore();
}
