"""Coace mânecile netede: o singură bucată de la umăr la manșetă, cu cotul rotunjit.

Rulează pe episodul salvat, după `palme25d_bake.py`:

    blender -b scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 \\
        --python scripts/maneci_bake.py

Înainte, mâneca era o fâșie deformată de oase (la cot se frângea și se strivea) sau,
la brațele 2.5D, două bucăți rigide suprapuse la cot: segmentele nu se legau. Acum
mâneca e rigidă pe braț până aproape de cot și rigidă pe antebraț după el, iar între ele,
la fiecare desen, axa mânecii ocolește cotul pe un arc de cerc (racordare):

* în exterior, marginea și conturul de cerneală urmează arcul: cotul e rotund;
* în interior, marginea brațului se oprește în pliu, iar antebrațul (desenat deasupra)
  își păstrează marginea: un pliu în „V” la îndoiri obișnuite, antebrațul pliat peste braț
  la cele strânse, fără contururi încrucișate.

Lățimea mânecii nu se schimbă (doar lungimea segmentelor se scurtează în proiecție, ca
oasele). Fiecare desen distinct devine o shape key cu interpolare constantă, ca palmele
2.5D; cheia „Mâna la față” a lui `palme25d_bake.py` rămâne și se adună peste ele.
Modificatorul de armătură al mânecii se oprește (rămâne pentru rezervă). Scriptul e
idempotent.
"""
from math import tan
from pathlib import Path
import sys

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import palme25d_bake as B  # noqa: E402

PREFIX = "Mânecă netedă "
FILLET = .3         # raza axei pe cot, în jumătăți de lățime: marginea exterioară are raza ≈ 1,3 jumătăți,
                    # un cot rotund cât mâneca; cu 1,1 cotul îndoit tare se umfla ca un balon
REACH = .5          # racordarea ocupă cel mult jumătate din fiecare segment proiectat
MITER = 3.          # vârful pliului interior stă la cel mult 3 grosimi de cot


def sleeves_of(coll, side):
    return [obj for obj in coll.objects
            if obj.type == "MESH" and obj.name.split(".")[0].endswith("Mânecă continuă · "+side)]


def deform(rig, bone):
    pose = rig.pose.bones[bone]
    return np.array(pose.matrix @ rig.data.bones[bone].matrix_local.inverted())


def rest_of(obj):
    keys = obj.data.shape_keys
    source = keys.key_blocks[0].data if keys else obj.data.vertices
    co = np.zeros(len(source)*3)
    source.foreach_get("co", co)
    return co.reshape(-1, 3)


