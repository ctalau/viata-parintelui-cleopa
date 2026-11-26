// Library sheet: renders every reusable LEGO piece on its own (minifig looks, buildings, landscape props), laid out
// like a printed asset board → stills/library.jpg (or the path given with --out). Items: lib/engine/library.js → SHEET.
//   npm run library [-- --out path.jpg] [--only 'Pelerin,Avva'] [--tile 600]   (--only = labels starting with these)
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadPlaywright, ROOT } from './lib/common.mjs';
import { serve } from './serve.mjs';

const args = parseArgs();
const out = path.resolve(args.out || path.join(ROOT, 'stills', 'library.jpg'));
const { chromium } = loadPlaywright();
const { server, port } = await serve(0);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[page]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.error('[console]', m.text()); });
const q = new URLSearchParams(); if (args.only) q.set('only', args.only); if (args.tile) q.set('tile', args.tile);
await page.goto(`http://127.0.0.1:${port}/lib/engine/library.html?${q}`);
await page.waitForFunction(() => window.__sheet || window.__error, null, { timeout: 300000 });
const { sheet, error, missing } = await page.evaluate(() => ({ sheet: window.__sheet, error: window.__error, missing: window.__missing }));
await browser.close(); server.close();
if (error) { console.error(error); process.exit(1); }
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.from(sheet.split(',')[1], 'base64'));
console.log(`Library sheet → ${path.relative(ROOT, out)}${missing?.length ? `  (missing: ${missing.join(', ')})` : ''}`);
