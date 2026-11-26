// Props: small objects characters hold, give, or that sit in a set.
// Each builder returns a THREE.Group whose origin is the grip point (where a hand holds it).
// `ground` is the offset added when the prop rests on the ground (so it does not sink in).
import * as THREE from 'three';
import { plastic, color, Builder, rng } from './bricks.js';
import { LANDMARKS } from './landmarks.js';

const sh = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

/** Radius of a lathe profile [[r, y], …] at height y (linear between points). */
function radiusAt(P, y) {
  for (let i = 1; i < P.length; i++) if (y <= P[i][1]) { const [x0, y0] = P[i - 1], [x1, y1] = P[i]; return x0 + (x1 - x0) * (y - y0) / Math.max(1e-6, y1 - y0); }
  return P[P.length - 1][0];
}
/**
 * Terracotta "brick courses" on a lathe body (a pot built of curved bricks, like the toy pots): a dark groove ring between
 * the courses and short vertical joints, staggered every other course. Adds to `parent` (same frame as the lathe). Pure.
 */
export function brickCourses(parent, P, { y0, y1, n, joints = 9, color: c = '#7a3418', depth = 0.012 }) {
  const m = plastic(c), h = (y1 - y0) / n;
  for (let i = 0; i <= n; i++) {
    const y = y0 + i * h, r = radiusAt(P, y);
    if (i > 0 && i < n) { const gr = new THREE.Mesh(new THREE.TorusGeometry(r + depth, 0.022, 5, 40), m); gr.rotation.x = Math.PI / 2; gr.position.y = y; parent.add(gr); }
    if (i === n) break;
    // the joint lies ON the wall: tilted like the wall between its two ends (a vertical box on a narrowing shoulder stuck out
    // above it like a spike), and a little shorter than the course so it never reaches past the groove rings
    const ya = y + h * 0.07, yb = y + h * 0.93, ra = radiusAt(P, ya) + depth, rb = radiusAt(P, yb) + depth;
    const len = Math.hypot(yb - ya, rb - ra), tilt = Math.atan2(rb - ra, yb - ya), ym = (ya + yb) / 2, rm = (ra + rb) / 2;
    for (let k = 0; k < joints; k++) {
      const a = (k + (i % 2) * 0.5) / joints * Math.PI * 2;
      const j = new THREE.Mesh(new THREE.BoxGeometry(0.035, len, 0.03), m);
      j.position.set(Math.sin(a) * rm, ym, Math.cos(a) * rm); j.rotation.set(tilt, a, 0, 'YXZ'); parent.add(j);
    }
  }
}

function grapes(opts = {}) {
  const g = new THREE.Group();
  const berry = new THREE.SphereGeometry(0.17, 14, 10);
  const m1 = plastic(opts.color || 'grapePurple'), m2 = plastic(opts.color2 || 'grapeLight');
  // a cone-shaped bunch hanging below the grip point
  const rows = [[0, 5, 0.34], [1, 5, 0.3], [2, 4, 0.25], [3, 3, 0.18], [4, 2, 0.1], [5, 1, 0]];
  let i = 0;
  for (const [row, n, r] of rows) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + row * 0.7;
      const b = sh(new THREE.Mesh(berry, (i++ % 3 === 0) ? m2 : m1));
      b.position.set(Math.cos(a) * r, -0.25 - row * 0.22, Math.sin(a) * r);
      g.add(b);
    }
    if (row < 2) { const c = sh(new THREE.Mesh(berry, m1)); c.position.set(0, -0.25 - row * 0.22, 0); g.add(c); }
  }
  const stem = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.35, 6), plastic('reddishBrown')));
  stem.position.y = -0.05; g.add(stem);
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(0.35, 0.15, 0.45, 0.45); leafShape.quadraticCurveTo(0.1, 0.4, 0, 0);
  const leaf = sh(new THREE.Mesh(new THREE.ExtrudeGeometry(leafShape, { depth: 0.04, bevelEnabled: false }), plastic('brightGreen')));
  leaf.position.set(0.02, -0.1, 0); leaf.rotation.set(0.3, 0.5, -0.4); g.add(leaf);
  g.userData.ground = 1.45;
  g.userData.hold = [0, 0.45, 0.42]; // the hand holds the bunch by its middle, pushed away from the body
  return g;
}

function staff(opts = {}) {
  const g = new THREE.Group();
  const m = plastic(opts.color || 'reddishBrown');
  if (opts.straight) {
    // a plain walking staff (toiag): straight, thicker, about the height of the man, with a round knob on top
    // `grip` = how high above its foot the hand holds it (1.7; seated ≈ 2.4 so the foot reaches the ground)
    const gy = 2.15 - (opts.grip ?? 1.7);
    const pole = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 4.3, 10), m)); pole.position.y = gy; g.add(pole);
    const knob = sh(new THREE.Mesh(new THREE.SphereGeometry(opts.knobSize || 0.2, 12, 8), plastic(opts.knob || 'brown'))); knob.position.y = gy + 2.2; g.add(knob);
    const ring = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 10), plastic('darkBrown'))); ring.position.y = gy + 1.85; g.add(ring);
    g.userData.ground = 1.7; g.userData.hold = [0, 0, 0.15]; g.userData.carry = 'staff';
    return g;
  }
  const pole = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.6, 8), m));
  pole.position.y = 0.6; g.add(pole);
  const crook = sh(new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 8, 12, Math.PI), m));
  crook.position.set(0.3, 2.9, 0); g.add(crook);
  g.userData.ground = 1.7;
  g.userData.hold = [0, 0, 0.15];
  return g;
}

/**
 * A clay jug (ulcior), held low in the hand. It can pour: `bend` 0..1 (on the prop, or animated with the action
 * `{ "prop": "ulcior", "bend": 1, "duration": 0.8 }`) tilts it forward about the hand, up to ≈ 100°; past half-way a
 * stream of water runs from its mouth down to the ground (`water` colour, `fall` = how far it falls, 2.2). Use it with the
 * gesture `pour` (arm held forward) and bring it back with `"bend": 0`.
 */
function jug(opts = {}) {
  const pts = [[0, 0], [0.32, 0], [0.45, 0.25], [0.48, 0.6], [0.36, 0.95], [0.2, 1.05], [0.2, 1.25], [0.27, 1.32]].map(([x, y]) => new THREE.Vector2(x, y));
  const g = new THREE.Group();
  const tilt = new THREE.Group(); g.add(tilt);
  const body = sh(new THREE.Mesh(new THREE.LatheGeometry(pts, 18), plastic(opts.color || 'nougat')));
  // the jug tips about its own middle (0.35 below the grip): the mouth goes forward and down, the bottom up and back
  const PC = -0.35;
  tilt.position.y = PC;
  body.position.y = -1.0 - PC; tilt.add(body);
  const handle = sh(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 12, Math.PI), plastic(opts.color || 'nougat')));
  handle.rotation.z = -Math.PI / 2; handle.position.set(0.38, -0.2 - PC, 0); tilt.add(handle);
  // `courses: true` = a toy-brick jug: curved brick courses with grooves and joints, a rolled lip, a thick handle
  if (opts.courses) {
    const P = [[0, 0], [0.32, 0], [0.45, 0.25], [0.48, 0.6], [0.36, 0.95], [0.2, 1.05], [0.2, 1.25], [0.27, 1.32]];
    const cg = new THREE.Group(); cg.position.y = body.position.y; tilt.add(cg);
    brickCourses(cg, P, { y0: 0.04, y1: 0.98, n: 5, joints: 8, color: opts.joint || '#8a4a28' });
    const lip = sh(new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 8, 20), plastic(opts.color || 'nougat'))); lip.rotation.x = Math.PI / 2; lip.position.y = 1.3; cg.add(lip);
    const neck = sh(new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.035, 6, 20), plastic(opts.joint || '#8a4a28'))); neck.rotation.x = Math.PI / 2; neck.position.y = 1.07; cg.add(neck);
    handle.scale.set(1.15, 1.15, 1.6);
  }
  // the stream of water: a thin bluish column, from the jug's mouth straight down (in the prop's own frame, not tilted)
  const fall = opts.fall ?? 2.2;
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 1, 10, 1, true), plastic(opts.water || 'skyBlue', { transparent: true, opacity: 0.75 }));
  stream.visible = false; g.add(stream);
  const drops = [0, 1, 2].map(() => { const d = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), plastic(opts.water || 'skyBlue', { transparent: true, opacity: 0.75 })); d.visible = false; g.add(d); return d; });
  const base = opts.bend ?? 0;
  const pose = (k, t) => {
    const kk = Math.max(0, Math.min(1, k)), a = kk * 1.65;
    tilt.rotation.x = a; tilt.position.z = 0.25 * kk;
    const r = 1.32 - 1 - PC; // the mouth (rim) above the pivot
    const wy = PC + r * Math.cos(a), wz = 0.25 * kk + r * Math.sin(a);
    const flow = Math.max(0, Math.min(1, (k - 0.55) / 0.2));
    stream.visible = flow > 0.01;
    const L = fall * flow;
    stream.scale.set(1, Math.max(0.01, L), 1);
    stream.position.set(0, wy - L / 2, wz + 0.05);
    drops.forEach((d, i) => { d.visible = flow > 0.5; const u = ((t * 2.2 + i / 3) % 1); d.position.set(0.04 * (i - 1), wy - fall + 0.05 + 0.15 * Math.sin(u * Math.PI), wz + 0.05 + 0.2 * (u - 0.5)); });
  };
  pose(base, 0);
  g.userData.update = (t, ctx) => pose(ctx?.bend ?? base, t);
  g.userData.ground = 1.0;
  g.userData.hold = [0, 0.3, 0.2];
  return g;
}

