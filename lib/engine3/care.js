// Floor poses and short two-person gestures, sampled in either direction on the common toy rig.
import * as THREE from 'three';
import { bindRigMesh } from './character.js';
import { sampleSegs, lerpAngle, propBend } from '../engine/timeline.js';
const vector = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (x) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
const shape = (g, t) => {
  const p = (t - g.t0) / (g.t1 - g.t0);
  return { p, w: smooth(p / 0.2) * smooth((1 - p) / 0.18) };
};
export const BASKET_RELEASE = .78;
export const careClips = {
  'raise-elbow': 'idle',
  'greet-bow': 'idle',
  cough: 'idle',
  shiver: 'idle',
  'tuck-blanket': 'put_down',
  'help-up': 'offer',
  'support-walk': 'idle',
  unroll: 'put_down',
  'cross-arms': 'idle',
  hungry: 'idle',
  'swing-feet': 'idle',
  'weave-lap': 'idle',
  'break-bread': 'idle',
  'plant-flower': 'idle',
  pet: 'idle',
  'hand-to-chest': 'idle',
  'hand-on-shoulder': 'offer',
  count3: 'offer',
  eat: 'idle',
  'kiss-hand': 'bow',
  'elbow-bless': 'bless',
  sip: 'offer',
  'touch-hand': 'offer',
};
export function weight(P, name) {
  const k = smooth(P.k);
  return (P.from === name ? 1 - k : 0) + (P.to === name ? k : 0);
}
// Keep turns around furniture gentle. A sampled heading track also makes scrubbing agree with playback.
export function calmHeading(actor, scene, time, degreesPerSecond) {
  const fps = 30,
    maxStep = (degreesPerSecond * Math.PI) / (180 * fps);
  if (!actor.headings) {
    let angle = actor.data.initial.h;
    const track = [angle],
      steps = Math.ceil((scene.end - scene.start) * fps) + 1;
    for (let i = 1; i <= steps; i++) {
      const t = scene.start + i / fps + 0.1;
      const target = sampleSegs(actor.data.head, t, actor.data.initial.h, lerpAngle);
      const delta = lerpAngle(angle, target, 1) - angle;
      angle += Math.max(-maxStep, Math.min(maxStep, delta));
      track.push(angle);
    }
    actor.headings = track;
  }
  const u = Math.max(0, Math.min(actor.headings.length - 1, (time - scene.start) * fps)),
    i = Math.floor(u);
  return (
    actor.headings[i] +
    (actor.headings[Math.min(i + 1, actor.headings.length - 1)] - actor.headings[i]) * (u - i)
  );
}
export function floorPlacement(A, state, cast, t) {
  const P = state.st.posture,
    lie = weight(P, 'recline'),
    kneel = weight(P, 'kneeling'),
    side = weight(P, 'side-rest'),
    ch = A.char;
  ch.reclineWeight = lie + side;
  if (!lie && !kneel && !side) return;
  const active = A.data.gestures.filter((g) => t >= g.t0 && t <= g.t1);
  let lift = 0;
  for (const g of active) {
    const { p, w } = shape(g, t);
    if (g.name === 'cough') lift += w * 0.075 * Math.sin(p * Math.PI * 4) ** 4;
    if (g.name === 'elbow-bless') lift += w * 0.19;
    if (g.name === 'raise-elbow') lift += w * 0.12;
  }
  ch.root.position.y +=
    (cast?.beddingHeight || 0) * (lie + side) + (ch.look.scale || 1) * (0.91 * lie + 0.65 * side - 0.20 * kneel);
  ch.root.rotateZ((Math.PI / 2 - 0.055 - lift) * lie + ((ch.look.pillowRest ? 1.552 : 1.525) - lift * 0.65) * side);
  ch.root.rotateY(0.61 * lie + 0.29 * side);
  ch.root.updateMatrixWorld(true);
}
export const floorSitDrop = (P, scale) => weight(P, 'floor-sit') * 0.125 * (scale || 1);

