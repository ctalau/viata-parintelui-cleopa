"""Choreography, contact landmarks and prop tracks for the Mother's gestures."""
from math import atan2, cos, pi, radians, sin, sqrt, tau

import bpy
from mathutils import Matrix, Vector

from build_episode import breathing, finish_action, head, prop, stand
from build_environment import meal
from mother_stress import hand_model, hand_points, normal, sample_sleeve, sleeve_model, sleeve_rows
from sleeves import ease
from vector_art import Art


END = 145
ACTIONS = ("cruce", "cana", "ras", "cearta", "paine", "batic", "traista")

# Hand targets are in the frontal plane of the character. Angles are from down,
# positive towards screen-right. Named targets on the head follow its motion.
# Each row is frame, target, direction, finger flex, thumb spread.
TRACKS = {
    "cruce": {"R": ("cruce", .332, [
        (1,"rest",-20,.7,.15), (6,"rest",-20,.7,.15),
        (25,(-.92,1.53),-157,.44,.31),
        (40,"frunte",150,.04,.52), (48,"frunte",150,.04,.52),
        (59,"piept",151,.05,.5), (65,"piept",151,.05,.5),
        (77,"umar-drept",137,.06,.48), (83,"umar-drept",137,.06,.48),
        (95,"umar-stang",113,.07,.49), (102,"umar-stang",113,.07,.49),
        (111,(-.04,.63),40,.34,.3), (129,"rest",-20,.7,.15), (END,"rest",-20,.7,.15),
    ])},
    "cana": {"R": ("pumn", .145, [
        (1,"rest",-20,.82,.08), (10,"rest",-20,.82,.08),
        (28,(-1.08,.81),-88,.48,.60),
        (40,"toarta",-107,.19,.68), (48,"toarta",-107,.83,.18),
        (70,"toarta",-128,.88,.13), (87,"toarta",-126,.88,.13),
        (109,"toarta",-107,.88,.13), (118,"toarta",-107,.30,.65),
        (130,(-.83,.77),-63,.56,.36), (END,"rest",-20,.82,.08),
    ])},
    "ras": {"R": ("pumn", .145, [
        (1,"rest",-20,.89,.12), (9,"rest",-20,.89,.12),
        (32,(-.66,1.46),-150,.55,.28),
        (46,"gura",125,.23,.38), (89,"gura",129,.35,.29),
        (105,(-.58,1.31),-150,.49,.26), (129,"rest",-20,.89,.12), (END,"rest",-20,.89,.12),
    ])},
    "cearta": {"L": ("aratator", .322, [
        (1,"rest",20,.88,.11), (14,"rest",20,.88,.11),
        (28,(1.22,1.61),117,.48,.49),
        (44,(1.44,2.00),167,.1,.30),
        (51,(1.51,2.03),149,.06,.34), (57,(1.43,1.99),173,.07,.29),
        (64,(1.56,2.06),145,.05,.34), (71,(1.42,1.98),174,.06,.28),
        (79,(1.57,2.01),140,.12,.35), (92,(1.44,1.85),153,.19,.26),
        (109,(1.05,1.53),85,.51,.19), (132,"rest",20,.88,.11), (END,"rest",20,.88,.11),
    ])},
    "paine": {
        "R": ("pumn", .125, [
            (1,"rest",-20,.86,.12), (15,(-1.21,.67),39,.50,.33),
            (34,"taler-R",63,.75,.24), (108,"taler-R",66,.60,.3),
            (122,(-.92,.66),-25,.54,.25), (END,"rest",-20,.86,.12),
        ]),
        "L": ("pumn", .125, [
            (1,"rest",20,.87,.12), (17,(.57,.64),-44,.51,.43),
            (34,"taler-L",-55,.75,.29), (108,"taler-L",-62,.59,.33),
            (126,(.95,.72),22,.53,.33), (END,"rest",20,.87,.12),
        ]),
    },
    "batic": {"R": ("prindere", .270, [
        (1,"rest",-20,.88,.10), (19,"rest",-20,.88,.10),
        (32,(-1.07,1.53),-149,.47,.45),
        (47,"colt",158,.23,.23), (57,"colt",158,.07,.12),
        (81,"colt",148,.10,.16), (98,"colt",154,.40,.46),
        (111,(-1.04,1.25),-127,.62,.32), (134,"rest",-20,.88,.10), (END,"rest",-20,.88,.10),
    ])},
    "traista": {"L": ("aratator", .322, [
        (1,"rest",20,.86,.13), (17,"rest",20,.86,.13),
        (32,(1.04,1.55),124,.4,.27),
        (48,(1.52,.95),38,.14,.43), (67,(1.52,.95),38,.15,.40),
        (84,(1.67,1.48),102,.35,.38), (99,(1.55,.98),38,.18,.39),
        (111,(1.54,.96),37,.2,.32), (132,"rest",20,.86,.13), (END,"rest",20,.86,.13),
    ])},
}

