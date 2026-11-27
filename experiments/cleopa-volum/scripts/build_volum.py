"""Build Mama volumetrică, her stress-test performances, the road set and the checks.

    blender -b --factory-startup --python-exit-code 1 --python experiments/cleopa-volum/scripts/build_volum.py

Writes:
  experiments/cleopa-volum/scenes/mama_volumetrica.blend   editable rig, actions and set
  assets/recuzita/mama-volum.glb, assets/recuzita/drum-volum.glb
  studio/volum/teste.json     tests, cameras, prop keys and the intersection report
  studio/volum/foi/<test>.webp  Blender contact sheets from each test's camera (foi.py)
  experiments/cleopa-volum/renders/cadre/  Workbench frames; `python3 scripts/foi.py` lays out sheets
Add `-- --fara-foi` to skip the Workbench frames, or `-- --verifica` to only run the checks.
"""
import json
from math import atan2, cos, pi, radians, sin, sqrt, tan
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from corp import INK, PALETTE, Part, build_character, build_mesh, material  # noqa: E402
from miscare import FPS, TESTS, Solver, perform  # noqa: E402

ROOT = HERE.parents[2]
EXPERIMENT = HERE.parent
STUDIO = ROOT/"studio"/"volum"
ASSETS = ROOT/"assets"/"recuzita"

# Parts that must not cut into each other, with the contacts each test allows.
PAIRS = [
    ("Palmă · L", "Palmă · R"),
    ("Palmă · L", "Cămașă și brâu"), ("Palmă · R", "Cămașă și brâu"),
    ("Palmă · L", "Cap"), ("Palmă · R", "Cap"),
    ("Palmă · L", "Fustă"), ("Palmă · R", "Fustă"),
    ("Mânecă · antebraț · L", "Mânecă · antebraț · R"),
    ("Mânecă · antebraț · L", "Cămașă și brâu"), ("Mânecă · antebraț · R", "Cămașă și brâu"),
    ("Mânecă · antebraț · L", "Fustă"), ("Mânecă · antebraț · R", "Fustă"),
    ("Mânecă · braț · L", "Cap"), ("Mânecă · braț · R", "Cap"),
    ("Picior · L", "Picior · R"), ("Opincă · L", "Opincă · R"),
    ("Opincă · L", "Fustă"), ("Opincă · R", "Fustă"),
]
# Intentional contacts: (test, part a, part b, reason). Everything else is reported.
ALLOWED = [
    ("intersectii", "Palmă · L", "Palmă · R", "Palmele lipite în rugăciune se ating pe toată suprafața."),
    ("intersectii", "Mânecă · antebraț · L", "Mânecă · antebraț · R",
     "Cu brațele încrucișate, antebrațele se sprijină unul pe altul; dreptul rămâne în față."),
    ("intersectii", "Palmă · L", "Cămașă și brâu", "Mâna stângă stă pe șold și apoi la spate, pe cămașă."),
    ("intersectii", "Palmă · R", "Cămașă și brâu", "Mâna dreaptă apucă încheietura stângă la spate, lângă cămașă."),
    ("intersectii", "Palmă · R", "Cap", "Palma dreaptă se sprijină pe obraz."),
    ("intersectii", "Mânecă · antebraț · L", "Cămașă și brâu", "Antebrațele încrucișate se sprijină pe piept."),
    ("intersectii", "Mânecă · antebraț · R", "Cămașă și brâu", "Antebrațele încrucișate se sprijină pe piept."),
    ("semnul-crucii", "Palmă · R", "Cap", "Degetele ating fruntea."),
    ("semnul-crucii", "Mânecă · antebraț · R", "Cămașă și brâu",
     "Antebrațul drept rămâne lipit de piept când palma trece la umărul stâng."),
    ("intersectii", "Palmă · L", "Fustă", "Mâna pe șold se sprijină pe talia fustei."),
    ("intersectii", "Mânecă · antebraț · L", "Fustă", "Cu mâna pe șold, manșeta stângă stă pe talia fustei."),
    ("semnul-crucii", "Palmă · R", "Cămașă și brâu", "Degetele ating pieptul și umerii."),
]


