"""Pose solver and the stress-test performances of Mama volumetrică.

Every frame is computed in Python and keyed as local bone quaternions:

* the trunk (root, pelvis, spine, chest, neck, head, shoulders) is forward
  kinematics, with rotations expressed in the parent's posed axes;
* arms and legs are two-bone chains of fixed length. The knee hangs forward,
  the elbow back, out and down, and the hinge axis is shared by both segments;
* during a step the stance foot keeps its footprint on the ground exactly. The
  pelvis is lowered when both feet are planted far apart, never the feet lifted;
* contacts (forehead, chest, shoulders, the other hand, the bucket) are points on
  the posed surfaces, so a hand stays on its target while the body moves.

For a bone b with rest rotation R0 (armature space) and parent p, the delta
rotation D_b = posed_b @ R0_b^-1 obeys D_b = D_p @ Q_b and the keyed local
rotation is L_b = R0_b^-1 @ D_p^-1 @ D_b @ R0_b.
"""
from math import atan2, cos, pi, radians, sin, sqrt

from mathutils import Euler, Matrix, Quaternion, Vector

from corp import BONES, HEAD_CENTER, HEAD_RADII, torso_radius

FPS = 24
ORDER = ["root", "pelvis", "spine", "chest", "neck", "head"]
for _side in ("L", "R"):
    ORDER += [f"shoulder.{_side}", f"upper_arm.{_side}", f"forearm.{_side}", f"hand.{_side}",
              f"thigh.{_side}", f"shin.{_side}", f"foot.{_side}"]
SIGN = {"L": 1, "R": -1}


def smooth(t):
    t = max(0., min(1., t))
    return t*t*(3-2*t)


def lerp(a, b, t):
    return a+(b-a)*t


def rot_z(angle):
    return Matrix.Rotation(angle, 3, "Z")


def euler(values):
    pitch, roll, yaw = values
    # Pitch about X (positive bends forward, towards -Y), roll about Y, yaw about Z.
    return Euler((pitch, roll, yaw), "ZXY").to_matrix()


def frame(u, h):
    """Columns: segment direction, hinge × direction, hinge."""
    u = u.normalized()
    h = (h-u*h.dot(u)).normalized()
    return Matrix((u, h.cross(u), h)).transposed()


def two_bone(distance, a, b):
    along = (a*a-b*b+distance*distance)/(2*distance)
    return along, sqrt(max(0., a*a-along*along))


