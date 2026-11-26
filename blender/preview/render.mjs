#!/usr/bin/env node
// Render stills of a set with lib/engine3/look.js in headless Chromium (software GL).
//   node blender/preview/render.mjs <set> [--sky day,morning] [--shots wide,medium] [--quality final|medium|draft]
//        [--w 1280 --h 720] [--t 0] [--out blender/preview/out] [--no-standins] [--props props.json]
// Writes <out>/<set>-<sky>-<shot>.png and prints the render time per still.
//   node blender/preview/render.mjs <set> --cam '{"on":[-12,1],"dist":4.4,"height":3.1,"angle":0,"world":true,"y":3.3,"fov":32}'
//        → one still from a camera written like a video.json `wide` camera (`on` = [x, z] or an anchor of the set)
//   node blender/preview/render.mjs --film videos/047-x --beat oile#5[,dimineata#12]
//        → a ~1 s preview of a beat's camera in its set and sky, capsules where the cast stands (cast `at` + the last walk
//          before / in that beat): check a framing (an animal hidden in a tree, a figure in front of the subject) without
//          rendering the film. Close / medium shots on an actor are approximated (no look-at-the-head, no "auto" angle).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);
const filmDir = opt('film');
const film = filmDir ? JSON.parse(fs.readFileSync(path.join(path.resolve(filmDir), 'video.json'), 'utf8')) : null;
const setName = film ? null : args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1]?.startsWith('--') !== true) || 'desert-road';
const metaOf = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/sets', n + '.json'), 'utf8'));
const meta = setName ? metaOf(setName) : {};
const D2R = Math.PI / 180;
/** a video.json camera (wide / medium / close, `world`, `angle`, `dist`, `height`, `y`, `fov`) → { pos, target, fov }, like
 *  lib/engine/stage.js shotPose (no moves, no ease); `place(on)` → { p: [x, z], h: heading rad, actor } */
function camPose(s, place) {
  const pl = place(s.on);
  const shot = s.shot || 'wide', base = s.world ? 0 : pl.h;
  const ang = s.angle === 'auto' || s.angle == null ? (shot === 'close' ? 15 : shot === 'medium' ? 22 : 0) : s.angle;
  let dist, height, ty;
  if (shot === 'close') { dist = s.dist ?? 4.4; height = s.height ?? 0.25; ty = 3.55 + (s.y ?? 0); }
  else if (shot === 'medium') { dist = s.dist ?? 9.5; height = s.height ?? 2.2; ty = s.y ?? 2.5; }
  else { dist = s.dist ?? 24; height = s.height ?? 9; ty = s.y ?? 2.5; }
  const dir = base + ang * D2R;
  const target = [pl.p[0], ty, pl.p[1]];
  return { pos: [target[0] + Math.sin(dir) * dist, ty + height, target[2] + Math.cos(dir) * dist], target, fov: s.fov || 40 };
}
function anchorPlace(M, on) {
  if (Array.isArray(on)) return { p: on, h: 0 };
  const m = /^([^+]+)(?:\+(-?[\d.]+),(-?[\d.]+))?$/.exec(on || '');
  const a = m && M.anchors?.[m[1]];
  if (!a) return { p: [0, 0], h: 0 };
  const h = (a.face || 0) * D2R, dx = +(m[2] || 0), dz = +(m[3] || 0);
  return { p: [a.pos[0] + dx * Math.cos(h) + dz * Math.sin(h), a.pos[2] - dx * Math.sin(h) + dz * Math.cos(h)], h };
}
/** where everyone of a scene stands at the end of beat `bi` (cast `at`, then the walks / turns / shows up to it) */
function sceneState(sc, M, bi) {
  const st = {};
  for (const [id, c] of Object.entries(sc.cast || {})) {
    const pl = anchorPlace(M, c.at);
    st[id] = { p: pl.p, h: typeof c.face === 'number' ? c.face * D2R : pl.h, vis: c.visible !== false };
  }
  (sc.beats || []).slice(0, bi + 1).forEach((b) => {
    for (const a of [].concat(b.do || [])) {
      const S = st[a.actor]; if (!S) continue;
      if (a.walk && (Array.isArray(a.walk) || typeof a.walk === 'string') && !st[a.walk]) {
        const to = anchorPlace(M, a.walk).p; S.h = Math.atan2(to[0] - S.p[0], to[1] - S.p[1]); S.p = to;
      }
      if (typeof a.face === 'number') S.h = a.face * D2R;
      else if (typeof a.face === 'string' && st[a.face]) S.h = Math.atan2(st[a.face].p[0] - S.p[0], st[a.face].p[1] - S.p[1]);
      if (a.show != null) S.vis = !!a.show;
      if (a.place) S.p = anchorPlace(M, a.place).p;
    }
  });
  return st;
}
const skies = (opt('sky') || (meta.skies || ['day']).join(',')).split(',');
const shots = (opt('shots') || Object.keys(meta.shots || {}).join(',')).split(',');
const W = +opt('w', 1280), H = +opt('h', 720), quality = opt('quality', 'final'), t = +opt('t', 0);
const out = path.resolve(opt('out', path.join(ROOT, 'blender/preview/out')));
const props = opt('props') ? JSON.parse(fs.readFileSync(opt('props'), 'utf8')) : (meta.previewProps || []);
fs.mkdirSync(out, { recursive: true });

