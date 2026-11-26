"""The "yarn elder" head (look `head: "yarn"`): the old monk's head of the cartoons-learning repo
(demos/monk-head/build_monk.py, 19 review rounds) ported to the blender style. Only the head, the wool beard of
42 simulated locks, the moustache / brows, the mouth with morph targets and the hood + mantle are kept: the body, the
arms and the hands are the toy monk's (monk.glb). lib/engine3/yarnhead.js puts it on the monk's head bone (scale 0.56,
head centre at y 3.45 of the figure) and drapes the beard every frame as a pure function of the pose.

Run:  python3 blender/characters/build_yarn_elder.py   (needs `pip install bpy numpy`)  -> assets/characters/yarn-elder.glb

Blender coordinates: Z up, the character faces -Y.  Head radius = 1.
Everything is generated procedurally so the model is reproducible:
  * LEGO-like barrel head, eyes, lids, morphing mouth + tongue
  * wool hood / cloak (hood + mantle over the shoulders)
  * beard, moustache, brows made of yarn strands; every beard strand is
    skinned to its own bone chain (s<id>_<k>) which three.js simulates.
"""
import bpy, bmesh, math, os, random
import numpy as np

# YARN_WOOL=soft builds the earlier monk (look `wool: "soft"`): plain fluffy locks instead of twisted wool ropes
SOFT = os.environ.get("YARN_WOOL") == "soft"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "assets", "characters", "yarn-elder-soft.glb" if SOFT else "yarn-elder.glb")
random.seed(7)
R, H = 1.0, 0.9
ZM = -0.43          # mouth centre height
K = 6               # bone segments per beard strand


def headr(z):
    if z > 0.58:   # rounder crown (hidden under the hood) so the hood can be a soft dome
        return R * (1 - min(1.0, (z - 0.58) / 0.32) ** 2.2) ** 0.45
    a = min(abs(z) / H, 1.0)
    return R * (1 - a ** 8) ** (1 / 8)


def surf(th, z, out=0.0):
    r = headr(z) + out
    return np.array([r * math.sin(th), -r * math.cos(th), z])


def sstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def smax(a, b, k=0.02):
    return 0.5 * (a + b + math.sqrt((a - b) ** 2 + k))


def body_ab(z):
    """half width / half depth of the torso at height z (centre y=+0.1)."""
    if z > -1.0:
        return 0.0, 0.0
    f = math.sqrt(max(0.0, 1 - ((max(z, -2.3) + 2.3) / 1.3) ** 2)) ** 0.7
    return 1.65 * f, 1.05 * f


