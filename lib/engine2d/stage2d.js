// Stage2D: the "2d" engine ("engine": "2d" in video.json). Same compiled timeline as the 3D Stage (voices, beats,
// walks, gestures, gives), drawn as a hand-painted 2D cartoon on a canvas: painted backdrop with parallax layers,
// storybook characters (figure.js), a gentle camera that pans and zooms. Pure function of t: any frame, any order.
import { sampleSegs, mixVec, lerpAngle, lastBefore, sceneAt, beatAt, smooth, clamp01, lerp, FADE, resolveAnchor } from '../engine/timeline.js';
import { Overlay } from '../engine/overlay.js';
import { posePerson, drawPerson, resolveLook2d } from './figure.js';
import { drawBackdrop, drawGround, setSprites, PROPS2D, HOLD2D, drawMat, skyOf, PALETTES2D } from './scenery.js';
import { vignette } from './hermitage.js';

const DEG = Math.PI / 180;

export class Stage2D {
  constructor(canvas, timeline, desc, { scale = 1 } = {}) {
    this.tl = timeline; this.desc = desc;
    this.W = Math.round(timeline.width * scale); this.H = Math.round(timeline.height * scale);
    this.out = canvas; canvas.width = this.W; canvas.height = this.H;
    this.ctx = canvas.getContext('2d');
    this.f = this.H / (2 * Math.tan(20 * DEG));
    this.overlay = new Overlay(this.W, this.H, desc, timeline);
    this.looks = {};
    for (const [id, ch] of Object.entries(desc.characters || {})) if (ch.look) this.looks[id] = { ...resolveLook2d(ch.look, desc.style), __resolved: true };
    this.sprites = new Map();
    this.prepareCameras();
  }

  prepareCameras() {
    for (const sc of this.tl.scenes) {
      let cur = { spec: sc.initialCamera, start: sc.start, prev: null };
      const list = [cur];
      for (const b of sc.beats) {
        if (b.camera) { cur = { spec: b.camera, start: b.start, prev: cur }; list.push(cur); }
        b.cam = cur;
      }
      for (let i = 0; i < list.length; i++) list[i].end = i + 1 < list.length ? list[i + 1].start : sc.end;
    }
  }

  look(sc, id) {
    const a = sc.actors[id];
    if (a?.outfit) return { ...resolveLook2d({ ...(this.desc.characters[id]?.look || {}), ...a.outfit }, this.desc.style), __resolved: true };
    return this.looks[id] || { ...resolveLook2d({}, this.desc.style), __resolved: true };
  }

  // ----- actors -----
  actorState(sc, id, t, rest = false) {
    const a = sc.actors[id];
    const pos = sampleSegs(a.pos, t, a.initial.pos, mixVec);
    const h = sampleSegs(a.head, t, a.initial.h, lerpAngle);
    let walk = null;
    for (const w of a.walking) {
      if (t >= w.t0 && t < w.t1 + 0.15) {
        const seg = a.pos.find((s) => s.t0 === w.t0);
        const len = seg ? Math.hypot(seg.to[0] - seg.from[0], seg.to[1] - seg.from[1]) : 0;
        const k = clamp01((t - w.t0) / (w.t1 - w.t0));
        walk = { phase: smooth(k) * len * 2.3, amount: smooth((t - w.t0) / 0.2) * smooth((w.t1 + 0.15 - t) / 0.3), style: w.style };
      }
    }
    const gestures = a.gestures.filter((g) => t >= g.t0 && t < g.t1).map((g) => ({ name: g.name, hand: g.hand, k: (t - g.t0) / (g.t1 - g.t0) }));
    const emotion = lastBefore(a.emotion, t, 'to', a.initial.emotion);
    let mouth = 0, talk = 0;
    for (const sp of a.talk) {
      if (t >= sp.start && t < sp.end) {
        talk = 1;
        mouth = sp.env ? sp.env[Math.min(sp.env.length - 1, Math.floor((t - sp.start) * sp.envFps))] || 0 : 0.55 + 0.45 * Math.sin(t * 19) * Math.sin(t * 7.3);
      }
    }
    let posture = { from: a.initial.posture, to: a.initial.posture, k: 1 };
    for (const p of a.posture) if (t >= p.t0) posture = { from: p.from, to: p.to, k: clamp01((t - p.t0) / (p.t1 - p.t0)) };
    const visible = lastBefore(a.visible, t, 'v', a.initial.visible);
    const seed = [...id].reduce((s, c) => s + c.charCodeAt(0), 0) * 0.37;
    const per = 3.1 + (seed % 1.3), ph = (t + seed) % per;
    const blink = ph < 0.16 ? Math.sin((ph / 0.16) * Math.PI) : 0;
    return { pos, h, walk, gestures, emotion, mouth, talk, posture, visible, blink, time: t, rest, seat: a.initial.seat };
  }

