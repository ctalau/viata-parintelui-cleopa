// Runtime checks for the problems we keep hitting (see docs/ENGINE.md; "Past issues" in the /plan-video skill).
// They run in the browser on the real three.js scene, so they see exactly what gets rendered.
//
//   zfight   — two same-facing faces in the same plane overlap → flicker in the video (issues #8, #17)
//   inside   — a held / flying prop goes inside a minifig's body (issues #9, #18)
//   blocked  — the subject of a shot (close/medium actor, prop, speaker) is hidden by something,
//              or the camera is inside a wall / a figure (issues #6, #7, #14)
//   shake    — the camera oscillates back and forth inside one shot (issue #19)
//   clip     — an arm / hand / head / torso / leg, or a held prop, goes into the set (a counter, a wall, a rock…) (issues #21, #42)
//   staging  — timing mistakes a reviewer sees at once (issue #42): a gesture (bow, cross…) while the actor is still walking,
//              a big turn right after arriving (the walk should end with that `face`), a prop that pops into view in the
//              middle of a shot with nobody handling it
//   cut      — a jump cut: a cut to the same subject from the same direction, only nearer / farther ("sudden zoom")
//
// Usage: runChecks(stage) → [{ type, scene, t, msg }]. CLI: `npm run check -- videos/<id>`
// (also runs automatically with `npm run still` and before `npm run record`).
import * as THREE from 'three';
import { beatAt, sceneAt } from './timeline.js';

const V = () => new THREE.Vector3();

/** Name of the thing a mesh belongs to: actor id, prop id or "set". */
function ownerOf(obj, B) {
  let piece = '';
  for (let o = obj; o; o = o.parent) {
    if (!piece && o.name && o !== B.set?.group) piece = o.name;
    for (const [id, A] of Object.entries(B.actors)) if (A.fig.root === o) return { kind: 'actor', id };
    for (const [id, P] of Object.entries(B.props)) if (P.obj === o) return { kind: 'prop', id };
  }
  return { kind: 'set', id: 'set', piece };
}
const label = (o) => (o.kind === 'set' ? (o.piece ? `the set (${o.piece})` : 'the set') : `${o.kind} "${o.id}"`);
function visibleInTree(o) { for (; o; o = o.parent) if (!o.visible) return false; return true; }
const isGhost = (m) => { const mats = Array.isArray(m.material) ? m.material : [m.material]; return mats.every((x) => x && x.depthWrite === false); };
const colorOf = (m) => { const x = Array.isArray(m.material) ? m.material[0] : m.material; return x?.color ? '#' + x.color.getHexString() : '?'; };
const fmt = (v) => `[${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)}]`;

