// Tiny static server for the repo root (used by `npm run preview` and by the recorder).
// It also serves the web catalog straight from the repo: / (all films, _gallery too) and /<id>/ (player of one film),
// the same pages tools/site.mjs builds into dist/ for Vercel.
// Usage: node tools/serve.mjs [videos/<id>] [--port 5173]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTRAIT_ROUTE = '/experiments/fetita-raider';
const PORTRAIT_SOURCE = '/experiments/portret-cleopa/web';
const PORTRAIT_PREVIOUS_ROUTE = '/experiments/portret-cleopa';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.glb': 'model/gltf-binary',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.css': 'text/css', '.mp4': 'video/mp4', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8' };

export function serve(port = 0) {
  const server = http.createServer((req, res) => {
    const queryStart = req.url.indexOf('?');
    const search = queryStart < 0 ? '' : req.url.slice(queryStart);
    const url = decodeURIComponent(queryStart < 0 ? req.url : req.url.slice(0, queryStart));
    if (url === PORTRAIT_PREVIOUS_ROUTE || url.startsWith(PORTRAIT_PREVIOUS_ROUTE + '/')) {
      const suffix = url.slice(PORTRAIT_PREVIOUS_ROUTE.length) || '/';
      res.writeHead(308, { Location: PORTRAIT_ROUTE + encodeURI(suffix) + search });
      return res.end();
    }
    if (url === '/pateric/dashboard' || url === PORTRAIT_ROUTE) {
      res.writeHead(308, { Location: url + '/' + search });
      return res.end();
    }
    const page = /^\/(?:([^/.]+)\/?)?$/.exec(url);
    if (page && (!page[1] || fs.existsSync(path.join(ROOT, 'videos', page[1], 'video.json')))) {
      return import('./site.mjs').then((site) => {
        const films = site.listFilms({ all: true });
        const f = page[1] && films.find((x) => x.id === page[1]);
        res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
        res.end(f ? site.playerHtml(f) : site.catalogHtml(films));
      }).catch((e) => { res.writeHead(500); res.end(String(e.stack || e)); });
    }
    // the catalog pages load three.js from /vendor/three@<version>/… (tools/site.mjs) = node_modules/three here
    // Match the deployed /pateric/ tree while preserving its sibling source links.
    let localUrl = url;
    if (url.startsWith('/pateric/')) localUrl = '/todo' + url + (url.endsWith('/') ? 'index.html' : '');
    if (url.startsWith(PORTRAIT_ROUTE + '/')) {
      localUrl = PORTRAIT_SOURCE + url.slice(PORTRAIT_ROUTE.length) + (url.endsWith('/') ? 'index.html' : '');
    }
    const file = path.join(ROOT, localUrl.replace(/^\/vendor\/three@[^/]+\//, '/node_modules/three/').replace(/^\/vendor\/three-mesh-bvh\//, '/node_modules/three-mesh-bvh/'));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    });
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const pi = args.indexOf('--port');
  const port = pi >= 0 ? +args[pi + 1] : 5173;
  const video = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--port');
  const { port: p } = await serve(port);
  console.log(`Catalog: http://localhost:${p}/`);
  if (video) console.log(`Film:    http://localhost:${p}/${path.basename(video.replace(/\/$/, ''))}/`);
}
