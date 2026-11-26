"""Set `desert-rock`: „Piatra” — a dry rocky place in the desert with a big honey-coloured rock, where Avva Moise came to
live (film 050), and the white domed cell of the schit he came from.

Both cells are the AI concept houses of assets/3d (Hunyuan3D-2, see assets/3d/HANDOFF.md) brought to the engine's scale
(kit/aimesh.py): pivot on the ground centre, the painted door cut out of the wall, a dark room and a door jamb behind the
opening, and a new plank door leaf hung on a hinge (`door:cell`, `door:schit`, opening outwards — `{ "door": "cell", "open": 1 }`).

three.js layout (x right, z towards the usual camera, y up; figure 4.2 tall):
  * the stone cell (chilie-piatra, ×6.5): centre [4, -11], door towards +Z at x ≈ 2.9, the front wall at z ≈ -6.7,
  * the Rock behind it on the right: a big rounded outcrop of honey stone [18, -15] with boulders round its foot,
  * a dry sandy yard in front of the cell (x -8…14, z -5…9, the acting area): no water anywhere, dry tufts, thorn bushes,
  * a path from the yard towards the camera side, curving left to the schit: the white domed cell (chilie-alba, ×7.5)
    at [-14, 36] with its door facing -Z (towards the Rock) — filmed from the yard side, looking +Z,
  * far honey cliffs all round; a lizard on a warm rock, doves on the cell roof, a hare by a bush.
"""
import math
import os
import json
import bmesh
import numpy as np
from mathutils import Matrix, Vector, noise

from kit import core, tex, pieces, critters, aimesh
from kit.core import B, place, Batch, Scene

NAME = 'desert-rock'
CORE = (-46.0, 46.0, -44.0, 52.0)
TEX_W, TEX_H = 2048, 2048
# the stone cell (Avva Moise's at the Rock)
CELL = (4.0, -11.0, 0.0)
CS = 6.5                       # scale of chilie-piatra (its door 2.5 wide, 4.9 high)
C_GROUND = -0.66               # model z of the door sill → ground
C_DOOR = (-0.345, 0.005, -0.09, 0.17)    # model: hole x0, x1, top of the straight part, arch radius (centre x = mid)
C_FRONT = -0.665               # model y of the wall face round the door
# the white cell of the schit (behind the camera side, door towards -Z)
SCHIT = (-14.0, 36.0, 172.0)
SS = 7.5
S_GROUND = -0.80
S_DOOR = (-0.17, 0.17, -0.36, 0.17)
S_FRONT = -0.66
ROCK = (18.5, -16.0)


def _local(c, lx, ly, s, M):
    """model point (x, y) of a house → world three.js (x, z)"""
    v = M @ Vector((lx * s, ly * s, 0.0))
    return v.x, -v.y


def _curve(p0, p1, p2, n=16):
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
    return out


DOOR_C = (CELL[0] + (C_DOOR[0] + C_DOOR[1]) / 2 * CS, CELL[1] - C_FRONT * CS)      # the stone cell's doorway (world x, z)
_sa = math.radians(SCHIT[2])
_sdx = (S_DOOR[0] + S_DOOR[1]) / 2 * SS
DOOR_S = (SCHIT[0] + math.cos(_sa) * _sdx + math.sin(_sa) * (-S_FRONT * SS), SCHIT[1] - math.sin(_sa) * _sdx + math.cos(_sa) * (-S_FRONT * SS))
PATH = _curve((DOOR_S[0], DOOR_S[1] - 2.0), (-12.0, 10.0), (DOOR_C[0] - 0.4, DOOR_C[1] + 3.0), 28)
PATH_L = _curve((-78.0, 16.0), (-30.0, 12.0), (-12.5, 12.0), 16)


def dist_to_poly(px, pz, pts):
    best = 1e9
    for (ax, az), (bx, bz) in zip(pts[:-1], pts[1:]):
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz
        t = 0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / L2))
        best = min(best, math.hypot(px - ax - t * dx, pz - az - t * dz))
    return best


def path_dist(x, z):
    return min(dist_to_poly(x, z, PATH), dist_to_poly(x, z, PATH_L)) - 1.4


def H(x, z):
    """a flat yard and path, low dunes and stony humps round about"""
    hgt = 0.0
    ox = max(0.0, abs(x) - 38.0); oz = max(0.0, z - 46.0, -z - 34.0)
    o = math.hypot(ox, oz)
    if o > 0:
        k = min(1.0, o / 40.0) ** 1.4
        ridge = 1 - abs(noise.noise(Vector((x * 0.012 + 3.1, z * 0.02, 1.7))))
        dune = ridge ** 2.2 * 3.5 + noise.fractal(Vector((x * 0.01, z * 0.01, 7.0)), 0.5, 2.0, 3) * 1.2
        hgt += k * max(0.0, dune) * min(1.0, o / 16.0)
    return hgt


# ---------------------------------------------------------------- ground (as mountain-spring, other colours)
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
            k = 0.95 + 0.05 * nz + min(0.05, p.z * 0.005)
            l[cl] = (min(1, k), min(1, k * 0.97), min(1, k * 0.92), 1)
    b = Batch('ground_far', mat, ao=False, vcol=True)
    b.bm.free(); b.bm = bm
    sc.batches['ground_far'] = b


