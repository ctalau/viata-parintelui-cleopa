"""Reusable set pieces (Blender space, front = -Y, base at z = 0). Each returns bmeshes keyed by material slot."""
import math
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector, noise

from .core import new_bm, merge, transform, set_color, box, tube, lathe, rock, displace, box_uv, COL, UV0


# ---------------------------------------------------------------- booleans (exact solver on temporary objects)
def boolean(bm, cutters, op='DIFFERENCE'):
    me = bpy.data.meshes.new('_b'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new('_b', me); bpy.context.scene.collection.objects.link(ob)
    tmp = []
    for i, c in enumerate(cutters):
        cm = bpy.data.meshes.new(f'_c{i}'); c.to_mesh(cm); c.free()
        co = bpy.data.objects.new(f'_c{i}', cm); bpy.context.scene.collection.objects.link(co)
        co.hide_render = True
        md = ob.modifiers.new(f'b{i}', 'BOOLEAN'); md.operation = op; md.object = co; md.solver = 'EXACT'
        tmp.append(co)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = ob.evaluated_get(dg)
    out = new_bm()
    out.free()
    out = bmesh.new()
    out.from_mesh(ev.to_mesh())
    ev.to_mesh_clear()
    for co in tmp:
        m = co.data; bpy.data.objects.remove(co); bpy.data.meshes.remove(m)
    bpy.data.objects.remove(ob); bpy.data.meshes.remove(me)
    # make sure the standard layers exist
    if UV0 not in out.loops.layers.uv:
        out.loops.layers.uv.new(UV0)
    if COL not in out.loops.layers.color:
        out.loops.layers.color.new(COL)
    return out


def rounded_box(size, radius, cuts=10, center=(0, 0, 0)):
    """Smoothly rounded box from a subdivided cube (corner radius `radius`). Base at center.z - size.z/2."""
    bm = new_bm()
    bmesh.ops.create_cube(bm, size=2.0)
    bmesh.ops.subdivide_edges(bm, edges=bm.edges, cuts=cuts, use_grid_fill=True)
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    ix, iy, iz = hx - radius, hy - radius, hz - radius
    for v in bm.verts:
        p = Vector((v.co.x * hx, v.co.y * hy, v.co.z * hz))
        q = Vector((max(-ix, min(ix, p.x)), max(-iy, min(iy, p.y)), max(-iz, min(iz, p.z))))
        d = p - q
        v.co = q + (d.normalized() * radius if d.length > 1e-6 else d) + Vector(center)
    bm.normal_update()
    return bm


def cutter_box(size, center):
    c = bmesh.new()
    bmesh.ops.create_cube(c, size=1.0)
    transform(c, Matrix.Translation(center) @ Matrix.Diagonal((*size, 1)))
    return c


# ---------------------------------------------------------------- the monk's cell (mud brick, plastered, reed roof)
def cell(seed=1, w=8.4, d=7.0, h=6.5, door_w=2.3, door_h=5.4, window_side=1, front_window=None):
    """A desert monk's cell. Returns (parts, info): parts = {'plaster','wood','reeds','beam','stone'} bmeshes,
    info = {'door': (bm, hinge Vector), 'front_y': y of the front face, 'door_w', 'door_h'}.
    front_window = (x, z_centre, width, height): an open window in the front wall beside the door (no grille: a face
    looking out of it is seen), with a wooden sill, a lintel and an open shutter."""
    rng = np.random.default_rng(seed)
    parts = {}
    t = 0.62  # wall thickness
    mass = rounded_box((w, d, h + 0.4), 0.45, cuts=12, center=(0, 0, (h + 0.4) / 2 - 0.4))
    # battered walls (lean in a little) and hand-made unevenness
    for v in mass.verts:
        k = max(0.0, v.co.z) / h
        v.co.x *= 1 - 0.035 * k
        v.co.y *= 1 - 0.035 * k
    displace(mass, 0.06, 1.6, seed=seed, octaves=3)
    fy = -d / 2  # front face (towards -Y)
    cut = [cutter_box((w - 2 * t, d - 2 * t, h - 0.55), (0, 0, (h - 0.55) / 2 - 0.5)),
           cutter_box((door_w, t * 3, door_h + 0.5), (0, fy, (door_h - 0.5) / 2))]
    wx = (w / 2) * window_side
    cut.append(cutter_box((t * 3, 1.0, 1.0), (wx, 0.6, h * 0.62)))
    if front_window:
        fwx, fwz, fww, fwh = front_window
        cut.append(cutter_box((fww, t * 3, fwh), (fwx, fy, fwz)))
    walls = boolean(mass, cut)
    # damp darker plinth + a lighter lime-washed band around the door (vertex colours, multiply the plaster)
    cl = walls.loops.layers.color[COL]
    for f in walls.faces:
        for l in f.loops:
            z = l.vert.co.z
            k = 0.82 + 0.18 * min(1.0, max(0.0, (z + 0.1) / 0.9))
            nz = 0.94 + 0.06 * noise.noise(l.vert.co * 0.5 + Vector((seed, 0, 0)))
            dx = abs(l.vert.co.x)
            frame = 1.0 + (0.08 if (dx < door_w / 2 + 0.55 and z < door_h + 0.6 and l.vert.co.y < fy + 0.4) else 0.0)
            c = min(1.0, k * nz * frame)
            l[cl] = (c, c * 0.985, c * 0.97, 1)
    parts['plaster'] = walls

    # lintel beam over the door, a sill under the window, roof beams
    wood = new_bm()
    lint = new_bm(); box(lint, (door_w + 1.4, 0.5, 0.42), (0, fy - 0.08, door_h + 0.21), bevel=0.06)
    displace(lint, 0.03, 0.8, seed=seed + 3)
    merge(wood, lint)
    # window grille (3 sticks) + sill
    for k in (-0.3, 0.0, 0.3):
        tube(wood, [Vector((wx, 0.6 + k, h * 0.62 - 0.55)), Vector((wx, 0.6 + k, h * 0.62 + 0.55))], 0.06, sides=6)
    box(wood, (0.5, 1.4, 0.16), (wx + 0.08 * window_side, 0.6, h * 0.62 - 0.56), bevel=0.04)
    if front_window:
        box(wood, (fww + 0.5, 0.75, 0.16), (fwx, fy - 0.05, fwz - fwh / 2 - 0.06), bevel=0.04)      # sill
        box(wood, (fww + 0.7, 0.42, 0.3), (fwx, fy - 0.08, fwz + fwh / 2 + 0.15), bevel=0.05)      # lintel
        sh = new_bm()                                                                               # open shutter
        box(sh, (0.12, fww * 0.5, fwh - 0.08), (0, 0, 0), bevel=0.03)
        for zz in (-fwh * 0.3, fwh * 0.3):
            box(sh, (0.1, fww * 0.42, 0.14), (-0.1, 0, zz), bevel=0.02)
        transform(sh, Matrix.Translation((fwx + fww / 2 + 0.12, fy - fww * 0.25 - 0.08, fwz)))
        merge(wood, sh)
    parts['wood'] = wood

    beams = new_bm()
    nb = 6
    for i in range(nb):
        x = -w / 2 + 0.7 + (w - 1.4) * i / (nb - 1)
        r = 0.2 + 0.03 * rng.random()
        y0, y1 = -d / 2 - 0.55 - 0.25 * rng.random(), d / 2 + 0.5 + 0.2 * rng.random()
        tube(beams, [Vector((x, y0, h - 0.35)), Vector((x + 0.05, y1, h - 0.33))], r, sides=8, uv_v=2.0)
    parts['beam'] = beams

    # reed roof: a thick mat of reeds with a ragged hanging fringe, and a few bundles lying on top
    reeds = new_bm()
    slab = rounded_box((w + 0.9, d + 0.9, 0.55), 0.22, cuts=8, center=(0, 0, h + 0.05))
    displace(slab, 0.07, 1.2, seed=seed + 5)
    box_uv(slab, 3.0)
    merge(reeds, slab)
    fr = new_bm()
    uvl = fr.loops.layers.uv[UV0]
    per = 2 * (w + d + 1.8)
    n = int(per / 0.16)
    for i in range(n):
        s = i / n * per
        hw, hd = (w + 0.9) / 2, (d + 0.9) / 2
        # walk around the rectangle
        if s < 2 * hw: x, y, nx, ny = -hw + s, -hd, 0, -1
        elif s < 2 * hw + 2 * hd: x, y, nx, ny = hw, -hd + (s - 2 * hw), 1, 0
        elif s < 4 * hw + 2 * hd: x, y, nx, ny = hw - (s - 2 * hw - 2 * hd), hd, 0, 1
        else: x, y, nx, ny = -hw, hd - (s - 4 * hw - 2 * hd), -1, 0
        L = 0.35 + 0.35 * rng.random()
        wdt = 0.09 + 0.05 * rng.random()
        tx, ty = -ny, nx
        z0 = h - 0.05
        o = 0.05 + 0.04 * rng.random()
        p0 = Vector((x + nx * o - tx * wdt, y + ny * o - ty * wdt, z0 + 0.2))
        p1 = Vector((x + nx * o + tx * wdt, y + ny * o + ty * wdt, z0 + 0.2))
        dr = 0.12 + 0.1 * rng.random()
        p2 = Vector((x + nx * (o + dr) + tx * wdt * 0.6, y + ny * (o + dr) + ty * wdt * 0.6, z0 - L))
        p3 = Vector((x + nx * (o + dr) - tx * wdt * 0.6, y + ny * (o + dr) - ty * wdt * 0.6, z0 - L))
        vs = [fr.verts.new(p) for p in (p0, p1, p2, p3)]
        f = fr.faces.new(vs)
        u0 = rng.random()
        for l, uv in zip(f.loops, ((u0, 0), (u0 + 0.05, 0), (u0 + 0.05, L / 3), (u0, L / 3))):
            l[uvl].uv = (uv[1] * 3, uv[0])
    merge(reeds, fr)
    for i in range(4):
        x = -w / 2 + 1.2 + (w - 2.4) * (i + rng.random() * 0.4) / 4
        tube(reeds, [Vector((x, -d / 2 - 0.2, h + 0.4)), Vector((x + 0.3 * (rng.random() - 0.5), 0, h + 0.5)), Vector((x, d / 2 + 0.2, h + 0.4))],
             [0.11, 0.13, 0.11], sides=6, uv_v=1.5)
    parts['reeds'] = reeds

    # threshold stone
    st = rock(seed + 11, size=(1.6, 0.75, 0.22), facets=4, detail=0.05, subdiv=2, sink=0.5)
    transform(st, Matrix.Translation((0, fy - 0.75, 0.0)))
    parts['stone'] = st

    # the door leaf: planks + two cross battens, hinge on the left (seen from outside)
    door = new_bm()
    dw, dh = door_w - 0.12, door_h - 0.08
    box(door, (dw, 0.16, dh), (dw / 2, 0, dh / 2), bevel=0.03)
    for zz in (0.9, dh - 0.9):
        box(door, (dw - 0.2, 0.1, 0.32), (dw / 2, -0.12, zz), bevel=0.03)
    # a simple wooden ring pull
    tube(door, [Vector((dw - 0.35, -0.2, dh * 0.5 + k * 0.12)) for k in (-1, 0, 1)], 0.04, sides=6)
    hinge = Vector((-door_w / 2 + 0.06, fy + t * 0.5, 0.02))
    transform(door, Matrix.Translation(hinge))
    return parts, {'door': (door, hinge), 'front_y': fy, 'door_w': door_w, 'door_h': door_h, 'w': w, 'd': d, 'h': h}


# ---------------------------------------------------------------- vegetation
def palm(seed=1, height=10.0, lean=(0.6, 0.2), fronds=15, dates=True, fleshy=True):
    """Date palm: bark trunk (scales), crown of arching pinnate fronds, a few hanging dry fronds, date clusters.
    Returns {'bark','leaf','dry','dates'} and the trunk base radius.
    fleshy=True (default — the only palm we use): the toy look of the 040 poster — fewer, broad, thick rounded leaflets (little plump blades with volume)
    in a brighter green, instead of the thin flat triangles."""
    rng = np.random.default_rng(seed)
    out = {}
    trunk = new_bm()
    pts, radii = [], []
    nseg = 14
    for i in range(nseg + 1):
        t = i / nseg
        bend = t * t
        p = Vector((lean[0] * bend * height * 0.18, lean[1] * bend * height * 0.18, t * height))
        pts.append(p)
        radii.append(0.42 * (1 - 0.35 * t) + (0.25 if i == 0 else 0.0) + 0.06 * (1 - t) ** 6)
    tube(trunk, pts, radii, sides=12, uv_v=2.4)
    # thicker flared foot sunk into the sand
    lathe(trunk, [(0.95, -0.3), (0.75, 0.0), (0.52, 0.45), (0.44, 0.9)], segs=12, uv_v=2.4)
    out['bark'] = trunk
    top = pts[-1]
    tdir = (pts[-1] - pts[-2]).normalized()
    leaf, dry = new_bm(), new_bm()
    uvl = leaf.loops.layers.uv[UV0]
    # crown boss
    boss = new_bm(); bmesh.ops.create_icosphere(boss, subdivisions=2, radius=0.55)
    transform(boss, Matrix.Translation(top + tdir * 0.1) @ Matrix.Diagonal((1, 1, 1.25, 1)))
    out['bark_boss'] = boss

    def frond(bm, base, az, el, length, droop, color_a, color_b, n_leaf=15, lw=0.16, ll=1.05, hang=False):
        uvl = bm.loops.layers.uv[UV0]; cl = bm.loops.layers.color[COL]
        dirh = Vector((math.cos(az), math.sin(az), 0))
        rach = []
        for i in range(n_leaf + 1):
            s = i / n_leaf
            ang = el - droop * s * s * 2.2
            p = base + dirh * (length * s * math.cos(el * 0.5)) + Vector((0, 0, length * (math.sin(el) * s - droop * s * s)))
            rach.append(p)
        tube(bm, rach, [0.06 * (1 - 0.8 * i / n_leaf) + 0.01 for i in range(n_leaf + 1)], sides=4, cap=False)
        side = dirh.cross(Vector((0, 0, 1))).normalized()
        for i in range(2, n_leaf):
            s = i / n_leaf
            p = rach[i]
            tg = (rach[i + 1] - rach[i - 1]).normalized()
            for sgn in (-1, 1):
                L = ll * (0.45 + 0.75 * math.sin(math.pi * min(1.0, s * 1.15))) * (0.85 + 0.3 * rng.random())
                # leaflets in a V, pointing forward + outward + up
                dv = (side * sgn * 0.9 + tg * 0.55 + Vector((0, 0, 0.35 if not hang else -0.5))).normalized()
                tipdrop = Vector((0, 0, -0.18 * L))
                a = p + tg * lw * 0.5; b = p - tg * lw * 0.5
                c = p + dv * L + tipdrop
                col = color_a.lerp(color_b, s * 0.8 + 0.2 * rng.random())
                if fleshy:   # a plump blade: a flattened tube, widest a third of the way out, rounded tip, bending down
                    m1 = p + dv * L * 0.35 + tipdrop * 0.1; m2 = p + dv * L * 0.72 + tipdrop * 0.45
                    blade = new_bm()
                    tube(blade, [p, m1, m2, c], [0.08, 0.21, 0.16, 0.04], sides=8, uv_v=1.0)
                    # flatten across the blade's thickness (the leaf plane holds dv and the rachis tangent)
                    nrm = dv.cross(tg).normalized()
                    for v in blade.verts:
                        d = (v.co - p).dot(nrm); v.co -= nrm * d * 0.45
                    set_color(blade, tuple(col))
                    merge(bm, blade)
                    continue
                vs = [bm.verts.new(a), bm.verts.new(b), bm.verts.new(c)]
                f = bm.faces.new(vs)
                for l, uv in zip(f.loops, ((0, 0.45), (0, 0.55), (1, 0.5))):
                    l[uvl].uv = uv; l[cl] = (*col, 1)
    golden = 2.39996
    for k in range(fronds):
        az = k * golden + rng.random() * 0.3
        el = 0.95 - 0.95 * (k / fronds) + 0.15 * rng.random()
        if fleshy:
            frond(leaf, top + tdir * 0.2, az, el, 3.6 + 1.4 * rng.random(), 0.5 + 0.35 * (k / fronds),
                  Vector((0.16, 0.56, 0.12)), Vector((0.5, 0.8, 0.2)), n_leaf=8, ll=1.35)
        else:
            frond(leaf, top + tdir * 0.2, az, el, 3.8 + 1.6 * rng.random(), 0.55 + 0.35 * (k / fronds),
                  Vector((0.30, 0.52, 0.16)), Vector((0.62, 0.72, 0.28)))
    for k in range(4):
        az = k * 1.7 + 0.4
        frond(dry, top - tdir * 0.4, az, -1.2, 2.6, 0.1, Vector((0.55, 0.38, 0.2)), Vector((0.72, 0.55, 0.3)), n_leaf=16, ll=0.6, hang=True)
    out['leaf'] = leaf
    out['dry'] = dry
    out['top'] = top.copy()
    if dates:
        dt = new_bm()
        for k in range(3):
            az = k * 2.1 + 0.6
            c = top + Vector((math.cos(az) * 0.6, math.sin(az) * 0.6, -0.5))
            tube(dt, [top + Vector((math.cos(az) * 0.3, math.sin(az) * 0.3, 0)), c], 0.05, sides=4)
            for j in range(9):
                q = c + Vector(((rng.random() - 0.5) * 0.5, (rng.random() - 0.5) * 0.5, -rng.random() * 0.9))
                s = new_bm(); bmesh.ops.create_icosphere(s, subdivisions=1, radius=0.11)
                transform(s, Matrix.Translation(q) @ Matrix.Diagonal((1, 1, 1.4, 1)))
                set_color(s, (0.85, 0.42 + 0.15 * rng.random(), 0.12))
                merge(dt, s)
        out['dates'] = dt
    return out


def bush(seed=1, r=1.2, h=1.3, green=(0.42, 0.5, 0.24)):
    """Dry desert shrub: woody twigs + small leaf clumps. Returns {'twig', 'shrub'} (shrub uses vertex colours)."""
    rng = np.random.default_rng(seed)
    tw, lf = new_bm(), new_bm()
    for i in range(7):
        a = i / 7 * 2 * math.pi + rng.random() * 0.5
        e = 0.6 + 0.6 * rng.random()
        L = h * (0.7 + 0.5 * rng.random())
        p0 = Vector((0, 0, -0.05))
        p1 = Vector((math.cos(a) * r * 0.35, math.sin(a) * r * 0.35, L * 0.45))
        p2 = Vector((math.cos(a) * r * (0.7 + 0.3 * rng.random()), math.sin(a) * r * (0.7 + 0.3 * rng.random()), L))
        tube(tw, [p0, p1, p2], [0.06, 0.04, 0.015], sides=4)
        for j in range(3):
            q = p1.lerp(p2, 0.3 + 0.7 * j / 2) + Vector(((rng.random() - 0.5) * 0.35, (rng.random() - 0.5) * 0.35, (rng.random() - 0.3) * 0.25))
            s = new_bm(); bmesh.ops.create_icosphere(s, subdivisions=1, radius=0.22 + 0.14 * rng.random())
            displace(s, 0.05, 0.3, seed=seed * 31 + i * 4 + j, octaves=2)
            transform(s, Matrix.Translation(q) @ Matrix.Diagonal((1, 1, 0.7, 1)))
            k = 0.8 + 0.35 * rng.random()
            set_color(s, (green[0] * k + 0.05 * rng.random(), green[1] * k, green[2] * k))
            merge(lf, s)
    return {'twig': tw, 'shrub': lf}


def tuft(seed=1, r=0.45, h=0.6, n=22, dry=0.5):
    """A clump of desert grass blades (vertex coloured straw→sage)."""
    rng = np.random.default_rng(seed)
    bm = new_bm()
    cl = bm.loops.layers.color[COL]; uvl = bm.loops.layers.uv[UV0]
    for i in range(n):
        a = rng.random() * 2 * math.pi
        d = rng.random() * r * 0.4
        base = Vector((math.cos(a) * d, math.sin(a) * d, -0.05))
        lean = Vector((math.cos(a), math.sin(a), 0)) * (0.25 + 0.5 * rng.random()) * h
        L = h * (0.6 + 0.6 * rng.random())
        w = 0.035 + 0.02 * rng.random()
        side = Vector((-math.sin(a), math.cos(a), 0)) * w
        mid = base + lean * 0.4 + Vector((0, 0, L * 0.6))
        tip = base + lean + Vector((0, 0, L))
        vs = [bm.verts.new(base - side), bm.verts.new(base + side), bm.verts.new(mid + side * 0.6), bm.verts.new(mid - side * 0.6)]
        f1 = bm.faces.new(vs)
        tv = bm.verts.new(tip)
        f2 = bm.faces.new((vs[3], vs[2], tv))
        mix = min(1.0, max(0.0, dry + (rng.random() - 0.5) * 0.6))
        c0 = Vector((0.55, 0.6, 0.3)).lerp(Vector((0.85, 0.72, 0.42)), mix)
        c1 = Vector((0.7, 0.72, 0.4)).lerp(Vector((0.95, 0.85, 0.58)), mix)
        for f, cs in ((f1, (c0 * 0.7, c0 * 0.7, c0, c0)), (f2, (c0, c0, c1))):
            for l, c in zip(f.loops, cs):
                l[cl] = (*c, 1); l[uvl].uv = (0.5, 0.5)
    return bm


def pebbles(seed, n, radius, size=0.12, flat=0.45):
    """A scatter of small flat pebbles (one bmesh, vertex coloured)."""
    rng = np.random.default_rng(seed)
    bm = new_bm()
    for i in range(n):
        a = rng.random() * 2 * math.pi; d = math.sqrt(rng.random()) * radius
        s = size * (0.5 + rng.random())
        p = rock(seed * 101 + i, size=(s, s * (0.6 + 0.4 * rng.random()), s * flat), facets=3, detail=0.08, subdiv=1, sink=0.4)
        transform(p, Matrix.Translation((math.cos(a) * d, math.sin(a) * d, 0)) @ Matrix.Rotation(rng.random() * 6.28, 4, 'Z'))
        k = 0.75 + 0.35 * rng.random()
        set_color(p, (0.86 * k, 0.72 * k, 0.58 * k))
        merge(bm, p)
    return bm


def mesa(seed, w, d, h, tile=12.0):
    """A distant flat-topped sandstone cliff (butte) for the horizon."""
    bm = rounded_box((w, d, h), min(w, d, h) * 0.12, cuts=8, center=(0, 0, h / 2 - 1.0))
    rng = np.random.default_rng(seed)
    off = Vector(rng.random(3) * 50)
    for v in bm.verts:
        k = (v.co.z + 1) / h
        # slopes at the foot (talus), vertical cliff above, eroded steps
        taper = 1 + 0.35 * max(0.0, 0.35 - k) / 0.35
        v.co.x *= taper; v.co.y *= taper
        step = math.floor(k * 4) / 4
        v.co.x *= 1 - 0.06 * step; v.co.y *= 1 - 0.06 * step
        n = noise.fractal(v.co * (1.0 / (h * 0.5)) + off, 0.6, 2.0, 4)
        v.co.x += n * w * 0.08; v.co.y += n * d * 0.08
        v.co.z += noise.fractal(v.co * (3.0 / h) + off, 0.5, 2.0, 3) * h * 0.04 * (1 if k > 0.9 else 0.3)
    bm.normal_update()
    box_uv(bm, tile)
    return bm