class MB:
    def __init__(s):
        s.v, s.f, s.uv, s.w = [], [], [], []

    def grid(s, P, UV, W, wrap=False, flip=False):
        n, m = P.shape[:2]
        base = len(s.v)
        for i in range(n):
            for j in range(m):
                s.v.append(tuple(float(x) for x in P[i, j]))
                s.w.append(W[i][j] if isinstance(W[i], list) else W[i])
        for i in range(n - 1):
            for j in range(m if wrap else m - 1):
                j2 = (j + 1) % m
                a, b = base + i * m + j, base + i * m + j2
                c, d = base + (i + 1) * m + j2, base + (i + 1) * m + j
                ua, ub, uc, ud = UV[i, j], UV[i, j + 1], UV[i + 1, j + 1], UV[i + 1, j]
                if flip:
                    s.f.append((a, d, c, b)); s.uv.append((ua, ud, uc, ub))
                else:
                    s.f.append((a, b, c, d)); s.uv.append((ua, ub, uc, ud))

    def tube(s, pts, rad, W, sides=8, cap0=True, cap1=True, vrep=1.0, urep=1.0):
        pts = np.array(pts, float); rad = list(rad); W = list(W)
        T0 = pts[1] - pts[0]; T0 /= np.linalg.norm(T0)
        T1 = pts[-1] - pts[-2]; T1 /= np.linalg.norm(T1)
        if cap0:
            pts = np.vstack([pts[0] - T0 * rad[0] * .8, pts[0] - T0 * rad[0] * .5, pts])
            rad = [rad[0] * .05, rad[0] * .7] + rad; W = [W[0], W[0]] + W
        if cap1:
            pts = np.vstack([pts, pts[-1] + T1 * rad[-1] * .5, pts[-1] + T1 * rad[-1] * .8])
            rad = rad + [rad[-1] * .7, rad[-1] * .05]; W = W + [W[-1], W[-1]]
        n = len(pts)
        T = np.gradient(pts, axis=0)
        T /= np.linalg.norm(T, axis=1)[:, None]
        N = np.cross(T[0], [0, 0, 1.0])
        if np.linalg.norm(N) < 1e-3:
            N = np.array([1.0, 0, 0])
        P = np.zeros((n, sides, 3)); UV = np.zeros((n, sides + 1, 2))
        L = 0.0
        ravg = float(np.mean(rad))
        for i in range(n):
            if i:
                L += np.linalg.norm(pts[i] - pts[i - 1])
            N = N - T[i] * np.dot(N, T[i]); N /= np.linalg.norm(N)
            B = np.cross(T[i], N)
            for j in range(sides):
                a = 2 * math.pi * j / sides
                P[i, j] = pts[i] + rad[i] * (math.cos(a) * N + math.sin(a) * B)
            for j in range(sides + 1):
                UV[i, j] = (urep * j / sides, vrep * L / (2 * math.pi * ravg))
        s.grid(P, UV, W, wrap=True)

    def lathe(s, zs, rfun, W, cols=48, uvs=(1, 1)):
        n = len(zs)
        P = np.zeros((n, cols, 3)); UV = np.zeros((n, cols + 1, 2))
        for i, z in enumerate(zs):
            for j in range(cols + 1):
                th = 2 * math.pi * j / cols
                if j < cols:
                    P[i, j] = rfun(th, z)
                UV[i, j] = (uvs[0] * j / cols, uvs[1] * (z - zs[0]))
        s.grid(P, UV, [W] * n, wrap=True)

    def ellipsoid(s, c, ax, W, n=12, m=16):
        """ax: 3x3 rows = semi axis vectors."""
        ax = np.array(ax, float); c = np.array(c, float)
        P = np.zeros((n + 1, m, 3)); UV = np.zeros((n + 1, m + 1, 2))
        for i in range(n + 1):
            v = -math.pi / 2 + math.pi * i / n
            for j in range(m):
                u = 2 * math.pi * j / m
                d = np.array([math.cos(v) * math.cos(u), math.cos(v) * math.sin(u), math.sin(v)])
                P[i, j] = c + d @ ax
            for j in range(m + 1):
                UV[i, j] = (j / m, i / n)
        s.grid(P, UV, [W] * (n + 1), wrap=True)

    def obj(s, name, mat, arm, recalc=True, keys=None):
        me = bpy.data.meshes.new(name)
        me.from_pydata(s.v, [], s.f)
        uvl = me.uv_layers.new(name="UVMap")
        k = 0
        for fuv in s.uv:
            for uv in fuv:
                uvl.data[k].uv = (float(uv[0]), float(uv[1])); k += 1
        me.polygons.foreach_set("use_smooth", [True] * len(me.polygons))
        if recalc:
            bm = bmesh.new(); bm.from_mesh(me)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            bm.to_mesh(me); bm.free()
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(ob)
        groups = {}
        for i, w in enumerate(s.w):
            for bn, val in w.items():
                if val <= 1e-4:
                    continue
                g = groups.get(bn) or groups.setdefault(bn, ob.vertex_groups.new(name=bn))
                g.add([i], float(val), 'REPLACE')
        if keys:
            ob.shape_key_add(name="Basis")
            for kn, verts in keys.items():
                sk = ob.shape_key_add(name=kn)
                for i, v in enumerate(verts):
                    sk.data[i].co = v
        ob.parent = arm
        md = ob.modifiers.new("Armature", 'ARMATURE'); md.object = arm
        return ob


def mat(name, col):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*col, 1)
    return m


BONES = []   # (name, head, tail, parent)


def bone(name, head, tail, parent=None):
    BONES.append((name, tuple(map(float, head)), tuple(map(float, tail)), parent))


HEADW = {"head": 1.0}

# ---------------------------------------------------------------- rig basics
bone("root", (0, 0, -3.2), (0, 0, -2.6))
bone("head", (0, 0, -0.9), (0, 0, 0.9), "root")

# ---------------------------------------------------------------- skin: head, lids, hand
skin = MB()
zs = [-H * math.cos(math.pi * i / 36) for i in range(37)]
skin.lathe(zs, lambda th, z: surf(th, z), HEADW, cols=64)
EYE_TH, EYE_Z = 0.265, 0.2

# ---------------------------------------------------------------- eyes
eyes, eyehi = MB(), MB()
for sx, sd in ((1, "L"), (-1, "R")):
    th = sx * EYE_TH
    n = np.array([math.sin(th), -math.cos(th), 0]); t = np.array([math.cos(th), math.sin(th), 0])
    up = np.array([0, 0, 1.0])
    c = surf(th, EYE_Z, -0.012)
    bone(f"eye.{sd}", c, c + n * 0.2, "head")
    W = {f"eye.{sd}": 1.0}
    eyes.ellipsoid(c, [t * 0.082, n * 0.044, up * 0.117], W, n=14, m=20)
    h1 = c + n * 0.036 + t * 0.021 + up * 0.043
    eyehi.ellipsoid(h1, [t * 0.03, n * 0.006, up * 0.036], W, n=6, m=10)
    h2 = c + n * 0.039 - t * 0.028 - up * 0.047
    eyehi.ellipsoid(h2, [t * 0.018, n * 0.005, up * 0.02], W, n=6, m=10)