class Sleeve:
    """Datele de repaus ale unei mâneci: distanța de la umăr și abaterea laterală."""

    def __init__(self, obj, rig, side):
        self.obj, self.rig, self.side = obj, rig, side
        bones = rig.data.bones
        self.head = np.array(bones["upper_arm."+side].head_local)
        self.upper = (bones["upper_arm."+side].head_local-bones["forearm."+side].head_local).length
        self.lower = (bones["forearm."+side].head_local-bones["hand."+side].head_local).length
        self.co = rest_of(obj)
        self.d = self.head[1]-self.co[:, 1]
        # Bucata fiecărui vârf, din ponderile rigide ale lui `sleeves.bind_cloth` (exact,
        # nu din distanță: rândul cotului e la limită în virgulă mobilă).
        group = obj.vertex_groups["upper_arm."+side].index
        self.on_upper = np.array([any(g.group == group and g.weight > .5 for g in v.groups)
                                  for v in obj.data.vertices])
        near = np.abs(self.d-self.upper) < .05
        self.half = float(np.max(np.abs(self.co[near, 0]-self.head[0])))
        hom = np.c_[self.co, np.ones(len(self.co))]
        self.hom = hom

    def rigid(self):
        mu, mf = deform(self.rig, "upper_arm."+self.side), deform(self.rig, "forearm."+self.side)
        out = np.where(self.on_upper[:, None], self.hom @ mu.T, self.hom @ mf.T)
        return out[:, :3], mu, mf

    def drawing(self):
        """Pozițiile vârfurilor la cadrul curent, în spațiul rigului."""
        out, mu, mf = self.rigid()
        pose = self.rig.pose.bones
        S = np.array(pose["upper_arm."+self.side].head)[:2]
        E = np.array(pose["forearm."+self.side].head)[:2]
        W = np.array(pose["hand."+self.side].head)[:2]
        Lu, Lf = np.linalg.norm(E-S), np.linalg.norm(W-E)
        if Lu < 1e-6 or Lf < 1e-6:
            return out
        u, f = (E-S)/Lu, (W-E)/Lf
        cross = u[0]*f[1]-u[1]*f[0]
        cosine = float(np.clip(u @ f, -1, 1))
        theta = float(np.arccos(cosine))
        if theta < 1e-3:
            return out
        bend = 1. if cross > 0 else -1.
        perp = lambda v: np.array([-v[1], v[0]])*bend        # spre interiorul îndoiturii
        n1, n2 = perp(u), perp(f)
        half_tan = tan(theta/2)
        T = min(FILLET*self.half*half_tan, REACH*Lu, REACH*Lf)
        R = T/half_tan
        A, Bp = E-u*T, E+f*T
        C = A+n1*R
        su, sf = Lu/self.upper, Lf/self.lower
        dA, dB = self.upper-T/su, self.upper+T/sf

        # Abaterea laterală (pozitivă spre interior), din poziția rigidă.
        lateral = out[:, :2]-np.where(self.on_upper[:, None],
                                      S+np.outer(self.d*su, u),
                                      E+np.outer((self.d-self.upper)*sf, f))
        o = np.where(self.on_upper, lateral @ n1, lateral @ n2)

        xy = out[:, :2].copy()
        # Exterior (și axa): pe arc.
        arc = (self.d > dA) & (self.d < dB) & (o <= 0)
        if arc.any():
            phi = (self.d[arc]-dA)/(dB-dA)*theta*bend
            c, s = np.cos(phi), np.sin(phi)
            r0 = -n1
            radial = np.stack([c*r0[0]-s*r0[1], s*r0[0]+c*r0[1]], axis=1)
            xy[arc] = C+radial*R-radial*o[arc, None]
        # Interior: marginile drepte ale celor două segmente, până la pliu.
        inner = o > 0
        if inner.any():
            denominator = max(1+float(n1 @ n2), 1e-6)
            miter = np.outer(o[inner], (n1+n2)/denominator)
            length = np.linalg.norm(miter, axis=1)
            limit = MITER*o[inner]
            miter *= np.minimum(1, limit/np.maximum(length, 1e-9))[:, None]
            # Pliul rămâne pe segmentele vizibile: un antebraț scurt și îndoit tare ar împinge
            # vârful pliului dincolo de manșetă, iar conturul ar ieși ca o țepușă.
            along = np.maximum(miter @ f, -(miter @ u))
            room = .8*min(Lu, Lf)
            miter *= np.minimum(1, room/np.maximum(along, 1e-9))[:, None]
            M = E+miter
            # Doar marginea brațului se oprește în pliu. Antebrațul, desenat deasupra, își
            # păstrează marginea întreagă: la o îndoire strânsă se vede pliat peste braț, iar
            # la una obișnuită capătul ei intră puțin în braț, ca linia pliului de la cot.
            cand = xy[inner]
            up = self.on_upper[inner]
            past = up & ((cand-M) @ u > 0)
            cand[past] = M[past]
            xy[inner] = cand
        out[:, :2] = xy
        return out


