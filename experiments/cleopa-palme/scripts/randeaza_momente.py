"""Randează momentele din `momente.py` în prim-plan, pentru foaia de contact.

    blender -b <scena.blend> --python-exit-code 1 --python randeaza_momente.py -- \
        --out ../renders/baza [--faza 1|2]

Pentru fiecare cadru se pune o cameră ortografică frontală, centrată pe pieptul
personajului, iar camera activă a filmului se randează separat, ca referință.
"""
from pathlib import Path
import sys

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from momente import moments  # noqa: E402

args = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
out = Path(args[args.index("--out")+1]).resolve()
phase = int(args[args.index("--faza")+1]) if "--faza" in args else 1
only = args[args.index("--doar")+1].split(",") if "--doar" in args else None
out.mkdir(parents=True, exist_ok=True)
scene = bpy.context.scene
render = scene.render
film_camera = {}

data = bpy.data.cameras.new("Inspecție · prim-plan")
close = bpy.data.objects.new("Inspecție · prim-plan", data)
scene.collection.objects.link(close)
data.type = "ORTHO"

rows = [m for m in moments() if (phase == 2) == (not m[1].startswith("Mama"))]
for id_, actor, title, frames in rows:
    if only and id_ not in only:
        continue
    rig = bpy.data.objects["RIG_"+actor]
    for index, frame in enumerate(frames):
        scene.frame_set(frame)
        film = scene.camera
        top = rig.matrix_world @ rig.pose.bones["head"].tail
        hip = rig.matrix_world @ rig.pose.bones["pelvis"].head
        span = top.y-hip.y
        close.location = ((top.x+hip.x)/2, hip.y+.42*span, 20)
        data.ortho_scale = 1.45*span
        render.resolution_x = render.resolution_y = 520
        bound = {m: m.camera for m in scene.timeline_markers if m.camera}
        for marker in bound:
            marker.camera = None
        scene.camera = close
        render.filepath = str(out/f"{id_}_{index}_aproape.png")
        bpy.ops.render.render(write_still=True)
        for marker, camera in bound.items():
            marker.camera = camera
        scene.camera = film
        render.resolution_x, render.resolution_y = 640, 360
        render.filepath = str(out/f"{id_}_{index}_film.png")
        bpy.ops.render.render(write_still=True)
        print("MOMENT", id_, index, frame, film.name, flush=True)
