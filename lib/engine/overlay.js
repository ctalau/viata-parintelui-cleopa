// 2D overlay drawn on top of the 3D frame: title cards, captions, fades, vignette.
import { clamp01, smooth } from './timeline.js';
import { assetUrl } from '../engine3/assets.js';

const FONT = '"Fredoka", "DejaVu Sans", sans-serif';

function roundRect(g, x, y, w, h, r, begin = true) {
  if (begin) g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function wrap(g, text, maxW) {
  const words = text.split(/\s+/); const lines = []; let cur = '';
  for (const w of words) {
    const tryL = cur ? cur + ' ' + w : w;
    if (g.measureText(tryL).width > maxW && cur) { lines.push(cur); cur = w; } else cur = tryL;
  }
  if (cur) lines.push(cur);
  if (lines.length === 2) { // balance two lines: never a lonely last word
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const A = words.slice(0, i).join(' '), Bx = words.slice(i).join(' ');
      const wa = g.measureText(A).width, wb = g.measureText(Bx).width;
      if (wa <= maxW && wb <= maxW && (!best || Math.abs(wa - wb) < best.d)) best = { d: Math.abs(wa - wb), l: [A, Bx] };
    }
    if (best) return best.l;
  }
  return lines;
}

// Școala Evlaviei logos (images): small = top-left corner of every frame (the default, `"logo": "scoala"`), the badge with
// the name = bottom-left of every poster (`posterLogo`, set by tools/record.mjs --poster)
const IMG = {};
/** the corner logo of a film: "scoala" by default, false = none, another name = one of the drawn toy-brick LOGOS */
export const logoKind = (desc) => (desc.logo === undefined || desc.logo === true ? 'scoala' : desc.logo);
export async function preloadLogos(desc) {
  const want = [];
  if (logoKind(desc) === 'scoala') want.push(['mic', 'assets/branding/logo-scoala-mic.webp']);
  if (desc.posterLogo) want.push(['badge', 'assets/branding/badge-scoala.png']);
  await Promise.all(want.map(([k, src]) => IMG[k] ? 0 : new Promise((res) => {
    const im = new Image(); im.onload = () => { IMG[k] = im; res(); }; im.onerror = () => res(); im.src = assetUrl(src);
  })));
}

export class Overlay {
  constructor(W, H, desc, tl) {
    this.W = W; this.H = H; this.desc = desc; this.tl = tl; this.u = Math.min(W, H) / 1080; // works for landscape and portrait
    // off by default: 4-year-olds don't read; enable with "captions": true (e.g. for parents / silent autoplay)
    this.captions = desc.captions === true;
    // the Școala Evlaviei logo in the top-left corner; "logo": false turns it off (not on posters: they carry the badge)
    this.logoOn = desc.logo !== false && !desc.posterLogo;
  }

  draw(g, t, sc, beat, fade, white) {
    const { W, H, u } = this;
    // soft vignette
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(40,20,0,0.28)');
    if (sc.def.vignette !== false) { g.fillStyle = vg; g.fillRect(0, 0, W, H); }

    if (this.logoOn) this.logo(g);
    if (this.desc.posterLogo && IMG.badge) this.posterBadge(g);

    if (beat?.card && t >= beat.start) this.card(g, beat.card, clamp01((t - beat.start) / 0.5) * clamp01((beat.end - t) / 0.5));

    if (this.captions) {
      const sp = this.tl.speeches.find((s) => t >= s.start && t < s.end + 0.15);
      if (sp) this.caption(g, sp, clamp01((t - sp.start) / 0.15) * clamp01((sp.end + 0.15 - t) / 0.15));
    }
    if (fade > 0) { g.fillStyle = white ? `rgba(255,250,240,${fade})` : `rgba(10,6,4,${fade})`; g.fillRect(0, 0, W, H); }
  }

