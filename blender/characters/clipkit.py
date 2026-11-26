"""Clip authoring kit: keyframed IK targets + FK channels -> Blender IK / Copy Rotation constraints -> baked FK keys.

A clip is written as KEYS on CHANNELS (all in THREE.js body coordinates, degrees, the figure faces +Z, its left is +X):
  * FK:  hips (pelvis offset x,y,z), pelvis / spine / chest / neck / head (pitch, yaw, roll) — pitch + = bend forward,
         yaw + = turn to the figure's left, roll + = tilt to the figure's right. `torso` and `look` split over 2 bones.
  * hands: per side a target {pos, space: root|pelvis|chest|head, eff: wrist|palm|tips|grip|pinch, fd: finger direction,
         pn: palm normal, pole: elbow direction} — positions are given AS IF the figure stood in its rest pose; the space
         bone carries them (a hand on the forehead stays there when the head nods).
  * feet: per side {pos (ankle), pitch (toe up +), yaw}; root space. Unkeyed = planted at rest.
  * fingers: per side a named pose (relaxed, open, fist, grip, cross, point, pray, cup) blended between keys.
Channels are interpolated with clamped Catmull-Rom (Hermite) curves: eased starts/stops, smooth passes through
via-keys, no linear robot moves. Breathing is layered on every clip. Each frame is solved by Blender (IK with poles,
joint limits) and read back as local FK, so the GLB carries plain baked keys.
"""
import math
import numpy as np
import bpy
from mathutils import Matrix, Vector, Quaternion
from bpy_extras import anim_utils

import bl
import monk_model as mm

FPS = 30
DEG = math.pi / 180


# ------------------------------------------------------------------ math helpers (three coords)
def q_axis(axis, ang):
    """quaternion (blender) for a rotation about a THREE-coords axis."""
    return Quaternion(bl.T(axis).normalized(), ang)


def q_euler(p, y, r):
    """three-space intrinsic yaw (Y) -> pitch (X) -> roll (Z), degrees -> blender quaternion."""
    return q_axis((0, 1, 0), y * DEG) @ q_axis((1, 0, 0), p * DEG) @ q_axis((0, 0, 1), r * DEG)


def hermite(keys, t):
    """keys: sorted list of (time, np.array value). Clamped Catmull-Rom; flat tangents at the ends and extremes."""
    if not keys:
        return None
    if t <= keys[0][0]:
        return keys[0][1].copy()
    if t >= keys[-1][0]:
        return keys[-1][1].copy()
    i = 0
    while keys[i + 1][0] < t:
        i += 1
    (t0, v0), (t1, v1) = keys[i][:2], keys[i + 1][:2]
    h = t1 - t0
    s = (t - t0) / h

    def tangent(j):
        if j == 0 or j == len(keys) - 1:
            return np.zeros_like(keys[j][1])
        (ta, va), (tb, vb), (tc, vc) = keys[j - 1][:2], keys[j][:2], keys[j + 1][:2]
        m = (vc - va) / (tc - ta)
        # clamp: no overshoot where the curve turns (per component)
        d1 = vb - va; d2 = vc - vb
        m = np.where(d1 * d2 <= 0, 0.0, m)
        return m * keys[j][2] if len(keys[j]) > 2 else m
    m0 = tangent(i) * h; m1 = tangent(i + 1) * h
    s2, s3 = s * s, s * s * s
    return (2 * s3 - 3 * s2 + 1) * v0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * v1 + (s3 - s2) * m1


def ease(s):
    s = min(1.0, max(0.0, s))
    return s * s * (3 - 2 * s)


# ------------------------------------------------------------------ finger poses (curl1, curl2) per finger + thumb (curl1, curl2, opposition)
FINGER_POSES = {
    'relaxed': {'index': (14, 18), 'middle': (20, 22), 'ring': (26, 24), 'pinky': (32, 26), 'thumb': (8, 12, 12)},
    'open': {'index': (2, 2), 'middle': (2, 2), 'ring': (3, 2), 'pinky': (4, 3), 'thumb': (-5, 0, -8), 'spread': 4},
    'fist': {'index': (88, 95), 'middle': (90, 95), 'ring': (92, 95), 'pinky': (94, 95), 'thumb': (25, 45, 45)},
    'grip': {'index': (62, 70), 'middle': (66, 70), 'ring': (70, 72), 'pinky': (74, 72), 'thumb': (18, 30, 50)},
    'cross': {'index': (47, 50), 'middle': (56, 48), 'ring': (104, 108), 'pinky': (106, 108), 'thumb': (66, 5, 148), 'join': 12},
    # the Orthodox blessing (the letters IC XC): index straight (I), middle finger a little bent (C), the thumb crossed over
    # the bent ring finger (X), the little finger bent (C)
    'bless': {'index': (2, 3), 'middle': (40, 52), 'ring': (80, 86), 'pinky': (58, 66), 'thumb': (54, 22, 134)},
    'point': {'index': (0, 0), 'middle': (85, 95), 'ring': (90, 95), 'pinky': (92, 95), 'thumb': (25, 35, 45)},
    'pray': {'index': (4, 4), 'middle': (4, 4), 'ring': (5, 4), 'pinky': (6, 4), 'thumb': (-2, 2, 4)},
    'cup': {'index': (30, 30), 'middle': (32, 30), 'ring': (34, 30), 'pinky': (36, 30), 'thumb': (15, 18, 30)},
}
FINGERS = ['index', 'middle', 'ring', 'pinky']


