// A character of the "blender" style: one skinned toy-monk GLB (assets/characters/monk.glb, built by
// blender/characters/build_monk.py) cloned per actor, dressed by its `look`, posed by blending baked clips +
// procedural layers (look-at, hanging beard, two-bone IK). Everything is a pure function of the inputs of pose():
// the rest pose is restored first, so frames can be evaluated in any order.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { drawFace, faceKey, FACE_W, FACE_H, EXPR } from './face.js';
import { poseColovPortrait } from './colov-portrait.js';
import { YarnHead, setColorResolver } from './yarnhead.js';

export const NAMED = {
  white: 0xf4f4f4, black: 0x1b1b1f, darkGray: 0x5b5f63, gray: 0xa0a5a9, lightGray: 0xc8ccce,
  red: 0xc91a09, darkRed: 0x8a1a1a, orange: 0xfe8a18, yellow: 0xf7c52e, minifigYellow: 0xf2cd37, gold: 0xe0a530, tan: 0xe4cd9e, darkTan: 0x958a73,
  sand: 0xf0d9a6, cream: 0xf5ecd7, brown: 0x6b3f22, reddishBrown: 0x82422a, darkBrown: 0x3f2a1d, nougat: 0xd09168,
  lightNougat: 0xf6d7b3, skin: 0xffd8a8, darkSkin: 0xa0694a, green: 0x237841, darkGreen: 0x184632, oliveGreen: 0x9b9a5a,
  blue: 0x0055bf, darkBlue: 0x0a3463, mediumBlue: 0x5a93db, slate: 0x4a5a6e, purple: 0x81007b, magenta: 0x923978,
  lavender: 0xcdb4e6, pink: 0xfc97ac, charcoal: 0x2d2b2a, ash: 0xc9c6bf, silver: 0xb9b8b5, wheat: 0xd8b878,
  peach: 0xf4c49c, rosy: 0xf0b58f, olive2: 0xc99a6e, tanSkin: 0xd9a066, brownSkin: 0x9a6440, darkSkin2: 0x6e4630,
  chestnut: 0x5a3820, auburn: 0x7a3b1c, ochre: 0xb8862c, olive: 0x6b6b3a, wine: 0x5e1f2a, ink: 0x1d2433,
};
export const colorHex = (c, fallback = 0xff00ff) => (typeof c === 'number' ? c : typeof c === 'string' && c.startsWith('#') ? parseInt(c.slice(1), 16) : NAMED[c] ?? fallback);
setColorResolver(colorHex);

// Look presets of the style (docs/DESCRIPTOR-blender.md). Any key can be overridden in the character's look.
const monk = { skin: 'yellow', robe: 'brown', legs: 'darkBrown', belt: 'darkBrown', cloak: 'none', cloakColor: 'black', hat: 'none', hatColor: 'black', hair: 'short', hairColor: 'darkBrown', beard: 'short', beardColor: 'darkBrown', brows: 'normal', age: 'adult', shoes: 'darkBrown', faceShape: 'round' };
const portraitMonk = { ...monk, hair: 'none', beltStyle: 'rope', belt: '#c9a46a' };
const belowBlanket = ['skirt', 'thigh_L', 'thigh_R', 'shin_L', 'shin_R', 'boot_L', 'boot_R'];
const upperBody = ['torso', 'sleeve_L', 'sleeve_R', 'hand_L', 'hand_R'];

export const LOOK_PRESETS = {
  elder: { skin: 'yellow', robe: 'darkBrown', legs: 'darkBrown', belt: 'brown', cloak: 'mantle', cloakColor: 'black', hat: 'cowl', hatColor: 'black', hair: 'none', beard: 'long', beardColor: 'white', brows: 'bushy', browColor: 'ash', age: 'elder', shoes: 'darkBrown', faceShape: 'round' },
  monk,
  young: { skin: 'yellow', robe: 'tan', legs: 'darkTan', belt: 'brown', cloak: 'none', cloakColor: 'brown', hat: 'none', hatColor: 'black', hair: 'short', hairColor: 'chestnut', beard: 'none', beardColor: 'chestnut', brows: 'normal', age: 'young', shoes: 'brown', faceShape: 'round' },
  villager: { skin: 'yellow', robe: 'cream', legs: 'tan', belt: 'mediumBlue', cloak: 'none', hat: 'none', hair: 'short', hairColor: 'black', beard: 'full', beardColor: 'black', brows: 'normal', age: 'adult', shoes: 'brown', faceShape: 'wide' },
  'avva-or': { ...portraitMonk, portrait: 'avva-or', robe: '#734528', beard: 'fluffy', beardColor: 'white', age: 'elder' },
  'calugar-barba-ascutita': { ...portraitMonk, portrait: 'calugar-barba-ascutita', robe: '#4b4a41', hat: 'kamilavka', hatColor: '#29211e', beard: 'long', beardColor: 'ash', age: 'elder' },
  'frate-tanar-053': { ...portraitMonk, portrait: 'frate-tanar-053', robe: '#48565e', beard: 'full', beardColor: 'chestnut', age: 'young', scale: .965 },
};
export const LOOK_OPTIONS = {
  hat: ['none', 'cowl', 'openhood', 'culion', 'cap', 'kamilavka', 'yarnhood'], hair: ['none', 'short', 'curly', 'long', 'fringe'], beard: ['none', 'short', 'full', 'fluffy', 'long'],
  cloak: ['none', 'mantle', 'fleece'], brows: ['normal', 'bushy', 'thin'], age: ['young', 'adult', 'elder'],
  faceShape: ['round', 'narrow', 'wide', 'long'], eyes: ['normal', 'small', 'big'], beltStyle: ['band', 'rope'], head: ['toy', 'yarn'],
};

