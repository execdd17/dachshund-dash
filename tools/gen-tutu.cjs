// Tutu overlay generator: for every dachshund frame, paint a ballet tutu
// around the dog's waist — a satin band perpendicular to the spine plus tulle
// frills flaring out past the back and belly, skirt sweeping toward the tail
// (a human tutu rotated 90° clockwise onto the horizontal dog). Emits one
// full-size transparent overlay PNG per frame, drawn with the same geometry
// as the base frame, so alignment is pixel-perfect in every pose.
// Usage: node gen-tutu.cjs <repoDir> [previewDir]
const path = require('path');
const { writePng } = require('./pnglib.cjs');
const { scanRadius, paintDogOverlays } = require('./spritelib.cjs');

const repo = process.argv[2] || '.';
const previewDir = process.argv[3] || null;
const dir = p => path.join(repo, p);

// Waist-sized radii; the clamp keeps glow in the flip frames from ballooning the fit.
const WAIST_SCAN = { maxT: 140, maxGap: 10, min: 35, max: 95, fallback: 55 };

const STYLE = {
  band:      [214, 51, 108],
  bandHi:    [236, 88, 138],
  skirt:     [247, 163, 197],
  streak:    [229, 120, 166],
  backSkirt: [208, 96, 144],
  outline:   [74, 20, 46],
};

const DEFAULTS = {
  bandW: 26,      // waistband width along the spine, sprite px
  skirtLen: 48,   // how far the skirt sweeps tail-ward from the band
  reach: 44,      // how far frills stick out past the silhouette
  zigDepth: 14,   // tulle zigzag tooth depth at the hem
  zigPeriod: 26,  // tulle zigzag tooth spacing
};

// Hand-picked waist anchor per frame: cx/cy roughly mid-torso between ribcage
// and hips, angle = spine direction toward the head (deg, screen coords).
// rBack/rBelly (center -> silhouette edge) are refined by scanning the sprite.
// Ground poses shrink reachBelly so the bottom frills don't stab the ground.
const SPECS = {
  'dachshund_run_00.png':      { cx: 213, cy: 508, angle: -6 },
  'dachshund_run_01.png':      { cx: 203, cy: 505, angle: 2, rBack: 46, reachBelly: 36 },
  'dachshund_run_02.png':      { cx: 193, cy: 500, angle: 2, rBack: 48, reachBelly: 36 },
  'dachshund_jump_00.png':     { cx: 224, cy: 490, angle: -22 },
  'dachshund_jump_01.png':     { cx: 208, cy: 472, angle: -12 },
  'dachshund_jump_02.png':     { cx: 188, cy: 488, angle: 10, rBack: 50, reach: 36 },
  'dachshund_flip_00.png':     { cx: 290, cy: 493, angle: 35, reach: 34, skirtLen: 40 },
  'dachshund_flip_01.png':     { cx: 240, cy: 469, angle: 32, reach: 28, skirtLen: 34 },
  'dachshund_flip_02.png':     { cx: 295, cy: 502, angle: 30, reach: 34, skirtLen: 40 },
  'dachshund_pancake_00.png':  { cx: 223, cy: 520, angle: 4, reachBelly: 14 },
  'dachshund_pancake_01.png':  { cx: 203, cy: 520, angle: 4, reachBelly: 14 },
  'dachshund_pancake_02.png':  { cx: 183, cy: 520, angle: 3, reachBelly: 14 },
  'bite_0': { cx: 228, cy: 545, angle: 4, reachBelly: 14 },
  'bite_1': { cx: 190, cy: 532, angle: -33 },
  'bite_2': { cx: 283, cy: 555, angle: 5, reachBelly: 14 },
};

const tri = x => Math.abs(x - Math.floor(x) - 0.5) * 2; // triangle wave 0..1

