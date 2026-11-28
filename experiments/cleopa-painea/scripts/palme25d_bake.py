"""Coace brațele și palmele 2.5D ale personajelor marcate `palme25d` (faza 1: Mama).

Rulează pe episodul salvat, după build_episode.py:

    blender -b scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 \
        --python scripts/palme25d_bake.py

Pentru fiecare desen (cadrele impare, animație pe doi) scriptul citește din rig
încheietura proiectată, direcția osului mâinii, adâncimea și palma cheiate de
`arm_key`, plus desenul cerut de coregrafie (`hand_*_pose`). Reface proxy-ul 3D
(`palme25d.py`), îl proiectează și îl desenează plat (abordarea C) într-un obiect
`Palmă 2.5D · <personaj> · R/L` cu topologie fixă, copt în shape keys cu
interpolare constantă. În pozele ținute marcate de coregrafie (`p25_held`, mâna
la obraz), desenul de autor din `hands.py` (A) înlocuiește C, ancorat la punctul
de contact. Colțul baticului urmează vârful degetelor. Scriptul e idempotent.
"""
from math import atan2, cos, pi, sin
from pathlib import Path
import json
import sys

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_episode  # noqa: E402,F401  (adaugă scripturile cleopa-blender în sys.path)
from build_characters import DETAIL, INK  # noqa: E402
from hands import CONTACT, HAND_POSES  # noqa: E402
import palme25d as P  # noqa: E402
from vector_art import material  # noqa: E402

C_INDEX = len(HAND_POSES)        # hand_*_pose == 6: palma C; 0–5 sunt desenele A
NAIL = "fbd8bd"
TRANSITION = 4                   # cadre pentru trecerea între gesturi/orientări (2 desene)
HELD_MIN = 8                     # desene minime pentru o poză A (SPECIFICATIE §4)
TRAY = "Woven loaf platter"      # degetul mare trece în fața talerului
BREAD = "Round scored bread"
SCARF = "Colțul baticului ridicat"
# Mâna la față: antebrațul, manșeta și palma trec împreună în fața capului
# (păr, baticul ridicat), ca ordinea manșetă–palmă să rămână aceeași.
FACE_LIFT = .10
LIFT_KEY = "Mâna la față · antebraț în fața capului"
HEAD_PARTS = ("Face", "Front hair", "Hair silhouette", SCARF)
# Mâna pe masă: Mama stă în spatele mesei, dar își ține palmele pe blat (și sub talerul pe
# care îl așază). Cât mâna coboară sub muchia din spate a blatului, antebrațul, manșeta și
# palma trec în fața ștergarului și rămân în spatele talerului. Camera e ortografică, deci
# ridicarea în adâncime nu mută nimic pe ecran. Doar Mama din bucătărie stă la masă.
TABLE = "Table back and plank top"
CLOTH = "Embroidered linen tablecloth"
AT_TABLE = ("Mama · bucătărie",)
TABLE_GAP = .08          # unități ale rigului peste ștergar
TABLE_KEY = "Mâna pe masă · antebraț în fața mesei"


def ease(t):
    t = max(0., min(1., t))
    return t*t*(3-2*t)


def visible_range(coll, scene, windows=None):
    """Primul și ultimul cadru (exclusiv) în care se vede personajul; cu `windows`, doar acolo."""
    body = next(obj for obj in coll.objects if "Shirt and clothing panels" in obj.name)
    frames = []
    span = range(scene.frame_start, scene.frame_end+1)
    for frame in span if windows is None else [f for f in span if in_windows(f, windows)]:
        scene.frame_set(frame)
        if not body.hide_render:
            frames.append(frame)
    return (frames[0], frames[-1]+1) if frames else (0, 0)


def drawn(start, end):
    return [f for f in range(start, end) if f % 2]


def fcurve(rig, path):
    action = rig.animation_data.action
    from animate_prayer import channels
    return next((c for c in channels(rig, action) if c.data_path == path), None)


