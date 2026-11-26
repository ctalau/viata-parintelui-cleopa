// Motion problems a reviewer sees but no picture check finds, read straight from the compiled timeline (no rendering):
//   · stop-and-go — someone slows to a stop and walks on (two walks where one was meant, a turn on a waypoint);
//   · back turn — a turn on the spot that swings the back to the camera although it starts and ends facing it;
//   · walk back — a short walk (< 2.5) against the way he faces: he turns round in a second and the head snaps (film 051);
//   · teleport — a `place` in the middle of a scene: the head jumps in one frame (do it on a new scene, a cut);
//   · near look — an explicit lookAt at a point < 3.5 away while he walks: the head swings round as he passes it.
// Printed by `npm run validate` (and so by `produce`) for "style": "blender" films. Pure: Node or browser.
import { positionAt } from './anim.js';
import { sampleSegs, lerpAngle } from '../engine/timeline.js';
import { headingTo } from '../components/layouts.js';

const FPS = 30;
const angDiff = (a, b) => Math.abs(lerpAngle(a, b, 1) - a);

function camAt(sc, t) {
  let c = sc.initialCamera;
  for (const b of sc.beats) if (b.start <= t) c = b.activeCamera || c;
  return c;
}

export function motionLint(tl) {
  const out = [];
  const fmt = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}`;
  for (const sc of tl.scenes) {
    for (const [id, a] of Object.entries(sc.actors)) {
      // ---- stop-and-go
      const n = Math.ceil((sc.end - sc.start) * FPS);
      const sp = [];
      let prev = positionAt(a, sc.start);
      for (let i = 1; i <= n; i++) {
        const t = sc.start + i / FPS, p = positionAt(a, t);
        sp.push({ t, v: Math.hypot(p[0] - prev[0], p[1] - prev[1]) * FPS });
        prev = p;
      }
      const W = FPS; // look 1 s each way
      let last = -9;
      for (let i = W; i < sp.length - W; i++) {
        const v = sp[i].v;
        if (v > 0.25 || sp[i].t - last < 2) continue;
        let before = 0, after = 0;
        for (let k = 1; k <= W; k++) { before = Math.max(before, sp[i - k].v); after = Math.max(after, sp[i + k].v); }
        if (before > 0.8 && after > 0.8) {
          out.push(`${sc.id} ${fmt(sp[i].t)}: ${id} stops and walks on — make it one walk (a walk that starts when the previous one ends continues it) or keep a real pause ≥ 1 s`);
          last = sp[i].t;
        }
      }
      // ---- back turned to the camera during a turn on the spot
      for (let i = 0; i < a.head.length; i++) {
        const s = a.head[i];
        if (s.ease === 'out') continue;
        const e = s.ease === 'in' && a.head[i + 1]?.ease === 'out' ? a.head[i + 1] : s;
        const t0 = s.t0, t1 = e.t1;
        if (t1 - t0 < 0.05) continue;
        const c = camAt(sc, t0);
        if (!c?.world || !Array.isArray(c.on)) continue;
        const dir = ((c.angle || 0) * Math.PI) / 180, R = c.dist ?? 24;
        const pos = positionAt(a, t0), camH = headingTo(pos, [c.on[0] + Math.sin(dir) * R, c.on[1] + Math.cos(dir) * R]);
        const away = (h) => angDiff(h, camH) > 2.6; // within ~30° of the back to the camera
        if (away(s.from) || away(e.to)) continue;
        let worst = false;
        for (let k = 1; k < 10 && !worst; k++) worst = away(sampleSegs(a.head, t0 + ((t1 - t0) * k) / 10, a.initial.h, lerpAngle));
        if (worst) out.push(`${sc.id} ${fmt(t0)}: ${id} turns with the back to the camera — end the walk facing the other way, or turn in two steps`);
      }
    }

    // ---- walk back, teleport, near look (film 051: each cost a render-check round)
    for (const [id, a] of Object.entries(sc.actors)) {
      for (const seg of a.pos || []) {
        const d = Math.hypot(seg.to[0] - seg.from[0], seg.to[1] - seg.from[1]);
        if (seg.t1 - seg.t0 < 0.05) {
          if (d > 0.3 && seg.t0 > sc.start + 0.05) out.push(`${sc.id} ${fmt(seg.t0)}: ${id} jumps to another place inside the scene (place) — the head jumps in one frame: start a new scene there (transition "cut") with him at the new spot`);
          continue;
        }
        if (d > 0.2 && d < 2.5 && !(a.walking || []).some((w) => w.back && Math.abs(w.t0 - seg.t0) < 1e-6)) {
          const dir = headingTo(seg.from, seg.to), h0 = sampleSegs(a.head, seg.t0 + 1e-3, a.initial.h, lerpAngle);
          if (angDiff(h0, dir) > 2.1) out.push(`${sc.id} ${fmt(seg.t0)}: ${id} walks back ${d.toFixed(1)} against the way he faces — he turns round in a second (head snap): don't walk back; cut to a new scene, or walk ≥ 2.5 slowly`);
        }
      }
      for (const L of a.look || []) {
        if (!Array.isArray(L.target)) continue;
        const tx = L.target[0], tz = L.target.length > 2 ? L.target[2] : L.target[1];
        for (const w of a.walking || []) {
          if (w.t1 < L.t) continue;
          const next = (a.look || []).find((M) => M.t > L.t);
          if (next && next.t < w.t0) continue;
          let near = false;
          for (let t = Math.max(w.t0, L.t); t <= w.t1 && !near; t += 0.2) { const p = positionAt(a, t); near = Math.hypot(p[0] - tx, p[1] - tz) < 3.5; }
          if (near) { out.push(`${sc.id} ${fmt(Math.max(w.t0, L.t))}: ${id} looks at a point < 3.5 away while he walks — the head swings round: look at a point far ahead (≥ 10) along the walk, or let go of the look first`); break; }
        }
      }
    }
  }
  return out;
}
