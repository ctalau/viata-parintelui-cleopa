// The "yarn elder" head (look `head: "yarn"`): the old monk's head of the cartoons-learning repo (demos/monk-head) on the
// toy monk's body. Built by blender/characters/build_yarn_elder.py → assets/characters/yarn-elder.glb: barrel head,
// glossy oval eyes, a mouth with morph targets, brows / moustache on their own bones, a wool beard of 42 locks (7 bones
// each) and a soft hood resting on the shoulders. Head radius 1 in its own units; here it is scaled 0.56 and its centre
// sits at y 3.45 of the figure (the toy head's centre), hung on the chest bone, and driven by the toy head bone.
//
// The demo simulated the beard with inertia (state carried from frame to frame). A film frame must be a pure function of
// t (docs/ENGINE.md), so here the beard is DRAPED every frame from scratch: every lock starts where the head carries it
// (its lower half hanging rather than pitching with the head), then the same constraints as the demo — lock lengths,
// neighbouring locks held together, the hem moving as one mass, a tether to where the head carries it, and solids:
// the head, the chest of the toy figure and its forearms / hands (a blessing hand passes in front of the beard).
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion, M4 = THREE.Matrix4;
export const YARN_SCALE = 0.56, YARN_Y = 3.45;
const UP = new V3(0, 1, 0);
const PIV = new V3(0, -0.9, 0);        // the base of the neck (head units): the gentle rest tilt of the demo turns about it
const REST_TILT = 0;                    // (the demo tilted the head 0.11 forward: here a toy hat on the head bone must stay on it)
// the toy torso (model units, from the chest down): [y, half width, half depth] — = TOR in character.js guardHands
const TOR = [[1.30, 0.76, 0.46], [1.70, 0.735, 0.44], [2.20, 0.675, 0.415], [2.60, 0.60, 0.385], [2.77, 0.49, 0.335], [2.88, 0.25, 0.23]];
const TETHER = [0, 0.04, 0.1, 0.2, 0.34, 0.5, 0.7];   // how far each joint of a lock may stray from where the head carries it
const MATCH = [0, 0, 0, 0.12, 0.2, 0.3, 0.4];         // lower joints keep their arrangement: the hem moves as one mass

