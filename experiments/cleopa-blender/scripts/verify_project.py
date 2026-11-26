"""Reopen the Blender deliverables and exercise their rig and animation data."""
import json
from pathlib import Path
import sys

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Matrix

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from animate_prayer import ACTIONS, channels, verify_contacts
from build_characters import EYES, HANDS, MOUTHS, profile


def open_project(path):
    bpy.ops.wm.open_mainfile(filepath=str(path), load_ui=False)
    scene = bpy.context.scene
    assert scene.camera and scene.camera.data.type == "ORTHO"
    assert all(im.source != "FILE" or im.packed_file for im in bpy.data.images)
    assert not bpy.data.libraries
    return scene


def variants(rig, coll, property_name, value):
    family = {
        "eye_pose": (EYES, lambda pose: [f"Eye {pose} · {side}" for side in "RL"]),
        "mouth_pose": (MOUTHS, lambda pose: [f"Mouth {pose}"]),
        "hand_R_pose": (HANDS, lambda pose: [f"{pose} hand · R"]),
        "hand_L_pose": (HANDS, lambda pose: [f"{pose} hand · L"]),
    }
    choices, names = family[property_name]
    for index, pose in enumerate(choices):
        for name in names(pose):
            part = coll.objects[f"{rig.name[4:]} / {name}"]
            assert part.hide_render == (index != value), (part.name, value, "render")
            assert part.hide_viewport == (index != value), (part.name, value, "viewport")


def loaded_character(name):
    rig = bpy.data.objects[f"RIG_{name}"]
    coll = bpy.data.collections[f"CHAR_{name}"]
    assert rig.type == "ARMATURE"
    assert len(rig.data.bones) == 18
    assert len([o for o in coll.objects if o.type == "MESH"]) >= 39
    for obj in coll.objects:
        if obj.type == "MESH":
            assert obj.parent == rig and obj.parent_type == "BONE", obj.name
            assert obj.parent_bone in rig.data.bones, obj.name
    keys = ("forehead", "chest", "shoulder_R", "shoulder_L", "hand_rest")
    targets = {key: coll.objects[f"{name} / MARK_{key}"] for key in keys}
    tip = coll.objects[f"{name} / CHECK_cross_tip.R"]
    return profile(name), rig, coll, None, targets, tip


def use_action(scene, rig, action_name, frame):
    action = bpy.data.actions[f"{rig.name[4:]}__{action_name}"]
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis = Matrix.Identity(4)
    for key in ("eye_pose", "mouth_pose", "hand_R_pose", "hand_L_pose"):
        rig[key] = 0
    rig.animation_data.action = action
    if hasattr(action, "slots") and len(action.slots) == 1:
        rig.animation_data.action_slot = action.slots[0]
    scene.frame_set(frame)
    bpy.context.view_layer.update()
    return action


def verify_library(name):
    scene = open_project(ROOT / "assets" / "characters" / name / f"{name}.blend")
    character = loaded_character(name)
    _, rig, coll, _, _, _ = character
    assert coll.asset_data and rig.animation_data.action is None
    checks = {
        "idle_breathe": (22, "Breathing", None),
        "blink": (3, "Drawing variants", ("eye_pose", 2)),
        "head_bow": (31, "Head", None),
        "pray_speech": (11, "Drawing variants", None),
        "cross_orthodox_R": (33, "Arm R", ("hand_R_pose", 3)),
        "sit_idle": (1, "Seated legs", None),
    }
    for name_ in ACTIONS:
        frame, group, variant = checks[name_]
        action = use_action(scene, rig, name_, frame)
        assert action.asset_data and action.use_fake_user
        assert any(c.group and c.group.name == group for c in channels(rig, action)), name_
        if variant:
            variants(rig, coll, *variant)
        if name_ == "cross_orthodox_R":
            verify_contacts(character, (33, 49, 64, 79))
    print("LIBRARY_OK", name, "six actions, neutral rig, render and viewport variants")


def verify_motion(scene, rigs):
    joints = {"elbow": "forearm.R", "wrist": "hand.R"}
    maximums = {joint: 0 for joint in joints}
    for start, end in ((24, 120), (600, 706)):
        previous = {}
        for frame in range(start, end + 1):
            scene.frame_set(frame)
            for rig in rigs:
                for joint, bone in joints.items():
                    point = rig.pose.bones[bone].head.copy()
                    key = (rig.name, joint)
                    if key in previous:
                        displacement = (point - previous[key]).length
                        assert displacement < .30, (key, frame, displacement)
                        maximums[joint] = max(displacement, maximums[joint])
                    previous[key] = point
    print("MOTION_OK", {joint: round(value, 3) for joint, value in maximums.items()})


