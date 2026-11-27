import {
  AnimationMixer, Color, DataTexture, DirectionalLight, Fog, FrontSide, Group, HemisphereLight,
  MathUtils, MeshBasicMaterial, MeshToonMaterial, NearestFilter, PerspectiveCamera, RedFormat,
  Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneRig } from 'three/addons/utils/SkeletonUtils.js';

const $ = (id) => document.getElementById(id);
const canvas = $('volum-canvas');
const status = $('volum-status');
const picker = $('test-picker');
const slider = $('volum-time');
const play = $('volum-play');
const orbit = $('volum-angle');
const params = new URLSearchParams(location.search);
const seconds = new Intl.NumberFormat('ro', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const loader = new GLTFLoader();
const EPISODE = 'episod';

let renderer;
let scene;
let camera;
let data;
let stages;
let current;
let time = 0;
let playing = true;
let last;
let frame;

const steps = new Uint8Array([90, 175, 255]);
const gradient = new DataTexture(steps, steps.length, 1, RedFormat);
gradient.minFilter = gradient.magFilter = NearestFilter;
gradient.needsUpdate = true;

// Flat colours with two light steps, as in the painted episode; the contour hull stays unlit.
function toon(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    node.frustumCulled = false;
    const convert = (material) => {
      if (material.name.includes('Contur')) {
        return new MeshBasicMaterial({ color: material.color, side: FrontSide });
      }
      return new MeshToonMaterial({ color: material.color, gradientMap: gradient, side: material.side });
    };
    node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material);
  });
  return root;
}

const toThree = ([x, y]) => new Vector3(x, 0, -y);

function buildStage(test, models) {
  const group = new Group();
  group.visible = false;
  const action = test.action ?? test.id;
  const clip = models.mama.animations.find(({ name }) => name === action);
  if (!clip) throw new Error(`Lipsește acțiunea ${action}`);
  const performers = (test.instances ?? [{ position: [0, 0], yaw: 0, delay: 0 }]).map((place) => {
    const holder = new Group();
    holder.position.copy(toThree(place.position));
    holder.rotation.y = MathUtils.degToRad(place.yaw);
    const body = cloneRig(models.mama.scene);
    holder.add(body);
    group.add(holder);
    const mixer = new AnimationMixer(body);
    const performance = mixer.clipAction(clip).play();
    return { mixer, performance, delay: place.delay ?? 0, duration: clip.duration, pelvis: body.getObjectByName('pelvis') };
  });
  const props = (test.props ?? []).map(({ asset, keys }) => {
    const prop = models[asset].scene.clone(true);
    group.add(prop);
    return { prop, keys };
  });
  scene.add(group);
  return { test, group, performers, props, duration: test.duration };
}

function placeProps(props, t) {
  for (const { prop, keys } of props) {
    const next = keys.findIndex(({ at }) => at > t);
    if (next <= 0) {
      prop.position.fromArray(next === 0 ? keys[0].position : keys.at(-1).position);
      continue;
    }
    const a = keys[next - 1];
    const b = keys[next];
    const k = (t - a.at) / (b.at - a.at);
    prop.position.set(...a.position.map((value, axis) => MathUtils.lerp(value, b.position[axis], k)));
  }
}

const target = new Vector3();
const pelvis = new Vector3();

function pose(stage, t) {
  for (const { mixer, performance, delay, duration } of stage.performers) {
    performance.time = MathUtils.clamp(t - delay, 0, duration);
    mixer.update(0);
  }
  placeProps(stage.props, t);
  const view = stage.test.camera;
  target.fromArray(view.target);
  camera.position.fromArray(view.position);
  if (view.follow) {
    stage.group.updateMatrixWorld(true);
    stage.performers[0].pelvis.getWorldPosition(pelvis);
    const shift = pelvis.x * view.follow;
    target.x += shift;
    camera.position.x += shift;
  }
  // The angle slider turns the camera around the vertical axis through the target.
  const offset = camera.position.clone().sub(target);
  offset.applyAxisAngle(new Vector3(0, 1, 0), MathUtils.degToRad(Number(orbit.value)));
  camera.position.copy(target).add(offset);
  camera.fov = view.fov;
  camera.updateProjectionMatrix();
  camera.lookAt(target);
}

function episodeDuration() {
  return data.episode.shots.reduce((sum, shot) => sum + shot.to - shot.from, 0);
}

function shotAt(t) {
  let start = 0;
  for (const shot of data.episode.shots) {
    const length = shot.to - shot.from;
    if (t < start + length) return { shot, local: shot.from + t - start };
    start += length;
  }
  const shot = data.episode.shots.at(-1);
  return { shot, local: shot.to };
}

function duration() {
  return current === EPISODE ? episodeDuration() : stages.get(current).duration;
}

function render() {
  let stage;
  let local = time;
  if (current === EPISODE) {
    const found = shotAt(time);
    stage = stages.get(found.shot.test);
    local = found.local;
    $('shot-line').textContent = found.shot.line;
  } else {
    stage = stages.get(current);
  }
  for (const item of stages.values()) item.group.visible = item === stage;
  pose(stage, local);
  renderer.render(scene, camera);
  slider.value = time;
  $('volum-readout').textContent = `${seconds.format(time)} s`;
  canvas.dataset.time = time.toFixed(3);
  canvas.dataset.test = stage.test.id;
}

