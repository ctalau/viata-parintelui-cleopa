// The soft dough on a `dough-trough` (film 051): while its variant shows a lump of dough (`shaggy`, `dough`, and the
// second batch's `shaggy6`, `dough6`), the baked dough mesh is replaced by a runtime mesh that the kneader's hands really
// shape. PURE function of t (rule 3): the mesh is rebuilt every frame from
//   1. a shape scripted on the `knead2` clip's local time (rough lump → flattened → pushed flat → round „pernuță”),
//   2. the dough's two ends following the hands while they hold them (the clip's `grab` … `release`: it lifts and sags),
//   3. the palms and fingers of every hand near it pushing its surface away — a hand never sinks in, it dents the dough.
// No `knead2` in the scene: the baked lumps (unchanged).
import * as THREE from 'three';
import { clamp01, smooth } from '../engine/timeline.js';
import { warp } from './anim.js';

const LUMP = new Set(['shaggy', 'dough', 'shaggy6', 'dough6']);
const SEG_U = 64, SEG_V = 40;
const BOARD_Y = 0.07, CX = -0.55;            // board top and the dough's centre along the board (prop space)
// shape keys on the knead2 clip time: [t, rx (half length), H (height above the board), rz (half depth), rough]
const KEYS = [
  [0, 0.56, 0.38, 0.30, 1.0], [0.9, 0.60, 0.33, 0.32, 0.8], [1.25, 0.62, 0.31, 0.33, 0.72], [1.55, 0.66, 0.28, 0.35, 0.6],
  [2.2, 0.68, 0.27, 0.36, 0.5], [3.6, 0.68, 0.27, 0.36, 0.4], [4.25, 0.69, 0.26, 0.37, 0.28], [4.85, 0.70, 0.25, 0.37, 0.16],
  [5.4, 0.70, 0.25, 0.37, 0.06], [5.75, 0.68, 0.26, 0.36, 0.03], [6.1, 0.59, 0.33, 0.345, 0], [6.4, 0.55, 0.40, 0.33, 0],
  [7.0, 0.54, 0.41, 0.33, 0],
];
const shapeAt = (ct) => {
  if (ct <= KEYS[0][0]) return KEYS[0].slice(1);
  for (let i = 1; i < KEYS.length; i++) {
    const a = KEYS[i - 1], b = KEYS[i];
    if (ct <= b[0]) { const k = smooth((ct - a[0]) / (b[0] - a[0])); return a.slice(1).map((x, j) => x + (b[j + 1] - x) * k); }
  }
  return KEYS[KEYS.length - 1].slice(1);
};

// deterministic smooth noise on the unit sphere (sum of a few fixed sines): lumps of the rough dough
const LUMPS = Array.from({ length: 9 }, (_, i) => {
  const a = i * 2.39996, z = 1 - (2 * i + 1) / 9, r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), z, r * Math.sin(a), 0.55 + 0.45 * ((i * 7) % 5) / 4];
});
function rough(nx, ny, nz) {
  let s = 0;
  for (const [x, y, z, w] of LUMPS) { const d = nx * x + ny * y + nz * z; s += w * Math.max(0, d) ** 6; }
  return s * 0.9 + 0.12 * Math.sin(9 * nx + 3) * Math.sin(8 * nz + 1) * Math.sin(7 * ny + 2);
}
const fine = (nx, ny, nz) => 0.5 * Math.sin(17 * nx + 1.3) * Math.sin(15 * nz + 0.7) + 0.5 * Math.sin(13 * ny + 11 * nx);

export class Dough {
  constructor(P) {
    this.P = P;
    const geo = new THREE.SphereGeometry(1, SEG_U, SEG_V);
    this.unit = geo.attributes.position.array.slice();
    this.geo = geo;
    let mat = null;
    const hide = [];
    P.obj.traverse((o) => { if (o.isMesh && /dough$/.test(o.name) && LUMP.has(o.parent?.name)) { hide.push(o); mat ||= o.material; } });
    this.baked = hide;
    const m = (mat || new THREE.MeshStandardMaterial({ roughness: 0.6 })).clone();
    if (mat?.vertexColors) {
      // the baked dough's colour (its vertex colours, linear), as a plain colour
      const col = hide[0].geometry.attributes.color; let r = 0, g = 0, b = 0;
      if (col) { for (let i = 0; i < col.count; i++) { r += col.getX(i); g += col.getY(i); b += col.getZ(i); } m.color.setRGB(r / col.count, g / col.count, b / col.count); }
      m.vertexColors = false;
    } else if (!mat) m.color.setRGB(0.93, 0.84, 0.62);
    this.mesh = new THREE.Mesh(geo, m);
    this.mesh.name = 'dough:runtime';
    this.mesh.castShadow = this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    P.obj.add(this.mesh);
  }

  /** the knead2 clip time of the kneading that shapes this dough at t (null: nobody kneads it in this scene) */
  static clipTime(stage, B, P, t) {
    const C = stage.A.char?.clips?.knead2; if (!C) return null;
    const pp = P.obj.getWorldPosition(new THREE.Vector3());
    let best = null;
    for (const A of Object.values(B.actors)) {
      for (const g of A.data.gestures) {
        if ((g.clip || g.name) !== 'knead2') continue;
        const p = A.char.root.position;
        if (Math.hypot(p.x - pp.x, p.z - pp.z) > 3) continue;
        const ct = t < g.t0 ? 0 : warp(C, Math.min(t - g.t0, g.t1 - g.t0), g.t1 - g.t0) + (t > g.t1 ? 7 : 0);
        if (!best || (t >= g.t0 && g.t0 >= best.t0) || (best.t0 > t && g.t0 < best.t0)) best = { t0: g.t0, ct: Math.min(ct, C.duration), A, C };
      }
    }
    return best;
  }

