"""Two independent arm constructions for the Mother's seven performances."""
import json
from math import atan2, cos, pi, radians, sin, sqrt, tau
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

from build_episode import breathing, finish_action, head, prop
from mother_actions import (
    ACTIONS, CUP, END, FACE, TRACKS, TRAY, bag_model, bend_scarf, cup_model,
    furniture, furrow_brows, interval, landmarks, loaf_model, prop_keys,
    specialised_hand,
)
from mother_stress import hand_model, hand_points
from vector_art import material

SIGN = {"R": -1, "L": 1}
INK = "3a2925"
FORWARD = Vector((0, 0, 1))
BONE_NAMES = ("upper_arm", "forearm", "hand")


def unit(angle):
    return Vector((sin(angle), -cos(angle)))


def angle_of(v):
    return atan2(v.x, -v.y)


def wrapped(value):
    return (value+pi)%tau-pi


def turn(start, end, t):
    return start+wrapped(end-start)*t


def across(v):
    return Vector((-v.y, v.x))


def point_on_screen(v, width, center):
    return [round(.5+(v.x-center[0])/width,6),
            round(.5-(v.y-center[1])/(width*9/16),6), round(v.z,5)]


def targets(profile, rig, frame):
    result = landmarks(profile,rig,frame)
    # Contacts near the named shoulder use the visible outer curve of the sleeve.
    sx,sy = profile["shoulder_x"],profile["shoulder_y"]
    result.update({
        "umar-drept":Vector((-sx-.13,sy-.078)),
        "umar-stang":Vector((sx+.065,sy-.075)),
        "piept":Vector((.035,sy-.65)),
    })
    return result


def rest_arm(profile, side):
    sign = SIGN[side]
    origin = Vector((sign*profile["shoulder_x"],profile["shoulder_y"],.23))
    upper = unit(radians(5*sign))
    fore = unit(radians(13*sign))
    elbow = origin+Vector((*upper,0))*profile["upper"]
    wrist = elbow+Vector((*fore,0))*profile["lower"]
    return origin,elbow,wrist,radians(15*sign)


def two_bone(distance, lengths):
    a,b = lengths
    along = (a*a-b*b+distance*distance)/(2*distance)
    return along,sqrt(max(0,a*a-along*along))


def planar_contact(origin, point, angle, tip, lengths, bend_sign, prior):
    """Fixed lengths and one signed hinge for the entire planar gesture."""
    a,b = lengths
    best = None
    for degrees in range(-180,181,3):
        palm = angle+radians(degrees)
        desired = point-unit(palm)*tip
        delta = desired-origin
        radius = max(.32,min(delta.length,a+b-.008))
        axis = delta.normalized()
        along,away = two_bone(radius,lengths)
        elbow = origin+axis*along+across(axis)*(away*bend_sign)
        wrist = origin+axis*radius
        upper = angle_of(elbow-origin)
        fore = angle_of(wrist-elbow)
        pose = (upper,wrapped(fore-upper),wrapped(palm-fore))
        continuity = sum(abs(wrapped(v-p)) for v,p in zip(pose,prior))
        score = (abs(delta.length-radius)*32
                 + max(0,abs(pose[2])-radians(40))*13
                 + abs(radians(degrees))*.58 + continuity*.67)
        if best is None or score < best[0]:
            best = score,pose
    return best[1]


