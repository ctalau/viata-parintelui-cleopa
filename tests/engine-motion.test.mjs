import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Sleeve } from '../lib/engine/sleeve.js';
import { Stage } from '../lib/engine/stage.js';
import { buildVolume, HAND_PER_CM, handOf, handRig, projectRig } from '../lib/engine/palm25d.js';
import { handState } from '../lib/engine/hand.js';
import { drawingFrame } from '../lib/engine/tracks.js';

const json = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url)));
const episode = json('../episodes/001-painea-care-poate-sa-astepte/episode.json');
const stage = new Stage({});
stage.props = { paine: { spec: episode.props.paine } };

function actorWith(spec) {
  const actor = { spec, p: json(`../assets/characters/${spec.character}.json`).profile };
  actor.tracks = stage.compileArms(actor);
  return actor;
}

test('un desen pe cadru în episodul 1, cadența pe doi repornește la tăietură în descriptorii vechi', () => {
  for (const f of [420, 421, 422, 423, 1170, 1171]) assert.equal(drawingFrame(episode, f), f);
  const legacy = { shots: [{ at: 1 }, { at: 6 }] };
  assert.deepEqual([4, 5, 6, 7, 8].map((f) => drawingFrame(legacy, f)), [3, 5, 6, 6, 8]);
});

test('viteza este nulă în repaus și continuă printr-o cheie comună a două gesturi', () => {
  const rest = [-0.58, -0.09], mid = [-0.89, 0.23], far = [-1.2, 0.55], dir = [-0.9, -0.3];
  const actor = actorWith({ character: 'costica', arms: [
    { side: 'R', keys: [[1, rest, dir], [25, mid, dir]] },
    { side: 'R', keys: [[25, mid, dir], [49, far, dir], [60, far, dir]] },
  ] });
  const wrist = (f) => actor.tracks.R.motion.at(f).points.W;
  const velocity = (f, dt) => wrist(f + dt).map((v, i) => (v - wrist(f)[i]) / dt);
  const h = 0.01;
  assert.ok(Math.hypot(...velocity(1, h)) < 1e-5);
  assert.ok(Math.hypot(...velocity(49, -h)) < 1e-5);
  const left = velocity(25, -h), right = velocity(25, h);
  assert.ok(Math.hypot(...left) > 0.001);
  assert.ok(Math.hypot(...left.map((v, i) => v - right[i])) < 1e-5);
});

test('Mama lasă tava, deschide palma și o retrage fără inversarea rotației la manșetă', () => {
  const spec = episode.cast['mama-bucatarie'];
  const actor = actorWith({ ...spec, arms: spec.arms.filter((a) => a.side === 'L'),
    contacts: spec.contacts.filter((c) => c.side === 'L') });
  const quaternion = (f) => {
    const arm = stage.armAt(actor, 'L', f);
    const angle = arm.rot.reduce((sum, value) => sum + value, 0);
    return handState('L', [Math.sin(angle), -Math.cos(angle)], arm.elevation, arm.hand).q;
  };
  let prev = quaternion(1165);
  for (let f = 1166; f <= 1356; f++) {
    const q = quaternion(f);
    const dot = q.reduce((sum, v, i) => sum + v * prev[i], 0);
    const turn = 2 * Math.acos(Math.min(1, Math.abs(dot)));
    assert.ok(turn < Math.PI / 6, `palma la cadrul ${f}`);
    prev = q;
  }
  const retragere = quaternion(1349);
  quaternion(1176);
  assert.deepEqual(quaternion(1349), retragere);
});

test('Mama oferă pâinea cu cotul jos și cu fața palmară lizibilă până la retragere', () => {
  const spec = episode.cast['mama-bucatarie'];
  const actor = actorWith({ ...spec, contacts: spec.contacts.filter((c) => c.side === 'L') });
  for (let f = 1234; f <= 1318; f++) {
    const { arm, hand, parts } = drawingAt(actor, 'L', f);
    const { S, E, W } = arm.points;
    assert.ok(Math.abs(E[0] - S[0]) < 0.18 * actor.p.upper && W[1] > E[1], `cot la ${f}`);
    assert.ok(-hand.axes.z[1] > 0.75 && -hand.axes.z[2] > 0.30);
    assert.ok(parts.every((g) => g.details.every((d) => d.t !== 'nail')), `unghie la ${f}`);
  }
});