function basket(opts = {}) {
  const g = new THREE.Group();
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d'); x.fillStyle = '#c99a55'; x.fillRect(0, 0, 128, 64);
  x.strokeStyle = '#8a6430'; x.lineWidth = 3;
  for (let i = 0; i < 128; i += 8) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 4, 64); x.stroke(); }
  for (let j = 6; j < 64; j += 10) { x.beginPath(); x.moveTo(0, j); x.lineTo(128, j); x.stroke(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping; tex.repeat.x = 3;
  const bowl = !!opts.bowl; // `bowl: true` = a wide, low woven basket with a thick rolled rim and no handle (a basket of vegetables)
  const b = sh(new THREE.Mesh(bowl ? new THREE.CylinderGeometry(0.88, 0.58, 0.62, 28, 1, true) : new THREE.CylinderGeometry(0.7, 0.5, 0.7, 20, 1, true), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8, ...(bowl ? { bumpMap: tex, bumpScale: 2 } : {}) })));
  b.position.y = bowl ? -0.59 : -0.55; g.add(b);
  if (bowl) {
    tex.repeat.x = 5;
    // a thick rim of twisted cane (two strands wound round each other) and a woven foot ring
    const rm = [plastic('#b07a3a'), plastic('#8a5a26')];
    for (let k = 0; k < 2; k++) {
      const pts = []; for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2, w = a * 9 + k * Math.PI; pts.push(new THREE.Vector3(Math.cos(a) * (0.9 + 0.035 * Math.cos(w)), -0.28 + 0.035 * Math.sin(w), Math.sin(a) * (0.9 + 0.035 * Math.cos(w)))); }
      const t = sh(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 96, 0.055, 6, true), rm[k])); g.add(t);
    }
    const foot = sh(new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.05, 6, 28), rm[1])); foot.rotation.x = Math.PI / 2; foot.position.y = -0.88; g.add(foot);
  }
  const bottom = sh(new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), plastic('tan'))); bottom.rotation.x = -Math.PI / 2; bottom.position.y = -0.9; g.add(bottom);
  const handle = sh(new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.05, 6, 16, Math.PI), plastic('darkTan'))); handle.position.y = -0.25; g.add(handle);
  if (bowl) { handle.visible = false; bottom.scale.setScalar(1.16); }
  // eggs (and a small loaf) lying in the basket: a gift of food
  if (opts.eggs) {
    const egg = new THREE.SphereGeometry(0.15, 12, 8), em = plastic(opts.eggColor || 'white');
    const spots = [[-0.28, 0.05], [0.0, -0.22], [0.26, 0.08], [-0.05, 0.22], [0.12, -0.02]];
    spots.slice(0, opts.eggs === true ? 5 : Math.min(5, opts.eggs)).forEach(([x, z], i) => {
      const e = sh(new THREE.Mesh(egg, em)); e.scale.set(1, 1.3, 1); e.rotation.z = (i - 2) * 0.35; e.position.set(x, -0.45, z); g.add(e);
    });
  }
  if (opts.loaf) {
    const l = sh(new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10), plastic('breadCrust'))); l.scale.set(1.25, 0.6, 0.85); l.position.set(-0.12, -0.42, -0.25); g.add(l);
  }
  // a heap of gold coins (a gift of money left in the basket)
  if (opts.coins) {
    const coin = new THREE.CylinderGeometry(0.13, 0.13, 0.04, 14), cm = plastic('gold', { metal: true }), cm2 = plastic('yellow', { metal: true });
    const heap = sh(new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cm)); heap.scale.y = 0.45; heap.position.y = -0.45; g.add(heap);
    const r = rng(opts.seed || 4);
    for (let i = 0; i < 16; i++) {
      const a = r() * Math.PI * 2, d = r() * 0.42;
      const c = sh(new THREE.Mesh(coin, i % 3 ? cm : cm2));
      c.position.set(Math.cos(a) * d, -0.45 + 0.24 * Math.sqrt(1 - (d / 0.5) ** 2) + 0.02 + i * 0.001, Math.sin(a) * d);
      c.rotation.set((r() - 0.5) * 0.8, 0, (r() - 0.5) * 0.8); g.add(c);
    }
  }
  // `onions: true` = a heap of onions (ceapă): red and golden bulbs with pointed tips and little green sprouts — a gift from the garden
  if (opts.onions) {
    // onions with papery skins (fine vertical veins), a dry pointed neck, a tuft of roots underneath, green sprouts on some
    const skin = (base, vein) => { const c = document.createElement('canvas'); c.width = 64; c.height = 32; const x = c.getContext('2d');
      x.fillStyle = base; x.fillRect(0, 0, 64, 32); x.strokeStyle = vein; x.lineWidth = 1.2; for (let i = 0; i < 64; i += 5) { x.beginPath(); x.moveTo(i, 0); x.quadraticCurveTo(i + 2, 16, i, 32); x.stroke(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.MeshStandardMaterial({ map: t, roughness: 0.35 }); };
    const cols = [skin('#9a2c55', '#c86a8e'), skin('#d98a3a', '#f2c27a'), skin('#b23c5e', '#e090ac'), skin('#e2a24e', '#f6d29a')];
    const neckM = [plastic('#c89a6a'), plastic('#d9b07a')], rootM = plastic('#e8d8b0'), sproutM = plastic('brightGreen');
    const bulbG = new THREE.LatheGeometry([[0, -0.2], [0.12, -0.19], [0.21, -0.1], [0.24, 0.02], [0.2, 0.14], [0.1, 0.24], [0.05, 0.31], [0.02, 0.38], [0, 0.4]].map(([a, c]) => new THREE.Vector2(a, c)), 16);
    const R = bowl ? 1.25 : 1, y0 = bowl ? -0.36 : -0.42;
    [[-0.27, 0, 0.1, 0], [0.27, 0, -0.06, 1], [0.03, 0, 0.3, 2], [-0.04, 0, -0.3, 3], [0.02, 0.16, 0.02, 1], [-0.24, 0.12, -0.18, 2], [0.3, 0.1, 0.28, 0], [-0.33, 0.05, 0.36, 3], [0.42, 0, -0.38, 2]].slice(0, bowl ? 9 : 6).forEach(([x, y, z, c], i) => {
      const o = new THREE.Group(); o.position.set(x * R, y0 + y, z * R); o.rotation.set((i % 3 - 1) * 0.4, i, (i % 2 - 0.5) * 0.6); g.add(o);
      o.add(sh(new THREE.Mesh(bulbG, cols[c])));
      const nk = sh(new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 6), neckM[c % 2])); nk.position.y = 0.45; nk.rotation.z = 0.25; o.add(nk);
      for (let k = 0; k < 4; k++) { const rt = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.006, 0.09, 3), rootM); rt.position.set(Math.cos(k * 1.6) * 0.04, -0.23, Math.sin(k * 1.6) * 0.04); rt.rotation.set(Math.sin(k) * 0.6, 0, Math.cos(k) * 0.6); o.add(rt); }
      if (i % 3 === 0) { for (const dz of [-0.03, 0.03]) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.015, 0.3, 5), sproutM); sp.position.set(0, 0.58, dz); sp.rotation.x = dz * 6; o.add(sp); } }
    });
  }
  // `fruit: true` (or a colour) = a heap of round fruits (red): the fruits of the sapling, carried to the brothers
  // `fill: true` = the basket fills up as it is picked into: `bend` 0..1 (on the prop or animated with the `bend` action) =
  // how full it is (0 = empty, 1 = heaped), the bottom fruits first
  if (opts.fruit) {
    const fm = plastic(opts.fruit === true ? 'red' : opts.fruit), fg = new THREE.SphereGeometry(0.19, 12, 10);
    const fr = [[-0.3, -0.44, 0.1], [0.3, -0.44, -0.05], [0.05, -0.44, 0.3], [-0.05, -0.44, -0.3], [0.22, -0.42, 0.24], [-0.24, -0.42, -0.22], [0, -0.34, 0]]
      .map(([x, y, z]) => { const f = sh(new THREE.Mesh(fg, fm)); f.position.set(x, y, z); g.add(f); return f; });
    if (opts.fill) {
      const pose = (k) => fr.forEach((f, i) => { f.visible = i < Math.round(Math.max(0, Math.min(1, k)) * fr.length); });
      pose(opts.bend ?? 0);
      g.userData.update = (t, ctx) => pose(ctx?.bend ?? opts.bend ?? 0);
    }
  }
  if (opts.filled) { const f = sh(new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), plastic(opts.filled))); f.position.y = -0.4; f.scale.y = 0.4; g.add(f); }
  // `leak: true` = a basket with a hole: a thin stream of sand grains keeps running out of the bottom (Avva Moise's basket)
  if (opts.leak) {
    const grain = new THREE.SphereGeometry(0.06, 6, 4), gm = plastic(opts.leakColor || opts.filled || 'sand');
    const n = 14, fall = opts.leakFall ?? 2.4, holes = [[0.12, 0.08], [-0.15, -0.05]];
    const grains = Array.from({ length: n }, () => { const m = new THREE.Mesh(grain, gm); g.add(m); return m; });
    g.userData.update = (t) => grains.forEach((m, i) => {
      const k = ((t * 1.6 + i / n) % 1 + 1) % 1;
      const [hx, hz] = holes[i % 2];
      m.position.set(hx + Math.sin(i * 1.7) * 0.03, -0.92 - k * k * fall, hz + Math.cos(i * 2.3) * 0.03);
      m.scale.setScalar(1 - 0.4 * k);
    });
  }
  // `broken: true` = the basket gets broken (crushed when it falls): `bend` 0..1 (on the prop or animated with the `bend`
  // action, e.g. `{ "prop": "cos", "bend": 1, "duration": 0.3 }` right after a `put` on the ground) = 0 whole … 1 broken:
  // a torn gap in the side with loose strands sticking out, the handle snapped (one half hanging down), the basket squashed
  if (opts.broken) {
    const torn = new THREE.Group(); g.add(torn);
    const gap = 1.3;
    const wall = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 0.7, 20, 1, true, gap / 2 + Math.PI / 2, Math.PI * 2 - gap), b.material));
    wall.position.y = -0.55; torn.add(wall);
    const sm = plastic('darkTan'), sg = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5);
    [[-0.32, -0.4, 0.55, 0.9, 0.4], [-0.1, -0.62, 0.62, 1.3, -0.3], [0.15, -0.5, 0.6, 0.7, 0.6], [0.3, -0.72, 0.5, 1.4, -0.5], [0.0, -0.32, 0.66, 0.5, 0.1]]
      .forEach(([x, y, z, rx, rz]) => { const m = sh(new THREE.Mesh(sg, sm)); m.position.set(x, y, z); m.rotation.set(rx, 0, rz); torn.add(m); });
    // the snapped handle: one quarter still standing, the other hanging down outside the rim
    const q = new THREE.TorusGeometry(0.6, 0.05, 6, 10, Math.PI / 2);
    const h1 = sh(new THREE.Mesh(q, plastic('darkTan'))); h1.position.y = -0.25; torn.add(h1);
    const h2 = sh(new THREE.Mesh(q, plastic('darkTan'))); h2.rotation.set(0, 0, Math.PI / 2 + 1.9); h2.position.set(-0.68, -0.3, 0.05); torn.add(h2);
    // squash an inner group about the bottom (the prop's own scale stays the engine's)
    const inner = new THREE.Group(); [...g.children].forEach(ch => inner.add(ch)); g.add(inner);
    const pose = (k) => {
      const kk = Math.max(0, Math.min(1, k)), br = kk > 0.35;
      b.visible = handle.visible = !br; torn.visible = br; torn.scale.setScalar(br ? 1 : 1e-3); // (hidden parts collapsed: the checks see no ghost strands)
      const sq = br ? 0.3 * Math.min(1, (kk - 0.35) / 0.4) : 0;
      inner.scale.set(1 + sq * 0.35, 1 - sq, 1 + sq * 0.2); inner.position.y = -0.9 * sq; inner.rotation.z = sq * 0.3;
    };
    pose(opts.bend ?? 0);
    g.userData.update = (t, ctx) => pose(ctx?.bend ?? opts.bend ?? 0);
  }
  g.userData.ground = 0.9;
  g.userData.hold = [0, 0, 0.3];
  return g;
}

/** Rising steam puffs (pure function of t). Adds puffs to g and returns update(t). */
function steam(g, { y = 0.1, n = 3, spread = 0.18, rise = 1.1, size = 0.16, tint = 0xffffff, speed = 0.55, opacity = 0.55 } = {}) {
  const puffs = [];
  const geo = new THREE.SphereGeometry(size, 10, 8);
  for (let i = 0; i < n; i++) {
    const m = new THREE.MeshStandardMaterial({ color: tint, transparent: true, opacity: 0.5, roughness: 1, depthWrite: false });
    const p = new THREE.Mesh(geo, m); p.renderOrder = 2; g.add(p); puffs.push(p);
  }
  return (t) => {
    puffs.forEach((p, i) => {
      const k = ((t * speed + i / n) % 1 + 1) % 1;
      const s = 0.6 + k * 1.4;
      p.scale.setScalar(s);
      p.position.set(Math.sin(t * 1.3 + i * 2.1) * spread * (0.4 + k), y + k * rise, Math.cos(t * 1.1 + i) * spread * 0.5);
      p.material.opacity = opacity * Math.sin(Math.PI * k);
    });
  };
}

/**
 * A round loaf. `fresh: true` → golden crust with scored top and rising steam (warm, just out of the oven;
 * `steam: false` to turn the steam off). `dry: true` → flat, grey-brown, cracked (the hard desert bread).
 */
function bread(opts = {}) {
  const g = new THREE.Group();
  const dry = !!opts.dry, fresh = !!opts.fresh;
  const crust = plastic(opts.color || (dry ? 'staleBread' : fresh ? 'breadCrust' : 'nougat'));
  const loaf = sh(new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 10), crust));
  loaf.scale.set(1, dry ? 0.42 : 0.6, 1); loaf.position.y = -0.15; g.add(loaf);
  if (fresh) {
    // three light score marks across the top
    const cut = plastic('breadLight');
    for (let i = -1; i <= 1; i++) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.04, 0.42), cut);
      c.position.set(i * 0.17, 0.085 - Math.abs(i) * 0.03, 0); c.rotation.y = 0.35; c.rotation.z = -i * 0.25; g.add(c);
    }
    if (opts.steam !== false) g.userData.update = steam(g, { y: 0.15 });
  }
  if (dry) {
    // dark cracks on the top crust
    const crack = plastic('darkBrown');
    for (const [x, z, r] of [[-0.12, 0.05, 0.6], [0.14, -0.08, -0.9], [0.02, 0.18, 1.6]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.26), crack);
      c.position.set(x, 0.015, z); c.rotation.y = r; g.add(c);
    }
  }
  g.userData.ground = dry ? 0.32 : 0.39;
  g.userData.hold = [0, 0.15, 0.45]; // held in front of the hand, clear of the robe
  return g;
}

/**
 * Cojoc: a sheepskin used as a bundle / bag, open at the top with loaves peeking out.
 * `bread: "dry"` (default) or `"fresh"` (golden, steaming).
 */
function cojoc(opts = {}) {
  const g = new THREE.Group();
  const wool = plastic(opts.color || 'white'), wool2 = plastic('lightNougat');
  const R = 0.72, cy = -0.95;
  const bag = sh(new THREE.Mesh(new THREE.SphereGeometry(R, 20, 14, 0, Math.PI * 2, 0.75, Math.PI - 0.75),
    new THREE.MeshStandardMaterial({ color: wool.color, roughness: 0.9, side: THREE.DoubleSide })));
  bag.position.y = cy; bag.scale.set(1, 0.85, 0.9); g.add(bag);
  // woolly bumps
  const bump = new THREE.SphereGeometry(0.16, 8, 6);
  const r = rng(opts.seed || 4);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, th = 0.9 + r() * 1.7;
    const b = sh(new THREE.Mesh(bump, i % 3 ? wool : wool2));
    b.position.set(Math.sin(th) * Math.cos(a) * R * 0.98, cy + Math.cos(th) * R * 0.85, Math.sin(th) * Math.sin(a) * R * 0.9);
    g.add(b);
  }
  // fleece rim around the opening
  const rim = sh(new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.11, 8, 18), wool2));
  rim.rotation.x = Math.PI / 2; rim.position.y = cy + Math.cos(0.75) * R * 0.85; rim.scale.set(1, 0.9, 1); g.add(rim);
  // loaves peeking out
  const kind = opts.bread || 'dry';
  for (const [x, z, ry] of [[-0.2, 0.06, 0.3], [0.2, -0.1, 1.1], [0.02, 0.2, 2]]) {
    const l = bread({ dry: kind === 'dry', fresh: kind === 'fresh', steam: false });
    l.position.set(x, cy + 0.62, z); l.rotation.set(0.25 * (x > 0 ? 1 : -1), ry, 0); g.add(l);
  }
  if (kind === 'fresh' && opts.steam !== false) g.userData.update = steam(g, { y: cy + 0.75, n: 4, spread: 0.25 });
  // rope handle the hand holds
  const rope = sh(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 16, Math.PI), plastic('reddishBrown')));
  rope.position.y = cy + 0.5; rope.scale.y = 1.15; g.add(rope);
  g.userData.ground = -cy + R * 0.85;
  g.userData.hold = [0, 0.1, 0.62]; // the bag is wide: keep it in front of the body
  return g;
}

function rock() {
  const b = new Builder();
  b.brick(-1, 0, -0.8, 2, 2, 3, 'gray', { studs: false }).brick(-0.6, 1.2, -0.5, 1, 1, 2, 'lightGray', { studs: false });
  const g = b.build(); g.userData.ground = 0; return g;
}

/** A clay brick (cărămidă) lying flat, `color`. Held in front of the body, small. */
function brick(opts = {}) {
  const g = new THREE.Group();
  const c = opts.color || 'darkOrange';
  const body = sh(new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.32, 0.38), plastic(c)));
  body.position.y = 0; g.add(body);
  // a pressed hollow on top (frog) — the brick reads as a brick, not a box
  const frog = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.02, 0.18), plastic(opts.frog || 'reddishBrown'));
  frog.position.y = 0.165; g.add(frog);
  g.userData.ground = 0.16;
  g.userData.hold = [0, 0.05, 0.36];
  return g;
}

function mat(opts = {}) {
  const b = new Builder();
  b.tile(-1.5, 0, -2.5, 3, 5, opts.color || 'tan');
  const g = b.build();
  for (let i = 0; i < 5; i++) {
    const line = new THREE.Mesh(new THREE.BoxGeometry(3, 0.02, 0.06), plastic('darkTan'));
    line.position.set(0, 0.41, -2 + i); g.add(line);
  }
  // a little above the ground: a mat put in front of a hut lies ON the hut's own doormat, never in its plane
  g.userData.ground = 0.07; // (hut doormats lie at 0.03, paths at 0)
  return g;
}

