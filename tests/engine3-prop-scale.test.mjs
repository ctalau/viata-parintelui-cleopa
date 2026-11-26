import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { Stage3 } from '../lib/engine3/stage3.js';

test('a fixed-scale GLB keeps its size and grip when scrubbing across a set-down', () => {
  const stage = Object.create(Stage3.prototype);
  stage.A = { props: { scroll: {} }, propMeta: { scroll: {} } };
  stage.groundY = () => 0;

  const obj = new Group(), grip = new Group();
  grip.position.set(-0.4, 0, 0);
  obj.add(grip);
  const root = new Group(), socket = new Group();
  root.scale.setScalar(1.12);
  socket.position.set(1, 2, 0);
  root.add(socket);
  const B = { actors: { monk: { char: { root, sockets: { 'hand.L': socket } } } } };
  const from = { actor: 'monk', hand: 'L' }, to = { pos: [1.5, 1.4, 0], h: 0 };
  const P = {
    obj, grip, kind: 'front', hinges: [], fixedScale: 0.83,
    data: { type: 'scroll', opts: { scale: 0.83 }, initial: from, moves: [{ from, to, t0: 2, t1: 3, reach: true }], visible: [] },
  };
  const pos = (node) => node.getWorldPosition(new Vector3());
  for (const time of [3.2, 1, 2.4, 2.7, 1, 3.2]) {
    stage.placeProp(B, P, time);
    assert.ok(Math.abs(obj.scale.x - 0.83) < 1e-9);
    if (time === 1) assert.ok(pos(grip).distanceTo(pos(socket)) < 1e-9);
    if (time >= 2.7) assert.deepEqual(obj.position.toArray(), to.pos);
  }
});
