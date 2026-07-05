// Sneaker overlay generator: for every dachshund frame, find the feet in the
// silhouette and emit a full-size transparent overlay PNG with the paws
// recolored as sneakers. Drawn with the same geometry as the base frame,
// so alignment is pixel-perfect in every pose.
// Usage: node gen-shoes.js <repoDir> [previewDir]
const fs = require('fs');
const path = require('path');
const { decodePng, writePng } = require('./pnglib.cjs');

const repo = process.argv[2] || '.';
const previewDir = process.argv[3] || null;
const dir = p => path.join(repo, p);

const ALPHA = 60;
function isBody(img, x, y, xOff = 0) {
  const i = ((y * img.w) + x + xOff) * 4;
  const [r, g, b, a] = [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2], img.rgba[i + 3]];
  if (a <= 150) return false;
  // exclude the gray ground shadow (incl. its anti-aliased edges); the dog's
  // own blacks are darker (r < 60) and everything else is saturated
  return !(Math.max(r, g, b) - Math.min(r, g, b) < 30 && r > 60);
}

// Paw detection: paws are SMALL isolated tan blobs. The chest, belly stripe
// and snout are also tan but much larger, and the paw blobs are separated
// from them by the dark leg outlines. Position-independent, so it works for
// airborne and flipped poses too.
function isTan(img, x, y, xOff) {
  const i = ((y * img.w) + x + xOff) * 4;
  const [r, g, b, a] = [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2], img.rgba[i + 3]];
  return a > 150 && r > 140 && g > 55 && g < 185 && b < 85 && r > g && g > b;
}
function detectFeet(img, xOff, sliceW, opts = {}) {
  const W = sliceW ?? img.w;
  const MIN = opts.minsize ?? 250, MAX = opts.maxsize ?? 3500;
  const seen = new Uint8Array(W * img.h);
  const blobs = [];
  for (let y = 0; y < img.h; y++) for (let x = 0; x < W; x++) {
    const idx = y * W + x;
    if (seen[idx] || !isTan(img, x, y, xOff)) continue;
    const stack = [idx], px = [];
    seen[idx] = 1;
    let minX = x, maxX = x, minY = y, maxY = y, sumX = 0, sumY = 0;
    while (stack.length) {
      const i = stack.pop();
      px.push(i);
      const iy = (i / W) | 0, ix = i % W;
      sumX += ix; sumY += iy;
      if (ix < minX) minX = ix; if (ix > maxX) maxX = ix;
      if (iy < minY) minY = iy; if (iy > maxY) maxY = iy;
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = iy + dy, nx = ix + dx;
        if (ny < 0 || ny >= img.h || nx < 0 || nx >= W) continue;
        const ni = ny * W + nx;
        if (!seen[ni] && isTan(img, nx, ny, xOff)) { seen[ni] = 1; stack.push(ni); }
      }
    }
    blobs.push({ area: px.length, minX, maxX, minY, maxY, cx: sumX / px.length, cy: sumY / px.length });
  }
  // paw-sized blobs only
  let paws = blobs.filter(b => b.area >= MIN && b.area <= MAX
    && (!opts.xmax || b.cx <= opts.xmax));
  // merge overlapping/nearby boxes (toe lines split a paw into fragments)
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < paws.length; i++) for (let j = i + 1; j < paws.length; j++) {
      const a = paws[i], b = paws[j];
      if (a.minX <= b.maxX + 18 && b.minX <= a.maxX + 18
        && a.minY <= b.maxY + 18 && b.minY <= a.maxY + 18) {
        paws[i] = {
          area: a.area + b.area,
          minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX),
          minY: Math.min(a.minY, b.minY), maxY: Math.max(a.maxY, b.maxY),
          cx: (a.cx * a.area + b.cx * b.area) / (a.area + b.area),
          cy: (a.cy * a.area + b.cy * b.area) / (a.area + b.area),
        };
        paws.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  return { paws, blobs };
}

const STYLES = {
  'sneakers-red':   { body: [217, 48, 48], shade: [160, 28, 28], sole: [245, 240, 230], outline: [70, 12, 12] },
  'sneakers-blue':  { body: [43, 92, 200], shade: [26, 60, 150], sole: [245, 240, 230], outline: [12, 26, 70] },
  'sneakers-green': { body: [46, 160, 67], shade: [27, 110, 45], sole: [245, 240, 230], outline: [10, 50, 18] },
  'sneakers-pink':  { body: [240, 110, 170], shade: [200, 70, 130], sole: [255, 255, 255], outline: [120, 30, 70] },
  'sneakers-gold':  { body: [255, 210, 25], shade: [225, 160, 0], sole: [255, 255, 255], outline: [120, 80, 0] },
  'sneakers-white': { body: [235, 235, 235], shade: [188, 188, 195], sole: [210, 60, 60], outline: [55, 55, 65] },
};
const SHOE_H = 42;   // how far the shoe reaches up the leg, sprite px
const SOLE_H = 12;

