// Image loading helpers. loadImage/loadImages are browser-only;
// isImageReady is safe anywhere.

export function isImageReady(img) {
  return Boolean(img && img.complete && img.naturalWidth);
}

export function loadImage(src, onSettled) {
  const img = new Image();
  if (onSettled) img.onload = img.onerror = onSettled;
  img.src = src;
  return img;
}

// Loads every path; onAllSettled fires once each has loaded or failed.
export function loadImages(paths, onAllSettled) {
  let pending = paths.length;
  return paths.map(src => loadImage(src, () => { if (--pending === 0) onAllSettled(); }));
}
