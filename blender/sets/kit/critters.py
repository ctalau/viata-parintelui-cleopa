"""Small charming things for children to spot: animals, flowers, butterflies, a well, a garden, a laundry line, a hearth
with smoke, pots and baskets. Toy-like forms (ellipsoids, tubes) with vertex colours. Blender space, front = -Y, base z=0.

Animated pieces are separate objects with a custom property `anim` (exported as glTF extras → three.js userData.anim);
lib/engine3/look.js moves them as pure functions of t:
  sway (amp, freq, phase)          small rotation about the object's origin (palm crowns, cloths, flowers)
  butterfly (radius, height, freq)  loops around its origin, children `wing.L` / `wing.R` flap
  peck (freq, phase)                a bird pecking / nodding (rotation about X)
  tail (freq)                       a cat's tail swishing (rotation about Z)
  graze (freq)                      a donkey's head going down and up
  smoke (speed, rise)               children `puff*` rise, grow and fade in a loop
"""
import math
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector, noise
from mathutils.geometry import interpolate_bezier

from .core import new_bm, merge, transform, set_color, tube, lathe, rock, box, displace


def blob(bm, center, size, color, subdiv=2, rot=None):
    s = new_bm()
    bmesh.ops.create_icosphere(s, subdivisions=subdiv, radius=1.0)
    M = Matrix.Translation(center)
    if rot is not None:
        M = M @ rot
    transform(s, M @ Matrix.Diagonal((*size, 1)))
    set_color(s, color)
    return merge(bm, s)


def cone(bm, base, tip, r, color, sides=8):
    s = new_bm()
    tube(s, [Vector(base), Vector(tip)], [r, 0.002], sides=sides)
    set_color(s, color)
    merge(bm, s)


def stick(bm, a, b, r, color, sides=6):
    s = new_bm()
    tube(s, [Vector(a), Vector(b)], r, sides=sides)
    set_color(s, color)
    merge(bm, s)


def curve_stick(bm, pts, r, color, sides=6):
    s = new_bm()
    tube(s, [Vector(p) for p in pts], r, sides=sides)
    set_color(s, color)
    merge(bm, s)


# ---------------------------------------------------------------- animals
def dove(color=(0.96, 0.95, 0.93), wing=(0.78, 0.78, 0.8)):
    """A little white dove sitting, ≈ 0.45 tall, facing -Y. Returns (body bm, head bm, head pivot)."""
    b = new_bm()
    blob(b, (0, 0.05, 0.22), (0.16, 0.3, 0.16), color)
    blob(b, (0.12, 0.08, 0.25), (0.05, 0.22, 0.1), wing, rot=Matrix.Rotation(-0.25, 4, 'X'))
    blob(b, (-0.12, 0.08, 0.25), (0.05, 0.22, 0.1), wing, rot=Matrix.Rotation(-0.25, 4, 'X'))
    cone(b, (0, 0.28, 0.27), (0, 0.5, 0.33), 0.08, wing)  # tail
    for x in (-0.05, 0.05):
        stick(b, (x, 0.0, 0.08), (x, -0.02, 0.0), 0.015, (0.9, 0.45, 0.4))
    h = new_bm()
    blob(h, (0, 0, 0.0), (0.1, 0.1, 0.1), color)
    cone(h, (0, -0.08, -0.01), (0, -0.17, -0.03), 0.03, (0.95, 0.6, 0.25))
    for x in (-0.06, 0.06):
        blob(h, (x, -0.05, 0.03), (0.018, 0.018, 0.018), (0.08, 0.06, 0.06), subdiv=1)
    return b, h, Vector((0, -0.2, 0.42))


def cat(fur=(0.92, 0.6, 0.3), belly=(1.0, 0.9, 0.78)):
    """A ginger cat sitting (≈ 1.0 tall). Returns (body, tail, tail pivot)."""
    b = new_bm()
    blob(b, (0, 0.05, 0.38), (0.3, 0.34, 0.4), fur)
    blob(b, (0, -0.16, 0.32), (0.2, 0.12, 0.28), belly)
    blob(b, (0, -0.06, 0.88), (0.25, 0.22, 0.21), fur)
    blob(b, (0, -0.24, 0.83), (0.1, 0.06, 0.07), belly)
    for x in (-0.13, 0.13):
        cone(b, (x, -0.04, 1.0), (x * 1.25, -0.04, 1.2), 0.08, fur, sides=4)
        blob(b, (x * 0.62, -0.25, 0.92), (0.035, 0.02, 0.045), (0.25, 0.4, 0.15), subdiv=1)
        blob(b, (x * 0.8, -0.18, 0.05), (0.08, 0.12, 0.06), belly)
    blob(b, (0, -0.29, 0.86), (0.025, 0.015, 0.02), (0.9, 0.5, 0.5), subdiv=1)
    for k in range(3):  # stripes
        blob(b, (0, 0.05 + 0.06 * k, 0.6 - 0.12 * k), (0.31, 0.05, 0.05), (fur[0] * 0.75, fur[1] * 0.7, fur[2] * 0.7), subdiv=1)
    t = new_bm()
    curve_stick(t, [(0, 0, 0), (0.15, 0.1, -0.05), (0.38, 0.05, 0.0), (0.5, -0.15, 0.12)], 0.06, fur)
    return b, t, Vector((0.0, 0.33, 0.12))


