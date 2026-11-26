// The printed face must be upright: eyes ABOVE the mouth on the rendered head (glTF V runs downward, so the face
// canvas texture must not be flipped — the bug that put the faces upside down).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Vector3 } from 'three';
import { parseGLB } from '../lib/engine3/assets.js';
import { Character } from '../lib/engine3/character.js';
import { ROOT, readGLBJson, loadMonk } from './engine3-lib.mjs';

test('head UVs: v grows downward (top of the head = small v)', () => {
  const { json, bin } = readGLBJson(path.join(ROOT, 'assets/characters/monk.glb'));
  const mesh = json.meshes.find((m) => m.name === 'head' || m.name.startsWith('head'));
  const faceMat = json.materials.findIndex((m) => m.name === 'face');
  const prim = mesh.primitives.find((p) => p.material === faceMat);
  assert.ok(prim, 'head has a face primitive');
  const acc = (i) => { const a = json.accessors[i], bv = json.bufferViews[a.bufferView]; const n = { VEC3: 3, VEC2: 2 }[a.type]; return { n, a, data: new Float32Array(bin.buffer, bin.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0), a.count * n) }; };
  const P = acc(prim.attributes.POSITION), U = acc(prim.attributes.TEXCOORD_0);
  let top = null, bottom = null;
  for (let i = 0; i < P.a.count; i++) {
    const y = P.data[i * 3 + 1], v = U.data[i * 2 + 1];
    if (!top || y > top.y) top = { y, v };
    if (!bottom || y < bottom.y) bottom = { y, v };
  }
  assert.ok(top.v < bottom.v, `top of head v=${top.v} should be < chin v=${bottom.v}`);
});

test('face canvas: eyes are drawn above the mouth, and the texture is not flipped', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib/engine3/face.js'), 'utf8');
  const eye = +/const eyeY = ([\d.]+)/.exec(src)[1];
  const myExpr = /my = PY\(([^)]*)\)/.exec(src)[1];          // a number or a ternary of numbers
  const mouths = (myExpr.match(/\d+\.\d+/g) || []).map(Number);
  assert.ok(mouths.length, `mouth line found in: ${myExpr}`);
  for (const mouth of mouths) assert.ok(eye > mouth + 0.15, `eye line ${eye} above mouth ${mouth}`);
  const ch = fs.readFileSync(path.join(ROOT, 'lib/engine3/character.js'), 'utf8');
  assert.match(ch, /faceTex\.flipY = false/);
});

