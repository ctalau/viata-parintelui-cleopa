"""The toy monk: skeleton, every body part and every look variant (hair, beards, hats, cloaks), materials.

All numbers are THREE.js coordinates (Y up, the figure faces +Z, its LEFT is +X). Rest pose = standing, arms down.
See blender/common/CONTRACT.md for the measures other assets rely on.
"""
import math
import numpy as np
import bpy
from mathutils import Vector, Matrix

import bl
import sdf
import textures as tx

# ------------------------------------------------------------------ skeleton (rest pose)
HIP_Y = 1.42
J = {  # joints (three coords). Left side = +X; the right side is mirrored in bones().
    'root': (0, 0, 0), 'pelvis': (0, HIP_Y, 0), 'spine': (0, 1.68, 0), 'chest': (0, 2.10, 0), 'neck': (0, 2.78, 0),
    'head': (0, 2.97, 0), 'head_end': (0, 3.95, 0),
    'beard': (0, 3.04, 0.40), 'beard_end': (0, 2.62, 0.52),
    'clav': (0.10, 2.62, 0.0), 'shoulder': (0.70, 2.62, 0.0), 'elbow': (0.80, 1.98, -0.03), 'wrist': (0.86, 1.36, 0.03),
    'knuckle': (0.875, 1.185, 0.04),
    'hip': (0.30, HIP_Y, 0.0), 'knee': (0.30, 0.76, 0.03), 'ankle': (0.30, 0.13, 0.0), 'toe': (0.30, 0.06, 0.38),
}
SEAT_H = 0.62  # authored seat height (contract)


def mirror(p, side):
    return (p[0] * (1 if side == 'L' else -1), p[1], p[2])


def hand_frame(side):
    """Rest frame of a hand: origin wrist, d = down the fingers, f = thumb side (front), p = palm normal (toward body)."""
    W = np.array(mirror(J['wrist'], side)); K = np.array(mirror(J['knuckle'], side))
    d = K - W; d /= np.linalg.norm(d)
    p = np.array([-1.0 if side == 'L' else 1.0, 0, 0])
    p = p - d * np.dot(p, d); p /= np.linalg.norm(p)
    f = np.cross(p, d) if side == 'L' else np.cross(d, p)
    if f[2] < 0:
        f = -f
    return W, d, f, p


HS = 1.22  # hand scale (chunky toy hands)


def hpt(side, u, v, w):
    W, d, f, p = hand_frame(side)
    return tuple(W + HS * (u * d + v * f + w * p))


# finger layout in the hand frame: (name, v offset across the palm, w, seg lengths, radius)
FINGERS = [('index', 0.068, 0.0, (0.078, 0.066), 0.034), ('middle', 0.022, 0.0, (0.084, 0.070), 0.035),
           ('ring', -0.024, 0.0, (0.078, 0.064), 0.033), ('pinky', -0.066, 0.0, (0.064, 0.054), 0.029)]
KNUCKLE_U = 0.178
THUMB = [(0.050, 0.092, 0.030), (0.112, 0.140, 0.050), (0.168, 0.158, 0.062)]  # base, joint, tip (u, v, w)


def bones():
    B = []
    up, fwd = (0, 1, 0), (0, 0, 1)
    add = lambda name, h, t, parent=None, connect=False, roll=fwd, deform=True: B.append(dict(name=name, head=h, tail=t, parent=parent, connect=connect, roll_to=roll, deform=deform))
    add('root', J['root'], (0, 0, 0.4), roll=up)
    add('pelvis', J['pelvis'], J['spine'], 'root')
    add('spine', J['spine'], J['chest'], 'pelvis', True)
    add('chest', J['chest'], J['neck'], 'spine', True)
    add('neck', J['neck'], J['head'], 'chest', True)
    add('head', J['head'], J['head_end'], 'neck', True)
    add('beard', J['beard'], J['beard_end'], 'head', roll=fwd)
    for s in 'LR':
        m = lambda k: mirror(J[k], s)
        add(f'clav_{s}', m('clav'), mirror((0.56, 2.66, 0.0), s), 'chest')
        add(f'uparm_{s}', m('shoulder'), m('elbow'), f'clav_{s}')
        add(f'forearm_{s}', m('elbow'), m('wrist'), f'uparm_{s}', True)
        W, d, f, p = hand_frame(s)
        add(f'hand_{s}', m('wrist'), m('knuckle'), f'forearm_{s}', True, roll=tuple(p))
        for name, v, w, (l1, l2), r in FINGERS:
            a = hpt(s, KNUCKLE_U, v, w); b = hpt(s, KNUCKLE_U + l1, v, w); c = hpt(s, KNUCKLE_U + l1 + l2, v, w)
            add(f'{name}1_{s}', a, b, f'hand_{s}', roll=tuple(p))
            add(f'{name}2_{s}', b, c, f'{name}1_{s}', True, roll=tuple(p))
        t0, t1, t2 = [hpt(s, *q) for q in THUMB]
        add(f'thumb1_{s}', t0, t1, f'hand_{s}', roll=tuple(p))
        add(f'thumb2_{s}', t1, t2, f'thumb1_{s}', True, roll=tuple(p))
        add(f'thigh_{s}', m('hip'), m('knee'), 'pelvis')
        add(f'shin_{s}', m('knee'), m('ankle'), f'thigh_{s}', True)
        add(f'foot_{s}', m('ankle'), m('toe'), f'shin_{s}', True, roll=up)
    return B


# ------------------------------------------------------------------ geometry helpers
def ring(center, ax_u, ax_v, ru, rv, n=2.0, N=40):
    """Closed superellipse ring, N+1 points (seam duplicated). t=0 at -ax_v (back), t=0.5 at +ax_v (front)."""
    c = np.asarray(center, float); au = np.asarray(ax_u, float); av = np.asarray(ax_v, float)
    out = []
    for i in range(N + 1):
        th = 2 * math.pi * i / N
        s, co = math.sin(th), -math.cos(th)
        se = math.copysign(abs(s) ** (2 / n), s); ce = math.copysign(abs(co) ** (2 / n), co)
        out.append(c + au * ru * se + av * rv * ce)
    return np.array(out)


def loft(rings, cap0=True, cap1=True, vscale=1.0, uscale=1.0):
    """rings: list of (N+1, 3) arrays. Returns verts, faces, uvs (u around, v = length along)."""
    R = len(rings); M = len(rings[0])
    V = np.concatenate(rings)
    uv = []
    acc = 0.0
    prev = None
    for r in rings:
        c = r[:-1].mean(0)
        if prev is not None:
            acc += np.linalg.norm(c - prev)
        prev = c
        for i in range(M):
            uv.append((i / (M - 1) * uscale, acc * vscale))
    F = []
    for j in range(R - 1):
        for i in range(M - 1):
            a = j * M + i; b = a + 1; c = a + M + 1; d = a + M
            F.append((a, b, c, d))
    V = list(V); uv = list(uv)
    if cap0:
        ci = len(V); V.append(rings[0][:-1].mean(0)); uv.append((0.5 * uscale, -0.05 * vscale))
        for i in range(M - 1):
            F.append((ci, i + 1, i))
    if cap1:
        ci = len(V); V.append(rings[-1][:-1].mean(0)); uv.append((0.5 * uscale, (acc + 0.05) * vscale))
        base = (R - 1) * M
        for i in range(M - 1):
            F.append((ci, base + i, base + i + 1))
    V = np.array(V); F = fix_winding(V, F)
    return V, F, np.array(uv)


def fix_winding(V, F):
    """Make faces point away from the mesh centre line (lofts of convex-ish rings)."""
    V = np.asarray(V)
    c = V.mean(0)
    out = []
    flips = 0
    for f in F:
        a, b, cc = V[f[0]], V[f[1]], V[f[2]]
        n = np.cross(b - a, cc - a)
        if np.linalg.norm(n) < 1e-12 and len(f) == 4:
            a, b, cc = V[f[0]], V[f[2]], V[f[3]]; n = np.cross(b - a, cc - a)
        flips += 1 if np.dot(n, (a + b + cc) / 3 - c) < 0 else -1
    if flips > 0:
        return [tuple(reversed(f)) for f in F]
    return [tuple(f) for f in F]


def lathe(profile, N=48, center=(0, 0, 0)):
    """profile: list of (r, y) from bottom to top. Rings around Y."""
    rings = [ring((center[0], y, center[2]), (1, 0, 0), (0, 0, 1), r, r, 2.0, N) for r, y in profile]
    return rings


def tube_rings(path, radii, N=28, up=(0, 0, 1), n=2.0, squash=1.0):
    """Rings perpendicular to a polyline path (three coords)."""
    P = np.asarray(path, float); out = []
    upv = np.asarray(up, float)
    for i, (p, r) in enumerate(zip(P, radii)):
        if i == 0:
            t = P[1] - P[0]
        elif i == len(P) - 1:
            t = P[-1] - P[-2]
        else:
            t = P[i + 1] - P[i - 1]
        t = t / np.linalg.norm(t)
        a = upv - t * np.dot(upv, t); a /= np.linalg.norm(a)
        b = np.cross(t, a)
        out.append(ring(p, b, a, r, r * squash, n, N))
    return out


