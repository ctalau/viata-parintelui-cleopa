// The people of the "pateric" style (film-wide "style": "pateric"): drawn like the reference drawing of film 025
// (videos/025-pimen-si-fratele-alungat/design/reference.svg), NOT like the storybook character of figure.js:
// monks in a deep hood, a narrow face with fine features, a flowing beard, a shoulder capelet, a wide bell-shaped robe
// that pools on the ground, big sleeves with small hands, soft gradients, outlines a shade darker than each fill.
//
// The shapes are the reference's own SVG paths. The skeleton of figure.js (posePerson) still poses the person, so
// gestures, walking, turning, nodding, bowing and holding props all keep working:
//   * robe + capelet + folds: one of the three reference bodies (standing brother, seated elder, kneeling young brother),
//     every point mapped through the skeleton (pose.pt: turn, bow, lowering); below the waist the robe is stretched down
//     to the ground, so it always stands / pools on the sand whatever the posture;
//   * head: the reference head (hood, face, ears, beard) drawn on pose.head, mirrored to the side the person faces;
//     eyes, brows and mouth follow the emotion and the voice (lip-sync);
//   * arms: big sleeves along the skeleton's shoulder → elbow → wrist, the reference hand at the end.
// Pure function of (look, pose).
import { col, shade, mix, rgba } from './paint.js';

const WAIST = 1.45, HEADC = 3.54;   // skeleton (figure.js): waist height, head centre (standing, headScale 1)

// ---------------------------------------------------------------- the three reference bodies
// h = head centre in SVG units, k = studs per SVG unit, bottom = lowest SVG y, nat = the side it faces (+1 = right)
const BODIES = {
  stand: {
    h: [512, 520], k: 0.0096, bottom: 900, nat: 1,
    robe: 'M452 590 C416 619 405 688 403 735 C395 789 391 831 369 874 Q446 902 516 893 C572 901 621 889 671 875 C648 830 637 764 636 707 C639 642 594 588 553 579Z',
    light: 'M428 631 C405 695 418 795 390 868 Q442 874 471 880 C447 819 459 726 459 675Z',
    dark: 'M557 593 C598 658 607 773 638 871 L588 882 C576 778 556 709 526 635Z',
    folds: 'M460 706 Q452 793 450 880 M523 717 Q520 798 533 885 M583 733 Q592 817 610 873',
    belt: 'M437 725 Q515 744 614 722', cord: 'M526 733 Q529 772 524 788 M526 735 Q543 763 546 775',
    feet: 'M405 878 Q431 877 456 881 Q457 895 428 900 L388 891Z M564 887 Q590 882 614 880 Q638 897 602 902 L557 897Z',
    cape: 'M453 584 C476 606 523 623 561 584 C585 603 599 629 594 667 Q558 678 531 652 Q490 674 435 659 C424 629 431 608 453 584Z',
    capeLines: 'M457 592 Q478 605 498 605 M543 602 Q557 597 566 587',
  },
  sit: {
    h: [837, 458], k: 0.0077, bottom: 892, nat: 1,
    robe: 'M778 535 C722 552 698 626 700 709 C705 775 676 844 687 872 Q756 902 837 886 Q947 915 1006 866 Q972 801 976 710 C977 620 938 556 882 540Z',
    light: 'M753 591 C715 648 740 776 712 865 L778 878 Q757 801 764 739 Q766 652 788 602Z',
    dark: 'M879 555 C914 617 941 723 934 792 Q928 838 955 876 L997 866 Q972 786 973 689 Q968 599 910 556Z',
    lap: 'M737 829 C769 797 807 784 848 796 C878 783 927 798 952 831 L970 874 Q902 893 856 876 Q768 899 698 869Z',
    folds: 'M731 865 Q772 834 820 853 M843 871 Q854 833 894 824 M923 857 Q929 835 946 834 M768 738 Q774 803 751 855',
    cape: 'M783 548 C808 576 839 619 851 646 C863 609 876 577 901 551 C934 568 947 589 948 629 C931 682 899 703 849 708 C798 706 761 672 749 626 C744 592 756 568 783 548Z',
    capeLines: 'M784 557 Q818 590 846 655 M898 561 Q870 591 854 656',
    capeDark: 'M843 636 Q848 696 833 756',
  },
  kneel: {
    h: [1165, 517], k: 0.0096, bottom: 897, nat: -1,
    robe: 'M1132 602 C1088 625 1085 681 1118 734 C1103 761 1058 811 1045 865 C1131 902 1265 896 1383 872 C1389 827 1361 802 1326 785 C1272 750 1258 676 1234 624 C1205 600 1169 587 1132 602Z',
    light: 'M1135 720 Q1075 785 1052 866 Q1110 888 1175 883 Q1158 821 1191 767Z',
    dark: 'M1221 638 Q1230 741 1306 798 Q1362 826 1371 865 Q1321 880 1264 879 Q1281 820 1209 778Z',
    folds: 'M1080 867 Q1144 842 1199 865 M1163 880 Q1188 822 1224 792 M1255 874 Q1265 836 1296 822 M1315 849 Q1337 841 1359 853',
    hemLight: 'M1095 877 Q1148 890 1209 885 M1252 881 Q1331 884 1376 870',
    cape: 'M1108 578 Q1133 606 1166 588 Q1190 584 1207 592 C1230 613 1236 636 1224 670 C1211 688 1173 699 1141 694 Q1100 683 1089 645 C1084 624 1091 596 1108 578Z',
    capeLines: 'M1112 591 Q1139 615 1170 604 M1200 600 Q1182 619 1177 650',
    capeDark: 'M1113 653 Q1137 678 1172 679',
  },
};

