// "hermitage2d" set: a hermit's cell cut into a sandstone rock in a quiet stony desert, painted in the muted,
// warm style of an old book illustration (design: videos/025-pimen-si-fratele-alungat/design/reference.svg).
// The shapes are the reference drawing's own SVG paths (Path2D), placed in the world on the stage camera's projection:
// each piece has an anchor in its SVG coordinates (where it touches the ground) and a scale (studs per SVG unit).
// Pure functions of (layout, camera, t).
import { rgba, rng, mix, shade, ellipse } from './paint.js';

// ---------------------------------------------------------------- the pieces (SVG paths of the reference)
const ROCK = {
  anchor: [335, 662], k: 0.026,
  layers: [
    { d: 'M56 637 C67 579 83 523 118 477 C155 430 173 376 248 362 C286 316 363 327 402 345 C475 337 523 359 558 412 C613 446 630 522 614 606 C606 650 568 665 509 661 C409 652 333 673 238 666 C159 660 94 664 56 637Z',
      grad: [[150, 330], [600, 680], ['#ddbd92', 0], ['#bc956f', 0.55], ['#a98266', 1]], stroke: '#a77d5d', w: 5 },
    { d: 'M74 585 C104 530 113 477 164 428 C218 374 259 359 304 356 C248 389 220 430 204 475 C151 534 132 597 137 646 L80 644Z', fill: '#f1d0a1', a: 0.52 },
    { d: 'M409 353 C467 349 539 389 561 439 C572 462 597 506 592 565 C577 527 565 508 548 483 C512 450 480 452 451 421 C434 402 418 390 409 353Z', fill: '#866e5f', a: 0.19 },
    // the cave door: a dark arched opening, its deeper inside, a worn sill
    { d: 'M230 656 C228 592 234 513 260 481 C278 454 314 446 345 454 C389 458 405 492 410 534 C416 588 413 630 420 651 C354 664 290 665 230 656Z', fill: '#6a5449', stroke: '#88674f', w: 7 },
    { d: 'M273 654 C274 586 280 512 303 493 C320 477 348 478 364 498 C383 522 384 577 381 652Z', fill: '#473e37', a: 0.78 },
    { d: 'M245 654 Q338 665 419 651', stroke: '#edcc9f', w: 8, a: 0.65 },
    // cracks and light edges in the stone
    { d: 'M231 456 Q324 391 411 454 M131 501 Q168 471 202 456 M449 410 Q511 432 539 479 M119 618 Q170 610 213 624 M458 626 Q525 607 576 615', stroke: '#8f6c57', w: 5, a: 0.39 },
    { d: 'M129 553 Q160 533 193 544 M440 525 Q484 516 513 528 M485 570 Q528 555 561 565 M315 372 Q366 359 404 370', stroke: '#efd0a2', w: 5, a: 0.42 },
    { d: 'M356 438 Q342 398 367 381 M355 410 Q368 418 379 410', stroke: '#81634f', w: 4, a: 0.46 },
    // a wooden cross by the door
    { d: 'M445 508 Q442 475 446 444 M428 465 Q448 461 463 465', stroke: '#705849', w: 9 },
    { d: 'M447 508 Q444 472 448 448 M429 465 Q447 463 461 465', stroke: '#c89b70', w: 3 },
    // two boulders at the foot of the rock
    { d: 'M133 677 Q170 651 208 662 Q240 671 241 696 Q181 711 128 692Z M407 676 Q445 659 472 669 Q493 682 478 700 Q428 710 400 697Z', fill: '#b29375' },
    { d: 'M135 682 Q169 666 204 673 M417 681 Q448 670 465 679', stroke: '#ead0a8', w: 4, a: 0.6 },
  ],
};
// the door opening in world units, relative to the rock anchor (for the cave.door anchor and checks)
export const ROCK_DOOR = { x: ((230 + 420) / 2 - 335) * ROCK.k, w: 190 * ROCK.k, h: (662 - 450) * ROCK.k };

