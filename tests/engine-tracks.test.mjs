import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Stage, withGestures } from '../lib/engine/stage.js';
import { smooth } from '../lib/engine/tracks.js';

test('Gestul accelerează din repaus și încetinește până la oprire', () => {
  const keys = [[0, 0], [8, 1]];
  const speeds = Array.from({ length: 8 }, (_, f) => smooth(keys, f + 1) - smooth(keys, f));
  for (let i = 1; i < 4; i++) {
    assert.ok(speeds[i] > speeds[i - 1]);
    assert.ok(speeds[7 - i] > speeds[8 - i]);
  }
  const dt = 0.001;
  assert.ok(smooth(keys, dt) / dt ** 2 < 0.001);
  assert.ok((1 - smooth(keys, 8 - dt)) / dt ** 2 < 0.001);
});

test('Mișcarea trece prin cheia intermediară și rămâne fixă în repaus', () => {
  const keys = [[0, [0, 4]], [2, [1, 3]], [8, [12, 1]], [10, [12, 1]]];
  const dt = 0.001;
  const before = (1 - smooth(keys, 2 - dt)[0]) / dt;
  const after = (smooth(keys, 2 + dt)[0] - 1) / dt;
  assert.ok(before > 0.5 && Math.abs(before - after) < 0.001);

  for (let i = 1; i <= 80; i++) {
    const [x0, y0] = smooth(keys, (i - 1) / 10);
    const [x1, y1] = smooth(keys, i / 10);
    assert.ok(x1 >= x0 && y1 <= y0);
  }
  assert.deepEqual(smooth(keys, 9), [12, 1]);
});

test('Prima schimbare vizibilă a palmei pornește din repaus', () => {
  const stage = new Stage({});
  const actor = { spec: { visible: [1, 20], hands: [[5, 'R', 'open'], [9, 'R', 'rest']] } };
  assert.equal(stage.handAt(actor, 'R', 5).previous.pose, 'rest');
  assert.equal(stage.handAt(actor, 'R', 7).t, 0.5);
  assert.equal(stage.handAt(actor, 'R', 9).previous.pose, 'open');
  actor.spec.visible[0] = 5;
  assert.deepEqual(stage.handAt(actor, 'R', 5), { pose: 'open', palm: undefined });
});

test('Semnul crucii pornește din poziția mâinii sprijinite pe masă', () => {
  const { profile: p } = JSON.parse(readFileSync(new URL('../assets/characters/mama.json', import.meta.url)));
  const spec = withGestures({ do: [
    { gesture: 'tableRest', side: 'R', at: 1, hold: 220 },
    { gesture: 'cross', at: 226 },
  ] }, p);
  const [table, cross] = new Stage({}).compileArms({ spec, p }).R;
  assert.deepEqual(cross.at(226).points.W, table.at(225).points.W);
});
