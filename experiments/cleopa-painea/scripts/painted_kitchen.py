"""Painted kitchen plates aligned with the episode’s existing animation."""
from pathlib import Path

import bmesh
import bpy

from decor import kitchen, painted_backdrop
from vector_art import collection


ROOM_WIDTH = 18.8
LEGACY_ROOM_OBJECTS = (
    "Ochre limewash", "Structural oak", "Window recess", "Sash, sill and oak casing",
    "Woven window curtains", "Curtain rod", "Bucătărie · podea și laviță",
    "Prag · lumină din ogradă", "Cuptor zidit", "Candle glow",
)


def paint_table(tabletop):
    assets = Path(__file__).resolve().parents[1] / "assets" / "backgrounds"
    image = bpy.data.images.load(str(assets / "masa-si-stergarul.png"), check_existing=True)
    material = bpy.data.materials.new("Masă și ștergar · ilustrație")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    nodes.clear()
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    nodes.active = texture
    emission = nodes.new("ShaderNodeEmission")
    material.node_tree.links.new(texture.outputs["Color"], emission.inputs[0])
    output = nodes.new("ShaderNodeOutputMaterial")
    material.node_tree.links.new(emission.outputs[0], output.inputs["Surface"])

    for obj in tabletop.objects:
        mesh = obj.data
        # The illustration supplies grain. Remove the old random strokes,
        # which can extend beyond the edge of the tabletop.
        if (grain_slot := mesh.materials.find("Ink aa6c48")) >= 0:
            editable = bmesh.new()
            editable.from_mesh(mesh)
            bmesh.ops.delete(editable, geom=[face for face in editable.faces
                                            if face.material_index == grain_slot], context="FACES")
            editable.to_mesh(mesh)
            editable.free()
        uv = mesh.uv_layers.new(name="Ilustrație")
        for loop in mesh.loops:
            coordinate = mesh.vertices[loop.vertex_index].co
            x = coordinate.x * obj.scale.x + obj.location.x
            y = coordinate.y * obj.scale.y + obj.location.y
            # Follow the reference crop and register the tabletop, front
            # rim, and hanging cloth without sampling the blank canvas.
            reference_x = (x / ROOM_WIDTH * 1280 + 640 - 82) / 864
            u = .5 + (reference_x - .5) * .98
            down = max(0, -2.4 - y)
            image_y = .340 + min(down, 1) * .153 + max(0, down - 1) * .129
            uv.data[loop.index].uv = (u, 1 - image_y)
        mesh.materials.clear()
        mesh.materials.append(material)
        for face in mesh.polygons:
            face.material_index = 0


def painted_kitchen(coll):
    loaf, flame = kitchen(coll)
    for name in LEGACY_ROOM_OBJECTS:
        bpy.data.objects.remove(coll.objects[name], do_unlink=True)

    backdrop = collection("Bucătărie · decor pictat", coll)
    painted_backdrop(backdrop, "Bucătărie în zori", "bucatarie-in-zori.png", width=ROOM_WIDTH)
    # The painted hearth opening is slightly left and below the drawing.
    # Move the mesh, leaving the flame’s location keyframes relative to it.
    for vertex in flame.data.vertices:
        vertex.co.x -= .36
        vertex.co.y -= .11

    paint_table(coll.children["Masă și ștergar"])
    return loaf, flame
