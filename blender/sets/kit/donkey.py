"""The pack donkey (film 049, „Urechilă”) and the things it carries: a detailed toy donkey in moving parts — big ears that
twitch, glossy eyes that blink, a mane, a forelock, a smiling muzzle, a lower jaw that opens when it brays, a red bridle with
pompoms, a collar with a little bell, a striped saddle blanket, a wooden sawbuck pack saddle with pegs, legs that step — and
three loads that hang from the saddle by ropes (nothing floats, nothing sinks into the body):

* `dates_basket()`  a woven basket full of dates (a few palm leaves on top), hung on the donkey's RIGHT side (-X);
* `bread_sack()`    a burlap sack with round loaves peeking out of its open neck, hung on the LEFT side (+X);
* `mat_roll()`      a rolled palm-leaf mat with dyed bands, tied with two ropes, lying across the saddle on top.

Blender space, front towards -Y, Z up (like every generator). The geometry of the free props and of the loaded variants is the
same function, so a load put onto the donkey and the variant that replaces it are identical (SLOTS gives where they hang).
"""
import math
import numpy as np
import bmesh
from mathutils import Matrix, Vector

from .core import new_bm, merge, transform, set_color, tube, lathe
from .critters import blob, cone, curve_stick

COAT = (0.58, 0.53, 0.5)
LIGHT = (0.97, 0.95, 0.91)
DARK = (0.27, 0.22, 0.2)
MANE = (0.22, 0.17, 0.15)
PINK = (0.95, 0.62, 0.62)
HOOF = (0.2, 0.17, 0.16)
RED = (0.8, 0.16, 0.12)

# the barrel of the body (centre, radii) — the blanket, the girth and the loads are fitted to it
BODY_C = Vector((0.0, 0.0, 1.78))
BODY_R = Vector((0.6, 1.05, 0.58))
BELLY_C, BELLY_R = Vector((0.0, 0.0, 1.42)), Vector((0.47, 0.8, 0.3))
HEAD_P = Vector((0.0, -1.14, 2.56))       # head pivot (top of the neck)
TAIL_P = Vector((0.0, 1.1, 2.0))
LEG_P = {0: (0.33, -0.68), 1: (-0.33, -0.68), 2: (0.33, 0.7), 3: (-0.33, 0.7)}   # leg0 FL, leg1 FR, leg2 HL, leg3 HR (x, y)
LEG_TOP = 1.45                            # leg pivots (body space); the hoof's bottom is at z = 0
DROP = 0.15                               # the whole donkey sits this much lower (shorter, sturdier legs)
LEG_LEN = LEG_TOP - DROP
SCALE = 1.2                               # the whole donkey (and its loads, also as free props) is built this much bigger

# where the loads hang (Blender, donkey space): origin of the item (its base centre) + its yaw about Z (deg)
SLOTS = {
    'basket': ((-1.08, 0.0, 1.02), 90.0),
    'sack': ((1.0, 0.0, 1.05), 90.0),
    'mat': ((0.0, 0.0, 2.4), 0.0),
}
PEG_Y = 0.36


def _ray_ellipsoid(o, d, c, r, R=None):
    """Distance along the ray o + t d to the far side of the ellipsoid (centre c, radii r, rotation R), or None."""
    Ri = R.inverted() if R is not None else None
    oo = (o - c) if Ri is None else Ri @ (o - c)
    dd = d if Ri is None else Ri @ d
    a = sum((dd[i] / r[i]) ** 2 for i in range(3))
    b = 2 * sum(oo[i] * dd[i] / r[i] ** 2 for i in range(3))
    cc = sum((oo[i] / r[i]) ** 2 for i in range(3)) - 1
    disc = b * b - 4 * a * cc
    if disc < 0:
        return None
    return (-b + math.sqrt(disc)) / (2 * a)


def _out(o, d, shapes, pad=0.0):
    """The farthest surface point of a union of ellipsoids along a ray from inside (o, d normalised)."""
    d = d.normalized()
    best = 0.0
    for sh in shapes:
        t = _ray_ellipsoid(o, d, *sh)
        if t is not None and t > best:
            best = t
    return o + d * (best + pad)


def _body_shapes():
    return [(BODY_C, BODY_R), (BELLY_C, BELLY_R), (Vector((0, -0.72, 1.82)), Vector((0.5, 0.42, 0.55))),
            (Vector((0, 0.72, 1.86)), Vector((0.54, 0.45, 0.55)))]


