"""Set `cell-room`: the inside of a ROUND hermit's stone cell (film 052, Avva Pimen and his brothers) — after the user's
picture: warm honey-stone walls in a circle, a ceiling of round wooden beams, an icon of the Saviour on the back wall (a real
public-domain icon, AGENTS.md rule 15) over a low wooden bench with books, a striped towel and a clay oil lamp, three plump
floor cushions (yellow, red, green — one for each brother, `seat:<colour>`), a striped rug, a low round table with olives
and a cup, clay jars, baskets, a jug, a stone bench, a cat asleep by the door. The room is round and closed (cameras inside;
closed all round — cameras stand inside); the arched doorway with a plank door is on the RIGHT (+X, heading 90):
outside, the sunny path, an olive tree, a flowering bush and far lilac hills.

three.js layout (x right, z towards the usual camera, y up; figure 4.2 tall):
  * circle centre C, inner radius R, ceiling HT; wall TW thick; keep cameras at y ≤ 4.5 (the beams stay out of the frame);
  * arched doorway at heading 90 (x = C.x + R), DOOR_W wide, straight to DOOR_H + a half-round top, door leaf `door:cell`;
  * the icon on the back wall (heading 180), the bench under it; prayer spots `pray-a/b/c` in front of it (facing 180);
  * cushions in the front half: yellow (Paisie) left, red (Avva Pimen), green (Anuv) — sit with `posture: "sit"` there.
AI pieces: assets/3d/pimen-*.glb, obiect-*.glb, pitarie-*.glb, piatra-*.glb (Hunyuan3D-2mv)."""
import math
import os
import json
from mathutils import Matrix, Vector

from kit import core, tex, pieces, critters, aimesh
from kit.core import B, place, Batch, Scene
from kit.olives import OliveTrees
from desert_rock import _leaf

NAME = 'cell-room'
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ICON = os.path.join(ROOT, 'assets', 'icons', 'mantuitorul-din-poza.jpg')
TEXD = os.path.join(ROOT, 'assets', 'textures')
C = (0.0, -2.5)
R, TW, HT = 7.4, 0.9, 9.6
FRONT_A = 300.0                     # the wall's front half (FRONT_A … DOOR_A, round the camera side) casts no shadow
DOOR_A, DOOR_W, DOOR_H = 90.0, 4.8, 4.95    # an arched doorway: straight up to DOOR_H, then a half-round top (outside: the same)
SEAT_H = 0.64
BENCH_H = 1.59                      # top of the bench plank (measured from the AI model)
CUSH = {'yellow': (-4.6, -1.4, 70.0), 'red': (-1.6, -3.6, 20.0), 'green': (1.6, -3.6, -20.0)}   # the back half stays free: icon ↔ door


def at(h, r):
    a = math.radians(h)
    return (C[0] + math.sin(a) * r, C[1] + math.cos(a) * r)


def H(x, z):
    return 0.0


def wall_arc(bm, inner, outer, bottom, top, jamb=None):
    """A curved wall strip whose underside can follow the doorway arch."""
    uv = bm.loops.layers.uv[core.UV0]
    ri, ro = R, R + TW

    def V(h, r, y):
        x, z = at(h, r)
        return bm.verts.new(B(x, y, z))

    rows = [(V(hi, ri, y), V(hi, ri, top), V(ho, ro, top), V(ho, ro, y))
            for hi, ho, y in zip(inner, outer, bottom)]

    def face(vs, want, uvs):
        f = bm.faces.new(vs)
        f.normal_update()
        if f.normal.dot(want) < 0:
            f.normal_flip()
        for l in f.loops:
            l[uv].uv = uvs(l.vert)

    def arc(angle, radius):
        # Whole tiles around the full turn keep the texture continuous where the wall strips meet.
        tiles = round(2 * math.pi * radius / 5.0)
        return lambda v: (angle[v] * tiles / 360.0, v.co.z / 5.0)

    up = Vector((0, 0, 1))
    flat = lambda v: (v.co.x / 5.0, v.co.y / 5.0)
    for i, (a, b) in enumerate(zip(rows, rows[1:])):
        mid = (a[0].co + b[0].co) / 2
        hi, hj = inner[i:i + 2]
        face((a[0], b[0], b[1], a[1]), B(*_xz3(C, mid.z)) - mid,
             arc({a[0]: hi, a[1]: hi, b[0]: hj, b[1]: hj}, ri))
        face((a[1], b[1], b[2], a[2]), up, flat)
        mo = (a[3].co + b[3].co) / 2
        ho, hp = outer[i:i + 2]
        face((a[2], b[2], b[3], a[3]), mo - B(*_xz3(C, mo.z)),
             arc({a[2]: ho, a[3]: ho, b[2]: hp, b[3]: hp}, ro))
        if bottom[i] > 0.01:
            face((a[3], b[3], b[0], a[0]), -up, flat)
    if jamb is not None:
        row = rows[jamb]
        vi = V(inner[jamb], ri, DOOR_H)
        vo = V(outer[jamb], ro, DOOR_H)
        neighbor = rows[1 if jamb == 0 else -2]
        face((row[0], vi, vo, row[3]), row[0].co - neighbor[0].co, flat)


