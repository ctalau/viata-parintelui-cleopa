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
def two_bone(root, target, l1, l2, pole, prefer=None, exact=None):
    """IK cu două oase. Cotul stă pe cercul posibil, spre `pole`.

    `prefer`: direcția cotului la cadrul precedent; trage cotul spre ea (`CONTINUITY`),
    ca să nu sară pe partea cealaltă când încheietura trece pe lângă umăr.
    `exact`: direcția cheiată, pentru a reface exact aceeași soluție la verificare."""
    d = sub(target, root)
    reach = length(d)
    dist = min(max(reach, abs(l1-l2)+1e-3), l1+l2-1e-4)
    dn = norm(d)
    x = (l1*l1-l2*l2+dist*dist)/(2*dist)
    h = sqrt(max(0, l1*l1-x*x))

    def across(v):
        return sub(v, mul(dn, dot(v, dn)))
    side = across(pole)
    if exact is not None and length(across(exact)) > 1e-6:
        side = across(exact)
    elif prefer is not None and length(across(prefer)) > 1e-6:
        base = norm(side) if length(side) > 1e-6 else (0., 0., 0.)
        side = add(base, mul(norm(across(prefer)), CONTINUITY))
    if length(side) < 1e-6:
        side = cross(dn, (0, 0, 1))
    joint = add(add(root, mul(dn, x)), mul(norm(side), h))
    return {"joint": joint, "end": add(root, mul(dn, dist)), "miss": max(0, reach-dist),
            "side": norm(side)}


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
    # Ține cartea de dedesubt (doar în episod, nu în atelier): degete întinse și ușor curbate pe
    # muchia de jos, degetul mare în față. `cupa` (curl ~.6) văzută din față, cu degetele spre
    # centrul cărții, se scurta într-o minge, iar `pumn` (curl 1) arăta ca un pumn.
    "ofera": {"curl": (.02, .045, .075, .11), "spread": .38, "opp": .18, "tcurl": .10, "pinch": 0},
    "intinde": {"curl": (.03, .10, .18, .28), "spread": .38, "opp": .28, "tcurl": .16, "pinch": 0},
    "apuca": {"curl": (.18, .26, .36, .46), "spread": .18, "opp": .7, "tcurl": .42, "pinch": 0},
    "tine": {"curl": (.2, .24, .28, .34), "spread": .12, "opp": .5, "tcurl": .2, "pinch": 0},
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
    thumb_dorsal = [norm(cross(axis, side)) for axis in (d0, sub(j, m), sub(tip, j))]
    thumb_digit = {"id": thumb["id"], "pts": [thumb["base"], m, j, tip],
                   "r": [thumb["r"]*t for t in hand.taper],
                   "bends": (0, 30*g["opp"]+b1, b2), "dorsal": thumb_dorsal}
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


def build_volume(h, details=True, memory=None, hand=HAND, lw=None):
    """Piesele palmei, de la spate la față.

    Un deget drept face corp comun cu palma; o articulație îndoită peste 40° începe
    o piesă nouă, deci linia de contur apare unde ar pune-o un animator.
    """
    if lw is None:
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
                     "z": (a[2]+b[2])/2, "piece": f"{d['id']}{k}"}
            if thumb and k == 0:
                palm["shapes"].append(shape)
                continue
            if thumb and k == 1 and (h["g"]["opp"] < .4 or (facing(h) < 0 and h["g"]["pinch"] < .5)):
                cur = palm
            elif cur is None or d["bends"][k] > BEND_SPLIT:
                rooted = h["g"]["opp"] < .4 if thumb else (k == 0 and d["bends"][0] <= BEND_SPLIT)
                cur = {"id": f"{d['id']}{k}", "rooted": rooted, "root": xy(a), "rootR": d["r"][k],
                       "shapes": [], "details": [], "zs": []}
                groups.append(cur)
            cur["shapes"].append(shape)
            if cur is not palm:
                cur["zs"].append(shape["z"])
            # Un vârf strâns în pumn nu arată unghia. Cu palma spre cameră degetul mare se vede
            # din lateral: unghia lui nu e spre cameră, chiar dacă vârful se întoarce puțin.
            thumb_side = thumb and (facing(h) > -.25 or d["dorsal"][2][2] < .5)
            if details and k == 2 and not thumb_side and d["dorsal"][2][2] > .3 and sum(d["bends"]) < 150:
                direction = sub2(xy(b), xy(a))
                along = len2(direction)
                if along > d["r"][2]*.6:
                    cur["details"].append({
                        "digit": d["id"], "t": "nail", "c": lerp2(xy(a), xy(b), .66), "angle": atan2(direction[1], direction[0]),
                        "rx": min(along*.3, d["r"][2]*.62),
                        "ry": d["r"][2]*.5*min(1, d["dorsal"][2][2]+.25), "w": lw*.45})
    for g in groups[1:]:
        g["z"] = sum(g["zs"])/len(g["zs"])
        # Un deget înrădăcinat stă în fața palmei, dacă nu e clar în spatele ei. Văzut din dos,
        # degetul înrădăcinat continuă dosul palmei chiar când se îndoaie spre podul palmei:
        # desenat în spatele ei, conturul palmei tăia baza degetelor ca pliul, care se vede
        # numai pe partea palmei.
        finger = not g["id"].startswith("mare")
        back = facing(h) < 0
        if g["rooted"] and finger and (back or g["z"] > h["palmZ"]-1.2*h["k"]):
            g["z"] = max(g["z"], h["palmZ"]+.01)
        if g["z"] < h["palmZ"]-.3*h["k"] and not g["rooted"]:
            g["fill"] = SHADE
        if g["rooted"]:
            g["details"].insert(0, {"t": "patch", "digit": g["id"][:-1], "clip": palm_poly, "c": g["root"], "r": g["rootR"]*1.45,
                                    "color": SKIN})
    if details and facing(h) > .35:
        lines = creases(hand)
        crease = [xy(h["to_screen"](p)) for p in lines["long"]]
        short = [xy(h["to_screen"](p)) for p in lines["short"]]
        palm["details"] += [{"t": "line", "id": "long", "pts": crease, "w": lw*.6},
                            {"t": "line", "id": "short", "pts": short, "w": lw*.6}]
    # Cu memorie, piesele își păstrează ordinea până când adâncimile diferă cu
    # peste o jumătate de centimetru: degetele aproape la același nivel nu pâlpâie.
    if memory is not None and "__stable__" in memory:
        groups = stable_order(groups, memory, memory["__stable__"]*h["k"])
    else:
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