// ---------- z-fighting: coplanar overlapping faces ----------
export function checkZFight(B, { maxReports = 12 } = {}) {
  B.scene.updateMatrixWorld(true);
  const buckets = new Map();
  const a = V(), b = V(), c = V(), n = V(), e1 = V(), e2 = V();
  let meshId = 0;
  B.scene.traverse((m) => {
    if (!m.isMesh || m.isInstancedMesh || !m.geometry?.attributes?.position) return;
    if (!visibleInTree(m) || isGhost(m)) return;
    for (let o = m; o; o = o.parent) if (o.userData?.minifig) return; // figures are checked by "inside"
    const id = meshId++;
    const pos = m.geometry.attributes.position, idx = m.geometry.index;
    const count = idx ? idx.count : pos.count;
    const get = (i, v) => v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
    for (let i = 0; i + 2 < count; i += 3) {
      get(i, a); get(i + 1, b); get(i + 2, c);
      n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
      const len = n.length(); if (len < 1e-6) continue;
      n.divideScalar(len);
      const ax = Math.abs(n.x) > 0.9995 ? 0 : Math.abs(n.y) > 0.9995 ? 1 : Math.abs(n.z) > 0.9995 ? 2 : -1;
      if (ax < 0) continue;
      const sign = n.getComponent(ax) > 0 ? 1 : -1;
      const d = (a.getComponent(ax) + b.getComponent(ax) + c.getComponent(ax)) / 3;
      if (ax === 1 && sign < 0 && d < 0.05) continue; // bottoms resting on the ground are never seen
      const [u, w] = ax === 0 ? ['y', 'z'] : ax === 1 ? ['x', 'z'] : ['x', 'y'];
      const tri = { mesh: m, id, p: [[a[u], a[w]], [b[u], b[w]], [c[u], c[w]]], d, ax, sign };
      const key = `${ax}${sign}:${Math.round(d / 0.004)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(tri);
    }
  });
  const inside = (pt, t) => {
    const [[x1, y1], [x2, y2], [x3, y3]] = t.p;
    const den = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
    if (Math.abs(den) < 1e-9) return false;
    const l1 = ((y2 - y3) * (pt[0] - x3) + (x3 - x2) * (pt[1] - y3)) / den;
    const l2 = ((y3 - y1) * (pt[0] - x3) + (x1 - x3) * (pt[1] - y3)) / den;
    const l3 = 1 - l1 - l2, eps = 0.02;
    return l1 > eps && l2 > eps && l3 > eps;
  };
  const samples = (t) => {
    const cx = (t.p[0][0] + t.p[1][0] + t.p[2][0]) / 3, cy = (t.p[0][1] + t.p[1][1] + t.p[2][1]) / 3;
    return [[cx, cy], ...t.p.map(([x, y]) => [x * 0.7 + cx * 0.3, y * 0.7 + cy * 0.3])];
  };
  const found = new Map();
  for (const tris of buckets.values()) {
    if (tris.length < 2) continue;
    const grid = new Map(), C = 1;
    for (const t of tris) {
      const xs = t.p.map((q) => q[0]), ys = t.p.map((q) => q[1]);
      const x0 = Math.floor(Math.min(...xs) / C), x1 = Math.floor(Math.max(...xs) / C);
      const y0 = Math.floor(Math.min(...ys) / C), y1 = Math.floor(Math.max(...ys) / C);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4000) continue; // huge faces (the ground): skip
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = x * 100003 + y; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(t);
      }
    }
    for (const cell of grid.values()) {
      for (let i = 0; i < cell.length; i++) for (let j = i + 1; j < cell.length; j++) {
        const A = cell[i], Bt = cell[j];
        if (Math.abs(A.d - Bt.d) > 0.004) continue;
        if (!samples(A).some((q) => inside(q, Bt)) && !samples(Bt).some((q) => inside(q, A))) continue;
        const oa = ownerOf(A.mesh, B), ob = ownerOf(Bt.mesh, B);
        const key = [label(oa) + colorOf(A.mesh), label(ob) + colorOf(Bt.mesh)].sort().join('|') + A.ax;
        if (found.has(key)) continue;
        const cx = (A.p[0][0] + A.p[1][0] + A.p[2][0]) / 3, cy = (A.p[0][1] + A.p[1][1] + A.p[2][1]) / 3;
        const at = A.ax === 0 ? [A.d, cx, cy] : A.ax === 1 ? [cx, A.d, cy] : [cx, cy, A.d];
        found.set(key, `${label(oa)} (${colorOf(A.mesh)}) and ${label(ob)} (${colorOf(Bt.mesh)}) have overlapping coplanar faces ` +
          `(${'xyz'[A.ax]} = ${A.d.toFixed(2)}) near [${at.map((v) => v.toFixed(1)).join(', ')}] → flicker`);
      }
      if (found.size >= maxReports) break;
    }
  }
  return [...found.values()];
}

// ---------- props inside bodies ----------
function propPoints(obj, max = 400) {
  const pts = [];
  obj.updateMatrixWorld(true);
  obj.traverse((m) => {
    if (!m.isMesh || isGhost(m) || !m.geometry?.attributes?.position) return;
    const pos = m.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 120));
    for (let i = 0; i < pos.count; i += step) pts.push(V().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  });
  if (pts.length <= max) return pts;
  const s = pts.length / max; return Array.from({ length: max }, (_, i) => pts[Math.floor(i * s)]);
}
function bodyParts(fig) {
  const parts = [];
  fig.root.traverse((m) => {
    if (!m.isMesh || !m.userData.bodyPart) return;
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    parts.push(m);
  });
  return parts;
}
export function checkPropsInside(stage, sc, B, t) {
  const out = [];
  const inv = new THREE.Matrix4(), box = new THREE.Box3(), q = V();
  for (const [pid, P] of Object.entries(B.props)) {
    if (!visibleInTree(P.obj)) continue;
    const { holder, move } = stage.propHolder(P, t);
    if (!holder.actor && !move) continue; // props lying on the ground are not checked (feet on a mat are fine)
    const pts = propPoints(P.obj);
    for (const [aid, A] of Object.entries(B.actors)) {
      if (!A.fig.root.visible) continue;
      for (const part of bodyParts(A.fig)) {
        if (part.userData.bodyPart === 'arm' || part.userData.bodyPart === 'hand') continue; // holding hand: checked by "clip" only
        inv.copy(part.matrixWorld).invert();
        box.copy(part.geometry.boundingBox).expandByScalar(-0.06);
        let n = 0;
        for (const p of pts) if (box.containsPoint(q.copy(p).applyMatrix4(inv))) n++;
        if (n >= 3) out.push({ key: `${pid}>${aid}.${part.userData.bodyPart}`, msg: `prop "${pid}" goes inside ${aid}'s ${part.userData.bodyPart} (${n} points)` });
      }
    }
  }
  return out;
}

