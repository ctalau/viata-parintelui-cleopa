// Offline collision validation of the blender-style figures (no DOM: used by `npm run check` in the page and by the
// per-clip unit test in Node). Real posed meshes (rigid parts in their bone frame, skinned parts re-posed per sample)
// with three-mesh-bvh; a cheap AABB broad phase first. Depth = how far a vertex of A is INSIDE the closed mesh B.
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

// part -> collision class
export function partClass(name) {
  if (/^hand_[LR]$/.test(name)) return 'hand_' + name.slice(-1);
  if (/^sleeve_[LR]$/.test(name)) return 'sleeve_' + name.slice(-1);
  if (name.endsWith('_veil') || name.endsWith('_cape')) return 'cloak';   // a veil hangs from the hat onto the shoulders: cloth, like a cloak
  if (name === 'head' || name.startsWith('hair_') || name.startsWith('hat_')) return 'head';
  if (name.startsWith('beard_')) return 'beard';
  if (name === 'torso') return 'torso';
  if (name === 'skirt') return 'skirt';
  if (/^(thigh|shin|boot)_/.test(name)) return 'leg';
  if (name.startsWith('cloak_')) return 'cloak';
  return 'other';
}

// self-collision pairs: [source class, target class, tolerance]
export const SELF_PAIRS = [
  ['hand_R', 'head', 0.03], ['hand_L', 'head', 0.03], ['hand_R', 'beard', 0.08], ['hand_L', 'beard', 0.08],
  ['hand_R', 'torso', 0.075], ['hand_L', 'torso', 0.075], ['hand_R', 'hand_L', 0.07],
  ['beard', 'torso', 0.10], ['beard', 'sleeve_R', 0.20], ['beard', 'sleeve_L', 0.20], // hair is soft: it presses flat under a hand, and under the arm that crosses it to reach the far shoulder
  ['head', 'torso', 0.07], ['leg', 'skirt', 0.055], ['hand_R', 'skirt', 0.06], ['hand_L', 'skirt', 0.06],
];

// garment layers: [limb class, garment class, tolerance, limb bones (side appended)]. No cloth may cut THROUGH a limb:
// the straight line from the limb's bone to a point of its skin must not cross the garment (see coverPoke).
export const COVER_PAIRS = [
  ['sleeve_R', 'cloak', 0.05, ['uparm_R', 'forearm_R', 'hand_R']], ['sleeve_L', 'cloak', 0.05, ['uparm_L', 'forearm_L', 'hand_L']],
];

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _inv = new THREE.Matrix4();

/** collision view of one Character (lib/engine3/character.js) */
export class Body {
  constructor(char, { stride = 3 } = {}) {
    this.char = char;
    this.parts = [];
    char.model.traverse((o) => {
      if (!o.isMesh) return;
      let p = o; while (p && !p.userData?.part) p = p.parent;
      if (!p) return;
      const name = p.userData.part;
      const cls = partClass(name);
      if (cls === 'other') return;
      const g = o.geometry;
      if (!g.boundsTree && !o.isSkinnedMesh) g.boundsTree = new MeshBVH(g, { indirect: true });
      const n = g.attributes.position.count;
      const idx = []; for (let i = 0; i < n; i += stride) idx.push(i);
      this.parts.push({ name, cls, mesh: o, holder: p, skinned: !!o.isSkinnedMesh, sample: idx, posed: null, bvh: null, box: new THREE.Box3() });
    });
  }
  visibleParts() { return this.parts.filter((p) => isShown(p.mesh)); }

  /** pose-dependent data, recomputed lazily per sample (call begin() after posing) */
  begin() { for (const p of this.parts) { p.posed = null; p.bvhPosed = null; p.boxOk = false; } }

