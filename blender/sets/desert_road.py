"""Set `desert-road`: a sandy road through the Egyptian desert between two monks' cells.

three.js layout (x right, z towards the usual camera, y up; 1 unit = engine unit, figure 4.2 tall):
  * the road runs left → right across the frame at z ≈ 3..5 (centre line `road_z(x)`, 4.6 wide),
  * cell 1 (Zenon) at the back left (-17, -10), cell 2 (Pavel) at the back right (17, -10.5), both turned a little to
    the middle; a short path from each door down to the road,
  * a patch of rough stones on the front edge of the road at x ≈ 3 (where the basket falls),
  * palms behind the cells and at the back, bushes / grass tufts / pebbles only outside the paths and acting zones,
  * rolling dunes all around and flat-topped sandstone cliffs on the horizon.
"""
import math
import os
import json
import numpy as np
from mathutils import Matrix, Vector, noise

from kit import core, tex, pieces, critters
from kit.core import B, place, Batch, Scene

NAME = 'desert-road'
ROAD_W = 4.6
CORE = (-44.0, 44.0, -30.0, 22.0)   # x0, x1, z0, z1 of the uniquely textured ground
TEX_W, TEX_H = 2048, 1024


def road_z(x):
    return 3.6 + 1.6 * math.sin(x * 0.06 + 0.5)


def road_face(x):
    """Heading along the road towards +X (degrees)."""
    dz = road_z(x + 0.5) - road_z(x - 0.5)
    return math.degrees(math.atan2(1.0, dz))


CELLS = [  # name, x, z, face
    ('cell1', -17.0, -10.0, 16.0),
    ('cell2', 17.5, -10.5, -14.0),
]
CELL_D = 7.0


def door_point(c, out=0.0):
    _, x, z, f = c
    a = math.radians(f)
    k = CELL_D / 2 + out
    return x + math.sin(a) * k, z + math.cos(a) * k


def side_path(c):
    """Polyline from the door of the cell down to the road."""
    x0, z0 = door_point(c, 0.5)
    x1 = x0 + (6.0 if x0 < 0 else -6.0)
    pts = []
    for i in range(13):
        t = i / 12
        x = x0 + (x1 - x0) * t * t
        z = z0 + (road_z(x1) - z0) * t
        pts.append((x, z))
    return pts


STONES = (3.2, None)  # x of the stone patch; z = road front edge


def stones_center():
    x = STONES[0]
    return x, road_z(x) + ROAD_W / 2 - 0.3


def dist_to_poly(px, pz, pts):
    best = 1e9
    for (ax, az), (bx, bz) in zip(pts[:-1], pts[1:]):
        dx, dz = bx - ax, bz - az
        L2 = dx * dx + dz * dz
        t = 0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (pz - az) * dz) / L2))
        best = min(best, math.hypot(px - ax - t * dx, pz - az - t * dz))
    return best


ROAD_PTS = [(x, road_z(x)) for x in np.arange(-260, 261, 2.0)]
PATHS = [side_path(c) for c in CELLS]


def path_dist(x, z):
    """Signed-ish distance to the walked surfaces: road (minus half width) and side paths (half width 1.4)."""
    d = abs(z - road_z(x)) - ROAD_W / 2   # the road is nearly horizontal: vertical distance is good enough
    for p in PATHS:
        d = min(d, dist_to_poly(x, z, p) - 1.4)
    return d


def H(x, z):
    """Ground height (three.js coords). Flat on paths/anchors, gentle undulation near, dunes rising far away."""
    d = path_dist(x, z)
    near = noise.fractal(Vector((x * 0.045, z * 0.045, 0.3)), 0.5, 2.0, 3) * 0.45
    flat = min(1.0, max(0.0, (d - 0.5) / 6.0))
    # cells sit on a flat pad
    for c in CELLS:
        flat *= min(1.0, max(0.0, (math.hypot(x - c[1], z - c[2]) - 6.5) / 5.0))
    sx, sz = stones_center()
    flat *= min(1.0, max(0.0, (math.hypot(x - sx, z - sz) - 2.5) / 3.0))
    hgt = near * flat
    # dunes: outside the acting rectangle they rise into long wind-shaped ridges
    ox = max(0.0, abs(x) - 36.0); oz = max(0.0, -z - 22.0) + max(0.0, z - 16.0)
    o = math.hypot(ox, oz)
    if o > 0:
        k = min(1.0, o / 40.0) ** 1.4
        ridge = 1 - abs(noise.noise(Vector((x * 0.012 + 3.1, z * 0.02, 1.7))))
        ridge2 = 1 - abs(noise.noise(Vector((x * 0.025 + 9.3, z * 0.035, 4.2))))
        dune = (ridge ** 2.2 * 14.0 + ridge2 ** 2 * 5.0 + noise.fractal(Vector((x * 0.01, z * 0.01, 7.0)), 0.5, 2.0, 3) * 3.0)
        hgt += k * max(0.0, dune) * min(1.0, o / 18.0)
    return hgt


# ---------------------------------------------------------------- ground meshes
def ground_core(sc, mat):
    x0, x1, z0, z1 = CORE
    nx, nz = int(x1 - x0), int(z1 - z0)
    bm = core.new_bm()
    uvl = bm.loops.layers.uv[core.UV0]
    verts = [[bm.verts.new(B(x0 + i, H(x0 + i, z0 + j), z0 + j)) for i in range(nx + 1)] for j in range(nz + 1)]
    for j in range(nz):
        for i in range(nx):
            # three z increases with j; Blender y = -z → keep faces pointing up (counter-clockwise seen from +Z Blender)
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
    return verts


