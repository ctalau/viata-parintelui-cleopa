// Sets ("cadre"): environments built from bricks. Each set builder returns { group, update(t) }.
// Layout data (positions, anchors) lives in layouts.js so the timeline can use it without three.js.
import * as THREE from 'three';
import { Builder, plastic, color, rng, SMOOTH } from './bricks.js';
import { getLayout, desertRoadX } from './layouts.js';
import { createProp } from './props.js';

/** Names a set piece (shown by the `clip` / `blocked` checks: "goes into the palm"). */
const named = (o, name) => { o.name = name; return o; };

// ---------- lighting / sky presets ----------
export const SKIES = {
  day: { top: '#5fb8f0', bottom: '#d9f1ff', fog: 0xdcefff, hemi: [0xcfe9ff, 0xe8c690, 1.5], sun: [0xfff3dc, 2.6], sunDir: [18, 30, 14], sunColor: '#fff6b0' },
  evening: { top: '#4b5fa8', bottom: '#ffb37a', fog: 0xf3b98c, hemi: [0xffc9a0, 0x8a6a8a, 1.2], sun: [0xffb070, 2.2], sunDir: [-28, 12, -6], sunColor: '#ffcf70' },
  morning: { top: '#7cc3f2', bottom: '#ffe1c2', fog: 0xffe6d0, hemi: [0xfff0e0, 0xc9b48a, 1.45], sun: [0xffe2b8, 2.4], sunDir: [26, 14, 18], sunColor: '#fff1c8' },
  night: { top: '#0b1236', bottom: '#2c3c78', fog: 0x26346a, hemi: [0x7b8fe0, 0x3a3458, 1.05], sun: [0xa9bcff, 1.1], sunDir: [-10, 30, 10], sunColor: '#f4f1d0', stars: true },
  // a dream / vision at night: glowing lilac-rose sky with stars, soft warm light from the front
  // sunset (apus): an indigo-to-rose-to-gold sky, a big low sun on the horizon (`discDir`, separate from the warm key light
  // that lights the faces from the front left), warm glowing fog
  sunset: { top: '#5257ad', mid: '#e898a0', bottom: '#ffa848', fog: 0xf0a878, fogNear: 95, fogFar: 200, hemi: [0xffc6a0, 0x7a5a8a, 1.15], sun: [0xffb878, 2.5], sunDir: [-30, 11, 6], discDir: [-0.26, 0.13, -0.96], discSize: 8.5, stops: [0, 0.3, 0.5], glow: true, sunColor: '#ffcf4d' },
  dream: { top: '#3a2c7a', bottom: '#f0bfe0', fog: 0xd9b4e4, hemi: [0xfff0ff, 0x9a86c0, 1.5], sun: [0xfff4dc, 1.7], sunDir: [6, 26, 22], sunColor: '#fffbe8', stars: true },
};

function skyTexture(p) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 512;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 512);
  const st = p.stops || [0, 0.52, 0.8];
  gr.addColorStop(st[0], p.top); if (p.mid) gr.addColorStop(st[1], p.mid); gr.addColorStop(p.mid ? st[2] : 0.75, p.bottom); gr.addColorStop(1, p.bottom);
  g.fillStyle = gr; g.fillRect(0, 0, 16, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// "render": "vivid": deeper, more saturated skies and a warmer bounce light (the toy-photo look)
const VIVID_SKY = {
  day: { top: '#1f7fe0', bottom: '#bfe8ff', hemi: [0xd8ecff, 0xf0c88a, 1.25], sun: [0xfff0d2, 2.9] },
  morning: { top: '#4aa6ee', bottom: '#ffd9b0', hemi: [0xfff0e0, 0xe8c08a, 1.2], sun: [0xffdcae, 2.7] },
  evening: { top: '#34479a', bottom: '#ff9e62', hemi: [0xffc49a, 0x9a6a7a, 1.05], sun: [0xffa860, 2.5] },
  sunset: { top: '#5a5cb4', mid: '#f49a78', bottom: '#ff9a3c', hemi: [0xffc0a0, 0x6a4a7a, 0.55], sun: [0xffa860, 2.9] },
};
export function applySky(scene, name = 'day', { vivid = false } = {}) {
  const p = { ...(SKIES[name] || SKIES.day), ...(vivid ? VIVID_SKY[name] || {} : {}) };
  scene.background = skyTexture(p);
  scene.fog = new THREE.Fog(p.fog, p.fogNear || 60, p.fogFar || 150);
  const hemi = new THREE.HemisphereLight(p.hemi[0], p.hemi[1], p.hemi[2]);
  const sun = new THREE.DirectionalLight(p.sun[0], p.sun[1]);
  sun.position.set(...p.sunDir);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = sun.shadow.camera; s.left = -32; s.right = 32; s.top = 32; s.bottom = -32; s.near = 1; s.far = 120;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.12; // generous bias: no shadow acne stripes on flat walls
  scene.add(hemi, sun, sun.target);
  // visible sun / moon disc
  const disc = new THREE.Mesh(new THREE.CircleGeometry(p.discSize || 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(p.sunColor).multiplyScalar(p.glow ? 1.2 : 1), fog: false, toneMapped: !p.glow }));
  const dir = new THREE.Vector3(...(p.discDir || p.sunDir)).normalize();
  disc.position.copy(dir.clone().multiplyScalar(130)); disc.lookAt(0, 0, 0);
  scene.add(disc);
  if (p.glow) { // a soft golden halo round the low sun
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d'); const gr = x.createRadialGradient(128, 128, 30, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,215,110,1)'); gr.addColorStop(0.3, 'rgba(255,160,60,0.55)'); gr.addColorStop(1, 'rgba(255,150,90,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const halo = new THREE.Mesh(new THREE.PlaneGeometry((p.discSize || 6) * 7, (p.discSize || 6) * 7), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
    halo.position.copy(dir.clone().multiplyScalar(134)); halo.lookAt(0, 0, 0); scene.add(halo);
  }
  if (p.stars) {
    const r = rng(7), pts = [];
    for (let i = 0; i < 400; i++) { const a = r() * Math.PI * 2, e = 0.15 + r() * 1.2; pts.push(Math.cos(a) * Math.cos(e) * 140, Math.sin(e) * 140, Math.sin(a) * Math.cos(e) * 140); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, fog: false })));
  }
  return { hemi, sun, preset: p };
}

// ---------- reusable set pieces ----------
const MUD = ['tan', 'sand', 'tan', 'darkTan', 'tan', 'lightNougat'];

/**
 * Mud-brick monastic cell (chilie). Local frame: center at origin, door facing +Z.
 * `church: true` = the little church of the lavra: bigger (11 x 8, 6 rows), a gold dome on a drum and a big gold cross.
 */
export function buildHut(opts = {}) {
  const r = rng(opts.seed || 3);
  const b = new Builder();
  const church = !!opts.church;
  const W = church ? 11 : 9, Dp = church ? 8 : 7, ROWS = church ? 6 : 5;
  const x0 = -W / 2, z0 = -Dp / 2;
  const palette = opts.colors || MUD;
  const pick = () => palette[Math.floor(r() * palette.length)];
  const doorX = [-1.5, 1.5], doorRows = 4;
  for (let row = 0; row < ROWS; row++) {
    const y = row * 1.2, top = row === ROWS - 1;
    const off = row % 2;
    // front (+z) and back walls run along x
    for (const [zz, isFront] of [[z0 + Dp - 1, true], [z0, false]]) {
      for (let x = x0 - off; x < x0 + W; x += 2) {
        const xa = Math.max(x0, x), xb = Math.min(x0 + W, x + 2);
        if (xb - xa <= 0) continue;
        // door opening (and, on the row above it, room for the lintel) — never let two bricks overlap,
        // coplanar faces z-fight and flicker
        const gap = row < doorRows ? doorX : row === doorRows ? [doorX[0] - 1, doorX[1] + 1] : null;
        if (isFront && gap && xa < gap[1] && xb > gap[0]) {
          for (let xi = xa; xi < xb; xi++) if (xi + 0.5 < gap[0] || xi + 0.5 > gap[1]) b.brick(xi, y, zz, 1, 1, 3, pick(), { studs: top });
          continue;
        }
        if (!isFront && row === 2 && xa >= -1 && xb <= 1) continue; // back window
        b.brick(xa, y, zz, xb - xa, 1, 3, pick(), { studs: top });
      }
    }
    // side walls run along z
    for (const xx of [x0, x0 + W - 1]) {
      for (let z = z0 + 1 - off; z < z0 + Dp - 1; z += 2) {
        const za = Math.max(z0 + 1, z), zb = Math.min(z0 + Dp - 1, z + 2);
        if (zb - za <= 0) continue;
        if (row === 2 && za >= -1 && zb <= 1) continue; // side windows
        b.brick(xx, y, za, 1, zb - za, 3, pick(), { studs: top });
      }
    }
  }
  // lintel above the door
  b.brick(doorX[0] - 1, doorRows * 1.2, z0 + Dp - 1, doorX[1] - doorX[0] + 2, 1, 3, 'reddishBrown', { studs: doorRows === ROWS - 1 });
  // flat roof with a small overhang
  b.plate(x0 - 0.5 | 0, ROWS * 1.2, z0 - 1, W + 1, Dp + 2, opts.roof || 'darkTan', { studs: true });
  const group = b.build();
  // dome on top (Egyptian desert cells were often vaulted); village houses use dome: false, cross: false
  const domeR = church ? 3.0 : 2.6, drumH = church ? 1.4 : 0;
  if (opts.dome !== false) {
    if (church) { // a round drum under the dome, with dark little windows
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(domeR, domeR, drumH, 24), plastic(opts.drum || 'white'));
      drum.position.y = ROWS * 1.2 + 0.4 + drumH / 2; drum.castShadow = drum.receiveShadow = true; drum.userData.solid = true; group.add(drum);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const w = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.1), plastic('darkBlue'));
        w.position.set(Math.sin(a) * (domeR + 0.03), ROWS * 1.2 + 0.4 + drumH / 2, Math.cos(a) * (domeR + 0.03)); w.rotation.y = a; group.add(w);
      }
    }
    const dome = new THREE.Mesh(new THREE.SphereGeometry(domeR, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), church ? plastic(opts.churchDome || 'gold', { metal: true }) : plastic(opts.dome || 'white'));
    dome.position.y = ROWS * 1.2 + 0.4 + drumH; dome.castShadow = dome.receiveShadow = true; dome.userData.solid = true;
    group.add(dome);
  }
  if (opts.cross !== false && opts.dome !== false) {
    const crossB = new Builder();
    crossB.brick(-0.25, 0, -0.25, 0.5, 0.5, 4, 'gold', { studs: false }).brick(-0.75, 0.9, -0.2, 1.5, 0.4, 1, 'gold', { studs: false }); // bar thinner: no coplanar faces
    const crossG = crossB.build(); crossG.position.y = ROWS * 1.2 + 0.4 + drumH + domeR - 0.05; if (church) crossG.scale.setScalar(1.4); group.add(crossG);
  }
  // dark doorway interior so the opening reads clearly
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(3, doorRows * 1.2), new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 1 }));
  dark.position.set(0, doorRows * 0.6, z0 + Dp - 1.2); group.add(dark);
  // a little reed mat at the door
  if (opts.doormat !== false) { const m = createProp('mat', { color: opts.matColor || 'darkTan' }); m.scale.set(0.9, 1, 0.5); m.position.set(0, 0.03, Dp / 2 + 1.4); group.add(m); }
  return named(group, 'hut');
}

