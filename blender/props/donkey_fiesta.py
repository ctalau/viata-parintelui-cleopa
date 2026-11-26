#!/usr/bin/env python3
"""Urechilă, the pack donkey of film 049, from a sculpted model (Meshy AI, „Cheerful Fiesta Donkey”, the user's upload,
kept as the source in blender/props/src/fiesta-donkey.glb) → assets/props/donkey-fiesta.glb + .json.

    python3 blender/props/donkey_fiesta.py [--debug]      (--debug also writes stills/donkey-fiesta-weights.glb)

The sculpt is one textured mesh in a standing pose. This script:
  1. imports it, welds its UV seams, scales it to the size of the films' donkey (≈ 4.65 tall at the ears, back ≈ 2.3,
     facing +Z, hooves on y = 0) and decimates it for the web (≈ 40 k triangles, textures 2048 / 1024 / 512);
  2. RIGS it: a skeleton in the browser's axes (every bone points up with no roll, so every joint has an identity rest
     rotation and the engine's rotations — pitch about X, yaw about Y — mean the same as on the jointed donkey-pack):
     body · neck · head · jaw · ear0 / ear1 · leg0…3 (FL, FR, HL, HR, the donkey's left = +X) with a knee each · tail ·
     tail tip · bell;
  3. SKINS it by rules (no painting): each bone owns a region of the body given by planes / distances in donkey space,
     with soft blends across the joints (smoothstep), at most 4 bones per vertex;
  4. adds what the film needs on top of the sculpt, fitted to its surface by ray casts: a wooden sawbuck pack saddle with
     pegs and a girth (over the fiesta blanket), two eyelids that blink, and the loads in steps l0 … l3 (the same basket of
     dates, bread sack and mat roll as the free props, hung by ropes from the pegs) — like donkey-pack;
  5. writes the engine's animation names into the joints (glTF extras `anim`: neck + head `browse` (shared), jaw `jaw`,
     ears `ear`, lids `blink`, legs `gait`, knees `knee`, tail `swish`, bell `sway`) — lib/engine3/look.js plays them.
"""
import os, sys, math, json, struct
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(os.path.dirname(HERE), 'sets'))
import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree
from kit import core, tex
from kit import donkey as dk
from kit.core import new_bm, tube, set_color
from kit.critters import blob

ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(HERE, 'src', 'fiesta-donkey.glb')
OUT = os.path.join(ROOT, 'assets', 'props')
NAME = 'donkey-fiesta'
SCALE = 2.45                      # the sculpt is 1.9 tall → ≈ 4.65 (the films' donkey: back ≈ 2.3, like donkey-pack)
SHIFT = (0.06, 0.09)              # the sculpt's body is off-centre by this much (three.js x, z) before scaling
DECIMATE = 0.22
TEX = {'base': 2048, 'normal': 1024, 'other': 512}
LOAD = dk.SCALE                   # the loads keep the size of the free props (basket-dates, sack-bread, mat-roll)


def ss(e0, e1, x):
    """smoothstep from e0 (0) to e1 (1); e0 > e1 gives the falling step"""
    t = np.clip((x - e0) / (e1 - e0), 0.0, 1.0)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ the skeleton (three.js axes: x left, y up, z front)
