// Regizorul: construiește un episod din GLB-uri reutilizabile și episode.json, apoi îl evaluează
// ca funcție pură de timp. `setTime(t)` refă starea întregii scene din descriptor, indiferent de
// ordinea cadrelor cerute: playerul, capturile și exportul MP4 folosesc exact aceeași funcție.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { armTrack, keyPose } from './arm25d.js';
import { Character } from './character.js';
import { expandGesture } from './gestures.js';
import { GESTURES, POSE_GESTURE, wristFromTip } from './palm25d.js';
import { easeInOut, lastKey, smooth, step } from './tracks.js';
import { mouthTrack } from './lipsync.js';
import { Overlays } from './overlays.js';

const TRANSITION = 6;        // trei desene la redarea pe doi timpi
const TABLE_GAP = 0.08;      // unități ale rigului peste ștergar (palme25d_bake.TABLE_GAP)
const FACE_LIFT = 0.10;

const relax = (p, side, soften = 0) => {
  const s = side === 'R' ? -1 : 1;
  return [s * (p.shoulder_x + 0.08 + soften), p.shoulder_y - p.upper - p.lower + 0.085];
};

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

export class Stage {
  constructor({ loader, root = '' }) {
    this.loader = loader;
    this.root = root;
    this.cache = new Map();
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-8, 8, 4.5, -4.5, 0.1, 200);
    this.camera.position.set(0, 0, 20);
    this.scene.add(this.camera);
  }

  asset(kind, id) {
    const key = `${kind}/${id}`;
    if (!this.cache.has(key)) {
      this.cache.set(key, Promise.all([
        this.loader.loadAsync(`${this.root}/assets/${kind}/${id}.glb`),
        json(`${this.root}/assets/${kind}/${id}.json`).catch(() => ({})),
      ]).then(([gltf, meta]) => ({ gltf, meta })));
    }
    return this.cache.get(key);
  }

  async load(episodeUrl) {
    const base = episodeUrl.replace(/[^/]+$/, '');
    this.base = base;
    const episode = this.episode = await json(episodeUrl);
    this.fps = episode.fps;
    this.frames = episode.frames;
    this.duration = (episode.frames) / episode.fps;
    this.timeline = await json(base + episode.timeline);
    const envelopes = episode.audio?.envelopes ? await json(base + episode.audio.envelopes).catch(() => null) : null;
    const cues = this.timeline.beats.flatMap((b) => b.cues);
    this.sets = {};
    for (const [id, spec] of Object.entries(episode.sets)) {
      const { gltf, meta } = await this.asset('sets', spec.asset);
      const group = new THREE.Group();
      group.name = `set:${id}`;
      const model = gltf.scene.clone(true);
      flatten(model);
      group.add(model);
      const parts = {};
      model.traverse((node) => { if (node.userData.part) (parts[node.userData.part] ??= []).push(node); });
      for (const list of Object.values(parts)) for (const node of list) node.userData.rest = node.position.clone();
      group.visible = false;
      this.scene.add(group);
      this.sets[id] = { group, meta, parts };
    }
    this.cast = {};
    for (const [id, spec] of Object.entries(episode.cast)) {
      const { gltf, meta } = await this.asset('characters', spec.character);
      const character = new Character(gltf, meta, { interior: spec.interior });
      character.root.name = `actor:${id}`;
      const set = this.sets[spec.scene];
      set.group.add(character.root);
      character.root.position.fromArray(spec.pos);
      character.root.scale.set(spec.size, spec.size, 0.5);
      const flipLook = spec.look != null && spec.look !== meta.profile.look ? -1 : 1;
      const actor = { id, spec: withGestures(spec, meta.profile), character, p: meta.profile, set, flipLook, held: [] };
      if (spec.shadow) actor.shadow = shadowOf(character, spec.shadow);
      for (const hold of spec.props ?? []) {
        const { gltf: propGltf } = await this.asset('props', hold.prop);
        const node = propGltf.scene.clone(true);
        flatten(node);
        node.matrixAutoUpdate = false;
        character.armature.add(node);
        actor.held.push({ node, hold });
      }
      actor.tracks = this.compileArms(actor);
      actor.mouth = mouthTrack(spec, cues, envelopes, this.fps);
      this.cast[id] = actor;
    }
    this.props = {};
    for (const [id, spec] of Object.entries(episode.props)) {
      const set = this.sets[spec.scene];
      let node;
      if (spec.part) node = { parts: set.parts[spec.part] ?? [] };
      else {
        const { gltf } = await this.asset('props', spec.asset);
        const model = gltf.scene.clone(true);
        flatten(model);
        const parts = {};
        model.traverse((n) => { if (n.userData.part) parts[n.userData.part] = n; });
        for (const n of Object.values(parts)) n.userData.rest = { position: n.position.clone(), scale: n.scale.clone(), rotation: n.rotation.z };
        const group = new THREE.Group();
        group.name = `prop:${id}`;
        group.add(model);
        set.group.add(group);
        const anchor = spec.anchor ? set.meta.anchors?.[spec.anchor]?.pos : null;
        group.position.fromArray(spec.pos ?? anchor ?? [0, 0, 0]);
        if (spec.scale) group.scale.fromArray(spec.scale);
        node = { group, parts };
      }
      this.props[id] = { id, spec, set, ...node };
    }
    this.overlays = new Overlays(this);
    await this.overlays.load();
    return this;
  }

  /** Brațele fiecărui actor: piste de poze-cheie rezolvate o dată (armTrack). */
  compileArms(actor) {
    const { spec, p } = actor;
    const tracks = { R: [], L: [] };
    for (const arm of (spec.arms ?? []).toSorted((a, b) => a.keys[0][0] - b.keys[0][0])) {
      const keys = arm.keys.map(([f, wrist, dir, depth]) => ({ t: f, wrist, dir, depth }));
      const previous = tracks[arm.side].at(-1);
      if (arm.joinPrevious && previous && previous.end <= keys[0].t) {
        keys[0].joints = previous.poseAt(keys[0].t);
      }
      const track = armTrack(p, arm.side, keys, { wristLimit: arm.limit ?? null });
      tracks[arm.side].push({ ...track, palm: arm.palm ?? null, palmKeys: arm.palmKeys,
        from: arm.keys[0][0], to: arm.keys.at(-1)[0],
        lift: arm.lift ?? null, liftFrom: arm.liftFrom ?? -Infinity, liftTo: arm.liftTo ?? Infinity });
    }
    return tracks;
  }

  frameOf(t) {
    return t * this.fps + 1;
  }

  shotAt(f) {
    const shots = this.episode.shots;
    let index = 0;
    for (let i = 0; i < shots.length; i++) if (shots[i].at <= f) index = i;
    const shot = shots[index];
    const end = index + 1 < shots.length ? shots[index + 1].at : this.frames + 1;
    return { shot, index, end };
  }

  /** Starea scenei la timpul t (secunde). */
  setTime(t) {
    const f = Math.min(this.frames, Math.max(1, this.frameOf(t)));
    this.frame = f;
    const { shot, index, end } = this.shotAt(Math.floor(f));
    for (const [id, set] of Object.entries(this.sets)) set.group.visible = id === shot.set;
    const set = this.sets[shot.set];
    // Camera: centru, lățime și alunecarea lentă a planului (chei Bézier în Blender).
    const duration = end - shot.at;
    const u = Math.max(0, Math.min(1, (f - shot.at) / Math.max(1, duration - 1)));
    const e = u * u * (3 - 2 * u);
    const width = shot.width + shot.glide[2] * e;
    const height = width * 9 / 16;
    this.camera.left = -width / 2; this.camera.right = width / 2;
    this.camera.top = height / 2; this.camera.bottom = -height / 2;
    this.camera.position.set(shot.center[0] + shot.glide[0] * e, shot.center[1] + shot.glide[1] * e, 20);
    this.camera.updateProjectionMatrix();
    for (const prop of Object.values(this.props)) if (prop.set === set) this.updateProp(prop, f);
    for (const actor of Object.values(this.cast)) if (actor.set === set) this.updateActor(actor, f);
    this.overlays.update(f, index);
    this.shot = { ...shot, index };
    return this;
  }

  updateActor(actor, f) {
    const { spec, character: c, p } = actor;
    const [v0, v1] = spec.visible ?? [1, this.frames + 1];
    c.root.visible = f >= v0 && f < v1;
    if (!c.root.visible) return;
    const move = smooth(spec.move?.map(([k, x, y]) => [k, [x, y]]), f) ?? [0, 0];
    c.root.position.set(spec.pos[0] + move[0], spec.pos[1] + move[1], spec.pos[2]);
    const factor = smooth(spec.scale, f) ?? 1;
    c.root.scale.set(spec.size * factor, spec.size * factor, 0.5);
    c.resetPose();
    // Mersul pe loc (build_episode.step): rădăcina urcă la fiecare pas, picioarele se leagănă.
    for (const [f0, f1, count, strength] of spec.steps ?? []) {
      if (f < f0 || f > f1) continue;
      const t = (f - f0) / Math.max(1, f1 - f0);
      const envelope = easeInOut(Math.min(t, 1 - t) / 0.25);
      const swing = Math.sin(t * 2 * Math.PI * count) * envelope;
      c.pose.root = { rot: 0, len: 1, shift: 0.062 * swing ** 2 };
      for (const [side, s] of [['R', -1], ['L', 1]]) {
        for (const [name, gain] of [['thigh', strength], ['shin', -0.35 * strength], ['foot', -0.11]]) {
          c.pose[`${name}.${side}`] = { rot: s * gain * swing, len: 1 };
        }
      }
    }
    const head = smooth(spec.head?.map(([k, bow, tilt]) => [k, [bow, tilt]]), f) ?? [0, 0];
    const flip = (step(spec.flip, f) ?? 1) * actor.flipLook;
    c.pose.head = { rot: head[1], len: 1, shift: -head[0], sx: flip };
    // Respirația: pieptul se umflă discret (build_episode.breathing).
    const chest = c.parts.filter((m) => (m.userData.part ?? m.parent?.userData.part ?? '').includes('Shirt and clothing panels'));
    let sx = 1, sy = 1;
    for (const [start, end, phase] of spec.breathe ?? []) {
      if (f < start || f > end) continue;
      const inhale = Math.sin((f - start) * 2 * Math.PI / 113 + phase);
      sx = 1 + 0.012 * inhale; sy = 1 + 0.004 * inhale;
    }
    for (const m of chest) m.scale.set(sx, sy, 1);
    // Fața: clipitul, pozele ochilor și ale gurii (variante de desen, fără interpolare).
    const eyes = [...(spec.face?.eye_pose ?? [])];
    for (const b of spec.blinks ?? []) for (const [o, v] of [[0, 0], [1, 1], [2, 2], [4, 1], [5, 0]]) eyes.push([b + o, v]);
    eyes.sort((a, b) => a[0] - b[0]);
    c.select('eye_pose', c.meta.variants.eye_pose[step(eyes, Math.floor(f)) ?? 0]);
    const mouth = actor.mouth(Math.floor(f));
    c.select('mouth_pose', c.meta.variants.mouth_pose[mouth ?? 0]);
    const accessories = [...(spec.accessories ?? [])];
    for (const [name, from, to] of spec.accessories_at ?? []) if (f >= from && f < to) accessories.push(name);
    c.select('accessory', accessories);
    // Brațele: piste de poze-cheie, contacte (talerul, obrazul) și repausul.
    for (const side of ['R', 'L']) c.setArm(side, this.armAt(actor, side, f));
    c.apply();
    this.liftAtTable(actor, f);
    for (const { node, hold } of actor.held) {
      const m = c.deformOf(hold.bone).multiply(new THREE.Matrix4().makeTranslation(hold.at[0], hold.at[1], hold.z ?? 0));
      node.matrix.copy(m);
    }
  }

  handAt(actor, side, f, palm) {
    const keys = (actor.spec.hands ?? []).filter((h) => h[1] === side).map(([k, , pose]) => [k, pose]);
    const { current, previous, next } = lastKey(keys, f);
    const pose = current?.[1] ?? 'rest';
    if (!current || current[0] <= (actor.spec.visible?.[0] ?? 1)) return { pose, palm };
    const duration = Math.min(TRANSITION, next ? next[0] - current[0] : TRANSITION);
    const t = Math.min(1, (f - current[0]) / duration);
    return { pose, palm, previous: t < 1 ? { pose: previous?.[1] ?? 'rest', palm } : null, t };
  }

  armAt(actor, side, f) {
    const { spec, p } = actor;
    const contact = (spec.contacts ?? []).find((c) => c.side === side && f >= c.from && f <= c.to);
    if (contact) return this.contactArm(actor, contact, f);
    const tracks = actor.tracks[side];
    let track = null;
    for (const tr of tracks) if (tr.from <= f) track = tr;
    if (!track && tracks.length && f < tracks[0].from) track = null;
    if (!track) {
      const wrist = relax(p, side);
      const pose = keyPose(p, side, wrist, [side === 'R' ? -0.08 : 0.08, -1]);
      return { rot: [pose.a, pose.b, pose.c], len: [pose.su, pose.sf], depth: pose.depth, elbow: pose.elbow,
        hand: this.handAt(actor, side, f, null) };
    }
    const arm = track.at(f);
    // Mâna la față (semnul crucii): antebrațul, manșeta și palma trec în fața capului.
    const face = track.lift === 'face' && f >= track.liftFrom && f <= track.liftTo;
    const palm = smooth(track.palmKeys, f) ?? track.palm;
    return { rot: arm.rot, len: arm.len, depth: arm.depth, elbow: arm.elbow, hand: this.handAt(actor, side, f, palm),
      ...(face && { lift: FACE_LIFT, liftKind: 'face' }) };
  }

  /** Vârful degetelor pe o țintă care se mișcă: talerul (recuzită) sau obrazul (osul capului). */
  contactArm(actor, contact, f) {
    const { p, spec, character } = actor;
    let tip = contact.tip;
    if (contact.target.startsWith('prop:')) {
      const prop = this.props[contact.target.slice(5)];
      const keys = prop.spec.keys;
      const at = (k) => smooth(keys, k);
      const rig = (k) => { const m = smooth(spec.move?.map(([q, x, y]) => [q, [x, y]]), k) ?? [0, 0]; return [spec.pos[0] + m[0], spec.pos[1] + m[1]]; };
      const a0 = at(contact.from), a1 = at(f), r0 = rig(contact.from), r1 = rig(f);
      const s = spec.size;
      const rise = character.pose.root?.shift ?? 0;
      tip = [tip[0] + ((a1[0] - a0[0]) - (r1[0] - r0[0])) / s,
        tip[1] + ((a1[1] - a0[1]) - (r1[1] - r0[1])) / s - rise, tip[2]];
    } else if (contact.target === 'head') {
      const h0 = this.headAt(actor, contact.from), h1 = this.headAt(actor, f);
      const dx = tip[0] - h0.head[0], dy = tip[1] - h0.head[1];
      const da = h1.angle - h0.angle;
      tip = [h1.head[0] + dx * Math.cos(da) - dy * Math.sin(da), h1.head[1] + dx * Math.sin(da) + dy * Math.cos(da), tip[2]];
    }
    const dir = Array.isArray(contact.dir[0]) ? smoothDir(contact.dir, f) : contact.dir;
    const palm = contact.palm;
    const gesture = GESTURES[POSE_GESTURE[contact.pose]];
    let want = dir;
    let pose;
    for (let i = 0; i < 4; i++) {
      const w = wristFromTip(p, contact.side, tip, want, palm, gesture);
      pose = keyPose(p, contact.side, [w[0], w[1]], want, { depth: w[2], wristLimit: contact.limit ?? null });
      const angle = pose.a + pose.b + pose.c;
      const actual = [Math.sin(angle), -Math.cos(angle)];
      if (Math.hypot(actual[0] - want[0], actual[1] - want[1]) < 1e-7) break;
      want = actual;
    }
    return { rot: [pose.a, pose.b, pose.c], len: [pose.su, pose.sf], depth: pose.depth, elbow: pose.elbow,
      hand: { pose: contact.pose, palm, previous: null, t: 1 },
      liftKind: contact.target === 'head' ? 'face' : 'table', lift: contact.target === 'head' ? FACE_LIFT : 0 };
  }

  headAt(actor, f) {
    const head = smooth(actor.spec.head?.map(([k, bow, tilt]) => [k, [bow, tilt]]), f) ?? [0, 0];
    const c = actor.character;
    const saved = c.pose.head;
    c.pose.head = { rot: head[1], len: 1, shift: -head[0] };
    const world = c.solve();
    c.pose.head = saved;
    return world.head;
  }

  /** Mâinile sub muchia mesei trec în fața ei (palme25d_bake: TABLE_KEY), doar la cine stă la masă. */
  liftAtTable(actor, f) {
    const table = actor.set.meta.table;
    if (!table || !actor.spec.atTable) return;
    const c = actor.character;
    let changed = false;
    for (const side of ['R', 'L']) {
      const palm = c.palms[side];
      const arm = c.arms[side];
      if (!palm?.built || !arm || arm.liftKind === 'face') continue;
      let low = Infinity;
      for (const g of palm.built.groups) for (const s of g.shapes) {
        for (const q of s.pts ?? [s.a, s.b]) low = Math.min(low, q[1] - (s.pts ? 0 : Math.max(s.ra, s.rb)));
      }
      const worldY = c.root.position.y + low * c.root.scale.y;
      if (worldY < table.edge) {
        const levels = c.sleeves[side].levels;
        arm.lift = (table.front - c.root.position.z) / c.root.scale.z + TABLE_GAP - levels.base;
        arm.liftKind = 'table';
        changed = true;
      }
    }
    if (changed) c.apply();
  }

  updateProp(prop, f) {
    const { spec } = prop;
    const [v0, v1] = spec.visible ?? [1, this.frames + 1];
    const visible = f >= v0 && f < v1;
    if (prop.group) prop.group.visible = visible;
    for (const node of prop.parts?.length ? prop.parts : []) node.visible = visible;
    if (spec.keys && prop.group) {
      const k = spec.keys[0];
      if (k.length === 2) prop.group.position.fromArray(smooth(spec.keys, f));
      else {
        prop.group.position.fromArray(smooth(spec.keys.map(([q, pos]) => [q, pos]), f));
        prop.group.scale.fromArray(smooth(spec.keys.map(([q, , sc]) => [q, sc]), f));
      }
    }
    const ambient = spec.ambient;
    if (ambient?.kind === 'steam') {
      const loaf = this.props[ambient.follow].group.position;
      prop.group.position.set(loaf.x + 0.07 * Math.sin(f * 0.085), loaf.y + 0.51 + 0.078 * Math.sin(f * 0.063), 0.022);
      prop.group.scale.set(1 + 0.08 * Math.sin(f * 0.063), 0.82 + 0.17 * Math.sin(f * 0.081), 1);
      prop.group.visible = f >= ambient.from;
    } else if (ambient?.kind === 'drift') {
      prop.group.position.set(spec.pos[0] + 0.10 * Math.sin(f * 0.06), spec.pos[1] + 0.105 * Math.sin(f * 0.057), spec.pos[2]);
    } else if (ambient?.kind === 'flicker') {
      for (const node of prop.parts) node.position.set(node.userData.rest.x + 0.03 * Math.sin(f * 0.4), node.userData.rest.y + 0.025 * Math.sin(f * 0.6), node.userData.rest.z);
    }
    for (const [name, track] of Object.entries(spec.parts ?? {})) {
      const node = prop.parts?.[name];
      if (!node) continue;
      const rest = node.userData.rest;
      if (track.turn?.length) node.rotation.z = smooth(track.turn, f);
      if (track.position?.length) node.position.fromArray(smooth(track.position, f));
      if (track.scale?.length) node.scale.fromArray(smooth(track.scale, f));
      if (track.hidden) node.visible = !step(track.hidden, Math.floor(f));
      else if (rest && !track.turn && !track.position && !track.scale) node.visible = true;
    }
  }
}