lines = MB()
for sx in (1, -1):
    for a in (-0.5, 0.0, 0.5):
        pts = [surf(sx * (0.42 + 0.15 * t), EYE_Z + 0.02 + a * (0.05 + 0.17 * t) - 0.04 * abs(a) * math.sin(math.pi * t), -0.002) for t in np.linspace(0, 1, 6)]
        lines.tube(pts, [0.009, 0.015, 0.015, 0.014, 0.011, 0.007], [HEADW] * 6, sides=6)
    pts = [surf(sx * (EYE_TH + 0.12 * u), EYE_Z - 0.17 - 0.03 * (1 - u * u), -0.003) for u in np.linspace(-1, 1, 7)]
    lines.tube(pts, [0.004, 0.007, 0.008, 0.008, 0.008, 0.007, 0.004], [HEADW] * 7, sides=6)

for zf, wd in ((0.63, 0.24), (0.71, 0.17)):
    pts = [surf(wd * u, zf + 0.012 * math.cos(3.2 * u) - 0.02 * u * u, -0.003) for u in np.linspace(-1, 1, 11)]
    lines.tube(pts, [0.004] + [0.011] * 9 + [0.004], [HEADW] * 11, sides=6)

blush = MB()
for sx in (1, -1):
    th = sx * 0.5
    n = np.array([math.sin(th), -math.cos(th), 0]); t = np.array([math.cos(th), math.sin(th), 0])
    blush.ellipsoid(surf(th, -0.03, -0.02), [t * 0.17, n * 0.03, np.array([0, 0, 0.11])], HEADW, n=8, m=14)

# ---------------------------------------------------------------- mouth (morph targets)
MOUTHS = {  # half width, corner raise, upper, lower, sideways shift
    "Basis": (0.18, 0.045, 0.016, 0.022, 0),
    "smile": (0.21, 0.08, 0.016, 0.02, 0),
    "smileOpen": (0.17, 0.07, 0.018, 0.13, 0),
    "O": (0.19, 0.0, 0.14, 0.2, 0),
    "oo": (0.15, 0.0, 0.12, 0.15, 0),
    "wow": (0.14, 0.05, 0.1, 0.13, 0),
    "sad": (0.25, -0.18, 0.04, 0.04, 0),
    "aa": (0.17, 0.02, 0.06, 0.17, 0),
    "ee": (0.24, 0.03, 0.045, 0.065, 0),
    "mm": (0.17, 0.0, 0.013, 0.013, 0),
    "purse": (0.09, 0.01, 0.022, 0.024, 0.07),
}
NS, NT = 29, 7


def mouth_pts(p, tongue):
    w, c, u, l, dx = p
    out = []
    up_ = lambda s: c * s * s + u * (1 - s * s) ** 0.75
    lo_ = lambda s: c * s * s - l * (1 - s * s) ** 0.75
    for i in range(NT):
        tt = i / (NT - 1)
        for j in range(NS):
            s = -1 + 2 * j / (NS - 1)
            if not tongue:
                # ease columns toward the corners so the outline stays round
                sq = math.sin(s * math.pi / 2)
                y = lo_(sq) + (up_(sq) - lo_(sq)) * tt
                out.append(tuple(surf((w * sq + dx) / R, ZM + y, 0.004)))
            else:
                sq = math.sin(s * math.pi / 2); x = sq * 0.62 * w; sm = x / w
                lo = lo_(sm); top = lo + 0.5 * (up_(sm) - lo) * (1 - sq * sq) ** 0.5
                y = lo + (top - lo) * tt
                bulge = 0.008 + 0.025 * (1 - sq * sq) * math.sin(math.pi * min(tt, .999) ** .7) * min(1, (u + l) * 6)
                out.append(tuple(surf((x + dx) / R, ZM + y, bulge)))
    return out


def mouth_obj(name, material, tongue, arm):
    mb = MB()
    P = np.array(mouth_pts(MOUTHS["Basis"], tongue)).reshape(NT, NS, 3)
    UV = np.zeros((NT, NS, 2))
    for i in range(NT):
        for j in range(NS):
            UV[i, j] = (j / (NS - 1), i / (NT - 1))
    mb.grid(P, UV, [HEADW] * NT)
    keys = {k: mouth_pts(v, tongue) for k, v in MOUTHS.items() if k != "Basis"}
    return mb.obj(name, material, arm, recalc=False, keys=keys)


# ---------------------------------------------------------------- wool strands
wool = MB()
SID = [0]