function stool() {
  const b = new Builder();
  b.brick(-0.5, 0, -0.5, 1, 1, 3, 'reddishBrown', { studs: false }).plate(-1, 1.2, -1, 2, 2, 'reddishBrown', { studs: false });
  const g = b.build(); g.userData.ground = 0; g.userData.seat = 1.6; return g;
}

function candle(opts = {}) {
  const g = new THREE.Group();
  const c = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.8, 10), plastic(opts.color || 'white')));
  c.position.y = 0.4; g.add(c);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), plastic('orange', { emissive: 'brightYellow', emissiveIntensity: 2 }));
  flame.scale.y = 1.8; flame.position.y = 0.95; g.add(flame);
  const light = new THREE.PointLight(0xffb347, 2.5, 6, 2); light.position.y = 1.1; g.add(light);
  // `holder: true` = on a little brass dish with a ring handle, wax drips running down, a black wick
  if (opts.holder) {
    c.position.y = 0.52; flame.position.y = 1.08; light.position.y = 1.2;
    const brass = plastic('gold', { metal: true });
    const dish = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.34, 0.08, 20), brass)); dish.position.y = 0.04; g.add(dish);
    const rim = sh(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.03, 6, 24), brass)); rim.rotation.x = Math.PI / 2; rim.position.y = 0.09; g.add(rim);
    const cup = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.14, 14), brass)); cup.position.y = 0.15; g.add(cup);
    const ring = sh(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 14), brass)); ring.position.set(0.48, 0.1, 0); g.add(ring);
    const wax = plastic(opts.color || 'cream');
    for (let i = 0; i < 4; i++) { const a = i * 1.7, l = 0.18 + (i % 3) * 0.1; const d = sh(new THREE.Mesh(new THREE.CapsuleGeometry(0.035, l, 3, 6), wax)); d.position.set(Math.cos(a) * 0.125, 0.88 - l / 2, Math.sin(a) * 0.125); g.add(d); }
    const top = sh(new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 6, 14), wax)); top.rotation.x = Math.PI / 2; top.position.y = 0.92; g.add(top);
    const wick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 5), plastic('black')); wick.position.y = 0.97; g.add(wick);
  }
  g.userData.ground = 0;
  return g;
}

/** A hand-held lantern (*felinar*) for a journey at night: a little brass frame with warm glowing glass sides, a pointed
 *  cap and a ring handle, with a soft point light. Origin = the grip at the top of the ring (it hangs below the hand,
 *  like the jug); on the ground it stands on its base. `color` = frame (default gold), `light` = intensity (2.6), `glow: false` = unlit. */
function lantern(opts = {}) {
  const g = new THREE.Group();
  const frame = plastic(opts.color || 'gold', { metal: true });
  const glass = plastic('brightYellow', { emissive: 'orange', emissiveIntensity: opts.glow === false ? 0 : 1.3, transparent: true, opacity: 0.85 });
  const base = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.28, 0.1, 12), frame)); base.position.y = -1.1; g.add(base);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), glass); body.position.y = -0.8; g.add(body);
  for (let i = 0; i < 4; i++) { // four thin posts outside the glass (never coplanar with it)
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const post = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.56, 5), frame));
    post.position.set(Math.sin(a) * 0.23, -0.8, Math.cos(a) * 0.23); g.add(post);
  }
  const cap = sh(new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.26, 12), frame)); cap.position.y = -0.42; g.add(cap);
  const ring = sh(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.03, 6, 12), frame)); ring.position.y = -0.17; g.add(ring);
  if (opts.glow !== false) {
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), plastic('orange', { emissive: 'brightYellow', emissiveIntensity: 2 }));
    flame.scale.y = 1.7; flame.position.y = -0.82; g.add(flame);
    const light = new THREE.PointLight(0xffb04a, opts.light ?? 2.6, 9, 1.6); light.position.y = -0.7; g.add(light);
  }
  g.userData.ground = 1.15;
  g.userData.hold = [0, 0.05, 0.3];
  return g;
}

/** A book (the Gospel, the Scriptures). `color` of the cover; `ornate: true` = a precious book: bigger, gold-clad cover
 *  with a gold cross, corner pieces and a red stone (a costly book — something worth stealing / selling). */
function book(opts = {}) {
  const g = new THREE.Group();
  const k = opts.ornate ? 1.3 : 1;
  const cover = sh(new THREE.Mesh(new THREE.BoxGeometry(0.8 * k, 0.18 * k, 0.6 * k), plastic(opts.color || 'darkRed')));
  const pages = sh(new THREE.Mesh(new THREE.BoxGeometry(0.74 * k, 0.14 * k, 0.62 * k), plastic('white')));
  pages.position.x = 0.04 * k; g.add(cover, pages);
  const top = 0.09 * k;
  const gold = plastic('gold', { metal: !!opts.ornate });
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.08 * k, 0.02, 0.36 * k), gold); cross.position.y = top + 0.01; g.add(cross);
  // the cross bar a hair higher than the upright: never coplanar with it
  const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.3 * k, 0.02, 0.08 * k), gold); cross2.position.set(0, top + 0.04, -0.05 * k); g.add(cross2);
  if (opts.ornate) {
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.16), gold);
      c.position.set(sx * (0.4 * k - 0.08), top + 0.006, sz * (0.3 * k - 0.08)); g.add(c);
    }
    const gem = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), plastic('red', { emissive: 'darkRed', emissiveIntensity: 0.4 }));
    gem.scale.y = 0.6; gem.position.set(0, top + 0.04, -0.05 * k); g.add(gem);
  }
  // `leather: true` = an old leather-bound book: a padded brown cover, raised bands on the spine, brass corner caps and a
  // clasp strap over the fore-edge, the gilt cross
  if (opts.leather) {
    cover.material = new THREE.MeshStandardMaterial({ color: color(opts.color || '#7a3d1e'), roughness: 0.6 });
    const brass = plastic('gold', { metal: true });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) for (const sy of [-1, 1]) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.13 * k, 0.03, 0.13 * k), brass); c.position.set(sx * (0.4 * k - 0.06), sy * (top + 0.02), sz * (0.3 * k - 0.06)); g.add(c);
    }
    for (const z of [-0.18, 0, 0.18]) { const band = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.24 * k, 6), cover.material)); band.position.set(-0.41 * k, 0, z * k); g.add(band); } // raised bands across the spine
    const strap = sh(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24 * k, 0.1 * k), cover.material)); strap.position.set(0.41 * k, 0, 0); g.add(strap);
    const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.12 * k), brass); clasp.position.set(0.5 * k, 0, 0); g.add(clasp);
  }
  g.userData.ground = 0.09 * k;
  g.userData.hold = [0, 0.12, 0.42 * k];
  // `chest: true`: held in the RIGHT hand but centred in front of the chest, so the holder's other arm comes forward too (twoHands) and it reads as held with both hands; the figure's right hand is at -x in its own frame
  if (opts.chest) { g.userData.hold = [0.62, 0.06, 0.3]; g.userData.twoHands = true; }
  return g;
}

/** A bundle of firewood (legătură de lemne): logs tied with two ropes, carried across the arms in front. */
function firewood(opts = {}) {
  const g = new THREE.Group();
  const cols = [opts.color || 'reddishBrown', 'brown', 'darkTan'];
  const logs = [[-0.2, 0], [0, 0], [0.2, 0], [-0.1, 0.18], [0.1, 0.18], [0, 0.34]];
  logs.forEach(([z, y], i) => {
    const l = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.5 - (i % 3) * 0.12, 8), plastic(cols[i % 3])));
    l.rotation.z = Math.PI / 2; l.position.set((i % 2) * 0.06 - 0.03, y, z); g.add(l);
  });
  for (const x of [-0.4, 0.4]) {
    const rope = sh(new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.04, 6, 16), plastic('tan')));
    rope.rotation.y = Math.PI / 2; rope.scale.set(1, 0.85, 1); rope.position.set(x, 0.16, 0); g.add(rope);
  }
  g.userData.ground = 0.1;
  g.userData.hold = [0, 0.05, 0.5];
  return g;
}

function prayerRope() {
  const g = new THREE.Group();
  const knot = new THREE.SphereGeometry(0.06, 6, 5);
  const m = plastic('black');
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const k = new THREE.Mesh(knot, m); k.position.set(Math.sin(a) * 0.3, -0.3 - Math.cos(a) * 0.3, 0); g.add(k);
  }
  g.userData.ground = 0.6;
  return g;
}

function cross(opts = {}) {
  const b = new Builder();
  const c = opts.color || 'reddishBrown';
  if (opts.base) {
    // a standing wooden cross on a two-step base, the beam ends capped, a little brass plate where the beams meet
    b.brick(-1, 0, -1, 2, 2, 1, c, { studs: true }).brick(-0.5, 0.4, -0.5, 1, 1, 1, 'brown', { studs: false });
    b.brick(-0.35, 0.8, -0.35, 0.7, 0.7, 10, c, { studs: false }).brick(-1.4, 3.0, -0.28, 2.8, 0.56, 2, c, { studs: false }); // the beam thinner than the post: no coplanar faces
    const g = b.build();
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.04), plastic('gold', { metal: true })); pl.position.set(0, 3.4, 0.37); g.add(pl);
    g.userData.ground = 0; return g;
  }
  b.brick(-0.5, 0, -0.5, 1, 1, 9, c, { studs: false }).brick(-1.5, 2.0, -0.5, 3, 1, 2, c, { studs: false });
  const g = b.build(); g.userData.ground = 0; return g;
}

/** Sickle (secera): wooden handle in the hand, curved iron blade in front. */
function sickle() {
  const g = new THREE.Group();
  const handle = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.8, 8), plastic('reddishBrown')));
  handle.position.y = 0.05; g.add(handle);
  const blade = sh(new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.06, 6, 18, Math.PI * 1.15), plastic('lightGray', { metal: true })));
  blade.position.set(0, 0.45, 0.5); blade.rotation.set(0, Math.PI / 2, 0.2); g.add(blade);
  g.userData.ground = 0.45;
  g.userData.hold = [0, 0, 0.1];
  return g;
}

/** Sheaf of wheat (snop): a bundle of stalks tied in the middle, ears on top. Origin = where it is held. */
function sheaf(opts = {}) {
  const g = new THREE.Group();
  const stalk = plastic(opts.color || 'gold'), ear = plastic('yellow'), band = plastic('reddishBrown');
  const body = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 1.6, 12), stalk)); g.add(body);
  const top = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.45, 0.6, 12), ear)); top.position.y = 1.1; g.add(top);
  const tie = sh(new THREE.Mesh(new THREE.TorusGeometry(0.37, 0.07, 6, 16), band)); tie.rotation.x = Math.PI / 2; tie.position.y = 0.1; g.add(tie);
  g.userData.ground = 0.8;
  g.userData.hold = [0, 0.1, 0.6];
  return g;
}

/** Little money pouch (punguță) tied at the top. */
function pouch(opts = {}) {
  const g = new THREE.Group();
  const m = plastic(opts.color || 'darkTan');
  const bag = sh(new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), m)); bag.scale.y = 0.9; bag.position.y = -0.3; g.add(bag);
  const neck = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.18, 10), m)); neck.position.y = 0.0; g.add(neck);
  const tie = sh(new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 6, 12), plastic('gold'))); tie.rotation.x = Math.PI / 2; tie.position.y = 0.0; g.add(tie);
  const coin = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 14), plastic('gold', { metal: true })));
  coin.position.set(0.05, 0.12, 0.02); coin.rotation.x = 1.1; g.add(coin);
  g.userData.ground = 0.58;
  g.userData.hold = [0, 0.15, 0.3];
  return g;
}

// ---------- icons: real Orthodox icon images (the Saviour, the Mother of God and known saints are never minifigs) ----------
const IMAGES = new Map();
/** Loads every image an `icon` prop of the descriptor needs (call before building the Stage; props are built synchronously). */
/** Every repo-relative image file a descriptor needs (icon props, also in a composed poster). Pure: used by the RunPod bundle too. */
export function descriptorImages(desc) {
  const srcs = new Set();
  const scenes = [...(desc.scenes || []), ...(desc.poster && typeof desc.poster === 'object' ? [desc.poster] : [])];
  for (const sc of scenes) for (const p of Object.values(sc.props || {})) if (p && p.type === 'icon' && p.src) srcs.add(p.src);
  return [...srcs];
}
/** Returns the list of images that could not be loaded. Renders (lib/engine/main.js) treat a missing one as a fatal error:
 *  without it the icon is drawn as a plain gold board — that is how a RunPod render once lost its icon (assets/ not uploaded). */
export async function preloadImages(desc, base = '/') {
  const missing = [];
  await Promise.all(descriptorImages(desc).map((src) => new Promise((resolve) => {
    if (IMAGES.has(src)) return resolve();
    const img = new Image();
    img.onload = () => { IMAGES.set(src, img); resolve(); };
    img.onerror = () => { console.error(`icon image not found: ${src}`); missing.push(src); resolve(); };
    img.src = base + src;
  })));
  return missing;
}

/** Icon on a wooden board with a gold frame, standing up (origin = bottom centre, facing +Z).
 *  `src` (repo-relative image), `size` (height in studs, default 4), `glow` (soft light behind it, default true). */
