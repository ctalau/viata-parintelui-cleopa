// Pure timeline compiler: descriptor (video.json) + audio manifest -> fully timed timeline.
// No three.js / DOM here, so it runs in Node (voice, record, validate) and in the browser (render).
import { getLayout, headingTo } from '../components/layouts.js';

export const DEFAULT_FORMAT = { width: 1920, height: 1080, fps: 30 }; // landscape 16:9
export const DEFAULT_VOICE_MODEL = 'google/gemini-3.8-flash-tts';

// Gesture durations in seconds (see minifig.js for the actual poses).
export const GESTURES = {
  wave: 1.6, nod: 0.9, shake: 1.0, bow: 1.4, cross: 2.6, pray: 2.2, jump: 0.9,
  cough: 1.3, offer: 1.0, pour: 2.5, pick: 2.6, think: 2.0, knock: 1.3, clap: 1.3, point: 1.3,
  shrug: 1.0, look: 1.8, hug: 1.6, sniff: 1.4, bounce: 1.2, eat: 2.4, wipe: 1.6, reap: 2.4, sow: 2.7, shiver: 2.0, work: 2.4, cut: 2.4, hungry: 1.8,
};
export const EMOTIONS = ['neutral', 'happy', 'joy', 'sad', 'surprised', 'thinking', 'sick', 'warm', 'sleepy', 'asleep', 'angry', 'ashamed', 'gentle', 'gentle-shrewd', 'pray', 'humble'];
export const POSTURES = ['stand', 'sit', 'lie', 'kneel'];

const WALK_SPEED = 2.4;   // studs per second
const TURN_TIME = 0.35;
const GIVE_TIME = 1.2;
const POSTURE_TIME = 0.7;
const DEFAULT_PAUSE = 0.35; // silence after a line
const FADE = 0.4;

