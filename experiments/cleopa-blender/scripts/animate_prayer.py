"""Reusable actions and the family performance."""
from math import atan2, sin, cos, pi, tau
import random

import bpy
from mathutils import Vector

from build_rigs import lift_angle, solve_arm

ACTIONS = ('idle_breathe','blink','head_bow','pray_speech','cross_orthodox_R','sit_idle')


def set_action(rig, name):
    data = rig.animation_data_create()
    data.action = None
    for b in rig.pose.bones:
        b.location = (0,0,0)
        b.rotation_euler = (0,0,0)
        b.scale = (1,1,1)
    for key in ('eye_pose','mouth_pose','hand_R_pose','hand_L_pose'):
        rig[key] = 0
    action = bpy.data.actions.new(rig.name[4:]+'__'+name)
    data.action = action
    action.use_fake_user = True
    action['character'] = rig.name[4:]
    action['performance'] = name
    return action


def channels(rig, action):
    # Blender 4.3 exposes legacy curves. Later versions store data in slots.
    if getattr(action, 'is_action_layered', False):
        slot = rig.animation_data.action_slot
        if not slot:
            return []
        return [curve for layer in action.layers for strip in layer.strips
                if (bundle := strip.channelbag(slot))
                for curve in bundle.fcurves]
    return action.fcurves


def finish_action(rig, action, asset=False):
    for curve in channels(rig, action):
        for key in curve.keyframe_points:
            if curve.data_path.startswith('["'):
                key.interpolation = 'CONSTANT'
            elif 'arm.' in curve.data_path or 'hand.' in curve.data_path:
                key.interpolation = 'LINEAR'
            else:
                key.handle_left_type = key.handle_right_type = 'AUTO_CLAMPED'
    if asset:
        action.asset_mark()
        action.asset_data.description = (
            'For '+rig.name+'. Assign in the Action Editor using the matching slot. '
            'Facial and hand variants are integer properties on the armature object.')
    return action


def prop(rig, name, frame, value):
    rig[name]=value
    rig.keyframe_insert(data_path=f'["{name}"]',frame=frame,group='Drawing variants')


def head(rig, frame, bow, tilt=0):
    b=rig.pose.bones['head']
    b.rotation_euler.z=tilt
    b.location.y=-bow
    b.keyframe_insert('rotation_euler',index=2,frame=frame,group='Head')
    b.keyframe_insert('location',index=1,frame=frame,group='Head')


def breathe(rig, start, end, phase, amplitude=.027):
    r=rig.pose.bones['root']
    for frame in sorted(set(range(start,end+1,12)) | {end}):
        r.location.y=amplitude*sin((frame-start)*tau/86+phase)
        r.keyframe_insert('location',index=1,frame=frame,group='Breathing')


def arm_key(rig, p, side, frame, wrist, direction, previous=None, seated=False):
    angle=atan2(direction[0],-direction[1])
    rotations, scales=solve_arm(p,side,wrist,angle,seated)
    if previous is not None:
        rotations=tuple(lift_angle(a,b) for a,b in zip(previous,rotations))
    for i,name in enumerate(('upper_arm','forearm','hand')):
        b=rig.pose.bones[name+'.'+side]
        b.rotation_euler.z=rotations[i]
        b.keyframe_insert('rotation_euler',index=2,frame=frame,group='Arm '+side)
        if i<2:
            b.scale.y=scales[i]
            b.keyframe_insert('scale',index=1,frame=frame,group='Arm '+side)
    return rotations


def vunit(direction):
    return Vector(direction).normalized()


def wrist_at(p, point, direction, variant):
    return Vector(point)-vunit(direction)*p['hand']*(1 if variant=='cross_fingers' else .78)


def resting(character, frame, side, standalone=False):
    p,rig,_,poses,_,_=character
    if standalone:
        s=-1 if side=='R' else 1
        return arm_key(rig,p,side,frame,
                       (s*(p['shoulder_x']+.18),p['shoulder_y']-p['upper']-p['lower']+.045),
                       (s*.07,-1))
    if side=='R':
        point,direction,_=poses['hand_rest']
    else:
        point,direction=(p['shoulder_x']*.39,.44),(-.94,-.36)
    return arm_key(rig,p,side,frame,wrist_at(p,point,direction,'rest'),direction,seated=True)


