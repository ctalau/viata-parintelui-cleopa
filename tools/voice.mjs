// /voice — generate one WAV per spoken line with OpenRouter TTS (Gemini voices).
// Files are content-addressed (hash of model+voice+prompt), so editing one line only re-voices that line.
//
//   node tools/voice.mjs videos/001-x            # voice all missing lines
//   node tools/voice.mjs videos/001-x --force    # re-voice everything (or --force macarie to redo one character)
//   node tools/voice.mjs videos/001-x --check    # transcribe each line and flag mismatches
//   node tools/voice.mjs videos/001-x --prune    # delete audio files no longer referenced
//   node tools/voice.mjs videos/001-x --sample macarie "Text de test"   # quick audition, not saved in manifest
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs, resolveVideoDir, loadVideo, ROOT, blenderMetas } from './lib/common.mjs';
import { compile3 } from '../lib/engine3/timeline3.js';
import { tts, transcribe } from './lib/openrouter.mjs';
import { compile, ttsRequest, DEFAULT_VOICE_MODEL } from '../lib/engine/timeline.js';

export const ENV_FPS = 30;

export function wavFromPcm(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Trim leading/trailing silence, return {pcm, env} where env is mouth-openness at ENV_FPS (0..1). */
/** Speed up / slow down speech without changing pitch (ffmpeg atempo). */
export function retime(pcm, rate, tempo) {
  if (!tempo || Math.abs(tempo - 1) < 0.01) return pcm;
  return execFileSync('ffmpeg', ['-loglevel', 'error', '-f', 's16le', '-ar', String(rate), '-ac', '1', '-i', 'pipe:0',
    '-af', `atempo=${tempo}`, '-f', 's16le', '-ar', String(rate), '-ac', '1', 'pipe:1'], { input: pcm, maxBuffer: 1 << 28 });
}

export function analyse(pcm, rate) {
  const n = pcm.length >> 1;
  const s = (i) => pcm.readInt16LE(i * 2) / 32768;
  const thr = 0.02, pad = Math.round(rate * 0.06);
  let a = 0, b = n - 1;
  while (a < n && Math.abs(s(a)) < thr) a++;
  while (b > a && Math.abs(s(b)) < thr) b--;
  a = Math.max(0, a - pad); b = Math.min(n - 1, b + pad);
  const out = pcm.subarray(a * 2, (b + 1) * 2);
  const m = out.length >> 1, win = Math.round(rate / ENV_FPS);
  const rms = [];
  for (let i = 0; i < m; i += win) {
    let acc = 0; const e = Math.min(m, i + win);
    for (let j = i; j < e; j++) { const v = out.readInt16LE(j * 2) / 32768; acc += v * v; }
    rms.push(Math.sqrt(acc / Math.max(1, e - i)));
  }
  const sorted = [...rms].sort((x, y) => x - y);
  const ref = sorted[Math.floor(sorted.length * 0.9)] || 1;
  const env = rms.map((v, i) => {
    const k = Math.min(1, v / (ref * 0.9));
    return Math.round((k < 0.12 ? 0 : k) * 100) / 100;
  });
  return { pcm: out, env, duration: m / rate };
}

/** Mix two mono s16 PCM buffers (each at 0.7 so voices together don't clip). */
export function mixPcm(x, y) {
  const n = Math.max(x.length, y.length) >> 1, out = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const a = i * 2 < x.length ? x.readInt16LE(i * 2) : 0, b = i * 2 < y.length ? y.readInt16LE(i * 2) : 0;
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((a + b) * 0.7))), i * 2);
  }
  return out;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

const args = parseArgs();
const dir = resolveVideoDir(args._[0]);
const { desc, manifest } = loadVideo(dir);
const audioDir = path.join(dir, 'audio');
fs.mkdirSync(audioDir, { recursive: true });
const model = desc.voiceModel || DEFAULT_VOICE_MODEL;
const mfPath = path.join(audioDir, 'lines.json');

if (args.sample) {
  const speaker = args.sample, text = args._[1] || 'Bună ziua, copii!';
  const beat = { say: speaker, text, style: args.style };
  const req = ttsRequest(desc, speaker, beat);
  const voice = args.voice || req.voice;
  const r = await tts({ ...req, voice });
  r.pcm = retime(r.pcm, r.rate, req.tempo);
  const out = path.join(audioDir, `_sample_${speaker}_${voice}.wav`);
  fs.writeFileSync(out, wavFromPcm(analyse(r.pcm, r.rate).pcm, r.rate));
  console.log('Sample:', path.relative(ROOT, out));
  process.exit(0);
}