  /**
   * House logo, top-left — no text (4-year-olds don't read), no trademark. `"logo": false` = none; `"logo": "<variant>"`
   * picks one of LOGOS (default LOGO_DEFAULT). Every variant has a white rim + a soft dark shadow, so it reads on bright
   * sand and in the night; the Orthodox cross has three bars, the lower one slanted, raised on Christ's right (the viewer's left).
   */
  logo(g) {
    if (logoKind(this.desc) === 'scoala') { // small original logo, top-left (≤ 135 px at 1080p, 38 px margin)
      if (IMG.mic) { const sz = 135 * 1.25 * this.u; g.drawImage(IMG.mic, 38 * this.u - sz * 0.1, 38 * this.u - sz * 0.1, sz, sz); }
      return;
    }
    const fn = LOGOS[typeof this.desc.logo === 'string' ? this.desc.logo : LOGO_DEFAULT] || LOGOS[LOGO_DEFAULT];
    g.save();
    g.globalAlpha = 0.96;
    fn(g, 36 * this.u, 32 * this.u, 1.3 * this.u);
    g.restore();
  }

  /** Poster logo: the Școala Evlaviei badge (assets/branding/badge-scoala.png), bottom-left, 25% of the width. */
  posterBadge(g) {
    const { W, H } = this, im = IMG.badge, w = 0.25 * W, h = (w * im.height) / im.width, m = 0.016 * W;
    g.drawImage(im, m, H - m - h, w, h);
  }

  card(g, card, a) {
    const { W, H, u } = this;
    if (a <= 0) return;
    g.save();
    g.globalAlpha = smooth(a);
    const y = H * (card.y ?? 0.2);
    const scale = 0.92 + 0.08 * smooth(a);
    g.translate(W / 2, y); g.scale(scale, scale);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `700 ${Math.round(96 * u)}px ${FONT}`;
    const lines = wrap(g, card.title, Math.min(W * 0.84, 1500 * u));
    const lh = 104 * u;
    lines.forEach((l, i) => {
      const yy = (i - (lines.length - 1) / 2) * lh;
      g.lineJoin = 'round'; g.lineWidth = 18 * u; g.strokeStyle = card.stroke || '#6a2c8c'; g.strokeText(l, 0, yy);
      g.fillStyle = card.color || '#fff6d5'; g.fillText(l, 0, yy);
    });
    if (card.subtitle) {
      g.font = `600 ${Math.round(52 * u)}px ${FONT}`;
      const yy = ((lines.length - 1) / 2) * lh + 92 * u;
      g.lineWidth = 12 * u; g.strokeStyle = 'rgba(60,30,10,0.85)'; g.strokeText(card.subtitle, 0, yy);
      g.fillStyle = '#ffffff'; g.fillText(card.subtitle, 0, yy);
    }
    g.restore();
  }

  caption(g, sp, a) {
    const { W, H, u } = this;
    const ch = this.desc.characters?.[sp.speaker] || {};
    g.save();
    g.globalAlpha = a;
    g.font = `600 ${Math.round(50 * u)}px ${FONT}`;
    const bw = Math.min(W * 0.88, 1400 * u);
    const lines = wrap(g, sp.text, bw - 80 * u);
    const lh = 62 * u, pad = 30 * u;
    const boxH = lines.length * lh + pad * 2;
    const y0 = H * 0.86 - boxH;
    const bx = (W - bw) / 2;
    roundRect(g, bx, y0, bw, boxH, 36 * u);
    g.fillStyle = 'rgba(255,253,245,0.92)'; g.fill();
    g.lineWidth = 6 * u; g.strokeStyle = ch.color || '#8a5a2b'; g.stroke();
    g.fillStyle = '#3a2615'; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, W / 2, y0 + pad + lh * (i + 0.5)));
    if (ch.name && sp.speaker !== 'narrator') {
      g.font = `700 ${Math.round(38 * u)}px ${FONT}`;
      const tw = g.measureText(ch.name).width + 44 * u;
      roundRect(g, bx + 40 * u, y0 - 30 * u, tw, 58 * u, 29 * u);
      g.fillStyle = ch.color || '#8a5a2b'; g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(ch.name, bx + 62 * u, y0 - 1 * u);
    }
    g.restore();
  }
}