function icon(opts = {}) {
  const g = new THREE.Group();
  const img = IMAGES.get(opts.src);
  const H = opts.size || 4;
  const aspect = img ? img.naturalWidth / img.naturalHeight : 0.75;
  const W = H * aspect, F = 0.18, Dp = 0.22;
  const wood = plastic('reddishBrown'), gold = plastic('gold', { metal: true });
  const board = sh(new THREE.Mesh(new THREE.BoxGeometry(W + 2 * F, H + 2 * F, Dp), wood));
  board.position.y = (H + 2 * F) / 2; g.add(board);
  // gold frame strips in front of the board (not coplanar with it)
  for (const [x, y, w, h] of [[0, H + F * 1.5, W + 2 * F, F], [0, F * 0.5, W + 2 * F, F], [-(W + F) / 2, H / 2 + F, F, H], [(W + F) / 2, H / 2 + F, F, H]]) {
    const st = sh(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), gold)); st.position.set(x, y, Dp / 2 + 0.03); g.add(st);
  }
  let mat;
  if (img) {
    const tex = new THREE.Texture(img); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.needsUpdate = true;
    // unlit: the icon keeps its real colours in any light (night, dream)
    mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
  } else mat = new THREE.MeshBasicMaterial({ color: color('gold') });
  const pic = new THREE.Mesh(new THREE.PlaneGeometry(W, H), mat);
  pic.position.set(0, H / 2 + F, Dp / 2 + 0.015); g.add(pic);
  if (opts.glow !== false) {
    // soft radiance behind the icon (a ring of light, additive)
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'); const gr = x.createRadialGradient(128, 128, 20, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,248,220,0.95)'); gr.addColorStop(0.45, 'rgba(255,225,150,0.45)'); gr.addColorStop(1, 'rgba(255,220,140,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
    const lt = new THREE.CanvasTexture(c); lt.colorSpace = THREE.SRGBColorSpace;
    const light = new THREE.Mesh(new THREE.PlaneGeometry(H * 2.6, H * 2.6), new THREE.MeshBasicMaterial({ map: lt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    light.position.set(0, H / 2 + F, -Dp / 2 - 0.3); g.add(light);
  }
  g.userData.ground = 0;
  g.userData.hold = [0, -0.4, 0.4];
  if ((opts.y || 0) > 0.5) g.userData.noSink = true; // hung up on a wall
  return g;
}

/** Folded garment (haină / mantle): a soft stack of folded cloth with a gold trim; `color`, `trim`. */
function cloak(opts = {}) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: color(opts.color || 'blue'), roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(color(opts.color || 'blue')).multiplyScalar(0.7), roughness: 0.6 });
  const trim = plastic(opts.trim || 'gold');
  // three folds, each a rounded slab slightly smaller than the one below
  const layers = [[1.25, 0.2, 0.9, 0.08], [1.18, 0.2, 0.84, 0.3], [1.1, 0.2, 0.78, 0.52]];
  layers.forEach(([w, h, d, y], i) => {
    const slab = sh(new THREE.Mesh(new THREE.CapsuleGeometry(h / 2, w - h, 4, 10), i % 2 ? dark : m));
    slab.rotation.z = Math.PI / 2; slab.scale.set(1, 1, d / h); slab.position.y = y; g.add(slab);
  });
  // gold hem along the front of the top fold
  const hem = sh(new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.05), trim));
  hem.position.set(0, 0.58, 0.4); g.add(hem);
  g.userData.ground = 0.03;
  g.userData.hold = [0, 0.05, 0.5]; // carried in front, lying on the palm
  return g;
}


/**
 * Cooking pot (ceaun) on three stones over a small fire, with smoke rising from it — a pure function of t.
 * `smoke`: "big" (a tall column seen from far away, default) | "small" (just steam) | false; `fire: false` = cold pot;
 * `color` of the pot; `soup` = colour of what boils inside.
 */
function pot(opts = {}) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const st = sh(new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), plastic(i % 2 ? 'gray' : 'darkGray')));
    st.position.set(Math.cos(a) * 0.62, 0.22, Math.sin(a) * 0.62); st.scale.y = 0.75; st.rotation.y = i; g.add(st);
  }
  const pts = [[0.05, 0], [0.45, 0.04], [0.68, 0.3], [0.72, 0.62], [0.64, 0.9], [0.7, 0.96], [0.66, 1.0]].map(([x, y]) => new THREE.Vector2(x, y));
  const body = sh(new THREE.Mesh(new THREE.LatheGeometry(pts, 22), new THREE.MeshStandardMaterial({ color: color(opts.color || 'black'), roughness: 0.45, side: THREE.DoubleSide })));
  body.position.y = 0.42; g.add(body);
  const soup = new THREE.Mesh(new THREE.CircleGeometry(0.6, 22), plastic(opts.soup || 'darkOrange'));
  soup.rotation.x = -Math.PI / 2; soup.position.y = 0.42 + 0.86; g.add(soup);
  for (const sx of [-1, 1]) { // two little handles
    const h = sh(new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 6, 10), plastic('darkGray')));
    h.position.set(sx * 0.74, 0.42 + 0.82, 0); h.rotation.y = Math.PI / 2; g.add(h);
  }
  const ups = [];
  if (opts.fire !== false) {
    const flames = [];
    const fm = plastic('orange', { emissive: 'orange', emissiveIntensity: 1.4 }), fy = plastic('brightYellow', { emissive: 'brightYellow', emissiveIntensity: 1.2 });
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 8), i % 2 ? fy : fm);
      const a = i * 1.26; f.position.set(Math.cos(a) * 0.22, 0.25, Math.sin(a) * 0.22); g.add(f); flames.push(f);
    }
    const logs = plastic('reddishBrown');
    for (let i = 0; i < 3; i++) { const l = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.9, 6), logs)); l.rotation.set(Math.PI / 2, 0, i * 1.05); l.position.y = 0.08 + i * 0.001; g.add(l); }
    const light = new THREE.PointLight(0xff9a40, 2.2, 6, 2); light.position.set(0, 0.5, 0.6); g.add(light);
    ups.push((t) => {
      // bases at slightly different heights: overlapping coplanar cone bases would flicker
      flames.forEach((f, i) => { const s = 0.8 + 0.3 * Math.sin(t * 11 + i * 2.3) * Math.sin(t * 7.1 + i); f.scale.set(1, s, 1); f.position.y = 0.1 + i * 0.013 + 0.25 * s; });
      light.intensity = 2.0 + 0.5 * Math.sin(t * 13) * Math.sin(t * 5.3);
    });
  }
  if (opts.smoke !== false) {
    const big = opts.smoke !== 'small';
    ups.push(steam(g, big ? { y: 1.4, n: 9, spread: 0.7, rise: 8, size: 0.45, tint: 0xe8e8ec, speed: 0.12, opacity: 0.7 } : { y: 1.35, n: 4, spread: 0.25, rise: 1.4 }));
  }
  if (ups.length) g.userData.update = (t) => ups.forEach((u) => u(t));
  g.userData.ground = 0;
  g.userData.hold = [0, -0.6, 0.6];
  return g;
}

/** Clay bowl with warm soup (fiertură) and a little steam; `soup` colour, `steam: false`. */
function bowl(opts = {}) {
  const g = new THREE.Group();
  const pts = [[0, 0], [0.22, 0], [0.34, 0.08], [0.42, 0.26], [0.44, 0.3]].map(([x, y]) => new THREE.Vector2(x, y));
  const b = sh(new THREE.Mesh(new THREE.LatheGeometry(pts, 20), new THREE.MeshStandardMaterial({ color: color(opts.color || 'nougat'), roughness: 0.6, side: THREE.DoubleSide })));
  b.position.y = -0.15; g.add(b);
  const soup = new THREE.Mesh(new THREE.CircleGeometry(0.39, 20), plastic(opts.soup || 'darkOrange'));
  soup.rotation.x = -Math.PI / 2; soup.position.y = -0.15 + 0.24; g.add(soup);
  if (opts.steam !== false) g.userData.update = steam(g, { y: 0.15, n: 3, spread: 0.12, rise: 0.9, size: 0.12 });
  g.userData.ground = 0.15;
  g.userData.hold = [0, 0.18, 0.42]; // carried flat on the palm, in front of the body
  return g;
}

/**
 * Temniță: a small wooden barred porch built against a house door (a gentle, toy-like jail).
 * Local frame: floor centre at the origin, the barred front at +Z (facing the anchor heading), open at the back
 * (put it in front of a house door: `"at": "house5+0,-0.6"`, the prisoner at `house5+0,-0.6` too).
 * `open: true` = the barred door in the middle of the front is swung open. `width` (5), `depth` (2.8), `color`.
 */
function jail(opts = {}) {
  const g = new THREE.Group();
  const W = opts.width ?? 5, D = opts.depth ?? 2.8, H = 5.2;
  const wood = plastic(opts.color || 'reddishBrown'), iron = plastic(opts.bars || 'darkGray');
  const post = new THREE.BoxGeometry(0.4, H, 0.4), bar = new THREE.CylinderGeometry(0.07, 0.07, H - 0.5, 8);
  const zf = D / 2, zb = -D / 2;
  // four corner posts
  for (const [x, z] of [[-W / 2, zf], [W / 2, zf], [-W / 2, zb], [W / 2, zb]]) {
    const m = sh(new THREE.Mesh(post, wood)); m.position.set(x, H / 2, z); g.add(m);
  }
  // top frame (beams sit on the posts, a little wider, never coplanar with them)
  const beamX = new THREE.BoxGeometry(W + 0.6, 0.35, 0.5), beamZ = new THREE.BoxGeometry(0.5, 0.35, D + 0.7);
  for (const z of [zf, zb]) { const m = sh(new THREE.Mesh(beamX, wood)); m.position.set(0, H + 0.1, z); g.add(m); }
  for (const x of [-W / 2, W / 2]) { const m = sh(new THREE.Mesh(beamZ, wood)); m.position.set(x, H + 0.13, 0); g.add(m); }
  // bottom rail on the front and sides (the back is the house wall)
  const railX = new THREE.BoxGeometry(W - 0.4, 0.25, 0.22), railZ = new THREE.BoxGeometry(0.22, 0.25, D - 0.4);
  const front = new THREE.Group(); g.add(front);
  // side bars
  for (const x of [-W / 2, W / 2]) {
    const r = sh(new THREE.Mesh(railZ, wood)); r.position.set(x, 0.35, 0); g.add(r);
    for (let z = zb + 0.6; z < zf - 0.3; z += 0.6) { const b = sh(new THREE.Mesh(bar, iron)); b.position.set(x, H / 2 + 0.05, z); g.add(b); }
  }
  // front: fixed bars left and right, a barred door in the middle (1.8 wide) that can swing open
  const doorW = 1.8;
  for (let x = -W / 2 + 0.55; x < W / 2 - 0.3; x += 0.55) {
    if (Math.abs(x) < doorW / 2 + 0.05) continue;
    const b = sh(new THREE.Mesh(bar, iron)); b.position.set(x, H / 2 + 0.05, zf); g.add(b);
  }
  for (const sx of [-1, 1]) { const r = sh(new THREE.Mesh(new THREE.BoxGeometry(W / 2 - doorW / 2 - 0.25, 0.25, 0.22), wood)); r.position.set(sx * (W / 4 + doorW / 4), 0.35, zf); g.add(r); }
  const door = new THREE.Group(); door.position.set(-doorW / 2, 0, zf); front.add(door);
  // the door has a little window at face height (the prisoner's face stays visible): its middle bars stop below it
  const winY = 2.9;
  for (let x = 0.2; x < doorW - 0.1; x += 0.45) {
    const mid = x > 0.5 && x < doorW - 0.5;
    const h = mid ? winY - 0.45 : H - 0.9;
    const b = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, h, 8), iron)); b.position.set(x, 0.45 + h / 2, 0); door.add(b);
  }
  for (const y of [0.45, winY, H - 0.5]) { const r = sh(new THREE.Mesh(new THREE.BoxGeometry(doorW - 0.1, 0.22, 0.2), wood)); r.position.set(doorW / 2, y, 0); door.add(r); }
  const lock = sh(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 0.14), plastic('gold'))); lock.position.set(doorW - 0.15, H / 2, 0.16); door.add(lock);
  if (opts.open) door.rotation.y = -1.9; // swung outwards, to the left
  g.userData.ground = 0;
  return g;
}

/** Small work knife (cuțit / briceag of the basket weaver): wooden handle (the grip) and a short shiny blade pointing
 *  forward, away from the holder (held low and flat, never raised like a weapon). */
function knife(opts = {}) {
  const root = new THREE.Group();
  const g = new THREE.Group(); g.rotation.x = Math.PI / 2; root.add(g); // built along +Y, turned so the blade points +Z
  const handle = sh(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.62, 0.26), plastic(opts.handle || 'reddishBrown')));
  handle.position.y = 0; g.add(handle);
  const guard = sh(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.07, 0.34), plastic('darkBrown')));
  guard.position.y = 0.345; g.add(guard);
  // blade: a flat tapered shape (straight back, curved edge to the point)
  const s = new THREE.Shape();
  s.moveTo(-0.13, 0); s.lineTo(0.13, 0); s.lineTo(0.13, 0.55); s.quadraticCurveTo(0.12, 0.82, 0.0, 0.95); s.quadraticCurveTo(-0.13, 0.5, -0.13, 0);
  const bg = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false }); bg.translate(0, 0, -0.025); bg.rotateY(Math.PI / 2);
  const blade = sh(new THREE.Mesh(bg, plastic(opts.color || 'lightGray', { metal: true })));
  blade.position.y = 0.38; g.add(blade);
  root.userData.ground = 0.13;
  root.userData.hold = [0, 0.05, 0.12];
  root.userData.carry = 'low'; // small: the arm may hang lower and still move (cutting strokes)
  return root;
}

/** A bundle of long palm leaves (stripped for weaving baskets and mats), lying flat. `color`. */
function palmLeaves(opts = {}) {
  const g = new THREE.Group();
  const cols = [opts.color || 'brightGreen', 'green', 'oliveGreen'];
  for (let i = 0; i < 7; i++) {
    const leaf = sh(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, 2.4 - (i % 3) * 0.25), plastic(cols[i % 3])));
    leaf.position.set((i - 3) * 0.13, 0.03 + i * 0.012, (i % 2) * 0.1); leaf.rotation.y = (i - 3) * 0.07; g.add(leaf);
  }
  // the tie: a round band around the bundle (a box here would share planes with the flat leaves → flicker)
  const tie = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.13, 10), plastic('darkTan')));
  tie.rotation.z = Math.PI / 2; tie.scale.set(1, 1, 0.8); tie.position.set(0, 0.075, 0.2); g.add(tie);
  g.userData.ground = 0.0;
  g.userData.hold = [0, 0.1, 0.5];
  g.userData.carry = 'low'; // light: held low in front, next to the knife hand
  return g;
}

