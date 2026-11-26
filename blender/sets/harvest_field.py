"""Set `harvest-field`: a golden wheat field by the Nile at harvest time, a farmer's house with two round granaries.

three.js layout (x right, z towards the usual camera, y up; figure 4.2 tall):
  * the wheat field fills the back (z < EDGE ≈ -3) from far left to far right, ≈ 2.5 tall, swaying in the wind
    (`anim: wind`); its front edge is where people reap (the `wheat` prop patches stand on the margin in front of it),
  * two states (stage3: set option `"reaped": true`): nodes with extras `field: standing` (the wheat, poppies) or
    `field: reaped` (stubble and stooks of sheaves on the cut field),
  * a trampled straw margin along the edge, a dirt path along x (z ≈ 6.5) that leads right to the farmer's house (x ≈ 23),
  * a big shady fig tree on the left with a water jar, palms behind, hens, a donkey, doves on the roof, butterflies.
"""
import math
import os
import json
import numpy as np
from mathutils import Matrix, Vector, noise

from kit import core, tex, pieces, critters, wheat
from kit.core import B, place, Batch, Scene

NAME = 'harvest-field'
CORE = (-46.0, 46.0, -48.0, 24.0)
TEX_W, TEX_H = 2048, 1536
HOUSE = (23.5, -1.0, -38.0)          # x, z, face
GRAN = [(31.5, -6.5), (35.5, -2.0)]
TREE = (-19.0, 1.5)


def edge_z(x):
    return -3.0 + 0.5 * math.sin(x * 0.11 + 0.4) + 0.25 * math.sin(x * 0.31)


def _curve(p0, p1, p2, n=16):
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
    return out


def _door_front(dist=2.2):
    x, z, f = HOUSE
    a = math.radians(f)
    fx, fz = math.sin(a), math.cos(a)
    d = 4.0 + dist
    return x + fx * d, z + fz * d


DOOR = _door_front(1.4)
PATH = _curve((-75.0, 10.0), (-10.0, 5.0), (DOOR[0] - 1.0, DOOR[1] + 0.6), 24)


def dist_to_poly(px, pz, pts):
    best = 1e9
    for (ax, az), (bx, bz) in zip(pts[:-1], pts[1:]):
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz
        t = 0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / L2))
        best = min(best, math.hypot(px - ax - t * dx, pz - az - t * dz))
    return best


def path_dist(x, z):
    return dist_to_poly(x, z, PATH) - 1.4


