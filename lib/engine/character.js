// Un personaj al seriei, instanțiat dintr-un GLB reutilizabil (assets/characters/<id>.glb).
//
// Rigul e cel din Blender: oase plate în planul XY al rigului, cu adâncimea pe Z. Poza unui os
// este o rotație în plan față de repaus (`rot`, radiani) și o scurtare de-a lungul osului (`len`,
// scara pe Y-ul local), exact ca `rotation_euler.z` / `scale.y` din Blender. Antebrațul și mâna
// nu moștenesc scara părintelui (`inherit_scale = NONE` în Blender): scurtarea brațului mută doar
// cotul, nu și lungimea antebrațului. De aceea FK-ul se calculează aici, nu prin ierarhia three.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { liftAngle } from './arm25d.js';
import { handState, PalmMesh } from './hand.js';
import { Sleeve } from './sleeve.js';

const NO_SCALE_INHERIT = /^(forearm|hand)\./;
// Constrângerea „Urmează parțial brațul” din build_rigs.py: umărul moale ia 38 % din rotația brațului.
const FOLLOW = { 'shoulder.R': ['upper_arm.R', 0.38], 'shoulder.L': ['upper_arm.L', 0.38] };

function flatMaterial(source) {
  // Desenele sunt plate: culoarea e în emisie (Blender: Emission), fără lumini.
  const color = source.emissive ? source.emissive.clone() : new THREE.Color(0xffffff);
  if (source.color && source.color.r + source.color.g + source.color.b > 0 && !source.emissive?.getHex()) {
    color.copy(source.color);
  }
  const material = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, map: source.emissiveMap || source.map || null,
    transparent: source.transparent, opacity: source.opacity, alphaTest: source.alphaTest });
  material.name = source.name;
  return material;
}

/** Repausul oaselor din assets/characters/<id>.json: cap, unghi (0 = în jos), lungime, părinte. */
export function restOf(bones) {
  const rest = {};
  for (const [name, info] of Object.entries(bones)) {
    const [hx, hy] = info.head;
    const [tx, ty] = info.tail;
    rest[name] = { head: [hx, hy], angle: Math.atan2(tx - hx, -(ty - hy)), length: Math.hypot(tx - hx, ty - hy),
      parent: info.parent };
  }
  return rest;
}

/** FK 2D, cu regula de scară din Blender: capul, unghiul și scara fiecărui os în spațiul rigului. */
export function solveRig(rest, order, pose, offset = [0, 0]) {
  const world = {};
  for (const name of order) {
    const r = rest[name];
    const follow = FOLLOW[name];
    const q = follow ? { rot: (pose[follow[0]]?.rot ?? 0) * follow[1], len: 1 } : pose[name] ?? { rot: 0, len: 1 };
    let head;
    let angle = r.angle + q.rot;
    if (r.parent) {
      const parent = world[r.parent];
      const pr = rest[r.parent];
      const dx = r.head[0] - pr.head[0];
      const dy = r.head[1] - pr.head[1];
      const c = Math.cos(pr.angle), s = Math.sin(pr.angle);
      const along = (dx * s - dy * c) * parent.scale;   // de-a lungul părintelui (spre coadă)
      const across = dx * c + dy * s;
      const pc = Math.cos(parent.angle), ps = Math.sin(parent.angle);
      head = [parent.head[0] + along * ps + across * pc, parent.head[1] - along * pc + across * ps];
      angle = parent.angle + (r.angle - pr.angle) + q.rot;
    } else {
      head = [r.head[0] + offset[0], r.head[1] + offset[1]];
    }
    const inherit = r.parent && !NO_SCALE_INHERIT.test(name) ? world[r.parent].scale : 1;
    world[name] = { head, angle, len: q.len, scale: inherit * q.len,
      tail: null };
    const L = r.length * world[name].scale;
    world[name].tail = [head[0] + L * Math.sin(angle), head[1] - L * Math.cos(angle)];
  }
  return world;
}

