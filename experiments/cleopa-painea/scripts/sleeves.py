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


def bind_cloth(obj, rig, side, shoulder, upper, length):
    """Keep the sleeve cap on the bodice and blend the moving joints."""
    bones = ("chest","upper_arm."+side,"forearm."+side,"hand."+side)
    groups = [obj.vertex_groups.new(name=bone) for bone in bones]
    transition = upper*.34
    for vertex in obj.data.vertices:
        distance = shoulder-vertex.co.y
        shoulder_blend = ease((distance-.018)/(.37*upper))
        elbow = ease((distance-upper+transition)/(2*transition))
        cuff = ease((distance-length+.158)/.150)
        arm = shoulder_blend*(1-cuff)
        weights = (1-shoulder_blend,arm*(1-elbow),arm*elbow,cuff)
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

    distances = (-.103,-.085,-.061,-.025,.055,upper*.30,upper*.71,upper,
                 upper+lower*.27,upper+lower*.54,end-.15,end-.035,end+.012,end+.027)
    widths = (.15,.50,.74,.88,.97,1,.92,.83,.87,.83,.73,.69,.62,.44)
    rows = sorted(set(distances) | {end-.156,end-.134,end-.017})
    samples = [rows[0]]
    for a,b in zip(rows,rows[1:]):
        count = ceil((b-a)/.048)
        samples.extend(a+(b-a)*i/count for i in range(1,count+1))

    vertices, faces, color_indices = [], [], []
    # The shoulder sits under the bodice. The cuff and wrist stay on the face
    # side of the sleeve so the hand and book can overlap consistently.
    def depth(distance):
        advance = ease((distance-upper*.37)/(upper*.69))
        body = near+(far-near)*(.95*advance+.05*ease(distance/end))
        return body+.032*ease((distance-end+.054)/.060)

    columns = 5
    for distance in samples:
        radius = width*width_at(distance,distances,widths)
        border = min(.021,radius*.28)
        offsets = (-radius,-radius+border,-radius*.72,radius-border,radius)
        z = depth(distance)
        for offset in offsets:
            vertices.append((x+sign*offset,top-distance,z))
    for row,(a,b) in enumerate(zip(samples,samples[1:])):
        length = (a+b)*.5
        for column in range(columns-1):
            index = row*columns+column
            face = (index,index+1,index+columns+1,index+columns)
            faces.append(face if sign < 0 else face[::-1])
            if (column in (0,columns-2) or row in (0,len(samples)-2)
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
    bind_cloth(obj,rig,side,top,upper,end)

    # The cuff stitches share the forearm deformation. The other embroidered
    # strip stays on the upper sleeve, above the soft bend.
    cuff = Art("Cusătură la manșetă · "+side,coll,
               (x,top-end+.083),(width,1),z=far+.008)
    for stitch in range(-2,3):
        cuff.diamond(stitch*.231,0,.071,.026,RED)
    bind_cloth(cuff.finish(),rig,side,top,upper,end)
    if profile.get("scarf"):
        at = upper*.32
        band = Art("Broderie pe braț · "+side,coll,
                   (x,top-at),(width,.18),z=depth(at)+.062)
        band.line("M -.76 .19 Q 0 .03 .77 .20",RED,.040)
        for index in range(-2,3):
            embroidery(band,index*.32,-.21,1.5)
        bind_cloth(band.finish(),rig,side,top,upper,end)
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