def mix_fingers(a, b, k):
    out = {}
    A, B = FINGER_POSES[a], FINGER_POSES[b]
    for f in FINGERS + ['thumb']:
        out[f] = tuple((1 - k) * x + k * y for x, y in zip(A[f], B[f]))
    for extra in ('spread', 'join'):
        out[extra] = (1 - k) * A.get(extra, 0) + k * B.get(extra, 0)
    return out


# ------------------------------------------------------------------ the clip spec
class Clip:
    def __init__(self, name, dur, loop=False, hold=None, events=None, layer='full', breathe=1.0, notes='', partner=None, base='stand'):
        self.name, self.dur, self.loop, self.hold, self.events = name, dur, loop, hold, dict(events or {})
        self.layer, self.breathe, self.notes, self.partner, self.base = layer, breathe, notes, partner, base
        self.fk = {}        # channel -> [(t, value, tension)]
        self.hands = {'L': [], 'R': []}
        self.feet = {'L': [], 'R': []}
        self.fingers = {'L': [], 'R': []}
        self.post = None    # optional callable(t, chan dict) for procedural extras

    # FK
    def k(self, chan, t, *v, tension=1.0):
        v = np.array(v[0] if len(v) == 1 and hasattr(v[0], '__len__') else v, float)
        self.fk.setdefault(chan, []).append((t, v, tension))
        return self

    def hand(self, side, t, pos, space='chest', eff='wrist', fd=None, pn=None, pole=None, tension=1.0):
        self.hands[side].append(dict(t=t, pos=np.array(pos, float), space=space, eff=eff, fd=fd, pn=pn, pole=pole, tension=tension))
        return self

    def both(self, t, pos, **kw):
        """symmetric hands: pos / fd / pn / pole given for the LEFT hand (+X), mirrored for the right."""
        m = lambda v: None if v is None else (-v[0], v[1], v[2])
        self.hand('L', t, pos, **kw)
        kw2 = dict(kw)
        for key in ('fd', 'pn', 'pole'):
            if kw.get(key) is not None:
                kw2[key] = m(kw[key])
        self.hand('R', t, m(pos), **kw2)
        return self

    def foot(self, side, t, pos, pitch=0.0, yaw=0.0, tension=1.0):
        self.feet[side].append(dict(t=t, pos=np.array(pos, float), pitch=pitch, yaw=yaw, tension=tension))
        return self

    def fing(self, side, t, pose):
        for s in (('L', 'R') if side == 'both' else (side,)):
            self.fingers[s].append((t, pose))
        return self

    def mirrored(self, name):
        """the same clip done with the other hand (x mirrored, left <-> right)."""
        import copy
        c = Clip(name, self.dur, self.loop, self.hold, self.events, self.layer, self.breathe, (self.notes + ' (mirrored)').strip(), self.partner, self.base)
        mv = lambda v: None if v is None else (-v[0], v[1], v[2])
        sw = lambda n: n[:-1] + ('R' if n.endswith('L') else 'L') if n.endswith(('_L', '_R')) else n
        for ch, keys in self.fk.items():
            out = []
            for k in keys:
                v = k[1].copy()
                if ch == 'hips':
                    v[0] = -v[0]
                else:
                    v[1] = -v[1]; v[2] = -v[2]
                out.append((k[0], v, k[2]))
            c.fk[sw(ch)] = out
        for s, o in (('L', 'R'), ('R', 'L')):
            c.hands[o] = [dict(k, pos=np.array(mv(k['pos'])), fd=mv(k['fd']), pn=mv(k['pn']), pole=mv(k['pole'])) for k in self.hands[s]]
            c.feet[o] = [dict(k, pos=np.array(mv(k['pos'])), yaw=-k['yaw']) for k in self.feet[s]]
            c.fingers[o] = list(self.fingers[s])
        c.beard = self.name.endswith('_beard')
        return c

    def meta(self):
        m = {'duration': round(self.dur, 4), 'loop': self.loop, 'layer': self.layer}
        if self.hold:
            m['hold'] = [round(self.hold[0], 3), round(self.hold[1], 3)]
        if self.events:
            m['events'] = {k: round(v, 3) for k, v in self.events.items()}
        if self.partner:
            m['partner'] = self.partner
        if self.notes:
            m['notes'] = self.notes
        if self.base != 'stand':
            m['base'] = self.base
        return m


