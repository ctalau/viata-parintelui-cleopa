"""The three 053 portraits, authored at the scale of the Blender monk rig."""

import sys
from math import cos, hypot, pi, sin, tau
from pathlib import Path
from random import Random

from mathutils import Vector

SOURCE = Path(__file__).resolve().parents[2] / "videos/053-nodul-albastru/preproductie"
sys.path.insert(0, str(SOURCE))
from atelier import color, gridfaces, group, interp, lines, mat, mesh, mix, ramp, rng, surface, vmat
import coafura
import familie
import figura as face

FIGURES = {
    "avva-or": ("Părintele Or", "734528"),
    "calugar-barba-ascutita": ("Călugărul cu barbă ascuțită", "4B4A41"),
    "frate-tanar-053": ("Fratele tânăr", "48565E"),
}


def reshape(obj, transform):
    if obj.type == "MESH":
        keys = obj.data.shape_keys
        if keys:
            for key in keys.key_blocks:
                for point in key.data:
                    point.co = transform(point.co)
        else:
            for vertex in obj.data.vertices:
                vertex.co = transform(vertex.co)
    elif obj.type == "CURVE":
        for spline in obj.data.splines:
            for point in spline.bezier_points:
                point.co = transform(point.co)
                point.handle_left = transform(point.handle_left)
                point.handle_right = transform(point.handle_right)


def point_beard(co):
    # Keep the cheek roots and draw the lower locks into one long tip.
    t = min(1.06, max(0, (2.28 - co.z) / .59))
    return Vector((co.x * (1 - .79 * t**1.15),
                   co.y - .31 * t**1.8,
                   co.z - .49 * t**1.45))


def slim_brow(co):
    return Vector((co.x, co.y, 2.638 + (co.z - 2.638) * .75))


def soften_eye(co):
    return Vector((co.x, co.y, 2.52 + (co.z - 2.532) * .83))


def short_beard(co):
    t = min(1.06, max(0, (2.28 - co.z) / .59))
    return Vector((co.x * (1 - .27 * t**1.4),
                   co.y + .018 * t**1.3,
                   co.z + .255 * t**1.19))


def portrait_beard(angle, depth, deform):
    point = coafura.co(angle, depth)
    if deform:
        point = deform(point)
    sx, sy, sz = familie.BEARD_SCALE
    z = familie.BEARD_ORIGIN + point.z * sz
    rx, ry, cy = coafura.skull_radius(z)
    x, y = point.x * sx, point.y * sy - cy
    # The first row is rooted in the cheeks. The shell and all its locks
    # share the same clearance as they grow over the rounded jaw.
    side = ramp(abs(angle), .58, 1.48)
    clearance = -.001 + (.018 + .022 * side) * ramp(depth, .012, .145)
    radius = hypot(x, y)
    gap = radius / hypot(x / rx, y / ry) + clearance - radius
    blend = .018 * ramp(depth, .018, .15)
    lift = max(0, gap) + .25 * blend * (1 - ramp(abs(gap), 0, .018))**2
    lift *= ramp(z, familie.SKULL_BASE - .045, familie.SKULL_BASE)
    point.x += lift * x / (radius * sx)
    point.y += lift * y / (radius * sy)
    return point


def round_eye(co):
    center = -.17 if co.x < 0 else .182
    x = center * 1.04 + (co.x - center) * 1.13
    z = 2.532 + (co.z - 2.532) * .95
    y = co.y + face.projection(x, z) - face.projection(co.x, co.z)
    return Vector((x, y, z))


def black_eye_print(obj, materials):
    source = obj.data.materials[0]
    if source not in materials:
        ink = source.copy()
        ink.name = "Ochii fratelui · negru"
        ink.diffuse_color = color("171719")
        materials[source] = ink
    obj.data.materials[0] = materials[source]
    black, edge = color("121214"), color("28282B")
    for point in obj.data.color_attributes["Pigment"].data:
        point.color = mix(black, edge, min(1, point.color[0] / .34))