const SEAT = {
  anchor: [862, 850], k: 0.0125,
  layers: [
    { d: 'M738 782 C784 758 894 764 955 774 Q997 794 984 830 C963 857 790 856 743 846 Q721 820 738 782Z', fill: '#a88e77', stroke: '#886e5e', w: 5 },
    { d: 'M740 805 Q826 782 941 800', stroke: '#d9b698', w: 6, a: 0.5 },
  ],
};

const PALM_TRUNK = [
  { d: 'M1480 744 C1456 635 1471 549 1490 476 C1503 421 1504 372 1496 319', stroke: '#876c53', w: 32 },
  { d: 'M1485 729 C1472 631 1484 553 1496 484 C1511 418 1512 371 1500 324', stroke: '#bc9367', w: 16 },
  { d: 'M1470 598 L1491 608 M1470 560 L1495 569 M1477 520 L1501 528 M1484 485 L1508 491 M1492 450 L1511 453 M1494 415 L1511 418', stroke: '#765f4d', w: 4, a: 0.5 },
];
const PALM_CROWN = [
  { d: 'M1497 328 C1460 286 1365 267 1297 304 C1373 284 1438 326 1494 349 Q1439 327 1367 339 C1436 348 1475 358 1497 328Z', fill: '#7d815e', stroke: '#727a59', w: 3 },
  { d: 'M1499 327 C1435 244 1381 216 1329 219 C1375 228 1434 275 1498 347 C1427 293 1389 285 1335 291 C1400 311 1463 338 1499 327Z', fill: '#8e9268', stroke: '#727a59', w: 3 },
  { d: 'M1493 328 C1451 244 1481 182 1506 163 C1487 235 1515 283 1506 331 C1518 269 1559 228 1608 221 C1570 264 1533 306 1493 328Z', fill: '#7d815e', stroke: '#727a59', w: 3 },
  { d: 'M1497 331 C1543 260 1590 261 1653 292 C1588 286 1553 322 1504 348 C1557 327 1602 336 1641 371 C1581 351 1544 350 1497 331Z', fill: '#898961', stroke: '#727a59', w: 3 },
  { d: 'M1496 332 C1520 325 1554 360 1552 414 C1533 377 1510 364 1496 332 C1473 353 1453 393 1447 434 C1431 387 1454 350 1496 332Z', fill: '#78805e', stroke: '#727a59', w: 3 },
  { d: 'M1499 337 Q1405 275 1328 302 M1496 334 Q1423 253 1364 224 M1498 332 Q1490 236 1504 180 M1497 335 Q1562 279 1622 290 M1498 335 Q1544 344 1621 369', stroke: '#5f7357', w: 3, a: 0.65 },
];
const PALM = { anchor: [1480, 744], top: [1497, 330], k: 0.021 };

const GRASS = { d: 'M0 0 Q-10 -12 -8 -24 M0 0 Q0 -18 7 -33 M0 0 Q13 -13 18 -14 M0 0 Q-16 -6 -21 -7', stroke: '#827b58', w: 3 };
const FLOWER = [
  { d: 'M0 30 Q-3 10 1 0 M1 3 Q-14 -7 -20 -3 Q-16 12 0 15 M0 15 Q14 -1 24 5 Q19 18 2 20', stroke: '#8a916a', w: 3 },
  { d: 'M-8 0 Q-11 -7 -5 -10 Q2 -10 3 -3 Q10 -10 14 -3 Q16 5 5 7 Q0 14 -6 8 Q-15 9 -8 0Z', fill: '#f5dec0', stroke: '#bca17c', w: 2 },
];

// ---------------------------------------------------------------- drawing helpers
const PATHS = new Map();
const path2d = (d) => { let p = PATHS.get(d); if (!p) { p = new Path2D(d); PATHS.set(d, p); } return p; };

