// Palmele 2.5D (abordarea C): un proxy 3D al mâinii, proiectat și desenat plat.
// Port al experiments/cleopa-painea/scripts/palme25d.py (hand_local, solve, project_rig,
// build_volume, stable_order, capsule_ring, grow) și al nivelurilor din palme25d_bake.py.
// Paritatea cu Python: tests/engine-palm25d.test.mjs.
import { armPoints, POLE, sideSign, twoBone } from './arm25d.js';

const DEG = Math.PI / 180;
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = length(a); return l > 1e-12 ? mul(a, 1 / l) : [0, 0, 0]; };
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add2 = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul2 = (a, s) => [a[0] * s, a[1] * s];
const len2 = (a) => Math.hypot(a[0], a[1]);
const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];
const flip = (v) => (v.length === 3 ? [-v[0], v[1], v[2]] : [-v[0], v[1]]);

function rotate(v, k, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

function quatFromBasis(x, y, z) {
  const [m00, m10, m20] = x, [m01, m11, m21] = y, [m02, m12, m22] = z;
  const tr = m00 + m11 + m22;
  let w, qx, qy, qz;
  if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; w = 0.25 * s; qx = (m21 - m12) / s; qy = (m02 - m20) / s; qz = (m10 - m01) / s; }
  else if (m00 > m11 && m00 > m22) { const s = Math.sqrt(1 + m00 - m11 - m22) * 2; w = (m21 - m12) / s; qx = 0.25 * s; qy = (m01 + m10) / s; qz = (m02 + m20) / s; }
  else if (m11 > m22) { const s = Math.sqrt(1 + m11 - m00 - m22) * 2; w = (m02 - m20) / s; qx = (m01 + m10) / s; qy = 0.25 * s; qz = (m12 + m21) / s; }
  else { const s = Math.sqrt(1 + m22 - m00 - m11) * 2; w = (m10 - m01) / s; qx = (m02 + m20) / s; qy = (m12 + m21) / s; qz = 0.25 * s; }
  return [w, qx, qy, qz];
}

export function quatRotate([w, x, y, z], v) {
  const u = [x, y, z];
  const t = mul(cross(u, v), 2);
  return add(add(v, mul(t, w)), cross(u, t));
}

export function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let bb = b;
  if (d < 0) { d = -d; bb = b.map((v) => -v); }
  if (d > 0.9995) { const r = a.map((v, i) => lerp(v, bb[i], t)); const l = Math.hypot(...r); return r.map((v) => v / l); }
  const th = Math.acos(d), s = Math.sin(th);
  return a.map((v, i) => (Math.sin((1 - t) * th) * v + Math.sin(t * th) * bb[i]) / s);
}

function handQuat(direction, palm) {
  const y = norm(direction);
  const n = norm(sub(palm, mul(y, dot(palm, y))));
  const z = mul(n, -1);
  return quatFromBasis(cross(y, z), y, z);
}

// --- Mâna (Hand din palme25d.py, în cm, scalată pe personaj) ------------------
const HAND = {
  palm: [[2.1, 0.9, 0, 1.55], [-2.0, 0.9, 0, 1.5], [2.6, 7.4, 0, 1.25], [0.9, 8.0, 0, 1.25], [-0.9, 7.8, 0, 1.2], [-2.5, 7.1, 0, 1.1], [0.1, 4.0, 0, 1.75]],
  fingers: [
    { id: 'aratator', base: [2.6, 7.6, 0], len: [3.0, 2.0, 1.7], r: 0.93, spread: 11 },
    { id: 'mijlociu', base: [0.9, 8.2, 0], len: [3.3, 2.2, 1.8], r: 0.96, spread: 3 },
    { id: 'inelar', base: [-0.9, 8.0, 0], len: [3.1, 2.1, 1.7], r: 0.91, spread: -6 },
    { id: 'mic', base: [-2.5, 7.2, 0], len: [2.4, 1.6, 1.4], r: 0.8, spread: -15 },
  ],
  thumb: { id: 'mare', base: [2.3, 1.7, -0.4], len: [3.0, 2.4, 2.0], r: 1.05 },
  taper: [1, 0.93, 0.86],
};
export const HAND_PER_CM = 0.0655 / 1.3;
export const FINGER_THICKNESS = 1.6;
export const handOf = (p) => ({ scale: 1.3 * HAND_PER_CM * p.hand, thickness: FINGER_THICKNESS });

