// A seamless (tileable) material texture painted by Nano Banana (OpenRouter), optionally after a reference picture, for the
// Blender sets: `tex.image_tex(path=…)` (blender/sets/kit/tex.py) turns it into colour + normal + roughness and blends the
// tile edges so it repeats without a seam.
//   node tools/texture-ai.mjs assets/textures/<name>.jpg "<what the surface is>" [--ref picture.jpg] [--size 1K|2K]
import fs from 'node:fs';
import { parseArgs } from './lib/common.mjs';
import { image } from './lib/openrouter.mjs';

const a = parseArgs();
const [out, what] = a._;
if (!out || !what) throw new Error('usage: texture-ai.mjs out.jpg "description" [--ref img]');
const prompt = `A seamless tileable square texture, seen perfectly flat and straight-on, filling the whole image edge to edge: ${what}. ` +
  'Even, soft, shadowless lighting (no light falloff, no vignette, no perspective), the pattern continues across all four edges so ' +
  'the tile repeats without a seam. Warm storybook toy style. No objects, no frame, no border, no text, no letters, no labels.' +
  (a.ref ? ' Match the colours, the shapes and the style of the surface in the reference picture.' : '');
const buf = await image({ prompt, refs: a.ref ? [a.ref] : [], model: 'google/gemini-3.1-flash-image', aspect: '1:1', size: a.size || '1K' });
fs.writeFileSync(out, buf);
console.log('written', out);