class Solver:
    def __init__(self, rig):
        self.rig = rig
        self.rest = {b.name: b.matrix_local.to_3x3() for b in rig.data.bones}
        self.head0 = {name: Vector(BONES[name][0]) for name in BONES}
        self.tail0 = {name: Vector(BONES[name][1]) for name in BONES}
        self.length = {name: (self.tail0[name]-self.head0[name]).length for name in BONES}
        self.hinge0 = {}
        for side in "LR":
            for limb, bend in (("arm", Vector((0, 1, 0))), ("leg", Vector((0, -1, 0)))):
                first = "upper_arm" if limb == "arm" else "thigh"
                second = "forearm" if limb == "arm" else "shin"
                for bone in (first, second):
                    name = f"{bone}.{side}"
                    axis = (self.tail0[name]-self.head0[name]).normalized()
                    self.hinge0[name] = bend.cross(axis).normalized()
        self.carry = {}

    # -- forward kinematics ------------------------------------------------------
    def place(self, pose, name, delta, offset=None):
        parent = BONES[name][2]
        if parent is None:
            head = self.head0[name]+(offset or Vector())
            pose["D"][name] = delta
        else:
            dp = pose["D"][parent]
            head = pose["head"][parent]+dp@(self.head0[name]-self.head0[parent])
            if offset is not None:
                head = head+offset
            pose["D"][name] = delta
        pose["head"][name] = head
        pose["tail"][name] = head+delta@(self.tail0[name]-self.head0[name])
        return head

    def point(self, pose, bone, rest_point):
        """A rest-pose point carried rigidly by `bone`."""
        return pose["head"][bone]+pose["D"][bone]@(Vector(rest_point)-self.head0[bone])

    def trunk(self, c):
        pose = {"D": {}, "head": {}, "tail": {}, "slip": 0.}
        yaw = rot_z(c["yaw"])
        self.place(pose, "root", yaw, Vector((c["x"], c["y"], 0)))
        pelvis = yaw@euler(c.get("pelvis", (0, 0, 0)))
        self.place(pose, "pelvis", pelvis, yaw@Vector((0, c.get("hips_back", 0), c.get("lift", 0))))
        D = pelvis
        for name in ("spine", "chest", "neck", "head"):
            D = D@euler(c.get(name, (0, 0, 0)))
            self.place(pose, name, D)
        for side in "LR":
            s = SIGN[side]
            pitch, roll, yaw_ = c.get(f"shoulder.{side}", (0, 0, 0))
            self.place(pose, f"shoulder.{side}", pose["D"]["chest"]@euler((pitch, roll*s, yaw_*s)))
        return pose

    # -- limbs ------------------------------------------------------------------
    def chain(self, pose, side, limb, target, bend, end_delta):
        first, second, end = (("upper_arm", "forearm", "hand") if limb == "arm"
                              else ("thigh", "shin", "foot"))
        a_name, b_name, e_name = (f"{n}.{side}" for n in (first, second, end))
        start = self.place(pose, a_name, pose["D"][BONES[a_name][2]])  # provisional head
        a, b = self.length[a_name], self.length[b_name]
        offset = target-start
        reach = a+b-1e-4
        if offset.length > reach:
            if offset.length-reach > pose["slip"]:
                pose["slip"], pose["slip_by"] = offset.length-reach, a_name
            offset *= reach/offset.length
        if offset.length < .05:
            offset = offset.normalized()*.05 if offset.length > 1e-6 else Vector((0, 0, -.05))
        axis = offset.normalized()
        along, away = two_bone(offset.length, a, b)
        wanted = bend-axis*bend.dot(axis)
        key = (side, limb)
        if key in self.carry:
            kept = self.carry[key]-axis*self.carry[key].dot(axis)
            if kept.length > 1e-4 and wanted.length > 1e-4:
                bend_dir = (kept.normalized()*.55+wanted.normalized()).normalized()
            else:
                bend_dir = wanted.normalized() if wanted.length > 1e-4 else kept.normalized()
        else:
            bend_dir = wanted.normalized()
        self.carry[key] = bend_dir
        joint = start+axis*along+bend_dir*away
        hinge = bend_dir.cross(axis).normalized()
        upper = frame(joint-start, hinge)@frame(self.tail0[a_name]-self.head0[a_name], self.hinge0[a_name]).transposed()
        self.place(pose, a_name, upper)
        lower = frame(start+offset-joint, hinge)@frame(self.tail0[b_name]-self.head0[b_name], self.hinge0[b_name]).transposed()
        self.place(pose, b_name, lower)
        self.place(pose, e_name, end_delta(lower) if callable(end_delta) else end_delta)
        return start+offset

    def solve(self, c):
        pose = self.trunk(c)
        yaw = rot_z(c["yaw"])
        for side in "LR":
            s = SIGN[side]
            leg = c["legs"][side]
            foot = rot_z(leg.get("yaw", c["yaw"]))@Matrix.Rotation(leg.get("pitch", 0), 3, "X")
            knee = leg.get("knee", rot_z(leg.get("yaw", c["yaw"]))@Vector((s*.12, -1, 0)))
            self.chain(pose, side, "leg", leg["ankle"], knee, foot)
            arm = c["arms"][side]
            chest = pose["D"]["chest"]
            pole = arm.get("pole", chest@Vector((s*.45, 1, -.55)))

            def hand(lower, arm=arm, s=s):
                if "hand" not in arm:
                    # A relaxed hand hangs a little outwards, clear of the skirt.
                    return lower@Matrix.Rotation(-s*.12, 3, "Y")@Matrix.Rotation(arm.get("wrist_bend", 0.), 3, "X")
                direction, palm = arm["hand"]
                rest = frame(self.tail0[f"hand.{side}"]-self.head0[f"hand.{side}"], Vector((s, 0, 0)))
                return frame(direction, palm)@rest.transposed()
            self.chain(pose, side, "arm", arm["wrist"], pole, hand)
        return pose

    def key(self, pose, frame_):
        bones = self.rig.pose.bones
        for name in ORDER:
            parent = BONES[name][2]
            dp = pose["D"][parent] if parent else Matrix.Identity(3)
            r0 = self.rest[name]
            local = r0.inverted()@dp.inverted()@pose["D"][name]@r0
            q = local.to_quaternion()
            bone = bones[name]
            q.make_compatible(bone.rotation_quaternion)
            bone.rotation_quaternion = q
            bone.keyframe_insert("rotation_quaternion", frame=frame_)
            if name in ("root", "pelvis"):
                if parent is None:
                    loc = r0.inverted()@(pose["head"][name]-self.head0[name])
                else:
                    expected = pose["head"][parent]+dp@(self.head0[name]-self.head0[parent])
                    loc = r0.inverted()@(dp.inverted()@(pose["head"][name]-expected))
                bone.location = loc
                bone.keyframe_insert("location", frame=frame_)


