// Stress-test metrics, computed frame by frame over every test.
// Reference: the silhouette of the projected 3D proxy (approach C has it by construction).
//   fidelity  – mean IoU between the approach's hand and the reference, in a camera that follows the hand
//   pops      – frames where the drawing changes much more than the reference does
//   contact   – worst distance, in mm on the body plane, between the touching fingertips and the target
//   folds     – frames with mesh triangles turned inside out (B)
//   layers    – frames where two overlapping pieces swap places (C) or the drawing changes (A)
//   flicker   – the same pair swapping back within four frames (C)
import { buildMesh, buildSubstitution, buildVolume, createSubstitution, createVolume, fixedDrawing, projectRig } from './hands.js';
import { BODY, FPS, TESTS, camera, contactAt, duration, poseAt, solve } from './rig.js';
import { handCamera, renderMask } from './scene.js';

const SIZE = [112, 112];

// Bounding box of each piece, for telling visible order changes from invisible ones.
function boxes(groups) {
  const out = new Map();
  groups.forEach((g, rank) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const grow = (p, r = 0) => { x0 = Math.min(x0, p[0] - r); y0 = Math.min(y0, p[1] - r); x1 = Math.max(x1, p[0] + r); y1 = Math.max(y1, p[1] + r); };
    for (const s of g.shapes) {
      if (s.t === 'cap') { grow(s.a, s.ra); grow(s.b, s.rb); } else if (s.t === 'circle') grow(s.c, s.r); else s.pts.forEach((p) => grow(p));
    }
    out.set(g.id, { rank, box: [x0, y0, x1, y1] });
  });
  return out;
}
// Two pieces that overlap on screen and swap places: the inner contour line jumps.
function visibleSwaps(before, after, frame = 0, lastFlip = new Map()) {
  let swaps = 0, flicker = 0;
  const ids = [...after.keys()].filter((id) => before.has(id));
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = after.get(ids[i]), b = after.get(ids[j]), pa = before.get(ids[i]), pb = before.get(ids[j]);
      if (Math.sign(a.rank - b.rank) === Math.sign(pa.rank - pb.rank)) continue;
      const [ax0, ay0, ax1, ay1] = a.box, [bx0, by0, bx1, by1] = b.box;
      const ox = Math.min(ax1, bx1) - Math.max(ax0, bx0), oy = Math.min(ay1, by1) - Math.max(ay0, by0);
      if (ox > 2 && oy > 2) {
        swaps += 1;
        // A pair that flips back within four frames flickers.
        const key = `${ids[i]}|${ids[j]}`;
        if (frame - (lastFlip.get(key) ?? -99) <= 4) flicker += 1;
        lastFlip.set(key, frame);
      }
    }
  }
  return { swaps, flicker };
}
const POP = 0.2;

function maskOf(ctx, hand) {
  renderMask(ctx, hand, SIZE);
  const data = ctx.getImageData(0, 0, SIZE[0], SIZE[1]).data;
  const bits = new Uint8Array(SIZE[0] * SIZE[1]);
  for (let i = 0; i < bits.length; i += 1) bits[i] = data[i * 4 + 3] > 127 ? 1 : 0;
  return bits;
}
function iou(a, b) {
  let both = 0, either = 0;
  for (let i = 0; i < a.length; i += 1) { both += a[i] & b[i]; either += a[i] | b[i]; }
  return either ? both / either : 1;
}

export async function measure(onProgress = () => {}) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE[0]; canvas.height = SIZE[1];
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const results = [];
  const used = new Set();
  let done = 0;
  const total = TESTS.reduce((s, t) => s + Math.round(duration(t) * FPS) + 1, 0);
  for (const test of TESTS) {
    const pickerA = createSubstitution();
    const volume = createVolume();
    const flips = new Map();
    const row = {
      test: test.id, title: test.title,
      A: { iou: 0, pops: 0, contact: 0, layers: 0, ms: 0, drawings: new Set() },
      B: { iou: 0, pops: 0, contact: 0, folds: 0, ms: 0 },
      C: { iou: 1, pops: 0, contact: 0, layers: 0, flicker: 0, ms: 0 },
      frames: Math.round(duration(test) * FPS) + 1,
      popFrames: { A: [], B: [], C: [] }, foldFrames: [],
    };
    let prev = null;
    for (let f = 0; f < row.frames; f += 1) {
      const time = f / FPS;
      const pose = poseAt(test, time);
      const rig = solve(pose);
      const hc = handCamera(rig, pose.cam, SIZE);
      const body = camera({ yaw: pose.cam, half: 47, cy: 121, width: 480, height: 600 });
      const hp = projectRig(rig, hc);
      const hb = projectRig(rig, body);
      const timed = (fn) => { const t0 = performance.now(); const out = fn(); return [out, performance.now() - t0]; };
      const [c, msC] = timed(() => volume.build(hp));
      const [a, msA] = timed(() => buildSubstitution(hp, pickerA));
      const [b, msB] = timed(() => buildMesh(hp));
      row.C.ms += msC; row.A.ms += msA; row.B.ms += msB;
      row.A.drawings.add(a.entry); used.add(a.entry);
      const masks = { C: maskOf(ctx, c), A: maskOf(ctx, a), B: maskOf(ctx, b) };
      row.A.iou += iou(masks.A, masks.C);
      row.B.iou += iou(masks.B, masks.C);
      if (b.folds) { row.B.folds += 1; row.foldFrames.push(f); }
      if (prev) {
        const ref = 1 - iou(masks.C, prev.masks.C);
        for (const key of ['A', 'B']) {
          if (1 - iou(masks[key], prev.masks[key]) - ref > POP) { row[key].pops += 1; row.popFrames[key].push(f); }
        }
        const swap = visibleSwaps(prev.boxesC, boxes(c.groups), f, flips);
        if (swap.swaps) row.C.layers += 1;
        if (swap.flicker) { row.C.flicker += 1; row.popFrames.C.push(f); }
        if (a.entry !== prev.entryA) row.A.layers += 1;
      }
      const target = contactAt(test, time);
      if (target) {
        // Contacts are measured in the normal body framing.
        const goal = body.p(BODY.targets[target]);
        const tipA = buildSubstitution(hb, fixedDrawing(a.drawing)).contact;
        const dist = (p) => (Math.hypot(p[0] - goal[0], p[1] - goal[1]) / body.k) * 10;
        row.A.contact = Math.max(row.A.contact, dist(tipA));
        row.B.contact = Math.max(row.B.contact, dist(buildMesh(hb).contact));
        row.C.contact = Math.max(row.C.contact, dist(buildVolume(hb).contact));
        row.hasContact = true;
      }
      prev = { masks, boxesC: boxes(c.groups), entryA: a.entry };
      done += 1;
      if (done % 12 === 0) { onProgress(done / total); await new Promise((r) => setTimeout(r)); }
    }
    row.A.iou /= row.frames; row.B.iou /= row.frames;
    for (const key of ['A', 'B', 'C']) row[key].ms /= row.frames;
    row.A.drawings = row.A.drawings.size;
    results.push(row);
  }
  onProgress(1);
  return { rows: results, drawingsUsed: used.size };
}
