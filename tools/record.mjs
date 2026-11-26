// Render a video folder to MP4 (or a few PNG stills) with headless Chromium + ffmpeg.
//
//   node tools/record.mjs videos/001-x                 # final 1920x1080 -> out/<id>.mp4
//   node tools/record.mjs videos/001-x --draft         # half resolution, faster -> out/draft.mp4
//   node tools/record.mjs videos/001-x --stills        # one PNG per beat + contact sheet in stills/
//   node tools/record.mjs videos/001-x --stills 3.5,10,42
//   node tools/record.mjs videos/001-x --stills --only 3,12,40   # only these beat stills (numbers of the file names), bigger contact sheet
//   node tools/record.mjs videos/001-x --stills --scene drumul,tabara
//   contact.jpg: every still labelled (number · scene#beat · m:ss), then the stills of the check warnings, then (--with-poster) the poster
//   node tools/record.mjs videos/001-x --poster [12.5]  # 640x360 poster.jpg for the web catalog (time: arg, desc.poster, or auto)
//   options: --scale 0.5  --workers 3  --from 10 --to 30  --no-audio  --out file.mp4
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { serve } from './serve.mjs';
import { parseArgs, resolveVideoDir, loadVideo, loadPlaywright, run, ROOT, browserArgs, parallelChecks } from './lib/common.mjs';
import { useRemote, runRemote } from './lib/remote.mjs';
import { mixAudio } from './lib/audio.mjs';
import { composeSheet, saveDataURL, mmss } from './lib/sheet.mjs';

const args = parseArgs();
if (typeof args.check === 'string') { args._.unshift(args.check); args.check = true; }
// `npm run still -- videos/x [times]` expands to `--stills videos/x [times]`: the flag swallows the folder
if (typeof args.stills === 'string' && !/^[\d.,]+$/.test(args.stills)) {
  const times = args._.find((x) => /^[\d.,]+$/.test(x));
  args._ = [args.stills, ...args._.filter((x) => x !== times)];
  args.stills = times || true;
}
if (typeof args.poster === 'string' && !/^[\d.]+$/.test(args.poster)) {
  const time = args._.find((x) => /^[\d.]+$/.test(x));
  args._ = [args.poster, ...args._.filter((x) => x !== time)];
  args.poster = time || true;
}
// stills / checks / poster: on a RunPod GPU when RUNPOD_KEY is set (tools/lib/remote.mjs); --local keeps them here
if ((args.stills || args.check || args.poster) && useRemote(args)) process.exit(await runRemote('record.mjs', process.argv.slice(2), { poster: !!args.poster }));
const dir = resolveVideoDir(args._[0]);
const rel = path.relative(ROOT, dir);
const { desc, timeline: tl } = loadVideo(dir);
const draft = !!args.draft;
const scale = parseFloat(args.scale || (args.poster ? 1 / 3 : draft ? 0.5 : args.stills ? 0.5 : 1));
const { chromium } = loadPlaywright();

const { server, port } = await serve(0);
const quality = args.quality || (draft ? 'draft' : 'final');
const url = `http://127.0.0.1:${port}/lib/engine/render.html?video=${rel}&scale=${scale}&quality=${quality}`;
// Default: software WebGL (SwiftShader) so it works in any container. On a machine with a real GPU pass --gpu (much faster).
// --gpu uses ANGLE on EGL (works headless on NVIDIA in Docker with NVIDIA_DRIVER_CAPABILITIES=all); --gl vulkan is the alternative.
const launchArgs = browserArgs(args);

async function openPage(browser, pageUrl = url) {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 404/.test(m.text())) console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.goto(pageUrl);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__error);
  if (err) throw new Error(err);
  if (!openPage.logged) {
    openPage.logged = true;
    const r = await page.evaluate(() => { const gl = window.__stage?.renderer?.getContext(); const e = gl?.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : '?'; });
    console.log('WebGL:', r);
  }
  return page;
}

const browser = await chromium.launch({ args: launchArgs });
try {
  if (tl.warnings.length) console.warn('Warnings:\n  ' + tl.warnings.join('\n  '));
  if (tl.missingAudio) console.warn(`⚠ ${tl.missingAudio} line(s) have no audio yet (run /voice); using estimated timings.`);

  if (args.poster) await poster();
  else if (args.check) await check();
  else if (args.stills) await stills();
  else { if (!args['no-check']) await check(); await video(); }
} finally {
  await browser.close();
  server.close();
}