function paintLayers(g, layers) {
  for (const L of layers) {
    const p = path2d(L.d);
    g.globalAlpha = L.a ?? 1;
    if (L.fill || L.grad) {
      if (L.grad) {
        const [[x0, y0], [x1, y1], ...stops] = L.grad;
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        for (const [c, o] of stops) gr.addColorStop(o, c);
        g.fillStyle = gr;
      } else g.fillStyle = L.fill;
      g.fill(p);
    }
    if (L.stroke) { g.strokeStyle = L.stroke; g.lineWidth = L.w || 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(p); }
  }
  g.globalAlpha = 1;
}
/** draw an SVG piece standing at world (x, z): its anchor on the ground, `k` studs per SVG unit, optional flip */
function piece(g, V, x, z, art, { k = art.k, flip = false } = {}) {
  const B = V.P(x, 0, z); if (!B) return null;
  const s = B[2] * k;
  g.save(); g.translate(B[0], B[1]); g.scale(flip ? -s : s, s); g.translate(-art.anchor[0], -art.anchor[1]);
  paintLayers(g, art.layers);
  g.restore();
  return B;
}

function palm(g, V, x, z, i, t, k = PALM.k) {
  const B = V.P(x, 0, z); if (!B) return;
  const s = B[2] * k, flip = i % 2 === 1;
  g.save(); g.translate(B[0], B[1]); g.scale(flip ? -s : s, s); g.translate(-PALM.anchor[0], -PALM.anchor[1]);
  paintLayers(g, PALM_TRUNK);
  // the crown sways gently around the top of the trunk
  const sway = 0.035 * Math.sin(t * 0.8 + i * 1.7) + 0.015 * Math.sin(t * 1.9 + i);
  g.translate(PALM.top[0], PALM.top[1]); g.rotate(sway); g.translate(-PALM.top[0], -PALM.top[1]);
  paintLayers(g, PALM_CROWN);
  g.restore();
}

function grass(g, V, x, z, sc) {
  const B = V.P(x, 0, z); if (!B) return;
  const s = B[2] * 0.03 * sc;
  g.save(); g.translate(B[0], B[1]); g.scale(s, s); g.globalAlpha = 0.75; paintLayers(g, [GRASS]); g.restore();
}
function flower(g, V, x, z, sc) {
  const B = V.P(x, 0, z); if (!B) return;
  const s = B[2] * 0.022 * sc;
  g.save(); g.translate(B[0], B[1]); g.scale(s, s); g.translate(0, -30); paintLayers(g, FLOWER); g.restore();
}
function pebble(g, V, x, z, sd) {
  const B = V.P(x, 0, z); if (!B) return;
  const s = B[2], r = rng(sd), w = (0.35 + r() * 0.55) * s, h = w * (0.35 + r() * 0.2);
  g.beginPath(); g.moveTo(B[0] - w, B[1]);
  g.quadraticCurveTo(B[0] - w * 0.8, B[1] - h * 1.4, B[0] + w * 0.1, B[1] - h * 1.2);
  g.quadraticCurveTo(B[0] + w * 0.9, B[1] - h, B[0] + w, B[1]);
  g.quadraticCurveTo(B[0], B[1] + h * 0.35, B[0] - w, B[1]); g.closePath();
  g.fillStyle = mix('#ac8a70', '#a78a74', r()); g.globalAlpha = 0.8; g.fill(); g.globalAlpha = 1;
  g.beginPath(); g.moveTo(B[0] - w * 0.6, B[1] - h * 0.8); g.quadraticCurveTo(B[0], B[1] - h * 1.25, B[0] + w * 0.5, B[1] - h * 0.9);
  g.strokeStyle = rgba('#ead0a8', 0.55); g.lineWidth = Math.max(1, 0.06 * s); g.stroke();
}
/** a soft shadow lying on the sand (blurred ellipse) */
function softShadow(g, V, x, z, w, a = 0.18) {
  const B = V.P(x, 0, z); if (!B) return;
  const s = B[2];
  const gr = g.createRadialGradient(B[0], B[1], 0, B[0], B[1], w * s);
  gr.addColorStop(0, `rgba(102,83,68,${a})`); gr.addColorStop(1, 'rgba(102,83,68,0)');
  g.save(); g.translate(B[0], B[1]); g.scale(1, 0.16); g.translate(-B[0], -B[1]);
  g.fillStyle = gr; g.fillRect(B[0] - w * s, B[1] - w * s, 2 * w * s, 2 * w * s); g.restore();
}