def prepare(obj):
    """Scoate formele unei coaceri anterioare și oprește armătura mânecii."""
    if obj.data.shape_keys:
        for key in list(obj.data.shape_keys.key_blocks):
            if key.name.startswith(PREFIX):
                obj.shape_key_remove(key)
        animation = obj.data.shape_keys.animation_data
        if animation and animation.action:
            for curve in list(animation.action.fcurves):
                if PREFIX in curve.data_path:
                    animation.action.fcurves.remove(curve)
    else:
        obj.shape_key_add(name="Basis")
    for modifier in obj.modifiers:
        if modifier.type == "ARMATURE":
            modifier.show_viewport = modifier.show_render = False


def store(obj, states):
    """Fiecare desen distinct devine o cheie; la fiecare desen exact o cheie are valoarea 1."""
    targets, sequence = {}, []
    for frame, co in states:
        signature = np.round(co, 5).tobytes()
        if signature not in targets:
            key = obj.shape_key_add(name=f"{PREFIX}{frame:04}", from_mix=False)
            key.data.foreach_set("co", co.ravel())
            key.value = 0
            targets[signature] = key
        sequence.append((frame, targets[signature]))
    for key in targets.values():
        previous = None
        for frame, current in sequence:
            value = float(current == key)
            if value != previous:
                key.value = value
                key.keyframe_insert("value", frame=frame)
                previous = value
    for curve in obj.data.shape_keys.animation_data.action.fcurves:
        if PREFIX in curve.data_path:
            for point in curve.keyframe_points:
                point.interpolation = "CONSTANT"
    return len(targets)


def check_rigid(scene, sleeve, frame):
    """Fără racordare, coacerea dă exact ce dădea armătura (aceleași oase, aceleași ponderi)."""
    scene.frame_set(frame)
    graph = bpy.context.evaluated_depsgraph_get()
    evaluated = sleeve.obj.evaluated_get(graph).data
    co = np.zeros(len(evaluated.vertices)*3)
    evaluated.vertices.foreach_get("co", co)
    rigid, _, _ = sleeve.rigid()
    lift = np.zeros(len(rigid))
    keys = sleeve.obj.data.shape_keys
    if keys and B.LIFT_KEY in keys.key_blocks:
        block = keys.key_blocks[B.LIFT_KEY]
        lifted = np.zeros(len(rigid)*3)
        block.data.foreach_get("co", lifted)
        lift = (lifted.reshape(-1, 3)[:, 2]-sleeve.co[:, 2])*block.value
    error = np.abs(co.reshape(-1, 3)-rigid-np.c_[np.zeros((len(rigid), 2)), lift]).max()
    assert error < 1e-4, (sleeve.obj.name, frame, error)


def main():
    windows, out = B.bake_options()
    scene = bpy.context.scene
    rigs = [obj for obj in scene.objects if obj.type == "ARMATURE" and "forearm.R" in obj.pose.bones]
    sleeves = []
    for rig in rigs:
        coll = bpy.data.collections.get(rig.name[4:])
        if coll is None:
            continue
        start, end = B.visible_range(coll, scene, windows)
        for side in ("R", "L"):
            for obj in sleeves_of(coll, side):
                frames = {f for f in B.drawn(start, end) if B.in_windows(f, windows)}
                if frames:
                    sleeves.append((Sleeve(obj, rig, side), frames))
    for sleeve, frames in sleeves:
        if any(m.show_render for m in sleeve.obj.modifiers if m.type == "ARMATURE"):
            check_rigid(scene, sleeve, min(frames))
    states = {id(sleeve): [] for sleeve, _ in sleeves}
    for frame in sorted(set().union(*(frames for _, frames in sleeves))):
        scene.frame_set(frame)
        for sleeve, frames in sleeves:
            if frame in frames:
                states[id(sleeve)].append((frame, sleeve.drawing()))
    total = 0
    for sleeve, frames in sleeves:
        prepare(sleeve.obj)
        count = store(sleeve.obj, states[id(sleeve)])
        total += count
        print("MANECA", sleeve.obj.name, len(frames), "desene", count, "forme", flush=True)
    scene.frame_set(scene.frame_start)
    B.save(windows, out)
    print("MANECI_OK", total, "forme", flush=True)


if __name__ == "__main__":
    main()