# pivots measured on the scaled sculpt (side / front views with a 0.25 grid, slices of the vertices)
J = {
    'body': ((0.0, 1.8, -0.1), None),
    'neck': ((0.06, 2.25, 0.72), 'body'),
    'head': ((0.18, 2.98, 0.98), 'neck'),
    'jaw': ((0.22, 2.84, 1.55), 'head'),
    'ear0': ((-0.12, 3.74, 1.08), 'head'),   # its right ear (-X)
    'ear1': ((0.42, 3.74, 1.12), 'head'),    # its left ear (+X)
    'tail': ((0.2, 1.88, -1.34), 'body'),
    'tailtip': ((0.37, 1.52, -1.6), 'tail'),
    'bell': ((0.16, 2.12, 1.6), 'body'),
}
# legs: leg0 FL (+X front), leg1 FR (-X front), leg2 HL (+X back), leg3 HR (-X back); (x, z) at the hoof and at the top
LEGS = {0: ((0.41, 1.02), (0.4, 0.82)), 1: ((-0.37, 1.1), (-0.36, 0.86)), 2: ((0.36, -1.18), (0.34, -0.92)), 3: ((-0.38, -1.13), (-0.36, -0.92))}
LEG_TOP, KNEE_Y = 1.58, 0.74
for k, (hoof, top) in LEGS.items():
    J[f'leg{k}'] = ((top[0], LEG_TOP, top[1]), 'body')
    kx = top[0] + (hoof[0] - top[0]) * (LEG_TOP - KNEE_Y) / LEG_TOP
    kz = top[1] + (hoof[1] - top[1]) * (LEG_TOP - KNEE_Y) / LEG_TOP
    J[f'knee{k}'] = ((kx, KNEE_Y, kz), f'leg{k}')
BONES = list(J)
EARS = {'ear0': ((-0.12, 3.74, 1.08), (-0.4, 4.5, 1.16)), 'ear1': ((0.42, 3.74, 1.12), (0.8, 4.4, 0.88))}
TAIL = [np.array(p) for p in ((0.2, 1.88, -1.34), (0.37, 1.52, -1.6), (0.42, 1.0, -1.74))]
BELL_C = np.array((0.16, 1.76, 1.68))


def bl(p):
    """three.js (x, y, z) → Blender (x, -z, y)"""
    return Vector((p[0], -p[2], p[1]))


# ------------------------------------------------------------------ 1. the sculpt
def load_sculpt():
    bpy.ops.import_scene.gltf(filepath=SRC)
    ob = [o for o in bpy.data.objects if o.type == 'MESH'][0]
    ob.name = ob.data.name = 'donkey.body'
    me = ob.data
    me.transform(ob.matrix_world); ob.matrix_world = Matrix.Identity(4)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)       # weld the UV seams (else decimation tears them open)
    zmin = min(v.co.z for v in bm.verts)
    bmesh.ops.transform(bm, matrix=Matrix.Diagonal((SCALE, SCALE, SCALE, 1)) @ Matrix.Translation((SHIFT[0], -SHIFT[1], -zmin)), verts=bm.verts)
    bm.to_mesh(me); bm.free()
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    m = ob.modifiers.new('dec', 'DECIMATE'); m.ratio = DECIMATE
    bpy.ops.object.modifier_apply(modifier='dec')
    for p in me.polygons:
        p.use_smooth = True
    # textures: smaller for the web
    mat = me.materials[0]; mat.name = 'donkey_fiesta'
    for n in mat.node_tree.nodes:
        if n.type != 'TEX_IMAGE' or not n.image:
            continue
        used = {l.to_socket.name for o in n.outputs for l in o.links}
        to = {l.to_node.type for o in n.outputs for l in o.links}
        size = TEX['normal'] if 'NORMAL_MAP' in to else TEX['base'] if 'Base Color' in used else TEX['other']
        if n.image.size[0] > size:
            n.image.scale(size, size)
    return ob


def verts_three(me):
    co = np.array([v.co for v in me.vertices])
    return np.stack([co[:, 0], co[:, 2], -co[:, 1]], 1)


# ------------------------------------------------------------------ 3. skin weights by rules
def seg_dist(P, a, b):
    ab = b - a; L2 = float(ab @ ab)
    s = np.clip(((P - a) @ ab) / L2, 0, 1)
    return np.linalg.norm(P - (a + s[:, None] * ab), axis=1), s


