"""Portraits for the standard monk skeleton, at its unscaled rest height.

Run blender in background with --python blender/characters/ioan_colov.py.
The two younger-portrait sheets establish the silhouette and expression limits.
"""
from math import cos, exp, pi, sin, sqrt, tau
from pathlib import Path
from random import Random

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
ELDER = ROOT / "experiments/portret-cleopa/source/calugar-ortodox-rig.blend"
OUTPUT = ROOT / "assets/characters/ioan-colov.glb"
BLINK_R, BLINK_L = "Clipit ochi drept", "Clipit ochi stâng"
A, E, I, O, U, M = "A · deschis", "E · întins", "I · îngust", "O · rotunjit", "U · strâns", "M B P · închis"
JOY_FACE, JOY_MOUTH = "Bucurie · față", "Bucurie · gură"
SAD_FACE, SAD_MOUTH = "Tristețe · față", "Tristețe · gură"
WOW_FACE, WOW_MOUTH = "Surprindere · față", "Surprindere · gură"
THINK = "Îngrijorare · față"
LEFT, RIGHT = "Privire la stânga", "Privire la dreapta"
UP, DOWN = "Privire în sus", "Privire în jos"


def empty(name):
    ob = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(ob)
    ob["portraitVariant"] = name
    ob["portraitRig"] = name
    return ob


def elder():
    bpy.ops.wm.open_mainfile(filepath=str(ELDER))
    bpy.context.scene.frame_set(1)
    keep = [o for o in bpy.context.scene.objects
            if o.type == "MESH" and o.data.shape_keys and
            (o.name.startswith("Călugăr ortodox bătrân") or o.name.startswith("Ochi în orbită"))]
    if len(keep) != 3:
        raise RuntimeError(f"Expected the elder head and two eyes, found {[o.name for o in keep]}")
    root = empty("fratele-mare-colov")
    for ob in keep:
        world = ob.matrix_world.copy()
        ob.parent = root
        ob.matrix_parent_inverse.identity()
        ob.matrix_world = world
        ob.modifiers.clear()
        ob.animation_data_clear()
        ob.data.shape_keys.animation_data_clear()
        for key in ob.data.shape_keys.key_blocks:
            key.value = 0
        if ob.name.startswith("Ochi"):
            ob["portraitEye"] = "R" if ob.name.endswith("drept") else "L"
    for ob in list(bpy.context.scene.objects):
        if ob not in keep and ob != root:
            bpy.data.objects.remove(ob, do_unlink=True)
    mesh = next(ob for ob in keep if not ob.get("portraitEye"))
    keys = mesh.data.shape_keys.key_blocks
    poses = {
        "E1": {BLINK_R: .05, BLINK_L: .05},
        "E2": {JOY_FACE: .36, JOY_MOUTH: .26},
        "E3": {WOW_FACE: .35},
        "E4": {BLINK_R: 1, BLINK_L: 1},
        "E5": {THINK: .32},
        "E6": {JOY_FACE: .27, JOY_MOUTH: .22, WOW_FACE: .22},
    }
    for label, parts in poses.items():
        morph = mesh.shape_key_add(name=label)
        base = keys[0].data
        for j, point in enumerate(morph.data):
            ref = base[j].co
            offset = Vector()
            for key, weight in parts.items():
                if label == "E6" and key == WOW_FACE and ref.x < 0:
                    continue
                offset += (keys[key].data[j].co - ref) * weight
            point.co = ref + offset


def pigment(hexcode):
    rgb = [int(hexcode[k:k+2], 16) / 255 for k in (0, 2, 4)]
    return tuple(v / 12.92 if v <= .04045 else ((v + .055) / 1.055)**2.4 for v in rgb) + (1,)


def material(name, color, roughness=.82, vertex_color=False):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = pigment(color)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = mat.diffuse_color
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Specular IOR Level"].default_value = .27
    if vertex_color:
        channel = mat.node_tree.nodes.new("ShaderNodeVertexColor")
        channel.layer_name = "Pigment"
        mat.node_tree.links.new(channel.outputs["Color"], shader.inputs["Base Color"])
    return mat