// Runtime checks (lib/engine/checks.js): flicker, props inside bodies, hidden subjects, camera shake.
async function check() {
  const t0 = Date.now();
  const ws = await parallelChecks(() => openPage(browser), tl, { workers: parseInt(args['check-workers'] || 0) });
  const { formatWarnings } = await import('../lib/engine/checks.js').catch(() => ({}));
  const text = formatWarnings ? formatWarnings(ws) : JSON.stringify(ws, null, 1);
  console.log(text + `  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  return ws;
}

// Poster of the film for the web catalog: videos/<id>/poster.jpg (committed). Time: --poster <s>, else
// desc.poster, else the middle of the second scene (the first one usually starts with the title card).
// desc.poster can also be an OBJECT = a picture composed only for the poster (not a frame of the film): one scene
// { set, sky, cast, props, camera, do, t } rendered at its second `t` (1.2) — the main characters and objects up front.
async function poster() {
  // "poster": "file" = a poster made by hand (e.g. an illustration) is committed as poster.jpg: never overwrite it
  if (desc.poster === 'file') { console.log('poster: "file" — keeping the committed poster.jpg'); return; }
  if (desc.poster && typeof desc.poster === 'object') return composedPoster();
  const sc = tl.scenes[Math.min(1, tl.scenes.length - 1)];
  const t = typeof args.poster === 'string' ? parseFloat(args.poster) : desc.poster ?? +((sc.start + sc.end) / 2).toFixed(1);
  const page = await openPage(browser, url + '&posterLogo=1'); // every poster carries the Școala Evlaviei badge
  const data = await page.evaluate(([t]) => window.__studio.renderTime(t, 'image/jpeg', 0.86), [t]);
  const f = path.join(dir, 'poster.jpg');
  fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
  console.log(`Poster at ${t}s → ${path.relative(ROOT, f)} (${Math.round(fs.statSync(f).size / 1024)} KB)`);
}

export function posterDescriptor(desc) {
  const { t = 1.2, do: acts = [], camera, ...scene } = desc.poster;
  return { ...desc, poster: undefined, posterLogo: true, scenes: [{ id: 'poster', transition: 'cut', lead: 0, tail: 0, ...scene, camera,
    beats: [{ duration: t + 2, camera, do: acts }] }] };
}
async function composedPoster() {
  const tmpDir = path.join(dir, 'stills');
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, '_poster.json'), JSON.stringify(posterDescriptor(desc)));
  const page = await openPage(browser, `http://127.0.0.1:${port}/lib/engine/render.html?video=${rel}/stills&file=_poster.json&scale=${scale}&quality=final`);
  const data = await page.evaluate(([t]) => window.__studio.renderTime(t, 'image/jpeg', 0.88), [desc.poster.t ?? 1.2]);
  const f = path.join(dir, 'poster.jpg');
  fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
  console.log(`Poster (composed picture) → ${path.relative(ROOT, f)} (${Math.round(fs.statSync(f).size / 1024)} KB)`);
}

async function stills() {
  const outDir = path.join(dir, 'stills');
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  let times;
  if (args.stills === true || args.stills === 'beats') {
    times = [];
    let n = 0;
    for (const s of tl.scenes) for (const b of s.beats) times.push({ n: n++, scene: s.id, t: Math.min(b.end - 0.05, b.start + Math.max(0.6, (b.end - b.start) * 0.6)), label: `${s.id}#${b.index}` });
    // --only 3,12,40 = only these stills (numbers as in the file names / contact sheet); --scene a,b = only these scenes
    if (args.only) { const keep = new Set(String(args.only).split(',').map(Number)); times = times.filter((x) => keep.has(x.n)); }
    if (args.scene) { const keep = new Set(String(args.scene).split(',')); times = times.filter((x) => keep.has(x.scene)); }
  } else times = String(args.stills).split(',').map((x) => ({ t: parseFloat(x), label: x }));
  const page = await openPage(browser);
  // the checks run in other pages (other processes) while this one renders the stills
  const t0 = Date.now();
  const checking = parallelChecks(() => openPage(browser), tl, { workers: parseInt(args['check-workers'] || 0) });
  const files = [];
  for (const [i, { t, label, n }] of times.entries()) {
    const data = await page.evaluate(([t]) => window.__studio.renderTime(t, 'image/png'), [t]);
    const f = path.join(outDir, `${String(n ?? i).padStart(3, '0')}_${label.replace(/[^\w.#-]/g, '_').replace('#', '-')}_${t.toFixed(1)}s.png`);
    fs.writeFileSync(f, Buffer.from(data.split(',')[1], 'base64'));
    files.push(f);
    process.stdout.write(`\r still ${i + 1}/${times.length}`);
  }
  console.log();
  // runtime checks on the same page, then ONE contact sheet: every still labelled (number · scene#beat · time), the stills
  // of the check warnings big (with the warning), and the poster (--with-poster) — one image to look at
  const ws = await checking;
  const { formatWarnings } = await import('../lib/engine/checks.js').catch(() => ({}));
  const few = times.length <= 9;
  const sections = [{ cols: times.length <= 4 ? 2 : few ? 3 : 6, tiles: times.map(({ t, label, n }, i) => ({ t, label: `${n ?? i} · ${label} · ${mmss(t)}` })) }];
  const warned = (ws || []).slice(0, 8);
  if (warned.length) sections.push({ title: `⚠ check warnings (${ws.length})`, cols: 2, tiles: warned.map((w) => ({ t: (w.t0 ?? w.t) + 0.01, label: `${w.type} · ${w.scene} · ${mmss(w.t0 ?? w.t)} — ${w.msg}` })) });
  if (args['with-poster'] && desc.poster !== 'file' && !(desc.poster && typeof desc.poster === 'object')) {
    const sc = tl.scenes[Math.min(1, tl.scenes.length - 1)];
    const pt = desc.poster ?? +((sc.start + sc.end) / 2).toFixed(1);
    sections.push({ title: `poster (${pt}s${desc.poster == null ? ' — not set in video.json: auto' : ''})`, cols: 1, tileW: 640, tiles: [{ t: pt, label: `poster · ${mmss(pt)}` }] });
  }
  if (times.length > 1 || sections.length > 1) {
    await saveDataURL(fs, path.join(outDir, 'contact.jpg'), await composeSheet(page, sections));
    console.log('Contact sheet:', path.relative(ROOT, path.join(outDir, 'contact.jpg')));
  }
  console.log((formatWarnings ? formatWarnings(ws) : JSON.stringify(ws)) + `  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  console.log(`Stills in ${path.relative(ROOT, outDir)}/`);
}

// --encoder x264 (default, CPU) | nvenc (NVIDIA GPU encoder); --crf N, --preset P override the quality defaults
function encoderArgs() {
  const crf = String(args.crf || (draft ? 23 : 20));
  if (args.encoder === 'nvenc') return ['-c:v', 'h264_nvenc', '-preset', args.preset || 'p5', '-rc', 'vbr', '-cq', crf, '-b:v', '0'];
  return ['-c:v', 'libx264', '-preset', args.preset || (draft ? 'veryfast' : 'medium'), '-crf', crf];
}

async function video() {
  const fps = tl.fps;
  const f0 = Math.floor((parseFloat(args.from || 0)) * fps);
  const f1 = Math.min(tl.frames, Math.ceil((args.to ? parseFloat(args.to) : tl.duration) * fps));
  const workers = Math.max(1, parseInt(args.workers || 2));
  // --browsers N: separate Chromium processes (each has its own GPU process; one GPU process serialises all pages)
  const nBrowsers = Math.max(1, Math.min(workers, parseInt(args.browsers || 1)));
  const browsers = [browser];
  for (let i = 1; i < nBrowsers; i++) browsers.push(await chromium.launch({ args: launchArgs }));
  const outDir = path.join(dir, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lego-rec-'));
  const total = f1 - f0;
  const chunk = Math.ceil(total / workers);
  let done = 0; const t0 = Date.now();
  const tick = () => {
    const el = (Date.now() - t0) / 1000, rate = done / Math.max(0.1, el);
    process.stdout.write(`\r frames ${done}/${total}  ${rate.toFixed(1)} fps  ETA ${((total - done) / Math.max(0.01, rate)).toFixed(0)}s   `);
  };
  const segs = [];
  await Promise.all(Array.from({ length: workers }, async (_, w) => {
    const a = f0 + w * chunk, b = Math.min(f1, a + chunk);
    if (a >= b) return;
    const seg = path.join(tmp, `seg${w}.mp4`); segs[w] = seg;
    const page = await openPage(browsers[w % nBrowsers]);
    const { spawn } = await import('node:child_process');
    const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-c:v', 'mjpeg', '-framerate', String(fps), '-i', '-',
      ...encoderArgs(), '-pix_fmt', 'yuv420p', seg], { stdio: ['pipe', 'inherit', 'inherit'] });
    const closed = new Promise((res, rej) => ff.on('exit', (c) => (c === 0 ? res() : rej(new Error('ffmpeg failed')))));
    for (let f = a; f < b; f++) {
      const data = await page.evaluate(([f]) => window.__studio.renderFrame(f, 'image/jpeg', 0.93), [f]);
      const buf = Buffer.from(data.split(',')[1], 'base64');
      if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
      done++; if (done % 10 === 0) tick();
    }
    ff.stdin.end();
    await closed;
    await page.close();
  }));
  tick(); console.log();
  for (const b of browsers.slice(1)) await b.close();
  const list = path.join(tmp, 'list.txt');
  fs.writeFileSync(list, segs.filter(Boolean).map((s) => `file '${s}'`).join('\n'));
  const silent = path.join(tmp, 'video.mp4');
  await run('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', silent]);
  const name = args.out || path.join(outDir, draft ? 'draft.mp4' : `${desc.id || path.basename(dir)}.mp4`);
  if (args['no-audio']) fs.copyFileSync(silent, name);
  else {
    const wav = path.join(tmp, 'mix.wav');
    await mixAudio(dir, tl, wav, { from: f0 / fps, to: f1 / fps, desc });
    await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', silent, '-i', wav, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-shortest', name]);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`Saved ${path.relative(ROOT, name)}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
