"""Set `bakery-yard`: „pităria” — the bakery yard of a desert lavra (film 051, Avva Teodor and the bread he made for the
others). The oven itself is the prop `bread-oven` (it changes: fire, raw loaves, golden loaves), placed by the film on the
spot this set keeps free (`OVEN`); everything else is here.

three.js layout (x right, z towards the usual camera, y up; figure 4.2 tall):
  * the bakery house (AI `pitarie-casa`, whitewashed mud brick, blue shutters) back left, turned towards the yard,
  * the kneading table (AI `pitarie-masa`, 4.6 × 2.0, top 1.55) in the middle left: the kneaders stand behind it facing the
    camera (anchors `table`, `table-r`); the film puts the `dough-trough` on it,
  * the oven's place right of the middle (`OVEN`, mouth turned a little towards the table and the camera) with firewood,
  * shelves of loaves, flour sacks, a hand mill, water jars, a bench, a basket of bread, a salt bowl and a jug on the table
    (AI pieces, tools/image-to-3d-batch.mjs → assets/3d/pitarie-*.glb),
  * a low honey-stone wall round the back of the yard, a path coming in from the left (the brothers' cells), white cells
    and a church with a blue dome behind, palms, a cat by the oven's warm side, hens after the crumbs, doves on the roof.
"""
import math
import os
import json
import numpy as np
from mathutils import Matrix, Vector, noise

from kit import core, tex, pieces, critters, aimesh
from kit.core import B, place, Scene

NAME = 'bakery-yard'
CORE = (-46.0, 46.0, -44.0, 50.0)
TEX_W, TEX_H = 2048, 2048
HOUSE = (-15.5, -12.5, 22.0)
TABLE = (-3.0, -2.9)            # centre of the kneading table
TABLE_H = 1.55
OVEN = (7.2, -6.2, -25.0)       # the bread-oven prop (x, z, face); its mouth towards +Z turned by face
WALL_Z = -15.0


def _curve(p0, p1, p2, n=16):
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
    return out


PATH = _curve((-80.0, 12.0), (-30.0, 9.0), (-6.0, 2.0), 30)


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


def H(x, z):
    """a flat yard, low dunes far round about"""
    hgt = 0.0
    ox = max(0.0, abs(x) - 36.0); oz = max(0.0, z - 44.0, -z - 30.0)
    o = math.hypot(ox, oz)
    if o > 0:
        k = min(1.0, o / 40.0) ** 1.4
        ridge = 1 - abs(noise.noise(Vector((x * 0.012 + 5.1, z * 0.02, 2.7))))
        dune = ridge ** 2.2 * 3.5 + noise.fractal(Vector((x * 0.01, z * 0.01, 9.0)), 0.5, 2.0, 3) * 1.2
        hgt += k * max(0.0, dune) * min(1.0, o / 16.0)
    return hgt


def oven_local(lx, lz):
    """a point in the oven's frame (three x, z; mouth towards +z) → world (x, z)"""
    x, z, f = OVEN
    a = math.radians(f)
    return x + lx * math.cos(a) + lz * math.sin(a), z - lx * math.sin(a) + lz * math.cos(a)


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
    b = core.Batch('ground', mat, ao=(TEX_W, TEX_H), ao_uv=core.UV0)
    b.bm.free(); b.bm = bm
    sc.batches['ground'] = b


def ground_far(sc, mat):
    x0, x1, z0, z1 = CORE
    border = [(x0 + i, z0) for i in range(int(x1 - x0))] + [(x1, z0 + j) for j in range(int(z1 - z0))] + \
             [(x1 - i, z1) for i in range(int(x1 - x0))] + [(x0, z1 - j) for j in range(int(z1 - z0))]
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
            try:
                bm.faces.new((rings[r][i], rings[r][(i + 1) % n], rings[r + 1][(i + 1) % n], rings[r + 1][i]))
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
            k = 0.95 + 0.05 * nz + min(0.05, p.z * 0.005)
            l[cl] = (min(1, k), min(1, k * 0.97), min(1, k * 0.92), 1)
    b = core.Batch('ground_far', mat, ao=False, vcol=True)
    b.bm.free(); b.bm = bm
    sc.batches['ground_far'] = b


