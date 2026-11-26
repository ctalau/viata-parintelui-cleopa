// Look-dev of the Blender pipeline (engine3): tone mapping, sky dome, procedural image-based lighting, the sun with a
// view-fitted soft shadow, aerial-perspective fog, flickering lamp / candle flames, and a light post chain
// (bloom on flames, warm grade, vignette, anti-aliasing).
//
//   import { setupLook } from './look.js';
//   const look = setupLook({ THREE, renderer, scene, camera, sky: 'evening', set, quality: 'final' });
//   look.render(t); look.resize(w, h); look.dispose();
//
// `set` = the loaded set root (Object3D) with its json in `set.userData.meta` (assets/sets/<name>.json); may be null.
// `sky` = 'morning' | 'day' | 'evening' | 'night' (aliases: sunset → evening, noon → day, dawn → morning) or an object
//         { preset: 'day', ...overrides } (any key of SKIES below).
// `quality` = 'final' (default: 4096 shadow map in a view-fitted frustum, PCF soft, MSAA + SMAA, bloom, grade)
//           | 'medium' (2048, PCF soft, FXAA, bloom) | 'draft' (1536, PCF, no post — headless SwiftShader stills).
// Everything is a pure function of `t` (and of the scene / camera as they are at that moment): no Math.random, no clock,
// no state carried between frames, so frames can be rendered in any order.
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';

// ---------------------------------------------------------------- sky presets
// sun: elevation / azimuth in degrees (azimuth 0 = from +Z (behind the usual camera), 90 = from +X, -90 = from -X).
// Colours are sRGB hex; intensities are physical-ish (three.js units, after tone mapping exposure).
export const SKIES = {
  morning: {
    sunElev: 16, sunAz: -62, sunColor: '#ffcf98', sunIntensity: 2.6, sunDisc: '#fff1d6', sunSize: 1.0,
    zenith: '#6fa2de', mid: '#d6d6e0', horizon: '#ffd9a8', haze: '#ffd4a0', mountain: '#d99a86', ground: '#f3bd88',
    envIntensity: 0.7, exposure: 1.0, fog: 0.0042, clouds: 0.35, cloudColor: '#fff2e4', cloudShade: '#c9a6b4',
    stars: 0, moon: 0, grade: { warm: 0.13, sat: 1.14, lift: 0.02 },
  },
  day: {
    sunElev: 44, sunAz: -38, sunColor: '#ffe0b0', sunIntensity: 2.4, sunDisc: '#fffaf0', sunSize: 0.8,
    zenith: '#2f7fe0', mid: '#86bdee', horizon: '#f4e2c6', haze: '#f9e2bc', mountain: '#dba27c', ground: '#f2c285',
    envIntensity: 0.7, exposure: 0.95, fog: 0.0032, clouds: 0.32, cloudColor: '#fffaf0', cloudShade: '#c8cce0',
    stars: 0, moon: 0, grade: { warm: 0.09, sat: 1.18, lift: 0.0 },
  },
  evening: {
    sunElev: 7, sunAz: 58, sunColor: '#ffab62', sunIntensity: 2.1, sunDisc: '#ffe2a8', sunSize: 1.4,
    zenith: '#4656a8', mid: '#c58bb4', horizon: '#ffad6e', haze: '#ffb47c', mountain: '#a8708a', ground: '#d69a6c',
    envIntensity: 0.6, exposure: 1.15, fog: 0.0048, clouds: 0.42, cloudColor: '#ffc08a', cloudShade: '#8a6a9a',
    stars: 0.12, moon: 0, grade: { warm: 0.05, sat: 1.08, lift: 0.025 },
  },
  night: {
    sunElev: 38, sunAz: 30, sunColor: '#a9c2ff', sunIntensity: 0.75, sunDisc: '#f4f1e2', sunSize: 1.6, isMoon: true,
    zenith: '#16225a', mid: '#2a3a80', horizon: '#56609e', haze: '#4f5792', mountain: '#3a3f70', ground: '#6a5a6a',
    envIntensity: 0.6, exposure: 1.5, fog: 0.0038, clouds: 0.18, cloudColor: '#8a90c8', cloudShade: '#2e3566',
    stars: 1, moon: 1, grade: { warm: 0.0, sat: 1.0, lift: 0.045 },
  },
};
const ALIAS = { sunset: 'evening', dusk: 'evening', noon: 'day', dawn: 'morning', sunrise: 'morning', midnight: 'night' };
const QUALITY = {
  final: { shadow: 4096, soft: true, post: true, bloom: true, aa: 'smaa', msaa: 4, maxLamps: 4, shadowDist: 70 },
  medium: { shadow: 2048, soft: true, post: true, bloom: true, aa: 'fxaa', msaa: 0, maxLamps: 3, shadowDist: 60 },
  draft: { shadow: 1536, soft: false, post: false, bloom: false, aa: 'none', msaa: 0, maxLamps: 2, shadowDist: 55 },
};
QUALITY.high = QUALITY.final; QUALITY.low = QUALITY.draft;

// deterministic 1D value noise (for flame flicker): smooth, in [-1, 1]
function hash1(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123; return s - Math.floor(s); }
const h2 = (i, s) => hash1(i * 17.31 + s * 101.7);
const smoothK = (x) => { const k = Math.min(1, Math.max(0, x)); return k * k * (3 - 2 * k); };
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };
/** the slot of t in a sequence of random-length spans [a, b] (pure: summed from a hashed start before 0) */
function slot(t, seed, a, b) {
  let t0 = -h2(0, seed) * b, i = 0;
  for (;;) { const L = a + (b - a) * h2(i + 1, seed); if (t < t0 + L || i > 5000) return { i, t0, L }; t0 += L; i++; }
}
/** a node's own seed: the prop's (stage3), else from its name (set dressing: dove1, dove2 … never in step) */
function seedOf(o, u) {
  if (u.seed != null) return u.seed;
  const n = (o.userData?.name ?? o.name ?? '') + (u.phase ?? '');
  let h = 7; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return (u.seed = h);
}
/** the walk / gesture state a walking prop's root gets from stage3 (`walkState`: d = distance walked, on = 0..1 while
 *  walking, bray = 0..1 progress of a bray or -1), found up the parents of an animated part */
function walkState(o) {
  for (let p = o.parent; p; p = p.parent) if (p.userData?.walkState) return p.userData.walkState;
  return null;
}
/** a bray's envelope: up in 0.15 of it, held, down in the last 0.2 */
function brayEnv(k) { return k < 0 ? 0 : smoothK(k / 0.15) * smoothK((1 - k) / 0.2); }
/** a `look`'s envelope: the head comes up in 0.6 s of a longer gesture and goes back at its end */
function lookEnv(k) { return k == null || k < 0 ? 0 : smoothK(k / 0.12) * smoothK((1 - k) / 0.12); }
function vnoise(x) { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hash1(i) * (1 - u) + hash1(i + 1) * u) * 2 - 1; }

