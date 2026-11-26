// 2D storybook character (engine "2d"): a gentle hand-drawn person with a big round head, large shining eyes,
// rosy cheeks, soft brown outlines, a long robe with folds, wide sleeves, mitten hands with a thumb.
//
// The figure is posed as a tiny 3D skeleton (same joints and the same gestures as the 3D minifig: GESTURE_POSES)
// and then drawn flat, so turning, raising an arm towards the viewer, nodding and walking all read naturally.
// Everything is a pure function of (look, state): no state is kept between frames.
//
//   const pose = posePerson(look, state)     // state: time, h (heading: 0 = faces the viewer), walk, gestures,
//                                            //        emotion, mouth, talk, posture, holding, blink, rest, seat
//   drawPerson(g, look, pose, { lw, hold })  // g is already transformed: 1 unit = 1 stud, y up, feet at (0,0)
//   pose.hands.R / .L = [x, y, depth]        // hand centres in the same frame (for held props)
//   pose.head = [x, y, r]                    // head centre + radius (cameras, checks)
import { GESTURE_POSES } from '../components/minifig.js';
import { clamp01, smooth, lerp } from '../engine/timeline.js';
import { col, shade, mix, rgba, INK, setInk, blob, curve, inked, ellipse } from './paint.js';
import { drawPateric } from './pateric.js';

export const LOOKS2D = {
  'monk': { skin: 'skin', robe: 'darkBrown', hat: 'skufia', hatColor: 'black', beard: 'short', beardColor: 'brown', age: 'adult', print: 'robe' },
  'elder-monk': { skin: 'skin', robe: 'navy', hat: 'skufia', hatColor: 'black', beard: 'long', beardColor: 'white', age: 'elder', print: 'robe' },
  'young-monk': { skin: 'skin', robe: 'reddishBrown', hat: 'skufia', hatColor: 'black', beard: 'none', hair: 'short', hairColor: 'brown', age: 'young', print: 'robe' },
  'villager': { skin: 'tanSkin', robe: 'white', hat: 'headscarf', hatColor: 'white', bandColor: 'blue', beard: 'short', beardColor: 'black', age: 'adult', print: 'tunic', stripe: 'blue' },
  'child': { skin: 'skin', robe: 'mediumBlue', hat: 'none', hair: 'short', hairColor: 'darkBrown', beard: 'none', age: 'child', print: 'tunic', stripe: 'white', scale: 0.72 },
  'woman': { skin: 'skin', robe: 'rose', hat: 'headscarf', hatColor: 'lavender', bandColor: 'white', beard: 'none', age: 'adult', print: 'tunic', stripe: 'gold', lashes: true },
};
// film-wide drawing styles of the people ("style" at the top of video.json): defaults under every look
//   pateric — the people of the reference drawing of film 025 (pateric.js): monks in deep hoods, a narrow face,
//             a flowing beard, a shoulder capelet, a wide bell robe and big sleeves — not the storybook character
export const STYLES2D = {
  pateric: { figure: 'pateric', hat: 'hood', headScale: 1.1 },
};
export function resolveLook2d(look = {}, style = null) {
  const base = LOOKS2D[look.preset || 'monk'] || LOOKS2D.monk;
  const L = { ...base, ...(STYLES2D[style] || {}), ...look };
  if (!L.skin || L.skin === 'yellow') L.skin = base.skin || 'skin'; // 3D looks use "yellow" plastic skin
  return L;
}

// body measures (studs): a little taller head than the minifig, same shoulder / hand heights (gestures keep working)
const WAIST = 1.45, SHOULDER_Y = 2.62, SHOULDER_X = 0.55, NECK_Y = 2.86, HEAD_R = 0.74, HEAD_UP = 0.68, ARM = 1.0;
export const FIGURE_HEIGHT = NECK_Y + HEAD_UP + HEAD_R; // ≈ 4.3

// draw yaw from the heading: faces stay readable (never a flat profile) until the figure really turns away
function drawYaw(h) {
  // like a cartoon actor "cheating out" to the audience: a person facing sideways still shows most of the face;
  // only someone turned well away (> ~140°) shows the back of the head
  const a = Math.atan2(Math.sin(h), Math.cos(h)), s = Math.sign(a) || 1, m = Math.abs(a);
  const LIM = 2.45;
  if (m <= LIM) return s * 0.95 * Math.pow(m / LIM, 0.85);
  return s * (0.95 + ((m - LIM) / (Math.PI - LIM)) * (Math.PI - 0.95));
}

