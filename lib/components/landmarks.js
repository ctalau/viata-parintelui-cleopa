// Landmarks: buildings and landscape pieces built from bricks, placeable anywhere — as a prop (`"props": { "c": { "type":
// "chapel", "at": [x, z] } }`) or baked into any set (`"set": { "type": "desert-road", "pieces": [{ "type": "chapel", "at": [x, z], "h": 90 }] }`,
// solid for the `clip` check). Each builder returns a THREE.Group with its origin on the ground, front facing +Z.
// Pure functions of their options (seeded rng), no state between frames.
import * as THREE from 'three';
import { Builder, plastic, color, rng } from './bricks.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const sh = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };
const named = (o, name) => { o.name = name; return o; };
const STONE = ['tan', 'sand', 'tan', 'lightNougat', 'darkTan', 'sand'];
const GREY = ['gray', 'lightGray', 'gray', 'darkGray', 'lightGray'];

// ---------- helpers ----------

/**
 * Voxels → bricks. cells: Map "x,l,z" → colour (x, z = stud cell, l = layer of `hp` plates from y0). Runs of the same colour
 * along x become one brick (≤ 4 long); studs only on cells with nothing above. Cells never overlap, so no z-fighting.
 */
function emitVoxels(b, cells, { y0 = 0, hp = 3, run = 4 } = {}) {
  const h = hp * 0.4;
  const keys = [...cells.keys()].map((k) => k.split(',').map(Number)).sort((a, c) => a[1] - c[1] || a[2] - c[2] || a[0] - c[0]);
  let i = 0;
  while (i < keys.length) {
    const [x, l, z] = keys[i], c = cells.get(`${x},${l},${z}`);
    let n = 1;
    while (n < run && i + n < keys.length) { const [x2, l2, z2] = keys[i + n]; if (l2 !== l || z2 !== z || x2 !== x + n || cells.get(`${x2},${l2},${z2}`) !== c) break; n++; }
    b.brick(x, y0 + l * h, z, n, 1, hp, c, { studs: false });
    for (let k = 0; k < n; k++) if (!cells.has(`${x + k},${l + 1},${z}`)) b._stud(c, x + k + 0.5, y0 + (l + 1) * h, z + 0.5);
    i += n;
  }
}

/** Blob of ellipsoids [cx, cy, cz, r, (sy)] voxelised in bricks; col(x, l, z, r) → colour. */
function blob(b, spheres, col, { hp = 3, y0 = 0, skip, run = 4 } = {}) {
  const h = hp * 0.4, cells = new Map();
  const R = Math.ceil(Math.max(...spheres.map((s) => Math.abs(s[0]) + s[3], 0), ...spheres.map((s) => Math.abs(s[2]) + s[3])));
  const top = Math.max(...spheres.map((s) => s[1] + s[3] * (s[4] || 1)));
  for (let l = 0; y0 + l * h < top; l++) for (let x = -R; x < R; x++) for (let z = -R; z < R; z++) {
    const p = [x + 0.5, y0 + l * h + h / 2, z + 0.5];
    if (skip && skip(x, z)) continue;
    if (spheres.some(([cx, cy, cz, r, sy = 1]) => (p[0] - cx) ** 2 + ((p[1] - cy) / sy) ** 2 + (p[2] - cz) ** 2 < r * r)) cells.set(`${x},${l},${z}`, col(x, l, z));
  }
  emitVoxels(b, cells, { y0, hp, run });
  return cells;
}

/**
 * Walls of a rectangular building in running bond (bricks of 2, offset every other row). x0, z0 = min corner, W × D studs,
 * `rows` bricks tall from y0. holes: [{ side: 'front'|'back'|'left'|'right', a, b, r0, r1 }] = cells a ≤ i < b along that wall
 * (x for front/back, z for left/right), rows r0 ≤ row < r1 left open.
 */
function walls(b, { x0, z0, W, D, rows, y0 = 0, holes = [], pick, studsTop = true }) {
  const lines = [
    ['front', (i) => [i, z0 + D - 1], x0, x0 + W],
    ['back', (i) => [i, z0], x0, x0 + W],
    ['left', (i) => [x0, i], z0 + 1, z0 + D - 1],
    ['right', (i) => [x0 + W - 1, i], z0 + 1, z0 + D - 1],
  ];
  for (let row = 0; row < rows; row++) {
    const y = y0 + row * 1.2, top = studsTop && row === rows - 1;
    for (const [side, at, a, e] of lines) {
      const open = (i) => holes.some((h) => h.side === side && i >= h.a && i < h.b && row >= h.r0 && row < h.r1);
      let i = a;
      while (i < e) {
        if (open(i)) { i++; continue; }
        let n = 1;
        while (i + n < e && !open(i + n) && (i + n - a + row) % 2 !== 0) n++;
        const [x, z] = at(i);
        if (side === 'front' || side === 'back') b.brick(x, y, z, n, 1, 3, pick(), { studs: top });
        else b.brick(x, y, z, 1, n, 3, pick(), { studs: top });
        i += n;
      }
    }
  }
}

/**
 * Gable roof of slope bricks. Ridge along x (axis 'x', slopes fall to ±z) or along z. xa..xb, za..zb = the roof's footprint
 * (with the overhang), y = eaves height. Under each course a filler brick in `gable` colour fills the stepped gable ends.
 */
function gableRoof(b, { xa, xb, za, zb, y, axis = 'x', hp = 2, tiles = ['red', 'darkOrange'], gable = 'tan', inset = 0.5, ridge }) {
  const h = hp * 0.4;
  const span = axis === 'x' ? zb - za : xb - xa;
  const n = Math.floor(span / 2);
  for (let k = 0; k < n; k++) {
    const c = tiles[k % tiles.length], yy = y + k * h;
    if (axis === 'x') {
      b.slope(xa, yy, zb - 1 - k, xb - xa, 1, hp, c, 0);
      b.slope(xa, yy, za + k, xb - xa, 1, hp, c, 2);
      if (zb - 1 - k - (za + k + 1) > 0) b.brick(xa + inset, yy, za + k + 1, xb - xa - 2 * inset, zb - za - 2 * k - 2, hp, gable, { studs: false });
    } else {
      b.slope(xb - 1 - k, yy, za, zb - za, 1, hp, c, 1);
      b.slope(xa + k, yy, za, zb - za, 1, hp, c, 3);
      if (xb - 1 - k - (xa + k + 1) > 0) b.brick(xa + k + 1, yy, za + inset, xb - xa - 2 * k - 2, zb - za - 2 * inset, hp, gable, { studs: false });
    }
  }
  const top = y + n * h;
  const rc = ridge || tiles[0];
  if (span % 2) { // odd span: a ridge row of plain bricks with studs, on top of the last filler
    if (axis === 'x') b.brick(xa, top, za + n, xb - xa, 1, hp, rc, { studs: true });
    else b.brick(xa + n, top, za, 1, zb - za, hp, rc, { studs: true });
    return top + h;
  } else if (axis === 'x') b.tile(xa, top, za + n - 0.5, xb - xa, 1, rc);
  else b.tile(xa + n - 0.5, top, za, 1, zb - za, rc);
  return top;
}

/** Arch spandrel: a w × h block (in the wall plane, depth d along z) with a round arch of radius w/2 cut from below. */
function spandrel(b, x, y, z, w, h, d, c) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(0, h); s.lineTo(w, h); s.lineTo(w, 0); s.absarc(w / 2, 0, w / 2, 0, Math.PI, false);
  const g = new THREE.ExtrudeGeometry(s, { depth: d - 0.02, bevelEnabled: false, curveSegments: 16 });
  g.translate(x, y, z + 0.01);
  b.geo(g, c); b._solid(x, y, z, x + w, y + h, z + d);
}

/** Arch-topped panel (door / window glass) in the wall plane: w wide, straight sides `hs` tall, then a half circle. */
function archPanel(w, hs, d) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(w, 0); s.lineTo(w, hs); s.absarc(w / 2, hs, w / 2, 0, Math.PI, false); s.lineTo(0, 0);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false, curveSegments: 16 });
}

/** Wooden plank door (arch-topped when `arch`), with planks, two iron bands and a ring. Built in the XY plane, z = 0..d. */
function door(w, hs, { arch = false, c = 'reddishBrown', d = 0.25 } = {}) {
  const g = new THREE.Group();
  const geo = arch ? archPanel(w, hs, d) : new THREE.BoxGeometry(w, hs, d).translate(w / 2, hs / 2, d / 2);
  g.add(sh(new THREE.Mesh(geo, plastic(c))));
  const dark = plastic('darkBrown');
  for (let i = 1; i < Math.round(w / 0.5); i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, hs * 0.96, 0.03), dark); l.position.set(i * 0.5, hs * 0.49, d + 0.01); g.add(l); }
  for (const yy of [0.25, 0.75]) { const band = new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, 0.1, 0.04), plastic('darkGray')); band.position.set(w / 2, hs * yy, d + 0.03); g.add(band); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12), plastic('gold', { emissive: 'gold', emissiveIntensity: 0.25 })); ring.position.set(w * 0.8, hs * 0.5, d + 0.05); g.add(ring);
  return g;
}

/** Little plant tuft (3–5 leaves) for the foot of walls. */
function tuft(g, x, z, seed = 1, c = 'brightGreen', s = 1) {
  const r = rng(seed), m = plastic(c), t = new THREE.Group();
  const n = 3 + Math.floor(r() * 3);
  for (let i = 0; i < n; i++) {
    const leaf = sh(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.9 + r() * 0.5, 0.08), m));
    const a = (i / n) * Math.PI * 2 + r();
    leaf.position.set(Math.sin(a) * 0.15, 0.4, Math.cos(a) * 0.15); leaf.rotation.set(Math.cos(a) * 0.5, a, -Math.sin(a) * 0.5); t.add(leaf);
  }
  t.scale.setScalar(s); t.position.set(x, 0, z); g.add(t);
}

/** A small gold cross (two thin bricks, no coplanar faces). */
function goldCross(s = 1) {
  const b = new Builder();
  b.brick(-0.25, 0, -0.25, 0.5, 0.5, 5, 'gold', { studs: false }).brick(-0.8, 1.1, -0.2, 1.6, 0.4, 1, 'gold', { studs: false });
  const g = b.build(); g.scale.setScalar(s);
  g.traverse((o) => { if (o.isMesh) o.material = plastic('gold', { emissive: 'gold', emissiveIntensity: 0.25 }); });
  return g;
}

const darkInside = (w, h) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0x24170f, roughness: 1 }));

/**
 * Ușă de scânduri (a big plank door): vertical planks, three battens with round bolts, an iron ring. Arch-topped (`arch`,
 * default true) to fit the doorway of `sandCell`. Origin = the hinge (its right edge seen from outside, at its outer face):
 * the door spans x -w..0, z -d..0. It opens OUTWARDS: `bend` 0 = shut … 1 = swung open ≈ 95° towards +Z (animate it with
 * `{ "prop": "usa", "bend": 1, "duration": 1.5 }`). `w` 2.9, `h` (straight part, from the ground) 4.75, `lift` (gap under the door, 0.45), `color`.
 */
export function plankDoor(opts = {}) {
  const w = opts.w ?? 2.9, lift = opts.lift ?? 0.45, hs = (opts.h ?? 4.75) - lift, d = 0.3, arch = opts.arch !== false;
  const c = opts.color || 'reddishBrown';
  const g = new THREE.Group(), leaf = new THREE.Group(); leaf.position.y = lift; g.add(leaf); // a gap under it: it swings over the doorstep
  const geo = arch ? archPanel(w, hs, d) : new THREE.BoxGeometry(w, hs, d).translate(w / 2, hs / 2, d / 2);
  geo.translate(-w, 0, -d);
  leaf.add(sh(new THREE.Mesh(geo, plastic(c))));
  const top = arch ? hs + w / 2 : hs;
  const groove = plastic('darkBrown'), batten = plastic('brown'), bolt = plastic('darkBrown');
  for (const side of [1, -1]) { // both faces (the inside shows when it is open)
    const z = side > 0 ? 0.01 : -d - 0.01;
    for (let i = 1; i < 5; i++) {
      const x = -w + (i * w) / 5, yTop = arch ? hs + Math.sqrt(Math.max(0, (w / 2) ** 2 - (x + w / 2) ** 2)) * 0.96 : hs * 0.98;
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, yTop - 0.1, 0.03), groove); l.position.set(x, (yTop - 0.1) / 2 + 0.05, z); leaf.add(l);
    }
    for (const yy of [0.7, hs * 0.52, hs * 0.95]) {
      const b = sh(new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.42, 0.12), batten)); b.position.set(-w / 2, yy, z + side * 0.05); leaf.add(b);
      if (side > 0) for (let k = 0; k < 4; k++) {
        const s = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.12, 12), bolt));
        s.rotation.x = Math.PI / 2; s.position.set(-w * 0.85 + k * w * 0.233, yy, z + 0.16); leaf.add(s);
      }
    }
  }
  const ring = sh(new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 14), plastic('darkGray', { metal: true })));
  ring.position.set(-w + 0.45, hs * 0.55 - 0.3, 0.12); leaf.add(ring);
  const knob = sh(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), plastic('darkGray', { metal: true }))); knob.position.set(-w + 0.45, hs * 0.55, 0.12); leaf.add(knob);
  void top;
  const base = opts.bend ?? 0;
  const pose = (k) => { leaf.rotation.y = Math.max(0, Math.min(1, k)) * 1.66; };
  pose(base);
  g.userData.update = (t, ctx) => pose(ctx?.bend ?? base);
  g.userData.view = { az: 25, el: 10, zoom: 0.5 };
  return named(g, 'door');
}