def mix(a, b, w):
    return tuple(x + w * (y - x) for x, y in zip(a, b))


def surface(parent, name, mat, coordinate, nu=64, nv=18, *, loop=False, keys=(), color=None):
    samples = [(j / nu if loop else j / max(1, nu - 1), k / (nv - 1))
               for k in range(nv) for j in range(nu)]
    vertices = [coordinate(u, v, None) for u, v in samples]
    faces = []
    for k in range(nv - 1):
        for j in range(nu if loop else nu - 1):
            a, b = k * nu + j, k * nu + (j + 1) % nu
            faces.append((a, b, b + nu, a + nu))
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.parent = parent
    data.materials.append(mat)
    for polygon in data.polygons:
        polygon.use_smooth = True
    if color is not None:
        layer = data.color_attributes.new(name="Pigment", type="FLOAT_COLOR", domain="POINT")
        for i, (u, v) in enumerate(samples):
            layer.data[i].color = color(u, v)
    if keys:
        obj.shape_key_add(name="Repaus")
        for key in keys:
            shape = obj.shape_key_add(name=key)
            for i, (u, v) in enumerate(samples):
                shape.data[i].co = coordinate(u, v, key)
    return obj


def gaussian(x, y, cx, cy, sx, sy):
    return exp(-((x - cx) / sx)**2 - ((y - cy) / sy)**2)


def proportions(z):
    radius = sqrt(max(.00007, 1 - ((z - 3.415) / .558)**2))
    return .564 * radius * (1 - .11 * max(0, (3.4-z)/.54)), .435 * radius


def front(x, z):
    a, b = proportions(z)
    contour = -.018 - b * sqrt(max(.001, 1 - (x / a)**2))
    cheek = .078 * gaussian(abs(x), z, .31, 3.32, .17, .115)
    nose = (.054 * gaussian(x, z, 0, 3.48, .085, .165)
            + .199 * gaussian(x, z, 0, 3.355, .116, .069)
            + .045 * gaussian(abs(x), z, .082, 3.335, .06, .043))
    chin = .066 * gaussian(x, z, 0, 3.05, .23, .096)
    jaw = .028 * gaussian(abs(x), z, .19, 3.18, .22, .16)
    socket = .046 * gaussian(abs(x), z, .222, 3.475, .139, .073)
    muzzle = .026 * gaussian(x, z, 0, 3.215, .23, .064)
    return contour - (nose + cheek + chin + jaw + muzzle - socket)


def build_skin(root, skin):
    pal = [pigment(c) for c in ("E9AB86", "D78070", "F4BD92", "BD7865", "E9996D")]

    def skull(u, v, key):
        theta = tau * (u - .5)
        z = 3.415 - .55798 * cos(pi * v)
        rx, ry = proportions(z)
        x = rx * sin(theta)
        f = max(0, cos(theta))
        y = front(x, z) if f else -.018 - ry*cos(theta)
        return x, y, z

    def color(u, v):
        x, y, z = skull(u, v, None)
        fg = max(0, cos(tau * (u - .5)))
        cheek = .49 * fg * gaussian(abs(x), z, .321, 3.308, .132, .092)
        nose = .29 * gaussian(x, z, 0, 3.35, .105, .1) * fg
        col = mix(pal[0], pal[1], min(.8, cheek + nose))
        col = mix(col, pal[2], .36 * fg * gaussian(x, z, 0, 3.72, .38, .18))
        col = mix(col, pal[3], .37 * fg * gaussian(abs(x), z, .22, 3.50, .14, .081))
        return mix(col, pal[4], .21 * (1 - fg))

    surface(root, "Ioan · față rotundă", skin, skull, 192, 142, loop=True, color=color)