def strand(center, r0, r1, sim=True, rigid=None, sides=8, sub=1, geom=True, tp=2.5, turns=None):
    """center: f(t)->point, t in 0..1.  sim strands get a K-bone chain.
    sub>1 lays several thinner yarns around the same chain so one simulated lock reads as wool.
    turns: a plied rope instead — `sub` plies twisting `turns` times round each other along the lock (two-ply yarn)."""
    n = 34 if turns is None else 56
    tg = np.linspace(0, 1, n)
    pts = np.array([center(t) for t in tg])
    seg = np.linalg.norm(np.diff(pts, axis=0), axis=1)
    cum = np.concatenate([[0], np.cumsum(seg)]); L = cum[-1]
    sid = None
    if sim:
        sid = SID[0]; SID[0] += 1
        chain = [np.array([np.interp(L * k / K, cum, pts[:, a]) for a in range(3)]) for k in range(K + 1)]
        for k in range(K + 1):
            tail = chain[k + 1] if k < K else chain[k] + (chain[k] - chain[k - 1]) * 0.3
            bone(f"s{sid}_{k}", chain[k], tail)
    rnd = random.Random(1000 + len(wool.v))
    for q in range(sub if geom else 0):
        fl = 1.0 if sub == 1 else rnd.uniform(0.88, 1.0)
        ph = rnd.uniform(0, 6.28) if sub > 1 else 0; tw = rnd.uniform(4, 7)
        ro = 0.0 if sub == 1 else r0 * 0.6
        rr0 = r0 if sub == 1 else r0 * rnd.uniform(0.55, 0.72)
        if turns is not None:   # plied rope: equal plies wound round the lock's axis, tapering with it
            fl = 1.0; tw = 6.283 * turns; ph = (sid or 0) * 1.3 + len(wool.v) * 0.0
            ro = r0 * 0.46; rr0 = r0 * 0.62
        P, rad, W = [], [], []
        for i in range(n):
            t = tg[i] * fl
            f = float(np.interp(t, tg, cum)) / L
            env = sstep(0, 0.12, t) if turns is None else (rr0 + (r1 * 0.62 / max(r0, 1e-6) * r0 - rr0) * t ** tp) / rr0
            a = ph + 6.283 * q / sub + tw * t
            if turns is None:
                P.append(center(t) + ro * env * (1 + 0.7 * t) * np.array([math.cos(a), 0.7 * math.sin(a), 0]))
            else:   # wind round the lock's own axis (perpendicular to its direction)
                c0 = center(t); c1 = center(min(1.0, t + 0.02)) if t < 0.98 else c0 + (c0 - center(t - 0.02))
                d = c1 - c0; d = d / (np.linalg.norm(d) + 1e-9)
                e1 = np.cross(d, [0.0, -1.0, 0.0]); e1 = e1 / (np.linalg.norm(e1) + 1e-9); e2 = np.cross(d, e1)
                P.append(c0 + ro * env * (math.cos(a) * e1 + math.sin(a) * e2))
            rad.append((rr0 + ((r1 * 0.62 if turns is not None else r1) - rr0) * (tg[i]) ** tp) * (0.93 + 0.07 * math.sin(f * 14 + q + 1.7 * (sid or 0))))
            if sim:
                sk = f * K; w = {}
                for b in range(K):
                    v = max(0.0, 1 - abs(sk - (b + 0.5)))
                    if b == 0 and sk < 0.5: v = 1.0
                    if b == K - 1 and sk > K - 0.5: v = 1.0
                    if v > 0: w[f"s{sid}_{b}"] = v
                tot = sum(w.values()); W.append({k_: v / tot for k_, v in w.items()})
            else:
                W.append(rigid)
        wool.tube(P, rad, W, sides=sides, vrep=1.0)
    return sid


TH_MAX = 1.0


def jaw(th):
    return -0.64 + 0.62 * (abs(th) / TH_MAX) ** 2.4


