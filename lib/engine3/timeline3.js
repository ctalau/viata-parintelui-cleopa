// Timeline of a "style": "blender" film: the SAME compiler as every other film (lib/engine/timeline.js), with this
// style's timings (gesture lengths = clip lengths, slower toy walk, longer sit / give / put) and the anchors of the
// GLB sets (assets/sets/<name>.json). Pure: runs in Node (validate, record, voice) and in the browser.
import { compile, GESTURES, clamp01 } from '../engine/timeline.js';
import { careClips } from './care.js';
import { getLayout } from '../components/layouts.js';

// film vocabulary -> clip (a `_beard` variant is picked for long beards, `_L` for the left hand)
export const GESTURE_CLIPS = {
  ...careClips,
  wave: 'wave', nod: 'nod', shake: 'shake', bow: 'bow', metanie: 'bow_deep', bowDeep: 'bow_deep', 'bow-deep': 'bow_deep',
  cross: 'cross', pray: 'pray', bless: 'bless', offer: 'offer', invite: 'offer', point: 'point', think: 'think', shrug: 'shrug',
  look: 'look', knock: 'knock', hug: 'hug', laugh: 'laugh', bounce: 'joy', jump: 'joy', joy: 'joy', clap: 'joy', sad: 'sad', ashamed: 'ashamed', surprised: 'surprised',
  clapOnce: 'clap_once', weave: 'weave_rim', foldCloth: 'fold_cloth',
  show: 'carry', lift: 'carry', listen: 'listen', talk: 'talk1', talk1: 'talk1', talk2: 'talk2', talk3: 'talk3', talk4: 'talk4', me: 'talk4',
  reap: 'reap', knead: 'knead', knead2: 'knead2', draw1: 'draw1', draw2: 'draw2', draw3: 'draw3', give: 'give', take: 'take', receive: 'take', put: 'put_down', putDown: 'put_down', pick: 'pick_up', pickUp: 'pick_up', drop: 'drop',
};
export const BLENDER_TIMING = { walkSpeed: 1.7, turnTime: 0.6, turnRate: 1.7, giveTime: 1.7, postureTime: 1.7, hugDistance: 1.55, hugOffset: 0, putTime: 1.9 };
// Blender keeps dots in mesh instance names, while the matching collision nodes omit them.
export function dressingOffset(offsets, name) {
  return offsets?.[name.replace(/^col:/, '').replaceAll('.', '')];
}

/** fraction (0..1) of a walk of D seconds done at u (0..1): speed up over ~0.4 s, a steady pace, slow down over ~0.4 s.
 *  (A smoothstep over the whole walk would change the pace all the time: 1.5× the mean speed in the middle, a run that
 *  looks hectic, and a cadence that never settles.) */
export function walkEase(u, D) {
  u = clamp01(u);
  const a = Math.min(0.42, Math.max(1e-3, D / 3)) / Math.max(1e-6, D), v = 1 / (1 - a);
  // the speed rises / falls along a smoothstep (no jolt when it starts or stops)
  const ramp = (x) => v * a * (x * x * x - 0.5 * x * x * x * x); // ∫ smoothstep over the ramp, x = 0..1 of the ramp
  if (u < a) return ramp(u / a);
  if (u > 1 - a) return 1 - ramp((1 - u) / a);
  return ramp(1) + v * (u - a);
}
export const SEAT_BACK = 0.5; // a seated figure's root (its feet) is 0.5 in front of the seat centre

/** gesture durations from the clips (monk.json); unknown words keep the old engine's lengths (with a warning there) */
export function gestureDurations(charMeta) {
  const out = { ...GESTURES };
  const clips = charMeta?.clips || {};
  for (const [w, c] of Object.entries(GESTURE_CLIPS)) if (clips[c]) out[w] = clips[c].duration;
  return out;
}

/** a set's metadata (assets/sets/<name>.json) -> the layout object the compiler understands */
export function layoutFromMeta(meta, name) {
  const anchors = {};
  const deg = (d) => ((d || 0) * Math.PI) / 180;
  for (const [k, a] of Object.entries(meta.anchors || {})) anchors[k] = { pos: [a.pos[0], a.pos[2]], h: deg(a.face), y: a.pos[1] };
  const seats = {};
  for (const [k, a] of Object.entries(meta.seats || {})) {
    const h = deg(a.face);
    seats[k] = { pos: [a.pos[0], a.pos[2]], h, y: a.pos[1] };
    // "seat:<name>" = where the sitter's FEET are (the root of a seated figure), facing like the seat
    anchors[`seat:${k}`] = { pos: [a.pos[0] + Math.sin(h) * SEAT_BACK, a.pos[2] + Math.cos(h) * SEAT_BACK], h, y: a.pos[1], seat: k };
  }
  if (!anchors.center) anchors.center = { pos: [0, 0], h: 0 };
  return { name, anchors, seats, cells: [], twoD: false, blender: true, bounds: meta.bounds || null };
}

const setName = (scene) => (typeof scene.set === 'string' ? scene.set : scene.set?.type || scene.set?.name);

/** names of the GLB sets a film uses (those that have a json in `metas`) */
export function setNames(desc) { return [...new Set((desc.scenes || []).map(setName).filter(Boolean))]; }

export function compile3(desc, manifest = {}, { setMetas = {}, charMeta = null } = {}) {
  const layoutOf = (scene) => {
    const n = setName(scene) || 'desert-lavra';
    if (setMetas[n]) return layoutFromMeta(setMetas[n], n);
    const L = getLayout(scene.set || 'desert-lavra'); // the procedural sets still work in this style
    return L;
  };
  const tl = compile(desc, manifest, { ...BLENDER_TIMING, joinWalks: true, walkEase, gestures: gestureDurations(charMeta), layoutOf });
  tl.style = 'blender';
  return tl;
}