def stable_order(groups, memory, hysteresis, hold=3):
    """Ordinea pieselor, fără pâlpâiri (episodul).

    Memoria din `hands.js` adaugă rang/n × 0,5 cm; când o articulație trece de 40°,
    numărul de piese n se schimbă, toate decalajele se mută, iar două degete
    aproape la aceeași adâncime se pot inversa de două ori în câteva cadre.
    Aici se pornește de la ordinea desenului anterior. Doi vecini care tocmai
    s-au inversat rămân blocați `hold` desene (o pereche nu se poate inversa de
    două ori în 4 cadre), apoi încă `hold` desene cer o diferență peste
    `hysteresis`. După aceea contează din nou doar adâncimea, ca o ordine veche să
    nu rămână greșită (degetul mare în spatele palmei)."""
    count = memory["__count__"] = memory.get("__count__", 0)+1
    swapped = memory.setdefault("__swapped__", {})
    by_id = {g["id"]: g for g in groups}
    order = [by_id[i] for i in memory.get("__order__", []) if i in by_id]
    for g in sorted((g for g in groups if g not in order), key=lambda g: g["z"]):
        k = 0
        while k < len(order) and order[k]["z"] <= g["z"]:
            k += 1
        order.insert(k, g)

    def locked(a, b):
        return count-swapped.get(frozenset((a["id"], b["id"])), -hold-1) <= hold
    changed = True
    while changed:
        changed = False
        for k in range(len(order)-1):
            a, b = order[k], order[k+1]
            if locked(a, b):
                continue
            if a["z"] > b["z"]+(hysteresis if count-swapped.get(frozenset((a["id"], b["id"])), -99) <= 2*hold else 0.):
                order[k], order[k+1] = b, a
                swapped[frozenset((a["id"], b["id"]))] = count
                changed = True
    memory["__order__"] = [g["id"] for g in order]
    return order


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


# =============================================================================
# Stratul episodului: topologie fixă, desene de autor, siluete.
# Tot ce urmează este Python pur, folosit de `palme25d_bake.py` și de verificări.
# =============================================================================
CAP_ARC = 12          # vârfuri pe fiecare semicerc al unei capsule
CAP_RING = 2*CAP_ARC
PALM_RING = 40        # vârfurile învelitorii palmei, reeșantionate


def capsule_ring(a, b, ra, rb, n=CAP_ARC):
    """Conturul unei capsule 2D cu rază descrescătoare: 2 × n vârfuri, în sens trigonometric.

    Aceeași construcție ca `capsule` din `draw.js`: arcul mare în jurul lui a,
    tangentele exterioare și arcul mic în jurul lui b. O capsulă scurtată până la
    cerc (lungime < |ra − rb|) devine cercul mai mare, cu același număr de vârfuri.
    """
    d = sub2(b, a)
    l = len2(d)
    if l < abs(ra-rb)+1e-6:
        c, r = (a, ra) if ra > rb else (b, rb)
        return [(c[0]+cos(i/(2*n)*2*pi)*r, c[1]+sin(i/(2*n)*2*pi)*r) for i in range(2*n)]
    ang = atan2(d[1], d[0])
    off = acos(max(-1, min(1, (ra-rb)/l)))
    ring = []
    a0, a1 = ang+off, ang-off+2*pi
    for i in range(n):
        t = a0+(a1-a0)*i/(n-1)
        ring.append((a[0]+cos(t)*ra, a[1]+sin(t)*ra))
    b0, b1 = ang-off, ang+off
    for i in range(n):
        t = b0+(b1-b0)*i/(n-1)
        ring.append((b[0]+cos(t)*rb, b[1]+sin(t)*rb))
    return ring


def polygon_area(points):
    return .5*sum(cross2(p, points[(i+1) % len(points)]) for i, p in enumerate(points))