/**
 * Chilie de piatră din pustie (the sandstone cell of the poster "Ușa prieteniei"): sand / tan brick walls with a few
 * terracotta bricks, a big arched doorway in a dark-red wooden frame with a step, a warm glowing room inside (lit),
 * an arched window on the left of the door, a terracotta tiled roof with round tiles on the eaves, a broken stepped
 * wall running off to the left. Local frame: centre at origin, front (+Z). W 14 × D 10. The doorway is x 2..5.
 * `door` 0..1 = a static plank door, that open (0 shut, default); `door: false` = none (use the prop `plankDoor` at the
 * hinge (5, 4.4) to animate it). `colors`, `roof`, `frame`, `glow` (false = dark inside).
 */
export function sandCell(opts = {}) {
  const r = rng(opts.seed || 41), b = new Builder();
  const pal = opts.colors || ['sand', 'tan', 'sand', 'tan', 'lightNougat', 'sand', 'tan', 'sand', 'lightNougat', 'tan', 'sand', 'nougat', 'tan', 'sand', 'darkOrange', 'lightNougat'];
  const pick = () => pal[Math.floor(r() * pal.length)];
  const W = 14, D = 10, x0 = -7, z0 = -5, rows = 7;
  const frame = opts.frame || 'reddishBrown';
  walls(b, { x0, z0, W, D, rows, pick, studsTop: false, holes: [
    { side: 'front', a: 2, b: 5, r0: 0, r1: 6 },     // doorway (the arch spandrel fills rows 4–5)
    { side: 'front', a: -3, b: -1, r0: 2, r1: 6 },   // window (arched, spandrel in row 5)
    { side: 'left', a: -1, b: 1, r0: 3, r1: 5 },
  ] });
  // arch spandrels over the doorway and the window
  spandrel(b, 2, 4.8, 4, 3, 2.4, 1, pick());
  spandrel(b, -3, 4.8, 4, 2, 2.4, 1, pick());
  // dark-red wooden door frame: two jambs, an arched band, a step
  b.brick(1.4, 0, 5, 0.6, 0.5, 12, frame, { studs: false }).brick(5, 0, 5, 0.6, 0.5, 12, frame, { studs: false });
  const ring = new THREE.Shape(); ring.absarc(0, 0, 2.1, 0, Math.PI, false); ring.lineTo(-1.5, 0); ring.absarc(0, 0, 1.5, Math.PI, 0, true); ring.lineTo(2.1, 0);
  const rg = new THREE.ExtrudeGeometry(ring, { depth: 0.5, bevelEnabled: false, curveSegments: 20 }); rg.translate(3.5, 4.8, 5);
  b.geo(rg, frame); b._solid(1.4, 4.8, 5, 5.6, 6.9, 5.5);
  b.brick(1.4, 0, 5.5, 4.2, 0.45, 1, frame, { studs: false });
  // window frame (tan band) and sill
  const wr = new THREE.Shape(); wr.absarc(0, 0, 1.35, 0, Math.PI, false); wr.lineTo(-1, 0); wr.absarc(0, 0, 1, Math.PI, 0, true); wr.lineTo(1.35, 0);
  const wg = new THREE.ExtrudeGeometry(wr, { depth: 0.3, bevelEnabled: false, curveSegments: 16 }); wg.translate(-2, 4.8, 5);
  b.geo(wg, 'darkTan'); b._solid(-3.35, 4.8, 5, -0.65, 6.15, 5.3);
  b.brick(-3.4, 2.1, 5, 2.8, 0.6, 1, 'darkTan', { studs: false });
  // the roof: terracotta slopes, a round-tile row on the front eave
  const tiles = opts.roof || ['darkOrange', 'nougat'];
  gableRoof(b, { xa: x0 - 0.5, xb: x0 + W + 0.5, za: z0 - 1, zb: z0 + D + 1, y: rows * 1.2, axis: 'x', hp: 2, tiles, gable: pal[0], inset: 0.5, ridge: 'darkOrange' });
  // barrel tiles (half-round, like clay roof tiles) running down both slopes over the stepped slope bricks, and a round ridge
  const th = Math.atan(0.8), zb = z0 + D + 1, len = Math.hypot(6.3, 6.3 * 0.8);
  for (const side of [1, -1]) for (let i = 0; i < W + 1; i++) {
    const cy = new THREE.CylinderGeometry(0.44, 0.44, len, 10, 1, false, 0, Math.PI); cy.rotateX(Math.PI / 2); cy.rotateZ(Math.PI / 2); cy.rotateX(th);
    if (side < 0) cy.rotateY(Math.PI);
    const zc = (zb + 0.4 - 6.3 / 2), yc = rows * 1.2 + 0.42 + 0.8 * (zb - zc) - 0.02 * (i % 2);
    cy.translate(x0 - 0.5 + i + 0.5, yc, side * zc); b.geo(cy, (i * 7 + (side > 0 ? 0 : 3)) % 5 < 2 ? 'nougat' : i % 2 ? 'darkOrange' : '#c0622e');
  }
  const ridgeG = new THREE.CylinderGeometry(0.55, 0.55, W + 1.4, 14); ridgeG.rotateZ(Math.PI / 2); ridgeG.translate(0, rows * 1.2 + 0.42 + 0.8 * zb + 0.1, 0); b.geo(ridgeG, 'darkOrange');
  // broken stepped wall running off to the left (towards -x), and a buttress step on the right corner
  [[4, 0], [4, 1], [3, 2], [3, 3], [2, 4], [1, 5]].forEach(([n, k]) => { for (let row = 0; row < n; row++) b.brick(x0 - 2 - 2 * k, row * 1.2, z0 + 3 + (k % 2) * 0.5 - 0.5 * (k > 2), 2, 1, 3, pick(), { studs: row === n - 1 }); });
  for (let row = 0; row < 3; row++) b.brick(x0 + W, row * 1.2, z0 + D - 3, 1, 3 - row, 3, pick(), { studs: row === 2 });
  const g = b.build();
  // the room inside: a warm glowing box (seen through the doorway and the window) and a soft warm light at the door
  const glow = opts.glow !== false;
  const room = new THREE.Mesh(new THREE.BoxGeometry(W - 2.2, rows * 1.2 - 0.1, D - 2.2), new THREE.MeshStandardMaterial({
    color: glow ? 0xf2a64a : 0x2a1c12, emissive: glow ? 0xc8701e : 0x000000, emissiveIntensity: glow ? 0.75 : 0, roughness: 0.9, side: THREE.BackSide }));
  room.position.set(0, rows * 0.6, 0); g.add(room);
  if (glow) { const L = new THREE.PointLight(0xffb24a, 14, 9, 1.6); L.position.set(3.5, 3.6, 2.6); g.add(L); }
  if (opts.door !== false) { const d = plankDoor({ bend: typeof opts.door === 'number' ? opts.door : 0 }); d.position.set(5, 0, 4.9); g.add(d); }
  [[-8.6, 6.2, 1], [7.6, 6.4, 2], [-10.5, -1, 3]].forEach(([x, z, s]) => tuft(g, x, z, s, s % 2 ? 'brightGreen' : 'green'));
  g.userData.view = { az: -20, el: 14, zoom: 0.75 };
  return named(g, 'cell');
}

// ---------- buildings ----------

/** Chilie de pustnic: a stone hermit cell with a brown tiled gable roof, plank door, small window and a rock behind it. */
function hermitCell(opts = {}) {
  const r = rng(opts.seed || 11), b = new Builder();
  const pal = opts.colors || ['sand', 'tan', 'lightNougat', 'sand'], pick = () => pal[Math.floor(r() * pal.length)];
  const W = 8, D = 6, x0 = -4, z0 = -3, rows = 4;
  walls(b, { x0, z0, W, D, rows, pick, studsTop: false, holes: [
    { side: 'front', a: 0, b: 2, r0: 0, r1: 3 }, // door
    { side: 'front', a: -3, b: -2, r0: 2, r1: 3 }, // window
    { side: 'left', a: -1, b: 0, r0: 2, r1: 3 }, { side: 'right', a: -1, b: 0, r0: 2, r1: 3 },
  ] });
  const roofTop = gableRoof(b, { xa: x0 - 0.5, xb: x0 + W + 0.5, za: z0 - 1, zb: z0 + D + 1, y: rows * 1.2, axis: 'x', hp: 1, tiles: opts.roof || ['reddishBrown', 'brown'], gable: pal[0], inset: 0.5 });
  // rock outcrop behind and to the left
  if (opts.rock !== false) { // a stepped sandstone cliff behind and to the left: terraces, one colour per course
    const cells = new Map();
    for (let x = -10; x < 7; x++) for (let z = -9; z < 2; z++) {
      if (x >= -5 && x < 5 && z >= -4) continue;
      const hh = Math.round(9 - Math.hypot((x + 3) / 6, (z + 7.5) / 3.4) * 4.5 - Math.max(0, x - 1) * 0.7);
      for (let l = 0; l < hh; l++) cells.set(`${x},${l},${z}`, l % 2 ? 'darkTan' : 'tan');
    }
    emitVoxels(b, cells, { hp: 3 });
  }
  const g = b.build();
  const dk = darkInside(2, 3.6); dk.position.set(1, 1.8, z0 + D - 0.9); g.add(dk);
  const dr = door(2, 3.5, { c: opts.door || 'reddishBrown' }); dr.position.set(0, 0, z0 + D - 0.75); dr.rotation.y = 0; g.add(dr);
  const win = darkInside(1, 1.2); win.position.set(-2.5, 3.0, z0 + D - 0.85); g.add(win);
  const win2 = darkInside(1, 1.2); win2.rotation.y = Math.PI / 2; win2.position.set(x0 + W - 0.85, 3.0, -0.5); g.add(win2);
  const sill2 = sh(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 1.4), plastic('darkTan'))); sill2.position.set(x0 + W + 0.05, 2.35, -0.5); g.add(sill2);
  const sill = sh(new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.4), plastic('darkTan'))); sill.position.set(-2.5, 2.35, z0 + D + 0.05); g.add(sill);
  [[-4.6, 3.6, 1], [4.6, 3.4, 2], [3.2, 3.8, 3], [5.2, -1, 4]].forEach(([x, z, s]) => tuft(g, x, z, s, s % 2 ? 'brightGreen' : 'green'));
  g.userData.view = { az: 24, el: 18, zoom: 0.8 };
  void roofTop;
  return named(g, 'hermit cell');
}

/** Mănăstire mică / capelă: a small stone church with a red gable roof, arched door, arched windows, a bell gable with a
 * gold cross and stone steps. `walls` colours, `roof` tiles, `door`. */