/** A few grains of barley (boabe de orz) lying on an open palm or on the ground. `n` grains (7), `color`. */
function grains(opts = {}) {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.075, 8, 6);
  const m1 = plastic(opts.color || 'gold'), m2 = plastic('tan');
  const n = opts.n ?? 7, spread = opts.spread ?? 0.22;
  for (let i = 0; i < n; i++) {
    const a = i * 2.4, d = spread * Math.sqrt((i + 0.5) / n);
    const b = sh(new THREE.Mesh(geo, i % 3 ? m1 : m2));
    b.scale.set(1, 0.7, 1.9); b.rotation.y = a * 1.3; b.position.set(Math.cos(a) * d, 0.05 + (i % 2) * 0.02, Math.sin(a) * d);
    g.add(b);
  }
  g.userData.ground = 0.0;
  g.userData.hold = [0, 0.16, 0.5]; // lying on the open palm, in front of the body
  return g;
}

/**
 * Camel (cămilă): a friendly toy camel standing (or lying, `sitting: true`), facing +Z, with a red saddle blanket and,
 * with `sacks: true`, two sacks of grain hanging on its sides. Solid for the `clip` check. `color`.
 */
function camel(opts = {}) {
  const g = new THREE.Group();
  const fur = plastic(opts.color || 'darkTan'), dark = plastic('reddishBrown');
  const sit = !!opts.sitting;
  const by = sit ? 1.15 : 3.2; // body centre height
  const solid = (m) => { m.userData.solid = true; return sh(m); };
  const body = solid(new THREE.Mesh(new THREE.CapsuleGeometry(0.85, 1.9, 6, 12), fur));
  body.rotation.x = Math.PI / 2; body.position.y = by; g.add(body);
  const hump = solid(new THREE.Mesh(new THREE.SphereGeometry(0.85, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), fur));
  hump.scale.set(0.9, 1.1, 1.1); hump.position.set(0, by + 0.6, -0.2); g.add(hump);
  // red saddle blanket over the back in front of the hump, hanging down both sides
  const bm = plastic(opts.blanket || 'red');
  const top = sh(new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.1, 1.06), bm)); top.position.set(0, by + 0.86, 0.85); g.add(top);
  for (const sx of [-1, 1]) { const f = sh(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.95, 1.1), bm)); f.position.set(sx * 0.9, by + 0.36, 0.85); g.add(f); }
  // neck going up and forward, then the head
  const neck = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 2.0, 10), fur));
  neck.position.set(0, by + 0.95, 1.85); neck.rotation.x = 0.55; g.add(neck);
  const head = solid(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.6, 1.25), fur));
  head.position.set(0, by + 1.95, 2.45); g.add(head);
  const muzzle = sh(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.3), plastic('tan')));
  muzzle.position.set(0, by + 1.85, 3.18); g.add(muzzle);
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), plastic('black'));
    eye.position.set(sx * 0.32, by + 2.1, 2.55); g.add(eye);
    const ear = sh(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 0.12), fur));
    ear.position.set(sx * 0.22, by + 2.35, 2.0); g.add(ear);
  }
  // legs (folded under the body when sitting)
  for (const [x, z] of [[-0.5, 1.1], [0.5, 1.1], [-0.5, -1.1], [0.5, -1.1]]) {
    if (sit) {
      const leg = solid(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.36, 1.2), fur));
      leg.position.set(x * 1.3, 0.19, z * 0.85); g.add(leg);
    } else {
      const leg = solid(new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.24, by - 0.2, 10), fur));
      leg.position.set(x, (by - 0.2) / 2, z); g.add(leg);
      const foot = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.36, 0.16, 10), dark));
      foot.position.set(x, 0.08, z + 0.03); g.add(foot);
    }
  }
  const tail = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.9, 6), fur));
  tail.position.set(0, by - 0.1, -1.85); tail.rotation.x = 0.35; g.add(tail);
  if (opts.sacks) for (const sx of [-1, 1]) {
    const sack = sh(new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), plastic(opts.sackColor || 'tan')));
    sack.scale.set(0.6, 1.1, 0.9); sack.position.set(sx * 1.05, by - 0.35, -0.2); g.add(sack);
    const tie = sh(new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 10), plastic('darkTan')));
    tie.rotation.x = Math.PI / 2; tie.position.set(sx * 1.05, by + 0.2, -0.2); g.add(tie);
  }
  g.userData.ground = 0;
  return g;
}

/**
 * Bread jar (a big clay storage vessel, *chiup*, standing on the ground, origin at its base).
 * `full` 0..1: 0 = empty (dark hollow inside), 1 = brimming with golden loaves heaped above the rim (+ steam).
 * Keep two jars and swap them with `show` on a camera cut for the empty -> full moment. `color`, `loafColor`, `steam: false`.
 */
function breadJar(opts = {}) {
  const g = new THREE.Group();
  const full = Math.max(0, Math.min(1, opts.full ?? 0));
  const pts = [[0, 0], [0.55, 0], [0.85, 0.3], [0.97, 0.9], [0.85, 1.5], [0.62, 1.75], [0.72, 1.92]].map(([x, y]) => new THREE.Vector2(x, y));
  const cm = plastic(opts.color || 'reddishBrown');
  const body = sh(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshStandardMaterial({ color: cm.color, roughness: 0.7, side: THREE.DoubleSide })));
  g.add(body);
  const lip = sh(new THREE.Mesh(new THREE.TorusGeometry(0.69, 0.07, 8, 24), cm)); lip.rotation.x = Math.PI / 2; lip.position.y = 1.92; g.add(lip);
  const band = sh(new THREE.Mesh(new THREE.TorusGeometry(0.93, 0.045, 8, 24), plastic('darkTan'))); band.rotation.x = Math.PI / 2; band.position.y = 1.2; g.add(band);
  // dark hollow floor (what an empty jar shows)
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.62, 20), plastic('darkBrown')); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.45; g.add(floor);
  if (full > 0) {
    const lm = plastic(opts.loafColor || 'breadCrust'), cut = plastic('breadLight');
    const level = 0.5 + full * 1.2; // top of the layer of loaves
    const loaf = (x, y, z, r = 0.34) => {
      const l = sh(new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), lm)); l.scale.set(1, 0.62, 1); l.position.set(x, y, z); g.add(l);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, r * 1.1), cut); c.position.set(x, y + r * 0.6, z); c.rotation.y = x * 3 + z; g.add(c);
    };
    loaf(0, level, 0);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.3; loaf(Math.cos(a) * 0.5, level - 0.05, Math.sin(a) * 0.5, 0.3); }
    if (full > 0.5) {
      for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + 0.9; loaf(Math.cos(a) * 0.25, level + 0.28, Math.sin(a) * 0.25, 0.3); }
    }
    if (full > 0.85) {
      loaf(0, level + 0.55, 0, 0.3);
      if (opts.steam !== false) g.userData.update = steam(g, { y: level + 0.9, n: 4, spread: 0.3, rise: 1.4, size: 0.2 });
    }
  }
  g.userData.ground = 0;
  g.userData.hold = [0, 0.5, 0.9];
  return g;
}

/** A flat sheet of fishing net in the XY plane, centred: bars along x and y with little knots, `step` = mesh size. */
function netSheet(w, h, step, twine = 'tan') {
  const g = new THREE.Group();
  const m = plastic(twine), mk = plastic('darkTan');
  const cols = Math.round(w / step), rows = Math.round(h / step);
  const t = 0.06;
  for (let j = 0; j <= rows; j++) {
    const bar = sh(new THREE.Mesh(new THREE.BoxGeometry(w, t, t), m)); bar.position.set(0, -h / 2 + (j / rows) * h, 0); g.add(bar);
  }
  for (let i = 0; i <= cols; i++) {
    const bar = sh(new THREE.Mesh(new THREE.BoxGeometry(t, h, t), m)); bar.position.set(-w / 2 + (i / cols) * w, 0, t * 1.0); g.add(bar);
  }
  const kg = new THREE.SphereGeometry(0.075, 6, 5);
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
    const k = new THREE.Mesh(kg, mk); k.position.set(-w / 2 + (i / cols) * w, -h / 2 + (j / rows) * h, t * 0.5); g.add(k);
  }
  return g;
}

/**
 * Fishing net (mreajă): by default a rolled-up net, a rope-coloured roll with mesh rings, a bit of net hanging out
 * and little red/white floats — light, held low in one hand (weaving it: `work`). `spread: true` = the net lying flat
 * on the ground (`width`, `depth`), `hung: true` = hanging from its top edge (origin at the top middle; `width`, `height`)
 * e.g. from a drying rack. `color` = twine, `floats` colour.
 */
function net(opts = {}) {
  const g = new THREE.Group();
  const fl = [plastic(opts.floats || 'red'), plastic('white')];
  const floatsOn = (n, len, y, z) => {
    for (let i = 0; i < n; i++) {
      const f = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.22, 10), fl[i % 2]));
      f.rotation.z = Math.PI / 2; f.position.set(-len / 2 + (i + 0.5) * (len / n), y, z); g.add(f);
    }
  };
  if (opts.hung) {
    const w = opts.width ?? 3, h = opts.height ?? 2.2;
    const sheet = netSheet(w, h, 0.4, opts.color || 'tan'); sheet.position.y = -h / 2 - 0.02; g.add(sheet);
    floatsOn(6, w, -0.05, 0.12);
    g.userData.ground = 0; return g;
  }
  if (opts.spread) {
    const w = opts.width ?? 3.2, d = opts.depth ?? 2.4;
    const sheet = netSheet(w, d, 0.5, opts.color || 'tan'); sheet.rotation.x = -Math.PI / 2; sheet.position.y = 0.06; g.add(sheet);
    floatsOn(6, w, 0.14, -d / 2);
    g.userData.ground = 0; g.userData.hold = [0, 0.1, 0.4]; return g;
  }
  // rolled: a core, rings of twine around it, a flap of net hanging out and floats on top
  const len = 1.4, r = 0.3;
  const core = sh(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), plastic(opts.color || 'tan')));
  core.rotation.z = Math.PI / 2; g.add(core);
  const ring = new THREE.TorusGeometry(r + 0.012, 0.022, 5, 16), rm = plastic('darkTan');
  for (let i = 0; i < 8; i++) { const rg = new THREE.Mesh(ring, rm); rg.rotation.y = Math.PI / 2; rg.position.x = -len / 2 + 0.1 + i * ((len - 0.2) / 7); g.add(rg); }
  for (const a of [0.5, 2.1, 3.7, 5.3]) {
    const ln = new THREE.Mesh(new THREE.BoxGeometry(len - 0.04, 0.025, 0.025), rm);
    ln.position.set(0, Math.sin(a) * (r + 0.01), Math.cos(a) * (r + 0.01)); ln.rotation.x = -a; g.add(ln);
  }
  const flap = netSheet(1.3, 1.0, 0.33, opts.color || 'tan'); flap.position.set(0.05, -r - 0.45, 0.14); flap.rotation.y = 0.2; g.add(flap);
  floatsOn(4, len - 0.2, r + 0.1, 0);
  g.userData.ground = r;
  g.userData.hold = [0, 0.12, 0.45];
  g.userData.carry = 'low';
  return g;
}


/**
 * A trail of little sand heaps on the ground along `points` ([[x,z], …] in world studs — leave the prop without `at`).
 * `follow: "<actor>"` = the trail is only shown behind that actor: heaps appear as he walks along the points (the sand
 * running out of a leaking basket). `color`, `step` (studs between heaps, 0.55), `lift` = height of the ground under it
 * (0.1 on studded ground; 0.42 on a road of tiles, e.g. the `desert-road`).
 */
function sandTrail(opts = {}) {
  const g = new THREE.Group();
  const pts = opts.points || [[0, 0], [0, 4]];
  const step = opts.step ?? 0.55, r = rng(opts.seed || 7);
  const geo = new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), m = plastic(opts.color || 'sand');
  const heaps = [];
  let s0 = 0;
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const L = Math.hypot(bx - ax, bz - az);
    segs.push({ ax, az, bx, bz, L, s0 });
    for (let d = (i === 1 ? 0 : step - ((s0) % step)); d < L; d += step) {
      const k = d / L;
      const h = sh(new THREE.Mesh(geo, m));
      const sc = 0.75 + r() * 0.5;
      h.scale.set(sc, 0.55 + r() * 0.3, sc);
      h.position.set(ax + (bx - ax) * k + (r() - 0.5) * 0.25, (opts.lift ?? 0.1) + heaps.length * 0.0003, az + (bz - az) * k + (r() - 0.5) * 0.25);
      h.userData.s = s0 + d; g.add(h); heaps.push(h);
    }
    s0 += L;
  }
  if (opts.follow) g.userData.update = (t, ctx) => {
    const p = ctx?.actorPos?.(opts.follow);
    if (!p) return;
    const ox = p.x - g.position.x, oz = p.z - g.position.z;
    let best = Infinity, sF = 0;
    for (const S of segs) {
      const vx = S.bx - S.ax, vz = S.bz - S.az;
      const k = Math.max(0, Math.min(1, ((ox - S.ax) * vx + (oz - S.az) * vz) / Math.max(1e-6, S.L * S.L)));
      const d = Math.hypot(S.ax + vx * k - ox, S.az + vz * k - oz);
      if (d < best) { best = d; sF = S.s0 + k * S.L; }
    }
    for (const h of heaps) h.visible = h.userData.s <= sF - 0.35;
  };
  g.userData.ground = 0;
  return g;
}

/**
 * A leafy tree that can bow down (`bend` 0..1 — set it on the prop, or animate it with the action
 * `{ "prop": "tree", "bend": 1, "duration": 3 }`): the trunk curves forward, towards the way the prop faces (+Z of its
 * anchor), and the crown comes down `bow` degrees (60). `height` (trunk, 6), `leaves` [2 colours], `seed`. Leaves sway a little.
 */