# default relaxed standing pose (rest of every channel)
REST_HAND = {
    'L': dict(pos=(0.88, 1.38, 0.12), space='pelvis', eff='wrist', fd=(0.08, -1, 0.10), pn=(-1, 0, 0.25), pole=(0.5, 0, -1)),
    'R': dict(pos=(-0.88, 1.38, 0.12), space='pelvis', eff='wrist', fd=(-0.08, -1, 0.10), pn=(1, 0, 0.25), pole=(-0.5, 0, -1)),
}
REST_FOOT = {'L': dict(pos=(0.30, 0.13, 0.0), pitch=0, yaw=4), 'R': dict(pos=(-0.30, 0.13, 0.0), pitch=0, yaw=-4)}


# ------------------------------------------------------------------ the solver rig (constraints, targets)
class Solver:
    def __init__(self, rig):
        self.rig = rig
        self.pb = rig.pose.bones
        self.rest = {b.name: b.matrix_local.copy() for b in rig.data.bones}  # armature space rest (blender)
        self.tg = {}
        for s in 'LR':
            h = bl.empty(f'ik_hand_{s}'); p = bl.empty(f'pole_arm_{s}')
            f = bl.empty(f'ik_foot_{s}'); kp = bl.empty(f'pole_leg_{s}')
            self.tg[s] = dict(hand=h, pole=p, foot=f, kpole=kp)
            c = self.pb[f'forearm_{s}'].constraints.new('IK'); c.target = h; c.pole_target = p; c.chain_count = 2; c.use_stretch = False
            c.pole_angle = 0
            r = self.pb[f'hand_{s}'].constraints.new('COPY_ROTATION'); r.target = h
            c2 = self.pb[f'shin_{s}'].constraints.new('IK'); c2.target = f; c2.pole_target = kp; c2.chain_count = 2; c2.use_stretch = False
            r2 = self.pb[f'foot_{s}'].constraints.new('COPY_ROTATION'); r2.target = f
            for bn in (f'forearm_{s}', f'shin_{s}', f'uparm_{s}', f'thigh_{s}'):
                self.pb[bn].ik_stretch = 0.0
        self.calibrate_poles()
        self.measure_effectors()

    # -- the pole angle that makes the elbow / knee point at the pole target
    def calibrate_poles(self):
        sc = bpy.context.scene
        for s in 'LR':
            for chain, upper, lower, tgt, pole in (('arm', f'uparm_{s}', f'forearm_{s}', 'hand', 'pole'), ('leg', f'thigh_{s}', f'shin_{s}', 'foot', 'kpole')):
                con = self.pb[lower].constraints[0]
                a = self.rest[upper].translation; c = self.rest[lower].translation + (self.rest[lower].to_3x3() @ Vector((0, self.rig.data.bones[lower].length, 0)))
                mid = (a + c) / 2
                self.tg[s][tgt].matrix_world = Matrix.Translation(a + (c - a) * 0.85)
                side_dir = Vector((0.8, 0, 0)) if (s == 'L') == (chain == 'arm') else Vector((-0.8, 0, 0))
                pole_dir = (Vector((0.3 if s == 'L' else -0.3, 1.0, 0)) if chain == 'arm' else Vector((0, -1.0, 0)))  # blender: +Y = back, -Y = front
                self.tg[s][pole].matrix_world = Matrix.Translation(mid + pole_dir)
                best = None
                for ang in range(-180, 180, 5):
                    con.pole_angle = ang * DEG
                    bpy.context.view_layer.update()
                    elbow = self.rig.matrix_world @ self.pb[lower].head
                    d = (elbow - mid).normalized()
                    score = d.dot(pole_dir.normalized())
                    if best is None or score > best[0]:
                        best = (score, ang)
                con.pole_angle = best[1] * DEG
        bpy.context.view_layer.update()

    def measure_effectors(self):
        """effector offsets (blender vectors in the hand bone's rest frame) for each finger pose."""
        self.eff = {}
        for s in 'LR':
            for pose in FINGER_POSES:
                self.set_fingers(s, mix_fingers(pose, pose, 0))
            # computed lazily in effector()
        self.set_fingers('L', mix_fingers('relaxed', 'relaxed', 0)); self.set_fingers('R', mix_fingers('relaxed', 'relaxed', 0))

    def hand_local_point(self, s, eff, fingers):
        """a contact point of the hand, in the hand bone's frame (blender vector), for the current finger pose."""
        hb = self.rig.data.bones[f'hand_{s}']
        W, d, f, p = mm.hand_frame(s)
        if eff == 'wrist':
            return Vector((0, 0, 0))
        if eff == 'palm':
            P = mm.hpt(s, 0.11, 0.0, 0.06)
        elif eff == 'grip':
            P = mm.hpt(s, 0.13, 0.02, 0.085)
        elif eff in ('tips', 'pinch', 'index', 'knuckles'):
            # posed finger tips: evaluate FK of the finger chain relative to the hand
            pts = []
            names = {'tips': ['index', 'middle', 'thumb'], 'pinch': ['index', 'thumb'], 'index': ['index'], 'knuckles': None}[eff]
            if names is None:
                P = mm.hpt(s, mm.KNUCKLE_U + 0.03, 0.0, -0.02)
            else:
                for n in names:
                    b2 = self.rig.data.bones[f'{n}2_{s}']
                    pts.append(self.finger_tip_rest_relative(s, n, fingers))
                v = sum(pts, Vector()) / len(pts)
                return v
        else:
            raise ValueError(eff)
        return hb.matrix_local.inverted() @ bl.T(P)

    def finger_tip_rest_relative(self, s, n, fingers):
        """tip of finger n (posed with `fingers`) in the hand bone's rest frame."""
        hb = self.rig.data.bones[f'hand_{s}']
        b1 = self.rig.data.bones[f'{n}1_{s}']; b2 = self.rig.data.bones[f'{n}2_{s}']
        q1, q2 = self.finger_quats(s, n, fingers)
        # rest chain: hand -> b1 -> b2 ; positions in armature rest, apply rotations about the joints
        H = hb.matrix_local
        M1 = b1.matrix_local @ q1.to_matrix().to_4x4()
        rel2 = b1.matrix_local.inverted() @ b2.matrix_local
        M2 = M1 @ rel2 @ q2.to_matrix().to_4x4()
        tip = M2 @ Vector((0, b2.length + 0.03 * mm.HS, 0))
        return H.inverted() @ tip

    def finger_quats(self, s, n, F):
        W, d, f, p = mm.hand_frame(s)
        curl_axis = np.cross(d, p); curl_axis /= np.linalg.norm(curl_axis)
        sgn = 1.0
        if n == 'thumb':
            c1, c2, opp = F['thumb']
            qa = q_axis(curl_axis, sgn * c1 * DEG) @ q_axis(d, (opp if s == 'R' else -opp) * DEG * 1.0)
            qb = q_axis(curl_axis, sgn * c2 * DEG)
        else:
            c1, c2 = F[n]
            spread = F.get('spread', 0) * {'index': 1, 'middle': 0.3, 'ring': -0.4, 'pinky': -1}[n]
            join = F.get('join', 0) * {'index': -1, 'middle': 1, 'ring': 0, 'pinky': 0}[n]
            side_axis = p if s == 'L' else -p
            qa = q_axis(curl_axis, sgn * c1 * DEG) @ q_axis(side_axis, (spread + join) * DEG)
            qb = q_axis(curl_axis, sgn * c2 * DEG)
        # convert armature-axis rotations into each bone's local frame
        b1 = self.rig.data.bones[f'{n}1_{s}']; b2 = self.rig.data.bones[f'{n}2_{s}']
        R1 = b1.matrix_local.to_quaternion(); R2 = b2.matrix_local.to_quaternion()
        return R1.inverted() @ qa @ R1, R2.inverted() @ qb @ R2

    def set_fingers(self, s, F):
        for n in FINGERS + ['thumb']:
            q1, q2 = self.finger_quats(s, n, F)
            self.pb[f'{n}1_{s}'].rotation_quaternion = q1
            self.pb[f'{n}2_{s}'].rotation_quaternion = q2

    def set_fk(self, bone, q_arm):
        R = self.rest[bone].to_quaternion()
        self.pb[bone].rotation_quaternion = R.inverted() @ q_arm @ R

    def space_matrix(self, space):
        """current armature-space matrix of a space bone, relative to its rest (maps rest-pose points to posed ones)."""
        if space == 'root':
            return Matrix.Identity(4)
        pb = self.pb[space]
        return pb.matrix @ self.rest[space].inverted()


