
export const episode = Object.freeze({
  id: 'painea-care-poate-sa-astepte',
  title: 'Pâinea care poate să aștepte',
  duration: 2090 / 24,
  file: 'painea_care_poate_sa_astepte.mp4',
  chapterNames: [
    'Satul în zori', 'Trezirea', 'Burtica', 'La troacă', 'Mihai și cartea',
    'Pâinea caldă', 'Drumul spre școală', 'Încă puțin…', 'Tata în prag', 'Întâi ne rugăm',
  ],
});

export function chaptersFrom(timeline) {
  if (timeline.end / timeline.fps !== episode.duration || timeline.beats.length !== episode.chapterNames.length) {
    throw new Error('Actualizează durata și capitolele din studio/episode.mjs.');
  }
  return timeline.beats.map(({ start }, index) => ({
    time: (start - 1) / timeline.fps,
    title: episode.chapterNames[index],
  }));
}
