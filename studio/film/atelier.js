import { createFilm } from './player.js';

export async function mountShotViewer() {
  const canvas = document.querySelector('#film-plan');
  const select = document.querySelector('#film-cut');
  const slider = document.querySelector('#film-frame');
  const play = document.querySelector('#film-play');
  const status = document.querySelector('#film-load');
  const readout = document.querySelector('#film-readout');
  const stage = canvas.parentElement;
  try {
    const film = await createFilm(canvas);
    for (const shot of film.info.shots) select.add(new Option(shot.name, shot.id));
    select.value = 'plan-09';
    let shot;
    let timer;
    let revision = 0;

    async function draw() {
      const latest = ++revision;
      try {
        const frame = await film.draw((Number(slider.value)-1)/film.info.fps);
        if (latest !== revision || frame === undefined) return;
        canvas.hidden = false;
        readout.textContent = `Cadru ${frame}`;
        status.hidden = true;
      } catch {
        status.textContent = 'Planul nu s-a încărcat. Încearcă să îl selectezi din nou.';
        status.hidden = false;
        stop();
      }
    }

    function stop() {
      cancelAnimationFrame(timer);
      timer = undefined;
      play.textContent = 'Redă planul';
    }

    // A chosen shot plays at once and starts over at its last drawing.
    function loop() {
      stop();
      const start = performance.now();
      const first = Number(slider.min);
      const span = Number(slider.max)-first+film.info.step;
      const offset = Number(slider.value)-first;
      play.textContent = 'Pauză';
      function update(now) {
        const drawn = Math.floor((now-start)/1000*film.info.fps/film.info.step)*film.info.step;
        const next = first+(offset+drawn) % span;
        if (next !== Number(slider.value)) {
          slider.value = next;
          void draw();
        }
        timer = requestAnimationFrame(update);
      }
      timer = requestAnimationFrame(update);
    }

    function changeShot() {
      stop();
      shot = film.info.shots.find((item) => item.id === select.value);
      slider.min = shot.frame;
      slider.max = shot.end - film.info.step;
      slider.step = film.info.step;
      slider.value = shot.frame;
      status.textContent = 'Se încarcă planul…';
      status.hidden = false;
      void draw().then(loop);
    }

    select.addEventListener('change', changeShot);
    slider.addEventListener('input', () => {
      stop();
      void draw();
    });
    play.addEventListener('click', () => (timer !== undefined ? stop() : loop()));
    new ResizeObserver(() => {
      const { width, height } = stage.getBoundingClientRect();
      film.fit(width, height, Math.min(devicePixelRatio || 1, 2));
      void draw();
    }).observe(stage);
    changeShot();
  } catch (error) {
    status.textContent = 'Randarea Three.js are nevoie de WebGL 2.';
    console.error(error);
  }
}