# -- landmarks on the posed body -------------------------------------------------
def head_point(solver, pose, x, z, out=.0):
    c, r = HEAD_CENTER, HEAD_RADII
    u = 1-(x/r.x)**2-((z-c.z)/r.z)**2
    y = -r.y*sqrt(max(0, u))
    normal = Vector((x/r.x**2, y/r.y**2, (z-c.z)/r.z**2)).normalized()
    p = Vector((x, y, z))+normal*out
    return solver.point(pose, "head", p), pose["D"]["head"]@normal


def chest_point(solver, pose, x, z, out=.0):
    rx, ry = torso_radius(z)
    y = -ry*sqrt(max(0, 1-(x/rx)**2))
    normal = Vector((x/rx**2, y/ry**2, 0)).normalized()
    return solver.point(pose, "chest", Vector((x, y, z))+normal*out), pose["D"]["chest"]@normal


def shoulder_point(solver, pose, side, out=.0):
    s = SIGN[side]
    rest = Vector((s*.2, -.075, 1.305))
    normal = Vector((s*.35, -1, .25)).normalized()
    return solver.point(pose, f"shoulder.{side}", rest+normal*out), pose["D"][f"shoulder.{side}"]@normal


def hand_length(solver, side):
    return solver.length[f"hand.{side}"]+.016


def relaxed(solver, pose, side, swing=0., out=0.):
    """Wrist of a hanging arm in the pelvis frame; swing > 0 is forwards."""
    s = SIGN[side]
    local = Vector((s*(.285+out), -.035-.17*swing, .785+.06*abs(swing)+.03*max(0, swing)))
    return pose["head"]["pelvis"]+pose["D"]["pelvis"]@(local-solver.head0["pelvis"])


