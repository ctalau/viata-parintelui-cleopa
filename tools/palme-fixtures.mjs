// Writes reference numbers from studio/palme/ for the Python port
// (experiments/cleopa-painea/scripts/palme25d.py). One file per stress test:
// projected proxy points, the C pieces with their order, contacts and screenUp.
//   node tools/palme-fixtures.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVolume, projectRig, screenUp } from '../studio/palme/hands.js';
import { FPS, TESTS, camera, contactAt, duration, poseAt, solve } from '../studio/palme/rig.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, 'tests', 'fixtures', 'palme');
// The body framing of /palme/ (renderFrame) and an orbiting camera for the yaw.
const CAMERA = { half: 47, cy: 121, width: 480, height: 600 };
const round = (v) => {
  if (Array.isArray(v)) return v.map(round);
  if (typeof v === 'number') return Number(v.toPrecision(10));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)]));
  return v;
};

const shape = (s) => (s.t === 'poly' ? { t: s.t, pts: s.pts } : { t: s.t, a: s.a, b: s.b, ra: s.ra, rb: s.rb, z: s.z });
const detail = (d) => {
  if (d.t === 'nail') return { t: d.t, c: d.c, angle: d.angle, rx: d.rx, ry: d.ry };
  if (d.t === 'line') return { t: d.t, pts: d.pts };
  return { t: d.t, c: d.c, r: d.r };
};

fs.mkdirSync(OUT, { recursive: true });
for (const test of TESTS) {
  const volume = createVolume();
  const frames = [];
  const count = Math.round(duration(test) * FPS) + 1;
  for (let f = 0; f < count; f += 1) {
    const time = f / FPS;
    const pose = poseAt(test, time);
    const rig = solve(pose);
    const cam = camera({ ...CAMERA, yaw: pose.cam });
    const h = projectRig(rig, cam);
    const built = volume.build(h);
    frames.push(round({
      time, q: pose.q, cam: pose.cam,
      S: h.S, E: h.E, W: h.W, contact: h.contact, miss: rig.miss,
      axes: [h.axes.x, h.axes.y, h.axes.z],
      digits: h.digits.map((d) => d.pts),
      screenUp: screenUp(h.axes),
      target: contactAt(test, time),
      order: built.order,
      groups: built.groups.map((g) => ({
        id: g.id, z: g.z, fill: g.fill ?? null, shapes: g.shapes.map(shape), details: (g.details ?? []).map(detail),
      })),
    }));
  }
  const file = path.join(OUT, `${test.id}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ test: test.id, fps: FPS, camera: CAMERA, frames })}\n`);
  console.log(`${path.relative(ROOT, file)}: ${frames.length} cadre`);
}