FACE = {
    "cruce": [(1,0,0,0,0),(28,.025,-.025,0,1),(92,.032,.012,0,1),(109,.06,.028,0,1),
              (121,.22,.115,0,2),(128,.17,.083,0,2),(139,.02,.010,0,0),(END,0,0,0,0)],
    "cana": [(1,0,0,0,0),(30,.045,-.055,0,1),(51,.055,-.052,0,0),
             (78,.029,-.026,0,0),(110,.042,-.051,0,1),(END,0,0,0,0)],
    "ras": [(1,0,0,0,0),(14,.025,-.04,7,0),(39,.06,-.07,7,1),
            (49,.115,-.08,1,2),(57,.05,-.058,7,1),(65,.12,-.083,1,2),
            (73,.056,-.044,7,1),(83,.11,-.07,1,2),(94,.055,-.043,7,1),
            (109,.025,.017,7,0),(132,0,0,0,0),(END,0,0,0,0)],
    "cearta": [(1,0,0,0,0),(25,.035,-.08,5,1),(43,.048,-.10,1,0),
               (51,.031,-.06,2,0),(60,.05,-.085,6,1),(70,.04,-.067,1,0),
               (80,.05,-.093,2,1),(93,.026,-.045,4,0),(112,.014,-.023,0,0),(END,0,0,0,0)],
    "paine": [(1,.035,-.09,0,0),(23,.08,-.11,0,1),(38,.07,-.085,0,0),
              (66,.033,-.02,0,0),(102,.075,.05,0,1),(120,.025,.03,7,0),(END,0,0,0,0)],
    "batic": [(1,0,0,0,0),(35,.029,-.045,0,1),(55,.041,-.062,0,0),
              (83,.066,-.085,0,1),(106,.025,-.023,7,0),(END,0,0,0,0)],
    "traista": [(1,0,0,0,0),(27,.032,.063,6,0),(46,.039,.108,1,0),
                (58,.045,.085,2,0),(74,.031,.062,4,1),(89,.042,.084,6,0),
                (102,.03,.098,1,0),(112,.02,.073,7,0),(END,0,0,0,0)],
}

# Contact positions are taken from the same track as the lifted prop.
SCARF = ((1,(0,0)),(57,(0,0)),(80,(-.18,.26)),(90,(-.18,.26)),(98,(0,0)),(END,(0,0)))
CUP = ((1,(-1.37,-.015)),(48,(-1.37,-.015)),(72,(-1.23,.49)),(87,(-1.21,.47)),
       (109,(-1.37,-.015)),(END,(-1.37,-.015)))
TRAY = ((1,(-.19,-.185)),(34,(-.19,-.185)),(51,(-.20,.20)),(68,(-.03,.27)),
        (83,(.19,.23)),(100,(.25,-.185)),(END,(.25,-.185)))


def interval(keys, frame):
    for a,b in zip(keys,keys[1:]):
        if frame <= b[0]:
            t = (frame-a[0])/(b[0]-a[0])
            return a,b,t*t*t*(t*(6*t-15)+10)
    return keys[-1],keys[-1],0


def position(keys, frame):
    a,b,t = interval(keys, frame)
    return Vector(a[1]).lerp(Vector(b[1]),t)


def direction(angle):
    return Vector((sin(angle),-cos(angle)))


def unwrap(reference, angle):
    return reference+(angle-reference+pi)%tau-pi


def scarf_corner(profile):
    return Vector((-.965*profile["head_w"],profile["head_y"]-.665*profile["head_h"]))


