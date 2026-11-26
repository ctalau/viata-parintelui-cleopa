"""Set `nile-village`: a green village by the Nile with an old monk's little white cell (film 046, Avva Motie).

three.js layout (x right, z towards the usual camera, y up; figure 4.2 tall):
  * the monk's cell in the middle (centre CELL, door towards +Z, front wall at z ≈ -5): a turquoise door that opens
    (node `door:cell`) and, right of it, an open window at face height (a monk standing at `window-in` looks out of it),
  * a big fig tree on the left with a long mud-brick bench in its shade (seats `bench-a` … `bench-d`, facing +Z),
  * a dirt path from the front left (offstage-left) to the cell door, a pond with ducks and reeds on the right,
  * the village behind: whitewashed / pink houses with blue doors, two pigeon towers with doves, a well, a vegetable garden,
    goats (and a kid), hens, a donkey, a resting camel, a ginger cat by the door, butterflies, palms with broad leaves, flowers.
"""
import math
import os
import json
import numpy as np
from mathutils import Matrix, Vector, noise

from kit import core, tex, pieces, critters
from kit.core import B, place, Batch, Scene

NAME = 'nile-village'
CORE = (-46.0, 46.0, -46.0, 24.0)
TEX_W, TEX_H = 2048, 1536
CELL = (6.0, -9.0, 0.0)               # x, z, face
CELL_W, CELL_D, CELL_H = 10.0, 8.0, 6.8
WIN = (3.0, 3.55, 1.5, 1.3)           # front window: local x, centre height, width, height
TREE = (-10.0, -4.4)
BENCH = (-10.0, -1.0)                 # bench centre (along X)
BENCH_L, SEAT_H = 8.6, 0.95
POND = (23.0, 3.0, 4.6)               # x, z, radius
WATER_Y = -0.3
HOUSES = [(-29.0, -25.0, 12.0, 'white'), (-13.0, -31.0, -6.0, 'pink'), (17.0, -30.0, 8.0, 'white'), (33.0, -21.0, -28.0, 'pink')]
DOVECOTES = [(-21.0, -19.0), (26.5, -13.5)]
FRONT_Z = CELL[1] + CELL_D / 2       # -5.0


def _curve(p0, p1, p2, n=16):
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
    return out


PATH = _curve((-78.0, 12.0), (-14.0, 6.5), (CELL[0] - 0.3, FRONT_Z + 2.0), 24)


def dist_to_poly(px, pz, pts):
    best = 1e9
    for (ax, az), (bx, bz) in zip(pts[:-1], pts[1:]):
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz
        t = 0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / L2))
        best = min(best, math.hypot(px - ax - t * dx, pz - az - t * dz))
    return best


def path_dist(x, z):
    return dist_to_poly(x, z, PATH) - 1.5