function chapel(opts = {}) {
  const r = rng(opts.seed || 21), b = new Builder();
  const pal = opts.walls || ['tan', 'sand', 'lightNougat', 'tan', 'sand'], pick = () => pal[Math.floor(r() * pal.length)];
  const W = 9, D = 10, x0 = -4.5, z0 = -5, rows = 5, y0 = 0.8;
  b.brick(x0 - 1, 0, z0 - 1, W + 2, D + 2, 2, 'gray', { studs: false }); // stone plinth
  b.brick(-2.5, 0, z0 + D + 1, 5, 1.5, 1, 'lightGray', { studs: false }); // front step
  walls(b, { x0, z0, W, D, rows, y0, pick, studsTop: false, holes: [
    { side: 'front', a: -1.5, b: 1.5, r0: 0, r1: 5 },
    { side: 'left', a: -3, b: -2, r0: 2, r1: 4 }, { side: 'left', a: 1, b: 2, r0: 2, r1: 4 },
    { side: 'right', a: -3, b: -2, r0: 2, r1: 4 }, { side: 'right', a: 1, b: 2, r0: 2, r1: 4 },
    { side: 'front', a: -3.5, b: -2.5, r0: 2, r1: 4 }, { side: 'front', a: 2.5, b: 3.5, r0: 2, r1: 4 },
  ] });
  // arches: over the door (r 1.5) and the windows (r 0.5)
  spandrel(b, -1.5, y0 + 3 * 1.2, z0 + D - 1, 3, 2.4, 1, pick()); // door arch fills rows 3-4
  for (const x of [-3.5, 2.5]) spandrel(b, x, y0 + 3 * 1.2, z0 + D - 1, 1, 1.2, 1, pick());
  const g0 = gableRoof(b, { xa: x0 - 1, xb: x0 + W + 1, za: z0 - 1, zb: z0 + D + 1, y: y0 + rows * 1.2, axis: 'z', hp: 2, tiles: opts.roof || ['#c8502e', '#b4441f'], gable: pal[0], inset: 1 });
  void g0;
  const g = b.build();
  // side window arches (built in the XY plane → turn them into the side walls)
  for (const sx of [x0, x0 + W - 1]) for (const z of [-3, 1]) {
    const sb = new Builder(); spandrel(sb, 0, 0, 0, 1, 1.2, 1, pal[1]); const s = sb.build();
    s.rotation.y = -Math.PI / 2; s.position.set(sx + 1, y0 + 3 * 1.2, z); g.add(s);
    const glass = new THREE.Mesh(archPanel(1, 1.2, 0.02), plastic('darkBlue')); glass.rotation.y = -Math.PI / 2; glass.position.set(sx + 0.5, y0 + 2.4, z); g.add(glass);
  }
  for (const x of [-3.5, 2.5]) { const glass = new THREE.Mesh(archPanel(1, 1.2, 0.02), plastic('darkBlue')); glass.position.set(x, y0 + 2.4, z0 + D - 0.5); g.add(glass); }
  const dk = darkInside(3, 5.2); dk.position.set(0, y0 + 2.6, z0 + D - 0.95); g.add(dk);
  const dr = door(3, 3.6, { arch: true, c: opts.door || 'reddishBrown' }); dr.position.set(-1.5, y0, z0 + D - 0.7); g.add(dr);
  // bell gable on the front: two piers, a little arch with a bell, a cap and a cross
  const roofTop = y0 + rows * 1.2 + Math.floor((W + 2) / 2) * 0.8;
  const bb = new Builder();
  bb.brick(-1.5, 0, 0, 1, 1, 6, pal[0], { studs: false }).brick(0.5, 0, 0, 1, 1, 6, pal[0], { studs: false });
  spandrel(bb, -0.5, 1.2, 0, 1, 1.2, 1, pal[2]);
  bb.brick(-1.5, 2.4, 0, 3, 1, 2, pal[1], { studs: false });
  bb.slope(-1.7, 3.2, -0.2, 1.4, 1.7, 2, opts.roof?.[0] || '#c8502e', 3).slope(0, 3.2, -0.2, 1.4, 1.7, 2, opts.roof?.[0] || '#c8502e', 1);
  const gy = roofTop - 0.4;
  if (opts.belfry === 'dome') {
    // `belfry: "dome"`: a little square belfry with a round dome and a cross over the front gable (instead of the bell gable),
    // two columns beside the door under an arch moulding, stone steps, an amphora and plants
    const bt = bellTower({ height: 1, walls: pal, dome: pal[1], seed: 23, tufts: false }); bt.scale.setScalar(0.62);
    bt.position.set(0, gy - 1.6, z0 + D - 2.2); g.add(bt);
    const cm = plastic(pal[0] === 'tan' ? 'cream' : pal[0]);
    for (const sx of [-1, 1]) {
      const col = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 3.8, 14), cm)); col.position.set(sx * 2.0, y0 + 1.9, z0 + D + 0.35); g.add(col);
      const cap = sh(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), plastic('lightNougat'))); cap.position.set(sx * 2.0, y0 + 3.95, z0 + D + 0.35); g.add(cap);
      const base = sh(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.3, 0.8), plastic('lightNougat'))); base.position.set(sx * 2.0, y0 + 0.15, z0 + D + 0.35); g.add(base);
    }
    const arch = sh(new THREE.Mesh(new THREE.TorusGeometry(2.0, 0.22, 8, 24, Math.PI), plastic('lightNougat'))); arch.position.set(0, y0 + 4.1, z0 + D + 0.35); g.add(arch);
    const amp = amphora({ size: 0.55, color: 'darkOrange' }); amp.position.set(-4.6, 0.8, z0 + D + 1.4); g.add(amp);
    g.userData.view = { az: 30, el: 14, zoom: 0.8 };
    [[-5.8, 5.5, 1], [5.8, 5.3, 2], [3.5, 6.4, 3], [-3.2, 6.6, 4]].forEach(([x, z, sd]) => tuft(g, x, z, sd, 'green', 1.2));
    return named(g, 'chapel');
  }
  const bell = bb.build(); bell.position.set(0, gy, z0 + D - 0.2); g.add(bell);
  const bl = sh(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.4, 0], [0.32, 0.25], [0.24, 0.7], [0.1, 0.8], [0, 0.8]].map(([x, y]) => new THREE.Vector2(x, y)), 14), plastic('gold', { emissive: 'gold', emissiveIntensity: 0.25 })));
  bl.position.set(0, gy + 0.3, z0 + D + 0.3); g.add(bl);
  const cr = goldCross(0.9); cr.position.set(0, gy + 3.95, z0 + D + 0.3); g.add(cr);
  [[-5.8, 5.5, 1], [5.8, 5.3, 2], [-5.9, -2, 3], [6, 1, 5]].forEach(([x, z, s]) => tuft(g, x, z, s));
  g.userData.view = { az: 30, el: 14, zoom: 0.8 };
  return named(g, 'chapel');
}

/** Poartă de mănăstire: a big round-arched gateway between two piers with a terracotta tiled cap, a gold cross, two wooden
 * doors standing half open and two low walls on the sides. `open` 0..1 (0.35), `walls`, `roof`, `door`. */
function gate(opts = {}) {
  const r = rng(opts.seed || 31), b = new Builder();
  const pal = opts.walls || ['tan', 'sand', 'lightNougat', 'tan'], pick = () => pal[Math.floor(r() * pal.length)];
  // piers x -6..-3 and 3..6, depth z -1..1; opening 6 wide: rows 0-3 straight, round arch (r 3) in rows 4-6, row 7 across
  const rows = 7;
  for (let row = 0; row < rows; row++) for (const x of [-6, 3]) {
    if (row % 2) { b.brick(x, row * 1.2, -1, 3, 1, 3, pick(), { studs: false }); b.brick(x, row * 1.2, 0, 3, 1, 3, pick(), { studs: false }); }
    else { b.brick(x, row * 1.2, -1, 1, 2, 3, pick(), { studs: false }); b.brick(x + 1, row * 1.2, -1, 2, 2, 3, pick(), { studs: false }); }
  }
  spandrel(b, -3, 4.8, -1, 6, 3.6, 2, pal[1]);
  for (const [x, w] of [[-6, 4], [-2, 4], [2, 4]]) b.brick(x, 8.4, -1, w, 2, 3, pick(), { studs: false });
  const capY = 9.6;
  gableRoof(b, { xa: -6.5, xb: 6.5, za: -2, zb: 2, y: capY, axis: 'x', hp: 2, tiles: opts.roof || ['#c8502e', '#b4441f'], gable: pal[0], inset: 0.5 });
  // low side walls (as high as the arch springs), with a stepped, broken far end
  for (const [xa, xb] of [[-12, -6], [6, 12]]) for (let row = 0; row < 4; row++) {
    let x = xa;
    if (row % 2) { b.brick(x, row * 1.2, -0.5, 1, 1, 3, GREY[row], { studs: false }); x++; }
    while (x < xb) {
      const n = Math.min(2, xb - x);
      const far = xa < 0 ? x - xa : xb - (x + n); // distance from the far end
      if (!(row >= 2 && far < (row - 1) * 2)) b.brick(x, row * 1.2, -0.5, n, 1, 3, row === 0 ? GREY[Math.floor(r() * 3)] : r() < 0.85 ? pick() : 'lightGray', { studs: row === 3 || (row >= 1 && far < row * 2) });
      x += n;
    }
  }
  const g = b.build();
  const dk = darkInside(6, 7.8); dk.position.set(0, 3.9, -0.6); g.add(dk);
  const open = opts.open ?? 0.35;
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(sx * 3, 0.02, 0.45);
    const d = door(3, 4.8, { c: opts.door || 'reddishBrown' });
    // the top of each leaf follows the arch (a quarter circle round the gate's centre)
    const qs = new THREE.Shape(); qs.moveTo(0, 0); qs.lineTo(3, 0); qs.lineTo(3, 3); qs.absarc(3, 0, 3, Math.PI / 2, Math.PI, false);
    const top = sh(new THREE.Mesh(new THREE.ExtrudeGeometry(qs, { depth: 0.25, bevelEnabled: false, curveSegments: 14 }), plastic(opts.door || 'reddishBrown')));
    top.position.set(0, 4.78, 0); d.add(top);
    if (sx > 0) d.scale.x = -1;
    piv.add(d); piv.rotation.y = -sx * open * 1.4;
    g.add(piv);
  }
  const cr = goldCross(1.2); cr.position.set(0, capY + 2 * 0.8 + 0.3, 0); g.add(cr);
  [[-12.4, 0.9, 1], [12.4, 1, 2], [-5.5, 1.8, 3], [5.6, 1.7, 4]].forEach(([x, z, s]) => tuft(g, x, z, s));
  g.userData.view = { az: 22, el: 12, zoom: 0.78 };
  return named(g, 'monastery gate');
}

/** Stepped pyramid roof of tile slopes over a square S × S (centred), from y; ends in a small cap. Returns the top y. */
function tiledPyramid(b, S, y, tiles, filler, hp = 2) {
  const h = hp * 0.4;
  let k = 0;
  for (let s = S; s >= 2; s -= 2, k++) {
    const a = -s / 2, c = tiles[k % tiles.length], yy = y + k * h;
    b.slope(a, yy, a + s - 1, s, 1, hp, c, 0).slope(a, yy, a, s, 1, hp, c, 2);
    if (s > 2) { b.slope(a + s - 1, yy, a + 1, s - 2, 1, hp, c, 1).slope(a, yy, a + 1, s - 2, 1, hp, c, 3); }
    if (s > 2) b.brick(a + 1, yy, a + 1, s - 2, s - 2, hp, filler, { studs: false });
  }
  return y + k * h;
}

/** Turn-clopotniță: a square stone bell tower on a grey plinth — an arched window, a big open belfry with a gold bell, a
 * stepped terracotta tiled roof and a gold cross. `height` = rows of the shaft (4), `walls`, `roof`. */
function bellTower(opts = {}) {
  const r = rng(opts.seed || 41), b = new Builder();
  const pal = opts.walls || ['cream', 'tan', 'sand', 'cream'], pick = () => pal[Math.floor(r() * pal.length)];
  const N = opts.height || 4, W = 5, x0 = -2.5, z0 = -2.5;
  b.brick(x0 - 0.5, 0, z0 - 0.5, W + 1, W + 1, 3, 'gray', { studs: false });
  b.brick(x0 - 0.25, 1.2, z0 - 0.25, W + 0.5, W + 0.5, 1, 'lightGray', { studs: false });
  walls(b, { x0, z0, W, D: W, rows: N, y0: 1.6, pick, studsTop: false, holes: [{ side: 'front', a: -0.5, b: 0.5, r0: 1, r1: 3 }] });
  spandrel(b, -0.5, 1.6 + 2 * 1.2, z0 + W - 1, 1, 1.2, 1, pal[1]);
  const g0 = 1.6 + N * 1.2;
  b.brick(x0 - 0.3, g0, z0 - 0.3, W + 0.6, W + 0.6, 1, 'lightGray', { studs: false }); // cornice
  // belfry: corner piers (1 × 1, 4 rows) and round arches (r 1.5) on all four sides
  const by = g0 + 0.4, bh = 4.8;
  for (const [x, z] of [[x0, z0], [x0 + W - 1, z0], [x0, z0 + W - 1], [x0 + W - 1, z0 + W - 1]]) b.brick(x, by, z, 1, 1, 12, pick(), { studs: false });
  spandrel(b, x0 + 1, by + 3.0, z0 + W - 1, 3, 1.8, 1, pal[1]);
  spandrel(b, x0 + 1, by + 3.0, z0, 3, 1.8, 1, pal[1]);
  b.brick(x0 - 0.3, by + bh, z0 - 0.3, W + 0.6, W + 0.6, 2, pal[0], { studs: false });
  const ry = by + bh + 0.8;
  b.brick(-3.5, ry, -3.5, 7, 7, 1, '#b4441f', { studs: false }); // eaves
  const top = opts.dome ? ry + 0.4 + 1.2 + 2.3 : tiledPyramid(b, 6, ry + 0.4, opts.roof || ['#c8502e', '#b4441f'], pal[0]);
  if (opts.dome) b.round(0, ry + 0.4, 0, 2.3, 1.2, pal[0], { studs: false, seg: 20 }); // a drum under the dome
  const g = b.build();
  if (opts.dome) { // `dome: true` = a round sandstone dome instead of the pyramid roof
    const dm = sh(new THREE.Mesh(new THREE.SphereGeometry(2.4, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2), plastic(opts.dome === true ? pal[0] : opts.dome))); dm.position.y = ry + 1.6; g.add(dm);
  }
  for (const sx of [x0, x0 + W - 1]) { const sb = new Builder(); spandrel(sb, 0, 0, 0, 3, 1.8, 1, pal[1]); const s = sb.build(); s.rotation.y = -Math.PI / 2; s.position.set(sx + 1, by + 3.0, z0 + 1); g.add(s); }
  const win = new THREE.Mesh(archPanel(1, 1.2, 0.02), plastic('darkBlue')); win.position.set(-0.5, 1.6 + 1.2, z0 + W - 0.5); g.add(win);
  const ins = new THREE.Mesh(new THREE.BoxGeometry(W - 2.1, 0.1, W - 2.1), plastic('darkTan')); ins.position.set(0, by + 0.05, 0); g.add(ins);
  // the bell, hung from a beam
  const bell = sh(new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [1.0, 0], [0.85, 0.35], [0.6, 1.5], [0.3, 1.8], [0, 1.8]].map(([x, y]) => new THREE.Vector2(x, y)), 20), plastic('gold', { emissive: 'gold', emissiveIntensity: 0.25 })));
  bell.position.set(0, by + 1.0, 0); g.add(bell);
  const lip = sh(new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.07, 6, 24), plastic('gold', { emissive: 'gold', emissiveIntensity: 0.25 }))); lip.rotation.x = Math.PI / 2; lip.position.set(0, by + 1.03, 0); g.add(lip);
  const clap = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), plastic('darkGray')); clap.position.set(0, by + 0.85, 0); g.add(clap);
  const beam = sh(new THREE.Mesh(new THREE.BoxGeometry(W - 2, 0.35, 0.35), plastic('reddishBrown'))); beam.position.set(0, by + 3.0, 0); g.add(beam);
  const hook = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 6), plastic('darkGray')); hook.position.set(0, by + 2.75, 0); g.add(hook);
  const cr = goldCross(1.0); cr.position.set(0, top - 0.1, 0); g.add(cr);
  if (opts.tufts !== false) [[-3.6, 3.4, 1], [3.6, 3.6, 2]].forEach(([x, z, s]) => tuft(g, x, z, s));
  g.userData.view = { az: 28, el: 10, zoom: 0.85 };
  return named(g, 'bell tower');
}

