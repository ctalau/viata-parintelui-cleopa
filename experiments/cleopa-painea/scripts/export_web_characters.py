"""Build animated GLBs with the episode's 2.5D character art and rigs."""
import json
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Matrix, Vector
# Blender executes this file without adding its directory to sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_episode import actor, arms, blink, breathing, finish_action, hand_pose, head
from build_episode import relax_wrist, setup, short_beard, stand
from mother_stress import create_stress_arm


OUTPUT = Path(__file__).resolve().parents[3] / "assets" / "recuzita"
FIRST, LAST = 1, 97  # Four seconds at 24 fps, including the pose at t = 4.
CHARACTERS = (
    ("costica", "cleopa", -1, "R", (-.89, .68), (-.99, .14), "reach"),
    ("mama", "mother", 1, "L", (1.05, .86), (.93, .14), "open"),
    ("mihai", "brother_01", -1, "R", (-.87, .91), (-.87, .49), "open"),
    ("tata", "father", -1, "R", (-.71, 1.05), (-.27, .96), "stop"),
)


def pose(character, side, target, direction, hand):
    rig = character["rig"]
    stand(character, FIRST)
    rest = relax_wrist(character, side)
    down = (-.06 if side == "R" else .06, -1)
    arms(character, side, [
        (FIRST, rest, down), (23, rest, down), (46, target, direction),
        (64, target, direction), (87, rest, down), (LAST, rest, down),
    ])
    for frame, drawing in ((34, hand), (76, "rest")):
        hand_pose(character, side, frame, drawing)
    for frame, bow, tilt in ((FIRST, 0, 0), (47, .065, -.07), (66, .06, -.05), (LAST, 0, 0)):
        head(rig, frame, bow, tilt)
    blink(rig, 18)
    blink(rig, 74)
    breathing(character, FIRST, LAST)
    finish_action(rig, character["action"])


def bake_drawing_switches(scene, meshes):
    """Turn Blender visibility drivers into portable, stepped scale tracks."""
    variants = [obj for obj in meshes if obj.animation_data and obj.animation_data.drivers]
    states = {obj: [] for obj in variants}
    for frame in range(FIRST, LAST + 1):
        scene.frame_set(frame)
        depsgraph = bpy.context.evaluated_depsgraph_get()
        for obj in variants:
            states[obj].append(not obj.evaluated_get(depsgraph).hide_render)

    for obj, visible in states.items():
        if not any(visible):
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        for prop in ("hide_viewport", "hide_render"):
            obj.driver_remove(prop)
            setattr(obj, prop, False)
        if all(visible):
            continue
        scale = obj.scale.copy()
        for offset, active in enumerate(visible):
            if offset == 0 or active != visible[offset - 1]:
                obj.scale = scale if active else scale * 0.000001
                obj.keyframe_insert("scale", frame=FIRST + offset)
        for curve in obj.animation_data.action.fcurves:
            for key in curve.keyframe_points:
                key.interpolation = "CONSTANT"


def linear_keys(obj):
    for curve in obj.animation_data.action.fcurves:
        for key in curve.keyframe_points:
            key.interpolation = "LINEAR"


def bake_shapes(obj, samples):
    basis = obj.shape_key_add(name="Basis")
    basis.data.foreach_set("co", [value for point in samples[0][1] for value in point])
    targets = {}
    states = []
    for frame, coords in samples:
        # Held poses and repeated endpoints can share one target.
        signature = tuple(round(value, 5) for point in coords for value in point)
        if not states:
            targets[signature] = None
        elif signature not in targets:
            shape = obj.shape_key_add(name=f"Maneca_{frame:03}")
            shape.data.foreach_set("co", [value for point in coords for value in point])
            targets[signature] = shape
        states.append((frame, targets[signature]))
    for index, (frame, shape) in enumerate(states):
        if shape is None:
            continue
        previous = states[index - 1]
        following = states[index + 1] if index + 1 < len(states) else (frame, shape)
        for moment, value in ((previous[0], float(previous[1] == shape)),
                              (frame, 1.0), (following[0], float(following[1] == shape))):
            shape.value = value
            shape.keyframe_insert("value", frame=moment)
    if obj.data.shape_keys.animation_data:
        linear_keys(obj.data.shape_keys)


