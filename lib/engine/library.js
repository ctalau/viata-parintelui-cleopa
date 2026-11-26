// Library sheet: every reusable piece rendered on its own (no film), laid out like a printed asset board.
// Opened by tools/library.mjs (`npm run library`) → window.__sheet = JPEG data URL.
import * as THREE from 'three';
import { createMinifig } from '../components/minifig.js';
import { createProp, PROPS } from '../components/props.js';

const Q = new URLSearchParams(location.search);
const TILE = +(Q.get('tile') || 300), PAD = 14, LAB = 52, COLS = Q.get('only') ? Math.min(4, Q.get('only').split(',').length) : 7;

// figure + what it holds: [prop type, opts, hand]
const fig = (look, held = []) => ({ fig: look, held });
const prop = (type, opts = {}, view = {}) => ({ prop: type, opts, view });

export const SHEET = [
  ['PERSONAJE', [
    ['Avva Pimen', fig({ preset: 'elder-monk', robe: 'black', legs: 'black', robeLong: true, hat: 'cowl', hatColor: 'black', beard: 'flowing', beardLength: 1.2, beardColor: 'white', brows: 'bushy', browColor: 'white', eyes: 'big', blush: false, belt: 'darkGray', cord: 'darkGray' }, [['staff', { straight: true }, 'R']])],
    ['Avva Antonie', fig({ preset: 'elder-monk', robe: '#8b5a2b', legs: '#8b5a2b', robeLong: true, hat: 'cowl', hatColor: '#7a4a26', beard: 'flowing', beardShape: 'forked', beardLength: 1.0, beardColor: 'lightGray', brows: 'bushy', browColor: 'lightGray', eyes: 'big', blush: false, belt: 'tan', cord: 'tan', emotion: 'warm' })],
    ['Avva Macarie', fig({ preset: 'elder-monk', robe: 'tan', legs: 'tan', robeLong: true, hat: 'cowl', hatColor: 'sand', beard: 'flowing', beardShape: 'pointed', beardLength: 1.1, beardColor: 'gray', brows: 'bushy', browColor: 'gray', eyes: 'big', blush: false, belt: 'reddishBrown', cord: 'reddishBrown' }, [['staff', { straight: true }, 'R']])],
    ['Frate tânăr / novice', fig({ preset: 'young-monk', hat: 'none', robe: '#9a5b32', legs: '#9a5b32', robeLong: true, belt: 'tan', cord: 'tan', eyes: 'big', emotion: 'joy' })],
    ['Plugar (sapă)', fig({ preset: 'villager', hat: 'straw', hatColor: 'yellow', bandColor: 'reddishBrown', robe: 'cream', legs: 'reddishBrown', print: 'tunic', vest: 'reddishBrown', stripe: 'cream', belt: 'darkBrown', beard: 'short', beardColor: 'darkBrown', hair: 'short', hairColor: 'darkBrown', brows: 'bushy', browColor: 'darkBrown', eyes: 'big' }, [['hoe', {}, 'R']])],
    ['Plugar (furcă)', fig({ preset: 'villager', hat: 'straw', hatColor: 'yellow', bandColor: 'reddishBrown', robe: 'green', legs: 'darkTan', print: 'tunic', stripe: 'green', belt: 'reddishBrown', beard: 'mustache', beardColor: 'gray', brows: 'bushy', browColor: 'lightGray', age: 'elder', blush: false, hair: 'short', hairColor: 'lightGray', eyes: 'big' }, [['pitchfork', {}, 'R']])],
    ['Avva Siluan', fig({ preset: 'elder-monk', robe: '#3b2a20', legs: '#3b2a20', hat: 'cowl', hatColor: '#3b2a20', beard: 'flowing', beardLength: 1.25, beardColor: 'white', brows: 'bushy', robeLong: true, fabric: true, cloak: true, cape: true, cloakColor: '#3b2a20', cloakTrim: false }, [['staff', { straight: true }, 'L']])],
    ['Frate cu păr creț', fig({ preset: 'young-monk', robe: 'tan', legs: 'tan', hat: 'none', hair: 'curly', hairColor: '#5a3820', cloak: true, cape: true, cloakColor: 'brown', cloakTrim: false, fabric: 'cloak', cloakKind: 'shaggy', emotion: 'sad' })],
    ['Pelerin', fig({ preset: 'villager', hat: 'none', hair: 'short', hairColor: 'brown', robe: 'tan', legs: 'tan', print: 'tunic', stripe: 'tan', belt: 'reddishBrown', beard: 'short', beardColor: 'brown', brows: 'bushy', browColor: 'brown', cloak: true, cape: true, cloakColor: 'blue', cloakTrim: false, bag: 'reddishBrown', bagStrap: 'darkBrown', eyes: 'big' }, [['staff', { straight: true }, 'R']])],
  ]],
  ['TEODOR ȘI GRÂUL', [
    ['Avva Teodor', fig({ preset: 'elder-monk', robe: '#4a2e1e', legs: '#4a2e1e', robeLong: true, hat: 'cowl', hatColor: '#4a2e1e', beard: 'flowing', beardShape: 'full', beardLength: 1.0, beardColor: 'white', brows: 'bushy', browColor: 'white', eyes: 'big', blush: false, cord: '#d9b27a', cordLong: true, fabric: true, cloak: true, cloakColor: '#3f271a', cloakTrim: false, emotion: 'happy' })],
    ['Ucenicul', fig({ preset: 'young-monk', robe: '#5c3d2a', legs: '#5c3d2a', robeLong: true, hat: 'cowl', hatColor: '#4f3426', fringe: true, hairColor: '#3a2416', cord: '#d9b27a', cordLong: true, fabric: true, eyes: 'big', emotion: 'sad' })],
    ['Omul cu turban', fig({ preset: 'villager', hat: 'turban', turbanFull: true, hatColor: '#e3cfa3', bandColor: '#9a6a3a', robe: '#ead6aa', legs: '#d9bf8a', print: 'tunic', stripe: '#ead6aa', skirt: true, robeLong: true, vest: '#8a5a32', vest3d: true, belt: '#6b3f22', beard: 'short', beardColor: '#3a2416', brows: 'bushy', browColor: '#3a2416', eyes: 'big', emotion: 'joy' }, [['basket', { onions: true, bowl: true, scale: 0.7 }, 'R']])],
    ['Ulcior', prop('jug', { courses: true, color: '#b8562e', joint: '#7a3418' })],
    ['Coș cu ceapă', prop('basket', { onions: true, bowl: true })],
    ['Sac cu grâu bun', prop('sack', { fill: 'wheat' })],
    ['Sac cu grâu slab', prop('sack', { fill: 'poor' })],
    ['Sac cu galbeni', prop('sack', { fill: 'coins' })],
    ['Vas de lut (plin)', prop('grainJar', { bend: 1, fill: 'wheat' })],
    ['Vas spart, grâu vărsat', prop('grainJar', { bend: 2, fill: 'wheat' })],
    ['Carte', prop('book', { leather: true })],
    ['Lumânare', prop('candle', { holder: true, color: 'cream' })],
    ['Cruce', prop('cross', { base: true })],
    ['Felinar', prop('lantern', { color: '#4a3a2a' })],
    ['Sul de pergament', prop('scroll')],
    ['Masă de scris', prop('desk')],
    ['Făclie', prop('torch')],
    ['Pat de lemn', prop('bed')],
    ['Butoi', prop('barrel')],
    ['Fântână cu acoperiș', prop('stoneWell', { roof: true })],
    ['Turn cu cupolă', prop('bellTower', { dome: 'sand', height: 5 })],
    ['Capelă cu clopotniță', prop('chapel', { belfry: 'dome' })],
    ['Mănăstire cu arcade', prop('cloister')],
  ]],
  ['CLĂDIRI', [
    ['Chilie de pustnic', prop('hermitCell')],
    ['Mănăstire mică / capelă', prop('chapel')],
    ['Poartă de mănăstire', prop('gate')],
    ['Turn-clopotniță', prop('bellTower')],
    ['Fântână din piatră', prop('stoneWell')],
    ['Zid scund de curte', prop('wall')],
    ['Peșteră din stâncă', prop('caveRock', { seats: [[-1.6, 4.4, 'lightGray'], [-6.4, 6.2, 'tan']] })],
    ['Deal cu mănăstire', prop('hillMonastery')],
  ]],
  ['ELEMENTE DE PEISAJ', [
    ['Palmier', prop('palm')],
    ['Chiparos', prop('cypress')],
    ['Plantă cu frunze ascuțite', prop('spiky')],
    ['Piatră de șezut', prop('stoneSeat')],
    ['Copac foios', prop('leafyTree')],
    ['Tufiș / arbust', prop('bush')],
    ['Formațiune de stânci', prop('rocks')],
    ['Deal / movilă', prop('hill')],
    ['Parcelă arată (ogor)', prop('plowedPlot')],
    ['Lan de grâu', prop('wheatPatch')],
    ['Găleată', prop('bucket')],
    ['Bancă de lemn', prop('bench')],
    ['Ulcior / amforă', prop('amphora')],
    ['Căruță de lemn', prop('cart')],
    ['Măgăruș', prop('donkey')],
    ['Foc de tabără', prop('campfire')],
    ['Plăci de drum / potecă', prop('pathTiles', { length: 7, width: 3 })],
  ]],
];

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(TILE * 2, TILE * 2, false);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

