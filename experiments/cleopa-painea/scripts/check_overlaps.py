"""Check head and hand overlaps in the active Blender cameras."""
import argparse
from collections import defaultdict
from itertools import combinations
import json
from pathlib import Path
from typing import NamedTuple
import sys

import bpy
from mathutils import Vector
from mathutils.geometry import convex_hull_2d


HEAD_MESHES = ("Face", "Hair silhouette", "Front hair", "Ears", "Căciulă de miel")
DEPTH_CLEARANCE = .035


class ProjectedPart(NamedTuple):
    label: str
    rig: str
    role: str
    polygon: list
    rectangle: tuple
    surface: float
    depth: tuple


def area(points):
    edges = zip(points, points[1:] + points[:1])
    return sum(a.x*b.y - a.y*b.x for a,b in edges)*.5


def bounds(points):
    return (min(p.x for p in points),min(p.y for p in points),
            max(p.x for p in points),max(p.y for p in points))


def intersects(a,b):
    return a[0]<b[2] and a[2]>b[0] and a[1]<b[3] and a[3]>b[1]


def clip(points, boundary):
    """Clip one convex polygon to another counterclockwise polygon."""
    for a,b in zip(boundary,boundary[1:]+boundary[:1]):
        if not points:
            break
        line=b-a
        output=[]
        previous=points[-1]
        dist=line.cross(previous-a)
        for point in points:
            following=line.cross(point-a)
            if (dist>=0) != (following>=0):
                output.append(previous.lerp(point,dist/(dist-following)))
            if following>=0:
                output.append(point)
            previous,dist=point,following
        points=output
    return points


def silhouette(parts, camera):
    planar=[]
    depths=[]
    graph=bpy.context.evaluated_depsgraph_get()
    for part in parts:
        transform=camera @ part.matrix_world
        # Volumetric hands are shape-keyed in the rig's space; read the evaluated mesh.
        mesh=part.evaluated_get(graph).data if part.data.shape_keys else part.data
        for vert in mesh.vertices:
            point=transform @ vert.co
            planar.append(Vector((point.x,point.y)))
            depths.append(-point.z)
    if len(planar)<3:
        return None
    hull=[planar[index] for index in convex_hull_2d(planar)]
    if len(hull)<3:
        return None
    if area(hull)<0:
        hull.reverse()
    return hull,(min(depths),max(depths))


def characters(scene):
    groups=[]
    for rig in (obj for obj in scene.objects if obj.type=="ARMATURE"):
        coll=bpy.data.collections[rig.name[4:]]
        parts=defaultdict(list)
        for obj in coll.objects:
            if obj.type!="MESH":
                continue
            if obj.parent_bone=="head" and any(text in obj.name for text in HEAD_MESHES):
                parts["head"].append(obj)
            elif obj.parent_bone in ("hand.R","hand.L"):
                parts[obj.parent_bone].append(obj)
            elif obj.get("cleopa_bone") in ("hand.R","hand.L"):
                parts[obj["cleopa_bone"]].append(obj)
        if parts["head"]:
            groups.append((rig,parts))
    return groups


def visible_shapes(scene,groups):
    cam=scene.camera
    inverse=cam.matrix_world.inverted()
    view=cam.data.view_frame(scene=scene)
    left=min(p.x for p in view)
    right=max(p.x for p in view)
    bottom=min(p.y for p in view)
    top=max(p.y for p in view)
    boundary=[Vector(p) for p in ((left,bottom),(right,bottom),(right,top),(left,top))]
    shapes=[]
    for rig,parts in groups:
        point=inverse @ rig.matrix_world.translation
        if not left-4 <= point.x <= right+4:
            continue
        for role,objects in parts.items():
            shape=silhouette([obj for obj in objects if not obj.hide_render],inverse)
            if shape is None:
                continue
            polygon,depth=shape
            if intersects(bounds(polygon),(left,bottom,right,top)):
                polygon=clip(polygon,boundary)
                surface=area(polygon)
                if surface>.001:
                    shapes.append(ProjectedPart(
                        f"{rig.name[4:]} / {role}",rig.name,role,
                        polygon,bounds(polygon),surface,depth,
                    ))
    return shapes,(right-left)*(top-bottom)


def overlaps(shapes,viewport):
    for first,second in combinations(shapes,2):
        roles = (first.role,second.role)
        if first.rig == second.rig and "head" in roles:
            continue
        if not intersects(first.rectangle,second.rectangle):
            continue
        shared = area(clip(first.polygon,second.polygon))
        fraction = shared/min(first.surface,second.surface)
        if shared/viewport < .000025 or fraction < .045:
            continue

        gap = max(first.depth[0]-second.depth[1],second.depth[0]-first.depth[1])
        near_depth = gap < DEPTH_CLEARANCE
        if roles == ("head","head"):
            issue = "heads_overlap"
        elif "head" not in roles:
            issue = "hands_same_depth" if near_depth else "hands_overlap"
        elif near_depth:
            issue = "hand_head_same_depth"
        else:
            hand,head = (first,second) if second.role=="head" else (second,first)
            issue = "hand_behind_head" if hand.depth[0]>head.depth[1] else "hand_in_front_of_head"
        yield issue,sorted((first.label,second.label)),round(fraction,4)


def scan(scene, step, allowed):
    groups=characters(scene)
    report=[]
    active={}
    for frame in range(scene.frame_start,scene.frame_end+1,step):
        scene.frame_set(frame)
        camera=scene.camera.name
        shapes,viewport=visible_shapes(scene,groups)
        for kind,parts,fraction in overlaps(shapes,viewport):
            if any(kind==rule["kind"] and parts==sorted(rule["parts"])
                   and camera==rule["camera"] and rule["start"]<=frame<=rule["end"]
                   for rule in allowed):
                continue
            key=(kind,camera,*parts)
            event=active.get(key)
            if event and frame-event["end"]==step:
                event["end"]=frame
                event["largest_overlap"]=max(event["largest_overlap"],fraction)
            else:
                event={"kind":kind,"camera":camera,"parts":parts,"start":frame,
                       "end":frame,"largest_overlap":fraction}
                report.append(event)
                active[key]=event
    return report


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--step",type=int)
    parser.add_argument("--allow",type=Path,help="JSON with kind, camera, parts, start, end and reason.")
    parser.add_argument("--json",type=Path)
    parser.add_argument("--report-only",action="store_true")
    args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    scene=bpy.context.scene
    step=args.step or scene.frame_step
    if step<1:
        parser.error("--step trebuie să fie pozitiv")
    allowed=json.loads(args.allow.read_text()) if args.allow else []
    fields = {"kind","camera","parts","start","end","reason"}
    if not isinstance(allowed,list):
        parser.error("Fișierul de excepții trebuie să conțină o listă JSON.")
    for rule in allowed:
        if (not isinstance(rule,dict) or not fields.issubset(rule)
                or not isinstance(rule["reason"],str) or not rule["reason"].strip()):
            parser.error("Fiecare excepție are nevoie de un interval, două piese și o explicație.")
    report=scan(scene,step,allowed)
    if args.json:
        args.json.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    for event in report:
        print(f"{event['start']:04d}–{event['end']:04d} {event['camera']} "
              f"{event['kind']} · {' × '.join(event['parts'])} · {event['largest_overlap']:.0%}")
    if report and not args.report_only:
        raise RuntimeError(f"{len(report)} intervale cu suprapuneri între personaje.")
    print("OVERLAPS",len(report),"intervale",flush=True)


if __name__=="__main__":
    main()