// ------------------------------------------------------------------ procedural textures (shared, browser only)
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const yarnH = (u, v) => {
  // rope: every ply of a lock is itself a twisted rope — plump diagonal strands (3 round the ply) with deep grooves
  // between them and fine fibres running along each strand. Smooth functions only (it tiles in u and v).
  const w = 0.04 * Math.sin(6.283 * (v * 2 + u));
  const ph = u * 3 + v * 4 + w, f = ph - Math.floor(ph);
  const ridge = Math.pow(Math.sin(Math.PI * f), 0.6);
  const fib = 0.5 + 0.5 * Math.sin(6.283 * (ph * 5 + 0.25 * Math.sin(6.283 * (u * 2 - v * 3))));
  const fuzz = 0.5 + 0.5 * Math.sin(6.283 * (u * 47 - v * 31 + 0.6 * Math.sin(6.283 * (u * 5 + v * 9))));
  return 0.12 + 0.62 * ridge + 0.16 * fib * ridge + 0.06 * fuzz;
};
// the earlier, fluffy wool (look `wool: "soft"`)
const yarnSoftH = (u, v) => {
  // plied yarn: three plies twisting round the lock (diagonal ridges), fibres along them
  const p = Math.abs(Math.sin(Math.PI * (u * 2 + v * 1.6))); const f = Math.sin((u * 4 - v) * 6.283 * 2) * 0.5 + 0.5;
  return Math.pow(p, 0.45) * 0.36 + 0.12 + f * 0.05 + (hash(Math.floor(u * 90 + v * 14), Math.floor(v * 7)) * 0.6 + hash(Math.floor(u * 41 - v * 9), Math.floor(v * 3 + 7)) * 0.4) * 0.17
    + (hash(Math.floor(u * 260 + v * 37), Math.floor(v * 22)) * 0.55 + hash(Math.floor(u * 173 - v * 29), Math.floor(v * 13 + 3)) * 0.45) * 0.2 + hash(Math.floor(u * 512), Math.floor(v * 512)) * 0.08;
};
const yarnH0 = (u, v) => {
  const p = Math.abs(Math.sin(Math.PI * (u * 2 + v * 2))); const f = Math.sin((u * 4 - v) * 6.283 * 2) * 0.5 + 0.5;
  const fib = hash(Math.floor(u * 90 + v * 14), Math.floor(v * 7)) * 0.6 + hash(Math.floor(u * 41 - v * 9), Math.floor(v * 3 + 7)) * 0.4;
  const fine = hash(Math.floor(u * 260 + v * 37), Math.floor(v * 22)) * 0.55 + hash(Math.floor(u * 173 - v * 29), Math.floor(v * 13 + 3)) * 0.45;
  return (0.94 + 0.06 * Math.pow(p, 0.7)) * 0.42 + f * 0.04 + fib * 0.22 + fine * 0.24 + hash(Math.floor(u * 512), Math.floor(v * 512)) * 0.08;
};
const weaveH = (u, v) => {
  const n = 6, cx = Math.floor(u * n), cy = Math.floor(v * n), fx = u * n - cx, fy = v * n - cy;
  const a = (cx + cy) % 2 ? Math.sin(Math.PI * fx) * (0.7 + 0.3 * Math.sin(Math.PI * fy)) : Math.sin(Math.PI * fy) * (0.7 + 0.3 * Math.sin(Math.PI * fx));
  const fib = (cx + cy) % 2 ? Math.sin(fx * 40) : Math.sin(fy * 40);
  return (Math.pow(Math.max(a, 0), 0.7) * 0.8 + fib * 0.06) * (0.72 + 0.28 * hash(cx, cy)) + hash(Math.floor(u * 256), Math.floor(v * 256)) * 0.16;
};
const shade = (h, lo) => (u, v) => lo + (1 - lo) * h(u, v);
function canvasTex(size, draw, repeat, srgb) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const v = Math.max(0, Math.min(1, draw(x / size, y / size))) * 255, i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]); t.anisotropy = 4; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t;
}
let TEX = null;
function textures() {
  if (TEX !== null) return TEX;
  if (typeof document === 'undefined') return (TEX = false);
  return (TEX = {
    woolMap: canvasTex(512, shade(yarnH, 0.6), [1, 0.55], true), woolBump: canvasTex(512, yarnH, [1, 0.55]),
    softMap: canvasTex(512, shade(yarnSoftH, 0.72), [1, 0.55], true), softBump: canvasTex(512, yarnSoftH, [1, 0.55]),
    weaveMap: canvasTex(256, shade(weaveH, 0.62), [4, 4], true), weaveBump: canvasTex(256, weaveH, [4, 4]),
  });
}
const WOOL = { white: 0xf3ebd9, ash: 0xd8ccb4, cream: 0xe9d9b8 };

const ease = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const about = (c, m) => new M4().makeTranslation(c.x, c.y, c.z).multiply(m).multiply(new M4().makeTranslation(-c.x, -c.y, -c.z));

