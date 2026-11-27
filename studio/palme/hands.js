// The three hand approaches. Each one takes the same projected 3D proxy and
// returns cut-out groups for draw.js.
//   volum       – C: the proxy's own volumes, painted flat with toon outlines.
//   substitutie – A: a library of drawn hands, picked by view and gesture, placed in 2D.
//   plasa       – B: one drawn hand as a 2D mesh, skinned to the projected bones.
import {
  COLORS, add2, circleHull, cross2, len2, lerp2, mapGroups, mul2, sub2,
} from './draw.js';
import { GESTURES, GESTURE_NAMES, HAND, handLocal, quatAngle, quatFromBasis, rotate } from './rig.js';

// --- Projection --------------------------------------------------------------
export function projectRig(rig, cam) {
  const P = (v) => cam.p(v);
  const palm = rig.palm.map(({ p, r }) => { const q = P(p); return { c: [q[0], q[1]], z: q[2], r: r * cam.k }; });
  return {
    k: cam.k,
    palm,
    palmZ: palm.reduce((sum, c) => sum + c.z, 0) / palm.length,
    digits: rig.digits.map((d) => ({
      id: d.id, pts: d.pts.map(P), r: d.r.map((r) => r * cam.k), bends: d.bends, dorsal: d.dorsal.map((v) => cam.d(v)),
    })),
    axes: { x: cam.d(rig.axes.x), y: cam.d(rig.axes.y), z: cam.d(rig.axes.z) },
    W: P(rig.W), E: P(rig.E), S: P(rig.S), contact: P(rig.contact),
    toScreen: (local) => P(rig.toWorld(local)),
    g: rig.g,
  };
}

const xy = (p) => [p[0], p[1]];
const facing = (h) => -h.axes.z[2]; // > 0 when the palm faces the lens

// Palm lines, in hand coordinates on the palm surface.
const CREASE = {
  long: [[2.5, 6.6, -1.7], [0.8, 4.6, -1.9], [1.3, 1.9, -1.8]].map((p) => p.map((v) => v * HAND.scale)),
  short: [[-2.5, 6.1, -1.6], [-0.4, 5.9, -1.8]].map((p) => p.map((v) => v * HAND.scale)),
};

// --- C: projected volumes --------------------------------------------------------
// Straight fingers are rooted in the palm. A joint bent past 40° starts a new piece,
// so the drawing gets a contour line exactly where a cartoonist would put one.
export const BEND_SPLIT = 40;