/** Fântână din piatră: a round well of grey stone bricks (3 rows) with two short wooden posts, a crossbeam with a roller,
 * a rope and a wooden bucket, water inside. `colors`, `wood`. */
function stoneWell(opts = {}) {
  const r = rng(opts.seed || 45), b = new Builder();
  const cols = opts.colors || ['gray', 'lightGray', 'gray', 'lightGray', 'darkGray'];
  // a round ring of stone bricks, each turned along the circle (offset every other row), studs on top
  const R0 = 2.6, n = 12, rows = 2;
  for (let row = 0; row < rows; row++) for (let i = 0; i < n; i++) {
    const a = ((i + (row % 2) * 0.5) / n) * Math.PI * 2, c = (opts.colors || ['gray', 'lightGray'])[(i + row) % 2]; void cols; void r;
    const geo = new THREE.BoxGeometry(1.34, 1.19, 1.0); geo.rotateY(-a); geo.translate(Math.cos(a) * R0, row * 1.2 + 0.6, Math.sin(a) * R0);
    b.geo(geo, c); b._solid(Math.cos(a) * R0 - 0.7, row * 1.2, Math.sin(a) * R0 - 0.7, Math.cos(a) * R0 + 0.7, row * 1.2 + 1.2, Math.sin(a) * R0 + 0.7);
    if (row === rows - 1) for (const t of [-0.32, 0.32]) { const tx = -Math.sin(a) * t, tz = Math.cos(a) * t; b._stud(c, Math.cos(a) * R0 + tx, rows * 1.2, Math.sin(a) * R0 + tz); }
  }
  const wood = opts.wood || '#9a6234';
  const top = rows * 1.2;
  for (const x of [-R0 - 0.5, R0 - 0.5]) b.brick(x, top, -0.5, 1, 1, 7, wood, { studs: false });
  b.brick(-R0 - 0.8, top + 2.8, -0.5, 2 * R0 + 1.6, 1, 2, wood, { studs: false });
  if (opts.roof) { // a little gable roof of terracotta tiles on taller posts (the well of the courtyard)
    for (const x of [-R0 - 0.5, R0 - 0.5]) b.brick(x, top + 3.6, -0.5, 1, 1, 3, wood, { studs: false });
    b.brick(-R0 - 0.8, top + 4.8, -1, 2 * R0 + 1.6, 2, 1, wood, { studs: false });
    gableRoof(b, { xa: -R0 - 1.4, xb: R0 + 1.4, za: -2.5, zb: 2.5, y: top + 5.2, axis: 'x', hp: 2, tiles: opts.tiles || ['#a8482a', '#8e3a22'], gable: wood, inset: 1.2 });
  }
  const g = b.build();
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.05, 28), plastic('mediumAzure')); water.rotation.x = -Math.PI / 2; water.position.y = top - 0.5; g.add(water);
  const ry = top + 2.1;
  const roller = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 2 * R0 - 1.05, 14), plastic('brown'))); roller.rotation.z = Math.PI / 2; roller.position.set(0, ry, 0); g.add(roller);
  const crank = sh(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.18), plastic(wood))); crank.position.set(R0 + 0.75, ry - 0.3, 0); g.add(crank);
  const axle = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.6, 8), plastic('darkGray'))); axle.rotation.z = Math.PI / 2; axle.position.set(R0 + 0.55, ry, 0); g.add(axle);
  const coil = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.8, 14), plastic('yellow'))); coil.rotation.z = Math.PI / 2; coil.position.set(0, ry, 0); g.add(coil);
  const rope = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), plastic('yellow'))); rope.position.set(0, ry - 0.5, 0.36); g.add(rope);
  const bk = bucket({}); bk.scale.setScalar(1.05); bk.position.set(0, ry - 0.68, 0.36); g.add(bk);
  [[-3.6, 2.4, 1], [3.5, 2.6, 2], [0.5, 3.4, 3]].forEach(([x, z, s]) => tuft(g, x, z, s));
  g.userData.view = { az: 20, el: 16, zoom: 0.85 };
  return named(g, 'stone well');
}

/** Zid scund de curte: a low courtyard wall of mixed sand and grey stones with an uneven top. `length` (12), `rows` (3). */
function wall(opts = {}) {
  const r = rng(opts.seed || 51), b = new Builder();
  const L = opts.length || 9, rows = opts.rows || 3;
  const pal = opts.colors || ['tan', 'sand', 'tan', 'lightNougat', 'sand', 'lightGray', 'darkTan'];
  const x0 = -L / 2;
  for (let row = 0; row < rows; row++) {
    let x = x0;
    if (row % 2) { b.brick(x, row * 1.2, -0.5, 1, 1, 3, pal[Math.floor(r() * pal.length)], { studs: true }); x += 1; }
    while (x < x0 + L) {
      const n = Math.min(r() < 0.3 ? 3 : 2, x0 + L - x);
      // broken, stepped top: the right end steps down, a stone is missing here and there
      const gap = (row === rows - 1 && (x + n > x0 + L - 3 || r() < 0.25)) || (row === rows - 2 && x + n > x0 + L - 1);
      if (!gap) b.brick(x, row * 1.2, -0.5, n, 1, 3, pal[Math.floor(r() * pal.length)], { studs: true });
      x += n;
    }
  }
  // a few stones on top
  b.brick(x0 + 1, rows * 1.2, -0.5, 2, 1, 1, 'lightGray', { studs: true });
  const g = b.build();
  [[x0 + 0.3, 0.9, 1], [x0 + L - 1.5, 0.8, 2], [0, 0.9, 3], [x0 + L, 0.4, 4]].forEach(([x, z, s]) => tuft(g, x, z, s, 'brightGreen', 0.8));
  g.userData.view = { az: 26, el: 18, zoom: 0.8 };
  return named(g, 'low wall');
}

// ---------- landscape ----------

/** Palmier: a date palm — a curved trunk of brick rings and a crown of big drooping fronds with dates. `height` (9), `seed`. */
function palm(opts = {}) {
  const r = rng(opts.seed || 3), g = new THREE.Group(), b = new Builder();
  const H = opts.height || 8, segs = Math.round(H / 1.2), bend = 0.8 + r() * 0.5;
  // trunk: round 2 × 2 bricks stacked with a little offset each (a leaning, ringed trunk)
  let x = 0;
  for (let i = 0; i < segs; i++) { const u = i / segs; x = bend * u * u * 2.2; b.round(x, i * 1.2, 0, 0.85 - u * 0.15, 1.16, i % 2 ? 'reddishBrown' : 'brown', { studs: false, seg: 12 }); }
  const top = new THREE.Vector3(x, segs * 1.2, 0);
  b.round(x, top.y, 0, 0.75, 0.4, 'darkBrown', { studs: false });
  g.add(b.build());
  const leafM = [plastic(opts.leaves?.[0] || 'brightGreen'), plastic(opts.leaves?.[1] || 'green')];
  // fronds: a stalk of wide leaf plates rising, then arching out and down, with a darker midrib
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.3;
    const frond = new THREE.Group(); frond.position.set(top.x, top.y + 0.35, 0); frond.rotation.y = a; g.add(frond);
    let px = 0, py = 0, ang = -0.35 + (i % 2) * 0.2;
    for (let k = 0; k < 6; k++) {
      const len = 1.4, wdt = 2.7 - Math.abs(k - 2.0) * 0.42;
      const p = sh(new THREE.Mesh(new THREE.BoxGeometry(wdt, 0.14, len + 0.1), leafM[k % 2]));
      p.position.set(0, py - Math.sin(ang) * len / 2, px + Math.cos(ang) * len / 2); p.rotation.x = ang; frond.add(p);
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, len + 0.1), plastic('green')); rib.position.copy(p.position); rib.rotation.x = ang; frond.add(rib);
      px += Math.cos(ang) * len; py -= Math.sin(ang) * len; ang += 0.3;
    }
  }
  for (let i = 0; i < 7; i++) { const d = sh(new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 10), plastic(opts.fruit || (i % 2 ? 'brown' : 'darkBrown')))); const a = i * 0.9; d.position.set(top.x + Math.cos(a) * 0.62, top.y - 0.25 - (i % 3) * 0.25, Math.sin(a) * 0.62); g.add(d); }
  g.userData.view = { az: 20, el: 12, zoom: 0.85 };
  return named(g, 'palm');
}

/** Chiparos: a tall slim cypress of stacked green bricks on a short brown trunk. `height` = layers (10), `leaves`. */
function cypress(opts = {}) {
  const r = rng(opts.seed || 61), b = new Builder();
  const lv = opts.leaves || ['green', 'green', '#2f8a4c'];
  b.round(0, 0, 0, 0.45, 1.2, 'reddishBrown', { studs: false });
  const N = opts.height || 11, cells = new Map();
  for (let l = 0; l < N; l++) {
    const u = l / (N - 1), rad = 0.55 + 1.45 * Math.sin(Math.PI * Math.min(1, 0.22 + u * 0.82)) * (u < 0.3 ? 1 : 1.12 - u * 0.4);
    for (let x = -3; x < 3; x++) for (let z = -3; z < 3; z++) if (Math.hypot(x + 0.5, z + 0.5) < rad + 0.15) cells.set(`${x},${l},${z}`, lv[Math.floor(r() * lv.length)]);
    if (l === N - 1) cells.set(`-1,${l},-1`, lv[0]);
  }
  emitVoxels(b, cells, { y0: 1.2, hp: 3 });
  const g = b.build(); g.userData.view = { az: 25, el: 8, zoom: 0.85 };
  return named(g, 'cypress');
}

/** Copac foios: a round leafy tree — brick trunk with two branches and a lumpy crown of green bricks. `leaves`, `seed`. */
function leafyTree(opts = {}) {
  const r = rng(opts.seed || 71), b = new Builder();
  const lv = opts.leaves || ['green', 'brightGreen'];
  const bark = opts.trunk || 'reddishBrown';
  // a thick trunk splitting into a Y: two branches climbing outwards in steps
  b.brick(-1, 0, -1, 2, 2, 3, bark, { studs: false });
  b.brick(-0.75, 1.2, -0.75, 1.5, 1.5, 6, bark, { studs: false });
  for (let k = 0; k < 3; k++) { b.brick(-1.25 - k * 0.6, 3.6 + k * 1.2, -0.5, 1, 1, 3, bark, { studs: false }); b.brick(0.25 + k * 0.6, 3.6 + k * 1.2, -0.5, 1, 1, 3, bark, { studs: false }); }
  // canopy: stacked layers of plates, wide and flat, a bit uneven (cells never overlap)
  const layers = [[3.2, 0], [4.6, 1], [5.0, 0], [4.4, 1], [3.2, 0], [1.8, 1]];
  const cells = new Map();
  layers.forEach(([rad, k], l) => {
    for (let x = -6; x < 6; x++) for (let z = -6; z < 6; z++) if (Math.hypot(x + 0.5, (z + 0.5) * 1.12) < rad + 0.25 - r() * 0.7) cells.set(`${x},${l},${z}`, r() < 0.25 ? lv[1 - k] : lv[k]);
  });
  emitVoxels(b, cells, { y0: 7.2, hp: 2 });
  const g = b.build(); g.userData.view = { az: 25, el: 14, zoom: 0.85 };
  return named(g, 'tree');
}

