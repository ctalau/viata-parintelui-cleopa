"""Mama volumetrică: a fully 3D body with one skeleton, skinned parts and an ink shell.

Blender axes: X towards the character's left (screen right in the front view),
-Y forward towards the front camera, Z up. The rest pose stands with the arms
hanging; fingertips stop clearly above the knee. Every visible part is a closed
loft of rings, weighted to the bones with a short blend around each joint, so
the GLB uses ordinary glTF skinning. Each part carries an inverted hull, a little
wider and with reversed faces, which draws the series' dark contour from any
angle (back-face culling on, no post-process needed).
"""
from math import cos, pi, sin, sqrt, tau

import bmesh
import bpy
from mathutils import Matrix, Vector

RING = 16
INK = "3a2925"
PALETTE = {
    "piele": "f5b488", "piele_umbra": "e1946d", "obraz": "ee8f7c",
    "camasa": "ffedcb", "camasa_umbra": "dfb991", "broderie": "b5463a",
    "fusta": "78433b", "fusta_deschis": "ac6552", "fusta_inchis": "4f3030",
    "brau": "5d3328", "batic": "f6ecd6", "batic_umbra": "e2cfae",
    "par": "513029", "ochi": "3a2520", "iris": "81512f", "alb": "fff8ec",
    "gura": "a04a3e", "obiele": "efe2c6", "opinca": "5e392b",
}
# name: (head, tail, parent). The heads of chained bones meet their parents' tails.
BONES = {
    "root": ((0, 0, 0), (0, 0, .15), None),
    "pelvis": ((0, 0, .92), (0, 0, 1.02), "root"),
    "spine": ((0, 0, 1.02), (0, 0, 1.16), "pelvis"),
    "chest": ((0, 0, 1.16), (0, 0, 1.36), "spine"),
    "neck": ((0, 0, 1.36), (0, 0, 1.45), "chest"),
    "head": ((0, 0, 1.45), (0, 0, 1.84), "neck"),
}
for side, s in (("L", 1), ("R", -1)):
    BONES.update({
        f"shoulder.{side}": ((s*.04, 0, 1.32), (s*.185, 0, 1.31), "chest"),
        f"upper_arm.{side}": ((s*.195, 0, 1.30), (s*.222, .005, 1.015), f"shoulder.{side}"),
        f"forearm.{side}": ((s*.222, .005, 1.015), (s*.236, 0, .76), f"upper_arm.{side}"),
        f"hand.{side}": ((s*.236, 0, .76), (s*.24, -.005, .615), f"forearm.{side}"),
        f"thigh.{side}": ((s*.088, 0, .90), (s*.092, -.008, .49), "pelvis"),
        f"shin.{side}": ((s*.092, -.008, .49), (s*.092, .0, .085), f"thigh.{side}"),
        f"foot.{side}": ((s*.092, .0, .085), (s*.096, -.165, .03), f"shin.{side}"),
    })
HEAD_CENTER = Vector((0, 0, 1.63))
HEAD_RADII = Vector((.19, .17, .2))


def color(hex_):
    return tuple(int(hex_[i:i+2], 16)/255 for i in (0, 2, 4))


def srgb_to_linear(c):
    return c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4


def material(name, hex_, cull=True):
    key = "Volum · "+name
    if key in bpy.data.materials:
        return bpy.data.materials[key]
    mat = bpy.data.materials.new(key)
    rgb = tuple(srgb_to_linear(c) for c in color(hex_))
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = .9
    mat.use_backface_culling = cull
    mat.roughness = .9
    return mat


def frame_along(t, reference=Vector((0, -1, 0))):
    t = t.normalized()
    n = reference-t*reference.dot(t)
    if n.length < 1e-4:
        n = Vector((1, 0, 0))-t*t.x
    n.normalize()
    return n, t.cross(n).normalized()