def ground_far(sc, mat):
    """Rings from the core border outwards (same border vertices → no cracks), dunes, UV = world / 9."""
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
            # expand the border point outward by s (rectangle grows into a rounded shape)
            dx, dz = bx - cx, bz - cz
            ex = dx / hw if hw else 0; ez = dz / hd if hd else 0
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
            f = bm.faces.new((a, b_, c, d))
    bm.normal_update()
    up = sum(f.normal.z for f in bm.faces)
    if up < 0:
        for f in bm.faces:
            f.normal_flip()
    for f in bm.faces:
        for l in f.loops:
            p = l.vert.co
            l[uvl].uv = (p.x / 9.0, p.y / 9.0)
            # vertex colour: sunlit dune crests lighter, troughs a bit pinker
            hh = p.z
            nz = noise.noise(Vector((p.x * 0.03, p.y * 0.03, 2.0)))
            k = 0.93 + 0.05 * nz + min(0.07, hh * 0.006)
            l[cl] = (min(1, k * 1.0), min(1, k * 0.975), min(1, k * 0.95), 1)
    b = Batch('ground_far', mat, ao=False, vcol=True)
    b.bm.free(); b.bm = bm
    sc.batches['ground_far'] = b


def ground_textures(occluders):
    """Unique albedo / normal / roughness for the core ground (2048 x 1024): sand colour patches, wind ripples,
    the compacted road and paths (lighter, no ripples, faint wheel/foot ruts), damp darker sand around the stones
    and at the foot of the walls. occluders = [(x, z, radius)] where the ground darkens a little (contact)."""
    x0, x1, z0, z1 = CORE
    W, Hh = TEX_W, TEX_H
    xs = x0 + (np.arange(W) + 0.5) / W * (x1 - x0)
    zs = z0 + (np.arange(Hh) + 0.5) / Hh * (z1 - z0)
    X, Z = np.meshgrid(xs, zs)          # row j = z (top row = z0 → V=1 at top: matches the UV mapping above)
    # path distance on a coarse grid then upsampled (fast)
    cs = 4
    Xc, Zc = X[::cs, ::cs], Z[::cs, ::cs]
    D = np.vectorize(path_dist)(Xc, Zc)
    D = np.kron(D, np.ones((cs, cs)))[:Hh, :W]
    D = tex.blur(D, 2.0)
    road = tex.smooth(0.7, -0.6, D)              # 1 on the road / paths, soft edge
    shoulder = tex.smooth(2.2, 0.2, D) * (1 - road)
    rng_seed = 101
    n1 = tex.fbm(Hh, rng_seed, 3.0, 1, 40, m=W)
    n2 = tex.fbm(Hh, rng_seed + 1, 1.5, 20, 400, m=W)
    grain = tex.fbm(Hh, rng_seed + 2, 0.0, 300, m=W)
    # wind ripples: wavelength ≈ 1.3 units, crests running roughly along z with a curving warp
    warp = tex.fbm(Hh, rng_seed + 3, 3.2, 1, 12, m=W) * 3.0
    ph = (X * 0.92 + Z * 0.35 + warp) / 1.3 * 2 * np.pi
    rip = np.sin(ph) + 0.35 * np.sin(2 * ph + 1.0)
    rip_amp = (1 - road) * (1 - 0.6 * shoulder) * (0.6 + 0.4 * tex.smooth(-0.5, 1.0, n1))
    # ruts and footprints on the road
    dz = Z - np.vectorize(road_z)(X[0:1, :]).repeat(Hh, 0)
    ruts = (np.exp(-((dz - 0.9) / 0.28) ** 2) + np.exp(-((dz + 0.9) / 0.28) ** 2)) * road * (0.6 + 0.4 * tex.norm01(n2))
    f1, f2, _ = tex.voronoi(256, rng_seed + 5, 900, m=512)
    fp = np.kron(tex.smooth(0.22, 0.05, f1), np.ones((4, 4)))[:Hh, :W]
    prints = fp * road * tex.smooth(0.3, 0.9, tex.norm01(n1)) * 0.6
    # colour
    sand = tex.ramp(tex.norm01(n1 * 0.8 + n2 * 0.2), [(0, '#d99852'), (0.45, '#e9b26e'), (1, '#f5cc8c')])
    pathc = tex.ramp(tex.norm01(n2 * 0.6 + n1 * 0.4), [(0, '#d6a874'), (0.5, '#e3bb8a'), (1, '#eccb9c')])
    col = sand * (1 - road[..., None]) + pathc * road[..., None]
    col *= (1 + 0.035 * rip[..., None] * rip_amp[..., None])
    col *= (1 - 0.09 * ruts[..., None]) * (1 - 0.07 * prints[..., None])
    col *= (1 + 0.05 * grain[..., None])
    sp = (grain > 2.5)[..., None]
    col = np.where(sp, col * 0.8, col)
    # darker around the stone patch and the foot of the cells
    dark = np.zeros_like(X)
    for (ox, oz, r) in occluders:
        dark = np.maximum(dark, np.exp(-((np.hypot(X - ox, Z - oz) / r) ** 2)))
    col *= (1 - 0.12 * dark[..., None])
    # height → normal (units: the texel is ≈ 0.043 units)
    h = rip * rip_amp * 0.6 - ruts * 0.8 - prints * 0.5 + grain * 0.05 + n2 * 0.15
    nrm = tex.normal_from_height(tex.blur(h, 0.9), 1.8, wrap=False)
    rough = np.clip(0.9 - 0.08 * road + 0.03 * grain, 0, 1)
    return (tex.save('desert-road_ground_col', col, 82), tex.save('desert-road_ground_nrm', nrm, 72),
            tex.save('desert-road_ground_orm', tex.pack_rough(rough), 80))


