// Player generic pentru orice episod descris în episodes/<id>/episode.json: /motor/?ep=<id>
import { createFilm } from '../film/engine.js';

const params = new URLSearchParams(location.search);
const id = params.get('ep') ?? '002-semnul-crucii';
const base = `/episodes/${id}/`;
const $ = (s) => document.querySelector(s);
const canvas = $('#picture'), audio = $('#sound'), seek = $('#seek'), play = $('#play');
const clock = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

const film = await createFilm(canvas, base + 'episode.json');
const { episode, timeline } = film.stage;
document.title = `${episode.title} · Școala Evlaviei`;
$('#title').textContent = episode.title;
$('#info').textContent = episode.note ?? $('#info').textContent;
audio.src = base + episode.audio.mix;
$('#download').href = base + 'film.mp4';
$('#descriptor').href = base + 'episode.json';
const duration = episode.frames / episode.fps;
seek.max = String(duration);
for (const beat of timeline.beats) {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = '#'; a.textContent = `${clock((beat.start - 1) / episode.fps)} · ${beat.title ?? beat.id}`;
  a.onclick = (e) => { e.preventDefault(); jump((beat.start - 1) / episode.fps); };
  li.append(a); $('#chapters').append(li);
}
const time = () => Math.min(audio.currentTime || 0, duration);
async function draw() {
  const { width, height } = canvas.getBoundingClientRect();
  film.fit(width, height, Math.min(devicePixelRatio || 1, 2));
  await film.draw(time());
  seek.value = String(time());
  $('#clock').textContent = `${clock(time())} / ${clock(duration)}`;
}
function loop() { void draw(); if (!audio.paused) requestAnimationFrame(loop); }
function jump(t) { audio.currentTime = Math.max(0, Math.min(duration, t)); void draw(); }
play.onclick = async () => { if (audio.paused) { await audio.play(); play.textContent = 'Pauză'; loop(); } else { audio.pause(); play.textContent = 'Redă'; } };
seek.oninput = () => jump(Number(seek.value));
audio.onended = () => { play.textContent = 'Redă'; };
$('#full').onclick = () => $('#stage').requestFullscreen?.();
new ResizeObserver(() => void draw()).observe(canvas);
window.motor = film;
await draw();