# ------------------------------------------------------------------ baking
def frame_basis(fd, pn):
    """blender 3x3 matrix with Y = finger direction, Z = palm normal (three vectors in)."""
    y = bl.T(fd).normalized(); z = bl.T(pn)
    z = (z - y * z.dot(y)).normalized()
    x = y.cross(z)
    return Matrix((x, y, z)).transposed()


def channel_value(keys, t, default):
    if not keys:
        return np.array(default, float)
    ks = sorted(keys, key=lambda k: k[0])
    return hermite(ks, t)


def interp_targets(keys, t, default):
    """hand / foot target keys -> (index pair, eased k) for slerps, and Hermite positions per key space."""
    ks = sorted(keys, key=lambda k: k['t'])
    if not ks:
        return [(default, 1.0)]
    if t <= ks[0]['t']:
        return [(ks[0], 1.0)]
    if t >= ks[-1]['t']:
        return [(ks[-1], 1.0)]
    i = 0
    while ks[i + 1]['t'] < t:
        i += 1
    return ks, i


def bake(clip, solver, rig):
    sc = bpy.context.scene
    pb = solver.pb
    fps = 15 if (clip.loop and clip.dur > 3) else FPS   # slow loops: 15 keys/s is plenty (linear between)
    n = max(2, int(round(clip.dur * fps)) + 1)
    times = [min(clip.dur, f / fps) for f in range(n)]
    names = [b.name for b in rig.data.bones]
    recQ = {b: [] for b in names}
    recP = {'pelvis': []}
    clip.ik_err = 0.0
    for t in times:
        pose_frame(clip, solver, t)
        for side in 'LR':
            e = getattr(solver, 'last_target', {}).get(side)
            if e is not None:
                w = (rig.matrix_world @ pb[f'hand_{side}'].head)
                clip.ik_err = max(clip.ik_err, (w - e).length)
        for b in names:
            m = rig.convert_space(pose_bone=pb[b], matrix=pb[b].matrix, from_space='POSE', to_space='LOCAL')
            recQ[b].append(m.to_quaternion())
        recP['pelvis'].append(pb['pelvis'].location.copy())
    # write an action with one slot for the armature
    act = bpy.data.actions.new(clip.name)
    act.use_fake_user = True
    if hasattr(act, 'slots'):
        slot = act.slots.new(id_type='OBJECT', name=rig.name)
        curves = anim_utils.action_ensure_channelbag_for_slot(act, slot).fcurves
    else:
        curves = act.fcurves
    frames = np.array([t * FPS for t in times])
    for b in names:
        qs = recQ[b]
        # hemisphere continuity
        for i in range(1, len(qs)):
            if qs[i].dot(qs[i - 1]) < 0:
                qs[i] = -qs[i]
        if all(abs(q.dot(Quaternion())) > 0.99999 for q in qs) and b not in ('pelvis',):
            # identity all along: still key it once so the clip fully defines the pose when blended
            pass
        for i in range(4):
            fc = curves.new(f'pose.bones["{b}"].rotation_quaternion', index=i)
            vals = np.array([q[i] for q in qs])
            fc.keyframe_points.add(len(vals))
            co = np.stack([frames, vals], -1).ravel()
            fc.keyframe_points.foreach_set('co', co)
            fc.keyframe_points.foreach_set('interpolation', [1] * len(vals))  # LINEAR (dense keys)
            fc.update()
    for i in range(3):
        fc = curves.new('pose.bones["pelvis"].location', index=i)
        vals = np.array([p[i] for p in recP['pelvis']])
        fc.keyframe_points.add(len(vals))
        fc.keyframe_points.foreach_set('co', np.stack([frames, vals], -1).ravel())
        fc.keyframe_points.foreach_set('interpolation', [1] * len(vals))
        fc.update()
    return act


