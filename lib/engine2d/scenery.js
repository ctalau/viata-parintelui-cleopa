// Painted 2D scenery for the "2d" engine: sky, far mountains and dunes (parallax layers), the sandy ground,
// buildings, palms, little stones — and the props. Drawn with the stage camera's projection `P(x, y, z) → [X, Y, s]`
// (s = pixels per stud at that depth). All pure functions of (layout, set options, camera, t).
import { col, shade, mix, rgba, INK, rng, noise1, blob, curve, inked, ellipse } from './paint.js';
import { hermitageSprites, wisps } from './hermitage.js';

export const SKIES2D = {
  morning: { top: '#8cc8ef', mid: '#cfe7f5', bottom: '#ffe3c4', sun: [0.18, 0.3], sunC: '#fff4d6', glow: 'rgba(255,226,170,0.55)', haze: '#f6e3d2', tint: null, light: 1 },
  day: { top: '#6ab6ee', mid: '#a9d6f5', bottom: '#e6f4fb', sun: [0.82, 0.16], sunC: '#fffbe8', glow: 'rgba(255,250,210,0.5)', haze: '#e3eef2', tint: null, light: 1 },
  evening: { top: '#5d6fb3', mid: '#d99aa6', bottom: '#ffc48a', sun: [0.8, 0.42], sunC: '#ffd27a', glow: 'rgba(255,170,90,0.6)', haze: '#f2bf98', tint: 'rgba(255,150,80,0.13)', light: 0.95 },
  night: { top: '#1c2350', mid: '#2f3f7a', bottom: '#56609a', moon: [0.8, 0.18], haze: '#4a5288', tint: 'rgba(30,40,110,0.38)', light: 0.7, stars: true },
  // a dream / a vision: a glowing lilac night with stars and a big soft warm light from above (no disk, no figure —
  // the voice of a holy person comes "from the light", AGENTS.md rule 15)
  dream: { top: '#3b3270', mid: '#8a6fb8', bottom: '#e2b9d8', sun: [0.5, 0.14], sunC: null, glow: 'rgba(255,238,200,0.95)', haze: '#b49ad0', tint: 'rgba(170,130,235,0.28)', light: 0.9, stars: true },
};

export const PALETTES2D = {
  terra: { walls: ['#e19a6c', '#d98b60', '#e8a97e'], domes: ['#7fb487', '#f3ece0'], trim: '#a85f3c', door: '#8a5a3a', ground: ['#f0d3a0', '#e6bf86'], path: '#f6e2bb', dunes: ['#efc79a', '#e4b283'], hills: ['#c9a7c4', '#d9bcc6'] },
  ochre: { walls: ['#efc56f', '#e8b85e', '#f3d08a'], domes: ['#6f9ed8', '#fbf4e6'], trim: '#b88136', door: '#7a5534', ground: ['#f4dca8', '#e9c88b'], path: '#fbeccb', dunes: ['#f2d29a', '#e8bf80'], hills: ['#b8b4d8', '#cfc6dc'] },
  rose: { walls: ['#f2c1b3', '#eab0a1', '#f6d2c6'], domes: ['#fbf4ea', '#9cc6de'], trim: '#c27f6c', door: '#8a5a4a', ground: ['#f6dcc1', '#eccaa6'], path: '#fbeedd', dunes: ['#f3cfb0', '#e8bb98'], hills: ['#c3b0d6', '#d8c4dc'] },
  // the muted, warm book-illustration look of the hermitage (reference drawing of film 025): cream-peach skies with no
  // blue, a hazy sun glow without a disk, mauve-taupe hills, ochre sand; wispy clouds; a soft vignette (`grade`)
  sandstone: { walls: ['#ddbd92'], domes: ['#e8c070', '#f3e6cc'], trim: '#a77d5d', door: '#6a5449', ground: ['#cfa57d', '#e8d2ad'], path: '#ead0a8', dunes: ['#d3b296', '#deb992'], hills: ['#c9b2a0', '#b79b88'],
    clouds: 'wisp', grade: true,
    skies: {
      morning: { top: '#e6d2c8', mid: '#f6e6d6', bottom: '#f6dcbc', sun: [0.2, 0.32], sunC: null, glow: 'rgba(255,240,205,0.85)', haze: '#f1dcc6' },
      day: { top: '#f2d8b4', mid: '#f8ebd2', bottom: '#f1d7ad', sun: [0.76, 0.16], sunC: null, glow: 'rgba(255,245,203,0.92)', haze: '#f3e2c6' },
      evening: { top: '#c7a3a4', mid: '#ecbf9f', bottom: '#f4c48e', sun: [0.78, 0.44], sunC: null, glow: 'rgba(255,205,140,0.9)', haze: '#efc4a0', tint: 'rgba(255,150,90,0.12)' },
      night: { top: '#262841', mid: '#3d3e60', bottom: '#625b73', haze: '#56506a' },
    } },
  white: { walls: ['#f6f0e4', '#eee6d6', '#faf6ee'], domes: ['#5f8fd0', '#f6f0e4'], trim: '#c9b48e', door: '#6f8fb8', ground: ['#f3e2bf', '#e8d0a2'], path: '#fbf1dc', dunes: ['#f1dcae', '#e6c993'], hills: ['#b2bede', '#c9cfe2'] },
};