def beard_center(th, layer, seed, smooth=False, curl=False):
    rnd = random.Random(seed)
    a = abs(th) / TH_MAX
    zr = jaw(th) - layer * 0.07 + rnd.uniform(-0.02, 0.02)
    out0 = 0.03 - layer * 0.05
    root = surf(th, zr, out0)
    ztip = -1.98 + 1.15 * a ** 2.2 + layer * 0.09 + rnd.uniform(-0.035, 0.03) - (0.10 * (1 - a) + rnd.uniform(0, 0.05) if curl else 0)
    xr = root[0]
    ytip = -(1.02 + 0.07 * (2 - layer)) * (1 - 0.45 * a ** 2)
    ytip += (root[1] - 0.12 - ytip) * a ** 2
    ph = rnd.uniform(0, 6.28); amp = rnd.uniform(0.03, 0.055); fr = rnd.uniform(1.4, 1.9)
    sgn = 1 if th >= 0 else -1
    amp *= 1.5 if SOFT else 0.55   # thick ropes hang calmly, side by side
    if smooth: amp = 0.0
    cph = rnd.uniform(0, 6.28)
    thc = round(th / TH_MAX * 2.6) * TH_MAX / 2.6
    xc = math.sin(thc) * R

    def f(t):
        z = zr + (ztip - zr) * t ** 1.05
        bump = math.sin(math.pi * min(1.0, t * 1.5)) ** 1.2
        xe = xr + (xc - xr) * (0.0 if smooth else 0.62 * sstep(0.2, 0.7, t) + 0.2 * sstep(0.7, 1.0, t))
        x = xe * (1 + 0.5 * sstep(0.05, 0.35, t) * (0.5 + a) * (1 - 0.8 * a ** 3)) * (1 - 0.6 * (1 - 0.8 * a ** 2) * sstep(0.35, 1.0, t) ** 1.3)
        y = root[1] + (ytip - root[1]) * sstep(0, 1, t) - (0.16 - 0.05 * layer) * math.sin(math.pi * t ** 0.6) * (1 - 0.8 * a)
        env = sstep(0, 0.25, t) * (1 - 0.9 * a ** 2)
        env *= 1 + 0.8 * t * t
        x += amp * math.sin(6.283 * fr * t + ph) * env + 0.012 * math.sin(6.283 * 3.1 * t + 2 * ph) * env
        if curl:   # the free locks sway in a lazy S
            x += 0.03 * math.sin(6.283 * 0.9 * t + cph) * sstep(0.45, 0.8, t) * (1 - sstep(0.8, 1.0, t)) - sgn * 0.12 * a ** 3 * sstep(0.3, 1.0, t)
        y += 0.5 * amp * math.cos(6.283 * fr * t + ph * 1.7) * env + 0.01 * math.cos(6.283 * 3.4 * t + ph) * env + 0.06 * sstep(0.78, 1.0, t)   # crinkle, and the ends tuck back under the mass
        return np.array([x, y, z])
    return f


# The beard: 42 simulated chains form a lattice.  The front layer carries ONE solid woolly block (the core);
# only a few thick locks, riding on the middle layer, branch out past its edges and hem.
N_BEARD = 0
CORE = []          # (sid, centre function) of the front-layer chains, left to right
CORE_RANGE = (4, 10)   # the block only spans the middle front chains; everything else is thick free locks
for layer, cnt in ((2, 13), (1, 14), (0, 15)):
    for i in range(cnt):
        th = -TH_MAX + 2 * TH_MAX * (i + 0.5) / cnt
        in_core = layer == 0 and CORE_RANGE[0] <= i <= CORE_RANGE[1]
        fc = beard_center(th, layer, 100 * layer + i, curl=(layer == 1))
        if layer == 2:
            strand(fc, 0.16, 0.10, sides=8, tp=3) if SOFT else strand(fc, 0.17, 0.11, sides=8, tp=3, sub=2, turns=2.2)
        else:   # each lock = a thick two-ply rope of wool (the plies twist round each other)
            strand(fc, 0.175 if layer == 1 else 0.165, 0.10, sides=10, tp=2.4) if SOFT else strand(fc, 0.21 if layer == 1 else 0.2, 0.14, sides=10, tp=3.0, sub=2, turns=2.6)


def beard_core():
    NC, NR, NRIDGE, EXT = len(CORE) - 1, 40, 5, 0.9
    us = np.linspace(-EXT, NC + EXT, 110)
    P = np.zeros((NR, len(us), 3)); UV = np.zeros((NR, len(us), 2)); W = []
    for r in range(NR):
        v = r / (NR - 1); row = []
        for c, u in enumerate(us):
            uc = min(max(u, 0.0), NC - 1e-6); i = int(uc); fr = uc - i
            e = (abs(u - uc)) / EXT                      # 0 inside, ->1 on the rolled side edge
            un = uc / NC
            edge = abs(2 * un - 1)
            tend = 0.5 - 0.1 * edge ** 2 + 0.06 * abs(math.sin(math.pi * NRIDGE * un))   # scalloped hem following the ridges
            t = v * tend
            p = CORE[i][1](t) * (1 - fr) + CORE[i + 1][1](t) * fr
            n = np.array([0.5 * p[0], -1.0, 0.0]); n /= np.linalg.norm(n)
            side = np.array([1.0 if u > NC / 2 else -1.0, 0.25, 0.0])
            phase = math.pi * (NRIDGE * un + 0.45 * math.sin(6.283 * 1.3 * t + 4 * un) * sstep(0, 0.12, t) + 0.08 * math.sin(6.283 * 2.9 * t + 11 * un))
            relief = 0.085 * abs(math.sin(phase)) ** 0.5 * sstep(0, 0.1, v)
            hem = math.cos(sstep(0.86, 1.0, v) * math.pi / 2)          # roll the hem back under
            out = (0.075 + 0.05 * math.sin(math.pi * min(1, v * 1.3)) + relief) * hem - 0.12 * (1 - hem)
            ce = math.cos(e * math.pi / 2)
            P[r, c] = p + n * (out * ce - 0.14 * e) + side * 0.09 * math.sin(e * math.pi / 2)
            UV[r, c] = (phase / math.pi, t * 2.6)
            w = {}
            sk = t * K
            for b in range(K):
                hv = max(0.0, 1 - abs(sk - (b + 0.5)))
                if b == 0 and sk < 0.5: hv = 1.0
                if hv > 0:
                    if fr < 0.999: w[f"s{CORE[i][0]}_{b}"] = hv * (1 - fr)
                    if fr > 0.001: w[f"s{CORE[i + 1][0]}_{b}"] = hv * fr
            tot = sum(w.values()); row.append({k_: x / tot for k_, x in w.items()})
        W.append(row)
    wool.grid(P, UV, W)


