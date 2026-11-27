"""Brațe și palme 2.5D: portul Python al `studio/palme/rig.js` și `hands.js`.

Python pur, fără `bpy`, ca să poată fi testat în afara Blender. Funcțiile au
aceleași nume și dau aceleași numere ca implementarea de referință JavaScript
(`tests/palme25d_test.py` compară cu fixture-urile scrise de
`tools/palme-fixtures.mjs`, cu toleranța 1e-6).

Principiul (vezi `experiments/cleopa-palme/SPECIFICATIE.md`): mișcarea se
calculează în 3D, imaginea se desenează în 2D. Un proxy 3D primitiv dă umărul,
cotul, încheietura și fiecare falangă; palma se desenează din volumele lui
proiectate (abordarea C), iar în cadrele ținute un desen de autor (A) se
ancorează la punctul de contact.

Axe: x spre stânga personajului (dreapta ecranului când e cu fața), y în sus,
z spre cameră. Dreapta anatomică este în stânga ecranului.

Spre deosebire de `rig.js`, proporțiile mâinii și ale brațului sunt parametri
(`Hand`, lungimile din `solve`), cu valorile implicite din JavaScript. Așa
același cod servește atelierul `/palme/` și fiecare personaj din episod.
"""
from math import acos, atan2, cos, hypot, pi, sin, sqrt

DEG = pi/180


# --- Vectori 3D ---------------------------------------------------------------
def add(a, b):
    return (a[0]+b[0], a[1]+b[1], a[2]+b[2])


def sub(a, b):
    return (a[0]-b[0], a[1]-b[1], a[2]-b[2])


def mul(a, s):
    return (a[0]*s, a[1]*s, a[2]*s)


def dot(a, b):
    return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def length(a):
    return sqrt(a[0]*a[0]+a[1]*a[1]+a[2]*a[2])


def norm(a):
    n = length(a)
    return mul(a, 1/(n or 1))


def lerp(a, b, t):
    return a+(b-a)*t


def lerp3(a, b, t):
    return (lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t))


def rotate(v, k, angle):
    """Rotația Rodrigues a lui v în jurul axei unitare k."""
    c, s = cos(angle), sin(angle)
    return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v)*(1-c)))


# --- Vectori 2D ---------------------------------------------------------------
def sub2(a, b):
    return (a[0]-b[0], a[1]-b[1])


def add2(a, b):
    return (a[0]+b[0], a[1]+b[1])


def mul2(a, s):
    return (a[0]*s, a[1]*s)


def len2(a):
    return hypot(a[0], a[1])


def lerp2(a, b, t):
    return (a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t)


def cross2(a, b):
    return a[0]*b[1]-a[1]*b[0]


# --- Cuaternioni [w, x, y, z] ------------------------------------------------
def quat_from_basis(x, y, z):
    m00, m10, m20 = x
    m01, m11, m21 = y
    m02, m12, m22 = z
    trace = m00+m11+m22
    if trace > 0:
        s = sqrt(trace+1)*2
        q = (s/4, (m21-m12)/s, (m02-m20)/s, (m10-m01)/s)
    elif m00 > m11 and m00 > m22:
        s = sqrt(1+m00-m11-m22)*2
        q = ((m21-m12)/s, s/4, (m01+m10)/s, (m02+m20)/s)
    elif m11 > m22:
        s = sqrt(1+m11-m00-m22)*2
        q = ((m02-m20)/s, (m01+m10)/s, s/4, (m12+m21)/s)
    else:
        s = sqrt(1+m22-m00-m11)*2
        q = ((m10-m01)/s, (m02+m20)/s, (m12+m21)/s, s/4)
    n = sqrt(sum(v*v for v in q))
    return tuple(v/n for v in q)


def quat_rotate(q, v):
    w, x, y, z = q
    u = (x, y, z)
    t = mul(cross(u, v), 2)
    return add(add(v, mul(t, w)), cross(u, t))


