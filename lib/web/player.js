// Web player for one film: renders the three.js stage live (a pure function of t), plays the voices and the
// background music with Web Audio (the audio clock drives the picture, so they stay in sync), and lets the
// viewer report problems at the current second. Reports live in localStorage (per browser) and can be copied
// as text — with the time, scene and line of each one — to hand them back as feedback.
import { compile, sceneAt, beatAt } from '../engine/timeline.js';
import { Stage } from '../engine/stage.js';
import { Stage2D } from '../engine2d/stage2d.js';
import { preloadImages } from '../components/props.js';
import { preloadLogos } from '../engine/overlay.js';
import { loadIssues, saveIssues, issuesText, fmtTime } from './issues.js';
import { copyText } from './copy.js';

const $ = (s) => document.querySelector(s);
const film = document.body.dataset.film;
const base = `/videos/${film}`;
const params = new URLSearchParams(location.search);

async function getJSON(url, fallback) {
  try { const r = await fetch(url); return r.ok ? await r.json() : fallback; } catch { return fallback; }
}

async function boot() {
  const desc = await getJSON(`${base}/video.json`, null);
  if (!desc) throw new Error(`Nu găsesc ${base}/video.json`);
  const manifest = await getJSON(`${base}/audio/lines.json`, {});
  await document.fonts.load('600 40px Fredoka', 'ăâîșț ĂÂÎȘȚ').catch(() => {});
  await preloadImages(desc);
  await preloadLogos(desc);
  const blender = desc.style === 'blender';
  const E3 = blender ? await import('../engine3/boot3.js') : null;
  const tl = blender ? await E3.compileFilm(desc, manifest) : compile(desc, manifest);

  // resolution: as many pixels as the screen shows (≤ 1920x1080); lighter shadows on phones
  const wrap = $('#screen');
  const px = Math.min(1920, wrap.clientWidth * Math.min(window.devicePixelRatio || 1, 2));
  const scale = parseFloat(params.get('scale') || Math.max(0.34, Math.min(1, px / 1920)).toFixed(3));
  const phone = matchMedia('(pointer: coarse)').matches;
  const stage = blender ? await E3.createStage($('#out'), tl, desc, { scale, quality: phone ? 'draft' : 'final' }) : desc.engine === '2d' ? new Stage2D($('#out'), tl, desc, { scale }) : new Stage($('#out'), tl, desc, { scale, antialias: true, shadowSize: phone ? 1024 : 2048, softShadows: !phone, post: !phone });
  stage.renderAt(0);
  document.body.classList.add('ready');

  const audio = new FilmAudio(tl, desc);
  audio.load(); // starts downloading right away; the play button waits for it
  new Player(stage, tl, desc, audio);
}