export function buildPalm(seed = 1, height = 9) {
  const r = rng(seed);
  const g = new THREE.Group();
  const lean = (r() - 0.5) * 0.25;
  const segs = Math.round(height / 1.2);
  let x = 0, z = 0;
  for (let i = 0; i < segs; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 1.15, 10), plastic(i % 2 ? 'reddishBrown' : 'brown'));
    x += lean * 0.35; m.position.set(x, i * 1.2 + 0.6, z); m.castShadow = m.receiveShadow = true; m.userData.solid = true; g.add(m);
  }
  const topY = segs * 1.2;
  const leafM = plastic('green'), leafM2 = plastic('brightGreen');
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r();
    const leaf = new THREE.Group();
    for (let k = 0; k < 4; k++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.9 - k * 0.15, 0.16, 1.3), k % 2 ? leafM : leafM2);
      p.position.set(0, -k * k * 0.12, 0.6 + k * 1.1); p.rotation.x = 0.12 * k; p.castShadow = true; leaf.add(p);
    }
    leaf.position.set(x, topY, z); leaf.rotation.y = a; leaf.rotation.x = 0.15;
    g.add(leaf);
  }
  for (let i = 0; i < 4; i++) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), plastic('reddishBrown'));
    const a = i * 1.7; d.position.set(x + Math.cos(a) * 0.5, topY - 0.4, z + Math.sin(a) * 0.5); d.castShadow = true; g.add(d);
  }
  return named(g, 'palm');
}

export function buildWell() {
  const b = new Builder();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    // r 0.44: neighbours touch but never overlap (overlapping caps in one plane flicker)
    b.round(Math.cos(a) * 1.7, 0, Math.sin(a) * 1.7, 0.44, 1.2, i % 2 ? 'gray' : 'lightGray');
    b.round(Math.cos(a + 0.26) * 1.7, 1.2, Math.sin(a + 0.26) * 1.7, 0.44, 1.2, i % 2 ? 'lightGray' : 'gray');
  }
  const g = b.build();
  const water = new THREE.Mesh(new THREE.CircleGeometry(1.4, 24), plastic('azure', { transparent: true, opacity: 0.85 }));
  water.rotation.x = -Math.PI / 2; water.position.y = 1.6; g.add(water);
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.3, 0.5, 12), plastic('darkBrown'));
  bucket.position.set(1.7, 2.65, 0); g.add(bucket);
  return named(g, 'well');
}

/**
 * Emit a set of 1x1 cells ("x,z" keys) as merged rows of bricks — cells can come from overlapping shapes,
 * but the bricks never overlap (overlapping bricks have coplanar faces → z-fighting flicker).
 */
function emitCells(b, cells, y, hp, c, { studs = false } = {}) {
  const rows = new Map();
  for (const k of cells) { const [x, z] = k.split(',').map(Number); if (!rows.has(z)) rows.set(z, []); rows.get(z).push(x); }
  for (const [z, xs] of rows) {
    xs.sort((p, q) => p - q);
    let x0 = xs[0], prev = xs[0];
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] === prev + 1) { prev = xs[i]; continue; }
      b.brick(x0, y, z, prev - x0 + 1, 1, hp, c, { studs });
      if (i < xs.length) { x0 = xs[i]; prev = xs[i]; }
    }
  }
}

function buildDunes(b, seed, inner = 27, outer = 42, avoid = null, cols = ['sand', 'tan']) {
  const r = rng(seed);
  // stepped dunes as a height map (layers of 2 plates), so overlapping dunes merge instead of overlapping
  const height = new Map();
  for (let i = 0; i < 30; i++) {
    const a = r() * Math.PI * 2, d = inner + r() * (outer - inner);
    const cx = Math.round(Math.cos(a) * d), cz = Math.round(Math.sin(a) * d);
    const w = 8 + Math.floor(r() * 10), dd = 6 + Math.floor(r() * 8), layers = 2 + Math.floor(r() * 6);
    if (avoid && avoid(cx, cz, w, dd)) continue;
    for (let k = 0; k < layers; k++) {
      const ww = w - 2 * k, dk = dd - 2 * k; if (ww < 2 || dk < 2) break;
      const x0 = cx - ww / 2 | 0, z0 = cz - dk / 2 | 0;
      for (let x = x0; x < x0 + ww; x++) for (let z = z0; z < z0 + dk; z++) {
        const key = `${x},${z}`; height.set(key, Math.max(height.get(key) || 0, k + 1));
      }
    }
  }
  const maxH = Math.max(0, ...height.values());
  for (let k = 0; k < maxH; k++) {
    const cells = [...height].filter(([, h]) => h > k).map(([key]) => key);
    emitCells(b, cells, k * 0.8, 2, cols[k % 2]);
  }
  // studs on the top of every column
  b.heights = height;
  for (const [key, h] of height) { const [x, z] = key.split(',').map(Number); b._stud(cols[(h - 1) % 2], x + 0.5, h * 0.8, z + 0.5); }
}

function buildClouds(group, seed) {
  const r = rng(seed);
  const m = plastic('white');
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    const n = 3 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(4 + r() * 5, 1.6 + r(), 3 + r() * 2), m);
      box.position.set(k * 3 - n * 1.5, r() * 1.2 + k * 0.05, r() * 1.5 + k * 0.07); c.add(box); // never coplanar
    }
    const a = r() * Math.PI * 2, d = 70 + r() * 30;
    c.position.set(Math.cos(a) * d, 26 + r() * 18, Math.sin(a) * d);
    c.lookAt(0, c.position.y, 0);
    group.add(c);
  }
}

