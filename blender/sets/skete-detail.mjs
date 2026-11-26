import { group, box as boxMesh, egg as eggMesh, cylinder, rod, loop, path, lathe, surface, material, writeGLB } from './kit/toy-glb.mjs';
import { brass, lamp, stand } from '../props/arsenie.mjs';

const pi = Math.PI;
const ivory = '#f0d9b2';
const sandstone = ['#e7cba7', '#f0d7b3', '#ddbb97', '#e6c499'];
const tile = ['#b57357', '#c88765', '#cd916d', '#a86351'];
const ochre = '#c39153';
const walnut = '#4e2c23';
const carved = '#93613a';
const gilded = material('#e9b957', 0.38, 0.47);
const highlight = material('#f6d88a', 0.47, 0.27);
const limewash = material('#fcf0d7', 0.93, 0, { image: 'blender/props/src/skete-limewash.jpg' });
const anchor = (x, z, face = 0, y = 0) => ({ pos: [x, y, z], face });
const box = (p, at, size, mat, r, rotation) => boxMesh(p, at, size, mat, r, rotation, 1);
const egg = (p, at, size, mat, rotation) => eggMesh(p, at, size, mat, rotation, 12);

export const nave = { halfWidth: 8.72, spring: 8.65, rise: 4.28, west: 11.18, east: -10.08, screen: -4.9 };

function cross(p, x, y, z, height, mat = gilded) {
  box(p, [x, y, z], [height * 0.12, height, height * 0.085], mat, height * 0.03);
  box(p, [x, y + height * 0.14, z], [height * 0.62, height * 0.115, height * 0.087], mat, height * 0.03);
  for (const [dx, dy] of [[0, -0.45], [0, 0.45], [-0.29, 0.14], [0.29, 0.14]]) {
    egg(p, [x + dx * height, y + dy * height, z], [0.09 * height, 0.08 * height, 0.047 * height], mat);
  }
}

function arch(p, x, y, z, radius, width, depth, colors, parts = 15) {
  const r = radius + width / 2;
  for (let i = 0; i < parts; i++) {
    const a = (i + 0.5) * pi / parts;
    box(p, [x + r * Math.cos(a), y + r * Math.sin(a), z],
      [r * pi / parts * 0.98, width, depth], colors[i % colors.length], 0.012, [0, 0, a - pi / 2]);
  }
}

// Fill the wall beyond the semicircle, leaving a real arched opening through it.
function spandrel(p, radius, y, top, depth, mat) {
  const points = [], indices = [];
  for (let i = 0; i <= 20; i++) {
    const a = i * pi / 20, x = -radius * Math.cos(a), lower = y + radius * Math.sin(a);
    points.push([x, lower, -depth / 2], [x, top, -depth / 2], [x, lower, depth / 2], [x, top, depth / 2]);
    if (i) {
      const n = 4 * i, q = n - 4;
      indices.push(q, q + 1, n, n, q + 1, n + 1, q + 2, n + 2, q + 3, n + 2, n + 3, q + 3,
        q, n, n + 2, q, n + 2, q + 2);
    }
  }
  surface(p, points, indices, mat);
}

function image(p, x, y, z, w, h, file, tint = '#ffffff', crop = [0, 0, 1, 1]) {
  const [u0, v0, u1, v1] = crop;
  surface(p, [[x - w / 2, y - h / 2, z], [x + w / 2, y - h / 2, z],
    [x + w / 2, y + h / 2, z], [x - w / 2, y + h / 2, z]],
  [0, 1, 2, 0, 2, 3], material(tint, 0.94, 0, { image: 'assets/icons/' + file }),
  [[u0, v1], [u1, v1], [u1, v0], [u0, v0]]);
}

function rosette(p, x, y, z, size, mat = gilded) {
  for (let i = 0; i < 6; i++) {
    const a = i * pi / 3;
    egg(p, [x + 0.55 * size * Math.cos(a), y + 0.55 * size * Math.sin(a), z],
      [size * 0.49, size * 0.23, size * 0.16], mat, [0, 0, a]);
  }
  egg(p, [x, y, z + size * 0.1], [size * 0.28, size * 0.28, size * 0.2], highlight);
}