function tree(opts = {}) {
  const g = new THREE.Group();
  const H = opts.height ?? 6, N = 6, segL = H / N, bow = ((opts.bow ?? 60) * Math.PI) / 180;
  const bark = plastic(opts.trunk || 'reddishBrown');
  const segs = [];
  let parent = g;
  for (let i = 0; i < N; i++) {
    const piv = new THREE.Group();
    piv.position.y = i === 0 ? 0 : segL;
    const r0 = 0.75 - 0.3 * (i / N), r1 = 0.75 - 0.3 * ((i + 1) / N);
    const c = sh(new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, segL, 14, 1, true), bark)); c.position.y = segL / 2; piv.add(c);
    if (i > 0) { const j = sh(new THREE.Mesh(new THREE.SphereGeometry(r0, 14, 8), bark)); piv.add(j); }
    parent.add(piv); segs.push(piv); parent = piv;
  }
  // the crown: stacked rings of plates on top of the last trunk piece (layers never overlap)
  const r = rng(opts.seed || 11);
  const leaves = opts.leaves || ['green', 'brightGreen'];
  const b = new Builder();
  const layers = [[3, 0], [4, 1], [5, 0], [4, 1], [2, 0]];
  let y = 0;
  for (const [rad, k] of layers) {
    const cells = new Set();
    for (let x = -rad; x < rad; x++) for (let z = -rad; z < rad; z++) if (Math.hypot(x + 0.5, z + 0.5) < rad + 0.3 - r() * 0.6) cells.add(`${x},${z}`);
    const rows = new Map();
    for (const key of cells) { const [cx, cz] = key.split(',').map(Number); if (!rows.has(cz)) rows.set(cz, []); rows.get(cz).push(cx); }
    for (const [cz, xs] of rows) {
      xs.sort((p, q) => p - q);
      let x0 = xs[0], prev = xs[0];
      for (let i = 1; i <= xs.length; i++) {
        if (i < xs.length && xs[i] === prev + 1) { prev = xs[i]; continue; }
        b.brick(x0, y, cz, prev - x0 + 1, 1, 2, leaves[k], { studs: false });
        if (i < xs.length) { x0 = xs[i]; prev = xs[i]; }
      }
    }
    y += 0.8;
  }
  const crown = b.build();
  crown.position.y = segL; parent.add(crown);
  const base = opts.bend ?? 0;
  const pose = (k, t) => {
    const sway = Math.sin(t * 1.1) * 0.012;
    segs.forEach((p, i) => { p.rotation.x = (k * bow) / N * (0.6 + 0.8 * (i / (N - 1))) + (i === N - 1 ? sway : 0); });
  };
  pose(base, 0);
  g.userData.update = (t, ctx) => pose(ctx?.bend ?? base, t);
  g.userData.ground = 0;
  return g;
}

/**
 * A planted stick that comes to life (Avva Ioan's dry wood): `bend` 0..1 is its growth — set it on the prop, or animate it
 * with the action `{ "prop": "pom", "bend": 1, "duration": 4 }`. 0 = a dry grey stick with three bare twigs in a little
 * mound of earth; ≈ 0.35 = green buds; ≈ 0.7 = a small leafy tree; 1 = the leafy tree full of round fruits (`fruit` colour,
 * default red); 1 → 2 = its fruits are picked (at 2, 60 % of them are gone — animate it while people `pick`). `height` (stick, 3),
 * `wet: true` = the mound is dark, freshly watered. Stand it at `y` 0.2 on studs.
 */
function sapling(opts = {}) {
  const g = new THREE.Group();
  const H = opts.height ?? 3, smooth = (a, b, x) => { const k = Math.max(0, Math.min(1, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  const mound = sh(new THREE.Mesh(new THREE.SphereGeometry(0.75, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), plastic(opts.wet ? 'darkBrown' : 'reddishBrown')));
  mound.scale.y = 0.32; g.add(mound); g.userData.base = mound;
  // `mound: false` = just the stick, carried in the hand before it is planted (held near its top, hanging down: `scale` ≈ 0.55)
  if (opts.mound === false) { mound.visible = false; g.userData.hold = [0, -H * 0.85, 0.35]; }
  const dry = new THREE.Color(color('darkTan')), live = new THREE.Color(color('reddishBrown'));
  const bark = plastic('darkTan').clone();
  const plant = new THREE.Group(); g.add(plant);
  const trunk = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.13, H, 10), bark)); trunk.position.y = H / 2; plant.add(trunk);
  // three bare twigs: [height on the stick, direction, length, tilt]
  const twigs = [[0.62, 0.4, 0.9, 0.85], [0.8, 2.6, 0.75, 0.75], [0.92, 4.4, 0.6, 0.6]];
  const tips = [[0, H + 0.05, 0]];
  for (const [h, a, L, tilt] of twigs) {
    const piv = new THREE.Group(); piv.position.y = H * h; piv.rotation.y = a; plant.add(piv);
    const tw = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.06, L, 6), bark));
    tw.position.set(0, Math.cos(tilt) * L / 2, Math.sin(tilt) * L / 2); tw.rotation.x = tilt; piv.add(tw);
    tips.push([Math.sin(a) * Math.sin(tilt) * L, H * h + Math.cos(tilt) * L, Math.cos(a) * Math.sin(tilt) * L]);
  }
  // buds / little leaves on the tips, then the crown (round clusters), then the fruits
  const leafM = plastic('brightGreen'), leafM2 = plastic('green');
  const buds = tips.map(([x, y, z], i) => { const b = sh(new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), i % 2 ? leafM2 : leafM)); b.position.set(x, y, z); b.scale.set(1, 0.7, 1); plant.add(b); return b; });
  const r = rng(opts.seed || 23);
  const crown = new THREE.Group(); crown.position.y = H * 0.95; plant.add(crown);
  const blobs = [[0, 0.5, 0, 1.15], [0.95, 0.1, 0.3, 0.8], [-0.9, 0.15, 0.25, 0.85], [0.2, 0.05, 0.9, 0.8], [-0.25, 0.1, -0.85, 0.8], [0.15, 1.2, 0.1, 0.75]];
  blobs.forEach(([x, y, z, rad], i) => { const b = sh(new THREE.Mesh(new THREE.SphereGeometry(rad, 16, 12), i % 2 ? leafM2 : leafM)); b.position.set(x, y, z); crown.add(b); });
  const fruitM = plastic(opts.fruit || 'red'), fruitGeo = new THREE.SphereGeometry(0.2, 12, 10);
  const fruits = [];
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + r() * 0.3, el = -0.35 + r() * 0.9;
    const [bx, by, bz, br] = blobs[0];
    const f = sh(new THREE.Mesh(fruitGeo, fruitM));
    const R = (i % 2 ? 1.5 : 1.3);
    f.position.set(bx + Math.cos(a) * Math.cos(el) * R, by + Math.sin(el) * R * 0.9, bz + Math.sin(a) * Math.cos(el) * R);
    crown.add(f); fruits.push(f);
  }
  const pose = (k) => {
    bark.color.copy(dry).lerp(live, smooth(0.05, 0.5, k));
    const thick = 1 + 0.6 * smooth(0.4, 1, k);
    trunk.scale.set(thick, 1, thick);
    const bud = smooth(0.12, 0.4, k) * (1 - smooth(0.6, 0.8, k));
    buds.forEach((b) => { b.visible = bud > 0.01; b.scale.set(bud, bud * 0.7, bud); });
    const c = smooth(0.45, 0.85, k);
    crown.visible = c > 0.01; crown.scale.setScalar(Math.max(0.01, c));
    const fr = smooth(0.82, 1, k), picked = Math.round(Math.max(0, Math.min(1, k - 1)) * 0.6 * fruits.length);
    fruits.forEach((f, i) => { f.visible = fr > 0.01 && (i * 5) % fruits.length >= picked; f.scale.setScalar(Math.max(0.01, fr)); });
  };
  const base = opts.bend ?? 0;
  pose(base);
  g.userData.update = (t, ctx) => pose(ctx?.bend ?? base);
  g.userData.ground = 0;
  return g;
}

/** One round fruit (red by default — `color`) with a little leaf, held in the hand: the fruit of the sapling, given out.
 *  `bend` 0..1 = eaten (smaller bite by bite, gone at 1). */
function fruit(opts = {}) {
  const g = new THREE.Group();
  const f = sh(new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), plastic(opts.color || 'red'))); f.position.y = 0.05; g.add(f);
  const st = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.16, 6), plastic('reddishBrown'))); st.position.y = 0.36; g.add(st);
  const leaf = sh(new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), plastic('brightGreen'))); leaf.scale.set(1.4, 0.35, 0.7); leaf.position.set(0.1, 0.4, 0); g.add(leaf);
  g.userData.ground = 0.21;
  g.userData.hold = [0, 0.15, 0.32];
  // `bend` 0..1 = eaten: the fruit gets smaller bite by bite and is gone at 1 (animate it during the `eat` gesture)
  const pose = (k) => { const e = Math.max(0, Math.min(1, k)); f.scale.setScalar(Math.max(0.01, 1 - e)); f.visible = e < 0.97; leaf.visible = st.visible = e < 0.97; };
  pose(opts.bend ?? 0);
  g.userData.update = (t, ctx) => pose(ctx?.bend ?? opts.bend ?? 0);
  return g;
}

/**
 * Gold coins (bănuți) lying on the open palm or on the ground: `n` coins (3) — a few coins laid flat side by side, more of
 * them (≥ 6) heaped in a little pile = a handful of money (alms). `color` (gold), `spread` (0.2).
 */
function coins(opts = {}) {
  const g = new THREE.Group();
  const n = opts.n ?? 3, spread = opts.spread ?? 0.2;
  const geo = new THREE.CylinderGeometry(0.11, 0.11, 0.035, 16);
  const m = plastic(opts.color || 'gold', { metal: true }), rim = plastic('yellow', { metal: true });
  for (let i = 0; i < n; i++) {
    const layer = n <= 4 ? 0 : Math.floor(Math.sqrt(i)) ; // a pile: fewer coins higher up
    const a = i * 2.4, d = n <= 4 ? spread * (i ? 0.8 : 0) : spread * Math.max(0, 1 - layer * 0.28) * ((i % 4) / 4 + 0.25);
    const c = sh(new THREE.Mesh(geo, i % 3 === 1 ? rim : m));
    c.position.set(Math.cos(a) * d, 0.02 + layer * 0.04 + (i % 2) * 0.005, Math.sin(a) * d);
    c.rotation.set(((i * 7) % 5 - 2) * 0.06, a, ((i * 3) % 5 - 2) * 0.06);
    g.add(c);
  }
  g.userData.ground = 0.0;
  g.userData.hold = [0, 0.16, 0.5]; // lying on the open palm, in front of the body
  return g;
}

/**
 * A little bird (*pasăre*), toy-like: round body, head with a beak and two bright eyes, a fan tail and two wings. Origin = its
 * feet (perch it on a branch / a crossbar with `y`). `color` (body, default dark grey — seen from afar it could be a pigeon or a
 * crow), `belly`, `head`, `beak`. Perched it looks around and bobs its head. It **flies**: `bend` 0..1 (set it on the prop or
 * animate it with `{ "prop": "pasare", "bend": 1, "duration": 3 }`) carries it along an arc from its perch to `fly` = [dx, dy, dz]
 * (local offset, default [12, 9, -22]; `arc` = extra height in the middle, 3), wings flapping while 0 < bend < 1, facing the
 * way it flies. `back: true` = it comes back: bend 1 = far away at `fly`, bend 0 = landed on the perch (animate 1 → 0).
 */
function bird(opts = {}) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const mBody = plastic(opts.color || 'darkGray'), mBelly = plastic(opts.belly || 'gray'), mHead = plastic(opts.head || opts.color || 'darkGray');
  const torso = sh(new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), mBody)); torso.scale.set(0.85, 0.8, 1.15); torso.position.y = 0.42; body.add(torso);
  const belly = sh(new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), mBelly)); belly.scale.set(0.95, 0.8, 1.05); belly.position.set(0, 0.33, 0.08); body.add(belly);
  const headG = new THREE.Group(); headG.position.set(0, 0.72, 0.26); body.add(headG);
  const head = sh(new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), mHead)); headG.add(head);
  const beak = sh(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.2, 8), plastic(opts.beak || 'darkTan'))); beak.rotation.x = Math.PI / 2; beak.position.set(0, -0.02, 0.26); headG.add(beak);
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), plastic('white')); w.position.set(sx * 0.12, 0.05, 0.13); headG.add(w);
    const pu = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), plastic('black')); pu.position.set(sx * 0.15, 0.06, 0.165); headG.add(pu);
  }
  const tail = sh(new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.42, 4), mBody)); tail.scale.set(1, 0.3, 1); tail.rotation.x = -Math.PI / 2 - 0.35; tail.position.set(0, 0.5, -0.45); body.add(tail);
  for (const sx of [-1, 1]) {
    const leg = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.18, 5), plastic('darkTan'))); leg.position.set(sx * 0.09, 0.09, 0.02); body.add(leg);
  }
  const wings = [-1, 1].map((sx) => {
    const piv = new THREE.Group(); piv.position.set(sx * 0.24, 0.5, 0.0); body.add(piv);
    const wg = sh(new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), mBody)); wg.scale.set(0.3, 0.2, 1.05); wg.position.set(sx * 0.03, 0, -0.05); piv.add(wg);
    piv.userData.sx = sx; return piv;
  });
  const fly = opts.fly || [12, 9, -22], arc = opts.arc ?? 3, back = !!opts.back;
  const sm = (x) => x * x * (3 - 2 * x);
  const pose = (k0, t) => {
    const k = Math.max(0, Math.min(1, k0)), u = sm(k);
    body.position.set(fly[0] * u, fly[1] * u + Math.sin(Math.PI * k) * arc, fly[2] * u);
    const flying = k > 0.005 && k < 0.995;
    // facing: towards the far point when flying away, towards the perch when coming back; on the perch: as placed
    const dir = Math.atan2(fly[0], fly[2]);
    body.rotation.y = k <= 0.005 ? 0 : back ? dir + Math.PI : dir;
    body.rotation.x = flying ? -0.2 : 0;
    wings.forEach((w) => { w.rotation.z = flying ? w.userData.sx * (0.35 + Math.sin(t * 22) * 0.9) : w.userData.sx * 0.05; });
    headG.rotation.y = flying ? 0 : Math.sin(t * 0.9) * 0.55;
    headG.position.y = 0.72 + (flying ? 0 : Math.max(0, Math.sin(t * 3.1)) * 0.04);
  };
  const base = opts.bend ?? (back ? 1 : 0);
  pose(base, 0);
  g.userData.update = (t, ctx) => pose(ctx?.bend ?? base, t);
  g.userData.ground = 0;
  g.userData.hold = [0, 0.1, 0.45];
  return g;
}

/**
 * Tavă (a round wooden tray) with round loaves and a small clay jug of wine — food brought as a gift, carried in front
 * with both hands (`userData.twoHands`, held in the right hand). `loaves` (3), `jug: false`, `color`. `bend` 0..1 = the
 * loaves are taken one by one (animate it while someone takes / shares the bread). Put it on a mat with `put` (`y` 0.1).
 */