// ---------------------------------------------------------------- backdrop
/** the sky of the hour, with the palette's own colours when it has them (sandstone) */
export function skyOf(opts) {
  const pal = PALETTES2D[opts.palette] || PALETTES2D.terra;
  return { ...(SKIES2D[opts.sky] || SKIES2D.day), ...(pal.skies?.[opts.sky] || {}) };
}
export function drawBackdrop(g, V, opts) {
  const { W, H } = V;
  const sky = skyOf(opts);
  const pal = PALETTES2D[opts.palette] || PALETTES2D.terra;
  const hor = V.horizon();
  // sky
  const sg = g.createLinearGradient(0, 0, 0, Math.max(10, hor));
  sg.addColorStop(0, sky.top); sg.addColorStop(0.6, sky.mid); sg.addColorStop(1, sky.bottom);
  g.fillStyle = sg; g.fillRect(0, 0, W, Math.max(0, hor) + 4);
  const u = H / 1080;
  if (sky.stars) {
    const r = rng(7);
    for (let i = 0; i < 140; i++) {
      const x = ((r() * 1.6 - 0.3) * W - V.cam.x * 2 * u) % (W * 1.3), y = r() * hor * 0.9, tw = 0.6 + 0.4 * Math.sin(opts.t * (1 + r() * 2) + i);
      g.fillStyle = `rgba(255,250,225,${0.5 * tw + 0.2})`; ellipse(g, (x + W * 1.3) % (W * 1.3) - W * 0.15, y, 1.6 * u, 1.6 * u); g.fill();
    }
  }
  const sunXY = sky.sun || sky.moon;
  if (sunXY) {
    const sx = W * sunXY[0] - V.cam.x * 1.2 * u, sy = Math.min(hor - 40 * u, H * sunXY[1]);
    if (sky.sun) {
      const gl = g.createRadialGradient(sx, sy, 0, sx, sy, 260 * u);
      gl.addColorStop(0, sky.glow); gl.addColorStop(1, 'rgba(255,240,200,0)');
      if (!sky.sunC) { // a big hazy glow, no disk (sandstone)
        const big = g.createRadialGradient(sx, sy, 0, sx, sy, 420 * u);
        big.addColorStop(0, sky.glow); big.addColorStop(0.38, 'rgba(255,243,207,0.42)'); big.addColorStop(1, 'rgba(255,240,206,0)');
        g.fillStyle = big; g.fillRect(sx - 430 * u, sy - 430 * u, 860 * u, 860 * u);
      } else {
      g.fillStyle = gl; g.fillRect(sx - 270 * u, sy - 270 * u, 540 * u, 540 * u);
      ellipse(g, sx, sy, 62 * u, 62 * u); g.fillStyle = sky.sunC; g.fill();
      }
    } else {
      const gl = g.createRadialGradient(sx, sy, 0, sx, sy, 200 * u);
      gl.addColorStop(0, 'rgba(255,250,220,0.35)'); gl.addColorStop(1, 'rgba(255,250,220,0)');
      g.fillStyle = gl; g.fillRect(sx - 210 * u, sy - 210 * u, 420 * u, 420 * u);
      ellipse(g, sx, sy, 48 * u, 48 * u); g.fillStyle = '#fbf3d2'; g.fill();
      ellipse(g, sx + 18 * u, sy - 10 * u, 40 * u, 40 * u); g.fillStyle = sky.mid; g.fill();
    }
  }
  // clouds (drifting very slowly)
  if (!sky.stars && pal.clouds === 'wisp') wisps(g, V, opts.t, opts.sky === 'evening');
  else if (!sky.stars) {
    const r = rng(3);
    for (let i = 0; i < 7; i++) {
      const span = W * 1.8;
      const x = (((r() * span + opts.t * (6 + r() * 6) * u - V.cam.x * 3 * u) % span) + span) % span - W * 0.4;
      const y = (0.08 + r() * 0.28) * Math.max(200 * u, hor);
      const s = (0.6 + r() * 0.7) * u;
      cloud(g, x, y, s, opts.sky === 'evening');
    }
  }
  // far mountains, then two rows of dunes (parallax: further layers move less)
  layer(g, V, 900, 70, 0.012, 5, mix(pal.hills[0], sky.haze, 0.45), mix(pal.hills[1], sky.haze, 0.6), 1);
  layer(g, V, 320, 16, 0.03, 11, mix(pal.dunes[1], sky.haze, 0.45), mix(pal.dunes[0], sky.haze, 0.55), 2);
  layer(g, V, 150, 7, 0.05, 17, mix(pal.dunes[0], sky.haze, 0.2), mix(pal.dunes[1], sky.haze, 0.3), 3);
}

function cloud(g, x, y, s, warm) {
  const parts = [[0, 0, 70, 38], [-60, 10, 48, 28], [62, 8, 52, 30], [-25, -22, 46, 34], [28, -26, 50, 36]];
  g.fillStyle = warm ? 'rgba(255,222,214,0.9)' : 'rgba(255,255,255,0.92)';
  g.beginPath(); for (const [dx, dy, rx, ry] of parts) { g.moveTo(x + dx * s + rx * s, y + dy * s); g.ellipse(x + dx * s, y + dy * s, rx * s, ry * s, 0, 0, Math.PI * 2); } g.fill();
  g.fillStyle = warm ? 'rgba(220,170,180,0.35)' : 'rgba(170,200,225,0.3)';
  g.beginPath(); g.ellipse(x, y + 22 * s, 110 * s, 12 * s, 0, 0, Math.PI * 2); g.fill();
}

function layer(g, V, D, amp, freq, seed, c1, c2, kind) {
  const { W, H } = V;
  const pts = [];
  for (let X = -20; X <= W + 20; X += 12 * (H / 1080)) {
    const x = V.cam.x + (X - W / 2) * D / V.f;
    let y = amp * (0.55 * noise1(x * freq, seed) + 0.3 * noise1(x * freq * 2.3, seed + 1) + 0.15 * noise1(x * freq * 5, seed + 2));
    if (kind === 1) y += amp * 0.25;
    pts.push([X, V.layerY(y, D)]);
  }
  const yb = V.layerY(0, D) + 4;
  g.beginPath(); g.moveTo(-20, yb); for (const p of pts) g.lineTo(p[0], p[1]); g.lineTo(W + 20, yb); g.closePath();
  const top = Math.min(...pts.map((p) => p[1]));
  const gr = g.createLinearGradient(0, top, 0, yb);
  gr.addColorStop(0, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; g.fill();
  g.strokeStyle = rgba(shade(c1, -0.25), 0.25); g.lineWidth = 2 * (H / 1080); g.stroke();
}

export function drawGround(g, V, opts) {
  const { W, H } = V;
  const pal = PALETTES2D[opts.palette] || PALETTES2D.terra;
  const sky = skyOf(opts);
  const hor = V.horizon();
  const gg = g.createLinearGradient(0, hor, 0, H);
  gg.addColorStop(0, mix(pal.ground[1], sky.haze, 0.35)); gg.addColorStop(0.35, pal.ground[1]); gg.addColorStop(1, pal.ground[0]);
  g.fillStyle = gg; g.fillRect(0, hor - 2, W, H - hor + 2);
  // soft wind ripples in the sand
  g.strokeStyle = rgba(shade(pal.ground[1], -0.2), 0.22); g.lineWidth = 2 * (H / 1080);
  const r = rng(21);
  for (let i = 0; i < 60; i++) {
    const x = (r() - 0.5) * 120, z = -40 + r() * 52;
    const a = V.P(x - 2, 0, z), b = V.P(x + 2.5, 0, z + 0.4);
    if (!a || !b || a[1] < hor) continue;
    g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo((a[0] + b[0]) / 2, a[1] - 3 * a[2] * 0.02, b[0], b[1]); g.stroke();
  }
  // paths: from the front of the yard to each door
  const L = opts.layout;
  if (L?.hermitage) { // soft bands of lighter and darker sand, like the washes of the reference
    for (const [z0, c, a] of [[-14, '#deb992', 0.5], [-2, '#cba47f', 0.28], [9, '#deb992', 0.3]]) {
      const pts = [];
      for (let x = -70; x <= 70; x += 4) { const p = V.P(x, 0, z0 + 2.2 * Math.sin(x * 0.07 + z0)); if (p) pts.push([p[0], p[1]]); }
      if (pts.length < 2) continue;
      g.beginPath(); curve(g, pts); g.lineTo(W + 50, H + 50); g.lineTo(-50, H + 50); g.closePath();
      g.fillStyle = rgba(c, a); g.fill();
    }
  }
  if (L?.twoD && !L.hermitage) {
    g.fillStyle = rgba(pal.path, 0.55);
    const doors = [...L.cells.map((c) => [c.x, c.z + c.d / 2]), ...(L.church ? [[L.church.x, L.church.z + L.church.d / 2]] : [])];
    for (const [x, z] of doors) groundStrip(g, V, x, z, x * 0.6, -1.5, 2.2, 3.2);
    groundStrip(g, V, -45, -1.5, 45, -1.5, 3, 3, true);
  }
}
function groundStrip(g, V, x0, z0, x1, z1, w0, w1, horiz = false) {
  const n = 10, L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, x = x0 + (x1 - x0) * k, z = z0 + (z1 - z0) * k, w = (w0 + (w1 - w0) * k) / 2 * (1 + 0.15 * Math.sin(i * 1.7));
    const a = horiz ? V.P(x, 0, z - w) : V.P(x - w, 0, z), b = horiz ? V.P(x, 0, z + w) : V.P(x + w, 0, z);
    if (!a || !b) continue;
    L.push([a[0], a[1]]); R.push([b[0], b[1]]);
  }
  if (L.length < 2) return;
  g.beginPath(); curve(g, L); g.lineTo(R[R.length - 1][0], R[R.length - 1][1]);
  const rr = R.reverse(); for (const p of rr) g.lineTo(p[0], p[1]); g.closePath(); g.fill();
}