// ---------- small helpers ----------
export function hash(str) {
  // FNV-1a, 2 x 32 bit -> 16 hex chars. Stable in Node and browsers.
  let h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
    h2 = (h2 ^ (h2 >>> 15)) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
export const asArray = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
export const lerp = (a, b, k) => a + (b - a) * k;
export const clamp01 = (k) => Math.max(0, Math.min(1, k));
export const smooth = (k) => { k = clamp01(k); return k * k * (3 - 2 * k); };
export function lerpAngle(a, b, k) {
  let d = ((b - a) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  return a + d * k;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function estimateSpeech(text) {
  const words = text.trim().split(/\s+/).length;
  return 0.5 + words * 0.42;
}

/**
 * The exact TTS request for a line. The delivery style goes in `instructions` (NOT in the input text,
 * otherwise Gemini TTS reads the instructions aloud).
 */
export function ttsRequest(desc, speaker, beat) {
  const ch = desc.characters?.[speaker] || {};
  const instructions = [ch.voice?.style, beat.style].filter(Boolean).join('; ');
  const tempo = ch.voice?.tempo ?? desc.voiceTempo ?? 1;
  return { input: beat.text, instructions: instructions || undefined, voice: ch.voice?.voice || 'Kore', model: desc.voiceModel || DEFAULT_VOICE_MODEL, tempo };
}
export function lineKey(desc, speaker, beat) {
  const r = ttsRequest(desc, speaker, beat);
  const parts = [r.model, r.voice, r.instructions || '', r.input, r.tempo === 1 ? '' : r.tempo];
  // `with`: other characters say the same line together (one mixed file) — only in the key when used, so old films keep their hashes
  const w = asArray(beat.with);
  if (w.length) parts.push('with:' + w.map((x) => { const q = ttsRequest(desc, x, beat); return `${q.voice}/${q.instructions || ''}`; }).join(','));
  return hash(parts.join('|'));
}

// ---------- anchors ----------
/** Resolve a place: [x,z] | "anchor" | "anchor+dx,dz" | "actorId" (handled by caller). Returns {pos,h}. */
export function resolveAnchor(layout, spec, ctx) {
  if (Array.isArray(spec)) return { pos: [spec[0], spec[1]], h: null };
  if (typeof spec === 'object' && spec) {
    const base = resolveAnchor(layout, spec.anchor, ctx);
    return offsetAnchor(base, spec.offset || [0, 0]);
  }
  const m = /^([^+]+)(?:\+(-?[\d.]+),(-?[\d.]+))?$/.exec(String(spec));
  if (!m) throw new Error(`Bad place "${spec}"`);
  let base = layout.anchors[m[1]];
  if (!base && ctx?.actorPos) {
    const p = ctx.actorPos(m[1]);
    if (p) base = p;
  }
  if (!base) throw new Error(`Unknown anchor "${m[1]}". Known: ${Object.keys(layout.anchors).join(', ')}`);
  base = { pos: [...base.pos], h: base.h };
  return m[2] ? offsetAnchor(base, [+m[2], +m[3]]) : base;
}
function offsetAnchor(base, [dx, dz]) {
  const h = base.h ?? 0;
  // local +X = (cos h, -sin h), local +Z (forward) = (sin h, cos h)
  return {
    pos: [base.pos[0] + dx * Math.cos(h) + dz * Math.sin(h), base.pos[1] - dx * Math.sin(h) + dz * Math.cos(h)],
    h: base.h,
  };
}

// ---------- track sampling (used by the renderer) ----------
/** segs: [{t0,t1,from,to}], sorted by t0. Returns value at t (with easing fn). */
export function sampleSegs(segs, t, initial, mix, ease = smooth) {
  let v = initial;
  for (const s of segs) {
    if (t < s.t0) break;
    if (t >= s.t1) { v = s.to; continue; }
    const x = (t - s.t0) / Math.max(1e-6, s.t1 - s.t0);
    const k = s.ease === 'in' ? 2 * smooth(x / 2) : s.ease === 'out' ? 2 * smooth(0.5 + x / 2) - 1 : ease(x);
    return s.path ? alongPath(s.path, k) : mix(s.from, s.to, k);
  }
  return v;
}
/** A prop's `bend` pose value at t: `rest` = its own resting value (the descriptor's `bend`, else bendRest() in props.js:
 *  a sack is full = 1, a bird coming back is far = 1, most props 0). A first segment with `from: null` starts at `rest`. */
export function propBend(segs, t, rest = 0) {
  return sampleSegs(segs || [], t, rest, (a, b, k) => lerp(a ?? rest, b, k));
}
/** a point at fraction k (0..1, by length) of a polyline [[x, z], …] */
export function alongPath(path, k) {
  const L = pathLength(path);
  let d = k * L;
  for (let i = 1; i < path.length; i++) {
    const l = dist(path[i - 1], path[i]);
    if (d <= l || i === path.length - 1) { const u = l > 1e-9 ? Math.min(1, d / l) : 1; return [lerp(path[i - 1][0], path[i][0], u), lerp(path[i - 1][1], path[i][1], u)]; }
    d -= l;
  }
  return path[path.length - 1];
}
/** when a word of a spoken line starts (s): the line is split at its punctuation into phrases, matched in order to the
 *  pauses of the voice (its loudness envelope); inside a phrase the time goes by the letters. `word` may be several
 *  words ("Stai aici"); case and diacritics do not matter. null = not in the line. */
const fold = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function wordTime(sp, word) {
  const toks = [...sp.text.matchAll(/[\p{L}\p{N}'’-]+|[,.;:!?…—]+/gu)].map((m) => m[0]);
  const want = fold(word).split(/[^\p{L}\p{N}'’-]+/u).filter(Boolean);
  const words = toks.map((x, i) => ({ x: fold(x), i })).filter((w) => /[\p{L}\p{N}]/u.test(w.x));
  let hit = -1;
  for (let k = 0; k + want.length <= words.length && hit < 0; k++) if (want.every((w, j) => words[k + j].x === w)) hit = words[k].i;
  if (hit < 0) return null;
  // phrases: letters per phrase; the word's offset inside its phrase
  const phrases = [{ n: 0 }]; let at = null;
  for (let i = 0; i < toks.length; i++) {
    const x = toks[i];
    if (/^[,.;:!?…—]+$/.test(x)) { if (phrases[phrases.length - 1].n > 0) phrases.push({ n: 0 }); continue; }
    if (i === hit) at = { p: phrases.length - 1, off: phrases[phrases.length - 1].n };
    phrases[phrases.length - 1].n += x.length + 1;
  }
  if (!phrases[phrases.length - 1].n) phrases.pop();
  const dur = sp.end - sp.start;
  let spans = null;
  const env = sp.env, fps = sp.envFps || 30;
  if (env && env.length > 4) {
    const mx = Math.max(...env), thr = mx * 0.12;
    let s0 = env.findIndex((v) => v > thr), s1 = env.length - 1; while (s1 > 0 && env[s1] <= thr) s1--;
    const gaps = [];
    for (let i = s0; i <= s1; i++) if (env[i] <= thr) { let j = i; while (j <= s1 && env[j] <= thr) j++; if (j - i >= 0.1 * fps) gaps.push({ a: i, b: j, n: j - i }); i = j; }
    const need = phrases.length - 1;
    if (s0 >= 0 && gaps.length >= need) {
      const pick = gaps.sort((x, y) => y.n - x.n).slice(0, need).sort((x, y) => x.a - y.a);
      const cuts = [s0, ...pick.flatMap((g) => [g.a, g.b]), s1 + 1];
      spans = phrases.map((_, k) => [cuts[2 * k] / fps, cuts[2 * k + 1] / fps]);
    }
  }
  if (!spans) {
    // no envelope: the phrases share the line by their letters, with a short pause between them
    const tot = phrases.reduce((s, p) => s + p.n, 0) + 6 * (phrases.length - 1);
    let c = 0; spans = phrases.map((p) => { const a = (c / tot) * dur; c += p.n; const b = (c / tot) * dur; c += 6; return [a, b]; });
  }
  const [a, b] = spans[at.p];
  return sp.start + a + (b - a) * (at.off / Math.max(1, phrases[at.p].n));
}
/** u (0..1) at which ease(u) = f */
function invEase(ease, f) { let lo = 0, hi = 1; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (ease(m) < f) lo = m; else hi = m; } return (lo + hi) / 2; }
/** a polyline with every corner (> 8°) cut by a short chord, and the corners as { d0, d1 (distance along the new path
 *  where the chord starts / ends), p, hOut }: the walker steers round the waypoint instead of pivoting on it */
function roundCorners(raw) {
  const pts = raw.filter((p, i) => i === 0 || dist(p, raw[i - 1]) > 0.02);
  if (pts.length < 3) return { path: pts.length > 1 ? pts : [raw[0], raw[raw.length - 1]], corners: [] };
  const path = [pts[0]], marks = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const hIn = headingTo(a, b), hOut = headingTo(b, c);
    if (Math.abs(lerpAngle(hIn, hOut, 1) - hIn) < 0.14) { path.push(b); continue; }
    const r = Math.min(0.7, dist(a, b) / 2.5, dist(b, c) / 2.5);
    const p0 = [b[0] - Math.sin(hIn) * r, b[1] - Math.cos(hIn) * r], p1 = [b[0] + Math.sin(hOut) * r, b[1] + Math.cos(hOut) * r];
    const pm = [(p0[0] + p1[0] + 2 * b[0]) / 4, (p0[1] + p1[1] + 2 * b[1]) / 4]; // the chord bulges toward the corner
    path.push(p0, pm, p1);
    marks.push({ i0: path.length - 3, i1: path.length - 1, p: b, hOut });
  }
  path.push(pts[pts.length - 1]);
  const cum = [0]; for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + dist(path[i - 1], path[i]));
  return { path, corners: marks.map((m) => ({ d0: cum[m.i0], d1: cum[m.i1], p: m.p, hOut: m.hOut })) };
}
const pathLength = (path) => { let L = 0; for (let i = 1; i < path.length; i++) L += dist(path[i - 1], path[i]); return L; };
/** the time fraction k at which smooth(k) = f (walks ease in / out over the whole route) */
function invSmooth(f) { let lo = 0, hi = 1; for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (smooth(m) < f) lo = m; else hi = m; } return (lo + hi) / 2; }

// People keep apart (2D sets): a walk goes AROUND the other people and the buildings instead of through them.
// Clearance ellipse around a person (x, z) — a bit wider than the `overlap` check (1.3 × 0.8).
export const PERSON_RX = 1.7, PERSON_RZ = 1.05;
const personHit = (p, q, k = 1) => ((p[0] - q[0]) / (PERSON_RX * k)) ** 2 + ((p[1] - q[1]) / (PERSON_RZ * k)) ** 2 < 1;
export const mixVec = (a, b, k) => a.map((x, i) => lerp(x, b[i], k));

// ---------- compiler ----------
// `opts` (the "blender" style passes them, lib/engine3/timeline3.js): layoutOf(scene) -> layout, gestures (durations),
// walkSpeed, turnTime, giveTime, postureTime, hugDistance. Without opts every film compiles exactly as before.
export function compile(desc, manifest = {}, opts = {}) {
  const GEST = opts.gestures || GESTURES;
  const WALK = opts.walkSpeed || WALK_SPEED, TURN = opts.turnTime || TURN_TIME, GIVE = opts.giveTime || GIVE_TIME, POSTURE = opts.postureTime || POSTURE_TIME;
  const fmt = { ...DEFAULT_FORMAT, ...(desc.format || {}) };
  const characters = desc.characters || {};
  const out = { id: desc.id, title: desc.title, ...fmt, scenes: [], speeches: [], sounds: [], musicDucks: [], warnings: [], missingAudio: 0 };
  let t = 0;

  for (const [si, scene] of (desc.scenes || []).entries()) {
    const sceneId = scene.id || `s${si + 1}`;
    const layout = opts.layoutOf ? opts.layoutOf(scene) : getLayout(scene.set || 'desert-lavra');
    const sc = { id: sceneId, index: si, start: t, def: scene, layout, beats: [], actors: {}, props: {},
      transition: scene.transition || 'fade' };

    // --- initial actor state (two passes so "face" can point at another cast member)
    const A = sc.actors;
    const actorPosAt = (id, time) => {
      const a = A[id]; if (!a) return null;
      return { pos: sampleSegs(a.pos, time, a.initial.pos, mixVec), h: sampleSegs(a.head, time, a.initial.h, lerpAngle) };
    };
    // the camera of the beat being compiled (a turn of the back to it is avoided, see pushTurn)
    let curCam = scene.camera || null;
    /** heading segment(s) from → to over [t0, t1]. "blender" style: a big turn (> 125°) goes the way that shows the
     *  face to the camera, not the back (split in two halves that keep their speed at the joint) */
    // how long a turn takes: TURN, or longer for a big turn when opts.turnRate (rad/s) is set (blender: a 180° turn in
    // 0.6 s whipped the head around — reviewer 043)
    const turnT = (from, to) => (opts.turnRate ? Math.max(TURN, Math.abs(lerpAngle(from, to, 1) - from) / opts.turnRate) : TURN);
    function pushTurn(a, t0, t1, from, to, at) {
      const d = lerpAngle(from, to, 1) - from;
      const c = curCam;
      let dd = d;
      if (Math.abs(d) > 2.2 && c && c.world && Array.isArray(c.on) && at) {
        const dir = ((c.angle || 0) * Math.PI) / 180, R = c.dist ?? 24;
        const camH = headingTo(at, [c.on[0] + Math.sin(dir) * R, c.on[1] + Math.cos(dir) * R]);
        const alt = d - Math.sign(d) * Math.PI * 2;
        const off = (x) => Math.abs(lerpAngle(camH, from + x / 2, 1) - camH);
        if (off(alt) < off(d)) dd = alt;
      }
      if (dd === d) { const s0 = { t0, t1, from, to }; a.head.push(s0); return [s0]; }
      const tm = (t0 + t1) / 2, mid = from + dd / 2;
      const s1 = { t0, t1: tm, from, to: mid, ease: 'in' }, s2 = { t0: tm, t1, from: mid, to: from + dd, ease: 'out' };
      a.head.push(s1, s2);
      return [s1, s2];
    }
    function faceHeading(face, fromPos, time) {
      if (typeof face === 'number') return (face * Math.PI) / 180;
      if (face === 'camera') return 0;
      if (A[face]) return headingTo(fromPos, actorPosAt(face, time ?? 0).pos);
      // a prop: toward where it is then (on the ground, or in someone's hands)
      if (sc.props[face]) { const h = currentHolder(sc.props[face], time ?? 0); const q = h.actor ? actorPosAt(h.actor, time ?? 0)?.pos : h.pos && [h.pos[0], h.pos[2]]; if (q) return headingTo(fromPos, q); }
      const an = resolveAnchor(layout, face);
      return headingTo(fromPos, an.pos);
    }
    // a route from → to that keeps clear of the other people (where they are when the walker passes) and of the
    // buildings: detours in front of / behind a person, around the front corners of a building. Pure function.
    function routeWalk(id, from, to, t0, speed, ignore) {
      const boxes = [...(layout.cells || []), ...(layout.church ? [layout.church] : []), ...(layout.rocks || [])]
        .filter((c) => c.w && c.d).map((c) => [c.x - c.w / 2 - 0.5, c.z - c.d / 2 - 0.5, c.x + c.w / 2 + 0.5, c.z + c.d / 2 + 0.6]);
      const inBox = (p, b, m = 0) => p[0] > b[0] - m && p[0] < b[2] + m && p[1] > b[1] - m && p[1] < b[3] + m;
      const live = boxes.filter((b) => !inBox(from, b, 0.6) && !inBox(to, b, 0.6));   // walking to / from a door: that house is fine
      const others = Object.keys(A).filter((o) => o !== id && !ignore.has(o) && !A[o].initial.ride);
      const hit = (p, tp) => {
        for (const o of others) {
          const q = actorPosAt(o, tp).pos;
          if (personHit(p, q) && !personHit(from, q) && !personHit(to, q)) return { c: q };
        }
        for (const b of live) if (inBox(p, b)) return { b };
        return null;
      };
      const free = (p, tp) => !hit(p, tp) && !live.some((b) => inBox(p, b, 0.2));
      const route = (P, Q, tP, depth) => {
        const L = dist(P, Q), n = Math.max(2, Math.ceil(L / 0.25));
        for (let i = 1; i < n; i++) {
          const k = i / n, p = [lerp(P[0], Q[0], k), lerp(P[1], Q[1], k)], tp = tP + (L * k) / speed;
          const h = hit(p, tp);
          if (!h) continue;
          if (depth >= 4) return [Q];
          const cands = h.c
            ? [[h.c[0], h.c[1] + PERSON_RZ + 0.6], [h.c[0], h.c[1] - PERSON_RZ - 0.6], [h.c[0], h.c[1] + PERSON_RZ * 2 + 0.6]]
            : [[h.b[0] - 0.5, h.b[3] + 0.7], [h.b[2] + 0.5, h.b[3] + 0.7]];
          const ok = cands.filter((w) => dist(w, P) > 0.3 && free(w, tP + dist(P, w) / speed));
          if (!ok.length) return [Q];
          ok.sort((u, w) => dist(P, u) + dist(u, Q) - dist(P, w) - dist(w, Q));
          const W = ok[0];
          return [...route(P, W, tP, depth + 1), ...route(W, Q, tP + dist(P, W) / speed, depth + 1)];
        }
        return [Q];
      };
      return [from, ...route(from, to, t0, 0)];
    }
    for (const [id, c] of Object.entries(scene.cast || {})) {
      if (!characters[id]) out.warnings.push(`scene ${sceneId}: cast "${id}" is not in characters`);
      const a = resolveAnchor(layout, c.at || 'center');
      A[id] = {
        id, outfit: c.look || null, initial: { pos: a.pos, h: a.h ?? 0, emotion: c.emotion || 'neutral', posture: c.posture || 'stand', visible: c.visible !== false, seat: c.seat || 0, tilt: c.tilt || 0, lift: c.lift || 0, ride: c.ride || null, hands: c.hands || null },
        pos: [], head: [], gestures: [], emotion: [], posture: [], visible: [], walking: [], talk: [], look: [], ride: [],
      };
    }
    for (const [id, c] of Object.entries(scene.cast || {})) if (c.face != null) A[id].initial.h = faceHeading(c.face, A[id].initial.pos, null);

    // --- props
    for (const [id, p] of Object.entries(scene.props || {})) {
      let holder;
      if (p.in) holder = { actor: p.in, hand: p.hand || 'R' };
      else if (p.at) {
        const a = resolveAnchor(layout, p.at);
        holder = { pos: [a.pos[0], p.y ?? 0, a.pos[1]], h: typeof p.face === 'number' ? (p.face * Math.PI) / 180 : a.h ?? 0 }; // `face`: degrees (a cart, a donkey turned)
      } else holder = { pos: [0, 0, 0], h: 0 };
      sc.props[id] = { id, type: p.type || id, opts: p, initial: holder, moves: [], visible: [], bend: [], tilt: [], gestures: [] };
    }

    // --- beats
    let bt = t + (scene.lead ?? 0.3);
    let prevCamera = scene.camera || { shot: 'wide' };
    const untilQ = [];
    for (const [bi, beat] of (scene.beats || []).entries()) {
      const b = { index: bi, start: bt, end: bt, def: beat, camera: beat.camera || null, card: beat.card || null };
      let end = bt + (beat.duration || 0);

      // speech
      if (beat.say) {
        const speaker = beat.say;
        if (!characters[speaker]) out.warnings.push(`scene ${sceneId} beat ${bi}: unknown speaker "${speaker}"`);
        const key = lineKey(desc, speaker, beat);
        const m = manifest[key];
        if (!m) out.missingAudio++;
        const dur = m ? m.duration : estimateSpeech(beat.text);
        const s0 = bt + (beat.sayAt || 0);
        const sp = { scene: sceneId, beat: bi, speaker, name: characters[speaker]?.name || speaker, text: beat.text,
          key, file: m ? m.file : null, start: s0, end: s0 + dur, env: m?.env || null, envFps: m?.envFps || 30,
          ...(beat.quietHands && { quietHands: true }) };
        b.speech = sp;
        out.speeches.push(sp);
        for (const who of [speaker, ...asArray(beat.with)]) {
          if (!A[who]) continue;
          A[who].talk.push(sp);
          if (beat.emotion) A[who].emotion.push({ t: s0, to: beat.emotion });
        }
        end = Math.max(end, sp.end + (beat.pause ?? DEFAULT_PAUSE));
      }

      // Sound effects use the scene clock and play independently of dialogue.
      for (const cue of asArray(beat.sounds)) {
        const { file, at = 0, duration, volume = 1 } = cue || {};
        if (!/^[a-z0-9_-]+\.mp3$/.test(file) || !Number.isFinite(at) || at < 0 ||
            !Number.isFinite(duration) || duration <= 0 || !Number.isFinite(volume) || volume < 0 || volume > 1) {
          out.warnings.push(`scene ${sceneId} beat ${bi}: invalid sound cue "${file}"`);
          continue;
        }
        const start = (cue.word && b.speech ? wordTime(b.speech, cue.word) ?? bt : bt) + at;
        out.sounds.push({ file, start, end: start + duration, volume });
        end = Math.max(end, start + duration);
      }

      // actions
      curCam = beat.camera || prevCamera;
      for (const act of asArray(beat.do)) {
        let at = bt + (act.at || 0);
        // "word": "piatră" — start on that word of the beat's line (+ `at` seconds), timed from the voice itself
        if (act.word != null) {
          const tw = b.speech ? wordTime(b.speech, act.word) : null;
          if (tw == null) out.warnings.push(`scene ${sceneId} beat ${bi}: "word": "${act.word}" — not in the line`);
          else at = tw + (act.at || 0);
        }
        const aEnd = applyAction(act, at);
        if (act.wait !== false) end = Math.max(end, aEnd);
      }
      b.end = Math.max(end, bt + 0.6);
      if (Number.isFinite(beat.musicGain) && beat.musicGain >= 0 && beat.musicGain < 1) {
        const last = out.musicDucks.at(-1);
        if (last?.gain === beat.musicGain && last.end === bt) last.end = b.end;
        else out.musicDucks.push({ start: bt, end: b.end, gain: beat.musicGain });
      }
      // "until": <beat> — a gesture held to the end of that later beat's line (resolved once that beat is compiled)
      // (+ 0.8 s: the gesture melts back AFTER the last word, not during it)
      for (const u of untilQ.filter((x) => x.beat === bi)) u.g.t1 = Math.max(u.g.t0 + 0.5, (b.speech ? b.speech.end : b.end) + 0.8);
      if (b.camera) prevCamera = b.camera;
      b.activeCamera = prevCamera;
      sc.beats.push(b);
      bt = b.end;
    }
    for (const a of Object.values(A)) {
      for (const k of ['pos', 'head', 'gestures', 'posture']) a[k].sort((x, y) => x.t0 - y.t0);
      for (const k of ['emotion', 'visible', 'look', 'ride']) a[k].sort((x, y) => x.t - y.t);
    }
    // 2D: people standing inside each other (at the start of every beat and at the end of every move) — told by
    // `npm run validate`, before any still is rendered. A hugging pair is allowed to stand close.
    if (layout.twoD) {
      const times = [...new Set([sc.start + 0.01, ...sc.beats.map((b) => b.start + 0.01), ...Object.values(A).flatMap((a) => a.pos.map((q) => q.t1 + 0.01))])].sort((x, y) => x - y);
      const shown = (a, tt) => { let v = a.initial.visible; for (const e of a.visible) if (e.t <= tt) v = e.v ?? e.to ?? v; return v !== false; };
      const said = new Set();
      for (const tt of times) {
        const ids = Object.keys(A).filter((k) => shown(A[k], tt) && !A[k].initial.ride);
        for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
          const p = actorPosAt(ids[i], tt).pos, q = actorPosAt(ids[j], tt).pos;
          if (Math.abs(p[0] - q[0]) >= 1.3 || Math.abs(p[1] - q[1]) >= 0.8) continue;
          if ((sc.hugs || []).some((h) => tt >= h.t0 && tt <= h.t1 && [h.a, h.b].includes(ids[i]) && [h.a, h.b].includes(ids[j]))) continue;
          const key = ids[i] + ids[j];
          if (said.has(key)) continue; said.add(key);
          out.warnings.push(`scene ${sceneId} ${tt.toFixed(1)}s: "${ids[i]}" and "${ids[j]}" stand inside each other — keep them ≥ 1.6 apart (x) or 1 apart in depth (z); to hug use { "actor": …, "hug": … }`);
        }
      }
    }
    for (const p of Object.values(sc.props)) { p.moves.sort((x, y) => x.t0 - y.t0); p.visible.sort((x, y) => x.t - y.t); p.bend.sort((x, y) => x.t0 - y.t0); }
    sc.end = bt + (scene.tail ?? 0.3);
    const ambience = scene.ambience;
    if (/^[a-z0-9_-]+\.mp3$/.test(ambience?.file)) {
      const last = out.sounds.findLast((sound) => sound.ambient);
      if (last?.file === ambience.file && last.end === sc.start && last.volume === ambience.volume) last.end = sc.end;
      else out.sounds.push({ ...ambience, start: sc.start, end: sc.end, ambient: true });
    }
    sc.initialCamera = scene.camera || { shot: 'wide' };
    out.scenes.push(sc);
    t = sc.end;

    function applyAction(act, at) {
      // "after": "<actor>" — start when that actor has finished walking (+ `at` seconds), e.g. show a prop he went to fetch
      if (act.after) { const w = A[act.after]?.walkEnd; if (w != null) at = Math.max(at, w + (act.at || 0)); else out.warnings.push(`scene ${sceneId}: "after": "${act.after}" — no walk of that actor before`); }
      const id = act.actor;
      const a = id ? A[id] : null;
      if (id && !a) { out.warnings.push(`scene ${sceneId}: action on actor "${id}" not in cast`); return at; }
      let tEnd = at;
      if (act.place && a) {
        const an = resolveAnchor(layout, act.place, { actorPos: (x) => actorPosAt(x, at) });
        const cur = actorPosAt(id, at);
        a.pos.push({ t0: at, t1: at, from: cur.pos, to: an.pos });
        if (an.h != null) a.head.push({ t0: at, t1: at, from: cur.h, to: an.h });
      }
      // hug: { actor: "a", hug: "b" } — a walks to b's side (the side he comes from), both turn to face each other in profile
      // (heading ±90°) and hug; the pair is allowed to stand close (no `overlap` warning) while they hug
      if (act.hug && a) {
        if (!A[act.hug]) { out.warnings.push(`scene ${sceneId}: hug: "${act.hug}" not in cast`); return at; }
        const pa = actorPosAt(id, at).pos, pb = actorPosAt(act.hug, at).pos;
        // the two stand on a line across the view (world x; "blender" style: across the beat's camera, so both are
        // seen in profile — on the world axis with an angled camera one of them showed his back)
        let ax = [1, 0];
        const c = curCam;
        if (opts.joinWalks && c && c.world && Array.isArray(c.on)) {
          const dir = ((c.angle || 0) * Math.PI) / 180, R = c.dist ?? 24;
          const camH = headingTo(pb, [c.on[0] + Math.sin(dir) * R, c.on[1] + Math.cos(dir) * R]);
          ax = [Math.cos(camH), -Math.sin(camH)]; // perpendicular to the view, pointing to the camera's right
        }
        const along = (pa[0] - pb[0]) * ax[0] + (pa[1] - pb[1]) * ax[1];
        const side = act.side === 'left' ? -1 : act.side === 'right' ? 1 : along <= 0 ? -1 : 1;
        // side by side, the one who comes a little nearer the camera (so one is in front, one behind)
        const gap = act.distance ?? opts.hugDistance ?? 2.0;
        const spot = [pb[0] + side * gap * ax[0], pb[1] + side * gap * ax[1] + (opts.hugOffset ?? 0.35)];
        const faceA = (headingTo(spot, pb) * 180) / Math.PI;
        const arrive = applyAction({ actor: id, walk: spot, face: faceA, speed: act.speed, ignore: [act.hug] }, at);
        applyAction({ actor: act.hug, face: faceA + 180 }, at);
        const dur = act.duration ?? 2.8;
        a.gestures.push({ name: 'hug', t0: arrive, t1: arrive + dur, hand: 'R' });
        A[act.hug].gestures.push({ name: 'hug', t0: arrive, t1: arrive + dur, hand: 'R' });
        (sc.hugs ||= []).push({ a: id, b: act.hug, t0: at, t1: arrive + dur + 0.6 });
        return arrive + dur;
      }
      if (act.walk && a) {
        // two walks of the same actor in one beat: the second starts when the first one is over (never both at once)
        if (a.walkEnd != null && at < a.walkEnd) at = a.walkEnd;
        // "blender" style: a walk that starts as the previous one ends CONTINUES it (one path, one steady pace, the
        // corner rounded) — two separate walks slow down to a stop and start again at the waypoint
        const join = opts.joinWalks && a.lastWalk && at <= a.lastWalk.end + 0.05 ? a.lastWalk : null;
        if (join) {
          for (const k of ['pos', 'walking', 'head']) a[k] = a[k].filter((x) => !join.items.includes(x));
          at = join.t0;
        }
        const cur = join ? { pos: join.to, h: join.h0 } : actorPosAt(id, at);
        const from = join ? join.from : cur.pos;
        let target;
        if (A[act.walk]) {
          // walk up to another actor and stop IN FRONT of them (at most `maxAngle`, default 55°, off their
          // facing direction), not at their shoulder: things given then pass in front of the body, not through it
          const T = actorPosAt(act.walk, at), o = T.pos;
          // a seated / kneeling actor has legs sticking out in front: stand a bit further away
          const tA = A[act.walk], tPost = tA.posture.length ? tA.posture[tA.posture.length - 1].to : tA.initial.posture;
          const stop = (act.distance ?? 2.2) + (tPost === 'stand' ? 0 : 1.0);
          const ang = Math.atan2(cur.pos[0] - o[0], cur.pos[1] - o[1]);
          let rel = ((ang - T.h) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
          const lim = ((act.maxAngle ?? 55) * Math.PI) / 180;
          rel = Math.max(-lim, Math.min(lim, rel));
          const hs = T.h + rel;
          target = { pos: [o[0] + Math.sin(hs) * stop, o[1] + Math.cos(hs) * stop], h: null };
          if (act.face == null) act = { ...act, face: act.walk };
        } else {
          target = resolveAnchor(layout, act.walk, { actorPos: (x) => actorPosAt(x, at) });
        }
        const speed = act.speed || WALK;
        const ignore = new Set([...(act.ignore || []), ...(A[act.walk] ? [act.walk] : [])]);
        const leg = layout.twoD && act.avoid !== false ? routeWalk(id, cur.pos, target.pos, at, speed, ignore) : [cur.pos, target.pos];
        const d2 = pathLength(leg);
        if (act.back) {
          // "back": true — steps backwards, still facing the way he faces (a baker drawing the peel out of the oven):
          // no turn, the walk cycle runs in reverse; keep it short and slow (≤ 2.5, speed ≤ 1)
          const D = act.duration || Math.max(0.8, d2 / Math.min(speed, 1.0));
          const segP = { t0: at, t1: at + D, from: cur.pos, to: target.pos }, segW = { t0: at, t1: at + D, style: act.style || 'calm', back: true };
          a.pos.push(segP); a.walking.push(segW);
          tEnd = at + D;
          a.walkEnd = tEnd; a.lastWalk = null;
        } else if (opts.joinWalks) {
          const rawBase = join ? [...join.raw, ...leg.slice(1)] : leg;
          // arrive along the final facing: the path bends in during the last steps (a person curves in to face whom
          // they walk to). Turning the body while still walking straight on looked like walking sideways.
          let raw = rawBase;
          const ff = act.face ?? (target.h != null ? target.h * 180 / Math.PI : null);
          if (ff != null && rawBase.length >= 2) {
            const P1 = rawBase[rawBase.length - 1], P0 = rawBase[rawBase.length - 2];
            const hF = faceHeading(ff, P1, at), hL = headingTo(P0, P1), dA = Math.abs(lerpAngle(hL, hF, 1) - hL);
            const r = Math.min(1.1, dist(P0, P1) / 3);
            if (dA > 0.25 && dA < 2.1 && r > 0.3) raw = [...rawBase.slice(0, -1), [P1[0] - Math.sin(hF) * r, P1[1] - Math.cos(hF) * r], P1];
          }
          const moving = (join ? join.moving : 0) + (act.duration || Math.max(join ? 0.2 : 0.6, d2 / speed));
          const { path, corners } = roundCorners(raw);
          const L = pathLength(path), D = moving;
          const ease = opts.walkEase || ((u) => smooth(u));
          const timeAt = (dd) => at + D * invEase((x) => ease(x, D), L > 0 ? dd / L : 1);
          const items = [];
          const segP = path.length > 2 ? { t0: at, t1: at + D, from, to: target.pos, path } : { t0: at, t1: at + D, from, to: target.pos };
          const segW = { t0: at, t1: at + D, style: act.style || join?.style || 'normal' };
          a.pos.push(segP); a.walking.push(segW); items.push(segP, segW);
          // heading: into the first leg as the walk starts, then around every (rounded) corner while passing it
          let hWalk = cur.h, tFree = at;
          const h1st = headingTo(path[0], path[1] || path[0]);
          if (dist(path[0], path[1] || path[0]) > 0.05) { const tt = turnT(hWalk, h1st); items.push(...pushTurn(a, at, at + tt, hWalk, h1st, from)); hWalk = h1st; tFree = at + tt; }
          for (const c of corners) {
            // a sharp corner (the curve into the final facing) still turns the body at a calm speed
            const ta = timeAt(c.d0), tb = timeAt(c.d1), mid = (ta + tb) / 2, half = Math.max(0.2, (tb - ta) / 2, opts.turnRate ? turnT(hWalk, c.hOut) * 0.4 : 0);
            const t0 = Math.max(tFree, mid - half), t1 = Math.max(t0 + 0.2, mid + half);
            items.push(...pushTurn(a, t0, t1, hWalk, c.hOut, c.p)); hWalk = c.hOut; tFree = t1;
          }
          tEnd = at + D;
          const finalFace = act.face ?? (target.h != null ? target.h * 180 / Math.PI : null);
          if (finalFace != null) {
            const h1 = faceHeading(finalFace, target.pos, tEnd);
            const dh = Math.abs(lerpAngle(hWalk, h1, 1) - hWalk);
            // turn toward the final facing during the last steps (arrives already facing there), not after stopping;
            // a big turn (> 100°) still happens on the spot, in small steps
            const ov = dh < 1.75 ? Math.max(0, Math.min(TURN * 0.85, tEnd - tFree - 0.05)) : 0;
            const t0 = tEnd - ov, t1 = Math.max(tEnd + 0.15, t0 + turnT(hWalk, h1));
            items.push(...pushTurn(a, t0, t1, hWalk, h1, target.pos));
            tEnd = t1;
          }
          a.walkEnd = tEnd;
          a.lastWalk = { t0: at, from, to: target.pos, h0: cur.h, raw: rawBase, moving, items, end: tEnd, style: segW.style };
        } else {
          const path = leg, d = d2;
          const dur = act.duration || Math.max(0.6, d / speed);
          // heading: turn into each leg of the route when the walker reaches it
          let hWalk = cur.h, legT = at, acc = 0;
          for (let i = 1; i < path.length; i++) {
            const l = dist(path[i - 1], path[i]);
            if (l > 0.05) {
              const h = headingTo(path[i - 1], path[i]);
              a.head.push({ t0: legT, t1: legT + TURN * (i === 1 ? 1 : 0.6), from: hWalk, to: h });
              hWalk = h;
            }
            acc += l; legT = at + dur * invSmooth(d > 0 ? acc / d : 1);
          }
          a.pos.push(path.length > 2 ? { t0: at, t1: at + dur, from: cur.pos, to: target.pos, path } : { t0: at, t1: at + dur, from: cur.pos, to: target.pos });
          a.walking.push({ t0: at, t1: at + dur, style: act.style || 'normal' });
          tEnd = at + dur;
          const finalFace = act.face ?? (target.h != null ? target.h * 180 / Math.PI : null);
          if (finalFace != null) {
            const h1 = faceHeading(finalFace, target.pos, tEnd);
            a.head.push({ t0: tEnd, t1: tEnd + TURN, from: hWalk, to: h1 });
            tEnd += TURN;
          }
          a.walkEnd = tEnd;
        }
      } else if (act.face != null && a) {
        const cur = actorPosAt(id, at);
        const hTo = faceHeading(act.face, cur.pos, at), tt = turnT(cur.h, hTo);
        if (opts.joinWalks) pushTurn(a, at, at + tt, cur.h, hTo, cur.pos);
        else a.head.push({ t0: at, t1: at + TURN, from: cur.h, to: hTo });
        tEnd = Math.max(tEnd, at + tt);
      }
      // an animal prop's own gesture (blender: `{ "prop": "magar", "gesture": "bray" }` — the donkey lifts its head and brays)
      if (act.gesture && act.prop && !a) {
        const p = sc.props[act.prop];
        if (!p) { out.warnings.push(`gesture: unknown prop "${act.prop}"`); return tEnd; }
        const dur = act.duration || 1.6;
        (p.gestures ||= []).push({ name: act.gesture, t0: at, t1: at + dur });
        tEnd = Math.max(tEnd, at + dur);
      }
      if (act.gesture && a) {
        if (!GEST[act.gesture]) out.warnings.push(`unknown gesture "${act.gesture}"`);
        const dur = act.duration || GEST[act.gesture] || 1;
        const g = { name: act.gesture, t0: at, t1: at + dur, hand: act.hand || 'R', ...(act.partner && { partner: act.partner }) };
        a.gestures.push(g);
        if (act.until != null) untilQ.push({ g, beat: +act.until });
        tEnd = Math.max(tEnd, at + dur);
      }
      if (act.emotion && a) a.emotion.push({ t: at, to: act.emotion });
      // piggyback: { actor: "sick", ride: "agathon" } … { actor: "sick", ride: false, place: "x" } (instant: do it on a cut)
      if (act.ride !== undefined && a) {
        if (act.ride && !A[act.ride]) out.warnings.push(`scene ${sceneId}: ride: "${act.ride}" not in cast`);
        a.ride.push({ t: at, v: act.ride || null });
      }
      if (act.lookAt !== undefined && a) a.look.push({ t: at, target: act.lookAt });
      if (act.posture && a) {
        const prev = a.posture.length ? a.posture[a.posture.length - 1].to : a.initial.posture;
        const pt = act.duration ?? POSTURE; // a short duration = sit / stand at once (on a camera cut)
        a.posture.push({ t0: at, t1: at + pt, from: prev, to: act.posture });
        tEnd = Math.max(tEnd, at + pt);
      }
      if (act.show !== undefined) {
        const target = act.prop ? sc.props[act.prop] : a;
        if (target) target.visible.push({ t: at, v: !!act.show });
      }
      // swing a set's door open / shut (blender sets: the node `door:<name>`): { door: "cell1", open: 1, duration: 0.9 }
      if (act.door) {
        const segs = ((sc.doors ||= {})[act.door] ||= []);
        const prev = segs.length ? segs[segs.length - 1].to : 0;
        const dur = act.duration ?? 0.9;
        segs.push({ t0: at, t1: at + dur, from: prev, to: act.open === undefined ? 1 : +act.open });
        tEnd = Math.max(tEnd, at + dur);
      }
      // animate a prop's own pose value 0..1 (e.g. the `tree` bowing down): { prop: "tree", bend: 1, duration: 3 }
      if (act.bend !== undefined && act.prop) {
        const p = sc.props[act.prop];
        if (!p) { out.warnings.push(`bend: unknown prop "${act.prop}"`); return tEnd; }
        // null = the prop's own resting value (a sack is full: 1) — resolved by the stage with bendRest() (props.js)
        const prev = p.bend.length ? p.bend[p.bend.length - 1].to : (p.opts.bend ?? null);
        const dur = act.duration || 2.5;
        p.bend.push({ t0: at, t1: at + dur, from: prev, to: +act.bend });
        tEnd = Math.max(tEnd, at + dur);
      }
      // tilt a held prop forward about the hand (degrees; blender), e.g. pour from a jar: { prop: "ulcior", tilt: 85, duration: 0.8 }
      if (act.tilt !== undefined && act.prop) {
        const p = sc.props[act.prop];
        if (!p) { out.warnings.push(`tilt: unknown prop "${act.prop}"`); return tEnd; }
        const prev = p.tilt.length ? p.tilt[p.tilt.length - 1].to : +p.opts.tilt || 0;
        const dur = act.duration || 0.8;
        p.tilt.push({ t0: at, t1: at + dur, from: prev, to: +act.tilt });
        tEnd = Math.max(tEnd, at + dur);
      }
      if (act.give) {
        const p = sc.props[act.give];
        if (!p) { out.warnings.push(`give: unknown prop "${act.give}"`); return tEnd; }
        const from = act.from ? { actor: act.from, hand: act.fromHand || 'R' } : currentHolder(p, at);
        const to = { actor: act.to, hand: act.hand || 'R' };
        const dur = act.duration || GIVE;
        p.moves.push({ t0: at, t1: at + dur, from, to, ...(act.reach ? { reach: true } : {}) });
        if (from.actor && A[from.actor]) A[from.actor].gestures.push({ name: 'offer', t0: at, t1: at + dur * 0.7, hand: from.hand });
        if (A[act.to]) A[act.to].gestures.push({ name: 'receive', t0: at, t1: at + dur, hand: to.hand }); // hand up early: the prop arrives in front
        tEnd = Math.max(tEnd, at + dur);
      }
      if (act.put) {
        const p = sc.props[act.put];
        if (!p) { out.warnings.push(`put: unknown prop "${act.put}"`); return tEnd; }
        // `"into": "<prop>"` = hang it on a pack animal (blender: the slot of the carrier's meta; the stage resolves where)
        if (act.into && !sc.props[act.into]) { out.warnings.push(`put: unknown carrier "${act.into}"`); return tEnd; }
        const an = act.into ? { pos: [0, 0], h: 0 } : resolveAnchor(layout, act.on, { actorPos: (x) => actorPosAt(x, at) });
        const from = currentHolder(p, at);
        // `"walk": true` = an animal walks there on its own legs (blender `walker` props), `via` = waypoints, speed (1.7)
        const via = act.walk && act.via ? act.via.map((v) => { const q = resolveAnchor(layout, v); return [q.pos[0], 0, q.pos[1]]; }) : null;
        const route = act.walk && from.pos ? [from.pos, ...(via || []), [an.pos[0], 0, an.pos[1]]] : null;
        const len = route ? route.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - route[i][0], q[2] - route[i][2]), 0) : 0;
        const dur = act.duration || (route ? Math.max(1, len / (act.speed || 1.7)) : opts.putTime || 0.8);
        // a load hung on a pack animal by someone is then TIED on (blender clip `tie`, its cord shows at the knot): `"tie"`
        // = seconds (default 2.2), false = no tying
        const tieD = act.into && from.actor && act.tie !== false ? (typeof act.tie === 'number' ? act.tie : 2.2) : 0;
        let h = typeof act.face === 'number' ? (act.face * Math.PI) / 180 : an.h ?? 0;
        if (route && typeof act.face !== 'number') { const q0 = route[route.length - 2], q1 = route[route.length - 1]; h = Math.atan2(q1[0] - q0[0], q1[2] - q0[2]); }
        p.moves.push({ t0: at, t1: at + dur, from, to: { pos: [an.pos[0], act.y ?? 0, an.pos[1]], h }, ...(act.drop ? { drop: true } : {}), ...(act.float ? { float: true, ...(act.linear ? { linear: true } : {}) } : {}), ...(act.fly ? { fly: true } : {}), ...(act.slip ? { drop: true, slip: true } : {}),
          ...(act.reach ? { reach: true } : {}), ...(act.into ? { into: act.into } : {}), ...(tieD ? { tie: [at + dur, at + dur + tieD] } : {}), ...(route ? { walk: true, via: via || [], faceEnd: typeof act.face === 'number' } : {}) });
        // the hand that held it reaches out while letting go (otherwise the arm drops and the prop starts inside the body)
        if (from.actor && A[from.actor]) A[from.actor].gestures.push({ name: 'offer', t0: at, t1: at + dur * 0.7, hand: from.hand || 'R' });
        tEnd = Math.max(tEnd, at + dur + tieD);
      }
      return tEnd;
    }
  }
  out.duration = t;
  out.frames = Math.ceil(t * fmt.fps);
  return out;
}

function currentHolder(p, t) {
  let h = p.initial;
  for (const m of p.moves) if (m.t0 <= t) h = m.to;
  return h;
}

/** Values that change only at discrete times: [{t, ...}] -> last item with t <= time. */
export function lastBefore(list, t, key, initial) {
  let v = initial;
  for (const e of list) { if (e.t <= t) v = e[key]; else break; }
  return v;
}

export function sceneAt(tl, t) {
  for (const s of tl.scenes) if (t < s.end) return s;
  return tl.scenes[tl.scenes.length - 1];
}
export function beatAt(scene, t) {
  let b = scene.beats[0];
  for (const x of scene.beats) { if (x.start <= t) b = x; else break; }
  return b;
}
export { FADE };
