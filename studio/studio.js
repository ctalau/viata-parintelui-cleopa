const video = document.querySelector('#episode');
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
const episode = 'painea-care-poate-sa-astepte';
const episodeDuration = 2090 / 24;
let markedTime = null;

function clock(time, decimal = false) {
  const seconds = Math.floor(time);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return decimal ? `${clock}.${Math.floor((time - seconds) * 10 + 1e-7) % 10}` : clock;
}

function currentTime() {
  return Math.min(video.currentTime, episodeDuration);
}

function updateTime() {
  const time = currentTime();
  seek.value = time;
  seek.setAttribute('aria-valuetext', clock(time, true));
  playbackTime.textContent = `${clock(time, true)} / ${clock(episodeDuration, true)}`;
  if (markedTime === null) timeLabel.textContent = clock(time, true);
}

function updatePlay() {
  play.setAttribute('aria-label', video.paused ? 'Redă filmul' : 'Pauză');
  play.firstElementChild.textContent = video.paused ? '▶' : '❚❚';
}

function jumpTo(time) {
  if (video.readyState === 0) return;
  video.currentTime = Math.max(0, Math.min(episodeDuration, time));
  updateTime();
}

async function togglePlayback() {
  if (!video.paused) {
    video.pause();
    return;
  }
  try {
    await video.play();
    playbackStatus.hidden = true;
  } catch {
    playbackStatus.hidden = false;
    playbackStatus.textContent = 'Filmul nu s-a putut porni. Folosește linkul de descărcare.';
  }
}

function markTime() {
  video.pause();
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
  if (screen.requestFullscreen) return screen.requestFullscreen();
  video.webkitEnterFullscreen?.();
}

video.addEventListener('timeupdate', updateTime);
video.addEventListener('loadedmetadata', () => {
  seek.max = episodeDuration;
  seek.disabled = false;
  for (const button of jumpButtons) button.disabled = false;
  updateTime();
});
video.addEventListener('play', updatePlay);
video.addEventListener('pause', updatePlay);
video.addEventListener('ended', updatePlay);
play.addEventListener('click', togglePlayback);
video.addEventListener('click', togglePlayback);
seek.addEventListener('input', () => jumpTo(Number(seek.value)));
for (const button of jumpButtons) {
  button.addEventListener('click', () => jumpTo(currentTime() + Number(button.dataset.skip)));
}
flag.addEventListener('click', flagMoment);
capture.addEventListener('click', markTime);
sound.addEventListener('click', () => {
  video.muted = !video.muted;
  sound.setAttribute('aria-pressed', String(video.muted));
  sound.setAttribute('aria-label', video.muted ? 'Pornește sunetul' : 'Oprește sunetul');
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
video.controls = false;
seek.disabled = video.readyState === 0;
seek.max = video.readyState === 0 ? 0 : episodeDuration;
for (const button of jumpButtons) button.disabled = seek.disabled;
controls.hidden = false;
updateTime();

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
  const { chapters, library } = await response.json();
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
