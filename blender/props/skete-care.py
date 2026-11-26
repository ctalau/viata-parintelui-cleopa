"""Model the skete's textiles, furniture, clay cup and chandelier in Blender and export GLB.

    blender -b --python-exit-code 1 --python blender/props/skete-care.py
"""
import json
import math
import sys
from pathlib import Path

from mathutils import Matrix, Vector

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "sets"))
from kit import core

OUT = HERE.parent.parent / "assets" / "props"
TEXTURES = HERE / "src"


def rgb(hex_value):
    srgb = [int(hex_value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def solid(name, color, rough=0.8, metal=0.0):
    return core.material(name, color=rgb(color), rough=rough, metal=metal)


def textile(name, filename, double=False):
    return core.material(name, (str(TEXTURES / filename), None, None), rough=0.96, double=double)


def box(bm, at, size, bevel=0):
    x, y, z = size
    core.box(bm, (x, z, y), core.B(*at), bevel, segs=2)


def thread(bm, points, radius, sides=8, closed=False):
    core.tube(bm, [core.B(*p) for p in points], radius, sides=sides, cap=not closed, closed=closed)


def ring(bm, center, radius, thickness, *, vertical=False, arcs=math.tau, sides=36):
    x, y, z = center
    angles = [arcs * i / sides for i in range(sides + 1)]
    if vertical:
        points = [(x + radius * math.cos(a), y + radius * math.sin(a), z) for a in angles]
    else:
        points = [(x + radius * math.cos(a), y, z + radius * math.sin(a)) for a in angles]
    thread(bm, points, thickness, closed=arcs == math.tau)


def surface(width, depth, sample, columns=28, rows=42, reverse=False):
    """A cloth patch. Each vertex has the same UV in all adjoining faces."""
    bm = core.new_bm()
    uv = bm.loops.layers.uv[core.UV0]
    verts = []
    for j in range(rows + 1):
        v = j / rows
        verts.append([bm.verts.new(core.B(*sample(i / columns, v, width, depth))) for i in range(columns + 1)])
    for j in range(rows):
        for i in range(columns):
            corners = (verts[j][i], verts[j + 1][i], verts[j + 1][i + 1], verts[j][i + 1])
            values = ((i, j), (i, j + 1), (i + 1, j + 1), (i + 1, j))
            if reverse:
                corners, values = tuple(reversed(corners)), tuple(reversed(values))
            f = bm.faces.new(corners)
            for loop, (u, v) in zip(f.loops, values):
                loop[uv].uv = (u / columns, 1 - v / rows)
    return bm


def prop(name, make, metadata):
    core.reset()
    scene = core.Scene(name)
    make(scene)
    if "grip" in metadata:
        scene.group("grip", Matrix.Translation(core.B(*metadata["grip"])))
    scene.export(str(OUT / (name + ".glb")))
    (OUT / (name + ".json")).write_text(json.dumps(metadata, indent=1) + "\n", encoding="utf-8")


def reed_mat(scene):
    length, width, radius = 6.67, 2.3, 0.25
    straw = [solid(f"reed {i + 1}", c) for i, c in enumerate(
        ["a87644", "d4a66a", "c69255", "d8b57a", "b68347"])]
    dyed = solid("madder-dyed reeds", "a25240")
    cord = solid("flax cord", "d9cdb4")
    spread = scene.group("reed-spread", props={"length": length})
    rolled = scene.group("reed-roll", Matrix.Translation(core.B(0, radius + 0.017, 0)), props={"radius": radius})

    backing = core.new_bm()
    box(backing, (-length / 2, 0.023, 0), (length, 0.046, width), 0.016)
    scene.obj("reed backing", backing, straw[2], parent=spread, vcol=False)
    reeds = [core.new_bm() for _ in range(6)]
    for i in range(100):
        fraction = (i + 0.5) / 100
        x = -fraction * length
        stripe = fraction < 0.08 or fraction > 0.92 or 0.16 < fraction < 0.19 or 0.81 < fraction < 0.84
        thread(reeds[-1 if stripe else i % len(straw)], [(x, 0.046, -width / 2), (x, 0.048, width / 2)], 0.027)
    for i, (bm, mat) in enumerate(zip(reeds, [*straw, dyed])):
        scene.obj(f"woven reeds {i + 1}", bm, mat, parent=spread, vcol=False)
    ties = core.new_bm()
    for z in [-1.10, -0.68, -0.21, 0.21, 0.68, 1.10]:
        thread(ties, [(-length, 0.073, z), (0, 0.073, z)], 0.017)
    scene.obj("woven binding", ties, cord, parent=spread, vcol=False)

    layers = core.new_bm()
    thread(layers, [(0, 0, -width / 2), (0, 0, width / 2)], radius, sides=32)
    for z in [-width * 0.507, width * 0.507]:
        points = []
        for i in range(43):
            a = i * math.tau / 16
            r = radius * (0.12 + 0.86 * i / 42)
            points.append((r * math.cos(a), r * math.sin(a), z))
        thread(layers, points, 0.019)
    scene.obj("rolled spiral", layers, straw[2], parent=rolled, vcol=False)
    bands = core.new_bm()
    for z in [-width * 0.39, width * 0.39]:
        ring(bands, (0, 0, z), radius + 0.008, 0.022, vertical=True)
    scene.obj("rolled dyed bands", bands, dyed, parent=rolled, vcol=False)


def pillow(scene):
    linen = textile("patched pillow linen", "small-pillow-linen.jpg")
    underside = solid("natural unbleached linen", "c6beb0")
    stitch = solid("seam thread", "a48b6d")
    width, depth = 1.35, 0.94
    hull = core.new_bm()
    box(hull, (0, 0.132, 0), (1.19, 0.222, 0.81), 0.093)
    scene.add_col("pillow", hull)["name"] = "col:pillow"

    for state in ("flat", "pressed"):
        root = scene.group(state)

        def profile(u, v, w, d, upper=True):
            a, b = 2 * u - 1, 2 * v - 1
            balloon = (1 - a * a) * (1 - b * b)
            seam_height = 0.28 if state == "pressed" else 0.36
            loft = 0.67 * balloon ** 0.55
            if state == "pressed":
                dent = math.exp(-((a + 0.04) / 1.08) ** 8 - ((b + 0.38) / 0.82) ** 4)
                loft *= 1 - 0.95 * dent
            underside_loft = 0.94 * seam_height if state == "pressed" else 0.34
            y = 0.34 * (seam_height + loft if upper else seam_height - underside_loft * balloon ** 0.60)
            return ((u - 0.5) * w * (1 - 0.047 * b * b), y, (v - 0.5) * d * (1 - 0.05 * a * a))

        scene.obj(state + " pillow top", surface(width, depth, profile, 22, 22), linen, parent=root, vcol=False)
        lower = surface(width, depth, lambda u, v, w, d: profile(u, v, w, d, False), 22, 22, reverse=True)
        scene.obj(state + " pillow underside", lower, underside, parent=root, vcol=False)
        piping = core.new_bm()
        points = [profile(u, v, width, depth) for u, v in [(0, 0), (1, 0), (1, 1), (0, 1), (0, 0)]]
        thread(piping, points, 0.013, closed=True)
        scene.obj(state + " pillow seam", piping, stitch, parent=root, vcol=False)


def blanket(scene):
    wool = textile("woven oatmeal wool", "thin-blanket-wool.jpg", double=True)
    seam = solid("blanket seam", "9f8c70")
    folded = scene.group("folded")
    draped = scene.group("draped")
    stack = core.new_bm()
    for j in range(3):
        box(stack, (0.017 * j, 0.045 + 0.060 * j, 0), (1.39, 0.093, 0.86), 0.037)
    core.box_uv(stack, 1.15)
    scene.obj("folded wool", stack, wool, parent=folded, vcol=False)

    def drape(u, v, width, depth):
        a, b = 2 * u - 1, 2 * v - 1
        # Longitudinal profile runs from the chest to the ankles on a body lying on its side.
        def mound(x, y, length, breadth, height):
            return height * math.exp(-((a - x) / length) ** 2 - ((b - y) / breadth) ** 2)

        shoulders = mound(-0.78, -0.04, 0.29, 0.55, 0.63)
        torso = mound(-0.34, -0.07, 0.68, 0.56, 1.19)
        bent_knee = mound(0.27, 0.22, 0.35, 0.45, 0.89)
        ankles = mound(0.73, -0.10, 0.24, 0.41, 0.63)
        pleat = 0.062 * math.sin(18 * b + 7 * a) * (1 - b * b) + 0.025 * math.sin(13 * b - 3 * a)
        y = max(0.041, 0.064 + shoulders + torso + bent_knee + ankles + pleat)
        breadth = 1 - 0.13 * max(0, a) - 0.045 * math.cos(5 * a) + 0.025 * math.sin(12 * a)
        return (width * a / 2 * (1 - 0.055 * b * b), y, depth * b / 2 * breadth)

    width, depth = 4.90, 2.70
    scene.obj("draped wool", surface(width, depth, drape, 32, 34), wool, parent=draped, vcol=False)
    hems = core.new_bm()
    for side in (0, 1):
        thread(hems, [drape(i / 32, side, width, depth) for i in range(33)], 0.013)
    for end in (0, 1):
        hem = [drape(end, i / 34, width, depth) for i in range(35)]
        thread(hems, hem, 0.018)
        for i in range(22):
            x, y, z = drape(end, i / 21, width, depth)
            direction = 2 * end - 1
            thread(hems, [(x, y, z), (x + direction * (0.064 + 0.014 * math.sin(2.5 * i)),
                                      max(0.022, y - 0.092), z + 0.021 * math.cos(i))], 0.010, sides=5)
    scene.obj("stitched hems", hems, seam, parent=draped, vcol=False)


def cup(scene, tea=False):
    clay = solid("warm terracotta", "ab6245", 0.63)
    liquid = solid("amber tea", "8c4b22", 0.24) if tea else solid("water in the cup", "a6bbac", 0.21)
    vessel = core.new_bm()
    core.lathe(vessel, [(0.05, 0), (0.16, 0.01), (0.21, 0.075), (0.25, 0.33), (0.26, 0.36),
                         (0.229, 0.36), (0.22, 0.32), (0.17, 0.076), (0.05, 0.063)], cap_bottom=True)
    ring(vessel, (0, 0.345, 0), 0.246, 0.014)
    arc = [(0.249 + 0.101 * math.sin(a), 0.226 + 0.101 * math.cos(a), 0)
           for a in (math.pi * i / 14 for i in range(15))]
    thread(vessel, arc, 0.030)
    scene.obj("wheel-thrown cup", vessel, clay, vcol=False)
    water = core.new_bm()
    thread(water, [(0, 0.294, 0), (0, 0.302, 0)], 0.214, sides=32)
    scene.obj("tea" if tea else "water", water, liquid, vcol=False)


def cup_stand(scene, height=0.73):
    wood = core.new_bm()
    box(wood, (0, 0.683, 0), (0.86, 0.094, 0.76), 0.04)
    for x in [-0.29, 0.29]:
        for z in [-0.24, 0.24]:
            thread(wood, [(x * 1.15, 0.016, z * 1.17), (x, 0.64, z)], 0.063, sides=10)
        box(wood, (x, 0.31, 0), (0.097, 0.087, 0.48), 0.018)
    core.transform(wood, Matrix.Diagonal((1, 1, height / 0.73, 1)))
    scene.obj("joined walnut stand", wood, solid("walnut", "92643e", 0.71), vcol=False)


def carpet(scene, width, length, filename):
    pile = textile("hand-knotted wool pile", filename)
    edge = solid("bound edge and tassels", "c6a575")

    def ripple(u, v, w, d):
        p = math.sin(8.4 * math.pi * u + 2.4 * v) * math.cos(2.3 * math.pi * v)
        return ((u - 0.5) * w, 0.025 + 0.013 * p * (0.25 + 0.75 * abs(2 * u - 1)), (v - 0.5) * d)

    scene.obj("woven carpet", surface(width, length, ripple, 22, 47), pile, vcol=False)
    binding = core.new_bm()
    for end in (0, 1):
        t = 2 * end - 1
        hem = [ripple(i / 22, end, width, length) for i in range(23)]
        thread(binding, hem, 0.018, sides=6)
        for i in range(45):
            x, y, z = ripple((i + 0.5) / 45, end, width, length)
            thread(binding, [(x, y, z), (x + 0.019 * math.sin(i), 0.014,
                                         z + t * (0.089 + 0.029 * math.sin(2.4 * i)))], 0.012, sides=5)
    scene.obj("hand knotted tassels", binding, edge, vcol=False)


def nave_carpet(scene):
    wool = core.material("muted red wool", (str(TEXTURES / "thin-blanket-wool.jpg"), None, None),
                         color=rgb("af6963"), rough=0.98)
    ground = surface(17.44, 21.24, lambda u, v, w, d: ((u - .5) * w, 0.009, (v - .5) * d), 8, 8)
    uv = ground.loops.layers.uv[core.UV0]
    for face in ground.faces:
        for loop in face.loops:
            loop[uv].uv *= 8
    scene.obj("wall to wall wool", ground, wool, vcol=False)

    def diamond(bm, x, z, w, d, height):
        verts = [(x - w, z), (x, z + d), (x + w, z), (x, z - d)]
        bm.faces.new([bm.verts.new(core.B(xx, height, zz)) for xx, zz in verts])

    dark, lighter, stitch = (core.new_bm() for _ in range(3))
    for row in range(20):
        for col in range(16):
            x = (col - 7.5) * 1.02
            z = (row - 9.5) * 1.03 + (col % 2 - .5) * 0.48
            diamond(dark, x, z, .177, .258, .012)
            diamond(lighter, x, z, .072, .112, .014)
            for s in (-1, 1):
                diamond(stitch, x + s * .263, z, .044, .057, .013)
    for x in [-8.46, -8.28, 8.28, 8.46]:
        box(dark, (x, .011, 0), (0.037, 0.006, 21.20))
    for z in [-10.44, -10.30, 10.30, 10.44]:
        box(stitch, (0, .010, z), (17.38, 0.006, .037))
    for name, mesh, color in [("lozenge weft", dark, "8a4d49"), ("palmette hearts", lighter, "ba855f"),
                               ("wool stitching", stitch, "aa7863")]:
        scene.obj(name, mesh, solid(name, color, .98), vcol=False)


def stalls(scene):
    frame, inset, trim = (core.new_bm() for _ in range(3))
    for x in [-0.68, 0.68]:
        box(frame, (x, 1.33, -0.40), (0.135, 2.66, 0.19), 0.032)
        box(frame, (x, 0.60, 0.48), (0.12, 1.20, 0.13), 0.03)
        arm = [(x, 1.35, -0.35), (x, 1.30, -0.17), (x, 1.25, 0.15), (x, 1.24, 0.49)]
        core.tube(frame, [core.B(*p) for p in arm], [0.08, 0.087, 0.083, 0.063], sides=12)
        box(trim, (x, 1.22, 0.15), (0.145, 0.068, 0.79), 0.025)
        box(trim, (x, 2.64, -0.39), (0.18, 0.14, 0.22), 0.036)
    box(frame, (0, 0.67, 0.015), (1.33, 0.18, 1.03), 0.049)
    box(frame, (0, 0.091, 0.008), (1.31, 0.16, 1.01), 0.034)
    box(frame, (0, 1.67, -0.415), (1.25, 1.89, 0.17), 0.044)
    box(inset, (0, 1.71, -0.30), (1.03, 1.40, 0.10), 0.05)
    box(trim, (0, 0.79, 0.036), (1.29, 0.059, 0.99), 0.022)
    for x in [-0.5, 0.5]:
        box(trim, (x, 1.69, -0.229), (0.036, 1.34, 0.05), 0.012)
    crest = [(0.50 * math.cos(a), 2.29 + 0.34 * math.sin(a), -0.24) for a in
             (i * math.pi / 16 for i in range(17))]
    thread(trim, crest, 0.038, sides=8)
    ring(trim, (0, 1.76, -0.228), 0.195, 0.023, vertical=True, sides=22)
    for i in range(8):
        a = i * math.tau / 8
        thread(trim, [(0, 1.76, -0.205), (0.113 * math.cos(a), 1.76 + 0.113 * math.sin(a), -0.22)], 0.015)

    rows = [
        (8.13, -90, [-3.76, -1.94, -0.12, 1.70, 3.52, 5.34, 7.16, 8.98]),
        (-8.13, 90, [-1.95, -0.13, 1.69, 3.51, 7.98, 9.80]),
    ]
    places = [(x, z, face) for x, face, spots in rows for z in spots]
    places += [(x, 10.56, 180) for x in [-6.55, -4.73, -2.91, 2.91, 4.73, 6.55]]
    for mesh in (frame, inset, trim):
        core.transform(mesh, Matrix.Diagonal((1.22, 1.14, 1.68, 1)))
    parts = [("oak joinery", frame, "784b33"), ("recessed back", inset, "643f2b"), ("carved oak", trim, "b98551")]
    for number, (x, z, face) in enumerate(places):
        place = scene.group(f"choir stall {number + 1}", core.place(x, z, face, y=0.014))
        if number == 0:
            master = [scene.obj(name, bm, solid(name, color, .72), parent=place, vcol=False).data for name, bm, color in parts]
        else:
            for (name, _, _), mesh in zip(parts, master):
                scene.obj(name, None, None, parent=place, mesh=mesh)


def chandelier(scene):
    brass = solid("wrought brass", "c68b3f", 0.39, 0.70)
    gold = solid("polished brass trim", "f0bd68", 0.29, 0.68)
    patina = solid("dark bronze openwork", "a46634", 0.44, 0.62)
    enamel = solid("amber glass drops", "c88638", 0.28, 0.28)
    wax = solid("honey beeswax", "ffdc93", 0.82)
    wick = solid("candlewick", "482b25", 0.95)
    flame = core.material("flame", color=rgb("ffcd6c"), rough=0.5, emissive=rgb("ffb642"), emissive_strength=2.0)
    rails, beads, tracery, drops, candles, wicks, fire = (core.new_bm() for _ in range(7))

    def turning(bm, at, profile, sides=16):
        faces = core.lathe(bm, profile, segs=sides, cap_bottom=True)
        offset = core.B(*at)
        for vert in {v for face in faces for v in face.verts}:
            vert.co += offset

    def chain(start, end, count):
        a, b = core.B(*start), core.B(*end)
        up = (b - a).normalized()
        across = up.cross(Vector((1, 0, 0))).normalized()
        front = up.cross(across)
        step = (b - a).length / count
        for i in range(count):
            center = a.lerp(b, (i + 0.5) / count)
            side = across if i % 2 else front
            links = [center + up * (step * 0.73 * math.cos(t)) + side * (0.057 * math.sin(t))
                     for t in (math.tau * j / 16 for j in range(17))]
            core.tube(rails, links, 0.018, sides=7, cap=False, closed=True)

    for y, radius, count in [(0.00, 1.51, 12), (0.59, 0.95, 8), (1.20, 0.45, 4)]:
        for dy in [-0.085, 0.085]:
            ring(rails, (0, y + dy, 0), radius, 0.048, sides=54)
            ring(beads, (0, y + dy, 0), radius + 0.041, 0.014, sides=54)
        for i in range(count):
            sector = math.tau / count
            a = (i + 0.5) * sector
            x, z = radius * math.cos(a), radius * math.sin(a)
            turning(rails, (x, y + 0.05, z), [(0.069, 0), (0.064, 0.07), (0.13, 0.09), (0.16, 0.12),
                                               (0.151, 0.15), (0.074, 0.17), (0.071, 0.22)])
            ring(beads, (x, y + 0.175, z), 0.147, 0.018, sides=19)
            ring(beads, (x, y + 0.267, z), 0.071, 0.014, sides=15)
            for sign in [-1, 1]:
                scallop = []
                for j in range(13):
                    u = j / 12
                    theta = a + (u - 0.5) * sector * 0.89
                    r = radius + 0.026 + sign * 0.012 * math.sin(math.pi * u)
                    scallop.append((r * math.cos(theta), y + sign * 0.068 * math.sin(math.tau * u), r * math.sin(theta)))
                thread(tracery, scallop, 0.020, sides=7)
            candle_top = y + 0.51 + 0.038 * math.sin(i * 2.8 + y)
            turning(candles, (x, y, z), [(0.057, 0.23), (0.061, 0.30), (0.056, candle_top - y - 0.021),
                                        (0.055, candle_top - y), (0.021, candle_top - y - 0.014)])
            thread(candles, [(x + 0.054, candle_top - 0.036, z), (x + 0.055, candle_top - 0.12, z)], 0.013)
            thread(wicks, [(x, candle_top - 0.008, z), (x + 0.009, candle_top + 0.048, z)], 0.012)
            points = [(x + 0.008, candle_top + 0.035, z), (x + 0.012, candle_top + 0.108, z),
                      (x + 0.031, candle_top + 0.193, z - 0.016)]
            core.tube(fire, [core.B(*p) for p in points], [0.012, 0.041, 0.003], sides=10)
            if radius > 1:
                turning(beads, (x, -0.22, z), [(0.027, 0), (0.041, 0.06), (0.039, 0.10), (0.02, 0.145)])
                turning(drops, (x, -0.39, z), [(0.011, 0), (0.048, 0.07), (0.051, 0.109), (0.024, 0.172)], 8)

    turning(rails, (0, -0.25, 0), [(0.071, 0), (0.13, 0.07), (0.076, 0.20), (0.045, 0.37),
                                  (0.095, 0.65), (0.061, 0.96), (0.12, 1.23), (0.058, 1.50),
                                  (0.070, 1.77), (0.13, 2.57), (0.155, 2.65), (0.064, 2.72)], 22)
    for i in range(6):
        a = i * math.tau / 6
        c, s = math.cos(a), math.sin(a)
        thread(rails, [(0.08 * c, 0.27, 0.08 * s), (0.45 * c, 0.02, 0.45 * s),
                       (0.99 * c, -0.14, 0.99 * s), (1.51 * c, -0.03, 1.51 * s)], 0.028, sides=10)
        chain((1.51 * c, 0.075, 1.51 * s), (0.10 * c, 2.34, 0.10 * s), 16)
    chain((0, 2.42, 0), (0, 3.04, 0), 5)
    for y, width in [(0.10, 0.14), (1.20, 0.14), (2.39, 0.15)]:
        ring(beads, (0, y, 0), width, 0.027, sides=24)
    box(beads, (0, -0.37, 0), (0.058, 0.39, 0.082), 0.018)
    box(beads, (0, -0.34, 0), (0.285, 0.061, 0.078), 0.018)
    for name, geometry, material in (("cast arms and interlocking chain", rails, brass), ("hammered rims and cross", beads, gold),
                                      ("arched filigree", tracery, patina), ("amber pendants", drops, enamel),
                                      ("beeswax candles and drips", candles, wax), ("cotton wicks", wicks, wick),
                                      ("candle flames", fire, flame)):
        scene.obj(name, geometry, material, vcol=False)


if __name__ == "__main__":
    builds = {
        "rollable-reed-mat": (reed_mat, {"hands": 1, "carry": "side", "hangs": True, "grip": [0.04, 0.46, 0], "soft": True}),
        "small-pillow": (pillow, {"variants": ["flat", "pressed"], "steps": True, "grip": [0.46, 0.1, 0], "soft": True, "collisionParts": ["leg"]}),
        "thin-blanket": (blanket, {"variants": ["folded", "draped"], "steps": True, "grip": [0.52, 0.10, 0.26], "soft": True}),
        "clay-cup": (cup, {"carry": "side", "hangs": False, "grip": [0.337, 0.23, 0]}),
        "skete-cup-stand": (cup_stand, {}),
        "clay-tea-cup": (lambda sc: cup(sc, tea=True), {"carry": "side", "carryPose": "front", "grip": [0.337, 0.23, 0], "sipRim": [0, 0.36, 0.247]}),
        "skete-tea-stand": (lambda sc: cup_stand(sc, 1.39), {}),
        "skete-runner": (lambda sc: carpet(sc, 2.95, 8.85, "skete-runner.jpg"), {"soft": True}),
        "skete-rug": (lambda sc: carpet(sc, 3.22, 4.83, "skete-rug.jpg"), {"soft": True}),
        "skete-royal-runner": (lambda sc: carpet(sc, 4.48, 13.63, "skete-royal-runner.jpg"), {"soft": True}),
        "skete-nave-carpet": (nave_carpet, {"soft": True}),
        "skete-stalls": (stalls, {"soft": True}),
        "skete-chandelier": (chandelier, {}),
    }
    names = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else builds
    for name in names:
        prop(name, *builds[name])
