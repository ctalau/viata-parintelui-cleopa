"""Props of the monastery bakery (film 051, Avva Teodor and the bread he made for the others).

* `bread-oven`  — a traditional domed clay bread oven (cuptor de lut) on a stone platform. The AI model assets/3d/pitarie-cuptor.glb
                  when present (`_ai_oven_body`: its mouth cut open, a chamber built behind it), else built here: a beehive dome of mud plaster,
                  an arched brick-framed mouth 1.3 wide and 1.25 high at hearth level (1.35 up), a real hollow chamber with
                  a hearth floor, the fire pushed to the back left (embers + flames: look.js lights the chamber), soot
                  above the mouth, a little chimney, an arched alcove under the hearth with firewood, a wooden oven door
                  leaning beside it. Mouth towards +Z (three.js). Variants in steps (`bend` 0 → 1):
                  fire · raw1 (one raw loaf just inside) · raw6 · baked6 (golden) · baked5 (one taken out) · embers (empty).
* `bread-peel`  — a long wooden bread peel (lopată): a 2.6 handle, a broad blade on top; held upright at the side by the
                  handle, `tilt` 90 lays it forward flat at hand height (the blade 3 ahead). Variants: empty · raw · baked
                  (a loaf on the blade's side towards the holder — on top once tilted).
* `dough-trough`— a flat wooden kneading board with a low lip (it was a deep AI trough: the hands went through its wall) with the dough on it, the shaped loaves beside it on the
                  floured table top. Variants (20 steps): flour · shaggy · dough · loaves1…loaves6 · flour6 · shaggy6 · dough6 · loaves7…loaves12 · empty.
* `bread-basket`— the AI basket of loaves: empty · half · full.
* `flour-sack`  — a small tied burlap sack of flour with a rope loop, carried at the side.
The loaf is the AI loaf (assets/3d/pitarie-paine.glb); the raw loaves are the same mesh with a pale dough texture.
"""
import os
import math
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from kit import core, tex, critters, pieces, aimesh

HEARTH = 1.35          # top of the platform = the oven floor (three y)
DOME_R, DOME_H = 1.95, 2.3
IN_R, IN_H = 1.58, 1.9
DOME_Y = 0.25          # Blender y of the dome's centre (the mouth is at -Y = three +Z)
MOUTH_W, MOUTH_S = 1.3, 0.6      # width, height of the straight part (the arch on top: radius = width / 2)
LOAF_D = 0.62          # loaf diameter
# where the loaves lie inside (Blender x, y): the first one just inside the mouth, where the peel leaves it
LOAVES = [(0.0, -1.15), (-0.55, -0.5), (0.55, -0.5), (0.0, 0.05), (0.6, 0.55), (-0.05, 0.75)]
FIRE = (-0.7, 0.95)


# ---------------------------------------------------------------- the loaf (AI) and its raw twin
_LOAF = {}