// ---------------------------------------------------------------- set sprites
/** Static sprites of the set: [{ z, draw(g, V, t) }] (sorted with the actors by depth). */
export function setSprites(layout, opts) {
  const out = [];
  const pal = PALETTES2D[opts.palette] || PALETTES2D.terra;
  if (!layout?.twoD) return out;
  if (layout.hermitage) return hermitageSprites(layout);
  layout.cells.forEach((c, i) => out.push({ z: c.z + c.d / 2, solid: [c.x - c.w / 2, c.z - c.d / 2, c.x + c.w / 2, c.z + c.d / 2], draw: (g, V) => building(g, V, c, pal, i, false) }));
  if (layout.church) { const c = layout.church; out.push({ z: c.z + c.d / 2, solid: [c.x - c.w / 2, c.z - c.d / 2, c.x + c.w / 2, c.z + c.d / 2], draw: (g, V) => building(g, V, c, pal, 9, true) }); }
  layout.palms.forEach(([x, z], i) => out.push({ z, draw: (g, V, t) => palm(g, V, x, z, i, t) }));
  const r = rng(11);
  for (let i = 0; i < 26; i++) {
    const x = (r() - 0.5) * 90, z = -24 + r() * 34, kind = r(), sd = Math.floor(r() * 1000);
    if (layout.cells.some((c) => Math.abs(x - c.x) < c.w / 2 + 1.5 && Math.abs(z - c.z) < c.d / 2 + 4.5)) continue;
    if (layout.church && Math.abs(x - layout.church.x) < 8 && Math.abs(z - layout.church.z) < 9) continue;
    if (Math.abs(x) < 9 && z > -6) continue; // keep the middle of the yard clear for the people
    out.push({ z, draw: (g, V) => (kind < 0.55 ? stone(g, V, x, z, sd) : tuft(g, V, x, z, sd)) });
  }
  return out;
}