def resample(loop, n):
    """Reeșantionează un poligon închis la n vârfuri egal depărtate pe contur."""
    edges = [(loop[i], loop[(i+1) % len(loop)]) for i in range(len(loop))]
    lengths = [len2(sub2(b, a)) for a, b in edges]
    total = sum(lengths) or 1
    # Pornește din cel mai de jos vârf (apoi cel mai din stânga), ca indicii să
    # rămână stabili de la un desen la altul.
    start = min(range(len(loop)), key=lambda i: (round(loop[i][1], 9), loop[i][0]))
    edges = edges[start:]+edges[:start]
    lengths = lengths[start:]+lengths[:start]
    out, i, walked = [], 0, 0.
    for k in range(n):
        s = total*k/n
        while i < len(edges)-1 and walked+lengths[i] < s:
            walked += lengths[i]
            i += 1
        a, b = edges[i]
        t = (s-walked)/(lengths[i] or 1)
        out.append(lerp2(a, b, min(1, max(0, t))))
    return out


def grow(ring, amount):
    """Mărește un poligon convex (sau o capsulă) cu grosimea liniei, din centrul lui."""
    cx = sum(p[0] for p in ring)/len(ring)
    cy = sum(p[1] for p in ring)/len(ring)
    out = []
    n = len(ring)
    for i, p in enumerate(ring):
        a, b = ring[i-1], ring[(i+1) % n]
        tangent = sub2(b, a)
        normal = (tangent[1], -tangent[0])
        ln = len2(normal)
        if ln < 1e-12:
            normal = sub2(p, (cx, cy))
            ln = len2(normal) or 1
        normal = mul2(normal, 1/ln)
        if cross2(sub2(p, (cx, cy)), normal) != 0 and (normal[0]*(p[0]-cx)+normal[1]*(p[1]-cy)) < 0:
            normal = mul2(normal, -1)
        out.append(add2(p, mul2(normal, amount)))
    return out


def path_points(data, steps=9):
    """Eșantionează un drum M/L/Q/C/Z, ca `vector_art.path`. Întoarce lista de contururi."""
    import re
    tokens = iter(re.findall(r"[MLQCZ]|-?(?:\d+\.?\d*|\.\d+)", data))
    loops, points = [], []
    for command in tokens:
        if command == "M" and points:
            loops.append(points)
            points = []
        if command in "ML":
            points.append((float(next(tokens)), float(next(tokens))))
        elif command in "QC":
            p0 = points[-1]
            controls = [(float(next(tokens)), float(next(tokens))) for _ in range(2 if command == "Q" else 3)]
            for step in range(1, steps+1):
                t = step/steps
                s = 1-t
                if command == "Q":
                    c, e = controls
                    points.append((s*s*p0[0]+2*s*t*c[0]+t*t*e[0], s*s*p0[1]+2*s*t*c[1]+t*t*e[1]))
                else:
                    c1, c2, e = controls
                    points.append(tuple(s**3*p0[i]+3*s*s*t*c1[i]+3*s*t*t*c2[i]+t**3*e[i] for i in (0, 1)))
        elif command == "Z":
            loops.append(points)
            points = []
    if points:
        loops.append(points)
    return loops


def _inside(polygon, x, y):
    inside = False
    j = len(polygon)-1
    for i, (xi, yi) in enumerate(polygon):
        xj, yj = polygon[j]
        if (yi > y) != (yj > y) and x < (xj-xi)*(y-yi)/(yj-yi)+xi:
            inside = not inside
        j = i
    return inside


def raster(polygons, box, size=128):
    """Masca reuniunii poligoanelor (fiecare cu par-impar) pe o grilă size × size din `box`."""
    x0, y0, x1, y1 = box
    sx, sy = (x1-x0)/size, (y1-y0)/size
    cells = set()
    for poly in polygons:
        px = [p[0] for p in poly]
        py = [p[1] for p in poly]
        i0, i1 = max(0, int((min(px)-x0)/sx)), min(size-1, int((max(px)-x0)/sx)+1)
        j0, j1 = max(0, int((min(py)-y0)/sy)), min(size-1, int((max(py)-y0)/sy)+1)
        for j in range(j0, j1+1):
            y = y0+(j+.5)*sy
            for i in range(i0, i1+1):
                if (i, j) not in cells and _inside(poly, x0+(i+.5)*sx, y):
                    cells.add((i, j))
    return cells


def iou(first, second, size=128):
    """IoU-ul a două siluete date ca liste de poligoane, pe cutia lor comună."""
    pts = [p for poly in first+second for p in poly]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    pad = .02*max(max(xs)-min(xs), max(ys)-min(ys))
    box = (min(xs)-pad, min(ys)-pad, max(xs)+pad, max(ys)+pad)
    a, b = raster(first, box, size), raster(second, box, size)
    return len(a & b)/max(1, len(a | b))


def silhouette(built):
    """Conturul exterior (cu linia) al pieselor C, ca listă de poligoane convexe."""
    lw = built["lw"]
    polys = []
    for g in built["groups"]:
        for shape in g["shapes"]:
            if shape["t"] == "poly":
                polys.append(grow(shape["pts"], lw))
            else:
                polys.append(capsule_ring(shape["a"], shape["b"], shape["ra"]+lw, shape["rb"]+lw))
    return polys


