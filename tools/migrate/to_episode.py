"""Migrare (o singură dată): tools/migrate/out/regie.json → episodes/001-…/episode.json.

    python3 tools/migrate/to_episode.py

După migrare, episode.json e sursa regiei (se editează direct); acest script nu mai rulează.
"""
import json
from pathlib import Path
import re
import shutil
import unicodedata

ROOT = Path(__file__).resolve().parents[1].parent
EPISODE = ROOT/"experiments"/"cleopa-painea"
OUT = ROOT/"episodes"/"001-painea-care-poate-sa-astepte"
data = json.loads((ROOT/"tools"/"migrate"/"out"/"regie.json").read_text())
timeline, record = data["timeline"], data["record"]
beats = {b["id"]: b for b in timeline["beats"]}
CHAR = {"cleopa": "costica", "mother": "mama", "brother_01": "mihai", "father": "tata"}


def slug(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def r(v, n=4):
    if isinstance(v, list):
        return [r(x, n) for x in v]
    return round(v, n) if isinstance(v, float) else v


# --- Distribuția ------------------------------------------------------------------
cast = {}
names = {}
for e in record:
    if e["op"] == "actor":
        id_ = slug(e["name"])
        names[e["name"]] = id_
        cast[id_] = {"scene": e["zone"], "character": CHAR[e["design"]], "label": e["name"], "pos": r(e["pos"]),
                     "size": e["size"], "look": e["look"], "interior": e["interior"]}
        if e["hat"]:
            cast[id_]["accessories"] = ["cap"]
for e in record:
    who = names.get(e.get("who"))
    a = cast.get(who) if who else None
    op = e["op"]
    if a is None:
        continue
    if op == "arms":
        a.setdefault("arms", []).append({k: v for k, v in {
            "side": e["side"], "keys": [[f, r(p), r(d)] for f, p, d in e["keys"]], "limit": r(e["limit"]) if e["limit"] else None,
            "palm": e["palm"], "seated": e["seated"] or None, "world": e["world"] or None,
            "skipFirst": e["skip_first"] or None, "keepLast": e["keep_last"] or None}.items() if v is not None})
    elif op == "armkey":
        a.setdefault("arms", []).append({"side": e["side"], "keys": [[e["f"], r(e["wrist"]), r(e["dir"])]],
                                         "limit": r(e["limit"]), "palm": e["palm"]})
    elif op == "stand":
        a.setdefault("stand", []).append(e["f"])
    elif op == "hand":
        a.setdefault("hands", []).append([e["f"], e["side"], e["pose"]])
    elif op == "head":
        a.setdefault("head", []).append([e["f"], r(e["bow"]), r(e["tilt"])])
    elif op == "blink":
        a.setdefault("blinks", []).append(e["f"])
    elif op == "prop":
        a.setdefault("face", {}).setdefault(e["name"], []).append([e["f"], e["value"]])
    elif op == "mouth":
        a.setdefault("face", {}).setdefault("mouth_pose", []).extend(e["keys"])
    elif op == "voice":
        a.setdefault("say", []).extend(e["cues"])
    elif op == "breathing":
        a.setdefault("breathe", []).append([e["start"], e["end"], r(e["phase"])])
    elif op == "move":
        a["move"] = [[f, r(x), r(y)] for f, x, y in e["keys"]]
    elif op == "step":
        a.setdefault("steps", []).append([e["f0"], e["f1"], e["count"], e["strength"]])
    elif op == "key" and e["scale"]:
        a.setdefault("scale", []).append([e["f"], r(e["scale"][0]/a["size"])])
    elif op == "reveal":
        a["visible"] = [e["start"], e["end"]]
    elif op == "shadow":
        a["shadow"] = e["color"]
    elif op == "book":
        a.setdefault("props", []).append({"prop": "carte", "bone": "chest", "at": [e["center"], .78], "z": .47})
    elif op == "beard":
        a.setdefault("accessories", []).append("beard")
    elif op == "scarf":
        a.setdefault("accessories_at", []).append(["scarf", e["start"], e["end"]])
    elif op == "contact":
        a.setdefault("contacts", []).append({"side": e["side"], "from": e["start"], "to": e["end"], "target": "head",
                                             "tip": r(e["tips"][0]), "dir": r(e["dir"]), "pose": e["pose"],
                                             "palm": e["palm"], "limit": r(e["limit"])})
# Mama duce talerul: vârfurile degetelor sub marginea talerului urmează pâinea (tip_key cadru cu cadru).
tips = [e for e in record if e["op"] == "tip"]
for side in ("R", "L"):
    seq = [e for e in tips if e["side"] == side]
    if not seq:
        continue
    a = cast[names[seq[0]["who"]]]
    dirs = [[e["f"], r(e["dir"])] for e in seq]
    keep = [dirs[0]]+[d for i, d in enumerate(dirs[1:-1], 1) if d[1] != dirs[i-1][1] or d[1] != dirs[i+1][1]]+[dirs[-1]]
    a.setdefault("contacts", []).append({"side": side, "from": seq[0]["f"], "to": seq[-1]["f"], "target": "prop:paine",
                                         "tip": r(seq[0]["tip"]), "dir": keep, "pose": seq[0]["pose"], "palm": r(seq[0]["palm"])})
# Costică se întoarce spre Mihai la șoaptă (capul oglindit), apoi înapoi spre masă.
cb = cast["costica-bucatarie"]
cb["flip"] = [[2090, 1], [beats["farfuria"]["start"], -1], [beats["grasutu"]["start"], 1]]
cast["mama-bucatarie"]["atTable"] = True   # palmele pe blat, în fața mesei
# Tata în rugăciune ține cartea deschisă în fața pieptului.
cast["tata-rugaciune"].setdefault("props", []).append({"prop": "carte-deschisa", "bone": "chest", "at": [-.06, .90], "z": .72})
for a in cast.values():
    for key in ("head", "blinks", "hands", "stand"):
        if key in a:
            a[key].sort()
    for name in a.get("face", {}):
        a["face"][name].sort()

# --- Recuzita, animalele și ambientul -------------------------------------------
props = {
    "paine": {"scene": "bucatarie", "asset": "paine", "keys": [[e["f"], r(e["position"])] for e in record
                                                             if e["op"] == "key" and e["who"] == "Pâine pe taler"]},
    "abur": {"scene": "bucatarie", "asset": "abur", "ambient": {"kind": "steam", "follow": "paine", "from": beats["cuptor"]["start"]}},
    "aroma": {"scene": "bucatarie", "asset": "aroma", "pos": [.25, -1.59, 1.09],
              "visible": [round(beats["aproape"]["start"]+(beats["aproape"]["end"]-beats["aproape"]["start"])*.22), beats["prag"]["start"]],
              "ambient": {"kind": "drift"}},
    "flacara": {"scene": "bucatarie", "part": "flame", "ambient": {"kind": "flicker"}},
    "icoana": {"scene": "bucatarie", "part": "icon2", "visible": next([e["start"], e["end"]] for e in record if e["op"] == "icon")},
}
for zone, suffix, perch, ground, scale in (("ograda", "", (2.76, .637, -2.73), (-1.81, -2.42, -.05), (-1.30, 1.30, 1)),
                                           ("ograda-zori", ".001", (2.76, .637, -2.73), (-1.81, -2.42, -.05), (-1.30, 1.30, 1))):
    from_late = zone == "ograda"
    if from_late:
        import importlib  # noqa: F401
    keys = lambda name: [[e["f"], r(e["turn"][2]) if e["turn"] else None, r(e["position"]) if e["position"] else None,
                          r(e["scale"]) if e["scale"] else None] for e in record if e["op"] == "key" and e["who"] == name+suffix]
    hidden = {e["who"].replace(suffix, "") if suffix else e["who"]: e["keys"] for e in record
              if e["op"] == "hidden" and (e["who"].endswith(suffix) if suffix else not e["who"].endswith(".001"))
              and e["who"].startswith(("Grăsuțu", "Cocoș"))}
    props[f"cocos-{zone}"] = {"scene": zone, "asset": "cocos", "anchor": "gard", "scale": list(scale),
                              "parts": {"head": {"turn": [[f, t] for f, t, *_ in keys("Cocoș · gât și cap")]},
                                        "beak": {"hidden": hidden.get("Cocoș · cioc deschis")}}}
    props[f"purcel-{zone}"] = {"scene": zone, "asset": "purcel", "anchor": "troaca", "scale": [1.17, 1.17, 1],
                               "parts": {"head": {"turn": [[f, t] for f, t, *_ in keys("Grăsuțu · cap") if t is not None],
                                                  "position": [[f, p] for f, _, p, _ in keys("Grăsuțu · cap") if p]},
                                         "chew": {"scale": [[f, s] for f, _, _, s in keys("Grăsuțu · mestecat") if s]},
                                         "tail": {"turn": [[f, t] for f, t, *_ in keys("Grăsuțu · coadă")]},
                                         "open": {"hidden": hidden.get("Grăsuțu · ochi deschis")},
                                         "shut": {"hidden": hidden.get("Grăsuțu · ochi închis")},
                                         "jaw": {"hidden": hidden.get("Grăsuțu · gură căscată")},
                                         "bite": {"hidden": hidden.get("Grăsuțu · gură la troacă")}}}
    props[f"troaca-{zone}"] = {"scene": zone, "asset": "troaca", "pos": [ground[0]+1.24, ground[1]+.37, 0]}
for i in range(4):
    name = f"Rândunică {i+1}"
    props[f"randunica-{i+1}"] = {"scene": "sat", "asset": "randunica",
                                 "keys": [[e["f"], r(e["position"]), r(e["scale"])] for e in record if e["op"] == "key" and e["who"] == name]}

# --- Planurile de cameră (build_episode.cameras) ----------------------------------
B = lambda id_: beats[id_]["start"]
next_bed = beats["trezire"]["cues"][1]["start"]-4
specs = [
    ("Satul în zori", B("sat"), "sat", (0, .23), 16.0, (.15, -.05, -.27)),
    ("Cocoșul și purcelușul", B("trezire"), "ograda-zori", (0, 0), 11.9, (.10, 0, -.24)),
    ("Trezirea lui Costică", next_bed, "dormitor", (.27, -.70), 12.0, (.14, .17, -.27)),
    ("Ghiorrr!", B("burtica"), "dormitor", (1.47, -.24), 7.25, (.04, 0, -.12)),
    ("La troacă", B("troaca"), "ograda", (.28, -.34), 11.0, (.10, -.03, -.18)),
    ("Mihai apare de după șură", B("mihai"), "ograda", (0, -.15), 12.1, (.10, -.02, -.11)),
    ("Pâinea caldă", B("cuptor"), "bucatarie", (-1.51, -.65), 13.60, (.13, -.02, -.12)),
    ("Drumul spre școală", B("traista"), "bucatarie", (.96, -.60), 10.2, (.09, .0, -.16)),
    ("Încă puțin", B("aproape"), "bucatarie", (1.33, -.96), 8.16, (.12, -.04, -.22)),
    ("Tata în prag", B("prag"), "bucatarie", (2.50, -.47), 11.96, (.19, .07, -.16)),
    ("Întâi ne rugăm", B("intai"), "bucatarie", (1.45, -.96), 7.95, (.09, .03, -.23)),
    (beats["farfuria"]["title"], B("farfuria"), "bucatarie", (4.25, -.41), 8.10, (.07, .05, -.12)),
    (beats["grasutu"]["title"], B("grasutu"), "bucatarie", (2.57, -.47), 5.56, (.04, .01, -.11)),
    (beats["porcul-si-omul"]["title"], B("porcul-si-omul"), "bucatarie", (2.39, -.50), 11.60, (.05, .04, -.17)),
    (beats["un-ceas"]["title"], B("un-ceas"), "bucatarie", (3.75, -.45), 8.86, (.05, .04, -.13)),
    (beats["amin"]["title"], B("amin"), "bucatarie", (2.45, -.57), 11.55, (.09, .01, -.10)),
    (beats["la-icoane"]["title"], B("la-icoane"), "bucatarie", (-2.04, -.18), 13.80, (.21, .06, -.24)),
]
shots = [{"name": n, "at": f, "set": z, "center": list(c), "width": w, "glide": list(g)} for n, f, z, c, w, g in specs]

burta = next(e for e in timeline["effects"] if e["file"] == "burta.wav")
plan = json.loads((EPISODE/"scenariu.json").read_text())
episode = {
    "id": "001-painea-care-poate-sa-astepte",
    "title": plan["title"], "subtitle": plan.get("subtitle"),
    "series": "Viața Părintelui Cleopa · Micuțul Cleopa",
    "fps": timeline["fps"], "frames": timeline["end"], "format": [1280, 720],
    "timeline": "timeline.json",
    "audio": {"mix": "audio/mix.m4a", "music": "audio/music-bed.mp3", "voices": "audio/", "envelopes": "audio/envelopes.json"},
    "note": "Timpii sunt cadre la 24 fps (cadrul 1 = 0 s), ca pista audio și timeline.json. "
            "Pozițiile brațelor: încheietura și direcția degetelor în spațiul rigului (lib/engine/arm25d.js).",
    "sets": {z: {"asset": z} for z in ("sat", "ograda-zori", "dormitor", "ograda", "bucatarie")},
    "shots": shots,
    "cast": cast,
    "props": props,
    "overlays": [
        {"kind": "title", "shot": 0, "from": 1, "to": beats["sat"]["cues"][0]["start"]+2, "at": [-3.52, 2.65],
         "title": plan["title"], "subtitle": plan.get("subtitle"), "pop": [[1, .96], [18, 1], [-9, 1], [-1, .95]]},
        {"kind": "bubble", "shot": 3, "from": burta["start"], "to": burta["end"]+1, "text": "Ghiorrr!",
         "keys": [[burta["start"], -2.22, -.59, .73], [burta["start"]+5, -2.22, -.52, 1.06], [burta["end"], -2.22, -.49, .99]]},
    ],
    "logo": {"file": "/assets/branding/logo-scoala-mic.webp", "corner": "top-left"},
}


def clean(x):
    if isinstance(x, dict):
        return {k: clean(v) for k, v in x.items() if v is not None}
    if isinstance(x, list):
        return [clean(v) for v in x]
    return x


OUT.mkdir(parents=True, exist_ok=True)
(OUT/"episode.json").write_text(json.dumps(clean(episode), ensure_ascii=False, indent=1)+"\n")
shutil.copy(EPISODE/"timeline.json", OUT/"timeline.json")
print("EPISODE_JSON", (OUT/"episode.json").stat().st_size, len(cast), "actori", len(props), "obiecte")