  propHolder(p, t) {
    let holder = p.initial, move = null;
    for (const m of p.moves) { if (t >= m.t1) holder = m.to; else if (t >= m.t0) { move = m; break; } }
    return { holder, move };
  }

  /** everything posed at t: actors (state + pose), which hands hold something */
  evaluate(t, { rest = false } = {}) {
    const sc = sceneAt(this.tl, t);
    const holding = {};
    for (const p of Object.values(sc.props)) {
      const { holder, move } = this.propHolder(p, t);
      const vis = lastBefore(p.visible, t, 'v', p.opts.visible !== false);
      if (!vis) continue;
      if (holder.actor && !move) (holding[holder.actor] ||= {})[holder.hand || 'R'] = p.opts.low ? 'low' : true;
      if (move?.to.actor && t > lerp(move.t0, move.t1, 0.8)) (holding[move.to.actor] ||= {})[move.to.hand || 'R'] = true;
    }
    const actors = {};
    for (const id of Object.keys(sc.actors)) {
      const st = this.actorState(sc, id, t, rest);
      st.holding = holding[id] || {};
      const look = this.look(sc, id);
      const pose = posePerson(look, st);
      actors[id] = { id, st, look, pose, S: look.scale || 1 };
    }
    return { sc, actors };
  }

  // ----- camera -----
  placeOf(sc, E, on, t) {
    if (typeof on === 'string' && E.actors[on]) { const A = E.actors[on]; return { x: A.st.pos[0], z: A.st.pos[1], actor: A }; }
    if (typeof on === 'string' && sc.props[on]) { const p = this.propWorld(sc, E, on, t); if (p) return { x: p[0], z: p[2], y: p[1] }; }
    try { const a = resolveAnchor(sc.layout, on ?? 'center'); return { x: a.pos[0], z: a.pos[1] }; } catch { return { x: 0, z: 0 }; }
  }
  headWorld(A) { const [hx, hy] = A.pose.head; return [A.st.pos[0] + hx * A.S, hy * A.S, A.st.pos[1]]; }

  shot(cam, sc, E, t) {
    const s = cam.spec || { shot: 'wide' };
    const kind = s.shot || 'wide';
    const k = clamp01((t - cam.start) / Math.max(0.5, (cam.end ?? cam.start + 4) - cam.start));
    let x, z, yLook, camY, D;
    if (kind === 'two' && Array.isArray(s.on)) {
      const ps = s.on.map((o) => this.placeOf(sc, E, o, t));
      x = (ps[0].x + ps[1].x) / 2; z = Math.max(ps[0].z, ps[1].z);
      const span = Math.abs(ps[0].x - ps[1].x);
      D = s.dist ?? Math.max(10, (span + 7) * this.f / this.W); yLook = s.y ?? 2.3; camY = yLook + (s.height ?? 1.2);
    } else {
      const pl = this.placeOf(sc, E, Array.isArray(s.on) && kind !== 'wide' ? s.on[0] : s.on, t);
      x = pl.x; z = pl.z;
      if (kind === 'close' && pl.actor) { const h = this.headWorld(pl.actor); x = h[0]; yLook = h[1] - 0.25 + (s.y ?? 0); D = s.dist ?? 6.2; camY = yLook + (s.height ?? 0.3); }
      else if (kind === 'medium' && pl.actor) { D = s.dist ?? 12; yLook = (s.y ?? 2.2) + Math.min(0, pl.actor.pose.lower); camY = yLook + (s.height ?? 1.0); }
      else if (kind === 'prop') { yLook = s.y ?? (pl.y != null ? pl.y + 0.15 : 1.2); D = s.dist ?? 4; camY = yLook + (s.height ?? 0.5); }
      else { D = s.dist ?? 30; yLook = s.y ?? 3; camY = s.height ?? 7; }
    }
    if (s.angle === 'auto' && (kind === 'close' || kind === 'medium')) x += this.autoOffset(sc, cam, s, E, D);
    else if (typeof s.angle === 'number') x += Math.sin(s.angle * DEG) * D * 0.35;
    x += s.dx ?? 0;
    const e = smooth(k);
    if (s.move === 'push') D *= lerp(1.15, 0.84, e);
    if (s.move === 'pull') D *= lerp(0.84, 1.18, e);
    if (s.move === 'orbit' || s.move === 'pan') x += ((s.orbit ?? 35) / 35) * D * 0.25 * (e - 0.5);
    if (s.move === 'rise') camY += lerp(-1, 3, e);
    if (s.move === 'drift') x += 0.5 * Math.sin(t * 0.5);
    return { x, camY, yLook, D, camZ: z + D };
  }