def weights(P):
    x, y, z = P[:, 0], P[:, 1], P[:, 2]
    N = len(P); W = {b: np.zeros(N) for b in BONES}
    rest = np.ones(N)                                  # what is not given to a part stays with the body
    # legs: the nearest leg's axis (hoof → top), full below the belly, blending into the body over the shoulder / hip
    dists = []
    for k, (hoof, top) in LEGS.items():
        a = np.array((hoof[0], 0.0, hoof[1])); b = np.array((top[0], LEG_TOP + 0.3, top[1]))
        d, _ = seg_dist(np.stack([x, np.clip(y, 0, LEG_TOP + 0.3), z], 1), a, b)
        dists.append(d)
    dists = np.array(dists); near = dists.argmin(0); dn = dists.min(0)
    wl = ss(1.5, 1.12, y) * ss(0.44, 0.3, dn)
    for k in LEGS:
        m = near == k
        kn = ss(KNEE_Y + 0.1, KNEE_Y - 0.1, y)
        W[f'knee{k}'][m] = (wl * kn)[m]
        W[f'leg{k}'][m] = (wl * (1 - kn))[m]
    rest -= wl
    # tail: along its curve, from the rump
    d1, s1 = seg_dist(P, TAIL[0], TAIL[1]); d2, s2 = seg_dist(P, TAIL[1], TAIL[2])
    dt = np.minimum(d1, d2)
    wt = ss(0.34, 0.24, dt) * ss(-1.3, -1.42, z) * (y > 0.85)
    tip = np.where(d2 < d1, ss(-0.15, 0.25, s2), 0.0)
    W['tail'] = wt * (1 - tip); W['tailtip'] = wt * tip
    rest -= wt
    # bell: hangs under the collar in front of the chest
    db = np.linalg.norm(P - BELL_C, axis=1)
    wb = ss(0.3, 0.22, db) * ss(2.1, 2.02, y) * ss(1.5, 1.58, z)
    W['bell'] = wb * rest; rest -= W['bell']
    # neck: everything above the shoulders in front of the withers; head: beyond the plane behind the jaw and the nape,
    # plus the whole muzzle in front of the throat
    wn = ss(2.02, 2.45, y) * ss(0.12, 0.5, z)
    dh = np.array((0.0, 0.74, 0.67)); Ph = np.array(J['head'][0])
    wh = np.maximum(ss(-0.16, 0.18, (P - Ph) @ dh), ss(1.38, 1.6, z) * ss(2.32, 2.5, y))
    wn = np.maximum(wn, wh)
    head = wn * rest * wh
    neck = wn * rest * (1 - wh)
    rest -= head + neck
    W['neck'] = neck
    # inside the head: the lower jaw (under the upper lip, in front of the mouth corners) and the ears
    wj = ss(1.62, 1.76, z) * ss(2.79, 2.73, y) * ss(0.5, 0.4, np.abs(x - 0.22))
    W['jaw'] = head * wj
    rem = head * (1 - wj)
    for e, (a, b) in EARS.items():
        d, s = seg_dist(P, np.array(a), np.array(b))
        L = np.linalg.norm(np.array(b) - np.array(a))
        we = ss(0.3, 0.22, d) * ss(-0.02, 0.14, s * L) * (s < 0.999 + (d < 0.25))
        W[e] = rem * we; rem = rem - W[e]
    W['head'] = rem
    W['body'] = np.clip(rest, 0, 1)
    M = np.stack([W[b] for b in BONES], 1)
    # at most 4 bones per vertex, normalised
    idx = np.argsort(-M, 1)[:, 4:]
    np.put_along_axis(M, idx, 0, 1)
    M = M / np.maximum(M.sum(1, keepdims=True), 1e-9)
    return M


# ------------------------------------------------------------------ 2. the armature
def armature(body):
    arm = bpy.data.armatures.new('donkey.rig')
    rig = bpy.data.objects.new('donkey.rig', arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='EDIT')
    eb = {}
    for n, (p, par) in J.items():
        b = arm.edit_bones.new('donkey.' + n)
        b.head = bl(p); b.tail = bl(p) + Vector((0, 0, 0.2)); b.roll = 0.0   # up, no roll → identity rest rotation in glTF
        if par:
            b.parent = eb[par]
        eb[n] = b
    bpy.ops.object.mode_set(mode='OBJECT')
    body.parent = rig
    mod = body.modifiers.new('rig', 'ARMATURE'); mod.object = rig
    return rig