def planar_path(scene, rig, profile, kind, side, keys, tip):
    origin,e,w,palm = rest_arm(profile,side)
    arm_axis,fore_axis = angle_of(e-origin),angle_of(w-e)
    bend_sign = SIGN[side] if kind in {"paine","cana","traista","cearta"} else -SIGN[side]
    rest = arm_axis,-bend_sign*abs(wrapped(fore_axis-arm_axis)),wrapped(palm-fore_axis)
    if kind == "cruce" and side == "R":
        # The outward arc stays on the same side of the elbow hinge. Spatial
        # motion can pass in front of the shoulder, while a flat drawing needs room.
        keys = [(frame,(-1.75,1.12),-111,flex,spread) if frame == 25
                else (frame,target,aim,flex,spread) for frame,target,aim,flex,spread in keys]
    lengths=profile["upper"],profile["lower"]
    stops = {}
    previous = rest
    for frame,target,aim,*_ in keys:
        scene.frame_set(frame)
        if target == "rest":
            pose = rest
        else:
            point = targets(profile,rig,frame)[target] if isinstance(target,str) else Vector(target)
            pose = planar_contact(origin.xy,point,radians(aim),tip,lengths,bend_sign,previous)
        stops[frame] = pose
        previous = pose

    previous = rest
    for frame in range(1,END+1):
        scene.frame_set(frame)
        a,b,t = interval(keys,frame)
        angles = tuple(turn(x,y,t) for x,y in zip(stops[a[0]],stops[b[0]]))
        if isinstance(a[1],str) and a[1] == b[1] and a[1] != "rest":
            point=targets(profile,rig,frame)[a[1]]
            angles=planar_contact(origin.xy,point,sum(angles),tip,lengths,bend_sign,angles)
        # Limit the total motion of the two segments during moving contacts,
        # especially when their rotation would compound at the wrist.
        changes = tuple(wrapped(goal-old) for goal,old in zip(angles,previous))
        travel = abs(changes[0])*sum(lengths)+abs(changes[1])*lengths[1]
        weight = min(1.,.223/max(.223,travel),radians(13)/max(radians(13),abs(changes[2])))
        angles = tuple(old+change*weight for old,change in zip(previous,changes))
        previous = angles
        upper,bend,turning = angles
        if bend*bend_sign > .001:
            raise RuntimeError(f"Cotul a schimbat axa la {kind}, {side}, cadrul {frame}")
        elbow = origin+Vector((*unit(upper),0))*lengths[0]
        wrist = elbow+Vector((*unit(upper+bend),0))*lengths[1]
        yield (frame,origin,elbow,wrist,Vector((*unit(upper+bend+turning),0)),
               a[3]+t*(b[3]-a[3]),a[4]+t*(b[4]-a[4]))


def space_path(scene, rig, profile, kind, side, keys, tip):
    origin,_,rest_wrist,rest_angle=rest_arm(profile,side)
    lengths=profile["upper"],profile["lower"]
    side_sign = SIGN[side]
    prior = rest_angle
    previous_wrist = rest_wrist
    previous_pole = None

    def elbow_for(wrist, follow=None):
        offset=wrist-origin
        axis=offset.normalized()
        length,away=two_bone(offset.length,lengths)
        pole=Vector((1.05*side_sign,-.49,-.68))
        bend=(pole-axis*pole.dot(axis)).normalized()
        if follow is not None:
            transported=(follow-axis*follow.dot(axis)).normalized()
            if transported.length > .8:
                signed=atan2(axis.dot(transported.cross(bend)),transported.dot(bend))
                limit=radians(9)
                bend=Quaternion(axis,max(-limit,min(limit,signed)))@transported
        return origin+axis*length+bend*away,bend

    for frame in range(1,END+1):
        scene.frame_set(frame)
        a,b,t=interval(keys,frame)
        contact=targets(profile,rig,frame)
        contact["rest"]=(rest_wrist+Vector((*unit(rest_angle),0))*tip).xy
        p=contact[a[1]] if isinstance(a[1],str) else Vector(a[1])
        q=contact[b[1]] if isinstance(b[1],str) else Vector(b[1])
        point=p.lerp(q,t)
        aimed=turn(radians(a[2]),radians(b[2]),t)
        if a[1] == "rest" and b[1] == "rest":
            aimed=rest_angle
        lift=(0 if a[1]=="rest" else 1)*(1-t)+(0 if b[1]=="rest" else 1)*t
        max_depth=.61 if kind in {"cruce","ras","batic"} else .69

        def solve(palm):
            wrist_xy=point-unit(palm)*tip
            delta=wrist_xy-origin.xy
            wanted=delta.length
            limit=sum(lengths)-.013
            if wanted>limit:
                delta*=limit/wanted
            z_span=sqrt(max(0,limit*limit-delta.length_squared))
            z=min(max_depth*lift,z_span)
            offset=Vector((*delta,z))
            if offset.length < .12:
                offset.z=.12
            wrist=origin+offset
            elbow,_=elbow_for(wrist,previous_pole)
            fore=(wrist-elbow).normalized()
            # Room for a natural flexion, without a wrist turning back over the forearm.
            divergence=Vector((*unit(palm),0)).angle(fore)
            return elbow,wrist,max(0,wanted-limit),divergence

        # Track the previous palm orientation across the arc; the elbow pole
        # remains the same throughout the performance.
        def cost(palm):
            e,w,residual,divergence=solve(palm)
            difference=abs(wrapped(palm-prior))
            return (42*residual+max(0,divergence-radians(55))*3.9
                    +abs(wrapped(palm-aimed))*.75+difference*.74
                    +max(0,difference-radians(7))*9,palm,e,w)

        _,palm,elbow,wrist=min((cost(prior+radians(d))
                              for d in range(-9,10)),key=lambda item:item[0])
        # Cap the change in depth as well as XY when the target grazes full reach.
        move=wrist-previous_wrist
        if move.length > .135:
            wrist=previous_wrist+move.normalized()*.135
        if (wrist-origin).length < .115:
            wrist.z=origin.z+.115
        elbow,previous_pole=elbow_for(wrist,previous_pole)
        previous_wrist=wrist
        prior=palm
        forward=Vector((*unit(palm),.11*lift))
        yield (frame,origin,elbow,wrist,forward.normalized(),
               a[3]+t*(b[3]-a[3]),a[4]+t*(b[4]-a[4]))