test('Costică duce cotul spre pâine și rotește antebrațul păstrând lungimile segmentelor', () => {
  const actor = actorWith(episode.cast['costica-bucatarie']);
  const length = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));
  let previous = Infinity;
  for (let f = 1508; f <= 1589; f++) {
    const { arm, parts } = drawingAt(actor, 'R', f);
    const { S, E, W } = arm.points;
    assert.ok(Math.abs(length(S, E) - actor.p.upper) < 1e-6);
    assert.ok(Math.abs(length(E, W) - actor.p.lower) < 1e-6);
    assert.ok(arm.elevation <= previous + 0.0001);
    previous = arm.elevation;
    const palm = parts.find((g) => g.id === 'palm');
    assert.ok(palm.shapes.some((s) => s.piece === 'mare1'));
    assert.ok(palm.details.every((d) => d.t !== 'line'));
  }
  const first = stage.armAt(actor, 'R', 1508), last = stage.armAt(actor, 'R', 1589);
  assert.ok(first.elevation - last.elevation > 0.4);
  assert.ok(first.points.E[0] - last.points.E[0] > actor.p.upper * 0.2);
  assert.ok(first.len[1] > 0.72 && last.len[1] > 0.94);
});

function drawingAt(actor, side, f) {
  const arm = stage.armAt(actor, side, f);
  const angle = arm.rot.reduce((sum, value) => sum + value, 0);
  const state = handState(side, [Math.sin(angle), -Math.cos(angle)], arm.elevation, arm.hand);
  const hand = projectRig(handRig(actor.p, side, arm.points.W, state.q, state.g), side);
  hand.k = HAND_PER_CM * actor.p.hand;
  const { groups } = buildVolume(hand, { hand: handOf(actor.p), lw: 0.029 * actor.p.hand });
  return { arm, hand, parts: groups };
}

test('calota mânecii rămâne prinsă de bust, iar cusătura manșetei se curbează în perspectivă', () => {
  const bones = { 'upper_arm.R': { head: [0, 0] }, 'forearm.R': { head: [0, -1] }, 'hand.R': { head: [0, -2] } };
  const cloth = new Float32Array([0, 0.1, 0, 0, -0.8, 0, -0.12, -2, 0, 0, -2, 0, 0.12, -2, 0]);
  const sleeve = new Sleeve(cloth, Uint8Array.from([1, 1, 0, 0, 0]), 'R', bones);
  for (const a of [-0.6, -0.2, 0, 0.2, 0.6]) {
    const c = Math.cos(a), s = Math.sin(a);
    const matrix = [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const draw = (tilt) => sleeve.drawing(matrix, matrix, [0, 0], [s, -c], [2 * s, -2 * c], 0, null, 0, tilt);
    const flat = draw(0).slice(), turned = draw(Math.PI / 3);
    assert.ok(Math.hypot(flat[0], flat[1] - 0.1) < 1e-6);
    assert.ok(Math.hypot(flat[3] - 0.8 * s, flat[4] + 0.8 * c) < 1e-6);
    assert.deepEqual(flat.slice(6, 9), turned.slice(6, 9));
    assert.ok((turned[9] - flat[9]) * s - (turned[10] - flat[10]) * c > 0.06);
    assert.deepEqual(flat.slice(12), turned.slice(12));
  }
});

test('mâna accelerează și frânează o singură dată între repaus și țintă în scena cu pâinea', () => {
  for (const [id, side, first, last] of [
    ['mama-bucatarie', 'L', 1216, 1232], ['costica-bucatarie', 'R', 1365, 1381],
    ['costica-bucatarie', 'R', 1519, 1532],
  ]) {
    const spec = episode.cast[id];
    const actor = actorWith({ ...spec, contacts: spec.contacts?.filter((c) => c.side === side) });
    const wrist = (f) => stage.armAt(actor, side, f).points.W;
    const speed = [];
    let prev = wrist(first);
    for (let f = first + 1; f <= last; f++) {
      const w = wrist(f);
      speed.push(Math.hypot(w[0] - prev[0], w[1] - prev[1]));
      prev = w;
    }
    const peak = Math.max(...speed), i = speed.indexOf(peak);
    assert.ok(i > speed.length * 0.25 && i < speed.length * 0.55);
    assert.ok(speed[0] < peak * 0.08 && speed.at(-1) < peak * 0.04);
    for (let k = 1; k < speed.length; k++) {
      assert.ok(k <= i ? speed[k] >= speed[k - 1] : speed[k] <= speed[k - 1], `${id} la ${first + k}`);
    }
    assert.deepEqual(wrist(first - 1), wrist(first));
    assert.deepEqual(wrist(last + 1), wrist(last));
  }
});
