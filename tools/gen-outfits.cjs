// Neck-outfit overlay generator: bandana, hero cape, and studded collar.
// Three distinct body-slot items (not recolors) painted around a hand-picked
// per-frame NECK anchor, the same per-frame-overlay pipeline as gen-tutu:
// one full-size transparent PNG per dachshund frame (plus the bite sheet and
// a menu icon), drawn with the base frame's exact geometry so alignment is
// pixel-perfect in every pose.
// Usage: node gen-outfits.cjs <repoDir> [previewDir]
const fs = require('fs');
const path = require('path');
const { decodePng, writePng } = require('./pnglib.cjs');

const repo = process.argv[2] || '.';
const previewDir = process.argv[3] || null;
const dir = p => path.join(repo, p);

const ALPHA = 60;
// Same silhouette test as gen-shoes/gen-tutu: opaque, and not the gray ground
// shadow / low-saturation gradient backdrop of the flip frames.
function isBody(img, x, y, xOff = 0) {
  const i = ((y * img.w) + x + xOff) * 4;
  const [r, g, b, a] = [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2], img.rgba[i + 3]];
  if (a <= 150) return false;
  return !(Math.max(r, g, b) - Math.min(r, g, b) < 30 && r > 60);
}

// March from the neck center along the neck-perpendicular to find the body
// edge (small gaps tolerated for highlight seams); clamped to neck-ish radii
// so ears/legs crossing the scan line can't balloon the fit.
function scanRadius(img, xOff, sliceW, cx, cy, px, py, sign) {
  const W = sliceW ?? img.w;
  let last = 0, gap = 0;
  for (let t = 0; t <= 110; t++) {
    const x = Math.round(cx + px * t * sign);
    const y = Math.round(cy + py * t * sign);
    if (x < 0 || x >= W || y < 0 || y >= img.h) break;
    if (isBody(img, x, y, xOff)) { last = t; gap = 0; }
    else if (++gap > 8) break;
  }
  return Math.min(62, Math.max(26, last || 45));
}

const tri = x => Math.abs(x - Math.floor(x) - 0.5) * 2; // triangle wave 0..1

// Hand-picked neck anchor per frame: cx/cy at the middle of the neck (between
// skull and shoulders), angle = neck axis direction toward the head (deg,
// screen coords, +y down). rTop/rBot (center -> silhouette edge, back-of-neck
// and throat side) are refined by scanning the sprite; override when glow
// effects or a crossing ear confuse the scan. Per-item overrides nest under
// `cape` / `bandana` / `collar`.
const GROUND = { bandana: { drop: 32 }, collar: { tag: false }, cape: { L: 110, billow: 10, wDrop: 12 } };
const SPECS = {
  'dachshund_run_00.png':     { cx: 318, cy: 492, angle: -70, rTop: 40, rBot: 36 },
  'dachshund_run_01.png':     { cx: 285, cy: 495, angle: -65, rTop: 42, rBot: 40 },
  'dachshund_run_02.png':     { cx: 270, cy: 497, angle: -65, rTop: 42, rBot: 40 },
  'dachshund_jump_00.png':    { cx: 318, cy: 448, angle: -70, rTop: 45, rBot: 38 },
  'dachshund_jump_01.png':    { cx: 296, cy: 462, angle: -68, rTop: 45, rBot: 40 },
  'dachshund_jump_02.png':    { cx: 248, cy: 495, angle: -55, rTop: 45, rBot: 44, bandana: { drop: 40 } },
  // tumbling frames: bandana kerchief hangs on the ground side (gravity beats
  // anatomy for one-frame poses), capes fly off the arc of the flip
  'dachshund_flip_00.png':    { cx: 360, cy: 498, angle: 18, rTop: 42, rBot: 48, bandana: { drop: 40 }, cape: { capeAngle: 200, L: 120 } },
  'dachshund_flip_01.png':    { cx: 292, cy: 488, angle: 30, rTop: 42, rBot: 46, bandana: { drop: 38 }, cape: { flip: true, capeAngle: 60, L: 110, billow: 16 } },
  'dachshund_flip_02.png':    { cx: 315, cy: 508, angle: 14, rTop: 42, rBot: 48, bandana: { drop: 40 }, cape: { capeAngle: 215, L: 120 } },
  'dachshund_pancake_00.png': { cx: 330, cy: 520, angle: -14, ...GROUND },
  'dachshund_pancake_01.png': { cx: 295, cy: 528, angle: -10, ...GROUND },
  'dachshund_pancake_02.png': { cx: 288, cy: 532, angle: -8, ...GROUND },
  'bite_0': { cx: 268, cy: 548, angle: -55, rTop: 40, rBot: 48, ...GROUND },
  'bite_1': { cx: 248, cy: 480, angle: -62, rTop: 42, rBot: 46, cape: { capeAngle: 195 } },
  'bite_2': { cx: 288, cy: 562, angle: -10, ...GROUND },
};