# woolly under-layer on the jaw so no skin shows between the locks or under the chin (rigid with the head)
NB = 72
P = np.zeros((10, NB, 3)); UV = np.zeros((10, NB, 2))
for r in range(10):
    for c in range(NB):
        th = -1.3 + 2.6 * c / (NB - 1)   # the jaw and the cheeks only: without the hood (look `hood: false`) the back of the head shows
        zt = min(0.28, jaw(th * 0.89) + 0.02)
        z = zt - (zt + 1.08) * r / 9
        fade = 1 - sstep(0.7, 1.0, abs(th) / 1.3)   # the band's ends sink into the head: no flat edge in profile
        P[r, c] = surf(th, z, (0.03 + 0.015 * math.sin(c * 1.7) * math.sin(r * 1.1)) * fade - 0.03 * (1 - fade))
        UV[r, c] = (c * 0.5, r * 0.3)
wool.grid(P, UV, [HEADW] * 10, flip=True)
wool.grid(P, UV, [HEADW] * 10)   # (an open band now: both faces, seen from inside at its ends)
# hair locks beside the face, under the hood (rigid with the head)
for sx in (1, -1):
    for j, th0 in enumerate((0.97, 1.07, 1.17)):
        def f(t, sx=sx, th0=th0, j=j):
            th = sx * (th0 - 0.05 * t + 0.02 * math.sin(8 * t + j)); z = 0.12 - 0.6 * t
            return surf(th, z, -0.01 + 0.01 * math.sin(7 * t + j))   # kept under the hood (a lock poked through its side)
        strand(f, 0.08, 0.045, sim=False, rigid=HEADW)
    for j, th0 in enumerate((0.74, 0.82, 0.9)):
        def f(t, sx=sx, th0=th0, j=j):
            th = sx * (th0 - 0.08 * t + 0.03 * math.sin(7 * t + 2 * j)); z = 0.42 - 0.04 * j - 0.75 * t
            return surf(th, z, 0.02 + 0.03 * math.sin(math.pi * t) + 0.008 * math.sin(9 * t + j))
        strand(f, 0.075, 0.05, sim=False, rigid=HEADW, sides=10)
N_BEARD = SID[0]

# moustache: two curled lobes parted in the middle, framing the mouth (rigid on must.L / must.R)
for sx, sd in ((1, "L"), (-1, "R")):
    c = surf(sx * 0.05, -0.06, 0.05)
    bone(f"must.{sd}", c, c + np.array([sx * 0.3, 0, 0]), "head")
    for j in range(5):
        def f(t, j=j, sx=sx):
            th = sx * (0.07 + (0.30 + 0.025 * j) * t ** 0.85)
            z = -0.03 - j * 0.03 - (0.30 + j * 0.02) * t ** 1.3 - 0.10 * sstep(0.55, 1.0, t)
            out = 0.05 + (0.075 + 0.06 * math.sin(math.pi * (j + 0.5) / 5)) * math.sin(math.pi * t ** 0.8) * (1 - 0.4 * t) + 0.015 * math.sin(9 * t + j)
            return surf(th, z, out)
        if SOFT: strand(f, 0.098 - 0.005 * j, 0.05, sim=False, rigid={f"must.{sd}": 1.0}, sides=10)
        else: strand(f, 0.105 - 0.005 * j, 0.06, sim=False, rigid={f"must.{sd}": 1.0}, sides=10, sub=2, turns=1.6)
