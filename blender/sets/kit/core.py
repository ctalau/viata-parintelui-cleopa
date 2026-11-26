"""Scene / mesh / material / bake / export helpers shared by the set and prop builders.

Conventions
-----------
* Generators build geometry in **Blender space** (Z up) with the object's *front* towards **-Y** (= three.js +Z).
* Layouts are written in **three.js ground coordinates** `[x, z]` + heading `face` in degrees (0 = +Z, 90 = +X, like
  video.json). `place(x, z, face, y)` converts to a Blender matrix: Blender (x, -z, y), rotation_z = face.
* Geometry of the same material is merged into one `Batch` (= one mesh object, one draw call at runtime).
"""
import math
import os
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector, noise

from . import tex

UV0, COL, AOUV = 'UV0', 'Col', 'AO'


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'NONE'
    if sc.world is None:
        sc.world = bpy.data.worlds.new('World')
    return sc


def B(x, y, z):
    """three.js position -> Blender position."""
    return Vector((x, -z, y))


def place(x, z, face=0.0, y=0.0, s=1.0):
    """Matrix placing a generator's object (front = -Y) at three.js ground pos (x, z), heading `face` (deg)."""
    S = s if isinstance(s, (tuple, list)) else (s, s, s)
    return Matrix.Translation(B(x, y, z)) @ Matrix.Rotation(math.radians(face), 4, 'Z') @ Matrix.Diagonal((*S, 1))


# ---------------------------------------------------------------- bmesh helpers
def new_bm():
    bm = bmesh.new()
    bm.loops.layers.uv.new(UV0)
    bm.loops.layers.color.new(COL)
    return bm


def set_color(bm, rgb, faces=None):
    cl = bm.loops.layers.color[COL]
    c = (*rgb, 1.0) if len(rgb) == 3 else rgb
    for f in (faces if faces is not None else bm.faces):
        for l in f.loops:
            l[cl] = c


def box_uv(bm, tile=4.0, faces=None, offset=(0.0, 0.0, 0.0)):
    """Box projection in the bmesh's own space: 1 texture tile = `tile` units. V follows Z on the side faces."""
    uv = bm.loops.layers.uv[UV0]
    ox, oy, oz = offset
    for f in (faces if faces is not None else bm.faces):
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            p = l.vert.co
            if ax == 2:
                u, v = p.x + ox, p.y + oy
            elif ax == 0:
                u, v = (p.y + oy) * (1 if n.x > 0 else -1), p.z + oz
            else:
                u, v = (p.x + ox) * (-1 if n.y > 0 else 1), p.z + oz
            l[uv].uv = (u / tile, v / tile)


def cyl_uv(bm, tile_u=1.0, tile_v=4.0, center=(0, 0)):
    """Cylindrical projection around Z (u = angle, v = height / tile_v)."""
    uv = bm.loops.layers.uv[UV0]
    for f in bm.faces:
        cx = sum(math.atan2(l.vert.co.y - center[1], l.vert.co.x - center[0]) for l in f.loops) / len(f.loops)
        for l in f.loops:
            a = math.atan2(l.vert.co.y - center[1], l.vert.co.x - center[0])
            if abs(a - cx) > math.pi:
                a += 2 * math.pi if a < cx else -2 * math.pi
            l[uv].uv = (a / (2 * math.pi) * tile_u, l.vert.co.z / tile_v)


def transform(bm, M):
    bmesh.ops.transform(bm, matrix=M, verts=bm.verts)


def displace(bm, amp, scale, seed=0, octaves=3, verts=None, along_normal=True, axis_weight=(1, 1, 1)):
    """Fractal displacement (deterministic: mathutils.noise with an offset per seed)."""
    off = Vector((seed * 17.31, seed * 7.77, seed * 3.13))
    bm.normal_update()
    for v in (verts if verts is not None else bm.verts):
        p = v.co * (1.0 / scale) + off
        if along_normal:
            d = noise.fractal(p, 0.5, 2.0, octaves, noise_basis='PERLIN_ORIGINAL')
            v.co += v.normal * (d * amp)
        else:
            d = noise.noise_vector(p, noise_basis='PERLIN_ORIGINAL')
            v.co += Vector((d.x * axis_weight[0], d.y * axis_weight[1], d.z * axis_weight[2])) * amp