export function buildVolume(h, { details = true, memory = null } = {}) {
  const lw = Math.max(1.2, 0.26 * h.k);
  const palmPoly = circleHull(h.palm);
  const palm = { id: 'palm', z: h.palmZ, shapes: [{ t: 'poly', pts: palmPoly }], details: [] };
  const groups = [palm];
  for (const d of h.digits) {
    const thumb = d.id === 'mare';
    let cur = null;
    for (let k = 0; k < 3; k += 1) {
      const a = d.pts[k], b = d.pts[k + 1];
      const shape = { t: 'cap', a: xy(a), b: xy(b), ra: d.r[k], rb: d.r[Math.min(2, k + 1)] * 0.97, z: (a[2] + b[2]) / 2 };
      if (thumb && k === 0) { palm.shapes.push(shape); continue; }
      if (!cur || d.bends[k] > BEND_SPLIT) {
        const rooted = thumb ? h.g.opp < 0.4 : k === 0 && d.bends[0] <= BEND_SPLIT;
        cur = { id: `${d.id}${k}`, rooted, root: xy(a), rootR: d.r[k], shapes: [], details: [], zs: [] };
        groups.push(cur);
      }
      cur.shapes.push(shape);
      cur.zs.push(shape.z);
      // A tip tucked into the fist shows no nail.
      if (details && k === 2 && d.dorsal[2][2] > 0.3 && d.bends[0] + d.bends[1] + d.bends[2] < 150) {
        const dir = sub2(xy(b), xy(a));
        const along = len2(dir);
        if (along > d.r[2] * 0.6) {
          cur.details.push({
            t: 'nail', c: lerp2(xy(a), xy(b), 0.66), angle: Math.atan2(dir[1], dir[0]),
            rx: Math.min(along * 0.3, d.r[2] * 0.62), ry: d.r[2] * 0.5 * Math.min(1, d.dorsal[2][2] + 0.25), w: lw * 0.45,
          });
        }
      }
    }
  }
  for (const g of groups.slice(1)) {
    g.z = g.zs.reduce((s, z) => s + z, 0) / g.zs.length;
    // A finger rooted in the palm sits in front of it unless it clearly goes behind.
    const finger = !g.id.startsWith('mare');
    if (g.rooted && finger && g.z > h.palmZ - 1.2 * h.k) g.z = Math.max(g.z, h.palmZ + 0.01);
    if (g.z < h.palmZ - 0.3 * h.k && !g.rooted) g.fill = COLORS.shade;
    if (g.rooted) g.details.unshift({ t: 'patch', clip: palmPoly, c: g.root, r: g.rootR * 1.45, color: COLORS.skin });
  }
  if (details && facing(h) > 0.35) {
    const crease = CREASE.long.map((p) => xy(h.toScreen(p)));
    const short = CREASE.short.map((p) => xy(h.toScreen(p)));
    palm.details.push({ t: 'line', pts: crease, color: COLORS.crease, w: lw * 0.6 }, { t: 'line', pts: short, color: COLORS.crease, w: lw * 0.6 });
  }
  // With memory, pieces keep last frame's order until their depths differ by more
  // than half a centimetre, so nearly level fingers do not flicker in front of each other.
  if (memory) {
    const n = groups.length;
    for (const g of groups) g.z += memory.has(g.id) ? (memory.get(g.id) / n) * 0.5 * h.k : 0;
  }
  groups.sort((a, b) => a.z - b.z);
  if (memory) { memory.clear(); groups.forEach((g, i) => memory.set(g.id, i)); }
  // The patch must come after the palm, so a rooted finger drawn behind it loses the patch.
  const palmIndex = groups.indexOf(palm);
  groups.forEach((g, i) => { if (i < palmIndex) g.details = g.details.filter((d) => d.t !== 'patch'); });
  return { groups, lw, contact: xy(h.contact), order: groups.map((g) => g.id).join(' ') };
}

export function createVolume() {
  const memory = new Map();
  return { build: (h) => buildVolume(h, { memory }), reset: () => memory.clear() };
}

// --- A: drawing substitution --------------------------------------------------
// The in-plane "up" of the hand on screen: the finger direction, or, when the
// fingers point at the lens, the thumb turned a quarter.
export function screenUp(axes) {
  const u = [axes.y[0], -axes.y[1]], s = [axes.x[0], -axes.x[1]];
  const lu = len2(u);
  const w = Math.min(1, Math.max(0, (lu - 0.2) / 0.3));
  const a = lu > 1e-6 ? mul2(u, 1 / lu) : [0, -1];
  const ls = len2(s) || 1;
  const b = [-s[1] / ls, s[0] / ls];
  const v = add2(mul2(a, w), mul2(b, 1 - w));
  return Math.atan2(v[1], v[0]) + Math.PI / 2;
}

// The camera-space hand basis with the screen roll removed (rotation about the view axis).
export function normalized(axes) {
  const psi = screenUp(axes);
  const k = [0, 0, 1];
  const r = (v) => rotate(v, k, psi);
  return { psi, q: quatFromBasis(r(axes.x), r(axes.y), r(axes.z)) };
}

const VIEW_AXES = (() => {
  const views = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i * 45 * Math.PI) / 180;
    const y = [0, 1, 0];
    const z = rotate([0, 0, -1], y, a);
    views.push({ id: `rasucit-${i * 45}`, x: [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]], y, z });
  }
  const basis = (id, y, z) => ({ id, y, z, x: [y[1] * z[2] - y[2] * z[1], y[2] * z[0] - y[0] * z[2], y[0] * z[1] - y[1] * z[0]] });
  views.push(basis('spre-camera-palma-jos', [0, 0, 1], [0, 1, 0]), basis('spre-camera-palma-sus', [0, 0, 1], [0, -1, 0]),
    basis('departe-palma-jos', [0, 0, -1], [0, 1, 0]), basis('departe-palma-sus', [0, 0, -1], [0, -1, 0]));
  return views;
})();

