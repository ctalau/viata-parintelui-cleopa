"""Every animation clip of the toy monk (in place; the runtime moves the root). See clipkit.py for the channels.

Conventions: times in seconds; positions in three coords of the REST figure (y up, +z front, figure's left = +x,
right hand at -x). Shoulder (0.70, 2.62, 0), wrist at rest (0.88, 1.38, 0.12), forehead (0, 3.66, 0.58),
chin (0, 3.0, 0.5), chest front z ≈ 0.42, long-beard front z ≈ 0.62 (from 3.0 down to 1.95).
"""
import math
import bpy
import numpy as np
from clipkit import Clip, Solver, bake, FPS
import monk_model as mm

CLIPS = []


def clip(*a, **k):
    c = Clip(*a, **k)
    CLIPS.append(c)
    return c


R_IN = (1, 0, 0.25)    # right palm facing the body (inward)
L_IN = (-1, 0, 0.25)


# ----------------------------------------------------------------- idles
def idles():
    # idle: slow weight shift onto the left leg and back, chest counter-tilt, head drifts, hands hang and swing a hair
    # Humble monastic stance: the hands rest one above the other in front of the belt, the head a little bowed.
    FR = dict(space='pelvis', eff='palm', fd=(0.92, -0.30, 0.25), pn=(0.05, 0.15, -1), pole=(-0.8, -0.5, 0.1))
    FL = dict(space='pelvis', eff='palm', fd=(-0.92, -0.30, 0.25), pn=(-0.05, 0.15, -1), pole=(0.8, -0.5, 0.1))

    def folded(c, t, dy=0.0):
        c.hand('R', t, (-0.10, 1.70 + dy, 0.60), **FR)
        c.hand('L', t, (0.10, 1.60 + dy, 0.62), **FL)

    # idle: slow weight shift onto the left leg and back, chest counter-tilt, head drifts
    c = clip('idle', 6.4, loop=True, notes='standing humbly, hands folded in front, breathing, slow weight shift')
    for t, x in ((0, 0.0), (1.6, 0.045), (3.2, 0.0), (4.8, -0.03), (6.4, 0.0)):
        c.k('hips', t, x, -0.012 * abs(x) / 0.045, 0.0)
        c.k('pelvis', t, 0, 0, -x * 40)
        c.k('chest', t, 1.0, x * 20, x * 30)
        c.k('head', t, 2.0, -x * 40, -x * 25)
    folded(c, 0); folded(c, 3.2, 0.015); folded(c, 6.4)
    c.fing('both', 0, 'relaxed')
    c = clip('stand', 6.4, loop=True, notes='arms hanging relaxed at the sides (the free arm of someone who carries something)')
    rest_hands(c, 0, 3.2, 6.4)
    c.fing('both', 0, 'relaxed')
    c = clip('idle2', 6.4, loop=True, notes='standing humbly, looks around a little, settles')
    for t, x, yaw in ((0, 0.0, 0), (1.4, -0.035, 9), (2.8, -0.04, 11), (3.6, -0.01, -4), (5.0, 0.03, -8), (6.4, 0.0, 0)):
        c.k('hips', t, x, -0.01, 0.0)
        c.k('pelvis', t, 0, 0, -x * 40)
        c.k('chest', t, 1.5, yaw * 0.15, x * 30)
        c.k('look', t, 2.0, yaw, 0)
    folded(c, 0); folded(c, 3.2, 0.015); folded(c, 6.4)
    c.fing('both', 0, 'relaxed')


# ----------------------------------------------------------------- locomotion
STEP = 0.70   # one step (cycle = 2 steps)


def walk_cycle(name, dur, step, lift, bob, lean, arm, notes, hy=1.41, up=0.10, twist=1.0, run=False):
    c = clip(name, dur, loop=True, notes=notes)
    c.events = {'stride': 2 * step}
    half = step / 2
    for s, ph in (('L', 0.0), ('R', 0.5)):
        x = 0.30 if s == 'L' else -0.30
        # stance (planted, moves back linearly in root space) then swing
        keys = []
        def at(p):
            return ((p + ph) % 1.0) * dur
        # stance: contact (heel) -> flat -> heel off
        for p, z, y, pitch in ((0.00, half, 0.19, 14), (0.10, half - step * 0.2, 0.13, 0), (0.40, -half + step * 0.2, 0.13, 0), (0.50, -half, 0.22, -20),
                               (0.62, -half * 0.55, 0.19 + lift * 0.8, -12), (0.75, 0.0, 0.13 + lift, 4), (0.90, half * 0.85, 0.20 + lift * 0.35, 16)):
            keys.append((at(p), z, y, pitch))
        keys.sort()
        # wrap: duplicate around the loop ends for continuity
        first, last = keys[0], keys[-1]
        for t, z, y, pitch in [(last[0] - dur, *last[1:])] + keys + [(first[0] + dur, *first[1:])]:
            c.foot(s, t, (x, y, z), pitch=pitch, yaw=4 if s == 'L' else -4)
    for p in np.linspace(0, 1, 17 if run else 9):
        t = p * dur
        ang = 2 * math.pi * p
        if run:
            # a run is read from the whole body: it springs up between two steps, leans into every push, the shoulders
            # turn against the hips, the head stays on the goal, the bent arms pump from the hip to the chest
            # soft, round motion (sin², no sharp bounce): a toy body that jolts six times a second reads as jerky
            c.k('hips', t, 0.02 * math.sin(ang - 0.3), -bob + 0.09 * math.sin(ang) ** 2, 0.0)
            c.k('pelvis', t, 2, -7 * math.cos(ang), 2.0 * math.sin(ang))
            c.k('spine', t, 3 + 1.0 * math.cos(2 * ang), 3.5 * math.cos(ang), 0)
            c.k('chest', t, lean + 1.5 * math.cos(2 * ang), 8 * math.cos(ang), -1.5 * math.sin(ang))
            c.k('head', t, -lean * 0.75 - 1.0 * math.cos(2 * ang), -5 * math.cos(ang), 1.0 * math.sin(ang))
            for sd, sg in (('R', 1.0), ('L', -1.0)):
                u = 0.5 + 0.5 * sg * math.cos(ang)            # 1 = this hand in front
                u = u * u * (3 - 2 * u)
                x = -sg * (0.94 - 0.30 * u)
                c.hand(sd, t, (x, 1.74 + 0.42 * u, -0.34 + 1.10 * u), space='chest', fd=(sg * 0.25 * u, 0.15 + 0.55 * u, 1.0 - 0.3 * u),
                       pn=R_IN if sd == 'R' else L_IN, pole=(-sg * 0.12, -0.3, -1))
            continue
        c.k('hips', t, 0.035 * math.sin(ang - 0.3), -bob * (0.5 + 0.5 * math.cos(2 * ang)) - 0.01, 0.0)
        c.k('pelvis', t, 0, -8 * twist * math.cos(ang), 2.5 * math.sin(ang))
        c.k('chest', t, lean + 0.8 * math.cos(2 * ang), 8 * twist * math.cos(ang), -1.5 * math.sin(ang))
        c.k('head', t, -lean * 0.6 + 1.5 * math.cos(2 * ang), -5.0 * twist * math.cos(ang), 0.6 * math.sin(ang))
        # arms opposite to the legs
        sw = arm * math.cos(ang)
        # the forward hand rises (the elbow bends), the back hand trails low behind the hip
        c.hand('R', t, (-0.92, hy + up * max(0, sw / arm) ** 1.5 + 0.03 * max(0, -sw / arm), 0.06 + sw * (1.0 if sw > 0 else 0.75)), space='chest', fd=(-0.08, -1, 0.1 + sw * 1.6), pn=R_IN, pole=(-0.5, 0, -1))
        c.hand('L', t, (0.92, hy + up * max(0, -sw / arm) ** 1.5 + 0.03 * max(0, sw / arm), 0.06 - sw * (1.0 if sw < 0 else 0.75)), space='chest', fd=(0.08, -1, 0.1 - sw * 1.6), pn=L_IN, pole=(0.5, 0, -1))
    if run:
        c.fing('both', 0, 'cup')
    return c


def locomotion():
    walk_cycle('walk', 0.92, STEP, 0.15, 0.10, 3.0, 0.36, 'walk cycle, stride 1.40 per cycle (runtime: phase = distance / stride)')
    # a calm, unhurried walk (style "calm"): shorter steps, a small arm swing, little bob — an old monk walking in peace
    walk_cycle('stroll', 0.98, STEP, 0.11, 0.06, 2.0, 0.16, 'calm walk (style calm), stride 1.40 per cycle', up=0.04, twist=0.6)
    # hurrying monks WALK briskly (a run with bent knees and pumping arms read as athletics): longer, quicker steps,
    # upright body, a small arm swing
    walk_cycle('hurry', 0.62, 0.86, 0.14, 0.09, 4.0, 0.2, 'brisk walk (hurry), stride 1.72 per cycle', up=0.06, twist=1.1)


