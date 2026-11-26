"""Set `mountain-spring`: the old monk's garden with a spring, high in a red desert mountain (film 048, Avva Antonie
and the hunter's bow).

three.js layout (x right, z towards the usual camera, y up; figure 4.2 tall):
  * the monk's cell on the left: a cave dug into a red rock outcrop (door towards +Z: an arched wooden door deep in the
    doorway, a wooden cross over it, a little arched window), a reed awning with baskets and palm-leaf bundles beside it,
  * a spring on the right: a turquoise pool under broad date palms, reeds, doves drinking at its edge, big rocks behind it,
  * a little vegetable garden between them (lettuces, onions, melons), flowers everywhere, butterflies,
  * a flat sandy yard in the middle (the acting area), two paths: one from the front left, one from the front right,
  * behind: big red-orange cliffs of the mountain; a tortoise, a lizard on a warm rock, a desert hare by a bush.
"""
import math
import os
import json
import numpy as np
from mathutils import Matrix, Vector, noise

from kit import core, tex, pieces, critters
from kit.core import B, place, Batch, Scene

NAME = 'mountain-spring'
CORE = (-46.0, 46.0, -46.0, 24.0)
TEX_W, TEX_H = 2048, 1536
CELL = (-14.0, -15.0, 14.0)           # x, z, face
CELL_W, CELL_D, CELL_H = 16.0, 10.0, 7.2
POND = (12.5, -6.0, 3.4)              # the spring: x, z, radius
WATER_Y = -0.35
GARDEN = (-1.5, -12.0)
FRONT_Z = CELL[1] + CELL_D / 2       # -9.0 (the cell is turned 14°: the door at x ≈ -12.2)
DOOR = (CELL[0] + math.sin(math.radians(CELL[2])) * CELL_D / 2, CELL[1] + math.cos(math.radians(CELL[2])) * CELL_D / 2)


def _curve(p0, p1, p2, n=16):
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
    return out


PATH_L = _curve((-78.0, 14.0), (-22.0, 8.0), (-3.0, 2.2), 24)
PATH_R = _curve((78.0, 13.0), (24.0, 7.0), (3.0, 2.2), 24)
PATH_C = _curve((-3.0, 2.2), (DOOR[0] + 4.0, 0.0), (DOOR[0] + 0.3, DOOR[1] + 1.6), 12)
PATH = PATH_L


def dist_to_poly(px, pz, pts):
    best = 1e9
    for (ax, az), (bx, bz) in zip(pts[:-1], pts[1:]):
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz
        t = 0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / L2))
        best = min(best, math.hypot(px - ax - t * dx, pz - az - t * dz))
    return best


def path_dist(x, z):
    return min(dist_to_poly(x, z, PATH_L), dist_to_poly(x, z, PATH_R), dist_to_poly(x, z, PATH_C) + 0.3) - 1.5


