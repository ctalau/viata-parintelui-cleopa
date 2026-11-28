import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';
import { startPreview } from './studio-preview.mjs';
import { DEFAULT_EPISODE_ID } from '../studio/episode.mjs';
import { serve } from './engine/serve.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string', default: 'foaie-cadre.png' },
    columns: { type: 'string', default: '3' },
    width: { type: 'string', default: '384' },
  },
});
const [clip, ...items] = positionals;
const frames = items.flatMap((arg) => arg.split(',')).map(Number);
const columns = Number(values.columns);
const width = Number(values.width);
const isEpisode = clip === 'episod';
if (!/^[a-z0-9-]+$/.test(clip ?? '') || !frames.length || frames.length > 48 ||
    frames.some((frame) => !Number.isSafeInteger(frame) || frame < 1) ||
    !Number.isInteger(columns) || columns < 1 || columns > 8 ||
    !Number.isInteger(width) || width < 160 || width > 960 || width % 16 !== 0) {
  throw new Error('Utilizare: npm run sheet -- episod 1 1485 2879 [--out foaie.png]. Pentru un clip de atelier, înlocuiește episod cu ID-ul clipului.');
}
const height = width*9/16;
const server = isEpisode ? await serve() : await startPreview(0);
let browser;
try {
  browser = await chromium.launch({
    ...(process.env.CHROMIUM_BIN && { executablePath: process.env.CHROMIUM_BIN }),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error(error.message));
  const base = `http://127.0.0.1:${server.address().port}`;
  const pathname = isEpisode
    ? `/tools/engine/still.html?ep=${DEFAULT_EPISODE_ID}&w=${width}&playback`
    : `/asamblare/?clip=${clip}&export`;
  await page.goto(base + pathname);
  await page.waitForFunction((episode) => episode ? window.gata : window.captureClip, isEpisode);
  const media = await page.evaluate(async ({ clip, isEpisode, frames, columns, width, height }) => {
    const film = isEpisode ? window.stage : window.captureClip;
    if (!isEpisode && film.id !== clip) throw new Error(`Clip necunoscut: ${clip}`);
    const fps = film.fps ?? 24;
    const end = isEpisode ? film.frames : Math.ceil(film.duration * fps);
    if (frames.some((frame) => frame > end)) throw new Error(`Ultimul cadru disponibil este ${end}.`);
    const gutter = 10;
    const cellHeight = height + 35;
    const cols = Math.min(columns, frames.length);
    const canvas = document.createElement('canvas');
    canvas.width = cols * (width + gutter) + gutter;
    canvas.height = Math.ceil(frames.length / cols) * (cellHeight + gutter) + gutter;
    const pen = canvas.getContext('2d');
    pen.fillStyle = '#261e18';
    pen.fillRect(0, 0, canvas.width, canvas.height);
    pen.font = '14px system-ui';
    pen.fillStyle = '#fae5bf';

    for (const [index, frame] of frames.entries()) {
      const x = gutter + index % cols * (width + gutter);
      const y = gutter + Math.floor(index / cols) * (cellHeight + gutter);
      const time = (frame - 1) / fps;
      const image = new Image();
      image.src = isEpisode
        ? window.frameAt(time)
        : 'data:image/png;base64,' + await film.png(time, width, height);
      await image.decode();
      pen.drawImage(image, x, y, width, height);
      pen.fillText(`Three.js · cadru ${frame} · ${time.toFixed(2)} s`, x, y + height + 21);
    }
    return canvas.toDataURL('image/png').split(',')[1];
  }, { clip, isEpisode, frames, columns, width, height });
  const output = resolve(values.out);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(media, 'base64'));
  console.log(output);
} finally {
  await browser?.close();
  server.close();
}