# ----------------------------------------------------------------- the sign of the cross (Orthodox)
def cross_clip(name, beard):
    """Right hand, thumb + index + middle joined, ring + little folded: forehead -> belly -> RIGHT shoulder -> LEFT
    shoulder, then the hand lowers with a small bow of the head and the waist. `beard`: the long-beard path stays in
    front of the beard (z > 0.70) between the belly and the shoulders."""
    c = clip(name, 3.8, hold=None, events={'forehead': 0.85, 'belly': 1.45, 'shoulderR': 2.0, 'shoulderL': 2.5}, notes='Orthodox sign of the cross')
    zc = 0.78 if beard else 0.56        # in front of the chest / beard
    fz = 0.10 if beard else 0.0         # long beard: the hand passes a hand's width further out (it brushed the beard in film 049)
    c.touch = 0.3                        # the hand really touches the forehead, the belly and the shoulders
    c.fing('R', 0.0, 'relaxed').fing('R', 0.45, 'cross').fing('R', 3.15, 'cross').fing('R', 3.7, 'relaxed')
    # body: a breath in, head bows slightly at every touch, small waist bow at the end
    c.k('head', 0.0, 0, 0, 0).k('head', 0.5, 5, -6, 0).k('head', 0.88, 14, -20, 0).k('head', 1.06, 14, -20, 0).k('head', 1.45, 12, 0, 0).k('head', 2.0, 8, 4, 2).k('head', 2.5, 8, -14, -2).k('head', 2.75, 8, -10, 0).k('head', 3.05, 12, 0, 0).k('head', 3.3, 12, 0, 0).k('head', 3.8, 2, 0, 0)
    c.k('chest', 0.0, 0, 0, 0).k('chest', 0.5, 3, 8, 0).k('chest', 0.88, 6, 22, 0).k('chest', 1.06, 6, 22, 0).k('chest', 1.45, 6, 0, 0).k('chest', 2.0, 3, -6, 0).k('chest', 2.5, 3, 18, 0).k('chest', 2.75, 3, 14, 0).k('chest', 3.05, 16, 0, 0).k('chest', 3.3, 16, 0, 0).k('chest', 3.8, 1, 0, 0)
    c.k('spine', 0.0, 0, 0, 0).k('spine', 2.6, 0, 0, 0).k('spine', 3.05, 12, 0, 0).k('spine', 3.3, 12, 0, 0).k('spine', 3.8, 0, 0, 0)
    # the right hand
    rest = dict(space='pelvis', eff='wrist', fd=(-0.08, -1, 0.1), pn=R_IN)
    c.hand('R', 0.0, (-0.88, 1.38, 0.12), **rest)
    # the hand rises in front of the chest with the elbow DOWN, by the body (not lifted sideways like a salute)
    up = (-0.45, -1.0, 0.25)
    c.hand('R', 0.40, (-0.42, 2.55, zc + 0.42 + fz), space='chest', eff='tips', fd=(0.15, 0.9, 0.1), pn=(0.5, 0.1, -0.9), pole=up)
    c.hand('R', 0.66, (-0.22, 3.45, 0.98), space='head', eff='tips', fd=(0.45, 0.85, -0.25), pn=(0.35, -0.2, -0.9), pole=up)
    c.hand('R', 0.88, (-0.03, 3.72, 0.72), space='head', eff='tips', fd=(0.5, 0.84, -0.12), pn=(0.3, -0.2, -0.93), pole=up)
    c.hand('R', 1.06, (-0.03, 3.71, 0.73), space='head', eff='tips', fd=(0.5, 0.84, -0.12), pn=(0.3, -0.2, -0.93), pole=up)
    c.hand('R', 1.22, (-0.10, 3.0, 1.05), space='chest', eff='tips', fd=(0.15, 0.3, -0.9), pn=(0.25, 0.6, -0.6), pole=(-0.9, -0.6, 0.4))
    zb = 0.80 if beard else 0.50      # belly touch: in front of the lower beard / on the belly
    c.hand('R', 1.45, (-0.02, 1.92 if beard else 1.88, zb), space='spine', eff='tips', fd=(0.15, 0.35, -0.92), pn=(0.2, 0.9, -0.3), pole=(-0.7, -0.8, 0.1))
    c.hand('R', 1.72, (-0.28, 2.30, zc + 0.16 + fz), space='chest', eff='tips', fd=(0.1, 0.5, -0.85), pn=(0.5, 0.6, -0.5), pole=(-0.5, -1, 0.3))
    c.hand('R', 2.0, (-0.50, 2.60, 0.40), space='chest', eff='tips', fd=(-0.15, 0.25, -0.95), pn=(0.8, 0.2, -0.5), pole=(-0.35, -1, 0.55))
    c.hand('R', 2.25, (-0.05, 2.72, zc + 0.14 + fz), space='chest', eff='tips', fd=(0.4, 0.2, -0.9), pn=(0.4, 0.2, -0.9), pole=(-0.3, -1, 0.5))
    c.hand('R', 2.5, (0.46, 2.72, 0.44) if beard else (0.46, 2.62, 0.42), space='chest', eff='tips', fd=(0.78, 0.1, -0.61) if beard else (0.93, 0.1, -0.35), pn=(0.2, 0.2, -0.95), pole=(-0.2, -1, 0.5))
    c.hand('R', 2.72, (0.34, 2.60, zc + 0.10 + fz), space='chest', eff='tips', fd=(0.78, 0.1, -0.61), pn=(0.2, 0.2, -0.95), pole=(-0.2, -1, 0.5))
    c.hand('R', 3.2, (-0.72, 1.72, 0.58), space='pelvis', eff='wrist', fd=(0.1, -0.9, 0.4), pn=(0.9, 0, 0.2), pole=(-0.6, 0, -1))
    c.hand('R', 3.8, (-0.88, 1.38, 0.12), **rest)
    return c


RP, LP = (-0.88, 1.38, 0.12), (0.88, 1.38, 0.12)
RR = dict(space='pelvis', eff='wrist', fd=(-0.08, -1, 0.1), pn=R_IN, pole=(-0.5, 0, -1))
LR = dict(space='pelvis', eff='wrist', fd=(0.08, -1, 0.1), pn=L_IN, pole=(0.5, 0, -1))


def rest_hands(c, *times, side='both'):
    for t in times:
        if side in ('both', 'R'):
            c.hand('R', t, RP, **RR)
        if side in ('both', 'L'):
            c.hand('L', t, LP, **LR)


def head_keys(c, chan, *keys):
    for t, *v in keys:
        c.k(chan, t, *v)


def talk_clips():
    c = clip('talk1', 2.0, notes='speaking: right hand opens forward, palm up')
    rest_hands(c, 0, 2.0, side='R')
    c.hand('R', 0.5, (-0.55, 1.98, 0.62), space='chest', eff='palm', fd=(0.05, -0.05, 1), pn=(0.1, 1, 0.1), pole=(-0.7, -0.6, -0.4))
    c.hand('R', 0.95, (-0.64, 2.02, 0.72), space='chest', eff='palm', fd=(-0.35, 0.05, 1), pn=(0.05, 1, 0.2), pole=(-0.7, -0.6, -0.4))
    c.hand('R', 1.4, (-0.58, 1.95, 0.64), space='chest', eff='palm', fd=(-0.1, -0.1, 1), pn=(0.1, 1, 0.1), pole=(-0.7, -0.6, -0.4))
    c.fing('R', 0, 'relaxed').fing('R', 0.5, 'open').fing('R', 1.5, 'open').fing('R', 1.95, 'relaxed')
    head_keys(c, 'head', (0, 0, 0, 0), (0.35, 4, 4, 0), (0.9, -2, -3, -2), (1.4, 3, 0, 0), (2.0, 0, 0, 0))
    head_keys(c, 'chest', (0, 0, 0, 0), (0.5, 3, 4, 0), (1.3, 1, -2, 0), (2.0, 0, 0, 0))

    c = clip('talk2', 2.2, notes='speaking: both hands open outward, palms up')
    rest_hands(c, 0, 2.2)
    c.both(0.6, (0.55, 1.86, 0.58), space='chest', eff='palm', fd=(0.35, 0, 1), pn=(-0.1, 1, 0.1), pole=(0.8, -0.5, -0.4))
    c.both(1.25, (0.74, 1.92, 0.52), space='chest', eff='palm', fd=(0.6, 0.05, 0.8), pn=(-0.1, 1, 0.1), pole=(0.8, -0.5, -0.4))
    c.fing('both', 0, 'relaxed').fing('both', 0.6, 'open').fing('both', 1.6, 'open').fing('both', 2.1, 'relaxed')
    head_keys(c, 'head', (0, 0, 0, 0), (0.5, -3, 0, 5), (1.3, 2, 0, -3), (2.2, 0, 0, 0))
    head_keys(c, 'chest', (0, 0, 0, 0), (0.6, -3, 0, 0), (1.4, -1, 0, 0), (2.2, 0, 0, 0))

    c = clip('talk3', 2.0, notes='speaking: left hand explains, head tilts')
    rest_hands(c, 0, 2.0, side='L')
    c.hand('L', 0.55, (0.50, 2.02, 0.62), space='chest', eff='palm', fd=(-0.15, 0.2, 1), pn=(-0.6, 0.8, 0), pole=(0.7, -0.6, -0.4))
    c.hand('L', 1.0, (0.44, 2.10, 0.68), space='chest', eff='palm', fd=(-0.35, 0.3, 1), pn=(-0.9, 0.4, 0), pole=(0.7, -0.6, -0.4))
    c.hand('L', 1.45, (0.52, 1.98, 0.60), space='chest', eff='palm', fd=(-0.1, 0.1, 1), pn=(-0.5, 0.85, 0), pole=(0.7, -0.6, -0.4))
    c.fing('L', 0, 'relaxed').fing('L', 0.5, 'open').fing('L', 1.5, 'cup').fing('L', 1.95, 'relaxed')
    head_keys(c, 'head', (0, 0, 0, 0), (0.45, 2, -5, -7), (1.1, 4, -3, -8), (1.6, 1, 2, -2), (2.0, 0, 0, 0))
    head_keys(c, 'chest', (0, 0, 0, 0), (0.6, 2, -5, 0), (2.0, 0, 0, 0))

    c = clip('talk4', 2.0, notes='speaking about himself: right hand on the chest (beside the beard)')
    rest_hands(c, 0, 2.0, side='R')
    c.hand('R', 0.55, (-0.34, 2.26, 0.47), space='chest', eff='palm', fd=(0.75, 0.45, 0.1), pn=(0.05, 0, -1), pole=(-0.8, -0.6, 0))
    c.hand('R', 1.35, (-0.34, 2.24, 0.47), space='chest', eff='palm', fd=(0.75, 0.45, 0.1), pn=(0.05, 0, -1), pole=(-0.8, -0.6, 0))
    c.fing('R', 0, 'relaxed').fing('R', 0.5, 'open').fing('R', 1.4, 'open').fing('R', 1.9, 'relaxed')
    head_keys(c, 'head', (0, 0, 0, 0), (0.5, 8, 0, 3), (1.3, 6, 0, 2), (2.0, 0, 0, 0))
    head_keys(c, 'chest', (0, 0, 0, 0), (0.55, -3, 4, 0), (1.4, -2, 3, 0), (2.0, 0, 0, 0))

    c = clip('nod', 1.0, notes='yes: small nod')
    head_keys(c, 'head', (0, 0, 0, 0), (0.14, -3, 0, 0), (0.38, 14, 0, 0), (0.58, 2, 0, 0), (0.75, 8, 0, 0), (1.0, 0, 0, 0))
    head_keys(c, 'chest', (0, 0, 0, 0), (0.4, 2, 0, 0), (1.0, 0, 0, 0))
    c = clip('shake', 1.8, notes='no: shakes the head, unhurried')
    head_keys(c, 'look', (0, 0, 0, 0), (0.38, 2, 15, 0), (0.82, 2, -15, 0), (1.22, 2, 9, 0), (1.52, 1, -4, 0), (1.8, 0, 0, 0))
    c = clip('listen', 6.4, loop=True, notes='listening: head tilted, small nods')
    head_keys(c, 'head', (0, 3, 0, 6), (1.2, 7, 0, 7), (1.6, 3, 0, 6), (3.2, 4, 2, -4), (4.4, 8, 2, -5), (4.8, 4, 2, -4), (6.4, 3, 0, 6))
    for t, x in ((0, 0.02), (3.2, -0.025), (6.4, 0.02)):
        c.k('hips', t, x, -0.005, 0); c.k('pelvis', t, 0, 0, -x * 40); c.k('chest', t, 2, 0, x * 30)
    c = clip('look', 1.8, notes='looks around: left, right, back')
    head_keys(c, 'look', (0, 0, 0, 0), (0.5, 0, 35, 0), (0.8, 0, 35, 0), (1.25, 0, -30, 0), (1.8, 0, 0, 0))
    head_keys(c, 'chest', (0, 0, 0, 0), (0.55, 0, 8, 0), (1.3, 0, -7, 0), (1.8, 0, 0, 0))


def turn_clip():
    c = clip('turn', 0.7, notes='small steps in place while the root turns (runtime blends it during heading changes)')
    c.foot('L', 0, (0.30, 0.13, 0), yaw=4).foot('L', 0.18, (0.32, 0.21, 0.04), pitch=-6, yaw=4).foot('L', 0.36, (0.30, 0.13, 0), yaw=4)
    c.foot('R', 0, (-0.30, 0.13, 0), yaw=-4).foot('R', 0.30, (-0.30, 0.13, 0), yaw=-4).foot('R', 0.48, (-0.32, 0.21, 0.04), pitch=-6, yaw=-4).foot('R', 0.66, (-0.30, 0.13, 0), yaw=-4)
    head_keys(c, 'hips', (0, 0, 0, 0), (0.18, 0.04, 0.0, 0), (0.33, 0, -0.02, 0), (0.48, -0.04, 0, 0), (0.7, 0, 0, 0))