// ---------------------------------------------------------------------------
// Shared rasterizer: classify(dx, dy) -> region id (0 = none); paints COLORS
// with a dark outline wherever a painted pixel borders empty space. Region ids
// in `clampRegions` only paint on body pixels (bands wrap the neck, so they
// must end exactly at the silhouette instead of overshooting past the ears).
function paintRegions(img, out, xOff, sliceW, cx, cy, S, classify, COLORS, outlineColor, clampRegions) {
  const W = sliceW ?? img.w;
  const x0 = Math.max(0, Math.round(cx - S)), x1 = Math.min(W - 1, Math.round(cx + S));
  const y0 = Math.max(0, Math.round(cy - S)), y1 = Math.min(img.h - 1, Math.round(cy + S));
  const bw = x1 - x0 + 1;
  const region = new Uint8Array(bw * (y1 - y0 + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let r = classify(x - cx, y - cy);
      if (r && clampRegions && clampRegions.has(r) && !isBody(img, x, y, xOff)) r = 0;
      region[(y - y0) * bw + (x - x0)] = r;
    }
  }
  const at = (x, y) => (x < x0 || x > x1 || y < y0 || y > y1) ? 0 : region[(y - y0) * bw + (x - x0)];
  let count = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const r = at(x, y);
      if (!r) continue;
      count++;
      let c = COLORS[r];
      let edge = false;
      for (let dy = -2; dy <= 2 && !edge; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 2) continue;
        if (at(x + dx, y + dy) === 0) { edge = true; break; }
      }
      if (edge) c = outlineColor;
      const i = ((y * img.w) + x + xOff) * 4;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
    }
  }
  return count;
}

// Neck frame from a spec: unit axis toward the head (ax, ay) and the
// perpendicular (px, py) pointing to the throat/chest side.
function neckFrame(img, xOff, sliceW, spec) {
  const rad = spec.angle * Math.PI / 180;
  const ax = Math.cos(rad), ay = Math.sin(rad);
  let px = -Math.sin(rad), py = Math.cos(rad);
  if (spec.flip) { px = -px; py = -py; } // belly-up pose: throat side is inverted
  const rTop = spec.rTop ?? scanRadius(img, xOff, sliceW, spec.cx, spec.cy, px, py, -1);
  const rBot = spec.rBot ?? scanRadius(img, xOff, sliceW, spec.cx, spec.cy, px, py, 1);
  return { ax, ay, px, py, rTop, rBot };
}

// ---------------------------------------------------------------------------
// BANDANA: rolled band around the neck, knot at the back of the neck, and a
// polka-dot kerchief triangle draping down over the chest side.
const BANDANA_COLORS = [null,
  [206, 44, 50],    // 1 kerchief
  [246, 240, 232],  // 2 polka dot
  [176, 30, 38],    // 3 band (rolled edge, darker)
  [222, 74, 78],    // 4 band highlight
  [176, 30, 38],    // 5 knot
];
const BANDANA_OUTLINE = [66, 10, 14];

