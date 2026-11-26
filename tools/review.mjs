// A reviewer's feedback → ONE sheet to look at (one agent turn instead of a dozen):
//   npm run review -- videos/<id> <<'EOF'
//   <the feedback exactly as pasted: "1. [2:08.8] Mana e obturata\n   (128.8s, scena canonul, replica #3; timotei: „…”)" …>
//   EOF
//   npm run review < feedback.txt          # the film is found in the text ("Feedback film 028-…")
//   npm run review -- videos/<id> 128.8,151.5      # just these seconds
// For every item: the whole frame at that second + a zoom on the person concerned (the one speaking, else the one the
// camera films) at 5 moments around it — or 8 frames 0.1 s apart when the note says something blinks / appears and
// disappears — and the check warnings near that second. Rendered at full resolution so small things (a hand, a flame)
// are readable. Output: videos/<id>/stills/review.jpg (review-2.jpg … for more than 8 items).
import fs from 'node:fs';
import path from 'node:path';
import { serve } from './serve.mjs';
import { parseArgs, resolveVideoDir, loadVideo, loadPlaywright, ROOT, browserArgs, parallelChecks } from './lib/common.mjs';
import { useRemote, runRemote } from './lib/remote.mjs';
import { composeSheet, saveDataURL, mmss } from './lib/sheet.mjs';

const args = parseArgs();
let text = '';
if (!process.stdin.isTTY) text = fs.readFileSync(0, 'utf8');
// on a RunPod GPU when RUNPOD_KEY is set (tools/lib/remote.mjs); --local keeps it here
if (useRemote(args)) process.exit(await runRemote('review.mjs', process.argv.slice(2), { stdinText: text }));
const pos = [...args._];
const timesArg = pos.find((x) => /^[\d.,]+$/.test(x));
const isFile = (x) => fs.existsSync(x) && fs.statSync(x).isFile();
let dirArg = pos.find((x) => x !== timesArg && !isFile(x));
const fileArg = pos.find((x) => isFile(x));
if (fileArg) text += '\n' + fs.readFileSync(fileArg, 'utf8');
if (!dirArg) dirArg = (/film\s+(\d{3}-[\w-]+)/i.exec(text) || /videos\/(\d{3}-[\w-]+)/.exec(text) || /\/(\d{3}-[\w-]+)\/?\s/.exec(text) || [])[1];
const dir = resolveVideoDir(dirArg);
const rel = path.relative(ROOT, dir);
const { desc, timeline: tl } = loadVideo(dir);

// ---- parse the items
const items = [];
const lines = text.split('\n');
for (let i = 0; i < lines.length; i++) {
  const m = /^\s*(?:(\d+)[.)]\s*)?\[(\d+):(\d+(?:\.\d+)?)\]\s*(.*)$/.exec(lines[i]);
  if (!m) continue;
  const it = { n: m[1] ? +m[1] : items.length + 1, t: +m[2] * 60 + +m[3], note: m[4].trim() };
  const d = /\(([\d.]+)s,\s*scena\s+([^,]+),\s*replica\s*#(\d+);\s*([^:]+):/.exec(lines[i + 1] || '');
  if (d) { it.t = +d[1]; it.scene = d[2].trim(); it.beat = +d[3]; it.speaker = d[4].trim(); }
  items.push(it);
}
if (timesArg) for (const x of timesArg.split(',')) items.push({ n: items.length + 1, t: +x, note: '' });
if (!items.length) { console.error('No items found: paste the feedback (lines like "1. [2:08.8] …") on stdin, or give seconds: 128.8,151.5'); process.exit(1); }

