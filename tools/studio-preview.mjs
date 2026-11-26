import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { ROOT } from './lib/common.mjs';
import { receiveFeedback } from '../studio/feedback.mjs';

const dist = path.join(ROOT, 'dist');
const feedbackDir = path.resolve(process.env.CLEOPA_FEEDBACK_DIR || path.join(ROOT, '.feedback'));
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.glb': 'model/gltf-binary', '.woff2': 'font/woff2',
};

function bytes(range, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match || (!match[1] && !match[2]) || !size) return null;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  return start <= end ? { start, end } : null;
}

async function respond(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/feedback') {
    const [code, value] = await receiveFeedback({ method: req.method, headers: req.headers, body: req }, async (note) => {
      await mkdir(feedbackDir, { recursive: true, mode: 0o700 });
      await writeFile(path.join(feedbackDir, `${note.id}.json`), JSON.stringify(note), { flag: 'wx', mode: 0o600 });
    });
    res.setHeader('Content-Type', types['.json']);
    res.setHeader('Cache-Control', 'no-store');
    if (code === 405) res.setHeader('Allow', 'POST');
    res.writeHead(code).end(JSON.stringify(value));
    return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let file = path.resolve(dist, `.${decodeURIComponent(url.pathname)}`);
  if (file !== dist && !file.startsWith(dist + path.sep)) return res.writeHead(404).end();
  let info = await stat(file);
  if (info.isDirectory()) {
    if (!url.pathname.endsWith('/')) return res.writeHead(308, { Location: `${url.pathname}/${url.search}` }).end();
    file = path.join(file, 'index.html');
    info = await stat(file);
  }
  if (!info.isFile()) return res.writeHead(404).end();
  const range = req.headers.range ? bytes(req.headers.range, info.size) : undefined;
  if (range === null) return res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end();
  const headers = {
    'Content-Type': types[path.extname(file)] || 'application/octet-stream',
    'Content-Length': range ? range.end - range.start + 1 : info.size,
    'Accept-Ranges': 'bytes',
  };
  if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`;
  res.writeHead(range ? 206 : 200, headers);
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(file, range);
  res.on('close', () => stream.destroy());
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

await stat(path.join(dist, 'index.html')).catch(() => {
  console.error('Rulează întâi npm run build.');
  process.exit(1);
});
const port = Number(process.env.PORT || '4173');
createServer((req, res) => respond(req, res).catch((error) => {
  if (res.headersSent) return res.destroy();
  if (error instanceof URIError) return res.writeHead(400).end();
  if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return res.writeHead(404).end();
  console.error(error);
  res.writeHead(500).end();
})).listen(port, '127.0.0.1', () => console.log(`Preview: http://127.0.0.1:${port}`));