// ---------- props sunk into the ground / people standing inside props on the ground ----------
/** Props lying on the ground (not held, not flying) whose bottom is below the top of the ground under them
 *  (studs, path tiles, a doormat…): they look "sunk". Flat props (mats, grains, trails) are skipped. */
export function checkSunk(stage, sc, B, t) {
  const out = [];
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0), box = new THREE.Box3();
  const ground = [];
  B.set.group.traverse((o) => { if (o.isMesh && visibleInTree(o)) ground.push(o); });
  for (const [pid, P] of Object.entries(B.props)) {
    if (!visibleInTree(P.obj)) continue;
    const { holder, move } = stage.propHolder(P, t);
    if (holder.actor || move) continue;
    if (P.obj.userData.noSink) continue; // hung on a wall (an icon): never on the ground
    box.setFromObject(P.obj);
    if (box.isEmpty() || box.max.y - box.min.y < 0.3) continue; // flat things lie between the studs on purpose
    const w = Math.min(box.max.x - box.min.x, box.max.z - box.min.z);
    if (w > 6) continue; // big pieces (trees, jails, camels) stand on their own
    let top = -Infinity;
    if (P.obj.userData.base) { const y0 = box.min.y; box.setFromObject(P.obj.userData.base); box.min.y = Math.min(box.min.y, y0); } // what touches the ground (a tree's mound, not its crown)
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, rx = (box.max.x - box.min.x) * 0.3, rz = (box.max.z - box.min.z) * 0.3;
    for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]]) {
      ray.set(new THREE.Vector3(cx + dx * rx, box.min.y + 2, cz + dz * rz), down); ray.far = 3;
      const hit = ray.intersectObjects(ground, false)[0];
      if (hit) top = Math.max(top, hit.point.y);
    }
    const sink = top - box.min.y;
    if (sink > 0.12) out.push({ key: `sunk.${pid}`, msg: `prop "${pid}" sinks ${sink.toFixed(2)} into the ground (studs / tiles) — raise it with "y": ${(Math.ceil((sink + 0.02) * 20) / 20).toFixed(2)}` });
  }
  return out;
}
/** A standing / walking actor whose legs, robe or torso go into a prop lying on the ground (a stool he just stood up
 *  from, a basket, a jug, a pot). A seated actor on a prop with userData.seat (the stool) is fine. */