// Build overlay RGBA for one frame slice; returns count of shoe pixels.
function paintShoes(img, out, xOff, sliceW, styleName, opts) {
  const style = STYLES[styleName];
  const W = sliceW ?? img.w;
  const PAD = opts.pad ?? 8; // how far the shoe grows out from the tan paw pixels
  const inShoe = new Uint8Array(W * img.h);
  // Seed with the tan paw pixels inside each box, then dilate over body
  // pixels (wraps the dark paw outline) — keeps the shoe paw-shaped instead
  // of filling the whole box when legs overlap.
  const frontier = [];
  for (const [x0, y0, x1, y1] of opts.boxes || []) {
    for (let y = Math.max(0, y0); y <= Math.min(img.h - 1, y1); y++) {
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
        if (isTan(img, x, y, xOff) && !inShoe[y * W + x]) {
          inShoe[y * W + x] = 1;
          frontier.push(y * W + x);
        }
      }
    }
  }
  let cur = frontier;
  for (let step = 0; step < PAD && cur.length; step++) {
    const next = [];
    for (const i of cur) {
      const iy = (i / W) | 0, ix = i % W;
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = iy + dy, nx = ix + dx;
        if (ny < 0 || ny >= img.h || nx < 0 || nx >= W) continue;
        const ni = ny * W + nx;
        if (!inShoe[ni] && isBody(img, nx, ny, xOff)) { inShoe[ni] = 1; next.push(ni); }
      }
    }
    cur = next;
  }
  // label shoe components so sole/cuff bands are per-shoe, not per-column
  const label = new Int32Array(W * img.h).fill(-1);
  const compBox = [];
  for (let y = 0; y < img.h; y++) for (let x = 0; x < W; x++) {
    const idx = y * W + x;
    if (!inShoe[idx] || label[idx] >= 0) continue;
    const id = compBox.length;
    const box = { minY: y, maxY: y };
    compBox.push(box);
    const stack = [idx];
    label[idx] = id;
    while (stack.length) {
      const i = stack.pop();
      const iy = (i / W) | 0, ix = i % W;
      if (iy < box.minY) box.minY = iy;
      if (iy > box.maxY) box.maxY = iy;
      for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = iy + dy, nx = ix + dx;
        if (ny < 0 || ny >= img.h || nx < 0 || nx >= W) continue;
        const ni = ny * W + nx;
        if (inShoe[ni] && label[ni] < 0) { label[ni] = id; stack.push(ni); }
      }
    }
  }
  let count = 0;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < W; x++) {
      if (!inShoe[y * W + x]) continue;
      count++;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]];
      const isEdge = nb.some(([dy, dx]) => {
        const yy = y + dy, xx = x + dx;
        return yy < 0 || yy >= img.h || xx < 0 || xx >= W || !inShoe[yy * W + xx];
      });
      const box = compBox[label[y * W + x]];
      const h = box.maxY - box.minY + 1;
      let c;
      if (isEdge) c = style.outline;
      else if (y > box.maxY - Math.max(SOLE_H, h * 0.30)) c = style.sole;
      else if (y < box.minY + 6) c = style.shade;   // ankle cuff
      else c = style.body;
      const i = ((y * img.w) + x + xOff) * 4;
      out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; out[i + 3] = 255;
    }
  }
  return count;
}

const frames = {
  run: ['dachshund_run_00.png', 'dachshund_run_01.png', 'dachshund_run_02.png'],
  jump: ['dachshund_jump_00.png', 'dachshund_jump_01.png', 'dachshund_jump_02.png'],
  doublejump: ['dachshund_flip_00.png', 'dachshund_flip_01.png', 'dachshund_flip_02.png'],
  slide: ['dachshund_pancake_00.png', 'dachshund_pancake_01.png', 'dachshund_pancake_02.png'],
};

