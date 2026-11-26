#!/usr/bin/env python3
"""Rebuild the Blender sets deterministically → assets/sets/<name>.glb + <name>.json.

    python3 blender/sets/build.py                 # every set
    python3 blender/sets/build.py desert-road     # one set
    python3 blender/sets/build.py market-square --no-bake   # fast geometry check (no AO bake)
Needs `pip install bpy` (Blender as a Python module, 5.x).
"""
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(ROOT, 'assets', 'sets')

import bpy  # noqa: E402,F401  (provides mathutils)
import desert_road  # noqa: E402
import cave_hermitage  # noqa: E402
import market_square  # noqa: E402
import river_ford  # noqa: E402
import harvest_field  # noqa: E402
import nile_village  # noqa: E402
import sheepfold  # noqa: E402
import mountain_spring  # noqa: E402
import desert_rock  # noqa: E402
import bakery_yard  # noqa: E402
import cell_room  # noqa: E402
import olive_hermitage  # noqa: E402
import palm_gardens  # noqa: E402

SETS = {'desert-road': desert_road, 'cave-hermitage': cave_hermitage, 'market-square': market_square, 'river-ford': river_ford, 'harvest-field': harvest_field, 'nile-village': nile_village, 'sheepfold': sheepfold, 'mountain-spring': mountain_spring, 'desert-rock': desert_rock, 'bakery-yard': bakery_yard, 'cell-room': cell_room, 'olive-hermitage': olive_hermitage}
SETS['palm-gardens'] = palm_gardens

if __name__ == '__main__':
    request = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
    args = [a for a in request if not a.startswith('--')]
    bake = '--no-bake' not in request
    for name in args or list(SETS):
        t = time.time()
        SETS[name].build(OUT, bake=bake)
        p = os.path.join(OUT, name + '.glb')
        print(f'{name}: {os.path.getsize(p) / 1e6:.2f} MB in {time.time() - t:.0f}s → {os.path.relpath(p, ROOT)}')