export const GESTURES = {
  deschis: { curl: [-0.05, -0.05, -0.05, -0.05], spread: 0.8, opp: 0, tcurl: 0, pinch: 0 },
  relaxat: { curl: [0.22, 0.28, 0.34, 0.42], spread: 0.2, opp: 0.35, tcurl: 0.25, pinch: 0 },
  pumn: { curl: [1, 1, 1, 1], spread: 0, opp: 0.85, tcurl: 0.8, pinch: 0 },
  aratator: { curl: [0, 1, 1, 1], spread: 0.1, opp: 0.8, tcurl: 0.7, pinch: 0 },
  treiDegete: { curl: [0.5, 0.46, 1, 1], spread: -0.3, opp: 1, tcurl: 0.4, pinch: 1 },
  cupa: { curl: [0.55, 0.6, 0.62, 0.66], spread: 0.2, opp: 0.6, tcurl: 0.3, pinch: 0 },
  ofera: { curl: [0.02, 0.045, 0.075, 0.11], spread: 0.38, opp: 0.18, tcurl: 0.10, pinch: 0 },
  intinde: { curl: [0.03, 0.10, 0.18, 0.28], spread: 0.38, opp: 0.28, tcurl: 0.16, pinch: 0 },
  apuca: { curl: [0.18, 0.26, 0.36, 0.46], spread: 0.18, opp: 0.7, tcurl: 0.42, pinch: 0 },
  tine: { curl: [0.2, 0.24, 0.28, 0.34], spread: 0.12, opp: 0.5, tcurl: 0.2, pinch: 0 },
};
// `cross`: trei degete împreunate pentru semnul crucii (gest al motorului, fără desen A).
export const POSE_GESTURE = { rest: 'relaxat', open: 'deschis', cup: 'cupa', grip: 'tine', reach: 'deschis', point: 'aratator', prayer: 'deschis', touch: 'tine', present: 'ofera', extend: 'intinde', gather: 'apuca', stop: 'deschis', cheek: 'cupa', cross: 'treiDegete' };

export function mixGesture(a, b, t) {
  return { curl: a.curl.map((v, i) => lerp(v, b.curl[i], t)), spread: lerp(a.spread, b.spread, t), opp: lerp(a.opp, b.opp, t),
    tcurl: lerp(a.tcurl, b.tcurl, t), pinch: lerp(a.pinch, b.pinch, t) };
}

export function defaultPalm(pose, side) {
  const inward = [-sideSign(side), 0, 0];
  return {
    rest: inward,
    open: [0, 1, 0.35],
    cup: norm(add([0, 1, 0], mul(inward, 0.5))),
    grip: norm([0, 0.3, -1]),
    cheek: norm(add([0, 0, -0.65], mul(inward, 0.75))),
    reach: norm([0, -0.75, -0.66]),
    prayer: inward,
    touch: norm([0, 0.16, -1]),
    present: norm([0, 1, 0.72]),
    extend: norm([0, -0.72, -0.69]),
    gather: norm([0, -0.85, -0.52]),
    point: norm([0, -0.3, -0.95]),
    stop: [0, 0, 1],
    cross: norm([0.3, 0.2, -1]),
  }[pose];
}

/** Cuaternionul palmei în spațiul proxy-ului (mâna dreaptă e oglinda proxy-ului stâng). */
export function orientation(direction, palm, side) {
  let d3 = norm([direction[0], direction[1], direction[2] ?? 0]);
  let p = norm(palm);
  if (length(sub(p, mul(d3, dot(p, d3)))) < 0.35) p = norm(add(p, [0, 0, 0.6]));
  if (side === 'R') { d3 = flip(d3); p = flip(p); }
  return handQuat(d3, p);
}