function threeDir() {
  const c = [process.env.THREE_DIR, path.join(ROOT, 'node_modules/three')].filter(Boolean);
  for (const d of c) if (fs.existsSync(path.join(d, 'build/three.module.js'))) return d;
  try { return path.dirname(path.dirname(require.resolve('three'))); } catch { /* */ }
  throw new Error('three.js not found: npm ci in the repo, or set THREE_DIR');
}
const THREE_DIR = threeDir();
const MIME = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split('?')[0]);
  const f = u.startsWith('/three/') ? path.join(THREE_DIR, u.slice(7)) : path.join(ROOT, u);
  fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const { chromium } = require('playwright');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('  [page]', m.text().slice(0, 300)); });
page.on('pageerror', (e) => console.log('  [pageerror]', e.message));
await page.goto(`http://localhost:${port}/blender/preview/index.html`);
await page.waitForFunction(() => window.preview);
if (film || opt('cam')) {
  const jobs = [];
  if (film) for (const ref of (opt('beat') || '').split(',').filter(Boolean)) {
    const [sid, n] = ref.split('#'), sc = film.scenes.find((x) => x.id === sid);
    if (!sc) { console.log(`  ✗ no scene ${sid}`); continue; }
    const bi = n == null ? 0 : +n, M = metaOf(sc.set.type), st = sceneState(sc, M, bi);
    let spec = sc.camera || { shot: 'wide' };
    sc.beats.slice(0, bi + 1).forEach((b) => { if (b.camera) spec = b.camera; });
    const place = (on) => (st[on] ? { p: st[on].p, h: st[on].h } : anchorPlace(M, on));
    const stand = Object.values(st).filter((a) => a.vis).map((a) => ({ pos: [a.p[0], 0, a.p[1]], face: a.h / D2R }));
    jobs.push({ set: sc.set.type, sky: sc.sky || 'day', camera: camPose(spec, place), standins: stand, name: `${film.id}-${sid}-${bi}` });
  } else {
    const spec = JSON.parse(opt('cam'));
    jobs.push({ set: setName, sky: skies[0], camera: camPose(spec, (on) => anchorPlace(meta, on)), standins: flag('no-standins') ? false : [], name: `${setName}-cam` });
  }
  for (const j of jobs) {
    const r = await page.evaluate((o) => window.preview.shot(o), { set: j.set, sky: j.sky, camera: j.camera, quality, t, w: W, h: H, standins: j.standins.length ? j.standins : false, props });
    const file = path.join(out, j.name + '.png');
    await page.locator('canvas').screenshot({ path: file });
    console.log(`${path.relative(ROOT, file)}  ${Math.round(r.ms)} ms`);
  }
  await browser.close(); server.close(); process.exit(0);
}
for (const sky of skies) for (const shot of shots) {
  const r = await page.evaluate((o) => window.preview.shot(o), { set: setName, sky, shot, quality, t, w: W, h: H, standins: flag('no-standins') ? false : undefined, props, debug: opt('debug') });
  const file = path.join(out, `${setName}-${sky}-${shot}${opt('debug') ? '-' + opt('debug') : ''}.png`);
  await page.locator('canvas').screenshot({ path: file });
  console.log(`${path.relative(ROOT, file)}  ${Math.round(r.ms)} ms  ${r.info.calls} calls ${r.info.triangles} tris`);
}
await browser.close(); server.close();
