#!/usr/bin/env python3
"""Rebuild the props → assets/props/<name>.glb (origin = base centre, empty `grip`, variants = named root nodes).
    python3 blender/props/build.py [basket|oil-lamp|jug|mat]
basket: variants `intact`, `broken` (squashed, torn, strands sticking out), `new` (a prettier basket with a dyed band)."""
import os, sys, math, json
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(os.path.dirname(HERE), 'sets')]
import bpy  # noqa: F401
import numpy as np
import bmesh
from mathutils import Matrix, Vector
from kit import core, tex, critters, wheat
from kit import donkey as dk
from kit import aimesh
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'props')


def export(sc, name, info):
    os.makedirs(OUT, exist_ok=True)
    sc.export(os.path.join(OUT, name + '.glb'))
    with open(os.path.join(OUT, name + '.json'), 'w') as f:
        json.dump(info, f, indent=1)


def basket():
    core.reset(); sc = core.Scene('basket')
    plain = core.material('weave', core.texset('weave', tex.weave, n=512, seed=6))
    band = core.material('weave_band', core.texset('weave_band', tex.weave, n=512, seed=6, band=(0.45, 0.7, '#c8382c', '#2f5aa0')))
    R, Hh = 0.55, 0.75
    for var in ('intact', 'broken', 'new'):
        root = sc.group(var)
        bm = critters.basket_simple(R, Hh, handle=var != 'broken')
        if var == 'broken':   # crushed flat on one side, the rim split open, the handle snapped off, loose strands around
            for v in bm.verts:
                k = max(0.0, min(1.0, (v.co.x + R) / (2 * R)))          # 0 at the whole side … 1 at the crushed side
                v.co.z *= 1.0 - 0.62 * k
                v.co.x += 0.22 * k * (v.co.z / Hh)
                v.co.y *= 1.0 + 0.25 * k
                v.co.z += 0.05 * math.sin(v.co.y * 7) * k
            for k in range(14):                                         # torn strands sticking out of the crushed rim
                a = -1.0 + k * 0.155
                s = core.new_bm()
                core.tube(s, [Vector((math.cos(a) * R * 0.75, math.sin(a) * R * 1.1, 0.26 + 0.02 * (k % 4))),
                              Vector((math.cos(a) * R * (1.35 + 0.12 * (k % 3)), math.sin(a) * R * 1.45, 0.30 + 0.16 * (k % 3)))], 0.022, sides=4, uv_v=0.2)
                core.merge(bm, s)
            hd = core.new_bm()                                          # the snapped handle: two stumps + the arc lying beside
            core.tube(hd, [Vector((R * 1.25 + 0.5 * math.cos(a_) * 0.9, -0.55 + 0.1 * a_, 0.05 + 0.03 * math.sin(a_))) for a_ in np.linspace(0.2, 2.9, 9)], 0.035, sides=5, uv_v=0.2)
            for sy in (-1, 1):
                core.tube(hd, [Vector((0.0, sy * R * 0.95, Hh * 0.95)), Vector((-0.06, sy * R * 0.9, Hh * 1.22))], 0.035, sides=5, uv_v=0.2)
            core.merge(bm, hd)
            for k, (lx, ly, la) in enumerate(((0.95, 0.55, 0.4), (1.1, -0.2, 1.9), (0.7, 0.85, 2.6), (-0.2, 0.95, 0.9))):   # loose strands on the ground
                s = core.new_bm()
                core.tube(s, [Vector((lx, ly, 0.02)), Vector((lx + 0.34 * math.cos(la), ly + 0.34 * math.sin(la), 0.03))], 0.02, sides=4, uv_v=0.2)
                core.merge(bm, s)
        sc.obj(var + '.body', bm, band if var == 'new' else plain, None, parent=root, vcol=False)
    g = sc.empty('grip', 0, Hh + R, 0, 0)
    export(sc, 'basket', {'hands': 1, 'carry': 'side', 'variants': ['intact', 'broken', 'new'], 'grip': [0, Hh + R, 0],
                          'notes': 'height 1.3 with the handle; hang it from the grip at the side'})


def oil_lamp():
    core.reset(); sc = core.Scene('oil-lamp')
    clay = core.material('clay', core.texset('clay', tex.clay, n=512, seed=8))
    fl = core.material('flame', None, color=(1.0, 0.62, 0.2), emissive=(1.0, 0.55, 0.15), emissive_strength=6.0)
    lamp = critters.pot(2); core.transform(lamp, Matrix.Diagonal((0.6, 0.6, 0.6, 1)))
    sc.obj('lamp', lamp, clay, None, vcol=False)
    sc.obj('flame', critters.flame_mesh(0.26, 0.06), fl, Matrix.Translation((0.0, 0, 0.1)), vcol=False)
    sc.empty('grip', 0, 0.1, 0, 0)
    export(sc, 'oil-lamp', {'hands': 1, 'carry': 'front', 'notes': 'flame* mesh → look.js adds a flickering light'})


def jug():
    core.reset(); sc = core.Scene('jug')
    clay = core.material('clay', core.texset('clay', tex.clay, n=512, seed=8))
    j = critters.pot(1); core.transform(j, Matrix.Diagonal((0.7, 0.7, 0.7, 1)))
    core.tube(j, [Vector((0.3, 0, 0.9)), Vector((0.45, 0, 1.0)), Vector((0.2, 0, 1.2))], 0.05, sides=6)
    sc.obj('jug', j, clay, None, vcol=False)
    sc.empty('grip', 0.35, 1.0, 0, 0)
    export(sc, 'jug', {'hands': 1, 'carry': 'side'})