def slerp(a, b, t):
    """Interpolarea orientării palmei. Pe componente, o răsucire de 180° ar trece prin zero."""
    d = a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]
    if d < 0:
        b = tuple(-v for v in b)
        d = -d
    if d > .9995:
        q = tuple(lerp(v, b[i], t) for i, v in enumerate(a))
        n = sqrt(sum(v*v for v in q))
        return tuple(v/n for v in q)
    theta = acos(d)
    s = sin(theta)
    wa, wb = sin((1-t)*theta)/s, sin(t*theta)/s
    return tuple(v*wa+b[i]*wb for i, v in enumerate(a))


def quat_angle(a, b):
    return 2*acos(min(1, abs(a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3])))


def hand_quat(direction, palm):
    """Cadrul palmei: x spre degetul mare, y de-a lungul degetelor, z din dosul palmei."""
    y = norm(direction)
    n = norm(sub(palm, mul(y, dot(palm, y))))
    z = mul(n, -1)
    return quat_from_basis(cross(y, z), y, z)


# --- IK cu două oase de lungime fixă ----------------------------------------
def two_bone(root, target, l1, l2, pole):
    d = sub(target, root)
    reach = length(d)
    dist = min(max(reach, abs(l1-l2)+1e-3), l1+l2-1e-4)
    dn = norm(d)
    x = (l1*l1-l2*l2+dist*dist)/(2*dist)
    h = sqrt(max(0, l1*l1-x*x))
    side = sub(pole, mul(dn, dot(pole, dn)))
    if length(side) < 1e-6:
        side = cross(dn, (0, 0, 1))
    joint = add(add(root, mul(dn, x)), mul(norm(side), h))
    return {"joint": joint, "end": add(root, mul(dn, dist)), "miss": max(0, reach-dist)}


# --- Proporțiile mâinii ------------------------------------------------------
class Hand:
    """Palma Mamei din `rig.js` (cm). `scale` și `thickness` sunt factorii de desen animat."""
    palm = ((2.1, .9, 0, 1.55), (-2.0, .9, 0, 1.5), (2.6, 7.4, 0, 1.25), (.9, 8.0, 0, 1.25),
            (-.9, 7.8, 0, 1.2), (-2.5, 7.1, 0, 1.1), (.1, 4.0, 0, 1.75))
    fingers = (
        {"id": "aratator", "base": (2.6, 7.6, 0), "len": (3.0, 2.0, 1.7), "r": .93, "spread": 11},
        {"id": "mijlociu", "base": (.9, 8.2, 0), "len": (3.3, 2.2, 1.8), "r": .96, "spread": 3},
        {"id": "inelar", "base": (-.9, 8.0, 0), "len": (3.1, 2.1, 1.7), "r": .91, "spread": -6},
        {"id": "mic", "base": (-2.5, 7.2, 0), "len": (2.4, 1.6, 1.4), "r": .8, "spread": -15},
    )
    thumb = {"id": "mare", "base": (2.3, 1.7, -.4), "len": (3.0, 2.4, 2.0), "r": 1.05}
    taper = (1, .93, .86)

    def __init__(self, scale=1.3, thickness=1.15):
        self.scale = scale
        self.thickness = thickness


HAND = Hand()
ARM = {"upper": 24, "fore": 21, "shoulder": (-14, 118, 0)}

# Gesturi: îndoirea fiecărui deget (arătător, mijlociu, inelar, mic), răsfirarea,
# opoziția și îndoirea degetului mare, ciupitul cu trei degete.
GESTURES = {
    "deschis": {"curl": (-.05, -.05, -.05, -.05), "spread": .8, "opp": 0, "tcurl": 0, "pinch": 0},
    "relaxat": {"curl": (.22, .28, .34, .42), "spread": .2, "opp": .35, "tcurl": .25, "pinch": 0},
    "pumn": {"curl": (1, 1, 1, 1), "spread": 0, "opp": .85, "tcurl": .8, "pinch": 0},
    "aratator": {"curl": (0, 1, 1, 1), "spread": .1, "opp": .8, "tcurl": .7, "pinch": 0},
    "treiDegete": {"curl": (.5, .46, 1, 1), "spread": -.3, "opp": 1, "tcurl": .4, "pinch": 1},
    "cupa": {"curl": (.55, .6, .62, .66), "spread": .2, "opp": .6, "tcurl": .3, "pinch": 0},
}
GESTURE_NAMES = tuple(GESTURES)