// ---------------------------------------------------------------- the two reference heads
// c = hood centre, r = hood half-width (SVG units) → scaled so the hood fills the skeleton's head circle
const HEADS = {
  // the brother with the jug: a narrow face in a deep hood, a short beard (or none)
  brother: {
    c: [512, 522], r: 77,
    hood: 'M446 572 C433 544 436 508 449 480 C461 455 483 443 515 443 C551 443 570 474 579 501 C590 535 570 581 560 598 Q516 619 458 596Z',
    hoodLight: 'M454 520 C450 488 471 465 499 459 C475 483 471 522 473 555 Q454 554 454 520Z',
    face: 'M479 497 C495 482 527 480 546 498 C553 520 550 552 536 569 Q516 583 493 560 C480 544 476 515 479 497Z',
    ears: 'M478 523 C470 517 465 529 477 543 M550 526 Q557 519 558 531 Q556 540 549 542',
    beard: 'M485 542 C484 556 489 583 504 594 C516 600 537 594 546 573 Q551 558 547 542 Q529 555 518 551 Q506 558 485 542Z',
    strands: 'M492 548 Q505 568 509 575 M537 552 Q526 571 527 580',
    box: [478, 482, 551, 583],
    eyes: [[500, 526], [531, 526]], eyeW: 9, brows: [[499, 513], [531, 514]], browW: 10,
    nose: 'M516 521 Q514 537 520 541 Q524 543 528 539', noseTip: [517, 538], mouth: [517, 555], mouthW: 9, cheeks: [[496, 540], [538, 540]],
  },
  // the old Avva: a rounder hood, a bigger face, white bushy brows, a long fanned beard with a moustache
  elder: {
    c: [837, 466], r: 96,
    hood: 'M765 500 C741 459 754 412 781 388 C806 363 854 361 885 381 C919 402 933 458 908 503 Q897 532 879 562 C835 583 783 553 765 500Z',
    hoodLight: 'M775 484 Q758 423 794 395 C825 374 867 379 882 397 C847 388 809 406 796 439 Q788 476 792 493Z',
    hoodLine: 'M893 409 Q920 461 896 511',
    face: 'M789 443 C793 415 819 397 848 402 C875 409 888 439 884 468 Q881 511 861 528 Q838 543 812 524 C793 507 787 474 789 443Z',
    ears: 'M794 460 Q778 447 778 465 Q782 478 792 480 M881 458 Q893 448 891 469 Q888 477 882 479',
    beard: 'M792 484 C794 511 789 543 803 559 Q809 574 823 582 Q824 593 836 604 Q842 590 854 583 C870 570 881 541 882 482 Q871 506 856 513 Q840 507 830 510 Q813 502 792 484Z',
    strands: 'M798 498 Q809 521 803 544 M815 515 Q824 541 823 564 M836 520 Q835 558 837 583 M855 520 Q858 555 846 575 M875 501 Q867 540 860 550',
    moustache: 'M824 493 Q837 488 849 493 M823 498 Q837 502 851 496',
    box: [788, 400, 888, 540],
    eyes: [[812, 459], [861, 458]], eyeW: 13, brows: [[810, 437], [861, 437]], browW: 14, browThick: 5.8,
    nose: 'M837 447 Q832 466 836 477 Q842 482 851 477', noseTip: [838, 475], mouth: [839, 508], mouthW: 13, cheeks: [[816, 472], [866, 470]],
  },
};

// ---------------------------------------------------------------- tiny SVG path reader (absolute M L C Q Z only)
const PARSED = new Map();
function parse(d) {
  let r = PARSED.get(d); if (r) return r;
  r = [];
  const tok = d.match(/[MLCQZ]|-?[\d.]+/g);
  let cmd = null, i = 0;
  const n = { M: 2, L: 2, C: 6, Q: 4, Z: 0 };
  while (i < tok.length) {
    if (/[MLCQZ]/.test(tok[i])) cmd = tok[i++];
    if (cmd === 'Z') { r.push(['Z']); continue; }
    const a = tok.slice(i, i + n[cmd]).map(Number); i += n[cmd];
    r.push([cmd, ...a]);
    if (cmd === 'M') cmd = 'L';
  }
  PARSED.set(d, r); return r;
}
/** trace an SVG path through a point map f([x, y]) → [X, Y] */
function trace(g, d, f) {
  g.beginPath();
  for (const [c, ...a] of parse(d)) {
    if (c === 'M') { const p = f(a[0], a[1]); g.moveTo(p[0], p[1]); }
    else if (c === 'L') { const p = f(a[0], a[1]); g.lineTo(p[0], p[1]); }
    else if (c === 'Q') { const p = f(a[0], a[1]), q = f(a[2], a[3]); g.quadraticCurveTo(p[0], p[1], q[0], q[1]); }
    else if (c === 'C') { const p = f(a[0], a[1]), q = f(a[2], a[3]), s = f(a[4], a[5]); g.bezierCurveTo(p[0], p[1], q[0], q[1], s[0], s[1]); }
    else g.closePath();
  }
}
const P2 = new Map();
const path2d = (d) => { let p = P2.get(d); if (!p) { p = new Path2D(d); P2.set(d, p); } return p; };

// ---------------------------------------------------------------- colours of a look
function palette(look) {
  const robe = col(look.robe, '#625b49');
  const cape = look.mantle ? col(look.mantle === true ? shade(robe, 0.12) : look.mantle) : shade(robe, 0.14);
  const hood = col(look.hatColor || shade(robe, -0.2));
  return {
    robe, robeL: shade(robe, 0.25), robeD: mix(robe, '#3a3a30', 0.22), robeInk: mix(robe, '#2e2a24', 0.32),
    cape, capeL: shade(cape, 0.5), capeInk: mix(cape, '#2e2a24', 0.32),
    hood, hoodInk: mix(hood, '#2a2622', 0.3), hoodL: shade(hood, 0.55),
    skin: col(look.skin, '#efc8a4'), beard: col(look.beardColor || '#6c5a4a'), belt: col(look.belt || '#bba47e'),
    sandal: '#655548',
  };
}

// ---------------------------------------------------------------- layers
// The depth order of one person's parts: robe 0 · capelet 0.04 · arms at rest (ALWAYS under the hood drape, even when
// breathing / bouncing brings them forward — else the drape blinks in and out) · hood drape 0.35 · head 0.5 · raised
// arms above. Exported for the `layers` check (checks2d.js), which flags any arm / prop whose layer blinks or hides it.
export const LAYER = { drape: 0.35, head: 0.5 };
export const bodyKind = (pose) => (pose.posture === 'kneel' ? 'kneel' : pose.posture === 'sit' || pose.lap > 0.5 ? 'sit' : 'stand');
export function armLayers(pose, kind, holds = {}) {
  const out = {};
  for (const side of ['R', 'L']) {
    const A = pose.arms[side];
    let d = Math.min(0.3, (A.S[2] + A.H[2]) / 2 + 0.06), dh = d;
    const raised = A.H[1] - pose.lower > 2.35;
    // a hand raised beside the hood: the sleeve behind the head; a hand AT the face (wipe the brow, think, eat, the sign
    // of the cross): the whole arm in front, so the hand never floats over the face without its sleeve
    const atFace = Math.abs(A.H[0] - pose.head[0]) < pose.head[2] * 1.05 && A.H[1] > pose.head[1] - pose.head[2] * 1.1;
    const shaped = !!pose.handShape?.[side];
    if (shaped || raised) { d = 0.45; dh = 0.6; }
    if (pose.handShape?.[side] === 'cross' || ((raised || shaped) && atFace)) { d = 0.55; dh = 0.6; }
    if (kind !== 'stand' && d > -0.1) { d = Math.max(d, 0.07); dh = Math.max(dh, 0.07); }   // hands in the lap
    if (holds[side]) dh = Math.max(dh, 0.52);   // a held prop (candle, book) in front of the beard / hood
    out[side] = { d, dh, raised, atFace };
  }
  return out;
}

