"""Hand-modelled date-palm craft, pottery and animals for the Blender prop library."""
from math import atan2, cos, exp, pi, sin, tau

from mathutils import Matrix, Vector

from kit import core
from kit.critters import blob

STRAW = ('#d5924f', '#e7ab64', '#f3c782', '#b47439')


def colour(hex_code):
    rgb = [int(hex_code[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple((v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in rgb)


def paint(name, hex_code, rough=0.66, metal=0):
    return core.material(name, None, color=colour(hex_code), rough=rough, metal=metal)


def solids(scene, name, mesh, material, parent=None, offset=None, vcol=False):
    position = Matrix.Translation(offset) if offset else None
    return scene.obj(name, mesh, material, position, parent=parent, vcol=vcol)


def strand(mesh, points, radius, closed=False):
    return core.tube(mesh, [Vector(p) for p in points], radius, sides=6, closed=closed)


def ring(mesh, x, y, z, rx, ry, thickness, count=40):
    strand(mesh, [(x + rx * cos(a * tau / count), y + ry * sin(a * tau / count), z)
                  for a in range(count)], thickness, closed=True)


def turned(profile, steps=40):
    mesh = core.new_bm()
    core.lathe(mesh, profile, segs=steps)
    return mesh


def wicker_basket(scene):
    """A shallow, hollow working basket with visible over-and-under strips."""
    reeds = core.material('woven palm', None, vcol=True, rough=0.72)
    bottom = turned([(0.0, 0.025), (0.30, 0.025), (0.40, 0.05), (0.44, 0.10),
                     (0.39, 0.14), (0.0, 0.14)])
    core.set_color(bottom, colour(STRAW[3]))
    weave = core.new_bm()
    height, count = 0.66, 24
    for row in range(10):
        z = 0.11 + row * 0.053
        r = 0.43 + 0.22 * sin(z / height * pi / 2)
        points = []
        for step in range(count * 4):
            a = step * tau / (count * 4)
            radius = r + 0.025 * cos(count * a / 2 + row * pi)
            points.append((radius * cos(a), radius * 0.83 * sin(a), z))
        core.set_color(weave, colour(STRAW[row % 4]), strand(weave, points, 0.033, closed=True))
    for rib in range(count):
        a = rib * tau / count
        points = []
        for row in range(19):
            z = 0.075 + 0.029 * row
            r = 0.43 + 0.22 * sin(z / height * pi / 2) - 0.016 * cos(row * pi / 2 + rib * pi)
            points.append((r * cos(a), 0.83 * r * sin(a), z))
        core.set_color(weave, colour(STRAW[(rib + 1) % 4]), strand(weave, points, 0.024))
    for i in range(2):
        edge = core.new_bm()
        ring(edge, 0, 0, 0.624 + i * 0.043, 0.652, 0.539, 0.039)
        core.set_color(edge, colour(STRAW[i + 1]))
        core.merge(weave, edge)
    solids(scene, 'foot', bottom, reeds, vcol=True)
    solids(scene, 'over and under', weave, reeds, vcol=True)
    scene.empty('grip', 0, 0.64, -0.52, 0)
    return {'hands': 2, 'soft': True, 'notes': 'Shallow hollow palm basket. Rim 0.7 up, 1.38 wide.'}


def palm_strip(mesh, start, end, width, curl):
    """A keeled blade with a drooping tip and raised centre vein."""
    blade = core.new_bm()
    rows = []
    for i in range(13):
        t = i / 12
        p = Vector(start).lerp(Vector(end), t)
        p.z += curl * sin(pi * t)
        w = max(0.004, width * sin(pi * t) ** 0.67)
        rows.append([blade.verts.new((p.x, p.y - w, p.z)),
                     blade.verts.new((p.x, p.y, p.z + 0.037 * sin(pi * t))),
                     blade.verts.new((p.x, p.y + w, p.z))])
    for a, b in zip(rows, rows[1:]):
        for j in range(2):
            blade.faces.new((a[j], b[j], b[j + 1], a[j + 1]))
    return core.merge(mesh, blade)


def date_fronds(scene):
    leaf = core.material('palm leaves', None, vcol=True, rough=0.69)
    blue = paint('lapis cotton cord', '#1859c5')
    twine = paint('flax cord', '#bb763c')
    for variant, ribbon in (('blue', blue), ('plain', twine)):
        root = scene.group(variant)
        blades = core.new_bm()
        veins = core.new_bm()
        for i in range(14):
            row = i % 5 - 2
            layer = i // 5
            start = (-1.18 - 0.19 * sin(i * 1.9), row * 0.073, 0.042 + layer * 0.092)
            end = (1.38 + 0.28 * cos(i * 1.88), row * 0.16 + 0.09 * sin(i * 1.4),
                   0.10 + (i % 4) * 0.060)
            arc = 0.16 + 0.03 * cos(i * 1.54)
            shade = ('#b7bf55', '#80a844', '#608d3a', '#a3b548', '#ceca69')[i % 5]
            core.set_color(blades, colour(shade), palm_strip(blades, start, end, 0.115, arc))
            points = []
            for step in range(13):
                t = step / 12
                p = Vector(start).lerp(Vector(end), t)
                p.z += (arc + 0.038) * sin(pi * t) + 0.003
                points.append(p)
            strand(veins, points, 0.010)
        # Both bindings cinch the leaves and their ribs at the same point, letting the ends fan out.
        for mesh in (blades, veins):
            for vertex in mesh.verts:
                p = vertex.co
                cinch = exp(-((p.x + .075) / .46) ** 2)
                p.y *= 1 - .31 * cinch
                p.z += (.221 - p.z) * .27 * cinch
        solids(scene, variant + '.palm', blades, leaf, root, vcol=True)
        solids(scene, variant + '.veins', veins, paint(variant + ' leaf ribs', '#d1d981'), root)

        knot = core.new_bm()
        # Two turns go round the leaves. The bow faces the camera when the bunch lies on a mat.
        for x in (-0.12, -0.03):
            ring_points = [(x + 0.025 * sin(a * tau / 32), 0.256 * cos(a * tau / 32),
                            0.313 + 0.123 * sin(a * tau / 32)) for a in range(32)]
            strand(knot, ring_points, 0.044, closed=True)
        # A hand-sized loop, rooted in the two bindings.
        strand(knot, [(-.12, .15, .45), (-.38, .04, .62), (-.36, -.02, .80),
                      (-.22, -.02, .83), (.22, -.02, .83), (.36, -.02, .80),
                      (.36, -.08, .65), (-.03, -.18, .45)], .048)
        for side in (-1, 1):
            strand(knot, [(0.002, -0.24, 0.43), (side * 0.19, -0.35, 0.56),
                          (side * 0.34, -0.37, 0.53), (side * 0.32, -0.36, 0.43),
                          (side * 0.18, -0.30, 0.40), (0.002, -0.24, 0.43)], 0.043)
            strand(knot, [(0.002, -0.24, 0.43), (side * 0.13, -0.36, 0.38),
                          (side * 0.26, -0.52, 0.33), (side * 0.40, -0.55, 0.29)],
                   [0.044, 0.044, 0.035, 0.025])
        blob(knot, (0, -0.30, 0.44), (0.10, 0.065, 0.075), (1, 1, 1), subdiv=2)
        solids(scene, variant + '.double bow', knot, ribbon, root)
    scene.empty('grip', 0, .83, .02, 0)
    return {'hands': 2, 'gripSpan': 0.54, 'soft': True, 'variants': ['blue', 'plain'],
            'notes': 'Date-palm leaves laid along X, blue double bow toward +Z. Carry by the cord loop with carry: side. Use opposite quarter-turns for R and L so hands share the handle during a pass.'}


def striped_jar(scene):
    shell = turned([(0, 0.02), (0.42, 0.02), (0.58, 0.10), (0.72, 0.35),
                    (0.81, 0.67), (0.80, 0.91), (0.67, 1.23), (0.50, 1.43),
                    (0.43, 1.57), (0.48, 1.67), (0.47, 1.75), (0.35, 1.75),
                    (0.34, 1.49), (0.58, 0.84), (0.56, 0.45), (0.30, 0.18), (0, 0.18)], 56)
    for side in (-1, 1):
        strand(shell, [(side * 0.51, 0, 1.39), (side * 0.78, 0, 1.42),
                       (side * 0.99, 0, 1.28), (side * 1.02, 0, 1.06),
                       (side * 0.91, 0, 0.87), (side * 0.79, 0, 0.84)], 0.095)
    solids(scene, 'terracotta', shell, paint('baked apricot clay', '#cf6238'))
    glaze = turned([(0.806, 0.62), (0.814, 0.67), (0.815, 0.83), (0.802, 0.88)], 56)
    ring(glaze, 0, 0, 1.708, 0.473, 0.473, 0.033, count=56)
    solids(scene, 'blue glaze', glaze, paint('turquoise glaze', '#287f81', rough=0.38))
    enamel = core.new_bm()
    for i in range(22):
        a = i * tau / 22
        blob(enamel, (0.816 * cos(a), 0.816 * sin(a), 0.756), (0.038, 0.038, 0.043),
             (1, 1, 1), subdiv=1)
    solids(scene, 'glaze dots', enamel, paint('cream glaze', '#ffdc93', rough=0.39))
    scene.empty('grip', 0.96, 1.18, 0, 0)
    return {'hands': 1, 'carry': 'side', 'notes': 'Hollow terracotta jar with two handles and a blue glaze band. Height 1.78.'}


def reed_mat(scene):
    mesh = core.new_bm()
    base = core.box(mesh, (3.48, 1.16, 0.045), (0, 0, 0.023), bevel=0.018)
    core.set_color(mesh, colour('#a87543'), base)
    for i in range(59):
        x = (i - 29) * 0.057
        stripe = i < 4 or i > 54 or 8 <= i <= 10 or 48 <= i <= 50
        shade = '#b65347' if stripe else STRAW[i % 4]
        pts = [(x + 0.005 * sin(j * pi / 3), (j - 10) * 0.063,
                0.042 + 0.006 * cos(j * pi / 3 + i * pi)) for j in range(21)]
        core.set_color(mesh, colour(shade), strand(mesh, pts, 0.023))
    for y in (-0.42, -0.22, 0.22, 0.42):
        pts = [((i - 28) * 0.061, y, 0.055 + 0.010 * (i % 2)) for i in range(57)]
        core.set_color(mesh, colour('#e8bb71'), strand(mesh, pts, 0.016))
    straw = core.material('woven and dyed reeds', None, vcol=True, rough=0.73)
    solids(scene, 'fringed weaving', mesh, straw, vcol=True)
    scene.empty('grip', 0, 0.07, 0, 0)
    return {'soft': True, 'notes': 'Fringed, red-striped reed mat, 3.5 wide and 0.07 thick.'}


def purse(scene):
    mesh = turned([(0, 0.02), (0.17, 0.02), (0.30, 0.08), (0.35, 0.22), (0.31, 0.34),
                   (0.23, 0.44), (0.13, 0.50), (0.11, 0.54), (0.17, 0.60), (0.11, 0.65), (0, 0.59)])
    for v in mesh.verts:
        angle = atan2(v.co.y, v.co.x)
        ripple = 1 + (0.025 if v.co.z < 0.43 else 0.12) * sin(9 * angle)
        v.co.x *= ripple
        v.co.y *= ripple * 0.80
    solids(scene, 'closed cloth', mesh, paint('saffron linen', '#c98432'))
    cord = core.new_bm()
    for h in (0.506, 0.542):
        ring(cord, 0, 0, h, 0.124, 0.107, 0.027, count=24)
    for side in (-1, 1):
        strand(cord, [(0.02, -0.12, 0.52), (0.11 * side, -0.17, 0.46),
                      (0.11 * side, -0.22, 0.35), (0.18 * side, -0.22, 0.29)], 0.023)
    blob(cord, (0.02, -0.124, 0.52), (0.064, 0.043, 0.045), (1, 1, 1), subdiv=2)
    solids(scene, 'drawstring', cord, paint('dyed cord', '#a64b37'))
    scene.empty('grip', 0, 0.54, 0, 0)
    return {'hands': 1, 'carry': 'side', 'hangs': True, 'notes': 'A cinched purse with no visible contents. Grip at the drawstring.'}


def coin(scene):
    rim = turned([(0, 0.002), (0.184, 0.002), (0.209, 0.018), (0.209, 0.067),
                  (0.187, 0.082), (0, 0.082)], 36)
    stamp = core.new_bm()
    ring(stamp, 0, 0, 0.084, 0.169, 0.169, 0.010, count=36)
    blob(stamp, (0, 0, 0.084), (0.057, 0.057, 0.019), (1, 1, 1), subdiv=2)
    for i in range(8):
        a = i * tau / 8
        strand(stamp, [(cos(a) * r, sin(a) * r, 0.085) for r in (0.082, 0.127)], 0.010)
    solids(scene, 'struck brass', rim, paint('golden copper', '#d38a22', rough=0.38, metal=0.35))
    solids(scene, 'raised little sun', stamp, paint('polished embossing', '#ffcf58', rough=0.39, metal=0.22))
    scene.empty('grip', 0, 0.044, 0, 0)
    return {'hands': 1, 'carry': 'side', 'hangs': True, 'soft': True,
            'notes': 'A tiny sun embossed on a single coin. On a table, use y = the surface height.'}


def cashbox(scene):
    wood = paint('warm walnut', '#914b2b')
    dark = paint('inner walnut', '#60351f')
    brass = paint('brass fittings', '#d6a14a', rough=0.42, metal=0.32)
    case = core.new_bm()
    core.box(case, (1.19, 0.80, 0.12), (0, 0, 0.067), bevel=0.062)
    for x in (-0.55, 0.55):
        core.box(case, (0.12, 0.76, 0.32), (x, 0, 0.213), bevel=0.034)
    for y in (-0.356, 0.356):
        core.box(case, (1.13, 0.12, 0.32), (0, y, 0.213), bevel=0.034)
    solids(scene, 'rounded wooden case', case, wood)
    tray = core.new_bm()
    core.box(tray, (0.96, 0.62, 0.065), (0, 0, 0.141), bevel=0.028)
    solids(scene, 'shallow tray', tray, dark)
    lid = scene.group('back hinge', Matrix.Translation((0, 0.383, 0.388)), props={'bendX': -112})
    cover = core.new_bm()
    core.box(cover, (1.24, 0.84, 0.117), (0, -0.386, 0.036), bevel=0.058)
    solids(scene, 'wooden lid', cover, wood, lid)
    fasten = core.new_bm()
    for x in (-0.45, 0.45):
        core.box(fasten, (0.12, 0.70, 0.031), (x, -0.38, 0.105), bevel=0.015)
    core.box(fasten, (0.16, 0.044, 0.127), (0, -0.83, 0.004), bevel=0.020)
    solids(scene, 'lid straps and clasp', fasten, brass, lid)
    scene.empty('grip', 0, 0.39, 0, 0)
    return {'hands': 2, 'soft': True, 'notes': 'Wooden box with a brass clasp. Bend 0 shuts it, bend 1 opens the lid.'}


def tool_roll(scene):
    linen = paint('heather linen', '#ae5140')
    trim = paint('woven edge', '#e5a075')
    tool = paint('rounded beech', '#b87335')
    mat = core.new_bm()
    core.box(mat, (1.49, 0.53, 0.082), (0, 0, 0.042), bevel=0.032)
    solids(scene, 'cloth base', mat, linen)
    core_tool = core.new_bm()
    strand(core_tool, [(-0.61, 0, 0.135), (-0.43, 0, 0.16), (-0.21, 0, 0.16),
                       (0.22, 0, 0.129), (0.56, 0, 0.122)], [0.03, 0.093, 0.088, 0.055, 0.014])
    solids(scene, 'wooden weaving peg', core_tool, tool)
    for side in (-1, 1):
        z = 0.180 if side == -1 else 0.157
        pivot = scene.group('cloth edge ' + str(side), Matrix.Translation((0, side * 0.237, z)),
                            props={'bendX': side * 175})
        flap = core.new_bm()
        core.box(flap, (1.47, 0.35, 0.068), (0, side * 0.159, -0.035), bevel=0.031)
        solids(scene, 'fold', flap, linen, pivot)
        edging = core.new_bm()
        for x in (-0.63, 0.63):
            strand(edging, [(x, side * j, -0.072) for j in (0.065, 0.25, 0.33)], 0.014)
        solids(scene, 'embroidered stripes', edging, trim, pivot)
    scene.empty('grip', 0, 0.13, 0, 0)
    return {'hands': 2, 'soft': True, 'notes': 'Cloth and weaving peg. Bend 0 = open, bend 1 = cloth folded over the peg.'}


def hoopoe(scene):
    cinnamon = paint('hoopoe cinnamon', '#d4894c')
    buff = paint('hoopoe cream', '#f6d9a1')
    ink = paint('warm black feathers', '#2b2032')
    eye = paint('black glass eye', '#1c1724', rough=0.28)
    feet = paint('dark claws', '#684731')

    body = core.new_bm()
    blob(body, (0, 0.037, 0.257), (0.205, 0.268, 0.224), (1, 1, 1), subdiv=2)
    solids(scene, 'cinnamon body', body, cinnamon)
    bib = core.new_bm()
    blob(bib, (0, -0.131, 0.231), (0.162, 0.12, 0.153), (1, 1, 1), subdiv=2)
    solids(scene, 'cream chest', bib, buff)

    wings = scene.group('wings')
    stripes = core.new_bm()
    cover = core.new_bm()
    for side in (-1, 1):
        for i in range(4):
            x = side * (0.156 + 0.019 * i)
            y = 0.235 - 0.059 * i
            z = 0.241 + i * 0.029
            blob(cover, (x, y, z), (0.076, 0.125, 0.067), (1, 1, 1), subdiv=2)
            blob(stripes, (x + side * 0.028, y + 0.008, z - 0.024),
                 (0.066, 0.027, 0.060), (1, 1, 1), subdiv=2)
        blob(cover, (side * 0.056, 0.323, 0.200), (0.078, 0.245, 0.051), (1, 1, 1), subdiv=2)
    solids(scene, 'flight feathers', cover, ink, wings)
    solids(scene, 'striped flight feathers', stripes, buff, wings)

    head = scene.group('bobbing hoopoe head', Matrix.Translation((0, -0.102, 0.392)), props={'anim': 'peck'})
    face = core.new_bm()
    blob(face, (0, -0.017, 0.09), (0.162, 0.186, 0.167), (1, 1, 1), subdiv=2)
    crest = core.new_bm()
    tips = core.new_bm()
    for i in range(8):
        a = -0.45 + i * 0.19
        base = Vector((0.067 * sin(i * 0.6), 0.029, 0.194))
        tip = base + Vector((0.005 * i, sin(a) * 0.32, cos(a) * (0.235 + 0.016 * i)))
        strand(crest, [base, base.lerp(tip, 0.58), tip], [0.034, 0.049, 0.028])
        blob(tips, tip, (0.031, 0.033, 0.034), (1, 1, 1), subdiv=2)
    bill = core.new_bm()
    strand(bill, [(0, -0.171, 0.080), (0, -0.269, 0.035),
                  (0, -0.375, -0.020), (0, -0.44, -0.074)], [0.041, 0.032, 0.021, 0.004])
    gaze = core.new_bm()
    glints = core.new_bm()
    for side in (-1, 1):
        blob(gaze, (side * 0.141, -0.093, 0.102), (0.048, 0.054, 0.057), (1, 1, 1), subdiv=2)
        blob(glints, (side * 0.179, -0.116, 0.126), (0.016, 0.018, 0.018), (1, 1, 1), subdiv=1)
    solids(scene, 'cheeks', face, cinnamon, head)
    solids(scene, 'crest', crest, cinnamon, head)
    core.merge(bill, tips)
    solids(scene, 'dark bill and crest tips', bill, ink, head)
    solids(scene, 'glass eyes', gaze, eye, head)
    solids(scene, 'catchlights', glints, buff, head)
    claws = core.new_bm()
    for x in (-0.082, 0.082):
        strand(claws, [(x, 0.022, 0.114), (x, 0, 0.025), (x, -0.086, 0.024)], 0.025)
        for dx in (-0.038, 0.038):
            strand(claws, [(x, -0.01, 0.026), (x + dx, -0.102, 0.014)], 0.012)
    solids(scene, 'perching feet', claws, feet)
    return {'soft': True, 'notes': 'Cinnamon hoopoe with black-tipped crest, striped wings and a pecking head.'}


def hare(scene):
    fur = core.material('sandy agouti coat', None, vcol=True, rough=.89)
    cream = paint('ivory fur', '#ffe3b9', rough=.9)
    dark = paint('umber markings', '#4f372e')
    rose = paint('soft rose nose', '#b9796a')
    iris = paint('amber irises', '#9a5b29', rough=.42)
    pupil = paint('dark brown pupils', '#231d1c', rough=.23)
    whisker = paint('whiskers', '#836849')

    # Colour each vertex from its place on the pelt. The cream underside shades
    # into ochre flanks and short, dark-tipped guard hairs along the spine.
    belly, flank, back = (Vector(colour(c)) for c in ('#f3d3a1', '#c59562', '#8c684d'))

    def pelt(mesh, centre, radii):
        faces = blob(mesh, centre, radii, (1, 1, 1), subdiv=4)
        layer = mesh.loops.layers.color[core.COL]
        for face in faces:
            for loop in face.loops:
                x, y, z = loop.vert.co
                height = (z - centre[2]) / radii[2]
                dorsal = min(1, max(0, height + .10))
                shade = belly.lerp(flank, min(1, max(0, height + .95))).lerp(back, dorsal * .86)
                grain = sin(94 * x + 16 * y + 2 * sin(39 * y)) * sin(65 * y - 17 * z)
                loop[layer] = (*(shade * (1 + .22 * dorsal * grain)), 1)

    body = core.new_bm()
    pelt(body, (0, .105, .355), (.29, .436, .294))
    for side in (-1, 1):
        pelt(body, (side * .17, .235, .303), (.188, .278, .252))
    solids(scene, 'arched back and haunches', body, fur, vcol=True)
    bib = core.new_bm()
    blob(bib, (0, -.135, .315), (.207, .216, .232), (1, 1, 1), subdiv=3)
    tail = core.new_bm()
    blob(tail, (0, .527, .345), (.119, .144, .128), (1, 1, 1), subdiv=3)
    for x, y, z in [(-.068,.55,.39), (.059,.56,.39), (0,.61,.42)]:
        blob(tail, (x,y,z), (.056,.067,.068), (1,1,1), subdiv=2)
    solids(scene, 'pale breast', bib, cream)
    solids(scene, 'cotton tail', tail, cream)

    neck = Vector((0, -.13, .40))
    head = scene.group('listening head', Matrix.Translation(neck),
                       props={'anim': 'sway', 'freq': .78, 'amp': .12})
    skull = core.new_bm()
    pelt(skull, (0, -.229, .568), (.25, .265, .258))
    solids(scene, 'brow and cheeks', skull, fur, head, -neck, vcol=True)
    cheeks, rims, irises, eyes, glints, muzzle_lines, whiskers = [core.new_bm() for _ in range(7)]
    nose = core.new_bm()
    blob(nose, (0, -.539, .481), (.052, .034, .036), (1,1,1), subdiv=3)
    strand(muzzle_lines, [(0,-.555,.459),(0,-.538,.433),(0,-.532,.416)], [.009,.008,.006])

    for side in (-1, 1):
        blob(cheeks, (side*.076,-.437,.443), (.121,.108,.094), (1,1,1), subdiv=3)
        strand(muzzle_lines, [(0,-.534,.419),(side*.027,-.531,.409),(side*.053,-.528,.416)],
               [.007,.008,.004])
        for i in range(3):
            x, y, z = side*(.092+i*.029), -.529+i*.012, .461-(i%2)*.022
            blob(muzzle_lines, (x,y,z), (.012,.009,.011), (1,1,1), subdiv=2)
            strand(whiskers, [(x,y,z),(side*.221,y-.013,z+.006),
                              (side*(.353+i*.026),y+.022*(i-1),z+.044*(i-1))],
                   [.007,.006,.0025])

        # Eyes look slightly forward. Use the same outward axis for rim, iris,
        # pupil and catchlight so both eyes remain legible in three-quarter view.
        centre = Vector((side*.194, -.356, .626))
        normal = Vector((side*.83, -.55, .07)).normalized()
        tilt = Matrix.Rotation(-side*.58, 4, 'Z')
        for mesh, distance, radii in [(rims,0,(.032,.103,.093)), (irises,.022,(.03,.080,.076)),
                                      (eyes,.043,(.022,.049,.060))]:
            blob(mesh, centre+normal*distance, radii, (1,1,1), subdiv=3, rot=tilt)
        blob(glints, centre+normal*.060+Vector((0,-.013,.023)), (.011,.015,.016), (1,1,1), subdiv=2)

        ear = scene.group('long ear ' + str(side),
                          Matrix.Translation(Vector((side*.119, -.18, .733))-neck),
                          props={'anim':'ear','side':side})
        ear.parent = head
        # Sweep nested coloured rings as one tapered, cupped ear. The dark tip
        # and thin golden rim frame the pink inner surface.
        shell = core.new_bm()
        rings = []
        for z, width, depth in [(0,.065,.044),(.10,.089,.049),(.29,.102,.052),
                                (.47,.092,.047),(.59,.073,.038),(.68,.042,.026),(.714,.009,.010)]:
            u = z/.714
            cx, cy = side*(.10*u+.033*u*u), .065*u*u
            rings.append([shell.verts.new((cx+width*cos(a*tau/24),
                                           cy+depth*sin(a*tau/24),z)) for a in range(24)])
        for i, (low, high) in enumerate(zip(rings, rings[1:])):
            for j in range(24):
                following = (j + 1) % 24
                face = shell.faces.new((low[j], low[following], high[following], high[j]))
                inner = sin((j + .5) * tau / 24)
                shade = '#c19872'
                if i >= 5:
                    shade = '#5b473c'
                elif i >= 1 and inner < -.86:
                    shade = '#aa7764'
                elif i >= 1 and inner < -.48:
                    shade = '#e9b3a2'
                core.set_color(shell, colour(shade), [face])
        cap = shell.faces.new(rings[-1])
        core.set_color(shell, colour('#5b473c'), [cap])
        solids(scene, 'tipped ear', shell, fur, ear, vcol=True)

    for label, mesh, material in [('split muzzle',cheeks,cream),('eye rings',rims,cream),('irises',irises,iris),
                                 ('pupils',eyes,pupil),('catchlights',glints,cream),('nose',nose,rose),
                                 ('mouth and freckles',muzzle_lines,dark),('whiskers',whiskers,whisker)]:
        solids(scene, label, mesh, material, head, -neck)

    for hind, y in [(False,-.159),(True,.252)]:
        for side in (-1,1):
            ankle = scene.group('paw joint', Matrix.Translation((side*.202,y,.192)),
                                props={'anim':'bound','hind':hind})
            paw = core.new_bm()
            length = .202 if hind else .128
            pelt(paw, (0,.006,-.060), (.079,.086,.119))
            pelt(paw, (0,-length*.44,-.131), (.092,length,.059))
            solids(scene, 'hind foot' if hind else 'forepaw', paw, fur, ankle, vcol=True)
            toes = core.new_bm()
            for dx in (-.039,0,.039):
                blob(toes, (dx,-length*1.21,-.137), (.033,.046,.032), (1,1,1), subdiv=2)
            solids(scene, 'pale toes', toes, cream, ankle)
    return {'walker': True, 'hopLength': .78, 'soft': True,
            'notes': 'Desert hare with a shaded agouti coat, tipped ears, whiskers and articulated paws. Walk routes play in complete bounds.'}


PROPS = {
    'palm-weave-basket': wicker_basket,
    'date-frond-bundle': date_fronds,
    'striped-clay-jar': striped_jar,
    'woven-reed-mat': reed_mat,
    'drawstring-purse': purse,
    'stamped-coin': coin,
    'wooden-cashbox': cashbox,
    'weaving-tool-roll': tool_roll,
    'hoopoe': hoopoe,
    'desert-hare': hare,
}


def build(name, export):
    core.reset()
    scene = core.Scene(name)
    info = PROPS[name](scene)
    export(scene, name, info)
