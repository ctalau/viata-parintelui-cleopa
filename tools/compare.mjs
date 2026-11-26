// Compare a rendered MP4 (RunPod GPU render) with the local preview engine, frame by frame, and flag what differs.
// The YouTube MP4 is rendered on another machine (NVIDIA GPU, files uploaded in a tarball) than the stills reviewed here
// (SwiftShader): a file missing from the upload (038: the icon became a plain board) or a GPU-only artefact (039: a black
// square) only shows up in the MP4. `npm run runpod -- render` runs this after every download and fails on a difference.
//
//   node tools/compare.mjs videos/<id> [file.mp4] [--times 3.5,10] [--every 4] [--threshold 60]
//   → videos/<id>/stills/compare.jpg: per frame [preview | MP4 | difference], the differing patches boxed in red
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { serve } from './serve.mjs';
import { parseArgs, resolveVideoDir, loadVideo, loadPlaywright, run, ROOT } from './lib/common.mjs';
import { saveDataURL, mmss } from './lib/sheet.mjs';

/** Frames to compare: the middle of every beat, plus one every `every` seconds (walks, flights happen between beats). */
export function compareFrames(tl, { every = 4, times } = {}) {
  const ts = times ? times.slice() : [];
  if (!times) {
    for (const s of tl.scenes) for (const b of s.beats) ts.push((b.start + b.end) / 2);
    for (let t = 1; t < tl.duration - 0.5; t += every) ts.push(t);
  }
  return [...new Set(ts.map((t) => Math.min(tl.frames - 1, Math.max(0, Math.round(t * tl.fps)))))].sort((a, b) => a - b);
}

/** In the page: per cell of `cell` px, the difference of the MEAN colour of the two frames (max over r, g, b; 0..255) —
 *  a patch that changed (a black block, a missing picture) differs a lot, while video-coding noise on thin edges (the
 *  title text) averages out (it stays ≤ 50; the black blocks of 039 were 240). Returns the cells over `thr`. */
function diffInPage([a, b, cell, thr]) {
  const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
  return Promise.all([load(a), load(b)]).then(([ia, ib]) => {
    const W = ia.naturalWidth, H = ia.naturalHeight;
    const px = (img) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H); return x.getImageData(0, 0, W, H).data; };
    const da = px(ia), db = px(ib);
    const cx = Math.ceil(W / cell), cy = Math.ceil(H / cell), N = cx * cy;
    const sa = new Float64Array(N * 3), sb = new Float64Array(N * 3), n = new Float64Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, k = Math.floor(y / cell) * cx + Math.floor(x / cell);
      for (let c = 0; c < 3; c++) { sa[k * 3 + c] += da[i + c]; sb[k * 3 + c] += db[i + c]; }
      n[k]++;
    }
    const bad = [];
    let max = 0, total = 0;
    for (let k = 0; k < N; k++) {
      let m = 0; for (let c = 0; c < 3; c++) m = Math.max(m, Math.abs(sa[k * 3 + c] - sb[k * 3 + c]) / n[k]);
      total += m; max = Math.max(max, m);
      if (m > thr) bad.push([(k % cx) * cell, Math.floor(k / cx) * cell, +m.toFixed(0)]);
    }
    return { mean: +(total / N).toFixed(2), max: +max.toFixed(0), bad, W, H };
  });
}

/** In the page: one sheet, a row per frame: preview | mp4 | difference ×4, bad cells boxed. */
function sheetInPage([rows, cell]) {
  const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  return Promise.all(rows.map((r) => Promise.all([load(r.a), load(r.b)]))).then((imgs) => {
    const tw = 480, th = 270, pad = 6, lh = 22, s = tw / imgs[0][0].naturalWidth;
    const c = document.createElement('canvas'); c.width = pad + 3 * (tw + pad); c.height = pad + rows.length * (th + lh + pad);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    rows.forEach((r, i) => {
      const y = pad + i * (th + lh + pad);
      x.fillStyle = '#222'; x.font = '15px sans-serif'; x.fillText(r.label, pad, y + 16);
      const [ia, ib] = imgs[i];
      x.drawImage(ia, pad, y + lh, tw, th); x.drawImage(ib, pad + tw + pad, y + lh, tw, th);
      x.drawImage(ia, pad + 2 * (tw + pad), y + lh, tw, th);
      x.globalCompositeOperation = 'difference'; x.drawImage(ib, pad + 2 * (tw + pad), y + lh, tw, th); x.globalCompositeOperation = 'source-over';
      x.strokeStyle = 'red'; x.lineWidth = 2;
      for (const ox of [pad, pad + tw + pad, pad + 2 * (tw + pad)]) for (const [bx, by] of r.bad) x.strokeRect(ox + bx * s, y + lh + by * s, cell * s, cell * s);
    });
    return c.toDataURL('image/jpeg', 0.85);
  });
}