def mat():
    core.reset(); sc = core.Scene('mat')
    m = core.material('mat', core.texset('mat', tex.weave, n=512, seed=16, cells=10, diagonal=True))
    b = core.new_bm(); core.box(b, (3.2, 1.8, 0.06), (0, 0, 0.03), bevel=0.02, segs=1); core.box_uv(b, 1.6)
    sc.obj('mat', b, m, None, vcol=False)
    sc.empty('grip', 0, 0.06, 0.9, 0)
    export(sc, 'mat', {'hands': 2, 'carry': 'front'})


def pouch():
    """A money pouch (punga cu bani) like the film's poster: a soft rust-brown cloth sack, cinched at the neck with a
    rope tied round it and two cord ends with knots; above the tie the cloth opens in a ruffled frill showing a heap of
    gold coins. Origin = base centre (it stands on the ground); grip = the cinched neck (it hangs from the hand by it)."""
    core.reset(); sc = core.Scene('pouch')
    cl = core.material('pouch_cloth', core.texset('pouch_cloth', tex.weave, n=512, seed=23, cells=26, colors=('#9a5530', '#7e4224', '#5e2f18')))
    rp = core.material('pouch_rope', core.texset('pouch_rope', tex.rope, n=256, seed=7))
    gold = core.material('gold', None, color=(1.0, 0.62, 0.08), rough=0.18, metal=1.0, emissive=(0.6, 0.32, 0.0), emissive_strength=0.7)   # deeper orange-gold than the yellow toy hands
    NECK = 0.56
    # the sack: lathe profile (radius, height) from the bottom up to the neck, then the frill flaring out
    prof = [(0.0, 0.0), (0.16, 0.01), (0.28, 0.06), (0.355, 0.16), (0.37, 0.27), (0.345, 0.38), (0.27, 0.47), (0.15, 0.53),
            (0.11, NECK), (0.12, NECK + 0.04), (0.19, NECK + 0.11), (0.25, NECK + 0.17), (0.27, NECK + 0.19)]
    b = core.new_bm(); core.lathe(b, prof, segs=40, uv_u=3.0, uv_v=2.0, cap_bottom=True)
    for v in b.verts:   # cloth: soft folds running up to the tie, the rim of the frill waves
        a = math.atan2(v.co.y, v.co.x); r = math.hypot(v.co.x, v.co.y); z = v.co.z
        if r < 1e-4:
            continue
        k = 1.0 + 0.06 * math.sin(a * 9) * max(0.0, min(1.0, (z - 0.15) / 0.35)) * (1 if z < NECK else 0)
        if z > NECK + 0.08:
            k *= 1.0 + 0.14 * math.sin(a * 11) * (z - NECK - 0.08) / 0.11
            v.co.z += 0.03 * math.sin(a * 11 + 1.0) * (z - NECK - 0.08) / 0.11
        v.co.x *= k; v.co.y *= k
    sc.obj('pouch.cloth', b, cl, None, vcol=False)
    # coins heaped in the opening
    coins = core.new_bm()
    for k, (cx, cy, cz, tx_, ty_) in enumerate(((0.0, 0.0, NECK + 0.13, 0.15, 0.0), (0.09, 0.05, NECK + 0.12, 0.3, 0.5), (-0.09, 0.04, NECK + 0.12, -0.35, 0.2),
                                                  (0.03, -0.09, NECK + 0.11, 0.2, -0.4), (-0.05, -0.06, NECK + 0.15, -0.2, -0.3), (0.06, 0.1, NECK + 0.15, 0.5, 0.6))):
        c = core.new_bm(); core.lathe(c, [(0.0, -0.014), (0.085, -0.014), (0.09, 0.0), (0.085, 0.014), (0.0, 0.014)], segs=20)
        core.transform(c, Matrix.Translation((cx, cy, cz)) @ Matrix.Rotation(tx_, 4, 'X') @ Matrix.Rotation(ty_, 4, 'Y'))
        core.merge(coins, c)
    sc.obj('pouch.coins', coins, gold, None, vcol=False)
    # the rope tie: a ring round the neck, a knot in front, two cords hanging with a knot at the end
    r = core.new_bm()
    core.tube(r, [Vector((0.135 * math.cos(a), 0.135 * math.sin(a), NECK + 0.01 + 0.006 * math.sin(3 * a))) for a in np.linspace(0, 2 * math.pi, 25)], 0.028, sides=7, uv_v=0.3, closed=True)
    critters_knot = core.new_bm(); bmesh.ops.create_icosphere(critters_knot, subdivisions=2, radius=1.0)
    core.transform(critters_knot, Matrix.Translation((0.0, -0.15, NECK)) @ Matrix.Diagonal((0.06, 0.05, 0.05, 1)))
    core.merge(r, critters_knot)
    for sx, L in ((-0.05, 0.36), (0.06, 0.28)):
        core.tube(r, [Vector((0.0, -0.16, NECK - 0.02)), Vector((sx * 0.6, -0.33, NECK - 0.12)), Vector((sx, -0.37, NECK - L))], 0.022, sides=6, uv_v=0.3)
        e = core.new_bm(); bmesh.ops.create_icosphere(e, subdivisions=2, radius=1.0)
        core.transform(e, Matrix.Translation((sx, -0.37, NECK - L)) @ Matrix.Diagonal((0.04, 0.04, 0.045, 1)))
        core.merge(r, e)
    sc.obj('pouch.rope', r, rp, None, vcol=False)
    sc.empty('grip', 0, NECK + 0.02, 0, 0)
    export(sc, 'pouch', {'hands': 1, 'carry': 'side', 'grip': [0, NECK + 0.02, 0],
                         'notes': 'height 0.78; hangs from the hand by its cinched neck; gold coins show in the open top'})


def _critter_scene(name):
    core.reset(); sc = core.Scene(name)
    return sc, core.material('critter', None, vcol=True, rough=0.55)


