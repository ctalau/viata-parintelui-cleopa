import { renderLibrary } from './landing.js';
import { createFilm } from './film/engine.js';

const audio = document.querySelector('#episode');
const canvas = document.querySelector('#episode-picture');
const dialog = document.querySelector('#note-dialog');
const form = document.querySelector('#note-form');
const dialogTime = document.querySelector('#note-time');
const status = document.querySelector('#feedback-status');
const notesList = document.querySelector('#notes');
const notesEmpty = document.querySelector('#notes-empty');
const downloadButton = document.querySelector('#download-notes');
const clearButton = document.querySelector('#clear-notes');
const screen = document.querySelector('#screen');
const controls = document.querySelector('#player-controls');
const play = document.querySelector('#play');
const seek = document.querySelector('#seek');
const playbackTime = document.querySelector('#play-time');
const playbackStatus = document.querySelector('#play-status');
const flag = document.querySelector('#flag');
const sound = document.querySelector('#sound');
const full = document.querySelector('#full');
const jumpButtons = [...document.querySelectorAll('[data-skip]')];
const episodeLength = document.querySelector('#episode-length');
const title = document.querySelector('#title');
const description = document.querySelector('#episode-description');
let episodeTitle;
let notesKey;
let notesFilename;
let notes = [];
let episodeDuration;
let chapterList = [];
let markedTime = 0;
let film;
let tick;

async function renderFilm() {
  if (!film) return;
  try {
    await film.draw(currentTime());
  } catch (error) {
    audio.pause();
    playbackStatus.textContent = 'Planul nu s-a putut încărca. Reîncarcă pagina.';
    playbackStatus.hidden = false;
    console.error(error);
  }
}

function animate() {
  void renderFilm();
  if (!audio.paused) tick = requestAnimationFrame(animate);
}

function clock(time, decimal = false) {
  const tenths = Math.round(time * 10);
  const seconds = decimal ? Math.floor(tenths / 10) : Math.floor(time);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return decimal ? `${clock}.${tenths % 10}` : clock;
}

function duration() {
  return episodeDuration ?? (Number.isFinite(audio.duration) ? audio.duration : 0);
}

function currentTime() {
  return Math.min(audio.currentTime, duration());
}

function updateTime() {
  const time = currentTime();
  seek.value = time;
  seek.setAttribute('aria-valuetext', clock(time, true));
  playbackTime.textContent = `${clock(time, true)} / ${clock(duration(), true)}`;
}

function updateDuration() {
  const seconds = Math.round(duration());
  episodeLength.textContent = seconds ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : '';
  seek.disabled = !film || audio.readyState === 0;
  play.disabled = !film || audio.readyState === 0;
  seek.max = seek.disabled ? 0 : duration();
  flag.disabled = seek.disabled;
  for (const button of jumpButtons) button.disabled = seek.disabled;
  updateTime();
}

function updatePlay() {
  play.setAttribute('aria-label', audio.paused ? 'Redă filmul' : 'Pauză');
  play.dataset.playing = String(!audio.paused);
}

function jumpTo(time) {
  if (audio.readyState === 0 || !film) return;
  audio.currentTime = Math.max(0, Math.min(duration(), time));
  updateTime();
}

async function togglePlayback() {
  if (play.disabled) return;
  if (!audio.paused) {
    audio.pause();
    return;
  }
  try {
    await audio.play();
    playbackStatus.hidden = true;
  } catch {
    playbackStatus.hidden = false;
    playbackStatus.textContent = 'Redarea nu a pornit. Încearcă din nou.';
  }
}

function loadNotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(notesKey));
    return Array.isArray(saved) ? saved.filter((note) => Number.isFinite(note?.time) && typeof note.message === 'string') : [];
  } catch {
    return [];
  }
}

function saveNotes() {
  try {
    localStorage.setItem(notesKey, JSON.stringify(notes));
    return true;
  } catch {
    status.setAttribute('data-error', '');
    status.textContent = 'Browserul nu a putut salva notele. Descarcă-le înainte să închizi pagina.';
    return false;
  }
}

function chapterAt(time) {
  return chapterList.findLast((chapter) => chapter.time <= time + 0.05)?.title;
}

