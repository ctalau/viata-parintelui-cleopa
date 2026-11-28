"""Decorurile și recuzita seriei ca GLB-uri reutilizabile.

    blender -b --factory-startup --python-exit-code 1 --python blender/sets/build_sets.py [-- <id> ...]

Decor → assets/sets/<id>.glb + <id>.json (ancore, lățimea picturii, părțile animate).
Recuzită → assets/props/<id>.glb + <id>.json (`grip`, părțile animate ale animalelor).
Decorurile se construiesc cu aceleași funcții ca episodul Blender (decor.py, painted_*.py), fără
personaje și fără animație: motorul din lib/engine/ pune personajele pe ancore și animă părțile
marcate (`extras.part`): flacăra cuptorului, capul cocoșului, capul, gura și coada lui Grăsuțu.
"""
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT/"experiments"/"cleopa-painea"/"scripts"), str(ROOT/"experiments"/"cleopa-blender"/"scripts")]

import build_episode as E  # noqa: E402
from decor import empty, painted_backdrop, pig, rooster, steam_art, trough, village  # noqa: E402
from painted_bedroom import bedroom  # noqa: E402
from painted_kitchen import painted_kitchen  # noqa: E402
from vector_art import Art, collection  # noqa: E402
from yard_late import build_late_yard  # noqa: E402

SETS = ROOT/"assets"/"sets"
PROPS = ROOT/"assets"/"props"


def clean():
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll in list(bpy.data.collections):
        bpy.data.collections.remove(coll)
    return bpy.context.scene


def export(path, objects):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_render = obj.hide_viewport = False
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True, export_yup=False,
                              export_animations=False, export_extras=True, export_image_format="WEBP",
                              export_image_quality=88)
    print("ASSET_OK", path.name, path.stat().st_size, flush=True)


def tree(root):
    return [root, *root.children_recursive]


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1)+"\n")


# Ancorele: unde stau personajele în episodul 1 (x, y = tălpi/șold ca în build_episode.actor,
# z = adâncimea întregului personaj față de decor) și mărimea lor. Un episod nou le poate folosi
# sau poate pune personajele oriunde, cu coordonate.
ANCHORS = {
    "sat": {"drum": {"pos": [.10, -1.97, .19], "size": .96}},
    "ograda": {"costica": {"pos": [2.63, -1.49, .21], "size": 1.16},
               "mihai": {"pos": [-.38, -1.48, E.LATE_BROTHER_DEPTH], "size": 1.13},
               "cocos": {"pos": [4.52, .509, -2.73], "size": .96}, "purcel": {"pos": [-2.78, -2.99, -.05], "size": 1.17},
               "troaca": {"pos": [-1.54, -2.62, 0]}},
    "ograda-zori": {"cocos": {"pos": [2.76, .637, -2.73], "size": 1.30}, "purcel": {"pos": [-1.81, -2.42, -.05], "size": 1.17},
                    "troaca": {"pos": [-.57, -2.05, 0]}},
    "dormitor": {"pat": {"pos": [1.70, -1.94, .43], "size": 1.17}},
    "bucatarie": {
        "mama": {"pos": [-1.72, -2.37, .08], "size": 1.22},
        "costica": {"pos": [2.22, -2.47, 1.14], "size": 1.15},
        "mihai": {"pos": [4.23, -2.40, .61], "size": 1.13},
        "prag": {"pos": [6.62, -2.62, 1.67], "size": 1.30},
        "masa": {"pos": [-.12, -2.56, 0]},
        "cuptor": {"pos": [-2.38, -1.56, 0]},
    },
}


def build_set(id_):
    scene = clean()
    coll = collection("SET_"+id_)
    meta = {"id": id_, "anchors": ANCHORS.get(id_, {}), "parts": {}}
    if id_ == "sat":
        village(coll)
        meta.update(width=16.4, label="Satul de pe deal")
    elif id_ == "ograda":
        build_late_yard(coll)
        meta.update(width=12.4, label="Ograda de dimineață")
    elif id_ == "ograda-zori":
        landscape = collection("Ograda · 01 Peisaj și vegetație", coll)
        painted_backdrop(landscape, "Ograda · peisaj", "ograda-peisaj.png", 12.4)
        fence = collection("Ograda · 02 Gard și magazie", coll)
        painted_backdrop(fence, "Ograda · gard și magazie", "ograda-gard-magazie.png", 12.4,
                         depth=-3.2, silhouette="ograda-gard-magazie.svg")
        meta.update(width=12.4, label="Ograda în zori")
    elif id_ == "dormitor":
        bedroom(coll)
        meta.update(width=12.0, label="Dormitorul")
    elif id_ == "bucatarie":
        loaf, flame = painted_kitchen(coll)
        flame["part"] = "flame"
        meta["parts"]["flame"] = "flacăra cuptorului: tremur (lib/engine/ambient.js)"
        # Pâinea pe taler e recuzită, nu decor.
        for obj in tree(loaf):
            bpy.data.objects.remove(obj, do_unlink=True)
        # A doua icoană (Maica Domnului cu Pruncul) apare doar la rugăciune: parte comutată din regie.
        before = set(coll.all_objects)
        E.second_icon(coll, 1, 2)
        for obj in set(coll.all_objects)-before:
            obj.animation_data_clear()
            obj["part"] = "icon2"
        meta["parts"]["icon2"] = "a doua icoană, vizibilă la rugăciune"
        meta.update(width=18.8, label="Bucătăria în zori")
    objects = [obj for obj in coll.all_objects]
    export(SETS/f"{id_}.glb", objects)
    write(SETS/f"{id_}.json", meta)


