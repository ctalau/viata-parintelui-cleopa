// Stage: turns a compiled timeline into pixels. Everything is a pure function of time t,
// so any frame can be rendered independently (parallel workers, scrubbing, stills).
import * as THREE from 'three';
import { createMinifig } from '../components/minifig.js';
import { createProp, bendRest } from '../components/props.js';
import { createSet, applySky } from '../components/sets.js';
import { sampleSegs, propBend, mixVec, lerpAngle, lastBefore, sceneAt, beatAt, smooth, clamp01, lerp, FADE, resolveAnchor } from './timeline.js';
import { Overlay } from './overlay.js';
import { BEVEL } from '../components/bricks.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// "render": "vivid" — the rich toy-photo look (like a poster illustration): glossy plastic with reflections of a soft studio
// environment, ambient occlusion in every gap between bricks, a glow around bright lights, a shallow depth of field on
// close shots, saturated warm colour grading and a soft vignette. Opt-in per film, old films keep the plain look.
// GPU-safe bump mapping. three's perturbNormalArb normalizes screen-space derivatives that are 0 on some pixels (edge-on
// cloth, helper pixels of a quad): normalize(0) = NaN on NVIDIA (SwiftShader gives 0, so the preview looked fine). One NaN
// pixel in the HalfFloat target is then smeared by bokeh + bloom into big BLACK BLOCKS — the "black square" of the 039
// YouTube render (bump-mapped robes, burlap). Patched once for every material; tests/gpu-safety.test.mjs keeps it.
export const SAFE_BUMP = (src) => src
  .replace('vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );', 'vec3 dPx = dFdx( surf_pos.xyz ); vec3 dPy = dFdy( surf_pos.xyz );\n\t\tif ( dot( dPx, dPx ) < 1e-20 || dot( dPy, dPy ) < 1e-20 ) return surf_norm;\n\t\tvec3 vSigmaX = normalize( dPx );')
  .replace('vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );', 'vec3 vSigmaY = normalize( dPy );')
  .replace('return normalize( abs( fDet ) * surf_norm - vGrad );', 'vec3 nB = abs( fDet ) * surf_norm - vGrad;\n\t\treturn dot( nB, nB ) > 1e-20 ? normalize( nB ) : surf_norm;');
THREE.ShaderChunk.bumpmap_pars_fragment = SAFE_BUMP(THREE.ShaderChunk.bumpmap_pars_fragment);