def landmarks(profile, rig, frame):
    chest = profile["shoulder_y"]
    shoulder = profile["shoulder_x"]
    head_bone = rig.pose.bones["head"]
    head_matrix = head_bone.matrix @ head_bone.bone.matrix_local.inverted()

    def on_head(x,y):
        return (head_matrix @ Vector((x,y,0))).xy

    cy, hw, hh = profile["head_y"],profile["head_w"],profile["head_h"]
    return {
        "frunte":on_head(.15*hw,cy+.57*hh),
        "gura":on_head(.15*hw,cy-.42*hh),
        "piept":Vector((.04,chest-.51)),
        "umar-drept":Vector((-.91*shoulder,chest-.042)),
        "umar-stang":Vector((.91*shoulder,chest-.042)),
        "toarta":position(CUP,frame)+Vector((.31,.204)),
        "taler-R":position(TRAY,frame)+Vector((-.63,.055)),
        "taler-L":position(TRAY,frame)+Vector((.63,.055)),
        "colt":on_head(*(scarf_corner(profile)+position(SCARF,frame))),
    }


def contact_pose(origin, target, aimed, tip, lengths, side, outward, reference):
    """Resolve a semantic hand contact to an FK orientation and projection."""
    side_sign = (-1 if side == "R" else 1)*(-1 if outward else 1)
    upper, fore = lengths
    min_span = sqrt(upper**2+fore**2+2*upper*fore*cos(radians(107)))

    def solve(angle):
        requested = target-direction(angle)*tip
        delta = requested-origin
        distance = delta.length
        along = delta.normalized()
        projection = min(1,max(.36,distance/min_span))
        a,b = upper*projection,fore*projection
        span = max(abs(a-b)+.003,min(distance,a+b-.003))
        height = (a*a-b*b+span*span)/(2*span)
        offset = sqrt(max(0,a*a-height*height))
        elbow = origin+along*height-normal(along)*offset*side_sign
        wrist = origin+along*span
        u = atan2(elbow.x-origin.x,origin.y-elbow.y)
        f = atan2(wrist.x-elbow.x,elbow.y-wrist.y)
        angles = (u,unwrap(u,f)-u,unwrap(f,angle)-f)
        if reference is not None:
            angles = tuple(unwrap(old,new) for old,new in zip(reference,angles))
        return angles, projection, abs(distance-span)

    def cost(delta):
        angles, projection, residual = solve(aimed+delta)
        wrist = abs(unwrap(0,angles[2]))
        continuity = sum(abs(a-b) for a,b in zip(reference,angles)) if reference else 0
        score = 65*residual + 18*max(0,wrist-radians(38)) + abs(delta)*.54 + continuity*.95
        return score,(angles,projection)

    # Nearby angles preserve continuity across samples of a held prop;
    # free flights between these poses are interpolated in joint space.
    return min((cost(radians(offset)) for offset in range(-180,181,2)),key=lambda entry:entry[0])[1]


def arm_samples(scene, rig, profile, side, keys, tip, outward):
    sign = -1 if side == "R" else 1
    origin = Vector((sign*profile["shoulder_x"],profile["shoulder_y"]))
    lengths = profile["upper"],profile["lower"]
    neutral = tuple(radians(angle*sign) for angle in (7,11,2))
    stops = {}
    previous = neutral
    for frame, target, aim, _, _ in keys:
        scene.frame_set(frame)
        if target == "rest":
            pose = tuple(unwrap(old,rest) for old,rest in zip(previous,neutral)),1.
        else:
            point = landmarks(profile,rig,frame)[target] if isinstance(target,str) else Vector(target)
            pose = contact_pose(origin,point,radians(aim),tip,lengths,side,outward,previous)
        stops[frame] = pose
        previous = pose[0]

    previous = None
    peak = 0.
    gap = 0.
    for frame in range(1,END+1):
        scene.frame_set(frame)
        a,b,t = interval(keys,frame)
        aa,sa = stops[a[0]]
        bb,sb = stops[b[0]]
        angles = tuple(x+t*(y-x) for x,y in zip(aa,bb))
        projection = sa+t*(sb-sa)
        held = a[1] == b[1] and isinstance(a[1],str) and a[1] != "rest"
        if held:
            target = landmarks(profile,rig,frame)[a[1]]
            aim = sum(angles)
            angles,projection = contact_pose(origin,target,aim,tip,lengths,side,outward,angles)
        elbow = origin+direction(angles[0])*(lengths[0]*projection)
        wrist = elbow+direction(angles[0]+angles[1])*(lengths[1]*projection)
        if held:
            gap = max(gap,(wrist+direction(sum(angles))*tip-target).length)
        if previous:
            peak = max(peak,max(abs(unwrap(old,new)-old) for old,new in zip(previous,angles)))
        previous = angles
        for name,angle in zip(("upper_arm","forearm","hand"),angles):
            bone = rig.pose.bones[f"{name}.{side}"]
            bone.rotation_euler.z = angle
            bone.keyframe_insert("rotation_euler",index=2,frame=frame,group=f"Braț {side}")
            if name != "hand":
                bone.scale.y = projection
                bone.keyframe_insert("scale",index=1,frame=frame,group=f"Braț {side}")

        def mirror(v):
            return Vector((v.x*sign,v.y))

        rows = sleeve_rows(mirror(origin),mirror(elbow),mirror(wrist),folded=True)
        yield (frame, rows, mirror(wrist), mirror(direction(sum(angles))),
               a[3]+(b[3]-a[3])*t, a[4]+(b[4]-a[4])*t)
    print("GEST_CONTROL", rig.name, side, "contact local", round(gap,4),
          "grade/cadru", round(peak*180/pi,1), flush=True)
    if gap > .043 or peak > radians(17):
        raise RuntimeError(f"Contact sau tranziție de revizuit: {rig.name} {side}")