// Paint one tutu into `out` (full-image RGBA buffer); returns painted px count.
function paintTutu(img, out, xOff, sliceW, spec) {
  const W = sliceW ?? img.w;
  const p = { ...DEFAULTS, ...spec };
  const rad = p.angle * Math.PI / 180;
  const ax = Math.cos(rad), ay = Math.sin(rad);   // spine axis, toward head
  const px = -Math.sin(rad), py = Math.cos(rad);  // perpendicular, belly side +
  const rBack = p.rBack ?? scanRadius(img, xOff, sliceW, p.cx, p.cy, px, py, -1, WAIST_SCAN);
  const rBelly = p.rBelly ?? scanRadius(img, xOff, sliceW, p.cx, p.cy, px, py, 1, WAIST_SCAN);
  const reachOf = dv => (dv < 0 ? p.reach : (p.reachBelly ?? p.reach));
  const rOf = dv => (dv < 0 ? rBack : rBelly);

  const backLen = p.skirtLen + 12, backExtra = 10;
  // region: 0=none 1=back-layer 2=main skirt 3=streak 4=band 5=band highlight
  const classify = (du, dv) => {
    const r = rOf(dv), reach = reachOf(dv);
    if (du >= 0) { // waistband, hugging the silhouette
      if (du <= p.bandW && Math.abs(dv) <= r + 4) {
        return (du >= p.bandW * 0.32 && du <= p.bandW * 0.62) ? 5 : 4;
      }
      return 0;
    }
    // skirts: frills already stick out at the band, flare fully by the hem
    const inLayer = (len, extra, phase) => {
      const hem = -len + p.zigDepth * tri(dv / p.zigPeriod + phase);
      if (du < hem) return false;
      const half = r + (reach + extra) * (0.45 + 0.55 * (-du) / len);
      return Math.abs(dv) <= half;
    };
    if (inLayer(p.skirtLen, 0, 0)) {
      // radial tulle streaks across the frill
      const k = dv / (rOf(dv) + reachOf(dv));
      const f = k * 4.5 - Math.round(k * 4.5);
      return (Math.abs(f) < 0.09 && Math.abs(dv) > rOf(dv) * 0.45) ? 3 : 2;
    }
    if (inLayer(backLen, backExtra, 0.5)) return 1;
    return 0;
  };

  const S = 210;
  const x0 = Math.max(0, Math.round(p.cx - S)), x1 = Math.min(W - 1, Math.round(p.cx + S));
  const y0 = Math.max(0, Math.round(p.cy - S)), y1 = Math.min(img.h - 1, Math.round(p.cy + S));
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  const region = new Uint8Array(bw * bh);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x - p.cx, dy = y - p.cy;
      region[(y - y0) * bw + (x - x0)] = classify(dx * ax + dy * ay, dx * px + dy * py);
    }
  }

  const at = (x, y) => (x < x0 || x > x1 || y < y0 || y > y1) ? 0 : region[(y - y0) * bw + (x - x0)];
  const COLORS = [null, STYLE.backSkirt, STYLE.skirt, STYLE.streak, STYLE.band, STYLE.bandHi];
  let count = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const r = at(x, y);
      if (!r) continue;
      count++;
      let c = COLORS[r];
      // dark outline: at the tutu edge, and where band or main skirt meets
      // the back layer (defines the zigzag teeth)
      let edge = false, layerEdge = false;
      for (let dy = -2; dy <= 2 && !edge; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 2) continue;
        const n = at(x + dx, y + dy);
        if (n === 0) { edge = true; break; }
        if (Math.abs(dx) + Math.abs(dy) <= 1 && n === 1 && r >= 2) layerEdge = true;
      }
      if (edge || layerEdge) c = STYLE.outline;
      const i = ((y * img.w) + x + xOff) * 4;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
    }
  }
  return count;
}

const outDir = dir('png/body/tutu-pink');
paintDogOverlays({
  repo, outDir, previewDir, label: 'tutu-pink',
  paint: (img, out, xOff, sliceW, key) => paintTutu(img, out, xOff, sliceW, SPECS[key]),
});

// menu tile icon: a standalone upright tutu (human orientation, band on top)
{
  const IW = 210, IH = 150;
  const icon = Buffer.alloc(IW * IH * 4);
  const fake = { w: IW, h: IH, rgba: Buffer.alloc(IW * IH * 4) }; // no body pixels
  paintTutu(fake, icon, 0, null, {
    cx: 105, cy: 46, angle: -90, rBack: 30, rBelly: 30,
    reach: 44, skirtLen: 62, bandW: 24,
  });
  writePng(path.join(outDir, 'icon.png'), IW, IH, icon);
  console.log('tutu-pink/icon.png');
}
