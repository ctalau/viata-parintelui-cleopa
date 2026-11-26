"""Set `river-ford`: a green river through the Egyptian desert, with a shallow ford where people wade across.

three.js layout (x right, z towards the usual camera, y up; figure 4.2 tall):
  * the river flows from the back (-Z, far away between the dunes) towards the camera (+Z), centre line `river_x(z)`,
    ≈ 10 wide; the water surface is at y = WATER_Y, the bed ≈ 0.6 below it at the ford (z ≈ 2): the water reaches the shins,
  * a footpath comes from the front left down to the left bank at the ford, and goes on from the right bank to the back right,
  * green banks (grass, reeds with cattails, flowers), palms, ducks on the water, dunes and the open desert beyond.
"""
import math
import os
import json
import numpy as np
from mathutils import Matrix, Vector, noise

from kit import core, tex, pieces, critters
from kit.core import B, place, Batch, Scene

NAME = 'river-ford'
CORE = (-44.0, 44.0, -30.0, 22.0)
TEX_W, TEX_H = 2048, 1024
WATER_Y = -0.38
FORD_Z = 2.0


def river_x(z):
    return 1.0 * math.sin(z * 0.045 + 0.3)


def river_d(x, z):
    return abs(x - river_x(z))


def _poly(pts):
    return [(float(a), float(b)) for a, b in pts]


def _curve(p0, p1, p2, n=16):
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
    return out


BANK_L = (river_x(FORD_Z) - 8.8, FORD_Z)
BANK_R = (river_x(FORD_Z) + 8.8, FORD_Z)
PATH_L = _curve((-70.0, 15.0), (-24.0, 8.0), (BANK_L[0] + 2.4, FORD_Z))
PATH_R = _curve((BANK_R[0] - 2.4, FORD_Z), (22.0, -1.0), (70.0, -16.0))
PATHS = [PATH_L, PATH_R]


def dist_to_poly(px, pz, pts):
    best = 1e9
    for (ax, az), (bx, bz) in zip(pts[:-1], pts[1:]):
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz
        t = 0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / L2))
        best = min(best, math.hypot(px - ax - t * dx, pz - az - t * dz))
    return best


def path_dist(x, z):
    d = 1e9
    for p in PATHS:
        d = min(d, dist_to_poly(x, z, p) - 1.3)
    # the ford itself (the walked line across the water)
    if abs(x - river_x(z)) < 7.5:
        d = min(d, abs(z - FORD_Z) - 1.3)
    return d