# -- footsteps --------------------------------------------------------------------
class Steps:
    """Planted footprints for a body that follows path(t) -> (x, y, yaw).

    The feet alternate; each swing lasts half a period and lands a quarter of a
    period ahead of the body, so the footprint is half a step in front of the hips."""

    def __init__(self, path, start, end, period, lead_side="L", width=.095, lift=.07, stride=None):
        self.path = path
        self.plants = {"L": [], "R": []}
        self.width = width
        half = period/2
        t = start
        side = lead_side
        # Both feet stand at the start.
        for foot in "LR":
            x, y, yaw = path(start)
            self.plants[foot].append((-1e9, 1e9, self.footprint(foot, x, y, yaw)))
        while t < end-1e-6:
            land = min(end, t+half)
            lift_at = t
            x, y, yaw = path(min(end, land+half*.5))
            fp = self.footprint(side, x, y, yaw)
            last = self.plants[side][-1]
            self.plants[side][-1] = (last[0], lift_at, last[2])
            self.plants[side].append((land, 1e9, fp))
            side = "R" if side == "L" else "L"
            t = land
        self.lift = lift
        self.half = half

    def footprint(self, side, x, y, yaw):
        s = SIGN[side]
        offset = rot_z(yaw)@Vector((s*self.width, 0, 0))
        return (Vector((x, y, 0))+offset, yaw)

    def foot(self, side, t):
        plants = self.plants[side]
        for (land_a, lift_a, (pa, ya)), (land_b, _, (pb, yb)) in zip(plants, plants[1:]):
            if t <= lift_a:
                return pa, ya, 0., 0.
            if t < land_b:
                k = (t-lift_a)/max(1e-6, land_b-lift_a)
                e = smooth(k)
                p = pa.lerp(pb, e)
                up = sin(pi*k)*self.lift*min(1, (pb-pa).length/.08+.35)
                yaw = ya+((yb-ya+pi) % (2*pi)-pi)*e
                pitch = .32*sin(pi*k)*(1 if k < .5 else -.6)
                return p+Vector((0, 0, up)), yaw, pitch, k
        last = plants[-1]
        return last[2][0], last[2][1], 0., 0.


ANKLE = .085


def leg_targets(steps, t, yaw):
    legs = {}
    for side in "LR":
        p, foot_yaw, pitch, phase = steps.foot(side, t)
        legs[side] = {"ankle": p+Vector((0, 0, ANKLE)), "yaw": foot_yaw, "pitch": pitch}
    return legs


def standing(x, y, yaw):
    return {side: {"ankle": Vector((x, y, 0))+rot_z(yaw)@Vector((SIGN[side]*.095, 0, ANKLE)), "yaw": yaw}
            for side in "LR"}


def settle_pelvis(solver, c):
    """Lower the hips just enough that both ankles are reachable: feet never slide."""
    for _ in range(3):
        pose = solver.trunk(c)
        drop = 0.
        for side in "LR":
            hip = solver.point(pose, "pelvis", solver.head0[f"thigh.{side}"])
            need = (c["legs"][side]["ankle"]-hip).length-(solver.length[f"thigh.{side}"]+solver.length[f"shin.{side}"]-.004)
            if need > 0:
                d = c["legs"][side]["ankle"]-hip
                # Solve for the extra drop so that |d + (0,0,drop)| = reach.
                reach = solver.length[f"thigh.{side}"]+solver.length[f"shin.{side}"]-.004
                horizontal = d.xy.length
                if horizontal >= reach:
                    continue
                drop = max(drop, -d.z-sqrt(reach*reach-horizontal*horizontal))
        if drop <= 1e-6:
            break
        c["lift"] = c.get("lift", 0)-drop


# -- performances ---------------------------------------------------------------
def walk_controls(solver, steps, path, t, period, swing=1.):
    x, y, yaw = path(t)
    # Arm swing opposes the legs: the left arm goes forward with the right foot.
    c = {"x": x, "y": y, "yaw": yaw, "legs": leg_targets(steps, t, yaw)}
    lf, rf = c["legs"]["L"]["ankle"], c["legs"]["R"]["ankle"]
    centre = Vector((x, y))
    forward = Vector((-sin(yaw), -cos(yaw)))
    # Which foot leads in the walking direction drives the arm swing.
    lead = max(-1., min(1., ((lf.xy-rf.xy).dot(forward))/.3))
    bob = .012*cos(4*pi*t/period)
    sway = (lf.xy+rf.xy)/2-centre
    c["x"], c["y"] = x+sway.x*.25, y+sway.y*.25
    c["lift"] = -.012+bob
    c["pelvis"] = (0, 0, -.12*lead*swing)
    c["spine"] = (.03, 0, .05*lead*swing)
    c["chest"] = (.02, 0, .06*lead*swing)
    c["head"] = (-.04, 0, 0)
    c["swing"] = (-lead*swing, lead*swing)
    return c


