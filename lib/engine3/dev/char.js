// Character turntable / clip strips for the blender style (tools/char.mjs drives it): one image made of tiles,
// each tile = { look, clip, t, view (yaw degrees of the camera around the figure), shot: full|bust|face|hands, label }.
import * as THREE from 'three';
import { loadCharacterAsset, loadGLB, loadPortraitHeads } from '../assets.js';
import { Character } from '../character.js';
import { setupLook } from '../look-fallback.js';
import { clipLayers } from '../anim.js';

const out = document.getElementById('out');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 200);
const scene = new THREE.Scene();
const look = setupLook({ THREE, renderer, scene, camera, sky: new URLSearchParams(location.search).get('sky') || 'studio', quality: 'final' });
const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const asset = await loadCharacterAsset('monk');
asset.yarn = await loadGLB('assets/characters/yarn-elder.glb');
asset.yarnSoft = await loadGLB('assets/characters/yarn-elder-soft.glb');
const chars = new Map();
function charFor(lk) {
  const k = JSON.stringify(lk);
  if (!chars.has(k)) { const c = new Character(asset, lk); chars.set(k, c); }
  return chars.get(k);
}
const SHOTS = { full: { y: 2.2, h: 5.2 }, bust: { y: 3.0, h: 2.6 }, hood: { y: 3.35, h: 3.0 }, face: { y: 3.42, h: 1.35 }, hands: { y: 2.6, h: 2.2 }, low: { y: 1.0, h: 2.2 }, fingers: { y: 2, h: 0.75 }, wide: { y: 2.2, h: 7.5 } };
window.__char = {
  clips: Object.fromEntries(Object.entries(asset.clips).map(([k, c]) => [k, { duration: c.duration, meta: c.meta }])),
  async sheet(tiles, cols, tw, th) {
    await loadPortraitHeads(asset, tiles.flatMap((tile) => tile.actors?.map((actor) => actor.look) || [tile.look]));
    const rows = Math.ceil(tiles.length / cols);
    out.width = cols * tw; out.height = rows * th + 0;
    const g = out.getContext('2d');
    renderer.setSize(tw, th, false); camera.aspect = tw / th; camera.updateProjectionMatrix();
    tiles.forEach((T, i) => {
      for (const c of chars.values()) scene.remove(c.root);
      const items = T.actors || [{ look: T.look, clip: T.clip, t: T.t, pos: [0, 0], face: 0, expr: T.expr, mouth: T.mouth, blink: T.blink }];
      for (const a of items) {
        const c = charFor(a.look || {});
        scene.add(c.root);
        c.root.position.set(a.pos?.[0] || 0, 0, a.pos?.[1] || 0); c.root.rotation.y = (a.face || 0) * Math.PI / 180;
        const layers = a.clip ? clipLayers(asset, a.clip, a.t || 0) : [];
        c.pose(layers, { face: { expr: a.expr || 'neutral', blink: a.blink || 0, mouth: a.mouth || 0, talk: (a.mouth || 0) > 0 }, lookAt: a.lookAt ? new THREE.Vector3(...a.lookAt) : null });
      }
      const S = T.frame ? { y: T.frame[0], h: T.frame[1] } : SHOTS[T.shot || 'full'];   // frame: [centre y, height] for any close-up
      const yaw = (T.view || 0) * Math.PI / 180, pitch = (T.pitch ?? 6) * Math.PI / 180;
      const dist = S.h / 2 / Math.tan(camera.fov * Math.PI / 360) * 1.05;
      const tgt = new THREE.Vector3(T.cx || 0, T.cy ?? S.y, T.cz || 0);
      if (T.shot === 'fingers') { const c0 = charFor(items[0].look || {}); c0.root.updateMatrixWorld(true); c0.sockets['hand.R'].getWorldPosition(tgt); }
      camera.position.set(tgt.x + Math.sin(yaw) * Math.cos(pitch) * dist, tgt.y + Math.sin(pitch) * dist, tgt.z + Math.cos(yaw) * Math.cos(pitch) * dist);
      camera.lookAt(tgt);
      look.render(0);
      const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
      g.drawImage(renderer.domElement, x, y);
      if (T.label) { g.font = '600 15px sans-serif'; g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x, y, tw, 20); g.fillStyle = '#fff'; g.fillText(T.label, x + 4, y + 15); }
    });
    return out.toDataURL('image/jpeg', 0.9);
  },
};
window.__ready = true;
