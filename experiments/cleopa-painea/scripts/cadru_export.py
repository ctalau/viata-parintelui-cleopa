"""Exportă cadre ale episodului ca GLB-uri, pentru `npm run cadru` (randare three.js).

    blender -b scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 \\
        --python scripts/cadru_export.py -- --out DIR --frames 1263,3301

Pentru fiecare cadru: un `cadru-NNNN.glb` cu desenele vizibile ale planului, evaluate la acel
cadru (oase, shape keys, mâneci și palme coapte) și aduse în coordonatele lumii, cu materiale
neluminate (`KHR_materials_unlit`) și texturile decorurilor ca fișiere externe (`textures/…`).
Plus `cadru-NNNN.json`: camera ortografică, planul, timpul și, pentru fiecare personaj,
cutia lui și cutia brațelor în coordonatele imaginii (0–1), pentru zoom.
"""
import json
from pathlib import Path
import struct
import sys

import bpy
from mathutils import Vector
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_web_episode import OVERLAYS, ZONES, camera_parent, material_data, projected  # noqa: E402


def arguments():
    args = sys.argv[sys.argv.index("--")+1:]
    values = dict(zip(args[::2], args[1::2]))
    return Path(values["--out"]), [int(f) for f in values["--frames"].split(",")]


class Glb:
    def __init__(self):
        self.bin = bytearray()
        self.gltf = {"asset": {"version": "2.0", "generator": "cadru_export.py"},
                     "extensionsUsed": ["KHR_materials_unlit"], "scenes": [{"nodes": []}], "scene": 0,
                     "nodes": [], "meshes": [], "materials": [], "accessors": [], "bufferViews": [],
                     "buffers": [], "images": [], "textures": [], "samplers": [{"magFilter": 9729, "minFilter": 9987}]}
        self.material_index, self.image_index = {}, {}

    def view(self, data, target):
        while len(self.bin) % 4:
            self.bin.append(0)
        self.gltf["bufferViews"].append({"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data),
                                         "target": target})
        self.bin.extend(data)
        return len(self.gltf["bufferViews"])-1

    def accessor(self, array, kind, count, component, target, bounds=False):
        entry = {"bufferView": self.view(array.tobytes(), target), "componentType": component,
                 "count": count, "type": kind}
        if bounds:
            entry["min"] = array.min(axis=0).tolist()
            entry["max"] = array.max(axis=0).tolist()
        self.gltf["accessors"].append(entry)
        return len(self.gltf["accessors"])-1

    def material(self, data):
        key = json.dumps(data, sort_keys=True)
        if key not in self.material_index:
            material = {"pbrMetallicRoughness": {"baseColorFactor": [*data["color"], 1],
                                                 "metallicFactor": 0, "roughnessFactor": 1},
                        "doubleSided": True, "extensions": {"KHR_materials_unlit": {}}}
            if "image" in data:
                name = data["image"]
                if name not in self.image_index:
                    self.gltf["images"].append({"uri": "textures/"+name})
                    self.gltf["textures"].append({"source": len(self.gltf["images"])-1, "sampler": 0})
                    self.image_index[name] = len(self.gltf["textures"])-1
                material["pbrMetallicRoughness"]["baseColorTexture"] = {"index": self.image_index[name]}
                material.update(alphaMode="MASK", alphaCutoff=.5)
            self.gltf["materials"].append(material)
            self.material_index[key] = len(self.gltf["materials"])-1
        return self.material_index[key]

    def add(self, name, mesh, matrix):
        mesh.calc_loop_triangles()
        materials = [material_data(m) for m in mesh.materials] or [material_data(None)]
        textured = any("image" in m for m in materials)
        uv_layer = mesh.uv_layers.active if textured else None
        co = np.zeros(len(mesh.vertices)*3, np.float32)
        mesh.vertices.foreach_get("co", co)
        co = co.reshape(-1, 3)
        world = (np.c_[co, np.ones(len(co))] @ np.array(matrix).T)[:, :3].astype(np.float32)
        tris = np.zeros(len(mesh.loop_triangles)*3, np.int32)
        mesh.loop_triangles.foreach_get("loops" if uv_layer else "vertices", tris)
        tris = tris.reshape(-1, 3)
        index = np.zeros(len(mesh.loop_triangles), np.int32)
        mesh.loop_triangles.foreach_get("material_index", index)
        attributes = {}
        if uv_layer:
            loops = np.zeros(len(mesh.loops), np.int32)
            mesh.loops.foreach_get("vertex_index", loops)
            positions = world[loops]
            uv = np.zeros(len(mesh.loops)*2, np.float32)
            uv_layer.data.foreach_get("uv", uv)
            uv = uv.reshape(-1, 2)
            uv[:, 1] = 1-uv[:, 1]
            attributes["TEXCOORD_0"] = self.accessor(uv, "VEC2", len(uv), 5126, 34962)
        else:
            positions = world
        if not len(tris) or not len(positions):
            return
        attributes["POSITION"] = self.accessor(np.ascontiguousarray(positions), "VEC3", len(positions),
                                               5126, 34962, bounds=True)
        primitives = []
        for slot in sorted(set(index.tolist())):
            faces = tris[index == slot].astype(np.uint32).ravel()
            primitives.append({"attributes": attributes,
                               "indices": self.accessor(faces, "SCALAR", len(faces), 5125, 34963),
                               "material": self.material(materials[min(slot, len(materials)-1)])})
        self.gltf["meshes"].append({"name": name, "primitives": primitives})
        self.gltf["nodes"].append({"name": name, "mesh": len(self.gltf["meshes"])-1})
        self.gltf["scenes"][0]["nodes"].append(len(self.gltf["nodes"])-1)

    def write(self, path):
        while len(self.bin) % 4:
            self.bin.append(0)
        self.gltf["buffers"].append({"byteLength": len(self.bin)})
        for key in ("images", "textures"):
            if not self.gltf[key]:
                del self.gltf[key]
        text = json.dumps(self.gltf, ensure_ascii=False, separators=(",", ":")).encode()
        text += b" "*(-len(text) % 4)
        body = struct.pack("<II", len(text), 0x4E4F534A)+text+struct.pack("<II", len(self.bin), 0x004E4942)+self.bin
        path.write_bytes(struct.pack("<III", 0x46546C67, 2, 12+len(body))+body)