def gesture_source(rig, side):
    """Desenul ales de coregrafie la fiecare cadru. La prima rulare se copiază
    `hand_*_pose` în `p25_pose` pe osul mâinii, ca rescrierea C/A să fie reversibilă."""
    bone = rig.pose.bones["hand."+side]
    path = f'pose.bones["hand.{side}"]["p25_pose"]'
    if fcurve(rig, path) is None:
        source = fcurve(rig, f'["hand_{side}_pose"]')
        for key in source.keyframe_points:
            bone["p25_pose"] = int(round(key.co[1]))
            bone.keyframe_insert('["p25_pose"]', frame=key.co[0], group="Palme 2.5D")
        for key in fcurve(rig, path).keyframe_points:
            key.interpolation = "CONSTANT"
    return fcurve(rig, path)


class Levels:
    """Nivelurile de adâncime ale palmei, în spațiul rigului.

    `base`: sub vârful manșetei, deasupra antebrațului (manșeta acoperă încheietura);
    `top`: peste manșetă, pentru degetele care nu arată departe de cameră;
    `tray`: între taler și pâine, pentru degetul mare care ține talerul."""

    def __init__(self, coll, rig, side):
        sleeve = next(obj for obj in coll.objects if obj.name.split(".")[0].endswith("Mânecă continuă · "+side))
        cuff = max(v.co.z for v in sleeve.data.vertices)
        self.cuff = cuff
        self.values = {"base": cuff-.031, "top": cuff+.003}
        span = 4*len(P.PIECES)*P.EPSILON
        assert span < .029, "treptele palmei nu încap sub manșetă"
        tray, bread = bpy.data.objects.get(TRAY), bpy.data.objects.get(BREAD)
        if tray and bread:
            top = max((tray.matrix_world @ v.co).z for v in tray.data.vertices)
            low = min((bread.matrix_world @ v.co).z for v in bread.data.vertices)
            self.tray_world = (top+low)/2
        else:
            self.tray_world = None
        self.rig = rig
        table, cloth = bpy.data.objects.get(TABLE), bpy.data.objects.get(CLOTH)
        self.table_lift = 0.
        if table and cloth and coll.name in AT_TABLE:
            m = rig.matrix_world
            self.table_edge = max((table.matrix_world @ v.co).y for v in table.data.vertices)
            front = max((cloth.matrix_world @ v.co).z for v in cloth.data.vertices)
            self.table_lift = (front-m.translation.z)/m.to_scale().z+TABLE_GAP-self.values["base"]
            assert self.table_lift < 10, "ridicarea pe masă depășește valoarea maximă a cheii"
            if self.tray_world is not None:
                tray = (self.tray_world-m.translation.z)/m.to_scale().z
                assert self.values["top"]+self.table_lift+.03 < tray, "mâna de pe masă nu încape sub taler"

    def on_table(self, verts):
        """Mâna coboară sub muchia din spate a blatului (vârfurile, în lume)."""
        if not self.table_lift:
            return False
        m = self.rig.matrix_world
        return min((m @ Vector((v[0], v[1], 0))).y for v in verts) < self.table_edge

    def at(self, frame, over_tray, lift=0.):
        values = {k: v+lift for k, v in self.values.items()}
        values["tray"] = values["top"]
        if over_tray and self.tray_world is not None:
            m = self.rig.matrix_world
            values["tray"] = (self.tray_world-m.translation.z)/m.to_scale().z-2*P.SLOTS*P.EPSILON
        return values


