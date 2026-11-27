"""Prim-plan pe o mână, pentru verificarea palmelor 2.5D.

    blender -b <scena> --python zoom_mana.py -- --actor "Mama · bucătărie" --side R \
        --frames 1089,2599 --out <folder> [--size 0.9]
"""
from pathlib import Path
import sys

import bpy

args = sys.argv[sys.argv.index("--")+1:]
opt = {args[i][2:]: args[i+1] for i in range(0, len(args), 2)}
scene = bpy.context.scene
rig = bpy.data.objects["RIG_"+opt["actor"]]
out = Path(opt["out"])
out.mkdir(parents=True, exist_ok=True)
data = bpy.data.cameras.new("Inspecție · mână")
cam = bpy.data.objects.new("Inspecție · mână", data)
scene.collection.objects.link(cam)
data.type = "ORTHO"
for marker in scene.timeline_markers:
    marker.camera = None
scene.camera = cam
scene.render.resolution_x = scene.render.resolution_y = int(opt.get("px", 640))
for frame in map(int, opt["frames"].split(",")):
    scene.frame_set(frame)
    wrist = rig.matrix_world @ rig.pose.bones["hand."+opt["side"]].head
    cam.location = (wrist.x, wrist.y+float(opt.get("dy", 0)), 20)
    data.ortho_scale = float(opt.get("size", .9))*rig.matrix_world.to_scale().x
    scene.render.filepath = str(out/f"{opt['side']}_{frame}.png")
    bpy.ops.render.render(write_still=True)