function archedWindow(p, x, y, z, w, h) {
  const r = w / 2;
  box(p, [x, y, z], [w, h, 0.08], '#554a41', 0.025);
  egg(p, [x, y + h / 2, z - 0.003], [r, r, 0.053], '#554a41');
  box(p, [x, y - 0.035, z + 0.049], [w * 0.74, h * 0.96, 0.029], '#b28a5e', 0.012);
  egg(p, [x, y + h / 2 - 0.05, z + 0.048], [r * 0.74, r * 0.74, 0.025], '#b28a5e');
  box(p, [x, y + 0.04, z + 0.083], [0.09, h + r * 0.9, 0.085], ivory, 0.012);
  box(p, [x, y - h * 0.47, z + 0.058], [w + 0.23, 0.16, 0.21], ivory, 0.025);
  arch(p, x, y + h / 2, z + 0.065, r, w * 0.18, 0.18, sandstone, 11);
}

function ashlar(p, w, h, z, span = 0.95, low = 0.18) {
  const courses = Math.floor((h - low) / 0.42);
  for (let row = 0; row < courses; row++) {
    const joint = (row % 2) * span / 2;
    for (let x = -w / 2 - joint, i = 0; x < w / 2; x += span, i++) {
      const a = Math.max(-w / 2, x), b = Math.min(w / 2, x + span);
      if (b - a < 0.13) continue;
      box(p, [(a + b) / 2, low + 0.21 + 0.42 * row, z], [b - a - 0.023, 0.391, 0.1],
        sandstone[(i * 3 + row * 5) % sandstone.length], 0.016);
    }
  }
}

function tiledRoof(p, w, d, y, rise) {
  for (const sign of [-1, 1]) {
    const rows = Math.ceil(d / 0.54);
    const eave = d / 2 + 0.24;
    const pitch = Math.atan2(rise, eave);
    box(p, [0, y + rise / 2, sign * eave / 2], [w + 0.32, 0.18, Math.hypot(eave, rise)], tile[3],
      0.026, [sign * pitch, 0, 0]);
    const cols = Math.ceil(w / 0.58);
    for (let j = 0; j < rows; j++) {
      const u = (j + 0.5) / rows, z = sign * eave * u;
      for (let i = 0; i < cols; i++) {
        const x = (i + 0.5) * w / cols - w / 2 + (j % 2 ? -0.05 : 0.06);
        box(p, [x, y + rise * (1 - u) + 0.12, z],
          [w / cols - 0.017, 0.11, eave / rows * 1.30], tile[(i + j * 3) % tile.length], 0.045,
          [sign * pitch, 0, 0]);
      }
    }
  }
  rod(p, [-w / 2 - 0.17, y + rise + 0.15, 0], [w / 2 + 0.17, y + rise + 0.15, 0], 0.13, tile[1]);
}

function drum(p, x, y, z, r, tone) {
  const g = group(p, 'drum', [x, y, z]);
  const h = r * 0.62;
  cylinder(g, [0, h / 2, 0], r, r, h, ivory, 16);
  for (const yy of [0.10, h - 0.08]) {
    cylinder(g, [0, yy, 0], r * 1.048, r * 1.048, 0.13, tile[1], 32);
  }
  for (let i = 0; i < 8; i++) {
    const a = i * pi / 4, bay = group(g, 'drum-bay', [Math.sin(a) * r * 0.99, 0, Math.cos(a) * r * 0.99]);
    bay.rotation.y = a;
    archedWindow(bay, 0, h * 0.45, 0, r * 0.28, h * 0.53);
    box(bay, [r * 0.28, h / 2, -0.015], [r * 0.11, h - 0.19, 0.13], sandstone[2], 0.025);
  }
  const profile = Array.from({ length: 24 }, (_, i) => {
    const a = i * pi / 46;
    return [r * 1.06 * Math.cos(a), h + r * 0.76 * Math.sin(a)];
  });
  lathe(g, [0, 0, 0], profile, tone);
  for (let i = 0; i < 12; i++) {
    const yaw = i * pi / 6;
    path(g, profile.filter((_, j) => j % 3 === 0 || j === profile.length - 1)
      .map(([rr, yy]) => [rr * Math.sin(yaw), yy + 0.012, rr * Math.cos(yaw)]), r * 0.016, '#476c75');
  }
  const peak = h + 0.76 * r;
  egg(g, [0, peak + 0.04, 0], [r * 0.13, r * 0.13, r * 0.13], brass);
  cross(g, 0, peak + 0.45 * r, 0, 0.65 * r);
}

