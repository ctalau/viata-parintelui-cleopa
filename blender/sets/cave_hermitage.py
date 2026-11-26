"""Set `cave-hermitage` (first version): a hermit's cave in a sandstone cliff, open towards +Z (camera side) so the
inside can be filmed. Prayer corner (icon on a rock shelf + hanging candilă) back left, two flat sitting stones facing
each other in the middle, reed mat, baskets, water jug, oil lamp; a sandy path comes in from the front left.
Skies: evening (default), night. Seats are 0.62 high (CONTRACT.md)."""
import math
import os
import json
import bmesh
import numpy as np
from mathutils import Matrix, Vector

from kit import core, tex, pieces, critters
from kit.core import B, place, Batch, Scene

NAME = 'cave-hermitage'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ICON = os.path.join(ROOT, 'assets', 'icons', 'mantuitorul-pantocrator-sinai.jpg')
SEAT_H = 0.62


def Hc(x, z):
    """ground height: flat floor in and before the cave, a dune ridge across the view out of the mouth, dunes far out"""
    d = max(0.0, math.hypot(x, z + 4) - 30)
    y = min(8.0, d * d * 0.004) if z > -25 or abs(x) > 40 else 0.0
    if z > 16:
        y = max(y, 3.4 * math.exp(-((z - 36) / 8.0) ** 2) * (0.65 + 0.35 * math.sin(x * 0.085 + 0.6)))
    return y