def sit_clips():
    hy = mm.SEAT_H + 0.22 - mm.HIP_Y          # pelvis drop when seated
    back = -0.50                               # the seat is 0.5 behind the feet (root = feet)
    feet = lambda c, t: (c.foot('L', t, (0.31, 0.13, 0.12), yaw=8), c.foot('R', t, (-0.31, 0.13, 0.12), yaw=-8))
    # the elbows stand a little out from the body (pressed to the ribs the figure looks cramped)
    # (reviewed twice: pressed to the ribs looked cramped, wide out looked odd — halfway)
    thighR = dict(space='root', eff='palm', fd=(0.12, -0.18, 1), pn=(0.05, -1, 0.1), pole=(-0.5, -0.45, -0.8))
    thighL = dict(space='root', eff='palm', fd=(-0.12, -0.18, 1), pn=(-0.05, -1, 0.1), pole=(0.5, -0.45, -0.8))
    TR, TL = (-0.355, mm.SEAT_H + 0.56, 0.11), (0.355, mm.SEAT_H + 0.56, 0.11)   # on the knees, clear of the belly

    c = clip('sit_down', 1.7, events={'seated': 1.3}, notes='sits down backward onto a seat 0.5 behind the feet (seat height 0.62)')
    feet(c, 0)
    head_keys(c, 'hips', (0, 0, 0, 0), (0.3, 0, -0.06, 0.02), (0.8, 0, hy * 0.6, back * 0.6), (1.3, 0, hy, back), (1.7, 0, hy, back))
    head_keys(c, 'chest', (0, 0, 0, 0), (0.35, 10, 0, 0), (0.85, 24, 0, 0), (1.3, 10, 0, 0), (1.7, 2, 0, 0))
    head_keys(c, 'spine', (0, 0, 0, 0), (0.85, 10, 0, 0), (1.3, 4, 0, 0), (1.7, 2, 0, 0))
    head_keys(c, 'head', (0, 0, 0, 0), (0.4, -6, 0, 0), (0.9, -14, 0, 0), (1.4, -4, 0, 0), (1.7, 0, 0, 0))
    rest_hands(c, 0)
    c.hand('R', 0.85, (-0.72, 1.22, 0.42), space='root', eff='palm', fd=(0.1, -0.6, 0.8), pn=(0.3, -0.8, 0.2), pole=(-1, 0, -0.5))
    c.hand('L', 0.85, (0.72, 1.22, 0.42), space='root', eff='palm', fd=(-0.1, -0.6, 0.8), pn=(-0.3, -0.8, 0.2), pole=(1, 0, -0.5))
    c.hand('R', 1.45, TR, **thighR).hand('L', 1.45, TL, **thighL).hand('R', 1.7, TR, **thighR).hand('L', 1.7, TL, **thighL)
    c.fing('both', 0, 'relaxed').fing('both', 1.4, 'relaxed')

    c = clip('sit_idle', 6.4, loop=True, base='sit', notes='seated, hands on the knees, breathing')
    feet(c, 0)
    for t, x in ((0, 0), (3.2, 0.015), (6.4, 0)):
        c.k('hips', t, x, hy, back); c.k('chest', t, 1 + x * 60, 0, x * 40); c.k('spine', t, 1, 0, 0); c.k('head', t, 3, x * 80, 0)
    for t in (0, 6.4):
        c.hand('R', t, TR, **thighR).hand('L', t, TL, **thighL)

    # seated invitation: the hand rises from the knee forward and up (the standing `offer` starts from hanging arms; blended
    # over the seated pose it went through the lap and the robe)
    c = clip('offer_sit', 1.5, hold=(0.55, 0.95), base='sit', notes='seated: open right palm forward, from the knee and back (invites)')
    feet(c, 0)
    for t in (0, 1.5):
        c.k('hips', t, 0, hy, back); c.k('spine', t, 1, 0, 0)
    head_keys(c, 'chest', (0, 1, 0, 0), (0.55, 5, 5, 0), (0.95, 5, 5, 0), (1.5, 1, 0, 0))
    head_keys(c, 'head', (0, 3, 0, 0), (0.5, 6, 3, 4), (1.0, 6, 3, 4), (1.5, 3, 0, 0))
    c.hand('L', 0, TL, **thighL).hand('L', 1.5, TL, **thighL)
    lift = dict(space='root', eff='palm', fd=(0.1, 0.35, 1), pn=(0.1, 1, 0.2), pole=(-0.9, -0.4, -0.4))
    c.hand('R', 0, TR, **thighR).hand('R', 0.25, (-0.62, mm.SEAT_H + 0.92, 0.66), **lift)
    for t in (0.55, 0.95):
        c.hand('R', t, (-0.92, 2.28, 1.12), space='chest', eff='palm', fd=(-0.35, 0.05, 1), pn=(0.1, 1, 0.1), pole=(-0.9, -0.7, -0.2))
    c.hand('R', 1.25, (-0.62, mm.SEAT_H + 0.92, 0.66), **lift).hand('R', 1.5, TR, **thighR)
    c.fing('R', 0, 'relaxed').fing('R', 0.4, 'open').fing('R', 1.05, 'open').fing('R', 1.45, 'relaxed')

    c = clip('stand_up', 1.6, events={'standing': 1.2}, notes='stands up from a seat (reverse of sit_down, leaning forward first)')
    feet(c, 0)
    head_keys(c, 'hips', (0, 0, hy, back), (0.35, 0, hy + 0.02, back + 0.04), (0.8, 0, hy * 0.5, back * 0.45), (1.25, 0, 0.0, 0.0), (1.6, 0, 0, 0))
    head_keys(c, 'chest', (0, 2, 0, 0), (0.45, 26, 0, 0), (0.9, 18, 0, 0), (1.3, 2, 0, 0), (1.6, 0, 0, 0))
    head_keys(c, 'spine', (0, 2, 0, 0), (0.45, 10, 0, 0), (1.3, 0, 0, 0))
    head_keys(c, 'head', (0, 0, 0, 0), (0.45, -16, 0, 0), (1.0, -6, 0, 0), (1.6, 0, 0, 0))
    c.hand('R', 0, TR, **thighR).hand('L', 0, TL, **thighL).hand('R', 0.4, TR, **thighR).hand('L', 0.4, TL, **thighL)
    rest_hands(c, 1.35, 1.6)


def bow_clips():
    c = clip('bow', 1.7, hold=(0.7, 1.0), notes='small greeting bow')
    head_keys(c, 'chest', (0, 0, 0, 0), (0.15, -1, 0, 0), (0.7, 10, 0, 0), (1.0, 11, 0, 0), (1.7, 0, 0, 0))
    head_keys(c, 'spine', (0, 0, 0, 0), (0.7, 9, 0, 0), (1.0, 9, 0, 0), (1.7, 0, 0, 0))
    head_keys(c, 'head', (0, 0, 0, 0), (0.55, 3, 0, 0), (1.05, 4, 0, 0), (1.7, 0, 0, 0))
    head_keys(c, 'hips', (0, 0, 0, 0), (0.7, 0, -0.01, -0.06), (1.0, 0, -0.01, -0.06), (1.7, 0, 0, 0))
    rest_hands(c, 0, 1.7)
    for t in (0.7, 1.0):
        c.hand('R', t, (-0.70, 1.45, 0.30), space='chest', eff='wrist', fd=(0.05, -1, 0.25), pn=R_IN, pole=(-0.5, 0, -1))
        c.hand('L', t, (0.70, 1.45, 0.30), space='chest', eff='wrist', fd=(-0.05, -1, 0.25), pn=L_IN, pole=(0.5, 0, -1))

    c = clip('bow_deep', 3.0, hold=(1.2, 1.7), events={'touch': 1.25}, notes='metanie: deep bow from the waist, the right hand touches the ground')
    head_keys(c, 'chest', (0, 0, 0, 0), (0.3, 4, 0, 0), (1.2, 40, 0, 0), (1.7, 40, 0, 0), (2.5, 6, 0, 0), (3.0, 0, 0, 0))
    head_keys(c, 'spine', (0, 0, 0, 0), (1.2, 32, 0, 0), (1.7, 32, 0, 0), (2.6, 2, 0, 0), (3.0, 0, 0, 0))
    head_keys(c, 'pelvis', (0, 0, 0, 0), (1.2, 22, 0, 0), (1.7, 22, 0, 0), (2.6, 0, 0, 0))
    head_keys(c, 'head', (0, 0, 0, 0), (1.2, -10, 0, 0), (1.7, -10, 0, 0), (2.6, 2, 0, 0), (3.0, 0, 0, 0))
    head_keys(c, 'hips', (0, 0, 0, 0), (1.2, 0, -0.30, -0.34), (1.7, 0, -0.30, -0.34), (2.6, 0, -0.02, 0), (3.0, 0, 0, 0))
    rest_hands(c, 0, 3.0)
    c.hand('R', 0.75, (-0.45, 0.9, 0.75), space='root', eff='wrist', fd=(0.1, -0.9, 0.4), pn=(0.9, 0, 0.3), pole=(-0.8, 0.2, -0.4))
    c.hand('R', 1.25, (-0.30, 0.05, 1.05), space='root', eff='tips', fd=(0.15, -0.8, 0.55), pn=(0.4, -0.3, -0.8), pole=(-0.9, 0.3, -0.2))
    c.hand('R', 1.7, (-0.30, 0.05, 1.05), space='root', eff='tips', fd=(0.15, -0.8, 0.55), pn=(0.4, -0.3, -0.8), pole=(-0.9, 0.3, -0.2))
    c.hand('R', 2.3, (-0.70, 1.20, 0.45), space='root', eff='wrist', fd=(0.0, -1, 0.3), pn=R_IN, pole=(-0.8, 0, -0.6))
    for t in (1.2, 1.7):
        c.hand('L', t, (0.62, 1.40, 0.35), space='chest', eff='wrist', fd=(-0.05, -1, 0.2), pn=L_IN, pole=(0.5, 0, -1))
    c.fing('R', 0, 'relaxed').fing('R', 1.0, 'cross').fing('R', 2.2, 'cross').fing('R', 2.8, 'relaxed')


def pray_clip(name, beard):
    z = 1.0 if beard else 0.66
    c = clip(name, 3.4, hold=(1.0, 2.4), notes='standing prayer: palms together before the chest, head bowed')
    rest_hands(c, 0, 3.4)
    c.hand('R', 0.95, (-0.012, 2.22, z), space='chest', eff='palm', fd=(0.0, 1, 0.22), pn=(1, 0, 0.02), pole=(-1, -0.6, -0.3))
    c.hand('L', 1.0, (0.012, 2.22, z), space='chest', eff='palm', fd=(0.0, 1, 0.22), pn=(-1, 0, 0.02), pole=(1, -0.6, -0.3))
    c.hand('R', 2.4, (-0.012, 2.20, z), space='chest', eff='palm', fd=(0.0, 1, 0.22), pn=(1, 0, 0.02), pole=(-1, -0.6, -0.3))
    c.hand('L', 2.4, (0.012, 2.20, z), space='chest', eff='palm', fd=(0.0, 1, 0.22), pn=(-1, 0, 0.02), pole=(1, -0.6, -0.3))
    c.fing('both', 0, 'relaxed').fing('both', 0.8, 'pray').fing('both', 2.5, 'pray').fing('both', 3.2, 'relaxed')
    head_keys(c, 'head', (0, 0, 0, 0), (1.0, 14, 0, 0), (2.4, 16, 0, 0), (3.4, 0, 0, 0))
    head_keys(c, 'chest', (0, 0, 0, 0), (1.0, 4, 0, 0), (2.4, 5, 0, 0), (3.4, 0, 0, 0))


