// Brick-building toolkit: palette, shared materials, and a Builder that merges many bricks
// into a few draw calls (one merged mesh per color + one InstancedMesh of studs per color).
//
// Units: 1 = stud pitch (8 mm). Brick height = 1.2, plate height = 0.4.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export const STUD = 1;
export const BRICK_H = 1.2;
export const PLATE_H = 0.4;
export const STUD_R = 0.3;
export const STUD_H = 0.18;

// Bright, toy-like palette (approximate classic brick colors).
export const COLORS = {
  white: 0xf4f4f4, black: 0x1b1b1f, darkGray: 0x5b5f63, gray: 0xa0a5a9, lightGray: 0xc8ccce,
  red: 0xc91a09, darkRed: 0x8a1a1a, orange: 0xfe8a18, yellow: 0xf2cd37, brightYellow: 0xfff03a,
  gold: 0xe0a530, tan: 0xe4cd9e, darkTan: 0x958a73, sand: 0xf0d9a6, cream: 0xf5ecd7, brown: 0x6b3f22, reddishBrown: 0x82422a,
  darkBrown: 0x3f2a1d, nougat: 0xd09168, lightNougat: 0xf6d7b3, skin: 0xffd8a8, darkSkin: 0xa0694a,
  green: 0x237841, brightGreen: 0x4b9f4a, lime: 0xbbe90b, darkGreen: 0x184632, oliveGreen: 0x9b9a5a,
  blue: 0x0055bf, darkBlue: 0x0a3463, mediumBlue: 0x5a93db, skyBlue: 0x8fd3f5, azure: 0x36aebf,
  purple: 0x81007b, magenta: 0x923978, lavender: 0xcdb4e6, pink: 0xfc97ac,
  grapePurple: 0x6a2c8c, grapeLight: 0x9b59c9,
  darkOrange: 0xa95500, mediumAzure: 0x42c0fb, breadCrust: 0xd28a3c, breadLight: 0xf2c27a, staleBread: 0x9c8462,
};
export const color = (c) => (typeof c === 'number' ? c : typeof c === 'string' && c.startsWith('#') ? parseInt(c.slice(1), 16) : COLORS[c] ?? 0xff00ff);

const matCache = new Map();
/** Shared plastic material for a color. */
export function plastic(c, opts = {}) {
  const hex = color(c);
  const key = `${hex}|${opts.transparent ? opts.opacity : ''}|${opts.emissive || ''}${opts.emissiveIntensity ?? ''}|${opts.metal || ''}`;
  if (!matCache.has(key)) {
    const m = new THREE.MeshStandardMaterial({
      color: hex, roughness: opts.metal ? 0.3 : 0.32, metalness: opts.metal ? 0.6 : 0.0,
      transparent: !!opts.transparent, opacity: opts.opacity ?? 1,
      emissive: opts.emissive ? color(opts.emissive) : 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
    });
    matCache.set(key, m);
  }
  return matCache.get(key);
}

let studGeo, studGeoBevel;
export function studGeometry() {
  if (BEVEL.on) { // "render": "vivid": a stud with a rounded top edge that catches the light
    if (!studGeoBevel) {
      const pts = [[STUD_R, 0], [STUD_R, STUD_H - 0.06], [STUD_R - 0.015, STUD_H - 0.015], [STUD_R - 0.06, STUD_H], [0, STUD_H]].map(([x, y]) => new THREE.Vector2(x, y));
      studGeoBevel = new THREE.LatheGeometry(pts, 14).toNonIndexed(); studGeoBevel.computeVertexNormals();
    }
    return studGeoBevel;
  }
  if (!studGeo) {
    studGeo = new THREE.CylinderGeometry(STUD_R, STUD_R, STUD_H, 10, 1, true);
    // open-ended + a top cap only (the bottom is never visible)
    const cap = new THREE.CircleGeometry(STUD_R, 10); cap.rotateX(-Math.PI / 2); cap.translate(0, STUD_H / 2, 0);
    studGeo = mergeGeometries([studGeo.toNonIndexed(), cap.toNonIndexed()]);
    studGeo.translate(0, STUD_H / 2, 0);
  }
  return studGeo;
}

/** Rounded-ish box: plain box with slightly beveled look via tiny inset is overkill; plain box is fine. */
function boxGeo(w, h, d) {
  // "render": "vivid" films: bricks with softly rounded edges (light runs along every edge, like real moulded bricks)
  if (BEVEL.on) { const r = Math.min(0.07, w * 0.3, h * 0.3, d * 0.3); if (r > 0.015) return new RoundedBoxGeometry(w, h, d, 1, r); }
  return new THREE.BoxGeometry(w, h, d);
}

/**
 * Builder: add bricks/plates/tiles/slopes in stud coordinates, then build() -> THREE.Group.
 * Positions are the min corner (x, z in studs, y in world units) unless noted.
 */