const handShapeOf = (gestures, side) => gestures.some((g) => (g.name === 'cross' || g.name === 'point') && (g.hand === 'L' ? 'L' : 'R') === side);
export function posePerson(look, st) {
  const t = st.time || 0;
  const rest = !!st.rest;
  const p = { rArmX: 0, rArmZ: 0, lArmX: 0, lArmZ: 0, rHandX: 0, lHandX: 0, headYaw: 0, headPitch: 0, headRoll: 0, bend: 0, lift: 0, legs: 0, gazeX: 0, gazeY: 0, eyesClosed: false };
  const gestures = rest ? [] : st.gestures || [];
  const walk = rest ? null : st.walk;
  if (!rest) { p.bend += 0.018 * Math.sin(t * 2.1); p.headRoll += 0.025 * Math.sin(t * 1.3); }
  const post = st.posture || { from: 'stand', to: 'stand', k: 1 };
  const seated = post.to !== 'stand' && post.k > 0.5;
  const carryOf = (hd) => (!hd ? 0 : hd === 'low' ? (seated ? 0.75 : 0.6) : seated ? 1.55 : 1.25);
  const carryR = carryOf(st.holding?.R), carryL = carryOf(st.holding?.L);
  let stride = 0;
  if (walk && walk.amount > 0) {
    const sw = (walk.style === 'slow' ? 0.35 : 0.65) * walk.amount;
    const s = Math.sin(walk.phase);
    stride = s * sw;
    p.lArmX += -s * sw * 0.7; if (!st.holding?.R) p.rArmX += s * sw * 0.7;
    p.lift += Math.abs(Math.cos(walk.phase)) * 0.1 * walk.amount;
    if (walk.style === 'slow') p.bend += 0.15 * walk.amount;
  }
  if (!rest && st.talk) { p.headPitch += 0.07 * Math.sin(t * 9) * st.talk; p.headYaw += 0.06 * Math.sin(t * 3.7) * st.talk; }
  for (const gst of gestures) {
    const fn = GESTURE_POSES[gst.name];
    if (!fn) continue;
    const gp = fn(gst.k, t);
    if (gst.name === 'hug') { p.hugOn = 1; p.hug = Math.max(p.hug || 0, -(gp.rArmX || 0) / 1.5); }   // in a hug · how far into it (0..1)
    for (const [k, v] of Object.entries(gp)) {
      if (k === 'eyesClosed') p.eyesClosed = p.eyesClosed || v;
      else if (gst.hand === 'L' && k.startsWith('r')) p['l' + k.slice(1)] += k.endsWith('Z') ? -v : v;
      else if (gst.hand === 'L' && k.startsWith('l') && k !== 'legs' && k !== 'lift') p['r' + k.slice(1)] += k.endsWith('Z') ? -v : v;
      else p[k] = (p[k] || 0) + v;
    }
  }
  if (carryR) p.rArmX = Math.min(p.rArmX, -carryR);
  if (carryL) p.lArmX = Math.min(p.lArmX, -carryL);

  // posture: how far the body is lowered, how much of a lap the robe makes, lying down
  const P = (n) => ({ stand: [0, 0, 0], sit: [-1.0 + (st.seat || 0), 1, 0], kneel: [-0.78, 0.8, 0], lie: [0, 0, 1], ride: [0.85, 0, 0] }[n] || [0, 0, 0]);
  const a = P(post.from), b = P(post.to), k = smooth(post.k);
  const lower = lerp(a[0], b[0], k), lap = (st.seat || 0) > 0.5 ? 0 : lerp(a[1], b[1], k), lie = lerp(a[2], b[2], k);
  const yaw0 = drawYaw(st.h || 0);
  // "pateric" people are a fixed three-quarter drawing (pateric.js): the skeleton turns only a little more than that,
  // so the arms stay on their own side of the body (a full turn put the far arm across the robe); turning away still works
  const PAT = look.figure === 'pateric';
  const yaw = PAT && Math.cos(yaw0) > -0.25 ? Math.max(-0.3, Math.min(0.3, yaw0)) : yaw0;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const base = lower + p.lift;

  // local 3D (x = figure's left, y up, z forward) → drawing plane [x, y, depth]
  const bendPt = (x, y, z) => {
    if (y <= WAIST) return [x, y, z];
    const dy = y - WAIST, b2 = p.bend;
    return [x, WAIST + dy * Math.cos(b2) - z * Math.sin(b2), dy * Math.sin(b2) + z * Math.cos(b2)];
  };
  const pt = (x, y, z) => { const [bx, by, bz] = bendPt(x, y, z); return [bx * cy + bz * sy, by + base, -bx * sy + bz * cy]; };
  // arms follow the real heading more than the face does: someone giving to a person at his side reaches out to the side,
  // so what he holds stays clear of his face and beard
  const hn = Math.atan2(Math.sin(st.h || 0), Math.cos(st.h || 0));
  const armYaw = PAT ? yaw : Math.abs(hn) <= Math.PI / 2 ? Math.sign(hn) * Math.min(Math.abs(hn), 1.3) : yaw;
  const cA = Math.cos(armYaw), sA = Math.sin(armYaw);
  const ptA = (x, y, z) => { const [bx, by, bz] = bendPt(x, y, z); return [bx * cA + bz * sA, by + base, -bx * sA + bz * cA]; };
  // hand shapes: three fingers joined for the sign of the cross, a pointing finger
  const handShape = { R: null, L: null };
  for (const gst of gestures) if (gst.name === 'cross' || gst.name === 'point') handShape[gst.hand === 'L' ? 'L' : 'R'] = gst.name;

  const arm = (side) => {
    const sx = side === 'L' ? 1 : -1;
    const ax = side === 'L' ? p.lArmX : p.rArmX;
    const phi = side === 'L' ? 0.07 + p.lArmZ : -0.07 + p.rArmZ;
    const d = [Math.sin(phi), -Math.cos(phi) * Math.cos(ax), -Math.cos(phi) * Math.sin(ax)];
    const S = [sx * SHOULDER_X, SHOULDER_Y, 0];
    // the head is bigger than the minifig's: a hand raised above the shoulder reaches further, so the sign of the
    // cross really touches the forehead
    const reach = 1 + 1.1 * Math.max(0, (d[1] - 0.45) / 0.55); // only high raises (forehead), not the shoulders
    const at = (u, out = 0, back = 0) => { u *= reach; return ptA(S[0] + d[0] * u + sx * out, S[1] + d[1] * u, S[2] + d[2] * u - back); };
    return { side, S: at(0), E: at(ARM * 0.5, 0.05, 0.05), W: at(ARM * 0.86), H: at(ARM), d };
  };
  const arms = { R: arm('R'), L: arm('L') };
  // "pateric" people (the reference drawing) rest their hands folded in front of the waist / in the lap, not at the sides;
  // a gesture that lifts the hand, or a held prop, takes the arm out of the rest
  if (look.figure === 'pateric') for (const side of ['R', 'L']) {
    if (st.holding?.[side]) continue;
    const A = arms[side], sx = side === 'L' ? 1 : -1;
    const w = smooth(clamp01((2.05 - (A.H[1] - base)) / 0.45)) * (handShapeOf(gestures, side) ? 0 : 1);
    if (w <= 0) continue;
    const H = ptA(sx * 0.2, WAIST + 0.4, 0.5), E = ptA(sx * 0.68, 2.05, 0.2);
    const dx = H[0] - E[0], dy = H[1] - E[1], l = Math.hypot(dx, dy) || 1;
    const W = [H[0] - dx / l * 0.14, H[1] - dy / l * 0.14, H[2]];
    A.H = A.H.map((v, k) => lerp(v, H[k], w)); A.E = A.E.map((v, k) => lerp(v, E[k], w)); A.W = A.W.map((v, k) => lerp(v, W[k], w));
  }
  // a hand raised above the shoulder (wave, joy) goes out to the side, beside the hood — never on top of the head
  if (PAT) for (const side of ['R', 'L']) {
    if (handShapeOf(gestures, side) && gestures.some((g) => g.name === 'cross')) continue;
    const A = arms[side], sx = side === 'L' ? 1 : -1;
    const rise = smooth(clamp01((A.H[1] - base - 2.4) / 0.7));
    if (rise <= 0) continue;
    A.E[0] += sx * 0.25 * rise; A.W[0] += sx * 0.55 * rise; A.H[0] += sx * 0.62 * rise;
  }
  // head: pivots at the neck (nod = forward), then follows the waist bend
  const hp = p.headPitch;
  const HU = HEAD_UP * (0.4 + 0.6 * (look.headScale || 1));   // a smaller head sits lower, on the neck
  const head = pt(0, NECK_Y + HU * Math.cos(hp), HU * Math.sin(hp));
  const neck = pt(0, NECK_Y - 0.05, 0);
  // sign of the cross, drawn like in a picture book: the elbow bends down at the side, the forearm comes up in front of
  // the chest and the joined fingertips really touch the forehead (the hand goes over the face, as when we make the cross)
  const R0 = HEAD_R * (look.headScale || 1), fyF = faceYaw2d(yaw + p.headYaw * 0.8);
  for (const side of ['R', 'L']) {
    if (handShape[side] !== 'cross') continue;
    const A = arms[side], S = A.S;
    const side0 = Math.sign(S[0] - head[0]) || (side === 'L' ? 1 : -1);
    const elbowAt = (H) => [S[0] + side0 * 0.52, Math.min(S[1] - 0.5, H[1] - 0.25), S[2] + 0.2];   // the elbow sticks out at the side: a clearly bent arm
    // forehead: fingertips at the middle of the forehead, the fist just below them on the near side
    const wf = smooth(clamp01((A.H[1] - (head[1] - R0 * 0.6)) / 0.45));
    if (wf > 0) {
      const tip = [head[0] + Math.sin(fyF) * R0 * 0.55, head[1] + R0 * 0.42, head[2] + R0];
      const E0 = elbowAt(tip), dx = tip[0] - E0[0], dy = tip[1] - E0[1], L = Math.hypot(dx, dy) || 1;
      const fist = [tip[0] - dx / L * 0.3, tip[1] - dy / L * 0.3, tip[2]];
      A.H = A.H.map((v, k) => lerp(v, fist[k], wf));
    }
    // bend the elbow whenever the hand is up at the chest, the forehead or a shoulder
    const wb = smooth(clamp01((A.H[1] - (S[1] - 0.9)) / 0.4));
    if (wb > 0) {
      const Eb = elbowAt(A.H);
      const E = A.E.map((v, k) => lerp(v, Eb[k], wb));
      { const dx = A.H[0] - E[0], dy = A.H[1] - E[1], l = Math.hypot(dx, dy) || 1, r = Math.min(0.11, l * 0.3); A.W = [A.H[0] - dx / l * r, A.H[1] - dy / l * r, A.H[2]]; }   // the cuff reaches the fist
      A.E = E; A.bent = wb;   // drawn as two pieces: upper arm, then the forearm in front
    }
  }
  const feet = {
    L: pt(0.24, 0, stride * 0.55), R: pt(-0.24, 0, -stride * 0.55),
  };
  feet.L[1] = Math.max(0, lower) + Math.max(0, -stride) * 0.25; feet.R[1] = Math.max(0, lower) + Math.max(0, stride) * 0.25;
  const blinkV = p.eyesClosed ? 1 : st.blink || 0;
  return {
    posture: post.k > 0.5 ? post.to : post.from, seat: st.seat || 0,
    p, yaw, faceYaw: yaw + p.headYaw * 0.8, back: Math.cos(yaw) < -0.25, lower: base, lap, lie, stride, arms, feet,
    head: [head[0], head[1], HEAD_R * (look.headScale || 1)], headDepth: head[2], neck, pt,
    hands: { R: arms.R.H, L: arms.L.H }, handShape,
    emotion: st.emotion || 'neutral', mouth: rest ? 0 : st.mouth || 0, blink: blinkV, roll: p.headRoll, pitch: hp, walkPhase: walk ? walk.phase : 0, walkAmt: walk ? walk.amount : 0,
  };
}

