// FK-ul motorului (lib/engine/character.js) reproduce poza oaselor din Blender (rigul seriei).
// Fixture: experiments/… actor("mother") cu poza de mai jos, citit din pose.bones (head, tail).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { restOf, solveRig } from '../lib/engine/character.js';

test('FK 2D identic cu Blender (inherit_scale, umăr moale)', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/engine/fk-mama.json', import.meta.url)));
  const meta = JSON.parse(readFileSync(new URL(`../assets/characters/${fixture.character}.json`, import.meta.url)));
  const rest = restOf(meta.bones);
  const pose = Object.fromEntries(Object.entries(fixture.pose).map(([k, [rot, len]]) => [k, { rot, len }]));
  const world = solveRig(rest, Object.keys(rest), pose);
  for (const [name, [head, tail]] of Object.entries(fixture.blender)) {
    for (const [a, b] of [[world[name].head, head], [world[name].tail, tail]]) {
      assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-5, `${name}: ${a} ≠ ${b}`);
    }
  }
});