def pose_frame(clip, solver, t):
    """pose the solver rig at clip time t (FK channels, IK targets, fingers), then update."""
    pb = solver.pb
    for b in pb:
        b.rotation_quaternion = Quaternion(); b.location = Vector()
    C = lambda name, default: channel_value(clip.fk.get(name), t, default)
    period = clip.dur / max(1, round(clip.dur / 3.2)) if clip.loop else 3.2
    br = clip.breathe * math.sin(2 * math.pi * t / period)
    hips = C('hips', (0, 0, 0))
    pel = C('pelvis', (0, 0, 0)); spi = C('spine', (0, 0, 0)); che = C('chest', (0, 0, 0)); nec = C('neck', (0, 0, 0)); hea = C('head', (0, 0, 0))
    tor = C('torso', (0, 0, 0)); look = C('look', (0, 0, 0))
    spi = spi + tor * 0.45; che = che + tor * 0.55
    nec = nec + look * 0.35; hea = hea + look * 0.65
    che = che + np.array([-0.9 * br, 0, 0])  # breathing: chest lifts / settles
    hea = hea + np.array([0.5 * br, 0, 0])
    pb['pelvis'].location = (solver.rest['pelvis'].to_3x3().inverted() @ bl.T(hips))
    solver.set_fk('pelvis', q_euler(*pel))
    solver.set_fk('spine', q_euler(*spi))
    solver.set_fk('chest', q_euler(*che))
    solver.set_fk('neck', q_euler(*nec))
    solver.set_fk('head', q_euler(*hea))
    cl = {s: C(f'clav_{s}', (0, 0, 0)) for s in 'LR'}
    bpy.context.view_layer.update()
    crane_head(solver)
    # fingers
    fingers = {}
    for s in 'LR':
        ks = sorted(clip.fingers[s], key=lambda k: k[0])
        if not ks:
            F = mix_fingers('relaxed', 'relaxed', 0)
        elif t <= ks[0][0]:
            F = mix_fingers(ks[0][1], ks[0][1], 0)
        elif t >= ks[-1][0]:
            F = mix_fingers(ks[-1][1], ks[-1][1], 0)
        else:
            i = 0
            while ks[i + 1][0] < t:
                i += 1
            k = ease((t - ks[i][0]) / max(1e-6, ks[i + 1][0] - ks[i][0]))
            F = mix_fingers(ks[i][1], ks[i + 1][1], k)
        fingers[s] = F
        solver.set_fingers(s, F)
    # hands: hermite of positions evaluated in each key's space; orientation slerp
    for s in 'LR':
        tgt = hand_target(clip, solver, s, t, fingers[s])
        pos, rot, pole = tgt
        # automatic shoulder: lift the clavicle a little when the hand is high / forward
        sh = solver.rest[f'uparm_{s}'].translation
        lift = min(16.0, max(0.0, (pos.z - 2.25) * 14.0))
        prot = min(18.0, max(0.0, (-(pos.y - sh.y) - 0.25) * 28.0))
        sgn = 1 if s == 'L' else -1
        c = cl[s] + np.array([0, -sgn * prot, sgn * lift])
        solver.set_fk(f'clav_{s}', q_euler(*c))
        bpy.context.view_layer.update()
        h = solver.tg[s]['hand']
        if not hasattr(solver, 'last_target'):
            solver.last_target = {}
        solver.last_target[s] = pos.copy()
        M = rot.to_4x4(); M.translation = pos
        h.matrix_world = M
        solver.tg[s]['pole'].matrix_world = Matrix.Translation(pole)
    for s in 'LR':
        pos, rot, kpole = foot_target(clip, solver, s, t)
        M = rot.to_4x4(); M.translation = pos
        solver.tg[s]['foot'].matrix_world = M
        solver.tg[s]['kpole'].matrix_world = Matrix.Translation(kpole)
    bpy.context.view_layer.update()