  /** lateral offset so that nobody in front of the subject hides its face (checked at the start and end of the shot) */
  autoOffset(sc, cam, s, E0, D) {
    const id = s.on;
    const steps = [0, 0.7, -0.7, 1.4, -1.4, 2.2, -2.2, 3, -3];
    const times = [cam.start + 0.05, (cam.end ?? cam.start + 2) - 0.05];
    const Es = times.map((tt) => this.evaluate(tt, { rest: true }));
    for (const dx of steps) {
      let ok = true;
      for (const E of Es) {
        const A = E.actors[id]; if (!A) continue;
        const h = this.headWorld(A);
        const camX = h[0] + dx, camZ = A.st.pos[1] + D;
        const hx = (h[0] - camX) / D, hr = 0.9 / D;
        for (const B of Object.values(E.actors)) {
          if (B === A || !B.st.visible || B.st.pos[1] < A.st.pos[1] + 0.3) continue;
          const d = camZ - B.st.pos[1]; if (d < 0.3) { ok = false; break; }
          const bx = (B.st.pos[0] - camX) / d, bw = 1.1 * B.S / d;
          if (Math.abs(bx - hx) < bw + hr) { ok = false; break; }
        }
        if (!ok) break;
      }
      if (ok) return dx;
    }
    return 0;
  }

  cameraAt(sc, t) {
    const b = beatAt(sc, t);
    const cam = b && t >= b.start ? b.cam : { spec: sc.initialCamera, start: sc.start, end: sc.beats[0]?.start ?? sc.end };
    const E = this.evaluate(t, { rest: true });
    let c = this.shot(cam, sc, E, t);
    const ease = cam.spec?.ease;
    if (ease && cam.prev) {
      const k = smooth((t - cam.start) / (typeof ease === 'number' ? ease : 1.2));
      if (k < 1) { const p = this.shot(cam.prev, sc, E, t); c = Object.fromEntries(Object.keys(c).map((key) => [key, lerp(p[key], c[key], k)])); }
    }
    return { ...c, spec: cam.spec || { shot: 'wide' } };
  }

  /** where an actor is on the picture at t (canvas pixels): head centre + radius, feet — for review crops (tools) */
  locate(t, id) {
    const sc = sceneAt(this.tl, t), cam = this.cameraAt(sc, t), V = this.view(cam), A = this.evaluate(t).actors[id];
    if (!A || !A.st.visible) return null;
    const B = V.P(A.st.pos[0], 0, A.st.pos[1]); if (!B) return null;
    const s = B[2] * A.S, [hx, hy, r] = A.pose.head;
    return { x: B[0] + hx * s, y: B[1] - hy * s, r: r * s, feet: B[1] };
  }
  /** who the camera films at t (the `on` of the shot): actor ids */
  subjects(t) { const sc = sceneAt(this.tl, t), on = this.cameraAt(sc, t).spec?.on; return (Array.isArray(on) ? on : [on]).filter((x) => typeof x === 'string' && sc.actors[x]); }

  view(cam) {
    const { W, H, f } = this;
    const V = {
      W, H, f, cam,
      P: (x, y, z) => { const d = cam.camZ - z; if (d < 0.25) return null; return [W / 2 + (x - cam.x) * f / d, H / 2 + f * ((cam.camY - y) / d - (cam.camY - cam.yLook) / cam.D), f / d]; },
      layerY: (y, Dl) => H / 2 + f * ((cam.camY - y) / Dl - (cam.camY - cam.yLook) / cam.D),
      horizon: () => H / 2 - f * (cam.camY - cam.yLook) / cam.D,
    };
    return V;
  }

  spritesOf(sc) {
    if (!this.sprites.has(sc.index)) {
      const set = typeof sc.def.set === 'string' ? { type: sc.def.set } : sc.def.set || {};
      this.sprites.set(sc.index, setSprites(sc.layout, set));
    }
    return this.sprites.get(sc.index);
  }

