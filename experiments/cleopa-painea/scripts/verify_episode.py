"""Verify the cuts, continuous stage, visibility and editable soundtrack in a reopened file."""
from math import atan2, cos, radians, sin
from pathlib import Path
import json
import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/"timeline.json").read_text())
source=ROOT/"scenes"/"painea_care_poate_sa_astepte.blend"
bpy.ops.wm.open_mainfile(filepath=str(source),load_ui=False)
scene=bpy.context.scene
assert (scene.frame_start,scene.frame_end,scene.frame_step,scene.render.fps)==(1,data["end"],2,24)
story = json.loads((ROOT/"scenariu.json").read_text())
assert [beat["id"] for beat in data["beats"]] == [beat["id"] for beat in story["beats"]]
beats_by_id = {beat["id"]: beat for beat in data["beats"]}
assert data["beats"][-1]["end"]==scene.frame_end+1
labels=[m for m in scene.timeline_markers if m.camera]
assert len(labels) == len(beats_by_id)+1
for beat in data["beats"][10:]:
    assert any(marker.name == beat["title"] and marker.frame == beat["start"] for marker in labels)
for marker in labels:
    scene.frame_set(marker.frame)
    assert scene.camera==marker.camera
    assert marker.frame%2==1


def verify_painted_coverage():
    backdrops = [obj for obj in scene.objects if obj.type == "MESH"
                 and obj.name.endswith("· decor ilustrat") and len(obj.data.polygons) == 1]
    starts = sorted(marker.frame for marker in labels)
    for start, end in zip(starts, starts[1:] + [scene.frame_end + 1]):
        for frame in (start, (start + end - 1) // 2, end - 1):
            scene.frame_set(frame)
            camera = scene.camera
            backdrop = min(backdrops, key=lambda obj:
                           abs(obj.matrix_world.translation.x - camera.matrix_world.translation.x))
            corners = [world_to_camera_view(scene, camera, backdrop.matrix_world @ vertex.co)
                       for vertex in backdrop.data.vertices]
            assert min(p.x for p in corners) <= 0 and max(p.x for p in corners) >= 1, (camera.name, frame)
            assert min(p.y for p in corners) <= 0 and max(p.y for p in corners) >= 1, (camera.name, frame)
    print("PAINTED_COVERAGE_OK", len(starts), "planuri de filmare")


verify_painted_coverage()
assert all(font.packed_file for font in bpy.data.fonts if font.filepath!="<builtin>")
assert all(sound.packed_file for sound in bpy.data.sounds)
assert all(image.packed_file for image in bpy.data.images if image.source == "FILE")
assert not bpy.data.libraries
assert {obj.data.body for obj in scene.objects if obj.type=="FONT"} == {
    story["title"],story["subtitle"],"Ghiorrr!",
}
cues=[cue for beat in data["beats"] for cue in beat["cues"]]
strips=getattr(scene.sequence_editor,"strips",None) or scene.sequence_editor.sequences
assert len(strips)==len(cues)+len(data["effects"])+1
for cue in cues:
    matching=[strip for strip in strips if Path(strip.sound.filepath).name==cue["file"]]
    assert len(matching)==1 and matching[0].frame_start==cue["start"],cue
for name,start in (("Costică · ogradă",data["beats"][3]["start"]),
                   ("Mihai · ogradă",data["beats"][4]["start"]),
                   ("Tata · prag",data["beats"][8]["start"]),
                   *((name+" · rugăciune",beats_by_id["la-icoane"]["start"])
                     for name in ("Tata","Mama","Mihai","Costică"))):
    drawings=[obj for obj in bpy.data.collections[name].objects if obj.type=="MESH"]
    scene.frame_set(start-1)
    assert all(obj.hide_render and obj.hide_viewport for obj in drawings),name
    scene.frame_set(start)
    assert sum(not obj.hide_render for obj in drawings)>16,name

def location(frame,rig,bone):
    scene.frame_set(frame)
    return rig.pose.bones[bone].matrix.translation.copy()

child=bpy.data.objects["RIG_Costică · bucătărie"]
reach=data["beats"][7]
hold=data["beats"][9]
start=location(reach["start"],child,"hand.R")
later=location(reach["end"]+6,child,"hand.R")
assert (start-later).length>.44
# The hand hovers during the last page, independently of the body.
def local_wrist(frame):
    wrist=location(frame,child,"hand.R")
    return wrist-child.pose.bones["root"].matrix.translation

assert (local_wrist(hold["start"])-local_wrist(hold["end"]-1)).length<.004
def verify_sleeves(rigs):
    for rig in rigs:
        coll = bpy.data.collections[rig.name[4:]]
        bodice = next(obj for obj in coll.objects
                      if "Shirt and clothing panels" in obj.name)
        for side in ("R","L"):
            label = "Mânecă continuă · "+side
            sleeve, = [obj for obj in coll.objects if obj.name.split(".")[0].endswith(label)]
            skin, = sleeve.modifiers
            assert skin.type == "ARMATURE" and skin.object == rig, sleeve.name
            assert {group.name for group in sleeve.vertex_groups} == {
                "chest", "shoulder."+side, "upper_arm."+side, "forearm."+side, "hand."+side,
            }, sleeve.name
            assert sum(len(vertex.groups) >= 2 for vertex in sleeve.data.vertices) >= 25
            assert all(abs(sum(group.weight for group in vertex.groups)-1) < .00001
                       for vertex in sleeve.data.vertices)
            cap_bone = rig.pose.bones["shoulder."+side]
            assert cap_bone.constraints[0].subtarget == "upper_arm."+side
            cap_group = sleeve.vertex_groups["shoulder."+side].index
            assert any(any(group.group == cap_group and group.weight > .25 for group in vertex.groups)
                       for vertex in sleeve.data.vertices)
            shoulder = sleeve.vertex_groups["chest"].index
            cap_y = rig.data.bones["upper_arm."+side].head_local.y
            cap = [v for v in sleeve.data.vertices if v.co.y > cap_y+.065]
            assert cap and all(any(g.group == shoulder and g.weight > .99 for g in v.groups) for v in cap)
            cuff = sleeve.vertex_groups["hand."+side].index
            assert any(any(group.group == cuff and group.weight > .95 for group in v.groups)
                       for v in sleeve.data.vertices)
            assert min(v.co.z for v in sleeve.data.vertices) < min(v.co.z for v in bodice.data.vertices)
    print("SLEEVES_OK", len(rigs)*2, "mâneci continue de la umăr la manșetă")


def verify_arm_length(beats):
    for actor,side,frame in (
        ("Costică · sat","R",43),
        ("Costică · ogradă","L",beats[3]["start"]+10),
        ("Mihai · ogradă","R",beats[4]["start"]+87),
        ("Mama · bucătărie","R",beats[6]["start"]+12),
        ("Tata · prag","L",beats[8]["start"]+56),
    ):
        scene.frame_set(frame)
        rig = bpy.data.objects["RIG_"+actor]
        fingers = rig.pose.bones["hand."+side].tail
        knee = rig.pose.bones["shin."+side].head
        assert fingers.y-knee.y >= .22, (actor,fingers.y,knee.y)
    print("ARM_LENGTH_OK", "degetele rămân deasupra genunchilor în repaus")


def verify_hands(beats):
    poses = (
        ("Mama · bucătărie","L", beats[6]["cues"][0]["start"]+45,"open"),
        ("Costică · bucătărie","R", beats[9]["start"]+30,"reach"),
        ("Tata · prag","R", beats[8]["cues"][1]["start"]+30,"stop"),
        ("Mihai · bucătărie","L", beats[8]["start"]+70,"grip"),
    )
    for actor,side,frame,pose in poses:
        coll = bpy.data.collections[actor]
        rig = bpy.data.objects["RIG_"+actor]
        scene.frame_set(frame)
        drawings = [obj for obj in coll.objects
                    if obj.type=="MESH" and obj.parent_bone=="hand."+side and not obj.hide_render]
        assert len(drawings)==1 and f"{pose} hand" in drawings[0].name, (actor,frame)
        wrist = rig.pose.bones["hand."+side].rotation_euler.z
        assert abs(atan2(sin(wrist),cos(wrist))) < radians(80), (actor,frame,wrist)
        sleeve = next(obj for obj in coll.objects
                      if obj.name.split(".")[0].endswith("Mânecă continuă · "+side))
        # Both pieces are in the rig's local plane. The fingers must draw
        # in front of the sleeve even when the wrist bends into its silhouette.
        wrist_y = rig.data.bones["hand."+side].head_local.y
        palm_depth = min(v.co.z for v in drawings[0].data.vertices)
        assert palm_depth > max(v.co.z for v in sleeve.data.vertices if v.co.y > wrist_y+.055)
        assert palm_depth < max(v.co.z for v in sleeve.data.vertices if v.co.y < wrist_y-.010)
    print("HANDS_OK", "articulații, gesturi și manșete verificate")


def verify_idle(beats):
    for actor, begin, end in (
        ("Costică · sat", beats[0]["start"], beats[0]["end"]),
        ("Costică · ogradă", beats[3]["start"], beats[4]["end"]),
        ("Mihai · ogradă", beats[4]["start"]+72, beats[4]["end"]),
        ("Tata · prag", beats[8]["start"]+48, beats[9]["end"]),
    ):
        rig = bpy.data.objects["RIG_"+actor]
        reference = None
        for frame in range(begin,end,13):
            scene.frame_set(frame)
            feet = [rig.matrix_world @ rig.pose.bones["foot."+side].head for side in "RL"]
            if reference is None:
                reference = feet
            assert max((a-b).length for a,b in zip(feet,reference)) < .0005, (actor,frame)
    print("IDLE_OK", "punctele de sprijin rămân fixe")


def verify_trough_and_father(beats):
    scene.frame_set(beats[3]["start"]+9)
    def depths(obj):
        return [(obj.matrix_world @ vertex.co).z for vertex in obj.data.vertices]

    back = bpy.data.objects["Troacă · interior și tărâțe"]
    front = bpy.data.objects["Troacă · muchie și perete din față"]
    face = bpy.data.objects["Chipul lui Grăsuțu"]
    assert max(depths(back)) < min(depths(face)) < max(depths(face)) < min(depths(front))
    head = bpy.data.objects["Grăsuțu · cap"]
    muzzle = head.matrix_world @ Vector((.707,-.018,0))
    basin = [back.matrix_world @ vertex.co for vertex in back.data.vertices]
    center_x = (min(p.x for p in basin) + max(p.x for p in basin)) / 2
    assert abs(muzzle.x - center_x) < .83, tuple(muzzle)
    assert min(p.y for p in basin) < muzzle.y < max(p.y for p in basin), tuple(muzzle)

    father = bpy.data.collections["Tata · prag"]
    assert any("Moustache" in obj.name for obj in father.objects)
    assert "Barbă scurtă" in father.objects
    assert "mustață brună" in beats[8]["cues"][0]["text"]
    growls = [effect for effect in data["effects"] if effect["file"] == "burta.wav"]
    assert len(growls) == 2
    assert beats_by_id["amin"]["start"] < growls[1]["start"] < beats_by_id["amin"]["cues"][0]["start"]
    for growl in growls:
        assert any(Path(strip.sound.filepath).name == growl["file"] and
                   strip.frame_start == growl["start"] for strip in strips)
    scene.frame_set(beats_by_id["la-icoane"]["start"])
    assert not bpy.data.objects["Icoana Maicii Domnului cu Pruncul"].hide_render
    assert bpy.data.objects["Icoana Maicii Domnului cu Pruncul"].hide_viewport is False
    assert beats_by_id["la-icoane"]["cues"][-1]["speaker"] == "cor"
    print("LAYERING_OK", "râtul este deasupra hranei și în spatele muchiei din față")


def verify_arms(rigs):
    peak = 0
    wrist_peak = 0
    beats = data["beats"]
    bend_windows = {
        ("RIG_Mama · bucătărie", "hand.L"): (beats[5]["start"], beats[6]["end"]+20),
        ("RIG_Mama · bucătărie", "hand.R"): (beats[5]["start"], beats[6]["end"]),
        ("RIG_Costică · bucătărie", "hand.R"): (beats[7]["start"], scene.frame_end),
        ("RIG_Tata · prag", "hand.R"): (beats[8]["start"], scene.frame_end),
    }
    joints = [(rig,rig.pose.bones[f"{bone}.{side}"])
              for rig in rigs for bone in ("forearm","hand") for side in "RL"]
    previous = None
    previous_wrists = None
    for frame in range(1,scene.frame_end+1,scene.frame_step):
        scene.frame_set(frame)
        points = [bone.head.copy() for _,bone in joints]
        for rig,bone in joints:
            window = bend_windows.get((rig.name,bone.name))
            if window and window[0] <= frame <= window[1]:
                angle = bone.rotation_euler.z
                bend = abs(atan2(sin(angle),cos(angle)))
                assert bend < radians(85), (rig.name,bone.name,frame,bend)
                wrist_peak = max(wrist_peak,bend)
        wrists = [bone.rotation_euler.z for _, bone in joints if bone.name.startswith("hand.")]
        if previous_wrists is not None:
            maximum = max(abs(atan2(sin(a-b), cos(a-b))) for a,b in zip(wrists, previous_wrists))
            assert maximum <= radians(8*scene.frame_step+.05), (frame, maximum)
        previous_wrists = wrists
        if previous is not None:
            for current,before,(rig,bone) in zip(points,previous,joints):
                delta = (current-before).length
                assert delta < .31, (rig.name,bone.name,frame,delta)
                peak = max(peak,delta)
        previous = points
    print("ARM_MOTION_OK", round(peak,4), "deplasare maximă între desene,",
          round(wrist_peak/radians(1),1), "grade la încheietură")


rigs = [obj for obj in scene.objects if obj.type=="ARMATURE"]
verify_sleeves(rigs)
verify_arm_length(data["beats"])
verify_hands(data["beats"])
verify_idle(data["beats"])
verify_trough_and_father(data["beats"])
verify_arms(rigs)
print("EPISODE_OK",len(data["beats"]),"momente",len(labels),"cadre de filmare",len(strips),"piste audio",flush=True)