def hen():
    """two hens (variants `brown`, `white`): the root `hen` wanders and pecks (look.js anim `hen`), its head pecks"""
    for var, cols in (('brown', ((0.72, 0.36, 0.16), (0.9, 0.62, 0.32), (0.5, 0.22, 0.1))),
                      ('white', ((0.95, 0.93, 0.88), (1.0, 0.98, 0.94), (0.55, 0.5, 0.45)))):
        sc, m = _critter_scene('hen-' + var)
        b, h, hp = critters.hen(*cols)
        root = sc.group('hen', None, props={'anim': 'hen'})
        sc.obj('hen.body', b, m, None, parent=root)
        sc.obj('hen.head', h, m, Matrix.Translation(hp), parent=root)
        export(sc, 'hen-' + var, {'notes': 'a hen ≈ 0.95 tall; wanders round its spot (radius = prop option, default 1.2) and pecks; seed = prop option'})


def donkey():
    sc, m = _critter_scene('donkey')
    b, h, hp, t, tp = critters.donkey_parts()
    root = sc.group('donkey', None)
    sc.obj('donkey.body', b, m, None, parent=root)
    sc.obj('donkey.head', h, m, Matrix.Translation(hp), parent=root, props={'anim': 'browse'})
    sc.obj('donkey.tail', t, m, Matrix.Translation(tp), parent=root, props={'anim': 'swish'})
    export(sc, 'donkey', {'notes': 'a donkey ≈ 2.8 tall at the ears, facing +Z; grazes / looks about, swishes its tail at random'})


def camel():
    sc, m = _critter_scene('camel')
    b, n, np_, t, tp = critters.camel_parts()
    root = sc.group('camel', None)
    sc.obj('camel.body', b, m, None, parent=root)
    sc.obj('camel.neck', n, m, Matrix.Translation(np_), parent=root, props={'anim': 'ruminate'})
    sc.obj('camel.tail', t, m, Matrix.Translation(tp), parent=root, props={'anim': 'swish'})
    export(sc, 'camel', {'notes': 'a camel lying down with a red blanket, ≈ 3.4 tall, facing +Z; chews and looks about, swishes its tail'})


def sickle():
    """a sickle (secera): a wooden handle and a curved iron blade; it hangs from the hand by the top of its handle
    (carry `side`), the blade hooking forward at the bottom — low by the stalks when the arm sweeps"""
    core.reset(); sc = core.Scene('sickle')
    wood = core.material('handle_wood', core.texset('wood', tex.wood, n=512, seed=4, planks=1))
    iron = core.material('sickle_iron', None, vcol=True, rough=0.35, metal=0.6)
    w, i = wheat.sickle()
    M = Matrix.Translation((0, 0, 0.78)) @ Matrix.Rotation(math.pi, 4, 'Y')
    core.transform(w, M); core.transform(i, M)
    core.cyl_uv(w, 1.0, 1.5)
    sc.obj('sickle.handle', w, wood, None, vcol=False)
    sc.obj('sickle.blade', i, iron, None)
    sc.empty('grip', 0, 1.06, 0, 0)
    export(sc, 'sickle', {'hands': 1, 'carry': 'side', 'grip': [0, 1.06, 0],
                          'notes': 'height 1.1; hangs from the hand by the top of the handle, the blade hooks forward (+Z) at the bottom'})


def _wheat_patch(sc, m, root, seed, W, D, cut, sheaf_at=None):
    import numpy as np
    from mathutils import Vector
    B = wheat.Builder()
    n = int(W * D * 34)
    for k in range(n):
        r = np.random.default_rng(seed * 7919 + k)
        x = (r.random() - 0.5) * W; y = (r.random() - 0.5) * D
        base = Vector((x, y, -0.03))
        if cut(x, y):
            if r.random() < 0.8:
                wheat.stub(B, base, r)
            continue
        if r.random() < 0.025:
            wheat.flower(B, base, r, 0, h=1.6 + 0.2 * r.random())
            continue
        lean = Vector(((r.random() - 0.5) * 0.3, (r.random() - 0.5) * 0.25 - 0.04))
        wheat.stalk(B, base, 2.0 + 0.3 * r.random(), lean, r)
    sc.obj(root.name + '.wheat', B.bm, m, None, parent=root, props={'anim': 'wind', 'base': 0.0})
    if sheaf_at is not None:
        sh = wheat.sheaf(seed + 5)
        sc.obj(root.name + '.sheaf', sh, m, Matrix.Translation(sheaf_at) @ Matrix.Rotation(0.08, 4, 'Z'), parent=root)


def wheat_patch():
    """a patch of standing wheat that is reaped in steps (variants w0 … w3 picked by its `bend`: 0, 1/3, 2/3, 1):
    the reaper's right side first; w3 = stubble and the sheaf lying on it"""
    core.reset(); sc = core.Scene('wheat')
    m = core.material('wheat', None, vcol=True, rough=0.7, double=True)
    W, D = 2.6, 1.5
    steps = [lambda x, y: False, lambda x, y: x > W / 6, lambda x, y: x > -W / 6, lambda x, y: True]
    for k, cut in enumerate(steps):
        root = sc.group(f'w{k}')
        _wheat_patch(sc, m, root, 11, W, D, cut, sheaf_at=(0.0, -0.15, 0.0) if k == 3 else None)
    export(sc, 'wheat', {'variants': ['w0', 'w1', 'w2', 'w3'], 'steps': True, 'soft': True,
                         'notes': '2.6 wide × 1.5 deep, ≈ 2.6 tall; bend 0 → 1 = reaped in three strokes; the reaper stands 1.3 in front (+Z), facing it'})