// ---------------------------------------------------------------- drawing
export function drawPerson(g, lookIn, pose, opts = {}) {
  const look = lookIn.__resolved ? lookIn : resolveLook2d(lookIn);
  const lw = opts.lw ?? 0.055;
  const prevInk = look.ink ? setInk(col(look.ink)) : null;
  try { drawPersonInked(g, look, pose, opts, lw); } finally { if (prevInk) setInk(prevInk); }
}
function drawPersonInked(g, look, pose, opts, lw) {
  g.save();
  if (pose.lie > 0.01) { g.translate(0, 0.45); g.rotate((pose.yaw >= 0 ? -1 : 1) * pose.lie * Math.PI / 2); g.translate(0, -0.45 * (1 - pose.lie)); }
  if (look.figure === 'pateric') { drawPateric(g, look, pose, opts, lw); g.restore(); return; }
  const parts = [];
  for (const side of ['R', 'L']) {
    const A = pose.arms[side];
    let d = (A.S[2] + A.H[2]) / 2 + 0.06, dh = d;
    // a hand raised to the face or busy with a gesture (sign of the cross, pointing) is always seen, like in a drawing:
    // the sleeve goes in front of the body but behind the head, the hand in front of everything
    // a hand making the sign of the cross: the whole arm is in front of the body, the beard and the face
    if (pose.handShape?.[side] || A.H[1] - pose.lower > 2.35) { d = 0.1; dh = 0.3; }
    if (pose.handShape?.[side] === 'cross') { d = 0.25; dh = 0.3; }
    parts.push({ d, draw: () => drawArm(g, look, pose, A, lw, null, 'sleeve') });
    parts.push({ d: dh + 0.001, draw: () => drawArm(g, look, pose, A, lw, opts.hold, 'hand') });
  }
  parts.push({ d: -0.2, draw: () => drawFeet(g, look, pose, lw) });
  parts.push({ d: 0, draw: () => drawBody(g, look, pose, lw) });
  parts.push({ d: 0.16, draw: () => drawHead(g, look, pose, lw) });
  parts.sort((a, b) => a.d - b.d);
  for (const x of parts) x.draw();
  g.restore();
}

function robeColors(look) {
  const c = col(look.robe, '#7b5236');
  return { base: c, light: shade(c, 0.22), dark: shade(c, -0.28), deep: shade(c, -0.45) };
}

function drawFeet(g, look, pose, lw) {
  if (pose.lap > 0.5) return;
  const sy = Math.sin(pose.yaw);
  for (const side of ['L', 'R']) {
    const f = pose.feet[side];
    const x = f[0] + sy * 0.1, y = f[1] + 0.07;
    ellipse(g, x, y, 0.17 + 0.13 * Math.abs(sy), 0.1); inked(g, col(look.skin), lw * 0.8);
    // sandal: a sole and a strap
    g.beginPath(); g.moveTo(x - 0.17 - 0.13 * Math.abs(sy), y - 0.06); g.lineTo(x + 0.17 + 0.13 * Math.abs(sy), y - 0.06);
    g.lineWidth = lw * 1.4; g.strokeStyle = col(look.sandals || 'brown'); g.stroke();
    g.beginPath(); g.moveTo(x - 0.08, y + 0.08); g.quadraticCurveTo(x, y - 0.02, x + 0.08, y + 0.08);
    g.lineWidth = lw * 1.1; g.stroke();
  }
}

function bodyWidth(y, hemY) {
  // half-width of the robe at height y (local, before lowering): round shoulders, soft A-line skirt
  const keys = [[NECK_Y, 0.27], [2.72, 0.5], [2.5, 0.6], [2.0, 0.6], [WAIST, 0.62], [hemY, 0.95]];
  if (y >= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (y >= keys[i][0]) { const [y0, w0] = keys[i - 1], [y1, w1] = keys[i]; const u = (y0 - y) / (y0 - y1); return lerp(w0, w1, smooth(u)); }
  }
  return keys[keys.length - 1][1];
}