# --- Proxy-ul pe rigul episodului -------------------------------------------
# Unitățile sunt cele ale rigului (planul XY al imaginii, +Z spre cameră).
# Potrivirea siluetei cu desenele din `hands.py` (tests/palme25d_test.py,
# `test_hand_matches_the_rest_drawing`): palma proxy-ului are mărimea desenului
# `rest` la 0,0655 × profile["hand"] unități pe centimetru, adică 1,3 × anatomic,
# deci factorul de desen animat 1,3 rămâne. Degetele seriei sunt scurte și
# groase; grosimea care le potrivește este 1,6, nu 1,15.
HAND_PER_CM = .0655 / 1.3
FINGER_THICKNESS = 1.6
# Înălțimea personajelor, pentru conversia în milimetri „la scara personajului”.
HEIGHT_CM = {"mother": 160, "father": 175, "brother_01": 140, "brother_02": 140,
             "cleopa": 120, "priest": 172}


def hand_of(profile):
    return Hand(scale=1.3*HAND_PER_CM*profile["hand"], thickness=FINGER_THICKNESS)


def height_units(profile):
    return profile["leg"]+profile["head_y"]+.5*profile["head_h"]


def mm(profile):
    """Câte unități de rig are un milimetru la scara personajului."""
    return height_units(profile)/(HEIGHT_CM.get(profile["id"], 160)*10)


def side_sign(side):
    return -1 if side == "R" else 1


def flip(v):
    return (-v[0], v[1], v[2]) if len(v) == 3 else (-v[0], v[1])


# Polul cotului, mâna dreaptă. `rig.js` folosește (−0,6, −0,5, −0,55), potrivit
# pentru semnul crucii. În gesturile episodului (tava ținută aproape de piept,
# mâna la obraz, invitația la nivelul taliei) acel pol ridică cotul la nivelul
# umărului și brațul se desface în lateral. Polul relaxat lasă cotul să cadă pe
# lângă corp; rămâne în afară și înapoi. (Cu −0,08 în loc de −0,4 brațul stătea în planul
# desenului, dar o mână ținută aproape de corp ridica cotul în lateral, „aripă de pui”; scurtările
# extreme, de 7–15 %, veneau din trecerile în linie dreaptă dintre poze, rezolvate acum în
# `build_episode.arms`, care interpolează unghiurile articulațiilor.)
POLE = (-.45, -.8, -.4)
REACH = .997        # brațul aproape întins: talerul purtat ajunge până la 99,6 % din braț
READABLE = .45      # proiecția fiecărui segment rămâne ≥ 45 % din lungime
DEPTH_MAX = 1.0     # în unități de (umăr + cot)
DEPTH_RATE = .035   # schimbarea maximă a adâncimii între două cadre, în aceeași unitate
CONTINUITY = 4.     # cât trage cotul spre partea lui de la cadrul precedent, față de pol (1):
                    # cotul nu mai sare dintr-o parte în alta, apoi revine lin spre pol


def smooth(t):
    t = max(0., min(1., t))
    return t*t*(3-2*t)


def rest_wrist(profile, side):
    return (side_sign(side)*(profile["shoulder_x"]+.08),
            profile["shoulder_y"]-profile["upper"]-profile["lower"]+.085)


def default_depth(profile, side, wrist, previous=None, prefer=None):
    """Adâncimea încheieturii: cea care lasă cotul cel mai jos (brațul cel mai relaxat),
    cu ambele segmente proiectate lizibile.

    O mână ridicată aproape de umăr vine astfel spre cameră, iar antebrațul se
    scurtează în perspectivă în loc să se pliaze în planul imaginii. `previous`
    limitează schimbarea între cadre consecutive, ca mișcarea să nu sară."""
    span = profile["upper"]+profile["lower"]

    def cost(depth):
        pts = arm_points(profile, side, wrist, depth, prefer)
        S, E, W = pts["S"], pts["E"], pts["W"]
        su = hypot(E[0]-S[0], E[1]-S[1])/profile["upper"]
        sf = hypot(W[0]-E[0], W[1]-E[1])/profile["lower"]
        return E[1]/span+2*max(0, READABLE-min(su, sf))+.02*depth/span
    steps = 50
    best = min((cost(i/steps*DEPTH_MAX*span), i) for i in range(steps+1))[1]
    lo, hi = max(0, best-1)/steps*DEPTH_MAX*span, min(steps, best+1)/steps*DEPTH_MAX*span
    for _ in range(30):
        a, b = lo+(hi-lo)*.382, lo+(hi-lo)*.618
        if cost(a) <= cost(b):
            hi = b
        else:
            lo = a
    depth = (lo+hi)/2
    if previous is not None:
        rate = DEPTH_RATE*span
        depth = max(previous-rate, min(previous+rate, depth))
    return depth