/**
 * Acțiunile `do` ale unui actor ({gesture, side, at, hold}) desfăcute în piste (brațe, mâini, cap,
 * față) din biblioteca de gesturi; se adaugă la pistele scrise direct în descriptor.
 */
export function withGestures(spec, p) {
  if (!spec.do?.length) return spec;
  const out = { ...spec, arms: [...(spec.arms ?? [])], hands: [...(spec.hands ?? [])], head: [...(spec.head ?? [])],
    face: { ...(spec.face ?? {}) } };
  for (const action of spec.do) {
    const g = expandGesture(p, action);
    out.arms.push(...(g.arms ?? []));
    out.hands.push(...(g.hands ?? []));
    out.head.push(...(g.head ?? []));
    for (const [name, keys] of Object.entries(g.face ?? {})) out.face[name] = [...(out.face[name] ?? []), ...keys];
  }
  out.hands.sort((a, b) => a[0] - b[0]);
  out.head.sort((a, b) => a[0] - b[0]);
  for (const name of Object.keys(out.face)) out.face[name].sort((a, b) => a[0] - b[0]);
  return out;
}

function smoothDir(keys, f) {
  // Direcția degetelor între chei, cu racordare lină (smootherstep, ca aim_at).
  if (f <= keys[0][0]) return keys[0][1];
  if (f >= keys.at(-1)[0]) return keys.at(-1)[1];
  let i = 0;
  while (f > keys[i + 1][0]) i++;
  const [f0, a] = keys[i], [f1, b] = keys[i + 1];
  const e = easeInOut((f - f0) / (f1 - f0));
  const v = [a[0] + (b[0] - a[0]) * e, a[1] + (b[1] - a[1]) * e];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l];
}

