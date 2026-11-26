"""Run ONLY in a fresh Blender process; creates a throwaway rig and render."""
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'renders' / 'smoke_test'
OUT.mkdir(parents=True, exist_ok=True)
# Keep the test isolated from any open production scene.
assert bpy.app.background, 'Run with blender -b --factory-startup'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
arm = bpy.data.armatures.new('SmokeArmature')
rig = bpy.data.objects.new('SmokeRig', arm)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
bone = arm.edit_bones.new('arm.R')
bone.head = (0, 0, 0)
bone.tail = (0, 1, 0)
bpy.ops.object.mode_set(mode='OBJECT')
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0.5, 0))
part = bpy.context.object
part.name = 'SmokeArmPart'
part.scale = (0.16, 0.5, 0.05)
world = part.matrix_world.copy()
part.parent = rig
part.parent_type = 'BONE'
part.parent_bone = 'arm.R'
bpy.context.view_layer.update()
part.matrix_world = world
bpy.context.view_layer.update()
rest = part.matrix_world.translation.copy()
pose = rig.pose.bones['arm.R']
pose.rotation_mode = 'XYZ'
pose.rotation_euler = (0, 0, 0)
pose.keyframe_insert(data_path='rotation_euler', frame=1)
pose.rotation_euler = (0, 0, 1.0)
pose.keyframe_insert(data_path='rotation_euler', frame=24)
scene.frame_set(24)
bpy.context.view_layer.update()
assert (part.matrix_world.translation - rest).length > 0.05, 'Bone parenting test failed'
mat = bpy.data.materials.new('SmokeEmission')
mat.use_nodes = True
nodes = mat.node_tree.nodes
nodes.clear()
shader = nodes.new('ShaderNodeEmission')
shader.inputs['Color'].default_value = (0.15, 0.45, 0.8, 1)
output = nodes.new('ShaderNodeOutputMaterial')
mat.node_tree.links.new(shader.outputs[0], output.inputs['Surface'])
part.data.materials.append(mat)
cam_data = bpy.data.cameras.new('SmokeCamera')
cam = bpy.data.objects.new('SmokeCamera', cam_data)
scene.collection.objects.link(cam)
cam.location = (0, 0.5, 6)
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 3
scene.camera = cam
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 4
scene.cycles.use_denoising = False  # The test uses a flat emitter and needs no denoiser.
scene.render.resolution_x = 320
scene.render.resolution_y = 240
scene.render.resolution_percentage = 100
scene.render.fps = 24
scene.frame_end = 24
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(OUT / 'frame_0024.png')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'smoke.blend'))
bpy.ops.render.render(write_still=True)
assert (OUT / 'frame_0024.png').is_file()
print('SMOKE_OK', bpy.app.version_string, OUT)
