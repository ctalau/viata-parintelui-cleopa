// Procedural minifigure: geometry, look presets, face/torso printing, gestures & poses.
//
// const fig = createMinifig({ preset: 'elder-monk', halo: true });
// scene.add(fig.root);
// fig.update({ time, walk, gestures, emotion, mouth, posture, holding });
//
// Local frame: figure faces +Z, its own RIGHT arm is on local -X.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { plastic, color, COLORS } from './bricks.js';
import { clamp01, smooth, lerp } from '../engine/timeline.js';

// ---------- presets ----------
export const LOOKS = {
  'monk': { skin: 'yellow', robe: 'darkBrown', legs: 'darkBrown', hat: 'skufia', hatColor: 'black', beard: 'short', beardColor: 'brown', age: 'adult', print: 'robe' },
  'elder-monk': { skin: 'yellow', robe: 'black', legs: 'black', hat: 'hood', hatColor: 'black', beard: 'long', beardColor: 'white', age: 'elder', print: 'robe' },
  'young-monk': { skin: 'yellow', robe: 'reddishBrown', legs: 'reddishBrown', hat: 'skufia', hatColor: 'black', beard: 'none', hair: 'short', hairColor: 'brown', age: 'young', print: 'robe' },
  'villager': { skin: 'yellow', robe: 'white', legs: 'tan', hat: 'headscarf', hatColor: 'white', bandColor: 'blue', beard: 'short', beardColor: 'black', age: 'adult', print: 'tunic', stripe: 'blue' },
  'child': { skin: 'yellow', robe: 'mediumBlue', legs: 'tan', hat: 'none', hair: 'short', hairColor: 'darkBrown', beard: 'none', age: 'child', print: 'tunic', stripe: 'white', scale: 0.8 },
  'woman': { skin: 'yellow', robe: 'magenta', legs: 'magenta', hat: 'headscarf', hatColor: 'lavender', bandColor: 'white', beard: 'none', age: 'adult', print: 'tunic', stripe: 'gold', lashes: true },
};

export function resolveLook(look = {}) {
  const base = LOOKS[look.preset || 'monk'] || LOOKS.monk;
  return { ...base, ...look };
}


// "fabric": knitted / woven cloth (like the soft fabric capes of real minifigs): a canvas weave as bump map, matte.
// look.fabric: true = cowl, cloak, long robe and sleeves; "cloak" = only the cowl / hood and the cloak.
const fabricTex = new Map();
function weaveTexture(kind) {
  if (fabricTex.has(kind)) return fabricTex.get(kind);
  const c = canvas(128, 128), g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, 128, 128);
  if (kind === 'shaggy') { // a shaggy wool: short random strokes
    let s = 17; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 900; i++) { const x = r() * 128, y = r() * 128, v = 60 + r() * 140; g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 4, y + 3 + r() * 5); g.stroke(); }
  } else for (let y = 0; y < 128; y += 4) for (let x = 0; x < 128; x += 4) { // knit: rows of little V stitches
    const v = ((x + y) / 4) % 2 ? 175 : 95; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, y, 2, 3); g.fillStyle = `rgb(${250 - v},${250 - v},${250 - v})`; g.fillRect(x + 2, y + 1, 2, 3);
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); t.anisotropy = 4;
  fabricTex.set(kind, t); return t;
}
// the same weave as a colour map (light .. a little darker), so the cloth reads as cloth even far from the camera
const fabricShade = new Map();
function shadeTexture(kind) {
  if (fabricShade.has(kind)) return fabricShade.get(kind);
  const src = weaveTexture(kind).image, c = canvas(128, 128), g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128); g.globalAlpha = kind === 'shaggy' ? 0.85 : 0.4; g.globalCompositeOperation = 'multiply'; g.drawImage(src, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(kind === 'shaggy' ? 3 : 6, kind === 'shaggy' ? 3 : 6); t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace;
  fabricShade.set(kind, t); return t;
}
export function fabricMaterial(col, { kind = 'knit', side = THREE.FrontSide, map } = {}) {
  return new THREE.MeshStandardMaterial({ color: map ? 0xffffff : color(col), map: map || shadeTexture(kind), roughness: 0.92, bumpMap: weaveTexture(kind), bumpScale: kind === 'shaggy' ? 2.2 : 1.4, side });
}

// ---------- dimensions ----------
const D = {
  hipY: 1.45, legH: 1.3, legW: 0.7, legD: 0.82,
  torsoBottom: 1.58, torsoH: 1.32, torsoWB: 1.62, torsoWT: 1.22, torsoD: 0.8,
  shoulderY: 2.66, shoulderX: 0.68, armLen: 1.02,
  neckY: 2.9, headR: 0.56, headH: 0.96,
};
export const MINIFIG_HEIGHT = 4.4;

// ---------- textures ----------
function canvas(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}
const hex = (c) => '#' + color(c).toString(16).padStart(6, '0');