/** Tufiș / arbust: a low round bush of green bricks. `size` (1), `leaves`. */
function bush(opts = {}) {
  const r = rng(opts.seed || 81), b = new Builder(), s = (opts.size || 1) * 1.5;
  blob(b, [[0, 0.9 * s, 0, 2.1 * s, 0.95], [1.6 * s, 0.6 * s, 0.6 * s, 1.4 * s, 0.95], [-1.5 * s, 0.6 * s, -0.4 * s, 1.5 * s, 0.95]],
    (x, l) => (l === 0 ? 'green' : l >= 3 ? (r() < 0.5 ? 'lime' : 'brightGreen') : r() < 0.6 ? 'brightGreen' : 'green'), { hp: 2, run: 2 });
  const g = b.build();
  for (const [x, z] of [[0.4, 1.4], [-1, 0.9], [1.3, 0.2]]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), plastic(opts.flowers || 'yellow')); f.position.set(x * s, 2.6 * s, z * s); if (opts.flowers !== false) g.add(f); }
  g.userData.view = { az: 25, el: 20, zoom: 0.85 };
  return named(g, 'bush');
}

/** Formațiune de stânci: a rocky outcrop of grey bricks with two or three peaks. `colors`, `size` (1), `seed`. */
function rocks(opts = {}) {
  const r = rng(opts.seed || 91), b = new Builder(), s = opts.size || 1;
  const cols = opts.colors || ['gray', 'darkGray', 'lightGray', 'gray'];
  const peaks = opts.peaks || [[-1.5, -0.5, 6.5, 3.2], [2.5, 0.5, 4.5, 2.8], [-4, 1.5, 3, 2.2], [1, 2.5, 2.4, 2.2]];
  const cells = new Map();
  const R = Math.ceil(8 * s);
  for (let x = -R; x < R; x++) for (let z = -R / 2 - 2; z < R / 2 + 2; z++) {
    let hgt = 0;
    for (const [px, pz, ph, pr] of peaks) { const d = Math.hypot(x + 0.5 - px * s, (z + 0.5 - pz * s) * 1.1) / (pr * s); hgt = Math.max(hgt, ph * s * (1 - d * d * 0.55 - d * 0.35)); }
    hgt += (r() - 0.5) * 0.6;
    for (let l = 0; l < Math.round(hgt / 1.2 * 1.15); l++) cells.set(`${x},${l},${z}`, cols[Math.floor(r() * cols.length)]);
  }
  emitVoxels(b, cells, { hp: 3 });
  const g = b.build();
  [[-6, 3, 1], [5.5, 3, 2]].forEach(([x, z, sd]) => tuft(g, x * s, z * s, sd, 'brightGreen', 0.9));
  g.userData.view = { az: 18, el: 16, zoom: 0.78 };
  return named(g, 'rocks');
}

/** Deal / movilă: a low mound — sand and tan layers with green grass on top and a couple of bushes. `radius` (7), `height` (4). */
function hill(opts = {}) {
  const r = rng(opts.seed || 101), b = new Builder();
  const R = opts.radius || 7, H = opts.height || 4;
  const grass = opts.grass || ['brightGreen', 'green', 'brightGreen'], soil = opts.soil || ['tan', 'sand', 'tan', 'darkTan'];
  const hm = new Map();
  for (let x = -R - 1; x < R + 1; x++) for (let z = -R - 1; z < R + 1; z++) {
    const d = Math.hypot((x + 0.5) / R, (z + 0.5) / (R * 0.75));
    const hh = Math.round(H * (1 - d * d) + (x > 0 ? -0.3 : 0.2));
    if (d < 1 && hh > 0) hm.set(`${x},${z}`, hh);
  }
  const cells = new Map();
  for (const [k, hh] of hm) {
    const [x, z] = k.split(',').map(Number);
    for (let l = 0; l < hh; l++) cells.set(`${x},${l},${z}`, l === hh - 1 && hh >= H - 1 ? grass[Math.floor(r() * grass.length)] : soil[Math.floor(r() * soil.length)]);
    // a couple of bushes on the top (cells stacked on the column, so nothing overlaps)
    if (opts.bushes !== false) for (const [bx, bz, br] of [[-1.5, -0.5, 0.9]]) {
      const d = Math.hypot(x + 0.5 - bx, z + 0.5 - bz);
      if (d < br && hh >= H) cells.set(`${x},${hh},${z}`, 'green');
    }
  }
  emitVoxels(b, cells, { hp: 3 });
  const g = b.build(); g.userData.view = { az: 20, el: 20, zoom: 0.78 };
  return named(g, 'hill');
}

/** Parcelă arată (ogor): a ploughed plot — brown ridges and dark furrows inside a green grass border. `width` (12), `depth` (10). */
function plowedPlot(opts = {}) {
  const b = new Builder();
  const W = opts.width || 12, D = opts.depth || 10, x0 = -W / 2, z0 = -D / 2;
  const grass = opts.grass || 'brightGreen';
  b.brick(x0, 0, z0, W, D, 1, opts.soil || '#5a3a22', { studs: false });
  // grass border, studded
  b.brick(x0, 0.4, z0, W, 1, 1, grass).brick(x0, 0.4, z0 + D - 1, W, 1, 1, grass).brick(x0, 0.4, z0 + 1, 1, D - 2, 1, 'green').brick(x0 + W - 1, 0.4, z0 + 1, 1, D - 2, 1, 'green');
  // ridges running away from the camera (along z): a studded ridge of brown bricks, then a dark furrow, then the next ridge
  for (let x = x0 + 1; x < x0 + W - 1; x += 2) {
    for (let z = z0 + 1; z < z0 + D - 1; z += 4) b.brick(x, 0.4, z, 1, Math.min(4, z0 + D - 1 - z), 2, ((x - x0) / 2 + (z - z0) / 4) % 2 ? (opts.ridge || '#8b5a2b') : '#9a6a3a');
    b.tile(x, 1.2, z0 + 1, 1, 0.4, opts.edge || 'tan'); // a lighter end of the ridge (turned earth)
  }
  const g = b.build(); g.userData.view = { az: 18, el: 30, zoom: 0.75 };
  return named(g, 'ploughed plot');
}

/** Lan de grâu: a little patch of ripe wheat on a sand plate — rows of stalks with golden ears. `width` (8), `depth` (5), `color`. */
function wheatPatch(opts = {}) {
  const r = rng(opts.seed || 111), b = new Builder();
  const W = opts.width || 8, D = opts.depth || 5, x0 = -W / 2, z0 = -D / 2;
  b.brick(x0, 0, z0, W, D, 1, opts.soil || 'tan', { studs: false });
  const ears = opts.color ? [opts.color] : ['yellow', 'brightYellow', 'gold'];
  for (let i = 0; i < W / 1.3; i++) for (let j = 0; j < D / 1.3; j++) {
    const x = x0 + 0.65 + i * 1.3 + (r() - 0.5) * 0.35, z = z0 + 0.65 + j * 1.3 + (r() - 0.5) * 0.35, hh = 1.8 + r() * 0.7;
    if (x > x0 + W - 0.3 || z > z0 + D - 0.3) continue;
    const st = new THREE.CylinderGeometry(0.11, 0.12, hh, 6); st.translate(x, 0.4 + hh / 2, z); b.geo(st, 'yellow');
    const ec = ears[Math.floor(r() * ears.length)];
    for (let k = 0; k < 4; k++) { const ear = new THREE.BoxGeometry(0.5 - k * 0.07, 0.34, 0.5 - k * 0.07); ear.rotateY(k * 0.4); ear.translate(x, 0.4 + hh + 0.17 + k * 0.33, z); b.geo(ear, k % 2 ? ec : 'gold'); }
    const leaf = new THREE.BoxGeometry(0.5, 0.08, 0.12); leaf.rotateZ(0.5 * (r() < 0.5 ? 1 : -1)); leaf.translate(x + 0.15, 0.4 + hh * 0.45, z); b.geo(leaf, 'gold');
  }
  b._solid(x0, 0, z0, x0 + W, 3.6, z0 + D);
  const g = b.build(); g.userData.view = { az: 22, el: 22, zoom: 0.75 };
  return named(g, 'wheat patch');
}

/** Găleată: a wooden bucket of staves with two iron hoops and an iron handle. Origin = the top of the handle (the grip). */
export function bucket(opts = {}) {
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const x = c.getContext('2d'); x.fillStyle = '#' + color(opts.color || 'reddishBrown').toString(16).padStart(6, '0'); x.fillRect(0, 0, 128, 32);
  x.fillStyle = 'rgba(0,0,0,0.28)'; for (let i = 0; i < 128; i += 11) x.fillRect(i, 0, 2, 32);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = 2;
  const wm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  const body = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.44, 0.95, 20, 1, true), [wm]));
  body.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }); body.position.y = -1.15; g.add(body);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.44, 20), plastic('brown')); bottom.rotation.x = -Math.PI / 2; bottom.position.y = -1.6; g.add(bottom);
  if (opts.water !== false) { const w = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), plastic('mediumBlue')); w.rotation.x = -Math.PI / 2; w.position.y = -0.82; g.add(w); }
  const iron = plastic(opts.hoops || 'darkGray');
  for (const [yy, rr] of [[-0.82, 0.555], [-1.42, 0.47]]) { const h = sh(new THREE.Mesh(new THREE.TorusGeometry(rr, 0.045, 6, 24), iron)); h.rotation.x = Math.PI / 2; h.position.y = yy; g.add(h); }
  const hd = sh(new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.045, 6, 18, Math.PI), plastic(opts.handle || 'gray'))); hd.position.y = -0.62; hd.scale.y = 1.1; g.add(hd);
  g.userData.ground = 1.6;
  g.userData.hold = [0, 0.05, 0.25];
  g.userData.view = { az: 20, el: 20, zoom: 0.85 };
  return named(g, 'bucket');
}

/** Bancă de lemn: a wooden bench — a 6 × 2 studded plank on two legs; seat top at 1.6 (`seat: 1.6` for a sitting minifig). */
function bench(opts = {}) {
  const b = new Builder(), c = opts.color || '#9a6234', L = opts.length || 6;
  b.brick(-L / 2 + 0.5, 0, -0.5, 1, 1, 3, opts.legs || '#7a4a26', { studs: false }).brick(L / 2 - 1.5, 0, -0.5, 1, 1, 3, opts.legs || '#7a4a26', { studs: false });
  b.brick(-L / 2, 1.2, -1, L, 2, 1, c);
  const g = b.build(); g.userData.view = { az: 25, el: 22, zoom: 0.8 };
  return named(g, 'bench');
}

/** Ulcior / amforă: a big terracotta amphora with two handles, standing on the ground. `color`, `size` (1). */
function amphora(opts = {}) {
  const g = new THREE.Group(), m = plastic(opts.color || 'darkOrange');
  const s = opts.size || 1;
  const pts = [[0, 0], [0.42, 0], [0.55, 0.12], [0.85, 0.55], [0.95, 1.0], [0.82, 1.5], [0.48, 1.85], [0.36, 2.05], [0.36, 2.35], [0.5, 2.45], [0.46, 2.55], [0.3, 2.5]].map(([x, y]) => new THREE.Vector2(x * s, y * s));
  const body = sh(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshStandardMaterial({ color: m.color, roughness: 0.5, side: THREE.DoubleSide })));
  body.userData.solid = true; g.add(body);
  const inside = new THREE.Mesh(new THREE.CircleGeometry(0.3 * s, 16), plastic('darkBrown')); inside.rotation.x = -Math.PI / 2; inside.position.y = 2.4 * s; g.add(inside);
  for (const sx of [-1, 1]) {
    const hdl = sh(new THREE.Mesh(new THREE.TorusGeometry(0.32 * s, 0.07 * s, 8, 14, Math.PI * 1.1), m));
    hdl.position.set(sx * 0.62 * s, 2.0 * s, 0); hdl.rotation.z = sx > 0 ? -Math.PI * 0.45 : Math.PI * 1.35; g.add(hdl);
  }
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.93 * s, 0.04, 6, 30), plastic(opts.band || 'reddishBrown')); band.rotation.x = Math.PI / 2; band.position.y = 1.05 * s; g.add(band);
  g.userData.view = { az: 20, el: 14, zoom: 0.9 };
  return named(g, 'amphora');
}

/** Spoked wooden wheel in the YZ plane (axle along x), radius R. */
function wheel(R, c = 'reddishBrown') {
  const g = new THREE.Group(), m = plastic(c);
  const rim = sh(new THREE.Mesh(new THREE.TorusGeometry(R, 0.17, 8, 28), m)); rim.rotation.y = Math.PI / 2; g.add(rim);
  const tyre = new THREE.Mesh(new THREE.TorusGeometry(R + 0.1, 0.06, 6, 28), plastic('darkBrown')); tyre.rotation.y = Math.PI / 2; g.add(tyre);
  const hub = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.45, 12), plastic('darkBrown'))); hub.rotation.z = Math.PI / 2; g.add(hub);
  for (let i = 0; i < 6; i++) { const sp = sh(new THREE.Mesh(new THREE.BoxGeometry(0.12, R * 2 - 0.2, 0.14), m)); sp.rotation.x = (i / 6) * Math.PI; g.add(sp); }
  return g;
}