// Last guard: any NaN / Inf pixel left by the scene render becomes black BEFORE the blur passes can spread it into blocks.
export const SCRUB_NAN = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; varying vec2 vUv;
    bool bad(float x) { return isnan(x) || isinf(x) || !(x < 1e4 && x > -1e4); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      gl_FragColor = (bad(c.r) || bad(c.g) || bad(c.b) || bad(c.a)) ? vec4(0.0, 0.0, 0.0, 1.0) : c;
    }`,
};

const GRADE = {
  uniforms: { tDiffuse: { value: null }, sat: { value: 1.15 }, contrast: { value: 1.07 }, vign: { value: 0.32 }, warm: { value: new THREE.Vector3(1.04, 1.0, 0.94) } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float sat, contrast, vign; uniform vec3 warm; varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv); vec3 col = c.rgb;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, sat);
      col = (col - 0.5) * contrast + 0.5;
      col *= warm;
      float d = distance(vUv, vec2(0.5));
      col *= 1.0 - vign * smoothstep(0.42, 0.9, d);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};
export const isVivid = (desc) => desc?.render === 'vivid' || desc?.render?.preset === 'vivid';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const RIDE_BACK = 1.35; // a rider sits this far behind the carrier's root (clears the carrier's back)

export class Stage {
  constructor(canvas, timeline, desc, { scale = 1, antialias = true, shadowSize = 2048, softShadows = true, post = true } = {}) {
    this.shadowSize = shadowSize;
    this.tl = timeline; this.desc = desc;
    this.W = Math.round(timeline.width * scale); this.H = Math.round(timeline.height * scale);
    this.out = canvas; canvas.width = this.W; canvas.height = this.H;
    this.gl = document.createElement('canvas');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.gl, antialias, preserveDrawingBuffer: true });
    this.renderer.setSize(this.W, this.H, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(40, this.W / this.H, 0.1, 400);
    this.vivid = isVivid(desc);
    if (this.vivid) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      this.renderer.toneMappingExposure = desc.render?.exposure ?? 0.92;
      if (post) try { this.setupPost(desc.render || {}); } catch (e) { console.warn('vivid post-processing off:', e); this.composer = null; }
    }
    this.overlay = new Overlay(this.W, this.H, desc, timeline);
    this.ctx = canvas.getContext('2d');
    this.built = new Map();
    this.prepareCameras();
  }

  setupPost(opts) {
    const { W, H } = this;
    const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4 });
    const C = this.composer = new EffectComposer(this.renderer, rt);
    C.setSize(W, H);
    const dummy = new THREE.Scene();
    this.passes = {};
    C.addPass(this.passes.render = new RenderPass(dummy, this.camera));
    C.addPass(new ShaderPass(SCRUB_NAN));
    if (opts.ao !== false) {
      const ao = this.passes.ao = new GTAOPass(dummy, this.camera, W, H);
      ao.output = GTAOPass.OUTPUT.Default; ao.blendIntensity = opts.ao ?? 0.9;
      ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.1, samples: 16 });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
      C.addPass(ao);
    }
    C.addPass(new ShaderPass(SCRUB_NAN)); // GTAO divides by depth / normal terms too
    if (opts.dof !== false) C.addPass(this.passes.dof = new BokehPass(dummy, this.camera, { focus: 10, aperture: 0.0001, maxblur: 0.007 }));
    C.addPass(this.passes.bloom = new UnrealBloomPass(new THREE.Vector2(W / 2, H / 2), opts.bloom ?? 0.28, 0.5, 1.15));
    C.addPass(new OutputPass());
    C.addPass(this.passes.grade = new ShaderPass(GRADE));
  }

  // camera spec of each beat + when that spec started (for moves and fixed headings)
  prepareCameras() {
    for (const sc of this.tl.scenes) {
      let cur = { spec: sc.initialCamera, start: sc.start, prev: null };
      const list = [cur];
      for (const b of sc.beats) {
        if (b.camera) { cur = { spec: b.camera, start: b.start, prev: cur }; list.push(cur); }
        b.cam = cur;
      }
      for (let i = 0; i < list.length; i++) list[i].end = i + 1 < list.length ? list[i + 1].start : sc.end;
    }
  }

  build(sc) {
    if (this.built.has(sc.index)) return this.built.get(sc.index);
    // free the previous scene (keeps memory flat for long videos)
    for (const [k, v] of this.built) if (Math.abs(k - sc.index) > 1) { v.scene.traverse((o) => o.geometry?.dispose?.()); this.built.delete(k); }
    const scene = new THREE.Scene();
    let setDef = typeof sc.def.set === 'string' ? { type: sc.def.set } : (sc.def.set || { type: 'desert-lavra' });
    // a film in the blocky town style ("style": "blocky") gets blocky figures and smooth, stud-less sets
    const blocky = this.desc.style === 'blocky';
    if (blocky && setDef.smooth === undefined) setDef = { ...setDef, smooth: true };
    BEVEL.on = this.vivid; // bevelled bricks in every Builder of this scene (set, props)
    try { return this.buildScene(sc, scene, setDef, blocky); } finally { BEVEL.on = false; }
  }

  buildScene(sc, scene, setDef, blocky) {
    const set = createSet(setDef);
    scene.add(set.group);
    const sky = applySky(scene, sc.def.sky || setDef.sky || 'day', { vivid: this.vivid });
    if (this.vivid) { scene.environment = this.envMap; scene.environmentIntensity = this.desc.render?.env ?? 0.3; }
    sky.sun.shadow.mapSize.set(this.shadowSize, this.shadowSize);
    const actors = {};
    for (const [id, a] of Object.entries(sc.actors)) {
      const ch = this.desc.characters[id] || {};
      // a cast entry may change the look for this scene only (e.g. a cloak given away: "look": { "cloak": false })
      const fig = createMinifig({ ...(blocky ? { style: 'blocky' } : {}), ...(this.vivid ? { toon: true } : {}), ...(ch.look || {}), ...(a.outfit || {}) });
      scene.add(fig.root);
      actors[id] = { data: a, fig, seed: [...id].reduce((s, c) => s + c.charCodeAt(0), 0) * 0.37 };
    }
    const props = {};
    for (const [id, p] of Object.entries(sc.props)) {
      const obj = createProp(p.type, p.opts || {});
      scene.add(obj);
      props[id] = { data: p, obj };
    }
    const b = { scene, set, actors, props };
    this.built.set(sc.index, b);
    return b;
  }

  // ----- per-frame evaluation -----
  actorState(A, t) {
    const a = A.data;
    const pos = sampleSegs(a.pos, t, a.initial.pos, mixVec);
    const h = sampleSegs(a.head, t, a.initial.h, lerpAngle);
    let walk = null;
    for (const w of a.walking) {
      if (t >= w.t0 && t < w.t1 + 0.15) {
        const seg = a.pos.find((s) => s.t0 === w.t0);
        const len = seg ? Math.hypot(seg.to[0] - seg.from[0], seg.to[1] - seg.from[1]) : 0;
        const k = clamp01((t - w.t0) / (w.t1 - w.t0));
        const amount = smooth((t - w.t0) / 0.2) * smooth((w.t1 + 0.15 - t) / 0.3);
        walk = { phase: smooth(k) * len * 2.3, amount, style: w.style };
      }
    }
    const gestures = a.gestures.filter((g) => t >= g.t0 && t < g.t1).map((g) => ({ name: g.name, hand: g.hand, k: (t - g.t0) / (g.t1 - g.t0) }));
    const emotion = lastBefore(a.emotion, t, 'to', a.initial.emotion);
    let mouth = 0, talk = 0;
    for (const sp of a.talk) {
      if (t >= sp.start && t < sp.end) {
        talk = 1;
        if (sp.env) mouth = sp.env[Math.min(sp.env.length - 1, Math.floor((t - sp.start) * sp.envFps))] || 0;
        else mouth = 0.55 + 0.45 * Math.sin(t * 19) * Math.sin(t * 7.3);
      }
    }
    let posture = { from: a.initial.posture, to: a.initial.posture, k: 1 };
    for (const p of a.posture) if (t >= p.t0) posture = { from: p.from, to: p.to, k: clamp01((t - p.t0) / (p.t1 - p.t0)) };
    const visible = lastBefore(a.visible, t, 'v', a.initial.visible);
    const per = 3.1 + (A.seed % 1.3);
    const ph = (t + A.seed) % per;
    const blink = ph < 0.14 ? Math.sin((ph / 0.14) * Math.PI) : 0;
    return { pos, h, walk, gestures, emotion, mouth, talk, posture, visible, blink };
  }

  propHolder(p, t) {
    let holder = p.data.initial, move = null;
    for (const m of p.data.moves) {
      if (t >= m.t1) holder = m.to;
      else if (t >= m.t0) { move = m; break; }
    }
    return { holder, move };
  }

  holderWorld(B, holder, obj) {
    if (holder.actor && B.actors[holder.actor]) {
      const fig = B.actors[holder.actor].fig;
      const p = fig.holds[holder.hand || 'R'].getWorldPosition(V());
      const yaw = fig.root.rotation.y;
      // per-prop grip offset in the holder's frame (e.g. grapes are held by the middle, in front of the body)
      const o = obj?.userData?.hold;
      if (o) p.add(V(o[0], o[1], o[2]).applyAxisAngle(V(0, 1, 0), yaw));
      return { pos: p, yaw };
    }
    const g = (obj?.userData?.ground || 0) * (obj ? obj.scale.y : 1); // a scaled-up prop needs a scaled ground offset
    return { pos: V(holder.pos[0], (holder.pos[1] || 0) + g, holder.pos[2]), yaw: holder.h || 0 };
  }

  /** Pose everything at time t. rest = no gestures/breathing/bobbing (the stable pose cameras aim at). */
  evaluate(t, { rest = false } = {}) {
    const sc = sceneAt(this.tl, t);
    const B = this.build(sc);
    const holding = {};
    for (const p of Object.values(B.props)) {
      const { holder, move } = this.propHolder(p, t);
      // a small prop (a knife) may ask for a lower carry pose (userData.carry: 'low') so a gesture can still move that arm
      const hv = p.obj.userData.carry || true;
      if (!move && holder.actor) (holding[holder.actor] ||= {})[holder.hand || 'R'] = hv;
      // a two-handed prop (userData.twoHands, e.g. a book held at the chest): the other arm comes forward too
      if (!move && holder.actor && p.obj.userData.twoHands) (holding[holder.actor] ||= {})[(holder.hand || 'R') === 'R' ? 'L' : 'R'] ||= hv;
      if (move && move.to.actor && (t - move.t0) / (move.t1 - move.t0) > 0.6) (holding[move.to.actor] ||= {})[move.to.hand || 'R'] = hv;
      // the giver keeps the arm up while letting go (otherwise the hand drops and drags the prop through the body)
      if (move && move.from.actor && (t - move.t0) / (move.t1 - move.t0) < 0.5) (holding[move.from.actor] ||= {})[move.from.hand || 'R'] = true;
    }
    const states = {};
    const riderOf = {};
    for (const [id, A] of Object.entries(B.actors)) {
      const s = this.actorState(A, t);
      s.ride = lastBefore(A.data.ride, t, 'v', A.data.initial.ride);
      if (s.ride && B.actors[s.ride]) riderOf[s.ride] = id; else s.ride = null;
      states[id] = s;
    }
    // carriers first, then the actors riding on their backs (they follow the carrier's root)
    const order = Object.keys(B.actors).sort((a, b) => (states[a].ride ? 1 : 0) - (states[b].ride ? 1 : 0));
    for (const id of order) {
      const A = B.actors[id], s = states[id];
      const r = A.fig.root;
      if (s.ride) {
        const c = B.actors[s.ride].fig.root, h = c.rotation.y;
        s.pos = [c.position.x - Math.sin(h) * RIDE_BACK, c.position.z - Math.cos(h) * RIDE_BACK];
        s.h = h; s.walk = null; s.posture = { from: 'ride', to: 'ride', k: 1 };
        s.visible = s.visible && c.visible;
      }
      r.visible = s.visible;
      r.position.set(s.pos[0], 0, s.pos[1]);
      r.rotation.y = s.h;
      A.fig.update({ time: t, walk: s.walk, gestures: s.gestures, emotion: s.emotion, mouth: s.mouth, talk: s.talk,
        posture: s.posture, blink: s.blink, holding: holding[id], seat: A.data.initial.seat, tilt: A.data.initial.tilt, lift: A.data.initial.lift, hands: A.data.initial.hands, rest, piggyback: !!riderOf[id] });
    }
    B.scene.updateMatrixWorld(true);
    for (const p of Object.values(B.props)) {
      const { holder, move } = this.propHolder(p, t);
      p.obj.visible = lastBefore(p.data.visible, t, 'v', p.data.opts.visible !== false);
      let w;
      if (move) {
        const a = this.holderWorld(B, move.from, p.obj), b = this.holderWorld(B, move.to, p.obj);
        const k = smooth((t - move.t0) / (move.t1 - move.t0));
        // cubic Bezier bulging out to the side both actors face: when the giver stands at the receiver's side the
        // prop swings round in front of the receiver instead of cutting through the body; face to face it goes straight
        const d = a.pos.distanceTo(b.pos);
        const fA = move.from.actor ? V(Math.sin(a.yaw), 0, Math.cos(a.yaw)) : V();
        const fB = move.to.actor ? V(Math.sin(b.yaw), 0, Math.cos(b.yaw)) : V();
        const ab = b.pos.clone().sub(a.pos).setY(0);
        let n = ab.lengthSq() > 1e-6 ? V(-ab.z, 0, ab.x).normalize() : fB.clone();
        const sum = fA.clone().add(fB);
        if (n.dot(sum) < 0) n.negate();
        const off = n.multiplyScalar(Math.min(1, n.dot(sum)) * (0.5 * d + 0.6));
        const c1 = a.pos.clone().add(off), c2 = b.pos.clone().add(off);
        c1.y += 0.5; c2.y += 0.7; // comes down into the hand from above (clears a seated receiver's lap)
        const u = 1 - k;
        w = { pos: a.pos.clone().multiplyScalar(u * u * u).addScaledVector(c1, 3 * u * u * k).addScaledVector(c2, 3 * u * k * k).addScaledVector(b.pos, k * k * k),
          yaw: lerpAngle(a.yaw, b.yaw, k) };
      } else w = this.holderWorld(B, holder, p.obj);
      p.obj.position.copy(w.pos); p.obj.rotation.set(0, w.yaw, 0);
      if (p.data.opts.spin) p.obj.rotation.y += t * p.data.opts.spin;
      // e.g. steam on warm bread, a tree bowing (`bend` action), a sand trail behind a walker — all pure functions of t
      if (p.obj.userData.update) p.obj.userData.update(t, {
        bend: propBend(p.data.bend, t, bendRest(p.data.type, p.data.opts)),
        actorPos: (id) => (B.actors[id] && B.actors[id].fig.root.visible ? B.actors[id].fig.root.position : null),
      });
    }
    return { sc, B, states };
  }

  // ----- camera -----
  refs(B, t) {
    return {
      root: (id) => { const A = B.actors[id]; return A ? A.fig.root.position.clone() : null; },
      head: (id) => { const A = B.actors[id]; return A ? A.fig.faceAnchor.getWorldPosition(V()) : null; },
      heading: (id, time) => { const A = B.actors[id]; return A ? sampleSegs(A.data.head, time, A.data.initial.h, lerpAngle) : 0; },
      prop: (id) => (B.props[id] ? B.props[id].obj.getWorldPosition(V()) : null),
      t,
    };
  }

  /**
   * `"angle": "auto"` on a close / medium shot: the first angle (15, -15, 30, -30 … ±90 off the actor's facing) whose
   * line of sight to the actor passes clear of every other visible actor — at the start and at the end of the shot,
   * so the choice never changes during the shot (no shake). A pure function of the descriptor.
   */
  autoAngle(B, id, cam, base, dist) {
    const A = B.actors[id];
    if (!A) return 15;
    const at = (X, time) => sampleSegs(X.data.pos, time, X.data.initial.pos, mixVec);
    const times = [cam.start + 0.05, Math.max(cam.start + 0.05, cam.end - 0.05)];
    let best = 15, bestClear = -1;
    for (const a of [15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90]) {
      let clear = Infinity;
      for (const time of times) {
        const p = at(A, time);
        const d = base + (a * Math.PI) / 180;
        const c = [p[0] + Math.sin(d) * dist, p[1] + Math.cos(d) * dist];
        for (const [oid, O] of Object.entries(B.actors)) {
          if (oid === id || !lastBefore(O.data.visible, time, 'v', O.data.initial.visible)) continue;
          const q = at(O, time);
          // distance from the other actor to the segment camera → subject (ground plane)
          const vx = p[0] - c[0], vz = p[1] - c[1], L2 = vx * vx + vz * vz;
          const k = clamp01(((q[0] - c[0]) * vx + (q[1] - c[1]) * vz) / Math.max(1e-6, L2));
          if (k > 0.97) continue; // behind the subject: not in the way
          clear = Math.min(clear, Math.hypot(q[0] - c[0] - k * vx, q[1] - c[1] - k * vz));
        }
      }
      if (clear > 2.4) return a;
      if (clear > bestClear) { bestClear = clear; best = a; }
    }
    return best;
  }

  shotPose(cam, sc, B, t) {
    const s = cam.spec || { shot: 'wide' };
    const R = this.refs(B, t);
    const k = clamp01((t - cam.start) / Math.max(0.01, cam.end - cam.start));
    const L = sc.layout;
    const deg = (d) => (d * Math.PI) / 180;
    let target, dir, dist, height, fov = s.fov || 40;
    const placeOf = (on) => {
      if (on == null) return { p: V(0, 0, 0), h: 0 };
      if (Array.isArray(on)) return { p: V(on[0], 0, on[1]), h: 0 };
      // an "auto" close-up looks at where the actor faces once a turn at the start of the shot is done
      if (B.actors[on]) return { p: R.root(on), h: R.heading(on, s.angle === 'auto' ? Math.min(cam.end, cam.start + 1.2) : cam.start) };
      if (B.props[on]) return { p: R.prop(on), h: 0 };
      const an = L.anchors[on];
      if (an) return { p: V(an.pos[0], 0, an.pos[1]), h: an.h || 0 };
      // "anchor+dx,dz" (an offset in the anchor's frame), like `at` / `walk`
      try { const r = resolveAnchor(L, on); return { p: V(r.pos[0], 0, r.pos[1]), h: r.h || 0 }; } catch { /* unknown → origin */ }
      return { p: V(0, 0, 0), h: 0 };
    };
    const shot = s.shot || 'wide';
    if (shot === 'two' && Array.isArray(s.on)) {
      const a = R.root(s.on[0]) || V(), b = R.root(s.on[1]) || V();
      target = a.clone().add(b).multiplyScalar(0.5); target.y = s.y ?? 2.6;
      const ab = b.clone().sub(a); ab.y = 0;
      const sep = ab.length();
      let n = V(-ab.z, 0, ab.x).normalize();
      // pick the side that looks from the open middle of the set outwards (no walls / palms in the way)
      const toCenter = V(-target.x, 0, -target.z);
      if (toCenter.lengthSq() > 0.01 && n.dot(toCenter) < 0) n.negate();
      if (s.side === 'flip') n.negate();
      const yaw = Math.atan2(n.x, n.z) + deg(s.angle || 0);
      dir = yaw;
      const halfH = Math.tan(deg(fov / 2)) * (this.W / this.H);
      dist = s.dist ?? Math.max(9, (sep / 2 + 1.8) / halfH);
      height = s.height ?? 3.6;
    } else {
      const pl = placeOf(s.on);
      target = pl.p.clone();
      const base = s.world ? 0 : pl.h;
      if (shot === 'close') { const hp = B.actors[s.on] ? R.head(s.on) : target.clone().setY(3.4); target = hp; dist = s.dist ?? 4.4; height = s.height ?? 0.25; dir = base + deg(s.angle === 'auto' ? this.autoAngle(B, s.on, cam, base, dist) : s.angle ?? 15); target.y += s.y ?? 0; }
      else if (shot === 'medium') { dist = s.dist ?? 9.5; height = s.height ?? 2.2; dir = base + deg(s.angle === 'auto' ? this.autoAngle(B, s.on, cam, base, dist) : s.angle ?? 22); target.y = s.y ?? 2.5; }
      else if (shot === 'prop') {
        const P = B.props[s.on];
        target = (P ? R.prop(s.on) : target).clone(); target.y -= 0.5;
        // by default look at the prop from the front of whoever holds it
        let hb = 0;
        if (P) { const { holder } = this.propHolder(P, cam.start); if (holder.actor) hb = R.heading(holder.actor, cam.start); }
        dist = s.dist ?? 3.2; height = s.height ?? 0.5; dir = hb + deg(s.angle ?? 20);
      }
      else if (shot === 'top') { target = V(0, 0, 0); dist = s.dist ?? 40; height = s.height ?? 46; dir = deg(s.angle ?? 0); fov = s.fov || 55; }
      else { dist = s.dist ?? 24; height = s.height ?? 9; dir = base + deg(s.angle ?? 0); target.y = s.y ?? 2.5; }
      if (s.follow === false && B.actors[s.on]) { /* fixed target at shot start */ }
    }
    // camera moves over the life of the shot
    const mv = s.move;
    const e = smooth(k);
    if (mv === 'push') dist *= lerp(1.15, 0.8, e);
    if (mv === 'pull') dist *= lerp(0.8, 1.2, e);
    if (mv === 'orbit') dir += deg((s.orbit ?? 35) * (e - 0.5));
    if (mv === 'rise') height += lerp(-1, 4, e);
    if (mv === 'tilt-up') {
      const tilt = lerp(-2.4, 2.2, e);
      target.y += tilt; height -= tilt;
    }
    if (mv === 'drift') dir += deg(6 * Math.sin(t * 0.5));
    const pos = V(target.x + Math.sin(dir) * dist, target.y + height, target.z + Math.cos(dir) * dist);
    if (shot === 'top') pos.set(Math.sin(dir) * dist, height, Math.cos(dir) * dist);
    return { pos, target, fov };
  }

  placeCamera(sc, B, t) {
    const b = beatAt(sc, t);
    const cam = b && t >= b.start ? b.cam : { spec: sc.initialCamera, start: sc.start, end: sc.beats[0]?.start ?? sc.end };
    let pose = this.shotPose(cam, sc, B, t);
    const ease = cam.spec?.ease;
    if (ease && cam.prev) {
      const k = smooth((t - cam.start) / (typeof ease === 'number' ? ease : 1.2));
      if (k < 1) {
        const p0 = this.shotPose(cam.prev, sc, B, t);
        pose = { pos: p0.pos.lerp(pose.pos, k), target: p0.target.lerp(pose.target, k), fov: lerp(p0.fov, pose.fov, k) };
      }
    }
    this.camera.position.copy(pose.pos);
    this.camera.fov = pose.fov; this.camera.updateProjectionMatrix();
    this.camera.lookAt(pose.target);
    this.focus = pose.pos.distanceTo(pose.target);
  }

  /** where an actor is on the picture at t (canvas pixels, after renderAt(t)): head centre + radius, feet — for review crops */
  locate(t, id) {
    const { B } = this.evaluate(t), A = B.actors[id];
    if (!A || !A.fig.root.visible) return null;
    const P = (v) => { const p = v.clone().project(this.camera); return p.z > 1 ? null : [(p.x + 1) / 2 * this.W, (1 - p.y) / 2 * this.H]; };
    const h = A.fig.faceAnchor.getWorldPosition(new THREE.Vector3()), top = P(h.clone().setY(h.y + 0.9)), hp = P(h), f = P(A.fig.root.position);
    if (!hp || !top || !f) return null;
    return { x: hp[0], y: hp[1], r: Math.max(8, Math.abs(hp[1] - top[1])), feet: f[1] };
  }
  subjects(t) { const sc = sceneAt(this.tl, t), b = beatAt(sc, t), on = (b?.activeCamera || sc.initialCamera)?.on; return (Array.isArray(on) ? on : [on]).filter((x) => typeof x === 'string' && sc.actors[x]); }

  // ----- render -----
  renderAt(t) {
    t = Math.max(0, Math.min(this.tl.duration - 1e-3, t));
    // the camera aims at the rest pose (a close-up must not shake when the actor nods or knocks),
    // then the real pose is rendered
    const r = this.evaluate(t, { rest: true });
    this.placeCamera(r.sc, r.B, t);
    const { sc, B } = this.evaluate(t);
    if (this.composer) {
      const P = this.passes;
      P.render.scene = B.scene;
      if (P.ao) P.ao.scene = B.scene;
      if (P.dof) { // shallow depth of field: the nearer the subject, the softer the background
        P.dof.scene = B.scene;
        const f = this.focus || 10;
        P.dof.uniforms.focus.value = f; P.dof.uniforms.aperture.value = (this.desc.render?.dof ?? 1) * 0.0011 / Math.max(2.5, f);
        P.dof.uniforms.maxblur.value = f < 8 ? 0.008 : 0.004;
      }
      try { this.composer.render(); } catch (e) { console.warn('vivid post-processing off:', e); this.composer = null; this.renderer.render(B.scene, this.camera); }
    } else this.renderer.render(B.scene, this.camera);
    const g = this.ctx;
    g.drawImage(this.gl, 0, 0);
    // scene fades
    let fade = 0;
    const tr = sc.transition;
    const next = this.tl.scenes[sc.index + 1];
    if (sc.index > 0 && tr !== 'cut') fade = Math.max(fade, 1 - clamp01((t - sc.start) / FADE));
    if (next && next.transition !== 'cut') fade = Math.max(fade, 1 - clamp01((sc.end - t) / FADE));
    if (sc.index === 0) fade = Math.max(fade, 1 - clamp01(t / 0.5));
    if (!next) fade = Math.max(fade, 1 - clamp01((sc.end - t) / 0.8));
    this.overlay.draw(g, t, sc, beatAt(sc, t), fade, tr === 'white' || next?.transition === 'white');
    return this.out;
  }
}
