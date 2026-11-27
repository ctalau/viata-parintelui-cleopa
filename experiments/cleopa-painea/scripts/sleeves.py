"""Blended cloth from the bodice through the elbow and cuff."""
from bisect import bisect_right
from math import ceil

import bpy

from build_characters import INK, RED, attach, embroidery
from hands import HAND_POSES, draw_hand
from vector_art import Art, material


def ease(value):
    t = min(1, max(0, value))
    return t*t*(3-2*t)


def bind_cloth(obj, rig, side, shoulder, upper, length, cuff_on_forearm=False, islands=None):
    """Keep the sleeve cap on the bodice and blend the moving joints.

    With 2.5D hands (`cuff_on_forearm`) the cuff follows the forearm rigidly and
    the drawn palm turns inside it: blending the cuff towards the hand bone folds
    its inner side whenever the wrist bends (verify_palme25d, check 5)."""
    bones = ("chest","shoulder."+side,"upper_arm."+side,"forearm."+side,"hand."+side)
    groups = [obj.vertex_groups.new(name=bone) for bone in bones]
    transition = upper*.34
    for vertex in obj.data.vertices:
        distance = shoulder-vertex.co.y
        shoulder_blend = ease((distance+.035)/(.50*upper))
        cap_blend = ease((distance-.045)/(.53*upper))
        elbow = ease((distance-upper+transition)/(2*transition))
        cuff = ease((distance-length+.158)/.150)
        chest = (1-shoulder_blend)*(1-cuff)
        cap = shoulder_blend*(1-cap_blend)*(1-cuff)
        arm = shoulder_blend*cap_blend*(1-cuff)
        if islands is not None:
            # Two cut-out pieces: the upper sleeve stays rigid on the upper arm
            # past the elbow, the forearm piece is rigid on the forearm.
            if islands[vertex.index]:
                weights = (0,0,0,1,0)
            else:
                # The upper piece turns rigidly about the shoulder pivot, like a
                # cut-out arm under the bodice. Blending its cap into the static
                # bodice shears the narrow dome inside out once the arm swings.
                weights = (0,0,1,0,0)
        elif cuff_on_forearm:
            weights = (chest,cap,arm*(1-elbow),arm*elbow+cuff,0)
        else:
            weights = (chest,cap,arm*(1-elbow),arm*elbow,cuff)
        for group,weight in zip(groups,weights):
            if weight > 0:
                group.add([vertex.index],weight,"REPLACE")
    obj.parent = rig
    skin = obj.modifiers.new("Piele de mânecă · umăr, cot și manșetă","ARMATURE")
    skin.object = rig
    skin.use_deform_preserve_volume = True


def width_at(distance, distances, widths):
    index = min(len(distances)-2, bisect_right(distances,distance)-1)
    portion = (distance-distances[index])/(distances[index+1]-distances[index])
    return widths[index]+(widths[index+1]-widths[index])*ease(portion)