def sdf_part(name, f, lo, hi, step, mat, uvfn=None, coll=None, decimate=None):
    V, Q = sdf.mesh_sdf(f, lo, hi, step)
    uvs = uvfn(V) if uvfn else np.zeros((len(V), 2))
    ob = bl.mesh_object(name, V, Q.tolist(), uvs=uvs, mat=mat, coll=coll)
    if decimate:
        mod = ob.modifiers.new('dec', 'DECIMATE'); mod.ratio = decimate
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        ob.modifiers.remove(mod)
        old = ob.data; ob.data = me; me.name = name; bpy.data.meshes.remove(old)
        me.shade_smooth()
    return ob


def back_uv(center=(0, 0, 0), vscale=1.0, uscale=1.0):
    """cylindrical UVs whose seam runs down the BACK (cyl_uv's seam is in front of its axis)"""
    c = np.asarray(center, float)

    def f(V):
        d = V - c
        u = (np.arctan2(d[:, 0], d[:, 2]) / (2 * math.pi) + 0.5) * uscale
        return np.stack([u, d[:, 1] * vscale], -1)
    return f


def cyl_uv(center=(0, 0, 0), vscale=1.0, uscale=1.0):
    c = np.asarray(center, float)

    def f(V):
        d = V - c
        u = (np.arctan2(d[:, 0], -d[:, 2]) / (2 * math.pi) + 0.5) * uscale
        return np.stack([u, d[:, 1] * vscale], -1)
    return f


def verts3(ob):
    """Vertex positions of a mesh object in THREE coords (object at identity)."""
    me = ob.data
    a = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', a)
    a = a.reshape(-1, 3)
    return np.stack([a[:, 0], a[:, 2], -a[:, 1]], -1)


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------ materials
def make_materials():
    M = {}
    w_alb, w_r, w_n = tx.weave(1024, 72, 1, fuzz=0.45)   # coarse hand-woven wool (the poster's chunky threads)
    cloth = (bl.image_from_array('cloth_albedo', w_alb), bl.image_from_array('cloth_rough', w_r, 'Non-Color'), bl.image_from_array('cloth_normal', w_n, 'Non-Color'))
    f_alb, f_r, f_n = tx.fur(1024, 3)
    fur = (bl.image_from_array('fur_albedo', f_alb), bl.image_from_array('fur_rough', f_r, 'Non-Color'), bl.image_from_array('fur_normal', f_n, 'Non-Color'))
    s_alb, s_r, s_n = tx.strands(512, 7, count=30, wave=0.006)
    hair = (bl.image_from_array('hair_albedo', s_alb), bl.image_from_array('hair_rough', s_r, 'Non-Color'), bl.image_from_array('hair_normal', s_n, 'Non-Color'))
    p_alb, p_r, p_n = tx.plastic(512, 11)
    plast = (None, bl.image_from_array('plastic_rough', p_r, 'Non-Color'), bl.image_from_array('plastic_normal', p_n, 'Non-Color'))
    r_alb, r_r, r_n = tx.rope(512, 17)
    ropet = (bl.image_from_array('rope_albedo', r_alb), bl.image_from_array('rope_rough', r_r, 'Non-Color'), bl.image_from_array('rope_normal', r_n, 'Non-Color'))
    l_alb, l_r, l_n = tx.leather(512, 13)
    leath = (bl.image_from_array('leather_albedo', l_alb), bl.image_from_array('leather_rough', l_r, 'Non-Color'), bl.image_from_array('leather_normal', l_n, 'Non-Color'))

    def cl(name, col, maps, **kw):
        M[name] = bl.material(name, col, base_img=maps[0], rough_img=maps[1], normal_img=maps[2], **kw)
    yellow = (0.93, 0.70, 0.13)
    cl('skin', (0.93, 0.56, 0.03), plast, roughness=0.32, clearcoat=0.35, clearcoat_rough=0.18)
    cl('face', (0.93, 0.56, 0.03), (None, None, None), roughness=0.34, clearcoat=0.35, clearcoat_rough=0.18)
    cl('robe', (0.25, 0.17, 0.12), cloth, normal_strength=1.0, sheen=0.25, sheen_rough=0.45, sheen_tint=(0.9, 0.9, 0.9))
    cl('sleeve', (0.25, 0.17, 0.12), cloth, normal_strength=1.0, sheen=0.25, sheen_rough=0.45, sheen_tint=(0.9, 0.9, 0.9))
    cl('legs', (0.20, 0.15, 0.11), cloth, sheen=0.4)
    cl('cloak', (0.08, 0.07, 0.07), cloth, normal_strength=1.2, sheen=0.6, sheen_rough=0.5)
    cl('fur', (0.55, 0.40, 0.25), fur, normal_strength=1.5, sheen=0.35, sheen_rough=0.6)
    k_alb, k_r, k_n = tx.knit(1024, 16, 20)
    knitm = (bl.image_from_array('knit_albedo', k_alb), bl.image_from_array('knit_rough', k_r, 'Non-Color'), bl.image_from_array('knit_normal', k_n, 'Non-Color'))
    # chunky hand knitting (the yarn elder's hood and cape, the poster of `_short-002-pacea`); the runtime also lends these
    # maps to the robe and the sleeves of a yarn elder
    cl('knit', (0.10, 0.095, 0.11), knitm, normal_strength=1.0, roughness=0.97, specular=0.25, sheen=1.0, sheen_rough=0.5, sheen_tint=(0.6, 0.6, 0.65))
    cl('hat', (0.06, 0.06, 0.07), cloth, normal_strength=0.8, sheen=0.3, sheen_tint=(0.3, 0.3, 0.3))
    cl('hair', (0.35, 0.22, 0.12), hair, normal_strength=1.0, roughness=0.5)
    cl('beard', (0.92, 0.92, 0.90), hair, normal_strength=1.0, roughness=0.55)
    cl('belt', (0.45, 0.33, 0.20), leath)
    cl('rope', (0.78, 0.62, 0.38), ropet, normal_strength=1.3, roughness=0.9)
    cl('shoes', (0.25, 0.16, 0.10), leath)
    cl('trim', (0.55, 0.45, 0.30), cloth, sheen=0.4)
    return M


