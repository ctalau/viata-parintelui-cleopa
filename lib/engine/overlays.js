// Titluri, bule și sigla: planuri cu texturi desenate pe canvas, atașate camerei, deci prezente
// identic în player, în capturi și în exportul MP4. Pozițiile sunt în unitățile camerei
// (ca în build_episode.titles: placheta la (-3.52, 2.65) față de centrul planului).
import * as THREE from 'three';
import { linear } from './tracks.js';

const COCOA = '#593a2e';

function canvasPlane(width, height, draw, scale = 200) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
  mesh.renderOrder = 10;
  mesh.frustumCulled = false;
  return mesh;
}

function rounded(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

function diamond(ctx, x, y, rx, ry, color) {
  ctx.beginPath(); ctx.moveTo(x, y - ry); ctx.lineTo(x + rx, y); ctx.lineTo(x, y + ry); ctx.lineTo(x - rx, y); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
}

function titlePlate(spec) {
  return canvasPlane(7.6, 2.5, (ctx, W, H) => {
    const cx = W / 2, cy = H / 2;
    ctx.translate(cx, cy);
    rounded(ctx, -3.65 + 0.07, -1.10 + 0.075, 7.30, 2.20, 0.31); ctx.fillStyle = '#a68964'; ctx.fill();
    rounded(ctx, -3.65, -1.09, 7.30, 2.18, 0.31); ctx.fillStyle = '#f4d9a6'; ctx.fill();
    ctx.lineWidth = 0.035; ctx.strokeStyle = '#8a6047'; ctx.stroke();
    rounded(ctx, -3.54, -0.99, 7.08, 1.98, 0.23); ctx.fillStyle = '#f7dfb0'; ctx.fill();
    ctx.lineWidth = 0.025; ctx.strokeStyle = '#d9a96e'; ctx.stroke();
    for (const x of [-3.17, 3.17]) { diamond(ctx, x, -0.07, 0.105, 0.143, '#ac6c48'); diamond(ctx, x, -0.07, 0.046, 0.059, '#f7d293'); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = COCOA; ctx.font = `bold 0.62px "DejaVu Serif", Georgia, serif`;
    ctx.fillText(spec.title, 0, -0.30, 6.3);
    ctx.fillStyle = '#74513d'; ctx.font = `0.33px "DejaVu Sans", Verdana, sans-serif`;
    ctx.fillText(spec.subtitle ?? '', 0, 0.45, 6.3);
  });
}

function bubble(spec) {
  return canvasPlane(2.2, 1.3, (ctx, W, H) => {
    ctx.translate(W / 2, H / 2); ctx.scale(1, -1);
    const path = new Path2D('M -.937 .032 Q -.887 .43 -.188 .41 Q .578 .425 .884 .184 Q 1.104 -.18 .468 -.307 L .688 -.55 L .195 -.357 Q -.540 -.400 -.828 -.195 Q -.959 -.120 -.937 .032 Z');
    ctx.fillStyle = '#f8dfaa'; ctx.fill(path);
    ctx.lineWidth = 0.037; ctx.strokeStyle = '#a56f51'; ctx.stroke(path);
    ctx.scale(1, -1);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#80513d'; ctx.font = `bold 0.30px "DejaVu Serif", Georgia, serif`;
    ctx.fillText(spec.text, -0.025, -0.041);
  });
}

export class Overlays {
  constructor(stage) {
    this.stage = stage;
    this.items = [];
  }

  async load() {
    const { episode, camera } = this.stage;
    if (typeof document === 'undefined') return;
    for (const spec of episode.overlays ?? []) {
      const mesh = spec.kind === 'title' ? titlePlate(spec) : bubble(spec);
      mesh.position.set(0, 0, -5);
      camera.add(mesh);
      this.items.push({ spec, mesh });
    }
    if (episode.logo) {
      const texture = await new THREE.TextureLoader().loadAsync(episode.logo.file).catch(() => null);
      if (texture) {
        texture.colorSpace = THREE.SRGBColorSpace;
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false }));
        mesh.renderOrder = 11;
        mesh.frustumCulled = false;
        this.logo = { mesh, aspect: texture.image.width / texture.image.height };
        camera.add(mesh);
      }
    }
  }

  update(f, shotIndex) {
    const cam = this.stage.camera;
    const width = cam.right - cam.left, height = cam.top - cam.bottom;
    let title = false;
    for (const { spec, mesh } of this.items) {
      const on = shotIndex === spec.shot && f >= spec.from && f < spec.to;
      if (on && spec.kind === 'title') title = true;
      mesh.visible = on;
      if (!on) continue;
      // Pozițiile din Blender sunt relative la camera planului (ortho_scale = lățimea).
      const shot = this.stage.episode.shots[spec.shot];
      const k = width / shot.width;
      if (spec.kind === 'title') {
        const keys = spec.pop.map(([frame, s]) => [frame < 0 ? spec.to + frame : frame, s]);
        const s = linear(keys, f) * k;
        mesh.position.set(spec.at[0] * k, spec.at[1] * k, -5);
        mesh.scale.set(s, s, 1);
      } else {
        const [x, y, s] = linear(spec.keys.map(([frame, ...v]) => [frame, v]), f);
        mesh.position.set(x * k, y * k, -5);
        mesh.scale.set(s * k, s * k, 1);
      }
    }
    if (this.logo) {
      // Sigla stă în colțul din stânga sus; cât timp se vede placheta titlului, ea poartă numele.
      this.logo.mesh.visible = !title;
      const h = height * 0.12, w = h * this.logo.aspect;
      this.logo.mesh.scale.set(w, h, 1);
      this.logo.mesh.position.set(-width / 2 + w / 2 + height * 0.035, height / 2 - h / 2 - height * 0.035, -4);
    }
  }
}