def mix_gesture(a, b, t):
    return {
        "curl": tuple(lerp(v, b["curl"][i], t) for i, v in enumerate(a["curl"])),
        "spread": lerp(a["spread"], b["spread"], t), "opp": lerp(a["opp"], b["opp"], t),
        "tcurl": lerp(a["tcurl"], b["tcurl"], t), "pinch": lerp(a["pinch"], b["pinch"], t),
    }


def hand_local(g, hand=HAND):
    """Lanțurile degetelor în coordonatele palmei; `dorsal` este dosul fiecărei falange."""
    digits = []
    for i, finger in enumerate(hand.fingers):
        a = finger["spread"]*(.4+g["spread"])*DEG
        dir0 = (sin(a), cos(a), 0)
        side = norm(cross(dir0, (0, 0, -1)))
        curl = g["curl"][i]
        bends = (88*curl, 100*max(0, curl), 70*max(0, curl))
        pts = [finger["base"]]
        dorsal = []
        total, p = 0, finger["base"]
        for k in range(3):
            total += bends[k]*DEG
            d = rotate(dir0, side, total)
            dorsal.append(rotate((0, 0, 1), side, total))
            p = add(p, mul(d, finger["len"][k]))
            pts.append(p)
        digits.append({"id": finger["id"], "pts": pts, "r": [finger["r"]*t for t in hand.taper],
                       "bends": bends, "dorsal": dorsal})
    pinch_point = mul(add(add(digits[0]["pts"][3], digits[1]["pts"][3]), (0, 0, -.5)), .5)
    # Degetul mare: metacarpianul pivotează din lateralul palmei în fața ei.
    thumb = hand.thumb
    rest, opposed = norm((.72, .62, -.3)), norm((-.15, .62, -.77))
    d0 = norm(lerp3(rest, opposed, g["opp"]))
    toward = norm((-.8, .2, -.55))
    side = norm(cross(d0, toward))
    m = add(thumb["base"], mul(d0, thumb["len"][0]))
    b1, b2 = 35*g["tcurl"], 50*g["tcurl"]
    d1, d2 = rotate(d0, side, b1*DEG), rotate(d0, side, (b1+b2)*DEG)
    j = add(m, mul(d1, thumb["len"][1]))
    tip = add(j, mul(d2, thumb["len"][2]))
    if g["pinch"] > 0:
        goal = lerp3(tip, pinch_point, g["pinch"])
        solved = two_bone(m, goal, thumb["len"][1], thumb["len"][2], add(mul(d0, .2), (.4, 0, .6)))
        j, tip = solved["joint"], solved["end"]
    thumb_dorsal = norm(cross(side, d0))
    thumb_digit = {"id": thumb["id"], "pts": [thumb["base"], m, j, tip],
                   "r": [thumb["r"]*t for t in hand.taper],
                   "bends": (0, 30*g["opp"]+b1, b2), "dorsal": [thumb_dorsal]*3}
    if g["pinch"] > .5:
        contact = mul(add(add(digits[0]["pts"][3], digits[1]["pts"][3]), tip), 1/3)
    else:
        contact = digits[0]["pts"][3]
    S, T = hand.scale, hand.scale*hand.thickness
    return {
        "palm": [(x*S, y*S, z*S, r*T) for x, y, z, r in hand.palm],
        "digits": [dict(d, pts=[mul(p, S) for p in d["pts"]], r=[r*T for r in d["r"]])
                   for d in [thumb_digit, *digits]],
        "contact": mul(contact, S),
    }


# --- Ancore pe corp și ținte de contact -------------------------------------
BODY = {
    "head": (0, 146, 4), "headR": 19,
    "targets": {"frunte": (0, 152, 22.5), "piept": (0, 106, 11),
                "umarDrept": (-10, 117, 9.5), "umarStang": (10, 117, 9.5)},
}