function plankDoor(p, radius, spring, animated) {
  const g = group(p, animated ? 'door:cell' : 'cell-door', [radius, 0, 0.055]);
  const planks = 10;
  for (let i = 0; i < planks; i++) {
    const x = (i + 0.5) * 2 * radius / planks;
    const h = spring + Math.sqrt(radius * radius - (x - radius) ** 2);
    box(g, [-x, h / 2, 0], [2 * radius / planks - 0.016, h, 0.16],
      i % 2 ? '#785035' : '#885c3c', 0.022);
  }
  for (const y of [spring * 0.31, spring * 0.84]) {
    box(g, [-radius * 0.94, y, 0.09], [1.83 * radius, radius * 0.11, 0.065], '#58412f', 0.015);
    for (const x of [0.16, 0.85]) {
      egg(g, [-radius * x, y, 0.137], [0.052, 0.052, 0.025], '#322b23');
    }
  }
  loop(g, [-radius * 1.6, spring * 0.57, 0.13], radius * 0.09, 0.023, brass, [0, 0, 0]);
}

function cellFacade(p, w, h, r, spring, animated) {
  const foundation = 0.24, cheek = (w - 2 * r) / 2;
  for (const s of [-1, 1]) {
    const pier = group(p, 'jamb', [s * (w / 2 - cheek / 2), 0, 0]);
    box(pier, [0, h / 2, 0], [cheek, h, 0.36], limewash);
    ashlar(pier, cheek, h * 0.93, 0.18, w / 9, foundation);
    box(p, [s * (r + 0.11), spring / 2, 0.035], [0.22, spring, 0.47], sandstone[0], 0.025);
  }
  spandrel(p, r, spring, h, 0.36, limewash);
  for (const s of [-1, 1]) arch(p, 0, spring, s * 0.172, r, 0.19, 0.15, tile, 17);
  plankDoor(p, r, spring, animated);
  box(p, [0, h + 0.015, 0], [w + 0.12, 0.21, 0.54], sandstone[1], 0.027);
  box(p, [0, 0.035, 0.04], [2 * r + 0.34, 0.07, 0.71], sandstone[0], 0.027);
}

export function sketeCellOutside(p, x, z) {
  const w = 5.4, d = 5.0, h = 3.65, r = 0.92, spring = 1.94;
  const hut = group(p, 'square-cell', [x, 0, z]);
  cellFacade(group(hut, 'cell-front', [0, 0, d / 2]), w, h, r, spring, false);
  for (const s of [-1, 1]) {
    const side = group(hut, 'cell-side', [s * (w / 2 - 0.14), 0, 0]);
    side.rotation.y = s * pi / 2;
    box(side, [0, h / 2, 0], [d, h, 0.32], limewash);
    ashlar(side, d, h - 0.15, 0.165, 0.7);
    archedWindow(side, -0.45, h * 0.61, 0.24, 0.55, 0.66);
  }
  box(hut, [0, h / 2, -d / 2], [w, h, 0.3], limewash);
  box(hut, [0, h + 0.2, 0], [w + 0.46, 0.34, d + 0.45], sandstone[0], 0.046);
  box(hut, [0, h + 0.39, 0], [w + 0.6, 0.15, d + 0.55], tile[1], 0.044);
  box(hut, [-1.25, h + 0.81, -0.88], [0.49, 0.86, 0.49], sandstone[2], 0.048);
  cross(hut, 0, 3.27, d / 2 + 0.19, 0.42, walnut);
}