# brows
for sx, sd in ((1, "L"), (-1, "R")):
    c = surf(sx * 0.36, 0.5, 0.03)
    bone(f"brow.{sd}", c, c + np.array([math.sin(sx * 0.33), -math.cos(sx * 0.33), 0]) * 0.2, "head")
    for j in range(9):
        jr = random.Random(500 + j + (0 if sx > 0 else 50))
        o1, o2, o3 = jr.uniform(-0.02, 0.02), jr.uniform(0.0, 0.08), jr.uniform(0.85, 1.05)
        def f(t, j=j, sx=sx, o1=o1, o2=o2, o3=o3):
            t2 = t * o3
            th = sx * (0.14 + 0.02 * (j % 3) + 0.62 * t2)
            z = 0.31 + (j % 5) * 0.026 * (1 - 0.5 * t2) + o1 + 0.1 * math.sin(math.pi * t2 ** 0.8 * 0.9) - 0.16 * t2 ** 2.2 + (0.05 + o2) * sstep(0.7, 1.0, t2)
            return surf(th, z, 0.04 + 0.05 * math.sin(math.pi * t2) - 0.004 * (j % 5) + 0.01 * (j // 5))
        strand(f, 0.062, 0.022, sim=False, rigid={f"brow.{sd}": 1.0}, sides=7)

# ---------------------------------------------------------------- cloak (hood + cowl)
cloak = MB()
ZTOP = 0.76
# the crown of the hood: round like a ball over the head (the demo's flatter dome read as a flat head)
DZ0, DR = 0.12, 1.08


def cloak_AB(z):
    dome = max(0.02, math.sqrt(max(0.0, 1 - ((z - DZ0) / DR) ** 2))) if z > DZ0 else 1.0
    a, b = body_ab(z)
    return smax(1.17, a + 0.12) * dome, smax(1.17, b) * dome, smax(1.18, b + 0.2) * dome   # a small hood: close round the head and the nape


def th_open(z):
    if z >= ZTOP: return 0.0
    if z >= 0: return 1.08 * (1 - (z / ZTOP) ** 3.2) ** (1 / 2.2)
    x0 = 1.17 * math.sin(1.08)
    xo = x0 + 0.06 * sstep(0, -0.7, z) - 0.16 * sstep(-0.9, -1.8, z) - 0.25 * sstep(-1.8, -3.6, z)
    return math.asin(min(1.0, xo / cloak_AB(z)[0]))


def cloak_pt(phi, z):
    A, Bf, Bb = cloak_AB(z)
    B = Bf if math.cos(phi) > 0 else Bb
    rad = 1 / math.sqrt((math.sin(phi) / A) ** 2 + (math.cos(phi) / B) ** 2 + 1e-9)
    low = sstep(-0.7, -1.5, z)
    cb = max(0.0, -math.cos(phi))
    rad *= 1 + 0.05 * math.sin(5 * phi + 1.2 * z) * low + 0.012 * math.sin(11 * phi - 3 * z) * low + 0.012 * math.sin(3 * phi + 5 * z)
    # (the demo's cinch at the neck is gone: on the toy body it read as a ring round the neck)
    # the small hood just hangs: its hem widens a little and falls loosely over the nape and the shoulders (a hem drawn
    # in round the neck read as a ring)
    rad *= 1 + 0.1 * sstep(-0.6, HOOD_BOTTOM, z)
    # floppy peak falling back
    pk = cb ** 4 * math.exp(-((z - 0.55) / 0.3) ** 2)
    back = cb ** 2 * sstep(0.0, 1.0, z)
    dm = math.sqrt(max(0.0, 1 - ((z - DZ0) / DR) ** 2)) if z > DZ0 else 1.0
    # a small hood: it falls lower at the back (over the nape, where the beard's locks end) than at the sides
    zb = z - 0.3 * cb ** 2 * sstep(-0.4, HOOD_BOTTOM, z)
    return np.array([rad * math.sin(phi), -rad * math.cos(phi) + 0.2 * back * dm, zb - 0.06 * back * (1 - dm)])


def cloak_w(z):
    w = sstep(-1.5, -0.5, z)
    return {"head": w, "root": 1 - w}


czs = [DZ0 + DR * math.sin(b) for b in np.linspace(math.pi / 2, math.asin((ZTOP - DZ0) / DR), 12)]
czs += [ZTOP * math.sin(g) for g in np.linspace(math.pi / 2 * 0.86, 0, 10)]
# the hood ends on the shoulders (the demo's long mantle went down to z -3.6): the toy monk's own mantle (look
# `cloak: "mantle"`, rigged so the arms lift it) covers the body under it
HOOD_BOTTOM = -1.3
czs += list(np.linspace(-0.1, HOOD_BOTTOM, 10))
NC = 56
P = np.zeros((len(czs), NC, 3)); UV = np.zeros((len(czs), NC, 2)); W = []
edgeL, edgeR = [], []
for i, z in enumerate(czs):
    to = th_open(z)
    for j in range(NC):
        phi = to + (2 * math.pi - 2 * to) * j / (NC - 1)
        P[i, j] = cloak_pt(phi, z)
        UV[i, j] = (phi * 1.2, z) if z < 0.62 else (P[i, j][0] * 0.75, -P[i, j][1] * 0.75)   # planar on the crown: no pinched rings at the pole
    W.append(cloak_w(z))
    if z < ZTOP:
        edgeL.append((P[i, 0], z)); edgeR.append((P[i, -1], z))
ks = max(i for i, z in enumerate(czs) if z >= 0.62)          # last crown row: split there so the UV change is a clean seam
UVs = UV[ks:].copy()
for j in range(NC):
    to0 = th_open(czs[ks]); UVs[0, j] = ((to0 + (2 * math.pi - 2 * to0) * j / (NC - 1)) * 1.2, czs[ks])
cloak.grid(P[:ks + 1], UV[:ks + 1], W[:ks + 1])
cloak.grid(P[ks:], UVs, W[ks:])
# rolled brim along the opening edge
edge = [e for e in reversed(edgeR)] + [(cloak_pt(0, ZTOP + 0.005), ZTOP)] + edgeL
ep = np.array([e[0] for e in edge]); ez = [e[1] for e in edge]
for _ in range(2):  # smooth
    ep[1:-1] = (ep[:-2] + 2 * ep[1:-1] + ep[2:]) / 4
ep[:, 1] -= 0.03
cloak.tube(ep, [0.085 + 0.075 * sstep(-1.2, 0.0, z) for z in ez], [cloak_w(z) for z in ez], sides=10, vrep=0.6, urep=0.6)

# the crown of the hood: a soft knitted cap that rises a little above the head and slumps over (like the cap of the
# reference picture), a short wide cone with a round end that starts inside the hood's dome (the seam is hidden)
PEAKS = {
    "none": None,
    "fold": [(0, 0.06, 0.42), (0, 0.06, 0.85), (0.03, 0.12, 1.2), (0.1, 0.32, 1.44), (0.17, 0.56, 1.46), (0.22, 0.72, 1.32)],
    "back": [(0, 0.08, 0.42), (0, 0.1, 0.78), (0, 0.2, 1.02), (0, 0.42, 1.16), (0, 0.62, 1.12)],
    "side": [(0, 0.05, 0.42), (0, 0.04, 0.78), (0.1, 0.0, 1.02), (0.32, -0.04, 1.14), (0.5, -0.02, 1.08)],
    "front": [(0, 0.1, 0.42), (0, 0.08, 0.8), (0, -0.04, 1.05), (0, -0.26, 1.15), (0, -0.42, 1.08)],
}
PEAK = PEAKS[os.environ.get("YARN_PEAK", "none")]   # no peak on top: a round crown
if PEAK:
    pp = np.array(PEAK, float)
    spine = []
    for u in np.linspace(0, len(pp) - 1.001, 24):
        k = int(u); f = u - k; spine.append(pp[k] * (1 - f) + pp[k + 1] * f)
    spine = np.array(spine)
    for _ in range(3):
        spine[1:-1] = (spine[:-2] + 2 * spine[1:-1] + spine[2:]) / 4
    prad = [0.98 * (1 - (0.55 if PEAK is not PEAKS['fold'] else 0.8) * (i / 23) ** 1.3) for i in range(24)]
    cloak.tube(spine, prad, [HEADW] * 24, sides=28, cap0=False, vrep=1.0, urep=3.5)

# ---------------------------------------------------------------- assemble
def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    arm_d = bpy.data.armatures.new("Rig")
    arm = bpy.data.objects.new("Rig", arm_d)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    for name, h, t, par in BONES:
        eb = arm_d.edit_bones.new(name); eb.head = h; eb.tail = t
        if par: eb.parent = arm_d.edit_bones[par]
    bpy.ops.object.mode_set(mode='OBJECT')
    M = {
        "skin": mat("skin", (1.0, 0.72, 0.05)), "eye": mat("eye", (0.01, 0.01, 0.012)),
        "eyehi": mat("eyehi", (1, 1, 1)), "line": mat("line", (0.8, 0.4, 0.02)), "blush": mat("blush", (1.0, 0.45, 0.3)), "mouth": mat("mouth", (0.25, 0.03, 0.03)),
        "tongue": mat("tongue", (0.9, 0.2, 0.15)), "wool": mat("wool", (0.93, 0.9, 0.84)),
        "cloak": mat("cloak", (0.09, 0.085, 0.1)),
    }
    skin.obj("Skin", M["skin"], arm)
    lines.obj("Lines", M["line"], arm)
    blush.obj("Blush", M["blush"], arm)
    eyes.obj("Eyes", M["eye"], arm)
    eyehi.obj("EyeHi", M["eyehi"], arm)
    mouth_obj("Mouth", M["mouth"], False, arm)
    mouth_obj("Tongue", M["tongue"], True, arm)
    wool.obj("Wool", M["wool"], arm)
    cloak.obj("Cloak", M["cloak"], arm, recalc=False)
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True, export_skins=True,
                              export_morph=True, export_animations=False, export_apply=False,
                              export_all_influences=False, export_def_bones=False)
    print("exported", OUT, os.path.getsize(OUT) // 1024, "KB;", len(BONES), "bones;", N_BEARD, "beard strands")


main()