def ground_textures(occluders):
    """pale honey sand, a packed yard before the stone cell and the schit, the trodden path, stony patches, dry cracks"""
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
    seed = 251
    n1 = tex.fbm(Hh, seed, 3.0, 1, 40, m=W)
    n2 = tex.fbm(Hh, seed + 1, 1.5, 20, 400, m=W)
    grain = tex.fbm(Hh, seed + 2, 0.0, 300, m=W)
    road = tex.smooth(0.7, -0.6, D)
    yard = tex.smooth(1.0, 0.0, np.hypot((X - 3.0) / 13.0, (Z - 0.5) / 8.0) + 0.15 * n1)
    yard = np.maximum(yard, tex.smooth(1.0, 0.0, np.hypot((X - DOOR_S[0]) / 8.0, (Z - DOOR_S[1] + 3.0) / 6.0) + 0.15 * n1))
    rx, rz = ROCK
    stony = tex.smooth(14.0, 7.0, np.hypot(X - rx, (Z - rz) * 1.2) + 4.0 * n1)
    stony = np.maximum(stony, tex.smooth(0.55, 0.75, tex.norm01(n2)) * 0.5)
    # dry cracked earth: thin dark lines where a cell noise changes (the yard only)
    cr = tex.fbm(Hh, seed + 5, 0.0, 60, m=W)
    cracks = np.clip(1 - np.abs(cr) * 14, 0, 1) * yard * 0.55
    sand = tex.ramp(tex.norm01(n1 * 0.8 + n2 * 0.2), [(0, '#dcb27a'), (0.45, '#ead08f'), (1, '#f6e2ad')])
    earth = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#cfa06b'), (0.5, '#dbb07a'), (1, '#e6c38f')])
    pathc = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#c49460'), (0.5, '#d2a46e'), (1, '#ddb47f')])
    stonec = tex.ramp(tex.norm01(n2 * 0.6 + grain * 0.2 + n1 * 0.2), [(0, '#b39a78'), (0.5, '#c8ae88'), (1, '#dbc49c')])
    col = sand
    col = col * (1 - stony[..., None]) + stonec * stony[..., None]
    col = col * (1 - yard[..., None]) + earth * yard[..., None]
    col = col * (1 - road[..., None]) + pathc * road[..., None]
    col *= (1 - 0.35 * cracks[..., None])
    col *= (1 + 0.05 * grain[..., None])
    dark = np.zeros_like(X)
    for (ox, oz, r) in occluders:
        dark = np.maximum(dark, np.exp(-((np.hypot(X - ox, Z - oz) / r) ** 2)))
    col *= (1 - 0.14 * dark[..., None])
    h = grain * 0.08 + n2 * 0.15 - cracks * 0.2
    nrm = tex.normal_from_height(tex.blur(h, 0.9), 1.8, wrap=False)
    rough = np.clip(0.9 - 0.06 * road + 0.03 * grain, 0, 1)
    return (tex.save('desert-rock_ground_col', col, 82), tex.save('desert-rock_ground_nrm', nrm, 72),
            tex.save('desert-rock_ground_orm', tex.pack_rough(rough), 80))


# ---------------------------------------------------------------- the doorway of an AI house
def _arch_outline(x0, x1, ztop, zbot, segs=16):
    """the doorway outline (model units): up the left side, over the half-round arch, down the right side"""
    r = (x1 - x0) / 2; xc = (x0 + x1) / 2
    pts = [(x0, zbot), (x0, ztop)]
    for i in range(1, segs):
        a = math.pi - math.pi * i / segs
        pts.append((xc + r * math.cos(a), ztop + r * math.sin(a)))
    pts += [(x1, ztop), (x1, zbot)]
    return pts


def _in_door(x, z, door, zbot):
    x0, x1, ztop, r = door
    xc = (x0 + x1) / 2
    if not (x0 < x < x1) or z < zbot - 0.2:
        return False
    return z <= ztop or math.hypot(x - xc, z - ztop) < (x1 - x0) / 2


def _jamb(door, zbot, y0, y1):
    """the reveal of the doorway (model units): the outline swept from y0 (the wall face) to y1 (inside), facing in"""
    x0, x1, ztop, _ = door
    pts = _arch_outline(x0, x1, ztop, zbot - 0.05)
    bm = core.new_bm()
    a = [bm.verts.new((x, y0, z)) for x, z in pts]
    b = [bm.verts.new((x, y1, z)) for x, z in pts]
    xc = (x0 + x1) / 2
    for i in range(len(pts) - 1):
        f = bm.faces.new((a[i], a[i + 1], b[i + 1], b[i]))
        f.normal_update()
        c = f.calc_center_median()
        if f.normal.dot(Vector((xc - c.x, 0, ztop - c.z))) < 0:
            f.normal_flip()
    return bm


def _room(x0, x1, y0, y1, z0, z1):
    """a dark room behind the doorway (model units): a box without its front, faces inward"""
    bm = core.new_bm()
    core.box(bm, (x1 - x0, y1 - y0, z1 - z0), ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), bevel=0.0, segs=1)
    kill = [f for f in bm.faces if f.calc_center_median().y < y0 + 1e-4]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    for f in bm.faces:
        f.normal_flip()
    return bm


def _leaf(w, hr, t, overlap=0.12):
    """a plank door leaf with a half-round top (world units), hinge on the left: x 0 → w, z 0 → hr + w/2, y 0 → -t
    (the wall side at y 0, outside towards -y). Returns (wood bmesh, iron bmesh)."""
    r = w / 2
    pts = _arch_outline(0.0, w, hr, 0.0, segs=18)
    bm = core.new_bm()
    vs = [bm.verts.new((x, 0.0, z)) for x, z in pts]
    f = bm.faces.new(vs)
    ext = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]:
        v.co.y -= t
    bm.normal_update()
    for fc in bm.faces:
        c = fc.calc_center_median()
        if abs(fc.normal.y) > 0.9:
            continue
        if fc.normal.dot(Vector((c.x - r, 0, c.z - hr * 0.6))) < 0:
            fc.normal_flip()
    for fc in bm.faces:
        if abs(fc.normal.y) > 0.9:
            want = -1 if fc.calc_center_median().y < -t / 2 else 1
            if fc.normal.y * want < 0:
                fc.normal_flip()
    # plank grooves: thin dark battens on the outside
    iron = core.new_bm()
    for zz in (hr * 0.18, hr * 0.62):
        core.box(iron, (w * 0.86, 0.07, 0.26), (w * 0.47, -t - 0.035, zz), bevel=0.03)
        core.tube(iron, [Vector((0.02, -t - 0.08, zz)), Vector((0.02, -t + 0.05, zz))], 0.08, sides=8)
    a = 0.0
    ring = [Vector((w - 0.42 + 0.17 * math.cos(a_), -t - 0.1, hr * 0.5 - 0.17 + 0.17 * math.sin(a_))) for a_ in np.linspace(0, 2 * math.pi, 17)]
    core.tube(iron, ring, 0.035, sides=6, cap=False, closed=True)
    core.box(iron, (0.18, 0.06, 0.18), (w - 0.42, -t - 0.03, hr * 0.5), bevel=0.02)
    return bm, iron