def cat_asleep():
    """A curled ginger tabby with a sculpted coat, tucked paws and a separate, tapered tail."""
    ginger = (0.75, 0.38, 0.14)
    stripe = (0.37, 0.135, 0.044)
    cream = (0.88, 0.75, 0.51)
    dark = (0.072, 0.031, 0.019)

    def blend(a, b, k):
        k = max(0.0, min(1.0, k))
        return tuple(x + (y - x) * k for x, y in zip(a, b))

    def coat_color(p, band, pale):
        brushed = 0.90 + 0.10 * noise.noise(Vector((p.x * 39, p.y * 17, p.z * 53)))
        base = blend(ginger, stripe, band)
        return tuple(c * brushed for c in blend(base, cream, pale))

    def paint(mesh, shade):
        layer = mesh.loops.layers.color['Col']
        colors = {v: (*shade(v.co), 1.0) for v in mesh.verts}
        for f in mesh.faces:
            for l in f.loops:
                l[layer] = colors[l.vert]

    # Voxel-join the shoulder, haunch and folded legs, then smooth away the construction seams.
    form = new_bm()
    for p, axes in (((-0.07, 0.13, 0.225), (0.365, 0.410, 0.234)),
                    ((0.045, -0.20, 0.199), (0.279, 0.283, 0.198)),
                    ((-0.237, -0.025, 0.164), (0.172, 0.234, 0.152)),
                    ((-0.152, -0.337, 0.091), (0.109, 0.181, 0.082)),
                    ((0.122, -0.369, 0.089), (0.105, 0.180, 0.081))):
        blob(form, p, axes, ginger, subdiv=4)
    me = bpy.data.meshes.new('_cat_form')
    form.to_mesh(me)
    form.free()
    sculpture = bpy.data.objects.new('_cat_form', me)
    bpy.context.scene.collection.objects.link(sculpture)
    with bpy.context.temp_override(object=sculpture, active_object=sculpture):
        me.remesh_voxel_size = 0.014
        bpy.ops.object.voxel_remesh()
    if sculpture.data != me and me.users == 0:
        bpy.data.meshes.remove(me)
    me = sculpture.data
    body = new_bm()
    body.from_mesh(me)
    bpy.data.objects.remove(sculpture, do_unlink=True)
    bpy.data.meshes.remove(me)
    for _ in range(4):
        bmesh.ops.smooth_vert(body, verts=body.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)

    def pelt(p):
        x, y, z = p
        ripples = math.cos(math.tau * (y * 5.1 + x * x * 1.9 + z * 0.72 + 0.05 * math.sin(x * 17)))
        band = max(0.0, ripples) ** 3 * min(0.77, max(0.0, (z - 0.08) * 3.9))
        chest = (0.19 - z) * 7.0 + max(0.0, -y - 0.31) * 6.0
        return coat_color(p, band, chest)

    paint(body, pelt)

    # Head is tilted into the paws. Highlights and tabby markings are part of the coat surface.
    hx, hy, hz = 0.055, -0.424, 0.245
    rx, ry, rz = 0.228, 0.194, 0.181
    head = new_bm()
    blob(head, (hx, hy, hz), (rx, ry, rz), ginger, subdiv=5)

    def facial_coat(p):
        dx, dy, dz = p.x - hx, p.y - hy, p.z - hz
        mask = max(0.0, min(1.0, (dz - 0.061) * 16))
        mark = math.cos(math.tau * (dx * 10.5 + dz * 2.9 + abs(dx) * dz * 5))
        cheeks = (0.07 - abs(dx)) * 4.7 - (dz + 0.008) * 8.6
        return coat_color(p, max(0.0, mark) ** 4 * mask * 0.79, cheeks * (0.52 - dy * 2.8))

    paint(head, facial_coat)
    merge(body, head)

    # Rounded pinnae bend outwards, with rose colour recessed inside the rims.
    for side in (-1, 1):
        ear = new_bm()
        rows, colors = [], {}
        for h, w, depth in ((0.0, 0.077, 0.059), (0.047, 0.073, 0.048),
                            (0.105, 0.052, 0.035), (0.155, 0.028, 0.022),
                            (0.182, 0.014, 0.012), (0.193, 0.003, 0.004)):
            row = []
            for i in range(16):
                a = i * math.tau / 16
                forward = math.cos(a)
                inner = max(0.0, forward) ** 3
                x = hx + side * (0.122 + h * 0.37) + w * math.sin(a)
                rim = math.sin(h * math.pi / 0.193)
                y = hy + h * 0.27 - depth * forward + inner * 0.022 * rim
                v = ear.verts.new((x, y, hz + 0.084 + h))
                coat = blend(ginger, (0.81, 0.55, 0.30), max(0.0, forward) * 0.63)
                colors[v] = (*blend(coat, (0.68, 0.32, 0.27), inner * rim), 1.0)
                row.append(v)
            rows.append(row)
        for row, nxt in zip(rows, rows[1:]):
            for i in range(16):
                j = (i + 1) % 16
                ear.faces.new((row[i], row[j], nxt[j], nxt[i]))
        ear.faces.new(rows[-1])
        layer = ear.loops.layers.color['Col']
        for f in ear.faces:
            for loop in f.loops:
                loop[layer] = colors[loop.vert]
        bmesh.ops.recalc_face_normals(ear, faces=ear.faces)
        merge(body, ear)

    for side in (-1, 1):
        blob(body, (hx + side * 0.046, hy - 0.166, hz - 0.062),
             (0.075, 0.073, 0.050), cream, subdiv=4)
        # Closed eyelids trace the curved facial surface, tapering into its two corners.
        lid, widths = [], []
        for i in range(11):
            u = i * 0.2 - 1
            x = side * 0.088 + u * 0.052
            z = 0.034 + 0.027 * u * u + side * u * 0.008
            y = ry * math.sqrt(1 - (x / rx) ** 2 - (z / rz) ** 2)
            lid.append(Vector((hx + x, hy - y - 0.002, hz + z)))
            widths.append(0.0022 + 0.0047 * (1 - u * u))
        set_color(body, dark, tube(body, lid, widths, sides=7))
        for i in range(3):
            spread = 0.027 * (i - 1)
            p0 = Vector((hx + side * (0.094 + 0.004 * i), hy - 0.212, hz - 0.065 + spread * 0.48))
            p1 = p0 + Vector((side * 0.077, -0.030, spread * 0.5))
            p2 = p1 + Vector((side * (0.089 - 0.013 * i), 0.025, spread))
            p3 = p2 + Vector((side * 0.043, 0.014, spread * 0.4))
            whisker = interpolate_bezier(p0, p1, p2, p3, 12)
            widths = [0.0026 - 0.0020 * k / 11 for k in range(12)]
            set_color(body, (0.83, 0.75, 0.60), tube(body, whisker, widths, sides=4))

    # A little rounded, inverted-triangle nose with a short philtrum above the folded paws.
    nose = new_bm()
    blob(nose, (0, 0, 0), (0.041, 0.019, 0.024), (0.49, 0.19, 0.17), subdiv=3)
    for v in nose.verts:
        v.co.x *= 0.76 + v.co.z * 10
        v.co += Vector((hx, hy - 0.238, hz - 0.039))
    merge(body, nose)
    mouth = (0.25, 0.093, 0.058)
    curve_stick(body, [(hx, hy - 0.240, hz - 0.055), (hx, hy - 0.236, hz - 0.079)], 0.0039, mouth)
    for side in (-1, 1):
        corners = [(hx + side * 0.043 * u, hy - 0.236 + 0.007 * u, hz - 0.079 - 0.007 * math.sin(math.pi * u))
                   for u in (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)]
        curve_stick(body, corners, 0.0033, mouth)

    # The tail wraps around the haunch and tapers beside the front feet.
    pivot = Vector((-0.099, 0.385, 0.133))
    points = [Vector(p) - pivot for p in ((-0.099, 0.385, 0.133), (0.056, 0.493, 0.131), (0.244, 0.416, 0.105),
              (0.397, 0.219, 0.092), (0.438, 0.010, 0.085), (0.424, -0.204, 0.072),
              (0.348, -0.365, 0.068), (0.245, -0.463, 0.070), (0.191, -0.484, 0.076))]
    radii = [0.089, 0.092, 0.085, 0.076, 0.069, 0.060, 0.054, 0.045, 0.008]
    curve, widths = [], []
    for i, (start, end) in enumerate(zip(points, points[1:])):
        h0 = start + (end - points[max(0, i - 1)]) / 6
        h1 = end - (points[min(i + 2, len(points) - 1)] - start) / 6
        curve.extend(interpolate_bezier(start, h0, h1, end, 6)[:-1])
        widths.extend(radii[i] + (radii[i + 1] - radii[i]) * j / 5 for j in range(5))
    curve.append(points[-1])
    widths.append(radii[-1])
    tail = new_bm()
    tube(tail, curve, widths, sides=14)
    uv, color = tail.loops.layers.uv['UV0'], tail.loops.layers.color['Col']
    for f in tail.faces:
        for l in f.loops:
            band = max(0.0, math.cos(l[uv].uv.y * math.tau * 4.15)) ** 2.5
            l[color] = (*blend(ginger, stripe, band * 0.79), 1.0)
    return body, tail, pivot


def donkey(coat=(0.55, 0.5, 0.47), light=(0.88, 0.84, 0.8), dark=(0.25, 0.22, 0.2)):
    """A donkey (≈ 2.8 tall at the ears), facing -Y. Returns (body, head, head pivot)."""
    b = new_bm()
    blob(b, (0, 0, 1.65), (0.6, 1.15, 0.62), coat)
    blob(b, (0, 0.05, 1.32), (0.45, 0.9, 0.3), light)
    for x in (-0.33, 0.33):
        for y in (-0.75, 0.72):
            curve_stick(b, [(x, y, 1.4), (x, y + 0.03, 0.75), (x, y, 0.12)], 0.13, coat, sides=8)
            blob(b, (x, y - 0.03, 0.08), (0.14, 0.16, 0.1), dark)
    curve_stick(b, [(0, 1.05, 1.9), (0, 1.25, 1.5), (0, 1.3, 1.0)], 0.05, coat)
    blob(b, (0, 1.3, 0.92), (0.08, 0.08, 0.16), dark)
    # neck (with a dark mane) belongs to the body; the head nods
    curve_stick(b, [(0, -0.85, 1.85), (0, -1.15, 2.25)], 0.3, coat, sides=10)
    blob(b, (0, -0.95, 2.2), (0.07, 0.35, 0.22), dark, rot=Matrix.Rotation(0.6, 4, 'X'))
    h = new_bm()
    blob(h, (0, -0.35, -0.05), (0.27, 0.48, 0.27), coat, rot=Matrix.Rotation(0.5, 4, 'X'))
    blob(h, (0, -0.72, -0.28), (0.22, 0.2, 0.2), light)
    for x in (-0.12, 0.12):
        cone(h, (x, -0.1, 0.18), (x * 2.2, 0.0, 0.75), 0.1, coat, sides=6)
        blob(h, (x * 1.7, -0.06, 0.4), (0.04, 0.03, 0.15), light, subdiv=1)
        blob(h, (x * 1.7, -0.5, 0.06), (0.04, 0.04, 0.04), dark, subdiv=1)
    return b, h, Vector((0, -1.15, 2.3))


def camel_resting(coat=(0.86, 0.68, 0.45)):
    """A camel lying down (far away on a dune), ≈ 3.4 tall at the head."""
    b = new_bm()
    blob(b, (0, 0, 0.75), (0.85, 1.6, 0.7), coat)
    blob(b, (0, 0.1, 1.45), (0.6, 0.7, 0.55), coat)
    for x in (-0.7, 0.7):
        blob(b, (x, -0.6, 0.25), (0.25, 0.7, 0.22), coat)
        blob(b, (x, 0.9, 0.25), (0.25, 0.6, 0.22), coat)
    curve_stick(b, [(0, -1.3, 0.9), (0, -1.9, 1.5), (0, -2.0, 2.4), (0, -2.15, 2.9)], [0.33, 0.28, 0.22, 0.2], coat, sides=10)
    blob(b, (0, -2.45, 2.95), (0.22, 0.45, 0.24), coat)
    curve_stick(b, [(0, 1.5, 1.1), (0, 1.75, 0.7)], 0.07, coat)
    return b


def lizard(c=(0.62, 0.72, 0.32)):
    b = new_bm()
    blob(b, (0, 0, 0.07), (0.09, 0.28, 0.06), c)
    blob(b, (0, -0.32, 0.08), (0.07, 0.1, 0.05), c)
    curve_stick(b, [(0, 0.25, 0.06), (0.08, 0.5, 0.04), (0.0, 0.75, 0.03)], [0.05, 0.03, 0.01], c, sides=5)
    for x in (-1, 1):
        for y in (-0.15, 0.15):
            stick(b, (x * 0.06, y, 0.06), (x * 0.17, y - 0.05, 0.0), 0.02, c, sides=4)
    for x in (-0.04, 0.04):
        blob(b, (x, -0.36, 0.11), (0.015, 0.015, 0.015), (0.1, 0.08, 0.05), subdiv=1)
    return b