// ---------------------------------------------------------------- audio
class FilmAudio {
  constructor(tl, desc) {
    this.tl = tl; this.desc = desc; this.sources = [];
    this.clips = [...tl.speeches, ...tl.sounds];
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ac = AC ? new AC() : null;
    this.buffers = new Map();
  }
  load() {
    if (this.loading) return this.loading;
    const ac = this.ac;
    if (!ac) return (this.loading = Promise.resolve());
    const get = async (key, url) => {
      try { const r = await fetch(url); if (r.ok) this.buffers.set(key, await ac.decodeAudioData(await r.arrayBuffer())); } catch {}
    };
    const files = [...new Set(this.clips.map((s) => s.file).filter(Boolean))];
    const jobs = files.map((f) => get(f, `${base}/audio/${f}`));
    if (this.desc.music !== false) jobs.push(get('music', `${base}/audio/music.mp3`));
    return (this.loading = Promise.all(jobs));
  }
  get time() {
    if (!this.ac) return performance.now() / 1000;
    // The render clock runs ahead of the samples reaching the speakers.
    const outputTime = this.ac.getOutputTimestamp?.().contextTime;
    return outputTime > 0 ? outputTime : this.ac.currentTime;
  }
  async resume() { if (this.ac && this.ac.state !== 'running') await this.ac.resume().catch(() => {}); }
  stop() { for (const s of this.sources) { try { s.stop(); } catch {} } this.sources = []; }
  /** Schedules every line (and the music) from film time `from`; returns the audio-clock time of `from`. */
  start(from) {
    this.stop();
    const ac = this.ac;
    if (!ac) return this.time;
    const now = ac.currentTime + 0.05;
    for (const sp of this.clips) {
      const buf = sp.file && this.buffers.get(sp.file);
      if (!buf || Math.min(sp.start + buf.duration, sp.ambient ? sp.end : Infinity) <= from) continue;
      const src = ac.createBufferSource(); src.buffer = buf;
      if (sp.volume == null) src.connect(ac.destination);
      else {
        const gain = ac.createGain();
        gain.gain.value = sp.volume;
        src.connect(gain).connect(ac.destination);
      }
      const when = sp.start - from;
      const offset = Math.max(0, -when);
      const start = now + Math.max(0, when);
      if (sp.ambient) src.start(start, offset, sp.end - sp.start - offset);
      else src.start(start, offset);
      this.sources.push(src);
    }
    const m = this.buffers.get('music');
    if (m) { // same mix as tools/lib/audio.mjs: looped, volume desc.music.volume, fade in 1.5 s, fade out 2.5 s
      const vol = this.desc.music?.volume ?? 0.13, D = this.tl.duration;
      const src = ac.createBufferSource(); src.buffer = m; src.loop = true;
      const g = ac.createGain();
      const at = (ft) => now + (ft - from);
      const level = (ft) => vol * Math.min(1, ft / 1.5, Math.max(0, (D - ft) / 2.5));
      g.gain.setValueAtTime(level(from), now);
      if (from < 1.5) g.gain.linearRampToValueAtTime(vol, at(1.5));
      const fo = Math.max(from, D - 2.5);
      g.gain.setValueAtTime(level(fo), at(fo));
      g.gain.linearRampToValueAtTime(0, at(D));
      const duck = ac.createGain();
      duck.gain.setValueAtTime(1, now);
      for (const { start, end, gain } of this.tl.musicDucks || []) {
        const stops = [[start - .25, 1], [start, gain], [end, gain], [end + .38, 1]];
        for (let i = 0; i < stops.length - 1; i++) {
          const [left, a] = stops[i], [right, b] = stops[i + 1];
          if (right <= from) continue;
          const clipped = Math.max(left, from);
          duck.gain.setValueAtTime(a + (b - a) * (clipped - left) / (right - left), at(clipped));
          duck.gain.linearRampToValueAtTime(b, at(right));
        }
      }
      src.connect(g).connect(duck).connect(ac.destination);
      src.start(now, from % m.duration);
      this.sources.push(src);
    }
    return now;
  }
}