def ground_textures(occluders):
    """warm sand, a packed earth yard, the trodden path, a dusting of flour round the table, ash and soot by the oven"""
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
    seed = 511
    n1 = tex.fbm(Hh, seed, 3.0, 1, 40, m=W)
    n2 = tex.fbm(Hh, seed + 1, 1.5, 20, 400, m=W)
    grain = tex.fbm(Hh, seed + 2, 0.0, 300, m=W)
    road = tex.smooth(0.7, -0.6, D)
    yard = tex.smooth(1.0, 0.0, np.hypot((X - 1.0) / 17.0, (Z + 3.0) / 10.0) + 0.12 * n1)
    flour = tex.smooth(1.0, 0.2, np.hypot((X - TABLE[0]) / 3.6, (Z - TABLE[1]) / 2.4) + 0.35 * n1) * 0.55
    ox, oz = oven_local(0, 2.8)
    ash = tex.smooth(1.0, 0.1, np.hypot((X - ox) / 2.6, (Z - oz) / 1.6) + 0.3 * n1) * 0.5
    sand = tex.ramp(tex.norm01(n1 * 0.8 + n2 * 0.2), [(0, '#dfb57c'), (0.45, '#edd394'), (1, '#f7e4b0')])
    earth = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#d0a670'), (0.5, '#ddb57f'), (1, '#e8c793')])
    pathc = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#c69863'), (0.5, '#d4a771'), (1, '#dfb782')])
    col = sand
    col = col * (1 - yard[..., None]) + earth * yard[..., None]
    col = col * (1 - road[..., None]) + pathc * road[..., None]
    col = col * (1 - flour[..., None]) + np.array([0.98, 0.96, 0.92]) * flour[..., None]
    col = col * (1 - 0.35 * ash[..., None])
    col *= (1 + 0.05 * grain[..., None])
    dark = np.zeros_like(X)
    for (oxx, ozz, r) in occluders:
        dark = np.maximum(dark, np.exp(-((np.hypot(X - oxx, Z - ozz) / r) ** 2)))
    col *= (1 - 0.14 * dark[..., None])
    h = grain * 0.08 + n2 * 0.15
    nrm = tex.normal_from_height(tex.blur(h, 0.9), 1.8, wrap=False)
    rough = np.clip(0.9 - 0.06 * road + 0.03 * grain, 0, 1)
    return (tex.save(NAME + '_ground_col', col, 82), tex.save(NAME + '_ground_nrm', nrm, 72),
            tex.save(NAME + '_ground_orm', tex.pack_rough(rough), 80))


