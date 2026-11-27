"""Give the Mother of the episode the volumetric 3D arms from the hand comparison.

Run on the saved episode, after build_episode.py:

    blender -b scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 \
        --python scripts/mama_volumetrica.py

The 2.5D rig keeps the choreography: its shoulder, wrist and hand drawing index are
read at every drawn frame. The wrist keeps its place in the picture, so contacts with
the bread, the scarf and the bag stay where they were directed. A raised hand moves
towards the lens, the arm keeps fixed segment lengths, and the elbow hangs towards
a relaxed pole, as in `mother_comparison.space_path`. The sleeve tube and the hand
with five fingers are rebuilt in the rig's space and stored as shape keys, so the
.blend, the MP4 and the Three.js film show the same geometry. The script is
idempotent: it removes an earlier volumetric arm before baking a new one.
"""
from math import sqrt
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_episode  # noqa: E402  (adds the cleopa-blender scripts to sys.path)
from build_episode import gate  # noqa: E402
from export_web_characters import bake_shapes  # noqa: E402
from hands import HAND_POSES  # noqa: E402
from mother_comparison import INK, POLE, RADIAL, two_bone, volume_hand, volume_sleeve  # noqa: E402

ACTORS = ("Mama · bucătărie", "Mama · rugăciune")
DRAWN_ARM = ("Mânecă continuă · ", "Cusătură la manșetă · ", "Broderie pe braț · ", " hand · ")
SHOULDER_DEPTH = .23
FORWARD = .50      # wrist depth in front of the shoulder for a raised hand (rig units)
# Drawing index → (flexion, spread) of the solid hand. All poses use the open hand
# construction so a change of drawing becomes a continuous finger motion.
FINGERS = {
    "rest": (.89, .12), "open": (.10, .66), "cup": (.42, .30),
    "grip": (.80, .18), "reach": (.22, .46), "stop": (.02, .72),
}
EASE = .45         # share of the way to a new finger pose at each drawn frame


INK_WIDTH = {"sleeve": .016, "hand": .009}
INK_BACK = .03     # the ink shell sits behind the tube, so only its rim shows in front


def inked(mesh, width, ink):
    """Add a dark shell, slightly wider and set back, as the series' contour line.

    Seen by the frontal orthographic camera, the shell only shows beyond the tube's
    silhouette. It needs no backface culling, so Workbench and Three.js agree."""
    # Every tube is stored as rings of RADIAL vertices; a ring's centre gives the
    # outward direction of each of its vertices.
    shell = []
    for start in range(0, len(mesh.vertices), RADIAL):
        ring = [Vector(v) for v in mesh.vertices[start:start+RADIAL]]
        centre = sum(ring, Vector())/len(ring)
        for point in ring:
            out = point-centre
            out = out.normalized()*width if out.length > 1e-9 else out
            shell.append(tuple(point+out-Vector((0, 0, INK_BACK))))
    mesh.add(shell, list(mesh.faces), [ink]*len(mesh.faces))
    return mesh


def sleeve_of(s, e, w):
    return inked(volume_sleeve(s, e, w), INK_WIDTH["sleeve"], 0)


def hand_of(w, d, side, flex, spread):
    return inked(volume_hand(w, d, side, "deschisa", flex, spread), INK_WIDTH["hand"], 2)


def smooth(t):
    t = max(0., min(1., t))
    return t*t*(3-2*t)


def visible_range(coll, scene):
    body = next(obj for obj in coll.objects if "Shirt and clothing panels" in obj.name)
    frames = []
    for frame in range(scene.frame_start, scene.frame_end+1):
        scene.frame_set(frame)
        if not body.hide_render:
            frames.append(frame)
    return frames[0], frames[-1]+1


def remove_drawn_arms(coll):
    removed = 0
    for obj in list(coll.objects):
        name = obj.name.split(".")[0]
        if obj.type == "MESH" and (any(f"{label}{side}" in name for label in DRAWN_ARM for side in "RL")
                                   or obj.get("cleopa_volumetric")):
            bpy.data.objects.remove(obj, do_unlink=True)
            removed += 1
    return removed


