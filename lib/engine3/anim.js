// Actor state at time t -> clip layers (+ look-at, face) for lib/engine3/character.js. A PURE function of the
// compiled timeline and t: no state between frames, so stills, the web player's seek and the MP4 renderer agree.
import { sampleSegs, mixVec, lerpAngle, lastBefore, clamp01, smooth } from '../engine/timeline.js';
import { GESTURE_CLIPS, walkEase } from './timeline3.js';
import { MASKS } from './character.js';
import { EXPR } from './face.js';

const HEAD_ONLY = new Set(['nod', 'shake', 'look', 'listen']);
const ONE_ARM = new Set(['offer', 'point', 'wave', 'knock', 'bless', 'think', 'think_beard', 'talk1', 'talk3', 'talk4', 'give', 'take', 'drop', 'put_down', 'pick_up', 'set_down', 'lift_up']);
const FULL_BODY = new Set(['reap', 'knead', 'knead2', 'tie', 'slip', 'lunge', 'cross', 'bow', 'bow_deep', 'joy', 'laugh', 'surprised', 'put_down', 'pick_up', 'set_down', 'lift_up', 'hug', 'give', 'take', 'sad', 'clap_once', 'weave_rim', 'fold_cloth']);
const SEATED = new Set(['sit', 'floor-sit', 'kneel', 'lie']);
/** 0..1: this actor is speaking (eases in / out around its lines) */
/** conversation weight: who looks at whom. It rises a little before a line and HOLDS ~2.5 s after it (fading over 1 s), so
 * two people talking in turns keep looking at each other — weights that rose and fell with every line made both heads
 * swing away and back together at each line (reviewer, film 040) */
export function convW(a, t) { let w = 0; for (const sp of a.talk) if (t > sp.start - 1.4 && t < sp.end + 3.6) w = Math.max(w, windowW(t, sp.start - 0.6, sp.end + 2.5, 0.8, 1.0)); return w; }
export function talkW(a, t) { let w = 0; for (const sp of a.talk) if (t > sp.start - 0.3 && t < sp.end + 0.4) w = Math.max(w, windowW(t, sp.start, sp.end)); return w; }
/** nothing else uses the hands or the feet over [s0, s1] (with a margin for the blends) */
function talkFree(a, gestures, s0, s1) {
  const m = 0.45;
  for (const g of gestures) { const n = g.clip || GESTURE_CLIPS[g.name] || g.name; if (g.skip || HEAD_ONLY.has(n)) continue; if (g.t0 < s1 + m && g.t1 + 0.25 > s0 - m) return false; }
  for (const w of a.walking) if (w.t0 < s1 + m && w.t1 + 0.35 > s0 - m) return false;
  for (const p of a.posture) if (p.t0 < s1 + m && p.t1 > s0 - m) return false;
  const P = postureAt(a, s0);
  if (SEATED.has(P.to) || P.to === 'side-rest') return false;
  return true;
}
const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; return h; };

/** single clip (dev sheets) */
export function clipLayers(asset, clip, t) { return asset.clips[clip] ? [{ clip, t, w: 1 }] : []; }

/** pick the clip variant for a look / hand / pose: `<clip>_beard` for long beards, `<clip>_L` for the left hand,
 *  `<clip>_sit` when seated (it starts and ends with the hands on the knees, so the blend never crosses the lap) */
export function variant(asset, name, look, hand, seatedNow = false) {
  let n = name;
  if (seatedNow && asset.clips[n + '_sit']) return n + '_sit';
  if ((look?.beard === 'long' || look?.beard === 'full' || look?.beard === 'fluffy') && asset.clips[n + '_beard']) n += '_beard'; // a full beard is in the way of joined hands too
  if (hand === 'L' && asset.clips[n + '_L']) n += '_L';
  return asset.clips[n] ? n : null;
}