def smooth(e0, e1, v):
    t = min(1.0, max(0.0, (v - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def H(x, z):
    """flat village ground, a shallow pond on the right, low dunes far away"""
    hgt = 0.0
    px, pz, pr = POND
    d = math.hypot(x - px, (z - pz) * 1.25)
    if d < pr + 1.2:
        hgt -= 0.85 * (1 - smooth(pr - 2.2, pr + 1.0, d))
    ox = max(0.0, abs(x) - 40.0); oz = max(0.0, -z - 44.0) + max(0.0, z - 20.0)
    o = math.hypot(ox, oz)
    if o > 0:
        k = min(1.0, o / 40.0) ** 1.4
        ridge = 1 - abs(noise.noise(Vector((x * 0.012 + 3.1, z * 0.02, 1.7))))
        dune = ridge ** 2.2 * 10.0 + noise.fractal(Vector((x * 0.01, z * 0.01, 7.0)), 0.5, 2.0, 3) * 3.0
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
            # green fields of the Nile valley around the village, fading into the sand of the dunes
            Z = -p.y
            greenk = (1 - smooth(55.0, 110.0, abs(p.x))) * (1 - smooth(80.0, 150.0, -Z)) * (1 - min(1.0, p.z / 2.5))
            c = (min(1, k * 1.0), min(1, k * 0.975), min(1, k * 0.95))
            g = (min(1, k * 0.62), min(1, k * 0.82), min(1, k * 0.42))
            l[cl] = (c[0] + (g[0] - c[0]) * greenk, c[1] + (g[1] - c[1]) * greenk, c[2] + (g[2] - c[2]) * greenk, 1)
    b = Batch('ground_far', mat, ao=False, vcol=True)
    b.bm.free(); b.bm = bm
    sc.batches['ground_far'] = b


def ground_textures(occluders):
    """green village grass, a packed-earth yard in front of the cell, the dirt path, a muddy pond rim, sand far away"""
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
    seed = 171
    n1 = tex.fbm(Hh, seed, 3.0, 1, 40, m=W)
    n2 = tex.fbm(Hh, seed + 1, 1.5, 20, 400, m=W)
    grain = tex.fbm(Hh, seed + 2, 0.0, 300, m=W)
    road = tex.smooth(0.7, -0.6, D)
    cx, cz, _ = CELL
    yard = tex.smooth(1.0, 0.0, np.hypot((X - cx) / 9.5, (Z - (FRONT_Z + 1.0)) / 4.5) + 0.15 * n1)
    px, pz, pr = POND
    pd = np.hypot(X - px, (Z - pz) * 1.25)
    mud = tex.smooth(pr + 1.4, pr - 0.4, pd)
    farx = tex.smooth(40.0, 46.0, np.abs(X)) + tex.smooth(18.0, 23.0, Z) + tex.smooth(-40.0, -46.0, Z)
    green = (1 - road) * (1 - yard) * tex.smooth(0.6, 0.0, farx + 0.3 * n1)
    sand = tex.ramp(tex.norm01(n1 * 0.8 + n2 * 0.2), [(0, '#d99852'), (0.45, '#e9b26e'), (1, '#f5cc8c')])
    grass = tex.ramp(tex.norm01(n2 * 0.7 + grain * 0.05 + n1 * 0.3), [(0, '#6f9a32'), (0.5, '#8cb444'), (1, '#a9c75a')])
    earth = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#c09060'), (0.5, '#d2a472'), (1, '#e2b986')])
    pathc = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#a8774a'), (0.5, '#bd8b5a'), (1, '#cfa070')])
    mudc = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#5c4a32'), (0.5, '#6e5a3c'), (1, '#7f6a48')])
    col = sand
    col = col * (1 - green[..., None]) + grass * green[..., None]
    col = col * (1 - yard[..., None]) + earth * yard[..., None]
    col = col * (1 - road[..., None]) + pathc * road[..., None]
    col = col * (1 - mud[..., None]) + mudc * mud[..., None]
    col *= (1 + 0.05 * grain[..., None])
    dark = np.zeros_like(X)
    for (ox, oz, r) in occluders:
        dark = np.maximum(dark, np.exp(-((np.hypot(X - ox, Z - oz) / r) ** 2)))
    col *= (1 - 0.14 * dark[..., None])
    h = grain * 0.08 + n2 * 0.15
    nrm = tex.normal_from_height(tex.blur(h, 0.9), 1.8, wrap=False)
    rough = np.clip(0.9 - 0.06 * road + 0.03 * grain, 0, 1)
    return (tex.save('nile-village_ground_col', col, 82), tex.save('nile-village_ground_nrm', nrm, 72),
            tex.save('nile-village_ground_orm', tex.pack_rough(rough), 80))


def water_textures():
    n = 512
    a = tex.fbm(n, 311, 3.0, 2, 30)
    r1 = tex.fbm(n, 312, 1.6, 6, 60, aniso=(1.0, 0.6))
    r2 = tex.fbm(n, 313, 1.2, 20, 120)
    col = tex.ramp(tex.norm01(a), [(0, '#2f8a86'), (0.5, '#3f9e94'), (1, '#5ab4a6')])
    nrm = tex.normal_from_height(r1 * 0.8 + r2 * 0.35, 2.0, wrap=True)
    rough = np.full((n, n), 0.12)
    return (tex.save('nile-village_water_col', col, 86), tex.save('nile-village_water_nrm', nrm, 80),
            tex.save('nile-village_water_orm', tex.pack_rough(rough), 80))


def pond_mesh():
    px, pz, pr = POND
    bm = core.new_bm()
    uvl = bm.loops.layers.uv[core.UV0]
    c = bm.verts.new(B(px, WATER_Y, pz))
    ring = []
    for i in range(48):
        a = i / 48 * 2 * math.pi
        rr = (pr + 0.3) * (1 + 0.06 * math.sin(3 * a + 0.7))
        ring.append(bm.verts.new(B(px + math.cos(a) * rr, WATER_Y, pz + math.sin(a) * rr / 1.25)))
    for i in range(48):
        f = bm.faces.new((c, ring[i], ring[(i + 1) % 48]))
        for l in f.loops:
            p = l.vert.co
            l[uvl].uv = (p.x / 6.0, p.y / 6.0)
    bm.normal_update()
    if sum(f.normal.z for f in bm.faces) < 0:
        for f in bm.faces:
            f.normal_flip()
    return bm


# ---------------------------------------------------------------- build
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
    white_t = T('whitewash', tex.plaster, n=1024, seed=31, colors=('#fdfaf3', '#f4ecdf', '#e9dcc8'), brick='#e2cfb4')
    pink_t = T('pinkwash', tex.plaster, n=1024, seed=32, colors=('#fbe0d2', '#f2cdbb', '#e6b9a4'), brick='#d9a68e')
    blue_t = T('bluewood', tex.wood, n=512, seed=33, colors=('#63c7d8', '#43a9c0', '#2f8aa2'))
    brick_t = T('mudbrick', tex.blocks, n=512, seed=22, rows=4, cols=2, colors=('#d9a878', '#c9946a', '#b9845c'), mortar='#a8764e')

    cx, cz, cf = CELL
    px, pz, pr = POND
    occl = [(cx, cz, 7.0), (TREE[0], TREE[1], 5.0)] + [(hx, hz, 6.5) for hx, hz, _, _ in HOUSES] + [(dx, dz, 2.6) for dx, dz in DOVECOTES]
    gt = ground_textures(occl)
    ground_core(sc, core.material('ground', gt, extras={'detail': 'sand'}))
    ground_far(sc, core.material('ground_far', sand_t, vcol=True, extras={'detail': 'sand'}))

    mat = {
        'plaster': core.material('plaster_white', white_t, vcol=True),
        'plaster_pink': core.material('plaster_pink', pink_t, vcol=True),
        'wood': core.material('wood', wood_t),
        'wood_blue': core.material('wood_blue', blue_t),
        'beam': core.material('palmwood', beam_t),
        'reeds': core.material('reeds', reeds_t, double=True),
        'stone': core.material('stone', stone_t),
        'rock': core.material('rock', stone_t, vcol=True),
        'brick': core.material('mudbrick', brick_t),
        'bark': core.material('bark', bark_t),
        'twig': core.material('twig', beam_t, color=(0.6, 0.5, 0.42)),
        'shrub': core.material('shrub', None, vcol=True, rough=0.75),
        'grass': core.material('grass', None, vcol=True, rough=0.8, double=True),
        'clay': core.material('clay', clay_t),
    }
    Bt = lambda name, m, **kw: sc.batch(name, mat[m], **kw)
    gy = H
    m_crit = core.material('critter', None, vcol=True, rough=0.55)
    m_wing = core.material('wing', None, vcol=True, rough=0.5, double=True)
    reserve = []

    # ------------------------------------------------ the monk's cell: white, a turquoise door that opens, a window
    parts, info = pieces.cell(seed=41, w=CELL_W, d=CELL_D, h=CELL_H, door_w=2.4, door_h=5.4, window_side=-1, front_window=WIN)
    M = place(cx, cz, cf, 0.0)
    Bt('cell_plaster', 'plaster', ao_density=26).add(parts['plaster'], M, uv_box=4.0)
    Bt('wood_blue', 'wood_blue').add(parts['wood'], M, uv_box=2.5)
    Bt('beams', 'beam').add(parts['beam'], M)
    Bt('reeds', 'reeds').add(parts['reeds'], M)
    Bt('stones', 'stone').add(parts['stone'], M, uv_box=2.0)
    dbm, hinge = info['door']
    door_b = Batch('door:cell', mat['wood_blue'], ao=256)
    door_b.add(dbm, None)
    core.box_uv(door_b.bm, 2.5)
    sc.batches['door:cell'] = door_b
    door_b.pivot = (M @ hinge)
    door_b.M = M
    # walls as thin collision boxes: the inside stays free (someone can stand behind the door or at the window)
    t_ = 0.75
    W_, D_ = CELL_W + 0.3, CELL_D + 0.3
    sc.col_box('cell-back', (W_, CELL_H, t_), cx, cz - D_ / 2 + t_ / 2, 0)
    sc.col_box('cell-left', (t_, CELL_H, D_), cx - W_ / 2 + t_ / 2, cz, 0)
    sc.col_box('cell-right', (t_, CELL_H, D_), cx + W_ / 2 - t_ / 2, cz, 0)
    dw_ = 2.4 + 0.2
    fz_ = cz + D_ / 2 - t_ / 2
    lw = (W_ - dw_) / 2
    sc.col_box('cell-front-l', (lw, CELL_H, t_), cx - dw_ / 2 - lw / 2, fz_, 0)
    wx0, wx1 = WIN[0] - WIN[2] / 2, WIN[0] + WIN[2] / 2
    # right of the door: below the window, above it, and the piece right of it (the opening stays free)
    sc.col_box('cell-front-r1', (wx0 - dw_ / 2, CELL_H, t_), cx + (dw_ / 2 + wx0) / 2, fz_, 0)
    sc.col_box('cell-front-r2', (W_ / 2 - wx1, CELL_H, t_), cx + (wx1 + W_ / 2) / 2, fz_, 0)
    sc.col_box('cell-front-r3', (WIN[2], WIN[1] - WIN[3] / 2, t_), cx + WIN[0], fz_, 0)
    sc.col_box('cell-front-r4', (WIN[2], CELL_H - WIN[1] - WIN[3] / 2, t_), cx + WIN[0], fz_, 0, WIN[1] + WIN[3] / 2)
    sc.col_box('cell-lintel', (dw_, CELL_H - 5.4, t_), cx, fz_, 0, 5.4)
    sc.col_box('cell-shutter', (0.5, WIN[3], 1.0), cx + WIN[0] + WIN[2] / 2 + 0.1, FRONT_Z + 0.45, 0, WIN[1] - WIN[3] / 2)
    # inside: a reed mat, a little shelf with a cross and a clay lamp (seen through the open door)
    mt = core.new_bm(); core.box(mt, (2.0, 3.2, 0.08), (0, 0, 0.04), bevel=0.03)
    sc.batch('mat', core.material('mat', T('weave', tex.weave, n=512, seed=6, cells=12)), ao=False).add(mt, place(cx - 2.6, cz - 0.4, 0), uv_box=1.2)
    sh = core.new_bm(); core.box(sh, (1.8, 0.6, 0.12), (0, 0, 3.0), bevel=0.03)
    core.box(sh, (0.12, 0.1, 0.9), (0, 0, 3.6), bevel=0.02); core.box(sh, (0.55, 0.1, 0.12), (0, 0, 3.78), bevel=0.02)
    Bt('wood', 'wood').add(sh, place(cx, cz - CELL_D / 2 + 0.95, 0), uv_box=2.0)
    # flower pots along the front wall left of the door, a ginger cat beside them
    for k, (ox, kind) in enumerate(((-4.2, 0), (-3.2, 2))):
        x_, z_ = cx + ox, FRONT_Z + 0.75
        p_ = critters.pot(kind)
        Bt('clay', 'clay').add(p_, place(x_, z_, k * 50, gy(x_, z_)))
        Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(2300 + k, n=9, radius=0.4), place(x_, z_, 0, (1.3 if kind == 0 else 0.3)))
    sc.col_box('cell-pots', (2.2, 1.5, 1.2), cx - 3.7, FRONT_Z + 0.75, 0)
    cb, ct, tp = critters.cat()
    ck = sc.obj('cat', cb, m_crit, place(cx - 5.6, FRONT_Z + 1.0, -150, 0.0))
    sc.obj('cat.tail', ct, m_crit, Matrix.Translation(tp), parent=ck, props={'anim': 'tail', 'freq': 0.35})
    sc.col_box('cat', (1.0, 1.0, 1.4), cx - 5.6, FRONT_Z + 1.0, -150)
    reserve += [(cx, cz, 7.2)]

    # ------------------------------------------------ the fig tree with a long mud-brick bench in its shade
    tx, tz = TREE
    trunk = core.new_bm()
    core.tube(trunk, [Vector((0, 0, -0.3)), Vector((0.2, 0.1, 2.2)), Vector((-0.1, 0.2, 4.4)), Vector((0.3, -0.1, 5.6))], [1.0, 0.75, 0.6, 0.45], sides=12, uv_v=2.0)
    for a, L in ((0.3, 3.4), (2.4, 3.0), (4.3, 3.2), (5.4, 2.6)):
        core.tube(trunk, [Vector((0.2, 0, 4.6)), Vector((math.cos(a) * L * 0.6, math.sin(a) * L * 0.6, 6.1)), Vector((math.cos(a) * L, math.sin(a) * L, 6.8))], [0.38, 0.28, 0.18], sides=8, uv_v=2.0)
    Mt = place(tx, tz, 20, 0.0)
    Bt('tree_bark', 'bark').add(trunk, Mt)
    crown = core.new_bm()
    cr = np.random.default_rng(13)
    for i in range(18):
        a = cr.random() * 2 * math.pi; d = 4.0 * math.sqrt(cr.random())
        c = (0.28 + 0.1 * cr.random(), 0.52 + 0.12 * cr.random(), 0.16 + 0.06 * cr.random())
        critters.blob(crown, (math.cos(a) * d, math.sin(a) * d, 7.4 + 1.4 * cr.random() - d * 0.15), (2.2 + 0.6 * cr.random(), 2.2 + 0.6 * cr.random(), 1.3 + 0.4 * cr.random()), c, subdiv=2)
    for i in range(26):   # ripe purple figs among the leaves (something to spot)
        a = cr.random() * 2 * math.pi; d = 2.0 + 3.0 * math.sqrt(cr.random())
        critters.blob(crown, (math.cos(a) * d, math.sin(a) * d, 6.2 + 1.2 * cr.random()), (0.2, 0.2, 0.24), (0.45, 0.2, 0.4), subdiv=1)
    core.displace(crown, 0.18, 1.1, seed=5)
    sc.obj('tree.crown', crown, mat['shrub'], Mt, props={'anim': 'sway', 'amp': 0.012, 'freq': 0.3, 'phase': 0.4})
    sc.col_box('tree', (2.0, 6.0, 2.0), tx, tz, 0)
    reserve.append((tx, tz, 2.2))
    bx, bz = BENCH
    bn = core.new_bm(); core.box(bn, (BENCH_L, 1.2, SEAT_H - 0.12), (0, 0, (SEAT_H - 0.12) / 2), bevel=0.1)
    core.displace(bn, 0.02, 0.8, seed=3)
    Bt('brick', 'brick').add(bn, place(bx, bz, 0), uv_box=1.6)
    top = core.new_bm(); core.box(top, (BENCH_L + 0.2, 1.4, 0.14), (0, 0, SEAT_H - 0.07), bevel=0.05)
    Bt('wood', 'wood').add(top, place(bx, bz, 0), uv_box=2.0)
    sc.col_box('bench', (BENCH_L + 0.2, SEAT_H, 1.4), bx, bz, 0)
    for k, ox in zip('abcd', (-3.0, -1.0, 1.0, 3.0)):
        sc.seat(f'bench-{k}', bx + ox, SEAT_H, bz, 0.0, 'on the bench under the fig tree, facing +Z')
        sc.anchor(f'bench-{k}', bx + ox, bz + 0.95, 0.0, 0.0, f'stand here before sitting down on seat:bench-{k}')
        reserve.append((bx + ox, bz, 0.8))
    # a water jar at the end of the bench
    jar = critters.pot(0)
    Bt('clay', 'clay').add(jar, place(bx + BENCH_L / 2 + 1.0, bz - 0.2, 30, 0.0))
    sc.col_box('bench-jar', (1.3, 1.4, 1.3), bx + BENCH_L / 2 + 1.0, bz - 0.2, 0)

    # ------------------------------------------------ the village behind: houses with blue doors, pigeon towers
    for k, (hx, hz, hf, tint) in enumerate(HOUSES):
        hp, hi = pieces.cell(seed=60 + k, w=9.0 + k % 2, d=7.5, h=6.2 + 0.4 * (k % 2), door_w=2.2, door_h=5.0, window_side=1 if k % 2 else -1)
        Mh = place(hx, hz, hf, gy(hx, hz))
        Bt('house_plaster' if tint == 'white' else 'house_pink', 'plaster' if tint == 'white' else 'plaster_pink', ao_density=14).add(hp['plaster'], Mh, uv_box=4.0)
        Bt('wood_blue', 'wood_blue').add(hp['wood'], Mh, uv_box=2.5)
        Bt('beams', 'beam').add(hp['beam'], Mh)
        Bt('reeds', 'reeds').add(hp['reeds'], Mh)
        Bt('stones', 'stone').add(hp['stone'], Mh, uv_box=2.0)
        db_, _ = hi['door']
        Bt('wood_blue', 'wood_blue').add(db_, Mh, uv_box=2.5)
        sc.col_box(f'house{k}', (10.5, 7.0, 8.0), hx, hz, hf)
        reserve.append((hx, hz, 6.0))
    for k, (dx, dz) in enumerate(DOVECOTES):
        dc = critters.dovecote(seed=5 + k, r=1.9 - 0.2 * k, h=7.4 + 0.8 * k)
        Md = place(dx, dz, k * 40, gy(dx, dz))
        Bt('house_plaster', 'plaster').add(dc['plaster'], Md, uv_box=4.0)
        sc.batch('dovecote_holes', m_crit, ao=False, vcol=True).add(dc['holes'], Md)
        Bt('beams', 'beam').add(dc['perch'], Md)
        for j, (ppx, ppy, ppz, ph) in enumerate(dc['perches']):
            dvb, dvh, dvp = critters.dove()
            Mv = Md @ Matrix.Translation((ppx, ppy, ppz)) @ Matrix.Rotation(math.radians(ph), 4, 'Z')
            dv = sc.obj(f'dove{k}{j}', dvb, m_crit, Mv)
            sc.obj(f'dove{k}{j}.head', dvh, m_crit, Matrix.Translation(dvp), parent=dv, props={'anim': 'peck', 'freq': 0.5 + 0.13 * j, 'phase': j * 1.7 + k})
        sc.col_box(f'dovecote{k}', (4.0, 8.0, 4.0), dx, dz, 0)
        reserve.append((dx, dz, 2.8))
    # doves on the roof of the cell too
    for k2, (lx, rz) in enumerate(((-3.0, 15), (-2.0, -25), (3.6, 160))):
        Mv = place(cx, cz, cf, 0) @ Matrix.Translation((lx, -1.0, CELL_H + 0.15)) @ Matrix.Rotation(math.radians(rz), 4, 'Z')
        dvb, dvh, dvp = critters.dove()
        dv = sc.obj(f'roofdove{k2}', dvb, m_crit, Mv)
        sc.obj(f'roofdove{k2}.head', dvh, m_crit, Matrix.Translation(dvp), parent=dv, props={'anim': 'peck', 'freq': 0.6 + 0.25 * k2, 'phase': k2 * 2.0})

    # ------------------------------------------------ the well (left behind the cell) and the vegetable garden (right)
    m_rope = core.material('rope', T('rope', tex.rope, n=256, seed=7))
    m_wellw = core.material('well_water', None, color=(0.16, 0.42, 0.52), rough=0.08)
    wx, wz = -3.0, -11.5
    wl = critters.well()
    Mw = place(wx, wz, 20, gy(wx, wz))
    Bt('stones', 'stone').add(wl['stone'], Mw, uv_box=2.0)
    Bt('wood', 'wood').add(wl['wood'], Mw, uv_box=2.5)
    sc.obj('well.water', wl['water'], m_wellw, Mw, vcol=False)
    sc.obj('well.rope', wl['rope'], m_rope, Mw, vcol=False)
    sc.col_box('well', (2.8, 2.8, 2.8), wx, wz, 20)
    reserve.append((wx, wz, 2.4))
    gx, gz = 16.5, -7.0
    gd = critters.garden(seed=9, w=4.6, d=3.0)
    Mg = place(gx, gz, -8, 0.0)
    Bt('brick', 'brick').add(gd['rim'], Mg, uv_box=1.6)
    sc.batch('garden', m_crit, ao=False, vcol=True).add(gd['soil'], Mg)
    sc.batch('garden', m_crit, ao=False, vcol=True).add(gd['plants'], Mg)
    sc.col_box('garden', (5.0, 0.6, 3.4), gx, gz, -8)
    reserve.append((gx, gz, 3.0))

    # ------------------------------------------------ the pond: water, reeds, ducks, a frog-green rim of tufts
    wt = water_textures()
    m_water = core.material('pond_water', wt, rough=0.12, alpha=0.8)
    sc.obj('water.pond', pond_mesh(), m_water, None, vcol=False, props={'anim': 'flow', 'speed': 0.02, 'opacity': 0.82, 'noShadow': True})
    reserve.append((px, pz, pr + 0.8))
    m_reed = core.material('reedclump', None, vcol=True, rough=0.7, double=True)
    for k, a in enumerate((0.4, 1.3, 2.2, 3.6, 4.4, 5.5)):
        rx, rz = px + math.cos(a) * (pr + 0.4), pz + math.sin(a) * (pr + 0.4) / 1.25
        sc.batch('reeds_green', m_reed, ao=False).add(critters.reeds(400 + k, r=0.6, h=2.2 + 0.4 * (k % 2)), place(rx, rz, k * 40, gy(rx, rz)))
        sc.col_box(f'reeds{k}', (1.4, 2.4, 1.4), rx, rz, 0)
    for k, (ox, oz, face, cols) in enumerate(((-1.8, -0.6, 140, ((0.55, 0.4, 0.26), (0.16, 0.42, 0.24))),
                                              (0.6, 0.9, 220, ((0.97, 0.96, 0.92), (0.97, 0.96, 0.92))),
                                              (1.4, 0.3, 200, ((1.0, 0.9, 0.35), (1.0, 0.9, 0.35))),
                                              (2.1, -0.3, 190, ((1.0, 0.9, 0.35), (1.0, 0.9, 0.35))))):
        s_ = 1.3 if k < 2 else 0.8                       # a mother duck and her yellow ducklings
        db_, dh_, hp_ = critters.duck(cols[0], cols[1])
        dk = sc.obj(f'duck{k + 1}', db_, m_crit, place(px + ox, pz + oz, face, WATER_Y - 0.05, s_), props={'anim': 'sway', 'amp': 0.04, 'freq': 0.3 + 0.07 * k, 'phase': k * 1.9})
        sc.obj(f'duck{k + 1}.head', dh_, m_crit, Matrix.Translation(hp_), parent=dk, props={'anim': 'peck', 'freq': 0.5 + 0.2 * k, 'phase': k * 2.0})

    # ------------------------------------------------ anchors
    anchors_xz = []

    def A(name, x, z, face, note=None):
        sc.anchor(name, x, z, face, round(gy(x, z), 3), note)
        anchors_xz.append((x, z))

    A('cell', cx, FRONT_Z + 2.4, 0.0, 'in front of the cell door, facing out (towards the camera side)')
    A('cell-door', cx, FRONT_Z - 0.3, 0.0, 'standing in the doorway, facing out (enter / leave the cell)')
    A('cell-in', cx - 0.2, FRONT_Z - 1.9, 0.0, 'inside, just behind the closed door (start hidden here, show, open the door, walk out)')
    A('window-in', cx + WIN[0], FRONT_Z - 1.15, 0.0, 'inside at the window, facing out: the face is seen through the window')
    A('window', cx + WIN[0] - 0.3, FRONT_Z + 3.0, 180.0, 'outside in front of the window, facing it')
    A('knock', cx - 0.9, FRONT_Z + 1.9, 180.0, 'at the door, a little left, facing it (to knock)')
    A('yard', cx - 3.0, FRONT_Z + 4.6, 0.0, 'the packed-earth yard in front of the cell')
    A('tree', BENCH[0] + 1.0, BENCH[1] + 2.6, 0.0, 'in the shade of the fig tree in front of the bench, facing the camera side')
    A('center', -2.0, 2.0, 0.0, 'the middle of the acting area, between the bench and the cell')
    for nm, t_k in (('path-left', 0.35), ('path-mid', 0.62), ('path-near', 0.8)):
        i = int(t_k * (len(PATH) - 1))
        (ax, az), (bx2, bz2) = PATH[i], PATH[i + 1]
        A(nm, ax, az, math.degrees(math.atan2(bx2 - ax, bz2 - az)), 'on the path, facing along it towards the cell')
    A('offstage-left', -62.0, 11.5, 90.0, 'out of frame on the path, left (enter walking +X)')
    A('offstage-right', 46.0, 8.0, -90.0, 'out of frame, right (enter walking -X)')
    A('pond', px - pr - 1.8, pz + 0.8, 90.0, 'on the bank of the pond, facing the water (+X)')
    A('garden', gx - 3.4, gz + 2.2, 90.0, 'beside the vegetable garden, facing it')
    A('well', wx + 2.4, wz + 1.6, -60.0, 'by the well')

    def free(x, z, r):
        if path_dist(x, z) < r + 0.6:
            return False
        for qx, qz, qr in reserve:
            if math.hypot(x - qx, z - qz) < qr + r:
                return False
        for ax, az in anchors_xz:
            if math.hypot(x - ax, z - az) < 2.5 + r:
                return False
        if -16 < x < 14 and -6 < z < 10:      # the acting area stays clear
            return False
        return True

    # ------------------------------------------------ animals: goats with a kid, hens, a donkey, a camel, butterflies
    goats = [(-27.0, -1.0, 60, (0.96, 0.94, 0.9), (0.55, 0.36, 0.22), True, 1.0),
             (-22.5, -6.5, -30, (0.42, 0.3, 0.22), (0.95, 0.92, 0.86), True, 1.0),
             (-24.5, -3.6, 100, (0.98, 0.96, 0.92), (0.3, 0.24, 0.2), False, 0.62)]
    for k, (gx2, gz2, gf, coat, patch, horns, s_) in enumerate(goats):
        gb, gh, gp, gt_, gtp = critters.goat_parts(coat, patch, horns=horns, s=s_)
        gk = sc.obj(f'goat{k}', gb, m_crit, place(gx2, gz2, gf, gy(gx2, gz2)))
        sc.obj(f'goat{k}.head', gh, m_crit, Matrix.Translation(gp), parent=gk, props={'anim': 'browse', 'seed': 5 + 3 * k})
        sc.obj(f'goat{k}.tail', gt_, m_crit, Matrix.Translation(gtp), parent=gk, props={'anim': 'swish', 'seed': 7 + 3 * k})
        sc.col_box(f'goat{k}', (1.0, 1.9 * s_, 1.9 * s_), gx2, gz2, gf)
        reserve.append((gx2, gz2, 1.6))
    hens = [(14.0, -2.8, 30, 'brown', 0.9), (12.5, 0.8, -40, 'white', 1.0), (-4.5, -4.2, 120, 'brown', 0.8), (19.5, -3.0, 200, 'white', 0.9)]
    for k2, (hx2, hz2, hf2, var, rad) in enumerate(hens):
        cols = ((0.72, 0.36, 0.16), (0.9, 0.62, 0.32), (0.5, 0.22, 0.1)) if var == 'brown' else ((0.97, 0.96, 0.93), (1.0, 1.0, 0.98), (0.85, 0.85, 0.83))
        hb, hh, hp_ = critters.hen(*cols)
        root = sc.obj(f'hen{k2 + 1}', hb, m_crit, place(hx2, hz2, hf2, gy(hx2, hz2)), props={'anim': 'hen', 'radius': rad, 'seed': 17 + 7 * k2})
        sc.obj(f'hen{k2 + 1}.head', hh, m_crit, Matrix.Translation(hp_), parent=root)
        reserve.append((hx2, hz2, rad + 0.6))
    dx_, dz_ = -15.0, -13.5
    db, dh, dp, dt, dtp = critters.donkey_parts()
    dk = sc.obj('donkey', db, m_crit, place(dx_, dz_, 70, gy(dx_, dz_)))
    sc.obj('donkey.head', dh, m_crit, Matrix.Translation(dp), parent=dk, props={'anim': 'browse'})
    sc.obj('donkey.tail', dt, m_crit, Matrix.Translation(dtp), parent=dk, props={'anim': 'swish'})
    post = core.new_bm(); core.tube(post, [Vector((0, 0, -0.2)), Vector((0, 0, 2.2))], 0.13, sides=8, uv_v=1.5)
    Bt('beams', 'beam').add(post, place(dx_ - 2.2, dz_ + 0.6, 0, gy(dx_, dz_)))
    sc.col_box('donkey', (1.6, 2.8, 3.2), dx_, dz_, 70)
    reserve.append((dx_, dz_, 2.8))
    cmx, cmz = 34.0, -6.0
    cbody, cneck, cnp, ctail, ctp = critters.camel_parts()
    cm = sc.obj('camel', cbody, m_crit, place(cmx, cmz, -120, gy(cmx, cmz)))
    sc.obj('camel.neck', cneck, m_crit, Matrix.Translation(cnp), parent=cm, props={'anim': 'ruminate'})
    sc.obj('camel.tail', ctail, m_crit, Matrix.Translation(ctp), parent=cm, props={'anim': 'swish'})
    sc.col_box('camel', (2.2, 3.4, 4.6), cmx, cmz, -120)
    reserve.append((cmx, cmz, 3.4))

    def flutter(name, x, y, z, col, spot, radius=1.2, freq=0.35, phase=0.0):
        body, wl_, wr_ = critters.butterfly(col, spot)
        g = sc.obj(name, body, m_crit, Matrix.Translation(B(x, y, z)),
                   props={'anim': 'butterfly', 'radius': radius, 'freq': freq, 'phase': phase, 'height': 0.35})
        sc.obj(name + '.wing.L', wl_, m_wing, Matrix.Identity(4), parent=g)
        sc.obj(name + '.wing.R', wr_, m_wing, Matrix.Identity(4), parent=g)

    flutter('butterfly1', cx - 3.7, 2.4, FRONT_Z + 1.4, (1.0, 0.85, 0.2), (0.95, 0.45, 0.15), 1.1, 0.3, 0.0)
    flutter('butterfly2', gx, 1.8, gz + 0.5, (1.0, 1.0, 0.97), (0.55, 0.75, 1.0), 1.4, 0.38, 2.0)
    flutter('butterfly3', TREE[0] - 4.0, 2.2, TREE[1] + 3.0, (0.98, 0.55, 0.2), (0.35, 0.2, 0.1), 1.4, 0.27, 4.0)
    flutter('butterfly4', px - 2.0, 1.6, pz - 3.0, (0.6, 0.8, 1.0), (0.25, 0.35, 0.8), 1.6, 0.33, 1.0)

    # ------------------------------------------------ palms (broad leaves) round the village
    palms = [(-36.0, -6.0, 11.0, (0.5, -0.3)), (-40.0, 5.0, 9.5, (0.4, 0.2)), (38.0, 9.0, 10.5, (-0.5, 0.2)),
             (40.0, -12.0, 12.0, (-0.4, 0.3)), (-6.0, -21.0, 12.0, (0.3, 0.2)), (6.0, -24.0, 10.0, (-0.3, 0.2)),
             (-36.0, -34.0, 11.5, (0.4, 0.1)), (28.0, -35.0, 10.0, (-0.4, 0.2)), (0.0, -40.0, 12.5, (0.2, -0.2)),
             (16.0, -15.5, 9.5, (-0.3, 0.3)), (-19.0, 13.0, 9.0, (0.5, 0.3)), (29.0, 15.0, 9.5, (-0.4, 0.2))]
    m_crown = core.material('crown', leaf_t, vcol=True, double=True, rough=0.6)
    crowns = {}
    for i, (x, z, h, lean) in enumerate(palms):
        p = pieces.palm(seed=80 + i, height=h, lean=lean, fronds=13)
        Mp = place(x, z, i * 37.0, gy(x, z) - 0.05)
        Bt('palm_bark', 'bark', ao_density=10).add(p['bark'], Mp)
        Bt('palm_bark', 'bark').add(p['bark_boss'], Mp, uv_box=1.0)
        v = i % 3
        props = {'anim': 'sway', 'amp': 0.035, 'freq': 0.45 + 0.07 * (i % 4), 'phase': i * 1.3}
        Ms = Mp @ Matrix.Translation(p['top']) @ Matrix.Diagonal((h / 10.5,) * 3 + (1,))
        if v not in crowns:
            q = pieces.palm(seed=180 + v, height=10.0, lean=(0, 0), fronds=13)
            cbm = core.new_bm()
            for kk in ('leaf', 'dry', 'dates'):
                core.merge(cbm, q[kk])
            core.transform(cbm, Matrix.Translation(-q['top']))
            crowns[v] = sc.obj(f'palm{i}.crown', cbm, m_crown, Ms, props=props).data
        else:
            sc.obj(f'palm{i}.crown', None, None, Ms, mesh=crowns[v], props=props)
        sc.col_box(f'palm{i}', (1.2, h, 1.2), x, z, 0)
        reserve.append((x, z, 1.6))

    # ------------------------------------------------ grass tufts, flowers and green bushes
    r2 = np.random.default_rng(97)
    nt = 0
    for i in range(8000):
        if nt >= 190:
            break
        x = -45 + 90 * r2.random(); z = -44 + 66 * r2.random()
        if not free(x, z, 0.4):
            continue
        nt += 1
        Bt('grass_green', 'grass', vcol=True, ao=False).add(critters.green_tuft(1500 + i, r=0.45 + 0.25 * r2.random(), h=0.5 + 0.4 * r2.random()), place(x, z, r2.random() * 360, gy(x, z)))
    nf = 0
    for i in range(4000):
        if nf >= 70:
            break
        x = -40 + 80 * r2.random(); z = -30 + 50 * r2.random()
        if not free(x, z, 0.5):
            continue
        nf += 1
        Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(1800 + i, n=4 + int(r2.random() * 5), radius=0.4), place(x, z, 0, gy(x, z)))
    # flowers round the bench and at the cell corners (inside the acting area, but off every walk)
    for k, (fx2, fz2) in enumerate(((BENCH[0] - BENCH_L / 2 - 0.8, BENCH[1] + 0.4), (cx + CELL_W / 2 + 0.9, FRONT_Z + 0.6),
                                     (cx - CELL_W / 2 - 0.9, FRONT_Z + 0.4), (BENCH[0] + BENCH_L / 2 + 0.4, BENCH[1] - 1.6))):
        Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(2400 + k, n=8, radius=0.5), place(fx2, fz2, 0, gy(fx2, fz2)))
        Bt('grass_green', 'grass', vcol=True, ao=False).add(critters.green_tuft(2450 + k), place(fx2 + 0.5, fz2 - 0.3, 0, gy(fx2, fz2)))
    nb = 0
    for i in range(1200):
        if nb >= 16:
            break
        x = -44 + 88 * r2.random(); z = -36 + 54 * r2.random()
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
        sc.bake_ao(samples=40, distance=5.0, max_size=2048, blur=0.6, gamma=1.15, floor=0.18)

    meta = {
        'name': NAME,
        'title': 'Satul de lângă Nil (chilia albă a bătrânului)',
        'units': 'engine units (figure 4.2 tall), three.js Y-up, +Z towards the usual camera',
        'anchors': sc.anchors,
        'seats': sc.seats,
        'bounds': [[-60, -1.5, -50], [60, 14, 26]],
        'acting': {'rect': [[-30, -6], [30, 14]], 'path': [[round(a, 2), round(b, 2)] for a, b in PATH],
                   'pond': {'centre': [px, pz], 'radius': pr, 'water_y': WATER_Y}},
        'skies': ['morning', 'day', 'evening'],
        'sky': {'day': {'sunAz': -30, 'sunElev': 48}, 'morning': {'sunAz': -60, 'sunElev': 16}, 'evening': {'sunAz': 50, 'sunElev': 9}},
        'shadow': {'center': [0, -4], 'radius': 46},
        'shots': {
            'wide': {'pos': [0, 6.0, 30], 'target': [0, 2.4, -6], 'fov': 42, 'note': 'the cell in the middle, the fig tree left, the pond right, the village behind'},
            'door': {'pos': [7, 3.2, 8], 'target': [6.5, 3.0, -5], 'fov': 40, 'note': 'the door and the window'},
        },
        'notes': ('The cell (door node door:cell, opens outwards) stands at x = 6, front wall z = -5; its window (right of the '
                  'door, x = 9, sill 2.9 high) shows a face from anchor window-in. Bench under the fig tree: seats bench-a … bench-d '
                  '(sit: walk to anchor bench-x, then posture sit). The path comes from the front left to the door. Collision: '
                  'col:cell-*, col:bench, col:tree, col:houseN, col:dovecoteN, col:goatN, col:palmN, col:bushN, col:reedsN, col:well.'),
    }
    os.makedirs(out_dir, exist_ok=True)
    sc.export(os.path.join(out_dir, NAME + '.glb'))
    with open(os.path.join(out_dir, NAME + '.json'), 'w') as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    return meta