function stageFor(obj) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf7efe2);
  scene.add(new THREE.HemisphereLight(0xfff6e8, 0xb9a88a, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  scene.add(obj);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
  const R = Math.max(size.x, size.y, size.z);
  sun.position.set(c.x + R * 0.8, c.y + R * 2, c.z + R * 1.6); sun.target.position.copy(c);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  const s = sun.shadow.camera; s.left = s.bottom = -R * 1.5; s.right = s.top = R * 1.5; s.near = 0.1; s.far = R * 6;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  // soft ground shadow catcher
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(R * 6, R * 6), new THREE.ShadowMaterial({ opacity: 0.18 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = box.min.y + 0.01; ground.receiveShadow = true; scene.add(ground);
  return { scene, box, size, c };
}

function frame(box, view = {}) {
  const az = (view.az ?? 28) * Math.PI / 180, el = (view.el ?? 16) * Math.PI / 180;
  const cam = new THREE.PerspectiveCamera(view.fov ?? 26, 1, 0.1, 2000);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const d = sphere.radius / Math.sin((cam.fov / 2) * Math.PI / 180) * (view.zoom ?? 0.92);
  const dir = new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
  cam.position.copy(sphere.center).addScaledVector(dir, d);
  cam.lookAt(sphere.center);
  return cam;
}

function build(item) {
  if (item.fig) {
    const g = new THREE.Group();
    const f = createMinifig(item.fig);
    g.add(f.root);
    const holding = {};
    for (const [, , hand] of item.held) holding[hand] = true;
    f.update({ time: 0, holding, emotion: item.fig.emotion || 'happy' });
    g.updateMatrixWorld(true);
    for (const [type, opts, hand] of item.held) {
      if (!PROPS[type]) continue;
      const p = createProp(type, opts);
      const w = f.holds[hand].getWorldPosition(new THREE.Vector3());
      const o = p.userData.hold || [0, 0, 0];
      // a long staff / tool stands on the ground beside the hand
      p.position.set(w.x + o[0], p.userData.ground > 1 ? p.userData.ground : w.y + o[1], w.z + o[2]);
      if (p.userData.update) p.userData.update(0, {});
      g.add(p);
    }
    // same camera for every figure (fixed box around a 4.4-stud minifig), so the sheet shows their true sizes
    return { obj: g, view: { az: 18, el: 6, fov: 26, box: new THREE.Box3(new THREE.Vector3(-1.6, -0.3, -1), new THREE.Vector3(1.6, 5.2, 1)), zoom: 0.8 } };
  }
  if (!PROPS[item.prop]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true }));
    return { obj: m, view: {}, missing: true };
  }
  const p = createProp(item.prop, item.opts);
  if (p.userData.update) p.userData.update(1.3, {});
  return { obj: p, view: { ...(p.userData.view || {}), ...item.view } };
}