/** local clip time for a gesture of length D: plays at its own speed, the `hold` part stretches (or the clip is sped up) */
export function warp(C, u, D) {
  const dur = C.duration, hold = C.meta?.hold;
  if (D <= dur + 1e-3 || !hold) return Math.min(dur, D < dur ? (u * dur) / D : u);
  const [h0, h1] = hold, tail = dur - h1, stretch = D - h0 - tail;
  if (u <= h0) return u;
  if (u >= D - tail) return h1 + (u - (D - tail));
  return h0 + ((u - h0) / Math.max(1e-6, stretch)) * (h1 - h0);
}

export { walkEase };
const isWalk = (a, s) => a.walking.some((w) => Math.abs(w.t0 - s.t0) < 1e-6);
/** where the actor stands at t: walks at a steady pace (walkEase), other moves (a hug step, a seat) glide with smoothstep */
export function positionAt(a, t) {
  let v = a.initial.pos;
  for (const s of a.pos) {
    if (t < s.t0) break;
    if (t >= s.t1) { v = s.to; continue; }
    const D = s.t1 - s.t0;
    return sampleSegs([s], t, v, mixVec, isWalk(a, s) ? (x) => walkEase(x, D) : smooth);
  }
  return v;
}
/** 0..1: how much an interval [t0, t1] is "on" at t, rising over `rin` before t0 and falling over `rout` after t1 */
export const windowW = (t, t0, t1, rin = 0.3, rout = 0.4) => smooth(clamp01((t - t0 + rin) / rin)) * smooth(clamp01((t1 + rout - t) / rout));

const pathLen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };

export function postureAt(a, t) {
  let p = { from: a.initial.posture, to: a.initial.posture, k: 1, t0: -1, t1: -1 };
  for (const s of a.posture) if (t >= s.t0) p = { from: s.from, to: s.to, k: clamp01((t - s.t0) / Math.max(1e-6, s.t1 - s.t0)), t0: s.t0, t1: s.t1 };
  return p;
}

/**
 * The layers of one actor at time t.
 * ctx: { asset, look, seed, holding: { R: carryKind, L }, propEvents: [{ actorRole, clip, t0, t1 }], speakers: [...] }
 * returns { layers, posture, walking, sitW, face, lookTarget }
 */