def cross(character, begin, contacts, standalone=False, previous=None):
    p,rig,_,poses,_,_=character
    rest_pt,rest_dir,_=poses['hand_rest']
    if standalone:
        rest_pt=(-p['shoulder_x']-.19,p['shoulder_y']-p['upper']-p['lower']-.2)
        rest_dir=(-.07,-1)
    rest=wrist_at(p,rest_pt,rest_dir,'rest')
    targets = [(begin,rest,Vector(rest_dir))]
    for name,frame in zip(('forehead','chest','shoulder_R','shoulder_L'),contacts):
        point,direction,_=poses[name]
        wrist=wrist_at(p,point,direction,'cross_fingers')
        targets += [(frame-3,wrist,Vector(direction)),(frame+2,wrist,Vector(direction))]
    targets.append((contacts[-1],rest,Vector(rest_dir)))
    arcs=[(-.165,-.04), (0,0),(-.11,.025), (0,0),(-.06,-.09), (0,0),(.015,-.125), (0,0),(.095,-.10)]
    for index,((start,a,da),(end,b,db)) in enumerate(zip(targets,targets[1:])):
        frames=range(start,end+1) if index==0 else range(start+1,end+1)
        angle_a=atan2(da.x,-da.y)
        angle_b=lift_angle(angle_a,atan2(db.x,-db.y))
        for frame in frames:
            t=(frame-start)/(end-start)
            ease=t*t*(3-2*t)
            angle=angle_a+(angle_b-angle_a)*ease
            wrist=a.lerp(b,ease)+Vector(arcs[index])*sin(pi*ease)
            previous=arm_key(rig,p,'R',frame,wrist,(sin(angle),-cos(angle)),previous,seated=not standalone)
    for frame,value in ((begin,0),(begin+4,3),(contacts[-1]-3,0)):
        prop(rig,'hand_R_pose',frame,value)
    return previous


def blink(rig, frame):
    for offset,value in ((0,0),(1,1),(2,2),(4,1),(5,0)):
        prop(rig,'eye_pose',frame+offset,value)


def syllables(rig, start, end, seed, lead=False):
    randomizer=random.Random(seed)
    # Provisionally choreographed phrases for a silent preview. Final timing
    # should be replaced with cues from the authorized recording.
    patterns=[(4,1,3,2,1,4,6,2,1,3),(5,2,4,1,3,2,6,4,3,1,2),
              (4,2,1,4,6,3,2,1),(2,1,3,4,5,2,1,6,3,2),
              (4,6,1,2,3,2,4,1,2),(4,1,2,6,1,2,3,4,1)]
    breaks=(0, 71, 147, 218, 300, 379)
    prop(rig,'mouth_pose',start,0)
    for i,(offset,pattern) in enumerate(zip(breaks,patterns)):
        cursor=start+offset+randomizer.randint(2, 8)
        if not lead and (i+seed)%3==0:
            continue
        for value in pattern if lead else pattern[:randomizer.randint(3,6)]:
            if cursor>=end-3:
                break
            prop(rig,'mouth_pose',cursor,value)
            cursor+=randomizer.choice((3,4,4,5,6) if lead else (4,5,6,7))
        if cursor<end:
            prop(rig,'mouth_pose',cursor,0)
    prop(rig,'mouth_pose',end,0)


def legs_seated(rig, frame):
    for side,sign in (('R',-1),('L',1)):
        for name,value in (('thigh',-sign*.37),('shin',sign*.34),('foot',sign*.08)):
            b=rig.pose.bones[name+'.'+side]
            b.rotation_euler.z=value
            b.keyframe_insert('rotation_euler',index=2,frame=frame,group='Seated legs')


def reusable(character):
    _,rig,_,_,_,_=character
    for name in ACTIONS:
        action=set_action(rig,name)
        if name=='idle_breathe':
            breathe(rig,1,87,0)
        elif name=='blink':
            blink(rig,1)
            prop(rig,'eye_pose',16,0)
        elif name=='head_bow':
            for frame,bow,tilt in ((1,0,0),(25,.101,-.067),(45,.101,-.067),(68,0,0)):
                head(rig,frame,bow,tilt)
        elif name=='pray_speech':
            syllables(rig,1,100,3,True)
        elif name=='cross_orthodox_R':
            for side in ('R','L'):
                resting(character,1,side,standalone=True)
            cross(character,15,(33,49,64,79,98),standalone=True)
        elif name=='sit_idle':
            for side in ('R','L'):
                resting(character,1,side)
            legs_seated(rig,1)
            breathe(rig,1,87,0)
        finish_action(rig,action,asset=True)


