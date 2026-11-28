// Biblioteca de gesturi reutilizabile. Un gest e o succesiune de poze ale brațului, date relativ
// la umărul personajului și la lungimea brațului (in = spre mijlocul corpului, up = în sus), deci
// același gest se potrivește oricărui personaj, fără Blender. Pozele vin din coregrafia validată a
// episodului 1 (build_episode.py) și din regula semnului crucii din AGENTS.md.
//
//   expandGesture(profile, { gesture: 'stop', side: 'R', at: 1773, hold: 40 })
//     → { arms: [{side, keys: [[f, wrist, dir, depth?]], palm}], hands: [[f, side, pose]], head?: [...] }
import { sideSign } from './arm25d.js';
import { wristFromTip, GESTURES as HAND_SHAPES, POSE_GESTURE } from './palm25d.js';

// [in, up] ale încheieturii (× lungimea brațului, de la umăr) și [in, up] ale direcției degetelor.
const POSES = {
  rest: null,                                   // repausul personajului (relax_wrist)
  stopRise: [[0.007, -0.601], [0.944, -0.329]],
  stop: [[0.157, -0.225], [-0.2, 0.98]],
  stopFall: [[-0.059, -0.446], [-0.5, -0.87]],
  think: [[0.271, 0.075], [0.32, 0.95]],
  thinkB: [[0.301, 0.039], [0.36, 0.93]],
  thinkC: [[0.229, -0.009], [0.28, 0.96]],
  pointDown: [[-0.166, -0.554], [-0.26, -0.97]],
  pointUpMid: [[-0.047, -0.207], [-0.5, 0.87]],   // aproape de corp: nu trece prin fața vecinului
  pointUp: [[-0.131, 0.32], [-0.12, 0.99]],
  amen: [[-0.155, -0.746], [-0.3, -0.95]],
  offerMid: [[-0.198, -0.427], [0.102, -0.995]],
  offer: [[-0.408, -0.39], [-0.95, 0.28]],
  explain: [[-0.336, -0.265], [-0.92, 0.31]],
  surprisedA: [[-0.382, -0.465], [-0.96, -0.24]],
  surprised: [[-0.228, -0.165], [-0.2, 0.98]],
  belly: [[0.095, -0.773], [0.92, 0.34]],
  bellyOther: [[0.08, -0.673], [0.72, -0.68]],
  reach: [[-0.22, -0.465], [-0.96, 0.2]],
  reachNear: [[-0.29, -0.419], [-0.99, 0.1]],
  holdBook: [[0.102, -0.637], [0.96, 0.21]],
  chestHand: [[0.026, -0.562], [0.8, -0.45]],
  bookHold: [[0.025, -0.626], [0.97, 0.24]],
  tableRest: [[0.065, -0.873], [0.12, -1]],
  raise: [[0.33, -0.196], [0.83, 0.55]],
  wave: [[-0.05, 0.10], [-0.25, 0.97]],
  waveOut: [[-0.14, 0.08], [-0.55, 0.83]],
};

/** Încheietura și direcția unei poze, în spațiul rigului personajului. */
export function poseOf(p, side, name) {
  const s = sideSign(side);
  if (name === 'rest' || !POSES[name]) {
    return { wrist: [s * (p.shoulder_x + 0.08), p.shoulder_y - p.upper - p.lower + 0.085], dir: [s * 0.06, -1] };
  }
  const [[i, u], [di, du]] = POSES[name];
  const L = p.upper + p.lower;
  return { wrist: [s * p.shoulder_x - s * i * L, p.shoulder_y + u * L], dir: [-s * di, du] };
}