def sheaf():
    core.reset(); sc = core.Scene('sheaf')
    m = core.material('wheat', None, vcol=True, rough=0.7, double=True)
    sc.obj('sheaf', wheat.sheaf(3), m, None)
    sc.empty('grip', 0, 0.5, 0, 0)
    export(sc, 'sheaf', {'hands': 2, 'carry': 'front', 'notes': 'a sheaf of wheat lying along X, ≈ 1.9 long'})


def stook():
    core.reset(); sc = core.Scene('stook')
    m = core.material('wheat', None, vcol=True, rough=0.7, double=True)
    sc.obj('stook', wheat.stook(4), m, None)
    export(sc, 'stook', {'notes': 'a stook (claie) of seven sheaves, ≈ 2.4 tall'})


def sparrow():
    """little sparrows that hop about and peck the fallen grain (anim `hen` with `hop`)"""
    sc, m = _critter_scene('sparrow')
    b, h, hp = wheat.sparrow()
    root = sc.group('sparrow', None, props={'anim': 'hen', 'hop': 1})
    sc.obj('sparrow.body', b, m, None, parent=root)
    sc.obj('sparrow.head', h, m, Matrix.Translation(hp), parent=root)
    export(sc, 'sparrow', {'notes': 'a sparrow ≈ 0.4 tall; hops round its spot (radius, default 1.2) and pecks; seed = prop option'})


def ram():
    """the little ram given away in film 047 (a lamb-sized ram with curled horns): held in both arms in front of the chest,
    lying along X (head towards +X); on the ground it stands. Its head looks about (anim `peck`), its tail swishes."""
    sc, m = _critter_scene('ram')
    b, h, hp, t, tp = critters.sheep_parts((0.98, 0.96, 0.9), (0.3, 0.24, 0.21), s=0.62, horns=True, seed=5)
    root = sc.group('ram', Matrix.Rotation(math.pi / 2, 4, 'Z'))
    sc.obj('ram.body', b, m, None, parent=root)
    sc.obj('ram.head', h, m, Matrix.Translation(hp), parent=root, props={'anim': 'peck', 'freq': 0.4, 'seed': 19})
    sc.obj('ram.tail', t, m, Matrix.Translation(tp), parent=root, props={'anim': 'swish', 'seed': 23})
    sc.empty('grip', 0.45, 0.62, 0, 0)
    export(sc, 'ram', {'hands': 2, 'carry': 'front', 'grip': [0.45, 0.62, 0],
                       'notes': 'a little ram ≈ 1.05 tall, 1.25 long along X (head +X); carried in both arms; the head looks about'})


def crook():
    """a shepherd's crook (toiag): a long staff with a round hook on top; hangs upright from the hand at hand height"""
    core.reset(); sc = core.Scene('crook')
    wood = core.material('crook_wood', core.texset('crookwood', tex.wood, n=256, seed=21, planks=1, colors=('#a8784a', '#86592f', '#5f3d20')))
    from mathutils import Vector
    bm = core.new_bm()
    pts = [Vector((0, 0, 0.0)), Vector((0.02, 0, 2.0)), Vector((0, 0, 4.2))]
    for k in range(1, 12):
        a = k / 11 * math.pi * 1.3
        pts.append(Vector((0.32 - 0.32 * math.cos(a), 0, 4.2 + 0.36 * math.sin(a))))
    core.tube(bm, pts, [0.075] * 3 + [0.07 - 0.002 * k for k in range(11)], sides=8, uv_v=1.0)
    sc.obj('crook', bm, wood, None, vcol=False)
    sc.empty('grip', 0, 1.9, 0, 0)
    export(sc, 'crook', {'hands': 1, 'carry': 'side', 'grip': [0, 1.9, 0],
                         'notes': 'a staff ≈ 4.6 tall, hook on top; hangs upright from the hand (give the prop "lean": 0)'})


BOW_N = 9            # variants s0 … s8: the string drawn 0, 1/8 … 1 of the way (bend 0 → 1, in steps)
BOW_GRIP = 1.4       # the handle's middle (the bow is 2.8 tall)
BOW_BRACE = 0.35     # the string's distance from the handle at rest
BOW_PULL = 1.0      # how far back the string is drawn at bend 1