def skin(body):
    P = verts_three(body.data)
    M = weights(P)
    groups = {b: body.vertex_groups.new(name='donkey.' + b) for b in BONES}
    for j, b in enumerate(BONES):
        col = M[:, j]
        for i in np.nonzero(col > 1e-4)[0]:
            groups[b].add([int(i)], float(col[i]), 'REPLACE')
    return P, M


# ------------------------------------------------------------------ 4. saddle, girth, eyelids, loads — fitted by ray casts
class Surface:
    def __init__(self, ob):
        self.bvh = BVHTree.FromObject(ob, bpy.context.evaluated_depsgraph_get())

    def out(self, c, d, pad=0.0):
        """the outer surface along the ray from c (inside) towards d (Blender space), + pad"""
        d = Vector(d).normalized()
        hit = self.bvh.ray_cast(Vector(c) + d * 6.0, -d)
        if hit[0] is None:
            return Vector(c) + d * pad
        return hit[0] + d * pad


BACK_C = Vector((0.0, 0.08, 1.72))   # Blender: the middle of the barrel under the blanket
PEG_Y = 0.42
TB = 0.8
PEG = lambda s: Vector((s * 0.4, 0, 0.13))   # a peg sticks out sideways from a board end, a little up


def saddle(S):
    """the sawbuck: two boards on the blanket along the back, an X of sticks at each end, pegs at the board ends"""
    w = new_bm()
    for s in (-1, 1):
        n = Vector((math.sin(s * TB), 0, math.cos(s * TB)))
        pts = [S.out(BACK_C + Vector((0, y, 0)), n, 0.07) for y in np.linspace(-0.52, 0.52, 7)]
        tube(w, pts, 0.068, sides=6, uv_v=0.6)
        for y in (-PEG_Y - 0.09, PEG_Y + 0.09):
            p = S.out(BACK_C + Vector((0, y, 0)), n, 0.07)
            tube(w, [p, p + PEG(s)], [0.045, 0.04], sides=6, uv_v=0.3)
    for y in (-PEG_Y, PEG_Y):
        lo = {s: S.out(BACK_C + Vector((0, y, 0)), Vector((math.sin(s * TB), 0, math.cos(s * TB))), 0.09) for s in (-1, 1)}
        top = max(v.z for v in lo.values()) + 0.55
        for s in (-1, 1):
            tube(w, [lo[s], Vector((-s * 0.26, y, top))], 0.05, sides=6, uv_v=0.5)
    return w


def pegs(S):
    out = {}
    for s in (-1, 1):
        n = Vector((math.sin(s * TB), 0, math.cos(s * TB)))
        for y in (-PEG_Y - 0.09, PEG_Y + 0.09):
            p = S.out(BACK_C + Vector((0, y, 0)), n, 0.07)
            out[(s, 1 if y > 0 else -1)] = p + PEG(s) * 0.88
    return out


def girth(S):
    """a red girth band round the barrel, between the front legs and the blanket's middle"""
    r = new_bm()
    for y0 in (-0.02,):
        ring = []
        for a in np.linspace(0, 2 * math.pi, 41):
            d = Vector((math.sin(a), 0, math.cos(a)))
            ring.append(S.out(BACK_C + Vector((0, y0, -0.05)), d, 0.03))
        tube(r, ring, 0.045, sides=5, uv_v=0.4, closed=True)
    set_color(r, (0.78, 0.15, 0.12))
    return r


SLOTS = {}   # filled by place_loads: kind → (Blender position of the load's base centre, yaw deg)