def beard_fibers(parent):
    random = Random(953)
    fibers = [[], [], []]
    for obj in tuple(parent.children):
        if not obj.name.startswith(("Barbă · striații conice", "Barbă · fire care traversează")):
            continue
        obj.data.bevel_depth *= 1.28
        for spline in obj.data.splines:
            if random.random() > .58:
                continue
            points = [point.co.copy() for point in spline.bezier_points]
            lift = random.uniform(.004, .010)
            spread = random.uniform(-.009, .009)
            phase = random.uniform(0, tau)
            thickness = random.uniform(.62, 1.24)
            path = []
            for index, point in enumerate(points):
                t = index / (len(points) - 1)
                taper = max(.04, sin(pi * t))**.62
                outward = Vector((point.x, point.y, 0)).normalized()
                tangent = points[min(index + 1, len(points) - 1)] - points[max(0, index - 1)]
                across = tangent.cross(outward).normalized()
                offset = spread + .0025 * sin(phase + tau * t)
                position = point + outward * (.001 + lift * taper) + across * offset * taper
                path.append((*position, taper * thickness))

            tip = points[-1]
            if (abs(tip.x) > .365 or tip.z < 2.055) and random.random() < .22:
                direction = (tip - points[-2]).normalized()
                path[-1] = (*path[-1][:3], .32 * thickness)
                path.append((*(tip + direction * random.uniform(.009, .023)), .025))
            shade = random.choices(range(3), weights=(4, 5, 2))[0]
            fibers[shade].append(path)

    for hexcode, paths in zip(("4F3020", "6B4732", "80583D"), fibers):
        material = mat("Fir individual · castaniu", hexcode, .78)
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        bsdf.inputs["Specular IOR Level"].default_value = .18
        lines("Barbă · fire individuale", paths, material, .0020, parent, res=3)


def nape_hair(parent, raised_ends):
    # A single underlayer covers the back of the head, crossing under both temples.
    profile = (
        (0, 2.852, .412, .414, 1.58),
        (.14, 2.735, .424, .433, 1.60),
        (.32, 2.571, .454, .467, 1.65),
        (.53, 2.379, .475, .484, 1.62),
        (.72, 2.208, .479, .495, 1.57),
        (.88, 2.058, .456, .497, 1.50),
        (1, 1.929, .418, .470, 1.43),
    )
    tones = [color(c) for c in ("A5A194", "BBB5A8", "CEC9BC", "DCD8CD", "E5DFD1")]
    silver = familie.dry_material(vmat("Păr la ceafă · argint mat", "CFC9BD", .94, .00045), .94, .11)

    def on_hair(u, t, ridge=0):
        z, rx, ry, arc = interp(profile, t)
        ends = ramp(t, .54, 1)
        z += (raised_ends + .133 * abs(u)**1.8 + .024 * sin(15 * u + .7)
              + .013 * cos(24 * u - .4)) * ends - .44 * max(0, t - 1)
        angle = arc * u + .049 * sin(5.7 * t + 3.2 * u) * ramp(t, .02, .78)
        wave = .56 * cos(31 * u + .9 * sin(7 * t + 2 * u)) + .44 * sin(47 * u - 2.1 * t)
        relief = (.008 + .010 * ends) * wave * ramp(t, .075, .30)
        relief -= .018 * ramp(abs(u), .74, 1) * (1 - ramp(t, .46, .72))
        return ((rx + relief + ridge) * sin(angle), (ry + relief + ridge) * cos(angle) + .005, z)

    layer = surface("Păr la ceafă · acoperire continuă", lambda u, t: on_hair(2 * u - 1, t),
                    96, 38, silver, parent,
                    lambda u, t: mix(tones[0], tones[2], .38 + .22 * cos(62 * u + sin(7 * t))))
    solid = layer.modifiers.new("Grosimea șuvițelor", "SOLIDIFY")
    solid.thickness = .024
    solid.offset = -1

    random = Random(2384)
    vertices, faces, pigments = [], [], []
    fibers = [[], [], []]
    for index in range(26):
        center = -1 + 2 * (index + .5 + random.uniform(-.20, .20)) / 26
        root = random.uniform(.08, .31)
        tip = random.uniform(.88, 1.088)
        width = random.uniform(.042, .083)
        height = random.uniform(.011, .029)
        wave = random.uniform(-.076, .076)
        lean = random.uniform(-.083, .083) - .018 * center
        tint = tones[random.choices((1, 2, 3, 4), weights=(2, 5, 5, 2))[0]]

        def lock(t, side, fine=0):
            along = root + (tip - root) * t
            sweep = sin(pi * t)
            u = center + lean * t + wave * sweep * sin(6.2 * t + center)
            u += side * width * (.62 * (1 - t) + .67 * sweep**.8 + .028)
            roll = max(.03, 1 - side * side)**.75
            crest = height * roll * (.20 * (1 - t) + .92 * sweep**.86)
            return on_hair(u, along, .0018 + crest + fine)

        offset = len(vertices)
        columns, rows = 8, 22
        for row in range(rows + 1):
            t = row / rows
            for column in range(columns + 1):
                side = 2 * column / columns - 1
                vertices.append(lock(t, side))
                pigments.append(mix(tint, tones[0], .44 * abs(side)**1.5))
        faces.extend(tuple(offset + i for i in quad) for quad in gridfaces(columns, rows))
        for stripe in range(8):
            side = random.uniform(-.82, .82)
            start, end = random.uniform(.019, .26), random.uniform(.73, .998)
            drift = random.uniform(-.12, .12)
            path = []
            for point in range(12):
                t = point / 11
                along = start + (end - start) * t
                pos = lock(along, side + drift * sin(pi * t), .002)
                path.append((*pos, max(.024, sin(pi * t))**.62))
            fibers[(index + stripe) % 3].append(path)

    mesh("Păr la ceafă · șuvițe lungi", vertices, faces, silver, parent, pigments)
    for shade, paths, radius in zip(("C6C0B2", "E4DFD2", "A9A396"), fibers, (.0017, .00145, .00155)):
        material = mat("Păr la ceafă · fir mat", shade, .94)
        lines("Păr la ceafă · fire lungi", paths, material, radius, parent)