# ------------------------------------------------------------------ parts
def build_parts(rig, M):
    """Returns dict part name -> dict(obj, kind='rigid'|'skinned', bone, group (variant group), variant)."""
    P = {}

    def rigid(name, ob, bone, group=None, variant=None, collide=True):
        bl.parent_to_bone(ob, rig, bone)
        P[name] = dict(obj=ob, kind='rigid', bone=bone, group=group, variant=variant, collide=collide)
        ob['part'] = name
        if group:
            ob['group'] = group; ob['variant'] = variant
        return ob

    def skinned(name, ob, weights, group=None, variant=None, collide=True):
        bl.skin(ob, rig, weights)
        P[name] = dict(obj=ob, kind='skinned', bone=None, group=group, variant=variant, collide=collide)
        ob['part'] = name
        if group:
            ob['group'] = group; ob['variant'] = variant
        return ob

    # ---- head (cylinder, rounded edges). Front half = 'face' material (printed face drawn at runtime), back = skin
    y0, y1, R = 2.965, 3.935, 0.56
    prof = [(0.0, y0 + 0.005), (0.30, y0 + 0.005), (0.44, y0 + 0.012), (0.51, y0 + 0.030), (0.545, y0 + 0.06), (0.558, y0 + 0.10)]
    prof += [(R, y) for y in np.linspace(y0 + 0.14, y1 - 0.14, 9)]
    prof += [(0.558, y1 - 0.10), (0.545, y1 - 0.06), (0.51, y1 - 0.03), (0.44, y1 - 0.012), (0.30, y1 - 0.005), (0.0, y1 - 0.005)]
    N = 64
    rings = lathe(prof, N)
    V = np.concatenate(rings); M1 = N + 1
    F = []; mats = []
    uv = np.zeros((len(V), 2))
    for j, r in enumerate(rings):
        for i in range(M1):
            th = 2 * math.pi * i / N  # 0 = back, pi = front
            ang = th - math.pi        # 0 at front, -pi..pi
            uv[j * M1 + i] = ((ang / (math.pi / 2)) * 0.5 + 0.5, (prof[j][1] - y0) / (y1 - y0))
    for j in range(len(rings) - 1):
        for i in range(N):
            a = j * M1 + i; b = a + 1; c = a + M1 + 1; d = a + M1
            F.append((a, b, c, d))
            th = 2 * math.pi * (i + 0.5) / N
            mats.append(1 if abs(th - math.pi) < math.pi / 2 else 0)
    F = fix_winding(V, F)
    ob = bl.mesh_object('head', V, F, uvs=np.clip(uv, 0, 1), mat=M['skin'])
    ob.data.materials.append(M['face'])
    ob.data.polygons.foreach_set('material_index', mats)
    rigid('head', ob, 'head')

    # ---- neck
    rings = lathe([(0.0, 2.70), (0.205, 2.70), (0.21, 2.75), (0.21, 3.00), (0.0, 3.0)], 32)
    V, F, uv = loft(rings, False, False)
    rigid('neck', bl.mesh_object('neck', V, F, uvs=uv, mat=M['skin']), 'neck', collide=False)

    # ---- torso of the robe (skinned pelvis / spine / chest), minifig trapezoid with soft corners
    secs = [(1.56, .738, .442), (1.70, .735, .44), (1.95, .705, .425), (2.20, .675, .415), (2.45, .635, .40),
            (2.60, .600, .385), (2.70, .56, .365), (2.77, .49, .335), (2.82, .38, .29), (2.855, .27, .245), (2.875, .225, .215), (2.88, 0.0, 0.0)]
    rings = [ring((0, y, 0.0), (1, 0, 0), (0, 0, 1), max(hw, 1e-3), max(hd, 1e-3), 3.2, 48) for y, hw, hd in secs]
    V, F, uv = loft(rings, True, False, vscale=1.3, uscale=3.0)
    y = V[:, 1]
    wc = smoothstep(1.95, 2.35, y); wp = 1 - smoothstep(1.55, 1.85, y)
    ws = np.clip(1 - wc - wp, 0, 1)
    skinned('torso', bl.mesh_object('torso', V, F, uvs=uv, mat=M['robe']), {'pelvis': wp, 'spine': ws, 'chest': wc})

    # ---- belt (a soft leather band)
    secs = [(1.66, .745, .448), (1.69, .755, .458), (1.75, .752, .455), (1.78, .74, .446)]
    rings = [ring((0, y, 0), (1, 0, 0), (0, 0, 1), a, b, 3.2, 48) for y, a, b in secs]
    V, F, uv = loft(rings, False, False, vscale=4, uscale=6)
    yy = V[:, 1]
    skinned('belt', bl.mesh_object('belt', V, F, uvs=uv, mat=M['belt']), {'pelvis': np.full(len(V), 0.6), 'spine': np.full(len(V), 0.4)}, group='belt', variant='belt', collide=False)

    # ---- rope belt (variant `rope` of the belt group): a twisted cord round the waist, a knot at the front left and two
    # ends hanging over the skirt, each with a small knot and a frayed tassel (the poster's monk). The ring follows the
    # waist like the leather belt; the hanging ends follow the front of the skirt (the same weights), so they ride on it.
    ra, rb, ry, rr_ = 0.79, 0.49, 1.72, 0.05
    ring_pts = [(ra * math.sin(a), ry + 0.012 * math.sin(3 * a), rb * math.cos(a)) for a in np.linspace(0, 2 * math.pi, 33)]
    kx, kz = 0.30, rb * math.cos(math.asin(0.30 / ra)) + 0.03
    knot = sdf.sunion(0.03, sdf.ellipsoid((kx, ry, kz + 0.02), (0.11, 0.09, 0.08)),
                      sdf.capsule((kx - 0.09, ry + 0.05, kz + 0.04), (kx + 0.08, ry - 0.05, kz + 0.06), 0.055))
    def cord(x0, x1, y1, dz):
        pts = [(kx + x0 * 0.3, ry - 0.06, kz + 0.06), (kx + x0, ry - 0.30, 0.56 + dz), (kx + (x0 + x1) / 2, (ry + y1) / 2 - 0.1, 0.59 + dz), (kx + x1, y1, 0.62 + dz)]
        tassel = sdf.sunion(0.02, sdf.sphere((kx + x1, y1 + 0.02, 0.62 + dz), 0.075),
                            sdf.capsule((kx + x1, y1 - 0.02, 0.62 + dz), (kx + x1, y1 - 0.26, 0.64 + dz), 0.06, 0.095))
        return sdf.union(sdf.spline_tube(pts, [0.042, 0.04, 0.04, 0.042], 36), tassel)
    rope_f = sdf.union(sdf.spline_tube(ring_pts, [rr_] * len(ring_pts), 96), knot, cord(-0.04, -0.06, 1.12, 0.0), cord(0.06, 0.13, 1.02, 0.02))
    ob = sdf_part('belt_rope', rope_f, (-0.9, 0.65, -0.6), (0.9, 1.85, 0.85), 0.012, M['rope'], uvfn=cyl_uv((0, 0, 0), 6.0, 10.0), decimate=0.3)
    V = verts3(ob)
    wr = smoothstep(1.50, 1.64, V[:, 1])
    sw = skirt_weights(V)
    W = {k: (1 - wr) * v for k, v in sw.items()}
    W['pelvis'] = W.get('pelvis', 0) + wr * 0.6
    W['spine'] = wr * 0.4
    skinned('belt_rope', ob, W, group='belt', variant='rope', collide=False)

    # ---- skirt of the robe (bell, hem with a turned-in lip, skinned to pelvis + legs)
    outer = [(1.62, .755, .455), (1.45, .765, .465), (1.20, .785, .49), (0.95, .81, .52), (0.70, .835, .555), (0.45, .865, .59), (0.27, .885, .615), (0.18, .89, .62)]
    lip = [(0.145, .885, .615), (0.14, .865, .595), (0.16, .84, .57)]
    inner = [(0.35, .815, .545), (0.80, .775, .50), (1.25, .74, .45), (1.40, 0.4, 0.3), (1.42, 0.0, 0.0)]
    secs = outer + lip + inner
    rings = [ring((0, y, 0.0), (1, 0, 0), (0, 0, 1), max(a, 1e-3), max(b, 1e-3), 2.6, 56) for y, a, b in secs]
    V, F, uv = loft(rings, True, False, vscale=1.2, uscale=3.5)
    F = [tuple(f) for f in F]
    # winding: the loft folds back inside, fix_winding guessed from the centroid; force outward on the outer part
    skirt_w = skirt_weights(V)
    skinned('skirt', bl.mesh_object('skirt', V, F, uvs=uv, mat=M['robe']), skirt_w)

    # ---- legs (trousers) + boots: rigid
    for s in 'LR':
        hip, knee, ank = np.array(mirror(J['hip'], s)), np.array(mirror(J['knee'], s)), np.array(mirror(J['ankle'], s))
        rings = tube_rings([hip + [0, 0.12, 0], hip, (hip + knee) / 2, knee + [0, 0.04, 0]], [0.12, 0.215, 0.205, 0.19], 24)
        V, F, uv = loft(rings, True, True)
        rigid(f'thigh_{s}', bl.mesh_object(f'thigh_{s}', V, F, uvs=uv, mat=M['legs']), f'thigh_{s}')
        rings = tube_rings([knee + [0, 0.08, 0], knee, (knee + ank) / 2, ank + [0, 0.06, 0]], [0.17, 0.19, 0.175, 0.16], 24)
        V, F, uv = loft(rings, True, True)
        rigid(f'shin_{s}', bl.mesh_object(f'shin_{s}', V, F, uvs=uv, mat=M['legs']), f'shin_{s}')
        x = ank[0]
        boot = sdf.sunion(0.05, sdf.rbox((x, 0.10, 0.10), (0.155, 0.10, 0.27), 0.08), sdf.capsule((x, 0.12, -0.02), (x, 0.30, -0.02), 0.16, 0.15))
        boot = sdf.inter(boot, sdf.plane((0, -1, 0), -0.0))
        ob = sdf_part(f'boot_{s}', boot, (x - 0.25, -0.02, -0.25), (x + 0.25, 0.42, 0.42), 0.018, M['shoes'], uvfn=cyl_uv((x, 0, 0), 2, 2), decimate=0.25)
        rigid(f'boot_{s}', ob, f'foot_{s}')

    # ---- sleeves (skinned shoulder/upper arm/forearm, wide monk cuff with a hollow mouth) + hands
    for s in 'LR':
        S, E, W = np.array(mirror(J['shoulder'], s)), np.array(mirror(J['elbow'], s)), np.array(mirror(J['wrist'], s))
        dU = (E - S) / np.linalg.norm(E - S); dF = (W - E) / np.linalg.norm(W - E)
        path = [S - dU * 0.20, S - dU * 0.13, S - dU * 0.04, S + (E - S) * 0.3, S + (E - S) * 0.75, E, E + (W - E) * 0.35, E + (W - E) * 0.75, W + dF * 0.0, W + dF * 0.04, W + dF * 0.035, W + dF * -0.03, W - dF * 0.12]
        radii = [0.06, 0.17, 0.215, 0.20, 0.185, 0.18, 0.185, 0.20, 0.225, 0.22, 0.19, 0.165, 0.12]
        rings = tube_rings(path, radii, 32, up=(0, 0, 1))
        V, F, uv = loft(rings, True, True, vscale=1.5, uscale=2)
        # parameter along the arm for weights
        tS = (V - S) @ dU
        tE = (V - E) @ dF
        w_up = 1 - smoothstep(-0.10, 0.10, tE)
        w_fo = smoothstep(-0.10, 0.10, tE)
        w_ch = (1 - smoothstep(-0.16, 0.06, tS)) * 0.55
        w_up = w_up * (1 - w_ch)
        skinned(f'sleeve_{s}', bl.mesh_object(f'sleeve_{s}', V, F, uvs=uv, mat=M['sleeve']), {f'clav_{s}': w_ch, f'uparm_{s}': w_up, f'forearm_{s}': w_fo})
        build_hand(s, M, skinned)

    # ---- hair variants (rigid on head)
    hair_parts(M, rigid)
    beard_parts(M, rigid)
    hat_parts(M, rigid, skinned)
    yarnhood_parts(M, skinned)
    cloak_parts(M, skinned)
    face_relief_parts(M, rigid)
    return P