// ---------------------------------------------------------------- the person
export function drawPateric(g, look, poseIn, opts, lw0) {
  let pose = poseIn;
  const C = palette(look);
  const kind = bodyKind(pose);
  const B = BODIES[kind];
  const face = Math.sin(pose.yaw);
  const dir = Math.abs(face) < 0.12 ? B.nat : Math.sign(face);   // the side the person faces on screen
  const m = dir === B.nat ? 1 : -1;                                // mirror the reference body to it
  // a hug: the two stand turned to each other (the three-quarter drawing ≈ 45° to the camera), lean in, their heads
  // come together temple to temple (never face to face) and the arms go around the other one's shoulders and back
  if (pose.p?.hugOn && kind === 'stand' && !pose.back) {
    const e = Math.min(1, pose.p.hug || 0), f = dir;
    g.rotate(-f * 0.07 * e);                                   // the body leans in, from the feet
    const [hx, hy, R] = pose.head;
    const arms = {};
    for (const side of ['R', 'L']) {
      const A0 = pose.arms[side], lead = Math.sign(A0.S[0] * f) >= 0 ? 1 : 0;   // the arm on the partner's side goes high
      // the one in front: high arm over the other's shoulder, low arm round the waist; the one behind: the high hand
      // lies flat on the back of the one in front (drawn again over him: opts.only = 'hugHand'), the low one is hidden
      const back = opts.hugBack;
      const H1 = lead ? (back ? [f * 2.45, 2.15, 0.3] : [f * 2.15, 2.62, 0.3]) : [f * 0.45, 2.0, 0.3];   // the far arm stays behind the own body
      const E1 = lead ? (back ? [f * 1.3, 2.3, 0.3] : [f * 1.05, 2.32, 0.3]) : [f * 0.3, 1.9, 0.3];
      const H = A0.H.map((v, k) => v + (H1[k] - v) * e), E = A0.E.map((v, k) => v + (E1[k] - v) * e);
      const dx = H[0] - E[0], dy = H[1] - E[1], l = Math.hypot(dx, dy) || 1;
      arms[side] = { ...A0, E, H, W: [H[0] - dx / l * 0.12, H[1] - dy / l * 0.12, H[2]], hidden: !lead };   // one hand in front, one behind
    }
    pose = { ...pose, arms, handShape: {}, head: [hx + f * 0.42 * e, hy - 0.12 * e, R], hugTilt: -f * 0.22 * e };
    if (opts.only === 'hugHand') {   // just the hand (and the end of its sleeve) on the other one's back
      const side = ['R', 'L'].find((sd) => Math.sign(poseIn.arms[sd].S[0] * f) >= 0) || 'R', A = arms[side];
      g.save(); g.beginPath(); g.arc(A.H[0], A.H[1], 0.42, 0, Math.PI * 2); g.clip();
      sleeve(g, C, A, pose); g.restore();
      hand(g, C, A, pose, null);
      return;
    }
  }
  const sway = pose.walkAmt * 0.12 * Math.sin(pose.walkPhase * 2);
  const yBot = HEADC - (B.bottom - B.h[1]) * B.k;
  const map = (x, y) => {
    const xl = m * (x - B.h[0]) * B.k, yl = HEADC - (y - B.h[1]) * B.k;
    if (yl >= WAIST) { const p = pose.pt(xl, yl, 0.05); return [p[0], p[1]]; }
    const w = pose.pt(xl, WAIST, 0), u = Math.min(1.15, (WAIST - yl) / (WAIST - yBot));
    return [w[0] + sway * u, w[1] * (1 - u)];
  };
  const parts = [];
  const layers = armLayers(pose, kind, opts.holds);
  for (const side of ['R', 'L']) {
    const A = pose.arms[side];
    let { d, dh } = layers[side];
    if (A.hidden) { d = -0.05; dh = -0.049; }   // a hug: the far arm goes round the other one's back, out of sight
    parts.push({ d, draw: () => sleeve(g, C, A, pose) });
    parts.push({ d: dh + 0.001, draw: () => hand(g, C, A, pose, opts.hold) });
  }
  parts.push({ d: 0, draw: () => body(g, C, B, map, pose, kind) });
  if (!pose.back && look.mantle !== false) parts.push({ d: 0.04, draw: () => cape(g, C, B, map) });
  // lay people (`hat: "none"`): no hood — a bare head with hair and a neck; a woman's `headscarf` is the hood in a lighter cloth
  if (look.hat === 'none') parts.push({ d: 0.35, draw: () => neck(g, C, pose) });
  else parts.push({ d: 0.35, draw: () => drape(g, C, pose) });
  parts.push({ d: 0.5, draw: () => head(g, look, C, pose, dir) });
  parts.sort((a, b) => a.d - b.d);
  for (const x of parts) x.draw();
  void lw0;
}

function body(g, C, B, map, pose, kind) {
  const k = B.k;
  // the robe: a gradient from the lit shoulder to the shaded hem, outlined a shade darker
  trace(g, B.robe, map);
  const top = map(B.h[0] - 60, B.h[1] + 60), bot = map(B.h[0] + 120, B.bottom);
  const gr = g.createLinearGradient(top[0], top[1], bot[0], bot[1]);
  gr.addColorStop(0, C.robeL); gr.addColorStop(0.5, C.robe); gr.addColorStop(1, C.robeD);
  g.fillStyle = gr; g.fill();
  g.lineWidth = 6 * k; g.strokeStyle = C.robeInk; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke();
  g.save(); trace(g, B.robe, map); g.clip();
  trace(g, B.light, map); g.fillStyle = rgba(mix(C.robe, '#e9dcbc', 0.55), 0.28); g.fill();
  trace(g, B.dark, map); g.fillStyle = rgba('#262c28', 0.3); g.fill();
  if (B.lap) { trace(g, B.lap, map); g.fillStyle = shade(C.robe, 0.02); g.fill(); g.lineWidth = 4 * k; g.strokeStyle = C.robeInk; g.stroke(); }
  trace(g, B.folds, map); g.lineWidth = 5 * k; g.strokeStyle = rgba(kind === 'sit' ? mix(C.robe, '#e0d4b8', 0.5) : '#30352f', kind === 'sit' ? 0.4 : 0.34); g.stroke();
  if (B.hemLight) { trace(g, B.hemLight, map); g.lineWidth = 4 * k; g.strokeStyle = rgba('#d5b38d', 0.45); g.stroke(); }
  g.restore();
  if (B.belt) {
    trace(g, B.belt, map); g.lineWidth = 8 * k; g.strokeStyle = C.belt; g.stroke();
    trace(g, B.cord, map); g.lineWidth = 5 * k; g.strokeStyle = shade(C.belt, 0.15); g.stroke();
  }
  // sandals peeking under the hem (they step with the walk)
  if (B.feet && pose.lap < 0.5) {
    for (const [side, sx] of [['L', -1], ['R', 1]]) {
      const f = pose.feet[side], x = f[0] + sx * 0.18, y = f[1];
      g.beginPath(); g.moveTo(x - 0.26, y + 0.07); g.quadraticCurveTo(x, y + 0.13, x + 0.26, y + 0.06);
      g.quadraticCurveTo(x + 0.3, y - 0.08, x + 0.02, y - 0.1); g.lineTo(x - 0.28, y - 0.05); g.closePath();
      g.fillStyle = C.sandal; g.fill();
    }
  }
}