def box(bm, size, center=(0, 0, 0), bevel=0.0, segs=2, M=None):
    """Axis-aligned box (bottom at center.z - size.z/2) with optional bevel. Returns its faces."""
    tmp = new_bm()
    bmesh.ops.create_cube(tmp, size=1.0)
    transform(tmp, Matrix.Translation(center) @ Matrix.Diagonal((*size, 1)))
    if bevel > 0:
        bmesh.ops.bevel(tmp, geom=list(tmp.edges), offset=bevel, segments=segs, profile=0.5, affect='EDGES', clamp_overlap=True)
    if M is not None:
        transform(tmp, M)
    return merge(bm, tmp)


def merge(dst, src, M=None):
    """Append bmesh `src` into `dst` (optionally transformed). Frees src. Returns the new faces of dst."""
    if M is not None:
        transform(src, M)
    me = bpy.data.meshes.new('_tmp')
    src.to_mesh(me)
    n0 = len(dst.faces)
    dst.from_mesh(me)
    bpy.data.meshes.remove(me)
    src.free()
    dst.faces.ensure_lookup_table()
    return [dst.faces[i] for i in range(n0, len(dst.faces))]


def tube(bm, pts, radii, sides=8, cap=True, uv_v=1.0, twist=0.0, closed=False):
    """Tube along a polyline of Vectors with per-point radius. u around, v along (length / uv_v)."""
    tmp = new_bm()
    uvl = tmp.loops.layers.uv[UV0]
    n = len(pts)
    rings = []
    prev_side = None
    L = 0.0
    lens = [0.0]
    for i in range(1, n):
        L += (pts[i] - pts[i - 1]).length
        lens.append(L)
    for i, p in enumerate(pts):
        t = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        if prev_side is None:
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((1, 0, 0))
            side = t.cross(ref).normalized()
        else:
            side = (prev_side - t * prev_side.dot(t)).normalized()
        prev_side = side
        up = t.cross(side).normalized()
        ring = []
        r = radii[i] if hasattr(radii, '__len__') else radii
        for k in range(sides):
            a = 2 * math.pi * k / sides + twist * lens[i]
            ring.append(tmp.verts.new(p + (side * math.cos(a) + up * math.sin(a)) * r))
        rings.append(ring)
    for i in range(n - 1):
        for k in range(sides):
            k2 = (k + 1) % sides
            f = tmp.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
            for l, (uu, vv) in zip(f.loops, ((k, i), (k + 1, i), (k + 1, i + 1), (k, i + 1))):
                l[uvl].uv = (uu / sides, lens[vv] / uv_v)
    if cap and not closed:
        tmp.faces.new(list(reversed(rings[0])))
        tmp.faces.new(rings[-1])
    tmp.normal_update()
    return merge(bm, tmp)


def lathe(bm, profile, segs=32, uv_v=1.0, uv_u=1.0, cap_bottom=False):
    """Surface of revolution around Z. profile = [(r, z), ...] from bottom to top. u around, v along the profile."""
    tmp = new_bm()
    uvl = tmp.loops.layers.uv[UV0]
    rings = []
    L = [0.0]
    for i in range(1, len(profile)):
        L.append(L[-1] + math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]))
    for r, z in profile:
        rings.append([tmp.verts.new((r * math.cos(2 * math.pi * k / segs), r * math.sin(2 * math.pi * k / segs), z)) for k in range(segs)])
    for i in range(len(profile) - 1):
        for k in range(segs):
            k2 = (k + 1) % segs
            f = tmp.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
            for l, (uu, vv) in zip(f.loops, ((k, i), (k + 1, i), (k + 1, i + 1), (k, i + 1))):
                l[uvl].uv = (uu / segs * uv_u, L[vv] / uv_v)
    if cap_bottom and profile[0][0] > 1e-4:
        tmp.faces.new(list(reversed(rings[0])))
    tmp.normal_update()
    return merge(bm, tmp)


def rock(seed, size=(1, 1, 0.7), facets=6, detail=0.12, subdiv=3, sink=0.25):
    """A chiselled rock (front irrelevant). Icosphere → ellipsoid → planar facet cuts → fractal noise → flat bottom.
    Returns a bmesh with its base around z = 0 (sunk by `sink` * height below 0 so it never floats)."""
    rng = np.random.default_rng(seed)
    bm = new_bm()
    bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    for _ in range(facets):
        nrm = Vector(rng.normal(size=3)); nrm.z = abs(nrm.z) * 0.8 + 0.1; nrm.normalize()
        d = 0.55 + 0.3 * rng.random()
        for v in bm.verts:
            sc = Vector((v.co.x / size[0], v.co.y / size[1], v.co.z / size[2]))
            k = sc.dot(nrm) - d
            if k > 0:
                v.co -= Vector((nrm.x * size[0], nrm.y * size[1], nrm.z * size[2])) * k * 0.9
    bm.normal_update()
    off = Vector(rng.random(3) * 100)
    m = max(size)
    for v in bm.verts:
        p = v.co / m * 2.2 + off
        v.co += v.normal * noise.fractal(p, 0.55, 2.1, 4, noise_basis='PERLIN_ORIGINAL') * detail * m
    zmin = -size[2] * sink
    for v in bm.verts:
        if v.co.z < zmin:
            v.co.z = zmin
    bm.normal_update()
    return bm