def hand_gestures():
    # The Orthodox blessing of the people: the right hand (fingers IC XC, palm toward them) is lifted in front of the
    # shoulder, well clear of the beard, and draws a large, unhurried cross: up, down, to HIS left, to HIS right (those
    # blessed see it go to their right shoulder first, as when they cross themselves). The elbow stays low by the body,
    # the left hand rests, the head bows a little after the hand.
    c = clip('bless', 3.6, events={'cross': 1.0}, notes='blesses: the right hand (the Orthodox blessing: the fingers form IC XC) draws a large cross in the air toward the others: up, down, his left, his right')
    rest_hands(c, 0, 3.6, side='R')
    kw = dict(space='chest', eff='tips', fd=(0.05, 0.95, 0.3), pn=(0.05, 0.25, 1), pole=(-0.45, -1, -0.15))
    for t, x, y in ((0.6, -0.62, 2.75), (1.0, -0.62, 3.12), (1.2, -0.62, 3.14), (1.75, -0.62, 2.34), (1.9, -0.62, 2.33),
                    (2.3, -0.30, 2.76), (2.42, -0.29, 2.77), (2.85, -0.96, 2.77), (2.98, -0.97, 2.76), (3.2, -0.66, 2.62)):
        c.hand('R', t, (x, y, 1.12), **kw)
    c.fing('R', 0, 'relaxed').fing('R', 0.5, 'bless').fing('R', 3.05, 'bless').fing('R', 3.5, 'relaxed')
    head_keys(c, 'head', (0, 0, 0, 0), (1.1, -3, 0, 0), (1.85, 6, 0, 0), (2.36, 3, 5, 0), (2.92, 3, -5, 0), (3.6, 0, 0, 0))
    head_keys(c, 'chest', (0, 0, 0, 0), (1.1, -1, -3, 0), (1.85, 3, -3, 0), (2.92, 2, -4, 0), (3.6, 0, 0, 0))

    c = clip('offer', 1.5, hold=(0.55, 0.95), notes='offers / invites: open right palm forward')
    rest_hands(c, 0, 1.5, side='R')
    for t in (0.55, 0.95):
        c.hand('R', t, (-0.42, 1.85, 0.95), space='chest', eff='palm', fd=(0.15, 0.0, 1), pn=(0.1, 1, 0.05), pole=(-0.8, -0.6, -0.2))
    c.fing('R', 0, 'relaxed').fing('R', 0.45, 'open').fing('R', 1.05, 'open').fing('R', 1.45, 'relaxed')
    head_keys(c, 'chest', (0, 0, 0, 0), (0.55, 6, 5, 0), (0.95, 6, 5, 0), (1.5, 0, 0, 0))
    head_keys(c, 'head', (0, 0, 0, 0), (0.5, 4, 3, 4), (1.0, 4, 3, 4), (1.5, 0, 0, 0))

    c = clip('point', 2.0, hold=(0.75, 1.35), notes='points forward with the right index')
    rest_hands(c, 0, 2.0, side='R')
    c.hand('R', 0.4, (-0.66, 1.95, 0.72), space='chest', eff='index', fd=(0.0, 0.3, 1), pn=(1, 0, 0), pole=(-1, -0.6, -0.3))
    for t in (0.75, 1.35):
        c.hand('R', t, (-0.52, 2.38, 1.16), space='chest', eff='index', fd=(0.05, 0.02, 1), pn=(1, 0, 0), pole=(-0.8, -0.7, -0.2))
    c.fing('R', 0, 'relaxed').fing('R', 0.55, 'point').fing('R', 1.5, 'point').fing('R', 1.95, 'relaxed')
    head_keys(c, 'chest', (0, 0, 0, 0), (0.75, 2, 6, 0), (1.35, 2, 6, 0), (2.0, 0, 0, 0))

    for name, beard in (('think', False), ('think_beard', True)):
        c = clip(name, 2.6, hold=(0.8, 1.9), notes='thinks: hand to the chin (strokes the beard for long beards)')
        rest_hands(c, 0, 2.6)
        if beard:
            kw = dict(space='head', eff='knuckles', fd=(0.5, -0.1, -0.85), pn=(0.4, -0.3, -0.8), pole=(-0.6, -1, 0.1))
            c.hand('R', 0.8, (-0.05, 2.80, 0.74), **kw).hand('R', 1.35, (-0.04, 2.55, 0.78), **kw).hand('R', 1.9, (-0.05, 2.78, 0.75), **kw)
        else:
            kw = dict(space='head', eff='knuckles', fd=(0.5, 0.1, -0.85), pn=(0.4, 0.4, -0.8), pole=(-0.6, -1, 0.1))
            c.hand('R', 0.8, (-0.04, 3.02, 0.64), **kw).hand('R', 1.9, (-0.04, 3.0, 0.64), **kw)
        lk = dict(space='chest', eff='palm', fd=(-0.9, 0.2, 0.3), pn=(0, 1, 0.1), pole=(1, -0.6, -0.2))
        c.hand('L', 0.9, (-0.18, 1.95, 0.58 if not beard else 0.70), **lk).hand('L', 1.9, (-0.18, 1.95, 0.58 if not beard else 0.70), **lk)
        c.fing('R', 0, 'relaxed').fing('R', 0.7, 'fist' if not beard else 'cup').fing('R', 2.0, 'fist' if not beard else 'cup').fing('R', 2.5, 'relaxed')
        c.hand('R', 2.3, (-0.86, 1.9, 0.6), space='chest', eff='wrist', fd=(0, -0.8, 0.6), pn=R_IN)
        c.hand('R', 0.35, (-0.9, 1.9, 0.62), space='chest', eff='wrist', fd=(0, 0.2, 0.9), pn=R_IN)
        head_keys(c, 'head', (0, 0, 0, 0), (0.8, -6, -8, 7), (1.9, -5, -10, 8), (2.6, 0, 0, 0))

    c = clip('shrug', 1.9, hold=(0.7, 1.2), notes='asks / wonders: open palms a little forward, elbows by the body')
    rest_hands(c, 0, 1.9)
    c.both(0.7, (0.56, 1.80, 0.74), space='chest', eff='palm', fd=(0.3, 0.05, 0.95), pn=(-0.15, 1, 0), pole=(0.35, -0.7, -1))
    c.both(1.2, (0.57, 1.82, 0.74), space='chest', eff='palm', fd=(0.3, 0.05, 0.95), pn=(-0.15, 1, 0), pole=(0.35, -0.7, -1))
    c.fing('both', 0, 'relaxed').fing('both', 0.6, 'open').fing('both', 1.3, 'open').fing('both', 1.9, 'relaxed')
    for s in ('clav_L', 'clav_R'):
        sg = 1 if s == 'clav_L' else -1
        head_keys(c, s, (0, 0, 0, 0), (0.7, 0, 0, 5 * sg), (1.2, 0, 0, 5 * sg), (1.9, 0, 0, 0))
    head_keys(c, 'head', (0, 0, 0, 0), (0.7, -3, 0, 7), (1.2, -3, 0, 7), (1.9, 0, 0, 0))

    # a small, friendly wave: the elbow stays by the body, the open hand in front of the shoulder rocks from the wrist
    c = clip('wave', 2.1, notes='waves the right hand (elbow low, hand in front of the shoulder)')
    rest_hands(c, 0, 2.1, side='R')
    # the wrist stays put and the fingers swing from side to side (not the palm's middle fixed, the wrist going the other way)
    for i, t in enumerate((0.5, 0.78, 1.06, 1.34, 1.6)):
        sw = 0.42 if i % 2 else -0.3
        c.hand('R', t, (-0.92, 2.47, 0.80), space='chest', eff='wrist', fd=(sw, 1, 0.12), pn=(0.05, 0.1, 1), pole=(-0.5, -1, -0.15))
    c.fing('R', 0, 'relaxed').fing('R', 0.42, 'open').fing('R', 1.65, 'open').fing('R', 2.05, 'relaxed')
    head_keys(c, 'head', (0, 0, 0, 0), (0.5, 2, 0, 5), (1.6, 2, 0, 5), (2.1, 0, 0, 0))


    # knocks on a door: the right fist (knuckles to the door, palm towards himself) at head height, three short raps
    c = clip('knock', 2.5, notes='knocks on a door in front of him with the right fist, three raps (stand ≈ 1.3 from the door)')
    rest_hands(c, 0, 2.5, side='R')
    KN = dict(space='chest', eff='palm', fd=(0.15, 1, 0.1), pn=(0.1, 0.05, -1), pole=(-0.7, -1, -0.1))
    c.hand('R', 0.5, (-0.42, 2.72, 0.92), **KN)
    for t in (0.8, 1.12, 1.44):
        c.hand('R', t, (-0.42, 2.72, 1.08), **KN)
        c.hand('R', t + 0.16, (-0.42, 2.74, 0.93), **KN)
    c.hand('R', 1.95, (-0.45, 2.6, 0.88), **KN)
    c.fing('R', 0, 'relaxed').fing('R', 0.4, 'fist').fing('R', 1.95, 'fist').fing('R', 2.45, 'relaxed')
    head_keys(c, 'head', (0, 0, 0, 0), (0.5, -3, 0, 0), (1.9, -3, 0, 0), (2.5, 0, 0, 0))


