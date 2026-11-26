// A sown field in spring (set option `"green": true` of `harvest-field`, film 045): instead of the tall golden wheat, thin
// sparse blades of young green wheat in sown rows on dark ploughed soil. Wherever someone walks through it the blades
// are trodden down — they fall along the walk as the feet pass and stay down (the time each spot is first trodden is
// worked out once from the actors' walks of the scene, then the vertex shader lays each blade down: a pure function of t).
import * as THREE from 'three';

const hash = (i, s = 0) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };

/**
 * @param {object} o
 * @param {(x:number)=>number} o.edgeZ   front edge of the field (the field is z < edgeZ(x))
 * @param {number[]} o.area             [x0, x1, zBack]
 * @param {(x:number,z:number)=>number} o.groundY
 * @param {{t:number,x:number,z:number,dx:number,dz:number}[]} o.steps   where people were, when (sampled walks)
 */
export function youngField({ edgeZ, area = [-48, 48, -34], groundY = () => 0, steps = [], rowGap = 0.45, step = 0.15 }) {
  const [x0, x1, zb] = area;
  // ---- tread map: first time a foot came within R of a cell, and the direction it was going
  const C = 0.25, R = 1.3, nx = Math.ceil((x1 - x0) / C) + 1, nz = Math.ceil((0 - zb) / C) + 1;
  const tread = new Float32Array(nx * nz).fill(1e9), dir = new Float32Array(nx * nz);
  for (const s of steps) {
    const i0 = Math.max(0, Math.floor((s.x - R - x0) / C)), i1 = Math.min(nx - 1, Math.ceil((s.x + R - x0) / C));
    const j0 = Math.max(0, Math.floor((s.z - R - zb) / C)), j1 = Math.min(nz - 1, Math.ceil((s.z + R - zb) / C));
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const cx = x0 + i * C, cz = zb + j * C, d = Math.hypot(cx - s.x, cz - s.z);
      if (d > R) continue;
      const k = i * nz + j, tt = s.t - 0.25 + 0.2 * d; // down under the foot as it lands (the edge of the strip a moment later)
      if (tt < tread[k]) { tread[k] = tt; dir[k] = Math.atan2(s.dx, s.dz) + (hash(k, 3) - 0.5) * 0.9; }
    }
  }
  const treadAt = (x, z) => {
    const i = Math.round((x - x0) / C), j = Math.round((z - zb) / C);
    if (i < 0 || j < 0 || i >= nx || j >= nz) return [1e9, 0];
    const k = i * nz + j; return [tread[k], dir[k]];
  };

  // ---- blades: 5 vertices each (a tapered, slightly curved strip, 3 triangles)
  const pos = [], col = [], root = [], tr = [], idx = [];
  let n = 0, row = 0;
  const gCache = new Map(), gy = (x, z) => { const k = `${Math.round(x / 2)},${Math.round(z / 2)}`; if (!gCache.has(k)) gCache.set(k, groundY(Math.round(x / 2) * 2, Math.round(z / 2) * 2)); return gCache.get(k); };
  for (let z = -1.2; z > zb; z -= rowGap, row++) {
    for (let x = x0; x < x1; x += step) {
      const id = row * 4099 + Math.round((x - x0) / step);
      const bx = x + (hash(id, 1) - 0.5) * step * 0.9, bz = z + (hash(id, 2) - 0.5) * 0.14;
      const e = edgeZ(bx);
      if (bz > e - 0.25) continue;
      if (hash(id, 9) < 0.12) continue; // gaps: the young wheat is sparse
      const far = Math.min(1, Math.max(0, (e - bz) / 30)); // farther back the blades are a bit shorter and denser-looking
      const h = (0.42 + 0.4 * hash(id, 4)) * (1 - 0.25 * far), w = 0.042 + 0.022 * hash(id, 5);
      const yaw = hash(id, 6) * Math.PI * 2, lean = 0.12 + 0.25 * hash(id, 7);
      const ca = Math.cos(yaw), sa = Math.sin(yaw);
      const y0 = gy(bx, bz);
      const [tt, dd] = treadAt(bx, bz);
      const g = 0.75 + 0.35 * hash(id, 8), base = [0.25 * g, 0.5 * g, 0.12 * g], tip = [0.48 * g, 0.78 * g, 0.22 * g];
      // local blade: across = (ca, 0, -sa) * w, it leans along (sa, 0, ca)
      const P = (u, v) => { const c = 1 - v * 0.85, off = lean * v * v * h; return [bx + ca * u * w * c + sa * off, y0 + v * h, bz - sa * u * w * c + ca * off]; };
      const vs = [P(-1, 0), P(1, 0), P(-0.8, 0.5), P(0.8, 0.5), P(0, 1)], vv = [0, 0, 0.5, 0.5, 1];
      vs.forEach((p, q) => {
        pos.push(...p); root.push(bx, y0, bz); tr.push(tt, dd);
        const v = vv[q]; col.push(base[0] + (tip[0] - base[0]) * v, base[1] + (tip[1] - base[1]) * v, base[2] + (tip[2] - base[2]) * v);
      });
      idx.push(n, n + 1, n + 2, n + 1, n + 3, n + 2, n + 2, n + 3, n + 4);
      n += 5;
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aRoot', new THREE.Float32BufferAttribute(root, 3));
  geo.setAttribute('aTread', new THREE.Float32BufferAttribute(tr, 2));
  geo.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  const uTime = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime;\nattribute vec3 aRoot;\nattribute vec2 aTread;\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n objectNormal = vec3(0.0, 1.0, 0.0);')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec3 o = transformed - aRoot;
        float hh = max(o.y, 0.0);
        // a light breeze (the standing blades only)
        float k = smoothstep(aTread.x, aTread.x + 0.3, uTime);
        float wave = sin(uTime * 1.6 + aRoot.x * 0.35 + aRoot.z * 0.2) * 0.6 + sin(uTime * 2.7 + aRoot.x * 0.9) * 0.4;
        o.xz += vec2(0.9, 0.3) * wave * 0.06 * hh * hh * (1.0 - k);
        // trodden: the blade falls over along the walk (about its root), nearly flat on the soil
        vec3 d = vec3(sin(aTread.y), 0.0, cos(aTread.y));
        float a = 1.38 * k;
        float along = dot(o.xz, d.xz);
        vec3 side = o - d * along - vec3(0.0, o.y, 0.0);
        float ny = o.y * cos(a) - along * sin(a), nal = o.y * sin(a) + along * cos(a);
        transformed = aRoot + side + d * nal + vec3(0.0, max(ny, 0.02 * hh), 0.0);
        vColor.rgb = mix(vColor.rgb, vec3(0.78, 0.74, 0.42), 0.7 * k); // crushed: paler, yellowish — the path shows
      }`);
  };
  mat.customProgramCacheKey = () => 'youngfield';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'young-field'; mesh.receiveShadow = true; mesh.castShadow = false; mesh.frustumCulled = false;

  // ---- the ploughed soil under it: dark brown, furrows along x
  const W = 256, H = 256, data = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const f = 0.5 + 0.5 * Math.cos((j / H) * Math.PI * 2 * 16), nse = hash(i * 977 + j, 11) * 0.12;
    const l = 0.78 + 0.22 * f + nse - 0.06;
    const q = (j * W + i) * 4; data[q] = 128 * l; data[q + 1] = 88 * l; data[q + 2] = 58 * l; data[q + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, W, H); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.needsUpdate = true;
  const sx = 96, sz = 18, sp = [], uv = [], si = [];
  for (let i = 0; i <= sx; i++) for (let j = 0; j <= sz; j++) {
    const x = x0 + (x1 - x0) * (i / sx), e = edgeZ(x) - 0.05, z = e + (zb - e) * (j / sz);
    sp.push(x, gy(x, z) + 0.05, z); uv.push(x / 4, z / (rowGap * 16));
  }
  for (let i = 0; i < sx; i++) for (let j = 0; j < sz; j++) { const a = i * (sz + 1) + j, b = a + sz + 1; si.push(a, b, a + 1, b, b + 1, a + 1); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); sg.setIndex(si); sg.computeVertexNormals();
  if (sg.attributes.normal) for (let k = 0; k < sg.attributes.normal.count; k++) sg.attributes.normal.setXYZ(k, 0, 1, 0);
  const soil = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: tex, roughness: 1, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  soil.name = 'young-field-soil'; soil.receiveShadow = true;
  const group = new THREE.Group(); group.name = 'young-field'; group.add(soil, mesh);
  return { group, uTime, dispose() { geo.dispose(); mat.dispose(); sg.dispose(); soil.material.dispose(); tex.dispose(); } };
}

/** the front edge of the harvest-field's wheat (blender/sets/harvest_field.py edge_z) */
export const harvestEdgeZ = (x) => -3 + 0.5 * Math.sin(0.11 * x + 0.4) + 0.25 * Math.sin(0.31 * x);