def disc(bm, y, r, h0=0.0, h1=360.0, n=72, down=False, tile=4.4):
    """A flat polygon (a circle, or an arc closed by its chord) at height y, as a triangle fan around the centre."""
    uv = bm.loops.layers.uv[core.UV0]
    full = (h1 - h0) >= 359.9
    k = n if full else n + 1
    ring = [bm.verts.new(B(*_xz3(at(h0 + (h1 - h0) * i / n, r), y))) for i in range(k)]
    if full:
        c = bm.verts.new(B(C[0], y, C[1]))
    else:
        mx, mz = (at(h0, r)[0] + at(h1, r)[0]) / 2, (at(h0, r)[1] + at(h1, r)[1]) / 2
        c = bm.verts.new(B(mx, y, mz))
    pairs = [(ring[i], ring[(i + 1) % k]) for i in range(k if full else k - 1)]
    for a, b in pairs:
        f = bm.faces.new((c, a, b))
        f.normal_update()
        if (f.normal.z < 0) != down:
            f.normal_flip()
        for l in f.loops:
            l[uv].uv = (l.vert.co.x / tile, l.vert.co.y / tile)


def _xz3(p, y):
    return (p[0], y, p[1])


def build(out_dir, bake=True):
    core.reset()
    sc = Scene(NAME)
    T = core.texset
    sand_t = T('sand_meadow', tex.sand, n=512, seed=3, base=('#ecd29a', '#dcbb7c', '#c9a564'), ripples=False)
    # painted textures after the user's picture (tools/texture-ai.mjs → assets/textures/pimen-*.jpg)
    wall_t = T('cellwall', tex.image_tex, n=1024, path=os.path.join(TEXD, 'pimen-zid.jpg'), relief=2.4)
    floor_t = T('cellfloor', tex.image_tex, n=1024, path=os.path.join(TEXD, 'pimen-podea.jpg'), relief=1.8, bright=0.95)
    beam_t = T('beam', tex.image_tex, n=1024, path=os.path.join(TEXD, 'pimen-barna.jpg'), relief=1.6, rough=0.7, rotate=True)
    plank_t = T('ceilplank', tex.wood, n=512, seed=15, planks=5, colors=('#b07a45', '#8e5c30', '#6a421f'))
    frame_t = T('doorframe', tex.wood, n=512, seed=16, planks=1, colors=('#b98552', '#8f5d34', '#6b4224'))
    m = {
        'ground': core.material('ground', sand_t, extras={'detail': 'sand'}),
        'floor': core.material('cellfloor', floor_t, rough=0.9),
        'wall': core.material('cellwall', wall_t, rough=0.9),
        'beam': core.material('beam', beam_t, rough=0.7),
        'plank': core.material('ceilplank', plank_t, rough=0.8),
        'frame': core.material('doorframe', frame_t, rough=0.7),
        'crit': core.material('critter', None, vcol=True, rough=0.6),
        'flame': core.material('flame', None, color=(1.0, 0.62, 0.2), emissive=(1.0, 0.55, 0.15), emissive_strength=6.0),
        'grass': core.material('grass', None, vcol=True, rough=0.8, double=True),
        'rug': core.material('rug', None, vcol=True, rough=0.95),
        'door': core.material('door_wood', T('doorwood', tex.wood, n=512, seed=54, colors=('#b07a42', '#8e5c30', '#6a421f'))),
        'iron': core.material('iron', None, color=(0.16, 0.14, 0.13), rough=0.45, metal=0.6),
    }
    reserve = []

    # ------------------------------------------------ ground: sunny sand outside, a round stone floor inside
    g = core.new_bm()
    uvl = g.loops.layers.uv[core.UV0]
    N, S0 = 40, 5.0
    vs = [[g.verts.new(B(-100 + i * S0, 0.0, -100 + j * S0)) for i in range(N + 1)] for j in range(N + 1)]
    for j in range(N):
        for i in range(N):
            f = g.faces.new((vs[j][i], vs[j + 1][i], vs[j + 1][i + 1], vs[j][i + 1]))
            for l in f.loops:
                l[uvl].uv = (l.vert.co.x / 8, l.vert.co.y / 8)
    gb = Batch('ground', m['ground'], ao=1024, ao_uv=core.UV0)
    gb.bm.free(); gb.bm = g
    sc.batches['ground'] = gb
    fl = core.new_bm(); disc(fl, 0.02, R + TW * 0.6, n=96)
    sc.batch('ground_floor', m['floor'], ao=1024).add(fl)
    # a striped woven rug before the icon (where the brothers pray)
    rg = core.new_bm()
    stripes = ((0.78, 0.22, 0.16), (0.95, 0.78, 0.42), (0.2, 0.42, 0.55), (0.95, 0.78, 0.42))
    RW, RD, NS = 6.4, 2.2, 12
    for i in range(NS):
        s = core.new_bm()
        core.box(s, (RW / NS + 0.001, RD, 0.03), (-RW / 2 + (i + 0.5) * RW / NS, 0, 0.04), bevel=0.0, segs=1)
        core.set_color(s, stripes[i % len(stripes)])
        core.merge(rg, s)
    sc.batch('rug', m['rug'], vcol=True, ao=False).add(rg, place(0.0, -5.7, 0))

    # ------------------------------------------------ the closed round wall, an ARCHED doorway on the right (the same size and
    # shape as the outside door of the `olive-hermitage` cell) with a plank door leaf on its hinge (`door:cell`)
    half = DOOR_W / 2

    def heading_at(z, radius):
        return DOOR_A - math.degrees(math.asin(z / radius))

    def headings(start, end, count):
        return [start + (end - start) * i / count for i in range(count + 1)]

    inner_right, outer_right = heading_at(-half, R), heading_at(-half, R + TW)
    inner_left, outer_left = heading_at(half, R), heading_at(half, R + TW)
    top = HT + 0.6
    wb = core.new_bm(); wf = core.new_bm()
    wall_arc(wb, headings(inner_right, FRONT_A, 40), headings(outer_right, FRONT_A, 40), [0.0] * 41, top, jamb=0)
    wall_arc(wf, headings(FRONT_A, inner_left + 360, 30), headings(FRONT_A, outer_left + 360, 30), [0.0] * 31, top, jamb=-1)
    # The stone follows the same radii over the opening, with its underside following the leaf's arch.
    arch = [math.pi * i / 18 for i in range(19)]
    arch_z = [half * math.cos(a) for a in arch]
    wall_arc(wb, [heading_at(z, R) for z in arch_z], [heading_at(z, R + TW) for z in arch_z],
             [DOOR_H + half * math.sin(a) for a in arch], top)
    sc.batch('walls', m['wall'], ao_density=10).add(wb)
    # the front half casts no shadow: the sun still falls into the room (the camera side, like the open doll's house before)
    sc.batch('walls_front', m['wall'], ao_density=10, shadow=False).add(wf)
    h0, h1 = inner_right, inner_left + 360.0
    n = int(math.ceil((h1 - h0) / 10.0))
    for i in range(n):
        a0, a1 = h0 + (h1 - h0) * i / n, h0 + (h1 - h0) * (i + 1) / n
        hm = (a0 + a1) / 2
        x, z = at(hm, R + TW / 2)
        w = 2 * (R + TW) * math.sin(math.radians(a1 - a0) / 2) + 0.15
        sc.col_box('wall%d' % i, (w, HT, TW), x, z, hm)
    dx, dz = at(DOOR_A, R + TW / 2)
    Md = place(dx, dz, DOOR_A)                     # door space: x along the wall (-x = +Z, the hinge side), -y = outwards
    sc.col_box('wall-lintel', (DOOR_W, HT - DOOR_H, TW), dx, dz, DOOR_A, DOOR_H)
    YIN = 0.95
    YOUT = dx - math.sqrt((R + TW) ** 2 - half ** 2) - 0.08  # the hinge just outside the curved jamb
    fr = core.new_bm()
    core.box(fr, (DOOR_W + 0.3, YIN - YOUT + 0.2, 0.12), (0, (YIN + YOUT) / 2, 0.06), bevel=0.04)      # the wooden sill
    sc.batch('frame', m['frame']).add(fr, Md, uv_box=2.2)
    # the door leaf (planks, a half-round top, iron bands outside), hinge on the +Z jamb at the outer face
    lw = DOOR_W - 0.06
    wood, iron = _leaf(lw, DOOR_H, 0.2)
    hinge_local = Vector((-DOOR_W / 2 + 0.03, YOUT, 0.0))
    Mh = Md @ Matrix.Translation(hinge_local)
    door_ob = sc.obj('door:cell', wood, m['door'], Mh, vcol=False)
    sc.obj('door:cell.iron', iron, m['iron'], None, parent=door_ob, vcol=False)
    me = door_ob.data
    uvl_ = me.uv_layers.get(core.UV0) or me.uv_layers.new(name=core.UV0)
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uvl_.data[li].uv = (v.x / 2.6 + (v.y if abs(poly.normal.y) < 0.5 else 0), v.z / 2.6)
    hw = Mh.to_translation()
    on = Md.to_3x3() @ Vector((0, -1, 0))
    leaf = {'hinge': [round(hw.x, 3), round(-hw.y, 3)], 'length': round(lw, 3), 'out': [round(on.x, 3), round(-on.y, 3)]}

    # ------------------------------------------------ ceiling: planks over round beams (no shadow: the room stays sunny)
    cl = core.new_bm(); disc(cl, HT, R + 0.3, n=72, down=True, tile=3.0)
    sc.batch('ceiling', m['plank'], ao=False, shadow=False).add(cl)
    bm_ = core.new_bm()
    for k in range(5):                                      # the roof beams run along the camera direction (Z), wall to wall
        x = C[0] - 5.2 + k * 2.6
        hz = math.sqrt((R + 0.5) ** 2 - (x - C[0]) ** 2)
        core.tube(bm_, [Vector((x, -(C[1] - hz), HT - 0.34)), Vector((x, -(C[1] + hz), HT - 0.34))], 0.34, sides=18, uv_v=4.0, cap=False)
    sc.batch('beams', m['beam'], ao=False, shadow=False).add(bm_)
    # a thick log round the top of the wall (the picture's walls with beams)
    wp = core.new_bm()
    yb = HT - 1.0
    pts = [Vector(B(*_xz3(at(360.0 * i / 72, R - 0.3), yb))) for i in range(72)]
    core.tube(wp, pts, 0.32, sides=18, uv_v=4.0, cap=False, closed=True)
    sc.batch('beams_walls', m['beam'], ao_density=8, shadow=False).add(wp)

    # ------------------------------------------------ the icon on the back wall (rule 15: a real icon), a wooden board behind
    from PIL import Image
    w_, h_ = Image.open(ICON).size
    IH = 2.1; IW = IH * w_ / h_
    IY = 3.3
    FW = 0.3
    ix, iz = at(180.0, R - 0.2)
    board = core.new_bm(); core.box(board, (IW + 2 * FW, 0.12, IH + 2 * FW), (0, 0, IY - FW + (IH + 2 * FW) / 2), bevel=0.03)
    for (bw, bh, bx_, bz_) in ((IW + 2 * FW, FW, 0, IY - FW / 2), (IW + 2 * FW, FW, 0, IY + IH + FW / 2), (FW, IH, -IW / 2 - FW / 2, IY + IH / 2), (FW, IH, IW / 2 + FW / 2, IY + IH / 2)):
        core.box(board, (bw, 0.22, bh), (bx_, -0.11, bz_), bevel=0.1)
    iframe_t = T('iconframe', tex.wood, n=512, seed=17, planks=1, colors=('#d99a52', '#b9773a', '#94582a'))
    sc.batch('iconframe', core.material('iconframe', iframe_t, rough=0.45)).add(board, place(ix, iz + 0.07, 0), uv_box=2.0)
    icon_m = core.material('icon', (ICON, None, None), rough=0.5, extras={'unlit': True})
    pic = core.new_bm()
    uv = pic.loops.layers.uv[core.UV0]
    y = 0.15
    cs = [(-IW / 2, IY), (IW / 2, IY), (IW / 2, IY + IH), (-IW / 2, IY + IH)]
    vv = [pic.verts.new((x, -y, z)) for x, z in cs]
    f = pic.faces.new(vv)
    for l, t in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        l[uv].uv = t
    f.normal_update()
    if f.normal.y > 0:
        f.normal_flip()
    sc.obj('icon', pic, icon_m, place(ix, iz, 0), vcol=False)

    # ------------------------------------------------ AI dressing
    ai_cache = {}

    def ai_piece(name, x, z, face, height, k=0, col=True, sink=0.01, y=0.0, props=None, rough=0.55, spec=0.3):
        if not os.path.exists(os.path.join(aimesh.SRC, name + '.glb')):
            print(f'  (no {name}.glb yet — skipped)')
            return None
        if name not in ai_cache:
            ob = aimesh.load(name)
            aimesh.drop_loose(ob, 12)
            lo, hi = aimesh.bounds(ob)
            s = height / (hi[2] - lo[2])
            aimesh.fit(ob, s, ground=lo[2] + sink * (hi[2] - lo[2]), centre=((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2))
            lo2, hi2 = aimesh.bounds(ob)
            ai_cache[name] = (aimesh.finish(sc, ob, f'{name}.{k}', place(x, z, face, y), rough=rough, spec=spec, props=props), lo2, hi2)
            if name == 'pimen-tufa-flori':
                aimesh.foliage(ai_cache[name][0])
        else:
            aimesh.share(sc, ai_cache[name][0], f'{name}.{k}', place(x, z, face, y), props=props)
        _, lo2, hi2 = ai_cache[name]
        w, d = hi2[0] - lo2[0], hi2[1] - lo2[1]
        if col:
            sc.col_box(f'{name}{k}', (w * 0.9, height + y, d * 0.9), x, z, face)
        reserve.append((x, z, max(w, d) / 2 + 0.3))
        return (w, d)

    bx, bz = at(180.0, R - 0.85)
    ai_piece('pimen-polita', bx, bz, 0, 2.1)                         # the bench under the icon: books, a striped towel
    lx, lz = bx - 0.9, bz + 0.15
    ai_piece('obiect-opait', lx, lz, 20, 0.42, col=False, y=BENCH_H)
    sc.obj('flame.lamp', critters.flame_mesh(0.24, 0.06), m['flame'], place(lx, lz, 0, BENCH_H + 0.36), vcol=False,
           props={'lightIntensity': 7.0, 'lightDistance': 14.0, 'lightColor': '#ffcf8f'})
    for key, glb in (('yellow', 'pimen-perna-galbena'), ('red', 'pimen-perna-rosie'), ('green', 'pimen-perna-verde')):
        cx_, cz_, cf_ = CUSH[key]
        # Place the cushion under the hips, with its front edge clear of the feet.
        a = math.radians(cf_)
        ai_piece(glb, cx_ - 0.42 * math.sin(a), cz_ - 0.42 * math.cos(a), cf_, 0.62, col=False)
    tx, tz = at(232.0, R - 1.6)
    ai_piece('pimen-masuta', tx, tz, 10, 0.95)                         # the low table: olives and a cup on it
    ai_piece('obiect-castron-masline', tx - 0.15, tz + 0.1, 0, 0.42, col=False, y=0.95)
    ai_piece('obiect-cana-lemn', tx + 0.45, tz - 0.35, 0, 0.36, col=False, y=0.95)
    for (name, h, r, face, height) in (('pitarie-chiupuri', 128.0, R - 0.9, -40, 1.7),      # clay jars, back right
                                       ('obiect-ulcior-albastru', 112.0, R - 0.8, -70, 1.25),  # the water jug
                                       ('piatra-cosuri', 212.0, R - 1.1, 30, 1.2),          # baskets, back left
                                       ('piatra-banca', 262.0, R - 1.1, 95, 1.0),          # a stone bench on the left
                                       ('pimen-cos', 290.0, R - 1.0, 110, 0.9)):           # a basket, front left
        x_, z_ = at(h, r)
        ai_piece(name, x_, z_, face, height)
    # a cat curled up asleep by the door (eyes shut, the tail tip twitches slowly)
    cx, cz = at(66.0, R - 1.3)
    cb, ct, tp = critters.cat_asleep()
    coat = core.material('ginger_coat', None, vcol=True, rough=0.84)
    ck = sc.obj('cat', cb, coat, place(cx, cz, -60, 0.021, 1.3))
    sc.obj('cat.tail', ct, coat, Matrix.Translation(tp), parent=ck, props={'anim': 'sway', 'amp': 0.032, 'freq': 0.18})
    sc.col_box('cat', (1.2, 0.8, 1.4), cx, cz, -60)

    # ------------------------------------------------ outside, seen through the doorway: an olive tree, a flowering bush,
    # boulders, flowers on the sunny sand, far lilac hills; a dove pecking by the sill
    olives = OliveTrees(sc)
    olives.add('pimen-maslin.0', 19.0, -7.5, 30, 0.0, 8.5, variant=2)
    sc.col_box('pimen-maslin0', (2.1, 8.5, 1.8), 19.0, -7.5, 30)
    ai_piece('pimen-tufa-flori', 13.5, 0.5, 0, 1.6, rough=0.9, spec=0.08)
    ai_piece('pimen-tufa-flori', 15.0, -11.0, 70, 2.0, k=1, rough=0.9, spec=0.08)
    ai_piece('pimen-bolovani', 22.0, 2.5, -40, 1.8)
    pal = ((1.0, 0.85, 0.2), (1.0, 1.0, 0.95), (0.98, 0.45, 0.55), (0.95, 0.6, 0.2))
    for i, (x, z) in enumerate(((11.2, -6.5), (12.0, 2.8), (14.5, -3.6), (17.0, 3.5), (20.0, -2.5), (25.0, -5.0), (13.0, -9.0))):
        sc.batch('flowers', m['grass'], vcol=True, ao=False).add(critters.flowers(3100 + i, n=8, radius=0.55, palette=pal), place(x, z, 0))
        sc.batch('flowers', None).add(critters.green_tuft(3150 + i), place(x + 0.6, z - 0.4, 0))
    db, dh, hp = critters.dove()
    dv = sc.obj('dove0', db, m['crit'], place(10.6, 0.2, 230, 0.0))
    sc.obj('dove0.head', dh, m['crit'], Matrix.Translation(hp), parent=dv, props={'anim': 'peck', 'freq': 0.55})
    far = core.material('distant_hills', T('lilachill', tex.sandstone, n=512, seed=61, tint=[(0, '#b49ab8'), (0.5, '#c8b0c6'), (1, '#dcc8d6')]))
    for k_, (mx_, mz_, w_, d_, h_) in enumerate(((70, -30, 60, 40, 14), (80, 30, 70, 40, 18), (-20, -120, 120, 40, 16), (-10, 120, 120, 40, 14))):
        sc.batch('distant_hills', far, ao=False).add(pieces.mesa(870 + k_, w_, d_, h_, tile=16.0), place(mx_, mz_, math.degrees(math.atan2(-mx_, -mz_)), -0.5))

    # ------------------------------------------------ anchors
    A = lambda n, x, z, face, note: sc.anchor(n, x, z, face, 0.0, note)
    A('center', C[0], C[1] + 1.0, 0.0, 'the middle of the room, facing the camera side')
    A('pray-a', ix - 1.15, iz + 3.3, 180.0, 'praying spot left, facing the icon')
    A('pray-b', ix + 1.15, iz + 3.3, 180.0, 'praying spot right, facing the icon')
    A('pray-c', ix + 2.9, iz + 4.3, 180.0, 'a third praying spot, right behind, facing the icon')
    A('icon', ix, iz + 0.2, 0.0, 'the icon on the back wall (y 3.3 … 5.4)')
    for k_, (sx_, sz_, sf_) in CUSH.items():
        sc.seat(k_, sx_, SEAT_H, sz_, sf_, 'on the %s floor cushion' % k_)
        a_ = math.radians(sf_)
        A('seat-' + k_, sx_ + math.sin(a_) * 0.9, sz_ + math.cos(a_) * 0.9, sf_, 'stand here before sitting down on seat:' + k_)
    A('table', tx, tz, 0.0, 'the low table with olives and a cup')
    for nm, r_, note in (('door-in', R - 1.6, 'inside, before the doorway, facing out (+X)'), ('door', R + TW / 2, 'in the doorway, facing out'),
                         ('outside', R + TW + 3.0, 'outside the doorway, facing away from it'),
                         ('offstage-out', R + 14.0, 'out of sight outside (walk here to leave)')):
        x_, z_ = at(DOOR_A, r_)
        A(nm, x_, z_, DOOR_A, note)

    sc.finalize()
    if bake:
        sc.bake_ao(samples=32, distance=3.0, max_size=2048, blur=0.8, gamma=0.9, floor=0.45)
    meta = {
        'name': NAME, 'title': 'Chilia rotundă de piatră (înăuntru)',
        'units': 'engine units (figure 4.2 tall), three.js Y-up, +Z towards the usual camera',
        'anchors': sc.anchors, 'seats': sc.seats,
        'doors': ['cell'], 'doorLeaves': {'cell': leaf},
        'bounds': [[-12, -0.1, -12], [40, 12, 14]],
        'acting': {'rect': [[C[0] - R + 1.5, C[1] - R + 1.5], [C[0] + R - 1.5, C[1] + R - 2.5]]},
        'skies': ['morning', 'day', 'evening'],
        'sky': {'morning': {'sunAz': -8, 'sunElev': 32}, 'day': {'sunAz': -5, 'sunElev': 42}, 'evening': {'sunAz': -12, 'sunElev': 16}},
        'shadow': {'center': [C[0], C[1]], 'radius': 22},
        'lights': [{'pos': [C[0], 6.2, C[1]], 'color': '#ffe6c4', 'intensity': 10, 'distance': 22, 'flicker': 0.0},
                   {'pos': [ix - 0.9, 4.5, iz + 2.5], 'color': '#ffd9a8', 'intensity': 5, 'distance': 12, 'flicker': 0.02}],
        'shots': {
            'wide': {'pos': [0, 4.2, 10], 'target': [0, 2.6, -5], 'fov': 50, 'note': 'the whole round room, the icon, the door on the right'},
            'icon': {'pos': [0.0, 3.8, -3.0], 'target': [ix, 4.0, iz], 'fov': 40, 'note': 'the icon and the bench'},
            'door': {'pos': [-3.0, 3.4, -1.0], 'target': [C[0] + R + 3, 2.6, C[1]], 'fov': 40, 'note': 'the doorway and the sunny path outside'},
        },
        'notes': ('Inside of a ROUND stone cell, closed all round: centre %s, inner radius %.1f — keep every camera INSIDE '
                  '(distance from the centre < 6.6) and low (y <= 4.5: the ceiling beams at y %.1f stay out of the frame). '
                  'Arched doorway at heading 90 (x = %.1f, z = %.1f), %.1f wide, straight up to %.2f + a half-round top, door '
                  'door:cell (opens outwards like the outside door; it stays open once opened). Icon on the back wall at %s, bench under it '
                  '(top %.2f). Cushions (seats): %s.') % (list(C), R, HT - 0.34, C[0] + R, C[1], DOOR_W, DOOR_H,
                                                         [round(ix, 2), round(iz, 2)], BENCH_H, json.dumps(CUSH)),
    }
    os.makedirs(out_dir, exist_ok=True)
    sc.export(os.path.join(out_dir, NAME + '.glb'))
    with open(os.path.join(out_dir, NAME + '.json'), 'w') as f:
        json.dump(meta, f, indent=1, ensure_ascii=False)
    return meta