/** Materialele plate pentru decoruri și recuzită: culoarea din emisie sau textura pictată. */
export function flatten(root) {
  const made = new Map();
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.frustumCulled = false;
    const list = Array.isArray(node.material) ? node.material : [node.material];
    const flat = list.map((m) => {
      if (made.has(m)) return made.get(m);
      const map = m.emissiveMap || m.map || null;
      const color = map ? new THREE.Color(0xffffff) : (m.emissive?.getHex() ? m.emissive.clone() : m.color.clone());
      const out = new THREE.MeshBasicMaterial({ color, map, side: THREE.DoubleSide, transparent: m.transparent || Boolean(map),
        alphaTest: m.alphaTest || (map ? 0.01 : 0), opacity: m.opacity });
      if (map) map.colorSpace = THREE.SRGBColorSpace;
      made.set(m, out);
      return out;
    });
    node.material = Array.isArray(node.material) ? flat : flat[0];
  });
}

function shadowOf(character, color) {
  // build_episode.shadow: o elipsă turtită sub picioare, în spatele personajului.
  const p = character.p;
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 44), new THREE.MeshBasicMaterial({ color: new THREE.Color(`#${color}`) }));
  mesh.scale.set(0.752, 0.110, 1);
  mesh.position.set(0.02, -p.leg - 0.20 + 0.015, -0.33);
  mesh.name = 'umbră';
  character.root.add(mesh);
  return mesh;
}

export { THREE, cloneSkinned };
