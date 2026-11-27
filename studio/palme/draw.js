// Shapes and painting shared by the three hand approaches.
// A group is a cut-out piece: all its outlines are painted first, then all its
// fills, so the pieces inside one group merge without seams. Groups are painted
// back to front, which gives the inner contour lines where one piece overlaps another.

export const COLORS = {
  skin: '#efae83', shade: '#d98f66', line: '#5b3323', nail: '#f8d3b8', crease: '#c47b56',
  blouse: '#f7ecd6', blouseShade: '#e6d4b4', red: '#a8322a', skirt: '#4b2d24', batic: '#efdfc2',
  hair: '#3b2219', cheek: '#ec8f78',
};

export const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const add2 = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const mul2 = (a, s) => [a[0] * s, a[1] * s];
export const len2 = (a) => Math.hypot(a[0], a[1]);
export const lerp2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
export const cross2 = (a, b) => a[0] * b[1] - a[1] * b[0];

// Convex hull (monotone chain).
export function hull(points) {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const turn = (o, a, b) => cross2(sub2(a, o), sub2(b, o));
  const lower = [], upper = [];
  for (const q of p) {
    while (lower.length >= 2 && turn(lower.at(-2), lower.at(-1), q) <= 0) lower.pop();
    lower.push(q);
  }
  for (const q of p.reverse()) {
    while (upper.length >= 2 && turn(upper.at(-2), upper.at(-1), q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function circleHull(circles, steps = 14) {
  const points = [];
  for (const { c, r } of circles) {
    for (let i = 0; i < steps; i += 1) {
      const a = (i / steps) * Math.PI * 2;
      points.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
    }
  }
  return hull(points);
}

// A tapered capsule: two circles joined by their outer tangents.
function capsule(ctx, a, b, ra, rb) {
  const d = sub2(b, a), l = len2(d);
  if (l < Math.abs(ra - rb) + 0.01) {
    const [c, r] = ra > rb ? [a, ra] : [b, rb];
    ctx.moveTo(c[0] + r, c[1]);
    ctx.arc(c[0], c[1], r, 0, Math.PI * 2);
    return;
  }
  const ang = Math.atan2(d[1], d[0]);
  const off = Math.acos((ra - rb) / l);
  ctx.moveTo(a[0] + Math.cos(ang + off) * ra, a[1] + Math.sin(ang + off) * ra);
  ctx.arc(a[0], a[1], ra, ang + off, ang - off + Math.PI * 2);
  ctx.arc(b[0], b[1], rb, ang - off, ang + off);
  ctx.closePath();
}

function trace(ctx, shape, grow) {
  if (shape.t === 'cap') capsule(ctx, shape.a, shape.b, shape.ra + grow, shape.rb + grow);
  else if (shape.t === 'circle') { ctx.moveTo(shape.c[0] + shape.r + grow, shape.c[1]); ctx.arc(shape.c[0], shape.c[1], shape.r + grow, 0, Math.PI * 2); }
  else if (shape.t === 'poly') {
    shape.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
  }
}

// Polygons get their outline from a stroke; capsules and circles from a larger copy.
function paintShapes(ctx, shapes, color, grow) {
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const s of shapes) if (s.t !== 'poly') trace(ctx, s, grow);
  ctx.fill();
  const polys = shapes.filter((s) => s.t === 'poly');
  if (!polys.length) return;
  ctx.beginPath();
  for (const s of polys) trace(ctx, s, 0);
  ctx.fill('nonzero');
  if (grow > 0) {
    ctx.strokeStyle = color; ctx.lineWidth = grow * 2; ctx.lineJoin = 'round';
    ctx.stroke();
  }
}

function paintDetail(ctx, d) {
  ctx.save();
  if (d.t === 'nail') {
    ctx.translate(d.c[0], d.c[1]); ctx.rotate(d.angle);
    ctx.beginPath(); ctx.ellipse(0, 0, d.rx, d.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.nail; ctx.fill();
    ctx.lineWidth = d.w; ctx.strokeStyle = COLORS.crease; ctx.stroke();
  } else if (d.t === 'line') {
    ctx.beginPath();
    d.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.lineWidth = d.w; ctx.lineCap = d.cap ?? 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = d.color; ctx.stroke();
  } else if (d.t === 'patch') {
    // Hides the round end of a finger that is rooted in the palm.
    ctx.beginPath(); d.clip.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
    ctx.clip();
    ctx.beginPath(); ctx.arc(d.c[0], d.c[1], d.r, 0, Math.PI * 2); ctx.fillStyle = d.color; ctx.fill();
  }
  ctx.restore();
}

export function paintGroups(ctx, groups, lw, { mask = false } = {}) {
  for (const g of groups) {
    if (mask) { paintShapes(ctx, g.shapes, '#000', lw); continue; }
    paintShapes(ctx, g.shapes, COLORS.line, lw);
    paintShapes(ctx, g.shapes, g.fill ?? COLORS.skin, 0);
    for (const d of g.details ?? []) paintDetail(ctx, d);
  }
}

// Moves a list of groups with a function on points (used to place library drawings).
export function mapGroups(groups, f, scale, rot = 0) {
  const mapShape = (s) => {
    if (s.t === 'cap') return { ...s, a: f(s.a), b: f(s.b), ra: s.ra * scale, rb: s.rb * scale };
    if (s.t === 'circle') return { ...s, c: f(s.c), r: s.r * scale };
    return { ...s, pts: s.pts.map(f) };
  };
  const mapDetail = (d) => {
    if (d.t === 'nail') return { ...d, c: f(d.c), rx: d.rx * scale, ry: d.ry * scale, w: d.w * scale, angle: d.angle + rot };
    if (d.t === 'line') return { ...d, pts: d.pts.map(f), w: d.w * scale };
    return { ...d, c: f(d.c), r: d.r * scale, clip: d.clip.map(f) };
  };
  return groups.map((g) => ({ ...g, shapes: g.shapes.map(mapShape), details: (g.details ?? []).map(mapDetail) }));
}