def smooth(e0, e1, v):
    t = min(1.0, max(0.0, (v - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def H(x, z):
    """flat farmland (the field and the acting area), dunes far away"""
    hgt = 0.0
    ox = max(0.0, abs(x) - 40.0); oz = max(0.0, -z - 50.0) + max(0.0, z - 20.0)
    o = math.hypot(ox, oz)
    if o > 0:
        k = min(1.0, o / 40.0) ** 1.4
        ridge = 1 - abs(noise.noise(Vector((x * 0.012 + 3.1, z * 0.02, 1.7))))
        ridge2 = 1 - abs(noise.noise(Vector((x * 0.025 + 9.3, z * 0.035, 4.2))))
        dune = ridge ** 2.2 * 12.0 + ridge2 ** 2 * 4.0 + noise.fractal(Vector((x * 0.01, z * 0.01, 7.0)), 0.5, 2.0, 3) * 3.0
        hgt += k * max(0.0, dune) * min(1.0, o / 16.0)
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
            k = 0.93 + 0.05 * nz + min(0.07, p.z * 0.006)
            # the far field beyond the core: golden wheat land fading into the sand of the dunes
            Z = -p.y
            fieldk = smooth(-50.0, -60.0, -Z) * (1 - smooth(70.0, 130.0, abs(p.x))) * (1 - smooth(-110.0, -160.0, Z)) if Z < -46 else 0.0
            if Z < -46:
                fieldk = (1 - smooth(60.0, 110.0, abs(p.x))) * (1 - smooth(-95.0, -150.0, -(-Z)) if False else 1) * (1 - smooth(110.0, 170.0, -Z)) * (1 - min(1.0, p.z / 3.0))
            c = (min(1, k * 1.0), min(1, k * 0.975), min(1, k * 0.95))
            g = (min(1, k * 1.12), min(1, k * 0.86), min(1, k * 0.45))
            l[cl] = (c[0] + (g[0] - c[0]) * fieldk, c[1] + (g[1] - c[1]) * fieldk, c[2] + (g[2] - c[2]) * fieldk, 1)
    b = Batch('ground_far', mat, ao=False, vcol=True)
    b.bm.free(); b.bm = bm
    sc.batches['ground_far'] = b


def ground_textures(occluders):
    """stubble field (rows) under the wheat, a trampled straw margin, the dirt path, green grass in front, sand far"""
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
    E = np.vectorize(edge_z)(X)
    seed = 151
    n1 = tex.fbm(Hh, seed, 3.0, 1, 40, m=W)
    n2 = tex.fbm(Hh, seed + 1, 1.5, 20, 400, m=W)
    grain = tex.fbm(Hh, seed + 2, 0.0, 300, m=W)
    road = tex.smooth(0.7, -0.6, D)
    field = tex.smooth(0.6, -0.4, Z - E)                    # under the wheat (z < edge)
    margin = tex.smooth(4.2, 2.6, Z - E) * (1 - field)       # trampled straw strip in front of the edge
    farx = tex.smooth(36.0, 44.0, np.abs(X)) + tex.smooth(17.0, 22.0, Z)
    green = (1 - field) * (1 - margin) * (1 - road) * tex.smooth(0.5, 0.0, farx + 0.3 * n1) * tex.smooth(5.5, 8.5, Z - E + 2 * n1)
    sand = tex.ramp(tex.norm01(n1 * 0.8 + n2 * 0.2), [(0, '#d99852'), (0.45, '#e9b26e'), (1, '#f5cc8c')])
    rows = 0.5 + 0.5 * np.sin(Z * 2 * np.pi / 0.9 + n1 * 1.5)
    stub = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4 + rows * 0.35), [(0, '#b88a40'), (0.5, '#d8ab58'), (1, '#ecc875')])
    straw = tex.ramp(tex.norm01(n2 * 0.7 + grain * 0.2), [(0, '#c99a52'), (0.5, '#ddb46c'), (1, '#efcf8c')])
    pathc = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#a8774a'), (0.5, '#bd8b5a'), (1, '#cfa070')])
    grass = tex.ramp(tex.norm01(n2 * 0.7 + grain * 0.05 + n1 * 0.3), [(0, '#7d9a34'), (0.5, '#98b244'), (1, '#b4c45a')])
    col = sand
    col = col * (1 - green[..., None]) + grass * green[..., None]
    col = col * (1 - margin[..., None]) + straw * margin[..., None]
    col = col * (1 - field[..., None]) + stub * field[..., None]
    col = col * (1 - road[..., None]) + pathc * road[..., None]
    col *= (1 + 0.05 * grain[..., None])
    dark = np.zeros_like(X)
    for (ox, oz, r) in occluders:
        dark = np.maximum(dark, np.exp(-((np.hypot(X - ox, Z - oz) / r) ** 2)))
    col *= (1 - 0.14 * dark[..., None])
    h = grain * 0.08 + n2 * 0.15 + field * rows * 0.25 + margin * grain * 0.1
    nrm = tex.normal_from_height(tex.blur(h, 0.9), 1.8, wrap=False)
    rough = np.clip(0.9 - 0.06 * road + 0.03 * grain, 0, 1)
    return (tex.save('harvest-field_ground_col', col, 82), tex.save('harvest-field_ground_nrm', nrm, 72),
            tex.save('harvest-field_ground_orm', tex.pack_rough(rough), 80))


# ---------------------------------------------------------------- the wheat
def canopy_mesh(rng, xa, xb, zfar, front):
    """the top of the dense wheat seen from afar: a golden wavy surface ≈ 2.35 high with a skirt down to the ground at
    the front edge (hidden behind the front stalks) and at the sides"""
    bm = core.new_bm()
    cl = bm.loops.layers.color[core.COL]
    st = 0.8
    xs = np.arange(xa, xb + 1e-3, st)
    zs = list(np.arange(zfar, -20.0, 2.0)) + list(np.arange(-20.0, 0.0, st))
    rows = []
    for z in zs:
        row = []
        for x in xs:
            ze = min(z, edge_z(x) - front)
            y = 2.0 + 0.12 * noise.noise(Vector((x * 0.35, ze * 0.35, 0.5))) + 0.06 * math.sin(x * 1.7 + ze * 2.3)
            row.append(bm.verts.new(B(x, y, ze)))
        rows.append(row)
    def colr(v):
        nz = noise.noise(v.co * 0.18 + Vector((3, 1, 0)))
        k = 0.9 + 0.12 * nz
        return (min(1, 0.95 * k), min(1, 0.72 * k), min(1, 0.27 * k), 1)
    for j in range(len(rows) - 1):
        for i in range(len(xs) - 1):
            f = bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
            for l in f.loops:
                l[cl] = colr(l.vert)
    # skirt along the front (last row) and the sides
    def skirt(vs):
        for a, b_ in zip(vs[:-1], vs[1:]):
            a2 = bm.verts.new(Vector((a.co.x, a.co.y, -0.05))); b2 = bm.verts.new(Vector((b_.co.x, b_.co.y, -0.05)))
            f = bm.faces.new((a, b_, b2, a2))
            for l in f.loops:
                c = colr(l.vert)
                k = 0.55 + 0.45 * min(1.0, l.vert.co.z / 2.0)
                l[cl] = (c[0] * k, c[1] * k, c[2] * k, 1)
    skirt(rows[-1]); skirt([r[0] for r in rows]); skirt([r[-1] for r in rows])
    bm.normal_update()
    if sum(f.normal.z for f in bm.faces) < 0:
        for f in bm.faces:
            f.normal_flip()
    return bm


def build(out_dir, bake=True):
    core.reset()
    sc = Scene(NAME)
    T = core.texset
    sand_t = T('sand', tex.sand, n=512, seed=1)
    stone_t = T('sandstone', tex.sandstone, n=1024, seed=2)
    plaster_t = T('plaster', tex.plaster, n=1024, seed=3)
    wood_t = T('wood', tex.wood, n=512, seed=4)
    reeds_t = T('reeds', tex.reeds, n=512, seed=5)
    bark_t = T('bark', tex.bark, n=512, seed=9)
    leaf_t = T('leaf', tex.leaf, n=256, seed=11)
    clay_t = T('clay', tex.clay, n=512, seed=8)
    beam_t = T('palmwood', tex.wood, n=512, seed=14, planks=1, colors=('#9d7a52', '#7a5636', '#553820'))

    occl = [(HOUSE[0], HOUSE[1], 6.5), (TREE[0], TREE[1], 5.5)] + [(gx, gz, 2.6) for gx, gz in GRAN]
    gt = ground_textures(occl)
    ground_core(sc, core.material('ground', gt, extras={'detail': 'sand'}))
    ground_far(sc, core.material('ground_far', sand_t, vcol=True, extras={'detail': 'sand'}))

    mat = {
        'plaster': core.material('plaster', plaster_t, vcol=True),
        'plaster_b': core.material('plaster_b', plaster_t, vcol=True, color=(1.0, 0.93, 0.84)),
        'wood': core.material('wood', wood_t),
        'beam': core.material('palmwood', beam_t),
        'reeds': core.material('reeds', reeds_t, double=True),
        'stone': core.material('stone', stone_t),
        'rock': core.material('rock', stone_t, vcol=True),
        'bark': core.material('bark', bark_t),
        'twig': core.material('twig', beam_t, color=(0.6, 0.5, 0.42)),
        'shrub': core.material('shrub', None, vcol=True, rough=0.75),
        'grass': core.material('grass', None, vcol=True, rough=0.8, double=True),
        'clay': core.material('clay', clay_t),
    }
    Bt = lambda name, m, **kw: sc.batch(name, mat[m], **kw)
    gy = H
    m_wheat = core.material('wheat', None, vcol=True, rough=0.7, double=True)
    standing, reaped = [], []

    # ------------------------------------------------ the standing wheat: tiles of dense front rows along the edge,
    # tiles of ears over the canopy (one mesh each, many nodes: the GLB stays small; the wind shader works in world space)
    rng = np.random.default_rng(7)
    WIND = {'anim': 'wind', 'base': 0.0, 'field': 'standing'}

    def tiled(name, bm, spots):
        mesh = None
        out = []
        for k, (x, z, flip) in enumerate(spots):
            M = place(x, z, 180.0 if flip else 0.0, 0.0)
            if mesh is None:
                o = sc.obj(f'{name}{k}', bm, m_wheat, M, props=WIND)
                mesh = o.data
            else:
                o = sc.obj(f'{name}{k}', None, None, M, mesh=mesh, props=WIND)
            out.append(o)
        return out

    TW, TD = 6.0, 2.9
    band = wheat.Builder()
    for i in range(int(TW * TD * 78)):
        x = (rng.random() - 0.5) * (TW + 0.4); z = -TD * rng.random() ** 0.85 + 0.15
        base = Vector((x, -z, -0.04))
        if rng.random() < 0.018:
            wheat.flower(band, base, rng, 0 if rng.random() < 0.7 else 1, h=1.65 + 0.3 * rng.random())
            continue
        lean = Vector(((rng.random() - 0.5) * 0.35, (rng.random() - 0.5) * 0.3))
        wheat.stalk(band, base, 2.0 + 0.35 * rng.random(), lean, rng)
    spots = []
    for k, x in enumerate(np.arange(-45.0, 45.1, TW - 0.4)):
        spots.append((x, edge_z(x), False))
    standing += tiled('wheat.band', band.bm, spots)
    # the rows behind the front ones, slightly lower and without awns (seen above the front rows)
    cano = canopy_mesh(rng, -48.0, 48.0, -60.0, 1.9)
    standing.append(sc.obj('wheat.canopy', cano, m_wheat, None, props=WIND))
    EW = 8.0
    ears = wheat.Builder()
    for i in range(int(EW * EW * 6.5)):
        x = (rng.random() - 0.5) * EW; z = (rng.random() - 0.5) * EW
        lean = Vector(((rng.random() - 0.5) * 0.25, (rng.random() - 0.5) * 0.2))
        wheat.stalk(ears, Vector((x, -z, 1.45)), 0.8 + 0.3 * rng.random(), lean, rng, leaf=False)
    spots = []
    for row in range(6):
        for x in np.arange(-44.0, 44.1, EW):
            xx = x + (row % 2) * EW / 2
            z = -1.9 - 3.0 - EW * row + 0.6 * math.sin(xx * 0.11 + 0.4)
            if z < -48:
                continue
            spots.append((xx, z, (row + int(x)) % 2 == 0))
    standing += tiled('wheat.ears', ears.bm, spots)
    # poppies and cornflowers sprinkled on the canopy (red / blue dots: something for children to spot)
    fl = wheat.Builder()
    for i in range(320):
        x = -40 + 80 * rng.random()
        z = edge_z(x) - 2.2 - 24 * rng.random() ** 1.4
        wheat.flower(fl, Vector((x, -z, 1.3)), rng, 0 if rng.random() < 0.72 else 1, h=0.85 + 0.2 * rng.random())
    standing.append(sc.obj('wheat.flowers', fl.bm, m_wheat, None, props=WIND))

    # ------------------------------------------------ the reaped field: stubble in front, stooks in rows
    stb = wheat.Builder()
    SW = 10.0
    for i in range(int(SW * SW * 9)):
        wheat.stub(stb, Vector(((rng.random() - 0.5) * SW, (rng.random() - 0.5) * SW, -0.03)), rng, h=0.3)
    smesh = None
    k = 0
    for row in range(2):
        for x in np.arange(-40.0, 40.1, SW):
            z = -3.0 + 0.6 - SW / 2 - SW * row
            M = place(x + (row % 2) * 3.0, z, 90.0 * (k % 4), 0.0)
            if smesh is None:
                o = sc.obj(f'stubble{k}', stb.bm, m_wheat, M, props={'field': 'reaped'}); smesh = o.data
            else:
                o = sc.obj(f'stubble{k}', None, None, M, mesh=smesh, props={'field': 'reaped'})
            reaped.append(o); k += 1
    stk = wheat.stook(4)
    stook_mesh = None
    k = 0
    for row, z in enumerate((-8.0, -16.0, -25.0, -35.0)):
        for x in np.arange(-36.0, 37.0, 9.0 + row * 1.5):
            xx = x + (row % 2) * 4.0 + (rng.random() - 0.5) * 1.5
            zz = z + (rng.random() - 0.5) * 1.5
            M = place(xx, zz, rng.random() * 360, 0.0)
            if stook_mesh is None:
                o = sc.obj(f'stook{k}', stk, m_wheat, M, props={'field': 'reaped'})
                stook_mesh = o.data
            else:
                o = sc.obj(f'stook{k}', None, None, M, mesh=stook_mesh, props={'field': 'reaped'})
            reaped.append(o)
            k += 1

    # ------------------------------------------------ the farmer's house (Sava) + granaries
    hx, hz, hf = HOUSE
    parts, info = pieces.cell(seed=31, w=10.5, d=8.0, h=6.8, door_w=2.4, door_h=5.4, window_side=1)
    M = place(hx, hz, hf, 0.0)
    Bt('house_plaster', 'plaster_b', ao_density=26).add(parts['plaster'], M, uv_box=4.0)
    Bt('wood', 'wood').add(parts['wood'], M, uv_box=2.5)
    Bt('beams', 'beam').add(parts['beam'], M)
    Bt('reeds', 'reeds').add(parts['reeds'], M)
    Bt('stones', 'stone').add(parts['stone'], M, uv_box=2.0)
    dbm, hinge = info['door']
    door_b = Batch('door:house', mat['wood'], ao=256)
    door_b.add(dbm, None)
    core.box_uv(door_b.bm, 2.5)
    sc.batches['door:house'] = door_b
    door_b.pivot = (M @ hinge)
    door_b.M = M
    a_ = math.radians(hf)
    fx_, fz_, rx_, rz_ = math.sin(a_), math.cos(a_), math.cos(a_), -math.sin(a_)
    W_, D_, H_, cut = info['w'] + 0.5, info['d'] + 0.5, info['h'] + 1.0, 2.2
    sc.col_box('house', (W_, H_, D_ - cut), hx - fx_ * cut / 2, hz - fz_ * cut / 2, hf, 0)
    dw_ = info['door_w'] + 0.3
    sw_ = (W_ - dw_) / 2
    fo_ = D_ / 2 - cut / 2
    for sgn, nm_ in ((-1, 'l'), (1, 'r')):
        o_ = sgn * (dw_ / 2 + sw_ / 2)
        sc.col_box(f'house-{nm_}', (sw_, H_, cut), hx + fx_ * fo_ + rx_ * o_, hz + fz_ * fo_ + rz_ * o_, hf, 0)
    sc.col_box('house-lintel', (dw_, H_ - info['door_h'], cut), hx + fx_ * fo_, hz + fz_ * fo_, hf, info['door_h'])
    # a bench of mud bricks by the door and big clay jars
    jx, jz = hx + rx_ * 3.6 + fx_ * (info['d'] / 2 + 0.9), hz + rz_ * 3.6 + fz_ * (info['d'] / 2 + 0.9)
    for k2, (ox, oz, s) in enumerate(((0, 0, 1.0), (0.9, -0.6, 0.8), (-0.2, -1.3, 0.9))):
        jar = core.new_bm()
        core.lathe(jar, [(0.0, 0.0), (0.35, 0.02), (0.62, 0.35), (0.72, 0.8), (0.6, 1.3), (0.32, 1.55), (0.28, 1.72), (0.36, 1.8), (0.3, 1.82), (0.24, 1.7)],
                   segs=20, uv_v=1.0, uv_u=2.0)
        Bt('clay', 'clay').add(jar, place(jx + rx_ * ox + fx_ * oz, jz + rz_ * ox + fz_ * oz, k2 * 30, 0.0, s))
    sc.col_box('house-jars', (2.6, 2.0, 2.6), jx + rx_ * 0.3 - fx_ * 0.6, jz + rz_ * 0.3 - fz_ * 0.6, hf)
    # granaries: round domed mud silos with a little hatch and a ladder
    for k2, (gx, gz) in enumerate(GRAN):
        g = core.new_bm()
        prof = [(1.95, 0.0), (2.0, 0.6), (1.95, 2.0), (1.75, 3.2), (1.35, 4.2), (0.8, 4.9), (0.35, 5.2), (0.0, 5.3)]
        core.lathe(g, prof, segs=28, uv_v=3.0, uv_u=3.0)
        core.displace(g, 0.04, 1.4, seed=40 + k2)
        core.set_color(g, (1.0, 0.95, 0.88))
        Bt('house_plaster', 'plaster_b').add(g, place(gx, gz, 0, 0.0), uv_box=4.0)
        h_ = core.new_bm(); core.box(h_, (0.8, 0.2, 0.7), (0, -1.7, 3.3), bevel=0.05)
        Bt('wood', 'wood').add(h_, place(gx, gz, -30 + k2 * 25, 0.0), uv_box=2.0)
        sc.col_box(f'granary{k2}', (4.0, 5.3, 4.0), gx, gz, 0)

    # ------------------------------------------------ the fig tree on the left: a broad shady crown, a jar in its shade
    tx, tz = TREE
    trunk = core.new_bm()
    core.tube(trunk, [Vector((0, 0, -0.3)), Vector((0.2, 0.1, 2.2)), Vector((-0.1, 0.2, 4.4)), Vector((0.3, -0.1, 5.6))], [1.0, 0.75, 0.6, 0.45], sides=12, uv_v=2.0)
    for a, L in ((0.3, 3.2), (2.4, 2.8), (4.3, 3.0)):
        core.tube(trunk, [Vector((0.2, 0, 4.6)), Vector((math.cos(a) * L * 0.6, math.sin(a) * L * 0.6, 6.0)), Vector((math.cos(a) * L, math.sin(a) * L, 6.6))], [0.38, 0.28, 0.18], sides=8, uv_v=2.0)
    Mt = place(tx, tz, 20, 0.0)
    Bt('tree_bark', 'bark').add(trunk, Mt)
    crown = core.new_bm()
    cr = np.random.default_rng(3)
    for i in range(16):
        a = cr.random() * 2 * math.pi; d = 3.6 * math.sqrt(cr.random())
        c = (0.28 + 0.1 * cr.random(), 0.5 + 0.12 * cr.random(), 0.16 + 0.06 * cr.random())
        critters.blob(crown, (math.cos(a) * d, math.sin(a) * d, 6.8 + 1.4 * cr.random() - d * 0.15), (2.1 + 0.6 * cr.random(), 2.1 + 0.6 * cr.random(), 1.3 + 0.4 * cr.random()), c, subdiv=2)
    core.displace(crown, 0.18, 1.1, seed=5)
    sc.obj('tree.crown', crown, mat['shrub'], Mt, props={'anim': 'sway', 'amp': 0.012, 'freq': 0.3, 'phase': 0.4})
    sc.col_box('tree', (2.0, 6.0, 2.0), tx, tz, 0)
    jar = core.new_bm()
    core.lathe(jar, [(0.0, 0.0), (0.3, 0.02), (0.5, 0.3), (0.56, 0.7), (0.45, 1.1), (0.22, 1.3), (0.2, 1.42), (0.27, 1.48), (0.22, 1.5), (0.17, 1.4)],
               segs=20, uv_v=1.0, uv_u=2.0)
    Bt('clay', 'clay').add(jar, place(tx + 2.2, tz + 1.4, 0, 0.0))
    sc.col_box('tree-jar', (1.2, 1.6, 1.2), tx + 2.2, tz + 1.4, 0)

    # ------------------------------------------------ anchors
    anchors_xz = []
    reserve = [(hx, hz, 7.5), (tx, tz, 2.4), (tx + 2.2, tz + 1.4, 1.0)] + [(gx, gz, 2.6) for gx, gz in GRAN]

    def A(name, x, z, face, note=None):
        sc.anchor(name, x, z, face, round(gy(x, z), 3), note)
        anchors_xz.append((x, z))

    for nm, x in (('reap-a', -5.0), ('reap-b', 0.0), ('reap-c', 5.0)):
        A(nm, x, edge_z(x) + 2.1, 180.0, 'on the margin facing the wheat (-Z): the reaper stands here; put a `wheat` patch 1.3 in front of him (z - 1.3)')
    A('margin-left', -12.0, edge_z(-12.0) + 2.3, 0.0, 'on the straw margin in front of the field, left')
    A('margin-right', 11.0, edge_z(11.0) + 2.3, 0.0, 'on the straw margin in front of the field, right')
    A('center', 0.0, 4.0, 0.0, 'the middle of the acting area, between the field and the path')
    A('road-left', -26.0, 7.5, 90.0, 'on the path, left (walking +X towards the house)')
    A('road-mid', 0.0, 5.6, 90.0, 'on the path in the middle')
    A('road-right', 14.0, 4.6, 90.0, 'on the path near the house')
    A('house', DOOR[0], DOOR[1], HOUSE[2], 'in front of the farmer\'s door, facing out')
    df = _door_front(0.0)
    A('house-door', df[0], df[1], HOUSE[2], 'standing in the doorway, facing out (enter / leave the house)')
    A('tree', tx + 3.4, tz + 3.0, 150.0, 'in the shade of the fig tree, facing the field')
    A('offstage-left', -62.0, 9.0, 90.0, 'out of frame on the path, left (enter walking +X)')
    A('offstage-right', 46.0, 6.0, -90.0, 'out of frame, right (enter walking -X)')

    def free(x, z, r):
        if path_dist(x, z) < r + 0.6:
            return False
        if z < edge_z(x) + 4.5 + r:
            return False
        for qx, qz, qr in reserve:
            if math.hypot(x - qx, z - qz) < qr + r:
                return False
        for ax, az in anchors_xz:
            if math.hypot(x - ax, z - az) < 2.5 + r:
                return False
        if abs(x) < 14 and z < 12:         # the acting area stays clear
            return False
        return True

    # ------------------------------------------------ palms (broad leaves) at the sides and far behind the field
    palms = [(-36.0, -4.0, 11.0, (0.5, -0.3)), (-40.0, 4.0, 9.5, (0.4, 0.2)), (38.0, 8.0, 10.5, (-0.5, 0.2)),
             (40.0, -10.0, 12.0, (-0.4, 0.3)), (-30.0, -52.0, 12.0, (0.3, 0.2)), (-18.0, -55.0, 10.0, (-0.3, 0.2)),
             (12.0, -54.0, 11.5, (0.4, 0.1)), (26.0, -51.0, 10.0, (-0.4, 0.2)), (-4.0, -58.0, 12.5, (0.2, -0.2)),
             (29.0, 3.0, 9.0, (-0.5, 0.3)), (16.0, -12.5, 10.5, (0.3, 0.3))]
    m_crown = core.material('crown', leaf_t, vcol=True, double=True, rough=0.6)
    crowns = {}
    for i, (x, z, h, lean) in enumerate(palms):
        p = pieces.palm(seed=60 + i, height=h, lean=lean, fronds=13)
        Mp = place(x, z, i * 37.0, gy(x, z) - 0.05)
        Bt('palm_bark', 'bark', ao_density=10).add(p['bark'], Mp)
        Bt('palm_bark', 'bark').add(p['bark_boss'], Mp, uv_box=1.0)
        v = i % 3
        props = {'anim': 'sway', 'amp': 0.035, 'freq': 0.45 + 0.07 * (i % 4), 'phase': i * 1.3}
        Ms = Mp @ Matrix.Translation(p['top']) @ Matrix.Diagonal((h / 10.5,) * 3 + (1,))
        if v not in crowns:
            q = pieces.palm(seed=160 + v, height=10.0, lean=(0, 0), fronds=13)
            cbm = core.new_bm()
            for kk in ('leaf', 'dry', 'dates'):
                core.merge(cbm, q[kk])
            core.transform(cbm, Matrix.Translation(-q['top']))
            crowns[v] = sc.obj(f'palm{i}.crown', cbm, m_crown, Ms, props=props).data
        else:
            sc.obj(f'palm{i}.crown', None, None, Ms, mesh=crowns[v], props=props)
        sc.col_box(f'palm{i}', (1.2, h, 1.2), x, z, 0)
        reserve.append((x, z, 1.6))

    # ------------------------------------------------ animals: hens by the house, a donkey tied to a post, doves on the roof
    m_crit = core.material('critter', None, vcol=True, rough=0.55)
    m_wing = core.material('wing', None, vcol=True, rough=0.5, double=True)
    m_rope = core.material('rope', T('rope', tex.rope, n=256, seed=7))
    hens = [(15.2, -0.8, 30, 'brown', 0.9), (26.5, 6.8, -40, 'white', 1.0), (29.0, 3.5, 120, 'brown', 1.0), (13.0, -2.0, 200, 'white', 0.8)]
    for k2, (hx2, hz2, hf2, var, rad) in enumerate(hens):
        cols = ((0.72, 0.36, 0.16), (0.9, 0.62, 0.32), (0.5, 0.22, 0.1)) if var == 'brown' else ((0.97, 0.96, 0.93), (1.0, 1.0, 0.98), (0.85, 0.85, 0.83))
        hb, hh, hp = critters.hen(*cols)
        root = sc.obj(f'hen{k2 + 1}', hb, m_crit, place(hx2, hz2, hf2, gy(hx2, hz2)), props={'anim': 'hen', 'radius': rad, 'seed': 13 + 7 * k2})
        sc.obj(f'hen{k2 + 1}.head', hh, m_crit, Matrix.Translation(hp), parent=root)
        reserve.append((hx2, hz2, rad + 0.6))
    dx_, dz_ = 31.0, 9.0
    db, dh, dp, dt, dtp = critters.donkey_parts()
    dk = sc.obj('donkey', db, m_crit, place(dx_, dz_, -110, gy(dx_, dz_)))
    sc.obj('donkey.head', dh, m_crit, Matrix.Translation(dp), parent=dk, props={'anim': 'browse'})
    sc.obj('donkey.tail', dt, m_crit, Matrix.Translation(dtp), parent=dk, props={'anim': 'swish'})
    post = core.new_bm(); core.tube(post, [Vector((0, 0, -0.2)), Vector((0, 0, 2.2))], 0.13, sides=8, uv_v=1.5)
    Bt('beams', 'beam').add(post, place(dx_ - 2.4, dz_ - 0.4, 0, gy(dx_, dz_)))
    sc.col_box('donkey', (1.6, 2.8, 3.2), dx_, dz_, -110)
    reserve.append((dx_, dz_, 2.8))
    for k2, (lx, rz) in enumerate(((-2.4, 15), (-1.4, -25), (2.8, 160))):
        Mv = place(hx, hz, hf, 0) @ Matrix.Translation((lx, -2.8, 6.95)) @ Matrix.Rotation(math.radians(rz), 4, 'Z')
        dvb, dvh, dvp = critters.dove()
        dv = sc.obj(f'dove{k2 + 1}', dvb, m_crit, Mv)
        sc.obj(f'dove{k2 + 1}.head', dvh, m_crit, Matrix.Translation(dvp), parent=dv, props={'anim': 'peck', 'freq': 0.6 + 0.25 * k2, 'phase': k2 * 2.0})

    def flutter(name, x, y, z, col, spot, radius=1.2, freq=0.35, phase=0.0):
        body, wl_, wr_ = critters.butterfly(col, spot)
        g = sc.obj(name, body, m_crit, Matrix.Translation(B(x, y, z)),
                   props={'anim': 'butterfly', 'radius': radius, 'freq': freq, 'phase': phase, 'height': 0.35})
        sc.obj(name + '.wing.L', wl_, m_wing, Matrix.Identity(4), parent=g)
        sc.obj(name + '.wing.R', wr_, m_wing, Matrix.Identity(4), parent=g)

    # butterflies over the wheat edge (white, yellow, orange) and by the tree
    flutter('butterfly1', -9.0, 3.0, edge_z(-9.0) - 0.6, (1.0, 1.0, 0.97), (0.55, 0.75, 1.0), 1.6, 0.3, 0.0)
    flutter('butterfly2', 8.5, 2.9, edge_z(8.5) - 0.4, (1.0, 0.85, 0.2), (0.95, 0.45, 0.15), 1.3, 0.38, 2.0)
    flutter('butterfly3', -15.0, 1.6, 4.5, (0.98, 0.55, 0.2), (0.35, 0.2, 0.1), 1.4, 0.27, 4.0)
    flutter('butterfly4', 2.0, 3.2, edge_z(2.0) - 1.4, (1.0, 0.92, 0.5), (0.9, 0.5, 0.2), 1.8, 0.33, 1.0)

    # ------------------------------------------------ grass tufts, flowers and bushes in front and round the house
    r2 = np.random.default_rng(91)
    nt = 0
    for i in range(6000):
        if nt >= 170:
            break
        x = -45 + 90 * r2.random(); z = -2 + 24 * r2.random()
        if not free(x, z, 0.4):
            continue
        nt += 1
        if abs(x) < 34:
            Bt('grass_green', 'grass', vcol=True, ao=False).add(critters.green_tuft(1500 + i, r=0.45 + 0.25 * r2.random(), h=0.5 + 0.4 * r2.random()), place(x, z, r2.random() * 360, gy(x, z)))
        else:
            tf = pieces.tuft(seed=900 + i, n=16, r=0.4 + 0.3 * r2.random(), h=0.45 + 0.45 * r2.random(), dry=0.35 + 0.6 * r2.random())
            Bt('grass', 'grass', vcol=True, ao=False).add(tf, place(x, z, r2.random() * 360, gy(x, z)))
    nf = 0
    for i in range(3000):
        if nf >= 45:
            break
        x = -40 + 80 * r2.random(); z = 0 + 20 * r2.random()
        if not free(x, z, 0.5):
            continue
        nf += 1
        Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(1800 + i, n=4 + int(r2.random() * 5), radius=0.4), place(x, z, 0, gy(x, z)))
    nb = 0
    for i in range(800):
        if nb >= 14:
            break
        x = -44 + 88 * r2.random(); z = 2 + 18 * r2.random()
        if not free(x, z, 1.4):
            continue
        nb += 1
        bsh = pieces.bush(seed=700 + i, r=0.9 + 0.7 * r2.random(), h=1.0 + 0.8 * r2.random(), green=(0.36, 0.55, 0.22))
        Mb = place(x, z, r2.random() * 360, gy(x, z))
        Bt('twigs', 'twig', ao=False).add(bsh['twig'], Mb)
        Bt('shrubs', 'shrub', vcol=True, ao=False).add(bsh['shrub'], Mb)
        sc.col_box(f'bush{nb}', (1.6, 1.4, 1.6), x, z, 0)
        reserve.append((x, z, 1.6))

    sc.finalize()
    # the door pivots on its hinge (a rotation about local Y swings it)
    for nm, b in sc.batches.items():
        if nm.startswith('door:') and b.obj is not None:
            piv = b.pivot
            b.obj.data.transform(Matrix.Translation(-piv) @ b.M)
            b.obj.location = piv
    if bake:
        # the wheat must not darken the ground of the reaped field: out of the scene while baking
        for ob in standing + reaped:
            bpy_unlink(ob)
        sc.bake_ao(samples=40, distance=5.0, max_size=2048, blur=0.6, gamma=1.15, floor=0.18)
        for ob in standing + reaped:
            bpy_link(ob)

    meta = {
        'name': NAME,
        'title': 'Ogorul cu grâu (secerișul, lângă casa gospodarului)',
        'units': 'engine units (figure 4.2 tall), three.js Y-up, +Z towards the usual camera',
        'anchors': sc.anchors,
        'seats': sc.seats,
        'bounds': [[-60, -1.5, -60], [60, 14, 26]],
        'acting': {'rect': [[-30, -2], [30, 14]], 'edge': 'z = -3 + 0.5 sin(0.11 x + 0.4) + 0.25 sin(0.31 x)',
                   'path': [[round(a, 2), round(b, 2)] for a, b in PATH]},
        'skies': ['morning', 'day', 'evening'],
        'sky': {'day': {'sunAz': -38, 'sunElev': 50}, 'morning': {'sunAz': -66, 'sunElev': 15}, 'evening': {'sunAz': 58, 'sunElev': 8}},
        'shadow': {'center': [0, -2], 'radius': 46},
        'options': {'reaped': 'true → the field is cut: stubble and stooks of sheaves instead of the standing wheat'},
        'shots': {
            'wide': {'pos': [0, 6.5, 30], 'target': [0, 2.0, -4], 'fov': 42, 'note': 'the field across the back, the house right, the tree left'},
            'edge': {'pos': [3, 2.4, 9], 'target': [0, 1.8, -2], 'fov': 40, 'note': 'the reaping place at the field edge'},
        },
        'notes': ('The wheat field fills z < edge(x) ≈ -3; reap on the margin in front of it with the `wheat` prop patches (2.6 wide), '
                  'the reaper 1.3 in front of the patch facing -Z. The path runs along x at z ≈ 5–7 to the house on the right '
                  '(door node door:house, anchors house / house-door). Collision: col:house*, col:granaryN, col:tree*, col:palmN, col:bushN, col:donkey.'),
    }
    os.makedirs(out_dir, exist_ok=True)
    sc.export(os.path.join(out_dir, NAME + '.glb'))
    with open(os.path.join(out_dir, NAME + '.json'), 'w') as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    return meta


def bpy_unlink(ob):
    import bpy
    if ob.name in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.unlink(ob)


def bpy_link(ob):
    import bpy
    if ob.name not in bpy.context.scene.collection.objects:
        bpy.context.scene.collection.objects.link(ob)
