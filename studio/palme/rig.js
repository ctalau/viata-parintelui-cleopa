// Primitive 3D proxy for Mama's right arm and hand.
// Nobody sees this model. It computes where the shoulder, elbow, wrist, knuckles
// and fingertips are in space, and each frame is projected orthographically to 2D.
// The three hand approaches on /palme/ draw on top of the same projection.
// Units: centimetres. x goes to Mama's left (to the right of the screen when she
// faces the camera), y goes up, z goes towards the camera.

export const DEG = Math.PI / 180;
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => mul(a, 1 / (len(a) || 1));
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// Rodrigues rotation of v about a unit axis k.
export function rotate(v, k, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

// --- Quaternions [w, x, y, z] -------------------------------------------------
export function quatFromBasis(x, y, z) {
  const [m00, m10, m20] = x, [m01, m11, m21] = y, [m02, m12, m22] = z;
  const trace = m00 + m11 + m22;
  let q;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    q = [s / 4, (m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s];
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    q = [(m21 - m12) / s, s / 4, (m01 + m10) / s, (m02 + m20) / s];
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    q = [(m02 - m20) / s, (m01 + m10) / s, s / 4, (m12 + m21) / s];
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    q = [(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, s / 4];
  }
  const n = Math.hypot(...q);
  return q.map((value) => value / n);
}

export function quatRotate([w, x, y, z], v) {
  const u = [x, y, z];
  const t = mul(cross(u, v), 2);
  return add(add(v, mul(t, w)), cross(u, t));
}

export function slerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { b = b.map((value) => -value); d = -d; }
  if (d > 0.9995) {
    const q = a.map((value, i) => lerp(value, b[i], t));
    const n = Math.hypot(...q);
    return q.map((value) => value / n);
  }
  const theta = Math.acos(d), s = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / s, wb = Math.sin(t * theta) / s;
  return a.map((value, i) => value * wa + b[i] * wb);
}

export const quatAngle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));

// The hand frame: x towards the thumb, y along the fingers, z out of the back of the
// hand. A key gives the finger direction and the direction the palm faces.
export function handQuat(dir, palm) {
  const y = norm(dir);
  const n = norm(sub(palm, mul(y, dot(palm, y))));
  const z = mul(n, -1);
  return quatFromBasis(cross(y, z), y, z);
}