# --- Testele de stres din /palme/ -------------------------------------------
UP, CAM = (0, 1, 0), (0, 0, 1)
_REST = {"w": (-17, 86, 1), "dir": (.05, -1, .08), "palm": (1, 0, 0), "g": "relaxat"}


def _flat(angle):
    return (-sin(angle*DEG), 0, cos(angle*DEG))


def _k(t, **fields):
    return {"t": t, **fields}


def _salut():
    keys = [_k(0, **_REST), _k(.6, w=(-17, 130, 10), dir=UP, palm=CAM, g="deschis")]
    for i in range(7):
        a = (1 if i % 2 else -1)*32*DEG
        keys.append(_k(.77+i*.17, w=(-17, 130, 10), dir=(sin(a), cos(a), 0), palm=CAM, g="deschis"))
    keys += [_k(2.2, w=(-17, 130, 10), dir=UP, palm=CAM, g="relaxat"), _k(2.9, **_REST)]
    return keys


_W = (-9, 116, 20)
TESTS = [
    {"id": "rasucire", "keys": [
        _k(0, **_REST),
        _k(.7, w=_W, dir=UP, palm=CAM, g="deschis"),
        _k(1.2, w=_W, dir=UP, palm=_flat(-60), g="deschis"),
        _k(1.7, w=_W, dir=UP, palm=_flat(-120), g="deschis"),
        _k(2.2, w=_W, dir=UP, palm=_flat(-180), g="deschis"),
        _k(2.6, w=_W, dir=UP, palm=_flat(-180), g="deschis"),
        _k(3.2, w=_W, dir=UP, palm=_flat(-90), g="deschis"),
        _k(3.8, w=_W, dir=UP, palm=CAM, g="deschis"),
        _k(4.5, w=(-8, 112, 22), dir=(.95, .15, .1), palm=(0, 1, .3), g="deschis"),
        _k(5.2, w=(-8, 112, 22), dir=(.95, .15, .1), palm=(0, -1, .3), g="deschis"),
        _k(6.0, **_REST),
    ]},
    {"id": "pumn", "keys": [
        _k(0, **_REST),
        _k(.6, w=(-10, 112, 18), dir=UP, palm=CAM, g="deschis"),
        _k(1.1, w=(-10, 112, 18), dir=UP, palm=CAM, g="pumn"),
        _k(1.5, w=(-10, 112, 18), dir=UP, palm=CAM, g="pumn"),
        _k(2.0, w=(-10, 112, 18), dir=UP, palm=CAM, g="deschis"),
        _k(2.6, w=(-10, 112, 18), dir=UP, palm=mul(CAM, -1), g="deschis"),
        _k(3.1, w=(-10, 112, 18), dir=UP, palm=mul(CAM, -1), g="pumn"),
        _k(3.5, w=(-10, 112, 18), dir=(.3, .9, .2), palm=(.5, 0, -1), g="pumn"),
        _k(4.0, w=(-10, 112, 18), dir=UP, palm=(1, 0, -.2), g="deschis"),
        _k(4.6, **_REST),
    ]},
    {"id": "aratare", "keys": [
        _k(0, **_REST),
        _k(.7, w=(-11, 114, 16), dir=UP, palm=(1, 0, 0), g="aratator"),
        _k(1.3, w=(-9, 112, 24), dir=(.05, .12, 1), palm=(.9, -.4, 0), g="aratator"),
        _k(2.1, w=(-9, 112, 24), dir=(.05, .12, 1), palm=(.9, -.4, 0), g="aratator"),
        _k(2.8, w=(-22, 114, 10), dir=(-1, .1, .25), palm=(0, -1, .2), g="aratator"),
        _k(3.5, w=(-6, 128, 14), dir=(.55, .65, .5), palm=(.6, -.4, -.5), g="aratator"),
        _k(4.1, w=(-6, 128, 14), dir=(.55, .65, .5), palm=(.6, -.4, -.5), g="aratator"),
        _k(4.8, **_REST),
    ]},
    {"id": "salut", "keys": _salut()},
    {"id": "cruce", "keys": [
        _k(0, **_REST),
        _k(.5, w=(-9, 110, 16), dir=(.1, .6, -.3), palm=(.6, -.4, -.3), g="treiDegete"),
        _k(1.0, tip="frunte", dir=(.12, .6, -.8), palm=(.75, -.55, 0), g="treiDegete"),
        _k(1.35, tip="frunte", dir=(.12, .6, -.8), palm=(.75, -.55, 0), g="treiDegete", contact="frunte"),
        _k(1.85, tip="piept", dir=(.2, .3, -.9), palm=(.85, -.35, 0), g="treiDegete"),
        _k(2.2, tip="piept", dir=(.2, .3, -.9), palm=(.85, -.35, 0), g="treiDegete", contact="piept"),
        _k(2.65, tip="umarDrept", dir=(-.25, .35, -.9), palm=(.85, -.2, 0), g="treiDegete"),
        _k(3.0, tip="umarDrept", dir=(-.25, .35, -.9), palm=(.85, -.2, 0), g="treiDegete", contact="umarDrept"),
        _k(3.5, tip="umarStang", dir=(.45, .3, -.85), palm=(.5, -.3, .3), g="treiDegete"),
        _k(3.85, tip="umarStang", dir=(.45, .3, -.85), palm=(.5, -.3, .3), g="treiDegete", contact="umarStang"),
        _k(4.6, **_REST),
    ]},
    {"id": "orbita", "keys": [
        _k(0, cam=0, **_REST),
        _k(.6, w=(-10, 114, 18), dir=(.2, 1, .15), palm=(.4, 0, 1), g="cupa", cam=0),
        _k(1.8, w=(-10, 114, 18), dir=(.2, 1, .15), palm=(.4, 0, 1), g="pumn", cam=-70),
        _k(3.2, w=(-10, 114, 18), dir=(.2, 1, .15), palm=(.4, 0, 1), g="deschis", cam=70),
        _k(4.2, w=(-10, 114, 18), dir=(.2, 1, .15), palm=(.4, 0, 1), g="relaxat", cam=0),
        _k(4.8, cam=0, **_REST),
    ]},
]
TESTS_BY_ID = {t["id"]: t for t in TESTS}
FPS = 24
POLE_R = (-.6, -.5, -.55)