function drawTorso(look) {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = hex(look.robe); g.fillRect(0, 0, 256, 256);
  if (look.print === 'robe') {
    // V-neck with lighter undershirt, rope belt, folds
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.beginPath(); g.moveTo(70, 0); g.lineTo(128, 120); g.lineTo(186, 0); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 6;
    g.beginPath(); g.moveTo(80, 0); g.lineTo(128, 105); g.lineTo(176, 0); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 4;
    for (const x of [70, 186]) { g.beginPath(); g.moveTo(x, 130); g.lineTo(x + (x < 128 ? -14 : 14), 256); g.stroke(); }
    g.fillStyle = hex(look.belt || 'tan'); g.fillRect(0, 196, 256, 18);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 6; x < 256; x += 16) g.fillRect(x, 196, 3, 18);
    g.fillStyle = hex(look.belt || 'tan'); g.fillRect(150, 210, 10, 40); g.fillRect(166, 210, 10, 32);
  } else if (look.print === 'tunic') {
    g.fillStyle = hex(look.stripe || 'blue');
    g.fillRect(98, 0, 14, 256); g.fillRect(144, 0, 14, 256);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(128, 0, 46, 26, 0, 0, Math.PI); g.fill();
    g.fillStyle = hex(look.belt || 'reddishBrown'); g.fillRect(0, 200, 256, 22);
  }
  if (look.vest) {
    // sleeveless vest (a ploughman's *vestă*) open in front over the shirt: two panels + dark edges
    g.fillStyle = hex(look.vest);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(84, 0); g.lineTo(104, 120); g.lineTo(96, 256); g.lineTo(0, 256); g.fill();
    g.beginPath(); g.moveTo(256, 0); g.lineTo(172, 0); g.lineTo(152, 120); g.lineTo(160, 256); g.lineTo(256, 256); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(84, 0); g.lineTo(104, 120); g.lineTo(96, 256); g.stroke();
    g.beginPath(); g.moveTo(172, 0); g.lineTo(152, 120); g.lineTo(160, 256); g.stroke();
    if (look.belt) { g.fillStyle = hex(look.belt); g.fillRect(0, 200, 256, 22); }
  }
  if (look.cloak) {
    // open mantle (himation) over the shoulders: two panels down the front edges + a collar
    const cc = hex(look.cloakColor || 'blue');
    g.fillStyle = cc;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(78, 0); g.quadraticCurveTo(58, 120, 46, 256); g.lineTo(0, 256); g.fill();
    g.beginPath(); g.moveTo(256, 0); g.lineTo(178, 0); g.quadraticCurveTo(198, 120, 210, 256); g.lineTo(256, 256); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(78, 0); g.quadraticCurveTo(58, 120, 46, 256); g.stroke();
    g.beginPath(); g.moveTo(178, 0); g.quadraticCurveTo(198, 120, 210, 256); g.stroke();
    if (look.cloakTrim !== false) {
      g.strokeStyle = hex(look.cloakTrim || 'gold'); g.lineWidth = 4;
      g.beginPath(); g.moveTo(70, 0); g.quadraticCurveTo(51, 120, 39, 256); g.stroke();
      g.beginPath(); g.moveTo(186, 0); g.quadraticCurveTo(205, 120, 217, 256); g.stroke();
    }
  }
  if (look.bag) {
    // strap of the shoulder bag (traistă) across the chest: from the right shoulder down to the left hip
    g.strokeStyle = hex(look.bagStrap || look.bag); g.lineWidth = 22;
    g.beginPath(); g.moveTo(40, 0); g.lineTo(236, 230); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(32, 6); g.lineTo(228, 236); g.stroke();
  }
  if (look.cross) {
    // small golden cross on a chain (priest / elder)
    g.strokeStyle = hex('gold'); g.lineWidth = 4;
    g.beginPath(); g.moveTo(88, 0); g.quadraticCurveTo(128, 130, 168, 0); g.stroke();
    g.fillStyle = hex('gold'); g.fillRect(122, 104, 12, 54); g.fillRect(106, 118, 44, 11);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** Draws the face (front half of the head cylinder) for the given expression state. */
function drawFace(g, look, s) {
  const W = 512, H = 256;
  g.clearRect(0, 0, W, H);
  const cx = W / 2;
  const ink = '#1d1d1f';
  const elder = look.age === 'elder';
  const browC = look.browColor ? hex(look.browColor) : elder ? hex(look.beardColor || 'white') : ink;
  const em = s.emotion;
  const eyeY = 112, eyeDX = 52;
  const closed = s.eyesClosed || em === 'sleepy' || em === 'asleep' || em === 'warm';

  // cheeks (cute blush)
  // (angry: red cheeks; ashamed: a big blush — the child sees the feeling without words)
  g.fillStyle = em === 'sick' ? 'rgba(120,180,90,0.45)' : em === 'angry' ? 'rgba(230,60,50,0.55)' : em === 'ashamed' ? 'rgba(255,90,100,0.6)' : 'rgba(255,120,110,0.38)';
  const blushW = em === 'ashamed' ? 32 : 24;
  if (look.blush !== false || em === 'angry' || em === 'ashamed' || em === 'sick') for (const sx of [-1, 1]) { g.beginPath(); g.ellipse(cx + sx * 92, 152, blushW, 15, 0, 0, Math.PI * 2); g.fill(); }

  // eyes
  g.fillStyle = ink; g.strokeStyle = ink; g.lineCap = 'round';
  const blink = s.blink || 0;
  for (const sx of [-1, 1]) {
    const x = cx + sx * eyeDX + (s.gazeX || 0) * 8;
    const y = eyeY + (s.gazeY || 0) * 6 + (em === 'ashamed' ? 8 : 0); // ashamed: eyes cast down
    if (closed || blink > 0.85) {
      g.lineWidth = 7; g.beginPath();
      if (em === 'warm' || em === 'joy' || em === 'happy') g.arc(x, y + 8, 16, Math.PI * 1.1, Math.PI * 1.9);
      else { g.moveTo(x - 15, y + 4); g.quadraticCurveTo(x, y + 12, x + 15, y + 4); }
      g.stroke();
    } else {
      const toon = look.toon;
      let rx = toon ? 21 : look.eyes === 'big' ? 19 : 15, ry = toon ? 29 : look.eyes === 'big' ? 26 : 21;
      if (em === 'surprised') { rx = 18; ry = 25; }
      if (em === 'sick' || em === 'sleepy' || em === 'asleep') ry = 12;
      if (em === 'ashamed') ry = 14;
      if (em === 'angry') ry = 18;
      ry *= 1 - blink;
      if (toon) { // "render": "vivid": glossy cartoon eyes — a dark-brown iris ring, two white highlights, an upper lid line
        g.fillStyle = '#2a1608'; g.beginPath(); g.ellipse(x, y, rx, Math.max(2, ry), 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#120a05'; g.beginPath(); g.ellipse(x, y + ry * 0.08, rx * 0.72, Math.max(1.5, ry * 0.74), 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff';
        g.beginPath(); g.ellipse(x - rx * 0.32, y - ry * 0.38, Math.max(1, 7.5 * (1 - blink)), Math.max(1, 9 * (1 - blink)), -0.4, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(x + rx * 0.35, y + ry * 0.35, Math.max(0.5, 3.5 * (1 - blink)), 0, Math.PI * 2); g.fill();
        g.strokeStyle = ink; g.lineWidth = 4; g.beginPath(); g.arc(x, y + 4, rx + 3, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      } else {
      g.beginPath(); g.ellipse(x, y, rx, Math.max(2, ry), 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(x - 5, y - ry * 0.4, Math.max(1, (look.eyes === 'big' ? 7.5 : 5.5) * (1 - blink)), 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = ink;
      if (em === 'sick') { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 17, y - 16, 34, 9); g.fillStyle = ink; }
    }
    if (look.lashes) { g.lineWidth = 4; g.beginPath(); g.moveTo(x + sx * 12, y - 16); g.lineTo(x + sx * 22, y - 24); g.stroke(); }
    if (elder) { // wrinkles
      g.lineWidth = 3; g.strokeStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.moveTo(x + sx * 26, y - 4); g.lineTo(x + sx * 34, y - 9); g.moveTo(x + sx * 26, y + 4); g.lineTo(x + sx * 34, y + 6); g.stroke();
      g.strokeStyle = ink;
    }
  }

  // eyebrows
  g.strokeStyle = browC; g.lineWidth = elder ? 11 : 8;
  for (const sx of [-1, 1]) {
    const x = cx + sx * eyeDX;
    let inner = 0, outer = 0, lift = 0;
    if (em === 'sad' || em === 'sick' || em === 'ashamed') { inner = -9; outer = 6; }
    if (em === 'angry') { inner = 12; outer = -6; } // brows pulled down to the nose: a cross face (never scary)
    if (em === 'surprised') lift = -14;
    if (em === 'thinking' && sx === 1) lift = -12;
    if (em === 'joy' || em === 'happy' || em === 'warm') lift = -5;
    const brow = () => { g.beginPath(); g.moveTo(x - sx * 17, eyeY - 34 + lift + inner); g.quadraticCurveTo(x, eyeY - 40 + lift, x + sx * 19, eyeY - 32 + lift + outer); g.stroke(); };
    if (look.brows === 'bushy') { // thick old man's brows: a dark outline so pale brows read on the yellow face
      g.lineWidth = 22; g.strokeStyle = 'rgba(40,30,20,0.55)'; brow(); g.lineWidth = 16; g.strokeStyle = browC; brow();
    } else brow();
  }

  // printed beard: around the chin with a skin-coloured gap for the mouth, plus a mustache
  const hasBeard = look.beard && look.beard !== 'none' && look.beard !== 'mustache' && look.beard !== 'flowing'; // flowing = all 3D, nothing printed under it
  const mouthY = hasBeard ? 192 : look.toon && look.beard === 'flowing' ? 168 : 180;
  if (look.beard === 'mustache') { // only a thick mustache (an old ploughman)
    g.fillStyle = hex(look.beardColor || 'gray');
    g.beginPath(); g.moveTo(cx, 150); g.quadraticCurveTo(cx - 60, 136, cx - 92, 196); g.quadraticCurveTo(cx - 40, 182, cx, 182);
    g.quadraticCurveTo(cx + 40, 182, cx + 92, 196); g.quadraticCurveTo(cx + 60, 136, cx, 150); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3; g.stroke();
  }
  if (hasBeard) {
    const bc = hex(look.beardColor || 'brown');
    g.fillStyle = bc;
    g.beginPath(); g.moveTo(cx - 120, 150); g.quadraticCurveTo(cx - 118, 256, cx, 262); g.quadraticCurveTo(cx + 118, 256, cx + 120, 150);
    g.quadraticCurveTo(cx + 90, 176, cx, 172); g.quadraticCurveTo(cx - 90, 176, cx - 120, 150); g.fill();
    g.fillStyle = hex(look.skin || 'yellow');
    g.beginPath(); g.ellipse(cx, mouthY + 6, 52, 26, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = bc; // mustache
    g.beginPath(); g.moveTo(cx, 166); g.quadraticCurveTo(cx - 40, 152, cx - 66, 182); g.quadraticCurveTo(cx - 30, 176, cx, 178);
    g.quadraticCurveTo(cx + 30, 176, cx + 66, 182); g.quadraticCurveTo(cx + 40, 152, cx, 166); g.fill();
  }

  // mouth
  const open = clamp01(s.mouth || 0);
  g.lineWidth = 7; g.strokeStyle = ink; g.fillStyle = '#5a1018';
  const smileK = { happy: 1, joy: 1.3, warm: 0.8, neutral: 0.45, thinking: 0.05, surprised: 0, sad: -0.7, sick: -0.4, sleepy: 0.2, asleep: 0.25, angry: -0.6, ashamed: -0.35 }[em] ?? 0.4;
  const mw = 34 + Math.max(0, smileK) * 10;
  if (look.toon && open < 0.15 && (em === 'joy' || em === 'happy' || em === 'warm' || em === 'neutral')) {
    // "render": "vivid": a big open cartoon smile — dark-red mouth, a pink tongue, smile creases at the corners
    const w = em === 'joy' ? 46 : em === 'neutral' ? 30 : 40, h = em === 'joy' ? 50 : em === 'neutral' ? 26 : 40;
    g.fillStyle = '#6a1418';
    g.beginPath(); g.moveTo(cx - w, mouthY - 8); g.quadraticCurveTo(cx, mouthY - 2, cx + w, mouthY - 8); g.quadraticCurveTo(cx, mouthY + h, cx - w, mouthY - 8); g.fill();
    g.save(); g.clip(); g.fillStyle = '#e86a78'; g.beginPath(); g.ellipse(cx, mouthY + h * 0.62, w * 0.55, h * 0.32, 0, 0, Math.PI * 2); g.fill(); g.restore();
    g.strokeStyle = ink; g.lineWidth = 5; g.beginPath(); g.moveTo(cx - w, mouthY - 8); g.quadraticCurveTo(cx, mouthY + h, cx + w, mouthY - 8); g.stroke();
    g.lineWidth = 4; for (const sx of [-1, 1]) { g.beginPath(); g.arc(cx + sx * (w + 2), mouthY - 10, 9, sx > 0 ? Math.PI * 0.6 : Math.PI * 0.4, sx > 0 ? Math.PI * 1.2 : -Math.PI * 0.2, sx < 0); g.stroke(); }
  } else if (em === 'joy' && open < 0.15) {
    // big open "D" smile
    g.beginPath(); g.moveTo(cx - 40, mouthY - 6); g.quadraticCurveTo(cx, mouthY + 52, cx + 40, mouthY - 6); g.closePath(); g.fill();
    g.fillStyle = '#fff'; g.fillRect(cx - 28, mouthY - 6, 56, 9);
  } else if (open > 0.06 || em === 'surprised') {
    const h = em === 'surprised' && open < 0.06 ? 16 : 6 + open * 30;
    const w = em === 'surprised' && open < 0.06 ? 14 : mw * (0.7 + open * 0.25);
    g.beginPath();
    g.ellipse(cx, mouthY + h * 0.3 + smileK * 2, w, h, 0, 0, Math.PI * 2); g.fill();
    if (open > 0.35) { g.fillStyle = '#e8687a'; g.beginPath(); g.ellipse(cx, mouthY + h * 0.75, w * 0.55, h * 0.35, 0, 0, Math.PI * 2); g.fill(); }
  } else {
    g.beginPath();
    if (em === 'thinking') { g.moveTo(cx - 18, mouthY + 4); g.lineTo(cx + 22, mouthY - 2); }
    else if (em === 'sick') { g.moveTo(cx - 30, mouthY + 4); g.bezierCurveTo(cx - 10, mouthY - 8, cx + 10, mouthY + 14, cx + 30, mouthY + 2); }
    else { g.moveTo(cx - mw, mouthY - smileK * 8); g.quadraticCurveTo(cx, mouthY + smileK * 22, cx + mw, mouthY - smileK * 8); }
    g.stroke();
  }
}

// ---------- geometry helpers ----------
function torsoGeometry() {
  const g = new THREE.BoxGeometry(D.torsoWB, D.torsoH, D.torsoD, 1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y > 0) p.setX(i, p.getX(i) * (D.torsoWT / D.torsoWB));
  }
  g.computeVertexNormals();
  return g;
}
function handGeometry() {
  const g = new THREE.TorusGeometry(0.17, 0.085, 8, 14, Math.PI * 1.55);
  g.rotateZ(Math.PI * 0.72);
  g.rotateY(Math.PI / 2);
  return g;
}

// ---------- gestures: (k = 0..1 progress, env = in/out envelope, t = absolute time) -> pose deltas ----------
const bump = (k, a = 0.18) => smooth(k / a) * smooth((1 - k) / a);
function keyframes(k, frames) {
  // frames: [[k, {..values}], ...] -> interpolated values
  if (k <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    if (k <= frames[i][0]) {
      const [k0, a] = frames[i - 1], [k1, b] = frames[i];
      const u = smooth((k - k0) / (k1 - k0));
      const r = {};
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) r[key] = lerp(a[key] ?? 0, b[key] ?? 0, u);
      return r;
    }
  }
  return frames[frames.length - 1][1];
}

export const GESTURE_POSES = {
  wave: (k, t) => { const e = bump(k); return { rArmX: -2.7 * e, rArmZ: (-0.35 + 0.35 * Math.sin(t * 13)) * e, headRoll: 0.1 * e }; },
  nod: (k) => ({ headPitch: 0.32 * Math.abs(Math.sin(k * Math.PI * 2)) }),
  shake: (k) => ({ headYaw: 0.45 * Math.sin(k * Math.PI * 6) * bump(k, 0.1) }),
  bow: (k) => { const e = bump(k, 0.3); return { bend: 0.55 * e, headPitch: 0.25 * e, rArmX: -0.5 * e, lArmX: -0.5 * e, rArmZ: 0.25 * e, lArmZ: -0.25 * e }; },
  // Orthodox sign of the cross: forehead -> chest -> right shoulder -> left shoulder, then a small bow
  cross: (k) => keyframes(k, [
    [0, {}], [0.12, { rArmX: -2.65, rArmZ: 0.5, rHandX: -0.6 }], [0.3, { rArmX: -2.65, rArmZ: 0.5, rHandX: -0.6 }],
    [0.45, { rArmX: -1.35, rArmZ: 0.45, rHandX: -0.4 }], [0.58, { rArmX: -2.05, rArmZ: 0.05, rHandX: -0.5 }],
    [0.72, { rArmX: -2.05, rArmZ: 0.85, rHandX: -0.5 }], [0.86, { bend: 0.35, headPitch: 0.25, rArmX: -0.3 }], [1, {}],
  ]),
  pray: (k) => { const e = bump(k, 0.2); return { rArmX: -1.7 * e, lArmX: -1.7 * e, rArmZ: 0.55 * e, lArmZ: -0.55 * e, headPitch: 0.18 * e, eyesClosed: e > 0.6 }; },
  jump: (k) => { const e = Math.sin(clamp01(k) * Math.PI); return { lift: 1.3 * e, rArmX: -2.6 * e, lArmX: -2.6 * e, rArmZ: -0.3 * e, lArmZ: 0.3 * e, legs: 0.3 * e }; },
  bounce: (k) => { const e = Math.abs(Math.sin(k * Math.PI * 2)); return { lift: 0.45 * e, rArmZ: -0.3 * e, lArmZ: 0.3 * e }; },
  cough: (k, t) => { const e = bump(k, 0.15); return { lArmX: -2.2 * e, lArmZ: -0.45 * e, bend: (0.12 + 0.1 * Math.abs(Math.sin(t * 16))) * e, headPitch: 0.15 * e, eyesClosed: e > 0.5 }; },
  // pick fruit: the right hand reaches up (to a branch) and comes down (to a basket), twice
  pick: (k) => { const e = bump(k, 0.12); const u = 0.5 - 0.5 * Math.cos(k * Math.PI * 4); return { rArmX: (-1.2 - 1.3 * u) * e, rArmZ: 0.15 * e, headPitch: (-0.25 * u + 0.1 * (1 - u)) * e }; },
  // sow: the left hand holds the seed basket at the hip, the right hand dips into it and flings the grain out
  // forward and to the right in a wide arc, three throws
  sow: (k) => { const e = bump(k, 0.12); const ph = (k * 3) % 1; const th = Math.sin(ph * Math.PI);
    return { rArmX: (-0.7 - 1.2 * th) * e, rArmZ: (0.45 - 0.95 * th) * e, lArmX: -0.75 * e, lArmZ: -0.12 * e, headPitch: (0.12 - 0.2 * th) * e, headYaw: -0.25 * th * e }; },
  // pour from a jug held in the right hand: the arm goes forward and stays there, eyes on the ground (tilt the jug with `bend`)
  pour: (k) => { const e = bump(k, 0.18); return { rArmX: -1.3 * e, rArmZ: 0.12 * e, headPitch: 0.18 * e, gazeY: -1 * e }; },
  offer: (k) => { const e = bump(k, 0.35); return { rArmX: -1.45 * e }; },
  receive: (k) => { const e = smooth(k / 0.35); return { rArmX: -1.5 * e }; },
  think: (k, t) => { const e = bump(k, 0.2); return { rArmX: -2.25 * e, rArmZ: 0.5 * e, rHandX: -0.8 * e, headRoll: 0.16 * e, headPitch: -0.12 * e, gazeY: -1 * e, gazeX: Math.sin(t * 2) * 0.5 * e }; },
  knock: (k, t) => { const e = bump(k, 0.2); const tap = Math.max(0, Math.sin(t * 18)); return { rArmX: (-1.75 + 0.25 * tap) * e, rHandX: (-0.4 - 0.5 * tap) * e }; },
  clap: (k, t) => { const e = bump(k, 0.15); const c = 0.5 + 0.18 * Math.sin(t * 20); return { rArmX: -1.5 * e, lArmX: -1.5 * e, rArmZ: c * e, lArmZ: -c * e }; },
  point: (k) => { const e = bump(k, 0.25); return { rArmX: -1.55 * e, rArmZ: -0.15 * e }; },
  shrug: (k) => { const e = bump(k, 0.3); return { rArmZ: -0.6 * e, lArmZ: 0.6 * e, rArmX: -0.6 * e, lArmX: -0.6 * e, headRoll: 0.18 * e }; },
  look: (k) => ({ headYaw: 0.7 * Math.sin(k * Math.PI * 2) * bump(k, 0.15) }),
  hug: (k) => { const e = bump(k, 0.3); return { rArmX: -1.5 * e, lArmX: -1.5 * e, rArmZ: -0.5 * e, lArmZ: 0.5 * e }; },
  // bring the right hand (with food) to the mouth and chew, three bites
  eat: (k, t) => { const e = bump(k, 0.2); return { rArmX: (-2.05 + 0.12 * Math.max(0, Math.sin(t * 9))) * e, rArmZ: 0.55 * e, rHandX: -0.9 * e, headPitch: 0.06 * Math.abs(Math.sin(t * 9)) * e }; },
  // tired: wipe the brow (right hand by default, "hand": "L" for the left)
  wipe: (k) => { const e = bump(k, 0.25); return { rArmX: -2.5 * e, rArmZ: 0.55 * e - 0.25 * Math.sin(k * Math.PI * 4) * e, rHandX: -0.7 * e, headPitch: -0.1 * e }; },
  // reap with a sickle: bend forward, the right arm sweeps low from side to side (3 strokes)
  reap: (k, t) => { const e = bump(k, 0.15); const sw = Math.sin(k * Math.PI * 6); return { bend: 0.45 * e, headPitch: 0.15 * e, rArmX: -1.2 * e, rArmZ: (0.15 + 0.55 * sw) * e, lArmX: -0.9 * e, lArmZ: -0.2 * e }; },
  // cold: hug yourself and tremble ("Brrr!")
  shiver: (k, t) => { const e = bump(k, 0.15); const tr = Math.sin(t * 38); return { rArmX: -1.25 * e, lArmX: -1.25 * e, rArmZ: (0.72 + 0.05 * tr) * e, lArmZ: (-0.72 - 0.05 * tr) * e, headRoll: 0.05 * tr * e, bend: 0.12 * e, headPitch: 0.1 * e }; },
  // busy hands in front, at the lap (weaving a basket, cutting palm leaves): small alternating strokes
  work: (k, t) => { const e = bump(k, 0.15); const s = Math.sin(t * 9); return { rArmX: (-1.0 + 0.18 * s) * e, lArmX: (-1.0 - 0.18 * s) * e, rArmZ: 0.32 * e, lArmZ: -0.32 * e, rHandX: -0.3 * e, headPitch: 0.22 * e, gazeY: -1 * e }; },
  // cut with a knife held in the right hand ("hand": "L" for a knife in the left): the knife hand makes short strokes
  // down and up through a palm leaf, the other hand holds the leaf still in front, eyes on the work
  cut: (k, t) => { const e = bump(k, 0.15); const st = Math.max(0, Math.sin(t * 8)); return { rArmX: (-1.2 + 0.35 * st) * e, rArmZ: 0.42 * e, rHandX: -0.25 * e, lArmX: -1.0 * e, lArmZ: -0.3 * e, headPitch: 0.22 * e, gazeY: -1 * e }; },
  // hungry: a hand on the tummy, rubbing it, head a bit down
  hungry: (k, t) => { const e = bump(k, 0.2); return { rArmX: -0.95 * e, rArmZ: (0.62 + 0.08 * Math.sin(t * 10)) * e, rHandX: -0.5 * e, headPitch: 0.14 * e }; },
  sniff: (k, t) => { const e = bump(k, 0.2); return { headPitch: (-0.2 + 0.05 * Math.sin(t * 22)) * e, eyesClosed: e > 0.5, rArmX: -1.9 * e, rArmZ: 0.3 * e }; },
};

// ---------- the figure ----------
export function createMinifig(lookIn = {}) {
  const look = resolveLook(lookIn);
  const skin = plastic(look.skin);
  const fabric = look.fabric === true || look.fabric === 'all', fabricCloak = !!look.fabric, fkind = look.fabricKind || 'knit';
  const robe = fabric ? fabricMaterial(look.robe, { kind: fkind }) : plastic(look.robe);
  const legsM = fabric ? fabricMaterial(look.legs || look.robe, { kind: fkind }) : plastic(look.legs || look.robe);

  const root = new THREE.Group(); root.name = 'minifig'; root.userData.minifig = true;
  const body = new THREE.Group(); root.add(body);
  const S = look.scale || 1;
  body.scale.setScalar(S);
  const shadowy = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

  // "style": "blocky" → a blocky town avatar (square head, box torso, box arms with square hands, box legs):
  // same joints, heights and grip points as the minifig, so gestures, holding, cameras and checks all work unchanged
  const blocky = look.style === 'blocky';
  const BK = { torsoW: 1.42, torsoD: 0.72, armW: 0.4, armD: 0.44, armTop: 0.26, armLen: 1.32, handH: 0.28, legW: 0.69, legD: 0.72, headW: 1.0, headH: 0.9, headD: 0.92 };

  // hips + legs
  const hips = shadowy(new THREE.Mesh(blocky ? new THREE.BoxGeometry(BK.torsoW - 0.04, 0.22, BK.legD - 0.04) : new THREE.BoxGeometry(1.5, 0.22, D.legD), legsM));
  hips.position.y = D.hipY + 0.02; body.add(hips); hips.userData.bodyPart = 'hips';
  const legs = {};
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * 0.37, D.hipY, 0);
    if (blocky) {
      // straight box leg down to the ground (no foot), a darker shoe block at the bottom
      pivot.position.x = sx * BK.torsoW / 4;
      const leg = shadowy(new THREE.Mesh(new THREE.BoxGeometry(BK.legW, D.hipY - 0.3, BK.legD), legsM));
      leg.position.y = -(D.hipY - 0.3) / 2 + 0.02; leg.userData.bodyPart = 'leg';
      const shoe = shadowy(new THREE.Mesh(new THREE.BoxGeometry(BK.legW + 0.02, 0.3, BK.legD + 0.04), plastic(look.shoes || 'darkBrown')));
      shoe.position.y = -D.hipY + 0.17;
      pivot.add(leg, shoe); body.add(pivot); legs[side] = pivot;
      continue;
    }
    const leg = shadowy(new THREE.Mesh(new THREE.BoxGeometry(D.legW, D.legH, D.legD), legsM));
    leg.position.y = -D.legH / 2 + 0.05; leg.userData.bodyPart = 'leg';
    const foot = shadowy(new THREE.Mesh(new THREE.BoxGeometry(D.legW, 0.32, 0.2), legsM));
    foot.position.set(0, -D.legH + 0.21, D.legD / 2 + 0.06);
    pivot.add(leg, foot); body.add(pivot); legs[side] = pivot; pivot.userData.foot = foot;
  }
  // monk robe skirt hanging over the upper legs
  if ((look.print === 'robe' || look.skirt) && look.robeLong && !blocky) {
    // a long robe (rasă) falling to the feet: a flared skirt from the hips to just above the ground, + a hem
    const sk = new THREE.CylinderGeometry(0.86, 1.12, D.hipY - 0.12, 4, 1, true, Math.PI / 4); sk.scale(1.12, 1, 0.68);
    const skirt = shadowy(new THREE.Mesh(sk, fabric ? fabricMaterial(look.robe, { kind: fkind, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ color: color(look.robe), roughness: 0.4, side: THREE.DoubleSide })));
    skirt.position.y = (D.hipY + 0.12) / 2 + 0.04; body.add(skirt); skirt.userData.bodyPart = 'robe';
  } else if (look.print === 'robe' || look.skirt) {
    const sk = new THREE.CylinderGeometry(0.86, blocky ? 0.9 : 1.0, 0.85, 4, 1, true, Math.PI / 4);
    if (blocky) sk.scale((BK.torsoW + 0.1) / (0.86 * Math.SQRT2), 1, (BK.legD + 0.14) / (0.86 * Math.SQRT2));
    else sk.scale(1.12, 1, 0.66);
    const skirt = shadowy(new THREE.Mesh(sk, new THREE.MeshStandardMaterial({ color: color(look.robe), roughness: 0.4, side: THREE.DoubleSide })));
    skirt.position.y = D.hipY - 0.3; body.add(skirt); skirt.userData.bodyPart = 'robe';
  }

  // seated, a long robe (robeLong) falls over the knees: a fabric drape over the thighs and down the front of the shins
  let lap = null;
  if (look.robeLong && (look.print === 'robe' || look.skirt) && !blocky) {
    lap = new THREE.Group(); lap.visible = false; body.add(lap);
    const lm = fabric ? fabricMaterial(look.robe, { kind: fkind }) : plastic(look.robe);
    // the top: a cloth sheet over the thighs from the waist to the knees, its front edge meeting the curtain below
    const tg = new THREE.PlaneGeometry(1, 1, 32, 6), tp = tg.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const u = tp.getX(i) * 2, v = tp.getY(i) + 0.5, th = u * 1.2, zf = 1.52 + (Math.cos(th) - 1) * 0.92 * 0.75;
      tp.setXYZ(i, Math.sin(th) * 0.92, D.hipY + 0.5 + Math.sin(v * Math.PI) * 0.03, 0.05 + v * (zf - 0.05));
    }
    tg.computeVertexNormals();
    const top = shadowy(new THREE.Mesh(tg, fabric ? fabricMaterial(look.robe, { kind: fkind, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ color: color(look.robe), roughness: 0.5, side: THREE.DoubleSide }))); lap.add(top);
    // the front: a curtain wrapping round the knees and falling to the ground (over the front of the seat), in soft folds;
    // its length follows the seat height (set in update)
    const cg = new THREE.PlaneGeometry(1, 1, 32, 12), cp = cg.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const u = cp.getX(i) * 2, v = 0.5 - cp.getY(i), th = u * 1.2, R = 0.92 + v * 0.5 * Math.min(1, v * 3);
      cp.setXYZ(i, Math.sin(th) * R, -v, (Math.cos(th) - 1) * R * 0.75 + v * 0.3 + Math.sin(u * 10.5) * 0.07 * (0.25 + v));
    }
    cg.computeVertexNormals();
    const front = shadowy(new THREE.Mesh(cg, fabric ? fabricMaterial(look.robe, { kind: fkind, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ color: color(look.robe), roughness: 0.5, side: THREE.DoubleSide })));
    front.position.set(0, D.hipY + 0.5, 1.52); lap.add(front); lap.userData.front = front;
  }

  // torso (bends at the waist for bows)
  const waist = new THREE.Group(); waist.position.y = D.torsoBottom; body.add(waist);
  const torsoMats = [robe, robe, robe, robe, fabric ? fabricMaterial(null, { kind: fkind, map: drawTorso(look) }) : new THREE.MeshStandardMaterial({ map: drawTorso(look), roughness: 0.32 }), robe];
  const torso = shadowy(new THREE.Mesh(blocky ? new THREE.BoxGeometry(BK.torsoW, D.torsoH, BK.torsoD) : torsoGeometry(), torsoMats));
  torso.position.y = D.torsoH / 2; waist.add(torso); torso.userData.bodyPart = 'torso';
  // a tied cord belt (brâu de funie) in 3D: a ring round the waist with a knot and two hanging ends; `cord` = colour
  if (look.cord && !blocky && look.cordLong) {
    // `cordLong: true`: a thick braided rope belt (two strands wound round each other), a big knot at the front and two
    // long braided ends hanging to the knees, each with two small knots and a frayed tassel
    const c1 = plastic(look.cord), c2 = new THREE.MeshStandardMaterial({ color: new THREE.Color(color(look.cord)).multiplyScalar(0.72), roughness: 0.6 });
    const strand = (pts, m, r = 0.045) => shadowy(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 3, r, 6, false), m));
    for (let k = 0; k < 2; k++) {
      const pts = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2, w = a * 14 + k * Math.PI; pts.push(new THREE.Vector3(Math.sin(a) * (0.8 + 0.03 * Math.cos(w)), 0.16 + 0.035 * Math.sin(w), Math.cos(a) * (0.45 + 0.03 * Math.cos(w)))); }
      waist.add(strand(pts, k ? c2 : c1));
    }
    const knot = shadowy(new THREE.Mesh(new THREE.TorusKnotGeometry(0.09, 0.045, 32, 6, 2, 3), c1)); knot.position.set(0.22, 0.13, 0.48); waist.add(knot);
    for (const [x, l, sw] of [[0.16, 1.15, -0.04], [0.32, 0.95, 0.05]]) {
      for (let k = 0; k < 2; k++) {
        const pts = []; for (let i = 0; i <= 20; i++) { const v = i / 20, w = v * 22 + k * Math.PI; pts.push(new THREE.Vector3(x + 0.03 * Math.cos(w) + sw * v, 0.1 - v * l, 0.5 + 0.03 * Math.sin(w) + 0.04 * v)); }
        waist.add(strand(pts, k ? c2 : c1, 0.035));
      }
      for (const v of [0.45, 0.8]) { const kn = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), c1)); kn.scale.set(1, 0.8, 1); kn.position.set(x + sw * v, 0.1 - v * l, 0.5 + 0.04 * v); waist.add(kn); }
      const tas = shadowy(new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 8, 1, true), c2)); tas.position.set(x + sw, 0.1 - l - 0.1, 0.54); waist.add(tas);
    }
  } else if (look.cord && !blocky) {
    const cm2 = plastic(look.cord);
    const ring = shadowy(new THREE.Mesh(new THREE.TorusGeometry(1, 0.07, 6, 28), cm2)); ring.rotation.x = Math.PI / 2; ring.scale.set(0.8, 0.44, 1); ring.position.y = 0.16; waist.add(ring);
    const knot = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), cm2)); knot.position.set(0.25, 0.14, 0.44); waist.add(knot);
    for (const [x, l] of [[0.2, 0.75], [0.33, 0.6]]) {
      const end = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, l, 6), cm2)); end.position.set(x, 0.14 - l / 2, 0.47); waist.add(end);
      const tip = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), cm2)); tip.position.set(x, 0.14 - l, 0.47); waist.add(tip);
    }
  }
  // `vest3d: true` (with `vest` = colour): a shaggy sheepskin vest in 3D over the torso — sides and back of woolly cloth, two
  // front panels open in the middle, a thick fringed hem at the bottom
  if (look.vest3d && look.vest && !blocky) {
    const vm = fabricMaterial(look.vest, { kind: 'shaggy', side: THREE.DoubleSide });
    const ac = canvas(64, 64), ag = ac.getContext('2d'); ag.fillStyle = '#fff'; ag.fillRect(0, 0, 64, 64); ag.fillStyle = '#000';
    ag.beginPath(); ag.moveTo(20, 64); ag.lineTo(26, 30); ag.lineTo(21, 0); ag.lineTo(43, 0); ag.lineTo(38, 30); ag.lineTo(44, 64); ag.fill(); // the open front (the shirt shows)
    const alpha = new THREE.CanvasTexture(ac);
    const fm = fabricMaterial(look.vest, { kind: 'shaggy', side: THREE.DoubleSide }); fm.alphaMap = alpha; fm.alphaTest = 0.5;
    const hidden = new THREE.MeshBasicMaterial({ visible: false });
    const vg = torsoGeometry(); vg.scale(1.08, 1.0, 1.16);
    const vest = shadowy(new THREE.Mesh(vg, [vm, vm, hidden, hidden, fm, vm])); vest.position.y = D.torsoH / 2 - 0.02; waist.add(vest); vest.userData.bodyPart = 'torso';
    for (let i = 0; i < 18; i++) { // the woolly hem
      const a = i / 18; const x = (a - 0.5) * D.torsoWB * 1.08, front = Math.abs(x) > 0.3;
      for (const z of front ? [D.torsoD * 0.58] : []) { const tf = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), vm)); tf.scale.set(1, 1.4, 0.8); tf.position.set(x, 0.02, z); waist.add(tf); }
      const bk = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), vm)); bk.scale.set(1, 1.4, 0.8); bk.position.set(x, 0.02, -D.torsoD * 0.58); waist.add(bk);
    }
  }
  // shoulder bag (traistă) of a pilgrim: hangs at the front of the left hip (its strap is printed across the chest); `bag` = colour
  if (look.bag) {
    const bm = plastic(look.bag);
    const bag = shadowy(new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.56, 0.26, 2, 0.06), bm));
    bag.position.set(blocky ? 0.5 : 0.52, 0.02, (blocky ? BK.torsoD : D.torsoD) / 2 + 0.2); bag.rotation.y = 0.25; waist.add(bag);
    const flap = shadowy(new THREE.Mesh(new RoundedBoxGeometry(0.64, 0.3, 0.06, 1, 0.025), plastic(look.bagFlap || 'darkBrown')));
    flap.position.set(0, 0.16, 0.14); bag.add(flap);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), plastic('gold')); knob.position.set(0, 0.03, 0.18); bag.add(knob);
  }
  // mantle (himation / haină) hanging from the shoulders down the back: "cloak": true, "cloakColor"
  if (look.cloak && blocky) {
    const cm = new THREE.MeshStandardMaterial({ color: color(look.cloakColor || 'blue'), roughness: 0.55 });
    const cape = shadowy(new THREE.Mesh(new THREE.BoxGeometry(BK.torsoW + 0.1, 2.2, 0.1), cm));
    cape.position.set(0, D.torsoH - 1.1 + 0.04, -BK.torsoD / 2 - 0.07); cape.rotation.x = 0.05; waist.add(cape);
  } else if (look.cloak) {
    const cm = fabricCloak ? fabricMaterial(look.cloakColor || 'blue', { kind: look.cloakKind || fkind, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ color: color(look.cloakColor || 'blue'), roughness: 0.55, side: THREE.DoubleSide });
    // cylinder theta 0 = +Z: centre the open sheet on the back (PI)
    const cg = new THREE.CylinderGeometry(0.78, 1.05, 2.25, 24, 1, true, Math.PI * 0.6, Math.PI * 0.8);
    cg.scale(1, 1, 0.72);
    const cape = shadowy(new THREE.Mesh(cg, cm));
    cape.position.set(0, D.torsoH - 2.25 / 2 + 0.06, -0.08); waist.add(cape);
    // collar resting on the shoulders, open at the front
    const col = new THREE.CylinderGeometry(0.42, 0.86, 0.3, 24, 1, true, Math.PI * 0.32, Math.PI * 1.36);
    col.scale(1, 1, 0.62);
    const collar = shadowy(new THREE.Mesh(col, cm));
    collar.position.set(0, D.torsoH + 0.02, -0.02); waist.add(collar);
    if (look.cape) {
      // a short shoulder cape (pelerină) over both shoulders and the tops of the arms, open in front
      const big = look.cloakKind === 'shaggy'; // a big wool mantle: down over the upper arms
      const pg = new THREE.SphereGeometry(big ? 1.1 : 1.05, 28, 10, Math.PI / 2 + 0.42, Math.PI * 2 - 0.84, Math.PI * 0.16, Math.PI * (big ? 0.36 : 0.32));
      pg.scale(1, big ? 0.72 : 0.6, big ? 0.74 : 0.66);
      const pc = shadowy(new THREE.Mesh(pg, cm)); pc.position.set(0, D.torsoH - 0.36, -0.02); waist.add(pc);
      if (big) { // a ragged woolly hem: little tufts hanging from the edge of the mantle
        const tg = new THREE.ConeGeometry(0.07, 0.22, 5); tg.rotateX(Math.PI);
        const th1 = Math.PI * 0.52, R = 1.1;
        for (let i = 0; i <= 44; i++) {
          const ph = Math.PI / 2 + 0.42 + (Math.PI * 2 - 0.84) * i / 44;
          const x = -Math.cos(ph) * Math.sin(th1) * R, y = Math.cos(th1) * R * 0.72, z = Math.sin(ph) * Math.sin(th1) * R * 0.74;
          const tf = new THREE.Mesh(tg, cm); tf.position.set(x, D.torsoH - 0.36 + y - 0.06 - (i % 3) * 0.03, z - 0.02); tf.rotation.z = ((i * 37) % 7 - 3) * 0.06; tf.scale.y = 0.8 + (i % 4) * 0.15; pc.parent.add(shadowy(tf));
        }
      }
      // the two front edges of the mantle coming down the chest
      for (const sx of [-1, 1]) { const f = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.3, D.torsoH - 0.05, 0.07), cm)); f.position.set(sx * 0.58, D.torsoH / 2, D.torsoD / 2 + 0.04); f.rotation.z = sx * 0.13; waist.add(f); }
    }
  }

  // arms
  const arms = {}, hands = {}, holds = {};
  for (const [side, sx] of [['L', 1], ['R', -1]]) {
    if (blocky) {
      // box arm hanging from the top corner of the torso (pivot inside the upper arm), sleeve + square skin hand
      const sh = new THREE.Group(); sh.position.set(sx * (BK.torsoW / 2 + BK.armW / 2 + 0.02), D.torsoH - BK.armTop, 0);
      const sleeveH = BK.armLen - BK.handH;
      const arm = shadowy(new THREE.Mesh(new THREE.BoxGeometry(BK.armW, sleeveH, BK.armD), robe));
      arm.position.y = BK.armTop - sleeveH / 2; arm.userData.bodyPart = 'arm'; sh.add(arm);
      const wrist = new THREE.Group(); wrist.position.set(0, BK.armTop - sleeveH, 0.04);
      const hand = shadowy(new THREE.Mesh(new THREE.BoxGeometry(BK.armW - 0.04, BK.handH, BK.armD - 0.08), skin));
      hand.position.set(0, -BK.handH / 2 - 0.005, -0.04); hand.userData.bodyPart = 'hand';
      const hold = new THREE.Group(); hold.position.set(0, -0.2, 0.1); // grip point: in front of the square hand
      wrist.add(hand, hold); sh.add(wrist);
      waist.add(sh);
      arms[side] = sh; hands[side] = wrist; holds[side] = hold;
      continue;
    }
    const sh = new THREE.Group(); sh.position.set(sx * D.shoulderX, D.shoulderY - D.torsoBottom, 0);
    const armGeo = new THREE.CylinderGeometry(0.22, 0.25, D.armLen, 10);
    const arm = shadowy(new THREE.Mesh(armGeo, robe));
    arm.position.set(sx * 0.1, -D.armLen / 2 + 0.08, 0.02); arm.rotation.z = sx * 0.12;
    const shoulderBall = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), robe));
    arm.userData.bodyPart = 'arm'; sh.add(arm, shoulderBall);
    const wrist = new THREE.Group(); wrist.position.set(sx * 0.2, -D.armLen + 0.02, 0.12);
    const hand = shadowy(new THREE.Mesh(handGeometry(), skin));
    hand.position.set(0, -0.12, 0.05); hand.userData.bodyPart = 'hand';
    const hold = new THREE.Group(); hold.position.set(0, -0.16, 0.06); // grip point
    wrist.add(hand, hold); sh.add(wrist);
    sh.rotation.z = sx * 0.06;
    waist.add(sh);
    arms[side] = sh; hands[side] = wrist; holds[side] = hold;
  }

  // head
  const neck = new THREE.Group(); neck.position.y = D.neckY - D.torsoBottom; waist.add(neck);
  if (blocky) neck.position.y = D.torsoH;
  else {
    const neckM = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 12), skin));
    neckM.position.y = 0.04; neck.add(neckM);
  }
  const head = new THREE.Group(); head.position.y = blocky ? 0.03 : 0.12; neck.add(head);
  const headH = blocky ? BK.headH : D.headH;
  const headFront = blocky ? BK.headD / 2 : D.headR;
  const headY = headH / 2;
  const headMesh = shadowy(new THREE.Mesh(blocky ? new RoundedBoxGeometry(BK.headW, BK.headH, BK.headD, 3, 0.17) : new THREE.CylinderGeometry(D.headR, D.headR, D.headH, 28), skin));
  headMesh.position.y = headY; head.add(headMesh); headMesh.userData.bodyPart = 'head';
  if (!blocky) {
    const studM = shadowy(new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.33, 0.2, 16), skin));
    studM.position.y = D.headH + 0.1; head.add(studM);
    if (look.hat === 'cowl') studM.visible = false; // under the cowl
  }
  // face decal on the front half of the head (blocky: a flat decal on the front face, central part of the print)
  const faceCanvas = canvas(512, 256);
  const faceTex = new THREE.CanvasTexture(faceCanvas); faceTex.colorSpace = THREE.SRGBColorSpace; faceTex.anisotropy = 4;
  let faceGeo;
  if (blocky) {
    faceGeo = new THREE.PlaneGeometry(BK.headW * 0.9, BK.headH * 0.94);
    const uv = faceGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 0.21 + uv.getX(i) * 0.58);
    faceGeo.translate(0, 0, headFront + 0.004);
  } else faceGeo = new THREE.CylinderGeometry(D.headR + 0.006, D.headR + 0.006, D.headH * 0.94, 32, 1, true, -Math.PI * 0.45, Math.PI * 0.9);
  const face = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ map: faceTex, transparent: true, roughness: 0.32, depthWrite: false }));
  face.position.y = headY; head.add(face);
  const headTop = new THREE.Object3D(); headTop.position.y = headH + 0.2; head.add(headTop);
  const faceAnchor = new THREE.Object3D(); faceAnchor.position.set(0, headY, headFront); head.add(faceAnchor);

  // hair / headwear
  const hatM = plastic(look.hatColor || 'black');
  const addHat = (mesh, y) => { mesh.position.y = y; head.add(shadowy(mesh)); return mesh; };
  // wide-brimmed straw hat (pălărie de paie) of a ploughman: woven brim + crown + a dark band; `hatColor`, `bandColor`
  function strawHat(r, y) {
    const sm = plastic(look.hatColor || 'yellow');
    const tex = (() => { const c = canvas(128, 32), x = c.getContext('2d'); x.fillStyle = hex(look.hatColor || 'yellow'); x.fillRect(0, 0, 128, 32);
      x.strokeStyle = 'rgba(120,80,10,0.35)'; x.lineWidth = 2; for (let i = 0; i < 128; i += 6) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 3, 32); x.stroke(); }
      for (let j = 4; j < 32; j += 7) { x.beginPath(); x.moveTo(0, j); x.lineTo(128, j); x.stroke(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.repeat.x = 4; return t; })();
    const wm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    // brim: a lathe profile, thick at the crown and drooping a little at the edge
    const bp = [[r * 0.98, 0.1], [r * 1.6, 0.04], [r * 2.05, -0.14], [r * 2.12, -0.2], [r * 2.08, -0.28], [r * 1.6, -0.12], [r * 0.98, -0.08]].map(([a, c]) => new THREE.Vector2(a, c));
    const brim = addHat(new THREE.Mesh(new THREE.LatheGeometry(bp, 32), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide })), y);
    brim.rotation.x = -0.04; brim.castShadow = false;
    const crown = addHat(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.98, r * 1.2, 0.62, 24), [wm, sm, sm]), y + 0.34);
    void crown;
    addHat(new THREE.Mesh(new THREE.CylinderGeometry(r * 1.17, r * 1.2, 0.2, 24), plastic(look.bandColor || 'reddishBrown')), y + 0.14);
  }
  if (blocky) {
    // blocky headwear: rounded slabs around the square head (never over the eyes)
    const W = BK.headW, H = BK.headH, Dd = BK.headD;
    const slab = (w, h, d, m, x, y, z, r = 0.06) => { const o = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, h / 2 - 0.001, w / 2 - 0.001, d / 2 - 0.001)), m); o.position.set(x, y, z); head.add(shadowy(o)); return o; };
    if (look.hair && look.hat !== 'hood' && look.hat !== 'headscarf') {
      const hairM = plastic(look.hairColor || 'brown');
      slab(W + 0.1, 0.26, Dd + 0.1, hairM, 0, H - 0.06, 0, 0.1);
      slab(W + 0.1, look.hair === 'long' ? 1.25 : 0.62, 0.16, hairM, 0, look.hair === 'long' ? H - 0.68 : H - 0.36, -Dd / 2 - 0.04);
      if (look.hair === 'long') for (const sx of [-1, 1]) slab(0.16, 1.0, Dd * 0.55, hairM, sx * (W / 2 + 0.04), H - 0.55, -Dd * 0.2);
    }
    if (look.hat === 'straw') strawHat(W * 0.56, H + 0.02);
    if (look.hat === 'skufia') slab(W + 0.1, 0.3, Dd + 0.1, hatM, 0, H - 0.01, 0, 0.12);
    else if (look.hat === 'kamilavka') slab(W + 0.14, 0.56, Dd + 0.14, hatM, 0, H + 0.16, 0, 0.04);
    else if (look.hat === 'hood' || look.hat === 'headscarf' || look.hat === 'turban') {
      // open at the face: top, both sides and a drape down the back
      slab(W + 0.26, 0.18, Dd + 0.2, hatM, 0, H + 0.07, -0.02);
      for (const sx of [-1, 1]) slab(0.13, H + 0.12, Dd + 0.16, hatM, sx * (W / 2 + 0.07), headY + 0.02, -0.04);
      slab(W + 0.26, look.hat === 'hood' ? H + 0.75 : H + 0.3, 0.13, hatM, 0, look.hat === 'hood' ? headY - 0.3 : headY - 0.08, -Dd / 2 - 0.08);
      if (look.hat === 'headscarf') slab(W + 0.3, 0.12, Dd + 0.24, plastic(look.bandColor || 'blue'), 0, H - 0.06, -0.02, 0.04);
    }
  } else if (look.hair && look.hat !== 'hood' && look.hat !== 'headscarf') {
    const hairM = plastic(look.hairColor || 'brown');
    const hg = new THREE.SphereGeometry(D.headR + 0.08, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const hair = addHat(new THREE.Mesh(hg, hairM), headY + 0.2);
    hair.scale.set(1, 0.95, 1.02);
    const back = new THREE.Mesh(new THREE.CylinderGeometry(D.headR + 0.07, D.headR + 0.07, 0.5, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8), hairM);
    back.material = new THREE.MeshStandardMaterial({ color: color(look.hairColor || 'brown'), roughness: 0.35, side: THREE.DoubleSide });
    addHat(back, headY + 0.02);
    if (look.hair === 'curly') {
      // a mop of glossy curls (păr creț): little bumps all over the cap, a fringe of curls over the forehead, curls over the ears
      hair.visible = false;
      const cm = new THREE.MeshStandardMaterial({ color: color(look.hairColor || 'brown'), roughness: 0.3 });
      const dk = new THREE.MeshStandardMaterial({ color: new THREE.Color(color(look.hairColor || 'brown')).multiplyScalar(0.72), roughness: 0.35 });
      const cap = new THREE.Mesh(new THREE.SphereGeometry(D.headR + 0.06, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), dk); cap.scale.set(1, 0.95, 1.02); addHat(cap, headY + 0.2);
      const curl = new THREE.SphereGeometry(0.15, 10, 8);
      const N = 64;
      for (let i = 0; i < N; i++) {
        const yy = 1 - (i + 0.5) / N * 1.05, rad = Math.sqrt(Math.max(0, 1 - yy * yy)), th = i * 2.39996;
        const nx = Math.cos(th) * rad, nz = Math.sin(th) * rad;
        if (nz > 0.45 && yy < 0.42) continue; // keep the face free (front, below the fringe)
        const R1 = D.headR + 0.17 + ((i * 7) % 5) * 0.012;
        const m = new THREE.Mesh(curl, i % 3 ? cm : dk);
        m.position.set(nx * R1, headY + 0.2 + Math.max(-0.12, yy) * (D.headR + 0.06) * 0.95, nz * R1 * 1.02);
        m.lookAt(m.position.x * 3, (m.position.y - headY) * 3 + headY, m.position.z * 3); m.scale.set(1.25, 1.05, 0.75 + (i % 3) * 0.1);
        head.add(shadowy(m));
      }
      for (let k = 0; k < 7; k++) { // the fringe
        const a = -0.62 + k * 0.2, m = new THREE.Mesh(curl, k % 2 ? cm : dk);
        m.position.set(Math.sin(a) * (D.headR + 0.12), D.headH - 0.04 - Math.abs(k - 3) * 0.04, Math.cos(a) * (D.headR + 0.12)); m.rotation.set(-0.5, a, 0); m.scale.set(1.3, 1.1, 0.8); head.add(shadowy(m));
      }
      for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) { // over the ears
        const m = new THREE.Mesh(curl, k % 2 ? cm : dk); m.position.set(sx * (D.headR + 0.13), D.headH * 0.66 - k * 0.2, -0.1 - k * 0.1); m.scale.set(0.8, 1.2, 1.2); head.add(shadowy(m));
      }
    }
    if (look.hair === 'long') {
      // shoulder-length hair falling behind the ears onto the back
      const lg = new THREE.CylinderGeometry(D.headR + 0.08, D.headR + 0.2, 0.95, 20, 1, true, Math.PI * 0.55, Math.PI * 0.9);
      const long = new THREE.Mesh(lg, back.material);
      addHat(long, headY - 0.5);
    }
  }
  if (blocky) { /* headwear built above */ } else if (look.hat === 'skufia') {
    const g = new THREE.SphereGeometry(D.headR + 0.07, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const m = addHat(new THREE.Mesh(g, hatM), D.headH * 0.86); m.scale.set(1, 0.72, 1);
    const rim = addHat(new THREE.Mesh(new THREE.CylinderGeometry(D.headR + 0.075, D.headR + 0.075, 0.14, 24), hatM), D.headH * 0.88);
    void rim;
  } else if (look.hat === 'kamilavka') {
    addHat(new THREE.Mesh(new THREE.CylinderGeometry(D.headR + 0.1, D.headR + 0.06, 0.62, 24), hatM), D.headH * 1.08);
  } else if (look.hat === 'hood') {
    // monastic hood: covers top, sides and back, open at the face
    // sphere opening centred on phi = PI/2 (= +Z, the face side)
    const hood = new THREE.SphereGeometry(D.headR + 0.14, 24, 16, Math.PI * 0.85, Math.PI * 1.3, 0, Math.PI * 0.6);
    const m = new THREE.Mesh(hood, new THREE.MeshStandardMaterial({ color: color(look.hatColor || 'black'), roughness: 0.4, side: THREE.DoubleSide }));
    m.scale.set(1, 1.1, 1); addHat(m, headY + 0.1);
    // drape behind the head (cylinder theta 0 = +Z, so centre the arc on PI)
    const drape = new THREE.Mesh(new THREE.CylinderGeometry(D.headR + 0.14, D.headR + 0.3, 0.75, 24, 1, true, Math.PI * 0.45, Math.PI * 1.1),
      new THREE.MeshStandardMaterial({ color: color(look.hatColor || 'black'), roughness: 0.4, side: THREE.DoubleSide }));
    addHat(drape, headY - 0.22);
  } else if (look.hat === 'cowl') {
    // deep monastic cowl (koukoulion / glugă) standing off the head: a big rounded hood with a thick front rim round the
    // face, falling at the back onto the shoulders
    const cm = fabricCloak ? fabricMaterial(look.hatColor || 'black', { kind: fkind, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ color: color(look.hatColor || 'black'), roughness: 0.5, side: THREE.DoubleSide });
    const R0 = D.headR + 0.3;
    const hood = new THREE.Mesh(new THREE.SphereGeometry(R0, 28, 18, Math.PI * 0.8, Math.PI * 1.4, 0, Math.PI * 0.62), cm);
    hood.scale.set(1, 1.15, 1.08); addHat(hood, headY + 0.1);
    // the cowl's front comes over the top of the head down to the brows (a cap over the forehead)
    const brow = new THREE.Mesh(new THREE.SphereGeometry(R0 - 0.06, 28, 10, 0, Math.PI * 2, 0, Math.PI * 0.3), cm);
    brow.scale.set(1, 1.05, 1.1); addHat(brow, headY + 0.32);
    // down over the forehead to the brows, ending in a soft rolled edge
    const band = new THREE.Mesh(new THREE.SphereGeometry(D.headR + 0.1, 28, 8, -Math.PI * 0.1, Math.PI * 1.2, Math.PI * 0.26, Math.PI * 0.2), cm);
    band.scale.set(1, 1.25, 1.05); addHat(band, D.headH - 0.32);
    const roll = new THREE.Mesh(new THREE.TorusGeometry(D.headR + 0.06, 0.06, 8, 28, Math.PI * 1.1), cm);
    roll.rotation.set(Math.PI / 2, 0, -Math.PI * 0.05); roll.scale.set(1, 1.05, 1); addHat(roll, D.headH - 0.2);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R0 * 0.93, 0.17, 10, 28, Math.PI * 1.25), cm);
    rim.rotation.z = -Math.PI * 0.125; rim.scale.set(0.95, 1.12, 1); rim.position.z = 0.32; addHat(rim, headY + 0.05);
    const drape = new THREE.Mesh(new THREE.CylinderGeometry(R0, R0 + 0.32, 1.0, 28, 1, true, Math.PI * 0.4, Math.PI * 1.2), cm);
    drape.scale.z = 0.95; addHat(drape, headY - 0.45);
    if (look.fringe) {
      // `fringe: true`: tufts of hair (hairColor) peeping out under the cowl over the forehead and at the temples
      const fm = new THREE.MeshStandardMaterial({ color: color(look.hairColor || 'brown'), roughness: 0.35 });
      for (let k = 0; k < 9; k++) {
        const a = -0.85 + k * 0.21, lk = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.28, 6), fm);
        lk.position.set(Math.sin(a) * (D.headR + 0.11), D.headH - 0.25 + Math.abs(k - 4) * 0.012 - (k % 2) * 0.04, Math.cos(a) * (D.headR + 0.11));
        lk.rotation.set(Math.PI - 0.45, a, (k - 4) * 0.12); head.add(shadowy(lk));
      }
    }
  } else if (look.hat === 'straw') {
    strawHat(D.headR, headY + 0.36);
  } else if (look.hat === 'headscarf') {
    const g = new THREE.SphereGeometry(D.headR + 0.1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const m = addHat(new THREE.Mesh(g, hatM), headY + 0.2); m.scale.set(1.02, 1.0, 1.04);
    addHat(new THREE.Mesh(new THREE.CylinderGeometry(D.headR + 0.12, D.headR + 0.12, 0.16, 24), plastic(look.bandColor || 'blue')), headY + 0.34);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.12), hatM);
    tail.position.set(0, headY - 0.2, -D.headR - 0.06); head.add(shadowy(tail));
  } else if (look.hat === 'turban') {
    // a wrapped head cloth (turban / sarık of a village man): a soft cap with fat wraps wound round it, crossing over the
    // forehead, a striped band (`bandColor`), and the loose end of the cloth falling behind onto the left shoulder
    const tm = fabricMaterial ? fabricMaterial(look.hatColor || 'tan', { kind: 'knit', side: THREE.DoubleSide }) : hatM;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(D.headR + 0.1, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), tm); cap.scale.set(1.04, 1.05, 1.06); addHat(cap, headY + 0.2);
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(D.headR + 0.13 - i * 0.07, 0.13 - i * 0.015, 10, 30), tm);
      w.rotation.set(Math.PI / 2 + (i % 2 ? -0.22 : 0.2), 0, i * 0.7); w.scale.set(1, 1.04, 1); addHat(w, headY + 0.32 + i * 0.17);
    }
    const band = new THREE.Mesh(new THREE.TorusGeometry(D.headR + 0.2, 0.035, 6, 30), plastic(look.bandColor || 'reddishBrown'));
    band.rotation.x = Math.PI / 2 + 0.2; addHat(band, headY + 0.36);
    const tailG = new THREE.Group(); tailG.position.set(-0.32, headY + 0.25, -D.headR - 0.02); tailG.rotation.set(-0.25, 0, 0.35); head.add(tailG);
    const tl = shadowy(new THREE.Mesh(new THREE.BoxGeometry(0.55, 1.05, 0.12), tm)); tl.position.y = -0.5; tailG.add(tl);
    if (look.turbanFull) {
      // `turbanFull: true`: a big wound turban — more fat folds crossing over the forehead in both directions, a second
      // striped cloth, a knot on top, the long loose end with a fringe hanging over the left shoulder
      const tm2 = fabricMaterial(look.bandColor || '#8a5a32', { kind: 'knit', side: THREE.DoubleSide });
      // each fold: a ring round the head, tipped forward/back a little (`tilt`) and turned (`yaw`), so the folds cross in front
      [[0.22, 0.4, 0.6, 0.12, tm], [-0.2, 0.54, -0.7, 0.11, tm], [0.16, 0.66, 1.9, 0.1, tm2], [-0.14, 0.36, 2.6, 0.1, tm]].forEach(([tilt, y, yaw, r, m]) => {
        const wg = new THREE.Group(); wg.rotation.y = yaw; addHat(wg, headY + y);
        const w = new THREE.Mesh(new THREE.TorusGeometry(D.headR + 0.17 - (y - 0.4) * 0.25, r, 10, 32), m); w.rotation.x = Math.PI / 2 + tilt; wg.add(shadowy(w));
      });
      const top = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), tm); top.scale.set(1.4, 0.6, 1.2); addHat(top, headY + 0.8);
      tl.scale.set(1.1, 1.35, 1); tl.position.y = -0.66;
      for (let i = 0; i < 6; i++) { const fr = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.05), tm2); fr.position.set(-0.24 + i * 0.096, -1.42, 0); tailG.add(fr); }
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.07, 0.14), tm2); stripe.position.y = -1.2; tailG.add(stripe);
    }
  }

  // long beard (3D) hanging below the chin over the chest; short beards are only printed
  if (look.beard === 'long' && blocky) {
    const beard = shadowy(new THREE.Mesh(new RoundedBoxGeometry(0.72, 0.8, 0.22, 2, 0.08), plastic(look.beardColor || 'white')));
    beard.position.set(0, -0.32, BK.torsoD / 2 + 0.13); beard.rotation.x = -0.1;
    head.add(beard);
  } else if (look.beard === 'flowing') {
    // a detailed elder's beard built from locks: whiskers down both cheeks, a full chin, two layers of tapered locks with
    // grooves (the back layer a shade darker), and a 3D moustache with curled ends — the mouth stays visible.
    // `beardShape`: 'round' (default) | 'forked' (two points) | 'pointed' (one point) | 'wavy' (locks with curling tips) |
    // 'full' (a big wide beard: two layers of wavy locks and whiskers up the cheeks);
    // `beardLength` 0.6..1.4. Pure geometry, no state.
    const bc = new THREE.Color(color(look.beardColor || 'white'));
    const mat = (k) => { const c = bc.clone().multiplyScalar(k); return new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, emissive: c, emissiveIntensity: 0.14 }); };
    const light = mat(1), mid = mat(0.86), dark = mat(0.7);
    const L = look.beardLength ?? 1, shape = look.beardShape || 'round';
    const beardG = new THREE.Group(); beardG.position.set(0, 0, 0); head.add(beardG);
    const tear = (w, len, curl = 0) => {
      const sp = new THREE.Shape();
      sp.moveTo(-w / 2, 0);
      sp.bezierCurveTo(-w / 2, -len * 0.5, -w * 0.15 + curl * 0.5, -len * 0.85, curl, -len);
      sp.bezierCurveTo(w * 0.2 + curl * 0.5, -len * 0.82, w / 2, -len * 0.5, w / 2, 0);
      sp.quadraticCurveTo(0, w * 0.3, -w / 2, 0);
      return sp;
    };
    const lockGeo = (w, len, depth, curl) => new THREE.ExtrudeGeometry(tear(w, len, curl), { depth, bevelEnabled: true, bevelThickness: depth * 0.6, bevelSize: Math.min(0.045, w * 0.2), bevelSegments: 3, curveSegments: 10 });
    const lock = (x, y, z, w, len, rot, m, { depth = 0.09, curl = 0, groove = true, tilt = -0.16 } = {}) => {
      const piv = new THREE.Group(); piv.position.set(x, y, z); piv.rotation.set(tilt, 0, rot); beardG.add(piv);
      const o = shadowy(new THREE.Mesh(lockGeo(w, len, depth, curl), m)); o.receiveShadow = false; piv.add(o);
      if (groove && w > 0.12) { // a strand line down the middle of the lock
        const gr = new THREE.Mesh(new THREE.ExtrudeGeometry(tear(w * 0.14, len * 0.72, curl * 0.6), { depth: 0.01, bevelEnabled: false, curveSegments: 8 }), dark);
        gr.position.set(w * 0.08, -len * 0.08, depth + depth * 0.6 + 0.004); piv.add(gr);
      }
      return piv;
    };
    // the chin: a soft band round the jaw, up the cheeks a little, holding the locks
    const chin = shadowy(new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 14), light)); chin.receiveShadow = false;
    chin.scale.set(1.12, 0.5, 0.66); chin.position.set(0, 0.1, 0.22); beardG.add(chin);
    // ONE layer of locks, side by side and overlapping (a little staggered in depth so no faces are coplanar), with grooves
    const locks = shape === 'forked' ? [[-0.3, -0.02, 0.8], [-0.17, -0.1, 1.0], [-0.05, -0.06, 0.78], [0.05, 0.06, 0.78], [0.17, 0.1, 1.0], [0.3, 0.02, 0.8]]
      : shape === 'pointed' ? [[-0.3, 0.3, 0.75], [-0.16, 0.16, 0.95], [0, 0, 1.12], [0.16, -0.16, 0.95], [0.3, -0.3, 0.75]]
      : [[-0.3, 0.16, 0.74], [-0.15, 0.07, 0.92], [0, 0, 1.0], [0.15, -0.07, 0.92], [0.3, -0.16, 0.74]];
    const wav = shape === 'wavy' || shape === 'full';
    if (shape === 'full') {
      // 'full': a big patriarch's beard — a wide back layer, nine wavy locks in front, whiskers up the cheeks to the ears
      chin.scale.set(1.3, 0.62, 0.72);
      for (let i = 0; i < 7; i++) { const x = -0.45 + i * 0.15; lock(x, 0.2, 0.2 + (i % 2) * 0.025, 0.3, (0.6 + 0.5 * L) * (1.02 - Math.abs(x) * 0.55), -x * 0.55, dark, { curl: i % 2 ? 0.1 : -0.1, groove: false }); }
      for (let i = 0; i < 9; i++) { const x = -0.48 + i * 0.12, k = 1.04 - Math.abs(x) * 0.62; lock(x, 0.16, 0.33 + (i % 2) * 0.03, 0.22, (0.55 + 0.5 * L) * k, -x * 0.5, i % 2 ? mid : light, { curl: i % 2 ? 0.09 : -0.09 }); }
      for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) lock(sx * (0.5 - k * 0.04), 0.62 - k * 0.2, 0.12 + k * 0.08, 0.24, 0.62, sx * (0.12 + k * 0.1), k % 2 ? mid : light, { curl: sx * 0.06, tilt: -0.05 });
    } else locks.forEach(([x, rot, k], i) => lock(x, 0.14, 0.34 + (i % 2) * 0.03, 0.24, (0.55 + 0.5 * L) * k, rot, i % 2 ? mid : light, { curl: wav ? (i % 2 ? 0.08 : -0.08) : 0 }));
    // moustache: a soft bar under the nose and two ends hanging DOWN beside the mouth
    const bar = shadowy(new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.22, 4, 10), light)); bar.rotation.z = Math.PI / 2; bar.scale.z = 0.8;
    // (toon faces — "render": "vivid" — keep the big smile under it visible: the moustache sits higher, its ends sweep outwards)
    const toon = !!look.toon;
    bar.position.set(0, toon ? 0.43 : 0.33, D.headR - 0.01); if (toon) bar.scale.set(0.85, 1.25, 0.8); beardG.add(bar);
    for (const sx of [-1, 1]) {
      const mo = toon ? lock(sx * 0.2, 0.45, D.headR - 0.05, 0.17, 0.26, sx * 0.95, light, { depth: 0.05, groove: false, tilt: -0.08 })
        : lock(sx * 0.15, 0.36, D.headR - 0.05, 0.16, 0.34, sx * 0.22, light, { depth: 0.05, groove: false, tilt: -0.08 });
      mo.rotation.y = sx * 0.3;
    }
  } else if (look.beard === 'long') {
    const g = new THREE.CylinderGeometry(0.46, 0.12, 0.95, 18, 1);
    g.scale(1, 1, 0.42);
    // a little self-light and no shadow from the head on it: the 3D beard reads as the same colour as the printed mustache
    const beard = shadowy(new THREE.Mesh(g, plastic(look.beardColor || 'white', { emissive: look.beardColor || 'white', emissiveIntensity: 0.18 })));
    beard.receiveShadow = false;
    beard.position.set(0, -0.36, D.headR - 0.1); beard.rotation.x = -0.12;
    head.add(beard);
  }

  // halo for saints: a golden round plate behind the head
  let halo = null;
  if (look.halo) {
    const hg = new THREE.CylinderGeometry(0.98, 0.98, 0.06, 40);
    hg.rotateX(Math.PI / 2);
    halo = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ color: COLORS.gold, emissive: 0xffc94a, emissiveIntensity: 0.55, roughness: 0.25, metalness: 0.3 }));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.06, 8, 40), plastic('brightYellow', { emissive: 'brightYellow', emissiveIntensity: 0.4 }));
    halo.add(ring);
    halo.position.set(0, headY + 0.2, blocky ? -BK.headD / 2 - 0.3 : -D.headR - 0.28);
    head.add(halo);
  }

  // ---------- runtime ----------
  let faceKey = '';
  const faceCtx = faceCanvas.getContext('2d');
  function setFace(state) {
    const key = [state.emotion, (state.mouth || 0).toFixed(1), (state.blink || 0).toFixed(1), state.eyesClosed ? 1 : 0, (state.gazeX || 0).toFixed(1), (state.gazeY || 0).toFixed(1)].join('|');
    if (key === faceKey) return;
    faceKey = key;
    drawFace(faceCtx, look, state);
    faceTex.needsUpdate = true;
  }
  setFace({ emotion: 'neutral' });

  /**
   * state = {
   *   time, walk: {phase, amount, style}, gestures: [{name, k}], emotion, mouth (0..1),
   *   posture: {from, to, k}, holding: {R: bool, L: bool}, talk (0..1), haloGlow
   * }
   */
  function update(state) {
    const t = state.time || 0;
    const p = { rArmX: 0, rArmZ: 0, lArmX: 0, lArmZ: 0, rHandX: 0, lHandX: 0, headYaw: 0, headPitch: 0, headRoll: 0, bend: 0, lift: 0, legs: 0, gazeX: 0, gazeY: 0, eyesClosed: false };
    // state.rest: no gestures / breathing / talking / walking bob — the stable pose the camera aims at
    const rest = !!state.rest;
    if (rest) state = { ...state, gestures: [], talk: 0, walk: null };
    // idle breathing
    if (!rest) {
      p.bend += 0.015 * Math.sin(t * 2.1);
      p.headRoll += 0.02 * Math.sin(t * 1.3);
    }

    // carrying
    // carrying: forearm well forward so the held object clears the body (higher when sitting, to clear the lap)
    const seated = state.posture && state.posture.to !== 'stand' && state.posture.k > 0.5;
    const carry = seated ? 1.65 : 1.3;
    // (applied after the gestures as a minimum, not added: a gesture with a full hand must not swing the arm
    // past the head and push the held prop through the body; offer/receive while seated stay above the lap)
    const carryOf = (h) => (!h ? 0 : h === 'low' ? (seated ? 0.75 : 0.6) : h === 'staff' ? (seated ? 0.62 : 0.3) : carry);
    const carryR = carryOf(state.holding?.R);
    const carryL = carryOf(state.holding?.L);

    // walking
    const w = state.walk;
    if (w && w.amount > 0) {
      const slow = w.style === 'slow';
      const sw = (slow ? 0.35 : 0.65) * w.amount;
      const s = Math.sin(w.phase);
      legs.L.rotation.x = s * sw; legs.R.rotation.x = -s * sw;
      p.lArmX += -s * sw * 0.7; if (!state.holding?.R) p.rArmX += s * sw * 0.7;
      p.lift += Math.abs(Math.cos(w.phase)) * 0.12 * w.amount;
      if (slow) p.bend += 0.18 * w.amount;
    } else { legs.L.rotation.x = 0; legs.R.rotation.x = 0; }

    // talking: head bobs a little
    if (state.talk) { p.headPitch += 0.06 * Math.sin(t * 9) * state.talk; p.headYaw += 0.05 * Math.sin(t * 3.7) * state.talk; }

    // gestures
    for (const gst of state.gestures || []) {
      const fn = GESTURE_POSES[gst.name];
      if (!fn) continue;
      const d = fn(gst.k, t);
      for (const [k, v] of Object.entries(d)) {
        if (k === 'eyesClosed') p.eyesClosed = p.eyesClosed || v;
        else if (gst.hand === 'L' && k.startsWith('r')) p['l' + k.slice(1)] += k.endsWith('Z') ? -v : v;
        else if (gst.hand === 'L' && k.startsWith('l') && k !== 'legs' && k !== 'lift') p['r' + k.slice(1)] += k.endsWith('Z') ? -v : v;
        else p[k] = (p[k] || 0) + v;
      }
    }

    // piggyback: the rider holds on to the carrier's shoulders, the carrier holds the rider's legs behind him
    const riding = state.posture && state.posture.to === 'ride';
    if (riding) { p.rArmX = -1.2 + 0.4 * p.rArmX; p.lArmX = -1.2 + 0.4 * p.lArmX; }
    if (state.piggyback) { p.rArmX = Math.max(p.rArmX, 0.55); p.lArmX = Math.max(p.lArmX, 0.55); p.rArmZ -= 0.12; p.lArmZ += 0.12; p.bend += 0.1; }

    // hands resting on the knees (cast "hands": "knees"): seated, both forearms forward on the lap, hands together
    if (state.hands === 'knees' && seated) {
      if (!state.holding?.R) { p.rArmX += -1.05; p.rArmZ += 0.2; p.rHandX += 1.35; }
      if (!state.holding?.L) { p.lArmX += -1.05; p.lArmZ -= 0.2; p.lHandX += 1.35; }
      p.bend += 0.1;
    }
    if (carryR) p.rArmX = Math.min(p.rArmX, -carryR);
    if (carryL) p.lArmX = Math.min(p.lArmX, -carryL);
    // a walking staff held at the side: the arm out a little, so the staff stands beside the body, not in front of the face
    if (state.holding?.R === 'staff') p.rArmZ -= seated ? 0.42 : 0.28;
    if (state.holding?.L === 'staff') p.lArmZ += seated ? 0.42 : 0.28;

    // apply
    arms.R.rotation.set(p.rArmX, 0, -0.06 + p.rArmZ);
    arms.L.rotation.set(p.lArmX, 0, 0.06 + p.lArmZ);
    hands.R.rotation.x = p.rHandX; hands.L.rotation.x = p.lHandX;
    head.rotation.set(p.headPitch, p.headYaw, p.headRoll);
    waist.rotation.x = p.bend;
    // posture
    const post = state.posture || { from: 'stand', to: 'stand', k: 1 };
    const P = (name) => ({
      stand: { y: 0, legs: 0, rx: 0 }, sit: { y: -0.95 + (state.seat || 0), legs: -Math.PI / 2, rx: 0 },
      lie: { y: 0.45 + (state.lift || 0), legs: 0, rx: -Math.PI / 2 }, kneel: { y: -0.75, legs: -Math.PI / 2 * 0.95, rx: 0 },
      ride: { y: 0.85, legs: -0.2, rx: 0 },
    }[name] || { y: 0, legs: 0, rx: 0 });
    const a = P(post.from), b = P(post.to), k = smooth(post.k);
    body.position.y = lerp(a.y, b.y, k) + p.lift;
    const legX = lerp(a.legs, b.legs, k);
    if (legX) { legs.L.rotation.x += legX; legs.R.rotation.x += legX; }
    legs.L.rotation.x += p.legs; legs.R.rotation.x -= p.legs * 0.5;
    body.rotation.x = lerp(a.rx, b.rx, k);
    if (lap) lap.userData.front.scale.y = Math.min(look.lapFall || 9, D.hipY + 0.5 - (0.95 - (state.seat || 0)) - 0.02); // `lapFall`: a shorter fall
    if (lap) { lap.visible = (post.to === 'sit' && k > 0.6) || (post.from === 'sit' && k < 0.4); for (const sd of ['L', 'R']) if (legs[sd].userData.foot) legs[sd].userData.foot.visible = !lap.visible; }
    // tilt (lying only): the torso rises at the waist, the legs stay flat — e.g. a head resting on someone's knees
    if (state.tilt) waist.rotation.x += state.tilt * Math.PI / 180 * ((post.from === 'lie' ? 1 - k : 0) + (post.to === 'lie' ? k : 0));
    if (halo) halo.material.emissiveIntensity = 0.55 + 0.35 * (state.haloGlow || 0) + 0.08 * Math.sin(t * 3);

    if (!rest) setFace({ emotion: state.emotion || 'neutral', mouth: state.mouth, blink: state.blink || 0, eyesClosed: p.eyesClosed, gazeX: p.gazeX, gazeY: p.gazeY });
  }

  return { root, look, update, holds, headTop, faceAnchor, head, hands, height: (blocky ? D.torsoBottom + D.torsoH + 0.03 + BK.headH : MINIFIG_HEIGHT) * S };
}
