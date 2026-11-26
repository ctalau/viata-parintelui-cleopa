// Stage of the "blender" style: GLB sets / props / characters, posed by baked clips + procedural layers, rendered as a
// PURE function of t (rule 3). Same timeline, cameras, overlay and recorder interface as lib/engine/stage.js:
// renderAt(t), locate(t, id), subjects(t), evaluate(t) — the camera code is borrowed from Stage unchanged.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Stage } from '../engine/stage.js';
import { Overlay, preloadLogos } from '../engine/overlay.js';
import { sampleSegs, mixVec, lerpAngle, lastBefore, sceneAt, beatAt, smooth, clamp01, FADE, propBend } from '../engine/timeline.js';
import { createSet, applySky } from '../components/sets.js';
import { createProp } from '../components/props.js';
import { loadCharacterAsset, loadGLB, loadJSON, loadPortraitHeads } from './assets.js';
import { Character, MASKS, lookYaw } from './character.js';
import { actorLayers, postureAt, positionAt, talkW, convW } from './anim.js';
import { setupLook as fallbackLook } from './look-fallback.js';
import { youngField, harvestEdgeZ } from './youngfield.js';
import { SEAT_BACK } from './timeline3.js';
import { dressingOffset } from './timeline3.js';
import { careActions, floorPlacement, floorSitDrop, dress, bedPillows, calmHeading, BASKET_RELEASE } from './care.js';
import { Dough } from './dough.js';
const DOOR_SWING = -1.9; // radians a door turns about its hinge when fully open (inwards)

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const setNameOf = (def) => (typeof def === 'string' ? def : def?.type || def?.name || 'desert-lavra');

let lookModule = null;
async function loadLookModule() {
  if (lookModule !== null) return lookModule;
  try { lookModule = await import('./look.js'); } catch { lookModule = false; }
  return lookModule;
}

/** everything a film needs, loaded before the first frame (a missing GLB of a set/prop falls back to the procedural one) */
export async function preloadFilm(desc, tl) {
  await preloadLogos(desc);
  const char = await loadCharacterAsset('monk');
  const looks = tl.scenes.flatMap((sc) => Object.entries(sc.actors).map(([id, a]) =>
    ({ ...desc.characters?.[id]?.look, ...a.outfit })));
  await loadPortraitHeads(char, looks);
  // the yarn elder's head (look `head: "yarn"`, yarnhead.js): loaded only by the films that use it
  if (!char.yarn && Object.values(desc.characters || {}).some((c) => c.look?.head === 'yarn')) char.yarn = await loadGLB('assets/characters/yarn-elder.glb');
  if (!char.yarnSoft && Object.values(desc.characters || {}).some((c) => c.look?.head === 'yarn' && c.look?.wool === 'soft')) char.yarnSoft = await loadGLB('assets/characters/yarn-elder-soft.glb');
  const sets = {}, props = {}, propMeta = {};
  for (const sc of tl.scenes) {
    const n = setNameOf(sc.def.set);
    if (!(n in sets)) {
      const meta = await loadJSON(`assets/sets/${n}.json`, null);
      sets[n] = meta ? { gltf: await loadGLB(`assets/sets/${n}.glb`), meta } : null;
    }
    for (const p of Object.values(sc.props)) {
      if (p.type in props) continue;
      const meta = await loadJSON(`assets/props/${p.type}.json`, null);
      let g = null;
      try { g = meta || true ? await loadGLB(`assets/props/${p.type}.glb`).catch(() => null) : null; } catch { g = null; }
      props[p.type] = g; propMeta[p.type] = meta;
    }
  }
  for (const name of new Set(looks.flatMap(look => look.accessories || []))) {
    props[name] ||= await loadGLB(`assets/props/${name}.glb`);
    propMeta[name] ||= await loadJSON(`assets/props/${name}.json`);
  }
  const look = await loadLookModule();
  if (look && look.preloadLook) await look.preloadLook();
  return { char, sets, props, propMeta, look };
}