class Part:
    """Ring-structured closed surface with per-face colour and per-vertex weights."""

    def __init__(self, name):
        self.name = name
        self.points, self.faces, self.colors = [], [], []

    def loft(self, rings, colour, caps=(True, True)):
        """rings: (centre, x_axis, y_axis, rx, ry); colour(ring_index) -> palette key."""
        start = len(self.points)
        for centre, x, y, rx, ry in rings:
            for i in range(RING):
                a = i*tau/RING
                self.points.append(centre+x*(cos(a)*rx)+y*(sin(a)*ry))
        for r in range(len(rings)-1):
            for i in range(RING):
                j = (i+1) % RING
                a, b = start+r*RING+i, start+r*RING+j
                self.faces.append((a, b, b+RING, a+RING))
                self.colors.append(colour(r))
        for cap, r in zip(caps, (0, len(rings)-1)):
            if not cap:
                continue
            centre = rings[r][0]
            tip = len(self.points)
            self.points.append(centre.copy())
            base = start+r*RING
            for i in range(RING):
                j = (i+1) % RING
                self.faces.append((base+j, base+i, tip) if r == 0 else (base+i, base+j, tip))
                self.colors.append(colour(r))

    def tube(self, path, radii, colour, flat=1., reference=Vector((0, -1, 0)), caps=(True, True)):
        """A tube through `path` points with (rx, ry) radii at each point."""
        rings = []
        for k, (point, radius) in enumerate(zip(path, radii)):
            ahead = path[min(k+1, len(path)-1)]-path[max(k-1, 0)]
            x, y = frame_along(ahead, reference)
            rx, ry = radius if isinstance(radius, tuple) else (radius, radius*flat)
            rings.append((Vector(point), x, y, rx, ry))
        self.loft(rings, colour, caps)

    def ellipsoid(self, centre, radii, colour, axes=Matrix.Identity(3), rings=11, squash=None):
        centre = Vector(centre)
        loops = []
        for k in range(1, rings):
            lat = -pi/2+pi*k/rings
            z = sin(lat)*radii[2]
            scale = cos(lat)
            loops.append((centre+axes@Vector((0, 0, z)), axes@Vector((1, 0, 0)), axes@Vector((0, 1, 0)),
                          radii[0]*scale, radii[1]*scale))
        start = len(self.points)
        self.loft(loops, colour, caps=(False, False))
        for end, r in ((-1, 0), (1, len(loops)-1)):
            tip = len(self.points)
            self.points.append(centre+axes@Vector((0, 0, end*radii[2])))
            base = start+r*RING
            for i in range(RING):
                j = (i+1) % RING
                self.faces.append((base+j, base+i, tip) if end < 0 else (base+i, base+j, tip))
                self.colors.append(colour(r))


def joint_weights(point, chain):
    """chain: [(bone, head, tail)] in order. Points blend over ±blend around joints."""
    best, best_d, best_t = 0, 1e9, 0
    for i, (_, a, b) in enumerate(chain):
        ab = b-a
        t = max(0, min(1, (point-a).dot(ab)/ab.length_squared))
        d = (a+ab*t-point).length
        if d < best_d-1e-9:
            best, best_d, best_t = i, d, (point-a).dot(ab)/ab.length_squared
    bone, a, b = chain[best]
    length = (b-a).length
    blend = .055/length
    weights = {bone: 1.}
    if best+1 < len(chain) and best_t > 1-blend:
        k = min(1, (best_t-(1-blend))/(2*blend))
        weights = {bone: 1-k, chain[best+1][0]: k}
    elif best > 0 and best_t < blend:
        k = min(1, (blend-best_t)/(2*blend))
        weights = {bone: 1-k, chain[best-1][0]: k}
    return weights


def height_weights(point, anchors):
    """anchors: [(z, bone)] ascending; linear blend between neighbours."""
    if point.z <= anchors[0][0]:
        return {anchors[0][1]: 1.}
    for (za, a), (zb, b) in zip(anchors, anchors[1:]):
        if point.z <= zb:
            k = (point.z-za)/(zb-za)
            k = k*k*(3-2*k)
            return {a: 1-k, b: k} if a != b else {a: 1.}
    return {anchors[-1][1]: 1.}


def bone_vec(name, end=0):
    return Vector(BONES[name][end])


def build_armature(collection):
    data = bpy.data.armatures.new("Schelet volumetric")
    rig = bpy.data.objects.new("RIG_Mama volumetrică", data)
    collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")
    for name, (head, tail, parent) in BONES.items():
        bone = data.edit_bones.new(name)
        bone.head, bone.tail = head, tail
        bone.roll = 0
        if parent:
            bone.parent = data.edit_bones[parent]
            bone.use_connect = (Vector(BONES[parent][1])-Vector(head)).length < 1e-6
    bpy.ops.object.mode_set(mode="OBJECT")
    for bone in rig.pose.bones:
        bone.rotation_mode = "QUATERNION"
    return rig


def arm_chain(side):
    return [(f"upper_arm.{side}", bone_vec(f"upper_arm.{side}"), bone_vec(f"upper_arm.{side}", 1)),
            (f"forearm.{side}", bone_vec(f"forearm.{side}"), bone_vec(f"forearm.{side}", 1)),
            (f"hand.{side}", bone_vec(f"hand.{side}"), bone_vec(f"hand.{side}", 1))]


