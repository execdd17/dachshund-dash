// Maps the fixed logical game world (W×H, ground at the bottom) onto the
// real canvas. The canvas is stretched over the whole viewport on every
// device: the world fills the width, the ground stays pinned to the bottom
// edge, and all extra height becomes sky above world y=0 (so visible sky
// spans y in [-extraTop, GROUND_Y]).

import { W, H } from '../config.js';

const MAX_DPR = 2; // cap backing-store resolution; 3x retina buys nothing visible here

export function createView(canvas) {
  const view = {
    scale: 2,     // canvas backing px per logical unit
    extraTop: 0,  // logical units of extra sky above world y=0
    offsetX: 0,   // logical units of horizontal centering (wider-than-3.2:1 screens only)
    safe: { top: 0, left: 0, right: 0, bottom: 0 }, // safe-area insets, logical units
    resize,
    toWorld,
  };

  // env(safe-area-inset-*) is only readable through layout, so measure it
  // with an invisible fixed-position probe pinned to the safe-area edges.
  let probe = null;
  function measureSafeInsets() {
    if (!probe) {
      probe = document.createElement('div');
      probe.style.cssText =
        'position:fixed;visibility:hidden;pointer-events:none;' +
        'top:env(safe-area-inset-top);left:env(safe-area-inset-left);' +
        'right:env(safe-area-inset-right);bottom:env(safe-area-inset-bottom);';
      document.body.appendChild(probe);
    }
    const r = probe.getBoundingClientRect();
    return {
      top: Math.max(0, r.top),
      left: Math.max(0, r.left),
      right: Math.max(0, window.innerWidth - r.right),
      bottom: Math.max(0, window.innerHeight - r.bottom),
    };
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    // Size the backing store from the canvas's real laid-out CSS box so the
    // buffer's aspect always equals the displayed aspect — window.inner* can
    // disagree with the fixed-position wrapper when mobile browser bars are
    // in play. Layout metrics lag events like rotation, so measurements must
    // happen post-layout: the ResizeObserver in main.js re-runs this with
    // settled geometry. The box reads 0 while hidden (touch portrait);
    // fall back to the window size (canvas isn't visible anyway).
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round((rect.width || window.innerWidth) * dpr);
    canvas.height = Math.round((rect.height || window.innerHeight) * dpr);

    // Fill the width; extra height becomes sky. If the screen is wider than
    // the world's aspect (rare), fit by height and center horizontally.
    let scale = canvas.width / W;
    if (canvas.height / scale < H) scale = canvas.height / H;
    view.scale = scale;
    view.extraTop = Math.max(0, canvas.height / scale - H);
    view.offsetX = Math.max(0, (canvas.width / scale - W) / 2);

    const cssScale = scale / dpr; // CSS px per logical unit
    const s = measureSafeInsets();
    view.safe = {
      top: s.top / cssScale,
      left: s.left / cssScale,
      right: s.right / cssScale,
      bottom: s.bottom / cssScale,
    };
  }

  // Client (CSS px) coordinates → world coordinates.
  function toWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / rect.width * (canvas.width / view.scale) - view.offsetX,
      y: (clientY - rect.top) / rect.height * (canvas.height / view.scale) - view.extraTop,
    };
  }

  return view;
}