export function checkActorsInProps(stage, sc, B, t) {
  const out = [];
  const inv = new THREE.Matrix4(), box = new THREE.Box3(), q = V(), pb = new THREE.Box3();
  for (const [pid, P] of Object.entries(B.props)) {
    if (!visibleInTree(P.obj)) continue;
    const { holder, move } = stage.propHolder(P, t);
    if (holder.actor || move) continue;
    pb.setFromObject(P.obj);
    if (pb.isEmpty() || pb.max.y - pb.min.y < 0.5) continue; // mats, grains: feet on them are fine
    const pts = propPoints(P.obj, 200);
    for (const [aid, A] of Object.entries(B.actors)) {
      if (!A.fig.root.visible) continue;
      const st = stage.actorState(A, t);
      if (st.posture && st.posture.to !== 'stand' && P.obj.userData.seat) continue;
      for (const part of bodyParts(A.fig)) {
        if (!['leg', 'robe', 'torso', 'hips'].includes(part.userData.bodyPart)) continue;
        inv.copy(part.matrixWorld).invert();
        box.copy(part.geometry.boundingBox).expandByScalar(-0.06);
        let n = 0;
        for (const p of pts) if (box.containsPoint(q.copy(p).applyMatrix4(inv))) n++;
        if (n >= 4) { out.push({ key: `${aid}<${pid}`, msg: `${aid}'s ${part.userData.bodyPart} goes into the prop "${pid}" on the ground (${n} points) — move him off it (a short walk) or hide / move the prop` }); break; }
      }
    }
  }
  return out;
}

// ---------- bodies / held props going into the set ----------
/** Solid boxes of the set (static): Builder groups carry userData.solids (local AABBs); other meshes marked
 *  userData.solid use their geometry bounding box. Returns [{ inv, box: [x0..z1], c: world centre }]. */
export function setSolids(B) {
  B.scene.updateMatrixWorld(true);
  const out = [];
  const isFigOrProp = (o) => { for (let x = o; x; x = x.parent) { if (x.userData?.minifig) return true; for (const P of Object.values(B.props)) if (P.obj === x) return true; } return false; };
  const add = (obj, bx) => {
    if (bx[4] <= 0.45) return; // floor-level things (ground, path tiles, mats): feet and seated figures touch them
    const inv = obj.matrixWorld.clone().invert();
    const c = V().set((bx[0] + bx[3]) / 2, (bx[1] + bx[4]) / 2, (bx[2] + bx[5]) / 2).applyMatrix4(obj.matrixWorld);
    const r = Math.hypot(bx[3] - bx[0], bx[4] - bx[1], bx[5] - bx[2]) / 2;
    let name = ''; for (let x = obj; x && !name; x = x.parent) if (x !== B.set.group) name = x.name || '';
    out.push({ obj, inv, box: bx, c, r, name: name || 'a set piece' });
  };
  B.set.group.traverse((o) => {
    if (isFigOrProp(o)) return;
    if (o.userData?.solids) for (const bx of o.userData.solids) add(o, bx);
    if (o.isMesh && o.userData?.solid) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const q = o.geometry.boundingBox; add(o, [q.min.x, q.min.y, q.min.z, q.max.x, q.max.y, q.max.z]);
    }
  });
  return out;
}
function partPoints(m, n = 16) {
  const pos = m.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / n)), pts = [];
  for (let i = 0; i < pos.count; i += step) pts.push(V().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld));
  return pts;
}
export function checkClip(stage, sc, B, t, solids) {
  const out = [];
  const q = V(), e = 0.08;
  const test = (pts, what, key) => {
    for (const p of pts) {
      for (const S of solids) {
        if (p.distanceTo(S.c) > S.r + 0.2) continue;
        q.copy(p).applyMatrix4(S.inv); const b = S.box;
        if (q.x > b[0] + e && q.x < b[3] - e && q.y > b[1] + e && q.y < b[4] - e && q.z > b[2] + e && q.z < b[5] - e) {
          out.push({ key, msg: `${what} goes into the set (${S.name}) near ${fmt(p)} — move the actor away from it (anchor offset / distance) or change the gesture` });
          return;
        }
      }
    }
  };
  for (const [aid, A] of Object.entries(B.actors)) {
    if (!A.fig.root.visible) continue;
    A.fig.root.traverse((m) => {
      const part = m.userData?.bodyPart;
      if (!m.isMesh || !['arm', 'hand', 'torso', 'head', 'leg'].includes(part)) return;
      test(partPoints(m), `${aid}'s ${part}`, `${aid}.${part}`);
    });
  }
  for (const [pid, P] of Object.entries(B.props)) {
    if (!visibleInTree(P.obj)) continue;
    const { holder, move } = stage.propHolder(P, t);
    if (!holder.actor && !move) continue;
    test(propPoints(P.obj, 60), `prop "${pid}" (held/flying)`, `prop.${pid}`);
  }
  return out;
}