def face_relief_parts(M, rigid):
    """The sculpted face of the poster (look.face "detailed"): two fluffy white brows and a round button nose in relief,
    on the front of the head over the printed face. Brows: group `brows3d` (the runtime lifts / tilts them with the
    expression), nose: group `nose3d`."""
    R = 0.56
    def on_head(x, y, out):
        return (x, y, math.sqrt(max(0.0, R * R - x * x)) + out)
    for side, sx in (('L', 1), ('R', -1)):
        pts = [on_head(sx * (0.105 + 0.205 * k), 3.655 + 0.03 * math.sin(math.pi * k) - 0.008 * k, 0.025) for k in np.linspace(0, 1, 6)]
        blobs = [sdf.ellipsoid(p, (0.05, 0.042 - 0.006 * abs(i - 2.5) / 2.5, 0.035)) for i, p in enumerate(pts)]
        tufts = [sdf.capsule(pts[i], (pts[i][0] + sx * 0.04, pts[i][1] + 0.035, pts[i][2] + 0.01), 0.026, 0.012) for i in range(0, 6, 2)]
        f = sdf.sunion(0.025, *blobs, *tufts)
        fz = lambda P, f=f: f(P) - 0.004 * np.cos(P[:, 0] * 70 + P[:, 1] * 30)   # broad soft ridges: fine ones (×160) shimmered on screen as the head moved
        lo, hi = ((0.02, 3.55, 0.35), (0.42, 3.8, 0.7)) if sx > 0 else ((-0.42, 3.55, 0.35), (-0.02, 3.8, 0.7))
        rigid(f'brow3d_{side}', sdf_part(f'brow3d_{side}', fz, lo, hi, 0.008, M['beard'], uvfn=cyl_uv((0, 0, 0), 2, 2), decimate=0.3),
              'head', 'brows3d', 'on', collide=False)
    nose = sdf.ellipsoid(on_head(0.0, 3.425, 0.0), (0.072, 0.06, 0.06))
    rigid('nose3d', sdf_part('nose3d', nose, (-0.12, 3.33, 0.45), (0.12, 3.52, 0.68), 0.008, M['skin'], uvfn=cyl_uv((0, 0, 0), 2, 2), decimate=0.4),
          'head', 'nose3d', 'on', collide=False)


def skirt_weights(V):
    x, y, z = V[:, 0], V[:, 1], V[:, 2]
    legW = smoothstep(1.42, 0.85, y) * 0.90
    back = z < 0
    legW = np.where(back, legW * (0.55 + 0.45 * smoothstep(0.0, 0.6, y)), legW)  # the back hangs more freely
    sideL = np.clip((x / 0.62 + 1) / 2, 0, 1)
    sideL = smoothstep(0.0, 1.0, sideL)
    shinF = smoothstep(0.80, 0.30, y) * 0.45
    W = {'pelvis': 1 - legW}
    for s, w in (('L', sideL), ('R', 1 - sideL)):
        W[f'thigh_{s}'] = legW * w * (1 - shinF)
        W[f'shin_{s}'] = legW * w * shinF
    return W


def build_hand(s, M, skinned):
    """Chunky toy hand: palm + 4 two-segment fingers + thumb, one mesh, rigid weights per bone."""
    W, d, f, p = hand_frame(s)
    pt = lambda u, v, w: W + HS * (u * d + v * f + w * p)
    # palm in hand space: build as SDF in world coords with a local frame transform
    Mx = np.eye(4); Mx[:3, 0] = f; Mx[:3, 1] = -d; Mx[:3, 2] = p; Mx[:3, 3] = pt(0.095, 0.0, 0.0)
    palm = sdf.transform(sdf.rbox((0, 0, 0), (0.105 * HS, 0.098 * HS, 0.052 * HS), 0.045 * HS), Mx)
    pieces = [('hand', sdf.sunion(0.03, palm, sdf.capsule(pt(-0.02, 0, 0), pt(0.05, 0, 0), 0.075 * HS, 0.08 * HS)))]
    for name, v, w, (l1, l2), r in FINGERS:
        a = pt(KNUCKLE_U - 0.01, v, w); b = pt(KNUCKLE_U + l1, v, w); c = pt(KNUCKLE_U + l1 + l2 - r * 0.85, v, w)
        r = r * HS
        c = pt(KNUCKLE_U + l1 + l2, v, w) - (pt(KNUCKLE_U + l1 + l2, v, w) - b) / np.linalg.norm(pt(KNUCKLE_U + l1 + l2, v, w) - b) * r * 0.85
        pieces.append((f'{name}1', sdf.capsule(a, b, r * 1.02, r)))
        pieces.append((f'{name}2', sdf.capsule(b, c, r, r * 0.95)))
    t0, t1, t2 = [pt(*q) for q in THUMB]
    pieces.append(('thumb1', sdf.capsule(pt(0.03, 0.06, 0.02), t1, 0.042 * HS, 0.038 * HS)))
    pieces.append(('thumb2', sdf.capsule(t1, t2 - (t2 - t1) / np.linalg.norm(t2 - t1) * 0.035, 0.037 * HS, 0.034 * HS)))
    # one SDF; each vertex then belongs to the piece it is nearest to
    k = 0.012
    full = sdf.sunion(k, *[g for _, g in pieces])
    lo = W - 0.42; hi = W + 0.42
    V, Q = sdf.mesh_sdf(full, lo, hi, 0.0085)
    D = np.stack([g(V) for _, g in pieces], -1)
    owner = np.argmin(D, -1)
    weights = {}
    for i, (name, _) in enumerate(pieces):
        weights[f'{name}_{s}'] = (owner == i).astype(float)
    uvs = np.stack([V[:, 0] * 3, V[:, 1] * 3], -1)
    ob = bl.mesh_object(f'hand_{s}', V, Q.tolist(), uvs=uvs, mat=M['skin'])
    dec = ob.modifiers.new('dec', 'DECIMATE'); dec.ratio = 0.45
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg)); ob.modifiers.remove(dec)
    old = ob.data; ob.data = me; bpy.data.meshes.remove(old); me.name = f'hand_{s}'; me.shade_smooth()
    V2 = verts3(ob)
    D = np.stack([g(V2) for _, g in pieces], -1); owner = np.argmin(D, -1)
    # soften the knuckle seams a little (2 nearest pieces within 0.01 share the vertex)
    srt = np.sort(D, -1)
    weights = {}
    for i, (name, _) in enumerate(pieces):
        w = (owner == i).astype(float)
        weights[f'{name}_{s}'] = w
    skinned(f'hand_{s}', ob, weights)


def hair_parts(M, rigid):
    head_c = np.array([0, 3.45, 0])


    def shell(extra, top_cut_front, back_low, name, fn=None, step=0.016):
        # hair = head grown by `extra`, kept above a line that is high in front (forehead) and low at the back
        grown = sdf.head_shape(extra)
        def cut(P):
            # height of the hairline around the head: front top_cut_front .. back back_low
            ang = np.arctan2(P[:, 0], P[:, 2])  # 0 = front
            k = (1 - np.cos(ang)) / 2            # 0 front .. 1 back
            line = top_cut_front + (back_low - top_cut_front) * smoothstep(0.15, 0.85, k)
            return line - P[:, 1]
        f = sdf.inter(grown, cut, 0.04)
        if fn:
            f = fn(f)
        return sdf_part(name, f, (-0.75, 2.8, -0.75), (0.75, 4.35, 0.75), step, M['hair'], uvfn=cyl_uv((0, 0, 0), 2.0, 2.0), decimate=0.25)

    # short: neat cap with a soft side parting and gentle locks
    def locks(f):
        return lambda P: f(P) - 0.012 * np.cos(np.arctan2(P[:, 0], P[:, 2]) * 22) * smoothstep(3.3, 3.9, P[:, 1])
    rigid('hair_short', shell(0.05, 3.80, 3.20, 'hair_short', locks), 'head', 'hair', 'short')
    # curly: many round curls, deterministic
    rng = np.random.default_rng(5)
    curls = []
    for i in range(140):
        th = rng.uniform(-math.pi, math.pi); yy = rng.uniform(3.15, 4.02)
        k = (1 - math.cos(th)) / 2
        line = 3.86 + (3.12 - 3.86) * float(smoothstep(0.15, 0.85, k))
        if yy < line:
            continue
        rr = 0.6 if yy < 3.86 else 0.6 * math.sqrt(max(0.0, 1 - ((yy - 3.86) / 0.32) ** 2)) + 0.05
        c = (math.sin(th) * rr, yy, math.cos(th) * rr)
        curls.append(sdf.sphere(c, rng.uniform(0.085, 0.12)))
    curly = sdf.sunion(0.035, sdf.inter(sdf.head_shape(0.05), lambda P: (3.80 + (3.15 - 3.80) * smoothstep(0.15, 0.85, (1 - np.cos(np.arctan2(P[:, 0], P[:, 2]))) / 2)) - P[:, 1], 0.03), *curls)
    rigid('hair_curly', sdf_part('hair_curly', curly, (-0.85, 2.9, -0.85), (0.85, 4.4, 0.85), 0.016, M['hair'], uvfn=cyl_uv((0, 0, 0), 2, 2), decimate=0.22), 'head', 'hair', 'curly')
    # long: cap + hair down the back to the shoulders, tied low
    long_ = sdf.sunion(0.06, sdf.inter(sdf.head_shape(0.065), lambda P: (3.82 + (3.0 - 3.82) * smoothstep(0.15, 0.85, (1 - np.cos(np.arctan2(P[:, 0], P[:, 2]))) / 2)) - P[:, 1], 0.04),
                       sdf.capsule((0, 3.3, -0.50), (0, 2.85, -0.52), 0.30, 0.16))
    rigid('hair_long', sdf_part('hair_long', locks(long_), (-0.85, 2.6, -0.95), (0.85, 4.35, 0.85), 0.016, M['hair'], uvfn=cyl_uv((0, 0, 0), 2, 2), decimate=0.25), 'head', 'hair', 'long')
    # bald with a fringe ring (elder)
    ring_ = sdf.inter(sdf.head_shape(0.04), lambda P: np.maximum(3.30 - P[:, 1], P[:, 1] - 3.62 - 0.0 * P[:, 2]), 0.03)
    ring_ = sdf.inter(ring_, lambda P: P[:, 2] - 0.15, 0.06)
    rigid('hair_fringe', sdf_part('hair_fringe', locks(ring_), (-0.85, 3.1, -0.85), (0.85, 3.8, 0.4), 0.016, M['hair'], uvfn=cyl_uv((0, 0, 0), 2, 2), decimate=0.25), 'head', 'hair', 'fringe')