def tortoise(shell=(0.62, 0.48, 0.28), skin=(0.66, 0.6, 0.42)):
    b = new_bm()
    s = new_bm()
    lathe(s, [(0.0, 0.42), (0.18, 0.4), (0.32, 0.32), (0.4, 0.18), (0.42, 0.1), (0.38, 0.08)], segs=10, uv_v=1.0)
    transform(s, Matrix.Diagonal((1.0, 1.25, 1.0, 1)))
    cl = s.loops.layers.color['Col']
    for f in s.faces:  # hexagon-ish plates: alternate tones per face
        k = 0.85 + 0.25 * ((f.index * 7) % 3) / 2
        for l in f.loops:
            l[cl] = (shell[0] * k, shell[1] * k, shell[2] * k, 1)
    merge(b, s)
    for x in (-0.3, 0.3):
        for y in (-0.3, 0.32):
            blob(b, (x, y, 0.06), (0.09, 0.09, 0.07), skin, subdiv=1)
    return b


def _mottle(bm, scale=14.0, amp=0.18, seed=0.0):
    """skin texture in the vertex colours: small darker / lighter scales and spots (multiplies the colour already set)"""
    cl = bm.loops.layers.color['Col']
    for f in bm.faces:
        for l in f.loops:
            p = l.vert.co
            n = noise.noise(Vector((p.x * scale + seed, p.y * scale, p.z * scale)))
            cell = noise.cell(Vector((p.x * scale * 2.2, p.y * scale * 2.2, p.z * scale * 2.2 + seed)))
            k = 1 + amp * n - 0.25 * (1 - min(1.0, abs(cell - 0.5) * 5))
            c = l[cl]
            l[cl] = (c[0] * k, c[1] * k, c[2] * k, 1)


def tortoise_parts(shell=(0.86, 0.55, 0.24), skin=(0.66, 0.8, 0.42), belly=(0.98, 0.88, 0.58)):
    """A cute toy tortoise for small children that walks (set anim `hen` with `speed` ≈ 0.18, `legs`): a round domed
    shell with neat plates (a honey-coloured centre on each, a soft caramel edge, thin warm-brown lines between them),
    a cream belly rim, a big round head with large glossy eyes (white, a dark pupil, a white glint), pink cheeks and a
    small smile, four round stubby legs, a little tail. Clean colours, no claws, no wrinkles. Returns (body, (head, head
    pivot), [(leg, pivot) × 4]); legs hang from pivots under the shell rim (front pair at -Y = forward, like the head)."""
    b = new_bm()
    seeds, marg = [], set()
    for y in (-0.6, -0.2, 0.2, 0.6):                      # four plates down the middle
        seeds.append(Vector((0, y, math.sqrt(1 - y * y))).normalized())
    for sx in (-1, 1):                                    # four on each side
        for y in (-0.55, -0.18, 0.18, 0.55):
            seeds.append(Vector((sx * 0.72, y * 0.92, 0.45)).normalized())
    for k in range(16):                                   # a ring of small plates round the rim
        a = (k + 0.5) / 16 * 2 * math.pi
        marg.add(len(seeds)); seeds.append(Vector((math.cos(a), math.sin(a), 0.02)).normalized())
    centre_col, rim_col, line_col = (1.0, 0.8, 0.38), (0.95, 0.68, 0.34), (0.42, 0.24, 0.1)

    def shape(d, out=0.0):
        """a point of the unit sphere → the shell (a dome on a flat belly), pushed out by `out`"""
        rr = 1 + out
        return Vector((d.x * 0.46 * rr, d.y * 0.54 * rr, 0.08 + max(d.z, -0.12) * 0.40 * rr))

    # the base: a dark-brown dome (it shows only in the grooves between the plates) with the cream belly
    s = new_bm()
    bmesh.ops.create_icosphere(s, subdivisions=4, radius=1.0)
    cl = s.loops.layers.color['Col']
    for f in s.faces:
        c = belly if f.calc_center_median().z < -0.03 else line_col
        for l in f.loops:
            l[cl] = (*c, 1)
    for v in s.verts:
        v.co = shape(v.co.normalized())
    s.normal_update()
    merge(b, s)
    # the plates: each one its own smooth, puffed patch, its outline the cell of its seed (where it is nearer than any
    # other seed) shrunk by a groove; a golden centre with a soft edge, caramel round it (a toy shell, no jagged seams)
    def ang(u, w):
        return math.acos(max(-1.0, min(1.0, u.dot(w))))
    GAP, N, M = 0.045, 64, 10
    for i, q in enumerate(seeds):
        t1 = (Vector((0, 0, 1)) if abs(q.z) < 0.9 else Vector((1, 0, 0))).cross(q).normalized()
        t2 = q.cross(t1).normalized()
        others = [w for j, w in enumerate(seeds) if j != i]

        def at(th, al):
            return (q * math.cos(al) + (t1 * math.cos(th) + t2 * math.sin(th)) * math.sin(al)).normalized()

        def inside(pt):
            return pt.z > -0.02 and min(ang(pt, w) for w in others) - ang(pt, q) > GAP
        bound = []
        for k in range(N):
            th = k / N * 2 * math.pi
            lo_, hi_ = 0.0, 1.3
            for _ in range(22):
                mid = (lo_ + hi_) / 2
                if inside(at(th, mid)):
                    lo_ = mid
                else:
                    hi_ = mid
            bound.append(lo_)
        # smooth the outline a little (soft corners)
        bound = [(bound[k - 1] + 2 * bound[k] + bound[(k + 1) % N]) / 4 for k in range(N)]
        pm = new_bm()
        cl = pm.loops.layers.color['Col']
        rim = i in marg

        def colour(u):
            if rim:
                return rim_col
            t = min(1.0, max(0.0, (0.55 - u) / 0.15))
            t = t * t * (3 - 2 * t)
            return tuple(shell[c] + (centre_col[c] - shell[c]) * t for c in range(3))

        def out(u):
            return 0.006 + 0.03 * math.sqrt(max(0.0, 1 - u ** 2.4))
        centre = pm.verts.new(shape(q, out(0)))
        rings = []
        for m in range(1, M + 1):
            u = m / M
            rings.append([pm.verts.new(shape(at(k / N * 2 * math.pi, bound[k] * u), out(u))) for k in range(N)])
        faces = []
        for k in range(N):
            faces.append((pm.faces.new((centre, rings[0][k], rings[0][(k + 1) % N])), (0, 1 / M, 1 / M)))
        for m in range(M - 1):
            for k in range(N):
                f = pm.faces.new((rings[m][k], rings[m + 1][k], rings[m + 1][(k + 1) % N], rings[m][(k + 1) % N]))
                faces.append((f, ((m + 1) / M, (m + 2) / M, (m + 2) / M, (m + 1) / M)))
        for f, us in faces:
            for l, u in zip(f.loops, us):
                l[cl] = (*colour(u), 1)
        pm.normal_update()
        if sum(f.normal.dot(f.calc_center_median() - Vector((0, 0, 0.08))) for f in pm.faces) < 0:
            for f in pm.faces:
                f.normal_flip()
        merge(b, pm)
    blob(b, (0, 0.52, 0.08), (0.05, 0.08, 0.045), skin, subdiv=2)          # a little tail
    legs = []
    for x in (-0.27, 0.27):
        for y in (-0.3, 0.3):
            lg = new_bm()
            blob(lg, (x * 0.25, 0, -0.06), (0.095, 0.1, 0.1), skin, subdiv=3)
            blob(lg, (x * 0.28, -0.02, -0.12), (0.095, 0.11, 0.05), skin, subdiv=3)  # a round foot
            legs.append((lg, Vector((x, y, 0.15))))
    h = new_bm()
    tube(h, [Vector((0, 0.06, -0.02)), Vector((0, -0.1, 0.02))], [0.075, 0.075], sides=14)
    set_color(h, skin)
    blob(h, (0, -0.2, 0.06), (0.14, 0.14, 0.125), skin, subdiv=3)          # a big round head
    for x in (-0.07, 0.07):
        blob(h, (x, -0.305, 0.1), (0.045, 0.03, 0.05), (1, 1, 1), subdiv=3)            # eye whites
        blob(h, (x * 1.02, -0.33, 0.1), (0.027, 0.012, 0.032), (0.08, 0.06, 0.05), subdiv=2)  # pupils
        blob(h, (x * 0.94, -0.343, 0.118), (0.009, 0.004, 0.009), (1, 1, 1), subdiv=1)  # glints
        blob(h, (x * 1.35, -0.29, 0.03), (0.03, 0.01, 0.02), (1.0, 0.6, 0.6), subdiv=2)   # pink cheeks
    # a small smile under the eyes
    pts = []
    for i in range(7):
        u = -1 + 2 * i / 6
        pts.append(Vector((u * 0.04, -0.335 + 0.012 * u * u, 0.01 + 0.012 * u * u)))
    m = new_bm(); tube(m, pts, [0.006] * len(pts), sides=5); set_color(m, (0.35, 0.18, 0.12)); merge(h, m)
    return b, (h, Vector((0, -0.48, 0.14))), legs


