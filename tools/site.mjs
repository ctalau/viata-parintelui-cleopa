// The web catalog: one page per film (played live in the browser — three.js + Web Audio, no MP4) + an index.
//
//   node tools/site.mjs            # build the static site into dist/ (what Vercel deploys, see vercel.json)
//   node tools/site.mjs --list     # films that will be published, with their duration and audio status
//   npm run preview                # dev server with the same pages, straight from the repo (tools/serve.mjs)
//
// A film is published when videos/<NNN-slug>/video.json exists (folders starting with "_" are skipped) and all its
// lines are voiced. The site keeps the repo layout (/lib, /videos/<id>/…; three.js under /vendor/three@<version>/…) so the
// engine's imports work unchanged; every film page is /<id>/.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { ROOT, loadVideo, parseArgs } from './lib/common.mjs';

const esc = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`;
const PORTRAIT_SOURCE = 'experiments/portret-cleopa/web';
const PORTRAIT_ROUTE = 'experiments/fetita-raider';

export function version() {
  const v = process.env.VERCEL_GIT_COMMIT_SHA;
  if (v) return v.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; }
}

export function listTodos() {
  const dir = path.join(ROOT, 'todo');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort().map((name) => {
    const markdown = fs.readFileSync(path.join(dir, name), 'utf8');
    const title = /^#\s+(.+)$/m.exec(markdown)?.[1] || name.replace(/\.md$/, '');
    const paragraphs = markdown.split(/\n\s*\n/).map((p) => p.trim())
      .filter((p) => p && !p.startsWith('#') && !p.startsWith('**Izvor'))
      .map((p) => p.replace(/^\*\*Tâlc:\*\*\s*/, '').replace(/\*\*/g, ''));
    return { title, summary: paragraphs[0] || '', lesson: paragraphs[1] || '' };
  });
}

export function listFilms({ all = false } = {}) {
  const vdir = path.join(ROOT, 'videos');
  const films = [];
  for (const id of fs.readdirSync(vdir).sort()) {
    const dir = path.join(vdir, id);
    if (!fs.existsSync(path.join(dir, 'video.json'))) continue;
    // `_` films (galleries, shorts) stay out of the catalog — and out of the YouTube publish — unless they ask for the
    // catalog (`"catalog": true`: a short to watch in the Vercel preview, never auto-published)
    if (id.startsWith('_') && !all && !JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8')).catalog) continue;
    const { desc, timeline: tl } = loadVideo(dir);
    const yt = fs.existsSync(path.join(dir, 'youtube.json')) ? JSON.parse(fs.readFileSync(path.join(dir, 'youtube.json'), 'utf8')) : null;
    films.push({ id, dir, desc, title: desc.title || id, lesson: desc.lesson || '', source: desc.source || '', duration: tl.duration,
      missingAudio: tl.missingAudio, poster: fs.existsSync(path.join(dir, 'poster.jpg')),
      music: desc.music !== false && fs.existsSync(path.join(dir, 'audio', 'music.mp3')),
      audioFiles: [...new Set([...tl.speeches, ...tl.sounds].map((s) => s.file).filter(Boolean))], youtube: yt?.url || null });
  }
  return films;
}

// the house logo (same as lib/engine/overlay.js → LOGOS.flat): flat yellow brick, blue Orthodox cross with the slanted foot rest
const LOGO_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 116 109"><rect width="116" height="109" rx="18" fill="rgba(20,24,40,0.42)"/>'
  + '<g fill="#f5c518" stroke="#9a6f00" stroke-width="2.5" stroke-linejoin="round"><rect x="24" y="12" width="26" height="17" rx="4"/><rect x="66" y="12" width="26" height="17" rx="4"/><rect x="12" y="25" width="92" height="72" rx="9"/></g>'
  + '<g fill="#1f4fa8"><rect x="52.5" y="37" width="11" height="48"/><rect x="37" y="46.5" width="42" height="11"/><rect x="45" y="70.5" width="26" height="7" transform="rotate(22.9 58 74)"/></g></svg>';
const LOGO_URI = 'data:image/svg+xml,' + encodeURIComponent(LOGO_SVG);
const head = (title, extra = '') => `<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="${LOGO_URI}">
<link rel="stylesheet" href="/lib/web/site.css">
<link rel="preload" href="/node_modules/@fontsource/fredoka/files/fredoka-latin-600-normal.woff2" as="font" type="font/woff2" crossorigin>
${extra}</head>`;

const top = `<header class="top wrap"><a class="brand" href="/"><img src="/assets/branding/logo-scoala-mic.webp" alt="Școala Evlaviei" width="36" height="36">Viața Părintelui Cleopa</a></header>`;

export function catalogHtml(films, ver = version(), todos = listTodos()) {
  // newest films first (ids start with their number: 013-… before 012-…; _gallery last in the preview)
  // a `_` film that asks for the catalog (a short, `"catalog": true`) comes first
  const rank = (f) => (f.desc?.catalog ? -1 : f.id.startsWith('_') ? 1 : 0);
  const order = [...films].sort((a, b) => (rank(a) - rank(b)) || b.id.localeCompare(a.id));
  const isShort = (f) => (f.desc?.format?.height || 0) > (f.desc?.format?.width || 1);
  const cards = order.map((f) => `
  <a class="card${isShort(f) ? ' short' : ''}" href="/${f.id}/" data-film="${esc(f.id)}" data-title="${esc(f.title)}">
    <div class="thumb">${f.poster ? `<img src="/videos/${f.id}/poster.jpg" alt="" loading="lazy" width="640" height="360">` : ''}
      <span class="num">${esc(f.id.slice(0, 3))}</span><span class="badge"></span><span class="dur">${mmss(f.duration)}</span></div>
    <div class="txt"><h2>${esc(f.title)}</h2><p>${esc(f.lesson)}</p>
      <div class="meta">${f.missingAudio ? `<span class="warn">${f.missingAudio} replici fără voce</span>` : ''}${f.youtube ? '<span>pe YouTube</span>' : ''}</div></div>
  </a>`).join('');
  return `${head('Povești din Pateric — filmulețe pentru copii')}
