import { measure } from './metrics.js';
import { ALL, APPROACHES, builder, locate, renderFrame, timelineOf } from './scene.js';
import { FPS, TESTS } from './rig.js';

const $ = (id) => document.getElementById(id);
const W = 480, H = 600;
const picker = $('test-picker');
const slider = $('frame');
const play = $('play');
const params = new URLSearchParams(location.search);
let timeline;
let current = params.get('test') && [ALL, ...TESTS].some((t) => t.id === params.get('test')) ? params.get('test') : ALL.id;
let tick;
let shown = -1;

const panels = APPROACHES.map(({ id }) => {
  const canvas = $(`canvas-${id}`);
  canvas.width = W * 2; canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  return { id, canvas, ctx, b: builder(id), readout: $(`readout-${id}`) };
});

function describe(id, out) {
  if (id === 'substitutie') return `Desenul ${out.hand.entry.replace('/', ' · ')}`;
  if (id === 'plasa') return `${out.hand.front ? 'Desenul palmei' : 'Desenul dosului'} · ${out.hand.folds ? `${out.hand.folds} triunghiuri pliate` : 'fără pliuri'}`;
  return `${out.hand.groups.length} piese · ordinea ${out.hand.order.replace(/palm/, 'palma')}`;
}

function draw(frame, { sequential = false } = {}) {
  const onTwos = $('twos').checked;
  const used = onTwos ? frame - (frame % 2) : frame;
  slider.value = frame;
  $('current-frame').textContent = `${frame + 1} / ${timeline.frames}`;
  const { test, time, local } = locate(timeline, used);
  $('test-note').textContent = `${test.title}: ${test.note}`;
  for (const p of panels) {
    // Hand charts are picked with memory, so a jump replays the last half second.
    if (!sequential) {
      p.b.reset();
      for (let f = Math.max(0, local - 12); f < local; f += 1) {
        renderFrame(p.ctx, { approach: p.id, build: p.b.build, test, time: f / FPS, yaw: Number($('angle').value), width: W, height: H });
      }
    }
    const out = renderFrame(p.ctx, {
      approach: p.id, build: p.b.build, test, time, yaw: Number($('angle').value),
      closeUp: $('close').checked, skeleton: $('skeleton').checked, width: W, height: H,
    });
    p.readout.textContent = describe(p.id, out);
    p.canvas.dataset.frame = String(frame);
    p.canvas.dataset.test = test.id;
  }
  shown = frame;
}

function stop() {
  cancelAnimationFrame(tick);
  tick = undefined;
  play.textContent = 'Redă';
}

function start() {
  stop();
  play.textContent = 'Pauză';
  const first = Number(slider.value);
  const t0 = performance.now();
  const speed = Number($('speed').value);
  const step = (now) => {
    const frame = (first + Math.floor(((now - t0) / 1000) * FPS * speed)) % timeline.frames;
    if (frame !== shown) draw(frame, { sequential: frame === shown + 1 || frame === shown + 2 });
    tick = requestAnimationFrame(step);
  };
  tick = requestAnimationFrame(step);
}

function choose(id, { autoplay = true } = {}) {
  current = id;
  timeline = timelineOf(id);
  slider.max = timeline.frames - 1;
  for (const button of picker.querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.test === id));
  const url = new URL(location.href);
  if (id === ALL.id) url.searchParams.delete('test'); else url.searchParams.set('test', id);
  history.replaceState(null, '', url);
  draw(0);
  if (autoplay) start();
}

for (const t of [ALL, ...TESTS]) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.test = t.id;
  button.textContent = t.title;
  button.addEventListener('click', () => choose(t.id));
  picker.append(button);
}
play.addEventListener('click', () => (tick ? stop() : start()));
slider.addEventListener('input', () => { stop(); draw(Number(slider.value)); });
$('previous-frame').addEventListener('click', () => { stop(); draw((Number(slider.value) + timeline.frames - 1) % timeline.frames); });
$('next-frame').addEventListener('click', () => { stop(); draw((Number(slider.value) + 1) % timeline.frames, { sequential: true }); });
$('angle').addEventListener('input', () => { $('current-angle').textContent = `${$('angle').value}°`; if (!tick) draw(Number(slider.value)); });
for (const id of ['twos', 'close', 'skeleton']) $(id).addEventListener('change', () => { if (!tick) draw(Number(slider.value)); });
$('speed').addEventListener('change', () => { if (tick) start(); });
choose(current, { autoplay: !matchMedia('(prefers-reduced-motion: reduce)').matches });

// --- Results table -------------------------------------------------------------
const pct = (v) => `${Math.round(v * 100)}%`;
const mm = (v) => `${v.toFixed(v < 10 ? 1 : 0)} mm`;
function cell(text, bad) {
  const td = document.createElement('td');
  td.textContent = text;
  if (bad) td.className = 'bad';
  return td;
}

async function report() {
  const status = $('report-status');
  const { rows, drawingsUsed } = await measure((p) => { status.textContent = `Se măsoară toate cadrele… ${Math.round(p * 100)}%`; });
  const body = $('report-rows');
  body.replaceChildren();
  const sum = { A: { pops: 0, layers: 0 }, B: { pops: 0, folds: 0 }, C: { layers: 0, flicker: 0 }, frames: 0 };
  for (const r of rows) {
    const tr = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row'; th.textContent = r.title;
    tr.append(th,
      cell(`${pct(r.A.iou)} · ${r.A.pops} salturi`, r.A.pops > 2),
      cell(r.hasContact ? mm(r.A.contact) : '—', r.A.contact > 15),
      cell(`${pct(r.B.iou)} · ${r.B.pops} salturi`, r.B.pops > 2),
      cell(`${r.B.folds} / ${r.frames}`, r.B.folds > r.frames * 0.1),
      cell(r.hasContact ? mm(r.B.contact) : '—', r.B.contact > 15),
      cell(`${r.C.layers} / ${r.frames} · ${r.C.flicker} pâlpâiri`, r.C.flicker > 2),
      cell(r.hasContact ? mm(r.C.contact) : '—', r.C.contact > 15));
    body.append(tr);
    sum.A.pops += r.A.pops; sum.B.pops += r.B.pops; sum.B.folds += r.B.folds; sum.C.layers += r.C.layers; sum.C.flicker += r.C.flicker; sum.A.layers += r.A.layers; sum.frames += r.frames;
  }
  const meanIou = (key) => rows.reduce((s, r) => s + r[key].iou * r.frames, 0) / sum.frames;
  const ms = (key) => rows.reduce((s, r) => s + r[key].ms * r.frames, 0) / sum.frames;
  $('sum-A').textContent = `${pct(meanIou('A'))} din siluetă, ${sum.A.pops} salturi, ${sum.A.layers} schimbări de desen, ${drawingsUsed} din 72 de desene folosite, ${ms('A').toFixed(2)} ms/cadru`;
  $('sum-B').textContent = `${pct(meanIou('B'))} din siluetă, ${sum.B.pops} salturi, pliuri în ${sum.B.folds} din ${sum.frames} cadre, ${ms('B').toFixed(2)} ms/cadru`;
  $('sum-C').textContent = `siluetă exactă (referința), linia interioară se mută în ${sum.C.layers} din ${sum.frames} cadre și pâlpâie în ${sum.C.flicker}, ${ms('C').toFixed(2)} ms/cadru`;
  status.textContent = `${sum.frames} cadre la ${FPS} fps, măsurate în acest browser.`;
  document.body.dataset.report = 'gata';
}
report().catch((error) => { $('report-status').textContent = `Măsurătoarea s-a oprit: ${error.message}`; });