# ---------------------------------------------------------------- build
def build(out_dir, bake=True):
    core.reset()
    sc = Scene(NAME)
    T = core.texset
    sand_t = T('sand', tex.sand, n=512, seed=1)
    stone_t = T('sandstone', tex.sandstone, n=1024, seed=2)
    plaster_t = T('plaster', tex.plaster, n=1024, seed=3)
    wood_t = T('wood', tex.wood, n=512, seed=4)
    beam_t = T('palmwood', tex.wood, n=512, seed=14, planks=1, colors=('#9d7a52', '#7a5636', '#553820'))
    reeds_t = T('reeds', tex.reeds, n=512, seed=5)
    bark_t = T('bark', tex.bark, n=512, seed=9)
    leaf_t = T('leaf', tex.leaf, n=256, seed=11)
    clay_t = T('clay', tex.clay, n=512, seed=8)

    # occluders of the ground texture (contact darkening)
    occl = [(c[1], c[2], 6.5) for c in CELLS] + [(*stones_center(), 1.8)]
    gt = ground_textures(occl)
    m_ground = core.material('ground', gt, extras={'detail': 'sand'})
    ground_core(sc, m_ground)
    ground_far(sc, core.material('ground_far', sand_t, vcol=True, extras={'detail': 'sand'}))

    mat = {
        'plaster': core.material('plaster', plaster_t, vcol=True),
        'plaster_b': core.material('plaster_b', plaster_t, vcol=True, color=(1.0, 0.95, 0.88)),
        'wood': core.material('wood', wood_t),
        'beam': core.material('palmwood', beam_t),
        'reeds': core.material('reeds', reeds_t, double=True),
        'stone': core.material('stone', stone_t),
        'rock': core.material('rock', stone_t, vcol=True),
        'rock_grey': core.material('rock_grey', stone_t, vcol=True, color=(0.78, 0.76, 0.74)),
        'bark': core.material('bark', bark_t),
        'leaf': core.material('leaf', leaf_t, vcol=True, double=True, rough=0.6),
        'dry': core.material('dry_leaf', leaf_t, vcol=True, double=True, color=(1.0, 0.75, 0.45)),
        'dates': core.material('dates', None, vcol=True, rough=0.45),
        'twig': core.material('twig', beam_t, color=(0.6, 0.5, 0.42)),
        'shrub': core.material('shrub', None, vcol=True, rough=0.75),
        'grass': core.material('grass', None, vcol=True, rough=0.8, double=True),
        'pebble': core.material('pebble', stone_t, vcol=True),
        'clay': core.material('clay', clay_t),
        'weave_b': core.material('weave_dress', T('weave', tex.weave, n=512, seed=6), rough=0.8),
        'distant': core.material('distant_cliffs', stone_t, color=(1.0, 0.93, 0.88)),
    }
    Bt = lambda name, m, **kw: sc.batch(name, mat[m], **kw)

    def gy(x, z):
        return H(x, z)

    # ------------------------------------------------ the two cells
    for idx, c in enumerate(CELLS):
        name, x, z, f = c
        parts, info = pieces.cell(seed=7 + idx * 5, d=CELL_D, window_side=-1 if idx == 0 else 1)
        y = 0.0  # flat pad
        M = place(x, z, f, y)
        Bt('cells_plaster' if idx == 0 else 'cells_plaster_b', 'plaster' if idx == 0 else 'plaster_b', ao_density=26).add(parts['plaster'], M, uv_box=4.0)
        Bt('wood', 'wood').add(parts['wood'], M, uv_box=2.5)
        Bt('beams', 'beam').add(parts['beam'], M)
        Bt('reeds', 'reeds').add(parts['reeds'], M)
        Bt('stones', 'stone').add(parts['stone'], M, uv_box=2.0)
        dbm, hinge = info['door']
        # the door leaf as its own node (pivot at the hinge) so the runtime can swing it open
        door_b = Batch(f'door:{name}', mat['wood'], ao=256)
        door_b.add(dbm, None)
        core.box_uv(door_b.bm, 2.5)
        sc.batches[f'door:{name}'] = door_b
        door_b.pivot = (M @ hinge)
        door_b.M = M
        # collision of the cell (the walls; the doorway is closed by the door)
        # (a doorway is left open in front, so someone can stand in it and step out when the door swings open)
        a_ = math.radians(f)
        fx_, fz_, rx_, rz_ = math.sin(a_), math.cos(a_), math.cos(a_), -math.sin(a_)
        W_, D_, H_, cut = info['w'] + 0.5, info['d'] + 0.5, info['h'] + 1.0, 2.2
        sc.col_box(name, (W_, H_, D_ - cut), x - fx_ * cut / 2, z - fz_ * cut / 2, f, 0)
        dw_ = info['door_w'] + 0.3
        sw_ = (W_ - dw_) / 2
        fo_ = D_ / 2 - cut / 2
        for sgn, nm_ in ((-1, 'l'), (1, 'r')):
            o_ = sgn * (dw_ / 2 + sw_ / 2)
            sc.col_box(f'{name}-{nm_}', (sw_, H_, cut), x + fx_ * fo_ + rx_ * o_, z + fz_ * fo_ + rz_ * o_, f, 0)
        sc.col_box(f'{name}-lintel', (dw_, H_ - info['door_h'], cut), x + fx_ * fo_, z + fz_ * fo_, f, info['door_h'])
        # dressing by the door: a water jar on a stone stand (right), a stack of baskets is left free for props
        a = math.radians(f)
        rx, rz = math.cos(a), -math.sin(a)       # three.js "right" of the cell front (x axis turned by face)
        fx, fz = math.sin(a), math.cos(a)        # forward
        jx, jz = x + rx * 3.0 + fx * (CELL_D / 2 + 0.9), z + rz * 3.0 + fz * (CELL_D / 2 + 0.9)
        jar = core.new_bm()
        core.lathe(jar, [(0.0, 0.0), (0.35, 0.02), (0.62, 0.35), (0.72, 0.8), (0.6, 1.3), (0.32, 1.55), (0.28, 1.72), (0.36, 1.8), (0.3, 1.82), (0.24, 1.7)],
                   segs=20, uv_v=1.0, uv_u=2.0)
        Bt('clay', 'clay').add(jar, place(jx, jz, 0, 0.36))
        for k in range(3):
            aa = k * 2.1
            st = core.rock(300 + idx * 10 + k, size=(0.38, 0.32, 0.45), facets=4, detail=0.05, subdiv=2, sink=0.3)
            Bt('stones', 'stone').add(st, place(jx + math.cos(aa) * 0.52, jz + math.sin(aa) * 0.52, k * 40), uv_box=2.0)
        sc.col_box(f'{name}-jar', (1.6, 2.2, 1.6), jx, jz, 0)

    # ------------------------------------------------ the stone patch on the road (where the basket falls)
    sx, sz = stones_center()
    rng = np.random.default_rng(55)
    placed = []
    for i in range(30):
        for _ in range(40):
            a = rng.random() * 2 * math.pi; d = math.sqrt(rng.random()) * 1.7
            px, pz = sx + math.cos(a) * d * 1.3, sz + math.sin(a) * d * 0.8
            s = (0.14 + 0.3 * rng.random() ** 2) * (1.15 - d / 2.2)
            if all(math.hypot(px - qx, pz - qz) > (s + qs) * 0.9 for qx, qz, qs in placed):
                break
        placed.append((px, pz, s))
        st = core.rock(400 + i, size=(s, s * (0.7 + 0.3 * rng.random()), s * (0.45 + 0.3 * rng.random())), facets=5, detail=0.1, subdiv=2, sink=0.55)
        k = 0.95 + 0.2 * rng.random()
        grey = rng.random() < 0.5
        Bt('rocks', 'rock', vcol=True).add(st, place(px, pz, rng.random() * 360, gy(px, pz)),
                                           color=(min(1, k * 0.95), min(1, k * 0.94), min(1, k * 0.93)) if grey else (min(1, k * 1.05), k, k * 0.92), uv_box=2.5)
        if s > 0.25:
            sc.add_col(f'stone{i}', core.hull_of(core.rock(400 + i, size=(s, s, s * 0.8), facets=5, detail=0.1, subdiv=1, sink=0.45), place(px, pz, 0, gy(px, pz))))

    # ------------------------------------------------ keep-out map for decoration
    anchors_xz = []
    reserve = []   # (x, z, r) spots taken by the dressing
    # ------------------------------------------------ anchors & seats (three.js coords)
    def A(name, x, z, face, note=None):
        sc.anchor(name, x, z, face, round(gy(x, z), 3), note)
        anchors_xz.append((x, z))

    for c in CELLS:
        name, x, z, f = c
        dx, dz = door_point(c, 2.6)
        A(name, dx, dz, f, 'in front of the door, facing out (towards the road)')
        ix, iz = door_point(c, -0.2)
        A(f'{name}-door', ix, iz, f, 'standing in the doorway, facing out (enter / leave the cell)')
    for nm, x, note in (('far-left', -32.0, 'far left on the road'), ('road-a', -9.0, 'on the road, left of the middle'),
                        ('road-mid', 0.0, 'middle of the road'), ('road-b', 9.0, 'on the road, right of the middle'),
                        ('far-right', 32.0, 'far right on the road')):
        A(nm, x, road_z(x), 0.0, note + ' (facing the camera side +Z; turn with face)')
    A('stones', sx - 0.2, road_z(sx - 0.2) - 0.4, 0.0, 'on the road just behind the stone patch, facing it (+Z): a basket dropped here lands on the stones')
    A('offstage-left', -62.0, road_z(-62.0), 90.0, 'out of frame, left end of the road (enter walking +X)')
    A('offstage-right', 62.0, road_z(62.0), -90.0, 'out of frame, right end of the road (enter walking -X)')
    A('offstage-front', 2.0, 40.0, 180.0, 'out of frame towards the camera')
    # palm shade spot behind the road, between the cells (a quiet place to talk)
    A('palm-shade', -6.5, -19.5, 20.0, 'in the shade of the back palms, facing the camera')


    def free(x, z, r):
        if path_dist(x, z) < r + 0.6:
            return False
        for qx, qz, qr in reserve:
            if math.hypot(x - qx, z - qz) < qr + r:
                return False
        for c in CELLS:
            if math.hypot(x - c[1], z - c[2]) < 6.2 + r:
                return False
        if math.hypot(x - sx, z - sz) < 3.0 + r:
            return False
        for ax, az in anchors_xz:
            if math.hypot(x - ax, z - az) < 2.2 + r:
                return False
        return True

    # ------------------------------------------------ palms
    palms = [(-24.5, -15.5, 11.5, (0.5, -0.3)), (-11.5, -17.5, 9.5, (-0.4, -0.2)), (-27.0, -6.0, 8.5, (0.7, 0.4)),
             (24.0, -16.0, 12.0, (-0.6, -0.2)), (10.5, -18.5, 9.0, (0.4, 0.1)), (27.5, -5.0, 9.0, (-0.6, 0.5)),
             (1.5, -26.0, 13.0, (0.2, -0.5)), (-4.5, -24.0, 10.0, (-0.5, 0.3)), (-38.0, 12.0, 11.0, (0.6, 0.0)),
             (39.0, 10.0, 12.0, (-0.6, 0.2))]
    m_crown = core.material('crown', leaf_t, vcol=True, double=True, rough=0.6)
    crowns = {}
    for i, (x, z, h, lean) in enumerate(palms):
        p = pieces.palm(seed=60 + i, height=h, lean=lean, fronds=13)
        M = place(x, z, i * 37.0, gy(x, z) - 0.05)
        Bt('palm_bark', 'bark', ao_density=10).add(p['bark'], M)
        Bt('palm_bark', 'bark').add(p['bark_boss'], M, uv_box=1.0)
        # the crown (fronds + dry fronds + dates) is its own node pivoting on the trunk top: it sways in the wind
        # three crown shapes shared by all palms (one mesh each in the GLB), scaled with the palm
        top = p['top']
        v = i % 3
        if v not in crowns:
            q = pieces.palm(seed=160 + v, height=10.0, lean=(0, 0), fronds=13)
            crown = core.new_bm()
            for k in ('leaf', 'dry', 'dates'):
                core.merge(crown, q[k])
            core.transform(crown, Matrix.Translation(-q['top']))
            crowns[v] = sc.obj(f'palm{i}.crown', crown, m_crown, M @ Matrix.Translation(top) @ Matrix.Diagonal((h / 10.5,) * 3 + (1,)),
                               props={'anim': 'sway', 'amp': 0.035, 'freq': 0.45 + 0.07 * (i % 4), 'phase': i * 1.3}).data
        else:
            sc.obj(f'palm{i}.crown', None, None, M @ Matrix.Translation(top) @ Matrix.Diagonal((h / 10.5,) * 3 + (1,)), mesh=crowns[v],
                   props={'anim': 'sway', 'amp': 0.035, 'freq': 0.45 + 0.07 * (i % 4), 'phase': i * 1.3})
        sc.col_box(f'palm{i}', (1.2, h, 1.2), x, z, 0)
        reserve.append((x, z, 1.6))

    # ------------------------------------------------ rocks (boulders) away from the acting area
    rocks = [(-31, -12, 2.6), (-33.5, -9.5, 1.4), (30.5, -20, 3.2), (33, -17.5, 1.6), (-8, -21, 1.6), (13.0, -25.0, 2.2),
             (-20.5, 9.5, 1.3), (22.0, 11.0, 1.8), (36.0, 1.0, 2.4), (-37.0, 0.5, 1.9),
             (-42.0, -20.0, 4.5), (44.0, -24.0, 5.0)]
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
        # pebbles round its foot
        pb = pieces.pebbles(600 + i, 6, s * 1.4, size=0.12 + s * 0.04)
        Bt('pebbles', 'pebble', vcol=True, ao=False).add(pb, M, uv_box=1.0)

    # ------------------------------------------------ charming details (things for a child to spot)
    M_ = mat
    m_crit = core.material('critter', None, vcol=True, rough=0.55)
    m_wing = core.material('wing', None, vcol=True, rough=0.5, double=True)
    m_cloth = core.material('cloth', T('cloth', tex.cloth, n=256, seed=10, color='#ffffff'), vcol=True, double=True, rough=0.9)
    m_water = core.material('water', None, color=(0.16, 0.42, 0.52), rough=0.08)
    m_flame = core.material('flame', None, color=(1.0, 0.62, 0.2), emissive=(1.0, 0.55, 0.15), emissive_strength=6.0, rough=1.0)
    m_smoke = core.material('smoke', None, color=(0.95, 0.93, 0.9), alpha=0.55, rough=1.0)
    m_basket = core.material('weave', T('weave', tex.weave, n=512, seed=6), rough=0.8)
    m_rope = core.material('rope', T('rope', tex.rope, n=256, seed=7))

    def take(x, z, r):
        reserve.append((x, z, r))

    # the well of the hermitage (back middle), with green grass and flowers round it, butterflies
    wx, wz = -2.5, -15.0
    wl = critters.well()
    Mw = place(wx, wz, 10, gy(wx, wz))
    Bt('stones', 'stone').add(wl['stone'], Mw, uv_box=2.0)
    Bt('wood', 'wood').add(wl['wood'], Mw, uv_box=2.5)
    sc.obj('well.water', wl['water'], m_water, Mw, vcol=False)
    sc.obj('well.rope', wl['rope'], m_rope, Mw, vcol=False)
    sc.col_box('well', (2.8, 2.8, 2.8), wx, wz, 10)
    take(wx, wz, 2.2)
    r3 = np.random.default_rng(31)
    for k in range(9):
        a = k / 9 * 2 * math.pi + 0.3
        d = 1.9 + 0.8 * r3.random()
        fx_, fz_ = wx + math.cos(a) * d, wz + math.sin(a) * d
        if path_dist(fx_, fz_) < 1.0:
            continue
        Bt('grass_green', 'grass', vcol=True, ao=False).add(critters.green_tuft(1500 + k, r=0.5, h=0.5), place(fx_, fz_, k * 40, gy(fx_, fz_)))
        if k % 2 == 0:
            Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(1600 + k, n=6, radius=0.45), place(fx_ + 0.4, fz_ + 0.2, 0, gy(fx_, fz_)))
    # a clay trough for the donkey and the birds by the well
    tr = core.new_bm(); core.box(tr, (1.6, 0.7, 0.4), (0, 0, 0.2), bevel=0.12, segs=2)
    Bt('clay', 'clay').add(tr, place(wx + 2.6, wz + 0.8, 80, gy(wx + 2.6, wz + 0.8)), uv_box=1.5)
    trw = core.new_bm(); core.box(trw, (1.3, 0.45, 0.02), (0, 0, 0.33))
    sc.obj('trough.water', trw, m_water, place(wx + 2.6, wz + 0.8, 80, gy(wx + 2.6, wz + 0.8)), vcol=False)

    def flutter(name, x, y, z, col, spot, radius=1.2, freq=0.35, phase=0.0):
        body, wl_, wr_ = critters.butterfly(col, spot)
        g = sc.obj(name, body, m_crit, Matrix.Translation(B(x, y, z)),
                   props={'anim': 'butterfly', 'radius': radius, 'freq': freq, 'phase': phase, 'height': 0.35})
        sc.obj(name + '.wing.L', wl_, m_wing, Matrix.Identity(4), parent=g)
        sc.obj(name + '.wing.R', wr_, m_wing, Matrix.Identity(4), parent=g)

    flutter('butterfly1', wx + 1.5, gy(wx, wz) + 1.4, wz + 1.6, (1.0, 0.85, 0.2), (0.95, 0.45, 0.15), 1.4, 0.3, 0.0)
    flutter('butterfly2', wx - 1.8, gy(wx, wz) + 1.1, wz + 0.8, (1.0, 1.0, 0.97), (0.55, 0.75, 1.0), 1.0, 0.42, 2.0)

    # cell 2's vegetable garden (right, behind), with flowers and a butterfly
    gx, gz = 27.0, -14.5
    gd = critters.garden(seed=5)
    Mg = place(gx, gz, -18, gy(gx, gz))
    Bt('cells_plaster_b', 'plaster_b').add(gd['rim'], Mg, uv_box=4.0, color=(0.9, 0.86, 0.82))
    Bt('garden', 'shrub', vcol=True, ao=False).add(gd['soil'], Mg)
    Bt('garden', 'shrub', vcol=True, ao=False).add(gd['plants'], Mg)
    sc.col_box('garden', (4.6, 0.6, 3.2), gx, gz, -18)
    take(gx, gz, 3.0)
    for k, (dx, dz) in enumerate(((-2.8, 1.8), (2.9, 1.6), (0.2, 2.3))):
        Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(1700 + k, n=7, radius=0.5), place(gx + dx, gz + dz, 0, gy(gx + dx, gz + dz)))
    flutter('butterfly3', gx - 0.5, gy(gx, gz) + 1.2, gz + 1.0, (0.98, 0.55, 0.2), (0.35, 0.2, 0.1), 1.6, 0.27, 4.0)

    # the donkey of the brothers, tied to a post beside cell 2, nibbling
    dx_, dz_ = 26.0, -5.0
    body, head, piv = critters.donkey()
    Md = place(dx_, dz_, -70, gy(dx_, dz_))
    dk = sc.obj('donkey', body, m_crit, Md)
    sc.obj('donkey.head', head, m_crit, Matrix.Translation(piv), parent=dk, props={'anim': 'graze', 'freq': 0.18, 'phase': 0.7})
    post = core.new_bm(); core.tube(post, [Vector((0, 0, -0.2)), Vector((0, 0, 2.2))], 0.13, sides=8, uv_v=1.5)
    Bt('beams', 'beam').add(post, place(dx_ - 1.6, dz_ + 2.0, 0, gy(dx_, dz_)))
    rp = core.new_bm(); core.tube(rp, [Vector((0, 0, 1.9)), Vector((0.8, -0.5, 1.2)), Vector((1.35, -1.2, 1.75))], 0.03, sides=5, uv_v=0.3)
    sc.obj('donkey.rope', rp, m_rope, place(dx_ - 1.6, dz_ + 2.0, 0, gy(dx_, dz_)), vcol=False)
    sc.col_box('donkey', (1.6, 2.8, 3.2), dx_, dz_, -70)
    take(dx_, dz_, 2.6)

    # a ginger cat sitting on cell 2's roof, tail swishing; two doves on cell 1's roof
    c2 = CELLS[1]
    Mc = place(c2[1], c2[2], c2[3], 0) @ Matrix.Translation((2.9, -3.2, 6.82)) @ Matrix.Rotation(math.radians(-20), 4, 'Z')
    cb, ct, tp = critters.cat()
    ck = sc.obj('cat', cb, m_crit, Mc)
    sc.obj('cat.tail', ct, m_crit, Matrix.Translation(tp), parent=ck, props={'anim': 'tail', 'freq': 0.5})
    c1 = CELLS[0]
    for k, (lx, rz) in enumerate(((-2.6, 15), (-1.7, -25))):
        Mv = place(c1[1], c1[2], c1[3], 0) @ Matrix.Translation((lx, -3.15, 6.82)) @ Matrix.Rotation(math.radians(rz), 4, 'Z')
        db, dh, hp = critters.dove()
        dv = sc.obj(f'dove{k + 1}', db, m_crit, Mv)
        sc.obj(f'dove{k + 1}.head', dh, m_crit, Matrix.Translation(hp), parent=dv, props={'anim': 'peck', 'freq': 0.6 + 0.25 * k, 'phase': k * 2.0})

    # a lizard sunning on a big rock, a tortoise by a bush, a camel resting far away on a dune
    lz = critters.lizard()
    lx, lz_ = 30.2, -19.6
    sc.obj('lizard', lz, m_crit, place(lx, lz_, 30, gy(lx, lz_) + 2.05), props={'anim': 'lizard'})
    tx, tz = -19.5, 9.0
    to_ = sc.obj('tortoise', critters.tortoise(), m_crit, place(tx, tz, 120, gy(tx, tz)))
    th_, tp_ = critters.tortoise_head()
    sc.obj('tortoise.head', th_, m_crit, Matrix.Translation(tp_), parent=to_, props={'anim': 'peek'})
    sc.col_box('tortoise', (1.0, 0.5, 1.2), tx, tz, 120)
    take(tx, tz, 1.0)
    for k, (cx_, cz_, cf) in enumerate(((-58.0, -44.0, 60.0), (-63.0, -50.0, 20.0))):
        cb_, cn_, cp_, ct_, ctp_ = critters.camel_parts()
        cm_ = sc.obj(f'camel{k + 1}', cb_, m_crit, place(cx_, cz_, cf, H(cx_, cz_) - 0.2))
        sc.obj(f'camel{k + 1}.neck', cn_, m_crit, Matrix.Translation(cp_), parent=cm_, props={'anim': 'ruminate'})
        sc.obj(f'camel{k + 1}.tail', ct_, m_crit, Matrix.Translation(ctp_), parent=cm_, props={'anim': 'swish'})

    # cell 1 (the basket weaver): baskets drying in the sun and a bundle of palm leaves; a cooking hearth with smoke
    a1 = math.radians(c1[3])
    bx0, bz0 = c1[1] - 5.4 * math.cos(a1) + 2.0 * math.sin(a1), c1[2] + 5.4 * math.sin(a1) + 2.0 * math.cos(a1)
    for k, (ox, oz, rr, hh, hd) in enumerate(((0, 0, 0.55, 0.6, True), (0.9, 0.7, 0.5, 0.5, False), (-0.2, 1.2, 0.6, 0.55, True))):
        Bt('baskets', 'weave_b', ao=False).add(critters.basket_simple(rr, hh, hd), place(bx0 + ox, bz0 + oz, k * 50, 0))
    lv = core.new_bm()
    for k in range(9):
        core.tube(lv, [Vector((0.06 * k - 0.25, -1.0, 0.08 + 0.03 * (k % 2))), Vector((0.06 * k - 0.22, 0.0, 0.14)), Vector((0.06 * k - 0.3, 1.2, 0.06))], 0.05, sides=4, uv_v=1.0)
    Bt('baskets', 'weave_b').add(lv, place(bx0 + 1.4, bz0 - 0.6, 75, 0))
    sc.col_box('baskets', (2.4, 1.2, 2.4), bx0 + 0.3, bz0 + 0.5, 0)
    hx, hz = -26.0, -3.0
    hr = critters.hearth()
    Mh = place(hx, hz, 0, gy(hx, hz))
    Bt('stones', 'stone').add(hr['stone'], Mh, uv_box=2.0)
    Bt('clay', 'clay').add(hr['pot'], Mh)
    Bt('twigs', 'twig').add(hr['embers'], Mh)
    sc.obj('flame.hearth', hr['flame'], m_flame, Mh, vcol=False, props={'lightIntensity': 4.0, 'lightDistance': 8.0})
    sm = sc.group('smoke.hearth', Mh @ Matrix.Translation((0, 0, 1.1)), props={'anim': 'smoke', 'speed': 0.12, 'rise': 4.5})
    for k in range(5):
        sc.obj(f'smoke.hearth.puff{k}', critters.smoke_puff(0.3 + 0.06 * k), m_smoke, Matrix.Identity(4), parent=sm, vcol=False)
    sc.col_box('hearth', (1.6, 1.1, 1.6), hx, hz, 0)
    take(hx, hz, 1.6)
    # laundry line behind cell 1: two posts, a rope, a brown robe, a blue cloth and a white towel moving in the breeze
    p0, p1 = (-34.0, -17.0), (-28.5, -18.5)
    for (px, pz) in (p0, p1):
        pb = core.new_bm(); core.tube(pb, [Vector((0, 0, -0.2)), Vector((0, 0, 3.4))], 0.1, sides=8, uv_v=1.5)
        Bt('beams', 'beam').add(pb, place(px, pz, 0, gy(px, pz)))
        sc.col_box(f'post{px:.0f}', (0.4, 3.4, 0.4), px, pz, 0)
    y0, y1 = gy(*p0) + 3.2, gy(*p1) + 3.2
    ln = core.new_bm()
    core.tube(ln, [B(p0[0], y0, p0[1]), B((p0[0] + p1[0]) / 2, (y0 + y1) / 2 - 0.25, (p0[1] + p1[1]) / 2), B(p1[0], y1, p1[1])], 0.025, sides=4, uv_v=0.3)
    sc.obj('laundry.line', ln, m_rope, None, vcol=False)
    lface = math.degrees(math.atan2(p1[0] - p0[0], p1[1] - p0[1])) - 90
    for k, (t_, w_, h_, col) in enumerate(((0.22, 1.2, 1.9, (0.52, 0.34, 0.22)), (0.55, 1.0, 1.1, (0.35, 0.55, 0.85)), (0.8, 0.7, 0.8, (1.0, 0.98, 0.93)))):
        px = p0[0] + (p1[0] - p0[0]) * t_; pz = p0[1] + (p1[1] - p0[1]) * t_
        py = y0 + (y1 - y0) * t_ - 0.25 * (1 - (2 * t_ - 1) ** 2)
        cbm = critters.cloth(w_, h_, seed=k)
        core.set_color(cbm, col)
        sc.obj(f'laundry.cloth{k + 1}', cbm, m_cloth, place(px, pz, lface, py),
               props={'anim': 'sway', 'amp': 0.06, 'freq': 0.6 + 0.1 * k, 'phase': k * 1.7, 'axis': 'x'})
    reserve.append(((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, 3.5))
    # clay pots by cell 2, and a little oil lamp glowing in cell 1's window
    a2 = math.radians(c2[3])
    for k, (ox, oz, kind) in enumerate(((5.2, 2.6, 0), (5.9, 1.6, 1), (5.0, 1.2, 2))):
        px = c2[1] + ox * math.cos(a2) + oz * math.sin(a2); pz = c2[2] - ox * math.sin(a2) + oz * math.cos(a2)
        Bt('clay', 'clay').add(critters.pot(kind), place(px, pz, k * 70, 0))
    sc.col_box('pots', (2.2, 1.9, 2.4), c2[1] + 5.4 * math.cos(a2) + 1.8 * math.sin(a2), c2[2] - 5.4 * math.sin(a2) + 1.8 * math.cos(a2), c2[3])
    Mwin = place(c1[1], c1[2], c1[3], 0) @ Matrix.Translation((-4.2 + 0.9, 0.6, 6.5 * 0.62 - 0.5))
    lamp = critters.pot(2)
    core.transform(lamp, Matrix.Diagonal((0.35, 0.35, 0.35, 1)))
    Bt('clay', 'clay').add(lamp, Mwin)
    sc.obj('flame.cell1-window', critters.flame_mesh(0.24, 0.06), m_flame, Mwin @ Matrix.Translation((0, 0, 0.1)), vcol=False,
           props={'lightIntensity': 2.5, 'lightDistance': 5.0})

    # ------------------------------------------------ bushes, tufts, pebble scatter (seeded rejection sampling)
    r2 = np.random.default_rng(77)
    nb = 0
    for i in range(400):
        x = -42 + 84 * r2.random(); z = -28 + 48 * r2.random()
        if nb >= 26:
            break
        if not free(x, z, 1.4) or abs(x) < 5 and z > 8:
            continue
        nb += 1
        bsh = pieces.bush(seed=700 + i, r=0.9 + 0.7 * r2.random(), h=1.0 + 0.8 * r2.random(),
                          green=(0.45, 0.52, 0.26) if r2.random() < 0.6 else (0.6, 0.55, 0.3))
        M = place(x, z, r2.random() * 360, gy(x, z))
        Bt('twigs', 'twig', ao=False).add(bsh['twig'], M)
        Bt('shrubs', 'shrub', vcol=True, ao=False).add(bsh['shrub'], M)
        sc.col_box(f'bush{nb}', (1.6, 1.4, 1.6), x, z, 0)
    nt = 0
    for i in range(3000):
        x = -43 + 86 * r2.random(); z = -29 + 50 * r2.random()
        if nt >= 120:
            break
        if not free(x, z, 0.5):
            continue
        nt += 1
        tf = pieces.tuft(seed=900 + i, n=16, r=0.4 + 0.3 * r2.random(), h=0.45 + 0.45 * r2.random(), dry=0.35 + 0.6 * r2.random())
        Bt('grass', 'grass', vcol=True, ao=False).add(tf, place(x, z, r2.random() * 360, gy(x, z)))
    nf = 0
    for i in range(2000):
        if nf >= 34:
            break
        x = -40 + 80 * r2.random(); z = -26 + 44 * r2.random()
        if not free(x, z, 0.6) or z > 9:
            continue
        nf += 1
        Bt('flowers', 'grass', vcol=True, ao=False).add(critters.flowers(1800 + i, n=4 + int(r2.random() * 5), radius=0.4), place(x, z, 0, gy(x, z)))
    for i in range(30):
        x = -43 + 86 * r2.random(); z = -29 + 50 * r2.random()
        if not free(x, z, 0.4):
            continue
        Bt('pebbles', 'pebble', vcol=True, ao=False).add(pieces.pebbles(1200 + i, 5, 0.9, size=0.1), place(x, z, 0, gy(x, z)), uv_box=1.0)

    # ------------------------------------------------ the horizon: flat-topped sandstone cliffs, far away
    mesas = [(-150, -230, 120, 40, 46), (-20, -260, 90, 35, 34), (110, -240, 140, 45, 52), (230, -120, 60, 80, 38),
             (-240, -90, 70, 90, 42), (-210, 140, 80, 60, 30), (200, 170, 100, 60, 34), (20, 280, 120, 50, 28)]
    for i, (x, z, w, d, h) in enumerate([]):
        x, z, h = x * 1.3, z * 1.3, h * 0.8
        mb = pieces.mesa(800 + i, w * 1.2, d, h, tile=16.0)
        Bt('distant_cliffs', 'distant', ao=False).add(mb, place(x, z, math.degrees(math.atan2(-x, -z)), H(x, z) - 2))

    sc.finalize()
    # door pivots: move door objects' origin to the hinge so a rotation about local Y (three) swings them
    for nm, b in sc.batches.items():
        if nm.startswith('door:') and b.obj is not None:
            piv = b.pivot
            b.obj.data.transform(Matrix.Translation(-piv) @ b.M)
            b.obj.location = piv
            # undo: data was in local cell coords; we transformed with M then shifted; keep object rotation identity
    if bake:
        sc.bake_ao(samples=40, distance=5.0, max_size=2048, blur=0.6, gamma=1.15, floor=0.18)

    # ------------------------------------------------ metadata
    s1, s2 = CELLS[0], CELLS[1]
    meta = {
        'name': NAME,
        'title': 'Drumul prin pustiu (două chilii)',
        'units': 'engine units (figure 4.2 tall), three.js Y-up, +Z towards the usual camera',
        'anchors': sc.anchors,
        'seats': sc.seats,
        'bounds': [[-60, -0.5, -32], [60, 14, 24]],
        'acting': {'rect': [[-40, -22], [40, 14]], 'road': {'centre': 'z = 3.6 + 1.6 sin(0.06 x + 0.5)', 'width': ROAD_W},
                   'paths': [[[round(a, 2), round(b, 2)] for a, b in p] for p in PATHS],
                   'clear': 'no decoration within 0.6 of the road / paths, 2.2 of anchors, 6.2 of the cells, 3 of the stone patch'},
        'skies': ['day', 'morning'],
        'sky': {'day': {'sunAz': -38, 'sunElev': 50}, 'morning': {'sunAz': -66, 'sunElev': 15}, 'evening': {'sunAz': -100, 'sunElev': 8}},
        'shadow': {'center': [0, -4], 'radius': 48},
        'doors': {s1[0]: f'door:{s1[0]}', s2[0]: f'door:{s2[0]}'},
        'shots': {
            'wide': {'pos': [0, 10.5, 40], 'target': [0, 3, -4], 'fov': 42, 'note': 'both cells, the road and the stones'},
            'cell1': {'pos': [-6.5, 5.5, 12.5], 'target': [-15.5, 3.0, -6.0], 'fov': 40, 'note': 'medium on cell 1 door'},
            'cell2': {'pos': [7.0, 5.5, 12.0], 'target': [16.5, 3.0, -6.5], 'fov': 40, 'note': 'medium on cell 2 door'},
            'stones': {'pos': [6.5, 3.2, 14.5], 'target': [3.0, 1.6, 5.0], 'fov': 34, 'note': 'close on the stone patch / basket drop'},
            'road': {'pos': [-24, 4.0, 13], 'target': [0, 2.6, 4], 'fov': 38, 'note': 'along the road (walks), cell 2 behind'},
            'reverse': {'pos': [3, 6, -19], 'target': [0, 2.5, 6], 'fov': 44, 'note': 'from between the cells towards the open desert'},
        },
        'notes': ('Collision: col:cell1/col:cell2 (closed walls), col:palmN, col:rockN, col:bushN, col:stoneN (big stones of '
                  'the patch), col:cellN-jar. The doors are separate nodes door:cell1 / door:cell2 with the origin on the hinge '
                  '(rotate about +Y to open, negative angle opens outwards to the right). Ground meshes: ground (core, unique '
                  'texture) and ground_far (dunes); both are walkable and raycastable. Decoration is never on the road / paths.'),
        'previewProps': [{'name': 'basket', 'variant': 'broken', 'pos': [sx + 0.3, gy(sx, sz) + 0.02, sz - 0.2], 'face': 30},
                         {'name': 'basket', 'variant': 'new', 'pos': [s1[1] - 2.7, 0, s1[2] + 4.2], 'face': 10}],
    }
    os.makedirs(out_dir, exist_ok=True)
    sc.export(os.path.join(out_dir, NAME + '.glb'))
    with open(os.path.join(out_dir, NAME + '.json'), 'w') as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    return meta
