// Shared plumbing for the per-frame overlay generators (gen-shoes, gen-tutu,
// gen-outfits): the dog silhouette test, body-edge scanning, preview
// composites, and the driver that paints one overlay per dog frame.
const fs = require('fs');
const path = require('path');
const { decodePng, writePng } = require('./pnglib.cjs');
const {
  DOG_SPRITE_DIR, DOG_BITE_SHEET, DOG_BITE_FRAMES, DOG_FRAME_W, DOG_FRAME_FILES,
} = require('../js/assets/dogFrames.js');

const ALPHA = 60;

// Opaque, and not the gray ground shadow (incl. its anti-aliased edges) or the
// low-saturation gradient backdrop of the flip frames; the dog's own blacks
// are darker (r < 60) and everything else is saturated.
function isBody(img, x, y, xOff = 0) {
  const i = ((y * img.w) + x + xOff) * 4;
  const [r, g, b, a] = [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2], img.rgba[i + 3]];
  if (a <= 150) return false;
  return !(Math.max(r, g, b) - Math.min(r, g, b) < 30 && r > 60);
}

// March from (cx, cy) along (px, py) * sign to the body edge, tolerating gaps
// up to maxGap px (highlight seams). The result is clamped to [min, max] so a
// limb or glow crossing the scan line can't balloon the fit.
function scanRadius(img, xOff, sliceW, cx, cy, px, py, sign, { maxT, maxGap, min, max, fallback }) {
  const W = sliceW ?? img.w;
  let last = 0, gap = 0;
  for (let t = 0; t <= maxT; t++) {
    const x = Math.round(cx + px * t * sign);
    const y = Math.round(cy + py * t * sign);
    if (x < 0 || x >= W || y < 0 || y >= img.h) break;
    if (isBody(img, x, y, xOff)) { last = t; gap = 0; }
    else if (++gap > maxGap) break;
  }
  return Math.min(max, Math.max(min, last || fallback));
}

// Overlay on top of base, cropped to the dog's bounding box, for eyeballing.
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

// Paints one full-size overlay per dog frame, plus the bite sheet, into
// outDir. paint(img, out, xOff, sliceW, frameKey) returns the painted pixel
// count; frameKey is the frame's file name, or `bite_<i>` for a sheet cell.
// onFrame(file, img, out) runs after each single frame is written.
function paintDogOverlays({ repo, outDir, previewDir, label, paint, onFrame }) {
  const src = file => path.join(repo, DOG_SPRITE_DIR, file);
  fs.mkdirSync(outDir, { recursive: true });
  if (previewDir) fs.mkdirSync(previewDir, { recursive: true });

  for (const files of Object.values(DOG_FRAME_FILES)) {
    for (const f of files) {
      const img = decodePng(src(f));
      const out = Buffer.alloc(img.w * img.h * 4);
      const n = paint(img, out, 0, null, f);
      writePng(path.join(outDir, f), img.w, img.h, out);
      console.log(`${label}/${f}: ${n} px`);
      if (onFrame) onFrame(f, img, out);
      if (previewDir) compositePreview(img, out, path.join(previewDir, `prev-${f}`));
    }
  }

  const bite = decodePng(src(DOG_BITE_SHEET));
  const out = Buffer.alloc(bite.w * bite.h * 4);
  for (let i = 0; i < DOG_BITE_FRAMES; i++) {
    const n = paint(bite, out, i * DOG_FRAME_W, DOG_FRAME_W, `bite_${i}`);
    console.log(`${label}/bite[${i}]: ${n} px`);
  }
  writePng(path.join(outDir, DOG_BITE_SHEET), bite.w, bite.h, out);
  if (previewDir) compositePreview(bite, out, path.join(previewDir, 'prev-bite.png'));
}

module.exports = { isBody, scanRadius, compositePreview, paintDogOverlays };