// ---------------------------------------------------------------- player + issues
class Player {
  constructor(stage, tl, desc, audio) {
    Object.assign(this, { stage, tl, desc, audio });
    this.t = 0; this.playing = false;
    this.issues = loadIssues(film);
    this.ui = { play: $('#play'), seek: $('#seek'), time: $('#time'), flag: $('#flag'), full: $('#full'), screen: $('#screen'),
      dialog: $('#report'), note: $('#note'), at: $('#report-at'), line: $('#report-line'), list: $('#issues'), count: $('#count'), copy: $('#copy'), clear: $('#clear') };
    const u = this.ui;
    u.seek.max = tl.duration;
    u.play.onclick = () => this.toggle();
    $('#out').onclick = () => this.toggle();
    // scrubbing: audio stops while dragging, picks up from the new place when released
    u.seek.addEventListener('input', () => { if (this.playing) { this.wasPlaying = true; this.pause(); } this.seek(+u.seek.value); });
    u.seek.addEventListener('change', () => { if (this.wasPlaying) { this.wasPlaying = false; this.play(); } });
    // the row of jump buttons under the controls: ±5 s and ±0.5 s from where the film is now
    for (const btn of document.querySelectorAll('.jump')) btn.onclick = () => this.seek(Math.max(0, Math.min(tl.duration, this.t + +btn.dataset.d)));
    u.flag.onclick = () => this.openReport();
    // full screen: the real API where there is one (not on iPhone for a div), else a page-filling layout
    const setFs = (on) => { document.body.classList.toggle('pseudo-fs', on); };
    u.full.onclick = () => {
      if (document.fullscreenElement || document.webkitFullscreenElement) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
      if (document.body.classList.contains('pseudo-fs')) { setFs(false); return; }
      const req = u.screen.requestFullscreen || u.screen.webkitRequestFullscreen;
      if (req) { try { Promise.resolve(req.call(u.screen)).catch(() => setFs(true)); } catch { setFs(true); } } else setFs(true);
      try { screen.orientation?.lock?.(document.body.hasAttribute('data-portrait') ? 'portrait' : 'landscape').catch(() => {}); } catch {}
    };
    // controls fade out while the film plays in full screen; a tap / move brings them back
    let hideT = 0;
    const wake = () => { u.screen.classList.remove('idle'); clearTimeout(hideT); if (this.playing) hideT = setTimeout(() => u.screen.classList.add('idle'), 2500); };
    for (const ev of ['pointermove', 'pointerdown', 'keydown']) u.screen.addEventListener(ev, wake);
    this.wakeControls = wake;
    $('#report-form').onsubmit = (e) => { e.preventDefault(); this.saveReport(); };
    $('#report-cancel').onclick = () => u.dialog.close();
    u.note.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.saveReport(); } });
    $('#nudge-back').onclick = () => this.nudgeReport(-0.5);
    $('#nudge-fwd').onclick = () => this.nudgeReport(0.5);
    u.copy.onclick = () => this.copy();
    u.clear.onclick = () => { if (this.issues.length && confirm('Ștergi toate problemele raportate pentru acest film?')) { this.issues = []; this.persist(); } };
    document.addEventListener('keydown', (e) => this.key(e));
    this.renderIssues();
    const t0 = Math.min(tl.duration, parseFloat(params.get('t') || location.hash.replace(/^#t=/, '') || 0) || 0);
    if (t0) this.seek(t0); else this.show(0); // at 0 the poster covers the black fade-in until play
  }

  info(t) {
    const s = sceneAt(this.tl, t), b = beatAt(s, t);
    return { scene: s.id, beat: b?.index ?? null, who: b?.def?.say || null, line: b?.def?.text || null };
  }
  show(t) {
    this.t = Math.max(0, Math.min(this.tl.duration, t));
    this.stage.renderAt(this.t);
    this.ui.seek.value = this.t;
    this.ui.seek.style.setProperty('--p', `${(100 * this.t) / this.tl.duration}%`);
    this.ui.time.textContent = `${fmtTime(this.t, true)} / ${fmtTime(this.tl.duration)}`;
  }
  seek(t) {
    document.body.classList.add('started');
    if (this.playing) { this.pause(); this.show(t); this.play(); } else this.show(t);
  }
  async play() {
    if (this.playing) return;
    if (this.t >= this.tl.duration - 0.05) this.t = 0;
    document.body.classList.add('started');
    this.playing = true; this.ui.play.classList.add('on'); this.ui.play.setAttribute('aria-label', 'Pauză'); this.wakeControls?.();
    if (!this.audio.ready) {
      document.body.classList.add('loading');
      await this.audio.load(); this.audio.ready = true;
      document.body.classList.remove('loading');
      if (!this.playing) return; // paused while loading
    }
    await this.audio.resume();
    this.from = this.t; this.clock0 = this.audio.start(this.t);
    const loop = () => {
      if (!this.playing) return;
      const t = this.from + Math.max(0, this.audio.time - this.clock0);
      if (t >= this.tl.duration) { this.show(this.tl.duration); this.pause(); return; }
      this.show(t);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }
  pause() {
    this.playing = false; cancelAnimationFrame(this.raf); this.audio.stop(); this.ui.screen.classList.remove('idle');
    this.ui.play.classList.remove('on'); this.ui.play.setAttribute('aria-label', 'Redă');
  }
  toggle() { this.playing ? this.pause() : this.play(); }
  key(e) {
    if (e.target.closest('input[type=text], textarea, dialog[open]') || e.metaKey || e.ctrlKey || e.altKey) return;
    const step = 1 / this.tl.fps;
    const k = { ' ': () => this.toggle(), k: () => this.toggle(), ArrowLeft: () => this.seek(this.t - (e.shiftKey ? 5 : 1)), ArrowRight: () => this.seek(this.t + (e.shiftKey ? 5 : 1)),
      ',': () => { this.pause(); this.show(this.t - step); }, '.': () => { this.pause(); this.show(this.t + step); },
      Home: () => this.seek(0), End: () => this.seek(this.tl.duration), r: () => this.openReport(), f: () => this.ui.full.click() }[e.key];
    if (k) { e.preventDefault(); k(); }
  }

  // ---- reports
  openReport() {
    this.pause();
    this.reportT = this.t;
    this.ui.note.value = '';
    this.updateReportHeader();
    this.ui.dialog.showModal();
    this.ui.note.focus();
  }
  nudgeReport(d) { this.reportT = Math.max(0, Math.min(this.tl.duration, this.reportT + d)); this.show(this.reportT); this.updateReportHeader(); }
  updateReportHeader() {
    const i = this.info(this.reportT);
    this.ui.at.textContent = fmtTime(this.reportT, true);
    this.ui.line.textContent = i.line ? `${i.who ? i.who + ': ' : ''}„${i.line}”` : `scena ${i.scene}`;
  }
  saveReport() {
    const text = this.ui.note.value.trim();
    if (!text) { this.ui.note.focus(); return; }
    this.issues.push({ t: +this.reportT.toFixed(2), text, ...this.info(this.reportT), at: new Date().toISOString(), version: document.body.dataset.version || '' });
    this.issues.sort((a, b) => a.t - b.t);
    this.persist();
    this.ui.dialog.close();
  }
  persist() { saveIssues(film, this.issues); this.renderIssues(); }
  renderIssues() {
    const { list, count, copy, clear } = this.ui;
    count.textContent = this.issues.length || '';
    copy.disabled = clear.disabled = !this.issues.length;
    list.replaceChildren(...this.issues.map((it, i) => {
      const li = document.createElement('li');
      const go = document.createElement('button'); go.className = 'ts'; go.textContent = fmtTime(it.t, true); go.title = 'Mergi la această secundă';
      const jump = () => { this.seek(it.t); this.ui.screen.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
      li.style.cursor = 'pointer'; li.title = 'Mergi la această secundă';
      li.onclick = (e) => { if (!e.target.closest('.del')) jump(); }; // the whole item jumps to its second
      const body = document.createElement('div'); body.className = 'body';
      const p = document.createElement('p'); p.textContent = it.text;
      const ctx = document.createElement('small'); ctx.textContent = `scena ${it.scene}${it.beat != null ? ` · replica #${it.beat}` : ''}${it.who ? ` · ${it.who}` : ''}`;
      body.append(p, ctx);
      const del = document.createElement('button'); del.className = 'del'; del.title = 'Șterge'; del.setAttribute('aria-label', 'Șterge');
      del.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
      del.onclick = () => { this.issues.splice(i, 1); this.persist(); };
      li.append(go, body, del);
      return li;
    }));
    if (!this.issues.length) list.innerHTML = '<li class="empty">Nicio problemă raportată. Apasă steagul de lângă bara de timp ca să notezi ce nu e bine la secunda curentă.</li>';
  }
  async copy() {
    const text = issuesText([{ id: film, title: this.desc.title, issues: this.issues }], { url: location.origin + location.pathname, version: document.body.dataset.version });
    await copyText(text);
    const b = this.ui.copy, old = b.textContent; b.textContent = 'Copiat ✓'; setTimeout(() => (b.textContent = old), 1600);
  }
}

boot().catch((e) => {
  console.error(e);
  document.body.classList.add('failed');
  $('.view').insertAdjacentHTML('beforeend', `<pre class="err">${String(e.stack || e).replace(/</g, '&lt;')}</pre>`);
});