def build_eye(root, side, mats):
    cx, cz = side * .227, 3.477
    rx, up, lower = .155, .103, .079
    shut = BLINK_R if side < 0 else BLINK_L
    expr = (shut, WOW_FACE, JOY_FACE, SAD_FACE, THINK)
    sclera, rim_mat, iris, lashes = mats
    white = pigment("F9E5CD")
    gray = pigment("B99986")
    lid_color, edge_color, lid_shadow = map(pigment, ("E9AB86", "BE795F", "E7A17B"))

    def profile(t, key):
        z = cz + .008 * side * t
        arch = sqrt(max(.00001, 1-t*t))
        if key == shut:
            mid = z - .026 * arch
            return mid + .00045*arch, mid - .00045*arch
        top, bottom = z + up * arch, z - lower * arch
        if key == WOW_FACE:
            top += .024 * arch
        if key == JOY_FACE:
            bottom += .025 * arch
            top -= .013 * arch
        if key == SAD_FACE:
            top -= (.024 + .02 * side * t) * arch
        if key == THINK:
            top -= .024 * arch
        return top, bottom

    def eye_depth(t, h):
        x = cx + rx * t
        # A continuous cornea bulges forward, and vanishes behind the socket at the tear ducts.
        return front(x, cz) - .014 - .044 * sqrt(max(0, 1 - t*t - h*h*.54))

    for is_upper in (False, True):
        lid_side = 1 if is_upper else -1

        def lid(u, v, k):
            t = 2*u - 1
            ix = cx + rx*t
            term = profile(t, k)[not is_upper]
            # Feather the rim into the skin. At mid-lid, the closed shape covers the retracted eye.
            ox = cx + (rx + .050)*t
            oz = cz + .008*side*t + lid_side*(.042+(up if is_upper else lower)*sqrt(max(0,1-t*t)))
            x, z = ix + (ox-ix)*v, term + (oz-term)*v
            iy = (eye_depth(t, (term-cz)/.115) - .008)
            oy = front(x,z) + .003
            y = iy*(1-v)**2.2 + oy*(1-(1-v)**2.2) - .009*sin(pi*v)
            return x, y, z

        def tint(u, v):
            return mix(mix(lid_color, edge_color, .65*exp(-v/.15)), lid_shadow, .30*sin(pi*v))

        surface(root, f"Pleoapă {'superioară' if is_upper else 'inferioară'} {side}", rim_mat, lid,
                80, 16, keys=expr, color=tint)
        if is_upper:
            def lash(u, v, k):
                x, y, z = lid(u, .004, k)
                return x, y - .0015-.0013*sin(pi*v), z + v*.0055*sin(u*pi)**.75
            surface(root, f"Linia pleoapei {side}", lashes, lash, 70, 5, keys=expr)

    def eyeball(u, v, k):
        t = 2*u - 1
        top, bottom = profile(t, k)
        z = bottom + (top-bottom)*v
        return cx+rx*t, eye_depth(t, (z-cz)/.115) + (.064 if k == shut else 0), z

    eye = surface(root, f"Scleră sculptată {side}", sclera, eyeball, 76, 38, keys=expr,
                  color=lambda u, v: mix(white, gray, .34*abs(2*u-1)**3 + .11*(1-v)))
    eye["portraitEye"] = "R" if side < 0 else "L"
    gaze = {LEFT:(-.037,0), RIGHT:(.037,0), UP:(0,.021), DOWN:(0,-.022)}
    center, brown, amber, ring, matte = map(pigment, ("261A18", "61371E", "AD733A", "4A2B20", "FFF2CF"))

    def iris_coord(u, v, k):
        dx, dz = gaze.get(k, (0, 0))
        a = -tau*u
        radius = (.062 if k != shut else .003) * max(.001, v)
        x = cx + .005*side + dx + radius*cos(a)
        z = cz + .008+dz + radius*sin(a)
        y = eye_depth((x-cx)/rx, (z-cz)/.115) - .0018 - .004*(1-v*v)
        if k == shut:
            y += .097
            z = cz - .026 + radius*sin(a)
        return x,y,z

    def iris_color(u, v):
        t = tau*u
        fibers = .45 + .20*sin(36*t+.87*sin(9*t)) + .10*sin(57*t+v*8)
        col = mix(brown, amber, fibers)
        if v < .46:
            col = mix(center,col,min(1,max(0,(v-.41)/.055)))
        if v > .83:
            col = mix(col,ring,(v-.83)/.17)
        x, z = v*cos(t), -v*sin(t)
        gleam = .93*gaussian(x,z,-.28,.36,.17,.14) + .3*gaussian(x,z,.43,-.25,.12,.094)
        return mix(col, matte, min(.95,gleam))

    iris_obj = surface(root, f"Iris căprui {side}", iris, iris_coord, 100, 34, loop=True,
                       keys=(*gaze, shut), color=iris_color)
    iris_obj["portraitEye"] = eye["portraitEye"]
    iris_obj["iris"] = True