// the hood does not stop at the chin: it falls over both shoulders down to the chest (behind the beard), so the head,
// the hood and the body are one piece — like the reference, where the hood's lower edge lies on the capelet
function drape(g, C, pose) {
  const [hx, hy, R] = pose.head;
  const P = (x, y) => { const p = pose.pt(x, y, 0.08); return [p[0], p[1]]; };
  const L0 = [hx - R * 0.96, hy - R * 0.05], R0 = [hx + R * 0.96, hy - R * 0.05];
  const sl = P(-0.74, 2.5), sr = P(0.74, 2.5), bl = P(-0.5, 2.12), br = P(0.5, 2.12), bm = P(0, 1.98);
  g.beginPath();
  g.moveTo(L0[0], L0[1]);
  g.bezierCurveTo(L0[0] - R * 0.08, L0[1] - R * 0.55, sl[0] + R * 0.05, sl[1] + R * 0.35, sl[0], sl[1]);   // down the side to the shoulder
  g.quadraticCurveTo(sl[0] - 0.02, bl[1] + 0.08, bl[0], bl[1]);                                                // round over the shoulder
  g.quadraticCurveTo(bm[0] - 0.25, bm[1] - 0.02, bm[0], bm[1]);                                               // the soft lower edge on the chest
  g.quadraticCurveTo(bm[0] + 0.25, bm[1] - 0.02, br[0], br[1]);
  g.quadraticCurveTo(sr[0] + 0.02, br[1] + 0.08, sr[0], sr[1]);
  g.bezierCurveTo(sr[0] - R * 0.05, sr[1] + R * 0.35, R0[0] + R * 0.08, R0[1] - R * 0.55, R0[0], R0[1]);
  g.quadraticCurveTo(hx, hy + R * 0.2, L0[0], L0[1]);                                                          // closed behind the head
  g.closePath();
  const gr = g.createLinearGradient(sl[0], hy, sr[0], bm[1]);
  gr.addColorStop(0, shade(C.hood, 0.12)); gr.addColorStop(0.55, C.hood); gr.addColorStop(1, shade(C.hood, -0.12));
  g.fillStyle = gr; g.fill(); g.lineWidth = 0.05; g.strokeStyle = C.hoodInk; g.lineJoin = 'round'; g.stroke();
  // soft folds of the cloth falling from the hood
  g.lineWidth = 0.035; g.lineCap = 'round';
  for (const [x0, x1, a] of [[-0.55, -0.32, 0.4], [0.5, 0.3, 0.25]]) {
    const p0 = P(x0, 2.55), p1 = P(x1, 2.12);
    g.beginPath(); g.moveTo(p0[0], p0[1]); g.quadraticCurveTo(p0[0] + (p1[0] - p0[0]) * 0.2, (p0[1] + p1[1]) / 2, p1[0], p1[1]);
    g.strokeStyle = rgba(C.hoodL, a); g.stroke();
  }
}

// a bare neck between the head and the robe (people without a hood), with a simple round collar of the tunic
function neck(g, C, pose) {
  const [hx, hy, R] = pose.head;
  const P = (x, y) => { const p = pose.pt(x, y, 0.08); return [p[0], p[1]]; };
  const a = P(-0.2, 2.6), b = P(0.2, 2.6);
  g.beginPath(); g.moveTo(hx - R * 0.3, hy - R * 0.4); g.lineTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.lineTo(hx + R * 0.3, hy - R * 0.4); g.closePath();
  g.fillStyle = shade(C.skin, -0.1); g.fill();
  const l = P(-0.42, 2.66), r = P(0.42, 2.66), m = P(0, 2.48);
  g.beginPath(); g.moveTo(l[0], l[1]); g.quadraticCurveTo(m[0], m[1] - 0.12, r[0], r[1]); g.lineWidth = 0.09; g.strokeStyle = C.capeInk; g.lineCap = 'round'; g.stroke();
}

function cape(g, C, B, map) {
  const k = B.k;
  trace(g, B.cape, map);
  const a = map(B.h[0] - 70, B.h[1] + 60), b = map(B.h[0] + 80, B.h[1] + 180);
  const gr = g.createLinearGradient(a[0], a[1], b[0], b[1]);
  gr.addColorStop(0, shade(C.cape, 0.12)); gr.addColorStop(1, shade(C.cape, -0.12));
  g.fillStyle = gr; g.fill(); g.lineWidth = 5 * k; g.strokeStyle = C.capeInk; g.stroke();
  trace(g, B.capeLines, map); g.lineWidth = 4.5 * k; g.strokeStyle = rgba(C.capeL, 0.62); g.stroke();
  if (B.capeDark) { trace(g, B.capeDark, map); g.lineWidth = 4.5 * k; g.strokeStyle = rgba(C.capeInk, 0.5); g.stroke(); }
}

