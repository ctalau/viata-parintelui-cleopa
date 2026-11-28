// Gura după voce: port al build_episode.voice. La fiecare 3 cadre ale replicii, energia
// vocii din fereastra de 0,1 s alege între gura închisă și forma vocalei/consoanei din text.
// Energia vine din episodes/<id>/audio/envelopes.json (tools/engine/envelopes.py), date
// derivate din pista vocii, aceleași în browser și la export.
const POSES = { a: 1, ă: 1, â: 3, e: 2, i: 2, î: 2, o: 3, u: 3, m: 4, b: 4, p: 4, f: 5, v: 5, l: 6 };
const LETTERS = 'aăâeiîoumbpfvl';
const THRESHOLD = 470;

export function mouthKeys(cue, envelope) {
  const keys = [[cue.start - 1, 0]];
  const letters = [...cue.text.toLowerCase()].filter((s) => LETTERS.includes(s));
  if (!envelope || !letters.length) return [...keys, [cue.end, 0]];
  for (let f = cue.start, i = 0; f < cue.end; f += 3, i++) {
    const j = Math.round((f - cue.start) * envelope.rate / envelope.fps);
    const energy = envelope.energy[i] ?? 0;
    const char = letters[Math.min(letters.length - 1, Math.floor(j / Math.max(1, envelope.samples) * letters.length))];
    keys.push([f, energy > THRESHOLD ? POSES[char] : 0]);
  }
  keys.push([cue.end, 0]);
  return keys;
}

/** Pista gurii unui actor: replicile lui (say) + cheile explicite (face.mouth_pose). */
export function mouthTrack(spec, cues, envelopes, fps) {
  const keys = [...(spec.face?.mouth_pose ?? [])];
  for (const file of spec.say ?? []) {
    const cue = cues.find((c) => c.file === file);
    if (cue) keys.push(...mouthKeys(cue, envelopes?.[file] && { ...envelopes[file], fps }));
  }
  keys.sort((a, b) => a[0] - b[0]);
  return (f) => {
    let value = 0;
    for (const [k, v] of keys) { if (k <= f) value = v; else break; }
    return value;
  };
}