/** Căruță de lemn: a wooden cart — plank box on two spoked wheels, shafts forward (+Z). `color`, `load` = colour of a heap in it (none). */
function cart(opts = {}) {
  const b = new Builder(), c = opts.color || '#9a6234', c2 = opts.color2 || '#7a4a26';
  const y = 1.6;
  b.brick(-2, y, -3, 4, 6, 1, c2, { studs: true });
  for (let row = 0; row < 2; row++) {
    const yy = y + 0.4 + row * 1.2;
    b.brick(-2, yy, -3, 1, 6, 3, row ? c : c2, { studs: row === 1 }).brick(1, yy, -3, 1, 6, 3, row ? c : c2, { studs: row === 1 });
    b.brick(-1, yy, -3, 2, 1, 3, row ? c2 : c, { studs: row === 1 }).brick(-1, yy, 2, 2, 1, 3, row ? c2 : c, { studs: row === 1 });
  }
  // shafts going forward
  // shafts: two beams from the bed forward, sloping down a little, joined by a crossbar
  for (const sx of [-1.5, 1.5]) { const sg = new THREE.BoxGeometry(0.5, 0.5, 5.4); sg.rotateX(0.12); sg.translate(sx, y - 0.05, 5.6); b.geo(sg, c); }
  { const cb = new THREE.BoxGeometry(3.5, 0.4, 0.5); cb.translate(0, y - 0.4, 8.0); b.geo(cb, c); }
  const g = b.build();
  for (const sx of [-2.35, 2.35]) { const w = wheel(1.5, c); w.position.set(sx, 1.6, -0.5); g.add(w); }
  const axle = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 4.6, 8), plastic('darkBrown'))); axle.rotation.z = Math.PI / 2; axle.position.set(0, 1.6, -0.5); g.add(axle);
  if (opts.load) { const heap = sh(new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), plastic(opts.load))); heap.scale.set(1, 0.6, 1.8); heap.position.set(0, y + 0.4, -0.5); g.add(heap); }
  const prop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), plastic(c)); prop.position.set(0, 0.55, 8.0); prop.scale.y = 0.85; g.add(prop);
  g.userData.view = { az: 62, el: 18, zoom: 0.8 };
  return named(g, 'cart');
}

/** Măgăruș: a friendly toy donkey facing +Z — grey body, pale belly and muzzle, big ears, dark mane, a brown saddle blanket.
 * `color`, `saddle` (true), `blanket`, `sacks` (two sacks on its sides). Solid for the `clip` check. */
function donkey(opts = {}) {
  const g = new THREE.Group();
  const fur = plastic(opts.color || 'gray'), pale = plastic(opts.belly || 'lightGray'), dark = plastic(opts.mane || 'darkGray');
  const solid = (m) => { m.userData.solid = true; return sh(m); };
  const by = 2.3;
  const body = solid(new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.3, 3.0), fur)); body.position.y = by; g.add(body);
  const belly = sh(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.3, 2.6), pale)); belly.position.y = by - 0.75; g.add(belly);
  for (const [x, z] of [[-0.45, 1.05], [0.45, 1.05], [-0.45, -1.05], [0.45, -1.05]]) {
    const leg = solid(new THREE.Mesh(new THREE.BoxGeometry(0.46, by - 0.95, 0.5), fur)); leg.position.set(x, (by - 0.95) / 2 + 0.3, z); g.add(leg);
    const hoof = sh(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.56), dark)); hoof.position.set(x, 0.15, z); g.add(hoof);
  }
  const neck = solid(new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.5, 0.9), fur)); neck.position.set(0, by + 0.8, 1.45); neck.rotation.x = 0.45; g.add(neck);
  const mane = sh(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.5, 0.35), dark)); mane.position.set(0, by + 1.05, 1.05); mane.rotation.x = 0.45; g.add(mane);
  const head = solid(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 1.3), fur)); head.position.set(0, by + 1.65, 2.1); g.add(head);
  const muzzle = sh(new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.7, 0.5), pale)); muzzle.position.set(0, by + 1.5, 2.85); g.add(muzzle);
  for (const sx of [-1, 1]) {
    const nos = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.04), dark); nos.position.set(sx * 0.2, by + 1.6, 3.11); g.add(nos);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), plastic('black')); eye.position.set(sx * 0.46, by + 1.85, 2.3); g.add(eye);
    const glint = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 4), plastic('white')); glint.position.set(sx * 0.54, by + 1.89, 2.34); g.add(glint);
    const ear = sh(new THREE.Mesh(new THREE.BoxGeometry(0.34, 1.0, 0.18), fur)); ear.position.set(sx * 0.38, by + 2.45, 1.85); ear.rotation.set(-0.3, 0, sx * -0.45); g.add(ear);
    const inner = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.02), plastic('pink')); inner.position.set(0, 0.05, 0.1); ear.add(inner);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.04), dark); mouth.position.set(0, by + 1.3, 3.11); g.add(mouth);
  const tail = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 6), fur)); tail.position.set(0, by - 0.1, -1.6); tail.rotation.x = 0.25; g.add(tail);
  const tuft = sh(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.4, 0.26), dark)); tuft.position.set(0, by - 0.75, -1.75); g.add(tuft);
  if (opts.saddle !== false) {
    const bl = sh(new THREE.Mesh(new THREE.BoxGeometry(1.64, 0.14, 1.4), plastic(opts.blanket || 'reddishBrown'))); bl.position.set(0, by + 0.72, -0.1); g.add(bl);
    for (const sx of [-1, 1]) { const f = sh(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 1.4), plastic(opts.blanket || 'reddishBrown'))); f.position.set(sx * 0.81, by + 0.3, -0.1); g.add(f); }
    const seat = sh(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.3, 1.0), plastic('darkBrown'))); seat.position.set(0, by + 0.92, -0.1); g.add(seat);
  }
  if (opts.sacks) for (const sx of [-1, 1]) { const s = sh(new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), plastic(opts.sackColor || 'tan'))); s.scale.set(0.6, 1.0, 0.9); s.position.set(sx * 1.05, by - 0.1, -0.1); g.add(s); }
  g.userData.view = { az: 60, el: 12, zoom: 0.85 };
  return named(g, 'donkey');
}

/** Foc de tabără: a campfire — a ring of grey stones, crossed logs and flickering flames (soft light). `light` (2), `fire: false` = cold. */
function campfire(opts = {}) {
  const b = new Builder();
  const n = 9;
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; b.round(Math.cos(a) * 1.55, 0, Math.sin(a) * 1.55, 0.48, 0.8, ['gray', 'lightGray', 'darkGray'][i % 3], { studs: true }); }
  const g = b.build();
  const wood = plastic('reddishBrown');
  for (let i = 0; i < 4; i++) { const l = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 2.6, 8), i % 2 ? wood : plastic('brown'))); l.rotation.z = Math.PI / 2 - 0.35; l.rotation.y = (i / 4) * Math.PI; l.position.y = 0.35; g.add(l); }
  const ember = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), plastic('darkOrange', { emissive: 'orange', emissiveIntensity: 0.6 })); ember.rotation.x = -Math.PI / 2; ember.position.y = 0.05; g.add(ember);
  if (opts.fire !== false) {
    const flames = new THREE.Group(); flames.position.y = 0.35; g.add(flames);
    const fl = [['red', 0.75, 2.0, 0], ['orange', 0.6, 2.5, 0.2], ['brightYellow', 0.38, 1.7, 0.3]].map(([c, r, h, k]) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6, 1, true), plastic(c, { emissive: c, emissiveIntensity: 0.85 })); m.position.y = h / 2; flames.add(m); return [m, k, h];
    });
    const tongues = [0, 1, 2, 3].map((i) => { const m = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.8, 5, 1, true), plastic('orange', { emissive: 'orange', emissiveIntensity: 0.85 })); m.position.set(Math.cos(i * 1.6) * 0.45, 0.4, Math.sin(i * 1.6) * 0.45); flames.add(m); return m; });
    const light = new THREE.PointLight(0xffa040, opts.light ?? 2, 12, 1.6); light.position.y = 1.2; g.add(light);
    g.userData.update = (t) => {
      fl.forEach(([m, k, h], i) => { const s = 1 + 0.12 * Math.sin(t * (9 + i * 3) + k * 7); m.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s)); m.position.y = h * s / 2 + i * 0.04; /* bases at different heights: no coplanar caps */ m.rotation.y = t * (0.7 + i); });
      tongues.forEach((m, i) => { m.scale.y = 0.8 + 0.35 * Math.abs(Math.sin(t * 7 + i * 1.9)); });
      light.intensity = (opts.light ?? 2) * (0.85 + 0.15 * Math.sin(t * 13));
    };
    g.userData.update(0);
  }
  g.userData.view = { az: 20, el: 26, zoom: 0.85 };
  return named(g, 'campfire');
}

/** Plăci de drum / potecă: a straight paved path — rows of sand and grey tiles and studded plates. `length` (10), `width` (3),
 * `colors`, `studs` (share of studded plates, 0.25). Flat (0.4), so feet and the `clip` check ignore it. */
function pathTiles(opts = {}) {
  const r = rng(opts.seed || 121), b = new Builder();
  if (opts.pieces) { // the loose pieces in a 2 × 2 group: a 2 × 4 sand plate, a grey 2 × 2 plate, sand + grey, a 2 × 2 of grey slabs
    b.plate(-5, 0, -3.5, 4, 2, 'tan');
    b.plate(1, 0, -3.5, 2, 2, 'lightGray');
    b.brick(-5, 0, 0.5, 1.5, 2, 1, 'tan', { studs: false }).brick(-3.5, 0, 0.5, 2, 2, 1, 'gray', { studs: true });
    b.brick(1, 0, 0, 1.5, 1.5, 1, 'lightGray', { studs: false }).brick(2.5, 0, 0, 1.5, 1.5, 1, 'gray', { studs: false }).brick(1, 0, 1.5, 1.5, 1.5, 1, 'gray', { studs: false }).brick(2.5, 0, 1.5, 1.5, 1.5, 1, 'lightGray', { studs: false });
    const g = b.build(); g.userData.view = { az: 15, el: 38, zoom: 0.9 }; return named(g, 'path pieces');
  }
  const L = opts.length || 10, W = opts.width || 3, x0 = -W / 2, z0 = -L / 2;
  const cols = opts.colors || ['tan', 'lightGray', 'gray', 'sand', 'lightGray'];
  let z = z0;
  while (z < z0 + L) {
    const d = Math.min(r() < 0.5 ? 2 : 1, z0 + L - z);
    let x = x0;
    while (x < x0 + W) {
      const w = Math.min(r() < 0.4 ? 2 : 1, x0 + W - x);
      b.brick(x, 0, z, w, d, 1, cols[Math.floor(r() * cols.length)], { studs: r() < (opts.studs ?? 0.45) });
      x += w;
    }
    z += d;
  }
  const g = b.build(); g.userData.view = { az: 30, el: 35, zoom: 0.95 };
  return named(g, 'path');
}

// ---------- tools for the ploughmen ----------

/** Sapă: a hoe — long wooden handle held like the staff, an iron blade at the bottom. */
function hoe(opts = {}) {
  const g = new THREE.Group();
  const pole = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.6, 8), plastic(opts.color || 'reddishBrown'))); pole.position.y = 0.2; g.add(pole);
  // an iron head across the bottom of the handle: a wide blade bent down in front, a short pick behind (a mattock)
  const iron = plastic(opts.blade || 'darkGray');
  const eye = sh(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.3), iron)); eye.position.set(0, -1.38, 0); g.add(eye);
  const arm = sh(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.7), iron)); arm.position.set(0, -1.38, 0.45); g.add(arm);
  const blade = sh(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.12), plastic(opts.blade || 'gray'))); blade.position.set(0, -1.6, 0.85); blade.rotation.x = -0.6; g.add(blade);
  const pick = sh(new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.6, 6), iron)); pick.rotation.x = -Math.PI / 2 - 0.3; pick.position.set(0, -1.44, -0.4); g.add(pick);
  g.userData.ground = 1.85; g.userData.hold = [0, 0, 0.15];
  return named(g, 'hoe');
}

/** Furcă: a pitchfork — long wooden handle, a grey crossbar with three tines pointing up. */
function pitchfork(opts = {}) {
  const g = new THREE.Group(), iron = plastic(opts.tines || 'gray');
  const pole = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.4, 8), plastic(opts.color || 'reddishBrown'))); pole.position.y = 0.0; g.add(pole);
  const bar = sh(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.2, 0.2), iron)); bar.position.y = 1.75; g.add(bar);
  for (const x of [-0.42, 0, 0.42]) { const t = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.05, 1.0, 6), iron)); t.position.set(x, 2.3, 0); g.add(t); }
  g.userData.ground = 1.7; g.userData.hold = [0, 0, 0.15];
  return named(g, 'pitchfork');
}