def kamilavka(parent):
    # A stiff felt crown widens from its fitted base to a broad, flat top.
    profile = (
        (2.798, .420, .428), (2.807, .431, .439), (2.822, .434, .442),
        (3.365, .575, .583), (3.390, .581, .589),
        (3.402, .579, .587), (3.410, .570, .578),
    )
    segments = 96
    corners = [
        (rx * sin(i * tau / segments), -ry * cos(i * tau / segments), z)
        for z, rx, ry in profile for i in range(segments)
    ]
    faces = gridfaces(segments, len(profile) - 1, closed=True)
    faces.extend((tuple(reversed(range(segments))),
                  tuple(range(len(corners) - segments, len(corners)))))
    felt = familie.dry_material(mat("Kamilavkă · fetru negru", "242125", .94,
                                    158, .00045, "302C31"), .96, .11)
    hat = mesh("Kamilavkă evazată", corners, faces, felt, parent)
    hat.data.polygons[-2].use_smooth = hat.data.polygons[-1].use_smooth = False
    hat["portraitHat"] = "kamilavka"
    hat["part"] = "hat_kamilavka_053"


def kamilavka_veil(parent):
    # Rear half of the crown to the shoulder blades, with room for the nape to turn.
    profile = (
        (0, 3.376, .584, .592, 1.30, 0),
        (.10, 3.205, .563, .587, 1.32, .025),
        (.26, 2.915, .535, .559, 1.35, .050),
        (.46, 2.570, .587, .526, 1.39, .100),
        (.64, 2.255, .743, .491, 1.43, .142),
        (.82, 1.937, .804, .470, 1.41, .162),
        (1, 1.605, .771, .455, 1.38, .157),
    )
    columns, rows = 64, 46
    outer, inner, head_weights = [], [], []
    for row in range(rows + 1):
        t = row / rows
        z, rx, ry, arc, y = interp(profile, t)
        follow_head = 1 - ramp(t, .26, .72)
        for column in range(columns + 1):
            u = 2 * column / columns - 1
            angle = arc * u
            pleat = (.009 + .035 * t) * ramp(t, 0, .24) * (
                .72 * cos(15 * u + .75 * sin(3 * t + u)) + .28 * sin(26 * u + 4 * t)
            )
            hem = ramp(t, .69, 1) * (.15 * abs(u)**1.6 + .016 * cos(16 * u) + .014 * u)
            point = Vector(((rx + pleat) * sin(angle), y + (ry + pleat) * cos(angle), z + hem))
            outer.append(point)
            inner.append(point - Vector((.010 * sin(angle), .010 * cos(angle), 0)))
            head_weights.append(follow_head)

    faces = gridfaces(columns, rows)
    count = len(outer)
    faces += [tuple(count + i for i in reversed(face)) for face in faces]
    stride = columns + 1
    perimeter = (list(range(stride))
                 + [row * stride + columns for row in range(1, rows + 1)]
                 + [rows * stride + col for col in range(columns - 1, -1, -1)]
                 + [row * stride for row in range(rows - 1, 0, -1)])
    faces += [(a, a + count, b + count, b) for a, b in zip(perimeter, perimeter[1:] + perimeter[:1])]
    wool = familie.dry_material(mat("Văl · lână neagră", "28262B", .94, 176, .0012, "39353C"), .96, .12)
    veil = mesh("Vălul kamilavkăi", outer + inner, faces, wool, parent)
    weights = veil.data.attributes.new("_VEIL_HEAD", "FLOAT", "POINT")
    weights.data.foreach_set("value", head_weights * 2)
    veil["portraitVeil"] = "kamilavka"
    veil["part"] = "hat_kamilavka_veil"