// a big sleeve along shoulder → elbow → wrist: narrow at the shoulder, wide open at the cuff
function sleeve(g, C, A, pose) {
  const pts = [A.S, A.E, A.W], wid = [0.2, 0.24, 0.32];
  const far = A.S[2] + A.H[2] < -0.15;
  const nrm = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(2, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  });
  const L = pts.map((p, i) => [p[0] + nrm[i][0] * wid[i], p[1] + nrm[i][1] * wid[i]]);
  const R = pts.map((p, i) => [p[0] - nrm[i][0] * wid[i] * 0.85, p[1] - nrm[i][1] * wid[i] * 0.85]);
  const dW = [A.W[0] - A.E[0], A.W[1] - A.E[1]], lW = Math.hypot(dW[0], dW[1]) || 1, u = [dW[0] / lW, dW[1] / lW];
  g.beginPath(); g.moveTo(L[0][0], L[0][1]);
  g.quadraticCurveTo(L[1][0], L[1][1], L[2][0], L[2][1]);
  g.quadraticCurveTo(A.W[0] + u[0] * 0.14, A.W[1] + u[1] * 0.14, R[2][0], R[2][1]);   // the round open cuff
  g.quadraticCurveTo(R[1][0], R[1][1], R[0][0], R[0][1]);
  // the round shoulder cap: bulges AWAY from the elbow (an arc with a fixed direction made a little loop — a dark
  // ring at the elbow — whenever the arm was raised)
  { const vx = A.S[0] - A.E[0], vy = A.S[1] - A.E[1], vl = Math.hypot(vx, vy) || 1;
    g.quadraticCurveTo(A.S[0] + vx / vl * wid[0] * 1.6, A.S[1] + vy / vl * wid[0] * 1.6, L[0][0], L[0][1]); }
  g.closePath();
  const gr = g.createLinearGradient(A.S[0], A.S[1], A.W[0], A.W[1]);
  gr.addColorStop(0, far ? shade(C.cape, -0.25) : shade(C.cape, 0.05)); gr.addColorStop(1, far ? shade(C.cape, -0.35) : shade(C.cape, -0.12));
  g.fillStyle = gr; g.fill(); g.lineWidth = 0.05; g.strokeStyle = C.capeInk; g.lineJoin = 'round'; g.stroke();
  // a light fold along the sleeve, the dark inside of the cuff
  g.beginPath(); g.moveTo(lerpP(A.S, A.E, 0.4, nrm[1], 0.05)[0], lerpP(A.S, A.E, 0.4, nrm[1], 0.05)[1]);
  const q = lerpP(A.E, A.W, 0.7, nrm[2], 0.1); g.quadraticCurveTo(A.E[0], A.E[1], q[0], q[1]);
  g.lineWidth = 0.04; g.strokeStyle = rgba(C.capeL, 0.5); g.stroke();
  g.beginPath(); g.ellipse(A.W[0] + u[0] * 0.03, A.W[1] + u[1] * 0.03, wid[2] * 0.85, 0.07, Math.atan2(nrm[2][1], nrm[2][0]), 0, Math.PI * 2);
  g.fillStyle = mix(C.robe, '#1f2420', 0.55); g.fill();
}
const lerpP = (a, b, t, n, o) => [a[0] + (b[0] - a[0]) * t + n[0] * o, a[1] + (b[1] - a[1]) * t + n[1] * o];

// the reference hand: a small soft hand with two finger lines, turned along the forearm
const HAND = 'M619 734 Q637 736 652 744 Q658 753 652 762 Q639 770 622 760 Q614 756 612 746Z';
const HAND_LINES = 'M622 745 Q636 750 650 750 M621 753 Q635 758 648 758';
function hand(g, C, A, pose, hold) {
  if (hold) hold(A.side, A.H[0], A.H[1], A.H[2]);
  const dx = A.H[0] - A.W[0], dy = A.H[1] - A.W[1];
  const ang = Math.atan2(dy, dx), k = 0.0088;
  g.save(); g.translate(A.H[0], A.H[1]); g.rotate(ang); g.scale(k, -k * (Math.cos(ang) < 0 ? -1 : 1)); g.translate(-632, -751);
  const p = path2d(HAND);
  const gr = g.createLinearGradient(612, 734, 658, 770); gr.addColorStop(0, shade(C.skin, 0.08)); gr.addColorStop(1, shade(C.skin, -0.12));
  g.fillStyle = gr; g.fill(p); g.lineWidth = 2.8; g.strokeStyle = mix(C.skin, '#5a3a2c', 0.45); g.stroke(p);
  const shape = pose.handShape?.[A.side];
  if (!shape) { g.lineWidth = 2.2; g.strokeStyle = rgba(mix(C.skin, '#7a4a36', 0.4), 0.8); g.stroke(path2d(HAND_LINES)); }
  else if (shape === 'cross') { // the sign of the cross: the fingers are not stretched out — three fingertips joined
    // at the end of the hand (a small bunch), the thumb folded over them; nothing sticks out of the hand
    g.lineWidth = 2.2; g.strokeStyle = mix(C.skin, '#5a3a2c', 0.45);
    g.beginPath(); g.ellipse(650, 750, 9, 8, 0, 0, Math.PI * 2); g.fillStyle = shade(C.skin, 0.04); g.fill(); g.stroke();
    g.beginPath(); g.moveTo(643, 746); g.quadraticCurveTo(650, 742, 657, 747); g.moveTo(643, 753); g.quadraticCurveTo(650, 757, 657, 753);
    g.strokeStyle = rgba(mix(C.skin, '#7a4a36', 0.4), 0.8); g.lineWidth = 1.8; g.stroke();
  } else { // one pointing finger along the arm (the other fingers curled: no finger lines)
    g.beginPath(); g.ellipse(670, 748, 17, 5, 0, 0, Math.PI * 2);
    g.fillStyle = C.skin; g.fill(); g.stroke();
  }
  g.restore();
}

// ---------------------------------------------------------------- the head
const BROW_TILT = { sad: -0.35, sick: -0.25, ashamed: -0.28, angry: 0.38 };
const SMILE = { happy: 1.2, joy: 1.5, warm: 1.0, neutral: 0.7, thinking: 0, surprised: 0, sad: -0.8, sick: -0.4, sleepy: 0.2, asleep: 0.25, angry: -0.7, ashamed: -0.4 };

// ---------------------------------------------------------------- face variants (rule: vary the monks' faces)
// look keys (all optional; no key = the reference face): faceShape oval|round|long|narrow|wide · eyes normal|small|big|
// close|apart · brows straight|arched|bushy|thin|slanted · nose button|small|big|long · beardStyle (short beard)
// short|pointed|full|round|goatee, (long beard) long|wide|pointed|short
export const FACE_OPTIONS = {
  faceShape: ['oval', 'round', 'long', 'narrow', 'wide'], eyes: ['normal', 'small', 'big', 'close', 'apart'],
  brows: ['straight', 'arched', 'bushy', 'thin', 'slanted'], nose: ['button', 'small', 'big', 'long'],
  beardStyle: ['short', 'pointed', 'full', 'round', 'goatee', 'long', 'wide'],
};
const FACE_SCALE = { round: [1.08, 0.95], long: [0.95, 1.08], narrow: [0.91, 1.0], wide: [1.1, 1.0] };
const BEARD_SCALE = { pointed: [0.82, 1.3], full: [1.18, 1.25], round: [1.1, 1.06], goatee: [0.55, 1.12], wide: [1.2, 0.95], short: [1.0, 0.72] };
const VARIANT = new Map();
function variant(H, look) {
  const key = H.c[0] + '|' + [look.eyes, look.nose].join('|');
  let V = VARIANT.get(key); if (V) return V;
  V = { ...H };
  const cx = (H.eyes[0][0] + H.eyes[1][0]) / 2, gap = { close: -0.14, apart: 0.12 }[look.eyes] || 0;
  if (gap) { V.eyes = H.eyes.map(([x, y]) => [x + (x - cx) * gap, y]); V.brows = H.brows.map(([x, y]) => [x + (x - cx) * gap, y]); }
  V.eyeW = H.eyeW * ({ small: 0.82, big: 1.2 }[look.eyes] || 1);
  VARIANT.set(key, V); return V;
}