export function buildSketeCell() {
  const root = group(null, 'skete-cell'), r = 1.98, spring = 4.33, h = 7.2, doorX = 7.22, doorZ = -2.45;
  const plaster = material('#e9b985', 0.96, 0, { image: 'blender/props/src/skete-limewash.jpg' });
  const floorTiles = ['#c28b61', '#cd986c', '#d2a277', '#baa080'].map(
    (color) => material(color, 0.98, 0, { image: 'blender/props/src/skete-limestone.jpg' }),
  );
  const floor = group(root, 'ground-cell');
  box(floor, [1.8, -0.16, -0.75], [19.4, 0.27, 13.8], '#a87559');
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 9; i++) {
      box(floor, [-6.50 + i * 1.85 + (j % 2) * 0.31, -0.025, -6.55 + j * 1.65], [1.827, 0.05, 1.623],
        floorTiles[(i * 3 + j) % floorTiles.length], 0.016);
    }
  }
  box(root, [-7.32, h / 2, -0.74], [0.35, h, 13.47], plaster);
  const back = group(root, 'cell-back', [0, 0, -7.24]);
  box(back, [0, h / 2, 0], [14.35, h, 0.32], plaster);
  ashlar(back, 14.31, 1.12, 0.17, 1.1);
  box(back, [0, 6.95, 0.2], [14.37, 0.24, 0.32], '#8d6449', 0.03);
  const doorWall = group(root, 'cell-door-wall', [doorX, 0, doorZ]);
  doorWall.rotation.y = pi / 2;
  cellFacade(doorWall, 9.5, h, r, spring, true);
  for (const [side, z, depth] of [['rear', -5.85, 2.81], ['front', 2.82, 6.55]]) {
    box(group(root, 'col:cell-door-' + side), [doorX, spring / 2, z], [0.35, spring, depth], plaster);
  }
  box(root, [doorX, h / 2, 4.22], [0.36, h, 3.85], plaster);
  for (const x of [-6.8, -4.1, -1.4, 1.3, 4, 6.7]) {
    rod(root, [x, 6.92, -7.05], [x, 6.92, 5.85], 0.17, '#947055');
  }
  box(root, [0, h + 0.07, -0.74], [14.62, 0.25, 13.56], '#d1ac83', 0.03);
  const shelf = group(root, 'prayer-shelf', [0.35, 0, -6.63]);
  box(shelf, [0, 1.19, 0], [3.54, 0.19, 0.86], carved, 0.04);
  for (const x of [-1.4, 1.4]) box(shelf, [x, 0.79, -0.15], [0.13, 0.7, 0.52], carved, 0.035);
  box(shelf, [0, 3.45, -0.21], [1.76, 2.13, 0.15], walnut, 0.055);
  image(shelf, 0, 3.45, -0.126, 1.30, 1.96, 'pantocrator-aurit-054.jpg');
  const light = group(shelf, 'cell-oil-lamp', [1.15, 1.33, 0.16]);
  light.scale.setScalar(0.5);
  lamp(light);
  box(root, [8.74, -0.103, -1.87], [5.9, 0.18, 14.2], '#d9bb98', 0.028);
  box(root, [10.45, 0.49, -7.3], [5.8, 1, 0.65], '#d6b18d', 0.07);
  writeGLB(root, 'assets/sets/skete-cell', {
    name: 'skete-cell',
    title: 'Chilia dreptunghiulară a schitului',
    anchors: { center: anchor(0, 0), rest: anchor(-2.21, -4.63, 130), 'door-in': anchor(5.25, doorZ, 90),
      door: anchor(doorX, doorZ, 90), outside: anchor(10.4, doorZ, 90) },
    doors: ['cell'],
    doorLeaves: { cell: { hinge: [doorX + 0.055, doorZ - r], length: 2 * r, out: [1, 0] } },
    shadow: { center: [1, -2], radius: 19 },
    lights: [{ pos: [-2.8, 4.6, -0.5], color: '#ffd39e', intensity: 13, distance: 14 },
      { pos: [4.9, 4.8, -0.3], color: '#ffe1b8', intensity: 8, distance: 13 }],
  });
}

