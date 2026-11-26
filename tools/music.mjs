// Generate background music (audio/music.mp3) with Lyria via OpenRouter from desc.music.prompt.
//   node tools/music.mjs videos/001-x [--prompt "..."] [--force]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, resolveVideoDir, loadVideo, ROOT } from './lib/common.mjs';
import { music } from './lib/openrouter.mjs';

const args = parseArgs();
const dir = resolveVideoDir(args._[0]);
const { desc } = loadVideo(dir);
const out = path.join(dir, 'audio', 'music.mp3');
if (fs.existsSync(out) && !args.force) { console.log('music.mp3 exists (use --force to regenerate)'); process.exit(0); }
const prompt = args.prompt || desc.music?.prompt;
if (!prompt) { console.error('No music prompt (desc.music.prompt or --prompt)'); process.exit(1); }
fs.mkdirSync(path.dirname(out), { recursive: true });
const buf = await music({ prompt, model: desc.music?.model });
fs.writeFileSync(out, buf);
console.log(`Saved ${path.relative(ROOT, out)} (${(buf.length / 1024).toFixed(0)} KB)`);
