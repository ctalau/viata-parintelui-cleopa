// Piste de regie evaluate pur în funcție de cadru (cadrul 1 = 0 s).
// `smooth`: curbă monotonă cu viteză și accelerație continue;
// `step`: valoare constantă până la cheia următoare (variantele de desen).

export function easeInOut(t) {
  const u = Math.max(0, Math.min(1, t));
  return u ** 3 * (10 + u * (-15 + 6 * u));
}

export function monotoneTangent(before, after) {
  if (before * after <= 0) return 0;
  // The middle Bézier control points stay in order if the endpoint speeds sum to ≤ 2.5× the segment slope.
  const cap = 1.25 * Math.min(Math.abs(before), Math.abs(after));
  return Math.sign(before) * Math.min(cap, Math.abs(2 / (1 / before + 1 / after)));
}

/** Quintic Hermite with prescribed endpoint speeds and zero endpoint acceleration. */
export function smoothSegment(from, to, fromSpeed, toSpeed, duration, t) {
  const s = 1 - t;
  const start = t * s ** 3 * (1 + 3 * t);
  const end = s * t ** 3 * (1 + 3 * s);
  return from + (to - from) * easeInOut(t) + duration * (fromSpeed * start - toSpeed * end);
}

export function smooth(keys, f) {
  // keys: [[frame, value | [values]]], sortate.
  if (!keys?.length) return undefined;
  if (f <= keys[0][0]) return keys[0][1];
  if (f >= keys.at(-1)[0]) return keys.at(-1)[1];
  let i = 0;
  while (f > keys[i + 1][0]) i++;
  const [f0, v0] = keys[i], [f1, v1] = keys[i + 1];
  const t = (f - f0) / (f1 - f0);
  const vec = Array.isArray(v0);
  const comp = (k) => {
    const value = (j) => (vec ? keys[j][1][k] : keys[j][1]);
    const slope = (j) => {
      const duration = keys[j + 1][0] - keys[j][0];
      return duration > 0 ? (value(j + 1) - value(j)) / duration : 0;
    };
    const tangent = (j) => {
      if (j === 0 || j === keys.length - 1) return 0;
      return monotoneTangent(slope(j - 1), slope(j));
    };
    return smoothSegment(value(i), value(i + 1), tangent(i), tangent(i + 1), f1 - f0, t);
  };
  return vec ? v0.map((_, k) => comp(k)) : comp(0);
}

export function step(keys, f) {
  if (!keys?.length) return undefined;
  let value = keys[0][1];
  for (const [frame, v] of keys) {
    if (frame <= f) value = v; else break;
  }
  return value;
}

/** Cheile din jurul lui f, pentru tranziții. */
export function lastKey(keys, f) {
  let current = null, previous = null;
  for (const key of keys ?? []) {
    if (key[0] > f) return { current, previous, next: key };
    previous = current;
    current = key;
  }
  return { current, previous, next: null };
}

export const linear = (keys, f) => {
  if (!keys?.length) return undefined;
  if (f <= keys[0][0]) return keys[0][1];
  if (f >= keys.at(-1)[0]) return keys.at(-1)[1];
  let i = 0;
  while (f > keys[i + 1][0]) i++;
  const t = (f - keys[i][0]) / (keys[i + 1][0] - keys[i][0]);
  const a = keys[i][1], b = keys[i + 1][1];
  return Array.isArray(a) ? a.map((v, k) => v + (b[k] - v) * t) : a + (b - a) * t;
};

/** Cadrul desenat, cu cadența episodului numărată de la fiecare tăietură. */
export function drawingFrame(episode, frame) {
  const step = episode.drawingStep ?? 2;
  if (step === 1) return frame;
  let start = episode.shots[0].at;
  for (const shot of episode.shots) {
    if (shot.at > frame) break;
    start = shot.at;
  }
  return start + Math.floor((frame - start) / step) * step;
}