def hand_frame(rig, p, side, frame, state):
    """Proxy-ul unei mâini la un cadru: puncte 3D, orientare, gest, cu tranziții netede."""
    bone = rig.pose.bones["hand."+side]
    wrist = bone.head.xy.copy()
    direction = (bone.tail.xy-bone.head.xy).normalized()
    depth = bone.get("p25_depth", 0.)
    palm = tuple(bone.get("p25_palm", (0, 0, 0)))
    # Citit din curbă: o curbă creată în aceeași sesiune (gesture_source) nu e încă
    # evaluată de depsgraph, iar proprietatea osului ar păstra ultima valoare scrisă.
    curve = fcurve(rig, f'pose.bones["hand.{side}"]["p25_pose"]')
    pose = HAND_POSES[int(round(curve.evaluate(frame) if curve else bone.get("p25_pose", 0)))]
    if sum(abs(v) for v in palm) < 1e-9:
        palm = P.default_palm(pose, side)
    q_target = P.orientation((direction.x, direction.y), palm, side)
    g_target = P.GESTURES[P.POSE_GESTURE[pose]]
    key = (pose, tuple(round(v, 3) for v in palm))
    if state.get("key") != key:
        if "q" in state:
            state.update(start=frame, q0=state["q"], g0=state["g"])
        state["key"] = key
    if "start" in state and frame-state["start"] < TRANSITION:
        t = ease((frame-state["start"])/TRANSITION)
        q = P.slerp(state["q0"], q_target, t)
        g = P.mix_gesture(state["g0"], g_target, t)
    else:
        q, g = q_target, g_target
    state["q"], state["g"] = q, g
    # Pașii mută osul `root`, deci și umărul: IK-ul se rezolvă față de umărul de repaus
    # și se mută cu deplasarea lui.
    sign = P.side_sign(side)
    delta = rig.pose.bones["upper_arm."+side].head.xy-Vector((sign*p["shoulder_x"], p["shoulder_y"]))
    elbow = tuple(bone.get("p25_elbow", ())) or None
    local = P.arm_points(p, side, (wrist.x-delta.x, wrist.y-delta.y), depth, exact=elbow)
    arm = {k: ((v[0]+delta.x, v[1]+delta.y, v[2]) if k in "SEW" else v) for k, v in local.items()}
    hand = P.hand_rig(p, side, arm["W"], q, g, (delta.x, delta.y))
    return {"arm": arm, "rig": hand, "pose": pose, "wrist": wrist, "direction": direction,
            "held": bool(round(bone.get("p25_held", 0))),
            "bend": abs(P.lift_angle(0, bone.rotation_euler.z))}


def build_c(p, side, frame_data, memory):
    h = P.project_rig(frame_data["rig"], P.camera_for(side))
    h["k"] = P.HAND_PER_CM*p["hand"]
    built = P.build_volume(h, memory=memory, hand=P.hand_of(p), lw=.029*p["hand"])
    return h, built


BEND_FRONT = 35*pi/180   # încheietura îndoită peste atât: palma iese în fața manșetei


def level_rule(h, over_tray, data=None):
    """Degetele care arată departe de cameră (y.z < −0,35) trec sub manșetă (SPECIFICATIE §5).

    Cu încheietura dreaptă, baza palmei stă sub vârful manșetei (manșeta acoperă încheietura).
    Cu încheietura îndoită tare, palma se întoarce peste manșetă: sub ea, manșeta cu cusătura
    tăia palma în două (Tata cu mâna ridicată, Mihai cu cartea pe palmă). Atunci toată
    palma stă în fața manșetei, cu excepția degetelor care arată departe de cameră."""
    away = h["axes"]["y"][2] < -.35
    bent = data is not None and data.get("bend", 0) > BEND_FRONT

    def level_of(group, rank, palm_rank):
        if over_tray and group["id"].startswith("mare") and group["id"] != "mare0":
            return "tray"
        if (rank > palm_rank or bent) and not away:
            return "top"
        return "base"
    return level_of


def c_object(name, coll, rig, p, side):
    topo = P.TOPOLOGY
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([(0, 0, 0)]*topo["count"], [], topo["faces"])
    for color in (INK, p["skin"], p["skin_shadow"], NAIL, DETAIL):
        mesh.materials.append(material(color))
    mesh.polygons.foreach_set("material_index", topo["materials"])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    obj.parent = rig
    obj.matrix_parent_inverse.identity()
    obj["cleopa_palme25d"] = True
    obj["cleopa_bone"] = "hand."+side
    return obj


