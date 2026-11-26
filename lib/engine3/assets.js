// Loading of the blender-style assets (GLB + json), cached per URL. Works in the browser (dev server, Vercel dist/)
// and in Node (tests: pass `readFile`). GLBs carry no Draco / meshopt compression, so no decoder is shipped.
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CharacterAsset, resolveLook } from './character.js';

const cache = new Map();
let BASE = '/';
/** where `assets/` lives (the web catalog serves it at /assets/, the recorder too) */
export function setAssetBase(b) { BASE = b.endsWith('/') ? b : b + '/'; }
export const assetUrl = (rel) => BASE + rel.replace(/^\//, '');

export function loadGLB(rel) {
  const url = assetUrl(rel);
  if (!cache.has(url)) cache.set(url, new GLTFLoader().loadAsync(url));
  return cache.get(url);
}
export async function loadJSON(rel, fallback = null) {
  const url = assetUrl(rel);
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => (r.ok ? r.json() : fallback)).catch(() => fallback));
  return cache.get(url);
}
/** the toy monk (every look variant + every clip) */
export async function loadCharacterAsset(name = 'monk') {
  const key = 'char:' + name;
  if (!cache.has(key)) cache.set(key, Promise.all([loadGLB(`assets/characters/${name}.glb`), loadJSON(`assets/characters/${name}.json`, {})]).then(([g, m]) => new CharacterAsset(g, m)));
  return cache.get(key);
}

/** Both the player and the character preview load these portraits only when a look requests one. */
export async function loadPortraitHeads(asset, looks) {
  const missing = looks.map((look) => resolveLook(look || {}).portrait)
    .filter((name) => name && !asset.portraitHeads?.has(name));
  const files = new Set(missing.map((name) => ['ioan-colov', 'fratele-mare-colov'].includes(name) ? 'ioan-colov' : 'nodul-albastru'));
  await Promise.all([...files].map(async (file) => {
    const { scene } = await loadGLB(`assets/characters/${file}.glb`);
    asset.portraitHeads ??= new Map();
    for (const root of scene.children) {
      if (root.userData.portraitVariant) asset.portraitHeads.set(root.userData.portraitVariant, root);
    }
  }));
}
/** parse a GLB ArrayBuffer (Node tests) */
export function parseGLB(buffer) {
  return new Promise((res, rej) => new GLTFLoader().parse(buffer, '', res, rej));
}