def beard_parts(M, rigid):
    """short / full / long beards. Jaw part rigid on the head, the long flowing part on the `beard` bone."""
    def jaw(thick, low, side_top, mouth_top, ks=(0.06, 0.30), back=0.60):
        grown = sdf.head_shape(thick)

        def region(P):
            k = np.abs(np.arctan2(P[:, 0], P[:, 2])) / math.pi  # 0 front .. 1 back
            top = mouth_top + (side_top - mouth_top) * smoothstep(ks[0], ks[1], k)
            return np.maximum(P[:, 1] - top, (k - back) * 1.2)
        f = sdf.inter(grown, region, 0.035)
        return sdf.sunion(0.12, f, sdf.ellipsoid((0, low + 0.10, 0.36), (0.40, 0.16 + thick, 0.22)))

    def mustache(thick=0.05):
        L = sdf.capsule((-0.03, 3.375, 0.585), (-0.22, 3.325, 0.535), thick, thick * 0.6)
        R = sdf.capsule((0.03, 3.375, 0.585), (0.22, 3.325, 0.535), thick, thick * 0.6)
        return sdf.sunion(0.03, L, R)

    def strands_disp(f, amp=0.005, n=26):
        return lambda P: f(P) - amp * np.cos(np.arctan2(P[:, 0], P[:, 2] + 0.2) * n) * smoothstep(3.3, 3.0, P[:, 1])

    uv = cyl_uv((0, 0, 0.2), 1.5, 1.5)
    short = jaw(0.042, 2.95, 3.24, 3.17)   # no moustache: the printed mouth (the smile) stays visible
    rigid('beard_short', sdf_part('beard_short', strands_disp(short), (-0.8, 2.75, -0.2), (0.8, 3.6, 0.9), 0.014, M['beard'], uvfn=uv, decimate=0.25), 'head', 'beard', 'short')
    full = sdf.sunion(0.04, jaw(0.10, 2.80, 3.45, 3.165), sdf.ellipsoid((0, 2.86, 0.45), (0.42, 0.24, 0.22)), mustache(0.055))
    rigid('beard_full', sdf_part('beard_full', strands_disp(full, 0.008), (-0.8, 2.5, -0.2), (0.8, 3.6, 0.9), 0.014, M['beard'], uvfn=uv, decimate=0.25), 'head', 'beard', 'full')
    # fluffy: the poster's sculpted beard — a soft base under the chin and ~18 wavy, tapering locks that fall over the
    # chest to y ≈ 2.6, with a full, curled moustache. Rigid on the head (kept above the chest line, like the full beard),
    # and narrow (|x| < 0.5) so it always stays in front of a hood or a veil.
    rng = np.random.default_rng(31)
    locks = []
    for i in range(18):
        a = -0.95 + 1.9 * (i + 0.5) / 18 + rng.uniform(-0.04, 0.04)
        r0 = 0.56
        x0, z0 = math.sin(a) * r0 * 0.88, math.cos(a) * r0 + 0.02
        y0 = 3.03 + 0.22 * max(0.0, abs(a) - 0.3)   # below the lips: the mouth shows between the moustache and the beard
        y1 = 2.60 + 0.10 * abs(a) + rng.uniform(-0.03, 0.03)
        w = rng.uniform(0.03, 0.06) * (1 if i % 2 else -1)
        pts = [(x0, y0, z0), (x0 * 0.92 + w, (2 * y0 + y1) / 3, z0 + 0.08), (x0 * 0.82 - w, (y0 + 2 * y1) / 3, z0 + 0.10), (x0 * 0.7 + w * 0.6, y1, z0 + 0.04)]
        locks.append(sdf.spline_tube(pts, [0.085, 0.09, 0.07, 0.028], 24))
    stache = sdf.sunion(0.03, sdf.spline_tube([(-0.02, 3.38, 0.6), (-0.15, 3.36, 0.58), (-0.27, 3.30, 0.52), (-0.30, 3.36, 0.48)], [0.06, 0.065, 0.045, 0.025], 24),
                        sdf.spline_tube([(0.02, 3.38, 0.6), (0.15, 3.36, 0.58), (0.27, 3.30, 0.52), (0.30, 3.36, 0.48)], [0.06, 0.065, 0.045, 0.025], 24))
    # the moustache (beard_fluffy) and the rest — cheeks, chin, locks (beard_fluffy_jaw) — both rigid on the head. The locks
    # start well below the lips: the printed mouth shows whole between moustache and beard and moves as he talks (a beard
    # that dropped with the mouth moved like a block — reviewer, film 040).
    trim = lambda f: sdf.inter(f, lambda P: np.maximum(np.abs(P[:, 0]) - 0.5 - 0.14 * smoothstep(2.93, 3.03, P[:, 1]) - 0.06 * smoothstep(3.0, 3.35, P[:, 1]), 0.12 - P[:, 2] - 0.34 * smoothstep(2.93, 3.03, P[:, 1]) - 0.1 * smoothstep(3.0, 3.35, P[:, 1])), 0.04)   # wraps the lower head back to the veil (no yellow chin peeping out behind the beard in profile), but not below the head (a bowed head would push that into the chest)
    grooves = lambda f: (lambda P: f(P) - 0.007 * np.cos(np.arctan2(P[:, 0], P[:, 2] + 0.3) * 60) * smoothstep(3.25, 3.0, P[:, 1]))   # fine grooves along the locks
    lower = trim(sdf.sunion(0.04, jaw(0.08, 2.85, 3.40, 3.10, ks=(0.085, 0.2), back=0.75), sdf.ellipsoid((0, 2.92, 0.46), (0.40, 0.22, 0.2)), sdf.union(*locks)))
    rigid('beard_fluffy', sdf_part('beard_fluffy', grooves(stache), (-0.45, 3.2, 0.3), (0.45, 3.5, 0.75), 0.011, M['beard'], uvfn=uv, decimate=0.25), 'head', 'beard', 'fluffy')
    rigid('beard_fluffy_jaw', sdf_part('beard_fluffy_jaw', grooves(lower), (-0.85, 2.45, -0.2), (0.85, 3.6, 0.95), 0.011, M['beard'], uvfn=uv, decimate=0.25), 'head', 'beard', 'fluffy')
    # long: jaw (head) + flowing beard (beard bone) that hangs to the belt line, wavy locks, tapering to a soft point
    jaw_l = sdf.sunion(0.04, jaw(0.06, 2.86, 3.36, 3.165), mustache(0.058))
    rigid('beard_long_jaw', sdf_part('beard_long_jaw', strands_disp(jaw_l, 0.008), (-0.8, 2.6, -0.2), (0.8, 3.6, 0.9), 0.014, M['beard'], uvfn=uv, decimate=0.25), 'head', 'beard', 'long')

    def flow(P):
        y = P[:, 1]
        t = np.clip((3.02 - y) / (3.02 - 1.92), 0, 1)        # 0 at the chin .. 1 at the tip
        hw = 0.40 * (1 - t) ** 0.55 * (1 - 0.25 * t) + 0.035 # half width
        cz = 0.47 + 0.07 * t - 0.03 * (t ** 2)                # stays in front of the chest
        th = 0.13 * (1 - 0.55 * t) + 0.02
        q = np.stack([P[:, 0] / hw, (P[:, 2] - cz) / th], -1)
        d = (np.sqrt(np.sum(q * q, -1)) - 1) * np.minimum(hw, th)
        d = np.maximum(d, np.maximum(y - 3.05, 1.92 - y + 0.0 * t))
        waves = 0.012 * np.cos(P[:, 0] / np.maximum(hw, 0.05) * 7.5 + 2.0 * t) + 0.008 * np.cos(P[:, 0] * 41)
        return d - waves
    flow_r = sdf.sunion(0.06, flow, sdf.sphere((0, 1.98, 0.53), 0.05))
    rigid('beard_long', sdf_part('beard_long', flow_r, (-0.6, 1.8, 0.2), (0.6, 3.15, 0.85), 0.014, M['beard'], uvfn=lambda V: np.stack([V[:, 0] * 2.2 + 0.5, V[:, 1] * 1.2], -1), decimate=0.25), 'beard', 'beard', 'long')


