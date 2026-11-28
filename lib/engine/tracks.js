// Piste de regie evaluate pur în funcție de cadru (cadrul 1 = 0 s).
// `smooth`: cubică monotonă (ca Bézier AUTO_CLAMPED din Blender: fără depășiri);
// `step`: valoare constantă până la cheia următoare (variantele de desen).

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
    const slope = (j) => (value(j + 1) - value(j)) / (keys[j + 1][0] - keys[j][0]);
    const tangent = (j) => {
      if (j === 0 || j === keys.length - 1) return 0;
      const s0 = slope(j - 1), s1 = slope(j);
      return s0 * s1 > 0 ? 2 / (1 / s0 + 1 / s1) : 0;
    };
    const h = f1 - f0, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * value(i) + (t3 - 2 * t2 + t) * h * tangent(i) + (-2 * t3 + 3 * t2) * value(i + 1) + (t3 - t2) * h * tangent(i + 1);
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

/** Ultima cheie ≤ f și cea dinainte (pentru tranziții). */
export function lastKey(keys, f) {
  let current = null, previous = null;
  for (const key of keys ?? []) {
    if (key[0] <= f) { previous = current; current = key; } else break;
  }
  return { current, previous };
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
