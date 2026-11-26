// Browser entry points of the blender style, shared by the recorder page (lib/engine/main.js) and the web catalog
// player (lib/web/player.js): compile the film with the set / character metadata, preload every GLB, build the stage.
import { compile3, setNames } from './timeline3.js';
import { loadJSON, setAssetBase } from './assets.js';
import { Stage3, preloadFilm } from './stage3.js';
export { runChecks3 } from './checks3.js';

export async function compileFilm(desc, manifest, { base } = {}) {
  if (base) setAssetBase(base);
  const setMetas = {};
  for (const n of setNames(desc)) { const m = await loadJSON(`assets/sets/${n}.json`, null); if (m) setMetas[n] = m; }
  const charMeta = await loadJSON('assets/characters/monk.json', {});
  return compile3(desc, manifest, { setMetas, charMeta });
}

export async function createStage(canvas, tl, desc, opts = {}) {
  const assets = await preloadFilm(desc, tl);
  const stage = new Stage3(canvas, tl, desc, assets, opts);
  return stage;
}