def hull_of(bm_or_pts, M=None):
    """Convex hull bmesh of the given bmesh's verts (optionally transformed)."""
    pts = [v.co.copy() for v in bm_or_pts.verts] if hasattr(bm_or_pts, 'verts') else list(bm_or_pts)
    if M is not None:
        pts = [M @ p for p in pts]
    hb = bmesh.new()
    vs = [hb.verts.new(p) for p in pts]
    res = bmesh.ops.convex_hull(hb, input=vs)
    bmesh.ops.delete(hb, geom=list({id(g): g for g in res['geom_interior'] + res['geom_unused'] if isinstance(g, bmesh.types.BMVert)}.values()), context='VERTS')
    bmesh.ops.dissolve_limit(hb, angle_limit=math.radians(12), verts=hb.verts, edges=hb.edges)
    bmesh.ops.triangulate(hb, faces=hb.faces)
    return hb


# ---------------------------------------------------------------- materials
_TEX = {}


def texset(name, gen, **kw):
    """Generate (once per build) a tileable texture set and return its 3 image file paths."""
    if name not in _TEX:
        c, n, r = gen(**kw)
        _TEX[name] = (tex.save(name + '_col', c, 84), tex.save(name + '_nrm', n, 80), tex.save(name + '_orm', r, 80))
    return _TEX[name]


def _img(path, noncolor=False):
    img = bpy.data.images.load(path, check_existing=True)
    if noncolor:
        img.colorspace_settings.name = 'Non-Color'
    return img


def _gltf_group():
    g = bpy.data.node_groups.get('glTF Material Output')
    if g is None:
        g = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
        g.interface.new_socket('Thickness', in_out='INPUT', socket_type='NodeSocketFloat')
    return g


def material(name, textures=None, color=(1, 1, 1), rough=0.8, metal=0.0, normal_strength=1.0, vcol=False,
             emissive=None, emissive_strength=1.0, alpha=None, double=False, uv=UV0, extras=None):
    """Principled BSDF that the glTF exporter maps 1:1. textures = (col, nrm, orm) paths (orm: G rough, B metal)."""
    m = bpy.data.materials.new(name)
    if m.node_tree is None:
        m.use_nodes = True
    nt = m.node_tree
    for nd in list(nt.nodes):
        nt.nodes.remove(nd)
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(bsdf.outputs[0], out.inputs[0])
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    uvn = nt.nodes.new('ShaderNodeUVMap'); uvn.uv_map = uv
    base_out = None
    if textures:
        c = nt.nodes.new('ShaderNodeTexImage'); c.image = _img(textures[0])
        nt.links.new(uvn.outputs[0], c.inputs[0])
        base_out = c.outputs[0]
        if color != (1, 1, 1):
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            nt.links.new(base_out, mix.inputs[6]); mix.inputs[7].default_value = (*color, 1)
            base_out = mix.outputs[2]
        if textures[1]:
            nimg = nt.nodes.new('ShaderNodeTexImage'); nimg.image = _img(textures[1], True)
            nt.links.new(uvn.outputs[0], nimg.inputs[0])
            nm = nt.nodes.new('ShaderNodeNormalMap'); nm.uv_map = uv; nm.inputs['Strength'].default_value = normal_strength
            nt.links.new(nimg.outputs[0], nm.inputs['Color'])
            nt.links.new(nm.outputs[0], bsdf.inputs['Normal'])
        if textures[2]:
            rimg = nt.nodes.new('ShaderNodeTexImage'); rimg.image = _img(textures[2], True)
            nt.links.new(uvn.outputs[0], rimg.inputs[0])
            sep = nt.nodes.new('ShaderNodeSeparateColor')
            nt.links.new(rimg.outputs[0], sep.inputs[0])
            nt.links.new(sep.outputs[1], bsdf.inputs['Roughness'])
            nt.links.new(sep.outputs[2], bsdf.inputs['Metallic'])
    if vcol:
        ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = COL
        if base_out is None:
            base_out = ca.outputs[0]
            if color != (1, 1, 1):
                mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
                mix.inputs['Factor'].default_value = 1.0
                nt.links.new(base_out, mix.inputs[6]); mix.inputs[7].default_value = (*color, 1)
                base_out = mix.outputs[2]
        else:
            mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            nt.links.new(base_out, mix.inputs[6]); nt.links.new(ca.outputs[0], mix.inputs[7])
            base_out = mix.outputs[2]
    if base_out is not None:
        nt.links.new(base_out, bsdf.inputs['Base Color'])
    if emissive is not None:
        bsdf.inputs['Emission Color'].default_value = (*emissive, 1)
        bsdf.inputs['Emission Strength'].default_value = emissive_strength
    if alpha is not None:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    m.use_backface_culling = not double
    if extras:
        for k, v in extras.items():
            m[k] = v
    return m