function drawBody(g, look, pose, lw) {
  const C = robeColors(look);
  const sy = Math.sin(pose.yaw), cy = Math.cos(pose.yaw);
  const lap = pose.lap;
  const hemLocal = lerp(0.24, 1.0 - 0.05, lap);       // seated: the robe ends at the lap
  const hemW = lerp(0.95, 1.3, lap);
  const sway = pose.walkAmt * 0.08 * Math.sin(pose.walkPhase * 2);
  const ys = [NECK_Y, 2.78, 2.68, 2.5, 2.2, 1.9, WAIST, 1.1, 0.7, hemLocal].filter((y) => y >= hemLocal - 1e-6);
  const left = [], right = [];
  for (const y of ys) {
    let w = bodyWidth(y, hemLocal);
    if (y < WAIST) w = lerp(0.62, hemW, smooth((WAIST - y) / (WAIST - hemLocal)));
    const c = pose.pt(0, y, 0);
    const sw = y < WAIST ? sway * (WAIST - y) / WAIST : 0;
    left.push([c[0] - w + sw, c[1]]); right.push([c[0] + w + sw, c[1]]);
  }
  const hem = pose.pt(0, hemLocal, 0);
  if (lap > 0.5) {
    // seated cross-legged: the robe makes a round lap with the knees out to the sides
    const wi = ys.indexOf(WAIST);
    left.length = wi + 1; right.length = wi + 1;
    const c = pose.pt(0, WAIST, 0);
    const kneeY = hem[1] + 0.32;
    left.push([c[0] - 0.95, c[1] - 0.3], [c[0] - 1.3, kneeY], [c[0] - 1.22, hem[1] + 0.03]);
    right.push([c[0] + 0.95, c[1] - 0.3], [c[0] + 1.3, kneeY], [c[0] + 1.22, hem[1] + 0.03]);
  }
  g.beginPath();
  curve(g, left, 0.6);
  // hem: a soft wavy edge, a little rounder when seated (the lap)
  const hl = left[left.length - 1], hr = right[right.length - 1];
  const dip = lap > 0.5 ? 0.02 : 0.06;
  g.bezierCurveTo(hl[0] + 0.3, hem[1] - dip - 0.05, hr[0] - 0.3, hem[1] - dip - 0.05, hr[0], hr[1]);
  const rr = right.slice().reverse();
  for (let i = 1; i < rr.length; i++) {
    const p0 = rr[Math.max(0, i - 2)], p1 = rr[i - 1], p2 = rr[i], p3 = rr[Math.min(rr.length - 1, i + 1)];
    g.bezierCurveTo(p1[0] + (p2[0] - p0[0]) * 0.2, p1[1] + (p2[1] - p0[1]) * 0.2, p2[0] - (p3[0] - p1[0]) * 0.2, p2[1] - (p3[1] - p1[1]) * 0.2, p2[0], p2[1]);
  }
  g.closePath();
  const top = pose.pt(0, NECK_Y, 0);
  const gr = g.createLinearGradient(top[0] - 0.9, top[1] + 0.3, top[0] + 0.9, hem[1] - 0.4);
  gr.addColorStop(0, C.light); gr.addColorStop(0.45, C.base); gr.addColorStop(1, C.dark);
  inked(g, gr, lw);

  // inside the robe: folds, collar, belt
  g.save(); g.clip();
  // soft shadow on the side away from the light
  const sh = g.createLinearGradient(top[0] + 0.1, 0, top[0] + 1.1, 0);
  sh.addColorStop(0, rgba(C.deep, 0)); sh.addColorStop(1, rgba(C.deep, 0.35));
  g.fillStyle = sh; g.fillRect(top[0] - 2, hem[1] - 1, 4, 5);
  // folds from the belt down
  if (lap < 0.5) {
    g.strokeStyle = rgba(C.deep, 0.45); g.lineWidth = lw * 0.8;
    for (const u of [-0.55, -0.1, 0.35, 0.7]) {
      const w0 = pose.pt(u * 0.55, WAIST - 0.1, 0), w1 = pose.pt(u * 0.95 + sway, hemLocal + 0.05, 0);
      g.beginPath(); g.moveTo(w0[0], w0[1]); g.quadraticCurveTo(lerp(w0[0], w1[0], 0.5) + 0.06, lerp(w0[1], w1[1], 0.5), w1[0], w1[1]); g.stroke();
    }
  } else {
    // seated: the crossed shins under the robe
    g.strokeStyle = rgba(C.deep, 0.45); g.lineWidth = lw * 0.9;
    g.beginPath(); g.moveTo(hem[0] - 1.15, hem[1] + 0.3); g.quadraticCurveTo(hem[0] - 0.2, hem[1] + 0.05, hem[0] + 0.35, hem[1] + 0.22); g.stroke();
    g.beginPath(); g.moveTo(hem[0] + 1.15, hem[1] + 0.3); g.quadraticCurveTo(hem[0] + 0.2, hem[1] + 0.05, hem[0] - 0.35, hem[1] + 0.22); g.stroke();
  }
  if (!pose.back) {
    // collar: the lighter under-tunic in a V at the neck
    const nx = top[0] + sy * 0.18, nw = 0.24 * (0.5 + 0.5 * cy);
    const v = pose.pt(sy * 0.1, 2.38, 0.3);
    g.beginPath(); g.moveTo(nx - nw, top[1] - 0.02); g.lineTo(v[0], v[1]); g.lineTo(nx + nw, top[1] - 0.02); g.closePath();
    inked(g, col(look.collar || 'cream'), lw * 0.7);
    g.beginPath(); g.moveTo(nx - nw - 0.08, top[1] + 0.02); g.lineTo(v[0], v[1] - 0.06); g.lineTo(nx + nw + 0.08, top[1] + 0.02);
    g.strokeStyle = C.dark; g.lineWidth = lw * 1.3; g.stroke();
  }
  if (look.mantle && !pose.back) drawMantle(g, look, pose, lw, sy);
  if (look.print === 'tunic' && look.stripe) {
    g.strokeStyle = col(look.stripe); g.lineWidth = 0.09;
    for (const u of [-0.22, 0.22]) { const a = pose.pt(u + sy * 0.25, 2.7, 0), b = pose.pt(u * 1.4 + sy * 0.35, hemLocal, 0); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
  }
  // belt: a rope (monks) or a sash
  const bl = pose.pt(0, WAIST + 0.08, 0), bw = bodyWidth(WAIST, hemLocal) + 0.05;
  g.beginPath(); g.moveTo(bl[0] - bw, bl[1] + 0.05); g.quadraticCurveTo(bl[0], bl[1] - 0.09, bl[0] + bw, bl[1] + 0.05);
  g.lineWidth = look.print === 'robe' ? 0.1 : 0.16; g.strokeStyle = col(look.belt || (look.print === 'robe' ? 'tan' : 'reddishBrown')); g.stroke();
  g.lineWidth = lw * 0.6; g.strokeStyle = rgba(INK, 0.6); g.stroke();
  g.restore();
  // rope ends hanging from a knot at the front side
  const ka = 0.55 + pose.yaw;
  if (Math.cos(ka) > 0.1 && look.print === 'robe') {
    const kx = bl[0] + Math.sin(ka) * bw * 0.95, ky = bl[1] - 0.02;
    g.strokeStyle = col(look.belt || 'tan'); g.lineCap = 'round';
    for (const [dx, len] of [[-0.05, 0.62], [0.06, 0.5]]) {
      const swing = 0.06 * Math.sin(pose.walkPhase * 2 + dx * 20) * pose.walkAmt;
      g.beginPath(); g.moveTo(kx, ky); g.quadraticCurveTo(kx + dx, ky - len * 0.5, kx + dx * 1.6 + swing, ky - len);
      g.lineWidth = 0.08; g.stroke();
      g.lineWidth = lw * 0.5; g.strokeStyle = rgba(INK, 0.6); g.stroke(); g.strokeStyle = col(look.belt || 'tan');
    }
    ellipse(g, kx, ky, 0.09, 0.07); inked(g, col(look.belt || 'tan'), lw * 0.6);
  }
  if (lap > 0.5 && !pose.back) {
    for (const sx of [-1, 1]) {
      ellipse(g, hem[0] + sx * 0.34, hem[1] + 0.14, 0.17, 0.11, sx * 0.3); inked(g, col(look.skin), lw * 0.8);
      g.beginPath(); g.ellipse(hem[0] + sx * 0.34, hem[1] + 0.14, 0.17, 0.11, sx * 0.3, Math.PI * 1.1, Math.PI * 1.9); g.strokeStyle = col(look.sandals || 'brown'); g.lineWidth = lw * 1.3; g.stroke();
    }
  }
  if (look.cross && !pose.back) {
    const c = pose.pt(sy * 0.12, 2.15, 0.6);
    g.strokeStyle = col('gold'); g.lineWidth = 0.035;
    const n1 = pose.pt(-0.2 + sy * 0.1, 2.8, 0), n2 = pose.pt(0.2 + sy * 0.1, 2.8, 0);
    g.beginPath(); g.moveTo(n1[0], n1[1]); g.quadraticCurveTo(c[0], c[1] + 0.05, n2[0], n2[1]); g.stroke();
    g.fillStyle = col('gold'); g.strokeStyle = shade('gold', -0.4); g.lineWidth = lw * 0.5;
    g.beginPath(); g.rect(c[0] - 0.04, c[1] - 0.3, 0.08, 0.32); g.rect(c[0] - 0.13, c[1] - 0.1, 0.26, 0.07); g.fill(); g.stroke();
  }
}

// a monk's short mantle over the shoulders (the lighter capelet of the reference): round over both shoulders,
// open in a V down the chest, its hem a soft curve above the belt
function drawMantle(g, look, pose, lw, sy) {
  const c = col(look.mantle === true ? shade(look.robe, 0.12) : look.mantle);
  const P = (x, y) => pose.pt(x + sy * 0.12 * (y > 2 ? 1 : 0.5), y, 0);
  const pts = [P(-0.28, NECK_Y + 0.02), P(-0.6, 2.72), P(-0.72, 2.25), P(-0.6, 1.86)];
  const ptsR = [P(0.6, 1.86), P(0.72, 2.25), P(0.6, 2.72), P(0.28, NECK_Y + 0.02)];
  const v = P(0, 1.78);
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  g.quadraticCurveTo(pts[1][0], pts[1][1] + 0.05, pts[2][0], pts[2][1]); g.quadraticCurveTo(pts[3][0] - 0.05, pts[3][1], pts[3][0] + 0.15, pts[3][1] - 0.04);
  g.quadraticCurveTo(v[0] - 0.3, v[1] - 0.02, v[0], v[1]); g.quadraticCurveTo(v[0] + 0.3, v[1] - 0.02, ptsR[0][0] - 0.15, ptsR[0][1] - 0.04);
  g.quadraticCurveTo(ptsR[0][0] + 0.05, ptsR[0][1], ptsR[1][0], ptsR[1][1]); g.quadraticCurveTo(ptsR[2][0], ptsR[2][1] + 0.05, ptsR[3][0], ptsR[3][1]);
  // the V opening at the neck
  const n = P(0, 2.3);
  g.lineTo(n[0] + 0.05, n[1]); g.lineTo(n[0] - 0.05, n[1]); g.closePath();
  const gr = g.createLinearGradient(pts[1][0], pts[1][1], ptsR[1][0], ptsR[0][1]);
  gr.addColorStop(0, shade(c, 0.14)); gr.addColorStop(0.6, c); gr.addColorStop(1, shade(c, -0.18));
  inked(g, gr, lw * 0.9);
  // two soft folds from the shoulders to the V (the light edges of the reference)
  g.strokeStyle = rgba(shade(c, 0.45), 0.55); g.lineWidth = lw * 0.9;
  for (const sx of [-1, 1]) { const a = P(sx * 0.5, 2.6), b = P(sx * 0.12, 1.9); g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(lerp(a[0], b[0], 0.4), lerp(a[1], b[1], 0.6), b[0], b[1]); g.stroke(); }
}

function drawArm(g, look, pose, A, lw, hold, part) {
  const C = robeColors(look);
  if (part === 'hand') return drawHand(g, look, pose, A, lw, hold);
  const far = A.S[2] + A.H[2] < -0.15;
  const fill = far ? C.dark : C.base;
  const dx = A.W[0] - A.S[0], dy = A.W[1] - A.S[1], L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  const ws = 0.2, wm = 0.21, wc = 0.29;
  const E = A.E;
  if (A.bent) {
    // a bent arm: the upper arm (shoulder → elbow) and the forearm (elbow → wide cuff), each a soft tube
    const tube = (a, b, wa, wb, f) => {
      const ex = b[0] - a[0], ey = b[1] - a[1], l = Math.hypot(ex, ey) || 1, qx = -ey / l, qy = ex / l;
      g.beginPath(); g.moveTo(a[0] + qx * wa, a[1] + qy * wa); g.lineTo(b[0] + qx * wb, b[1] + qy * wb);
      g.lineTo(b[0] - qx * wb, b[1] - qy * wb); g.lineTo(a[0] - qx * wa, a[1] - qy * wa);
      g.arc(a[0], a[1], wa, Math.atan2(-qy, -qx), Math.atan2(qy, qx), false); g.closePath(); inked(g, f, lw);
      return [qx, qy, l, ex / l, ey / l];
    };
    tube(A.S, E, ws, 0.18, fill);
    const [qx, qy, , ux, uy] = tube(E, A.W, 0.18, 0.24, fill);
    g.beginPath(); g.moveTo(E[0] + ux * 0.15 + qx * 0.03, E[1] + uy * 0.15 + qy * 0.03); g.lineTo(A.W[0] - ux * 0.08 + qx * 0.1, A.W[1] - uy * 0.08 + qy * 0.1);
    g.strokeStyle = rgba(C.deep, 0.5); g.lineWidth = lw * 0.7; g.stroke();
    ellipse(g, A.W[0], A.W[1], 0.21, 0.07, Math.atan2(qy, qx)); inked(g, C.deep, lw * 0.6);
    return;
  }
  g.beginPath();
  g.moveTo(A.S[0] + nx * ws, A.S[1] + ny * ws);
  g.quadraticCurveTo(E[0] + nx * wm, E[1] + ny * wm, A.W[0] + nx * wc, A.W[1] + ny * wc);
  g.quadraticCurveTo(A.W[0] + dx / L * 0.06, A.W[1] + dy / L * 0.06, A.W[0] - nx * wc, A.W[1] - ny * wc);
  g.quadraticCurveTo(E[0] - nx * wm, E[1] - ny * wm, A.S[0] - nx * ws, A.S[1] - ny * ws);
  g.arc(A.S[0], A.S[1], ws, Math.atan2(-ny, -nx), Math.atan2(ny, nx), false);
  g.closePath();
  inked(g, fill, lw);
  // fold line along the sleeve
  g.beginPath(); g.moveTo(lerp(A.S[0], A.W[0], 0.3) + nx * 0.04, lerp(A.S[1], A.W[1], 0.3) + ny * 0.04);
  g.quadraticCurveTo(E[0] - nx * 0.04, E[1] - ny * 0.04, lerp(A.S[0], A.W[0], 0.85) - nx * 0.1, lerp(A.S[1], A.W[1], 0.85) - ny * 0.1);
  g.strokeStyle = rgba(C.deep, 0.5); g.lineWidth = lw * 0.7; g.stroke();
  // cuff opening
  ellipse(g, A.W[0] + dx / L * 0.02, A.W[1] + dy / L * 0.02, wc * 0.9, 0.08, Math.atan2(ny, nx));
  inked(g, C.deep, lw * 0.6);
}

function drawHand(g, look, pose, A, lw, hold) {
  if (hold) hold(A.side, A.H[0], A.H[1], A.H[2]);
  // mitten hand with a thumb
  const hx = A.H[0], hy = A.H[1];
  const skin = col(look.skin);
  if (A.bent) {
    // a wrist coming out of the cuff, so the hand is joined to the sleeve
    const dx = hx - A.W[0], dy = hy - A.W[1], l = Math.hypot(dx, dy) || 1, qx = -dy / l * 0.085, qy = dx / l * 0.085;
    const bx = A.W[0] - dx / l * 0.04, by = A.W[1] - dy / l * 0.04;
    g.beginPath(); g.moveTo(bx + qx, by + qy); g.lineTo(hx + qx, hy + qy); g.lineTo(hx - qx, hy - qy); g.lineTo(bx - qx, by - qy); g.closePath();
    inked(g, shade(skin, -0.05), lw * 0.8);
  }
  const up = Math.sin(pose.yaw) >= 0 ? 1 : -1;
  ellipse(g, hx + up * 0.11, hy + 0.05, 0.065, 0.1, up * 0.6); inked(g, skin, lw * 0.8);
  const shape = pose.handShape?.[A.side];
  if (shape) {
    // fingers out of the fist, along the arm: three joined fingertips (cross) or one pointing finger
    const fx = A.d ? 0 : 0, dl = Math.hypot(A.H[0] - A.W[0], A.H[1] - A.W[1]) || 1;
    let ux = (A.H[0] - A.W[0]) / dl, uy = (A.H[1] - A.W[1]) / dl;
    const len = shape === 'cross' ? 0.2 : 0.26, wid = shape === 'cross' ? 0.075 : 0.05;
    ellipse(g, hx + ux * (0.12 + len / 2) + fx, hy + uy * (0.12 + len / 2), len / 2 + 0.02, wid, Math.atan2(uy, ux)); inked(g, skin, lw * 0.8);
    if (shape === 'cross') { g.beginPath(); g.moveTo(hx + ux * 0.16 - uy * 0.03, hy + uy * 0.16 + ux * 0.03); g.lineTo(hx + ux * 0.3 - uy * 0.03, hy + uy * 0.3 + ux * 0.03); g.strokeStyle = rgba(INK, 0.5); g.lineWidth = lw * 0.5; g.stroke(); }
  }
  ellipse(g, hx, hy, 0.15, 0.16); inked(g, skin, lw * 0.9);
  g.beginPath(); g.arc(hx - 0.03, hy + 0.04, 0.07, Math.PI * 0.9, Math.PI * 1.4); g.strokeStyle = rgba('#ffffff', 0.5); g.lineWidth = lw * 0.6; g.stroke();
}

// ---------------------------------------------------------------- head & face
// gentle eye (style "pateric"): a small dark almond with one sparkle under a fine lid line, never a big white eye;
// warm = peaceful lowered lids (the reference's closed, down-curved eyes), joy = smiling arcs, sad / ashamed = heavy lids
function gentleEye(g, look, pose, x, y, rx, ry, a, f, lw, ink, skin) {
  const em = pose.emotion, [open0, tilt, , gdown] = EYES[em] || EYES.neutral;
  const w = rx * 0.95;
  g.lineCap = 'round';
  const closed = em === 'warm' || pose.blink > 0.7 || pose.p.eyesClosed;
  if (closed || em === 'joy') {
    g.beginPath(); g.moveTo(x - w, y + 0.01);
    if (em === 'joy' && !closed) g.quadraticCurveTo(x, y + ry * 0.75, x + w, y + 0.01);   // ^ smiling
    else g.quadraticCurveTo(x, y - ry * 0.55, x + w, y + 0.01);                             // ‿ lowered, peaceful
    g.strokeStyle = ink; g.lineWidth = lw * 1.25; g.stroke();
    return;
  }
  const open = Math.min(1.15, open0) * (1 - pose.blink);
  const h = ry * 0.62 * open;
  // the almond: white only as a thin rim around a big dark iris
  g.save();
  g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x, y + h * 1.25, x + w, y); g.quadraticCurveTo(x, y - h * 0.95, x - w, y); g.closePath();
  g.fillStyle = '#f6efe4'; g.fill(); g.clip();
  const ix = x + (pose.p.gazeX * 0.3 + Math.sin(pose.faceYaw) * 0.2) * w, iy = y - (pose.p.gazeY + gdown) * h * 0.4 + h * 0.08;
  const ir = Math.min(w * 0.58, ry * 0.5);
  ellipse(g, ix, iy, ir, ir); g.fillStyle = col(look.eyeColor || '#4a3226'); g.fill();
  ellipse(g, ix, iy, ir * 0.55, ir * 0.55); g.fillStyle = '#23170f'; g.fill();
  ellipse(g, ix - ir * 0.3, iy + ir * 0.35, ir * 0.24, ir * 0.24); g.fillStyle = '#ffffff'; g.fill();
  g.restore();
  // upper lid line (heavier, tilted for sad / angry), a faint lower one
  const tl = tilt * h * 0.5 * Math.sign(a);
  g.beginPath(); g.moveTo(x - w * 1.08, y - tl * 0.5); g.quadraticCurveTo(x, y + h * 1.3 + 0.01, x + w * 1.08, y + tl * 0.5);
  g.strokeStyle = ink; g.lineWidth = lw * (0.9 + 0.4 * (1 - Math.min(1, open))); g.stroke();
  g.beginPath(); g.moveTo(x - w * 0.8, y - h * 0.5); g.quadraticCurveTo(x, y - h * 1.0, x + w * 0.8, y - h * 0.5);
  g.strokeStyle = rgba(ink, 0.3); g.lineWidth = lw * 0.5; g.stroke();
  void f; void skin;
}

