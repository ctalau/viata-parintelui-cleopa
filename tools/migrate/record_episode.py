"""Migrare (o singură dată): coregrafia din build_episode.py → apeluri de regie declarative.

    blender -b --factory-startup --python-exit-code 1 --python tools/migrate/record_episode.py

Rulează funcțiile animate_* ale episodului Blender cu funcțiile de regie înlocuite de
înregistratoare. Se păstrează pozele-cheie (încheietura, direcția degetelor, palma), nu
transformările calculate cadru cu cadru: rezultatul (tools/migrate/out/regie.json) e
convertit de tools/migrate/to_episode.mjs în episodes/<id>/episode.json, care devine sursa.
"""
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT/"experiments"/"cleopa-painea"/"scripts"), str(ROOT/"experiments"/"cleopa-blender"/"scripts")]
import build_episode as E  # noqa: E402

RECORD = []
DEPTH = [0]
ZONE = [None]


def plain(v):
    if isinstance(v, (Vector, tuple, list)):
        return [plain(x) for x in v]
    if isinstance(v, float):
        return round(v, 6)
    return v


def who(x):
    if isinstance(x, dict) and "rig" in x:
        return x["rig"].name[4:]
    if isinstance(x, bpy.types.Object):
        return x.name[4:] if x.name.startswith("RIG_") else x.name
    return x


def wrap(name, fn, fields, nested=False):
    def inner(*args, **kw):
        record = DEPTH[0] == 0
        if record:
            entry = {"op": name, "zone": ZONE[0]}
            entry.update(fields(*args, **kw))
            RECORD.append(entry)
        DEPTH[0] += 0 if nested else 1
        try:
            return fn(*args, **kw)
        finally:
            DEPTH[0] -= 0 if nested else 1
    return inner