def bake_constant(obj, samples):
    """Shape keys pe desene, cu interpolare constantă: trecerea liniară ar topi piesele.

    Fiecare desen distinct devine o cheie; la fiecare desen exact o cheie are valoarea 1.
    Fiecare cheie primește o valoare la primul desen și la fiecare schimbare."""
    flat = [[c for point in coords for c in point] for _, coords in samples]
    obj.data.vertices.foreach_set("co", flat[0])
    obj.data.update()
    if all(f == flat[0] for f in flat):
        return 0
    obj.shape_key_add(name="Basis")
    targets, states = {}, []
    for (frame, _), values in zip(samples, flat):
        signature = tuple(round(v, 6) for v in values)
        if signature not in targets:
            shape = obj.shape_key_add(name=f"Desen_{frame:04}")
            shape.data.foreach_set("co", values)
            targets[signature] = shape
        states.append((frame, targets[signature]))
    for shape in targets.values():
        previous = None
        for frame, current in states:
            value = float(current == shape)
            if value != previous:
                shape.value = value
                shape.keyframe_insert("value", frame=frame)
                previous = value
    for curve in obj.data.shape_keys.animation_data.action.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = "CONSTANT"
    return len(targets)


def gate_driver(obj, rig, side, start, end):
    for attr in ("hide_render", "hide_viewport"):
        driver = obj.driver_add(attr).driver
        driver.type = "SCRIPTED"
        variable = driver.variables.new()
        variable.name = "variant"
        variable.type = "SINGLE_PROP"
        variable.targets[0].id = rig
        variable.targets[0].data_path = f'["hand_{side}_pose"]'
        driver.expression = f"variant != {C_INDEX} or frame < {start} or frame >= {end}"


def rewrite_pose(rig, side, values):
    """`hand_*_pose`: 6 (C) în afara pozelor ținute, indicele desenului A în ele."""
    path = f'["hand_{side}_pose"]'
    curve = fcurve(rig, path)
    curve.keyframe_points.clear()
    previous = None
    for frame, value in values:
        if value != previous:
            rig[f"hand_{side}_pose"] = value
            rig.keyframe_insert(path, frame=frame, group="Drawing variants")
            previous = value
    for point in fcurve(rig, path).keyframe_points:
        point.interpolation = "CONSTANT"
    ui = rig.id_properties_ui(f"hand_{side}_pose")
    ui.update(min=0, max=C_INDEX, description=" / ".join(f"{i} {v}" for i, v in enumerate(HAND_POSES))
              + f" / {C_INDEX} palmă 2.5D (C)")


def drawing_of(coll, side, pose):
    return next(obj for obj in coll.objects if obj.name.split(".")[0].endswith(f"{pose} hand · {side}"))


def rest_contact(rig, p, side, pose):
    """Punctul de contact al desenului A în spațiul de repaus al rigului."""
    sign = P.side_sign(side)
    x = sign*p["shoulder_x"]
    y = p["shoulder_y"]-p["upper"]-p["lower"]
    cx, cy = CONTACT[pose]
    return Vector((x+cx*p["hand"]*sign, y+cy*p["hand"])), Vector((x, y))


def finger_angle(axes):
    """Unghiul desenului A în convenția oaselor, direcția (sin θ, −cos θ), din `screenUp`.

    `screenUp` primește axele cu y în sus (ca `cam.d`) și întoarce ψ, rotația pe
    ecran (y în jos) a unui desen cu degetele în sus: degetele arată spre
    (sin ψ, −cos ψ) pe ecran, adică (sin ψ, cos ψ) în rig, deci θ = π − ψ."""
    return P.pi-P.screen_up(axes)