def leg_chain(side):
    return [(f"thigh.{side}", bone_vec(f"thigh.{side}"), bone_vec(f"thigh.{side}", 1)),
            (f"shin.{side}", bone_vec(f"shin.{side}"), bone_vec(f"shin.{side}", 1)),
            (f"foot.{side}", bone_vec(f"foot.{side}"), bone_vec(f"foot.{side}", 1))]


TORSO = [(.95, .165, .125), (1.0, .158, .118), (1.08, .166, .12), (1.18, .19, .13),
         (1.26, .205, .132), (1.32, .2, .122), (1.37, .15, .1), (1.41, .085, .07)]


def torso_radius(z):
    for (za, xa, ya), (zb, xb, yb) in zip(TORSO, TORSO[1:]):
        if za <= z <= zb:
            k = (z-za)/(zb-za)
            return xa+(xb-xa)*k, ya+(yb-ya)*k
    return TORSO[-1][1:]


def head_surface(x, z, outward=0.):
    """Front surface point of the head ellipsoid at (x, z), lifted by `outward`."""
    c, r = HEAD_CENTER, HEAD_RADII
    u = 1-(x/r.x)**2-((z-c.z)/r.z)**2
    y = -r.y*sqrt(max(0, u))
    normal = Vector((x/r.x**2, y/r.y**2, (z-c.z)/r.z**2)).normalized()
    return Vector((x, y, z))+normal*outward, normal


