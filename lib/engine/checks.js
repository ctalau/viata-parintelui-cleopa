// Verificările unui episod pe scena reală a motorului (aceeași ca în player și la export).
// Fiecare funcție primește un Stage încărcat și întoarce o listă de probleme {kind, from, to, who, detail}.
import * as THREE from 'three';

const v = new THREE.Vector3();

/** Poligonul convex 2D (lume) al unei palme C: din piesele construite, prin matricea armăturii. */
export function palmWorld(actor, side) {
  const c = actor.character;
  const palm = c.palms[side];
  if (!palm?.mesh.visible || !palm.built) return null;
  palm.mesh.updateWorldMatrix(true, false);
  const pts = [];
  for (const g of palm.built.groups) for (const s of g.shapes) {
    for (const q of s.pts ?? [s.a, s.b]) { v.set(q[0], q[1], 0).applyMatrix4(palm.mesh.matrixWorld); pts.push([v.x, v.y]); }
  }
  return hull(pts);
}

export function headWorld(actor) {
  // Învelitoarea convexă a desenelor legate de osul capului (față, păr, urechi), ca check_overlaps.py.
  const c = actor.character;
  const bone = c.bones.head;
  const pts = [];
  const box = new THREE.Box3();
  bone.traverse((node) => {
    if (!node.isMesh || !node.visible) return;
    if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
    box.copy(node.geometry.boundingBox);
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
      v.set(x, y, 0).applyMatrix4(node.matrixWorld);
      pts.push([v.x, v.y]);
    }
  });
  return hull(pts);
}

function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}

export const area = (poly) => Math.abs(poly.reduce((s, p, i) => s + p[0] * poly[(i + 1) % poly.length][1] - p[1] * poly[(i + 1) % poly.length][0], 0)) / 2;

export function clip(subject, clipPoly) {
  let out = subject;
  for (let i = 0; i < clipPoly.length && out.length; i++) {
    const a = clipPoly[i], b = clipPoly[(i + 1) % clipPoly.length];
    const inside = (p) => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]) >= 0;
    const input = out; out = [];
    for (let j = 0; j < input.length; j++) {
      const p = input[j], q = input[(j + 1) % input.length];
      if (inside(p)) out.push(p);
      if (inside(p) !== inside(q)) {
        const r = [q[0] - p[0], q[1] - p[1]], s = [b[0] - a[0], b[1] - a[1]];
        const t = ((a[0] - p[0]) * s[1] - (a[1] - p[1]) * s[0]) / (r[0] * s[1] - r[1] * s[0]);
        out.push([p[0] + r[0] * t, p[1] + r[1] * t]);
      }
    }
  }
  return out;
}

/** Intervale continue din cadrele marcate. */
function intervals(hits, kind, gap = 3) {
  const out = [];
  for (const [f, who, detail] of hits) {
    const last = out.findLast((x) => x.who === who);
    if (last && f - last.to <= gap) { last.to = f; last.worst = Math.max(last.worst, detail); }
    else out.push({ kind, from: f, to: f, who, worst: detail });
  }
  return out;
}

export function checkEpisode(stage, { step = 2, from = 1, to = stage.frames } = {}) {
  const overlap = [], jerk = [], framing = [], mouth = [];
  const previous = new Map();
  const motion = {};
  const cues = stage.timeline.beats.flatMap((b) => b.cues);
  for (let f = from; f <= to; f += step) {
    stage.setTime((f - 1) / stage.fps);
    stage.scene.updateMatrixWorld(true);
    const set = stage.sets[stage.shot.set];
    const actors = Object.values(stage.cast).filter((a) => a.set === set && a.character.root.visible);
    // 1. O mână peste capul altui personaj (hand_in_front_of_head din check_overlaps.py).
    for (const a of actors) for (const side of ['R', 'L']) {
      const palm = palmWorld(a, side);
      if (!palm) continue;
      for (const b of actors) {
        if (b === a) continue;
        const head = headWorld(b);
        const inter = clip(palm, head);
        const share = inter.length > 2 ? area(inter) / Math.min(area(palm), area(head)) : 0;
        if (share > 0.08) overlap.push([f, `${a.id}.${side} × ${b.id}`, Math.round(share * 100)]);
      }
      // 2. Smucituri: deplasarea încheieturii pe cadru (relativ la personaj), comparată după bucla de cadre.
      const key = `${a.id}.${side}`;
      const w = a.character.world[`hand.${side}`].head;
      const prev = previous.get(key);
      const d = prev && prev.f === f - step ? Math.hypot(w[0] - prev.w[0], w[1] - prev.w[1]) * a.spec.size / step : null;
      (motion[key] ??= []).push([f, d]);
      previous.set(key, { f, w: [...w] });
    }
    // 3. Încadrarea: cine vorbește are capul în cadru; 4. gura se mișcă în timpul replicii.
    const cam = stage.camera;
    for (const cue of cues) {
      if (f < cue.start || f >= cue.end) continue;
      const speaker = actors.find((a) => (a.spec.say ?? []).includes(cue.file));
      if (!speaker) continue;
      v.set(...speaker.character.world.head.head, 0).applyMatrix4(speaker.character.root.matrixWorld);
      const inside = v.x > cam.position.x + cam.left && v.x < cam.position.x + cam.right && v.y > cam.position.y + cam.bottom && v.y < cam.position.y + cam.top;
      if (!inside) framing.push([f, speaker.id, 1]);
      mouth.push([f, speaker.id, speaker.mouth(Math.floor(f)) > 0 ? 1 : 0, cue.file]);
    }
  }
  // O încheietură care sare într-un cadru mult mai mult decât în cadrele vecine (ca jerk din lego-shorts).
  for (const [key, list] of Object.entries(motion)) {
    for (let i = 1; i < list.length - 1; i++) {
      const [f, d] = list[i];
      const a = list[i - 1][1], b = list[i + 1][1];
      if (d == null || a == null || b == null) continue;
      if (d > 0.12 && d > 3 * Math.max(a, b, 0.01)) jerk.push([f, key, Math.round(d * 100)]);
    }
  }
  const lips = {};
  for (const [, who, open, file] of mouth) { const k = `${who} · ${file}`; (lips[k] ??= [0, 0])[0] += open; lips[k][1]++; }
  const silent = Object.entries(lips).filter(([, [open, n]]) => n >= 6 && open / n < 0.15).map(([k, [open, n]]) => ({ kind: 'lipsync', who: k, detail: `${open}/${n} cadre cu gura deschisă` }));
  return [...intervals(overlap, 'hand_over_head'), ...intervals(jerk, 'jerk'), ...intervals(framing, 'speaker_out_of_frame'), ...silent];
}

/** Determinism: aceleași pixeli la aceleași momente, în ordine crescătoare și în ordine aleatoare. */
export function checkDeterminism(stage, renderer, times) {
  const shoot = (t) => { stage.setTime(t); renderer.render(stage.scene, stage.camera); return renderer.domElement.toDataURL('image/png'); };
  const ordered = new Map(times.map((t) => [t, shoot(t)]));
  const shuffled = [...times].sort((a, b) => Math.sin(a * 999) - Math.sin(b * 999));
  const problems = [];
  for (const t of shuffled) if (shoot(t) !== ordered.get(t)) problems.push({ kind: 'nondeterministic', from: Math.round(t * stage.fps) + 1, detail: `t=${t}` });
  return problems;
}
