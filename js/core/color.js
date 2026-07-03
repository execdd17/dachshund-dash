// Pure color helpers.

export function lerpColor(hex1, hex2, t) {
  const parse = (hex) => {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255,
    ];
  };
  const [r1, g1, b1] = parse(hex1);
  const [r2, g2, b2] = parse(hex2);
  const r = Math.round((r1 + (r2 - r1) * t) * 255);
  const g = Math.round((g1 + (g2 - g1) * t) * 255);
  const b = Math.round((b1 + (b2 - b1) * t) * 255);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}
