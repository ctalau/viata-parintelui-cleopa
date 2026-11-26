// `npm run check` for "style": "blender" films: samples the WHOLE film (10 Hz, 20 Hz while a gesture plays) on the
// real posed scene and reports, with time + scene + beat + actors:
//   self      hand / arm in own head, beard, hat, torso; beard in chest / arms; legs through the robe
//   bodies    two figures inside each other (except an authored hug / give within tolerance)
//   set       a figure inside a set collider (col:*)
//   prop      a prop on the ground inside a figure; a held prop inside its holder's body
//   ground    feet / robe sunk into the ground, or a standing figure floating
//   camera    camera inside a collider; the subject of the shot hidden; camera shake
//   jerk      a hand or the head that JUMPS between two frames (30 fps) instead of moving: two poses that are not
//             blended (a gesture cut off by another one), a layer switched on / off, a variant swapped
//   snap      the head turning / nodding faster than a calm movement (a lookAt across the body, a sudden nod)
//   skate     a figure that moves over the ground while its feet stay still in its own frame (it glides, no steps)
//   door      a set door / gate leaf going through a figure while it swings (or standing in one)
//   vanish    a figure hidden (`show: false`) while it is still in the picture and nothing hides it (not on a cut)
// Equal problems in consecutive samples are merged into one warning with a time span.
import * as THREE from 'three';
import { sceneAt, beatAt } from '../engine/timeline.js';
import { Body, selfCollisions, restBaseline, penetration, lowest, colliderTarget, colliderPenetration, depthIn, isShown } from './collide.js';
import { MeshBVH } from 'three-mesh-bvh';
import { jumpCuts } from '../engine/checks.js';