def knitted_cap(parent):
    # The profile is measured along the surface so rows stay evenly spaced at the crown.
    outline = [
        (2.762, .419, .426), (2.773, .435, .443), (2.802, .441, .449),
        (2.854, .438, .445), (2.902, .435, .442), (2.953, .414, .423),
        (3.000, .367, .381), (3.045, .310, .326), (3.080, .244, .261),
        (3.109, .161, .179), (3.127, .078, .089), (3.134, .001, .001),
    ]
    profile = [(0, *outline[0])]
    for (z0, x0, y0), (z, x, y) in zip(outline, outline[1:]):
        distance = profile[-1][0] + hypot(z - z0, (x + y - x0 - y0) / 2)
        profile.append((distance, z, x, y))
    length = profile[-1][0]

    def on_cap(angle, distance, relief=0):
        z, rx, ry = interp(profile, distance)
        low_z, low_x, _ = interp(profile, distance - .003)
        high_z, high_x, _ = interp(profile, distance + .003)
        dz, dx = high_z - low_z, high_x - low_x
        scale = relief / max(.00001, hypot(dz, dx))
        return ((rx + scale * dz) * sin(angle),
                -(ry + scale * dz) * cos(angle),
                z - scale * dx)

    wool = mat("Căciulă · lână cărbunie", "292929", .96, 196, .0013, "363431")
    surface("Căciulă monahală · calotă tricotată",
            lambda u, v: on_cap(u * tau, v * length),
            140, 70, wool, parent, closed=True)

    yarn_colors = ("343230", "3A3734", "302F2E")
    yarn = [mat(f"Fir de lână {i + 1}", hexcode, .98, 220, .0005)
            for i, hexcode in enumerate(yarn_colors)]

    # A narrow ribbed brim carries the fuller knit stitches above it.
    ribs = []
    for column in range(70):
        a = column * tau / 70
        ribs.append([
            (*on_cap(a, distance, relief), radius)
            for distance, relief, radius in (
                (.009, .001, .16), (.025, .006, .96), (.047, .006, 1),
                (.071, .006, .9), (.101, .002, .12)
            )
        ])
    lines("Elasticul tricotat al căciulii", ribs, yarn[0], .006, parent, res=3)

    stitch_paths = [[] for _ in yarn]
    row_step = .024
    for row in range(int((length - .108) / row_step)):
        distance = .112 + row * row_step
        _, rx, ry = interp(profile, distance)
        count = max(6, round(tau * (rx + ry) / .076))
        step = tau / count
        for column in range(count):
            center = (column + .1 * (row % 2)) * step
            points = [
                (*on_cap(center + dx * step, distance + dy * row_step, lift), radius)
                for dx, dy, lift, radius in (
                    (-.34, .71, .002, .53), (-.29, .24, .005, .93),
                    (-.15, -.21, .006, 1), (0, -.35, .006, .9),
                    (.15, -.21, .006, 1), (.29, .24, .005, .93),
                    (.34, .71, .002, .53)
                )
            ]
            stitch_paths[(column + 2 * row) % len(yarn)].append(points)
    for material, paths in zip(yarn, stitch_paths):
        lines("Ochiuri de lână în jerseu", paths, material, .0048, parent, res=3)