def place_loads(S, P):
    """where each load hangs: its base at a fixed height, its inner side 0.05 off the sculpt (blanket included)"""
    for kind, (base_y, side) in {'basket': (1.0, -1), 'sack': (1.06, 1)}.items():
        bm = dk.dates_basket()[0] if kind == 'basket' else dk.bread_sack()[0]
        co = np.array([v.co for v in bm.verts]) * LOAD; bm.free()
        # yawed 90° about Z: its local x → Blender y, its local y → -x
        half_x = (co[:, 1].max() - co[:, 1].min()) / 2
        top = base_y + co[:, 2].max()
        zc = 0.0
        m = (P[:, 1] > base_y) & (P[:, 1] < top) & (np.abs(P[:, 2] - zc) < 0.5) & (np.sign(P[:, 0]) == side)
        wall = np.abs(P[m, 0]).max()
        SLOTS[kind] = (Vector((side * (wall + half_x + 0.05), -zc, base_y)), 90.0)
    back = S.out(BACK_C, (0, 0, 1)).z
    SLOTS['mat'] = (Vector((0.0, 0.0, back + 0.02)), 0.0)


def load_ropes(kind, grip_z, pg):
    r = new_bm()
    p, yaw = SLOTS[kind]
    if kind == 'mat':
        for x, s, fb in ((-0.4, -1, -1), (0.4, 1, 1), (-0.4, -1, 1), (0.4, 1, -1)):
            a = Vector((x, 0.0, p.z + 0.25 * LOAD / 1.2)) + Vector((s * 0.035, 0, -0.2))
            b = pg[(s, fb)]
            tube(r, [a, a.lerp(b, 0.5) + Vector((0, 0, -0.03)), b], 0.026, sides=5, uv_v=0.3)
        return r
    s = 1 if p.x > 0 else -1
    top = p + Vector((0, 0, grip_z * LOAD))
    for fb in (-1, 1):
        b = pg[(s, fb)]
        tube(r, [top, top.lerp(b, 0.5) + Vector((0, 0, -0.05)), b], 0.028, sides=5, uv_v=0.3)
    blob(r, tuple(top + Vector((0, 0, 0.01))), (0.055, 0.055, 0.055), (1, 1, 1), subdiv=1)
    return r


def eye_lids(body, P):
    """the painted eyes, found in the texture: the dark pupils (darkest spots of the face) and the white round them. Returns
    per eye (Blender): the centre of the white, its normal, its two half-axes (vectors), and the colour of the skin round it"""
    me = body.data
    img = [n.image for n in me.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and
           any(l.to_socket.name == 'Base Color' for o in n.outputs for l in o.links)][0]
    W, H = img.size; px = np.array(img.pixels[:]).reshape(H, W, 4)
    uv = me.uv_layers.active.data
    col = np.zeros((len(me.vertices), 3)); seen = np.zeros(len(me.vertices), bool)
    for l in me.loops:
        if seen[l.vertex_index]:
            continue
        u, v = uv[l.index].uv
        col[l.vertex_index] = px[int(np.clip(v, 0, 0.9999) * H), int(np.clip(u, 0, 0.9999) * W), :3]
        seen[l.vertex_index] = True
    lum = col @ np.array((0.3, 0.59, 0.11)); sat = col.max(1) - col.min(1)
    nrm = np.array([v.normal for v in me.vertices])
    face = (P[:, 1] > 2.98) & (P[:, 1] < 3.6) & (P[:, 2] > 1.25)
    dark = face & (lum < 0.06)
    hx = 0.2
    eyes = []
    for s in (-1, 1):
        m = dark & (np.sign(P[:, 0] - hx) == s)
        if m.sum() < 3:
            print('eye not found on side', s); continue
        c = P[m].mean(0)
        d = np.linalg.norm(P - c, axis=1)
        white = (d < 0.3) & (lum > 0.72) & (sat < 0.1) & face
        iris = (d < 0.2) & (lum < 0.35) & face
        e = white | iris
        Q = P[e]; Bq = np.stack([Q[:, 0], -Q[:, 2], Q[:, 1]], 1)          # → Blender
        nB = nrm[e].mean(0); nB = Vector(nB).normalized()
        up = Vector((0, 0, 1)); uax = up.cross(nB).normalized(); vax = nB.cross(uax).normalized()
        cen = Vector(Bq.mean(0))
        pu = np.array([(Vector(q) - cen).dot(uax) for q in Bq]); pv = np.array([(Vector(q) - cen).dot(vax) for q in Bq])
        cen = cen + uax * (pu.max() + pu.min()) / 2 + vax * (pv.max() + pv.min()) / 2
        au, av = (pu.max() - pu.min()) / 2 + 0.03, (pv.max() - pv.min()) / 2 + 0.03
        ring = (d > 0.24) & (d < 0.36) & (sat < 0.12) & (lum > 0.35) & face
        skin = np.median(col[ring], 0) if ring.any() else np.array((0.62, 0.58, 0.56))
        eyes.append((cen, nB, uax * au, vax * av, skin))
    return eyes


