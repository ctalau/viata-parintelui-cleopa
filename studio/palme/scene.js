// One frame of one approach: body, left arm at rest (mirrored), right arm and hand.
import { drawBody, paintArm, paintSkeleton } from './body.js';
import { paintGroups } from './draw.js';
import { buildMesh, buildSubstitution, createSubstitution, createVolume, projectRig } from './hands.js';
import { BODY, FPS, TESTS, add, camera, duration, poseAt, quatRotate, solve } from './rig.js';

export const APPROACHES = [
  { id: 'substitutie', letter: 'A', title: 'Substituție de desene' },
  { id: 'plasa', letter: 'B', title: 'Plasă 2D pe oase proiectate' },
  { id: 'volum', letter: 'C', title: 'Volume proiectate, desenate plat' },
];

// "Toate" plays the tests one after another.
export const ALL = { id: 'toate', title: 'Toate testele' };
export function timelineOf(id) {
  const tests = id === ALL.id ? TESTS : TESTS.filter((t) => t.id === id);
  let start = 0;
  const parts = tests.map((test) => {
    const frames = Math.round(duration(test) * FPS) + 1;
    const part = { test, start, frames };
    start += frames;
    return part;
  });
  return { parts, frames: start };
}
export function locate(timeline, frame) {
  const part = timeline.parts.find((p) => frame < p.start + p.frames) ?? timeline.parts.at(-1);
  return { test: part.test, time: (frame - part.start) / FPS, local: frame - part.start };
}

export function builder(approach) {
  if (approach === 'volum') {
    const right = createVolume(), left = createVolume();
    return { build: (h, side = 'right') => (side === 'left' ? left : right).build(h), reset() { right.reset(); left.reset(); } };
  }
  if (approach === 'plasa') return { build: (h) => buildMesh(h), reset() {} };
  const right = createSubstitution(), left = createSubstitution();
  return {
    build: (h, side = 'right') => buildSubstitution(h, side === 'left' ? left : right),
    reset() { right.reset(); left.reset(); },
  };
}

export function frameRig(test, time) {
  const pose = poseAt(test, time);
  return { pose, rig: solve(pose) };
}

// A camera that follows the hand, for close-ups and for the silhouette masks.
export function handCamera(rig, yaw, size, half = 9) {
  const centre = add(rig.W, quatRotate(rig.q, [0, 6, 0]));
  const c = Math.cos(yaw * Math.PI / 180), s = Math.sin(yaw * Math.PI / 180);
  return camera({ yaw, cx: centre[0] * c + centre[2] * s, cy: centre[1], half, width: size[0], height: size[1] });
}

const restRig = (() => {
  let cached;
  return () => (cached ??= solve(poseAt(TESTS[0], 0)));
})();

export function renderFrame(ctx, { approach, build, test, time, yaw = 0, closeUp = false, skeleton = false, width, height }) {
  const { pose, rig } = frameRig(test, time);
  const camYaw = yaw + pose.cam;
  const cam = closeUp ? handCamera(rig, camYaw, [width, height], 15) : camera({ yaw: camYaw, width, height, half: 47, cy: 121 });
  ctx.clearRect(0, 0, width, height);
  const lw = Math.max(1.4, 0.32 * cam.k);
  // Left arm: the right arm's rest pose seen from the opposite angle, then mirrored.
  const mirrorCam = camera({ yaw: -camYaw, width, height, half: 47, cy: 121 });
  const axis = cam.width / 2 - cam.cx * cam.k;
  const drawLeft = () => {
    const hl = projectRig(restRig(), mirrorCam);
    const hand = build(hl, 'left');
    ctx.save(); ctx.translate(2 * axis, 0); ctx.scale(-1, 1);
    paintArm(ctx, hl, hand, lw);
    ctx.restore();
  };
  const h = projectRig(rig, cam);
  const hand = build(h, 'right');
  const behindBody = h.W[2] < -3 && h.E[2] < -3;
  if (!closeUp) drawLeft();
  if (behindBody) paintArm(ctx, h, hand, lw);
  drawBody(ctx, cam);
  if (!behindBody) paintArm(ctx, h, hand, lw);
  if (skeleton) paintSkeleton(ctx, h);
  return { h, hand, cam, rig };
}

// Hand only, filled black, for silhouette comparisons.
export function renderMask(ctx, hand, size) {
  ctx.clearRect(0, 0, size[0], size[1]);
  paintGroups(ctx, hand.groups, hand.lw, { mask: true });
}

export { BODY };