def tortoise_head(skin=(0.66, 0.6, 0.42)):
    """the tortoise's head + neck, pivot at the shell's front rim (0, -0.42, 0.14): it pokes out and looks about"""
    h = new_bm()
    blob(h, (0, -0.16, 0.02), (0.11, 0.14, 0.1), skin)
    for x in (-0.05, 0.05):
        blob(h, (x, -0.26, 0.06), (0.015, 0.015, 0.015), (0.08, 0.06, 0.04), subdiv=1)
    return h, Vector((0, -0.42, 0.14))


def butterfly(color=(1.0, 0.82, 0.25), spot=(0.95, 0.45, 0.2)):
    """Returns (body, wing.L, wing.R): wings hinge on the body's long axis (Y)."""
    body = new_bm()
    blob(body, (0, 0, 0), (0.025, 0.12, 0.025), (0.2, 0.15, 0.1), subdiv=1)
    curve_stick(body, [(0.01, -0.11, 0.0), (0.04, -0.2, 0.06)], 0.005, (0.2, 0.15, 0.1), sides=3)
    curve_stick(body, [(-0.01, -0.11, 0.0), (-0.04, -0.2, 0.06)], 0.005, (0.2, 0.15, 0.1), sides=3)
    wings = []
    for sgn in (1, -1):
        w = new_bm()
        cl = w.loops.layers.color['Col']
        for (cy, r, s) in ((-0.05, 0.13, 1.0), (0.08, 0.09, 0.85)):
            c = w.verts.new((0, cy, 0))
            ring = [w.verts.new((sgn * (0.02 + r * (0.6 + 0.4 * math.cos(a)) * (1 + math.sin(a)) * 0.6), cy + r * math.sin(a) * 0.8, 0))
                    for a in np.linspace(-math.pi / 2, math.pi / 2, 9)]
            for i in range(len(ring) - 1):
                f = w.faces.new((c, ring[i], ring[i + 1]) if sgn > 0 else (c, ring[i + 1], ring[i]))
                for l in f.loops:
                    d = (l.vert.co - c.co).length / r
                    col = Vector(color).lerp(Vector(spot), max(0.0, d - 0.55) * 2.0)
                    l[cl] = (*col, 1)
        wings.append(w)
    return body, wings[0], wings[1]


def flowers(seed, n=7, radius=0.5, palette=((1.0, 0.85, 0.2), (1.0, 1.0, 0.95), (0.98, 0.45, 0.55), (0.95, 0.3, 0.25))):
    """A clump of little desert flowers: green stems + leaves, 5-petal heads with a yellow centre."""
    rng = np.random.default_rng(seed)
    bm = new_bm()
    pc = palette[int(rng.integers(len(palette)))]
    for i in range(n):
        a = rng.random() * 2 * math.pi; d = math.sqrt(rng.random()) * radius
        x, y = math.cos(a) * d, math.sin(a) * d
        h = 0.35 + 0.35 * rng.random()
        top = Vector((x + (rng.random() - 0.5) * 0.15, y + (rng.random() - 0.5) * 0.15, h))
        stick(bm, (x, y, -0.03), top, 0.015, (0.35, 0.6, 0.22), sides=4)
        cone(bm, (x, y, h * 0.3), (x + 0.12, y + 0.03, h * 0.45), 0.03, (0.4, 0.66, 0.25), sides=3)
        col = pc if rng.random() < 0.8 else palette[int(rng.integers(len(palette)))]
        # flat 5-petal head (one fan of triangles, tilted a little) + a yellow centre
        cl = bm.loops.layers.color['Col']
        tilt = Matrix.Rotation((rng.random() - 0.5) * 0.6, 4, 'X') @ Matrix.Rotation(rng.random() * 6.28, 4, 'Z')
        c0 = bm.verts.new(top + Vector((0, 0, 0.01)))
        rim = []
        for k in range(10):
            a = k / 10 * 2 * math.pi
            r = 0.1 if k % 2 == 0 else 0.045
            rim.append(bm.verts.new(top + tilt @ Vector((math.cos(a) * r, math.sin(a) * r, 0.0))))
        for k in range(10):
            f = bm.faces.new((c0, rim[k], rim[(k + 1) % 10]))
            for l in f.loops:
                l[cl] = (1.0, 0.8, 0.2, 1) if l.vert is c0 else (*col, 1)
    return bm


def green_tuft(seed, r=0.45, h=0.55, n=18):
    """Lush green grass (by the well / garden)."""
    from .pieces import tuft
    bm = tuft(seed, r, h, n, dry=0.0)
    cl = bm.loops.layers.color['Col']
    for f in bm.faces:
        for l in f.loops:
            c = l[cl]
            l[cl] = (c[0] * 0.65, min(1.0, c[1] * 1.1), c[2] * 0.6, 1)
    return bm


# ---------------------------------------------------------------- monastic life
def well(stone_rng=11):
    """A round stone well with a wooden frame, a rope and a bucket. Returns {'stone','wood','water','rope'}."""
    rng = np.random.default_rng(stone_rng)
    out = {'stone': new_bm(), 'wood': new_bm(), 'water': new_bm(), 'rope': new_bm()}
    # a solid stone wall (one closed piece: nothing shows through), hewn uneven, with stones set into its face
    wall = new_bm()
    prof = [(1.27, -0.05), (1.29, 0.3), (1.26, 0.62), (1.28, 0.9), (1.24, 0.95), (0.9, 0.95), (0.88, 0.7), (0.86, 0.5)]
    pts = []
    for i in range(len(prof) - 1):          # densify the profile (smooth displacement)
        (r0, z0), (r1, z1) = prof[i], prof[i + 1]
        for k in range(4):
            t = k / 4
            pts.append((r0 + (r1 - r0) * t, z0 + (z1 - z0) * t))
    pts.append(prof[-1])
    lathe(wall, pts, segs=40, uv_v=1.2, uv_u=4.0)
    displace(wall, 0.035, 0.35, seed=stone_rng, octaves=3)
    merge(out['stone'], wall)
    for c in range(3):
        n = 12
        for i in range(n):
            a0 = (i + 0.5 * (c % 2)) / n * 2 * math.pi
            st = rock(stone_rng * 100 + c * 20 + i, size=(0.3, 0.13, 0.15), facets=4, detail=0.03, subdiv=2, sink=0.0)
            transform(st, Matrix.Translation((math.cos(a0) * 1.24, math.sin(a0) * 1.24, 0.17 + c * 0.3)) @ Matrix.Rotation(a0 + math.pi / 2, 4, 'Z'))
            merge(out['stone'], st)
    # flat cap stones
    for i in range(9):
        a0 = i / 9 * 2 * math.pi
        s = rock(stone_rng * 300 + i, size=(0.42, 0.3, 0.1), facets=3, detail=0.03, subdiv=2, sink=0.0)
        transform(s, Matrix.Translation((math.cos(a0) * 1.05, math.sin(a0) * 1.05, 0.98)) @ Matrix.Rotation(a0 + math.pi / 2, 4, 'Z'))
        merge(out['stone'], s)
    w = out['water']
    c = w.verts.new((0, 0, 0.55))
    ring = [w.verts.new((math.cos(a) * 0.95, math.sin(a) * 0.95, 0.55)) for a in np.linspace(0, 2 * math.pi, 25)[:-1]]
    for i in range(24):
        w.faces.new((c, ring[i], ring[(i + 1) % 24]))
    for x in (-1.25, 1.25):
        tube(out['wood'], [Vector((x, 0, 0)), Vector((x * 1.02, 0, 2.7))], 0.11, sides=8, uv_v=1.5)
    tube(out['wood'], [Vector((-1.45, 0, 2.55)), Vector((1.45, 0, 2.55))], 0.12, sides=8, uv_v=1.5)
    tube(out['rope'], [Vector((0.05, 0, 2.47)), Vector((0.05, 0, 1.65))], 0.025, sides=5)
    lathe(out['wood'], [(0.0, 1.15), (0.22, 1.15), (0.25, 1.2), (0.28, 1.5), (0.26, 1.52), (0.23, 1.5), (0.0, 1.5)], segs=12, uv_v=0.5)
    tube(out['rope'], [Vector((-0.26, 0, 1.5)), Vector((0, 0, 1.68)), Vector((0.26, 0, 1.5))], 0.015, sides=4)
    return out