function settleRobe(ch, amount) {
  const skirt = ch.parts.skirt;
  if (!skirt?.isSkinnedMesh) return;
  if (skirt.morphTargetDictionary?.settled === undefined) {
    const geometry = ch.relaxedRobeGeometry = skirt.geometry.clone();
    const p = geometry.attributes.position;
    const folded = new THREE.Float32BufferAttribute(new Float32Array(p.count * 3), 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const hem = 1 - smooth((y - 0.48) / 0.98);
      const fold = Math.cos(7 * Math.atan2(x, z) + 1.6 * y) * 0.038;
      folded.setXYZ(i, -x * (0.20 + fold) * hem, -Math.max(0, z) * 0.08 * hem, -z * (0.21 + fold) * hem);
    }
    folded.name = 'settled';
    geometry.morphAttributes.position = [folded];
    geometry.morphTargetsRelative = true;
    skirt.geometry = geometry;
    skirt.updateMorphTargets();
  }
  skirt.morphTargetInfluences[skirt.morphTargetDictionary.settled] = amount;
}

function hand(ch, side, target, w, pole = null, contact = false) {
  const sock = ch.sockets['hand.' + side],
    wrist = ch.bones['hand_' + side];
  if (!sock || !wrist) return;
  const palm = ch.model.worldToLocal(target.clone());
  const clearance = contact ? 0 : smooth((1.0 - palm.z) / 0.42) * smooth((3.18 - palm.y) / 0.4);
  const x = side === 'R' ? Math.min(palm.x, -0.9) : Math.max(palm.x, 0.9);
  palm.x += (x - palm.x) * clearance;
  palm.z += (Math.max(palm.z, 0.42) - palm.z) * clearance;
  const off = wrist.getWorldPosition(vector()).sub(sock.getWorldPosition(vector()));
  ch.armIK(side, ch.model.localToWorld(palm).add(off), w, pole);
}
// Align the hand with the forearm and keep the palm facing the contact surface.
function palmDownHand(ch, side, target, weight, pole) {
  const wrist = ch.bones['hand_' + side];
  const elbow = ch.bones['forearm_' + side];
  const socket = ch.sockets['hand.' + side];
  hand(ch, side, target, weight, pole, true);
  const fingers = wrist.getWorldPosition(vector()).sub(elbow.getWorldPosition(vector())).normalize();
  const x = fingers.multiplyScalar(side === 'L' ? 1 : -1);
  const y = vector(0, -1, 0).cross(x).normalize();
  const z = x.clone().cross(y);
  const grip = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
  const aim = wrist.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
    .multiply(grip).multiply(socket.quaternion.clone().invert());
  wrist.quaternion.slerp(aim, weight);
  wrist.updateWorldMatrix(false, true);
  hand(ch, side, target, weight, pole, true);
}

function holdBasket(A, basket, t, placeProp) {
  const move = basket.data.moves[0];
  if (move && t >= move.t1) return;
  const { char: ch } = A;
  const progress = move ? Math.max(0, (t - move.t0) / (move.t1 - move.t0)) : 0;
  const reach = smooth(progress / BASKET_RELEASE);
  const hold = 1 - smooth((progress - BASKET_RELEASE) / (1 - BASKET_RELEASE));
  if (progress > 0) ch.addRot('spine', vector(1, 0, 0), .48 * reach * hold, ch.model);
  placeProp(basket);
  const variant = basket.variants[basket.variantNow ?? basket.data.opts.variant];
  const rim = variant?.children.find((node) => node.userData.name === 'rim');
  if (!rim) return;
  const work = A.data.gestures.find((g) => g.name === 'weave-lap' && t >= g.t0 && t <= g.t1);
  const stitchWeight = work ? smooth((t - work.t0) / .4) * smooth((work.t1 - t) / .7) : 0;
  const cadence = .51 + .025 * (A.seed % 7);
  const cycle = (t - (work?.t0 ?? t)) * Math.PI * 2 * cadence;
  for (const [arm, sign] of [['R', -1], ['L', 1]]) {
    const working = arm === 'R' ? stitchWeight : 0;
    const angle = 1.48 + .42 * reach - working * (.28 + .10 * (1 - Math.cos(cycle)));
    const touch = variant.localToWorld(vector(sign * rim.position.x * Math.sin(angle),
      rim.position.y, rim.position.x * Math.cos(angle)));
    touch.y += (.04 + working * .055 * Math.sin(cycle)**2) * basket.obj.scale.x;
    palmDownHand(ch, arm, touch, hold, ch.model.localToWorld(vector(1.40 * sign, 1.58, .3)));
  }
}