function handLocal(g, hand) {
  const digits = [];
  HAND.fingers.forEach((finger, i) => {
    const a = finger.spread * (0.4 + g.spread) * DEG;
    const dir0 = [Math.sin(a), Math.cos(a), 0];
    const side = norm(cross(dir0, [0, 0, -1]));
    const curl = g.curl[i];
    const bends = [88 * curl, 100 * Math.max(0, curl), 70 * Math.max(0, curl)];
    const pts = [finger.base];
    const dorsal = [];
    let total = 0, p = finger.base;
    for (let k = 0; k < 3; k++) {
      total += bends[k] * DEG;
      const d = rotate(dir0, side, total);
      dorsal.push(rotate([0, 0, 1], side, total));
      p = add(p, mul(d, finger.len[k]));
      pts.push(p);
    }
    digits.push({ id: finger.id, pts, r: HAND.taper.map((t) => finger.r * t), bends, dorsal });
  });
  const pinchPoint = mul(add(add(digits[0].pts[3], digits[1].pts[3]), [0, 0, -0.5]), 0.5);
  const thumb = HAND.thumb;
  const rest = norm([0.72, 0.62, -0.3]), opposed = norm([-0.15, 0.62, -0.77]);
  const d0 = norm(lerp3(rest, opposed, g.opp));
  const toward = norm([-0.8, 0.2, -0.55]);
  const side = norm(cross(d0, toward));
  const m = add(thumb.base, mul(d0, thumb.len[0]));
  const b1 = 35 * g.tcurl, b2 = 50 * g.tcurl;
  const d1 = rotate(d0, side, b1 * DEG), d2 = rotate(d0, side, (b1 + b2) * DEG);
  let j = add(m, mul(d1, thumb.len[1]));
  let tip = add(j, mul(d2, thumb.len[2]));
  if (g.pinch > 0) {
    const goal = lerp3(tip, pinchPoint, g.pinch);
    const solved = twoBone(m, goal, thumb.len[1], thumb.len[2], add(mul(d0, 0.2), [0.4, 0, 0.6]));
    j = solved.joint; tip = solved.end;
  }
  const thumbDorsal = [d0, sub(j, m), sub(tip, j)].map((axis) => norm(cross(axis, side)));
  const thumbDigit = { id: thumb.id, pts: [thumb.base, m, j, tip], r: HAND.taper.map((t) => thumb.r * t),
    bends: [0, 30 * g.opp + b1, b2], dorsal: thumbDorsal };
  const contact = g.pinch > 0.5 ? mul(add(add(digits[0].pts[3], digits[1].pts[3]), tip), 1 / 3) : digits[0].pts[3];
  const S = hand.scale, T = hand.scale * hand.thickness;
  return {
    palm: HAND.palm.map(([x, y, z, r]) => [x * S, y * S, z * S, r * T]),
    digits: [thumbDigit, ...digits].map((d) => ({ ...d, pts: d.pts.map((p) => mul(p, S)), r: d.r.map((r) => r * T) })),
    contact: mul(contact, S),
  };
}

function solveHand(pose, hand, shoulder, upper, fore) {
  const local = handLocal(pose.g, hand);
  const arm = twoBone(shoulder, pose.w, upper, fore, pose.pole);
  const W = arm.end, q = pose.q;
  const toWorld = (p) => add(W, quatRotate(q, p));
  const axes = { x: quatRotate(q, [1, 0, 0]), y: quatRotate(q, [0, 1, 0]), z: quatRotate(q, [0, 0, 1]) };
  return {
    S: shoulder, E: arm.joint, W, q, g: pose.g, axes,
    palm: local.palm.map(([x, y, z, r]) => ({ p: toWorld([x, y, z]), r })),
    digits: local.digits.map((d) => ({ id: d.id, pts: d.pts.map(toWorld), r: d.r, bends: d.bends, dorsal: d.dorsal.map((v) => quatRotate(q, v)) })),
    contact: toWorld(local.contact), toWorld,
  };
}

