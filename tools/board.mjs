// Design board: picture variants of the characters and the set BEFORE filming.
//   npm run board -- videos/<id>            → videos/<id>/design/board-vN.jpg (N = next free number) + prints the path
//
// Reads videos/<id>/design/board.json:
//   { "title": "…", "columns": 3,
//     "characters": { … extra / variant characters, merged over the film's characters … },
//     "shots": [ { "label": "Lavra dimineața", "set": {…}, "sky": "morning", "cast": {…}, "props": {…},
//                  "camera": {…}, "do": [ …actions… ], "at": 1.0 } ] }
// Each shot becomes a one-beat scene of the film's engine (2D or 3D) and is rendered at `at` seconds (default 1.2).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, resolveVideoDir, loadPlaywright, ROOT } from './lib/common.mjs';
import { serve } from './serve.mjs';

const args = parseArgs();
const dir = resolveVideoDir(args._[0]);
const rel = path.relative(ROOT, dir);
const ddir = path.join(dir, 'design');
const board = JSON.parse(fs.readFileSync(path.join(ddir, 'board.json'), 'utf8'));
const film = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));

const desc = {
  id: film.id + '-board', title: board.title || film.title, engine: film.engine, style: film.style, captions: false, music: false,
  format: { width: 1920, height: 1080, fps: 30 },
  characters: { ...film.characters, ...(board.characters || {}) },
  scenes: board.shots.map((s, i) => ({
    id: `shot${i + 1}`, set: s.set || film.scenes[0].set, sky: s.sky || 'day', cast: s.cast || {}, props: s.props || {},
    camera: s.camera || { shot: 'wide' }, transition: 'cut', lead: 0, tail: 0,
    beats: [{ duration: Math.max(3, (s.at ?? 1.2) + 1), do: s.do || [] }],
  })),
};
fs.writeFileSync(path.join(ddir, '_board.json'), JSON.stringify(desc));

const times = []; { let t = 0; for (const s of board.shots) { times.push(t + (s.at ?? 1.2)); t += Math.max(3, (s.at ?? 1.2) + 1); } }
const labels = board.shots.map((s, i) => `${i + 1}. ${s.label || ''}`);
const cols = board.columns || 3;

const { chromium } = loadPlaywright();
const { server, port } = await serve(0);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto(`http://127.0.0.1:${port}/lib/engine/render.html?video=${rel}/design&file=_board.json&scale=0.5`);
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
const err = await page.evaluate(() => window.__error);
if (err) throw new Error(err);
const data = await page.evaluate(async ([times, labels, cols, title]) => {
  const st = window.__stage, w = st.W, h = st.H, pad = 16, lab = 44, head = 70;
  const rows = Math.ceil(times.length / cols);
  const c = document.createElement('canvas'); c.width = cols * (w + pad) + pad; c.height = head + rows * (h + lab + pad) + pad;
  const g = c.getContext('2d');
  g.fillStyle = '#f7efe2'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#4a3528'; g.font = '600 38px Fredoka, sans-serif'; g.fillText(title, pad, 50);
  times.forEach((t, i) => {
    st.renderAt(t);
    const x = pad + (i % cols) * (w + pad), y = head + Math.floor(i / cols) * (h + lab + pad);
    g.drawImage(st.out, x, y);
    g.strokeStyle = '#4a3528'; g.lineWidth = 3; g.strokeRect(x, y, w, h);
    g.fillStyle = '#4a3528'; g.font = '600 26px Fredoka, sans-serif'; g.fillText(labels[i], x + 4, y + h + 32);
  });
  return c.toDataURL('image/jpeg', 0.88);
}, [times, labels, cols, board.title || film.title]);
await browser.close(); server.close();
fs.rmSync(path.join(ddir, '_board.json'));
let n = 1; while (fs.existsSync(path.join(ddir, `board-v${n}.jpg`))) n++;
const out = path.join(ddir, `board-v${n}.jpg`);
fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
console.log(`Board → ${path.relative(ROOT, out)} (${board.shots.length} shots, ${Math.round(fs.statSync(out).size / 1024)} KB)`);