// ---------- the cave of `cave-hermitage` ----------

// stone: plastic with a faint speckled / pitted bump (the big cut stones of the cave), cached per colour
const stoneMats = new Map();
let stoneBump = null;
function stoneMaterial(c) {
  if (!stoneBump) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d');
    x.fillStyle = '#808080'; x.fillRect(0, 0, 128, 128);
    const r = rng(5);
    for (let i = 0; i < 500; i++) { const v = 90 + r() * 90; x.fillStyle = `rgb(${v},${v},${v})`; x.beginPath(); x.arc(r() * 128, r() * 128, 0.6 + r() * 2.2, 0, Math.PI * 2); x.fill(); }
    stoneBump = new THREE.CanvasTexture(cv); stoneBump.wrapS = stoneBump.wrapT = THREE.RepeatWrapping; stoneBump.repeat.set(2, 2);
  }
  const k = String(color(c));
  if (!stoneMats.has(k)) stoneMats.set(k, new THREE.MeshStandardMaterial({ color: color(c), roughness: 0.62, bumpMap: stoneBump, bumpScale: 1.2 }));
  return stoneMats.get(k);
}

/** Plantă cu frunze ascuțite (agave-like): long tapered green blades rising from the ground, bending outwards. `size`, `seed`, `colors`. */
function spiky(opts = {}) {
  const r = rng(opts.seed || 5), g = new THREE.Group(), s = opts.size || 1;
  const cols = (opts.colors || ['brightGreen', 'green', '#3f8f3a']).map((c) => plastic(c));
  const n = opts.blades || 9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5, len = (1.6 + r() * 1.4) * s, w = 0.34 * s;
    const sp = new THREE.Shape(); sp.moveTo(-w / 2, 0); sp.quadraticCurveTo(-w * 0.45, len * 0.6, 0, len); sp.quadraticCurveTo(w * 0.45, len * 0.6, w / 2, 0); sp.lineTo(-w / 2, 0);
    const geo = new THREE.ExtrudeGeometry(sp, { depth: 0.08 * s, bevelEnabled: false, curveSegments: 6 }); geo.translate(0, 0, -0.04 * s);
    const blade = sh(new THREE.Mesh(geo, cols[i % cols.length]));
    blade.position.set(Math.sin(a) * 0.12 * s, 0, Math.cos(a) * 0.12 * s); blade.rotation.set(0, a, 0);
    const tilt = new THREE.Group(); tilt.rotation.y = a; tilt.add(blade); blade.rotation.set(0.25 + r() * 0.45, 0, 0); blade.position.set(0, 0, 0.1 * s);
    g.add(tilt);
  }
  g.userData.view = { az: 20, el: 14, zoom: 0.6 };
  return named(g, 'plant');
}

/** A big flat-topped sitting stone made of two stacked blocks (top at `h`, 1.2). `w` 2.4, `d` 2.2, `colors`. Origin = ground centre. */
function stoneSeat(opts = {}) {
  const b = new Builder(), w = opts.w || 2.4, d = opts.d || 2.2, hh = opts.h || 1.2, c = opts.colors || ['lightGray', 'gray'];
  b.brick(-w / 2, 0, -d / 2, w, d, Math.round(hh / 0.4) - 1, c[0], { studs: false });
  b.brick(-w / 2 + 0.1, hh - 0.4, -d / 2 + 0.1, w - 0.2, d - 0.2, 1, c[1] || c[0], { studs: false });
  const g = b.build(); g.userData.ground = 0; g.userData.seat = hh; g.userData.view = { az: 25, el: 20, zoom: 0.5 };
  return named(g, 'stone seat');
}

/**
 * Peștera din stâncă (the cave of the poster „Avva Siluan”): a big grey rock of chunky stone blocks with an arched mouth
 * framed by big voussoir blocks; inside a warm room (brick back wall, tan floor) lit by a fat candle on a wooden shelf; big
 * angular boulders on the rock; stone seats in front. Local frame: the mouth (8 wide, arch top 8.5) is centred at x 0 on the
 * front face z 3; the room is x -5..6, z -4..3; the icon goes on the back wall at (1.2, 3.2, -3.55) (an `icon` prop of the scene).
 * `colors` (rock), `wall` (back wall bricks), `glow: false` (dark inside, no candle light), `seats` = [[x, z], …] local stone seats.
 */
function caveRock(opts = {}) {
  const r = rng(opts.seed || 77), b = new Builder();
  const cols = opts.colors || ['#8a8f94', '#7a7f84', '#9a9ea2', '#6c7176', '#868b90', '#5f6469', '#a3a7aa', '#777c80'];
  const pick = () => cols[Math.floor(r() * cols.length)];
  const FRONT = 3, AR = 4, SPRING = 4.5; // arch radius, springline height
  const inArch = (x, y) => Math.abs(x) < AR && (y < SPRING || x * x + (y - SPRING) ** 2 < AR * AR);
  const inRoom = (x, y, z) => x > -5.2 && x < 6.2 && z > -4 && z < FRONT + 0.6 && y < 7.6 - Math.max(0, (Math.abs(x - 0.5) - 3.2)) * 0.6;
  // the rock: blocks of 2 x 2 studs, one brick tall, layers staggered by one stud (big block joints, like cut stone)
  const top = (x, z) => 15.5 - ((x - 1.5) / 11.5) ** 2 * 9 - Math.max(0, (z + 3) / 7) ** 2 * 4 - Math.max(0, -(z + 7) / 4) * 3 + (r() - 0.5) * 1.2;
  const frontOf = (x) => FRONT + 0.6 + ((x * 7) % 3 === 0 ? 1 : 0);
  for (let l = 0; l < 14; l++) {
    const y = l * 1.2, off = l % 2;
    for (let x = -13 + off; x < 12; x += 2) for (let z = -11 + off; z < 5; z += 2) {
      const cx = x + 1, cz = z + 1, cy = y + 0.6;
      if (cz > frontOf(x) || cy > top(cx, cz)) continue;
      if (Math.hypot(cx / 12.5, (cz + 3.5) / 8) > 1.05) continue;
      if (cx < -6.4) continue; // open on the left: the rock rises right of the mouth
      if (inRoom(cx, cy, cz) || (cz > 1 && inArch(cx, cy)) || (cz > 1 && inArch(cx + 0.9, cy)) || (cz > 1 && inArch(cx - 0.9, cy))) continue;
      if (inRoom(cx + 0.9, cy, cz) || inRoom(cx - 0.9, cy, cz) || inRoom(cx, cy, cz + 0.9) || inRoom(cx, cy, cz - 0.9)) continue;
      if (cx > -7.2 && cx < 8.2 && cz > -6 && cz < 0 && cy < 9) continue; // behind the brick back wall and the shelf: no blocks in the same planes
      const above = top(cx, cz) - cy < 1.2;
      b.brick(x, y, z, 2, 2, 3, pick(), { studs: above });
    }
  }
  // the arch: big voussoir blocks round the mouth and stacked jamb blocks, standing a little proud of the rock face
  const arch = new THREE.Group();
  const vm = (c) => stoneMaterial(c);
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a0 = Math.PI * (i + 0.06) / n, a1 = Math.PI * (i + 0.94) / n, rin = AR, rout = AR + 1.35 + (i % 2) * 0.25;
    const sp = new THREE.Shape();
    sp.moveTo(Math.cos(a0) * rin, Math.sin(a0) * rin); sp.lineTo(Math.cos(a0) * rout, Math.sin(a0) * rout);
    sp.lineTo(Math.cos(a1) * rout, Math.sin(a1) * rout); sp.lineTo(Math.cos(a1) * rin, Math.sin(a1) * rin); sp.lineTo(Math.cos(a0) * rin, Math.sin(a0) * rin);
    const geo = new THREE.ExtrudeGeometry(sp, { depth: 1.5 + (i % 3) * 0.12, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 });
    const m = sh(new THREE.Mesh(geo, vm(['#767b80', '#666b70', '#80858a', '#5c6166', '#70757a'][i % 5]))); m.position.set(0, SPRING, FRONT - 0.6 + (i % 2) * 0.07); arch.add(m);
  }
  for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
    const bw = 1.35 + ((k + (sx > 0 ? 1 : 0)) % 2) * 0.3, bh = SPRING / 3 - 0.06;
    const m = sh(new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 1.55 + (k % 2) * 0.1), vm(['#6c7175', '#5f6468', '#7a7f83'][(k + (sx > 0 ? 1 : 0)) % 3])));
    m.position.set(sx * (AR + bw / 2), k * (SPRING / 3) + bh / 2 + 0.03, FRONT + 0.2 + (k % 2) * 0.05); arch.add(m);
  }
  // big angular boulders on the rock and at its foot (rotated: never coplanar with the block faces)
  const boulders = opts.boulders || [[-5.9, 10.2, 1.6, 2.4], [-5.4, 12.8, 1.2, 2.6], [5.6, 10.8, 2.0, 3.2], [8.6, 8.2, 2.4, 2.8],
    [9.8, 3.6, 3.1, 2.6], [1.2, 13.2, 0.6, 3.0], [-2.8, 14.2, -0.6, 2.6], [11, 1, 0.5, 2.4], [-3.4, 11.2, 2.7, 2.2], [2.6, 10.9, 2.9, 2.0]];
  for (const [x, y, z, s0] of boulders) {
    const s = s0 * (0.9 + r() * 0.2);
    const geo = new RoundedBoxGeometry(s * (1 + r() * 0.5), s * (0.7 + r() * 0.4), s * (0.9 + r() * 0.3), 2, 0.12);
    const m = sh(new THREE.Mesh(geo, vm(pick()))); m.position.set(x, y, z); m.rotation.set((r() - 0.5) * 0.5, (r() - 0.5) * 0.9, (r() - 0.5) * 0.5); arch.add(m);
  }
  // inside: a brick back wall, a tan floor, a wooden shelf with a fat candle
  const wallC = opts.wall || ['#3a2b22', '#2f231c', '#45352b', '#281d17', '#4a392e'];
  for (let row = 0; row < 7; row++) for (let x = -5 + (row % 2); x < 6; x += 2) b.brick(x, row * 1.2, -4.6, Math.min(2, 6 - x), 1, 3, wallC[Math.floor(r() * wallC.length)], { studs: false });
  b.brick(-5.2, 0, -4, 11.4, 7.6, 1, 'darkTan', { studs: false });
  b.brick(2.2, 2.6, -3.6, 2.6, 2.4, 1, 'reddishBrown', { studs: false });
  for (const [x, z] of [[2.4, -3.4], [4.2, -3.4], [2.4, -1.6], [4.2, -1.6]]) b.brick(x, 0.4, z, 0.4, 0.4, 6, 'brown', { studs: false });
  const g = b.build();
  g.add(arch);
  // seats in front of the mouth (local [x, z])
  for (const [x, z, c, h] of opts.seats || []) { const st = stoneSeat({ colors: c ? [c, c] : undefined, h }); st.position.set(x, 0, z); g.add(st); }
  const glow = opts.glow !== false;
  // the candle: a fat white candle on a little holder, a teardrop flame (glows: bloom), a warm light filling the room
  const cg = new THREE.Group(); cg.position.set(3.4, 3.0, -2.2); g.add(cg);
  cg.add(sh(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.22, 16), plastic('darkBrown'))));
  const wax = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.3, 16), plastic('cream', { emissive: '#ffcf8a', emissiveIntensity: glow ? 0.2 : 0 }))); wax.position.y = 0.76; cg.add(wax);
  if (glow) {
    // a teardrop flame: a bright core in an orange skin, a dark wick (bloom makes the glow)
    const prof = [[0, 0], [0.1, 0.06], [0.15, 0.18], [0.13, 0.32], [0.07, 0.46], [0, 0.58]].map(([x, y]) => new THREE.Vector2(x, y));
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.14, 6), plastic('black')); wick.position.y = 1.47; cg.add(wick);
    const fo = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), new THREE.MeshBasicMaterial({ color: 0xff8a20, toneMapped: false, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    fo.position.y = 1.47; fo.scale.setScalar(1.15); cg.add(fo);
    const fl = new THREE.Mesh(new THREE.LatheGeometry(prof, 16), new THREE.MeshBasicMaterial({ color: 0xfff4c0, toneMapped: false }));
    fl.position.set(0, 1.5, 0); fl.scale.set(0.7, 0.8, 0.7); cg.add(fl);
    const L1 = new THREE.PointLight(0xffb060, 10, 10, 1.6); L1.position.set(0, 2.2, 0.6); cg.add(L1);
    const L2 = new THREE.PointLight(0xffa850, 4, 9, 1.8); L2.position.set(-3.5, 4.5, 2.2); cg.add(L2);
  }
  g.userData.view = { az: -15, el: 10, zoom: 0.7 };
  return named(g, 'cave');
}