def build(out_dir, bake=True):
    core.reset()
    sc = Scene(NAME)
    T = core.texset
    sand_t = T('sand', tex.sand, n=512, seed=1)
    stone_t = T('sandstone', tex.sandstone, n=1024, seed=2)
    blocks_t = T('yardwall', tex.blocks, n=1024, seed=57, rows=4, cols=3, colors=('#f3d9ad', '#e3bf8a', '#cfa36d'), mortar='#b88f60')
    white_t = T('whitewash', tex.plaster, n=512, seed=31, colors=('#fdfaf3', '#f4ecdf', '#e9dcc8'), brick='#e2cfb4')
    bark_t = T('bark', tex.bark, n=512, seed=9)
    leaf_t = T('leaf', tex.leaf, n=256, seed=11)
    beam_t = T('palmwood', tex.wood, n=512, seed=14, planks=1, colors=('#9d7a52', '#7a5636', '#553820'))

    hx, hz, hf = HOUSE
    ox, oz, of = OVEN
    occl = [(hx, hz, 7.0), (ox, oz, 4.0), (TABLE[0], TABLE[1], 2.6)]
    gt = ground_textures(occl)
    ground_core(sc, core.material('ground', gt, extras={'detail': 'sand'}))
    ground_far(sc, core.material('ground_far', sand_t, vcol=True, extras={'detail': 'sand'}))
    mat = {
        'stone': core.material('stone', stone_t),
        'wall': core.material('yardwall', blocks_t, vcol=True),
        'white': core.material('white', white_t),
        'roof': core.material('roof', None, color=(0.25, 0.48, 0.78), rough=0.5),
        'bark': core.material('bark', bark_t),
        'twig': core.material('twig', beam_t, color=(0.6, 0.5, 0.42)),
        'shrub': core.material('shrub', None, vcol=True, rough=0.75),
        'grass': core.material('grass', None, vcol=True, rough=0.8, double=True),
        'cliff': core.material('cliffs', stone_t, color=(1.0, 0.95, 0.9)),
    }
    Bt = lambda name, m, **kw: sc.batch(name, mat[m], **kw)
    gy = H
    m_crit = core.material('critter', None, vcol=True, rough=0.55)
    reserve = [(ox, oz, 3.4)]

    # ------------------------------------------------ AI pieces (fitted to a height, pivot on the ground, a collision box)
    ai_cache = {}

    def ai_piece(name, x, z, face, height, k=0, col=True, sink=0.01, y=0.0, sx=1.0, rough=0.6, col_h=None, size=None):
        if not os.path.exists(os.path.join(aimesh.SRC, name + '.glb')):
            print(f'  (no {name}.glb yet — skipped)')
            return None
        key = (name, sx)
        if key not in ai_cache:
            ob = aimesh.load(name)
            aimesh.drop_loose(ob, 12)
            lo, hi = aimesh.bounds(ob)
            s = height / (hi[2] - lo[2])
            aimesh.fit(ob, s, ground=lo[2] + sink * (hi[2] - lo[2]), centre=((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2))
            if sx != 1.0:
                ob.data.transform(Matrix.Diagonal((sx, 1, 1, 1)))
            if size:
                l1, h1 = aimesh.bounds(ob)
                ob.data.transform(Matrix.Diagonal((size[0] / (h1[0] - l1[0]), size[1] / (h1[1] - l1[1]), 1, 1)))
            lo2, hi2 = aimesh.bounds(ob)
            ai_cache[key] = (aimesh.finish(sc, ob, f'{name}.{k}', place(x, z, face, gy(x, z) + y), rough=rough), lo2, hi2)
        else:
            aimesh.share(sc, ai_cache[key][0], f'{name}.{k}', place(x, z, face, gy(x, z) + y))
        _, lo2, hi2 = ai_cache[key]
        w, d = hi2[0] - lo2[0], hi2[1] - lo2[1]
        if col:
            sc.col_box(f'{name}{k}', (w * 0.9, col_h or height, d * 0.9), x, z, face, y)
        reserve.append((x, z, max(w, d) / 2 + 0.3))
        return w, d

    # the bakery house (whitewashed mud brick), back left, turned towards the yard
    ai_piece('pitarie-casa', hx, hz, hf, 7.4, rough=0.85)
    # the kneading table: 4.6 wide (stretched along x), top at 1.55; its collider is the table top only (the legs are
    # at the corners: a kneader stands close behind it)
    tw = ai_piece('pitarie-masa', TABLE[0], TABLE[1], 0, TABLE_H, size=(4.4, 1.8), col=False, rough=0.55)
    if tw:
        sc.col_box('table', (tw[0] * 0.96, 0.25, tw[1] * 0.74), TABLE[0], TABLE[1], 0, TABLE_H - 0.25)
        for k, (lx, lz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
            sc.col_box(f'tableleg{k}', (0.26, TABLE_H, 0.26), TABLE[0] + lx * (tw[0] / 2 - 0.3), TABLE[1] + lz * (tw[1] / 2 - 0.3), 0)
        # small things on the table's ends: a bowl of salt (left), a water jug (right)
        ai_piece('pitarie-solnita', TABLE[0] - tw[0] / 2 + 0.45, TABLE[1] + 0.45, 20, 0.42, col=False, y=TABLE_H)
        ai_piece('pitarie-ulcior', TABLE[0] + tw[0] / 2 - 0.4, TABLE[1] - 0.35, -30, 0.8, col=False, y=TABLE_H)
        ai_piece('pitarie-paine', TABLE[0] + tw[0] / 2 - 0.6, TABLE[1] + 0.55, 40, 0.3, col=False, y=TABLE_H)
    # shelves of loaves left of the house door, sacks of flour, the hand mill, baskets of bread
    ai_piece('pitarie-raft', -9.6, -11.0, 15, 4.2)
    ai_piece('pitarie-saci', -10.8, -6.6, 30, 1.5)
    ai_piece('pitarie-rasnita', -12.2, -2.6, 55, 1.2)
    ai_piece('pitarie-cos', -7.6, -9.4, 10, 0.95)
    ai_piece('pitarie-cos', 13.8, -3.0, -40, 0.95, k=1)
    # the bench where Teodor leaves his own flour (`bench`): the AI bench of 050 (0.9 high)
    ai_piece('piatra-banca', -8.6, 1.6, 75, 0.9, rough=0.7)
    # firewood beside the oven, big water jars behind the table
    fx, fz = oven_local(3.6, 0.2)
    ai_piece('pitarie-lemne', fx, fz, of - 70, 1.7)
    ai_piece('piatra-lemne', *oven_local(3.3, -2.3), of - 20, 1.4, k=1)
    ai_piece('pitarie-chiupuri', 1.6, -10.2, -10, 1.9)
    ai_piece('moise-ulcior-apa', -0.6, -10.8, 0, 1.6, rough=0.45)
    ai_piece('pitarie-cos', 3.3, -9.6, 25, 0.9, k=2)

    # ------------------------------------------------ a low honey-stone wall round the back of the yard
    def wall(a, b, h=1.35, t=0.9):
        (ax, az), (bx, bz) = a, b
        L = math.hypot(bx - ax, bz - az)
        f = math.degrees(math.atan2(bx - ax, bz - az)) - 90
        wb = core.new_bm(); core.box(wb, (L, t, h), (0, 0, h / 2), bevel=0.12)
        core.box(wb, (L + 0.2, t + 0.25, 0.22), (0, 0, h + 0.05), bevel=0.08)
        core.box_uv(wb, 2.6)
        core.set_color(wb, (1, 1, 1))
        mx, mz = (ax + bx) / 2, (az + bz) / 2
        Bt('yardwall', 'wall', vcol=True).add(wb, place(mx, mz, f, gy(mx, mz)))
        sc.col_box(f'wall{len(reserve)}', (L, h + 0.3, t), mx, mz, f)
        for k in range(int(L // 2)):
            u = (k + 0.5) / max(1, int(L // 2))
            reserve.append((ax + (bx - ax) * u, az + (bz - az) * u, 1.0))
    for a_, b_ in (((-6.0, WALL_Z), (19.0, WALL_Z)), ((19.0, WALL_Z), (21.0, 2.0)), ((21.0, 2.0), (19.5, 12.0))):
        wall(a_, b_)

    # ------------------------------------------------ behind: white cells of the lavra and a church with a blue dome
    alba_cache = []
    for k, (x, z, f, s) in enumerate(((-30.0, -20.0, 30, 6.0), (-40.0, -6.0, 70, 5.5), (26.0, -26.0, -20, 6.0), (36.0, -14.0, -60, 5.5), (-22.0, -30.0, 10, 5.0))):
        if not alba_cache:
            ob = aimesh.load('chilie-alba')
            aimesh.drop_loose(ob, 40, 0.45)
            lo, hi = aimesh.bounds(ob)
            aimesh.fit(ob, 1.0, ground=lo[2] + 0.02 * (hi[2] - lo[2]))
            alba_cache.append(aimesh.finish(sc, ob, f'cellw{k}', place(x, z, f, gy(x, z), s), rough=0.85))
        else:
            aimesh.share(sc, alba_cache[0], f'cellw{k}', place(x, z, f, gy(x, z), s))
        sc.col_box(f'cellw{k}', (2.0 * s, 2.0 * s, 2.0 * s), x, z, f)
        reserve.append((x, z, 1.2 * s))
    cx_, cz_ = 4.0, -34.0
    ch = core.new_bm(); core.box(ch, (7.0, 10.0, 7.5), (0, 0, 3.75), bevel=0.2)
    core.box(ch, (3.6, 3.6, 2.2), (0, 0, 8.6), bevel=0.12)
    core.box(ch, (2.6, 0.4, 3.4), (0, -5.1, 1.7), bevel=0.1)
    Bt('church', 'white').add(ch, place(cx_, cz_, 0, gy(cx_, cz_)), uv_box=4.0)
    dm = core.new_bm(); core.lathe(dm, [(0.0, 2.1), (0.75, 1.95), (1.35, 1.5), (1.75, 0.85), (1.95, 0.0)], segs=28, uv_v=1.0)
    core.transform(dm, Matrix.Translation((0, 0, 9.7)))
    Bt('church_dome', 'roof', ao=False).add(dm, place(cx_, cz_, 0, gy(cx_, cz_)))
    cr_ = core.new_bm(); core.box(cr_, (0.16, 0.16, 1.4), (0, 0, 12.4)); core.box(cr_, (0.8, 0.16, 0.16), (0, 0, 12.75))
    core.box(cr_, (0.5, 0.16, 0.12), (0, 0, 12.0), M=Matrix.Translation((0, 0, 12.0)) @ Matrix.Rotation(-0.35, 4, 'Y') @ Matrix.Translation((0, 0, -12.0)))
    core.set_color(cr_, (0.95, 0.78, 0.3))
    sc.batch('church_cross', m_crit, ao=False, vcol=True).add(cr_, place(cx_, cz_, 0, gy(cx_, cz_)))
    drc = core.new_bm(); core.box(drc, (1.8, 0.12, 2.6), (0, -5.32, 1.3)); core.set_color(drc, (0.55, 0.3, 0.16))
    sc.batch('church_door', m_crit, ao=False, vcol=True).add(drc, place(cx_, cz_, 0, gy(cx_, cz_)))
    sc.col_box('church', (8.0, 13.0, 11.0), cx_, cz_, 0)
    reserve.append((cx_, cz_, 7.5))

    # ------------------------------------------------ animals (every animal moves all the time)
    # a cat curled by the oven's warm side, flicking its tail
    ctx, ctz = oven_local(-3.1, 0.6)
    cb, ct, tp = critters.cat((0.95, 0.62, 0.3), (1.0, 0.92, 0.8))
    ck = sc.obj('cat', cb, m_crit, place(ctx, ctz, of + 150, gy(ctx, ctz)))
    sc.obj('cat.tail', ct, m_crit, Matrix.Translation(tp), parent=ck, props={'anim': 'tail', 'freq': 0.35})
    sc.col_box('cat', (1.0, 1.0, 1.4), ctx, ctz, 0)
    reserve.append((ctx, ctz, 1.0))
    # hens after the crumbs, away from the walks
    hens = [(-12.5, 3.5, 30, 'brown', 0.9), (-14.0, 6.0, -40, 'white', 0.8), (12.5, 5.5, 120, 'brown', 0.9), (15.0, 2.5, 200, 'white', 0.8)]
    for k2, (hx2, hz2, hf2, var, rad) in enumerate(hens):
        cols = ((0.72, 0.36, 0.16), (0.9, 0.62, 0.32), (0.5, 0.22, 0.1)) if var == 'brown' else ((0.97, 0.96, 0.93), (1.0, 1.0, 0.98), (0.85, 0.85, 0.83))
        hb, hh, hp_ = critters.hen(*cols)
        root = sc.obj(f'hen{k2 + 1}', hb, m_crit, place(hx2, hz2, hf2, gy(hx2, hz2)), props={'anim': 'hen', 'radius': rad, 'seed': 31 + 7 * k2})
        sc.obj(f'hen{k2 + 1}.head', hh, m_crit, Matrix.Translation(hp_), parent=root)
        reserve.append((hx2, hz2, rad + 0.6))
    # doves on the bakery roof and on the yard wall (they peck about)
    top = 7.4 * 0.86
    for k, (lx, lz, rz_) in enumerate(((-2.0, 0.5, 20), (1.2, -0.8, -150), (2.6, 1.0, 70))):
        a = math.radians(hf)
        x = hx + lx * math.cos(a) + lz * math.sin(a); z = hz - lx * math.sin(a) + lz * math.cos(a)
        dvb, dvh, dvp = critters.dove((0.96, 0.95, 0.93) if k != 1 else (0.72, 0.72, 0.78), (0.78, 0.78, 0.8))
        dv = sc.obj(f'roofdove{k}', dvb, m_crit, Matrix.Translation(B(x, gy(x, z) + top, z)) @ Matrix.Rotation(math.radians(rz_), 4, 'Z'))
        sc.obj(f'roofdove{k}.head', dvh, m_crit, Matrix.Translation(dvp), parent=dv, props={'anim': 'peck', 'freq': 0.6 + 0.25 * k, 'phase': k * 2.0})
    for k, (x, rz_) in enumerate(((4.5, 30), (6.0, -120), (14.0, 200))):
        dvb, dvh, dvp = critters.dove()
        dv = sc.obj(f'walldove{k}', dvb, m_crit, Matrix.Translation(B(x, 1.6, WALL_Z)) @ Matrix.Rotation(math.radians(rz_), 4, 'Z'))
        sc.obj(f'walldove{k}.head', dvh, m_crit, Matrix.Translation(dvp), parent=dv, props={'anim': 'peck', 'freq': 0.55 + 0.2 * k, 'phase': k * 1.3})
    # a dovecote behind the wall on the right
    dxc, dzc = 25.0, -8.0
    dc = critters.dovecote(seed=7, r=1.8, h=7.2)
    Md = place(dxc, dzc, -30, gy(dxc, dzc))
    sc.batch('dovecote', core.material('dovecote_plaster', white_t, vcol=True)).add(dc['plaster'], Md, uv_box=4.0)
    sc.batch('dovecote_holes', m_crit, ao=False, vcol=True).add(dc['holes'], Md)
    sc.batch('dovecote_perch', core.material('perch', beam_t)).add(dc['perch'], Md)
    for j, (ppx, ppy, ppz, ph) in enumerate(dc['perches']):
        dvb, dvh, dvp = critters.dove()
        dv = sc.obj(f'dove{j}', dvb, m_crit, Md @ Matrix.Translation((ppx, ppy, ppz)) @ Matrix.Rotation(math.radians(ph), 4, 'Z'))
        sc.obj(f'dove{j}.head', dvh, m_crit, Matrix.Translation(dvp), parent=dv, props={'anim': 'peck', 'freq': 0.5 + 0.13 * j, 'phase': j * 1.7})
    sc.col_box('dovecote', (4.0, 8.0, 4.0), dxc, dzc, 0)
    reserve.append((dxc, dzc, 2.8))
    m_wing = core.material('wing', None, vcol=True, rough=0.5, double=True)
    for k, (bx_, by_, bz_, c1, c2) in enumerate(((-11.5, 1.9, 4.0, (1.0, 0.85, 0.2), (0.95, 0.45, 0.15)), (15.0, 1.7, 7.0, (1.0, 1.0, 0.97), (0.55, 0.75, 1.0)),
                                                (-6.0, 2.2, -12.0, (0.95, 0.45, 0.7), (0.6, 0.2, 0.5)))):
        body, wl_, wr_ = critters.butterfly(c1, c2)
        g = sc.obj(f'butterfly{k}', body, m_crit, Matrix.Translation(B(bx_, by_, bz_)), props={'anim': 'butterfly', 'radius': 1.3, 'freq': 0.3 + 0.04 * k, 'phase': k * 1.6, 'height': 0.35})
        sc.obj(f'butterfly{k}.wing.L', wl_, m_wing, Matrix.Identity(4), parent=g)
        sc.obj(f'butterfly{k}.wing.R', wr_, m_wing, Matrix.Identity(4), parent=g)

    # ------------------------------------------------ anchors
    anchors_xz = []

    def A(name, x, z, face, note=None):
        sc.anchor(name, x, z, face, round(gy(x, z), 3), note)
        anchors_xz.append((x, z))

    tx, tz = TABLE
    A('table', tx - 0.55, tz - 1.6, 0.0, 'behind the kneading table, over the trough (the film puts `dough-trough` on the table at [tx, tz - 0.35], y 1.55), facing the camera')
    A('table-r', tx + 1.75, tz - 1.6, 0.0, 'behind the table, right of the trough (over the shaped loaves), facing the camera')
    A('table-front', tx, tz + 2.9, 180.0, 'in front of the table, facing it (and the kneaders)')
    A('bench', -8.6 + 1.9, 1.6 + 0.4, -95.0, 'beside the bench, facing it (put a sack on the bench at [-8.6, 1.6], y 0.9)')
    bx, bz = oven_local(-0.66, 3.9)
    A('oven', bx, bz, of + 180.0, 'in front of the oven mouth, facing it, the right hand on the mouth\'s axis: a peel held in the right hand and tilted 90° lays the loaf on the oven\'s first spot')
    bx, bz = oven_local(-0.66, 5.2)
    A('oven-back', bx, bz, of + 180.0, 'a step back from `oven` (walk from here to `oven`: the peel slides into the mouth)')
    sx2, sz2 = oven_local(-3.2, 3.6)
    A('oven-side', sx2, sz2, of + 140.0, 'beside the oven on the table side, facing the mouth (a helper watching / holding the basket)')
    A('yard', 2.0, 2.5, 0.0, 'the middle of the yard (the acting area)')
    A('center', 1.0, 6.0, 0.0, 'the front of the yard, towards the camera')
    for nm, t_k in (('path-near', 0.86), ('path-mid', 0.62), ('path-far', 0.42)):
        i = int(t_k * (len(PATH) - 1))
        (ax, az), (bx2, bz2) = PATH[i], PATH[i + 1]
        A(nm, ax, az, math.degrees(math.atan2(bx2 - ax, bz2 - az)), 'on the path from the cells (left), facing along it towards the yard')
    A('offstage-left', -62.0, 10.5, 95.0, 'out of frame on the path, left (enter walking +X)')
    A('offstage-right', 50.0, 10.0, -90.0, 'out of frame, right (enter walking -X)')

    def free(x, z, r):
        if path_dist(x, z) < r + 0.6:
            return False
        for qx, qz, qr in reserve:
            if math.hypot(x - qx, z - qz) < qr + r:
                return False
        for ax, az in anchors_xz:
            if math.hypot(x - ax, z - az) < 2.5 + r:
                return False
        if -11 < x < 18 and -12 < z < 11:      # the yard stays clear
            return False
        return True

    # far honey cliffs, palms, tufts, flowers, bushes
    for k_, (mx_, mz_, w_, d_, h_) in enumerate(((-70, -140, 60, 30, 12), (30, -160, 70, 30, 15), (110, -120, 50, 30, 10),
                                                  (-150, 60, 50, 40, 11), (160, 80, 60, 40, 12), (20, 190, 80, 40, 13))):
        mb = pieces.mesa(960 + k_, w_, d_, h_, tile=7.0)
        sc.batch('cliffs', mat['cliff'], ao=False).add(mb, place(mx_, mz_, math.degrees(math.atan2(-mx_, -mz_)) * 0.4, gy(mx_, mz_) - 1.5))
    palms = [(-24.0, -12.0, 10.5, (0.3, 0.2)), (-19.0, -24.0, 9.0, (-0.2, 0.3)), (16.0, -22.0, 11.0, (-0.3, 0.2)), (30.0, 4.0, 10.0, (-0.4, 0.1)),
             (-28.0, 22.0, 9.5, (0.4, -0.2)), (26.0, 28.0, 10.5, (-0.3, -0.2)), (12.0, -19.5, 8.5, (0.2, 0.3))]
    m_crown = core.material('crown', leaf_t, vcol=True, double=True, rough=0.6)
    for i, (x, z, h, lean) in enumerate(palms):
        p = pieces.palm(seed=190 + i, height=h, lean=lean, fronds=12)
        Mp = place(x, z, i * 37.0, gy(x, z) - 0.05)
        Bt('palm_bark', 'bark', ao_density=10).add(p['bark'], Mp)
        Bt('palm_bark', 'bark').add(p['bark_boss'], Mp, uv_box=1.0)
        cbm = core.new_bm()
        for kk in ('leaf', 'dry', 'dates'):
            core.merge(cbm, p[kk])
        core.transform(cbm, Matrix.Translation(-p['top']))
        sc.obj(f'palm{i}.crown', cbm, m_crown, Mp @ Matrix.Translation(p['top']), props={'anim': 'sway', 'amp': 0.035, 'freq': 0.45 + 0.07 * i, 'phase': i * 1.3})
        sc.col_box(f'palm{i}', (1.2, h, 1.2), x, z, 0)
        reserve.append((x, z, 1.5))
    r2 = np.random.default_rng(151)
    nt = 0
    for i in range(6000):
        if nt >= 100:
            break
        x = -45 + 90 * r2.random(); z = -40 + 88 * r2.random()
        if not free(x, z, 0.4):
            continue
        nt += 1
        Bt('tufts', 'grass', vcol=True, ao=False).add(pieces.tuft(1700 + i, r=0.4 + 0.2 * r2.random(), h=0.5 + 0.3 * r2.random(), dry=0.6), place(x, z, r2.random() * 360, gy(x, z)))
    nb = 0
    for i in range(1500):
        if nb >= 18:
            break
        x = -44 + 88 * r2.random(); z = -38 + 86 * r2.random()
        if not free(x, z, 1.4):
            continue
        nb += 1
        bsh = pieces.bush(seed=900 + i, r=0.8 + 0.6 * r2.random(), h=0.9 + 0.7 * r2.random(), green=(0.45, 0.55, 0.28))
        Mb = place(x, z, r2.random() * 360, gy(x, z))
        Bt('twigs', 'twig', ao=False).add(bsh['twig'], Mb)
        Bt('shrubs', 'shrub', vcol=True, ao=False).add(bsh['shrub'], Mb)
        sc.col_box(f'bush{nb}', (1.6, 1.4, 1.6), x, z, 0)
        reserve.append((x, z, 1.6))
    pal = ((1.0, 0.85, 0.2), (1.0, 1.0, 0.95), (0.98, 0.45, 0.55), (0.95, 0.6, 0.2))
    nf = 0
    for i in range(5000):
        if nf >= 60:
            break
        x = -42 + 84 * r2.random(); z = -34 + 80 * r2.random()
        if not free(x, z, 0.5):
            continue
        nf += 1
        Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(2700 + i, n=5 + int(r2.random() * 5), radius=0.45, palette=pal), place(x, z, 0, gy(x, z)))
    # flower clumps along the foot of the yard wall and the house (off every walk)
    for k, (fx2, fz2) in enumerate(((-4.0, -13.8), (9.0, -13.8), (16.5, -13.8), (19.8, -6.0), (-11.8, -9.0), (-13.5, 1.0))):
        Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(3100 + k, n=9, radius=0.55, palette=pal), place(fx2, fz2, 0, gy(fx2, fz2)))

    sc.finalize()
    if bake:
        sc.bake_ao(samples=40, distance=5.0, max_size=2048, blur=0.6, gamma=1.15, floor=0.18)

    meta = {
        'name': NAME,
        'title': 'Pităria lavrei (curtea brutăriei, cu cuptorul)',
        'units': 'engine units (figure 4.2 tall), three.js Y-up, +Z towards the usual camera',
        'anchors': sc.anchors,
        'seats': sc.seats,
        'bounds': [[-60, -1.5, -50], [60, 16, 56]],
        'acting': {'rect': [[-11, -6], [16, 10]], 'paths': [[[round(a, 2), round(b, 2)] for a, b in PATH]]},
        'oven': {'at': [OVEN[0], OVEN[1]], 'face': OVEN[2], 'note': 'place the `bread-oven` prop here'},
        'table': {'at': list(TABLE), 'top': TABLE_H, 'trough': [TABLE[0], round(TABLE[1] - 0.35, 2)]},
        'skies': ['morning', 'day', 'evening'],
        'sky': {'day': {'sunAz': -30, 'sunElev': 50}, 'morning': {'sunAz': -60, 'sunElev': 20}, 'evening': {'sunAz': 55, 'sunElev': 11}},
        'shadow': {'center': [1, -2], 'radius': 45},
        'shots': {
            'wide': {'pos': [1, 7.0, 26], 'target': [1, 2.5, -6], 'fov': 42, 'note': 'the yard: house left, table, oven right'},
            'table': {'pos': [-3, 4.2, 6.5], 'target': [-3, 2.2, -3.5], 'fov': 38, 'note': 'the kneading table from the front'},
        },
        'notes': ('Bakery yard: house (AI pitarie-casa) at [%.1f, %.1f]; kneading table [%.1f, %.1f], top 1.55 (col:table + legs); the oven prop '
                  'goes at [%.1f, %.1f] face %.0f (`bread-oven`). The brothers come along the path from the left (offstage-left → path-far → '
                  'path-mid → path-near). Collision: col:pitarie-*, col:table*, col:wall*, col:cellwN, col:church, col:palmN, col:bushN.') % (hx, hz, TABLE[0], TABLE[1], OVEN[0], OVEN[1], OVEN[2]),
    }
    os.makedirs(out_dir, exist_ok=True)
    sc.export(os.path.join(out_dir, NAME + '.glb'))
    with open(os.path.join(out_dir, NAME + '.json'), 'w') as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    return meta
