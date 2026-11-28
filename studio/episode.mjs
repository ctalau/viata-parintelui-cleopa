import timing from '../episodes/001-painea-care-poate-sa-astepte/timeline.json' with { type: 'json' };

export const DEFAULT_EPISODE_ID = '001-painea-care-poate-sa-astepte';

export const episode = Object.freeze({
  id: 'painea-care-poate-sa-astepte',
  title: 'Pâinea care poate să aștepte',
  duration: timing.end / timing.fps,
  chapterNames: timing.beats.map(({ title }) => title),
});