// Fiecare gest: poze la momente (cadre de la început; `hold` întinde partea din mijloc), mâna și palma.
const LIBRARY = {
  stop: { keys: [[0, 'rest'], [17, 'stopRise'], [34, 'stop'], ['hold', 'stop'], ['+20', 'stopFall'], ['+37', 'rest']],
    hands: [[3, 'stop'], ['hold-2', 'rest']], hold: 24 },
  think: { keys: [[0, 'rest'], [34, 'think'], [47, 'thinkB'], [60, 'thinkC'], ['hold', 'think'], ['+30', 'rest']],
    hands: [[27, 'cup'], ['hold+2', 'rest']], palm: [0.4, 0.25, -0.88], hold: 70 },
  pointDown: { keys: [[0, 'rest'], [24, 'pointDown'], ['hold', 'pointDown'], ['+26', 'rest']], hands: [[6, 'reach'], ['hold+8', 'rest']], hold: 12 },
  pointUp: { keys: [[0, 'rest'], [13, 'pointUpMid'], [26, 'pointUp'], ['hold', 'pointUp'], ['+21', 'pointUpMid'], ['+46', 'rest']],
    hands: [[6, 'reach'], ['hold+12', 'rest']], hold: 45 },
  amen: { keys: [[0, 'rest'], [22, 'amen'], ['hold', 'amen'], ['+25', 'rest']], hands: [[12, 'open'], ['hold+15', 'rest']],
    palm: [-0.55, 0.1, 0.83], hold: 30 },
  offer: { keys: [[0, 'rest'], [25, 'offerMid'], [40, 'offer'], ['hold', 'offer'], ['+19', 'offerMid'], ['+38', 'rest']],
    hands: [[22, 'open'], ['hold+23', 'rest']], hold: 60 },
  explain: { keys: [[0, 'rest'], [14, 'explain'], ['hold', 'explain'], ['+13', 'rest']], hands: [[6, 'open'], ['hold+10', 'rest']], hold: 40 },
  surprised: { keys: [[0, 'rest'], [8, 'surprisedA'], [18, 'surprised'], ['hold', 'surprised'], ['+20', 'rest']],
    hands: [[-3, 'open'], ['hold+12', 'rest']], hold: 20 },
  reach: { keys: [[0, 'rest'], [30, 'reach'], ['hold', 'reachNear']], hands: [[7, 'reach']], hold: 40 },
  wave: { keys: [[0, 'rest'], [14, 'wave'], [22, 'waveOut'], [30, 'wave'], [38, 'waveOut'], [46, 'wave'], ['hold', 'wave'], ['+18', 'rest']],
    hands: [[6, 'stop'], ['hold+6', 'rest']], hold: 0 },
  raise: { keys: [[0, 'rest'], [29, 'raise'], ['hold', 'raise'], ['+23', 'rest']], hands: [[13, 'open'], ['hold+14', 'rest']], hold: 30 },
  holdBook: { keys: [[0, 'holdBook'], ['hold', 'holdBook']], hands: [[0, 'grip']], hold: 1 },
  tableRest: { keys: [[0, 'tableRest'], ['hold', 'tableRest']], hands: [[0, 'reach']], hold: 1 },
  hungry: { both: { R: 'belly', L: 'bellyOther' }, keys: [[0, 'rest'], [14, '*'], ['hold', '*'], ['+20', 'rest']],
    hands: [[5, 'cup'], ['hold+12', 'rest']], hold: 30 },
};

/** Ținte pe corp pentru gesturile cu contact (marcajele din build_characters.create_character). */
function bodyPoint(p, name) {
  const look = p.look ?? 1;
  return {
    // Fruntea, deasupra ochilor (marcajul vechi, head_y + 0,535 · head_h, era pentru proporțiile
    // de dinainte de revizia brațelor și nu mai e în bătaia mâinii).
    forehead: [-0.03, p.head_y + 0.30],
    chest: [0.047 * look, p.shoulder_y - 0.412],
    shoulderR: [-p.shoulder_x * 0.78, p.shoulder_y - 0.055],
    shoulderL: [p.shoulder_x * 0.76, p.shoulder_y - 0.095],
  }[name];
}

/**
 * Desface un gest în piste de regie (aceeași formă ca episode.json: arms, hands, head).
 * `at` = cadrul de început; `hold` = câte cadre ține poza din mijloc; `side` = R | L.
 */
export function expandGesture(p, action) {
  const name = action.gesture;
  const side = action.side ?? 'R';
  const at = action.at;
  if (name === 'cross') return crossGesture(p, action);
  if (name === 'pray') return prayGesture(p, action);
  if (name === 'nod' || name === 'bow' || name === 'shakeHead' || name === 'laugh') return headGesture(name, action);
  const g = LIBRARY[name];
  if (!g) throw new Error(`Gest necunoscut: ${name}`);
  const hold = action.hold ?? g.hold;
  const sides = g.both ? Object.keys(g.both) : [side];
  const arms = [], hands = [];
  for (const s of sides) {
    let holdAt = null;
    const keys = [];
    for (const [when, pose] of g.keys) {
      const poseName = pose === '*' ? g.both[s] : pose;
      let f;
      if (typeof when === 'number') f = at + when;
      else if (when === 'hold') { f = keys.at(-1)[0] + hold; holdAt = f; }
      else f = holdAt + Number(when);
      const { wrist, dir } = poseOf(p, s, poseName);
      if (keys.length && f <= keys.at(-1)[0]) continue;
      keys.push([f, wrist, dir]);
    }
    const handAt = (when) => {
      if (typeof when === 'number') return at + when;
      const m = /^hold([+-]\d+)$/.exec(when);
      return holdAt + Number(m[1]);
    };
    for (const [when, pose] of g.hands) hands.push([handAt(when), s, pose]);
    arms.push({ side: s, keys, palm: action.palm ?? g.palm ?? null, limit: action.limit ?? null });
  }
  return { arms, hands, end: Math.max(...arms.map((a) => a.keys.at(-1)[0])) };
}