async function main() {
  if (Q.get('only')) { const want = Q.get('only').split(','); for (const sec of SHEET) sec[1] = sec[1].filter(([l]) => want.some((w) => l.startsWith(w))); }
  for (let i = SHEET.length - 1; i >= 0; i--) if (!SHEET[i][1].length) SHEET.splice(i, 1);
  const rows = SHEET.map(([, items]) => Math.ceil(items.length / COLS));
  const W = COLS * (TILE + PAD) + PAD, HEAD = 96, SEC = 62;
  const H = HEAD + rows.reduce((a, r) => a + SEC + r * (TILE + LAB + PAD), 0) + PAD;
  const out = document.getElementById('out'); out.width = W; out.height = H;
  const g = out.getContext('2d');
  await document.fonts.ready;
  g.fillStyle = '#f7efe2'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#3b2a1e'; g.font = '700 50px Fredoka, sans-serif'; g.textAlign = 'center';
  g.fillText('Pateric – Planșa librăriei (three.js)', W / 2, 64);
  let y = HEAD;
  const missing = [];
  for (const [title, items] of SHEET) {
    g.fillStyle = '#7a4a2a'; g.fillRect(PAD, y, 360, 46);
    g.fillStyle = '#fff'; g.font = '700 30px Fredoka, sans-serif'; g.textAlign = 'left'; g.fillText(title, PAD + 16, y + 34);
    y += SEC;
    items.forEach(([label, item], i) => {
      const x = PAD + (i % COLS) * (TILE + PAD), yy = y + Math.floor(i / COLS) * (TILE + LAB + PAD);
      const { obj, view, missing: miss } = build(item);
      if (miss) missing.push(label);
      const { scene, box } = stageFor(obj);
      renderer.render(scene, frame(view.box || box, view));
      g.drawImage(renderer.domElement, x, yy, TILE, TILE);
      g.fillStyle = '#3b2a1e'; g.font = '600 24px Fredoka, sans-serif'; g.textAlign = 'center';
      g.fillText(label, x + TILE / 2, yy + TILE + 30);
    });
    y += Math.ceil(items.length / COLS) * (TILE + LAB + PAD);
  }
  window.__missing = missing;
  window.__sheet = out.toDataURL('image/jpeg', 0.9);
}
main().catch((e) => { window.__error = String(e.stack || e); });