function tick(now) {
  if (playing && last !== undefined) {
    time += (now - last) / 1000;
    // Every test loops: past the end it starts again from the first frame.
    if (time >= duration()) time %= duration();
  }
  last = now;
  render();
  frame = requestAnimationFrame(tick);
}

function setPlaying(value) {
  playing = value;
  play.textContent = playing ? 'Pauză' : 'Redă';
  play.setAttribute('aria-label', playing ? 'Pauză' : 'Redă testul');
  last = undefined;
}

function describe(test) {
  $('test-title').textContent = test.title;
  $('test-description').textContent = test.description;
  $('test-sheet').href = `/volum/foi/${test.instances ? 'mers-spre-camera' : test.id}.webp`;
  const list = $('test-report');
  list.replaceChildren();
  const add = (kind, title, text) => {
    const item = document.createElement('li');
    item.dataset.kind = kind;
    const heading = document.createElement('strong');
    heading.textContent = title;
    item.append(heading, text);
    list.append(item);
  };
  const { report } = test;
  add(report.slip < .002 ? 'ok' : 'warn', 'Sprijin și lungimi',
    `Talpa de sprijin stă pe loc, iar membrele își păstrează lungimea. Abaterea maximă: ${(report.slip * 1000).toFixed(1)} mm.`);
  for (const { contact, frame: at, distance } of report.contacts ?? []) {
    add('ok', `Contact · ${contact}`, `Cadrul ${at}: vârful degetelor la ${(distance * 1000).toFixed(1)} mm de suprafață.`);
  }
  const spans = (frames) => frames.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ');
  if (!report.intersections.length) add('ok', 'Intersecții', 'Nicio piesă nu intră în alta.');
  for (const { parts, frames, allowed, reason } of report.intersections) {
    add(allowed ? 'ok' : 'warn', `${parts.join(' + ')} · cadrele ${spans(frames)}`, reason);
  }
}

function select(id) {
  current = id;
  time = 0;
  setPlaying(true);
  for (const button of picker.children) button.setAttribute('aria-pressed', String(button.value === id));
  if (id === EPISODE) {
    $('test-title').textContent = data.episode.title;
    $('test-description').textContent = 'Toate testele, montate ca un scurt episod pe drumul satului. Fiecare plan folosește camera testului său.';
    $('test-report').replaceChildren();
    $('test-sheet').href = '/volum/foi/mers-spre-camera.webp';
  } else {
    describe(data.tests.find((test) => test.id === id));
    $('shot-line').textContent = '';
  }
  slider.max = duration();
  const url = new URL(location.href);
  url.searchParams.set('test', id);
  history.replaceState(null, '', url);
}

function resize() {
  const { width, height } = $('volum-stage').getBoundingClientRect();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

async function start() {
  const [tests, mama, drum, galeata] = await Promise.all([
    fetch('/volum/teste.json').then((response) => response.json()),
    loader.loadAsync('/assets/recuzita/mama-volum.glb'),
    loader.loadAsync('/assets/recuzita/drum-volum.glb'),
    loader.loadAsync('/assets/recuzita/galeata-volum.glb'),
  ]);
  data = tests;
  renderer = new WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: params.has('export') });
  renderer.outputColorSpace = SRGBColorSpace;
  scene = new Scene();
  scene.background = new Color('#f3d9a8');
  scene.fog = new Fog('#f3d9a8', 18, 60);
  scene.add(new HemisphereLight('#fff4dd', '#8a7350', 1.6));
  const sun = new DirectionalLight('#fff1d6', 2.2);
  sun.position.set(-4, 9, 6);
  scene.add(sun);
  scene.add(toon(drum.scene));
  toon(mama.scene);
  toon(galeata.scene);
  camera = new PerspectiveCamera(40, 16 / 9, .05, 200);
  const models = { mama, 'galeata-volum': galeata };
  stages = new Map(data.tests.map((test) => [test.id, buildStage(test, models)]));

  const choices = [[EPISODE, data.episode.title], ...data.tests.map((test) => [test.id, test.title])];
  for (const [id, title] of choices) {
    const button = document.createElement('button');
    button.type = 'button';
    button.value = id;
    button.textContent = title;
    button.addEventListener('click', () => select(id));
    picker.append(button);
  }
  play.addEventListener('click', () => setPlaying(!playing));
  slider.addEventListener('input', () => {
    setPlaying(false);
    time = Number(slider.value);
  });
  orbit.addEventListener('input', () => { $('volum-angle-readout').textContent = `${orbit.value}°`; });
  new ResizeObserver(resize).observe($('volum-stage'));
  resize();
  const requested = params.get('test');
  select(choices.some(([id]) => id === requested) ? requested : EPISODE);
  $('volum-controls').hidden = false;
  status.hidden = true;
  if (params.has('export')) {
    // Headless capture of the same drawing at exact times, for MP4 export.
    cancelAnimationFrame(frame);
    window.captureVolum = {
      duration: duration(),
      png(at, width, height) {
        renderer.setPixelRatio(1);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        time = at;
        render();
        return canvas.toDataURL('image/png').split(',')[1];
      },
    };
    return;
  }
  frame = requestAnimationFrame(tick);
}

start().catch((error) => {
  status.hidden = false;
  status.textContent = 'Modelul are nevoie de WebGL 2. Poți descărca GLB-ul și foile de cadre.';
  console.error(error);
});