<body data-version="${esc(ver)}">
${top}
<main class="wrap">
  <p class="intro">Filmulețe animate cu figurine din cărămizi, după povestiri din Patericul ortodox, pentru copii de 4 ani. Deschide un film, dă-i play și raportează cu steagul ce nu e bine, la secunda unde se vede.</p>
  <p><a class="btn" href="/pateric/dashboard/">Dashboard editorial — surse și progres</a></p>
  <p><a class="btn" href="/${PORTRAIT_ROUTE}/">Experiment · Portrete 3D</a></p>
  <details class="todo-box">
    <summary class="btn">Arată lista de povești în așteptare (${todos.length})</summary>
    <ul class="todo-list">${todos.map((todo) => '<li><h2>' + esc(todo.title) + '</h2><p>' + esc(todo.summary) + '</p>' + (todo.lesson ? '<p class="todo-lesson"><strong>Tâlc:</strong> ' + esc(todo.lesson) + '</p>' : '') + '</li>').join('')}</ul>
  </details>
  <div class="grid">${cards}
  </div>
  <div class="all-issues"><span></span><button class="btn">Copiază toate problemele</button></div>
</main>
<footer class="wrap">${films.length} filme${ver ? ` · versiunea ${esc(ver)}` : ''}</footer>
<script type="module" src="/lib/web/catalog.js"></script>
</body>
</html>
`;
}

const I = {
  play: '<svg class="playi" viewBox="0 0 24 24" width="22" height="22"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg><svg class="pause" viewBox="0 0 24 24" width="22" height="22"><rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor"/></svg>',
  flag: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 21V4m0 0h11l-2 4 2 4H5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  full: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

export function playerHtml(f, ver = version()) {
  return `${head(`${f.title} — Povești din Pateric`, `<script type="importmap">
{ "imports": { "three": "/${THREE_DIR}/build/three.module.js", "three/addons/": "/${THREE_DIR}/examples/jsm/", "three-mesh-bvh": "/vendor/three-mesh-bvh/src/index.js" } }
</script>
<link rel="modulepreload" href="/${THREE_DIR}/build/three.module.js">
`)}
<body data-film="${esc(f.id)}"${(f.desc?.format?.height || 0) > (f.desc?.format?.width || 1) ? ' data-portrait' : ''} data-version="${esc(ver)}">
${top}
<main class="wrap">
  <div class="film-head"><h1>${esc(f.title)}</h1><p class="lesson">${esc(f.lesson)}</p></div>
  <div class="player" id="screen">
    <div class="view">
      <canvas id="out" aria-label="${esc(f.title)}"></canvas>
      ${f.poster ? `<img class="poster" src="/videos/${f.id}/poster.jpg" alt="">` : ''}
      <div class="spin"></div>
    </div>
    <div class="controls">
        <button id="play" class="icon" aria-label="Redă" title="Redă / pauză (spațiu)">${I.play}</button>
        <input id="seek" type="range" min="0" max="1" step="0.01" value="0" aria-label="Timp">
        <span id="time">0:00.0 / ${mmss(f.duration)}</span>
        <button id="flag" class="icon" aria-label="Raportează o problemă la secunda curentă" title="Raportează o problemă aici (R)">${I.flag}</button>
        <button id="full" class="icon" aria-label="Ecran complet" title="Ecran complet (F)">${I.full}</button>
    </div>
    <div class="jumps" role="group" aria-label="Sari în timp">
      <button type="button" class="jump" data-d="-5" title="Înapoi 5 secunde">−5 s</button>
      <button type="button" class="jump" data-d="-0.5" title="Înapoi o jumătate de secundă">−½ s</button>
      <button type="button" class="jump" data-d="0.5" title="Înainte o jumătate de secundă">+½ s</button>
      <button type="button" class="jump" data-d="5" title="Înainte 5 secunde">+5 s</button>
    </div>
  </div>
  <p class="keys"><kbd>spațiu</kbd> play/pauză · <kbd>←</kbd><kbd>→</kbd> ±1 s (<kbd>shift</kbd> ±5 s) · <kbd>,</kbd><kbd>.</kbd> cadru cu cadru · <kbd>R</kbd> raportează · <kbd>F</kbd> ecran complet</p>

  <section class="issues-box">
    <header><h2>Probleme raportate <span id="count"></span></h2>
      <button id="copy" class="btn" disabled>Copiază pentru feedback</button>
      <button id="clear" class="btn ghost" disabled>Șterge tot</button></header>
    <ul id="issues"></ul>
  </section>
