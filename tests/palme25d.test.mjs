import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

// The Python port used by Blender (palme25d.py) must give the same numbers as studio/palme/.
test('the Python port matches the /palme/ fixtures to 1e-6', () => {
  const run = spawnSync('python3', ['tests/palme25d_test.py'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr || run.stdout);
});
