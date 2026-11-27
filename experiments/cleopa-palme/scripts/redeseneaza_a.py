"""Redesenează o poză A după silueta C din cadrul de trecere (HANDOFF §5, pasul 5).

    blender -b scenes/painea_care_poate_sa_astepte.blend --python ../cleopa-palme/scripts/redeseneaza_a.py -- \
        --actor "Mama · bucătărie" --side R --frame 2863 --contact .20,-.70

Tipărește conturul (drum Q) și liniile de despărțire a degetelor, în unitățile
desenelor din `hands.py`: încheietura la origine, degetele spre −y, mâna dreaptă
oglindită ca în `Art` (x × semn). Rezultatul se copiază în `hands.py` ca desen de autor.
"""
from math import cos, sin
from pathlib import Path
import json
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]/"cleopa-painea"
sys.path.insert(0, str(ROOT/"scripts"))
import palme25d as P  # noqa: E402
import palme25d_bake as B  # noqa: E402

args = sys.argv[sys.argv.index("--")+1:]
opt = {args[i][2:]: args[i+1] for i in range(0, len(args), 2)}
scene = bpy.context.scene
rig = bpy.data.objects["RIG_"+opt["actor"]]
coll = bpy.data.collections[opt["actor"]]
side, target = opt["side"], int(opt["frame"])
cx, cy = map(float, opt["contact"].split(","))
p = json.loads(rig["palme25d_profile"])
start, end = B.visible_range(coll, scene)
state, memory = {}, {"__stable__": P.ORDER_HYSTERESIS}
for frame in B.drawn(start, target+1):
    scene.frame_set(frame)
    data = B.hand_frame(rig, p, side, frame, state)
    h, built = B.build_c(p, side, data, memory)
fills = [shape["pts"] if shape["t"] == "poly" else P.capsule_ring(shape["a"], shape["b"], shape["ra"], shape["rb"])
         for g in built["groups"] for shape in g["shapes"]]
theta = B.finger_angle(h["axes"])
contact = h["contact"]
sign, hand = P.side_sign(side), p["hand"]
c, s = cos(-theta), sin(-theta)


def local(pt):
    """Spațiul rigului → coordonatele desenului (inversul ancorării)."""
    dx, dy = pt[0]-contact[0], pt[1]-contact[1]
    rx, ry = dx*c-dy*s, dx*s+dy*c
    return (cx+rx/(hand*sign), cy+ry/hand)


outline = P.trace_outline([[local(q) for q in poly] for poly in fills], size=220, tolerance=.006)
digits = {d["id"]: [local(q) for q in d["pts"]] for d in h["digits"]}
creases = []
for a, b in (("aratator", "mijlociu"), ("mijlociu", "inelar"), ("inelar", "mic")):
    tip = P.lerp2(digits[a][3], digits[b][3], .5)
    knuckle = P.lerp2(digits[a][1], digits[b][1], .5)
    creases.append(P.q_path([tip, P.lerp2(tip, knuckle, .5), knuckle], closed=False))
thumb = digits["mare"]
creases.insert(0, P.q_path([thumb[1], P.lerp2(thumb[1], thumb[2], .5), thumb[2]], closed=False))
print("OUTLINE", P.q_path(outline))
for line in creases:
    print("CREASE", line)
