"""Pose the Mother's stress tests and draw a continuous sleeve and hand."""
from math import radians

import bpy
from mathutils import Vector

from build_episode import blink, breathing, finish_action, head, stand
from sleeves import ease
from vector_art import Art, material

# Frame, upper arm from vertical, elbow flex and wrist turn in degrees,
# finger flex and thumb spread. The two arm segments keep their full length.
REST = (7, 11, -4, .87, .12)
POSES = {
    "palma": (
        (1, *REST), (10, 10, 24, -5, .61, .16),
        (23, 19, 64, 1, .24, .66), (31, 19, 64, 21, .11, .91),
        (36, 19, 64, 18, .14, .83), (48, 19, 64, -25, .63, .52),
        (54, 19, 64, -20, .55, .53), (65, 19, 64, 7, .19, .76),
        (73, 18, 57, 2, .27, .63), (85, 13, 31, -5, .55, .33),
        (97, *REST),
    ),
    "cot": (
        (1, *REST), (12, 21, 19, -4, .49, .27),
        (27, 30, 43, 3, .18, .63), (43, 27, 93, -10, .36, .59),
        (53, 25, 108, -7, .46, .54), (60, 25, 102, -3, .41, .57),
        (73, 30, 60, 8, .21, .69), (84, 20, 30, 2, .46, .38),
        (97, *REST),
    ),
    "umar": (
        (1, *REST), (11, 12, 16, -4, .57, .23),
        (27, 50, 32, 3, .33, .51), (43, 91, 23, 8, .18, .73),
        (58, 112, 27, 4, .12, .79), (64, 109, 30, 2, .15, .74),
        (75, 75, 26, -6, .36, .57), (87, 34, 18, -3, .54, .37),
        (97, *REST),
    ),
}

INK = "372a24"
CUFF = "f2d6a9"
THREAD = "a95647"
EDGE = "c29470"
STITCH = "b87761"


def normal(direction):
    return Vector((-direction.y, direction.x))


def cubic(a, b, c, d, t):
    u = 1-t
    return a*u**3 + b*(3*u*u*t) + c*(3*u*t*t) + d*t**3


def quadratic(a, b, c, t):
    return a.lerp(b, t).lerp(b.lerp(c, t), t)


def sleeve_rows(shoulder, elbow, wrist, folded=False):
    upper, fore = (elbow-shoulder).normalized(), (wrist-elbow).normalized()
    nu, nf = normal(upper), normal(fore)
    upper_length, fore_length = (elbow-shoulder).length,(wrist-elbow).length
    join = shoulder + upper*min(.23,upper_length*.34)
    ahead, behind = elbow-upper*min(.245,.38*upper_length), elbow+fore*min(.24,.42*fore_length)
    before_cuff, opening, hem = wrist-fore*.118, wrist-fore*.026, wrist+fore*.024
    inner_anchor = shoulder + Vector((-.245, -.188))
    outer_anchor = shoulder + Vector((-.19, .174))
    inner_join, outer_join = join - nu*.191, join + nu*.195
    rows = []

    for i in range(10):
        t = i/9
        inner = cubic(inner_anchor, shoulder+Vector((.018,-.224)),
                      inner_join-upper*.115, inner_join, t)
        outer = cubic(outer_anchor, shoulder+Vector((.115,.223)),
                      outer_join-upper*.122, outer_join, t)
        rows.append((inner, outer, .065+.456*ease(t)))

    edges = []
    for sign in (-1, 1):
        a = ahead+nu*(sign*.154)
        c = behind+nf*(sign*.132)
        corner = .143/(1+nu.dot(nf))
        if folded:
            corner = min(corner,.238)
        b = elbow + (nu+nf)*(sign*corner)
        edges.append((a,b,c))
    for i in range(1, 5):
        t = i/4
        rows.append((inner_join.lerp(edges[0][0],t), outer_join.lerp(edges[1][0],t), .521+.035*t))
    for i in range(1, 10):
        t = i/9
        rows.append((quadratic(*edges[0],t), quadratic(*edges[1],t), .556+.043*t))
    for i in range(1, 5):
        t = i/4
        rows.append((edges[0][-1].lerp(before_cuff-nf*.108,t),
                     edges[1][-1].lerp(before_cuff+nf*.108,t), .599+.029*t))
    rim = hem-fore*.014
    rows.extend(((opening-nf*.104,opening+nf*.104,.637),
                 (rim-nf*.103,rim+nf*.103,.640),
                 (hem-nf*.103,hem+nf*.103,.641)))
    return rows