// ---------- camera: subject hidden / camera inside something ----------
export function checkBlocked(stage, sc, B, t) {
  const b = beatAt(sc, t);
  const spec = (b && t >= b.start ? b.cam?.spec : sc.initialCamera) || {};
  const cam = stage.camera.position.clone();
  const targets = [];
  const head = (id) => B.actors[id]?.fig.root.visible && B.actors[id].fig.faceAnchor.getWorldPosition(V());
  if ((spec.shot === 'close' || spec.shot === 'medium') && B.actors[spec.on]) targets.push({ id: spec.on, kind: 'actor', p: head(spec.on), why: `${spec.shot} shot on` });
  if (spec.shot === 'prop' && B.props[spec.on]) targets.push({ id: spec.on, kind: 'prop', p: B.props[spec.on].obj.getWorldPosition(V()), why: 'prop shot on' });
  if (spec.shot === 'two' && Array.isArray(spec.on)) for (const id of spec.on) if (B.actors[id]) targets.push({ id, kind: 'actor', p: head(id), why: 'two-shot on' });
  const sp = b?.speech;
  if (sp && t >= sp.start && t < sp.end && B.actors[sp.speaker] && spec.shot !== 'prop' && spec.shot !== 'top' && !targets.some((x) => x.id === sp.speaker)) {
    // the speaker should be visible when they are in the frame at all
    const p = head(sp.speaker);
    if (p) {
      const ndc = p.clone().project(stage.camera);
      if (Math.abs(ndc.x) < 0.9 && Math.abs(ndc.y) < 0.9 && ndc.z < 1) targets.push({ id: sp.speaker, kind: 'actor', p, why: 'speaker' });
    }
  }
  const out = [];
  const ray = new THREE.Raycaster();
  const objs = [];
  B.scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !isGhost(o) && visibleInTree(o)) objs.push(o); });
  for (const tg of targets) {
    if (!tg.p) continue;
    // whose geometry is "part of the subject": the actor (and what they hold), or the prop and its holder
    const own = new Set();
    const addTree = (root) => root.traverse((o) => own.add(o));
    if (tg.kind === 'actor') {
      addTree(B.actors[tg.id].fig.root);
      for (const P of Object.values(B.props)) {
        const { holder, move } = stage.propHolder(P, t);
        if (holder.actor === tg.id || move?.to.actor === tg.id) addTree(P.obj);
      }
    } else {
      addTree(B.props[tg.id].obj);
      const h = stage.propHolder(B.props[tg.id], t).holder.actor; if (h && B.actors[h]) addTree(B.actors[h].fig.root);
    }
    const dir = cam.clone().sub(tg.p); const dist = dir.length(); dir.normalize();
    // from the subject towards the camera: a wall/figure the camera sits inside is entered through its front face
    ray.set(tg.p.clone().addScaledVector(dir, 0.05), dir); ray.far = dist;
    const hit = ray.intersectObjects(objs, false).find((h) => !own.has(h.object));
    if (hit) {
      const o = ownerOf(hit.object, B);
      const inCam = dist - hit.distance < 0.6;
      out.push({ key: `${tg.why}:${tg.id}:${label(o)}`, msg: inCam
        ? `camera is inside / touching ${label(o)} (${tg.why} "${tg.id}") — change dist/angle`
        : `${tg.why} "${tg.id}" is hidden by ${label(o)} near ${fmt(hit.point)} — change the shot angle or move the actors` });
    }
  }
  return out;
}


