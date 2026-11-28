// Brațe 2.5D: IK 3D cu lungimi fixe, proiectat pe oasele plate ale rigului.
// Port al funcțiilor din experiments/cleopa-painea/scripts/palme25d.py (two_bone, arm_points,
// default_depth, solve_arm) și al interpolării din build_episode.arms (unghiurile articulațiilor
// și cât vine fiecare segment spre cameră, cu o cubică monotonă). Axe: x spre stânga
// personajului (dreapta ecranului), y în sus, z spre cameră; mâna stângă e oglinda dreptei.
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = length(a); return l > 1e-12 ? mul(a, 1 / l) : [0, 0, 0]; };
const flip = (v) => (v.length === 3 ? [-v[0], v[1], v[2]] : [-v[0], v[1]]);

export const POLE = [-0.45, -0.8, -0.4];
export const REACH = 0.997;
export const READABLE = 0.45;
export const DEPTH_MAX = 1.0;
export const CONTINUITY = 4;

export const sideSign = (side) => (side === 'R' ? -1 : 1);
export const liftAngle = (previous, angle) => previous + ((((angle - previous + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;

export function twoBone(root, target, l1, l2, pole, prefer = null, exact = null) {
  const d = sub(target, root);
  const reach = length(d);
  const dist = Math.min(Math.max(reach, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-4);
  const dn = norm(d);
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const across = (v) => sub(v, mul(dn, dot(v, dn)));
  let side = across(pole);
  if (exact && length(across(exact)) > 1e-6) side = across(exact);
  else if (prefer && length(across(prefer)) > 1e-6) {
    const base = length(side) > 1e-6 ? norm(side) : [0, 0, 0];
    side = add(base, mul(norm(across(prefer)), CONTINUITY));
  }
  if (length(side) < 1e-6) side = cross(dn, [0, 0, 1]);
  const joint = add(add(root, mul(dn, x)), mul(norm(side), h));
  return { joint, end: add(root, mul(dn, dist)), miss: Math.max(0, reach - dist), side: norm(side) };
}

/** Umărul, cotul și încheietura în 3D (spațiul rigului), ca palme25d.arm_points. */
export function armPoints(p, side, wrist, depth = null, prefer = null, exact = null) {
  const s = sideSign(side);
  const { upper, lower } = p;
  if (depth === null) depth = defaultDepth(p, side, wrist, null, prefer);
  const shoulder = [-p.shoulder_x, p.shoulder_y, 0];
  let w = [wrist[0] * -s, wrist[1], depth];
  const planar = Math.hypot(w[0] - shoulder[0], w[1] - shoulder[1]);
  const reach = (upper + lower) * REACH;
  if (planar > reach) {
    const k = reach / planar;
    w = [shoulder[0] + (w[0] - shoulder[0]) * k, shoulder[1] + (w[1] - shoulder[1]) * k, 0];
  } else if (Math.hypot(planar, w[2]) > reach) {
    w = [w[0], w[1], Math.sqrt(reach * reach - planar * planar)];
  }
  const arm = twoBone(shoulder, w, upper, lower, POLE, prefer, exact);
  let S = shoulder, E = arm.joint, W = arm.end;
  if (s > 0) { S = flip(S); E = flip(E); W = flip(W); }
  return { S, E, W, depth: W[2], miss: Math.hypot(W[0] - wrist[0], W[1] - wrist[1]), elbow: arm.side };
}

/** Adâncimea încheieturii care lasă cotul cel mai jos, cu ambele segmente lizibile. */
export function defaultDepth(p, side, wrist, previous = null, prefer = null) {
  const span = p.upper + p.lower;
  const cost = (depth) => {
    const { S, E, W } = armPoints(p, side, wrist, depth, prefer);
    const su = Math.hypot(E[0] - S[0], E[1] - S[1]) / p.upper;
    const sf = Math.hypot(W[0] - E[0], W[1] - E[1]) / p.lower;
    return E[1] / span + 2 * Math.max(0, READABLE - Math.min(su, sf)) + 0.02 * depth / span;
  };
  const steps = 50;
  let best = 0, bestCost = Infinity;
  for (let i = 0; i <= steps; i++) {
    const c = cost(i / steps * DEPTH_MAX * span);
    if (c < bestCost) { bestCost = c; best = i; }   // primul minim, ca min() din Python
  }
  let lo = Math.max(0, best - 1) / steps * DEPTH_MAX * span;
  let hi = Math.min(steps, best + 1) / steps * DEPTH_MAX * span;
  for (let i = 0; i < 30; i++) {
    const a = lo + (hi - lo) * 0.382, b = lo + (hi - lo) * 0.618;
    if (cost(a) <= cost(b)) hi = b; else lo = a;
  }
  let depth = (lo + hi) / 2;
  if (previous !== null) {
    const rate = 0.035 * span;
    depth = Math.max(previous - rate, Math.min(previous + rate, depth));
  }
  return depth;
}

/** Oasele 2D (rotații a, b, c față de repaus și scurtările) dintr-un IK 3D. */
export function solveArm(p, side, wrist, handAngle, depth = null, prefer = null) {
  const pts = armPoints(p, side, wrist, depth, prefer);
  const { S, E, W } = pts;
  const elbow = [E[0] - S[0], E[1] - S[1]];
  const fore = [W[0] - E[0], W[1] - E[1]];
  const a = Math.atan2(elbow[0], -elbow[1]);
  const b = liftAngle(a, Math.atan2(fore[0], -fore[1]));
  const c = liftAngle(b, handAngle);
  return { rotations: [a, b - a, c - b], scales: [Math.hypot(...elbow) / p.upper, Math.hypot(...fore) / p.lower], pts };
}

/** O poză-cheie a brațului: încheietura (spațiul rigului), direcția degetelor, opțional adâncimea. */
export function keyPose(p, side, wrist, direction, { depth = null, wristLimit = null } = {}) {
  const angle = Math.atan2(direction[0], -direction[1]);
  const d = depth ?? defaultDepth(p, side, wrist);
  const { rotations, scales, pts } = solveArm(p, side, wrist, angle, d);
  const limit = wristLimit ?? p.wrist_limit ?? null;
  if (limit !== null) {
    const bend = liftAngle(0, rotations[2]);
    rotations[2] = Math.max(-limit, Math.min(limit, bend));
  }
  const clamp = (v) => Math.max(-1, Math.min(1, v));
  return { a: rotations[0], b: rotations[1], c: rotations[2], su: scales[0], sf: scales[1],
    eu: Math.asin(clamp(pts.E[2] / p.upper)), ef: Math.asin(clamp((pts.W[2] - pts.E[2]) / p.lower)),
    depth: pts.W[2], elbow: pts.elbow };
}

/** Oasele din valorile articulațiilor (FK 3D → IK proiectat cu cotul dat), ca key_arm_pose. */
export function fromJoints(p, side, pose, wristLimit = null) {
  const sign = sideSign(side);
  const S = [sign * p.shoulder_x, p.shoulder_y, 0];
  const fore = pose.a + pose.b;
  const E = add(S, mul([Math.sin(pose.a) * Math.cos(pose.eu), -Math.cos(pose.a) * Math.cos(pose.eu), Math.sin(pose.eu)], p.upper));
  const W = add(E, mul([Math.sin(fore) * Math.cos(pose.ef), -Math.cos(fore) * Math.cos(pose.ef), Math.sin(pose.ef)], p.lower));
  const elbow = [(E[0] - S[0]) * -sign, E[1] - S[1], E[2] - S[2]];
  const pts = armPoints(p, side, [W[0], W[1]], W[2], null, elbow);
  const upper = [pts.E[0] - pts.S[0], pts.E[1] - pts.S[1]];
  const lower = [pts.W[0] - pts.E[0], pts.W[1] - pts.E[1]];
  const a0 = liftAngle(pose.a, Math.atan2(upper[0], -upper[1]));
  const b0 = liftAngle(pose.a + pose.b, Math.atan2(lower[0], -lower[1]));
  let c = pose.a + pose.b + pose.c - b0;
  const limit = wristLimit ?? p.wrist_limit ?? null;
  if (limit !== null) {
    const bend = liftAngle(0, c);
    c += Math.max(-limit, Math.min(limit, bend)) - bend;
  }
  return { rot: [a0, b0 - a0, c], len: [Math.hypot(...upper) / p.upper, Math.hypot(...lower) / p.lower],
    depth: pts.W[2], elbow: pts.elbow, points: pts };
}

function monotone(frames, values) {
  const n = values.length;
  const slopes = [];
  for (let i = 0; i < n - 1; i++) slopes.push((values[i + 1] - values[i]) / (frames[i + 1] - frames[i]));
  const tangents = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const s0 = slopes[i - 1], s1 = slopes[i];
    if (s0 * s1 > 0) tangents[i] = 2 / (1 / s0 + 1 / s1);
  }
  return tangents;
}

const hermite = (f0, f1, v0, v1, m0, m1, f) => {
  const h = f1 - f0, t = (f - f0) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * v1 + (t3 - t2) * h * m1;
};

const JOINTS = ['a', 'b', 'c', 'su', 'sf', 'eu', 'ef'];

/**
 * Un gest de braț prin poze-cheie [{t, wrist, dir, depth?, limit?}] (t în secunde).
 * Fiecare poză se rezolvă o dată cu IK; între ele se interpolează articulațiile (umăr, cot,
 * încheietură, cât vine fiecare segment spre cameră), ca în build_episode.arms. Rezultatul e
 * o funcție pură de timp: `at(t)` → oasele brațului.
 */
export function armTrack(p, side, keys, { wristLimit = null } = {}) {
  const poses = [];
  const times = [];
  for (const key of keys) {
    if (times.length && key.t <= times.at(-1)) continue;
    const pose = key.joints ?? keyPose(p, side, key.wrist, key.dir, { depth: key.depth ?? null, wristLimit: key.limit ?? wristLimit });
    if (poses.length) {
      const prev = poses.at(-1);
      for (const name of ['a', 'b', 'c']) pose[name] = liftAngle(prev[name], pose[name]);
    }
    poses.push(pose);
    times.push(key.t);
  }
  const tangents = Object.fromEntries(JOINTS.map((j) => [j, monotone(times, poses.map((q) => q[j]))]));
  return {
    start: times[0], end: times.at(-1), times, poses,
    at(t) {
      if (t <= times[0]) return fromJoints(p, side, poses[0], wristLimit);
      if (t >= times.at(-1)) return fromJoints(p, side, poses.at(-1), wristLimit);
      let i = 0;
      while (t > times[i + 1]) i++;
      const pose = {};
      for (const j of JOINTS) pose[j] = hermite(times[i], times[i + 1], poses[i][j], poses[i + 1][j], tangents[j][i], tangents[j][i + 1], t);
      return fromJoints(p, side, pose, wristLimit);
    },
  };
}