def emotion_clips():
    c = clip('joy', 1.3, notes='joy: a happy bounce on the toes, hands up')
    head_keys(c, 'hips', (0, 0, 0, 0), (0.25, 0, -0.11, 0), (0.5, 0, 0.09, 0), (0.75, 0, -0.07, 0), (1.0, 0, 0.02, 0), (1.3, 0, 0, 0))
    for s, x in (('L', 0.30), ('R', -0.30)):
        c.foot(s, 0, (x, 0.13, 0)).foot(s, 0.25, (x, 0.13, 0)).foot(s, 0.5, (x, 0.19, -0.04), pitch=-18).foot(s, 0.75, (x, 0.13, 0)).foot(s, 1.3, (x, 0.13, 0))
    rest_hands(c, 0, 1.3)
    c.both(0.5, (0.55, 2.25, 0.55), space='chest', eff='palm', fd=(0.1, 1, 0.3), pn=(-0.3, 0, 1), pole=(1, -0.5, -0.3))
    c.both(0.8, (0.62, 2.05, 0.45), space='chest', eff='palm', fd=(0.1, 0.8, 0.5), pn=(-0.3, 0, 1), pole=(1, -0.5, -0.3))
    c.fing('both', 0, 'relaxed').fing('both', 0.45, 'open').fing('both', 1.0, 'open').fing('both', 1.3, 'relaxed')
    head_keys(c, 'head', (0, 0, 0, 0), (0.25, 5, 0, 0), (0.5, -8, 0, 4), (0.8, -3, 0, -4), (1.3, 0, 0, 0))

    # laughs out loud (ha-ha-ha), not a hop of joy: the hands go to the belly, the head tips back, and the chest shakes with
    # each "ha" (short back-and-forth jolts, the shoulders bobbing), then a bigger bend forward on the last laugh, and back
    D = 2.6
    c = clip('laugh', D, notes='laughs heartily (ha-ha-ha): hands on the belly, head back, the chest shaking with each ha, a bend forward at the end')
    rest_hands(c, 0, D)
    BK = dict(space='pelvis', eff='palm', pole=(0, -1, -0.6))
    for t in (0.35, 2.05):
        c.hand('R', t, (-0.30, 1.86, 0.66), fd=(1, -0.35, 0.1), pn=(0.05, 0, -1), **BK)
        c.hand('L', t, (0.30, 1.86, 0.66), fd=(-1, -0.35, 0.1), pn=(-0.05, 0, -1), **BK)
    c.fing('both', 0, 'relaxed').fing('both', 0.3, 'open').fing('both', 2.1, 'open').fing('both', D, 'relaxed')
    ch, hd, hp = [(0, 0, 0, 0), (0.3, -5, 0, 0)], [(0, 0, 0, 0), (0.3, -12, 0, 0)], [(0, 0, 0, 0)]
    t, i = 0.3, 0
    while t < 1.5:
        a = 1 if i % 2 else -1
        ch.append((t + 0.12, -8 if a < 0 else 3, 0, 3 * a)); hd.append((t + 0.12, -14 if a < 0 else -3, 0, 4 * a))
        hp.append((t + 0.12, 0, -0.05 if a > 0 else 0, 0))
        t += 0.13; i += 1
    ch += [(1.75, 12, 0, 0), (1.9, 8, 0, 0), (2.05, 12, 0, 0), (D, 0, 0, 0)]
    hd += [(1.75, 2, 0, 0), (1.9, -4, 0, 0), (2.05, 2, 0, 0), (D, 0, 0, 0)]
    hp += [(1.75, 0, -0.04, -0.04), (2.05, 0, -0.04, -0.04), (D, 0, 0, 0)]
    head_keys(c, 'chest', *ch); head_keys(c, 'head', *hd); head_keys(c, 'hips', *hp)

    c = clip('sad', 2.2, hold=(0.9, 1.6), notes='sad: slumps, head down, hands together low')
    rest_hands(c, 0, 2.2)
    for t in (0.9, 1.6):
        c.hand('R', t, (-0.10, 1.45, 0.50), space='pelvis', eff='palm', fd=(0.9, -0.3, 0.2), pn=(0.1, 0.3, -1), pole=(-1, 0, -0.4))
        c.hand('L', t, (0.10, 1.43, 0.53), space='pelvis', eff='palm', fd=(-0.9, -0.3, 0.2), pn=(-0.1, 0.4, 1), pole=(1, 0, -0.4))
    head_keys(c, 'chest', (0, 0, 0, 0), (0.9, 12, 0, 0), (1.6, 13, 0, 0), (2.2, 0, 0, 0))
    head_keys(c, 'head', (0, 0, 0, 0), (0.9, 16, 0, 3), (1.6, 18, 0, 3), (2.2, 0, 0, 0))
    head_keys(c, 'hips', (0, 0, 0, 0), (0.9, 0, -0.02, 0), (2.2, 0, 0, 0))

    c = clip('ashamed', 2.2, hold=(0.8, 1.6), notes='ashamed: head down, eyes away, hands clasp')
    rest_hands(c, 0, 2.2)
    for t in (0.8, 1.6):
        c.hand('R', t, (-0.12, 1.52, 0.52), space='pelvis', eff='palm', fd=(0.9, -0.2, 0.2), pn=(0.1, 0.3, -1), pole=(-1, 0, -0.4))
        c.hand('L', t, (0.10, 1.50, 0.55), space='pelvis', eff='palm', fd=(-0.9, -0.2, 0.2), pn=(-0.1, 0.4, 1), pole=(1, 0, -0.4))
    head_keys(c, 'head', (0, 0, 0, 0), (0.8, 24, 10, -6), (1.6, 26, 12, -6), (2.2, 0, 0, 0))
    head_keys(c, 'chest', (0, 0, 0, 0), (0.8, 7, 4, 0), (1.6, 8, 4, 0), (2.2, 0, 0, 0))

    c = clip('surprised', 1.3, notes='surprised: a quick half step back, hands up')
    head_keys(c, 'hips', (0, 0, 0, 0), (0.25, 0, 0.02, -0.10), (0.55, 0, -0.03, -0.14), (1.3, 0, 0, 0))
    c.foot('R', 0, (-0.30, 0.13, 0), yaw=-4).foot('R', 0.15, (-0.30, 0.13, 0), yaw=-4).foot('R', 0.32, (-0.32, 0.22, -0.16), yaw=-4).foot('R', 0.5, (-0.32, 0.13, -0.26), yaw=-4)
    c.foot('R', 0.95, (-0.32, 0.13, -0.26), yaw=-4).foot('R', 1.15, (-0.31, 0.20, -0.12), yaw=-4).foot('R', 1.3, (-0.30, 0.13, 0), yaw=-4)
    head_keys(c, 'chest', (0, 0, 0, 0), (0.25, -9, 0, 0), (0.9, -6, 0, 0), (1.3, 0, 0, 0))
    head_keys(c, 'head', (0, 0, 0, 0), (0.2, -8, 0, 0), (0.9, -4, 0, 0), (1.3, 0, 0, 0))
    rest_hands(c, 0, 1.3)
    c.both(0.3, (0.48, 2.28, 0.62), space='chest', eff='palm', fd=(0.1, 1, 0.2), pn=(-0.2, 0, 1), pole=(1, -0.6, -0.2))
    c.both(0.85, (0.52, 2.15, 0.58), space='chest', eff='palm', fd=(0.1, 1, 0.2), pn=(-0.2, 0, 1), pole=(1, -0.6, -0.2))
    c.fing('both', 0, 'relaxed').fing('both', 0.25, 'open').fing('both', 0.95, 'open').fing('both', 1.3, 'relaxed')


GIVE_D = 2.3     # authored distance pelvis to pelvis for give / take
HUG_D = 1.55     # authored distance for the embrace
CARRY_R = dict(space='pelvis', eff='grip', fd=(0.1, -0.15, 1), pn=(1, 0, 0.1), pole=(-1, -0.3, -0.6))
CARRY_RP = (-0.66, 1.72, 0.42)


