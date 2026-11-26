#!/usr/bin/env node
// A YouTube / catalog poster painted by an image model (GPT Image 2 on OpenRouter) after reference pictures
// (e.g. an earlier poster for the style + the house badge, a still of the film for the characters).
//   node tools/poster-ai.mjs videos/<id> --prompt prompt.txt --ref videos/042-copilul-vindecat/poster.jpg --ref stills/x.png [--model …] [--out file] [--portrait]
// Writes videos/<id>/poster.jpg at 1920×1080 (set "poster": "file" in video.json so the tools keep it).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { image } from './lib/openrouter.mjs';

const a = process.argv.slice(2);
const dir = a.find((x) => !x.startsWith('--') && !a[a.indexOf(x) - 1]?.startsWith('--'));
const opts = (k) => a.flatMap((x, i) => (x === '--' + k ? [a[i + 1]] : []));
const prompt = fs.readFileSync(opts('prompt')[0], 'utf8');
const out = opts('out')[0] || path.join(dir, 'poster.jpg');
const tall = a.includes('--portrait');   // a vertical film (a Short): 1080×1920
const [W, H] = tall ? [1080, 1920] : [1920, 1080];
const buf = await image({ prompt, refs: opts('ref'), model: opts('model')[0] || undefined, aspect: tall ? '9:16' : '16:9' });
const raw = out.replace(/\.jpg$/, '') + '.raw.png';
fs.writeFileSync(raw, buf);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-vf', `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H}`, '-q:v', '2', out]);
fs.rmSync(raw);
console.log(`poster → ${out}`);
