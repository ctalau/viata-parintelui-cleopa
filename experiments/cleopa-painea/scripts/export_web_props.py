"""Export reusable cut-outs from the episode into independent glTF assets."""
from pathlib import Path

import bpy
from mathutils import Vector


OUTPUT = Path(__file__).resolve().parents[3] / "assets" / "recuzita"


def matching(collection, prefix):
    return next(obj for obj in collection.objects if obj.name.startswith(prefix))


def export_asset(id_, sources, folder, depsgraph):
    """Keep the shape and internal layer offsets, with a bottom-center pivot."""
    copies = []
    points = []
    for source in sources:
        obj = source.evaluated_get(depsgraph)
        mesh = bpy.data.meshes.new_from_object(
            obj, preserve_all_data_layers=True, depsgraph=depsgraph)
        copy = bpy.data.objects.new(source.name, mesh)
        folder.objects.link(copy)
        copy.matrix_world = obj.matrix_world.copy()
        points.extend(copy.matrix_world @ Vector(corner) for corner in obj.bound_box)
        copies.append(copy)

    bounds = list(zip(*points))
    pivot = Vector([(min(bounds[0]) + max(bounds[0])) / 2,
                    min(bounds[1]), (min(bounds[2]) + max(bounds[2])) / 2])
    for copy in copies:
        copy.location -= pivot
        copy.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(OUTPUT / f"{id_}.glb"), export_format="GLB",
        use_selection=True, export_yup=False, export_animations=False,
        export_image_format="JPEG", export_image_quality=85,
    )
    for copy in copies:
        mesh = copy.data
        bpy.data.objects.remove(copy, do_unlink=True)
        bpy.data.meshes.remove(mesh)
    print(id_, [round(max(axis) - min(axis), 2) for axis in bounds], flush=True)


def main():
    scene = bpy.context.scene
    marker = next(mark for mark in scene.timeline_markers if mark.name == "Încă puțin")
    scene.frame_set(marker.frame)
    kitchen = bpy.data.collections["04 · Bucătărie"]
    food = kitchen.children["Pâine și vase"]
    assets = {
        "bucatarie": list(kitchen.children["Bucătărie · decor pictat"].objects),
        "masa": list(kitchen.children["Masă și ștergar"].objects),
        "paine": [matching(food, "Round scored bread")],
        "taler": [matching(food, "Woven loaf platter")],
        "ulcior": [matching(food, "Painted pitcher")],
        "carte": [matching(kitchen.children["Mihai · bucătărie"], "Carte groasă sub braț")],
        "traiste": [matching(kitchen, "Două traiste lângă laviță")],
    }
    OUTPUT.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    folder = bpy.data.collections.new("Export recuzită")
    scene.collection.children.link(folder)
    for id_, sources in assets.items():
        depsgraph = bpy.context.evaluated_depsgraph_get()
        export_asset(id_, sources, folder, depsgraph)


if __name__ == "__main__":
    main()