def carry_clips():
    c = clip('carry', 2.0, loop=True, layer='arm', notes='holds a prop in the right hand, forearm forward (layer: arm R)')
    c.hand('R', 0, CARRY_RP, **CARRY_R).hand('R', 2.0, CARRY_RP, **CARRY_R)
    c.fing('R', 0, 'grip')
    c = clip('carry_side', 2.0, loop=True, layer='arm', notes='holds a light prop low at the side (a staff, a basket by its handle)')
    kw = dict(space='pelvis', eff='grip', fd=(0.0, -0.75, 0.65), pn=(1, 0, 0.05), pole=(-0.5, 0, -1))
    c.hand('R', 0, (-0.98, 1.56, 0.50), **kw).hand('R', 2.0, (-0.98, 1.56, 0.50), **kw)
    c.fing('R', 0, 'grip')
    c = clip('carry2', 2.0, loop=True, layer='arms', notes='holds a prop with both hands in front of the chest (a basket, a book)')
    c.hand('R', 0, (-0.34, 1.98, 0.72), space='chest', eff='grip', fd=(0.6, -0.2, 0.8), pn=(1, 0, -0.2), pole=(-1, -0.5, -0.5))
    c.hand('L', 0, (0.34, 1.98, 0.72), space='chest', eff='grip', fd=(-0.6, -0.2, 0.8), pn=(-1, 0, -0.2), pole=(1, -0.5, -0.5))
    c.fing('both', 0, 'grip')

    c = clip('give', 1.7, events={'handover': 0.85}, partner={'clip': 'take', 'distance': GIVE_D}, notes='gives the prop in the right hand to someone 2.3 in front')
    c.hand('R', 0, CARRY_RP, **CARRY_R)
    kw = dict(space='root', eff='grip', fd=(0.0, 0.0, 1), pn=(1, 0.2, 0), pole=(-1, -0.4, -0.3))
    c.hand('R', 0.75, (-0.06, 2.05, GIVE_D / 2 - 0.02), **kw).hand('R', 1.0, (-0.06, 2.05, GIVE_D / 2 - 0.02), **kw)
    rest_hands(c, 1.7, side='R')
    c.fing('R', 0, 'grip').fing('R', 0.85, 'grip').fing('R', 1.05, 'open').fing('R', 1.6, 'relaxed')
    head_keys(c, 'chest', (0, 0, 0, 0), (0.8, 12, 0, 0), (1.0, 12, 0, 0), (1.7, 0, 0, 0))
    head_keys(c, 'hips', (0, 0, 0, 0), (0.8, 0, -0.02, 0.06), (1.7, 0, 0, 0))
    head_keys(c, 'head', (0, 0, 0, 0), (0.7, 10, 0, 0), (1.2, 4, 0, 0), (1.7, 0, 0, 0))

    c = clip('take', 1.7, events={'handover': 0.85}, partner={'clip': 'give', 'distance': GIVE_D}, notes='takes a prop from someone 2.3 in front into the right hand')
    rest_hands(c, 0, side='R')
    kw = dict(space='root', eff='grip', fd=(0.0, 0.0, 1), pn=(1, -0.2, 0), pole=(-1, -0.4, -0.3))
    c.hand('R', 0.75, (0.06, 2.0, GIVE_D / 2 - 0.02), **kw).hand('R', 0.95, (0.06, 2.0, GIVE_D / 2 - 0.02), **kw)
    c.hand('R', 1.7, CARRY_RP, **CARRY_R)
    c.fing('R', 0, 'relaxed').fing('R', 0.6, 'open').fing('R', 0.85, 'grip')
    head_keys(c, 'chest', (0, 0, 0, 0), (0.8, 11, 0, 0), (1.0, 10, 0, 0), (1.7, 0, 0, 0))
    head_keys(c, 'hips', (0, 0, 0, 0), (0.8, 0, -0.02, 0.06), (1.7, 0, 0, 0))
    head_keys(c, 'head', (0, 0, 0, 0), (0.7, 10, 0, 0), (1.3, 3, 0, 0), (1.7, 0, 0, 0))

    ground = (-0.30, 0.06, 0.78)
    for name, release in (('put_down', 1.0), ('pick_up', 0.85)):
        dur = 1.9
        c = clip(name, dur, events={'release' if name == 'put_down' else 'grab': release}, notes=f'{name.replace("_", " ")}: bends knees and waist, the right hand to the ground in front (0.78 ahead)')
        # more waist than knees: a deep knee bend pushed the robe's hem into the ground
        head_keys(c, 'hips', (0, 0, 0, 0), (release, 0, -0.36, -0.2), (release + 0.2, 0, -0.36, -0.2), (dur, 0, 0, 0))
        head_keys(c, 'chest', (0, 0, 0, 0), (release, 40, 0, 0), (release + 0.2, 40, 0, 0), (dur, 0, 0, 0))
        head_keys(c, 'spine', (0, 0, 0, 0), (release, 28, 0, 0), (release + 0.2, 24, 0, 0), (dur, 0, 0, 0))
        head_keys(c, 'pelvis', (0, 0, 0, 0), (release, 14, 0, 0), (release + 0.2, 14, 0, 0), (dur, 0, 0, 0))
        head_keys(c, 'head', (0, 0, 0, 0), (release, -6, 0, 0), (dur, 0, 0, 0))
        kw = dict(space='root', eff='grip', fd=(0.0, -0.3, 1), pn=(1, 0, 0), pole=(-1, 0.3, -0.3))
        g2 = (ground[0], ground[1] + 0.12, ground[2])
        if name == 'put_down':
            c.hand('R', 0, CARRY_RP, **CARRY_R).hand('R', release, g2, **kw).hand('R', release + 0.2, g2, **kw)
            rest_hands(c, dur, side='R')
            c.fing('R', 0, 'grip').fing('R', release, 'grip').fing('R', release + 0.25, 'open').fing('R', dur, 'relaxed')
        else:
            rest_hands(c, 0, side='R')
            c.hand('R', release, g2, **kw).hand('R', release + 0.2, g2, **kw).hand('R', dur, CARRY_RP, **CARRY_R)
            c.fing('R', 0, 'relaxed').fing('R', release - 0.25, 'open').fing('R', release, 'grip')
        c.hand('L', release, (0.62, 1.45, 0.35), space='chest', eff='wrist', fd=(-0.05, -1, 0.2), pn=L_IN, pole=(0.5, 0, -1))
        rest_hands(c, 0, dur, side='L')

    # a prop that hangs from its handle (a basket) reaches the ground long before the hand does: a small knee bend and
    # a slight lean are enough (no deep stoop)
    for name, release in (('set_down', 0.9), ('lift_up', 0.8)):
        dur = 1.7
        c = clip(name, dur, events={'release' if name == 'set_down' else 'grab': release}, notes=f'{name.replace("_", " ")}: a hanging prop (basket): knees bend a little, the right hand lowers to hip height in front')
        head_keys(c, 'hips', (0, 0, 0, 0), (release, 0, -0.16, -0.05), (release + 0.2, 0, -0.16, -0.05), (dur, 0, 0, 0))
        head_keys(c, 'chest', (0, 0, 0, 0), (release, 12, 0, 0), (release + 0.2, 12, 0, 0), (dur, 0, 0, 0))
        head_keys(c, 'spine', (0, 0, 0, 0), (release, 8, 0, 0), (release + 0.2, 8, 0, 0), (dur, 0, 0, 0))
        head_keys(c, 'head', (0, 0, 0, 0), (release, 8, 0, 0), (dur, 0, 0, 0))
        kw = dict(space='root', eff='grip', fd=(0.0, -0.3, 1), pn=(1, 0, 0), pole=(-1, 0.3, -0.3))
        low = (-0.52, 1.22, 0.62)
        if name == 'set_down':
            c.hand('R', 0, CARRY_RP, **CARRY_R).hand('R', release, low, **kw).hand('R', release + 0.2, low, **kw)
            rest_hands(c, dur, side='R')
            c.fing('R', 0, 'grip').fing('R', release, 'grip').fing('R', release + 0.25, 'open').fing('R', dur, 'relaxed')
        else:
            rest_hands(c, 0, side='R')
            c.hand('R', release, low, **kw).hand('R', release + 0.2, low, **kw).hand('R', dur, CARRY_RP, **CARRY_R)
            c.fing('R', 0, 'relaxed').fing('R', release - 0.25, 'open').fing('R', release, 'grip')
        rest_hands(c, 0, dur, side='L')

    # ties a load on (a basket hung on a donkey): both hands at hip height in front, where set_down let it go, make
    # two small knotting turns and pull the knot tight (hands apart); the cord shows on the load when the knot is pulled
    dur = 2.2
    c = clip('tie', dur, hold=(0.75, 1.5), events={'knot': 1.75}, notes='ties a cord round a load in front at hip height: two knotting turns of both hands, then pulls the knot tight')
    head_keys(c, 'hips', (0, 0, 0, 0), (0.5, 0, -0.14, -0.05), (1.9, 0, -0.14, -0.05), (dur, 0, 0, 0))
    head_keys(c, 'chest', (0, 0, 0, 0), (0.5, 12, 0, 0), (1.9, 12, 0, 0), (dur, 0, 0, 0))
    head_keys(c, 'spine', (0, 0, 0, 0), (0.5, 8, 0, 0), (1.9, 8, 0, 0), (dur, 0, 0, 0))
    head_keys(c, 'head', (0, 0, 0, 0), (0.5, 10, 0, 0), (1.9, 10, 0, 0), (dur, 0, 0, 0))
    kwR = dict(space='root', eff='grip', fd=(0.2, -0.3, 1), pn=(1, 0, 0), pole=(-1, 0.3, -0.3))
    kwL = dict(space='root', eff='grip', fd=(-0.2, -0.3, 1), pn=(-1, 0, 0), pole=(1, 0.3, -0.3))
    rest_hands(c, 0, side='R'); rest_hands(c, 0, side='L')
    yR, yL, zz = 1.26, 1.26, 0.64
    c.hand('R', 0.5, (-0.30, yR, zz), **kwR).hand('L', 0.5, (0.02, yL, zz), **kwL)
    # two knotting turns: the hands circle round each other a little
    c.hand('R', 0.75, (-0.22, yR + 0.10, zz + 0.06), **kwR).hand('L', 0.75, (-0.04, yL - 0.06, zz - 0.02), **kwL)
    c.hand('R', 1.0, (-0.28, yR - 0.04, zz + 0.02), **kwR).hand('L', 1.0, (0.04, yL + 0.08, zz + 0.06), **kwL)
    c.hand('R', 1.25, (-0.20, yR + 0.10, zz + 0.06), **kwR).hand('L', 1.25, (-0.04, yL - 0.06, zz - 0.02), **kwL)
    c.hand('R', 1.5, (-0.28, yR, zz + 0.02), **kwR).hand('L', 1.5, (0.02, yL + 0.04, zz + 0.04), **kwL)
    # pull the knot tight: hands apart
    c.hand('R', 1.75, (-0.46, yR + 0.04, zz - 0.02), **kwR).hand('L', 1.75, (0.20, yL + 0.04, zz - 0.02), **kwL)
    c.hand('R', 1.9, (-0.46, yR + 0.04, zz - 0.02), **kwR).hand('L', 1.9, (0.20, yL + 0.04, zz - 0.02), **kwL)
    rest_hands(c, dur, side='R'); rest_hands(c, dur, side='L')
    for sd in ('R', 'L'):
        c.fing(sd, 0, 'relaxed').fing(sd, 0.45, 'grip').fing(sd, 1.9, 'grip').fing(sd, dur, 'relaxed')

    c = clip('drop', 1.1, events={'release': 0.22}, notes='drops what the right hand holds (startled, the hand flies open)')
    c.hand('R', 0, CARRY_RP, **CARRY_R)
    c.hand('R', 0.3, (-0.62, 2.05, 0.55), space='pelvis', eff='palm', fd=(0.0, 0.6, 0.8), pn=(0.4, 0, 1), pole=(-1, -0.3, -0.6))
    rest_hands(c, 1.1, side='R')
    c.fing('R', 0, 'grip').fing('R', 0.22, 'open').fing('R', 1.0, 'relaxed')
    head_keys(c, 'head', (0, 0, 0, 0), (0.25, -6, 0, 0), (0.6, 10, 0, 0), (1.1, 0, 0, 0))
    head_keys(c, 'chest', (0, 0, 0, 0), (0.25, -5, 0, 0), (1.1, 0, 0, 0))

    # slips on a stone in the river: the right foot skids forward, the body drops and leans back, both arms fly out to
    # catch the balance (the right hand lets go of what it holds), then he steadies himself (the move of `put … "slip"`)
    c = clip('slip', 1.9, events={'release': 0.6}, notes='slips (a foot skids forward), arms fly out, lets go of what the right hand holds, steadies himself')
    c.hand('R', 0, CARRY_RP, **CARRY_R)
    rest_hands(c, 0, side='L')
    c.foot('L', 0, (0.30, 0.13, 0)).foot('L', 1.9, (0.30, 0.13, 0))
    c.foot('R', 0, (-0.30, 0.13, 0)).foot('R', 0.2, (-0.30, 0.13, 0)).foot('R', 0.5, (-0.36, 0.24, 0.62), pitch=-28)
    c.foot('R', 0.95, (-0.38, 0.20, 0.70), pitch=-20).foot('R', 1.35, (-0.33, 0.20, 0.30), pitch=-6).foot('R', 1.65, (-0.30, 0.13, 0.05)).foot('R', 1.9, (-0.30, 0.13, 0))
    head_keys(c, 'hips', (0, 0, 0, 0), (0.25, 0, 0.03, 0), (0.55, -0.06, -0.15, -0.16), (0.9, -0.08, -0.17, -0.12), (1.35, -0.03, -0.07, -0.04), (1.9, 0, 0, 0))
    head_keys(c, 'pelvis', (0, 0, 0, 0), (0.55, -6, 0, -7), (0.9, -5, 0, -8), (1.35, -2, 0, -3), (1.9, 0, 0, 0))
    head_keys(c, 'chest', (0, 0, 0, 0), (0.3, 2, 0, 0), (0.55, -14, 4, 9), (0.9, -12, 0, 10), (1.35, -4, 0, 3), (1.9, 0, 0, 0))
    head_keys(c, 'head', (0, 0, 0, 0), (0.35, -6, 0, 0), (0.6, -14, -6, -6), (0.95, -6, 0, -4), (1.4, 6, 0, 0), (1.9, 0, 0, 0))
    c.hand('R', 0.35, (-0.70, 2.05, 0.55), space='chest', eff='palm', fd=(-0.3, 0.8, 0.5), pn=(0.2, -0.2, 1), pole=(-1, -0.5, -0.4))
    c.hand('R', 0.7, (-1.30, 2.25, 0.35), space='chest', eff='palm', fd=(-0.6, 0.8, 0.0), pn=(0.1, -0.1, 1), pole=(-1, -0.6, -0.3))
    c.hand('R', 1.1, (-1.15, 2.05, 0.40), space='chest', eff='palm', fd=(-0.5, 0.6, 0.3), pn=(0.1, -0.1, 1), pole=(-1, -0.6, -0.3))
    c.hand('L', 0.4, (0.80, 2.10, 0.45), space='chest', eff='palm', fd=(0.4, 0.8, 0.4), pn=(-0.2, -0.2, 1), pole=(1, -0.5, -0.4))
    c.hand('L', 0.75, (1.30, 2.20, 0.30), space='chest', eff='palm', fd=(0.6, 0.8, 0.0), pn=(-0.1, -0.1, 1), pole=(1, -0.6, -0.3))
    c.hand('L', 1.1, (1.15, 2.00, 0.35), space='chest', eff='palm', fd=(0.5, 0.6, 0.3), pn=(-0.1, -0.1, 1), pole=(1, -0.6, -0.3))
    rest_hands(c, 1.9)
    c.fing('R', 0, 'grip').fing('R', 0.55, 'grip').fing('R', 0.65, 'open').fing('R', 1.6, 'open').fing('R', 1.9, 'relaxed')
    c.fing('L', 0, 'relaxed').fing('L', 0.45, 'open').fing('L', 1.6, 'open').fing('L', 1.9, 'relaxed')

    c = clip('lunge', 2.8, notes='reaches far forward after something (right hand), almost falls (arms wave), steadies himself')
    rest_hands(c, 0)
    c.foot('L', 0, (0.30, 0.13, 0)).foot('L', 2.8, (0.30, 0.13, 0))
    c.foot('R', 0, (-0.30, 0.13, 0)).foot('R', 0.3, (-0.31, 0.30, 0.40), pitch=-12).foot('R', 0.55, (-0.32, 0.13, 0.78))
    c.foot('R', 1.9, (-0.32, 0.13, 0.78)).foot('R', 2.3, (-0.31, 0.26, 0.35), pitch=-8).foot('R', 2.6, (-0.30, 0.13, 0.02)).foot('R', 2.8, (-0.30, 0.13, 0))
    head_keys(c, 'hips', (0, 0, 0, 0), (0.55, 0, -0.10, 0.30), (0.95, 0.02, -0.20, 0.42), (1.25, -0.04, -0.17, 0.36), (1.6, 0.03, -0.13, 0.32), (1.95, 0, -0.10, 0.28), (2.6, 0, -0.01, 0.02), (2.8, 0, 0, 0))
    head_keys(c, 'pelvis', (0, 0, 0, 0), (0.6, 8, 0, 0), (0.95, 14, 0, 4), (1.25, 11, 0, -6), (1.6, 8, 0, 4), (2.0, 5, 0, 0), (2.8, 0, 0, 0))
    head_keys(c, 'chest', (0, 0, 0, 0), (0.5, 12, 0, 0), (0.95, 26, -4, 5), (1.25, 22, 3, -9), (1.6, 16, -2, 7), (2.0, 8, 0, 0), (2.8, 0, 0, 0))
    head_keys(c, 'head', (0, 0, 0, 0), (0.5, -10, 0, 0), (0.95, -22, 0, 0), (1.25, -16, 0, 7), (1.6, -12, 0, -5), (2.0, -4, 0, 0), (2.8, 0, 0, 0))
    reach = dict(space='chest', eff='palm', fd=(0.1, -0.15, 1), pn=(0, -1, 0.1), pole=(-1, -0.5, -0.3))
    c.hand('R', 0.45, (-0.45, 2.05, 0.95), **reach).hand('R', 0.9, (-0.35, 1.95, 1.30), **reach).hand('R', 1.05, (-0.38, 1.98, 1.25), **reach)
    c.hand('R', 1.3, (-1.05, 2.25, 0.55), space='chest', eff='palm', fd=(-0.6, 0.8, 0.0), pn=(0.1, -0.1, 1), pole=(-1, -0.6, -0.3))
    c.hand('R', 1.6, (-1.20, 2.10, 0.40), space='chest', eff='palm', fd=(-0.5, 0.6, 0.3), pn=(0.1, -0.1, 1), pole=(-1, -0.6, -0.3))
    c.hand('L', 0.5, (0.75, 1.95, 0.35), space='chest', eff='palm', fd=(0.4, 0.6, 0.5), pn=(-0.2, -0.2, 1), pole=(1, -0.5, -0.4))
    c.hand('L', 1.0, (1.25, 2.20, 0.25), space='chest', eff='palm', fd=(0.6, 0.8, 0.0), pn=(-0.1, -0.1, 1), pole=(1, -0.6, -0.3))
    c.hand('L', 1.35, (1.05, 2.35, 0.45), space='chest', eff='palm', fd=(0.5, 0.8, 0.2), pn=(-0.1, -0.1, 1), pole=(1, -0.6, -0.3))
    c.hand('L', 1.65, (1.15, 2.05, 0.35), space='chest', eff='palm', fd=(0.5, 0.6, 0.3), pn=(-0.1, -0.1, 1), pole=(1, -0.6, -0.3))
    rest_hands(c, 2.5)
    c.fing('R', 0, 'relaxed').fing('R', 0.4, 'open').fing('R', 1.9, 'open').fing('R', 2.6, 'relaxed')
    c.fing('L', 0, 'relaxed').fing('L', 0.5, 'open').fing('L', 1.9, 'open').fing('L', 2.6, 'relaxed')

    c = clip('hug', 3.0, hold=(0.9, 2.1), partner={'clip': 'hug', 'distance': HUG_D}, notes='embrace: hands on the other one\'s shoulders / upper arms, heads aside')
    rest_hands(c, 0, 3.0)
    kwR = dict(space='root', eff='palm', fd=(0.3, 0.2, 1), pn=(1, -0.3, 0), pole=(-1, -0.3, 0.2))
    kwL = dict(space='root', eff='palm', fd=(-0.3, 0.2, 1), pn=(-1, -0.3, 0), pole=(1, -0.3, 0.2))
    # the right arm goes HIGH (hand on the outside of the other's left shoulder), the left arm LOW (hand at the other's
    # right side, by the waist): the partner plays the same clip, so on each side one arm is over and one under
    kwL = dict(space='root', eff='palm', fd=(-0.25, -0.1, 1), pn=(-1, -0.1, 0), pole=(1, -0.6, -0.2))
    for t in (0.9, 2.1):
        c.hand('R', t, (-1.10, 2.56, HUG_D - 0.14), **kwR).hand('L', t, (1.04, 1.86, HUG_D - 0.20), **kwL)
    c.hand('R', 1.5, (-1.10, 2.60, HUG_D - 0.12), **kwR)
    c.hand('R', 0.5, (-1.2, 2.2, 0.7), **kwR).hand('L', 0.5, (1.2, 1.7, 0.6), **kwL)
    c.hand('R', 2.55, (-1.2, 2.1, 0.6), **kwR).hand('L', 2.55, (1.2, 1.65, 0.5), **kwL)
    c.fing('both', 0, 'relaxed').fing('both', 0.8, 'cup').fing('both', 2.2, 'cup').fing('both', 2.9, 'relaxed')
    head_keys(c, 'chest', (0, 0, 0, 0), (0.9, 6, 0, 0), (2.1, 6, 0, 0), (3.0, 0, 0, 0))
    head_keys(c, 'look', (0, 0, 0, 0), (0.9, 4, -24, 10), (2.1, 4, -24, 10), (3.0, 0, 0, 0))
    head_keys(c, 'hips', (0, 0, 0, 0), (0.9, 0, 0, 0.12), (2.1, 0, 0, 0.12), (3.0, 0, 0, 0))