def smooth(e0, e1, v):
    t = min(1.0, max(0.0, (v - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def H(x, z):
    """a flat yard, the spring's shallow pool on the right, the mountain rising behind, low dunes round about"""
    hgt = 0.0
    px, pz, pr = POND
    d = math.hypot(x - px, (z - pz) * 1.25)
    if d < pr + 1.2:
        hgt -= 0.9 * (1 - smooth(pr - 2.2, pr + 1.0, d))
    # the foot of the mountain: the ground climbs behind the cell and the garden
    back = max(0.0, -z - 30.0)
    hgt += (back / 20.0) ** 1.6 * 0.0 * (0.8 + 0.4 * noise.noise(Vector((x * 0.05, z * 0.05, 3.3))))
    ox = max(0.0, abs(x) - 40.0); oz = max(0.0, z - 20.0)
    o = math.hypot(ox, oz)
    if o > 0:
        k = min(1.0, o / 40.0) ** 1.4
        ridge = 1 - abs(noise.noise(Vector((x * 0.012 + 3.1, z * 0.02, 1.7))))
        dune = ridge ** 2.2 * 3.5 + noise.fractal(Vector((x * 0.01, z * 0.01, 7.0)), 0.5, 2.0, 3) * 1.2
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
            redk = min(1.0, max(0.0, p.z / 6.0))
            l[cl] = (min(1, k * 1.0), min(1, k * (0.97 - 0.12 * redk)), min(1, k * (0.94 - 0.2 * redk)), 1)
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
    yard = tex.smooth(1.0, 0.0, np.hypot(X / 13.0, (Z - 0.5) / 7.0) + 0.15 * n1)
    px, pz, pr = POND
    pd = np.hypot(X - px, (Z - pz) * 1.25)
    mud = tex.smooth(pr + 1.2, pr - 0.4, pd)
    gx, gz = GARDEN
    oasis = tex.smooth(pr + 9.0, pr + 2.0, pd + 2.5 * n1) + tex.smooth(6.5, 2.5, np.hypot(X - gx, (Z - gz) * 1.3) + 2.0 * n1)
    oasis += tex.smooth(6.0, 2.0, np.hypot(X - cx, Z - cz) + 2.0 * n1) * 0.6
    green = np.clip(oasis, 0, 1) * (1 - road) * (1 - 0.7 * yard)
    rock = tex.smooth(-20.0, -30.0, Z + 3.0 * n1)
    sand = tex.ramp(tex.norm01(n1 * 0.8 + n2 * 0.2), [(0, '#e09a5a'), (0.45, '#efb779'), (1, '#f8d39a')])
    grass = tex.ramp(tex.norm01(n2 * 0.7 + grain * 0.05 + n1 * 0.3), [(0, '#5fa03a'), (0.5, '#7dbb48'), (1, '#9fd060')])
    earth = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#e2a873'), (0.5, '#ebb985'), (1, '#f4cb98')])
    pathc = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#c8875a'), (0.5, '#d69a68'), (1, '#e2ad7c')])
    mudc = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#5c5a3a'), (0.5, '#6e6a44'), (1, '#7f7a52')])
    rockc = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#b8603e'), (0.5, '#cc744c'), (1, '#de8b5e')])
    col = sand
    col = col * (1 - rock[..., None]) + rockc * rock[..., None]
    col = col * (1 - yard[..., None]) + earth * yard[..., None]
    col = col * (1 - green[..., None]) + grass * green[..., None]
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
    return (tex.save('mountain-spring_ground_col', col, 82), tex.save('mountain-spring_ground_nrm', nrm, 72),
            tex.save('mountain-spring_ground_orm', tex.pack_rough(rough), 80))


def water_textures():
    n = 512
    a = tex.fbm(n, 311, 3.0, 2, 30)
    r1 = tex.fbm(n, 312, 1.6, 6, 60, aniso=(1.0, 0.6))
    r2 = tex.fbm(n, 313, 1.2, 20, 120)
    col = tex.ramp(tex.norm01(a), [(0, '#1fa3b0'), (0.5, '#36bcc2'), (1, '#62d6d0')])
    nrm = tex.normal_from_height(r1 * 0.8 + r2 * 0.35, 2.0, wrap=True)
    rough = np.full((n, n), 0.12)
    return (tex.save('mountain-spring_water_col', col, 86), tex.save('mountain-spring_water_nrm', nrm, 80),
            tex.save('mountain-spring_water_orm', tex.pack_rough(rough), 80))


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
    red_t = T('redstone', tex.sandstone, n=1024, seed=42, tint=[(0, '#a8492c'), (0.35, '#c4623a'), (0.7, '#dc8150'), (1, '#efa673')])
    plaster_t = T('ochre', tex.plaster, n=1024, seed=43, colors=('#f7d9a3', '#eec58a', '#e0ae72'), brick='#cf9460')
    reeds_t = T('reeds', tex.reeds, n=512, seed=5)
    bark_t = T('bark', tex.bark, n=512, seed=9)
    leaf_t = T('leaf', tex.leaf, n=256, seed=11)
    clay_t = T('clay', tex.clay, n=512, seed=8)
    beam_t = T('palmwood', tex.wood, n=512, seed=14, planks=1, colors=('#9d7a52', '#7a5636', '#553820'))
    door_t = T('greenwood', tex.wood, n=512, seed=44, colors=('#7cc65a', '#5aa846', '#3f8a36'))
    weave_t = T('weave', tex.weave, n=512, seed=6, cells=14)
    weave2_t = T('weave_band', tex.weave, n=512, seed=45, cells=14, band=(0.55, 0.75, '#d0402c', '#f0c040'))

    cx, cz, cf = CELL
    px, pz, pr = POND
    gx, gz = GARDEN
    occl = [(cx, cz, 6.5), (px, pz - 6.0, 4.0)]
    gt = ground_textures(occl)
    ground_core(sc, core.material('ground', gt, extras={'detail': 'sand'}))
    ground_far(sc, core.material('ground_far', sand_t, vcol=True, extras={'detail': 'sand'}))

    mat = {
        'plaster': core.material('plaster_ochre', plaster_t, vcol=True),
        'wood': core.material('wood', T('wood', tex.wood, n=512, seed=4)),
        'door': core.material('wood_green', door_t),
        'beam': core.material('palmwood', beam_t),
        'reeds': core.material('reeds', reeds_t, double=True),
        'stone': core.material('stone', stone_t),
        'rock': core.material('rock', red_t, vcol=True),
        'cliff': core.material('cliffs', red_t, color=(1.0, 0.92, 0.88)),
        'bark': core.material('bark', bark_t),
        'twig': core.material('twig', beam_t, color=(0.6, 0.5, 0.42)),
        'shrub': core.material('shrub', None, vcol=True, rough=0.75),
        'grass': core.material('grass', None, vcol=True, rough=0.8, double=True),
        'clay': core.material('clay', clay_t),
        'weave': core.material('weave', weave_t),
        'weave2': core.material('weave_band', weave2_t),
    }
    Bt = lambda name, m, **kw: sc.batch(name, mat[m], **kw)
    gy = H
    m_crit = core.material('critter', None, vcol=True, rough=0.55)
    m_wing = core.material('wing', None, vcol=True, rough=0.5, double=True)
    reserve = []

    # ------------------------------------------------ the old monk's cell: a cave dug into a red rock outcrop, an arched
    # wooden door deep in the doorway, a little arched window, a wooden cross over the door, a reed awning beside it
    import bmesh
    RW, RD, RH = 8.0, CELL_D / 2, 7.2                      # half width, half depth, height of the outcrop
    rk = core.rock(61, size=(RW * 0.82, RD, RH), facets=7, detail=0.11, subdiv=4, sink=0.12)
    # the front surface in the middle (where the doorway is dug): the door sits 1.6 deeper
    surf = min(v.co.y for v in rk.verts if abs(v.co.x) < 1.6 and 0.8 < v.co.z < 3.2)
    def cyl_cutter(r, x, z, y0, y1, segs=28):
        c = bmesh.new()
        bmesh.ops.create_cone(c, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=y1 - y0)
        core.transform(c, Matrix.Translation((x, (y0 + y1) / 2, z)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
        return c
    DW, DH = 2.4, 3.4                                      # doorway width, height of the straight part (arch on top)
    cut = [pieces.cutter_box((DW, 2 * (surf + RD + 2.0), DH), (0, -RD - 2.0 + (surf + RD + 2.0), DH / 2 - 0.3)), cyl_cutter(DW / 2, 0, DH - 0.3, -RD - 2.0, surf + 1.75),
           pieces.cutter_box((0.8, 4.0, 0.7), (3.0, -RD, 3.6)), cyl_cutter(0.4, 3.0, 3.95, -RD - 2.0, -RD + 2.0, 16)]
    rk = pieces.boolean(rk, cut)
    core.box_uv(rk, 3.5)
    M = place(cx, cz, cf, 0.0)
    Bt('cave_rock', 'rock', vcol=True, ao_density=18).add(rk, M, color=(0.86, 0.8, 0.78), uv_box=3.0)
    # more boulders piled round it: a rocky outcrop, not a dome
    for k, (ox, oy, oz, sx_, sy_, sz_, sd) in enumerate(((-6.6, 1.2, 0, 4.2, 3.6, 5.6, 71), (6.4, 0.8, 0, 3.6, 3.2, 4.4, 72),
                                                          (2.4, 1.6, 4.6, 3.4, 3.0, 3.2, 73), (-3.0, 2.0, 5.0, 3.6, 3.0, 2.8, 74),
                                                          (8.8, -1.6, 0, 1.6, 1.4, 1.3, 75), (-9.8, -0.6, 0, 1.9, 1.6, 1.6, 76))):
        bb = core.rock(sd, size=(sx_, sy_, sz_), facets=6, detail=0.12, subdiv=3, sink=0.2)
        Mb = M @ Matrix.Translation((ox, oy, oz))
        tint = 0.78 + 0.08 * (k % 3)
        Bt('cave_rock', 'rock', vcol=True).add(bb, Mb, color=(tint, tint * 0.95, tint * 0.93), uv_box=3.0)
        if oz == 0:
            sc.add_col(f'cellrock{k}', core.hull_of(core.rock(sd, size=(sx_, sy_, sz_), facets=6, detail=0.12, subdiv=1, sink=0.2), Mb))
    sc.add_col('cell', core.hull_of(core.rock(61, size=(RW, RD, RH), facets=4, detail=0.05, subdiv=1, sink=0.12), M))
    reserve.append((cx, cz, RW + 1.0))
    # the door: planks with an arched top, deep in the doorway (y = -RD + 2.6)
    dy = surf + 1.6
    door = core.new_bm()
    core.box(door, (DW - 0.1, 0.18, DH - 0.3), (0, dy, (DH - 0.3) / 2), bevel=0.03)
    dc = bmesh.new(); bmesh.ops.create_cone(dc, cap_ends=True, segments=24, radius1=DW / 2 - 0.05, radius2=DW / 2 - 0.05, depth=0.18)
    core.transform(dc, Matrix.Translation((0, dy, DH - 0.3)) @ Matrix.Rotation(math.pi / 2, 4, 'X')); core.merge(door, dc)
    for zz in (0.9, 2.4):
        core.box(door, (DW - 0.4, 0.1, 0.28), (0, dy - 0.13, zz), bevel=0.03)
    core.tube(door, [Vector((0.7, dy - 0.2, 1.6 + k * 0.12)) for k in (-1, 0, 1)], 0.05, sides=6)
    Bt('wood_door', 'wood').add(door, M, uv_box=2.5)
    # a dark back behind the window (so it reads as a little window into the cave)
    wb = core.new_bm(); core.box(wb, (0.8, 0.05, 1.0), (3.0, surf + 1.4, 3.75))
    sc.batch('cave_dark', core.material('cave_dark', None, color=(0.12, 0.08, 0.06), rough=0.9), ao=False).add(wb, M)
    # a stone threshold and a wooden cross over the door
    th = core.new_bm(); core.box(th, (DW + 0.8, 1.2 + (dy - surf), 0.22), (0, (surf - 0.5 + dy) / 2, 0.05), bevel=0.06)
    Bt('stones', 'stone').add(th, M, uv_box=2.0)
    cr = core.new_bm()
    core.box(cr, (0.16, 0.12, 1.1), (0, surf - 0.12, DH + 1.45), bevel=0.03)
    core.box(cr, (0.62, 0.12, 0.15), (0, surf - 0.12, DH + 1.7), bevel=0.03)
    Bt('beams', 'beam').add(cr, M)
    # a reed awning on four poles left of the door: shade for the baskets
    aw = core.new_bm()
    ax0, ax1, ay0, ay1, ah = -6.4, -2.4, -RD - 3.0, -RD + 0.2, 3.4
    for px_, py_ in ((ax0, ay0), (ax1, ay0), (ax0, ay1), (ax1, ay1)):
        core.tube(aw, [Vector((px_, py_, -0.2)), Vector((px_, py_, ah))], 0.11, sides=8, uv_v=1.5)
    for py_ in (ay0, ay1):
        core.tube(aw, [Vector((ax0 - 0.3, py_, ah)), Vector((ax1 + 0.3, py_, ah))], 0.1, sides=8)
    Bt('beams', 'beam').add(aw, M)
    roof = core.new_bm(); core.box(roof, (ax1 - ax0 + 0.9, ay1 - ay0 + 0.8, 0.14), ((ax0 + ax1) / 2, (ay0 + ay1) / 2, ah + 0.15), bevel=0.04)
    core.displace(roof, 0.03, 0.6, seed=7)
    Bt('reeds', 'reeds').add(roof, M, uv_box=2.0)
    for k, (lx, ly) in enumerate(((ax0, ay0), (ax1, ay0))):
        wx_, wz_ = (M @ Vector((lx, ly, 0))).x, -(M @ Vector((lx, ly, 0))).y
        sc.col_box(f'awning{k}', (0.4, 3.6, 0.4), wx_, wz_, 0)
    Mf = M
    def local(lx, lz):
        v = Mf @ Vector((lx, -lz, 0.0))
        return v.x, -v.y
    # under the awning: a stack of woven baskets (the monk's handiwork) and palm-leaf bundles; a clay jar right of the door
    for k, (lx, lz, s_, band) in enumerate(((-5.4, RD + 1.4, 1.0, False), (-4.3, RD + 1.7, 0.9, True), (-4.85, RD + 1.5, 0.8, False))):
        bx_, bz_ = local(lx, lz)
        Bt('baskets_band' if band else 'baskets', 'weave2' if band else 'weave').add(critters.basket_simple(0.5 * s_, 0.6 * s_, handle=k == 2), place(bx_, bz_, 30 * k, 0.0 if k < 2 else 0.62), uv_box=None)
    for k, lx in enumerate((-3.2, -6.0)):
        lb = core.new_bm()
        for j in range(7):
            critters.blob(lb, (0.0, 0.0, 0.08 + 0.03 * j % 0.1), (0.9, 0.06, 0.03), (0.86 - 0.03 * j, 0.74, 0.42), subdiv=1, rot=Matrix.Rotation((j - 3) * 0.05, 4, 'Z'))
        lx_, lz_ = local(lx, RD + 0.6 + 0.9 * k)
        sc.batch('leafbundles', m_crit, ao=False, vcol=True).add(lb, place(lx_, lz_, cf + 90 + 20 * k, 0.0))
    sc.col_box('cell-things', (2.8, 1.6, 1.6), *local(-4.85, RD + 1.5), cf)
    jx, jz = local(2.4, RD + 0.9)
    Bt('clay', 'clay').add(critters.pot(0), place(jx, jz, 20, 0.0))
    sc.col_box('cell-jar', (1.3, 1.6, 1.3), jx, jz, 0)
    # doves on the awning roof
    for k2, (lx, rz) in enumerate(((-5.6, 15), (-4.6, -25), (-3.2, 160))):
        Mv = Mf @ Matrix.Translation((lx, (ay0 + ay1) / 2 + 0.3 * k2, ah + 0.22)) @ Matrix.Rotation(math.radians(rz), 4, 'Z')
        dvb, dvh, dvp = critters.dove()
        dv = sc.obj(f'roofdove{k2}', dvb, m_crit, Mv)
        sc.obj(f'roofdove{k2}.head', dvh, m_crit, Matrix.Translation(dvp), parent=dv, props={'anim': 'peck', 'freq': 0.6 + 0.25 * k2, 'phase': k2 * 2.0})

    # ------------------------------------------------ the vegetable garden (between the cell and the spring)
    gd = critters.garden(seed=19, w=5.2, d=3.2)
    Mg = place(gx, gz, 4, 0.0)
    sc.batch('garden_rim', mat['stone']).add(gd['rim'], Mg, uv_box=1.6)
    sc.batch('garden', m_crit, ao=False, vcol=True).add(gd['soil'], Mg)
    sc.batch('garden', m_crit, ao=False, vcol=True).add(gd['plants'], Mg)
    sc.col_box('garden', (5.6, 0.6, 3.6), gx, gz, 4)
    reserve.append((gx, gz, 3.4))
    # a second, smaller bed with melons, and a watering jug beside it
    gd2 = critters.garden(seed=23, w=3.2, d=2.4)
    Mg2 = place(gx + 5.2, gz - 1.8, -10, 0.0)
    sc.batch('garden_rim', mat['stone']).add(gd2['rim'], Mg2, uv_box=1.6)
    sc.batch('garden', m_crit, ao=False, vcol=True).add(gd2['soil'], Mg2)
    sc.batch('garden', m_crit, ao=False, vcol=True).add(gd2['plants'], Mg2)
    sc.col_box('garden2', (3.6, 0.6, 2.8), gx + 5.2, gz - 1.8, -10)
    reserve.append((gx + 5.2, gz - 1.8, 2.4))
    Bt('clay', 'clay').add(critters.pot(2), place(gx - 3.4, gz + 1.0, 0, 0.0))

    # ------------------------------------------------ the pool (a small lake): turquoise water, big rocks behind, reeds, doves
    wt = water_textures()
    m_water = core.material('pond_water', wt, rough=0.1, alpha=0.8)
    sc.obj('water.pond', pond_mesh(), m_water, None, vcol=False, props={'anim': 'flow', 'speed': 0.03, 'opacity': 0.8, 'noShadow': True})
    reserve.append((px, pz, pr + 0.8))
    rng = np.random.default_rng(5)
    for i, (ox, oz, s) in enumerate(((-1.3, -pr / 1.25 - 1.0, 1.6), (2.2, -pr / 1.25 - 1.1, 1.8), (3.6, -pr / 1.25 + 0.4, 1.2), (-3.0, -pr / 1.25 + 0.5, 1.0), (0.45, -pr / 1.25 - 2.1, 1.5))):
        x, z = px + ox, pz + oz
        st = core.rock(900 + i, size=(s, s * 0.8, s * 0.75), facets=6, detail=0.12, subdiv=3, sink=0.3)
        Mr = place(x, z, i * 53.0, gy(x, z))
        Bt('rocks', 'rock', vcol=True).add(st, Mr, color=(0.95, 0.95, 0.95), uv_box=3.0)
        sc.add_col(f'springrock{i}', core.hull_of(core.rock(900 + i, size=(s, s * 0.8, s * 0.75), facets=6, detail=0.12, subdiv=1, sink=0.3), Mr))
    # a rim of rounded stones round the pool (a spring basin, not a lake)
    for k in range(26):
        a = k / 26 * 2 * math.pi
        if 3.9 < a < 5.6 or 1.1 < a < 2.0:   # the back, where the big rocks are; the front beach where the doves drink
            continue
        rr = pr + 0.35 + 0.1 * math.sin(5 * a)
        x, z = px + math.cos(a) * rr, pz + math.sin(a) * rr / 1.25
        sz = 0.38 + 0.12 * ((k * 7) % 3) / 2
        st = core.rock(940 + k, size=(sz * 1.3, sz, sz * 0.7), facets=4, detail=0.06, subdiv=2, sink=0.35)
        Bt('rimstones', 'stone', vcol=True).add(st, place(x, z, k * 41.0, gy(x, z)), color=(0.95, 0.93, 0.9), uv_box=1.5)
    # moss and ferns at the foot of the spring rocks
    for k in range(6):
        a = 3.6 + k * 0.45
        tx_, tz_ = px + math.cos(a) * (pr + 0.6), pz + math.sin(a) * (pr + 0.6) / 1.25
        Bt('grass_green', 'grass', vcol=True, ao=False).add(critters.green_tuft(3100 + k, r=0.6, h=0.7), place(tx_, tz_, k * 50, gy(tx_, tz_)))
    m_reed = core.material('reedclump', None, vcol=True, rough=0.7, double=True)
    for k, a in enumerate((0.2, 0.9, 2.6, 5.7)):
        rx, rz = px + math.cos(a) * (pr + 0.4), pz + math.sin(a) * (pr + 0.4) / 1.25
        sc.batch('reeds_green', m_reed, ao=False).add(critters.reeds(410 + k, r=0.6, h=2.2 + 0.4 * (k % 2)), place(rx, rz, k * 40, gy(rx, rz)))
        sc.col_box(f'reeds{k}', (1.4, 2.4, 1.4), rx, rz, 0)
    # doves drinking at the water's edge, on the little beach at the front of the pool (no rim stones there), facing the
    # water: each dips its beak into the water and lifts its head to swallow (anim `drink`)
    for k, a in enumerate((1.3, 1.56, 1.82)):
        rr = pr - 0.36
        dx2, dz2 = px + math.cos(a) * rr, pz + math.sin(a) * rr / 1.25
        dvb, dvh, dvp = critters.dove((0.96, 0.95, 0.93) if k != 1 else (0.7, 0.72, 0.78), (0.78, 0.78, 0.8))
        dv = sc.obj(f'pooldove{k}', dvb, m_crit, place(dx2, dz2, math.degrees(-a) - 90, gy(dx2, dz2)), props={'anim': 'drink', 'dip': 0.38})
        sc.obj(f'pooldove{k}.head', dvh, m_crit, Matrix.Translation(dvp), parent=dv)

    # ------------------------------------------------ anchors
    anchors_xz = []

    def A(name, x, z, face, note=None):
        sc.anchor(name, x, z, face, round(gy(x, z), 3), note)
        anchors_xz.append((x, z))

    A('center', 0.0, 1.0, 0.0, 'the middle of the sandy yard (the acting area), facing the camera side')
    A('elder', 1.5, -1.5, 0.0, 'the old monk\'s spot in the yard, between the garden and the camera')
    A('cell', DOOR[0] + 0.5, DOOR[1] + 2.3, cf, 'in front of the cell door, facing out')
    A('cell-door', DOOR[0], DOOR[1] - 0.3, cf, 'standing in the doorway, facing out')
    A('cell-in', DOOR[0] - 0.4, DOOR[1] - 1.9, cf, 'inside, just behind the closed door')
    A('garden', gx + 1.0, gz + 2.9, 180.0, 'in front of the vegetable garden, facing it')
    A('spring', px - pr - 1.6, pz + 1.0, 90.0, 'on the bank of the spring, facing the water (+X)')
    for side, P_ in (('left', PATH_L), ('right', PATH_R)):
        for nm, t_k in (('path-%s' % side, 0.4), ('path-%s-near' % side, 0.75)):
            i = int(t_k * (len(P_) - 1))
            (ax, az), (bx2, bz2) = P_[i], P_[i + 1]
            A(nm, ax, az, math.degrees(math.atan2(bx2 - ax, bz2 - az)), 'on the path, facing along it towards the yard')
    A('offstage-left', -62.0, 13.0, 90.0, 'out of frame on the left path (enter walking +X)')
    A('offstage-right', 62.0, 12.0, -90.0, 'out of frame on the right path (enter walking -X)')

    def free(x, z, r):
        if path_dist(x, z) < r + 0.6:
            return False
        for qx, qz, qr in reserve:
            if math.hypot(x - qx, z - qz) < qr + r:
                return False
        for ax, az in anchors_xz:
            if math.hypot(x - ax, z - az) < 2.5 + r:
                return False
        if -12 < x < 9 and -7 < z < 10:      # the acting area stays clear
            return False
        if -16 < x < 14 and 10 <= z < 30 and r > 1.0:   # nothing big between the yard and the usual camera
            return False
        return True

    # ------------------------------------------------ the mountain behind: red cliffs (near) and far buttes
    for k_, (mx_, mz_, w_, d_, h_) in enumerate(((-70, -150, 60, 30, 13), (30, -170, 70, 30, 16), (110, -140, 50, 30, 11))):
        mb = pieces.mesa(860 + k_, w_, d_, h_, tile=7.0)
        sc.batch('cliffs', mat['cliff'], ao=False).add(mb, place(mx_, mz_, math.degrees(math.atan2(-mx_, -mz_ - 30)) * 0.4, gy(mx_, mz_) - 1.5))
    far = core.material('distant_cliffs', red_t, color=(1.0, 0.9, 0.86))
    for k_, (mx_, mz_, w_, d_, h_) in enumerate(((-230, -260, 90, 40, 18), (200, -280, 110, 40, 20), (-300, 40, 70, 60, 14), (300, 60, 80, 50, 15))):
        sc.batch('distant_cliffs', far, ao=False).add(pieces.mesa(880 + k_, w_, d_, h_, tile=16.0), place(mx_, mz_, math.degrees(math.atan2(-mx_, -mz_)), 2.0))

    # ------------------------------------------------ boulders with a lizard, a tortoise, a hare by a bush, butterflies
    rocks = [(-24.0, -6.0, 2.4), (-27.0, -3.5, 1.3), (24.0, -15.0, 2.8), (27.0, -12.5, 1.5), (-18.0, 9.5, 1.4),
             (21.0, 10.5, 1.6), (-36.0, -16.0, 3.4), (38.0, -6.0, 3.0), (8.0, -22.0, 2.6), (-8.0, -24.0, 3.0)]
    lizard_at = None
    for i, (x, z, s) in enumerate(rocks):
        if not free(x, z, s * 0.8):
            continue
        st = core.rock(500 + i, size=(s, s * 0.8, s * 0.7), facets=6, detail=0.12, subdiv=3, sink=0.25)
        Mr = place(x, z, i * 47.0, gy(x, z))
        k = 0.9 + 0.15 * rng.random()
        Bt('rocks', 'rock', vcol=True).add(st, Mr, color=(k, k, k), uv_box=3.0)
        sc.add_col(f'rock{i}', core.hull_of(core.rock(500 + i, size=(s, s * 0.8, s * 0.7), facets=6, detail=0.12, subdiv=1, sink=0.25), Mr))
        reserve.append((x, z, s + 0.4))
        if lizard_at is None and s > 2.0:
            lizard_at = (x, z, s)
    if lizard_at:
        lx, lz_, s = lizard_at
        sc.obj('lizard', critters.lizard((0.45, 0.78, 0.3)), m_crit, place(lx, lz_ + 0.1, 30, gy(lx, lz_) + s * 0.62), props={'anim': 'lizard'})
    tx, tz = -15.5, -3.5
    tb_, (th_, tp_), tlegs = critters.tortoise_parts()
    to_ = sc.obj('tortoise', tb_, m_crit, place(tx, tz, 120, gy(tx, tz), 1.6), props={'anim': 'hen', 'radius': 1.1, 'speed': 0.2, 'legs': 1})
    sc.obj('tortoise.head', th_, m_crit, Matrix.Translation(tp_), parent=to_, props={'anim': 'peek'})
    for k, (lg, lp) in enumerate(tlegs):
        sc.obj(f'tortoise.leg{k}', lg, m_crit, Matrix.Translation(lp), parent=to_)
    sc.col_box('tortoise', (3.4, 0.8, 3.6), tx, tz, 0)
    reserve.append((tx, tz, 2.2))
    hx_, hz_ = -19.0, 12.2
    bb, bh, bp = critters.bunny((0.86, 0.7, 0.5), (1.0, 0.96, 0.9))
    bu = sc.obj('hare', bb, m_crit, place(hx_, hz_, 150, gy(hx_, hz_), 1.2), props={'anim': 'sway', 'amp': 0.02, 'freq': 0.6})
    sc.obj('hare.head', bh, m_crit, Matrix.Translation(bp), parent=bu, props={'anim': 'peck', 'freq': 0.7, 'phase': 0.4})
    sc.col_box('hare', (0.8, 1.0, 0.8), hx_, hz_, 0)
    reserve.append((hx_, hz_, 1.0))
    bsh = pieces.bush(seed=731, r=1.3, h=1.5, green=(0.36, 0.58, 0.22))
    Mb = place(hx_ + 1.7, hz_ - 0.9, 0, gy(hx_, hz_))
    Bt('twigs', 'twig', ao=False).add(bsh['twig'], Mb)
    Bt('shrubs', 'shrub', vcol=True, ao=False).add(bsh['shrub'], Mb)
    sc.col_box('harebush', (2.0, 1.5, 2.0), hx_ + 1.7, hz_ - 0.9, 0)
    reserve.append((hx_ + 1.7, hz_ - 0.9, 1.8))

    def flutter(name, x, y, z, col, spot, radius=1.2, freq=0.35, phase=0.0):
        body, wl_, wr_ = critters.butterfly(col, spot)
        g = sc.obj(name, body, m_crit, Matrix.Translation(B(x, y, z)),
                   props={'anim': 'butterfly', 'radius': radius, 'freq': freq, 'phase': phase, 'height': 0.35})
        sc.obj(name + '.wing.L', wl_, m_wing, Matrix.Identity(4), parent=g)
        sc.obj(name + '.wing.R', wr_, m_wing, Matrix.Identity(4), parent=g)

    flutter('butterfly1', gx, 1.9, gz + 0.4, (1.0, 0.85, 0.2), (0.95, 0.45, 0.15), 1.3, 0.3, 0.0)
    flutter('butterfly2', gx + 5.0, 1.7, gz - 1.6, (1.0, 1.0, 0.97), (0.55, 0.75, 1.0), 1.2, 0.38, 2.0)
    flutter('butterfly3', px - 2.5, 1.8, pz + 2.2, (0.98, 0.55, 0.2), (0.35, 0.2, 0.1), 1.4, 0.27, 4.0)
    flutter('butterfly4', cx + 4.5, 2.1, cz + 5.5, (0.6, 0.8, 1.0), (0.25, 0.35, 0.8), 1.4, 0.33, 1.0)
    flutter('butterfly5', -20.0, 1.6, 2.0, (0.95, 0.45, 0.7), (0.6, 0.2, 0.5), 1.5, 0.31, 3.0)

    # ------------------------------------------------ date palms (broad leaves) round the spring and the yard
    palms = [(17.5, -10.5, 11.0, (-0.4, 0.3)), (7.0, -12.5, 9.5, (0.3, 0.3)), (19.5, -3.0, 10.0, (-0.5, -0.1)),
             (15.0, -15.5, 12.5, (-0.2, 0.2)), (-20.0, -13.0, 10.5, (0.4, 0.2)), (-5.5, -17.5, 11.5, (0.2, 0.2)),
             (-30.0, 2.0, 9.5, (0.5, 0.2)), (31.0, 3.0, 10.0, (-0.4, 0.2)), (-24.0, -22.0, 12.0, (0.3, 0.1)),
             (27.0, -24.0, 11.0, (-0.3, 0.2)), (-38.0, -8.0, 10.5, (0.4, 0.1)), (40.0, -14.0, 11.5, (-0.4, 0.2))]
    m_crown = core.material('crown', leaf_t, vcol=True, double=True, rough=0.6)
    crowns = {}
    for i, (x, z, h, lean) in enumerate(palms):
        p = pieces.palm(seed=90 + i, height=h, lean=lean, fronds=13)
        Mp = place(x, z, i * 37.0, gy(x, z) - 0.05)
        Bt('palm_bark', 'bark', ao_density=10).add(p['bark'], Mp)
        Bt('palm_bark', 'bark').add(p['bark_boss'], Mp, uv_box=1.0)
        v = i % 3
        props = {'anim': 'sway', 'amp': 0.035, 'freq': 0.45 + 0.07 * (i % 4), 'phase': i * 1.3}
        Ms = Mp @ Matrix.Translation(p['top']) @ Matrix.Diagonal((h / 10.5,) * 3 + (1,))
        if v not in crowns:
            q = pieces.palm(seed=190 + v, height=10.0, lean=(0, 0), fronds=13)
            cbm = core.new_bm()
            for kk in ('leaf', 'dry', 'dates'):
                core.merge(cbm, q[kk])
            core.transform(cbm, Matrix.Translation(-q['top']))
            crowns[v] = sc.obj(f'palm{i}.crown', cbm, m_crown, Ms, props=props).data
        else:
            sc.obj(f'palm{i}.crown', None, None, Ms, mesh=crowns[v], props=props)
        sc.col_box(f'palm{i}', (1.2, h, 1.2), x, z, 0)
        reserve.append((x, z, 1.6))

    # ------------------------------------------------ green tufts by the water, flowers everywhere, bushes, pebbles
    r2 = np.random.default_rng(131)
    nt = 0
    for i in range(8000):
        if nt >= 120:
            break
        x = -45 + 90 * r2.random(); z = -30 + 52 * r2.random()
        oas = math.hypot(x - px, z - pz) < pr + 9 or math.hypot(x - gx, z - gz) < 7 or math.hypot(x - cx, z - cz) < 8
        if not oas and r2.random() < 0.8:
            continue
        if not free(x, z, 0.4):
            continue
        nt += 1
        if oas:
            Bt('grass_green', 'grass', vcol=True, ao=False).add(critters.green_tuft(1500 + i, r=0.45 + 0.25 * r2.random(), h=0.5 + 0.4 * r2.random()), place(x, z, r2.random() * 360, gy(x, z)))
        else:
            Bt('tufts', 'grass', vcol=True, ao=False).add(pieces.tuft(1500 + i, r=0.4, h=0.55, dry=0.6), place(x, z, r2.random() * 360, gy(x, z)))
    nf = 0
    pal = ((1.0, 0.85, 0.2), (1.0, 1.0, 0.95), (0.98, 0.45, 0.55), (0.95, 0.3, 0.25), (0.65, 0.45, 0.95), (0.35, 0.6, 1.0))
    for i in range(5000):
        if nf >= 90:
            break
        x = -40 + 80 * r2.random(); z = -26 + 46 * r2.random()
        if not free(x, z, 0.5):
            continue
        nf += 1
        Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(1800 + i, n=5 + int(r2.random() * 6), radius=0.45, palette=pal), place(x, z, 0, gy(x, z)))
    # flower clumps round the yard's edge (off every walk)
    for k, (fx2, fz2) in enumerate(((-11.0, -6.0), (-7.5, -8.0), (8.5, -9.0), (5.0, -8.5), (-13.0, 8.5), (12.0, 8.5), (-9.5, 10.5), (9.0, 10.8))):
        if path_dist(fx2, fz2) < 1.0:
            continue
        Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(2400 + k, n=9, radius=0.55, palette=pal), place(fx2, fz2, 0, gy(fx2, fz2)))
        Bt('grass_green', 'grass', vcol=True, ao=False).add(critters.green_tuft(2450 + k), place(fx2 + 0.5, fz2 - 0.3, 0, gy(fx2, fz2)))
    nb = 0
    for i in range(1200):
        if nb >= 18:
            break
        x = -44 + 88 * r2.random(); z = -30 + 50 * r2.random()
        if not free(x, z, 1.4):
            continue
        nb += 1
        rr_, hh_ = 0.9 + 0.7 * r2.random(), 1.0 + 0.8 * r2.random()
        bsh = pieces.bush(seed=700 + i, r=rr_, h=hh_, green=(0.38, 0.58, 0.22))
        if nb % 2:   # a flowering oleander: pink blossoms all over it
            fr = np.random.default_rng(800 + i)
            pink = ((0.98, 0.45, 0.65), (1.0, 0.62, 0.78), (0.95, 0.3, 0.5))[nb % 3]
            for _ in range(26):
                a = fr.random() * 2 * math.pi; e = fr.random() * 1.2
                critters.blob(bsh['shrub'], (math.cos(a) * math.cos(e) * rr_ * 0.95, math.sin(a) * math.cos(e) * rr_ * 0.95, hh_ * (0.45 + 0.55 * math.sin(e))),
                              (0.13, 0.13, 0.1), pink, subdiv=1)
        Mb = place(x, z, r2.random() * 360, gy(x, z))
        Bt('twigs', 'twig', ao=False).add(bsh['twig'], Mb)
        Bt('shrubs', 'shrub', vcol=True, ao=False).add(bsh['shrub'], Mb)
        sc.col_box(f'bush{nb}', (1.6, 1.4, 1.6), x, z, 0)
        reserve.append((x, z, 1.6))
    m_peb = core.material('pebble', stone_t, vcol=True)
    for i in range(30):
        x = -43 + 86 * r2.random(); z = -26 + 46 * r2.random()
        if not free(x, z, 0.4):
            continue
        sc.batch('pebbles', m_peb, vcol=True, ao=False).add(pieces.pebbles(1200 + i, 5, 0.9, size=0.1), place(x, z, 0, gy(x, z)), uv_box=1.0)

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
        'title': 'Grădina cu izvor din munte (chilia bătrânului)',
        'units': 'engine units (figure 4.2 tall), three.js Y-up, +Z towards the usual camera',
        'anchors': sc.anchors,
        'seats': sc.seats,
        'bounds': [[-60, -1.5, -50], [60, 14, 26]],
        'acting': {'rect': [[-12, -7], [9, 10]], 'paths': [[[round(a, 2), round(b, 2)] for a, b in p] for p in (PATH_L, PATH_R, PATH_C)],
                   'pond': {'centre': [px, pz], 'radius': pr, 'water_y': WATER_Y}},
        'skies': ['morning', 'day', 'evening'],
        'sky': {'day': {'sunAz': -30, 'sunElev': 50}, 'morning': {'sunAz': -60, 'sunElev': 16}, 'evening': {'sunAz': 50, 'sunElev': 9}},
        'shadow': {'center': [0, -4], 'radius': 46},
        'shots': {
            'wide': {'pos': [0, 6.0, 30], 'target': [0, 2.6, -6], 'fov': 42, 'note': 'the yard, the cell left, the spring right, the red mountain behind'},
            'spring': {'pos': [6, 3.5, 6], 'target': [12.5, 1.0, -7], 'fov': 40, 'note': 'the spring with the doves'},
        },
        'notes': ('The yard x -12…9, z -7…10 is free. The cave cell (a red rock outcrop, the doorway towards +Z) stands at x ≈ -14, z ≈ -15, turned 14°; '
                  'the spring (pool, water_y -0.35) at [12.5, -6.5], radius 4.2; the garden at [-1.5, -12]. Paths: from the front '
                  'left (offstage-left, path-left, path-left-near) and the front right (offstage-right, path-right, path-right-near) '
                  'to the yard. Collision: col:cell, col:cell-things, col:garden*, col:springrockN, col:reedsN, col:rockN, col:palmN, col:bushN.'),
    }
    os.makedirs(out_dir, exist_ok=True)
    sc.export(os.path.join(out_dir, NAME + '.glb'))
    with open(os.path.join(out_dir, NAME + '.json'), 'w') as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    return meta
