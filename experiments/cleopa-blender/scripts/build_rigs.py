"""Armature, rigid cut-out bindings, and planar FK with projected elbow bend."""
from math import atan2, hypot, sqrt, tau

import bpy
from mathutils import Vector


def armature(profile, coll):
    name = profile['id']
    rig = bpy.data.objects.new('RIG_' + name, bpy.data.armatures.new(name + ' armature'))
    coll.objects.link(rig)
    rig.show_in_front = True
    rig.data.display_type = 'STICK'
    bpy.context.view_layer.objects.active = rig
    rig.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')

    def bone(name, head, tail, parent=None):
        b = rig.data.edit_bones.new(name)
        b.head = (*head, 0)
        b.tail = (*tail, 0)
        b.align_roll(Vector((0, 0, 1)))
        if parent:
            b.parent = rig.data.edit_bones[parent]
        return b

    shoulder_y = profile['shoulder_y']
    head_y = profile['head_y']
    bone('root', (0, 0), (0, .32))
    bone('pelvis', (0, 0), (0, .35), 'root')
    bone('spine', (0, .35), (0, .77), 'pelvis')
    bone('chest', (0, .77), (0, shoulder_y), 'spine')
    bone('neck', (0, shoulder_y), (.055*profile['look'], head_y-.54), 'chest')
    bone('head', (.055*profile['look'], head_y-.54), (.055*profile['look'], head_y+.35), 'neck')
    for side, sign in (('R', -1), ('L', 1)):
        x = sign*profile['shoulder_x']
        e = shoulder_y-profile['upper']
        w = e-profile['lower']
        if profile.get('soft_shoulder'):
            bone('shoulder.'+side, (x, shoulder_y), (x, shoulder_y-.20), 'chest')
        bone('upper_arm.'+side, (x, shoulder_y), (x, e), 'chest')
        bone('forearm.'+side, (x, e), (x, w), 'upper_arm.'+side).inherit_scale = 'NONE'
        bone('hand.'+side, (x, w), (x, w-profile['hand']), 'forearm.'+side).inherit_scale = 'NONE'
        hip = sign*profile['body']*.48
        knee = -profile['leg']*.58
        ankle = -profile['leg']
        bone('thigh.'+side, (hip, .05), (hip, knee), 'pelvis')
        bone('shin.'+side, (hip, knee), (hip, ankle), 'thigh.'+side)
        bone('foot.'+side, (hip, ankle), (hip+sign*.29, ankle-.11), 'shin.'+side)
    bpy.ops.object.mode_set(mode='OBJECT')
    rig.select_set(False)
    for pbone in rig.pose.bones:
        pbone.rotation_mode = 'XYZ'
    if profile.get('soft_shoulder'):
        for side in ('R', 'L'):
            follow = rig.pose.bones['shoulder.'+side].constraints.new('COPY_ROTATION')
            follow.name = 'Urmează parțial brațul'
            follow.target = rig
            follow.subtarget = 'upper_arm.'+side
            follow.owner_space = follow.target_space = 'LOCAL'
            follow.use_x = follow.use_y = False
            follow.influence = .38
    rig['arm_control'] = 'FK: upper_arm, forearm and hand. The arm actions include projected foreshortening.'
    rig['handedness'] = 'Anatomical right is screen-left in the frontal view.'
    return rig


def bind(obj, rig, bone):
    # The art is authored in armature coordinates. Bind to the rest transform
    # (Blender bone parenting uses the tail of the bone as the parent origin).
    b = rig.data.bones[bone]
    rest = b.matrix_local.copy()
    rest.translation = b.tail_local
    obj.parent = rig
    obj.parent_type = 'BONE'
    obj.parent_bone = bone
    obj.matrix_parent_inverse = rest.inverted()


def marker(rig, coll, name, point, bone):
    obj = bpy.data.objects.new(name, None)
    coll.objects.link(obj)
    obj.empty_display_type = 'SPHERE'
    obj.empty_display_size = .046
    obj.hide_render = True
    bind(obj, rig, bone)
    obj.location = (*point, 0)
    obj.hide_set(True)
    return obj


def lift_angle(previous, angle):
    return previous + (angle - previous + tau/2) % tau - tau/2


def solve_arm(profile, side, wrist, hand_angle, seated=False):
    """Project a two-length elbow solution, with the elbow bent toward camera.

    The elbow lies on the two sphere intersection. Its direction in that circle
    blends toward the outside of the silhouette. Projecting onto XY shortens
    the sleeves while keeping a continuous visible elbow as the wrist crosses.
    """
    sign = -1 if side == 'R' else 1
    shoulder = Vector((sign*profile['shoulder_x'], profile['shoulder_y']))
    upper, lower = profile['upper'], profile['lower']
    delta = Vector(wrist) - shoulder
    distance = max(abs(upper-lower)+.004, min(delta.length, upper+lower-.006))
    along = delta.normalized()
    perpendicular = Vector((-along.y, along.x))
    axis = (upper**2 - lower**2 + distance**2)/(2*distance)
    radius = sqrt(max(0, upper**2-axis**2))
    pole = Vector((sign*.78, -.71))
    projection = pole.dot(perpendicular)
    elbow_delta = along*axis + perpendicular*(radius*projection/hypot(projection, .54))
    if wrist[1] > .66:
        # Raising the wrist through the shoulder line is singular in a flat
        # solve. Give it depth and project the resulting elbow back into XY.
        # Near rest, preserve the lower-arm placement on the tabletop.
        depth = min(.62, sqrt(max(0, (upper+lower-.004)**2-distance**2)))
        delta3 = Vector((along.x*distance, along.y*distance, depth))
        span = delta3.length
        direction3 = delta3/span
        center = (upper**2-lower**2+span**2)/(2*span)
        radius3 = sqrt(max(0, upper**2-center**2))
        preferred = Vector((sign*.48, -.87, .0))
        in_circle = (preferred-direction3*preferred.dot(direction3)).normalized()
        solved = center*direction3+radius3*in_circle
        blend = min(1, (wrist[1]-.66)/.30)
        blend = blend*blend*(3-2*blend)
        elbow_delta = elbow_delta.lerp(Vector((solved.x, solved.y)), blend)
    if seated:
        # A seated elbow drops toward the lap while a foreshortened forearm
        # extends toward the table. Blend the projection out as the hand rises.
        t = max(0, min(1, (.91-Vector(wrist).y)/.45))
        t = t*t*(3-2*t)
        dropped = Vector((sign*.18, -upper*.92))
        elbow_delta = elbow_delta.lerp(dropped, .88*t)
    fore_delta = along*distance-elbow_delta
    a = atan2(elbow_delta.x, -elbow_delta.y)
    b = lift_angle(a, atan2(fore_delta.x, -fore_delta.y))
    c = lift_angle(b, hand_angle)
    return (a, b-a, c-b), (elbow_delta.length/upper, fore_delta.length/lower)