const gestureDistance = (a, b) => a.curl.reduce((s, c, i) => s + Math.abs(c - b.curl[i]), 0) / 4 +
  Math.abs(a.opp - b.opp) * 0.5 + Math.abs(a.pinch - b.pinch) + Math.abs(a.spread - b.spread) * 0.3;

// Each drawing is made once, at unit scale, wrist at the origin, "up" pointing up.
function drawLibraryEntry(view, gesture) {
  const local = handLocal(GESTURES[gesture]);
  const toCam = (p) => [p[0] * view.x[0] + p[1] * view.y[0] + p[2] * view.z[0],
    p[0] * view.x[1] + p[1] * view.y[1] + p[2] * view.z[1], p[0] * view.x[2] + p[1] * view.y[2] + p[2] * view.z[2]];
  const P = (p) => { const c = toCam(p); return [c[0], -c[1], c[2]]; };
  const h = {
    k: 1,
    palm: local.palm.map(([x, y, z, r]) => { const q = P([x, y, z]); return { c: [q[0], q[1]], z: q[2], r }; }),
    digits: local.digits.map((d) => ({ id: d.id, pts: d.pts.map(P), r: d.r, bends: d.bends, dorsal: d.dorsal.map(toCam) })),
    axes: { x: view.x, y: view.y, z: view.z }, W: [0, 0, 0], contact: P(local.contact), toScreen: P, g: GESTURES[gesture],
  };
  h.palmZ = h.palm.reduce((s, c) => s + c.z, 0) / h.palm.length;
  const built = buildVolume(h);
  const { psi } = normalized(h.axes);
  // Turn the drawing so its "up" points up the page.
  const c = Math.cos(-psi), s = Math.sin(-psi);
  const turn = (p) => [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
  return {
    id: `${gesture}/${view.id}`, gesture, view: view.id, q: normalized(h.axes).q,
    groups: mapGroups(built.groups, turn, 1, -psi), contact: turn(built.contact), lw: 0.26,
  };
}

let library;
export function substitutionLibrary() {
  library ??= GESTURE_NAMES.flatMap((g) => VIEW_AXES.map((v) => drawLibraryEntry(v, g)));
  return library;
}

// Picks the nearest drawing. Like an animator on a hand chart it keeps the current
// drawing for at least two frames and only switches for a clearly better one.
export function createSubstitution({ hold = 2, margin = 0.18 } = {}) {
  let current = null, held = 0;
  return {
    reset() { current = null; held = 0; },
    pick(h) {
      const lib = substitutionLibrary();
      const { psi, q } = normalized(h.axes);
      const g = h.g;
      const gesture = GESTURE_NAMES.reduce((best, name) =>
        (gestureDistance(GESTURES[name], g) < gestureDistance(GESTURES[best], g) ? name : best), GESTURE_NAMES[0]);
      const score = (e) => quatAngle(e.q, q) + (e.gesture === gesture ? 0 : 0.8 + gestureDistance(GESTURES[e.gesture], g));
      let best = lib[0];
      for (const e of lib) if (score(e) < score(best)) best = e;
      held += 1;
      if (!current || (best !== current && held >= hold && score(best) < score(current) - margin) || score(current) > 1.2) {
        if (current !== best) held = 0;
        current = best;
      }
      return { entry: current, psi };
    },
  };
}

// Places one given drawing, without choosing (used to measure contacts in another framing).
export const fixedDrawing = (entry) => ({ pick: (h) => ({ entry, psi: normalized(h.axes).psi }) });

export function buildSubstitution(h, picker) {
  const { entry, psi } = picker.pick(h);
  const c = Math.cos(psi), s = Math.sin(psi);
  const W = xy(h.W);
  const place = (p) => [W[0] + (p[0] * c - p[1] * s) * h.k, W[1] + (p[0] * s + p[1] * c) * h.k];
  const groups = mapGroups(entry.groups, place, h.k, psi);
  return { groups, lw: Math.max(1.2, entry.lw * h.k), contact: place(entry.contact), entry: entry.id, drawing: entry };
}

// --- B: 2D mesh skinned to the projected bones ----------------------------------
// The drawing is one open hand, palm side. The palm follows an affine map from three
// projected points (wrist, index and little-finger knuckles). Each finger phalanx is
// a stretchy 2D bone from one projected joint to the next: it shortens with
// foreshortening and keeps its width. Weights blend 50/50 at every joint.
const REST = handLocal(GESTURES.deschis);
const R2 = (p) => [p[0], p[1]];

const MESH = (() => {
  const palmLoop = circleHull(REST.palm.map(([x, y, , r]) => ({ c: [x, y], r })), 10);
  const center = [0.1 * HAND.scale, 4.2 * HAND.scale];
  const digits = REST.digits.map((d) => {
    const J = d.pts.map(R2);
    const lens = [0, 1, 2].map((k) => len2(sub2(J[k + 1], J[k])));
    const rows = [];
    for (let k = 0; k < 3; k += 1) {
      for (const f of [0, 0.5]) rows.push({ k, a: f * lens[k], r: d.r[k] * (1 - f * 0.05), joint: f === 0 });
    }
    rows.push({ k: 2, a: lens[2], r: d.r[2] * 0.95, joint: false });
    const tip = [];
    for (let i = 1; i < 6; i += 1) {
      const t = (i / 6) * Math.PI;
      tip.push({ k: 2, a: lens[2] + Math.sin(t) * d.r[2] * 0.95, b: Math.cos(t) * d.r[2] * 0.95 });
    }
    return { id: d.id, J, lens, rows, tip };
  });
  return { palmLoop, center, digits };
})();

function affineFrom(src, dst) {
  const [a0, a1, a2] = src, [b0, b1, b2] = dst;
  const u = sub2(a1, a0), v = sub2(a2, a0), U = sub2(b1, b0), V = sub2(b2, b0);
  const det = cross2(u, v);
  const inv = [[v[1] / det, -v[0] / det], [-u[1] / det, u[0] / det]];
  const m = [[U[0] * inv[0][0] + V[0] * inv[1][0], U[0] * inv[0][1] + V[0] * inv[1][1]],
    [U[1] * inv[0][0] + V[1] * inv[1][0], U[1] * inv[0][1] + V[1] * inv[1][1]]];
  const apply = (p) => { const d = sub2(p, a0); return [b0[0] + m[0][0] * d[0] + m[0][1] * d[1], b0[1] + m[1][0] * d[0] + m[1][1] * d[1]]; };
  return { apply, det: m[0][0] * m[1][1] - m[0][1] * m[1][0], m };
}

export function buildMesh(h) {
  const lw = Math.max(1.2, 0.26 * h.k);
  const idx = h.digits[1].pts[0], pinky = h.digits[4].pts[0];
  const A = affineFrom([[0, 0], REST.digits[1].pts[0], REST.digits[4].pts[0]].map(R2), [xy(h.W), xy(idx), xy(pinky)]);
  const sign = Math.sign(A.det) || 1;
  const front = A.det > 0; // the drawing is the palm side
  let folds = 0, triangles = 0;
  const tri = (p, q, r, restP, restQ, restR) => {
    triangles += 1;
    const want = Math.sign(cross2(sub2(restQ, restP), sub2(restR, restP))) * sign;
    const got = cross2(sub2(q, p), sub2(r, p));
    if (Math.abs(got) > 0.4 && Math.sign(got) !== want) folds += 1;
  };
  const palmPts = MESH.palmLoop.map(A.apply);
  const centre = A.apply(MESH.center);
  palmPts.forEach((p, i) => {
    const n = (i + 1) % palmPts.length;
    tri(centre, p, palmPts[n], MESH.center, MESH.palmLoop[i], MESH.palmLoop[n]);
  });
  const palm = { id: 'palm', z: h.palmZ, shapes: [{ t: 'poly', pts: palmPts }], details: [] };
  const groups = [palm];
  const tips = {};
  MESH.digits.forEach((m, i) => {
    const d = h.digits[i];
    const bone = (k, a, b) => {
      const H = xy(d.pts[k]), T = xy(d.pts[k + 1]);
      let dir = sub2(T, H);
      const l = len2(dir);
      const restDir = mul2(sub2(m.J[k + 1], m.J[k]), 1 / m.lens[k]);
      const fallback = sub2(A.apply(add2(m.J[k], restDir)), A.apply(m.J[k]));
      const unit = l > 1e-3 ? mul2(dir, 1 / l) : mul2(fallback, 1 / (len2(fallback) || 1));
      dir = l > 1e-3 ? dir : [0, 0];
      return add2(add2(H, mul2(dir, a / m.lens[k])), mul2([-unit[1], unit[0]], b * h.k * sign));
    };
    const restAt = (k, a, b) => {
      const dir = mul2(sub2(m.J[k + 1], m.J[k]), 1 / m.lens[k]);
      return add2(add2(m.J[k], mul2(dir, a)), mul2([-dir[1], dir[0]], b));
    };
    const vert = (row, b) => {
      const p = bone(row.k, row.a, b);
      if (!row.joint) return p;
      const other = row.k === 0 ? A.apply(restAt(0, 0, b)) : bone(row.k - 1, m.lens[row.k - 1], b);
      return lerp2(p, other, 0.5);
    };
    const left = m.rows.map((row) => vert(row, row.r));
    const right = m.rows.map((row) => vert(row, -row.r));
    const tip = m.tip.map((t) => bone(t.k, t.a, t.b));
    const restLeft = m.rows.map((row) => restAt(row.k, row.a, row.r));
    const restRight = m.rows.map((row) => restAt(row.k, row.a, -row.r));
    for (let r = 0; r < m.rows.length - 1; r += 1) {
      tri(left[r], right[r], right[r + 1], restLeft[r], restRight[r], restRight[r + 1]);
      tri(left[r], right[r + 1], left[r + 1], restLeft[r], restRight[r + 1], restLeft[r + 1]);
    }
    const tipCentre = bone(2, m.lens[2], 0);
    const loop = [...left, ...tip.slice().reverse(), ...right.slice().reverse()];
    const z = d.pts.reduce((s, p) => s + p[2], 0) / 4;
    const group = { id: m.id, z, shapes: [{ t: 'poly', pts: loop }], details: [], root: centreOf(left[0], right[0]), rootR: d.r[0] };
    if (i === 0) group.z = z; // the thumb has no special rule
    else if (z > h.palmZ - 1.2 * h.k) group.z = Math.max(z, h.palmZ + 0.01);
    if (i > 0) group.details.push({ t: 'patch', clip: palmPts, c: group.root, r: d.r[0] * 1.45, color: COLORS.skin });
    if (!front) {
      const a = bone(2, m.lens[2] * 0.45, 0), b = bone(2, m.lens[2] + d.r[2] * 0.2, 0);
      const dir = sub2(b, a);
      if (len2(dir) > d.r[2] * 0.5) {
        group.details.push({ t: 'nail', c: lerp2(a, b, 0.6), angle: Math.atan2(dir[1], dir[0]), rx: Math.min(len2(dir) * 0.42, d.r[2] * 0.6), ry: d.r[2] * 0.48, w: lw * 0.45 });
      }
    }
    tips[m.id] = tipCentre;
    groups.push(group);
  });
  if (front) {
    const crease = CREASE.long.map((p) => A.apply(R2(p)));
    const short = CREASE.short.map((p) => A.apply(R2(p)));
    palm.details.push({ t: 'line', pts: crease, color: COLORS.crease, w: lw * 0.6 }, { t: 'line', pts: short, color: COLORS.crease, w: lw * 0.6 });
  }
  groups.sort((a, b) => a.z - b.z);
  const palmIndex = groups.indexOf(palm);
  groups.forEach((g, i) => { if (i < palmIndex) g.details = g.details.filter((d) => d.t !== 'patch'); });
  const contact = h.g.pinch > 0.5
    ? mul2(add2(add2(tips.mare, tips.aratator), tips.mijlociu), 1 / 3)
    : tips.aratator;
  return { groups, lw, contact, folds, triangles, front };
}

const centreOf = (a, b) => lerp2(a, b, 0.5);