def parts():
    """Return [(Part, weight function, mirror side or None)]."""
    result = []
    torso_anchor = [(.98, "pelvis"), (1.08, "spine"), (1.2, "chest")]

    def torso_weights(p):
        w = height_weights(p, torso_anchor)
        if p.z > 1.24 and abs(p.x) > .13:
            side = "L" if p.x > 0 else "R"
            k = min(1, (abs(p.x)-.13)/.07)*min(1, (p.z-1.24)/.05)*.45
            w = {b: v*(1-k) for b, v in w.items()}
            w[f"shoulder.{side}"] = w.get(f"shoulder.{side}", 0)+k
        return w

    # Shirt with the waist sash (brâu) and the embroidered chest panel.
    torso = Part("Cămașă și brâu")
    rings = []
    for z, rx, ry in TORSO:
        rings.append((Vector((0, 0, z)), Vector((1, 0, 0)), Vector((0, 1, 0)), rx, ry))
    rings.insert(1, (Vector((0, 0, .975)), Vector((1, 0, 0)), Vector((0, 1, 0)), .172, .128))
    torso.loft(rings, lambda r: "brau" if r in (0, 1) else ("broderie" if r == 4 else "camasa"))
    for x in (-.065, .065):
        for z in (1.12, 1.18, 1.24):
            point = Vector((x, -torso_radius(z)[1]+.004, z))
            torso.ellipsoid(point, (.016, .006, .02), lambda r: "broderie", rings=5)
    result.append((torso, torso_weights))

    # A wide skirt over the legs. Its lower half follows the thighs a little.
    skirt = Part("Fustă")
    rings = []
    profile = [(1.0, .176, .132), (.95, .186, .146), (.82, .2, .17), (.62, .245, .218), (.42, .292, .258), (.36, .296, .262)]
    for z, rx, ry in profile:
        rings.append((Vector((0, .0, z)), Vector((1, 0, 0)), Vector((0, 1, 0)), rx, ry))
    skirt.loft(rings, lambda r: "fusta_deschis" if r == 3 else ("fusta_inchis" if r == 4 else "fusta"))

    def skirt_weights(p):
        follow = max(0, min(1, (.95-p.z)/.55))*.55
        if follow <= 0:
            return {"pelvis": 1.}
        left = max(0, min(1, .5+p.x/.18))
        return {"pelvis": 1-follow, "thigh.L": follow*left, "thigh.R": follow*(1-left)}
    result.append((skirt, skirt_weights))

    neck = Part("Gât")
    neck.tube([Vector((0, .005, 1.34)), Vector((0, .005, 1.42)), Vector((0, .01, 1.5))],
              [.05, .046, .05], lambda r: "piele_umbra")
    result.append((neck, lambda p: height_weights(p, [(1.37, "chest"), (1.43, "neck"), (1.49, "head")])))

    head = Part("Cap")
    head.ellipsoid(HEAD_CENTER, HEAD_RADII, lambda r: "piele", rings=14)
    for s in (-1, 1):
        ear = HEAD_CENTER+Vector((s*.185, .02, -.02))
        head.ellipsoid(ear, (.022, .035, .045), lambda r: "piele_umbra", rings=6)
    result.append((head, lambda p: {"head": 1.}))

    face = Part("Față")
    for s in (-1, 1):
        eye, n = head_surface(s*.068, 1.615, .004)
        face.ellipsoid(eye, (.03, .012, .043), lambda r: "ochi", rings=7)
        shine, _ = head_surface(s*.058, 1.638, .015)
        face.ellipsoid(shine, (.011, .006, .012), lambda r: "alb", rings=5)
        brow, _ = head_surface(s*.074, 1.69, .006)
        face.ellipsoid(brow, (.04, .009, .011), lambda r: "par", rings=5,
                       axes=Matrix.Rotation(s*.18, 3, "Y"))
        cheek, _ = head_surface(s*.112, 1.55, .002)
        face.ellipsoid(cheek, (.036, .01, .024), lambda r: "obraz", rings=5)
    nose, _ = head_surface(0, 1.585, .01)
    face.ellipsoid(nose, (.022, .02, .022), lambda r: "piele_umbra", rings=6)
    mouth, _ = head_surface(0, 1.525, .003)
    face.ellipsoid(mouth, (.036, .008, .01), lambda r: "gura", rings=5)
    result.append((face, lambda p: {"head": 1.}))

    hair = Part("Păr")
    hair.ellipsoid(HEAD_CENTER+Vector((0, .03, .012)), (.196, .175, .203), lambda r: "par", rings=12)
    result.append((hair, lambda p: {"head": 1.}))

    # The scarf is a hood around the face: a ring grid whose front edge follows the
    # forehead and the jaw. A tail of cloth falls on the back of the neck.
    scarf = Part("Batic")
    c, r = HEAD_CENTER+Vector((0, .025, .02)), Vector((.214, .2, .214))
    loops = []
    for k in range(9):
        v = k/8
        loop = []
        for i in range(RING):
            lon = i*tau/RING  # 0 = back (+Y), pi = front (-Y)
            front = max(0, min(1, (.3-cos(lon))/.9))
            low = -1.25+front*1.8   # the opening reaches from the forehead to the jaw
            lat = low+(pi/2-low)*v
            loop.append(c+Vector((r.x*cos(lat)*sin(lon), r.y*cos(lat)*cos(lon), r.z*sin(lat))))
        loops.append(loop)
    start = len(scarf.points)
    for loop in loops:
        scarf.points.extend(loop)
    for k in range(len(loops)-1):
        for i in range(RING):
            j = (i+1) % RING
            a, b = start+k*RING+i, start+k*RING+j
            scarf.faces.append((a, a+RING, b+RING, b))
            scarf.colors.append("broderie" if k == 0 else "batic")
    tip = len(scarf.points)
    scarf.points.append(c+Vector((0, 0, r.z)))
    base = start+(len(loops)-1)*RING
    for i in range(RING):
        scarf.faces.append((base+i, tip, base+(i+1) % RING))
        scarf.colors.append("batic")
    scarf.tube([c+Vector((0, .17, -.17)), c+Vector((0, .2, -.27)), c+Vector((0, .2, -.36))],
               [(.09, .03), (.07, .025), (.012, .01)], lambda r: "batic_umbra")
    result.append((scarf, lambda p: {"head": 1.} if p.z > 1.42 else {"head": .6, "neck": .4}))

    for side, s in (("L", 1), ("R", -1)):
        chain = arm_chain(side)
        sh, el, wr, tip = (bone_vec(f"upper_arm.{side}"), bone_vec(f"forearm.{side}"),
                           bone_vec(f"hand.{side}"), bone_vec(f"hand.{side}", 1))

        def arm_weights(p, chain=chain, side=side):
            w = joint_weights(p, chain)
            if p.z > 1.245:
                k = min(1, (p.z-1.245)/.06)*.5
                w = {b: v*(1-k) for b, v in w.items()}
                w["shoulder."+side] = w.get("shoulder."+side, 0)+k
            return w
        upper = Part(f"Mânecă · braț · {side}")
        path = [sh+Vector((-s*.012, 0, .035)), sh, sh.lerp(el, .3), sh.lerp(el, .7), el+(el-sh).normalized()*.01]
        upper.tube(path, [.06, .088, .082, .072, .068], lambda r: "broderie" if r == 1 else "camasa")
        result.append((upper, arm_weights))
        lower = Part(f"Mânecă · antebraț · {side}")
        path = [el-(el-sh).normalized()*.03, el, el.lerp(wr, .5), wr.lerp(el, .1), wr+(wr-el).normalized()*.008]
        lower.tube(path, [.066, .068, .064, .06, .056], lambda r: "broderie" if r == 3 else "camasa")
        result.append((lower, arm_weights))

        hand = Part(f"Palmă · {side}")
        axis = (tip-wr).normalized()
        # Palm plane faces the thigh (normal along X), the back of the hand outwards.
        across = Vector((0, -1, 0))
        palm = [wr-axis*.01, wr+axis*.03, wr+axis*.075, wr+axis*.11, wr+axis*.142, wr+axis*.16]
        hand.tube(palm, [(.036, .022), (.046, .025), (.05, .025), (.048, .023), (.04, .02), (.014, .008)],
                  lambda r: "piele", reference=across)
        thumb_root = wr+axis*.035+Vector((-s*.012, -.03, 0))
        hand.tube([thumb_root, thumb_root+Vector((-s*.008, -.02, -.035)), thumb_root+Vector((-s*.01, -.026, -.062))],
                  [.016, .014, .006], lambda r: "piele_umbra")
        result.append((hand, lambda p, chain=chain: joint_weights(p, chain)))

        leg = Part(f"Picior · {side}")
        hip, knee, ankle = bone_vec(f"thigh.{side}"), bone_vec(f"shin.{side}"), bone_vec(f"foot.{side}")
        leg.tube([hip+Vector((0, 0, .02)), hip.lerp(knee, .5), knee, knee.lerp(ankle, .55), ankle+Vector((0, 0, .015))],
                 [.075, .066, .056, .05, .043], lambda r: "obiele")
        result.append((leg, lambda p, side=side: joint_weights(p, leg_chain(side)[:2])))

        shoe = Part(f"Opincă · {side}")
        toe = bone_vec(f"foot.{side}", 1)
        shoe.ellipsoid(ankle.lerp(toe, .45)+Vector((0, .02, -.035)), (.056, .118, .047), lambda r: "opinca", rings=8)
        result.append((shoe, lambda p, side=side: {f"foot.{side}": 1.}))
    return result


