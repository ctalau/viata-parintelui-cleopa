"""Export the kitchen shot's evaluated rigs, sleeve mesh and isolated layers."""
from pathlib import Path
import json
import subprocess
from tempfile import TemporaryDirectory

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector


OUTPUT = Path(__file__).resolve().parents[3] / "studio" / "inspectie"
LAYERS = (
    ("decor", "Decorul bucătăriei", None),
    ("masa", "Masă și ștergar", "Masă și ștergar"),
    ("paine", "Pâine și vase", "Pâine și vase"),
    ("mama", "Mama", "Mama · bucătărie"),
    ("costica", "Costică", "Costică · bucătărie"),
    ("mihai", "Mihai", "Mihai · bucătărie"),
    ("abur", "Abur și miros auriu", None),
)
DRAWABLE = {"MESH", "CURVE", "FONT"}


def project(scene, world):
    p = world_to_camera_view(scene, scene.camera, world)
    return [round(p.x * 768, 1), round((1 - p.y) * 432, 1)]


def viewport_objects(scene, objects):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        evaluated = obj.evaluated_get(depsgraph)
        if evaluated.hide_render:
            continue
        points = [project(scene, evaluated.matrix_world @ Vector(corner))
                  for corner in evaluated.bound_box]
        x, y = zip(*points)
        if min(x) < 768 and max(x) > 0 and min(y) < 432 and max(y) > 0:
            yield obj


def object_data(obj, depsgraph):
    evaluated = obj.evaluated_get(depsgraph)
    depths = [(evaluated.matrix_world @ Vector(corner)).z for corner in evaluated.bound_box]
    return [obj.name, obj.type, round(min(depths), 2), round(max(depths), 2)]


def rig_data(scene, rig):
    return [[*project(scene, rig.matrix_world @ bone.head),
             *project(scene, rig.matrix_world @ bone.tail)] for bone in rig.pose.bones]


def sleeve_data(scene, sleeve):
    obj = sleeve.evaluated_get(bpy.context.evaluated_depsgraph_get())
    return [project(scene, obj.matrix_world @ vertex.co) for vertex in obj.data.vertices]


def render_layers(scene, layers):
    depsgraph = bpy.context.evaluated_depsgraph_get()
    root = scene.collection
    original_collections = list(root.children)
    # Bake the evaluated geometry before hiding the original collections.
    # This preserves the pose and drawing variants without visibility drivers
    # changing the isolated image when the renderer reevaluates the scene.
    copies = []
    for id_, _, objects in layers:
        collection = bpy.data.collections.new(id_)
        for source in sorted(objects, key=lambda obj: obj.name):
            obj = source.evaluated_get(depsgraph)
            mesh = bpy.data.meshes.new_from_object(obj, preserve_all_data_layers=True, depsgraph=depsgraph)
            copy = bpy.data.objects.new(source.name, mesh)
            collection.objects.link(copy)
            copy.matrix_world = obj.matrix_world.copy()
        copies.append(collection)
    for collection in original_collections:
        collection.hide_render = True
    scene.render.resolution_percentage = 60
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.use_sequencer = False
    with TemporaryDirectory() as work:
        for collection in copies:
            root.children.link(collection)
            scene.render.filepath = str(Path(work) / "layer.png")
            bpy.ops.render.render(write_still=True)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", scene.render.filepath,
                            "-c:v", "libwebp", "-lossless", "1",
                            str(OUTPUT / f"{collection.name}.webp")], check=True)
            root.children.unlink(collection)


def main():
    scene = bpy.context.scene
    markers = sorted(scene.timeline_markers, key=lambda marker: marker.frame)
    index = next(i for i, marker in enumerate(markers) if marker.name == "Încă puțin")
    start, end = markers[index].frame, markers[index + 1].frame - 1
    frames = range(start, end + 1, scene.frame_step)
    snapshot = frames[len(frames) // 2]
    scene.frame_set(snapshot)
    kitchen = bpy.data.collections["04 · Bucătărie"]
    effects = {obj for obj in kitchen.objects if obj.name.startswith(("Abur de pâine", "Miros auriu"))}
    backdrop = kitchen.children.get("Bucătărie · decor pictat")
    decor = set(kitchen.objects) - effects
    if backdrop:
        decor.update(backdrop.all_objects)
    layers = []
    rigs = {}
    for id_, label, name in LAYERS:
        if name:
            collection = kitchen.children[name]
            candidates = collection.all_objects
            rig = next((obj for obj in candidates if obj.type == "ARMATURE"), None)
            if rig:
                rigs[id_] = rig
        else:
            candidates = effects if id_ == "abur" else decor
        objects = set(viewport_objects(scene, (obj for obj in candidates if obj.type in DRAWABLE)))
        layers.append((id_, label, objects))
    sleeve = next(obj for obj in kitchen.children["Costică · bucătărie"].objects
                  if "Mânecă continuă · R" in obj.name)
    mesh = sleeve.data
    rows = list(mesh.vertices)[2::5]  # Middle vertex in each five-column sleeve row.
    low, high = rows[-1].co.y, rows[0].co.y
    weights = []
    for vertex in rows:
        groups = {group.group: round(group.weight, 3) for group in vertex.groups}
        weights.append([round((high - vertex.co.y) / (high - low), 4),
                        *[groups.get(group.index, 0) for group in sleeve.vertex_groups]])
    depsgraph = bpy.context.evaluated_depsgraph_get()
    data = {
        "camera": markers[index].name,
        "fps": scene.render.fps / scene.render.fps_base,
        "step": scene.frame_step,
        "start": start,
        "end": end,
        "snapshot": snapshot,
        "layers": [{"id": id_, "label": label,
                    "objects": sorted(object_data(obj, depsgraph) for obj in objects)}
                   for id_, label, objects in layers],
        "rigs": {id_: {"name": rig.name,
                       "bones": [{"name": bone.name, "parent": bone.parent.name if bone.parent else None}
                                 for bone in rig.pose.bones]} for id_, rig in rigs.items()},
        "sleeve": {"name": sleeve.name, "faces": [list(face.vertices) for face in mesh.polygons],
                   "groups": [group.name for group in sleeve.vertex_groups], "weights": weights},
        "frames": [],
    }
    for frame in frames:
        scene.frame_set(frame)
        data["frames"].append({"rigs": {id_: rig_data(scene, rig) for id_, rig in rigs.items()},
                               "sleeve": sleeve_data(scene, sleeve)})
    scene.frame_set(snapshot)
    render_layers(scene, layers)
    (OUTPUT / "scene.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
