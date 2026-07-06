// Per-frame simulation step. Orchestrates physics, scrolling, spawning,
// scoring, weather, and the giant/chase/boss subsystems.
//
// services: { sfx, music, globalScores, recordScore } — everything
// effectful is injected so this whole layer runs under Node for tests.

import {
  W, GROUND_Y, GRAVITY, DT_BASELINE,
  INITIAL_SPEED, MAX_SPEED, SPEED_INCREMENT,
  MIN_OBSTACLE_GAP, MAX_OBSTACLE_GAP,
  BOSS_SPEED_MULTIPLIER, BOSS_CHASE_DURATION, BOSS_OBSTACLE_GAP_MULTIPLIER,
  GIANT_DURATION, BIRD_JUMP_BONUS,
} from '../config.js';
import { spawnObstacle } from './spawning.js';
import { checkCollision } from './collision.js';
import { deactivateGiantMode } from './giant.js';
import { updateChase } from './chase.js';
import { updateBoss } from './boss.js';
import { updateTrampoline } from './trampoline.js';
import { updateRain, rollWeatherOnStageChange } from './weather.js';
import { killDog } from './death.js';

export function update(state, dt, services, rng = Math.random, now = performance.now()) {
  if (state.gameState !== 'running') return;

  const scale = (dt / DT_BASELINE) * (state.slowMode ? 0.5 : 1);
  state.frameCount++;
  state.speed = Math.min(MAX_SPEED, INITIAL_SPEED + state.score * SPEED_INCREMENT);

  // Boss speed scaling: ramp over approach phase, drop back to normal during losing
  const bossSpeedMult = state.bossChasing
    ? 1 + (BOSS_SPEED_MULTIPLIER - 1) * Math.min(1, state.bossChaseFrames / (BOSS_CHASE_DURATION * 0.15))
    : 1;
  const effectiveSpeed = state.speed * bossSpeedMult;

  // Dog physics (scale by dt for frame-rate independence)
  const dog = state.dog;
  const wasInAir = dog.y < GROUND_Y;
  dog.vy += GRAVITY * scale;
  dog.y += dog.vy * scale;
  if (dog.y >= GROUND_Y) {
    dog.y = GROUND_Y;
    dog.vy = 0;
    dog.jumping = false;
    dog.doubleJumped = false;
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

  // Leg animation
  dog.legFrame += effectiveSpeed * 0.06 * scale;

  // Ground scroll
  state.groundOffset += effectiveSpeed * scale;

  // Clouds scroll (slower)
  state.clouds.forEach(c => {
    c.x -= effectiveSpeed * 0.15 * scale;
    if (c.x < -60 * c.size) {
      c.x = W + rng() * 100;
      c.y = 20 + rng() * 50;
      c.size = 0.6 + rng() * 0.8;
    }
  });

  // Obstacles
  state.nextObstacleIn -= effectiveSpeed * scale;
  if (state.nextObstacleIn <= 0 && !state.chasePending && !state.chaseEntering
    && !state.bossPending && !state.bossLosing
    && !state.trampPending && !state.trampActive) {
    spawnObstacle(state, rng);
    if (state.nextObstacleIn <= 0) {
      const gap = state.bossChasing
        ? MIN_OBSTACLE_GAP * BOSS_OBSTACLE_GAP_MULTIPLIER
        : MIN_OBSTACLE_GAP;
      state.nextObstacleIn = gap + rng() * MAX_OBSTACLE_GAP;
    }
  }

  state.obstacles.forEach(o => o.x -= effectiveSpeed * scale);

  // Detect jumping over a solo bird (walls are meant to be ducked/jumped through, not bonused).
  state.obstacles.forEach(o => {
    if (o.type === 'bird' && !o.aerialWall && !o.jumped && dog.jumping && o.x + o.width < dog.x + 23) {
      o.jumped = true;
      state.score += BIRD_JUMP_BONUS;
      state.birdJumpEffects.push({ x: o.x + o.width / 2, y: o.y, startTime: now });
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

  // Score (with giant multiplier)
  state.score += effectiveSpeed * 0.02 * scale * state.giantScoreMultiplier;

  // Check for day/night transitions to roll for rain
  rollWeatherOnStageChange(state, rng);

  // Giant mode timer
  if (state.giantActive) {
    const elapsed = now - state.giantStartTime;
    if (elapsed >= GIANT_DURATION) {
      deactivateGiantMode(state, services, now);
    }
  }
  // Update chomp/bonk visual effects
  state.giantChompEffects = state.giantChompEffects.filter(e => now - e.startTime < 500);
  state.giantBonkEffects = state.giantBonkEffects.filter(e => {
    e.x += e.vx * scale;
    e.y += e.vy * scale;
    e.vy += 0.3 * scale;
    e.rotation += e.rotSpeed * scale;
    return now - e.startTime < 1500;
  });
  state.birdJumpEffects = state.birdJumpEffects.filter(e => now - e.startTime < 800);
  state.trampBounceEffects = state.trampBounceEffects.filter(e => now - e.startTime < 800);

  // Chase mode
  updateChase(state, scale);

  // Boss chase state machine (may kill the dog)
  updateBoss(state, scale, services);

  // Trampoline scene (bounce before collision resolves thorns on the same frame)
  updateTrampoline(state, scale, services, now);

  // Chime at 100-point milestones
  const milestone = Math.floor(state.score / 100);
  if (milestone > state.lastMilestone) {
    state.lastMilestone = milestone;
    services.sfx.playScore();
  }

  // Collision
  if (checkCollision(state, services, now)) {
    killDog(state, services);
  }
}
