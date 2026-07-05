// Tutu overlay generator: for every dachshund frame, paint a ballet tutu
// around the dog's waist — a satin band perpendicular to the spine plus tulle
// frills flaring out past the back and belly, skirt sweeping toward the tail
// (a human tutu rotated 90° clockwise onto the horizontal dog). Emits one
// full-size transparent overlay PNG per frame, drawn with the same geometry
// as the base frame, so alignment is pixel-perfect in every pose.
// Usage: node gen-tutu.cjs <repoDir> [previewDir]
const fs = require('fs');
const path = require('path');
const { decodePng, writePng } = require('./pnglib.cjs');

const repo = process.argv[2] || '.';
const previewDir = process.argv[3] || null;
const dir = p => path.join(repo, p);

const ALPHA = 60;
// Same silhouette test as gen-shoes: opaque, and not the gray ground shadow /
// gradient backdrop (the flip frames have opaque low-saturation backgrounds).
function isBody(img, x, y, xOff = 0) {
  const i = ((y * img.w) + x + xOff) * 4;
  const [r, g, b, a] = [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2], img.rgba[i + 3]];
  if (a <= 150) return false;
  return !(Math.max(r, g, b) - Math.min(r, g, b) < 30 && r > 60);
}

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

// March from the waist center along the spine-perpendicular to find the body
// edge (small gaps tolerated for highlight seams); clamped so glow effects in
// the flip frames can't balloon the fit.
function scanRadius(img, xOff, sliceW, cx, cy, px, py, sign) {
  const W = sliceW ?? img.w;
  let last = 0, gap = 0;
  for (let t = 0; t <= 140; t++) {
    const x = Math.round(cx + px * t * sign);
    const y = Math.round(cy + py * t * sign);
    if (x < 0 || x >= W || y < 0 || y >= img.h) break;
    if (isBody(img, x, y, xOff)) { last = t; gap = 0; }
    else if (++gap > 10) break;
  }
  return Math.min(95, Math.max(35, last || 55));
}

const tri = x => Math.abs(x - Math.floor(x) - 0.5) * 2; // triangle wave 0..1

// Paint one tutu into `out` (full-image RGBA buffer); returns painted px count.
function paintTutu(img, out, xOff, sliceW, spec) {
  const W = sliceW ?? img.w;
  const p = { ...DEFAULTS, ...spec };
  const rad = p.angle * Math.PI / 180;
  const ax = Math.cos(rad), ay = Math.sin(rad);   // spine axis, toward head
  const px = -Math.sin(rad), py = Math.cos(rad);  // perpendicular, belly side +
  const rBack = p.rBack ?? scanRadius(img, xOff, sliceW, p.cx, p.cy, px, py, -1);
  const rBelly = p.rBelly ?? scanRadius(img, xOff, sliceW, p.cx, p.cy, px, py, 1);
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

function compositePreview(base, overlay, file) {
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
  for (let y = 0; y < base.h; y++) for (let x = 0; x < base.w; x++) {
    if (base.rgba[(y * base.w + x) * 4 + 3] > ALPHA) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  const W = maxX - minX + 1, H = maxY - minY + 1;
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const si = ((y + minY) * base.w + x + minX) * 4;
    const di = (y * W + x) * 4;
    const src = overlay[si + 3] > 0 ? overlay : base.rgba;
    out[di] = src[si]; out[di + 1] = src[si + 1]; out[di + 2] = src[si + 2]; out[di + 3] = src[si + 3];
  }
  writePng(file, W, H, out);
}

const frames = {
  run: ['dachshund_run_00.png', 'dachshund_run_01.png', 'dachshund_run_02.png'],
  jump: ['dachshund_jump_00.png', 'dachshund_jump_01.png', 'dachshund_jump_02.png'],
  doublejump: ['dachshund_flip_00.png', 'dachshund_flip_01.png', 'dachshund_flip_02.png'],
  slide: ['dachshund_pancake_00.png', 'dachshund_pancake_01.png', 'dachshund_pancake_02.png'],
};

const outDir = dir('png/body/tutu-pink');
fs.mkdirSync(outDir, { recursive: true });
if (previewDir) fs.mkdirSync(previewDir, { recursive: true });

for (const files of Object.values(frames)) {
  for (const f of files) {
    const img = decodePng(dir('png/dachshund/' + f));
    const out = Buffer.alloc(img.w * img.h * 4);
    const n = paintTutu(img, out, 0, null, SPECS[f]);
    writePng(path.join(outDir, f), img.w, img.h, out);
    console.log(`tutu-pink/${f}: ${n} px`);
    if (previewDir) compositePreview(img, out, path.join(previewDir, `prev-${f}`));
  }
}

// bite sheet: 3 frames side by side
const bite = decodePng(dir('png/dachshund/bite_3_image_sequence.png'));
const biteOut = Buffer.alloc(bite.w * bite.h * 4);
for (let i = 0; i < 3; i++) {
  const n = paintTutu(bite, biteOut, i * 512, 512, SPECS['bite_' + i]);
  console.log(`tutu-pink/bite[${i}]: ${n} px`);
}
writePng(path.join(outDir, 'bite_3_image_sequence.png'), bite.w, bite.h, biteOut);
if (previewDir) compositePreview(bite, biteOut, path.join(previewDir, 'prev-bite.png'));

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