  // where a prop is in the world at t (for cameras) — [x, y, z]
  propWorld(sc, E, id, t) {
    const p = sc.props[id];
    const { holder } = this.propHolder(p, t);
    if (holder.actor && E.actors[holder.actor]) { const A = E.actors[holder.actor]; const hd = A.pose.hands[holder.hand || 'R']; return [A.st.pos[0] + hd[0] * A.S, hd[1] * A.S, A.st.pos[1] + 0.3]; }
    return holder.pos ? [holder.pos[0], holder.pos[1] || 0, holder.pos[2]] : null;
  }

  // Sort key of a thing standing at (x, z) among solid buildings: a building sorts by its front face, so a figure beside it
  // (not hidden by it — the camera ray misses its footprint) must still be drawn after it, even when it stands further back.
  depthKey(solids, cam) {
    const hits = ([x0, z0, x1, z1], ax, az) => {   // does the top-down segment camera → (ax, az) cross the box?
      const cx = cam.x, cz = cam.camZ; let t0 = 0, t1 = 1; const dx = ax - cx, dz = az - cz;
      for (const [p, q] of [[-dx, cx - x0], [dx, x1 - cx], [-dz, cz - z0], [dz, z1 - cz]]) {
        if (p === 0) { if (q < 0) return false; continue; }
        const r = q / p; if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
        if (t0 > t1) return false;
      }
      return t1 > t0 && t0 < 0.999;
    };
    return (x, z) => {
      let lo = -Infinity, hi = Infinity;
      for (const s of solids) {
        if (hits(s.solid, x, z)) hi = Math.min(hi, s.z); else if (s.z > z) lo = Math.max(lo, s.z);
      }
      return lo > -Infinity && lo < hi ? Math.max(z, lo + 0.005) : z;
    };
  }

  // ----- render -----
  renderAt(t) {
    t = Math.max(0, Math.min(this.tl.duration - 1e-3, t));
    const sc = sceneAt(this.tl, t);
    const cam = this.cameraAt(sc, t);
    const E = this.evaluate(t);
    const V = this.view(cam);
    const g = this.ctx;
    const set = typeof sc.def.set === 'string' ? { type: sc.def.set } : sc.def.set || {};
    const skyName = sc.def.sky || set.sky || 'day';
    const opts = { sky: skyName, palette: set.palette || (set.type === 'hermitage2d' ? 'sandstone' : 'terra'), layout: sc.layout, t };
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.lineJoin = 'round'; g.lineCap = 'round';
    drawBackdrop(g, V, opts);
    drawGround(g, V, opts);

    // depth-sorted sprites: set, ground props, actors (with what they hold), flying props
    const sprites = this.spritesOf(sc);
    const list = sprites.map((s) => ({ z: s.z, draw: () => s.draw(g, V, t) }));
    const zKey = this.depthKey(sprites.filter((s) => s.solid), cam);
    const screenHand = {};
    for (const A of Object.values(E.actors)) {
      if (!A.st.visible) continue;
      const B = V.P(A.st.pos[0], 0, A.st.pos[1]);
      if (!B) continue;
      const s = B[2] * A.S;
      for (const hd of ['R', 'L']) { const h = A.pose.hands[hd]; screenHand[A.id + hd] = [B[0] + h[0] * s, B[1] - h[1] * s, s]; }
      // a hug: the one further back puts ONE hand on the back of the one in front — that hand is drawn again over him
      const mate = A.pose.p?.hugOn && Object.values(E.actors).find((o) => o !== A && o.st.visible && o.pose.p?.hugOn && Math.abs(o.st.pos[0] - A.st.pos[0]) < 3 && o.st.pos[1] > A.st.pos[1]);
      list.push({ z: zKey(A.st.pos[0], A.st.pos[1]) + 0.01, draw: () => this.drawActor(g, sc, E, A, B, t, { hugBack: !!mate }) });
      if (mate) list.push({ z: zKey(mate.st.pos[0], mate.st.pos[1]) + 0.015, draw: () => this.drawActor(g, sc, E, A, B, t, { hugBack: true, only: 'hugHand' }) });
    }
    for (const [id, p] of Object.entries(sc.props)) {
      const vis = lastBefore(p.visible, t, 'v', p.opts.visible !== false);
      if (!vis) continue;
      const { holder, move } = this.propHolder(p, t);
      if (move) {
        const a = this.endpoint(move.from, screenHand, V, p), b = this.endpoint(move.to, screenHand, V, p);
        if (!a || !b) continue;
        const k = smooth((t - move.t0) / (move.t1 - move.t0));
        const s = lerp(a[2], b[2], k);
        const X = lerp(a[0], b[0], k), Y = lerp(a[1], b[1], k) - Math.sin(k * Math.PI) * 0.7 * s;
        const za = move.from.actor ? sc.actors[move.from.actor] && E.actors[move.from.actor].st.pos[1] : move.from.pos?.[2] ?? 0;
        const zb = move.to.actor ? E.actors[move.to.actor]?.st.pos[1] : move.to.pos?.[2] ?? 0;
        list.push({ z: Math.max(za ?? 0, zb ?? 0) + 0.5, draw: () => this.drawPropAt(g, p, X, Y, s, t, true) });
      } else if (!holder.actor) {
        const [x, y, z] = holder.pos;
        if (p.type === 'mat') { list.push({ z: z - 3, draw: () => drawMat(g, V, x, z, p.opts) }); continue; }
        const B = V.P(x, y, z); if (!B) continue;
        list.push({ z: zKey(x, z), draw: () => this.drawPropAt(g, p, B[0], B[1], B[2] * (p.opts.scale ?? 1), t, false) });
      }
    }
    list.sort((a, b) => a.z - b.z);
    for (const it of list) { g.save(); it.draw(); g.restore(); }

    // light of the hour
    const sky = skyOf(opts);
    if (sky.tint) { g.save(); g.globalCompositeOperation = skyName === 'night' ? 'multiply' : 'soft-light'; g.fillStyle = sky.tint; g.fillRect(0, 0, this.W, this.H); g.restore(); }
    if (PALETTES2D[opts.palette]?.grade) { g.save(); vignette(g, this.W, this.H); g.restore(); }

    // fades + overlay (title cards, "Sfârșit")
    let fade = 0;
    const tr = sc.transition, next = this.tl.scenes[sc.index + 1];
    if (sc.index > 0 && tr !== 'cut') fade = Math.max(fade, 1 - clamp01((t - sc.start) / FADE));
    if (next && next.transition !== 'cut') fade = Math.max(fade, 1 - clamp01((sc.end - t) / FADE));
    if (sc.index === 0) fade = Math.max(fade, 1 - clamp01(t / 0.5));
    if (!next) fade = Math.max(fade, 1 - clamp01((sc.end - t) / 0.8));
    this.overlay.draw(g, t, sc, beatAt(sc, t), fade, tr === 'white' || next?.transition === 'white');
    return this.out;
  }

