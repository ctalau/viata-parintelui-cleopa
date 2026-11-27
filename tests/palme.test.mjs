import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMesh, buildSubstitution, buildVolume, createSubstitution, normalized, projectRig, screenUp, substitutionLibrary } from '../studio/palme/hands.js';
import { ARM, BODY, FPS, TESTS, camera, contactAt, duration, len, poseAt, rotate, solve, sub } from '../studio/palme/rig.js';

const frames = (t) => Array.from({ length: Math.round(duration(t) * FPS) + 1 }, (_, f) => f / FPS);

test('the proxy arm reaches every pose and keeps its lengths', () => {
  for (const t of TESTS) {
    for (const time of frames(t)) {
      const rig = solve(poseAt(t, time));
      assert.ok(rig.miss < 1e-6, `${t.id} ${time}: brațul nu ajunge la încheietură`);
      assert.ok(Math.abs(len(sub(rig.E, rig.S)) - ARM.upper) < 1e-6);
      assert.ok(Math.abs(len(sub(rig.W, rig.E)) - ARM.fore) < 1e-6);
    }
  }
});

test('the three joined fingers touch forehead, chest, right and left shoulder', () => {
  const cross = TESTS.find((t) => t.id === 'cruce');
  const seen = new Set();
  for (const time of frames(cross)) {
    const target = contactAt(cross, time);
    if (!target) continue;
    seen.add(target);
    assert.ok(len(sub(solve(poseAt(cross, time)).contact, BODY.targets[target])) < 0.1, `${target} la ${time}s`);
  }
  assert.deepEqual([...seen], ['frunte', 'piept', 'umarDrept', 'umarStang']);
});

test('the palm turns: thumb side and palm normal follow the key', () => {
  const twist = TESTS.find((t) => t.id === 'rasucire');
  const front = solve(poseAt(twist, 0.7)), back = solve(poseAt(twist, 2.2));
  assert.ok(front.axes.z[2] < -0.99, 'palma spre cameră');
  assert.ok(back.axes.z[2] > 0.99, 'dosul palmei spre cameră');
  assert.ok(front.axes.x[0] < -0.99, 'degetul mare al mâinii drepte, spre stânga ecranului');
});

test('drawing substitution removes the screen roll and keeps a drawing for two frames', () => {
  assert.equal(substitutionLibrary().length, 72);
  const cam = camera({});
  const h = projectRig(solve(poseAt(TESTS[3], 1)), cam);
  const { psi } = normalized(h.axes);
  const r = (v) => rotate(v, [0, 0, 1], psi);
  assert.ok(Math.abs(Math.sin(screenUp({ x: r(h.axes.x), y: r(h.axes.y), z: r(h.axes.z) }))) < 1e-9);
  const picker = createSubstitution();
  const ids = [];
  for (const t of TESTS) for (const time of frames(t)) ids.push(buildSubstitution(projectRig(solve(poseAt(t, time)), cam), picker).entry);
  for (let i = 2; i < ids.length; i += 1) {
    assert.ok(!(ids[i] !== ids[i - 1] && ids[i - 1] !== ids[i - 2] && ids[i] === ids[i - 2]), `desenul pâlpâie la ${i}`);
  }
});

test('the 2D mesh folds on curled fingers and stays clean on an open hand', () => {
  const cam = camera({});
  const wave = TESTS.find((t) => t.id === 'salut');
  const fist = TESTS.find((t) => t.id === 'pumn');
  assert.equal(buildMesh(projectRig(solve(poseAt(wave, 0.6)), cam)).folds, 0);
  assert.ok(buildMesh(projectRig(solve(poseAt(fist, 1.3)), cam)).folds > 0);
});

test('projected volumes keep the contact point on target in the body framing', () => {
  const cross = TESTS.find((t) => t.id === 'cruce');
  const cam = camera({ half: 47, cy: 121, width: 480, height: 600 });
  const goal = cam.p(BODY.targets.frunte);
  const c = buildVolume(projectRig(solve(poseAt(cross, 1.2)), cam)).contact;
  assert.ok(Math.hypot(c[0] - goal[0], c[1] - goal[1]) < 0.5);
});