def bow():
    """a hunter's bow (arc) without an arrow: a wooden bow with a red-wrapped handle and a string. Held upright in the left
    hand (carry `side`, lean 0): the limbs along Y, the back of the bow towards +X (the figure's left = where he aims), the
    string towards -X. Variants s0 … s8 (`bend` 0 → 1, steps): the string drawn back BOW_BRACE + bend × BOW_PULL from the
    handle, the limbs bending with it — the draw clips (`draw1` … `draw3`) put the right hand on the string there."""
    core.reset(); sc = core.Scene('bow')
    wood = core.material('bow_wood', core.texset('bowwood', tex.wood, n=256, seed=31, planks=1, colors=('#c98a4a', '#a8683a', '#7c4a28')))
    wrap = core.material('bow_wrap', None, color=(0.78, 0.16, 0.12), rough=0.7)
    tips = core.material('bow_tips', None, color=(0.95, 0.85, 0.55), rough=0.5)
    string = core.material('bow_string', None, color=(0.97, 0.95, 0.88), rough=0.6)
    for k in range(BOW_N):
        u = k / (BOW_N - 1)
        root = sc.group(f's{k}')
        tipx, tipy = -(0.30 + 0.30 * u), 1.32 - 0.14 * u
        nock = -(BOW_BRACE + BOW_PULL * u)
        limb_pts = []
        for sgn in (1, -1):
            pts, rad = [], []
            for i in range(13):
                s_ = i / 12
                # a smooth limb: straight out of the handle, curving back towards the string at the tip
                x = tipx * s_ ** 2.2
                y = sgn * (0.2 + (tipy - 0.2) * s_)
                pts.append(Vector((x, 0.0, BOW_GRIP + y)))
                rad.append(0.075 - 0.04 * s_)
            limb_pts.append(pts)
            bm = core.new_bm()
            core.tube(bm, [Vector((0, 0, BOW_GRIP))] + pts, [0.08] + rad, sides=8, uv_v=1.0)
            sc.obj(f'bow{k}.limb{sgn}', bm, wood, None, vcol=False, parent=root)
            tb = core.new_bm(); critters.blob(tb, tuple(pts[-1]), (0.06, 0.06, 0.06), (1, 1, 1), subdiv=1)
            sc.obj(f'bow{k}.tip{sgn}', tb, tips, None, vcol=False, parent=root)
        hb = core.new_bm()
        core.tube(hb, [Vector((0, 0, BOW_GRIP - 0.26)), Vector((0, 0, BOW_GRIP + 0.26))], [0.1, 0.1], sides=10)
        sc.obj(f'bow{k}.handle', hb, wrap, None, vcol=False, parent=root)
        top, bot = limb_pts[0][-1], limb_pts[1][-1]
        sb = core.new_bm()
        mid = Vector((nock, 0.0, BOW_GRIP))
        core.tube(sb, [top, mid], [0.018, 0.018], sides=5, cap=False)
        core.tube(sb, [mid, bot], [0.018, 0.018], sides=5, cap=False)
        sc.obj(f'bow{k}.string', sb, string, None, vcol=False, parent=root)
    sc.empty('grip', 0, BOW_GRIP, 0, 0)
    export(sc, 'bow', {'hands': 1, 'carry': 'side', 'grip': [0, BOW_GRIP, 0], 'variants': [f's{k}' for k in range(BOW_N)], 'steps': True,
                       'string': {'brace': BOW_BRACE, 'pull': BOW_PULL, 'grip': BOW_GRIP},
                       'notes': 'a hunter\'s bow 2.8 tall, no arrow; hold it in "hand": "L" with "lean": 0 (upright, back towards the figure\'s left, string towards his right); the string follows the other hand: while the clips draw1 / draw2 / draw3 hold it, it is drawn exactly as far as the hand pulls (no `bend` needed)'})


PROPS = {'basket': basket, 'oil-lamp': oil_lamp, 'jug': jug, 'mat': mat, 'pouch': pouch, 'hen': hen, 'donkey': donkey, 'camel': camel,
         'sickle': sickle, 'wheat': wheat_patch, 'sheaf': sheaf, 'stook': stook, 'sparrow': sparrow, 'ram': ram, 'crook': crook, 'bow': bow}

# ---------------------------------------------------------------- the pack donkey and its loads (film 049)
def _load_mats():
    return {
        'weave': core.material('dates_weave', core.texset('dates_weave', tex.weave, n=256, seed=6, band=(0.45, 0.72, '#c8382c', '#2f5aa0'))),
        'dates': core.material('dates', None, vcol=True, rough=0.28),
        'leaf': core.material('date_leaves', None, vcol=True, rough=0.6, double=True),
        'burlap': core.material('burlap', core.texset('burlap', tex.cloth, n=256, seed=27, color='#bf9a62')),
        'bread': core.material('bread', None, vcol=True, rough=0.5),
        'mat': core.material('roll_weave', core.texset('roll_weave', tex.weave, n=256, seed=16, cells=10, diagonal=True, band=(0.3, 0.5, '#2f8a4a', '#c8382c'))),
        'ends': core.material('roll_ends', None, vcol=True, rough=0.8),
        'rope': core.material('load_rope', core.texset('load_rope', tex.rope, n=256, seed=7)),
    }


def _load(sc, M, name, kind, parent=None, M0=None, cache=None):
    """one load (`basket` / `sack` / `mat`) as separate meshes under `parent`; M0 = its placement (None = at the origin).
    cache: {kind: [(suffix, mesh)], kind + ':gz': grip z} — later copies share the mesh data (one copy in the GLB)"""
    T = M0 if M0 is not None else Matrix.Diagonal((dk.SCALE, dk.SCALE, dk.SCALE, 1))   # a free load = the size it has on the donkey
    if cache is not None and kind in cache:
        for suf, me in cache[kind]:
            sc.obj(name + suf, None, None, T, parent=parent, mesh=me)
        return cache[kind + ':gz']
    if kind == 'basket':
        w, d, lv, gz = dk.dates_basket()
        parts = [('.weave', w, M['weave'], False), ('.dates', d, M['dates'], True), ('.leaves', lv, M['leaf'], True)]
    elif kind == 'sack':
        b, rp, lo, gz = dk.bread_sack()
        parts = [('.cloth', b, M['burlap'], False), ('.rope', rp, M['rope'], False), ('.loaves', lo, M['bread'], True)]
    else:
        w, e, rp, gz = dk.mat_roll()
        parts = [('.weave', w, M['mat'], False), ('.ends', e, M['ends'], True), ('.rope', rp, M['rope'], False)]
    made = []
    for suf, bm, mat, vc in parts:
        ob = sc.obj(name + suf, bm, mat, T, parent=parent, vcol=vc)
        made.append((suf, ob.data))
    if cache is not None:
        cache[kind] = made; cache[kind + ':gz'] = gz
    return gz


def basket_dates():
    core.reset(); sc = core.Scene('basket-dates')
    gz = _load(sc, _load_mats(), 'basket', 'basket') * dk.SCALE
    sc.empty('grip', 0, gz, 0, 0)
    export(sc, 'basket-dates', {'hands': 1, 'carry': 'side', 'hangs': True, 'grip': [0, gz, 0],
                                'notes': 'a woven basket heaped with dates (palm leaves on top), 1.13 tall with the handle (arc along X); hangs from the hand by the handle; a load of `donkey-pack`'})


