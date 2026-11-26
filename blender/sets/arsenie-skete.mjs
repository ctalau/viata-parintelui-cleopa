import {
  group,
  box,
  egg,
  cylinder,
  rod,
  loop,
  path,
  lathe,
  surface,
  material,
  writeGLB,
  T,
} from './kit/toy-glb.mjs';
import { gold, brass, wood, wine } from '../props/arsenie.mjs';
import {
  buildSketeCell, datePalm, nave, sketeCellOutside, sketeChurchOutside,
  sketeIconostasis, sketeWallPainting, sketeWestPortal,
} from './skete-detail.mjs';
const tau = 2 * Math.PI,
  pi = Math.PI,
  terracotta = ['#c98764', '#dba389', '#d69671', '#e0af90'],
  stones = ['#ead5b8', '#e0ccae', '#dec9b2', '#d6c5b0'],
  wall = material('#fff7e9', 0.93, 0, { image: 'blender/props/src/skete-limewash.jpg' });
const anchor = (x, z, y = 0, face = 0) => ({ pos: [x, y, z], face });
function arch(p, x, y, z, r, thick, mat, depth = 0.36) {
  const parts = 17;
  for (let i = 0; i < parts; i++) {
    const a = ((i + 0.5) * pi) / parts;
    box(
      p,
      [x + Math.cos(a) * (r + thick / 2), y + Math.sin(a) * (r + thick / 2), z],
      [(((r + thick / 2) * pi) / parts) * 0.98, thick, depth],
      Array.isArray(mat) ? mat[i % mat.length] : mat,
      0.015,
      [0, 0, a - pi / 2],
    );
  }
}
function door(p, x, z, r, h) {
  const pos = group(p, 'door-detail', [x, 0, z]);
  box(pos, [0, h / 2, 0], [r * 2, h, 0.17], '#4e3b31', 0.1);
  egg(pos, [0, h, 0], [r, r, 0.088], '#48382e');
  for (let i = -3; i <= 3; i++) {
    const xx = (i * r) / 3.5;
    const hh = h + Math.sqrt(r * r - xx * xx);
    box(
      pos,
      [xx, hh / 2, 0.1],
      [r * 0.27, hh, 0.1],
      i % 2 ? '#996a47' : '#895a3c',
      0.02,
    );
  }
  arch(pos, 0, h, 0.11, r, 0.27, terracotta);
  for (let s of [-1, 1])
    for (let i = 0; i < 7; i++)
      box(
        pos,
        [s * (r + 0.135), ((i + 0.5) * h) / 7, 0.1],
        [0.27, h / 7 - 0.025, 0.36],
        terracotta[i % 4],
        0.025,
      );
  for (let y of [0.65, h * 0.85]) box(pos, [0, y, 0.21], [1.85 * r, 0.13, 0.06], '#6d4f37', 0.025);
  loop(pos, [0.5, 1.13, 0.28], 0.12, 0.03, brass, [0, 0, 0]);
}
function building(p, x, z, w, d, h) {
  box(p, [x, h / 2, z], [w, h, d], '#e3c29f', 0.19);
  box(p, [x, h - 0.08, z], [w + 0.18, 0.36, d + 0.22], wall, 0.08);
  box(p, [x, h + 0.11, z], [w + 0.38, 0.16, d + 0.38], terracotta[0], 0.045);
  door(p, x, z + d / 2 + 0.06, 0.96, 2.1);
  box(p, [x - 0.9, h + 0.56, z], [0.55, 1.04, 0.55], '#c69778', 0.065);
  for (let j = 0; j < 5; j++)
    for (let k = 0; k < 4; k++) {
      let xx = x - w * 0.43 + ((j * 3 + k * 7) % 17) * w * 0.052;
      if (Math.abs(xx - x) < 1.8) continue;
      box(
        p,
        [xx, 0.48 + j * 0.8, z + d / 2 + 0.018],
        [0.5 + (k % 2) * 0.28, 0.19, 0.07],
        terracotta[(j + k) % 4],
        0.045,
      );
    }
}
function tree(p, x, z, scale = 1) {
  const bark = '#80563b',
    leaf = ['#7e9858', '#98aa65', '#6d8959', '#a9b670', '#68805c'];
  const tr = group(p, 'sycamore', [x, 0, z]);
  tr.scale.setScalar(scale);
  rod(tr, [0, 0, 0], [0.22, 3.6, 0.12], 0.72, bark, 0.47);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39,
      dx = Math.cos(a),
      dz = Math.sin(a),
      y = 4.6 + Math.sin(i * 2.3) * 0.7;
    rod(tr, [0.2, 2.3 + 0.16 * i, 0], [dx * 1.9, y, dz * 1.3], 0.31, bark, 0.16);
    rod(tr, [dx * 1.9, y, dz * 1.3], [dx * 3.1, y + 1.2, dz * 2.3], 0.16, bark, 0.055);
    const l = group(tr, 'leaf-cluster-' + i, [dx * 2.45, y + 0.99, dz * 1.77], {
      anim: 'sway',
      freq: 0.15 + i * 0.014,
      amp: 0.028,
      phase: i,
    });
    for (let j = 0; j < 5; j++) {
      const b = j * 2.39 + i;
      egg(l, [Math.cos(b) * 0.83, j * 0.19, Math.sin(b) * 0.73], [1.06, 0.62, 1.1], leaf[(j + i) % 5]);
    }
    for (let j = 0; j < 18; j++) {
      const b = j * 2.41;
      egg(
        l,
        [Math.cos(b) * (1.22 + 0.19 * Math.sin(j)), -0.12 + 0.36 * Math.sin(j * 1.6), Math.sin(b) * 1.24],
        [0.19, 0.066, 0.11],
        leaf[(j + i + 2) % 5],
        [0.1, b, 0.28],
        10,
      );
      if (j % 3 === 0) egg(l, [Math.cos(b), -0.47, Math.sin(b)], [0.075, 0.087, 0.073], '#b77b4f');
    }
  }
  for (let s of [-1, 1]) rod(tr, [0, 0.5, 0], [s * 1.42, 0.05, 0.42 * s], 0.24, bark, 0.048);
}
function sycamoreFig(p, x, z) {
  const root = group(p, 'sycamore-fig', [x, 0, z]);
  const bark = ['#76513b', '#8b6549', '#9b7454', '#674836'];
  const leaves = ['#476e40', '#608948', '#789850', '#8ea754', '#587e43'];
  const goldenAngle = pi * (3 - Math.sqrt(5));
  const trunk = [[0, -0.10, 0], [-0.13, 0.62, 0.04], [-0.25, 1.62, 0], [-0.12, 2.53, -0.12],
    [0.22, 3.52, -0.19], [0.07, 4.28, -0.28], [0.31, 5.01, -0.30]];
  const widths = [0.91, 0.63, 0.53, 0.43, 0.35, 0.25, 0.14];
  for (let i = 1; i < trunk.length; i++) rod(root, trunk[i - 1], trunk[i], widths[i - 1], bark[0], widths[i]);
  for (let i = 0; i < 11; i++) {
    const a = i * tau / 11;
    const ridge = trunk.map(([x, y, z], j) => [
      x + Math.cos(a + 0.13 * j) * widths[j] * 0.93, y,
      z + Math.sin(a + 0.13 * j) * widths[j] * 0.93,
    ]);
    for (let j = 1; j < ridge.length; j++) {
      rod(root, ridge[j - 1], ridge[j], 0.17 - j * 0.016, bark[i % bark.length], 0.15 - j * 0.016);
    }
    const reach = 0.98 + 0.35 * Math.cos(i * 2.8);
    rod(root, ridge[1], [Math.cos(a) * reach, -0.02, Math.sin(a) * reach],
      0.19, bark[i % bark.length], 0.035);
  }
  function leaf(parent, x, y, z, size, yaw, pitch, color) {
    const frame = new T.Euler(pitch, yaw, 0.12, 'YXZ');
    const shape = [[0, 0, -0.40], [-0.28, 0.01, -0.36], [-0.47, 0.06, -0.16],
      [-0.39, 0.06, 0.21], [0, -0.02, 0.58], [0.39, 0.06, 0.21], [0.47, 0.06, -0.16],
      [0.28, 0.01, -0.36], [0, 0.13, 0.03]];
    const vertices = shape.map((v) => new T.Vector3(...v).multiplyScalar(size).applyEuler(frame).add(new T.Vector3(x, y, z)).toArray());
    const indices = shape.slice(0, 8).flatMap((_, i) => [8, (i + 1) % 8, i]);
    surface(parent, vertices, indices, color);
  }
  for (let i = 0; i < 10; i++) {
    const a = goldenAngle * i, dx = Math.cos(a), dz = Math.sin(a);
    const start = trunk[3 + (i % 3)];
    const elbow = [dx * 1.48, 4.53 + 0.35 * Math.sin(i * 2.4), dz * 1.33];
    const tip = [dx * (2.65 + 0.36 * Math.cos(i)), 5.43 + 0.51 * Math.sin(i * 1.9), dz * 2.39];
    rod(root, start, elbow, 0.26 - i * 0.009, bark[i % bark.length], 0.131);
    rod(root, elbow, tip, 0.133, bark[(i + 1) % bark.length], 0.047);
    if (i % 2 === 0) for (let j = 0; j < 9; j++) {
      const s = 0.19 + 0.49 * (j % 3) / 2, angle = j * goldenAngle;
      egg(root, [start[0] + (elbow[0] - start[0]) * s + 0.16 * Math.cos(angle),
        start[1] + (elbow[1] - start[1]) * s - 0.13, start[2] + (elbow[2] - start[2]) * s + 0.18 * Math.sin(angle)],
      [0.075, 0.086, 0.072], ['#a46e46', '#8a5942', '#c48c52'][j % 3], undefined, 10);
    }
    const canopy = group(root, 'fig-foliage-' + i, tip, { anim: 'sway', freq: 0.19, amp: 0.023, phase: i });
    for (let j = 0; j < 10; j++) {
      const b = j * goldenAngle + a, spread = 0.57 + 0.13 * (j % 5);
      const twig = [spread * Math.cos(b), 0.13 + 0.47 * Math.sin(j * 2.1 + i), spread * Math.sin(b)];
      rod(canopy, [-dx * 0.31, -0.12, -dz * 0.31], twig, 0.032, bark[1], 0.010);
      for (let k = 0; k < 20; k++) {
        const c = k * goldenAngle, r = 0.13 * Math.sqrt(k);
        leaf(canopy, twig[0] + r * Math.cos(c), twig[1] + 0.27 * Math.sin(c + j),
          twig[2] + r * Math.sin(c), 0.34 + 0.17 * (k % 5) / 4, c + b, 0.8 * Math.sin(c + i),
          leaves[(i + 2 * j + k) % leaves.length]);
      }
    }
  }
}
function borderGarden(p) {
  for (let i = 0; i < 28; i++) {
    let x = 17 + ((i * 1.29) % 29),
      z = -2.9 + 1.0 * Math.sin(i * 1.71);
    if (x > 27 && x < 39) continue;
    for (let j = 0; j < 3; j++) {
      let h = 0.2 + 0.23 * Math.abs(Math.sin(i + j));
      rod(p, [x, 0, z], [x + 0.09 * j, h, z], 0.019, '#798361');
      egg(p, [x + 0.09 * j, h, z], [0.077, 0.06, 0.073], ['#f4c267', '#df967c', '#dedb9e'][(i + j) % 3]);
    }
  }
}
function vault(p) {
  const { halfWidth, spring, rise, west, east } = nave;
  const pts = [],
    idx = [];
  for (let i = 0; i <= 40; i++) {
    let a = (i * pi) / 40;
    for (let z of [east, west]) pts.push([halfWidth * Math.cos(a), spring + rise * Math.sin(a), z]);
    if (i) {
      let k = i * 2;
      idx.push(k - 2, k, k + 1, k - 2, k + 1, k - 1);
    }
  }
  surface(p, pts, idx, '#42566b');
  for (const z of [east, west]) {
    const cap = [], indices = [];
    for (let i = 0; i <= 32; i++) {
      const a = i * pi / 32, x = halfWidth * Math.cos(a);
      cap.push([x, spring - 0.08, z], [x, spring + rise * Math.sin(a), z]);
      if (i) {
        const n = i * 2;
        indices.push(n - 2, n, n + 1, n - 2, n + 1, n - 1);
      }
    }
    surface(p, cap, indices, '#384e67');
  }
  for (let z of [-9.82, -5.13, -1.26, 2.72, 6.62, 10.87]) {
    const a = Array.from({ length: 29 }, (_, i) => [
      (halfWidth - 0.025) * Math.cos((i * pi) / 28),
      spring + (rise - 0.072) * Math.sin((i * pi) / 28),
      z,
    ]);
    path(p, a, 0.127, '#c89c6b');
  }
  for (let i = 1; i < 14; i++) {
    const a = i * pi / 14;
    for (let j = 0; j < 14; j++) {
      egg(p, [(halfWidth - 0.11) * Math.cos(a), spring + (rise - 0.09) * Math.sin(a), -9.52 + 1.51 * j + (i % 2) * 0.32],
        [0.047, 0.043, 0.039], '#d8b785', undefined, 8);
    }
  }
}
function church() {
  const root = group(null, 'skete-church'),
    inside = group(root, 'interior'),
    outside = group(root, 'courtyard');
  const { halfWidth, spring, west, east, screen } = nave;
  const centerZ = (west + east) / 2, length = west - east;
  const floor = group(inside, 'ground-nave');
  box(floor, [0, -0.15, centerZ - 0.12], [halfWidth * 2 + 0.52, 0.30, length + 0.24], '#8a615b');
  box(floor, [0, -0.14, west + 4.9], [17.9, 0.28, 9.8], '#d7b698');
  for (const s of [-1, 1]) {
    box(group(inside, 'col:nave-wall'), [s * (halfWidth + 0.12), spring / 2, centerZ], [0.30, spring, length], wall);
    box(inside, [s * (halfWidth - 0.12), 0.10, centerZ], [0.28, 0.24, length], '#8f5a48', 0.014);
    box(group(inside, 'col:iconostasis'), [s * 5.11, 2.6, screen], [7.02, 5.2, 0.45], wood);
  }
  vault(inside);
  sketeWallPainting(inside);
  sketeIconostasis(inside);
  sketeWestPortal(inside);
  box(inside, [0, 1.13, 19.6], [26, 2.26, 0.52], '#e6c1a1', 0.14);
  const shelf = group(inside, 'linen-shelf', [-8.0, 0, -3.57]);
  box(shelf, [0, 1.02, 0], [1.1, 0.17, 1.41], wood, 0.057);
  for (const z of [-0.61, 0.61]) box(shelf, [0, 0.49, z], [0.88, 0.99, 0.18], wood, 0.035);
  const chest = group(inside, 'linen-chest', [-8.02, 0, 5.88]);
  box(chest, [0, 0.35, 0], [1.07, 0.66, 2.22], wood, 0.078);
  box(chest, [0, 0.71, 0], [1.15, 0.16, 2.34], '#a57a52', 0.054);
  loop(chest, [0.48, 0.46, 0], 0.097, 0.022, brass, [0, pi / 2, 0]);
  for (const [x, z, width, depth] of [
    [8.13, 2.61, 1.22, 14.56], [-8.13, 0.78, 1.22, 7.28], [-8.13, 8.89, 1.22, 3.64],
    [-4.73, 10.56, 5.46, 1.22], [4.73, 10.56, 5.46, 1.22],
  ]) box(group(inside, 'col:seat-stalls'), [x, 0.69, z], [width, 1.38, depth], wood);
  const sand = group(outside, 'ground-yard');
  box(sand, [34, -0.23, -7], [60, 0.45, 51], '#dfbfa4');
  for (let i = 0; i < 5; i++)
    egg(
      outside,
      [15 + i * 11, -1.36, -27 - (i % 2) * 3.6],
      [8.2 + i * 0.24, 3.5 + (i % 2), 5.9],
      ['#d7ab98', '#e1b798'][i % 2],
    );
  sketeChurchOutside(outside, 38, -11);
  sketeCellOutside(outside, 22, -9);
  building(outside, 24, -21, 3.9, 3, 2.65);
  building(outside, 45, -23, 4.1, 3.2, 2.7);
  const smoke = group(outside, 'chimney-smoke', [20.75, 4.9, -9.88], {
    anim: 'smoke',
    speed: 0.13,
    rise: 2.7,
  });
  for (let i = 0; i < 5; i++) {
    let puff = group(smoke, 'puff' + i);
    egg(puff, [0, 0, 0], [0.17, 0.19, 0.15], material('#e5d5c1', 1, 0, { alpha: 0.3 }));
  }
  sycamoreFig(outside, 30.25, -1.7);
  tree(outside, 16.7, -7.9, 0.72);
  tree(outside, 47.2, -8.3, 0.81);
  datePalm(outside, 25.35, -13.35, 6.65, 0.3);
  datePalm(outside, 47.0, -16.7, 7.2, 1.4);
  datePalm(outside, 19.2, -17.2, 6.1, 2.3);
  borderGarden(outside);
  for (const x of [30.1, 34.9]) {
    box(outside, [x, 0.3, 0.82], [0.51, 0.6, 0.93], '#b9a18a', 0.13);
    box(group(outside, 'col:bench-leg'), [x, 0.30, 0.82], [0.43, 0.55, 0.83], wood);
  }
  box(outside, [32.5, 0.625, 0.82], [6.4, 0.3, 1.17], '#c7b49d', 0.12);
  box(group(outside, 'col:seat-bench', [0, 0, 0], { seats: ['banca', 'frate'] }),
    [32.5, 0.627, 0.82], [6.30, 0.27, 1.10], wood);
  for (let i = 0; i < 12; i++) {
    const x = 18.3 + i * 2.4;
    if (x < 25.25 || (x > 28.5 && x < 42.0)) continue;
    for (let j = 0; j < 2; j++)
      box(outside, [x + j * 0.35, 0.32 + 0.58 * j, -4.7], [2.37, 0.58, 0.63], stones[(i + j) % 4], 0.09);
  }
  for (const [x, z, length, bend] of [[22, -5.94, 8.5, 0.073], [38, -5.59, 8.2, -0.042]]) {
    const paving = group(outside, 'path-paving');
    for (let i = 0; i < 12; i++) {
      const u = i / 11;
      for (const s of [-1, 1]) {
        box(paving, [x + bend * (length * u) ** 2 + s * 0.53, 0.017, z + length * u + s * 0.06],
          [0.96 + 0.12 * Math.sin(i * 1.1 + s), 0.042, 0.59], stones[(i + s + 5) % stones.length], 0.02,
          [0, 0.13 * Math.sin(i * 2.1 + s), 0]);
      }
    }
  }
  const well = group(outside, 'well', [42.6, 0, 2.6]);
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 14; i++) {
      let a = (tau * i) / 14 + j * 0.19;
      box(
        well,
        [1.07 * Math.sin(a), 0.23 + j * 0.41, 1.07 * Math.cos(a)],
        [0.51, 0.4, 0.35],
        stones[(i + j) % 4],
        0.062,
        [0, a, 0],
      );
    }
  for (let x of [-1.15, 1.15]) rod(well, [x, 1.0, 0], [x, 3.05, 0], 0.095, wood);
  rod(well, [-1.45, 2.86, 0], [1.45, 2.86, 0], 0.13, wood);
  rod(well, [0.16, 2.85, 0], [0.16, 0.75, 0], 0.022, '#b18e67');
  for (let i = 0; i < 4; i++) {
    const g = group(outside, 'swift' + i, [31 + i * 2.2, 9.6 + Math.sin(i), -9 - i * 0.52], {
      anim: 'glide',
      phase: i,
    });
    surface(
      g,
      [
        [-0.62, 0.11, 0],
        [-0.26, 0.18, -0.1],
        [0, 0, 0.03],
        [0.26, 0.18, -0.1],
        [0.62, 0.11, 0],
        [0, -0.03, 0.18],
      ],
      [0, 1, 2, 2, 3, 4, 1, 5, 2, 2, 5, 3],
      '#696477',
    );
  }
  const seats = {
    strana: anchor(8.13, 1.70, 1.38, -90),
    banca: anchor(31.02, 1.18, 0.775, 25),
    frate: anchor(33.94, 1.18, 0.775, -25),
  };
  for (let [k, v] of Object.entries(seats)) {
    let g = group(k === 'strana' ? inside : outside, 'seat:' + k, v.pos);
    g.rotation.y = (v.face * pi) / 180;
  }
  writeGLB(root, 'assets/sets/skete-church', {
    name: 'skete-church',
    anchors: {
      center: anchor(0, 1),
      bed: anchor(-6.07, 1.05, 0, 90),
      shelf: anchor(-8.0, -3.57, 1.105, 90),
      door: anchor(0, west, 0, 180),
      bench: anchor(32.5, 1),
      tree: anchor(30.25, -1.7),
      'path-out': anchor(42.8, 5.3),
      'yard-door': anchor(38, -6.2),
    },
    seats,
    shadow: { center: [16, 0], radius: 41 },
    lights: [
      { pos: [-4.0, 4.85, 2.2], color: '#ffe2b4', intensity: 23, distance: 14 },
      { pos: [0, 7.32, 1.16], color: '#ffe1a6', intensity: 38, distance: 17 },
      { pos: [-0.25, 4.52, -7.25], color: '#ffdba0', intensity: 12, distance: 9 },
      { pos: [1.60, 5.08, 10.53], color: '#ffe3b5', intensity: 6, distance: 12 },
    ],
  });
}
function palaceCurtain(parent, at) {
  const g = group(parent, 'tied-silk', at);
  const points = [], indices = [];
  for (let j = 0; j <= 14; j++) for (let i = 0; i <= 18; i++) {
    const u = i / 18, v = j / 14;
    points.push([(u - 0.5) * 2.42 * (0.55 + 0.45 * Math.cos(v * pi) ** 2),
      -v * 5.62 - 0.17 * Math.sin(pi * u), 0.16 * Math.cos(u * pi * 8)]);
    const n = j * 19 + i;
    if (j && i) indices.push(n - 20, n - 1, n, n - 20, n, n - 19);
  }
  surface(g, points, indices, material(wine, 0.62));
  rod(g, [-0.68, -2.76, 0.16], [0.68, -2.76, 0.16], 0.05, gold);
}

