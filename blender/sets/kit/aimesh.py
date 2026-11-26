"""AI-made concept meshes (assets/3d/*.glb, Hunyuan3D-2: one textured mesh, ≈ 2 units, origin in the middle) brought
into the set / prop builders: imported, cleaned, scaled to the engine's units, pivot moved to the ground centre.

    ob = aimesh.load('chilie-piatra')                       # a Blender object in the scene (Blender space, front = -Y)
    aimesh.drop_loose(ob, max_faces=30, zmin=0.7)           # tiny floating specks (above the roof)
    aimesh.cut(ob, lambda c, n: ...)                        # delete the faces whose centre / normal match
    aimesh.fit(ob, s=6.5, ground=-0.66)                     # model z = ground → y 0; scaled by s about the model origin
    aimesh.finish(sc, ob, 'cell.walls', M, rough=0.8)       # placed (M = core.place(...)), renamed, registered for export
"""
import os
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
SRC = os.path.join(ROOT, 'assets', '3d')


def load(name):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(SRC, name + '.glb'))
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    ob = meshes[0]
    ob.data.transform(ob.matrix_world)
    ob.matrix_world = Matrix.Identity(4)
    ob.parent = None
    for o in new:
        if o is not ob:
            bpy.data.objects.remove(o)
    return ob


def components(bm):
    """[(faces, centre min z, max z)] of the connected pieces"""
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        st, fs = [f], []
        seen.add(f.index)
        while st:
            g = st.pop(); fs.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen:
                        seen.add(h.index); st.append(h)
        out.append(fs)
    return out


def drop_loose(ob, max_faces=30, zmin=-1e9):
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
    kill = []
    for fs in components(bm):
        if len(fs) <= max_faces and max(f.calc_center_median().z for f in fs) > zmin:
            kill += fs
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(ob.data); bm.free()
    return len(kill)


def cut(ob, pred):
    """delete faces where pred(centre, normal) is true (model space)"""
    bm = bmesh.new(); bm.from_mesh(ob.data)
    kill = [f for f in bm.faces if pred(f.calc_center_median(), f.normal)]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(ob.data); bm.free()
    return len(kill)


def keep(ob, pred):
    """keep only the connected pieces whose centre matches pred(centre) (e.g. the pot, not its lid lying beside it)"""
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.faces.ensure_lookup_table()
    kill = []
    for fs in components(bm):
        c = sum((f.calc_center_median() for f in fs), Vector()) / len(fs)
        if not pred(c):
            kill += fs
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(ob.data); bm.free()


def bounds(ob):
    a = np.array([v.co[:] for v in ob.data.vertices])
    return a.min(0), a.max(0)


def fit(ob, s, ground=None, centre=None):
    """scale by s; model z `ground` → 0 (default: the lowest vertex); centre (x, y) → origin (default: keep the model's)"""
    lo, hi = bounds(ob)
    g = lo[2] if ground is None else ground
    cx, cy = (0.0, 0.0) if centre is None else centre
    ob.data.transform(Matrix.Diagonal((s, s, s, 1)) @ Matrix.Translation((-cx, -cy, -g)))


def material(ob, rough=0.8, metal=0.0, spec=0.3):
    for m in ob.data.materials:
        if not m or not m.use_nodes:
            continue
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                for i in ('Metallic', 'Roughness'):
                    lk = list(n.inputs[i].links)
                    for l in lk:
                        m.node_tree.links.remove(l)
                n.inputs['Roughness'].default_value = rough
                n.inputs['Metallic'].default_value = metal
                if 'Specular IOR Level' in n.inputs:
                    n.inputs['Specular IOR Level'].default_value = spec
        m.use_backface_culling = True


def finish(sc, ob, name, M=None, parent=None, props=None, rough=0.8, kind='vis', spec=0.3):
    ob.name = name
    ob.data.name = name
    if parent is not None:
        ob.parent = parent
    if M is not None:
        ob.matrix_basis = M
    for p in ob.data.polygons:
        p.use_smooth = True
    for k, v in (props or {}).items():
        ob[k] = v
    material(ob, rough, spec=spec)
    sc.objects.append((ob, kind))
    return ob


def share(sc, src, name, M=None, parent=None, props=None):
    """another node using the same mesh data (exported once)"""
    ob = bpy.data.objects.new(name, src.data)
    bpy.context.scene.collection.objects.link(ob)
    if parent is not None:
        ob.parent = parent
    if M is not None:
        ob.matrix_basis = M
    for k, v in (props or {}).items():
        ob[k] = v
    sc.objects.append((ob, 'vis'))
    return ob


def foliage(ob, lift=1.25, speck=0.12, seed=7):
    """AI trees look like crumpled green plastic: recolour the leaf texels on an olive ramp (dark → silver-olive, keeping
    their light / dark pattern; the brown bark stays), add soft per-texel speckles so a big facet reads as small leaves, and
    show both sides of the leaves."""
    import numpy as np
    done = set()
    for m in ob.data.materials:
        if not m or not m.use_nodes:
            continue
        m.use_backface_culling = False
        for n in m.node_tree.nodes:
            if n.type != 'TEX_IMAGE' or not n.image or n.image.name in done:
                continue
            im = n.image
            done.add(im.name)
            w, h = im.size
            a = np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)
            rgb = a[..., :3]
            r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
            leaf = np.clip((g - r * 0.95) * 10.0, 0, 1) * np.clip((g - b * 0.8) * 10.0 + 0.5, 0, 1)
            leaf = leaf[..., None]
            rng = np.random.default_rng(seed)
            nz = rng.random((h, w)).astype(np.float32)
            k = np.array([1, 4, 6, 4, 1], np.float32) / 16
            for ax in (0, 1):
                nz = np.apply_along_axis(lambda v: np.convolve(v, k, mode='same'), ax, nz)
            lum = (0.3 * r + 0.59 * g + 0.11 * b)
            t = np.clip(lum * lift * (1.0 + speck * 4.0 * (nz - 0.5)), 0, 1)[..., None]
            dark, mid, light = (np.array(c, np.float32) for c in ((0.2, 0.28, 0.1), (0.44, 0.54, 0.22), (0.74, 0.8, 0.5)))
            ramp = np.where(t < 0.45, dark + (mid - dark) * (t / 0.45), mid + (light - mid) * ((t - 0.45) / 0.55))
            a[..., :3] = rgb * (1 - leaf) + ramp * leaf
            im.pixels[:] = a.ravel()
            import tempfile
            path = os.path.join(tempfile.gettempdir(), 'foliage_%s.jpg' % ''.join(c if c.isalnum() else '_' for c in im.name))
            im.filepath_raw = path                      # saved as a JPEG: the GLB keeps it small (a packed PNG doubled it)
            im.file_format = 'JPEG'
            im.save()