class Mesh:
    def __init__(self):
        self.vertices=[]
        self.faces=[]
        self.colors=[]

    def add(self, points, faces, colors):
        start=len(self.vertices)
        self.vertices.extend(points)
        self.faces.extend([tuple(start+i for i in face) for face in faces])
        self.colors.extend(colors)

    def object(self,name,palette,collection,rig):
        mesh=bpy.data.meshes.new(name)
        mesh.from_pydata(self.vertices,[],self.faces)
        for color in palette:
            mesh.materials.append(material(color))
        mesh.polygons.foreach_set("material_index",self.colors)
        mesh.update()
        obj=bpy.data.objects.new(name,mesh)
        collection.objects.link(obj)
        obj.parent=rig
        return obj


def disk(mesh, center, r, z, color):
    points=[(center.x+r*cos(i*tau/24),center.y+r*sin(i*tau/24),z) for i in range(24)]
    mesh.add(points,[tuple(range(24))],[color])


def strip(mesh,start,end,widths,z,color):
    normal=across((end-start).normalized())
    l,r=widths
    points=(start-normal*l,end-normal*r,end+normal*r,start+normal*l)
    mesh.add([(*p,z) for p in points],[(0,1,2,3)],[color])


def planar_sleeve(s,e,w):
    """Rounded overlapping fills give one silhouette at the elbow."""
    mesh=Mesh()
    s,e,w=s.xy,e.xy,w.xy
    f=(w-e).normalized()
    end=w+f*.026
    # The shared contour sits under both fills. There is no dark seam through the elbow.
    for z,edge,c in ((.60,.018,0),(.623,0,1)):
        strip(mesh,s,e,(.190+edge,.151+edge),z,c)
        strip(mesh,e,end,(.151+edge,.099+edge),z,c)
        for center,width in ((s,.190),(e,.151)):
            disk(mesh,center,width+edge,z,c)
    strip(mesh,w-f*.139,w+f*.027,(.107,.098),.642,0)
    strip(mesh,w-f*.122,w+f*.018,(.095,.087),.651,3)
    u=(e-s).normalized()
    n=across(u)
    for t in (.16,.195):
        center=s+u*t
        strip(mesh,center-n*.167,center+n*.167,(.008,.008),.635,4)
    return mesh


RADIAL=10


def tube(mesh,start,end,sections,c,flat=1.0):
    v=(end-start).normalized()
    n=Vector(v.cross(FORWARD))
    if n.length < .01:
        n=v.cross(Vector((0,1,0)))
    n.normalize()
    b=n.cross(v).normalized()
    vertices=[]
    for t,r in sections:
        center=start.lerp(end,t)
        for i in range(RADIAL):
            angle=i*tau/RADIAL
            vertices.append(center+(n*cos(angle)+b*(sin(angle)*flat))*r)
    faces=[tuple(reversed(range(RADIAL)))]
    colors=[c]
    for ring in range(len(sections)-1):
        for side in range(RADIAL):
            i,j=ring*RADIAL+side,ring*RADIAL+(side+1)%RADIAL
            faces.append((i,j,j+RADIAL,i+RADIAL))
            colors.append(c+1 if side in (0,1,8,9) else c)
    faces.append(tuple(range((len(sections)-1)*RADIAL,len(sections)*RADIAL)))
    colors.append(c)
    mesh.add(vertices,faces,colors)


def volume_sleeve(s,e,w):
    mesh=Mesh()
    tube(mesh,s,e,((-.17,.058),(-.08,.146),(.06,.195),(.35,.187),(.79,.15),(1.04,.148),(1.19,.08)),1)
    tube(mesh,e,w,((-.16,.077),(-.07,.145),(.08,.152),(.41,.139),(.76,.114),(.98,.105),(1.02,.093)),1)
    f=(w-e).normalized()
    tube(mesh,w-f*.14,w+f*.018,((0,.113),(.15,.116),(.95,.105),(1,.095)),3)
    u=(e-s).normalized()
    tube(mesh,s+u*.148,s+u*.176,((0,.192),(1,.191)),5)
    return mesh