function building(g, V, c, pal, idx, church) {
  const x0 = c.x - c.w / 2, x1 = c.x + c.w / 2, zf = c.z + c.d / 2, zb = c.z - c.d / 2, h = c.h;
  const F0 = V.P(x0, 0, zf), F1 = V.P(x1, h, zf);
  if (!F0 || !F1) return;
  const s = F0[2], u = (x, y) => [F0[0] + (x - x0) * s, F0[1] - y * s]; // front face (parallel to the screen)
  const wall = pal.walls[idx % pal.walls.length];
  const lw = Math.max(1, 0.07 * s);
  // side wall (the one facing the camera)
  const side = V.cam.x < x0 ? x0 : V.cam.x > x1 ? x1 : null;
  if (side != null) {
    const a = V.P(side, 0, zf), b = V.P(side, h, zf), cc = V.P(side, h, zb), d = V.P(side, 0, zb);
    if (a && b && cc && d) {
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1] + 0.3 * s); g.quadraticCurveTo(b[0], b[1], (b[0] + cc[0]) / 2, (b[1] + cc[1]) / 2); g.lineTo(cc[0], cc[1]); g.lineTo(d[0], d[1]); g.closePath();
      inked(g, shade(wall, -0.18), lw);
    }
  }
  const vault = !church && c.roof === 'vault';   // a barrel vault (Nubian mud-brick): the front wall ends in a round arch
  // roof (top face)
  const tl = V.P(x0, h, zb), tr = V.P(x1, h, zb);
  if (vault) {
    const va = V.P(x0, h - 0.2, zb), vb = V.P(x1, h - 0.2, zb), [fx0, fy0] = u(x0, h - 0.2), [fx1] = u(x1, h - 0.2), rise = c.w * 0.32;
    if (va && vb) { // the curved top of the vault going back
      g.beginPath(); g.moveTo(fx0, fy0); g.quadraticCurveTo((fx0 + fx1) / 2, fy0 - rise * 2 * s, fx1, fy0);
      g.lineTo(vb[0], vb[1]); g.quadraticCurveTo((va[0] + vb[0]) / 2, va[1] - rise * 2 * va[2], va[0], va[1]); g.closePath();
      inked(g, shade(wall, 0.1), lw);
    }
  } else if (tl && tr) { g.beginPath(); g.moveTo(u(0 + x0, h)[0], u(x0, h)[1]); g.lineTo(tl[0], tl[1]); g.lineTo(tr[0], tr[1]); g.lineTo(u(x1, h)[0], u(x1, h)[1]); g.closePath(); inked(g, shade(wall, 0.12), lw); }
  // dome (on the roof, set back to the middle)
  // only the church has a dome (a low, rounded mud-brick Coptic dome with a cross); the cells have flat roofs
  const dm = church && c.dome !== 'bell' ? V.P(c.x, h, c.z) : null;
  if (church && c.dome === 'bell') { // a bell gable on the front of the roof: two piers, an arch, a bell, a cross on top
    const [gx, gy] = u(c.x, h), gw = 1.6 * s, gh = 3.0 * s;
    g.beginPath(); g.moveTo(gx - gw, gy); g.lineTo(gx - gw, gy - gh); g.quadraticCurveTo(gx, gy - gh - 1.2 * s, gx + gw, gy - gh); g.lineTo(gx + gw, gy); g.closePath();
    inked(g, shade(wall, 0.1), lw);
    const ar = 0.75 * s; g.beginPath(); g.moveTo(gx - ar, gy - 0.4 * s); g.lineTo(gx - ar, gy - 1.9 * s); g.arc(gx, gy - 1.9 * s, ar, Math.PI, 0); g.lineTo(gx + ar, gy - 0.4 * s); g.closePath(); inked(g, '#4d3a3a', lw * 0.7);
    g.beginPath(); g.moveTo(gx - 0.45 * s, gy - 0.8 * s); g.quadraticCurveTo(gx - 0.42 * s, gy - 1.9 * s, gx, gy - 1.95 * s); g.quadraticCurveTo(gx + 0.42 * s, gy - 1.9 * s, gx + 0.45 * s, gy - 0.8 * s); g.closePath(); inked(g, '#d9a441', lw * 0.6);
    const ct = gy - gh - 0.55 * s, cw = 0.16 * s, chh = 1.4 * s;
    g.fillStyle = '#e9b43c'; g.strokeStyle = INK; g.lineWidth = lw * 0.6;
    g.beginPath(); g.rect(gx - cw / 2, ct - chh, cw, chh); g.rect(gx - chh * 0.33, ct - chh * 0.72, chh * 0.66, cw); g.fill(); g.stroke();
  }
  if (dm && c.dome === 'twin') { // a small dome over the sanctuary, behind and to the side of the big one
    const d2 = V.P(c.x + c.w * 0.3, h, c.z - 1.5);
    if (d2) { const r2 = 1.5 * d2[2], by0 = d2[1]; g.beginPath(); g.moveTo(d2[0] - r2, by0); g.bezierCurveTo(d2[0] - r2, by0 - r2 * 1.1, d2[0] + r2, by0 - r2 * 1.1, d2[0] + r2, by0); g.closePath(); inked(g, shade('#e8c070', -0.05), lw); }
  }
  if (dm) {
    const ds = dm[2], R0 = 3.0 * ds;
    let by = dm[1];
    { // a low round base (`drum`: a tall drum with little arched windows)
      const drum = c.dome === 'drum', dw = (drum ? 2.6 : 3.2) * ds, dh = (drum ? 2.4 : 0.7) * ds;
      g.beginPath(); g.rect(dm[0] - dw, by - dh, dw * 2, dh); inked(g, shade(wall, 0.1), lw);
      if (drum) for (const k of [-0.55, 0, 0.55]) { const wx = dm[0] + k * dw * 1.2, wy = by - dh * 0.3, ww = 0.28 * ds; g.beginPath(); g.moveTo(wx - ww, wy); g.lineTo(wx - ww, wy - dh * 0.4); g.arc(wx, wy - dh * 0.4, ww, Math.PI, 0); g.lineTo(wx + ww, wy); g.closePath(); inked(g, '#4d3a3a', lw * 0.5); }
      by -= dh;
    }
    const R = c.dome === 'drum' ? 2.6 * ds : R0;
    const dc = '#e8c070';
    g.beginPath(); g.moveTo(dm[0] - R, by);
    g.bezierCurveTo(dm[0] - R, by - R * 0.95, dm[0] - R * 0.35, by - R * 1.02, dm[0], by - R * 1.05);
    g.bezierCurveTo(dm[0] + R * 0.35, by - R * 1.02, dm[0] + R, by - R * 0.95, dm[0] + R, by);
    g.closePath();
    const dg = g.createLinearGradient(dm[0] - R, by - R, dm[0] + R, by);
    dg.addColorStop(0, shade(dc, 0.35)); dg.addColorStop(0.5, dc); dg.addColorStop(1, shade(dc, -0.15));
    inked(g, dg, lw);
    g.beginPath(); g.ellipse(dm[0] - R * 0.35, by - R * 0.55, R * 0.14, R * 0.3, -0.4, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fill();
    // cross on top
    const ct = by - R * 1.05;
    const cw = (church ? 0.16 : 0.11) * ds, chh = (church ? 1.6 : 1.0) * ds;
    g.fillStyle = church ? '#e9b43c' : shade(pal.trim, -0.1); g.strokeStyle = INK; g.lineWidth = lw * 0.6;
    g.beginPath(); g.rect(dm[0] - cw / 2, ct - chh, cw, chh); g.rect(dm[0] - chh * 0.33, ct - chh * 0.72, chh * 0.66, cw); g.fill(); g.stroke();
  }
  // front wall: soft adobe with rounded top corners, plaster spots, a plinth
  const [ax, ay] = u(x0, 0), [bx, by2] = u(x1, h);
  const rr = 0.6 * s;
  if (vault) { const [, vy] = u(x0, h - 0.2), rise = c.w * 0.32 * s; g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax, vy); g.quadraticCurveTo((ax + bx) / 2, vy - rise * 2, bx, vy); g.lineTo(bx, ay); g.closePath(); }
  else { g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax, by2 + rr); g.quadraticCurveTo(ax, by2, ax + rr, by2); g.lineTo(bx - rr, by2); g.quadraticCurveTo(bx, by2, bx, by2 + rr); g.lineTo(bx, ay); g.closePath(); }
  const wg = g.createLinearGradient(ax, by2, bx, ay);
  wg.addColorStop(0, shade(wall, 0.18)); wg.addColorStop(1, shade(wall, -0.06));
  inked(g, wg, lw);
  g.save(); g.clip();
  const r = rng(31 + idx * 17);
  for (let i = 0; i < 18; i++) { const [px, py] = u(x0 + r() * c.w, 0.6 + r() * (h - 1)); ellipse(g, px, py, (0.25 + r() * 0.5) * s, (0.12 + r() * 0.2) * s); g.fillStyle = rgba(shade(wall, r() < 0.5 ? -0.15 : 0.2), 0.35); g.fill(); }
  g.fillStyle = rgba(shade(wall, -0.25), 0.5); g.fillRect(ax, ay - 0.5 * s, bx - ax, 0.5 * s);
  g.restore();
  if (!church && !vault) { // flat roof: a soft parapet with rounded corners and a palm-leaf sunshade on the roof
    g.fillStyle = shade(wall, 0.05);
    const [qx, qy] = u(x0 + 0.4, h), [rx2] = u(x1 - 0.4, h);
    g.beginPath(); g.moveTo(qx, qy); g.quadraticCurveTo(qx, qy - 0.5 * s, qx + 0.5 * s, qy - 0.5 * s); g.lineTo(qx + 0.9 * s, qy - 0.5 * s); g.lineTo(qx + 0.9 * s, qy); g.closePath(); inked(g, shade(wall, 0.12), lw * 0.8);
    g.beginPath(); g.moveTo(rx2, qy); g.quadraticCurveTo(rx2, qy - 0.5 * s, rx2 - 0.5 * s, qy - 0.5 * s); g.lineTo(rx2 - 0.9 * s, qy - 0.5 * s); g.lineTo(rx2 - 0.9 * s, qy); g.closePath(); inked(g, shade(wall, 0.12), lw * 0.8);
  }
  // roof beams sticking out under the parapet (a vault has none: a small round vent in the arch instead)
  g.fillStyle = shade(pal.door, -0.1);
  if (vault) { const [px, py] = u(c.x, h + c.w * 0.12); ellipse(g, px, py, 0.35 * s, 0.35 * s); inked(g, '#4d3a3a', lw * 0.6); }
  else for (let k = 0.8; k < c.w - 0.5; k += 1.6) { const [px, py] = u(x0 + k, h - 0.9); g.beginPath(); g.ellipse(px, py, 0.2 * s, 0.2 * s, 0, 0, Math.PI * 2); inked(g, shade(pal.door, 0.1), lw * 0.5); }
  // door: arched, wooden planks, a little step
  const dw = (church ? 2.6 : 2.0), dh = (church ? 4.2 : 3.4);
  const [dx0, dy0] = u(c.x - dw / 2, 0), [dx1, dy1] = u(c.x + dw / 2, dh);
  const dr = (dx1 - dx0) / 2;
  g.beginPath(); g.moveTo(dx0, dy0); g.lineTo(dx0, dy1 + dr); g.arc(dx0 + dr, dy1 + dr, dr, Math.PI, 0); g.lineTo(dx1, dy0); g.closePath();
  inked(g, shade(pal.trim, -0.05), lw * 1.6);
  const inset = 0.18 * s;
  g.beginPath(); g.moveTo(dx0 + inset, dy0); g.lineTo(dx0 + inset, dy1 + dr); g.arc(dx0 + dr, dy1 + dr, dr - inset, Math.PI, 0); g.lineTo(dx1 - inset, dy0); g.closePath();
  inked(g, pal.door, lw * 0.6);
  g.save(); g.clip(); g.strokeStyle = rgba(shade(pal.door, -0.35), 0.6); g.lineWidth = lw * 0.6;
  for (let k = 1; k < 4; k++) { const xx = dx0 + inset + (dx1 - dx0 - 2 * inset) * k / 4; g.beginPath(); g.moveTo(xx, dy0); g.lineTo(xx, dy1 - dr); g.stroke(); }
  g.restore();
  ellipse(g, dx1 - inset - 0.3 * s, (dy0 + dy1) / 2 + 0.3 * s, 0.1 * s, 0.1 * s); inked(g, '#e6b84e', lw * 0.4);
  // windows (small, deep, with a sill); the church gets two arched ones
  const wins = church ? [-3.6, 3.6] : [c.x > 0 ? -2.6 : 2.6];
  for (const wx of wins) {
    const [px, py] = u(c.x + wx, church ? 4.6 : 3.6);
    const ww = 0.55 * s, wh = (church ? 1.0 : 0.65) * s;
    g.beginPath(); g.moveTo(px - ww, py); g.lineTo(px - ww, py - wh); g.arc(px, py - wh, ww, Math.PI, 0); g.lineTo(px + ww, py); g.closePath();
    inked(g, '#4d3a3a', lw);
    g.fillStyle = rgba('#ffd98a', 0.25); g.fill();
    g.fillStyle = shade(wall, 0.3); g.fillRect(px - ww * 1.3, py, ww * 2.6, 0.2 * s); g.strokeStyle = INK; g.lineWidth = lw * 0.5; g.strokeRect(px - ww * 1.3, py, ww * 2.6, 0.2 * s);
  }
  if (!church) { // a little pot of greenery by the door
    const [px, py] = u(c.x + dw / 2 + 0.9, 0);
    g.beginPath(); g.moveTo(px - 0.35 * s, py); g.lineTo(px - 0.45 * s, py - 0.7 * s); g.lineTo(px + 0.45 * s, py - 0.7 * s); g.lineTo(px + 0.35 * s, py); g.closePath(); inked(g, '#c9764e', lw * 0.6);
    for (const a of [-0.5, -0.15, 0.2, 0.55]) { g.beginPath(); g.ellipse(px + a * 0.5 * s, py - 1.05 * s, 0.18 * s, 0.4 * s, a, 0, Math.PI * 2); inked(g, '#6fae6a', lw * 0.5); }
  }
}

