// Printed toy face for the blender-style monk: drawn on a canvas that covers the FRONT half of the cylinder head
// (u 0..1 = -90°..+90° around the head, v 0..1 = chin .. top of the head; see blender/characters/monk_model.py).
// Expression, blink, mouth opening (speech) and gaze are inputs; the picture is a pure function of them and is only
// redrawn when they change (so the per-frame cost is small).
export const FACE_W = 1024, FACE_H = 512;
const R = 0.56, Y0 = 2.965, HH = 0.97;
// head units -> canvas pixels (x: arc length on the cylinder from the face centre)
const PX = (x) => FACE_W / 2 + (x / R) / (Math.PI / 2) * (FACE_W / 2);
const PY = (y) => (1 - (y - Y0) / HH) * FACE_H;
const SX = FACE_W / (Math.PI * R), SY = FACE_H / HH; // px per unit

export const EXPRESSIONS = ['neutral', 'happy', 'joy', 'sad', 'surprised', 'ashamed', 'angry', 'thinking', 'warm', 'sleepy', 'asleep', 'sick', 'gentle', 'gentle-shrewd', 'pray', 'humble'];

// brows: [inner raise, outer raise, tilt]; mouth: kind + curve; eyes: open amount, squint; cheeks blush
export const EXPR = {
  neutral: { brow: [0.02, 0.012], mouth: 'smile', curve: 0.6, eye: 1, blush: 0.5 },
  happy: { brow: [0.035, 0.022], mouth: 'smile', curve: 1.0, eye: 1.04, cheek: 0.22, blush: 0.65 },
  // warm = the kind look of a grandfather: open, smiling eyes (the cheeks lift the lower lids), relaxed brows
  warm: { brow: [0.03, 0.02], mouth: 'smile', curve: 0.9, eye: 1.0, cheek: 0.34, blush: 0.7 },
  gentle: { brow: [0.03, 0.018], mouth: 'smile', curve: 0.75, eye: 0.95, cheek: 0.4, blush: 0.65 },
  'gentle-shrewd': { brow: [0.047, 0.020], mouth: 'smile', curve: 0.8, eye: 0.94, cheek: 0.35, blush: 0.60 },
  pray: { brow: [0.03, 0.012], mouth: 'smile', curve: 0.5, eye: 0.0, blush: 0.55 },
  humble: { brow: [0.04, 0.0], mouth: 'smile', curve: 0.5, eye: 0.78, blush: 0.65, lookDown: 0.03 },
  joy: { brow: [0.05, 0.04], mouth: 'grin', curve: 1, eye: 0.0, smileEyes: true, blush: 0.75 },
  sad: { brow: [0.07, -0.03], mouth: 'frown', curve: -0.6, eye: 0.95, blush: 0.3, lookDown: 0.02, tear: true, quiet: 0.7 },
  surprised: { brow: [0.10, 0.09], mouth: 'o', curve: 0, eye: 1.25, blush: 0.35 },
  ashamed: { brow: [0.065, -0.02], mouth: 'frown', curve: -0.28, eye: 0.64, blush: 1.0, lookDown: 0.075, quiet: 0.25 },
  angry: { brow: [-0.05, 0.03], mouth: 'frown', curve: -0.75, eye: 1.0, blush: 0.45 },
  thinking: { brow: [0.035, 0.025], mouth: 'smile', curve: 0.25, eye: 1.0, blush: 0.4, lookUp: 0.06 },
  sleepy: { brow: [0.0, -0.01], mouth: 'smile', curve: 0.35, eye: 0.4, blush: 0.35 },
  // asleep = eyes shut (soft lash lines), a calm little smile — someone who dozed off (film 052: `sleepy` still shows the eyes)
  asleep: { brow: [0.0, -0.012], mouth: 'smile', curve: 0.3, eye: 0.0, blush: 0.45 },
  sick: { brow: [0.04, -0.03], mouth: 'wobble', curve: -0.3, eye: 0.6, blush: 0.0, pale: true },
};

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0').slice(-6);

/** state: { expr, blink 0..1, mouth 0..1, gazeX, gazeY (-1..1), talk } ; look: { skin, browColor, brows, age, eyes } */
export function faceKey(state, look) {
  const q = (v, n) => Math.round((v || 0) * n);
  return [state.expr, q(state.blink, 4), q(state.mouth, 6), q(state.gazeX, 4), q(state.gazeY, 4), state.talk ? 1 : 0, state.brow ? q(state.brow[0], 400) + ',' + q(state.brow[1], 400) : ''].join('|') + '|' + look._faceSig;
}