def animate_test(character):
    p,rig,_,_,_,_=character
    action=set_action(rig,'cross_test')
    for side in ('R','L'):
        resting(character,1,side,standalone=True)
    cross(character,15,(33,49,64,79,98),standalone=True)
    breathe(rig,1,108,.1,.014)
    for f in (7,83,101):
        blink(rig,f)
    prop(rig,'mouth_pose',1,0)
    prop(rig,'mouth_pose',99,7)
    finish_action(rig,action)


def animate_family(character,timing,index):
    p,rig,_,_,_,_=character
    offset=timing['offset_frames'][p['id']]
    action=set_action(rig,'prayer_at_table')
    legs_seated(rig,1)
    for side in ('R','L'):
        resting(character,1,side)
    left_dir=(-.94,-.36)
    left_at=(p['shoulder_x']*.39,.44)
    for f,dx,dy in ((80+index,0,0),(130+index,-.065,.011),(270+index,-.008,-.012),
                    (437+index,-.07,.020),(568+index,-.04,.010),(649+index,0,0)):
        point=Vector(left_at)+Vector((dx,dy))
        arm_key(rig,p,'L',f,wrist_at(p,point,left_dir,'rest'),left_dir,seated=True)
    contacts=timing['contact_frames_leader']
    rest_rotation=cross(character,25+offset,[f+offset for f in contacts['first']])
    # The right arm stays down throughout the spoken prayer.
    cross(character,601+offset,[f+offset for f in contacts['second']],previous=rest_rotation)
    breathe(rig,1,timing['frame_end'],index*.94,.021+(index%3)*.004)
    sign=p['look']
    for f,bow,tilt in ((1,0,-.034*sign),(19,0,0),(108+offset,0,0),
                       (135+index,.091,-.077*sign),(238+index,.074,-.048*sign),
                       (312+index,.098,-.068*sign),(448+index,.077,-.052*sign),
                       (569+index,.082,-.041*sign),(599,0,0),(696+offset,0,0),
                       (720,.016,-.034*sign)):
        head(rig,f,bow,tilt)
    for frames in contacts.values():
        forehead, sternum, right, left, down = (n+offset for n in frames)
        for f,value in ((forehead-4,0),(forehead-2,1),(forehead+3+index%3,2),
                        (right+index%3,1),(left+4+index%3,0)):
            prop(rig,'eye_pose',f,value)
    prayer_start=timing['prayer_frames'][0]
    for f in (8+index*2, 101+index, 588+index, 704+index*2):
        blink(rig,f)
    for f,value in ((prayer_start+offset-1,0),(prayer_start+offset+1,1),
                    (prayer_start+offset+4,2),(195+index*7,1),
                    (220+index*9,2),(348+index*9,1),(370+index*6,2),
                    (527+offset,1),(571+offset,2),(582+offset,1),(586+offset,0)):
        prop(rig,'eye_pose',f,value)
    syllables(rig,prayer_start+index,timing['prayer_frames'][1],8+index,
              lead=p['id']=='priest')
    amen=timing['amen_frames'][0]+offset
    for frame,value in ((amen,1),(amen+4,4),(amen+8,2),(amen+13,0)):
        prop(rig,'mouth_pose',frame,value)
    if p['id'] in ('cleopa','mother','brother_02'):
        prop(rig,'mouth_pose',705+offset,7)
    finish_action(rig,action)


def verify_contacts(character, frames):
    p,rig,_,_,markers,tip=character
    scene=bpy.context.scene
    errors={}
    for name,frame in zip(('forehead','chest','shoulder_R','shoulder_L'),frames):
        scene.frame_set(frame)
        deps=bpy.context.evaluated_depsgraph_get()
        goal=markers[name].evaluated_get(deps).matrix_world.translation
        actual=tip.evaluated_get(deps).matrix_world.translation
        deviation=(goal-actual).length
        errors[name]=round(deviation,5)
        assert rig['hand_R_pose']==3 and rig['hand_L_pose']==0
        assert deviation<.042,(p['id'],name,frame,tuple(goal),tuple(actual),deviation)
    print('CONTACTS',p['id'],errors,flush=True)
    return errors