function palm(g, V, x, z, i, t) {
  const B = V.P(x, 0, z);
  if (!B) return;
  const s = B[2], lw = Math.max(1, 0.06 * s), H = 9 + (i % 3) * 1.6, lean = (i % 2 ? 1 : -1) * (0.8 + (i % 3) * 0.4);
  const sway = Math.sin(t * 0.9 + i) * 0.15;
  const top = [B[0] + (lean + sway) * s, B[1] - H * s];
  // trunk: segments
  const N = 9;
  for (let k = N - 1; k >= 0; k--) {
    const a = k / N, b = (k + 1) / N;
    const pa = [B[0] + (lean + sway) * s * a * a, B[1] - H * s * a], pb = [B[0] + (lean + sway) * s * b * b, B[1] - H * s * b];
    const w = (0.42 - 0.14 * a) * s;
    g.beginPath(); g.moveTo(pa[0] - w, pa[1]); g.lineTo(pb[0] - w * 0.92, pb[1]); g.lineTo(pb[0] + w * 0.92, pb[1]); g.lineTo(pa[0] + w, pa[1]); g.closePath();
    inked(g, k % 2 ? '#a77a52' : '#b98a5e', lw * 0.7);
  }
  // fronds
  const fr = 7;
  for (let k = 0; k < fr; k++) {
    const ang = -Math.PI + (k / (fr - 1)) * Math.PI + Math.sin(t * 1.3 + k + i) * 0.04;
    const L = (3.6 + (k % 2) * 0.6) * s;
    const ex = top[0] + Math.cos(ang) * L, ey = top[1] + Math.sin(ang) * L * 0.55 + L * 0.35 * (1 - Math.abs(Math.sin(ang)));
    const cx = top[0] + Math.cos(ang) * L * 0.5, cy = top[1] - L * 0.3;
    g.beginPath(); g.moveTo(top[0], top[1]); g.quadraticCurveTo(cx, cy - 0.35 * s, ex, ey); g.quadraticCurveTo(cx, cy + 0.45 * s, top[0], top[1]);
    inked(g, k % 2 ? '#5f9f5a' : '#73b467', lw * 0.7);
    g.beginPath(); g.moveTo(top[0], top[1]); g.quadraticCurveTo(cx, cy, ex, ey); g.strokeStyle = rgba('#2f5b34', 0.5); g.lineWidth = lw * 0.5; g.stroke();
  }
  for (const d of [-0.3, 0.1, 0.35]) { ellipse(g, top[0] + d * s, top[1] + 0.35 * s, 0.22 * s, 0.22 * s); inked(g, '#8a5a2c', lw * 0.5); }
}