function studTexture(size, col = 'sand') {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#' + color(col).toString(16).padStart(6, '0'); g.fillRect(0, 0, 64, 64);
  const gr = g.createRadialGradient(28, 28, 4, 32, 32, 20);
  gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(0.8, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.18)');
  if (!SMOOTH.on) { g.fillStyle = gr; g.beginPath(); g.arc(32, 32, 19, 0, Math.PI * 2); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(size, size); t.anisotropy = 8;
  return t;
}

// ---------- the sets ----------
// Colour palettes for the lavra: same shapes, different mood (consistency without monotony).
// set: { "type": "desert-lavra", "palette": "rose" }
export const LAVRA_PALETTES = {
  classic: { walls: MUD, domes: ['white', 'white', 'white', 'white'], firstDome: null, path: 'darkTan', ground: 'sand', dunes: ['sand', 'tan'], rocks: ['gray', 'darkGray'], roof: 'darkTan' },
  rose: { walls: ['nougat', 'lightNougat', 'nougat', 'darkOrange', 'lightNougat', 'nougat'], domes: ['lightNougat', 'white', 'lightNougat', 'white'], path: 'reddishBrown', ground: 'lightNougat', dunes: ['lightNougat', 'nougat'], rocks: ['darkOrange', 'reddishBrown'], roof: 'reddishBrown' },
  stone: { walls: ['lightGray', 'gray', 'white', 'lightGray', 'gray'], domes: ['mediumBlue', 'white', 'mediumBlue', 'white'], path: 'darkGray', ground: 'tan', dunes: ['tan', 'darkTan'], rocks: ['darkGray', 'gray'], roof: 'darkGray' },
  // bright blocky town (a smooth, toy-town look): every house one clean colour, green lawn, grey sidewalk, green hills
  town: { walls: ['white'], hutWalls: [['skyBlue'], ['pink'], ['brightYellow'], ['lime']], domes: ['white', 'white', 'white', 'white'], path: 'lightGray', ground: 'brightGreen', dunes: ['green', 'brightGreen'], rocks: ['gray', 'lightGray'], roof: 'white' },
  // warm terracotta walls with green domes and an olive path: an evening-glow lavra
  terra: { walls: ['darkOrange', 'nougat', 'reddishBrown', 'nougat', 'darkOrange'], domes: ['green', 'white', 'green', 'white'], path: 'oliveGreen', ground: 'tan', dunes: ['tan', 'nougat'], rocks: ['reddishBrown', 'darkTan'], roof: 'brown' },
  // whitewashed walls with deep red domes and a grey stone path: a clean, bright lavra
  ruby: { walls: ['white', 'lightGray', 'white', 'lightNougat', 'white'], domes: ['darkRed', 'white', 'darkRed', 'white'], path: 'gray', ground: 'sand', dunes: ['sand', 'tan'], rocks: ['darkGray', 'gray'], roof: 'darkRed' },
  // warm ochre-yellow walls with blue domes and a red-brown path (goes well with the gold church dome)
  amber: { walls: ['yellow', 'tan', 'sand', 'yellow', 'lightNougat'], domes: ['blue', 'white', 'blue', 'white'], path: 'reddishBrown', ground: 'sand', dunes: ['sand', 'tan'], rocks: ['darkTan', 'gray'], roof: 'brown' },
  // sage/olive-green and cream walls, terracotta domes, dry khaki ground (a lean, dusty lavra: famine)
  olive: { walls: ['oliveGreen', 'cream', 'oliveGreen', 'lightNougat', 'cream'], domes: ['darkOrange', 'cream', 'darkOrange', 'cream'], path: 'darkTan', ground: 'tan', dunes: ['tan', 'darkTan'], rocks: ['darkTan', 'gray'], roof: 'darkOrange' },
  // lavender and white walls, sky-blue domes, a sandy-tan path: a soft, dreamy lavra (goes with the gold church dome)
  lilac: { walls: ['lavender', 'white', 'lavender', 'lightGray', 'white'], domes: ['skyBlue', 'white', 'skyBlue', 'white'], path: 'darkTan', ground: 'sand', dunes: ['sand', 'lightNougat'], rocks: ['gray', 'lavender'], roof: 'mediumBlue' },
  oasis: { walls: ['sand', 'white', 'lightNougat', 'sand'], domes: ['azure', 'white', 'azure', 'white'], path: 'oliveGreen', ground: 'sand', dunes: ['sand', 'tan'], rocks: ['gray', 'darkGray'], roof: 'darkTan' },
};

function desertLavra(def = {}) {
  const L = getLayout({ type: 'desert-lavra', ...def });
  const group = new THREE.Group();
  const size = L.size;
  const P = LAVRA_PALETTES[def.palette || 'classic'] || LAVRA_PALETTES.classic;

  // sand baseplate
  const ground = new Builder();
  ground.brick(-size / 2, -0.4, -size / 2, size, size, 1, P.ground, { studs: false });
  // Real 3D studs only near the action (they are the most expensive thing to render);
  // further away a printed stud texture gives the same look for a fraction of the cost.
  const studsB = new Builder();
  const studR = def.studRadius ?? 25;
  for (let x = -size / 2; x < size / 2; x += 1) for (let z = -size / 2; z < size / 2; z += 1) {
    if (Math.hypot(x + 0.5, z + 0.5) < studR) studsB._stud(P.ground, x + 0.5, 0, z + 0.5);
  }
  const groundMesh = ground.build({ castShadow: false });
  groundMesh.children[0].material = new THREE.MeshStandardMaterial({ map: studTexture(size, P.ground), roughness: 0.4 });
  group.add(groundMesh, studsB.build({ castShadow: false }));

  // path between the cells (darker tiles) - shows the "circle of love"
  const path = new Builder();
  const pr = def.pathRadius ?? 9.5;
  const pathCells = new Set();
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const x = Math.round(Math.sin(a) * pr) - 1, z = Math.round(Math.cos(a) * pr) - 1;
    for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) pathCells.add(`${x + dx},${z + dz}`);
  }
  emitCells(path, pathCells, 0, 1, P.path);
  group.add(path.build({ castShadow: false }));

  // dunes far away
  const dunes = new Builder(); buildDunes(dunes, 11, 27, 42, null, P.dunes); group.add(named(dunes.build(), 'dunes'));
  const duneCells = dunes.heights;

  // cells
  const hutColors = def.hutColors || [{}, {}, {}, {}];
  L.cells.forEach((c, i) => {
    const hut = buildHut({ seed: 10 + i, church: !!c.church, colors: P.hutWalls ? P.hutWalls[i % P.hutWalls.length] : P.walls, dome: P.domes[i % P.domes.length], roof: P.roof, ...(hutColors[i] || {}), ...(def.huts?.[i] || {}) });
    hut.position.set(c.pos[0], 0, c.pos[1]); hut.rotation.y = c.h;
    group.add(hut);
  });

  // palms, rocks, well
  L.palms.forEach(([x, z], i) => { const p = buildPalm(20 + i, 8 + (i % 3) * 2); p.position.set(x, 0, z); group.add(p); });
  if (def.well !== false) { const w = buildWell(); w.position.set(L.well[0], 0, L.well[1]); group.add(w); }
  const rocks = new Builder(); const r = rng(5); const rockCells = new Set();
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2, d = 18 + r() * 8;
    const x = Math.round(Math.cos(a) * d), z = Math.round(Math.sin(a) * d);
    const free = (x0, z0, w, d) => { for (let a = x0; a < x0 + w; a++) for (let c = z0; c < z0 + d; c++) if (rockCells.has(`${a},${c}`)) return false; return true; };
    const take = (x0, z0, w, d) => { for (let a = x0; a < x0 + w; a++) for (let c = z0; c < z0 + d; c++) rockCells.add(`${a},${c}`); };
    if (!free(x, z, 2, 2) || [0, 1, 2, 3].some((a) => [0, 1, 2].some((c) => duneCells.has(`${x + a},${z + c}`)))) continue; // not inside a dune
    take(x, z, 2, 2);
    rocks.brick(x + 0.5, 0, z + 0.5, 2, 2, 3, P.rocks[i % 2], { studs: true });
    if (i % 3 === 0 && free(x + 2, z, 1, 2)) { take(x + 2, z, 1, 2); rocks.brick(x + 2.5, 0, z + 0.5, 1, 2, 2, 'lightGray'); }
  }
  group.add(named(rocks.build(), 'small rocks'));
  buildClouds(group, 9);
  return { group, layout: L, update() {} };
}

/**
 * Village bakery stall: a counter with loaves, a striped awning on four poles and a round clay bread oven
 * with a glowing mouth. Local frame: counter centre at origin, customers stand at +Z, the baker at -Z.
 * `ovenAt` = oven offset [x, z] in the same frame.
 */
export function buildBakery(opts = {}) {
  const g = new THREE.Group();
  const b = new Builder();
  // counter: 6 x 2 studs, 1 brick + 2 plates high, with a plank top
  b.brick(-3, 0, -1, 6, 2, 3, 'reddishBrown', { studs: false });
  // top at 2.4 (not 2.8): a minifig's arm held forward is at ~2.6, it must pass above the counter, not into it
  b.brick(-3, 1.2, -1, 6, 2, 2, 'reddishBrown', { studs: false });
  b.plate(-3.5, 2.0, -1.5, 7, 3, 'tan', { studs: false });
  // awning poles (corners, away from the counter so nothing overlaps)
  // poles off the stud grid so they are never in the plane of the paving tiles they stand in
  for (const [x, z] of [[-3.75, 1.25], [3.25, 1.25], [-3.75, -3.75], [3.25, -3.75]]) b.brick(x, 0, z, 0.5, 0.5, 18, 'brown', { studs: false });
  g.add(b.build());
  // striped awning cloth
  const stripes = opts.awning || ['white', 'red'];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.12, 6.4), plastic(stripes[i % stripes.length]));
    m.position.set(-3.75 + i + 0.5 + 0.25, 7.35, -1); m.rotation.x = 0.12; m.castShadow = m.receiveShadow = true; g.add(m);
  }
  // a row of fresh loaves on the counter
  for (let i = 0; i < 5; i++) {
    const loaf = createProp('bread', { fresh: true, steam: false });
    loaf.position.set(-2.4 + i * 1.2, 2.4 + 0.37, -0.3 + (i % 2) * 0.5); loaf.rotation.y = i * 0.7; g.add(loaf);
  }
  // clay oven
  const oven = buildOven();
  const [ox, oz] = opts.ovenAt || [7, -3.8];
  oven.position.set(ox, 0, oz); oven.rotation.y = opts.ovenH ?? -0.5;
  g.add(oven);
  return named(g, 'bakery stall');
}

/** Round clay bread oven (tabun) with a glowing opening facing +Z. */
export function buildOven() {
  const g = new THREE.Group();
  const clay = plastic('darkOrange');
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.4, 1.2, 24), plastic('reddishBrown'));
  base.position.y = 0.6; const dome = new THREE.Mesh(new THREE.SphereGeometry(2.1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), clay);
  dome.position.y = 1.2; dome.scale.y = 1.1;
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.8, 12), clay); chimney.position.y = 3.6;
  for (const m of [base, dome, chimney]) { m.castShadow = m.receiveShadow = true; m.userData.solid = true; g.add(m); }
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.75, 20, 0, Math.PI), plastic('orange', { emissive: 'orange', emissiveIntensity: 1.6 }));
  mouth.position.set(0, 1.25, 2.02); g.add(mouth);
  const glow = new THREE.PointLight(0xff8a30, 3, 7, 2); glow.position.set(0, 1.6, 2.6); g.add(glow);
  return named(g, 'oven');
}

function buildNile(group, x0, x1, size) {
  // green bank, then the water
  const b = new Builder();
  b.plate(x1, 0, -size / 2, 4, size, 'green', { studs: false });
  b.tile(x0, 0, -size / 2, x1 - x0, size, 'mediumAzure');
  group.add(b.build({ castShadow: false }));
  // reeds along the bank
  const r = rng(31), reedM = plastic('brightGreen'), reedM2 = plastic('green');
  for (let i = 0; i < 46; i++) {
    const h = 1.2 + r() * 1.6;
    const reed = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, h, 5), i % 2 ? reedM : reedM2);
    reed.position.set(x1 - 0.4 + r() * 1.6, 0.4 + h / 2, -size / 2 + 2 + r() * (size - 4));
    reed.rotation.z = (r() - 0.5) * 0.3; reed.castShadow = true; group.add(reed);
  }
}