def dye_hair(obj, tint, amount, multiply, materials):
    def dye(base):
        target = tuple(c * channel for c, channel in zip(base, tint)) if multiply else tint
        return mix(base, target, amount)

    source = obj.data.materials[0]
    key = (source, tint)
    if key not in materials:
        material = source.copy()
        material.diffuse_color = dye(source.diffuse_color)
        bsdf = material.node_tree.nodes.get("Principled BSDF")
        base = bsdf.inputs["Base Color"]
        if not base.is_linked:
            base.default_value = dye(base.default_value)
        if multiply:
            bsdf.inputs["Roughness"].default_value = .81
            bsdf.inputs["Specular IOR Level"].default_value = .18
        materials[key] = material
    obj.data.materials[0] = materials[key]
    pigments = obj.data.color_attributes.get("Pigment") if obj.type == "MESH" else None
    if pigments:
        for point in pigments.data:
            point.color = dye(point.color)


def build_portrait(preset):
    """Build a complete editable head with mouth, brow and eyelid shape keys."""
    label, _ = FIGURES[preset]
    young = preset == "frate-tanar-053"
    pointed = preset == "calugar-barba-ascutita"
    rng.seed(74)
    face.keys.clear()
    face.beards.clear()
    head = group(label)
    head["portraitVariant"] = preset
    face.make_skin(head)
    face.make_eyes(head)
    face.make_mouth(head)
    deform = short_beard if young else point_beard if pointed else None

    def beard_profile(angle, depth):
        return portrait_beard(angle, depth, deform)

    coafura.beard(head, beard_profile)
    coafura.moustache(head)
    if not (young or pointed):
        face.make_cap(head)
    for obj in face.beards:
        obj["role"] = "barba_mustata"
    familie.calibrate_portrait(head)
    coafura.sideburns(head, beard_profile)
    nape_hair(head, .11 if young else .055 if pointed else 0)

    materials = {}
    beard = next(obj for obj in head.children if obj.name.startswith("Sculptura bărbii"))
    beard["portraitBeard"] = True
    ash, chestnut, roots, tips = [color(hexcode) for hexcode in ("70655A", "6D452E", "4B301F", "7B5036")]
    for obj in head.children_recursive:
        for slot in obj.material_slots:
            if slot.material:
                roughness = .89 if "ochi" in slot.material.name.lower() else .94
                familie.dry_material(slot.material, roughness, .11)
        if not (pointed or young):
            continue
        in_beard = obj.parent == beard
        hair = in_beard or obj.name.startswith(("Mustață", "Tâmplă", "Perciun", "Păr la ceafă"))
        if obj.name.startswith("Sprânceană"):
            reshape(obj, slim_brow)
            dye_hair(obj, chestnut if young else ash, .975 if young else .48, False, materials)
        elif obj.name.startswith(("Ochi de serie", "Lumină imprimată pe iris")):
            reshape(obj, round_eye if young else soften_eye)
            if young and obj.name.startswith("Ochi de serie"):
                black_eye_print(obj, materials)
        if hair:
            tint = tips if obj.type == "CURVE" else chestnut
            if obj.name.startswith("Barbă · piesă"):
                tint = roots
            dye_hair(obj, tint if young else ash, 1 if young else .48, young, materials)

    nose = next(obj for obj in head.children if obj.name.startswith("Năsucul avvei"))
    if young:
        head.scale.x = .95
        nose.scale *= .91
        for obj in head.children_recursive:
            if obj.name.startswith(("Linie fină pe frunte", "Două riduri de zâmbet")):
                obj.hide_render = obj.hide_viewport = True
        beard_fibers(beard)
        knitted_cap(head)
    elif pointed:
        head.scale.x = .93
        nose.scale.x *= .82
        nose.scale.z *= 1.18
        kamilavka(head)
        kamilavka_veil(head)

    for expression, value in (("Zâmbet", .22 if young else .04), ("Sprânceană", .11)):
        for key in face.keys[expression]:
            key.value = value
    return head