def build_prop(id_):
    scene = clean()
    coll = collection("PROP_"+id_)
    meta = {"id": id_, "parts": {}}
    if id_ == "paine":
        loaf, _ = painted_kitchen(collection("tmp", coll))
        keep = tree(loaf)
        for obj in list(coll.all_objects):
            if obj not in keep:
                bpy.data.objects.remove(obj, do_unlink=True)
        E.paint_crust(loaf)
        loaf.location = (0, 0, 0)
        grip = empty("grip", coll, (0, -.142, 0), loaf)
        meta.update(label="Pâine caldă pe taler", grip="sub marginea talerului", hands=2)
    elif id_ == "abur":
        steam_art(coll, "Abur de pâine")
        meta.update(label="Abur de pâine")
    elif id_ == "carte":
        # Desenul din build_episode.prop_book, la origine (prop_book îl leagă de pieptul lui Mihai).
        art = Art("Carte groasă", coll, (0, 0), (1, 1))
        art.shape("M -.44 -.45 L .21 -.54 L .359 .428 L -.288 .521 Z", "6f4942", "53342d", .041)
        art.shape("M -.405 -.397 L .205 -.487 L .304 .380 L -.271 .467 Z", "e6c69a")
        art.shape("M -.382 -.376 L .183 -.461 L .300 .437 L -.251 .523 Z", "a05c45", "623e31", .032)
        art.line([(-.321, -.303), (-.221, .431)], "cb9363", .034)
        art.line([(-.227, .338), (.179, .277)], "daab70", .034)
        art.line("M -.205 .307 L .150 .254 L .057 -.275 Q -.051 -.310 -.173 -.302", "734535", .016)
        art.line("M -.287 .168 Q -.250 .201 -.201 .193", "b87955", .018)
        art.line("M -.214 -.211 Q -.162 -.227 -.134 -.214", "b87955", .018)
        art.diamond(-.020, .028, .123, .188, "c89a61")
        art.diamond(-.011, .027, .041, .071, "995a44")
        art.finish()
        empty("grip", coll, (0, -.45, 0))
        meta.update(label="Cartea lui Mihai", grip="muchia de jos", note="lățime ~0,8 la scara 1")
    elif id_ == "carte-deschisa":
        art = Art("Carte de rugăciuni deschisă", coll, (0, 0), (1, 1))
        art.shape("M -.78 .22 Q -.40 .35 0 .14 Q .40 .35 .78 .22 L .70 -.30 Q .35 -.22 0 -.38 Q -.35 -.22 -.70 -.30 Z",
                  "784e40", "54372c", .050)
        art.shape("M -.72 .25 Q -.35 .35 0 .16 Q .35 .35 .72 .25 L .65 -.24 Q .29 -.17 0 -.34 Q -.29 -.17 -.65 -.24 Z",
                  "eed5a9", "ac7c57", .034)
        art.line([(0, .16), (0, -.34)], "a77552", .023)
        for x in (-1, 1):
            for y in (-.14, -.045, .05, .14):
                art.line([(x*.13, y), (x*.36, y+.07), (x*.55, y+.073)], "b38d66", .013)
        art.finish()
        empty("grip.L", coll, (.62, -.27, 0))
        empty("grip.R", coll, (-.62, -.27, 0))
        meta.update(label="Cartea de rugăciuni, deschisă", hands=2)
    elif id_ == "randunica":
        art = Art("Aripi de rândunică", coll)
        art.line("M -.14 .016 Q -.057 .088 0 .025 Q .061 .100 .14 .031", "617e78", .035)
        art.finish()
        meta.update(label="Rândunică (zbor: lib/engine/ambient.js)")
    elif id_ == "aroma":
        aroma = Art("Miros auriu", coll, (0, 0), (1, 1))
        aroma.line("M -.53 -.205 Q -.90 .38 -.38 .68 Q .31 1.133 1.021 .67 Q 1.223 .533 1.333 .797", "eac98f", .073)
        aroma.line("M -.261 -.227 Q .023 .06 -.195 .273 Q -.422 .678 .220 .691 Q .621 .778 .863 .543", "f6d79d", .057)
        for x, y, sc in ((-.53, .38, .044), (.45, .96, .058), (.93, .78, .043), (.22, .41, .035)):
            aroma.diamond(x, y, sc, sc*1.32, "f2d19a")
        aroma.finish()
        meta.update(label="Norul auriu al mirosului de pâine")
    elif id_ == "purcel":
        parts = pig(coll, dawn=True)
        parts = {k: v for k, v in parts.items() if isinstance(v, bpy.types.Object)}
        for key, obj in parts.items():
            obj["part"] = key
        meta.update(label="Grăsuțu", parts={k: "nod animat" for k in parts})
    elif id_ == "cocos":
        parts = rooster(coll, dawn=True)
        parts = {k: v for k, v in parts.items() if isinstance(v, bpy.types.Object)}
        for key, obj in parts.items():
            obj["part"] = key
        meta.update(label="Cocoșul", parts={k: "nod animat" for k in parts})
    elif id_ == "troaca":
        trough(coll, (0, 0), dawn=True)
        meta.update(label="Troaca")
    export(PROPS/f"{id_}.glb", list(coll.all_objects))
    write(PROPS/f"{id_}.json", meta)


if __name__ == "__main__":
    SETS.mkdir(parents=True, exist_ok=True)
    PROPS.mkdir(parents=True, exist_ok=True)
    args = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    for id_ in args or ["sat", "ograda", "ograda-zori", "dormitor", "bucatarie"]:
        build_set(id_)
    for id_ in ([] if args else ["paine", "abur", "carte", "carte-deschisa", "randunica", "aroma", "purcel", "cocos", "troaca"]):
        build_prop(id_)