def _ring(center, ax_a, ax_b, shapes, pad, n=28, a0=0.0, a1=2 * math.pi):
    pts = []
    for k in range(n + 1 if a1 - a0 < 2 * math.pi - 1e-6 else n):
        a = a0 + (a1 - a0) * k / (n if a1 - a0 < 2 * math.pi - 1e-6 else n)
        d = ax_a * math.cos(a) + ax_b * math.sin(a)
        pts.append(_out(center, d, shapes, pad))
    return pts


def _pompom(bm, c, r, col, seed):
    rng = np.random.default_rng(seed)
    blob(bm, tuple(c), (r * 0.8, r * 0.8, r * 0.8), col)
    for k in range(9):
        v = Vector(rng.normal(size=3)).normalized()
        blob(bm, tuple(c + v * r * 0.55), (r * 0.42, r * 0.42, r * 0.42), (min(1, col[0] * (0.92 + 0.16 * rng.random())), min(1, col[1] * (0.92 + 0.16 * rng.random())), min(1, col[2] * (0.92 + 0.16 * rng.random()))), subdiv=1)


# ---------------------------------------------------------------- the donkey
def body():
    """The body (static part): barrel, chest, rump, belly, neck, mane, shoulder cross, dorsal stripe. vcol."""
    b = new_bm()
    blob(b, tuple(BODY_C), tuple(BODY_R), COAT, subdiv=3)
    blob(b, (0, -0.72, 1.82), (0.5, 0.42, 0.55), COAT, subdiv=3)
    blob(b, (0, 0.72, 1.86), (0.54, 0.45, 0.55), COAT, subdiv=3)
    blob(b, tuple(BELLY_C), tuple(BELLY_R), LIGHT, subdiv=3)
    # the neck, rising to the head, a lighter throat
    curve_stick(b, [(0, -0.72, 1.92), (0, -0.98, 2.3), (0, -1.14, 2.58)], 0.33, COAT, sides=14)
    blob(b, (0, -0.98, 2.12), (0.27, 0.3, 0.3), COAT, subdiv=3)
    blob(b, (0, -1.1, 2.08), (0.18, 0.16, 0.26), LIGHT, rot=Matrix.Rotation(-0.5, 4, 'X'))
    # the mane: a crest of soft dark tufts along the top of the neck, up to the ears
    ax0, ax1 = Vector((0, -0.72, 1.92)), Vector((0, -1.14, 2.58))
    ax = (ax1 - ax0).normalized()
    nb = Vector((0, -ax.z, ax.y)) if ax.y < 0 else Vector((0, ax.z, -ax.y))   # perpendicular in YZ
    if nb.z < 0:
        nb = -nb
    for k in range(9):
        s = k / 8
        p = ax0.lerp(ax1, 0.05 + 0.95 * s) + nb * (0.29 - 0.04 * s)
        blob(b, tuple(p), (0.07, 0.09, 0.12 + 0.02 * math.sin(k * 1.7)), MANE, rot=Matrix.Rotation(-0.55 + 0.25 * math.sin(k * 2.3), 4, 'X'))
    # the dark cross on the shoulders and the stripe along the back (a donkey's own marking)
    blob(b, (0, -0.6, 2.22), (0.52, 0.05, 0.2), DARK)
    blob(b, (0, 0.1, 2.33), (0.05, 1.0, 0.06), DARK)
    return b


def girth():
    """The red girth strap round the belly, under the blanket (vcol)."""
    g = new_bm()
    pts = _ring(Vector((0, 0.05, 1.7)), Vector((1, 0, 0)), Vector((0, 0, -1)), _body_shapes(), 0.03, n=20, a0=-0.3, a1=math.pi + 0.3)
    tube(g, pts, 0.05, sides=6)
    set_color(g, RED)
    return g


BLANKET_COLS = [(0.82, 0.18, 0.13), (0.98, 0.9, 0.72), (0.18, 0.42, 0.75), (0.98, 0.72, 0.16), (0.2, 0.55, 0.3),
                (0.98, 0.9, 0.72), (0.82, 0.18, 0.13)]