def duration(test):
    return test["keys"][-1]["t"]


def ease(t):
    return 4*t*t*t if t < .5 else 1-(-2*t+2)**3/2


def resolve_key(key, targets=None, hand=HAND):
    """Gestul, rotația și încheietura unei chei. O cheie cu `tip` calculează încheietura din contact."""
    g = GESTURES[key["g"]] if isinstance(key["g"], str) else key["g"]
    q = hand_quat(key["dir"], key["palm"])
    local = hand_local(g, hand)
    targets = targets or BODY["targets"]
    w = sub(targets[key["tip"]], quat_rotate(q, local["contact"])) if key.get("tip") else key["w"]
    return dict(key, g=g, q=q, w=w, pole=key.get("pole", POLE_R))


_RESOLVED = {}


def keys_of(test):
    if id(test) not in _RESOLVED:
        _RESOLVED[id(test)] = [resolve_key(k) for k in test["keys"]]
    return _RESOLVED[id(test)]


def pose_between(a, b, t):
    return {"w": lerp3(a["w"], b["w"], t), "q": slerp(a["q"], b["q"], t),
            "g": mix_gesture(a["g"], b["g"], t), "pole": lerp3(a["pole"], b["pole"], t),
            "cam": lerp(a.get("cam", 0), b.get("cam", 0), t)}


def pose_at(test, time, keys=None):
    keys = keys or keys_of(test)
    i = 0
    while i < len(keys)-2 and keys[i+1]["t"] <= time:
        i += 1
    a, b = keys[i], keys[i+1]
    t = ease(min(1, max(0, (time-a["t"])/(b["t"]-a["t"]))))
    return pose_between(a, b, t)


def contact_at(test, time):
    keys = keys_of(test)
    for i in range(1, len(keys)):
        k = keys[i]
        if (k.get("contact") and keys[i-1]["t"]-1e-6 <= time <= k["t"]+1e-6
                and keys[i-1].get("tip") == k.get("tip")):
            return k["contact"]
    return None