def sample_sleeve(rows, u, v, dz=0, sign=1):
    row = min(int(v),len(rows)-2)
    inner, outer, depth = rows[row]
    next_inner, next_outer, next_depth = rows[row+1]
    t = v-row
    point = inner.lerp(next_inner,t).lerp(outer.lerp(next_outer,t),u)
    return (point.x*sign, point.y, depth+(next_depth-depth)*t+dz)


def sleeve_model(coll, profile, rows, side="L", sign=1):
    """Keep linework and embroidery registered to the same surface."""
    columns = (0, .052, .225, .948, 1)
    coords = [(u, row, 0) for row in range(len(rows)) for u in columns]
    faces, colors = [], []
    for row in range(len(rows)-1):
        for col in range(len(columns)-1):
            i = row*len(columns)+col
            faces.append((i,i+1,i+1+len(columns),i+len(columns)))
            if col in (0, 3) or row == len(rows)-2:
                colors.append(0)
            elif row >= len(rows)-4:
                colors.append(3)
            else:
                colors.append(2 if col == 1 else 1)

    def decoration(points, swatch):
        start = len(coords)
        coords.extend((u,v,.006) for u,v in points)
        faces.append(tuple(range(start,len(coords))))
        colors.append(swatch)

    for v, thickness, color in ((8.25,.24,5), (9.0,.28,4), (len(rows)-4.1,.21,0)):
        decoration(((.08,v),(.92,v),(.92,v+thickness),(.08,v+thickness)),color)
    for u in (.21, .36, .51, .66, .81):
        for v in (10.1,len(rows)-2.55):
            decoration(((u-.037,v),(u,v-.34),(u+.037,v),(u,v+.34)),4)

    mesh = bpy.data.meshes.new("Mânecă desenată continuu")
    mesh.from_pydata([sample_sleeve(rows,*point,sign=sign) for point in coords],[],
                     faces if sign == 1 else [face[::-1] for face in faces])
    for code in (INK,profile["shirt"],profile["shade"],CUFF,THREAD,STITCH):
        mesh.materials.append(material(code))
    mesh.polygons.foreach_set("material_index", colors)
    mesh.update()
    obj = bpy.data.objects.new("Mânecă, umăr și manșetă · "+side, mesh)
    coll.objects.link(obj)
    return obj, coords


def hand_model(coll, profile, side="L"):
    """One silhouette with a real thumb, unequal finger lengths and soft creases."""
    art = Art("Palmă articulată · "+side,coll)
    skin, shade = profile["skin"],profile["skin_shadow"]
    art.shape(
        "M -.064 -.034 C -.071 .002 -.078 .048 -.087 .080"
        " C -.099 .117 -.137 .135 -.163 .172"
        " C -.183 .199 -.178 .227 -.160 .235"
        " C -.140 .243 -.129 .229 -.112 .208"
        " L -.082 .180 C -.079 .215 -.078 .260 -.076 .292"
        " C -.074 .315 -.071 .333 -.056 .338"
        " C -.038 .343 -.027 .334 -.026 .318"
        " L -.021 .277 L -.015 .334 C -.013 .356 -.003 .369 .013 .369"
        " C .027 .369 .037 .358 .036 .337 L .030 .276"
        " L .044 .321 C .049 .338 .058 .344 .071 .339"
        " C .083 .335 .088 .326 .083 .308 L .069 .258"
        " L .086 .285 C .094 .300 .106 .301 .115 .294"
        " C .124 .287 .128 .278 .122 .265"
        " L .100 .201 C .101 .181 .104 .153 .096 .129"
        " C .090 .105 .075 .084 .068 .064 L .058 -.035 Z",skin,INK,.013
    )
    art.shape(
        "M -.052 -.023 C -.053 .039 -.069 .083 -.088 .118"
        " C -.100 .143 -.132 .155 -.148 .192"
        " C -.135 .186 -.117 .165 -.095 .148"
        " C -.054 .137 -.032 .113 -.028 .080"
        " Q -.027 .047 -.010 .026 L -.006 -.023 Z", shade
    )
    art.line("M -.083 .167 Q -.040 .146 -.039 .102", "bb774f", .008)
    art.line("M -.041 .216 Q -.001 .227 .050 .212", "c4875a", .008)
    art.line("M .021 .172 Q .045 .180 .069 .172", "ce8d61", .006)
    return art.finish()


