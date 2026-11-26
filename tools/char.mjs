// Character sheets of the blender style (turntables, clip strips, close-ups) rendered with the real runtime.
//   node tools/char.mjs --preset looks|turn|clips|cross|faces  [--clips a,b] [--frames 6] [--out stills/char-x.jpg]
//   node tools/char.mjs --tiles '<json array of tiles>' --cols 4
// Tiles: { look, clip, t, view (camera yaw °), pitch, shot: full|bust|face|hands|low|wide, expr, mouth, label, actors: [...] }
import fs from 'node:fs';
import path from 'node:path';
import { serve } from './serve.mjs';
import { parseArgs, loadPlaywright, ROOT } from './lib/common.mjs';

const args = parseArgs();
const LOOKS = {
  siluan: { preset: 'elder', robe: '#4a3426', legs: '#3b2a20', hatColor: '#2a1e17', cloakColor: '#231915', hat: 'cap', hair: 'long', hairColor: '#f1e8d6', beardColor: '#f1e8d6' },
  zenon: { preset: 'young', robe: 'tan', hair: 'curly', hairColor: 'chestnut', cloak: 'fleece', cloakColor: 'wheat', legs: 'tan' },
  pavel: { preset: 'monk', robe: 'slate', legs: 'charcoal', hair: 'short', hairColor: 'black', beard: 'short', beardColor: 'black', belt: 'tan', faceShape: 'narrow' },
  monk: { preset: 'monk' },
  capmonk: { preset: 'monk', hat: 'cap', beard: 'full', robe: 'black', faceShape: 'wide' },
  kam: { preset: 'monk', hat: 'kamilavka', beard: 'long', robe: 'black', cloak: 'mantle', beardColor: 'gray', age: 'elder' },
};
export { LOOKS };
const { chromium } = loadPlaywright();
const { server, port } = await serve(0);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.goto(`http://127.0.0.1:${port}/lib/engine3/dev/char.html?sky=${args.sky || "studio"}`);
  await page.waitForFunction(() => window.__ready, null, { timeout: 120000 });
  const clips = await page.evaluate(() => window.__char.clips);
  let tiles, cols = +(args.cols || 4), tw = +(args.w || 400), th = +(args.h || 400);
  const preset = args.preset || 'looks';
  const frames = +(args.frames || 6);
  const lookOf = (k) => LOOKS[k] || JSON.parse(k);
  if (args.tiles) tiles = JSON.parse(args.tiles).map((t) => ({ ...t, look: typeof t.look === 'string' ? lookOf(t.look) : t.look, actors: t.actors?.map((a) => ({ ...a, look: typeof a.look === 'string' ? lookOf(a.look) : a.look })) }));
  else if (preset === 'looks') {
    tiles = [];
    for (const k of (args.looks || 'siluan,zenon,pavel,capmonk,kam').split(',')) for (const v of [0, 35, 90, 180]) tiles.push({ look: lookOf(k), view: v, label: `${k} ${v}°`, shot: args.shot || 'full' });
  } else if (preset === 'faces') {
    tiles = [];
    for (const e of ['neutral', 'happy', 'joy', 'sad', 'surprised', 'ashamed', 'angry', 'thinking']) tiles.push({ look: lookOf(args.look || 'zenon'), view: 15, shot: 'face', expr: e, label: e });
    cols = 4;
  } else if (preset === 'clips') {
    tiles = [];
    const names = args.clips ? String(args.clips).split(',') : Object.keys(clips);
    for (const c of names) {
      const d = clips[c]?.duration ?? 1;
      for (let i = 0; i < frames; i++) { const t = (d * i) / Math.max(1, frames - 1); tiles.push({ look: lookOf(args.look || 'siluan'), clip: c, t, view: +(args.view ?? 30), shot: args.shot || 'full', label: `${c} ${t.toFixed(2)}s` }); }
    }
    cols = frames;
  }
  const t0 = Date.now();
  const data = await page.evaluate(([tiles, cols, tw, th]) => window.__char.sheet(tiles, cols, tw, th), [tiles, cols, tw, th]);
  const out = path.resolve(ROOT, args.out || `stills/char-${preset}.jpg`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, Buffer.from(data.split(',')[1], 'base64'));
  console.log(`${path.relative(ROOT, out)}  (${tiles.length} tiles, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (args.list) console.log(Object.keys(clips).join(' '));
} finally { await browser.close(); server.close(); }