  update(stage, B, t, variant) {
    const P = this.P;
    const K = Dough.clipTime(stage, B, P, t);
    // only where someone kneads it with `knead2`: elsewhere the baked lumps stay as they were
    const on = !!K && LUMP.has(variant) && P.obj.visible;
    this.mesh.visible = on;
    for (const o of this.baked) o.visible = !on;
    if (!on) return;
    const ct = K.ct;
    const [rx, H, rz, rgh] = shapeAt(ct);
    // the hands near the dough, in prop space: palm centre, fingertips, palm normal (out of the palm), held or not
    P.obj.updateMatrixWorld(true);
    const inv = P.obj.matrixWorld.clone().invert();
    const hands = [];
    const ev = K?.C.meta?.events || {};
    const g0 = ev.grab ?? 2.35, g1 = ev.release ?? 3.5;
    const grabW = K ? smooth(clamp01((K.ct - (g0 - 0.12)) / 0.12)) * smooth(clamp01((g1 + 0.12 - K.ct) / 0.12)) : 0;
    for (const A of Object.values(B.actors)) {
      if (!A.char.root.visible) continue;
      for (const s of ['L', 'R']) {
        const so = A.char.sockets[`hand.${s}`], ft = A.char.sockets[`fingertips.${s}`]; if (!so || !ft) continue;
        so.updateWorldMatrix(true, false); ft.updateWorldMatrix(true, false);
        const q = so.getWorldQuaternion(new THREE.Quaternion());
        const n = new THREE.Vector3(0, 0, 1).applyQuaternion(q).transformDirection(inv); // the way the palm faces
        const c = so.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).addScaledVector(n, -0.045);
        const tip = ft.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
        if (c.distanceTo(new THREE.Vector3(CX, 0.25, 0)) > 1.6) continue;
        hands.push({ c, tip, n, grab: K && A === K.A ? grabW : 0 });
      }
    }
    const pos = this.geo.attributes.position, U = this.unit, a = pos.array;
    const v = new THREE.Vector3(), d = new THREE.Vector3(), seg = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const nx = U[3 * i], ny = U[3 * i + 1], nz = U[3 * i + 2];
      // a dome on the board: the top half an ellipsoid of height 0.78 H, the lower half a rounded rim of 0.22 H
      const h = ny >= 0 ? 0.22 * H + 0.78 * H * ny : 0.22 * H * (1 + ny) ** 0.7;
      const rad = ny >= 0 ? Math.sqrt(Math.max(0, 1 - ny * ny)) : 0.86 + 0.14 * Math.sqrt(Math.max(0, 1 - ny * ny));
      const bump = 1 + rgh * 0.22 * rough(nx, ny, nz) + 0.012 * fine(nx, ny, nz);
      const k = ny < -0.6 ? 1 : bump, hl = Math.hypot(nx, nz), hx = hl > 1e-6 ? nx / hl : 0, hz = hl > 1e-6 ? nz / hl : 0;
      v.set(CX + rx * rad * hx * k, BOARD_Y - 0.01 + h * (ny > 0 ? k : 1), rz * rad * hz * k);
      // held by its ends: each end follows the hand that holds it (the middle stays: it sags)
      for (const hd of hands) {
        if (hd.grab <= 0) continue;
        const side = Math.sign(hd.c.x - CX), end = new THREE.Vector3(CX + side * rx, BOARD_Y + 0.4 * H, 0);
        const along = clamp01((side * (v.x - CX)) / rx);
        const w = hd.grab * (0.22 + 0.78 * smooth(clamp01((along - 0.05) / 0.85)) ** 1.3); // the middle rises a little too: a soft sag
        d.copy(hd.c).addScaledVector(hd.n, -0.03).sub(end);
        v.addScaledVector(d, w);
      }
      // palms / fingers push the surface away: a point behind the hand's surface (inside the hand) goes back onto it
      for (const hd of hands) {
        seg.subVectors(hd.tip, hd.c);
        const L2 = seg.lengthSq();
        d.subVectors(v, hd.c);
        const u = clamp01(d.dot(seg) / Math.max(1e-6, L2));
        const q = hd.c.clone().addScaledVector(seg, u);
        const off = v.clone().sub(q), depth = -off.dot(hd.n);             // > 0: behind the palm surface
        const lat = off.addScaledVector(hd.n, depth).length();             // distance across the hand
        const R = u < 0.35 ? 0.13 : 0.11 - 0.03 * u;
        if (depth <= 0 || depth > 0.45) continue;
        const wl = 1 - smooth(clamp01((lat - R) / 0.09));
        if (wl > 0) v.addScaledVector(hd.n, depth * wl);
      }
      a[3 * i] = v.x; a[3 * i + 1] = Math.max(BOARD_Y - 0.01, v.y); a[3 * i + 2] = v.z;
    }
    pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
  }
}