function head(g, look, C, pose, dir) {
  const H = variant(look.beard === 'long' ? HEADS.elder : HEADS.brother, look);
  const [hx, hy, R] = pose.head;
  const s = R * 1.02 / H.r;
  const fy = pose.faceYaw, turn = Math.abs(Math.sin(fy));
  g.save();
  g.translate(hx, hy); g.rotate(-pose.roll * Math.cos(pose.yaw) - pose.pitch * Math.sin(pose.yaw) * 0.5 + (pose.hugTilt || 0));
  g.scale(s * dir, -s);              // SVG units, y down, mirrored to the side the person faces
  g.translate(-H.c[0], -H.c[1]);
  const fill = (d, f) => { g.fillStyle = f; g.fill(path2d(d)); };
  const line = (d, c, w) => { g.lineWidth = w; g.strokeStyle = c; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(path2d(d)); };
  // hood (or, bareheaded, a cap of hair over the top and the back of the head)
  const hp = path2d(H.hood);
  const bare = look.hat === 'none';
  if (bare) {
    const hc = col(look.hairColor || (look.beard && look.beard !== 'none' ? C.beard : '#6c4f3a'));
    g.save(); g.clip(hp); g.beginPath(); g.rect(H.c[0] - 300, H.c[1] - 300, 600, pose.back ? 600 : 300 + (H.eyes[0][1] - H.c[1]) - 4); g.clip();
    g.fillStyle = hc; g.fillRect(H.c[0] - 300, H.c[1] - 300, 600, 600);
    g.restore();
    if (pose.back) { g.restore(); return; }
  } else {
  fill(H.hood, C.hood);
  g.save(); g.beginPath(); g.rect(H.c[0] - 300, H.c[1] - 300, 600, 300 + H.r * 0.55); g.clip(); line(H.hood, C.hoodInk, 5.5); g.restore();
  if (pose.back) { g.save(); g.clip(hp); g.fillStyle = rgba('#000000', 0.12); g.fillRect(H.c[0] - 200, H.c[1] - 200, 400, 400); g.restore(); g.restore(); return; }
  fill(H.hoodLight, rgba(C.hoodL, 0.3));
  if (H.hoodLine) line(H.hoodLine, rgba(C.hoodL, 0.45), 4);
  }
  // the face moves inside the hood with the turn of the head and nods down a little
  g.translate(-(1 - turn) * 4, pose.pitch * 18);
  // friendlier for children: the face fills more of the hood (scaled around the middle of the face)
  { const FS = 1.16, cx = (H.eyes[0][0] + H.eyes[1][0]) / 2, cy = H.eyes[0][1] + 8; g.translate(cx, cy); g.scale(FS, FS); g.translate(-cx, -cy); }
  { const [sx, sy] = FACE_SCALE[look.faceShape] || [1, 1], cx = (H.eyes[0][0] + H.eyes[1][0]) / 2, cy = H.eyes[0][1] + 8;
    if (sx !== 1 || sy !== 1) { g.translate(cx, cy); g.scale(sx, sy); g.translate(-cx, -cy); } }
  const skinD = mix(C.skin, '#8a5a40', 0.35);
  line(H.ears, skinD, 2); fill(H.ears, shade(C.skin, -0.12));
  const fp = path2d(H.face);
  const fx0 = H.eyes[0][0] - 25, fy0 = H.eyes[0][1] - 40;
  const fg = g.createLinearGradient(fx0, fy0, fx0 + 80, fy0 + 90);
  fg.addColorStop(0, shade(C.skin, 0.12)); fg.addColorStop(0.65, C.skin); fg.addColorStop(1, shade(C.skin, -0.14));
  g.fillStyle = fg; g.fill(fp); line(H.face, skinD, 3);
  // cheeks
  const old = H.c[0] === HEADS.elder.c[0];   // the old fathers (long white / grey beard): a weathered man's face
  if (!old || pose.emotion === 'ashamed') for (const [x, y] of H.cheeks) { g.beginPath(); g.ellipse(x, y + 3, H.eyeW * 0.7, H.eyeW * 0.4, 0, 0, Math.PI * 2); g.fillStyle = rgba('#e09a86', pose.emotion === 'ashamed' ? 0.65 : 0.24); g.fill(); }
  const ink = mix(C.skin, '#3a2a22', 0.75);
  if (!old) hair(g, H, look, C);   // a white band under the hood read as a nun's coif: the old fathers show none
  if (old) { wrinkles(g, H, C); if (look.beard && look.beard !== 'none') sideburns(g, H, C); }
  // beard (under the mouth for the short beard, the elder's long beard fanned over the chest)
  const beard = look.beard && look.beard !== 'none';
  const elderH = H.c[0] === HEADS.elder.c[0];
  if (beard) {
    g.save();
    const bs = BEARD_SCALE[look.beardStyle];
    if (bs) { const [x0, y0, x1] = H.box, bx = (x0 + x1) / 2, by = H.mouth[1] - 6; g.translate(bx, by); g.scale(bs[0], bs[1]); g.translate(-bx, -by); }
    fill(H.beard, C.beard);
    if (elderH) line(H.beard, mix(C.beard, '#6b5e50', 0.45), 3);
    line(H.strands, rgba(shade(C.beard, elderH ? -0.25 : 0.5), 0.7), 2.6);
    g.restore();
  }
  g.__skin = C.skin; eyes(g, H, pose, ink);
  brows(g, H, look, pose, ink, beard, C);
  nose(g, H, C, look.nose);
  mouth(g, H, pose, beard, C);
  if (H.moustache && beard && look.beardStyle !== 'goatee') {   // a full drooping moustache over the lip, joined to the beard
    const [mx, my] = H.mouth;
    g.beginPath(); g.moveTo(mx, my - 11);
    g.quadraticCurveTo(mx - 14, my - 15, mx - 25, my - 3); g.quadraticCurveTo(mx - 30, my + 6, mx - 27, my + 11);
    g.quadraticCurveTo(mx - 17, my - 2, mx, my - 3);
    g.quadraticCurveTo(mx + 17, my - 2, mx + 27, my + 11); g.quadraticCurveTo(mx + 30, my + 6, mx + 25, my - 3);
    g.quadraticCurveTo(mx + 14, my - 15, mx, my - 11); g.closePath();
    g.fillStyle = shade(C.beard, 0.06); g.fill(); g.lineWidth = 2; g.strokeStyle = mix(C.beard, '#5e5448', 0.5); g.stroke();
    g.beginPath(); g.moveTo(mx - 6, my - 8); g.quadraticCurveTo(mx - 15, my - 6, mx - 22, my + 4); g.moveTo(mx + 6, my - 8); g.quadraticCurveTo(mx + 15, my - 6, mx + 22, my + 4);
    g.lineWidth = 1.6; g.strokeStyle = rgba(mix(C.beard, '#5e5448', 0.5), 0.6); g.stroke();
  }
  else if (beard && look.beardStyle !== 'goatee') { // a short beard gets a moustache over the lip (a man's face)
    const [mx, my] = H.mouth, mw = H.mouthW * 1.3;   // a full moustache
    g.beginPath(); g.moveTo(mx - mw, my + 2.5); g.quadraticCurveTo(mx - mw * 0.55, my - 8, mx, my - 5); g.quadraticCurveTo(mx + mw * 0.55, my - 8, mx + mw, my + 2.5);
    g.quadraticCurveTo(mx + mw * 0.4, my - 2, mx, my - 1); g.quadraticCurveTo(mx - mw * 0.4, my - 2, mx - mw, my + 1); g.closePath();
    g.fillStyle = rgba(shade(C.beard, 0.08), 0.9); g.fill();
  }
  // sad: one small tear
  if (pose.emotion === 'sad') {
    const [x, y] = H.eyes[1]; const ty = y + H.eyeW * 1.2;
    g.beginPath(); g.moveTo(x, ty - 5); g.quadraticCurveTo(x + 5, ty + 4, x, ty + 7); g.quadraticCurveTo(x - 5, ty + 4, x, ty - 5);
    g.fillStyle = '#cfe8f5'; g.fill(); g.lineWidth = 1.4; g.strokeStyle = '#6f9cbd'; g.stroke();
  }
  g.restore();
}