// Hand-picked paw bounding boxes per frame [x0,y0,x1,y1] in sprite px,
// chosen by eyeballing tan-blob candidates over every frame (the body's tan
// stripes and snout are paw-sized, so no automatic filter was reliable).
const OVERRIDES = {
  'dachshund_run_00.png': { boxes: [[92, 512, 127, 568], [153, 564, 193, 588], [286, 540, 345, 571], [304, 578, 334, 591]] },
  'dachshund_run_01.png': { boxes: [[63, 542, 97, 563], [265, 530, 341, 569], [331, 545, 373, 575]] },
  'dachshund_run_02.png': { boxes: [[0, 504, 44, 544], [255, 550, 317, 582]] },
  'dachshund_jump_00.png': { boxes: [[103, 505, 153, 567], [164, 536, 200, 570], [291, 498, 356, 525], [352, 500, 402, 549]] },
  'dachshund_jump_01.png': { boxes: [[36, 483, 88, 533], [91, 525, 132, 553], [251, 491, 334, 531], [337, 506, 372, 531]] },
  'dachshund_jump_02.png': { boxes: [[0, 534, 39, 581], [40, 573, 74, 590], [204, 522, 284, 553], [281, 528, 334, 573]] },
  'dachshund_flip_00.png': { pad: 4, boxes: [[179, 471, 212, 521], [205, 511, 234, 544], [238, 504, 278, 549], [275, 530, 305, 569]] },
  'dachshund_flip_01.png': { pad: 5, boxes: [[186, 366, 241, 391], [256, 393, 322, 420], [193, 407, 253, 434], [279, 456, 309, 475]] },
  'dachshund_flip_02.png': { pad: 4, boxes: [[188, 457, 245, 514], [171, 517, 191, 569], [203, 536, 232, 558], [273, 559, 308, 587]] },
  'dachshund_pancake_00.png': { boxes: [[116, 501, 153, 556], [195, 539, 237, 564], [270, 556, 319, 579]] },
  'dachshund_pancake_01.png': { boxes: [[62, 508, 94, 559], [150, 542, 195, 566], [227, 557, 278, 578]] },
  'dachshund_pancake_02.png': { boxes: [[30, 508, 72, 556], [87, 508, 113, 526], [115, 545, 193, 567], [215, 557, 277, 578]] },
  'bite_0': { boxes: [[109, 539, 148, 592], [196, 568, 249, 605], [265, 597, 328, 627], [315, 576, 342, 600], [369, 610, 408, 621]] },
  'bite_1': { boxes: [[100, 571, 136, 620], [135, 512, 163, 567], [200, 517, 261, 555], [253, 551, 308, 572]] },
  'bite_2': { boxes: [[116, 558, 159, 599], [203, 587, 256, 610], [275, 595, 325, 626]] },
};

function compositePreview(base, overlay, file) {
  // overlay on top of base, cropped to the dog bbox for eyeballing
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

for (const styleName of Object.keys(STYLES)) {
  const outDir = dir(`png/clothes/${styleName}`);
  fs.mkdirSync(outDir, { recursive: true });
  for (const [anim, files] of Object.entries(frames)) {
    files.forEach((f, i) => {
      const img = decodePng(dir('png/dachshund/' + f));
      const out = Buffer.alloc(img.w * img.h * 4);
      const n = paintShoes(img, out, 0, null, styleName, OVERRIDES[f] || {});
      const outFile = path.join(outDir, f);
      writePng(outFile, img.w, img.h, out);
      console.log(`${styleName}/${f}: ${n} shoe px`);
      if (f === 'dachshund_run_00.png') {
        // menu tile icon: crop the front shoe out of the run_00 overlay
        let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
        for (let y = 0; y < img.h; y++) for (let x = 270; x <= 365; x++) {
          if (out[(y * img.w + x) * 4 + 3] > 0) {
            minX = Math.min(minX, x); maxX = Math.max(maxX, x);
            minY = Math.min(minY, y); maxY = Math.max(maxY, y);
          }
        }
        const IW = maxX - minX + 1, IH = maxY - minY + 1;
        const icon = Buffer.alloc(IW * IH * 4);
        for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) {
          const si = ((y + minY) * img.w + x + minX) * 4, di = (y * IW + x) * 4;
          for (let k = 0; k < 4; k++) icon[di + k] = out[si + k];
        }
        writePng(path.join(outDir, 'icon.png'), IW, IH, icon);
      }
      if (previewDir && styleName === 'sneakers-red') {
        compositePreview(img, out, path.join(previewDir, `prev-${f}`));
      }
    });
  }
  // bite sheet: 3 frames side by side
  const bite = decodePng(dir('png/dachshund/bite_3_image_sequence.png'));
  const out = Buffer.alloc(bite.w * bite.h * 4);
  for (let i = 0; i < 3; i++) {
    const n = paintShoes(bite, out, i * 512, 512, styleName, OVERRIDES['bite_' + i] || {});
    console.log(`${styleName}/bite[${i}]: ${n} shoe px`);
  }
  writePng(path.join(outDir, 'bite_3_image_sequence.png'), bite.w, bite.h, out);
  if (previewDir && styleName === 'sneakers-red') {
    compositePreview(bite, out, path.join(previewDir, 'prev-bite.png'));
  }
}