def attach_ao(m, img, uv=AOUV):
    """Wire an AO image into the material's glTF occlusion slot (exported as occlusionTexture on `uv`)."""
    nt = m.node_tree
    g = nt.nodes.new('ShaderNodeGroup'); g.node_tree = _gltf_group()
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img
    u = nt.nodes.new('ShaderNodeUVMap'); u.uv_map = uv
    nt.links.new(u.outputs[0], t.inputs[0])
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    nt.links.new(t.outputs[0], sep.inputs[0])
    nt.links.new(sep.outputs[0], g.inputs['Occlusion'])


# ---------------------------------------------------------------- batches & objects
class Batch:
    """All geometry of one material (one mesh object)."""

    def __init__(self, name, mat, ao=True, vcol=False, tile=None, ao_uv=None, ao_density=20, shadow=True):
        self.name, self.mat, self.ao, self.vcol, self.tile = name, mat, ao, vcol, tile
        self.ao_uv, self.ao_density, self.shadow = ao_uv, ao_density, shadow
        self.bm = new_bm()
        self.obj = None

    def add(self, src, M=None, color=None, uv_box=None):
        """Append a generator bmesh. uv_box = tile size → box-project UVs in WORLD space after transform."""
        if color is not None:
            set_color(src, color)
        if M is not None:
            transform(src, M)
        if uv_box:
            src.normal_update()
            box_uv(src, uv_box)
        return merge(self.bm, src)