// a monk's hair seen in the hood: only a short band over the forehead, down to the temples (no locks along the face,
// no parting — those read as a girl's hair); never over the brows
// the beard grows up the cheeks to the ears (sideburns), so the face of an old father is framed like a man's
function sideburns(g, H, C) {
  const [x0, y0, x1, y1] = H.box, w = x1 - x0, h = y1 - y0;
  for (const sd of [-1, 1]) {
    const X = (u) => (sd < 0 ? x0 + w * u : x1 - w * u);
    g.beginPath(); g.moveTo(X(-0.02), y0 + h * 0.36);
    g.quadraticCurveTo(X(0.1), y0 + h * 0.34, X(0.12), y0 + h * 0.45);
    g.quadraticCurveTo(X(0.15), y0 + h * 0.58, X(0.3), y0 + h * 0.66);
    g.lineTo(X(0.24), y0 + h * 0.8); g.quadraticCurveTo(X(0.0), y0 + h * 0.72, X(-0.04), y0 + h * 0.5); g.closePath();
    g.fillStyle = shade(C.beard, -0.02); g.fill(); g.lineWidth = 2; g.strokeStyle = mix(C.beard, '#5e5448', 0.5); g.stroke();
  }
}
// a few soft lines of age: two on the forehead, little crow's feet at the outer corners of the eyes
function wrinkles(g, H, C) {
  const [x0, y0, x1, y1] = H.box, w = x1 - x0, h = y1 - y0, cx = (H.eyes[0][0] + H.eyes[1][0]) / 2;
  g.lineCap = 'round'; g.lineWidth = 1.8; g.strokeStyle = rgba(mix(C.skin, '#6a4030', 0.6), 0.45);
  for (const [dy, hw] of [[0.13, 0.26], [0.2, 0.2]]) { g.beginPath(); g.moveTo(cx - w * hw, y0 + h * dy + 1.5); g.quadraticCurveTo(cx, y0 + h * dy - 1.5, cx + w * hw, y0 + h * dy + 1.5); g.stroke(); }
  for (const [ex, ey] of H.eyes) {
    const sd = ex < cx ? -1 : 1, x = ex + sd * H.eyeW * 0.85;
    g.beginPath(); g.moveTo(x, ey - 2); g.lineTo(x + sd * 4, ey - 4); g.moveTo(x, ey + 2); g.lineTo(x + sd * 4, ey + 4); g.stroke();
  }
}

function hair(g, H, look, C) {
  if (look.hair === 'none') return;
  const hc = col(look.hairColor || (look.beard && look.beard !== 'none' ? C.beard : '#6c4f3a'));
  const [x0, y0, x1, y1] = H.box, h = y1 - y0, cx = (H.eyes[0][0] + H.eyes[1][0]) / 2, hw = (x1 - x0) / 2;
  const X = (u) => cx + hw * u;
  g.beginPath();
  g.moveTo(X(-1.06), y0 + h * 0.3);                                                   // left temple
  g.bezierCurveTo(X(-1.1), y0 + h * 0.02, X(-0.5), y0 - h * 0.06, X(0), y0 - h * 0.05);  // over the top of the forehead
  g.bezierCurveTo(X(0.5), y0 - h * 0.06, X(1.1), y0 + h * 0.02, X(1.06), y0 + h * 0.3);
  g.quadraticCurveTo(X(0.95), y0 + h * 0.2, X(0.8), y0 + h * 0.12);                     // the hairline, well above the brows
  g.bezierCurveTo(X(0.45), y0 + h * 0.08, X(-0.45), y0 + h * 0.08, X(-0.8), y0 + h * 0.12);
  g.quadraticCurveTo(X(-0.95), y0 + h * 0.2, X(-1.06), y0 + h * 0.3);
  g.closePath();
  const gr = g.createLinearGradient(cx, y0 - h * 0.06, cx, y0 + h * 0.2);
  gr.addColorStop(0, shade(hc, -0.08)); gr.addColorStop(1, shade(hc, 0.12));
  g.fillStyle = gr; g.fill();
  g.lineWidth = 2; g.strokeStyle = mix(hc, '#2e241c', 0.35); g.lineJoin = 'round'; g.stroke();
}

