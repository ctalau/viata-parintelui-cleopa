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
} from '../sets/kit/toy-glb.mjs';
export const gold = material('#e0b43a', 0.29, 0.64),
  brass = material('#c9a24a', 0.34, 0.52),
  wood = '#795136',
  wine = '#7a2a55',
  flax = '#d9cdb4',
  thread = '#a18b6f';
const tau = 2 * Math.PI;
function sheet(p, w, d, fn, mat, nx = 22, nz = 14) {
  const pts = [],
    idx = [],
    uv = [];
  for (let j = 0; j <= nz; j++)
    for (let i = 0; i <= nx; i++) {
      let u = (2 * i) / nx - 1,
        v = (2 * j) / nz - 1;
      pts.push([(w / 2) * u * (1 - 0.047 * v * v), fn(u, v), (d / 2) * v * (1 - 0.05 * u * u)]);
      uv.push([i / nx, 1 - j / nz]);
      if (j && i) {
        let k = j * (nx + 1) + i;
        idx.push(k - nx - 2, k - 1, k, k - nx - 2, k, k - nx - 1);
      }
    }
  return surface(p, pts, idx, mat, uv);
}
export function cushion(p, w, d, h, mat, { pressed = false, patch = false, silk = false } = {}) {
  const top = (u, v) =>
    h *
    (0.36 +
      0.67 * Math.max(0, (1 - u * u) * (1 - v * v)) ** 0.55 -
      (pressed ? 0.39 * Math.exp(-4 * (u * u + v * v)) : 0));
  sheet(
    p,
    w,
    d,
    top,
    patch ? material('#ffffff', 0.96, 0, { image: 'blender/props/src/small-pillow-linen.jpg' }) : mat,
  );
  sheet(p, w, d, (u, v) => h * (0.36 - 0.35 * ((1 - u * u) * (1 - v * v)) ** 0.6), mat);
  const at = (u, v, lift = 0) => [
    (w / 2) * u * (1 - 0.047 * v * v),
    top(u, v) + lift,
    (d / 2) * v * (1 - 0.05 * u * u),
  ];
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
    [-1, -1],
  ].map((x) => at(...x));
  path(p, corners, silk ? 0.017 : 0.009, silk ? gold : thread);

  if (silk) {
    const embroidery = material('#d7ad67', 0.62, 0.18);
    for (const k of [0.78, 0.87]) {
      const outline = [];
      for (const [du, dv] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        for (let i = 0; i < 8; i++) {
          const q = -1 + i / 4;
          outline.push(at(k * (du - dv * q), k * (dv + du * q), 0.013));
        }
      }
      path(p, [...outline, outline[0]], 0.008, embroidery);
    }
    for (let i = 0; i < 6; i++) {
      const a = i * tau / 6;
      const petal = Array.from({ length: 15 }, (_, j) => {
        const b = j * tau / 14, r = 0.17 - 0.17 * Math.cos(b), d = 0.097 * Math.sin(b);
        return at(r * Math.cos(a) - d * Math.sin(a), r * Math.sin(a) + d * Math.cos(a), 0.014);
      });
      path(p, petal, 0.009, embroidery);
      for (const side of [-1, 1]) {
        const vine = Array.from({ length: 8 }, (_, j) => {
          const b = j / 7, r = 0.33 + 0.27 * b, d = side * 0.13 * Math.sin(b * Math.PI);
          return at(r * Math.cos(a) - d * Math.sin(a), r * Math.sin(a) + d * Math.cos(a), 0.014);
        });
        path(p, vine, 0.007, embroidery);
      }
    }
    egg(p, at(0, 0, 0.018), [0.038, 0.014, 0.034], embroidery, undefined, 10);
  }
  if (silk)
    for (const [x, y, z] of corners.slice(0, 4)) {
      rod(p, [x, y, z], [x * 1.035, y - 0.1, z * 1.05], 0.033, gold, 0.018);
      egg(p, [x * 1.035, y - 0.12, z * 1.05], [0.045, 0.065, 0.045], gold);
    }
}
export function stand(p) {
  lathe(
    p,
    [0, 0, 0],
    [
      [0.42, 0],
      [0.46, 0.08],
      [0.39, 0.16],
      [0.23, 0.22],
      [0.11, 0.34],
      [0.094, 1.31],
      [0.19, 1.44],
      [0.1, 1.59],
      [0.12, 1.68],
      [0.5, 1.79],
      [0.52, 1.88],
      [0.46, 1.93],
    ],
    brass,
  );
  cylinder(p, [0, 1.91, 0], 0.46, 0.46, 0.035, '#cdbb97');
  for (let i = 0; i < 3; i++) {
    const a = (i * tau) / 3,
      x = 0.27 * Math.cos(a),
      z = 0.27 * Math.sin(a),
      h = 0.55 + 0.08 * i;
    cylinder(p, [x, 1.93 + h / 2, z], 0.056, 0.067, h, '#f2d27a');
    const fire = group(p, 'flame-' + i, [x, 1.93 + h + 0.09, z]);
    egg(fire, [0, 0, 0], [0.05, 0.128, 0.05], material('#ffcf4d', 0.6, 0, { glow: 0.95 }));
  }
}
export function lamp(p) {
  lathe(
    p,
    [0, 0, 0],
    [
      [0.04, 0],
      [0.19, 0.09],
      [0.3, 0.25],
      [0.345, 0.46],
      [0.35, 0.48],
    ],
    material('#ba342e', 0.19, 0.1, { alpha: 0.8 }),
  );
  for (let h of [0.11, 0.4, 0.49]) loop(p, [0, h, 0], h === 0.11 ? 0.19 : 0.35, 0.025, brass);
  for (let i = 0; i < 3; i++) {
    let a = (tau * i) / 3;
    rod(p, [0.36 * Math.cos(a), 0.47, 0.36 * Math.sin(a)], [0, 1.92, 0], 0.016, brass);
  }
  loop(p, [0, 2, 0], 0.09, 0.021, brass, [0, 0, 0]);
  egg(
    group(p, 'flame-lamp', [0, 0.42, 0]),
    [0, 0, 0],
    [0.062, 0.15, 0.062],
    material('#ffd979', 0.3, 0, { glow: 1 }),
  );
}
export function bed(p) {
  const b = '#69374b';
  box(p, [0, 1.04, 0], [5.4, 0.38, 3.38], gold, 0.11);
  box(p, [0, 1.36, 0], [5.3, 0.67, 3.32], '#f1ceb3', 0.29);
  box(p, [0, 1.65, 0], [5.35, 0.22, 3.36], '#a34765', 0.11);
  for (let x of [-2.64, 2.64])
    for (let z of [-1.65, 1.65]) {
      cylinder(p, [x, 2.52, z], 0.095, 0.13, 5.04, gold);
      egg(p, [x, 5.14, z], [0.17, 0.28, 0.17], gold);
      for (let y of [0.21, 0.82, 1.81, 4.65]) cylinder(p, [x, y, z], 0.17, 0.17, 0.09, gold);
    }
  box(p, [0, 4.82, 0], [5.67, 0.25, 3.59], wine, 0.11);
  for (let z of [-1.78, 1.78]) {
    rod(p, [-2.77, 4.73, z], [2.77, 4.73, z], 0.047, gold);
    for (let i = -2; i <= 2; i++) egg(p, [i * 1.1, 4.64, z], [0.57, 0.25, 0.052], wine);
  }
  for (const side of [-1, 1]) for (const z of [-1.70, 1.70]) {
    const curtain = group(p, 'tied-canopy-curtain', [side * 2.59, 4.66, z]);
    const silk = material('#75425c', 0.65, 0.10);
    const point = (u, v) => {
      const gather = (1 - v) ** 2 * 0.98 + 0.18 + 0.38 * Math.max(0, v - 0.62);
      return [-side * (0.11 + gather * u), -3.29 * v,
        0.11 * Math.sin(7 * Math.PI * u) * (1 - 0.72 * Math.sin(Math.PI * v))];
    };
    const vertices = [], indices = [];
    for (let j = 0; j <= 16; j++) for (let i = 0; i <= 18; i++) {
      vertices.push(point(i / 18, j / 16));
      const k = j * 19 + i;
      if (j && i) indices.push(k - 20, k - 1, k, k - 20, k, k - 19);
    }
    surface(curtain, vertices, indices, silk);
    path(curtain, Array.from({ length: 19 }, (_, i) => point(i / 18, 1)), 0.023, gold);
    path(curtain, Array.from({ length: 19 }, (_, i) => point(i / 18, 0.56)), 0.030, gold);
  }
  const colors = ['#d58e32', '#3e608a', '#a34765', '#559088', '#8c4976', '#e5bd78', '#5579aa', '#b15959'];
  for (let i = 0; i < 8; i++) {
    const row = Math.floor(i / 4),
      j = i % 4;
    const q = group(p, 'pillow' + (i + 1), [(j - 1.5) * 1.18, 1.76 + row * 0.16, 0.55 - row * 1.26]);
    q.rotation.y = j % 2 ? 0.12 : -0.11;
    cushion(q, 1.14, 1.04, 0.49, material(colors[i], 0.42, 0.09), { silk: true });
  }
}
export function table(p) {
  box(p, [0, 1.3, 0], [3.38, 0.25, 1.80], wood, 0.1);
  for (let x of [-1.36, 1.36])
    for (let z of [-0.64, 0.64])
      lathe(
        p,
        [x, 0, z],
        [
          [0.14, 0],
          [0.13, 0.2],
          [0.09, 0.42],
          [0.16, 0.75],
          [0.11, 1.2],
        ],
        wood,
      );
}
export function dog(p, sheep = false) {
  const fur = sheep ? '#f1e8d6' : '#efe4cf',
    tan = sheep ? '#aa9684' : '#baa386';
  egg(p, [0, 0.54, 0], [0.72, 0.42, 0.38], fur);
  for (let i = 0; i < 14; i++) {
    const a = (tau * i) / 14;
    egg(p, [0.57 * Math.cos(a), 0.57, 0.26 * Math.sin(a)], [0.25, 0.32, 0.22], fur);
  }
  const h = group(p, 'head', [0.55, 0.72, 0], sheep ? { anim: 'sway', amp: 0.055, freq: 0.3 } : {});
  egg(h, [0.08, 0.13, 0], [0.36, 0.38, 0.32], fur);
  egg(h, [0.34, 0.03, 0], [0.245, 0.15, 0.2], sheep ? tan : fur);
  egg(h, [0.528, 0.065, 0], [0.074, 0.064, 0.115], '#403633');
  for (let s of [-1, 1]) {
    egg(h, [0.14, 0.2, s * 0.289], [0.055, 0.065, 0.033], '#332c29');
    egg(h, [-0.07, 0.1, s * 0.3], [0.14, 0.22, 0.078], tan, [s * 0.25, 0, 0.14]);
  }
  for (let x of [-0.4, 0.4])
    for (let z of [-0.22, 0.22])
      egg(p, [x, sheep ? 0.24 : 0.18, z], [0.15, sheep ? 0.25 : 0.17, 0.14], fur);
  const tail = group(p, 'tail', [-0.56, 0.44, 0], { anim: 'tail', amp: 0.42 });
  egg(tail, [-0.17, 0.06, 0], [0.24, 0.13, 0.14], fur, [0, 0, -0.44]);
}
const make = (id, fn, meta = {}) => {
  const r = group(null, id);
  if (process.argv[1]?.endsWith('/arsenie.mjs') && process.argv.length > 2 && !process.argv.slice(2).includes(id)) return;
  fn(r);
  if (meta.grip) {
    const grip = group(r, 'grip', meta.grip);
    if (meta.gripRotation) grip.rotation.set(...meta.gripRotation);
  }
  writeGLB(r, 'assets/props/' + id, meta);
};
export function buildProps() {
  make(
    'votive-candle',
    (r) => {
      cylinder(r, [0, 0.38, 0], 0.059, 0.07, 0.76, '#f4cd79');
      rod(r, [0, 0.75, 0], [0, 0.81, 0], 0.016, '#49382e');
      group(r, 'unlit');
      egg(group(r, 'lit'), [0, 0.9, 0], [0.052, 0.13, 0.052], material('#ffcb53', 0.6, 0, { glow: 1 }));
    },
    { variants: ['unlit', 'lit'], steps: true },
  );
  make('hanging-lamp', lamp);
  make('candle-stand', stand);
  make('palace-bed', bed);
  make('palace-table', table);
  make(
    'scroll',
    (root) => {
      const p = group(root, 'pergament');
      p.rotation.x = -Math.PI / 2;
      box(p, [0, 0, 0], [0.86, 0.54, 0.034], '#ecd9a8', 0.016);
      for (let x of [-0.42, 0.42]) {
        cylinder(p, [x, 0, 0], 0.072, 0.072, 0.63, '#d7b983');
        for (let s of [-1, 1]) egg(p, [x, s * 0.34, 0], [0.074, 0.055, 0.074], gold);
      }
      for (let j = 0; j < 4; j++)
        box(p, [-0.025, j * 0.085 - 0.12, 0.021], [0.5 - j * 0.05, 0.012, 0.009], '#967856');
    },
    { grip: [-0.4, 0, 0], gripRotation: [-Math.PI / 2, 0, 0] },
  );
  make(
    'gold-belt',
    (root) => {
      const p = group(root, 'links');
      for (let i = 0; i < 22; i++) {
        let a = (tau * i) / 22;
        const edge = (v) => Math.sign(v) * Math.abs(v) ** (2 / 3.2);
        const x=.80*edge(Math.sin(a)), z=.51*edge(Math.cos(a));
        const next=a+tau/22;
        const nx=.80*edge(Math.sin(next)), nz=.51*edge(Math.cos(next));
        const tangent=Math.atan2(z-nz,nx-x);
        box(p,[(x+nx)/2,0,(z+nz)/2],[Math.hypot(nx-x,nz-z)+.016,.28,.068],gold,.024,[0,tangent,0]);
      }
      box(p, [0, 0, 0.556], [0.29, 0.34, 0.073], gold, 0.055);
    },
    { grip: [0.78, 0, 0], bone: 'pelvis', origin: [0, 1.72, 0] },
  );
  make('gold-cuffs', (p) => cylinder(p, [0, 0, 0], 0.224, 0.24, 0.17, gold), {
    bone: 'hand_L',
    mirrorBone: 'hand_R',
    origin: [0.86, 1.37, 0.032],
  });
  make(
    'prince-crown',
    (p) => {
      lathe(
        p,
        [0, 0, 0],
        [
          [0.61, 0],
          [0.65, 0.07],
          [0.65, 0.15],
          [0.61, 0.16],
        ],
        gold,
      );
      for (let i = 0; i < 5; i++) {
        let a = (tau * i) / 5;
        cylinder(p, [0.63 * Math.sin(a), 0.22, 0.63 * Math.cos(a)], 0.026, 0.12, 0.23, gold, 4);
      }
    },
    { bone: 'head', origin: [0, 3.91, 0] },
  );
  make(
    'epitrahil',
    (p) => {
      const pts = [], idx = [];
      const profile = [
        [0.45, 0.686, 0.26], [0.73, 0.651, 0.26], [0.96, 0.617, 0.25],
        [1.22, 0.592, 0.25], [1.48, 0.555, 0.23], [1.72, 0.548, 0.23],
        [1.98, 0.525, 0.24], [2.22, 0.508, 0.24], [2.47, 0.488, 0.24],
        [2.67, 0.448, 0.25], [2.84, 0.330, 0.27],
      ];
      for (const [y, z, w] of profile) {
        if (pts.length) {
          const i = pts.length - 2;
          idx.push(i, i + 1, i + 2, i + 1, i + 3, i + 2);
        }
        pts.push([-w, y, z], [w, y, z]);
      }
      surface(p, pts, idx, '#8a2f3a');
      for (let x of [-1, 1])
        path(
          p,
          pts.filter((_, i) => i % 2 === (x > 0 ? 1 : 0)),
          0.018,
          gold,
        );
      for (let [y, z] of [
        [0.88, 0.640],
        [2.04, 0.530],
      ]) {
        box(p, [0, y, z], [0.071, 0.36, 0.022], gold, 0.009);
        box(p, [0, y + 0.04, z + 0.007], [0.265, 0.065, 0.023], gold, 0.008);
      }
    },
    { bone: 'spine', origin: [0, 0, 0], followsRobe: true },
  );
  make('grape-bowl', (p) => {
    lathe(
      p,
      [0, 0, 0],
      [
        [0.2, 0],
        [0.24, 0.08],
        [0.11, 0.14],
        [0.46, 0.27],
        [0.51, 0.36],
      ],
      gold,
    );
    for (let i = 0; i < 20; i++) {
      let a = i * 2.4,
        r = 0.32 * Math.sqrt(i / 20);
      egg(
        p,
        [Math.cos(a) * r, 0.4 + 0.19 * (1 - r / 0.36), Math.sin(a) * r],
        [0.095, 0.1, 0.093],
        i % 2 ? '#744d71' : '#653b70',
      );
    }
  });
  make('sheepdog', (p) => dog(p), { grip: [0, 0.6, 0] });
  make('sheep', (p) => dog(p, true), { grip: [0, 0.6, 0] });
  make('shepherd-stone', (p) => egg(p, [0, 0.24, 0], [2.38, 0.37, 1.12], '#898a84', [0, 0.08, 0.025]));
  make(
    'bread-crust',
    (p) => {
      egg(p, [0, 0.09, 0], [0.28, 0.11, 0.18], '#a66d3c');
      egg(p, [0.17, 0.1, 0], [0.12, 0.087, 0.15], '#e4c080');
    },
    { grip: [-0.17, 0.09, 0] },
  );
}
if (process.argv[1]?.endsWith('/arsenie.mjs')) buildProps();
