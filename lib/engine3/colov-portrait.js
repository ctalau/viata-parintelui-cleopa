import { clamp01, smooth } from '../engine/timeline.js';

const visemes = {
  a: 'A · deschis', ă: 'A · deschis', e: 'E · întins', i: 'I · îngust',
  î: 'I · îngust', â: 'I · îngust', o: 'O · rotunjit', u: 'U · strâns',
  m: 'M B P · închis', b: 'M B P · închis', p: 'M B P · închis',
};
const A = visemes.a, M = visemes.m;
const blinkR = 'Clipit ochi drept', blinkL = 'Clipit ochi stâng';
const poseElder = { warm:'E2', gentle:'E2', happy:'E2', surprised:'E3', pray:'E4',
  asleep:'E4', sleepy:'E4', thinking:'E5', 'gentle-shrewd':'E6' };
const poseYoung = {
  happy: ['Bucurie', .44, .45], warm: ['Bucurie', .24, .24], gentle: ['Bucurie', .22, .32],
  joy: ['Bucurie', .65, .84], sad: ['Tristețe', .63, .54], ashamed: ['Tristețe', .68, .51],
  surprised: ['Surprindere', .78, .64], thinking: ['Îngrijorare', .52, 0],
};
const tracks = new WeakMap();

function track(speech) {
  let samples = tracks.get(speech);
  if (samples) return samples;
  samples = [];
  let length = 0;
  for (const letter of speech.text.toLowerCase()) {
    const shape = visemes[letter];
    const weight = shape === M ? .73 : shape ? 1.45 : /[,.!?…:]/.test(letter) ? 2.2 : letter === ' ' ? .4 : .82;
    samples.push({ shape, time: length + weight * .5 });
    length += weight;
  }
  const env = speech.env || [];
  const edge = Math.max(.018, .11 * Math.max(0, ...env));
  const first = env.findIndex((v) => v > edge);
  const start = first < 0 ? 0 : first / speech.envFps;
  let end = speech.end - speech.start;
  for (let i = env.length - 1; i > first; i--) {
    if (env[i] > edge) { end = Math.min(end, (i + 1) / speech.envFps); break; }
  }
  for (const point of samples) point.time = start + (point.time / length) * (end - start);
  tracks.set(speech, samples);
  return samples;
}

function articulations(speech, time, level) {
  const weights = { [A]: level * .48 };
  if (!speech) return weights;
  const elapsed = time - speech.start;
  const points = track(speech);
  const width = Math.max(.031, Math.min(.11, (speech.end - speech.start) / points.length));
  let closure = 0;
  for (const p of points) {
    if (!p.shape || Math.abs(elapsed - p.time) > width * 1.25) continue;
    const w = smooth(1 - Math.abs(elapsed - p.time) / (width * 1.25));
    if (p.shape === M) closure = Math.max(closure, w);
    else weights[p.shape] = (weights[p.shape] || 0) + w * level * (p.shape === A ? .42 : .56);
  }
  for (const name of Object.keys(weights)) weights[name] *= (1 - .92 * closure);
  weights[M] = .83 * closure;
  return weights;
}

/** Both portraits use independent eyelids, gaze and a jaw that stays close to the lip seam. */
export function poseColovPortrait({ root, morphs }, face, expression) {
  const elder = root.userData.portraitRig === 'fratele-mare-colov';
  const time = face.time ?? 0;
  const blink = clamp01(Math.max(face.blink || 0, 1 - (expression.eye ?? 1)));
  const level = clamp01((face.mouth || 0) * (expression.quiet ?? 1));
  const weights = elder ? { [A]: level * .31 } : articulations(face.speech, time, level);
  const eyesClosed = face.expr === 'pray' || face.expr === 'asleep';
  const phase = time + (elder ? .7 : 1.8);
  const lateral = .65 * Math.sin(phase * .78) + .24 * Math.sin(phase * 1.91);
  const gx = clamp01((lateral + 1) * .5) * 2 - 1;
  const x = .58 * (face.gazeX ?? gx) + (face.expr === 'gentle-shrewd' ? .28 : 0);
  const y = (face.gazeY ?? .19 * Math.sin(phase * 1.21)) - (/thinking|ashamed/.test(face.expr) ? .34 : 0);
  Object.assign(weights, {
    [blinkR]: blink, [blinkL]: blink,
    'Privire la stânga': Math.max(0, -x) * (1 - blink),
    'Privire la dreapta': Math.max(0, x) * (1 - blink),
    'Privire în sus': Math.max(0, y) * (1 - blink),
    'Privire în jos': Math.max(0, -y) * (1 - blink),
  });
  if (elder) {
    const code = poseElder[face.expr] || 'E1';
    weights[code] = code === 'E4' ? blink : 1 - blink;
    if (code === 'E4') weights[blinkR] = weights[blinkL] = 0;
    weights['Retragere la clipit'] = blink;
  } else if (!eyesClosed) {
    const [name, upper, lower] = poseYoung[face.expr] || [];
    if (name) {
      weights[name + ' · față'] = upper * (1 - blink);
      weights[name + ' · gură'] = lower * (1 - .90 * level);
    }
  }
  for (const mesh of morphs) {
    for (const [key, index] of Object.entries(mesh.morphTargetDictionary)) {
      mesh.morphTargetInfluences[index] = weights[key] ?? 0;
    }
  }
}
