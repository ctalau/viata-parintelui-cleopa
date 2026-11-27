import { WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assembleScene } from '../asamblare/scene.js';

const $ = (id) => document.getElementById(id);
const select = $('gesture');
const slider = $('frame');
const orbit = $('compare-angle');
const play = $('compare-play');
const status = $('compare-status');
const loader = new GLTFLoader();
const assets = '/assets/recuzita/';
const source = 'https://github.com/ctalau/viata-parintelui-cleopa/blob/main/experiments/cleopa-painea/scenes/';
const modes = ['3d', '2d'];
let revision = 0;
let tick;
let panels;

async function json(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} ${url}`);
  return response.json();
}

function stop() {
  cancelAnimationFrame(tick);
  tick = undefined;
  play.textContent = 'Redă';
}

// The chosen gesture plays at once in both panels and starts over at the end.
function loop() {
  stop();
  const first = Number(slider.value);
  const start = performance.now();
  const count = Number(slider.max);
  play.textContent = 'Pauză';
  function step(now) {
    const frame = 1+(first-1+Math.floor((now-start)*.024)) % count;
    if (Number(slider.value) !== frame) draw(frame);
    tick = requestAnimationFrame(step);
  }
  tick = requestAnimationFrame(step);
}

function draw(frame = Number(slider.value)) {
  slider.value = frame;
  $('current-frame').textContent = `${frame} / ${slider.max}`;
  for (const { renderer, player, canvas } of panels) {
    if (!player) continue;
    player.setTime((frame-1)/24);
    player.setAngle(Number(orbit.value));
    renderer.render(player.scene, player.camera);
    canvas.dataset.frame = frame;
  }
}

function release(player) {
  if (!player) return;
  player.dispose();
  const geometries = new Set();
  const materials = new Set();
  player.scene.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) for (const m of [].concat(node.material)) materials.add(m);
  });
  for (const item of geometries) item.dispose();
  for (const item of materials) item.dispose();
}

async function selectGesture(id) {
  stop();
  const request = ++revision;
  const slug = id.slice(5);
  $('timeline').hidden = true;
  status.hidden = false;
  status.textContent = 'Se încarcă cele două variante…';
  for (const mode of modes) $(`links-${mode}`).hidden = true;
  try {
    const [descriptor, ...models] = await Promise.all([
      json(`/asamblare/scenes/${id}.json`),
      loader.loadAsync(`${assets}mama-3d-${slug}.glb`),
      loader.loadAsync(`${assets}${id}.glb`),
    ]);
    if (request !== revision) return;
    slider.max = Math.round(descriptor.duration*24)+1;
    for (const [index,panel] of panels.entries()) {
      release(panel.player);
      const mode = panel.mode;
      const item = descriptor.objects[0];
      panel.player = assembleScene({ ...descriptor, objects:[item] }, new Map([[item.asset,models[index]]]));
      $(`projection-${mode}`).href = `/assets/proiectii/${slug}-${mode}.json`;
      $(`blend-${mode}`).href = `${source}mama-${mode === '3d' ? '3d' : 'gest'}-${slug}.blend`;
      $(`glb-${mode}`).href = `${assets}${mode === '3d' ? 'mama-3d-'+slug : id}.glb`;
      $(`sheet-${mode}`).href = `${mode === '3d' ? '/comparatie-maini' : '/articulatii'}/foi/${slug}.webp`;
      $(`links-${mode}`).hidden = false;
    }
    const url = new URL(location.href);
    url.searchParams.set('clip',id);
    history.replaceState(null,'',url);
    draw(1);
    $('timeline').hidden = false;
    status.hidden = true;
    loop();
  } catch (error) {
    if (request === revision) status.textContent = 'Variantele nu s-au încărcat. Alege din nou gestul.';
    console.error(error);
  }
}

async function start() {
  const clips = (await json('/asamblare/clips.json')).filter(({ category }) => category === 'gesturi-mama');
  panels = modes.map((mode) => {
    const canvas = $(`model-${mode}`);
    const renderer = new WebGLRenderer({ canvas, antialias:true });
    renderer.setClearColor('#31251d');
    return { mode, canvas, renderer, player:null };
  });
  for (const { canvas,renderer } of panels) {
    new ResizeObserver(() => {
      renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
      renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
      draw();
    }).observe(canvas);
  }
  for (const { id,title } of clips) select.add(new Option(title,id));
  const requested = new URLSearchParams(location.search).get('clip');
  select.value = clips.some(({ id }) => id === requested) ? requested : 'mama-cruce';
  select.disabled = false;
  select.addEventListener('change',() => selectGesture(select.value));
  slider.addEventListener('input',() => { stop(); draw(); });
  orbit.addEventListener('input',() => {
    $('current-angle').textContent = `${orbit.value}°`;
    draw();
  });
  for (const [id,delta] of [['previous-frame',-1],['next-frame',1]]) {
    $(id).addEventListener('click',() => {
      stop();
      draw(Math.max(1, Math.min(Number(slider.max),Number(slider.value)+delta)));
    });
  }
  play.addEventListener('click',() => (tick !== undefined ? stop() : loop()));
  await selectGesture(select.value);
}

start().catch((error) => {
  status.textContent = 'Comparația necesită WebGL 2 și acces la fișierele atelierului.';
  console.error(error);
});