def finish_arms(solver, c, default=True):
    pose = solver.trunk(c)
    arms = c.setdefault("arms", {})
    swing = c.get("swing", (0, 0))
    for side, sw in zip("LR", swing):
        if side not in arms:
            arms[side] = {"wrist": relaxed(solver, pose, side, sw*.9)}
    return c


def straight_path(start, end, t0, t1, yaw):
    def path(t):
        k = (t-t0)/(t1-t0)
        k = max(0, min(1, k))
        return start.x+(end.x-start.x)*k, start.y+(end.y-start.y)*k, yaw
    return path


def perform(solver, name, frames, controls):
    """Key `frames` frames of a performance; returns the per-frame poses."""
    solver.carry.clear()
    poses = []
    for f in range(1, frames+1):
        t = (f-1)/FPS
        c = controls(t)
        settle_pelvis(solver, c)
        finish_arms(solver, c)
        pose = solver.solve(c)
        solver.key(pose, f)
        poses.append(pose)
    return poses


def ease_keys(keys, t):
    """keys: [(time, value)], value numbers, tuples or Vectors; smoothstep between."""
    if t <= keys[0][0]:
        return keys[0][1]
    for (ta, a), (tb, b) in zip(keys, keys[1:]):
        if t <= tb:
            k = smooth((t-ta)/(tb-ta))
            if isinstance(a, tuple):
                return tuple(lerp(x, y, k) for x, y in zip(a, b))
            return lerp(a, b, k)
    return keys[-1][1]


# Each test: (id, frames, controls factory). Factories receive the solver.
def mers_profil(solver):
    period = 1.0
    # From verge to verge, inside the fences at x = ±2.3.
    path = straight_path(Vector((-1.85, 0)), Vector((1.85, 0)), .4, 4.9, radians(90))
    yaw = radians(90)
    steps = Steps(path, .4, 4.9, period)

    def controls(t):
        if t < .4 or t > 4.9:
            x, y, _ = path(t)
            legs = {side: {"ankle": steps.foot(side, t)[0]+Vector((0, 0, ANKLE)), "yaw": yaw} for side in "LR"}
            return {"x": x, "y": y, "yaw": yaw, "legs": legs, "lift": -.006}
        return walk_controls(solver, steps, path, t, period)
    return 5.6, controls


def mers_spre_camera(solver):
    period = 1.04
    path = straight_path(Vector((0, 9.0)), Vector((0, 1.2)), .3, 8.0, 0)
    steps = Steps(path, .3, 8.0, period)

    def controls(t):
        if t < .3 or t > 8.0:
            x, y, _ = path(t)
            legs = {side: {"ankle": steps.foot(side, t)[0]+Vector((0, 0, ANKLE)), "yaw": 0} for side in "LR"}
            c = {"x": x, "y": y, "yaw": 0, "legs": legs, "lift": -.006}
            if t > 8.0:
                k = smooth((t-8.0)/.9)
                c["head"] = (-.08*k, 0, 0)
            return c
        return walk_controls(solver, steps, path, t, period)
    return 9.2, controls


def intoarcere(solver):
    period = .9

    def path(t):
        return 0, 0, -smooth((t-.4)/4.2)*2*pi
    # A wider stance while turning keeps the shoes apart as the feet pivot.
    steps = Steps(path, .4, 4.8, period, width=.125, lift=.05)

    def controls(t):
        x, y, yaw = path(t)
        c = {"x": 0, "y": 0, "yaw": yaw, "legs": leg_targets(steps, t, yaw), "lift": -.01}
        c["head"] = (-.02, 0, -.25*sin(pi*smooth((t-.4)/4.2)))
        c["chest"] = (0, 0, -.12*sin(pi*smooth((t-.4)/4.2)))
        return c
    return 5.6, controls