def specialised_hand(coll, profile, side, shape):
    """One silhouette per grip family, always with the same cuff attachment."""
    art = Art("Palmă · "+shape+" · "+side, coll)
    paths = {
        "cruce": ("M -.065 -.034 C -.073 .019 -.074 .046 -.082 .095 "
                  "Q -.120 .15 -.103 .208 Q -.092 .248 -.049 .274 "
                  "Q -.029 .284 -.025 .31 Q -.023 .344 .003 .343 Q .026 .34 .029 .314 "
                  "L .028 .286 Q .058 .301 .063 .272 L .054 .213 "
                  "Q .076 .228 .09 .211 Q .108 .182 .086 .143 "
                  "Q .115 .159 .114 .118 Q .099 .071 .068 .058 L .062 -.035 Z",
                  ("M -.078 .181 Q -.060 .229 -.036 .227", "M .032 .277 Q .041 .247 .029 .216",
                   "M .043 .171 Q .071 .18 .093 .157")),
        "aratator": ("M -.063 -.035 Q -.079 .057 -.087 .082 Q -.119 .125 -.103 .161 "
                      "Q -.087 .190 -.051 .195 L -.044 .310 Q -.043 .348 -.020 .349 "
                      "Q .007 .351 .010 .32 L .012 .195 Q .043 .216 .062 .195 "
                      "Q .085 .203 .101 .184 Q .134 .185 .130 .147 Q .122 .090 .079 .056 L .059 -.035 Z",
                      ("M -.088 .143 Q -.050 .163 -.016 .143","M .043 .180 Q .030 .152 .043 .128",
                       "M .091 .175 Q .077 .141 .094 .122")),
        "prindere": ("M -.063 -.035 Q -.07 .052 -.086 .099 Q -.116 .142 -.129 .179 "
                     "Q -.146 .220 -.111 .228 Q -.089 .240 -.075 .215 L -.052 .184 "
                     "Q -.047 .214 -.015 .259 Q .006 .292 .027 .28 Q .048 .266 .030 .242 "
                     "L .009 .211 Q .042 .227 .074 .209 Q .103 .192 .097 .154 "
                     "Q .134 .144 .107 .106 Q .095 .068 .063 .056 L .060 -.035 Z",
                     ("M -.088 .155 Q -.058 .122 -.017 .132","M .039 .209 Q .022 .187 .037 .166",
                      "M .084 .181 Q .064 .157 .076 .128")),
        "pumn": ("M -.064 -.036 Q -.078 .045 -.084 .074 Q -.124 .111 -.13 .151 "
                 "Q -.134 .184 -.104 .193 Q -.085 .200 -.066 .171 "
                 "Q -.071 .222 -.036 .238 Q -.013 .245 .008 .220 "
                 "Q .029 .246 .050 .221 Q .077 .245 .098 .214 "
                 "Q .128 .225 .142 .194 Q .148 .154 .114 .106 "
                 "Q .094 .079 .063 .056 L .060 -.036 Z",
                 ("M -.097 .159 Q -.056 .111 -.019 .133", "M .011 .207 Q -.005 .177 .012 .154",
                  "M .058 .210 Q .043 .177 .058 .154", "M .101 .200 Q .087 .180 .100 .161")),
    }
    path, crease = paths[shape]
    art.shape(path, profile["skin"], "432c28", .015)
    for arc in crease:
        art.line(arc, "bd7957", .009)
    return art.finish()