test('053 uses the common rig and the younger portrait has black eyes', async () => {
  const asset = await loadMonk();
  const { buf } = readGLBJson(path.join(ROOT, 'assets/characters/nodul-albastru.glb'));
  const { scene } = await parseGLB(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  asset.portraitHeads = new Map(scene.children.map((head) => [head.userData.portraitVariant, head]));
  assert.equal(asset.portraitHeads.size, 3);
  for (const head of asset.portraitHeads.values()) {
    const hair = head.children.find((obj) => obj.userData.name?.startsWith('Păr la ceafă · acoperire continuă'));
    assert.ok(hair?.isMesh);
    hair.geometry.computeBoundingBox();
    assert.ok(hair.geometry.boundingBox.min.y < 2.13, 'hair reaches below the base of the head');
  }

  const brother = new Character(asset, { preset: 'frate-tanar-053' }, { faces: false });
  const eyes = brother.portrait.morphs.filter((eye) => eye.material.name === 'Ochii fratelui · negru');
  assert.equal(eyes.length, 2);
  for (const eye of eyes) {
    const pigment = eye.geometry.getAttribute('color');
    for (let i = 0; i < pigment.count; i++) {
      assert.ok(Math.max(pigment.getX(i), pigment.getY(i), pigment.getZ(i)) < .03);
    }
  }
  brother.pose([], { face: { blink: 1 } });
  assert.equal(eyes[0].morphTargetInfluences[eyes[0].morphTargetDictionary.Clipit], 1);
  brother.pose([], { face: null });
  assert.equal(eyes[0].morphTargetInfluences[eyes[0].morphTargetDictionary.Clipit], 0);
  const middle = new Character(asset, { preset: 'calugar-barba-ascutita' }, { faces: false });
  assert.equal(middle.portrait.root.parent, middle.bones.head);
  assert.equal(middle.parts.hat_kamilavka.visible, false);
  const hat = middle.portrait.root.children.find((object) => object.userData.portraitHat === 'kamilavka');
  assert.ok(hat?.visible);
  const crown = hat.geometry.getAttribute('position');
  hat.geometry.computeBoundingBox();
  const { min, max } = hat.geometry.boundingBox;
  let bottom = 0, top = 0;
  for (let i = 0; i < crown.count; i++) {
    const y = crown.getY(i), halfWidth = Math.abs(crown.getX(i));
    if (y < min.y + .05) bottom = Math.max(bottom, halfWidth);
    if (y > max.y - .05) top = Math.max(top, halfWidth);
  }
  assert.ok(bottom > 0 && top > bottom * 1.25);

  const veil = middle.portrait.veil;
  assert.ok(veil?.isSkinnedMesh);
  assert.deepEqual(veil.skeleton.bones, [middle.bones.head, middle.bones.chest]);
  const weights = veil.geometry.getAttribute('_veil_head');
  const seam = weights.array.findIndex((weight) => weight === 1);
  const hem = weights.array.findIndex((weight) => weight === 0);
  assert.ok(seam >= 0 && hem >= 0 && weights.array.some((weight) => weight > 0 && weight < 1));
  const worldVertex = (mesh, i) => mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld);
  const point = (i) => worldVertex(veil, i);
  middle.pose([]);
  const seamRest = point(seam);
  const seamOnHead = middle.bones.head.worldToLocal(seamRest.clone());
  const hemRest = point(hem);
  const hemOnChest = middle.bones.chest.worldToLocal(hemRest.clone());
  for (const x of [-5, 5]) {
    middle.pose([], { lookAt: new Vector3(x, 3.45, 2.4) });
    assert.ok(point(seam).distanceTo(seamRest) > .35);
    assert.ok(point(seam).distanceTo(middle.bones.head.localToWorld(seamOnHead.clone())) < .00001);
    assert.ok(point(hem).distanceTo(hemRest) < .00001);
  }
  middle.pose([{ clip: 'bow', t: asset.clips.bow.duration / 2, w: 1 }]);
  assert.ok(point(hem).distanceTo(middle.bones.chest.localToWorld(hemOnChest)) < .00001);
  middle.pose([]);
  assert.ok(point(seam).distanceTo(seamRest) < .00001);

  const beard = middle.portrait.beard.getObjectByProperty('isSkinnedMesh', true);
  assert.deepEqual(beard.skeleton.bones, [middle.bones.head, middle.portrait.beard]);
  const beardWeights = beard.geometry.getAttribute('_beard_head').array;
  const faceRoot = beardWeights.findIndex((weight) => weight === 1);
  const beardTip = beardWeights.findIndex((weight) => weight === 0);
  assert.ok(faceRoot >= 0 && beardTip >= 0);
  const headSpace = (i) => middle.bones.head.worldToLocal(worldVertex(beard, i));
  const rootBefore = headSpace(faceRoot), tipBefore = headSpace(beardTip);
  middle.pose([], { lookAt: new Vector3(0, .5, 3) });
  assert.ok(headSpace(faceRoot).distanceTo(rootBefore) < .00001);
  assert.ok(headSpace(beardTip).distanceTo(tipBefore) > .03);

  middle.setLook({ preset: 'calugar-barba-ascutita', hat: 'none' });
  assert.equal(middle.portrait.root.children.find((object) => object.userData.portraitHat).visible, false);
  assert.equal(middle.portrait.root.children.find((object) => object.userData.portraitVeil).visible, false);
  brother.setLook({ preset: 'monk' });
  assert.equal(brother.portrait, null);
  assert.ok(brother.parts.head.children.every((mesh) => !mesh.isMesh || mesh.material.visible));
});