def to_image(point, camera):
    x, y, _, width = camera
    height = width*9/16
    return ((point[0]-x)/width+.5, .5-(point[1]-y)/height)


def box_of(points, camera):
    if not points:
        return None
    uv = [to_image(p, camera) for p in points]
    return [min(u for u, _ in uv), min(v for _, v in uv), max(u for u, _ in uv), max(v for _, v in uv)]


def actors(scene, graph, zone, camera):
    """Cutia fiecărui personaj vizibil și cutia brațelor lui (umeri, coate, mâini)."""
    found = []
    for rig in bpy.data.collections[zone].all_objects:
        if rig.type != "ARMATURE" or "hand.R" not in rig.pose.bones:
            continue
        coll = bpy.data.collections.get(rig.name[4:])
        if coll is None:
            continue
        points = []
        for obj in coll.all_objects:
            evaluated = obj.evaluated_get(graph)
            if obj.type == "MESH" and not evaluated.hide_render:
                points.extend(evaluated.matrix_world @ Vector(corner) for corner in obj.bound_box)
        body = box_of(points, camera)
        if body is None or body[2] < 0 or body[0] > 1 or body[3] < 0 or body[1] > 1:
            continue
        arms, hands = [], {}
        for side in "RL":
            for bone in ("upper_arm.", "forearm.", "hand."):
                pose = rig.pose.bones[bone+side]
                arms.extend((rig.matrix_world @ pose.head, rig.matrix_world @ pose.tail))
            # Mâna cu manșeta: de la mijlocul antebrațului până la vârful mâinii.
            fore, hand = rig.pose.bones["forearm."+side], rig.pose.bones["hand."+side]
            middle = (fore.head+fore.tail)/2
            hands[side] = box_of([rig.matrix_world @ p for p in (middle, hand.head, hand.tail)], camera)
        found.append({"name": coll.name, "box": body, "arms": box_of(arms, camera), "hands": hands})
    return found


def main():
    out, frames = arguments()
    out.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    markers = sorted((m for m in scene.timeline_markers if m.camera), key=lambda m: m.frame)
    for frame in frames:
        shot = max((m for m in markers if m.frame <= frame), key=lambda m: m.frame)
        scene.frame_set(frame)
        scene.camera = shot.camera
        graph = bpy.context.evaluated_depsgraph_get()
        active = shot.camera.evaluated_get(graph)
        x, y, z = active.matrix_world.translation
        width = active.data.ortho_scale
        camera = (x, y, z, width)
        zone = ZONES[round(x/33)]
        objects = set(bpy.data.collections[zone].all_objects)
        objects.update(o for o in bpy.data.collections[OVERLAYS].all_objects if camera_parent(o) == shot.camera)
        glb = Glb()
        for source in sorted((o for o in objects if o.type in {"MESH", "FONT"}), key=lambda o: o.name):
            obj = source.evaluated_get(graph)
            if obj.hide_render or not projected(obj, x, y, width*.51, width*9/32+.06):
                continue
            mesh = obj.to_mesh()
            try:
                glb.add(source.name, mesh, obj.matrix_world)
            finally:
                obj.to_mesh_clear()
        glb.write(out/f"cadru-{frame:04}.glb")
        meta = {"frame": frame, "time": (frame-1)/scene.render.fps, "shot": shot.name,
                "camera": list(camera), "partial": bool(scene.get("coacere_partiala")),
                "actors": actors(scene, graph, zone, camera)}
        (out/f"cadru-{frame:04}.json").write_text(json.dumps(meta, ensure_ascii=False))
        print("CADRU", frame, shot.name, len(glb.gltf["nodes"]), "obiecte", flush=True)


if __name__ == "__main__":
    main()
