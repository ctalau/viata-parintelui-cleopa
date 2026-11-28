// Mâna 2.5D a unui personaj la un moment dat: proxy → volume C → plasă plată, pe nivelurile
// față de manșetă din palme25d_bake.py (Levels, level_rule). Fără memorie între cadre: starea
// mâinii (poza, palma, tranziția) vine din regie, ca funcție de timp.
import * as THREE from 'three';
import { armPoints } from './arm25d.js';
import { buildVolume, capsuleRing, clipConvex, defaultPalm, ellipse, GESTURES, grow, handOf, handRig, HAND_PER_CM,
  mixGesture, orientation, POSE_GESTURE, projectRig, ribbon, slerp } from './palm25d.js';

const EPSILON = 4e-4;
const SLOTS = 4;
const BEND_FRONT = 35 * Math.PI / 180;
const INK = '#462921';
const NAIL = '#fbd8bd';
const CREASE = '#985441';

/** Starea mâinii: poza și palma curentă și cele de dinainte, cu tranziția (0…1). */
export function handState(p, side, direction, pose, palm, previous = null, t = 1) {
  const target = orientation(direction, palm ?? defaultPalm(pose, side), side);
  const g = GESTURES[POSE_GESTURE[pose]];
  if (!previous || t >= 1) return { q: target, g };
  const q0 = orientation(direction, previous.palm ?? defaultPalm(previous.pose, side), side);
  const e = t * t * (3 - 2 * t);
  return { q: slerp(q0, target, e), g: mixGesture(GESTURES[POSE_GESTURE[previous.pose]], g, e) };
}

export class PalmMesh {
  constructor(profile, side, colors) {
    this.p = profile; this.side = side;
    this.colors = { ink: new THREE.Color(INK), skin: new THREE.Color(`#${colors.skin}`), shade: new THREE.Color(`#${colors.skin_shadow}`),
      nail: new THREE.Color(NAIL), crease: new THREE.Color(CREASE) };
    this.geometry = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geometry, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    this.mesh.name = `palmă 2.5D ${side}`;
    this.mesh.frustumCulled = false;
  }

  /**
   * `wrist`, `direction`: capul și direcția osului mâinii (spațiul rigului); `depth`, `elbow`: din IK;
   * `state`: {q, g}; `levels`: {base, top}; `bend`: îndoirea încheieturii (rad); `delta`: deplasarea umărului.
   */
  update({ wrist, depth, elbow, state, levels, bend = 0, delta = [0, 0] }) {
    const p = this.p, side = this.side;
    const local = armPoints(p, side, [wrist[0] - delta[0], wrist[1] - delta[1]], depth, null, elbow);
    const W = [local.W[0] + delta[0], local.W[1] + delta[1], local.W[2]];
    const rig = handRig(p, side, W, state.q, state.g, delta);
    const h = projectRig(rig, side);
    h.k = HAND_PER_CM * p.hand;
    const built = buildVolume(h, { hand: handOf(p), lw: 0.029 * p.hand });
    this.built = built; this.h = h;
    const away = h.axes.y[2] < -0.35;
    const bent = bend > BEND_FRONT;
    const palmRank = built.groups.findIndex((g) => g.id === 'palm');
    const positions = [], colors = [];
    const c = this.colors;
    const X = (x) => x;   // projectRig dă deja spațiul rigului (dreapta e reflectată acolo)
    const fan = (ring, z, color) => {
      for (let i = 1; i < ring.length - 1; i++) {
        for (const q of [ring[0], ring[i], ring[i + 1]]) { positions.push(X(q[0]), q[1], z); colors.push(color.r, color.g, color.b); }
      }
    };
    const strip = (pairs, z, color) => {
      for (let i = 0; i + 3 < pairs.length; i += 2) {
        for (const q of [pairs[i], pairs[i + 1], pairs[i + 2], pairs[i + 1], pairs[i + 3], pairs[i + 2]]) {
          positions.push(X(q[0]), q[1], z); colors.push(color.r, color.g, color.b);
        }
      }
    };
    const lw = built.lw;
    built.groups.forEach((g, rank) => {
      const level = (rank > palmRank || bent) && !away ? levels.top : levels.base;
      const z0 = level + SLOTS * rank * EPSILON;
      for (const s of g.shapes) {
        const ink = s.t === 'poly' ? grow(s.pts, lw) : capsuleRing(s.a, s.b, s.ra + lw, s.rb + lw);
        fan(ink, z0, c.ink);
      }
      for (const s of g.shapes) {
        const fill = s.t === 'poly' ? s.pts : capsuleRing(s.a, s.b, s.ra, s.rb);
        fan(fill, z0 + EPSILON, g.fill === 'shade' ? c.shade : c.skin);
      }
      for (const d of g.details) {
        if (d.t === 'patch') fan(clipConvex(capsuleRing(d.c, d.c, d.r, d.r), d.clip), z0 + 2 * EPSILON, c.skin);
        else if (d.t === 'nail') {
          fan(ellipse(d.c, d.rx, d.ry, d.angle, 16, d.w), z0 + 2 * EPSILON, c.ink);
          fan(ellipse(d.c, d.rx, d.ry, d.angle), z0 + 3 * EPSILON, c.nail);
        } else if (d.t === 'line') strip(ribbon(d.pts, d.w), z0 + 2 * EPSILON, c.crease);
      }
    });
    this.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    this.geometry.computeBoundingSphere();
    return built;
  }
}
