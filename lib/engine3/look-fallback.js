// Minimal look-dev used until lib/engine3/look.js (owned by the sets / look-dev work) exists, and in tests:
// filmic tone mapping, a sky gradient background, hemisphere + warm sun with soft shadows, light fog.
// Same interface as look.js: setupLook({ THREE, renderer, scene, camera, sky, set, quality }) -> { render(t), resize, dispose }.
const SKIES = {
  morning: { top: 0x8fc4ee, bottom: 0xf6e3c4, sun: 0xfff1d6, sunI: 2.6, hemi: 1.1, dir: [6, 9, 8] },
  day: { top: 0x6fb2ec, bottom: 0xe8f0f6, sun: 0xffffff, sunI: 2.9, hemi: 1.2, dir: [5, 12, 7] },
  evening: { top: 0x6f7fbf, bottom: 0xffc48a, sun: 0xffc286, sunI: 2.3, hemi: 0.9, dir: [-8, 6, 6] },
  sunset: { top: 0x5a6db5, bottom: 0xffa66b, sun: 0xffb070, sunI: 2.2, hemi: 0.85, dir: [-9, 5, 5] },
  night: { top: 0x0d1630, bottom: 0x2a3560, sun: 0xaabbee, sunI: 0.9, hemi: 0.45, dir: [4, 10, 3] },
  studio: { top: 0xd8d4cc, bottom: 0xf2efe8, sun: 0xffffff, sunI: 2.6, hemi: 1.3, dir: [4, 9, 8] },
};
export function setupLook({ THREE, renderer, scene, camera, sky = 'day', quality = 'final' }) {
  const S = SKIES[sky] || SKIES.day;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // gradient sky
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  if (c) {
    c.width = 4; c.height = 256; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#' + S.top.toString(16).padStart(6, '0')); gr.addColorStop(1, '#' + S.bottom.toString(16).padStart(6, '0'));
    g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    scene.background = tex;
  }
  scene.fog = new THREE.Fog(S.bottom, 60, 160);
  const hemi = new THREE.HemisphereLight(S.top, 0x9a8466, S.hemi);
  const sun = new THREE.DirectionalLight(S.sun, S.sunI);
  sun.position.set(...S.dir).multiplyScalar(3);
  sun.castShadow = true;
  const sz = quality === 'draft' ? 1024 : 2048;
  sun.shadow.mapSize.set(sz, sz);
  const cam = sun.shadow.camera; cam.left = -18; cam.right = 18; cam.top = 18; cam.bottom = -18; cam.near = 1; cam.far = 120;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 3;
  const fill = new THREE.DirectionalLight(0xffe2c8, 0.75); fill.position.set(-6, 4, 8);
  const rim = new THREE.DirectionalLight(0xffd2a0, 0.9); rim.position.set(2, 6, -9);
  scene.add(rim);
  scene.add(hemi, sun, sun.target, fill);
  // a soft studio environment for the plastic / cloth reflections
  let env = null;
  try {
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 16, 8);
    const m = new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true });
    const col = []; const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = (p.getY(i) / 10 + 1) / 2; const a = new THREE.Color(S.bottom).lerp(new THREE.Color(S.top), k); col.push(a.r, a.g, a.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    es.add(new THREE.Mesh(geo, m));
    env = pm.fromScene(es, 0.02).texture; scene.environment = env; scene.environmentIntensity = 0.55;
    pm.dispose();
  } catch { /* no env */ }
  return {
    sun,
    render() { renderer.render(scene, camera); },
    resize(w, h) { renderer.setSize(w, h, false); },
    dispose() { env?.dispose(); },
  };
}