// ---------- staging: timing mistakes (pure timeline, no rendering) ----------
const LIGHT = new Set(['wave', 'nod', 'shake', 'look', 'point', 'think', 'shrug', 'receive', 'offer', 'talk']);
const HANDLING = new Set(['bow', 'offer', 'receive', 'work', 'reap', 'sow', 'cut', 'pour', 'pick', 'eat', 'pray']);
export function checkStaging(tl) {
  const out = [];
  const deg = (r) => Math.abs((((r * 180) / Math.PI) % 360 + 540) % 360 - 180);
  for (const sc of tl.scenes) {
    const A = sc.actors || {};
    for (const [id, a] of Object.entries(A)) {
      for (const g of a.gestures || []) {
        if (LIGHT.has(g.name)) continue;
        const w = (a.walking || []).find((w) => g.t0 < w.t1 - 0.15 && g.t1 > w.t0 + 0.15);
        if (w) out.push({ sc, t: g.t0, key: `walkgest.${id}.${g.t0.toFixed(1)}`, msg: `${id} starts "${g.name}" while still walking (walk ends at ${w.t1.toFixed(1)}s) — give the gesture "after": "${id}"` });
      }
      for (const h of a.head || []) {
        const w = (a.walking || []).find((w) => h.t0 > w.t1 + 0.02 && h.t0 < w.t1 + 1.2);
        if (w && deg(h.to - h.from) > 50) out.push({ sc, t: h.t0, key: `turn.${id}.${h.t0.toFixed(1)}`, msg: `${id} turns ${deg(h.to - h.from).toFixed(0)}° right after arriving — end the walk already facing there ("face" on the walk), no extra turn` });
      }
    }
    // someone / something on screen only for a flash (e.g. visible during the fade-in, hidden at the first beat):
    // start hidden ("visible": false on the cast / prop entry) instead
    const flashes = (what, init, evs) => {
      let v = init, from = sc.start;
      for (const e of [...evs, { t: sc.end, v: !v, end: true }].sort((x, y) => x.t - y.t)) {
        const nv = e.end ? null : !!(e.v ?? e.to);
        if (v && (nv === false || e.end) && e.t - from < 0.6 && !e.end) out.push({ sc, t: from, key: `flash.${what}.${from.toFixed(1)}`, msg: `${what} is on screen only ${(e.t - from).toFixed(2)} s (${from === sc.start ? 'during the fade-in, then hidden' : 'shown then hidden at once'}) — start it hidden: "visible": false on its cast / prop entry` });
        if (nv !== null && nv !== v) { v = nv; from = e.t; }
      }
    };
    for (const [id, a] of Object.entries(A)) flashes(id, a.initial?.visible !== false, a.visible || []);
    for (const [pid, P] of Object.entries(sc.props || {})) flashes(`prop "${pid}"`, P.opts?.visible !== false, P.visible || []);
    // a prop that appears in the middle of a shot: fine on a camera cut, or while someone handles it (bow / put / give…)
    const cutAt = (t) => t - sc.start < 0.45 || sc.beats.some((b) => b.camera && Math.abs(b.start - t) < 0.12);
    const handled = (t) => Object.values(A).some((a) => (a.gestures || []).some((g) => HANDLING.has(g.name) && t >= g.t0 - 0.1 && t <= g.t1 + 0.1)
      || (a.posture || []).some((p) => t >= p.t0 - 0.1 && t <= p.t1 + 0.3));
    for (const [pid, P] of Object.entries(sc.props || {})) {
      for (const v of P.visible || []) {
        if (!v.v || cutAt(v.t) || handled(v.t)) continue;
        const b = sc.beats.find((b) => v.t >= b.start && v.t < b.end);
        const talk = b?.speech && v.t < b.speech.end - 0.2 ? ` while ${b.speech.speaker} is still saying „${b.speech.text.slice(0, 40)}…” — show it after the line (a beat of its own)` : '';
        out.push({ sc, t: v.t, key: `pop.${pid}.${v.t.toFixed(1)}`, msg: `prop "${pid}" pops into view in the middle of a shot${talk}; show it on a camera cut or while someone next to it bows / puts it down` });
      }
    }
  }
  return out;
}

