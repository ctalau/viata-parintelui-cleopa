import assert from 'node:assert/strict';
import { test } from 'node:test';
import { episode } from '../studio/episode.mjs';
import { bodyLimit, pathFor, receiveFeedback } from '../studio/feedback.mjs';

const valid = { episode: episode.id, time: 12.345, message: '  Mâna de lângă carte. ' };
const request = (body, options = {}) => ({
  method: 'POST', headers: { 'content-type': 'application/json' }, body: [JSON.stringify(body)], ...options,
});

test('feedback saves episode and precise timestamp using a private key', async () => {
  const notes = [];
  const [status, result] = await receiveFeedback(request(valid), async (note) => notes.push(note));
  assert.equal(status, 201);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].message, valid.message.trim());
  assert.equal(notes[0].episode, valid.episode);
  assert.equal(notes[0].time, 12.35);
  assert.deepEqual(result, { id: notes[0].id });
  assert.match(pathFor(result.id), /^feedback\/[a-f0-9-]+\.json$/);
});

test('invalid feedback is rejected without touching storage', async () => {
  const save = () => assert.fail('Unexpected storage write');
  const requests = [
    [request({ ...valid, time: episode.duration + 1 }), 422],
    [request({ ...valid, message: '   ' }), 422],
    [request({ ...valid, website: 'spam' }), 422],
    [request({}, { method: 'GET' }), 405],
    [request({}, { headers: {} }), 415],
    [request({}, { body: ['{'] }), 400],
    [request({}, { body: ['X'.repeat(bodyLimit + 1)] }), 413],
  ];
  for (const [candidate, expected] of requests) {
    const [code] = await receiveFeedback(candidate, save);
    assert.equal(code, expected);
  }
});