export function sketeChurchOutside(p, x, z) {
  const g = group(p, 'byzantine-church', [x, 0, z]);
  g.scale.y = 1.34;
  const w = 9.15, d = 8.25, h = 5.68;
  // Triconch plan: a high nave and three half-round apses against the east wall.
  box(g, [0, h / 2, 0], [w, h, d], limewash, 0.1);
  box(g, [0, 0.19, 0], [w + 0.36, 0.38, d + 0.40], sandstone[2], 0.05);
  const facade = group(g, 'western-front', [0, 0, d / 2]);
  cellFacade(facade, w, h, 1.14, 2.87, false);
  for (const s of [-1, 1]) {
    archedWindow(facade, s * 2.82, 2.96, 0.26, 0.94, 1.17);
    for (const xx of [s * 1.68, s * 4.30]) {
      box(facade, [xx, 2.8, 0.295], [0.32, 5.52, 0.50], ivory, 0.047);
      for (const y of [0.52, 4.15, 5.4]) box(facade, [xx, y, 0.37], [0.49, 0.18, 0.57], sandstone[2], 0.035);
    }
  }
  const medallion = 4.95;
  loop(facade, [0, medallion, 0.24], 0.30, 0.047, tile[0], [0, 0, 0]);
  cross(facade, 0, medallion, 0.245, 0.48);
  for (const s of [-1, 1]) {
    const side = group(g, 'nave-wall', [s * w / 2, 0, 0]);
    side.rotation.y = s * pi / 2;
    ashlar(side, d, h - 0.24, 0.004, 1.18);
    for (const zz of [-2.37, 0, 2.37]) archedWindow(side, zz, 3.24, 0.07, 0.63, 1.36);
    const aisle = group(g, 'side-aisle', [s * 4.88, 0, -0.9]);
    box(aisle, [0, 1.82, 0], [1.22, 3.64, 5.75], sandstone[0], 0.08);
    tiledRoof(aisle, 1.35, 5.9, 3.68, 0.48);
    archedWindow(aisle, 0, 2.07, 2.88, 0.46, 0.90);
  }
  for (const [xx, r, apseH] of [[-2.97, 1.17, 3.58], [0, 1.91, 4.43], [2.97, 1.17, 3.58]]) {
    const apse = group(g, 'apse', [xx, 0, -d / 2 + 0.03]);
    cylinder(apse, [0, apseH / 2, 0], r, r, apseH, sandstone[1], 24);
    for (const y of [0.38, apseH - 0.26, apseH - 0.06]) cylinder(apse, [0, y, 0], r * 1.045, r * 1.045, 0.12, tile[1], 24);
    lathe(apse, [0, apseH, 0], Array.from({ length: 15 }, (_, i) => [r * (1 - i / 14) + 0.012, i * 0.057]), tile[0]);
    for (const a of [pi - 0.63, pi, pi + 0.63]) {
      const win = group(apse, 'apse-light', [r * Math.sin(a), 0, r * Math.cos(a)]);
      win.rotation.y = a;
      archedWindow(win, 0, 2.28, 0, 0.42, 0.92);
    }
  }
  for (const [y, width] of [[0.09, 3.45], [0.21, 3.14], [0.34, 2.86]]) {
    box(facade, [0, y, 0.84 - y * 1.28], [width, 0.17, 1.44 - y * 1.76], ivory, 0.045);
  }
  tiledRoof(g, w + 0.16, d, h + 0.09, 0.82);
  drum(g, 0, h + 0.72, -0.53, 2.17, material('#567f8b', 0.52, 0.18));
  for (const s of [-1, 1]) drum(g, s * 3.02, h + 0.46, -2.12, 1.03, material('#648c96', 0.56, 0.16));
}

function iconFrame(p, x, y, z, w, h, file, crop) {
  box(p, [x, y, z], [w + 0.29, h + 0.35, 0.16], carved, 0.065);
  box(p, [x, y, z + 0.092], [w + 0.15, h + 0.17, 0.075], gilded, 0.036);
  image(p, x, y, z + 0.137, w, h, file, '#ffffff', crop);
  for (const yy of [-1, 1]) {
    for (const xx of [-1, 1]) rosette(p, x + xx * (w / 2 + 0.065), y + yy * (h / 2 + 0.068), z + 0.158, 0.068);
  }
}

function vine(p, x, y, z, length, mat, vertical = false) {
  const point = (u, v) => vertical ? [x + v, y + u, z] : [x + u, y + v, z];
  const lobe = (u) => 0.09 * Math.sin(u * 11);
  const n = Math.ceil(length * 11);
  path(p, Array.from({ length: n + 1 }, (_, i) => {
    const u = i * length / n;
    return point(u, lobe(u));
  }), 0.019, mat);
  for (let i = 1; i < n; i += 3) {
    const u = i * length / n, d = Math.cos(u * 11) > 0 ? 1 : -1;
    egg(p, point(u, lobe(u) + d * 0.046), [0.100, 0.042, 0.022], mat, [0, 0, (vertical ? pi / 2 : 0) + d * 0.55]);
  }
}