/** Deal cu mănăstire: a big terraced sandstone hill (tan / sand tiers, green tufts on the steps) with a little monastery on the top:
 *  a church with a round drum, a terracotta dome and a gold cross, two cells with arched windows, a wall; cypresses on the slopes.
 *  `radius` (16), `height` (tiers, 9), `seed`, `walls`, `dome`. Origin = ground centre. Meant as a far backdrop. */
function hillMonastery(opts = {}) {
  const r = rng(opts.seed || 33), b = new Builder();
  const R = opts.radius || 16, N = opts.height || 9;
  const soil = opts.soil || ['tan', 'sand', 'tan', 'lightNougat', 'darkTan', 'sand'];
  const g = new THREE.Group();
  const hm = new Map();
  for (let x = -R - 2; x < R + 2; x++) for (let z = -R; z < R * 0.7; z++) {
    const d = Math.hypot((x + 0.5) / R, (z + 0.5) / (R * 0.62));
    const t = Math.round(N * (1 - d) * 1.35 + (r() - 0.5) * 0.8);
    if (d < 1 && t > 0) hm.set(`${x},${z}`, Math.min(N, t));
  }
  for (const [k, t] of hm) {
    const [x, z] = k.split(',').map(Number);
    for (let l = 0; l < t; l++) {
      const exposed = !hm.has(`${x},${z + 1}`) || hm.get(`${x},${z + 1}`) <= l || !hm.has(`${x + 1},${z}`) || hm.get(`${x + 1},${z}`) <= l || !hm.has(`${x - 1},${z}`) || hm.get(`${x - 1},${z}`) <= l;
      if (!exposed && l < t - 1) continue; // hidden inside the hill
      const c = l === t - 1 && r() < 0.12 ? 'brightGreen' : soil[(l + Math.floor(r() * 2)) % soil.length];
      b.brick(x, l * 1.2, z, 1, 1, 3, c, { studs: l === t - 1 });
    }
  }
  const topY = N * 1.2;
  // the monastery on the top
  const pal = opts.walls || ['sand', 'tan', 'lightNougat', 'cream'];
  const wpick = () => pal[Math.floor(r() * pal.length)];
  const box = (x0, z0, W, D, rows) => { for (let row = 0; row < rows; row++) for (let x = x0; x < x0 + W; x++) for (let z = z0; z < z0 + D; z++) {
    if (x > x0 && x < x0 + W - 1 && z > z0 && z < z0 + D - 1) continue; b.brick(x, topY + row * 1.2, z, 1, 1, 3, wpick(), { studs: row === rows - 1 }); } };
  box(-3, -4, 6, 6, 5);          // the church
  box(-10, -3, 5, 5, 3); box(4, -2, 6, 4, 3); box(-6, -8, 4, 4, 4);  // cells
  const dome = opts.dome || 'reddishBrown';
  const drum = sh(new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 1.8, 20), plastic(pal[0]))); drum.position.set(0, topY + 6.9, -1); g.add(drum);
  const dm = sh(new THREE.Mesh(new THREE.SphereGeometry(2.25, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), plastic(dome))); dm.position.set(0, topY + 7.8, -1); g.add(dm);
  const cr = goldCross(0.9); cr.position.set(0, topY + 9.9, -1); g.add(cr);
  for (const [x, z, w2] of [[-10.2, -0.5, 5.4], [3.8, 0, 6.4]]) { // flat roofs with a terracotta edge
    const rf = sh(new THREE.Mesh(new THREE.BoxGeometry(w2, 0.4, 5.4), plastic('darkOrange'))); rf.position.set(x + w2 / 2 - 0.2, topY + 3.75, z - 0.3); g.add(rf);
  }
  const small = sh(new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), plastic(dome))); small.position.set(-4, topY + 4.85, -6); g.add(small);
  // dark arched windows and doors on the fronts
  const win = (x, y, z, w, hs) => { const m = new THREE.Mesh(archPanel(w, hs, 0.05), plastic('darkBrown')); m.position.set(x, y, z); g.add(m); };
  win(-0.6, topY + 0.1, 2.02, 1.2, 1.6); win(-2.3, topY + 2.6, 2.02, 0.7, 0.8); win(1.6, topY + 2.6, 2.02, 0.7, 0.8);
  win(-9, topY + 1.2, 2.02, 0.7, 0.8); win(-7, topY + 1.2, 2.02, 0.7, 0.8); win(5.4, topY + 1.2, 2.02, 0.7, 0.8); win(7.6, topY + 1.2, 2.02, 0.7, 0.8);
  win(-0.5, topY + 6.3, 1.06, 1, 0.6);
  g.add(b.build());
  // cypresses and bushes on the slopes
  const cyp = opts.cypress || [[-13, -2, 5], [9, 1, 4], [13, -4, 6], [-7, 5, 2]];
  for (const [x, z, sd] of cyp) {
    const t = hm.get(`${x},${z}`) || 0;
    const c = cypress({ height: 6 + (sd % 3), seed: 60 + sd }); c.position.set(x + 0.5, t * 1.2 + 0.1, z + 0.5); g.add(c);
  }
  for (let i = 0; i < 14; i++) {
    const x = Math.round((r() - 0.5) * R * 1.7), z = Math.round((r() - 0.3) * R * 0.9), t = hm.get(`${x},${z}`);
    if (!t) continue; tuft(g, x + 0.5, z + 0.5, i + 3, i % 2 ? 'green' : 'brightGreen', 1.2); g.children[g.children.length - 1].position.y = t * 1.2;
  }
  g.userData.view = { az: 10, el: 12, zoom: 0.8 };
  return named(g, 'hill');
}

/** Munți în depărtare: a row of soft purple mountains (flat-shaded cones) for the horizon. `color`, `width` (160), `seed`. */
function mountains(opts = {}) {
  const r = rng(opts.seed || 9), g = new THREE.Group();
  const cols = opts.colors || ['#8c6f9c', '#7a6290', '#9b7ca6'];
  const W = opts.width || 160;
  for (let i = 0; i < 9; i++) {
    const hgt = 7 + r() * 9, rad = 14 + r() * 14;
    const m = new THREE.Mesh(new THREE.ConeGeometry(rad, hgt, 7, 1), new THREE.MeshStandardMaterial({ color: color(cols[i % cols.length]), roughness: 1, flatShading: true }));
    m.position.set(-W / 2 + (i / 8) * W + (r() - 0.5) * 10, hgt / 2 - 1, (r() - 0.5) * 12); m.rotation.y = r() * 3; m.scale.z = 0.5; g.add(m);
  }
  return named(g, 'mountains');
}

/**
 * Mănăstire cu arcade (cloister): a long two-storey sandstone wing — an open gallery of round arches on columns along the
 * front (a shady walk with dark doors at the back), arched windows above, a cornice, a lean-to roof of terracotta tiles; a
 * square bell tower with a round dome on its right end. Front at z = +4 (the gallery is z 0..4), origin = ground centre.
 * `arches` (6), `walls`, `roof`, `tower: false`, `dome` (colour of the tower dome). Width = 4·arches + 1.
 */
function cloister(opts = {}) {
  const r = rng(opts.seed || 57), b = new Builder();
  const pal = opts.walls || ['tan', 'sand', 'lightNougat', 'tan', 'sand', 'cream'], pick = () => pal[Math.floor(r() * pal.length)];
  const N = opts.arches || 6, W = 4 * N + 1, x0 = -Math.floor(W / 2), zB = -4, zF = 3; // back wall row z -4, front arcade row z 3
  b.brick(x0 - 0.5, 0, zB - 0.5, W + 1, zF - zB + 1.5, 1, 'lightGray', { studs: false }); // floor / plinth
  // the back wall (2 storeys): dark arched doors behind the arches
  const rowsL = 4, rowsU = 3;
  walls(b, { x0, z0: zB - 1, W, D: 2, rows: rowsL + rowsU + 1, y0: 0.4, pick, studsTop: false, holes: [] });
  // the front: columns + arch spandrels on the ground floor
  const colH = 3.6, y0 = 0.4;
  for (let i = 0; i <= N; i++) {
    const cx = x0 + 4 * i + 0.5;
    b.brick(cx - 0.5, y0, zF, 1, 1, 1, 'lightGray', { studs: false });
    b.round(cx, y0 + 0.4, zF + 0.5, 0.36, colH - 0.8, pal[5] || 'cream', { studs: false, seg: 14 });
    b.brick(cx - 0.5, y0 + colH - 0.4, zF, 1, 1, 1, 'lightGray', { studs: false });
  }
  for (let i = 0; i < N; i++) spandrel(b, x0 + 4 * i + 1, y0 + colH, zF, 3, 2.0, 1, pick());
  for (let i = 0; i <= N; i++) b.brick(x0 + 4 * i, y0 + colH, zF, 1, 1, 5, pick(), { studs: false }); // piers between the arches
  b.brick(x0, y0 + colH + 2.0, zF, W, 1, 1, 'lightGray', { studs: false }); // string course
  const yU = y0 + colH + 2.4;
  // upper storey front wall, with small arched windows over every arch
  for (let row = 0; row < rowsU; row++) {
    const isWin = (x) => row < 2 && (x - x0) % 4 === 2 && x < x0 + W - 1;
    let x = x0 + (row % 2);
    if (row % 2) b.brick(x0, yU + row * 1.2, zF, 1, 1, 3, pick(), { studs: false });
    while (x < x0 + W) {
      if (isWin(x)) { x++; continue; }
      let n = 1;
      while (n < 2 && x + n < x0 + W && !isWin(x + n)) n++;
      b.brick(x, yU + row * 1.2, zF, n, 1, 3, pick(), { studs: false });
      x += n;
    }
  }
  // the ends of the wing (side walls)
  for (const sx of [x0, x0 + W - 1]) for (let row = 0; row < 8; row++) b.brick(sx, y0 + row * 1.2, zB + 1, 1, zF - zB - 1, 3, pick(), { studs: false });
  const yC = yU + rowsU * 1.2;
  b.brick(x0 - 0.3, yC, zB - 1.3, W + 0.6, zF - zB + 2.6, 1, 'lightNougat', { studs: false }); // cornice
  // lean-to roof falling to the front + a row of round eave tiles
  const tiles = opts.roof || ['#c8502e', '#b4441f'];
  for (let k = 0; k < 4; k++) b.slope(x0 - 0.5, yC + 0.4 + k * 0.8, zF + 1 - 2 * k, W + 1, 2, 2, tiles[k % 2], 0);
  for (let k = 0; k < 3; k++) b.brick(x0 - 0.5, yC + 0.4 + k * 0.8, zB - 1, W + 1, zF - zB + 2 - 2 * (k + 1), 2, pal[0], { studs: false });
  const g = b.build();
  const eave = plastic('#a8401c');
  for (let x = x0; x < x0 + W; x += 1) { const t = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.9, 8, 1, false, 0, Math.PI), eave)); t.rotation.x = Math.PI / 2; t.position.set(x + 0.5, yC + 0.42, zF + 1.75); g.add(t); }
  // dark gallery inside + doors on the back wall, glass in the upper windows
  const back = darkInside(W - 2, colH + 1.6); back.material = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 1 }); back.position.set(x0 + W / 2, y0 + (colH + 1.6) / 2, zB + 1.02); g.add(back);
  for (let i = 0; i < N; i += 2) { const d = door(1.6, 1.8, { arch: true, c: opts.door || 'reddishBrown' }); d.position.set(x0 + 4 * i + 1.7, y0, zB + 1.05); g.add(d); }
  const ceil = new THREE.Mesh(new THREE.BoxGeometry(W - 2, 0.1, zF - zB - 1), plastic('darkTan')); ceil.position.set(x0 + W / 2, y0 + colH + 1.85, (zB + 1 + zF) / 2); g.add(ceil);
  for (let i = 0; i < N; i++) { const w = new THREE.Mesh(archPanel(1, 1.6, 0.02), plastic('darkBrown')); w.position.set(x0 + 4 * i + 2, yU + 0.1, zF + 0.5); g.add(w); }
  if (opts.tower !== false) {
    const t = bellTower({ height: 6, walls: pal, dome: opts.dome || pal[1], seed: 43, tufts: false }); t.position.set(x0 + W + 3.2, 0, -0.5); g.add(t);
  }
  [[x0 - 0.8, 4.4, 1], [x0 + W + 0.5, 4.5, 2], [-3, 4.6, 3], [6, 4.7, 4]].forEach(([x, z, sd]) => tuft(g, x, z, sd));
  g.userData.view = { az: 18, el: 12, zoom: 0.8 };
  return named(g, 'cloister');
}

export const LANDMARKS = { cloister, caveRock, hillMonastery, mountains, spiky, stoneSeat, sandCell, plankDoor, hermitCell, chapel, gate, bellTower, stoneWell, wall, palm, cypress, leafyTree, bush, rocks, hill, plowedPlot, wheatPatch, bucket, bench, amphora, cart, donkey, campfire, pathTiles, hoe, pitchfork };
