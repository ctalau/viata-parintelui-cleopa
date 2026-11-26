const video = document.querySelector('#episode');
const form = document.querySelector('#feedback-form');
const timeLabel = document.querySelector('#timestamp');
const status = document.querySelector('#feedback-status');
const capture = document.querySelector('#capture');
const submit = form.querySelector('[type="submit"]');
const episode = 'painea-care-poate-sa-astepte';
let markedTime = null;

function clock(time) {
  const seconds = Math.floor(time);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function currentTime() {
  return Math.min(video.currentTime, 2090 / 24);
}

video.addEventListener('timeupdate', () => {
  if (markedTime === null) timeLabel.textContent = clock(currentTime());
});
capture.addEventListener('click', () => {
  video.pause();
  markedTime = currentTime();
  timeLabel.textContent = clock(markedTime);
  status.removeAttribute('data-error');
  status.textContent = `Moment ales la ${clock(markedTime)}.`;
});

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
    timeLabel.textContent = clock(currentTime());
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
    button.addEventListener('click', () => { video.currentTime = time; });
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