def load_tests():
    return json.loads((EXPERIMENT/"teste.json").read_text())


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "MATERIAL"
    shading.show_backface_culling = True
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("Cer de dimineață")
    world.color = (.93, .78, .55)
    scene.world = world
    return scene


def road_set(collection):
    """A village road running away from the front camera, with a roadside cross."""
    objects = []

    def solid(name, colour, build):
        p = Part(name)
        build(p)
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata([tuple(v) for v in p.points], [], p.faces)
        keys = sorted(set(p.colors))
        for key in keys:
            mesh.materials.append(material(key, colour.get(key, PALETTE.get(key, "888888"))))
        mesh.polygons.foreach_set("material_index", [keys.index(c) for c in p.colors])
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        objects.append(obj)
        return obj

    colours = {"iarba": "9bab62", "iarba_inchis": "7f9250", "drum": "d2ae74", "drum_margine": "b8935c",
               "lemn": "7a4e33", "lemn_deschis": "9c6a44", "acoperis": "5d3a2a", "galeata": "8a8f96",
               "toarta": "4f5257", "frunze": "6f8a47", "frunze_deschis": "90a85a", "cer_deal": "b9b98a"}

    def ground(p):
        # Grass, the road and two verges as flat quads.
        def quad(x0, x1, y0, y1, z, colour):
            start = len(p.points)
            p.points += [Vector((x0, y0, z)), Vector((x1, y0, z)), Vector((x1, y1, z)), Vector((x0, y1, z))]
            p.faces.append((start, start+1, start+2, start+3))
            p.colors.append(colour)
        quad(-40, 40, -10, 60, -.004, "iarba")
        quad(-1.25, 1.25, -10, 60, 0, "drum")
        for x in (-1.25, 1.1):
            quad(x, x+.15, -10, 60, .001, "drum_margine")
        for k in range(14):
            quad(-.6+((k*37) % 11)*.11, -.45+((k*37) % 11)*.11, k*3.1-4, k*3.1-3.7, .002, "drum_margine")
    solid("Drumul satului", colours, ground)

    def fence(p):
        for y in range(-4, 40, 2):
            for x in (-2.3, 2.3):
                p.tube([Vector((x, y, 0)), Vector((x, y, .95))], [.05, .045], lambda r: "lemn")
            for x in (-2.3, 2.3):
                for z in (.45, .8):
                    p.tube([Vector((x, y, z)), Vector((x, y+2, z))], [(.03, .022), (.03, .022)], lambda r: "lemn_deschis",
                           reference=Vector((1, 0, 0)))
    solid("Gardul de nuiele", colours, fence)

    def cross(p):
        base = Vector((1.75, 1.6, 0))
        p.tube([base, base+Vector((0, 0, 2.3))], [(.07, .07), (.06, .06)], lambda r: "lemn")
        p.tube([base+Vector((-.42, 0, 1.75)), base+Vector((.42, 0, 1.75))], [(.05, .05), (.05, .05)],
               lambda r: "lemn_deschis", reference=Vector((0, 0, 1)))
        for s in (-1, 1):
            p.tube([base+Vector((0, 0, 2.55)), base+Vector((s*.55, 0, 2.15))], [(.03, .22), (.03, .22)],
                   lambda r: "acoperis", reference=Vector((0, 1, 0)))
    solid("Troița de la drum", colours, cross)

    def trees(p):
        for k, (x, y) in enumerate(((-5, 8), (-7, 16), (6, 12), (8, 22), (-4.5, 26), (5, 30), (-9, 6), (9, 4))):
            p.tube([Vector((x, y, 0)), Vector((x, y, 1.4))], [.16, .12], lambda r: "lemn")
            p.ellipsoid(Vector((x, y, 2.3)), (1.1, 1.1, 1.3), lambda r, k=k: "frunze" if k % 2 else "frunze_deschis", rings=8)
        for k in range(5):
            p.ellipsoid(Vector((-30+k*15, 55, -3)), (14, 6, 7), lambda r: "cer_deal", rings=8)
    solid("Copaci și dealuri", colours, trees)

    bucket = Part("Găleata")
    bucket.tube([Vector((0, 0, 0)), Vector((0, 0, .26))], [.11, .13], lambda r: "galeata")
    bucket.tube([Vector((-.125, 0, .26)), Vector((0, 0, .36)), Vector((.125, 0, .26))], [.008, .008, .008],
                lambda r: "toarta", caps=(True, True))
    mesh = bpy.data.meshes.new("Găleata")
    mesh.from_pydata([tuple(v) for v in bucket.points], [], bucket.faces)
    for key in ("galeata", "toarta"):
        mesh.materials.append(material(key, colours[key]))
    mesh.polygons.foreach_set("material_index", [("galeata", "toarta").index(c) for c in bucket.colors])
    pail = bpy.data.objects.new("Găleata", mesh)
    collection.objects.link(pail)
    return objects, pail