// --- Two-bone IK with fixed lengths -------------------------------------------
export function twoBone(root, target, l1, l2, pole) {
  const d = sub(target, root);
  const reach = len(d);
  const dist = Math.min(Math.max(reach, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-4);
  const dn = norm(d);
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let side = sub(pole, mul(dn, dot(pole, dn)));
  if (len(side) < 1e-6) side = cross(dn, [0, 0, 1]);
  const joint = add(add(root, mul(dn, x)), mul(norm(side), h));
  return { joint, end: add(root, mul(dn, dist)), miss: Math.max(0, reach - dist) };
}

// --- Hand proportions (Mama's hand is chunky and short, as in the drawings) -----
export const HAND = {
  palm: [[2.1, 0.9, 0, 1.55], [-2.0, 0.9, 0, 1.5], [2.6, 7.4, 0, 1.25], [0.9, 8.0, 0, 1.25],
    [-0.9, 7.8, 0, 1.2], [-2.5, 7.1, 0, 1.1], [0.1, 4.0, 0, 1.75]],
  fingers: [
    { id: 'aratator', base: [2.6, 7.6, 0], len: [3.0, 2.0, 1.7], r: 0.93, spread: 11 },
    { id: 'mijlociu', base: [0.9, 8.2, 0], len: [3.3, 2.2, 1.8], r: 0.96, spread: 3 },
    { id: 'inelar', base: [-0.9, 8.0, 0], len: [3.1, 2.1, 1.7], r: 0.91, spread: -6 },
    { id: 'mic', base: [-2.5, 7.2, 0], len: [2.4, 1.6, 1.4], r: 0.8, spread: -15 },
  ],
  thumb: { id: 'mare', base: [2.3, 1.7, -0.4], len: [3.0, 2.4, 2.0], r: 1.05 },
  taper: [1, 0.93, 0.86],
  // Cartoon hands are larger than life: everything above is scaled by this factor.
  scale: 1.3,
  thickness: 1.15,
};
export const ARM = { upper: 24, fore: 21, shoulder: [-14, 118, 0] };

// Gestures: finger curl per finger (index, middle, ring, little), spread, thumb
// opposition and curl, and the three-finger pinch used for the sign of the cross.
export const GESTURES = {
  deschis: { curl: [-0.05, -0.05, -0.05, -0.05], spread: 0.8, opp: 0, tcurl: 0, pinch: 0 },
  relaxat: { curl: [0.22, 0.28, 0.34, 0.42], spread: 0.2, opp: 0.35, tcurl: 0.25, pinch: 0 },
  pumn: { curl: [1, 1, 1, 1], spread: 0, opp: 0.85, tcurl: 0.8, pinch: 0 },
  aratator: { curl: [0, 1, 1, 1], spread: 0.1, opp: 0.8, tcurl: 0.7, pinch: 0 },
  treiDegete: { curl: [0.5, 0.46, 1, 1], spread: -0.3, opp: 1, tcurl: 0.4, pinch: 1 },
  cupa: { curl: [0.55, 0.6, 0.62, 0.66], spread: 0.2, opp: 0.6, tcurl: 0.3, pinch: 0 },
};
export const GESTURE_NAMES = Object.keys(GESTURES);

export function mixGesture(a, b, t) {
  return {
    curl: a.curl.map((value, i) => lerp(value, b.curl[i], t)),
    spread: lerp(a.spread, b.spread, t), opp: lerp(a.opp, b.opp, t),
    tcurl: lerp(a.tcurl, b.tcurl, t), pinch: lerp(a.pinch, b.pinch, t),
  };
}

// Finger chains in hand coordinates. Each joint bends about the finger's own side
// axis, towards the palm (-z). `dorsal` is the back of each segment.
export function handLocal(g) {
  const digits = HAND.fingers.map((finger, i) => {
    const a = finger.spread * (0.4 + g.spread) * DEG;
    const dir0 = [Math.sin(a), Math.cos(a), 0];
    const side = norm(cross(dir0, [0, 0, -1]));
    const curl = g.curl[i];
    const bends = [88 * curl, 100 * Math.max(0, curl), 70 * Math.max(0, curl)];
    const pts = [finger.base];
    const dorsal = [];
    let total = 0, p = finger.base;
    for (let k = 0; k < 3; k += 1) {
      total += bends[k] * DEG;
      const d = rotate(dir0, side, total);
      dorsal.push(rotate([0, 0, 1], side, total));
      p = add(p, mul(d, finger.len[k]));
      pts.push(p);
    }
    return { id: finger.id, pts, r: HAND.taper.map((t) => finger.r * t), bends, dorsal };
  });
  const pinchPoint = mul(add(add(digits[0].pts[3], digits[1].pts[3]), [0, 0, -0.5]), 0.5);
  // Thumb: the metacarpal swings from the side of the palm to the front of it.
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
  const thumbDorsal = norm(cross(side, d0));
  const thumbDigit = {
    id: thumb.id, pts: [thumb.base, m, j, tip], r: HAND.taper.map((t) => thumb.r * t),
    bends: [0, 30 * g.opp + b1, b2], dorsal: [thumbDorsal, thumbDorsal, thumbDorsal],
  };
  const contact = g.pinch > 0.5
    ? mul(add(add(digits[0].pts[3], digits[1].pts[3]), tip), 1 / 3)
    : digits[0].pts[3];
  const S = HAND.scale, T = HAND.scale * HAND.thickness;
  return {
    palm: HAND.palm.map(([x, y, z, r]) => [x * S, y * S, z * S, r * T]),
    digits: [thumbDigit, ...digits].map((d) => ({ ...d, pts: d.pts.map((p) => mul(p, S)), r: d.r.map((r) => r * T) })),
    contact: mul(contact, S),
  };
}

// --- Body anchors and contact targets --------------------------------------
export const BODY = {
  head: [0, 146, 4], headR: 19,
  targets: { frunte: [0, 152, 22.5], piept: [0, 106, 11], umarDrept: [-10, 117, 9.5], umarStang: [10, 117, 9.5] },
};

// --- Stress tests ------------------------------------------------------------
const UP = [0, 1, 0], CAM = [0, 0, 1], OUT = [-1, 0, 0];
const rest = { w: [-17, 86, 1], dir: [0.05, -1, 0.08], palm: [1, 0, 0], g: 'relaxat' };
const flat = (angle) => [-Math.sin(angle * DEG), 0, Math.cos(angle * DEG)];

export const TESTS = [
  {
    id: 'rasucire', title: 'Răsucirea palmei',
    note: 'Palma se întoarce de la față la dos și înapoi, apoi se culcă orizontal.',
    keys: [
      { t: 0, ...rest },
      { t: 0.7, w: [-9, 116, 20], dir: UP, palm: CAM, g: 'deschis' },
      { t: 1.2, w: [-9, 116, 20], dir: UP, palm: flat(-60), g: 'deschis' },
      { t: 1.7, w: [-9, 116, 20], dir: UP, palm: flat(-120), g: 'deschis' },
      { t: 2.2, w: [-9, 116, 20], dir: UP, palm: flat(-180), g: 'deschis' },
      { t: 2.6, w: [-9, 116, 20], dir: UP, palm: flat(-180), g: 'deschis' },
      { t: 3.2, w: [-9, 116, 20], dir: UP, palm: flat(-90), g: 'deschis' },
      { t: 3.8, w: [-9, 116, 20], dir: UP, palm: CAM, g: 'deschis' },
      { t: 4.5, w: [-8, 112, 22], dir: [0.95, 0.15, 0.1], palm: [0, 1, 0.3], g: 'deschis' },
      { t: 5.2, w: [-8, 112, 22], dir: [0.95, 0.15, 0.1], palm: [0, -1, 0.3], g: 'deschis' },
      { t: 6.0, ...rest },
    ],
  },
  {
    id: 'pumn', title: 'Pumnul',
    note: 'Palma se strânge în pumn și se deschide, din față și din dos.',
    keys: [
      { t: 0, ...rest },
      { t: 0.6, w: [-10, 112, 18], dir: UP, palm: CAM, g: 'deschis' },
      { t: 1.1, w: [-10, 112, 18], dir: UP, palm: CAM, g: 'pumn' },
      { t: 1.5, w: [-10, 112, 18], dir: UP, palm: CAM, g: 'pumn' },
      { t: 2.0, w: [-10, 112, 18], dir: UP, palm: CAM, g: 'deschis' },
      { t: 2.6, w: [-10, 112, 18], dir: UP, palm: mul(CAM, -1), g: 'deschis' },
      { t: 3.1, w: [-10, 112, 18], dir: UP, palm: mul(CAM, -1), g: 'pumn' },
      { t: 3.5, w: [-10, 112, 18], dir: [0.3, 0.9, 0.2], palm: [0.5, 0, -1], g: 'pumn' },
      { t: 4.0, w: [-10, 112, 18], dir: UP, palm: [1, 0, -0.2], g: 'deschis' },
      { t: 4.6, ...rest },
    ],
  },
  {
    id: 'aratare', title: 'Arată spre cameră',
    note: 'Degetul arătător vine drept spre lentilă, apoi arată în lateral și în sus.',
    keys: [
      { t: 0, ...rest },
      { t: 0.7, w: [-11, 114, 16], dir: UP, palm: [1, 0, 0], g: 'aratator' },
      { t: 1.3, w: [-9, 112, 24], dir: [0.05, 0.12, 1], palm: [0.9, -0.4, 0], g: 'aratator' },
      { t: 2.1, w: [-9, 112, 24], dir: [0.05, 0.12, 1], palm: [0.9, -0.4, 0], g: 'aratator' },
      { t: 2.8, w: [-22, 114, 10], dir: [-1, 0.1, 0.25], palm: [0, -1, 0.2], g: 'aratator' },
      { t: 3.5, w: [-6, 128, 14], dir: [0.55, 0.65, 0.5], palm: [0.6, -0.4, -0.5], g: 'aratator' },
      { t: 4.1, w: [-6, 128, 14], dir: [0.55, 0.65, 0.5], palm: [0.6, -0.4, -0.5], g: 'aratator' },
      { t: 4.8, ...rest },
    ],
  },
  {
    id: 'salut', title: 'Salutul rapid',
    note: 'Încheietura flutură de la stânga la dreapta de trei ori pe secundă.',
    keys: (() => {
      const keys = [{ t: 0, ...rest }, { t: 0.6, w: [-17, 130, 10], dir: UP, palm: CAM, g: 'deschis' }];
      for (let i = 0; i < 7; i += 1) {
        const a = (i % 2 ? 1 : -1) * 32 * DEG;
        keys.push({ t: 0.77 + i * 0.17, w: [-17, 130, 10], dir: [Math.sin(a), Math.cos(a), 0], palm: CAM, g: 'deschis' });
      }
      keys.push({ t: 2.2, w: [-17, 130, 10], dir: UP, palm: CAM, g: 'relaxat' }, { t: 2.9, ...rest });
      return keys;
    })(),
  },
  {
    id: 'cruce', title: 'Semnul crucii',
    note: 'Trei degete unite ating fruntea, pieptul, umărul drept și umărul stâng.',
    keys: [
      { t: 0, ...rest },
      { t: 0.5, w: [-9, 110, 16], dir: [0.1, 0.6, -0.3], palm: [0.6, -0.4, -0.3], g: 'treiDegete' },
      { t: 1.0, tip: 'frunte', dir: [0.12, 0.6, -0.8], palm: [0.75, -0.55, 0], g: 'treiDegete' },
      { t: 1.35, tip: 'frunte', dir: [0.12, 0.6, -0.8], palm: [0.75, -0.55, 0], g: 'treiDegete', contact: 'frunte' },
      { t: 1.85, tip: 'piept', dir: [0.2, 0.3, -0.9], palm: [0.85, -0.35, 0], g: 'treiDegete' },
      { t: 2.2, tip: 'piept', dir: [0.2, 0.3, -0.9], palm: [0.85, -0.35, 0], g: 'treiDegete', contact: 'piept' },
      { t: 2.65, tip: 'umarDrept', dir: [-0.25, 0.35, -0.9], palm: [0.85, -0.2, 0], g: 'treiDegete' },
      { t: 3.0, tip: 'umarDrept', dir: [-0.25, 0.35, -0.9], palm: [0.85, -0.2, 0], g: 'treiDegete', contact: 'umarDrept' },
      { t: 3.5, tip: 'umarStang', dir: [0.45, 0.3, -0.85], palm: [0.5, -0.3, 0.3], g: 'treiDegete' },
      { t: 3.85, tip: 'umarStang', dir: [0.45, 0.3, -0.85], palm: [0.5, -0.3, 0.3], g: 'treiDegete', contact: 'umarStang' },
      { t: 4.6, ...rest },
    ],
  },
  {
    id: 'orbita', title: 'Camera ocolește mâna',
    note: 'Mâna ține pumnul, apoi palma deschisă, iar camera se rotește de la −70° la +70°.',
    keys: [
      { t: 0, ...rest, cam: 0 },
      { t: 0.6, w: [-10, 114, 18], dir: [0.2, 1, 0.15], palm: [0.4, 0, 1], g: 'cupa', cam: 0 },
      { t: 1.8, w: [-10, 114, 18], dir: [0.2, 1, 0.15], palm: [0.4, 0, 1], g: 'pumn', cam: -70 },
      { t: 3.2, w: [-10, 114, 18], dir: [0.2, 1, 0.15], palm: [0.4, 0, 1], g: 'deschis', cam: 70 },
      { t: 4.2, w: [-10, 114, 18], dir: [0.2, 1, 0.15], palm: [0.4, 0, 1], g: 'relaxat', cam: 0 },
      { t: 4.8, ...rest, cam: 0 },
    ],
  },
];

export const FPS = 24;
export const duration = (test) => test.keys.at(-1).t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// Resolve every key once: gesture, rotation and wrist position. Keys that pin a
// fingertip contact compute the wrist from the gesture's own contact point.
function resolveKey(key) {
  const g = typeof key.g === 'string' ? GESTURES[key.g] : key.g;
  const q = handQuat(key.dir, key.palm);
  const local = handLocal(g);
  const w = key.tip ? sub(BODY.targets[key.tip], quatRotate(q, local.contact)) : key.w;
  return { ...key, g, q, w, pole: key.pole ?? [-0.6, -0.5, -0.55] };
}
const resolved = new WeakMap();
function keysOf(test) {
  if (!resolved.has(test)) resolved.set(test, test.keys.map(resolveKey));
  return resolved.get(test);
}

export function poseAt(test, time) {
  const keys = keysOf(test);
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].t <= time) i += 1;
  const a = keys[i], b = keys[i + 1];
  const t = ease(Math.min(1, Math.max(0, (time - a.t) / (b.t - a.t))));
  return {
    w: lerp3(a.w, b.w, t), q: slerp(a.q, b.q, t), g: mixGesture(a.g, b.g, t), pole: lerp3(a.pole, b.pole, t),
    cam: lerp(a.cam ?? 0, b.cam ?? 0, t),
  };
}

