// The brick joints of a terracotta pot (grainJar, jug) lie on the wall. Vertical boxes on the narrowing shoulder stuck out
// above it like spikes (039).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { brickCourses } from '../lib/components/props.js';

const radiusAt = (P, y) => { for (let i = 1; i < P.length; i++) if (y <= P[i][1]) { const [x0, y0] = P[i - 1], [x1, y1] = P[i]; return x0 + (x1 - x0) * (y - y0) / Math.max(1e-6, y1 - y0); } return P.at(-1)[0]; };

for (const [name, P, o] of [
  ['grainJar', [[0, 0], [0.42, 0], [0.6, 0.22], [0.66, 0.62], [0.55, 0.98], [0.38, 1.14], [0.36, 1.22], [0.44, 1.3]], { y0: 0.06, y1: 1.08, n: 6, joints: 10 }],
  ['jug', [[0, 0], [0.32, 0], [0.45, 0.25], [0.48, 0.6], [0.36, 0.95], [0.2, 1.05], [0.2, 1.25], [0.27, 1.32]], { y0: 0.04, y1: 0.98, n: 5, joints: 8 }],
]) {
  test(`${name}: brick joints hug the wall (no spikes)`, () => {
    const g = new THREE.Group(); brickCourses(g, P, o); g.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    for (const m of g.children) {
      if (!(m.geometry instanceof THREE.BoxGeometry)) continue; // the joints (the rings are tori)
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        const out = Math.hypot(v.x, v.z) - radiusAt(P, v.y);
        assert.ok(out < 0.06, `${name}: a joint corner sticks out ${out.toFixed(3)} at y=${v.y.toFixed(2)}`);
        assert.ok(v.y <= o.y1 + 0.02 && v.y >= o.y0 - 0.02, `${name}: a joint leaves the brick band at y=${v.y.toFixed(2)}`);
      }
    }
  });
}