def house(sc, src, name, s, ground, door, front, pos, mats, room_box, drop=None):
    """an AI house brought to the set: returns its world matrix M and the hinge position (world)"""
    ob = aimesh.load(src)
    if drop:
        aimesh.drop_loose(ob, *drop)
    x0, x1, ztop, r = door
    zbot = ground
    # the painted door goes: every face in the doorway, behind the wall face
    # ... and every bit of the AI model inside the dark room (pieces of the painted door deeper in, left over round the arch:
    # they showed through the open door — film 050)
    rx0, rx1, ry0, ry1, rz0, rz1 = room_box
    n = aimesh.cut(ob, lambda c, nn: (_in_door(c.x, c.z, door, zbot) and c.y > front + 0.01 and c.y < front + 0.35)
                   or (rx0 + 0.01 < c.x < rx1 - 0.01 and rz0 < c.z < rz1 - 0.01 and ry0 - 0.03 < c.y < ry1 - 0.01))
    print(f'  {name}: {n} door faces cut')
    # faces straddling the outline keep corners inside the opening: brown stubs along the jamb (film 050 feedback) —
    # every such corner goes just outside the outline, hidden behind the jamb
    xc, e, R = (x0 + x1) / 2, 0.006, (x1 - x0) / 2
    nm_ = 0
    for v in ob.data.vertices:
        c = v.co
        if not (front - 0.03 < c.y < front + 0.35) or not _in_door(c.x, c.z, door, zbot):
            continue
        if c.z <= ztop:
            c.x = x0 - e if c.x < xc else x1 + e
        else:
            d = Vector((c.x - xc, c.z - ztop)); d.normalize()
            c.x, c.z = xc + d.x * (R + e), ztop + d.y * (R + e)
        nm_ += 1
    print(f'  {name}: {nm_} doorway corners moved behind the jamb')
    aimesh.fit(ob, s, ground=ground)
    x, z, face = pos
    M = place(x, z, face, 0.0)
    aimesh.finish(sc, ob, name + '.house', M, rough=0.82)
    S = Matrix.Diagonal((s, s, s, 1)) @ Matrix.Translation((0, 0, -ground))
    jb = _jamb(door, zbot, front - 0.005, front + 0.22)
    core.transform(jb, S); core.box_uv(jb, 2.0)
    sc.batch(name + '_jamb', mats['jamb'], ao=False).add(jb, M)
    rm = _room(*room_box)
    core.transform(rm, S); core.box_uv(rm, 3.0)
    sc.batch(name + '_room', mats['room'], ao=False).add(rm, M)
    # the new door leaf on its hinge (left side seen from outside), in front of the wall face
    w = (x1 - x0) * s + 0.4
    hr = (ztop - zbot) * s
    hinge_local = Vector(((x0 * s) - 0.12, (front - 0.015) * s, 0.0))
    wood, iron = _leaf(w, hr, 0.2)
    Mh = M @ Matrix.Translation(hinge_local)
    door_ob = sc.obj('door:' + name, wood, mats['door'], Mh, vcol=False)
    sc.obj('door:' + name + '.iron', iron, mats['iron'], None, parent=door_ob, vcol=False)
    me = door_ob.data
    # wood UVs: planks run up the door
    uv = me.uv_layers.get(core.UV0) or me.uv_layers.new(name=core.UV0)
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (v.x / 2.6 + (v.y if abs(poly.normal.y) < 0.5 else 0), v.z / 2.6)
    hw = Mh.to_translation()
    on = M.to_3x3() @ Vector((0, -1, 0))
    leaf = {'hinge': [round(hw.x, 3), round(-hw.y, 3)], 'length': round(w, 3), 'out': [round(on.x, 3), round(-on.y, 3)]}
    return M, leaf