function egyptVillage(def = {}) {
  const L = getLayout({ type: 'egypt-village', ...def });
  const group = new THREE.Group();
  const size = L.size;
  const ground = new Builder();
  ground.brick(-size / 2, -0.4, -size / 2, size, size, 1, 'sand', { studs: false });
  const groundMesh = ground.build({ castShadow: false });
  groundMesh.children[0].material = new THREE.MeshStandardMaterial({ map: studTexture(size), roughness: 0.4 });
  group.add(groundMesh);
  // real studs only around the square and the start of the road (away from the river)
  const studsB = new Builder();
  for (let x = -size / 2; x < size / 2; x += 1) for (let z = -size / 2; z < size / 2; z += 1) {
    const cx = x + 0.5, cz = z + 0.5;
    if (cx > -24 && Math.hypot(cx, cz) < 22 && !(Math.abs(cx) < L.road.width / 2 && cz > L.road.from)) studsB._stud('sand', cx, 0, cz);
  }
  group.add(studsB.build({ castShadow: false }));
  // market square paving + the road out into the desert
  const path = new Builder();
  for (let x = -8; x < 10; x += 2) for (let z = -4; z < 2; z += 2) path.tile(x, 0, z, 2, 2, (x + z) % 4 ? 'darkTan' : 'tan');
  for (let z = L.road.from; z < L.road.to; z += 2) path.tile(-L.road.width / 2, 0, z, L.road.width, 2, 'darkTan');
  group.add(path.build({ castShadow: false }));
  buildNile(group, -size / 2, -30, size);
  // dunes beyond the village, leaving a corridor for the road and the river side open
  const dunes = new Builder();
  buildDunes(dunes, 13, 30, 44, (cx, cz, w) => cx < -20 || (cz > 0 && Math.abs(cx) < w / 2 + 5));
  group.add(named(dunes.build(), 'dunes'));
  // houses: whitewashed / mud brick, flat roofs, no domes or crosses
  const HOUSE = [['white', 'lightNougat', 'white'], ['lightNougat', 'tan', 'sand'], ['white', 'lightGray', 'white'], ['sand', 'tan', 'lightNougat'], ['white', 'lightNougat', 'white']];
  L.houses.forEach((hs, i) => {
    const hut = buildHut({ seed: 40 + i, colors: HOUSE[i % HOUSE.length], dome: false, cross: false, roof: i % 2 ? 'reddishBrown' : 'darkTan', matColor: ['red', 'mediumBlue', 'darkGreen'][i % 3] });
    hut.position.set(hs.pos[0], 0, hs.pos[1]); hut.rotation.y = hs.h; group.add(hut);
  });
  // bakery stall at the back of the square, facing the road
  const bakery = buildBakery({ ovenAt: [L.anchors.oven.pos[0] - L.anchors.counter.pos[0], L.anchors.oven.pos[1] - L.anchors.counter.pos[1]] });
  bakery.position.set(L.anchors.counter.pos[0], 0, L.anchors.counter.pos[1]); group.add(bakery);
  // a few market things: baskets of fruit and jugs by the houses
  const deco = [['basket', { filled: 'orange' }, [-7, -4]], ['basket', { filled: 'grapePurple' }, [-8.5, -2.6]], ['jug', {}, [12.5, 2.5]], ['jug', { color: 'reddishBrown' }, [13.6, 3.2]], ['basket', { filled: 'brightGreen' }, [-11, 6]]];
  for (const [type, o, [x, z]] of deco) { const p = createProp(type, o); p.position.set(x, p.userData.ground || 0, z); group.add(p); }
  L.palms.forEach(([x, z], i) => { const p = buildPalm(50 + i, 8 + (i % 3) * 2); p.position.set(x, 0, z); group.add(p); });
  buildClouds(group, 17);
  return { group, layout: L, update() {} };
}

/** Broad shade tree (sycamore fig): brick trunk + stepped green canopy high enough to sit under. */
export function buildTree(seed = 1, { leaves = ['green', 'brightGreen'] } = {}) {
  const r = rng(seed);
  const b = new Builder();
  b.round(0, 0, 0, 0.7, 6.0, 'reddishBrown', { studs: false });
  // canopy: stacked rings of plates, wider in the middle; layers never overlap (each starts where the last ends)
  const layers = [[3, 0], [4, 1], [5, 0], [4, 1], [2, 0]];
  let y = 6.0;
  for (const [rad, k] of layers) {
    const cells = new Set();
    for (let x = -rad; x < rad; x++) for (let z = -rad; z < rad; z++) if (Math.hypot(x + 0.5, z + 0.5) < rad + 0.3 - r() * 0.6) cells.add(`${x},${z}`);
    emitCells(b, cells, y, 2, leaves[k]);
    y += 0.8;
  }
  return named(b.build(), 'tree');
}

/** Wheat field set — see layouts.js wheatField. def: { reaped: 0..1, grown: 0..1, sparse: 0..1, tares: 0..1, sheaves: true, colors: { wheat, soil, grass, furrow, tare } } */
function wheatField(def = {}) {
  const L = getLayout({ type: 'wheat-field', ...def });
  const group = new THREE.Group();
  const size = L.size;
  const col = { wheat: ['gold', 'brightYellow', 'yellow'], ear: 'gold', stubble: 'tan', soil: 'reddishBrown', grass: 'oliveGreen', ...(def.colors || {}) };
  // grassy baseplate (printed studs), real studs near the action
  const ground = new Builder();
  ground.brick(-size / 2, -0.4, -size / 2, size, size, 1, col.grass, { studs: false });
  const gm = ground.build({ castShadow: false });
  gm.children[0].material = new THREE.MeshStandardMaterial({ map: studTexture(size, col.grass), roughness: 0.45 });
  group.add(gm);
  const F = L.field;
  const studsB = new Builder();
  for (let x = -size / 2; x < size / 2; x++) for (let z = -size / 2; z < size / 2; z++) {
    const cx = x + 0.5, cz = z + 0.5;
    const inField = cx > F.x0 && cx < F.x1 && cz > F.z0 && cz < F.z1;
    const onRoad = Math.abs(cx) < L.road.width / 2 && cz > L.road.from;
    if (!inField && !onRoad && Math.hypot(cx, cz + 4) < 22) studsB._stud(col.grass, cx, 0, cz);
  }
  group.add(studsB.build({ castShadow: false }));
  // soil under the field (one plate high), the path, the threshing floor, an irrigation canal
  const flat = new Builder();
  flat.plate(F.x0, 0, F.z0, F.x1 - F.x0, F.z1 - F.z0, col.soil, { studs: false });
  for (let z = L.road.from; z < L.road.to; z += 2) flat.tile(-L.road.width / 2, 0, z, L.road.width, 2, 'darkTan');
  const thr = new Set();
  for (let x = -3; x < 3; x++) for (let z = -3; z < 3; z++) if (Math.hypot(x + 0.5, z + 0.5) < 3.2) thr.add(`${x + L.threshing[0]},${z + L.threshing[1]}`);
  emitCells(flat, thr, 0, 1, 'tan');
  flat.tile(F.x0 - 3, 0, F.z0, 2, F.z1 - F.z0 + 6, 'mediumAzure');
  group.add(flat.build({ castShadow: false }));
  // the wheat: 3 stalks + ears per stud, merged into a few meshes (no solids: people walk into it)
  // `grown` 0..1: 0 = bare ploughed soil (furrows, nothing growing), ≈ 0.35 = short green shoots, 1 = ripe golden wheat;
  // `sparse` 0..1 = share of the field where nothing came up (a poor crop); `tares` 0..1 = share of the stalks that are
  // neghină (tares: dark stalks with purple flowers among the wheat)
  const grown = Math.max(0, Math.min(1, def.grown ?? 1));
  const sparse = Math.max(0, Math.min(1, def.sparse ?? 0));
  const tares = Math.max(0, Math.min(1, def.tares ?? 0));
  const wheat = new Builder();
  const r = rng(def.seed || 77);
  if (grown < 0.15 && def.furrows !== false) {
    // furrows: low ridges of darker earth every 2 studs across the field (on top of the soil plate, never coplanar side by side)
    for (let z = F.z0 + 0.5; z < F.z1 - 0.5; z += 2) wheat.geo(new THREE.BoxGeometry(F.x1 - F.x0 - 1, 0.18, 0.7).translate((F.x0 + F.x1) / 2, 0.47, z + 0.5), col.furrow || 'darkBrown');
  }
  for (let x = F.x0; x < F.x1; x++) for (let z = F.z0; z < F.z1; z++) {
    const standing = z + 0.5 < L.cutZ;
    const bare = sparse > 0 && r() < sparse;
    for (let k = 0; k < 3; k++) {
      // fixed slots (never overlapping: overlapping coplanar faces flicker), bottoms sunk into the soil
      const px = x + 0.18 + k * 0.32, pz = z + 0.2 + ((k * 2 + x + z * 5) % 3 + 3) % 3 * 0.28;
      const rh = r(), rt = r();
      if (standing && grown < 0.15) continue;
      if (standing && bare) continue;
      if (standing && grown < 0.6) {
        // young green shoots, no ears yet
        const h = (0.4 + rh * 0.3) + (grown - 0.15) * 3;
        const st = new THREE.BoxGeometry(0.12, h, 0.12); st.translate(px, 0.3 + h / 2, pz);
        wheat.geo(st, k % 2 ? 'brightGreen' : 'green');
      } else if (standing && rt < tares) {
        // neghină: a darker, taller stalk with a purple flower on top
        const h = 2.3 + rh * 0.6;
        const st = new THREE.BoxGeometry(0.1, h, 0.1); st.translate(px, 0.3 + h / 2, pz);
        wheat.geo(st, col.tareStalk || 'darkGreen');
        const fl = new THREE.BoxGeometry(0.34, 0.34, 0.34); fl.translate(px, 0.3 + h + 0.17, pz);
        wheat.geo(fl, col.tare || 'magenta');
      } else if (standing) {
        const h = 2.0 + rh * 0.7;
        const st = new THREE.BoxGeometry(0.1, h, 0.1); st.translate(px, 0.3 + h / 2, pz);
        wheat.geo(st, col.wheat[k % col.wheat.length]);
        const ear = new THREE.BoxGeometry(0.22, 0.7, 0.22); ear.translate(px, 0.3 + h + 0.3, pz);
        wheat.geo(ear, col.ear);
      } else {
        const h = 0.3 + rh * 0.2;
        const st = new THREE.BoxGeometry(0.1, h, 0.1); st.translate(px, 0.3 + h / 2, pz);
        wheat.geo(st, col.stubble);
      }
    }
  }
  group.add(wheat.build());
  // sheaves on the cut part + a pile on the threshing floor
  if (L.reaped > 0 && def.sheaves !== false) {
    const n = Math.floor(L.reaped * 8);
    for (let i = 0; i < n; i++) {
      const sh = createProp('sheaf', {});
      sh.position.set(F.x0 + 2 + (i % 4) * 5 + (i % 2), sh.userData.ground, F.z1 - 2 - Math.floor(i / 4) * 5);
      sh.rotation.y = i * 0.9; group.add(sh);
    }
    // the pile: a ring of up to 6 leaning sheaves (spaced so they never touch) + one on top in the middle
    const pile = Math.min(7, Math.round(L.reaped * 7));
    for (let i = 0; i < pile; i++) {
      const sh = createProp('sheaf', {});
      const top = i === 6, a = i * (Math.PI / 3);
      const d = top ? 0 : 1.35;
      sh.position.set(L.threshing[0] + Math.cos(a) * d, sh.userData.ground + (top ? 1.0 : 0), L.threshing[1] + Math.sin(a) * d);
      sh.rotation.set(top ? 0 : 0.18 * Math.cos(a), top ? 0.3 : a, top ? 0 : -0.18 * Math.sin(a)); group.add(sh);
    }
  }
  // shade tree, farmer's house, palms, dunes far away, clouds
  const tree = buildTree(5); tree.position.set(L.tree[0], 0, L.tree[1]); group.add(tree);
  const hs = L.anchors['house.hut'];
  const house = buildHut({ seed: 61, colors: ['white', 'lightNougat', 'white', 'sand'], dome: false, cross: false, roof: 'reddishBrown', matColor: 'mediumBlue' });
  house.position.set(hs.pos[0], 0, hs.pos[1]); house.rotation.y = hs.h; group.add(house);
  L.palms.forEach(([x, z], i) => { const p = buildPalm(80 + i, 8 + (i % 3) * 2); p.position.set(x, 0, z); group.add(p); });
  const dunes = new Builder();
  buildDunes(dunes, 23, 32, 46, (cx, cz, w) => cz > 0 && Math.abs(cx) < w / 2 + 5, ['tan', 'sand']);
  group.add(named(dunes.build(), 'dunes'));
  buildClouds(group, 29);
  return { group, layout: L, update() {} };
}