const SMILE = { happy: 1, joy: 1.3, warm: 0.9, neutral: 0.5, thinking: 0.05, surprised: 0, sad: -0.7, sick: -0.4, sleepy: 0.2, asleep: 0.25, angry: -0.6, ashamed: -0.35 };
// eyes: open amount, lid tilt (+ = angry inner-down, − = sad outer-down), closed smiling arcs, gaze down
const EYES = {
  neutral: [1, 0, 0, 0], happy: [0.85, 0, 0, 0], joy: [1, 0, 0, 0], warm: [0, 0, 1, 0], sad: [0.72, -0.5, 0, 0.35],
  surprised: [1.18, 0, 0, 0], thinking: [0.85, 0, 0, -0.5], sick: [0.5, -0.2, 0, 0.2], sleepy: [0.35, 0, 0, 0.2], asleep: [0.0, 0, 0, 0.2],
  angry: [0.7, 0.6, 0, 0], ashamed: [0.55, -0.4, 0, 0.9],
};

function drawHead(g, look, pose, lw) {
  const [hx, hy, R] = pose.head;
  const fy = pose.faceYaw;
  const sf = Math.sin(fy), cf = Math.cos(fy);
  const skin = col(look.skin);
  const elder = look.age === 'elder';
  g.save();
  g.translate(hx, hy); g.rotate(-pose.roll * Math.cos(pose.yaw) - pose.pitch * Math.sin(pose.yaw) * 0.5); g.translate(-hx, -hy);
  const hatC = col(look.hatColor || 'black');
  const hooded = look.hat === 'hood' || look.hat === 'headscarf';

  // --- behind the head: hood / scarf drape, veil, long hair
  if (hooded) {
    const c = look.hat === 'hood' ? hatC : col(look.hatColor || 'white');
    g.beginPath();
    blob(g, [[hx - R * 1.15, hy + R * 0.2], [hx, hy + R * 1.22], [hx + R * 1.15, hy + R * 0.2], [hx + R * 1.05 - sf * 0.3, hy - R * 1.6], [hx - R * 1.05 - sf * 0.3, hy - R * 1.6]], 0.7);
    inked(g, shade(c, -0.12), lw);
  }
  if (look.hat === 'kamilavka' && look.veil !== false) {
    g.beginPath(); g.moveTo(hx - R * 1.0, hy + R * 0.9); g.quadraticCurveTo(hx - R * 1.25 - sf * 0.2, hy - R * 0.6, hx - R * 1.05 - sf * 0.35, hy - R * 1.75);
    g.lineTo(hx + R * 1.05 - sf * 0.35, hy - R * 1.75); g.quadraticCurveTo(hx + R * 1.25 - sf * 0.2, hy - R * 0.6, hx + R * 1.0, hy + R * 0.9); g.closePath();
    inked(g, shade(hatC, 0.08), lw);
  }
  if (look.hair === 'long' && !hooded) {
    g.beginPath(); blob(g, [[hx - R * 1.02, hy + R * 0.3], [hx, hy + R * 1.08], [hx + R * 1.02, hy + R * 0.3], [hx + R * 0.95, hy - R * 1.3], [hx - R * 0.95, hy - R * 1.3]], 0.7);
    inked(g, col(look.hairColor || 'brown'), lw);
  }

  // --- ears (peeking at the sides; the near one sits on the head in a three-quarter view)
  const ear = (a) => {
    const x = hx + R * 0.98 * Math.sin(a + fy), y = hy - R * 0.08;
    ellipse(g, x, y, 0.11 * (0.4 + 0.6 * Math.abs(Math.sin(a + fy))), 0.16); inked(g, skin, lw * 0.9);
    ellipse(g, x, y, 0.06 * Math.abs(Math.sin(a + fy)), 0.1); g.fillStyle = shade(skin, -0.18); g.fill();
  };
  const ears = [-Math.PI / 2, Math.PI / 2].map((a) => ({ a, d: Math.cos(a + fy) }));
  if (!hooded) for (const e of ears) if (e.d <= 0.35 && e.d > -0.6) ear(e.a);

  // --- the head
  ellipse(g, hx, hy, R * 1.0, R * 0.96);
  const hg = g.createRadialGradient(hx - R * 0.35, hy + R * 0.35, R * 0.15, hx, hy, R * 1.05);
  hg.addColorStop(0, shade(skin, 0.18)); hg.addColorStop(0.7, skin); hg.addColorStop(1, shade(skin, -0.1));
  inked(g, hg, lw);
  if (!hooded) for (const e of ears) if (e.d > 0.35) ear(e.a);

  if (cf > -0.15 && !pose.back) drawCheeks(g, look, pose, hx, hy, R, fy);
  // --- hair (under the cap)
  if (look.hair && !hooded) drawHair(g, look, hx, hy, R, faceYaw2d(fy), lw, pose.back);   // the same turn as the face

  // --- face
  const faceVis = cf > -0.15 && !pose.back;
  if (faceVis) drawFace(g, look, pose, hx, hy, R, fy, lw, elder);
  else if (look.beard && look.beard !== 'none') {
    // from behind: just the edges of the beard
  }

  // --- headwear in front
  if (look.hat === 'skufia') {
    const cx = hx - sf * R * 0.08, cyy = hy + R * 0.56;   // high enough that the brows show
    g.beginPath(); g.ellipse(cx, cyy, R * 1.05, R * 0.72, 0, Math.PI * 0.02, Math.PI * 0.98, false);
    g.quadraticCurveTo(cx, cyy + R * 0.12, cx + R * 1.05 * Math.cos(Math.PI * 0.02), cyy + R * 0.72 * Math.sin(Math.PI * 0.02));
    g.closePath();
    const sg = g.createLinearGradient(cx - R, cyy + R * 0.7, cx + R, cyy);
    sg.addColorStop(0, shade(hatC, 0.35)); sg.addColorStop(1, hatC);
    inked(g, sg, lw);
    g.beginPath(); g.ellipse(cx, cyy + R * 0.02, R * 0.98, R * 0.62, 0, Math.PI * 0.12, Math.PI * 0.88); g.strokeStyle = rgba('#ffffff', 0.18); g.lineWidth = lw * 0.6; g.stroke();
  } else if (look.hat === 'kamilavka') {
    const b = hy + R * 0.7, tp = hy + R * 1.6, cx = hx - sf * R * 0.06;   // brim above the brows
    g.beginPath(); g.moveTo(cx - R * 0.98, b); g.lineTo(cx - R * 1.06, tp); g.ellipse(cx, tp, R * 1.06, R * 0.18, 0, Math.PI, 0, true); g.lineTo(cx + R * 0.98, b);
    g.quadraticCurveTo(cx, b - R * 0.16, cx - R * 0.98, b); g.closePath();
    const kg = g.createLinearGradient(cx - R, 0, cx + R, 0); kg.addColorStop(0, shade(hatC, 0.3)); kg.addColorStop(0.5, hatC); kg.addColorStop(1, shade(hatC, -0.2));
    inked(g, kg, lw);
    ellipse(g, cx, tp, R * 1.06, R * 0.18); inked(g, shade(hatC, 0.2), lw * 0.8);
  } else if (hooded) {
    // the hood frames the face: a soft band over the forehead and down both cheeks
    const c = look.hat === 'hood' ? hatC : col(look.hatColor || 'white');
    const fx = hx + sf * R * 0.25;
    g.beginPath();
    g.moveTo(hx - R * 1.12, hy - R * 0.5);
    g.quadraticCurveTo(hx - R * 1.2, hy + R * 1.25, hx, hy + R * 1.2);
    g.quadraticCurveTo(hx + R * 1.2, hy + R * 1.25, hx + R * 1.12, hy - R * 0.5);
    g.lineTo(hx + R * 0.86 + sf * 0.15, hy - R * 0.55);
    g.quadraticCurveTo(fx + R * 0.95, hy + R * 0.85, fx, hy + R * 0.66);
    g.quadraticCurveTo(fx - R * 0.95, hy + R * 0.85, hx - R * 0.86 + sf * 0.15, hy - R * 0.55);
    g.closePath();
    inked(g, c, lw);
    if (look.hat === 'headscarf' && look.bandColor) {
      g.beginPath(); g.moveTo(fx - R * 0.9, hy + R * 0.66); g.quadraticCurveTo(fx, hy + R * 0.92, fx + R * 0.9, hy + R * 0.66);
      g.strokeStyle = col(look.bandColor); g.lineWidth = 0.1; g.stroke();
    }
  }
  g.restore();
}