def blanket():
    """The striped saddle blanket draped over the back, stripes along the spine, a yellow border and a fringe (vcol)."""
    bm = new_bm()
    cl = bm.loops.layers.color['Col']
    NU, NV = 34, 12
    TH = 1.72
    shapes = _body_shapes()
    grid = []
    for i in range(NU + 1):
        th = -TH + 2 * TH * i / NU
        row = []
        for j in range(NV + 1):
            y = -0.5 + j / NV
            c = Vector((0, y, BODY_C.z))
            d = Vector((math.sin(th), 0, math.cos(th)))
            p = _out(c, d, shapes, 0.035 + 0.012 * (1 - abs(th) / TH))
            row.append(bm.verts.new(p))
        grid.append(row)
    for i in range(NU):
        th = -TH + 2 * TH * (i + 0.5) / NU
        band = int(abs(th) / TH * 7 * 0.999)
        col = (*BLANKET_COLS[band], 1)
        for j in range(NV):
            f = bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]))
            for l in f.loops:
                l[cl] = col
    # a second skin a little inside (the blanket has a thickness; never a see-through edge)
    inner = bm.copy()
    for v in inner.verts:
        d = (v.co - Vector((0, v.co.y, BODY_C.z))).normalized()
        v.co -= d * 0.025
    bmesh.ops.reverse_faces(inner, faces=inner.faces)
    merge(bm, inner)
    # the yellow border round the edge
    edge = [grid[i][0].co.copy() for i in range(NU + 1)] + [grid[NU][j].co.copy() for j in range(1, NV + 1)] + \
           [grid[i][NV].co.copy() for i in range(NU - 1, -1, -1)] + [grid[0][j].co.copy() for j in range(NV - 1, 0, -1)]
    e = new_bm()
    tube(e, edge, 0.03, sides=6, closed=True)
    set_color(e, (0.98, 0.78, 0.2))
    merge(bm, e)
    # little red tassels at the four corners (the sides stay free for the loads)
    for side in (0, NU):
        for j in (0, NV):
            p = grid[side][j].co
            t = new_bm()
            curve_stick(t, [tuple(p), (p.x * 1.03, p.y * 1.04, p.z - 0.12)], 0.02, (0.98, 0.78, 0.2), sides=4)
            blob(t, (p.x * 1.03, p.y * 1.04, p.z - 0.15), (0.035, 0.035, 0.05), RED, subdiv=1)
            merge(bm, t)
    return bm


def saddle():
    """The wooden sawbuck pack saddle: two side boards on the blanket, crossed sticks front and back (an X over the spine),
    and pegs at the ends of the boards for the ropes of the loads. UVs for the wood texture."""
    w = new_bm()
    shapes = _body_shapes()
    TB = 0.78
    for s in (-1, 1):
        th = s * TB
        pts = []
        for y in np.linspace(-0.46, 0.46, 7):
            c = Vector((0, y, BODY_C.z))
            pts.append(_out(c, Vector((math.sin(th), 0, math.cos(th))), shapes, 0.08))
        # a board = a flat tube (radius in two directions) — approximate with a tube of radius 0.06 + a wider flat one
        tube(w, pts, 0.06, sides=6, uv_v=0.6)
        for y in (-PEG_Y - 0.08, PEG_Y + 0.08):
            c = Vector((0, y, BODY_C.z))
            p = _out(c, Vector((math.sin(th), 0, math.cos(th))), shapes, 0.08)
            n = Vector((math.sin(th), 0, math.cos(th)))
            tube(w, [p, p + n * 0.2 + Vector((0, 0, 0.04))], [0.04, 0.035], sides=6, uv_v=0.3)       # peg
    for y in (-PEG_Y, PEG_Y):
        c = Vector((0, y, BODY_C.z))
        lo = {s: _out(c, Vector((math.sin(s * TB), 0, math.cos(s * TB))), shapes, 0.1) for s in (-1, 1)}
        for s in (-1, 1):
            a = lo[s]
            b = Vector((-s * 0.24, y, a.z + 0.52))
            tube(w, [a, b], 0.045, sides=6, uv_v=0.5)
    return w


def saddle_points():
    """Where the ropes of the side loads are tied: the pegs (x side, y front/back) → their tips (Blender)."""
    shapes = _body_shapes()
    out = {}
    for s in (-1, 1):
        th = s * 0.78
        for y in (-PEG_Y - 0.08, PEG_Y + 0.08):
            c = Vector((0, y, BODY_C.z))
            p = _out(c, Vector((math.sin(th), 0, math.cos(th))), shapes, 0.08)
            n = Vector((math.sin(th), 0, math.cos(th)))
            out[(s, 1 if y > 0 else -1)] = p + n * 0.16 + Vector((0, 0, 0.03))
    return out