// ---------- the main loop ----------
/** Jump cuts (reviewer 042: „o mișcare bruscă de cadru”): at a camera cut (a beat camera without "ease") the new shot
 *  looks at the same place from nearly the same direction (< 30° apart) and the subject's size changes by less than 2.5×
 *  — the picture just jumps. Fix: "ease": 1.2 on the new camera (a glide), or another angle (≥ 30°), or a real cut-in
 *  (≥ 2.5× bigger: a wide → a close-up). Works for both stages (placeCamera + evaluate). */
export function jumpCuts(stage, sc) {
  const out = [];
  const view = (t) => {
    const r = stage.evaluate(t, { rest: true }); stage.placeCamera(r.sc, r.B, t);
    const c = stage.camera, d = new c.position.constructor(); c.getWorldDirection(d);
    // the aimed point: where the view line reaches the height of a face (≈ 2.6), else 12 ahead
    const k = d.y < -0.03 ? Math.min(40, Math.max(2, (c.position.y - 2.6) / -d.y)) : 12;
    return { p: c.position.clone(), d, aim: c.position.clone().addScaledVector(d, k), k, fov: c.fov };
  };
  for (const b of sc.beats) {
    if (!b.camera || b.camera.ease || b.index === 0) continue;
    const c0 = view(b.start - 0.03), c1 = view(b.start + 0.03);
    const moved = c0.p.distanceTo(c1.p), turn = c0.d.angleTo(c1.d);
    if (moved < 0.3 && turn < 0.03) continue;                       // the same shot: no cut
    if (turn > 0.52) continue;                                       // ≥ 30° of another direction: a real cut
    const near = Math.max(3, 0.3 * Math.min(c0.k, c1.k));
    if (c0.aim.distanceTo(c1.aim) > near) continue;                  // another subject / place
    const size = (c) => 1 / (c.k * Math.tan((c.fov * Math.PI) / 360));
    const ratio = Math.max(size(c0), size(c1)) / Math.min(size(c0), size(c1));
    if (ratio >= 2.5) continue;                                      // a clear cut-in / cut-out (wide → close-up)
    out.push({ t: b.start, beat: b.index, key: `jump.${b.index}`, depth: ratio,
      msg: `jump cut at beat #${b.index}: the new shot looks at the same place from almost the same direction (${Math.round(turn * 57.3)}° apart, ${ratio.toFixed(1)}× size) — add "ease": 1.2 to the new camera, or film from another angle (≥ 30°), or cut to a much closer / wider shot` });
  }
  return out;
}