def arm_points(profile, side, wrist, depth=None, prefer=None, exact=None):
    """Umărul, cotul și încheietura în 3D (spațiul rigului), cu lungimi fixe.

    Mâna stângă se rezolvă în oglindă, ca dreapta, apoi se reflectă. `prefer` / `exact`:
    direcția cotului (spațiul mâinii drepte), vezi `two_bone`; `elbow` o întoarce."""
    s = side_sign(side)
    upper, lower = profile["upper"], profile["lower"]
    if depth is None:
        depth = default_depth(profile, side, wrist, prefer=prefer)
    shoulder = (-profile["shoulder_x"], profile["shoulder_y"], 0.)
    w = (wrist[0]*-s, wrist[1], depth)            # în spațiul mâinii drepte
    planar = hypot(w[0]-shoulder[0], w[1]-shoulder[1])
    reach = (upper+lower)*REACH
    if planar > reach:
        # Ținta e mai departe decât brațul: încheietura rămâne pe direcția ei, în plan.
        k = reach/planar
        w = (shoulder[0]+(w[0]-shoulder[0])*k, shoulder[1]+(w[1]-shoulder[1])*k, 0.)
    elif hypot(planar, w[2]) > reach:
        w = (w[0], w[1], sqrt(reach*reach-planar*planar))
    arm = two_bone(shoulder, w, upper, lower, POLE, prefer, exact)
    S, E, W = shoulder, arm["joint"], arm["end"]
    if s > 0:
        S, E, W = flip(S), flip(E), flip(W)
    return {"S": S, "E": E, "W": W, "depth": W[2], "miss": hypot(W[0]-wrist[0], W[1]-wrist[1]),
            "elbow": arm["side"]}


def lift_angle(previous, angle):
    tau = 2*pi
    return previous+(angle-previous+tau/2) % tau-tau/2


def solve_arm(profile, side, wrist, hand_angle, depth=None, prefer=None):
    """Înlocuiește partea pseudo-3D din `build_rigs.solve_arm`: oasele 2D primesc
    unghiul și scara segmentelor proiectate ale IK-ului 3D. Interfața e aceeași."""
    pts = arm_points(profile, side, wrist, depth, prefer)
    S, E, W = pts["S"], pts["E"], pts["W"]
    elbow = (E[0]-S[0], E[1]-S[1])
    fore = (W[0]-E[0], W[1]-E[1])
    a = atan2(elbow[0], -elbow[1])
    b = lift_angle(a, atan2(fore[0], -fore[1]))
    c = lift_angle(b, hand_angle)
    scales = (hypot(*elbow)/profile["upper"], hypot(*fore)/profile["lower"])
    return (a, b-a, c-b), scales, pts


# --- Gesturi și orientări ----------------------------------------------------
# Corespondența desenelor din `HAND_POSES` cu gestul proxy-ului și orientarea
# implicită a palmei, într-un singur loc. Motivul fiecăreia:
#   rest  – brațul atârnă: degetele în jos, palma spre coapsă (înăuntru);
#   open  – invitația: palma în sus, puțin spre cameră, ca să se citească deschisă;
#   cup   – ține ceva de dedesubt (tava): palma în sus și înăuntru;
#   grip  – ține cartea lipită de piept: palma pe copertă (spre carte, departe de
#           cameră), degetele aproape întinse (`tine`) și degetul mare în sus. Cu palma
#           în sus degetul mare ieșea în jos, iar palma se vedea întoarsă spre cameră;
#   reach – întinde mâna spre țintă: degetele spre ea, palma în jos și puțin
#           dinspre cameră, ca degetele întinse să se vadă, nu doar muchia lor;
#   stop  – semnul de oprire: degetele în sus, palma spre cameră;
#   cheek – mâna căuș pe obraz: palma spre obraz, înăuntru și puțin înapoi.
POSE_GESTURE = {"rest": "relaxat", "open": "deschis", "cup": "cupa", "grip": "tine",
                "reach": "deschis", "present": "ofera", "extend": "intinde", "gather": "apuca", "stop": "deschis", "cheek": "cupa"}


def default_palm(pose, side):
    inward = (-side_sign(side), 0, 0)
    return {
        "rest": inward,
        "open": (0, 1, .35),
        "cup": norm(add((0, 1, 0), mul(inward, .5))),
        "grip": norm((0, .3, -1)),
        "cheek": norm(add((0, 0, -.65), mul(inward, .75))),
        "reach": norm((0, -.75, -.66)),
        "present": norm((0, 1, .72)),
        "extend": norm((0, -.72, -.69)),
        "gather": norm((0, -.85, -.52)),
        "stop": (0, 0, 1),
    }[pose]


def orientation(direction, palm, side):
    """Cuaternionul palmei în spațiul proxy-ului.

    Mâna din `rig.js` este, anatomic, o mână stângă: `handQuat` pune degetul mare
    la −(degete × palmă). La mâna dreaptă degetul mare este la +(degete × palmă)
    (în poziția anatomică, cu palma în față și degetele în jos, degetul mare e
    lateral). De aceea mâna stângă folosește proxy-ul direct, iar dreapta e
    oglinda lui (§6 din specificație: o singură geometrie).

    Dacă palma cerută e aproape paralelă cu degetele, se înclină spre cameră,
    ca baza să rămână definită."""
    d3 = norm((direction[0], direction[1], direction[2] if len(direction) > 2 else 0))
    p = norm(palm)
    if length(sub(p, mul(d3, dot(p, d3)))) < .35:
        p = norm(add(p, (0, 0, .6)))
    if side == "R":
        d3, p = flip(d3), flip(p)
    return hand_quat(d3, p)