export function sketeIconostasis(p) {
  const screen = group(p, 'carved-iconostasis', [0, 0, nave.screen]);
  for (const s of [-1, 1]) {
    box(screen, [s * 5.12, 2.67, -0.06], [7.04, 5.34, 0.40], walnut, 0.065);
    for (const column of [1.61, 4.31, 6.48, 8.55]) {
      const x = s * column;
      box(screen, [x, 2.59, 0.22], [0.29, 5.18, 0.33], carved, 0.057);
      for (const y of [0.20, 0.39, 1.4, 4.87, 5.11]) {
        box(screen, [x, y, 0.27], [0.43, 0.11, 0.41], gilded, 0.028);
      }
      vine(screen, x, 0.52, 0.42, 4.3, gilded, true);
      rosette(screen, x, 5.03, 0.51, 0.15);
    }
    const inner = s < 0 ? 'vladimir-aurit-054.jpg' : 'pantocrator-aurit-054.jpg';
    const outer = s < 0 ? 'nicolae-aurit-054.jpg' : 'ioan-aurit-054.jpg';
    iconFrame(screen, s * 2.96, 3.20, 0.198, 2.04, 3.09, inner);
    iconFrame(screen, s * 5.40, 3.06, 0.198, 1.69, 2.72, outer);
    for (const [center, width] of [[2.96, 2.14], [5.40, 1.68], [7.52, 1.59]]) {
      const x = s * center;
      box(screen, [x, 0.79, 0.189], [width, 1.08, 0.15], carved, 0.058);
      rosette(screen, x, 0.86, 0.302, 0.30);
      vine(screen, x - width * 0.42, 0.38, 0.302, width * 0.84, gilded);
    }
    box(screen, [s * 7.52, 3.12, 0.18], [1.55, 3.43, 0.16], carved, 0.066);
    box(screen, [s * 7.52, 3.01, 0.28], [1.30, 2.72, 0.08], walnut, 0.037);
    arch(screen, s * 7.52, 4.20, 0.33, 0.64, 0.104, 0.14, [gilded, carved], 13);
    vine(screen, s * 7.52, 1.59, 0.337, 2.60, gilded, true);
    rosette(screen, s * 7.52, 3.61, 0.39, 0.26);
    const door = group(screen, 'royal-door', [s * 1.43, 0, -0.095]);
    // The sanctuary is visible between the two ajar leaves.
    door.rotation.y = s * -0.68;
    const x = -s * 0.686;
    box(door, [x, 1.51, 0], [1.372, 3.02, 0.17], walnut, 0.072);
    const annunciation = s < 0 ? [0.014, 0.317, 0.486, 0.854] : [0.53, 0.315, 0.972, 0.842];
    iconFrame(door, x, 2.12, 0.098, 0.82, 1.43, 'buna-vestire-sinai.jpg', annunciation);
    rosette(door, x, 0.77, 0.14, 0.27);
    for (const xx of [x - 0.53, x + 0.53]) vine(door, xx, 0.28, 0.117, 2.45, gilded, true);

  }
  arch(screen, 0, 3.52, 0.22, 1.43, 0.25, 0.35, [carved, gilded, carved], 21);
  arch(screen, 0, 3.52, 0.35, 1.70, 0.13, 0.15, [highlight, gilded], 23);
  const saints = group(screen, 'twelve-saints');
  box(saints, [0, 6.53, -0.07], [17.25, 2.43, 0.40], walnut, 0.065);
  for (let i = 0; i < 12; i++) {
    const column = i % 4, row = Math.floor(i / 4), x = (i - 5.5) * 1.38;
    const crop = [(column + 0.025) / 4, (row + 0.017) / 3, (column + 0.975) / 4, (row + 0.983) / 3];
    iconFrame(saints, x, 6.56, 0.17, 1.01, 1.57, 'sfinti-registru-054.jpg', crop);
  }
  for (const x of [-8.36, 8.36]) {
    box(saints, [x, 6.55, 0.173], [0.28, 1.98, 0.22], carved, 0.04);
    vine(saints, x, 5.67, 0.294, 1.73, highlight, true);
  }
  for (const y of [5.38, 7.71]) {
    box(screen, [0, y, 0.042], [17.45, 0.42, 0.53], walnut, 0.064);
    for (const dy of [-0.19, 0.19]) box(screen, [0, y + dy, 0.289], [17.45, 0.092, 0.17], gilded, 0.028);
    vine(screen, -8.59, y, 0.334, 17.18, highlight);
  }
  box(screen, [0, 8.10, 0.09], [3.62, 0.16, 0.51], gilded, 0.045);
  for (const s of [-1, 1]) {
    path(screen, [[s * 1.96, 8.06, 0.29], [s * 1.68, 8.49, 0.28], [s * 0.93, 8.72, 0.27],
      [s * 0.47, 9.18, 0.24], [0, 9.26, 0.24]], 0.103, carved);
    rosette(screen, s * 1.30, 8.13, 0.343, 0.23);
    rosette(screen, s * 0.71, 8.52, 0.32, 0.19);
  }
  cross(screen, 0, 9.25, 0.29, 1.64);

  const altar = group(p, 'sanctuary', [0, 0, -7.82]);
  paintedWall(p, 'painted-east-end', [0, 0, nave.east + 0.18], 0, 2 * nave.halfWidth, 9);
  const holyTable = group(altar, 'holy-table', [0, 0, 0]);
  box(holyTable, [0, 0.88, 0], [2.52, 1.75, 1.54], '#f1dec1', 0.105);
  box(holyTable, [0, 1.70, 0], [2.68, 0.20, 1.69], '#fff0d4', 0.068);
  for (const y of [0.21, 0.29, 1.59]) box(holyTable, [0, y, 0.784], [2.54, 0.031, 0.025], gilded);
  cross(holyTable, 0, 0.98, 0.795, 0.66);
  box(holyTable, [0, 1.85, 0], [0.74, 0.12, 0.53], '#8e433d', 0.043);
  box(holyTable, [0, 1.91, -0.38], [0.60, 0.22, 0.42], gilded, 0.065);
  cross(holyTable, 0, 3.19, -0.38, 2.53);

  for (const x of [-4.55, 4.55]) stand(group(p, 'votive-candles', [x, 0, -4.17]));
  for (const x of [-2.98, 2.98]) {
    const l = group(p, 'icon-candela', [x, 4.94, -4.29]);
    l.scale.setScalar(0.53);
    lamp(l);
  }
}

