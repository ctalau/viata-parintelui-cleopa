"""Small helpers around bpy, shared by every asset script (characters, sets, props).

Coordinates: helpers take THREE.js coordinates (Y up, front = +Z) and convert to Blender (Z up, front = -Y):
three (x, y, z) -> blender (x, -z, y). The glTF exporter (+Y up) converts back, so what you write in three coords
is exactly what the runtime sees.
"""
import os
import bpy
import numpy as np
from mathutils import Vector, Matrix, Quaternion


def T(x, y=None, z=None):
    if y is None:
        x, y, z = x
    return Vector((float(x), float(-z), float(y)))


def T_arr(P):
    P = np.asarray(P, float)
    return np.stack([P[:, 0], -P[:, 2], P[:, 1]], -1)


def B2T(v):
    return (v[0], v[2], -v[1])


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.fps = 30
    sc.frame_start = 0
    return sc


def link(ob, coll=None):
    (coll or bpy.context.scene.collection).objects.link(ob)
    return ob


def mesh_object(name, verts, faces, uvs=None, mat=None, smooth=True, three=True, coll=None, loop_uvs=None):
    """verts (N,3) in three coords (or blender if three=False), faces: list of index tuples (tri / quad / ngon).
    uvs: per-vertex (N,2) or loop_uvs: per-loop flat list."""
    V = T_arr(verts) if three else np.asarray(verts, float)
    me = bpy.data.meshes.new(name)
    faces = [tuple(int(i) for i in f) for f in faces]
    me.from_pydata(V.tolist(), [], faces)
    me.validate(clean_customdata=False)
    if uvs is not None or loop_uvs is not None:
        uvl = me.uv_layers.new(name='UVMap')
        if loop_uvs is None:
            vi = np.zeros(len(me.loops), dtype=np.int64)
            me.loops.foreach_get('vertex_index', vi)
            loop_uvs = np.asarray(uvs, float)[vi].ravel()
        uvl.data.foreach_set('uv', np.asarray(loop_uvs, float).ravel())
    if smooth:
        me.shade_smooth()
    if mat is not None:
        me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    link(ob, coll)
    return ob


# ---------------------------------------------------------------- images / materials
def image_from_array(name, arr, colorspace='sRGB', fmt='JPEG'):
    """arr: (H, W, 3|4) floats 0..1, row 0 = TOP of the picture."""
    arr = np.asarray(arr, np.float32)
    h, w = arr.shape[:2]
    if arr.shape[2] == 3:
        arr = np.concatenate([arr, np.ones((h, w, 1), np.float32)], -1)
    img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.ascontiguousarray(arr[::-1]).ravel())
    img.file_format = fmt
    img.pack()
    return img


def material(name, color=(1, 1, 1), roughness=0.5, metallic=0.0, base_img=None, rough_img=None, normal_img=None,
             normal_strength=1.0, sheen=0.0, sheen_rough=0.5, sheen_tint=(1, 1, 1), clearcoat=0.0, clearcoat_rough=0.1,
             specular=0.5, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bs = nt.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Roughness'].default_value = roughness
    bs.inputs['Metallic'].default_value = metallic
    if 'Specular IOR Level' in bs.inputs:
        bs.inputs['Specular IOR Level'].default_value = specular
    if base_img is not None:
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = base_img
        nt.links.new(n.outputs['Color'], bs.inputs['Base Color'])
    if rough_img is not None:
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = rough_img
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(n.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], bs.inputs['Roughness'])
    if normal_img is not None:
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = normal_img
        nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = normal_strength
        nt.links.new(n.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bs.inputs['Normal'])
    if sheen > 0:
        bs.inputs['Sheen Weight'].default_value = sheen
        bs.inputs['Sheen Roughness'].default_value = sheen_rough
        bs.inputs['Sheen Tint'].default_value = (*sheen_tint, 1)
    if clearcoat > 0:
        bs.inputs['Coat Weight'].default_value = clearcoat
        bs.inputs['Coat Roughness'].default_value = clearcoat_rough
    return m


# ---------------------------------------------------------------- armature
def armature(name, bones, coll=None):
    """bones: list of dict(name, head, tail (three coords), parent, connect, roll_to (three vec: bone Z axis aim))."""
    arm = bpy.data.armatures.new(name)
    ob = bpy.data.objects.new(name, arm)
    link(ob, coll)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for b in bones:
        e = arm.edit_bones.new(b['name'])
        e.head = T(b['head']); e.tail = T(b['tail'])
        e.use_deform = b.get('deform', True)
        if b.get('roll_to') is not None:
            e.align_roll(T(b['roll_to']))
        eb[b['name']] = e
    for b in bones:
        if b.get('parent'):
            eb[b['name']].parent = eb[b['parent']]
            eb[b['name']].use_connect = b.get('connect', False)
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in ob.pose.bones:
        pb.rotation_mode = 'QUATERNION'
    return ob


def parent_to_bone(ob, rig, bone):
    """Keep the object where it is in the world, but make it follow `bone` rigidly (exported as a child of the joint)."""
    mw = ob.matrix_world.copy()
    ob.parent = rig
    ob.parent_type = 'BONE'
    ob.parent_bone = bone
    bpy.context.view_layer.update()
    ob.matrix_world = mw
    return ob


def skin(ob, rig, weights):
    """weights: dict bone -> (N,) array of vertex weights (normalised here)."""
    names = list(weights)
    W = np.stack([np.asarray(weights[n], float) for n in names], -1)
    W = np.maximum(W, 0)
    # keep at most 4 influences, normalise
    if W.shape[1] > 4:
        order = np.argsort(-W, axis=1)
        mask = np.zeros_like(W, bool)
        np.put_along_axis(mask, order[:, :4], True, axis=1)
        W = np.where(mask, W, 0)
    s = W.sum(1, keepdims=True)
    W = np.where(s > 0, W / np.maximum(s, 1e-9), 0)
    for j, n in enumerate(names):
        vg = ob.vertex_groups.new(name=n)
        nz = np.nonzero(W[:, j] > 1e-4)[0]
        for i in nz:
            vg.add([int(i)], float(W[i, j]), 'REPLACE')
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = rig
    ob.parent = rig
    return ob


def empty(name, pos=(0, 0, 0), coll=None, size=0.1):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = size
    e.location = T(pos)
    link(e, coll)
    return e


def export_glb(path, **kw):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    opts = dict(filepath=path, export_format='GLB', export_yup=True, export_apply=False,
                export_animation_mode='ACTIONS', export_image_format='JPEG', export_jpeg_quality=88,
                export_cameras=False, export_lights=False, export_extras=True, export_skins=True,
                export_morph=False, export_texcoords=True, export_normals=True, export_tangents=False,
                export_optimize_animation_size=True, export_def_bones=False, export_rest_position_armature=True,
                export_anim_slide_to_zero=False, export_force_sampling=False, use_visible=False)
    opts.update(kw)
    bpy.ops.export_scene.gltf(**opts)
