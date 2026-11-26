#!/usr/bin/env node
// Build + upload a parents' YouTube Short (shorts/<id>/) that leads to the full film already on the channel.
// The repo keeps only the SOURCES (Omni clips, keyframes, the story's video.json + voices, the build script);
// the MP4s are made here — normally in .github/workflows/youtube-short.yml (the session has no YouTube secrets).
//
//   node tools/short-youtube.mjs --pending [--build] [--dry-run]   # every short whose youtube.json is missing or outdated
//   node tools/short-youtube.mjs shorts/<id> [--build] [--dry-run] [--force]
//     --build: render the story on RunPod (tools/runpod.mjs, RUNPOD_API_KEY) → shorts/<id>/story.mp4, then run the
//              short's build script → shorts/<id>/<youtube.file>; without it the MP4 must already be there.
//
// shorts/<id>/short.json → "youtube": { "file": "001-x.mp4", "story": "_short-001-x", "build": "build-v2.mjs",
//   "film": "038-…", "title": "…", "description": "…", "tags": [] }
//   film = the full film (videos/<film>/youtube.json gives its URL, put in the description). The Short's "Related video"
//   can't be set through the YouTube Data API: the Studio link to set it by hand is printed (and in the run summary).
// Shorts are for PARENTS: not made for kids (youtube.madeForKids: true to change). shorts/<id>/poster.jpg is the thumbnail.
// A change of title / description / tags / made-for-kids / poster only is applied to the uploaded video (no re-upload).
// Writes shorts/<id>/youtube.json (committed) with a hash of the sources: when they change, the next run uploads a NEW
// Short and makes the old one private (YouTube can't replace a file; nothing is deleted).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { accessToken, resumableUpload } from './youtube.mjs';
import { ROOT, env } from './lib/common.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run'), force = args.includes('--force'), build = args.includes('--build');
const read = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const specOf = (d) => read(path.join(d, 'short.json'));
const kids = (spec) => spec.youtube?.madeForKids ?? false;
const ytOf = (d) => (fs.existsSync(path.join(d, 'youtube.json')) ? read(path.join(d, 'youtube.json')) : null);

/** Hash of what the Short's MP4 is made from: the Omni clips it uses (entries + results), the build script, the story film.
 *  (Title, description, poster, made-for-kids are not in it: they are updated on the uploaded video, see syncHash.) */
export function shortHash(dir) {
  const spec = specOf(dir), y = spec.youtube, h = crypto.createHash('sha256');
  const script = y.build && fs.existsSync(path.join(dir, y.build)) ? fs.readFileSync(path.join(dir, y.build), 'utf8') : '';
  const used = spec.clips.filter((c) => script.includes(`'${c.id}'`));
  h.update(JSON.stringify({ file: y.file, story: y.story, build: y.build, clips: used }));
  const files = [y.build && path.join(dir, y.build), ...used.map((c) => path.join(dir, 'clips', `${c.id}.json`))].filter(Boolean);
  if (y.story) files.push(...['video.json', 'audio/lines.json'].map((f) => path.join(ROOT, 'videos', y.story, f)));
  for (const f of files) if (fs.existsSync(f)) h.update(path.relative(ROOT, f)).update(fs.readFileSync(f));
  return h.digest('hex').slice(0, 16);
}
/** Hash of what can change on the uploaded video without a re-upload: title, description, tags, made for kids, poster.jpg. */
export function syncHash(dir, filmUrl) {
  const h = crypto.createHash('sha256').update(JSON.stringify(shortMeta(specOf(dir), filmUrl)));
  const poster = path.join(dir, 'poster.jpg');
  if (fs.existsSync(poster)) h.update(fs.readFileSync(poster));
  return h.digest('hex').slice(0, 16);
}
const filmOf = (spec) => { const f = spec.youtube.film && path.join(ROOT, 'videos', spec.youtube.film, 'youtube.json'); return f && fs.existsSync(f) ? read(f) : null; };

