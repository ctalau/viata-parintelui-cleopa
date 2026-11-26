// `{ "prop": X, "bend": v }` animates a prop's pose value FROM ITS RESTING VALUE. A sack rests full (1): bend 0.7 must
// empty it a little — 039 once showed the sack and the jar filling together (the animation started from 0).
import test from 'node:test';
import assert from 'node:assert/strict';
import { propBend } from '../lib/engine/timeline.js';
import { bendRest } from '../lib/components/props.js';

test('propBend starts a first segment at the prop rest value', () => {
  const segs = [{ t0: 1, t1: 2, from: null, to: 0.7 }];
  assert.equal(propBend(segs, 0, 1), 1);
  assert.ok(propBend(segs, 1.5, 1) < 1 && propBend(segs, 1.5, 1) > 0.7);
  assert.equal(propBend(segs, 3, 1), 0.7);
  assert.equal(propBend([], 5, 1), 1, 'no animation: the prop stays at rest');
});

test('a sack rests full, an empty sack rests empty', () => {
  assert.equal(bendRest('sack', {}), 1);
  assert.equal(bendRest('sack', { empty: true }), 0);
  assert.equal(bendRest('bird', { back: true }), 1);
  assert.equal(bendRest('grainJar', {}), 0);
});