export class Stage3 {
  constructor(canvas, timeline, desc, assets, { scale = 1, quality = 'final', antialias = true } = {}) {
    this.tl = timeline; this.desc = desc; this.A = assets; this.quality = quality;
    this.W = Math.round(timeline.width * scale); this.H = Math.round(timeline.height * scale);
    this.out = canvas; canvas.width = this.W; canvas.height = this.H;
    this.gl = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.gl, antialias, preserveDrawingBuffer: true });
    this.renderer.setSize(this.W, this.H, false);
    this.renderer.localClippingEnabled = true;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(40, this.W / this.H, 0.1, 400);
    this.overlay = new Overlay(this.W, this.H, desc, timeline);
    this.ctx = canvas.getContext('2d');
    this.built = new Map();
    this.ray = new THREE.Raycaster();
    this.prepareCameras();
  }

  // ---------------------------------------------------------------- scene building
  build(sc) {
    if (this.built.has(sc.index)) return this.built.get(sc.index);
    for (const [k, v] of this.built) if (Math.abs(k - sc.index) > 1) { v.look?.dispose?.(); v.young?.dispose(); for (const a of Object.values(v.actors)) a.char.dispose(); this.built.delete(k); }
    const scene = new THREE.Scene();
    const setDef = typeof sc.def.set === 'string' ? { type: sc.def.set } : (sc.def.set || { type: 'desert-lavra' });
    const name = setNameOf(setDef);
    const S = this.A.sets[name];
    let setRoot, ground = [], colliders = [], seats = {}, look = null;
    const sky = sc.def.sky || setDef.sky || 'day';
    if (S) {
      setRoot = S.gltf.scene.clone(true);
      setRoot.userData.meta = S.meta;
      setRoot.traverse((o) => {
        const n = o.userData?.name || o.name || '';
        if (n.startsWith('col:')) { o.visible = false; colliders.push(o); }
        else if (/^ground/.test(n) && o.isMesh) { ground.push(o); o.receiveShadow = true; }
        else if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
        if (n.startsWith('seat:')) seats[n.slice(5)] = o;
      });
      // Move set dressing and its collision proxy together. Dots in Blender instance numbers are
      // absent from the corresponding collider name (for example jug.0 and col:jug0).
      if (setDef.offsets) setRoot.traverse((o) => {
        const offset = dressingOffset(setDef.offsets, o.userData?.name || o.name || '');
        if (offset) o.position.add(V(...offset));
      });
      // a set with two states of its field (harvest-field: `"reaped": true` = stubble and stooks instead of standing wheat)
      setRoot.traverse((o) => { const f = o.userData?.field; if (f) o.visible = f === (setDef.reaped ? 'reaped' : 'standing'); });
      // `"green": true` = the same field in spring, just sown: the tall wheat goes, a young field takes its place (below)
      if (setDef.green) setRoot.traverse((o) => { if (o.userData?.field) o.visible = false; });
      // `"hide": ["donkey"]` = leave out pieces of the set dressing (a node and its children by name, e.g. the set's own
      // donkey when the film brings its own) — they are not drawn (their colliders stay)
      if (setDef.hide) {
        const hide = [].concat(setDef.hide);
        setRoot.traverse((o) => { const n = o.userData?.name || o.name || ''; if (!n.startsWith('col:') && hide.includes(n)) o.visible = false; });
      }
      scene.add(setRoot);
      const fn = this.A.look?.setupLook || fallbackLook;
      look = fn({ THREE, renderer: this.renderer, scene, camera: this.camera, sky, set: setRoot, quality: this.quality });
    } else {
      // the procedural sets of the lego style keep working (with their own sky / lights)
      const set = createSet(setDef);
      setRoot = set.group; scene.add(setRoot);
      const s = applySky(scene, sky, { vivid: true });
      s.sun.shadow.mapSize.set(this.quality === 'draft' ? 1024 : 2048, this.quality === 'draft' ? 1024 : 2048);
      this.renderer.toneMappingExposure = 0.95;
      try { // a soft environment for the plastic / cloth of the figures
        const pm = new THREE.PMREMGenerator(this.renderer);
        const es = new THREE.Scene(); es.add(new THREE.HemisphereLight(0xffffff, 0x886644, 2));
        const m = new THREE.Mesh(new THREE.SphereGeometry(5, 16, 8), new THREE.MeshBasicMaterial({ color: 0xd8c8b0, side: THREE.BackSide })); es.add(m);
        scene.environment = pm.fromScene(es, 0.04).texture; scene.environmentIntensity = 0.4; pm.dispose();
      } catch { /* none */ }
      for (const pc of set.solids || []) colliders.push(pc);
      // the lego set's brick groups: the flat ones (base plate, square paving, road tiles) are the ground the figures
      // stand on (feet on the tiles, not sunk in them); the tall ones (walls, counters, ovens) get invisible collider
      // boxes "col:<name>", so the checks see a figure walking through a house and a camera inside a wall
      setRoot.updateMatrixWorld(true);
      const groups = []; setRoot.traverse((o) => { if (o.userData?.solids?.length) groups.push(o); });
      for (const o of groups) {
        const sol = o.userData.solids;
        if (sol.every((bx) => bx[4] <= 0.45)) { // floor-level; paving tiles and plates (≥ 2 wide) are walked on, a small base (a jug's foot) is not
          if (sol.some((bx) => bx[3] - bx[0] >= 1.9 || bx[5] - bx[2] >= 1.9)) o.traverse((m) => { if (m.isMesh) ground.push(m); });
          continue;
        }
        let name = ''; for (let x = o; x && x !== setRoot && !name; x = x.parent) name = x.name || '';
        for (const bx of sol) {
          if (bx[4] <= 0.45) continue;
          const m = new THREE.Mesh(new THREE.BoxGeometry(bx[3] - bx[0], bx[4] - bx[1], bx[5] - bx[2]), new THREE.MeshBasicMaterial());
          m.position.set((bx[0] + bx[3]) / 2, (bx[1] + bx[4]) / 2, (bx[2] + bx[5]) / 2);
          m.visible = false; m.name = `col:${name || 'set'}`; m.userData.name = m.name;
          o.add(m); colliders.push(m);
        }
      }
    }
    scene.updateMatrixWorld(true);
    // actors
    const actors = {};
    for (const [id, a] of Object.entries(sc.actors)) {
      const ch = this.desc.characters?.[id] || {};
      const c = new Character(this.A.char, { ...(ch.look || {}), ...(a.outfit || {}) });
      dress(c, this.A);
      scene.add(c.root);
      actors[id] = { id, data: a, char: c, seed: [...id].reduce((s, x) => s + x.charCodeAt(0), 0), fig: { root: c.root, faceAnchor: c.sockets.face || c.bones.head } };
    }
    // props
    const props = {};
    for (const [id, p] of Object.entries(sc.props)) {
      const g = this.A.props[p.type];
      let obj, grip = null, kind = 'front';
      const hinges = [];
      if (g) {
        // a rigged prop (a skinned mesh: donkey-fiesta) needs its skeleton cloned with it, else every copy would be
        // posed by the bones of the first one
        let skinned = false; g.scene.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
        obj = skinned ? cloneSkinned(g.scene) : g.scene.clone(true);
        if (skinned) obj.traverse((o) => { if (o.isSkinnedMesh) o.frustumCulled = false; }); // its bind-pose bounds do not follow a walk
        obj.traverse((o) => { const n = o.userData?.name || o.name; if (n === 'grip') grip = o; if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } if (n === 'col' || n?.startsWith('col:')) o.visible = false; });
        if (p.opts.grip) obj.traverse((o) => { if (o.userData?.name === p.opts.grip) grip = o; });
        const vnames = this.A.propMeta[p.type]?.variants || [];
        var variants = {};
        obj.traverse((o) => { const n = o.userData?.name || o.name; if (vnames.includes(n)) variants[n] = o; });
        for (const [n, o] of Object.entries(variants)) o.visible = n === (p.opts.variant || vnames[0]);
        kind = this.A.propMeta[p.type]?.carry || 'front';
        if (this.A.propMeta[p.type]?.hands === 2) kind = 'two';
        if (p.opts.carry) kind = p.opts.carry;   // "carry": "side" → hangs upright from one hand (the other is free)
        obj.traverse((o) => {
          if (typeof o.userData.bendX === 'number') hinges.push({ node: o, rest: o.rotation.x, angle: o.userData.bendX * Math.PI / 180 });
        });
      } else {
        obj = createProp(p.type, p.opts || {});
        if (p.opts.scale) obj.scale.setScalar(p.opts.scale);
        const box = new THREE.Box3().setFromObject(obj); const h = box.max.y - box.min.y;
        kind = obj.userData.twoHands ? 'two' : h > 1.6 ? 'side' : 'front';
        grip = new THREE.Object3D(); grip.position.set(0, h > 1.6 ? h * 0.42 : Math.max(0.05, box.max.y * 0.75), 0); obj.add(grip);
      }
      obj.userData.carryKind = kind;
      // animated critters (glTF extras `anim`): each copy gets its own seed, so two hens never move alike
      let sd = 7; for (const ch of id) sd = (sd * 31 + ch.charCodeAt(0)) % 9973;
      const contactPoints = {};
      obj.traverse((o) => {
        const name = o.userData?.name;
        if (name?.startsWith('pet:')) contactPoints[name] = o;
        if (!o.userData?.anim) return;
        o.userData.seed = p.opts.seed ?? sd;
        if (p.opts.radius != null) o.userData.radius = p.opts.radius;
        if (p.opts.rainWidth != null) o.userData.rainWidth = p.opts.rainWidth;
      });
      scene.add(obj);
      props[id] = { data: p, obj, grip, kind, hinges, variants: g ? variants : null, base: obj.scale.x, contactPoints }; // base: a procedural prop keeps its own size in the hand
    }
    for (const P of Object.values(props)) {
      const ch = actors[P.data.initial.actor]?.char, m = this.A.propMeta[P.data.type];
      if (P.data.opts.fixedScale && this.A.props[P.data.type]) {
        P.fixedScale = P.data.opts.scale || (P.data.opts.wear && ch?.look.scale) || 1;
      }
      if (!P.data.opts.wear || !ch || !m?.bone) continue;
      P.mount = new THREE.Object3D();
      P.rimMounted = P.data.type === 'scetis-cos';
      P.mount.position.fromArray(m.origin);
      if (P.fixedScale) P.mount.scale.setScalar(P.fixedScale / (ch.look.scale || 1));
      ch.model.add(P.mount);
      ch.root.updateMatrixWorld(true);
      ch.bones[m.bone].attach(P.mount);
    }
    // `put … "into": "<carrier>"`: a load hung on a pack animal — it goes to the carrier's slot for its type (prop meta
    // `slots`, in the carrier's space, where the carrier stands at that moment); when the hand lets go of it the carrier's
    // loaded variant takes over (its `bend` steps one load up) and the free prop hides, so the two never show together
    for (const [pid, P] of Object.entries(props)) for (const m of P.data.moves) {
      if (!m.into || m.intoDone) continue;
      const C = props[m.into], meta = C && this.A.propMeta[C.data.type], slot = meta?.slots?.[P.data.type] || meta?.slots?.[P.data.type.split('-')[0]];
      m.intoDone = true;
      if (!slot) { console.warn(`put ${pid} into ${m.into}: no slot for "${P.data.type}"`); continue; }
      const hc = this.propHolder(C, m.t0).holder, cp = hc.pos || [0, 0, 0], ch = hc.h || 0;
      const [sx, sy, sz] = slot.pos, c = Math.cos(ch), sn = Math.sin(ch);
      const X = cp[0] + sx * c + sz * sn, Z = cp[2] - sx * sn + sz * c;
      const gy = (x, z) => this.groundY({ ground }, x, z);   // the slot rides on the carrier's ground, not on the ground under the load
      m.to = { pos: [X, sy + (cp[1] || 0) + gy(cp[0], cp[2]) - gy(X, Z), Z], h: ch + (slot.face || 0) * Math.PI / 180 };
      const n = meta.variants.length - 1, prev = C.data.bend.length ? C.data.bend[C.data.bend.length - 1].to : (C.data.opts.bend ?? 0);
      const tAt = m.t1;
      C.data.bend.push({ t0: tAt, t1: tAt + 0.001, from: prev, to: Math.min(1, Math.round(prev * n + 1) / n + 1e-4) });
      C.data.bend.sort((x, y) => x.t0 - y.t0);
      P.data.visible.push({ t: tAt, v: false }); P.data.visible.sort((x, y) => x.t - y.t);
      // tied on (`tie`): the cord of this newest load shows when the knot is pulled tight (clip `tie`, event `knot`)
      if (m.tie) {
        const kNew = Math.round(Math.min(1, Math.round(prev * n + 1) / n) * n), T = m.tie[1] - m.tie[0];
        (C.ties ||= []).push({ k: kNew, t: m.tie[0] + Math.max(0.3, T - 0.45) });
      }
    }
    // a stool / rock / bench prop standing on the ground is a seat too (top centre, facing like the prop)
    for (const [id, P] of Object.entries(props)) {
      if (!/stool|rock|bench|seat|stone/.test(P.data.type) || P.data.initial.actor) continue;
      const hp = P.data.initial.pos;
      P.obj.position.set(hp[0], (hp[1] || 0) + this.groundY({ ground }, hp[0], hp[2]), hp[2]); P.obj.rotation.set(0, P.data.initial.h || 0, 0); P.obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(P.obj);
      const e = new THREE.Object3D(); e.position.set(hp[0], box.max.y, hp[2]); e.rotation.y = P.data.initial.h || 0; e.updateMatrixWorld(true);
      seats[`prop:${id}`] = e;
    }
    const B = { scene, setRoot, ground, colliders, seats, actors, props, look, sc, lego: !S };
    if (S && setDef.green) {
      // the young sown field: trodden wherever the actors of this scene walk through it (sampled every 0.05 s)
      const steps = [];
      for (const A of Object.values(actors)) {
        let prev = null;
        for (let t = sc.start; t <= sc.end; t += 0.05) {
          const p = positionAt(A.data, t);
          if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-4) steps.push({ t, x: p[0], z: p[1], dx: p[0] - prev[0], dz: p[1] - prev[1] });
          prev = p;
        }
      }
      B.young = youngField({ edgeZ: harvestEdgeZ, groundY: (x, z) => this.groundY({ ground }, x, z), steps });
      scene.add(B.young.group);
    }
    B.extra = this.propGestures(sc, B);
    this.built.set(sc.index, B);
    return B;
  }

  /** the cord meshes of the load that variant k of a stepped carrier (donkey-pack l0 … l3) adds to variant k - 1:
   *  objects named `l<k>.<kind>.ties` (glTF drops the dots) whose kind variant k - 1 does not have yet */
  newTies(P, names, k) {
    const cache = (P._newTies ||= {});
    if (cache[k]) return cache[k];
    const kinds = (v) => { const out = new Map(); P.variants[names[v]]?.traverse((o) => { const mm = /^l\d+\.?(\w+?)\.?ties$/.exec(o.name); if (mm) out.set(mm[1], o); }); return out; };
    const cur = kinds(k), before = k > 0 ? kinds(k - 1) : new Map();
    return (cache[k] = [...cur].filter(([kind]) => !before.has(kind)).map(([, o]) => o));
  }

  /** give / take / put / pick clips from the prop moves; the old engine's "offer" / "receive" helpers are replaced */
  propGestures(sc, B) {
    const extra = {}; const skip = new Set();
    for (const [pid, p] of Object.entries(sc.props)) for (const m of p.moves) {
      const D = m.t1 - m.t0;
      const hangs = this.hangs(B.props?.[pid]); // hangs from its handle: no deep stoop
      const add = (id, clip, hand) => (extra[id] ||= []).push({ clip, name: clip, hand: hand || 'R', t0: m.t0, t1: m.t1 });
      if (m.from.actor && m.to.actor) {
        add(m.from.actor, m.reach ? 'offer' : 'give', m.from.hand);
        add(m.to.actor, m.reach ? 'offer' : 'take', m.to.hand);
      }
      else if (m.from.actor && !B.props[pid]?.rimMounted) add(m.from.actor, m.drop ? (m.slip ? 'slip' : 'drop') : m.reach ? 'offer' : hangs ? 'set_down' : 'put_down', m.from.hand);
      // a load hung on a pack animal is then tied on with both hands
      if (m.tie && m.from.actor && this.A.char?.clips?.tie) (extra[m.from.actor] ||= []).push({ clip: 'tie', name: 'tie', hand: 'R', t0: m.tie[0], t1: m.tie[1] });
      else if (!m.from.actor && m.to.actor) add(m.to.actor, m.reach ? 'take' : hangs ? 'lift_up' : 'pick_up', m.to.hand);
      for (const id of [m.from.actor, m.to.actor]) if (id) skip.add(`${id}@${m.t0.toFixed(3)}`);
      void D;
    }
    for (const [id, A] of Object.entries(B.actors)) {
      for (const g of A.data.gestures) if ((g.name === 'offer' || g.name === 'receive') && skip.has(`${id}@${g.t0.toFixed(3)}`)) g.skip = true;
    }
    return extra;
  }

  /** a prop carried by a high handle (a basket) is set down / lifted with a small knee bend; a low one (a pouch lying on
   *  the ground, its tie a hand's breadth up) needs the deep stoop of put_down / pick_up */
  hangs(P) {
    if (!P || P.kind !== 'side' || !this.A.char?.clips?.set_down) return false;
    const mh = this.A.propMeta[P.data.type]?.hangs;
    if (mh != null) return !!mh; // prop meta `hangs`: set down / lifted by its handle with a small knee bend (a load hung on a donkey)
    if (P._hangs == null) P._hangs = !P.grip || V().setFromMatrixPosition(this.gripInv(P).clone().invert()).y * (this.A.props[P.data.type] ? P.fixedScale || P.data.opts.scale || 1 : 1) > 0.9;
    return P._hangs;
  }

  /** the moment (0..1 of the move) the hand lets go / takes hold = the clip's own release / grab event, as the clip is
   *  played (scaled into a shorter move, at its own pace in a longer one) */
  moveEv(P, move) {
    if (move.drop) return 0.32;
    if (move.from.actor && move.to.actor) return 0.5;
    if (P.rimMounted && move.from.actor && move.to.pos) return BASKET_RELEASE;
    const put = !!move.from.actor, def = put ? 0.53 : 0.45;
    if (move.reach) return def;
    const clip = this.hangs(P) ? (put ? 'set_down' : 'lift_up') : (put ? 'put_down' : 'pick_up');
    const C = this.A.char?.clips?.[clip], e = C?.meta?.events?.[put ? 'release' : 'grab'];
    const D = move.t1 - move.t0;
    if (e == null || !(D > 0)) return def;
    return D <= C.duration ? e / C.duration : e / D;
  }

  groundY(B, x, z) {
    if (!B.ground.length) return 0;
    this.ray.set(V(x, 200, z), V(0, -1, 0)); this.ray.far = 400;
    const hit = this.ray.intersectObjects(B.ground, false)[0];
    return hit ? hit.point.y : 0;
  }

  /** the height a figure stands at. On a GLB set = the ground under it. On a fallback lego set the paving / road tiles
   *  are 0.4 steps: the figure rises onto a tile as it comes near (full height within 0.5 = its feet, nothing at 1.1),
   *  so its feet never sink into the tile's edge and it never pops up a step in one frame */
  standY(B, x, z) {
    if (!B.lego) return this.groundY(B, x, z);
    let h = this.groundY(B, x, z);
    for (let r = 0.5; r < 1.1; r += 0.075) {
      const k = 1 - (r - 0.5) / 0.6;
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; h = Math.max(h, this.groundY(B, x + r * Math.sin(a), z + r * Math.cos(a)) * k); }
    }
    return h;
  }

  /** a procedural prop whose origin is not its bottom (a pouch hangs from its tie) says how high it sits on the ground */
  groundLift(P) { return this.A.props[P.data.type] ? 0 : (P.obj.userData.ground || 0) * P.base; }

  propHolder(p, t) {
    let holder = p.data.initial, move = null;
    for (const m of p.data.moves) { if (t >= m.t1) holder = m.to; else if (t >= m.t0) { move = m; break; } }
    return { holder, move };
  }

  /** who holds the prop at t (handover / release / grab moments of the clips) */
  propState(P, t) {
    const { holder, move } = this.propHolder(P, t);
    if (!move) return holder;
    const k = (t - move.t0) / Math.max(1e-6, move.t1 - move.t0);
    // a dropped prop leaves the hand when it starts falling (DROP0 in placeProp), while the drop clip still plays
    return k < this.moveEv(P, move) ? move.from : move.to;
  }

  // ---------------------------------------------------------------- per-frame evaluation
  evaluate(t, { rest = false } = {}) {
    const sc = sceneAt(this.tl, t);
    const B = this.build(sc);
    if (B.young) B.young.uTime.value = t;
    // set doors swung by the descriptor ({ door: "cell1", open: 1 }): the node `door:<name>` turns about its hinge (pure in t)
    if (sc.doors && B.setRoot) {
      B.doors ||= {};
      for (const [n, segs] of Object.entries(sc.doors)) {
        if (!(n in B.doors)) {
          let o = null; B.setRoot.traverse((x) => { if (!o && (x.userData?.name ?? x.name) === `door:${n}`) o = x; });
          B.doors[n] = o ? { o, h: o.rotation.y, rest: o.quaternion.clone() } : null;
        }
        const D = B.doors[n]; if (!D) continue;
        const k = sampleSegs(segs, t, 0, (a, b, u) => a + (b - a) * smooth(u));
        const swing = B.setRoot.userData.meta?.doorLeaves?.[n]?.swing;
        if (swing == null) D.o.rotation.y = D.h + DOOR_SWING * k;
        else D.o.quaternion.copy(D.rest).multiply(new THREE.Quaternion().setFromAxisAngle(V(0,1,0),swing*k));
        D.o.updateMatrixWorld(true);
      }
    }
    // holding (for the carry layers)
    const holding = {};
    for (const P of Object.values(B.props)) {
      if (P.kind === 'belt' || P.mount) continue;
      const kind = this.A.propMeta[P.data.type]?.carryPose ?? P.kind;
      const visible = lastBefore(P.data.visible, t, 'v', P.data.opts.visible !== false);
      const blend = P.data.opts.carryBlend;
      if (!blend) {
        const holder = this.propState(P, t);
        if (visible && holder.actor) (holding[holder.actor] ||= {})[holder.hand || 'R'] = kind;
        continue;
      }
      const { holder, move } = this.propHolder(P, t);
      const around = (time) => smooth((t - time + blend / 2) / blend);
      const visibility = P.data.visible.find((v) => Math.abs(t - v.t) < blend / 2);
      const alpha = visibility ? (visibility.v ? around(visibility.t) : 1 - around(visibility.t)) : Number(visible);
      const put = (dest, weight) => {
        if (!dest.actor || weight <= 0) return;
        const arm = holding[dest.actor] ||= {};
        const side = dest.hand || 'R';
        if (arm[side] && (arm[side].weight ?? 1) >= weight) return;
        arm[side] = { kind, weight };
      };
      if (move) {
        const ev = move.t0 + this.moveEv(P, move) * (move.t1 - move.t0);
        const w = around(ev);
        put(move.from, alpha * (1 - w));
        put(move.to, alpha * w);
      } else put(holder, alpha);
    }
    // just let go (put / dropped / given away): the free arm that hung relaxed beside the carrying one melts back (0.6 s)
    const released = {};
    for (const P of Object.values(B.props)) {
      for (const m of P.data.moves) {
        if (P.mount || P.data.opts.carryBlend) continue;
        if (!m.from.actor || m.to.actor === m.from.actor) continue;
        const tr = m.t0 + this.moveEv(P, m) * (m.t1 - m.t0), u = (t - tr) / 0.6;
        if (u < 0 || u >= 1) continue;
        const side = m.from.hand || 'R';
        if (holding[m.from.actor]?.[side]) continue;
        (released[m.from.actor] ||= {})[side] = Math.max(released[m.from.actor]?.[side] || 0, 1 - u * u * (3 - 2 * u));
      }
    }
    // who is talking, as smooth weights (a head that turns / tilts at a line boundary eases, it never snaps)
    const tw = {}; for (const [id, A] of Object.entries(B.actors)) tw[id] = A.char.root.visible || lastBefore(A.data.visible, t, 'v', A.data.initial.visible) !== false ? talkW(A.data, t) : 0;
    const cw = {}; for (const [id, A] of Object.entries(B.actors)) cw[id] = A.char.root.visible || lastBefore(A.data.visible, t, 'v', A.data.initial.visible) !== false ? convW(A.data, t) : 0;
    const someoneTalks = Object.values(tw).some((w) => w > 0);
    const states = {};
    for (const [id, A] of Object.entries(B.actors)) {
      const a = A.data;
      let pos = positionAt(a, t);
      let h = this.desc.turnSpeed ? calmHeading(A, sc, t, this.desc.turnSpeed) : sampleSegs(a.head, t, a.initial.h, lerpAngle);
      const visible = lastBefore(a.visible, t, 'v', a.initial.visible);
      A.char.root.visible = visible !== false;
      const st = actorLayers(a, t, { timedPostures: this.desc.poseTiming === 'scaled', asset: this.A.char, look: A.char.look, seed: A.seed, holding: holding[id], released: released[id], extraGestures: B.extra[id], someoneTalks, listenW: Math.max(0, ...Object.entries(tw).filter(([o]) => o !== id).map(([, w]) => w)) });
      // seats: a seated actor sits on the nearest seat (its root = the feet, 0.5 in front of the seat centre)
      const floorDrop = floorSitDrop(st.posture, A.char.look.scale);
      let lift = -floorDrop, seat = null;
      if (st.sitW > 0 && !floorDrop && Object.keys(B.seats).length) {
        let best = null;
        for (const [name, s] of Object.entries(B.seats)) {
          const sp = s.getWorldPosition(V()); const q = s.getWorldQuaternion(new THREE.Quaternion());
          const f = V(0, 0, 1).applyQuaternion(q); const hh = Math.atan2(f.x, f.z);
          const foot = [sp.x + Math.sin(hh) * SEAT_BACK, sp.z + Math.cos(hh) * SEAT_BACK];
          const d = Math.hypot(foot[0] - pos[0], foot[1] - pos[1]);
          if (d < 1.0 && (!best || d < best.d)) best = { name, d, foot, hh, y: sp.y };
        }
        if (best) {
          seat = best.name;
          if (this.desc.poseTiming === 'scaled') {
            pos = mixVec(pos, best.foot, st.sitW); h = lerpAngle(h, best.hh, st.sitW);
          } else { pos = best.foot; h = best.hh; }
          lift = (best.y - this.standY(B, pos[0], pos[1]) - this.A.char.meta.figure.seat * (A.char.look.scale || 1)) * st.sitW;
        }
      }
      if (st.sitW > 0 && !floorDrop && !Object.keys(B.seats).length) {
        // no seat in the set: sit where the descriptor says (the old engines' `seat` = height of the seat top)
        // with the pelvis over the given point
        pos = [pos[0] + Math.sin(h) * SEAT_BACK * st.sitW, pos[1] + Math.cos(h) * SEAT_BACK * st.sitW];
        if (a.initial.seat) lift = (a.initial.seat - this.A.char.meta.figure.seat * (A.char.look.scale || 1)) * st.sitW;
      }
      const gy = this.standY(B, pos[0], pos[1]);
      A.char.root.position.set(pos[0], gy, pos[1]);
      A.char.root.rotation.set(0, h, 0);
      A.char.root.updateMatrixWorld(true);
      states[id] = { st, pos, h, gy, lift, seat };
      floorPlacement(A, states[id], sc.def.cast[id], t);
    }
    // look-at targets (another actor's face / the camera / a point)
    for (const [id, A] of Object.entries(B.actors)) {
      const { st, lift } = states[id];
      // the look of this actor for a look state (lookTarget / lookPrev / lookSince): head target, weight, face (gaze)
      const lookOf = (st) => {
        let target = null, lw = 1;
        const pt = (x) => (x && B.actors[x] ? B.actors[x].char.root.position.clone().add(V(0, 3.4, 0)) : x === 'camera' ? this.camera.position.clone()
          : Array.isArray(x) ? V(x[0], x[2] != null ? x[1] : 3.2, x[2] != null ? x[2] : x[1]) : null);
        let lt = st.lookTarget;
        const prevT = pt(st.lookPrev);
        if (lt && B.actors[lt]) target = B.actors[lt].char.root.position.clone().add(V(0, 3.4, 0));
        else if (lt === 'camera') target = this.camera.position.clone();
        else if (Array.isArray(lt)) target = V(lt[0], lt[2] != null ? lt[1] : 3.2, lt[2] != null ? lt[2] : lt[1]);
        // the automatic look (listeners toward who speaks, the speaker toward the nearest listener)
        const autoLook = () => {
          let target = null, lw = 1;
          // listeners turn their head a little toward who speaks; who speaks looks at the nearest listener. Smooth weights
          // and a blended target: no snap when a line starts or ends, or when the talk passes to the other one
          const own = cw[id] || 0, sum = V(); let wsum = 0, wmax = 0;
          const others = Object.entries(B.actors).filter(([o, O]) => o !== id && visW(O.data, t) > 0);
          for (const [o, O] of others) { const w = (cw[o] || 0) * visW(O.data, t); if (w > 0) { sum.addScaledVector(O.char.root.position, w); wsum += w; wmax = Math.max(wmax, 0.55 * w); } }
          if (own > 0 && others.length) {
            // the nearest listener, as a smooth weighting by distance (picking THE nearest jumped when two were about as near)
            const me = A.char.root.position, ds = others.map(([, O]) => O.char.root.position.distanceTo(me)), dmin = Math.min(...ds);
            const ws = others.map(([, O], i) => Math.exp(-(ds[i] - dmin) * 1.5) * visW(O.data, t)), wt = ws.reduce((x, y) => x + y, 0) || 1;
            let vwMax = 0;
            others.forEach(([, O], i) => { const vw = own * ws[i] / wt; sum.addScaledVector(O.char.root.position, vw * 2); wsum += vw * 2; vwMax = Math.max(vwMax, own * visW(O.data, t)); });
            wmax = Math.max(wmax, 0.65 * vwMax);
          }
          if (wsum > 0) { target = sum.multiplyScalar(1 / wsum).add(V(0, 3.4, 0)); lw = wmax * (1 - (st.walking?.w || 0)) * (1 - (st.busy || 0)); }
          return { target, lw };
        };
        if (lt == null) ({ target, lw } = autoLook());
        // the head turns at a calm speed: 0.45 s for a small turn, longer for a big one (reviewer 043: a lookAt from one side to
        // the other in 0.45 s was a sudden head jerk)
        const hp = A.char.root.position.clone().add(V(0, 3.4, 0));
        const ahead = () => hp.clone().add(A.char.root.getWorldDirection(V()).setY(0).multiplyScalar(4));
        const turnDur = (a, b) => {
          if (!a || !b) return 0.45;
          const u = a.clone().sub(hp).setY(0), w = b.clone().sub(hp).setY(0);
          return u.lengthSq() < 1e-6 || w.lengthSq() < 1e-6 ? 0.45 : Math.max(0.45, u.angleTo(w) * 0.6);
        };
        // from one look target to another: turn the DIRECTION (around the head), not the point along a line — a line from a
        // point behind to a point ahead passes by the head, and the head whipped around there (reviewer 043)
        const fwdW = A.char.root.getWorldDirection(V()).setY(0).normalize();
        const turn = (a, b, k) => {
          // a start point behind the shoulder was not really looked at (the neck reaches ±70°): start from what the head
          // could see, else the turn sweeps through the side first and comes back (reviewer 043)
          const ua = a.clone().sub(hp), flat = V(ua.x, 0, ua.z), fl = flat.length();
          if (fl > 1e-4) {
            const yaw = Math.atan2(V().crossVectors(fwdW, flat).y, fwdW.dot(flat) );
            // where the head really pointed (Character.lookAt: yaw clamped to ±1.2, faded out behind the back)
            if (Math.abs(yaw) > 1.2) a = hp.clone().add(ua.applyAxisAngle(V(0, 1, 0), Math.sign(yaw) * lookYaw(Math.abs(yaw)) - yaw));
          }
          const u = a.clone().sub(hp), w = b.clone().sub(hp), lu = u.length(), lv = w.length();
          if (lu < 1e-4 || lv < 1e-4) return a.clone().lerp(b, k);
          const q = new THREE.Quaternion().setFromUnitVectors(u.clone().divideScalar(lu), w.clone().divideScalar(lv));
          const qk = new THREE.Quaternion().slerp(q, k);
          return hp.clone().add(u.divideScalar(lu).applyQuaternion(qk).multiplyScalar(lu + (lv - lu) * k));
        };
        let dur = 0.45;
        if (st.lookSince < 3) {
          if (lt == null && prevT) dur = turnDur(prevT, target || ahead());
          else if (target && st.lookTarget != null) dur = turnDur(pt(st.lookPrev) || autoLook().target || ahead(), target);
        }
        const ease = smooth(st.lookSince / dur);
        if (ease < 1 && lt == null && prevT) {   // letting go of an explicit target: glide back to the automatic look
          if (target) { target = turn(prevT, target, ease); lw = 1 + (lw - 1) * ease; } else { target = prevT; lw = 1 - ease; }
        } else if (target && st.lookTarget != null && ease < 1) {   // a new explicit target: the head turns over 0.45 s (from the previous one if any)
          const from = pt(st.lookPrev);
          if (from) target = turn(from, target, ease);
          else {
            // from the automatic look (no snap: reviewer 042 saw the head jump when a lookAt began during a dialogue)
            const au = autoLook();
            if (au.target) { target = turn(au.target, target, ease); lw = au.lw + (1 - au.lw) * ease; } else lw *= ease;
          }
        }
        // an explicit look at a point below the eyes (something on the ground): the eyes look down too, so the head needs
        // to bow only a little (a bowed head pushes a sculpted beard into the chest)
        let face = st.face;
        if (target && Array.isArray(st.lookTarget) || (Array.isArray(st.lookPrev) && st.lookTarget == null && ease < 1)) {
          const eye = A.char.root.position.y + 3.5, d = Math.hypot(target.x - A.char.root.position.x, target.z - A.char.root.position.z) || 1;
          // the target itself already turns from the previous point to the new one: from one point to another the gaze follows
          // it (k = 1); only a look that starts from no point fades the gaze in (film 050: the eyes jumped level for a frame)
          const k = Array.isArray(st.lookTarget) ? (Array.isArray(st.lookPrev) ? 1 : ease) : 1 - ease;
          face = { ...face, gazeY: Math.max(-1, Math.min(1, ((target.y - eye) / d) * 2.2)) * k };
        }
        return { target, lw: lw * (1 - (A.char.reclineWeight || 0)), face };
      };
      const L = lookOf(st);
      const layers = rest ? st.layers.slice(0, 1).map((L) => ({ ...L, t: 0 })) : st.layers;
      // a lookAt change never jumps: for 0.6 s the head blends from the pose it had with the previous look to the new one
      // (the look modes — automatic, explicit point / actor, letting go — are computed differently, and a switch between
      // them could jump a few cm in one frame: film 050). Pure in t: both looks are evaluated at t.
      const LB = 0.6;
      if (!rest && st.lookSince < LB) {
        const L0 = lookOf({ ...st, lookTarget: st.lookPrev ?? null, lookPrev: undefined, lookSince: 99 });
        A.char.pose(layers, { lookAt: L0.target, lookW: L0.lw, face: L0.face, pelvisLift: lift });
        const q0 = { neck: A.char.bones.neck.quaternion.clone(), head: A.char.bones.head.quaternion.clone() };
        const g0 = L0.face?.gazeY ?? 0;
        const k = smooth(st.lookSince / LB);
        const f1 = L.face ? { ...L.face, gazeY: g0 + ((L.face.gazeY ?? 0) - g0) * k } : L.face;
        A.char.pose(layers, { lookAt: L.target, lookW: L.lw, face: f1, pelvisLift: lift });
        A.char.bones.neck.quaternion.slerpQuaternions(q0.neck, A.char.bones.neck.quaternion.clone(), k);
        A.char.bones.head.quaternion.slerpQuaternions(q0.head, A.char.bones.head.quaternion.clone(), k);
        A.char.root.updateMatrixWorld(true);
      } else A.char.pose(layers, { lookAt: rest ? null : L.target, lookW: L.lw, face: rest ? null : L.face, pelvisLift: lift });
    }
    if (!rest) {
      this.contacts(B, t);
      const cups = this.alignCupGrips(B, t);
      careActions(B, t, states, cups, this.foodBites(B, t), (prop) => this.placeProp(B, prop, t));
      this.reachProps(B, t);
    }
    // props
    for (const P of Object.values(B.props)) { this.placeProp(B, P, t);
      if (P.mount && !P.rimMounted && P.data.moves.length) {
        const k = (t - P.data.moves[0].t0) / .64;
        if (k >= 0 && k < 1) {
          const w = 1 - smooth(k);
          P.obj.position.lerp(P.mount.getWorldPosition(V()), w);
          const lift = Math.sin(Math.PI * k);
          P.obj.position.y += .31 * lift;
          const wearer = B.actors[P.data.initial.actor]?.char;
          if (wearer) P.obj.position.addScaledVector(wearer.root.getWorldDirection(V()), .60 * lift);
          P.obj.quaternion.slerp(P.mount.getWorldQuaternion(new THREE.Quaternion()), w);
          P.obj.scale.lerp(P.mount.getWorldScale(V()), w);
        }
      }
      bedPillows(P, t); }
    // a soft dough (dough-trough): the lump is shaped by the kneader's hands at runtime (lib/engine3/dough.js)
    for (const P of Object.values(B.props)) if (P.data.type === 'dough-trough' && P.variants) (P.dough ||= new Dough(P)).update(this, B, t, P.variantNow);
    B.scene.updateMatrixWorld(true);
    return { sc, B, states };
  }

  // On a wide handle the right hand takes the +X end and the left takes the −X end.
  handOffset(P, hand) {
    const span = P.kind === 'side' ? this.A.propMeta[P.data.type]?.gripSpan || 0 : 0;
    return (hand === 'L' ? -.5 : .5) * span * (P.fixedScale || P.data.opts.scale || 1);
  }

  carryTurn(P, hand) {
    const turn = P.data.opts.turn;
    return (typeof turn === 'object' ? turn?.[hand || 'R'] : turn) || 0;
  }

  sidePropRotation(P, hand, yaw, leanWeight) {
    const side = hand === 'R' ? 1 : -1;
    const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw);
    return q.multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), -side * (P.data.opts.lean ?? 0.4) * leanWeight));
  }

  heldPropTilt(P, t) {
    return propBend(P.data.tilt, t, +P.data.opts.tilt || 0);
  }

  tiltRotation(yaw, tilt) {
    return new THREE.Quaternion().setFromAxisAngle(V(Math.cos(yaw), 0, -Math.sin(yaw)), tilt * Math.PI / 180);
  }

  alignCupGrips(B, t) {
    const cups = {};
    for (const P of Object.values(B.props)) {
      const meta = this.A.propMeta[P.data.type];
      if (!meta?.sipRim) continue;
      const h = this.propState(P, t);
      const ch = B.actors[h.actor]?.char;
      if (!ch) continue;
      const side = h.hand || 'R';
      const sock = ch.sockets['hand.' + side], wrist = ch.bones['hand_' + side];
      const yaw = ch.root.rotation.y, turn = this.carryTurn(P, side);
      const q = this.sidePropRotation(P, side, yaw + turn, 1).premultiply(this.tiltRotation(yaw, this.heldPropTilt(P, t)));
      // The cup's handle is on +X, with the vessel extending away from the palm.
      const grip = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -Math.PI / 2);
      const aim = wrist.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
        .multiply(q).multiply(grip).multiply(sock.quaternion.clone().invert());
      const contact = sock.getWorldPosition(V());
      const w = 1 - (this.handoff(B, P, t)?.settle || 0);
      wrist.quaternion.slerp(aim, w);
      wrist.updateWorldMatrix(false, true);
      ch.armIK(side, wrist.getWorldPosition(V()).add(contact).sub(sock.getWorldPosition(V())));
      const rim = V().fromArray(meta.sipRim).applyAxisAngle(V(0, 1, 0), -turn).sub(P.grip.position)
        .multiplyScalar(P.fixedScale || P.data.opts.scale || 1).applyQuaternion(q);
      (cups[h.actor] ||= {})[side] = rim;
    }
    return cups;
  }

  foodBites(B, t) {
    const bites = {};
    for (const P of Object.values(B.props)) {
      const meta = this.A.propMeta[P.data.type];
      const bite = meta?.biteByGrip?.[P.data.opts.grip] ?? meta?.bite;
      if (!bite || !lastBefore(P.data.visible, t, 'v', P.data.opts.visible !== false)) continue;
      const { actor, hand = 'R' } = this.propState(P, t);
      const ch = B.actors[actor]?.char;
      if (!ch || P.kind !== 'side') continue;
      const sc = P.fixedScale || P.data.opts.scale || 1;
      const yaw = ch.root.rotation.y + this.carryTurn(P, hand);
      const q = this.sidePropRotation(P, hand, yaw, 1);
      const offset = V().fromArray(bite).sub(P.grip.position).multiplyScalar(sc);
      offset.x -= this.handOffset(P, hand);
      (bites[actor] ||= {})[hand] = offset.applyQuaternion(q);
    }
    return bites;
  }

  transferYaw(B, P, m, k) {
    const a = B.actors[m.from.actor].char.root.rotation.y + this.carryTurn(P, m.from.hand);
    const b = B.actors[m.to.actor].char.root.rotation.y + this.carryTurn(P, m.to.hand);
    return lerpAngle(a, b, smooth((k - .3) / .6));
  }

  /** give / take: guide both hands onto the handle around the handover (IK) */
  contacts(B, t) {
    for (const P of Object.values(B.props)) for (const m of P.data.moves) {
      if (!(m.from.actor && m.to.actor) || t < m.t0 || t > m.t1) continue;
      const a = B.actors[m.from.actor]?.char, b = B.actors[m.to.actor]?.char;
      if (!a || !b) continue;
      const k = (t - m.t0) / (m.t1 - m.t0);
      const w = Math.sin(Math.PI * clamp01((k - 0.15) / 0.7)) ** 2 * (k > 0.15 && k < 0.85 ? 1 : 0);
      if (w <= 0) continue;
      const ha = a.sockets[`hand.${m.from.hand || 'R'}`].getWorldPosition(V()), hb = b.sockets[`hand.${m.to.hand || 'R'}`].getWorldPosition(V());
      const mid = ha.clone().add(hb).multiplyScalar(0.5);
      const halfGap = (this.handOffset(P, m.from.hand) - this.handOffset(P, m.to.hand)) / 2;
      const yaw = this.transferYaw(B, P, m, k);
      const offset = V(halfGap * Math.cos(yaw), 0, -halfGap * Math.sin(yaw));
      const off = (c, side, from, sign) => {
        const wrist = c.bones[`hand_${side}`].getWorldPosition(V());
        return mid.clone().addScaledVector(offset, sign).add(wrist.sub(from));
      };
      a.armIK(m.from.hand || 'R', off(a, m.from.hand || 'R', ha, 1), w);
      b.armIK(m.to.hand || 'R', off(b, m.to.hand || 'R', hb, -1), w);
    }
  }

  /** put / pick: where the prop rests on the ground (or shelf) and how far the move is from the release / grab */
  handoff(B, P, t) {
    const { move } = this.propHolder(P, t);
    if (!move || move.drop || !!move.from.actor === !!move.to.actor) return null;
    const put = !!move.from.actor, ev = this.moveEv(P, move);
    const k = (t - move.t0) / Math.max(1e-6, move.t1 - move.t0);
    const r = put ? move.to : move.from, pos = r.pos || [0, 0, 0];
    const rest = V(pos[0], (pos[1] || 0) + this.groundY(B, pos[0], pos[2]) + this.groundLift(P), pos[2]);
    const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), r.h || 0);
    const ss = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
    // the hand goes to the handle a little before, and leaves it a little after
    const reach = ss(ev - 0.32, ev - 0.07, k) * (1 - ss(ev + 0.05, ev + 0.28, k));
    // the prop is exactly at rest at the event, and glued to the hand away from it
    // a load hung on a pack animal (`into`, high above the hip) leaves the hand early and flies up onto its slot, so a long
    // load (the mat roll) never sweeps through the loader's face on the way up
    const sw = put && move.into ? 0.45 : 0.2;
    const settle = put ? ss(ev - sw, ev, k) : 1 - ss(ev, ev + 0.2, k);
    return { move, put, k, ev, rest, q, reach, settle, actor: put ? move.from.actor : move.to.actor, hand: (put ? move.from.hand : move.to.hand) || 'R' };
  }

  /** a load hung on a pack animal and then TIED on (`tie`): the hand stays on its handle from the moment it reaches the
   *  slot until the knot is pulled tight (the cord shows), so the load never hangs in the air with nothing holding it */
  tieHold(B, P, t) {
    if (!P.grip) return null;
    for (const m of P.data.moves) {
      if (!m.into || !m.tie || !m.from.actor) continue;
      const D = m.t1 - m.t0, tEv = m.t0 + this.moveEv(P, m) * D, T = m.tie[1] - m.tie[0], knot = m.tie[0] + Math.max(0.3, T - 0.45);
      if (t < tEv || t > knot + 0.3) continue;
      const ss = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
      const pos = m.to.pos || [0, 0, 0];
      return { actor: m.from.actor, hand: m.from.hand || 'R', reach: 1 - ss(knot + 0.05, knot + 0.3, t),
        rest: V(pos[0], (pos[1] || 0) + this.groundY(B, pos[0], pos[2]) + this.groundLift(P), pos[2]),
        q: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), m.to.h || 0) };
    }
    return null;
  }

  reachProps(B, t) {
    for (const P of Object.values(B.props)) {
      if (P.rimMounted) continue;
      const H0 = this.handoff(B, P, t), T = this.tieHold(B, P, t);
      const H = T && (!H0 || T.reach >= H0.reach) ? T : H0;
      if (!H || H.reach <= 0 || !P.grip) continue;
      const c = B.actors[H.actor]?.char; if (!c) continue;
      const g = V().setFromMatrixPosition(this.gripInv(P).clone().invert());
      if (P.fixedScale) g.multiplyScalar(P.fixedScale);
      g.x += this.handOffset(P, H.hand);
      g.applyQuaternion(H.q).add(H.rest);
      if (!this.A.propMeta[P.data.type]?.sipRim) g.y += 0.12; // let the fist close over the tie or handle
      const sock = c.sockets[`hand.${H.hand}`].getWorldPosition(V()), wr = c.bones[`hand_${H.hand}`].getWorldPosition(V());
      c.armIK(H.hand, g.add(wr.sub(sock)), H.reach);
    }
  }

  placeProp(B, P, t) {
    const obj = P.obj;
    obj.visible = lastBefore(P.data.visible, t, 'v', P.data.opts.visible !== false);
    const h = this.propState(P, t);
    if (P.hinges.length) {
      const bend = clamp01(propBend(P.data.bend, t, P.data.opts.bend ?? 0));
      for (const { node, rest, angle } of P.hinges) node.rotation.x = rest + angle * bend;
    }
    if (P.variants && P.variants.broken && !P.data.opts.variant) {
      // a prop with a `broken` variant breaks when its `bend` value passes 0.5
      let broken = propBend(P.data.bend, t, P.data.opts.bend ?? 0) >= 0.5;
      // dropped and broken by the fall: it breaks at the very moment it hits the ground (not a little before or after)
      for (const m of P.data.moves) {
        if (!m.drop || t < m.t0 || t > m.t1 + 0.6) continue;
        if (propBend(P.data.bend, m.t1 + 0.6, P.data.opts.bend ?? 0) >= 0.5 && propBend(P.data.bend, m.t0, P.data.opts.bend ?? 0) < 0.5) broken = t >= m.t0 + 0.70 * (m.t1 - m.t0);
      }
      for (const [n, o] of Object.entries(P.variants)) { o.visible = n === (broken ? 'broken' : 'intact'); o.scale.set(1, 1, 1); }
      // the moment it breaks reads as a crunch, not as a swap: the whole basket squashes flat for a few frames as it
      // hits, and the broken one springs up out of that squash (both scale from their base, on the ground)
      const tb = this.breakTime(P);
      if (tb != null && t > tb - 0.09 && t < tb + 0.32) {
        const S = (o, sx, sy) => o && o.scale.set(sx, sy, sx);
        if (t < tb) { const k = smooth((t - (tb - 0.09)) / 0.09); S(P.variants.intact, 1 + 0.14 * k, 1 - 0.4 * k); }
        else { const u = (t - tb) / 0.32, back = 1 + 2.2 * (u - 1) ** 3 + 1.2 * (u - 1) ** 2; S(P.variants.broken, 1.14 - 0.14 * smooth(u), 0.6 + 0.4 * back); }
      }
    }
    const bowMeta = this.A.propMeta[P.data.type]?.string;
    if (P.variants && this.A.propMeta[P.data.type]?.steps && !P.data.opts.variant && !bowMeta) {
      // a prop reaped / filled in steps (a wheat patch: w0 … w3): its `bend` 0 → 1 walks through the variants, each
      // step showing when the bend reaches it (a stroke of the sickle ends → that part of the patch is cut)
      const names = this.A.propMeta[P.data.type].variants, b = propBend(P.data.bend, t, P.data.opts.bend ?? 0);
      const progress = clamp01(b) * (names.length - 1);
      const k = Math.min(names.length - 1, Math.floor(progress + 1e-4));
      for (const [n, o] of Object.entries(P.variants)) o.visible = n === names[k];
      // A woven wall rises to the next rim height as the weaver adds a course.
      const variant = P.variants[names[k]];
      const rim = variant?.children.find((node) => node.userData.name === 'rim');
      if (rim) {
        const nextRim = P.variants[names[k + 1]]?.children.find((node) => node.userData.name === 'rim');
        const scaleY = nextRim ? 1 + Math.max(0, progress - k) * (nextRim.position.y / rim.position.y - 1) : 1;
        for (const o of Object.values(P.variants)) o.scale.y = o === variant ? scaleY : 1;
      }
      if (P.ties) for (const r of P.ties) if (r.k === k) for (const o of this.newTies(P, names, k)) o.visible = t >= r.t;
      P.variantNow = names[k];
    }
    const { move } = this.propHolder(P, t);
    const meta = this.A.propMeta[P.data.type];
    if (P.rimMounted && move?.from.actor && move.to.pos && !move.drop) {
      // The basket leaves the lap as a single object, with both hands following its rim until it rests.
      P.mount.updateWorldMatrix(true, false);
      P.mount.matrixWorld.decompose(obj.position, obj.quaternion, obj.scale);
      const [x, y, z] = move.to.pos;
      const k = smooth((t - move.t0) / ((move.t1 - move.t0) * BASKET_RELEASE));
      obj.position.lerp(V(x, y + this.groundY(B, x, z), z), k);
      obj.position.y += .17 * Math.sin(Math.PI * k);
      const rest = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), move.to.h || 0);
      obj.quaternion.slerp(rest, k);
      return;
    }
    if (meta?.flyer) obj.userData.flight = 0;
    const DROP0 = 0.32;
    const dk = move && move.drop ? (t - move.t0) / Math.max(1e-6, move.t1 - move.t0) : -1;
    if (dk >= DROP0) {
      // dropped: it slips from the hand, falls in an arc and tumbles, then rocks to rest (pure function of t)
      const k = clamp01((dk - DROP0) / 0.38);
      const c = B.actors[move.from.actor].char;
      // where it was in the hand at the moment of release is not available without state: start from the hand now
      const sock = c.sockets[`hand.${move.from.hand || 'R'}`]; sock.updateWorldMatrix(true, false);
      const p0 = sock.getWorldPosition(V()); p0.y -= 1.0;
      const to = move.to.pos, gy = this.groundY(B, to[0], to[2]) + (to[1] || 0);
      const p1 = V(to[0], gy, to[2]);
      const pos = p0.clone().lerp(p1, k); pos.y = p0.y + (gy - p0.y) * k * k;
      // it lands and lies still exactly as it will stay (no bounce, no twitch when the move ends)
      obj.position.copy(pos);
      obj.rotation.set(0.9 * Math.sin(k * Math.PI), lerpAngle(c.root.rotation.y, move.to.h || 0, k * k * (3 - 2 * k)), 0.5 * Math.sin(k * Math.PI));
      obj.scale.setScalar(P.fixedScale || (this.A.props[P.data.type] ? P.data.opts.scale || 1 : P.base));
      return;
    }
    if (move && move.fly && !move.from.actor && !move.to.actor && move.from.pos) {
      // `"fly": true` on a put from one place to another: it glides through the air (a cloud): eases in and out, turns
      // gently to its new heading, bobs a little on the way (never at the ends, so it rests exactly where it lands)
      const u = clamp01((t - move.t0) / Math.max(1e-6, move.t1 - move.t0)), k = u * u * (3 - 2 * u);
      const a = move.from.pos, b = move.to.pos, x = a[0] + (b[0] - a[0]) * k, z = a[2] + (b[2] - a[2]) * k;
      const y = (a[1] || 0) + ((b[1] || 0) - (a[1] || 0)) * k + 0.25 * Math.sin(Math.PI * u) * Math.sin(t * 1.7);
      obj.position.set(x, y + this.groundY(B, x, z) + this.groundLift(P), z);
      const yaw = lerpAngle(move.from.h || 0, move.to.h || 0, k);
      if (meta?.flyer) {
        const flight = smooth(u / .12) * smooth((1-u) / .17);
        obj.userData.flight = flight;
        obj.rotation.set(-.28 * flight, yaw, .12 * Math.sin(Math.PI * u), 'YXZ');
      } else obj.rotation.set(0, yaw, 0);
      obj.scale.setScalar(P.fixedScale || (P.data.opts.scale && this.A.props[P.data.type] ? P.data.opts.scale : obj.scale.x));
      return;
    }
    if (move && move.float && !move.from.actor && !move.to.actor && move.from.pos) {
      // `"float": true` on a put from the ground: carried away by the water — it drifts along (ease in), turning slowly
      const u = clamp01((t - move.t0) / Math.max(1e-6, move.t1 - move.t0)), k = move.linear ? u : u * u * (1.6 - 0.6 * u); // linear: one leg of a longer drift (no stop between legs)
      const a = move.from.pos, b = move.to.pos, x = a[0] + (b[0] - a[0]) * k, z = a[2] + (b[2] - a[2]) * k;
      const y = (a[1] || 0) + ((b[1] || 0) - (a[1] || 0)) * k;
      obj.position.set(x, y + this.groundY(B, x, z) + this.groundLift(P) + 0.04 * Math.sin(t * 5.3), z);
      obj.rotation.set(0.12 * Math.sin(t * 3.1), (move.from.h || 0) + 2.2 * k, 0.1 * Math.sin(t * 2.3));
      obj.scale.setScalar(P.fixedScale || (P.data.opts.scale && this.A.props[P.data.type] ? P.data.opts.scale : obj.scale.x));
      return;
    }
    if (move && move.walk && !move.from.actor && !move.to.actor && move.from.pos) {
      // `"walk": true` on a put from the ground: an animal walks there on its own legs — along its route (via), easing in
      // and out, turned along the way (and into `face` at the end when given); its legs step with the distance walked
      const W = this.walkPath(move), D = Math.max(1e-6, move.t1 - move.t0), tt = clamp01((t - move.t0) / D) * D;
      const R = Math.min(0.7, D / 3), v = W.L / Math.max(1e-6, D - R);
      const sAt = (x) => (x < R ? v * x * x / (2 * R) : x > D - R ? W.L - v * (D - x) ** 2 / (2 * R) : v * (x - R / 2));
      let s = Math.max(0, Math.min(W.L, sAt(tt)));
      let hop = null;
      const hopLength = this.A.propMeta[P.data.type]?.hopLength;
      if (hopLength && W.L > 0) {
        // Complete bounds only: plant and load, push off, arc through the air, then absorb the landing.
        const count = Math.max(1, Math.round(W.L / hopLength));
        const cycle = Math.min(tt / D * count, count);
        const index = Math.min(count - 1, Math.floor(cycle));
        const phase = cycle - index;
        const flight = clamp01((phase - 0.22) / 0.54);
        const load = Math.sin(Math.PI * clamp01(phase / 0.22));
        const land = Math.sin(Math.PI * clamp01((phase - 0.76) / 0.24));
        const lift = 4 * flight * (1 - flight);
        s = (index + flight) * W.L / count;
        hop = { flight, lift, load, land, height: Math.min(.42, W.L / count * .42) * lift };
      }
      const p = W.at(s), pa = W.at(Math.max(0, s - 0.5)), pb = W.at(Math.min(W.L, s + 0.5));
      let hd = Math.atan2(pb[0] - pa[0], pb[2] - pa[2]);
      hd = lerpAngle(move.from.h || 0, hd, smooth(tt / 0.9));
      if (move.faceEnd) hd = lerpAngle(hd, move.to.h || 0, smooth((tt - (D - 0.9)) / 0.9));
      const on = Math.min(1, tt / R, (D - tt) / R, 1);
      const bob = hop ? hop.height : (meta?.stepBob ?? .035) * on * Math.abs(Math.sin(Math.PI * s / 0.8));
      obj.position.set(p[0], this.groundY(B, p[0], p[2]) + this.groundLift(P) + bob, p[2]);
      if (hop) obj.rotation.set(.28 * hop.lift * (2 * hop.flight - 1), hd, 0, 'YXZ');
      else obj.rotation.set(0, hd, 0);
      const scale = P.fixedScale || (P.data.opts.scale && this.A.props[P.data.type] ? P.data.opts.scale : obj.scale.x);
      obj.scale.setScalar(scale);
      if (hop) obj.scale.y *= 1 - .10 * (hop.load + hop.land);
      obj.userData.walkState = { d: s, on: Math.max(0, on), hop, bray: this.propGesture(P, t, 'bray'), look: this.propGesture(P, t, 'look') };
      return;
    }
    if (this.A.propMeta[P.data.type]?.walker) obj.userData.walkState = { d: 0, on: 0, bray: this.propGesture(P, t, 'bray'), look: this.propGesture(P, t, 'look') };
    if (h.actor && B.actors[h.actor]) {
      const c = B.actors[h.actor].char;
      if (P.data.opts.wear && P.mount) {
        const first = P.data.moves[0];
        if (!first || t < first.t0) {
          P.mount.updateWorldMatrix(true, false);
          P.mount.matrixWorld.decompose(obj.position, obj.quaternion, obj.scale);
          return;
        }
      }
      if (P.kind === 'belt') {
        const side = h.hand === 'R' ? -1 : 1;
        obj.position.copy(V(side * 0.98, 1.10, 0.27).multiplyScalar(c.root.scale.x)
          .applyQuaternion(c.root.quaternion).add(c.root.position));
        obj.quaternion.copy(c.root.quaternion);
        obj.scale.setScalar(P.fixedScale || P.data.opts.scale || 1);
        return;
      }
      const sock = c.sockets[`hand.${h.hand || 'R'}`];
      sock.updateWorldMatrix(true, false);
      // prop.matrix = socket * inverse(grip in prop space)
      obj.updateMatrixWorld(true);
      const gripLocal = new THREE.Matrix4();
      if (P.grip) { obj.matrixWorld.identity(); P.grip.updateWorldMatrix(true, false); gripLocal.copy(obj.matrixWorld.clone().invert().multiply(P.grip.matrixWorld)); }
      // procedural props (no authored grip): hang upright from the hand
      let M;
      if (P.grip && this.A.props[P.data.type] && P.kind === 'two' && P.data.opts.upright) {
        // "upright": a basket carried in both hands stays level: between the two hands, turned only with the holder
        const sL = c.sockets['hand.L'], sR = c.sockets['hand.R'];
        const mid = sR.getWorldPosition(V()).add(sL.getWorldPosition(V())).multiplyScalar(0.5);
        const sc = P.fixedScale || P.data.opts.scale || 1, q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), c.root.rotation.y);
        if (P.data.opts.ahead) mid.add(V(0, 0, P.data.opts.ahead).applyQuaternion(q));   // held a little ahead, off the robe
        M = new THREE.Matrix4().compose(mid.sub(P.grip.position.clone().multiplyScalar(sc).applyQuaternion(q)), q, V(sc, sc, sc));
      } else if (P.grip && this.A.props[P.data.type] && P.kind !== 'side') {
        M = sock.matrixWorld.clone();
        if (P.fixedScale) {
          const sc = P.fixedScale / sock.getWorldScale(V()).x;
          M.scale(V(sc, sc, sc));
        }
        M.multiply(this.gripInv(P));
      } else if (P.grip) {
        // a prop carried by its handle hangs upright from the hand (only the holder's heading turns it)
        const p = sock.getWorldPosition(V());
        let yaw = c.root.rotation.y + this.carryTurn(P, h.hand), leanK = 1;
        const { move: gm } = this.propHolder(P, t);
        if (gm && gm.from.actor && gm.to.actor && B.actors[gm.from.actor] && B.actors[gm.to.actor]) {
          // handed over: it hangs upright between the two hands and turns gently from one holder to the other
          const gk = (t - gm.t0) / (gm.t1 - gm.t0);
          yaw = this.transferYaw(B, P, gm, gk);
          leanK = clamp01(Math.abs(gk - 0.5) / 0.22) ** 2;
        }
        // it swings a little outward, away from the leg (the arm holds it off the robe)
        const sc = P.fixedScale || (this.A.props[P.data.type] ? P.data.opts.scale || 1 : P.base);
        const q = this.sidePropRotation(P, h.hand || 'R', yaw, leanK);
        const g = P.grip.position.clone().multiplyScalar(sc);
        g.x += this.handOffset(P, h.hand);
        g.applyQuaternion(q);
        M = new THREE.Matrix4().compose(p.sub(g), q, V(sc, sc, sc));
      }
      M.decompose(obj.position, obj.quaternion, obj.scale);
      // `tilt` (degrees): the held prop leans forward about the hand, its top towards where the holder faces (pouring)
      const tl = this.heldPropTilt(P, t);
      if (tl) {
        const hp = sock.getWorldPosition(V()), yw = c.root.rotation.y;
        const q = this.tiltRotation(yw, tl);
        obj.position.sub(hp).applyQuaternion(q).add(hp); obj.quaternion.premultiply(q);
      }
      this.pourStream(B, P, obj, t, tl);
      void gripLocal;
      if (bowMeta && P.variants) this.bowString(P, c, h.hand || 'R', bowMeta);
      // put down / picked up: it sits exactly on its spot at the moment the hand lets go / takes it (no jump, no floating)
      const H = this.handoff(B, P, t);
      if (H && H.settle > 0) { obj.position.lerp(H.rest, H.settle); obj.quaternion.slerp(H.q, H.settle); }
      return;
    }
    const pos = h.pos || [0, 0, 0];
    obj.position.set(pos[0], (pos[1] || 0) + this.groundY(B, pos[0], pos[2]) + this.groundLift(P), pos[2]);
    obj.rotation.set(0, h.h || 0, 0);
    obj.scale.setScalar(P.fixedScale || (P.data.opts.scale && this.A.props[P.data.type] ? P.data.opts.scale : obj.scale.x));
  }

  /** a full held prop with a `full` variant tilted past 60° pours: a thin stream of water falls from its mouth to the
   *  ground (into a pot below), until a moment after its `bend` turns it empty — then the last of it falls away. Pure in t. */
  pourStream(B, P, obj, t, tl) {
    const names = this.A.propMeta[P.data.type]?.variants;
    if (!names || !names.includes('full')) return;
    const rest = P.data.opts.bend ?? 0, segs = P.data.bend || [];
    let tEmpty = null; // the moment it turned empty (the last full → empty step before t)
    for (const sg of segs) if (sg.t0 <= t && sg.to < 0.5 && propBend(segs, sg.t0 - 1e-3, rest) >= 0.5) tEmpty = sg.t0;
    const fullNow = propBend(segs, t, rest) >= 0.5, after = tEmpty != null ? t - tEmpty : Infinity;
    const on = tl > 60 && (fullNow || after < 0.45);
    if (!on) { if (P.stream) P.stream.visible = false; return; }
    if (!P.stream) {
      const g = new THREE.CylinderGeometry(1, 0.8, 1, 12, 1, true); g.translate(0, -0.5, 0);
      const m = new THREE.MeshStandardMaterial({ color: 0x7cc4f0, emissive: 0x1d4f7a, emissiveIntensity: 0.35, roughness: 0.15, transparent: true, opacity: 0.8, depthWrite: false });
      P.stream = new THREE.Mesh(g, m); P.stream.name = 'pour:' + (P.data.id || ''); P.stream.renderOrder = 2;
      B.scene.add(P.stream);
      // the mouth: the top centre of the prop in its own frame
      const M0 = obj.matrix.clone(), m0 = obj.matrixAutoUpdate; obj.matrix.identity(); obj.matrixAutoUpdate = false;
      obj.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(obj, true);
      obj.matrix.copy(M0); obj.matrixAutoUpdate = m0;
      P.mouth = V((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2);
    }
    obj.updateMatrixWorld(true);
    const m = P.mouth.clone(); obj.localToWorld(m);
    const gy = this.groundY(B, m.x, m.z), grow = clamp01((tl - 60) / 25);
    const top = after < Infinity ? m.y - 4.9 * after * after : m.y;
    const len = Math.max(0.01, Math.min(top - gy, (m.y - gy) * grow));
    const r = 0.055 * (P.data.opts.scale || 1) / 0.42 * (1 + 0.12 * Math.sin(t * 37));
    P.stream.visible = top - gy > 0.02;
    P.stream.position.set(m.x, top, m.z); P.stream.scale.set(r, len, r); P.stream.updateMatrixWorld(true);
  }

  /** the route of a walking prop (`put … "walk": true`): polyline from → via → to, its length and a point at a distance */
  walkPath(move) {
    if (move._W) return move._W;
    const pts = [move.from.pos, ...(move.via || []), move.to.pos].map((q) => [q[0], 0, q[2]]);
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][2] - pts[i - 1][2]));
    const L = cum[cum.length - 1];
    const at = (d) => {
      let i = 1; while (i < pts.length - 1 && cum[i] < d) i++;
      const a = pts[i - 1], b = pts[i], k = cum[i] > cum[i - 1] ? (d - cum[i - 1]) / (cum[i] - cum[i - 1]) : 1;
      return [a[0] + (b[0] - a[0]) * k, 0, a[2] + (b[2] - a[2]) * k];
    };
    return (move._W = { L, at });
  }

  /** 0..1 progress of a prop's own gesture (`{ "prop": "magar", "gesture": "bray" }`) at t, or -1 */
  propGesture(P, t, name) {
    for (const g of P.data.gestures || []) if (g.name === name && t >= g.t0 && t <= g.t1) return (t - g.t0) / Math.max(1e-6, g.t1 - g.t0);
    return -1;
  }

  /** a bow (prop meta `string`): the string is not a baked pose but follows the OTHER hand — while that hand is on the
   *  string (near the nock line behind the handle) the nock is exactly at the fist, the limbs bend with how far it is drawn
   *  (the nearest of the variants s0 … sN), and the string runs straight from each tip to the fist; when the hand is away
   *  it rests straight between the tips. So the string never lags or leads the hand. */
  bowString(P, c, holdHand, S) {
    const obj = P.obj, names = this.A.propMeta[P.data.type].variants;
    obj.updateMatrixWorld(true);
    const other = holdHand === 'L' ? 'R' : 'L';
    const sock = c.sockets[`hand.${other}`]; sock.updateWorldMatrix(true, false);
    const hp = obj.worldToLocal(sock.getWorldPosition(V()));
    const rest = V(-S.brace, S.grip, 0);
    // where the nock would be if the hand holds it, and how far the hand is from there
    const n = V(Math.min(-S.brace, Math.max(-(S.brace + S.pull), hp.x)), S.grip + Math.max(-0.25, Math.min(0.25, hp.y - S.grip)), Math.max(-0.25, Math.min(0.25, hp.z)));
    const err = hp.distanceTo(n) + Math.max(0, hp.x + S.brace - 0.05) * 2 + Math.max(0, -(S.brace + S.pull) - 0.15 - hp.x) * 2;
    const w = 1 - smooth(clamp01((err - 0.18) / 0.3));
    const nock = rest.clone().lerp(hp.x > -S.brace ? V(-S.brace, n.y, n.z) : n, w);
    const u = clamp01((-nock.x - S.brace) / S.pull);
    const k = Math.round(u * (names.length - 1));
    if (!P._bow) {
      // per variant: its tips (bounding-box centres of the `tip` meshes, in prop space) and its baked string (hidden)
      const inv = obj.matrixWorld.clone().invert();
      P._bow = { tips: {}, mat: null };
      for (const nm of names) {
        const tips = [];
        P.variants[nm].traverse((o) => {
          const on = o.userData?.name || o.name || '';
          if (!o.isMesh) return;
          if (/string/.test(on)) { P._bow.mat = P._bow.mat || o.material; o.visible = false; }
          else if (/tip/.test(on)) tips.push(new THREE.Box3().setFromObject(o).getCenter(V()).applyMatrix4(inv));
        });
        tips.sort((a, b) => b.y - a.y);
        P._bow.tips[nm] = tips;
      }
      const geo = new THREE.CylinderGeometry(0.018, 0.018, 1, 5, 1, true);
      P._bow.seg = [0, 1].map(() => { const m = new THREE.Mesh(geo, P._bow.mat || new THREE.MeshStandardMaterial({ color: 0xf7f2e0 })); m.castShadow = true; obj.add(m); return m; });
    }
    for (const [nm, o] of Object.entries(P.variants)) o.visible = nm === names[k];
    const tips = P._bow.tips[names[k]];
    if (tips.length < 2) return;
    tips.forEach((tp, i) => {
      const m = P._bow.seg[i], d = nock.clone().sub(tp), len = d.length();
      m.position.copy(tp).addScaledVector(d, 0.5);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
      m.scale.set(1, len, 1);
    });
  }

  /** when a prop with a `broken` variant breaks (its bend passes 0.5; dropped: the moment it hits the ground) */
  breakTime(P) {
    if (P._tb !== undefined) return P._tb;
    const rest = P.data.opts.bend ?? 0, b = (x) => propBend(P.data.bend, x, rest) >= 0.5;
    let tb = null;
    for (const m of P.data.moves) if (m.drop && !b(m.t0) && b(m.t1 + 0.6)) tb = m.t0 + 0.70 * (m.t1 - m.t0);
    if (tb == null) for (const sg of P.data.bend || []) if (!b(sg.t0 - 1e-3) && b(sg.t1 + 1e-3)) { tb = sg.t0; for (let x = sg.t0; x <= sg.t1; x += 0.01) if (b(x)) { tb = x; break; } break; }
    return (P._tb = tb);
  }

  gripInv(P) {
    if (P._gi) return P._gi;
    const saved = [P.obj.position.clone(), P.obj.quaternion.clone(), P.obj.scale.clone()];
    P.obj.position.set(0, 0, 0); P.obj.quaternion.identity();
    if (P.fixedScale) P.obj.scale.setScalar(1);
    P.obj.updateMatrixWorld(true);
    P._gi = P.grip.matrixWorld.clone().invert();
    P.obj.position.copy(saved[0]); P.obj.quaternion.copy(saved[1]); P.obj.scale.copy(saved[2]);
    return P._gi;
  }

  // ---------------------------------------------------------------- camera (borrowed from the lego Stage)
  refs(B, t) {
    return {
      root: (id) => { const A = B.actors[id]; return A ? A.char.root.position.clone() : null; },
      head: (id) => { const A = B.actors[id]; return A ? A.fig.faceAnchor.getWorldPosition(V()) : null; },
      heading: (id, time) => { const A = B.actors[id]; return A ? sampleSegs(A.data.head, time, A.data.initial.h, lerpAngle) : 0; },
      prop: (id) => (B.props[id] ? B.props[id].obj.getWorldPosition(V()) : null),
      t,
    };
  }

  renderAt(t) {
    t = Math.max(0, Math.min(this.tl.duration - 1e-3, t));
    const r = this.evaluate(t, { rest: true });
    this.placeCamera(r.sc, r.B, t);
    const { sc, B } = this.evaluate(t);
    if (B.look) B.look.render(t); else this.renderer.render(B.scene, this.camera);
    const g = this.ctx;
    g.drawImage(this.gl, 0, 0);
    let fade = 0;
    const tr = sc.transition, next = this.tl.scenes[sc.index + 1];
    if (sc.index > 0 && tr !== 'cut') fade = Math.max(fade, 1 - clamp01((t - sc.start) / (sc.def.fadeSeconds || FADE)));
    if (next && next.transition !== 'cut') fade = Math.max(fade, 1 - clamp01((sc.end - t) / (next.def.fadeSeconds || FADE)));
    if (sc.index === 0) fade = Math.max(fade, 1 - clamp01(t / 0.5));
    if (!next) fade = Math.max(fade, 1 - clamp01((sc.end - t) / 0.8));
    const flash = sc.def.lightning;
    if (flash) {
      const u = (t - sc.start - flash.at) / flash.duration;
      if (u > 0 && u < 1) {
        const light = g.createLinearGradient(0, 0, 0, this.H);
        light.addColorStop(0, 'rgba(221,234,255,' + .28 * Math.sin(Math.PI * u) ** 2 + ')');
        light.addColorStop(1, 'rgba(221,234,255,0)');
        g.fillStyle = light; g.fillRect(0, 0, this.W, this.H);
      }
    }
    this.overlay.draw(g, t, sc, beatAt(sc, t), fade, tr === 'white' || next?.transition === 'white');
    return this.out;
  }

  locate(t, id) {
    const { B } = this.evaluate(t), A = B.actors[id];
    if (!A || !A.char.root.visible) return null;
    const P = (v) => { const p = v.clone().project(this.camera); return p.z > 1 ? null : [(p.x + 1) / 2 * this.W, (1 - p.y) / 2 * this.H]; };
    const h = A.fig.faceAnchor.getWorldPosition(V()), top = P(h.clone().setY(h.y + 0.9)), hp = P(h), f = P(A.char.root.position);
    if (!hp || !top || !f) return null;
    return { x: hp[0], y: hp[1], r: Math.max(8, Math.abs(hp[1] - top[1])), feet: f[1] };
  }
}
/** 0..1: an actor is visible, easing to 0 over the 0.4 s before it is hidden and from 0 after it is shown (heads that
 *  look at someone who vanishes / appears turn away / toward them gradually) */
function visW(a, t) {
  const on = lastBefore(a.visible, t, 'v', a.initial.visible) !== false;
  let w = on ? 1 : 0;
  for (const e of a.visible || []) {
    const te = e.t ?? e.t0; if (te == null) continue;
    if (on && e.v === false && te > t && te - t < 0.4) w = Math.min(w, smooth((te - t) / 0.4));
    if (on && e.v !== false && te <= t && t - te < 0.4) w = Math.min(w, smooth((t - te) / 0.4));
  }
  return w;
}
// cameras: exactly the lego Stage's shots (wide / medium / close / two / prop / top, moves, ease, auto angle)
for (const m of ['prepareCameras', 'autoAngle', 'shotPose', 'placeCamera', 'subjects']) Stage3.prototype[m] = Stage.prototype[m];
void smooth; void postureAt; void MASKS;
