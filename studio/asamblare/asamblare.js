import { WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assembleScene } from './scene.js';

const $ = (id) => document.getElementById(id);
const picker = $('clip-picker');
const params = new URLSearchParams(location.search);
const canvas = $('assembly-canvas');
const status = $('assembly-status');
const play = $('assembly-play');
const timeSlider = $('assembly-time');
const angle = $('assembly-angle');
const list = $('instance-list');
const loader = new GLTFLoader();
const assets = new Map();
const assetURL = (id) => `/assets/recuzita/${id}.glb`;
const clipURL = (id) => `/asamblare/scenes/${id}.json`;
const seconds = new Intl.NumberFormat('ro', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

let renderer;
let clip;
let player;
let time = 0;
let scheduledFrame;
let selection = 0;

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function loadAsset(id) {
  if (!assets.has(id)) {
    const request = loader.loadAsync(assetURL(id)).then(({ scene }) => scene).catch((error) => {
      assets.delete(id);
      throw error;
    });
    assets.set(id, request);
  }
  return assets.get(id);
}

function draw() {
  if (player) renderer.render(player.scene, player.camera);
}

function setTime(value) {
  time = value;
  player.setTime(time);
  timeSlider.value = time;
  $('assembly-readout').textContent = `${seconds.format(time)} s`;
  draw();
}

function stop() {
  cancelAnimationFrame(scheduledFrame);
  scheduledFrame = undefined;
  play.textContent = 'Redă clipul';
}

function resize() {
  const { width, height } = $('assembly-stage').getBoundingClientRect();
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(width, height, false);
  draw();
}

function showObjects(catalog) {
  list.querySelectorAll('.instance').forEach((row) => row.remove());
  for (const item of clip.objects) {
    const row = document.createElement('div');
    row.className = 'instance';
    const label = document.createElement('label');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.addEventListener('change', () => {
      // A mount can be invisible while accessories attached to it remain visible.
      player.objects.get(item.id).children[0].visible = checkbox.checked;
      draw();
    });
    label.append(checkbox, catalog[item.asset]);
    const file = document.createElement('a');
    file.href = assetURL(item.asset);
    file.download = '';
    file.textContent = 'GLB';
    file.setAttribute('aria-label', `Descarcă GLB, ${catalog[item.asset]}`);
    row.append(label, file);
    list.append(row);
  }
}

async function openClip({ id, png, mp4 }, catalog) {
  const latest = ++selection;
  stop();
  status.textContent = 'Se încarcă recuzita…';
  status.hidden = false;
  $('assembly-controls').hidden = true;
  list.disabled = true;
  $('clip-source').href = clipURL(id);
  for (const [extension, available] of [['png', png], ['mp4', mp4]]) {
    const link = $(`clip-${extension}`);
    link.href = `/asamblare/renders/${id}.${extension}`;
    link.hidden = !available;
  }
  for (const button of picker.children) button.setAttribute('aria-pressed', button.value === id);
  try {
    const descriptor = await json(clipURL(id));
    const ids = [...new Set(descriptor.objects.map(({ asset }) => asset))];
    const templates = await Promise.all(ids.map(async (key) => [key, await loadAsset(key)]));
    if (selection !== latest) return;
    clip = descriptor;
    player = assembleScene(clip, new Map(templates));
    player.setAngle(Number(angle.value));
    timeSlider.max = clip.duration;
    setTime(0);
    showObjects(catalog);
    list.disabled = false;
    $('assembly-controls').hidden = false;
    status.hidden = true;
  } catch (error) {
    if (selection !== latest) return;
    status.textContent = 'Scena nu s-a încărcat. Selectează din nou un clip.';
    throw error;
  }
}

async function start() {
  const [catalog, clips] = await Promise.all([
    json('/assets/recuzita/catalog.json'),
    json('/asamblare/clips.json'),
  ]);
  renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setClearColor('#31251d');
  const first = clips.find(({ id }) => id === 'painea-pe-masa') ?? clips[0];
  const selected = clips.find(({ id }) => id === params.get('clip')) ?? first;
  new ResizeObserver(resize).observe($('assembly-stage'));
  for (const item of [first, ...clips.filter((entry) => entry !== first)]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.value = item.id;
    button.textContent = item.title;
    button.addEventListener('click', () => openClip(item, catalog).catch(console.error));
    picker.append(button);
  }
  play.addEventListener('click', () => {
    if (scheduledFrame !== undefined) return stop();
    if (time >= clip.duration) setTime(0);
    const startTime = performance.now() - time * 1000;
    play.textContent = 'Pauză';
    function tick(now) {
      setTime(Math.min((now - startTime) / 1000, clip.duration));
      if (time < clip.duration) scheduledFrame = requestAnimationFrame(tick);
      else stop();
    }
    scheduledFrame = requestAnimationFrame(tick);
  });
  timeSlider.addEventListener('input', () => {
    stop();
    setTime(Number(timeSlider.value));
  });
  angle.addEventListener('input', () => {
    $('angle-readout').textContent = `${angle.value}°`;
    player.setAngle(Number(angle.value));
    draw();
  });
  await openClip(selected, catalog);

  if (params.has('export')) {
    // Headless Chromium captures the same drawing buffer as the live viewer.
    window.captureClip = {
      id: clip.id,
      duration: clip.duration,
      png(timeCode, width, height) {
        if (renderer.getPixelRatio() !== 1 || canvas.width !== width || canvas.height !== height) {
          renderer.setPixelRatio(1);
          renderer.setSize(width, height, false);
        }
        player.setTime(timeCode);
        player.setAngle(0);
        draw();
        return canvas.toDataURL('image/png').split(',')[1];
      },
    };
  }
}

start().catch((error) => {
  status.hidden = false;
  if (!renderer) status.textContent = 'Previzualizarea are nevoie de un browser cu WebGL 2. Poți consulta scena JSON și catalogul.';
  console.error(error);
});
