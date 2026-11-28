import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { DEFAULT_EPISODE_ID } from '../studio/episode.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const episodeDir = 'experiments/cleopa-painea';
const first = 'experiments/cleopa-blender';
const gitHub = 'https://github.com/ctalau/viata-parintelui-cleopa';

function group(title, paths) {
  return {
    group: title,
    entries: paths.map(([name, relative]) => ({
      name, link: relative.startsWith('/') ? relative : `${gitHub}/blob/main/${relative}`,
    })),
  };
}

const library = [
  group('Personaje', [
    ['Familia cu riguri revizuite', `${episodeDir}/assets/family_rigs.blend`],
    ['Costică', `${first}/assets/characters/cleopa/cleopa.blend`],
    ['Mama', `${first}/assets/characters/mother/mother.blend`],
    ['Tata', `${first}/assets/characters/father/father.blend`],
    ['Preot', `${first}/assets/characters/priest/priest.blend`],
  ]),
  group('Obiecte', [
    ['Asamblează scene din recuzită', '/asamblare/'],
    ['Veselă și masă', `${first}/assets/props/tableware.blend`],
    ['Decorurile și recuzita episodului', `${episodeDir}/scripts/decor.py`],
  ]),
  group('Gesturi', [
    ['Semnul crucii', `${first}/scenes/cleopa_cross_test.blend`],
    ['Palme și degete', `${episodeDir}/scripts/hands.py`],
    ['Teste de articulații cu Mama', '/articulatii/'],
    ['Palme 2.5D: trei abordări în test de stres', '/palme/'],
    ['Compară mâinile în 3D și 2D', '/comparatie-maini/'],
    ['Corp volumetric și teste de stres', '/volum/'],
    ['Mama volumetrică în Blender', 'experiments/cleopa-volum/scenes/mama_volumetrica.blend'],
    ['Mâneci și articulații', `${episodeDir}/scripts/sleeves.py`],
  ]),
  group('Scene', [
    ['Casa familiei', `${first}/assets/backgrounds/farmhouse.blend`],
    ['Rugăciunea la masă', `${first}/scenes/prayer_at_table.blend`],
    ['Scena Blender de referință', `${episodeDir}/scenes/painea_care_poate_sa_astepte.blend`],
    ['Inspectorul scenei', '/inspectie/'],
  ]),
];

const out = path.join(ROOT, 'dist');
fs.rmSync(out, { recursive: true, force: true });
const media = path.join(out, 'media');
fs.mkdirSync(media, { recursive: true });
fs.copyFileSync(path.join(ROOT, 'studio/episod.webp'), path.join(media, 'episod.webp'));
const yardLayers = 'ograda-straturi';
fs.cpSync(path.join(ROOT, episodeDir, 'renders', yardLayers), path.join(media, yardLayers), { recursive: true });
for (const name of ['index.html', 'studio.css']) {
  fs.copyFileSync(path.join(ROOT, 'studio', name), path.join(out, name));
}
const isWebAsset = (file) => path.extname(file).toLowerCase() !== '.mp4';
const inspector = path.join(out, 'inspectie');
fs.cpSync(path.join(ROOT, 'studio/inspectie'), inspector, {
  recursive: true,
  filter: (file) => path.basename(file) !== 'inspectie.js',
});
fs.cpSync(path.join(ROOT, 'assets'), path.join(out, 'assets'), {
  recursive: true,
  filter: (file) => file !== path.join(ROOT, 'assets/film') && isWebAsset(file),
});
const episodes = [];
for (const id of fs.readdirSync(path.join(ROOT, 'episodes')).sort()) {
  const source = path.join(ROOT, 'episodes', id);
  if (!fs.existsSync(path.join(source, 'episode.json'))) continue;
  const { title, displayTitle, summary } = JSON.parse(fs.readFileSync(path.join(source, 'episode.json'), 'utf8'));
  episodes.push({ id, title: displayTitle ?? title, summary });
  const target = path.join(out, 'episodes', id);
  fs.mkdirSync(target, { recursive: true });
  for (const name of ['episode.json', 'timeline.json', 'audio', 'poster.webp']) {
    if (fs.existsSync(path.join(source, name))) {
      fs.cpSync(path.join(source, name), path.join(target, name), { recursive: true, filter: isWebAsset });
    }
  }
}
if (!episodes.some(({ id }) => id === DEFAULT_EPISODE_ID)) throw new Error('Episodul principal lipsește.');