export function actorLayers(a, t, ctx) {
  const { asset, look } = ctx;
  const layers = [];
  const seed = ctx.seed || 0;
  // ---- base: standing idle / seated idle / sitting down / standing up
  const P = postureAt(a, t);
  const seatedFrom = SEATED.has(P.from), seatedTo = SEATED.has(P.to);
  const sitClips = { sit: ['sit_down', 'sit_idle', 'stand_up'] };
  let sitW = 0;
  const idleName = seed % 2 ? 'idle2' : 'idle';
  const loopT = (name, tt) => { const C = asset.clips[name]; return C ? ((tt % C.duration) + C.duration) % C.duration : 0; };
  if (P.from === 'floor-sit' && P.to === 'side-rest' && P.k < 1) {
    sitW = 1 - smooth(clamp01((P.k - 0.22) / 0.78));
    layers.push({ clip: 'sit_idle', t: loopT('sit_idle', t + seed), w: 1 });
    layers.push({ clip: idleName, t: loopT(idleName, t + seed * 1.7), w: 1 - sitW });
  } else if (P.k >= 1 || P.from === P.to || (!seatedFrom && !seatedTo)) {
    if (seatedTo) { layers.push({ clip: 'sit_idle', t: loopT('sit_idle', t + seed), w: 1 }); sitW = 1; }
    else layers.push({ clip: idleName, t: loopT(idleName, t + seed * 1.7), w: 1 });
  } else {
    // sitting down / standing up: the transition clip starts and ends with the arms hanging, the idles have the hands
    // folded (standing) or on the knees (seated): cross-fade from the idle before and into the idle after
    const before = seatedFrom ? 'sit_idle' : idleName, after = seatedTo ? 'sit_idle' : idleName;
    const tr = seatedTo ? 'sit_down' : 'stand_up', D = asset.clips[tr].duration;
    const u = ctx.timedPostures ? P.k * D : t - P.t0;
    layers.push({ clip: before, t: loopT(before, t + (before === idleName ? seed * 1.7 : seed)), w: 1 });
    layers.push({ clip: tr, t: Math.min(D, u), w: smooth(clamp01(u / 0.3)) });
    const wa = smooth(clamp01((u - (D - 0.55)) / 0.55));
    if (wa > 0) layers.push({ clip: after, t: loopT(after, t + (after === idleName ? seed * 1.7 : seed)), w: wa });
    sitW = ctx.timedPostures ? (seatedTo ? smooth(P.k) : 1 - smooth(P.k)) : seatedTo ? 1 : 1 - clamp01(u / D);
  }
  void sitClips;
  // ---- walking (phase from the distance walked: the planted foot does not slide)
  let walking = null;
  for (const w of a.walking) {
    if (t < w.t0 - 0.05 || t > w.t1 + 0.35) continue;
    const seg = a.pos.find((s) => s.t0 === w.t0);
    if (!seg) continue;
    const pts = seg.path || [seg.from, seg.to];
    const L = pathLen(pts);
    const k = walkEase((t - w.t0) / Math.max(1e-6, w.t1 - w.t0), w.t1 - w.t0); // the same steady pace as positionAt
    const speed = L / Math.max(0.1, w.t1 - w.t0);
    const fast = w.style === 'hurry' || w.style === 'run' || speed > 2.6;
    const name = fast ? 'hurry' : w.style === 'calm' && asset.clips.stroll ? 'stroll' : 'walk';
    const C = asset.clips[name];
    const stride = C.meta?.events?.stride || 1.24;
    const dist = k * L;
    const phase = (((w.back ? -dist : dist) / stride) % 1 + 1) % 1;   // stepping backwards: the cycle runs in reverse
    // weight: in over the first 0.25 s, out after arriving (the last step settles)
    const wt = smooth(clamp01((t - w.t0) / 0.25)) * smooth(clamp01((w.t1 + 0.3 - t) / 0.35));
    if (wt > 0) { layers.push({ clip: name, t: phase * C.duration, w: wt }); walking = { w: wt, name }; }
  }
  // ---- turning in place: little steps
  const walkW = walking?.w || 0;
  if (walkW < 1 && sitW < 0.5) {
    for (const s of a.head) {
      if (t < s.t0 || t > s.t1 || s.t1 - s.t0 < 1e-3) continue;
      const d = Math.abs(lerpAngle(s.from, s.to, 1) - s.from) * (s.ease ? 2 : 1);
      if (d < 0.35) continue;
      const C = asset.clips.turn; const u0 = (t - s.t0) / (s.t1 - s.t0);
      // a big turn is two segments (ease in / ease out halves): one step cycle over both
      const u = s.ease === 'in' ? u0 / 2 : s.ease === 'out' ? 0.5 + u0 / 2 : u0;
      layers.push({ clip: 'turn', t: u * C.duration, w: Math.sin(Math.PI * u) * 0.9 * (1 - walkW) * (1 - 2 * sitW), mask: MASKS.lower });
    }
  }
  // ---- carried props (arm layer under the gestures)
  for (const side of ['R', 'L']) {
    const carry = ctx.holding?.[side];
    if (!carry) continue;
    const kind = carry.kind ?? carry, weight = carry.weight ?? 1;
    const base = kind === 'two' ? 'carry2' : kind === 'side' ? 'carry_side' : 'carry';
    const n = side === 'L' && base !== 'carry2' ? base + '_L' : base;
    if (asset.clips[n]) layers.push({ clip: n, t: loopT(n, t), w: weight, mask: base === 'carry2' ? MASKS.arms : MASKS['arm' + side] });
    // the free arm hangs relaxed (one hand folded alone in front of the belly looks odd)
    const other = side === 'R' ? 'L' : 'R';
    const otherCarry = ctx.holding?.[other];
    const relax = weight * (1 - (otherCarry?.weight ?? Number(!!otherCarry))) * (1 - walkW);
    if (base !== 'carry2' && relax > 0 && asset.clips.stand) {
      layers.push({ clip: 'stand', t: loopT('stand', t), w: relax, mask: MASKS['arm' + other] });
    }
  }
  // the free arm of a hand that just let go eases back from its relaxed hang (no jump when the prop leaves the hand)
  for (const [side, rw] of Object.entries(ctx.released || {})) {
    const other = side === 'R' ? 'L' : 'R';
    if (rw > 0 && !ctx.holding?.[other] && asset.clips.stand && walkW < 1) layers.push({ clip: 'stand', t: loopT('stand', t), w: rw * (1 - walkW), mask: MASKS['arm' + other] });
  }
  // ---- gestures (incl. give / take / put / pick from prop moves)
  const gestures = [...a.gestures.map((g) => ({ ...g })), ...(ctx.extraGestures || [])];
  let headBusy = 0, devout = 0;
  for (const g of gestures) {
    const name0 = g.clip || GESTURE_CLIPS[g.name] || g.name;
    if (g.skip) continue;
    const name = variant(asset, name0, look, g.hand, sitW > 0.5 && postureAt(a, g.t0).to === P.to);
    if (!name) continue;
    const C = asset.clips[name];
    const D = g.t1 - g.t0;
    const tail = 0.25;
    if (t < g.t0 || t > g.t1 + tail) continue;
    const u = Math.min(t - g.t0, D);
    const lt = warp(C, u, D);
    // the gesture grows out of the pose the figure is in (folded hands, hands on the knees) straight to its own pose,
    // over the whole rise of the clip, and melts back the same way: no quick detour through "arms down"
    const hold = C.meta?.hold;
    const rise = hold ? Math.max(0.3, Math.min(hold[0], D * 0.45)) : 0.3, fall = hold ? Math.max(0.35, Math.min(C.duration - hold[1], D * 0.45)) : 0.4;
    const w = smooth(clamp01((t - g.t0) / rise)) * smooth(clamp01((g.t1 + tail - t) / (fall + tail)));
    // only what the gesture moves: a nod is the head, a pointing hand is one arm (the other stays where it was)
    const sideG = /_L$|^talk3$/.test(name) ? 'L' : 'R';
    const mask = HEAD_ONLY.has(name0) ? MASKS.headChest : ONE_ARM.has(name0) ? MASKS['upper' + sideG] : MASKS.upper;
    // full-body gestures take the legs (and the other arm) too when standing still — eased in as a walk ends or the
    // figure stands up, never switched on in one frame
    const fk = FULL_BODY.has(name0) ? (1 - walkW) * clamp01(1 - sitW * 4) : 0;
    if (fk < 1) layers.push({ clip: name, t: lt, w: w * (1 - fk), mask });
    if (fk > 0) layers.push({ clip: name, t: lt, w: w * fk, mask: null });
    if (/nod|shake|look|listen/.test(name)) headBusy = Math.max(headBusy, w);
    if (/^(pray|cross|bow)/.test(name0)) devout = Math.max(devout, w);
  }
  // ---- speaking: small natural talk gestures during longer lines. Decided for the WHOLE line, never frame by frame:
  // a talk gesture that would meet another gesture, a walk, a posture change, a carried prop or a seat is not played at
  // all (cutting it off when the other gesture starts made the hand jump). Seated figures keep their hands on the knees.
  let talking = null;
  for (const sp of a.talk) if (t >= sp.start && t < sp.end) talking = sp;
  if (ctx.autoTalk !== false && !ctx.holding?.R && !ctx.holding?.L) {
    for (const sp of a.talk) {
      const L = sp.end - sp.start;
      if (sp.quietHands || L < 2.2 || t < sp.start || t > sp.end + 1) continue;
      const h = hashStr(sp.key || sp.text || '');
      const opts = look?.beard === 'long' ? ['talk1', 'talk3'] : ['talk1', 'talk3', 'talk2', 'talk4'];
      const n = opts[h % opts.length], C = asset.clips[n];
      if (!C) continue;
      const s0 = sp.start + 0.25 + (h % 7) * 0.05, s1 = s0 + C.duration;
      if (s1 > sp.end + 0.5) continue;
      if (!talkFree(a, gestures, s0, s1)) continue;
      const u = t - s0;
      // while the speaker's look is held on someone (`lookAt`), the talk gesture leaves the head alone: its own little
      // head turn added to the held look read as a quick shake of the head ("no") in the middle of a "yes"
      const held = lastBefore(a.look, t, 'target', undefined) != null;
      if (u >= 0 && u <= C.duration) layers.push({ clip: n, t: u, w: 0.7 * smooth(clamp01(u / 0.6)) * smooth(clamp01((C.duration - u) / 0.65)), mask: MASKS[(held ? 'talk' : 'upper') + (/^talk3$/.test(n) ? 'L' : 'R')] });
    }
  }
  // listening (somebody else talks): head tilts a little
  // (smooth weights: it eases in when the other one starts talking and out when this one starts, a nod takes over)
  const lw = 0.55 * (ctx.listenW ?? (ctx.someoneTalks ? 1 : 0)) * (1 - talkW(a, t)) * (1 - headBusy) * (1 - (walking?.w || 0));
  if (lw > 1e-3) layers.push({ clip: 'listen', t: loopT('listen', t + seed), w: lw, mask: MASKS.head });
  // ---- face
  let emotion = lastBefore(a.emotion, t, 'to', a.initial.emotion);
  // the sculpted brows glide to the new expression's height / tilt (0.4 s) instead of jumping when the emotion changes
  const browOf = (e) => (EXPR[e] || EXPR.neutral).brow;
  let brow = browOf(a.initial.emotion);
  for (const e of a.emotion) {
    if (e.t > t) break;
    const k = smooth((t - e.t) / 0.4), b1 = browOf(e.to);
    brow = [brow[0] + (b1[0] - brow[0]) * k, brow[1] + (b1[1] - brow[1]) * k];
  }
  // praying, crossing himself, bowing: the eyes close gently
  if (devout > 0.5 && (!emotion || /^(neutral|warm|happy|gentle|humble)$/.test(emotion))) emotion = 'pray';
  let mouth = 0;
  if (talking) {
    if (talking.env) mouth = talking.env[Math.min(talking.env.length - 1, Math.floor((t - talking.start) * talking.envFps))] || 0;
    else mouth = 0.5 + 0.45 * Math.sin(t * 17) * Math.sin(t * 6.1 + seed);
  }
  const per = 3.3 + (seed % 13) * 0.11, ph = (t + seed * 0.7) % per;
  const blink = ph < 0.16 ? Math.sin((ph / 0.16) * Math.PI) : 0;
  const lookTarget = lastBefore(a.look, t, 'target', undefined);
  // when the explicit look target changed (pure function of t: the last two look events) — the head eases between them
  let lookSince = 99, lookPrev;
  for (let i = a.look.length - 1; i >= 0; i--) if (a.look[i].t <= t) { lookSince = t - a.look[i].t; lookPrev = i > 0 ? a.look[i - 1].target : undefined; break; }
  // how much the body is busy with something the automatic head turns must not disturb (praying, crossing oneself,
  // bowing, sitting down / standing up)
  const busy = Math.max(devout, P.k < 1 && P.from !== P.to ? Math.min(1, Math.min(P.k, 1 - P.k) * 6) : 0);
  return { layers, posture: P, walking, sitW,
    face: { expr: emotion, blink, mouth, talk: !!talking, brow, time: t, ...(look?.portrait && { speech: talking }) },
    lookTarget, lookSince, lookPrev, talking, busy };
}
