// Audio mixing: places voices and sound effects on the timeline, adds looping background music.
import fs from 'node:fs';
import path from 'node:path';
import { run } from './common.mjs';

export async function mixAudio(dir, tl, outWav, { from = 0, to = tl.duration, desc = {} } = {}) {
  const inputs = [], filters = [];
  const lines = [...tl.speeches, ...tl.sounds].filter((s) => s.file && fs.existsSync(path.join(dir, 'audio', s.file)) && s.end > from && s.start < to);
  lines.forEach((s, i) => {
    inputs.push('-i', path.join(dir, 'audio', s.file));
    const delay = Math.max(0, Math.round((s.start - from) * 1000));
    const trim = s.start < from || s.ambient
      ? `atrim=start=${Math.max(0, from-s.start).toFixed(3)}${s.ambient ? ':end='+ (s.end-s.start).toFixed(3) : ''},asetpts=PTS-STARTPTS,`
      : '';
    const gain = s.volume == null ? '' : `volume=${s.volume},`;
    filters.push(`[${i}:a]${trim}aresample=48000,aformat=channel_layouts=stereo,${gain}adelay=${delay}|${delay}[v${i}]`);
  });
  const dur = (to - from).toFixed(3);
  const music = path.join(dir, 'audio', 'music.mp3');
  let mixIns = lines.map((_, i) => `[v${i}]`).join('');
  let n = lines.length;
  if (fs.existsSync(music) && desc.music !== false) {
    const vol = desc.music?.volume ?? 0.13;
    inputs.push('-stream_loop', '-1', '-i', music);
    const idx = lines.length;
    const ducks = (tl.musicDucks || []).map(({ start, end, gain }) => {
      const a = (start - from).toFixed(3), b = (end - from).toFixed(3);
      return `(1-${1-gain}*max(0,min(1,min((t-(${a})+.25)/.25,((${b})+.38-t)/.38))))`;
    });
    const automation = ducks.length ? `,volume='${ducks.join('*')}':eval=frame` : '';
    filters.push(`[${idx}:a]aresample=48000,aformat=channel_layouts=stereo,atrim=start=${(from % 30).toFixed(3)}:duration=${dur},asetpts=PTS-STARTPTS,volume=${vol}${automation},afade=t=in:d=1.5,afade=t=out:st=${Math.max(0, to - from - 2.5).toFixed(3)}:d=2.5[m]`);
    mixIns += '[m]'; n++;
  }
  if (n === 0) {
    await run('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `anullsrc=r=48000:cl=stereo`, '-t', dur, outWav]);
    return;
  }
  filters.push(`${mixIns}amix=inputs=${n}:normalize=0:dropout_transition=0,apad,atrim=duration=${dur},alimiter=limit=0.95[out]`);
  const script = outWav + '.filter';
  fs.writeFileSync(script, filters.join(';\n'));
  await run('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex_script', script, '-map', '[out]', '-ar', '48000', outWav]);
}
