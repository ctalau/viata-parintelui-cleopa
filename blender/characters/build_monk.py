"""Build assets/characters/monk.glb (+ monk.json: parts, sockets, clips metadata) headlessly with bpy.

    python3 blender/characters/build_monk.py            (or: npm run assets)

Deterministic: same scripts -> same GLB. One skinned figure carries every look variant (hidden/shown at runtime) and
every animation clip (authored with IK targets + constraints in clips.py, baked to FK keys).
"""
import os
import sys
import json
import math
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path[:0] = [HERE, os.path.join(HERE, '..', 'common')]
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))

import numpy as np
import bpy
from mathutils import Matrix, Vector

import bl
import monk_model as mm
import monk_clips as mc

OUT = os.path.join(ROOT, 'assets', 'characters')


def socket(name, rig, bone, pos, x=None, y=(0, 1, 0), z=(0, 0, 1)):
    e = bl.empty(name, pos)
    y = np.asarray(y, float); z = np.asarray(z, float)
    z = z - y * np.dot(z, y); z /= np.linalg.norm(z); y /= np.linalg.norm(y)
    x = np.cross(y, z)
    m = Matrix.Identity(4)
    for i, v in enumerate((x, y, z)):
        b = bl.T(v)
        m[0][i], m[1][i], m[2][i] = b[0], b[1], b[2]
    m.translation = bl.T(pos)
    e.matrix_world = m
    bl.parent_to_bone(e, rig, bone)
    return e


def main():
    t0 = time.time()
    only = [a for a in sys.argv[1:] if not a.startswith('-')]
    bl.reset()
    M = mm.make_materials()
    rig = bl.armature('monk', mm.bones())
    parts = mm.build_parts(rig, M)
    print(f'parts: {len(parts)}  ({time.time() - t0:.1f}s)')

    # sockets (contract: hand.R / hand.L grip: +Y along the handle (thumb side), +Z away from the palm)
    sockets = {}
    for s in 'LR':
        W, d, f, p = mm.hand_frame(s)
        g = mm.hpt(s, 0.13, 0.02, 0.085)
        socket(f'hand.{s}', rig, f'hand_{s}', g, y=f, z=p)
        sockets[f'hand.{s}'] = {'bone': f'hand_{s}', 'pos': [round(v, 4) for v in g]}
        tip = mm.hpt(s, 0.31, 0.06, 0.035)
        socket(f'fingertips.{s}', rig, f'hand_{s}', tip, y=-d, z=p)
    socket('head_top', rig, 'head', (0, 3.96, 0))
    socket('beard_tip', rig, 'beard', (0, 1.95, 0.55))
    socket('chest_front', rig, 'chest', (0, 2.40, 0.44))
    socket('back', rig, 'chest', (0, 2.30, -0.44), z=(0, 0, -1))
    socket('face', rig, 'head', (0, 3.45, 0.56))

    # animation clips
    clips_meta = mc.build_clips(rig, only=only or None)
    print(f'clips: {len(clips_meta)}  ({time.time() - t0:.1f}s)')

    # everything visible for export (the runtime picks the variants)
    for ob in bpy.data.objects:
        ob.hide_viewport = False; ob.hide_render = False
    path = os.path.join(OUT, 'monk.glb')
    bl.export_glb(path)
    meta = {
        'figure': {'height': 4.2, 'eye': 3.45, 'shoulder': 2.70, 'hip': mm.HIP_Y, 'seat': mm.SEAT_H, 'footprint': 0.95},
        'parts': {k: {'kind': v['kind'], 'bone': v['bone'], 'group': v['group'], 'variant': v['variant'], 'collide': v['collide']} for k, v in parts.items()},
        'sockets': sockets,
        'clips': clips_meta,
    }
    with open(os.path.join(OUT, 'monk.json'), 'w') as fh:
        json.dump(meta, fh, indent=1, sort_keys=True)
    print(f'wrote {os.path.relpath(path, ROOT)} ({os.path.getsize(path) / 1e6:.2f} MB) in {time.time() - t0:.1f}s')


if __name__ == '__main__':
    main()