def collar():
    """The red collar round the base of the neck (vcol) and the pivot + mesh of the little golden bell under it."""
    c = new_bm()
    ax = (Vector((0, -0.98, 2.3)) - Vector((0, -0.72, 1.92))).normalized()
    w = Vector((0, ax.z, -ax.y))
    if w.z > 0:
        w = -w   # towards the throat (down and forward)
    cen = Vector((0, -0.86, 2.12))
    shapes = [(Vector((0, -0.98, 2.12)), Vector((0.27, 0.3, 0.3))), (cen, Vector((0.33, 0.33, 0.33)))]
    pts = _ring(cen, Vector((1, 0, 0)), w, shapes, 0.02, n=24)
    tube(c, pts, 0.05, sides=6, closed=True)
    set_color(c, RED)
    # two little blue beads on the collar
    for s in (-1, 1):
        p = _out(cen, Vector((s * 0.9, 0, 0)) + w * 0.5, shapes, 0.06)
        blob(c, tuple(p), (0.05, 0.05, 0.05), (0.15, 0.45, 0.85))
    bell_p = _out(cen, w, shapes, 0.06)
    bell = new_bm()
    lathe(bell, [(0.0, -0.2), (0.11, -0.2), (0.12, -0.17), (0.1, -0.1), (0.07, -0.03), (0.03, 0.0), (0.0, 0.02)], segs=16)
    blob(bell, (0, 0, -0.21), (0.035, 0.035, 0.035), (1, 1, 1), subdiv=1)
    tube(bell, [Vector((0, 0, 0.0)), Vector((0, 0, 0.06))], 0.02, sides=5)
    return c, bell, bell_p


def head():
    """The head (part pivot at HEAD_P, geometry relative to it): skull, snout, cream muzzle, nostrils, a smile, pink cheeks,
    a forelock, the red bridle with pompoms, a short lead rope. vcol. Returns (head bm, eye centres, ear pivots, jaw pivot)."""
    h = new_bm()
    skull_c, skull_r = Vector((0, -0.1, 0.12)), Vector((0.3, 0.33, 0.29))
    snout_c, snout_r, snout_R = Vector((0, -0.42, -0.08)), Vector((0.25, 0.36, 0.24)), Matrix.Rotation(0.55, 3, 'X')
    muz_c, muz_r = Vector((0, -0.68, -0.24)), Vector((0.27, 0.22, 0.22))
    blob(h, tuple(skull_c), tuple(skull_r), COAT, subdiv=3)
    blob(h, tuple(snout_c), tuple(snout_r), COAT, subdiv=3, rot=snout_R.to_4x4())
    blob(h, tuple(muz_c), tuple(muz_r), LIGHT, subdiv=3)
    shapes = [(skull_c, skull_r), (snout_c, snout_r, snout_R), (muz_c, muz_r)]
    # nostrils
    for s in (-1, 1):
        p = _out(muz_c, Vector((s * 0.45, -0.75, 0.25)), [(muz_c, muz_r)], -0.012)
        blob(h, tuple(p), (0.035, 0.03, 0.05), (0.35, 0.22, 0.22), rot=Matrix.Rotation(s * 0.5, 4, 'Y'))
    # a big happy open smile on the front of the muzzle (the poster): a dark-red mouth, a pink tongue, two little teeth
    mn = Vector((0, -0.7, -0.72)).normalized()
    mp = _out(muz_c, mn, [(muz_c, muz_r)], 0.0)
    R_ = Vector((0, 0, 1)).rotation_difference(mn).to_matrix().to_4x4()
    smb = new_bm()
    blob(smb, tuple(mp - mn * 0.025), (0.14, 0.075, 0.05), (0.42, 0.1, 0.12), subdiv=3, rot=R_)
    blob(smb, tuple(mp - mn * 0.012 + Vector((0, 0.0, -0.035))), (0.075, 0.04, 0.03), (0.95, 0.45, 0.5), subdiv=2, rot=R_)
    for sx in (-0.035, 0.035):
        blob(smb, tuple(mp - mn * 0.01 + Vector((sx, -0.01, 0.045))), (0.03, 0.018, 0.022), (1, 1, 1), subdiv=1, rot=R_)
    merge(h, smb)
    # pink cheeks
    for s in (-1, 1):
        p = _out(snout_c, Vector((s * 0.85, -0.35, -0.1)), shapes, -0.03)
        blob(h, tuple(p), (0.03, 0.08, 0.06), PINK, rot=Matrix.Rotation(s * 0.15, 4, 'Z'))
    # the forelock between the ears
    for k, (x, y, z, tx, ty, tz) in enumerate(((0.0, -0.12, 0.36, 0.0, -0.22, 0.66), (-0.08, -0.1, 0.36, -0.2, -0.16, 0.6), (0.08, -0.1, 0.36, 0.2, -0.16, 0.6),
                                                 (-0.04, -0.2, 0.33, -0.1, -0.36, 0.52), (0.04, -0.2, 0.33, 0.1, -0.36, 0.52), (0.0, -0.02, 0.38, 0.0, -0.06, 0.64))):
        cone(h, (x, y, z), (tx, ty, tz), 0.075, MANE, sides=7)          # a spiky dark forelock
    blob(h, (0, -0.12, 0.38), (0.13, 0.12, 0.08), MANE)
    # the bridle (as on the poster): only a red noseband low round the snout — nothing near the eyes — with a big yellow
    # pompom and a small blue one on each side, and a little blue tassel
    ax = (muz_c - skull_c).normalized()
    up = Vector((0, -ax.z, ax.y))
    if up.z < 0:
        up = -up
    nose_c = skull_c.lerp(muz_c, 0.8)
    nb = _ring(nose_c, Vector((1, 0, 0)), up, shapes, 0.025, n=24)
    br = new_bm()
    tube(br, nb, 0.036, sides=6, closed=True)
    set_color(br, RED)
    merge(h, br)
    for s in (-1, 1):
        p = _out(nose_c, Vector((s, 0, 0.1)), shapes, 0.08)
        _pompom(h, p, 0.085, (1.0, 0.78, 0.12), 3 + s)
        q = p + Vector((s * 0.01, -0.02, -0.13))
        _pompom(h, q, 0.055, (0.18, 0.45, 0.9), 7 + s)
        t = new_bm()
        curve_stick(t, [tuple(q + Vector((0, 0, -0.04))), tuple(q + Vector((s * 0.015, 0, -0.17)))], 0.016, (0.18, 0.45, 0.9), sides=4)
        blob(t, tuple(q + Vector((s * 0.015, 0, -0.2))), (0.028, 0.028, 0.04), (0.18, 0.45, 0.9), subdiv=1)
        merge(h, t)
    # eyes: on the sides of the skull, a little forward
    eyes = []
    for s in (-1, 1):
        d = Vector((s * 0.6, -0.72, 0.36)).normalized()       # big, looking forward (the poster)
        p = _out(skull_c, d, [(skull_c, skull_r)], -0.012)   # the flattened eye sits IN the skull: only ~0.03 shows
        eyes.append((p, d))
    ears = [Vector((s * 0.14, -0.02, 0.36)) for s in (-1, 1)]
    jaw_p = Vector((0, -0.38, -0.33))
    return h, eyes, ears, jaw_p


