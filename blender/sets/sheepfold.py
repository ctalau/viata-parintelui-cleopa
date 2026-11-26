"""Set `sheepfold`: a green hillside in Cyprus with a shepherd's dry-stone sheepfold (film 047, Avva Spiridon).

three.js layout (x right, z towards the usual camera, y up; figure 4.2 tall):
  * the sheepfold in the middle (an oval dry-stone wall, 1.5 high — a figure is seen from the waist up over it — centre
    FOLD, its wooden gate at the front, x = 0, z ≈ -4, node `door:gate`), sheep inside (heads browse, tails swish, two lie
    down chewing, a lamb looks about), a stone water trough beside it,
  * the shepherd's little stone house on the right (door node `door:hut`, towards +Z), straw beehives and hens beside it,
  * a big old olive tree on the front left with a little owl on a branch, a bunny in the grass, olive trees and dark
    cypresses round about, poppies and daisies, butterflies, a lizard on a warm rock, a tortoise,
  * green hills behind, a little white town with a church on a far hill.
Skies: day, morning, evening, night (stars and the moon over the fold).
"""
import math
import os
import json
import numpy as np
import bmesh
from mathutils import Matrix, Vector, noise

from kit import core, tex, pieces, critters
from kit.core import B, place, Batch, Scene

NAME = 'sheepfold'
CORE = (-46.0, 46.0, -46.0, 24.0)
TEX_W, TEX_H = 2048, 1536
FOLD = (0.0, -9.5)                    # centre of the fold
FRX, FRZ = 7.5, 5.5                   # half axes of the oval wall (centre line)
WALL_H = 1.5
GATE_W = 3.0
GATE_Z = FOLD[1] + FRZ                # -4.0: the front of the fold, where the gate is
HUT = (19.0, -10.0)
HUT_W, HUT_D, HUT_H = 8.0, 7.0, 6.2
HUT_FRONT = HUT[1] + HUT_D / 2       # -6.5
TREE = (-12.0, -1.5)
TOWN = (-40.0, -66.0)


def _curve(p0, p1, p2, n=16):
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
    return out


PATH = _curve((-78.0, 13.0), (-16.0, 6.0), (0.0, GATE_Z + 1.4), 24)          # from the left to the gate
PATH_HUT = _curve((0.0, GATE_Z + 1.4), (10.0, 0.5), (HUT[0], HUT_FRONT + 1.2), 14)   # from the gate to the house


def dist_to_poly(px, pz, pts):
    best = 1e9
    for (ax, az), (bx, bz) in zip(pts[:-1], pts[1:]):
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz
        t = 0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / L2))
        best = min(best, math.hypot(px - ax - t * dx, pz - az - t * dz))
    return best


def path_dist(x, z):
    return min(dist_to_poly(x, z, PATH) - 1.4, dist_to_poly(x, z, PATH_HUT) - 1.1)