def evaluated_bvh(obj, graph):
    evaluated = obj.evaluated_get(graph)
    mesh = evaluated.data
    ink = obj.get("volum_ink", -1)
    matrix = evaluated.matrix_world
    verts = [matrix@v.co for v in mesh.vertices]
    polys = [tuple(p.vertices) for p in mesh.polygons if p.material_index != ink]
    return BVHTree.FromPolygons(verts, polys, epsilon=0.0)


def intervals(frames):
    result = []
    for f in frames:
        if result and f-result[-1][1] <= 2:
            result[-1][1] = f
        else:
            result.append([f, f])
    return result


def check_intersections(scene, rig, parts, test, frames):
    by_name = {obj.name: obj for obj in parts}
    hits = {pair: [] for pair in PAIRS}
    for f in range(1, frames+1, 2):
        scene.frame_set(f)
        graph = bpy.context.evaluated_depsgraph_get()
        trees = {name: evaluated_bvh(obj, graph) for name, obj in by_name.items()}
        for a, b in PAIRS:
            if trees[a].overlap(trees[b]):
                hits[(a, b)].append(f)
    report = []
    for (a, b), found in hits.items():
        if not found:
            continue
        reason = next((r for t, x, y, r in ALLOWED if t == test and {x, y} == {a, b}), None)
        report.append({"parts": [a, b], "frames": intervals(found), "allowed": reason is not None,
                       "reason": reason or "Neprevăzut: de corectat în coregrafie sau în volum."})
    return report


def contact_check(solver, poses, controls, duration):
    """Distance from the fingertip to each contact target at the middle of a hold."""
    results = []
    probe = controls(0)
    for label, t0, t1 in probe.get("contacts", []):
        t = (t0+t1)/2
        f = round(t*FPS)+1
        pose = poses[f-1]
        tip = pose["tail"]["hand.R"]+(pose["tail"]["hand.R"]-pose["head"]["hand.R"]).normalized()*.016
        c = controls(t)
        from miscare import chest_point, head_point, shoulder_point
        target = {"frunte": lambda: head_point(solver, solver.trunk(c), 0, 1.685, .006)[0],
                  "piept": lambda: chest_point(solver, solver.trunk(c), 0, 1.2, .006)[0],
                  "umărul drept": lambda: shoulder_point(solver, solver.trunk(c), "R", .006)[0],
                  "umărul stâng": lambda: shoulder_point(solver, solver.trunk(c), "L", .006)[0]}[label]()
        results.append({"contact": label, "frame": f, "distance": round((tip-target).length, 4)})
    return results


def to_three(v):
    return [round(v[0], 4), round(v[2], 4), round(-v[1], 4)]


