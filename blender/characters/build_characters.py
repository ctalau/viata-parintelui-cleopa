"""Personajele familiei ca GLB-uri reutilizabile (assets/characters/<id>.glb + <id>.json).

Fiecare GLB are rigul 2D al seriei în poza de repaus, fără nicio animație de episod: desenele
plate sunt legate rigid de oase (cap, piept, picioare), mâneca e o plasă cu skin pe braț și
antebraț, iar variantele (ochi, guri, desenele de autor ale mâinilor, căciula) sunt noduri
marcate în `extras` cu `variant: "<grup>=<nume>"`. Motorul din `lib/engine/` alege variantele,
mișcă oasele și desenează palmele 2.5D; GLB-ul nu se reexportă pentru un gest nou.

    blender -b --factory-startup --python-exit-code 1 --python blender/characters/build_characters.py
"""
import json
from pathlib import Path
import sys

import bpy

ROOT = Path(__file__).resolve().parents[2]
EPISODE = ROOT/"experiments"/"cleopa-painea"
sys.path[:0] = [str(EPISODE/"scripts"), str(ROOT/"experiments"/"cleopa-blender"/"scripts")]

import build_episode as E  # noqa: E402  (actor(): proporțiile revizuite ale seriei)
from build_characters import EYES, MOUTHS  # noqa: E402
from hands import HAND_POSES  # noqa: E402

OUT = ROOT/"assets"/"characters"
# id stabil → design Blender, direcția privirii în repaus (1 = spre dreapta ecranului).
CAST = {
    "costica": {"design": "cleopa", "label": "Costică", "look": -1, "extras": ("cap",)},
    "mama": {"design": "mother", "label": "Mama", "look": 1, "extras": ("scarf",)},
    "mihai": {"design": "brother_01", "label": "Mihai", "look": -1, "extras": ()},
    "tata": {"design": "father", "label": "Tata", "look": -1, "extras": ("beard",)},
}
# Culorile hainelor și ale pielii care se schimbă în interior (lumina caldă a bucătăriei).
INTERIOR = {"shirt": "ffedcb", "shade": "dfb991", "skin": "f5b488", "skin_shadow": "e1946d"}
PROFILE_KEYS = ("id", "look", "shoulder_x", "shoulder_y", "upper", "lower", "hand", "leg", "head_y",
                "head_h", "head_w", "body", "skin", "skin_shadow", "shirt", "shade", "wrist_limit")


def clean_scene():
    """O scenă goală pentru fiecare personaj (resetarea fabricii invalidează datele modulelor)."""
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    scene = bpy.context.scene
    scene.render.fps = 24
    return scene


def tag_variants(rig, coll):
    """Driverele de vizibilitate devin marcaje `variant` (grupul = proprietatea rigului)."""
    groups = {"eye_pose": EYES, "mouth_pose": MOUTHS, "hand_R_pose": HAND_POSES, "hand_L_pose": HAND_POSES}
    for obj in list(coll.all_objects):
        data = obj.animation_data
        if not data or not data.drivers:
            continue
        found = [(d.data_path, d.driver.expression, d.driver.variables[0].targets[0].data_path)
                 for d in data.drivers]
        for data_path, expression, source in found:
            target = source.strip('[]"')
            index = int(expression.split("!=")[1].split()[0])
            obj["variant"] = f"{target}={groups[target][index]}"
        for data_path, *_ in found:
            obj.driver_remove(data_path)
        obj.hide_render = obj.hide_viewport = False


def build(id_, spec):
    scene = clean_scene()
    actor = E.actor(scene.collection, spec["design"], id_, (0, 0, 0), look=spec["look"], palme=True)
    rig, coll, p = actor["rig"], actor["collection"], actor["p"]
    rig.animation_data_clear()
    rig.scale = (1, 1, 1)
    if "cap" in spec["extras"]:
        before = set(coll.objects)
        E.wool_cap(p, rig, coll)
        for obj in set(coll.objects)-before:
            obj["variant"] = "accessory=cap"
    if "scarf" in spec["extras"]:
        # Colțul baticului ridicat (build_episode.scarf_fold), ca accesoriu ales din regie.
        before = set(coll.objects)
        E.scarf_fold(actor, 1, 2)
        for obj in set(coll.objects)-before:
            obj.animation_data_clear()
            obj.hide_render = obj.hide_viewport = False
            obj["variant"] = "accessory=scarf"
    if "beard" in spec["extras"]:
        E.short_beard(actor)
    tag_variants(rig, coll)
    for obj in coll.all_objects:
        if obj.type == "MESH":
            obj["part"] = obj.name.split(" / ", 1)[-1]
    # Picioarele pe sol: originea rigului rămâne la șold; solul e la y = -leg (vezi .json).
    bpy.ops.object.select_all(action="DESELECT")
    for obj in coll.all_objects:
        obj.select_set(True)
    rig.select_set(True)
    path = OUT/f"{id_}.glb"
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True,
                              export_yup=False, export_animations=False, export_skins=True,
                              export_extras=True, export_morph_normal=False)
    bones = {b.name: {"head": list(b.head_local[:2]), "tail": list(b.tail_local[:2]),
                      "parent": b.parent.name if b.parent else None} for b in rig.data.bones}
    meta = {
        "id": id_, "label": spec["label"], "design": spec["design"],
        "profile": {k: p[k] for k in PROFILE_KEYS if k in p},
        "ground": -p["leg"], "bones": bones,
        "variants": {"eye_pose": list(EYES), "mouth_pose": list(MOUTHS),
                     "hand_pose": list(HAND_POSES), "accessory": list(spec["extras"])},
        "palette": {"interior": {p[k]: v for k, v in INTERIOR.items() if k in p}},
        "sockets": {"chest": "chest", "head": "head", "hand.R": "hand.R", "hand.L": "hand.L"},
        "contract": "assets/CONTRACT.md",
    }
    (OUT/f"{id_}.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1)+"\n")
    print("CHARACTER_OK", id_, path.stat().st_size, flush=True)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    only = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else list(CAST)
    for id_ in only:
        build(id_, CAST[id_])
