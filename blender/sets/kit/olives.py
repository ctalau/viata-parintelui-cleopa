"""Gnarled olives with open crowns of paired, two-tone leaves and twig-level geometry."""
import math
import random

import numpy as np
from mathutils import Matrix, Vector

from . import core, tex
from .critters import blob


def _bark_texture(n=512, seed=52):
    """Longitudinal fissures that follow the UVs around the twisted wood."""
    y, x = np.mgrid[0:n, 0:n] / n
    grain = tex.fbm(n, seed, 1.8, 9, 46, aniso=(0.9, 2.5))
    warp = 0.37 * np.sin(2 * np.pi * y) + 0.17 * np.sin(4 * np.pi * (x + y))
    ridges = 13 * x + warp + 0.11 * grain
    fissures = tex.smooth(0.42, 0.97, np.cos(2 * np.pi * ridges))
    heights = 0.62 + 0.11 * grain - 0.44 * fissures
    color = tex.ramp(tex.norm01(heights), [(0, '#3c342c'), (0.38, '#625646'), (0.73, '#8d7d69'), (1, '#b3a28b')])
    return tex.to8(color), tex.normal_from_height(heights, 5.5), tex.to8(tex.pack_rough(0.88 + 0.07 * fissures))


def _bend(mesh, start, elbow, tip, radius, end_radius, sides, steps=6, twist=0):
    points = [start.lerp(elbow, k / steps).lerp(elbow.lerp(tip, k / steps), k / steps)
              for k in range(steps + 1)]
    widths = [end_radius + (radius - end_radius) * (1 - k / steps) ** 1.25 for k in range(steps + 1)]
    core.tube(mesh, points, widths, sides=sides, uv_v=3.5, twist=twist)
    return points


def _blade(mesh, start, direction, length, width, top, underside, roll):
    """A narrow lanceolate leaf with cupped margins and a lighter lower face."""
    axis = direction.normalized()
    side = axis.cross(Vector((0, 0, 1))).normalized()
    side.rotate(Matrix.Rotation(roll, 3, axis))
    up = side.cross(axis).normalized()
    tip = start + axis * length - up * length * 0.10
    shoulder = start + axis * length * 0.31
    taper = start + axis * length * 0.73
    outline = [mesh.verts.new(p) for p in (start, shoulder + side * width, taper + side * width * 0.73,
                                          tip, taper - side * width * 0.73, shoulder - side * width)]
    middle = start + axis * length * 0.44
    color = mesh.loops.layers.color['Col']
    for rise, shade, reverse in ((0.15, top, False), (-0.10, underside, True)):
        rib = mesh.verts.new(middle + up * width * rise)
        for i, v in enumerate(outline):
            next_v = outline[(i + 1) % len(outline)]
            rim = (next_v, v) if reverse else (v, next_v)
            face = mesh.faces.new((rib, *rim))
            for loop in face.loops:
                brightness = 1.12 if loop.vert == rib else 0.91
                loop[color] = (*(c * brightness for c in shade), 1.0)