def eye(d, s):
    """One eye at the origin, looking along d: a white set INTO the head (flattened along d, so it does not bulge out of
    the skull), a warm brown iris, a dark pupil, two highlights, three lashes. vcol."""
    e = new_bm()
    q = Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
    blob(e, (0, 0, 0), (0.085, 0.085, 0.04), (0.99, 0.98, 0.96), subdiv=3, rot=q)
    blob(e, tuple(d * 0.025), (0.055, 0.055, 0.02), (0.48, 0.27, 0.12), subdiv=3, rot=q)       # a warm brown iris
    blob(e, tuple(d * 0.034), (0.032, 0.032, 0.014), (0.04, 0.025, 0.02), subdiv=3, rot=q)
    fw = Vector((0, -1, 0))
    up = Vector((0, 0, 1))
    blob(e, tuple(d * 0.046 + up * 0.02 + fw * 0.012), (0.015, 0.015, 0.006), (1, 1, 1), subdiv=2, rot=q)
    blob(e, tuple(d * 0.045 - up * 0.016 - fw * 0.01), (0.008, 0.008, 0.004), (1, 1, 1), subdiv=1, rot=q)
    for k in range(3):   # eyelashes on the upper rim, curling out
        a = -0.5 + 0.5 * k
        side = d.cross(up).normalized()
        base = d * 0.02 + up * 0.07 + side * (0.04 * a)
        tip = base + up * 0.045 + d * 0.03 + side * (0.02 * a) + fw * 0.0
        curve_stick(e, [tuple(base), tuple(base + up * 0.025 + d * 0.022), tuple(tip)], 0.008, (0.08, 0.06, 0.05), sides=4)
    return e