def wrist_from_tip(profile, side, tip, direction, palm, gesture):
    """Încheietura care pune vârful de contact al gestului pe țintă (spațiul rigului, 3D)."""
    hand = hand_of(profile)
    q = orientation(direction, palm, side)
    local = hand_local(GESTURES[gesture] if isinstance(gesture, str) else gesture, hand)
    target = flip(tip) if side == "R" else tuple(tip)
    w = sub(target, quat_rotate(q, local["contact"]))
    return flip(w) if side == "R" else w


def hand_rig(profile, side, wrist3, q, gesture, offset=(0., 0.)):
    """Proxy-ul palmei la încheietura dată; mâna dreaptă e proxy-ul reflectat (vezi `orientation`).

    `offset` este deplasarea umărului față de repaus (pașii mută osul `root`)."""
    hand = hand_of(profile)
    # În spațiul proxy-ului mâna este stângă: umărul și polul sunt cei ai brațului stâng.
    pose = {"w": flip(wrist3) if side == "R" else wrist3, "q": q, "g": gesture, "pole": flip(POLE), "cam": 0}
    dx = -offset[0] if side == "R" else offset[0]
    shoulder = (profile["shoulder_x"]+dx, profile["shoulder_y"]+offset[1], 0.)
    rig = solve(pose, hand=hand, shoulder=shoulder, upper=profile["upper"], fore=profile["lower"])
    return rig


class Mirror:
    """Camera episodului pentru mâna dreaptă: proiecția frontală reflectată (x → −x)."""
    k = 1

    def p(self, v):
        return (-v[0], v[1], v[2])

    def d(self, v):
        return (-v[0], v[1], v[2])


def contact_point(profile, side, wrist3, direction, palm, gesture):
    """Vârful de contact al gestului pentru o încheietură dată (inversul lui `wrist_from_tip`)."""
    hand = hand_of(profile)
    q = orientation(direction, palm, side)
    local = hand_local(GESTURES[gesture] if isinstance(gesture, str) else gesture, hand)
    w = flip(wrist3) if side == "R" else tuple(wrist3)
    tip = add(w, quat_rotate(q, local["contact"]))
    return flip(tip) if side == "R" else tip


def camera_for(side):
    return Mirror() if side == "R" else Identity()


def thumb_side(axes, side):
    """Semnul anatomic: + dacă degetul mare e de partea (degete × palmă) a mâinii drepte,
    respectiv −(degete × palmă) a stângii, în spațiul rigului. `axes` sunt axele proiectate."""
    palm = mul(axes["z"], -1)
    expected = cross(axes["y"], palm)
    if side == "L":
        expected = mul(expected, -1)
    return dot(axes["x"], expected)


# --- C: palma ca plasă cu topologie fixă --------------------------------------
# 16 piese: palma, metacarpianul degetului mare și 14 falange. Fiecare piesă are
# un inel de contur (INK) și două inele de umplere, piele și umbră; cel nefolosit
# se strânge într-un punct. Detaliile (peticele de rădăcină, unghiile, liniile
# palmei) sunt tot piese fixe, scalate la zero când nu se văd. Așa obiectul are
# același număr de vârfuri în fiecare desen și se coace în shape keys.
DIGITS = ("mare", "aratator", "mijlociu", "inelar", "mic")
PIECES = ("palm",)+tuple(f"{d}{k}" for d in DIGITS for k in range(3))
NAIL_RING = 16
MATERIALS = ("ink", "skin", "shade", "nail", "crease")
# Ordinea prin Z. Fiecare rang (piesă vizuală) are patru trepte: conturul,
# umplerea, detaliile de pe umplere (petic, conturul unghiei, liniile palmei) și
# umplerea unghiei. Specificația cere 2 trepte pe rang; a treia și a patra țin
# detaliile deasupra umplerii fără să coboare sub pragul ε/2 al verificării.
SLOTS = 4
ORDER_HYSTERESIS = 1.5   # cm (× k): peste saltul de 1,2 cm al regulii „degetul înrădăcinat stă în fața palmei”
EPSILON = 4e-4       # unități de rig; ×0,5 (scara Z a rigului) = 2e-4 în lume


def _ring_count(piece):
    return PALM_RING if piece == "palm" else CAP_RING


def topology():
    """Fețele (triunghiuri în evantai), materialele și blocurile de vârfuri."""
    blocks, faces, materials = [], [], []
    count = 0

    def block(name, ring, material):
        nonlocal count
        start = count
        blocks.append((name, start, ring))
        for i in range(ring):
            faces.append((start+ring, start+i, start+(i+1) % ring))
            materials.append(material)
        count += ring+1
    for piece in PIECES:
        block(("ink", piece), _ring_count(piece), 0)
        block(("skin", piece), _ring_count(piece), 1)
        block(("shade", piece), _ring_count(piece), 2)
    for digit in DIGITS:
        block(("patch", digit), CAP_RING, 1)
        block(("nail_ink", digit), NAIL_RING, 4)
        block(("nail", digit), NAIL_RING, 3)
    lines = []
    for name, points in (("long", 3), ("short", 2)):
        start = count
        for i in range(points-1):
            a, b = start+2*i, start+2*i+2
            faces.append((a, a+1, b+1))
            faces.append((a, b+1, b))
            materials += [4, 4]
        lines.append((name, start, points))
        count += 2*points
    return {"blocks": blocks, "faces": faces, "materials": materials, "count": count, "lines": lines}