def hand_points(vertices, wrist, direction, fingers, thumb, sign=1, depth=.616, flex_power=1):
    across = normal(direction)
    for x,y,z in vertices:
        # Flex the pads with a smooth longitudinal gradient. The base of the
        # palm and wrist keep the same width and never move off the cuff.
        pad = ease((y-.115)/.245)
        thumb_pad = ease((-x-.071)/.105)*ease((y-.075)/.12)
        curl = fingers*flex_power*(.85+.18*ease((x+.032)/.145))
        xx = x*(1-.46*curl*pad) + thumb_pad*(.053*(1-thumb)-.022*thumb)
        yy = y-.144*curl*pad + .013*thumb*thumb_pad
        point = wrist+direction*yy+across*xx
        yield (point.x*sign, point.y, depth+z)


def key_poses(character, test):
    rig = character["rig"]
    stand(character,1)
    for bone_name in ("upper_arm", "forearm", "hand"):
        bone = rig.pose.bones[bone_name+".L"]
        bone.scale = (1,1,1)
        bone.keyframe_insert("scale",index=1,frame=1,group="Brațul stâng")
    for name, angle in (("upper_arm", -7.5), ("forearm", -14), ("hand", 3)):
        bone = rig.pose.bones[name+".R"]
        bone.scale = (1,1,1)
        bone.rotation_euler.z = radians(angle)
        bone.keyframe_insert("scale",index=1,frame=1,group="Brațul drept")
        bone.keyframe_insert("rotation_euler",index=2,frame=1,group="Brațul drept")
    rig["flexie_degete.L"] = REST[-2]
    rig["deschidere_police.L"] = REST[-1]
    for frame, upper, elbow, palm, fingers, thumb in POSES[test]:
        for bone_name, angle in (("upper_arm",upper),("forearm",elbow),("hand",palm)):
            bone = rig.pose.bones[bone_name+".L"]
            bone.rotation_euler.z = radians(angle)
            bone.keyframe_insert("rotation_euler",index=2,frame=frame,group="Brațul stâng")
        for prop,value in (("flexie_degete.L",fingers),("deschidere_police.L",thumb)):
            rig[prop] = value
            rig.keyframe_insert(f'["{prop}"]',frame=frame,group="Palmă și degete")
    # A small glance follows the lift while the torso and feet stay planted.
    for frame, bow, tilt in ((1,0,0),(21,0,.01),(49,.027,-.052),(67,.012,-.029),(97,0,0)):
        head(rig,frame,bow,tilt)
    blink(rig,16)
    blink(rig,77)
    breathing(character,1,97)
    action = character["action"]
    finish_action(rig,action)
    for curve in action.fcurves:
        if curve.data_path in ('["flexie_degete.L"]','["deschidere_police.L"]') or (
                curve.array_index == 2 and any(
                    f'["{name}.L"]' in curve.data_path for name in ("upper_arm","forearm","hand"))):
            for key in curve.keyframe_points:
                key.interpolation = "BEZIER"
                key.handle_left_type = key.handle_right_type = "AUTO_CLAMPED"


