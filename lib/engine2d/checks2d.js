// Runtime checks for the 2D engine (npm run check on an "engine": "2d" film):
//   frame    — the subject of a close / medium / two shot is cut by the frame edge
//   blocked  — someone standing nearer the camera hides the subject's face
//   back     — the subject of a close-up has its back to the camera
//   overlap  — two people stand inside each other
//   inside   — a person stands inside a building of the set
//   layers   — (pateric figures) an arm that blinks in front of / behind the hood, a held prop hidden behind the head,
//              a hand at the face drawn without its sleeve
import { beatAt } from '../engine/timeline.js';
import { armLayers, bodyKind, LAYER } from './pateric.js';

export function runChecks2d(stage, { step = 0.25 } = {}) {
  const warnings = [], runs = new Map();
  const push = (type, sc, t, key, msg) => {
    const k = `${type}|${sc.id}|${key}`, r = runs.get(k);
    if (r && t - r.t1 <= step * 1.6) { r.t1 = t; return; }
    const e = { type, scene: sc.id, t0: t, t1: t, msg }; runs.set(k, e); warnings.push(e);
  };
  const flips = new Map();   // actor|side → { cls, times: [] }
  for (const sc of stage.tl.scenes) {
    const solids = stage.spritesOf(sc).filter((s) => s.solid);
    for (let t = sc.start + 0.02; t < sc.end; t += step) {
      const b = beatAt(sc, t);
      const cam = stage.cameraAt(sc, t);
      const V = stage.view(cam);
      const E = stage.evaluate(t);
      const A = Object.values(E.actors).filter((a) => a.st.visible);
      const head = (a) => { const B = V.P(a.st.pos[0], 0, a.st.pos[1]); if (!B) return null; const s = B[2] * a.S, [hx, hy, r] = a.pose.head; return { x: B[0] + hx * s, y: B[1] - hy * s, r: r * s, s, B }; };
      const settled = !b || t - b.start > 0.4;
      const spec = cam.spec, subj = [];
      if ((spec.shot === 'close' || spec.shot === 'medium') && E.actors[spec.on]) subj.push(E.actors[spec.on]);
      if (spec.shot === 'two' && Array.isArray(spec.on)) for (const id of spec.on) if (E.actors[id]) subj.push(E.actors[id]);
      for (const a of settled ? subj : []) {
        const h = head(a);
        if (!h) { push('frame', sc, t, a.id, `${spec.shot} shot on "${a.id}": the camera is in front of the subject`); continue; }
        if (h.x - h.r < 0 || h.x + h.r > V.W || h.y - h.r * 1.4 < 0 || h.y + h.r > V.H) push('frame', sc, t, a.id, `${spec.shot} shot on "${a.id}": the face is cut by the frame edge — change dist / dx`);
        if (spec.shot === 'close' && a.pose.back) push('back', sc, t, a.id, `close-up on "${a.id}" shows the back of the head — turn the actor (face) or film someone else`);
        for (const o of A) {
          if (o === a || o.st.pos[1] < a.st.pos[1] + 0.3) continue;
          const B = V.P(o.st.pos[0], 0, o.st.pos[1]); if (!B) continue;
          const s = B[2] * o.S, x0 = B[0] - 1.0 * s, x1 = B[0] + 1.0 * s, y0 = B[1] - 4.4 * s;
          const ox = Math.max(0, Math.min(x1, h.x + h.r * 0.7) - Math.max(x0, h.x - h.r * 0.7));
          if (ox > h.r * 0.5 && h.y > y0) push('blocked', sc, t, a.id + o.id, `${spec.shot} shot on "${a.id}" is hidden by "${o.id}" standing in front — "angle": "auto", dx, or move the actors`);
        }
      }
      for (const a of A) {
        if (a.look.figure !== 'pateric' || a.pose.p?.hugOn) continue;
        const L = armLayers(a.pose, bodyKind(a.pose), a.st.holding || {});
        for (const side of ['R', 'L']) {
          const { d, dh, raised, atFace } = L[side];
          if (a.st.holding?.[side] && dh < LAYER.head) push('layers', sc, t, a.id + side + 'p', `"${a.id}" holds something in the ${side} hand behind the head / beard`);
          if (raised && atFace && d < LAYER.head) push('layers', sc, t, a.id + side + 'f', `"${a.id}": the ${side} hand is at the face but its sleeve is drawn behind the head`);
          const cls = d < LAYER.drape ? 0 : d < LAYER.head ? 1 : 2, k = `${sc.id}|${a.id}|${side}`, f = flips.get(k) || { cls, times: [] };
          f.times = f.times.filter((x) => t - x < 1.5);
          if (cls !== f.cls) { f.times.push(t); f.cls = cls; }
          flips.set(k, f);
          if (f.times.length >= 3) push('layers', sc, t, a.id + side + 'b', `"${a.id}": the ${side} arm blinks in front of / behind the hood (${f.times.length} changes in 1.5 s) — a gesture near the shoulder line; change the gesture or fix armLayers`);
        }
      }
      for (let i = 0; i < A.length; i++) for (let j = i + 1; j < A.length; j++) {
        const p = A[i].st.pos, q = A[j].st.pos;
        const hugging = (sc.hugs || []).some((h) => t >= h.t0 && t <= h.t1 && [h.a, h.b].includes(A[i].id) && [h.a, h.b].includes(A[j].id));
        if (!hugging && Math.abs(p[0] - q[0]) < 1.3 && Math.abs(p[1] - q[1]) < 0.8) push('overlap', sc, t, A[i].id + A[j].id, `"${A[i].id}" and "${A[j].id}" stand inside each other — keep them ≥ 1.6 apart`);
      }
      for (const a of A) for (const s of solids) {
        const [x0, z0, x1, z1] = s.solid, [x, z] = a.st.pos;
        if (x > x0 + 0.3 && x < x1 - 0.3 && z > z0 + 0.2 && z < z1 - 0.2) push('inside', sc, t, a.id, `"${a.id}" stands inside a building near [${x.toFixed(1)}, ${z.toFixed(1)}]`);
      }
    }
  }
  return warnings.map((w) => ({ ...w, t: w.t0 }));
}
