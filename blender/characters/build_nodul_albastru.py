"""Build the three portrait heads for the shared monk body.

blender -b -P blender/characters/build_nodul_albastru.py
"""

import argparse
import sys
from pathlib import Path

import bpy

HERE = Path(__file__).resolve().parent
sys.path[:0] = [str(HERE), str(HERE.parent / "common")]
import bl
from nodul_albastru import FIGURES, build_portrait, familie, group
from atelier import ramp


def prepare_for_export(head):
    # Keep the hair strokes, with fewer samples between the original control points.
    curves = []
    materials = set()
    for obj in head.children_recursive:
        if obj.hide_render:
            bpy.data.objects.remove(obj, do_unlink=True)
            continue
        if obj.type == "CURVE":
            obj.data.resolution_u = 1
            obj.data.bevel_resolution = 0
            obj.data.use_fill_caps = False
            curves.append(obj)
        materials.update(slot.material for slot in obj.material_slots if slot.material)

    for material in materials:
        tree = material.node_tree
        bsdf = tree.nodes.get("Principled BSDF")
        base = bsdf.inputs["Base Color"]
        if not base.is_linked or base.links[0].from_node.type != "VERTEX_COLOR":
            for link in list(base.links):
                tree.links.remove(link)
            base.default_value = material.diffuse_color
        else:
            base.default_value = (1, 1, 1, 1)
        for link in list(bsdf.inputs["Normal"].links):
            tree.links.remove(link)

    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    for curve in curves:
        name = curve.name
        data = bpy.data.meshes.new_from_object(curve.evaluated_get(depsgraph))
        obj = bl.link(bpy.data.objects.new(name, data))
        obj.parent = curve.parent
        obj.matrix_basis = curve.matrix_basis
        bpy.data.objects.remove(curve, do_unlink=True)
        obj.name = name


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=HERE.parents[1] / "assets/characters/nodul-albastru.glb")
    args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
    bl.reset()
    for preset in FIGURES:
        head = build_portrait(preset)
        beard = next(obj for obj in head.children if obj.get("portraitBeard"))
        bpy.context.view_layer.update()
        matrix = beard.matrix_world.copy()
        hinge = group("Barbă · prindere la obraji", head)
        hinge.location = (0, -.38, 2.34)
        hinge["portraitBeard"] = True
        del beard["portraitBeard"]
        beard.parent = hinge
        bpy.context.view_layer.update()
        beard.matrix_world = matrix
        head.scale *= 1 / familie.UNIT
        prepare_for_export(head)
        bpy.context.view_layer.update()
        portrait_space = head.matrix_world.inverted()
        # Root the cheek strands on the head, with a smooth blend into the swinging ends.
        for layer in beard.children:
            to_portrait = portrait_space @ layer.matrix_world
            weights = layer.data.attributes.new("_BEARD_HEAD", "FLOAT", "POINT")
            weights.data.foreach_set("value", [
                ramp((to_portrait @ v.co).z, 2.19, 2.345) for v in layer.data.vertices
            ])

    bl.export_glb(str(args.out.resolve()), export_animations=False, export_skins=False,
                  export_texcoords=False, export_attributes=True, export_morph=True,
                  export_morph_normal=False)


if __name__ == "__main__":
    main()