def eyelid(d):
    """The blinking lid: a coat-coloured cap over the eye (look.js `blink` scales it shut for a moment)."""
    l = new_bm()
    q = Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()
    blob(l, (0, 0, 0), (0.105, 0.105, 0.075), COAT, subdiv=3, rot=q)   # just over the flat eye
    return l


def ear(s):
    """One long ear standing up from its base (origin), inner side pink towards -Y, a dark tip. vcol."""
    e = new_bm()
    blob(e, (0, 0, 0.4), (0.12, 0.06, 0.42), COAT, subdiv=3)
    blob(e, (0, -0.04, 0.4), (0.075, 0.03, 0.32), PINK, subdiv=3)
    blob(e, (0, 0, 0.76), (0.08, 0.055, 0.1), DARK, subdiv=2)
    blob(e, (0, 0.01, 0.06), (0.1, 0.08, 0.1), COAT, subdiv=2)
    return e


def jaw():
    """The lower jaw (pivot at its back, geometry relative to it): cream, with a pink tongue; it opens to bray. vcol."""
    j = new_bm()
    blob(j, (0, -0.25, 0.04), (0.19, 0.25, 0.1), LIGHT, subdiv=3, rot=Matrix.Rotation(0.15, 4, 'X'))
    blob(j, (0, -0.28, 0.1), (0.12, 0.17, 0.04), (0.9, 0.42, 0.45), subdiv=2)
    for s in (-1, 1):
        blob(j, (s * 0.05, -0.43, 0.13), (0.035, 0.02, 0.03), (1, 1, 1), subdiv=1)
    return j


def leg(front):
    """One leg hanging from its pivot (origin) down to the ground (z = -LEG_LEN): thigh, shank, white sock, dark hoof. vcol."""
    g = new_bm()
    blob(g, (0, 0.02 if front else -0.04, -0.12), (0.18, 0.25, 0.32), COAT, subdiv=3)
    curve_stick(g, [(0, 0, -0.1), (0, 0.02 if front else -0.05, -0.7), (0, 0, -1.2)], 0.14, COAT, sides=10)
    blob(g, (0, 0.0 if front else -0.04, -0.72), (0.15, 0.15, 0.13), COAT, subdiv=2)          # knee / hock
    blob(g, (0, 0, -1.19), (0.145, 0.145, 0.13), LIGHT, subdiv=2)
    blob(g, (0, -0.02, -1.36), (0.16, 0.18, 0.09), HOOF, subdiv=2)
    transform(g, Matrix.Diagonal((1, 1, LEG_LEN / LEG_TOP, 1)))
    return g


def tail():
    """The tail from its root (origin): a thin tail and a fluffy dark tuft. vcol."""
    t = new_bm()
    curve_stick(t, [(0, 0, 0), (0, 0.18, -0.32), (0, 0.22, -0.72)], 0.055, COAT, sides=7)
    for k, (x, y, z) in enumerate(((0, 0.23, -0.82), (0.05, 0.24, -0.9), (-0.05, 0.22, -0.9), (0, 0.25, -0.98), (0.02, 0.2, -1.02))):
        blob(t, (x, y, z), (0.07, 0.07, 0.13), MANE, subdiv=2)
    return t


def lead_rope():
    """A short lead rope hanging from the noseband under the chin (head space). UVs for the rope texture."""
    r = new_bm()
    p0 = Vector((0, -0.58, -0.4))
    tube(r, [p0, p0 + Vector((0, 0.04, -0.15)), p0 + Vector((0, 0.12, -0.3)), p0 + Vector((0, 0.24, -0.36))], 0.028, sides=6, uv_v=0.25)
    return r