TOPOLOGY = topology()


def _fan(ring, z):
    cx = sum(p[0] for p in ring)/len(ring)
    cy = sum(p[1] for p in ring)/len(ring)
    return [(x, y, z) for x, y in ring]+[(cx, cy, z)]


def _collapsed(n, point, z):
    return [(point[0], point[1], z)]*(n+1)


def _clip_into(points, polygon, centre):
    """Aduce fiecare punct în interiorul poligonului convex, pe raza din `centre`.

    Peticul de rădăcină rămâne un poligon stelat cu același număr de vârfuri,
    tăiat după conturul palmei, ca în `paintDetail` (clip)."""
    out = []
    n = len(polygon)
    orient = 1 if polygon_area(polygon) > 0 else -1
    for p in points:
        t_max = 1.
        d = sub2(p, centre)
        for i in range(n):
            a, b = polygon[i], polygon[(i+1) % n]
            edge = sub2(b, a)
            # Interiorul: orient · cross(edge, q − a) ≥ 0
            fa = orient*cross2(edge, sub2(centre, a))
            fd = orient*cross2(edge, d)
            if fd < 0 and fa >= 0:
                t_max = min(t_max, fa/-fd)
        out.append(add2(centre, mul2(d, max(0., t_max))))
    return out


def _ellipse(c, rx, ry, angle, n=NAIL_RING, grow_by=0.):
    ca, sa = cos(angle), sin(angle)
    out = []
    for i in range(n):
        t = i/n*2*pi
        x, y = cos(t)*(rx+grow_by), sin(t)*(ry+grow_by)
        out.append((c[0]+x*ca-y*sa, c[1]+x*sa+y*ca))
    return out


def _ribbon(points, width):
    out = []
    half = width/2
    for i, p in enumerate(points):
        a = points[max(0, i-1)]
        b = points[min(len(points)-1, i+1)]
        t = sub2(b, a)
        lt = len2(t) or 1
        nrm = (-t[1]/lt*half, t[0]/lt*half)
        out += [add2(p, nrm), sub2(p, nrm)]
    return out


def layered_vertices(built, levels, level_of=None):
    """Vârfurile plasei fixe pentru un desen C.

    `levels` dă z-ul de bază al fiecărui nivel; `level_of(group, rank, palm_rank)`
    alege nivelul unei piese vizuale (sub manșetă, peste ea, în fața tăvii).
    Piesa cu rangul r are conturul la z0 + 4rε, umplerea la z0 + (4r+1)ε, iar
    piesele contopite în aceeași piesă vizuală au același rang."""
    lw = built["lw"]
    groups = built["groups"]
    palm_rank = next(i for i, g in enumerate(groups) if g["id"] == "palm")
    level_of = level_of or (lambda g, r, pr: "base")
    verts = [None]*TOPOLOGY["count"]
    shapes, details, home = {}, {}, {}
    for rank, g in enumerate(groups):
        z0 = levels[level_of(g, rank, palm_rank)]+SLOTS*rank*EPSILON
        for shape in g["shapes"]:
            piece = shape.get("piece", "palm")
            shapes[piece] = (shape, g, z0)
        for d in g["details"]:
            key = ("line", d["id"]) if d["t"] == "line" else (d["t"], d["digit"])
            details[key] = (d, z0)
        home[g["id"]] = z0
    anchor = None
    for name, start, ring in TOPOLOGY["blocks"]:
        kind, piece = name
        if kind in ("ink", "skin", "shade"):
            shape, g, z0 = shapes[piece]
            outline = shape["pts"] if shape["t"] == "poly" else None
            fill = resample(outline, ring) if outline else capsule_ring(shape["a"], shape["b"], shape["ra"], shape["rb"])
            anchor = anchor or fill[0]
            if kind == "ink":
                ring_pts = grow(fill, lw) if outline else capsule_ring(shape["a"], shape["b"], shape["ra"]+lw, shape["rb"]+lw)
                block = _fan(ring_pts, z0)
            else:
                shaded = g.get("fill") == SHADE
                if (kind == "shade") == shaded:
                    block = _fan(fill, z0+EPSILON)
                else:
                    c = shape["pts"][0] if outline else shape["a"]
                    block = _collapsed(ring, c, z0+EPSILON)
        else:
            d, z0 = details.get((kind if kind != "nail_ink" else "nail", piece), (None, None))
            if d is None:
                block = _collapsed(ring, anchor, levels["base"])
            elif kind == "patch":
                circle = capsule_ring(d["c"], d["c"], d["r"], d["r"])
                block = _fan(_clip_into(circle, d["clip"], d["c"]), z0+2*EPSILON)
            elif kind == "nail_ink":
                block = _fan(_ellipse(d["c"], d["rx"], d["ry"], d["angle"], grow_by=d["w"]), z0+2*EPSILON)
            else:
                block = _fan(_ellipse(d["c"], d["rx"], d["ry"], d["angle"]), z0+3*EPSILON)
        verts[start:start+ring+1] = block
    for name, start, points in TOPOLOGY["lines"]:
        d, z0 = details.get(("line", name), (None, None))
        if d is None:
            ribbon = [anchor]*(2*points)
            z = levels["base"]
        else:
            ribbon = _ribbon(d["pts"], d["w"])
            z = z0+2*EPSILON
        verts[start:start+2*points] = [(x, y, z) for x, y in ribbon]
    return verts