/** Big desert rock: a stepped mound of bricks (height map, so layers never overlap) — solid for the `clip` check. */
export function buildBigRock(seed = 3, cols = ['darkTan', 'tan'], { w = 7, d = 6, layers = 5 } = {}) {
  const r = rng(seed);
  const b = new Builder();
  const height = new Map();
  for (let i = 0; i < 4; i++) {
    const cx = Math.round((r() - 0.5) * 3), cz = Math.round((r() - 0.5) * 2);
    const ww = w - i, dd = d - i, ll = layers - i;
    for (let k = 0; k < ll; k++) {
      const a = ww - 2 * Math.floor(k / 2) - (k % 2), c = dd - 2 * Math.floor(k / 2) - (k % 2);
      if (a < 2 || c < 2) break;
      const x0 = cx - (a / 2 | 0), z0 = cz - (c / 2 | 0);
      for (let x = x0; x < x0 + a; x++) for (let z = z0; z < z0 + c; z++) height.set(`${x},${z}`, Math.max(height.get(`${x},${z}`) || 0, k + 1));
    }
  }
  const maxH = Math.max(0, ...height.values());
  for (let k = 0; k < maxH; k++) emitCells(b, [...height].filter(([, h]) => h > k).map(([key]) => key), k * 1.2, 3, cols[k % 2]);
  for (const [key, h] of height) { const [x, z] = key.split(',').map(Number); b._stud(cols[(h - 1) % 2], x + 0.5, h * 1.2, z + 0.5); }
  return named(b.build(), 'big rock');
}

// Colours of the desert road: `sand` = golden dunes (default), `red` = a rocky red desert (ochre sand, red rocks)
export const DESERT_PALETTES = {
  sand: { ground: 'sand', path: 'darkTan', dunes: ['sand', 'tan'], rocks: ['gray', 'darkGray'], bigRock: ['darkTan', 'tan'], pool: 'mediumAzure', grass: 'brightGreen' },
  // `salt` = the white desert of Nitria (natron): pale cream sand, white rocks, whitewashed cells with blue domes
  salt: { ground: 'cream', path: 'tan', dunes: ['cream', 'lightNougat'], rocks: ['white', 'lightGray'], bigRock: ['lightGray', 'gray'], pool: 'azure', grass: 'green', walls: ['white', 'cream', 'white', 'lightGray'], dome: 'mediumBlue' },
  // `dusk` = a cold, windy grey-blue rocky desert (slate sand, blue-grey rocks)
  dusk: { ground: 'gray', path: 'darkGray', dunes: ['gray', 'lightGray'], rocks: ['darkGray', 'mediumBlue'], bigRock: ['darkGray', 'gray'], pool: 'skyBlue', grass: 'oliveGreen', walls: ['lightGray', 'gray', 'lightGray', 'darkGray'], dome: 'darkBlue' },
  red: { ground: 'nougat', path: 'lightNougat', dunes: ['nougat', 'darkOrange'], rocks: ['darkOrange', 'reddishBrown'], bigRock: ['reddishBrown', 'darkOrange'], pool: 'azure', grass: 'oliveGreen' },
  // `granite` = the granite mountains of Sinai: pale grey ground, dark grey + pink granite rocks, green scrub round the pool, grey-pink cells with dark domes
  // `apricot` = soft apricot-orange dunes (a warm Sahara), cream cells with dark-green domes; looks lovely under the night and morning skies
  apricot: { ground: '#f3c48c', path: '#d8a067', dunes: ['#f3c48c', '#e6a466'], rocks: ['#b8784a', 'darkTan'], bigRock: ['#a8693f', '#d8a067'], pool: 'azure', grass: 'brightGreen', walls: ['cream', 'lightNougat', 'cream', 'tan'], dome: 'darkGreen' },
  granite: { ground: 'lightGray', path: 'darkTan', dunes: ['pink', 'lightGray'], rocks: ['pink', 'darkGray'], bigRock: ['darkGray', 'pink'], pool: 'mediumAzure', grass: 'green', walls: ['lightGray', 'pink', 'gray', 'lightGray'], dome: 'darkGray' },
};

/** Desert road set — see layouts.js desertRoad. def: { palette: "sand"|"red"|"salt"|…, cells: 0|1|2, oasis: true, rock: true, road: true }
 *  `road: false` = the same place with no road: open dunes where travellers can lose their way (or a sandy track you can't see at night);
 *  `clear: [x, z, r]` = no small rocks within r of [x, z] (a spot where people sit / lie down). */
function desertRoad(def = {}) {
  const L = getLayout({ type: 'desert-road', ...def });
  const group = new THREE.Group();
  const size = L.size;
  const P = DESERT_PALETTES[def.palette || 'sand'] || DESERT_PALETTES.sand;
  const ground = new Builder();
  ground.brick(-size / 2, -0.4, -size / 2, size, size, 1, P.ground, { studs: false });
  const gm = ground.build({ castShadow: false });
  gm.children[0].material = new THREE.MeshStandardMaterial({ map: studTexture(size, P.ground), roughness: 0.4 });
  group.add(gm);
  // the winding road: cells along the centre line (emitCells → tiles never overlap)
  const roadCells = new Set();
  if (def.road !== false) for (let z = L.road.from; z < L.road.to; z++) {
    const cx = Math.round(desertRoadX(z + 0.5) - L.road.width / 2);
    for (let x = cx; x < cx + L.road.width; x++) roadCells.add(`${x},${z}`);
  }
  const onRoad = (x, z) => roadCells.has(`${x},${z}`);
  const pool = new Set();
  if (def.oasis !== false) for (let x = -3; x < 3; x++) for (let z = -2; z < 2; z++) if (Math.hypot((x + 0.5) / 3, (z + 0.5) / 2) < 1.05) pool.add(`${x + L.pool[0]},${z + L.pool[1]}`);
  const grass = new Set();
  if (def.oasis !== false) for (let x = -5; x < 5; x++) for (let z = -4; z < 4; z++) {
    const k = `${x + L.pool[0]},${z + L.pool[1]}`;
    if (Math.hypot((x + 0.5) / 5, (z + 0.5) / 4) < 1.02 && !pool.has(k)) grass.add(k);
  }
  // real studs only near the action, not under the road / the pool
  const studsB = new Builder();
  for (let x = -size / 2; x < size / 2; x++) for (let z = -size / 2; z < size / 2; z++) {
    const k = `${x},${z}`;
    if (Math.hypot(x + 0.5, z + 0.5) < 22 && !onRoad(x, z) && !pool.has(k) && !grass.has(k)) studsB._stud(P.ground, x + 0.5, 0, z + 0.5);
  }
  group.add(studsB.build({ castShadow: false }));
  const flat = new Builder();
  emitCells(flat, roadCells, 0, 1, P.path);
  emitCells(flat, grass, 0, 1, P.grass);
  emitCells(flat, pool, 0, 1, P.pool);
  group.add(flat.build({ castShadow: false }));
  // dunes on both sides, leaving the road corridor free
  const dunes = new Builder();
  // set `pieces` (buildings, trees… from landmarks.js) keep the dunes away: `free` = radius kept clear (8)
  const keepFree = [...L.cells.map((c) => [c.pos, 8]), [L.rock, 6], [L.pool, 7], ...(def.pieces || []).map((p) => [p.at || [0, 0], p.free ?? 8])];
  // (no road: the dunes close in all around, only the middle where the travellers stop stays free)
  buildDunes(dunes, def.seed || 47, 18, 44, (cx, cz, w, d) => (Math.abs(cx - desertRoadX(cz)) < w / 2 + 6 && (def.road !== false || Math.abs(cz) < d / 2 + 14))
    || keepFree.some(([[x, z], r]) => Math.abs(cx - x) < w / 2 + r && Math.abs(cz - z) < d / 2 + r), P.dunes);
  group.add(named(dunes.build(), 'dunes'));
  const duneCells = dunes.heights;
  // the big rock with its shade
  if (def.rock !== false) { const rk = buildBigRock(9, P.bigRock); rk.position.set(L.rock[0], 0, L.rock[1]); group.add(rk); }
  // scattered small rocks (half-stud offsets: never in the plane of the ground studs), off the road
  const rocks = new Builder(); const r = rng(def.seed || 19); const used = new Set();
  for (let i = 0; i < 18; i++) {
    const x = Math.round((r() - 0.5) * 44), z = Math.round((r() - 0.5) * 44);
    const cellsOf = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, c]) => `${x + a},${z + c}`);
    const near = (k) => { const [a, c] = k.split(',').map(Number); return [-1, 0, 1, 2].some((dx) => [-1, 0, 1, 2].some((dz) => onRoad(a + dx, c + dz))); };
    if (cellsOf.some((k) => used.has(k) || near(k) || pool.has(k) || grass.has(k) || duneCells.has(k))) continue;
    if (Math.hypot(x - L.rock[0], z - L.rock[1]) < 7) continue;
    if (def.clear && Math.hypot(x - def.clear[0], z - def.clear[1]) < (def.clear[2] ?? 6)) continue; // a clear spot (a camp)
    if ((def.pieces || []).some((p) => Math.hypot(x - (p.at?.[0] || 0), z - (p.at?.[1] || 0)) < (p.free ?? 8))) continue;
    cellsOf.forEach((k) => used.add(k));
    rocks.brick(x + 0.5, 0, z + 0.5, 1, 1, 2 + (i % 3), P.rocks[i % 2], { studs: true });
  }
  group.add(named(rocks.build(), 'small rocks'));
  // hermit cells at the back of the road
  L.cells.forEach((c, i) => {
    const hut = buildHut({ seed: 70 + i, colors: def.walls || P.walls || MUD, dome: def.dome || P.dome || 'white', roof: 'darkTan' });
    hut.position.set(c.pos[0], 0, c.pos[1]); hut.rotation.y = c.h; group.add(hut);
  });
  L.palms.forEach(([x, z], i) => { const p = buildPalm(90 + i, 8 + (i % 3) * 2); p.position.set(x, 0, z); group.add(p); });
  buildClouds(group, 37);
  return { group, layout: L, update() {} };
}