def hat_parts(M, rigid, skinned):
    def folds(n, amp, y0, y1):
        return lambda P: amp * np.cos(np.arctan2(P[:, 0], P[:, 2]) * n) * smoothstep(y0, y1, P[:, 1])
    # cap (skufia): a soft rounded cap over the top of the head (covers the short hair), slightly puffy crown
    cap = sdf.inter(sdf.sunion(0.08, sdf.head_shape(0.085), sdf.ellipsoid((0, 3.93, 0), (0.60, 0.17, 0.60))),
                    lambda P: (3.66 + 0.03 * np.cos(np.arctan2(P[:, 0], P[:, 2]))) - P[:, 1], 0.03)
    f = folds(8, 0.006, 3.85, 4.05)
    rigid('hat_cap', sdf_part('hat_cap', lambda P: cap(P) - f(P), (-0.8, 3.5, -0.8), (0.8, 4.3, 0.8), 0.014, M['hat'], uvfn=cyl_uv((0, 0, 0), 2, 2), decimate=0.25), 'head', 'hat', 'cap')
    # kamilavka-like: a soft cylinder hat with a flat top and a small flare
    kam = sdf.sunion(0.02, sdf.rcyl((0, 3.98, 0), 0.645, 0.30, 0.05), sdf.rcyl((0, 4.245, 0), 0.675, 0.035, 0.03))
    rigid('hat_kamilavka', sdf_part('hat_kamilavka', kam, (-0.85, 3.5, -0.85), (0.85, 4.4, 0.85), 0.014, M['hat'], uvfn=cyl_uv((0, 0, 0), 2, 2), decimate=0.25), 'head', 'hat', 'kamilavka')
    # cowl (hood): soft rounded hood around the head, open face with a rolled rim, a drape down the back of the neck
    outer = sdf.sunion(0.16, sdf.head_shape(0.075), sdf.superellipsoid((0, 3.46, -0.04), (0.69, 0.64, 0.70), 2.6), sdf.ellipsoid((0, 2.92, -0.20), (0.70, 0.32, 0.50)), sdf.rbox((0, 2.62, -0.38), (0.52, 0.30, 0.08), 0.08))
    face_open = sdf.ellipsoid((0, 3.40, 0.70), (0.47, 0.53, 0.42))
    hood = sdf.ssub(0.05, outer, face_open)
    hood = sdf.ssub(0.02, hood, sdf.head_shape(0.012))
    rim = sdf.inter(sdf.displace(sdf.ellipsoid((0, 3.40, 0.70), (0.52, 0.58, 0.47)), lambda P: 0.0), lambda P: -sdf.ellipsoid((0, 3.40, 0.70), (0.45, 0.51, 0.40))(P))
    rim = sdf.inter(rim, sdf.head_shape(0.12), 0.02)
    hood = sdf.sunion(0.03, hood, rim)
    hood = sdf.inter(hood, lambda P: 2.33 - P[:, 1], 0.03)
    fo = folds(9, 0.008, 3.6, 2.6)
    ob = sdf_part('hat_cowl', lambda P: hood(P) - fo(P), (-0.9, 2.2, -0.8), (0.9, 4.2, 0.95), 0.014, M['hat'], uvfn=cyl_uv((0, 0, 0), 1.6, 1.6), decimate=0.25)
    V = verts3(ob)
    wh = smoothstep(2.82, 3.10, V[:, 1])  # the hood follows the head, the drape the chest
    skinned('hat_cowl', ob, {'head': wh, 'chest': 1 - wh}, 'hat', 'cowl')
    # culion (the 040 poster): a soft rounded cap over the head and a veil of the same wool that falls from it at the
    # sides and the back onto the shoulders. Open in front (it frames the face, never wraps under the chin), and wide
    # at the jaw so a beard flows in front of it and never pokes through.
    # the brim sits on the forehead above the brows in front (y 3.80) and lower at the back (y 3.35)
    brim = lambda P: (3.80 - 0.45 * smoothstep(0.1, 0.9, (1 - P[:, 2] / np.maximum(1e-6, np.hypot(P[:, 0], P[:, 2]))) / 2)) - P[:, 1]
    capf = sdf.inter(sdf.superellipsoid((0, 3.80, -0.04), (0.66, 0.50, 0.66), 2.4), brim, 0.05)
    capf = sdf.sunion(0.06, capf, sdf.ellipsoid((0, 4.08, -0.08), (0.56, 0.22, 0.56)))
    capf = lambda P, f=capf: f(P) - 0.012 * np.cos(np.arctan2(P[:, 0], P[:, 2]) * 11) * smoothstep(3.4, 3.9, P[:, 1])
    ob = sdf_part('hat_culion', capf, (-0.9, 3.1, -0.9), (0.9, 4.4, 0.9), 0.014, M['hat'], uvfn=cyl_uv((0, 0, 0), 1.6, 1.6), decimate=0.25)
    rigid('hat_culion', ob, 'head', 'hat', 'culion')
    secs = [  # y, half width, half depth, half angle from the back (pi = front), z offset
        (3.72, 0.69, 0.69, 2.00, -0.04), (3.45, 0.74, 0.71, 1.90, -0.05), (3.15, 0.82, 0.72, 1.80, -0.07), (2.90, 0.90, 0.70, 1.72, -0.09),
        (2.65, 0.98, 0.65, 1.66, -0.11), (2.42, 1.04, 0.62, 1.62, -0.13)]
    rings = []
    for k in np.linspace(0, 1, 24):
        i = min(len(secs) - 2, int(k * (len(secs) - 1))); u = k * (len(secs) - 1) - i
        row = [secs[i][j] + (secs[i + 1][j] - secs[i][j]) * u for j in range(5)]
        rings.append(arc_ring(row[0], row[1], row[2], row[3], 64, 2.0, row[4]))
    def veil_folds(V):
        ang = np.arctan2(V[:, 0], -V[:, 2])
        r = 0.05 * np.cos(ang * 7) * smoothstep(3.5, 2.6, V[:, 1])
        d = np.stack([np.sin(ang), np.zeros(len(V)), -np.cos(ang)], -1)
        return d * r[:, None]
    ob = open_loft('hat_culion_veil', rings, M['hat'], 0.05, veil_folds, uscale=3.0, vscale=1.5)
    V = verts3(ob)
    wh = smoothstep(2.75, 3.15, V[:, 1])   # the top follows the head, the lower veil the chest / shoulders
    import rigkit as rk
    limbs = []
    for s_ in 'LR':   # where the veil lies on the shoulders it follows the arm (a raised arm lifts it, never cuts it)
        m_ = (lambda p: p) if s_ == 'L' else rk.mirror_x
        limbs += [(f'uparm_{s_}', m_(J['shoulder']), m_(J['elbow']), 0.50, 0.95, 1.0), (f'clav_{s_}', m_(J['clav']), m_(J['shoulder']), 0.25, 0.55, 0.5)]
    Wv = rk.garment(V, {'head': wh, 'chest': 1 - wh}, limbs, where=1 - wh)
    skinned('hat_culion_veil', ob, Wv, 'hat', 'culion')

    # openhood: the same hood pushed back (the 040 poster): a wider, higher face opening with a thick rolled rim, so the
    # forehead, the brows and the cheeks stay in the light
    fo2 = (0, 3.50, 0.62); fr = (0.585, 0.64, 0.50)
    hood2 = sdf.ssub(0.05, outer, sdf.ellipsoid(fo2, fr))
    hood2 = sdf.ssub(0.02, hood2, sdf.head_shape(0.012))
    rim2 = sdf.inter(sdf.ellipsoid(fo2, (fr[0] + 0.07, fr[1] + 0.07, fr[2] + 0.07)), lambda P: -sdf.ellipsoid(fo2, (fr[0] - 0.02, fr[1] - 0.02, fr[2] - 0.02))(P))
    rim2 = sdf.inter(rim2, sdf.head_shape(0.13), 0.02)
    hood2 = sdf.sunion(0.04, hood2, rim2)
    hood2 = sdf.inter(hood2, lambda P: 2.33 - P[:, 1], 0.03)
    ob = sdf_part('hat_openhood', lambda P: hood2(P) - fo(P), (-0.9, 2.2, -0.8), (0.9, 4.2, 0.95), 0.014, M['hat'], uvfn=cyl_uv((0, 0, 0), 1.6, 1.6), decimate=0.25)
    V = verts3(ob)
    wh = smoothstep(2.82, 3.10, V[:, 1])
    skinned('hat_openhood', ob, {'head': wh, 'chest': 1 - wh}, 'hat', 'openhood')


def tube_mesh(name, pts, radii, mat, sides=20, stitch=0.075, rows=20, cols=16, closed=False):
    """A soft roll of knitting along a smooth path: the stitch columns run along the roll (u across the stitches
    = along the path, v = around the roll), so the knit of a rolled brim / collar runs round it as on a real hood."""
    P = np.asarray(pts, float); R = np.asarray(radii, float)
    n = len(P)
    T = np.gradient(P, axis=0)
    if closed:
        T = np.roll(P, -1, 0) - np.roll(P, 1, 0)
    T /= np.linalg.norm(T, axis=1)[:, None]
    ref = np.array([0.0, 0.0, 1.0])
    N = ref - T * (T @ ref)[:, None]
    bad = np.linalg.norm(N, axis=1) < 1e-3
    N[bad] = np.cross(T[bad], [1.0, 0, 0])
    N /= np.linalg.norm(N, axis=1)[:, None]
    B = np.cross(T, N)
    L = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))])
    V, UV, F = [], [], []
    for i in range(n):
        for j in range(sides + 1):
            a = 2 * math.pi * j / sides
            V.append(P[i] + R[i] * (math.cos(a) * N[i] + math.sin(a) * B[i]))
            UV.append((L[i] / (stitch * cols), (2 * math.pi * R[i] * j / sides) / (stitch * 1.15 * rows)))
    for i in range(n - 1):
        for j in range(sides):
            a = i * (sides + 1) + j
            F.append((a, a + 1, a + sides + 2, a + sides + 1))
    return bl.mesh_object(name, np.array(V), F, uvs=np.array(UV), mat=mat)


