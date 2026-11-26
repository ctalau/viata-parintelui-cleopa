"""Wheat for the harvest: stalks with golden ears (fast, built straight into one bmesh), a wheat patch that is reaped
in steps, a sheaf, a stook of sheaves, stubble, poppies / cornflowers, a sparrow and a sickle.

Blender space (Z up), front = -Y, base z = 0. Everything vertex-coloured (material: vcol, double-sided for the thin
blades). The figure is 4.2 tall: the wheat reaches its chest (≈ 2.4).
"""
import math
import numpy as np
from mathutils import Vector, Matrix

from .core import new_bm, COL, UV0, tube, set_color, merge, transform
from .critters import blob, cone, stick

GOLD = ((0.96, 0.74, 0.26), (0.99, 0.82, 0.34), (0.9, 0.64, 0.2), (0.98, 0.78, 0.3))
STEM = ((0.86, 0.66, 0.26), (0.92, 0.74, 0.32))
STEM_LOW = (0.66, 0.5, 0.2)


class Builder:
    """Append raw verts / faces with a colour per vertex (shared verts: a strip or a ring is built once; much faster than
    merging little bmeshes, and the glTF stays small)."""

    def __init__(self, bm=None):
        self.bm = bm or new_bm()
        self.cl = self.bm.loops.layers.color[COL]
        self.uv = self.bm.loops.layers.uv[UV0]
        self.col = {}

    def v(self, p, c):
        vv = self.bm.verts.new(p)
        self.col[vv] = c
        return vv

    def f(self, vs):
        try:
            fc = self.bm.faces.new(vs)
        except ValueError:
            return None
        for l in fc.loops:
            l[self.cl] = (*self.col[l.vert], 1.0)
        return fc

    def face(self, pts, cols):
        return self.f([self.v(p, c) for p, c in zip(pts, cols)])

    def quad_strip(self, left, right, cols):
        """two rails of points (same length) → quads; cols per row (verts shared along the strip)"""
        L = [self.v(p, c) for p, c in zip(left, cols)]
        R = [self.v(p, c) for p, c in zip(right, cols)]
        for i in range(len(left) - 1):
            self.f((L[i], R[i], R[i + 1], L[i + 1]))


def _mix(a, b, k):
    return tuple(a[i] + (b[i] - a[i]) * k for i in range(3))