def smooth(e0, e1, v):
    t = min(1.0, max(0.0, (v - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def fold_r(x, z):
    """the oval 'radius' of a point round the fold centre (1 = on the wall's centre line)"""
    return math.hypot((x - FOLD[0]) / FRX, (z - FOLD[1]) / FRZ)


def H(x, z):
    """a flat green meadow for the acting area, rolling hills behind and to the sides, the town's hill far away"""
    hgt = 0.0
    back = smooth(-18.0, -70.0, z)                          # rising behind the fold
    side = smooth(34.0, 80.0, abs(x))
    k = max(back, side)
    if k > 0:
        roll = noise.fractal(Vector((x * 0.018 + 2.3, z * 0.018, 4.1)), 0.5, 2.0, 3)
        hgt += k * (9.0 + 6.0 * roll + 4.0 * math.sin(x * 0.035 + 1.2))
    hgt += 7.0 * math.exp(-((x - TOWN[0]) ** 2 + (z - TOWN[1]) ** 2) / 260.0)
    front = smooth(22.0, 60.0, z)                           # a low swell far in front
    if front > 0:
        hgt += front * 3.0 * (0.6 + 0.4 * math.sin(x * 0.05))
    return hgt


# ---------------------------------------------------------------- ground
def ground_core(sc, mat):
    x0, x1, z0, z1 = CORE
    st = 0.75
    nx, nz = int((x1 - x0) / st), int((z1 - z0) / st)
    bm = core.new_bm()
    uvl = bm.loops.layers.uv[core.UV0]
    verts = [[bm.verts.new(B(x0 + i * st, H(x0 + i * st, z0 + j * st), z0 + j * st)) for i in range(nx + 1)] for j in range(nz + 1)]
    for j in range(nz):
        for i in range(nx):
            f = bm.faces.new((verts[j][i], verts[j + 1][i], verts[j + 1][i + 1], verts[j][i + 1]))
            for l in f.loops:
                p = l.vert.co
                X, Z = p.x, -p.y
                l[uvl].uv = ((X - x0) / (x1 - x0), 1 - (Z - z0) / (z1 - z0))
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    if bm.faces[0].normal.z < 0:
        for f in bm.faces:
            f.normal_flip()
    b = Batch('ground', mat, ao=(TEX_W, TEX_H), ao_uv=core.UV0)
    b.bm.free(); b.bm = bm
    sc.batches['ground'] = b


def ground_far(sc, mat):
    x0, x1, z0, z1 = CORE
    border = []
    for i in range(int(x1 - x0)):
        border.append((x0 + i, z0))
    for j in range(int(z1 - z0)):
        border.append((x1, z0 + j))
    for i in range(int(x1 - x0)):
        border.append((x1 - i, z1))
    for j in range(int(z1 - z0)):
        border.append((x0, z1 - j))
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    hw, hd = (x1 - x0) / 2, (z1 - z0) / 2
    steps = [0, 1.5, 3.5, 6, 9.5, 14, 20, 28, 38, 52, 70, 95, 125, 165, 215, 280, 360]
    bm = core.new_bm()
    uvl = bm.loops.layers.uv[core.UV0]; cl = bm.loops.layers.color[core.COL]
    rings = []
    for s in steps:
        ring = []
        for (bx, bz) in border:
            dx, dz = bx - cx, bz - cz
            nrm = Vector((dx / hw, dz / hd)); nrm.normalize()
            x = bx + nrm.x * s * 1.25
            z = bz + nrm.y * s
            ring.append(bm.verts.new(B(x, H(x, z), z)))
        rings.append(ring)
    n = len(border)
    for r in range(len(steps) - 1):
        for i in range(n):
            a, b_ = rings[r][i], rings[r][(i + 1) % n]
            c, d = rings[r + 1][(i + 1) % n], rings[r + 1][i]
            try:
                bm.faces.new((a, b_, c, d))
            except ValueError:
                pass
    bm.normal_update()
    if sum(f.normal.z for f in bm.faces) < 0:
        for f in bm.faces:
            f.normal_flip()
    for f in bm.faces:
        for l in f.loops:
            p = l.vert.co
            l[uvl].uv = (p.x / 9.0, p.y / 9.0)
            nz = noise.noise(Vector((p.x * 0.03, p.y * 0.03, 2.0)))
            k = 0.93 + 0.07 * nz
            # green hills, golden dry grass on the tops, dark patches of scrub
            gold = smooth(9.0, 16.0, p.z + 3.0 * nz)
            scrub = max(0.0, noise.noise(Vector((p.x * 0.06, p.y * 0.06, 5.0))) - 0.25) * 1.6
            g = (0.52 * k, 0.74 * k, 0.36 * k)
            y_ = (0.86 * k, 0.78 * k, 0.45 * k)
            c = tuple(g[i] + (y_[i] - g[i]) * gold for i in range(3))
            c = tuple(c[i] * (1 - 0.35 * min(1.0, scrub)) for i in range(3))
            l[cl] = (*c, 1)
    b = Batch('ground_far', mat, ao=False, vcol=True)
    b.bm.free(); b.bm = bm
    sc.batches['ground_far'] = b


def ground_textures(occluders):
    """green meadow, a trodden earth patch in front of the gate and the house, dirt paths, the floor of the fold"""
    x0, x1, z0, z1 = CORE
    W, Hh = TEX_W, TEX_H
    xs = x0 + (np.arange(W) + 0.5) / W * (x1 - x0)
    zs = z0 + (np.arange(Hh) + 0.5) / Hh * (z1 - z0)
    X, Z = np.meshgrid(xs, zs)
    cs = 4
    Xc, Zc = X[::cs, ::cs], Z[::cs, ::cs]
    D = np.vectorize(path_dist)(Xc, Zc)
    D = np.kron(D, np.ones((cs, cs)))[:Hh, :W]
    D = tex.blur(D, 2.0)
    seed = 471
    n1 = tex.fbm(Hh, seed, 3.0, 1, 40, m=W)
    n2 = tex.fbm(Hh, seed + 1, 1.5, 20, 400, m=W)
    grain = tex.fbm(Hh, seed + 2, 0.0, 300, m=W)
    road = tex.smooth(0.7, -0.6, D)
    fr = np.hypot((X - FOLD[0]) / FRX, (Z - FOLD[1]) / FRZ)
    inside = tex.smooth(1.0, 0.8, fr + 0.06 * n1)                         # trodden straw and earth inside the fold
    gate = tex.smooth(1.0, 0.0, np.hypot((X - 0.0) / 4.5, (Z - (GATE_Z + 1.5)) / 2.6) + 0.2 * n1)
    hut = tex.smooth(1.0, 0.0, np.hypot((X - HUT[0]) / 6.5, (Z - (HUT_FRONT + 1.5)) / 3.0) + 0.2 * n1)
    yard = np.maximum(gate, hut)
    grass = tex.ramp(tex.norm01(n2 * 0.7 + grain * 0.05 + n1 * 0.3), [(0, '#5f9a35'), (0.5, '#7cb646'), (1, '#9cc95a')])
    earth = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#b98c5e'), (0.5, '#c99f70'), (1, '#dab384')])
    pathc = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#a97c50'), (0.5, '#bb905f'), (1, '#cda372')])
    straw = tex.ramp(tex.norm01(n2 * 0.5 + grain * 0.3 + n1 * 0.2), [(0, '#a98a52'), (0.5, '#c4a565'), (1, '#dcc07c')])
    col = grass
    col = col * (1 - yard[..., None]) + earth * yard[..., None]
    col = col * (1 - road[..., None]) + pathc * road[..., None]
    col = col * (1 - inside[..., None]) + straw * inside[..., None]
    col *= (1 + 0.05 * grain[..., None])
    dark = np.zeros_like(X)
    for (ox, oz, r) in occluders:
        dark = np.maximum(dark, np.exp(-((np.hypot(X - ox, Z - oz) / r) ** 2)))
    col *= (1 - 0.14 * dark[..., None])
    h = grain * 0.08 + n2 * 0.15
    nrm = tex.normal_from_height(tex.blur(h, 0.9), 1.8, wrap=False)
    rough = np.clip(0.9 - 0.06 * road + 0.03 * grain, 0, 1)
    return (tex.save('sheepfold_ground_col', col, 82), tex.save('sheepfold_ground_nrm', nrm, 72),
            tex.save('sheepfold_ground_orm', tex.pack_rough(rough), 80))


# ---------------------------------------------------------------- build
def build(out_dir, bake=True):
    core.reset()
    sc = Scene(NAME)
    T = core.texset
    stone_t = T('fieldstone', tex.sandstone, n=1024, seed=12, tint=[(0, '#9c9286'), (0.4, '#bdb2a2'), (0.75, '#d6cbb8'), (1, '#ebe2d0')])
    wood_t = T('wood', tex.wood, n=512, seed=4, colors=('#a8784a', '#86592f', '#5f3d20'))
    reeds_t = T('reeds', tex.reeds, n=512, seed=5)
    bark_t = T('olivebark', tex.bark, n=512, seed=19)
    clay_t = T('clay', tex.clay, n=512, seed=8)
    beam_t = T('beam', tex.wood, n=512, seed=14, planks=1, colors=('#9d7a52', '#7a5636', '#553820'))
    house_t = T('stonewash', tex.plaster, n=1024, seed=41, colors=('#f3e8d4', '#e6d6bb', '#d6c2a0'), brick='#c9ab84')
    white_t = T('whitewash', tex.plaster, n=1024, seed=31, colors=('#fdfaf3', '#f4ecdf', '#e9dcc8'), brick='#e2cfb4')
    straw_t = T('skep', tex.weave, n=512, seed=16, cells=10, colors=('#e9c46a', '#d1a347', '#a87b2c'))

    fx, fz = FOLD
    hx, hz = HUT
    occl = [(hx, hz, 6.5), (TREE[0], TREE[1], 5.5)]
    gt = ground_textures(occl)
    ground_core(sc, core.material('ground', gt, extras={'detail': 'sand'}))
    ground_far(sc, core.material('ground_far', T('grassfar', tex.sand, n=512, seed=1, base=('#f2f2ea', '#e6e6dc', '#d8d8cc'), ripples=False), vcol=True))

    mat = {
        'house': core.material('stonewash', house_t, vcol=True),
        'white': core.material('whitewash', white_t, vcol=True),
        'wood': core.material('wood', wood_t),
        'beam': core.material('beam', beam_t),
        'reeds': core.material('reeds', reeds_t, double=True),
        'rock': core.material('rock', stone_t, vcol=True),
        'stone': core.material('stone', stone_t),
        'bark': core.material('bark', bark_t),
        'leaf': core.material('olive_leaf', None, vcol=True, rough=0.75),
        'grass': core.material('grass', None, vcol=True, rough=0.8, double=True),
        'clay': core.material('clay', clay_t),
        'skep': core.material('skep', straw_t),
        'roof': core.material('roof_tiles', T('tiles', tex.clay, n=512, seed=18, colors=('#d2693c', '#b9542c', '#933f20'))),
    }
    Bt = lambda name, m, **kw: sc.batch(name, mat[m], **kw)
    gy = H
    m_crit = core.material('critter', None, vcol=True, rough=0.55)
    m_wool = core.material('wool', None, vcol=True, rough=0.9)
    m_wing = core.material('wing', None, vcol=True, rough=0.5, double=True)
    m_water = core.material('trough_water', None, color=(0.22, 0.52, 0.6), rough=0.08)
    reserve = []

    # ------------------------------------------------ the sheepfold: an oval dry-stone wall, a wooden gate at the front
    rng = np.random.default_rng(23)
    per = 2 * math.pi * math.sqrt((FRX ** 2 + FRZ ** 2) / 2)
    # a solid core of rubble along the oval (open at the gateway): nothing shows through between the stones
    a0 = math.asin((GATE_W / 2 + 0.2) / FRX)
    pts = []
    for i in range(121):
        th = a0 + (2 * math.pi - 2 * a0) * i / 120
        x, z = fx + FRX * math.sin(th), fz + FRZ * math.cos(th)
        pts.append(B(x, gy(x, z) + 0.62, z))
    band = core.new_bm()
    core.tube(band, pts, 0.38, sides=10, uv_v=1.5)
    for v in band.verts:
        v.co.z = 0.62 + (v.co.z - 0.62) * 1.55
    core.displace(band, 0.06, 1.2, seed=9)
    core.set_color(band, (0.42, 0.38, 0.33))
    Bt('fold_wall', 'rock', ao_density=18).add(band, None, uv_box=1.5)
    # dry-stone courses: flat slabs laid along the wall, warm grey-brown (never the white of the sheep)
    for course in range(5):
        zc = 0.02 + course * 0.29
        n = int(per / 0.82)
        for i in range(n):
            th = (i + 0.5 * (course % 2) + 0.12 * rng.random()) / n * 2 * math.pi
            x, z = fx + FRX * math.sin(th), fz + FRZ * math.cos(th)
            if z > fz and abs(x) < GATE_W / 2 + 0.25:
                continue                                             # the gateway
            tx_, tz_ = FRX * math.cos(th), -FRZ * math.sin(th)       # tangent
            face = math.degrees(math.atan2(tx_, tz_)) + 90
            L = 0.7 + 0.3 * rng.random() - 0.08 * course
            Hs = 0.24 + 0.06 * rng.random()
            st = core.new_bm()
            core.box(st, (L, 0.78 + 0.12 * rng.random(), Hs), (0, 0, Hs / 2), bevel=0.06, segs=2)
            core.displace(st, 0.03, 1.4, seed=3000 + course * 200 + i)
            k = 0.6 + 0.25 * rng.random()
            core.set_color(st, (k * 1.02, k * 0.93, k * 0.8))
            Bt('fold_wall', 'rock', ao_density=18).add(st, place(x, z, face + (rng.random() - 0.5) * 8, gy(x, z) + zc), uv_box=1.5)
    for i in range(int(per / 0.9)):                                   # flat capstones on top
        th = (i + 0.3) / int(per / 0.9) * 2 * math.pi
        x, z = fx + FRX * math.sin(th), fz + FRZ * math.cos(th)
        if z > fz and abs(x) < GATE_W / 2 + 0.25:
            continue
        tx_, tz_ = FRX * math.cos(th), -FRZ * math.sin(th)
        face = math.degrees(math.atan2(tx_, tz_)) + 90
        st = core.new_bm()
        core.box(st, (0.85, 0.95, 0.16), (0, 0, 0.08), bevel=0.05, segs=2)
        core.displace(st, 0.025, 1.4, seed=3900 + i)
        k = 0.55 + 0.2 * rng.random()
        core.set_color(st, (k, k * 0.92, k * 0.8))
        Bt('fold_wall', 'rock').add(st, place(x, z, face + (rng.random() - 0.5) * 10, gy(x, z) + WALL_H - 0.12), uv_box=1.5)
    # collision: short boxes along the wall (the gateway stays free)
    nseg = 28
    for i in range(nseg):
        th0, th1 = i / nseg * 2 * math.pi, (i + 1) / nseg * 2 * math.pi
        xa, za = fx + FRX * math.sin(th0), fz + FRZ * math.cos(th0)
        xb, zb = fx + FRX * math.sin(th1), fz + FRZ * math.cos(th1)
        xm, zm = (xa + xb) / 2, (za + zb) / 2
        if zm > fz and abs(xm) < GATE_W / 2 + 0.6:
            continue
        L = math.hypot(xb - xa, zb - za)
        sc.col_box(f'fold{i}', (L + 0.15, WALL_H, 1.0), xm, zm, math.degrees(math.atan2(xb - xa, zb - za)) - 90)
    # gate posts and the gate leaf (hinge on the right post: the engine's door swing then turns it inwards, into the fold)
    for sx in (-1, 1):
        post = core.new_bm()
        core.tube(post, [Vector((0, 0, -0.2)), Vector((0, 0, WALL_H + 0.45))], 0.17, sides=8, uv_v=1.5)
        Bt('beams', 'beam').add(post, place(sx * (GATE_W / 2 + 0.1), GATE_Z, 0, gy(sx * 1.6, GATE_Z)))
        sc.col_box(f'gatepost{"lr"[sx > 0]}', (0.45, WALL_H + 0.4, 0.45), sx * (GATE_W / 2 + 0.1), GATE_Z, 0)
    gw, gh = GATE_W - 0.2, 1.35
    gate = core.new_bm()
    for k in range(5):                                               # vertical palings
        x_ = 0.25 + k * (gw - 0.5) / 4
        core.box(gate, (0.16, 0.1, gh), (x_, 0, 0.25 + gh / 2), bevel=0.03)
    for zz in (0.55, 1.35):                                         # two rails and a brace
        core.box(gate, (gw, 0.12, 0.2), (gw / 2, -0.08, zz), bevel=0.03)
    br = core.new_bm(); core.box(br, (0.16, 0.1, 1.05), (0, 0, 0), bevel=0.02)
    core.transform(br, Matrix.Translation((gw / 2, -0.1, 0.95)) @ Matrix.Rotation(1.0, 4, 'Y'))
    core.merge(gate, br)
    core.transform(gate, Matrix.Diagonal((-1, 1, 1, 1)))                # leaf from the hinge towards -x
    bmesh.ops.reverse_faces(gate, faces=gate.faces[:])
    hinge = Vector((GATE_W / 2 - 0.12, 0, 0.0))
    core.transform(gate, Matrix.Translation(hinge))
    Mg = place(0.0, GATE_Z, 0.0, gy(0.0, GATE_Z))
    gate_b = Batch('door:gate', mat['wood'], ao=256)
    gate_b.add(gate, None)
    core.box_uv(gate_b.bm, 2.0)
    sc.batches['door:gate'] = gate_b
    gate_b.pivot = (Mg @ hinge)
    gate_b.M = Mg
    reserve.append((fx, fz, FRX + 1.2))
    # a stone water trough beside the fold (left), with water
    tx0, tz0 = -9.6, -10.0
    tr = core.new_bm()
    core.box(tr, (1.2, 3.2, 0.75), (0, 0, 0.375), bevel=0.12)
    core.displace(tr, 0.03, 0.8, seed=4)
    Bt('stones', 'stone').add(tr, place(tx0, tz0, 0, gy(tx0, tz0)), uv_box=1.5)
    wt = core.new_bm(); core.box(wt, (0.85, 2.8, 0.05), (0, 0, 0.66))
    sc.obj('trough.water', wt, m_water, place(tx0, tz0, 0, gy(tx0, tz0)), vcol=False)
    sc.col_box('trough', (1.3, 0.8, 3.3), tx0, tz0, 0)
    reserve.append((tx0, tz0, 2.0))

    # ------------------------------------------------ the sheep: standing ones browse, two lie and chew, a lamb hops
    sheep = [(-4.4, -10.6, 35, 'w', False), (-2.2, -12.9, -15, 'w', False), (3.4, -11.6, 200, 'w', False),
             (4.9, -8.6, 150, 'w', True), (-5.3, -7.7, 70, 'cream', True), (1.4, -13.6, 10, 'w', False),
             (5.0, -12.6, -150, 'dark', False), (-1.3, -10.3, 120, 'w', False), (-3.9, -13.2, 160, 'cream', False)]
    for k, (sx, sz, sf, coat, lying) in enumerate(sheep):
        wool = {'w': (1.0, 0.97, 0.88), 'cream': (0.98, 0.9, 0.74), 'dark': (0.36, 0.3, 0.27)}[coat]
        face = (0.26, 0.21, 0.19) if coat != 'dark' else (0.16, 0.13, 0.12)
        sb, sh, sp, st_, stp = critters.sheep_parts(wool, face, lying=lying, seed=40 + k)
        sk = sc.obj(f'sheep{k}', sb, m_wool, place(sx, sz, sf, gy(sx, sz)))
        sc.obj(f'sheep{k}.head', sh, m_wool, Matrix.Translation(sp), parent=sk,
               props={'anim': 'ruminate' if lying else 'browse', 'seed': 11 + 5 * k})
        sc.obj(f'sheep{k}.tail', st_, m_wool, Matrix.Translation(stp), parent=sk, props={'anim': 'swish', 'seed': 13 + 5 * k})
        sc.col_box(f'sheep{k}', (1.1, 1.6, 1.6), sx, sz, sf)
    lb, lh, lp, lt, ltp = critters.sheep_parts((1.0, 0.98, 0.95), (0.95, 0.82, 0.76), s=0.6, seed=77)
    lk = sc.obj('lamb', lb, m_wool, place(2.4, -9.2, 120, gy(2.4, -9.2)))      # a lamb standing by its mother: head looks about
    sc.obj('lamb.head', lh, m_wool, Matrix.Translation(lp), parent=lk, props={'anim': 'peck', 'freq': 0.5, 'seed': 29})
    sc.obj('lamb.tail', lt, m_wool, Matrix.Translation(ltp), parent=lk, props={'anim': 'swish', 'seed': 31})

    # ------------------------------------------------ the shepherd's stone house (right), beehives, hens
    parts, info = pieces.cell(seed=47, w=HUT_W, d=HUT_D, h=HUT_H, door_w=2.4, door_h=5.2, window_side=1)
    M = place(hx, hz, 0.0, 0.0)
    Bt('hut_wall', 'house', ao_density=26).add(parts['plaster'], M, uv_box=4.0)
    Bt('wood', 'wood').add(parts['wood'], M, uv_box=2.5)
    Bt('beams', 'beam').add(parts['beam'], M)
    Bt('reeds', 'reeds').add(parts['reeds'], M)
    Bt('stones', 'stone').add(parts['stone'], M, uv_box=2.0)
    dbm, dh = info['door']
    door_b = Batch('door:hut', mat['wood'], ao=256)
    door_b.add(dbm, None)
    core.box_uv(door_b.bm, 2.5)
    sc.batches['door:hut'] = door_b
    door_b.pivot = (M @ dh)
    door_b.M = M
    t_ = 0.75
    W_, D_ = HUT_W + 0.3, HUT_D + 0.3
    sc.col_box('hut-back', (W_, HUT_H, t_), hx, hz - D_ / 2 + t_ / 2, 0)
    sc.col_box('hut-left', (t_, HUT_H, D_), hx - W_ / 2 + t_ / 2, hz, 0)
    sc.col_box('hut-right', (t_, HUT_H, D_), hx + W_ / 2 - t_ / 2, hz, 0)
    dw_ = 2.6
    fz_ = hz + D_ / 2 - t_ / 2
    lw = (W_ - dw_) / 2
    sc.col_box('hut-front-l', (lw, HUT_H, t_), hx - dw_ / 2 - lw / 2, fz_, 0)
    sc.col_box('hut-front-r', (lw, HUT_H, t_), hx + dw_ / 2 + lw / 2, fz_, 0)
    sc.col_box('hut-lintel', (dw_, HUT_H - 5.2, t_), hx, fz_, 0, 5.2)
    # inside: a little shelf with a cross and a lamp, seen through the open door
    sh = core.new_bm(); core.box(sh, (1.8, 0.6, 0.12), (0, 0, 3.0), bevel=0.03)
    core.box(sh, (0.12, 0.1, 0.9), (0, 0, 3.6), bevel=0.02); core.box(sh, (0.55, 0.1, 0.12), (0, 0, 3.78), bevel=0.02)
    Bt('wood', 'wood').add(sh, place(hx, hz - HUT_D / 2 + 0.95, 0), uv_box=2.0)
    # a crook leaning by the door, a bench of stone, pots of basil
    for k, (ox, kind) in enumerate(((-3.0, 0), (-2.2, 2))):
        x_, z_ = hx + ox, HUT_FRONT + 0.7
        Bt('clay', 'clay').add(critters.pot(kind), place(x_, z_, k * 50, gy(x_, z_)))
        Bt('flowers', 'grass', vcol=True, ao=False).add(critters.green_tuft(2300 + k, r=0.35, h=0.5), place(x_, z_, 0, (1.3 if kind == 0 else 0.3)))
    sc.col_box('hut-pots', (2.0, 1.5, 1.2), hx - 2.6, HUT_FRONT + 0.7, 0)
    # three straw beehives on a plank, right of the house
    pl = core.new_bm(); core.box(pl, (4.2, 1.2, 0.5), (0, 0, 0.25), bevel=0.05)
    Bt('wood', 'wood').add(pl, place(hx + 6.4, hz + 1.0, -10, gy(hx + 6.4, hz + 1.0)), uv_box=2.0)
    for k in range(3):
        sk_ = core.new_bm()
        core.lathe(sk_, [(0.0, 1.35), (0.35, 1.3), (0.6, 1.1), (0.72, 0.8), (0.75, 0.4), (0.72, 0.0)], segs=20, uv_v=1.0)
        for ring in range(5):
            core.tube(sk_, [Vector((math.cos(a) * (0.76 - 0.05 * ring * ring / 4), math.sin(a) * (0.76 - 0.05 * ring * ring / 4), 0.12 + ring * 0.26)) for a in np.linspace(0, 2 * math.pi, 25)], 0.06, sides=5, closed=True)
        hole = core.new_bm(); core.box(hole, (0.3, 0.05, 0.18), (0, -0.74, 0.12))
        core.set_color(hole, (0.15, 0.1, 0.05))
        x_ = hx + 6.4 + (k - 1) * 1.35
        Mk = place(x_, hz + 1.0, -10 + k * 8, gy(x_, hz + 1.0) + 0.5)
        Bt('skep', 'skep', ao=False).add(sk_, Mk, uv_box=1.0)
        sc.batch('hole', m_crit, ao=False, vcol=True).add(hole, Mk)
    sc.col_box('beehives', (4.4, 2.0, 1.6), hx + 6.4, hz + 1.0, -10)
    reserve += [(hx, hz, 6.8), (hx + 6.4, hz + 1.0, 2.6)]
    hens = [(25.0, -2.8, 30, 'brown', 1.0), (13.8, -3.6, -40, 'white', 0.9), (27.5, -5.5, 200, 'white', 0.8)]
    for k2, (hx2, hz2, hf2, var, rad) in enumerate(hens):
        cols = ((0.72, 0.36, 0.16), (0.9, 0.62, 0.32), (0.5, 0.22, 0.1)) if var == 'brown' else ((0.97, 0.96, 0.93), (1.0, 1.0, 0.98), (0.85, 0.85, 0.83))
        hb, hh, hp_ = critters.hen(*cols)
        root = sc.obj(f'hen{k2 + 1}', hb, m_crit, place(hx2, hz2, hf2, gy(hx2, hz2)), props={'anim': 'hen', 'radius': rad, 'seed': 31 + 7 * k2})
        sc.obj(f'hen{k2 + 1}.head', hh, m_crit, Matrix.Translation(hp_), parent=root)
        reserve.append((hx2, hz2, rad + 0.6))

    # ------------------------------------------------ the big olive tree (front left) with an owl, a bunny in the grass
    tx, tz = TREE
    ot = critters.olive_tree(seed=7, h=6.2, perch_angle=math.radians(-120))
    Mt = place(tx, tz, 30, gy(tx, tz))
    Bt('olive_bark', 'bark').add(ot['bark'], Mt)
    sc.obj('olive.crown', ot['leaf'], mat['leaf'], Mt, props={'anim': 'sway', 'amp': 0.01, 'freq': 0.3, 'phase': 0.7})
    sc.col_box('olive', (2.2, 6.0, 2.2), tx, tz, 0)
    reserve.append((tx, tz, 2.4))
    pp, pa = ot['perch'][0]                                           # the bare branch towards the camera
    ob, oh, op = critters.owl()
    Mo = Mt @ Matrix.Translation(pp + Vector((0, 0, 0.12))) @ Matrix.Rotation(math.radians(-30), 4, 'Z')
    ow = sc.obj('owl', ob, m_crit, Mo)
    sc.obj('owl.head', oh, m_crit, Matrix.Translation(op), parent=ow, props={'anim': 'peck', 'freq': 0.3, 'phase': 1.3})
    bx_, bz_ = -16.5, 3.8
    bb, bh, bp = critters.bunny()
    bu = sc.obj('bunny', bb, m_crit, place(bx_, bz_, 25, gy(bx_, bz_)), props={'anim': 'sway', 'amp': 0.02, 'freq': 0.6})
    sc.obj('bunny.head', bh, m_crit, Matrix.Translation(bp), parent=bu, props={'anim': 'peck', 'freq': 0.7, 'phase': 0.4})
    reserve.append((bx_, bz_, 1.0))
    # a lizard on a warm rock, a tortoise in the grass
    rx_, rz_ = 10.5, -16.5
    rk = core.rock(611, size=(1.6, 1.3, 1.1), facets=6, detail=0.1, subdiv=3, sink=0.3)
    Bt('rocks', 'rock').add(rk, place(rx_, rz_, 20, gy(rx_, rz_)), uv_box=2.0)
    sc.col_box('rock0', (3.0, 1.2, 2.4), rx_, rz_, 20)
    sc.obj('lizard', critters.lizard(), m_crit, place(rx_, rz_ + 0.2, 60, gy(rx_, rz_) + 0.82), props={'anim': 'lizard'})
    reserve.append((rx_, rz_, 2.0))
    tox, toz = -21.0, -6.0
    to_ = sc.obj('tortoise', critters.tortoise(), m_crit, place(tox, toz, 70, gy(tox, toz)))
    th_, tp_ = critters.tortoise_head()
    sc.obj('tortoise.head', th_, m_crit, Matrix.Translation(tp_), parent=to_, props={'anim': 'peek'})
    sc.col_box('tortoise', (1.0, 0.5, 1.2), tox, toz, 70)
    reserve.append((tox, toz, 1.2))

    # ------------------------------------------------ the little white town with a church on the far hill
    for k, (ox, oz, w_, d_, h_, f_) in enumerate(((-6, 2, 5.0, 4.0, 3.6, 10), (-1, -3, 4.5, 4.0, 4.2, -5), (5, 1, 5.5, 4.5, 3.4, 20),
                                                  (9, -4, 4.0, 3.5, 3.8, 0), (-10, -4, 4.5, 4.0, 3.2, 15), (2, 6, 4.0, 3.5, 3.0, -10))):
        x_, z_ = TOWN[0] + ox, TOWN[1] + oz
        hb_ = core.new_bm(); core.box(hb_, (w_, d_, h_ + 3.0), (0, 0, (h_ + 3.0) / 2 - 3.5), bevel=0.15)
        Bt('town', 'white', ao=False).add(hb_, place(x_, z_, f_, gy(x_, z_)), uv_box=4.0)
        rf = core.new_bm(); core.box(rf, (w_ + 0.3, d_ + 0.3, 0.35), (0, 0, h_ - 0.4), bevel=0.1)
        Bt('roofs', 'roof', ao=False).add(rf, place(x_, z_, f_, gy(x_, z_)), uv_box=2.0)
        dr = core.new_bm(); core.box(dr, (0.9, 0.1, 1.6), (0, -d_ / 2 - 0.02, 0.3))
        core.set_color(dr, (0.2, 0.45, 0.75))
        sc.batch('town_doors', m_crit, ao=False, vcol=True).add(dr, place(x_, z_, f_, gy(x_, z_)))
    cx_, cz_ = TOWN[0] + 1.0, TOWN[1] - 10.0
    ch = core.new_bm(); core.box(ch, (6.0, 9.0, 8.0), (0, 0, 0.5), bevel=0.15)
    core.box(ch, (3.2, 3.2, 2.0), (0, 0, 5.4), bevel=0.1)                    # drum
    Bt('town', 'white', ao=False).add(ch, place(cx_, cz_, 0, gy(cx_, cz_)), uv_box=4.0)
    dm = core.new_bm(); core.lathe(dm, [(0.0, 2.0), (0.7, 1.85), (1.25, 1.4), (1.6, 0.8), (1.75, 0.0)], segs=24, uv_v=1.0)
    core.transform(dm, Matrix.Translation((0, 0, 6.4)))
    Bt('roofs', 'roof', ao=False).add(dm, place(cx_, cz_, 0, gy(cx_, cz_)), uv_box=2.0)
    cr_ = core.new_bm(); core.box(cr_, (0.14, 0.14, 1.2), (0, 0, 8.9)); core.box(cr_, (0.7, 0.14, 0.14), (0, 0, 9.2))
    core.set_color(cr_, (0.95, 0.78, 0.3))
    sc.batch('town_cross', m_crit, ao=False, vcol=True).add(cr_, place(cx_, cz_, 0, gy(cx_, cz_)))

    # ------------------------------------------------ anchors
    anchors_xz = []

    def A(name, x, z, face, note=None):
        sc.anchor(name, x, z, face, round(gy(x, z), 3), note)
        anchors_xz.append((x, z))

    A('gate', 0.0, GATE_Z + 1.6, 180.0, 'in front of the gate, facing it (to open it / reach over it)')
    A('gate-left', -2.0, GATE_Z + 1.5, 160.0, 'in front of the fold left of the gate, facing it')
    A('gate-right', 2.0, GATE_Z + 1.5, 200.0, 'in front of the fold right of the gate, facing it')
    A('fold-in', 0.0, GATE_Z - 2.6, 180.0, 'inside the fold, just behind the gate, facing the sheep')
    A('fold', fx, fz, 0.0, 'the middle of the fold (sheep all round)')
    A('hut', hx, HUT_FRONT + 2.4, 0.0, 'in front of the house door, facing out')
    A('hut-door', hx, HUT_FRONT - 0.3, 0.0, 'standing in the doorway, facing out')
    A('hut-in', hx - 0.2, HUT_FRONT - 1.9, 0.0, 'inside, just behind the closed door (start hidden here, show, open the door, walk out)')
    A('tree', TREE[0] + 1.5, TREE[1] + 2.8, 0.0, 'under the olive tree (the owl above), facing the camera side')
    A('trough', tx0 + 1.5, tz0 + 2.4, -60.0, 'beside the water trough')
    A('center', 0.0, 3.0, 0.0, 'the middle of the meadow in front of the fold')
    for nm, t_k in (('path-left', 0.35), ('path-mid', 0.62), ('path-near', 0.82)):
        i = int(t_k * (len(PATH) - 1))
        (ax, az), (bx2, bz2) = PATH[i], PATH[i + 1]
        A(nm, ax, az, math.degrees(math.atan2(bx2 - ax, bz2 - az)), 'on the path from the left, facing along it towards the gate')
    i = len(PATH_HUT) // 2
    (ax, az), (bx2, bz2) = PATH_HUT[i], PATH_HUT[i + 1]
    A('path-hut', ax, az, math.degrees(math.atan2(bx2 - ax, bz2 - az)), 'on the path between the gate and the house, facing the house')
    A('offstage-left', -62.0, 12.0, 90.0, 'out of frame on the path, left (enter walking +X)')
    A('offstage-right', 50.0, 6.0, -90.0, 'out of frame, right (enter walking -X)')

    def free(x, z, r):
        if path_dist(x, z) < r + 0.6:
            return False
        for qx, qz, qr in reserve:
            if math.hypot(x - qx, z - qz) < qr + r:
                return False
        for ax, az in anchors_xz:
            if math.hypot(x - ax, z - az) < 2.5 + r:
                return False
        if -16 < x < 22 and -4 < z < 10:      # the acting area stays clear
            return False
        return True

    # ------------------------------------------------ butterflies
    def flutter(name, x, y, z, col, spot, radius=1.2, freq=0.35, phase=0.0):
        body, wl_, wr_ = critters.butterfly(col, spot)
        g = sc.obj(name, body, m_crit, Matrix.Translation(B(x, y, z)),
                   props={'anim': 'butterfly', 'radius': radius, 'freq': freq, 'phase': phase, 'height': 0.35})
        sc.obj(name + '.wing.L', wl_, m_wing, Matrix.Identity(4), parent=g)
        sc.obj(name + '.wing.R', wr_, m_wing, Matrix.Identity(4), parent=g)

    flutter('butterfly1', -6.0, 2.2, -1.5, (1.0, 0.85, 0.2), (0.95, 0.45, 0.15), 1.2, 0.3, 0.0)
    flutter('butterfly2', 7.5, 2.0, -2.2, (1.0, 1.0, 0.97), (0.55, 0.75, 1.0), 1.4, 0.38, 2.0)
    flutter('butterfly3', -18.0, 2.0, 1.0, (0.98, 0.55, 0.2), (0.35, 0.2, 0.1), 1.4, 0.27, 4.0)
    flutter('butterfly4', hx + 6.0, 2.6, hz + 3.0, (0.6, 0.8, 1.0), (0.25, 0.35, 0.8), 1.6, 0.33, 1.0)

    # ------------------------------------------------ olive trees and cypresses round about
    olives = [(-26.0, -14.0, 5.2), (-34.0, 2.0, 5.8), (28.0, 6.0, 5.0), (34.0, -18.0, 5.6), (-14.0, -24.0, 5.0),
              (14.0, -26.0, 5.4), (-38.0, -26.0, 6.0), (40.0, -4.0, 5.2)]
    for i, (x, z, h) in enumerate(olives):
        o_ = critters.olive_tree(seed=30 + i, h=h, olives=i % 2 == 0)
        Mo_ = place(x, z, i * 47.0, gy(x, z))
        Bt('olive_bark', 'bark').add(o_['bark'], Mo_)
        sc.obj(f'olive{i}.crown', o_['leaf'], mat['leaf'], Mo_, props={'anim': 'sway', 'amp': 0.01, 'freq': 0.28 + 0.03 * (i % 3), 'phase': i * 1.1})
        sc.col_box(f'olive{i}', (1.8, h, 1.8), x, z, 0)
        reserve.append((x, z, 2.2))
    cyps = [(-8.5, -20.0, 9.0), (-6.5, -21.5, 7.5), (26.5, -14.0, 9.5), (8.0, -22.0, 8.0), (-30.0, -36.0, 10.0),
            (24.0, -38.0, 9.0), (-44.0, 8.0, 9.0), (44.0, 14.0, 8.5), (TOWN[0] + 8.0, TOWN[1] - 6.0, 8.0), (TOWN[0] - 7.0, TOWN[1] - 8.0, 7.0)]
    m_cyp = core.material('cypress', None, vcol=True, rough=0.8)
    for i, (x, z, h) in enumerate(cyps):
        sc.batch('cypress', m_cyp, ao=False, vcol=True).add(critters.cypress(seed=90 + i, h=h), place(x, z, i * 31.0, gy(x, z)))
        if abs(z) < 46:
            sc.col_box(f'cypress{i}', (1.6, h, 1.6), x, z, 0)
        reserve.append((x, z, 1.4))

    # ------------------------------------------------ grass tufts, poppies, daisies, bushes, a few stones
    r2 = np.random.default_rng(197)
    nt = 0
    for i in range(8000):
        if nt >= 230:
            break
        x = -45 + 90 * r2.random(); z = -44 + 66 * r2.random()
        if not free(x, z, 0.4) or fold_r(x, z) < 1.25:
            continue
        nt += 1
        Bt('grass_green', 'grass', vcol=True, ao=False).add(critters.green_tuft(1500 + i, r=0.45 + 0.25 * r2.random(), h=0.5 + 0.4 * r2.random()), place(x, z, r2.random() * 360, gy(x, z)))
    POPPY = ((0.95, 0.18, 0.12), (0.98, 0.25, 0.15), (1.0, 1.0, 0.96), (0.62, 0.5, 0.95), (1.0, 0.85, 0.2))
    nf = 0
    for i in range(5000):
        if nf >= 110:
            break
        x = -42 + 84 * r2.random(); z = -34 + 54 * r2.random()
        if not free(x, z, 0.5) or fold_r(x, z) < 1.25:
            continue
        nf += 1
        Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(1800 + i, n=5 + int(r2.random() * 5), radius=0.5, palette=POPPY), place(x, z, 0, gy(x, z)))
    # flowers along the foot of the fold wall and by the house (inside the acting area, off every walk)
    for k, (fx2, fz2) in enumerate(((-4.5, GATE_Z - 0.3), (4.6, GATE_Z - 0.4), (-7.8, -6.5), (7.9, -7.0), (hx + 4.6, HUT_FRONT + 0.5),
                                     (-6.5, 1.5), (6.5, 0.8))):
        Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(2400 + k, n=8, radius=0.5, palette=POPPY), place(fx2, fz2, 0, gy(fx2, fz2)))
        Bt('grass_green', 'grass', vcol=True, ao=False).add(critters.green_tuft(2450 + k), place(fx2 + 0.5, fz2 - 0.3, 0, gy(fx2, fz2)))
    nb = 0
    for i in range(1500):
        if nb >= 18:
            break
        x = -44 + 88 * r2.random(); z = -40 + 58 * r2.random()
        if not free(x, z, 1.4) or fold_r(x, z) < 1.3:
            continue
        nb += 1
        bsh = pieces.bush(seed=700 + i, r=0.9 + 0.7 * r2.random(), h=1.0 + 0.8 * r2.random(), green=(0.34, 0.52, 0.24))
        Mb = place(x, z, r2.random() * 360, gy(x, z))
        Bt('twigs', 'beam', ao=False).add(bsh['twig'], Mb)
        Bt('shrubs', 'leaf', vcol=True, ao=False).add(bsh['shrub'], Mb)
        sc.col_box(f'bush{nb}', (1.6, 1.4, 1.6), x, z, 0)
        reserve.append((x, z, 1.6))
    nr = 0
    for i in range(1500):
        if nr >= 14:
            break
        x = -44 + 88 * r2.random(); z = -40 + 58 * r2.random()
        if not free(x, z, 0.8) or fold_r(x, z) < 1.3:
            continue
        nr += 1
        s = 0.5 + 0.6 * r2.random()
        Bt('rocks', 'rock').add(core.rock(800 + i, size=(s, s * 0.8, s * 0.55), facets=5, detail=0.1, subdiv=2, sink=0.4), place(x, z, r2.random() * 360, gy(x, z)), uv_box=1.5)
        reserve.append((x, z, s + 0.4))

    sc.finalize()
    for nm, b in sc.batches.items():
        if nm.startswith('door:') and b.obj is not None:
            piv = b.pivot
            b.obj.data.transform(Matrix.Translation(-piv) @ b.M)
            b.obj.location = piv
    if bake:
        sc.bake_ao(samples=40, distance=5.0, max_size=2048, blur=0.6, gamma=1.15, floor=0.18)

    meta = {
        'name': NAME,
        'title': 'Stâna de pe deal (Cipru)',
        'units': 'engine units (figure 4.2 tall), three.js Y-up, +Z towards the usual camera',
        'anchors': sc.anchors,
        'seats': sc.seats,
        'bounds': [[-60, -1.0, -60], [60, 16, 26]],
        'acting': {'rect': [[-30, -4], [30, 14]], 'path': [[round(a, 2), round(b, 2)] for a, b in PATH],
                   'fold': {'centre': [fx, fz], 'half_axes': [FRX, FRZ], 'wall_h': WALL_H, 'gate_z': GATE_Z}},
        'skies': ['day', 'morning', 'evening', 'night'],
        'sky': {'day': {'sunAz': -35, 'sunElev': 46}, 'morning': {'sunAz': -62, 'sunElev': 14}, 'evening': {'sunAz': 55, 'sunElev': 8},
                'night': {'sunAz': 35, 'sunElev': 36}},
        'shadow': {'center': [2, -6], 'radius': 44},
        'shots': {
            'wide': {'pos': [0, 6.0, 26], 'target': [0, 2.0, -8], 'fov': 42, 'note': 'the fold in the middle, the olive tree left, the house right, hills behind'},
            'gate': {'pos': [3, 3.0, 6], 'target': [0, 2.2, -4], 'fov': 40, 'note': 'the gate and the sheep behind it'},
        },
        'notes': ('The fold: an oval dry-stone wall 1.5 high round [0, -9.5] (half axes 7.5 × 5.5), its gate at the front (x = 0, '
                  'z = -4, node door:gate, hinge on the left post; open = swings inwards). Sheep inside are set dressing (col:sheepN). '
                  'The house: door node door:hut at x = 19, front wall z = -6.5 (hut-in = behind the closed door). Collision: '
                  'col:foldN, col:gatepost*, col:sheepN, col:hut-*, col:olive*, col:cypressN, col:bushN, col:trough, col:beehives.'),
    }
    os.makedirs(out_dir, exist_ok=True)
    sc.export(os.path.join(out_dir, NAME + '.glb'))
    with open(os.path.join(out_dir, NAME + '.json'), 'w') as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    return meta