def verify_family(timing):
    scene = open_project(ROOT / "scenes" / "prayer_at_table.blend")
    assert (scene.frame_start, scene.frame_end, scene.render.fps) == (1, 720, 24)
    assert (scene.render.resolution_x, scene.render.resolution_y) == (1920, 1080)
    chars = [loaded_character(name) for name in timing["characters"]]
    assert [c[1].location.x for c in chars] == sorted(c[1].location.x for c in chars)
    actions = {c[1].animation_data.action for c in chars}
    assert len(actions) == len(chars)
    contact_count = 0
    for p, rig, coll, _, markers, tip in chars:
        name = p["id"]
        offset = timing["offset_frames"][name]
        variants_checked = False
        for base in timing["contact_frames_leader"].values():
            frames = [f + offset for f in base]
            verify_contacts((p, rig, coll, None, markers, tip), frames)
            contact_count += 4
            for frame, marker in zip(frames, list(markers.values())[:4]):
                scene.frame_set(frame)
                projected = world_to_camera_view(scene, scene.camera, marker.matrix_world.translation)
                assert .02 < projected.x < .98 and .22 < projected.y < .92, (name, frame)
                if not variants_checked:
                    variants(rig, coll, "hand_R_pose", 3)
                    variants(rig, coll, "hand_L_pose", 0)
                    variants_checked = True
        # An Euler wrap used to make the priest move between the two gestures.
        # Check each position relative to the breathing root through the hold.
        vectors = []
        for frame in (120, 137, 179, 240, 320, 375, 460, 557, 600):
            scene.frame_set(frame)
            root = rig.matrix_world @ rig.pose.bones["root"].head
            vectors.append(tip.matrix_world.translation - root)
        assert max((point-vectors[0]).length for point in vectors) < .003, name
    verify_motion(scene, [character[1] for character in chars])
    print("FAMILY_OK", contact_count, "visible right-handed contacts, six independent actions")


def verify_study():
    scene = open_project(ROOT / "scenes" / "cleopa_cross_test.blend")
    char = loaded_character("cleopa")
    _, rig, coll, _, _, _ = char
    assert scene.frame_end == 108
    verify_contacts(char, (33, 49, 64, 79))
    scene.frame_set(104)
    variants(rig, coll, "eye_pose", 2)
    variants(rig, coll, "mouth_pose", 7)
    print("STUDY_OK", "four contacts and animated facial substitutions")


def verify_appended_rig():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    path = ROOT / "assets" / "characters" / "cleopa" / "cleopa.blend"
    with bpy.data.libraries.load(str(path), link=False) as (source, target):
        assert "CHAR_cleopa" in source.collections
        assert "cleopa__cross_orthodox_R" in source.actions
        target.collections = ["CHAR_cleopa"]
        target.actions = ["cleopa__cross_orthodox_R"]
    scene.collection.children.link(target.collections[0])
    character = loaded_character("cleopa")
    rig, coll = character[1:3]
    use_action(scene, rig, "cross_orthodox_R", 33)
    variants(rig, coll, "hand_R_pose", 3)
    verify_contacts(character, (33, 49, 64, 79))
    print("APPEND_OK", "Cleopa rig, drawings and reusable cross Action")


def verify_set_assets():
    for folder, asset, name in (
        ("backgrounds", "farmhouse", "SET • Moldavian farmhouse"),
        ("props", "tableware", "Bread, fruit and earthenware"),
    ):
        path = ROOT / "assets" / folder / f"{asset}.blend"
        with bpy.data.libraries.load(str(path), link=False) as (source, target):
            assert name in source.collections, path
            target.collections = [name]
        coll, = target.collections
        assert any(obj.type == "MESH" for obj in coll.all_objects), path
        print("APPEND_OK", asset)


timing = json.loads((ROOT / "animations" / "timing.json").read_text())
verify_study()
verify_family(timing)
for identifier in timing["characters"]:
    verify_library(identifier)
verify_set_assets()
verify_appended_rig()
print("PROJECT_OK", bpy.app.version_string)