function paintedWall(p, name, at, heading, width, bays) {
  const wall = group(p, name, at);
  wall.rotation.y = heading;
  for (const [y, h, color] of [
    [0.73, 1.46, '#986253'], [2.16, 1.42, '#b38975'], [5.24, 4.77, '#f1d4aa'], [8.14, 1.03, '#536775'],
  ]) {
    box(wall, [0, y, -0.108], [width, h, 0.316], color, 0.016);
  }
  for (const y of [0.18, 1.40, 2.87, 7.68, 8.57]) {
    box(wall, [0, y, 0.075], [width - 0.025, 0.086, 0.035], '#af7950', 0.014);
  }
  for (let i = 0; i < bays; i++) {
    const step = width / bays, x = (i + 0.5) * step - width / 2, r = step * 0.34;
    arch(wall, x, 6.15, 0.093, r, 0.042, 0.035, ['#c89464'], 15);
    for (const s of [-1, 1]) box(wall, [x + s * (r + 0.02), 4.89, 0.091], [0.046, 2.53, 0.03], '#c89464', 0.012);
    const stem = '#b48762';
    const leaf = '#c59970';
    for (const s of [-1, 1]) {
      path(wall, [[x, 3.99, 0.103], [x + s * 0.23, 4.30, 0.103], [x + s * 0.35, 4.72, 0.103],
        [x + s * 0.18, 5.05, 0.103], [x + s * 0.04, 5.23, 0.103]], 0.013, stem);
      for (let j = 0; j < 3; j++) egg(wall, [x + s * (0.14 + j * 0.094), 4.38 + 0.22 * j, 0.10],
        [0.16, 0.053, 0.018], leaf, [0, 0, s * (0.64 - 0.42 * j)]);
    }
    rosette(wall, x, 5.39, 0.097, 0.139, '#bc8a5e');
  }
  const count = Math.floor(width / 0.43);
  for (let i = 0; i < count; i++) {
    const x = ((i + 0.5) / count - 0.5) * width;
    box(wall, [x, 8.15, 0.079], [0.176, 0.176, 0.028], i % 2 ? '#c9aa79' : '#8d725d', 0.012, [0, 0, pi / 4]);
    if (i % 2 === 1) rosette(wall, x, 1.75, 0.072, 0.085, '#a06b56');
  }
  return wall;
}