// Contact holds: the interval between the key that arrives at a target and the key
// flagged with `contact`. Each frame in it should keep the fingertip on the target.
export function contactAt(test, time) {
  const keys = keysOf(test);
  for (let i = 1; i < keys.length; i += 1) {
    const k = keys[i];
    if (k.contact && time >= keys[i - 1].t - 1e-6 && time <= k.t + 1e-6 && keys[i - 1].tip === k.tip) return k.contact;
  }
  return null;
}

// World-space rig for one frame.
export function solve(pose) {
  const local = handLocal(pose.g);
  const S = ARM.shoulder;
  const arm = twoBone(S, pose.w, ARM.upper, ARM.fore, pose.pole);
  const W = arm.end;
  const toWorld = (p) => add(W, quatRotate(pose.q, p));
  const axes = { x: quatRotate(pose.q, [1, 0, 0]), y: quatRotate(pose.q, [0, 1, 0]), z: quatRotate(pose.q, [0, 0, 1]) };
  return {
    S, E: arm.joint, W, miss: arm.miss, q: pose.q, g: pose.g, axes,
    palm: local.palm.map(([x, y, z, r]) => ({ p: toWorld([x, y, z]), r })),
    digits: local.digits.map((d) => ({
      id: d.id, pts: d.pts.map(toWorld), r: d.r, bends: d.bends, dorsal: d.dorsal.map((v) => quatRotate(pose.q, v)),
    })),
    contact: toWorld(local.contact),
    local, toWorld,
  };
}

// --- Orthographic camera ---------------------------------------------------
export function camera({ yaw = 0, cx = -2, cy = 122, half = 36, width = 960, height = 540 }) {
  const c = Math.cos(yaw * DEG), s = Math.sin(yaw * DEG);
  const k = height / (2 * half);
  return {
    yaw, k, width, height, cx, cy,
    // Returns [screen x, screen y, depth]; larger depth is nearer the camera.
    p(v) {
      const x = v[0] * c + v[2] * s, z = -v[0] * s + v[2] * c;
      return [width / 2 + (x - cx) * k, height / 2 - (v[1] - cy) * k, z];
    },
    // A direction in camera space: x right, y up, z towards the lens.
    d(v) { return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c]; },
  };
}