export function resolveLook(look = {}) {
  const base0 = LOOK_PRESETS[look.preset] || LOOK_PRESETS[{ 'elder-monk': 'elder', 'young-monk': 'young' }[look.preset]] || LOOK_PRESETS.monk;
  const base = base0;
  const L = { ...base, ...look };
  if (L.cloak === true) L.cloak = 'mantle';
  // the yarn elder's head (yarnhead.js) brings its own hood, brows and long wool beard: the toy ones are hidden, and the
  // clips pick the long-beard variants (`cross_beard`…)
  if (L.head === 'yarn') { if (L.hood !== false) L.hat = L.hood === 'small' ? 'none' : 'yarnhood'; L.hair = 'none'; L.beard = 'long'; L.brows3d = false; L.nose3d = false; if (L.beardColor == null) L.beardColor = 'white'; }
  if (!L.cloak) L.cloak = 'none';
  if (L.beard === 'flowing') L.beard = 'long';
  if (L.hat === 'hood') L.hat = 'cowl';
  if (L.hat === 'skufia') L.hat = 'cap';
  // a cap / kamilavka sits over the hair: curly / long hair under it is shown as the neat short cut
  if ((L.hat === 'cap' || L.hat === 'kamilavka') && (L.hair === 'curly')) L.hair = 'short';
  if ((L.hat === 'cowl' || L.hat === 'openhood' || L.hat === 'culion') && L.hair !== 'none') L.hair = 'none';
  L.browColor = L.browColor || (L.beard !== 'none' ? L.beardColor : L.hairColor) || 'darkBrown';
  L.skinHex = colorHex(L.skin, 0xf7c52e);
  L.browHex = darker(colorHex(L.browColor, 0x3a2414), L.browColor === 'white' || L.browColor === 'ash' ? 0.82 : 0.8);
  // the detailed face of the poster: fluffy sculpted brows (for bushy brows) and a button nose in relief
  if (L.face === 'detailed') { if (L.brows === 'bushy' && L.brows3d == null) L.brows3d = true; if (L.nose3d == null) L.nose3d = true; }
  L._faceSig = [L.skinHex, L.browHex, L.brows, L.age, L.eyes, L.face || '', L.brows3d ? 1 : 0, L.nose3d ? 1 : 0].join(',');
  return L;
}
function darker(h, k) { const c = new THREE.Color(h); c.multiplyScalar(k); return c.getHex(); }

// bone groups (masks)
const FINGERS = ['index', 'middle', 'ring', 'pinky', 'thumb'];
export const BONES = {
  fingers: (s) => FINGERS.flatMap((f) => [`${f}1_${s}`, `${f}2_${s}`]),
  arm: (s) => [`clav_${s}`, `uparm_${s}`, `forearm_${s}`, `hand_${s}`, ...BONES.fingers(s)],
  leg: (s) => [`thigh_${s}`, `shin_${s}`, `foot_${s}`],
};
export const MASKS = {
  upper: new Set(['spine', 'chest', 'neck', 'head', ...BONES.arm('L'), ...BONES.arm('R')]),
  lower: new Set(['root', 'pelvis', ...BONES.leg('L'), ...BONES.leg('R')]),
  armL: new Set(BONES.arm('L')), armR: new Set(BONES.arm('R')), arms: new Set([...BONES.arm('L'), ...BONES.arm('R')]),
  fingersL: new Set(BONES.fingers('L')), fingersR: new Set(BONES.fingers('R')),
  head: new Set(['neck', 'head']),
  headChest: new Set(['chest', 'neck', 'head']),
  upperL: new Set(['spine', 'chest', 'neck', 'head', ...BONES.arm('L')]), upperR: new Set(['spine', 'chest', 'neck', 'head', ...BONES.arm('R')]),
  // a talk gesture of someone whose look is held on a person (`lookAt`): the arm and the chest only — the head stays on him
  talkL: new Set(['spine', 'chest', ...BONES.arm('L')]), talkR: new Set(['spine', 'chest', ...BONES.arm('R')]),
};

// ---------------------------------------------------------------- the asset (shared by every actor)
/** the head yaw (rad, ≥ 0) shown for a target at |yaw| a: the target up to ±1.2, then back to 0 at 180° */
export const lookYaw = (a) => (a <= 1.2 ? a : 1.2 * Math.max(0, Math.PI - a) / (Math.PI - 1.2));

