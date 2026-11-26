
import timing from '../experiments/cleopa-painea/timeline.json' with { type: 'json' };

const originalChapterNames = {
  sat: 'Satul în zori',
  trezire: 'Trezirea',
  burtica: 'Burtica',
  troaca: 'La troacă',
  mihai: 'Mihai și cartea',
  cuptor: 'Pâinea caldă',
  traista: 'Drumul spre școală',
  aproape: 'Încă puțin…',
  prag: 'Tata în prag',
  intai: 'Întâi ne rugăm',
};

export const episode = Object.freeze({
  id: 'painea-care-poate-sa-astepte',
  title: 'Pâinea care poate să aștepte',
  duration: timing.end / timing.fps,
  file: 'painea_care_poate_sa_astepte.mp4',
  chapterNames: timing.beats.map(({ id, title }) => title ?? originalChapterNames[id]),
});

export function chaptersFrom(timeline) {
  if (timeline.end / timeline.fps !== episode.duration || timeline.beats.length !== episode.chapterNames.length ||
      episode.chapterNames.some((title) => !title)) {
    throw new Error('Verifică durata și titlurile capitolelor din cronologia episodului.');
  }
  return timeline.beats.map(({ start }, index) => ({
    time: (start - 1) / timeline.fps,
    title: episode.chapterNames[index],
  }));
}