def garden(seed=5, w=4.2, d=2.8):
    """A small vegetable bed: a low mud rim, rows of lettuces, onions and a few red/orange vegetables."""
    rng = np.random.default_rng(seed)
    rim, soil, plants = new_bm(), new_bm(), new_bm()
    for (cx, cy, sx, sy) in ((0, -d / 2, w + 0.3, 0.3), (0, d / 2, w + 0.3, 0.3), (-w / 2, 0, 0.3, d), (w / 2, 0, 0.3, d)):
        box(rim, (sx, sy, 0.3), (cx, cy, 0.08), bevel=0.08, segs=2)
    box(soil, (w - 0.25, d - 0.25, 0.2), (0, 0, 0.03), bevel=0.05, segs=1)
    displace(soil, 0.025, 0.25, seed=seed)
    set_color(soil, (0.45, 0.3, 0.2))
    rows = 4
    for r in range(rows):
        y = -d / 2 + 0.55 + r * (d - 1.1) / (rows - 1)
        kind = r % 3
        for i in range(7):
            x = -w / 2 + 0.45 + i * (w - 0.9) / 6 + (rng.random() - 0.5) * 0.1
            if kind == 0:   # lettuce
                for k in range(6):
                    a = k / 6 * 2 * math.pi
                    blob(plants, (x + math.cos(a) * 0.1, y + math.sin(a) * 0.1, 0.2), (0.14, 0.1, 0.07), (0.45, 0.78, 0.3), subdiv=1,
                         rot=Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(0.6, 4, 'X'))
                blob(plants, (x, y, 0.24), (0.1, 0.1, 0.09), (0.6, 0.85, 0.35), subdiv=1)
            elif kind == 1:  # onions
                for k in range(5):
                    a = k / 5 * 2 * math.pi
                    cone(plants, (x, y, 0.15), (x + math.cos(a) * 0.12, y + math.sin(a) * 0.12, 0.6), 0.025, (0.35, 0.65, 0.25), sides=4)
                blob(plants, (x, y, 0.16), (0.07, 0.07, 0.06), (0.92, 0.85, 0.7), subdiv=1)
            else:            # little melons / peppers
                for k in range(3):
                    a = k / 3 * 2 * math.pi + i
                    blob(plants, (x + math.cos(a) * 0.15, y + math.sin(a) * 0.15, 0.22), (0.13, 0.07, 0.04), (0.4, 0.66, 0.28), subdiv=1, rot=Matrix.Rotation(a, 4, 'Z'))
                col = (0.95, 0.35, 0.2) if i % 2 else (1.0, 0.65, 0.15)
                blob(plants, (x, y, 0.22), (0.09, 0.09, 0.08), col, subdiv=1)
    return {'rim': rim, 'soil': soil, 'plants': plants}


def hearth(seed=3):
    """Three stones and a clay pot on a small fire. Returns {'stone','pot','embers','flame'} (flame is emissive)."""
    out = {'stone': new_bm(), 'pot': new_bm(), 'embers': new_bm(), 'flame': new_bm()}
    for k in range(3):
        a = k / 3 * 2 * math.pi
        s = rock(seed * 10 + k, size=(0.3, 0.26, 0.3), facets=4, detail=0.05, subdiv=2, sink=0.2)
        transform(s, Matrix.Translation((math.cos(a) * 0.45, math.sin(a) * 0.45, 0)))
        merge(out['stone'], s)
    lathe(out['pot'], [(0.0, 0.38), (0.25, 0.4), (0.42, 0.55), (0.47, 0.72), (0.4, 0.9), (0.33, 0.96), (0.36, 1.0), (0.3, 1.0)], segs=16, uv_v=1.0)
    for k in range(5):
        a = k / 5 * 2 * math.pi
        tube(out['embers'], [Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, 0.04)), Vector((-math.cos(a) * 0.1, -math.sin(a) * 0.1, 0.12))], 0.05, sides=5)
    lathe(out['flame'], [(0.0, 0.05), (0.13, 0.1), (0.15, 0.2), (0.08, 0.34), (0.0, 0.45)], segs=10)
    return out


def flame_mesh(h=0.22, r=0.06):
    bm = new_bm()
    lathe(bm, [(0.0, 0.0), (r * 0.8, h * 0.15), (r, h * 0.35), (r * 0.6, h * 0.7), (0.0, h)], segs=10)
    return bm


def smoke_puff(r=0.35):
    bm = new_bm()
    bmesh.ops.create_icosphere(bm, subdivisions=2, radius=r)
    displace(bm, r * 0.18, r * 0.8, seed=int(r * 100))
    return bm


def cloth(w=1.0, h=1.4, seed=1, sag=0.08):
    """A hanging cloth (robe / towel): a wavy rectangle hanging from its top edge at z = 0 (double-sided)."""
    bm = new_bm()
    uvl = bm.loops.layers.uv['UV0']
    nx, nz = 6, 8
    vs = []
    for j in range(nz + 1):
        row = []
        for i in range(nx + 1):
            x = -w / 2 + w * i / nx
            z = -h * j / nz
            y = 0.06 * math.sin(i * 1.7 + seed) * (j / nz) + 0.02 * math.sin(j * 2.1)
            row.append(bm.verts.new((x, y, z - sag * (1 - (2 * i / nx - 1) ** 2) * 0)))
        vs.append(row)
    for j in range(nz):
        for i in range(nx):
            f = bm.faces.new((vs[j][i], vs[j][i + 1], vs[j + 1][i + 1], vs[j + 1][i]))
            for l, (a, b) in zip(f.loops, ((i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1))):
                l[uvl].uv = (a / nx * w, 1 - b / nz * h)
    return bm


def pot(kind=0):
    """Clay pots: 0 = round water jar, 1 = tall amphora, 2 = small bowl."""
    bm = new_bm()
    prof = {
        0: [(0.0, 0.0), (0.3, 0.02), (0.55, 0.3), (0.62, 0.65), (0.5, 1.0), (0.28, 1.18), (0.24, 1.3), (0.32, 1.36), (0.27, 1.38), (0.2, 1.28)],
        1: [(0.0, 0.0), (0.12, 0.05), (0.38, 0.45), (0.45, 0.9), (0.38, 1.35), (0.2, 1.6), (0.17, 1.8), (0.23, 1.86), (0.18, 1.86), (0.14, 1.78)],
        2: [(0.0, 0.0), (0.2, 0.0), (0.38, 0.12), (0.46, 0.3), (0.42, 0.31), (0.33, 0.16), (0.0, 0.12)],
    }[kind]
    lathe(bm, prof, segs=18, uv_v=1.0, uv_u=2.0)
    return bm


def basket_simple(r=0.55, h=0.6, handle=True):
    """A simple woven basket for set dressing (the hero basket is a prop). UV u around, v up."""
    bm = new_bm()
    lathe(bm, [(0.0, 0.0), (r * 0.75, 0.0), (r * 0.85, 0.04), (r, h * 0.6), (r * 1.04, h), (r * 0.96, h), (r * 0.92, h * 0.6), (r * 0.78, 0.06), (0.0, 0.06)],
          segs=20, uv_v=0.25, uv_u=6.0)
    tube(bm, [Vector((math.cos(a) * r * 1.02, math.sin(a) * r * 1.02, h)) for a in np.linspace(0, 2 * math.pi, 25)], 0.04, sides=5, cap=False, uv_v=0.2)
    if handle:
        tube(bm, [Vector((-r * 0.95, 0, h)), Vector((-r * 0.6, 0, h + r * 0.75)), Vector((0, 0, h + r)), Vector((r * 0.6, 0, h + r * 0.75)), Vector((r * 0.95, 0, h))], 0.035, sides=5, uv_v=0.2)
    return bm


def hen(feather=(0.72, 0.36, 0.16), light=(0.9, 0.62, 0.32), tailc=(0.25, 0.18, 0.12)):
    """A plump toy hen (≈ 0.95 tall at the comb), facing -Y. Returns (body, head, head pivot): the head pecks / looks
    about its pivot (the top of the neck)."""
    b = new_bm()
    blob(b, (0, 0.04, 0.46), (0.3, 0.4, 0.3), feather)                      # body
    blob(b, (0, -0.2, 0.5), (0.24, 0.2, 0.25), light)                       # breast
    for x in (-0.25, 0.25):                                                 # folded wings
        blob(b, (x, 0.06, 0.5), (0.07, 0.27, 0.17), (feather[0] * 0.8, feather[1] * 0.8, feather[2] * 0.8), rot=Matrix.Rotation(-0.25, 4, 'X'))
    # tail: a thin fan of five pointed feathers, up and back, close to the body colour (a round dark tail read as a
    # second head)
    for k, a in enumerate((0.55, 0.28, 0.0, -0.28, -0.55)):
        c = tuple(min(1.0, tailc[i] * (0.9 + 0.1 * (k % 2)) ) for i in range(3))
        blob(b, (0.05 * math.sin(a), 0.36, 0.66), (0.035, 0.075, 0.2), c,
             rot=Matrix.Rotation(-0.75, 4, 'X') @ Matrix.Rotation(a, 4, 'Y'))
    curve_stick(b, [(0, -0.2, 0.62), (0, -0.27, 0.8)], 0.14, light, sides=10)  # neck
    for x in (-0.09, 0.09):                                                 # legs + toes
        stick(b, (x, 0.0, 0.22), (x, -0.02, 0.02), 0.03, (1.0, 0.72, 0.2))
        for a in (-0.5, 0.0, 0.5):
            stick(b, (x, -0.02, 0.02), (x + 0.1 * math.sin(a), -0.02 - 0.1 * math.cos(a), 0.015), 0.018, (1.0, 0.72, 0.2))
    h = new_bm()
    blob(h, (0, -0.03, 0.08), (0.13, 0.15, 0.14), light)                    # head
    cone(h, (0, -0.15, 0.07), (0, -0.27, 0.04), 0.045, (1.0, 0.75, 0.15))  # beak
    for k, (y, z, r) in enumerate(((-0.08, 0.22, 0.045), (-0.01, 0.25, 0.05), (0.06, 0.22, 0.045))):   # red comb
        blob(h, (0, y, z), (0.025, r, r), (0.9, 0.12, 0.1), subdiv=1)
    blob(h, (0, -0.15, -0.04), (0.03, 0.035, 0.06), (0.9, 0.12, 0.1), subdiv=1)  # wattle
    for x in (-0.085, 0.085):
        blob(h, (x, -0.09, 0.12), (0.025, 0.025, 0.028), (0.05, 0.04, 0.04), subdiv=1)
        blob(h, (x * 1.08, -0.1, 0.13), (0.008, 0.008, 0.008), (1, 1, 1), subdiv=1)
    return b, h, Vector((0, -0.27, 0.8))