function bandanaClassify(img, xOff, sliceW, spec) {
  // per-item overrides may also replace anchor fields (cx/cy/angle/rTop/rBot)
  spec = { ...spec, ...(spec.bandana || {}) };
  const p = { bandW: 22, drop: 52, triHalf: 42, knotR: 12, drapeAngle: 100, ...(spec.bandana || {}) };
  const { ax, ay, px, py, rTop, rBot } = neckFrame(img, xOff, sliceW, spec);
  // kerchief hangs from the throat end of the band, draping in screen space
  // (drapeAngle deg; 90 = straight down, >90 sags tail-ward)
  const Ax = px * (rBot - 4) + ax * (p.bandW / 2);
  const Ay = py * (rBot - 4) + ay * (p.bandW / 2);
  const grad = p.drapeAngle * Math.PI / 180;
  const gx = Math.cos(grad), gy = Math.sin(grad);
  const hx = -gy, hy = gx; // across the kerchief
  return (dx, dy) => {
    const du = dx * ax + dy * ay, dv = dx * px + dy * py;
    // knot: a small bump sitting on the back of the neck
    const kdu = du - p.bandW / 2, kdv = dv + rTop + 3;
    if (kdu * kdu + kdv * kdv <= p.knotR * p.knotR) return 5;
    // rolled band hugging the silhouette
    const r = dv < 0 ? rTop : rBot;
    if (du >= 0 && du <= p.bandW && Math.abs(dv) <= r + 3) {
      return (du >= p.bandW * 0.30 && du <= p.bandW * 0.62) ? 4 : 3;
    }
    // kerchief triangle: s down the drape, w across, tapering to the tip
    const s = (dx - Ax) * gx + (dy - Ay) * gy;
    const w = (dx - Ax) * hx + (dy - Ay) * hy;
    if (s >= -10 && s <= p.drop) {
      const f = Math.max(0, s / p.drop);
      if (Math.abs(w) <= p.triHalf * (1 - f) + 4) {
        // staggered polka dots in cloth space
        const row = Math.floor(s / 19);
        const u = w - (row % 2 ? 9.5 : 0);
        const cu = u - Math.round(u / 19) * 19;
        const cv = s - (row + 0.5) * 19;
        if (cu * cu + cv * cv <= 4.6 * 4.6) return 2;
        return 1;
      }
    }
    return 0;
  };
}

// ---------------------------------------------------------------------------
// CAPE: gold tie around the neck, knot at the back of the neck, royal-blue
// cloth billowing from the shoulders toward the tail with a wavy gold hem.
// The cloth is painted in screen space from an attach point at the top of the
// neck, so per-frame `capeAngle` (deg, screen) sets the flow direction.
const CAPE_COLORS = [null,
  [52, 86, 196],   // 1 cloth
  [34, 60, 150],   // 2 fold shading
  [236, 192, 70],  // 3 hem trim
  [222, 172, 52],  // 4 knot
  [222, 172, 52],  // 5 neck tie
];
const CAPE_OUTLINE = [13, 24, 72];

function capeClassify(img, xOff, sliceW, spec) {
  spec = { ...spec, ...(spec.cape || {}) };
  const p = {
    capeAngle: 172, L: 145, w0: 18, w1: 55, billow: 24, wDrop: 26,
    waveDepth: 16, wavePeriod: 26, tieW: 8, knotR: 9,
    tieLean: 2, // cape tie only: +2° vs anchor (half of wrong-way steepen, reversed)
    ...(spec.cape || {}),
  };
  const { ax, ay, px, py, rTop, rBot } = neckFrame(img, xOff, sliceW, spec);
  const tieAngle = spec.cape?.tieAngle ?? spec.angle + p.tieLean;
  const { ax: tax, ay: tay, px: tpx, py: tpy, rTop: tTop, rBot: tBot } =
    neckFrame(img, xOff, sliceW, { ...spec, angle: tieAngle });
  // attach point: top of the neck (screen coords relative to the anchor)
  const Ax = -px * (rTop + 2), Ay = -py * (rTop + 2);
  const crad = p.capeAngle * Math.PI / 180;
  const cx_ = Math.cos(crad), cy_ = Math.sin(crad); // flow direction
  const qx = -cy_, qy = cx_;                        // cloth-width direction
  return (dx, dy) => {
    // knot at the attach point
    const kdx = dx - Ax, kdy = dy - Ay;
    if (kdx * kdx + kdy * kdy <= p.knotR * p.knotR) return 4;
    // thin tie band around the neck (body-clamped; cape-only axis tweak)
    const du = dx * tax + dy * tay, dv = dx * tpx + dy * tpy;
    const r = dv < 0 ? tTop : tBot;
    if (du >= 0 && du <= p.tieW && Math.abs(dv) <= r + 2) return 5;
    // cloth: distance s along the flow, w across it, billowing centerline
    const s = kdx * cx_ + kdy * cy_;
    if (s < -4 || s > p.L) return 0;
    const t = Math.max(0, Math.min(1, s / p.L));
    const center = p.billow * t * t; // lifts the hem end upward (+q)
    const half = p.w0 + (p.w1 - p.w0) * t;
    // asymmetric width: the top edge (+q, away from the ground) stays put,
    // the low side gets wDrop extra so the cloth drapes down the flank
    const wDown = half + p.wDrop * Math.min(1, t * 2.5);
    const wRel = kdx * qx + kdy * qy - center;
    if (wRel > half || wRel < -wDown) return 0;
    const hem = p.L - p.waveDepth * tri(wRel / p.wavePeriod); // wavy trailing edge
    if (s > hem) return 0;
    if (s > hem - 13) return 3;
    // radial fold shading across the cloth
    const k = (wRel + wDown) / (half + wDown) * 3.5;
    if (t > 0.18 && Math.abs(k - Math.round(k)) < 0.11) return 2;
    return 1;
  };
}

