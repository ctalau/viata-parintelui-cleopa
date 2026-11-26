// Standalone preview of a Blender set (assets/sets/<name>.glb + .json) with lib/engine3/look.js.
// Interactive: /blender/preview/?set=desert-road&sky=day&shot=wide&quality=final&props=1
// Scripted (render.mjs): window.preview.shot({ set, sky, shot | camera:{pos,target,fov}, quality, t, w, h, standins })
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { setupLook } from '/lib/engine3/look.js';

const loader = new GLTFLoader();
const cache = new Map();
const load = (url) => { if (!cache.has(url)) cache.set(url, loader.loadAsync(url)); return cache.get(url); };
let renderer, scene, camera, look, cur = {};

function standIn(color = '#3a5fcd', sitting = false) {
  // a figure-sized capsule (height 4.2, radius 0.75) with a nose pointing at +Z (facing)
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
  const h = sitting ? 3.2 : 4.2;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.75, h - 1.5, 6, 16), m);
  body.position.y = h / 2; body.castShadow = body.receiveShadow = true; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 12), new THREE.MeshStandardMaterial({ color: '#f2c9a0' }));
  nose.rotation.x = Math.PI / 2; nose.position.set(0, h - 0.8, 0.85); nose.castShadow = true; g.add(nose);
  return g;
}

async function build(o) {
  if (renderer) { look?.dispose(); renderer.dispose(); renderer.domElement.remove(); }
  const w = o.w || innerWidth, h = o.h || innerHeight;
  renderer = new THREE.WebGLRenderer({ antialias: (o.quality || 'final') === 'draft', preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(o.pr || 1); renderer.setSize(w, h);
  document.body.appendChild(renderer.domElement);
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 1200);
  const meta = await (await fetch(`/assets/sets/${o.set}.json`)).json();
  const gltf = await load(`/assets/sets/${o.set}.glb`);
  const root = gltf.scene.clone(true);
  root.userData.meta = meta;
  scene.add(root);
  if (o.debug) root.traverse((m) => {
    if (!m.isMesh) return;
    const s = m.material;
    if (o.debug === 'albedo') m.material = new THREE.MeshBasicMaterial({ map: s.map, color: s.color, vertexColors: s.vertexColors, side: s.side });
    if (o.debug === 'ao') m.material = new THREE.MeshBasicMaterial({ map: s.aoMap, side: s.side });
    if (o.debug === 'nomaps') { s.normalMap = null; s.aoMap = null; s.roughnessMap = null; s.needsUpdate = true; }
    if (o.debug === 'normal') m.material = new THREE.MeshNormalMaterial({ normalMap: s.normalMap, side: s.side });
  });
  // props listed in the json "dress" (optional) and requested props
  for (const p of o.props || []) {
    let g; try { g = await load(`/assets/props/${p.name}.glb`); } catch { continue; }
    const node = g.scene.clone(true);
    if (p.variant && node.children.some((c) => c.name === p.variant)) node.children.forEach((c) => { c.visible = c.name === p.variant || c.name === 'grip'; });
    else if (p.variant) node.traverse((c) => { if (/^[lsw]\d$/.test(c.name)) c.visible = c.name === p.variant; }); // variants nested under the root (donkey-pack l0 … l3)
    node.position.set(...p.pos); node.rotation.y = THREE.MathUtils.degToRad(p.face || 0);
    if (p.scale) node.scale.setScalar(p.scale);
    node.traverse((m) => { if (m.isMesh) { m.castShadow = m.receiveShadow = true; } });
    scene.add(node);
  }
  if (o.standins !== false) {
    const colors = ['#3a5fcd', '#c2452d', '#3e8f4f', '#8a4fb0', '#d08a1c'];
    let i = 0;
    const list = o.standins && o.standins.length ? o.standins : Object.keys(meta.anchors || {}).filter((k) => !/off|edge/.test(k)).map((k) => ({ anchor: k }));
    for (const s of list) {
      const a = s.pos ? { pos: s.pos, face: s.face || 0 } : s.seat ? meta.seats[s.seat] : meta.anchors[s.anchor];
      if (!a) continue;
      const f = standIn(colors[i++ % colors.length], !!s.seat);
      f.position.set(a.pos[0], a.pos[1] - (s.seat ? 1.0 : 0), a.pos[2]);
      f.rotation.y = THREE.MathUtils.degToRad(a.face);
      scene.add(f);
    }
  }
  const shot = o.camera || (meta.shots || {})[o.shot] || Object.values(meta.shots || {})[0];
  camera.fov = shot.fov || 40; camera.position.set(...shot.pos); camera.lookAt(new THREE.Vector3(...shot.target)); camera.updateProjectionMatrix();
  look = setupLook({ THREE, renderer, scene, camera, sky: o.sky || 'day', set: root, quality: o.quality || 'final' });
  cur = { o, shot };
  return { shot };
}

window.preview = {
  async shot(o) {
    const t0 = performance.now();
    await build(o);
    look.render(o.t || 0);
    // compile + first frame done; render again so lazy uploads are in
    look.render(o.t || 0);
    return { ms: performance.now() - t0, info: renderer.info.render, mem: renderer.info.memory };
  },
};

const q = new URLSearchParams(location.search);
if (q.get('set')) {
  const o = { set: q.get('set'), sky: q.get('sky') || 'day', shot: q.get('shot'), quality: q.get('quality') || 'final', pr: devicePixelRatio };
  build(o).then(({ shot }) => {
    const ctl = new OrbitControls(camera, renderer.domElement); ctl.target.set(...shot.target); ctl.update();
    const t0 = performance.now();
    const loop = () => { look.render((performance.now() - t0) / 1000); requestAnimationFrame(loop); };
    loop();
    addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); look.resize(innerWidth, innerHeight); });
  });
}