export class Character {
  /** `gltf`: GLB încărcat; `meta`: assets/characters/<id>.json. */
  constructor(gltf, meta, { interior = false } = {}) {
    this.meta = meta;
    this.p = meta.profile;
    this.root = new THREE.Group();
    this.root.name = meta.id;
    const model = cloneSkinned(gltf.scene);
    this.root.add(model);
    this.model = model;
    this.bones = {};
    this.variants = {};
    this.parts = [];
    const swap = interior ? meta.palette?.interior ?? {} : {};
    const materials = new Map();
    model.traverse((node) => {
      const extras = node.userData ?? {};
      // GLTFLoader scoate „.” și „:” din nume; numele original rămâne în userData.name.
      const original = extras.name ?? node.name;
      if (node.isBone) this.bones[original] = node;
      if (extras.variant) {
        const [group, name] = extras.variant.split('=');
        ((this.variants[group] ??= {})[name] ??= []).push(node);
      }
      if (node.isMesh) {
        node.frustumCulled = false;
        const list = Array.isArray(node.material) ? node.material : [node.material];
        const flat = list.map((source) => {
          if (!materials.has(source)) {
            const material = flatMaterial(source);
            const hex = source.name?.startsWith('Ink ') ? source.name.slice(4) : null;
            if (hex && swap[hex]) material.color.set(`#${swap[hex]}`);
            materials.set(source, material);
          }
          return materials.get(source);
        });
        node.material = Array.isArray(node.material) ? flat : flat[0];
        this.parts.push(node);
      }
    });
    this.rest = restOf(meta.bones);
    this.order = Object.keys(this.rest);
    this.pose = {};
    this.resetPose();
    this.selection = {};
    this.setupArms(interior);
    for (const group of Object.keys(this.variants)) {
      const list = meta.variants[group.replace(/^hand_[RL]_/, 'hand_')] ?? [];
      this.select(group, group === 'accessory' ? null : list[0]);
    }
  }

  /** Mânecile devin plase recalculate din poză; fiecare mână primește o palmă C. */
  setupArms(interior) {
    this.sleeves = {};
    this.palms = {};
    this.arms = {};
    const colors = { skin: this.p.skin, skin_shadow: this.p.skin_shadow };
    if (interior && this.meta.palette?.interior) {
      for (const key of ['skin', 'skin_shadow']) colors[key] = this.meta.palette.interior[this.p[key]] ?? this.p[key];
    }
    const skinned = this.parts.filter((m) => m.isSkinnedMesh);
    const partOf = (m) => m.userData.part ?? m.parent?.userData.part ?? m.name;
    for (const side of ['R', 'L']) {
      // O mânecă cu mai multe materiale devine mai multe primitive (plase) sub un grup.
      const meshes = skinned.filter((m) => partOf(m).includes(`Mânecă continuă · ${side}`));
      if (!meshes.length) continue;
      const chunks = [];
      let total = 0;
      for (const mesh of meshes) {
        const geometry = mesh.geometry.clone();
        const position = geometry.getAttribute('position');
        const index = mesh.skeleton.bones.findIndex((b) => (b.userData.name ?? b.name) === `upper_arm.${side}`);
        const joints = geometry.getAttribute('skinIndex'), weights = geometry.getAttribute('skinWeight');
        const onUpper = new Uint8Array(position.count);
        for (let i = 0; i < position.count; i++) {
          for (let k = 0; k < 4; k++) if (joints.getComponent(i, k) === index && weights.getComponent(i, k) > 0.5) onUpper[i] = 1;
        }
        geometry.deleteAttribute('skinIndex'); geometry.deleteAttribute('skinWeight');
        const plain = new THREE.Mesh(geometry, mesh.material);
        plain.name = mesh.name; plain.frustumCulled = false;
        plain.position.copy(mesh.position); plain.quaternion.copy(mesh.quaternion); plain.scale.copy(mesh.scale);
        mesh.parent.add(plain);
        mesh.visible = false;
        mesh.userData.replaced = true;
        chunks.push({ plain, start: total, count: position.count, rest: position.array.slice(), onUpper });
        total += position.count;
      }
      const rest = new Float32Array(total * 3), onUpper = new Uint8Array(total);
      for (const c of chunks) { rest.set(c.rest, c.start * 3); onUpper.set(c.onUpper, c.start); }
      let cuff = -Infinity;
      for (let i = 0; i < total; i++) cuff = Math.max(cuff, rest[i * 3 + 2]);
      this.sleeves[side] = { sleeve: new Sleeve(rest, onUpper, side, this.rest), chunks, cuff,
        levels: { base: cuff - 0.031, top: cuff + 0.003 } };
      const palm = new PalmMesh(this.p, side, colors);
      meshes[0].parent.add(palm.mesh);
      palm.mesh.position.copy(meshes[0].position); palm.mesh.quaternion.copy(meshes[0].quaternion); palm.mesh.scale.copy(meshes[0].scale);
      this.palms[side] = palm;
    }
  }

  /**
   * Brațul unei laturi pentru cadrul curent: {rot:[a,b,c], len:[su,sf], depth, elbow,
   * hand:{pose, palm, previous, t}, lift}. Fără brațe date, brațul rămâne în repaus (desenul A).
   */
  setArm(side, arm) {
    this.arms[side] = arm;
    if (!arm) return;
    this.pose[`upper_arm.${side}`] = { rot: arm.rot[0], len: arm.len[0] };
    this.pose[`forearm.${side}`] = { rot: arm.rot[1], len: arm.len[1] };
    this.pose[`hand.${side}`] = { rot: arm.rot[2], len: 1 };
  }