def build_mesh(part, weights, rig, collection, ink=.011):
    bm = bmesh.new()
    deform = bm.verts.layers.deform.verify()
    names = [bone.name for bone in rig.data.bones]
    verts = [bm.verts.new(point) for point in part.points]
    keys = sorted(set(part.colors))
    for point, vert in zip(part.points, verts):
        w = weights(Vector(point))
        total = sum(w.values())
        for bone, value in w.items():
            if value > 1e-4:
                vert[deform][names.index(bone)] = value/total
    for face, colour in zip(part.faces, part.colors):
        f = bm.faces.new([verts[i] for i in face])
        f.material_index = keys.index(colour)
    bm.normal_update()
    if part.name != "Batic":
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.normal_update()
    if ink and part.name not in {"Față"}:
        # The ink hull: the same surface pushed out along the normals, faces reversed.
        geometry = bmesh.ops.duplicate(bm, geom=list(bm.verts)+list(bm.faces))
        shell_verts = [g for g in geometry["geom"] if isinstance(g, bmesh.types.BMVert)]
        shell_faces = [g for g in geometry["geom"] if isinstance(g, bmesh.types.BMFace)]
        for vert in shell_verts:
            vert.co += vert.normal*ink
        bmesh.ops.reverse_faces(bm, faces=shell_faces)
        for face in shell_faces:
            face.material_index = len(keys)
    mesh = bpy.data.meshes.new(part.name)
    bm.to_mesh(mesh)
    bm.free()
    for key in keys:
        mesh.materials.append(material(key, PALETTE[key], cull=part.name != "Batic"))
    if ink and part.name not in {"Față"}:
        mesh.materials.append(material("Contur", INK))
    for poly in mesh.polygons:
        poly.use_smooth = True
    obj = bpy.data.objects.new(part.name, mesh)
    collection.objects.link(obj)
    for name in names:
        obj.vertex_groups.new(name=name)
    obj.parent = rig
    modifier = obj.modifiers.new("Schelet", "ARMATURE")
    modifier.object = rig
    obj["volum_ink"] = len(keys) if ink and part.name not in {"Față"} else -1
    return obj


def build_character(collection):
    rig = build_armature(collection)
    objects = [build_mesh(part, weights, rig, collection) for part, weights in parts()]
    return rig, objects