function tray(opts = {}) {
  const g = new THREE.Group();
  const R = 0.95, wood = plastic(opts.color || 'reddishBrown');
  const plate = sh(new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.9, 0.14, 24), wood)); plate.position.y = 0.07; g.add(plate);
  const rim = sh(new THREE.Mesh(new THREE.TorusGeometry(R - 0.05, 0.07, 8, 28), plastic('brown'))); rim.rotation.x = Math.PI / 2; rim.position.y = 0.17; g.add(rim);
  const n = opts.loaves ?? 3;
  const spots = [[-0.42, 0.22], [0.0, 0.42], [-0.05, -0.12], [0.42, 0.3], [-0.45, -0.3]];
  const loaves = [];
  for (let i = 0; i < n; i++) {
    const l = bread({ fresh: true, steam: false, color: opts.loafColor || '#d6995a' });
    l.scale.setScalar(1.05); l.position.set(spots[i % 5][0], 0.14 + 0.4, spots[i % 5][1]); l.rotation.y = i * 1.3; g.add(l); loaves.push(l);
  }
  if (opts.jug !== false) { const j = jug({ color: 'darkOrange' }); j.scale.setScalar(0.62); j.position.set(0.38, 0.14 + 0.62 * 1.0, -0.28); delete j.userData.update; [...j.children].filter((c) => !c.visible).forEach((c) => j.remove(c)); g.add(j); }
  const base = opts.bend ?? 0;
  const pose = (k) => loaves.forEach((l, i) => { l.visible = Math.max(0, Math.min(1, k)) * n < n - i - 0.5; }); // the last loaf goes first
  pose(base);
  g.userData.update = (t, ctx) => pose(ctx?.bend ?? base);
  g.userData.ground = 0;
  g.userData.hold = [0.62, -0.05, 0.55]; g.userData.twoHands = true;
  return g;
}

// ---------- Avva Teodor și grâul cel bun ----------

let burlapTex = null;
/** Woven burlap (pânză de sac): a coarse checked weave, shared texture. */
function burlapMaterial(c = '#c9a874') {
  if (!burlapTex) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 64; i += 4) {
      x.fillStyle = 'rgba(90,60,20,0.28)'; x.fillRect(i, 0, 1.5, 64); x.fillRect(0, i + 2, 64, 1.5);
      x.fillStyle = 'rgba(255,240,200,0.25)'; x.fillRect(i + 2, 0, 1, 64);
    }
    burlapTex = new THREE.CanvasTexture(cv); burlapTex.colorSpace = THREE.SRGBColorSpace; burlapTex.wrapS = burlapTex.wrapT = THREE.RepeatWrapping; burlapTex.repeat.set(4, 3);
  }
  return new THREE.MeshStandardMaterial({ color: color(c), map: burlapTex, bumpMap: burlapTex, bumpScale: 3, roughness: 0.95, side: THREE.DoubleSide });
}

const GRAIN_FILLS = {
  wheat: { c: ['#e8b84a', '#d9a23a', '#f2cc6a'], s: [1, 0.7, 1.9] },      // good golden wheat
  poor: { c: ['#8f7a5a', '#7a6a50', '#a08c6a', '#6b5a45'], s: [0.8, 0.55, 1.5] }, // poor wheat: small, grey-brown, shrivelled
  lentils: { c: ['#8a6a3a', '#a07a44', '#6e5230'], s: [1.1, 0.5, 1.1] },
};
/** A heap of grains on a dome: n little ellipsoids on the surface of a flattened half sphere of radius R (+ the dome itself). */
function grainHeap(g, R, h, fill, seed = 3, n = 60) {
  const F = GRAIN_FILLS[fill] || { c: [fill], s: [1, 0.7, 1.9] };
  const dome = sh(new THREE.Mesh(new THREE.SphereGeometry(R, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2), plastic(F.c[0])));
  dome.scale.y = h / R; g.add(dome);
  const geo = new THREE.SphereGeometry(0.075, 8, 6), mats = F.c.map((c) => plastic(c)), r = rng(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.95, y = h * Math.sqrt(Math.max(0, 1 - (d / R) ** 2));
    const m = new THREE.Mesh(geo, mats[i % mats.length]); m.scale.set(...F.s); m.position.set(Math.cos(a) * d, y, Math.sin(a) * d); m.rotation.set(r() * 3, r() * 3, 0); g.add(m);
  }
  return dome;
}

/**
 * Sac (a burlap sack) standing open on the ground, the top rolled down, full to a heap: `fill` = "wheat" (golden grain, the
 * good wheat), "poor" (small grey-brown grains: the poor wheat), "lentils", "coins" (gold coins) or a colour; `color` of the
 * cloth; `height` (1.9). Origin = the ground under it. Carried in front with both hands (held in the right hand, `twoHands`;
 * `"scale": 0.7` when held). `bend` 0..1 = a little sack that is filled: the heap rises from the bottom (0 = empty, slack).
 */
function sack(opts = {}) {
  const g = new THREE.Group();
  const H = opts.height || 1.9, R = 0.78, cloth = burlapMaterial(opts.color || '#c9a874');
  const prof = [[0.01, 0], [R * 0.7, 0.01], [R * 0.95, 0.12], [R * 1.04, 0.4], [R * 1.08, H * 0.5], [R * 1.02, H * 0.78], [R * 0.93, H * 0.92], [R * 0.9, H]].map(([x, y]) => new THREE.Vector2(x, y));
  // a soft, lumpy sack: the lathe pushed in and out a little (deterministic), with shallow vertical creases
  const lg = new THREE.LatheGeometry(prof, 40), lp = lg.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const x = lp.getX(i), y = lp.getY(i), z = lp.getZ(i), a = Math.atan2(x, z), u = y / H;
    const k = 1 + 0.045 * Math.sin(a * 3 + u * 4) + 0.03 * Math.sin(a * 7 - u * 9) - 0.035 * Math.max(0, Math.sin(a * 11)) ** 8 * Math.sin(Math.PI * u);
    lp.setXYZ(i, x * k, y, z * k);
  }
  lg.computeVertexNormals();
  const body = sh(new THREE.Mesh(lg, cloth)); g.add(body);
  // a stitched seam up one side
  const st = plastic('#7a5a32');
  for (let y = 0.15; y < H - 0.25; y += 0.13) { const sti = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.02), st); sti.position.set(R * 1.05 * Math.sin(1.9) * (1 + 0.0), y, R * 1.05 * Math.cos(1.9)); sti.position.multiplyScalar(1); sti.position.y = y; sti.rotation.y = 1.9; sti.rotation.z = (y * 10 % 2) ? 0.5 : -0.5; g.add(sti); }
  // the top rolled down: a thick, wavy roll of cloth with soft folds hanging over it
  const rp = []; for (let i = 0; i <= 80; i++) { const a = i / 80 * Math.PI * 2; rp.push(new THREE.Vector3(Math.sin(a) * R * (0.97 + 0.03 * Math.sin(a * 5)), H - 0.08 + 0.05 * Math.sin(a * 6), Math.cos(a) * R * (0.97 + 0.03 * Math.sin(a * 5)))); }
  const roll = sh(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rp, true), 80, 0.15, 8, true), cloth)); roll.scale.set(1, 1, 1); g.add(roll);
  for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3; const f = sh(new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), cloth)); f.scale.set(1.5, 1.4, 0.55); f.position.set(Math.sin(a) * R * 1.02, H - 0.26, Math.cos(a) * R * 1.02); f.rotation.y = a; g.add(f); }
  const fill = opts.fill || 'wheat';
  const heap = new THREE.Group(); g.add(heap);
  if (fill === 'coins') {
    const cm = plastic('gold', { metal: true }), cm2 = plastic('yellow', { metal: true });
    const dome = sh(new THREE.Mesh(new THREE.SphereGeometry(R * 0.86, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), cm)); dome.scale.y = 0.42; heap.add(dome);
    const coin = new THREE.CylinderGeometry(0.15, 0.15, 0.045, 14), r = rng(7);
    for (let i = 0; i < 26; i++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.8; const c = sh(new THREE.Mesh(coin, i % 3 ? cm : cm2)); c.position.set(Math.cos(a) * d, 0.36 * Math.sqrt(Math.max(0, 1 - (d / (R * 0.86)) ** 2)) + 0.03, Math.sin(a) * d); c.rotation.set((r() - 0.5) * 0.9, 0, (r() - 0.5) * 0.9); heap.add(c); }
  } else grainHeap(heap, R * 0.9, 0.5, fill, opts.seed || 3, 150);
  const base = opts.bend ?? (opts.empty ? 0 : 1);
  const pose = (k) => { const kk = Math.max(0, Math.min(1, k)); heap.position.y = 0.2 + (H - 0.22) * kk; heap.visible = kk > 0.03; heap.scale.set(1, 0.4 + 0.6 * kk, 1); };
  pose(base);
  g.userData.update = (t, ctx) => pose(ctx?.bend ?? base);
  g.userData.ground = 0;
  g.userData.hold = [0.62, -1.15, 1.0]; g.userData.twoHands = true; // origin = hand + hold: the sack hangs below the hands, in front
  return g;
}

/**
 * Vas de lut (a round clay pot / jar for grain): terracotta with brick-like grooves, a short neck and a lip. Origin = the
 * rim (the grip — it hangs below the hand like the jug; on the ground it stands on its bottom). `bend` 0..1 = it is filled
 * with grain (`fill` "wheat" | "poor" | colour, default "poor"), the level rising to a heap above the rim at 1; `bend` 1..2 =
 * it **breaks** on the ground (put it down first, then `{ "prop": "vas", "bend": 2, "duration": 0.4 }`): the pot bursts into a
 * broken bottom half and shards, and the grain spills out in a heap on the ground. `color`, `size` (1).
 */
function grainJar(opts = {}) {
  const g = new THREE.Group();
  const s = opts.size || 1, HH = 1.3 * s;
  const cm = new THREE.MeshStandardMaterial({ color: color(opts.color || '#b8562e'), roughness: 0.55, side: THREE.DoubleSide });
  const dk = plastic('#8a3c1e');
  const P = [[0, 0], [0.42, 0], [0.6, 0.22], [0.66, 0.62], [0.55, 0.98], [0.38, 1.14], [0.36, 1.22], [0.44, 1.3]].map(([x, y]) => [x * s, y * s]);
  const radAt = (y) => { for (let i = 1; i < P.length; i++) if (y <= P[i][1]) { const [x0, y0] = P[i - 1], [x1, y1] = P[i]; return x0 + (x1 - x0) * (y - y0) / Math.max(1e-6, y1 - y0); } return P[P.length - 1][0]; };
  const whole = new THREE.Group(); whole.position.y = -HH; g.add(whole);
  whole.add(sh(new THREE.Mesh(new THREE.LatheGeometry(P.map(([x, y]) => new THREE.Vector2(x, y)), 24), cm)));
  brickCourses(whole, P, { y0: 0.06 * s, y1: 1.08 * s, n: 6, joints: 10, color: '#7a3418' }); // built of curved terracotta bricks
  const lip = sh(new THREE.Mesh(new THREE.TorusGeometry(0.42 * s, 0.05 * s, 8, 24), cm)); lip.rotation.x = Math.PI / 2; lip.position.y = HH; whole.add(lip);
  const fill = opts.fill || 'poor', F = GRAIN_FILLS[fill] || { c: [fill] };
  // grain inside: a disc that rises with the level + a heap above the rim when full
  const surf = new THREE.Mesh(new THREE.CircleGeometry(1, 22), plastic(F.c[0])); surf.rotation.x = -Math.PI / 2; whole.add(surf);
  const top = new THREE.Group(); top.position.y = HH - 0.02; whole.add(top); grainHeap(top, 0.4 * s, 0.22 * s, fill, 5, 26);
  // broken: the bottom half with a jagged top, five curved shards, the spilled grain
  const broken = new THREE.Group(); broken.position.y = -HH; g.add(broken);
  const bottomP = P.filter(([, y]) => y < 0.62 * s).concat([[radAt(0.62 * s), 0.62 * s]]);
  const half = sh(new THREE.Mesh(new THREE.LatheGeometry(bottomP.map(([x, y]) => new THREE.Vector2(x, y)), 24, 0.6, Math.PI * 2 - 1.3), cm));
  const halfG = new THREE.Group(); halfG.add(half); broken.add(halfG);
  for (let i = 0; i < 5; i++) { // jagged teeth on the broken edge
    const tth = sh(new THREE.Mesh(new THREE.ConeGeometry(0.12 * s, 0.28 * s, 3), cm)); const a = 0.9 + i * 0.95;
    tth.position.set(Math.sin(a) * radAt(0.62 * s), 0.7 * s, Math.cos(a) * radAt(0.62 * s)); halfG.add(tth);
  }
  // shards: thick curved chunks of the wall (an annulus sector extruded upwards, with its brick groove), turning about their own middle
  const shardSpots = [[1.1, 0.9, 2.1], [-0.9, 1.2, 0.5], [0.3, 1.5, 4.1], [1.5, -0.3, 1.2], [-1.3, -0.4, 3.3], [0.6, -1.2, 5.2]];
  const grooveM = plastic('#7a3418');
  const shards = shardSpots.map(([x, z, rot], i) => {
    const len = 0.6 + (i % 3) * 0.22, ri = 0.54 * s, ro = 0.66 * s, hh = (0.32 + (i % 2) * 0.14) * s;
    const sp = new THREE.Shape(); sp.absarc(0, 0, ro, 0, len, false); sp.absarc(0, 0, ri, len, 0, true);
    const geo = new THREE.ExtrudeGeometry(sp, { depth: hh, bevelEnabled: false, curveSegments: 8 });
    geo.rotateX(-Math.PI / 2); // the arc lies flat in xz, the height goes up
    const mid = len / 2, rm = (ri + ro) / 2; geo.translate(-Math.cos(mid) * rm, -hh / 2, Math.sin(mid) * rm);
    const m = new THREE.Group(); const mesh = sh(new THREE.Mesh(geo, cm)); m.add(mesh);
    const gr = new THREE.Mesh(new THREE.TorusGeometry(rm + 0.065 * s, 0.018, 4, 10, len), grooveM); gr.rotation.x = -Math.PI / 2; gr.position.set(-Math.cos(mid) * rm, 0.02, Math.sin(mid) * rm); m.add(gr);
    broken.add(m); m.userData.to = [x * s, z * s, rot]; m.userData.h = hh; return m;
  });
  // little square brick bits
  const bits = [[0.9, 1.6], [-1.6, 0.6], [1.8, 0.4], [-0.5, -1.4], [0.2, 2.0]].map(([x, z], i) => { const b0 = sh(new THREE.Mesh(new THREE.BoxGeometry(0.2 * s, 0.14 * s, 0.16 * s), cm)); b0.userData.to = [x * s, z * s]; b0.rotation.y = i; broken.add(b0); return b0; });
  const spill = new THREE.Group(); broken.add(spill); grainHeap(spill, 0.9 * s, 0.26 * s, fill, 9, 150);
  const loose = new THREE.Group(); broken.add(loose); { const F2 = GRAIN_FILLS[fill] || { c: [fill], s: [1, 0.7, 1.9] }; const lg = new THREE.SphereGeometry(0.075, 6, 5), r2 = rng(13); for (let i = 0; i < 40; i++) { const a = r2() * Math.PI * 2, d = 0.9 * s + r2() * 0.45 * s; const m = new THREE.Mesh(lg, plastic(F2.c[i % F2.c.length])); m.scale.set(...(F2.s || [1, 0.7, 1.9])); m.position.set(Math.cos(a) * d, 0.04, Math.sin(a) * d); m.rotation.y = r2() * 3; loose.add(m); } }
  const pose = (k) => {
    const kf = Math.max(0, Math.min(1, k)), kb = Math.max(0, Math.min(1, k - 1));
    const isBroken = kb > 0.12;
    whole.visible = !isBroken; broken.visible = isBroken; broken.scale.setScalar(isBroken ? 1 : 1e-3);
    const lvl = 0.12 * s + kf * (HH - 0.2 * s);
    surf.visible = kf > 0.02; surf.position.y = lvl; surf.scale.setScalar(Math.max(0.05, radAt(lvl) - 0.03));
    top.visible = kf > 0.92;
    const u = isBroken ? Math.min(1, (kb - 0.12) / 0.6) : 0, e = 1 - (1 - u) ** 2;
    halfG.rotation.z = 0.5 * e; halfG.position.set(-0.25 * s * e, 0.34 * s * e, 0); // tipped over, its rim stays above the ground
    shards.forEach((m, i) => { const [x, z, rot] = m.userData.to; const lie = i % 2 ? 0 : 0.45; m.position.set(x * e, m.userData.h / 2 + 0.05 + Math.sin(Math.PI * u) * 0.5 * s, z * e); m.rotation.set(lie * e, rot * e, 0); });
    bits.forEach((b0) => { const [x, z] = b0.userData.to; b0.position.set(x * e, 0.07 * s + Math.sin(Math.PI * u) * 0.3 * s, z * e); });
    loose.scale.setScalar(Math.max(0.01, e)); loose.visible = e > 0.3;
    spill.position.set(0.35 * s * e, 0, 0.2 * s * e); spill.scale.set(0.3 + 0.7 * e, 0.3 + 0.7 * e, 0.3 + 0.7 * e);
  };
  pose(opts.bend ?? 0);
  g.userData.update = (t, ctx) => pose(ctx?.bend ?? opts.bend ?? 0);
  g.userData.ground = HH;
  g.userData.hold = [0, 0.3, 0.3];
  return g;
}

