#!/usr/bin/env bash
# Derive the in-game bird frames from png/bird/bird_spritesheet.jpg (3000x2000,
# six 1000x1000 cells, top-left -> bottom-right, bird facing right on a
# near-white background). Requires ImageMagick 7.
#
# Per frame:
#   1. crop the cell
#   2. key out the background (corner flood fill; interior whites survive)
#   3. mirror so the bird faces left (obstacles fly toward the dog)
#   4. row 2 cells sit 204px higher than row 1 — splice pushes them down so
#      the talons share one baseline (y=814 in cell space) across all frames
#   5. crop to the union content box (918x900, y=150), with a per-column x
#      origin (43 + 33*col): the artist also shifted the bird ~33px right per
#      column, which read as horizontal jitter until normalized (measured via
#      the eye-white centroid: constant y, x sawtooth of ~8.3px at 230 scale).
#      Feet baseline = (814-150)/900 = 0.738 of the frame height.
#   6. downscale to 230x225 (game draws ~56 logical px wide)
#
# Usage: tools/gen-bird-frames.sh   (from the repo root)
set -euo pipefail

OUT=png/bird
SRC="$OUT/bird_spritesheet.jpg"
mkdir -p "$OUT"

for i in 0 1 2 3 4 5; do
  col=$((i % 3)); row=$((i / 3))
  splice=$((row == 1 ? 204 : 0))
  cropx=$((43 + col * 33))
  magick "$SRC" -crop "1000x1000+$((col * 1000))+$((row * 1000))" +repage \
    -alpha set -fuzz 6% -fill none \
    -draw 'color 0,0 floodfill' -draw 'color 999,0 floodfill' \
    -draw 'color 0,999 floodfill' -draw 'color 999,999 floodfill' \
    -flop \
    -background none -splice "0x${splice}" \
    -crop "918x900+${cropx}+150" +repage -background none -extent 918x900 \
    -resize '230x225!' \
    "$OUT/bird_fly_0${i}.png"
  echo "wrote $OUT/bird_fly_0${i}.png"
done
