// Mâna 2.5D a unui personaj la un moment dat: proxy → volume C → plasă plată, pe nivelurile
// față de manșetă din palme25d_bake.py (Levels, level_rule). Fără memorie între cadre: starea
// mâinii (poza, palma, tranziția) vine din regie, ca funcție de timp.
import * as THREE from 'three';
import { armPoints, liftAngle, sideSign } from './arm25d.js';
import { buildVolume, capsuleRing, clipConvex, defaultPalm, ellipse, GESTURES, grow, handOf, handRig, HAND_PER_CM,
  mixGesture, orientation, POSE_GESTURE, projectRig, quatRotate, ribbon } from './palm25d.js';

const EPSILON = 4e-4;
const SLOTS = 4;
const BEND_FRONT = 35 * Math.PI / 180;
const INK = '#462921';
const NAIL = '#fbd8bd';
const CREASE = '#985441';

// În gest liber, degetele continuă antebrațul și în adâncime. Rotația palmei
// în jurul acestei axe este independentă de îndoirea încheieturii.
function palmAngles(side, direction, elevation, { pose, palm, contact }) {
  // La rugăciune, fețele palmelor rămân una către alta chiar când
  // degetele trec prin orizontală în drumul spre piept.
  if (pose === 'prayer') return { roll: Math.PI, tilt: 0 };
  const [x, y] = direction, s = sideSign(side);
  const inward = [s * y, -s * x];
  if (contact) {
    const q = orientation(direction, palm ?? defaultPalm(pose, side), side);
    const [nx, ny, nz] = quatRotate(q, [0, 0, -1]);
    return { roll: Math.atan2(nz, s * nx * inward[0] + ny * inward[1]), tilt: 0 };
  }
  const normal = palm ?? (pose === 'cup' ? [-s * 0.5, 0.7, -0.6] : defaultPalm(pose, side));
  const twist = pose === 'rest' && !palm ? -0.22
    : Math.atan2(normal[2], inward[0] * normal[0] + inward[1] * normal[1]);
  const planar = pose === 'stop' || pose === 'touch';
  // Pentru invitație, antebrațul se întoarce până când palma susține un obiect.
  const tilt = elevation * (planar ? 0.20 : 0.76);
  const roll = pose === 'present'
    ? Math.atan2(normal[2] * Math.cos(tilt) - (x * normal[0] + y * normal[1]) * Math.sin(tilt),
      inward[0] * normal[0] + inward[1] * normal[1])
    : Math.max(-1.78, Math.min(1.78, twist));
  return { roll, tilt };
}

export function handState(side, direction, elevation, hand) {
  let { roll, tilt } = palmAngles(side, direction, elevation, hand);
  let g = GESTURES[POSE_GESTURE[hand.pose]];
  if (hand.previous) {
    const prev = hand.previous;
    const t = hand.t * hand.t * (3 - 2 * hand.t);
    // Fixăm ramura rotației la începutul racordului. Cele două trasee în jurul
    // antebrațului devin la fel de scurte la 180°; schimbarea lor ar smuci palma.
    roll = prev.roll + (liftAngle(hand.startRoll, roll) - prev.roll) * t;
    tilt = prev.tilt + (tilt - prev.tilt) * t;
    g = mixGesture(prev.g, g, t);
  }
  const [x, y] = direction, s = sideSign(side);
  const z = Math.sin(tilt), c = Math.cos(tilt);
  const a = Math.cos(roll), b = Math.sin(roll);
  const axis = [x * c, y * c, z];
  const facing = [a * s * y - b * x * z, -a * s * x - b * y * z, b * c];
  return { q: orientation(axis, facing, side), g, roll, tilt };
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
      const level = bent && !away ? levels.top : levels.base;
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
          fan(ellipse(d.c, d.rx, d.ry, d.angle, 16, d.w * 0.55), z0 + 2 * EPSILON, c.shade);
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