def furniture(coll, y):
    art = Art("Masă de lemn",coll,z=.49)
    for x in (-2.52,2.38):
        art.shape(f"M {x} {y-.53} L {x+.145} {y-.53} L {x+.15} {y-1.62} L {x+.03} {y-1.62} Z",
                  "754931","53382b",.019)
    art.shape(f"M -2.66 {y-.07} L 2.66 {y-.07} L 2.90 {y-.39} L -2.90 {y-.39} Z",
              "a36d48","583928",.036)
    art.rect(-2.90,y-.57,2.90,y-.39,"75482f","583928",.032)
    art.line([(-2.82,y-.45),(2.82,y-.45)],"c08a56",.019)
    art.line([(-2.40,y-.18),(2.44,y-.18)],"ce9a66",.015)
    art.finish()


def cup_model(coll):
    art = Art("Cană cu toartă",coll,z=.75)
    art.shape("M .213 .364 C .57 .420 .60 .104 .230 .099 L .228 .168 "
              "C .445 .154 .466 .346 .223 .294 Z","a16b4e","593d33",.023)
    art.shape("M -.270 .435 L -.222 .047 Q -.197 -.048 .016 -.047 Q .223 -.027 .239 .056 "
              "L .288 .437 Z","bd8159","593d33",.030)
    art.shape("M -.210 .389 L -.170 .053 Q -.111 -.005 -.043 -.007 L -.071 .398 Z","db9f71")
    art.oval(.006,.435,.282,.075,"d39364","593d33",.021)
    art.oval(.007,.439,.223,.047,"604233")
    art.line("M -.201 .121 Q .012 .043 .224 .124","7c9a83",.049)
    art.line("M -.223 .203 Q .007 .104 .237 .205","f1ca8f",.021)
    for x,y in ((-.119,.173),(0,.149),(.119,.174)):
        art.diamond(x,y,.040,.051,"e1ab74")
    return art.finish()


def loaf_model(coll):
    meal(coll)
    keep = {"Woven loaf platter", "Round scored bread"}
    result = []
    for obj in list(coll.objects):
        if obj.name not in keep:
            bpy.data.objects.remove(obj,do_unlink=True)
            continue
        obj.scale = (.445,.445,1)
        obj.data.transform(Matrix.Translation((0,3.23,-3.75)))
        result.append(obj)
    return result


def bend_scarf(obj, profile, bake_shapes):
    corner = scarf_corner(profile)
    vertices = [tuple(v.co) for v in obj.data.vertices]
    samples = []
    for frame in range(1,END+1):
        movement = position(SCARF,frame)
        points = []
        for x,y,z in vertices:
            # The upper scarf stays pinned at the head. The fingers move
            # the same tail that is already in the portrait silhouette.
            falloff = ease((-.38-x)/(-.38-corner.x))*(1-ease((y-corner.y)/.47))
            points.append((x+movement.x*falloff,y+movement.y*falloff,z))
        samples.append((frame,points))
    bake_shapes(obj,samples)


def furrow_brows(coll):
    for obj in coll.objects:
        if "Brow ·" not in obj.name:
            continue
        vertices = obj.data.vertices
        pivot = sum((v.co for v in vertices),Vector())/len(vertices)
        obj.data.transform(Matrix.Translation(-pivot))
        # The part remains head-bound, with a pivot centred on its artwork.
        obj.location = pivot
        sign = 1 if obj.name.endswith("R") else -1
        for frame,amount in ((1,0),(20,0),(36,12),(54,9),(70,13),(88,10),(111,0),(END,0)):
            obj.rotation_euler.z = radians(amount*sign)
            obj.keyframe_insert("rotation_euler",index=2,frame=frame,group="Sprâncene")