def _tree(seed):
    rng = random.Random(seed)
    bark, crown = core.new_bm(), core.new_bm()
    trunk = [Vector(p) for p in ((0, 0, -0.18), (0.04, -0.03, 0.38), (0.34, 0.03, 1.24),
                                (0.07, 0.31, 2.35), (-0.36, 0.47, 3.45), (-0.63, 0.40, 4.35))]
    core.tube(bark, trunk, [1.12, 0.87, 0.66, 0.65, 0.50, 0.32], sides=20, uv_v=3.5, twist=0.62)
    core.displace(bark, 0.18, 0.76, seed=seed, octaves=2)
    for i in range(5):
        a = i * math.tau / 5 + rng.uniform(-0.25, 0.25)
        outward = Vector((math.cos(a), math.sin(a), 0))
        _bend(bark, trunk[2].lerp(trunk[1], 0.45), outward * 0.68 + Vector((0, 0, 0.7)),
              outward * rng.uniform(1.15, 1.58) + Vector((0, 0, -0.12)),
              rng.uniform(0.28, 0.44), 0.035, sides=9, steps=7, twist=0.32)

    rotation = rng.uniform(0, math.tau)
    for i in range(6):
        a = rotation + i * math.tau / 6 + rng.uniform(-0.23, 0.23)
        out = Vector((math.cos(a), math.sin(a), 0))
        side = Vector((-out.y, out.x, 0))
        root = trunk[3].lerp(trunk[5], rng.uniform(0.18, 0.85)) if i % 3 else trunk[2].lerp(trunk[3], 0.56)
        extent = rng.uniform(2.13, 3.22)
        peak = rng.uniform(5.8, 7.42)
        elbow = root + out * (extent * 0.37) + side * rng.uniform(-0.43, 0.43)
        elbow.z = root.z + rng.uniform(1.5, 2.08)
        end = out * extent + side * rng.uniform(-0.40, 0.40)
        end.z = peak
        limb = _bend(bark, root, elbow, end, rng.uniform(0.39, 0.52), 0.055, sides=13, steps=8, twist=0.42)

        for j in range(5):
            start = limb[3 + j]
            sense = -1 if j % 2 else 1
            direction = out * rng.uniform(0.35, 0.83) + side * sense * rng.uniform(0.72, 1.22)
            direction.z = rng.uniform(0.33, 0.84)
            end = start + direction * rng.uniform(0.93, 1.37)
            elbow = start.lerp(end, 0.46) + Vector((0, 0, 0.18))
            secondary = _bend(bark, start, elbow, end, 0.13 if j < 2 else 0.082, 0.010, sides=8)
            # Terminal shoots diverge in three dimensions, leaving gaps between the crowns of the limbs.
            for k, rootlet in enumerate(secondary[1:]):
                phi = a + k * 2.39 + rng.uniform(-0.58, 0.58)
                span = Vector((math.cos(phi), math.sin(phi), rng.uniform(-0.14, 0.72)))
                span = (span + direction * 0.48).normalized() * rng.uniform(0.64, 1.04)
                tip = rootlet + span
                shoot = _bend(bark, rootlet, rootlet.lerp(tip, 0.50) + Vector((0, 0, 0.12)),
                              tip, 0.026, 0.004, sides=5, steps=7)
                for q, stem in enumerate(shoot[1:]):
                    across = Vector((-span.y, span.x, 0)).normalized()
                    across.rotate(Matrix.Rotation(rng.uniform(-1.2, 1.2), 3, span))
                    for sign in (-1, 1):
                        leaf_dir = span.normalized() * rng.uniform(0.37, 0.72) + across * sign
                        leaf_dir.z += rng.uniform(-0.28, 0.22)
                        shade = rng.uniform(0.74, 1.19) * (0.90 + q * 0.055)
                        color = (0.147 * shade, 0.227 * shade, 0.106 * shade)
                        silver = (0.38 * shade, 0.45 * shade, 0.32 * shade)
                        _blade(crown, stem, leaf_dir, rng.uniform(0.35, 0.53), rng.uniform(0.055, 0.084),
                               color, silver, rng.uniform(-0.68, 0.68))
                if j > 0 and k % 3 == 1 and rng.random() < 0.7:
                    for sign in (-1, 1):
                        fruit = shoot[2] + side * sign * 0.07 + Vector((0, 0, -0.11))
                        olive = rng.choice(((0.23, 0.29, 0.085), (0.31, 0.36, 0.11), (0.115, 0.089, 0.056)))
                        blob(crown, fruit, (0.062, 0.064, 0.100), olive, subdiv=2)
    pivot = Vector((0, 0, 4.3))
    core.transform(crown, Matrix.Translation(-pivot))
    return bark, crown, pivot


class OliveTrees:
    """Share a few distinct olive meshes across each set. Only the foliage moves in the breeze."""

    def __init__(self, scene):
        self.scene = scene
        bark_tex = core.texset('olive_wood_fissures', _bark_texture, n=512)
        self.bark = core.material('olive_bark', bark_tex, rough=0.9)
        self.crown = core.material('olive_leaves', None, vcol=True, rough=0.87)
        self.prototypes = {}

    def add(self, name, x, z, face, y, height, variant, phase=0):
        transform = core.place(x, z, face, y, height / 9.5)
        root = self.scene.group(name, transform)
        wind = {'anim': 'sway', 'amp': 0.009, 'freq': 0.30, 'phase': phase}
        if variant in self.prototypes:
            trunk, leaves, pivot = self.prototypes[variant]
            self.scene.obj(name + '.wood', None, None, Matrix.Identity(4), parent=root, mesh=trunk)
            self.scene.obj(name + '.leaves', None, None, Matrix.Translation(pivot),
                           parent=root, props=wind, mesh=leaves)
        else:
            wood, foliage, pivot = _tree(52 + variant * 71)
            trunk = self.scene.obj(name + '.wood', wood, self.bark, Matrix.Identity(4), parent=root, vcol=False)
            leaves = self.scene.obj(name + '.leaves', foliage, self.crown, Matrix.Translation(pivot),
                                    parent=root, props=wind)
            self.prototypes[variant] = (trunk.data, leaves.data, pivot)