def build_mouth(root, lip, palate, teeth):
    mouth_keys = (A, E, I, O, U, M, JOY_MOUTH, SAD_MOUTH, WOW_MOUTH)
    # Only the lower lip and chin edge follow the vertical opening. Width changes are confined to the vermilion.
    poses = {
        None:(.162,.010,.009,.012), A:(.163,.017,.089,.007),
        E:(.178,.014,.055,.016), I:(.171,.013,.028,.012),
        O:(.140,.022,.072,.005), U:(.126,.017,.038,.005),
        M:(.161,0,0,.012), JOY_MOUTH:(.176,.012,.027,.038),
        SAD_MOUTH:(.157,.009,.015,-.023), WOW_MOUTH:(.145,.025,.061,.004),
    }
    z0 = 3.202
    tint, fade, bright = map(pigment, ("C77765", "D49777", "D38D78"))

    def outline(t, k):
        width, u, d, corner = poses[k]
        shape = sqrt(max(0,1-t*t))**1.45
        bow = .005 * exp(-((abs(t)-.30)/.22)**2)
        z = z0 + corner*t*t
        return t*width, z+shape*(u+bow), z-shape*d

    for upper in (False, True):
        def lips(u, v, k):
            t = 2*u-1
            x, top, bottom = outline(t,k)
            zi = top if upper else bottom
            rise = (1 if upper else -1)*(.022 if upper else .025)
            z = zi + rise * v * sqrt(max(0,1-t*t))
            # The edge is just proud of the adjacent skin and the lip ends taper to zero.
            y = front(x, z) - (.050*sin(pi*v*.89) + .024*(1-v)) * sqrt(max(.001,1-t*t))
            if not upper:
                y -= .058 * (z0-z) / .089 * sqrt(max(0,1-t*t))
            return x,y,z

        surface(root, f"Buză {'superioară' if upper else 'inferioară'}", lip, lips,
                90, 11, keys=mouth_keys, color=lambda u,v:mix(mix(tint,bright,sin(pi*v)**2),fade,v**1.6))

    def inside(u, v, k):
        x, top, bottom = outline(2*u-1,k)
        z = bottom + (top-bottom)*v
        return x, front(x,z)-.014 + .019*sin(pi*v) - .037*(1-v)*min(1,(top-bottom)/.10), z

    dark, rose = map(pigment, ("6B302D", "AD6257"))
    surface(root, "Cavitate roz, cu boltă și fund moale", palate, inside, 80, 24, keys=mouth_keys,
            color=lambda u,v:mix(dark, rose, .48*sin(pi*u)**2*(1-v)**2))

    def tooth(u, v, k):
        x, top, bottom = outline((2*u-1)*.72,k)
        z = max(bottom+.001, top - .003 - .020 * v * sin(pi*u)**.5)
        if k in (None, M):
            z = top + .005 + .005*v
        return x, front(x, z)-.021, z

    surface(root, "Arcadă de dinți fildeș", teeth, tooth, 52, 7, keys=mouth_keys)