export class CharacterAsset {
  constructor(gltf, meta) {
    this.gltf = gltf; this.meta = meta;
    this.template = gltf.scene;
    this.clips = {};
    for (const clip of gltf.animations) {
      const tracks = new Map();
      for (const tr of clip.tracks) {
        const dot = tr.name.lastIndexOf('.');
        const bone = tr.name.slice(0, dot), prop = tr.name.slice(dot + 1);
        if (!tracks.has(bone)) tracks.set(bone, {});
        tracks.get(bone)[prop === 'quaternion' ? 'q' : prop === 'position' ? 'p' : 's'] = tr.createInterpolant();
      }
      const m = meta.clips?.[clip.name] || {};
      this.clips[clip.name] = { name: clip.name, duration: m.duration ?? clip.duration, tracks, meta: m };
    }
  }
  has(name) { return !!this.clips[name]; }
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m = new THREE.Matrix4(), _ax = new THREE.Vector3();
const collisionMaterial = new THREE.MeshBasicMaterial({ visible: false });

function bindPortraitMesh(mesh, skeleton, headWeights) {
  const geometry = mesh.geometry;
  if (!geometry.hasAttribute('skinWeight')) {
    const influence = geometry.getAttribute(headWeights);
    const indices = new Uint16Array(influence.count * 4);
    const weights = new Float32Array(influence.count * 4);
    for (let i = 0; i < influence.count; i++) {
      const w = influence.getX(i);
      indices[i * 4 + 1] = 1;
      weights[i * 4] = w;
      weights[i * 4 + 1] = 1 - w;
    }
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
    geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
  }
  return bindRigMesh(mesh, skeleton);
}

export function bindRigMesh(mesh, skeleton) {
  const skinned = new THREE.SkinnedMesh(mesh.geometry, mesh.material);
  skinned.name = mesh.name;
  skinned.userData = mesh.userData;
  skinned.position.copy(mesh.position);
  skinned.quaternion.copy(mesh.quaternion);
  skinned.scale.copy(mesh.scale);
  skinned.visible = mesh.visible;
  skinned.frustumCulled = false;
  skinned.castShadow = mesh.castShadow;
  skinned.receiveShadow = mesh.receiveShadow;
  mesh.parent.add(skinned);
  mesh.removeFromParent();
  skinned.updateWorldMatrix(true, false);
  skinned.bind(skeleton, skinned.matrixWorld);
  return skinned;
}

// ---------------------------------------------------------------- one actor
export class Character {
  constructor(asset, look = {}, { faces = true } = {}) {
    this.asset = asset;
    this.root = new THREE.Group(); this.root.name = 'character';
    this.model = cloneSkinned(asset.template);
    this.root.add(this.model);
    this.bones = {}; this.parts = {}; this.sockets = {}; this.mats = {};
    this.model.traverse((o) => {
      const nm = o.userData?.name || o.name;
      if (o.isBone) this.bones[o.name] = o;
      if (o.userData?.part) this.parts[o.userData.part] = o;
      if (/^(hand\.[LR]|fingertips\.[LR]|head_top|beard_tip|chest_front|back|face)$/.test(nm) && !o.isMesh) this.sockets[nm] = o;
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        o.frustumCulled = false; // skinned bounds are stale while posed
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const cl = mats.map((m) => { const k = m.name; if (!this.mats[k]) this.mats[k] = m.clone(); return this.mats[k]; });
        o.material = Array.isArray(o.material) ? cl : cl[0];
      }
    });
    // the sculpted beards (locks, wavy relief): under a low sun the shadows of the locks crawl over the beard as the head
    // moves while talking — „lumina se mișcă ciudat pe barbă” (reviewer, film 042). Out of the shadow maps, like the brows.
    for (const [n, o0] of Object.entries(this.parts)) if (/^beard/.test(n)) o0.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    // the sculpted brows: small and wavy — a shadow edge (the hat's brim) or a glossy highlight crawling over them reads as a
    // shimmer when the head moves (reviewer, film 040). Matte, and out of the shadow maps.
    for (const n of ['brow3d_L', 'brow3d_R']) this.parts[n]?.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false; o.receiveShadow = false;
      const m = (Array.isArray(o.material) ? o.material[0] : o.material);
      if (!this.mats.__brow) { this.mats.__brow = m.clone(); this.mats.__brow.roughness = 1; this.mats.__brow.metalness = 0; if ('specularIntensity' in this.mats.__brow) this.mats.__brow.specularIntensity = 0; }
      o.material = this.mats.__brow;
    });
    this.rest = {};
    for (const [n, b] of Object.entries(this.bones)) this.rest[n] = { p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() };
    this.faces = faces && typeof document !== 'undefined';
    this.setLook(look);
  }

  setLook(lookIn) {
    const L = this.look = resolveLook(lookIn);
    const show = { hair: L.hair, beard: L.beard, hat: L.hat, cloak: L.underBlanket ? 'none' : L.cloak,
      belt: L.underBlanket || L.belt === false || L.belt === 'none' ? 'none' : L.beltStyle === 'rope' ? 'rope' : 'belt',
      brows3d: L.brows3d ? 'on' : 'none', nose3d: L.nose3d ? 'on' : 'none' };
    const soft = L.wool === 'soft' && !!this.asset.yarnSoft;   // `wool: "soft"`: the earlier fluffy beard (default: twisted wool ropes)
    const yarn = L.head === 'yarn' && !!(soft ? this.asset.yarnSoft : this.asset.yarn);
    if (yarn) { if (L.hood !== false) show.hat = L.hood === 'small' ? 'none' : 'yarnhood'; show.hair = 'none'; show.beard = 'none'; show.brows3d = 'none'; show.nose3d = 'none'; }
    this.model.traverse((o) => {
      const g = o.userData?.group;
      if (g) o.visible = show[g] === o.userData.variant;
    });
    for (const name of belowBlanket) if (this.parts[name]) this.parts[name].visible = !L.underBlanket;
    for (const name of upperBody) if (this.parts[name]) this.parts[name].visible = L.underBlanket !== 'head-only';
    if (this.parts.head) this.parts.head.visible = !yarn;
    if (yarn && !this.yarn) { this.restPose(); this.yarn = new YarnHead(soft ? this.asset.yarnSoft : this.asset.yarn, this, soft); }
    if (this.yarn) { this.yarn.setVisible(yarn); if (yarn) this.yarn.setLook(L); }
    this.setPortrait(yarn ? null : L.portrait);
    const set = (name, c) => { const m = this.mats[name]; if (m && c != null) { m.color.setHex(colorHex(c)); if (m.sheen > 0 && m.sheenColor) m.sheenColor.copy(m.color).multiplyScalar(0.8).addScalar(0.06); } };
    set('skin', L.skin); set('robe', L.robe); set('sleeve', L.sleeves || L.robe); set('legs', L.legs || L.robe);
    set('cloak', L.cloakColor); set('fur', L.cloakColor === 'black' ? 'brown' : L.cloakColor); set('hat', L.hatColor); set('knit', L.hoodColor ?? L.cloakColor ?? '#3a3740');
    const cloak = this.parts['cloak_' + L.cloak];
    if (L.cloakClearance && cloak && !this.roomyCloak) {
      this.roomyCloak = cloak.geometry = cloak.geometry.clone();
      const positions = cloak.geometry.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        const back = Math.max(0, Math.min(1, -z / 0.40));
        const neck = Math.max(0, Math.min(1, (2.90 - y) / 0.55));
        const clearance = L.cloakClearance * neck;
        positions.setXYZ(i, x * (1 + 0.68 * clearance), y + 0.47 * clearance, z - clearance * back);
      }
      cloak.geometry.computeVertexNormals();
    }
    this.knitRobe(L.head === 'yarn' && L.knit === true);
    // the yarn elder's woven mantle (part of the yarnhood) is the colour of the hood unless `mantleColor` says otherwise;
    // his tunic is a coarse homespun weave
    if (L.hat === 'yarnhood') set('cloak', L.mantleColor ?? L.hoodColor ?? '#3a3740');
    this.coarseRobe(L.head === 'yarn' && L.knit !== true);
    set('hair', L.hairColor); set('beard', L.beardColor); set('belt', L.belt && L.belt !== true ? L.belt : 'brown'); set('rope', L.belt && L.belt !== true ? L.belt : '#c9a46a'); set('shoes', L.shoes);
    // beard (and the sculpted brows): matte hair — no plastic gloss crawling over the locks as the head moves
    for (const m of [this.mats.beard, this.mats.__brow]) {
      if (!m) continue;
      m.roughness = 1; m.metalness = 0;
      if ('specularIntensity' in m) m.specularIntensity = 0.15;
      if ('clearcoat' in m) m.clearcoat = 0;
      if ('sheen' in m) m.sheen = 0;
      m.needsUpdate = true;
    }
    if (this.mats.__brow && this.mats.beard) this.mats.__brow.color.copy(this.mats.beard.color);   // the matte brows follow the beard colour
    for (const k of ['skin', 'face']) { // warm, soft plastic: a reddish sheen reads like the warmth of skin
      const m = this.mats[k]; if (!m) continue;
      m.sheen = 0.3; m.sheenRoughness = 0.5; m.sheenColor = new THREE.Color(0xff8a3a).multiplyScalar(0.45);
      if ('clearcoat' in m) m.clearcoat = 0.12;
      m.roughness = 0.42; m.needsUpdate = true;
      // detailed face (look.face "detailed"): a little light of its own, so a hood never shades it to a dull blank
    }
    // face shape: scales the head (and what sits on it)
    const hs = { round: [1, 1, 1], narrow: [0.93, 1.0, 0.97], wide: [1.07, 0.98, 1.02], long: [0.97, 1.06, 0.98] }[L.faceShape] || [1, 1, 1];
    this.rest.head.s.set(...hs);
    const sc = L.scale || 1; this.model.scale.setScalar(sc);
    // printed face
    const fm = this.mats.face;
    if (fm) {
      if (this.faces) {
        if (!this.faceCanvas) {
          this.faceCanvas = document.createElement('canvas'); this.faceCanvas.width = FACE_W; this.faceCanvas.height = FACE_H;
          this.faceTex = new THREE.CanvasTexture(this.faceCanvas);
          this.faceTex.colorSpace = THREE.SRGBColorSpace; this.faceTex.anisotropy = 8;
          this.faceTex.generateMipmaps = true;
          this.faceTex.flipY = false; // glTF UV convention (V down): a flipped canvas puts the face upside down
        }
        fm.map = this.faceTex; fm.color.setHex(0xffffff);
        // detailed face (look.face "detailed"): it glows a little with its own picture, so a hood never shades it to a dull blank
        if (L.face === 'detailed') { fm.emissiveMap = this.faceTex; fm.emissive = new THREE.Color(0xffffff); fm.emissiveIntensity = 0.22; }
        fm.needsUpdate = true;
        this.faceKey = null;
      } else fm.color.setHex(L.skinHex);
    }
  }

  setPortrait(name) {
    this.portrait?.veil?.skeleton.dispose();
    this.portrait?.beardSkin?.dispose();
    this.portrait?.root.removeFromParent();
    this.portrait = null;
    for (const [mesh, saved] of this.portraitCollision || []) Object.assign(mesh, saved);
    this.portraitCollision?.clear();
    if (!name) return;

    const template = this.asset.portraitHeads?.get(name);
    if (!template) throw new Error(`Missing portrait asset for ${name}`);
    const root = template.clone();
    const morphs = [];
    const beardLayers = [];
    let beard, veil;
    root.traverse((o) => {
      if (o.userData.portraitBeard) beard = o;
      if (o.isMesh && o.geometry.hasAttribute('_beard_head')) beardLayers.push(o);
      if (o.morphTargetInfluences) morphs.push(o);
      const hat = o.userData.portraitHat;
      if (hat) {
        o.visible = hat === this.look.hat;
        const shared = this.parts[`hat_${hat}`];
        if (o.visible && shared) shared.visible = false;
      }
      if (o.userData.portraitVeil) {
        o.visible = o.userData.portraitVeil === this.look.hat;
        if (o.visible) veil = o;
      }
    });
    this.restPose();
    this.bones.head.scale.setScalar(1);
    this.model.add(root);
    this.bones.head.attach(root);
    if (veil) {
      veil.castShadow = veil.receiveShadow = true;
      veil = bindPortraitMesh(veil, new THREE.Skeleton([this.bones.head, this.bones.chest]), '_veil_head');
    }
    let beardSkin;
    if (beardLayers.length) {
      beardSkin = new THREE.Skeleton([this.bones.head, beard]);
      for (const layer of beardLayers) bindPortraitMesh(layer, beardSkin, '_beard_head');
    }
    this.portrait = { root, beard, beardSkin, veil, morphs };

    // The common rig's low-poly head and beard stay available to the collision checks.
    this.portraitCollision ||= new Map();
    for (const [part, object] of Object.entries(this.parts)) {
      if (part !== 'head' && !part.startsWith('beard_')) continue;
      object.traverse((mesh) => {
        if (!mesh.isMesh) return;
        this.portraitCollision.set(mesh, { material: mesh.material, castShadow: mesh.castShadow });
        mesh.material = collisionMaterial;
        mesh.castShadow = false;
      });
    }
  }

  posePortrait(face = {}) {
    const { beard, morphs } = this.portrait;
    if (beard) {
      beard.rotation.x = -Math.min(.42, 1.05 * Math.max(0, this.headDown - .04));
      beard.updateMatrixWorld(true);
    }
    const expression = EXPR[face.expr] || EXPR.neutral;
    if (this.portrait.root.userData.portraitRig) {
      poseColovPortrait(this.portrait, face, expression);
      return;
    }
    const talk = face.talk ? (face.mouth || 0) * (expression.quiet ?? 1) : 0;
    const weights = {
      'Zâmbet': expression.smileEyes ? .96 : expression.cheek ? .31 : this.look.age === 'young' ? .22 : .04,
      'Tristețe': expression.mouth === 'frown' ? .85 : 0,
      'Clipit': Math.max(face.blink || 0, expression.smileEyes ? 0 : 1 - (expression.eye ?? 1)),
      'Sprânceană': Math.min(1, Math.max(.11, (face.brow?.[0] ?? expression.brow[0]) * 7)),
      'Deschis': talk * .92,
      'Rotund': expression.mouth === 'o' ? .7 : talk * .08,
    };
    for (const mesh of morphs) {
      for (const [key, index] of Object.entries(mesh.morphTargetDictionary)) mesh.morphTargetInfluences[index] = weights[key] ?? 0;
    }
  }

  /** the yarn elder's robe and sleeves are hand-knitted too: they borrow the knit maps of the hood (material `knit`) */
  knitRobe(on) {
    const K = this.mats.knit; if (!K || !K.map) return;
    for (const n of ['robe', 'sleeve']) {
      const m = this.mats[n]; if (!m) continue;
      if (!m.userData.orig) m.userData.orig = { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, sheen: m.sheen };
      if (on) {
        if (!this._knitTex) {
          const rep = (t) => { const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(2.0, 2.0); c.needsUpdate = true; return c; };
          this._knitTex = { map: rep(K.map), normalMap: K.normalMap && rep(K.normalMap), roughnessMap: K.roughnessMap && rep(K.roughnessMap) };
        }
        Object.assign(m, this._knitTex); m.sheen = Math.max(m.sheen || 0, 0.5);
        if (m.normalScale && K.normalScale) m.normalScale.copy(K.normalScale);
      } else Object.assign(m, m.userData.orig);
      m.needsUpdate = true;
    }
  }

  coarseRobe(on) {
    for (const n of ['robe', 'sleeve']) {
      const m = this.mats[n]; if (!m || !m.map) continue;
      if (!m.userData.fine) m.userData.fine = { map: m.map, normalMap: m.normalMap, roughnessMap: m.roughnessMap, ns: m.normalScale?.clone() };
      const f = m.userData.fine;
      if (on) {
        if (!this._coarse) this._coarse = {};
        if (!this._coarse[n]) {
          const rep = (t) => { if (!t) return t; const c = t.clone(); c.wrapS = c.wrapT = THREE.RepeatWrapping; c.repeat.set(0.55, 0.55); c.needsUpdate = true; return c; };
          this._coarse[n] = { map: rep(f.map), normalMap: rep(f.normalMap), roughnessMap: rep(f.roughnessMap) };
        }
        Object.assign(m, this._coarse[n]); if (m.normalScale) m.normalScale.set(2.8, 2.8);
      } else { m.map = f.map; m.normalMap = f.normalMap; m.roughnessMap = f.roughnessMap; if (f.ns) m.normalScale.copy(f.ns); }
      m.needsUpdate = true;
    }
  }

  restPose() {
    for (const [n, b] of Object.entries(this.bones)) { const r = this.rest[n]; b.position.copy(r.p); b.quaternion.copy(r.q); b.scale.copy(r.s); }
  }

  /**
   * layers: [{ clip, t, w, mask? (Set of bone names) }] blended in order over the rest pose.
   * opts: { lookAt: Vector3 world | null, lookW, face: { expr, blink, mouth, talk, gazeX, gazeY }, ik: [{ side, target, pole, w }] }
   */
  pose(layers, opts = {}) {
    this.restPose();
    for (const L of layers) {
      const C = this.asset.clips[L.clip];
      if (!C || !(L.w > 1e-4)) continue;
      const t = Math.max(0, Math.min(C.duration, L.t));
      const w = Math.min(1, L.w);
      for (const [bn, tr] of C.tracks) {
        if (L.mask && !L.mask.has(bn)) continue;
        const b = this.bones[bn]; if (!b) continue;
        if (tr.q) {
          // every rotation is taken on the same side as the rest pose and blended linearly (then normalised): the usual
          // "shortest way round" slerp flips sides when two clips hold a joint ~180° apart (a palm on the knee vs. a palm
          // up offering), and the hand jumped half-way through the blend
          _q.fromArray(tr.q.evaluate(t)); const r = this.rest[bn].q;
          if (_q.dot(r) < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w);
          if (w >= 0.9999) b.quaternion.copy(_q);
          else {
            const c = b.quaternion; if (c.dot(r) < 0) c.set(-c.x, -c.y, -c.z, -c.w);
            const x = c.x + (_q.x - c.x) * w, y = c.y + (_q.y - c.y) * w, z = c.z + (_q.z - c.z) * w, ww = c.w + (_q.w - c.w) * w;
            const L = Math.hypot(x, y, z, ww); if (L > 1e-6) c.set(x / L, y / L, z / L, ww / L);
          }
        }
        if (tr.p && bn !== 'root') { _v.fromArray(tr.p.evaluate(t)); b.position.lerp(_v, w); }
      }
    }
    this.root.updateMatrixWorld(true);
    if (opts.pelvisLift) { // raise / lower the whole body over a higher / lower seat (world up, in the pelvis parent's frame)
      const pb = this.bones.pelvis, par = pb.parent;
      const up = new THREE.Vector3(0, 1, 0).transformDirection(_m.copy(par.matrixWorld).invert());
      const sc = par.getWorldScale(new THREE.Vector3()).y || 1;
      pb.position.addScaledVector(up, opts.pelvisLift / sc);
      this.root.updateMatrixWorld(true);
    }
    if (opts.lookAt && (opts.lookW ?? 1) > 0) this.lookAt(opts.lookAt, opts.lookW ?? 1);
    for (const k of opts.ik || []) this.armIK(k.side, k.target, k.w ?? 1, k.pole);
    this.guardHands();
    if (this.look.headMotion != null) {
      // Gentle counter-rotation at the neck steadies the face as the chest bends to pick things up.
      const head = this.bones.head;
      const target = this.restWorldQuat('head').slerp(head.getWorldQuaternion(new THREE.Quaternion()), this.look.headMotion);
      head.quaternion.copy(head.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(target));
      head.updateWorldMatrix(false, true);
    }
    this.craneHead();
    this.solveBeard();
    this.easeFluffyBeard();
    this.model.updateMatrixWorld(true);
    if (this.yarn?.on) this.yarn.pose(opts.face || null);
    if (this.portrait) this.posePortrait(opts.face ?? {});
    else if (opts.face && this.faces) this.updateFace(opts.face);
  }

  /** turn neck + head toward a world point, within the neck's limits (yaw ±70°, pitch -35..+30°) */
  lookAt(target, w = 1) {
    const head = this.bones.head, neck = this.bones.neck, chest = this.bones.chest;
    const eye = (this.sockets.face || head).getWorldPosition(_v);
    const dirW = _v2.copy(target).sub(eye);
    if (dirW.lengthSq() < 1e-6) return;
    // direction in the chest frame
    chest.updateWorldMatrix(true, false);
    const inv = _m.copy(chest.matrixWorld).invert();
    const d = dirW.clone().transformDirection(inv);
    const fwd = this.chestFwd || (this.chestFwd = this.restAxis('chest', new THREE.Vector3(0, 0, 1)));
    const up = this.chestUp || (this.chestUp = this.restAxis('chest', new THREE.Vector3(0, 1, 0)));
    const left = new THREE.Vector3().crossVectors(up, fwd);
    const yaw = Math.atan2(d.dot(left), d.dot(fwd));
    const pitch = Math.atan2(-d.dot(up), Math.hypot(d.dot(left), d.dot(fwd)));
    // current head orientation relative to the chest (from the clip): only add what is missing, gently
    // a target behind the back is let go gradually (at ±180° the clamped yaw would flip from one shoulder to the other)
    // beyond the reach (±1.2) the head comes back slowly toward the front (0 at 180°): no flip at the back, and a body
    // turning toward someone behind it does not make the head whip around faster than the body (reviewer 043)
    const cy = Math.sign(yaw) * lookYaw(Math.abs(yaw)) * w, cp = Math.max(-0.5, Math.min(0.6, pitch)) * w;
    this.addRot('neck', up, cy * 0.45, chest); this.addRot('head', up, cy * 0.55, chest);
    this.addRot('neck', left, cp * 0.35, chest); this.addRot('head', left, cp * 0.65, chest);
    this.root.updateMatrixWorld(true);
  }

  /** an axis given in the model's rest frame (three coords) expressed in `bone`'s local frame at rest */
  restAxis(bone, v) {
    const b = this.bones[bone];
    const saved = b.quaternion.clone();
    // rest world rotation of the bone relative to the model
    const q = new THREE.Quaternion(); let o = b; const chain = [];
    while (o && o !== this.model) { chain.push(o); o = o.parent; }
    for (let i = chain.length - 1; i >= 0; i--) { const n = chain[i].name; q.multiply(this.rest[n] ? this.rest[n].q : chain[i].quaternion); }
    b.quaternion.copy(saved);
    return v.clone().applyQuaternion(q.invert()).normalize();
  }

  /** rotate a bone by `ang` about `axisInRef` (a direction in the local frame of bone `ref`) — premultiplied in world */
  addRot(bone, axisInRef, ang, ref) {
    if (!ang) return;
    const b = this.bones[bone];
    ref.updateWorldMatrix(true, false); b.updateWorldMatrix(true, false);
    const axW = axisInRef.clone().transformDirection(ref.matrixWorld);
    const pw = new THREE.Quaternion(); b.parent.getWorldQuaternion(pw);
    const axP = axW.applyQuaternion(pw.clone().invert()).normalize();
    b.quaternion.premultiply(_q2.setFromAxisAngle(axP, ang));
    b.updateWorldMatrix(false, true);
  }

  /** a head that bows also comes FORWARD (as a real neck does), so the chin / beard slides over the chest, not into it */
  craneHead() {
    const head = this.bones.head, chest = this.bones.chest;
    if (!head || !chest) return;
    this.model.updateMatrixWorld(true);
    const headRestInv = this.restWorldQuat('head').invert(), chestRestInv = this.restWorldQuat('chest').invert();
    const hq = head.getWorldQuaternion(new THREE.Quaternion()), cq = chest.getWorldQuaternion(new THREE.Quaternion());
    const basis = this.look.beardClearance != null ? this.model.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    const headFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(basis).applyQuaternion(headRestInv).applyQuaternion(hq);
    const chestUp = new THREE.Vector3(0, 1, 0).applyQuaternion(basis).applyQuaternion(chestRestInv).applyQuaternion(cq);
    const chestFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(basis).applyQuaternion(chestRestInv).applyQuaternion(cq);
    const down = Math.max(0, -headFwd.dot(chestUp)); // sin of the forward pitch of the head against the chest
    this.headDown = down;
    if (down < 1e-3) return;
    const k = 0.38; // = CRANE in blender/characters/clipkit.py (the clips' hand targets are solved with it)
    const par = head.parent; par.updateWorldMatrix(true, false);
    const sc = par.getWorldScale(new THREE.Vector3()).x || 1;
    const d = chestFwd.multiplyScalar((k * down) / sc).applyQuaternion(par.getWorldQuaternion(new THREE.Quaternion()).invert());
    head.position.add(d);
    head.updateWorldMatrix(false, true);
  }

  /** the long beard hangs: it follows the head only partly and never swings back into the chest */
  solveBeard() {
    const beard = this.bones.beard;
    if (!beard || this.look.beard !== 'long') return;
    this.model.updateMatrixWorld(true);
    const head = this.bones.head, chest = this.bones.chest;
    const pivot = beard.getWorldPosition(new THREE.Vector3());
    // rest direction of the beard in the head frame (pivot -> tip), and the world down
    const restDirHead = this.beardRestDir || (this.beardRestDir = (() => {
      const tipRest = new THREE.Vector3(0, -1, 0.2).normalize(); return tipRest;
    })());
    const hq = head.getWorldQuaternion(new THREE.Quaternion());
    const mq = this.model.getWorldQuaternion(new THREE.Quaternion());
    const basis = this.look.beardClearance != null ? mq : new THREE.Quaternion();
    const headDir = restDirHead.clone().applyQuaternion(basis).applyQuaternion(this.restWorldQuat('head').invert()).applyQuaternion(hq);
    const down = new THREE.Vector3(0, -1, 0);
    if (this.reclineWeight && !this.look.pillowRest) {
      down.lerp(new THREE.Vector3(0, -1, 0).applyQuaternion(mq), this.reclineWeight).normalize();
    }
    let dir = headDir.clone().multiplyScalar(0.45).addScaledVector(down, 0.55).normalize();
    // keep the beard in front of the chest: the angle between the beard and the chest's forward axis ≤ 78°
    const cq = chest.getWorldQuaternion(new THREE.Quaternion());
    const chestRestInv = this.restWorldQuat('chest').invert();
    const chestFwd = new THREE.Vector3(0, 0, 1).applyQuaternion(basis).applyQuaternion(chestRestInv).applyQuaternion(cq);
    const chestUp = new THREE.Vector3(0, 1, 0).applyQuaternion(basis).applyQuaternion(chestRestInv).applyQuaternion(cq);
    const f = dir.dot(chestFwd);
    const minF = (this.look.beardClearance ?? 0.20) + 0.5 * (this.headDown || 0); // sin of the clearance angle in front of the chest plane (more when the head bows: the chin comes nearer the chest)
    if (f < minF) {
      // push the direction forward, keep its side and up/down components
      const side = dir.clone().addScaledVector(chestFwd, -f);
      const sl = side.length();
      side.multiplyScalar(Math.sqrt(Math.max(0, 1 - minF * minF)) / Math.max(1e-6, sl));
      dir = side.addScaledVector(chestFwd, minF).normalize();
    }
    // never above horizontal in the chest frame (a beard does not float up)
    if (dir.dot(chestUp) > 0.2) { dir.addScaledVector(chestUp, 0.2 - dir.dot(chestUp)).normalize(); }
    // rotate the bone so that its rest direction (in world, at the current head pose) turns into `dir`
    const cur = headDir.clone();
    const rot = new THREE.Quaternion().setFromUnitVectors(cur, dir);
    const pw = beard.parent.getWorldQuaternion(new THREE.Quaternion());
    const bw = pw.clone().multiply(this.rest.beard.q);
    const nw = rot.multiply(bw);
    beard.quaternion.copy(pw.invert().multiply(nw));
    beard.updateWorldMatrix(false, true);
    void pivot; void mq;
  }

  /** the fluffy (rigid) beard: as the head bows toward the chest, the beard swings forward a little about a hinge at the
   * cheeks, so it rests on the chest instead of going into it (and moves softly, like hair, not like a block) */
  easeFluffyBeard() {
    const o = this.parts.beard_fluffy_jaw;
    if (!o || this.look.beard !== 'fluffy') return;
    o.userData.rest ||= { p: o.position.clone(), q: o.quaternion.clone() };
    const R = o.userData.rest;
    const a = -Math.min(0.42, 1.1 * Math.max(0, (this.headDown || 0) - 0.04));
    if (a === 0) { o.position.copy(R.p); o.quaternion.copy(R.q); return; }
    _q2.setFromAxisAngle(_ax.set(1, 0, 0).applyQuaternion(R.q), a);
    _v.set(0, 3.17, 0.3).applyQuaternion(R.q).add(R.p);   // the hinge (model coords → parent frame)
    o.position.copy(R.p).sub(_v).applyQuaternion(_q2).add(_v);
    o.quaternion.copy(R.q).premultiply(_q2);
  }

  /** the rest rotation of `bone` in world, with the model as it stands NOW. Only the model-local part is cached: caching
   * the world one baked in the facing of the first frame ever rendered, so the bowed head / beard depended on the order the
   * frames were rendered in (the GPU MP4 of 038 differed from the preview on Siluan's beard and cloak) */
  restWorldQuat(bone) {
    const rl = (this.restLocalQ ||= {});
    if (!rl[bone]) {
      const q = new THREE.Quaternion(); let o = this.bones[bone]; const chain = [];
      while (o && o !== this.model) { chain.push(o); o = o.parent; }
      for (let i = chain.length - 1; i >= 0; i--) { const n = chain[i].name; q.multiply(this.rest[n] ? this.rest[n].q : chain[i].quaternion); }
      rl[bone] = q;
    }
    return this.model.getWorldQuaternion(new THREE.Quaternion()).multiply(rl[bone]);
  }

  /** analytic two-bone IK: move the wrist of `side` toward a world target (blend w), elbow toward `pole` (world) */
  /** A blend between two good poses (folded hands -> a gesture, hands on the knees -> a blessing) can drag a hand
   *  through the belly: push the palm out of the torso (an ellipse per height, as in the clip baker). Pure function. */
  guardHands() {
    const chain = ['pelvis', 'spine', 'chest', 'neck'].map((n) => this.bones[n]);
    if (chain.some((b) => !b) || !this.sockets) return;
    if (!this._restY) { this._restY = [1.42, 1.78, 2.2, 2.88]; }
    const inv = _m.copy(this.root.matrixWorld).invert();
    const P = chain.map((b) => b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv));
    const TOR = [[1.30, 0.76, 0.46], [1.70, 0.735, 0.44], [2.20, 0.675, 0.415], [2.60, 0.60, 0.385], [2.77, 0.49, 0.335], [2.88, 0.25, 0.23]];
    for (const side of ['R', 'L']) {
      const sock = this.sockets[`hand.${side}`], hb = this.bones[`hand_${side}`]; if (!sock || !hb) continue;
      // the palm and the wrist (the heel of the hand) both stay outside; two passes, the larger correction wins
      for (let pass = 0; pass < 2; pass++) {
        let best = null;
        for (const [obj, M] of [[sock, 0.085], [hb, 0.11]]) {
          const h = obj.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
          let i = 0; while (i < 2 && h.y > P[i + 1].y) i++;
          const f = (h.y - P[i].y) / Math.max(1e-4, P[i + 1].y - P[i].y);
          if (f < -0.5 || f > 1.1) continue;
          // the push fades out at the top / bottom of the guarded zone (a hand rising from the knees is not shoved at once)
          const fade = smooth01((f + 0.5) / 0.3) * smooth01((1.1 - f) / 0.2);
          const fc = Math.max(0, Math.min(1, f));
          const cx = P[i].x + (P[i + 1].x - P[i].x) * fc, cz = P[i].z + (P[i + 1].z - P[i].z) * fc;
          const ry = this._restY[i] + (this._restY[i + 1] - this._restY[i]) * fc;
          let j = 0; while (j < TOR.length - 2 && ry > TOR[j + 1][0]) j++;
          const g = Math.max(0, Math.min(1, (ry - TOR[j][0]) / (TOR[j + 1][0] - TOR[j][0])));
          const hw = TOR[j][1] + (TOR[j + 1][1] - TOR[j][1]) * g + M, hd = TOR[j][2] + (TOR[j + 1][2] - TOR[j][2]) * g + M;
          const x = h.x - cx, z = h.z - cz, k = (x / hw) ** 2 + (z / hd) ** 2;
          if (k >= 1) continue;
          let nx = x / hw ** 2, nz = z / hd ** 2; const nl = Math.hypot(nx, nz);
          if (nl < 1e-6) { nx = 0; nz = 1; } else { nx /= nl; nz /= nl; }
          const aa = (nx / hw) ** 2 + (nz / hd) ** 2, bb = 2 * ((x * nx) / hw ** 2 + (z * nz) / hd ** 2), cc = k - 1;
          const tt = (-bb + Math.sqrt(Math.max(0, bb * bb - 4 * aa * cc))) / (2 * aa);
          if (!best || tt * fade > best.tt) best = { nx, nz, tt: tt * fade };
        }
        if (!best || best.tt < 1e-4) break;
        const d = new THREE.Vector3(best.nx, 0, best.nz).transformDirection(this.root.matrixWorld).multiplyScalar(best.tt);
        this.armIK(side, hb.getWorldPosition(new THREE.Vector3()).add(d), 1);
        this.model.updateMatrixWorld(true);
      }
    }
  }

  armIK(side, target, w = 1, pole = null) {
    this.limbIK(['uparm', 'forearm', 'hand'], side, target, w, pole);
  }

  footIK(side, target, w = 1) {
    this.limbIK(['thigh', 'shin', 'foot'], side, target, w);
  }

  limbIK(chain, side, target, w, pole = null) {
    const [up, fo, ha] = chain.map((name) => this.bones[`${name}_${side}`]);
    if (!up || !fo || !ha || w <= 0) return;
    this.model.updateMatrixWorld(true);
    const a = up.getWorldPosition(new THREE.Vector3()), b = fo.getWorldPosition(new THREE.Vector3()), c = ha.getWorldPosition(new THREE.Vector3());
    const handQ = ha.getWorldQuaternion(new THREE.Quaternion());
    const T = c.clone().lerp(target, w);
    const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
    const dT = Math.min(l1 + l2 - 1e-3, Math.max(Math.abs(l1 - l2) + 1e-3, a.distanceTo(T)));
    // keep the current bend plane unless a pole is given
    const axisDir = T.clone().sub(a).normalize();
    const pl = (pole ? pole.clone() : b.clone()).sub(a);
    pl.addScaledVector(axisDir, -pl.dot(axisDir));
    if (pl.lengthSq() < 1e-8) pl.set(0, 0, -1);
    pl.normalize();
    const cosA = (l1 * l1 + dT * dT - l2 * l2) / (2 * l1 * dT);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const elbow = a.clone().addScaledVector(axisDir, cosA * l1).addScaledVector(pl, sinA * l1);
    const wrist = a.clone().addScaledVector(axisDir, dT);
    aim(up, b, elbow); this.model.updateMatrixWorld(true);
    const c2 = ha.getWorldPosition(new THREE.Vector3());
    aim(fo, c2, wrist); this.model.updateMatrixWorld(true);
    // Keep the wrist or ankle's world orientation.
    const pw = ha.parent.getWorldQuaternion(new THREE.Quaternion());
    ha.quaternion.copy(pw.invert().multiply(handQ));
    ha.updateWorldMatrix(false, true);
  }

  updateFace(f) {
    const key = faceKey(f, this.look);
    if (key === this.faceKey) return;
    this.faceKey = key;
    if (this.look.brows3d) { // the sculpted brows move with the expression: they rise, and tilt (inner end up when sad / surprised,
      // down when cross) about their own middle — the only brows of the face (no printed ones under them)
      const E = EXPR[f.expr] || EXPR.neutral;
      const sep = this.look.eyeSep ?? 0.2;
      for (const [n, s] of [['brow3d_L', 1], ['brow3d_R', -1]]) {
        const o = this.parts[n]; if (!o) continue;
        o.userData.rest ||= { p: o.position.clone(), q: o.quaternion.clone() };
        const B = f.brow || E.brow;   // eased between expressions by anim.js
        const up = ((B[0] + B[1]) / 2 - 0.025) * 1.3;
        const th = Math.max(-0.35, Math.min(0.35, -s * (B[0] - B[1]) * 4));
        _q2.setFromAxisAngle(_ax.set(0, 0, 1), th);
        o.quaternion.copy(o.userData.rest.q).premultiply(_q2);
        _v.set(s * sep, 3.68, 0.5).applyQuaternion(o.userData.rest.q).add(o.userData.rest.p);   // the brow's middle, in the parent frame
        o.position.copy(o.userData.rest.p).sub(_v).applyQuaternion(_q2).add(_v);
        o.position.y += up;
      }
    }
    drawFace(this.faceCanvas.getContext('2d'), f, this.look);
    this.faceTex.needsUpdate = true;
  }

  socketWorld(name, target = new THREE.Matrix4()) {
    const s = this.sockets[name]; if (!s) return null;
    s.updateWorldMatrix(true, false);
    return target.copy(s.matrixWorld);
  }

  dispose() {
    this.faceTex?.dispose();
    this.relaxedRobeGeometry?.dispose();
    this.roomyCloak?.dispose();
    const skeletons = new Set();
    this.model.traverse((mesh) => { if (mesh.isSkinnedMesh) skeletons.add(mesh.skeleton); });
    for (const skeleton of skeletons) skeleton.dispose();
    for (const m of Object.values(this.mats)) m.dispose();
  }
}

function smooth01(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }

/** rotate bone `bone` (about its own pivot) so that the world point `from` (currently attached to its chain) moves to `to` */
function aim(bone, from, to) {
  const p = bone.getWorldPosition(new THREE.Vector3());
  const v1 = from.clone().sub(p).normalize(), v2 = to.clone().sub(p).normalize();
  if (v1.lengthSq() < 1e-9 || v2.lengthSq() < 1e-9) return;
  const rw = new THREE.Quaternion().setFromUnitVectors(v1, v2);
  const bw = bone.getWorldQuaternion(new THREE.Quaternion());
  const pw = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(pw.invert().multiply(rw.multiply(bw)));
}
