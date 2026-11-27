// Mama as a flat cut-out: skirt, blouse, head and kerchief are drawings placed in
// the plane of the body. When the camera turns, the cut-outs narrow and the face
// slides towards the turned side (the usual 2.5D parallax trick).
// The arm is a rubber-hose sleeve: one curve through the projected shoulder, elbow
// and wrist of the 3D proxy, with a fixed width.
import { COLORS, lerp2, paintGroups } from './draw.js';
import { DEG } from './rig.js';

function shape(ctx, pts, fill, lw, close = true) {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  if (close) ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = COLORS.line; ctx.lineJoin = 'round'; ctx.stroke();
}

function smooth(ctx, pts, fill, lw) {
  // Closed Catmull-Rom curve through the points.
  ctx.beginPath();
  const n = pts.length;
  ctx.moveTo(...lerp2(pts[n - 1], pts[0], 0.5));
  for (let i = 0; i < n; i += 1) {
    const mid = lerp2(pts[i], pts[(i + 1) % n], 0.5);
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mid[0], mid[1]);
  }
  ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
  if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = COLORS.line; ctx.stroke(); }
}

export function drawBody(ctx, cam) {
  const turn = Math.sin(cam.yaw * DEG);
  const squash = 0.62 + 0.38 * Math.cos(cam.yaw * DEG);
  const P = (x, y, z = 0) => { const p = cam.p([x * squash, y, z]); return [p[0], p[1]]; };
  const F = (x, y) => P(x - turn * 7, y); // facial features slide with the turn
  const lw = Math.max(1.4, 0.32 * cam.k);
  const k = cam.k;
  // Skirt and apron.
  smooth(ctx, [P(-15, 92), P(15, 92), P(23, 60), P(25, 30), P(-25, 30), P(-23, 60)], COLORS.skirt, lw);
  ctx.save();
  ctx.lineWidth = 1.6 * k; ctx.strokeStyle = COLORS.red;
  for (const y of [70, 66]) { ctx.beginPath(); ctx.moveTo(...P(-21.5, y)); ctx.lineTo(...P(21.5, y)); ctx.stroke(); }
  ctx.restore();
  // Blouse with rounded shoulders.
  smooth(ctx, [P(-4, 126), P(4, 126), P(13, 122), P(16, 114), P(15, 92), P(-15, 92), P(-16, 114), P(-13, 122)], COLORS.blouse, lw);
  // Neck opening and embroidery columns.
  shape(ctx, [P(-4.5, 126.5), P(4.5, 126.5), P(0, 119)], COLORS.skin, lw * 0.8);
  ctx.fillStyle = COLORS.red;
  for (const x of [-6, 6]) {
    for (let y = 97; y < 117; y += 3.2) {
      const [px, py] = P(x, y);
      ctx.beginPath(); ctx.moveTo(px, py - 0.9 * k); ctx.lineTo(px + 0.8 * k, py); ctx.lineTo(px, py + 0.9 * k); ctx.lineTo(px - 0.8 * k, py); ctx.fill();
    }
  }
  // Belt.
  shape(ctx, [P(-15.4, 95), P(15.4, 95), P(15.6, 89), P(-15.6, 89)], COLORS.red, lw);
  // Head: kerchief behind, face, hair fringe, kerchief band.
  smooth(ctx, [P(-21, 150), P(-17, 164), P(0, 170), P(17, 164), P(21, 150), P(19, 132), P(13, 126), P(-13, 126), P(-19, 132)], COLORS.batic, lw);
  const [hx, hy] = P(-turn * 3, 145);
  ctx.beginPath(); ctx.ellipse(hx, hy, 16.5 * k * squash, 17 * k, 0, 0, Math.PI * 2);
  ctx.fillStyle = COLORS.skin; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = COLORS.line; ctx.stroke();
  smooth(ctx, [F(-15, 151), F(-8, 156), F(0, 153), F(8, 156), F(15, 151), F(13, 159), F(0, 161), F(-13, 159)], COLORS.hair, 0);
  smooth(ctx, [P(-19, 156), P(-12, 165), P(0, 168), P(12, 165), P(19, 156), P(13, 162), P(0, 164.5), P(-13, 162)], COLORS.batic, lw);
  ctx.lineWidth = 1.1 * k; ctx.strokeStyle = COLORS.red; ctx.setLineDash([0.9 * k, 0.9 * k]);
  ctx.beginPath(); ctx.moveTo(...P(-15, 161)); ctx.quadraticCurveTo(...P(0, 168), ...P(15, 161)); ctx.stroke();
  ctx.setLineDash([]);
  // Face.
  ctx.fillStyle = COLORS.cheek; ctx.globalAlpha = 0.7;
  for (const x of [-10, 10]) { const [px, py] = F(x * squash, 139); ctx.beginPath(); ctx.ellipse(px, py, 2.6 * k, 1.8 * k, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1; ctx.fillStyle = COLORS.hair;
  for (const x of [-6, 6]) { const [px, py] = F(x * squash, 145); ctx.beginPath(); ctx.ellipse(px, py, 1.5 * k, 2.1 * k, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.lineWidth = lw * 0.8; ctx.strokeStyle = COLORS.line; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(...F(-2.2, 136.5)); ctx.quadraticCurveTo(...F(0, 134.6), ...F(2.2, 136.5)); ctx.stroke();
}

// Rubber-hose sleeve through shoulder, elbow and wrist. The curve passes exactly
// through the projected elbow; its width does not depend on foreshortening.
export function sleeveGroups(h) {
  const S = [h.S[0], h.S[1]], E = [h.E[0], h.E[1]], W = [h.W[0], h.W[1]];
  const C = [2 * E[0] - (S[0] + W[0]) / 2, 2 * E[1] - (S[1] + W[1]) / 2];
  const at = (t) => [(1 - t) ** 2 * S[0] + 2 * (1 - t) * t * C[0] + t * t * W[0], (1 - t) ** 2 * S[1] + 2 * (1 - t) * t * C[1] + t * t * W[1]];
  const k = h.k;
  const shapes = [{ t: 'circle', c: S, r: 5.6 * k }];
  const N = 14;
  for (let i = 0; i < N; i += 1) {
    const t0 = i / N, t1 = (i + 1) / N;
    shapes.push({ t: 'cap', a: at(t0), b: at(t1), ra: (4.9 - 1.6 * t0) * k, rb: (4.9 - 1.6 * t1) * k });
  }
  const band = (t0, t1, r) => ({ t: 'line', pts: [at(t0), at((t0 + t1) / 2), at(t1)], color: COLORS.red, w: 2 * r * k, cap: 'butt' });
  return [{ id: 'maneca', shapes, fill: COLORS.blouse, details: [band(0.16, 0.22, 4.5), band(0.9, 0.935, 3.4)] }];
}

export function paintArm(ctx, h, hand, lw) {
  const sleeve = sleeveGroups(h);
  // Fingers pointing away from the lens go behind the cuff.
  const behind = h.axes.y[2] < -0.35;
  if (behind) paintGroups(ctx, hand.groups, hand.lw);
  paintGroups(ctx, sleeve, lw);
  if (!behind) paintGroups(ctx, hand.groups, hand.lw);
}

export function paintSkeleton(ctx, h) {
  ctx.save();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(40,110,160,.9)'; ctx.fillStyle = 'rgba(40,110,160,.9)';
  const line = (pts) => { ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke(); };
  line([h.S, h.E, h.W]);
  for (const d of h.digits) line([h.W, ...d.pts]);
  for (const p of [h.S, h.E, h.W, ...h.digits.flatMap((d) => d.pts)]) { ctx.beginPath(); ctx.arc(p[0], p[1], 2.2, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
}