def sleeve(profile, rig, coll, side, sign):
    x = sign*profile["shoulder_x"]
    top = profile["shoulder_y"]
    upper, lower = profile["upper"], profile["lower"]
    end = upper+lower
    width = profile["body"]*.44
    near, far = (.104,.63) if side=="R" else (.089,.56)

    distances = (-.159,-.136,-.102,-.045,.060,upper*.30,upper*.71,upper,
                 upper+lower*.27,upper+lower*.54,end-.15,end-.035,end+.012,end+.027)
    widths = (.22,.55,.81,.93,.98,1,.92,.83,.87,.83,.73,.69,.62,.44)
    split = profile.get("palme25d", False)
    overlap = .10
    extra = {upper-overlap, upper+overlap} if split else set()
    rows = sorted(set(distances) | {end-.156,end-.134,end-.017} | extra)
    samples = [rows[0]]
    for a,b in zip(rows,rows[1:]):
        count = ceil((b-a)/.048)
        samples.extend(a+(b-a)*i/count for i in range(1,count+1))

    vertices, faces, color_indices, island_of = [], [], [], []
    # The shoulder sits under the bodice. The cuff and wrist stay on the face
    # side of the sleeve so the hand and book can overlap consistently.
    def depth(distance):
        advance = ease((distance-upper*.37)/(upper*.69))
        body = near+(far-near)*(.95*advance+.05*ease(distance/end))
        return body+.032*ease((distance-end+.054)/.060)

    # With 2.5D arms the projected elbow can fold the forearm back over the upper
    # arm (the hand at the cheek). One skinned strip would turn its inner side
    # inside out there, so the sleeve becomes two overlapping cut-out pieces in the
    # same mesh: the forearm piece sits in front, with a rounded, inked top edge.
    if split:
        lift = depth(upper+overlap)-depth(upper-overlap)+.006
        pieces = [([d for d in samples if d <= upper+overlap+1e-9], 0, 0.),
                  ([d for d in samples if d >= upper-overlap-1e-9], 1, lift)]
    else:
        pieces = [(samples, 0, 0.)]

    columns = 5
    for piece, island, lift in pieces:
        first = len(vertices)
        for distance in piece:
            radius = width*width_at(distance,distances,widths)
            if split:
                # Rounded ends where the two pieces overlap at the elbow.
                if island:
                    radius *= .62+.38*ease((distance-upper+overlap)/(.9*overlap))
                else:
                    radius *= .62+.38*ease((upper+overlap-distance)/(.9*overlap))
            border = min(.021,radius*.28)
            offsets = (-radius,-radius+border,-radius*.72,radius-border,radius)
            # Sink the inboard edge into the bodice while the outer edge follows the cap.
            inward = .09*(1-ease((distance+.10)/(.54*upper)))
            for offset in offsets:
                vertices.append((x+sign*(offset-inward),top-distance,depth(distance)+lift))
                island_of.append(island)
        for row,(a,b) in enumerate(zip(piece,piece[1:])):
            length = (a+b)*.5
            for column in range(columns-1):
                index = first+row*columns+column
                face = (index,index+1,index+columns+1,index+columns)
                faces.append(face if sign < 0 else face[::-1])
                if (column in (0,columns-2) or row in (0,len(piece)-2)
                        or end-.156 < length < end-.134 or length > end-.017):
                    color_indices.append(0)
                elif length >= end-.134:
                    color_indices.append(3)
                elif column == 1:
                    color_indices.append(2)
                else:
                    color_indices.append(1)

    name = "Mânecă continuă · "+side
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices,[],faces)
    for swatch in (INK,profile["shirt"],profile["shade"],"f6dfb7"):
        mesh.materials.append(material(swatch))
    mesh.polygons.foreach_set("material_index", color_indices)
    mesh.update()
    obj = bpy.data.objects.new(name,mesh)
    coll.objects.link(obj)
    bind_cloth(obj,rig,side,top,upper,end,split,island_of if split else None)

    # The cuff stitches share the forearm deformation. The other embroidered
    # strip stays on the upper sleeve, above the soft bend.
    cuff = Art("Cusătură la manșetă · "+side,coll,
               (x,top-end+.083),(width,1),z=far+.008)
    for stitch in range(-2,3):
        cuff.diamond(stitch*.231,0,.071,.026,RED)
    bind_cloth(cuff.finish(),rig,side,top,upper,end,profile.get("palme25d",False))
    if profile.get("scarf"):
        at = upper*.32
        band = Art("Broderie pe braț · "+side,coll,
                   (x,top-at),(width,.18),z=depth(at)+.062)
        band.line("M -.76 .19 Q 0 .03 .77 .20",RED,.040)
        for index in range(-2,3):
            embroidery(band,index*.32,-.21,1.5)
        bind_cloth(band.finish(),rig,side,top,upper,end,profile.get("palme25d",False))
    return far


def continuous_sleeves(profile, rig, coll):
    variants = {}
    for side,sign in (("R",-1),("L",1)):
        depth = sleeve(profile,rig,coll,side,sign)
        x = sign*profile["shoulder_x"]
        y = profile["shoulder_y"]-profile["upper"]-profile["lower"]
        for pose in HAND_POSES:
            art = Art(pose+" hand · "+side,coll,(x,y),
                      (profile["hand"]*sign,profile["hand"]),z=depth+.016)
            draw_hand(art,profile,pose)
            variants[side,pose] = attach(art,rig,"hand."+side)
    return variants