function eyes(g, H, pose, ink) {
  const em = pose.emotion, w = H.eyeW;
  const closed = pose.blink > 0.7 || pose.p.eyesClosed || em === 'sleepy' || em === 'asleep';
  for (const [x, y] of H.eyes) {
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (closed) { g.beginPath(); g.moveTo(x - w * 0.6, y + 1); g.quadraticCurveTo(x, y + 4, x + w * 0.6, y + 1); g.lineWidth = w * 0.22; g.strokeStyle = ink; g.stroke(); continue; }
    if (em === 'joy') { g.beginPath(); g.moveTo(x - w * 0.6, y + 2); g.quadraticCurveTo(x, y - 5, x + w * 0.6, y + 2); g.lineWidth = w * 0.24; g.strokeStyle = ink; g.stroke(); continue; }
    const k = em === 'surprised' ? 1.25 : em === 'sad' || em === 'ashamed' || em === 'sick' ? 0.85 : 1;
    const rx = w * 0.38 * (em === 'surprised' ? 1.1 : 1), ry = w * 0.42 * k;   // a man's eyes: a little narrower
    g.beginPath(); g.ellipse(x, y + 1, rx, ry, 0, 0, Math.PI * 2);
    const gr = g.createRadialGradient(x - rx * 0.3, y - ry * 0.3, 0, x, y + 1, ry * 1.1);
    gr.addColorStop(0, '#5a3d2b'); gr.addColorStop(1, '#2c1d14');
    g.fillStyle = gr; g.fill();
    g.beginPath(); g.ellipse(x - rx * 0.32, y - ry * 0.3, rx * 0.3, rx * 0.3, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.8)'; g.fill();
    // a short straight upper lid over the eye (an adult man's look, not a child's)
    g.beginPath(); g.moveTo(x - rx * 1.45, y - ry * 0.45); g.quadraticCurveTo(x, y - ry * 1.35, x + rx * 1.45, y - ry * 0.45);
    g.lineWidth = w * 0.16; g.strokeStyle = rgba(ink, 0.85); g.lineCap = 'round'; g.stroke();
    if (em === 'sad' || em === 'ashamed') { // heavy lids: skin over the top of the eye
      g.beginPath(); g.ellipse(x, y - ry * 0.75, rx * 1.35, ry * 0.65, 0, 0, Math.PI * 2); g.fillStyle = g.__skin; g.fill();
      g.beginPath(); g.moveTo(x - rx * 1.2, y - ry * 0.2); g.quadraticCurveTo(x, y - ry * 0.05, x + rx * 1.2, y - ry * 0.2); g.lineWidth = w * 0.13; g.strokeStyle = rgba(ink, 0.7); g.stroke();
    }
  }
}

function brows(g, H, look, pose, ink, beard, C) {
  const em = pose.emotion, w = H.browW * 0.85;
  const light = H.c[0] === HEADS.elder.c[0] || ['white', 'gray', 'lightGray'].includes(look.beardColor);
  const c = light ? (H.c[0] === HEADS.elder.c[0] ? '#e2d6c0' : mix(C.beard, '#ffffff', 0.2)) : mix(col(look.hairColor || C.beard), '#2e2018', 0.4);
  const lift = em === 'surprised' ? -5 : em === 'joy' || em === 'happy' ? -1.5 : 0;
  const kind = look.brows, arch = kind === 'arched' ? -4 : 0, slant = kind === 'slanted' ? 2.5 : 0;
  const elder = H.c[0] === HEADS.elder.c[0];
  H.brows.forEach(([x, y], i) => {
    const inner = i === 0 ? 1 : -1;
    const tilt = (BROW_TILT[em] || 0) * w * 0.8;
    const xi = x + inner * w * 0.8, xo = x - inner * w * 0.8;
    g.beginPath(); g.moveTo(xo, y + lift + 4 - slant); g.quadraticCurveTo(x, y + lift + 0.5 + arch, xi, y + lift + 3.5 + tilt + slant);   // thick, straight, low
    const wd = { bushy: 1.45, thin: 0.6 }[kind] || 1;
    if (elder) { g.lineWidth = 8.5 * wd; g.strokeStyle = mix(c, '#6e665c', 0.55); g.lineCap = 'round'; g.stroke(); g.lineWidth = 6.5 * wd; }
    else g.lineWidth = 4.8 * wd;
    g.strokeStyle = c; g.lineCap = 'round'; g.stroke();
  });
  void ink;
}

/** a small round nose: a soft shaded ball with a light dot, just under the eyes */
function nose(g, H, C, kind) {
  const [x, y0] = H.noseTip, r = H.eyeW * 0.42 * ({ small: 0.75, big: 1.35, long: 1.05 }[kind] || 1);
  const y = kind === 'long' ? y0 + r * 0.25 : y0;
  if (kind === 'long') { // a long straight nose: a soft ridge down from between the eyes
    g.beginPath(); g.moveTo(x - r * 0.15, y - r * 3.2); g.quadraticCurveTo(x - r * 0.75, y - r * 1.2, x - r * 0.6, y - r * 0.2);
    g.lineWidth = 1.8; g.strokeStyle = rgba(mix(C.skin, '#5a3424', 0.6), 0.5); g.stroke();
  }
  g.beginPath(); g.ellipse(x, y, r * 1.05, r * (kind === 'long' ? 0.95 : 0.8), 0, 0, Math.PI * 2);
  g.fillStyle = mix(C.skin, '#d98a6e', 0.35); g.fill();
  g.beginPath(); g.ellipse(x, y + r * 0.3, r * 1.05, r * 0.55, 0, 0.15 * Math.PI, 0.85 * Math.PI); g.lineWidth = 1.6; g.strokeStyle = rgba(mix(C.skin, '#5a3424', 0.6), 0.55); g.stroke();
  g.beginPath(); g.ellipse(x - r * 0.35, y - r * 0.3, r * 0.28, r * 0.2, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
}

function mouth(g, H, pose, beard, C) {
  const [x, y] = H.mouth, w = H.mouthW * 0.8, em = pose.emotion;
  const open = Math.max(0, Math.min(1, pose.mouth || 0));
  const k = SMILE[em] ?? 0.35;
  if (open > 0.08 || em === 'surprised') {   // talking: a small soft round mouth
    const h = em === 'surprised' && open < 0.08 ? 4 : 2 + open * 6;
    g.beginPath(); g.ellipse(x, y + h * 0.4, w * (0.45 + open * 0.15), h, 0, 0, Math.PI * 2); g.fillStyle = '#7b3b33'; g.fill();
    if (open > 0.4) { g.beginPath(); g.ellipse(x, y + h * 1.0, w * 0.28, h * 0.32, 0, 0, Math.PI * 2); g.fillStyle = '#d27a76'; g.fill(); }
    return;
  }
  g.beginPath(); g.moveTo(x - w, y - k * 1.2); g.quadraticCurveTo(x, y + k * 4.5, x + w, y - k * 1.2);
  g.lineWidth = 2.4; g.lineCap = 'round'; g.strokeStyle = beard ? mix(C.beard, '#5a3028', 0.75) : '#8a4a3e'; g.stroke();
}