export function runChecks3(stage, { step = 0.1, dense = 0.05, from = 0, to = Infinity, only = null } = {}) {
  const tl = stage.tl;
  const raw = [];
  const bodies = new Map();
  const bodyOf = (A) => {
    if (!bodies.has(A.char)) {
      const b = new Body(A.char); bodies.set(A.char, b);
      // by-design contacts (beard / cowl resting on the robe) are measured relative to the rest pose
      const saved = [A.char.root.position.clone(), A.char.root.rotation.clone()];
      A.char.root.position.set(0, 0, 0); A.char.root.rotation.set(0, 0, 0);
      A.char.pose([]); A.char.root.updateMatrixWorld(true); restBaseline(b);
      A.char.root.position.copy(saved[0]); A.char.root.rotation.copy(saved[1]);
      b.stale = true;
    }
    return bodies.get(A.char);
  };
  const times = [];
  for (const sc of tl.scenes) {
    const s0 = Math.max(sc.start + 0.02, from), s1 = Math.min(sc.end - 0.02, to);
    let t = s0;
    while (t < s1) {
      times.push(t);
      const busy = Object.values(sc.actors).some((a) => a.gestures.some((g) => t >= g.t0 && t <= g.t1 + 0.3) || a.posture.some((p) => t >= p.t0 && t <= p.t1) || a.walking.some((w) => t >= w.t0 && t <= w.t1));
      t += busy ? dense : step;
    }
  }
  let camPrev = null, camVel = null;
  const skate = {}, seen = {};
  for (const t of times) {
    const sc = sceneAt(tl, t);
    { const B0 = stage.build(sc); for (const A of Object.values(B0.actors)) bodyOf(A); }
    const r = stage.evaluate(t, { rest: true });
    stage.placeCamera(r.sc, r.B, t);
    const { B, states } = stage.evaluate(t);
    const ids = Object.keys(B.actors).filter((id) => B.actors[id].char.root.visible);
    const beat = beatAt(sc, t);
    const push = (type, key, msg, depth = 0) => raw.push({ type, key, msg, t, scene: sc.id, beat: beat?.index ?? 0, depth });
    for (const id of ids) {
      const A = B.actors[id], body = bodyOf(A);
      body.begin();
      if (!only || only.includes('self')) {
        for (const c of selfCollisions(body)) push('self', `${id}:${c.a}>${c.b}`, `${id}: ${c.a} goes ${c.kind === 'poke' ? 'out through' : 'into'} the ${c.b} (${c.depth.toFixed(2)})`, c.depth);
      }
      // ground: feet and robe
      const st = states[id];
      const gy = st.gy;
      const feet = lowest(body, 'feet'), hem = lowest(body, 'skirt');
      const air = A.data.gestures.some((g) => /bounce|jump|joy/.test(g.name) && t >= g.t0 && t <= g.t1) || st.st.walking;
      if (feet.at) {
        const g2 = stage.groundY(B, feet.at.x, feet.at.z);
        if (feet.y < g2 - 0.05) push('ground', `${id}:sunk`, `${id}: the feet sink ${(g2 - feet.y).toFixed(2)} into the ground`, g2 - feet.y);
        if (!air && !['recline', 'side-rest', 'kneeling'].some(p => (st.st.posture.to === p && st.st.posture.k > 0) || (st.st.posture.from === p && st.st.posture.k < 1)) && st.st.sitW < 0.5 && feet.y > g2 + 0.10) push('ground', `${id}:float`, `${id}: floats ${(feet.y - g2).toFixed(2)} above the ground`, feet.y - g2);
      }
      if (hem.at) {
        const g2 = stage.groundY(B, hem.at.x, hem.at.z);
        if (hem.y < g2 - (st.st.sitW > 0 ? 0.25 : 0.04)) push('ground', `${id}:robe`, `${id}: the robe goes ${(g2 - hem.y).toFixed(2)} into the ground`, g2 - hem.y);
      }
      void gy;
      // set colliders
      if (B.colliders.length) {
        const all = body.visibleParts().filter((p) => p.cls !== 'cloak');
        const bx = new THREE.Box3(); for (const p of all) bx.union(body.bounds(p));
        for (const col of B.colliders) {
          if (!col.isMesh) continue;
          const T = col.userData.__ct || (col.userData.__ct = colliderTarget(col));
          if (!T.box.intersectsBox(bx)) continue;
          // Authored seats only exempt the actor using one of the collider's seats.
          // Older sets use proximity to preserve sitting and standing transitions on their benches.
          const seats = col.userData.seats;
          if (seats?.includes(st.seat) && st.st.sitW > 0) continue;
          if (!seats) {
            if (T.sittable === undefined) T.sittable = Object.values(B.seats).some((s) =>
              T.box.clone().expandByScalar(0.3).containsPoint(s.getWorldPosition(new THREE.Vector3())));
            if (/^col:seat/.test(col.userData?.name || col.name) || T.sittable) {
              if (st.st.sitW > 0) continue;
              const cc = T.box.getCenter(new THREE.Vector3());
              if (Math.hypot(cc.x - st.pos[0], cc.z - st.pos[1]) < 2.0) continue;
            }
          }
          let worst = 0;
          for (const p of all) worst = Math.max(worst, colliderPenetration(body, p, T));
          if (worst > 0.05) push('set', `${id}:${col.userData?.name || col.name}`, `${id} goes ${worst.toFixed(2)} into ${col.userData?.name || col.name}`, worst);
        }
      }
    }
    // skate: the root moves but the feet stay still in the figure's own frame (a pose layer overriding the walk's legs)
    if (!only || only.includes('skate')) for (const id of ids) {
      const A = B.actors[id], st = states[id], fL = A.char.bones.foot_L, fR = A.char.bones.foot_R;
      if (!fL || !fR || st.st.sitW > 0 || A.data.ride?.some?.((r) => t >= r.t)) { delete skate[id]; continue; }
      const inv = A.char.root.matrixWorld.clone().invert();
      const cur = { t, sc: sc.id, root: A.char.root.position.clone(), l: fL.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv), r: fR.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv) };
      const pv = skate[id]; skate[id] = cur;
      if (!pv || pv.sc !== sc.id || t - pv.t > 0.21 || t - pv.t < 0.01) continue;
      const dt = t - pv.t, v = Math.hypot(cur.root.x - pv.root.x, cur.root.z - pv.root.z) / dt;
      const feet = (cur.l.distanceTo(pv.l) + cur.r.distanceTo(pv.r)) / dt;
      if (v > 0.6 && v < 6 && feet < 0.25 * v) push('skate', `skate:${id}`, `${id} glides over the ground without stepping (${v.toFixed(1)}/s, the feet still) — a held pose / clip overrides the legs`);
    }
    // door: a set door / gate leaf inside a figure
    if ((!only || only.includes('door')) && B.doors) for (const [dn, D] of Object.entries(B.doors)) {
      if (!D?.o) continue;
      const leaf = []; D.o.traverse((m) => { if (m.isMesh) leaf.push(m); });
      for (const m of leaf) {
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const bb = m.geometry.boundingBox.clone().expandByScalar(-0.03), inv = m.matrixWorld.clone().invert();
        const wb = new THREE.Box3().setFromObject(m);
        for (const id of ids) {
          const body = bodyOf(B.actors[id]);
          let n = 0, deep = 0; const w = new THREE.Vector3();
          for (const part of body.visibleParts()) {
            if (part.cls === 'cloak' || !wb.intersectsBox(body.bounds(part))) continue;
            const P = body.posedPositions(part);
            for (const i of part.sample) {
              w.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(inv);
              if (!bb.containsPoint(w)) continue;
              n++; deep = Math.max(deep, Math.min(w.x - bb.min.x, bb.max.x - w.x, w.y - bb.min.y, bb.max.y - w.y, w.z - bb.min.z, bb.max.z - w.z) + 0.03);
            }
          }
          if (n > 4) push('door', `door:${dn}:${id}`, `the ${dn} door / gate goes ${deep.toFixed(2)} into ${id} — stand him clear of the leaf's swing (hinge side, leaf length), or swing it the other way`, deep);
        }
      }
    }
    // vanish: someone hidden while still in the picture (not on a cut, nothing in front of him)
    if (!only || only.includes('vanish')) {
      const cut = sc.beats.some((b) => Math.abs(b.start - t) < 0.12 && b.camera);
      for (const [id, A] of Object.entries(B.actors)) {
        const vis = A.char.root.visible, pv = seen[id]; seen[id] = { vis, t, inView: false };
        if (vis) {
          const head = A.fig.faceAnchor.getWorldPosition(new THREE.Vector3()), chest = A.char.root.position.clone().setY(A.char.root.position.y + 2.2);
          const cam = stage.camera; cam.updateMatrixWorld(true);
          const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
          let open = false;
          for (const q of [head, chest]) {
            if (!fr.containsPoint(q)) continue;
            const dir = q.clone().sub(cam.position), L = dir.length();
            const rc = new THREE.Raycaster(cam.position.clone(), dir.normalize(), 0.2, L - 0.6);
            const hits = B.setRoot ? rc.intersectObject(B.setRoot, true).filter((h) => h.object.visible !== false && !(h.object.userData?.name || h.object.name || '').startsWith('col')) : [];
            if (!hits.length) { open = true; break; }
          }
          seen[id].inView = open;
        } else if (pv && pv.vis && pv.inView && t - pv.t < 0.21 && !cut && sc.id === pv.sc) {
          push('vanish', `vanish:${id}`, `${id} disappears while still in the picture — hide him behind a closed door / a wall first, or on a camera cut`);
        }
        seen[id].sc = sc.id;
      }
    }
    // figure <-> figure
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = B.actors[ids[i]], b = B.actors[ids[j]];
      const pa = a.char.root.position, pb = b.char.root.position;
      if (Math.hypot(pa.x - pb.x, pa.z - pb.z) > 3.2) continue;
      const hug = (sc.hugs || []).some((h) => t >= h.t0 && t <= h.t1 && [h.a, h.b].includes(ids[i]) && [h.a, h.b].includes(ids[j]));
      const tol = hug ? 0.06 : 0.03;
      const BA = bodyOf(a), BB = bodyOf(b);
      let worst = 0, what = '';
      for (const A of BA.visibleParts()) for (const C of BB.visibleParts()) {
        if (A.cls === 'leg' || C.cls === 'leg') continue;
        const r1 = penetration(BA, A, BB, C);
        if (/^hand/.test(A.cls) && /^hand/.test(C.cls)) r1.depth -= 0.04; // two hands on one handle (a give) touch by design
        if (r1.depth > worst) { worst = r1.depth; what = `${A.name} / ${C.name}`; }
      }
      if (worst > tol) push('bodies', `${ids[i]}+${ids[j]}`, `${ids[i]} and ${ids[j]} go into each other (${what}, ${worst.toFixed(2)})`, worst);
    }
    // props
    for (const [pid, P] of Object.entries(B.props)) {
      if (!P.obj.visible) continue;
      const meta = stage.A.propMeta?.[P.data.type];
      const hulls = [];
      P.obj.traverse((o) => {
        if (o.isMesh && /^(col:|col_)/.test(o.userData?.name || o.name) && isShown(o.parent))
          hulls.push(colliderTarget(o));
      });
      if (meta?.soft && !hulls.length) continue;
      const h = stage.propState(P, t);
      const meshes = []; P.obj.traverse((o) => { if (o.isMesh && isShown(o) && o.userData.anim !== 'rain' && !/^col/.test(o.userData?.name || o.name)) meshes.push(o); });
      if (!meshes.length && !hulls.length) continue;
      const box = new THREE.Box3().setFromObject(P.obj);
      for (const id of ids) {
        const body = bodyOf(B.actors[id]);
        for (const part of body.visibleParts()) {
          if (h.actor === id && /hand|sleeve/.test(part.cls)) continue;
          if (P.mount && h.actor === id && t < (P.data.moves[0]?.t0 ?? Infinity) + .64 && /torso|skirt|cloak/.test(part.cls)) continue;
          if (h.actor !== id && (part.cls === 'cloak')) continue;
          const pb = body.bounds(part); if (!pb.intersectsBox(box)) continue;
          let worst = 0;
          if (!meta?.collisionParts || meta.collisionParts.includes(part.cls)) {
            for (const hull of hulls) worst = Math.max(worst, colliderPenetration(body, part, hull));
          }
          if (meta?.soft) {
            if (worst > 0.04) push('prop', `${pid}>${id}.${part.cls}`, `prop "${pid}" goes ${worst.toFixed(2)} into ${id}'s ${part.cls}`, worst);
            continue;
          }
          const T = body.target(part); const w = new THREE.Vector3();
          for (const m of meshes) {
            const pos = m.geometry.attributes.position; m.updateWorldMatrix(true, false);
            if (m.isSkinnedMesh) m.skeleton.update();
            // a skinned prop (donkey-fiesta): its vertices where the bones put them now, not in the bind pose
            for (let i = 0; i < pos.count; i += 4) { w.fromBufferAttribute(pos, i); if (m.isSkinnedMesh) m.applyBoneTransform(i, w); w.applyMatrix4(m.matrixWorld); if (!pb.containsPoint(w)) continue; const d = depthIn(T, w, 0.4); if (d > worst) worst = d; }
          }
          if (worst > 0.04) push('prop', `${pid}>${id}.${part.cls}`, `prop "${pid}" goes ${worst.toFixed(2)} into ${id}'s ${part.cls}${h.actor === id ? ' (he holds it)' : ''}`, worst);
        }
      }
    }
    // camera
    const cam = stage.camera.position;
    for (const col of B.colliders) {
      if (!col.isMesh) continue;
      const T = col.userData.__ct || (col.userData.__ct = colliderTarget(col));
      if (T.box.containsPoint(cam) && depthIn(T, cam, 2) > 0) push('camera', `cam:${col.userData?.name || col.name}`, `the camera is inside ${col.userData?.name || col.name}`);
    }
    for (const sid of stage.subjects(t)) {
      const A = B.actors[sid]; if (!A || !A.char.root.visible) continue;
      const head = A.fig.faceAnchor.getWorldPosition(new THREE.Vector3());
      const dir = head.clone().sub(cam); const L = dir.length(); dir.normalize();
      const rc = new THREE.Raycaster(cam.clone(), dir, 0.2, L - 0.8);
      const blockers = [...B.colliders.filter((c) => c.isMesh), ...ids.filter((o) => o !== sid).map((o) => B.actors[o].char.root)];
      const hits = rc.intersectObjects(blockers, true).filter((hh) => !(hh.object.isMesh && hh.object.visible === false && !(hh.object.userData?.name || '').startsWith('col')));
      if (hits.length) push('blocked', `blocked:${sid}`, `${sid}'s face is hidden from the camera (by ${hits[0].object.userData?.name || hits[0].object.name || 'something'})`);
    }
    // shake: the camera reverses direction quickly inside one shot
    const shot = beat?.cam;
    if (camPrev && camPrev.shot === shot) {
      const v = cam.clone().sub(camPrev.p);
      if (camVel && v.length() > 0.01 && camVel.length() > 0.01 && v.dot(camVel) < -0.6 * v.length() * camVel.length()) push('shake', `shake:${sc.id}:${beat.index}`, 'the camera goes back and forth');
      camVel = v;
    } else camVel = null;
    camPrev = { p: cam.clone(), shot };
  }
  if (!only || only.includes('cut')) for (const sc of tl.scenes) for (const w of jumpCuts(stage, sc)) if (w.t >= from && w.t <= to) raw.push({ type: 'cut', key: w.key, msg: w.msg, t: w.t, scene: sc.id, beat: w.beat, depth: w.depth });
  if (!only || only.includes('jerk')) raw.push(...jerks(stage, { from, to }));
  raw.sort((a, b) => a.t - b.t);
  // merge consecutive equal problems
  const out = []; const open = new Map();
  for (const w of raw) {
    const o = open.get(w.key);
    if (o && w.t - o.t1 < 0.3) { o.t1 = w.t; o.depth = Math.max(o.depth, w.depth); if (w.depth >= o.depth) o.msg = w.msg; continue; }
    const n = { type: w.type, key: w.key, msg: w.msg, scene: w.scene, beat: w.beat, t0: w.t, t1: w.t, t: w.t, depth: w.depth };
    open.set(w.key, n); out.push(n);
  }
  for (const w of out) w.msg = `${w.msg} — beat #${w.beat}`;
  return out.filter((w) => w.type !== 'shake' || w.t1 - w.t0 > 0.15 || true);
}