def semnul_crucii(solver):
    """Right hand: forehead, chest, right shoulder, left shoulder, then a bow."""
    keys_t = [0, .6, 1.25, 1.75, 2.35, 2.85, 3.45, 3.95, 4.55, 5.1, 5.9, 6.8]
    bow = [(0, 0), (4.6, 0), (5.1, .42), (5.7, .42), (6.4, 0), (6.8, 0)]

    def controls(t):
        c = {"x": 0, "y": 0, "yaw": 0, "legs": standing(0, 0, 0), "lift": -.006}
        b = ease_keys(bow, t)
        c["spine"], c["chest"], c["neck"], c["head"] = (b*.35, 0, 0), (b*.45, 0, 0), (b*.2, 0, 0), (b*.3, 0, 0)
        c["hips_back"] = b*.05
        pose = solver.trunk(c)
        side = "R"
        L = hand_length(solver, side)
        # Contact targets: fingertips touch the surface, the palm turned to the body.
        forehead, nf = head_point(solver, pose, 0, 1.685, .006)
        chest, nc = chest_point(solver, pose, 0, 1.2, .006)
        right, nr = shoulder_point(solver, pose, "R", .006)
        left, nl = shoulder_point(solver, pose, "L", .006)
        up = pose["D"]["chest"]@Vector((0, 0, 1))
        rest = relaxed(solver, pose, side, 0, .03)

        def touch(point, normal, tilt):
            d = (-normal+up*tilt).normalized()   # fingers into the surface, rising
            return point-d*L, d
        stations = [touch(forehead, nf, 1.3), touch(chest, nc, 1.4),
                    touch(right, nr, .9), touch(left, nl, .9)]
        rest_dir = (pose["D"]["pelvis"]@Vector((-.2, 0, -1))).normalized()
        sequence = [(keys_t[0], rest, rest_dir), (keys_t[1], rest, rest_dir)]
        for i, (wrist, d) in enumerate(stations):
            sequence += [(keys_t[2+2*i], wrist, d), (keys_t[3+2*i], wrist, d)]
        front = solver.point(pose, "pelvis", Vector((-.2, -.36, 1.02)))
        sequence += [((keys_t[9]+keys_t[10])/2, front, rest_dir), (keys_t[10], rest, rest_dir), (keys_t[11], rest, rest_dir)]
        wrist = ease_keys([(a, b) for a, b, _ in sequence], t)
        direction = ease_keys([(a, d) for a, _, d in sequence], t).normalized()
        # The cross is made with joined thumb and two fingers; the palm faces the body,
        # so the back of the hand looks forwards.
        back = pose["D"]["chest"]@Vector((-.3, -1, 0))
        c["arms"] = {"R": {"wrist": wrist, "hand": (direction, back),
                           "pole": pose["D"]["chest"]@Vector((-1, .3, -.3))}}
        c["contacts"] = [("frunte", keys_t[2], keys_t[3]), ("piept", keys_t[4], keys_t[5]),
                         ("umărul drept", keys_t[6], keys_t[7]), ("umărul stâng", keys_t[8], keys_t[9])]
        return c
    return 6.8, controls