def solve(pose, hand=HAND, shoulder=ARM["shoulder"], upper=ARM["upper"], fore=ARM["fore"]):
    """Proxy-ul în spațiul lumii pentru un cadru."""
    local = hand_local(pose["g"], hand)
    arm = two_bone(shoulder, pose["w"], upper, fore, pose["pole"])
    W = arm["end"]
    q = pose["q"]

    def to_world(p):
        return add(W, quat_rotate(q, p))
    axes = {"x": quat_rotate(q, (1, 0, 0)), "y": quat_rotate(q, (0, 1, 0)), "z": quat_rotate(q, (0, 0, 1))}
    return {
        "S": shoulder, "E": arm["joint"], "W": W, "miss": arm["miss"], "q": q, "g": pose["g"], "axes": axes,
        "palm": [{"p": to_world((x, y, z)), "r": r} for x, y, z, r in local["palm"]],
        "digits": [{"id": d["id"], "pts": [to_world(p) for p in d["pts"]], "r": d["r"], "bends": d["bends"],
                    "dorsal": [quat_rotate(q, v) for v in d["dorsal"]]} for d in local["digits"]],
        "contact": to_world(local["contact"]),
        "local": local, "to_world": to_world,
    }


# --- Camera ortografică -----------------------------------------------------
class Camera:
    def __init__(self, yaw=0, cx=-2, cy=122, half=36, width=960, height=540):
        self.yaw, self.cx, self.cy, self.width, self.height = yaw, cx, cy, width, height
        self.k = height/(2*half)
        self._c, self._s = cos(yaw*DEG), sin(yaw*DEG)

    def p(self, v):
        """[x ecran, y ecran, adâncime]; o adâncime mai mare e mai aproape de cameră."""
        x = v[0]*self._c+v[2]*self._s
        z = -v[0]*self._s+v[2]*self._c
        return (self.width/2+(x-self.cx)*self.k, self.height/2-(v[1]-self.cy)*self.k, z)

    def d(self, v):
        return (v[0]*self._c+v[2]*self._s, v[1], -v[0]*self._s+v[2]*self._c)


class Identity:
    """Camera episodului: frontală, ortografică, cu XY ca plan al imaginii și +Z spre cameră.

    Proiecția nu răstoarnă y-ul, așa că testele de orientare se citesc direct în rig.
    `k` convertește unitățile proxy-ului în unitățile imaginii (aici 1)."""
    k = 1

    def p(self, v):
        return (v[0], v[1], v[2])

    def d(self, v):
        return (v[0], v[1], v[2])


# --- Geometrie 2D -----------------------------------------------------------
def hull(points):
    """Învelitoarea convexă (lanț monoton), în aceeași ordine ca `draw.js`."""
    p = sorted(points, key=lambda q: (q[0], q[1]))
    if len(p) < 3:
        return p

    def turn(o, a, b):
        return cross2(sub2(a, o), sub2(b, o))
    lower, upper = [], []
    for q in p:
        while len(lower) >= 2 and turn(lower[-2], lower[-1], q) <= 0:
            lower.pop()
        lower.append(q)
    for q in reversed(p):
        while len(upper) >= 2 and turn(upper[-2], upper[-1], q) <= 0:
            upper.pop()
        upper.append(q)
    return lower[:-1]+upper[:-1]


def circle_hull(circles, steps=14):
    points = []
    for c in circles:
        (cx, cy), r = c["c"], c["r"]
        for i in range(steps):
            a = i/steps*pi*2
            points.append((cx+cos(a)*r, cy+sin(a)*r))
    return hull(points)