</main>
<footer class="wrap">${esc(f.source)}${f.youtube ? ` · <a href="${esc(f.youtube)}">YouTube</a>` : ''}${ver ? ` · versiunea ${esc(ver)}` : ''}</footer>

<dialog id="report">
  <form id="report-form" method="dialog">
    <h3>Problemă la <span class="at" id="report-at">0:00.0</span>
      <button type="button" class="nudge" id="nudge-back" title="−0,5 s">−½ s</button><button type="button" class="nudge" id="nudge-fwd" title="+0,5 s">+½ s</button></h3>
    <p class="ctx" id="report-line"></p>
    <textarea id="note" placeholder="Ce nu e bine aici? (ex.: mâna intră în tejghea, nu se vede fața lui Avva…)" required></textarea>
    <div class="row"><button type="button" class="btn ghost" id="report-cancel">Renunță</button><button class="btn" type="submit">Salvează</button></div>
  </form>
</dialog>
<script type="module" src="/lib/web/player.js" onerror="loadFailed()"></script>
<script>
// a module that cannot be loaded (or a frame that never comes) must not leave the spinner turning forever
function loadFailed(msg) {
  if (document.body.classList.contains('ready') || document.body.classList.contains('failed')) return;
  document.body.classList.add('failed');
  var v = document.querySelector('.view'); if (v) v.insertAdjacentHTML('beforeend', '<pre class="err">' + (msg || 'Filmul nu s-a putut încărca. Reîncărcați pagina (Ctrl+Shift+R).') + '</pre>');
}
setTimeout(function () { loadFailed('Filmul se încarcă greu. Reîncărcați pagina (Ctrl+Shift+R); dacă tot nu merge, trimiteți-ne numele browserului.'); }, 90000);
</script>
</body>
</html>
`;
}

/** Files of the site, as [from (repo-relative), to (site-relative)] — shared by build() and the dev server. */
function copyList(films) {
  const list = [];
  const walk = (rel, filter = () => true) => {
    const abs = path.join(ROOT, rel);
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = path.join(rel, e.name);
      if (e.isDirectory()) walk(r, filter); else if (filter(r)) list.push(r);
    }
  };
  walk('lib', (r) => /\.(js|css)$/.test(r) && !r.endsWith('render.html'));
  if (fs.existsSync(path.join(ROOT, PORTRAIT_SOURCE))) walk(PORTRAIT_SOURCE);
  if (fs.existsSync(path.join(ROOT, 'assets'))) walk('assets', (r) => /\.(jpe?g|png|webp|glb|json)$/i.test(r) && !/\/_preview\//.test(r));
  // the "blender" style (lib/engine3/): GLTFLoader + the collision BVH
  list.push('node_modules/three/examples/jsm/loaders/GLTFLoader.js');
  if (fs.existsSync(path.join(ROOT, 'node_modules/three-mesh-bvh/src'))) walk('node_modules/three-mesh-bvh/src', (r) => r.endsWith('.js'));
  list.push('node_modules/three/build/three.module.js');
  walk('node_modules/three/examples/jsm/utils');
  list.push('node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js'); // blocky figures ("style": "blocky")
  // the "render": "vivid" look (lib/engine/stage.js imports them statically — a missing one stops EVERY film from loading)
  walk('node_modules/three/examples/jsm/postprocessing');
  walk('node_modules/three/examples/jsm/shaders');
  list.push('node_modules/three/examples/jsm/environments/RoomEnvironment.js', 'node_modules/three/examples/jsm/math/SimplexNoise.js');
  for (const f of ['fredoka-latin-600-normal.woff2', 'fredoka-latin-ext-600-normal.woff2']) list.push(`node_modules/@fontsource/fredoka/files/${f}`);
  for (const f of films) {
    const v = `videos/${f.id}`;
    list.push(`${v}/video.json`);
    if (fs.existsSync(path.join(ROOT, v, 'audio/lines.json'))) list.push(`${v}/audio/lines.json`);
    for (const a of f.audioFiles) if (fs.existsSync(path.join(ROOT, v, 'audio', a))) list.push(`${v}/audio/${a}`);
    if (f.music) list.push(`${v}/audio/music.mp3`);
    if (f.poster) list.push(`${v}/poster.jpg`);
  }
  return list;
}

// three.js is published under a versioned folder (/vendor/three@x.y.z/…) — immutable, so browsers may cache it for good and a
// cached answer from an older deploy (e.g. a 404 of a module that was missing then) can never hide the current files
const THREE_VER = JSON.parse(fs.readFileSync(path.join(ROOT, 'node_modules/three/package.json'), 'utf8')).version;
const THREE_DIR = `vendor/three@${THREE_VER}`;
function published(rel) {
  if (rel.startsWith(PORTRAIT_SOURCE + '/')) return PORTRAIT_ROUTE + rel.slice(PORTRAIT_SOURCE.length);
  if (rel.startsWith('node_modules/three/')) return THREE_DIR + rel.slice('node_modules/three'.length);
  if (rel.startsWith('node_modules/three-mesh-bvh/')) return 'vendor/' + rel.slice('node_modules/'.length);
  return rel;
}

export function build(out = path.join(ROOT, 'dist')) {
  const films = listFilms();
  const ver = version();
  fs.rmSync(out, { recursive: true, force: true });
  let bytes = 0;
  for (const rel of copyList(films)) {
    const to = path.join(out, published(rel));
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(path.join(ROOT, rel), to);
    bytes += fs.statSync(to).size;
  }
  fs.writeFileSync(path.join(out, 'index.html'), catalogHtml(films, ver));
  for (const f of films) {
    fs.mkdirSync(path.join(out, f.id), { recursive: true });
    fs.writeFileSync(path.join(out, f.id, 'index.html'), playerHtml(f, ver));
  }
  fs.writeFileSync(path.join(out, 'films.json'), JSON.stringify(films.map(({ id, title, lesson, duration, missingAudio, youtube }) => ({ id, title, lesson, duration: +duration.toFixed(2), missingAudio, youtube, url: `/${id}/` })), null, 1));
  // Keep the research tree together: dashboard URLs point to sibling PDF/text folders.
  const pateric = path.join(ROOT, 'todo', 'pateric');
  if (fs.existsSync(path.join(pateric, 'dashboard', 'index.html'))) {
    fs.cpSync(pateric, path.join(out, 'pateric'), { recursive: true });
  }
  return { films, bytes, out };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'tools', 'site.mjs')) {
  const args = parseArgs();
  if (args.list) {
    for (const f of listFilms()) console.log(`${f.id.padEnd(36)} ${mmss(f.duration).padStart(5)}  ${f.missingAudio ? `⚠ ${f.missingAudio} lines without audio` : 'voices ok'}${f.music ? ', music' : ', NO music'}${f.poster ? ', poster' : ', no poster'}${f.youtube ? ', youtube' : ''}`);
  } else {
    const { films, bytes, out } = build(args.out ? path.resolve(args.out) : undefined);
    const warn = films.filter((f) => f.missingAudio);
    console.log(`Site built in ${path.relative(ROOT, out) || out}/: ${films.length} films, ${(bytes / 1e6).toFixed(1)} MB (version ${version() || '?'})`);
    for (const f of warn) console.warn(`⚠ ${f.id}: ${f.missingAudio} lines without audio`);
    for (const f of films) for (const audio of f.audioFiles) {
      if (!fs.existsSync(path.join(f.dir, 'audio', audio))) console.warn(`⚠ ${f.id}: missing audio/${audio}`);
    }
  }
}