// ---------------------------------------------------------------------------
// COLLAR: emerald leather band with silver studs and a gold tag on a ring
// hanging at the throat.
const COLLAR_COLORS = [null,
  [24, 138, 82],    // 1 leather
  [216, 220, 228],  // 2 stud
  [148, 152, 162],  // 3 ring
  [238, 194, 62],   // 4 tag
  [252, 226, 130],  // 5 tag shine
];
const COLLAR_OUTLINE = [12, 46, 30];

function collarClassify(img, xOff, sliceW, spec) {
  spec = { ...spec, ...(spec.collar || {}) };
  const p = { bandW: 17, studR: 4.4, studGap: 24, tagR: 12, tag: true, drop: 6, ...(spec.collar || {}) };
  const { ax, ay, px, py, rTop, rBot } = neckFrame(img, xOff, sliceW, spec);
  return (dx, dy) => {
    dy -= p.drop; // collar-only: shift whole item down (+y screen)
    const du = dx * ax + dy * ay, dv = dx * px + dy * py;
    const r = dv < 0 ? rTop : rBot;
    if (du >= 0 && du <= p.bandW && Math.abs(dv) <= r + 3) {
      // studs along the band midline
      const sdu = du - p.bandW / 2;
      const sdv = dv - Math.round(dv / p.studGap) * p.studGap;
      if (sdu * sdu + sdv * sdv <= p.studR * p.studR) return 2;
      return 1;
    }
    if (!p.tag) return 0; // ground poses: no dangling ring/tag
    // ring + tag hang straight down (screen space) from the throat end
    const Tx = ax * (p.bandW / 2) + px * (rBot - 2);
    const Ty = ay * (p.bandW / 2) + py * (rBot - 2);
    const rdx = dx - Tx, rdy = dy - Ty;
    if (Math.abs(rdx) <= 3 && rdy >= 2 && rdy <= 9) return 3;
    // round gold tag with a shine spot
    const tdx = rdx, tdy = rdy - (9 + p.tagR);
    if (tdx * tdx + tdy * tdy <= p.tagR * p.tagR) {
      const hdx = tdx + p.tagR * 0.35, hdy = tdy + p.tagR * 0.35;
      return (hdx * hdx + hdy * hdy <= (p.tagR * 0.32) ** 2) ? 5 : 4;
    }
    return 0;
  };
}

// ---------------------------------------------------------------------------
const ITEMS = {
  'bandana-red':  { classify: bandanaClassify, colors: BANDANA_COLORS, outline: BANDANA_OUTLINE, S: 170, clamp: new Set([3, 4]) },
  'cape-hero':    { classify: capeClassify,    colors: CAPE_COLORS,    outline: CAPE_OUTLINE,    S: 260, clamp: new Set([5]) },
  'collar-green': { classify: collarClassify,  colors: COLLAR_COLORS,  outline: COLLAR_OUTLINE,  S: 130, clamp: new Set([1, 2]) },
};

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