CRANE = 0.38


def crane_head(solver):
    """A head that bows also comes FORWARD (as a real neck does), so the chin / beard slides over the chest instead of
    into it. The SAME formula runs in the runtime (lib/engine3/character.js craneHead); it is applied here only so the
    hand targets given in the head's space and the body avoidance see the head where it will be (not exported)."""
    pb = solver.pb
    R = lambda n: pb[n].matrix.to_3x3() @ solver.rest[n].to_3x3().inverted()
    head_fwd = R('head') @ bl.T((0, 0, 1))
    chest_up = R('chest') @ bl.T((0, 1, 0))
    chest_fwd = R('chest') @ bl.T((0, 0, 1))
    down = max(0.0, -head_fwd.dot(chest_up))
    if down < 1e-4:
        return
    d = chest_fwd * (CRANE * down)
    par = pb['head'].parent
    Rb = solver.rest['head'].to_3x3(); Rp = solver.rest[par.name].to_3x3()
    pb['head'].location = Rb.inverted() @ Rp @ par.matrix.to_3x3().inverted() @ d
    bpy.context.view_layer.update()


def _key_world(solver, key, s, fingers):
    """world (armature) position + rotation of a hand key at the current frame (its space carries it)."""
    S = solver.space_matrix(key['space'])
    rest = REST_HAND[s]
    fd = key['fd'] if key['fd'] is not None else rest['fd']
    pn = key['pn'] if key['pn'] is not None else rest['pn']
    R = S.to_3x3().normalized() @ frame_basis(fd, pn)
    P = S @ bl.T(key['pos'])
    # effector offset -> wrist
    off = solver.hand_local_point(s, key['eff'], fingers)
    hb = solver.rig.data.bones[f'hand_{s}']
    # hand bone rest frame vs our frame: R maps the hand's rest orientation? we built R = desired bone world rotation
    wrist = P - R @ off
    pole = key['pole'] if key['pole'] is not None else rest['pole']
    return wrist, R, S.to_3x3().normalized() @ bl.T(pole)