# --- Proiecția proxy-ului ---------------------------------------------------
def project_rig(rig, cam):
    P = cam.p
    palm = []
    for c in rig["palm"]:
        q = P(c["p"])
        palm.append({"c": (q[0], q[1]), "z": q[2], "r": c["r"]*cam.k})
    return {
        "k": cam.k, "palm": palm, "palmZ": sum(c["z"] for c in palm)/len(palm),
        "digits": [{"id": d["id"], "pts": [P(p) for p in d["pts"]], "r": [r*cam.k for r in d["r"]],
                    "bends": d["bends"], "dorsal": [cam.d(v) for v in d["dorsal"]]} for d in rig["digits"]],
        "axes": {k: cam.d(v) for k, v in rig["axes"].items()},
        "W": P(rig["W"]), "E": P(rig["E"]), "S": P(rig["S"]), "contact": P(rig["contact"]),
        "to_screen": lambda local: P(rig["to_world"](local)), "g": rig["g"],
    }


def xy(p):
    return (p[0], p[1])


def facing(h):
    """> 0 când palma privește spre cameră."""
    return -h["axes"]["z"][2]


def creases(hand=HAND):
    s = hand.scale
    return {"long": [tuple(v*s for v in p) for p in ((2.5, 6.6, -1.7), (.8, 4.6, -1.9), (1.3, 1.9, -1.8))],
            "short": [tuple(v*s for v in p) for p in ((-2.5, 6.1, -1.6), (-.4, 5.9, -1.8))]}


# --- C: volume proiectate ---------------------------------------------------
BEND_SPLIT = 40
SKIN, SHADE = "skin", "shade"


def build_volume(h, details=True, memory=None, hand=HAND):
    """Piesele palmei, de la spate la față.

    Un deget drept face corp comun cu palma; o articulație îndoită peste 40° începe
    o piesă nouă, deci linia de contur apare unde ar pune-o un animator.
    """
    lw = max(1.2, .26*h["k"])
    palm_poly = circle_hull(h["palm"])
    palm = {"id": "palm", "z": h["palmZ"], "shapes": [{"t": "poly", "pts": palm_poly}], "details": []}
    groups = [palm]
    for d in h["digits"]:
        thumb = d["id"] == "mare"
        cur = None
        for k in range(3):
            a, b = d["pts"][k], d["pts"][k+1]
            shape = {"t": "cap", "a": xy(a), "b": xy(b), "ra": d["r"][k], "rb": d["r"][min(2, k+1)]*.97,
                     "z": (a[2]+b[2])/2}
            if thumb and k == 0:
                palm["shapes"].append(shape)
                continue
            if cur is None or d["bends"][k] > BEND_SPLIT:
                rooted = h["g"]["opp"] < .4 if thumb else (k == 0 and d["bends"][0] <= BEND_SPLIT)
                cur = {"id": f"{d['id']}{k}", "rooted": rooted, "root": xy(a), "rootR": d["r"][k],
                       "shapes": [], "details": [], "zs": []}
                groups.append(cur)
            cur["shapes"].append(shape)
            cur["zs"].append(shape["z"])
            # Un vârf strâns în pumn nu arată unghia.
            if details and k == 2 and d["dorsal"][2][2] > .3 and sum(d["bends"]) < 150:
                direction = sub2(xy(b), xy(a))
                along = len2(direction)
                if along > d["r"][2]*.6:
                    cur["details"].append({
                        "t": "nail", "c": lerp2(xy(a), xy(b), .66), "angle": atan2(direction[1], direction[0]),
                        "rx": min(along*.3, d["r"][2]*.62),
                        "ry": d["r"][2]*.5*min(1, d["dorsal"][2][2]+.25), "w": lw*.45})
    for g in groups[1:]:
        g["z"] = sum(g["zs"])/len(g["zs"])
        # Un deget înrădăcinat stă în fața palmei, dacă nu e clar în spatele ei.
        finger = not g["id"].startswith("mare")
        if g["rooted"] and finger and g["z"] > h["palmZ"]-1.2*h["k"]:
            g["z"] = max(g["z"], h["palmZ"]+.01)
        if g["z"] < h["palmZ"]-.3*h["k"] and not g["rooted"]:
            g["fill"] = SHADE
        if g["rooted"]:
            g["details"].insert(0, {"t": "patch", "clip": palm_poly, "c": g["root"], "r": g["rootR"]*1.45,
                                    "color": SKIN})
    if details and facing(h) > .35:
        lines = creases(hand)
        crease = [xy(h["to_screen"](p)) for p in lines["long"]]
        short = [xy(h["to_screen"](p)) for p in lines["short"]]
        palm["details"] += [{"t": "line", "pts": crease, "w": lw*.6}, {"t": "line", "pts": short, "w": lw*.6}]
    # Cu memorie, piesele își păstrează ordinea până când adâncimile diferă cu
    # peste o jumătate de centimetru: degetele aproape la același nivel nu pâlpâie.
    if memory is not None:
        n = len(groups)
        for g in groups:
            g["z"] += memory[g["id"]]/n*.5*h["k"] if g["id"] in memory else 0
    groups.sort(key=lambda g: g["z"])
    if memory is not None:
        memory.clear()
        for i, g in enumerate(groups):
            memory[g["id"]] = i
    # Peticul trebuie să vină după palmă; un deget pictat în spatele ei îl pierde.
    palm_index = groups.index(palm)
    for i, g in enumerate(groups):
        if i < palm_index:
            g["details"] = [d for d in g["details"] if d["t"] != "patch"]
    return {"groups": groups, "lw": lw, "contact": xy(h["contact"]),
            "order": " ".join(g["id"] for g in groups)}