export class Builder {
  constructor() { this.parts = new Map(); this.studs = new Map(); this.solids = []; }
  // solids: local AABBs [x0,y0,z0,x1,y1,z1] of every piece → group.userData.solids (used by the `clip` check)
  _solid(x0, y0, z0, x1, y1, z1) { this.solids.push([x0, y0, z0, x1, y1, z1]); }
  _push(c, geo, opts = {}) {
    const k = String(color(c)) + (opts.transparent ? 't' : '');
    if (!this.parts.has(k)) this.parts.set(k, { c, opts, geos: [] });
    this.parts.get(k).geos.push(geo);
  }
  _stud(c, x, y, z) {
    if (SMOOTH.on) return; // smooth (stud-less) town style
    const k = String(color(c));
    if (!this.studs.has(k)) this.studs.set(k, { c, list: [] });
    this.studs.get(k).list.push([x, y, z]);
  }
  /** Brick of w x d studs, hp plates tall (3 = one brick). x,z = min corner, y = bottom. */
  brick(x, y, z, w, d, hp, c, { studs = true, transparent = false } = {}) {
    const h = hp * PLATE_H;
    const g = boxGeo(w - 0.02, h - 0.01, d - 0.02);
    g.translate(x + w / 2, y + h / 2, z + d / 2);
    this._push(c, g, { transparent });
    this._solid(x, y, z, x + w, y + h, z + d);
    if (studs) for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) this._stud(c, x + i + 0.5, y + h, z + j + 0.5);
    return this;
  }
  plate(x, y, z, w, d, c, o) { return this.brick(x, y, z, w, d, 1, c, o); }
  tile(x, y, z, w, d, c) { return this.brick(x, y, z, w, d, 1, c, { studs: false }); }
  /** Round 1x1 brick / cylinder column (center coords). */
  round(cx, y, cz, r, h, c, { studs = true, seg = 16 } = {}) {
    const g = new THREE.CylinderGeometry(r, r, h, seg);
    g.translate(cx, y + h / 2, cz);
    this._push(c, g);
    this._solid(cx - r, y, cz - r, cx + r, y + h, cz + r);
    if (studs) this._stud(c, cx, y + h, cz);
    return this;
  }
  /** Slope brick: w (along x) x d (along z) footprint, slope descending towards +z (dir rotates). */
  slope(x, y, z, w, d, hp, c, dir = 0) {
    const h = hp * PLATE_H;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0); shape.lineTo(d, 0); shape.lineTo(d, h * 0.15); shape.lineTo(Math.min(0.5, d), h); shape.lineTo(0, h); shape.lineTo(0, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: w - 0.02, bevelEnabled: false });
    // shape lies in XY (x = depth direction), extrude along Z(width). Re-orient: shape-x -> world z, extrude -> world x
    g.rotateY(-Math.PI / 2); // shape x -> world z (downhill), extrusion -> world x
    g.computeBoundingBox();
    const bb = g.boundingBox;
    g.translate(-bb.min.x, -bb.min.y, -bb.min.z);
    if (dir) { g.translate(-w / 2, 0, -d / 2); g.rotateY(dir * Math.PI / 2); g.translate((dir % 2 ? d : w) / 2, 0, (dir % 2 ? w : d) / 2); }
    g.translate(x, y, z);
    this._push(c, g);
    g.computeBoundingBox(); const q = g.boundingBox; this._solid(q.min.x, q.min.y, q.min.z, q.max.x, q.max.y, q.max.z);
    return this;
  }
  /** Arbitrary geometry (already positioned) in a color. */
  geo(g, c, opts) { this._push(c, g, opts); return this; }

  build({ castShadow = true, receiveShadow = true } = {}) {
    const group = new THREE.Group();
    group.userData.solids = this.solids;
    for (const { c, opts, geos } of this.parts.values()) {
      const g = mergeGeometries(geos.map((x) => (x.index ? x.toNonIndexed() : x)), false);
      const mesh = new THREE.Mesh(g, plastic(c, opts.transparent ? { transparent: true, opacity: 0.6 } : {}));
      mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
    const sg = studGeometry();
    const m4 = new THREE.Matrix4();
    for (const { c, list } of this.studs.values()) {
      const inst = new THREE.InstancedMesh(sg, plastic(c), list.length);
      list.forEach(([x, y, z], i) => { m4.makeTranslation(x, y, z); inst.setMatrixAt(i, m4); });
      inst.castShadow = false; inst.receiveShadow = receiveShadow;
      group.add(inst);
    }
    return group;
  }
}

// Smooth style ("smooth": true on a set, or a film with "style": "blocky"): bricks are built without studs.
// Set only while a set is being built (createSet), so it is still a pure function of the descriptor.
export const SMOOTH = { on: false };
// Bevelled bricks + studs: on only while a scene of a `"render": "vivid"` film is being built (Stage.build).
export const BEVEL = { on: false };

/** Simple seeded RNG for deterministic procedural sets. */
export function rng(seed = 1) {
  let s = seed >>> 0 || 1;
  return () => ((s = Math.imul(s ^ (s >>> 15), 2246822519) ^ Math.imul(s ^ (s >>> 13), 3266489917)) >>> 0, (s >>> 0) / 4294967296);
}
