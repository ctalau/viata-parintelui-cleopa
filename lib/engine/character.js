// Un personaj al seriei, instanțiat dintr-un GLB reutilizabil (assets/characters/<id>.glb).
//
// Rigul e cel din Blender: oase plate în planul XY al rigului, cu adâncimea pe Z. Poza unui os
// este o rotație în plan față de repaus (`rot`, radiani) și o scurtare de-a lungul osului (`len`,
// scara pe Y-ul local), exact ca `rotation_euler.z` / `scale.y` din Blender. Antebrațul și mâna
// nu moștenesc scara părintelui (`inherit_scale = NONE` în Blender): scurtarea brațului mută doar
// cotul, nu și lungimea antebrațului. De aceea FK-ul se calculează aici, nu prin ierarhia three.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

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
    for (const group of Object.keys(this.variants)) {
      const list = meta.variants[group.replace(/^hand_[RL]_/, 'hand_')] ?? [];
      this.select(group, group === 'accessory' ? null : list[0]);
    }
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
    for (const name of this.order) {
      const bone = this.bones[name];
      if (!bone) continue;
      const parentName = this.rest[name].parent;
      const local = parentName ? new THREE.Matrix4().copy(desired[parentName]).invert().multiply(desired[name])
        : desired[name];
      local.decompose(bone.position, bone.quaternion, bone.scale);
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