def anchor_matrix(contact, c_rest, angle):
    """Rotește desenul în jurul contactului lui de repaus și îl lipește pe contactul proxy-ului."""
    rot = Matrix.Rotation(angle, 4, "Z")
    move = Matrix.Translation((contact[0], contact[1], 0))
    back = Matrix.Translation((-c_rest.x, -c_rest.y, 0))
    return move @ rot @ back


def key_matrix(obj, frame, matrix):
    loc, rot, scale = matrix.decompose()
    obj.location = loc
    obj.rotation_euler = rot.to_euler("XYZ")
    obj.scale = scale
    for attr in ("location", "rotation_euler", "scale"):
        obj.keyframe_insert(attr, frame=frame, group="Ancorare la contact")


def constant_keys(obj):
    for curve in obj.animation_data.action.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = "CONSTANT"


def reparent_to_rig(obj, rig):
    """Desenul legat de un os devine un obiect ancorat în spațiul rigului."""
    if obj.parent_type == "BONE":
        obj.parent_type = "OBJECT"
        obj.parent_bone = ""
        obj.matrix_parent_inverse.identity()
        obj.location = (0, 0, 0)
        obj.rotation_euler = (0, 0, 0)
        obj.scale = (1, 1, 1)


def held_runs(frames, held):
    runs, current = [], []
    for frame in frames:
        if held[frame]:
            current.append(frame)
        elif current:
            runs.append(current)
            current = []
    if current:
        runs.append(current)
    return [run for run in runs if len(run) >= HELD_MIN]


