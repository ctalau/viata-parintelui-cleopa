"""Set `market-square`: the market square of an old walled town (Jerusalem in film 040), in the toy-city look of the
film's poster: soft sandstone blocks everywhere (paving, walls with crenellations and arched niches, a gate tower with a
terracotta dome), a fruit stall with a red-and-cream striped awning and baskets of red apples, a bread / jar stall with an
orange awning, big clay amphorae, potted plants, palms. The square is open towards +Z (camera side); the road into town
comes in from the front (x ≈ 0, z 14 … 34), a side street from the front right (x > 26, z 8 … 20).
Skies: morning (default), day, evening."""
import math
import os
import json
import bmesh
import numpy as np
from mathutils import Matrix, Vector

from kit import core, tex, pieces, critters
from kit.core import B, place, Batch, Scene

NAME = 'market-square'


def Hc(x, z):
    """ground height: flat town, dunes far outside the walls"""
    d = max(0.0, math.hypot(x, z) - 60)
    return min(10.0, d * d * 0.004)


def cyl_cutter(r, depth, center, segs=28):
    """a cylinder along Blender Y (through a wall) — the round top of an arch"""
    c = bmesh.new()
    bmesh.ops.create_cone(c, cap_ends=True, segments=segs, radius1=r, radius2=r, depth=depth)
    core.transform(c, Matrix.Translation(center) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    return c


NICHES = []   # dark niche-back panels made by wall(), in the wall's local space (placed by the caller)


def wall(L, h, t, niches=(), merlons=True, seed=1):
    """A straight town wall along local X (centre at 0), front face towards -Y, base z = 0. niches = [(x, w, h_rect,
    depth)] arched recesses cut into the front face. Returns a bmesh."""
    m = core.new_bm(); core.box(m, (L, t, h), (0, 0, h / 2), bevel=0.12, segs=2)
    cuts = []
    for (nx, nw, nh, nd) in niches:
        cuts.append(pieces.cutter_box((nw, nd * 2, nh), (nx, -t / 2, nh / 2 - 0.01)))
        cuts.append(cyl_cutter(nw / 2, nd * 2, (nx, -t / 2, nh)))
    if cuts:
        m = pieces.boolean(m, cuts)
    for (nx, nw, nh, nd) in niches:   # a dark back panel in every niche (the arch reads as a deep opening)
        b = core.new_bm(); core.box(b, (nw, 0.04, nh), (nx, -t / 2 + nd - 0.03, nh / 2), bevel=0.0, segs=1)
        c = bmesh.new(); bmesh.ops.create_cone(c, cap_ends=True, segments=24, radius1=nw / 2, radius2=nw / 2, depth=0.04)
        core.transform(c, Matrix.Translation((nx, -t / 2 + nd - 0.03, nh)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
        if core.UV0 not in c.loops.layers.uv: c.loops.layers.uv.new(core.UV0)
        if core.COL not in c.loops.layers.color: c.loops.layers.color.new(core.COL)
        core.merge(b, c)
        NICHES.append(b)
    if merlons:
        n = int(L / 1.7)
        for i in range(n):
            x = -L / 2 + (i + 0.5) * L / n
            core.box(m, (0.95, t + 0.1, 0.9), (x, 0, h + 0.45), bevel=0.1, segs=2)
        core.box(m, (L + 0.2, t + 0.3, 0.32), (0, 0, h - 0.16), bevel=0.08, segs=1)   # a cornice under the merlons
    return m


def build(out_dir, bake=True):
    core.reset()
    sc = Scene(NAME)
    T = core.texset
    sand_t = T('sand', tex.sand, n=512, seed=1)
    # light, even paving (a quiet floor under the figures — reviewer: the dark checker of the stones was dominant)
    pave_t = T('paving', tex.blocks, n=1024, seed=31, rows=4, cols=4, groove=0.016, bevel=0.06, relief=0.15,
               colors=('#fbedd2', '#f8e8c8', '#f5e3c0'), mortar='#efdcb6')
    wall_t = T('town_wall', tex.blocks, n=1024, seed=32, rows=5, cols=3, groove=0.035, bevel=0.1, relief=1.2,
               colors=('#efdcb8', '#e8d2a8', '#e0c79a'), mortar='#d9c29a')
    wood_t = T('wood', tex.wood, n=512, seed=4)
    clay_t = T('clay', tex.clay, n=512, seed=8)
    weave_t = T('weave', tex.weave, n=512, seed=6)
    red_t = T('awning_red', tex.stripes, n=512, seed=22, count=5, colors=('#d22f22', '#fbe8bc'))
    ora_t = T('awning_orange', tex.stripes, n=512, seed=23, count=4, colors=('#f08a1c', '#fff0c8'))
    m = {
        'ground': core.material('ground', sand_t, extras={'detail': 'sand'}),
        'paving': core.material('paving', pave_t, rough=0.85),
        'wall': core.material('town_wall', wall_t),
        'wood': core.material('wood', wood_t),
        'clay': core.material('clay', clay_t),
        'weave': core.material('weave', weave_t),
        'red': core.material('awning_red', red_t, double=True),
        'orange': core.material('awning_orange', ora_t, double=True),
        'dome': core.material('dome', clay_t, color=(0.86, 0.5, 0.36)),
        'crit': core.material('critter', None, vcol=True, rough=0.55),
        'plants': core.material('plants', None, vcol=True, double=True),
    }

    # ---- ground: flat sand, dunes far out (UV = world / 8); the paved square on top (walkable: named ground*)
    g = core.new_bm(); uvl = g.loops.layers.uv[core.UV0]
    N, S0 = 60, 4.0
    vs = [[g.verts.new(B(-120 + i * S0, Hc(-120 + i * S0, -120 + j * S0), -120 + j * S0)) for i in range(N + 1)] for j in range(N + 1)]
    for j in range(N):
        for i in range(N):
            f = g.faces.new((vs[j][i], vs[j + 1][i], vs[j + 1][i + 1], vs[j][i + 1]))
            for l in f.loops:
                l[uvl].uv = (l.vert.co.x / 8, l.vert.co.y / 8)
    gb = Batch('ground', m['ground'], ao=1024, ao_uv=core.UV0)
    gb.bm.free(); gb.bm = g
    sc.batches['ground'] = gb
    pv = core.new_bm(); core.box(pv, (64.0, 52.0, 0.04), (0, 0, 0.0), bevel=0.0, segs=1)
    sc.batch('ground_paving', m['paving'], ao=2048).add(pv, place(0, 8.0, 0, 0.0), uv_box=6.0)
    # the road out of town (front): the same paving continues as a strip
    rd = core.new_bm(); core.box(rd, (6.0, 30.0, 0.04), (0, 0, 0.0), bevel=0.0, segs=1)
    sc.batch('ground_paving', None).add(rd, place(0, 48.0, 0, 0.0), uv_box=6.0)

    W = sc.batch('walls', m['wall'], ao_density=10)
    niche_m = core.material('niche', wall_t, color=(0.42, 0.3, 0.22))
    def add_wall(bm, M, uv_box=5.0):
        W.add(bm, M, uv_box=uv_box)
        while NICHES:
            sc.batch('niches', niche_m, ao=False).add(NICHES.pop(), M, uv_box=3.0)
    # ---- back wall with arched niches (one deep, dark: the gate into the inner town), crenellated
    add_wall(wall(70, 7.5, 1.8, niches=[(-15, 3.2, 3.6, 0.7), (-6.5, 4.2, 4.6, 1.5), (4.5, 3.2, 3.6, 0.7), (13.5, 3.2, 3.6, 0.7)]),
             place(0, -18.0, 0))
    sc.col_box('back-wall', (70, 8.4, 1.8), 0, -18.0, 0)
    # ---- right side: a colonnade wall with three arches, ending at z ≈ 6 (the side street opens beyond)
    add_wall(wall(24, 6.5, 1.6, niches=[(-7, 3.4, 3.6, 0.8), (0, 3.4, 3.6, 0.8), (7, 3.4, 3.6, 0.8)]), place(27.0, -5.0, -90))
    sc.col_box('right-wall', (1.6, 7.4, 24), 27.0, -5.0, 0)
    # ---- left: two town houses (flat roofs with a parapet, arched door, small windows)
    for k, (hx, hz, hw, hd, hh) in enumerate(((-25.5, -9.0, 8.0, 14.0, 9.0), (-25.0, 5.0, 7.0, 10.0, 6.5))):
        hs = wall(hd, hh, hw, niches=[(0.0, 2.2, 2.6, 0.6), (-hd / 3.2, 1.0, 1.2, 0.4)], merlons=False)
        core.box(hs, (hd + 0.2, hw + 0.2, 0.5), (0, 0, hh + 0.25), bevel=0.08)          # parapet
        add_wall(hs, place(hx, hz, 90))
        sc.col_box(f'house{k}', (hw, hh + 0.6, hd), hx, hz, 0)
    for k, (wx, wz) in enumerate(((-21.4, -12.0), (-21.4, -6.0), (-21.4, 3.2))):        # window niches high on the house fronts
        cut = core.new_bm(); core.box(cut, (0.12, 1.0, 1.3), (0, 0, 0), bevel=0.04)
        sc.batch('windows', core.material('window_dark', None, color=(0.22, 0.13, 0.08), rough=0.9), ao=False).add(cut, place(wx, wz, 0, 5.6 if k < 2 else 4.2))
    # ---- the gate tower (back right) with arched windows and a terracotta dome
    tx_, tz_ = 20.5, -21.0
    tw = core.new_bm(); core.box(tw, (6.0, 6.0, 14.0), (0, 0, 7.0), bevel=0.15, segs=2)
    tw = pieces.boolean(tw, [pieces.cutter_box((1.4, 2.0, 2.0), (dx, -3.0, 11.6)) for dx in (-1.3, 1.3)] +
                        [cyl_cutter(0.7, 2.0, (dx, -3.0, 12.6)) for dx in (-1.3, 1.3)])
    core.box(tw, (6.6, 6.6, 0.45), (0, 0, 14.2), bevel=0.1)
    W.add(tw, place(tx_, tz_, -20), uv_box=5.0)
    drum = core.new_bm(); core.lathe(drum, [(0.0, 14.4), (2.4, 14.4), (2.4, 15.6), (0.0, 15.6)], segs=40)
    W.add(drum, place(tx_, tz_, 0), uv_box=5.0)
    dome = core.new_bm()
    core.lathe(dome, [(2.55, 15.5)] + [(2.55 * math.cos(a), 15.5 + 2.6 * math.sin(a)) for a in np.linspace(0.05, math.pi / 2, 14)], segs=40, uv_u=4.0, uv_v=2.0)
    core.lathe(dome, [(0.0, 18.0), (0.22, 18.05), (0.12, 18.6), (0.26, 18.8), (0.0, 19.3)], segs=16)
    sc.batch('dome', m['dome']).add(dome, place(tx_, tz_, 0))
    sc.col_box('tower', (6.4, 19, 6.4), tx_, tz_, -20)

    # ---- the fruit stall (left): wooden frame, counter, red-and-cream striped awning sloping to the front with a valance
    def stall(x, z, face, awn, goods, s=1.3):
        Mw = place(x, z, face, 0.0, s)
        wd = core.new_bm()
        for px in (-2.3, 2.3):
            for py, ph in ((-1.25, 4.3), (1.25, 4.9)):
                core.tube(wd, [Vector((px, py, 0.0)), Vector((px, py, ph))], 0.13, sides=8, uv_v=2.0)
        core.box(wd, (4.9, 0.22, 0.22), (0, -1.25, 4.25), bevel=0.04)
        core.box(wd, (4.9, 0.22, 0.22), (0, 1.25, 4.85), bevel=0.04)
        core.box(wd, (4.4, 1.5, 0.18), (0, 0.15, 1.55), bevel=0.04)             # counter top
        core.box(wd, (4.2, 1.3, 1.45), (0, 0.2, 0.72), bevel=0.06)               # counter body (planks)
        sc.batch('wood', m['wood']).add(wd, Mw, uv_box=2.0)
        aw = core.new_bm()
        core.box(aw, (5.4, 3.2, 0.06), (0, 0, 0), bevel=0.0, segs=1)
        core.transform(aw, Matrix.Translation((0, 0.0, 4.75)) @ Matrix.Rotation(math.radians(-11), 4, 'X'))
        val = core.new_bm()                                                          # scalloped valance at the front edge
        n = 9
        for i in range(n):
            vx = -2.7 + (i + 0.5) * 5.4 / n
            core.box(val, (5.4 / n - 0.02, 0.05, 0.55), (vx, -1.58, 4.17), bevel=0.0, segs=1)
        core.merge(aw, val)
        core.box_uv(aw, 5.4)
        sc.batch('awning_' + awn, m[awn], ao=False).add(aw, Mw)
        sc.col_box(f'stall{int(x)}', (4.9 * s, 4.9 * s, 2.8 * s), x, z, face)
        goods(Mw)

    def apples(Mw, cx, cy, cz, r, n, seed, colors=((0.78, 0.08, 0.06), (0.88, 0.16, 0.08), (0.66, 0.05, 0.05))):
        b = core.new_bm(); rng = np.random.default_rng(seed)
        for i in range(n):
            a = rng.random() * 2 * math.pi; d = r * math.sqrt(rng.random()); hgt = 0.12 * (1 - d / r) + 0.05 * rng.random()
            critters.blob(b, (cx + d * math.cos(a), cy + d * math.sin(a), cz + hgt), (0.13, 0.13, 0.12), colors[i % len(colors)], subdiv=2)
        sc.batch('fruit', m['crit'], vcol=True, ao=False).add(b, Mw)

    def fruit_goods(Mw):
        for k, (bx, br) in enumerate(((-1.4, 0.6), (0.0, 0.62), (1.4, 0.58))):
            sc.batch('baskets', m['weave']).add(critters.basket_simple(br, 0.42, False), Mw @ Matrix.Translation((bx, 0.05, 1.64)))
            apples(Mw, bx, 0.05, 2.0, br * 0.78, 16, 300 + k,
                   ((0.78, 0.08, 0.06), (0.88, 0.16, 0.08)) if k != 1 else ((0.95, 0.6, 0.1), (0.98, 0.72, 0.18)))
        for k, (bx, by) in enumerate(((-1.6, -2.1), (1.5, -2.2))):                 # two big baskets on the ground in front
            sc.batch('baskets', m['weave']).add(critters.basket_simple(0.75, 0.6, False), Mw @ Matrix.Translation((bx, by, 0.0)))
            apples(Mw, bx, by, 0.55, 0.62, 20, 320 + k)
        # bunches of grapes and strings of dried figs hanging from the front beam
        hang = core.new_bm()
        for i, hx in enumerate((-1.9, -0.95, 0.95, 1.9)):
            core.tube(hang, [Vector((hx, -1.25, 4.15)), Vector((hx, -1.25, 3.55))], 0.015, sides=4)
            for j in range(9):
                gx = hx + 0.09 * math.cos(j * 2.4); gz = 3.5 - 0.07 * j; gy = -1.25 + 0.09 * math.sin(j * 2.4)
                critters.blob(hang, (gx, gy, gz), (0.075, 0.075, 0.075), (0.42, 0.16, 0.45) if i % 2 == 0 else (0.62, 0.42, 0.2), subdiv=2)
        sc.batch('fruit', m['crit'], vcol=True, ao=False).add(hang, Mw)
        # bunches of grapes and strings of dried figs hanging from the front beam, a green melon pile on the counter end
        hang = core.new_bm()
        for i, hx in enumerate((-1.9, -0.95, 0.95, 1.9)):
            core.tube(hang, [Vector((hx, -1.25, 4.15)), Vector((hx, -1.25, 3.55))], 0.015, sides=4)
            for j in range(9):
                gx = hx + 0.09 * math.cos(j * 2.4); gz = 3.5 - 0.07 * j; gy = -1.25 + 0.09 * math.sin(j * 2.4)
                critters.blob(hang, (gx, gy, gz), (0.075, 0.075, 0.075), (0.42, 0.16, 0.45) if i % 2 == 0 else (0.62, 0.42, 0.2), subdiv=2)
        sc.batch('fruit', m['crit'], vcol=True, ao=False).add(hang, Mw)

    def bread_goods(Mw):
        b = core.new_bm()
        for i in range(7):
            critters.blob(b, (-1.8 + i * 0.6, 0.1, 1.78), (0.26, 0.2, 0.13), (0.86, 0.58, 0.28) if i % 2 else (0.92, 0.68, 0.36))
        sc.batch('fruit', m['crit'], vcol=True, ao=False).add(b, Mw)
        for k, (bx, s_) in enumerate(((-1.9, 1.3), (1.9, 1.15))):
            pb = critters.pot(1); core.transform(pb, Matrix.Diagonal((s_, s_, s_, 1)))
            sc.batch('clay', m['clay']).add(pb, Mw @ Matrix.Translation((bx, -2.1, 0)))

    stall(-10.5, -6.5, 12, 'red', fruit_goods)
    stall(9.5, -10.5, -8, 'orange', bread_goods)

    # ---- big clay amphorae and round jars (right, along the colonnade), potted plants, palms
    for k, (ax, az, kind, s_) in enumerate(((18.5, -4.5, 1, 1.9), (20.3, -3.2, 1, 1.6), (17.0, -2.5, 0, 1.5), (21.5, -6.4, 0, 1.7),
                                            (19.4, -1.0, 1, 1.25), (-17.5, -1.0, 1, 1.7), (-18.8, 0.6, 0, 1.4))):
        pb = critters.pot(kind); core.transform(pb, Matrix.Diagonal((s_, s_, s_, 1)))
        sc.batch('clay', m['clay']).add(pb, place(ax, az, k * 37))
    sc.col_box('amphorae', (6.0, 3.6, 7.0), 19.3, -3.6, 0)
    sc.col_box('amphorae-left', (3.4, 3.0, 3.4), -18.1, -0.2, 0)
    for k, (px_, pz_) in enumerate(((14.5, -15.0), (-4.0, -15.6), (2.6, -15.6), (24.0, 4.5), (-20.0, 11.0))):
        sc.batch('clay', m['clay']).add(critters.pot(0), place(px_, pz_, 40 * k))
        bsh = pieces.bush(seed=500 + k, r=0.9, h=1.2, green=(0.36, 0.55, 0.26))
        Mb = place(px_, pz_, 30 * k, 1.1)
        sc.batch('twigs', core.material('twig', T('bark', tex.bark, n=512, seed=9)), ao=False).add(bsh['twig'], Mb)
        sc.batch('plants', m['plants'], vcol=True, ao=False).add(bsh['shrub'], Mb)
        sc.col_box(f'plant{k}', (1.6, 2.4, 1.6), px_, pz_, 0)
    for k, (px_, pz_, hh_, ln) in enumerate(((-17.0, -14.0, 12.0, (0.4, 0.2)), (15.5, -15.5, 11.0, (-0.3, 0.2)), (-19.0, 18.0, 10.0, (0.3, -0.2)),
                                             (22.0, 19.0, 11.5, (-0.4, -0.1)), (-4.0, -24.0, 13.0, (0.2, 0.1)))):
        p = pieces.palm(seed=600 + k, height=hh_, lean=ln, fronds=14, fleshy=True)
        M = place(px_, pz_, 50 * k)
        sc.batch('palm_bark', core.material('bark', T('bark', tex.bark, n=512, seed=9)), ao=False).add(p['bark'], M)
        crown = core.new_bm()
        for kk in ('leaf', 'dry', 'dates'):
            core.merge(crown, p[kk])
        core.transform(crown, Matrix.Translation(-p['top']))
        sc.obj(f'palm{k}.crown', crown, core.material(f'crown{k}', T('leaf', tex.leaf, n=256, seed=11), vcol=True, double=True),
               M @ Matrix.Translation(p['top']), props={'noShadow': True, 'anim': 'sway', 'amp': 0.03, 'freq': 0.35 + 0.07 * k, 'phase': k * 1.3})
        sc.col_box(f'palm{k}', (1.2, hh_, 1.2), px_, pz_, 0)
    # a stone well with a wooden frame and a hanging bucket (front left of the square)
    wx, wz = -11.0, 6.5
    wl = core.new_bm(); core.lathe(wl, [(1.0, 0.0), (1.45, 0.0), (1.5, 1.05), (1.38, 1.2), (1.0, 1.2), (0.98, 0.2)], segs=36, uv_u=4.0, uv_v=1.0)
    W.add(wl, place(wx, wz, 0), uv_box=3.0)
    wf = core.new_bm()
    for sx in (-1.25, 1.25):
        core.box(wf, (0.22, 0.22, 3.2), (sx, 0, 2.6), bevel=0.04)
    core.box(wf, (2.9, 0.2, 0.2), (0, 0, 4.1), bevel=0.04)
    core.tube(wf, [Vector((0, 0, 4.0)), Vector((0, 0, 2.6))], 0.025, sides=5)
    sc.batch('wood', m['wood']).add(wf, place(wx, wz, 20), uv_box=2.0)
    bk = critters.pot(2); core.transform(bk, Matrix.Diagonal((0.55, 0.55, 0.55, 1)))
    sc.batch('clay', m['clay']).add(bk, place(wx, wz, 20, 2.15))
    sc.col_box('well', (3.2, 4.4, 3.2), wx, wz, 0)
    # crates of fruit by the fruit stall, grain sacks by the bread stall
    for k, (cx_, cz_, cf) in enumerate(((-15.8, -4.0, 15), (-5.4, -3.4, -10))):
        cr = core.new_bm(); core.box(cr, (1.5, 1.1, 0.8), (0, 0, 0.4), bevel=0.05)
        for sx in (-0.5, 0.0, 0.5):
            core.box(cr, (0.06, 1.14, 0.84), (sx, 0, 0.42), bevel=0.01)
        sc.batch('wood', m['wood']).add(cr, place(cx_, cz_, cf), uv_box=1.5)
        apples(place(cx_, cz_, cf), 0.0, 0.0, 0.72, 0.5, 14, 340 + k, ((0.95, 0.6, 0.1), (0.98, 0.72, 0.18)) if k else ((0.78, 0.08, 0.06), (0.88, 0.16, 0.08)))
        sc.col_box(f'crate{k}', (1.6, 1.2, 1.2), cx_, cz_, cf)
    sack_m = core.material('sack', T('sack', tex.cloth, n=512, seed=10, color='#d8c49a'))
    for k, (sx_, sz_, sf) in enumerate(((13.4, -8.6, 20), (14.6, -7.6, -30), (6.0, -8.6, 10))):
        sk = core.new_bm(); core.lathe(sk, [(0.0, 0.0), (0.5, 0.02), (0.62, 0.4), (0.55, 0.9), (0.3, 1.1), (0.2, 1.25), (0.28, 1.38), (0.0, 1.4)], segs=20, uv_u=2.0, uv_v=1.0)
        core.displace(sk, 0.04, 1.5, seed=700 + k)
        sc.batch('sacks', sack_m).add(sk, place(sx_, sz_, sf))
        sc.col_box(f'sack{k}', (1.3, 1.5, 1.3), sx_, sz_, 0)

    # a potter's rug with jars and bowls for sale (left of the square's middle), a heap of baskets (back middle)
    rug_t = T('rug', tex.weave, n=512, seed=31, cells=12, colors=('#f0b84a', '#c8452f', '#3f7fa6'), band=(0.42, 0.58, '#f6e6b8', '#2f6d8f'))
    rg = core.new_bm(); core.box(rg, (3.6, 2.6, 0.04), (0, 0, 0.03), bevel=0.01, segs=1)
    sc.batch('ground_rug', core.material('rug', rug_t), ao=False).add(rg, place(-6.8, -0.8, 15), uv_box=1.8)
    for k, (dx, dz, kind, s_) in enumerate(((-1.1, -0.5, 0, 0.8), (0.0, -0.7, 1, 0.75), (1.1, -0.4, 0, 0.7), (-0.6, 0.6, 2, 0.9), (0.7, 0.6, 2, 0.8))):
        pb = critters.pot(kind); core.transform(pb, Matrix.Diagonal((s_, s_, s_, 1)))
        sc.batch('clay', m['clay']).add(pb, place(-6.8, -0.8, 15) @ Matrix.Translation((dx, -dz, 0.05)))
    sc.col_box('pottery', (3.6, 1.2, 2.6), -6.8, -0.8, 15)
    for k, (bx, bz, r, hh) in enumerate(((1.0, -4.0, 0.6, 0.6), (2.2, -4.6, 0.55, 0.5), (1.6, -3.2, 0.5, 0.45))):
        sc.batch('baskets', m['weave']).add(critters.basket_simple(r, hh, k == 2), place(bx, bz, k * 40))
        apples(place(bx, bz, k * 40), 0.0, 0.0, hh - 0.05, r * 0.75, 10, 360 + k, ((0.95, 0.6, 0.1), (0.98, 0.72, 0.18)) if k == 1 else ((0.78, 0.08, 0.06), (0.88, 0.16, 0.08)))
    sc.col_box('basket-heap', (2.6, 1.2, 2.4), 1.6, -3.9, 0)

    # doves on the paving and on the wall top (a child likes to spot them)
    for k, (dx, dz_, df, dy) in enumerate(((-6.0, 9.5, 200.0, 0.0), (12.5, 2.0, 60.0, 0.0), (-2.0, -17.6, 10.0, 8.4))):
        db, dh, hp = critters.dove()
        dv = sc.obj(f'dove{k}', db, m['crit'], place(dx, dz_, df, dy))
        sc.obj(f'dove{k}.head', dh, m['crit'], Matrix.Translation(hp), parent=dv, props={'anim': 'peck', 'freq': 0.5 + 0.2 * k, 'phase': 1.1 * k})

    # ---- anchors
    sc.anchor('center', 0.0, 3.0, 0.0, 0.0, 'middle of the square, facing the camera side')
    sc.anchor('road', 0.0, 22.0, 180.0, 0.0, 'on the road into town, facing the square')
    sc.anchor('road-far', 0.0, 34.0, 180.0, 0.0, 'far out on the road (behind the usual camera)')
    sc.anchor('fruit-stall', -11.2, -2.4, 192.0, 0.0, 'customer spot in front of the fruit stall, facing it')
    sc.anchor('fruit-seller', -10.0, -9.4, 12.0, 0.0, 'behind the fruit stall counter, facing the square')
    sc.anchor('bread-stall', 9.0, -7.2, 172.0, 0.0, 'customer spot in front of the bread stall, facing it')
    sc.anchor('amphorae', 16.0, -0.5, -110.0, 0.0, 'by the big clay jars, facing the square')
    sc.anchor('side-street', 30.0, 14.0, -100.0, 0.0, 'the side street coming in from the front right')
    sc.anchor('offstage-left', -16.0, 30.0, 140.0, 0.0, 'out of frame, front left (leave town)')
    sc.anchor('offstage-right', 34.0, 14.0, -100.0, 0.0, 'out of frame, right')
    sc.finalize()
    if bake:
        sc.bake_ao(samples=24, distance=3.0, max_size=2048, blur=0.8, gamma=0.8, floor=0.6)
    meta = {
        'name': NAME, 'title': 'Piața cetății',
        'units': 'engine units (figure 4.2 tall), three.js Y-up, +Z towards the usual camera',
        'anchors': sc.anchors, 'seats': sc.seats,
        'bounds': [[-34, -0.1, -26], [34, 20, 40]],
        'acting': {'square': 'paved, clear: x -8..14, z -5..14 (and the road x -3..3 up to z 34)',
                   'clear': 'the side street x 12..34, z 8..20; a 1.5 radius round every anchor'},
        'skies': ['morning', 'day', 'evening'],
        'sky': {'morning': {'sunAz': -55, 'sunElev': 30}, 'day': {'sunAz': -38, 'sunElev': 50},
                'evening': {'sunAz': -60, 'sunElev': 34, 'sunIntensity': 2.8, 'exposure': 1.08, 'grade': {'warm': 0.04, 'sat': 1.15, 'lift': 0.03}}},
        'shadow': {'center': [0, -2], 'radius': 40},
        'shots': {
            'wide': {'pos': [0, 8, 30], 'target': [0, 3, -6], 'fov': 42, 'note': 'the whole square: stalls, walls, tower'},
            'stall': {'pos': [-6, 4, 4], 'target': [-11, 2.4, -8], 'fov': 40, 'note': 'the fruit stall'},
            'jars': {'pos': [9, 4, 6], 'target': [19, 2.2, -3], 'fov': 40, 'note': 'the amphorae by the colonnade'},
        },
        'notes': 'Toy-city sandstone look (film 040 poster). Paving is walkable (ground_paving).',
    }
    os.makedirs(out_dir, exist_ok=True)
    sc.export(os.path.join(out_dir, NAME + '.glb'))
    with open(os.path.join(out_dir, NAME + '.json'), 'w') as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    return meta