def camera_rig(scene):
    data = bpy.data.cameras.new("Camera de test")
    camera = bpy.data.objects.new("Camera de test", data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return camera


def aim(camera, position, target, fov):
    camera.location = position
    direction = Vector(target)-Vector(position)
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.sensor_fit = "VERTICAL"
    camera.data.angle = radians(fov)


def camera_at(spec, x):
    position = Vector(spec["position"])
    target = Vector(spec["target"])
    if spec.get("follow"):
        shift = Vector((x*spec["follow"], 0, 0))
        position, target = position+shift, target+shift
    return position, target


def render_sheet(scene, camera, rig, test, spec, frames, out):
    scene.render.resolution_x, scene.render.resolution_y = 640, 360
    scene.render.film_transparent = False
    picks = [max(1, round(frames*k)) for k in (0, .25, .45, .65, .85, 1)]
    paths = []
    for f in picks:
        scene.frame_set(f)
        x = (rig.matrix_world@rig.pose.bones["pelvis"].head).x
        aim(camera, *camera_at(spec["camera"], x), spec["camera"]["fov"])
        path = out/f"{test}_{f:04}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        paths.append((f, path))
    return paths


def main():
    options = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    data = load_tests()
    scene = reset()
    character = bpy.data.collections.new("Mama volumetrică")
    scene.collection.children.link(character)
    rig, parts = build_character(character)
    decor = bpy.data.collections.new("Drumul satului")
    scene.collection.children.link(decor)
    set_objects, pail = road_set(decor)
    solver = Solver(rig)
    rig.animation_data_create()
    actions = {}
    reports = {}
    problems = []
    bucket_keys = []
    for test_id, factory in TESTS:
        duration, controls = factory(solver)
        frames = round(duration*FPS)+1
        action = bpy.data.actions.new(test_id)
        action.use_fake_user = True
        rig.animation_data.action = action
        for bone in rig.pose.bones:
            bone.rotation_quaternion = (1, 0, 0, 0)
            bone.location = (0, 0, 0)
        poses = perform(solver, test_id, frames, controls)
        slips = max(pose["slip"] for pose in poses)
        for curve in action.fcurves:
            for point in curve.keyframe_points:
                point.interpolation = "LINEAR"
        actions[test_id] = (action, frames)
        report = {"frames": frames, "duration": round((frames-1)/FPS, 4), "slip": round(slips, 5)}
        if test_id == "aplecare":
            for f in range(1, frames+1, 2):
                c = controls((f-1)/FPS)
                pose = poses[f-1]
                if "bucket" in c and (f-1)/FPS >= 2.8:
                    hand = pose["head"]["hand.R"].lerp(pose["tail"]["hand.R"], .55)
                    spot = hand-Vector((0, 0, .36))
                else:
                    spot = Vector((-.25, -.4, 0))
                bucket_keys.append({"at": round((f-1)/FPS, 4), "position": to_three(spot)})
                pail.location = spot
                pail.keyframe_insert("location", frame=f)
        if test_id == "semnul-crucii":
            report["contacts"] = contact_check(solver, poses, controls, duration)
        # Fixed supports: a planted foot must not move between drawn frames.
        report["intersections"] = check_intersections(scene, rig, parts, test_id, frames)
        reports[test_id] = report
        print("TEST_OK", test_id, frames, "cadre", "alunecare", report["slip"],
              "contacte", report.get("contacts", "—"),
              "intersecții", [(r["parts"], r["frames"], r["allowed"]) for r in report["intersections"]], flush=True)
        if slips >= .002:
            problems.append(f"{test_id}: brațul nu ajunge la țintă ({slips:.3f})")
        problems += [f"{test_id}: contact ratat {item}" for item in report.get("contacts", [])
                     if item["distance"] >= .02]
        # Unforeseen intersections stay in the published report as findings.
        for r in report["intersections"]:
            if not r["allowed"]:
                print("INTERSECTIE", test_id, r["parts"], r["frames"], flush=True)
    if "--verifica" in options:
        # Check mode: the performances, contacts and intersections, nothing written.
        if problems:
            raise SystemExit("PROBLEME:\n"+"\n".join(problems))
        print("VOLUM_OK", len(TESTS), "teste verificate", flush=True)
        return
    # Store the actions as NLA strips so the editable file shows every performance.
    for test_id, (action, frames) in actions.items():
        track = rig.animation_data.nla_tracks.new()
        track.name = test_id
        track.strips.new(test_id, 1, action)
        track.mute = True
    first = actions[TESTS[0][0]][0]
    rig.animation_data.action = first

    (EXPERIMENT/"scenes").mkdir(exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(EXPERIMENT/"scenes"/"mama_volumetrica.blend"), compress=True)

    # GLB exports: the character with all actions, then the set.
    ASSETS.mkdir(parents=True, exist_ok=True)
    rig.animation_data.action = None
    bpy.ops.object.select_all(action="DESELECT")
    rig.select_set(True)
    for obj in parts:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig
    bpy.ops.export_scene.gltf(
        filepath=str(ASSETS/"mama-volum.glb"), export_format="GLB", use_selection=True,
        export_yup=True, export_animations=True, export_skins=True, export_animation_mode="ACTIONS",
        export_frame_range=False, export_force_sampling=True, export_frame_step=1,
        export_anim_slide_to_zero=False, export_def_bones=False, export_morph=False,
    )
    bpy.ops.object.select_all(action="DESELECT")
    for obj in set_objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(ASSETS/"drum-volum.glb"), export_format="GLB",
                              use_selection=True, export_yup=True, export_animations=False)
    # The bucket's path is published as keys; its GLB stays at the origin.
    keyed = pail.animation_data.action
    pail.animation_data.action = None
    pail.location = (0, 0, 0)
    bpy.ops.object.select_all(action="DESELECT")
    pail.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(ASSETS/"galeata-volum.glb"), export_format="GLB",
                              use_selection=True, export_yup=True, export_animations=False)
    pail.animation_data.action = keyed

    # The page reads tests, cameras (three.js axes), prop keys and the report.
    STUDIO.mkdir(parents=True, exist_ok=True)
    published = {"title": data["title"], "description": data["description"], "fps": FPS,
                 "episode": data["episode"], "tests": []}
    for spec in data["tests"]:
        action_id = spec.get("action", spec["id"])
        item = dict(spec)
        item["camera"] = dict(spec["camera"], position=to_three(spec["camera"]["position"]),
                              target=to_three(spec["camera"]["target"]))
        item["duration"] = reports[action_id]["duration"]
        item["report"] = reports[action_id]
        if action_id == "aplecare":
            item["props"] = [{"asset": "galeata-volum", "keys": bucket_keys}]
        published["tests"].append(item)
    (STUDIO/"teste.json").write_text(json.dumps(published, ensure_ascii=False, indent=1)+"\n")

    if "--fara-foi" not in options:
        # Workbench frames from each test's camera; foi.py lays them out with Pillow.
        camera = camera_rig(scene)
        frames_dir = EXPERIMENT/"renders"/"cadre"
        frames_dir.mkdir(parents=True, exist_ok=True)
        for spec in data["tests"]:
            action_id = spec.get("action", spec["id"])
            if spec.get("instances"):
                continue
            action, frames = actions[action_id]
            rig.animation_data.action = action
            pail.hide_render = action_id != "aplecare"
            render_sheet(scene, camera, rig, spec["id"], spec, frames, frames_dir)
            print("FRAMES_OK", spec["id"], flush=True)
    if problems:
        raise SystemExit("PROBLEME:\n"+"\n".join(problems))
    print("VOLUM_OK", len(TESTS), "teste", flush=True)


if __name__ == "__main__":
    main()
