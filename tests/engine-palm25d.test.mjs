// Palmele C din motor (lib/engine/palm25d.js) dau aceleași piese, în aceeași ordine, ca palme25d.py.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { armPoints, defaultDepth } from '../lib/engine/arm25d.js';
import { buildVolume, GESTURES, handOf, handRig, HAND_PER_CM, orientation, POSE_GESTURE, projectRig } from '../lib/engine/palm25d.js';

const cases = JSON.parse(readFileSync(new URL('./fixtures/engine/palm25d.json', import.meta.url)));
const close = (a, b, where) => {
  if (Array.isArray(b)) { assert.equal(a.length, b.length, where); b.forEach((v, i) => close(a[i], v, `${where}[${i}]`)); return; }
  assert.ok(Math.abs(a - b) < 1e-6, `${where}: ${a} ≠ ${b}`);
};

test('palma C: proxy, proiecție și piese ca în Python', () => {
  for (const c of cases) {
    const p = JSON.parse(readFileSync(new URL(`../assets/characters/${c.id}.json`, import.meta.url))).profile;
    const depth = defaultDepth(p, c.side, c.wrist);
    const arm = armPoints(p, c.side, c.wrist, depth);
    close(arm.W, c.W, `${c.id} W`);
    const q = orientation(c.dir, c.palm, c.side);
    const rig = handRig(p, c.side, arm.W, q, GESTURES[POSE_GESTURE[c.pose]]);
    const h = projectRig(rig, c.side);
    h.k = HAND_PER_CM * p.hand;
    const built = buildVolume(h, { hand: handOf(p), lw: 0.029 * p.hand });
    assert.equal(built.order, c.order, `${c.id} ${c.pose}`);
    built.groups.forEach((g, i) => {
      const ref = c.groups[i];
      assert.equal(g.fill ?? null, ref.fill ?? null, `${c.id} ${g.id} fill`);
      assert.deepEqual(g.details.map((d) => d.t), ref.details, `${c.id} ${g.id} details`);
      g.shapes.forEach((s, k) => close(s.pts ?? [s.a, s.b, s.ra, s.rb], ref.shapes[k], `${c.id} ${g.id} shape ${k}`));
    });
  }
});