def shell_hair(root, mat, beard=False):
    random = Random(542 if beard else 783)
    colors = [pigment(c) for c in ("3F251A", "5C3924", "744C32", "895D3F", "9B6B49")]
    harmonics = [random.uniform(0,tau) for _ in range(6)]

    def hair(u, v, k):
        a = (u-.5)*(3.64 if beard else tau)
        if beard:
            t = abs(a)/1.82
            lower = 2.934 + .285*t**1.9
            upper = (3.127 + .278*t**1.7 + .010*cos(a*4))
            z = lower + (upper-lower)*v
            rx, ry = proportions(z)
            x = (rx + .043*(1-v)) * sin(a) * (1 + .025*sin(a*16+v*7))
            base = front(x,z) if abs(a) < pi/2 else -.018-ry*cos(a)
            relief = (.022 + .009*sin(a*55+v*5) + .005*cos(a*81-v*4))
            y = base - relief*max(.17, sin(pi*v)**.67) - .012
            if k == A:
                z -= .018 * max(0,1-t) * v**2
            if k == O:
                z -= .015 * max(0,1-t) * v**2
        else:
            v = min(.9999,v)
            edge = 3.407 + .212*(.5+.5*cos(a)) + .035*cos(3*a+.3) + .024*sin(11*a + .81)
            z = edge+(4.005-edge)*v
            rx, ry = proportions(min(3.9728,z))
            arc = a + .41*v*sin(a+.8)
            grooved = (.012 + .007*sin(arc*38+v*9) + .006*sin(arc*59+v*7))
            dome = sin(pi*(.08+.92*v))**.5
            x = (rx+(.042+grooved)*dome)*sin(a)
            y = -.018-(ry+(.044+grooved)*dome)*cos(a)
            z += (.019+.013*cos(arc*13+v*7))*dome
        return x,y,z

    def tint(u,v):
        a = tau*(u-.5) + v*(.59 if beard else 1.3)
        l = .43 + .24*sin(a*19+harmonics[0]) + .13*sin(a*38+harmonics[1]) + .1*cos(a*55+v*4)
        col = mix(colors[0], colors[2], .33 + .60*l)
        return mix(col,colors[3],(.43 if beard else .29)*sin(pi*v)**.65)

    surface(root, "Barbă castanie, scurtă" if beard else "Păr scurt pieptănat", mat, hair,
            192, 56, loop=not beard, keys=(A,O) if beard else (), color=tint)


def build_brows(root, mat):
    for side in (-1,1):
        def curve(u, v, k):
            x = side*(.083+.304*u)
            z = 3.599 + .047*sin(pi*u) - .016*u
            z += {WOW_FACE:.030, JOY_FACE:.010, SAD_FACE:.027*(1-u), THINK:-.014*(1-u)}.get(k,0)
            radius = sin(pi*u)**.65 * (.021 - .008*u)
            a = tau*v
            return x, front(x,z)-.008-radius*cos(a)*.62, z+radius*sin(a)

        surface(root, f"Sprânceană castanie {side}", mat, curve, 58, 15, keys=(WOW_FACE,JOY_FACE,SAD_FACE,THINK))


def young():
    root = empty("ioan-colov")
    skin = material("Ioan · piele și obraji", "E9AB86", vertex_color=True)
    lip = material("Ioan · buze", "D38D78", .71, True)
    palate = material("Ioan · interiorul gurii", "9D5044", .79, True)
    teeth = material("Ioan · fildeș", "F3DEC0", .65)
    white = material("Ioan · albul ochilor", "F9E5CD", .51, True)
    lids = material("Ioan · pleoape", "E9AB86", .79, True)
    irises = material("Ioan · ochi căprui", "805337", .46, True)
    seam = material("Ioan · contur pleoape", "8D5243")
    hair = material("Ioan · pigment castaniu", "6B4428", .83, True)
    brow = material("Ioan · sprâncene", "543522")
    build_skin(root, skin)
    for side in (-1,1):
        build_eye(root, side, (white,lids,irises,seam))
    build_mouth(root, lip, palate, teeth)
    build_brows(root,brow)
    shell_hair(root, hair)
    shell_hair(root, hair, True)


elder()
young()
# Thin surfaces remain one logical piece across the front and side views.
# Cull on the interactive body, while the sculpted facial layers need both sides.
for mat in bpy.data.materials:
    if mat.name.startswith("Ioan"):
        mat.use_backface_culling = False
bpy.ops.export_scene.gltf(filepath=str(OUTPUT), export_format="GLB", export_extras=True,
                          export_animations=False, export_morph_normal=False, export_morph_tangent=False)