/** Papyrus clump: tall thin stalks with a green umbrella tuft on top, merged into the builder `b` (round stalks: no coplanar faces). */
function addPapyrus(b, x, z, seed, n = 6) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const h = 3.2 + r() * 2.4, px = x + (r() - 0.5) * 1.8, pz = z + (r() - 0.5) * 1.4;
    const st = new THREE.CylinderGeometry(0.05, 0.08, h, 5); st.translate(px, -0.1 + h / 2, pz);
    b.geo(st, i % 2 ? 'brightGreen' : 'green');
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + i * 0.9 + r() * 0.35;
      const leaf = new THREE.BoxGeometry(0.05 + k * 0.004, 0.04 + k * 0.003, 0.95 - k * 0.02); leaf.translate(0, 0, 0.47);
      leaf.rotateX(0.55); leaf.rotateY(a); leaf.translate(px, -0.1 + h, pz);
      b.geo(leaf, k % 2 ? 'green' : 'brightGreen');
    }
  }
}

/** Little wooden rowing boat floating on the water (local frame: bow towards +Z, centred on the water line). */
export function buildBoat() {
  const b = new Builder();
  b.brick(-1.5, -0.3, -3, 3, 6, 1, 'tan', { studs: false });              // floor
  b.brick(-1.5, -0.3, 3, 3, 1, 1, 'tan', { studs: false }).brick(-1, 0.1, 3, 2, 1, 2, 'reddishBrown', { studs: false }); // bow
  for (const x of [-1.5, 1]) b.brick(x, 0.1, -3, 0.5, 6, 2, 'reddishBrown', { studs: false });                 // sides
  b.brick(-1, 0.1, -3, 2, 0.5, 2, 'reddishBrown', { studs: false });      // stern
  b.brick(-1, 0.1, -0.5, 2, 1, 1, 'brown', { studs: false });             // rowing seat
  return named(b.build(), 'boat');
}

/** Net-drying rack: two posts and a crossbar with a fishing net hanging from it (local frame: net faces +Z). */
export function buildNetRack() {
  const b = new Builder();
  for (const x of [-2.85, 2.35]) b.brick(x, 0, -0.25, 0.5, 0.5, 18, 'brown', { studs: false });
  b.brick(-3.1, 7.2, -0.3, 6.2, 0.6, 1, 'reddishBrown', { studs: false });
  const g = b.build();
  const n = createProp('net', { hung: true, width: 4.6, height: 3.2 });
  n.position.set(-0.25, 7.15, 0.05); g.add(n);
  return named(g, 'net rack');
}

/**
 * Sandy bank of the Nile: the river along the back (water for z < layout.waterZ, a far green bank behind it), warm sand
 * with a path from +Z to a small hermit hut, a net-drying rack, a rowing boat, papyrus clumps and palms along the water.
 * def: { palette: "sand" | "gold", huts: {...} }
 */
export const NILE_PALETTES = {
  sand: { ground: 'sand', wet: 'tan', path: 'darkTan', dunes: ['sand', 'tan'], water: 'mediumAzure', walls: ['cream', 'lightNougat', 'sand', 'cream', 'lightNougat'], dome: 'azure', far: 'brightGreen' },
};
function nileBank(def = {}) {
  const L = getLayout({ type: 'nile-bank', ...def });
  const group = new THREE.Group();
  const size = L.size;
  const P = NILE_PALETTES[def.palette || 'sand'] || NILE_PALETTES.sand;
  const wz = L.waterZ;          // the waterline z; the wet-sand strip lies just outside it
  const landZ0 = wz + 1.2;      // dry land starts here
  // river bed (so no hairline gaps show between water pieces), land, wet sand, water, far bank — no overlapping volumes
  const base = new Builder();
  base.brick(-size / 2, -1.3, -size / 2, size, size, 1, 'darkTan', { studs: false });
  const baseMesh = base.build({ castShadow: false });
  group.add(baseMesh);
  const land = new Builder();
  land.brick(-size / 2, -0.4, landZ0, size, size / 2 - landZ0, 1, P.ground, { studs: false });
  const landMesh = land.build({ castShadow: false });
  const tex = studTexture(size, P.ground); tex.repeat.set(size, size / 2 - landZ0);
  landMesh.children[0].material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 });
  group.add(landMesh);
  const water = new Builder();
  water.brick(-size / 2, -0.4, wz, size, landZ0 - wz, 1, P.wet, { studs: false });          // wet sand (flush with the land)
  water.brick(-size / 2, -0.55, -size / 2 + 6, size, wz - (-size / 2 + 6), 1, P.water, { studs: false }); // water, top at -0.15
  water.brick(-size / 2, -0.55, -size / 2, size, 6, 2, P.far, { studs: false });                              // far bank (grass), top at 0.25
  group.add(water.build({ castShadow: false }));
  // ripples and sparkles on the water (thin white slivers a hair above it)
  const rip = new Builder(); const rr = rng(33);
  for (let i = 0; i < 26; i++) {
    const w = 1.2 + rr() * 2.2, x = (rr() - 0.5) * 70, z = -size / 2 + 7 + rr() * (wz - 2.5 - (-size / 2 + 7));
    rip.geo(new THREE.BoxGeometry(w, 0.03, 0.09).translate(x, -0.12, z), i % 3 ? 'skyBlue' : 'white');
  }
  group.add(rip.build({ castShadow: false }));
  // the path from the road (+Z) to the hut door, as cells (tiles never overlap)
  const pts = [[0, 40], [0, 16], [3.5, 7], [L.anchors.hut.pos[0], L.anchors.hut.pos[1] + 1.5]];
  const pathCells = new Set();
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) * 2);
    for (let k = 0; k <= steps; k++) {
      const cx = ax + (bx - ax) * k / steps, cz = az + (bz - az) * k / steps;
      for (let dx = -2; dx <= 1; dx++) for (let dz = -2; dz <= 1; dz++) if (Math.hypot(Math.floor(cx) + dx + 0.5 - cx, Math.floor(cz) + dz + 0.5 - cz) < 1.6) pathCells.add(`${Math.floor(cx) + dx},${Math.floor(cz) + dz}`);
    }
  }
  const flat = new Builder();
  emitCells(flat, pathCells, 0, 1, P.path);
  group.add(flat.build({ castShadow: false }));
  // real studs only near the action
  const studsB = new Builder();
  const hp = L.hut.pos;
  for (let x = -size / 2; x < size / 2; x++) for (let z = Math.ceil(landZ0); z < size / 2; z++) {
    if (Math.hypot(x + 0.5, z + 0.5 + 4) < 23 && !pathCells.has(`${x},${z}`) && !(Math.abs(x + 0.5 - hp[0]) < 6 && Math.abs(z + 0.5 - hp[1]) < 5.5)) studsB._stud(P.ground, x + 0.5, 0, z + 0.5);
  }
  group.add(studsB.build({ castShadow: false }));
  // dunes at the sides and front, none by the water or on the path
  const dunes = new Builder();
  buildDunes(dunes, 29, 28, 44, (cx, cz, w, d) => cz < -4 || (Math.abs(cx) < w / 2 + 6 && cz > 0), P.dunes);
  group.add(named(dunes.build(), 'dunes'));
  // Avva's hut
  const hut = buildHut({ seed: 12, colors: def.walls || P.walls, dome: P.dome, roof: 'darkTan', matColor: 'mediumBlue', ...(def.huts?.[0] || {}) });
  hut.position.set(L.hut.pos[0], 0, L.hut.pos[1]); hut.rotation.y = L.hut.h; group.add(hut);
  // net-drying rack, boat
  const rack = buildNetRack(); rack.position.set(L.rack.pos[0], 0, L.rack.pos[1]); rack.rotation.y = L.rack.h; group.add(rack);
  const boat = buildBoat(); boat.position.set(L.boat.pos[0], 0, L.boat.pos[1]); boat.rotation.y = L.boat.h; group.add(boat);
  // papyrus clumps along the water (the middle stays open for the view of the river), and a few on the far bank
  const pap = new Builder();
  [[-31, -17.5], [-26, -18.6], [-19, -18], [-14.5, -18.8], [14, -18.6], [18.5, -18.2], [24, -18.9], [29.5, -17.6], [-35, -16], [34, -15.5]]
    .forEach(([x, z], i) => addPapyrus(pap, x, z, 100 + i, 6));
  [[-20, -36.5], [-6, -37], [8, -36.5], [22, -37.5]].forEach(([x, z], i) => addPapyrus(pap, x, z, 140 + i, 5));
  group.add(pap.build());
  // palms
  L.palms.forEach(([x, z], i) => { const p = buildPalm(120 + i, 8 + (i % 3) * 2); p.position.set(x, 0, z); group.add(p); });
  [[-12, -38.5], [15, -38.5]].forEach(([x, z], i) => { const p = buildPalm(130 + i, 9); p.position.set(x, 0.25, z); group.add(p); });
  buildClouds(group, 43);
  return { group, layout: L, update() {} };
}

/**
 * Chilia din pustie — see layouts.js desertHermitage: the sandstone cell of the poster "Ușa prieteniei" (landmarks.js
 * `sandCell`, its door left out: add the prop `plankDoor` at `door.hinge`, or `"door": 0..1` = a static door that open),
 * a path from the front left to the door, a tall palm on the left, golden dunes behind, grey boulders and pebbles.
 * def: { door: false | 0..1 (default false), palette: "sand" }
 */
