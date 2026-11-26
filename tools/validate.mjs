// Validate a video descriptor and print a timing summary (no browser needed).
//   node tools/validate.mjs videos/001-x [--beats]
import { parseArgs, resolveVideoDir, loadVideo } from './lib/common.mjs';
import { GESTURES, EMOTIONS, POSTURES, asArray } from '../lib/engine/timeline.js';
// these modules import three.js, which is fine in Node (no DOM is touched at import time)
import { LOOKS } from '../lib/components/minifig.js';
import { PROPS } from '../lib/components/props.js';
import { PROPS2D } from '../lib/engine2d/scenery.js';
import { LOOKS2D } from '../lib/engine2d/figure.js';
import { blenderMetas } from './lib/common.mjs';
import { gestureDurations } from '../lib/engine3/timeline3.js';
import { LOOK_PRESETS } from '../lib/engine3/character.js';
import { motionLint } from '../lib/engine3/motionlint.js';
import { stageLint } from '../lib/engine3/stagelint.js';
import { setColliders } from './lib/glbcol.mjs';
import fs from 'node:fs';

const SHOTS = ['wide', 'medium', 'close', 'two', 'prop', 'top'];

const args = parseArgs();
const dir = resolveVideoDir(args._[0]);
const { desc, timeline: tl } = loadVideo(dir);
const PROP_TYPES = desc.engine === '2d' ? Object.keys(PROPS2D) : Object.keys(PROPS); // "engine": "2d" films use the 2D props
const errs = [...tl.warnings];
const blender = desc.style === 'blender';
const GEST = blender ? gestureDurations(blenderMetas(desc).charMeta) : GESTURES;
const LOOKSET = blender ? { ...LOOK_PRESETS, 'elder-monk': 1, 'young-monk': 1 } : desc.engine === '2d' ? LOOKS2D : LOOKS;
if (blender) { try { for (const f of fs.readdirSync(new URL('../assets/props/', import.meta.url))) if (f.endsWith('.glb')) PROP_TYPES.push(f.slice(0, -4)); } catch { /* no GLB props yet */ } }
for (const [id, c] of Object.entries(desc.characters || {})) {
  if (c.look?.preset && !LOOKSET[c.look.preset]) errs.push(`character ${id}: unknown look preset "${c.look.preset}" (${Object.keys(LOOKSET).join(', ')})`);
  // voice-only characters (the narrator, holy persons — AGENTS.md rule 15) have no look and are never in a cast
  if (!c.look && (desc.scenes || []).some((sc) => sc.cast && sc.cast[id])) errs.push(`character ${id}: is in a cast but has no "look" (voice-only characters must stay off stage)`);
  if (!c.voice?.voice && tl.speeches.some((s) => s.speaker === id)) errs.push(`character ${id}: speaks but has no voice.voice`);
}
for (const sc of desc.scenes || []) {
  for (const [pid, p] of Object.entries(sc.props || {})) if (!PROP_TYPES.includes(p.type || pid)) errs.push(`scene ${sc.id}: prop "${pid}" unknown type "${p.type}"`);
  for (const [i, b] of (sc.beats || []).entries()) {
    const where = `scene ${sc.id} beat ${i}`;
    if (b.camera && !SHOTS.includes(b.camera.shot)) errs.push(`${where}: unknown shot "${b.camera.shot}"`);
    if (b.emotion && !EMOTIONS.includes(b.emotion)) errs.push(`${where}: unknown emotion "${b.emotion}"`);
    if (!b.say && !b.do && !b.duration && !b.card) errs.push(`${where}: empty beat`);
    for (const a of asArray(b.do)) {
      if (a.gesture && a.prop && !a.actor) { if (!['bray', 'look'].includes(a.gesture) && !(desc.style === 'blender' && (a.gesture === 'unfurl' || /^bounce-[1-8]$/.test(a.gesture)))) errs.push(`${where}: unknown prop gesture "${a.gesture}" (animals: bray, look)`); }
      else if (a.gesture && !GEST[a.gesture]) errs.push(`${where}: unknown gesture "${a.gesture}"`);
      if (a.emotion && !EMOTIONS.includes(a.emotion)) errs.push(`${where}: unknown emotion "${a.emotion}"`);
      if (a.posture && !POSTURES.includes(a.posture) && !(desc.style === 'blender' && ['recline', 'kneeling', 'floor-sit', 'side-rest'].includes(a.posture))) errs.push(`${where}: unknown posture "${a.posture}"`);
    }
  }
}
// hints for the script (not errors): very short lines get garbled by the TTS (issue #33), long sentences lose a 4-year-old (rule 4)
const hints = [];
for (const sp of tl.speeches) {
  const words = sp.text.split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (sp.speaker !== 'narrator' && words.length < 5) hints.push(`${sp.speaker}: "${sp.text}" — only ${words.length} words: Gemini TTS often swallows very short lines (young voices most); make it 5+ words`);
  for (const sent of sp.text.split(/[.!?]+/)) { const n = sent.split(/\s+/).filter((w) => /\p{L}/u.test(w)).length; if (n > 12) hints.push(`${sp.speaker}: "${sent.trim()}" — ${n} words in one sentence (≤ 12 for 4-year-olds)`); }
}
console.log(`${desc.title} — ${tl.scenes.length} scenes, ${tl.speeches.length} lines, ${tl.duration.toFixed(1)}s` + (tl.missingAudio ? ` (${tl.missingAudio} lines without audio, timings estimated)` : ''));
for (const s of tl.scenes) {
  console.log(`  ${s.id.padEnd(14)} ${s.start.toFixed(1).padStart(6)}s → ${s.end.toFixed(1).padStart(6)}s  (${(s.end - s.start).toFixed(1)}s, ${s.beats.length} beats)`);
  if (args.beats) for (const b of s.beats) console.log(`      #${b.index} ${b.start.toFixed(1)}s ${b.speech ? b.speech.speaker + ': ' + b.speech.text.slice(0, 60) : '(action)'}`);
}
if (desc.poster == null) hints.push('no "poster" — compose the catalog card / YouTube thumbnail: "poster": { set, sky, cast, props, camera, do } (the main characters and objects up front, happy; DESCRIPTOR.md)');
// motion a reviewer would see (stop-and-go walks, a back turned to the camera): lib/engine3/motionlint.js
if (blender) for (const m of motionLint(tl)) hints.push('motion: ' + m);
// staging read from the timeline (people too close, walks through the set, crossing, head snaps): lib/engine3/stagelint.js
if (blender) {
  const cols = {};
  for (const sc of desc.scenes || []) if (sc.set?.type && !cols[sc.set.type]) cols[sc.set.type] = setColliders(sc.set.type);
  const metas = {};
  for (const t of Object.keys(cols)) { try { metas[t] = JSON.parse(fs.readFileSync(new URL(`../assets/sets/${t}.json`, import.meta.url), 'utf8')); } catch { /* procedural set */ } }
  for (const m of stageLint(tl, desc, cols, metas)) hints.push('staging ' + m);
}
if (hints.length) { console.log('\nHints:'); for (const h of hints) console.log('  · ' + h); }
if (errs.length) { console.log('\nProblems:'); for (const e of errs) console.log('  ✗ ' + e); process.exitCode = 1; } else console.log('\nOK ✓');