// ---------------------------------------------------------------- sky dome shader
const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = normalize((modelMatrix * vec4(position, 1.0)).xyz - cameraPosition);
  vec4 p = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  gl_Position = p.xyww; // on the far plane
}`;
const SKY_FRAG = /* glsl */`
uniform vec3 zenith, midCol, mountain, horizon, haze, groundCol, sunDir, sunCol, discCol, cloudCol, cloudShade;
uniform float sunSize, isMoon, stars, clouds, time, discBoost;
varying vec3 vDir;
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float h31(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), u.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
void main() {
  vec3 d = normalize(vDir);
  float el = d.y;
  // gradient: haze band at the horizon, deeper colour towards the zenith
  float e = clamp(el, 0.0, 1.0);
  float tz = pow(e, 0.32);
  vec3 col = mix(horizon, midCol, smoothstep(0.0, 0.22, e));
  col = mix(col, zenith, smoothstep(0.12, 0.75, e));
  col = mix(col, haze, exp(-e * 40.0) * 0.55);
  // distant hazy mountains on the horizon (a ridge line in the sky: always behind the set)
  float az = atan(d.x, d.z);
  float ridge = 0.012 + 0.03 * (0.5 + 0.5 * sin(az * 3.0 + 1.3)) * (0.55 + 0.45 * sin(az * 7.0 + 0.4)) + 0.008 * sin(az * 23.0) + 0.004 * sin(az * 57.0 + 2.0);
  float mtn = smoothstep(ridge + 0.002, ridge - 0.002, el) * step(-0.05, el);
  vec3 mc = mix(mountain, haze, 0.35 + 0.65 * smoothstep(ridge, 0.0, el) * 0.6);
  mc += sunCol * 0.08 * max(0.0, dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z) + 1e-4)));
  col = mix(col, mc, mtn);
  // below the horizon: the distant ground haze (hidden by the set, seen only through gaps)
  col = mix(col, mix(haze, groundCol, 0.5), smoothstep(0.0, -0.08, el));
  // sun / moon
  float cs = dot(d, sunDir);
  float r = sunSize * 0.0105;
  float disc = smoothstep(cos(r * 1.08), cos(r * 0.92), cs);
  float glow = pow(max(cs, 0.0), 8.0) * 0.28 + pow(max(cs, 0.0), 64.0) * 0.45 + pow(max(cs, 0.0), 700.0) * 0.6;
  col += sunCol * glow * (isMoon > 0.5 ? 0.25 : 1.0) * (0.6 + 0.4 * (1.0 - tz));
  // stars: one hashed point per sky cell, twinkling slowly (deterministic in time)
  if (stars > 0.0 && el > 0.0) {
    vec3 q = d * 260.0; vec3 c = floor(q); vec3 f = fract(q) - 0.5;
    float h = h31(c);
    float s = step(0.965, h) * smoothstep(0.16, 0.0, length(f + (vec3(h31(c + 3.1), h31(c + 7.7), h31(c + 1.3)) - 0.5) * 0.6));
    s *= 0.65 + 0.35 * sin(time * (1.0 + h * 3.0) + h * 60.0);
    col += vec3(1.0, 0.96, 0.88) * s * stars * smoothstep(0.02, 0.25, el) * 2.2;
  }
  // clouds: soft fbm on a plane high above, drifting slowly
  if (clouds > 0.0 && el > 0.0) {
    // fluffy cumulus: cellular puffs (bubbly edges) shaped by fbm, a bright top and a soft shaded belly
    vec2 uv = d.xz / (el + 0.1) * 1.1 + vec2(time * 0.008, time * 0.003);
    float n = fbm(uv * 0.8) * 0.65 + fbm(uv * 2.6 + 4.0) * 0.35;
    float m = smoothstep(0.64 - clouds * 0.25, 0.74 - clouds * 0.2, n) * smoothstep(0.02, 0.2, el);
    float core = smoothstep(0.6, 0.85, n);
    float lit = clamp(0.55 + 0.45 * dot(normalize(vec3(sunDir.x, 0.0, sunDir.z) + 1e-4), normalize(vec3(d.x, 0.0, d.z))), 0.0, 1.0);
    vec3 cc = mix(cloudShade, cloudCol, clamp(0.35 + 0.5 * lit + 0.3 * (1.0 - core) - 0.15 * core, 0.0, 1.0));
    cc += sunCol * pow(max(cs, 0.0), 12.0) * 0.6;
    col = mix(col, cc, m * 0.85);
    disc *= 1.0 - m * 0.8;
  }
  // the disc on top (moon: a soft pale disc with two faint marks)
  vec3 dc = discCol * discBoost;
  if (isMoon > 0.5) { float mk = smoothstep(0.35, 0.0, length((d - sunDir) / r - vec3(0.25, 0.2, 0.0)) ) * 0.12; dc *= 1.0 - mk; }
  col = mix(col, dc, disc);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// grade + vignette (after tone mapping, in display space)
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, warm: { value: 0 }, sat: { value: 1 }, lift: { value: 0 }, vignette: { value: 0.22 }, aspect: { value: 16 / 9 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
uniform sampler2D tDiffuse; uniform float warm, sat, lift, vignette, aspect; varying vec2 vUv;
void main() {
  vec4 c = texture2D(tDiffuse, vUv);
  vec3 col = c.rgb;
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, sat);
  col += vec3(warm, warm * 0.45, -warm * 0.6) * (1.0 - l) * 0.5;
  col = lift + col * (1.0 - lift);
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0) / aspect * 1.9;
  col *= 1.0 - vignette * smoothstep(0.35, 1.25, dot(p, p));
  gl_FragColor = vec4(col, c.a);
}`,
};

function resolveSky(THREE, sky, meta) {
  let name = 'day', over = {};
  if (typeof sky === 'string') name = sky;
  else if (sky && typeof sky === 'object') { name = sky.preset || sky.name || 'day'; over = sky; }
  name = ALIAS[name] || name;
  if (!SKIES[name]) name = 'day';
  // the set may turn the sun so that its buildings are well lit (json: "sky": { "day": { "sunAz": -30 } })
  const setOver = meta?.sky?.[name] || {};
  return { name, ...SKIES[name], ...setOver, ...over, grade: { ...SKIES[name].grade, ...(setOver.grade || {}), ...(over.grade || {}) } };
}

function dirFrom(THREE, elev, az) {
  const e = THREE.MathUtils.degToRad(elev), a = THREE.MathUtils.degToRad(az);
  return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).normalize();
}

// GLTFLoader strips ':' from .name (anchor:x → anchorx) and keeps the original in userData.name
export const nodeName = (o) => o.userData?.name ?? o.name ?? '';

/** Prepare a loaded set: hide collision proxies, shadows on, flames unlit + bloom-bright. Idempotent. */
export function prepareSet(set) {
  if (!set) return;
  set.traverse((o) => {
    if (!o.isMesh) return;
    const n = nodeName(o), pn = o.parent ? nodeName(o.parent) : '';
    if (n.startsWith('col:') || n === 'col' || pn.startsWith('col:')) { o.visible = false; return; }
    const ground = /^ground/.test(n) || /^ground/.test(pn);
    o.receiveShadow = true;
    o.castShadow = !ground && !/^(dist|far|backdrop)/.test(n) && !o.userData?.noShadow && !o.parent?.userData?.noShadow;
    if (/flame/i.test(n)) { o.castShadow = false; o.receiveShadow = false; }
  });
}

// SMAA's two lookup textures are images decoded asynchronously: a pass made when a scene is first shown rendered its
// first frame WITHOUT anti-aliasing (every edge differed from the next render of the same frame, so the MP4 — each GPU
// worker starts mid-film — differed from the preview: 038 was not published). They are decoded once, before any frame
// (preloadLook, awaited by preloadFilm), and every pass gets the decoded images.
let smaaImages = null, smaaLoading = null;
export function preloadLook() {
  if (!smaaLoading) {
    const p = new SMAAPass(1, 1);
    const imgs = [p.areaTexture.image, p.searchTexture.image];
    smaaLoading = Promise.all(imgs.map((im) => (im.complete && im.naturalWidth ? Promise.resolve() : im.decode ? im.decode() : new Promise((r) => { im.addEventListener('load', r, { once: true }); }))))
      .then(() => { smaaImages = imgs; }).catch(() => {}).finally(() => p.dispose?.());
  }
  return smaaLoading;
}
function smaaPass(w, h) {
  const p = new SMAAPass(w, h);
  if (smaaImages) {
    p.areaTexture.image = smaaImages[0]; p.areaTexture.needsUpdate = true;
    p.searchTexture.image = smaaImages[1]; p.searchTexture.needsUpdate = true;
  }
  return p;
}

export function setupLook({ THREE, renderer, scene, camera, sky = 'day', set = null, quality = 'final' } = {}) {
  const Q = QUALITY[quality] || QUALITY.final;
  const meta = set?.userData?.meta || {};
  const S = resolveSky(THREE, sky, meta);
  const col = (h) => new THREE.Color(h);             // sRGB hex → linear working colour
  const disposables = [];

  // ------------------------------------------------ renderer
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = S.exposure;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = Q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  prepareSet(set);

  // ------------------------------------------------ sky dome
  const sunDir = dirFrom(THREE, S.sunElev, S.sunAz);
  const skyUniforms = {
    zenith: { value: col(S.zenith) }, midCol: { value: col(S.mid) }, mountain: { value: col(S.mountain) }, horizon: { value: col(S.horizon) }, haze: { value: col(S.haze) },
    groundCol: { value: col(S.ground) }, sunDir: { value: sunDir.clone() }, sunCol: { value: col(S.sunColor) },
    discCol: { value: col(S.sunDisc) }, cloudCol: { value: col(S.cloudColor) }, cloudShade: { value: col(S.cloudShade) },
    sunSize: { value: S.sunSize }, isMoon: { value: S.isMoon ? 1 : 0 }, stars: { value: S.stars }, clouds: { value: S.clouds },
    time: { value: 0 }, discBoost: { value: S.isMoon ? 1.6 : 6.0 },
  };
  const skyMat = new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), skyMat);
  dome.name = 'look:sky'; dome.frustumCulled = false; dome.renderOrder = -1000;
  const domeR = () => Math.max(10, (camera.far || 1000) * 0.85);
  scene.add(dome); disposables.push(dome.geometry, skyMat);
  scene.background = null;

  // ------------------------------------------------ image based lighting (procedural: the same sky + a sand-coloured ground)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envSkyMat = skyMat.clone();
  envSkyMat.uniforms = THREE.UniformsUtils.clone(skyUniforms);
  envSkyMat.uniforms.stars.value = 0; envSkyMat.uniforms.discBoost.value = S.isMoon ? 1.0 : 2.0;
  const envDome = new THREE.Mesh(new THREE.SphereGeometry(100, 48, 24), envSkyMat);
  envScene.add(envDome);
  const groundBounce = new THREE.Mesh(new THREE.CircleGeometry(95, 48), new THREE.MeshBasicMaterial({ color: col(S.ground).multiplyScalar(0.55 + 0.25 * Math.max(0, sunDir.y)), side: THREE.DoubleSide }));
  groundBounce.rotation.x = -Math.PI / 2; groundBounce.position.y = -4; envScene.add(groundBounce);
  // the env has no tone mapping: render it linear
  const saveTM = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
  envSkyMat.toneMapped = false;
  const envRT = pmrem.fromScene(envScene, 0.02, 0.1, 400);
  renderer.toneMapping = saveTM;
  scene.environment = envRT.texture;
  if ('environmentIntensity' in scene) scene.environmentIntensity = S.envIntensity;
  disposables.push(envRT, envDome.geometry, envSkyMat, groundBounce.geometry, groundBounce.material, pmrem);

  // ------------------------------------------------ sun (or moon) with a view-fitted soft shadow
  const sun = new THREE.DirectionalLight(col(S.sunColor), S.sunIntensity);
  sun.name = 'look:sun';
  sun.castShadow = true;
  sun.shadow.mapSize.set(Q.shadow, Q.shadow);
  sun.shadow.radius = Q.soft ? 2.5 : 1;
  scene.add(sun, sun.target);
  // a faint fill from the opposite side (sky bounce is in the env already; this only keeps shadow sides from going flat)
  const fill = new THREE.DirectionalLight(col(S.zenith), S.sunIntensity * 0.06);
  fill.position.copy(sunDir).multiplyScalar(-50).setY(30); fill.name = 'look:fill';
  scene.add(fill);

  const shadowArea = meta.shadow || null; // { center: [x, z], radius }
  const tmpV = new THREE.Vector3(), ndc = new THREE.Vector3();
  function fitShadow() {
    // ground points the camera sees (rays through a 5x4 grid of the screen, clipped at shadowDist), bounding circle
    camera.updateMatrixWorld();
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    const pts = [];
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 3; j++) {
      ndc.set(-1 + i / 2, -1 + j * 2 / 3, 0.5).unproject(camera);
      const dir = ndc.sub(camPos).normalize();
      let d = Q.shadowDist;
      if (dir.y < -1e-3) d = Math.min(d, (camPos.y - 0) / -dir.y);
      pts.push(camPos.clone().addScaledVector(dir, d));
    }
    pts.push(camPos.clone());
    const box = new THREE.Box3().setFromPoints(pts);
    const c = box.getCenter(new THREE.Vector3()); c.y = 0;
    let r = 0; for (const p of pts) r = Math.max(r, Math.hypot(p.x - c.x, p.z - c.z));
    r = Math.min(Math.max(r, 10), Q.shadowDist);
    if (shadowArea) { // never wider than the set's shadow area
      const ac = new THREE.Vector3(shadowArea.center[0], 0, shadowArea.center[1]);
      if (r > shadowArea.radius) { c.copy(ac); r = shadowArea.radius; }
    }
    r *= 1.08;
    // snap the centre to shadow texels (stable shadows when the camera glides)
    const texel = (2 * r) / Q.shadow;
    const lightRot = new THREE.Matrix4().lookAt(sunDir, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    const inv = lightRot.clone().invert();
    tmpV.copy(c).applyMatrix4(inv);
    tmpV.x = Math.round(tmpV.x / texel) * texel; tmpV.y = Math.round(tmpV.y / texel) * texel;
    c.copy(tmpV.applyMatrix4(lightRot));
    const far = 220;
    sun.position.copy(c).addScaledVector(sunDir, far * 0.5);
    sun.target.position.copy(c);
    const sc = sun.shadow.camera;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = far;
    sc.updateProjectionMatrix();
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = texel * 1.6;
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
  }

  // ------------------------------------------------ fog (aerial perspective towards the horizon haze)
  const fogCol = col(S.haze).lerp(col(S.horizon), 0.35);
  scene.fog = new THREE.FogExp2(fogCol, S.fog * (meta.fogScale || 1));

  // ------------------------------------------------ lamps: every mesh called "flame*" gets a warm flickering point light
  const lamps = new Map(); // flame mesh uuid → { light, mesh, base }
  const extraLights = (meta.lights || []).map((L, i) => {
    const pl = new THREE.PointLight(col(L.color || '#ffb46a'), L.intensity ?? 6, L.distance ?? 14, 2);
    pl.position.set(...L.pos); pl.name = `look:setlight${i}`; pl.userData.flicker = L.flicker ?? 0.0; pl.userData.seed = 11.3 * (i + 1); scene.add(pl);
    return pl;
  });
  // the flicker phase of a flame: a hash of its place in the scene graph (names + child indices), the same on every
  // machine and every page load — never the uuid (Math.random) or the object id (a global counter): the MP4 rendered on
  // the GPU pod must flicker exactly like the preview (the 038 compare failed on candle light in the close-ups)
  function flameSeed(f) {
    if (f.userData.lampSeed != null) return f.userData.lampSeed;
    let h = 7;
    for (let o = f; o && o.parent; o = o.parent) {
      const n = nodeName(o) + '#' + o.parent.children.indexOf(o) + '/';
      for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 99991;
    }
    return (f.userData.lampSeed = (h % 997) * 0.37);
  }
  function updateLamps(t) {
    const flames = [];
    scene.traverse((o) => { if (o.isMesh && /flame/i.test(nodeName(o)) && o.visible !== false) { let v = true; o.traverseAncestors((a) => { if (a.visible === false) v = false; }); if (v) flames.push(o); } });
    const camPos = camera.getWorldPosition(new THREE.Vector3());
    flames.forEach((f) => f.updateWorldMatrix(true, false));
    flames.sort((a, b) => a.getWorldPosition(tmpV).distanceTo(camPos) - b.getWorldPosition(new THREE.Vector3()).distanceTo(camPos));
    const used = new Set();
    // only the Q.maxLamps flames nearest the camera get a light; as the camera moves, which ones those are changes. Each
    // light fades out as its flame nears the first one left out (two flames that swap places are equally far, so both
    // are faded then): no light ever switches on or off in one frame ("a bulb lights up behind the icon")
    const cutD = flames.length > Q.maxLamps ? flames[Q.maxLamps].getWorldPosition(new THREE.Vector3()).distanceTo(camPos) : Infinity;
    flames.forEach((f, i) => {
      const key = f.uuid;
      let L = lamps.get(key);
      const seed = flameSeed(f);
      const fl = 1 + 0.13 * vnoise(t * 7.3 + seed) + 0.06 * vnoise(t * 17.1 + seed * 2.1) + 0.03 * vnoise(t * 31 + seed);
      // the flame mesh itself breathes (scale) and sways a little
      if (!f.userData.lookBase) f.userData.lookBase = { s: f.scale.clone(), r: f.rotation.clone() };
      const b = f.userData.lookBase;
      f.scale.set(b.s.x * (0.96 + 0.04 * fl), b.s.y * (0.9 + 0.12 * fl), b.s.z * (0.96 + 0.04 * fl));
      f.rotation.set(b.r.x + 0.06 * vnoise(t * 3.1 + seed + 5), b.r.y, b.r.z + 0.06 * vnoise(t * 2.7 + seed + 9));
      const mat = f.material;
      if (mat && !mat.userData.lookFlame) {
        mat.userData.lookFlame = true;
        if (mat.emissive) { mat.emissiveIntensity = Math.max(mat.emissiveIntensity || 1, 6); }
        mat.toneMapped = true; mat.fog = false;
      }
      if (i >= Q.maxLamps) { if (L) L.light.visible = false; return; }
      if (!L) {
        const ud = f.userData || {};
        const light = new THREE.PointLight(col(ud.lightColor || '#ffad5c'), 1, ud.lightDistance || 16, 2);
        light.name = 'look:lamp'; light.castShadow = false;
        scene.add(light);
        L = { light, base: ud.lightIntensity || 9 };
        lamps.set(key, L);
      }
      f.getWorldPosition(L.light.position); L.light.position.y += 0.15;
      const dCam = f.getWorldPosition(tmpV).distanceTo(camPos), x = Math.max(0, Math.min(1, (cutD - dCam) / 2.5));
      L.light.intensity = L.base * fl * x * x * (3 - 2 * x);
      L.light.visible = true;
      used.add(key);
    });
    for (const [k, L] of lamps) if (!used.has(k)) L.light.visible = false;
    for (const pl of extraLights) pl.intensity = (pl.userData.base ??= pl.intensity) * (1 + pl.userData.flicker * vnoise(t * 6.1 + pl.userData.seed));
  }

  // ------------------------------------------------ wind in the wheat (anim `wind`)
  const windTime = { value: 0 }, windMats = new Map();
  function windMaterial(mt, base) {
    const key = mt.uuid + ':' + base;
    if (windMats.has(key)) return windMats.get(key);
    const w = mt.clone();
    w.onBeforeCompile = (sh) => {
      sh.uniforms.windTime = windTime;
      sh.vertexShader = 'uniform float windTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wp = modelMatrix * vec4(transformed, 1.0);
          float hgt = max(0.0, transformed.y - ${base.toFixed(3)});
          float k = hgt * hgt * 0.022;
          float wave = sin(windTime * 1.25 - wp.x * 0.16 + wp.z * 0.07) * 0.65 + sin(windTime * 2.3 + wp.x * 0.43 - wp.z * 0.31) * 0.35;
          vec3 dw = vec3(0.9 + 0.6 * wave, 0.0, 0.25 * wave) * k;
          transformed += (inverse(mat3(modelMatrix)) * dw);
        }`);
    };
    w.customProgramCacheKey = () => 'wind' + base;
    disposables.push(w);
    windMats.set(key, w);
    return w;
  }

  // ------------------------------------------------ little animations of the set dressing (glTF extras `anim`)
  const qd = new THREE.Quaternion(), eu = new THREE.Euler(), euY = new THREE.Euler(0, 0, 0, 'YXZ'), TAU = Math.PI * 2, vd = new THREE.Vector3();
  function animate(t) {
    const nodes = [];
    scene.traverse((o) => { if (o.userData && o.userData.anim) nodes.push(o); });
    for (const o of nodes) {
      const u = o.userData;
      if (!u.lookBase) u.lookBase = { p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() };
      if (u.anim === 'graze') u.anim = 'browse'; // the old name: the donkey of the sets browses like the GLB prop
      const b = u.lookBase, f = u.freq ?? 0.5, ph = u.phase ?? 0, amp = u.amp ?? 0.05;
      o.position.copy(b.p); o.quaternion.copy(b.q); o.scale.copy(b.s);
      if (u.anim === 'sway') {
        const a = Math.sin(TAU * f * t + ph) + 0.35 * Math.sin(TAU * f * 2.3 * t + ph * 1.7);
        eu.set(amp * a, 0, u.axis === 'x' ? 0 : amp * 0.7 * Math.sin(TAU * f * 1.3 * t + ph * 2.1));
        o.quaternion.multiply(qd.setFromEuler(eu));
      } else if (u.anim === 'glide') {
        o.position.x += Math.sin(t * .29 + ph) * 2.4;
        o.position.y += Math.cos(t * .50 + ph) * .32;
        o.quaternion.multiply(qd.setFromAxisAngle(vd.set(0,0,1), .24 * Math.cos(t * .29 + ph)));
      } else if (u.anim === 'rain') {
        // a streak of rain (rain-cloud prop): loops down `fall` studs, fading out near the end by shrinking; pure function of t
        const ff = ((t * (u.speed ?? 1.7) * 0.25 + ph) % 1 + 1) % 1, fall = u.fall ?? 9;
        o.position.y = b.p.y - ff * fall;
        const k = Math.min(1, ff * 12, (1 - ff) * 8);
        o.scale.set(b.s.x * k * (u.rainWidth ?? 1), b.s.y * k, b.s.z * k * (u.rainWidth ?? 1));
      } else if (u.anim === 'butterfly') {
        const w = TAU * f, r = u.radius ?? 1, a = w * t + ph;
        const x = r * Math.cos(a) + 0.25 * r * Math.sin(2.7 * a), z = 0.7 * r * Math.sin(a), y = (u.height ?? 0.3) * Math.sin(1.9 * a) + 0.08 * Math.sin(TAU * 3.1 * t);
        o.position.set(b.p.x + x, b.p.y + y, b.p.z + z);
        const vx = -r * Math.sin(a) + 0.675 * r * Math.cos(2.7 * a), vz = 0.7 * r * Math.cos(a);
        o.quaternion.setFromEuler(eu.set(0, Math.atan2(vx, vz), 0));
        const flap = 0.15 + 0.75 * (0.5 + 0.5 * Math.sin(TAU * 6.5 * t + ph));
        for (const c of o.children) {
          const n = nodeName(c);
          if (!c.userData.lookBase) c.userData.lookBase = { q: c.quaternion.clone() };
          c.quaternion.copy(c.userData.lookBase.q);
          if (/wing\.L$/.test(n)) c.quaternion.multiply(qd.setFromEuler(eu.set(0, 0, flap)));
          if (/wing\.R$/.test(n)) c.quaternion.multiply(qd.setFromEuler(eu.set(0, 0, -flap)));
        }
      } else if (u.anim === 'peck') {
        // a perched / sitting bird's head: pecks in short bursts at random moments, looks about in between (never a loop)
        const sd = seedOf(o, u), S = slot(t, sd, 0.5, 0.9), fq = (t - S.t0) / S.L;
        const pk = h2(S.i, sd + 3) > 0.62 ? Math.pow(Math.sin(Math.PI * fq), 2) : 0;
        o.quaternion.multiply(qd.setFromEuler(eu.set(0.7 * pk, 0.45 * vnoise(t * 0.6 + sd) * (1 - pk), 0.1 * vnoise(t * 0.9 + sd * 2))));
      } else if (u.anim === 'drink') {
        // a bird drinking at the water's edge: dips its beak into the water, holds it there a moment, then lifts the head
        // high to swallow; again and again with short pauses (every bird its own rhythm)
        const sd = seedOf(o, u), S = slot(t, sd, 1.7, 2.6), k = (t - S.t0);
        const dip = smoothK(k / 0.35) * (1 - smoothK((k - 0.85) / 0.3));
        const up = smoothK((k - 0.95) / 0.25) * (1 - smoothK((k - 1.45) / 0.3));
        // the whole bird leans forward from its feet (so the beak really reaches the water), the head (child `*.head`)
        // bends down further and comes up high to swallow
        o.quaternion.multiply(qd.setFromEuler(eu.set((u.dip ?? 0.6) * dip - 0.1 * up, 0, 0)));
        for (const c of o.children) {
          if (!/head$/.test(nodeName(c)) || c.userData.anim) continue;
          if (!c.userData.lookBase) c.userData.lookBase = { q: c.quaternion.clone() };
          c.quaternion.copy(c.userData.lookBase.q).multiply(qd.setFromEuler(eu.set(0.55 * dip - 0.6 * up, 0.3 * vnoise(t * 0.5 + sd) * (1 - dip), 0)));
        }
      } else if (u.anim === 'tail') {
        // a cat's tail: a slow lazy curl all the time, a few quick flicks now and then
        const sd = seedOf(o, u), S = slot(t, sd + 9, 1.5, 5.0), tt = t - S.t0;
        const flick = h2(S.i, sd + 9) > 0.5 && tt < 1.0 ? Math.sin(Math.PI * tt) * Math.sin(TAU * 2.5 * tt) : 0;
        o.quaternion.multiply(qd.setFromEuler(eu.set(0, 0.3 * vnoise(t * 0.35 + sd) + 0.4 * flick, 0.12 * vnoise(t * 0.5 + sd * 3))));
      } else if (u.anim === 'lizard') {
        // a lizard on a warm rock: still, then a slow turn of the body or two push-ups, at random moments
        // (the yaw always carries over: a turn over 0.25 s read as a jump — film 050)
        const sd = seedOf(o, u), S = slot(t, sd, 1.2, 4.5), tt = t - S.t0;
        const yawAt = (i) => 0.4 * (h2(i, sd + 2) - 0.5), turns = (i) => h2(i, sd + 1) > 0.5;
        const held = (i) => { for (let j = i; j > i - 40; j--) if (turns(j)) return yawAt(j); return 0; };
        const r = turns(S.i) ? 1 : 0, prev = held(S.i - 1), cur = yawAt(S.i);
        const yaw = r ? prev + (cur - prev) * smoothK(tt / 0.9) : prev;
        const push = !r && tt < 1.2 ? 0.035 * Math.abs(Math.sin(TAU * 1.7 * tt)) : 0;
        o.position.y = b.p.y + push;
        o.quaternion.multiply(qd.setFromEuler(eu.set(-push * 2, yaw, 0)));
      } else if (u.anim === 'peek') {
        // a tortoise's head: pokes out, looks slowly about, pulls in a little now and then
        const sd = seedOf(o, u), S = slot(t, sd, 2.0, 6.0), k = smoothK((t - S.t0) / 0.9);
        const pose = (i) => [h2(i, sd + 4) > 0.75 ? 0.55 : 1.0, 0.6 * (h2(i, sd + 5) - 0.5)];
        const a = pose(S.i - 1), c2 = pose(S.i), out = a[0] + (c2[0] - a[0]) * k, yaw = a[1] + (c2[1] - a[1]) * k;
        o.scale.set(b.s.x, b.s.y, b.s.z * (0.55 + 0.45 * out));
        o.quaternion.multiply(qd.setFromEuler(eu.set(0.08 * vnoise(t * 0.8 + sd), yaw, 0)));
      } else if (u.anim === 'hen') {
        // a hen: walks to a new spot round its home (random distance and pause), then stands and pecks at random moments;
        // the head (child `*.head`) pecks and looks about. Pure in t: the slots come from a hash of the seed.
        const sd = seedOf(o, u), R = u.radius ?? 1.2;
        const spot = (i) => { const a = TAU * h2(i * 3 + 1, sd), r = R * Math.sqrt(h2(i * 3 + 2, sd)); return [r * Math.sin(a), r * Math.cos(a)]; };
        const S = slot(t, sd, 2.4, 6.5), p0 = spot(S.i), p1 = spot(S.i + 1), pm = spot(S.i - 1);
        const dx = p1[0] - p0[0], dz = p1[1] - p0[1], d = Math.hypot(dx, dz), walkT = Math.min(S.L * (u.speed ? 0.85 : 0.5), d / (u.speed ?? 0.75) + 0.15);
        const dir = d > 0.05 ? Math.atan2(dx, dz) : Math.atan2(p0[0] - pm[0], p0[1] - pm[1]);
        const prevDir = Math.atan2(p0[0] - pm[0], p0[1] - pm[1]);
        const tt = t - S.t0;
        let x = p1[0], z = p1[1], hd = dir, bob = 0, peck = 0, look = 0, step = 0;
        // it turns towards the new spot first (longer for a bigger turn) and only then walks: walking off while still
        // turning made it step backwards for a moment when the new spot lay behind it
        const tTurn = 0.12 + 0.3 * Math.abs(angDiff(prevDir, dir)) / Math.PI;
        const turn = smoothK(tt / tTurn);
        hd = prevDir + angDiff(prevDir, dir) * turn;
        if (tt < tTurn + walkT) {
          const k = smoothK(Math.max(0, tt - tTurn) / walkT); x = p0[0] + dx * k; z = p0[1] + dz * k;
          if (tt < tTurn) { x = p0[0]; z = p0[1]; }
          bob = u.hop ? 0.16 * Math.abs(Math.sin(TAU * 2.2 * tt)) : u.legs ? 0.012 * Math.abs(Math.sin(TAU * 1.4 * tt)) : 0.035 * Math.abs(Math.sin(TAU * 2.6 * tt)); // a sparrow hops
          step = Math.sin(TAU * 0.7 * Math.max(0, tt - tTurn)) * Math.min(1, (tt - tTurn) / 0.3, (tTurn + walkT - tt) / 0.3);
          look = 0.15 * Math.sin(TAU * 2.6 * tt);
        } else {
          // standing: pecks in short random bursts, looks about in between
          const q = (tt - tTurn - walkT) / 0.55, j = Math.floor(q), fq = q - j;
          if (!u.legs && h2(S.i * 31 + j, sd + 5) > 0.42) peck = Math.pow(Math.sin(Math.PI * fq), 2);
          look = 0.5 * vnoise(t * 0.7 + sd * 3.1);
        }
        o.position.set(b.p.x + x, b.p.y + bob, b.p.z + z);
        // yaw first, then the forward tip in the hen's own frame (an XYZ euler tipped it about the world X: facing away,
        // it 'pecked' with its tail)
        // hd is a heading in the parent's frame (the walk offset is too), but the quaternion is multiplied onto the hen's
        // resting pose, which already has a yaw (sets place hens at 30°, 120°, 200°…): take that yaw out, else a hen placed
        // turned round walked sideways or backwards for the whole film
        const fw = vd.set(0, 0, 1).applyQuaternion(b.q), baseYaw = Math.atan2(fw.x, fw.z);
        o.quaternion.multiply(qd.setFromEuler(euY.set(0.28 * peck, hd - baseYaw, 0, 'YXZ')));
        for (const c of o.children) {
          // a walker with legs (`legs`: a tortoise): children `*.legN` step in diagonal pairs while it walks
          if (u.legs && /leg\d$/.test(nodeName(c))) {
            if (!c.userData.lookBase) c.userData.lookBase = { q: c.quaternion.clone() };
            const n = +nodeName(c).slice(-1), sgn = (n === 0 || n === 3) ? 1 : -1;
            c.quaternion.copy(c.userData.lookBase.q).multiply(qd.setFromEuler(eu.set(0.55 * sgn * step, 0, 0)));
            continue;
          }
          if (!/head$/.test(nodeName(c)) || c.userData.anim) continue;
          if (!c.userData.lookBase) c.userData.lookBase = { q: c.quaternion.clone() };
          c.quaternion.copy(c.userData.lookBase.q).multiply(qd.setFromEuler(eu.set(0.95 * peck, look * (1 - peck), 0.12 * look)));
        }
      } else if (u.anim === 'browse') {
        // a donkey's head: grazing (head down, nibbling) or looking about, for random spans, gliding between them
        const sd = seedOf(o, u);
        const pose = (i) => (h2(i, sd) > 0.45 ? [0.75, 0.25 * (h2(i + 50, sd) - 0.5)] : [0.08 * h2(i + 70, sd), 0.75 * (h2(i + 90, sd) - 0.5)]);
        const S = slot(t, sd, 2.5, 7.0), a = pose(S.i - 1), c2 = pose(S.i), k = smoothK((t - S.t0) / 1.1);
        let pitch = a[0] + (c2[0] - a[0]) * k, yaw = a[1] + (c2[1] - a[1]) * k;
        let nib = pitch > 0.4 ? 0.06 * Math.sin(TAU * 1.7 * t) : 0.03 * vnoise(t * 1.3 + sd);
        // a walker (the pack donkey, stage3 `walkState`): it keeps its head up while it walks (a nod with each step), and
        // throws it up to bray
        const W = walkState(o);
        if (W) {
          const up = smoothK(W.on * 1.5);
          pitch += (0.04 - pitch) * up; yaw *= 1 - up; nib = nib * (1 - up) + up * 0.05 * Math.sin(TAU * W.d / 0.8);
          const br = brayEnv(W.bray);
          pitch += (-0.42 - pitch) * br; yaw *= 1 - br; nib *= 1 - br;
          // `look`: head up, looking straight ahead (a close-up of its face and ears)
          const lk = lookEnv(W.look);
          pitch += (-0.08 - pitch) * lk; yaw *= 1 - lk; nib *= 1 - lk;
        }
        // `share`: a skinned donkey (donkey-fiesta) bends its neck and its head, each taking a share of the same pose
        const sh = u.share ?? 1;
        o.quaternion.multiply(qd.setFromEuler(eu.set(sh * (pitch + nib), sh * yaw, sh * 0.05 * vnoise(t * 0.5 + sd * 2))));
      } else if (u.anim === 'flight-wing') {
        let host = o.parent;
        while (host && host.userData.flight == null) host = host.parent;
        const spread = host?.userData.flight || 0;
        const beat = Math.sin(TAU * 5.2 * t);
        o.quaternion.multiply(qd.setFromEuler(eu.set(.22 * spread * beat,
          u.side * .94 * (1-spread), u.side * spread * (.23 + .94 * beat))));
      } else if (u.anim === 'gait') {
        // a leg of a walker: swings fore and aft with the distance walked, diagonal pairs together (leg0 + leg3, leg1 + leg2)
        const W = walkState(o);
        const ph = (W ? W.d : 0) / (u.stride ?? 1.6) * TAU + (u.leg === 0 || u.leg === 3 ? 0 : Math.PI);
        const step = (W?.on ?? 0) * Math.sin(ph);
        o.quaternion.multiply(qd.setFromEuler(eu.set((u.swing ?? .36) * step, (u.spread ?? 0) * step, 0)));
      } else if (u.anim === 'bound') {
        const hop = walkState(o)?.hop;
        if (hop) {
          // Hind feet extend on takeoff. Forefeet reach out first and then fold on landing.
          const angle = u.hind ? .5 * hop.load - 1.05 * hop.lift * (1 - hop.flight)
            : -.52 * hop.lift + .45 * hop.land;
          o.quaternion.multiply(qd.setFromEuler(eu.set(angle, 0, 0)));
        }
      } else if (u.anim === 'knee') {
        // the knee / hock of a walker's leg (child of its `gait` bone): it bends while that leg swings forward, so the
        // hoof lifts off the ground and does not drag; straight while the leg carries the body
        const W = walkState(o);
        const ph = (W ? W.d : 0) / (u.stride ?? 1.6) * TAU + (u.leg === 0 || u.leg === 3 ? 0 : Math.PI);
        const lift = Math.max(0, -Math.cos(ph));
        o.quaternion.multiply(qd.setFromEuler(eu.set((u.bend ?? 0.5) * (W ? W.on : 0) * lift * lift * (3 - 2 * lift), 0, 0)));
      } else if (u.anim === 'jaw') {
        // the lower jaw: closed; opens and shuts while it brays („I-ha! I-ha!”)
        const W = walkState(o), br = brayEnv(W ? W.bray : -1);
        const open = br * (0.35 + 0.65 * Math.abs(Math.sin(Math.PI * 2.4 * Math.max(0, W ? W.bray : 0) * 1.6)));
        o.quaternion.multiply(qd.setFromEuler(eu.set(0.42 * (u.jaw ?? 1) * open, 0, 0)));
      } else if (u.anim === 'ear') {
        // a long donkey ear: holds a pose for a while, twitches to a new one quickly (forward, sideways, one flopped back),
        // a quick flick now and then; laid back while braying, a little bob with each step
        const sd = seedOf(o, u) + 13 * (u.side ?? 0), S = slot(t, sd, 0.8, 3.2), tt = t - S.t0;
        const pose = (i) => [0.45 * (h2(i, sd + 1) - 0.4), 0.3 * (h2(i, sd + 2) - 0.5)];
        const a = pose(S.i - 1), c2 = pose(S.i), k = smoothK(tt / 0.18);
        let rx = a[0] + (c2[0] - a[0]) * k, rz = a[1] + (c2[1] - a[1]) * k;
        if (h2(S.i, sd + 3) > 0.7 && tt < 0.35) rz += 0.25 * Math.sin(TAU * 3 * tt) * (u.side ?? 1);
        const W = walkState(o);
        if (W) {
          rx += 0.06 * W.on * Math.sin(TAU * W.d / 0.8 + 1);
          const br = brayEnv(W.bray); rx += (-0.55 - rx) * br; rz *= 1 - br;
          const lk = lookEnv(W.look); rx += (0.05 - rx) * lk * 0.8; rz *= 1 - 0.8 * lk;   // ears pricked up
        }
        o.quaternion.multiply(qd.setFromEuler(eu.set(rx, 0, rz)));
      } else if (u.anim === 'blink') {
        // an eyelid: hidden, closes for a blink at random moments (both lids of an animal share the seed) — and shut,
        // happily, while it brays
        const sd = seedOf(o, u), S = slot(t, sd + 5, 2.2, 5.5), tt = t - S.t0;
        let k = tt < 0.2 ? Math.sin(Math.PI * tt / 0.2) : 0;
        const W = walkState(o), br = brayEnv(W ? W.bray : -1);
        k = Math.max(k, br > 0.5 ? 1 : 0);
        o.visible = k > 0.05;
        o.scale.set(b.s.x, b.s.y * Math.max(0.05, k), b.s.z);
      } else if (u.anim === 'ruminate') {
        // a resting camel's neck: chews (a small steady bob) and turns its head slowly to look about
        const sd = seedOf(o, u);
        const pose = (i) => [0.22 * (h2(i + 11, sd) - 0.5), 0.8 * (h2(i + 23, sd) - 0.5)];
        const S = slot(t, sd, 3.0, 8.0), a = pose(S.i - 1), c2 = pose(S.i), k = smoothK((t - S.t0) / 1.6);
        const chew = 0.025 * Math.sin(TAU * 1.4 * t) + 0.015 * Math.sin(TAU * 2.9 * t + 1);
        o.quaternion.multiply(qd.setFromEuler(eu.set(a[0] + (c2[0] - a[0]) * k + chew, a[1] + (c2[1] - a[1]) * k, 0)));
      } else if (u.anim === 'swish') {
        // a tail at rest, swished now and then (random moments, two or three beats)
        const sd = seedOf(o, u), S = slot(t, sd + 9, 1.5, 5.0), tt = t - S.t0;
        const on = h2(S.i, sd + 9) > 0.45 && tt < 1.2 ? Math.sin(Math.PI * tt / 1.2) : 0;
        const k = u.swishAmp ?? 1; // the tip of a two-bone tail swings a little less again on top of its root
        o.quaternion.multiply(qd.setFromEuler(eu.set(k * 0.05 * vnoise(t * 0.6 + sd), k * 0.55 * on * Math.sin(TAU * 2.2 * tt), 0)));
      } else if (u.anim === 'wind') {
        // wheat in the wind: the vertex shader bends every stalk by its height above `base` (squared), in waves that run
        // across the field (world x, z) — a pure function of t (uniform), one shared shader per material
        o.traverse((m) => {
          if (!m.isMesh || m.userData.windInit) return;
          m.userData.windInit = true;
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          m.material = mats.map((mt) => windMaterial(mt, u.base ?? 0)).at(0);
          m.customDepthMaterial = undefined;
        });
        windTime.value = t;
      } else if (u.anim === 'flow') {
        // a river's water: semi-transparent (the bed and the wading legs show through), the ripples drift downstream
        if (o.isMesh && !u.flowInit) {
          o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = u.opacity ?? 0.8;
          o.castShadow = false; u.flowInit = true;
        }
        const m = o.material, off = t * (u.speed ?? 0.08);
        if (m) for (const tx of [m.map, m.normalMap, m.roughnessMap]) if (tx) tx.offset.set(0.02 * Math.sin(t * 0.21), off);
      } else if (u.anim === 'smoke') {
        const puffs = o.children.filter((c) => c.isMesh);
        const n = puffs.length || 1, sp = u.speed ?? 0.12, rise = u.rise ?? 4;
        puffs.forEach((c, i) => {
          if (!c.userData.lookMat) { c.material = c.material.clone(); c.material.transparent = true; c.material.depthWrite = false; c.userData.lookMat = true; c.castShadow = false; }
          const q = ((t * sp + i / n) % 1 + 1) % 1;
          c.position.set(0.7 * q * q + 0.12 * Math.sin(TAU * (q * 1.5 + i * 0.3)), q * rise, 0.25 * Math.sin(TAU * (q + i * 0.17)));
          c.scale.setScalar(0.3 + 1.1 * q);
          c.material.opacity = 0.38 * Math.sin(Math.PI * Math.min(1, q * 1.15));
        });
      }
      o.updateMatrix();
    }
  }

  // ------------------------------------------------ post
  let composer = null, grade = null, fxaa = null, bloom = null;
  const size = renderer.getSize(new THREE.Vector2());
  const pr = renderer.getPixelRatio();
  if (Q.post) {
    const rt = new THREE.WebGLRenderTarget(size.x * pr, size.y * pr, { type: THREE.HalfFloatType, samples: Q.msaa });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    if (Q.bloom) {
      bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.32, 0.55, 2.2);
      composer.addPass(bloom);
    }
    composer.addPass(new OutputPass());
    grade = new ShaderPass(GradeShader);
    grade.uniforms.warm.value = S.grade.warm; grade.uniforms.sat.value = S.grade.sat; grade.uniforms.lift.value = S.grade.lift;
    grade.uniforms.aspect.value = size.x / size.y;
    if (S.grade.vignette != null) grade.uniforms.vignette.value = S.grade.vignette;
    composer.addPass(grade);
    if (Q.aa === 'smaa') composer.addPass(smaaPass(size.x * pr, size.y * pr));
    else if (Q.aa === 'fxaa') { fxaa = new ShaderPass(FXAAShader); fxaa.uniforms.resolution.value.set(1 / (size.x * pr), 1 / (size.y * pr)); composer.addPass(fxaa); }
  }

  function render(t = 0) {
    skyUniforms.time.value = t;
    camera.updateMatrixWorld();
    dome.position.copy(camera.getWorldPosition(tmpV));
    dome.scale.setScalar(domeR());
    dome.updateMatrixWorld();
    fitShadow();
    animate(t);
    updateLamps(t);
    if (composer) composer.render(); else renderer.render(scene, camera);
  }
  function resize(w, h) {
    const p = renderer.getPixelRatio();
    if (composer) {
      composer.setSize(w, h);
      if (grade) grade.uniforms.aspect.value = w / h;
      if (fxaa) fxaa.uniforms.resolution.value.set(1 / (w * p), 1 / (h * p));
    }
  }
  function dispose() {
    scene.remove(dome, sun, sun.target, fill, ...extraLights);
    sun.shadow.dispose();
    for (const L of lamps.values()) scene.remove(L.light);
    if (scene.environment === envRT.texture) scene.environment = null;
    scene.fog = null;
    for (const d of disposables) d.dispose?.();
    if (composer) {
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
    }
  }
  return { render, resize, dispose, sky: S, sun, quality: Q };
}