def flipped_faces(verts, sign=1, tolerance=1e-12):
    """Câte triunghiuri ale palmei C sunt întoarse pe dos. Inelele sunt în sens
    trigonometric în spațiul mâinii drepte; oglinda stângă le inversează (`sign`)."""
    count = 0
    for a, b, c in TOPOLOGY["faces"]:
        p, q, r = verts[a], verts[b], verts[c]
        got = cross2(sub2(q, p), sub2(r, p))
        if abs(got) > tolerance and (1 if got > 0 else -1) != sign:
            count += 1
    return count


# --- Desene A noi, trase după silueta C -----------------------------------------
def trace_outline(polygons, size=160, tolerance=.012):
    """Conturul exterior al reuniunii poligoanelor, simplificat și netezit ca drum Q.

    Folosit o singură dată, ca să redeseneze o poză A care nu atinge IoU 0,85 cu C
    (HANDOFF §5: se ajustează desenul A, nu proxy-ul). Întoarce punctele conturului."""
    pts = [p for poly in polygons for p in poly]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    pad = .04*max(max(xs)-min(xs), max(ys)-min(ys))
    x0, y0 = min(xs)-pad, min(ys)-pad
    step = max(max(xs)-x0+pad, max(ys)-y0+pad)/size
    cells = raster(polygons, (x0, y0, x0+size*step, y0+size*step), size)
    # Muchiile dintre o celulă plină și una goală, orientate cu plinul la stânga.
    edges = {}
    for i, j in cells:
        for di, dj, a, b in ((0, -1, (i, j), (i+1, j)), (1, 0, (i+1, j), (i+1, j+1)),
                             (0, 1, (i+1, j+1), (i, j+1)), (-1, 0, (i, j+1), (i, j))):
            if (i+di, j+dj) not in cells:
                edges.setdefault(a, []).append(b)
    loops = []
    while edges:
        start = next(iter(edges))
        loop, here = [start], start
        while True:
            nxt = edges[here].pop()
            if not edges[here]:
                del edges[here]
            if nxt == start:
                break
            loop.append(nxt)
            here = nxt
        loops.append(loop)
    loop = max(loops, key=len)
    points = [(x0+i*step, y0+j*step) for i, j in loop]

    def simplify(chain, tol):
        if len(chain) < 3:
            return chain
        a, b = chain[0], chain[-1]
        ab = sub2(b, a)
        lab = len2(ab) or 1e-12
        far, index = 0, 0
        for k, p in enumerate(chain[1:-1], 1):
            d = abs(cross2(ab, sub2(p, a)))/lab
            if d > far:
                far, index = d, k
        if far <= tol:
            return [a, b]
        return simplify(chain[:index+1], tol)[:-1]+simplify(chain[index:], tol)
    size_ = max(max(xs)-min(xs), max(ys)-min(ys))
    half = len(points)//2
    simple = simplify(points[:half+1], tolerance*size_)[:-1]+simplify(points[half:]+[points[0]], tolerance*size_)[:-1]
    return simple


def q_path(points, digits=3, closed=True):
    """Un drum închis netezit: vârfurile devin puncte de control, mijloacele capete."""
    if not closed:
        return "M "+" L ".join(f"{p[0]:.{digits}f} {p[1]:.{digits}f}" for p in points)
    n = len(points)
    mids = [lerp2(points[i], points[(i+1) % n], .5) for i in range(n)]
    import re

    def f(v):
        return re.sub(r"^(-?)0\.", r"\1.", f"{v:.{digits}f}")
    out = [f"M {f(mids[-1][0])} {f(mids[-1][1])}"]
    for i in range(n):
        out.append(f"Q {f(points[i][0])} {f(points[i][1])} {f(mids[i][0])} {f(mids[i][1])}")
    return " ".join(out)+" Z"


def convex_overlap(a, b):
    """Două poligoane convexe se suprapun (teorema axei de separare)."""
    for poly in (a, b):
        n = len(poly)
        for i in range(n):
            p, q = poly[i], poly[(i+1) % n]
            axis = (q[1]-p[1], p[0]-q[0])
            pa = [axis[0]*v[0]+axis[1]*v[1] for v in a]
            pb = [axis[0]*v[0]+axis[1]*v[1] for v in b]
            if max(pa) <= min(pb) or max(pb) <= min(pa):
                return False
    return True