export function sketeWallPainting(p) {
  const { halfWidth, east, west } = nave;
  for (const s of [-1, 1]) {
    const wall = paintedWall(p, 'painted-side-wall', [s * halfWidth, 0, (east + west) / 2], -s * pi / 2, west - east, 9);
    const glow = material('#ffda98', 0.82, 0, { glow: 0.48 });
    for (const x of [-7.04, -2.35, 2.35, 7.04]) {
      archedWindow(wall, x, 6.41, 0.131, 0.76, 1.04);
      box(wall, [x, 6.44, 0.195], [0.46, 0.84, 0.048], glow, 0.036);
      egg(wall, [x, 6.86, 0.195], [0.23, 0.29, 0.027], glow);
      box(wall, [x, 6.49, 0.24], [0.045, 1.26, 0.05], ochre, 0.016);
    }
  }
}

export function sketeWestPortal(p) {
  const { halfWidth, spring, west } = nave;
  const portal = group(p, 'west-entrance', [0, 0, west]);
  portal.rotation.y = pi;
  const radius = 1.87, lintel = 4.41, wing = halfWidth - radius;
  spandrel(portal, radius, lintel, spring, 0.42, '#d6ad82');
  for (const s of [-1, 1]) {
    const x = s * (radius + wing / 2);
    box(group(p, 'col:west-wall'), [x, spring / 2, west], [wing, spring, 0.42], limewash);
    box(portal, [x, spring / 2, 0], [wing, spring, 0.42], limewash);
    paintedWall(portal, 'painted-west-end', [x, 0, 0.212], 0, wing, 3);
    box(portal, [s * (radius + 0.13), lintel / 2, 0.24], [0.26, lintel, 0.43], carved, 0.028);
    const door = group(portal, 'open-west-door', [s * radius, 0, -0.175]);
    door.rotation.y = -s * 1.25;
    for (let i = 0; i < 6; i++) {
      box(door, [-s * (i + 0.5) * 0.30, 2.08, 0], [0.297, 4.15, 0.13], i % 2 ? carved : walnut, 0.022);
    }
    for (const y of [0.56, 2.97]) box(door, [-s * 0.90, y, 0.093], [1.77, 0.13, 0.11], '#574236', 0.018);
    loop(door, [-s * 1.57, 1.62, 0.14], 0.12, 0.027, brass, [0, 0, 0]);
  }
  arch(portal, 0, lintel, 0.244, radius, 0.25, 0.42, [sandstone[2], ochre, sandstone[0]], 21);
  arch(portal, 0, lintel, 0.256, radius + 0.25, 0.092, 0.26, [carved, ochre], 24);
  box(portal, [0, 8.15, 0.224], [radius * 2, 0.95, 0.038], '#536775', 0.01);
  for (const x of [-1.24, -0.63, 0, 0.63, 1.24]) rosette(portal, x, 8.15, 0.25, 0.12, '#c9aa79');
  for (const x of [-1.1, 0, 1.1]) rosette(portal, x, 7.11, 0.23, 0.166, '#af7950');
}

export function datePalm(p, x, z, height, phase) {
  const palm = group(p, 'date-palm', [x, 0, z]);
  const crown = group(palm, 'palm-crown', [0.27, height, 0], { anim: 'sway', freq: 0.18, amp: 0.026, phase });
  for (let i = 0; i < 12; i++) {
    const y = height * i / 12;
    cylinder(palm, [0.27 * (i / 12) ** 2, y + height / 24, 0], .19, .23, height / 12 + 0.025,
      i % 2 ? '#a47b50' : '#966d48', 9);
  }
  for (let j = 0; j < 11; j++) {
    const a = j * 2.399 + phase, dx = Math.sin(a), dz = Math.cos(a), l = height * (0.38 + 0.05 * Math.cos(j));
    const points = [], idx = [];
    for (let i = 0; i <= 12; i++) {
      const u = i / 12, y = l * (0.97 * u - 1.15 * u * u + (j % 3) * u * 0.17);
      const w = l * 0.16 * Math.sin(pi * u) * (i % 2 ? 0.78 : 1);
      points.push([u * l * dx - dz * w, y - w * 0.24, u * l * dz + dx * w],
        [u * l * dx, y, u * l * dz], [u * l * dx + dz * w, y - w * 0.24, u * l * dz - dx * w]);
      if (i) {
        const n = 3 * i;
        idx.push(n - 3, n - 2, n, n, n - 2, n + 1, n - 2, n - 1, n + 1, n + 1, n - 1, n + 2);
      }
    }
    surface(crown, points, idx, ['#687d48', '#87944f', '#9ca061'][j % 3]);
  }
}
