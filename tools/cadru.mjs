// Cadre rapide ale episodului: Blender doar evaluează și exportă cadrele cerute ca GLB-uri,
// iar three.js (Chromium fără ecran) asamblează scena și o randează — ca `npm run still` din
// lego-shorts. După o modificare a coregrafiei, `--build` refaceți scena și coace palmele și
// mânecile doar în jurul cadrelor cerute (pe o copie), în loc de tot filmul.
//
//   npm run cadru -- 1263 3301                 # scena salvată (coaptă), ~10 s
//   npm run cadru -- 2590-2610:5 --build       # build + coacere parțială + cadre, ~1 min
//   npm run cadru -- 3301 --zoom Tata          # zoom doar pe brațele Tatălui
//   npm run cadru -- 3301 --maini              # zoom pe fiecare mână cu manșeta (suprapuneri)
//
// Rezultat: renders/cadre/foaie.jpg (cadrele etichetate + zoom pe brațe) și cadru-NNNN.png.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EPISODE = path.join(ROOT, 'experiments/cleopa-painea');
const SCENE = path.join(EPISODE, 'scenes/painea_care_poate_sa_astepte.blend');
const WORK = path.join(ROOT, '.cadru');
const BLENDER = process.env.BLENDER_BIN || 'blender';
const PREINSTALLED = '/opt/pw-browsers/chromium';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    build: { type: 'boolean' },
    coace: { type: 'boolean' },
    zoom: { type: 'string', default: '' },
    'fara-zoom': { type: 'boolean' },
    maini: { type: 'boolean' },
    width: { type: 'string', default: '960' },
    out: { type: 'string', default: path.join(EPISODE, 'renders/cadre') },
  },
});
const frames = [...new Set(positionals.flatMap((arg) => arg.split(',')).flatMap((item) => {
  const range = /^(\d+)-(\d+)(?::(\d+))?$/.exec(item);
  if (!range) return [Number(item)];
  const [, a, b, step = '4'] = range;
  const list = [];
  for (let f = Number(a); f <= Number(b); f += Number(step)) list.push(f);
  return list;
}))].sort((a, b) => a-b);
const width = Number(values.width);
if (!frames.length || frames.length > 24 || frames.some((f) => !Number.isSafeInteger(f) || f < 1) ||
    !Number.isInteger(width) || width < 320 || width > 1920) {
  throw new Error('Utilizare: npm run cadru -- 1263 3301 2590-2610:5 [--build] [--coace] [--zoom Tata,Mama | --fara-zoom] [--maini] [--width 960]. Cel mult 24 de cadre.');
}

const started = performance.now();
const clock = () => `${((performance.now()-started)/1000).toFixed(1)} s`;

function blender(args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(BLENDER, ['-b', ...args], { cwd: EPISODE });
    let log = '';
    child.stdout.on('data', (chunk) => { log += chunk; });
    child.stderr.on('data', (chunk) => { log += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code) reject(new Error(`${label} a eșuat (${code}):\n${log.split('\n').slice(-25).join('\n')}`));
      else { console.log(`${label}: gata la ${clock()}`); resolve(log); }
    });
  });
}

/** Ferestrele de coacere: fiecare cadru ±24 (tranzițiile palmei și pozele ținute), unite. */
function windows(list) {
  const spans = [];
  for (const f of list) {
    const [lo, hi] = [Math.max(1, f-24), f+24];
    const last = spans.at(-1);
    if (last && lo <= last[1]+1) last[1] = hi;
    else spans.push([lo, hi]);
  }
  return spans.map(([lo, hi]) => `${lo}-${hi}`).join(',');
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json',
  '.glb': 'model/gltf-binary', '.png': 'image/png' };
function serve() {
  const routes = [['/three/', path.join(ROOT, 'node_modules/three')], ['/cadru/textures/', path.join(EPISODE, 'assets/backgrounds')],
    ['/cadru/', WORK], ['/', path.join(ROOT, 'tools/cadru')]];
  const server = http.createServer((request, response) => {
    const url = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    const [prefix, dir] = routes.find(([p]) => url.startsWith(p));
    const file = path.join(dir, url.slice(prefix.length) || 'pagina.html');
    if (!file.startsWith(dir) || !existsSync(file)) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' });
    createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

await mkdir(WORK, { recursive: true });
await mkdir(values.out, { recursive: true });
let scene = SCENE;
if (values.build) await blender(['--factory-startup', '--python-exit-code', '1', '--python', path.join(EPISODE, 'scripts/build_episode.py')], 'build_episode');
if (values.build || values.coace) {
  const spans = windows(frames);
  const palms = path.join(WORK, 'scena-palme.blend');
  scene = path.join(WORK, 'scena.blend');
  await blender([SCENE, '--python-exit-code', '1', '--python', path.join(EPISODE, 'scripts/palme25d_bake.py'), '--', '--frames', spans, '--out', palms], `palme (${spans})`);
  await blender([palms, '--python-exit-code', '1', '--python', path.join(EPISODE, 'scripts/maneci_bake.py'), '--', '--frames', spans, '--out', scene], 'mâneci');
}
for (const f of frames) await rm(path.join(WORK, `cadru-${String(f).padStart(4, '0')}.glb`), { force: true });
await blender([scene, '--python-exit-code', '1', '--python', path.join(EPISODE, 'scripts/cadru_export.py'), '--', '--out', WORK, '--frames', frames.join(',')], 'export GLB');

const server = await serve();
let browser;
try {
  browser = await chromium.launch({
    // Chromium-ul preinstalat (containerele cloud), când Playwright-ul proiectului nu are browserul lui.
    ...((process.env.CHROMIUM_BIN || existsSync(PREINSTALLED)) && { executablePath: process.env.CHROMIUM_BIN || PREINSTALLED }),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/pagina.html`);
  await page.waitForFunction(() => window.gata, null, { timeout: 15000 });
  const ids = frames.map((f) => `cadru-${String(f).padStart(4, '0')}`);
  const only = values.zoom ? values.zoom.split(',').map((s) => s.trim()).filter(Boolean) : [];
  const result = await page.evaluate((options) => window.foaie(options),
    { ids, width, zoom: values['fara-zoom'] ? false : values.maini ? 'maini' : 'brate', only });
  await Promise.all(result.singles.map((png, i) => writeFile(path.join(values.out, `${ids[i]}.png`), Buffer.from(png, 'base64'))));
  await writeFile(path.join(values.out, 'foaie.jpg'), Buffer.from(result.sheet, 'base64'));
  console.log(`three.js: ${frames.length} cadre la ${clock()} → ${path.relative(ROOT, path.join(values.out, 'foaie.jpg'))}`);
} finally {
  await browser?.close();
  server.close();
}