def volume_hand(w,d,side,style,flex,spread):
    """Palm and five fingers have sealed cross sections and independent flexion."""
    mesh=Mesh()
    n=Vector((-d.y,d.x,0)).normalized()*SIGN[side]
    b=d.cross(n).normalized()*SIGN[side]
    # Face the camera in the relaxed pose and roll a little with the thumb.
    roll=.12+.29*spread
    cross=n*cos(roll)+b*sin(roll)
    inward=d.cross(cross).normalized()
    if inward.z>0:
        inward=-inward

    def local(x,y,z=0):
        return w+cross*x+d*y+inward*z

    tube(mesh,local(0,-.04),local(0,.195),
         ((0,.060),(.21,.071),(.46,.092),(.76,.107),(1,.083)),0,.68)
    for i,(x,length) in enumerate(zip((-.067,-.019,.032,.079),(.155,.183,.167,.124))):
        if style=="aratator":
            curl = .10+.16*flex if i == 0 else .91
        elif style=="cruce":
            curl = .11 if i < 2 else .94
        elif style=="pumn":
            curl = .60+.32*flex
        elif style=="prindere":
            curl = .32 if i == 0 else .79
        else:
            curl = .18+.71*flex
        base=local(x,.145 if i==3 else .171)
        fan = x * 1.65 * spread
        axis = d * cos(fan) + cross * sin(fan)
        proximal, distal = radians(53) * curl, radians(117) * curl
        middle = base + (axis * cos(proximal) + inward * sin(proximal)) * (length * .54)
        tip = middle + (axis * cos(distal) + inward * sin(distal)) * (length * .46)
        radius=.025 if i==3 else .032
        tube(mesh,base,middle,((-.09,radius*.78),(0,radius),(1.13,radius*.87)),0,.82)
        tube(mesh,middle,tip,((-.14,radius*.83),(.5,radius*.81),(.88,radius*.62),(1,.013)),0,.83)

    root = local(-.075, .067)
    opening = radians(30 + 27 * spread)
    middle = root + (d * cos(opening) - cross * sin(opening)) * .092
    if style in {"cruce","prindere"}:
        aim = (d * .86 + cross * .47 + inward * .22).normalized()
    else:
        aim = (d * .74 - cross * (.20 + .55 * spread) + inward * (.28 + .40 * flex)).normalized()
    end = middle + aim * .112
    tube(mesh,root,middle,((-.1,.034),(.26,.046),(1.1,.037)),0,.78)
    tube(mesh,middle,end,((-.09,.037),(.53,.033),(.88,.026),(1,.012)),0,.82)
    return mesh


def rig_matrices(rig, side, frame, shoulder, elbow, wrist, palm, previous):
    parent = rig.pose.bones["chest"]
    parent_matrix = parent.matrix.copy()
    for name,point,vector in zip(BONE_NAMES,(shoulder,elbow,wrist),(elbow-shoulder,wrist-elbow,palm)):
        bone=rig.pose.bones[name+"."+side]
        y=vector.normalized()
        x=y.cross(FORWARD)
        if x.length < .001:
            x=y.cross(Vector((0,1,0)))
        x.normalize()
        z=x.cross(y).normalized()
        transform=Matrix((x,y,z)).transposed().to_4x4()
        transform.translation=point
        local=bone.bone.convert_local_to_pose(transform,bone.bone.matrix_local,
                      parent_matrix=parent_matrix,parent_matrix_local=parent.bone.matrix_local,invert=True)
        loc,rot,_=local.decompose()
        if name in previous:
            rot.make_compatible(previous[name])
        previous[name]=rot.copy()
        bone.rotation_mode="QUATERNION"
        bone.location=loc
        bone.rotation_quaternion=rot
        bone.scale=(1,1,1)
        for attribute in ("location","rotation_quaternion"):
            bone.keyframe_insert(attribute,frame=frame,group=f"Braț · {side}")
        parent,parent_matrix=bone,transform