export const HERMITAGE_PALETTES = {
  sand: { ground: 'sand', path: 'tan', dunes: ['sand', 'tan'], rocks: ['gray', 'darkGray', 'lightGray', 'gray'] },
};
function desertHermitage(def = {}) {
  const L = getLayout({ type: 'desert-hermitage', ...def });
  const group = new THREE.Group();
  const size = L.size;
  const P = HERMITAGE_PALETTES[def.palette || 'sand'] || HERMITAGE_PALETTES.sand;
  const ground = new Builder();
  ground.brick(-size / 2, -0.4, -size / 2, size, size, 1, P.ground, { studs: false });
  const gm = ground.build({ castShadow: false });
  gm.children[0].material = new THREE.MeshStandardMaterial({ map: studTexture(size, P.ground), roughness: 0.4 });
  group.add(gm);
  // the path: cells along the polyline (tiles never overlap)
  const pathCells = new Set();
  for (let i = 0; i < L.path.length - 1; i++) {
    const [ax, az] = L.path[i], [bx, bz] = L.path[i + 1];
    const steps = Math.ceil(Math.hypot(bx - ax, bz - az) * 2);
    for (let k = 0; k <= steps; k++) {
      const cx = ax + (bx - ax) * k / steps, cz = az + (bz - az) * k / steps;
      for (let dx = -2; dx <= 1; dx++) for (let dz = -2; dz <= 1; dz++) if (Math.hypot(Math.floor(cx) + dx + 0.5 - cx, Math.floor(cz) + dz + 0.5 - cz) < 1.7) pathCells.add(`${Math.floor(cx) + dx},${Math.floor(cz) + dz}`);
    }
  }
  const [cx0, cz0] = L.cell.pos;
  const inCell = (x, z) => Math.abs(x + 0.5 - cx0) < 9.6 && z + 0.5 > cz0 - 6 && z + 0.5 < cz0 + 6.7;
  const flat = new Builder();
  emitCells(flat, [...pathCells].filter((k) => { const [x, z] = k.split(',').map(Number); return !inCell(x, z); }), 0, 1, P.path);
  group.add(flat.build({ castShadow: false }));
  const studsB = new Builder();
  for (let x = -size / 2; x < size / 2; x++) for (let z = -size / 2; z < size / 2; z++) {
    if (Math.hypot(x + 0.5 - 2, z + 0.5 + 2) < 24 && !pathCells.has(`${x},${z}`) && !inCell(x, z)) studsB._stud(P.ground, x + 0.5, 0, z + 0.5);
  }
  group.add(studsB.build({ castShadow: false }));
  // the cell
  const cell = createProp('sandCell', { door: def.door ?? false });
  cell.position.set(cx0, 0, cz0); cell.rotation.y = L.cell.h; group.add(cell);
  // dunes: behind and at the sides, the front and the middle stay open
  const dunes = new Builder();
  buildDunes(dunes, def.seed || 53, 22, 44, (cx, cz, w, d) => (cz > -16 && Math.abs(cx) < 24 + w / 2) || (Math.abs(cx - cx0) < w / 2 + 12 && Math.abs(cz - cz0) < d / 2 + 9), P.dunes);
  group.add(named(dunes.build(), 'dunes'));
  // grey boulders and pebbles (half-stud offsets: never in the plane of the ground studs)
  [[-13, -3, 0.42, 5], [19, -4, 0.5, 6], [-2, 13, 0.3, 7], [16, 9, 0.34, 8], [-22, 4, 0.55, 9]].forEach(([x, z, sc, seed]) => {
    const rk = createProp('rocks', { size: sc, seed, colors: P.rocks }); rk.position.set(x, 0, z); rk.rotation.y = seed; group.add(named(rk, 'boulders'));
  });
  const peb = new Builder(); const r = rng(def.seed || 23); const used = new Set();
  for (let i = 0; i < 26; i++) {
    const x = Math.round((r() - 0.5) * 40), z = Math.round((r() - 0.5) * 36);
    const cellsOf = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([a, c]) => `${x + a},${z + c}`);
    const near = (k) => { const [a, c] = k.split(',').map(Number); return [-1, 0, 1, 2].some((dx) => [-1, 0, 1, 2].some((dz) => pathCells.has(`${a + dx},${c + dz}`))); };
    if (cellsOf.some((k) => used.has(k) || near(k) || dunes.heights.has(k))) continue;
    if (Math.abs(x - cx0) < 11 && Math.abs(z - cz0) < 9) continue;
    if (Math.hypot(x + 5, z + 4) < 6 || Math.hypot(x - 2, z - 1) < 6) continue; // the palm shade and the middle stay clear
    cellsOf.forEach((k) => used.add(k));
    peb.brick(x + 0.5, 0, z + 0.5, 1 + (i % 2), 1, 1 + (i % 3), P.rocks[i % 2], { studs: true });
  }
  group.add(named(peb.build(), 'small rocks'));
  L.palms.forEach(([x, z, h], i) => { const p = createProp('palm', { height: h || 9, seed: 5 + i * 3 }); p.position.set(x, 0, z); group.add(p); });
  buildClouds(group, 61);
  // chunky brick clouds just above the dunes behind the cell (seen in low shots, like the poster)
  const cl = new Builder();
  [[-34, 21, -62, 3], [4, 27, -74, 4], [36, 19, -58, 3], [-62, 24, -30, 2], [58, 25, -36, 2]].forEach(([x, y, z, n]) => {
    for (let k = 0; k < n; k++) cl.brick(x + k * 3 - n * 1.5, y + (k % 2) * 1.2, z + (k % 2) * 0.5, 4 + (k % 2) * 2, 3, 3, 'white', { studs: true });
    cl.brick(x - n * 1.5 + 1, y + 2.5, z + 0.25, n * 3 - 1, 2, 3, 'white', { studs: true });
  });
  group.add(named(cl.build({ castShadow: false }), 'clouds'));
  return { group, layout: L, update() {} };
}


/**
 * cave-hermitage (peștera din stâncă — the poster of „Avva Siluan”): sandy studded ground with scattered round tiles, the grey
 * cave rock on the right (layouts.js → caveHermitage), stone seats at its mouth, a terraced hill with a monastery and cypresses
 * behind on the left, purple mountains on the horizon, spiky green plants and grey rocks in front, sunset-lit brick clouds.
 * Put the icon on the back wall with a prop: `"icona": { "type": "icon", "src": "assets/icons/…", "at": "icon", "y": 3.2, "size": 2.4 }`.
 */
function caveHermitage(def = {}) {
  const L = getLayout({ type: 'cave-hermitage', ...def });
  const group = new THREE.Group();
  const size = L.size, ground = '#d9bb8b';
  const gb = new Builder();
  gb.brick(-size / 2, -0.4, -size / 2, size, size, 1, ground, { studs: false });
  const gm = gb.build({ castShadow: false });
  gm.children[0].material = new THREE.MeshStandardMaterial({ map: studTexture(size, ground), roughness: 0.45 });
  group.add(gm);
  const [cx, cz] = L.cave.pos, h = L.cave.h;
  const toLocal = (x, z) => { const dx = x - cx, dz = z - cz; return [dx * Math.cos(h) - dz * Math.sin(h), dx * Math.sin(h) + dz * Math.cos(h)]; };
  const inRock = (x, z) => { const [lx, lz] = toLocal(x, z); return Math.hypot(lx / 13.5, (lz + 3.5) / 8.8) < 1.05 || (lz < 4.5 && Math.abs(lx) < 13 && lz > -12); };
  // real studs near the middle (the camera is close here), round tiles scattered round them
  const studsB = new Builder(), tiles = new Builder(), r = rng(def.seed || 19);
  const seatNear = (x, z) => L.seats.some(([sx, sz]) => Math.hypot(x + 0.5 - sx, z + 0.5 - sz) < 1.9);
  const used = new Set();
  for (let x = -26; x < 26; x++) for (let z = -18; z < 26; z++) {
    if (inRock(x + 0.5, z + 0.5) || seatNear(x, z)) continue;
    const k = r();
    if (k < 0.14 && !used.has(`${x},${z}`)) { used.add(`${x},${z}`); tiles.round(x + 0.5, 0, z + 0.5, 0.44, 0.4, ['tan', 'lightGray', 'sand', 'gray', 'darkTan'][Math.floor(r() * 5)], { studs: r() < 0.5, seg: 14 }); }
    else studsB._stud(ground, x + 0.5, 0, z + 0.5);
  }
  group.add(studsB.build({ castShadow: false }), named(tiles.build(), 'small rocks'));
  const cave = createProp('caveRock', { seats: [toLocal(...L.seats[0]).concat(['lightGray', def.elderSeat || 1.2]), toLocal(...L.seats[1]).concat(['tan'])], glow: def.glow });
  cave.position.set(cx, 0, cz); cave.rotation.y = h; group.add(cave);
  // backdrop: the monastery hill, a lower hill, mountains, the sun-side dunes
  const hill = createProp('hillMonastery', { seed: 33, radius: 23, height: 10 }); hill.position.set(2, 0, -80); hill.rotation.y = 0; hill.scale.setScalar(1.15); group.add(named(hill, 'hill'));
  const hill2 = createProp('hill', { radius: 12, height: 5, seed: 7, bushes: false }); hill2.position.set(-50, 0, -30); group.add(hill2);
  const mts = createProp('mountains', {}); mts.position.set(-20, 0, -120); group.add(mts);
  const mts2 = createProp('mountains', { seed: 4 }); mts2.position.set(-115, 0, -40); mts2.rotation.y = Math.PI / 2; group.add(mts2);
  const dunes = new Builder();
  buildDunes(dunes, def.seed || 29, 28, 46, (x, z, w, d) => (z > -22 && x > -30) || inRock(x, z) || (x < 20 && z < -10 && x > -60), ['sand', 'tan']);
  group.add(named(dunes.build(), 'dunes'));
  // cypresses and a palm by the rock, rocks and spiky plants in front
  [[-36, -30, 12, 1], [-40, -26, 9, 2], [26, -22, 10, 3], [-46, -14, 11, 4]].forEach(([x, z, hh, sd]) => { const c = createProp('cypress', { height: hh, seed: sd }); c.position.set(x, 0, z); group.add(c); });
  [[-12, 4, 0.5, 3], [-9, 12, 0.32, 6], [15, 5, 0.42, 2], [4, 15, 0.3, 8], [-1.4, -3.4, 0.16, 11], [5.8, -3.8, 0.15, 12]].forEach(([x, z, sc, seed]) => {
    const rk = createProp('rocks', { size: sc, seed }); rk.position.set(x, 0, z); rk.rotation.y = seed; group.add(named(rk, 'boulders'));
  });
  [[-10.5, 7, 1.1, 1], [-4, 11.5, 0.9, 2], [4.5, 8.5, 1.0, 3], [-13, -2, 1.2, 4], [13, 2, 1.1, 5], [-7.5, -4, 0.9, 6], [-0.5, -2.8, 0.8, 7], [4.9, -3.2, 0.9, 8]].forEach(([x, z, s0, seed]) => {
    const p = createProp('spiky', { size: s0, seed }); p.position.set(x, 0, z); group.add(named(p, 'plant'));
  });
  buildClouds(group, 71);
  const cl = new Builder();
  [[-46, 15, -70, 4, 'cream'], [-14, 23, -82, 3, 'lightNougat'], [-70, 12, -50, 3, 'cream'], [26, 26, -76, 3, 'lightNougat'], [-30, 30, -90, 2, 'white']].forEach(([x, y, z, n, c]) => {
    for (let k = 0; k < n; k++) cl.brick(x + k * 3 - n * 1.5, y + (k % 2) * 1.2, z + (k % 2) * 0.5, 4 + (k % 2) * 2, 3, 3, c, { studs: true });
    cl.brick(x - n * 1.5 + 1, y + 2.5, z + 0.25, n * 3 - 1, 2, 3, c, { studs: true });
  });
  const clouds = cl.build({ castShadow: false });
  clouds.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.emissive = new THREE.Color(0xff8a40); o.material.emissiveIntensity = 0.4; } });
  group.add(named(clouds, 'clouds'));
  return { group, layout: L, update() {} };
}