def sack_bread():
    core.reset(); sc = core.Scene('sack-bread')
    gz = _load(sc, _load_mats(), 'sack', 'sack') * dk.SCALE
    sc.empty('grip', 0, gz, 0, 0)
    export(sc, 'sack-bread', {'hands': 1, 'carry': 'side', 'hangs': True, 'grip': [0, gz, 0],
                              'notes': 'a burlap sack with two round loaves showing in its open neck, a rope loop on top (along X) = the handle, 1.3 tall; a load of `donkey-pack`'})


def mat_roll():
    core.reset(); sc = core.Scene('mat-roll')
    gz = _load(sc, _load_mats(), 'mat', 'mat') * dk.SCALE
    sc.empty('grip', 0, gz, 0, 0)
    export(sc, 'mat-roll', {'hands': 1, 'carry': 'side', 'hangs': True, 'grip': [0, gz, 0],
                            'notes': 'a rolled palm-leaf mat lying along X (1.44 long, 0.48 thick), two rope ties and a carrying loop on top; carried by the loop at the side ("turn": 1.57 = along the walk); a load of `donkey-pack`'})


def donkey_pack():
    """Urechilă, the pack donkey of film 049 (dk = kit/donkey.py): moving parts (head `browse` + bray, ears `ear`, lids
    `blink`, jaw `jaw`, tail `swish`, legs `gait`, bell `sway`) and the loads in steps l0 … l3 (bend 0 → 1): l1 the basket of
    dates on its right, l2 + the bread sack on its left, l3 + the rolled mat across the top."""
    core.reset(); sc = core.Scene('donkey-pack')
    coat = core.material('donkey_coat', None, vcol=True, rough=0.62)
    eye = core.material('donkey_eye', None, vcol=True, rough=0.1)
    cloth = core.material('donkey_blanket', None, vcol=True, rough=0.85)
    wood = core.material('saddle_wood', core.texset('saddle_wood', tex.wood, n=256, seed=33, planks=1, colors=('#b07a45', '#8c5a2e', '#64401f')))
    gold = core.material('bell_gold', None, color=(1.0, 0.7, 0.15), rough=0.2, metal=1.0, emissive=(0.5, 0.3, 0.0), emissive_strength=0.4)
    M = _load_mats()
    root = sc.group('donkey', Matrix.Translation((0, 0, -dk.DROP * dk.SCALE)) @ Matrix.Diagonal((dk.SCALE, dk.SCALE, dk.SCALE, 1)), props={'gaitroot': 1})
    sc.obj('donkey.body', dk.body(), coat, None, parent=root)
    sc.obj('donkey.girth', dk.girth(), coat, None, parent=root)
    sc.obj('donkey.blanket', dk.blanket(), cloth, None, parent=root)
    sc.obj('donkey.saddle', dk.saddle(), wood, None, parent=root, vcol=False)
    c, bell, bp = dk.collar()
    sc.obj('donkey.collar', c, coat, None, parent=root)
    sc.obj('donkey.bell', bell, gold, Matrix.Translation(bp), parent=root, vcol=False, props={'anim': 'sway', 'freq': 0.9, 'amp': 0.12})
    h, eyes, ears, jp = dk.head()
    hd = sc.obj('donkey.head', h, coat, Matrix.Translation(dk.HEAD_P) @ Matrix.Diagonal((1.15, 1.15, 1.15, 1)), parent=root, props={'anim': 'browse'})   # a big toy head (the poster)
    sc.obj('donkey.rope', dk.lead_rope(), M['rope'], None, parent=hd, vcol=False)
    for k, (p, d) in enumerate(eyes):
        sc.obj(f'donkey.eye{k}', dk.eye(d, k), eye, Matrix.Translation(p), parent=hd)
        sc.obj(f'donkey.lid{k}', dk.eyelid(d), coat, Matrix.Translation(p), parent=hd, props={'anim': 'blink', 'seed': 31})
    for k, p in enumerate(ears):
        s = -1 if k == 0 else 1
        sc.obj(f'donkey.ear{k}', dk.ear(s), coat, Matrix.Translation(p) @ Matrix.Rotation(s * 0.22, 4, 'Y') @ Matrix.Rotation(0.1, 4, 'X'),
               parent=hd, props={'anim': 'ear', 'side': s, 'seed': 41 + k * 7})
    sc.obj('donkey.jaw', dk.jaw(), coat, Matrix.Translation(jp), parent=hd, props={'anim': 'jaw'})
    sc.obj('donkey.tail', dk.tail(), coat, Matrix.Translation(dk.TAIL_P), parent=root, props={'anim': 'swish'})
    for k, (x, y) in dk.LEG_P.items():
        sc.obj(f'donkey.leg{k}', dk.leg(y < 0), coat, Matrix.Translation((x, y, dk.LEG_TOP)), parent=root, props={'anim': 'gait', 'leg': k})
    loads = {'basket': 0, 'sack': 0, 'mat': 0}
    order = ['basket', 'mat', 'sack']
    cache = {}
    for v in range(4):
        g = sc.group(f'l{v}', None)
        g.parent = root
        for kind in order[:v]:
            gz = _load(sc, M, f'l{v}.{kind}', kind, parent=g, M0=dk.slot_matrix(kind), cache=cache)
            if kind + ':ties' in cache:
                sc.obj(f'l{v}.{kind}.ties', None, None, None, parent=g, mesh=cache[kind + ':ties'])
            else:
                cache[kind + ':ties'] = sc.obj(f'l{v}.{kind}.ties', dk.hang_ropes(kind, gz), M['rope'], None, parent=g, vcol=False).data
    slots = {}
    for kind, (p, yaw) in dk.SLOTS.items():
        slots[kind] = {'pos': [round(p[0] * dk.SCALE, 3), round((p[2] - dk.DROP) * dk.SCALE, 3), round(-p[1] * dk.SCALE, 3)], 'face': yaw}
    export(sc, 'donkey-pack', {
        'variants': ['l0', 'l1', 'l2', 'l3'], 'steps': True, 'slots': slots, 'walker': True,
        'notes': 'Urechilă, a pack donkey ≈ 4 tall at the ears (back ≈ 2.6), facing +Z; head browses (or brays: prop gesture `bray`), ears twitch, '
                 'eyes blink, tail swishes; walks with `put … "walk": true`; loads in steps l0 … l3 (bend 0, 0.34, 0.67, 1): '
                 'basket of dates (its right, -X), bread sack (its left, +X), mat roll (on top, across X). slots: where each load '
                 'hangs (donkey space, three.js: x, y, z; face = its yaw in degrees) — put the free prop there, then step the bend'})