def reap_clip():
    """reaps wheat: bends from the hips in a wide stance, the left hand gathers a bunch of stalks, the sickle in the
    right hand sweeps low under it from right to left — three strokes, each a little more to the left (the patch is cut
    from the reaper's right side to his left: the wheat prop's steps w1, w2, w3 end at 1.55, 2.75, 3.95 s)."""
    D = 4.7
    c = clip('reap', D, events={'cut1': 1.55, 'cut2': 2.75, 'cut3': 3.95},
             notes='reaps: bends, the left hand gathers stalks, the sickle (right hand) sweeps under them, 3 strokes right → left')
    rest_hands(c, 0)
    # a wide stance: the left foot steps forward, the right one back
    c.foot('L', 0, (0.30, 0.13, 0)).foot('L', 0.25, (0.33, 0.28, 0.18), pitch=-10).foot('L', 0.5, (0.36, 0.13, 0.34))
    c.foot('L', 4.2, (0.36, 0.13, 0.34)).foot('L', 4.45, (0.33, 0.26, 0.17), pitch=-8).foot('L', D, (0.30, 0.13, 0))
    c.foot('R', 0, (-0.30, 0.13, 0)).foot('R', 0.5, (-0.36, 0.13, -0.08)).foot('R', 4.2, (-0.36, 0.13, -0.08)).foot('R', D, (-0.30, 0.13, 0))
    xs = (-0.62, 0.0, 0.62)              # where each stroke cuts (the reaper's right first)
    yaw = (-16, 0, 15)
    body = [(0, 0, 0, 0, 0, 0)]          # t, pelvis, spine, chest, chest yaw, head
    for k in range(3):
        s0 = 0.55 + 1.2 * k
        body += [(s0 + 0.15, 9, 11, 16, yaw[k], -14), (s0 + 0.75, 11, 13, 18, yaw[k] + 6, -16), (s0 + 1.05, 9, 11, 15, yaw[k] + 4, -12)]
    body += [(4.35, 4, 5, 6, 0, -2), (D, 0, 0, 0, 0, 0)]
    for t, pv, sp, ch, yw, hd in body:
        c.k('pelvis', t, pv, yw * 0.3, 0)
        c.k('spine', t, sp, yw * 0.3, 0)
        c.k('chest', t, ch, yw * 0.4, 0)
        c.k('head', t, hd, -yw * 0.3, 0)
        bent = pv / 11.0
        c.k('hips', t, 0, -0.22 * bent, -0.14 * bent)
    gripR = dict(space='root', eff='grip', fd=(0.15, -0.55, 1), pn=(0.35, 0.85, 0.2), pole=(-1, 0.4, -0.4))
    palmL = dict(space='root', eff='palm', fd=(-0.2, -0.3, 1), pn=(-1, 0, 0.1), pole=(1, 0.2, -0.4))
    for k in range(3):
        s0 = 0.55 + 1.2 * k
        x = xs[k]
        # the left hand reaches into the stalks and closes round a bunch; the sickle draws back to the right, low
        c.hand('L', s0 + 0.2, (x + 0.28, 1.75, 1.15), **palmL)
        c.hand('L', s0 + 0.45, (x + 0.12, 1.65, 1.12), **palmL)
        c.hand('R', s0 + 0.25, (x - 0.55, 1.5, 0.9), **gripR)
        c.hand('R', s0 + 0.5, (x - 0.50, 1.3, 1.05), **gripR)
        # the stroke: the blade sweeps under the left hand from right to left
        c.hand('R', s0 + 0.85, (x + 0.35, 1.25, 1.1), **gripR)
        c.hand('R', s0 + 1.0, (x + 0.45, 1.35, 0.95), **gripR)
        # the cut bunch is lifted and laid aside
        c.hand('L', s0 + 1.0, (x + 0.2, 1.85, 1.0), **palmL)
        c.hand('L', s0 + 1.15, (x + 0.55, 1.7, 0.9), **palmL)
        c.fing('L', s0 + 0.2, 'open').fing('L', s0 + 0.45, 'grip').fing('L', s0 + 1.05, 'grip').fing('L', s0 + 1.18, 'open')
    c.hand('R', 4.3, (-0.66, 1.62, 0.5), space='pelvis', eff='grip', fd=(0.1, -0.15, 1), pn=(1, 0, 0.1), pole=(-1, -0.3, -0.6))
    c.hand('R', D, CARRY_RP, **CARRY_R)
    rest_hands(c, D, side='L')
    c.fing('R', 0, 'grip').fing('L', 0, 'relaxed').fing('L', D, 'relaxed')


def draw_clips():
    """draws a bow held upright in the LEFT hand (prop `bow`, carry `side`, lean 0: the back towards the figure's left,
    the string BOW_BRACE towards his right): the bow comes up in front of the left shoulder, the right hand takes the
    string, and as the left arm pushes the bow out to the left the right hand draws the string to the chin; it holds,
    lets the string come back slowly and lowers the bow. draw1 / draw2 / draw3 draw it a little / more / to the full
    (the prop's bend 0.375 / 0.75 / 1, timed 0.6 → 1.4 s and back 2.4 → 2.9 s)."""
    BRACE, PULL = 0.35, 1.0
    side_kw = dict(space='pelvis', eff='grip', fd=(0.0, -0.75, 0.65), pn=(-1, 0, 0.05), pole=(0.5, 0, -1))
    side_pos = (0.98, 1.56, 0.50)
    Lkw = dict(space='root', eff='grip', fd=(0.85, 0.0, 0.5), pn=(0.1, 0, 1), pole=(0.6, -1, -0.4))
    Rkw = dict(space='root', eff='grip', fd=(0.6, 0.0, 0.8), pn=(0.8, 0.0, -0.6), pole=(-1, -0.3, -0.6))
    for name, u in (('draw1', 0.375), ('draw2', 0.75), ('draw3', 1.0)):
        D = 3.6
        c = clip(name, D, hold=(1.4, 2.4), events={'draw': 0.6, 'drawn': 1.4, 'release': 2.4},
                 notes=f'draws the bow in the left hand (prop bow, bend 0 → {u} over 0.6–1.4 s, back over 2.4–2.9 s)')
        # the bow comes up close in front of the left shoulder, so the right hand reaches the string easily and its way
        # up from the side stays in front of the robe
        y0, z0 = 2.62, 1.05
        L0 = (0.55, y0, z0); R0 = (0.55 - BRACE, y0, z0)
        RD = (0.30, 2.86, 0.74)
        LD = (RD[0] + BRACE + PULL * u, 2.86, 0.74)
        c.hand('L', 0, side_pos, **side_kw)
        c.hand('L', 0.6, L0, **Lkw).hand('L', 1.4, LD, **Lkw).hand('L', 2.4, LD, **Lkw).hand('L', 2.9, L0, **Lkw)
        c.hand('L', D, side_pos, **side_kw)
        rest_hands(c, 0, side='R')
        c.hand('R', 0.6, R0, **Rkw).hand('R', 1.4, RD, **Rkw).hand('R', 2.4, RD, **Rkw).hand('R', 2.9, R0, **Rkw)
        rest_hands(c, D, side='R')
        c.fing('L', 0, 'grip')
        c.fing('R', 0, 'relaxed').fing('R', 0.45, 'grip').fing('R', 2.95, 'grip').fing('R', 3.3, 'relaxed')
        k = 0.6 + 0.4 * u
        head_keys(c, 'chest', (0, 0, 0, 0), (0.6, 0, 6, 0), (1.4, -2, 10 * k, 0), (2.4, -2, 10 * k, 0), (2.9, 0, 6, 0), (D, 0, 0, 0))
        head_keys(c, 'head', (0, 0, 0, 0), (0.6, 4, 10, 0), (1.4, 2, 30 * k, 3), (2.4, 2, 30 * k, 3), (2.9, 4, 10, 0), (D, 0, 0, 0))