TORSO = [(1.30, .76, .46), (1.70, .735, .44), (2.20, .675, .415), (2.60, .60, .385), (2.77, .49, .335), (2.88, .25, .23)]


def _torso_r(y):
    if y <= TORSO[0][0]:
        return TORSO[0][1], TORSO[0][2]
    for (y0, a0, b0), (y1, a1, b1) in zip(TORSO, TORSO[1:]):
        if y <= y1:
            k = (y - y0) / (y1 - y0)
            return a0 + (a1 - a0) * k, b0 + (b1 - b0) * k
    return None


def avoid_body(solver, pos, clip, margin=0.16):
    """push a wrist target out of the torso (+ the long beard in front of it) and the head, in their posed frames:
    hands never pass through the body on the way between two keys."""
    beard = clip.name.endswith('_beard') or getattr(clip, 'beard', False)
    for space in ('spine', 'chest'):
        S = solver.space_matrix(space)
        q = S.inverted() @ pos                        # rest-pose coordinates (blender)
        x, z, y = q.x, -q.y, q.z                       # three coords
        if space == 'spine' and y > 2.1:
            continue
        if space == 'chest' and y <= 2.1:
            continue
        r = _torso_r(y)
        if r is None:
            continue
        hw, hd = r[0] + margin, r[1] + margin
        if beard and y < 3.0 and y > 1.85 and z > 0:
            hd = max(hd, 0.70 + margin * 0.6)
        k = (x / hw) ** 2 + (z / hd) ** 2
        if k < 1.0:
            # leave through the NEAREST side (along the ellipse normal), not radially: a hand in front of the belly
            # goes forward, a hand at the hip goes sideways
            nx, nz = x / hw ** 2, z / hd ** 2
            nl = math.hypot(nx, nz)
            if nl < 1e-6:
                nx, nz, nl = 0.0, 1.0, 1.0
            nx, nz = nx / nl, nz / nl
            aa = (nx / hw) ** 2 + (nz / hd) ** 2
            bb = 2 * (x * nx / hw ** 2 + z * nz / hd ** 2)
            cc = k - 1.0
            tt = (-bb + math.sqrt(max(0.0, bb * bb - 4 * aa * cc))) / (2 * aa)
            x, z = x + nx * tt, z + nz * tt
            pos = S @ bl.T((x, y, z))
        if beard and 1.9 < y < 3.05 and z > 0:
            # the long beard hangs in front of the chest: the hand passes in FRONT of it or beside it, never through it
            # (also in a clip that touches the body: the full margin, not the `touch` one)
            bm = margin / (getattr(clip, 'touch', None) or 1.0)
            bw, bd = 0.34 + bm * 0.7, 0.74 + bm * 0.7
            if y < 2.2:
                bw *= 0.75                                # the tip of the beard is narrower
            if (x / bw) ** 2 + (z / bd) ** 2 < 1.0:
                if abs(x) / bw > 0.72:
                    x = math.copysign(bw * 1.02, x) if z < bd * 0.7 else x
                    z = max(z, bd * math.sqrt(max(0.0, 1 - min(1.0, (x / bw) ** 2))))
                else:
                    z = bd * math.sqrt(max(0.0, 1 - (x / bw) ** 2))
                pos = S @ bl.T((x, y, z))
    # head: a cylinder r 0.56 from 2.97 to 3.95 (+ hat brim)
    S = solver.space_matrix('head')
    q = S.inverted() @ pos
    x, z, y = q.x, -q.y, q.z
    if 2.85 < y < 4.1:
        rr = math.hypot(x, z)
        touch = getattr(clip, 'touch', None)
        R = 0.56 + margin + (0.0 if touch else 0.04 + (0.17 if beard else 0.0))   # elders may wear the cowl: stay in front of its rim (a clip that TOUCHES the head - the cross - goes right to the skin)
        if rr < R:
            f = R / max(rr, 1e-6)
            pos = S @ bl.T((x * f, y, z * f if rr > 1e-6 else R))
    return pos


