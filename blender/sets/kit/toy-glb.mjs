// Common Y-up modeling primitives. Bake static details together by material, preserving animated pivots.
import fs from 'node:fs';
import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
export { T };
export function group(parent, name, at = [0, 0, 0], extras = {}) {
  const g = new T.Group();
  g.name = name;
  g.position.set(...at);
  g.userData = { ...extras };
  parent?.add(g);
  return g;
}
export function material(color, rough = 0.8, metal = 0, extras = {}) {
  return { color, rough, metal, ...extras };
}
const cache = new Map();
function geo(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}
function part(p, geometry, mat, at, scale, rot) {
  const o = new T.Mesh(geometry);
  o.userData.art = mat;
  o.position.set(...at);
  o.scale.set(...scale);
  if (rot) o.rotation.set(...rot);
  p.add(o);
  return o;
}
export function box(p, at, size, mat, r = 0, rot, segments = 2) {
  const [a, b, c] = size;
  return r
    ? part(
        p,
        geo('r' + [a, b, c, r, segments], () => new RoundedBoxGeometry(a, b, c, segments, Math.min(r, a / 2, b / 2, c / 2))),
        mat,
        at,
        [1, 1, 1],
        rot,
      )
    : part(
        p,
        geo('box', () => new T.BoxGeometry()),
        mat,
        at,
        size,
        rot,
      );
}
export function egg(p, at, size, mat, rot, segments = 20) {
  return part(
    p,
    geo('egg' + segments, () => new T.SphereGeometry(1, segments, Math.round(segments * 0.7))),
    mat,
    at,
    size,
    rot,
  );
}
export function cylinder(p, at, r1, r2, h, mat, n = 28, rot) {
  return part(
    p,
    geo('cy' + [r1, r2, h, n], () => new T.CylinderGeometry(r1, r2, h, n)),
    mat,
    at,
    [1, 1, 1],
    rot,
  );
}
export function rod(p, a, b, r, mat, r2 = r) {
  const v = new T.Vector3(...b).sub(new T.Vector3(...a));
  const o = cylinder(p, a, r2, r, v.length(), mat, 12);
  o.position.addScaledVector(v, 0.5);
  o.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), v.normalize());
  return o;
}
export function loop(p, at, r, t, mat, rot = [Math.PI / 2, 0, 0], arc = Math.PI * 2) {
  return part(
    p,
    geo('ring' + [r, t, arc], () => new T.TorusGeometry(r, t, 8, 40, arc)),
    mat,
    at,
    [1, 1, 1],
    rot,
  );
}
export function path(p, points, r, mat) {
  for (let i = 1; i < points.length; i++) rod(p, points[i - 1], points[i], r, mat);
}
export function lathe(p, at, profile, mat) {
  return part(
    p,
    new T.LatheGeometry(
      profile.map(([x, y]) => new T.Vector2(x, y)),
      40,
    ),
    mat,
    at,
    [1, 1, 1],
  );
}
export function surface(p, positions, indices, mat, uv) {
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions.flat(), 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  g.setAttribute(
    'uv',
    new T.Float32BufferAttribute(uv?.flat() || new Array(positions.length * 2).fill(0), 2),
  );
  return part(p, g, mat, [0, 0, 0], [1, 1, 1]);
}
export function writeGLB(root, dest, meta) {
  const gl = {
    asset: { version: '2.0', generator: 'Școala Evlaviei · atelier de miniaturi' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [],
    meshes: [],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: [{}],
  };
  let offset = 0;
  const buffers = [],
    materials = new Map();
  function view(buf, target) {
    const i = gl.bufferViews.length;
    gl.bufferViews.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: buf.length,
      ...(target && { target }),
    });
    buffers.push(buf);
    offset += buf.length;
    const pad = (4 - (offset % 4)) % 4;
    buffers.push(Buffer.alloc(pad));
    offset += pad;
    return i;
  }
  function attr(a, n, type, ct, target, minmax = false) {
    const id = gl.accessors.length;
    const d = {
      bufferView: view(Buffer.from(a.buffer, a.byteOffset, a.byteLength), target),
      componentType: ct,
      count: a.length / n,
      type,
    };
    if (minmax) {
      d.min = Array(n).fill(Infinity);
      d.max = Array(n).fill(-Infinity);
      for (let i = 0; i < a.length; i++) {
        const j = i % n;
        d.min[j] = Math.min(a[i], d.min[j]);
        d.max[j] = Math.max(a[i], d.max[j]);
      }
    }
    gl.accessors.push(d);
    return id;
  }
  function matId(m) {
    if (typeof m === 'string') m = material(m);
    const key = JSON.stringify(m);
    if (materials.has(key)) return materials.get(key);
    const id = gl.materials.length;
    materials.set(key, id);
    const rgb = new T.Color(m.color).toArray();
    const pbr = {
      baseColorFactor: [...rgb, m.alpha ?? 1],
      roughnessFactor: m.rough,
      metallicFactor: m.metal,
    };
    const out = { name: m.name || m.color, pbrMetallicRoughness: pbr, doubleSided: true };
    if (m.alpha != null) out.alphaMode = 'BLEND';
    if (m.glow) out.emissiveFactor = rgb.map((c) => c * m.glow);
    if (m.image) {
      gl.images ||= [];
      gl.textures ||= [];
      pbr.baseColorTexture = { index: gl.textures.length };
      gl.textures.push({ source: gl.images.length });
      gl.images.push({ bufferView: view(fs.readFileSync(m.image)), mimeType: 'image/jpeg' });
    }
    gl.materials.push(out);
    return id;
  }
  function node(g) {
    const id = gl.nodes.length;
    const n = {
      name: g.name,
      extras: { name: g.name, ...g.userData },
      translation: g.position.toArray(),
      rotation: g.quaternion.toArray(),
      scale: g.scale.toArray(),
    };
    gl.nodes.push(n);
    const batches = new Map(),
      children = [];
    for (const c of g.children) {
      if (!c.isMesh) {
        children.push(node(c));
        continue;
      }
      const m = matId(c.userData.art);
      c.updateMatrix();
      let gg = c.geometry.clone().applyMatrix4(c.matrix);
      if (gg.index) gg = gg.toNonIndexed();
      gg.clearGroups();
      if (!batches.has(m)) batches.set(m, []);
      batches.get(m).push(gg);
    }
    if (children.length) n.children = children;
    if (batches.size) {
      n.mesh = gl.meshes.length;
      const primitives = [];
      for (const [material, geos] of batches) {
        const mesh = mergeVertices(mergeGeometries(geos), 0.00001),
          a = mesh.attributes;
        const attrs = {
          POSITION: attr(a.position.array, 3, 'VEC3', 5126, 34962, true),
          NORMAL: attr(a.normal.array, 3, 'VEC3', 5126, 34962),
          TEXCOORD_0: attr(a.uv.array, 2, 'VEC2', 5126, 34962),
        };
        const index = mesh.index.array;
        primitives.push({
          attributes: attrs,
          indices: attr(index, 1, 'SCALAR', index.BYTES_PER_ELEMENT === 2 ? 5123 : 5125, 34963),
          material,
        });
      }
      gl.meshes.push({ name: g.name, primitives });
    }
    return id;
  }
  node(root);
  gl.buffers[0].byteLength = offset;
  let js = Buffer.from(JSON.stringify(gl));
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 32)]);
  const head = Buffer.alloc(20),
    bin = Buffer.alloc(8);
  head.write('glTF');
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(28 + js.length + offset, 8);
  head.writeUInt32LE(js.length, 12);
  head.write('JSON', 16);
  bin.writeUInt32LE(offset);
  bin.write('BIN\0', 4);
  fs.writeFileSync(dest + '.glb', Buffer.concat([head, js, bin, ...buffers]));
  fs.writeFileSync(dest + '.json', JSON.stringify(meta, null, 1) + '\n');
}