/** the demo's named face parameters from the film's face state ({ expr, blink, mouth, talk, gazeX, gazeY, brow }) */
export function yarnFace(f) {
  const P = { idle: f?.talk ? 0 : 1, joy: 0, wonder: 0, surprise: 0, sad: 0, think: 0, aa: 0, ee: 0, oo: 0, mclose: 0, lookX: 0, lookY: 0, lids: 0, browL: 0, browR: 0 };
  const e = f?.expr || 'neutral';
  ({
    // calm faces keep a quiet, closed mouth (no smile at rest — the user's note); joy / happy smile
    neutral: () => {}, warm: () => {}, gentle: () => {}, happy: () => { P.joy = 0.55; },
    joy: () => { P.joy = 1; }, sad: () => { P.sad = 0.85; P.lookY = -0.5; }, ashamed: () => { P.sad = 0.55; P.lookY = -0.8; P.lids = 0.3; },
    surprised: () => { P.surprise = 0.9; }, thinking: () => { P.think = 0.6; P.lookY = 0.7; P.lookX = -0.4; },
    angry: () => { P.browL = P.browR = -0.6; }, sleepy: () => { P.lids = 0.6; }, asleep: () => { P.lids = 1; }, sick: () => { P.sad = 0.4; P.lids = 0.3; },
    pray: () => { P.lids = 1; }, humble: () => { P.joy = 0.2; P.lids = 0.35; P.lookY = -0.5; },
  }[e] || (() => { P.joy = 0.15; }))();
  if (f) {
    P.lids = Math.max(P.lids, f.blink || 0);
    P.lookX += f.gazeX || 0; P.lookY += f.gazeY || 0;
    const m = f.talk ? Math.max(0, Math.min(1, f.mouth || 0)) : 0;
    if (f.talk) {
      P.aa = 0.95 * ease(0.25, 0.85, m); P.ee = 0.6 * ease(0.08, 0.35, m) * (1 - P.aa); P.mclose = 1 - ease(0.04, 0.18, m);
    }
    // the brows do not move while he talks (they read as twitching): they follow the expression only
  }
  return P;
}

export class YarnHead {
  /** gltf: the parsed yarn-elder.glb; char: the Character (lib/engine3/character.js) at its rest pose */
  constructor(gltf, char, soft = false) {
    this.char = char; this.soft = soft;
    const scene = this.scene = cloneSkinned(gltf.scene);
    const holder = this.holder = new THREE.Group(); holder.name = 'yarn-head'; holder.matrixAutoUpdate = false;
    holder.add(scene);
    const model = char.model, chest = char.bones.chest, head = char.bones.head;
    model.updateMatrixWorld(true);
    const rel = (o) => new M4().copy(model.matrixWorld).invert().multiply(o.matrixWorld);
    this.Y0 = new M4().compose(new V3(0, YARN_Y, 0), new Q(), new V3(YARN_SCALE, YARN_SCALE, YARN_SCALE));
    this.HrestInv = rel(head).invert();
    holder.matrix.copy(rel(chest).invert()).multiply(this.Y0);
    chest.add(holder);
    holder.updateMatrixWorld(true);
    const hInv = new M4().copy(holder.matrixWorld).invert();
    this.bones = {}; this.order = []; this.meshes = {};
    scene.traverse((o) => {
      if (o.isBone) {
        this.bones[o.name] = o; this.order.push(o); o.matrixAutoUpdate = false;
        const rest = hInv.clone().multiply(o.matrixWorld);
        o.userData.rest = rest; o.userData.rp = new V3().setFromMatrixPosition(rest); o.userData.D = new M4(); o.userData.W = rest.clone();
      }
      if (o.isMesh) { o.frustumCulled = false; o.castShadow = o.receiveShadow = true; this.meshes[o.name] = o; }
    });
    for (const b of this.order) if (!b.parent.isBone) b.userData.parRest = hInv.clone().multiply(b.parent.matrixWorld);
    for (const n of ['Eyes', 'EyeHi', 'Mouth', 'Tongue', 'Blush', 'Lines']) if (this.meshes[n]) this.meshes[n].castShadow = false;
    // the wool and the hood out of the shadow maps of themselves: a lock's shadow crawling over the beard as the head
    // talks reads as flicker (reviewer, film 042 — the same rule as the sculpted beards in character.js)
    if (this.meshes.Wool) { this.meshes.Wool.castShadow = false; }
    // the collision checks (collide.js partClass): the skin is the head, the wool a beard
    if (this.meshes.Skin) this.meshes.Skin.userData.part = 'head';
    if (this.meshes.Wool) this.meshes.Wool.userData.part = 'beard_yarn';
    this.makeMaterials();
    this.buildLids();
    // beard locks
    const B = this.bones, strands = [];
    for (let s = 0; B['s' + s + '_0']; s++) {
      const bs = []; for (let k = 0; B['s' + s + '_' + k]; k++) bs.push(B['s' + s + '_' + k]);
      const rest = bs.map((b) => b.userData.rp.clone());
      strands.push({ bs, rest, p: rest.map((v) => v.clone()), t: rest.map((v) => v.clone()), side: Math.abs(rest[0].x) > 0.74,
        len: rest.slice(1).map((v, i) => v.distanceTo(rest[i])), dir: rest.slice(1).map((v, i) => v.clone().sub(rest[i]).normalize()) });
    }
    const pairs = [];
    for (let i = 0; i < strands.length; i++) for (let j = i + 1; j < strands.length; j++) {
      const A = strands[i].rest, B2 = strands[j].rest;
      if (A[2].distanceTo(B2[2]) < 0.3) pairs.push([i, j, A.map((v, k) => v.distanceTo(B2[k]))]);
    }
    this.strands = strands; this.pairs = pairs;
    this.Dh = new M4(); this.headQ = new Q();
    this.on = true;
  }

