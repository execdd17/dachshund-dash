// Input wiring: desktop keyboard (Space/Up jump, Down/S duck, plus the debug
// keys in debug.js) and mobile touch (right side jumps, left DUCK_ZONE_RATIO ducks).

import { W, H, DUCK_ZONE_RATIO } from '../config.js';
import { jump, duck } from '../systems/control.js';
import { runDebugKey } from './debug.js';

export function isTouchDevice() {
  return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

// deps: { state, canvas, services, nameEntry, cosmetics, cosmeticsMenu, music, touchDevice, view }
export function wireInput(deps) {
  const { state, canvas, services, nameEntry, cosmetics, cosmeticsMenu, music, touchDevice, view } = deps;

  document.addEventListener('keydown', e => {
    if (state.gameState === 'setup') {
      if (e.code === 'Enter') {
        e.preventDefault();
        nameEntry.submit();
      } else if (!(document.activeElement instanceof HTMLInputElement)
          && (e.code === 'Space' || e.code.startsWith('Arrow'))) {
        // Keep the page from scrolling under the setup overlay (the desktop
        // layout scrolls to the leaderboard); inputs keep their key defaults
        // (spaces in the name field, arrows on the difficulty slider).
        e.preventDefault();
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
    if (runDebugKey(e.code, state, { cosmetics })) e.preventDefault();
  });

  document.addEventListener('keyup', e => {
    if (document.activeElement && document.activeElement.id === 'lbSearch') return;
    if (e.code === 'ArrowDown' || e.code === 'KeyS') {
      duck(state, false, services);
    }
  });

  // A held key's keyup never arrives once the window loses focus.
  window.addEventListener('blur', () => duck(state, false, services));

  // point: a MouseEvent or Touch (anything with clientX/clientY).
  function getLogicalCoords(point) {
    if (view) return view.toWorld(point.clientX, point.clientY);
    const rect = canvas.getBoundingClientRect();
    return {
      x: (point.clientX - rect.left) / rect.width * W,
      y: (point.clientY - rect.top) / rect.height * H,
    };
  }

  // The music icon tracks the visible top-left corner (see drawMusicIcon),
  // which sits above world y=0 when the sky is extended in app mode.
  function inMusicZone(p) {
    const safe = view?.safe ?? { top: 0, left: 0 };
    const top = -(view?.extraTop ?? 0) + safe.top;
    return p.x < 38 + safe.left && p.y < top + 32;
  }

  // The finger holding the duck zone: only lifting that one ends the duck,
  // so a jump tap with another finger doesn't.
  let duckTouchId = null;

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    for (const touch of e.changedTouches) {
      const p = getLogicalCoords(touch);
      if (inMusicZone(p)) {
        music.toggle();
      } else if (touchDevice && p.x < W * DUCK_ZONE_RATIO) {
        duckTouchId = touch.identifier;
        duck(state, true, services);
      } else {
        jump(state, services);
      }
    }
  });

  const releaseDuckTouch = e => {
    for (const touch of e.changedTouches) {
      if (touch.identifier !== duckTouchId) continue;
      duckTouchId = null;
      duck(state, false, services);
    }
  };
  canvas.addEventListener('touchend', releaseDuckTouch);
  canvas.addEventListener('touchcancel', releaseDuckTouch);

  canvas.addEventListener('click', e => {
    const p = getLogicalCoords(e);
    if (inMusicZone(p)) { music.toggle(); return; }
    jump(state, services);
  });
}