// the blender style compiles with its own sets' anchors (assets/sets/*.json)
const compileAny = (d, m) => (d.style === 'blender' ? compile3(d, m, blenderMetas(d)) : compile(d, m));
const tl = compileAny(desc, {});
const lines = [...new Map(tl.speeches.map((s) => [s.key, s])).values()];
const force = args.force;
const todo = lines.filter((s) => force === true || force === s.speaker || !manifest[s.key] || !fs.existsSync(path.join(audioDir, manifest[s.key].file)));
console.log(`${lines.length} lines, ${todo.length} to voice with ${model}`);
let done = 0;
await pool(todo, parseInt(args.concurrency || 4), async (s) => {
  const beat = desc.scenes[tl.scenes.findIndex((x) => x.id === s.scene)].beats[s.beat];
  const req = ttsRequest(desc, s.speaker, beat);
  try {
    const r = await tts(req);
    let pcm = analyse(retime(r.pcm, r.rate, req.tempo), r.rate).pcm;
    // `with`: the same line said together by other characters — voice each, mix them (aligned at the first word)
    for (const w of [].concat(beat.with || [])) {
      const q = ttsRequest(desc, w, beat);
      const r2 = await tts(q);
      if (r2.rate !== r.rate) throw new Error(`with ${w}: sample rate ${r2.rate} ≠ ${r.rate}`);
      pcm = mixPcm(pcm, analyse(retime(r2.pcm, r2.rate, q.tempo), r2.rate).pcm);
    }
    const a = analyse(pcm, r.rate);
    const file = `${s.key}.wav`;
    fs.writeFileSync(path.join(audioDir, file), wavFromPcm(a.pcm, r.rate));
    manifest[s.key] = { file, duration: +a.duration.toFixed(3), envFps: ENV_FPS, env: a.env, speaker: s.speaker, voice: req.voice, text: s.text, instructions: req.instructions };
    console.log(`  ✓ [${++done}/${todo.length}] ${s.speaker.padEnd(9)} ${a.duration.toFixed(2)}s  ${s.text.slice(0, 60)}`);
  } catch (e) {
    console.error(`  ✗ ${s.speaker}: ${s.text.slice(0, 50)} -> ${e.message}`);
    process.exitCode = 1;
  }
  fs.writeFileSync(mfPath, JSON.stringify(manifest));
});
fs.writeFileSync(mfPath, JSON.stringify(manifest));

if (args.prune) {
  const keep = new Set(lines.map((s) => `${s.key}.wav`));
  for (const k of Object.keys(manifest)) if (!keep.has(manifest[k].file)) delete manifest[k];
  for (const f of fs.readdirSync(audioDir)) if (f.endsWith('.wav') && !keep.has(f)) { fs.unlinkSync(path.join(audioDir, f)); console.log('  pruned', f); }
  fs.writeFileSync(mfPath, JSON.stringify(manifest));
}

if (args.check) {
  // Gemini's transcription is noisy (issue #16): fold the usual mishearings, accept near-words (cald/caldă, ratacit/ratacise),
  // and use the loudness envelope to tell a truncated *transcription* from audio that really stops early.
  const ALIAS = { avva: 'ava', hava: 'ava', haba: 'ava', aba: 'ava', ava: 'ava', avvo: 'ava' };
  const norm = (x) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
    .split(' ').filter(Boolean).map((w) => ALIAS[w] || w);
  const lev = (a, b) => { const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length]; };
  const close = (w, heard) => heard.some((h) => h === w || (w.length >= 4 && h.slice(0, 2) === w.slice(0, 2) && lev(w, h) <= (w.length >= 7 ? 2 : 1)))
    || (w.length >= 5 && heard.join('').includes(w));   // split words: „a țipea” = „ațipea”
  console.log('Checking transcriptions…');
  const real = [], noise = [];
  // the transcription is random: a line flagged as a real problem is transcribed again and stays ⚠ only if it fails twice
  const judge = async (s, m) => {
    const heard = await transcribe(fs.readFileSync(path.join(audioDir, m.file)));
    const A = norm(s.text), H = norm(heard);
    const miss = A.filter((w) => !close(w, H));
    if (miss.length <= Math.max(1, A.length * 0.15) && H.length - A.length <= 3) return null;
    // where does the voice stop? last frame of the envelope above a whisper
    const env = m.env || []; let last = env.length - 1; while (last > 0 && env[last] < 0.15) last--;
    const speechEnd = last / (m.envFps || 30), tillEnd = m.duration - speechEnd < 0.6;
    const rate = A.length / Math.max(0.3, speechEnd);           // words per second actually spoken
    const onlyTail = miss.every((w) => A.indexOf(w) >= A.length - miss.length);
    const why = rate > 4.2 ? `too fast (${rate.toFixed(1)} words/s): words were probably swallowed — re-voice with a clearer style`
      : !tillEnd ? `the audio stops ${(m.duration - speechEnd).toFixed(1)}s before the end — re-voice`
      : onlyTail ? 'only the last words are missing but the voice goes on until the end: the transcription was cut (fine, issue #16)'
      : `${miss.length}/${A.length} words not heard: ${miss.join(', ')}`;
    return { item: { speaker: s.speaker, text: s.text, heard, dur: m.duration, why }, glitch: onlyTail && tillEnd && rate <= 4.2 };
  };
  await pool(lines, 4, async (s) => {
    const m = manifest[s.key]; if (!m) return;
    let r = await judge(s, m);
    if (r && !r.glitch) { const again = await judge(s, m); if (!again) return; r = again.glitch ? again : r; }
    if (r) (r.glitch ? noise : real).push(r.item);
  });
  if (!real.length && !noise.length) console.log('  all lines match ✓');
  for (const b of real) console.log(`  ⚠ ${b.speaker} (${b.dur.toFixed(1)}s): "${b.text}"\n      heard: "${b.heard}"\n      → ${b.why}`);
  for (const b of noise) console.log(`  · ${b.speaker} (${b.dur.toFixed(1)}s): "${b.text}"\n      heard: "${b.heard}"\n      → ${b.why}`);
  if (real.length) console.log(`  ${real.length} line(s) to listen to / re-voice (⚠); ${noise.length} transcription glitch(es) (·) can be ignored.`
    + '\n  Re-voice = change the text a little (new hash) or the style (e.g. "vorbește limpede și clar"), then run --check again.');
  else if (noise.length) console.log(`  only transcription glitches (·) — nothing to re-voice ✓`);
}

const tl2 = compileAny(desc, manifest);
console.log(`Total duration with real audio: ${tl2.duration.toFixed(1)}s (${tl2.missingAudio} missing)`);
