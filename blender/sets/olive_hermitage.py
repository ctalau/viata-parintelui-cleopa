"""Set `olive-hermitage`: Avva Pimen's stone cell among olive trees (film 052, after the user's picture): a round
honey-stone cell with a beehive dome and a wooden cross on top (AI `pimen-chilie`, its painted door cut out and a plank door
leaf hung on a hinge — `door:cell`), a sandy path with footprints winding from its door to the right and away over the hills to
other little cells with crosses, a big old olive tree on the left, flowering bushes, lilac-grey boulders, wild flowers, green
tufts, butterflies, doves on the dome, hens, a hare and a tortoise by the path, soft lilac hills far away.

three.js layout (x right, z towards the usual camera, y up; figure 4.2 tall):
  * the cell: centre CELL, ≈ 16 across, its doorway towards +X (DOOR_C); a sunny yard before the door (x 1…15, z -17…-2),
  * the path: from the door to the right (x ≈ 11, z ≈ -8), towards the camera (17, 0), then right and away (x ≈ 29, z ≈ -24 … 26, -58),
  * the big olive tree left of the cell [-19, -3], other olives round about, far white cells on the hills (chilie-alba, pimen-chilie).
"""
import math
import os
import json
import numpy as np
from mathutils import Matrix, Vector, noise

from kit import core, tex, pieces, critters, aimesh
from kit.core import B, place, Batch, Scene
from kit.olives import OliveTrees
from desert_rock import house, _curve, dist_to_poly

NAME = 'olive-hermitage'
CORE = (-46.0, 50.0, -60.0, 40.0)
TEX_W, TEX_H = 2048, 2048
CELL = (-6.0, -10.0, 90.0)       # centre x, z and heading: the door looks +X (to the right, towards the path)
CS = 10.5                        # scale of pimen-chilie (its door 4.8 wide, 7.3 high; ≈ 16 across, like the room inside)
C_GROUND = -0.9                  # model z of the door sill (the stone step sinks into the ground)
C_DOOR = (-0.23, 0.23, -0.43, 0.23)   # model: hole x0, x1, top of the straight part, arch radius
C_FRONT = -0.68                  # model y of the wall face round the door (the painted door is 0.085 behind it)
DOOR_C = (CELL[0] - C_FRONT * CS, CELL[1] - (C_DOOR[0] + C_DOOR[1]) / 2 * CS)   # model front (+Z) turned to +X
PATH = _curve((DOOR_C[0] + 1.0, DOOR_C[1]), (11.0, -10.5), (17.0, 0.0), 24)[:-1] + _curve((17.0, 0.0), (27.0, -6.0), (29.0, -24.0), 20)[:-1] \
    + _curve((29.0, -24.0), (30.5, -36.0), (26.0, -58.0), 16)


def path_dist(x, z):
    return dist_to_poly(x, z, PATH) - 1.3