def lid_mesh(S, cen, n, U, V, skin, rings=7, segs=28):
    """a smooth lid over an eye: an elliptic cap on the face's own surface (ray cast along the eye's normal), lifted a
    little off it and domed; the skin's colour, a dark lash line along its lower rim. Origin = its top (the blink squashes
    it down from there)"""
    bm = new_bm(); cl = bm.loops.layers.color[core.COL]
    grid = []
    for i in range(rings + 1):
        r = i / rings
        row = []
        for j in range(segs if i else 1):
            th = 2 * math.pi * j / segs
            q = cen + U * (r * math.cos(th)) + V * (r * math.sin(th))
            hit = S.bvh.ray_cast(q + n * 0.6, -n)
            base = hit[0] if hit[0] is not None else q
            row.append((bm.verts.new(base + n * (0.014 + 0.014 * (1 - r * r))), r, math.sin(th)))
        grid.append(row)
    for i in range(rings):
        a, b = grid[i], grid[i + 1]
        for j in range(segs):
            vs = [a[0][0], b[j][0], b[(j + 1) % segs][0]] if i == 0 else [a[j][0], b[j][0], b[(j + 1) % segs][0], a[(j + 1) % segs][0]]
            f = bm.faces.new(vs)
            f.normal_update()
            if f.normal.dot(n) < 0:
                f.normal_flip()
    lv = {v: (r, sn) for row in grid for v, r, sn in row}
    for f in bm.faces:
        for l in f.loops:
            r, sn = lv[l.vert]
            lash = max(0.0, min(1.0, (r - 0.6) / 0.14)) * max(0.0, min(1.0, (-sn + 0.1) / 0.25))
            rgb = np.array(skin) * (1 - lash) + np.array((0.1, 0.07, 0.06)) * lash
            l[cl] = (*rgb, 1.0)
    top = max(v.co.z for v in bm.verts)
    return bm, Vector((cen.x, cen.y, top))


# ------------------------------------------------------------------ 5. export + extras on the joints
ANIM = {
    'neck': {'anim': 'browse', 'share': 0.62}, 'head': {'anim': 'browse', 'share': 0.38},
    'jaw': {'anim': 'jaw', 'jaw': 0.6}, 'ear0': {'anim': 'ear', 'side': -1, 'seed': 41}, 'ear1': {'anim': 'ear', 'side': 1, 'seed': 48},
    'tail': {'anim': 'swish'}, 'tailtip': {'anim': 'swish', 'swishAmp': 0.7}, 'bell': {'anim': 'sway', 'freq': 0.9, 'amp': 0.12},
    **{f'leg{k}': {'anim': 'gait', 'leg': k, 'swing': 0.26} for k in range(4)},
    **{f'knee{k}': {'anim': 'knee', 'leg': k, 'bend': 0.55 if k < 2 else 0.45} for k in range(4)},
}


