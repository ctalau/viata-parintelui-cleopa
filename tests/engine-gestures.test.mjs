import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { GESTURE_NAMES } from '../lib/engine/gestures.js';
import { handState } from '../lib/engine/hand.js';
import { Stage, withGestures } from '../lib/engine/stage.js';

const dir = new URL('../assets/characters/', import.meta.url);
const profiles = readdirSync(dir).filter((name) => name.endsWith('.json'))
  .map((name) => JSON.parse(readFileSync(new URL(name, dir))).profile);
const stage = new Stage({});

function actorWith(p, actions) {
  const actor = { spec: withGestures({ do: actions }, p), p };
  actor.tracks = stage.compileArms(actor);
  return actor;
}

function checkTravel(motion, [from, to], label) {
  let previous = motion.at(from).points.W;
  const speed = [];
  for (let frame = from + 1; frame <= to; frame++) {
    const wrist = motion.at(frame).points.W;
    speed.push(Math.hypot(wrist[0] - previous[0], wrist[1] - previous[1]));
    previous = wrist;
  }
  const peak = Math.max(...speed), i = speed.indexOf(peak);
  assert.ok(peak > 0 && i > 0 && i < speed.length - 1, label);
  assert.ok(speed[0] < peak * 0.20 && speed.at(-1) < peak * 0.10, label);
  for (let k = 1; k < speed.length; k++) {
    const delta = speed[k] - speed[k - 1];
    // The engine measures the curved path. A frame measures its straight chord.
    assert.ok((k <= i ? delta : -delta) >= -peak * 0.01, label);
  }
}

for (const gesture of GESTURE_NAMES) {
  test(`bibliotecă · ${gesture} pe rigurile seriei`, () => {
    for (const p of profiles) for (const side of ['R', 'L']) for (const hold of [undefined, 0]) {
      const actor = actorWith(p, [{ gesture, at: 20, side, hold }]);
      assert.ok(actor.spec.arms.length || actor.spec.head.some(([, pitch, yaw]) => pitch || yaw), gesture);
      for (const clip of actor.spec.arms) {
        const motion = actor.tracks[clip.side].motion;
        const [, [x, y], , z] = clip.keys[0];
        const moves = clip.keys.some(([, wrist, , depth]) => wrist[0] !== x || wrist[1] !== y || depth !== z);
        assert.equal(clip.strokes.length > 0, moves, gesture);
        for (const stroke of clip.strokes) checkTravel(motion, stroke, `${gesture} ${clip.side} ${stroke}`);
        let previous;
        for (let f = clip.keys[0][0]; f <= clip.keys.at(-1)[0] + 1; f++) {
          const arm = stage.armAt(actor, clip.side, f);
          const angle = arm.rot.reduce((sum, a) => sum + a, 0);
          const { q } = handState(clip.side, [Math.sin(angle), -Math.cos(angle)], arm.elevation, arm.hand);
          if (previous) {
            const dot = q.reduce((sum, x, axis) => sum + x * previous[axis], 0);
            const turn = 2 * Math.acos(Math.min(1, Math.abs(dot))) * 180 / Math.PI;
            assert.ok(turn < 35, `${gesture} ${clip.side} la cadrul ${f}: ${turn}°`);
          }
          previous = q;
        }
      }
    }
  });
}

test('pauza prelungește doar ținerea; un gest nou poate porni și dintr-o cursă în desfășurare', () => {
  const p = profiles[0], offer = { gesture: 'offer', side: 'L', at: 20, hold: 40 };
  const base = actorWith(p, [offer]), long = actorWith(p, [{ ...offer, hold: 65 }]);
  const extended = long.spec.arms[0].strokes, normal = base.spec.arms[0].strokes;
  assert.deepEqual(extended[0], normal[0]);
  assert.deepEqual(extended[1], normal[1].map((f) => f + 25));
  const interrupted = actorWith(p, [offer, { gesture: 'reach', side: 'L', at: 28 }]);
  for (let f = 20; f <= 28; f += 0.5) {
    const w = (actor) => actor.tracks.L.motion.at(f).points.W;
    const before = w(base), after = w(interrupted);
    assert.ok(Math.hypot(...after.map((x, i) => x - before[i])) < 1e-9);
  }
});