/** thumbnails.set with shorts/<id>/poster.jpg (needs a phone-verified channel). */
async function setPoster(token, dir, videoId) {
  const poster = path.join(dir, 'poster.jpg');
  if (!fs.existsSync(poster)) return;
  const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, { method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'image/jpeg' }, body: fs.readFileSync(poster) });
  console.log(r.ok ? '  poster.jpg set as thumbnail' : `  thumbnail not set: ${r.status} ${(await r.text()).slice(0, 200)}`);
}

if (args.includes('--rehash')) {   // only the hash formula changed, not the MP4's sources: record the new hash, no upload
  for (const d of args.filter((x) => !x.startsWith('--')).map((x) => path.resolve(x))) {
    fs.writeFileSync(path.join(d, 'youtube.json'), JSON.stringify({ ...ytOf(d), source: shortHash(d) }, null, 2) + '\n'); console.log(`${path.basename(d)}: source = ${shortHash(d)}`);
  }
  process.exit(0);
}
const dirs = args.includes('--pending')
  ? fs.readdirSync(path.join(ROOT, 'shorts')).map((d) => path.join(ROOT, 'shorts', d))
      .filter((d) => fs.existsSync(path.join(d, 'short.json')) && specOf(d).youtube && (ytOf(d)?.source !== shortHash(d) || ytOf(d).sync !== syncHash(d, filmOf(specOf(d))?.url)))
  : args.filter((a) => !a.startsWith('--')).map((a) => path.resolve(a));
if (!dirs.length) { console.log(args.includes('--pending') ? 'no pending shorts' : 'usage: node tools/short-youtube.mjs shorts/<id> | --pending [--build] [--dry-run] [--force]'); process.exit(0); }