def ear(B, top, up, side, rng, colk=1.0, awns=2, L=0.46):
    """a golden ear (a 4-sided spindle, shared rings) at `top` pointing along `up`, with a few awns"""
    gc = GOLD[int(rng.random() * len(GOLD))]
    gc = tuple(min(1, x * colk * (0.95 + 0.1 * rng.random())) for x in gc)
    dk = _mix(gc, (0.75, 0.5, 0.15), 0.35)
    s1 = side
    s2 = up.cross(s1).normalized()
    rings = []
    for t, r in zip((0.0, 0.18, 0.62, 1.0), (0.022, 0.072, 0.064, 0.012)):
        c = top + up * (L * t)
        rings.append([B.v(c + (s1 * math.cos(a) + s2 * math.sin(a)) * r, dk if k in (1, 2) and t < 0.5 else gc)
                      for k, a in enumerate((0.0, math.pi / 2, math.pi, 1.5 * math.pi))])
    for i in range(3):
        for k in range(4):
            k2 = (k + 1) % 4
            B.f((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
    tip = B.v(top + up * (L + 0.05), gc)
    for k in range(4):
        B.f((rings[3][k], rings[3][(k + 1) % 4], tip))
    for k in range(awns):
        a = rng.random() * 2 * math.pi
        o = (s1 * math.cos(a) + s2 * math.sin(a))
        p0 = top + up * (L * (0.45 + 0.4 * rng.random()))
        p1 = p0 + up * 0.3 + o * 0.12
        B.face((p0 - s1 * 0.008, p0 + s1 * 0.008, p1), (gc, gc, _mix(gc, (1, 0.95, 0.75), 0.4)))


def stalk(B, base, h, lean, rng, ear_=True, colk=1.0, awns=True, leaf=True):
    """One wheat stalk: a thin flat stem (two segments) and a golden ear (a 4-sided spindle) with a few awns.
    base: Vector on the ground; lean: Vector (x, y) the top leans by; h: height of the ear's top."""
    top = base + Vector((lean.x, lean.y, h - 0.42))
    mid = base + Vector((lean.x * 0.35, lean.y * 0.35, (h - 0.42) * 0.55))
    d = (top - base).normalized()
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    # face the stem a bit toward -Y (the usual camera) so it never shows as a hairline only
    side = (side + Vector((0.6, 0, 0))).normalized()
    w = 0.026
    rail = [base, mid, top]
    cs = [_mix(STEM_LOW, STEM[0], 0.2), STEM[int(rng.random() * 2)], STEM[1]]
    cs = [tuple(min(1, x * colk) for x in c) for c in cs]
    B.quad_strip([p - side * w for p in rail], [p + side * w * 0.8 for p in rail], cs)
    # a leaf blade hanging from the lower stem
    if leaf and rng.random() < 0.45:
        a = rng.random() * 2 * math.pi
        o = Vector((math.cos(a), math.sin(a), 0))
        p0 = base + (mid - base) * 0.45
        p1 = p0 + o * 0.32 + Vector((0, 0, 0.28)); p2 = p0 + o * 0.6 + Vector((0, 0, 0.05))
        lc = tuple(min(1, x * colk) for x in _mix(STEM[0], (0.8, 0.6, 0.22), rng.random()))
        vs = [B.v(p, lc) for p in (p0 - side * 0.02, p0 + side * 0.03, p1 + side * 0.03, p1 - side * 0.02, p2)]
        B.f(vs[:4]); B.f((vs[3], vs[2], vs[4]))
    if ear_:
        ear(B, top, d, side, rng, colk, 2 if awns else 0)


def stub(B, base, rng, h=0.32):
    """a cut stem left in the ground (stubble)"""
    a = rng.random() * math.pi
    side = Vector((math.cos(a), math.sin(a), 0)) * 0.03
    top = base + Vector(((rng.random() - 0.5) * 0.08, (rng.random() - 0.5) * 0.08, h * (0.7 + 0.5 * rng.random())))
    c0, c1 = STEM_LOW, _mix(STEM[1], (1, 0.9, 0.6), 0.2)
    B.face((base - side, base + side, top + side, top - side), (c0, c0, c1, c1))


def flower(B, base, rng, kind, h=1.9):
    """a red poppy (kind 0) or a blue cornflower (kind 1) on a thin green stem, among the wheat"""
    top = base + Vector(((rng.random() - 0.5) * 0.2, (rng.random() - 0.5) * 0.2, h))
    g = (0.36, 0.55, 0.2)
    side = Vector((0.025, 0, 0))
    B.face((base - side, base + side, top + side, top - side), (g, g, g, g))
    col = (0.93, 0.13, 0.1) if kind == 0 else (0.25, 0.42, 0.95)
    n = 5 if kind == 0 else 8
    r = 0.2 if kind == 0 else 0.15
    for k in range(n):
        a = 2 * math.pi * k / n
        o1 = Vector((math.cos(a - 0.45), math.sin(a - 0.45), 0.35)) * r
        o2 = Vector((math.cos(a + 0.45), math.sin(a + 0.45), 0.35)) * r
        B.face((top, top + o1, top + o2), (col, col, col))
        B.face((top, top + o2, top + o1), (col, col, col))
    dot = (0.1, 0.07, 0.06) if kind == 0 else (0.15, 0.2, 0.55)
    for k in range(3):
        a = 2 * math.pi * k / 3
        o1 = Vector((math.cos(a), math.sin(a), 0.6)) * 0.06
        o2 = Vector((math.cos(a + 2.1), math.sin(a + 2.1), 0.6)) * 0.06
        B.face((top + Vector((0, 0, 0.06)), top + o1, top + o2), (dot,) * 3)


def field_patch(B, rng, x0, x1, y0, y1, density, h=2.4, hv=0.25, cut=None, flowers=0.0, colk=1.0, awns=True):
    """standing wheat over a rectangle (Blender x/y); `cut(x, y)` True → stubble there instead"""
    n = int((x1 - x0) * (y1 - y0) * density)
    for i in range(n):
        x = x0 + (x1 - x0) * rng.random(); y = y0 + (y1 - y0) * rng.random()
        base = Vector((x, y, -0.04))
        if cut and cut(x, y):
            if rng.random() < 0.75:
                stub(B, base, rng)
            continue
        if flowers and rng.random() < flowers:
            flower(B, base, rng, 0 if rng.random() < 0.7 else 1, h=h * (0.75 + 0.15 * rng.random()))
            continue
        lean = Vector(((rng.random() - 0.5) * 0.35, (rng.random() - 0.5) * 0.3 - 0.05))
        stalk(B, base, h * (1 - hv / 2 + hv * rng.random()), lean, rng, colk=colk, awns=awns)


def sheaf(seed=1, L=1.9, r=0.26, lying=True):
    """A sheaf (snop): a bundle of straight stalks tied in the middle with a twisted straw band, the ears fanned at one
    end. Lying along X (ears towards +X) on the ground, or standing (ears up) when `lying` is False."""
    rng = np.random.default_rng(seed)
    B = Builder()
    n = 46
    tie = L * 0.45
    for i in range(n):
        a = rng.random() * 2 * math.pi; d = math.sqrt(rng.random())
        cy, cz = math.cos(a) * d, math.sin(a) * d
        fan = 1.0 + 1.1 * rng.random()
        foot = 1.25
        pts = [Vector((0.0, cy * r * foot, cz * r * foot)), Vector((tie, cy * r * 0.62, cz * r * 0.62)),
               Vector((L - 0.45, cy * r * fan, cz * r * fan))]
        side = Vector((0, -math.sin(a), math.cos(a))) * 0.025
        cs = [STEM_LOW, STEM[1], STEM[0]]
        B.quad_strip([p - side for p in pts], [p + side for p in pts], cs)
        B.quad_strip([p - side.cross(Vector((1, 0, 0))) for p in pts], [p + side.cross(Vector((1, 0, 0))) for p in pts], cs)
        # the ear
        top = pts[-1]
        dvec = (pts[-1] - pts[-2]).normalized()
        gc = GOLD[int(rng.random() * len(GOLD))]
        s1 = Vector((0, -math.sin(a), math.cos(a))); s2 = dvec.cross(s1).normalized()
        rings = []
        for t, rr in zip((0.0, 0.2, 0.65, 1.0), (0.02, 0.07, 0.06, 0.01)):
            c = top + dvec * (0.44 * t)
            rings.append([c + (s1 * math.cos(b) + s2 * math.sin(b)) * rr for b in (0, math.pi / 2, math.pi, 1.5 * math.pi)])
        for j in range(3):
            for k in range(4):
                B.face((rings[j][k], rings[j][(k + 1) % 4], rings[j + 1][(k + 1) % 4], rings[j + 1][k]), (gc,) * 4)
    bm = B.bm
    # the straw band round the middle
    band = new_bm()
    tube(band, [Vector((tie + 0.06 * math.sin(k * 1.3), r * 0.68 * math.cos(2 * math.pi * k / 16), r * 0.68 * math.sin(2 * math.pi * k / 16))) for k in range(17)],
         0.05, sides=5, closed=True)
    set_color(band, (0.82, 0.6, 0.24))
    merge(bm, band)
    if lying:
        transform(bm, Matrix.Translation((-L / 2 + 0.2, 0, r * 0.95)))
    else:
        transform(bm, Matrix.Rotation(-math.pi / 2, 4, 'Y'))
        transform(bm, Matrix.Translation((0, 0, 0.02)))
    return bm


def stook(seed=1, n=6):
    """A stook (claie): sheaves standing in a ring, leaning together, one laid on top like a little roof."""
    bm = new_bm()
    for k in range(n):
        a = 2 * math.pi * k / n
        s = sheaf(seed * 10 + k, L=2.0, r=0.24, lying=False)
        transform(s, Matrix.Translation((0.42 * math.cos(a), 0.42 * math.sin(a), 0)) @ Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(-0.2, 4, 'Y'))
        merge(bm, s)
    cap = sheaf(seed * 10 + 9, L=2.1, r=0.26, lying=True)
    transform(cap, Matrix.Translation((0.0, 0.0, 1.55)) @ Matrix.Rotation(0.12, 4, 'Y'))
    merge(bm, cap)
    return bm


def sparrow(body=(0.55, 0.36, 0.2), light=(0.86, 0.74, 0.58), cap=(0.45, 0.3, 0.18)):
    """A round little sparrow ≈ 0.4 tall, facing -Y. Returns (body, head, head pivot)."""
    b = new_bm()
    blob(b, (0, 0.04, 0.2), (0.15, 0.21, 0.14), body)
    blob(b, (0, -0.07, 0.17), (0.12, 0.12, 0.11), light)
    for x in (-0.12, 0.12):
        blob(b, (x, 0.07, 0.22), (0.04, 0.15, 0.08), (body[0] * 0.75, body[1] * 0.75, body[2] * 0.75), rot=Matrix.Rotation(-0.3, 4, 'X'))
    cone(b, (0, 0.2, 0.24), (0, 0.4, 0.3), 0.06, (body[0] * 0.7, body[1] * 0.7, body[2] * 0.7), sides=6)
    for x in (-0.05, 0.05):
        stick(b, (x, 0.0, 0.08), (x, -0.02, 0.0), 0.014, (0.85, 0.55, 0.35))
    h = new_bm()
    blob(h, (0, -0.02, 0.04), (0.095, 0.1, 0.095), light)
    blob(h, (0, 0.0, 0.08), (0.085, 0.09, 0.06), cap)
    cone(h, (0, -0.1, 0.03), (0, -0.17, 0.02), 0.03, (0.3, 0.25, 0.2), sides=6)
    for x in (-0.065, 0.065):
        blob(h, (x, -0.07, 0.07), (0.02, 0.02, 0.022), (0.05, 0.04, 0.04), subdiv=1)
    return b, h, Vector((0, -0.09, 0.3))


def sickle():
    """A sickle: a short round wooden handle (along +Z from the origin = the grip) and a curved iron blade going on
    from its top in a big hook toward -Y (forward when held: the hand's +Z = the handle). Returns (wood, iron)."""
    wood = new_bm()
    tube(wood, [Vector((0, 0, -0.32)), Vector((0, 0, -0.1)), Vector((0, 0, 0.16)), Vector((0, 0, 0.3))], [0.055, 0.062, 0.06, 0.05], sides=10)
    ring = new_bm()
    tube(ring, [Vector((0, 0, 0.3)), Vector((0, 0, 0.36))], 0.058, sides=10)
    set_color(ring, (0.55, 0.55, 0.58))
    iron = new_bm()
    # the blade: a crescent in the Y-Z plane, a flat ribbon, thick at the back, thin edge inside
    pts_out, pts_in = [], []
    for k in range(15):
        a = math.radians(200 * k / 14)
        R = 0.42
        cx, cz = -0.42, 0.36
        po = Vector((0, cx + R * math.cos(a), cz + R * math.sin(a)))
        w = 0.085 * (1 - k / 15) + 0.012
        pi_ = Vector((0, cx + (R - w) * math.cos(a), cz + (R - w) * math.sin(a)))
        pts_out.append(po); pts_in.append(pi_)
        cl = iron.loops.layers.color[COL]
    for i in range(14):
        for dx in (-0.018, 0.018):
            vs = [iron.verts.new(p + Vector((dx, 0, 0))) for p in (pts_out[i], pts_out[i + 1], pts_in[i + 1], pts_in[i])]
            f = iron.faces.new(vs if dx > 0 else list(reversed(vs)))
            for l in f.loops:
                l[cl] = (0.72, 0.74, 0.78, 1) if l.vert.co in (vs[2].co, vs[3].co) else (0.5, 0.52, 0.56, 1)
        for (p, q) in ((pts_out[i], pts_out[i + 1]), (pts_in[i], pts_in[i + 1])):
            vs = [iron.verts.new(v) for v in (p + Vector((-0.018, 0, 0)), q + Vector((-0.018, 0, 0)), q + Vector((0.018, 0, 0)), p + Vector((0.018, 0, 0)))]
            f = iron.faces.new(vs)
            for l in f.loops:
                l[cl] = (0.48, 0.5, 0.54, 1)
    merge(iron, ring)
    return wood, iron
