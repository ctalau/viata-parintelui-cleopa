import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/common.mjs';
import { build } from './site.mjs';
import { chaptersFrom, episode } from '../studio/episode.mjs';

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
    ['Călugăr 3D', 'assets/characters/monk.glb'],
  ]),
  group('Obiecte', [
    ['Veselă și masă', `${first}/assets/props/tableware.blend`],
    ['Coș de pâine', 'assets/props/bread-basket.glb'],
    ['Candelă', 'assets/props/scetis-candela.glb'],
    ['Ulcior', 'assets/props/jug.glb'],
  ]),
  group('Gesturi', [
    ['Semnul crucii', `${first}/scenes/cleopa_cross_test.blend`],
    ['Palme și degete', `${episodeDir}/scripts/hands.py`],
    ['Gesturi 2D', 'lib/components/minifig.js#L299'],
    ['Clipuri pentru călugări', 'blender/characters/monk_clips.py'],
  ]),
  group('Scene', [
    ['Casa familiei', `${first}/assets/backgrounds/farmhouse.blend`],
    ['Rugăciunea la masă', `${first}/scenes/prayer_at_table.blend`],
    ['Chilie 3D', 'assets/sets/cell-room.glb'],
    ['Dimineață la schit', '/001-demo-atelier/'],
  ]),
];

const { out } = build();
const media = path.join(out, 'media');
fs.mkdirSync(media, { recursive: true });
fs.copyFileSync(mp4, path.join(media, episode.file));
fs.copyFileSync(path.join(ROOT, 'studio/episod.webp'), path.join(media, 'episod.webp'));
const yardLayers = 'ograda-straturi';
fs.cpSync(path.join(ROOT, episodeDir, 'renders', yardLayers), path.join(media, yardLayers), { recursive: true });
for (const name of ['index.html', 'studio.css', 'studio.js', 'yard-editor.js']) {
  fs.copyFileSync(path.join(ROOT, 'studio', name), path.join(out, name));
}
fs.writeFileSync(path.join(out, 'catalog.json'), JSON.stringify({ episode, chapters: chaptersFrom(timeline), library }));
console.log('Atelier pregătit în dist/.');