def build(out_dir, bake=True):
    core.reset()
    sc = Scene(NAME)
    T = core.texset
    sand_t = T('sand', tex.sand, n=512, seed=1)
    stone_t = T('sandstone', tex.sandstone, n=1024, seed=2)
    honey_t = T('honeystone', tex.sandstone, n=1024, seed=52, tint=[(0, '#a9844f'), (0.35, '#c39c62'), (0.7, '#d8b47a'), (1, '#ead09a')])
    bark_t = T('bark', tex.bark, n=512, seed=9)
    leaf_t = T('leaf', tex.leaf, n=256, seed=11)
    beam_t = T('palmwood', tex.wood, n=512, seed=14, planks=1, colors=('#9d7a52', '#7a5636', '#553820'))
    door_t = T('doorwood', tex.wood, n=512, seed=54, colors=('#9a6236', '#7d4b28', '#5e361c'))
    sdoor_t = T('doorwood_red', tex.wood, n=512, seed=55, colors=('#b0503a', '#93402e', '#733022'))

    cx, cz, cf = CELL
    sx, sz, sf = SCHIT
    rx, rz = ROCK
    occl = [(cx, cz, 7.0), (sx, sz, 7.5), (rx, rz, 8.0)]
    gt = ground_textures(occl)
    ground_core(sc, core.material('ground', gt, extras={'detail': 'sand'}))
    ground_far(sc, core.material('ground_far', sand_t, vcol=True, extras={'detail': 'sand'}))

    mat = {
        'rock': core.material('rock', honey_t, vcol=True),
        'cliff': core.material('cliffs', honey_t, color=(1.0, 0.95, 0.9)),
        'stone': core.material('stone', stone_t),
        'bark': core.material('bark', bark_t),
        'twig': core.material('twig', beam_t, color=(0.6, 0.5, 0.42)),
        'shrub': core.material('shrub', None, vcol=True, rough=0.75),
        'grass': core.material('grass', None, vcol=True, rough=0.8, double=True),
    }
    Bt = lambda name, m, **kw: sc.batch(name, mat[m], **kw)
    gy = H
    m_crit = core.material('critter', None, vcol=True, rough=0.55)
    iron = core.material('iron', None, color=(0.16, 0.14, 0.13), rough=0.45, metal=0.6)
    reserve = []

    # ------------------------------------------------ the two cells (AI houses), their doors on hinges
    cmats = {'jamb': core.material('jamb_stone', honey_t, color=(0.82, 0.74, 0.64)), 'room': core.material('room_dark', None, color=(0.16, 0.11, 0.08), rough=0.95),
             'door': core.material('door_wood', door_t), 'iron': iron}
    Mc, hc = house(sc, 'chilie-piatra', 'cell', CS, C_GROUND, C_DOOR, C_FRONT, CELL, cmats, (-0.66, 0.66, C_FRONT + 0.22, 0.62, C_GROUND - 0.05, 0.42))
    smats = {'jamb': core.material('jamb_white', None, color=(0.93, 0.9, 0.84), rough=0.85), 'room': cmats['room'],
             'door': core.material('door_red', sdoor_t), 'iron': iron}
    Ms, hs = house(sc, 'chilie-alba', 'schit', SS, S_GROUND, S_DOOR, S_FRONT, SCHIT, smats, (-0.5, 0.6, S_FRONT + 0.22, 0.6, S_GROUND - 0.05, 0.05),
                   drop=(40, 0.45))

    def walls(nm, M, s, xl, xr, yf, yb, door, h):
        """thin collision walls (model x / y bounds), the doorway free"""
        t_ = 0.7
        def box(k, ax, bx, ay, by):
            p0 = M @ Vector(((ax + bx) / 2 * s, (ay + by) / 2 * s, 0))
            ang = math.degrees(math.atan2(M[1][0], M[0][0]))
            sc.col_box(f'{nm}-{k}', ((bx - ax) * s, h, (by - ay) * s), p0.x, -p0.y, ang)
        tm = t_ / s
        box('back', xl, xr, yb - tm, yb)
        box('left', xl, xl + tm, yf, yb)
        box('right', xr - tm, xr, yf, yb)
        box('front-l', xl, door[0] - 0.03, yf, yf + tm)
        box('front-r', door[1] + 0.03, xr, yf, yf + tm)
        p0 = M @ Vector(((door[0] + door[1]) / 2 * s, (yf + tm / 2) * s, 0))
        lin = (door[2] + (door[1] - door[0]) / 2 - (C_GROUND if nm == 'cell' else S_GROUND)) * s
        sc.col_box(f'{nm}-lintel', ((door[1] - door[0] + 0.06) * s, h - lin, tm * s), p0.x, -p0.y, math.degrees(math.atan2(M[1][0], M[0][0])), lin)

    walls('cell', Mc, CS, -0.78, 0.78, C_FRONT - 0.01, 0.86, C_DOOR, 9.0)
    walls('schit', Ms, SS, -0.66, 0.78, S_FRONT - 0.01, 0.86, S_DOOR, 9.0)
    reserve += [(cx, cz, 7.6), (sx, sz, 8.0)]

    # inside the stone cell: a reed mat and a little shelf with a cross (seen through the open door)
    mt = core.new_bm(); core.box(mt, (2.2, 3.2, 0.08), (0, 0, 0.04), bevel=0.03)
    sc.batch('mat', core.material('mat', T('weave', tex.weave, n=512, seed=6, cells=12)), ao=False).add(mt, place(cx + 1.5, cz - 1.0, 0), uv_box=1.2)
    sh = core.new_bm(); core.box(sh, (1.8, 0.6, 0.12), (0, 0, 3.4), bevel=0.03)
    core.box(sh, (0.12, 0.1, 0.9), (0, 0, 4.0), bevel=0.02); core.box(sh, (0.55, 0.1, 0.12), (0, 0, 4.18), bevel=0.02)
    sc.batch('shelf', core.material('shelf', beam_t), ao=False).add(sh, place(DOOR_C[0], cz - 4.0, 0))

    # ------------------------------------------------ the Rock: a big rounded outcrop of honey stone, boulders at its foot
    M = place(rx, rz, -20, -0.6)
    big = core.rock(81, size=(8.0, 6.5, 10.5), facets=7, detail=0.1, subdiv=4, sink=0.12)
    Bt('rock', 'rock', vcol=True, ao_density=14).add(big, M, color=(0.92, 0.88, 0.84), uv_box=4.0)
    sc.add_col('rock', core.hull_of(core.rock(81, size=(8.0, 6.5, 10.5), facets=7, detail=0.1, subdiv=1, sink=0.12), M))
    reserve.append((rx, rz, 9.5))
    for k, (ox, oz, s_, sd) in enumerate(((-8.0, 4.5, 2.6, 82), (7.5, 3.0, 3.4, 83), (-4.5, 7.0, 1.4, 84), (10.0, -4.0, 4.0, 85), (2.0, 7.5, 1.1, 86), (-10.5, -3.0, 3.0, 87))):
        x, z = rx + ox, rz + oz
        bb = core.rock(sd, size=(s_ * 1.2, s_, s_ * 0.85), facets=6, detail=0.12, subdiv=3, sink=0.2)
        Mb = place(x, z, k * 61.0, gy(x, z))
        tint = 0.82 + 0.06 * (k % 3)
        Bt('rock', 'rock', vcol=True).add(bb, Mb, color=(tint, tint * 0.96, tint * 0.92), uv_box=3.0)
        sc.add_col(f'rockfoot{k}', core.hull_of(core.rock(sd, size=(s_ * 1.2, s_, s_ * 0.85), facets=6, detail=0.12, subdiv=1, sink=0.2), Mb))
        reserve.append((x, z, s_ * 1.2 + 0.5))
    lz = (rx - 8.0, rz + 4.5, 2.6)
    sc.obj('lizard', critters.lizard((0.85, 0.62, 0.3)), m_crit, place(lz[0], lz[1] + 0.2, 40, lz[2] * 0.72), props={'anim': 'lizard'})

    # doves on the stone cell's roof (they peck about)
    for k, (lx, ly, rz_) in enumerate(((-0.45, -0.2, 20), (0.15, 0.1, -150), (0.5, -0.35, 70))):
        top = (0.79 - C_GROUND) * CS
        v = Mc @ Vector((lx * CS, ly * CS, top))
        dvb, dvh, dvp = critters.dove((0.96, 0.95, 0.93) if k != 1 else (0.72, 0.72, 0.78), (0.78, 0.78, 0.8))
        dv = sc.obj(f'roofdove{k}', dvb, m_crit, Matrix.Translation(v) @ Matrix.Rotation(math.radians(rz_), 4, 'Z'))
        sc.obj(f'roofdove{k}.head', dvh, m_crit, Matrix.Translation(dvp), parent=dv, props={'anim': 'peck', 'freq': 0.6 + 0.25 * k, 'phase': k * 2.0})

    # ------------------------------------------------ things to spot (the user: „e prea gol pt copii”)
    # AI set dressing (assets/3d/piatra-*.glb, made with tools/image-to-3d.mjs): fitted to a height, pivot on the ground, a
    # collision box from its footprint; a model that is not there yet is skipped
    ai_cache = {}

    def ai_piece(name, x, z, face, height, k=0, col=True, sink=0.01):
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
            ai_cache[name] = (aimesh.finish(sc, ob, f'{name}.{k}', place(x, z, face, gy(x, z)), rough=0.6), lo2, hi2)
        else:
            aimesh.share(sc, ai_cache[name][0], f'{name}.{k}', place(x, z, face, gy(x, z)))
        _, lo2, hi2 = ai_cache[name]
        w, d = hi2[0] - lo2[0], hi2[1] - lo2[1]
        if col:
            sc.col_box(f'{name}{k}', (w * 0.9, height, d * 0.9), x, z, face)
        reserve.append((x, z, max(w, d) / 2 + 0.3))

    ai_piece('piatra-umbrar', -6.2, -10.0, 15, 4.8, sink=0.04)            # a reed shade left of the cell, baskets under it
    ai_piece('piatra-cosuri', -3.3, -8.6, -20, 1.4)
    ai_piece('piatra-banca', -3.6, -6.2, 10, 0.9)
    ai_piece('piatra-curmale', -6.6, -4.2, 0, 0.55, col=False)
    ai_piece('piatra-cruce', -9.8, -7.0, 20, 3.2)
    ai_piece('piatra-lemne', 12.4, -8.8, -25, 1.9)               # firewood behind the jars
    for k, (x, z, f) in enumerate(((13.6, -4.4, 0), (-12.5, -1.5, 70), (17.5, 9.0, 140), (-19.5, 33.0, 30), (-7.5, 34.5, 200), (-15.5, 15.5, 100))):
        ai_piece('piatra-tufa', x, z, f, 1.7, k=k, sink=0.06)
    ai_piece('piatra-cosuri', -18.6, 33.6, 40, 1.4, k=1)
    ai_piece('piatra-banca', -9.2, 32.0, 175, 0.9, k=1)

    # moving animals (kit pieces: every animal moves all the time)
    goats = [(-16.0, -8.0, 60, (0.96, 0.94, 0.9), (0.55, 0.36, 0.22), True, 1.0),
             (-18.5, -4.5, -30, (0.42, 0.3, 0.22), (0.95, 0.92, 0.86), True, 1.0),
             (-16.8, -5.9, 100, (0.98, 0.96, 0.92), (0.3, 0.24, 0.2), False, 0.62)]
    for k, (gx2, gz2, gf, coat, patch, horns, s_) in enumerate(goats):
        gb, gh, gp, gt_, gtp = critters.goat_parts(coat, patch, horns=horns, s=s_)
        gk = sc.obj(f'goat{k}', gb, m_crit, place(gx2, gz2, gf, gy(gx2, gz2)))
        sc.obj(f'goat{k}.head', gh, m_crit, Matrix.Translation(gp), parent=gk, props={'anim': 'browse', 'seed': 5 + 3 * k})
        sc.obj(f'goat{k}.tail', gt_, m_crit, Matrix.Translation(gtp), parent=gk, props={'anim': 'swish', 'seed': 7 + 3 * k})
        sc.col_box(f'goat{k}', (1.0, 1.9 * s_, 1.9 * s_), gx2, gz2, gf)
        reserve.append((gx2, gz2, 1.6))
    hens = [(-7.6, -2.6, 30, 'brown', 0.9), (-5.0, -3.4, -40, 'white', 0.7), (-8.8, 26.8, 120, 'brown', 0.9), (-18.6, 26.4, 200, 'white', 0.9)]
    for k2, (hx2, hz2, hf2, var, rad) in enumerate(hens):
        cols = ((0.72, 0.36, 0.16), (0.9, 0.62, 0.32), (0.5, 0.22, 0.1)) if var == 'brown' else ((0.97, 0.96, 0.93), (1.0, 1.0, 0.98), (0.85, 0.85, 0.83))
        hb, hh, hp_ = critters.hen(*cols)
        root = sc.obj(f'hen{k2 + 1}', hb, m_crit, place(hx2, hz2, hf2, gy(hx2, hz2)), props={'anim': 'hen', 'radius': rad, 'seed': 17 + 7 * k2})
        sc.obj(f'hen{k2 + 1}.head', hh, m_crit, Matrix.Translation(hp_), parent=root)
        reserve.append((hx2, hz2, rad + 0.6))
    cmx, cmz = 21.5, 3.0
    cbody, cneck, cnp, ctail, ctp = critters.camel_parts()
    cm = sc.obj('camel', cbody, m_crit, place(cmx, cmz, -110, gy(cmx, cmz)))
    sc.obj('camel.neck', cneck, m_crit, Matrix.Translation(cnp), parent=cm, props={'anim': 'ruminate'})
    sc.obj('camel.tail', ctail, m_crit, Matrix.Translation(ctp), parent=cm, props={'anim': 'swish'})
    sc.col_box('camel', (2.2, 3.4, 4.6), cmx, cmz, -110)
    reserve.append((cmx, cmz, 3.4))
    tx, tz = 14.5, 15.0
    tb_, (th_, tp_), tlegs = critters.tortoise_parts()
    to_ = sc.obj('tortoise', tb_, m_crit, place(tx, tz, -60, gy(tx, tz), 1.6), props={'anim': 'hen', 'radius': 1.1, 'speed': 0.2, 'legs': 1})
    sc.obj('tortoise.head', th_, m_crit, Matrix.Translation(tp_), parent=to_, props={'anim': 'peek'})
    for k, (lg, lp) in enumerate(tlegs):
        sc.obj(f'tortoise.leg{k}', lg, m_crit, Matrix.Translation(lp), parent=to_)
    sc.col_box('tortoise', (3.4, 0.8, 3.6), tx, tz, 0)
    reserve.append((tx, tz, 2.2))
    cb, ct, tp = critters.cat()
    ck = sc.obj('cat', cb, m_crit, place(-16.9, 30.0, 200, gy(-16.9, 30.0)))
    sc.obj('cat.tail', ct, m_crit, Matrix.Translation(tp), parent=ck, props={'anim': 'tail', 'freq': 0.35})
    sc.col_box('cat', (1.0, 1.0, 1.4), -16.9, 30.0, 200)
    reserve.append((-16.9, 30.0, 1.0))
    # a dovecote beside the schit, doves on its perches
    dxc, dzc = -25.0, 31.0
    dc = critters.dovecote(seed=5, r=1.8, h=7.2)
    Md = place(dxc, dzc, 30, gy(dxc, dzc))
    sc.batch('dovecote', core.material('dovecote_plaster', T('whitewash', tex.plaster, n=512, seed=31, colors=('#fdfaf3', '#f4ecdf', '#e9dcc8'), brick='#e2cfb4'), vcol=True)).add(dc['plaster'], Md, uv_box=4.0)
    sc.batch('dovecote_holes', m_crit, ao=False, vcol=True).add(dc['holes'], Md)
    sc.batch('dovecote_perch', core.material('perch', beam_t)).add(dc['perch'], Md)
    for j, (ppx, ppy, ppz, ph) in enumerate(dc['perches']):
        dvb, dvh, dvp = critters.dove()
        dv = sc.obj(f'dove{j}', dvb, m_crit, Md @ Matrix.Translation((ppx, ppy, ppz)) @ Matrix.Rotation(math.radians(ph), 4, 'Z'))
        sc.obj(f'dove{j}.head', dvh, m_crit, Matrix.Translation(dvp), parent=dv, props={'anim': 'peck', 'freq': 0.5 + 0.13 * j, 'phase': j * 1.7})
    sc.col_box('dovecote', (4.0, 8.0, 4.0), dxc, dzc, 0)
    reserve.append((dxc, dzc, 2.8))
    m_wing = core.material('wing', None, vcol=True, rough=0.5, double=True)
    for k, (bx_, by_, bz_, c1, c2) in enumerate(((13.6, 1.9, -3.2, (1.0, 0.85, 0.2), (0.95, 0.45, 0.15)), (-12.0, 1.7, -0.4, (1.0, 1.0, 0.97), (0.55, 0.75, 1.0)),
                                                (-19.0, 1.8, 31.5, (0.98, 0.55, 0.2), (0.35, 0.2, 0.1)), (16.8, 1.8, 10.0, (0.95, 0.45, 0.7), (0.6, 0.2, 0.5)))):
        body, wl_, wr_ = critters.butterfly(c1, c2)
        g = sc.obj(f'butterfly{k}', body, m_crit, Matrix.Translation(B(bx_, by_, bz_)), props={'anim': 'butterfly', 'radius': 1.3, 'freq': 0.3 + 0.04 * k, 'phase': k * 1.6, 'height': 0.35})
        sc.obj(f'butterfly{k}.wing.L', wl_, m_wing, Matrix.Identity(4), parent=g)
        sc.obj(f'butterfly{k}.wing.R', wr_, m_wing, Matrix.Identity(4), parent=g)
    # a wooden cross on the ridge of the stone cell's roof
    crs = core.new_bm()
    core.box(crs, (0.22, 0.18, 1.7), (0, 0, 0.85), bevel=0.03); core.box(crs, (0.9, 0.18, 0.2), (0, 0, 1.25), bevel=0.03)
    core.box(crs, (0.5, 0.18, 0.14), (0, 0, 0.55), bevel=0.03, M=Matrix.Rotation(-0.35, 4, 'Y'))
    sc.batch('roofcross', core.material('roofcross', beam_t)).add(crs, Mc @ Matrix.Translation((0.0, -0.35 * CS, (0.80 - C_GROUND) * CS)))

    # ------------------------------------------------ anchors
    anchors_xz = []

    def A(name, x, z, face, note=None):
        sc.anchor(name, x, z, face, round(gy(x, z), 3), note)
        anchors_xz.append((x, z))

    dx, dz = DOOR_C
    A('cell', dx, dz + 2.4, 0.0, 'in front of the stone cell door, facing out (towards the camera side)')
    A('cell-door', dx, dz - 0.3, 0.0, 'standing in the doorway, facing out (enter / leave the cell)')
    A('cell-in', dx + 0.3, dz - 2.2, 0.0, 'inside the stone cell, just behind the closed door')
    A('cell-deep', dx + 1.2, dz - 4.0, 180.0, 'deep inside the stone cell, facing the shelf with the cross (praying, seen through the open door)')
    A('yard', dx + 4.0, dz + 6.0, 0.0, 'the dry yard in front of the stone cell')
    A('center', 2.0, 2.0, 0.0, 'the middle of the yard (the acting area)')
    A('rock', rx - 7.0, rz + 9.5, 135.0, 'at the foot of the Rock, facing it')
    sdx, sdz = DOOR_S
    A('schit', sdx + 0.3 * math.sin(_sa) * 0, sdz - 2.4, 180.0, 'in front of the white cell of the schit, facing away from it (towards the Rock, -Z)')
    A('schit-door', sdx, sdz + 0.3, 180.0, 'in the doorway of the white cell, facing out (-Z)')
    A('schit-in', sdx - 0.3, sdz + 2.2, 180.0, 'inside the white cell, just behind its closed door')
    for nm, t_k in (('path-near', 0.72), ('path-mid', 0.45), ('path-far', 0.2)):
        i = int(t_k * (len(PATH) - 1))
        (ax, az), (bx2, bz2) = PATH[i], PATH[i + 1]
        A(nm, ax, az, math.degrees(math.atan2(bx2 - ax, bz2 - az)), 'on the path from the schit to the Rock, facing along it towards the stone cell')
    A('offstage-left', -62.0, 15.0, 90.0, 'out of frame on the left path (enter walking +X)')
    A('offstage-front', 6.0, 46.0, 180.0, 'far towards the camera side (enter walking -Z)')

    def free(x, z, r):
        if path_dist(x, z) < r + 0.6:
            return False
        for qx, qz, qr in reserve:
            if math.hypot(x - qx, z - qz) < qr + r:
                return False
        for ax, az in anchors_xz:
            if math.hypot(x - ax, z - az) < 2.5 + r:
                return False
        if -10 < x < 15 and -6 < z < 12:      # the yard stays clear
            return False
        if -22 < x < -2 and 24 < z < 34:      # before the schit
            return False
        return True

    # ------------------------------------------------ far honey cliffs all round
    for k_, (mx_, mz_, w_, d_, h_) in enumerate(((-70, -140, 60, 30, 12), (30, -160, 70, 30, 15), (110, -120, 50, 30, 10),
                                                  (-150, 60, 50, 40, 11), (160, 80, 60, 40, 12), (20, 190, 80, 40, 13))):
        mb = pieces.mesa(860 + k_, w_, d_, h_, tile=7.0)
        sc.batch('cliffs', mat['cliff'], ao=False).add(mb, place(mx_, mz_, math.degrees(math.atan2(-mx_, -mz_)) * 0.4, gy(mx_, mz_) - 1.5))

    # ------------------------------------------------ boulders, dry thorn bushes, dry tufts, pebbles, a hare
    rng = np.random.default_rng(7)
    rocks = [(-24.0, -8.0, 2.4), (-27.0, -4.5, 1.3), (30.0, -6.0, 2.0), (-18.0, 14.0, 1.4), (24.0, 14.5, 1.8), (-34.0, 22.0, 2.6),
             (14.0, 30.0, 2.2), (30.0, 34.0, 3.0), (-36.0, -18.0, 3.4), (2.0, -26.0, 2.6), (-10.0, -24.0, 3.0), (-2.0, 40.0, 2.0)]
    for i, (x, z, s) in enumerate(rocks):
        if not free(x, z, s * 0.8):
            continue
        st = core.rock(500 + i, size=(s, s * 0.8, s * 0.7), facets=6, detail=0.12, subdiv=3, sink=0.25)
        Mr = place(x, z, i * 47.0, gy(x, z))
        k = 0.88 + 0.12 * rng.random()
        Bt('rocks', 'rock', vcol=True).add(st, Mr, color=(k, k, k), uv_box=3.0)
        sc.add_col(f'boulder{i}', core.hull_of(core.rock(500 + i, size=(s, s * 0.8, s * 0.7), facets=6, detail=0.12, subdiv=1, sink=0.25), Mr))
        reserve.append((x, z, s + 0.4))
    hx_, hz_ = -20.0, 4.0
    bb, bh, bp = critters.bunny((0.86, 0.72, 0.52), (1.0, 0.96, 0.9))
    bu = sc.obj('hare', bb, m_crit, place(hx_, hz_, 120, gy(hx_, hz_), 1.2), props={'anim': 'sway', 'amp': 0.02, 'freq': 0.6})
    sc.obj('hare.head', bh, m_crit, Matrix.Translation(bp), parent=bu, props={'anim': 'peck', 'freq': 0.7, 'phase': 0.4})
    sc.col_box('hare', (0.8, 1.0, 0.8), hx_, hz_, 0)
    reserve.append((hx_, hz_, 1.0))
    r2 = np.random.default_rng(137)
    nt = 0
    for i in range(6000):
        if nt >= 110:
            break
        x = -45 + 90 * r2.random(); z = -40 + 90 * r2.random()
        if not free(x, z, 0.4):
            continue
        nt += 1
        Bt('tufts', 'grass', vcol=True, ao=False).add(pieces.tuft(1500 + i, r=0.4 + 0.2 * r2.random(), h=0.5 + 0.3 * r2.random(), dry=0.85), place(x, z, r2.random() * 360, gy(x, z)))
    nb = 0
    for i in range(1500):
        if nb >= 22:
            break
        x = -44 + 88 * r2.random(); z = -38 + 86 * r2.random()
        if not free(x, z, 1.4):
            continue
        nb += 1
        bsh = pieces.bush(seed=700 + i, r=0.8 + 0.6 * r2.random(), h=0.9 + 0.7 * r2.random(), green=(0.55, 0.52, 0.3))
        Mb = place(x, z, r2.random() * 360, gy(x, z))
        Bt('twigs', 'twig', ao=False).add(bsh['twig'], Mb)
        Bt('shrubs', 'shrub', vcol=True, ao=False).add(bsh['shrub'], Mb)
        sc.col_box(f'bush{nb}', (1.6, 1.4, 1.6), x, z, 0)
        reserve.append((x, z, 1.6))
    # a few dry date palms far round about (broad leaves, house rule)
    palms = [(-30.0, -20.0, 10.0, (0.3, 0.2)), (34.0, -24.0, 11.0, (-0.3, 0.2)), (-30.0, 34.0, 9.5, (0.4, -0.2)), (26.0, 40.0, 10.5, (-0.3, -0.2))]
    m_crown = core.material('crown', leaf_t, vcol=True, double=True, rough=0.6)
    for i, (x, z, h, lean) in enumerate(palms):
        p = pieces.palm(seed=90 + i, height=h, lean=lean, fronds=11)
        Mp = place(x, z, i * 37.0, gy(x, z) - 0.05)
        Bt('palm_bark', 'bark', ao_density=10).add(p['bark'], Mp)
        Bt('palm_bark', 'bark').add(p['bark_boss'], Mp, uv_box=1.0)
        cbm = core.new_bm()
        for kk in ('leaf', 'dry', 'dates'):
            core.merge(cbm, p[kk])
        core.transform(cbm, Matrix.Translation(-p['top']))
        sc.obj(f'palm{i}.crown', cbm, m_crown, Mp @ Matrix.Translation(p['top']), props={'anim': 'sway', 'amp': 0.035, 'freq': 0.45 + 0.07 * i, 'phase': i * 1.3})
        sc.col_box(f'palm{i}', (1.2, h, 1.2), x, z, 0)
    # little desert flowers round the edges (yellow, white, pink)
    pal = ((1.0, 0.85, 0.2), (1.0, 1.0, 0.95), (0.98, 0.45, 0.55), (0.95, 0.6, 0.2))
    nf = 0
    for i in range(5000):
        if nf >= 70:
            break
        x = -42 + 84 * r2.random(); z = -34 + 80 * r2.random()
        if not free(x, z, 0.5):
            continue
        nf += 1
        Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(2600 + i, n=5 + int(r2.random() * 5), radius=0.45, palette=pal), place(x, z, 0, gy(x, z)))
    # flower clumps at the yard's edges, off every walk (the yard itself stays free)
    for k, (fx2, fz2) in enumerate(((-9.0, -2.5), (-4.6, -5.0), (11.4, -6.0), (14.8, -2.0), (-11.0, 3.0), (11.0, 10.0), (-17.0, 28.5), (-10.5, 30.0))):
        Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(2900 + k, n=9, radius=0.55, palette=pal), place(fx2, fz2, 0, gy(fx2, fz2)))
    m_peb = core.material('pebble', stone_t, vcol=True)
    for i in range(40):
        x = -43 + 86 * r2.random(); z = -36 + 80 * r2.random()
        if not free(x, z, 0.4):
            continue
        sc.batch('pebbles', m_peb, vcol=True, ao=False).add(pieces.pebbles(1200 + i, 5, 0.9, size=0.1), place(x, z, 0, gy(x, z)), uv_box=1.0)

    sc.finalize()
    if bake:
        sc.bake_ao(samples=40, distance=5.0, max_size=2048, blur=0.6, gamma=1.15, floor=0.18)

    meta = {
        'name': NAME,
        'title': 'Piatra (chilia de piatră a lui Avva Moise) și schitul',
        'units': 'engine units (figure 4.2 tall), three.js Y-up, +Z towards the usual camera',
        'anchors': sc.anchors,
        'seats': sc.seats,
        'doors': ['cell', 'schit'],
        'doorLeaves': {'cell': hc, 'schit': hs},
        'bounds': [[-60, -1.5, -50], [60, 16, 56]],
        'acting': {'rect': [[-10, -6], [15, 12]], 'paths': [[[round(a, 2), round(b, 2)] for a, b in p] for p in (PATH, PATH_L)]},
        'skies': ['morning', 'day', 'evening'],
        'sky': {'day': {'sunAz': -30, 'sunElev': 50}, 'morning': {'sunAz': -60, 'sunElev': 18}, 'evening': {'sunAz': 50, 'sunElev': 10}},
        'shadow': {'center': [0, 6], 'radius': 50},
        'shots': {
            'wide': {'pos': [2, 6.0, 30], 'target': [4, 3.0, -8], 'fov': 42, 'note': 'the yard, the stone cell, the Rock on the right'},
            'schit': {'pos': [-12, 4.0, 14], 'target': [-14, 3.5, 34], 'fov': 40, 'note': 'the white cell of the schit (looking +Z)'},
        },
        'notes': ('Stone cell (chilie-piatra ×6.5): centre [4, -11], doorway at [%.2f, %.2f] (door:cell, hinge on the left, opens '
                  'outwards); inside: anchors cell-in, cell-deep. White cell of the schit (chilie-alba ×7.5) at [-14, 36], turned '
                  '172° (its door towards -Z) at [%.2f, %.2f] (door:schit). The Rock [18.5, -16]. Collision: col:cell-*, '
                  'col:schit-*, col:rock*, col:boulderN, col:palmN, col:bushN.') % (DOOR_C[0], DOOR_C[1], DOOR_S[0], DOOR_S[1]),
    }
    os.makedirs(out_dir, exist_ok=True)
    sc.export(os.path.join(out_dir, NAME + '.glb'))
    with open(os.path.join(out_dir, NAME + '.json'), 'w') as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    return meta