PROPS.update({'donkey-pack': donkey_pack, 'basket-dates': basket_dates, 'sack-bread': sack_bread, 'mat-roll': mat_roll})

def rain_cloud():
    """The rain cloud of film 050 (Avva Moise): the AI concept cloud (assets/3d/moise-nor.glb: fluffy grey-white lobes, a
    flat darker belly, a friendly little face towards +Z) scaled to 9 wide, origin = the middle of its belly. Variants (steps,
    `bend` 0 → 1): `dry` = the cloud alone, `rain` = + ~110 thin streaks of rain falling from the belly (glTF extra
    `anim: rain`: each loops down `fall` studs). Hang it with `"y"` ≈ 11 and fly it in with `put`."""
    core.reset(); sc = core.Scene('rain-cloud')
    S = 4.5
    cl = aimesh.load('moise-nor')
    aimesh.drop_loose(cl, 6)
    lo, hi = aimesh.bounds(cl)
    # the AI mesh is open underneath (holes, folded faces turned inwards): the sky showed through as white flecks under the
    # belly (film 050 feedback). Close every small hole with faces turned and textured like the skin round them.
    me = cl.data
    bm = bmesh.new(); bm.from_mesh(me)
    uvk = bm.loops.layers.uv.active
    old = set(bm.faces)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary], sides=30)
    new_f = [f for f in bm.faces if f not in old]
    bmesh.ops.triangulate(bm, faces=new_f)
    new_f = [f for f in bm.faces if f not in old]
    # each patch faces like the skin round it and takes the texture of the corner it closes (no new colour)
    newset = set(new_f)
    for f in new_f:
        nb_ = [g for e in f.edges for g in e.link_faces if g not in newset]
        if nb_ and sum((g.normal for g in nb_), Vector()).dot(f.normal) < 0:
            f.normal_flip()
        for l in f.loops:
            src = [m for m in l.vert.link_loops if m.face not in newset]
            if src:
                l[uvk].uv = src[0][uvk].uv
    bm.to_mesh(me); bm.free()
    print(f'  rain-cloud: {len(new_f)} faces close the holes')
    aimesh.fit(cl, S, ground=lo[2] + 0.12, centre=((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2))
    drop = core.material('rain_drop', None, color=(0.55, 0.78, 1.0), rough=0.2, emissive=(0.25, 0.5, 0.9), emissive_strength=0.6, alpha=0.75)
    dry = sc.group('dry'); wet = sc.group('rain')
    aimesh.finish(sc, cl, 'cloud', parent=dry, rough=0.95)
    for m_ in cl.data.materials:   # the few odd holes left show the cloud's own skin, not a dark gap
        m_.use_backface_culling = False
    aimesh.share(sc, cl, 'cloud.rain', parent=wet)
    t = core.new_bm(); core.box(t, (0.06, 0.06, 1.2), (0, 0, 0), bevel=0.0, segs=1)
    me = bpy.data.meshes.new('streak'); t.to_mesh(me); t.free()
    n = 110
    for k in range(n):
        a = k * 2.399963; r = math.sqrt((k + 0.5) / n)
        x, y = r * math.cos(a) * 3.4, r * math.sin(a) * 3.0
        z = -0.5 - ((k * 0.6180339) % 1.0) * 9.0
        sc.obj(f'rain.{k}', None, drop, Matrix.Translation((x, y, z)), parent=wet, mesh=me, vcol=False,
               props={'anim': 'rain', 'fall': 9.0, 'phase': (k * 0.37) % 1.0, 'speed': 1.7 + (k % 5) * 0.12, 'seed': k})
    export(sc, 'rain-cloud', {'variants': ['dry', 'rain'], 'steps': True,
                              'notes': 'a friendly rain cloud ≈ 9 wide, 6.5 tall with a little face towards +Z (origin = belly middle); bend 0 = dry, 1 = raining: streaks fall 9 below the belly'})


def water_jar():
    """A big glossy terracotta water jar (film 050): the AI concept jar (assets/3d/moise-ulcior-apa.glb) scaled to 1.6 tall,
    two side handles. Variants (steps): `empty` = the water surface cut away, a dark clay inside; `full` = brimming with blue
    water. `bend` 0 → 1 fills it (rain)."""
    core.reset(); sc = core.Scene('water-jar')
    S = 0.85
    j = aimesh.load('moise-ulcior-apa')
    aimesh.drop_loose(j, 6)
    lo, hi = aimesh.bounds(j)
    G = lo[2]
    aimesh.fit(j, S, ground=G, centre=(0.0, 0.0))
    full = sc.group('full'); empty = sc.group('empty')
    aimesh.finish(sc, j, 'jar.full', parent=full, rough=0.45)
    # the empty one: the same jar without its water surface (a copy of the mesh), a dark clay inside
    e = j.copy(); e.data = j.data.copy(); bpy.context.scene.collection.objects.link(e)
    R = 0.585 * S
    aimesh.cut(e, lambda c, n: math.hypot(c.x, c.y) < R and c.z > (0.6 - G) * S)
    aimesh.finish(sc, e, 'jar.empty', parent=empty, rough=0.45)
    top = (0.87 - G) * S
    ins = core.new_bm()
    core.lathe(ins, [(0.0, top - 0.75), (R * 0.85, top - 0.75), (R, top - 0.5), (R + 0.01, top + 0.02)], segs=32)
    for f in ins.faces:
        f.normal_flip()
    sc.obj('jar.empty.inside', ins, core.material('jar_inside', None, color=(0.22, 0.11, 0.06), rough=0.9), None, parent=empty, vcol=False)
    sc.empty('grip', 0, 1.2, 0, 0)
    export(sc, 'water-jar', {'variants': ['empty', 'full'], 'steps': True, 'hands': 1, 'carry': 'side',
                             'notes': 'a big terracotta water jar 1.6 tall, 1.7 wide with the handles; bend 0 = empty (dark inside), 1 = full (blue water at the mouth)'})


def lentil_pot():
    """A small dark cooking pot with red lentils in it (film 050): the AI concept pot (assets/3d/moise-oala-linte.glb, its
    lid left out), 1.2 wide with the two handles (along X), 0.77 tall. Carried in both hands."""
    core.reset(); sc = core.Scene('lentil-pot')
    p = aimesh.load('moise-oala-linte')
    aimesh.keep(p, lambda c: c.x > -0.2)
    aimesh.drop_loose(p, 6)
    lo, hi = aimesh.bounds(p)
    aimesh.fit(p, 1.0, ground=lo[2], centre=((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2))
    aimesh.finish(sc, p, 'pot', rough=0.4)
    sc.empty('grip', 0, 0.55, 0, 0)
    export(sc, 'lentil-pot', {'hands': 2, 'carry': 'front', 'notes': 'a dark cooking pot with red lentils, 1.2 wide (handles along X), 0.77 tall'})


def campfire():
    """A little cooking fire (film 050): a ring of stones and crossed sticks. Variants (steps): `cold` (no flame) → `lit`
    (flames + glowing embers; `flame*` meshes → look.js adds a flickering light). A pot sits on the stones at y 0.3."""
    core.reset(); sc = core.Scene('campfire')
    stone = core.material('fire_stone', core.texset('sandstone', tex.sandstone, n=512, seed=2), vcol=True)
    wood = core.material('fire_wood', core.texset('palmwood', tex.wood, n=256, seed=14, planks=1, colors=('#9d7a52', '#7a5636', '#553820')))
    ember = core.material('ember', None, color=(1.0, 0.35, 0.08), emissive=(1.0, 0.3, 0.05), emissive_strength=3.0, rough=0.6)
    fl = core.material('flame', None, color=(1.0, 0.62, 0.2), emissive=(1.0, 0.55, 0.15), emissive_strength=6.0)
    ring = core.new_bm()
    for k in range(9):
        a = k / 9 * 2 * math.pi
        r_ = core.rock(300 + k, size=(0.3, 0.24, 0.32), facets=5, detail=0.08, subdiv=2, sink=0.05)
        core.merge(ring, r_, Matrix.Translation((math.cos(a) * 0.62, math.sin(a) * 0.62, 0)) @ Matrix.Rotation(a, 4, 'Z'))
    core.box_uv(ring, 1.0)
    core.set_color(ring, (0.85, 0.8, 0.74))
    sticks = core.new_bm()
    for k in range(4):
        a = k / 4 * math.pi + 0.3
        d = Vector((math.cos(a), math.sin(a), 0))
        core.tube(sticks, [d * -0.55 + Vector((0, 0, 0.06)), d * 0.55 + Vector((0, 0, 0.12 + 0.04 * k))], 0.06, sides=6)
    for var in ('cold', 'lit'):
        g = sc.group(var)
        r1 = ring.copy(); s1 = sticks.copy()
        sc.obj(var + '.stones', r1, stone, None, parent=g)
        sc.obj(var + '.sticks', s1, wood, None, parent=g, vcol=False)
        if var == 'lit':
            em = core.new_bm()
            for k in range(7):
                critters.blob(em, (0.25 * math.cos(k * 0.9), 0.25 * math.sin(k * 0.9), 0.06), (0.12, 0.1, 0.05), (1, 0.4, 0.1), subdiv=1)
            sc.obj('lit.embers', em, ember, None, parent=g, vcol=False)
            for k, (x, y, h) in enumerate(((0.0, 0.0, 0.9), (0.42, 0.1, 0.6), (-0.35, 0.28, 0.55), (-0.1, -0.42, 0.6))):
                sc.obj(f'lit.flame{k}', critters.flame_mesh(h, h * 0.35), fl, Matrix.Translation((x, y, 0.08)), parent=g, vcol=False)
    sc.empty('grip', 0, 0.3, 0, 0)
    export(sc, 'campfire', {'variants': ['cold', 'lit'], 'steps': True,
                            'notes': 'a ring of stones (radius 0.62, 0.3 high) with crossed sticks; bend 0 = cold, 1 = lit (flames 0.9 high, a flickering light). A pot on it: y 0.3'})


PROPS.update({'rain-cloud': rain_cloud, 'water-jar': water_jar, 'lentil-pot': lentil_pot, 'campfire': campfire})


import bakery  # noqa: E402  (film 051)
import palm_craft  # noqa: E402
bakery.export = export
PROPS.update(bakery.PROPS)
PROPS.update({name: lambda name=name: palm_craft.build(name, export) for name in palm_craft.PROPS})


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    for n in (args or PROPS):
        PROPS[n]()
        for f in sorted(os.listdir(OUT)):
            if f.startswith(n) and f.endswith('.glb'): print(f, os.path.getsize(os.path.join(OUT, f)) // 1000, 'kB')
