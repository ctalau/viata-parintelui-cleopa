// The yarn elder's head (lib/engine3/yarnhead.js): on the toy body, a pure function of the pose (the beard is draped
// from scratch: the same pose gives the same bones whatever was posed before), and the beard stays in front of the chest.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { loadMonk, ROOT } from './engine3-lib.mjs';
import { parseGLB } from '../lib/engine3/assets.js';
import { Character } from '../lib/engine3/character.js';

async function yarnChar() {
  const asset = await loadMonk();
  const b = fs.readFileSync(path.join(ROOT, 'assets/characters/yarn-elder.glb'));
  asset.yarn ||= await parseGLB(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  return { asset, c: new Character(asset, { preset: 'elder', head: 'yarn', cloak: 'mantle' }, { faces: false }) };
}
const snap = (c) => c.yarn.order.map((b) => b.matrixWorld.elements.map((v) => v.toFixed(5)).join(',')).join(';');

test('yarn head: the toy head is hidden, the yarn one shown', async () => {
  const { c } = await yarnChar();
  assert.ok(c.yarn && c.yarn.on);
  assert.equal(c.parts.head.visible, false);
  assert.equal(c.look.beard, 'long');
});

test('yarn head: a pure function of the pose', async () => {
  const { asset, c } = await yarnChar();
  const face = { expr: 'warm', blink: 0, mouth: 0.6, talk: true };
  const at = (clip, t) => c.pose([{ clip, t, w: 1 }], { face });
  at('bless', 1.0); const a = snap(c);
  at('bow', 1.2); at('cross', 1.5);
  at('bless', 1.0); assert.equal(snap(c), a);
  assert.ok(asset.clips.bless);
});

test('yarn head: the beard hangs in front of the chest while bowing', async () => {
  const { c } = await yarnChar();
  c.pose([{ clip: 'bow', t: 1.2, w: 1 }], { face: { expr: 'neutral' } });
  const inv = new THREE.Matrix4().copy(c.root.matrixWorld).invert();
  let lo = Infinity;
  for (const s of c.yarn.strands) {
    if (s.side) continue;
    const tip = s.bs.at(-1).getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    assert.ok(Number.isFinite(tip.x + tip.y + tip.z));
    lo = Math.min(lo, tip.z);
  }
  assert.ok(lo > 0.3, `a lock's tip went into the chest (z ${lo.toFixed(2)})`);
});