def install():
    o = {}
    for key in ("actor", "arms", "hand_pose", "head", "blink", "prop", "voice", "stand", "breathing",
                "position_paths", "step", "key", "reveal_actor", "gate", "contact_hold", "tip_key", "arm_key",
                "syllables", "scarf_fold", "second_icon", "prop_book", "short_beard", "wool_cap", "shadow"):
        o[key] = getattr(E, key)

    def actor_fields(coll, design, name, position, size=1, look=None, hat=False, interior=False, palme=None):
        return {"name": name, "design": design, "pos": plain(position), "size": size, "look": look,
                "hat": hat, "interior": interior}
    E.actor = wrap("actor", o["actor"], actor_fields)

    def arms_fields(a, side, waypoints, seated=False, world=False, wrist_limit=None, skip_first=False, palm=None, keep_last=False):
        return {"who": who(a), "side": side, "keys": [[f, plain(p), plain(d)] for f, p, d in waypoints],
                "seated": seated, "world": world, "limit": wrist_limit, "skip_first": skip_first,
                "palm": plain(palm), "keep_last": keep_last}
    E.arms = wrap("arms", o["arms"], arms_fields)
    E.hand_pose = wrap("hand", o["hand_pose"], lambda a, side, frame, pose: {"who": who(a), "side": side, "f": frame, "pose": pose})
    E.head = wrap("head", o["head"], lambda rig, f, bow, tilt: {"who": who(rig), "f": f, "bow": plain(bow), "tilt": plain(tilt)})
    E.blink = wrap("blink", o["blink"], lambda rig, f, *a, **k: {"who": who(rig), "f": f})
    E.prop = wrap("prop", o["prop"], lambda rig, name, f, value: {"who": who(rig), "name": name, "f": f, "value": value})
    E.voice = wrap("voice", o["voice"], lambda a, cues: {"who": who(a), "cues": [c["file"] for c in cues]})
    E.stand = wrap("stand", o["stand"], lambda a, frame, soften=0: {"who": who(a), "f": frame, "soften": soften})
    E.breathing = wrap("breathing", o["breathing"], lambda a, start, end, phase=.2: {"who": who(a), "start": start, "end": end, "phase": plain(phase)})
    E.position_paths = wrap("move", o["position_paths"], lambda a, values: {"who": who(a), "keys": plain(values)})
    E.step = wrap("step", o["step"], lambda a, f0, f1, count=3, strength=.34: {"who": who(a), "f0": f0, "f1": f1, "count": count, "strength": strength})

    def key_fields(obj, frame, position=None, turn=None, scale=None):
        return {"who": who(obj), "f": frame, "position": plain(position), "turn": plain(turn), "scale": plain(scale)}
    E.key = wrap("key", o["key"], key_fields)
    E.reveal_actor = wrap("reveal", o["reveal_actor"], lambda a, start, end: {"who": who(a), "start": start, "end": end})
    E.gate = wrap("gate", o["gate"], lambda obj, start, end: {"who": who(obj), "start": start, "end": end})

    def contact_fields(a, side, frames, tip_at, direction, pose, palm=None, wrist_limit=None, held=1):
        frames = list(frames)
        tips = []
        for f in (frames[0], frames[-1]):
            tips.append(plain(tip_at(f)))
        return {"who": who(a), "side": side, "start": frames[0], "end": frames[-1], "dir": plain(direction),
                "pose": pose, "palm": plain(palm), "limit": wrist_limit, "held": held, "tips": tips}
    E.contact_hold = wrap("contact", o["contact_hold"], contact_fields)

    def tip_fields(a, side, frame, tip, direction, pose, palm=None, previous=None, wrist_limit=None, held=0):
        return {"who": who(a), "side": side, "f": frame, "tip": plain(tip), "dir": plain(direction), "pose": pose,
                "palm": plain(palm), "limit": wrist_limit, "held": held}
    E.tip_key = wrap("tip", o["tip_key"], tip_fields)

    def arm_key_fields(rig, p, side, frame, wrist, direction, previous=None, seated=False, wrist_limit=None,
                       depth=None, palm=None, held=0, continuity=True):
        return {"who": who(rig), "side": side, "f": frame, "wrist": plain(wrist), "dir": plain(direction),
                "limit": wrist_limit, "palm": plain(palm)}
    E.arm_key = wrap("armkey", o["arm_key"], arm_key_fields)
    def syllables(rig, start, end, seed, lead=False):
        o["syllables"](rig, start, end, seed, lead)
        curve = next(c for c in rig.animation_data.action.fcurves if c.data_path == '["mouth_pose"]')
        keys = [[round(k.co[0]), round(k.co[1])] for k in curve.keyframe_points if start <= k.co[0] <= end]
        RECORD.append({"op": "mouth", "zone": ZONE[0], "who": who(rig), "keys": keys, "note": "silabele cititorului"})
    E.syllables = syllables
    E.scarf_fold = wrap("scarf", o["scarf_fold"], lambda mother, start, end: {"who": who(mother), "start": start, "end": end})
    E.second_icon = wrap("icon", o["second_icon"], lambda coll, start, end: {"start": start, "end": end})
    E.prop_book = wrap("book", o["prop_book"], lambda a, center=.52: {"who": who(a), "center": center})
    E.short_beard = wrap("beard", o["short_beard"], lambda a: {"who": who(a)})
    E.wool_cap = wrap("cap", o["wool_cap"], lambda p, rig, coll: {"who": who(rig)})
    E.shadow = wrap("shadow", o["shadow"], lambda a, color="ad956d": {"who": who(a), "color": color})


def main():
    install()
    scene = E.setup("regie", end=E.TIMING["end"])
    bpy.data.objects.remove(scene.camera, do_unlink=True)
    for zone, name, animate in (("village", "sat", E.animate_village), ("yard", "ograda", E.animate_yard),
                                ("bed", "dormitor", E.animate_bed), ("kitchen", "bucatarie", E.animate_kitchen),
                                ("yard_dawn", "ograda-zori", E.animate_yard_dawn)):
        ZONE[0] = name
        coll = E.collection(name)
        animate(coll)
        # Vizibilitatea părților animate (ochii și falca lui Grăsuțu, ciocul cocoșului).
        for obj in coll.all_objects:
            data = obj.animation_data
            if obj.type != "MESH" or not data or not data.action or obj.name.startswith("RIG_"):
                continue
            for curve in data.action.fcurves:
                if curve.data_path == "hide_render":
                    keys = [[round(k.co[0]), bool(k.co[1])] for k in curve.keyframe_points]
                    parent = obj.parent.name if obj.parent else None
                    RECORD.append({"op": "hidden", "zone": name, "who": obj.name, "parent": parent, "keys": keys})
        if zone == "kitchen":
            # Mama ține un colț al baticului; obiectele de pe masă (pentru contacte).
            loaf = bpy.data.objects.get("Pâine pe taler")
            RECORD.append({"op": "loaf_start", "zone": name, "pos": plain(loaf.location)})
    out = ROOT/"tools"/"migrate"/"out"
    out.mkdir(parents=True, exist_ok=True)
    (out/"regie.json").write_text(json.dumps({"timeline": E.TIMING, "record": RECORD}, ensure_ascii=False))
    print("RECORD_OK", len(RECORD), flush=True)


main()