function palaceCurtainPanel(parent, at, angle) {
  const panel = group(parent, 'gilt-silk-panel', at);
  panel.rotation.y = angle;
  box(panel, [0, 4.24, 0], [2.69, 6.49, 0.13], '#b89064', 0.035);
  box(panel, [0, 4.24, 0.10], [2.49, 6.26, 0.12], '#ead0a9', 0.045);
  palaceCurtain(panel, [0, 7.18, 0.39]);
  rod(panel, [-1.26, 7.19, 0.44], [1.26, 7.19, 0.44], 0.057, gold);
}

function palace() {
  const r = group(null, 'constantinople-palace'),
    floor = group(r, 'ground-mosaic');
  const doorX = -1.57, doorZ = -8.68, halfDoor = 1.66;
  const marble = ['#557891', '#ecddbd', '#f1ebdf', '#bf9868'];
  box(floor, [0, -0.165, 1], [27.4, 0.28, 27], '#b48b60');
  for (let j = -17; j <= 19; j++) for (let i = -9; i <= 9; i++) {
    const x = i * 1.414 + (Math.abs(j) % 2) * 0.707, z = j * 0.707;
    box(floor, [x, -0.02, z], [1.002, 0.04, 1.002], marble[(i + 2 * j + 48) % 4], 0, [0, pi / 4, 0]);
  }
  const limestone = '#dcc3a4';
  for (const [a, b] of [[-13.5, doorX - halfDoor], [doorX + halfDoor, 13.5]]) {
    const at = [(a + b) / 2, 4.26, doorZ];
    box(r, at, [b - a, 8.52, 0.42], limestone);
    box(group(r, 'col:palace-rear-wall'), at, [b - a, 8.52, 0.42], limestone);
  }
  const opening = [], archIndices = [];
  for (let i = 0; i <= 28; i++) {
    const angle = pi * i / 28;
    const x = doorX - halfDoor * Math.cos(angle);
    opening.push([x, 3.38 + halfDoor * Math.sin(angle), doorZ + 0.19], [x, 8.52, doorZ + 0.19]);
    if (i) {
      const n = i * 2;
      archIndices.push(n - 2, n, n + 1, n - 2, n + 1, n - 1);
    }
  }
  surface(r, opening, archIndices, limestone);
  arch(r, doorX, 3.38, doorZ + 0.31, halfDoor, 0.24, gold);
  for (const side of [-1, 1]) {
    box(r, [doorX + side * (halfDoor + 0.10), 1.69, doorZ + 0.31], [0.22, 3.38, 0.32], gold, 0.03);
    box(r, [doorX + side * 1.73, 2.65, -10.04], [0.18, 5.30, 2.72], '#bda589');
    const at = [side * 13.4, 4.26, 2.06];
    box(r, at, [0.40, 8.52, 21.62], limestone);
    box(group(r, 'col:palace-side-wall'), at, [0.40, 8.52, 21.62], limestone);
    box(r, [side * 13.12, 1.14, 2.06], [0.17, 2.28, 21.50], '#b88e67');
    for (const z of [-4.10, -1.22, 3.46, 6.37, 10.78]) {
      palaceCurtainPanel(r, [side * 13.02, 0, z], -side * pi / 2);
    }
  }
  const endWall = [0, 4.26, 12.86];
  box(r, endWall, [26.4, 8.52, 0.40], limestone);
  box(group(r, 'col:palace-end-wall'), endWall, [26.4, 8.52, 0.40], limestone);
  box(r, [0, 1.14, 12.57], [26.35, 2.28, 0.17], '#b88e67');
  box(r, [0, 7.65, 12.53], [26.36, 0.25, 0.21], gold, 0.05);
  for (const x of [-11.2, -8.0, -4.8, -1.6, 1.6, 4.8, 8.0, 11.2]) {
    palaceCurtainPanel(r, [x, 0, 12.50], pi);
  }
  box(r, [doorX, 2.75, -11.5], [3.55, 5.50, 0.25], '#ecc895');
  box(r, [0, 8.65, 2.02], [27.4, 0.30, 22.1], '#785445');
  for (let x = -12.5; x <= 12.5; x += 2.5)
    for (let z = -7.5; z <= 12.5; z += 2.5) {
      box(r, [x, 8.4, z], [2.46, 0.20, 2.46], '#a77f5a', 0.06);
      box(r, [x, 8.28, z], [1.96, 0.10, 1.96], '#6c5450', 0.08);
      egg(r, [x, 8.20, z], [0.22, 0.10, 0.22], gold, undefined, 10);
    }
  for (const x of [-10.9, -6.5, 3.10, 7.2, 11.15]) {
    box(r, [x, 4.3, -8.41], [3.54, 6.96, 0.14], '#b89064', 0.04);
    box(r, [x, 4.3, -8.30], [3.35, 6.70, 0.12], '#efd9b8', 0.05);
  }
  for (const x of [-12.2, 12.2])
    for (const z of [-6.8, 1.3, 8.95]) {
      let col = group(r, 'column', [x, 0, z]);
      box(col, [0, 0.18, 0], [1.55, 0.36, 1.55], '#f4f1ea', 0.085);
      lathe(
        col,
        [0, 0, 0],
        [
          [0.77, 0.34],
          [0.76, 0.48],
          [0.63, 0.54],
          [0.61, 0.71],
          [0.49, 0.86],
          [0.44, 6.28],
          [0.55, 6.47],
          [0.59, 6.7],
          [0.76, 6.85],
          [0.78, 7.0],
        ],
        '#f4f1ea',
      );
      for (let y of [0.54, 0.81, 6.28, 6.53, 6.9])
        cylinder(col, [0, y, 0], y > 6 ? 0.63 : 0.65, y > 6 ? 0.65 : 0.66, 0.11, gold);
      box(col, [0, 7.09, 0], [1.55, 0.23, 1.55], gold, 0.08);
      for (let s of [-1, 1]) loop(col, [s * 0.53, 6.68, 0.32], 0.17, 0.065, gold, [0, 0, 0]);
    }
  for (const side of [-1, 1]) {
    box(r, [side * 12.18, 7.69, 1.08], [1.54, 1.05, 18.7], '#dfc8a1', 0.12);
    box(r, [side * 11.45, 7.22, 1.08], [0.17, 0.15, 18.7], gold, 0.04);
  }

  for (const x of [-11.55, -8.65, -5.48, 2.51, 5.57, 8.59, 11.62]) {
    palaceCurtain(r, [x, 7.24, -7.98]);
  }
  const throne = group(r, 'carved-gilt-throne', [-7.58, 0, -6.03]);
  box(throne, [0, 0.23, 0], [3.65, 0.45, 2.15], '#7e4d40', 0.09);
  box(throne, [0, 0.52, -0.10], [3.16, 0.25, 1.91], gold, 0.09);
  box(throne, [0, 1.10, -0.08], [2.29, 1.0, 1.62], '#946044', 0.16);
  box(throne, [0, 1.65, 0.06], [2.17, 0.31, 1.55], '#902b50', 0.14);
  box(throne, [0, 2.82, -0.67], [2.26, 2.62, 0.29], gold, 0.26);
  box(throne, [0, 2.84, -0.48], [1.86, 2.22, 0.18], '#902b50', 0.18);
  for (const side of [-1, 1]) {
    box(throne, [side * 1.05, 2.08, 0.05], [0.23, 0.23, 1.58], gold, 0.08);
    egg(throne, [side * 1.02, 4.2, -0.62], [0.17, 0.23, 0.17], gold);
  }
  const urnProfile = [[0.28, 0], [0.48, 0.13], [0.39, 0.30], [0.63, 0.67], [0.73, 1.12],
    [0.57, 1.57], [0.36, 1.75], [0.35, 1.92], [0.49, 1.98]];
  for (const [x, z] of [[-10.38, -3.8], [10.40, -4.82], [-8.7, 4.17]]) {
    const urn = group(r, 'enamel-urn', [x, 0, z]);
    box(urn, [0, 0.49, 0], [1.22, 0.98, 1.17], '#e9dbca', 0.08);
    box(urn, [0, 1.00, 0], [1.38, 0.15, 1.35], gold, 0.05);
    lathe(urn, [0, 1.07, 0], urnProfile, material('#356a68', 0.38, 0.22));
    for (const [radius, y] of [[0.48, 0.13], [0.64, 0.72], [0.72, 1.09], [0.53, 1.61], [0.47, 1.97]])
      loop(urn, [0, 1.07 + y, 0], radius, 0.039, gold);
    for (const side of [-1, 1]) loop(urn, [side * 0.65, 2.52, 0], 0.31, 0.045, gold, [0, 0, 0]);
  }
  for (const x of [-7.6, 0, 7.6]) {
    const lantern = group(r, 'bronze-hanging-lantern', [x, 6.12, -2.72]);
    rod(lantern, [0, 0.62, 0], [0, 2.37, 0], 0.034, brass);
    loop(lantern, [0, -0.10, 0], 0.56, 0.054, gold);
    for (let i = 0; i < 6; i++) {
      const a = i * tau / 6, dx = 0.48 * Math.cos(a), dz = 0.48 * Math.sin(a);
      rod(lantern, [0, 0.63, 0], [dx, -0.15, dz], 0.022, gold);
      egg(lantern, [dx, -0.16, dz], [0.17, 0.26, 0.17], material('#ffd185', 0.5, 0, { glow: 0.57 }));
    }
  }
  writeGLB(r, 'assets/sets/constantinople-palace', {
    name: 'constantinople-palace',
    anchors: {
      center: anchor(0, 0),
      teacher: anchor(-1.55, 1.5),
      'pupil-1': anchor(0.87, 0.35),
      'pupil-2': anchor(2.55, 1.55),
      ...Object.fromEntries(
        [0, 1, 2, 3].map((i) => ['servant-' + (i + 1), anchor([-5.96, -3.97, 0.88, 3.26][i], -4.34)]),
      ),
      bed: anchor(6.05, 1.35),
      exit: anchor(doorX, -9.18),
    },
    lights: [{ pos: [0, 5.8, 3], color: '#ffe6ad', intensity: 26, distance: 23 }],
    shadow: { center: [0, 0], radius: 23 },
  });
}
church();
buildSketeCell();
palace();