def yarnhood_parts(M, skinned):
    """yarnhood: the yarn elder's big hand-knitted hood (look `head: "yarn"`, the picture of `_short-002-pacea`): a soft
    hood that hugs the face, with a fat rolled brim round the brows, the eyes and the cheeks; its crown rises like a
    stocking cap and slumps back in soft folds; a thick knitted collar round the neck under the beard and a heavy
    knitted cape over the shoulders and the upper arms, open in front (the tunic and the beard show)."""
    import rigkit as rk
    HC = 3.45
    # ---- the shell: the head grown into a soft round hood + the slouching crown + the sides falling to the shoulders
    # a soft egg round the head (it narrows toward the top), the crown slumping back and toward his left
    shell = sdf.superellipsoid((0, 3.52, -0.08), (0.78, 0.77, 0.80), 2.4)
    crown = sdf.sunion(0.18, sdf.ellipsoid((-0.06, 4.00, -0.32), (0.47, 0.33, 0.46)), sdf.ellipsoid((-0.22, 3.98, -0.66), (0.32, 0.27, 0.32)),
                       sdf.ellipsoid((-0.36, 3.78, -0.86), (0.22, 0.22, 0.22)))   # the tip slumps back and toward his right, and down
    sides = sdf.ellipsoid((0, 2.94, -0.10), (0.84, 0.48, 0.68))
    outer = sdf.sunion(0.20, shell, crown, sides)
    # the opening: an upright ellipse in front of the face, cut back to just in front of the face's surface
    ex, ey, ecy = 0.55, 0.64, 3.27

    def zbrim(x):
        return np.sqrt(np.maximum(0.62 ** 2 - x * x, 0.03)) + 0.01

    def zcut(x):   # cut a little behind the brim: no sliver of the shell may stay in front of the face
        return np.sqrt(np.maximum(0.58 ** 2 - x * x, 0.02)) - 0.12

    def opening(P):   # an inverted U: round over the brows, straight down the cheeks, open under the chin
        e = np.where(P[:, 1] > ecy, (np.sqrt((P[:, 0] / ex) ** 2 + ((P[:, 1] - ecy) / ey) ** 2) - 1) * 0.5, (np.abs(P[:, 0]) / ex - 1) * 0.5)
        return np.maximum(e, zcut(P[:, 0]) - P[:, 2])
    hood = sdf.ssub(0.04, outer, opening)
    # the front of the shell stays behind the brim roll (one rim, not a second shell bulging round it)
    def front_cut(P):   # only round the opening (a plane cut further out sliced the side of the hood)
        e = np.where(P[:, 1] > ecy, np.sqrt((P[:, 0] / (ex + 0.16)) ** 2 + ((P[:, 1] - ecy) / (ey + 0.04)) ** 2) - 1, np.abs(P[:, 0]) / (ex + 0.16) - 1)
        return P[:, 2] - zbrim(P[:, 0]) + 0.01 - 3 * np.maximum(e, 0)
    hood = sdf.inter(hood, front_cut, 0.06)
    hood = sdf.ssub(0.02, hood, sdf.head_shape(0.03))
    hood = sdf.inter(hood, lambda P: 2.64 - P[:, 1], 0.04)
    ang = lambda P: np.arctan2(P[:, 0], -P[:, 2])
    # soft folds: rings round the slumping crown, a few long creases down the sides
    def folds(P):
        cr = smoothstep(3.85, 4.15, P[:, 1])
        return (0.011 * np.cos(P[:, 1] * 22 + 14 * P[:, 2]) * cr
                + 0.03 * np.cos(ang(P) * 2 + 9 * P[:, 1] + 3 * P[:, 0]) * smoothstep(3.7, 4.0, P[:, 1])   # a big diagonal sag fold on the crown
                + 0.014 * np.cos(ang(P) * 7 + 2.5 * P[:, 1]) * smoothstep(3.9, 3.2, P[:, 1])
                + 0.010 * np.cos(ang(P) * 3 - 4 * P[:, 1]) * smoothstep(3.5, 4.2, P[:, 1]))
    ob = sdf_part('hat_yarnhood', lambda P: hood(P) - folds(P), (-1.0, 2.55, -1.15), (1.0, 4.85, 1.0), 0.013, M['knit'],
                  uvfn=back_uv((-0.2, 0, -0.62), 0.9, 3.7), decimate=0.3)
    V = verts3(ob)
    wh = smoothstep(2.80, 3.15, V[:, 1])
    skinned('hat_yarnhood', ob, {'head': wh, 'chest': 1 - wh}, 'hat', 'yarnhood')
    # ---- the fat rolled brim round the opening (hugs the face: just in front of its edge)
    # the hood's soft turned edge: over the brows and straight down the cheeks behind the beard (an inverted U)
    phis = np.linspace(-math.pi / 2, math.pi / 2, 48)
    side = np.linspace(2.84, ecy, 14)[:-1]
    bx = np.concatenate([np.full(len(side), -(ex + 0.03)), (ex + 0.03) * np.sin(phis), np.full(len(side), ex + 0.03)])
    by = np.concatenate([side, ecy + (ey + 0.02) * np.cos(phis), side[::-1]])
    k = np.arange(len(bx))
    bz = zbrim(bx) - 0.03 + 0.012 * np.sin(k * 0.7) - 0.12 * smoothstep(ecy, 2.84, by)   # it goes back a little as it falls
    rad = 0.09 + 0.014 * np.sin(k * 0.45 + 1) + 0.012 * smoothstep(3.6, 3.1, by)
    ob = tube_mesh('hat_yarnhood_brim', np.stack([bx, by, bz], -1), rad, M['knit'], sides=16, stitch=0.06)
    skinned('hat_yarnhood_brim', ob, {'head': np.ones(len(verts3(ob)))}, 'hat', 'yarnhood')
    # ---- the collar: a thick knitted roll round the neck, under the beard
    cphi = np.linspace(0, 2 * math.pi, 73)
    cx = 0.60 * np.sin(cphi); cz = -0.04 - 0.52 * np.cos(cphi)
    cy = 2.84 + 0.05 * np.cos(cphi) + 0.02 * np.sin(5 * cphi)
    ob = tube_mesh('hat_yarnhood_collar', np.stack([cx, cy, cz], -1), 0.15 + 0.02 * np.sin(3 * cphi + 1), M['knit'], sides=18, closed=True, stitch=0.06)
    skinned('hat_yarnhood_collar', ob, {'chest': np.ones(len(verts3(ob)))}, 'hat', 'yarnhood')
    # ---- the mantle: heavy woven wool over the shoulders and the upper arms, thick soft folds; its front edges run
    # from the sides of the beard diagonally down and out, so the tunic shows under the beard
    secs = [  # y, half width, half depth, half angle from the back (pi = front), z offset
        (2.95, 0.64, 0.56, 2.72, -0.06), (2.80, 0.88, 0.63, 2.60, -0.06), (2.60, 1.04, 0.68, 2.40, -0.07),
        (2.35, 1.11, 0.70, 2.18, -0.08), (2.05, 1.13, 0.72, 2.04, -0.09), (1.75, 1.14, 0.73, 1.96, -0.10), (1.50, 1.14, 0.74, 1.92, -0.10)]
    rings = []
    for k in np.linspace(0, 1, 34):
        i = min(len(secs) - 2, int(k * (len(secs) - 1))); u = k * (len(secs) - 1) - i
        row = [secs[i][j] + (secs[i + 1][j] - secs[i][j]) * u for j in range(5)]
        r = arc_ring(row[0], row[1], row[2], row[3], 120, 2.0, row[4])
        # long at the back, short over the arms: from the sides forward it is a capelet ending above the elbow, so the
        # sleeves show (the hem rises smoothly from the back to the front edges)
        a = np.abs(np.linspace(-row[3], row[3], len(r)))
        lift = 0.0 * a
        r[:, 1] += lift
        rings.append(r)

    def cape_folds(V):
        a = np.arctan2(V[:, 0], -V[:, 2])
        fold = 0.075 * np.cos(a * 12 + 0.3) + 0.025 * np.cos(a * 5 + 1)
        r = fold * smoothstep(2.6, 2.0, V[:, 1])
        d = np.stack([np.sin(a), np.zeros(len(V)), -np.cos(a)], -1)
        out = d * r[:, None]
        out[:, 1] -= (0.06 * np.maximum(0, np.cos(a * 12 + 0.3)) + 0.03 * np.sin(a * 5 + 2) ** 2) * smoothstep(1.75, 1.5, V[:, 1])   # an uneven hem
        return out
    ob = open_loft('hat_yarnhood_cape', rings, M['cloak'], 0.12, cape_folds, uscale=1.5, vscale=0.45)
    V = verts3(ob)

    def mantle_w(V):
        body = rk.bands(V, [('spine', 0, 0), ('chest', 1.9, 2.3)])
        limbs = []
        for s_ in 'LR':   # where the mantle lies over the arm it follows it (a raised arm lifts it, never cuts through)
            m_ = (lambda p: p) if s_ == 'L' else rk.mirror_x
            limbs += [(f'uparm_{s_}', m_(J['shoulder']), m_(J['elbow']), 0.42, 0.66, 1.0), (f'clav_{s_}', m_(J['clav']), m_(J['shoulder']), 0.25, 0.55, 0.5)]
        return rk.garment(V, body, limbs, where=smoothstep(-0.38, -0.02, V[:, 2]))   # the back panel stays on the back (it flared out like a wing behind a raised arm)
    skinned('hat_yarnhood_cape', ob, mantle_w(V), 'hat', 'yarnhood')
    # rounded edges: a soft roll along both front edges and the hem (no paper-thin edge)
    R0 = np.array([r[0] for r in rings]); R1 = np.array([r[-1] for r in rings])
    hem = rings[-1]
    D = cape_folds
    edge = hem.copy()
    edge = edge + D(edge)
    ea = np.arctan2(edge[:, 0], -edge[:, 2])
    edge = edge - 0.06 * np.stack([np.sin(ea), np.zeros(len(edge)), -np.cos(ea)], -1)   # centred in the thickness
    ob = tube_mesh('hat_yarnhood_edge', edge, np.full(len(edge), 0.065), M['cloak'], sides=10, stitch=0.2)
    skinned('hat_yarnhood_edge', ob, mantle_w(verts3(ob)), 'hat', 'yarnhood')