/** Semnul crucii (AGENTS.md): palma dreaptă la frunte, piept, umărul drept, apoi umărul stâng. */
function crossGesture(p, action) {
  const side = 'R';
  const at = action.at;
  const pose = 'cross';
  const gesture = HAND_SHAPES[POSE_GESTURE[pose]];
  const palm = [0.3, 0.2, -1];
  const z = 0.62;
  const stops = [['forehead', 18], ['chest', 34], ['shoulderR', 50], ['shoulderL', 66]];
  const keys = [[at, ...Object.values(poseOf(p, side, 'rest'))]];
  for (const [name, t] of stops) {
    // La frunte vârful vine mai spre cameră: antebrațul se scurtează în loc să treacă peste față.
    const tip = [...bodyPoint(p, name), name === 'forehead' ? 0.95 : z];
    const dir = name === 'shoulderL' ? [0.6, 0.8] : name === 'shoulderR' ? [0.2, 0.98] : [0.15, 0.99];
    const w = wristFromTip(p, side, tip, dir, palm, gesture);
    keys.push([at + t, [w[0], w[1]], dir]);
    keys.push([at + t + 5, [w[0], w[1]], dir]);
  }
  keys.push([at + 90, ...Object.values(poseOf(p, side, 'rest'))]);
  return { arms: [{ side, keys, palm, limit: 1.2, lift: 'face', liftFrom: at + 8, liftTo: at + 72 }], hands: [[at + 6, side, pose], [at + 82, side, 'rest']],
    head: [[at, 0, 0], [at + 62, 0.07, 0.04], [at + 92, 0, 0]], end: at + 90 };
}

/** Rugăciunea: mâinile împreunate în dreptul pieptului, capul plecat. */
function prayGesture(p, action) {
  const at = action.at;
  const hold = action.hold ?? 60;
  const arms = [], hands = [];
  for (const side of ['R', 'L']) {
    const s = sideSign(side);
    const tip = [0.02 * s, p.shoulder_y - 0.30, 0.6];
    const dir = [-0.25 * s, 0.97];
    const palm = [-s, 0, 0];
    const w = wristFromTip(p, side, tip, dir, palm, HAND_SHAPES.deschis);
    const rest = poseOf(p, side, 'rest');
    arms.push({ side, palm, keys: [[at, rest.wrist, rest.dir], [at + 24, [w[0], w[1]], dir], [at + 24 + hold, [w[0], w[1]], dir],
      [at + 48 + hold, rest.wrist, rest.dir]] });
    hands.push([at + 8, side, 'open'], [at + 40 + hold, side, 'rest']);
  }
  return { arms, hands, head: [[at, 0, 0], [at + 24, 0.09, 0.05], [at + 24 + hold, 0.09, 0.05], [at + 48 + hold, 0, 0]], end: at + 48 + hold };
}

function headGesture(name, action) {
  const at = action.at;
  if (name === 'nod') return { head: [[at, 0, 0], [at + 6, 0.07, 0.02], [at + 12, 0, 0], [at + 18, 0.06, 0.02], [at + 26, 0, 0]], end: at + 26 };
  if (name === 'bow') return { head: [[at, 0, 0], [at + 14, 0.14, 0.08], [at + 14 + (action.hold ?? 20), 0.14, 0.08], [at + 40 + (action.hold ?? 20), 0, 0]], end: at + 40 };
  if (name === 'shakeHead') return { head: [[at, 0, 0], [at + 6, 0, 0.1], [at + 12, 0, -0.1], [at + 18, 0, 0.08], [at + 24, 0, 0]], end: at + 24 };
  // laugh: build_episode.laugh_reaction
  const keys = [[at, 0.03, 0.12], [at + 4, 0.11, 0.12], [at + 9, 0.05, 0.12], [at + 13, 0.14, 0.12], [at + 18, 0.055, 0.12], [at + (action.hold ?? 40), 0.028, 0.12]];
  return { head: keys, face: { mouth_pose: [[at, 7], [at + 4, 1], [at + 9, 7], [at + 13, 1], [at + 18, 7], [at + (action.hold ?? 40), 0]],
    eye_pose: [[at, 1], [at + 4, 2], [at + 9, 1], [at + 13, 2], [at + 18, 1], [at + (action.hold ?? 40), 0]] }, end: at + (action.hold ?? 40) };
}

export const GESTURE_NAMES = [...Object.keys(LIBRARY), 'cross', 'pray', 'nod', 'bow', 'shakeHead', 'laugh'];
