// Staging problems found from the compiled timeline alone (no rendering), printed by `npm run validate` for blender films
// (film 047 needed five rounds of stills for each of these):
//   · close   — two people nearer than ~1.8 (sleeves / hands go into each other; a hug or a hand-over is allowed);
//   · set     — a walk that passes through a collider of the set (a gate post, a wall, a pot), with the body's radius;
//   · cross   — two people walking past each other on screen (they swap left / right while near in depth);
//   · snap    — someone turns more than 90° while the person he looks at (an explicit lookAt, or who is talking / just
//               talked) ends up behind him: the head whips round (`npm run check` reports it as `snap`).
//   · look-low — an explicit lookAt at a point lower than 2.4: the head bows and a beard goes into the chest (aim at y ≈ 3);
//   · look-turn — a body turn ≥ 60° within 0.6 s of a lookAt change of the same person: head and body fight (`snap` / `jerk`);
//   · late-walk — a walk (`wait: false`) still going when a line starts: the walker's head is pulled to the speaker
//                 while the body turns (snap), and he arrives mid-dialogue — lengthen the beat or start him nearer;
//   · door     — someone within the swing of a set door leaf while it moves (set json `doorLeaves`: hinge, length).
// (film 050 needed four `produce` rounds for these.)
// Pure (Node or browser). `colliders` = { [setType]: [{ name, poly: [[x, z], …] }] } (tools/lib/glbcol.mjs).
import { dressingOffset } from './timeline3.js';
import { positionAt } from './anim.js';
import { lerpAngle } from '../engine/timeline.js';

const FPS = 10, CLOSE = 1.7, BODY = 0.7, DEEP = 0.15;
const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
const angDiff = (a, b) => Math.abs(lerpAngle(a, b, 1) - a);

function shown(a, t) { let v = a.initial.visible; for (const e of a.visible) if (e.t <= t) v = e.v ?? e.to ?? v; return v !== false; }
function headingAt(a, t) {
  let h = a.initial.h;
  for (const s of a.head) { if (t < s.t0) break; h = t >= s.t1 ? s.to : lerpAngle(s.from ?? h, s.to, (t - s.t0) / Math.max(1e-6, s.t1 - s.t0)); }
  return h;
}
function distToPoly(p, poly) {
  let inside = false, best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    if ((bz > p[1]) !== (az > p[1]) && p[0] < ((ax - bx) * (p[1] - bz)) / (az - bz) + bx) inside = !inside;
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz;
    const u = L ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - az) * dz) / L)) : 0;
    best = Math.min(best, Math.hypot(p[0] - ax - u * dx, p[1] - az - u * dz));
  }
  return inside ? -best : best;
}