def arc_ring(y, hw, hd, half_angle, N, n=2.4, zoff=0.0):
    """Partial superellipse ring around the body: from the back (angle 0) to +-half_angle (pi = front centre)."""
    out = []
    for i in range(N + 1):
        a = -half_angle + 2 * half_angle * i / N
        s, c = math.sin(a), -math.cos(a)
        se = math.copysign(abs(s) ** (2 / n), s); ce = math.copysign(abs(c) ** (2 / n), c)
        out.append((hw * se, y, hd * ce + zoff))
    return np.array(out)


def open_loft(name, rings, mat, thickness, disp=None, uscale=2.0, vscale=1.0):
    R = len(rings); M1 = len(rings[0])
    V = np.concatenate(rings)
    if disp is not None:
        V = V + disp(V)
    uv = []
    acc = 0
    for j in range(R):
        if j:
            acc += np.linalg.norm(rings[j][M1 // 2] - rings[j - 1][M1 // 2])
        for i in range(M1):
            uv.append((i / (M1 - 1) * uscale, -acc * vscale))
    F = []
    for j in range(R - 1):
        for i in range(M1 - 1):
            a = j * M1 + i
            F.append((a, a + M1, a + M1 + 1, a + 1))
    ob = bl.mesh_object(name, V, F, uvs=np.array(uv), mat=mat)
    # outward normals (away from the vertical axis)
    me = ob.data
    n0 = me.polygons[len(F) // 2].normal; c0 = me.polygons[len(F) // 2].center
    if n0.x * c0.x + n0.y * c0.y < 0:
        for p in me.polygons:
            p.flip()
    sol = ob.modifiers.new('sol', 'SOLIDIFY'); sol.thickness = thickness; sol.offset = -1.0; sol.use_even_offset = True
    dg = bpy.context.evaluated_depsgraph_get()
    me2 = bpy.data.meshes.new_from_object(ob.evaluated_get(dg)); ob.modifiers.remove(sol)
    old = ob.data; ob.data = me2; bpy.data.meshes.remove(old); me2.name = name; me2.shade_smooth()
    return ob


def cloak_parts(M, skinned):
    """mantle: the long monastic cloak over the shoulders, back and sides (arms come out in front);
    fleece: a shaggy sheepskin capelet over the shoulders and upper arms, open at the chest."""
    secs = [  # y, half width, half depth, half angle (from the back), z offset
        (2.90, 0.27, 0.24, 2.95, -0.01), (2.85, 0.48, 0.34, 2.75, -0.02), (2.78, 0.74, 0.43, 2.45, -0.03), (2.66, 0.93, 0.50, 2.15, -0.04),
        (2.45, 1.00, 0.54, 1.72, -0.05), (2.15, 1.02, 0.57, 1.58, -0.06), (1.75, 1.03, 0.60, 1.52, -0.07), (1.30, 1.05, 0.64, 1.50, -0.08),
        (0.85, 1.07, 0.68, 1.50, -0.09), (0.45, 1.09, 0.72, 1.50, -0.10), (0.20, 1.10, 0.74, 1.50, -0.11)]
    ys = np.linspace(0, 1, 34)
    rings = []
    for k in ys:
        i = min(len(secs) - 2, int(k * (len(secs) - 1))); u = k * (len(secs) - 1) - i
        row = [secs[i][j] + (secs[i + 1][j] - secs[i][j]) * u for j in range(5)]
        rings.append(arc_ring(row[0], row[1], row[2], row[3], 72, 2.3, row[4]))

    def drape(V):
        ang = np.arctan2(V[:, 0], -V[:, 2])
        amp = 0.035 * smoothstep(2.5, 0.8, V[:, 1])
        r = amp * np.cos(ang * 7)
        d = np.stack([np.sin(ang), np.zeros(len(V)), -np.cos(ang)], -1)
        return d * r[:, None]
    ob = open_loft('cloak_mantle', rings, M['cloak'], 0.035, drape, uscale=4.0, vscale=1.0)
    skinned('cloak_mantle', ob, cloak_weights(verts3(ob)), 'cloak', 'mantle')

    secs = [(2.92, 0.27, 0.25, 2.95, 0.0), (2.86, 0.52, 0.38, 2.80, -0.01), (2.76, 0.80, 0.48, 2.65, -0.01), (2.60, 0.98, 0.56, 2.55, -0.02),
            (2.35, 1.05, 0.60, 2.50, -0.02), (2.10, 1.08, 0.62, 2.45, -0.02), (1.98, 1.09, 0.63, 2.42, -0.02)]
    rings = []
    for k in np.linspace(0, 1, 22):
        i = min(len(secs) - 2, int(k * (len(secs) - 1))); u = k * (len(secs) - 1) - i
        row = [secs[i][j] + (secs[i + 1][j] - secs[i][j]) * u for j in range(5)]
        r = arc_ring(row[0], row[1], row[2], row[3], 110, 2.2, row[4])
        rings.append(r)
    # ragged hem: lower the last rows irregularly (deterministic)
    def shag(V):
        n = sdf.fbm(V, 7.0, 3, 41)
        ang = np.arctan2(V[:, 0], -V[:, 2])
        out = np.stack([np.sin(ang), np.zeros(len(V)), -np.cos(ang)], -1) * (0.035 * n + 0.012 * np.cos(ang * 23))[:, None]
        hem = smoothstep(2.3, 1.98, V[:, 1]) * (0.06 * np.maximum(0, np.cos(ang * 13 + 0.5)) + 0.04 * sdf.fbm(V, 15.0, 2, 3))
        out[:, 1] -= hem
        return out
    ob = open_loft('cloak_fleece', rings, M['fur'], 0.06, shag, uscale=3.0, vscale=2.5)
    skinned('cloak_fleece', ob, cloak_weights(verts3(ob), cape=True), 'cloak', 'fleece')


def cloak_weights(V, cape=False):
    """Garment recipe (blender/common/rigkit.py): the cloth that lies over an arm FOLLOWS that arm, so a raised or bent
    arm lifts it instead of coming out through it; the rest hangs from the body by height."""
    import rigkit as rk
    y = V[:, 1]
    body = rk.bands(V, [('pelvis', 0, 0), ('spine', 1.35, 1.85), ('chest', 1.9, 2.4)])
    # the hem of a long cloak sways a little with the legs
    legs = smoothstep(1.3, 0.3, y) * 0.5
    sideL = smoothstep(-0.5, 0.5, V[:, 0])
    body['thigh_L'] = body['pelvis'] * legs * sideL
    body['thigh_R'] = body['pelvis'] * legs * (1 - sideL)
    body['pelvis'] = body['pelvis'] * (1 - legs)
    limbs = []
    for s in 'LR':
        m = (lambda p: p) if s == 'L' else rk.mirror_x
        sh, el, wr, cl = m(J['shoulder']), m(J['elbow']), m(J['wrist']), m(J['clav'])
        if cape:    # short capelet: lies on the shoulders and the upper arms
            limbs += [(f'uparm_{s}', sh, el, 0.50, 0.95, 1.0), (f'clav_{s}', cl, sh, 0.25, 0.55, 0.5)]
        else:       # long mantle: hangs behind the arms; the arm it touches pushes it
            limbs += [(f'uparm_{s}', sh, el, 0.40, 0.74, 1.0), (f'forearm_{s}', el, wr, 0.36, 0.60, 1.0), (f'clav_{s}', cl, sh, 0.25, 0.52, 0.55)]
    W = rk.garment(V, body, limbs)
    for msg in rk.report('cloak', W):
        print('  rig:', msg)
    return W