function stone(g, V, x, z, sd) {
  const B = V.P(x, 0, z); if (!B) return;
  const s = B[2], r = rng(sd), w = (0.4 + r() * 0.6) * s, h = w * (0.45 + r() * 0.3);
  g.beginPath(); blob(g, [[B[0] - w, B[1]], [B[0] - w * 0.6, B[1] - h], [B[0] + w * 0.4, B[1] - h * 1.1], [B[0] + w, B[1] - h * 0.2], [B[0] + w * 0.6, B[1] + h * 0.1]], 0.6);
  inked(g, mix('#c9b8a0', '#a89a8a', r()), Math.max(1, 0.05 * s));
}
function tuft(g, V, x, z, sd) {
  const B = V.P(x, 0, z); if (!B) return;
  const s = B[2], r = rng(sd);
  g.strokeStyle = r() < 0.5 ? '#8fa85c' : '#a3b56a'; g.lineWidth = Math.max(1, 0.08 * s); g.lineCap = 'round';
  for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(B[0] + k * 0.08 * s, B[1]); g.quadraticCurveTo(B[0] + k * 0.2 * s, B[1] - 0.5 * s, B[0] + k * 0.35 * s, B[1] - (0.7 + r() * 0.3) * s); g.stroke(); }
}

// ---------------------------------------------------------------- props
// Each prop draws in local units (1 = stud, y up), origin at its grip point (held) or its base (on the ground).
// flat props (a mat) are drawn on the ground with the camera projection instead.
export const PROPS2D = {
  figs(g, o, lw) {
    const n = Math.max(1, Math.min(7, o.count ?? 5));
    if (o.dish !== false) {
      g.beginPath(); g.moveTo(-0.62, 0.22); g.quadraticCurveTo(-0.55, -0.12, 0, -0.14); g.quadraticCurveTo(0.55, -0.12, 0.62, 0.22); g.closePath();
      const dg = g.createLinearGradient(0, 0.2, 0, -0.14); dg.addColorStop(0, col(o.color || 'terracotta')); dg.addColorStop(1, shade(o.color || 'terracotta', -0.25));
      inked(g, dg, lw);
      const spots = [[0, 0.36], [-0.29, 0.33], [0.29, 0.33], [-0.14, 0.47], [0.15, 0.47], [-0.42, 0.3], [0.42, 0.3]].slice(0, n);
      spots.sort((a, b) => b[1] - a[1]);
      spots.forEach(([x, y], i) => fig(g, x, y, i, lw));
      g.beginPath(); g.ellipse(0, 0.22, 0.62, 0.1, 0, Math.PI * 1.05, Math.PI * 1.95); g.strokeStyle = INK; g.lineWidth = lw; g.stroke(); // front rim, below the figs
    } else fig(g, 0, 0.12, 0, lw);
  },
  basket(g, o, lw) {
    // `count` 2–3: that many baskets side by side (a row of finished baskets on the ground)
    const n = Math.max(1, Math.min(3, o.count ?? 1));
    if (n > 1) { for (let k = 0; k < n; k++) { g.save(); g.translate((k - (n - 1) / 2) * 1.55, 0); PROPS2D.basket(g, { ...o, count: 1 }, lw); g.restore(); } return; }
    g.beginPath(); g.moveTo(-0.7, 0.75); g.lineTo(-0.5, 0); g.quadraticCurveTo(0, -0.08, 0.5, 0); g.lineTo(0.7, 0.75); g.closePath();
    inked(g, '#d2a35f', lw);
    g.save(); g.clip(); g.strokeStyle = rgba('#8a6430', 0.7); g.lineWidth = lw * 0.7;
    for (let y = 0.12; y < 0.75; y += 0.14) { g.beginPath(); g.moveTo(-0.8, y); g.lineTo(0.8, y); g.stroke(); }
    for (let x = -0.7; x < 0.8; x += 0.16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x * 1.25, 0.8); g.stroke(); }
    g.restore();
    ellipse(g, 0, 0.75, 0.7, 0.12); inked(g, '#b88a4c', lw);
    if (o.handle !== false) { g.beginPath(); g.ellipse(0, 0.78, 0.55, 0.6, 0, 0, Math.PI); g.strokeStyle = INK; g.lineWidth = lw * 2.4; g.stroke(); g.strokeStyle = '#c8955a'; g.lineWidth = lw * 1.3; g.stroke(); }
  },
  handles(g, o, lw) {
    // a small bundle of basket handles (toarte): braided palm-fibre arches tied together in the middle
    const n = Math.max(1, Math.min(5, o.count ?? 3));
    for (let k = 0; k < n; k++) {
      const d = (k - (n - 1) / 2) * 0.12;
      g.beginPath(); g.ellipse(d, -0.25, 0.42 - Math.abs(d) * 0.4, 0.78, 0, 0, Math.PI);
      g.strokeStyle = INK; g.lineWidth = lw * 2.6; g.lineCap = 'round'; g.stroke();
      g.strokeStyle = k % 2 ? '#c8955a' : '#d8a96a'; g.lineWidth = lw * 1.5; g.stroke();
      g.setLineDash([lw * 0.9, lw * 1.1]); g.strokeStyle = rgba('#8a6430', 0.8); g.lineWidth = lw * 0.6; g.stroke(); g.setLineDash([]);
    }
    g.beginPath(); g.rect(-0.5, -0.08, 1.0, 0.16); inked(g, '#9a6a3a', lw * 0.7); // the tie
  },
  jug(g, o, lw) {
    g.beginPath(); g.moveTo(-0.16, 1.0); g.quadraticCurveTo(-0.2, 0.8, -0.4, 0.55); g.quadraticCurveTo(-0.5, 0.05, 0, 0); g.quadraticCurveTo(0.5, 0.05, 0.4, 0.55); g.quadraticCurveTo(0.2, 0.8, 0.16, 1.0); g.closePath();
    inked(g, col(o.color || 'terracotta'), lw);
    g.beginPath(); g.moveTo(0.3, 0.75); g.quadraticCurveTo(0.65, 0.7, 0.38, 0.35); g.strokeStyle = INK; g.lineWidth = lw * 2.2; g.stroke(); g.strokeStyle = col(o.color || 'terracotta'); g.lineWidth = lw; g.stroke();
    ellipse(g, 0, 1.0, 0.18, 0.05); inked(g, shade(o.color || 'terracotta', -0.3), lw * 0.6);
  },
  bread(g, o, lw) {
    ellipse(g, 0, 0.16, 0.42, 0.2); inked(g, o.dry ? '#b8976a' : '#e2a256', lw);
    g.strokeStyle = rgba('#8a5a2c', 0.6); g.lineWidth = lw * 0.7;
    for (const x of [-0.18, 0, 0.18]) { g.beginPath(); g.moveTo(x - 0.06, 0.08); g.lineTo(x + 0.06, 0.28); g.stroke(); }
  },
  mat: { flat: true },
  candle(g, o, lw, t) {
    g.beginPath(); g.rect(-0.08, 0, 0.16, 0.6); inked(g, '#f6e7b8', lw * 0.7);
    // the flame: always lit — a glow, an orange flame with an outline and a bright core (it flickers, never goes out)
    const fl = 0.03 * Math.sin(t * 13), fh = 1 + 0.08 * Math.sin(t * 9.3);
    const gl = g.createRadialGradient(0, 0.82, 0, 0, 0.82, 0.9); gl.addColorStop(0, 'rgba(255,214,120,0.6)'); gl.addColorStop(1, 'rgba(255,210,120,0)');
    g.fillStyle = gl; g.fillRect(-0.9, -0.1, 1.8, 1.8);
    g.beginPath(); g.moveTo(-0.11, 0.7); g.quadraticCurveTo(-0.12, 0.86 * fh, fl, 1.04 * fh); g.quadraticCurveTo(0.12, 0.86 * fh, 0.11, 0.7); g.quadraticCurveTo(0, 0.6, -0.11, 0.7);
    g.fillStyle = '#ffa63a'; g.fill(); g.strokeStyle = rgba('#b8641c', 0.8); g.lineWidth = lw * 0.5; g.stroke();
    g.beginPath(); g.ellipse(fl * 0.5, 0.76, 0.05, 0.1 * fh, 0, 0, Math.PI * 2); g.fillStyle = '#fff3b0'; g.fill();
    g.beginPath(); g.moveTo(0, 0.6); g.lineTo(0, 0.68); g.strokeStyle = '#4a3a2a'; g.lineWidth = lw * 0.6; g.stroke();
  },
  staff(g, o, lw) {
    g.beginPath(); g.moveTo(0, -1.4); g.lineTo(0, 2.6); g.quadraticCurveTo(0, 3.1, 0.35, 3.0);
    g.strokeStyle = INK; g.lineWidth = lw * 3; g.lineCap = 'round'; g.stroke(); g.strokeStyle = '#9a6a3a'; g.lineWidth = lw * 1.8; g.stroke();
  },
  garden(g, o, lw, t = 0) {
    // a small vegetable bed (grădină): a mound of dark soil with rows of green onions / leeks; `grown` 0..1 = how big and
    // full it is (0.2 = a few small sprouts, 1 = a rich bed), `width` in studs (default 4)
    const w = (o.width ?? 4) / 2, gr = Math.max(0, Math.min(1, o.grown ?? 0.5));
    g.beginPath(); g.moveTo(-w, 0); g.quadraticCurveTo(-w * 0.9, 0.34, 0, 0.36); g.quadraticCurveTo(w * 0.9, 0.34, w, 0); g.closePath();
    inked(g, '#8a5e3c', lw);
    g.strokeStyle = rgba('#6a4428', 0.6); g.lineWidth = lw * 0.6;
    for (const y of [0.12, 0.24]) { g.beginPath(); g.moveTo(-w * 0.85, y); g.quadraticCurveTo(0, y + 0.05, w * 0.85, y); g.stroke(); }
    const n = Math.round(3 + gr * 9), r = rng(11);
    for (let k = 0; k < n; k++) {
      const x = -w * 0.8 + (k + 0.5) / n * w * 1.6 + (r() - 0.5) * 0.12, h = (0.35 + gr * 0.85) * (0.8 + r() * 0.35), y0 = 0.22 + r() * 0.08;
      const sw = 0.03 * Math.sin(t * 1.3 + k);
      for (const [dx, dh, c] of [[-0.12, 0.85, '#6fa04a'], [0, 1, '#8bbb55'], [0.12, 0.8, '#7aad4e']]) {
        g.beginPath(); g.moveTo(x - 0.04, y0); g.quadraticCurveTo(x + dx * 0.4, y0 + h * dh * 0.5, x + dx + sw, y0 + h * dh); g.quadraticCurveTo(x + dx * 0.4 + 0.06, y0 + h * dh * 0.5, x + 0.04, y0); g.closePath();
        inked(g, c, lw * 0.6);
      }
      if (gr > 0.5) { ellipse(g, x, y0 + 0.02, 0.08, 0.07); inked(g, '#f3eedc', lw * 0.5); }
    }
  },
  greens(g, o, lw) {
    // a bunch of garden greens (verdețuri: green onions / leeks) tied with a string; `count` 1–3 bunches side by side
    const n = Math.max(1, Math.min(3, o.count ?? 1));
    if (n > 1) { for (let k = 0; k < n; k++) { g.save(); g.translate((k - (n - 1) / 2) * 0.55, 0); PROPS2D.greens(g, { ...o, count: 1 }, lw); g.restore(); } return; }
    const leaves = [[-0.34, 0.95], [-0.18, 1.12], [0, 1.2], [0.18, 1.1], [0.32, 0.92]];
    leaves.forEach(([x, y], i) => {
      g.beginPath(); g.moveTo(-0.05, 0.2); g.quadraticCurveTo(x * 0.3 - 0.06, (y + 0.2) / 2, x, y); g.quadraticCurveTo(x * 0.3 + 0.06, (y + 0.2) / 2, 0.05, 0.2); g.closePath();
      inked(g, i % 2 ? '#6fa04a' : '#8bbb55', lw * 0.7);
    });
    g.beginPath(); g.moveTo(-0.12, 0.22); g.lineTo(-0.1, -0.3); g.quadraticCurveTo(0, -0.38, 0.1, -0.3); g.lineTo(0.12, 0.22); g.closePath();
    inked(g, '#f3eedc', lw * 0.8);
    g.strokeStyle = rgba('#a89a6a', 0.9); g.lineWidth = lw * 0.5;
    for (const d of [-0.05, 0, 0.05]) { g.beginPath(); g.moveTo(d, -0.34); g.lineTo(d * 2.2, -0.44); g.stroke(); }
    g.beginPath(); g.rect(-0.14, 0.0, 0.28, 0.07); inked(g, '#b8402e', lw * 0.5);
  },
  coin(g, o, lw, t = 0) {
    // a gold coin (galben): a shining disk with a rim and a small cross; `count` 2–6 = a little heap of coins
    const n = Math.max(1, Math.min(6, o.count ?? 1)), r = 0.22;
    const spots = [[0, 0.22], [-0.36, 0.2], [0.36, 0.2], [-0.18, 0.46], [0.18, 0.46], [0, 0.7]].slice(0, n);
    if (n === 1) spots[0] = [0, 0.05];
    for (const [x, y] of spots) {
      ellipse(g, x, y, r, r);
      const cg = g.createRadialGradient(x - 0.07, y + 0.07, 0.02, x, y, r); cg.addColorStop(0, '#fff0a8'); cg.addColorStop(0.55, '#f2c443'); cg.addColorStop(1, '#c98e22');
      inked(g, cg, lw * 0.8);
      ellipse(g, x, y, r * 0.72, r * 0.72); g.strokeStyle = rgba('#a8701a', 0.7); g.lineWidth = lw * 0.6; g.stroke();
      g.beginPath(); g.moveTo(x, y - 0.09); g.lineTo(x, y + 0.09); g.moveTo(x - 0.065, y + 0.025); g.lineTo(x + 0.065, y + 0.025);
      g.strokeStyle = rgba('#9a6414', 0.85); g.lineWidth = lw * 0.7; g.stroke();
    }
    // a twinkle on the top coin
    const [tx, ty] = spots[spots.length - 1], k = 0.6 + 0.4 * Math.sin(t * 5), sx = tx + 0.13, sy = ty + 0.13, a = 0.14 * k, b = 0.035 * k;
    g.beginPath(); g.moveTo(sx, sy + a); g.lineTo(sx + b, sy + b); g.lineTo(sx + a, sy); g.lineTo(sx + b, sy - b); g.lineTo(sx, sy - a); g.lineTo(sx - b, sy - b); g.lineTo(sx - a, sy); g.lineTo(sx - b, sy + b); g.closePath();
    g.fillStyle = rgba('#fffbe6', 0.95); g.fill();
  },
  scroll(g, o, lw) {
    // a written note (înscris / zapis): a small parchment sheet with rolled ends and lines of writing; `rolled: true` = a roll tied with a red string
    const pc = '#f1e2bd', pd = '#d9c193';
    if (o.rolled) {
      g.beginPath(); g.rect(-0.38, 0.02, 0.76, 0.22); inked(g, pc, lw);
      ellipse(g, 0.38, 0.13, 0.05, 0.11); inked(g, pd, lw * 0.7);
      g.fillStyle = '#b8402e'; g.fillRect(-0.05, 0.0, 0.1, 0.26);
      return;
    }
    g.beginPath(); g.rect(-0.34, 0.06, 0.68, 0.62); inked(g, pc, lw);
    for (const y of [0.06, 0.68]) { g.beginPath(); g.rect(-0.38, y - 0.06, 0.76, 0.12); inked(g, pd, lw * 0.8); }
    g.strokeStyle = rgba('#5a4030', 0.75); g.lineWidth = lw * 0.6;
    [[0.52, 0.5], [0.42, 0.42], [0.32, 0.48], [0.22, 0.3]].forEach(([y, w], i) => {
      g.beginPath(); g.moveTo(-0.24, y);
      for (let x = -0.24; x < -0.24 + w; x += 0.06) g.quadraticCurveTo(x + 0.015, y + (i % 2 ? 0.03 : -0.03), x + 0.03, y), g.quadraticCurveTo(x + 0.045, y + (i % 2 ? -0.03 : 0.03), x + 0.06, y);
      g.stroke();
    });
  },
  book(g, o, lw) {
    g.beginPath(); g.rect(-0.35, -0.05, 0.7, 0.5); inked(g, col(o.color || 'darkRed'), lw);
    g.fillStyle = '#e9b43c'; g.fillRect(-0.04, 0.05, 0.08, 0.3); g.fillRect(-0.12, 0.17, 0.24, 0.06);
  },
};
function fig(g, x, y, i, lw) {
  // a small DRIED fig: brown-purple, flattened, wrinkled, a short stem
  const c = ['#9c6a52', '#8a5a46', '#a8744e'][i % 3];
  g.beginPath(); g.moveTo(x, y + 0.11);
  g.bezierCurveTo(x - 0.1, y + 0.11, x - 0.19, y + 0.06, x - 0.18, y - 0.02); g.bezierCurveTo(x - 0.16, y - 0.1, x + 0.16, y - 0.1, x + 0.18, y - 0.02);
  g.bezierCurveTo(x + 0.19, y + 0.06, x + 0.1, y + 0.11, x, y + 0.11); g.closePath();
  const fg = g.createRadialGradient(x - 0.06, y + 0.03, 0.02, x, y, 0.2); fg.addColorStop(0, shade(c, 0.28)); fg.addColorStop(1, c);
  inked(g, fg, lw * 0.8);
  g.strokeStyle = rgba(shade(c, -0.45), 0.6); g.lineWidth = lw * 0.5;
  for (const d of [-0.08, 0.02, 0.1]) { g.beginPath(); g.moveTo(x + d, y + 0.08); g.quadraticCurveTo(x + d * 1.4, y, x + d, y - 0.07); g.stroke(); }
  g.beginPath(); g.moveTo(x, y + 0.1); g.lineTo(x + 0.02, y + 0.15); g.strokeStyle = '#4a2e1a'; g.lineWidth = lw * 1.1; g.stroke();
}
// where the hand grips each prop (local offset of the prop origin from the hand centre)
export const HOLD2D = { figs: [0, 0.08], basket: [0, -0.7], handles: [0, 0], jug: [0.05, -0.45], bread: [0, 0.05], candle: [0, 0.05], staff: [0, 0], book: [0, 0.05], coin: [0, 0.02], scroll: [0, 0.1], greens: [0, 0.03] };