function drawHair(g, look, hx, hy, R, fy, lw, back) {
  const hc = col(look.hairColor || 'brown');
  const sf = Math.sin(fy);
  g.save();
  ellipse(g, hx, hy, R * 1.0, R * 0.96); g.clip();
  g.beginPath();
  const N = 24;
  for (let i = 0; i <= N; i++) {
    const x = hx - R * 1.1 + (2.2 * R * i) / N;
    const u = (x - hx) / R - sf;                       // offset from the middle of the face
    let b;
    if (back) b = 1.2;
    else if (Math.abs(sf) < 0.15) b = Math.max(0, Math.abs(u) - 0.55) * 1.3;
    else b = Math.max(0, -u * Math.sign(sf) - 0.72) * 1.1;   // the side hair stops before the far eye
    const fr = 0.08 * Math.sin(i * 1.7);                // little locks along the fringe
    const y = hy + R * (0.54 - Math.min(1.2, b) + fr);   // the fringe stays above the brows, never over the eyes
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.lineTo(hx + R * 1.2, hy + R * 1.2); g.lineTo(hx - R * 1.2, hy + R * 1.2); g.closePath();
  const gg = g.createLinearGradient(hx, hy + R, hx, hy);
  gg.addColorStop(0, shade(hc, 0.2)); gg.addColorStop(1, hc);
  g.fillStyle = gg; g.fill();
  g.strokeStyle = rgba(shade(hc, -0.4), 0.6); g.lineWidth = lw * 0.6;
  for (const a of [-0.4, 0, 0.4]) { g.beginPath(); g.moveTo(hx + R * (a + sf * 0.3), hy + R * 0.95); g.quadraticCurveTo(hx + R * (a * 1.2 + sf * 0.2), hy + R * 0.8, hx + R * (a * 1.5 + sf * 0.4), hy + R * 0.66); g.stroke(); }   // strands end inside the hair, never on the brows
  g.restore();
  // a little volume above the head outline
  g.beginPath(); g.ellipse(hx, hy + R * 0.12, R * 1.04, R * 0.92, 0, Math.PI * 0.1, Math.PI * 0.9);
  g.strokeStyle = INK; g.lineWidth = lw; g.stroke();
  g.beginPath(); g.ellipse(hx, hy + R * 0.12, R * 1.02, R * 0.9, 0, Math.PI * 0.12, Math.PI * 0.88); g.strokeStyle = hc; g.lineWidth = lw * 1.4; g.stroke();
}

// the face turns less than the head: eyes, nose and mouth stay well inside the outline in a three-quarter view
// and both eyes keep almost the same size (a storybook cheat, like the cheat-out of the body)
export function faceYaw2d(fy) { return Math.sign(fy) * Math.min(Math.abs(fy), 1.3) * 0.6; }

// rosy cheeks: painted on the skin before the hair (so the hair covers them) and kept inside the head outline
function drawCheeks(g, look, pose, hx, hy, R, fy) {
  fy = faceYaw2d(fy);
  const em = pose.emotion, down = pose.pitch * 0.25;
  const F = (a, v) => [hx + R * 0.97 * Math.sin(a + fy), hy + R * (v - down), Math.cos(a + fy)];
  g.save(); ellipse(g, hx, hy, R * 0.94, R * 0.9); g.clip();
  // cheeks
  const cheekC = em === 'sick' ? 'rgba(140,190,110,0.5)' : em === 'angry' ? 'rgba(232,90,80,0.55)' : em === 'ashamed' ? 'rgba(245,110,120,0.62)' : 'rgba(246,140,140,0.42)';
  for (const a of [-0.72, 0.72]) {
    const [x, y, f] = F(a, -0.28);
    if (f < 0.1) continue;
    const r = R * 0.22 * (em === 'ashamed' ? 1.25 : 1);
    const cg = g.createRadialGradient(x, y, 0, x, y, r);
    cg.addColorStop(0, cheekC); cg.addColorStop(1, 'rgba(246,140,140,0)');
    g.fillStyle = cg; ellipse(g, x, y, r * (0.5 + 0.5 * f), r * 0.75); g.fill();
  }

  g.restore();
}

function drawFace(g, look, pose, hx, hy, R, fy, lw, elder) {
  fy = faceYaw2d(fy);
  const em = pose.emotion;
  const skin = col(look.skin);
  const ink = INK;
  const down = pose.pitch * 0.25;
  // a point on the face: horizontal angle a (0 = middle), height v (in head radii, 0 = centre)
  const F = (a, v) => [hx + R * 0.97 * Math.sin(a + fy), hy + R * (v - down), Math.cos(a + fy)];
  const [open0, tilt, arcs, gdown] = EYES[em] || EYES.neutral;
  const blink = pose.blink;
  // brows match the beard (a white / grey beard → white / grey brows, never dark ones), else the hair
  const bearded = look.beard && look.beard !== 'none';
  const browC = look.browColor ? col(look.browColor) : elder || bearded ? col(look.beardColor || (elder ? 'white' : 'brown')) : col(look.hairColor || 'darkBrown');
  const lightBrow = elder || ['white', 'gray', 'lightGray'].includes(look.beardColor);

  // eyes
  const eyeR = R * 0.2;    // a little smaller: calmer, less wide-eyed
  for (const a of [-0.42, 0.42]) {
    const [x, y, f] = F(a, 0.08);
    if (f < 0.05) continue;
    const rx = eyeR * 0.78 * (0.8 + 0.2 * f), ry = eyeR;
    const outer = Math.sign(a) * (Math.sin(fy) >= 0 ? 1 : 1);
    if (look.face === 'gentle') { gentleEye(g, look, pose, x, y, rx, ry, a, f, lw, ink, skin); continue; }
    if (arcs || blink > 0.85) {
      // closed: smiling arcs (joy, warm) or a soft resting line
      g.beginPath();
      if (arcs) g.arc(x, y - ry * 0.25, rx * 1.05, Math.PI * 0.15, Math.PI * 0.85);
      else { g.moveTo(x - rx, y); g.quadraticCurveTo(x, y - ry * 0.35, x + rx, y); }
      g.strokeStyle = ink; g.lineWidth = lw * 1.4; g.lineCap = 'round'; g.stroke();
      if (look.lashes) { g.beginPath(); g.moveTo(x + outer * rx, y); g.lineTo(x + outer * (rx + 0.06), y + 0.05); g.stroke(); }
      continue;
    }
    const open = open0 * (1 - blink);
    const ryo = ry * Math.min(1.18, open0);
    g.save();
    ellipse(g, x, y, rx, ryo); g.fillStyle = '#f6f0e6'; g.fill();
    g.clip();
    // iris + pupil + two sparkles
    const ix = x + (pose.p.gazeX * 0.35 + Math.sin(fy) * 0.25) * rx, iy = y - (pose.p.gazeY + gdown) * ry * 0.3 - ry * 0.12;
    const ir = rx * (em === 'surprised' ? 0.66 : 0.86);
    const irc = col(look.eyeColor || '#7a4a2c');
    ellipse(g, ix, iy, ir, ir * 1.08 * Math.min(1, ry / rx)); const ig = g.createRadialGradient(ix, iy - ir * 0.3, ir * 0.1, ix, iy, ir);
    ig.addColorStop(0, shade(irc, 0.1)); ig.addColorStop(1, shade(irc, -0.25)); g.fillStyle = ig; g.fill();   // a calm, matte iris (not glassy)
    ellipse(g, ix, iy, ir * 0.52, ir * 0.56); g.fillStyle = '#2a1c16'; g.fill();
    ellipse(g, ix - ir * 0.32, iy + ir * 0.34, ir * 0.17, ir * 0.17); g.fillStyle = 'rgba(255,255,255,0.7)'; g.fill();   // one small, soft highlight
    // upper lid: skin coming down (sad / sleepy / blinking), tilted for feelings
    const lidY = y + ryo - 2 * ryo * (1 - Math.min(1, open)) ;
    if (open < 0.99) {
      const tl = tilt * ryo * 0.6 * Math.sign(a);
      g.beginPath(); g.moveTo(x - rx * 1.2, lidY - tl); g.lineTo(x + rx * 1.2, lidY + tl); g.lineTo(x + rx * 1.2, y + ry * 1.5); g.lineTo(x - rx * 1.2, y + ry * 1.5); g.closePath();
      g.fillStyle = shade(skin, -0.04); g.fill();
      g.beginPath(); g.moveTo(x - rx * 1.2, lidY - tl); g.lineTo(x + rx * 1.2, lidY + tl); g.strokeStyle = rgba(ink, 0.6); g.lineWidth = lw * 0.6; g.stroke();   // soft: a dark lid line read as a dark brow
    }
    g.restore();
    // outline: a thicker upper lash line, a light lower one
    if (open >= 0.99) {
      // a thin, even line all around the white (a thick upper lash line read as a second, dark brow)
      ellipse(g, x, y, rx, ryo); g.strokeStyle = rgba(ink, 0.75); g.lineWidth = lw * 0.5; g.stroke(); g.strokeStyle = ink;
      if (look.lashes) {
        g.beginPath(); g.moveTo(x + outer * rx * 0.85, y + ryo * 0.5); g.lineTo(x + outer * (rx + 0.06), y + ryo * 0.68); g.lineWidth = lw * 1.1; g.stroke(); g.beginPath(); g.moveTo(x + outer * rx * 0.5, y + ryo * 0.88); g.lineTo(x + outer * (rx * 0.7), y + ryo + 0.07); g.stroke(); }
    }
    g.beginPath(); g.ellipse(x, y, rx, ryo, 0, Math.PI * 1.3, Math.PI * 1.7); g.strokeStyle = rgba(ink, 0.12); g.lineWidth = lw * 0.5; g.stroke();
    if (elder) { // one soft smile line at the outer corner
      g.beginPath(); g.arc(x + outer * (rx + 0.02), y - 0.02, 0.09, outer > 0 ? -0.9 : Math.PI - 0.5, outer > 0 ? -0.5 : Math.PI + 0.9 - 1.3);
      g.strokeStyle = rgba(ink, 0.28); g.lineWidth = lw * 0.55; g.stroke();
    }
  }

  // brows: a fine tapered arc that follows the top of the eye (thicker in the middle, pointed at the ends);
  // feelings tilt it around the eye (sad: inner end up, angry: inner end down) or lift it (surprised)
  for (const a of [-0.42, 0.42]) {
    const [ex, ey, f] = F(a, 0.08);
    if (f < 0.05) continue;
    const s = Math.sign(a);
    const rx = eyeR * 0.78 * (0.8 + 0.2 * f) * 1.3, ry = eyeR * Math.max(1, Math.min(1.18, open0 || 1)) * 1.0;
    let rot = 0, lift = lightBrow ? 0.15 : 0.1;
    if (em === 'sad' || em === 'sick' || em === 'ashamed') rot = -s * (em === 'sad' ? 0.32 : 0.22);
    if (em === 'angry') { rot = s * 0.3; lift = 0.04; }
    if (em === 'surprised') lift = 0.2;
    if (em === 'thinking' && a > 0) lift = 0.18;
    if (em === 'joy' || em === 'happy' || em === 'warm') lift = 0.14;
    const th = lightBrow ? 0.075 : 0.032;
    const N = 14, outer = [], inner = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, ang = Math.PI * (0.18 + 0.64 * u);
      const w = th * Math.pow(Math.sin(Math.PI * u), 0.7);
      const px = Math.cos(ang), py = Math.sin(ang);
      const pt = (k) => {
        let x = px * (rx + k), y = py * (ry + lift + k);
        const c = Math.cos(rot), sn = Math.sin(rot);
        return [ex + x * c - y * sn, ey + x * sn + y * c];
      };
      outer.push(pt(w)); inner.push(pt(-w * 0.6));
    }
    g.beginPath(); g.moveTo(outer[0][0], outer[0][1]);
    for (const q of outer.slice(1)) g.lineTo(q[0], q[1]);
    for (const q of inner.reverse()) g.lineTo(q[0], q[1]);
    g.closePath();
    if (lightBrow) inked(g, mix(browC, '#ffffff', 0.4), lw * 0.4, '#8f8078'); else { g.fillStyle = browC; g.fill(); }   // white brows: one shape with a fine grey edge so they show on the skin   // one soft stroke, no outline (an outline read as a second brow)
  }

  // sad: one small, gentle tear under the near eye
  if (em === 'sad') {
    const a = Math.sin(fy) >= 0 ? 0.42 : -0.42;
    const [x, y, f] = F(a, -0.2);
    if (f > 0.2) {
      g.beginPath(); g.moveTo(x, y + 0.1); g.quadraticCurveTo(x + 0.07, y - 0.03, x, y - 0.06); g.quadraticCurveTo(x - 0.07, y - 0.03, x, y + 0.1);
      inked(g, '#bfe3f7', lw * 0.6, '#5f8fb5');
      ellipse(g, x - 0.015, y - 0.02, 0.015, 0.02); g.fillStyle = '#ffffff'; g.fill();
    }
  }
  // nose: gentle style = a fine line down from between the brows with a small curl at the tip (like the reference)
  if (look.face === 'gentle') {
    const [x0, y0] = F(Math.sin(fy) * 0.05, 0.02), [x1, y1] = F(Math.sin(fy) * 0.12 - 0.02, -0.2);
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x1 - 0.02, (y0 + y1) / 2, x1 - 0.015, y1 + 0.01);
    g.quadraticCurveTo(x1 + 0.03, y1 - 0.04, x1 + 0.07, y1 - 0.005);
    g.strokeStyle = rgba(shade(skin, -0.45), 0.85); g.lineWidth = lw * 0.75; g.stroke();
    ellipse(g, x1 + 0.02, y1 + 0.03, R * 0.06, R * 0.045); g.fillStyle = rgba('#ffffff', 0.25); g.fill();
  } else {
    const [x, y, f] = F(0, -0.12);
    const nx = x + Math.sin(fy) * R * 0.06;
    ellipse(g, nx, y, R * 0.1, R * 0.085); g.fillStyle = shade(skin, -0.06); g.fill();
    g.beginPath(); g.arc(nx, y + R * 0.02, R * 0.1, Math.PI * (1.15 - 0.1 * Math.sin(fy)), Math.PI * (1.85 - 0.1 * Math.sin(fy)));
    g.strokeStyle = rgba(ink, 0.7); g.lineWidth = lw * 0.8; g.stroke();
    ellipse(g, nx - R * 0.03, y + R * 0.03, R * 0.03, R * 0.022); g.fillStyle = rgba('#ffffff', 0.6); g.fill();
    void f;
  }

  // beard (behind the mouth), then the mouth, then the moustache
  const beard = look.beard && look.beard !== 'none';
  const bc = col(look.beardColor || 'brown');
  const mouthV = beard ? -0.44 : -0.42;
  if (beard) {
    const long = look.beard === 'long';
    const sf = Math.sin(fy), cfw = 0.7 + 0.3 * Math.cos(fy);
    const cx = hx + sf * R * 0.6;
    const bot = hy - R * (long ? 1.8 : 1.15);
    const w = R * (long ? 0.8 : 0.78) * cfw;
    const pts = [
      [cx - w, hy - R * 0.05], [cx - w * 1.02, hy - R * 0.55], [cx - w * 0.8, bot + R * 0.4],
      [cx - w * 0.45, bot + R * 0.08], [cx, bot], [cx + w * 0.45, bot + R * 0.08], [cx + w * 0.8, bot + R * 0.4],
      [cx + w * 1.02, hy - R * 0.55], [cx + w, hy - R * 0.05], [cx + w * 0.55, hy - R * 0.32], [cx, hy - R * 0.3], [cx - w * 0.55, hy - R * 0.32],
    ];
    g.beginPath(); blob(g, pts, 0.55);
    const bg = g.createLinearGradient(cx - w, hy, cx + w, bot);
    bg.addColorStop(0, shade(bc, 0.25)); bg.addColorStop(1, shade(bc, -0.12));
    inked(g, bg, lw);
    // soft strands
    g.strokeStyle = rgba(shade(bc, -0.3), 0.3); g.lineWidth = lw * 0.55;
    for (const u of [-0.6, -0.25, 0.1, 0.45]) {
      g.beginPath(); g.moveTo(cx + u * w, hy - R * 0.55); g.quadraticCurveTo(cx + u * w * 1.1 + 0.05, (hy - R * 0.55 + bot) / 2, cx + u * w * 0.8, bot + R * (long ? 0.35 : 0.25)); g.stroke();
    }
  }
  {
    const [x, y, f] = F(0, mouthV);
    const k = SMILE[em] ?? 0.4;
    const open = clamp01(pose.mouth || 0);
    const w = R * (0.2 + Math.max(0, k) * 0.05) * (0.45 + 0.55 * f);
    g.lineCap = 'round';
    if (em === 'joy' && open < 0.15) {
      g.beginPath(); g.moveTo(x - w * 1.1, y + 0.02); g.quadraticCurveTo(x, y - R * 0.34, x + w * 1.1, y + 0.02); g.closePath();
      inked(g, '#8a3236', lw * 1.1);
      g.save(); g.clip(); ellipse(g, x, y - R * 0.3, w * 0.6, R * 0.12); g.fillStyle = '#f08a96'; g.fill();
      g.fillStyle = '#ffffff'; g.fillRect(x - w, y - R * 0.06, w * 2, R * 0.07); g.restore();
    } else if (open > 0.06 || em === 'surprised') {
      const h = em === 'surprised' && open < 0.06 ? R * 0.09 : R * (0.05 + open * 0.2);
      const ww = em === 'surprised' && open < 0.06 ? w * 0.4 : w * (0.75 + open * 0.2);
      ellipse(g, x, y - h * 0.35 - k * 0.015, ww, h);
      inked(g, '#8a3236', lw * 1.1);
      if (open > 0.3) { g.save(); ellipse(g, x, y - h * 0.35, ww, h); g.clip(); ellipse(g, x, y - h * 1.1, ww * 0.6, h * 0.5); g.fillStyle = '#f08a96'; g.fill(); g.fillStyle = '#ffffff'; g.fillRect(x - ww, y - h * 0.35 + h * 0.65, ww * 2, h * 0.3); g.restore(); }
    } else {
      g.beginPath();
      if (em === 'thinking') { g.moveTo(x - w * 0.6, y - 0.01); g.quadraticCurveTo(x, y + 0.02, x + w * 0.7, y + 0.03); }
      else { g.moveTo(x - w, y + k * 0.05); g.quadraticCurveTo(x, y - k * 0.13, x + w, y + k * 0.05); }
      g.strokeStyle = ink; g.lineWidth = lw * 1.2; g.stroke();
    }
  }
  if (beard) {
    const [x, y, f] = F(0, -0.32);
    const w = R * 0.32 * (0.5 + 0.5 * f);
    g.beginPath();
    g.moveTo(x, y + 0.02);
    g.bezierCurveTo(x - w * 0.5, y + 0.08, x - w * 1.1, y + 0.02, x - w * 1.25, y - 0.14);
    g.bezierCurveTo(x - w * 0.8, y - 0.06, x - w * 0.4, y - 0.08, x, y - 0.05);
    g.bezierCurveTo(x + w * 0.4, y - 0.08, x + w * 0.8, y - 0.06, x + w * 1.25, y - 0.14);
    g.bezierCurveTo(x + w * 1.1, y + 0.02, x + w * 0.5, y + 0.08, x, y + 0.02);
    inked(g, shade(bc, 0.1), lw * 0.8);
  }
  void mix;
}