export function stageLint(tl, desc, colliders = {}, metas = {}) {
  const out = [];
  tl.scenes.forEach((sc, si) => {
    const D = desc.scenes?.[si] || {};
    const ids = Object.keys(sc.actors).filter((id) => !sc.actors[id].initial.ride);
    const n = Math.ceil((sc.end - sc.start) * FPS);
    const P = {}; // id → samples [{ t, p, v, vis }]
    for (const id of ids) {
      const a = sc.actors[id], s = [];
      let prev = positionAt(a, sc.start);
      for (let i = 0; i <= n; i++) {
        const t = sc.start + i / FPS, p = positionAt(a, t);
        s.push({ t, p, v: Math.hypot(p[0] - prev[0], p[1] - prev[1]) * FPS, vis: shown(a, t) });
        prev = p;
      }
      P[id] = s;
    }
    const excused = (x, y, t) => (sc.hugs || []).some((h) => t >= h.t0 - 0.3 && t <= h.t1 + 0.3 && [h.a, h.b].includes(x) && [h.a, h.b].includes(y))
      || Object.values(sc.props || {}).some((pr) => pr.moves.some((m) => t >= m.t0 - 0.6 && t <= m.t1 + 0.6 && [m.from?.actor, m.to?.actor].includes(x) && [m.from?.actor, m.to?.actor].includes(y)));
    // ---- close / cross
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const x = ids[i], y = ids[j];
      let saidClose = false, saidCross = false, side = 0;
      for (let k = 0; k <= n; k++) {
        const A = P[x][k], B = P[y][k];
        if (!A.vis || !B.vis) { side = 0; continue; }
        const dx = B.p[0] - A.p[0], dz = B.p[1] - A.p[1], d = Math.hypot(dx, dz);
        if (!saidClose && d < CLOSE && !excused(x, y, A.t)) {
          out.push(`close: ${sc.id} ${fmt(A.t)}: ${x} and ${y} only ${d.toFixed(2)} apart — sleeves / hands go into each other; keep ≥ ${CLOSE} (or stage a hug / give)`);
          saidClose = true;
        }
        const moving = A.v > 0.3 || B.v > 0.3, s = Math.abs(dx) > 0.3 ? Math.sign(dx) : 0;
        if (!saidCross && moving && side && s && s !== side && Math.abs(dz) < 2.5) {
          out.push(`cross: ${sc.id} ${fmt(A.t)}: ${x} and ${y} pass each other on screen — let them arrive in the left / right order they keep afterwards`);
          saidCross = true;
        }
        if (s && (moving || !side)) side = s;
      }
    }
    // ---- walks through the set's colliders
    const cols = (colliders[D.set?.type] || []).map((c) => {
      const offset = dressingOffset(D.set.offsets, c.name);
      return offset ? { ...c, poly: c.poly.map(([x,z]) => [x + offset[0], z + offset[2]]) } : c;
    });
    for (const id of ids) {
      const said = new Set();
      for (const s of P[id]) {
        if (!s.vis || s.v < 0.3) continue;
        for (const c of cols) {
          if (said.has(c.name)) continue;
          const d = distToPoly(s.p, c.poly);
          if (BODY - d > DEEP) { out.push(`set: ${sc.id} ${fmt(s.t)}: ${id} walks through ${c.name} (${(BODY - d).toFixed(2)} deep) — move the walk's waypoint / end ≥ ${BODY} from it`); said.add(c.name); }
        }
      }
    }
    // ---- head snaps: a big turn that leaves the one he looks at behind him
    const speeches = tl.speeches.filter((sp) => sp.scene === sc.id);
    for (const id of ids) {
      const a = sc.actors[id];
      for (const seg of a.head) {
        if (seg.ease === 'out') continue;
        const from = seg.from ?? headingAt(a, seg.t0 - 0.01), turn = angDiff(from, seg.to);
        if (turn < Math.PI / 2) continue;
        const t = seg.t1;
        let target = null;
        for (const e of a.look) if (e.t <= t) target = e.target;
        const cand = [];
        if (typeof target === 'string' && sc.actors[target]) cand.push(target);
        if (target === undefined || target === null) for (const sp of speeches) if (sp.speaker !== id && sc.actors[sp.speaker] && sp.start <= t && sp.end + 2.5 >= seg.t0) cand.push(sp.speaker);
        for (const o of [...new Set(cand)]) {
          if (!shown(sc.actors[o], t)) continue;
          const p = positionAt(a, t), q = positionAt(sc.actors[o], t);
          const want = Math.atan2(q[0] - p[0], q[1] - p[1]);
          if (angDiff(seg.to, want) > (110 * Math.PI) / 180) {
            out.push(`snap: ${sc.id} ${fmt(seg.t0)}: ${id} turns ${Math.round(turn * 57.3)}° and leaves ${o} (whom he looks at) behind him — the head may whip round; turn in two steps with "lookAt": null first, or don't turn him`);
            break;
          }
        }
      }
    }
    // ---- look-low / look-turn
    for (const id of ids) {
      const a = sc.actors[id];
      for (const e of a.look) {
        if (Array.isArray(e.target) && e.target.length === 3 && e.target[1] < 2.4)
          out.push(`look-low: ${sc.id} ${fmt(e.t)}: ${id} looks at y ${e.target[1]} — the head bows and a beard goes into the chest; aim at y ≈ 3 (the eyes lower by themselves)`);
        for (const seg of a.head) {
          const from = seg.from ?? headingAt(a, seg.t0 - 0.01);
          if (angDiff(from, seg.to) >= Math.PI / 3 && Math.abs(seg.t0 - e.t) < 0.6 && seg.ease !== 'out') {
            out.push(`look-turn: ${sc.id} ${fmt(seg.t0)}: ${id} turns ${Math.round(angDiff(from, seg.to) * 57.3)}° and changes his lookAt ${Math.abs(seg.t0 - e.t).toFixed(1)} s apart — do them ≥ 0.6 s apart (turn first, then look)`);
            break;
          }
        }
      }
    }
    // ---- late-walk: still walking (from the beat before) when a line starts
    for (const b of sc.beats || []) {
      if (!b.speech || !sc.actors[b.speech.speaker]) continue;   // the narrator / a voice: walking under it is fine
      const k0 = Math.round((b.start - sc.start) * FPS);
      for (const id of ids) {
        if (id === b.speech.speaker) continue;   // he talks as he arrives: fine
        const s0 = P[id][k0 - 3], s1 = P[id][k0 + 3];
        if (s0 && s1 && s0.vis && s1.vis && s0.v > 0.3 && s1.v > 0.3)
          out.push(`late-walk: ${sc.id} ${fmt(b.start)}: ${id} is still walking (from the beat before) when ${b.speech.speaker}'s line starts — give that beat a longer "duration" or start him nearer`);
      }
    }
    // ---- door leaves sweeping through someone
    const leaves = metas[D.set?.type]?.doorLeaves || {};
    for (const [dn, segs] of Object.entries(sc.doors || {})) {
      const L = leaves[dn]; if (!L) continue;
      for (const sg of segs) for (let t = sg.t0; t <= sg.t1 + 1e-6; t += 0.1) {
        if (sg.t0 === sg.t1) break;   // a door already in position on a cut has no swing to check
        const k = Math.round((t - sc.start) * FPS);
        for (const id of ids) {
          const s = P[id][k]; if (!s || !s.vis) continue;
          const dx = s.p[0] - L.hinge[0], dz = s.p[1] - L.hinge[1], d = Math.hypot(dx, dz);
          if (d < L.length + BODY + 0.25 && dx * L.out[0] + dz * L.out[1] > -BODY) {
            out.push(`door: ${sc.id} ${fmt(t)}: ${id} stands ${d.toFixed(1)} from the hinge of door ${dn} while it swings (leaf ${L.length.toFixed(1)}) — stand ≥ ${(L.length + 1).toFixed(1)} from the hinge, on the side away from it`);
            t = sg.t1 + 1; break;
          }
        }
      }
    }
  });
  return out;
}
