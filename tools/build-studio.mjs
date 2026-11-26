import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chaptersFrom, episode } from '../studio/episode.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const episodeDir = 'experiments/cleopa-painea';
const first = 'experiments/cleopa-blender';
const mp4 = path.join(ROOT, episodeDir, 'renders', episode.file);
const timeline = JSON.parse(fs.readFileSync(path.join(ROOT, episodeDir, 'timeline.json'), 'utf8'));
if (fs.statSync(mp4).size >= 5_000_000) throw new Error('Copia MP4 trebuie să aibă sub 5 MB.');
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
    ['Veselă și masă', `${first}/assets/props/tableware.blend`],
    ['Decorurile și recuzita episodului', `${episodeDir}/scripts/decor.py`],
  ]),
  group('Gesturi', [
    ['Semnul crucii', `${first}/scenes/cleopa_cross_test.blend`],
    ['Palme și degete', `${episodeDir}/scripts/hands.py`],
    ['Mâneci și articulații', `${episodeDir}/scripts/sleeves.py`],
  ]),
  group('Scene', [
    ['Casa familiei', `${first}/assets/backgrounds/farmhouse.blend`],
    ['Rugăciunea la masă', `${first}/scenes/prayer_at_table.blend`],
    ['Episodul editabil', `${episodeDir}/scenes/painea_care_poate_sa_astepte.blend`],
    ['Inspectorul scenei', '/inspectie/'],
  ]),
];

const out = path.join(ROOT, 'dist');
fs.rmSync(out, { recursive: true, force: true });
const media = path.join(out, 'media');
fs.mkdirSync(media, { recursive: true });
fs.copyFileSync(mp4, path.join(media, episode.file));
fs.copyFileSync(path.join(ROOT, 'studio/episod.webp'), path.join(media, 'episod.webp'));
const yardLayers = 'ograda-straturi';
fs.cpSync(path.join(ROOT, episodeDir, 'renders', yardLayers), path.join(media, yardLayers), { recursive: true });
for (const name of ['index.html', 'studio.css', 'studio.js', 'yard-editor.js']) {
  fs.copyFileSync(path.join(ROOT, 'studio', name), path.join(out, name));
}
fs.cpSync(path.join(ROOT, 'studio/inspectie'), path.join(out, 'inspectie'), { recursive: true });
fs.cpSync(path.join(ROOT, 'assets/branding'), path.join(out, 'assets/branding'), { recursive: true });
fs.writeFileSync(path.join(out, 'catalog.json'), JSON.stringify({ episode, chapters: chaptersFrom(timeline), library }));
console.log('Atelier pregătit în dist/.');