/** how far the printed mouth is open (0 = a closed line, 1 = wide): the sculpted beard's jaw drops by the same amount */
export function mouthOpen(state, look) {
  const E = EXPR[state.expr] || EXPR.neutral;
  const talk = (state.talk ? Math.max(0, Math.min(1, state.mouth || 0)) : 0) * (E.quiet ?? 1);
  const openSmile = look.face === 'detailed' && E.mouth === 'smile' && E.curve >= 0.6;
  if (!(talk > 0.08 || E.mouth === 'grin' || E.mouth === 'o' || openSmile)) return 0;
  return E.mouth === 'grin' ? 0.55 + 0.45 * talk : E.mouth === 'o' ? 0.25 + 0.75 * talk : openSmile ? (look.face === 'detailed' ? 0.12 + 0.88 * talk : Math.max(0.42, talk)) : talk;
}

export function drawFace(g, state, look) {
  const E = EXPR[state.expr] || EXPR.neutral;
  const skin = hex(look.skinHex);
  g.fillStyle = skin; g.fillRect(0, 0, FACE_W, FACE_H);
  const ink = look.ink || '#24160f';
  const elder = look.age === 'elder';
  g.lineCap = 'round'; g.lineJoin = 'round';

  // cheeks
  const blush = E.blush * (look.blush ?? 1) * (look.face === 'detailed' ? 1.35 : 1);
  if (blush > 0.02) {
    for (const s of [-1, 1]) {
      const cx = PX(s * 0.30), cy = PY(3.36);
      const gr = g.createRadialGradient(cx, cy, 2, cx, cy, 0.11 * SX);
      gr.addColorStop(0, `rgba(240,110,90,${0.45 * blush})`); gr.addColorStop(1, 'rgba(240,110,90,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(cx, cy, 0.12 * SX, 0.08 * SY, 0, 0, Math.PI * 2); g.fill();
    }
  }

  // eyes
  const eyeY = 3.515 - (E.lookDown || 0) + (E.lookUp || 0) * 0.3;
  const sep = look.eyeSep ?? 0.2;
  const blink = Math.max(state.blink || 0, 0);
  let open = (E.eye ?? 1) * (1 - blink);
  const D = look.face === 'detailed';   // the sculpted, expressive face of the poster (film 040): opt-in per character
  const ew = (look.eyes === 'small' ? 0.075 : look.eyes === 'big' ? 0.105 : 0.092) * (D ? 0.96 : 1), eh = (look.eyes === 'small' ? 0.105 : look.eyes === 'big' ? 0.15 : 0.132) * (D ? 0.96 : 1);
  const gx = (state.gazeX || 0) * 0.018, gy = (state.gazeY || 0) * 0.014 + (E.lookUp || 0) * 0.4 - (E.lookDown || 0) * 0.4;
  for (const s of [-1, 1]) {
    const cx = PX(s * sep + gx), cy = PY(eyeY + gy);
    if (E.smileEyes && blink < 0.5) {
      // happy closed eyes: ∩ arcs
      g.strokeStyle = ink; g.lineWidth = 0.028 * SY;
      g.beginPath(); g.ellipse(cx, cy + 0.01 * SY, ew * 1.05 * SX, eh * 0.55 * SY, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
      continue;
    }
    if (open < 0.18) {
      // closed: a soft lash line
      g.strokeStyle = ink; g.lineWidth = 0.022 * SY;
      g.beginPath(); g.ellipse(cx, cy - 0.01 * SY, ew * 1.05 * SX, eh * 0.35 * SY, 0, Math.PI * 0.12, Math.PI * 0.88); g.stroke();
      continue;
    }
    const h = eh * Math.min(1.3, open);
    g.fillStyle = ink;
    g.beginPath(); g.ellipse(cx, cy, ew * SX, h * SY, 0, 0, Math.PI * 2); g.fill();
    const ir = g.createRadialGradient(cx, cy + h * 0.25 * SY, 1, cx, cy + h * 0.2 * SY, ew * 0.95 * SX);
    ir.addColorStop(0, 'rgba(120,70,35,0.0)'); ir.addColorStop(0.55, 'rgba(120,70,35,0.0)'); ir.addColorStop(1, 'rgba(150,90,45,0.55)');
    g.fillStyle = ir; g.beginPath(); g.ellipse(cx, cy, ew * SX, h * SY, 0, 0, Math.PI * 2); g.fill();
    // highlights (printed)
    g.fillStyle = '#ffffff';
    g.beginPath(); g.ellipse(cx + ew * 0.32 * SX, cy - h * 0.38 * SY, ew * 0.34 * SX, Math.min(h * 0.3, ew * 0.4) * SY, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 0.85;
    g.beginPath(); g.arc(cx - ew * 0.35 * SX, cy + h * 0.42 * SY, ew * 0.14 * SX, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    if (D) { // a tiny second sparkle: the eyes read round and glossy (no lid line above: it read as a printed brow)
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(cx + ew * 0.05 * SX, cy - h * 0.62 * SY, ew * 0.09 * SX, 0, Math.PI * 2); g.fill();
    }
    // upper lid: a level, softly curved line (never slanted like a lash: that reads sly); `slant` = a cross frown
    const cut = open < 0.6 ? 1 - open : 0;   // only while the eye closes (blink, sleepy): an open eye is never cut by a lid (that reads sly)
    if (cut > 0.06) { const line = cut > 0.3;
      const top = cy - h * SY, yl = top + 2 * h * SY * cut * 0.9, sl = (E.slant || 0) * h * SY * 1.1;
      const x0 = cx - ew * 1.5 * SX, x1 = cx + ew * 1.5 * SX;
      const yi = yl + sl * 0.5, yo = yl - sl * 0.9;             // inner end lower when cross
      const ya = s < 0 ? yo : yi, yb = s < 0 ? yi : yo;         // s<0: the inner end is at x1
      g.fillStyle = skin;
      g.beginPath(); g.moveTo(x0, top - 0.03 * SY); g.lineTo(x1, top - 0.03 * SY); g.lineTo(x1, yb); g.quadraticCurveTo(cx, (ya + yb) / 2 - 0.012 * SY, x0, ya); g.closePath(); g.fill();
      g.strokeStyle = ink; g.lineWidth = (line ? 0.014 : 0) * SY;
      if (line) g.beginPath(), g.moveTo(cx - ew * 1.02 * SX, ya + (yb - ya) * 0.16); g.quadraticCurveTo(cx, (ya + yb) / 2 - 0.012 * SY, cx + ew * 1.02 * SX, yb + (ya - yb) * 0.16), g.stroke();
    }
    // smiling eyes: the cheek lifts the lower lid (a soft upward curve under the eye)
    if (E.cheek) {
      g.fillStyle = skin;
      g.beginPath(); g.ellipse(cx, cy + h * SY * (1.9 - E.cheek * 1.6), ew * 1.7 * SX, h * SY, 0, 0, Math.PI * 2); g.fill();
    }
  }

  if (E.tear && blink < 0.5) {
    const cx = PX(sep + 0.03), cy = PY(eyeY - 0.10);
    g.fillStyle = 'rgba(120,190,255,0.85)';
    g.beginPath(); g.moveTo(cx, cy - 0.03 * SY); g.quadraticCurveTo(cx + 0.025 * SX, cy + 0.01 * SY, cx, cy + 0.025 * SY); g.quadraticCurveTo(cx - 0.025 * SX, cy + 0.01 * SY, cx, cy - 0.03 * SY); g.fill();
  }
  // brows
  const browCol = hex(look.browHex ?? 0x3a2414);
  const bw = look.brows === 'bushy' ? 0.045 : look.brows === 'thin' ? 0.017 : 0.026;
  for (const s of [-1, 1]) {
    const asym = (E.browAsym || 0) * (s > 0 ? 1 : -0.3);
    const inner = [PX(s * (sep - 0.075)), PY(3.665 + E.brow[0] + asym)];
    const outer = [PX(s * (sep + 0.085)), PY(3.655 + E.brow[1] + asym)];
    const mid = [(inner[0] + outer[0]) / 2, Math.min(inner[1], outer[1]) - 0.025 * SY];
    if (look.brows3d) continue;   // sculpted (3D) brows are shown instead
    if (D && look.brows === 'bushy') { // fluffy printed brows: a soft shadow, then many short overlapping hair strokes
      const pt = (k) => { const a = 1 - k; return [a * a * inner[0] + 2 * a * k * mid[0] + k * k * outer[0], a * a * inner[1] + 2 * a * k * mid[1] + k * k * outer[1]]; };
      g.strokeStyle = 'rgba(110,60,20,0.28)'; g.lineWidth = 0.07 * SY;
      g.beginPath(); g.moveTo(inner[0], inner[1] + 0.012 * SY); g.quadraticCurveTo(mid[0], mid[1] + 0.012 * SY, outer[0], outer[1] + 0.012 * SY); g.stroke();
      g.strokeStyle = browCol; g.lineWidth = 0.062 * SY;
      g.beginPath(); g.moveTo(...inner); g.quadraticCurveTo(...mid, ...outer); g.stroke();
      const light = '#ffffff';
      for (let i = 0; i < 11; i++) {
        const k = i / 10, [x, y] = pt(k), lift = (i % 3 - 1) * 0.006;
        g.strokeStyle = i % 2 ? light : browCol; g.lineWidth = 0.02 * SY;
        g.beginPath(); g.moveTo(x - s * 0.012 * SX, y + 0.02 * SY); g.quadraticCurveTo(x + s * 0.01 * SX, y - (0.03 + lift) * SY, x + s * 0.045 * SX, y - (0.022 + lift) * SY); g.stroke();
      }
      g.strokeStyle = 'rgba(150,140,130,0.5)'; g.lineWidth = 0.008 * SY;
      for (let i = 0; i < 6; i++) { const [x, y] = pt(0.1 + i * 0.16); g.beginPath(); g.moveTo(x, y + 0.012 * SY); g.lineTo(x + s * 0.025 * SX, y - 0.012 * SY); g.stroke(); }
      continue;
    }
    g.strokeStyle = browCol; g.lineWidth = bw * SY;
    g.beginPath(); g.moveTo(...inner); g.quadraticCurveTo(...mid, ...outer); g.stroke();
    if (look.brows === 'bushy') { // a few tufts
      g.lineWidth = bw * 0.45 * SY;
      for (let i = 0; i < 4; i++) {
        const k = 0.2 + i * 0.2, x = inner[0] + (outer[0] - inner[0]) * k, y = inner[1] + (outer[1] - inner[1]) * k - 0.02 * SY;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * 0.03 * SX, y - 0.028 * SY); g.stroke();
      }
    }
  }

  // nose: a small printed curve (detailed: a round, shaded button nose with a highlight)
  if (look.nose3d) { /* the sculpted nose */ } else if (D) {
    const nx = PX(0), ny = PY(3.43);
    const ng = g.createRadialGradient(nx - 0.012 * SX, ny - 0.014 * SY, 1, nx, ny, 0.06 * SX);
    ng.addColorStop(0, 'rgba(255,240,190,0.55)'); ng.addColorStop(0.55, 'rgba(230,140,60,0.18)'); ng.addColorStop(1, 'rgba(200,110,40,0)');
    g.fillStyle = ng; g.beginPath(); g.ellipse(nx, ny, 0.06 * SX, 0.048 * SY, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(120,55,15,0.55)'; g.lineWidth = 0.012 * SY;
    g.beginPath(); g.moveTo(PX(-0.045), PY(3.415)); g.quadraticCurveTo(PX(0), PY(3.375), PX(0.045), PY(3.415)); g.stroke();
  } else {
    g.strokeStyle = 'rgba(60,30,10,0.55)'; g.lineWidth = 0.014 * SY;
    g.beginPath(); g.moveTo(PX(-0.025), PY(3.445)); g.quadraticCurveTo(PX(0.0), PY(3.41), PX(0.03), PY(3.44)); g.stroke();
  }

  // elder: wrinkles (forehead + smile lines)
  if (elder) {
    g.strokeStyle = 'rgba(90,50,20,0.35)'; g.lineWidth = 0.010 * SY;
    for (const dy of [0, 0.045]) { g.beginPath(); g.moveTo(PX(-0.17), PY(3.76 + dy)); g.quadraticCurveTo(PX(0), PY(3.785 + dy), PX(0.17), PY(3.76 + dy)); g.stroke(); }
    for (const s of [-1, 1]) {
      const x = PX(s * (sep + 0.115)), y = PY(3.52);
      g.beginPath(); g.moveTo(x, y - 0.02 * SY); g.lineTo(x + s * 0.035 * SX, y - 0.035 * SY); g.moveTo(x, y + 0.01 * SY); g.lineTo(x + s * 0.04 * SX, y + 0.012 * SY); g.stroke();
      if (D) { // a third crow's foot, and the smile line from the nose down round the cheek
        g.beginPath(); g.moveTo(x, y + 0.04 * SY); g.lineTo(x + s * 0.03 * SX, y + 0.06 * SY); g.stroke();
        g.beginPath(); g.moveTo(PX(s * 0.075), PY(3.40)); g.quadraticCurveTo(PX(s * 0.14), PY(3.33), PX(s * 0.15), PY(3.24)); g.stroke();
      }
    }
    if (D) { g.beginPath(); g.moveTo(PX(-0.12), PY(3.85)); g.quadraticCurveTo(PX(0), PY(3.87), PX(0.12), PY(3.85)); g.stroke(); }
  }

  // mouth
  // detailed face: the mouth sits a little higher, in the middle of the free space between the moustache (≈ 3.32) and
  // the beard (≈ 3.15), and opens from almost closed to the edge of that space — a wide movement that stays in view
  const mx = PX(E.mouth === 'side' ? 0.04 : 0), my = PY(D ? 3.25 : 3.25);   // detailed: centred in the opening of the beard (reviewer 042: it sat against the moustache)
  const talk = (state.talk ? Math.max(0, Math.min(1, state.mouth || 0)) : 0) * (E.quiet ?? 1);   // a sad / ashamed voice barely opens the mouth
  const mw = 0.135 * SX;
  const lip = ink;
  const openSmile = D && E.mouth === 'smile' && E.curve >= 0.6;   // detailed face: smiles show the mouth (the poster)
  if (talk > 0.08 || E.mouth === 'grin' || E.mouth === 'o' || openSmile) {
    // open mouth: dark with a tongue; corners follow the expression
    const o = mouthOpen(state, look);
    const curve = E.curve;
    const w = E.mouth === 'o' ? mw * (0.5 + 0.18 * o) : mw * (0.74 + 0.12 * o);   // a talking 'o' opens wide and tall, clearly seen
    const hTop = 0.012 * SY - curve * 0.012 * SY, hBot = (D ? 0.006 + (E.mouth === 'o' ? 0.066 : 0.06) * o : 0.016 + (E.mouth === 'o' ? 0.085 : 0.05) * o) * SY;
    g.fillStyle = '#5a1a14';
    const mp = new Path2D();
    if (curve < -0.1 && E.mouth !== 'o') { // unhappy: an arch (corners down), flat underneath
      const yc = my + 0.02 * SY - curve * 0.02 * SY;
      mp.moveTo(mx - w, yc);
      mp.quadraticCurveTo(mx, yc - hBot * 2.1 - 0.02 * SY, mx + w, yc);
      mp.quadraticCurveTo(mx, yc + hBot * 0.25, mx - w, yc);
    } else {
      mp.moveTo(mx - w, my - curve * 0.03 * SY);
      mp.quadraticCurveTo(mx, my - hTop - (E.mouth === 'o' ? hBot * (D ? 0.4 : 0.6) : 0), mx + w, my - curve * 0.03 * SY);
      mp.quadraticCurveTo(mx, my + hBot * (1 + Math.max(0, curve) * 0.35) * 1.4, mx - w, my - curve * 0.03 * SY);
    }
    g.fill(mp);
    g.save(); g.clip(mp);
    g.fillStyle = '#e0706a'; g.beginPath(); g.ellipse(mx, my + hBot * 1.05, w * 0.6, hBot * 0.55, 0, 0, Math.PI * 2); g.fill();
    if (!(curve < -0.1)) { g.fillStyle = '#ffffff'; g.fillRect(mx - w, my - 0.04 * SY - curve * 0.03 * SY, 2 * w, (0.028 + 0.004 * o) * SY * (E.mouth === 'o' ? 0 : 1)); }
    g.restore();
    g.strokeStyle = lip; g.lineWidth = 0.016 * SY; g.stroke(mp);
  } else if (E.mouth === 'wobble') {
    g.strokeStyle = lip; g.lineWidth = 0.02 * SY;
    g.beginPath(); g.moveTo(mx - mw * 0.7, my + 0.01 * SY);
    for (let i = 1; i <= 6; i++) g.lineTo(mx - mw * 0.7 + (mw * 1.4 * i) / 6, my + (i % 2 ? -0.012 : 0.008) * SY);
    g.stroke();
  } else {
    const curve = E.curve;
    const w = E.mouth === 'side' ? mw * 0.6 : mw;
    g.strokeStyle = lip; g.lineWidth = 0.022 * SY;
    g.beginPath(); g.moveTo(mx - w, my - curve * 0.035 * SY);
    g.quadraticCurveTo(mx, my + curve * 0.06 * SY, mx + w, my - curve * 0.035 * SY - (E.mouth === 'side' ? 0.02 * SY : 0)); g.stroke();
    if (curve > 0.5) { // dimples
      g.lineWidth = 0.012 * SY;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(mx + s * (w + 0.008 * SX), my - curve * 0.05 * SY); g.lineTo(mx + s * (w + 0.02 * SX), my - curve * 0.02 * SY); g.stroke(); }
    }
  }
}