/**
 * monastery-yard (curtea mănăstirii — the scene of „Avva Teodor și grâul cel bun”, layouts.js → monasteryYard): a paved sandy
 * court of studs with scattered round tiles; the grey cave rock on the left (a bed and a burning torch inside), the arcaded
 * sandstone wing with its domed bell tower at the back, a roofed stone well on the right, palms, red-ochre mountains.
 */
function monasteryYard(def = {}) {
  const L = getLayout({ type: 'monastery-yard', ...def });
  const group = new THREE.Group();
  const size = L.size, ground = def.ground || '#dcc193';
  const gb = new Builder();
  gb.brick(-size / 2, -0.4, -size / 2, size, size, 1, ground, { studs: false });
  const gm = gb.build({ castShadow: false });
  gm.children[0].material = new THREE.MeshStandardMaterial({ map: studTexture(size, ground), roughness: 0.45 });
  group.add(gm);
  const [cx, cz] = L.cave.pos, h = L.cave.h;
  const toLocal = (x, z) => { const dx = x - cx, dz = z - cz; return [dx * Math.cos(h) - dz * Math.sin(h), dx * Math.sin(h) + dz * Math.cos(h)]; };
  const inRock = (x, z) => { const [lx, lz] = toLocal(x, z); return Math.hypot(lx / 13.5, (lz + 3.5) / 8.8) < 1.05 || (lz < 4.8 && lx > -7 && lx < 13 && lz > -12); };
  const [kx, kz] = L.cloister.pos, inCloister = (x, z) => x > kx - 13.5 && x < kx + 20 && z > kz - 6 && z < kz + 5.2;
  const [wx, wz] = L.well.pos, inWell = (x, z) => Math.hypot(x - wx, z - wz) < 3.4;
  const studsB = new Builder(), tiles = new Builder(), r = rng(def.seed || 17);
  for (let x = -30; x < 30; x++) for (let z = -24; z < 28; z++) {
    const px = x + 0.5, pz = z + 0.5;
    if (inRock(px, pz) || inCloister(px, pz) || inWell(px, pz)) continue;
    const clear = (def.clear || []).some(([qx, qz, qr]) => Math.hypot(px - qx, pz - qz) < qr); // `clear`: [[x, z, r], …] = only flat studs there
    if (r() < 0.16 && !clear) tiles.round(px, 0, pz, 0.44, 0.4, ['tan', 'sand', 'lightNougat', 'darkTan', 'sand'][Math.floor(r() * 5)], { studs: r() < 0.4, seg: 14 });
    else studsB._stud(ground, px, 0, pz);
  }
  group.add(studsB.build({ castShadow: false }), named(tiles.build(), 'small rocks'));
  const cave = createProp('caveRock', { seed: 81, glow: def.glow, boulders: [[5.6, 10.8, 2.0, 3.2], [8.6, 8.2, 2.4, 2.8], [1.2, 13.2, 0.6, 3.0], [-2.8, 14.2, -0.6, 2.6], [2.6, 10.9, 2.9, 2.0], [10.5, 3.6, 3.4, 2.4]] });
  cave.position.set(cx, 0, cz); cave.rotation.y = h; group.add(cave);
  // inside the cave: a bed on the left, a torch by the mouth
  const at = (lx, lz) => L.local(lx, lz);
  const bd = createProp('bed', { length: 4.4 }); const [bx, bz] = at(-3.1, -0.8); bd.position.set(bx, 0.4, bz); bd.rotation.y = h; group.add(named(bd, 'bed'));
  const tc = createProp('torch', { height: 3.0 }); const [tx, tz] = at(-4.4, 1.6); tc.position.set(tx, 0.4, tz); group.add(named(tc, 'torch'));
  const cl = createProp('cloister', { arches: 6 }); cl.position.set(kx, 0, kz); group.add(cl);
  // dressing of the court (like the poster): amphorae and planters with spiky plants along the arcade, a bench in the
  // gallery, a barrel in the cave
  [[-6.6, -12.4, 0.6, 'darkOrange'], [9.4, -12.6, 0.7, '#b8562e'], [-5.4, -12.9, 0.45, '#c8703a']].forEach(([x, z, sz, c]) => { const a = createProp('amphora', { size: sz, color: c }); a.position.set(x, 0.2, z); group.add(named(a, 'amphora')); });
  const pl = new Builder();
  for (const [x, z] of [[3, -13.6], [13, -13.6]]) { pl.brick(x, 0, z, 3, 2, 2, 'tan', { studs: false }); pl.brick(x + 0.2, 0.8, z + 0.2, 2.6, 1.6, 1, 'reddishBrown', { studs: false }); }
  group.add(named(pl.build(), 'planters'));
  [[4.5, -12.6, 0.6, 31], [14.5, -12.6, 0.65, 32]].forEach(([x, z, sz, sd]) => { const p = createProp('spiky', { size: sz, seed: sd }); p.position.set(x, 1.2, z); group.add(named(p, 'plant')); });
  const bn = createProp('bench', {}); bn.position.set(-1, 0.4, -18.8); group.add(named(bn, 'bench'));
  const br = createProp('barrel', { size: 0.9 }); const [rx, rz] = L.local(5.0, 0.6); br.position.set(rx, 0.4, rz); group.add(named(br, 'barrel'));
  const wl = createProp('stoneWell', { roof: true }); wl.position.set(wx, 0, wz); wl.rotation.y = L.well.h; group.add(wl);
  L.palms.forEach(([x, z, hh], i) => { const p = createProp('palm', { height: hh || 9, seed: 7 + i * 4 }); p.position.set(x, 0, z); group.add(p); });
  [[-12, 9, 0.9, 1], [8, 9, 0.8, 2], [-14, -9, 1.0, 3], [21, 1, 1.0, 4], [-3, -11.5, 0.8, 5], [10, -11.6, 0.9, 6]].forEach(([x, z, s0, seed]) => {
    const p = createProp('spiky', { size: s0, seed }); p.position.set(x, 0, z); group.add(named(p, 'plant'));
  });
  [[-26, 10, 0.4, 3], [22, 16, 0.32, 6]].forEach(([x, z, sc, seed]) => { const rk = createProp('rocks', { size: sc, seed }); rk.position.set(x, 0, z); rk.rotation.y = seed; group.add(named(rk, 'boulders')); });
  // backdrop: red-ochre mesas, dunes
  const mts = createProp('mountains', { colors: ['#b8673f', '#a65a36', '#c77a4c'], seed: 12 }); mts.position.set(0, 0, -120); group.add(mts);
  const mts2 = createProp('mountains', { colors: ['#c98a5a', '#b06a42'], seed: 5 }); mts2.position.set(-120, 0, -30); mts2.rotation.y = Math.PI / 2; group.add(mts2);
  const dunes = new Builder();
  buildDunes(dunes, def.seed || 31, 30, 46, (x, z, w, d) => z + d / 2 > -31 || inRock(x, z), ['sand', 'tan']);
  group.add(named(dunes.build(), 'dunes'));
  buildClouds(group, 71);
  return { group, layout: L, update() {} };
}

export const SETS = { 'monastery-yard': monasteryYard, 'cave-hermitage': caveHermitage, 'desert-hermitage': desertHermitage, 'nile-bank': nileBank, 'desert-lavra': desertLavra, 'egypt-village': egyptVillage, 'wheat-field': wheatField, 'desert-road': desertRoad };

export function createSet(def) {
  const d = typeof def === 'string' ? { type: def } : def;
  const fn = SETS[d.type];
  if (!fn) throw new Error(`Unknown set "${d.type}". Known: ${Object.keys(SETS).join(', ')}`);
  SMOOTH.on = !!d.smooth;
  try {
    const set = fn(d);
    // "pieces": extra buildings / landscape pieces baked into the set (solid for the `clip` check), e.g.
    // [{ "type": "chapel", "at": [x, z], "h": 90, ...options }] — any prop type works (landmarks.js)
    for (const pc of d.pieces || []) {
      const { type, at = [0, 0], h = 0, y = 0, ...o } = pc;
      const obj = createProp(type, o);
      obj.position.set(at[0], y, at[1]); obj.rotation.y = (h * Math.PI) / 180;
      set.group.add(obj);
    }
    return set;
  } finally { SMOOTH.on = false; }
}
void color;
