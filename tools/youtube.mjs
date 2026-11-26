// YouTube upload (YouTube Data API v3, OAuth refresh token — no SDK, plain fetch).
//
//   node tools/youtube.mjs check                       # are the credentials there and valid? which channel?
//   node tools/youtube.mjs auth                        # one-time: prints the consent URL …
//   node tools/youtube.mjs auth "<redirected URL or code>"   # … then exchanges the code → YOUTUBE_REFRESH_TOKEN
//   node tools/youtube.mjs backfill [--dry-run]           # write youtube.json for films already on the channel (matched by title)
//   node tools/youtube.mjs upload videos/<id> [--file out/<id>.mp4] [--privacy private|unlisted|public] [--publish-at next-noon|<ISO>] [--dry-run] [--force]
//
// Needs (env or .env, never committed): YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN.
// Optional: YOUTUBE_PRIVACY (default private), YOUTUBE_PLAYLIST_ID (every upload is added to it),
// YOUTUBE_CATEGORY_ID (default 1; the channel uses 22), YOUTUBE_SYNTHETIC_MEDIA=true (altered/synthetic content flag).
// Each upload writes videos/<id>/youtube.json (committed): video id, URL, privacy, and a hash of the film's
// video.json + lines.json, so `tools/publish.mjs --pending` knows what is new or changed.
// Metadata: desc.youtube { title, description, tags, privacy } overrides the defaults built from title/lesson/source.
// Scheduling: --publish-at next-noon (or env YOUTUBE_PUBLISH_AT) uploads the video private with status.publishAt =
// the next 12:00 UTC — the same day for a morning upload, else the next day (an ISO date-time is used as given); YouTube makes it public at that time.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs, resolveVideoDir, env, ROOT } from './lib/common.mjs';

const SCOPES = ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube'];
const REDIRECT = 'http://localhost';
const T = (ms) => AbortSignal.timeout(ms);