def knead_clip():
    """kneads dough in a trough on a table in front of him (top of the dough ≈ 1.75 high, ≈ 1.0 ahead): leans over it,
    both palms push down and forward into the dough, fold it back toward him, push again — six pushes over 7 s, the
    chest rocking with each push, the head bowed to the dough (film 051)."""
    D = 7.0
    c = clip('knead', D, notes='kneads dough in a trough on a table in front of him (dough top ≈ 1.75 high, ≈ 1.0 ahead), six pushes')
    rest_hands(c, 0)
    PR = dict(space='root', eff='palm', fd=(0.1, -0.35, 1), pn=(0.15, -0.9, 0.35), pole=(-1, -0.2, -0.7))
    PL = dict(space='root', eff='palm', fd=(-0.1, -0.35, 1), pn=(-0.15, -0.9, 0.35), pole=(1, -0.2, -0.7))
    pushes = [0.75 + 0.95 * i for i in range(6)]
    for i, t0 in enumerate(pushes):
        x = 0.28 + (0.04 if i % 2 else 0.0)
        # back and up (fold the dough over), then the heels of the hands push down and forward
        c.hand('R', t0, (-x, 1.98, 0.86), **PR).hand('L', t0, (x, 1.98, 0.86), **PL)
        c.hand('R', t0 + 0.45, (-x + 0.03, 1.80, 1.16), **PR).hand('L', t0 + 0.45, (x - 0.03, 1.80, 1.16), **PL)
        c.fing('both', t0, 'open')
        c.k('chest', t0, 10, 0, 0); c.k('chest', t0 + 0.45, 17, 0, 0)
        c.k('spine', t0, 6, 0, 0); c.k('spine', t0 + 0.45, 10, 0, 0)
        c.k('head', t0, 8, 0, 0); c.k('head', t0 + 0.45, 4, 0, 0)
    c.fing('both', 0, 'relaxed').fing('both', 0.55, 'open').fing('both', D - 0.4, 'open').fing('both', D, 'relaxed')
    for ch in ('chest', 'spine', 'head'):
        c.k(ch, 0, 0, 0, 0); c.k(ch, D, 0, 0, 0)
    c.k('chest', D - 0.6, 4, 0, 0)
    rest_hands(c, D)


def knead2_clip():
    """kneads a ball of dough the whole way, after a Gemini Omni reference of film 051 (dough centre ≈ 1.37 ahead, top
    ≈ 2.0 high, ends ≈ ±0.6 to the sides): two presses of both palms on the top (it flattens), the hands go to the two ends,
    take them and LIFT the dough (it sags in the middle) and lay it back, three pushes of the heels of the hands forward,
    then the hands cup its sides and press it in and up into a round ball. The dough itself is shaped at runtime
    (`dough-trough` + `knead2`, lib/engine3/dough.js): it gives under the palms and follows the hands while they hold it."""
    D = 7.0
    c = clip('knead2', D, events={'grab': 2.35, 'lift': 2.85, 'release': 3.5, 'round': 5.75},
             notes='kneads a ball of dough the whole way (presses, lifts it by the ends, pushes, rounds it); the dough deforms at runtime')
    rest_hands(c, 0)
    TOP = dict(space='root', eff='palm', fd=(-0.1, -0.35, 1), pn=(-0.12, -0.95, 0.25), pole=(1, -0.2, -0.7))
    PUSH = dict(space='root', eff='palm', fd=(-0.05, -0.55, 1), pn=(-0.1, -0.8, 0.55), pole=(1, -0.2, -0.7))
    SIDE = dict(space='root', eff='palm', fd=(0.1, -0.55, 1), pn=(-1, -0.15, 0.05), pole=(1, -0.5, -0.5))
    CUP = dict(space='root', eff='palm', fd=(-0.05, -0.6, 1), pn=(-0.8, -0.55, 0.05), pole=(1, -0.4, -0.6))
    keys = [  # (t, x of the left hand (the right one mirrored), y, z, kind)
        (0.55, 0.22, 2.12, 1.20, TOP), (0.90, 0.20, 1.93, 1.26, TOP), (1.20, 0.24, 2.08, 1.20, TOP),
        (1.50, 0.26, 1.90, 1.28, TOP), (1.85, 0.32, 2.04, 1.22, TOP),
        (2.20, 0.76, 1.84, 1.28, SIDE), (2.35, 0.71, 1.79, 1.32, SIDE), (2.85, 0.64, 2.02, 1.26, SIDE),
        (3.15, 0.61, 2.06, 1.24, SIDE), (3.50, 0.71, 1.79, 1.32, SIDE), (3.68, 0.76, 1.86, 1.28, SIDE),
        (3.95, 0.22, 2.10, 1.12, PUSH), (4.25, 0.22, 1.92, 1.32, PUSH), (4.55, 0.26, 2.08, 1.12, PUSH),
        (4.85, 0.26, 1.92, 1.34, PUSH), (5.15, 0.24, 2.08, 1.14, PUSH), (5.40, 0.22, 1.93, 1.32, PUSH),
        (5.75, 0.72, 1.86, 1.30, SIDE), (6.10, 0.57, 1.86, 1.32, SIDE), (6.40, 0.45, 2.02, 1.30, CUP),
        (6.65, 0.38, 2.18, 1.16, CUP),
    ]
    for t, x, y, z, kw in keys:
        c.both(t, (x, y, z), **kw)
    rest_hands(c, D)
    c.fing('both', 0, 'relaxed').fing('both', 0.5, 'open').fing('both', 2.05, 'open').fing('both', 2.3, 'cup')
    c.fing('both', 3.55, 'cup').fing('both', 3.8, 'open').fing('both', 5.55, 'open').fing('both', 5.8, 'cup')
    c.fing('both', 6.6, 'cup').fing('both', D, 'relaxed')
    # the body leans over the dough and rocks with every press; it straightens a little to lift the dough
    lean = [(0, 0, 0), (0.55, 10, 5), (0.9, 16, 9), (1.2, 11, 6), (1.5, 17, 10), (1.85, 12, 7), (2.35, 13, 8), (2.85, 9, 5),
            (3.15, 9, 5), (3.5, 13, 8), (3.95, 11, 6), (4.25, 18, 11), (4.55, 11, 6), (4.85, 18, 11), (5.15, 11, 6), (5.4, 17, 10),
            (5.75, 13, 8), (6.1, 15, 9), (6.4, 12, 7), (6.65, 8, 4), (D, 0, 0)]
    for t, ch, sp in lean:
        c.k('chest', t, ch, 0, 0); c.k('spine', t, sp, 0, 0)
    for t, hp in ((0, 0), (0.55, 10), (2.35, 8), (2.85, 2), (3.5, 8), (5.75, 10), (6.65, 6), (D, 0)):
        c.k('head', t, hp, 0, 0)


def handwork_clips():
    c = clip('clap_once', 1.05, events={'contact': 0.45}, notes='one clap in front of a long beard, without a jump')
    rest_hands(c, 0, 1.05)
    for t, x, y, z in ((0.28, 0.31, 2.06, 0.94), (0.45, 0.029, 2.10, 0.98),
                       (0.50, 0.029, 2.10, 0.98), (0.67, 0.30, 2.04, 0.91)):
        c.both(t, (x, y, z), space='root', eff='palm', fd=(0, 0.4, 1), pn=(-1, 0, 0), pole=(1, -1, -0.2))
    c.fing('both', 0, 'relaxed').fing('both', 0.28, 'open').fing('both', 0.68, 'open').fing('both', 1.05, 'relaxed')

    c = clip('weave_rim', 2.4, notes='steadies a basket and follows two strips on its rim with the right index finger')
    rest_hands(c, 0, 2.4)
    brace = dict(space='root', eff='palm', fd=(-0.35, -0.3, 1), pn=(-0.6, -0.7, 0), pole=(1, -0.5, -0.5))
    for t in (0.55, 1.87):
        c.hand('L', t, (0.53, 1.79, 1.07), **brace)
    finger = dict(space='root', eff='tips', fd=(0.2, -0.6, 1), pn=(0.2, -0.85, -0.3), pole=(-1, -0.5, -0.4))
    for t, x, y, z in ((0.55, -0.43, 1.93, 0.99), (0.79, -0.36, 1.84, 0.94), (1.0, -0.21, 1.87, 0.85),
                       (1.25, -0.06, 1.80, 0.83), (1.48, 0.08, 1.88, 0.84), (1.78, 0.24, 1.80, 0.91)):
        c.hand('R', t, (x, y, z), **finger)
    c.fing('R', 0, 'relaxed').fing('R', 0.5, 'point').fing('R', 1.8, 'point').fing('R', 2.4, 'relaxed')
    head_keys(c, 'chest', (0, 0, 0, 0), (0.55, 11, 0, 0), (1.85, 11, 0, 0), (2.4, 0, 0, 0))
    head_keys(c, 'head', (0, 0, 0, 0), (0.55, 7, 0, 0), (1.85, 7, 0, 0), (2.4, 0, 0, 0))

    c = clip('fold_cloth', 2.0, notes='folds the two edges of a cloth over a tool lying on a low work table')
    rest_hands(c, 0, 2.0)
    fold = dict(space='root', eff='palm', fd=(-0.18, -0.4, 1), pn=(-0.12, -0.9, -0.15), pole=(1, -0.5, -0.5))
    for t, x, y, z in ((0.45, 0.52, 1.67, 0.82), (0.73, 0.46, 1.65, 0.95),
                       (1.04, 0.37, 1.88, 1.08), (1.29, 0.32, 1.72, 1.17), (1.53, 0.30, 1.67, 1.03)):
        c.both(t, (x, y, z), **fold)
    c.fing('both', 0, 'relaxed').fing('both', 0.55, 'cup').fing('both', 1.15, 'cup').fing('both', 1.45, 'open')
    head_keys(c, 'hips', (0, 0, 0, 0), (0.5, 0, -0.14, 0), (1.55, 0, -0.14, 0), (2, 0, 0, 0))
    head_keys(c, 'chest', (0, 0, 0, 0), (0.5, 17, 0, 0), (1.55, 17, 0, 0), (2, 0, 0, 0))


def gestures():
    knead_clip()
    knead2_clip()
    reap_clip()
    cross_clip('cross', False)
    cross_clip('cross_beard', True)
    talk_clips(); turn_clip(); sit_clips(); bow_clips()
    pray_clip('pray', False); pray_clip('pray_beard', True)
    hand_gestures(); emotion_clips(); carry_clips(); draw_clips(); handwork_clips()


def build_clips(rig, only=None):
    idles(); locomotion(); gestures()
    by = {c.name: c for c in CLIPS}
    for n in ('reap', 'talk1', 'talk4', 'offer', 'point', 'wave', 'carry', 'carry_side', 'give', 'take', 'put_down', 'pick_up', 'set_down', 'lift_up', 'drop', 'think', 'think_beard', 'knock'):
        CLIPS.append(by[n].mirrored(n + '_L'))
    bpy.context.view_layer.objects.active = rig
    solver = Solver(rig)
    meta = {}
    for c in CLIPS:
        if only and c.name not in only:
            continue
        bake(c, solver, rig)
        print(f'  clip {c.name:14s} {c.dur:4.2f}s  ik error {c.ik_err:.3f}')
        meta[c.name] = c.meta()
    # clean the solver rig: no constraints / targets in the export, rest pose
    for pb in rig.pose.bones:
        for con in list(pb.constraints):
            pb.constraints.remove(con)
        pb.rotation_quaternion = (1, 0, 0, 0); pb.location = (0, 0, 0)
    for s in 'LR':
        for k, ob in solver.tg[s].items():
            bpy.data.objects.remove(ob)
    rig.animation_data_create(); rig.animation_data.action = None
    return meta