  posedPositions(p) {
    if (p.posed) return p.posed;
    const g = p.mesh.geometry, n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    p.mesh.updateWorldMatrix(true, false);
    if (p.skinned) {
      for (let i = 0; i < n; i++) { p.mesh.getVertexPosition(i, _v); _v.applyMatrix4(p.mesh.matrixWorld); arr[i * 3] = _v.x; arr[i * 3 + 1] = _v.y; arr[i * 3 + 2] = _v.z; }
    } else {
      const pos = g.attributes.position;
      for (let i = 0; i < n; i++) { _v.fromBufferAttribute(pos, i).applyMatrix4(p.mesh.matrixWorld); arr[i * 3] = _v.x; arr[i * 3 + 1] = _v.y; arr[i * 3 + 2] = _v.z; }
    }
    return (p.posed = arr);
  }
  bounds(p) {
    if (p.boxOk) return p.box;
    const a = this.posedPositions(p); p.box.makeEmpty();
    for (let i = 0; i < a.length; i += 9) p.box.expandByPoint(_v.set(a[i], a[i + 1], a[i + 2]));
    p.boxOk = true; return p.box;
  }
  /** a BVH of the part in WORLD space (skinned: rebuilt from the posed vertices) or the static one + matrix */
  target(p) {
    if (!p.skinned) { p.mesh.updateWorldMatrix(true, false); return { bvh: p.mesh.geometry.boundsTree, matrix: p.mesh.matrixWorld, inv: p.mesh.matrixWorld.clone().invert() }; }
    if (!p.bvhPosed) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(this.posedPositions(p), 3));
      if (p.mesh.geometry.index) g.setIndex(p.mesh.geometry.index);
      p.bvhPosed = { bvh: new MeshBVH(g, { indirect: true }), matrix: null, inv: null };
    }
    return p.bvhPosed;
  }
}

export function isShown(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }

const PARITY_DIRS = [new THREE.Vector3(0.123, 0.985, 0.119).normalize(), new THREE.Vector3(0.97, -0.21, 0.13).normalize(), new THREE.Vector3(-0.31, -0.18, 0.93).normalize()];
const _pray = new THREE.Ray();
const _hit = { point: new THREE.Vector3(), distance: 0, faceIndex: 0 };
const _tri = new THREE.Triangle(), _n = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
/** how deep a world point is inside the closed mesh of target T (0 if outside); maxDist bounds the search */
export function depthIn(T, wp, maxDist = 0.3) {
  const q = T.inv ? _v.copy(wp).applyMatrix4(T.inv) : _v.copy(wp);
  const r = T.bvh.closestPointToPoint(q, _hit, 0, maxDist);
  if (!r) return 0;
  const g = T.bvh.geometry, idx = g.index, pos = g.attributes.position, f = r.faceIndex * 3;
  const i0 = idx ? idx.getX(f) : f, i1 = idx ? idx.getX(f + 1) : f + 1, i2 = idx ? idx.getX(f + 2) : f + 2;
  _tri.set(_a.fromBufferAttribute(pos, i0), _b.fromBufferAttribute(pos, i1), _c.fromBufferAttribute(pos, i2));
  _tri.getNormal(_n);
  const d = _n.dot(_a.copy(q).sub(r.point));
  if (d >= 0) return 0;
  // the parts are not all closed (a torso is open at the waist, a sleeve at the cuff): a point "behind" the nearest
  // face is inside only if rays in three directions each leave through the surface an odd number of times
  for (const dir of PARITY_DIRS) {
    _pray.origin.copy(q); _pray.direction.copy(dir);
    const hits = T.bvh.raycast(_pray, THREE.DoubleSide);
    let n = 0, last = -1;
    hits.sort((x, y) => x.distance - y.distance);
    for (const h of hits) { if (h.distance - last > 1e-5) n++; last = h.distance; }
    if (n % 2 === 0) return 0;
  }
  // scale back to world units for rigid parts
  const s = T.matrix ? T.matrix.getMaxScaleOnAxis() : 1;
  return r.distance * s;
}

/** deepest penetration of part A (sampled vertices) into part B; both posed */
export function penetration(bodyA, A, bodyB, B, margin = 0.02) {
  const ba = bodyA.bounds(A), bb = bodyB.bounds(B);
  if (!ba.clone().expandByScalar(margin).intersectsBox(bb)) return { depth: 0 };
  const T = bodyB.target(B);
  const P = bodyA.posedPositions(A);
  let best = 0, at = null;
  const w = new THREE.Vector3();
  for (const i of A.sample) {
    w.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    if (!bb.containsPoint(w)) continue;
    const d = depthIn(T, w, 0.4);
    if (d > best) { best = d; at = w.clone(); }
  }
  return { depth: best, at };
}