export async function compareVideo(dir, mp4, { every = 4, times, threshold = 60, cell = 24, out } = {}) {
  const rel = path.relative(ROOT, dir);
  const { timeline: tl } = loadVideo(dir);
  const frames = compareFrames(tl, { every, times });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lego-cmp-'));
  // the MP4 frames, in one decoding pass, at preview size (960x540)
  const sel = frames.map((f) => `eq(n\\,${f})`).join('+');
  await run('ffmpeg', ['-loglevel', 'error', '-y', '-i', mp4, '-vf', `select='${sel}',scale=960:540`, '-fps_mode', 'passthrough', path.join(tmp, 'f%04d.png')]);
  const got = fs.readdirSync(tmp).filter((f) => f.endsWith('.png')).sort();
  if (got.length !== frames.length) throw new Error(`ffmpeg gave ${got.length} frames, expected ${frames.length}`);
  const { chromium } = loadPlaywright();
  const { server, port } = await serve(0);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const results = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => console.error('[page]', e.message));
    await page.goto(`http://127.0.0.1:${port}/lib/engine/render.html?video=${rel}&scale=0.5&quality=final`);
    await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
    const err = await page.evaluate(() => window.__error); if (err) throw new Error(err);
    for (const [i, f] of frames.entries()) {
      const a = await page.evaluate(([f]) => window.__studio.renderFrame(f, 'image/png'), [f]);
      const b = 'data:image/png;base64,' + fs.readFileSync(path.join(tmp, got[i])).toString('base64');
      const d = await page.evaluate(diffInPage, [a, b, cell, threshold]);
      results.push({ f, t: f / tl.fps, a, b, ...d });
      process.stdout.write(`\r compare ${i + 1}/${frames.length}`);
    }
    console.log();
    const worst = results.filter((r) => r.bad.length).sort((x, y) => y.max - x.max);
    const show = (worst.length ? worst : results.slice().sort((x, y) => y.max - x.max)).slice(0, 10).sort((x, y) => x.f - y.f);
    const file = out || path.join(dir, 'stills', 'compare.jpg');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await saveDataURL(fs, file, await page.evaluate(sheetInPage, [show.map((r) => ({ a: r.a, b: r.b, bad: r.bad, label: `${mmss(r.t)} (frame ${r.f}) — mean diff ${r.mean}, worst patch ${r.max}${r.bad.length ? `, ${r.bad.length} patch(es) > ${threshold}` : ''}   [preview | MP4 | difference]` })), cell]));
    console.log(`Compared ${results.length} frames: mean diff ${(results.reduce((s, r) => s + r.mean, 0) / results.length).toFixed(2)}, worst patch ${Math.max(...results.map((r) => r.max))}`);
    for (const r of worst) console.log(`  ⚠ ${mmss(r.t)} (frame ${r.f}): ${r.bad.length} patch(es) differ (worst ${r.max}) at ${r.bad.slice(0, 4).map(([x, y]) => `${x},${y}`).join(' ')}`);
    console.log(`${worst.length ? '⚠ the MP4 differs from the preview' : 'MP4 = preview ✓'} — ${path.relative(ROOT, file)}`);
    return { ok: !worst.length, worst: worst.map(({ a, b, ...r }) => r), sheet: file };
  } finally {
    await browser.close(); server.close(); fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs();
  const dir = resolveVideoDir(args._[0]);
  const mp4 = args._[1] || path.join(dir, 'out', `${path.basename(dir)}.mp4`);
  const r = await compareVideo(dir, mp4, { every: parseFloat(args.every || 4), threshold: parseFloat(args.threshold || 60), out: args.out,
    times: args.times ? String(args.times).split(',').map(Number) : undefined });
  process.exit(r.ok ? 0 : 1);
}