def bake_arm(scene, meshes, side):
    """Preserve Blender's sleeve volume and exact hand placement in glTF."""
    cloth = [obj for obj in meshes if obj.name.split(" · ")[-1] == side
             and any(modifier.type == "ARMATURE" for modifier in obj.modifiers)]
    hands = [obj for obj in meshes if obj.parent_bone == "hand." + side]
    vertices = {obj: [] for obj in cloth}
    poses = {obj: [] for obj in hands}
    for frame in range(FIRST, LAST + 1):
        scene.frame_set(frame)
        graph = bpy.context.evaluated_depsgraph_get()
        for obj in hands:
            evaluated = obj.evaluated_get(graph)
            poses[obj].append((frame, evaluated.matrix_world.copy(), not evaluated.hide_render))
        if (frame - FIRST) % 2:
            continue
        for obj in cloth:
            evaluated = obj.evaluated_get(graph)
            vertices[obj].append((frame, [evaluated.matrix_world @ vertex.co
                                          for vertex in evaluated.data.vertices]))

    for obj, samples in vertices.items():
        obj.parent = None
        obj.matrix_world = Matrix.Identity(4)
        obj.modifiers.clear()
        bake_shapes(obj, samples)

    for obj, samples in poses.items():
        if not any(visible for _, _, visible in samples):
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        obj.animation_data_clear()
        obj.hide_render = obj.hide_viewport = False
        obj.parent = None
        obj.rotation_mode = "QUATERNION"
        previous = None
        for frame, matrix, visible in samples:
            result = matrix.to_quaternion()
            if previous is not None:
                result.make_compatible(previous)
            previous = result.copy()
            obj.location = matrix.translation
            obj.rotation_quaternion = result
            obj.scale = matrix.to_scale() * (1 if visible else 0.000001)
            for attribute in ("location", "rotation_quaternion", "scale"):
                obj.keyframe_insert(attribute, frame=frame)
        linear_keys(obj)


def keep_face_switches_discrete(path):
    """Sampled glTF exports use linear scale, which pulls an eye toward its pivot."""
    raw = path.read_bytes()
    size = struct.unpack_from("<I", raw, 12)[0]
    document = json.loads(raw[20:20+size])
    for animation in document.get("animations", []):
        samplers = animation["samplers"]
        for channel in animation["channels"]:
            target = channel["target"]
            name = document["nodes"][target["node"]].get("name", "")
            if target["path"] == "scale" and any(label in name for label in (" / Eye ", " / Mouth ")):
                channel_index = channel["sampler"]
                channel["sampler"] = len(samplers)
                samplers.append(dict(samplers[channel_index], interpolation="STEP"))
    encoded = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode()
    encoded += b" " * (-len(encoded) % 4)
    tail = raw[20+size:]
    path.write_bytes(struct.pack("<4sII", b"glTF", 2, 20+len(encoded)+len(tail))
                     + struct.pack("<I4s", len(encoded), b"JSON") + encoded + tail)


def export_character(id_, design, look, side, target, direction, hand, test=None):
    scene = setup("gest", fps=24, end=LAST)
    character = actor(scene.collection, design, id_, (0, 0, 0), look=look, interior=True)
    rig, collection = character["rig"], character["collection"]
    if id_ == "tata":
        short_beard(character)
    if test:
        create_stress_arm(scene, character, test, bake_shapes)
    else:
        pose(character, side, target, direction, hand)
    meshes = [obj for obj in collection.objects if obj.type == "MESH"]
    scene.frame_set(FIRST)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    bottom = min((evaluated.matrix_world @ Vector(point)).y
                 for obj in meshes if not (evaluated := obj.evaluated_get(depsgraph)).hide_render
                 for point in evaluated.bound_box)
    rig.location.y -= bottom
    if test:
        scene.camera.location = (.18, 3.25, 20)
        scene.camera.data.ortho_scale = 6.4
        filename = Path(__file__).resolve().parents[1] / "scenes" / f"mama-test-{test}.blend"
        bpy.ops.wm.save_as_mainfile(filepath=str(filename), compress=True)
    bake_arm(scene, meshes, side)
    bake_drawing_switches(scene, [obj for obj in collection.objects if obj.type == "MESH"])

    scene.frame_set(FIRST)
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for obj in collection.objects:
        if obj.type == "MESH":
            obj.select_set(True)
    output = OUTPUT / f"{id_}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(output), export_format="GLB",
        use_selection=True, export_yup=False, export_animations=True, export_skins=True,
        export_animation_mode="SCENE", export_frame_range=True, export_frame_step=1,
        export_morph_normal=False,
        export_anim_slide_to_zero=True, export_anim_scene_split_object=False, export_nla_strips_merged_animation_name="gest",
    )
    keep_face_switches_discrete(output)


if __name__ == "__main__":
    OUTPUT.mkdir(parents=True, exist_ok=True)
    options = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    if options == ["--stress"]:
        for test in ("palma", "cot", "umar"):
            export_character("mama-"+test, "mother", 1, "L", None, None, None, test)
    else:
        for args in CHARACTERS:
            export_character(*args)