def donkey_parts(coat=(0.55, 0.5, 0.47), light=(0.88, 0.84, 0.8), dark=(0.25, 0.22, 0.2)):
    """The donkey of donkey() in three moving parts, facing -Y: (body, head, head pivot, tail, tail pivot)."""
    b = new_bm()
    blob(b, (0, 0, 1.65), (0.6, 1.15, 0.62), coat)
    blob(b, (0, 0.05, 1.32), (0.45, 0.9, 0.3), light)
    for x in (-0.33, 0.33):
        for y in (-0.75, 0.72):
            curve_stick(b, [(x, y, 1.4), (x, y + 0.03, 0.75), (x, y, 0.12)], 0.13, coat, sides=8)
            blob(b, (x, y - 0.03, 0.08), (0.14, 0.16, 0.1), dark)
    curve_stick(b, [(0, -0.85, 1.85), (0, -1.15, 2.25)], 0.3, coat, sides=10)
    blob(b, (0, -0.95, 2.2), (0.07, 0.35, 0.22), dark, rot=Matrix.Rotation(0.6, 4, 'X'))
    blob(b, (0, -0.1, 2.22), (0.5, 0.42, 0.06), (0.75, 0.2, 0.15))       # a red saddle blanket
    t = new_bm()
    curve_stick(t, [(0, 0, 0), (0, 0.2, -0.4), (0, 0.25, -0.9)], 0.05, coat)
    blob(t, (0, 0.25, -0.98), (0.08, 0.08, 0.16), dark)
    h = new_bm()
    blob(h, (0, -0.35, -0.05), (0.27, 0.48, 0.27), coat, rot=Matrix.Rotation(0.5, 4, 'X'))
    blob(h, (0, -0.72, -0.28), (0.22, 0.2, 0.2), light)
    for x in (-0.12, 0.12):
        cone(h, (x, -0.1, 0.18), (x * 2.2, 0.0, 0.75), 0.1, coat, sides=6)
        blob(h, (x * 1.7, -0.06, 0.4), (0.04, 0.03, 0.15), light, subdiv=1)
        blob(h, (x * 1.45, -0.42, 0.08), (0.05, 0.05, 0.05), dark, subdiv=1)
        blob(h, (x * 1.55, -0.45, 0.1), (0.015, 0.015, 0.015), (1, 1, 1), subdiv=1)
    return b, h, Vector((0, -1.15, 2.3)), t, Vector((0, 1.05, 1.9))


def camel_parts(coat=(0.86, 0.68, 0.45), blanket=(0.78, 0.18, 0.14), fringe=(0.98, 0.78, 0.25)):
    """A friendly camel lying down, facing -Y, in moving parts: (body, neck+head, neck pivot, tail, tail pivot)."""
    b = new_bm()
    blob(b, (0, 0, 0.75), (0.85, 1.6, 0.7), coat)
    blob(b, (0, 0.1, 1.45), (0.6, 0.7, 0.55), coat)
    blob(b, (0, 0.1, 1.62), (0.66, 0.8, 0.42), blanket)                     # blanket over the hump
    for x in (-0.62, 0.62):
        blob(b, (x, 0.1, 1.28), (0.06, 0.78, 0.08), fringe)
    for x in (-0.7, 0.7):
        blob(b, (x, -0.6, 0.25), (0.25, 0.7, 0.22), coat)
        blob(b, (x, 0.9, 0.25), (0.25, 0.6, 0.22), coat)
    n = new_bm()
    P = Vector((0, -1.3, 0.9))
    pts = [Vector(q) - P for q in ((0, -1.3, 0.9), (0, -1.9, 1.5), (0, -2.0, 2.4), (0, -2.15, 2.9))]
    curve_stick(n, [tuple(q) for q in pts], [0.33, 0.28, 0.22, 0.2], coat, sides=10)
    hc = Vector((0, -2.45, 2.95)) - P
    blob(n, tuple(hc), (0.22, 0.45, 0.24), coat)
    blob(n, tuple(hc + Vector((0, -0.38, -0.08))), (0.17, 0.12, 0.13), (coat[0] * 0.9, coat[1] * 0.85, coat[2] * 0.8))
    for x in (-0.15, 0.15):
        blob(n, tuple(hc + Vector((x, -0.12, 0.1))), (0.045, 0.045, 0.05), (0.06, 0.05, 0.05), subdiv=1)
        blob(n, tuple(hc + Vector((x * 1.05, -0.15, 0.12))), (0.014, 0.014, 0.014), (1, 1, 1), subdiv=1)
        blob(n, tuple(hc + Vector((x * 1.1, 0.15, 0.22))), (0.05, 0.04, 0.09), coat, subdiv=1)
    t = new_bm()
    curve_stick(t, [(0, 0, 0), (0, 0.25, -0.4)], 0.07, coat)
    blob(t, (0, 0.27, -0.46), (0.08, 0.08, 0.12), (0.45, 0.32, 0.2))
    return b, n, P, t, Vector((0, 1.5, 1.1))


# ---------------------------------------------------------------- by the water (river-ford)
def reeds(seed, r=0.7, h=2.6, n=26, heads=5):
    """A clump of green reeds by the water: tall tapering blades leaning out, a few brown cattail heads. Facing -Y."""
    rng = np.random.default_rng(seed)
    bm = new_bm()
    for i in range(n):
        a = rng.random() * 2 * math.pi
        d = r * math.sqrt(rng.random())
        x0, y0 = math.cos(a) * d, math.sin(a) * d
        hh = h * (0.55 + 0.45 * rng.random())
        lean = 0.15 + 0.35 * rng.random()
        lx, ly = math.cos(a) * lean * hh * 0.35, math.sin(a) * lean * hh * 0.35
        pts = [Vector((x0, y0, -0.1)), Vector((x0 + lx * 0.3, y0 + ly * 0.3, hh * 0.45)),
               Vector((x0 + lx, y0 + ly, hh))]
        g = 0.75 + 0.35 * rng.random()
        col = (0.28 * g, 0.52 * g, 0.2 * g) if rng.random() < 0.8 else (0.62 * g, 0.6 * g, 0.3 * g)
        s = new_bm()
        tube(s, pts, [0.045, 0.03, 0.004], sides=4)
        set_color(s, col)
        merge(bm, s)
        if i < heads:
            top = Vector((x0 + lx * 0.9, y0 + ly * 0.9, hh * 0.9))
            stick(bm, (x0 + lx * 0.3, y0 + ly * 0.3, hh * 0.45), tuple(top), 0.02, (0.4, 0.45, 0.2))
            blob(bm, tuple(top + Vector((0, 0, 0.18))), (0.07, 0.07, 0.2), (0.42, 0.25, 0.12), subdiv=1)
    return bm


def duck(body=(0.55, 0.4, 0.26), head_c=(0.16, 0.42, 0.24), bill=(0.98, 0.72, 0.2)):
    """A little duck floating (the body sits on the water line at z = 0), ≈ 0.5 long, facing -Y.
    Returns (body bm, head bm, head pivot)."""
    b = new_bm()
    blob(b, (0, 0.04, 0.05), (0.18, 0.3, 0.13), body)
    blob(b, (0.13, 0.08, 0.1), (0.05, 0.2, 0.08), (body[0] * 0.8, body[1] * 0.8, body[2] * 0.8), rot=Matrix.Rotation(-0.2, 4, 'X'))
    blob(b, (-0.13, 0.08, 0.1), (0.05, 0.2, 0.08), (body[0] * 0.8, body[1] * 0.8, body[2] * 0.8), rot=Matrix.Rotation(-0.2, 4, 'X'))
    cone(b, (0, 0.28, 0.1), (0, 0.42, 0.2), 0.07, body)
    blob(b, (0, -0.18, 0.15), (0.08, 0.08, 0.12), body)
    h = new_bm()
    blob(h, (0, 0, 0), (0.09, 0.1, 0.09), head_c)
    blob(h, (0, -0.12, -0.02), (0.045, 0.07, 0.025), bill, subdiv=1)
    for x in (-0.06, 0.06):
        blob(h, (x, -0.04, 0.03), (0.016, 0.016, 0.016), (0.05, 0.04, 0.04), subdiv=1)
    return b, h, Vector((0, -0.2, 0.3))