class Volume:
    """C cu memoria ordinii, câte unul pentru fiecare mână."""

    def __init__(self, hand=HAND):
        self.memory = {}
        self.hand = hand

    def build(self, h, details=True):
        return build_volume(h, details=details, memory=self.memory, hand=self.hand)

    def reset(self):
        self.memory.clear()


# --- A: desenul de autor ancorat ----------------------------------------------
def screen_up(axes):
    """„Sus”-ul palmei în planul ecranului: direcția degetelor sau, când degetele
    arată spre lentilă, degetul mare rotit cu un sfert de tură. Ecran cu y în jos."""
    u, s = (axes["y"][0], -axes["y"][1]), (axes["x"][0], -axes["x"][1])
    lu = len2(u)
    w = min(1, max(0, (lu-.2)/.3))
    a = mul2(u, 1/lu) if lu > 1e-6 else (0, -1)
    ls = len2(s) or 1
    b = (-s[1]/ls, s[0]/ls)
    v = add2(mul2(a, w), mul2(b, 1-w))
    return atan2(v[1], v[0])+pi/2


def normalized(axes):
    psi = screen_up(axes)
    k = (0, 0, 1)

    def r(v):
        return rotate(v, k, psi)
    return {"psi": psi, "q": quat_from_basis(r(axes["x"]), r(axes["y"]), r(axes["z"]))}


def anchor_drawing(contact_screen, contact_drawing, psi, scale):
    """Transformarea unui desen A: rotit cu ψ, scalat și lipit cu punctul lui de contact
    peste contactul proxy-ului. Ancorat la încheietură, desenul ar rata contactul."""
    c, s = cos(psi), sin(psi)
    cx, cy = contact_drawing

    def place(p):
        x, y = (p[0]-cx)*scale, (p[1]-cy)*scale
        return (contact_screen[0]+x*c-y*s, contact_screen[1]+x*s+y*c)
    return place


# --- Mâneca: cotul și pliurile ------------------------------------------------
def flipped(rest_triangle, triangle, sign=1, tolerance=0.):
    """Același test de semn ca `buildMesh` din `hands.js`: un triunghi s-a întors pe dos."""
    p0, q0, r0 = rest_triangle
    p, q, r = triangle
    want = (1 if cross2(sub2(q0, p0), sub2(r0, p0)) > 0 else -1)*sign
    got = cross2(sub2(q, p), sub2(r, p))
    return abs(got) > tolerance and (1 if got > 0 else -1) != want


def mirror_pose(pose):
    """Mâna stângă: aceeași geometrie ca dreapta, oglindită față de axa corpului (x → −x)."""
    w, x, y, z = pose["q"]
    # Oglinda x → −x pe o rotație: (w, x, y, z) → (w, x, −y, −z).
    return dict(pose, w=(-pose["w"][0], pose["w"][1], pose["w"][2]), q=(w, x, -y, -z),
                pole=(-pose["pole"][0], pose["pole"][1], pose["pole"][2]))