def H(x, z):
    """a flat yard; soft round hills further out, rising behind (the far cells stand on them)"""
    hgt = 0.0
    ox = max(0.0, abs(x - 4) - 34.0); oz = max(0.0, z - 30.0, -z - 30.0)
    o = math.hypot(ox, oz)
    if o > 0:
        k = min(1.0, o / 30.0) ** 1.3
        hill = 0.5 + 0.5 * noise.noise(Vector((x * 0.02 + 1.3, z * 0.02, 4.1)))
        hgt += k * (2.0 + 7.0 * hill)
    return hgt


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
    """rolling green-gold hills all round the core"""
    x0, x1, z0, z1 = CORE
    bm = core.new_bm()
    uvl = bm.loops.layers.uv[core.UV0]; cl = bm.loops.layers.color[core.COL]
    R = 420.0
    n = 96
    xs = np.concatenate([-np.geomspace(1, R, 24)[::-1] + x0 + 1, np.linspace(x0, x1, 40), np.geomspace(1, R, 24) + x1 - 1])
    zs = np.concatenate([-np.geomspace(1, R, 24)[::-1] + z0 + 1, np.linspace(z0, z1, 40), np.geomspace(1, R, 24) + z1 - 1])
    vs = [[bm.verts.new(B(float(x), H(float(x), float(z)) - (0.05 if (x0 < x < x1 and z0 < z < z1) else 0), float(z))) for x in xs] for z in zs]
    for j in range(len(zs) - 1):
        for i in range(len(xs) - 1):
            cx_, cz_ = (xs[i] + xs[i + 1]) / 2, (zs[j] + zs[j + 1]) / 2
            if x0 + 0.5 < cx_ < x1 - 0.5 and z0 + 0.5 < cz_ < z1 - 0.5:
                continue
            f = bm.faces.new((vs[j][i], vs[j + 1][i], vs[j + 1][i + 1], vs[j][i + 1]))
    bm.normal_update()
    if sum(f.normal.z for f in bm.faces) < 0:
        for f in bm.faces:
            f.normal_flip()
    for f in bm.faces:
        for l in f.loops:
            p = l.vert.co
            l[uvl].uv = (p.x / 9.0, p.y / 9.0)
            nz = noise.noise(Vector((p.x * 0.02, p.y * 0.02, 2.0)))
            g = 0.5 + 0.5 * nz
            l[cl] = (0.86 + 0.08 * g, 0.9 + 0.04 * g, 0.62 + 0.1 * (1 - g), 1)
    b = Batch('ground_far', mat, ao=False, vcol=True)
    b.bm.free(); b.bm = bm
    sc.batches['ground_far'] = b
    del n


def ground_textures(occluders):
    """warm sand, green meadow patches, a packed yard before the door, the trodden path with little footprints"""
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
    seed = 521
    n1 = tex.fbm(Hh, seed, 3.0, 1, 40, m=W)
    n2 = tex.fbm(Hh, seed + 1, 1.5, 20, 400, m=W)
    grain = tex.fbm(Hh, seed + 2, 0.0, 300, m=W)
    road = tex.smooth(0.7, -0.6, D)
    yard = tex.smooth(1.0, 0.0, np.hypot((X - DOOR_C[0] - 5.0) / 7.5, (Z - DOOR_C[1] - 1.5) / 8.0) + 0.15 * n1)
    meadow = tex.smooth(0.42, 0.62, tex.norm01(n1 * 0.7 + n2 * 0.3)) * (1 - yard) * (1 - road)
    sand = tex.ramp(tex.norm01(n1 * 0.8 + n2 * 0.2), [(0, '#e0bd84'), (0.45, '#ecd29e'), (1, '#f6e4b8')])
    grass = tex.ramp(tex.norm01(n2 * 0.6 + grain * 0.2 + n1 * 0.2), [(0, '#a7b25e'), (0.5, '#bcc274'), (1, '#d2cf8a')])
    earth = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#d8b27c'), (0.5, '#e3c08c'), (1, '#edcfa0')])
    pathc = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#e6c590'), (0.5, '#efd3a2'), (1, '#f7e0b4')])
    col = sand
    col = col * (1 - meadow[..., None]) + grass * meadow[..., None]
    col = col * (1 - yard[..., None]) + earth * yard[..., None]
    col = col * (1 - road[..., None]) + pathc * road[..., None]
    # little footprints along the path (two rows of soft ovals, a pair every 1.1 along the path)
    fp = np.zeros_like(X)
    L = 0.0
    pts = PATH
    k = 0
    for (ax, az), (bx, bz) in zip(pts[:-1], pts[1:]):
        dx, dz = bx - ax, bz - az
        seg = math.hypot(dx, dz)
        if seg < 1e-6:
            continue
        ux, uz = dx / seg, dz / seg
        s = (1.1 - L % 1.1) if L > 0 else 0.0
        while s < seg:
            px, pz = ax + ux * s, az + uz * s
            side = 0.28 if k % 2 == 0 else -0.28
            fx, fz = px - uz * side, pz + ux * side
            i0 = int((fx - x0) / (x1 - x0) * W); j0 = int((fz - z0) / (z1 - z0) * Hh)
            r = 10
            if 0 <= i0 - r and i0 + r < W and 0 <= j0 - r and j0 + r < Hh:
                sx, sz = X[j0 - r:j0 + r, i0 - r:i0 + r] - fx, Z[j0 - r:j0 + r, i0 - r:i0 + r] - fz
                a_ = sx * ux + sz * uz; b_ = -sx * uz + sz * ux
                fp[j0 - r:j0 + r, i0 - r:i0 + r] = np.maximum(fp[j0 - r:j0 + r, i0 - r:i0 + r], tex.smooth(1.0, 0.7, np.hypot(a_ / 0.2, b_ / 0.09)))
            s += 1.1; k += 1
        L += seg
    fp = tex.blur(fp, 0.8)
    col *= (1 - 0.16 * fp[..., None])
    col *= (1 + 0.05 * grain[..., None])
    dark = np.zeros_like(X)
    for (ox, oz, r) in occluders:
        dark = np.maximum(dark, np.exp(-((np.hypot(X - ox, Z - oz) / r) ** 2)))
    col *= (1 - 0.12 * dark[..., None])
    h = grain * 0.08 + n2 * 0.15 - fp * 0.3
    nrm = tex.normal_from_height(tex.blur(h, 0.9), 1.8, wrap=False)
    rough = np.clip(0.9 - 0.06 * road + 0.03 * grain, 0, 1)
    return (tex.save('olive-hermitage_ground_col', col, 82), tex.save('olive-hermitage_ground_nrm', nrm, 72),
            tex.save('olive-hermitage_ground_orm', tex.pack_rough(rough), 80))