  makeMaterials() {
    const T = textures();
    this.mat = {
      skin: new THREE.MeshPhysicalMaterial({ color: 0xf79600, emissive: 0x301400, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.3 }),
      blush: new THREE.MeshBasicMaterial({ color: 0xff6a40, transparent: true, opacity: 0.12, depthWrite: false }),
      eye: new THREE.MeshPhysicalMaterial({ color: 0x08080a, roughness: 0.06, clearcoat: 1 }),
      eyehi: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      line: new THREE.MeshStandardMaterial({ color: 0x8a5a20, roughness: 0.8, transparent: true, opacity: 0.55 }),
      mouth: new THREE.MeshStandardMaterial({ color: 0x4a0c10, roughness: 0.7 }),
      tongue: new THREE.MeshStandardMaterial({ color: 0xe2402c, roughness: 0.45 }),
      wool: new THREE.MeshStandardMaterial({ color: 0xe9d9b8, roughness: 1, metalness: 0, envMapIntensity: 0.45,
        ...(T ? (this.soft ? { map: T.softMap, bumpMap: T.softBump, bumpScale: 2.4 } : { map: T.woolMap, bumpMap: T.woolBump, bumpScale: 4 }) : {}) }),
      cloak: new THREE.MeshPhysicalMaterial({ color: 0x37333a, roughness: 1, sheen: 1, sheenRoughness: 0.5, sheenColor: 0x9a90a0, side: THREE.DoubleSide,
        ...(T ? { map: T.weaveMap, bumpMap: T.weaveBump, bumpScale: 4 } : {}) }),
    };
    // darker creases between locks: wool turning away from the eye falls into warm shadow
    this.mat.wool.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  { float nv=clamp(dot(normalize(vNormal), normalize(vViewPosition)),0.,1.); diffuseColor.rgb*=mix(${this.soft ? 'vec3(.64,.57,.49)' : 'vec3(.5,.42,.32)'}, vec3(1.), smoothstep(.02,${this.soft ? '.6' : '.65'},nv)); }`);
    };
    this.mat.wool.customProgramCacheKey = () => 'yarn-wool' + (this.soft ? '-soft' : '');
    this.lidMat = this.mat.skin.clone(); this.lidMat.side = THREE.DoubleSide;
    for (const o of Object.values(this.meshes)) { const k = o.material?.name; if (this.mat[k]) o.material = this.mat[k]; }
  }

  /** colours from the character's resolved look */
  setLook(L) {
    const m = this.mat;
    m.skin.color.setHex(L.skinHex); if (L.skinHex === 0xf7c52e) m.skin.color.setHex(0xf4b400); m.skin.emissive.setHex(0x2a1400); this.lidMat.color.copy(m.skin.color);
    m.wool.color.setHex(WOOL[L.beardColor] ?? colorOf(L.beardColor, 0xe9d9b8));
    const hood = L.hoodColor ?? (L.cloakColor || 0x37333a);
    m.cloak.color.setHex(colorOf(hood, 0x37333a));
    m.cloak.sheenColor.copy(m.cloak.color).multiplyScalar(1.6).addScalar(0.15);
    // `hood: false`: no woven hood — the toy `hat` (a cap…) sits on the head instead
    if (this.meshes.Cloak) this.meshes.Cloak.visible = L.hood === 'small';
    this.collar = L.hood !== 'small' && L.hood !== false;   // the knitted collar of the yarnhood round the neck: the beard lies over it   // the default hood is the toy's knitted `yarnhood` (monk.glb)
  }

  buildLids() {
    const lids = []; const B = this.bones;
    for (const [sd, sx] of [['L', 1], ['R', -1]]) {
      const th = sx * 0.265, c = B['eye' + sd].userData.rp;
      for (const up of [true, false]) {
        const NU = 19, NV = 7, g = new THREE.BufferGeometry(), pos = new Float32Array(NU * NV * 3), idx = [];
        for (let j = 0; j < NV - 1; j++) for (let i = 0; i < NU - 1; i++) { const a = j * NU + i; if (up) idx.push(a, a + NU, a + 1, a + 1, a + NU, a + NU + 1); else idx.push(a, a + 1, a + NU, a + 1, a + NU + 1, a + NU); }
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(idx);
        const nr = new Float32Array(NU * NV * 3); for (let q = 0; q < NU * NV; q++) { nr[q * 3] = Math.sin(th); nr[q * 3 + 1] = 0; nr[q * 3 + 2] = Math.cos(th); }
        g.setAttribute('normal', new THREE.BufferAttribute(nr, 3));
        const m = new THREE.Mesh(g, this.lidMat); m.matrixAutoUpdate = false; m.frustumCulled = false; m.castShadow = false; this.holder.add(m);
        lids.push({ m, pos, NU, NV, up, sx, sd, c, t: new V3(Math.cos(th), 0, -Math.sin(th)), n: new V3(Math.sin(th), 0, Math.cos(th)) });
      }
    }
    this.lids = lids;
  }

  /** after the toy figure is posed (Character.pose): the head follows the toy head bone, the face the film's face state */
  pose(face) {
    const char = this.char, model = char.model, B = this.bones;
    this.holder.updateMatrixWorld(true);
    // Dh = (holder space) <- toy head bone motion from its rest: inv(Y) · H · inv(Hrest) · Y0, all relative to the model
    const mInv = new M4().copy(model.matrixWorld).invert();
    const Y = mInv.clone().multiply(this.holder.matrixWorld), H = mInv.clone().multiply(char.bones.head.matrixWorld);
    const Dh = this.Dh.copy(Y.invert()).multiply(H).multiply(this.HrestInv).multiply(this.Y0);
    Dh.multiply(about(PIV, new M4().makeRotationX(REST_TILT)));
    // the rotation part (the toy head has a face-shape scale: normalise it away)
    const sx = new V3().setFromMatrixColumn(Dh, 0).length() || 1;
    if (Math.abs(sx - 1) > 1e-4) { const pos = new V3().setFromMatrixPosition(Dh); const q = new Q().setFromRotationMatrix(new M4().extractRotation(Dh)); Dh.compose(pos, q, new V3(1, 1, 1)); }
    const headQ = this.headQ.setFromRotationMatrix(Dh);
    const fwd = new V3(0, 0, 1).applyQuaternion(headQ), yaw = Math.atan2(fwd.x, fwd.z);
    const P = yarnFace(face);
    B.head.userData.D.copy(Dh);
    // ---- face (the demo's pose(): eyes, brows, moustache, lids, mouth)
    const talkAmt = Math.min(1, P.aa + P.ee + P.oo + P.mclose), ex = 1 - 0.75 * talkAmt;
    const kind = Math.max(0, 1 - P.surprise - 0.6 * P.wonder - 0.3 * P.sad);
    const jaw = this.jaw = Math.max(0, 0.9 * P.surprise * ex + 0.5 * P.joy * ex + 0.9 * P.aa + 0.3 * P.ee + 0.4 * P.oo + 0.35 * P.wonder * ex);
    const blink = Math.min(1, P.lids);
    for (const [sd, s] of [['L', 1], ['R', -1]]) {
      const n = new V3(Math.sin(s * 0.265), 0, Math.cos(s * 0.265));
      const sy = (1 + 0.2 * P.wonder + 0.45 * P.surprise - 0.2 * P.joy - 0.06 * P.sad) * (1 - 0.75 * blink), sxx = 1 + 0.1 * P.wonder + 0.12 * P.surprise;
      const eb = B['eye' + sd], c = eb.userData.rp;
      const loc = new M4().makeRotationY(P.lookX * 0.075).multiply(new M4().makeTranslation(0, P.lookY * 0.05 + 0.02 * P.surprise + 0.015 * P.joy, 0)).multiply(about(c, new M4().makeScale(sxx, sy, 1)));
      eb.userData.D.multiplyMatrices(Dh, loc);
      const extra = sd === 'L' ? P.browL : P.browR;
      const raise = 0.09 * P.joy + 0.17 * P.wonder + 0.14 * P.surprise + 0.12 * P.sad + 0.09 * extra - 0.02 * kind;
      const tilt = -s * (0.36 * P.sad + 0.04 * P.wonder - 0.14 * P.joy - 0.12 * P.surprise + 0.14 * extra + 0.3 * kind);
      const bb = B['brow' + sd], cb = bb.userData.rp;
      bb.userData.D.multiplyMatrices(Dh, new M4().makeTranslation(0, raise, 0).multiply(about(cb, new M4().makeRotationAxis(n, tilt))));
      const mb = B['must' + sd], cm = mb.userData.rp;
      // the wool does not follow the talking mouth (a beard and moustache that jumped with every syllable flickered)
      const ma = s * (0.22 * P.joy - 0.2 * P.sad - 0.08 * P.surprise + 0.05 * P.wonder + 0.05 * P.think * s);
      mb.userData.D.multiplyMatrices(Dh, about(cm, new M4().makeRotationZ(ma)).premultiply(new M4().makeTranslation(0, 0.02 * P.joy + 0.02 * P.surprise + 0.06 * P.sad + 0.02 * P.wonder, 0)));
    }
    for (const L of this.lids) {
      const { pos, NU, NV, c, t, n } = L, A = 0.082 * 1.04, Bh = 0.117 * 1.03, C = 0.044 * 1.14; let o = 0;
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
        const u = -1 + 2 * i / (NU - 1), w = j / (NV - 1); let v;
        if (L.up) { const e = Math.max(-1, 1 - 2 * blink - 0.22 * blink * (1 - blink) * u * u); v = 1 - w * (1 - e); } else { const e = Math.min(0.9, -1); v = -1 + w * (e + 1); }
        const sq = Math.sqrt(Math.max(0, 1 - v * v)), x = A * u * sq, z = C * Math.sqrt(Math.max(0, 1 - u * u)) * sq;
        pos[o++] = c.x + t.x * x + n.x * z; pos[o++] = c.y + Bh * v; pos[o++] = c.z + t.z * x + n.z * z;
      }
      L.m.geometry.attributes.position.needsUpdate = true;
      L.m.matrix.copy(B['eye' + L.sd].userData.D); L.m.matrixWorldNeedsUpdate = true;
    }
    const w = { smileOpen: 0.95 * P.joy * ex, O: P.surprise * ex, wow: P.wonder * ex, oo: P.oo, sad: P.sad * ex, aa: P.aa, ee: P.ee, mm: P.mclose, purse: 0.9 * P.think * ex,
      smile: 0.6 * P.joy * (1 - ex) };
    // at rest the lips close into a calm line (the mouth's basis shape is a little smile)
    w.mm = Math.min(1, w.mm + 1.0 * P.idle * (1 - P.joy) * (1 - P.surprise) * (1 - P.sad));
    for (const mn of ['Mouth', 'Tongue']) {
      const m = this.meshes[mn]; if (!m || !m.morphTargetDictionary) continue;
      for (const k in w) { const i = m.morphTargetDictionary[k]; if (i !== undefined) m.morphTargetInfluences[i] = Math.max(0, w[k]); }
    }
    // ---- the beard, draped from scratch
    this.drape(Dh, headQ, yaw, 0);
    // ---- bones → matrices
    for (const bn of this.order) {
      const W = bn.userData.W.multiplyMatrices(bn.userData.D, bn.userData.rest);
      const pw = bn.parent.isBone ? bn.parent.userData.W : bn.userData.parRest;
      bn.matrix.copy(pw).invert().multiply(W);
    }
    this.holder.updateMatrixWorld(true);
  }

  /** the toy figure's forearms + hands as capsules in head units (a blessing hand in front of the beard pushes it) */
  limbs() {
    const char = this.char, inv = new M4().copy(this.holder.matrixWorld).invert(), out = [];
    for (const s of ['L', 'R']) {
      const fo = char.bones['forearm_' + s], ha = char.bones['hand_' + s], tip = char.sockets['hand.' + s];
      if (!fo || !ha) continue;
      const a = fo.getWorldPosition(new V3()).applyMatrix4(inv), b = ha.getWorldPosition(new V3()).applyMatrix4(inv);
      out.push([a, b, 0.36]);
      if (tip) out.push([b, tip.getWorldPosition(new V3()).applyMatrix4(inv), 0.32]);
    }
    return out;
  }

  drape(Dh, headQ, yaw, jaw) {
    const S = this.strands, d = new V3(), tgt = new V3(), loc = new V3(), qk = new Q(), yq = new Q(), cR = new V3(), cP = new V3();
    const invH = new M4().copy(Dh).invert();
    const limbs = this.limbs();
    for (const s of S) {
      const K = s.p.length - 1, r0 = s.rest[0];
      s.p[0].set(r0.x, r0.y - 0.03 * jaw * Math.exp(-((r0.x / 0.55) ** 2)) * (r0.y < -0.3 ? 1 : 0), r0.z).applyMatrix4(Dh);   // the chin carries the roots
      for (let k = 1; k <= K; k++) {
        const f = k / K; s.t[k].copy(s.rest[k]).applyMatrix4(Dh);
        if (s.side) { yq.setFromAxisAngle(UP, yaw); qk.copy(headQ).slerp(yq, Math.min(1, f * 0.5)); }   // cheek locks turn with the head but hang down when he bows
        else { yq.setFromAxisAngle(UP, yaw * (1 - 0.3 * f)); qk.copy(headQ).slerp(yq, Math.min(1, f * f * 0.25)); }   // thick wool ropes: stiff, they mostly go with the head (a beard that hung free swung at every nod of his talking)
        s.p[k].copy(s.rest[k]).sub(s.rest[0]).applyQuaternion(qk).add(s.p[0]);
      }
    }
    const PASSES = 8;
    for (let it = 0; it < PASSES; it++) {
      const last = it === PASSES - 1;
      for (const s of S) {
        const K = s.p.length - 1;
        for (let k = 1; k <= K; k++) {
          const a = s.p[k - 1], p = s.p[k]; d.subVectors(p, a); const L = d.length() || 1e-6; const corr = (L - s.len[k - 1]) / L;
          if (k === 1) p.addScaledVector(d, -corr); else { a.addScaledVector(d, corr * 0.5); p.addScaledVector(d, -corr * 0.5); }
        }
      }
      for (let k = 3; k <= 6; k++) {
        let n = 0; cR.set(0, 0, 0); cP.set(0, 0, 0);
        for (const s of S) { if (s.side || !s.p[k]) continue; cR.add(s.t[k]); cP.add(s.p[k]); n++; }
        if (!n) continue;
        cR.multiplyScalar(1 / n); cP.multiplyScalar(1 / n);
        for (const s of S) { if (s.side || !s.p[k]) continue; tgt.copy(s.t[k]).sub(cR).add(cP); s.p[k].lerp(tgt, MATCH[k]); }
      }
      for (const [i, j, L0] of this.pairs) {
        const A = S[i].p, B2 = S[j].p;
        for (let k = 1; k < A.length; k++) { d.subVectors(B2[k], A[k]); const L = d.length() || 1e-6, c = (L - L0[k]) / L * 0.42; A[k].addScaledVector(d, c); B2[k].addScaledVector(d, -c); }
      }
      for (const s of S) {
        const K = s.p.length - 1; if (s.side) continue;
        for (let k = 1; k <= K; k++) {
          const p = s.p[k];
          tgt.copy(s.rest[k]).applyMatrix4(Dh); d.subVectors(p, tgt); { const L = d.length(), m = TETHER[k] ?? 0.7; if (L > m) p.copy(tgt).addScaledVector(d, m / L); }
          // the toy chest (+ the robe and a lock's thickness): pushed forward over it
          const ym = YARN_Y + YARN_SCALE * p.y;
          if (ym < (this.collar ? 3.06 : 2.9) && p.z > -0.3) {
            let [hw0, hd0] = torsoAt(ym);
            if (this.collar) { const c = Math.exp(-(((ym - 2.84) / 0.13) ** 2)); hw0 = Math.max(hw0, 0.76 * c); hd0 = Math.max(hd0, 0.66 * c); }
            const hw = (hw0 + 0.07) / YARN_SCALE, hd = (hd0 + 0.07) / YARN_SCALE;
            const q = (p.x / hw) ** 2 + (p.z / hd) ** 2, kk = (last ? 1 : 0.6) * (this.collar ? ease(3.06, 2.9, ym) : ease(2.95, 2.75, ym));
            if (q < 1 && q > 1e-6 && kk > 0) {
              if (Math.abs(p.x) < hw * 0.97) { const zn = hd * Math.sqrt(1 - (p.x / hw) ** 2); p.z += (zn - p.z) * kk; }
              else { const sc = 1 + kk * (1 / Math.sqrt(q) - 1); p.x *= sc; p.z *= sc; }
            }
          }
          // the head
          loc.copy(p).applyMatrix4(invH);
          if (loc.y > -0.9 && loc.y < 0.9) { const r = Math.hypot(loc.x, loc.z), rr = 0.95 + 0.02 * k; if (r < rr && r > 1e-4) { const sc = 1 + 0.6 * (rr / r - 1); loc.x *= sc; loc.z *= sc; p.copy(loc).applyMatrix4(Dh); } }
          // the forearms and hands
          for (const [A, Bp, R] of limbs) {
            d.subVectors(Bp, A); const tt = Math.min(1, Math.max(0, tgt.subVectors(p, A).dot(d) / Math.max(1e-6, d.lengthSq())));
            tgt.copy(A).addScaledVector(d, tt); d.subVectors(p, tgt); const L = d.length();
            if (L < R && L > 1e-5) p.addScaledVector(d, (last ? 1 : 0.6) * (R - L) / L);
          }
        }
      }
    }
    const tmpQ = new Q(), rd = new V3(), m = new M4();
    for (const s of S) {
      const K = s.p.length - 1;
      for (let k = 0; k <= K; k++) {
        const bn = s.bs[k];
        const dir = k < K ? d.subVectors(s.p[k + 1], s.p[k]).normalize() : d.subVectors(s.p[k], s.p[k - 1]).normalize();
        rd.copy(s.dir[Math.min(k, K - 1)]).applyQuaternion(headQ);
        tmpQ.setFromUnitVectors(rd, dir).multiply(headQ);
        const r = s.rest[k], p = s.p[k];
        bn.userData.D.makeRotationFromQuaternion(tmpQ).multiply(m.makeTranslation(-r.x, -r.y, -r.z)).premultiply(m.makeTranslation(p.x, p.y, p.z));
      }
    }
  }

  setVisible(v) { this.holder.visible = v; this.on = v; }
}

function torsoAt(y) {
  if (y <= TOR[0][0]) return [TOR[0][1], TOR[0][2]];
  for (let i = 0; i < TOR.length - 1; i++) if (y <= TOR[i + 1][0]) { const g = (y - TOR[i][0]) / (TOR[i + 1][0] - TOR[i][0]); return [TOR[i][1] + (TOR[i + 1][1] - TOR[i][1]) * g, TOR[i][2] + (TOR[i + 1][2] - TOR[i][2]) * g]; }
  return [TOR.at(-1)[1], TOR.at(-1)[2]];
}
let colorOf = (c, fb) => (typeof c === 'number' ? c : typeof c === 'string' && c.startsWith('#') ? parseInt(c.slice(1), 16) : fb);
/** character.js hands over its colour names (avoids an import cycle) */
export function setColorResolver(fn) { colorOf = fn; }
