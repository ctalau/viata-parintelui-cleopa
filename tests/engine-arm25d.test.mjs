// Brațele 2.5D din motor (lib/engine/arm25d.js) dau aceleași numere ca palme25d.py.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { defaultDepth, solveArm } from '../lib/engine/arm25d.js';

const cases = JSON.parse(readFileSync(new URL('./fixtures/engine/arm25d.json', import.meta.url)));
const profiles = {};
const profile = (id) => (profiles[id] ??= JSON.parse(readFileSync(new URL(`../assets/characters/${id}.json`, import.meta.url))).profile);

test('IK 2.5D: adâncime, rotații și scurtări ca în Python', () => {
  for (const c of cases) {
    const p = profile(c.id);
    const depth = defaultDepth(p, c.side, c.wrist);
    assert.ok(Math.abs(depth - c.depth) < 1e-6, `${c.id} ${c.side}: adâncime ${depth} ≠ ${c.depth}`);
    const { rotations, scales, pts } = solveArm(p, c.side, c.wrist, Math.atan2(c.dir[0], -c.dir[1]), c.depth);
    [...rotations, ...scales, ...pts.E, ...pts.W].forEach((v, i) => {
      const ref = [...c.rotations, ...c.scales, ...c.E, ...c.W][i];
      assert.ok(Math.abs(v - ref) < 1e-6, `${c.id} ${c.side} [${i}]: ${v} ≠ ${ref}`);
    });
  }
});