for (const [itemId, item] of Object.entries(ITEMS)) {
  const outDir = dir(`png/body/${itemId}`);
  fs.mkdirSync(outDir, { recursive: true });
  const prevDir = previewDir ? path.join(previewDir, itemId) : null;
  if (prevDir) fs.mkdirSync(prevDir, { recursive: true });

  for (const files of Object.values(frames)) {
    for (const f of files) {
      const img = decodePng(dir('png/dachshund/' + f));
      const out = Buffer.alloc(img.w * img.h * 4);
      const spec = SPECS[f];
      const n = paintRegions(img, out, 0, null, spec.cx, spec.cy, item.S,
        item.classify(img, 0, null, spec), item.colors, item.outline, item.clamp);
      writePng(path.join(outDir, f), img.w, img.h, out);
      console.log(`${itemId}/${f}: ${n} px`);
      if (prevDir) compositePreview(img, out, path.join(prevDir, `prev-${f}`));
    }
  }

  // bite sheet: 3 frames side by side
  const bite = decodePng(dir('png/dachshund/bite_3_image_sequence.png'));
  const biteOut = Buffer.alloc(bite.w * bite.h * 4);
  for (let i = 0; i < 3; i++) {
    const spec = SPECS['bite_' + i];
    const n = paintRegions(bite, biteOut, i * 512, 512, spec.cx, spec.cy, item.S,
      item.classify(bite, i * 512, 512, spec), item.colors, item.outline, item.clamp);
    console.log(`${itemId}/bite[${i}]: ${n} px`);
  }
  writePng(path.join(outDir, 'bite_3_image_sequence.png'), bite.w, bite.h, biteOut);
  if (prevDir) compositePreview(bite, biteOut, path.join(prevDir, 'prev-bite.png'));
}

// ---------------------------------------------------------------------------
// Menu tile icons: bespoke upright renders in plain screen space.
function writeIcon(itemId, IW, IH, classify, colors, outline) {
  const fake = { w: IW, h: IH, rgba: Buffer.alloc(IW * IH * 4) };
  const icon = Buffer.alloc(IW * IH * 4);
  paintRegions(fake, icon, 0, null, IW / 2, IH / 2, Math.max(IW, IH), classify, colors, outline);
  writePng(path.join(dir(`png/body/${itemId}`), 'icon.png'), IW, IH, icon);
  console.log(`${itemId}/icon.png`);
}

// bandana icon: horizontal band with a dotted triangle hanging below
writeIcon('bandana-red', 200, 170, (dx, dy) => {
  const x = dx + 100, y = dy + 85;
  if (y >= 18 && y <= 42 && x >= 24 && x <= 176) return (y >= 24 && y <= 32) ? 4 : 3;
  if (y > 42 && y <= 150) {
    const f = (y - 42) / 108;
    if (Math.abs(x - 100) <= 62 * (1 - f) + 3) {
      const row = Math.floor(y / 22);
      const u = x - (row % 2 ? 11 : 0);
      const cu = u - Math.round(u / 22) * 22;
      const cv = y - (row + 0.5) * 22;
      if (cu * cu + cv * cv <= 5.2 * 5.2) return 2;
      return 1;
    }
  }
  return 0;
}, BANDANA_COLORS, BANDANA_OUTLINE);

// cape icon: knot at the top, cloth flowing straight down with a wavy hem
writeIcon('cape-hero', 200, 190, (dx, dy) => {
  const x = dx + 100, y = dy + 95;
  const kdx = x - 100, kdy = y - 22;
  if (kdx * kdx + kdy * kdy <= 13 * 13) return 4;
  const s = y - 30;
  if (s < 0 || s > 140) return 0;
  const t = s / 140;
  const half = 26 + 52 * t;
  if (Math.abs(x - 100) > half) return 0;
  const hem = 140 - 14 * tri((x - 100) / 30);
  if (s > hem) return 0;
  if (s > hem - 14) return 3;
  const k = ((x - 100) / half + 1) / 2 * 3.5;
  if (t > 0.18 && Math.abs(k - Math.round(k)) < 0.11) return 2;
  return 1;
}, CAPE_COLORS, CAPE_OUTLINE);

// collar icon: horizontal studded band with the ring + tag hanging below
writeIcon('collar-green', 200, 170, (dx, dy) => {
  const x = dx + 100, y = dy + 85;
  if (y >= 22 && y <= 54 && x >= 22 && x <= 178) {
    const sdv = y - 38;
    const sdu = x - Math.round(x / 34) * 34;
    if (sdu * sdu + sdv * sdv <= 6.5 * 6.5) return 2;
    return 1;
  }
  if (Math.abs(x - 100) <= 4 && y > 54 && y <= 70) return 3;
  const tdx = x - 100, tdy = y - 70 - 24;
  if (tdx * tdx + tdy * tdy <= 24 * 24) {
    const hdx = tdx + 8, hdy = tdy + 8;
    return (hdx * hdx + hdy * hdy <= 7.5 * 7.5) ? 5 : 4;
  }
  return 0;
}, COLLAR_COLORS, COLLAR_OUTLINE);