// ---------- the house logo variants (drawn in a box ≈ 110 × 110 · s from the top-left corner x0, y0) ----------
/** Orthodox cross path (three bars, slanted foot raised on the viewer's left), centred on cx, from top to bot. */
function crossPath(g, cx, top, bot, k) {
  const h = bot - top, v = 0.14 * h * k;
  g.rect(cx - v / 2, top, v, h);
  g.rect(cx - 0.2 * h, top + 0.12 * h, 0.4 * h, 0.1 * h);
  g.rect(cx - 0.4 * h, top + 0.3 * h, 0.8 * h, 0.13 * h);
  g.save(); g.translate(cx, top + 0.78 * h); g.rotate(0.38); g.rect(-0.26 * h, -0.05 * h, 0.52 * h, 0.1 * h); g.restore();
}
function cross(g, cx, top, bot, fill, edge, lw, k = 1) {
  g.beginPath(); crossPath(g, cx, top, bot, k);
  if (edge) { g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = edge; g.stroke(); }
  g.fillStyle = fill; g.fill();
}
const gold = (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#fff2a8'); gr.addColorStop(0.45, '#f5c431'); gr.addColorStop(1, '#b97a0c'); return gr; };
function rimShadow(g, s, draw) {           // white rim with a drop shadow around the silhouette drawn by draw()
  g.save(); g.shadowColor = 'rgba(0,0,0,0.55)'; g.shadowBlur = 12 * s; g.shadowOffsetY = 3 * s;
  g.lineJoin = 'round'; g.lineWidth = 8 * s; g.strokeStyle = '#ffffff';
  const rr = (...a) => roundRect(g, ...a, false);           // draw() adds every shape to ONE path
  g.beginPath(); draw(rr); g.stroke(); g.restore();
}
/** A flat 2-stud brick (front view) in colour `c` = [light, mid, dark], with something drawn on its face by `face`. */
function flatBrick(g, x0, y0, s, c, face) {
  const bw = 100 * s, bh = 80 * s, sh = 15 * s, sw = 30 * s, r = 12 * s, bx = x0, by = y0 + sh;
  const studX = [bx + bw * 0.27 - sw / 2, bx + bw * 0.73 - sw / 2];
  rimShadow(g, s, (rr) => { rr(bx, by, bw, bh, r); for (const sx of studX) rr(sx, y0, sw, sh + 6 * s, 5 * s); });
  for (const sx of studX) {
    const sg = g.createLinearGradient(sx, 0, sx + sw, 0); sg.addColorStop(0, c[1]); sg.addColorStop(0.45, c[0]); sg.addColorStop(1, c[2]);
    g.fillStyle = sg; g.beginPath(); roundRect(g, sx, y0, sw, sh + 6 * s, 5 * s); g.fill();
  }
  const bg = g.createLinearGradient(0, by, 0, by + bh); bg.addColorStop(0, c[0]); bg.addColorStop(0.7, c[1]); bg.addColorStop(1, c[2]);
  g.fillStyle = bg; g.beginPath(); roundRect(g, bx, by, bw, bh, r); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); roundRect(g, bx + 6 * s, by + 5 * s, bw - 12 * s, 6 * s, 3 * s); g.fill();
  face(bx + bw / 2, by, bh);
}

