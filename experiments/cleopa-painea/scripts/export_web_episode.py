"""Export evaluated Blender drawings and cameras for the Three.js episode."""
from array import array
import gzip
from itertools import chain, groupby
import json
from pathlib import Path
import sys

import bpy

OUTPUT = Path(__file__).resolve().parents[3] / "assets" / "film"
ZONES = ("01 · Satul de pe deal", "02 · Ograda", "03 · Dormitor",
         "04 · Bucătărie", "Ograda în zori · cocoșul și Grăsuțu")
OVERLAYS = "Titlu și efecte grafice"


class Packed:
    def __init__(self):
        self.bytes = bytearray()

    def add(self, kind, values):
        values = values if isinstance(values, array) else array(kind, values)
        if sys.byteorder != "little":
            values.byteswap()
        payload = values.tobytes()
        assert len(self.bytes) % 4 == 0
        span = [len(self.bytes), len(values)]
        self.bytes.extend(payload)
        self.bytes.extend(b"\0" * (-len(payload) % 4))
        return span


def material_data(material):
    if material is None:
        return {"color": [0.8, 0.8, 0.8]}
    value = {"color": list(material.diffuse_color)[:3]}
    nodes = material.node_tree.nodes if material.use_nodes else None
    if nodes and (active := nodes.active) and active.type == "TEX_IMAGE" and active.image:
        value["image"] = active.image.name
        value["color"] = [1, 1, 1]
    return value


def coords(mesh):
    xyz = array("f", [0]) * (len(mesh.vertices)*3)
    mesh.vertices.foreach_get("co", xyz)
    return xyz


def geometry(obj, pack):
    mesh = obj.data if obj.type == "MESH" else obj.to_mesh()
    try:
        mesh.calc_loop_triangles()
        materials = [material_data(material) for material in mesh.materials] or [material_data(None)]
        texture = any("image" in material for material in materials)
        uv_layer = mesh.uv_layers.active if texture else None
        xyz = coords(mesh)
        if uv_layer:
            positions = chain.from_iterable(xyz[loop.vertex_index*3:loop.vertex_index*3+3]
                                            for loop in mesh.loops)
            uv = pack.add("f", chain.from_iterable(item.uv for item in uv_layer.data))
        else:
            positions, uv = xyz, None
        batches, indices = [], array("I")
        tris = sorted(mesh.loop_triangles, key=lambda triangle: triangle.material_index)
        for material, triangles in groupby(tris, key=lambda triangle: triangle.material_index):
            start = len(indices)
            for triangle in triangles:
                indices.extend(triangle.loops if uv_layer else triangle.vertices)
            batches.append([start, len(indices)-start, material])
        return {"positions": pack.add("f", positions), "uv": uv,
                "indices": pack.add("I", indices), "groups": batches, "materials": materials}
    finally:
        if obj.type != "MESH":
            obj.to_mesh_clear()


def track(pack, samples, kind="f"):
    first = next(value for value in samples if value is not None)
    if all(value is None or value == first for value in samples):
        return {"data": pack.add(kind, first), "stride": 0}
    return {"data": pack.add(kind, chain.from_iterable(first if x is None else x for x in samples)),
            "stride": len(first)}


def camera_parent(obj):
    parent = obj.parent
    while parent and parent.type != "CAMERA":
        parent = parent.parent
    return parent


def projected(obj, x, y, width, height):
    matrix = obj.matrix_world
    box = obj.bound_box
    center = [(box[0][i]+box[6][i])*.5 for i in range(3)]
    span = [abs(box[6][i]-box[0][i])*.5 for i in range(3)]
    for axis, limit, delta in ((0, x, width), (1, y, height)):
        row = matrix[axis]
        middle = row[3] + sum(row[i]*center[i] for i in range(3))
        radius = sum(abs(row[i])*span[i] for i in range(3))
        if abs(middle-limit) > delta + radius:
            return False
    return True


def export_shot(scene, index, marker, next_frame):
    camera = marker.camera
    scene.frame_set(marker.frame)
    zone = ZONES[round(camera.matrix_world.translation.x/33)]
    objects = set(bpy.data.collections[zone].all_objects)
    objects.update(obj for obj in bpy.data.collections[OVERLAYS].all_objects
                   if camera_parent(obj) == camera)
    objects = sorted((obj for obj in objects if obj.type in {"MESH", "FONT"}), key=lambda obj: obj.name)
    frames = range(marker.frame, next_frame, scene.frame_step)
    transforms = {obj: [None]*len(frames) for obj in objects}
    # Armature-skinned drawings and the shape-keyed volumetric arm both deform.
    deform = {obj: [None]*len(frames) for obj in objects
              if obj.modifiers or (obj.type == "MESH" and obj.data.shape_keys)}
    definitions, cameras = {}, []
    pack = Packed()
    for i, frame in enumerate(frames):
        scene.frame_set(frame)
        graph = bpy.context.evaluated_depsgraph_get()
        active = camera.evaluated_get(graph)
        x, y, z = active.matrix_world.translation
        width = active.data.ortho_scale
        cameras.extend((x, y, z, width))
        for source in objects:
            obj = source.evaluated_get(graph)
            if obj.hide_render or not projected(obj, x, y, width*.51, width*9/32+.06):
                continue
            if source not in definitions:
                definitions[source] = geometry(obj, pack)
            transforms[source][i] = tuple(chain.from_iterable(obj.matrix_world[j] for j in range(3)))
            if source in deform:
                deform[source][i] = coords(obj.data)

    nodes = []
    for obj in objects:
        if obj not in definitions:
            continue
        definition = definitions[obj]
        definition.update(name=obj.name, matrix=track(pack, transforms[obj]),
                          visible=pack.add("B", [sample is not None for sample in transforms[obj]]))
        if obj in deform:
            definition["deform"] = track(pack, deform[obj])
        nodes.append(definition)
    data = {"camera": pack.add("f", cameras), "objects": nodes, "count": len(frames)}
    stem = f"plan-{index+1:02}"
    (OUTPUT/f"{stem}.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")))
    (OUTPUT/f"{stem}.bin").write_bytes(gzip.compress(bytes(pack.bytes), compresslevel=5, mtime=0))
    print(stem, marker.name, len(nodes), len(frames), flush=True)
    return {"id": stem, "name": marker.name, "frame": marker.frame, "end": next_frame}


def main():
    scene = bpy.context.scene
    assert not scene.get("coacere_partiala"), "scena are o coacere parțială (npm run cadru): rulează coacerile complete"
    markers = sorted((mark for mark in scene.timeline_markers if mark.camera), key=lambda mark: mark.frame)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    shots = [export_shot(scene, i, marker,
                         markers[i+1].frame if i+1 < len(markers) else scene.frame_end+1)
             for i, marker in enumerate(markers)]
    info = {"fps": scene.render.fps, "step": scene.frame_step, "end": scene.frame_end, "shots": shots}
    (OUTPUT/"index.json").write_text(json.dumps(info, ensure_ascii=False, indent=2)+"\n")


if __name__ == "__main__":
    main()