/** self-collision of one posed body: list of { a, b, depth, at } beyond tolerance */
// pairs that touch by design (hair on cloth): only what goes deeper than in the REST pose counts for them
const REST_RELATIVE = new Set(['beard>torso', 'head>torso']);
/** the rest-pose depth of the by-design contacts of a body (call with the figure in its rest pose) */
export function restBaseline(body) {
  const base = new Map();
  body.begin();
  for (const c of selfCollisions(body, SELF_PAIRS.filter(([x, y]) => REST_RELATIVE.has(`${x}>${y}`)).map(([x, y]) => [x, y, 0]))) base.set(`${c.a}>${c.b}`, c.depth);
  const vis = body.visibleParts();
  for (const [ca, cb, , bones] of COVER_PAIRS) for (const A of vis.filter((p) => p.cls === ca)) for (const B of vis.filter((p) => p.cls === cb)) base.set(`${A.name}>>${B.name}`, coverPoke(body, A, B, bones).depth);
  body.baseline = base;
  return base;
}

export function selfCollisions(body, pairs = SELF_PAIRS) {
  const out = [];
  const vis = body.visibleParts();
  for (const [ca, cb, tol] of pairs) {
    for (const A of vis.filter((p) => p.cls === ca)) for (const B of vis.filter((p) => p.cls === cb)) {
      if (A === B) continue;
      if (ca === 'leg' && A.name.startsWith('boot_')) continue; // feet show under the hem: fine
      if (ca === 'leg') { // legs must stay under the robe: a leg vertex OUTSIDE the skirt above the hem pokes through
        const r = legPoke(body, A, B); if (r.depth > tol) out.push({ a: A.name, b: B.name, depth: r.depth, at: r.at, kind: 'poke' });
        continue;
      }
      const r = penetration(body, A, body, B);
      if (body.baseline) r.depth -= body.baseline.get(`${A.name}>${B.name}`) || 0;
      if (r.depth > tol) out.push({ a: A.name, b: B.name, depth: r.depth, at: r.at, kind: 'inside' });
    }
  }
  if (pairs === SELF_PAIRS) for (const [ca, cb, tol, bones] of COVER_PAIRS) {
    for (const A of vis.filter((p) => p.cls === ca)) for (const B of vis.filter((p) => p.cls === cb)) {
      const r = coverPoke(body, A, B, bones);
      if (body.baseline) r.depth -= body.baseline.get(`${A.name}>>${B.name}`) || 0; // where the cloth rests ON the limb (the shoulder)
      if (r.depth > tol) out.push({ a: A.name, b: B.name, depth: r.depth, at: r.at, kind: 'through' });
    }
  }
  return out;
}

/** A garment (cloak, cape) that cuts through a limb: for every sampled skin point of the limb, the segment from the
 *  nearest point of the limb's bone chain to that point must not cross the garment. Depth = how far the point sticks
 *  out of the cloth. Works in any pose and for open garments; an arm that simply leaves the hem is not a fault. */
export function coverPoke(body, limb, cover, bones) {
  const J = bones.map((n) => body.char.bones[n]?.getWorldPosition(new THREE.Vector3())).filter(Boolean);
  if (J.length < 2) return { depth: 0 };
  const P = body.posedPositions(limb), T = body.target(cover);
  let best = 0, at = null;
  const w = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3(), ab = new THREE.Vector3(), dir = new THREE.Vector3();
  for (const i of limb.sample) {
    w.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    let dmin = Infinity;
    for (let k = 0; k + 1 < J.length; k++) {
      ab.subVectors(J[k + 1], J[k]);
      const u = Math.max(0, Math.min(1, q.subVectors(w, J[k]).dot(ab) / Math.max(1e-9, ab.lengthSq())));
      q.copy(J[k]).addScaledVector(ab, u);
      const d = q.distanceToSquared(w); if (d < dmin) { dmin = d; c.copy(q); }
    }
    const L = Math.sqrt(dmin); if (L < 1e-4) continue;
    dir.subVectors(w, c).divideScalar(L);
    _ray.set(c, dir);
    const hit = T.bvh.raycastFirst(_ray, THREE.DoubleSide);
    if (hit && hit.distance < L) { const d = L - hit.distance; if (d > best) { best = d; at = w.clone(); } }
  }
  return { depth: best, at };
}