def goat_parts(coat=(0.96, 0.94, 0.9), patch=(0.55, 0.36, 0.22), dark=(0.22, 0.18, 0.16), horns=True, s=1.0):
    """A little goat (≈ 1.9 tall at the horns; s = 0.65 for a kid), facing -Y, in moving parts:
    (body, head, head pivot, tail, tail pivot). Head: anim 'browse', tail: 'swish'."""
    def S(v):
        return tuple(c * s for c in v)
    b = new_bm()
    blob(b, S((0, 0, 1.05)), S((0.36, 0.66, 0.36)), coat)
    blob(b, S((0.12, 0.15, 1.2)), S((0.26, 0.3, 0.22)), patch)
    for x in (-0.2, 0.2):
        for y in (-0.42, 0.42):
            curve_stick(b, [S((x, y, 0.95)), S((x, y + 0.02, 0.5)), S((x, y, 0.1))], 0.075 * s, coat, sides=7)
            blob(b, S((x, y - 0.02, 0.06)), S((0.08, 0.09, 0.06)), dark, subdiv=1)
    curve_stick(b, [S((0, -0.5, 1.15)), S((0, -0.7, 1.5))], 0.17 * s, coat, sides=8)
    h = new_bm()
    blob(h, S((0, -0.18, 0.0)), S((0.16, 0.28, 0.16)), coat, rot=Matrix.Rotation(0.7, 4, 'X'))
    blob(h, S((0, -0.36, -0.16)), S((0.12, 0.12, 0.1)), (1.0, 0.86, 0.82))
    cone(h, S((0, -0.3, -0.24)), S((0, -0.26, -0.5)), 0.06 * s, (0.86, 0.84, 0.8))               # little beard
    for x in (-0.09, 0.09):
        cone(h, S((x * 1.4, -0.05, 0.05)), S((x * 4.2, -0.02, -0.06)), 0.07 * s, coat, sides=5)   # ears out to the side
        blob(h, S((x * 1.25, -0.24, 0.04)), S((0.035, 0.035, 0.035)), dark, subdiv=1)              # eyes
        blob(h, S((x * 1.32, -0.255, 0.05)), S((0.012, 0.012, 0.012)), (1, 1, 1), subdiv=1)
        if horns:
            curve_stick(h, [S((x, -0.02, 0.12)), S((x * 1.3, 0.1, 0.32)), S((x * 1.5, 0.28, 0.36))], 0.035 * s, (0.72, 0.64, 0.5), sides=5)
    t = new_bm()
    curve_stick(t, [(0, 0, 0), S((0, 0.12, 0.12)), S((0, 0.16, 0.2))], 0.05 * s, coat, sides=5)
    return b, h, Vector(S((0, -0.72, 1.55))), t, Vector(S((0, 0.62, 1.2)))


def dovecote(seed=3, r=1.9, h=7.2):
    """An Egyptian pigeon tower: a round whitewashed mud tower tapering up to a rounded top, rows of clay pots (the
    nests: dark round holes) and perch sticks. Facing -Y. Returns {'plaster','holes','perch','perches'};
    perches = [(x, y, z, heading)] where doves can sit (Blender space, front -Y)."""
    rng = np.random.default_rng(seed)
    out = {'plaster': new_bm(), 'holes': new_bm(), 'perch': new_bm(), 'perches': []}
    prof = [(r, 0.0), (r * 1.02, 0.5), (r * 0.96, h * 0.35), (r * 0.82, h * 0.7), (r * 0.7, h * 0.9), (r * 0.5, h * 0.98),
            (r * 0.25, h * 1.04), (0.0, h * 1.06)]
    lathe(out['plaster'], prof, segs=36, uv_v=3.0, uv_u=3.0)
    displace(out['plaster'], 0.04, 1.3, seed=seed)
    set_color(out['plaster'], (1.0, 0.97, 0.92))

    def rad(z):
        for (r0, z0), (r1, z1) in zip(prof[:-1], prof[1:]):
            if z0 <= z <= z1:
                return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
        return r
    for row, z in enumerate((h * 0.42, h * 0.56, h * 0.7, h * 0.84)):
        n = 12 - 2 * row
        rr = rad(z)
        for i in range(n):
            a = (i + 0.5 * (row % 2)) / n * 2 * math.pi
            c = (math.cos(a) * rr, math.sin(a) * rr, z)
            blob(out['holes'], (c[0] * 1.0, c[1] * 1.0, z), (0.2, 0.2, 0.2), (0.78, 0.45, 0.28), subdiv=1)
            blob(out['holes'], (c[0] * 1.03, c[1] * 1.03, z), (0.12, 0.12, 0.12), (0.12, 0.08, 0.06), subdiv=1)
        # a ring of perch sticks just under the row
        for i in range(4):
            a = (i + 0.25 * row) / 4 * 2 * math.pi
            p0 = Vector((math.cos(a) * (rr - 0.2), math.sin(a) * (rr - 0.2), z - 0.36))
            p1 = Vector((math.cos(a) * (rr + 0.65), math.sin(a) * (rr + 0.65), z - 0.36))
            tube(out['perch'], [p0, p1], 0.05, sides=5)
            if (i + row) % 2 == 0:
                out['perches'].append((p1.x * 0.9, p1.y * 0.9, z - 0.31, math.degrees(a) + 90))
    return out


# ---------------------------------------------------------------- sheepfold (film 047): sheep, a ram, an owl, a bunny, olive trees, cypresses
def _wool(bm, center, size, color, seed, n=16, lump=0.36):
    """a fluffy cloud of wool: an ellipsoid core covered with little round curls (toy fleece)"""
    rng = np.random.default_rng(seed)
    cx, cy, cz = center
    sx, sy, sz = size
    blob(bm, center, (sx * 0.9, sy * 0.9, sz * 0.9), color, subdiv=3)
    for i in range(n):
        u = rng.random() * 2 - 1; a = rng.random() * 2 * math.pi
        if u < -0.55:
            u = -u * 0.6                                     # no curls underneath (between the legs)
        r = math.sqrt(1 - u * u)
        p = (cx + sx * r * math.cos(a), cy + sy * r * math.sin(a), cz + sz * u)
        k = 0.94 + 0.08 * rng.random()
        s = lump * (0.75 + 0.5 * rng.random())
        blob(bm, p, (s * sx / 0.45, s * sx / 0.45, s * sz / 0.42 * 0.85), tuple(min(1.0, c * k) for c in color), subdiv=2)


def sheep_parts(wool=(0.97, 0.95, 0.9), face=(0.26, 0.21, 0.19), s=1.0, horns=False, lying=False, seed=1):
    """A round toy sheep (≈ 1.55 tall at the head; s = 0.62 for a lamb), facing -Y, in moving parts:
    (body, head, head pivot, tail, tail pivot). Head: anim 'browse' (standing) / 'ruminate' (lying); tail: 'swish'.
    horns=True = a ram: thick ridged horns curling round the ears."""
    def S(v):
        return tuple(c * s for c in v)
    b = new_bm()
    bz = 0.5 if lying else 1.0
    _wool(b, S((0, 0.02, bz)), S((0.5, 0.74, 0.46)), wool, seed, n=70, lump=0.15 * s)        # many small curls: a fleece, not lumps
    if lying:
        for x in (-0.3, 0.3):                                   # folded legs peeping out
            for y in (-0.45, 0.4):
                blob(b, S((x * 1.15, y, 0.12)), S((0.12, 0.18, 0.09)), face, subdiv=1)
    else:
        for x in (-0.22, 0.22):
            for y in (-0.42, 0.42):
                curve_stick(b, [S((x, y, 0.75)), S((x, y + 0.02, 0.4)), S((x, y, 0.1))], 0.07 * s, face, sides=7)
                blob(b, S((x, y - 0.02, 0.06)), S((0.08, 0.09, 0.06)), (0.15, 0.12, 0.1), subdiv=1)
    hz = bz + 0.32
    h = new_bm()
    blob(h, S((0, -0.24, -0.02)), S((0.22, 0.32, 0.22)), face, rot=Matrix.Rotation(0.6, 4, 'X'))    # a big long soft face
    blob(h, S((0, -0.46, -0.2)), S((0.15, 0.13, 0.12)), tuple(c * 1.25 for c in face))             # muzzle
    _wool(h, S((0, 0.0, 0.17)), S((0.2, 0.18, 0.12)), wool, seed + 7, n=14, lump=0.07 * s)        # a curly fringe on top
    for x in (-1, 1):
        cone(h, S((x * 0.16, 0.0, 0.04)), S((x * 0.52, 0.04, -0.06)), 0.09 * s, face, sides=6)        # ears out to the side
        blob(h, S((x * 0.36, 0.0, -0.02)), S((0.09, 0.035, 0.04)), (0.95, 0.68, 0.66), subdiv=1)      # pink inside
        blob(h, S((x * 0.13, -0.33, 0.06)), S((0.07, 0.06, 0.075)), (1.0, 1.0, 0.98), subdiv=2)       # big eyes
        blob(h, S((x * 0.14, -0.385, 0.065)), S((0.04, 0.025, 0.045)), (0.05, 0.04, 0.04), subdiv=1)
        blob(h, S((x * 0.15, -0.405, 0.085)), S((0.012, 0.01, 0.012)), (1, 1, 1), subdiv=1)
        if horns:                                                                                    # a ram's curled horn
            pts = []
            for k in range(14):
                a = k / 13 * 1.75 * math.pi
                r = 0.2 * (1 - 0.55 * k / 13)
                pts.append(S((x * (0.15 + 0.05 * k / 13 + 0.06 * math.sin(a * 0.5)), 0.04 + r * math.sin(a), 0.1 - 0.08 + r * math.cos(a))))
            c_ = new_bm()
            tube(c_, [Vector(p) for p in pts], [0.075 * s * (1 - 0.6 * k / 13) for k in range(14)], sides=7)
            set_color(c_, (0.86, 0.76, 0.56))
            merge(h, c_)
    t = new_bm()
    _wool(t, S((0, 0.1, -0.08)), S((0.1, 0.1, 0.13)), wool, seed + 11, n=4, lump=0.07 * s)
    return b, h, Vector(S((0, -0.62, hz))), t, Vector(S((0, 0.7, bz + 0.1)))