// the gully (râpă): a dip in the sand between two sandstone boulders; someone sitting in it is half hidden by the front lip
function boulder(g, V, x, z, w, h, sd, light = 0) {
  const B = V.P(x, 0, z); if (!B) return;
  const s = B[2], r = rng(sd);
  const pts = [[-w, 0], [-w * 0.95, -h * 0.55], [-w * 0.6, -h * (0.95 + r() * 0.1)], [-w * 0.1, -h], [w * 0.45, -h * (0.9 + r() * 0.1)], [w * 0.9, -h * 0.6], [w, 0]];
  g.beginPath(); g.moveTo(B[0] + pts[0][0] * s, B[1]);
  for (let i = 1; i < pts.length; i++) { const p = pts[i - 1], q = pts[i]; g.quadraticCurveTo(B[0] + p[0] * s, B[1] + p[1] * s, B[0] + (p[0] + q[0]) / 2 * s, B[1] + (p[1] + q[1]) / 2 * s); }
  g.lineTo(B[0] + w * s, B[1]); g.closePath();
  const gr = g.createLinearGradient(B[0] - w * s, B[1] - h * s, B[0] + w * s, B[1]);
  gr.addColorStop(0, shade('#d4b089', light)); gr.addColorStop(0.55, shade('#b8916d', light)); gr.addColorStop(1, shade('#a07a5e', light));
  g.fillStyle = gr; g.fill(); g.strokeStyle = '#a07a5c'; g.lineWidth = Math.max(1, 0.09 * s); g.lineJoin = 'round'; g.stroke();
  g.beginPath(); g.moveTo(B[0] - w * 0.75 * s, B[1] - h * 0.6 * s); g.quadraticCurveTo(B[0] - w * 0.4 * s, B[1] - h * 0.95 * s, B[0] + w * 0.1 * s, B[1] - h * 0.92 * s);
  g.strokeStyle = rgba('#efd0a2', 0.5); g.lineWidth = Math.max(1, 0.12 * s); g.stroke();
  g.beginPath(); g.moveTo(B[0] + w * 0.2 * s, B[1] - h * 0.3 * s); g.quadraticCurveTo(B[0] + w * 0.5 * s, B[1] - h * 0.5 * s, B[0] + w * 0.75 * s, B[1] - h * 0.35 * s);
  g.strokeStyle = rgba('#8f6c57', 0.35); g.lineWidth = Math.max(1, 0.08 * s); g.stroke();
}

// ---------------------------------------------------------------- sprites of the set
export function hermitageSprites(layout) {
  const out = [];
  for (const rk of layout.rocks) {
    const zf = rk.z + rk.d / 2;
    out.push({ z: rk.z - rk.d / 2, draw: (g, V) => softShadow(g, V, rk.x + 1, zf - 0.6, rk.w * 0.62, 0.22) });
    out.push({ z: zf, solid: [rk.x - rk.w / 2, rk.z - rk.d / 2, rk.x + rk.w / 2, zf], draw: (g, V) => piece(g, V, rk.x, zf, ROCK) });
  }
  if (layout.seat) {
    const S = layout.seat;
    // drawn just in front of the person sitting on it (the stone hides the hem of the robe, like in the reference)
    out.push({ z: S.z - 1, draw: (g, V) => softShadow(g, V, S.x, S.z + 0.2, 2.6, 0.2) });
    out.push({ z: S.z + 0.35, draw: (g, V) => piece(g, V, S.x, S.z + 0.35, SEAT) });
  }
  if (layout.ravine) {
    const { x, z } = layout.ravine;
    out.push({ z: z - 3.5, draw: (g, V) => { boulder(g, V, x - 3.6, z - 3.2, 3.6, 4.4, 5, 0.04); boulder(g, V, x + 3.8, z - 2.6, 4.2, 5.2, 9); } });
    out.push({ z: z - 2.2, draw: (g, V) => boulder(g, V, x + 0.4, z - 2.4, 2.6, 2.6, 13, 0.08) });
    // the front lip of the gully: low stones that hide the legs of someone sitting in it
    out.push({ z: z + 1.0, draw: (g, V) => { boulder(g, V, x - 2.4, z + 1.0, 2.2, 1.25, 17, 0.06); boulder(g, V, x + 2.1, z + 1.1, 2.0, 1.0, 21, 0); } });
  }
  layout.palms.forEach(([x, z], i) => {
    out.push({ z: z - 0.5, draw: (g, V) => softShadow(g, V, x + 1.5, z, 3.2, 0.16) });
    out.push({ z, draw: (g, V, t) => palm(g, V, x, z, i, t) });
  });
  // scattered pebbles, grass tufts and little desert flowers, kept off the rock, the seat and the gully
  const r = rng(29);
  const clear = (x, z) => layout.rocks.some((k) => Math.abs(x - k.x) < k.w / 2 + 1 && z > k.z - k.d / 2 - 1 && z < k.z + k.d / 2 + 2.5)
    || (layout.seat && Math.abs(x - layout.seat.x) < 4 && Math.abs(z - layout.seat.z) < 3)
    || (layout.ravine && Math.abs(x - layout.ravine.x) < 8 && Math.abs(z - layout.ravine.z) < 5)
    || (Math.abs(x - layout.anchors.cave.pos[0]) < 4 && z > layout.anchors.cave.pos[1] - 1);
  for (let i = 0; i < 46; i++) {
    const x = (r() - 0.5) * 96, z = -26 + r() * 38, kind = r(), sd = Math.floor(r() * 1000), sc = 0.7 + r() * 0.8;
    if (clear(x, z)) continue;
    if (Math.abs(x) < 7 && z > -4 && z < 6) continue; // the open middle stays clear for the people
    out.push({ z: z - 0.05, draw: (g, V) => (kind < 0.4 ? pebble(g, V, x, z, sd) : kind < 0.82 ? grass(g, V, x, z, sc) : flower(g, V, x, z, sc)) });
  }
  return out;
}

