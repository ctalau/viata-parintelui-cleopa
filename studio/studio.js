import './yard-editor.js';
import { createFilm } from './film/player.js';

const audio = document.querySelector('#episode');
const canvas = document.querySelector('#episode-picture');
const form = document.querySelector('#feedback-form');
const timeLabel = document.querySelector('#timestamp');
const status = document.querySelector('#feedback-status');
const capture = document.querySelector('#capture');
const submit = form.querySelector('[type="submit"]');
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
const episode = 'painea-care-poate-sa-astepte';
let episodeDuration;
let markedTime = null;
let film;
let tick;

async function renderFilm() {
  if (!film) return;
  try {
    await film.draw(currentTime());
  } catch (error) {
    audio.pause();
    playbackStatus.textContent = 'Nu s-a putut încărca planul. Poți descărca filmul MP4.';
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
  if (markedTime === null) timeLabel.textContent = clock(time, true);
}

function updateDuration() {
  const seconds = Math.round(duration());
  episodeLength.textContent = seconds ? `${Math.floor(seconds / 60)} min ${seconds % 60} s` : '';
  seek.disabled = !film || audio.readyState === 0;
  play.disabled = !film || audio.readyState === 0;
  seek.max = seek.disabled ? 0 : duration();
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
  if (!audio.paused) {
    audio.pause();
    return;
  }
  try {
    await audio.play();
    playbackStatus.hidden = true;
  } catch {
    playbackStatus.hidden = false;
    playbackStatus.textContent = 'Filmul nu s-a putut porni. Folosește linkul de descărcare.';
  }
}

function markTime() {
  audio.pause();
  markedTime = currentTime();
  timeLabel.textContent = clock(markedTime, true);
  status.removeAttribute('data-error');
  status.textContent = `Moment ales la ${clock(markedTime, true)}.`;
}

async function flagMoment() {
  if (document.fullscreenElement === screen) await document.exitFullscreen();
  markTime();
  form.elements.message.focus();
}

function toggleFull() {
  if (document.fullscreenElement === screen) return document.exitFullscreen();
  return screen.requestFullscreen?.();
}

audio.addEventListener('timeupdate', updateTime);
audio.addEventListener('loadedmetadata', updateDuration);
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
capture.addEventListener('click', markTime);
sound.addEventListener('click', () => {
  audio.muted = !audio.muted;
  sound.setAttribute('aria-pressed', String(audio.muted));
  sound.setAttribute('aria-label', audio.muted ? 'Pornește sunetul' : 'Oprește sunetul');
});
full.addEventListener('click', () => Promise.resolve(toggleFull()).catch(() => {}));
document.addEventListener('keydown', (event) => {
  if (event.target.matches('input, textarea, button, a, summary, [contenteditable]') || event.metaKey || event.ctrlKey || event.altKey) return;
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

async function setupFilm() {
  try {
    film = await createFilm(canvas);
    const preview = new ResizeObserver(() => {
      const { width, height } = canvas.getBoundingClientRect();
      film.fit(width, height, Math.min(devicePixelRatio || 1, 2));
      void renderFilm();
    });
    if (new URLSearchParams(location.search).has('export')) {
      window.captureEpisode = {
        fps: film.info.fps, end: film.info.end,
        async png(frame, width, height) {
          film.fit(width, height);
          await film.draw((frame-1)/film.info.fps);
          return canvas.toDataURL('image/png');
        },
      };
    } else {
      preview.observe(canvas);
      await renderFilm();
    }
    updateDuration();
  } catch (error) {
    playbackStatus.textContent = 'Randarea Three.js nu este disponibilă. Poți descărca filmul MP4.';
    playbackStatus.hidden = false;
    console.error(error);
  }
}

void setupFilm();

async function submitFeedback(event) {
  event.preventDefault();
  if (submit.disabled) return;
  const data = new FormData(form);
  status.removeAttribute('data-error');
  status.textContent = 'Se trimite…';
  submit.disabled = true;
  capture.disabled = true;
  form.elements.message.readOnly = true;
  try {
    const response = await fetch('/api/feedback', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episode, time: markedTime ?? currentTime(), ...Object.fromEntries(data) }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    form.reset();
    markedTime = null;
    status.textContent = 'Mulțumim! Observația a fost salvată.';
    updateTime();
  } catch (error) {
    status.setAttribute('data-error', '');
    status.textContent = error.message || 'Încearcă din nou.';
  } finally {
    submit.disabled = false;
    capture.disabled = false;
    form.elements.message.readOnly = false;
  }
}
form.addEventListener('submit', submitFeedback);

try {
  const response = await fetch('/catalog.json');
  if (!response.ok) throw new Error('Catalog indisponibil');
  const { episode: listedEpisode, chapters, library } = await response.json();
  episodeDuration = listedEpisode.duration;
  updateDuration();
  for (const { time, title } of chapters) {
    const button = document.createElement('button');
    button.type = 'button';
    const timestamp = document.createElement('span');
    timestamp.textContent = clock(time);
    button.append(timestamp, title);
    button.addEventListener('click', () => jumpTo(time));
    document.querySelector('#chapters').append(button);
  }
  for (const { group, entries } of library) {
    const article = document.createElement('article');
    const heading = document.createElement('h3');
    heading.textContent = group;
    const list = document.createElement('ul');
    for (const { name, link } of entries) {
      const item = document.createElement('li');
      const anchor = document.createElement('a');
      anchor.href = link;
      anchor.textContent = name;
      item.append(anchor);
      list.append(item);
    }
    article.append(heading, list);
    document.querySelector('#library-items').append(article);
  }
} catch {
  document.querySelector('#chapters').textContent = 'Momentele nu s-au încărcat.';
  document.querySelector('#library-items').textContent = 'Biblioteca nu s-a încărcat.';
}