/** Sul de pergament (a scroll): a rolled parchment tied with a cord, one end a little unrolled. Lies on its side; held in the hand. `color`. */
function scroll(opts = {}) {
  const g = new THREE.Group();
  const pc = document.createElement('canvas'); pc.width = 64; pc.height = 64; const px = pc.getContext('2d');
  px.fillStyle = opts.color || '#ecd9a8'; px.fillRect(0, 0, 64, 64); px.fillStyle = 'rgba(150,110,60,0.18)'; for (let i = 0; i < 40; i++) px.fillRect((i * 37) % 64, (i * 23) % 64, 6, 3);
  px.fillStyle = 'rgba(80,50,30,0.55)'; for (let y = 10; y < 60; y += 7) px.fillRect(8, y, 30 + (y * 7) % 18, 2);
  const ptex = new THREE.CanvasTexture(pc); ptex.colorSpace = THREE.SRGBColorSpace;
  const pm = new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.7 });
  const roll = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.9, 16), pm)); roll.rotation.z = Math.PI / 2; roll.position.y = 0.17; g.add(roll);
  for (const x of [-0.47, 0.47]) { const end = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 6, 14), plastic('#d8c08a')); end.rotation.y = Math.PI / 2; end.position.set(x, 0.17, 0); g.add(end); }
  // the wooden rod through the roll, with turned knobs at both ends
  const rod = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8), plastic('reddishBrown'))); rod.rotation.z = Math.PI / 2; rod.position.y = 0.17; g.add(rod);
  for (const x of [-0.62, 0.62]) { const kn = sh(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), plastic('brown'))); kn.scale.set(1.3, 1, 1); kn.position.set(x, 0.17, 0); g.add(kn); }
  const flap = sh(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.025, 0.42), pm)); flap.position.set(0, 0.015, 0.26); g.add(flap);
  const cord = sh(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 6, 16), plastic('reddishBrown'))); cord.rotation.y = Math.PI / 2; cord.position.y = 0.17; g.add(cord);
  g.userData.ground = 0; g.userData.hold = [0, 0.05, 0.35];
  return g;
}

/** Masă de scris (a low wooden writing table) of brick plates on four legs, with a clay ink pot and a quill on top. Top at 1.6. `color`, `ink: false`. */
function desk(opts = {}) {
  const b = new Builder(), w = opts.color || 'reddishBrown';
  for (const [x, z] of [[-1.5, -0.9], [1, -0.9], [-1.5, 0.4], [1, 0.4]]) b.brick(x, 0, z, 0.5, 0.5, 3, w, { studs: false });
  b.plate(-1.75, 1.2, -1.1, 3.5, 2.2, w, { studs: false }); b.brick(-0.98, 0.7, -0.82, 1.96, 0.3, 1, 'brown', { studs: false }); // a stretcher between the back legs (no shared faces)
  for (const x of [-1.25, -0.25, 0.75]) for (const z of [-0.6]) b._stud(w, x + 0.25, 1.6, z); // a row of studs along the back of the top
  const g = b.build();
  for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.12, 12), plastic(w)); st.position.set(-1.0 + i * 0.6, 1.66, 0.55); g.add(st); }
  if (opts.ink !== false) {
    const pot = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.34, 12), plastic('darkBrown'))); pot.position.set(1.05, 1.77, -0.45); g.add(pot);
    const lip = sh(new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.04, 6, 14), plastic('darkBrown'))); lip.rotation.x = Math.PI / 2; lip.position.set(1.05, 1.95, -0.45); g.add(lip);
    const ink = new THREE.Mesh(new THREE.CircleGeometry(0.11, 12), plastic('black')); ink.rotation.x = -Math.PI / 2; ink.position.set(1.05, 1.93, -0.45); g.add(ink);
    // a feather quill: a thin shaft with a soft vane (a leaf shape) on both sides, standing in the ink pot, leaning back
    const qg = new THREE.Group(); qg.position.set(1.05, 1.85, -0.45); qg.rotation.set(-0.15, 0.4, -0.38); g.add(qg);
    const shaft = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.012, 1.25, 5), plastic('lightNougat'))); shaft.position.y = 0.6; qg.add(shaft);
    const vs = new THREE.Shape(); vs.moveTo(0, 0); vs.quadraticCurveTo(0.2, 0.35, 0.05, 0.9); vs.lineTo(0, 0.95); vs.lineTo(-0.02, 0.9); vs.quadraticCurveTo(-0.08, 0.4, 0, 0);
    const vane = sh(new THREE.Mesh(new THREE.ShapeGeometry(vs, 10), new THREE.MeshStandardMaterial({ color: 0xf6f0e2, roughness: 0.8, side: THREE.DoubleSide }))); vane.position.y = 0.32; qg.add(vane);
    for (let i = 0; i < 6; i++) { const nt = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.008, 0.01), plastic('#d8cbb0')); nt.position.set(0.05, 0.45 + i * 0.12, 0.002); nt.rotation.z = 0.5; qg.add(nt); }
  }
  g.userData.ground = 0; g.userData.seat = 1.6;
  return g;
}

/** Făclie (a standing torch on a wooden post): a little iron bowl with a flickering flame and a warm light. `height` (3.2), `light` (3), `fire: false`. */
function torch(opts = {}) {
  const g = new THREE.Group(), H = opts.height || 3.2;
  const post = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, H - 0.2, 8), plastic('darkBrown'))); post.position.y = 0.2 + (H - 0.2) / 2; g.add(post);
  const foot = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.2, 10), plastic('darkBrown'))); foot.position.y = 0.1; g.add(foot);
  const bowl = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.18, 0.32, 10), plastic('darkGray'))); bowl.position.y = H + 0.12; g.add(bowl);
  if (opts.fire !== false) {
    const prof = [[0, 0], [0.18, 0.08], [0.24, 0.26], [0.18, 0.5], [0.08, 0.72], [0, 0.85]].map(([x, y]) => new THREE.Vector2(x, y));
    const fo = new THREE.Mesh(new THREE.LatheGeometry(prof, 14), new THREE.MeshBasicMaterial({ color: 0xff8a20, toneMapped: false, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending }));
    const fi = new THREE.Mesh(new THREE.LatheGeometry(prof, 14), new THREE.MeshBasicMaterial({ color: 0xfff1b0, toneMapped: false }));
    fo.position.y = H + 0.26; fi.position.y = H + 0.28; fi.scale.set(0.6, 0.7, 0.6); g.add(fo, fi);
    const L = new THREE.PointLight(0xffa850, opts.light ?? 3, 10, 1.6); L.position.y = H + 0.9; g.add(L);
    g.userData.update = (t) => { const k = 1 + 0.08 * Math.sin(t * 13) + 0.05 * Math.sin(t * 7.3); fo.scale.set(1.15, 1.15 * k, 1.15); fi.scale.set(0.6, 0.7 * k, 0.6); };
  }
  g.userData.ground = 0;
  return g;
}

/** Pat de lemn (a plain wooden bed of a monk's cell): a plank frame on short legs, a cream straw mattress and a pillow. Length along z (5). `color`. */
function bed(opts = {}) {
  const b = new Builder(), w = opts.color || 'reddishBrown', L = opts.length || 5;
  for (const [x, z] of [[-1.25, -L / 2], [0.75, -L / 2], [-1.25, L / 2 - 0.5], [0.75, L / 2 - 0.5]]) b.brick(x, 0, z, 0.5, 0.5, 2, w, { studs: false });
  b.brick(-1.25, 0.8, -L / 2, 2.5, L, 1, w, { studs: false });
  b.brick(-1.3, 0, -L / 2 - 0.45, 2.6, 0.4, 5, w, { studs: false }); // headboard, behind the frame (no shared faces)
  const g = b.build();
  const mat = sh(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, L - 0.7), plastic('cream'))); mat.position.set(0, 1.42, 0.2); g.add(mat);
  const pil = sh(new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 8), plastic('lightNougat'))); pil.scale.set(1.6, 0.45, 0.8); pil.position.set(0, 1.75, -L / 2 + 0.7); g.add(pil);
  g.userData.ground = 0;
  return g;
}

/** Butoi (a small wooden barrel of staves with two iron hoops and a lid). Origin = the ground. `color`, `size` (1). */
function barrel(opts = {}) {
  const g = new THREE.Group(), s = opts.size || 1;
  const P = [[0.5, 0], [0.6, 0.35], [0.64, 0.7], [0.6, 1.05], [0.5, 1.4]].map(([x, y]) => new THREE.Vector2(x * s, y * s));
  const c = document.createElement('canvas'); c.width = 128; c.height = 16; const x = c.getContext('2d');
  x.fillStyle = '#9a6234'; x.fillRect(0, 0, 128, 16); for (let i = 0; i < 128; i += 10) { x.fillStyle = i % 20 ? '#8a5428' : '#a86c3a'; x.fillRect(i, 0, 9, 16); x.fillStyle = '#4a2a14'; x.fillRect(i + 9, 0, 1, 16); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  g.add(sh(new THREE.Mesh(new THREE.LatheGeometry(P, 28), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }))));
  for (const y of [0.25, 1.15]) { const h = sh(new THREE.Mesh(new THREE.TorusGeometry(radiusAt(P.map((v) => [v.x, v.y]), y * s) + 0.01, 0.035 * s, 6, 28), plastic('darkGray'))); h.rotation.x = Math.PI / 2; h.position.y = y * s; g.add(h); }
  const lid = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.47 * s, 0.47 * s, 0.06, 24), plastic(opts.color || '#8a5428'))); lid.position.y = 1.37 * s; g.add(lid);
  g.userData.ground = 0;
  return g;
}

export const PROPS = { ...LANDMARKS, barrel, sack, grainJar, scroll, desk, torch, bed, tray, bird, coins, sapling, fruit, lantern, tree, sandTrail, net, breadJar, firewood, brick, knife, palmLeaves, grains, camel, jail, pot, bowl, icon, cloak, sickle, sheaf, pouch, grapes, staff, jug, basket, bread, cojoc, rock, mat, stool, candle, book, prayerRope, cross };

/** The resting `bend` of a prop when the descriptor gives none — where a `{ "prop", "bend" }` animation starts from.
 *  Must match the `base` of the builder: a sack is full (1: `bend 0.7` EMPTIES it a little), a bird with `back` is far
 *  away (1); every other prop rests at 0. Pure (used by the stage and the tests). */
export function bendRest(type, opts = {}) {
  if (opts.bend != null) return +opts.bend;
  if (type === 'sack') return opts.empty ? 0 : 1;
  if (type === 'bird') return opts.back ? 1 : 0;
  return 0;
}

export function createProp(type, opts = {}) {
  const fn = PROPS[type];
  if (!fn) throw new Error(`Unknown prop "${type}". Known: ${Object.keys(PROPS).join(', ')}`);
  const g = fn(opts);
  g.name = `prop:${type}`;
  if (opts.scale) g.scale.setScalar(opts.scale);
  return g;
}
void color;