def smooth(e0, e1, v):
    t = min(1.0, max(0.0, (v - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def bed(d, z):
    """River profile: deep middle, shallower at the ford, banks rising to 0 at d = 6.6."""
    ford = math.exp(-((z - FORD_Z) / 4.0) ** 2)
    deep = -1.18 + 0.2 * ford
    edge = 6.6 + 2.6 * ford          # a long gentle slope where people wade in and out
    if d < 3.0:
        return deep + 0.12 * (d / 3.0) ** 2
    return (deep + 0.12) * (1 - smooth(3.0, edge, d))


def H(x, z):
    d = river_d(x, z)
    pd = path_dist(x, z)
    near = noise.fractal(Vector((x * 0.045, z * 0.045, 0.3)), 0.5, 2.0, 3) * 0.45
    flat = min(1.0, max(0.0, (pd - 0.5) / 6.0)) * smooth(9.2, 12.0, d)
    hgt = near * flat
    if d < 9.2:
        hgt += bed(d, z)
    ox = max(0.0, abs(x) - 36.0); oz = max(0.0, -z - 22.0) + max(0.0, z - 16.0)
    o = math.hypot(ox, oz)
    if o > 0:
        k = min(1.0, o / 40.0) ** 1.4 * smooth(9.0, 30.0, d)
        ridge = 1 - abs(noise.noise(Vector((x * 0.012 + 3.1, z * 0.02, 1.7))))
        ridge2 = 1 - abs(noise.noise(Vector((x * 0.025 + 9.3, z * 0.035, 4.2))))
        dune = (ridge ** 2.2 * 14.0 + ridge2 ** 2 * 5.0 + noise.fractal(Vector((x * 0.01, z * 0.01, 7.0)), 0.5, 2.0, 3) * 3.0)
        hgt += k * max(0.0, dune) * min(1.0, o / 18.0)
    return hgt


# ---------------------------------------------------------------- ground meshes
def ground_core(sc, mat):
    x0, x1, z0, z1 = CORE
    st = 0.5
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
            # near the river the rings go straight along it (the channel stays a channel far away)
            if abs(bx - river_x(bz)) < 12 and (bz == z0 or bz == z1):
                nrm = Vector((0.0, 1.0 if bz == z1 else -1.0))
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
    up = sum(f.normal.z for f in bm.faces)
    if up < 0:
        for f in bm.faces:
            f.normal_flip()
    for f in bm.faces:
        for l in f.loops:
            p = l.vert.co
            l[uvl].uv = (p.x / 9.0, p.y / 9.0)
            hh = p.z
            nz = noise.noise(Vector((p.x * 0.03, p.y * 0.03, 2.0)))
            k = 0.93 + 0.05 * nz + min(0.07, hh * 0.006)
            dr = abs(p.x - river_x(-p.y))
            if hh < -0.2 or dr < 9:      # the far river bed and its green banks
                g = smooth(5.0, 12.0, dr)
                l[cl] = (k * (0.55 + 0.45 * g), k * (0.75 + 0.22 * g), k * (0.45 + 0.5 * g), 1)
            else:
                l[cl] = (min(1, k * 1.0), min(1, k * 0.975), min(1, k * 0.95), 1)
    b = Batch('ground_far', mat, ao=False, vcol=True)
    b.bm.free(); b.bm = bm
    sc.batches['ground_far'] = b


def ground_textures(occluders):
    """Sand, compacted footpaths, green grassy banks, wet dark sand at the water's edge, a pebbly bed under the water."""
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
    RX = np.vectorize(river_x)(Z)
    RD = np.abs(X - RX)
    Hgt = np.kron(np.vectorize(H)(Xc, Zc), np.ones((cs, cs)))[:Hh, :W]
    Hgt = tex.blur(Hgt, 1.5)
    road = tex.smooth(0.7, -0.6, D) * tex.smooth(6.2, 7.2, RD)
    seed = 131
    n1 = tex.fbm(Hh, seed, 3.0, 1, 40, m=W)
    n2 = tex.fbm(Hh, seed + 1, 1.5, 20, 400, m=W)
    grain = tex.fbm(Hh, seed + 2, 0.0, 300, m=W)
    warp = tex.fbm(Hh, seed + 3, 3.2, 1, 12, m=W) * 3.0
    ph = (X * 0.92 + Z * 0.35 + warp) / 1.3 * 2 * np.pi
    rip = np.sin(ph) + 0.35 * np.sin(2 * ph + 1.0)
    # zones
    under = tex.smooth(WATER_Y + 0.05, WATER_Y - 0.12, Hgt)                       # under the water
    wet = tex.smooth(WATER_Y + 0.45, WATER_Y + 0.02, Hgt) * (1 - under)           # the dark wet strip
    green = tex.smooth(13.0, 7.5, RD + 2.5 * n1) * (1 - under) * (1 - road) * tex.smooth(-0.05, 0.1, Hgt - WATER_Y - 0.35)
    sand = tex.ramp(tex.norm01(n1 * 0.8 + n2 * 0.2), [(0, '#d99852'), (0.45, '#e9b26e'), (1, '#f5cc8c')])
    pathc = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#d6a874'), (0.5, '#e3bb8a'), (1, '#eccb9c')])
    grass = tex.ramp(tex.norm01(n2 * 0.7 + grain * 0.05 + n1 * 0.3), [(0, '#5f8f2e'), (0.5, '#7cab3a'), (1, '#a3c552')])
    wetc = tex.ramp(tex.norm01(n2), [(0, '#8a6a44'), (1, '#a5815a')])
    f1, _, _ = tex.voronoi(256, seed + 5, 1400, m=512)
    peb = np.kron(tex.smooth(0.3, 0.05, f1), np.ones((4, 4)))[:Hh, :W]
    bedc = tex.ramp(tex.norm01(n2 + peb * 0.6), [(0, '#7d6a48'), (0.6, '#9a8660'), (1, '#c2ad84')])
    col = sand
    col = col * (1 - road[..., None]) + pathc * road[..., None]
    col *= (1 + 0.035 * rip[..., None] * (1 - road[..., None]) * (1 - green[..., None]))
    col = col * (1 - green[..., None]) + grass * green[..., None]
    col = col * (1 - wet[..., None]) + wetc * wet[..., None]
    col = col * (1 - under[..., None]) + bedc * under[..., None]
    col *= (1 + 0.05 * grain[..., None])
    dark = np.zeros_like(X)
    for (ox, oz, r) in occluders:
        dark = np.maximum(dark, np.exp(-((np.hypot(X - ox, Z - oz) / r) ** 2)))
    col *= (1 - 0.12 * dark[..., None])
    h = rip * 0.4 * (1 - road) * (1 - green) * (1 - under) + grain * 0.05 + n2 * 0.15 + peb * 0.6 * under + green * grain * 0.12
    nrm = tex.normal_from_height(tex.blur(h, 0.9), 1.8, wrap=False)
    rough = np.clip(0.9 - 0.08 * road - 0.45 * wet - 0.3 * under + 0.03 * grain, 0, 1)
    return (tex.save('river-ford_ground_col', col, 82), tex.save('river-ford_ground_nrm', nrm, 72),
            tex.save('river-ford_ground_orm', tex.pack_rough(rough), 80))


def water_textures():
    """Tileable water: soft green-blue colour patches and ripples stretched along the flow (V)."""
    n = 512
    a = tex.fbm(n, 211, 3.0, 2, 30)
    r1 = tex.fbm(n, 212, 1.6, 6, 60, aniso=(1.0, 0.35))
    r2 = tex.fbm(n, 213, 1.2, 20, 120, aniso=(1.0, 0.5))
    col = tex.ramp(tex.norm01(a), [(0, '#2f7f78'), (0.5, '#3f948a'), (1, '#5aaa9e')])
    h = r1 * 0.8 + r2 * 0.35
    nrm = tex.normal_from_height(h, 2.4, wrap=True)
    rough = np.full((n, n), 0.12)
    return (tex.save('river-ford_water_col', col, 86), tex.save('river-ford_water_nrm', nrm, 80),
            tex.save('river-ford_water_orm', tex.pack_rough(rough), 80))


def water_mesh(half=5.9):
    bm = core.new_bm()
    uvl = bm.loops.layers.uv[core.UV0]
    zs = list(np.arange(-320.0, -40.0, 8.0)) + list(np.arange(-40.0, 70.01, 1.0))
    rows = []
    nx = 12
    for z in zs:
        z = float(z)
        w = half * (1.0 + max(0.0, -z - 40.0) / 160.0)
        rows.append([bm.verts.new(B(river_x(z) + (-1 + 2 * i / nx) * w, WATER_Y, z)) for i in range(nx + 1)])
    for j in range(len(rows) - 1):
        for i in range(nx):
            f = bm.faces.new((rows[j][i], rows[j + 1][i], rows[j + 1][i + 1], rows[j][i + 1]))
            for l in f.loops:
                p = l.vert.co
                X, Z = p.x, -p.y
                l[uvl].uv = ((X - river_x(Z)) / 7.0, Z / 7.0)
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
    bark_t = T('bark', tex.bark, n=512, seed=9)
    leaf_t = T('leaf', tex.leaf, n=256, seed=11)
    beam_t = T('palmwood', tex.wood, n=512, seed=14, planks=1, colors=('#9d7a52', '#7a5636', '#553820'))

    fx_, fz_ = river_x(FORD_Z), FORD_Z
    occl = [(fx_ - 6.0, fz_, 1.5), (fx_ + 6.0, fz_, 1.5)]
    gt = ground_textures(occl)
    ground_core(sc, core.material('ground', gt, extras={'detail': 'sand'}))
    ground_far(sc, core.material('ground_far', sand_t, vcol=True, extras={'detail': 'sand'}))

    mat = {
        'rock': core.material('rock', stone_t, vcol=True),
        'rock_grey': core.material('rock_grey', stone_t, vcol=True, color=(0.78, 0.76, 0.74)),
        'bark': core.material('bark', bark_t),
        'twig': core.material('twig', beam_t, color=(0.6, 0.5, 0.42)),
        'shrub': core.material('shrub', None, vcol=True, rough=0.75),
        'grass': core.material('grass', None, vcol=True, rough=0.8, double=True),
        'pebble': core.material('pebble', stone_t, vcol=True),
        'beam': core.material('palmwood', beam_t),
    }
    Bt = lambda name, m, **kw: sc.batch(name, mat[m], **kw)
    gy = H

    # ------------------------------------------------ the water (its own node: semi-transparent, the ripples flow)
    wt = water_textures()
    m_water = core.material('river_water', wt, rough=0.12, alpha=0.78)
    sc.obj('water.river', water_mesh(), m_water, None, vcol=False,
           props={'anim': 'flow', 'speed': 0.09, 'opacity': 0.8, 'noShadow': True})

    # ------------------------------------------------ anchors
    anchors_xz = []
    reserve = []

    def A(name, x, z, face, note=None):
        sc.anchor(name, x, z, face, round(gy(x, z), 3), note)
        anchors_xz.append((x, z))

    A('bank-left', BANK_L[0], BANK_L[1], 90.0, 'on the left bank at the ford, facing the water (+X)')
    A('water-left', fx_ - 3.4, fz_, 90.0, 'in the water near the left bank (shallow), facing across (+X)')
    A('ford-mid', fx_, fz_, 90.0, 'the middle of the river at the ford: the water reaches the shins')
    A('water-right', fx_ + 3.4, fz_, 90.0, 'in the water near the right bank, facing across (+X)')
    A('bank-right', BANK_R[0], BANK_R[1], 90.0, 'on the right bank at the ford, facing on (+X)')
    pl = PATH_L[11]; pr = PATH_R[5]
    A('path-left', pl[0], pl[1], 90.0, 'on the footpath coming to the ford from the front left')
    A('path-right', pr[0], pr[1], 90.0, 'on the footpath going on from the ford to the back right')
    A('offstage-left', PATH_L[3][0], PATH_L[3][1], 90.0, 'out of frame on the left footpath (enter walking +X)')
    A('offstage-right', PATH_R[13][0], PATH_R[13][1], -90.0, 'out of frame on the right footpath (enter walking -X)')
    A('downstream', river_x(16.0), 16.0, 0.0, 'on the water, downstream towards the camera (where things float away)')
    A('upstream', river_x(-22.0), -22.0, 0.0, 'on the water, upstream far behind')

    def free(x, z, r, water_ok=False):
        if path_dist(x, z) < r + 0.6:
            return False
        if not water_ok and river_d(x, z) < 6.0 + r:
            return False
        for qx, qz, qr in reserve:
            if math.hypot(x - qx, z - qz) < qr + r:
                return False
        for ax, az in anchors_xz:
            if math.hypot(x - ax, z - az) < 2.2 + r:
                return False
        return True

    # ------------------------------------------------ palms (broad leaves), both banks, mostly behind
    palms = [(-12.0, -9.0, 11.0, (0.5, -0.3)), (-15.5, -15.0, 9.5, (-0.4, -0.2)), (-9.5, -21.0, 12.0, (0.3, 0.4)),
             (12.5, -11.5, 12.5, (-0.6, -0.2)), (16.0, -6.0, 9.0, (-0.4, 0.4)), (11.0, -22.0, 10.0, (0.4, 0.1)),
             (-24.0, -4.0, 10.5, (0.6, 0.2)), (27.0, -14.0, 11.5, (-0.6, 0.2)), (-30.0, 13.0, 11.0, (0.6, 0.0)),
             (31.0, 9.0, 12.0, (-0.6, 0.2)), (-11.0, 15.0, 10.0, (0.5, -0.3)), (13.0, 14.5, 9.5, (-0.4, -0.3))]
    m_crown = core.material('crown', leaf_t, vcol=True, double=True, rough=0.6)
    crowns = {}
    for i, (x, z, h, lean) in enumerate(palms):
        p = pieces.palm(seed=60 + i, height=h, lean=lean, fronds=13)
        M = place(x, z, i * 37.0, gy(x, z) - 0.05)
        Bt('palm_bark', 'bark', ao_density=10).add(p['bark'], M)
        Bt('palm_bark', 'bark').add(p['bark_boss'], M, uv_box=1.0)
        top = p['top']
        v = i % 3
        props = {'anim': 'sway', 'amp': 0.035, 'freq': 0.45 + 0.07 * (i % 4), 'phase': i * 1.3}
        Ms = M @ Matrix.Translation(top) @ Matrix.Diagonal((h / 10.5,) * 3 + (1,))
        if v not in crowns:
            q = pieces.palm(seed=160 + v, height=10.0, lean=(0, 0), fronds=13)
            crown = core.new_bm()
            for k in ('leaf', 'dry', 'dates'):
                core.merge(crown, q[k])
            core.transform(crown, Matrix.Translation(-q['top']))
            crowns[v] = sc.obj(f'palm{i}.crown', crown, m_crown, Ms, props=props).data
        else:
            sc.obj(f'palm{i}.crown', None, None, Ms, mesh=crowns[v], props=props)
        sc.col_box(f'palm{i}', (1.2, h, 1.2), x, z, 0)
        reserve.append((x, z, 1.6))

    # ------------------------------------------------ reeds with cattails along both water edges (never at the ford)
    r2 = np.random.default_rng(91)
    nr = 0
    for i in range(900):
        if nr >= 46:
            break
        z = -28 + 48 * r2.random()
        if abs(z - FORD_Z) < 4.5:
            continue
        side = -1 if r2.random() < 0.5 else 1
        d = 4.6 + 1.6 * r2.random()
        x = river_x(z) + side * d
        if any(math.hypot(x - qx, z - qz) < 1.1 for qx, qz, _ in reserve):
            continue
        if path_dist(x, z) < 1.2:
            continue
        nr += 1
        rd = critters.reeds(2000 + i, r=0.5 + 0.4 * r2.random(), h=2.0 + 1.4 * r2.random(), n=20 + int(r2.random() * 14))
        Bt('reeds', 'grass', vcol=True, ao=False).add(rd, place(x, z, r2.random() * 360, gy(x, z)))
        reserve.append((x, z, 0.9))
        sc.col_box(f'reeds{nr}', (1.2, 2.4, 1.2), x, z, 0)

    # ------------------------------------------------ rocks, a few by the water and in the desert
    rng = np.random.default_rng(55)
    rocks = [(-22.0, -16.0, 2.2), (-26.0, -13.5, 1.2), (24.0, -20.0, 2.8), (21.5, -17.5, 1.3), (-34.0, -6.0, 1.8),
             (35.0, -2.0, 2.4), (-20.0, 17.0, 1.4), (22.0, 16.0, 1.6), (-41.0, -22.0, 4.5), (42.0, -25.0, 5.0)]
    for i, (x, z, s) in enumerate(rocks):
        if not free(x, z, s * 0.8):
            continue
        grey = i % 3 == 0
        st = core.rock(500 + i, size=(s, s * 0.8, s * 0.7), facets=6, detail=0.12, subdiv=3, sink=0.25)
        M = place(x, z, i * 47.0, gy(x, z))
        hb = core.hull_of(core.rock(500 + i, size=(s, s * 0.8, s * 0.7), facets=6, detail=0.12, subdiv=1, sink=0.25), M)
        k = 0.9 + 0.15 * rng.random()
        Bt('rocks_grey' if grey else 'rocks', 'rock_grey' if grey else 'rock', vcol=True).add(st, M, color=(k, k, k), uv_box=3.0)
        sc.add_col(f'rock{i}', hb)
        Bt('pebbles', 'pebble', vcol=True, ao=False).add(pieces.pebbles(600 + i, 6, s * 1.4, size=0.12 + s * 0.04), M, uv_box=1.0)
        reserve.append((x, z, s + 0.5))
    # stepping-size stones on the bed and the wet edge (under / at the water line, not on the ford line)
    for i in range(40):
        z = -26 + 44 * rng.random()
        if abs(z - FORD_Z) < 2.6:
            continue
        x = river_x(z) + (rng.random() * 2 - 1) * 5.6
        s = 0.18 + 0.35 * rng.random() ** 2
        st = core.rock(700 + i, size=(s, s * 0.8, s * 0.5), facets=5, detail=0.1, subdiv=2, sink=0.5)
        k = 0.8 + 0.2 * rng.random()
        Bt('rocks_grey', 'rock_grey', vcol=True).add(st, place(x, z, rng.random() * 360, gy(x, z)), color=(k, k * 0.98, k * 0.94), uv_box=2.0)

    # ------------------------------------------------ a well on the left bank (behind the path), a trough, clay pots, hens
    wood_t = T('wood', tex.wood, n=512, seed=4)
    clay_t = T('clay', tex.clay, n=512, seed=8)
    m_stone = core.material('stone', stone_t)
    m_wood = core.material('wood', wood_t)
    m_clay = core.material('clay', clay_t)
    m_rope = core.material('rope', T('rope', tex.rope, n=256, seed=7))
    m_wellw = core.material('well_water', None, color=(0.16, 0.42, 0.52), rough=0.08)
    wx, wz = -17.0, -3.5
    wl = critters.well()
    Mw = place(wx, wz, 20, gy(wx, wz))
    sc.batch('stones', m_stone).add(wl['stone'], Mw, uv_box=2.0)
    sc.batch('wood', m_wood).add(wl['wood'], Mw, uv_box=2.5)
    sc.obj('well.water', wl['water'], m_wellw, Mw, vcol=False)
    sc.obj('well.rope', wl['rope'], m_rope, Mw, vcol=False)
    sc.col_box('well', (2.8, 2.8, 2.8), wx, wz, 20)
    reserve.append((wx, wz, 2.4))
    tr = core.new_bm(); core.box(tr, (1.6, 0.7, 0.4), (0, 0, 0.2), bevel=0.12, segs=2)
    tx_, tz_ = wx + 2.7, wz + 0.9
    sc.batch('clay', m_clay).add(tr, place(tx_, tz_, 80, gy(tx_, tz_)), uv_box=1.5)
    trw = core.new_bm(); core.box(trw, (1.3, 0.45, 0.02), (0, 0, 0.33))
    sc.obj('trough.water', trw, m_wellw, place(tx_, tz_, 80, gy(tx_, tz_)), vcol=False)
    sc.col_box('trough', (1.0, 0.8, 1.9), tx_, tz_, 80)
    reserve.append((tx_, tz_, 1.2))
    for k, (ox, oz, kind) in enumerate(((-2.4, 0.6, 0), (-2.9, -0.3, 1), (-2.2, -0.9, 2))):
        px, pz = wx + ox, wz + oz
        sc.batch('clay', m_clay).add(critters.pot(kind), place(px, pz, k * 70, gy(px, pz)))
    sc.col_box('pots', (1.6, 1.9, 2.4), wx - 2.5, wz - 0.2, 0)
    reserve.append((wx - 2.5, wz - 0.2, 1.4))
    r3 = np.random.default_rng(31)
    for k in range(9):
        a = k / 9 * 2 * math.pi + 0.3
        d = 1.9 + 0.8 * r3.random()
        fx2, fz2 = wx + math.cos(a) * d, wz + math.sin(a) * d
        if path_dist(fx2, fz2) < 1.0 or any(math.hypot(fx2 - qx, fz2 - qz) < qr - 0.6 for qx, qz, qr in reserve[-2:]):
            continue
        Bt('grass_green', 'grass', vcol=True, ao=False).add(critters.green_tuft(1500 + k, r=0.5, h=0.5), place(fx2, fz2, k * 40, gy(fx2, fz2)))
        if k % 2 == 0:
            Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(1600 + k, n=6, radius=0.45), place(fx2 + 0.4, fz2 + 0.2, 0, gy(fx2, fz2)))
    m_hen = core.material('hen', None, vcol=True, rough=0.55)
    hens = [(-13.0, -2.0, 30, 'brown', 1.1), (-20.5, 0.5, -40, 'white', 1.0), (-14.5, -7.5, 120, 'brown', 1.0),
            (14.5, 4.6, -100, 'white', 1.0)]
    for k, (hx, hz, hf, var, rad) in enumerate(hens):
        cols = ((0.72, 0.36, 0.16), (0.9, 0.62, 0.32), (0.5, 0.22, 0.1)) if var == 'brown' else ((0.97, 0.96, 0.93), (1.0, 1.0, 0.98), (0.85, 0.85, 0.83))
        hb, hh, hp = critters.hen(*cols)
        root = sc.obj(f'hen{k + 1}', hb, m_hen, place(hx, hz, hf, gy(hx, hz)), props={'anim': 'hen', 'radius': rad, 'seed': 11 + 7 * k})
        sc.obj(f'hen{k + 1}.head', hh, m_hen, Matrix.Translation(hp), parent=root)
        reserve.append((hx, hz, rad + 0.6))

    # ------------------------------------------------ critters: ducks on the water, butterflies, a heron-less calm
    m_crit = core.material('critter', None, vcol=True, rough=0.55)
    m_wing = core.material('wing', None, vcol=True, rough=0.5, double=True)
    for k, (z, off, face, cols) in enumerate(((-9.0, -2.2, 160, ((0.55, 0.4, 0.26), (0.16, 0.42, 0.24))),
                                              (-11.5, -0.6, 200, ((0.62, 0.48, 0.34), (0.55, 0.42, 0.3))),
                                              (10.0, 2.4, 20, ((0.95, 0.94, 0.9), (0.95, 0.94, 0.9))))):
        x = river_x(z) + off
        db, dh, hp = critters.duck(cols[0], cols[1])
        dk = sc.obj(f'duck{k + 1}', db, m_crit, place(x, z, face, WATER_Y - 0.06, 1.3), props={'anim': 'sway', 'amp': 0.04, 'freq': 0.3 + 0.07 * k, 'phase': k * 1.9})
        sc.obj(f'duck{k + 1}.head', dh, m_crit, Matrix.Translation(hp), parent=dk, props={'anim': 'peck', 'freq': 0.5 + 0.2 * k, 'phase': k * 2.0})

    def flutter(name, x, y, z, col, spot, radius=1.2, freq=0.35, phase=0.0):
        body, wl_, wr_ = critters.butterfly(col, spot)
        g = sc.obj(name, body, m_crit, Matrix.Translation(B(x, y, z)),
                   props={'anim': 'butterfly', 'radius': radius, 'freq': freq, 'phase': phase, 'height': 0.35})
        sc.obj(name + '.wing.L', wl_, m_wing, Matrix.Identity(4), parent=g)
        sc.obj(name + '.wing.R', wr_, m_wing, Matrix.Identity(4), parent=g)

    flutter('butterfly1', fx_ - 10.0, 1.5, -6.0, (1.0, 0.85, 0.2), (0.95, 0.45, 0.15), 1.4, 0.3, 0.0)
    flutter('butterfly2', fx_ + 9.5, 1.3, -4.0, (1.0, 1.0, 0.97), (0.55, 0.75, 1.0), 1.0, 0.42, 2.0)

    # ------------------------------------------------ green tufts, flowers and bushes on the banks; dry tufts in the desert
    nt = 0
    for i in range(5000):
        if nt >= 150:
            break
        x = -43 + 86 * r2.random(); z = -29 + 50 * r2.random()
        if not free(x, z, 0.4):
            continue
        nt += 1
        d = river_d(x, z)
        if d < 13:
            Bt('grass_green', 'grass', vcol=True, ao=False).add(critters.green_tuft(1500 + i, r=0.45 + 0.25 * r2.random(), h=0.5 + 0.4 * r2.random()), place(x, z, r2.random() * 360, gy(x, z)))
        else:
            tf = pieces.tuft(seed=900 + i, n=16, r=0.4 + 0.3 * r2.random(), h=0.45 + 0.45 * r2.random(), dry=0.35 + 0.6 * r2.random())
            Bt('grass', 'grass', vcol=True, ao=False).add(tf, place(x, z, r2.random() * 360, gy(x, z)))
    nf = 0
    for i in range(3000):
        if nf >= 40:
            break
        x = -40 + 80 * r2.random(); z = -26 + 44 * r2.random()
        if not free(x, z, 0.5) or river_d(x, z) > 14:
            continue
        nf += 1
        Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(1800 + i, n=4 + int(r2.random() * 5), radius=0.4), place(x, z, 0, gy(x, z)))
    nb = 0
    for i in range(600):
        if nb >= 22:
            break
        x = -42 + 84 * r2.random(); z = -28 + 46 * r2.random()
        if not free(x, z, 1.4) or (abs(x) < 9 and z > 8):
            continue
        nb += 1
        green = river_d(x, z) < 16
        bsh = pieces.bush(seed=700 + i, r=0.9 + 0.7 * r2.random(), h=1.0 + 0.8 * r2.random(),
                          green=(0.36, 0.55, 0.22) if green else (0.6, 0.55, 0.3))
        M = place(x, z, r2.random() * 360, gy(x, z))
        Bt('twigs', 'twig', ao=False).add(bsh['twig'], M)
        Bt('shrubs', 'shrub', vcol=True, ao=False).add(bsh['shrub'], M)
        sc.col_box(f'bush{nb}', (1.6, 1.4, 1.6), x, z, 0)
        reserve.append((x, z, 1.6))

    sc.finalize()
    if bake:
        sc.bake_ao(samples=40, distance=5.0, max_size=2048, blur=0.6, gamma=1.15, floor=0.18)

    meta = {
        'name': NAME,
        'title': 'Vadul râului (un râu verde prin pustiu)',
        'units': 'engine units (figure 4.2 tall), three.js Y-up, +Z towards the usual camera',
        'anchors': sc.anchors,
        'seats': sc.seats,
        'bounds': [[-60, -1.5, -32], [60, 14, 24]],
        'acting': {'rect': [[-40, -22], [40, 14]], 'river': {'centre': 'x = sin(0.045 z + 0.3)', 'water_y': WATER_Y, 'ford_z': FORD_Z},
                   'paths': [[[round(a, 2), round(b, 2)] for a, b in p] for p in PATHS]},
        'skies': ['day', 'morning', 'evening'],
        'sky': {'day': {'sunAz': -38, 'sunElev': 50}, 'morning': {'sunAz': -66, 'sunElev': 15}, 'evening': {'sunAz': -100, 'sunElev': 8}},
        'shadow': {'center': [0, -2], 'radius': 46},
        'shots': {
            'wide': {'pos': [0, 9.5, 36], 'target': [0, 1.5, -4], 'fov': 42, 'note': 'the river towards the back, both banks, the ford'},
            'ford': {'pos': [2, 2.6, 16], 'target': [0.5, 1.2, 2], 'fov': 40, 'note': 'the ford from the front: people wading across'},
            'bank': {'pos': [-14, 3.2, 12], 'target': [-6, 1.8, 2], 'fov': 38, 'note': 'the left bank where the path meets the water'},
        },
        'notes': ('The river runs along Z (flowing towards +Z); people cross it along X at z = 2 (the ford), in profile to a +Z camera. '
                  'The ground under the water is the walkable bed (the feet go down into the water, the water hides the shins); '
                  'water.river is a separate, semi-transparent node (anim "flow": the ripples move downstream). '
                  'Collision: col:palmN, col:reedsN, col:rockN, col:bushN.'),
    }
    os.makedirs(out_dir, exist_ok=True)
    sc.export(os.path.join(out_dir, NAME + '.glb'))
    with open(os.path.join(out_dir, NAME + '.json'), 'w') as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    return meta