export function shortMeta(spec, filmUrl) {
  const y = spec.youtube;
  let title = y.title || spec.title;
  if (!/#shorts/i.test(title)) title = `${title} #Shorts`;
  const description = [y.description || '', '', filmUrl ? `▶ Povestea întreagă: ${filmUrl}` : '', '',
    'Vocile sunt generate cu inteligență artificială; începutul e generat video cu AI, povestea e animată din cod.', '', '#Shorts #povestipentrucopii #Pateric']
    .filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n').trim();
  return {
    snippet: { title: title.slice(0, 100), description: description.slice(0, 4900), tags: y.tags || ['Shorts', 'povești pentru copii', 'Pateric', 'iertare', 'părinți'],
      categoryId: String(y.categoryId || env('YOUTUBE_CATEGORY_ID') || 22), defaultLanguage: 'ro', defaultAudioLanguage: 'ro' },
    status: { privacyStatus: y.privacy || 'public', selfDeclaredMadeForKids: kids(spec), embeddable: true, license: 'youtube', containsSyntheticMedia: y.syntheticMedia ?? false },
  };
}

const run = (cmd, a) => execFileSync(cmd, a, { cwd: ROOT, stdio: 'inherit' });

for (const dir of dirs) {
  const id = path.basename(dir), spec = specOf(dir), y = spec.youtube, prev = ytOf(dir), hash = shortHash(dir);
  if (!y?.file) throw new Error(`${id}: short.json has no youtube.file`);
  if (prev?.source === hash && !force) {
    const film = filmOf(spec), sync = syncHash(dir, film?.url);
    if (prev.sync === sync) { console.log(`${id}: already uploaded (${prev.url}), unchanged — skipped`); continue; }
    const meta = shortMeta(spec, film?.url);
    console.log(`${id}: ${prev.url} → update title / description / made for kids (${kids(spec)}) / poster in place`);
    if (dryRun) { console.log(JSON.stringify(meta, null, 1)); continue; }
    const token = await accessToken();
    const r = await fetch('https://www.googleapis.com/youtube/v3/videos?part=snippet,status', { method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id: prev.videoId, snippet: meta.snippet, status: { ...meta.status, privacyStatus: prev.privacy || meta.status.privacyStatus } }) });
    if (!r.ok) throw new Error(`${id}: update failed: ${r.status} ${(await r.text()).slice(0, 300)}`);
    await setPoster(token, dir, prev.videoId);
    fs.writeFileSync(path.join(dir, 'youtube.json'), JSON.stringify({ ...prev, title: meta.snippet.title, madeForKids: kids(spec), sync }, null, 2) + '\n');
    continue;
  }
  console.log(`${id}: ${prev ? `sources changed since ${prev.url} → new upload, the old one goes private` : 'new'}`);
  const mp4 = path.join(dir, y.file);
  if (build && !dryRun) {
    if (y.story) {
      run('node', ['tools/runpod.mjs', 'render', `videos/${y.story}`, '--wait', '60', '--max-price', '0.30']);
      fs.copyFileSync(path.join(ROOT, 'videos', y.story, 'out', `${y.story}.mp4`), path.join(dir, 'story.mp4'));
    }
    if (y.build) run('node', [path.join(dir, y.build)]);
  }
  if (dryRun && !fs.existsSync(mp4)) { console.log(`  (dry run: ${y.file} would be built${y.story ? ` from the RunPod render of videos/${y.story}` : ''})`); }
  else {
    const [w, h, dur] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'csv=p=0:s=,', mp4]).toString().trim().split(/[,\n]/).map(Number);
    if (!(h > w) || dur > 180) throw new Error(`${id}: a Short must be vertical and ≤ 3 min (${w}x${h}, ${dur.toFixed(1)}s)`);
    console.log(`  ${y.file}: ${w}x${h}, ${dur.toFixed(1)}s`);
  }
  const film = filmOf(spec);
  if (y.film && !film) console.warn(`  ${y.film} is not on YouTube yet (no youtube.json) — no link to the full story`);
  const meta = shortMeta(spec, film?.url);
  console.log(`  "${meta.snippet.title}" (${meta.status.privacyStatus}, ${kids(spec) ? 'made for kids' : 'not made for kids'})${film ? ` → full film ${film.url}` : ''}`);
  if (dryRun) { console.log(JSON.stringify(meta, null, 1)); continue; }

  const token = await accessToken();
  const video = await resumableUpload(token, meta, mp4, id);
  const url = `https://youtube.com/shorts/${video.id}`;
  console.log(`${id}: uploaded → ${url}`);
  await setPoster(token, dir, video.id);
  if (prev?.videoId && prev.videoId !== video.id) {
    const r = await fetch('https://www.googleapis.com/youtube/v3/videos?part=status', { method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ id: prev.videoId, status: { privacyStatus: 'private', selfDeclaredMadeForKids: kids(specOf(dir)), embeddable: true, license: 'youtube' } }) });
    console.log(r.ok ? `  old Short ${prev.url} → private` : `  old Short ${prev.url} not hidden: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  fs.writeFileSync(path.join(dir, 'youtube.json'), JSON.stringify({ videoId: video.id, url, title: meta.snippet.title, privacy: video.status?.privacyStatus,
    uploadedAt: new Date().toISOString(), source: hash, sync: syncHash(dir, film?.url), madeForKids: kids(spec), file: y.file, film: y.film || null, filmUrl: film?.url || null, relatedVideoSet: false,
    ...(prev?.videoId ? { replaces: prev.videoId } : {}) }, null, 2) + '\n');
  if (film) {
    const msg = `Set the Short's "Related video" by hand (the API can't): https://studio.youtube.com/video/${video.id}/edit → Related video → "${film.title}" (${film.url}) → Save; then set relatedVideoSet: true in shorts/${id}/youtube.json`;
    console.log(`  ${msg}`);
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- ${id} → ${url}\n  - ${msg}\n`);
  }
}