def loaf_objects(sc):
    """(baked, raw) Blender objects of one loaf, diameter LOAF_D, base at 0, not exported themselves (shared by nodes)."""
    if _LOAF:
        return _LOAF['baked'], _LOAF['raw']
    p = os.path.join(aimesh.SRC, 'pitarie-paine.glb')
    if os.path.exists(p):
        ob = aimesh.load('pitarie-paine')
        aimesh.drop_loose(ob, 20)
        lo, hi = aimesh.bounds(ob)
        s = LOAF_D / max(hi[0] - lo[0], hi[1] - lo[1])
        aimesh.fit(ob, s, ground=lo[2], centre=((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2))
        for poly in ob.data.polygons:
            poly.use_smooth = True
        aimesh.material(ob, 0.35)
        raw = ob.copy(); raw.data = ob.data.copy()
        bpy.context.scene.collection.objects.link(raw)
        # the raw dough: the same loaf, its crust texture turned into pale, matte dough (the score lines stay a shade darker)
        m0 = ob.data.materials[0]
        m = m0.copy(); raw.data.materials[0] = m
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image:
                img = n.image.copy()
                px = np.array(img.pixels[:]).reshape(-1, 4)
                lum = px[:, :3] @ np.array([0.3, 0.55, 0.15])
                k = np.clip((lum - 0.15) / 0.75, 0, 1)
                dough = np.array([0.98, 0.92, 0.80]) * (0.86 + 0.14 * k[:, None])
                px[:, :3] = dough
                img.pixels[:] = px.ravel()
                img.pack()
                n.image = img
            if n.type == 'BSDF_PRINCIPLED':
                n.inputs['Roughness'].default_value = 0.75
        aimesh.material(raw, 0.75)
    else:
        # fallback (no AI loaf yet): a domed loaf with a cross score
        def mk(col, name):
            bm = core.new_bm()
            critters.blob(bm, (0, 0, LOAF_D * 0.24), (LOAF_D / 2, LOAF_D / 2, LOAF_D * 0.27), col, subdiv=3)
            for a in (0, math.pi / 2):
                critters.stick(bm, (math.cos(a) * -0.2, math.sin(a) * -0.2, LOAF_D * 0.5), (math.cos(a) * 0.2, math.sin(a) * 0.2, LOAF_D * 0.5), 0.025, tuple(c * 0.8 for c in col))
            me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
            o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
            o.data.materials.append(core.material(name + '_m', None, vcol=True, rough=0.4))
            return o
        ob, raw = mk((0.86, 0.5, 0.18), 'loaf_baked'), mk((0.97, 0.9, 0.76), 'loaf_raw')
    _LOAF['baked'], _LOAF['raw'] = ob, raw
    return ob, raw


def put_loaves(sc, name, parent, kind, spots, z=0.0, scale=1.0):
    baked, raw = loaf_objects(sc)
    src = baked if kind == 'baked' else raw
    for i, (x, y, *r) in enumerate(spots):
        rot = r[0] if r else i * 0.9
        M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z') @ Matrix.Diagonal((scale, scale, scale, 1))
        sc.obj(f'{name}.loaf{i}', None, None, M, parent=parent, mesh=src.data)


def _drop_sources():
    for k in ('baked', 'raw'):
        o = _LOAF.pop(k, None)
        if o is not None:
            bpy.data.objects.remove(o)


# ---------------------------------------------------------------- the oven
def _ellipsoid(rx, ry, rz, center=(0, 0, 0), segs=48, rings=28):
    bm = core.new_bm()
    tmp = bmesh.new()
    bmesh.ops.create_uvsphere(tmp, u_segments=segs, v_segments=rings, radius=1.0)
    core.transform(tmp, Matrix.Translation(center) @ Matrix.Diagonal((rx, ry, rz, 1)))
    core.merge(bm, tmp)
    return bm


def _arch_cutter(w, straight, depth, y0, z0):
    """a box + a cylinder along Y: an arched opening w wide, `straight` high + a half circle on top, from y0 depth long"""
    c = core.new_bm()
    core.box(c, (w, depth, straight + 0.2), (0, y0 + depth / 2, z0 + (straight - 0.2) / 2))
    cyl = bmesh.new()
    bmesh.ops.create_cone(cyl, cap_ends=True, segments=32, radius1=w / 2, radius2=w / 2, depth=depth)
    core.transform(cyl, Matrix.Translation((0, y0 + depth / 2, z0 + straight)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    return [c, cyl]          # two cutters (one overlapping cutter mesh makes the exact boolean fail)


def _outer_y(x, z):
    """y of the dome's outer surface at the front (Blender, -Y = front) for a point (x, z above the hearth)"""
    q = 1 - (x / DOME_R) ** 2 - (z / DOME_H) ** 2
    return DOME_Y - DOME_R * math.sqrt(max(0.0, q))



# ---------------------------------------------------------------- the AI oven (assets/3d/pitarie-cuptor.glb)
OVEN_FRONT = DOME_Y - DOME_R      # Blender y of the mouth's front (the procedural oven's), kept for the AI one: the set's anchors fit


def _tex_sampler(ob):
    """(face → rgb) from the first image texture of the AI mesh, sampled at each face's UV centre"""
    img = None
    for m in ob.data.materials:
        for n in (m.node_tree.nodes if m and m.use_nodes else []):
            if n.type == 'TEX_IMAGE' and n.image:
                img = n.image
    W, Hh = img.size
    px = np.array(img.pixels[:]).reshape(Hh, W, img.channels)
    uv = ob.data.uv_layers.active.data

    def col(poly):
        u = sum(uv[i].uv[0] for i in poly.loop_indices) / poly.loop_total
        v = sum(uv[i].uv[1] for i in poly.loop_indices) / poly.loop_total
        x = min(W - 1, max(0, int((u % 1.0) * W))); y = min(Hh - 1, max(0, int((v % 1.0) * Hh)))
        return px[y, x, :3]
    return col


def _ai_oven_body(sc, mats, H):
    """The AI oven shell scaled so its platform top (the hearth) is at H and its mouth's front at OVEN_FRONT; the painted
    mouth cut out; a hollow chamber behind it (an inner vault facing in, the tunnel of the mouth, a hearth floor).
    Returns (fire xy, chamber centre y, chamber radius, mouth (x0, x1, straight top)) in Blender units."""
    ob = aimesh.load('pitarie-cuptor')
    aimesh.drop_loose(ob, 30)
    me = ob.data
    V = np.array([v.co[:] for v in me.vertices])
    lo, hi = V.min(0), V.max(0)
    Hm = hi[2] - lo[2]
    # the platform's top: the lowest height where the outline becomes clearly narrower than the platform (the dome)
    def width_at(z, dz=0.012 * Hm):
        sel = np.abs(V[:, 2] - z) < dz
        return (V[sel, 0].max() - V[sel, 0].min()) if sel.sum() > 10 else 0.0
    # the platform's top: just above its widest course (the capstone ledge round the platform), where the dome begins
    zs_ = lo[2] + np.linspace(0.1, 0.6, 101) * Hm
    ws = np.array([width_at(z) for z in zs_])
    wmax = ws.max()
    top = max(i for i in range(len(zs_)) if ws[i] > 0.97 * wmax)
    hz = zs_[min(len(zs_) - 1, top + 2)]
    # the dome just above it: its back and sides are round, its front is the flat brick frame of the mouth
    dome = V[(V[:, 2] > hz + 0.05 * Hm) & (V[:, 2] < hz + 0.15 * Hm)]
    cx = (dome[:, 0].min() + dome[:, 0].max()) / 2
    rx = (dome[:, 0].max() - dome[:, 0].min()) / 2
    cy = dome[:, 1].max() - rx
    # the mouth: the dark faces on the front, above the hearth (not the firewood niche below it)
    col = _tex_sampler(ob)
    D = []
    for poly in me.polygons:
        c = poly.center
        if c.y < cy - 0.3 * rx and hz - 0.02 * Hm < c.z < hz + 0.9 * rx and abs(c.x - cx) < rx * 0.75 and max(col(poly)) < 0.16:
            D.append(c[:])
    D = np.array(D)
    x0, x1 = np.percentile(D[:, 0], 2), np.percentile(D[:, 0], 98)
    ztop = np.percentile(D[:, 2], 98)
    front = (V[(np.abs(V[:, 0] - cx) < (x1 - x0) * 0.7) & (V[:, 2] > hz) & (V[:, 2] < ztop)][:, 1]).min()
    print(f'  AI oven: hearth {hz - lo[2]:.3f} of {Hm:.3f}, dome r {rx:.3f}, mouth x {x0:.3f}..{x1:.3f} top {ztop:.3f}, {len(D)} dark faces')
    r_arch = (x1 - x0) / 2
    zs = ztop - r_arch                     # top of the straight part
    # cut the painted mouth (everything inside the arch outline in the front half)
    def in_mouth(c):
        if not (x0 < c.x < x1) or c.z < hz - 0.02 * Hm:
            return False
        return c.z <= zs or math.hypot(c.x - (x0 + x1) / 2, c.z - zs) < r_arch
    # the front of the mouth, and the AI's painted recess behind it (faces turned to the front, inside the dome); the outer back
    # of the dome (faces turned backwards) stays
    n = aimesh.cut(ob, lambda c, nn: in_mouth(c) and (c.y < cy - rx * 0.25 or (nn.y < 0.2 and c.y < cy + rx * 0.85)))
    print(f'  AI oven: {n} mouth faces cut')
    s = H / (hz - lo[2])
    T = Matrix.Translation((0, OVEN_FRONT, 0)) @ Matrix.Diagonal((s, s, s, 1)) @ Matrix.Translation((-(x0 + x1) / 2, -front, -lo[2]))
    me.transform(T)
    # the same numbers in the prop's frame
    X0, X1 = (x0 - (x0 + x1) / 2) * s, (x1 - (x0 + x1) / 2) * s
    ZS = (zs - lo[2]) * s
    CY = OVEN_FRONT + (cy - front) * s
    R = rx * s
    rin = R - 0.3
    hin = R * 0.95 - 0.3
    # the AI mesh is a solid: through the cut mouth one saw its inside faces, which hid the fire — drop every face of it
    # inside the chamber (the chamber's own vault and floor stand there)
    n2 = aimesh.cut(ob, lambda c, nn: c.z > H - 0.05 and (c.x / (rin + 0.05)) ** 2 + ((c.y - CY) / (rin + 0.05)) ** 2 + ((c.z - H) / (hin + 0.05)) ** 2 < 1.0)
    print(f'  AI oven: {n2} faces inside the chamber cut')
    aimesh.finish(sc, ob, 'oven.shell', rough=0.55)
    # the chamber: an inner vault facing in, the lower half and the mouth's tunnel cut away
    shell = _ellipsoid(rin, rin, hin, (0, CY, H))
    low = core.new_bm(); core.box(low, (12, 12, 6), (0, CY, H - 3.0))
    shell = pieces.boolean(shell, [low])
    # the mouth's opening in the vault: the faces in front of the arch (a boolean with the arch cutters failed here)
    xc_, ra_ = (X0 + X1) / 2, (X1 - X0) / 2
    def in_arch(c, m=0.04):
        if not (X0 - m < c.x < X1 + m):
            return False
        return c.z <= ZS or math.hypot(c.x - xc_, c.z - ZS) < ra_ + m
    bmesh.ops.delete(shell, geom=[f for f in shell.faces if f.calc_center_median().y < CY and in_arch(f.calc_center_median())], context='FACES')
    for f in shell.faces:
        f.normal_flip()
    fire_xy = (-0.1 * rin, CY + 0.62 * rin)
    cl = shell.loops.layers.color[core.COL]
    for f in shell.faces:
        for l in f.loops:
            p = l.vert.co
            k = max(0.0, 1 - math.hypot(p.x - fire_xy[0], p.y - fire_xy[1]) / 2.4)
            l[cl] = (0.28 + 0.5 * k, 0.15 + 0.2 * k, 0.09 + 0.05 * k, 1)
    sc.obj('oven.chamber', shell, mats['inside'], None)
    # the tunnel of the mouth: its outline swept from the front to the vault, facing in, with a floor
    pts = [(X0, H)] + [(X0, ZS)] + [((X0 + X1) / 2 + (X1 - X0) / 2 * math.cos(a), ZS + (X1 - X0) / 2 * math.sin(a)) for a in np.linspace(math.pi, 0, 17)[1:-1]] + [(X1, ZS), (X1, H)]
    y_in = CY - math.sqrt(max(0.01, rin ** 2 - ((X1 - X0) / 2) ** 2)) + 0.1
    tb = core.new_bm()
    a_ = [tb.verts.new((x, OVEN_FRONT - 0.03, z)) for x, z in pts]
    b_ = [tb.verts.new((x, y_in, z)) for x, z in pts]
    for i in range(len(pts) - 1):
        f = tb.faces.new((a_[i], a_[i + 1], b_[i + 1], b_[i]))
        f.normal_update()
        c = f.calc_center_median()
        if f.normal.dot(Vector((-c.x, 0, (ZS + H) / 2 - c.z))) < 0:
            f.normal_flip()
    fl_ = tb.faces.new((a_[-1], a_[0], b_[0], b_[-1]))
    fl_.normal_update()
    if fl_.normal.z < 0:
        fl_.normal_flip()
    # a sill block under the tunnel's floor: the cut mouth left a slit down to the ground there
    core.box(tb, (X1 - X0 + 0.1, y_in - OVEN_FRONT + 0.06, 0.24), (0, (OVEN_FRONT + y_in) / 2, H - 0.125))
    core.set_color(tb, (0.36, 0.24, 0.17))
    sc.obj('oven.tunnel', tb, mats['inside'], None)
    # the hearth floor inside
    hf = core.new_bm()
    core.lathe(hf, [(0.0, 0.0), (rin + 0.02, 0.0)], segs=40)
    for f in hf.faces:
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    core.transform(hf, Matrix.Translation((0, CY, H + 0.012)))
    hcl = hf.loops.layers.color[core.COL]
    for f in hf.faces:
        for l in f.loops:
            p = l.vert.co
            k = max(0.0, 1 - math.hypot(p.x - fire_xy[0], p.y - fire_xy[1]) / 1.8)
            l[hcl] = (0.42 + 0.3 * k, 0.3 + 0.08 * k, 0.24, 1)
    sc.obj('oven.floor', hf, mats['inside'], None)
    return fire_xy, CY, rin, (X0, X1, ZS)


def bread_oven():

    core.reset(); sc = core.Scene('bread-oven')
    plaster = core.material('oven_plaster', core.texset('oven_plaster', tex.plaster, n=512, seed=51, colors=('#f0c99a', '#e2b07c', '#c99260'), brick='#b8704a'), vcol=True)
    stone = core.material('oven_stone', core.texset('oven_stone', tex.blocks, n=512, seed=52, rows=4, cols=3, colors=('#f1d3a2', '#ddb47c', '#c59660'), mortar='#a8835a'), vcol=True)
    brick_m = core.material('oven_brick', None, vcol=True, rough=0.7)
    inside = core.material('oven_inside', None, vcol=True, rough=0.95)
    wood = core.material('oven_wood', core.texset('oven_wood', tex.wood, n=256, seed=53, planks=3, colors=('#b98552', '#93633a', '#6b4224')))
    logs = core.material('oven_logs', core.texset('oven_logs', tex.wood, n=256, seed=54, planks=1, colors=('#c79a66', '#9b6d42', '#704a2a')))
    ember = core.material('oven_ember', None, color=(1.0, 0.35, 0.08), emissive=(1.0, 0.32, 0.06), emissive_strength=3.0, rough=0.6)
    fl = core.material('oven_flame', None, color=(1.0, 0.62, 0.2), emissive=(1.0, 0.55, 0.15), emissive_strength=6.0)
    H = HEARTH

    ai = os.path.exists(os.path.join(aimesh.SRC, 'pitarie-cuptor.glb'))
    fire_xy, loaf_xy = FIRE, [(x, y + DOME_Y) for x, y in LOAVES]
    if ai:
        # the AI oven (Nano Banana → Hunyuan3D-2mv), its mouth cut open, a hollow chamber behind it
        fire_xy, CY, rin, _m = _ai_oven_body(sc, {'inside': inside}, H)
        first = OVEN_FRONT + 0.8
        loaf_xy = [(0.0, first), (-0.62, CY - 0.3 * rin), (0.62, CY - 0.3 * rin), (-0.72, CY + 0.2 * rin), (0.72, CY + 0.2 * rin), (0.0, CY - 0.05 * rin)]
    else:
        # the platform: a block of honey stones 4.4 × 4.4, the hearth on top; an arched alcove for firewood under the mouth
        base = core.new_bm()
        core.box(base, (4.4, 4.4, H), (0, DOME_Y + 0.05, H / 2), bevel=0.08)
        base = pieces.boolean(base, _arch_cutter(1.7, 0.45, 1.4, DOME_Y - 2.4, -0.05))
        core.box_uv(base, 1.6)
        core.set_color(base, (1, 1, 1))
        for f in base.faces:          # the alcove's inside is in shadow
            c = f.calc_center_median()
            if c.y > DOME_Y - 2.1 and c.z < 0.95 and abs(c.x) < 0.9:
                for l in f.loops:
                    l[base.loops.layers.color[core.COL]] = (0.45, 0.38, 0.32, 1)
        sc.obj('oven.base', base, stone, None)
        # firewood in the alcove (log ends towards the front)
        lg = core.new_bm()
        for k, (x, z) in enumerate(((-0.45, 0.17), (0.0, 0.17), (0.45, 0.17), (-0.22, 0.5), (0.24, 0.5), (0.0, 0.8))):
            core.tube(lg, [Vector((x, DOME_Y - 0.8, z)), Vector((x + 0.03, DOME_Y - 2.12 - 0.04 * (k % 2), z))], 0.16, sides=8)
        sc.obj('oven.logs', lg, logs, None, vcol=False)
        # a front ledge (the landing in front of the mouth)
        ld = core.new_bm()
        core.box(ld, (2.4, 0.5, 0.12), (0, DOME_Y - 2.25, H - 0.02), bevel=0.04)
        core.box_uv(ld, 1.2)
        sc.obj('oven.ledge', ld, stone, None)

        # the dome: an outer and an inner ellipsoid, the lower half and the mouth cut away → a real shell 0.35 thick
        shell = _ellipsoid(DOME_R, DOME_R, DOME_H, (0, DOME_Y, H))
        inner = _ellipsoid(IN_R, IN_R, IN_H, (0, DOME_Y, H))
        low = core.new_bm(); core.box(low, (6, 6, 3), (0, DOME_Y, H - 1.5))
        mouth = _arch_cutter(MOUTH_W, MOUTH_S, 1.6, DOME_Y - DOME_R - 0.4, H - 0.01)
        shell = pieces.boolean(shell, [inner, low, *mouth])
        core.box_uv(shell, 2.2)
        cl = shell.loops.layers.color[core.COL]
        for f in shell.faces:
            c = f.calc_center_median()
            r = math.hypot(c.x / DOME_R, (c.y - DOME_Y) / DOME_R)
            is_in = (Vector((c.x, c.y - DOME_Y, (c.z - H) * DOME_R / DOME_H)).normalized().dot(f.normal) < -0.2)
            for l in f.loops:
                p = l.vert.co
                if is_in:
                    # the chamber: dark clay, warmer and brighter towards the fire
                    d = math.hypot(p.x - fire_xy[0], p.y - fire_xy[1])
                    k = max(0.0, 1 - d / 2.6)
                    l[cl] = (0.28 + 0.5 * k, 0.15 + 0.2 * k, 0.09 + 0.05 * k, 1)
                else:
                    # soot above the mouth, a lighter rim at the foot
                    s = math.exp(-((p.x / 0.75) ** 2) - (((p.z - H - 1.5) / 0.65) ** 2)) * (1 if p.y < DOME_Y - 0.6 else 0)
                    g = 0.92 + 0.08 * min(1.0, (p.z - H) / 0.4)
                    l[cl] = (g * (1 - 0.6 * s), g * (1 - 0.62 * s), g * (1 - 0.64 * s), 1)
        sc.obj('oven.dome', shell, plaster, None)
        # the hearth inside: a dark brick floor with ash
        hf = core.new_bm()
        core.lathe(hf, [(0.0, 0.0), (IN_R + 0.02, 0.0)], segs=40)
        for f in hf.faces:
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
        core.transform(hf, Matrix.Translation((0, DOME_Y, H + 0.012)))
        hcl = hf.loops.layers.color[core.COL]
        for f in hf.faces:
            for l in f.loops:
                p = l.vert.co
                d = math.hypot(p.x - fire_xy[0], p.y - fire_xy[1])
                k = max(0.0, 1 - d / 1.8)
                l[hcl] = (0.42 + 0.3 * k, 0.3 + 0.08 * k, 0.24, 1)
        sc.obj('oven.floor', hf, inside, None)
        # the mouth's frame: rounded red bricks round the arch and down the jambs, standing on the dome's surface
        br = core.new_bm()
        R = MOUTH_W / 2 + 0.17
        pts = [(-R, 0.08), (-R, 0.3), (-R, 0.52)] + [(R * math.cos(a), MOUTH_S + R * math.sin(a)) for a in np.linspace(math.pi, 0, 9)] + [(R, 0.52), (R, 0.3), (R, 0.08)]
        for i, (x, z) in enumerate(pts):
            y = _outer_y(x, z) - 0.06
            tone = 0.9 + 0.1 * ((i * 7) % 3) / 2
            a = math.atan2(z - MOUTH_S, x) if z > MOUTH_S else (math.pi if x < 0 else 0)
            rot = Matrix.Rotation(-a + math.pi / 2, 4, 'Y') if z > MOUTH_S else Matrix.Identity(4)
            critters.blob(br, (x, y, H + z), (0.17, 0.12, 0.11), (0.78 * tone, 0.36 * tone, 0.22 * tone), subdiv=2, rot=rot)
        # the brick sill under the mouth
        for i, x in enumerate(np.linspace(-0.55, 0.55, 4)):
            critters.blob(br, (x, _outer_y(0, 0.05) - 0.05, H + 0.02), (0.17, 0.14, 0.05), (0.72, 0.34, 0.2), subdiv=2)
        sc.obj('oven.bricks', br, brick_m, None)
        # a little clay chimney at the top front, with a dark mouth
        ch = core.new_bm()
        cz = H + DOME_H * 0.83
        cy = DOME_Y - DOME_R * math.sqrt(1 - 0.83 ** 2) + 0.25
        core.lathe(ch, [(0.27, -0.25), (0.24, 0.25), (0.27, 0.42), (0.19, 0.45), (0.16, 0.2)], segs=20)
        core.set_color(ch, (0.85, 0.66, 0.5))
        core.transform(ch, Matrix.Translation((0, cy, cz)))
        sc.obj('oven.chimney', ch, brick_m, None)
        # the oven door: an arched plank board with a handle, leaning on the platform right of the mouth
        dr = core.new_bm()
        core.box(dr, (1.25, 0.1, 0.9), (0, 0, 0.45), bevel=0.03)
        cyl = bmesh.new()
        bmesh.ops.create_cone(cyl, cap_ends=True, segments=24, radius1=0.625, radius2=0.625, depth=0.1)
        core.transform(cyl, Matrix.Translation((0, 0, 0.9)) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
        core.merge(dr, cyl)
        core.tube(dr, [Vector((-0.22, -0.08, 0.95)), Vector((-0.22, -0.2, 1.0)), Vector((0.22, -0.2, 1.0)), Vector((0.22, -0.08, 0.95))], 0.045, sides=6)
        core.box_uv(dr, 1.0)
        sc.obj('oven.door', dr, wood, Matrix.Translation((2.2 + 0.24, DOME_Y + 0.3, 0.0)) @ Matrix.Rotation(math.pi / 2, 4, 'Z') @ Matrix.Rotation(-0.16, 4, 'X'), vcol=False)

    # the variants: the fire (embers + flames at the back left) in every one; the loaves
    def fire(g, name, big=True):
        em = core.new_bm()
        for k in range(9):
            a = k * 0.8
            critters.blob(em, (fire_xy[0] + 0.32 * math.cos(a) * (0.5 + 0.5 * (k % 3) / 2), fire_xy[1] + 0.25 * math.sin(a), H + 0.07), (0.15, 0.12, 0.07), (1, 0.4, 0.1), subdiv=1)
        sc.obj(f'{name}.embers', em, ember, None, parent=g, vcol=False)
        wd = core.new_bm()
        for k in range(3):
            a = 0.5 + k * 1.1
            d = Vector((math.cos(a), math.sin(a), 0))
            core.tube(wd, [Vector((fire_xy[0], fire_xy[1], H + 0.12)) - d * 0.4, Vector((fire_xy[0], fire_xy[1], H + 0.16 + 0.04 * k)) + d * 0.4], 0.07, sides=6)
        sc.obj(f'{name}.sticks', wd, logs, None, parent=g, vcol=False)
        if big:
            # tall flames, bright enough to light the chamber: seen through the mouth from the front
            for k, (x, y, h) in enumerate(((0.0, 0.0, 1.15), (0.32, 0.1, 0.85), (-0.3, 0.2, 0.8), (0.05, -0.3, 0.7), (-0.15, -0.15, 0.6))):
                sc.obj(f'{name}.flame{k}', critters.flame_mesh(h, h * 0.4), fl, Matrix.Translation((fire_xy[0] + x, fire_xy[1] + y, H + 0.1)), parent=g, vcol=False,
                       props={'lightIntensity': 3.6, 'lightDistance': 7.0})
        else:
            for k, (x, y, h) in enumerate(((0.0, 0.0, 0.32), (0.22, 0.12, 0.22))):
                sc.obj(f'{name}.flame{k}', critters.flame_mesh(h, h * 0.4), fl, Matrix.Translation((fire_xy[0] + x, fire_xy[1] + y, H + 0.1)), parent=g, vcol=False,
                       props={'lightIntensity': 1.2, 'lightDistance': 5.0})

    names = ['fire', 'raw1', 'raw6', 'baked6', 'baked5', 'embers']
    for nm in names:
        g = sc.group(nm)
        fire(g, nm, big=nm in ('fire', 'raw1', 'raw6', 'baked6', 'baked5'))
        n = {'raw1': 1, 'raw6': 6, 'baked6': 6, 'baked5': 5}.get(nm, 0)
        if n:
            spots = loaf_xy[:6] if n == 6 else (loaf_xy[1:6] if n == 5 else loaf_xy[:1])
            put_loaves(sc, nm, g, 'raw' if nm.startswith('raw') else 'baked', spots, z=H + 0.02)
    _drop_sources()
    sc.empty('grip', 0, H, 0, 0)
    # the spot where the baker stands to slide a loaf in with the peel held in his RIGHT hand (tilt 90): his right hand
    # is 0.66 to his right, the loaf on the blade ≈ 3.35 ahead of his root
    lx, ly = loaf_xy[0][0], loaf_xy[0][1] - DOME_Y
    export(sc, 'bread-oven', {'variants': names, 'steps': True,
                              'mouth': [0, HEARTH, round(-(DOME_Y - DOME_R), 3)], 'firstLoaf': [lx, HEARTH, round(-(ly + DOME_Y), 3)],
                              'notes': ('a domed clay bread oven on a stone platform, 4.4 × 4.4, 4.2 tall with the chimney; the arched mouth (1.3 wide, '
                                        '1.25 high) faces +Z at hearth height 1.35; a real hollow chamber. bend steps: fire · raw1 · raw6 · baked6 · '
                                        'baked5 · embers. To slide a loaf in with the peel (right hand, tilt 90): stand at oven-local '
                                        '[-0.66, 3.9] facing 180 (towards the mouth) — the blade\'s loaf lands on firstLoaf.')})


# ---------------------------------------------------------------- the peel
PEEL_GRIP = 0.45


def bread_peel():

    core.reset(); sc = core.Scene('bread-peel')
    wood = core.material('peel_wood', core.texset('peel_wood', tex.wood, n=256, seed=61, planks=1, colors=('#d6ad78', '#b88a58', '#8f6438')))
    bm = core.new_bm()
    L = 2.55
    core.tube(bm, [Vector((0, 0, 0)), Vector((0, 0, L))], [0.065, 0.075], sides=10)
    # the blade: a thin rounded paddle 0.95 wide, 0.95 long, bevelled, in the X–Z plane
    bl = core.new_bm()
    prof = []
    for k in range(25):
        a = k / 24 * math.pi
        prof.append((0.47 * math.cos(a), L + 0.55 + 0.42 * math.sin(a)))
    prof = [(0.12, L - 0.05), (0.47, L + 0.3)] + prof + [(-0.47, L + 0.3), (-0.12, L - 0.05)]
    verts_f = [bl.verts.new((x, -0.03, z)) for x, z in prof]
    verts_b = [bl.verts.new((x, 0.03, z)) for x, z in prof]
    bl.faces.new(list(reversed(verts_f)))
    bl.faces.new(verts_b)
    n = len(prof)
    for i in range(n):
        j = (i + 1) % n
        bl.faces.new((verts_f[i], verts_f[j], verts_b[j], verts_b[i]))
    bmesh.ops.recalc_face_normals(bl, faces=bl.faces)
    core.box_uv(bl, 1.0)
    core.merge(bm, bl)
    sc.obj('peel', bm, wood, None, vcol=False)
    # the loaf lies on the blade's side towards the holder (+Y Blender = towards him): tilted forward 90°, that side is up
    for nm, kind in (('empty', None), ('raw', 'raw'), ('baked', 'baked')):
        g = sc.group(nm)
        if kind:
            baked, raw = loaf_objects(sc)
            src = baked if kind == 'baked' else raw
            M = Matrix.Translation((0, 0.03, L + 0.55)) @ Matrix.Rotation(-math.pi / 2, 4, 'X')
            sc.obj(f'{nm}.loaf', None, None, M, parent=g, mesh=src.data)
    _drop_sources()
    sc.empty('grip', 0, PEEL_GRIP, 0, 0)
    export(sc, 'bread-peel', {'variants': ['empty', 'raw', 'baked'], 'steps': True, 'hands': 1, 'carry': 'side', 'grip': [0, PEEL_GRIP, 0],
                              'notes': 'a wooden bread peel 3.5 long (handle 2.55 + blade 0.95 wide), held at the side by the handle (lean 0); '
                                       '"tilt": 90 lays it forward at hand height, the loaf on top ≈ 3.0 ahead of the hand. bend 0 empty · 0.5 raw loaf · 1 baked loaf'})


# ---------------------------------------------------------------- the kneading trough
def dough_trough():

    core.reset(); sc = core.Scene('dough-trough')
    dough_m = core.material('dough', None, vcol=True, rough=0.6)
    flour_m = core.material('flour', None, vcol=True, rough=0.95)
    # a flat wooden kneading board („fund de lemn”) with a low lip, not a deep trough: the kneader's hands push
    # down on the dough and never pass through a wall
    wood = core.material('board_wood', core.texset('board_wood', tex.wood, n=256, seed=81, planks=4, colors=('#d9b07a', '#bf915c', '#9a6d40')))
    TL, TW, BT = 2.0, 1.05, 0.07          # board length (X), width, thickness
    TX = -0.55          # the board left of centre, the loaves on the table to its right
    bd = core.new_bm()
    core.box(bd, (TL, TW, BT), (TX, 0, BT / 2), bevel=0.025)
    # a lip 0.05 high along the back and the two ends (the flour stays on the board)
    core.box(bd, (TL, 0.06, 0.05), (TX, TW / 2 - 0.03, BT + 0.025), bevel=0.012)
    for sx in (-1, 1):
        core.box(bd, (0.06, TW - 0.06, 0.05), (TX + sx * (TL / 2 - 0.03), -0.03, BT + 0.025), bevel=0.012)
    core.box_uv(bd, 1.0)
    sc.obj('trough', bd, wood, None, vcol=False)
    inner_z = BT

    def dough(g, nm, kind, k=1.0):
        bm = core.new_bm()
        c = (0.97, 0.92, 0.8)
        if kind == 'flour':
            critters.blob(bm, (TX, 0, inner_z + 0.02), (TL * 0.3, TW * 0.3, 0.12), (1, 1, 0.98), subdiv=3)
            critters.blob(bm, (TX - 0.2, 0.05, inner_z + 0.08), (0.3, 0.25, 0.13), (1, 1, 0.99), subdiv=2)
            sc.obj(f'{nm}.dough', bm, flour_m, None, parent=g)
            bm = core.new_bm()
        elif kind == 'shaggy':
            for k2 in range(9):
                a = k2 * 2.1
                critters.blob(bm, (TX + 0.5 * math.cos(a) * (0.4 + 0.15 * (k2 % 3)), 0.15 * math.sin(a), inner_z + 0.08 + 0.03 * (k2 % 2)), (0.22, 0.18, 0.12), c, subdiv=2)
            critters.blob(bm, (TX + 0.55, 0.08, inner_z + 0.04), (0.22, 0.16, 0.08), (1, 1, 0.98), subdiv=2)
        elif kind == 'dough':
            # the dough ball, smaller with every loaf taken from it (k = what is left, 1 … 0.3)
            s3 = 0.45 + 0.55 * k
            critters.blob(bm, (TX - 0.2 * (1 - k), 0, inner_z + 0.17 * s3), (0.6 * s3, TW * 0.3 * (0.6 + 0.4 * k), 0.24 * s3), c, subdiv=3)
        if len(bm.verts):
            core.displace(bm, 0.02, 4.0, seed=3)
            sc.obj(f'{nm}.dough', bm, dough_m, None, parent=g)
        else:
            bm.free()
        # flour dust on the table
        fd = core.new_bm()
        critters.blob(fd, (1.25, -0.37, 0.004), (0.55, 0.7, 0.006), (1, 1, 0.97), subdiv=2)
        sc.obj(f'{nm}.flour', fd, flour_m, None, parent=g)

    # the shaped loaves on the table right of the trough: 3 columns × 4 rows; the first six in the two front rows
    # (towards the camera, three +Z), the next six behind them
    LS = [(x, y) for y in (-0.8, -0.42) for x in (0.72, 1.05, 1.38)] + [(x, y) for y in (-0.04, 0.34) for x in (0.72, 1.05, 1.38)]
    LS = LS[:2] + LS[3:6] + [LS[2]] + LS[6:]      # the front spot by the set's baked loaf comes sixth: `five` never uses it   # clear of the set's jug and loaf at the table's right end
    # (name, dough kind, dough left, loaves on the table)
    V = [('flour', 'flour', 1, 0), ('shaggy', 'shaggy', 1, 0), ('dough', 'dough', 1, 0)]
    V += [(f'loaves{n}', 'dough', 1 - n / 6.5, n) for n in range(1, 6)] + [('loaves6', '', 0, 6)]
    V += [('flour6', 'flour', 1, 6), ('shaggy6', 'shaggy', 1, 6), ('dough6', 'dough', 1, 6)]
    V += [(f'loaves{n}', 'dough', 1 - (n - 6) / 6.5, n) for n in range(7, 12)] + [('loaves12', '', 0, 12), ('empty', '', 0, 0), ('five', '', 0, 5)]
    variants = [v[0] for v in V]
    for nm, kind, left, n in V:
        g = sc.group(nm)
        dough(g, nm, kind, left)
        if n:
            put_loaves(sc, nm, g, 'raw', [(x, y, 0.4 + 0.9 * i) for i, (x, y) in enumerate(LS[:n])], z=0.0, scale=0.54)
    _drop_sources()
    sc.empty('grip', 0, 0.3, 0, 0)
    export(sc, 'dough-trough', {'variants': variants, 'steps': True, 'soft': True, 'hands': 2, 'carry': 'front',
                                'notes': ('a flat wooden kneading board 2.0 × 1.05 with a low lip (along X, centre at x -0.55) on a floured table top, the shaped loaves '
                                          'to its right (x 0.55 … 1.55, 3 columns × 4 rows, the first six in front). Put it on a table top ("y": the table height). '
                                          'bend steps (20, step i = i / 19): flour · shaggy · dough · loaves1 … loaves5 (the dough smaller with each) · loaves6 · '
                                          'flour6 · shaggy6 · dough6 (a second batch, the first six loaves still there) · loaves7 … loaves11 · loaves12 · empty · five (5 loaves, the board empty). '
                                          'Kneaders stand 1.37 behind it, facing it.')})


# ---------------------------------------------------------------- the basket of loaves
def bread_basket():

    core.reset(); sc = core.Scene('bread-basket')
    HGT = 0.95
    b = aimesh.load('pitarie-cos')
    aimesh.drop_loose(b, 20)
    lo, hi = aimesh.bounds(b)
    s = HGT / (hi[2] - lo[2])
    aimesh.fit(b, s, ground=lo[2], centre=((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2))
    lo, hi = aimesh.bounds(b)
    W = hi[0] - lo[0]
    full = sc.group('full'); half = sc.group('half'); empty = sc.group('empty')
    aimesh.finish(sc, b, 'basket.full', parent=full, rough=0.55)
    # the rim height: where the weave ends (the AI mesh: the loaves rise above ≈ 62% of the height)
    rim = HGT * 0.6
    R = W * 0.36
    for nm, g in (('half', half), ('empty', empty)):
        e = b.copy(); e.data = b.data.copy(); bpy.context.scene.collection.objects.link(e)
        e.parent = None; e.matrix_basis = Matrix.Identity(4)
        aimesh.cut(e, lambda c, n: c.z > rim * 0.8 and not (abs(c.x) > 0.4 * W and abs(c.y) < 0.16 * W))   # all above the rim but the two handles
        aimesh.finish(sc, e, f'basket.{nm}', parent=g, rough=0.55)
        ins = core.new_bm()
        core.lathe(ins, [(0.0, rim * 0.45), (R * 0.95, rim * 0.5), (R * 1.08, rim * 0.95)], segs=32)
        for f in ins.faces:
            f.normal_update()
            if f.normal.z < 0:
                f.normal_flip()
        core.set_color(ins, (0.55, 0.36, 0.2))
        sc.obj(f'basket.{nm}.inside', ins, core.material(f'basket_inside_{nm}', None, vcol=True, rough=0.9), None, parent=g)
        if nm == 'half':
            put_loaves(sc, 'half', g, 'baked', [(-0.17, -0.1), (0.18, -0.08), (0.0, 0.17)], z=rim * 0.5, scale=0.8)
    _drop_sources()
    sc.empty('grip', 0, HGT, 0, 0)
    export(sc, 'bread-basket', {'variants': ['empty', 'half', 'full'], 'steps': True, 'hands': 2, 'carry': 'front',
                                'notes': f'a round wicker basket {W:.2f} wide, {HGT} tall, two handles; bend 0 empty · 0.5 a few loaves · 1 heaped with golden loaves'})


# ---------------------------------------------------------------- the flour sack
def flour_sack():

    core.reset(); sc = core.Scene('flour-sack')
    burlap = core.material('fsack_burlap', core.texset('fsack_burlap', tex.cloth, n=256, seed=71, color='#c9a46c'))
    rope = core.material('fsack_rope', core.texset('fsack_rope', tex.rope, n=256, seed=72))
    flour_m = core.material('fsack_flour', None, vcol=True, rough=0.95)
    bm = core.new_bm()
    prof = [(0.0, 0.0), (0.3, 0.01), (0.4, 0.08), (0.43, 0.3), (0.4, 0.52), (0.26, 0.66), (0.12, 0.72), (0.12, 0.76), (0.2, 0.84), (0.24, 0.9)]
    core.lathe(bm, prof, segs=24, uv_v=0.6, uv_u=2.0)
    core.displace(bm, 0.025, 3.0, seed=7)
    sc.obj('sack', bm, burlap, None, vcol=False)
    r = core.new_bm()
    core.tube(r, [Vector((0.13 * math.cos(a), 0.13 * math.sin(a), 0.74)) for a in np.linspace(0, 2 * math.pi, 14)], 0.03, sides=6, closed=True)
    core.tube(r, [Vector((-0.12, 0, 0.74)), Vector((-0.1, 0, 1.0)), Vector((0, 0, 1.1)), Vector((0.1, 0, 1.0)), Vector((0.12, 0, 0.74))], 0.03, sides=6)
    sc.obj('sack.rope', r, rope, None, vcol=False)
    f = core.new_bm()
    critters.blob(f, (0, 0, 0.88), (0.2, 0.2, 0.06), (1, 1, 0.98), subdiv=2)
    sc.obj('sack.flour', f, flour_m, None)
    sc.empty('grip', 0, 1.06, 0, 0)
    export(sc, 'flour-sack', {'hands': 1, 'carry': 'side', 'hangs': True, 'grip': [0, 1.06, 0],
                              'notes': 'a small burlap sack of flour 0.9 tall, tied at the neck, white flour showing at the top, a rope loop (along X) to carry it by'})


export = None   # set by build.py
PROPS = {'bread-oven': bread_oven, 'bread-peel': bread_peel, 'dough-trough': dough_trough, 'bread-basket': bread_basket, 'flour-sack': flour_sack}
