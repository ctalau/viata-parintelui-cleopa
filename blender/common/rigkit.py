"""Rigging / skinning kit shared by every character (monk today; animals, children, villagers tomorrow).

The process (docs/ENGINE-blender.md, "Rigging process"):
  1. skeleton   - a list of bones from named joints (`bones()` of the character module), rest pose = standing, arms down
  2. parts      - every mesh is one PART: rigid (one bone) or skinned (weights from the recipes below)
  3. weights    - recipes, never hand painting:  bands() body by height,  follow() cloth that lies over a limb,
                  garment() = follow + bands,  joint() a blend across one joint
  4. validate   - report(): every vertex weighted, <= 4 influences, only deform bones
  5. range of motion - `npm run clipcheck`: every clip x every look through the collision tests
                  (hand/head/beard/torso, leg through robe, garment THROUGH a limb) - must be clean before a film uses it

All coordinates are three.js ones (Y up, +Z front, +X the figure's left). Pure numpy: usable outside Blender too.
"""
import numpy as np


def smoothstep(e0, e1, x):
    t = np.clip((np.asarray(x, float) - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def seg_dist(V, a, b):
    """distance of every vertex (N,3) to the segment a-b, and the parameter 0..1 of its nearest point."""
    a = np.asarray(a, float); b = np.asarray(b, float); ab = b - a
    u = np.clip(((V - a) @ ab) / max(1e-12, float(ab @ ab)), 0, 1)
    return np.linalg.norm(V - (a + u[:, None] * ab), axis=1), u


def bands(V, stops, axis=1):
    """Body weights by height: stops = [(bone, y_from, y_to), ...] from the bottom up; consecutive bones blend between
    `y_from` and `y_to` of the upper one. Returns {bone: (N,)} summing to 1."""
    y = V[:, axis]
    W = {}
    rem = np.ones(len(V))
    for bone, y0, y1 in reversed(stops[1:]):
        w = smoothstep(y0, y1, y) * rem
        W[bone] = W.get(bone, 0) + w
        rem = rem - w
    W[stops[0][0]] = W.get(stops[0][0], 0) + rem
    return W


def follow(V, a, b, r_full, r_none, share=1.0, taper=None):
    """Cloth that lies over a limb FOLLOWS that limb: weight `share` within `r_full` of the bone segment a-b, fading to 0
    at `r_none`. taper=(u0, u1) fades it along the segment (e.g. only the upper half of an arm)."""
    d, u = seg_dist(V, a, b)
    w = share * smoothstep(r_none, r_full, d)
    if taper:
        w = w * smoothstep(taper[0], taper[1], u)
    return w


def garment(V, body, limbs, where=None):
    """A garment layer (cloak, cape, apron, scarf): `limbs` = [(bone, a, b, r_full, r_none, share[, taper])] are the
    limbs it lies over (it follows them, so a raised or bent limb LIFTS the cloth and never comes out through it);
    what is left goes to `body` = {bone: (N,)} (usually bands()). `where` (N,) limits the limb pull (e.g. not the back
    panel). Returns {bone: (N,)} summing to 1."""
    L = {}
    for bone, a, b, r0, r1, share, *rest in limbs:
        w = follow(V, a, b, r0, r1, share, rest[0] if rest else None)
        if where is not None:
            w = w * where
        L[bone] = np.maximum(L.get(bone, 0), w)
    tot = sum(L.values()) if L else np.zeros(len(V))
    scale = np.where(tot > 1, 1 / np.maximum(tot, 1e-9), 1.0)
    W = {k: v * scale for k, v in L.items()}
    free = 1 - np.minimum(tot, 1)
    for bone, w in body.items():
        W[bone] = W.get(bone, 0) + w * free
    return W


def joint(V, a, b, at, width, axis=None):
    """Blend across ONE joint: returns the weight of the child bone (parent gets 1 - w). `at` = the joint position,
    the blend runs `width` along a->b (the bone direction) around it."""
    a = np.asarray(a, float); b = np.asarray(b, float)
    d = (b - a) / max(1e-9, np.linalg.norm(b - a)) if axis is None else np.asarray(axis, float)
    s = (V - np.asarray(at, float)) @ d
    return smoothstep(-width / 2, width / 2, s)


def mirror_x(p):
    return (-p[0], p[1], p[2])


def report(name, W, deform_bones=None, max_influences=4):
    """Validate a weight set before it is skinned. Returns a list of problems (empty = fine)."""
    names = list(W)
    M = np.stack([np.broadcast_to(np.asarray(W[n], float), np.asarray(W[names[0]]).shape) for n in names], -1)
    out = []
    if np.any(M < -1e-6):
        out.append(f'{name}: negative weights')
    s = M.sum(1)
    if np.any(s < 1e-4):
        out.append(f'{name}: {int((s < 1e-4).sum())} vertices without any bone')
    n_inf = (M > 1e-3).sum(1)
    if np.any(n_inf > max_influences):
        out.append(f'{name}: {int((n_inf > max_influences).sum())} vertices with more than {max_influences} bones (the extra ones are dropped)')
    if deform_bones is not None:
        bad = [n for n in names if n not in deform_bones and np.any(np.asarray(W[n]) > 1e-4)]
        if bad:
            out.append(f'{name}: weights on bones that do not deform: {bad}')
    return out