def patch_glb(path, extras):
    """set glTF extras on named nodes (the exporter does not write bone custom properties everywhere)"""
    data = open(path, 'rb').read()
    magic, ver, total = struct.unpack_from('<III', data, 0)
    jl, jt = struct.unpack_from('<II', data, 12)
    js = json.loads(data[20:20 + jl])
    rest = data[20 + jl:]
    for n in js['nodes']:
        if n.get('name') in extras:
            n['extras'] = {**n.get('extras', {}), **extras[n['name']]}
    out = json.dumps(js, separators=(',', ':')).encode()
    out += b' ' * ((4 - len(out) % 4) % 4)
    blob_ = struct.pack('<II', len(out), 0x4E4F534A) + out + rest
    open(path, 'wb').write(struct.pack('<III', magic, ver, 12 + len(blob_)) + blob_)
    return js


def build(debug=False):
    core.reset()
    body = load_sculpt()
    S = Surface(body)
    rig = armature(body)
    P, M = skin(body)
    sc = core.Scene(NAME)
    root = sc.group('donkey', None, props={'gaitroot': 1})
    rig.parent = root
    wood = core.material('saddle_wood', core.texset('saddle_wood', tex.wood, n=256, seed=33, planks=1, colors=('#b07a45', '#8c5a2e', '#64401f')))
    strap = core.material('girth_red', None, vcol=True, rough=0.8)
    lidm = core.material('donkey_lid', None, vcol=True, rough=0.6)
    sc.obj('donkey.saddle', saddle(S), wood, None, parent=root, vcol=False)
    sc.obj('donkey.girth', girth(S), strap, None, parent=root)
    # eyelids, parented to the head bone (rigid with it)
    lids = eye_lids(body, P)
    for k, (cen, n, U, V, skin_c) in enumerate(lids):
        bm, pivot = lid_mesh(S, cen, n, U, V, skin_c)
        core.transform(bm, Matrix.Translation(-pivot))
        lo = sc.obj(f'donkey.lid{k}', bm, lidm, None, parent=root, props={'anim': 'blink', 'seed': 31})
        lo.parent = rig; lo.parent_type = 'BONE'; lo.parent_bone = 'donkey.head'
        hb = rig.data.bones['donkey.head']
        lo.matrix_parent_inverse = Matrix.Identity(4)
        lo.matrix_basis = (hb.matrix_local @ Matrix.Translation((0, hb.length, 0))).inverted() @ Matrix.Translation(pivot)
    # loads in steps (like donkey-pack): l0 none, l1 basket, l2 + mat, l3 + sack
    place_loads(S, P)
    pg = pegs(S)
    M_ = core.material  # noqa
    from build import _load_mats, _load   # the same load meshes as the free props
    LM = _load_mats()
    order = ['basket', 'mat', 'sack']
    cache = {}
    for v in range(4):
        g = sc.group(f'l{v}', None); g.parent = root
        for kind in order[:v]:
            p, yaw = SLOTS[kind]
            M0 = Matrix.Translation(p) @ Matrix.Rotation(math.radians(yaw), 4, 'Z') @ Matrix.Diagonal((LOAD, LOAD, LOAD, 1))
            gz = _load(sc, LM, f'l{v}.{kind}', kind, parent=g, M0=M0, cache=cache)
            if kind + ':ties' in cache:
                sc.obj(f'l{v}.{kind}.ties', None, None, None, parent=g, mesh=cache[kind + ':ties'])
            else:
                cache[kind + ':ties'] = sc.obj(f'l{v}.{kind}.ties', load_ropes(kind, gz, pg), LM['rope'], None, parent=g, vcol=False).data
    slots = {k: {'pos': [round(p.x, 3), round(p.z, 3), round(-p.y, 3)], 'face': yaw} for k, (p, yaw) in SLOTS.items()}
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, NAME + '.glb')
    for o in bpy.data.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format='GLB', use_selection=False, export_yup=True, export_apply=False, export_extras=True,
        export_texcoords=True, export_normals=True, export_tangents=False, export_vertex_color='ACTIVE',
        export_materials='EXPORT', export_image_format='JPEG', export_jpeg_quality=86, export_cameras=False, export_lights=False,
        export_animations=False, export_skins=True, export_def_bones=False, export_morph=False)
    js = patch_glb(path, {'donkey.' + k: v for k, v in ANIM.items()})
    rot = [n['name'] for n in js['nodes'] if n.get('name', '').startswith('donkey.') and 'rotation' in n and
           max(abs(a - b) for a, b in zip(n['rotation'], (0, 0, 0, 1))) > 1e-4]
    if rot:
        print('WARNING joints with a rest rotation:', rot)
    info = {
        'variants': ['l0', 'l1', 'l2', 'l3'], 'steps': True, 'slots': slots, 'walker': True, 'skinned': True,
        'notes': 'Urechilă (film 049), a sculpted toy donkey (Meshy AI, rigged and skinned here) ≈ 4.65 tall at the ears (back ≈ 2.3), facing +Z: '
                 'grey with stripes, cream muzzle in an open smile, big ears, a brown mane, a red bridle with yellow and blue pompoms, '
                 'a golden bell on a red collar, a fiesta blanket (red, cream, blue, gold fringe) under a wooden sawbuck pack saddle. '
                 'Head + neck browse (or bray / look: prop gestures), the jaw opens, ears twitch, eyes blink, tail swishes, the bell sways; '
                 'walks with `put … "walk": true` (legs + knees); loads in steps l0 … l3 like donkey-pack. slots: where each load hangs '
                 '(donkey space, three.js: x, y, z; face = its yaw in degrees)'}
    with open(os.path.join(OUT, NAME + '.json'), 'w') as f:
        json.dump(info, f, indent=1)
    print(NAME + '.glb', os.path.getsize(path) // 1000, 'kB', '· slots', slots, '· lids', len(lids))
    if debug:
        dbg(body, M)


def dbg(body, M):
    """the same mesh coloured by its strongest bone (for checking the skin rules)"""
    pal = np.array([[0.6, 0.6, 0.6], [0.9, 0.2, 0.2], [0.2, 0.4, 0.95], [1, 0.9, 0.1], [0.1, 0.8, 0.3], [0.9, 0.3, 0.9], [0.2, 0.9, 0.9],
                    [1, 0.5, 0.1], [0.5, 0.2, 0.7], [0.1, 0.5, 0.2], [0.95, 0.6, 0.7], [0.4, 0.25, 0.1], [0.3, 0.3, 0.9], [0.8, 0.8, 0.4],
                    [0.2, 0.6, 0.6], [0.6, 0.1, 0.3], [0.9, 0.9, 0.9]])
    c = (M[:, :, None] * pal[None, :M.shape[1]]).sum(1)
    me = body.data.copy(); ob = bpy.data.objects.new('dbg', me)
    for a in list(me.color_attributes):
        me.color_attributes.remove(a)
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
    for i, cc in enumerate(c):
        ca.data[i].color = (*cc, 1)
    mat = bpy.data.materials.new('dbg'); mat.use_nodes = True
    nt = mat.node_tree; vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], nt.nodes['Principled BSDF'].inputs['Base Color'])
    me.materials.clear(); me.materials.append(mat)
    for o in bpy.data.objects:
        o.select_set(False)
    bpy.context.scene.collection.objects.link(ob); ob.select_set(True)
    os.makedirs(os.path.join(ROOT, 'stills'), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, 'stills', NAME + '-weights.glb'), export_format='GLB', use_selection=True,
                              export_vertex_color='ACTIVE', export_skins=False, export_animations=False)


if __name__ == '__main__':
    sys.path.insert(0, HERE)
    build(debug='--debug' in sys.argv)