  endpoint(h, screenHand, V, p) {
    if (h.actor) { const s = screenHand[h.actor + (h.hand || 'R')]; if (!s) return null; const o = HOLD2D[p.type] || [0, 0]; const sc = p.opts.scale ?? 1; return [s[0] + o[0] * s[2] * sc, s[1] - o[1] * s[2] * sc, s[2] * sc]; }
    const B = V.P(h.pos[0], h.pos[1] || 0, h.pos[2]); return B ? [B[0], B[1], B[2] * (p.opts.scale ?? 1)] : null;
  }

  drawPropAt(g, p, X, Y, s, t) {
    const fn = PROPS2D[p.type];
    if (typeof fn !== 'function') return;
    g.save(); g.translate(X, Y); g.scale(s, -s); fn(g, p.opts, 0.05, t); g.restore();
  }

  drawActor(g, sc, E, A, B, t, extra = {}) {
    const s = B[2] * A.S;
    // soft shadow on the ground
    g.fillStyle = 'rgba(90,60,40,0.22)';
    if (!extra.only) { g.beginPath(); g.ellipse(B[0], B[1], (A.pose.lap > 0.5 ? 1.5 : 1.0) * s, 0.26 * s, 0, 0, Math.PI * 2); g.fill(); }
    const held = {};
    for (const p of Object.values(sc.props)) {
      const { holder, move } = this.propHolder(p, t);
      if (move || !holder.actor || holder.actor !== A.id) continue;
      if (!lastBefore(p.visible, t, 'v', p.opts.visible !== false)) continue;
      (held[holder.hand || 'R'] ||= []).push(p);
    }
    g.translate(B[0], B[1]); g.scale(s, -s);
    drawPerson(g, A.look, A.pose, {
      lw: 0.055, ...extra,
      holds: { L: !!held.L?.length, R: !!held.R?.length },
      hold: (side, x, y) => {
        for (const p of held[side] || []) {
          const o = HOLD2D[p.type] || [0, 0], sc2 = p.opts.scale ?? 1;
          const fn = PROPS2D[p.type]; if (typeof fn !== 'function') continue;
          g.save(); g.translate(x + o[0] * sc2, y + o[1] * sc2); g.scale(sc2, sc2); fn(g, p.opts, 0.05, t); g.restore();
        }
      },
    });
  }
}