def intersectii(solver):
    """Hands meet, arms cross over the chest, a hand on the cheek, hands behind the back."""
    times = [0, .5, 1.3, 2.4, 3.2, 4.3, 5.1, 6.1, 6.9, 7.9, 8.5, 9.1, 9.8]

    def controls(t):
        c = {"x": 0, "y": 0, "yaw": 0, "legs": standing(0, 0, 0), "lift": -.006}
        pose = solver.trunk(c)
        D = pose["D"]["chest"]
        chest = lambda v: pose["head"]["chest"]+D@(Vector(v)-solver.head0["chest"])
        rest = {s: relaxed(solver, pose, s, 0, .03) for s in "LR"}
        down = pose["D"]["pelvis"]@Vector((0, 0, -1))
        L = hand_length(solver, "L")
        # 1. Palms together in prayer in front of the chest (the palms touch).
        pray = {s: (chest((SIGN[s]*.026, -.27, 1.17)), D@Vector((0, -.15, 1)).normalized(), D@Vector((SIGN[s], 0, 0)))
                for s in "LR"}
        # 2. Arms crossed: each hand on the other upper arm, the right forearm in front.
        cross = {}
        for s, depth in (("R", -.215), ("L", -.17)):
            target = chest((-SIGN[s]*.21, depth, 1.19 if s == "R" else 1.23))
            d = D@Vector((-SIGN[s], -.1, .45)).normalized()
            cross[s] = (target-d*L*.55, d, D@Vector((0, -1, 0)))
        # 3. Right hand on the cheek, left hand on the hip, elbow out.
        cheek, nch = head_point(solver, pose, -.13, 1.55, .008)
        cheek_dir = (-nch+D@Vector((0, 0, 1.2))).normalized()
        face = {"R": (cheek-cheek_dir*L*.7, cheek_dir, nch),
                "L": (chest((.205, -.02, 1.0)), D@Vector((-.2, -.3, -1)).normalized(), D@Vector((1, 0, 0)))}
        # 4. Both hands behind the back, one holding the other wrist.
        back = {"L": (chest((.03, .19, .95)), D@Vector((-.7, .2, -.6)).normalized(), D@Vector((0, 1, 0))),
                "R": (chest((-.06, .2, .98)), D@Vector((.7, .2, -.6)).normalized(), D@Vector((0, 1, 0)))}
        # Out of the back the hands pass beside the skirt, never through it.
        beside = {s: (relaxed(solver, pose, s, -.3, .12), down, D@Vector((SIGN[s], 0, 0))) for s in "LR"}
        poses = [None, None, pray, pray, cross, cross, face, face, back, back, beside, None, None]
        arms = {}
        for s in "LR":
            def at(p, s=s):
                return (rest[s], down, D@Vector((SIGN[s], 0, 0))) if p is None else p[s]
            seq = [(tk, at(p)) for tk, p in zip(times, poses)]
            wrist = ease_keys([(tk, v[0]) for tk, v in seq], t)
            d = ease_keys([(tk, v[1]) for tk, v in seq], t).normalized()
            palm = ease_keys([(tk, v[2]) for tk, v in seq], t)
            pole_back = D@Vector((SIGN[s]*1, .7, -.5))
            pole_out = D@Vector((SIGN[s]*1, .3, -.3))
            pole = ease_keys([(tk, pole_out if p is face and s == "L" else pole_back) for tk, p in zip(times, poses)], t)
            arms[s] = {"wrist": wrist, "hand": (d, palm), "pole": pole}
        c["arms"] = arms
        c["head"] = ease_keys([(0, (0, 0, 0)), (5.1, (0, 0, 0)), (6.1, (.05, -.12, -.1)), (6.9, (.05, -.12, -.1)), (7.9, (0, 0, 0))], t)
        return c
    return 9.8, controls


