// Weather: rain rolls happen on dawn→day and sunset→night transitions.

import { W, H, RAIN_CHANCE, RAIN_DROPS } from '../config.js';
import { getTimeOfDay } from '../core/timeOfDay.js';

export function initRain(state, rng = Math.random) {
  // state.skyTop (≤0) is the top of the visible sky — below 0 when app mode
  // extends the sky above the world (see render/view.js).
  const skyTop = state.skyTop ?? 0;
  state.rainDrops = [];
  for (let i = 0; i < RAIN_DROPS; i++) {
    state.rainDrops.push({
      x: rng() * W,
      y: skyTop + rng() * (H - skyTop),
      speed: 4 + rng() * 3,
      length: 4 + rng() * 4,
      opacity: 0.2 + rng() * 0.3,
    });
  }
}

// Advance raindrop positions. weatherScale is fixed-speed (independent of
// game speed / slow mode).
export function updateRain(state, weatherScale, rng = Math.random) {
  if (!state.weatherRain) return;
  state.rainDrops.forEach(d => {
    d.y += d.speed * weatherScale;
    d.x -= 0.5 * weatherScale;
    if (d.y > H) { d.y = (state.skyTop ?? 0) - d.length; d.x = rng() * W; }
    if (d.x < 0) d.x += W;
  });
}

// On each dawn→day / sunset→night change, roll whether it rains for the next stretch.
export function rollWeatherOnStageChange(state, rng = Math.random) {
  const currentStage = getTimeOfDay(state.score).stage;
  if (currentStage !== state.lastTimeStage) {
    if ((currentStage === 'day' || currentStage === 'night') &&
        (state.lastTimeStage === 'dawn' || state.lastTimeStage === 'sunset')) {
      if (rng() < RAIN_CHANCE) {
        if (!state.weatherRain) { state.weatherRain = true; initRain(state, rng); }
      } else {
        if (state.weatherRain) { state.weatherRain = false; state.rainDrops = []; }
      }
    }
    state.lastTimeStage = currentStage;
  }
}
