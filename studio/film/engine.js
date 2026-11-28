// Renderer Three.js pentru playerul principal și inspector.
import { WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Stage } from '../../lib/engine/stage.js';

import { drawingFrame } from '../../lib/engine/tracks.js';

export async function createFilm(canvas, url) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setClearColor('#292929');
  const stage = await new Stage({ loader: new GLTFLoader() }).load(url);
  const info = { fps: stage.fps, end: stage.frames, shots: stage.episode.shots.map((s) => ({ frame: s.at, name: s.name })) };
  let drawn = -1;
  const frameAt = (time) => Math.min(info.end, Math.max(1, Math.floor(time * info.fps + 0.00001) + 1));

  function fit(width, height, pixelRatio = 1) {
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    drawn = -1;
  }

  async function draw(time) {
    const held = drawingFrame(stage.episode, frameAt(time));
    if (held === drawn) return held;
    stage.setTime((held - 1) / info.fps);
    renderer.render(stage.scene, stage.camera);
    drawn = held;
    canvas.dataset.frame = held;
    return held;
  }

  return { info, draw, fit, stage, renderer };
}