AVOID_POINTS = (('wrist', 0.17), ('palm', 0.13), ('knuckles', 0.11), ('tips', 0.07))


def hand_target(clip, solver, s, t, fingers):
    """wrist target with the WHOLE hand kept out of the torso / long beard / head: the wrist, palm, knuckles and
    finger tips are each pushed out of the body model and the wrist takes the largest correction (twice)."""
    w, R, pole = _hand_target(clip, solver, s, t, fingers)
    R3 = R if isinstance(R, Matrix) else R.to_matrix()
    for _ in range(3):
        best = None
        for eff, margin in AVOID_POINTS:
            off = solver.hand_local_point(s, eff, fingers)
            pnt = w + R3 @ off
            d = avoid_body(solver, pnt.copy(), clip, margin=margin * (getattr(clip, 'touch', None) or 1.0)) - pnt
            if best is None or d.length > best.length:
                best = d
        if best is None or best.length < 1e-4:
            break
        w = w + best
    return w, R, pole


def _hand_target(clip, solver, s, t, fingers):
    ks = sorted(clip.hands[s], key=lambda k: k['t'])
    rest = dict(REST_HAND[s], t=0, tension=1.0)
    rest['pos'] = np.array(rest['pos'])
    if not ks:
        ks = [rest]
    sh = solver.rest[f'uparm_{s}'].translation
    if t <= ks[0]['t'] or len(ks) == 1:
        w, R, pole = _key_world(solver, ks[0], s, fingers)
        return w, R, sh + pole.normalized() * 1.2
    if t >= ks[-1]['t']:
        w, R, pole = _key_world(solver, ks[-1], s, fingers)
        return w, R, sh + pole.normalized() * 1.2
    i = 0
    while ks[i + 1]['t'] < t:
        i += 1
    # hermite over world positions of all keys (evaluated in their spaces at this frame)
    W = [(k['t'], np.array(_key_world(solver, k, s, fingers)[0]), k.get('tension', 1.0)) for k in ks]
    pos = Vector(hermite(W, t))
    a = _key_world(solver, ks[i], s, fingers); b = _key_world(solver, ks[i + 1], s, fingers)
    k = ease((t - ks[i]['t']) / max(1e-6, ks[i + 1]['t'] - ks[i]['t']))
    R = a[1].to_quaternion().slerp(b[1].to_quaternion(), k).to_matrix()
    pole = a[2].lerp(b[2], k)
    return pos, R, sh + pole.normalized() * 1.2


def foot_target(clip, solver, s, t):
    ks = sorted(clip.feet[s], key=lambda k: k['t'])
    rest = dict(REST_FOOT[s], t=0)
    rest['pos'] = np.array(rest['pos'])
    if not ks:
        ks = [rest]
    P = [(k['t'], np.concatenate([k['pos'], [k['pitch'], k['yaw']]]), k.get('tension', 1.0)) for k in ks]
    v = hermite(P, t) if len(P) > 1 else P[0][1]
    pos = bl.T(v[:3])
    # foot frame: bone Y along the foot (ankle -> toe), Z up
    yaw, pitch = v[4] * DEG, v[3] * DEG
    fwd = np.array([math.sin(yaw) * math.cos(pitch), math.sin(pitch), math.cos(yaw) * math.cos(pitch)])
    up = np.array([-math.sin(yaw) * math.sin(pitch), math.cos(pitch), -math.cos(yaw) * math.sin(pitch)])
    rest_dir = np.array(mm.J['toe']) - np.array(mm.J['ankle'])
    rest_dir /= np.linalg.norm(rest_dir)
    # rotate so the foot's rest direction (slightly down) maps onto fwd tilted the same way
    tilt = math.atan2(-rest_dir[1], rest_dir[2])
    fd = np.array([math.sin(yaw) * math.cos(pitch - tilt), math.sin(pitch - tilt), math.cos(yaw) * math.cos(pitch - tilt)])
    R = frame_basis(fd, up)
    knee = pos + bl.T((math.sin(yaw) * 1.5, 0.2, math.cos(yaw) * 1.5))
    return pos, R, knee