def bag_model(coll):
    art = Art("Traistă pentru școală",coll,(1.83,-.23),(1,1),z=.40)
    art.rect(-.51,-.13,.51,.015,"a67550","684936",.035)
    art.shape("M -.39 -.13 L -.28 -.13 L -.36 -.71 L -.49 -.71 Z","856141","684936",.027)
    art.shape("M .28 -.13 L .39 -.13 L .48 -.71 L .36 -.71 Z","856141","684936",.027)
    art.line("M -.23 .48 Q -.46 1.05 .033 1.187 Q .46 1.183 .293 .465","987146",.057)
    art.shape("M -.433 .55 Q .002 .676 .443 .549 L .366 -.019 Q .032 -.122 -.375 -.017 Z",
              "c79c6f","654537",.029)
    art.shape("M -.421 .520 Q -.040 .638 .418 .52 L .323 .238 Q .015 .126 -.318 .241 Z",
              "e0bc86","956649",.022)
    for x in (-.18,0,.18):
        art.diamond(x,.338,.058,.058,"9d5b4e")
        art.diamond(x,.338,.027,.025,"f2d3a0")
    art.line("M -.351 .079 Q .032 .002 .331 .071","ab794f",.026)
    return art.finish()


def prop_keys(scene, objects):
    for frame in range(1,END+1):
        scene.frame_set(frame)
        for obj, path, depth in objects:
            obj.location = (*position(path,frame),depth)
            obj.keyframe_insert("location",frame=frame,group="Recuzită")
    for obj,_,_ in objects:
        for curve in obj.animation_data.action.fcurves:
            for key in curve.keyframe_points:
                key.interpolation = "LINEAR"


def create_mother_action(scene, character, kind, bake_shapes):
    rig, coll = character["rig"],character["collection"]
    p = character["p"]
    for obj in list(coll.objects):
        if obj.type == "MESH" and obj.name.endswith((" · L", " · R")) and (
                obj.parent_bone.startswith("hand.") or any(m.type == "ARMATURE" for m in obj.modifiers)):
            bpy.data.objects.remove(obj,do_unlink=True)

    stand(character,1)
    for frame,bow,tilt,mouth,eyes in FACE[kind]:
        head(rig,frame,bow,tilt)
        prop(rig,"mouth_pose",frame,mouth)
        prop(rig,"eye_pose",frame,eyes)
    breathing(character,1,END)

    objects = []
    if kind == "cana":
        furniture(coll,0)
        objects.append((cup_model(coll),CUP,.055))
    if kind == "paine":
        tray_coll = bpy.data.collections.new("Pâinea și talerul")
        coll.children.link(tray_coll)
        for obj in loaf_model(tray_coll):
            objects.append((obj,TRAY,.75))
        furniture(coll,-.22)
    if kind == "traista":
        bag_model(coll)
    for obj,_,_ in objects:
        obj.parent = rig
    for obj in coll.objects:
        if obj.type == "MESH" and obj.name in {"Masă de lemn", "Traistă pentru școală"}:
            obj.parent = rig
    if objects:
        prop_keys(scene,objects)
    tracks = TRACKS[kind]
    for side in ("R","L"):
        sign = -1 if side == "R" else 1
        shape, tip, keys = tracks.get(side,("deschisa",.125,[
            (1,"rest",20*sign,.87,.12),(END,"rest",20*sign,.87,.12)
        ]))
        values = list(arm_samples(scene,rig,p,side,keys,tip,kind in {"paine", "cana"}))
        sleeve, coords = sleeve_model(coll,p,values[0][1],side=side,sign=sign)
        palm = hand_model(coll,p,side) if shape == "deschisa" else specialised_hand(coll,p,side,shape)
        mesh_coords = [tuple(v.co) for v in palm.data.vertices]
        for obj in (sleeve,palm):
            obj.parent = rig
        front = .88 if side in tracks else .616
        if kind == "ras":
            front = .94 if side in tracks else front
        if kind == "cana":
            front = .89 if side in tracks else front
        if kind == "paine":
            front = .96
        def cloth_points(rows):
            for u,v,dz in coords:
                xyz = sample_sleeve(rows,u,v,dz,sign)
                yield (xyz[0],xyz[1],xyz[2]+(front-.616)*ease((v-5)/(len(rows)-6)))
        bake_shapes(sleeve,[(frame,list(cloth_points(rows))) for frame,rows,*_ in values])
        bake_shapes(palm,[(frame,list(hand_points(mesh_coords,w,d,flex,thumb,sign,front,
                                                 flex_power=.26 if shape != "deschisa" else 1)))
                          for frame,_,w,d,flex,thumb in values])

    if kind == "batic":
        scarf = next(obj for obj in coll.objects if obj.name.endswith("Hair silhouette"))
        bend_scarf(scarf,p,bake_shapes)
    if kind == "cearta":
        furrow_brows(coll)

    finish_action(rig,character["action"])
    scene.frame_set(1)
    print("MAMA_GEST",kind,END,flush=True)