// ---------------------------------------------------------------- sky details
/** soft wisps of cloud (the reference's pale streaks) instead of round cartoon clouds, and a few far birds */
export function wisps(g, V, t, warm) {
  const { W, H } = V, u = H / 1080, hor = V.horizon();
  const r = rng(41);
  for (let i = 0; i < 6; i++) {
    const span = W * 1.9;
    const x = (((r() * span + t * (4 + r() * 4) * u - V.cam.x * 2.5 * u) % span) + span) % span - W * 0.45;
    const y = (0.12 + r() * 0.32) * Math.max(220 * u, hor), s = (0.8 + r() * 0.7) * u;
    g.save(); g.translate(x, y); g.scale(s, s);
    g.globalAlpha = 0.5;
    g.fillStyle = warm ? '#ffe6cf' : '#fff5df';
    g.fill(path2d('M-140 10 C-77 -19 -24 -5 27 -6 C82 -3 123 -19 150 -37 C112 12 53 30 -1 14 C-53 1 -90 14 -140 10Z'));
    g.restore();
  }
  // two pairs of birds gliding far away
  for (const [bx, by, ph] of [[0.62, 0.3, 0], [0.66, 0.34, 1.3]]) {
    const x = W * bx + 30 * u * Math.sin(t * 0.25 + ph) - V.cam.x * 2 * u, y = Math.min(hor - 30 * u, H * by) + 6 * u * Math.sin(t * 0.6 + ph);
    const f = 3 * Math.sin(t * 2.4 + ph);
    g.save(); g.translate(x, y); g.scale(u * 1.2, u * 1.2);
    g.strokeStyle = 'rgba(153,137,118,0.7)'; g.lineWidth = 3.3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-25, 0); g.quadraticCurveTo(-14, -13 - f, 0, -2); g.quadraticCurveTo(12, -14 - f, 25, -8); g.stroke();
    g.beginPath(); g.moveTo(37, 20); g.quadraticCurveTo(49, 12 - f, 61, 22); g.quadraticCurveTo(70, 13 - f, 82, 16); g.stroke();
    g.restore();
  }
}

/** a gentle warm vignette over the whole picture: the soft edges of a painted page */
export function vignette(g, W, H) {
  const gr = g.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.45, W / 2, H * 0.5, Math.max(W, H) * 0.75);
  gr.addColorStop(0, 'rgba(120,90,60,0)'); gr.addColorStop(1, 'rgba(120,90,60,0.18)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
}
void ellipse;