class Scene:
    def __init__(self, name):
        self.name = name
        self.batches = {}
        self.objects = []      # (obj, kind)
        self.anchors = {}
        self.seats = {}
        self.extra = {}

    def batch(self, name, mat_fn, **kw):
        if name not in self.batches:
            self.batches[name] = Batch(name, mat_fn() if callable(mat_fn) else mat_fn, **kw)
        return self.batches[name]

    def finalize(self):
        for b in self.batches.values():
            if not b.bm.faces:
                continue
            me = bpy.data.meshes.new(b.name)
            b.bm.normal_update()
            b.bm.to_mesh(me)
            b.bm.free()
            if not b.vcol and COL in me.color_attributes:
                me.color_attributes.remove(me.color_attributes[COL])
            elif b.vcol and COL in me.color_attributes:
                me.color_attributes.active_color_name = COL
                me.color_attributes.render_color_index = list(me.color_attributes).index(me.color_attributes[COL])
            textured = any(n.type == 'TEX_IMAGE' for n in b.mat.node_tree.nodes)
            if not textured and not b.ao and UV0 in me.uv_layers:
                me.uv_layers.remove(me.uv_layers[UV0])
            me.materials.append(b.mat)
            for p in me.polygons:
                p.use_smooth = True
            ob = bpy.data.objects.new(b.name, me)
            bpy.context.scene.collection.objects.link(ob)
            b.obj = ob
            self.objects.append((ob, 'vis'))

    def obj(self, name, bm, mat, M=None, parent=None, props=None, vcol=True, kind='vis', mesh=None):
        """A separate (e.g. animated) mesh object. bm is in the object's local space; M = its matrix (world, or local
        to `parent`). props → custom properties (glTF extras → three.js userData), e.g. {'anim': 'sway'}."""
        if mesh is not None:     # share the mesh data (exported once, referenced by several nodes)
            ob = bpy.data.objects.new(name, mesh)
            bpy.context.scene.collection.objects.link(ob)
            if parent is not None:
                ob.parent = parent
            if M is not None:
                ob.matrix_basis = M
            for k, v in (props or {}).items():
                ob[k] = v
            self.objects.append((ob, kind))
            return ob
        me = bpy.data.meshes.new(name)
        bm.normal_update()
        bm.to_mesh(me); bm.free()
        if not vcol and COL in me.color_attributes:
            me.color_attributes.remove(me.color_attributes[COL])
        elif COL in me.color_attributes:
            me.color_attributes.active_color_name = COL
            me.color_attributes.render_color_index = list(me.color_attributes).index(me.color_attributes[COL])
        if mat is not None:
            textured = any(n.type == 'TEX_IMAGE' for n in mat.node_tree.nodes)
            if not textured and UV0 in me.uv_layers:
                me.uv_layers.remove(me.uv_layers[UV0])
            me.materials.append(mat)
        for p in me.polygons:
            p.use_smooth = True
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        if parent is not None:
            ob.parent = parent
        if M is not None:
            ob.matrix_basis = M
        for k, v in (props or {}).items():
            ob[k] = v
        self.objects.append((ob, kind))
        return ob

    def group(self, name, M=None, props=None):
        """An empty used as a parent / pivot (exported as a plain node)."""
        e = bpy.data.objects.new(name, None)
        bpy.context.scene.collection.objects.link(e)
        if M is not None:
            e.matrix_basis = M
        for k, v in (props or {}).items():
            e[k] = v
        self.objects.append((e, 'empty'))
        return e

    def add_col(self, name, hb):
        """Collision hull (Blender space bmesh) → object `col:<name>` (no material)."""
        me = bpy.data.meshes.new('col:' + name)
        hb.to_mesh(me); hb.free()
        ob = bpy.data.objects.new('col:' + name, me)
        ob.hide_render = True          # never an occluder in the AO bake
        bpy.context.scene.collection.objects.link(ob)
        self.objects.append((ob, 'col'))
        return ob

    def col_box(self, name, size, x, z, face=0.0, y=0.0):
        """Oriented collision box: size (w, h, d) in three.js terms (width x, height y, depth z), base at y."""
        hb = bmesh.new()
        bmesh.ops.create_cube(hb, size=1.0)
        transform(hb, place(x, z, face, y) @ Matrix.Translation((0, 0, size[1] / 2)) @ Matrix.Diagonal((size[0], size[2], size[1], 1)))
        return self.add_col(name, hb)

    def empty(self, name, x, y, z, face=0.0):
        e = bpy.data.objects.new(name, None)
        e.empty_display_type = 'ARROWS'
        e.location = B(x, y, z)
        e.rotation_euler = (0, 0, math.radians(face))
        bpy.context.scene.collection.objects.link(e)
        self.objects.append((e, 'empty'))
        return e

    def anchor(self, name, x, z, face, y=0.0, note=None):
        self.empty('anchor:' + name, x, y, z, face)
        self.anchors[name] = {'pos': [round(x, 3), round(y, 3), round(z, 3)], 'face': round(face, 1), **({'note': note} if note else {})}

    def seat(self, name, x, y, z, face, note=None):
        self.empty('seat:' + name, x, y, z, face)
        self.seats[name] = {'pos': [round(x, 3), round(y, 3), round(z, 3)], 'face': round(face, 1), **({'note': note} if note else {})}

    # ------------------------------------------------------------ AO bake
    def bake_ao(self, samples=48, distance=4.0, max_size=2048, blur=0.8, gamma=1.0, floor=0.0):
        sc = bpy.context.scene
        sc.render.engine = 'CYCLES'
        sc.cycles.device = 'CPU'
        sc.cycles.samples = samples
        sc.cycles.use_denoising = False
        sc.world.light_settings.distance = distance
        sc.render.bake.margin = 6
        cache = tex.CACHE
        os.makedirs(cache, exist_ok=True)
        # collision proxies must not occlude: take them out of the scene while baking
        cols = [ob for ob, kind in self.objects if kind == 'col']
        for ob in cols:
            bpy.context.scene.collection.objects.unlink(ob)
        self._bake_all(samples, distance, max_size, blur, gamma, floor, cache)
        for ob in cols:
            bpy.context.scene.collection.objects.link(ob)

    def _bake_all(self, samples, distance, max_size, blur, gamma, floor, cache):
        for b in self.batches.values():
            ob = b.obj
            if ob is None or not b.ao:
                continue
            me = ob.data
            uvname = b.ao_uv or AOUV
            if uvname == AOUV:
                me.uv_layers.new(name=AOUV)
                me.uv_layers.active = me.uv_layers[AOUV]
                bpy.ops.object.select_all(action='DESELECT')
                ob.select_set(True)
                bpy.context.view_layer.objects.active = ob
                bpy.ops.object.mode_set(mode='EDIT')
                bpy.ops.mesh.select_all(action='SELECT')
                bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
                bpy.ops.object.mode_set(mode='OBJECT')
                me.uv_layers.active = me.uv_layers[UV0]
            area = sum(p.area for p in me.polygons)
            size = int(min(max_size, max(128, 2 ** math.ceil(math.log2(max(1, math.sqrt(area) * b.ao_density * 1.3))))))
            sw = sh = size
            if isinstance(b.ao, int) and not isinstance(b.ao, bool):
                sw = sh = b.ao
            elif isinstance(b.ao, tuple):
                sw, sh = b.ao
            img = bpy.data.images.new(f'ao_{self.name}_{b.name}', sw, sh, float_buffer=False)
            img.generated_color = (1, 1, 1, 1)
            nt = b.mat.node_tree
            tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
            un = nt.nodes.new('ShaderNodeUVMap'); un.uv_map = uvname
            nt.links.new(un.outputs[0], tn.inputs[0])
            nt.nodes.active = tn
            # the bake writes into the *active render* UV map
            for l in me.uv_layers:
                l.active_render = (l.name == uvname)
            me.uv_layers.active = me.uv_layers[uvname]      # the bake target UV is the *active* one
            bpy.ops.object.select_all(action='DESELECT')
            ob.select_set(True)
            bpy.context.view_layer.objects.active = ob
            bpy.ops.object.bake(type='AO', margin=6, use_clear=True)
            for l in me.uv_layers:
                l.active_render = (l.name == UV0)
            me.uv_layers.active = me.uv_layers[UV0]
            nt.nodes.remove(tn); nt.nodes.remove(un)
            p = os.path.join(cache, f'ao_{self.name}_{b.name}.png')
            img.filepath_raw = p; img.file_format = 'PNG'; img.save()
            bpy.data.images.remove(img)
            # soften + lift the AO a little (stylised: grounded, never black), then JPEG
            from PIL import Image, ImageFilter
            im = Image.open(p).convert('L')
            if blur:
                im = im.filter(ImageFilter.GaussianBlur(blur * size / 1024))
            a = np.asarray(im).astype(np.float32) / 255
            a = floor + (1 - floor) * np.power(a, gamma)
            jp = os.path.join(cache, f'ao_{self.name}_{b.name}.jpg')
            nt = b.mat.node_tree
            orm = [n for n in nt.nodes if n.type == 'TEX_IMAGE' and n.image and n.image.name.endswith('_orm.jpg')]
            if uvname == UV0 and orm and tuple(orm[0].image.size) == (sw, sh):
                # same UV and size: write AO into the R channel of the ORM texture (one glTF texture)
                o = np.asarray(Image.open(bpy.path.abspath(orm[0].image.filepath)).convert('RGB')).copy()
                o[..., 0] = (np.clip(a, 0, 1) * 255).astype(np.uint8)
                Image.fromarray(o).save(jp, quality=82)
                aimg = bpy.data.images.load(jp); aimg.colorspace_settings.name = 'Non-Color'
                orm[0].image = aimg
                attach_ao(b.mat, aimg, uvname)
            else:
                Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).save(jp, quality=80)
                aimg = bpy.data.images.load(jp)
                aimg.colorspace_settings.name = 'Non-Color'
                if orm:   # the exporter would pack AO + roughness into one image although their UVs differ
                    for n in orm:
                        for lk in list(n.outputs[0].links):
                            nt.links.remove(lk)
                        nt.nodes.remove(n)
                    bs = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
                    bs.inputs['Roughness'].default_value = 0.86
                    bs.inputs['Metallic'].default_value = 0.0
                attach_ao(b.mat, aimg, uvname)
            print(f'  AO {b.name}: {sw}x{sh}px')

    # ------------------------------------------------------------ export
    def export(self, glb_path):
        for ob, kind in self.objects:
            ob.select_set(True)
        bpy.ops.export_scene.gltf(
            filepath=glb_path, export_format='GLB', use_selection=False, export_yup=True, export_apply=False,
            export_extras=True, export_texcoords=True, export_normals=True, export_tangents=False,
            export_vertex_color='ACTIVE', export_all_vertex_colors=False,
            export_materials='EXPORT', export_image_format='AUTO', export_jpeg_quality=85,
            export_cameras=False, export_lights=False, export_animations=False, export_skins=False, export_morph=False)
