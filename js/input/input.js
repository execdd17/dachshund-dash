// Input wiring: desktop keyboard (Space/Up jump, Down/S duck, plus debug
// keys) and mobile touch (right side jumps, left DUCK_ZONE_RATIO ducks).

import { W, H, GROUND_Y, DUCK_ZONE_RATIO } from '../config.js';
import { jump, duck } from '../systems/control.js';
import { initRain } from '../systems/weather.js';

export function isTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

// deps: { state, canvas, services, nameEntry, cosmetics, cosmeticsMenu, music, touchDevice, view }
export function wireInput(deps) {
  const { state, canvas, services, nameEntry, cosmetics, cosmeticsMenu, music, touchDevice, view } = deps;

  document.addEventListener('keydown', e => {
    if (state.gameState === 'enteringName') {
      if (e.code === 'Enter') {
        e.preventDefault();
        nameEntry.submit();
      }
      return;
    }
    // Don't capture keys when typing in the search box
    if (document.activeElement && document.activeElement.id === 'lbSearch') return;
    // Don't capture keys while the cosmetics menu is open
    if (cosmeticsMenu.isOpen()) return;
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      jump(state, services);
    }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      e.preventDefault();
      duck(state, true, services);
    }
    // Debug: P = slow motion
    if (e.code === 'KeyP') {
      e.preventDefault();
      state.slowMode = !state.slowMode;
    }
    // Debug: H = toggle default hat
    if (e.code === 'KeyH') {
      e.preventDefault();
      cosmetics.toggleDefaultHat();
    }
    // Debug: C = trigger squirrel chase (when running)
    if (e.code === 'KeyC' && state.gameState === 'running' && !state.chaseActive && !state.chaseEntering && !state.chaseEscaping) {
      e.preventDefault();
      state.chasePending = true;
      state.obstacles = [];  // clear obstacles so chase starts immediately
    }
    // Debug: B = trigger boss chase (when running)
    if (e.code === 'KeyB' && state.gameState === 'running' && !state.bossChasing && !state.bossLosing) {
      e.preventDefault();
      state.bossPending = true;
      state.obstacles = [];  // clear obstacles so boss starts immediately
    }
    // Debug: G = spawn a golden hot dog right in front of the dog
    if (e.code === 'KeyG' && state.gameState === 'running' && !state.giantActive) {
      e.preventDefault();
      state.obstacles.push({
        x: state.dog.x + 120,
        y: GROUND_Y + 4,
        width: 36,
        height: 22,
        type: 'golden',
      });
    }
    // Debug: R = toggle rain
    if (e.code === 'KeyR') {
      e.preventDefault();
      state.weatherRain = !state.weatherRain;
      if (state.weatherRain) initRain(state); else state.rainDrops = [];
    }
  });

  document.addEventListener('keyup', e => {
    if (document.activeElement && document.activeElement.id === 'lbSearch') return;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      duck(state, false, services);
    }
  });

  function getLogicalCoords(e) {
    const cx = ('touches' in e ? e.touches[0].clientX : e.clientX);
    const cy = ('touches' in e ? e.touches[0].clientY : e.clientY);
    if (view) return view.toWorld(cx, cy);
    const rect = canvas.getBoundingClientRect();
    return {
      x: (cx - rect.left) / rect.width * W,
      y: (cy - rect.top) / rect.height * H,
    };
  }

  // The music icon tracks the visible top-left corner (see drawMusicIcon),
  // which sits above world y=0 when the sky is extended in app mode.
  function inMusicZone(p) {
    const safe = view?.safe ?? { top: 0, left: 0 };
    const top = -(view?.extraTop ?? 0) + safe.top;
    return p.x < 38 + safe.left && p.y < top + 32;
  }

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const p = getLogicalCoords(e);
    if (inMusicZone(p)) { music.toggle(); return; }
    if (touchDevice && p.x < W * DUCK_ZONE_RATIO) {
      duck(state, true, services);
    } else {
      jump(state, services);
    }
  });

  canvas.addEventListener('touchend', () => {
    if (touchDevice && state.dog.ducking) {
      duck(state, false, services);
    }
  });

  canvas.addEventListener('click', e => {
    const p = getLogicalCoords(e);
    if (inMusicZone(p)) { music.toggle(); return; }
    jump(state, services);
  });
}
