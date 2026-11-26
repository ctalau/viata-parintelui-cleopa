// The colliders of a Blender set (`col:*` nodes of assets/sets/<name>.glb) as 2D convex polygons in x / z (three.js),
// for the staging lint of `npm run validate` (lib/engine3/stagelint.js). Reads the GLB directly (no three.js).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './common.mjs';

const cache = new Map();

function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo.at(-2), lo.at(-1), q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up.at(-2), up.at(-1), q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function rotate(q, v) { // quaternion [x, y, z, w] · v
  const [x, y, z, w] = q, [vx, vy, vz] = v;
  const ix = w * vx + y * vz - z * vy, iy = w * vy + z * vx - x * vz, iz = w * vz + x * vy - y * vx, iw = -x * vx - y * vy - z * vz;
  return [ix * w + iw * -x + iy * -z - iz * -y, iy * w + iw * -y + iz * -x - ix * -z, iz * w + iw * -z + ix * -y - iy * -x];
}

/** [{ name, poly: [[x, z], …] }] for one set (empty if it has no GLB) */
export function setColliders(name) {
  if (cache.has(name)) return cache.get(name);
  const out = [];
  const f = path.join(ROOT, 'assets/sets', name + '.glb');
  if (fs.existsSync(f)) {
    const buf = fs.readFileSync(f);
    const jl = buf.readUInt32LE(12), J = JSON.parse(buf.toString('utf8', 20, 20 + jl));
    const binStart = 20 + jl + 8;
    for (const node of J.nodes || []) {
      const nm = node.name || '';
      if (!nm.startsWith('col:') || node.mesh == null) continue;
      const pts = [];
      let ymin = Infinity;
      for (const prim of J.meshes[node.mesh].primitives) {
        const acc = J.accessors[prim.attributes.POSITION], bv = J.bufferViews[acc.bufferView];
        const off = binStart + (bv.byteOffset || 0) + (acc.byteOffset || 0), stride = bv.byteStride || 12;
        for (let i = 0; i < acc.count; i++) {
          let v = [buf.readFloatLE(off + i * stride), buf.readFloatLE(off + i * stride + 4), buf.readFloatLE(off + i * stride + 8)];
          if (node.scale) v = v.map((c, k) => c * node.scale[k]);
          if (node.rotation) v = rotate(node.rotation, v);
          if (node.translation) v = v.map((c, k) => c + node.translation[k]);
          pts.push([v[0], v[2]]); ymin = Math.min(ymin, v[1]);
        }
      }
      // a collider above the head (a lintel, a roof beam) never stops a walk
      if (pts.length >= 3 && ymin < 3.5) out.push({ name: nm, poly: hull(pts) });
    }
  }
  cache.set(name, out);
  return out;
}
