"""A weaver's cell and two date gardens on a single road in the Egyptian desert."""
import json
from math import cos, pi, sin
from pathlib import Path
from random import Random

import numpy as np
from mathutils import Vector

from kit import aimesh, core, pieces, tex
from kit.critters import blob, flowers as wildflowers
from kit.olives import OliveTrees

NAME = 'palm-gardens'


def colour(hex_code):
    srgb = [int(hex_code[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return tuple((c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4) for c in srgb)


def batch(scene, name, shade, double=False, **opts):
    return scene.batch(name, lambda: core.material(name, None, color=colour(shade),
                                                   vcol=opts.get('vcol', False), double=double), **opts)


def plank(batch, size, x, z, height, bevel=0.065, face=0):
    mesh = core.new_bm()
    core.box(mesh, size, bevel=bevel)
    batch.add(mesh, core.place(x, z, face, height))


def terrain(scene):
    # The road, courtyards and thresholds share ground level. Behind the three places
    # low dunes rise in waves, with the broad pale road visible between gardens.
    # Keep one continuous UV sheet for the packed paths and the baked contact shadows.
    w, h = 2048, 1280
    z, x = np.meshgrid(np.linspace(-84, 84, h), np.linspace(-126, 126, w), indexing='ij')
    grain = tex.norm01(tex.fbm(h, 53, 1.4, 14, 510, m=w))
    patches = tex.norm01(tex.fbm(h, 54, 2, 5, 130, m=w))
    road = np.abs(z - 3.7 - 0.65 * np.sin(x * .108))
    verge = np.clip((road - 2 + 1.2 * patches) / 3, 0, 1)
    planted = np.clip((patches - .27) * 2, 0, 1) * verge
    soil = tex.ramp(.55 * grain + .45 * patches, [(0, '#c69463'), (.5, '#e8c59a'), (1, '#f8e0b3')])
    grass = tex.ramp(patches, [(0, '#b79861'), (.5, '#b5ae6f'), (1, '#9fa664')])
    color = soil * (1 - planted[..., None]) + grass * planted[..., None]
    texture = tex.save('garden_path', tex.to8(color), 88)
    ground = scene.batch('ground', lambda: core.material('sandy path and garden beds', (texture, None, None)),
                         ao=(1024, 640), ao_uv=core.UV0)
    mesh = ground.bm
    uv = mesh.loops.layers.uv[core.UV0]
    cols = 85
    depths = [-84, -70, -58, -46, -38, -30, -25, -21, -18, -16, -13, -10]
    depths += list(range(-8, 24, 2)) + [26, 32, 44, 60, 84]
    rows = []
    for z in depths:
        row = []
        for i in range(cols):
            x = (i - (cols - 1) / 2) * 3
            outside = max(0, min(1, (abs(x) - 33) / 25))
            behind = max(0, min(1, (-z - 10) / 18))
            h = behind * (2.0 + 1.15 * cos(x * 0.125 + z * 0.11) + 0.9 * sin(x * 0.062 - z * 0.27))
            h += outside * (0.7 + 0.55 * sin(x * 0.31 + z * 0.1))
            v = mesh.verts.new(core.B(x, h, z))
            row.append(v)
        rows.append(row)
    for front, back in zip(rows, rows[1:]):
        for i in range(cols - 1):
            f = mesh.faces.new((front[i], back[i], back[i + 1], front[i + 1]))
            for loop in f.loops:
                p = loop.vert.co
                loop[uv].uv = ((p.x + 126) / 252, (p.y + 84) / 168)


def cell(scene, wood):
    bench_x, bench_z, seat_h = -23.20, -1.43, 0.66
    for offset in (-0.33, 0, 0.33):
        plank(wood, (4.93, 0.32, 0.20), bench_x, bench_z + offset, seat_h - 0.10)
    for side in (-1, 1):
        plank(wood, (0.24, 0.86, 0.50), bench_x + side * 1.7, bench_z, 0.25)
    scene.col_box('bench', (4.85, 0.65, 0.97), bench_x, bench_z)
    scene.seat('or', -24.08, seat_h, bench_z, 0)
    scene.seat('pavel', -21.93, seat_h, bench_z, 0)
    table(scene, wood, 'weaving table', -25.38, 0.70, 2.62, 1.36, 1.26)


def table(scene, wood, name, x, z, width, depth, top):
    for side in (-1, 1):
        plank(wood, (width, depth / 2 - 0.012, 0.20), x, z + side * depth / 4, top - 0.10)
        for end in (-1, 1):
            leg_x = x + side * (width / 2 - 0.19)
            leg_z = z + end * (depth / 2 - 0.15)
            plank(wood, (0.15, 0.17, top - 0.18), leg_x, leg_z, (top - 0.18) / 2, bevel=0.028)
            scene.col_box(f'{name} leg {side} {end}', (0.15, top - 0.18, 0.17), leg_x, leg_z)
    scene.col_box(name, (width, 0.20, depth), x, z, y=top - 0.20)


def garden(scene, x, brick, cap, gate_x, gate_z, gate_paint, wood):
    for i in range(12):
        length = 1.08
        px = x + (i - 5.5) * 1.05
        plank(brick, (length, 0.57, 0.86 + 0.08 * sin(i * 1.3)), px, -3.66, 0.41, bevel=0.115)
        plank(cap, (length - 0.025, 0.65, 0.17), px, -3.66, 0.88, bevel=0.057)
    scene.col_box(f'garden wall {x}', (12.55, 0.96, 0.58), x, -3.66)
    for side in (-1, 1):
        post = gate_x + side * 1.79
        plank(brick, (0.69, 0.64, 2.10), post, gate_z, 1.00, bevel=0.16)
        plank(cap, (0.78, 0.73, 0.22), post, gate_z, 2.10, bevel=0.09)
        plank(gate_paint, (0.30, 0.25, 2.06), post - side * 0.28, gate_z, 1.0)
        # Leaves are open towards the garden. The central passage is unobstructed.
        for rail_z in (gate_z - 0.44, gate_z - 0.86, gate_z - 1.30):
            plank(gate_paint, (0.17, 0.19, 1.24), post, rail_z, 0.79, bevel=0.027)
        for height in (0.38, 1.08):
            plank(wood, (0.15, 1.29, 0.16), post, gate_z - 0.73, height, bevel=0.028)
        scene.col_box(f'gate {x} {side}', (0.69, 2.18, 0.63), post, gate_z)


def shade_awning(scene, wood, x0, colours):
    x1, z0, z1 = x0 + 4.76, -3.17, -0.88
    for x in (x0, x1):
        for z in (z0, z1):
            plank(wood, (0.15, 0.17, 3.80), x, z, 1.89)
            scene.col_box(f'awning post {x} {z}', (0.17, 3.8, 0.17), x, z)
    for z in (z0, z1):
        plank(wood, (5.1, 0.17, 0.19), (x0 + x1) / 2, z, 3.76)
    for i in range(9):
        shade = colours[i % len(colours)]
        cloth = batch(scene, 'linen shade ' + shade, shade, double=True, ao=False)
        mesh = core.new_bm()
        grid = []
        for j in range(13):
            q = j / 12
            z = z0 - 0.16 + q * (z1 - z0 + 0.41)
            sag = 0.19 * sin(pi * q)
            grid.append([mesh.verts.new(core.B(x0 - 0.16 + (i + u) * 0.57,
                                               3.89 - sag - (0.20 if j == 12 else 0), z))
                         for u in (0, 0.5, 1)])
        for a, b in zip(grid, grid[1:]):
            for k in range(2):
                mesh.faces.new((a[k], b[k], b[k + 1], a[k + 1]))
        cloth.add(mesh)


def garden_buildings(scene):
    # Textured masonry from 052, orchard pottery and stacked wood from 050–051.
    models = {}
    def place_model(name, x, z, angle, height, y=0):
        if name not in models:
            ob = aimesh.load(name)
            lo, hi = aimesh.bounds(ob)
            aimesh.fit(ob, 1 / (hi[2] - lo[2]), ground=lo[2], centre=(lo + hi)[:2] / 2)
            size = aimesh.bounds(ob)
            ob = aimesh.finish(scene, ob, name, core.place(x, z, angle, y, height))
            models[name] = (ob, size[1] - size[0])
        else:
            ob, _ = models[name]
            aimesh.share(scene, ob, name + '.copy', core.place(x, z, angle, y, height))
        _, size = models[name]
        scene.col_box(name, (size[0] * height, height, size[1] * height), x, z, angle, y=y)

    place_model('pimen-chilie', -21.4, -9.0, 9, 8.8)
    place_model('piatra-lemne', -28.1, -4.3, -18, 1.4)
    place_model('pitarie-chiupuri', -16.4, -3.5, 20, 1.6)
    place_model('piatra-cosuri', -7.8, -2.4, 25, 1.2)
    place_model('pitarie-chiupuri', 14.3, -2.0, -30, 1.5)
    place_model('piatra-cosuri', 28.9, -1.1, -27, 1.3)
    for x, z, h in [(-36, -11, 2.6), (-11, -6, 1.9), (9.2, -5.8, 2.0), (39, -10, 2.8)]:
        place_model('pimen-bolovani', x, z, x * 5, h)
    for x, z in [(-31, -1), (-14, -1.2), (8.9, -.5), (30.6, .3)]:
        place_model('pimen-tufa-flori', x, z, x * 9, 1.5)
    place_model('pimen-chilie', 5.5, -22, -22, 5.2, 1)
    place_model('chilie-alba', 32, -27, 12, 6.6, 2)


def plant_life(scene):
    rng = Random(53)
    bark = batch(scene, 'palm trunks', '#b76d3d', ao=False)
    leaves = core.material('palm green', None, vcol=True, rough=0.73)
    dry = batch(scene, 'dry palm leaves', '#b18848', ao=False)
    dates = batch(scene, 'ripening dates', '#ffc58f', vcol=True, ao=False)
    scars = batch(scene, 'palm bark seams', '#955f38', ao=False)
    for i, (x, z, h) in enumerate(((-29.8, -9.3, 8.7), (-14, -9.0, 10.0), (-9.7, -8.6, 7.6),
                                    (-1.4, -7.7, 8.4), (7.8, -9.7, 8.1), (13.1, -10.9, 8.8),
                                    (21.3, -6.2, 8.9), (29.8, -7.5, 10.1), (34.1, -9.2, 7.9))):
        lean = (-0.47 if i % 2 else 0.51, 0.22)
        p = pieces.palm(60 + i, height=h, lean=lean, fronds=11, dates=i % 3 != 0)
        cm = core.place(x, z)
        bark.add(p['bark'], cm)
        bark.add(p['bark_boss'], cm)
        dry.add(p['dry'], cm)
        if 'dates' in p:
            dates.add(p['dates'], cm)
        scene.obj(f'palm crown {i}', p['leaf'], leaves, cm, props={'anim': 'sway', 'speed': 0.19, 'amp': 0.02})
        # Short rings catch light on the curved trunk.
        for j in range(15):
            t = (j + 1) / 17
            radius = 0.423 * (1 - 0.35 * t) + 0.06 * (1 - t) ** 6
            cx, cy = (v * t * t * h * 0.18 for v in lean)
            mesh = core.new_bm()
            core.tube(mesh, [Vector((cx + radius * cos(a * pi / 6), cy + radius * sin(a * pi / 6),
                                     t * h + 0.044 * cos(a * pi / 3))) for a in range(12)],
                      0.024, sides=5, closed=True)
            scars.add(mesh, cm)
        scene.col_box('palm ' + str(i), (1.3, h, 1.25), x, z)

    shrubs = batch(scene, 'garden shrubs', '#ffffff', vcol=True, ao=False)
    twigs = batch(scene, 'garden twigs', '#ad744b', ao=False)
    flowers = batch(scene, 'garden flowers', '#ffffff', vcol=True, ao=False)
    for i, (x, z, r) in enumerate(((-27.6, -2.6, 1.42), (-15.1, -3.8, 1.1), (-11.2, -2.2, 1.02),
                                    (-6.5, 0.5, 0.68), (-5.85, -4.2, 1.47), (1.7, -4.7, 1.34),
                                    (7.6, -2.26, 1.3), (13.6, -4.3, 1.4), (16.4, -4.96, 1.24),
                                    (24.45, -2.12, 0.92), (29.45, -2.80, 1.42), (32.4, 0.2, 1.18))):
        bush = pieces.bush(seed=81 + i, r=r, h=r, green=(0.19, 0.35, 0.074))
        shrubs.add(bush['shrub'], core.place(x, z))
        twigs.add(bush['twig'], core.place(x, z))
        scene.col_box(f'shrub {i}', (r * 1.65, r, r * 1.58), x, z)
        pos = core.B(x, 0, z)
        flower_mesh = core.new_bm()
        for _ in range(14):
            dx, dy = rng.uniform(-0.75, 0.75) * r, rng.uniform(-0.83, -0.37) * r
            h = r * rng.uniform(0.45, 0.87)
            shade = colour(rng.choice(('#f5ad6e', '#ed7b64', '#ffe3a1')))
            for p in range(5):
                a = p * 2 * pi / 5
                blob(flower_mesh, (pos.x + dx + 0.067 * cos(a), pos.y + dy, h + 0.067 * sin(a)),
                     (0.058, 0.041, 0.058), shade, subdiv=1)
            blob(flower_mesh, (pos.x + dx, pos.y + dy - 0.026, h),
                 (0.038, 0.034, 0.038), colour('#f7ba41'), subdiv=1)
        flowers.add(flower_mesh)

    # Orchard rows break up the horizon. Leave the full width of the actors' road clear.
    olives = OliveTrees(scene)
    for i, (x, z, height) in enumerate([(-34, -4, 7.4), (-9.5, -13, 6.8), (-2, -14, 6.4),
                                        (6.5, -13.5, 6.0), (15.3, -14, 6.7), (26, -13, 6.3),
                                        (34.5, -15, 6.2), (40, -5.5, 7.4)]):
        olives.add('olive ' + str(i), x, z, 41 * i, 0, height, i % 2, phase=i)
        scene.col_box('olive trunk ' + str(i), (1.1, height, 1.1), x, z)

    verges = batch(scene, 'sage and straw', '#ffffff', double=True, vcol=True, ao=False)
    daisies = batch(scene, 'flowers by the road', '#ffffff', double=True, vcol=True, ao=False)
    for i in range(120):
        x = rng.uniform(-38, 38)
        z = rng.choice((rng.uniform(-9, -4), rng.uniform(6.9, 8.8)))
        h = rng.uniform(.24, .67)
        verges.add(pieces.tuft(5350 + i, r=.42, h=h, n=18, dry=.3), core.place(x, z))
        if i % 4 == 0:
            daisies.add(wildflowers(5390 + i, n=7, radius=.42), core.place(x + .28, z))

    pebbles = batch(scene, 'smooth warm stones', '#ffffff', vcol=True, ao=False)
    for i in range(76):
        x = rng.uniform(-41, 41)
        z = rng.choice((-1, 1)) * rng.uniform(0.12, 3.0) + (7.8 if i % 3 == 0 else -7.7)
        scale = rng.uniform(0.16, 0.49)
        me = core.rock(i + 107, (scale, scale * 0.65, scale * 0.42), facets=5, subdiv=1, sink=0.01)
        pebbles.add(me, core.place(x, z, face=i * 37),
                    colour(rng.choice(('#d5966b', '#eab98d', '#ce9d81', '#f3c88e'))))


def build(out_dir, bake=True):
    core.reset()
    scene = core.Scene(NAME)
    terrain(scene)
    wood = batch(scene, 'sun warmed wood', '#a9663b', ao=False)
    cell(scene, wood)
    garden(scene, 0, batch(scene, 'peach mud bricks', '#d99568', ao=False),
           batch(scene, 'rose coping', '#bf6f55', ao=False), 3.7, -1.20,
           batch(scene, 'gold garden gate', '#bd823f', ao=False), wood)
    garden(scene, 20, batch(scene, 'second mud brick wall', '#dfa474', ao=False),
           batch(scene, 'turquoise coping', '#68a69b', ao=False), 26.5, -0.75,
           batch(scene, 'turquoise garden gate', '#4a8f88', ao=False), wood)
    shade_awning(scene, wood, -5.94, ('#d88361', '#f1c085'))
    table(scene, wood, 'woven goods counter', -3.60, -1.75, 3.9, 1.45, 1.2)
    shade_awning(scene, wood, 16.2, ('#588e89', '#f6dbaf'))
    table(scene, wood, 'palm seller counter', 18.45, -1.79, 3.85, 1.32, 1.2)
    table(scene, wood, 'garden cash table', 17.32, 0.12, 1.13, 0.77, 1.31)
    plant_life(scene)
    garden_buildings(scene)

    anchors = (
        ('door', -20.63, -4.15, 0, 0), ('threshold', -20.57, -3.35, 0, 0),
        ('bench', -23.0, -1.43, 0, 0.66), ('weaving-table', -25.38, 0.70, 0, 1.26),
        ('work-basket', -25.65, 1.02, 0, 1.26), ('tool-cloth', -24.74, 0.97, 0, 1.26),
        ('home-yard', -22, 2.25, 0, 0), ('home-road', -18.6, 3.20, 90, 0),
        ('road-bend', -9.4, 3.65, 90, 0), ('first-gate', 3.7, -1.2, 0, 0),
        ('first-yard', -0.6, 1.72, 0, 0), ('road-east', 10, 4.65, 90, 0),
        ('second-yard', 20.3, 1.75, 0, 0), ('cashbox', 17.32, 0.12, 0, 1.31),
        ('jar', 22.98, -0.60, 0, 0), ('mat', 20.57, 0.62, 0, 0),
        ('second-gate', 26.5, -0.75, 0, 0)
    )
    for name, x, z, face, height in anchors:
        scene.anchor(name, x, z, face, height)
    scene.finalize()
    if bake:
        scene.bake_ao(samples=28, distance=2.8, max_size=1024, blur=0.7, floor=0.25)
    out = Path(out_dir)
    scene.export(str(out / (NAME + '.glb')))
    meta = {
        'name': NAME, 'anchors': scene.anchors, 'seats': scene.seats,
        'bounds': [[-126, 0, -84], [126, 14, 84]], 'skies': ['morning', 'day', 'evening'],
        'sky': {'morning': {'sunAz': -31, 'sunElev': 34, 'sunColor': '#ffe0b5', 'exposure': 1.1,
                            'envIntensity': 0.82, 'mid': '#abc9e7', 'grade': {'warm': 0.06, 'sat': 1.1}}},
        'notes': 'One road, a domed stone cell, olive groves, a shaded palm garden and a turquoise-gated second garden.'
    }
    (out / (NAME + '.json')).write_text(json.dumps(meta, indent=1, ensure_ascii=False) + '\n')