def head_box(coll, rig):
    """Cutia 2D (spațiul rigului) a capului desenat, în poza curentă."""
    points = []
    graph = bpy.context.evaluated_depsgraph_get()
    inverse = rig.matrix_world.inverted()
    for obj in coll.objects:
        if obj.type == "MESH" and any(part in obj.name for part in HEAD_PARTS):
            evaluated = obj.evaluated_get(graph)
            if evaluated.hide_render and SCARF in obj.name:
                continue
            m = inverse @ evaluated.matrix_world
            points += [(m @ Vector(c)).xy for c in evaluated.bound_box]
    xs, ys = [p.x for p in points], [p.y for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def overlaps_head(verts, box):
    x0, y0, x1, y1 = box
    return any(x0 < v[0] < x1 and y0 < v[1] < y1 for v in verts[::7])


def lift_parts(coll, side):
    """Mâneca și cusătura manșetei; mâneca primește o cheie care ridică antebrațul."""
    sleeve = next(obj for obj in coll.objects if obj.name.split(".")[0].endswith("Mânecă continuă · "+side))
    stitches = [obj for obj in coll.objects if obj.name.split(".")[0].endswith("Cusătură la manșetă · "+side)]
    return sleeve, stitches


def add_lift(sleeve, rig, p, side):
    """Două chei pe mânecă, fiecare cu o deplasare de o unitate; valoarea cheii e ridicarea.

    La față ridicarea începe după jumătatea brațului (umărul rămâne sub corsaj). Pe masă
    trece în față doar antebrațul, de la cot: ridicat de la jumătatea brațului, marginea
    interioară a mânecii ieșea peste cămașă și desena o cută neagră la subraț."""
    keys = sleeve.data.shape_keys
    for name in (LIFT_KEY, TABLE_KEY):
        if keys and name in keys.key_blocks:
            sleeve.shape_key_remove(keys.key_blocks[name])
    if sleeve.data.shape_keys and len(sleeve.data.shape_keys.key_blocks) == 1:
        sleeve.shape_key_remove(sleeve.data.shape_keys.key_blocks[0])
    if not sleeve.data.shape_keys:
        sleeve.shape_key_add(name="Basis")
    top, upper = p["shoulder_y"], p["upper"]
    made = []
    for name, start, span in ((LIFT_KEY, .45, .40), (TABLE_KEY, .88, .20)):
        key = sleeve.shape_key_add(name=name)
        key.slider_max = 10.    # Blender limitează valoarea la 10; pe masă ridicarea e ~6
        for vertex, point in zip(sleeve.data.vertices, key.data):
            t = ease((top-vertex.co.y-start*upper)/(span*upper))
            point.co = vertex.co+Vector((0, 0, t))
        key.value = 0
        made.append(key)
    return made


def remove_previous(coll, rig):
    for obj in list(coll.objects):
        if obj.get("cleopa_palme25d"):
            bpy.data.objects.remove(obj, do_unlink=True)


def bake_actor(scene, rig, report):
    name = rig.name[4:]
    coll = bpy.data.collections[name]
    p = json.loads(rig["palme25d_profile"])
    start, end = visible_range(coll, scene, WINDOWS)
    if start == end:
        return
    remove_previous(coll, rig)
    frames = [f for f in drawn(start, end) if in_windows(f, WINDOWS)]
    if not frames:
        return
    record = {"actor": name, "start": start, "end": end, "sides": {}}
    for side in ("R", "L"):
        gesture_source(rig, side)
        levels = Levels(coll, rig, side)
        sleeve, stitches = lift_parts(coll, side)
        face_key, table_key = add_lift(sleeve, rig, p, side)
        state, memory = {}, {"__stable__": P.ORDER_HYSTERESIS}
        samples, info = [], {}
        for frame in frames:
            scene.frame_set(frame)
            data = hand_frame(rig, p, side, frame, state)
            h, built = build_c(p, side, data, memory)
            over_tray = data["pose"] == "cup" and not data["held"] and levels.tray_world is not None \
                and name == "Mama · bucătărie" and frame < build_episode.beat_frame("cuptor", .78)+1
            probe = P.layered_vertices(built, levels.at(frame, over_tray), level_rule(h, over_tray, data))
            lifted = overlaps_head(probe, head_box(coll, rig))
            lift = FACE_LIFT if lifted else 0.
            table = levels.on_table(probe)
            if table:
                lifted, lift = True, levels.table_lift
            verts = P.layered_vertices(built, levels.at(frame, over_tray, lift), level_rule(h, over_tray, data)) \
                if lifted else probe
            samples.append((frame, verts))
            info[frame] = {"data": data, "h": h, "built": built, "verts": verts, "lift": lift,
                           "table": table}
        previous = None
        for frame in frames:
            value = info[frame]["lift"]
            if value != previous:
                on_table = info[frame]["table"]
                for key, amount in ((face_key, 0. if on_table else value), (table_key, value if on_table else 0.)):
                    key.value = amount
                    key.keyframe_insert("value", frame=frame)
                for obj in stitches:
                    obj.delta_location.z = value
                    obj.keyframe_insert("delta_location", index=2, frame=frame, group="Mâna la față")
                previous = value
        for owner in [sleeve.data.shape_keys]+stitches:
            for curve in owner.animation_data.action.fcurves:
                for point in curve.keyframe_points:
                    point.interpolation = "CONSTANT"
        obj = c_object(f"Palmă 2.5D · {name} · {side}", coll, rig, p, side)
        shapes = bake_constant(obj, samples)
        gate_driver(obj, rig, side, start, end)
        held = {f: info[f]["data"]["held"] for f in frames}
        runs = held_runs(frames, held)
        a_frames = {f for run in runs for f in run}
        values = []
        for frame in frames:
            pose = info[frame]["data"]["pose"]
            values.append((frame, HAND_POSES.index(pose) if frame in a_frames else C_INDEX))
        rewrite_pose(rig, side, [(start, values[0][1])]+values[1:])
        # A: desenele de autor, ancorate la contact în pozele ținute.
        anchored = {}
        for frame in sorted(a_frames):
            d = info[frame]
            pose = d["data"]["pose"]
            obj_a = drawing_of(coll, side, pose)
            reparent_to_rig(obj_a, rig)
            c_rest, _ = rest_contact(rig, p, side, pose)
            contact = d["h"]["contact"]
            angle = finger_angle(d["h"]["axes"])
            key_matrix(obj_a, frame, Matrix.Translation((0, 0, d["lift"])) @ anchor_matrix(contact, c_rest, angle))
            anchored.setdefault(obj_a.name, obj_a)
        for obj_a in anchored.values():
            constant_keys(obj_a)
        lifted = [f for f in frames if info[f]["lift"]]
        record["sides"][side] = {"frames": len(frames), "shapes": shapes, "held": [[r[0], r[-1]] for r in runs],
                                 "face": len(lifted)}
        report.setdefault("_info", {})[(name, side)] = info
    scarf(scene, rig, coll, report)
    report["actors"].append(record)
    print("PALME25D", name, json.dumps(record["sides"], ensure_ascii=False), flush=True)


def scarf(scene, rig, coll, report):
    """Colțul baticului ridicat urmează vârful degetelor (mâna dreaptă), nu capul."""
    corners = [obj for obj in coll.objects if obj.name.split(".")[0].endswith(SCARF)]
    info = report["_info"].get((rig.name[4:], "R"), {})
    for obj in corners:
        frames = []
        for frame in sorted(info):
            scene.frame_set(frame)
            if not obj.hide_render:
                frames.append(frame)
        if not frames:
            continue
        # Coordonatele desenului sunt în spațiul de repaus al rigului.
        reparent_to_rig(obj, rig)
        head = rig.pose.bones["head"]
        bone_rest = rig.data.bones["head"].matrix_local
        first = frames[0]
        scene.frame_set(first)
        deform = head.matrix @ bone_rest.inverted()
        contact = Vector((*info[first]["h"]["contact"][:2], 0))
        # Punctul de prindere: vârful baticului cel mai apropiat de contact la primul desen.
        grip = min((v.co for v in obj.data.vertices), key=lambda co: ((deform @ co).xy-contact.xy).length).copy()
        obj["cleopa_grip"] = tuple(grip)
        for frame in frames:
            scene.frame_set(frame)
            deform = head.matrix @ bone_rest.inverted()
            linear = deform.to_3x3().to_4x4()
            tip = info[frame]["h"]["contact"]
            placed = linear @ grip
            matrix = Matrix.Translation((tip[0]-placed.x, tip[1]-placed.y, 0)) @ linear
            key_matrix(obj, frame, matrix)
        constant_keys(obj)
        obj["cleopa_palme25d_scarf"] = True


def bake_options():
    """`-- [--frames 3280-3310,2590-2600] [--out copie.blend]`: o coacere doar pe ferestrele
    de cadre cerute (pentru `npm run cadru`), salvată într-o copie. Fără `--frames`,
    tot filmul. O coacere parțială se marchează în scenă (`coacere_partiala`)."""
    args = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    values = dict(zip(args[::2], args[1::2]))
    windows = None
    if "--frames" in values:
        windows = [tuple(map(int, span.split("-"))) for span in values["--frames"].split(",")]
    return windows, values.get("--out")


def in_windows(frame, windows):
    return windows is None or any(lo <= frame <= hi for lo, hi in windows)


def save(windows, out):
    scene = bpy.context.scene
    if windows is not None:
        scene["coacere_partiala"] = True
    if out:
        bpy.ops.wm.save_as_mainfile(filepath=out, compress=True, copy=True)
    else:
        assert windows is None, "o coacere parțială se salvează doar într-o copie (--out)"
        bpy.ops.wm.save_mainfile(compress=True)


WINDOWS = None


def main():
    global WINDOWS
    WINDOWS, out = bake_options()
    scene = bpy.context.scene
    report = {"actors": []}
    rigs = [obj for obj in scene.objects if obj.type == "ARMATURE" and obj.get("palme25d_profile")]
    assert rigs, "niciun personaj marcat palme25d"
    for rig in rigs:
        bake_actor(scene, rig, report)
    scene.frame_set(scene.frame_start)
    save(WINDOWS, out)


if __name__ == "__main__":
    main()
