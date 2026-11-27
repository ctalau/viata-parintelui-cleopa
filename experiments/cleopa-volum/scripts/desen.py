"""Wrap the episode's 2D Mama drawings onto the volumetric body.

The 2D Mama of the series is built in the same Blender session, with the same
overrides as in the episode. Its head, shirt, waist, skirt, sleeve bands and leg
wraps keep every shape, stroke and embroidery motif. Each drawing is subdivided
and laid on a 3D surface:

* the head drawing on the head ellipsoid by orthographic projection: seen from
  the front it is exactly the 2D head; beyond the face it continues around the
  sides and over the top, so the scarf wraps the skull;
* the clothes on the torso, the skirt, the arm tubes and the shins. Row by row,
  the drawing's own silhouette lands on the 3D silhouette and the inner motifs
  keep their places.

Layers keep the order of the drawing as small offsets along the normal. Each
wrapped piece is skinned with the weights of the surface it lies on.
"""
from math import asin, atan2, cos, pi, sin, sqrt
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT/"cleopa-painea"/"scripts"), str(ROOT/"cleopa-blender"/"scripts")]

R0 = .9            # beyond this share of the radius the projection keeps its slope and wraps
STEP = .0006       # offset between successive colours (strokes) inside one drawing piece
PIECE = .0025      # offset between drawing pieces, in the order they are stacked in 2D
GAP = .002         # first layer above the surface
MAX_EDGE = .09     # drawing edges are split below this length (2D units) before wrapping


def episode_mother():
    """The 2D Mama with the episode's proportions, at rest, as raw drawing data."""
    from build_characters import create_character, profile
    from hands import HAND_POSES
    from sleeves import continuous_sleeves
    base = profile("mother")
    overrides = {
        "soft_shoulder": True, "shoulder_x": base["shoulder_x"]*.95, "shoulder_y": base["shoulder_y"]-.135,
        "collar_y": base["shoulder_y"]-.045, "upper": base["upper"]*.86, "lower": base["lower"]*.82,
        "hand": base["hand"]*1.02, "shirt": "ffedcb", "shade": "dfb991", "skin": "f5b488", "skin_shadow": "e1946d",
    }
    p, rig, coll, *_ = create_character("mother", overrides=overrides, sleeve_builder=continuous_sleeves,
                                        hand_poses=HAND_POSES)
    graph = bpy.context.evaluated_depsgraph_get()
    drawings = {}
    for obj in coll.all_objects:
        if obj.type != "MESH":
            continue
        evaluated = obj.evaluated_get(graph)
        if evaluated.hide_render:
            continue
        mesh = evaluated.to_mesh()
        name = obj.name.split(" / ")[-1]
        drawings[name] = {
            "points": [evaluated.matrix_world@v.co for v in mesh.vertices],
            "faces": [tuple(poly.vertices) for poly in mesh.polygons],
            "colors": [mesh.materials[poly.material_index].name.split()[-1] for poly in mesh.polygons],
            # Art adds a colour when it is first drawn, so the index is the stroke order.
            "order": [poly.material_index for poly in mesh.polygons],
            "depth": obj.location.z+min((v.co.z for v in mesh.vertices), default=0),
        }
        evaluated.to_mesh_clear()
    bones = {b.name: (b.head_local.copy(), b.tail_local.copy()) for b in rig.data.bones}
    # The 2D character only lends its drawings.
    for obj in list(coll.all_objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(coll)
    return p, drawings, bones


def refined(drawing, piece=0):
    """Split long edges so the flat triangles can follow a curved surface.

    Returns points, faces, colours and each vertex's offset above the surface."""
    bm = bmesh.new()
    verts = [bm.verts.new(point) for point in drawing["points"]]
    color = bm.faces.layers.int.new("colour")
    order = bm.faces.layers.int.new("order")
    palette = sorted(set(drawing["colors"]))
    for face, c, rank in zip(drawing["faces"], drawing["colors"], drawing["order"]):
        try:
            f = bm.faces.new([verts[i] for i in face])
        except ValueError:
            continue
        f[color] = palette.index(c)
        f[order] = rank
    for _ in range(6):
        long = [e for e in bm.edges if e.calc_length() > MAX_EDGE]
        if not long:
            break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=False)
        bmesh.ops.triangulate(bm, faces=bm.faces)
    points = [v.co.copy() for v in bm.verts]
    index = {v: i for i, v in enumerate(bm.verts)}
    faces = [tuple(index[v] for v in f.verts) for f in bm.faces]
    colors = [palette[f[color]] for f in bm.faces]
    offsets = [GAP+piece*PIECE]*len(points)
    for f in bm.faces:
        for v in f.verts:
            offsets[index[v]] = max(offsets[index[v]], GAP+piece*PIECE+f[order]*STEP)
    bm.free()
    return points, faces, colors, offsets