  resetPose() {
    for (const name of this.order) this.pose[name] = { rot: 0, len: 1 };
    this.offset = [0, 0];
  }

  /** Alege desenul vizibil dintr-un grup (`eye_pose`, `mouth_pose`, `hand_R_pose`, `accessory`). */
  select(group, name) {
    const nodes = this.variants[group];
    if (!nodes) return;
    this.selection[group] = name;
    for (const [key, list] of Object.entries(nodes)) {
      const on = Array.isArray(name) ? name.includes(key) : key === name;
      for (const node of list) node.visible = on;
    }
  }

  solve() {
    this.world = solveRig(this.rest, this.order, this.pose, this.offset);
    return this.world;
  }

  /** Scrie poza în oasele three (matrici locale calculate din matricile dorite). */
  apply() {
    this.bind();
    const world = this.solve();
    const desired = {};
    const m = new THREE.Matrix4();
    for (const name of this.order) {
      const bone = this.bones[name];
      if (!bone) continue;
      const w = world[name];
      const restBone = this.restMatrices[name];
      // Matricea de repaus a osului din GLB (în spațiul rigului), rotită în jurul capului și
      // scurtată pe axa lui Y locală.
      const rot = new THREE.Matrix4().makeRotationZ(w.angle - this.rest[name].angle);
      const head = this.rest[name].head;
      const toOrigin = new THREE.Matrix4().makeTranslation(-head[0], -head[1], 0);
      const back = new THREE.Matrix4().makeTranslation(w.head[0], w.head[1], 0);
      const scale = new THREE.Matrix4().makeScale(1, w.scale, 1);
      // world = T(head') · R · T(-head) · rest · S(len)   (S în spațiul local al osului)
      m.copy(back).multiply(rot).multiply(toOrigin).multiply(restBone).multiply(scale);
      desired[name] = m.clone();
    }
    this.desired = desired;
    for (const name of this.order) {
      const bone = this.bones[name];
      if (!bone) continue;
      const parentName = this.rest[name].parent;
      const local = parentName ? new THREE.Matrix4().copy(desired[parentName]).invert().multiply(desired[name])
        : desired[name];
      local.decompose(bone.position, bone.quaternion, bone.scale);
    }
    this.updateArms(world);
  }

  updateArms(world) {
    for (const side of ['R', 'L']) {
      const entry = this.sleeves[side];
      if (!entry) continue;
      const arm = this.arms[side];
      const lift = arm?.lift ?? 0;
      const deform = (name) => new THREE.Matrix4().copy(this.desired[name]).multiply(new THREE.Matrix4().copy(this.restMatrices[name]).invert()).elements;
      const S = world[`upper_arm.${side}`].head, E = world[`forearm.${side}`].head, W = world[`hand.${side}`].head;
      const out = entry.sleeve.drawing(deform(`upper_arm.${side}`), deform(`forearm.${side}`), S, E, W, lift, this.liftRamp?.[side]);
      for (const c of entry.chunks) {
        const attribute = c.plain.geometry.getAttribute('position');
        attribute.array.set(out.subarray(c.start * 3, (c.start + c.count) * 3));
        attribute.needsUpdate = true;
      }
      const palm = this.palms[side];
      const hand = arm?.hand;
      palm.mesh.visible = Boolean(hand);
      if (!hand) continue;
      this.select(`hand_${side}_pose`, null);      // desenul A se ascunde cât se vede palma C
      const h = world[`hand.${side}`];
      const direction = [h.tail[0] - h.head[0], h.tail[1] - h.head[1]];
      const l = Math.hypot(...direction);
      const state = handState(this.p, side, [direction[0] / l, direction[1] / l], hand.pose, hand.palm, hand.previous, hand.t ?? 1);
      const levels = { base: entry.levels.base + lift, top: entry.levels.top + lift };
      const delta = [S[0] - this.rest[`upper_arm.${side}`].head[0], S[1] - this.rest[`upper_arm.${side}`].head[1]];
      palm.update({ wrist: h.head, depth: arm.depth, elbow: arm.elbow, state, levels,
        bend: Math.abs(liftAngle(0, arm.rot[2])), delta });
    }
  }

  /** Reține matricile de repaus ale oaselor (spațiul rigului) la prima folosire. */
  bind() {
    if (this.restMatrices) return;
    this.model.updateMatrixWorld(true);
    const armature = Object.values(this.bones)[0].parent;
    this.restMatrices = {};
    const inv = new THREE.Matrix4().copy(armature.matrixWorld).invert();
    for (const [name, bone] of Object.entries(this.bones)) {
      this.restMatrices[name] = new THREE.Matrix4().multiplyMatrices(inv, bone.matrixWorld);
    }
  }
}