const _ray = new THREE.Ray();
/** a leg vertex above the hem that no ray outward from the body axis meets the skirt for */
export function legPoke(body, leg, skirt) {
  const P = body.posedPositions(leg);
  const T = body.target(skirt);
  const pel = body.char.bones.pelvis.getWorldPosition(new THREE.Vector3());
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(body.char.root.quaternion);
  const down = up.clone().negate();
  let hemY = body.bounds(skirt).min.y;
  if (up.y < .999999) {
    const cloth = body.posedPositions(skirt);
    hemY = Infinity;
    for (let i = 0; i < cloth.length; i += 3) hemY = Math.min(hemY, cloth[i]*up.x + cloth[i+1]*up.y + cloth[i+2]*up.z);
  }
  if (pel.dot(up) - hemY < 1.15 * (body.char.look.scale || 1)) return { depth: 0 }; // seated: the robe lies over the knees, the outward-ray test does not apply
  let best = 0, at = null;
  const w = new THREE.Vector3(), dir = new THREE.Vector3();
  for (const i of leg.sample) {
    w.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    if (w.dot(up) < hemY + 0.12) continue;
    dir.subVectors(w, pel); dir.addScaledVector(up, -dir.dot(up)); if (dir.lengthSq() < 1e-6) continue; dir.normalize();
    _ray.set(w, dir);
    const hit = T.bvh.raycastFirst(_ray, THREE.DoubleSide);
    // out through the side = no robe outward, but robe cloth below the point (under the hem is fine)
    const below = !hit && T.bvh.raycastFirst(_ray.set(w, down), THREE.DoubleSide);
    if (below) {
      // how far outside: distance to the skirt surface
      const r = T.bvh.closestPointToPoint(w, _hit, 0, 0.5);
      const d = r ? r.distance : 0.5;
      if (d > best) { best = d; at = w.clone(); }
    }
  }
  return { depth: best, at };
}

/** the lowest point of the visible boots / robe hem, world y */
export function lowest(body, cls) {
  let y = Infinity, at = null;
  for (const p of body.visibleParts()) if (p.cls === cls || (cls === 'feet' && p.name.startsWith('boot_'))) {
    const P = body.posedPositions(p);
    for (let i = 1; i < P.length; i += 3) if (P[i] < y) { y = P[i]; at = new THREE.Vector3(P[i - 1], P[i], P[i + 1]); }
  }
  return { y, at };
}

/** a closed collider mesh of the set (world BVH) */
export function colliderTarget(mesh) {
  const g = mesh.geometry;
  if (!g.boundsTree) g.boundsTree = new MeshBVH(g, { indirect: true });
  mesh.updateWorldMatrix(true, false);
  return { bvh: g.boundsTree, matrix: mesh.matrixWorld, inv: mesh.matrixWorld.clone().invert(), box: new THREE.Box3().setFromObject(mesh) };
}
// Sample the smaller actor mesh against the fixture's closed volume. Testing only
// fixture vertices misses a foot fully enclosed by a cushion or a flat bench top.
export function colliderPenetration(body, part, target) {
  if (!target.box.intersectsBox(body.bounds(part))) return 0;
  const positions = body.posedPositions(part), point = new THREE.Vector3();
  let depth = 0;
  for (const i of part.sample) {
    point.fromArray(positions, i * 3);
    if (target.box.containsPoint(point)) depth = Math.max(depth, depthIn(target, point, Infinity));
  }
  return depth;
}

void _m; void _inv;