def aplecare(solver):
    """Bend down to the bucket on the ground, lift it and stand up again."""
    bucket = Vector((-.25, -.4, .36))  # handle top, in front of the right foot

    def controls(t):
        c = {"x": 0, "y": 0, "yaw": 0, "legs": standing(0, 0, 0)}
        k = ease_keys([(0, 0.), (.6, 0.), (2.0, 1.), (2.8, 1.), (4.3, .25), (5.6, .25)], t)
        c["lift"] = -.3*k
        c["hips_back"] = .2*k
        # The skirt hangs from the pelvis, so the bend happens mostly above the waist.
        c["pelvis"] = (.2*k, 0, 0)
        c["spine"] = (.72*k, 0, -.12*k)
        c["chest"] = (.62*k, 0, -.1*k)
        c["neck"] = (-.25*k, 0, 0)
        c["head"] = (-.15*k, 0, 0)
        c["legs"]["L"]["knee"] = Vector((.25, -1, 0))
        c["legs"]["R"]["knee"] = Vector((-.25, -1, 0))
        pose = solver.trunk(c)
        rest = relaxed(solver, pose, "R", 0, .02)
        grip = bucket+Vector((0, 0, .015))
        lifted = solver.point(pose, "pelvis", Vector((-.37, -.06, .82)))
        hold = ease_keys([(0, 0.), (2.0, 0.), (2.8, 1.)], t)
        wrist_down = grip+Vector((0, 0, solver.length["hand.R"]*.55))
        # The hand only goes down as far as the bending body lets it.
        reach_k = k**2.3 if t < 2.8 else 1.
        # The hand travels outside the skirt's flare, down to the handle and back up.
        aside = Vector((-.07, -.02, 0))*sin(pi*reach_k)
        wrist = rest.lerp(wrist_down, reach_k)+aside if t < 2.8 else \
            wrist_down.lerp(lifted, 1-(k-.25)/.75)+Vector((-.03, 0, 0))*sin(pi*(1-(k-.25)/.75))
        # The left hand rests on the knee, in front of the skirt, while she bends.
        knee = Vector((.2, -.3, .62+.3*(1-k)))
        brace = relaxed(solver, pose, "L").lerp(knee, smooth(k*1.4))
        c["arms"] = {"R": {"wrist": wrist, "hand": (Vector((0, -.15, -1)).normalized(), Vector((0, -1, 0)))},
                     "L": {"wrist": brace}}
        c["bucket"] = wrist-Vector((0, 0, solver.length["hand.R"]*.55+.015)) if t >= 2.8 else bucket
        return c
    return 5.6, controls


def brate_sus(solver):
    """Both arms rise above the head and come down: the sleeve and shoulder under strain."""
    def controls(t):
        c = {"x": 0, "y": 0, "yaw": 0, "legs": standing(0, 0, 0), "lift": -.006}
        k = ease_keys([(0, 0.), (.5, 0.), (2.0, 1.), (3.0, 1.), (4.5, 0.), (5.0, 0.)], t)
        c["shoulder.L"] = c["shoulder.R"] = (0, -.18*k, 0)
        c["chest"] = (-.06*k, 0, 0)
        c["head"] = (-.2*k, 0, 0)
        pose = solver.trunk(c)
        arms = {}
        for s in "LR":
            rest = relaxed(solver, pose, s)
            high = solver.point(pose, "chest", Vector((SIGN[s]*.42, -.1, 1.8)))
            side = solver.point(pose, "chest", Vector((SIGN[s]*.62, -.05, 1.38)))
            wrist = rest.lerp(side, smooth(k*2)) if k < .5 else side.lerp(high, smooth(k*2-1))
            up = (pose["D"]["chest"]@Vector((SIGN[s]*.2*(1-k), 0, -1+2*k))).normalized()
            arms[s] = {"wrist": wrist, "pole": pose["D"]["chest"]@Vector((SIGN[s]*.2, .8, -1+1.5*k)),
                       "hand": (up, pose["D"]["chest"]@Vector((SIGN[s]*(1-k), k, 0)))}
        c["arms"] = arms
        return c
    return 5.0, controls


def doi_pe_drum(solver):
    """The walk towards the camera, reused by two figures who pass each other."""
    return mers_spre_camera(solver)


TESTS = [
    ("mers-profil", mers_profil),
    ("mers-spre-camera", mers_spre_camera),
    ("intoarcere", intoarcere),
    ("intersectii", intersectii),
    ("semnul-crucii", semnul_crucii),
    ("aplecare", aplecare),
    ("brate-sus", brate_sus),
]