function renderNotes() {
  notesList.replaceChildren();
  for (const note of [...notes].sort((a, b) => a.time - b.time)) {
    const item = document.createElement('li');
    const seekButton = document.createElement('button');
    seekButton.type = 'button';
    seekButton.className = 'note-seek';
    seekButton.title = 'Derulează filmul la acest moment';
    const stamp = document.createElement('span');
    stamp.textContent = clock(note.time, true);
    const text = document.createElement('span');
    text.textContent = note.message;
    seekButton.append(stamp, text);
    seekButton.addEventListener('click', () => jumpTo(note.time));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'note-delete';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `Șterge observația de la ${clock(note.time, true)}`);
    remove.addEventListener('click', () => {
      notes = notes.filter((candidate) => candidate.id !== note.id);
      saveNotes();
      renderNotes();
    });
    item.append(seekButton, remove);
    notesList.append(item);
  }
  notesEmpty.hidden = notes.length > 0;
  downloadButton.disabled = clearButton.disabled = notes.length === 0;
}

function flagMoment() {
  if (flag.disabled) return;
  audio.pause();
  markedTime = currentTime();
  dialogTime.textContent = clock(markedTime, true);
  status.removeAttribute('data-error');
  status.textContent = '';
  form.reset();
  const open = () => {
    if (!dialog.open) dialog.showModal();
    form.elements.message.focus();
  };
  if (document.fullscreenElement === screen) document.exitFullscreen().then(open, open);
  else open();
}

function notesPrompt() {
  const lines = [...notes].sort((a, b) => a.time - b.time).map((note, index) => {
    const chapter = chapterAt(note.time);
    return `${index + 1}. [${clock(note.time, true)}${chapter ? ` · ${chapter}` : ''}] ${note.message}`;
  });
  return `Ești asistentul de producție al animației „${episodeTitle}” din seria Viața Părintelui Cleopa (Școala Evlaviei).
Mai jos sunt observațiile mele la film, fiecare cu momentul (minut:secundă.zecimi) și capitolul în care apare.
Pentru fiecare observație: identifică planul, personajul sau obiectul vizat, găsește cauza în sursele din repo (episodes/, lib/engine/, assets/) și propune sau aplică corecția. Păstrează continuitatea cu planurile vecine și grupează observațiile care au aceeași cauză.

Observații:
${lines.join('\n')}
`;
}