export function careActions(B, t, states, cups, bites, placeProp) {
  for (const [id, A] of Object.entries(B.actors)) {
    const ch = A.char,
      P = states[id].st.posture,
      kneel = weight(P, 'kneeling'),
      side = weight(P, 'side-rest'),
      drop = floorSitDrop(P, ch.look.scale);
    if (ch.look.relaxedRobe) settleRobe(ch, weight(P, 'floor-sit'));
    if (drop) {
      for (const s of ['L', 'R']) {
        const foot = ch.bones['foot_' + s].getWorldPosition(vector());
        foot.y += drop;
        ch.footIK(s, foot);
      }
    }
    if (side) {
      if (ch.look.pillowRest) {
        // Keep the weight on the pillow while the eyes and mouth animate.
        for (const joint of ['pelvis', 'spine', 'chest', 'neck', 'head']) {
          const bone = ch.bones[joint];
          bone.position.lerp(ch.rest[joint].p, side);
          bone.quaternion.slerp(ch.rest[joint].q, side);
        }
        ch.root.updateMatrixWorld(true);
      }
      const across = vector(1, 0, 0);
      ch.addRot('spine', across, 0.10 * side, ch.model);
      ch.addRot('chest', across, 0.07 * side, ch.model);
      if (ch.look.pillowRest) {
        ch.addRot('head', vector(0, 0, 1), 0.15 * side, ch.model);
        ch.solveBeard();
      }
      ch.addRot('thigh_L', across, -0.32 * side, ch.model);
      ch.addRot('shin_L', across, 0.64 * side, ch.model);
      ch.addRot('thigh_R', across, -0.53 * side, ch.model);
      ch.addRot('shin_R', across, 0.94 * side, ch.model);
      const settle = smooth((side - 0.57) / 0.43), scale = ch.look.scale || 1;
      for (const [leg, height] of [['R', 0.32], ['L', 0.65]]) {
        const foot = ch.bones['foot_' + leg].getWorldPosition(vector());
        const hips = ch.bones.pelvis.getWorldPosition(vector());
        foot.lerp(hips, 0.20);
        foot.y = states[id].gy + height * scale;
        ch.footIK(leg, foot, settle);
      }
      const support = ch.model.localToWorld(vector(-0.73, 2.45, 0.67));
      support.y = states[id].gy + 0.24 * scale;
      hand(ch, 'R', support, side);
      hand(ch, 'L', ch.model.localToWorld(vector(0.04, 1.50, 1.13)), side);
    }
    if (P.from === 'floor-sit' && P.to === 'side-rest' && P.k < 1) {
      // Brace against the mat while the weight moves from the seat to the right shoulder.
      const target = ch.model.localToWorld(vector(-1.03, 0, 0.31));
      target.y = states[id].gy + 0.19;
      hand(ch, 'R', target, smooth(P.k / 0.16) * smooth((0.82 - P.k) / 0.37));
    }
    if (kneel) {
      for (const s of ['L', 'R']) {
        ch.addRot('thigh_' + s, vector(1, 0, 0), -0.81 * kneel, ch.root);
        ch.addRot('shin_' + s, vector(1, 0, 0), 1.84 * kneel, ch.root);
        const foot = ch.bones['foot_' + s].getWorldPosition(vector());
        // The shin follows the knee while the ankle settles below the rear hem.
        foot.y = Math.min(foot.y, states[id].gy + 0.26 * (ch.look.scale || 1));
        ch.footIK(s, foot, kneel);
      }
    }
    const basket = Object.values(B.props).find((prop) => prop.rimMounted && prop.data.initial.actor === id);
    if (basket) holdBasket(A, basket, t, placeProp);
    for (const g of A.data.gestures) {
      if (t < g.t0 || t > g.t1 || !careClips[g.name]) continue;
      const { p, w } = shape(g, t),
        other = B.actors[g.partner]?.char;
      const local = (x, y, z) => ch.model.localToWorld(vector(x, y, z));
      const bone = (n) => other?.bones[n]?.getWorldPosition(vector());
      if (g.name === 'swing-feet' && states[id].st.sitW > .9) {
        for (const [leg, sign] of [['R', 1], ['L', -1]]) {
          const ankle = ch.bones['foot_' + leg].getWorldPosition(vector());
          const cycle = Math.sin(p * Math.PI * 4.5) * sign;
          ankle.y += (0.15 + 0.03 * cycle) * w;
          ankle.addScaledVector(vector(0, 0, 1).transformDirection(ch.root.matrixWorld), .14 * cycle * w);
          ch.footIK(leg, ankle, w);
        }
      }
      if (g.name === 'pet') {
        const animal = B.props[g.partner];
        const start = animal?.contactPoints['pet:start'];
        const end = animal?.contactPoints['pet:end'];
        if (start && end) {
          placeProp(animal);
          const paw = start.getWorldPosition(vector()).lerp(end.getWorldPosition(vector()), smooth((p-.20)/.62));
          paw.y += .04 + .14 * (1-w);
          ch.addRot('spine', vector(1,0,0), .22 * w, ch.model);
          ch.addRot('chest', vector(1,0,0), .10 * w, ch.model);
          const side = g.hand, sign = side === 'R' ? -1 : 1;
          palmDownHand(ch,side,paw,w,local(sign*1.22,1.40,.61));
        }
      }
      if (g.name === 'plant-flower') {
        const axis = vector(1,0,0);
        ch.addRot('spine',axis,.59*w,ch.model);
        ch.addRot('chest',axis,.26*w,ch.model);
        ch.addRot('head',axis,-.47*w,ch.model);
        const arm = g.hand, sign = arm === 'L' ? 1 : -1;
        hand(ch,arm,local(sign*.84,1.33,1.05),w,local(sign*1.43,1.39,.36),true);
      }
      if (g.name === 'break-bread') {
        const pull = smooth((p - .25) / .30);
        ch.addRot('spine', vector(1,0,0), .34 * w * (1 - pull), ch.model);
        for (const [arm, sign] of [['R', -1], ['L', 1]]) {
          hand(ch, arm, local(sign * (.54 + .32 * pull), 1.42 + .34 * pull, 1.06),
            w, local(sign * 1.50, 1.47, .32), true);
        }
      }
      if (g.name === 'hungry') {
        const side = g.hand, sign = side === 'R' ? -1 : 1;
        palmDownHand(ch, side, local(.51*sign, 1.96, 1.04), w, local(1.40*sign, 1.58, .52));
        const free = side === 'R' ? 'L' : 'R';
        palmDownHand(ch, free, local(-.80*sign, 1.52, .54), w, local(-1.30*sign, 1.76, .32));
        ch.addRot('head', vector(1, 0, 0), .12 * w, ch.model);
      }
      if (g.name === 'hand-to-chest') hand(ch, 'R', local(-.46, 2.18, .58), w);
      if (g.name === 'cross-arms') {
        hand(ch, 'R', local(0.27, 2.27, 0.75), w);
        hand(ch, 'L', local(-0.28, 2.08, 0.78), w);
      }
      if (g.name === 'count3') {
        const i = Math.min(2, Math.floor(p * 3));
        hand(ch, 'R', local(-0.62 + 0.26 * smooth(p), 2.58 + 0.1 * Math.sin(p * 6 * Math.PI), 0.81), w);
        for (let j = 0; j <= i; j++)
          ch.addRot(['index1_R', 'middle1_R', 'ring1_R'][j], vector(1, 0, 0), -0.58 * w, ch.model);
      }
      if (g.name === 'eat') {
        const side = g.hand;
        const bite = bites[id]?.[side];
        if (bite) {
          ch.addRot('head',vector(1,0,0),.055*w,ch.model);
          const scale = ch.look.scale || 1;
          const forward = vector(0,0,1).transformDirection(ch.root.matrixWorld);
          const mouth = ch.sockets.face.getWorldPosition(vector()).addScaledVector(forward,.26*scale);
          mouth.y -= .23*scale;
          const ready = smooth((p-.21)/.20) * smooth((.85-p)/.16);
          const sign = side === 'R' ? -1 : 1;
          const handTarget = local(sign*.61,2.48,1.27).lerp(mouth.sub(bite),ready);
          hand(ch,side,handTarget,w,local(sign*1.36,2.02,.57),true);
        } else {
          hand(ch, side, local(-.27,2.98,.9),w*(.78+.22*Math.sin(p*4*Math.PI)));
        }
      }
      if (g.name === 'unroll') {
        const mat = B.props[g.partner]?.data;
        const setDown = mat?.moves.findLast((m) => m.to.pos && m.t0 <= t)?.to ?? mat?.initial;
        const cue = mat?.gestures.find((g) => g.name === 'unfurl');
        if (setDown?.pos && cue) {
          const [x, y, z] = setDown.pos, yaw = setDown.h;
          const push = smooth((t - cue.t0) / 0.42);
          hand(ch, g.hand, vector(x - 0.61 * push * Math.cos(yaw), states[id].gy + y + 0.40,
            z + 0.61 * push * Math.sin(yaw)), w * (1 - smooth((t - cue.t0 - 0.33) / 0.29)));
        } else hand(ch, 'R', local(-0.2, 1.04, 0.95 + 0.4 * p), w);
      }
      if (g.name === 'shiver') {
        const wave = Math.sin((t - g.t0) * 2 * Math.PI * 4.3) * w;
        ch.addRot('chest', vector(0, 0, 1), 0.021 * wave, ch.model);
        ch.addRot('neck', vector(1, 0, 0), 0.015 * wave, ch.model);
      }
      if (g.name === 'tuck-blanket') {
        const bedding = B.props[g.partner]?.data.initial.pos;
        if (bedding) {
          const [x, y, z] = bedding, [actorX, actorZ] = states[id].pos;
          const edge = vector(actorX - x, 0, actorZ - z).normalize().multiplyScalar(0.82);
          hand(ch, g.hand || 'R', edge.add(vector(x, states[id].gy + y + 0.48, z)), w);
        }
      }
      if (g.name === 'cough') {
        ch.addRot('chest', vector(1, 0, 0), 0.12 * w * Math.sin(2 * p * Math.PI) ** 2, ch.model);
      }
      if (g.name === 'greet-bow') {
        const across = vector(1, 0, 0);
        ch.addRot('neck', across, 0.075 * w, ch.model);
        ch.addRot('head', across, 0.33 * w, ch.model);
        ch.solveBeard();
      }
      if (!other) continue;
      if (g.name === 'help-up' || g.name === 'touch-hand') {
        const a = ch.sockets['hand.R'].getWorldPosition(vector()),
          b = other.sockets['hand.L'].getWorldPosition(vector()),
          mid = a.lerp(b, 0.5);
        hand(ch, 'R', mid, w);
        hand(other, 'L', mid, w);
      }
      if (g.name === 'support-walk') {
        const surface=bone('uparm_R');
        const inward=ch.bones.uparm_L.getWorldPosition(vector()).sub(surface).normalize();
        surface.addScaledVector(inward,.40); surface.y+=.12;
        const shoulder = ch.model.worldToLocal(surface);
        shoulder.x = Math.max(0.96, shoulder.x);
        hand(ch, 'L', ch.model.localToWorld(shoulder), w * 0.63);
        hand(other, 'R', ch.bones.pelvis.getWorldPosition(vector()).add(vector(0, 0.54, 0.4)), w * 0.58);
      }
      if (g.name === 'hand-on-shoulder') hand(ch, g.hand || 'R', bone('uparm_L'), w);
      if (g.name === 'sip') {
        const face = other.sockets.face;
        const rim = cups[id]?.[g.hand];
        if (rim) {
          const mouth = face.localToWorld(vector(0, 0.03, 0.14));
          hand(ch, g.hand, mouth.sub(rim), w);
          continue;
        }
        const target = face.localToWorld(vector(0, -0.28, 0.42));
        const yaw = ch.root.rotation.y;
        target.add(vector(0.337 * Math.cos(yaw), -0.09, -0.337 * Math.sin(yaw)));
        if (weight(states[g.partner].st.posture, 'side-rest')) {
          // Reach for the handle on the far side of the rim, so the cup itself meets the mouth.
          target.copy(face.localToWorld(vector(0, -0.27, 0.31)));
          target.add(vector(0.337 * Math.cos(yaw), -0.09, -0.337 * Math.sin(yaw)));
        }
        hand(ch, 'R', target, w);
      }
      if (g.name === 'kiss-hand') {
        const chin = ch.sockets.face.getWorldPosition(vector()).add(vector(0, -0.36, 0.45)),
          from = other.sockets['hand.R'].getWorldPosition(vector());
        const kiss = from.lerp(chin, 0.32);
        hand(other, 'R', kiss, 0.64 * w);
        hand(ch, 'R', kiss.clone().add(vector(-0.12, -0.16, 0)), w);
      }
    }
  }
}
// The stole follows the same joints as the front of the robe. In a seated pose its
// lower half follows the lap, while the neckline stays attached to the chest.
function drapeStole(garment, char) {
  const skeleton = char.parts.torso.skeleton;
  const bone = Object.fromEntries(skeleton.bones.map((b, i) => [b.name, i]));
  const meshes = [];
  garment.traverse((mesh) => { if (mesh.isMesh) meshes.push(mesh); });
  for (const mesh of meshes) {
    const geometry = mesh.geometry;
    if (!geometry.hasAttribute('skinWeight')) {
      const points = geometry.attributes.position;
      const indices = new Uint16Array(points.count * 4), weights = new Float32Array(points.count * 4);
      for (let i = 0; i < points.count; i++) {
        const x = points.getX(i), y = points.getY(i);
        const legs = 0.90 * smooth((1.42 - y) / 0.57);
        const left = smooth((x / 0.62 + 1) / 2);
        const spine = smooth((y - 1.55) / 0.30);
        const chest = smooth((y - 1.95) / 0.40);
        const belowWaist = y <= 1.55;
        const joints = belowWaist ? [bone.pelvis, bone.thigh_L, bone.thigh_R, bone.pelvis]
          : [bone.pelvis, bone.spine, bone.chest, bone.pelvis];
        const influence = belowWaist ? [1 - legs, legs * left, legs * (1 - left), 0]
          : [1 - spine, spine - chest, chest, 0];
        indices.set(joints, i * 4);
        weights.set(influence, i * 4);
      }
      geometry.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
      geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));
    }
    bindRigMesh(mesh, skeleton);
  }
}
export function dress(ch, assets) {
  for (const name of ch.look.accessories || []) {
    const glb = assets.props[name],
      m = assets.propMeta[name];
    if (!glb || !m?.bone) continue;
    for (const [i, bone] of [m.bone, m.mirrorBone].filter(Boolean).entries()) {
      const o = glb.scene.clone(true),
        v = m.origin || [0, 0, 0];
      o.position.set(i ? -v[0] : v[0], v[1], v[2]);
      ch.model.add(o);
      ch.root.updateMatrixWorld(true);
      if (m.followsRobe) drapeStole(o, ch);
      else ch.bones[bone].attach(o);
    }
  }
}
export function bedPillows(P, t) {
  if (P.data.type === 'sheepdog') {
    if (!P.dogHead) {
      P.obj.traverse((o) => {
        if ((o.userData?.name || o.name) === 'head') P.dogHead = o;
      });
    }
    if (P.dogHead) {
      const g = P.data.gestures.find((g) => g.name === 'look' && t >= g.t0 && t <= g.t1);
      P.dogHead.rotation.z = g?.name ? shape(g, t).w * 0.32 : 0;
    }
  }
  const roll = P.data.gestures?.find((g) => g.name === 'unfurl' && t >= g.t0 && t <= g.t1);
  if (P.data.type === 'rollable-reed-mat') {
    if (!P.reed) {
      P.reed = P.obj.getObjectByName('reed-roll');
      P.spread = P.obj.getObjectByName('reed-spread');
    }
    const action = P.data.gestures.find((g) => g.name === 'unfurl');
    const k = action ? smooth((t - action.t0) / (action.t1 - action.t0)) :
      Math.max(0, Math.min(1, P.data.opts.bend ?? 0));
    const r = Math.sqrt(1 - k);
    P.reed.visible = k < 0.9999;
    P.reed.position.set(-P.spread.userData.length * k, P.reed.userData.radius * r + 0.017, 0);
    P.reed.scale.set(r, r, 1);
    P.reed.rotation.z = P.spread.userData.length * 2 * (1 - r) / P.reed.userData.radius;
    P.spread.visible = k > 0;
    if (action) {
      if (!P.reedEdge) {
        P.reedEdge = new THREE.Plane();
        P.spread.traverse((mesh) => {
          if (!mesh.isMesh) return;
          mesh.material = mesh.material.clone();
          mesh.material.clippingPlanes = [P.reedEdge];
          mesh.material.clipShadows = true;
        });
      }
      // Reveal full-size reeds from the anchored end as the roll moves across the floor.
      P.spread.updateWorldMatrix(true, false);
      const edge = k < 1 ? -P.spread.userData.length * k : -P.spread.userData.length - 0.05;
      P.reedEdge.set(vector(1, 0, 0), -edge).applyMatrix4(P.spread.matrixWorld);
    }
  } else if (roll) {
    const w = smooth((t - roll.t0) / (roll.t1 - roll.t0)),
      scale = P.data.opts.scale || 1;
    P.obj.scale.x = scale * (0.04 + 0.96 * w);
    P.obj.position.x += 1.69 * scale * (1 - w);
  }
  if (P.data.type === 'thin-blanket' && P.variants?.draped) {
    const k = Math.max(0, Math.min(1, propBend(P.data.bend, t, P.data.opts.bend ?? 0) * 2 - 1));
    const drape = P.variants.draped;
    drape.scale.set(0.44 + 0.56 * k, 0.34 + 0.66 * k, 0.32 + 0.68 * k);
    drape.position.y = (1 - k) * 0.22;
  }
  const actions = P.data.gestures?.filter((g) => g.name.startsWith('bounce-'));
  if (!actions?.length) return;
  if (!P.cushions) {
    P.cushions = {};
    P.obj.traverse((o) => {
      const n = o.userData?.name || o.name;
      if (/^pillow\d+$/.test(n)) P.cushions[n] = { o, y: o.position.y };
    });
  }
  for (const [name, c] of Object.entries(P.cushions)) {
    let dy = 0;
    for (const g of actions) {
      if (name !== 'pillow' + g.name.slice(7) || t < g.t0 || t > g.t1) continue;
      dy = 0.35 * Math.sin((Math.PI * (t - g.t0)) / (g.t1 - g.t0));
    }
    c.o.position.y = c.y + dy;
  }
}
