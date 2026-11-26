"""Editable 2D vector primitives, tessellated into flat Blender meshes."""
import math
import re
from collections import defaultdict

import bpy
from mathutils import Vector
from mathutils.geometry import tessellate_polygon


def collection(name, parent=None):
    result = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(result)
    return result


def rgb(code):
    code = code.lstrip('#')
    return tuple(int(code[i:i + 2], 16) / 255 for i in (0, 2, 4))


def material(code):
    name = 'Ink ' + code
    if mat := bpy.data.materials.get(name):
        return mat
    def linear(c):
        return c / 12.92 if c <= .04045 else ((c + .055) / 1.055) ** 2.4
    color = (*map(linear, rgb(code)), 1)
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    emission = nodes.new('ShaderNodeEmission')
    emission.inputs[0].default_value = color
    output = nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    return mat


def path(data):
    """Sample a compact absolute M/L/Q/C/Z drawing string."""
    tokens = iter(re.findall(r'[MLQCZ]|-?(?:\d+\.?\d*|\.\d+)', data))
    points = []
    for command in tokens:
        if command in 'ML':
            points.append(Vector((float(next(tokens)), float(next(tokens)))))
        elif command in 'QC':
            previous = points[-1]
            controls = [Vector((float(next(tokens)), float(next(tokens))))
                        for _ in range(2 if command == 'Q' else 3)]
            for step in range(1, 10):
                t = step / 9
                s = 1 - t
                if command == 'Q':
                    points.append(s*s*previous + 2*s*t*controls[0] + t*t*controls[1])
                else:
                    points.append(s**3*previous + 3*s*s*t*controls[0] +
                                  3*s*t*t*controls[1] + t**3*controls[2])
        elif command == 'Z':
            pass
        else:
            raise ValueError(command)
    return points


def oval(x, y, rx, ry, angle=0, count=44):
    co, si = math.cos(angle), math.sin(angle)
    return [(x + rx*math.cos(t)*co - ry*math.sin(t)*si,
             y + rx*math.cos(t)*si + ry*math.sin(t)*co)
            for t in (math.tau*i/count for i in range(count))]


class Art:
    def __init__(self, name, coll, origin=(0, 0), scale=(1, 1), z=0):
        self.name = name
        self.coll = coll
        self.origin = origin
        self.scale = scale
        self.z = z
        self.layer = 0
        self.parts = defaultdict(lambda: ([], []))

    def polygon(self, points, color, z=None):
        z = self.z + self.layer*.0009 if z is None else z
        self.layer += 1
        ox, oy = self.origin
        sx, sy = self.scale
        vertices, faces = self.parts[color]
        offset = len(vertices)
        coords = [Vector((ox+x*sx, oy+y*sy, z)) for x, y in points]
        triangles = tessellate_polygon([coords])
        vertices.extend(coords)
        faces.extend(tuple(offset+i for i in face) for face in triangles if len(set(face)) == 3)

    def stroke(self, points, color, width=.02, closed=False):
        points = [Vector(point) for point in points]
        if len(points) < 2:
            return
        if closed:
            points.append(points[0])
        normals = []
        for a, b in zip(points, points[1:]):
            d = (b-a).normalized()
            normals.append(Vector((-d.y, d.x)))
        radius = width/2
        directions = [normals[-1] if closed else normals[0], *normals]
        vertices, faces = self.parts[color]
        start = len(vertices)
        ox, oy = self.origin
        sx, sy = self.scale
        z = self.z + self.layer*.0009
        self.layer += 1
        for i, point in enumerate(points):
            a = directions[i]
            b = normals[i] if i < len(normals) else (normals[0] if closed else a)
            direction = (a+b).normalized()
            delta = direction * (radius/max(.43, direction.dot(a)))
            for endpoint in (point+delta, point-delta):
                vertices.append((ox+endpoint.x*sx, oy+endpoint.y*sy, z))
        for i in range(len(points)-1):
            k = start+2*i
            faces.append((k, k+1, k+3, k+2))
        if not closed:
            for point in (points[0], points[-1]):
                self.polygon(oval(*point, radius, radius, count=10), color, z=z+.0001)

    def shape(self, data, color, edge=None, width=.025):
        points = path(data) if isinstance(data, str) else data
        self.polygon(points, color)
        if edge:
            self.stroke(points, edge, width, closed=True)

    def line(self, data, color, width=.025):
        self.stroke(path(data) if isinstance(data, str) else data, color, width)

    def oval(self, x, y, rx, ry, color, edge=None, width=.025, angle=0):
        self.shape(oval(x, y, rx, ry, angle), color, edge, width)

    def rect(self, x0, y0, x1, y1, color, edge=None, width=.025):
        self.shape([(x0,y0), (x1,y0), (x1,y1), (x0,y1)], color, edge, width)

    def diamond(self, x, y, rx, ry, color):
        self.polygon([(x-rx,y), (x,y-ry), (x+rx,y), (x,y+ry)], color)

    def finish(self):
        mesh = bpy.data.meshes.new(self.name)
        vertices, faces, indices = [], [], []
        for index, (color, (points, polygons)) in enumerate(self.parts.items()):
            base = len(vertices)
            vertices.extend(points)
            faces.extend(tuple(base+i for i in face) for face in polygons)
            indices.extend([index]*len(polygons))
            mesh.materials.append(material(color))
        mesh.from_pydata(vertices, [], faces)
        mesh.polygons.foreach_set('material_index', indices)
        mesh.update()
        obj = bpy.data.objects.new(self.name, mesh)
        self.coll.objects.link(obj)
        return obj