/** Pops: every visible figure at 30 fps, its hands and head in its own frame (so walking / turning do not count).
 *  A real movement changes speed gradually; a pop is a frame-to-frame step much larger than the steps around it. */
export const SNAP_DEG_S = 220;
export function jerks(stage, { from = 0, to = Infinity, fps = 30 } = {}) {
  const out = [], dt = 1 / fps;
  const parts = [['hand.R', 'right hand', 0.07], ['hand.L', 'left hand', 0.07], ['face', 'head', 0.05]];
  for (const sc of stage.tl.scenes) {
    const s0 = Math.max(sc.start + 0.1, from), s1 = Math.min(sc.end - 0.1, to);
    const hist = {};
    for (let t = s0; t < s1; t += dt) {
      const { B } = stage.evaluate(t);
      for (const [id, A] of Object.entries(B.actors)) {
        const H = (hist[id] ||= []);
        if (!A.char.root.visible) { H.length = 0; continue; }
        const inv = A.char.root.matrixWorld.clone().invert();
        H.push({ t, p: parts.map(([s]) => (A.char.sockets[s] ? A.char.sockets[s].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv) : null)) });
        // head orientation in the world = what the viewer sees turn (a head turn, a nod, the body turning on the spot)
        const fs = A.char.sockets.face;
        H[H.length - 1].q = fs ? fs.getWorldQuaternion(new THREE.Quaternion()) : null;
        if (H.length > 5) H.shift();
        if (H.length < 5) continue;
        // step i = H[2] -> H[3]; neighbours: H[0..2] and H[3..4]
        // snap: the head turns faster than a calm turn (deg/s averaged over 4 frames = 0.13 s; a calm look-around turns
        // ~150-200 deg/s at its fastest, a nod a little faster but small)
        if (H[0].q && H[4].q) {
          const ang = 2 * Math.acos(Math.min(1, Math.abs(H[0].q.dot(H[4].q)))) * 180 / Math.PI, speed = ang / (H[4].t - H[0].t);
          if (ang > 12 && speed > SNAP_DEG_S) {
            const beat = beatAt(sc, H[2].t);
            out.push({ type: 'snap', key: `snap:${id}`, msg: `${id}: the head turns suddenly (${Math.round(speed)}°/s)`, t: H[2].t, scene: sc.id, beat: beat?.index ?? 0, depth: speed / 1000 });
          }
        }
        parts.forEach(([, label, thr], k) => {
          const d = (i) => (H[i].p[k] && H[i + 1].p[k] ? H[i].p[k].distanceTo(H[i + 1].p[k]) : 0);
          const step = d(2), around = Math.max(d(0), d(1), d(3));
          if (step > thr && step > 2.5 * around) {
            const beat = beatAt(sc, H[3].t);
            out.push({ type: 'jerk', key: `jerk:${id}:${label}`, msg: `${id}: the ${label} jumps ${step.toFixed(2)} in one frame (two poses not blended)`, t: H[3].t, scene: sc.id, beat: beat?.index ?? 0, depth: step });
          }
        });
      }
    }
  }
  return out;
}
void MeshBVH;
