// Per-frame simulation step. Orchestrates physics, scrolling, spawning,
// scoring, weather, giant mode, and the scenes.
//
// services: { sfx, music, recordRun } — everything
// effectful is injected so this whole layer runs under Node for tests.

import {
  W, GROUND_Y, GRAVITY, FAST_FALL_GRAVITY_MULT, DT_BASELINE,
  INITIAL_SPEED, MAX_SPEED, SPEED_INCREMENT,
  MIN_OBSTACLE_GAP, MAX_OBSTACLE_GAP,
  BOSS_OBSTACLE_GAP_MULTIPLIER,
  DOG_HITBOX_STAND,
  GIANT_DURATION, BIRD_JUMP_BONUS,
} from '../config.js';
import { applyDuck } from './control.js';
import { spawnObstacle } from './spawning.js';
import { stepGiantPatterns } from './giantBones.js';
import { stepBob } from './obstacleTypes.js';
import { checkCollision, getDogHitbox } from './collision.js';
import { deactivateGiantMode, finishGiantTransition, giantScoreMultiplier, isGiant, missPassedBones } from './giant.js';
import { bossSpeedMultiplier, isBossChasing } from './boss.js';
import { updateScenes, scenesBlockSpawning, sceneTimeScale, scenesFreezeScore } from './scenes.js';
import { updateRain, rollWeatherOnStageChange } from './weather.js';
import { addEffect, updateEffects } from './effects.js';
import { killDog } from './death.js';

export function update(state, dt, services, rng = Math.random, now = performance.now()) {
  if (state.gameState !== 'running') return;

  const scale = (dt / DT_BASELINE) * (state.slowMode ? 0.5 : 1) * sceneTimeScale(state);
  state.frameCount++;
  state.speed = Math.min(MAX_SPEED, INITIAL_SPEED + state.score * SPEED_INCREMENT);

  const effectiveSpeed = state.speed * bossSpeedMultiplier(state);

  // Dog physics (scale by dt for frame-rate independence)
  const dog = state.dog;
  const wasInAir = dog.y < GROUND_Y;
  if (!dog.flying) {  // the flight scene moves a flying dog itself
    dog.vy += GRAVITY * (dog.fastFalling ? FAST_FALL_GRAVITY_MULT : 1) * scale;
    dog.y += dog.vy * scale;
    if (dog.y >= GROUND_Y) {
      dog.y = GROUND_Y;
      dog.vy = 0;
      dog.jumping = false;
      dog.doubleJumped = false;
      dog.fastFalling = false;
      // Dust puffs on landing (only when actually coming down from a jump)
      if (wasInAir && state.gameState === 'running') {
        const n = 3 + Math.floor(rng() * 3);
        for (let i = 0; i < n; i++) {
          state.landingParticles.push({
            x: dog.x + 30 + (rng() - 0.5) * 40,
            y: GROUND_Y,
            vx: (rng() - 0.5) * 0.8,
            vy: -1.5 - rng() * 2,
            life: 1,
            hue: rng() * 360,
          });
        }
      }
    }
  }

  // Before collision, so a duck held through the jump counts on the landing frame
  applyDuck(state, services);

  dog.legFrame += effectiveSpeed * 0.06 * scale;

  state.groundOffset += effectiveSpeed * scale;

  // Clouds drift at a fraction of the ground speed (parallax)
  state.clouds.forEach(c => {
    c.x -= effectiveSpeed * 0.15 * scale;
    if (c.x < -60 * c.size) {
      c.x = W + rng() * 100;
      c.y = 20 + rng() * 50;
      c.size = 0.6 + rng() * 0.8;
    }
  });

  // Spawn (unless a scene or giant mode's bone round owns the field), then scroll obstacles
  state.nextObstacleIn -= effectiveSpeed * scale;
  if (isGiant(state)) {
    stepGiantPatterns(state, effectiveSpeed * scale, rng, now);
  } else if (state.nextObstacleIn <= 0 && !scenesBlockSpawning(state)) {
    spawnObstacle(state, rng);
    if (state.nextObstacleIn <= 0) {
      const gap = isBossChasing(state)
        ? MIN_OBSTACLE_GAP * BOSS_OBSTACLE_GAP_MULTIPLIER
        : MIN_OBSTACLE_GAP;
      state.nextObstacleIn = gap + rng() * MAX_OBSTACLE_GAP;
    }
  }

  state.obstacles.forEach(o => {
    o.x -= effectiveSpeed * scale;
    if (o.bob) stepBob(o, scale);
  });

  // Detect jumping over a solo bird (walls are meant to be ducked/jumped through, not bonused).
  // A giant dog's birds are bones: one that gets past breaks the streak instead.
  if (isGiant(state)) missPassedBones(state, getDogHitbox(dog, true).x);
  else state.obstacles.forEach(o => {
    if (o.type === 'bird' && !o.aerialWall && !o.jumped && dog.jumping && o.x + o.width < dog.x + DOG_HITBOX_STAND.dx) {
      o.jumped = true;
      state.score += BIRD_JUMP_BONUS;
      addEffect(state, 'birdJump', now, { x: o.x + o.width / 2, y: o.y });
    }
  });

  state.obstacles = state.obstacles.filter(o => o.x + o.width > -10);

  // Landing dust particles
  state.landingParticles = state.landingParticles.filter(p => {
    p.x += p.vx * scale;
    p.y += p.vy * scale;
    p.vy += 0.08 * scale;  // light upward drift, then settle
    p.life -= 0.04 * scale;
    return p.life > 0;
  });

  // Weather particles (fixed speed, independent of game speed / slow mode)
  const weatherScale = dt / DT_BASELINE * 0.5;
  updateRain(state, weatherScale, rng);

  if (!scenesFreezeScore(state)) state.score += effectiveSpeed * 0.02 * scale * giantScoreMultiplier(state);

  rollWeatherOnStageChange(state, rng);

  if (isGiant(state)) {
    const elapsed = now - state.giantStartTime;
    if (elapsed >= GIANT_DURATION) {
      deactivateGiantMode(state, services, now);
    }
  }
  updateEffects(state, scale, now);

  // Scenes (the boss may kill the dog; the trampoline bounce must run before
  // collision resolves thorns on the same frame)
  updateScenes(state, scale, services, now, rng);

  // Chime at 100-point milestones
  const milestone = Math.floor(state.score / 100);
  if (milestone > state.lastMilestone) {
    state.lastMilestone = milestone;
    services.sfx.playScore();
  }

  if (checkCollision(state, services, now)) {
    killDog(state, services, now);
  }

  finishGiantTransition(state, now);
}