def ram_prop(seed=5):
    """The little ram given away (a prop held in both arms): the sheep's parts merged into one mesh, standing, facing -Y."""
    b, h, hp, t, tp = sheep_parts((0.98, 0.96, 0.9), (0.3, 0.24, 0.21), s=0.62, horns=True, seed=seed)
    merge(b, h, Matrix.Translation(hp) @ Matrix.Rotation(-0.25, 4, 'X'))
    merge(b, t, Matrix.Translation(tp))
    return b


def owl(feather=(0.62, 0.45, 0.3), light=(0.93, 0.85, 0.7)):
    """A round little owl perched (≈ 0.8 tall), facing -Y. Returns (body, head, head pivot): the head looks about."""
    b = new_bm()
    blob(b, (0, 0, 0.3), (0.24, 0.22, 0.3), feather)
    blob(b, (0, -0.1, 0.27), (0.17, 0.12, 0.22), light)                              # pale breast
    for x in (-1, 1):
        blob(b, (x * 0.21, 0.02, 0.3), (0.07, 0.17, 0.22), tuple(c * 0.8 for c in feather))   # wings
        for k in (-0.05, 0.0, 0.05):
            stick(b, (x * 0.07, -0.08, 0.05), (x * 0.07 + k, -0.18, 0.0), 0.02, (0.95, 0.7, 0.2), sides=4)  # toes on the branch
    h = new_bm()
    blob(h, (0, 0, 0.13), (0.24, 0.2, 0.19), feather)
    for x in (-1, 1):
        blob(h, (x * 0.095, -0.13, 0.14), (0.085, 0.04, 0.085), light, subdiv=2)          # facial discs
        blob(h, (x * 0.095, -0.16, 0.145), (0.055, 0.03, 0.06), (1.0, 0.8, 0.15), subdiv=1)  # big golden eyes
        blob(h, (x * 0.095, -0.185, 0.15), (0.03, 0.015, 0.033), (0.04, 0.03, 0.03), subdiv=1)
        blob(h, (x * 0.1, -0.195, 0.165), (0.009, 0.006, 0.009), (1, 1, 1), subdiv=1)
        cone(h, (x * 0.13, -0.02, 0.27), (x * 0.2, 0.0, 0.42), 0.05, feather, sides=5)       # ear tufts
    cone(h, (0, -0.17, 0.1), (0, -0.23, 0.03), 0.03, (0.95, 0.72, 0.25), sides=5)            # beak
    return b, h, Vector((0, 0, 0.55))


def bunny(fur=(0.82, 0.74, 0.64), light=(1.0, 0.97, 0.92)):
    """A little rabbit sitting up (≈ 0.75 tall at the ears), facing -Y. Returns (body, head, head pivot)."""
    b = new_bm()
    blob(b, (0, 0.05, 0.22), (0.2, 0.26, 0.22), fur)
    blob(b, (0, -0.1, 0.2), (0.12, 0.08, 0.14), light)
    blob(b, (0, 0.3, 0.2), (0.08, 0.07, 0.08), light, subdiv=1)                      # cotton tail
    for x in (-1, 1):
        blob(b, (x * 0.13, 0.12, 0.08), (0.08, 0.18, 0.07), fur, subdiv=1)           # hind feet
        blob(b, (x * 0.06, -0.17, 0.05), (0.04, 0.07, 0.04), light, subdiv=1)        # front paws
    h = new_bm()
    blob(h, (0, -0.06, 0.05), (0.13, 0.14, 0.12), fur)
    blob(h, (0, -0.18, 0.02), (0.06, 0.04, 0.045), light, subdiv=1)
    blob(h, (0, -0.21, 0.04), (0.018, 0.012, 0.014), (0.95, 0.55, 0.6), subdiv=1)    # pink nose
    for x in (-1, 1):
        blob(h, (x * 0.07, -0.15, 0.08), (0.025, 0.022, 0.03), (0.05, 0.04, 0.04), subdiv=1)
        blob(h, (x * 0.075, -0.17, 0.09), (0.008, 0.006, 0.008), (1, 1, 1), subdiv=1)
        blob(h, (x * 0.05, 0.0, 0.32), (0.045, 0.025, 0.2), fur, rot=Matrix.Rotation(x * 0.18, 4, 'Y'))   # long ears
        blob(h, (x * 0.05, -0.012, 0.32), (0.025, 0.015, 0.16), (0.95, 0.7, 0.7), rot=Matrix.Rotation(x * 0.18, 4, 'Y'), subdiv=1)
    return b, h, Vector((0, -0.12, 0.38))


def olive_tree(seed=1, h=5.0, olives=True, perch_angle=None):
    """A gnarled old olive tree: a twisted silver trunk splitting into branches and a cloud of grey-green leaf clumps
    (with dark olives). Returns {'bark', 'leaf'} (leaf uses vertex colours) and the branch points in 'perch'."""
    rng = np.random.default_rng(seed)
    bark = new_bm(); leaf = new_bm()
    tube(bark, [Vector((0, 0, -0.3)), Vector((0.25, 0.1, 1.0)), Vector((-0.15, 0.2, 2.0)), Vector((0.1, 0.0, h * 0.5))],
         [0.85, 0.6, 0.5, 0.42], sides=12, uv_v=2.0, twist=1.2)
    perch = []
    for i in range(5):
        a = i / 5 * 2 * math.pi + rng.random() * 0.6
        L = h * (0.45 + 0.2 * rng.random())
        p0 = Vector((0.1, 0, h * 0.48))
        p1 = Vector((math.cos(a) * L * 0.45, math.sin(a) * L * 0.45, h * 0.68))
        p2 = Vector((math.cos(a) * L, math.sin(a) * L, h * (0.82 + 0.12 * rng.random())))
        tube(bark, [p0, p1, p2], [0.3, 0.2, 0.08], sides=7, uv_v=2.0)
        perch.append((p1 * 0.5 + p0 * 0.5, a))
        for j in range(4):
            q = p1.lerp(p2, 0.35 + 0.65 * j / 3) + Vector(((rng.random() - 0.5) * 1.0, (rng.random() - 0.5) * 1.0, 0.4 + rng.random() * 0.5))
            s = new_bm(); bmesh.ops.create_icosphere(s, subdivisions=2, radius=1.0)
            displace(s, 0.12, 0.8, seed=seed * 17 + i * 5 + j, octaves=2)
            r = 0.9 + 0.5 * rng.random()
            transform(s, Matrix.Translation(q) @ Matrix.Diagonal((r, r, r * 0.62, 1)))
            k = 0.85 + 0.3 * rng.random()
            set_color(s, (0.47 * k, 0.56 * k, 0.36 * k))
            merge(leaf, s)
            if olives:
                for o in range(3):
                    blob(leaf, (q.x + (rng.random() - 0.5) * r * 1.4, q.y + (rng.random() - 0.5) * r * 1.4, q.z - r * 0.45),
                         (0.08, 0.08, 0.1), (0.2, 0.16, 0.22), subdiv=1)
    if perch_angle is not None:            # a bare branch under the leaves, sticking out (an owl sits at its tip)
        a = perch_angle
        p0 = Vector((0.0, 0.0, h * 0.4))                     # low, under the leaves, well clear of the trunk
        p1 = Vector((math.cos(a) * 1.4, math.sin(a) * 1.4, h * 0.44))
        p2 = Vector((math.cos(a) * 3.0, math.sin(a) * 3.0, h * 0.47))
        tube(bark, [p0, p1, p2], [0.28, 0.17, 0.09], sides=7, uv_v=2.0)
        perch.insert(0, (Vector((math.cos(a) * 2.5, math.sin(a) * 2.5, h * 0.462)), a))
    return {'bark': bark, 'leaf': leaf, 'perch': perch}


def cypress(seed=1, h=8.0, r=0.95):
    """A slim dark-green Mediterranean cypress (a tall flame of foliage on a short trunk), vertex coloured."""
    bm = new_bm()
    s = new_bm(); bmesh.ops.create_icosphere(s, subdivisions=3, radius=1.0)
    for v in s.verts:
        z = (v.co.z + 1) / 2                                  # 0 bottom … 1 top
        w = r * (0.55 + 0.9 * z) * (1 - z) ** 0.9 * 1.25 + 0.04
        v.co.x *= w; v.co.y *= w
        v.co.z = 0.6 + z * (h - 0.6)
    displace(s, 0.14, 0.9, seed=seed, octaves=3)
    cl = s.loops.layers.color['Col']
    for f in s.faces:
        for l in f.loops:
            k = 0.8 + 0.35 * (l.vert.co.z / h) + 0.08 * noise.noise(l.vert.co * 1.3 + Vector((seed, 0, 0)))
            l[cl] = (0.16 * k, 0.36 * k, 0.17 * k, 1)
    merge(bm, s)
    stick(bm, (0, 0, -0.2), (0, 0, 1.0), 0.16, (0.38, 0.28, 0.2))
    return bm