# ---------------------------------------------------------------- the loads (free props share these meshes)
def dates_basket():
    """(weave bm, dates bm, leaves bm, grip z): a woven basket r 0.4, h 0.5, its handle arc along X, heaped with dates."""
    R, H = 0.4, 0.5
    w = new_bm()
    lathe(w, [(0.0, 0.0), (R * 0.75, 0.0), (R * 0.85, 0.04), (R, H * 0.6), (R * 1.04, H), (R * 0.96, H), (R * 0.92, H * 0.6), (R * 0.78, 0.06), (0.0, 0.06)],
          segs=22, uv_v=0.25, uv_u=6.0)
    tube(w, [Vector((math.cos(a) * R * 1.02, math.sin(a) * R * 1.02, H)) for a in np.linspace(0, 2 * math.pi, 25)], 0.04, sides=5, cap=False, uv_v=0.2)
    tube(w, [Vector((-R * 0.95, 0, H)), Vector((-R * 0.62, 0, H + R * 0.78)), Vector((0, 0, H + R + 0.02)), Vector((R * 0.62, 0, H + R * 0.78)), Vector((R * 0.95, 0, H))], 0.04, sides=6, uv_v=0.2)
    d = new_bm()
    rng = np.random.default_rng(49)
    for k in range(34):
        a = rng.random() * 2 * math.pi
        r_ = R * 0.82 * math.sqrt(rng.random())
        z = H - 0.02 + 0.12 * (1 - (r_ / R) ** 2) + 0.03 * rng.random()
        if abs(math.cos(a) * r_) < 0.06 and abs(math.sin(a) * r_) < 0.07:
            z += 0.02
        col = [(0.45, 0.2, 0.08), (0.58, 0.28, 0.1), (0.36, 0.14, 0.06), (0.7, 0.38, 0.12)][k % 4]
        blob(d, (math.cos(a) * r_, math.sin(a) * r_, z), (0.06, 0.04, 0.04), col, subdiv=2, rot=Matrix.Rotation(rng.random() * 3, 4, 'Z') @ Matrix.Rotation(0.3 * (rng.random() - 0.5), 4, 'X'))
    lv = new_bm()
    for k, (a, L) in enumerate(((0.6, 0.55), (2.3, 0.5), (4.1, 0.45))):
        base = Vector((math.cos(a) * 0.1, math.sin(a) * 0.1, H + 0.1))
        tip = base + Vector((math.cos(a) * L, math.sin(a) * L * 0.4, 0.18))
        s = new_bm()
        tube(s, [base, base.lerp(tip, 0.5) + Vector((0, 0, 0.06)), tip], [0.05, 0.06, 0.005], sides=4)
        for v in s.verts:
            v.co.z = base.z + (v.co.z - base.z) * 0.6
        set_color(s, (0.32, 0.6, 0.22) if k % 2 == 0 else (0.42, 0.68, 0.26))
        merge(lv, s)
    return w, d, lv, H + R + 0.02


def bread_sack():
    """(cloth bm, rope bm, loaves bm, grip z): a burlap sack ≈ 0.95 tall, cinched loosely at the neck with a rope (two
    loops = the handle the ropes / the hand hold), two round loaves showing in its open mouth."""
    NECK = 0.78
    prof = [(0.0, 0.0), (0.26, 0.0), (0.36, 0.05), (0.4, 0.16), (0.39, 0.34), (0.35, 0.5), (0.27, 0.64), (0.17, NECK - 0.04),
            (0.13, NECK), (0.15, NECK + 0.05), (0.23, NECK + 0.12), (0.29, NECK + 0.15)]
    b = new_bm()
    lathe(b, prof, segs=36, uv_u=3.0, uv_v=1.5, cap_bottom=True)
    for v in b.verts:
        a = math.atan2(v.co.y, v.co.x)
        r = math.hypot(v.co.x, v.co.y)
        z = v.co.z
        if r < 1e-4:
            continue
        k = 1.0 + 0.09 * math.sin(a * 5 + 0.7 * z) * max(0.0, min(1.0, (z - 0.15) / 0.45)) * (1 if z < NECK else 0)   # soft cloth folds up to the tie
        if z < 0.3:
            v.co.z *= 1.0 + 0.15 * math.sin(a * 3)   # a slouchy bottom
        if z > NECK + 0.06:
            k *= 1.0 + 0.12 * math.sin(a * 9) * (z - NECK - 0.06) / 0.1
            v.co.z += 0.025 * math.sin(a * 9 + 1.0) * (z - NECK - 0.06) / 0.1
        v.co.x *= k
        v.co.y *= k
    rp = new_bm()
    tube(rp, [Vector((0.165 * math.cos(a), 0.165 * math.sin(a), NECK + 0.01)) for a in np.linspace(0, 2 * math.pi, 25)], 0.03, sides=6, uv_v=0.3, closed=True)
    # a rope loop over the top (the handle), along X
    tube(rp, [Vector((-0.17, 0, NECK + 0.01)), Vector((-0.2, 0, NECK + 0.17)), Vector((0, 0, NECK + 0.3)), Vector((0.2, 0, NECK + 0.17)), Vector((0.17, 0, NECK + 0.01))], 0.028, sides=6, uv_v=0.3)
    lo = new_bm()
    for k, (x, y, z, r_) in enumerate(((-0.08, 0.03, NECK + 0.14, 0.17), (0.1, -0.05, NECK + 0.12, 0.15))):
        s = new_bm()
        blob(s, (x, y, z), (r_, r_, r_ * 0.62), (0.86, 0.55, 0.22), subdiv=3)
        # the baked top: darker, with three scores
        for v in s.verts:
            if v.co.z > z + r_ * 0.25:
                pass
        merge(lo, s)
        for c in range(3):
            sc_ = new_bm()
            blob(sc_, (x - 0.06 + 0.06 * c, y, z + r_ * 0.6), (0.012, r_ * 0.55, 0.012), (0.98, 0.85, 0.6), subdiv=1)
            merge(lo, sc_)
    return b, rp, lo, NECK + 0.3