function creds() {
  const c = { id: env('YOUTUBE_CLIENT_ID'), secret: env('YOUTUBE_CLIENT_SECRET'), refresh: env('YOUTUBE_REFRESH_TOKEN') };
  const missing = Object.entries({ YOUTUBE_CLIENT_ID: c.id, YOUTUBE_CLIENT_SECRET: c.secret }).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Missing ${missing.join(', ')} (env or .env). See .claude/skills/publish-youtube/SKILL.md`);
  return c;
}

export async function accessToken() {
  const c = creds();
  if (!c.refresh) throw new Error('Missing YOUTUBE_REFRESH_TOKEN — run `node tools/youtube.mjs auth` once.');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: T(20000),
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, refresh_token: c.refresh, grant_type: 'refresh_token' }) });
  const d = await r.json();
  if (!r.ok) throw new Error(`token refresh failed: ${d.error} ${d.error_description || ''}${d.error === 'invalid_grant' ? ' — the refresh token expired or was revoked (an OAuth app left in "Testing" expires tokens after 7 days); run auth again' : ''}`);
  return d.access_token;
}

async function api(token, method, url, body) {
  const r = await fetch(url.startsWith('http') ? url : `https://www.googleapis.com/youtube/v3/${url}`, { method, signal: T(60000),
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const d = r.status === 204 ? {} : await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${url.split('?')[0]}: ${r.status} ${d.error?.message || JSON.stringify(d).slice(0, 300)}`);
  return d;
}

/** Hash of what defines the film (script + voices): a different hash means the YouTube copy is outdated. */
export function sourceHash(dir) {
  const h = crypto.createHash('sha256');
  for (const f of ['video.json', 'audio/lines.json']) { const p = path.join(dir, f); if (fs.existsSync(p)) h.update(fs.readFileSync(p)); }
  return h.digest('hex').slice(0, 16);
}
export const ytInfo = (dir) => { const p = path.join(dir, 'youtube.json'); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };

// 'next-noon' → the NEXT 12:00 UTC after `now`: the same day when the upload is done in the morning (before 11:45 UTC —
// YouTube needs publishAt a little in the future), else the next day; an ISO date-time → itself; empty → null (publish right away)
export function resolvePublishAt(v, now = new Date()) {
  if (!v) return null;
  if (v === 'next-noon') {
    const noon = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12);
    return new Date(now.getTime() < noon - 15 * 60e3 ? noon : noon + 864e5).toISOString();
  }
  const d = new Date(v);
  if (isNaN(d)) throw new Error(`bad publish time "${v}" (use next-noon or an ISO date-time)`);
  return d.toISOString();
}

export function metadata(desc, privacy, publishAt = null) {
  const y = desc.youtube || {};
  const title = (y.title || `${desc.title} | Povești din Pateric pentru copii`).slice(0, 100);
  const description = y.description || [
    desc.lesson,
    '',
    'Un filmuleț animat pentru copiii mici, cu figurine din cărămizi, după o povestire din Patericul ortodox.',
    desc.source ? `Povestirea: ${desc.source}.` : '',
    '',
    'Vocile și muzica sunt generate cu inteligență artificială; animația este generată din cod.',
  ].filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\n');
  return {
    snippet: { title, description: description.slice(0, 4900), tags: y.tags || ['povești pentru copii', 'Pateric', 'povești ortodoxe', 'desene animate', 'pentru copii', 'Patericul egiptean', 'Sfinții Părinți'],
      categoryId: String(y.categoryId || env('YOUTUBE_CATEGORY_ID') || 1), defaultLanguage: 'ro', defaultAudioLanguage: 'ro' },
    status: { privacyStatus: publishAt ? 'private' : (y.privacy || privacy), ...(publishAt ? { publishAt } : {}), selfDeclaredMadeForKids: true, embeddable: true, license: 'youtube',
      // "altered or synthetic content" disclosure (YouTube: realistic-looking content); animated bricks → false unless set
      containsSyntheticMedia: y.syntheticMedia ?? env('YOUTUBE_SYNTHETIC_MEDIA') === 'true' },
  };
}

/** Resumable upload of an MP4 with the given snippet/status → the YouTube video resource. */
export async function resumableUpload(token, meta, mp4, label = path.basename(mp4)) {
  const size = fs.statSync(mp4).size;
  // resumable upload: 1) session, 2) the bytes (retry from the last confirmed byte on network errors / 5xx)
  const init = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', { method: 'POST', signal: T(60000),
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(size) },
    body: JSON.stringify(meta) });
  if (!init.ok) throw new Error(`upload init: ${init.status} ${(await init.text()).slice(0, 400)}`);
  const session = init.headers.get('location');
  const buf = fs.readFileSync(mp4);
  let offset = 0, video = null;
  for (let attempt = 0; attempt < 6 && !video; attempt++) {
    try {
      const r = await fetch(session, { method: 'PUT', signal: T(30 * 60000), headers: { 'content-length': String(size - offset), ...(offset ? { 'content-range': `bytes ${offset}-${size - 1}/${size}` } : {}) }, body: buf.subarray(offset) });
      if (r.ok) { video = await r.json(); break; }
      if (r.status < 500 && r.status !== 308) throw Object.assign(new Error(`upload: ${r.status} ${(await r.text()).slice(0, 400)}`), { fatal: true });
    } catch (e) { if (e.fatal) throw e; console.warn(`  upload interrupted (${e.message}), resuming…`); }
    await new Promise((res) => setTimeout(res, 2000 * 2 ** attempt));
    const q = await fetch(session, { method: 'PUT', signal: T(60000), headers: { 'content-length': '0', 'content-range': `bytes */${size}` } });
    if (q.ok) { video = await q.json(); break; }
    const range = q.headers.get('range'); offset = range ? parseInt(range.split('-')[1]) + 1 : 0;
  }
  if (!video?.id) throw new Error(`${label}: upload failed`);
  return video;
}

export async function upload(dir, { file, privacy = env('YOUTUBE_PRIVACY') || 'private', publishAt = env('YOUTUBE_PUBLISH_AT'), dryRun = false, force = false, token } = {}) {
  const id = path.basename(dir);
  const desc = JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8'));
  const mp4 = file ? path.resolve(file) : path.join(dir, 'out', `${id}.mp4`);
  if (!fs.existsSync(mp4)) throw new Error(`${id}: no ${path.relative(ROOT, mp4)} — render it first (npm run runpod -- render videos/${id})`);
  const prev = ytInfo(dir), hash = sourceHash(dir);
  if (prev && !force) {
    if (prev.source === hash) { console.log(`${id}: already on YouTube (${prev.url}), unchanged — skipped`); return prev; }
    throw new Error(`${id}: already uploaded (${prev.url}) but changed since. YouTube can't replace a video's file: pass --force to upload a NEW video (then remove the old one in YouTube Studio).`);
  }
  publishAt = resolvePublishAt(publishAt);
  const meta = metadata(desc, privacy, publishAt);
  const size = fs.statSync(mp4).size;
  console.log(`${id}: "${meta.snippet.title}" (${(size / 1e6).toFixed(1)} MB, ${meta.status.privacyStatus}${publishAt ? `, public at ${publishAt}` : ''}, made for kids)`);
  if (dryRun) { console.log(JSON.stringify(meta, null, 1)); return null; }
  token ||= await accessToken();

  const video = await resumableUpload(token, meta, mp4, id);
  const url = `https://youtu.be/${video.id}`;
  console.log(`${id}: uploaded → ${url} (${video.status?.privacyStatus}${video.status?.uploadStatus ? ', ' + video.status.uploadStatus : ''})`);

  const poster = path.join(dir, 'poster.jpg');
  if (fs.existsSync(poster)) {
    const r = await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${video.id}`, { method: 'POST', signal: T(60000),
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'image/jpeg' }, body: fs.readFileSync(poster) });
    if (!r.ok) console.warn(`  thumbnail not set (${r.status}: custom thumbnails need a phone-verified channel) — YouTube picks one`);
  }
  const playlist = env('YOUTUBE_PLAYLIST_ID');
  if (playlist) {
    // newest first: position 0 = top of the playlist (needs the playlist's sort to be "manual"; if YouTube refuses, add at the end)
    const item = (position) => ({ snippet: { playlistId: playlist, ...(position === undefined ? {} : { position }), resourceId: { kind: 'youtube#video', videoId: video.id } } });
    try {
      try { await api(token, 'POST', 'playlistItems?part=snippet', item(0)); console.log(`  added to the top of playlist ${playlist}`); }
      catch (e) { console.warn(`  playlist position 0 refused (${e.message}) — adding at the end; set the playlist order to "Manual" on YouTube`); await api(token, 'POST', 'playlistItems?part=snippet', item()); console.log(`  added to playlist ${playlist}`); }
    } catch (e) { console.warn(`  playlist: ${e.message}`); }
  }
  // a re-generated film replaces its old upload: the old video goes private (never deleted — it can be made public again in
  // YouTube Studio) and leaves the playlist, so the channel never shows two copies of one film
  if (prev?.videoId && prev.videoId !== video.id) {
    try {
      await api(token, 'PUT', 'videos?part=status', { id: prev.videoId, status: { privacyStatus: 'private', selfDeclaredMadeForKids: true, embeddable: true, license: 'youtube' } });
      console.log(`  old upload ${prev.url} → private`);
    } catch (e) { console.warn(`  old upload ${prev.url} not hidden: ${e.message}`); }
    if (playlist) try {
      const items = await api(token, 'GET', `playlistItems?part=id&maxResults=50&playlistId=${playlist}&videoId=${prev.videoId}`);
      for (const it of items.items || []) await api(token, 'DELETE', `playlistItems?id=${it.id}`);
      if (items.items?.length) console.log(`  old upload removed from playlist ${playlist}`);
    } catch (e) { console.warn(`  old upload still in the playlist: ${e.message}`); }
  }
  const info = { videoId: video.id, url, title: meta.snippet.title, privacy: video.status?.privacyStatus || meta.status.privacyStatus,
    uploadedAt: new Date().toISOString(), ...(publishAt ? { publishAt } : {}), source: hash, bytes: size, ...(prev ? { replaces: prev.videoId } : {}) };
  fs.writeFileSync(path.join(dir, 'youtube.json'), JSON.stringify(info, null, 2) + '\n');
  return info;
}

// ---------------------------------------------------------------- CLI
if (process.argv[1] && path.resolve(process.argv[1]) === path.join(ROOT, 'tools', 'youtube.mjs')) {
  const args = parseArgs();
  const cmd = args._[0];
  if (cmd === 'auth') {
    const c = creds();
    const input = args._[1];
    if (!input) {
      const u = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      Object.entries({ client_id: c.id, redirect_uri: REDIRECT, response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent' }).forEach(([k, v]) => u.searchParams.set(k, v));
      console.log(`1. Open this URL, sign in with the account that owns the YouTube channel and allow access:\n\n${u}\n`);
      console.log('2. The browser then goes to http://localhost/?code=… and shows an error page — that is expected.');
      console.log('   Copy that whole address and run:  node tools/youtube.mjs auth "<the address>"');
    } else {
      const code = input.includes('code=') ? new URL(input.replace(/^localhost/, 'http://localhost')).searchParams.get('code') : input;
      const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: T(20000),
        body: new URLSearchParams({ code, client_id: c.id, client_secret: c.secret, redirect_uri: REDIRECT, grant_type: 'authorization_code' }) });
      const d = await r.json();
      if (!d.refresh_token) { console.error('No refresh token:', JSON.stringify(d)); process.exit(1); }
      console.log(`Put this in .env (or the environment's secrets):\n\nYOUTUBE_REFRESH_TOKEN=${d.refresh_token}\n`);
    }
  } else if (cmd === 'check') {
    const token = await accessToken();
    const ch = await api(token, 'GET', 'channels?part=snippet,status&mine=true');
    const c = ch.items?.[0];
    console.log(c ? `OK — channel "${c.snippet.title}" (https://youtube.com/channel/${c.id}), made-for-kids default: ${c.status?.madeForKids ?? '?'}` : 'Token OK but this account has no YouTube channel.');
    if (env('YOUTUBE_PLAYLIST_ID')) { const p = await api(token, 'GET', `playlists?part=snippet&id=${env('YOUTUBE_PLAYLIST_ID')}`); console.log(`Playlist: ${p.items?.[0]?.snippet?.title || 'NOT FOUND'}`); }
  } else if (cmd === 'backfill') {
    // films already on the channel (same title) but without videos/<id>/youtube.json → write it, so nothing is uploaded twice
    const token = await accessToken();
    const ch = await api(token, 'GET', 'channels?part=contentDetails&mine=true');
    const uploads = ch.items[0].contentDetails.relatedPlaylists.uploads;
    const items = []; let page = '';
    do { const d = await api(token, 'GET', `playlistItems?part=snippet,contentDetails&maxResults=50&playlistId=${uploads}${page ? `&pageToken=${page}` : ''}`); items.push(...d.items); page = d.nextPageToken; } while (page);
    const vids = fs.readdirSync(path.join(ROOT, 'videos')).filter((v) => !v.startsWith('_') && fs.existsSync(path.join(ROOT, 'videos', v, 'video.json')));
    for (const v of vids) {
      const dir = path.join(ROOT, 'videos', v);
      if (ytInfo(dir)) continue;
      const title = metadata(JSON.parse(fs.readFileSync(path.join(dir, 'video.json'), 'utf8')), 'private').snippet.title;
      const hit = items.filter((i) => i.snippet.title === title).sort((a, b) => a.snippet.publishedAt.localeCompare(b.snippet.publishedAt))[0];
      if (!hit) { console.log(`${v}: not on the channel`); continue; }
      const videoId = hit.contentDetails.videoId;
      const st = (await api(token, 'GET', `videos?part=status&id=${videoId}`)).items?.[0]?.status || {};
      const info = { videoId, url: `https://youtu.be/${videoId}`, title, privacy: st.privacyStatus, uploadedAt: hit.snippet.publishedAt, source: sourceHash(dir), backfilled: true };
      if (args['dry-run']) { console.log(`${v}: on YouTube ${info.url} (would write youtube.json)`); continue; }
      fs.writeFileSync(path.join(dir, 'youtube.json'), JSON.stringify(info, null, 2) + '\n');
      console.log(`${v}: on YouTube ${info.url} → youtube.json written`);
    }
  } else if (cmd === 'upload') {
    for (const a of args._.slice(1)) await upload(resolveVideoDir(a), { file: args.file, privacy: args.privacy, publishAt: args['publish-at'], dryRun: !!args['dry-run'], force: !!args.force });
  } else {
    console.log('usage: node tools/youtube.mjs check | auth [url] | backfill [--dry-run] | upload videos/<id> [--privacy …] [--dry-run] [--force]');
  }
}