export function runChecks(stage, { step = 0.25, shakeFps = 15, restCamera = true } = {}) {
  const tl = stage.tl;
  const warnings = [];
  const runs = new Map(); // merge consecutive identical warnings into time ranges
  const push = (type, sc, t, w) => {
    const k = `${type}|${sc.id}|${w.key}`;
    const r = runs.get(k);
    if (r && t - r.t1 <= step * 1.6) { r.t1 = t; return; }
    const e = { type, scene: sc.id, t0: t, t1: t, msg: w.msg };
    runs.set(k, e); warnings.push(e);
  };
  for (const w of checkStaging(tl)) push('staging', w.sc, w.t, w);
  for (const sc of tl.scenes) {
    for (const w of jumpCuts(stage, sc)) push('cut', sc, w.t, w);
    // static geometry: once per scene, with the props where they start
    const B = stage.evaluate(sc.start + 0.01).B;
    for (const msg of checkZFight(B)) push('zfight', sc, sc.start, { key: msg, msg });
    const solids = setSolids(B);
    // props inside bodies + hidden subjects, sampled over the scene
    for (let t = sc.start + 0.02; t < sc.end; t += step) {
      const r = stage.evaluate(t, { rest: true });
      stage.placeCamera(r.sc, r.B, t);
      const { B: Bt } = stage.evaluate(t);
      Bt.scene.updateMatrixWorld(true);
      for (const w of checkPropsInside(stage, sc, Bt, t)) push('inside', sc, t, w);
      for (const w of checkClip(stage, sc, Bt, t, solids)) push('clip', sc, t, w);
      for (const w of checkSunk(stage, sc, Bt, t)) push('sunk', sc, t, w);
      for (const w of checkActorsInProps(stage, sc, Bt, t)) push('inside', sc, t, w);
      const b = beatAt(sc, t);
      // skip the first 0.4 s of a cut and the whole glide of an "ease" move
      const ease = b?.camera?.ease ? (typeof b.camera.ease === 'number' ? b.camera.ease : 1.2) : 0;
      if (!b || t - b.start > Math.max(0.4, ease) || t < sc.beats[0]?.start) for (const w of checkBlocked(stage, sc, Bt, t)) push('blocked', sc, t, w);
    }
    // camera shake: the look direction / position reverses direction several times within one shot
    const dt = 1 / shakeFps;
    let prev = null, prevV = null, flips = [], camKey = null;
    for (let t = sc.start; t < sc.end; t += dt) {
      const r = stage.evaluate(t, { rest: restCamera });
      stage.placeCamera(r.sc, r.B, t);
      const b = beatAt(sc, t);
      const key = b && t >= b.start ? b.cam : 'init';
      const c = stage.camera; const d = V(); c.getWorldDirection(d);
      const cur = [c.position.x, c.position.y, c.position.z, d.x * 10, d.y * 10, d.z * 10];
      if (key !== camKey) { camKey = key; prev = cur; prevV = null; flips = []; continue; }
      const v = cur.map((x, i) => x - prev[i]);
      if (prevV) for (let i = 0; i < 6; i++) {
        if (Math.abs(v[i]) > 0.004 && Math.abs(prevV[i]) > 0.004 && Math.sign(v[i]) !== Math.sign(prevV[i])) flips.push({ t, i });
      }
      // a smooth move can reverse a component once; going back and forth 3+ times in a second is a shake
      flips = flips.filter((x) => t - x.t < 1.0);
      const per = [0, 1, 2, 3, 4, 5].map((i) => flips.filter((x) => x.i === i).length);
      if (Math.max(...per) >= 3) push('shake', sc, t, { key: 'shake', msg: 'camera shakes (moves back and forth) — is it following a gesture or a moving hand?' });
      prev = cur; prevV = v;
    }
  }
  return warnings.map((w) => ({ ...w, t: w.t0 }));
}

export function formatWarnings(ws) {
  if (!ws.length) return 'checks: no problems found ✓';
  return `checks: ${ws.length} problem(s)\n` + ws.map((w) => `  ⚠ [${w.type}] ${w.scene} ${w.t0.toFixed(1)}s${w.t1 > w.t0 ? '–' + w.t1.toFixed(1) + 's' : ''}: ${w.msg}`).join('\n');
}
void sceneAt;