/** Proxy-ul mâinii la încheietura dată (spațiul rigului); dreapta = proxy-ul reflectat. */
export function handRig(p, side, wrist3, q, gesture, offset = [0, 0]) {
  const pose = { w: side === 'R' ? flip(wrist3) : wrist3, q, g: gesture, pole: flip(POLE) };
  const dx = side === 'R' ? -offset[0] : offset[0];
  return solveHand(pose, handOf(p), [p.shoulder_x + dx, p.shoulder_y + offset[1], 0], p.upper, p.lower);
}

const camP = (side) => (side === 'R' ? (v) => [-v[0], v[1], v[2]] : (v) => [v[0], v[1], v[2]]);

export function projectRig(rig, side) {
  const P = camP(side);
  const palm = rig.palm.map((c) => { const q = P(c.p); return { c: [q[0], q[1]], z: q[2], r: c.r }; });
  return {
    k: 1, palm, palmZ: palm.reduce((s, c) => s + c.z, 0) / palm.length,
    digits: rig.digits.map((d) => ({ id: d.id, pts: d.pts.map(P), r: d.r, bends: d.bends, dorsal: d.dorsal.map(P) })),
    axes: Object.fromEntries(Object.entries(rig.axes).map(([k, v]) => [k, P(v)])),
    W: P(rig.W), E: P(rig.E), S: P(rig.S), contact: P(rig.contact),
    toScreen: (local) => P(rig.toWorld(local)), g: rig.g,
  };
}

export const contactPoint = (p, side, wrist3, direction, palm, gesture) => {
  const q = orientation(direction, palm, side);
  const local = handLocal(typeof gesture === 'string' ? GESTURES[gesture] : gesture, handOf(p));
  const w = side === 'R' ? flip(wrist3) : wrist3;
  const tip = add(w, quatRotate(q, local.contact));
  return side === 'R' ? flip(tip) : tip;
};

export const wristFromTip = (p, side, tip, direction, palm, gesture) => {
  const q = orientation(direction, palm, side);
  const local = handLocal(typeof gesture === 'string' ? GESTURES[gesture] : gesture, handOf(p));
  const target = side === 'R' ? flip(tip) : tip;
  const w = sub(target, quatRotate(q, local.contact));
  return side === 'R' ? flip(w) : w;
};

