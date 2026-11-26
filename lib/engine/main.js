// Browser entry of the recorder / checks: loads a video folder, compiles the timeline, exposes window.__studio.
// (The interactive player with audio is the web catalog: lib/web/player.js, `npm run preview`.)
import { compile, sceneAt, beatAt } from './timeline.js';
import { Stage } from './stage.js';
import { runChecks } from './checks.js';
import { preloadImages } from '../components/props.js';
import { preloadLogos } from '../engine/overlay.js';
import { Stage2D } from '../engine2d/stage2d.js';
import { runChecks2d } from '../engine2d/checks2d.js';

const params = new URLSearchParams(location.search);
const video = (params.get('video') || '').replace(/\/$/, '');
const scale = parseFloat(params.get('scale') || '1');
const file = (params.get('file') || 'video.json').replace(/[^\w.-]/g, ''); // design boards render design/_board.json

async function getJSON(url, fallback) {
  try { const r = await fetch(url, { cache: 'no-store' }); return r.ok ? await r.json() : fallback; } catch { return fallback; }
}

let sheet = null, lastT = null;
function wrap(g, text, maxW) {
  const out = []; let line = '';
  for (const w of String(text).split(/\s+/)) { const tryL = line ? line + ' ' + w : w; if (g.measureText(tryL).width > maxW && line) { out.push(line); line = w; } else line = tryL; }
  if (line) out.push(line); return out;
}

async function boot() {
  const desc = await getJSON(`/${video}/${file}`, null);
  if (!desc) throw new Error(`Cannot load /${video}/${file}`);
  const manifest = await getJSON(`/${video}/audio/lines.json`, {});
  await document.fonts.load('600 40px Fredoka', 'ăâîșț ĂÂÎȘȚ');
  await document.fonts.ready;
  if (params.get('posterLogo')) desc.posterLogo = true; // tools/record.mjs --poster: the badge instead of the corner logo
  await preloadLogos(desc);
  const missingImages = await preloadImages(desc);
  if (missingImages.length) throw new Error(`image(s) not found: ${missingImages.join(', ')} — never render a film without them`);
  const quality = params.get('quality') || 'final';
  // "style": "blender" → the GLB runtime (lib/engine3/): glTF characters / sets / props, baked clips, offline validator
  const blender = desc.style === 'blender';
  let tl, E3 = null;
  if (blender) {
    E3 = await import('../engine3/boot3.js');
    tl = await E3.compileFilm(desc, manifest);
  } else tl = compile(desc, manifest);
  const Q = { draft: { antialias: false, shadowSize: 1024, softShadows: false }, final: { antialias: true, shadowSize: 2048, softShadows: true } }[quality] || {};
  // "engine": "2d" → the hand-drawn 2D cartoon engine (lib/engine2d/)
  const twoD = desc.engine === '2d';
  const stage = blender ? await E3.createStage(document.getElementById('out'), tl, desc, { scale, quality })
    : twoD ? new Stage2D(document.getElementById('out'), tl, desc, { scale }) : new Stage(document.getElementById('out'), tl, desc, { scale, ...Q });
  // warm up: build every scene once so the first frames are not slower
  stage.renderAt(0);

  window.__studio = {
    duration: tl.duration, fps: tl.fps, frames: tl.frames, width: stage.W, height: stage.H, warnings: tl.warnings,
    renderTime(t, type = 'image/jpeg', q = 0.92) { stage.renderAt(t); lastT = t; return stage.out.toDataURL(type, q); },
    renderFrame(i, type, q) { return this.renderTime(i / tl.fps, type, q); },
    check(opts) { return blender ? E3.runChecks3(stage, opts) : twoD ? runChecks2d(stage, opts) : runChecks(stage, opts); },
    // ---- review sheets (tools/record.mjs --stills, tools/review.mjs): compose many frames into one image in the page ----
    locate(t, id) { stage.renderAt(t); lastT = t; return stage.locate(t, id); },
    subjects(t) { return stage.subjects(t); },
    sheetStart(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); sheet = { c, g }; },
    /** draw the frame at t into the tile [x, y, w, h]; crop: null = whole frame, an actor id = zoom on him (head + upper body) */
    sheetTile(t, x, y, w, h, crop, label) {
      const { g } = sheet;
      if (lastT !== t) { stage.renderAt(t); lastT = t; }
      const W = stage.out.width, H = stage.out.height;
      let sx = 0, sy = 0, sw = W, sh = H, found = null;
      if (crop) {
        found = stage.locate(t, crop);
        if (found) {
          sh = Math.min(H, found.r * 4.6); sw = Math.min(W, sh * w / h); sh = sw * h / w;
          sx = Math.max(0, Math.min(W - sw, found.x - sw / 2)); sy = Math.max(0, Math.min(H - sh, found.y - found.r * 1.3));
        }
      }
      g.drawImage(stage.out, sx, sy, sw, sh, x, y, w, h);
      if (label) {
        const fs = Math.max(11, Math.min(18, Math.round(w / 26)));
        g.font = `600 ${fs}px Fredoka, sans-serif`;
        const lines = wrap(g, label, w - 8).slice(0, 3);
        g.fillStyle = 'rgba(0,0,0,0.62)'; g.fillRect(x, y, w, lines.length * (fs + 3) + 6);
        g.fillStyle = '#fff'; lines.forEach((l, i) => g.fillText(l, x + 4, y + 3 + fs + i * (fs + 3)));
      }
      return !!found;
    },
    sheetText(x, y, text, size = 22, color = '#222', maxW = 2000) {
      const { g } = sheet; g.font = `600 ${size}px Fredoka, sans-serif`; g.fillStyle = color;
      wrap(g, text, maxW).forEach((l, i) => g.fillText(l, x, y + size + i * (size + 4)));
    },
    sheetEnd(type = 'image/jpeg', q = 0.88) { const d = sheet.c.toDataURL(type, q); sheet = null; return d; },
    info(t) { const s = sceneAt(tl, t); const b = beatAt(s, t); return { scene: s.id, beat: b?.index, text: b?.def?.text || null }; },
  };
  window.__stage = stage; // handy for debugging from devtools / playwright
  window.__ready = true;
  if (params.has('t')) stage.renderAt(parseFloat(params.get('t')));
}

boot().catch((e) => { window.__error = String(e?.stack || e); console.error(e); document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88">${e.stack || e}</pre>`); });