function downloadNotes() {
  const url = URL.createObjectURL(new Blob([notesPrompt()], { type: 'text/markdown;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: `observatii-${notesFilename}.md` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const message = form.elements.message.value.trim();
  if (!message) return;
  notes.push({ id: crypto.randomUUID(), time: Math.round(markedTime * 100) / 100, message, createdAt: new Date().toISOString() });
  if (saveNotes()) status.textContent = 'Observația a fost salvată.';
  renderNotes();
  dialog.close();
});
document.querySelector('#note-cancel').addEventListener('click', () => dialog.close());
downloadButton.addEventListener('click', downloadNotes);
clearButton.addEventListener('click', () => {
  if (!confirm('Ștergi toate observațiile?')) return;
  notes = [];
  saveNotes();
  renderNotes();
});
renderNotes();

function toggleFull() {
  if (document.fullscreenElement === screen) return document.exitFullscreen();
  return screen.requestFullscreen?.();
}

audio.addEventListener('timeupdate', updateTime);
audio.addEventListener('loadedmetadata', updateDuration);
audio.addEventListener('error', () => {
  updateDuration();
  playbackStatus.textContent = 'Pista audio nu s-a încărcat. Reîncarcă pagina.';
  playbackStatus.hidden = false;
});
audio.addEventListener('seeking', renderFilm);
audio.addEventListener('seeked', renderFilm);
audio.addEventListener('play', () => {
  updatePlay();
  animate();
});
audio.addEventListener('pause', () => {
  updatePlay();
  cancelAnimationFrame(tick);
  void renderFilm();
});
audio.addEventListener('ended', updatePlay);
play.addEventListener('click', togglePlayback);
canvas.addEventListener('click', () => { if (film) void togglePlayback(); });
seek.addEventListener('input', () => jumpTo(Number(seek.value)));
for (const button of jumpButtons) {
  button.addEventListener('click', () => jumpTo(currentTime() + Number(button.dataset.skip)));
}
flag.addEventListener('click', flagMoment);
sound.addEventListener('click', () => {
  audio.muted = !audio.muted;
  sound.setAttribute('aria-pressed', String(audio.muted));
  sound.setAttribute('aria-label', audio.muted ? 'Pornește sunetul' : 'Oprește sunetul');
});
full.addEventListener('click', () => Promise.resolve(toggleFull()).catch(() => {}));
document.addEventListener('keydown', (event) => {
  if (dialog.open || event.target.matches('input, textarea, button, a, summary, [contenteditable]') || event.metaKey || event.ctrlKey || event.altKey) return;
  switch (event.key.toLowerCase()) {
    case ' ': togglePlayback(); break;
    case 'arrowleft': jumpTo(currentTime() - (event.shiftKey ? 5 : 0.5)); break;
    case 'arrowright': jumpTo(currentTime() + (event.shiftKey ? 5 : 0.5)); break;
    case 'r': flagMoment(); break;
    case 'f': full.click(); break;
    default: return;
  }
  event.preventDefault();
});
controls.hidden = false;
updateDuration();

function showChapters(timeline) {
  chapterList = timeline.beats.map(({ id, title, start }) => ({
    title: title ?? id,
    time: (start - 1) / timeline.fps,
  }));
  const chapters = document.querySelector('#chapters');
  for (const { time, title } of chapterList) {
    const button = document.createElement('button');
    button.type = 'button';
    const timestamp = document.createElement('span');
    timestamp.textContent = clock(time);
    button.append(timestamp, title);
    button.addEventListener('click', () => jumpTo(time));
    chapters.append(button);
  }
}

async function setupFilm() {
  const response = await fetch('/catalog.json');
  if (!response.ok) throw new Error('Catalog indisponibil');
  const { defaultEpisode, episodes, library } = await response.json();
  const requested = new URLSearchParams(location.search).get('ep');
  const selected = episodes.find(({ id }) => id === requested) ?? episodes.find(({ id }) => id === defaultEpisode);
  const picker = document.querySelector('#episode-select');
  picker.replaceChildren(...episodes.map(({ id, title }) => new Option(title, id)));
  picker.value = selected.id;
  picker.addEventListener('change', () => picker.form.submit());
  picker.form.hidden = false;
  renderLibrary(library);

  episodeTitle = selected.title;
  title.textContent = episodeTitle;
  document.title = `${episodeTitle} · Școala Evlaviei`;
  canvas.setAttribute('aria-label', `${episodeTitle}, randare Three.js`);
  description.textContent = selected.summary ?? '';
  description.hidden = !selected.summary;

  // Episodul 1 păstrează cheia folosită înainte de mutarea playerului pe pagina principală.
  const isBreadEpisode = selected.id === '001-painea-care-poate-sa-astepte';
  notesFilename = isBreadEpisode ? 'painea-care-poate-sa-astepte' : selected.id;
  notesKey = `cleopa-observatii-v1:${notesFilename}`;
  notes = loadNotes();
  renderNotes();
  if (isBreadEpisode) {
    document.querySelector('#episode-stage').classList.add('bread-poster');
    document.querySelector('#yard-link').hidden = false;
    document.querySelector('#cadru-2').hidden = false;
    await import('./yard-editor.js');
  }

  const base = `/episodes/${selected.id}/`;
  film = await createFilm(canvas, base + 'episode.json');
  episodeDuration = film.info.end / film.info.fps;
  showChapters(film.stage.timeline);
  function redraw() {
    const { width, height } = canvas.getBoundingClientRect();
    film.fit(width, height, Math.min(devicePixelRatio || 1, 2));
    void renderFilm();
  }
  redraw();
  new ResizeObserver(redraw).observe(canvas);
  playbackStatus.hidden = true;
  audio.src = base + film.stage.episode.audio.mix;
  updateDuration();
}

setupFilm().catch((error) => {
  playbackStatus.textContent = 'Episodul nu s-a încărcat. Verifică dacă browserul acceptă WebGL 2 și reîncarcă pagina.';
  playbackStatus.hidden = false;
  console.error(error);
});