def mat_roll():
    """(weave bm, ends bm, rope bm, grip z): a palm-leaf mat rolled up (along X, 1.2 long, r 0.2 — no wider than the donkey,
    so the loaders at its sides never meet its ends) lying on the ground, two rope ties and a short carrying loop on top."""
    L, R = 1.2, 0.2
    w = new_bm()
    tube(w, [Vector((-L / 2, 0, R)), Vector((L / 2, 0, R))], R, sides=20, cap=False, uv_v=0.6)
    ends = new_bm()
    for s in (-1, 1):   # the rolled ends: a spiral of light and dark rings
        for k in range(5):
            r0, r1 = R * (k / 5), R * ((k + 1) / 5)
            ring = new_bm()
            lathe(ring, [(r0, 0.0), (r1, 0.0)], segs=20)
            transform(ring, Matrix.Translation((s * L / 2, 0, R)) @ Matrix.Rotation(s * math.pi / 2, 4, 'Y'))
            set_color(ring, (0.88, 0.72, 0.42) if k % 2 == 0 else (0.62, 0.45, 0.22))
            if s < 0:
                bmesh.ops.reverse_faces(ring, faces=ring.faces)
            merge(ends, ring)
    rp = new_bm()
    for x in (-0.35, 0.35):
        tube(rp, [Vector((x, (R + 0.025) * math.sin(a), R + (R + 0.025) * math.cos(a))) for a in np.linspace(0, 2 * math.pi, 21)], 0.03, sides=6, uv_v=0.3, closed=True)
    tube(rp, [Vector((-0.35, 0, 2 * R + 0.02)), Vector((-0.24, 0, 2 * R + 0.13)), Vector((0, 0, 2 * R + 0.17)), Vector((0.24, 0, 2 * R + 0.13)), Vector((0.35, 0, 2 * R + 0.02))], 0.028, sides=6, uv_v=0.3)
    return w, ends, rp, 2 * R + 0.17


def slot_matrix(name):
    p, yaw = SLOTS[name]
    return Matrix.Translation(p) @ Matrix.Rotation(math.radians(yaw), 4, 'Z')


def hang_ropes(name, grip_z):
    """The ropes that hold a load: from its handle / neck to the two pegs of its side (Blender, donkey space). UVs."""
    r = new_bm()
    pegs = saddle_points()
    p, yaw = SLOTS[name]
    p = Vector(p)
    if name == 'mat':
        # two ropes from the ties round the roll down to the pegs on both sides (front one left, back one right)
        for x, s, fb in ((-0.35, -1, -1), (0.35, 1, 1), (-0.35, -1, 1), (0.35, 1, -1)):
            a = p + Vector((x, 0, 0.2)) + Vector((s * 0.0, 0, 0)) + Vector((0, 0, 0))
            a = Vector((x * 0.98, 0.0, p.z + 0.2)) + Vector((s * 0.03, 0, -0.17))
            b = pegs[(s, fb)]
            tube(r, [a, a.lerp(b, 0.5) + Vector((0, 0, -0.03)), b], 0.024, sides=5, uv_v=0.3)
        return r
    s = 1 if p.x > 0 else -1
    top = p + Vector((0, 0, grip_z))
    for fb in (-1, 1):
        b = pegs[(s, fb)]
        tube(r, [top, top.lerp(b, 0.5) + Vector((0, 0, -0.04)), b], 0.026, sides=5, uv_v=0.3)
    # a knot at the handle
    blob(r, tuple(top + Vector((0, 0, 0.01))), (0.05, 0.05, 0.05), (1, 1, 1), subdiv=1)
    return r