// ---- render
const { chromium } = loadPlaywright();
const { server, port } = await serve(0);
const browser = await chromium.launch({ args: browserArgs(args) });
async function openPage() {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.goto(`http://127.0.0.1:${port}/lib/engine/render.html?video=${rel}&scale=${args.scale || 1}&quality=final`);
  await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 120000 });
  const err = await page.evaluate(() => window.__error); if (err) throw new Error(err);
  return page;
}
try {
  const page = await openPage();
  // the checks run in other pages (other processes) while this one renders the frames
  const checking = parallelChecks(openPage, tl, { workers: parseInt(args['check-workers'] || 0) });
  let ws = [];
  const BLINK = /apare (s|ș)i dispare|dispare|clipe|pâlpâ|palpa|flicker|blink|tremur|stins|stinge/i;
  const sections = [];
  for (const it of items) {
    const t = Math.max(0, Math.min(tl.duration - 0.05, it.t));
    // who to zoom on: the speaker (if he is on the picture), else whom the camera films
    // a person or a prop named in the note wins ("Lumanarea e stinsa" → whoever holds the candle)
    const norm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const stems = norm(it.note).split(/[^a-z]+/).filter((w) => w.length >= 4).map((w) => w.slice(0, 5));
    const hit = (name) => stems.some((st) => norm(name).split(/[^a-z]+/).some((w) => w.length >= 4 && w.startsWith(st)));
    const sc = tl.scenes.find((x) => t >= x.start && t < x.end) || tl.scenes[0];
    let named = Object.keys(sc.actors).find((id) => hit(id) || hit(desc.characters?.[id]?.name));
    if (!named) for (const [pid, p] of Object.entries(sc.props)) {
      if (!(hit(pid) || hit(p.type))) continue;
      const h = [...p.moves].reverse().find((m) => m.t1 <= t)?.to || p.initial;
      if (h.actor) { named = h.actor; break; }
    }
    let who = named || (it.speaker && it.speaker !== 'narrator' ? it.speaker : null);
    if (who && !(await page.evaluate(([t, id]) => window.__studio.locate(t, id), [t, who]))) who = null;
    if (!who) who = (await page.evaluate(([t]) => window.__studio.subjects(t), [t]))[0] || null;
    const blink = BLINK.test(it.note);
    const ts = blink ? Array.from({ length: 8 }, (_, k) => t - 0.35 + k * 0.1) : [-0.6, -0.3, 0, 0.3, 0.6].map((d) => t + d);
    const near = { t }; // filled in when the checks are done
    const info = await page.evaluate(([t]) => window.__studio.info(t), [t]);
    sections.push({
      title: `#${it.n}  ${mmss(t)}  ${it.scene || info.scene}#${it.beat ?? info.beat}${it.speaker ? ' · ' + it.speaker : ''} — ${it.note || ''}`, near,
      cols: 1 + ts.length, aspect: 9 / 16,
      tiles: [{ t, label: `whole · ${mmss(t)}` }, ...ts.filter((x) => x >= 0 && x < tl.duration).map((x) => ({ t: +x.toFixed(2), crop: who, label: `${mmss(x)}${who ? ' · ' + who : ''}` }))],
    });
  }
  ws = await checking;
  for (const s of sections) {
    const t = s.near.t, near = ws.filter((w) => Math.abs((w.t0 ?? w.t) - t) < 1.5 || ((w.t0 ?? 0) <= t && (w.t1 ?? 0) >= t));
    if (near.length) s.title += '   ⚠ ' + near.map((w) => `[${w.type}] ${w.msg}`).join(' · ');
  }
  fs.mkdirSync(path.join(dir, 'stills'), { recursive: true });
  const per = 8, out = [];
  for (let p = 0; p * per < sections.length; p++) {
    const f = path.join(dir, 'stills', p ? `review-${p + 1}.jpg` : 'review.jpg');
    await saveDataURL(fs, f, await composeSheet(page, sections.slice(p * per, (p + 1) * per), { width: 1900 }));
    out.push(path.relative(ROOT, f));
  }
  for (const it of items) console.log(`  #${it.n} ${mmss(it.t)}${it.scene ? ` ${it.scene}#${it.beat}` : ''}${it.speaker ? ' ' + it.speaker : ''}: ${it.note}`);
  console.log(`checks: ${ws.length ? ws.length + ' warning(s) — shown next to the items they touch' : 'no problems found ✓'}`);
  console.log(`LOOK AT: ${out.join('  ·  ')}`);
} finally {
  await browser.close();
  server.close();
}
