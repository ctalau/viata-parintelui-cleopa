// Set colliders exported from Blender share ONE index buffer (identical boxes). A BVH built the default way reorders the
// index in place, so building the second collider's BVH scrambled the first one's: depths read after that were wrong, and
// only the first sample of a check chunk was measured right (046 failed the publish gate on whichever sample came first).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { colliderTarget, depthIn } from '../lib/engine3/collide.js';

test('colliders sharing an index buffer keep their own depths', () => {
  const box = new THREE.BoxGeometry(2, 1, 2);
  const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', box.attributes.position.clone()); g2.setIndex(box.index);
  const g3 = new THREE.BufferGeometry(); g3.setAttribute('position', box.attributes.position.clone().applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2).multiply(new THREE.Matrix4().makeScale(1, 6, 0.2)))); g3.setIndex(box.index); // SAME index
  const m1 = new THREE.Mesh(g2), m2 = new THREE.Mesh(g3);
  const p = new THREE.Vector3(0, 0.3, 0.7); // 0.2 under the top face, 0.3 behind the front face
  const T1 = colliderTarget(m1);
  const before = depthIn(T1, p.clone(), 0.6);
  colliderTarget(m2); // builds the second BVH on the shared index
  assert.ok(Math.abs(before - 0.2) < 1e-6, `depth ${before}`);
  assert.equal(depthIn(T1, p.clone(), 0.6), before);
});