const LOGOS = {
  // 0. flat toy-yellow brick (no gradient), a plain deep-blue cross with the slanted foot rest, on a small semi-transparent dark tile
  flat(g, x0, y0, s) {
    const pad = 12 * s, bw = 92 * s, bh = 72 * s, sh = 13 * s, sw = 26 * s, r = 9 * s, by = y0 + pad + sh, bx = x0 + pad;
    g.fillStyle = 'rgba(20,24,40,0.42)'; roundRect(g, x0, y0, bw + 2 * pad, bh + sh + 2 * pad, 18 * s); g.fill();
    const studX = [bx + bw * 0.27 - sw / 2, bx + bw * 0.73 - sw / 2];
    g.fillStyle = '#f5c518'; g.strokeStyle = '#9a6f00'; g.lineWidth = 2.5 * s; g.lineJoin = 'round';
    g.beginPath(); for (const sx of studX) roundRect(g, sx, by - sh, sw, sh + 4 * s, 4 * s, false); g.fill(); g.stroke();
    g.beginPath(); roundRect(g, bx, by, bw, bh, r); g.fill(); g.stroke();
    const cx = bx + bw / 2, cy = by + bh / 2, v = 11 * s;
    g.fillStyle = '#1f4fa8';
    g.beginPath(); g.rect(cx - v / 2, by + 12 * s, v, bh - 24 * s); g.rect(cx - 21 * s, cy - 9 * s - v / 2, 42 * s, v); g.fill();
    // the slanted foot rest, raised on Christ's right (the viewer's left)
    g.save(); g.translate(cx, by + bh - 23 * s); g.rotate(0.4); g.beginPath(); g.rect(-13 * s, -3.5 * s, 26 * s, 7 * s); g.fill(); g.restore();
  },
  // 1. classic toy yellow brick, deep blue cross
  yellow(g, x0, y0, s) {
    flatBrick(g, x0, y0, s, ['#ffe066', '#f2c21b', '#b8860b'], (cx, by, bh) => cross(g, cx, by + 11 * s, by + bh - 9 * s, '#1f4fa8', '#0b2556', 4 * s));
  },
  // 2. royal blue brick, golden cross
  blue(g, x0, y0, s) {
    flatBrick(g, x0, y0, s, ['#3d86e8', '#1756b8', '#0b2f6e'], (cx, by, bh) => cross(g, cx, by + 11 * s, by + bh - 9 * s, gold(g, by, by + bh), '#5a3a00', 3.5 * s));
  },
  // 3. a cross built from little golden 1×1 bricks (each with its stud) on a night-blue tile
  bricks(g, x0, y0, s) {
    const W = 112 * s, H = 124 * s, r = 18 * s;
    rimShadow(g, s, (rr) => rr(x0, y0, W, H, r));
    const bg = g.createLinearGradient(0, y0, 0, y0 + H); bg.addColorStop(0, '#2b4c9a'); bg.addColorStop(1, '#13245a');
    g.fillStyle = bg; g.beginPath(); roundRect(g, x0, y0, W, H, r); g.fill();
    const c = 15.5 * s, ox = x0 + W / 2 - 2.5 * c, oy = y0 + 9 * s;  // 5 columns × 7 rows
    const cells = [[2, 0], [1, 1], [2, 1], [3, 1], [2, 2], [0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [2, 4], [2, 5], [2, 6], [1, 4.62], [3, 5.38]];
    for (const [col, row] of cells.sort((a, b) => a[1] - b[1])) {
      const x = ox + col * c, y = oy + row * c;
      g.fillStyle = gold(g, y, y + c); g.beginPath(); roundRect(g, x + 0.6 * s, y + 0.6 * s, c - 1.2 * s, c - 1.2 * s, 2.5 * s); g.fill();
      g.lineWidth = 1.2 * s; g.strokeStyle = '#7a4d00'; g.stroke();
      g.beginPath(); g.arc(x + c / 2, y + c / 2, c * 0.28, 0, Math.PI * 2); g.fillStyle = '#ffe680'; g.fill(); g.strokeStyle = '#a86e00'; g.stroke();
    }
  },
  // 4. a toy monk: minifig head (smile, beard, black kamilavka) on a dark-green torso with a golden cross
  monk(g, x0, y0, s) {
    const cx = x0 + 56 * s;
    const sil = (rr) => {
      rr(cx - 27 * s, y0, 54 * s, 22 * s, 4 * s);                            // hat
      rr(cx - 24 * s, y0 + 18 * s, 48 * s, 44 * s, 10 * s);                  // head
      g.rect(cx - 9 * s, y0 + 58 * s, 18 * s, 10 * s);                       // neck
      g.moveTo(cx - 34 * s, y0 + 66 * s); g.lineTo(cx + 34 * s, y0 + 66 * s); // torso (trapezoid)
      g.lineTo(cx + 46 * s, y0 + 116 * s); g.lineTo(cx - 46 * s, y0 + 116 * s); g.closePath();
    };
    rimShadow(g, s, sil);
    // torso
    const tg = g.createLinearGradient(0, y0 + 64 * s, 0, y0 + 116 * s); tg.addColorStop(0, '#2f8f5b'); tg.addColorStop(1, '#14522f');
    g.fillStyle = tg; g.beginPath(); g.moveTo(cx - 34 * s, y0 + 64 * s); g.lineTo(cx + 34 * s, y0 + 64 * s); g.lineTo(cx + 46 * s, y0 + 116 * s); g.lineTo(cx - 46 * s, y0 + 116 * s); g.closePath(); g.fill();
    g.fillStyle = '#e9b54a'; g.fillRect(cx - 9 * s, y0 + 58 * s, 18 * s, 8 * s); // neck
    cross(g, cx, y0 + 74 * s, y0 + 110 * s, gold(g, y0 + 74 * s, y0 + 110 * s), '#5a3a00', 2.5 * s, 1.1);
    // head
    const hg = g.createLinearGradient(cx - 24 * s, 0, cx + 24 * s, 0); hg.addColorStop(0, '#f7cf3c'); hg.addColorStop(0.4, '#ffe27a'); hg.addColorStop(1, '#d9a514');
    g.fillStyle = hg; g.beginPath(); roundRect(g, cx - 24 * s, y0 + 18 * s, 48 * s, 44 * s, 10 * s); g.fill();
    g.fillStyle = '#6b3f22'; g.beginPath(); g.moveTo(cx - 20 * s, y0 + 44 * s); g.quadraticCurveTo(cx, y0 + 70 * s, cx + 20 * s, y0 + 44 * s); g.quadraticCurveTo(cx, y0 + 54 * s, cx - 20 * s, y0 + 44 * s); g.fill(); // beard
    g.fillStyle = '#1b1b1f'; for (const dx of [-9, 9]) { g.beginPath(); g.ellipse(cx + dx * s, y0 + 34 * s, 3.2 * s, 4.2 * s, 0, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#1b1b1f'; g.lineWidth = 2.6 * s; g.lineCap = 'round'; g.beginPath(); g.arc(cx, y0 + 40 * s, 8 * s, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    // kamilavka
    const kg = g.createLinearGradient(0, y0, 0, y0 + 22 * s); kg.addColorStop(0, '#3a3a44'); kg.addColorStop(1, '#0d0d10');
    g.fillStyle = kg; g.beginPath(); roundRect(g, cx - 27 * s, y0, 54 * s, 22 * s, 4 * s); g.fill();
  },
  // 5. a 2×3 brick seen from above at three-quarters, turquoise, golden cross on its front, six studs on top
  iso(g, x0, y0, s) {
    const fw = 92 * s, fh = 62 * s, dx = 24 * s, dy = -20 * s;           // front face size, depth offset (to the up-right)
    const fx = x0 + 4 * s, fy = y0 + 44 * s;
    const top = () => { g.moveTo(fx, fy); g.lineTo(fx + dx, fy + dy); g.lineTo(fx + fw + dx, fy + dy); g.lineTo(fx + fw, fy); g.closePath(); };
    const side = () => { g.moveTo(fx + fw, fy); g.lineTo(fx + fw + dx, fy + dy); g.lineTo(fx + fw + dx, fy + dy + fh); g.lineTo(fx + fw, fy + fh); g.closePath(); };
    rimShadow(g, s, () => { g.moveTo(fx, fy); g.lineTo(fx + dx, fy + dy); g.lineTo(fx + fw + dx, fy + dy); g.lineTo(fx + fw + dx, fy + dy + fh); g.lineTo(fx + fw, fy + fh); g.lineTo(fx, fy + fh); g.closePath(); });
    g.fillStyle = '#5fd6d0'; g.beginPath(); top(); g.fill();
    g.fillStyle = '#137a80'; g.beginPath(); side(); g.fill();
    const fg = g.createLinearGradient(0, fy, 0, fy + fh); fg.addColorStop(0, '#2cc1c4'); fg.addColorStop(1, '#16878c');
    g.fillStyle = fg; g.fillRect(fx, fy, fw, fh);
    // studs on the top face: 3 along the width × 2 along the depth, back row first
    for (const j of [1, 0]) for (let i = 0; i < 3; i++) {
      const u = (i + 0.5) / 3, v = (j + 0.5) / 2, px = fx + u * fw + v * dx, py = fy + v * dy;
      const sr = 10.5 * s, sh = 7 * s;
      g.fillStyle = '#17959a'; g.fillRect(px - sr, py - sh, 2 * sr, sh);
      g.beginPath(); g.ellipse(px, py, sr, sr * 0.45, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#8af0ea'; g.beginPath(); g.ellipse(px, py - sh, sr, sr * 0.45, 0, 0, Math.PI * 2); g.fill();
    }
    cross(g, fx + fw / 2, fy + 7 * s, fy + fh - 6 * s, gold(g, fy, fy + fh), '#5a3a00', 3 * s);
  },
};
const LOGO_DEFAULT = 'flat';