def comparison_stage(scene, character, kind, volume, bake_shapes):
    rig,coll,p=character["rig"],character["collection"],character["p"]
    for obj in list(coll.objects):
        if obj.type == "MESH" and obj.name.endswith((" · L"," · R")) and (
                obj.parent_bone.startswith("hand.") or any(m.type=="ARMATURE" for m in obj.modifiers)):
            bpy.data.objects.remove(obj,do_unlink=True)
    for frame,bow,tilt,mouth,eyes in FACE[kind]:
        head(rig,frame,bow,tilt)
        prop(rig,"mouth_pose",frame,mouth)
        prop(rig,"eye_pose",frame,eyes)
    breathing(character,1,END)

    props=[]
    if kind=="cana":
        furniture(coll,0)
        props.append((cup_model(coll),CUP,.055))
    if kind=="paine":
        basket=bpy.data.collections.new("Pâinea și talerul")
        coll.children.link(basket)
        props.extend((obj,TRAY,.75) for obj in loaf_model(basket))
        furniture(coll,-.22)
    if kind=="traista":
        bag_model(coll)
    for obj in coll.all_objects:
        if obj.type=="MESH" and obj.parent is None:
            obj.parent=rig
    if props:
        prop_keys(scene,props)

    samples={}
    for side in ("R","L"):
        sign=SIGN[side]
        default=("deschisa",.125,((1,"rest",15*sign,.89,.12),(END,"rest",15*sign,.89,.12)))
        shape,tip,keys=TRACKS[kind].get(side,default)
        positions=list((space_path if volume else planar_path)(scene,rig,p,kind,side,keys,tip))
        geometry=volume_sleeve if volume else planar_sleeve
        sleeves=[]
        hand_frames=[]
        previous={}
        length_deviation=0.
        previous_pose=None
        max_step=0.
        if not volume:
            hand=hand_model(coll,p,side) if shape=="deschisa" else specialised_hand(coll,p,side,shape)
            hand.parent=rig
            drawing=[tuple(v.co) for v in hand.data.vertices]
        for frame,s,e,w,d,flex,spread in positions:
            scene.frame_set(frame)
            rig_matrices(rig,side,frame,s,e,w,d,previous)
            sleeve=geometry(s,e,w)
            sleeves.append((frame,sleeve.vertices))
            if volume:
                solid=volume_hand(w,d,side,shape,flex,spread)
                hand_frames.append((frame,solid.vertices))
            else:
                local_w=Vector((w.x*sign,w.y))
                forward=Vector((d.x*sign,d.y))
                hand_frames.append((frame,list(hand_points(drawing,local_w,forward,flex,spread,
                                                           sign,.636,.30 if shape!="deschisa" else 1))))
            length_deviation=max(length_deviation,abs((e-s).length-p["upper"]),abs((w-e).length-p["lower"]))
            if previous_pose:
                max_step=max(max_step,(w-previous_pose).length)
            previous_pose=w
        if length_deviation > .00002:
            raise RuntimeError(f"Scalare detectată la {kind} {side}: {length_deviation}")
        if max_step > .23:
            raise RuntimeError(f"Salt de încheietură la {kind} {side}: {max_step}")
        cloth=sleeve.object("Mânecă · "+side,(INK,p["shirt"],p["shade"],"f1d6a6","c68659","b76b55","a95647"),coll,rig)
        bake_shapes(cloth,sleeves)
        if volume:
            hand=solid.object("Palmă volumetrică · "+side,(p["skin"],p["skin_shadow"]),coll,rig)
        bake_shapes(hand,hand_frames)
        samples[side]=positions
        print("COMPARISON_OK",kind,"3D" if volume else "2D",side,len(positions),
              "length error",round(length_deviation,7),"wrist step",round(max_step,4),flush=True)

    if kind=="batic":
        scarf=next(obj for obj in coll.objects if obj.name.endswith("Hair silhouette"))
        bend_scarf(scarf,p,bake_shapes)
    if kind=="cearta":
        furrow_brows(coll)
    finish_action(rig,character["action"])
    # The evaluated discrete body/facial props keep their own timing. In the
    # arm bones all intermediate frames are authored and interpolation is linear.
    for curve in character["action"].fcurves:
        if curve.group and curve.group.name.startswith("Braț ·"):
            for key in curve.keyframe_points:
                key.interpolation="LINEAR"
    scene.frame_set(1)
    return samples


def write_projection(path, samples, camera, shift, mode):
    width=camera.data.ortho_scale
    center=camera.location.xy
    frames=[]
    for index,(r,l) in enumerate(zip(samples["R"],samples["L"])):
        if index%2:
            continue
        rows={}
        for side,pose in (("R",r),("L",l)):
            _,s,e,w,d,_,_=pose
            rows[side] = {
                name:point_on_screen(point+shift,width,center)
                for name,point in (("umar",s),("cot",e),("incheietura",w),("axa_palmei",w+d*.24))
            }
        frames.append({"frame":index+1,"time":round(index/24,6),"arms":rows})
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps({"fps":24,"step":2,"mode":mode,
                                "viewport":{"width":width,"aspect":16/9,
                                            "center":list(center),"units":"normalized xy, depth in Blender units"},
                                "frames":frames},ensure_ascii=False,separators=(",",":"))+"\n")