def build(out_dir, bake=True):
    core.reset()
    sc = Scene(NAME)
    T = core.texset
    sand_t = T('sand', tex.sand, n=512, seed=1, ripples=False)
    honey_t = T('honeystone', tex.sandstone, n=1024, seed=52, tint=[(0, '#a9844f'), (0.35, '#c39c62'), (0.7, '#d8b47a'), (1, '#ead09a')])
    stone_t = T('sandstone', tex.sandstone, n=1024, seed=2)
    door_t = T('doorwood', tex.wood, n=512, seed=54, colors=('#b07a42', '#8e5c30', '#6a421f'))
    beam_t = T('palmwood', tex.wood, n=512, seed=14, planks=1, colors=('#9d7a52', '#7a5636', '#553820'))

    cx, cz, cf = CELL
    occl = [(cx, cz, 9.0), (-19.0, -3.0, 5.0)]
    gt = ground_textures(occl)
    ground_core(sc, core.material('ground', gt, extras={'detail': 'sand'}))
    ground_far(sc, core.material('ground_far', sand_t, vcol=True, extras={'detail': 'sand'}))
    m_crit = core.material('critter', None, vcol=True, rough=0.55)
    iron = core.material('iron', None, color=(0.16, 0.14, 0.13), rough=0.45, metal=0.6)
    grass_m = core.material('grass', None, vcol=True, rough=0.8, double=True)
    reserve = []
    gy = H

    # ------------------------------------------------ the stone cell (AI house), its door on a hinge
    cmats = {'jamb': core.material('jamb_stone', honey_t, color=(0.86, 0.78, 0.66)), 'room': core.material('room_dark', None, color=(0.2, 0.13, 0.08), rough=0.95),
             'door': core.material('door_wood', door_t), 'iron': iron}
    room = (C_DOOR[0] - 0.2, C_DOOR[1] + 0.2, C_FRONT + 0.22, 0.55, C_GROUND - 0.05, C_DOOR[2] + 0.3)
    Mc, hc = house(sc, 'pimen-chilie', 'cell', CS, C_GROUND, C_DOOR, C_FRONT, CELL, cmats, room)
    # thin collision walls round the cell (a ring of boxes), the doorway free
    R_ = 0.76 * CS
    for k in range(24):
        a = (k + 0.5) / 24 * 2 * math.pi
        x, z = cx + R_ * math.sin(a), cz + R_ * math.cos(a)
        if abs(z - DOOR_C[1]) < (C_DOOR[1] - C_DOOR[0]) * CS / 2 + 0.4 and x > cx:
            continue
        sc.col_box(f'cell-{k}', (2 * math.pi * R_ / 24 + 0.2, 8.0, 0.7), x, z, math.degrees(a))
    reserve.append((cx, cz, R_ + 1.0))

    # doves pecking on the ground beside the door
    for k, (lx, lz, rz_) in enumerate(((DOOR_C[0] + 1.4, DOOR_C[1] - 4.2, 130), (DOOR_C[0] + 1.8, DOOR_C[1] + 4.4, -30))):
        dvb, dvh, dvp = critters.dove((0.96, 0.95, 0.93) if k != 1 else (0.72, 0.72, 0.78), (0.78, 0.78, 0.8))
        dv = sc.obj(f'dove{k}', dvb, m_crit, place(lx, lz, rz_, gy(lx, lz)))
        sc.obj(f'dove{k}.head', dvh, m_crit, Matrix.Translation(dvp), parent=dv, props={'anim': 'peck', 'freq': 0.6 + 0.25 * k, 'phase': k * 2.0})

    # ------------------------------------------------ AI set dressing
    ai_cache = {}

    def ai_piece(name, x, z, face, height, k=0, col=True, sink=0.01, props=None, colr=0.9, rough=0.6, spec=0.3):
        if not os.path.exists(os.path.join(aimesh.SRC, name + '.glb')):
            print(f'  (no {name}.glb yet — skipped)')
            return
        if name not in ai_cache:
            ob = aimesh.load(name)
            aimesh.drop_loose(ob, 12)
            lo, hi = aimesh.bounds(ob)
            s = height / (hi[2] - lo[2])
            aimesh.fit(ob, s, ground=lo[2] + sink * (hi[2] - lo[2]), centre=((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2))
            lo2, hi2 = aimesh.bounds(ob)
            ai_cache[name] = (aimesh.finish(sc, ob, f'{name}.{k}', place(x, z, face, gy(x, z)), rough=rough, spec=spec, props=props), lo2, hi2, height)
            if name == 'pimen-tufa-flori':
                aimesh.foliage(ai_cache[name][0])
        else:
            sc_ = height / ai_cache[name][3]
            aimesh.share(sc, ai_cache[name][0], f'{name}.{k}', place(x, z, face, gy(x, z), sc_), props=props)
        _, lo2, hi2, h0 = ai_cache[name]
        sc_ = height / h0
        w, d = (hi2[0] - lo2[0]) * sc_, (hi2[1] - lo2[1]) * sc_
        if col:
            sc.col_box(f'{name}{k}', (w * colr, height, d * colr), x, z, face)
        reserve.append((x, z, max(w, d) / 2 + 0.3))

    olives = OliveTrees(sc)
    grove = ((-19.0, -3.0, 20, 9.5, 0), (-24.0, 2.0, 120, 8.0, 1), (14.0, -22.0, 200, 8.5, 2),
             (-18.0, -24.0, 60, 9.0, 1), (36.0, 6.0, 300, 7.5, 2), (-34.0, -10.0, 10, 8.0, 0))
    for k, (x, z, f, h, variant) in enumerate(grove):
        olives.add(f'pimen-maslin.{k}', x, z, f, gy(x, z), h, variant, phase=k * 1.3)
        sc.col_box(f'pimen-maslin{k}', (h * 0.247, h, h * 0.209), x, z, f)
        reserve.append((x, z, h * 0.494 + 0.3))
    for k, (x, z, f, h) in enumerate(((4.0, -17.5, 0, 1.8), (-17.0, -14.0, 40, 1.6), (-15.5, 5.5, 90, 1.9), (13.0, 9.0, 200, 1.7), (12.0, -16.0, 300, 1.8), (35.0, -20.0, 30, 2.0), (-3.0, 12.0, 150, 1.6))):
        ai_piece('pimen-tufa-flori', x, z, f, h, k=k, rough=0.9, spec=0.08)
    for k, (x, z, f, h) in enumerate(((-7.0, 6.5, 30, 1.6), (17.0, -12.0, 200, 2.2), (-20.0, -12.0, 100, 2.4), (24.0, 12.0, 300, 1.8), (32.5, -30.0, 60, 2.0))):
        ai_piece('pimen-bolovani', x, z, f, h, k=k, colr=0.7)
    ai_piece('pimen-cos', DOOR_C[0] + 1.2, DOOR_C[1] - 3.6, 60, 1.15)                       # a basket by the door
    # far little cells with crosses on the hills (the other hermits)
    ai_piece('chilie-alba', 34.0, -55.0, -20, 6.5, col=False)
    ai_piece('pimen-chilie', -26.0, -52.0, 25, 5.5, k=1, col=False)

    # moving animals: hens before the cell, a hare and a tortoise by the path, butterflies
    hens = [(-3.0, 3.0, 30, 'brown', 0.9), (-8.5, 4.5, -40, 'white', 0.8)]
    for k2, (hx2, hz2, hf2, var, rad) in enumerate(hens):
        cols = ((0.72, 0.36, 0.16), (0.9, 0.62, 0.32), (0.5, 0.22, 0.1)) if var == 'brown' else ((0.97, 0.96, 0.93), (1.0, 1.0, 0.98), (0.85, 0.85, 0.83))
        hb, hh, hp_ = critters.hen(*cols)
        root = sc.obj(f'hen{k2 + 1}', hb, m_crit, place(hx2, hz2, hf2, gy(hx2, hz2)), props={'anim': 'hen', 'radius': rad, 'seed': 17 + 7 * k2})
        sc.obj(f'hen{k2 + 1}.head', hh, m_crit, Matrix.Translation(hp_), parent=root)
        reserve.append((hx2, hz2, rad + 0.6))
    tx, tz = 6.0, 11.5
    tb_, (th_, tp_), tlegs = critters.tortoise_parts()
    to_ = sc.obj('tortoise', tb_, m_crit, place(tx, tz, -60, gy(tx, tz), 1.6), props={'anim': 'hen', 'radius': 0.9, 'speed': 0.2, 'legs': 1})
    sc.obj('tortoise.head', th_, m_crit, Matrix.Translation(tp_), parent=to_, props={'anim': 'peek'})
    for k, (lg, lp) in enumerate(tlegs):
        sc.obj(f'tortoise.leg{k}', lg, m_crit, Matrix.Translation(lp), parent=to_)
    sc.col_box('tortoise', (3.0, 0.8, 3.0), tx, tz, 0)
    reserve.append((tx, tz, 2.0))
    hx_, hz_ = 25.0, -16.0
    bb, bh, bp = critters.bunny((0.86, 0.72, 0.52), (1.0, 0.96, 0.9))
    bu = sc.obj('hare', bb, m_crit, place(hx_, hz_, -100, gy(hx_, hz_), 1.2), props={'anim': 'sway', 'amp': 0.02, 'freq': 0.6})
    sc.obj('hare.head', bh, m_crit, Matrix.Translation(bp), parent=bu, props={'anim': 'peck', 'freq': 0.7, 'phase': 0.4})
    sc.col_box('hare', (0.8, 1.0, 0.8), hx_, hz_, 0)
    reserve.append((hx_, hz_, 1.0))
    m_wing = core.material('wing', None, vcol=True, rough=0.5, double=True)
    for k, (bx_, by_, bz_, c1, c2) in enumerate(((9.5, 1.9, -15.5, (1.0, 0.85, 0.2), (0.95, 0.45, 0.15)), (-8.5, 1.7, 1.5, (1.0, 1.0, 0.97), (0.55, 0.75, 1.0)),
                                                (20.0, 1.8, -2.0, (0.98, 0.55, 0.2), (0.35, 0.2, 0.1)), (12.0, 1.8, 9.5, (0.95, 0.45, 0.7), (0.6, 0.2, 0.5)))):
        body, wl_, wr_ = critters.butterfly(c1, c2)
        g = sc.obj(f'butterfly{k}', body, m_crit, Matrix.Translation(B(bx_, by_, bz_)), props={'anim': 'butterfly', 'radius': 1.3, 'freq': 0.3 + 0.04 * k, 'phase': k * 1.6, 'height': 0.35})
        sc.obj(f'butterfly{k}.wing.L', wl_, m_wing, Matrix.Identity(4), parent=g)
        sc.obj(f'butterfly{k}.wing.R', wr_, m_wing, Matrix.Identity(4), parent=g)

    # ------------------------------------------------ anchors
    anchors_xz = []

    def A(name, x, z, face, note=None):
        sc.anchor(name, x, z, face, round(gy(x, z), 3), note)
        anchors_xz.append((x, z))

    dx, dz = DOOR_C
    A('cell', dx + 2.6, dz, 90.0, 'in front of the cell door, facing out (+X, to the right)')
    A('cell-door', dx - 0.2, dz, 90.0, 'standing in the doorway, facing out')
    A('cell-in', dx - 1.8, dz, 90.0, 'inside the cell, just behind the closed door')
    A('yard', dx + 6.0, dz + 2.5, 0.0, 'the sunny yard before the cell door')
    for nm, t_k in (('path-1', 0.16), ('path-2', 0.3), ('path-3', 0.42), ('path-4', 0.55), ('path-5', 0.68), ('path-6', 0.8)):
        i = int(t_k * (len(PATH) - 1))
        (ax, az), (bx2, bz2) = PATH[i], PATH[i + 1]
        A(nm, round(ax, 2), round(az, 2), round(math.degrees(math.atan2(bx2 - ax, bz2 - az)), 1), 'on the path from the cell door, facing along it (away)')
    A('tree', -15.5, 0.5, 0.0, 'in the shade of the big olive tree')
    A('tortoise', tx, tz, 0.0, 'the tortoise by the path')

    def free(x, z, r):
        if path_dist(x, z) < r + 0.6:
            return False
        for qx, qz, qr in reserve:
            if math.hypot(x - qx, z - qz) < qr + r:
                return False
        for ax, az in anchors_xz:
            if math.hypot(x - ax, z - az) < 2.5 + r:
                return False
        if 0 < x < 15 and -18 < z < -1:      # the yard stays clear
            return False
        return True

    # ------------------------------------------------ far lilac hills
    far = core.material('distant_hills', T('lilachill', tex.sandstone, n=512, seed=61, tint=[(0, '#ad97b8'), (0.5, '#c4aecb'), (1, '#dccbdb')]))
    for k_, (mx_, mz_, w_, d_, h_) in enumerate(((-80, -170, 90, 40, 18), (40, -190, 110, 40, 24), (150, -120, 70, 40, 16),
                                                  (-170, 40, 70, 50, 15), (170, 60, 70, 50, 16), (10, 200, 110, 40, 14))):
        sc.batch('cliffs', far, ao=False).add(pieces.mesa(880 + k_, w_, d_, h_, tile=16.0), place(mx_, mz_, math.degrees(math.atan2(-mx_, -mz_)) * 0.4, gy(mx_, mz_) - 2.0))

    # ------------------------------------------------ flowers, green tufts, pebbles
    r2 = np.random.default_rng(237)
    pal = ((1.0, 0.85, 0.2), (1.0, 1.0, 0.95), (0.98, 0.45, 0.55), (0.75, 0.55, 0.95))
    nt = nf = 0
    for i in range(8000):
        if nt >= 140:
            break
        x = -44 + 92 * r2.random(); z = -56 + 94 * r2.random()
        if not free(x, z, 0.4):
            continue
        nt += 1
        sc.batch('tufts', grass_m, vcol=True, ao=False).add(critters.green_tuft(1500 + i, r=0.4 + 0.2 * r2.random(), h=0.5 + 0.3 * r2.random()), place(x, z, r2.random() * 360, gy(x, z)))
    for i in range(8000):
        if nf >= 110:
            break
        x = -44 + 92 * r2.random(); z = -56 + 94 * r2.random()
        if not free(x, z, 0.5):
            continue
        nf += 1
        sc.batch('flowers', grass_m, vcol=True, ao=False).add(critters.flowers(2600 + i, n=5 + int(r2.random() * 5), radius=0.5, palette=pal), place(x, z, 0, gy(x, z)))
    for k, (fx2, fz2) in enumerate(((-7.6, -3.5), (9.5, -6.0), (10.0, 0.5), (-8.5, 3.5), (3.0, 9.0), (-2.5, 8.0))):
        sc.batch('flowers', grass_m, vcol=True, ao=False).add(critters.flowers(2900 + k, n=10, radius=0.6, palette=pal), place(fx2, fz2, 0, gy(fx2, fz2)))
    m_peb = core.material('pebble', stone_t, vcol=True)
    for i in range(50):
        x = -43 + 90 * r2.random(); z = -55 + 92 * r2.random()
        if not free(x, z, 0.4):
            continue
        sc.batch('pebbles', m_peb, vcol=True, ao=False).add(pieces.pebbles(1200 + i, 5, 0.9, size=0.1), place(x, z, 0, gy(x, z)), uv_box=1.0)
    del beam_t

    sc.finalize()
    if bake:
        sc.bake_ao(samples=40, distance=5.0, max_size=2048, blur=0.6, gamma=1.15, floor=0.18)

    meta = {
        'name': NAME,
        'title': 'Chilia lui Avva Pimen între măslini',
        'units': 'engine units (figure 4.2 tall), three.js Y-up, +Z towards the usual camera',
        'anchors': sc.anchors,
        'seats': sc.seats,
        'doors': ['cell'],
        'doorLeaves': {'cell': hc},
        'bounds': [[-60, -1.5, -70], [60, 20, 50]],
        'acting': {'rect': [[1, -17], [15, -2]], 'paths': [[[round(a, 2), round(b, 2)] for a, b in PATH]]},
        'skies': ['morning', 'day', 'evening'],
        'sky': {'day': {'sunAz': -25, 'sunElev': 48}, 'morning': {'sunAz': -55, 'sunElev': 22}, 'evening': {'sunAz': 45, 'sunElev': 12}},
        'shadow': {'center': [6, -6], 'radius': 45},
        'shots': {
            'wide': {'pos': [2, 5.0, 22], 'target': [0, 3.5, -9], 'fov': 46, 'note': 'the cell side-on, its door on the right, the olive tree, the path'},
            'path': {'pos': [-2, 5.0, 8], 'target': [22, 2.5, -14], 'fov': 40, 'note': 'from the yard along the path, far away'},
        },
        'notes': ('Stone cell (pimen-chilie ×%.1f): centre %s, doorway facing +X at [%.2f, %.2f] (door:cell, opens outwards); '
                  'anchors cell, cell-door, cell-in. The path from the door: path-1 … path-6 (paths[0] in acting). Collision: '
                  'col:cell-*, col:pimen-*.') % (CS, list(CELL[:2]), DOOR_C[0], DOOR_C[1]),
    }
    os.makedirs(out_dir, exist_ok=True)
    sc.export(os.path.join(out_dir, NAME + '.glb'))
    with open(os.path.join(out_dir, NAME + '.json'), 'w') as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    return meta