for (const entry of ['studio.js', 'inspectie/inspectie.js']) {
  buildSync({ entryPoints: [path.join(ROOT, 'studio', entry)], outfile: path.join(out, entry),
    bundle: true, minify: true, format: 'esm' });
}
const assembly = path.join(out, 'asamblare');
for (const name of ['index.html', 'asamblare.css', 'scenes', 'renders']) {
  const source = path.join(ROOT, 'studio/asamblare', name);
  if (name === 'renders' && !fs.existsSync(source)) continue;
  fs.cpSync(source, path.join(assembly, name), { recursive: true, filter: isWebAsset });
}
const scenesDir = path.join(assembly, 'scenes');
const clips = fs.readdirSync(scenesDir).filter((file) => file.endsWith('.json')).map((file) => {
  const { id, title, category } = JSON.parse(fs.readFileSync(path.join(scenesDir, file), 'utf8'));
  if (!/^[a-z0-9-]+$/.test(id) || file !== `${id}.json` || !title) {
    throw new Error(`Verifică ID-ul și titlul scenei din ${file}.`);
  }
  return {
    id, title, category,
    png: fs.existsSync(path.join(assembly, 'renders', `${id}.png`)),
  };
});
fs.writeFileSync(path.join(assembly, 'clips.json'), JSON.stringify(clips));
buildSync({
  entryPoints: [path.join(ROOT, 'studio/asamblare/asamblare.js')],
  outfile: path.join(assembly, 'asamblare.js'),
  bundle: true,
  minify: true,
  format: 'esm',
});
fs.cpSync(path.join(ROOT, 'studio/articulatii'), path.join(out, 'articulatii'), { recursive: true });
const comparison = path.join(out, 'comparatie-maini');
fs.mkdirSync(comparison, { recursive: true });
fs.cpSync(path.join(ROOT, 'studio/comparatie-maini/foi'), path.join(comparison, 'foi'), { recursive: true });
for (const name of ['index.html', 'comparatie.css']) {
  fs.copyFileSync(path.join(ROOT, 'studio/comparatie-maini', name), path.join(comparison, name));
}
buildSync({
  entryPoints: [path.join(ROOT, 'studio/comparatie-maini/comparatie.js')],
  outfile: path.join(comparison, 'comparatie.js'),
  bundle: true, minify: true, format: 'esm',
});
const volume = path.join(out, 'volum');
fs.mkdirSync(volume, { recursive: true });
for (const name of ['index.html', 'volum.css', 'teste.json', 'foi']) {
  fs.cpSync(path.join(ROOT, 'studio/volum', name), path.join(volume, name), { recursive: true });
}
buildSync({
  entryPoints: [path.join(ROOT, 'studio/volum/volum.js')],
  outfile: path.join(volume, 'volum.js'),
  bundle: true, minify: true, format: 'esm',
});
const palms = path.join(out, 'palme');
fs.mkdirSync(palms, { recursive: true });
for (const name of ['index.html', 'palme.css']) fs.copyFileSync(path.join(ROOT, 'studio/palme', name), path.join(palms, name));
buildSync({
  entryPoints: [path.join(ROOT, 'studio/palme/palme.js')],
  outfile: path.join(palms, 'palme.js'),
  bundle: true, minify: true, format: 'esm',
});
fs.writeFileSync(path.join(out, 'catalog.json'), JSON.stringify({ defaultEpisode: DEFAULT_EPISODE_ID, episodes, library }));
console.log('Atelier pregătit în dist/.');