def lift_arm(rig, p, side, carried):
    """Return shoulder, elbow, wrist, palm axis and lift in the rig's space."""
    bones = rig.pose.bones
    sign = -1 if side == "R" else 1
    head = bones["upper_arm."+side].head
    shoulder = Vector((head.x, head.y, SHOULDER_DEPTH))
    wrist2d = bones["hand."+side].head.xy
    palm = (bones["hand."+side].tail.xy-wrist2d).normalized()
    rest = Vector((sign*(p["shoulder_x"]+.08), p["shoulder_y"]-p["upper"]-p["lower"]+.085))
    lift = smooth(((wrist2d-rest).length-.06)/.40)
    lengths = p["upper"], p["lower"]
    reach = sum(lengths)-.013
    planar = wrist2d-shoulder.xy
    if planar.length > reach:
        planar *= reach/planar.length
    depth = min(FORWARD*lift, sqrt(max(0., reach*reach-planar.length_squared)))
    offset = Vector((planar.x, planar.y, depth))
    if offset.length < .12:
        offset.z = sqrt(max(0., .0144-planar.length_squared))
    wrist = shoulder+offset
    axis = offset.normalized()
    along, away = two_bone(offset.length, lengths)
    wanted = POLE[side]-axis*POLE[side].dot(axis)
    if carried:
        kept = carried[0]-axis*carried[0].dot(axis)
        bend = kept.normalized()+wanted*.45 if kept.length > 1e-4 else wanted
    else:
        bend = wanted
    bend.normalize()
    carried[:] = [bend]
    elbow = shoulder+axis*along+bend*away
    forward = Vector((palm.x, palm.y, .11*lift)).normalized()
    return shoulder, elbow, wrist, forward, lift, (wrist2d-wrist.xy).length


def volumetric_mother(scene, name):
    coll = bpy.data.collections[name]
    rig = bpy.data.objects["RIG_"+name]
    start, end = visible_range(coll, scene)
    p = profile_of(rig)
    removed = remove_drawn_arms(coll)
    frames = list(range(start if start % 2 else start+1, end, 2))
    if frames[-1] != end-1:
        frames.append(end-1)
    report = []
    for side in ("R", "L"):
        carried, sleeves, hands = [], [], []
        flex, spread = FINGERS["rest"]
        drift = length_error = step = 0.
        previous = None
        for frame in frames:
            scene.frame_set(frame)
            pose = HAND_POSES[int(round(rig.get(f"hand_{side}_pose", 0)))]
            target = FINGERS[pose]
            flex += (target[0]-flex)*EASE
            spread += (target[1]-spread)*EASE
            s, e, w, d, lift, slip = lift_arm(rig, p, side, carried)
            drift = max(drift, slip)
            length_error = max(length_error, abs((e-s).length-p["upper"]), abs((w-e).length-p["lower"]))
            if previous is not None:
                step = max(step, (w-previous).length)
            previous = w
            sleeves.append((frame, sleeve_of(s, e, w).vertices))
            hands.append((frame, hand_of(w, d, side, flex, spread).vertices))
        if length_error > 2e-5:
            raise RuntimeError(f"{name} {side}: brațul își schimbă lungimea ({length_error})")
        if step > .31:
            raise RuntimeError(f"{name} {side}: încheietura sare {step} între desene")
        geometry = sleeve_of(s, e, w)
        cloth = geometry.object("Mânecă volumetrică · "+side,
                                (INK, p["shirt"], p["shade"], "f1d6a6", "c68659", "b76b55", "a95647"), coll, rig)
        solid = hand_of(w, d, side, flex, spread).object(
            "Palmă volumetrică · "+side, (p["skin"], p["skin_shadow"], INK), coll, rig)
        for obj, samples in ((cloth, sleeves), (solid, hands)):
            obj.matrix_parent_inverse.identity()
            obj["cleopa_volumetric"] = True
            obj["cleopa_bone"] = "hand."+side if obj is solid else "forearm."+side
            bake_shapes(obj, samples)
            gate(obj, start, end)
        report.append(f"{side}: {len(frames)} desene, alunecare {drift:.4f}, pas {step:.3f}")
    print("MAMA_3D_OK", name, f"{start}–{end-1}", f"{removed} piese 2D înlocuite", "; ".join(report), flush=True)


def profile_of(rig):
    """Rebuild the actor's profile exactly as build_episode.actor() overrides it."""
    from build_characters import profile as character_profile
    base = character_profile("mother")
    p = dict(base)
    p.update(shoulder_x=base["shoulder_x"]*.95, shoulder_y=base["shoulder_y"]-.135,
             upper=base["upper"]*.86, lower=base["lower"]*.82,
             shirt="ffedcb", shade="dfb991", skin="f5b488", skin_shadow="e1946d")
    bones = rig.data.bones
    # The armature carries the authoritative segment lengths.
    p["upper"] = bones["upper_arm.R"].length
    p["lower"] = bones["forearm.R"].length
    return p


def main():
    scene = bpy.context.scene
    for name in ACTORS:
        volumetric_mother(scene, name)
    scene.frame_set(scene.frame_start)
    options = sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else []
    if options[:1] == ["--out"]:
        bpy.ops.wm.save_as_mainfile(filepath=options[1], compress=True, copy=True)
    else:
        bpy.ops.wm.save_mainfile(compress=True)


if __name__ == "__main__":
    main()