def wrap_angle(s):
    """Orthographic inside, then the same slope past the edge: the drawing wraps."""
    a = abs(s)
    if a <= R0:
        angle = asin(a)
    else:
        angle = asin(R0)+(a-R0)/sqrt(1-R0*R0)
    return angle if s >= 0 else -angle


def half_widths(points, centre=None, rows=.06):
    """Silhouette half-width (and centre) of a drawing per row, smoothed."""
    table = {}
    for p in points:
        key = round(p.y/rows)
        lo, hi = table.get(key, (p.x, p.x))
        table[key] = (min(lo, p.x), max(hi, p.x))
    keys = sorted(table)

    def at(y):
        k = round(y/rows)
        near = [table[j] for j in range(k-1, k+2) if j in table] or [table[min(keys, key=lambda j: abs(j-k))]]
        lo = sum(a for a, _ in near)/len(near)
        hi = sum(b for _, b in near)/len(near)
        c = (lo+hi)/2 if centre is None else centre
        return c, max(.05, max(hi-c, c-lo))
    return at


def on_head(points, offsets, centre2d, size2d, centre, radii):
    """Orthographic wrap of the head drawing onto the head ellipsoid."""
    result, normals = [], []
    for p, out in zip(points, offsets):
        u = (p.x-centre2d.x)/size2d.x
        v = (p.y-centre2d.y)/size2d.y
        r = sqrt(u*u+v*v)
        theta = wrap_angle(r)
        phi = atan2(v, u)
        d = Vector((sin(theta)*cos(phi), -cos(theta), sin(theta)*sin(phi)))
        surface = centre+Vector((d.x*radii.x, d.y*radii.y, d.z*radii.z))
        normal = Vector((d.x/radii.x, d.y/radii.y, d.z/radii.z)).normalized()
        result.append(surface+normal*out)
        normals.append(normal)
    return result, normals


def on_body(points, offsets, height, radius, widths, back=False):
    """Wrap around a vertical body: height(y) -> z, radius(z) -> (rx, ry).

    With back=True the drawing is mirrored onto the back, for details that go
    all the way round (hem, sash, bands)."""
    result, normals = [], []
    for p, out in zip(points, offsets):
        z = height(p.y)
        rx, ry = radius(z)
        c, w = widths(p.y)
        angle = wrap_angle((p.x-c)/w)
        if back:
            angle = pi-angle
        surface = Vector((rx*sin(angle), -ry*cos(angle), z))
        normal = Vector((sin(angle)/rx, -cos(angle)/ry, 0)).normalized()
        result.append(surface+normal*out)
        normals.append(normal)
    return result, normals


def on_tube(points, offsets, along, tube, widths, front=Vector((0, -1, 0)), back=False):
    """Wrap around a limb: along(y) -> t on the tube, tube(t) -> (centre, axis, radius)."""
    result, normals = [], []
    for p, out in zip(points, offsets):
        centre, axis, radius = tube(along(p.y))
        f = (front-axis*front.dot(axis)).normalized()
        side = axis.cross(f).normalized()
        if side.x < 0:
            side = -side
        c, w = widths(p.y)
        angle = wrap_angle((p.x-c)/w)
        if back:
            angle = pi-angle
        normal = side*sin(angle)+f*cos(angle)
        result.append(centre+normal*(radius+out))
        normals.append(normal)
    return result, normals


def polyline(path, radii):
    """tube(t): t from 0 at the first point to 1 at the last, by arc length; extrapolates."""
    lengths = [0.]
    for a, b in zip(path, path[1:]):
        lengths.append(lengths[-1]+(b-a).length)
    total = lengths[-1]

    def tube(t):
        s = t*total
        i = 0
        while i < len(path)-2 and s > lengths[i+1]:
            i += 1
        a, b = path[i], path[i+1]
        k = (s-lengths[i])/(lengths[i+1]-lengths[i])
        ra, rb = radii[i], radii[i+1]
        kk = max(0., min(1., k))
        return a.lerp(b, k), (b-a).normalized(), ra+(rb-ra)*kk
    return tube


def all_round(wrap, points, offsets, faces, colors, *args):
    """The drawing on the front and, mirrored, on the back of the same surface."""
    front, front_normals = wrap(points, offsets, *args)
    rear, rear_normals = wrap(points, offsets, *args, back=True)
    shift = len(points)
    return ((front+rear, front_normals+rear_normals),
            faces+[tuple(i+shift for i in face) for face in faces], colors+colors)