// --- Volumele C ----------------------------------------------------------------
function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const turn = (o, a, b) => cross2(sub2(a, o), sub2(b, o));
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && turn(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (const q of [...p].reverse()) { while (upper.length >= 2 && turn(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function circleHull(circles, steps = 14) {
  const points = [];
  for (const { c: [cx, cy], r } of circles) for (let i = 0; i < steps; i++) { const a = i / steps * Math.PI * 2; points.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return hull(points);
}

const facing = (h) => -h.axes.z[2];
const BEND_SPLIT = 40;
const CREASE = { long: [[2.5, 6.6, -1.7], [0.8, 4.6, -1.9], [1.3, 1.9, -1.8]], short: [[-2.5, 6.1, -1.6], [-0.4, 5.9, -1.8]] };

function stableOrder(groups, memory, hysteresis, hold = 3) {
  const count = memory.count = (memory.count ?? 0) + 1;
  const swapped = memory.swapped ??= new Map();
  const key = (a, b) => [a.id, b.id].sort().join('|');
  const byId = new Map(groups.map((g) => [g.id, g]));
  const order = (memory.order ?? []).filter((id) => byId.has(id)).map((id) => byId.get(id));
  for (const g of groups.filter((g) => !order.includes(g)).sort((a, b) => a.z - b.z)) {
    let k = 0;
    while (k < order.length && order[k].z <= g.z) k++;
    order.splice(k, 0, g);
  }
  const locked = (a, b) => count - (swapped.get(key(a, b)) ?? -hold - 1) <= hold;
  let changed = true;
  while (changed) {
    changed = false;
    for (let k = 0; k < order.length - 1; k++) {
      const a = order[k], b = order[k + 1];
      if (locked(a, b)) continue;
      const recent = count - (swapped.get(key(a, b)) ?? -99) <= 2 * hold;
      if (a.z > b.z + (recent ? hysteresis : 0)) { order[k] = b; order[k + 1] = a; swapped.set(key(a, b), count); changed = true; }
    }
  }
  memory.order = order.map((g) => g.id);
  return order;
}

export function buildVolume(h, { memory = null, hand, lw }) {
  const palmPoly = circleHull(h.palm);
  const palm = { id: 'palm', z: h.palmZ, shapes: [{ t: 'poly', pts: palmPoly }], details: [] };
  const groups = [palm];
  for (const d of h.digits) {
    const thumb = d.id === 'mare';
    let cur = null;
    for (let k = 0; k < 3; k++) {
      const a = d.pts[k], b = d.pts[k + 1];
      const shape = { t: 'cap', a: [a[0], a[1]], b: [b[0], b[1]], ra: d.r[k], rb: d.r[Math.min(2, k + 1)] * 0.97, z: (a[2] + b[2]) / 2, piece: `${d.id}${k}` };
      if (thumb && k === 0) { palm.shapes.push(shape); continue; }
      // The thumb web and first phalanx share one silhouette when the thumb is open
      // or seen across the back of the hand. A tightly folded tip still overlaps it.
      if (thumb && k === 1 && (h.g.opp < 0.4 || (facing(h) < 0 && h.g.pinch < 0.5))) {
        cur = palm;
      } else if (cur === null || d.bends[k] > BEND_SPLIT) {
        const rooted = thumb ? h.g.opp < 0.4 : k === 0 && d.bends[0] <= BEND_SPLIT;
        cur = { id: `${d.id}${k}`, rooted, root: [a[0], a[1]], rootR: d.r[k], shapes: [], details: [], zs: [] };
        groups.push(cur);
      }
      cur.shapes.push(shape);
      if (cur !== palm) cur.zs.push(shape.z);
      const thumbSide = thumb && (facing(h) > -0.25 || d.dorsal[2][2] < 0.5);
      if (k === 2 && !thumbSide && d.dorsal[2][2] > 0.3 && d.bends.reduce((s, v) => s + v, 0) < 150) {
        const direction = sub2([b[0], b[1]], [a[0], a[1]]);
        const along = len2(direction);
        if (along > d.r[2] * 0.6) {
          cur.details.push({ digit: d.id, t: 'nail', c: lerp2([a[0], a[1]], [b[0], b[1]], 0.66), angle: Math.atan2(direction[1], direction[0]),
            rx: Math.min(along * 0.3, d.r[2] * 0.62), ry: d.r[2] * 0.5 * Math.min(1, d.dorsal[2][2] + 0.25), w: lw * 0.45 });
        }
      }
    }
  }
  for (const g of groups.slice(1)) {
    g.z = g.zs.reduce((s, z) => s + z, 0) / g.zs.length;
    const finger = !g.id.startsWith('mare');
    const back = facing(h) < 0;
    if (g.rooted && finger && (back || g.z > h.palmZ - 1.2 * h.k)) g.z = Math.max(g.z, h.palmZ + 0.01);
    if (g.z < h.palmZ - 0.3 * h.k && !g.rooted) g.fill = 'shade';
    if (g.rooted) g.details.unshift({ t: 'patch', digit: g.id.slice(0, -1), clip: palmPoly, c: g.root, r: g.rootR * 1.45 });
  }
  if (facing(h) > 0.35) {
    const s = hand.scale;
    const scr = (pts) => pts.map((p) => { const q = h.toScreen(p.map((v) => v * s)); return [q[0], q[1]]; });
    palm.details.push({ t: 'line', id: 'long', pts: scr(CREASE.long), w: lw * 0.6 }, { t: 'line', id: 'short', pts: scr(CREASE.short), w: lw * 0.6 });
  }
  let ordered;
  if (memory) ordered = stableOrder(groups, memory, 1.5 * h.k);
  else ordered = [...groups].sort((a, b) => a.z - b.z);
  const palmIndex = ordered.indexOf(palm);
  ordered.forEach((g, i) => { if (i < palmIndex) g.details = g.details.filter((d) => d.t !== 'patch'); });
  return { groups: ordered, lw, contact: [h.contact[0], h.contact[1]], order: ordered.map((g) => g.id).join(' ') };
}

// --- Geometria plată (inele convexe) --------------------------------------------
export const CAP_ARC = 12;

export function capsuleRing(a, b, ra, rb, n = CAP_ARC) {
  const d = sub2(b, a);
  const l = len2(d);
  if (l < Math.abs(ra - rb) + 1e-6) {
    const [c, r] = ra > rb ? [a, ra] : [b, rb];
    return Array.from({ length: 2 * n }, (_, i) => [c[0] + Math.cos(i / (2 * n) * 2 * Math.PI) * r, c[1] + Math.sin(i / (2 * n) * 2 * Math.PI) * r]);
  }
  const ang = Math.atan2(d[1], d[0]);
  const off = Math.acos(Math.max(-1, Math.min(1, (ra - rb) / l)));
  const ring = [];
  const a0 = ang + off, a1 = ang - off + 2 * Math.PI;
  for (let i = 0; i < n; i++) { const t = a0 + (a1 - a0) * i / (n - 1); ring.push([a[0] + Math.cos(t) * ra, a[1] + Math.sin(t) * ra]); }
  const b0 = ang - off, b1 = ang + off;
  for (let i = 0; i < n; i++) { const t = b0 + (b1 - b0) * i / (n - 1); ring.push([b[0] + Math.cos(t) * rb, b[1] + Math.sin(t) * rb]); }
  return ring;
}

export function grow(ring, amount) {
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const cy = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  const n = ring.length;
  return ring.map((p, i) => {
    const a = ring[(i - 1 + n) % n], b = ring[(i + 1) % n];
    const tangent = sub2(b, a);
    let normal = [tangent[1], -tangent[0]];
    let ln = len2(normal);
    if (ln < 1e-12) { normal = sub2(p, [cx, cy]); ln = len2(normal) || 1; }
    normal = mul2(normal, 1 / ln);
    if (cross2(sub2(p, [cx, cy]), normal) !== 0 && normal[0] * (p[0] - cx) + normal[1] * (p[1] - cy) < 0) normal = mul2(normal, -1);
    return add2(p, mul2(normal, amount));
  });
}

export function ellipse(c, rx, ry, angle, n = 16, growBy = 0) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  return Array.from({ length: n }, (_, i) => {
    const t = i / n * 2 * Math.PI, x = Math.cos(t) * (rx + growBy), y = Math.sin(t) * (ry + growBy);
    return [c[0] + x * ca - y * sa, c[1] + x * sa + y * ca];
  });
}

/** Sutherland–Hodgman: cercul peticului tăiat de palma convexă. */
export function clipConvex(subject, clip) {
  let out = subject;
  const area = clip.reduce((s, p, i) => s + cross2(p, clip[(i + 1) % clip.length]), 0);
  const inside = (p, a, b) => (area >= 0 ? 1 : -1) * cross2(sub2(b, a), sub2(p, a)) >= 0;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const input = out; out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length];
      const pin = inside(p, a, b), qin = inside(q, a, b);
      if (pin) out.push(p);
      if (pin !== qin) {
        const r = sub2(q, p), s = sub2(b, a);
        const t = cross2(sub2(a, p), s) / cross2(r, s);
        out.push(add2(p, mul2(r, t)));
      }
    }
  }
  return out;
}

/** Linia palmei ca bandă: perechi (stânga, dreapta) pentru o fâșie de triunghiuri. */
export function ribbon(points, width) {
  const out = [];
  const half = width / 2;
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    const t = sub2(b, a); const lt = len2(t) || 1;
    const n = [-t[1] / lt * half, t[0] / lt * half];
    out.push(add2(p, n), sub2(p, n));
  });
  return out;
}

export { facing, armPoints };