/** a mat (rogojină) lying flat on the ground, woven stripes and a fringe */
export function drawMat(g, V, x, z, o) {
  const w = 1.6 * (o.scale ?? 1), d = 1.0 * (o.scale ?? 1);
  const P = [[-w, -d], [w, -d], [w, d], [-w, d]].map(([dx, dz]) => V.P(x + dx, 0.02, z + dz));
  if (P.some((p) => !p)) return;
  const s = V.P(x, 0, z)[2], lw = Math.max(1, 0.05 * s);
  g.beginPath(); g.moveTo(P[0][0], P[0][1]); for (const p of P.slice(1)) g.lineTo(p[0], p[1]); g.closePath();
  inked(g, col(o.color || '#d9b877'), lw);
  g.save(); g.clip(); g.strokeStyle = rgba('#a7864a', 0.7); g.lineWidth = lw * 0.8;
  for (let k = -0.8; k <= 0.8; k += 0.2) { const a = V.P(x - w, 0.02, z + k * d), b = V.P(x + w, 0.02, z + k * d); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  g.strokeStyle = rgba('#c0504a', 0.8); g.lineWidth = lw * 1.5;
  for (const k of [-0.55, 0.55]) { const a = V.P(x - w, 0.02, z + k * d), b = V.P(x + w, 0.02, z + k * d); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  g.restore();
}