def build(out_dir, bake=True):
    core.reset()
    sc = Scene(NAME)
    T = core.texset
    sand_t = T('sand', tex.sand, n=512, seed=1)
    stone_t = T('cave_rock', tex.sandstone, n=1024, seed=2, cracks=0.12,
               tint=[(0, '#e2c4a0'), (0.35, '#ecd2b0'), (0.7, '#f3dec2'), (1, '#f9ebd6')])
    wood_t = T('wood', tex.wood, n=512, seed=4)
    clay_t = T('clay', tex.clay, n=512, seed=8)
    weave_t = T('weave', tex.weave, n=512, seed=6)
    mat_t = T('mat', tex.weave, n=512, seed=16, cells=10, diagonal=True)
    m = {
        'ground': core.material('ground', sand_t, extras={'detail': 'sand'}),
        'rock': core.material('cliff', stone_t),
        'stone': core.material('stone', stone_t, color=(0.95, 0.9, 0.85)),
        'wood': core.material('wood', wood_t),
        'clay': core.material('clay', clay_t),
        'weave': core.material('weave', weave_t),
        'mat': core.material('mat', mat_t),
        'crit': core.material('critter', None, vcol=True, rough=0.6),
        'flame': core.material('flame', None, color=(1.0, 0.62, 0.2), emissive=(1.0, 0.55, 0.15), emissive_strength=6.0),
        'glass': core.material('glass_red', None, color=(0.8, 0.12, 0.1), rough=0.15, emissive=(0.9, 0.15, 0.08), emissive_strength=0.6),
        'brass': core.material('brass', None, color=(0.85, 0.62, 0.3), rough=0.35, metal=1.0),
    }

    # ground: flat floor inside / in front of the cave, gentle dunes further out (UV = world / 8)
    g = core.new_bm()
    uvl = g.loops.layers.uv[core.UV0]
    N, S0 = 60, 3.0
    vs = []
    for j in range(N + 1):
        row = []
        for i in range(N + 1):
            x, z = -90 + i * S0, -90 + j * S0
            d = max(0.0, math.hypot(x, z + 4) - 30)
            y = Hc(x, z)
            row.append(g.verts.new(B(x, y, z)))
        vs.append(row)
    for j in range(N):
        for i in range(N):
            f = g.faces.new((vs[j][i], vs[j + 1][i], vs[j + 1][i + 1], vs[j][i + 1]))
            for l in f.loops:
                l[uvl].uv = (l.vert.co.x / 8, l.vert.co.y / 8)
    gb = Batch('ground', m['ground'], ao=1024, ao_uv=core.UV0)
    gb.bm.free(); gb.bm = g
    sc.batches['ground'] = gb

    # cliff: a big rounded rock mass with a dome-shaped cavity open to +Z (three) = -Y (Blender)
    mass = pieces.rounded_box((44, 22, 16), 4.0, cuts=16, center=(0, 16.0, 7.0))   # three z from -27 to -5
    core.displace(mass, 0.9, 6.0, seed=3, octaves=4)
    cav = core.new_bm()
    bmesh.ops.create_icosphere(cav, subdivisions=4, radius=1.0)
    core.transform(cav, Matrix.Translation((0, 11.0, 0.0)) @ Matrix.Diagonal((11.0, 9.0, 8.0, 1)))   # three centre z=-11
    core.displace(cav, 0.35, 2.5, seed=5, octaves=3)
    mouth = pieces.cutter_box((15.0, 8.0, 7.5), (0, 3.0, 3.2))
    rockb = pieces.boolean(mass, [cav, mouth])
    rockb.normal_update()
    core.box_uv(rockb, 6.0)
    sc.batch('cliff', m['rock'], ao_density=12).add(rockb)
    sc.col_box('cliff-left', (14, 16, 22), -15.5, -16, 0)
    sc.col_box('cliff-right', (14, 16, 22), 15.5, -16, 0)
    sc.col_box('cliff-back', (44, 16, 4), 0, -22, 0)

    st = sc.batch('stones', m['stone'])
    # icon shelf on the back-left wall + the icon (a real public-domain icon, rule 15)
    ix, iz = -4.0, -18.2
    shelf = core.new_bm(); core.box(shelf, (3.0, 1.9, 0.35), (0, 0, 2.6), bevel=0.08)
    st.add(shelf, place(ix, iz + 1.1, 0), uv_box=2.0)
    sc.col_box('shelf', (3.0, 2.8, 1.9), ix, iz + 1.1, 0)
    from PIL import Image
    w_, h_ = Image.open(ICON).size
    H = 1.8; W = H * w_ / h_
    IF = 1.15                          # the icon stands clear of the slanting back wall (no corner in the rock)
    board = core.new_bm(); core.box(board, (W + 0.3, 0.14, H + 0.3), (0, 0, 2.78 + (H + 0.3) / 2), bevel=0.03)
    sc.batch('wood', m['wood']).add(board, place(ix, iz + IF, -0), uv_box=2.0)
    icon_m = core.material('icon', (ICON, None, None), rough=0.5, extras={'unlit': True})
    pic = core.new_bm()
    uv = pic.loops.layers.uv[core.UV0]
    y = IF + 0.075 + 0.01
    cs = [(-W / 2, 2.93), (W / 2, 2.93), (W / 2, 2.93 + H), (-W / 2, 2.93 + H)]
    vv = [pic.verts.new((x, -y, z)) for x, z in cs]
    f = pic.faces.new(vv)
    for l, t in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        l[uv].uv = t
    f.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
    sc.obj('icon', pic, icon_m, place(ix, iz, 0), vcol=False)
    # hanging candilă in front of the icon: brass chain + red glass cup + flame
    cx, cz, cy = ix, iz + 2.2, 4.75
    ch = core.new_bm(); core.tube(ch, [Vector((0, 0, cy + 3.2)), Vector((0, 0, cy + 0.3))], 0.035, sides=5)
    core.lathe(ch, [(0.0, cy), (0.12, cy + 0.02), (0.18, cy + 0.15), (0.2, cy + 0.32), (0.17, cy + 0.32)], segs=12)
    sc.obj('candila.chain', ch, m['brass'], place(cx, cz, 0), vcol=False)
    gl = core.new_bm(); core.lathe(gl, [(0.0, cy + 0.15), (0.16, cy + 0.2), (0.22, cy + 0.45), (0.2, cy + 0.6)], segs=14)
    sc.obj('candila.glass', gl, m['glass'], place(cx, cz, 0), vcol=False)
    sc.obj('flame.candila', critters.flame_mesh(0.2, 0.05), m['flame'], place(cx, cz, 0, cy + 0.5), vcol=False,
           props={'lightIntensity': 6.0, 'lightDistance': 12.0, 'lightColor': '#ffd09a'})

    # a striped woven rug between the seats (walkable: named ground*, so feet stand ON it)
    rug_t = T('rug', tex.weave, n=512, seed=31, cells=12, colors=('#f0b84a', '#c8452f', '#3f7fa6'), band=(0.42, 0.58, '#f6e6b8', '#2f6d8f'))
    rg = core.new_bm(); core.box(rg, (7.4, 4.2, 0.04), (0, 0, 0.02), bevel=0.015, segs=1)
    sc.batch('ground_rug', core.material('rug', rug_t), ao=False).add(rg, place(0.0, -9.3, 0), uv_box=1.7)

    # packed-earth floor inside the cave (no dune ripples indoors): a flat warm slab that follows the cavity
    fl = core.new_bm()
    ring = []
    for k in range(48):
        a_ = k / 48 * 2 * math.pi
        x_, z_ = 10.6 * math.sin(a_), -11.0 + 8.7 * math.cos(a_)
        ring.append(fl.verts.new(B(x_, 0.012, min(z_, -4.6))))
    ff = fl.faces.new(ring)
    uvf = fl.loops.layers.uv[core.UV0]
    for l in ff.loops:
        l[uvf].uv = (l.vert.co.x / 5.0, l.vert.co.y / 5.0)
    ff.normal_update()
    if ff.normal.z < 0:
        ff.normal_flip()
    earth_t = T('earth', tex.sandstone, n=1024, seed=12, cracks=0.05, tint=[(0, '#c99a6c'), (0.4, '#d8ad7e'), (0.75, '#e4bf92'), (1, '#efd2aa')])
    sc.batch('ground_floor', core.material('earth', earth_t, color=(1.0, 0.86, 0.66), rough=0.95), ao=False).add(fl)

    # two flat sitting stones, 2.8 apart, turned a little to the camera
    seats = {'elder': (-2.0, -10.0, 70.0), 'guest': (2.0, -10.0, -70.0)}
    for k, (sx, sz, sf) in seats.items():
        sb = core.rock(70 + len(k), size=(1.05, 0.9, SEAT_H), facets=5, detail=0.03, subdiv=3, sink=0.0)
        for v in sb.verts:
            v.co.z = min(v.co.z, SEAT_H)
        st.add(sb, place(sx, sz, sf), uv_box=2.0)
        sc.col_box(f'seat-{k}', (2.0, SEAT_H, 1.7), sx, sz, sf)
        sc.seat(k, sx, SEAT_H, sz, sf, 'top centre of the sitting stone')
        a = math.radians(sf)
        sc.anchor(f'seat-{k}', sx + math.sin(a) * 0.9, sz + math.cos(a) * 0.9, sf, 0.0, 'stand here before sitting down on seat:' + k)

    # oil lamp on a stone between the seats (back), reed mat, baskets, palm-leaf rope coils, water jug
    lb = core.rock(91, size=(0.5, 0.45, 1.0), facets=4, detail=0.04, subdiv=2, sink=0.0)
    st.add(lb, place(0.0, -13.9, 0), uv_box=2.0)
    sc.col_box('lamp-stone', (1.0, 1.0, 0.9), 0.0, -13.9, 0)
    lamp = critters.pot(2); core.transform(lamp, Matrix.Diagonal((0.5, 0.5, 0.5, 1)))
    sc.batch('clay', m['clay']).add(lamp, place(0.0, -13.9, 0, 0.95))
    sc.obj('flame.lamp', critters.flame_mesh(0.24, 0.06), m['flame'], place(0.0, -13.9, 0, 1.05), vcol=False,
           props={'lightIntensity': 9.0, 'lightDistance': 16.0, 'lightColor': '#ffd09a'})
    mt = core.new_bm(); core.box(mt, (3.2, 1.8, 0.06), (0, 0, 0.03), bevel=0.02, segs=1)
    sc.batch('mat', m['mat'], ao=False).add(mt, place(5.0, -13.0, -15), uv_box=1.6)
    wv = sc.batch('baskets', m['weave'])
    for k, (bx, bz, r, hh) in enumerate(((7.2, -10.5, 0.55, 0.6), (8.0, -11.6, 0.5, 0.5), (6.6, -15.2, 0.6, 0.65))):
        wv.add(critters.basket_simple(r, hh, k != 1), place(bx, bz, k * 40))
    for k, (rx, rz) in enumerate(((5.6, -11.0), (4.2, -14.6))):
        coil = core.new_bm()
        core.tube(coil, [Vector((math.cos(a) * (0.25 + 0.025 * a), math.sin(a) * (0.25 + 0.025 * a), 0.05 + 0.004 * a)) for a in np.linspace(0, 6 * math.pi, 60)], 0.045, sides=5, uv_v=0.2)
        wv.add(coil, place(rx, rz, k * 60))
    sc.col_box('baskets', (3.0, 1.2, 6.0), 7.3, -12.6, 0)
    sc.batch('clay', m['clay']).add(critters.pot(0), place(6.2, -6.2, 0))
    sc.col_box('jug', (1.3, 1.4, 1.3), 6.2, -6.2, 0)

    # outside: a few rocks and green tufts / flowers left of the path, a palm
    rk = sc.batch('rocks', m['stone'])
    for i, (x, z, s) in enumerate(((-14, 2, 2.2), (13, 3, 1.8), (-20, 10, 1.4), (18, 12, 2.6))):
        rb = core.rock(800 + i, size=(s, s * 0.8, s * 0.7))
        Mr = place(x, z, i * 40)
        sc.add_col(f'rock{i}', core.hull_of(core.rock(800 + i, size=(s, s * 0.8, s * 0.7), subdiv=1), Mr))
        rk.add(rb, Mr, uv_box=3.0)
    for i, (x, z) in enumerate(((-9, 5), (9.5, 6.5), (-11, 9), (10, 1.5))):
        sc.batch('flowers', core.material('plants', None, vcol=True, double=True), vcol=True, ao=False).add(critters.flowers(900 + i), place(x, z, 0))
        sc.batch('flowers', None).add(critters.green_tuft(950 + i), place(x + 0.6, z - 0.4, 0))
    p = pieces.palm(seed=61, height=11, lean=(0.5, 0.2), fronds=13)
    M = place(-17, 6, 30)
    sc.batch('palm_bark', core.material('bark', T('bark', tex.bark, n=512, seed=9)), ao=False).add(p['bark'], M)
    crown = core.new_bm()
    for k in ('leaf', 'dry', 'dates'):
        core.merge(crown, p[k])
    core.transform(crown, Matrix.Translation(-p['top']))
    sc.obj('palm.crown', crown, core.material('crown', T('leaf', tex.leaf, n=256, seed=11), vcol=True, double=True),
           M @ Matrix.Translation(p['top']), props={'noShadow': True, 'anim': 'sway', 'amp': 0.03, 'freq': 0.4})
    sc.col_box('palm', (1.2, 11, 1.2), -17, 6, 0)

    # the view out of the mouth: three palms before the dune ridge, flat-topped cliffs on the horizon
    for k_, (px_, pz_, hh_, ln) in enumerate(((-9.5, 25.0, 11.0, (0.4, 0.2)), (6.5, 28.0, 9.5, (-0.3, 0.1)), (-1.5, 32.0, 12.0, (0.2, -0.2)))):
        p3 = pieces.palm(seed=71 + k_, height=hh_, lean=ln, fronds=13)
        M3 = place(px_, pz_, 70 * k_, Hc(px_, pz_) - 0.1)
        sc.batch('palm_bark', None).add(p3['bark'], M3)
        cr3 = core.new_bm()
        for kk in ('leaf', 'dry', 'dates'):
            core.merge(cr3, p3[kk])
        core.transform(cr3, Matrix.Translation(-p3['top']))
        sc.obj(f'palm{k_ + 5}.crown', cr3, core.material(f'crown{k_ + 5}', T('leaf', tex.leaf, n=256, seed=11), vcol=True, double=True),
               M3 @ Matrix.Translation(p3['top']), props={'noShadow': True, 'anim': 'sway', 'amp': 0.03, 'freq': 0.3 + 0.08 * k_, 'phase': 2.0 + k_})
    far = core.material('distant_cliffs', stone_t, color=(1.0, 0.86, 0.8))
    for k_, (mx_, mz_, w_, d_, h_) in enumerate(((-55, 95, 70, 30, 22), (40, 110, 90, 35, 28), (-140, 60, 60, 40, 20), (130, 70, 70, 40, 24))):
        sc.batch('distant_cliffs', far, ao=False).add(pieces.mesa(840 + k_, w_, d_, h_, tile=16.0), place(mx_, mz_, math.degrees(math.atan2(-mx_, -mz_)), 2.0))

    # --- extra dressing (things a small child likes to spot), all away from the acting areas ---
    wax = core.material('wax', None, color=(0.98, 0.9, 0.7), rough=0.5)
    for k, dx in enumerate((-1.15, 1.15)):
        cd = core.new_bm(); core.lathe(cd, [(0.0, 0.0), (0.07, 0.0), (0.07, 0.5), (0.0, 0.52)], segs=10)
        sc.obj(f'candle{k}', cd, wax, place(ix + dx, iz + 1.1, 0, 2.78), vcol=False)
        sc.obj(f'flame.candle{k}', critters.flame_mesh(0.2, 0.05), m['flame'], place(ix + dx, iz + 1.1, 0, 3.3), vcol=False,
               props={'lightIntensity': 2.5, 'lightDistance': 9.0, 'lightColor': '#ffd6a4'})
    # a plank shelf with jars on the right wall
    pl = core.new_bm(); core.box(pl, (1.1, 3.2, 0.14), (0, 0, 2.3), bevel=0.03)
    for dz_ in (-1.3, 1.3):
        core.box(pl, (0.9, 0.14, 0.5), (0.1, dz_, 2.0), bevel=0.02)
    sc.batch('wood', m['wood']).add(pl, place(9.3, -11.6, 0), uv_box=2.0)
    sc.col_box('wall-shelf', (1.2, 1.2, 3.3), 9.3, -11.6, 0, 1.8)
    for k, (dz_, kind, s_) in enumerate(((-1.0, 0, 0.55), (0.0, 1, 0.5), (0.95, 2, 0.8))):
        pb = critters.pot(kind); core.transform(pb, Matrix.Diagonal((s_, s_, s_, 1)))
        sc.batch('clay', m['clay']).add(pb, place(9.25, -11.6 + dz_, k * 50, 2.37))
    # the hermit's cat asleep by the mat, a dove pecking at the cave mouth
    cb, ct, tp = critters.cat()
    ck = sc.obj('cat', cb, m['crit'], place(7.4, -8.2, -120, 0.0))
    sc.obj('cat.tail', ct, m['crit'], Matrix.Translation(tp), parent=ck, props={'anim': 'tail', 'freq': 0.35})
    sc.col_box('cat', (1.0, 1.0, 1.4), 7.4, -8.2, -120)
    for k, (dx, dz_, df) in enumerate(((8.2, -2.6, 200.0), (-9.4, 1.0, 60.0))):
        db, dh, hp = critters.dove()
        dv = sc.obj(f'dove{k}', db, m['crit'], place(dx, dz_, df, 0.0))
        sc.obj(f'dove{k}.head', dh, m['crit'], Matrix.Translation(hp), parent=dv, props={'anim': 'peck', 'freq': 0.55 + 0.2 * k, 'phase': 1.3 * k})
    for i, (x, z) in enumerate(((-8.4, -1.5), (8.9, -0.6), (-12.5, 5.5), (12.0, 7.5), (6.5, 10.5), (-5.5, 14.5), (14.5, -1.0), (-13.0, -1.5))):
        sc.batch('flowers', None).add(critters.flowers(1900 + i, n=8, radius=0.6), place(x, z, 0))
        sc.batch('flowers', None).add(critters.green_tuft(1950 + i), place(x - 0.7, z + 0.3, 0))
    to_ = sc.obj('tortoise', critters.tortoise(), m['crit'], place(11.0, 4.5, -40, 0.0))
    th_, tp_ = critters.tortoise_head()
    sc.obj('tortoise.head', th_, m['crit'], Matrix.Translation(tp_), parent=to_, props={'anim': 'peek'})
    sc.col_box('tortoise', (1.0, 0.5, 1.2), 11.0, 4.5, -40)

    # --- warm, lived-in details: a low table with bread and a cup, a striped blanket on the mat, a book shelf with a
    # standing wooden cross and a candle on the back wall, flower pots and bushes at the cave mouth, two more palms ---
    def cbox(size, center, col, bevel=0.02):
        b = core.new_bm(); core.box(b, size, center, bevel=bevel); core.set_color(b, col); return b

    tb = core.new_bm(); core.box(tb, (1.7, 1.1, 0.12), (0, 0, 0.84), bevel=0.03)
    for dx in (-0.7, 0.7):
        for dy in (-0.4, 0.4):
            core.box(tb, (0.12, 0.12, 0.84), (dx, dy, 0.42), bevel=0.02)
    sc.batch('wood', m['wood']).add(tb, place(5.0, -8.7, 12), uv_box=2.0)
    sc.col_box('table', (1.9, 1.0, 1.3), 5.0, -8.7, 12)
    food = core.new_bm()
    critters.blob(food, (-0.3, 0.0, 1.02), (0.36, 0.3, 0.14), (0.86, 0.6, 0.3))
    critters.blob(food, (-0.3, 0.0, 1.07), (0.26, 0.2, 0.1), (0.93, 0.72, 0.42))
    for k_, (fx, fy) in enumerate(((0.42, 0.22), (0.56, 0.1), (0.46, 0.02))):
        critters.blob(food, (fx, fy, 1.0), (0.09, 0.09, 0.07), ((0.45, 0.2, 0.12), (0.5, 0.25, 0.1), (0.4, 0.18, 0.1))[k_])   # dates
    sc.obj('table.food', food, m['crit'], place(5.0, -8.7, 12))
    cup = critters.pot(1); core.transform(cup, Matrix.Diagonal((0.3, 0.3, 0.3, 1)))
    sc.batch('clay', m['clay']).add(cup, place(5.35, -8.95, 0, 0.9))
    blk_t = T('blanket', tex.weave, n=512, seed=41, cells=9, colors=('#3f7fa6', '#f3dfae', '#c8452f'))
    bl = core.new_bm(); core.box(bl, (1.5, 1.7, 0.16), (0, 0, 0.14), bevel=0.06)
    sc.batch('blanket', core.material('blanket', blk_t), ao=False).add(bl, place(5.7, -13.2, -15), uv_box=1.2)
    pillow = core.new_bm(); critters.blob(pillow, (0, 0, 0.26), (0.6, 0.34, 0.18), (0.96, 0.9, 0.78))
    sc.obj('pillow', pillow, m['crit'], place(4.1, -12.8, -15))
    # back-wall shelf (right of the lamp): books, a standing cross, a candle
    bx_, bz_ = 3.4, -17.9
    ps = core.new_bm(); core.box(ps, (2.6, 0.9, 0.14), (0, 0, 2.7), bevel=0.03)
    for dx in (-1.0, 1.0):
        core.box(ps, (0.14, 0.8, 0.5), (dx, -0.05, 2.4), bevel=0.02)
    sc.batch('wood', m['wood']).add(ps, place(bx_, bz_, -8), uv_box=2.0)
    books = core.new_bm()
    for k_, (dx, w_b, h_b, col) in enumerate(((-0.95, 0.16, 0.62, (0.62, 0.16, 0.14)), (-0.76, 0.14, 0.7, (0.16, 0.33, 0.55)), (-0.58, 0.18, 0.58, (0.2, 0.45, 0.3)), (-0.38, 0.13, 0.66, (0.72, 0.52, 0.2)))):
        core.merge(books, cbox((w_b, 0.46, h_b), (dx, 0, 2.77 + h_b / 2), col))
    core.merge(books, cbox((0.5, 0.4, 0.12), (0.95, 0, 2.83), (0.62, 0.16, 0.14)))
    sc.obj('books', books, m['crit'], place(bx_, bz_, -8))
    crs = core.new_bm(); core.box(crs, (0.12, 0.1, 1.0), (0.15, 0, 3.27), bevel=0.02); core.box(crs, (0.56, 0.1, 0.12), (0.15, 0, 3.5), bevel=0.02)
    core.box(crs, (0.36, 0.3, 0.08), (0.15, 0, 2.81), bevel=0.02)
    sc.batch('wood', m['wood']).add(crs, place(bx_, bz_, -8), uv_box=2.0)
    cd = core.new_bm(); core.lathe(cd, [(0.0, 0.0), (0.07, 0.0), (0.07, 0.42), (0.0, 0.44)], segs=10)
    sc.obj('candle.shelf', cd, wax, place(bx_ + 0.95, bz_ - 0.02, 0, 2.89), vcol=False)
    sc.obj('flame.shelf', critters.flame_mesh(0.2, 0.05), m['flame'], place(bx_ + 0.95, bz_ - 0.02, 0, 3.33), vcol=False,
           props={'lightIntensity': 2.5, 'lightDistance': 9.0, 'lightColor': '#ffd6a4'})
    # the cave mouth: big clay pots with flowers on both sides, green bushes, two palms on the right
    for k_, (px_, pz_) in enumerate(((-9.3, -3.7), (9.4, -3.9))):
        sc.batch('clay', m['clay']).add(critters.pot(0), place(px_, pz_, 70 * k_))
        sc.batch('flowers', None).add(critters.flowers(2100 + k_, n=10, radius=0.42), place(px_, pz_, 0, 1.25))
        sc.col_box(f'flowerpot{k_}', (1.3, 1.6, 1.3), px_, pz_, 0)
    for k_, (px_, pz_, r_) in enumerate(((-12.2, -2.6, 1.3), (12.6, -2.9, 1.5), (15.5, 4.5, 1.2), (-15.0, 12.5, 1.4))):
        bsh = pieces.bush(seed=2200 + k_, r=r_, h=r_ * 1.1, green=(0.42, 0.56, 0.26))
        Mb = place(px_, pz_, 50 * k_)
        sc.batch('twigs', core.material('twig', T('bark', tex.bark, n=512, seed=9)), ao=False).add(bsh['twig'], Mb)
        sc.batch('flowers', None).add(bsh['shrub'], Mb)
        sc.col_box(f'bush{k_}', (r_ * 1.6, 2.0, r_ * 1.6), px_, pz_, 0)
    for k_, (px_, pz_, hh_, ln) in enumerate(((17.5, 7.0, 10.0, (-0.4, 0.2)), (21.0, 1.5, 12.0, (0.3, 0.3)))):
        p2 = pieces.palm(seed=62 + k_, height=hh_, lean=ln, fronds=13)
        M2 = place(px_, pz_, 80 * k_)
        sc.batch('palm_bark', None).add(p2['bark'], M2)
        cr2 = core.new_bm()
        for kk in ('leaf', 'dry', 'dates'):
            core.merge(cr2, p2[kk])
        core.transform(cr2, Matrix.Translation(-p2['top']))
        sc.obj(f'palm{k_ + 2}.crown', cr2, core.material(f'crown{k_ + 2}', T('leaf', tex.leaf, n=256, seed=11), vcol=True, double=True),
               M2 @ Matrix.Translation(p2['top']), props={'noShadow': True, 'anim': 'sway', 'amp': 0.03, 'freq': 0.35 + 0.1 * k_, 'phase': 1.0 + k_})
        sc.col_box(f'palm{k_ + 2}', (1.2, hh_, 1.2), px_, pz_, 0)


    sc.anchor('pray-a', ix - 1.4, iz + 5.6, 180.0, 0.0, 'praying spot left, facing the icon')
    sc.anchor('pray-b', ix + 1.4, iz + 5.6, 180.0, 0.0, 'praying spot right, facing the icon')
    sc.anchor('icon', ix, iz + 1.55, 0.0, 2.78, 'the icon on its shelf (prop target; y = shelf top)')
    sc.anchor('inside', 0.0, -8.0, 0.0, 0.0, 'middle of the cave, facing out')
    sc.anchor('entrance', 0.0, -3.5, 0.0, 0.0, 'in the cave mouth, facing out')
    sc.anchor('outside', -2.0, 5.0, 180.0, 0.0, 'outside the mouth on the path, facing in')
    sc.anchor('path', -8.0, 12.0, 150.0, 0.0, 'on the path coming in from the front left')
    sc.anchor('offstage', -24.0, 26.0, 140.0, 0.0, 'out of frame, front left')
    sc.finalize()
    if bake:
        sc.bake_ao(samples=24, distance=3.0, max_size=2048, blur=0.8, gamma=0.8, floor=0.62)
    meta = {
        'name': NAME, 'title': 'Peștera pustnicului',
        'units': 'engine units (figure 4.2 tall), three.js Y-up, +Z towards the usual camera',
        'anchors': sc.anchors, 'seats': sc.seats,
        'bounds': [[-25, -0.1, -27], [25, 17, 20]],
        'acting': {'inside': 'floor y=0 from z=-19 to -3, x -9..9 is clear except the dressing',
                   'clear': 'the path x -10..2, z -3..20 and a 1.5 radius round every anchor'},
        'skies': ['evening', 'night'],
        'sky': {'evening': {'sunAz': -16, 'sunElev': 12, 'sunColor': '#ffc088', 'sunIntensity': 2.5, 'zenith': '#5a62b8', 'mid': '#f2bd9c', 'ground': '#e8c8a0',
                            'horizon': '#ffae6a', 'sunSize': 1.8, 'envIntensity': 0.95, 'exposure': 1.0, 'grade': {'warm': 0.02, 'sat': 1.1, 'lift': 0.03}}, 'night': {'sunAz': 40, 'sunElev': 35}},
        'shadow': {'center': [0, -6], 'radius': 30},
        'lights': [{'pos': [0, 5.5, -11], 'color': '#ffe2bc', 'intensity': 12, 'distance': 22, 'flicker': 0.04},
                   {'pos': [0.0, 2.6, -8.0], 'color': '#ffd9a8', 'intensity': 4, 'distance': 12, 'flicker': 0.03},
                   {'pos': [0, 5.0, -3], 'color': '#ffe2c4', 'intensity': 7, 'distance': 20, 'flicker': 0.0}],
        'shots': {
            'wide': {'pos': [0, 6, 22], 'target': [0, 3, -10], 'fov': 42, 'note': 'the whole cave mouth and the path'},
            'seats': {'pos': [0, 3.4, 2.0], 'target': [0, 1.8, -10.5], 'fov': 38, 'note': 'the two seats, both faces'},
            'icon': {'pos': [-1.0, 4.0, -7.5], 'target': [-4.0, 3.2, -17.5], 'fov': 40, 'note': 'the prayer corner'},
            'side': {'pos': [7.5, 3.2, -6.0], 'target': [-1.0, 1.8, -11.0], 'fov': 40, 'note': 'from the right inside the cave'},
        },
        'notes': 'First version. The cave is open towards +Z (mouth 15 wide, 7.5 high): film from the front or from inside.',
    }
    os.makedirs(out_dir, exist_ok=True)
    sc.export(os.path.join(out_dir, NAME + '.glb'))
    with open(os.path.join(out_dir, NAME + '.json'), 'w') as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    return meta
