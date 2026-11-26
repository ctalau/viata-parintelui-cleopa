// Small painting helpers shared by the 2D engine: a soft storybook palette, colour shading, seeded noise.
// Pure (no DOM state): every drawing is a function of its inputs.

// Soft, warm colours for a gentle hand-drawn look (names match the 3D palette, so a look reads the same in both engines).
export const PAL = {
  white: '#fbf7ee', black: '#2b2622', darkGray: '#5d5a5f', gray: '#9a9aa0', lightGray: '#cfcfd2',
  red: '#d4473b', darkRed: '#a8343a', orange: '#f29a4a', yellow: '#f6d26a', brightYellow: '#fde68a',
  gold: '#e4b34a', tan: '#e3cc9c', darkTan: '#a8946e', sand: '#f2dcab', cream: '#f8efd9', brown: '#7b5236',
  reddishBrown: '#9a5638', darkBrown: '#5a4030', nougat: '#d9a072', lightNougat: '#f5d9b8',
  skin: '#f7d2b0', lightSkin: '#fbe0c6', tanSkin: '#e2b58c', darkSkin: '#a87253', yellowSkin: '#f7d2b0',
  green: '#4f9a5c', brightGreen: '#7cbf6a', lime: '#c4e07a', darkGreen: '#2f6b4a', oliveGreen: '#9c9a62',
  blue: '#4a78c4', darkBlue: '#34507f', mediumBlue: '#79a6dc', skyBlue: '#a9d8f2', azure: '#5bbfcc',
  purple: '#8a4f9c', magenta: '#b0558e', lavender: '#cdb8e8', pink: '#f6a9bb', plum: '#7a4a6e',
  darkOrange: '#c97a3c', terracotta: '#cf7f57', rose: '#e8a3a0', teal: '#3f8f8f', navy: '#2f4568',
};
export let INK = '#4a3528';   // outlines: a warm dark brown, never pure black (softer, kinder)
/** change the outline colour while one figure is drawn (look.ink); returns the previous one to restore */
export function setInk(c) { const o = INK; INK = c; return o; }

export function hexToRgb(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const toHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
/** colour name | '#rrggbb' | number → '#rrggbb' */
export function col(c, fallback = '#c0a080') {
  if (c == null) return fallback;
  if (typeof c === 'number') return '#' + c.toString(16).padStart(6, '0');
  if (c.startsWith('#')) return c;
  return PAL[c] || fallback;
}
/** k > 0 lightens towards white, k < 0 darkens (towards a warm brown, not grey) */
export function shade(c, k) {
  const [r, g, b] = hexToRgb(col(c));
  if (k >= 0) return toHex(r + (255 - r) * k, g + (250 - g) * k, b + (240 - b) * k);
  const t = -k;
  return toHex(r * (1 - t) + 40 * t, g * (1 - t) + 24 * t, b * (1 - t) + 20 * t);
}
export function mix(a, b, k) {
  const A = hexToRgb(col(a)), B = hexToRgb(col(b));
  return toHex(A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k);
}
export function rgba(c, a) { const [r, g, b] = hexToRgb(col(c)); return `rgba(${r},${g},${b},${a})`; }

/** deterministic RNG (mulberry32) */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** smooth 1D value noise, deterministic */
export function noise1(x, seed = 0) {
  const h = (i) => { let n = Math.imul((i + seed * 7919) | 0, 374761393) ^ 0x5bd1e995; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}

/** closed smooth blob through points (Catmull-Rom → Bézier) */
export function blob(g, pts, tension = 0.5) {
  const n = pts.length;
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * tension / 3, p1[1] + (p2[1] - p0[1]) * tension / 3,
      p2[0] - (p3[0] - p1[0]) * tension / 3, p2[1] - (p3[1] - p1[1]) * tension / 3, p2[0], p2[1]);
  }
  g.closePath();
}
/** open smooth curve through points */
export function curve(g, pts, tension = 0.5) {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * tension / 3, p1[1] + (p2[1] - p0[1]) * tension / 3,
      p2[0] - (p3[0] - p1[0]) * tension / 3, p2[1] - (p3[1] - p1[1]) * tension / 3, p2[0], p2[1]);
  }
}
/** fill + soft outline in the current path */
export function inked(g, fill, lw, ink = INK) {
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) { g.lineWidth = lw; g.strokeStyle = ink; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); }
}
export function ellipse(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, Math.max(1e-4, Math.abs(rx)), Math.max(1e-4, Math.abs(ry)), rot, 0, Math.PI * 2); }