def check_sleeve_transition(previous, current, frame):
    """The exported meshes use linear morphs between these exact sections."""
    for (a,b,_),(c,d,_) in zip(previous,current):
        width = b-a
        delta = (d-c)-width
        t = max(0, min(1, -width.dot(delta)/delta.length_squared)) if delta.length_squared else 0
        if (width+delta*t).length < .195:
            raise RuntimeError(f"Mâneca se îngustează între cadrele {frame-1} și {frame}")

    def area(rows, row):
        a,b,_ = rows[row]
        d,c,_ = rows[row+1]
        return (b-a).cross(c-a)+(c-a).cross(d-a)

    middle = [(a.lerp(c,.5),b.lerp(d,.5),0) for (a,b,_),(c,d,_) in zip(previous,current)]
    for row in range(len(current)-1):
        start, center, end = (area(rows,row) for rows in (previous,middle,current))
        quadratic = 2*(end+start-2*center)
        linear = end-start-quadratic
        peak = max(start,end)
        if quadratic < 0:
            t = -linear/(2*quadratic)
            if 0 < t < 1:
                peak = max(peak,start+linear*t+quadratic*t*t)
        if peak > .00001:
            raise RuntimeError(f"Silueta mânecii se pliază între cadrele {frame-1} și {frame}")


def create_stress_arm(scene, character, test, bake_shapes):
    rig, coll = character["rig"],character["collection"]
    profile = character["p"]
    for obj in list(coll.objects):
        if obj.type == "MESH" and obj.name.endswith((" · L", " · R")) and (
            obj.parent_bone.startswith("hand.") or any(mod.type == "ARMATURE" for mod in obj.modifiers)
        ):
            bpy.data.objects.remove(obj,do_unlink=True)

    key_poses(character,test)
    samples = []
    previous = None
    for frame in range(1,98):
        scene.frame_set(frame)
        upper, fore, hand = (rig.pose.bones[name+".L"] for name in ("upper_arm","forearm","hand"))
        shoulder, elbow, wrist = upper.head.xy,fore.head.xy,hand.head.xy
        direction = (hand.tail.xy-wrist).normalized()
        if abs((elbow-shoulder).length-profile["upper"]) > .0001 or abs(
                (wrist-elbow).length-profile["lower"]) > .0001:
            raise RuntimeError(f"Lungimea brațului s-a schimbat la cadrul {frame}")
        rows = sleeve_rows(shoulder,elbow,wrist)
        check_sleeve_transition(previous or rows, rows, frame)
        previous = rows
        samples.append((frame,rows,wrist,direction,rig["flexie_degete.L"],rig["deschidere_police.L"]))

    sleeve, coords = sleeve_model(coll,profile,samples[0][1])
    palm = hand_model(coll,profile)
    base_palm = [tuple(vertex.co) for vertex in palm.data.vertices]
    for obj in (sleeve,palm):
        obj.parent = rig
    bake_shapes(sleeve, [(frame,[sample_sleeve(rows,*point) for point in coords])
                         for frame,rows,*_ in samples])
    bake_shapes(palm, [(frame,list(hand_points(base_palm,wrist,direction,fingers,thumb)))
                       for frame,_,wrist,direction,fingers,thumb in samples])
    scene.frame_set(1)
    upper, fore, hand = (rig.pose.bones[name+".R"] for name in ("upper_arm","forearm","hand"))

    def mirror(point):
        return Vector((-point.x,point.y))

    shoulder, elbow, wrist = (mirror(bone.head) for bone in (upper,fore,hand))
    resting_sleeve, _ = sleeve_model(coll,profile,sleeve_rows(shoulder,elbow,wrist),side="R",sign=-1)
    resting_hand = hand_model(coll, profile, side="R")
    resting_coords = [tuple(vertex.co) for vertex in resting_hand.data.vertices]
    forward = (mirror(hand.tail)-wrist).normalized()
    posed = list(hand_points(resting_coords,wrist,forward,.89,.11,sign=-1))
    resting_hand.data.vertices.foreach_set("co", [value for point in posed for value in point])
    resting_hand.data.update()
    for obj in (resting_sleeve,resting_hand):
        obj.parent = rig
    print("MAMA_STRESS_OK",test,len(samples),"cadre și toate interpolările manșetei și mânecii",flush=True)
