"""Build the illustrated episode as one editable Blender timeline."""
from array import array
from math import cos, pi, sin, tau
from pathlib import Path
import json
import sys
import wave

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT/"scripts"), str(ROOT.parent/"cleopa-blender"/"scripts")]

from animate_prayer import arm_key, blink, channels, finish_action, head, prop, set_action, syllables
from build_characters import create_character, profile as character_profile
from build_rigs import bind
from build_scene import setup
from decor import bedroom, empty, farmyard, kitchen, pig, rooster, steam_art, trough, village
from hands import HAND_POSES
from sleeves import continuous_sleeves
from vector_art import Art, collection, material

PLAN = json.loads((ROOT/"scenariu.json").read_text())
TIMING = json.loads((ROOT/"timeline.json").read_text())
BEATS = {beat["id"]: beat for beat in TIMING["beats"]}
FPS = TIMING["fps"]
GOLD = "d99b51"
COCOA = "593a2e"
GROUND = "a48962"
ZONE = {"village": 0, "yard": 33, "bed": 66, "kitchen": 99}


def beat_frame(id_, fraction):
    beat = BEATS[id_]
    return round(beat["start"] + fraction*(beat["end"]-beat["start"]-1))


def gate(obj, start, end):
    for attr in ("hide_render", "hide_viewport"):
        for frame, hide in ((0,True),(start,False),(end,True)):
            setattr(obj,attr,hide)
            obj.keyframe_insert(attr,frame=frame)
        for curve in obj.animation_data.action.fcurves:
            if curve.data_path == attr:
                for key in curve.keyframe_points:
                    key.interpolation = "CONSTANT"


def key(obj, frame, position=None, turn=None, scale=None):
    for attr, value in (("location",position),("rotation_euler",turn),("scale",scale)):
        if value is not None:
            setattr(obj,attr,value)
            obj.keyframe_insert(attr,frame=frame)


def actor(coll, design, name, position, size=1, look=None, hat=False):
    base = character_profile(design)
    changes = {
        "shoulder_x": base["shoulder_x"]*.95,
        "shoulder_y": base["shoulder_y"]-.135,
        "collar_y": base["shoulder_y"]-.045,
        "upper": base["upper"]*.86,
        "lower": base["lower"]*.82,
        "hand": base["hand"]*1.02,
    }
    if look is not None:
        changes["look"] = look
    profile,rig,char,*_ = create_character(
        design, overrides=changes, sleeve_builder=continuous_sleeves, hand_poses=HAND_POSES,
    )
    bpy.context.scene.collection.children.unlink(char)
    coll.children.link(char)
    char.name = name
    rig.name = "RIG_"+name
    rig.location=position
    rig.scale=(size,size,.50)
    action = set_action(rig,"painea")
    if hat:
        wool_cap(profile,rig,char)
    return {"p":profile,"rig":rig,"action":action,"collection":char,"home":Vector(position),"size":size}


def reveal_actor(actor_, start, end):
    for obj in actor_["collection"].objects:
        if obj.type != "MESH":
            continue
        if obj.animation_data and obj.animation_data.drivers:
            for driver in obj.animation_data.drivers:
                driver.driver.expression += f" or frame < {start} or frame >= {end}"
        else:
            gate(obj,start,end)


def shadow(a):
    p=a["p"]
    art=Art("Umbră pe pământ",a["collection"],(0,-p["leg"]-.20),(1,1),z=-.33)
    art.oval(.02,.015,.752,.110,"ad956d")
    obj=art.finish()
    obj.parent=a["rig"]


def wool_cap(p,rig,coll):
    art = Art("Căciulă de miel",coll,(.034,p["head_y"]),(p["head_w"],p["head_h"]),z=.70)
    art.shape("M -1.006 .48 Q -1.057 .702 -.936 .89 Q -1.025 1.10 -.89 1.231 Q -.902 1.398 -.689 1.432 Q -.475 1.65 -.212 1.56 Q .024 1.689 .26 1.574 Q .50 1.646 .651 1.483 Q .866 1.48 .929 1.23 Q 1.065 1.098 .992 .911 L .926 .65 Q .23 .973 -1.006 .48 Z",
              "674735","462e25",.055)
    art.shape("M -.952 .925 Q -.677 1.409 -.17 1.479 Q .390 1.601 .761 1.366 Q .929 1.273 .941 1.127 Q .625 1.321 .286 1.297 Q -.220 1.338 -.952 .925 Z","815a41")
    art.shape("M -.984 .556 Q -.725 .755 -.133 .880 Q .379 .984 .951 .764 L .929 .65 Q .29 .927 -.987 .49 Z","523a2e")
    for x,y in ((-.68,1.094),(-.28,1.32),(.085,1.17),(.45,1.348),(.66,1.052),(-.45,.966)):
        art.line(f"M {x-.041} {y-.059} Q {x-.102} {y+.10} {x+.091} {y+.06}", "92674d",.025)
    obj=art.finish()
    bind(obj,rig,"head")


def hand_pose(actor_, side, frame, pose):
    prop(actor_["rig"], "hand_"+side+"_pose", frame, HAND_POSES.index(pose))


def stand(a, frame, soften=0):
    p,rig=a["p"],a["rig"]
    for side,s in (("L",1),("R",-1)):
        wrist=(s*(p["shoulder_x"]+.08+soften),p["shoulder_y"]-p["upper"]-p["lower"]+.085)
        arm_key(rig,p,side,frame,wrist,(s*.08,-1))
        hand_pose(a,side,frame,"rest")


def smooth(t):
    t=max(0,min(1,t))
    return t*t*t*(t*(6*t-15)+10)


def arms(a, side, waypoints, seated=False, world=False, wrist_limit=None):
    p,rig=a["p"],a["rig"]
    prev=None
    for index,(first,second) in enumerate(zip(waypoints,waypoints[1:])):
        fa,pa,da=first
        fb,pb,db=second
        for frame in range(fa+(index>0),fb+1):
            t=smooth((frame-fa)/max(1,fb-fa))
            point=Vector(pa).lerp(Vector(pb),t)
            direction=Vector(da).lerp(Vector(db),t)
            if world:
                bpy.context.scene.frame_set(frame)
                point=(point-Vector((rig.location.x,rig.location.y)))/a["size"]
            prev=arm_key(rig,p,side,frame,point,direction,prev,seated=seated,wrist_limit=wrist_limit)


def position_paths(a, values):
    rig=a["rig"]
    for frame,dx,dy in values:
        key(rig,frame,position=(a["home"].x+dx,a["home"].y+dy,a["home"].z))


def step(a, f0, f1, count=3, strength=.34):
    rig=a["rig"]
    for i in range(f0,f1+1,2):
        t=(i-f0)/max(1,f1-f0)
        swing=sin(t*tau*count)*sin(pi*t)**.48
        root=rig.pose.bones["root"]
        root.location.y=.062*abs(swing)
        root.keyframe_insert("location",index=1,frame=i,group="Pași")
        for side,s in (("R",-1),("L",1)):
            for name,gain in (("thigh",strength),("shin",-.35*strength),("foot",-.11)):
                bone=rig.pose.bones[name+"."+side]
                bone.rotation_euler.z=s*gain*swing
                bone.keyframe_insert("rotation_euler",index=2,frame=i,group="Pași")
    root = rig.pose.bones["root"]
    root.location.y = 0
    root.keyframe_insert("location",index=1,frame=f1,group="Pași")
    for name in ("thigh","shin","foot"):
        for side in ("R","L"):
            bone=rig.pose.bones[name+"."+side]
            bone.rotation_euler.z=0
            bone.keyframe_insert("rotation_euler",index=2,frame=f1,group="Pași")


def breathing(a,start,end,phase=.2):
    chest = next(obj for obj in a["collection"].objects
                 if "Shirt and clothing panels" in obj.name)
    for frame in range(start,end+1,12):
        inhale = sin((frame-start)*tau/113+phase)
        chest.scale.x = 1+.012*inhale
        chest.scale.y = 1+.004*inhale
        for index in (0,1):
            chest.keyframe_insert("scale",index=index,frame=frame,group="Respirație")


def voice(a, cues):
    rig=a["rig"]
    for cue in cues:
        with wave.open(str(ROOT/"audio"/cue["file"])) as sound:
            rate=sound.getframerate()
            samples=array("h")
            samples.frombytes(sound.readframes(sound.getnframes()))
        letters=[s for s in cue["text"].lower() if s in "aăâeiîoumbpfvl"]
        prop(rig,"mouth_pose",cue["start"]-1,0)
        for f in range(cue["start"],cue["end"],3):
            j=round((f-cue["start"])*rate/FPS)
            window=samples[j:j+rate//10]
            energy=sum(abs(n) for n in window)/max(len(window),1)
            char=letters[min(len(letters)-1, int(j/max(1,len(samples))*len(letters)))]
            poses={"a":1,"ă":1,"â":3,"e":2,"i":2,"î":2,"o":3,"u":3,
                   "m":4,"b":4,"p":4,"f":5,"v":5,"l":6}
            prop(rig,"mouth_pose",f,poses[char] if energy>470 else 0)
        prop(rig,"mouth_pose",cue["end"],0)


def cues(beat,speaker):
    return [cue for cue in BEATS[beat]["cues"] if cue["speaker"]==speaker]


def prop_book(a, center=.52):
    p,rig,coll=a["p"],a["rig"],a["collection"]
    art=Art("Carte groasă sub braț",coll,(center,.78),(1,1),z=.47)
    art.shape("M -.44 -.45 L .21 -.54 L .359 .428 L -.288 .521 Z",
              "6f4942","53342d",.041)
    art.shape("M -.405 -.397 L .205 -.487 L .304 .380 L -.271 .467 Z",
              "e6c69a")
    art.shape("M -.382 -.376 L .183 -.461 L .300 .437 L -.251 .523 Z",
              "a05c45","623e31",.032)
    art.line([(-.321,-.303),(-.221,.431)],"cb9363",.034)
    art.line([(-.227,.338),(.179,.277)],"daab70",.034)
    art.diamond(-.020,.028,.123,.188,"c89a61")
    art.diamond(-.011,.027,.041,.071,"995a44")
    obj=art.finish()
    bind(obj,rig,"chest")


def relax_wrist(a,side):
    p=a["p"]
    sign=-1 if side=="R" else 1
    return (sign*(p["shoulder_x"]+.08),p["shoulder_y"]-p["upper"]-p["lower"]+.085)


def animate_village(coll):
    village(coll)
    child=actor(coll,"cleopa","Costică · sat",(3.63,-1.55,.19),1.29,hat=True)
    shadow(child)
    start,end=BEATS["sat"]["start"],BEATS["sat"]["end"]
    stand(child,start)
    breathing(child,start,end)
    for frame,bow,tilt in ((start,.025,-.037),(beat_frame("sat",.36),0,.038),(beat_frame("sat",.79),.015,.088),(end-1,0,.045)):
        head(child["rig"],frame,bow,tilt)
    blink(child["rig"],beat_frame("sat",.30))
    blink(child["rig"],beat_frame("sat",.75))
    prop(child["rig"],"mouth_pose",beat_frame("sat",.62),7)
    for i in range(4):
        bird=empty(f"Rândunică {i+1}",coll,(-.3,2.7,-2.1))
        art=Art("Aripi de rândunică",coll)
        art.line("M -.14 .016 Q -.057 .088 0 .025 Q .061 .100 .14 .031","617e78",.035)
        obj=art.finish()
        obj.parent=bird
        for f in range(start,end+1,6):
            frac=(f-start)/(end-start)
            key(bird,f,position=(-.6+i*.41+frac*4.1,2.08+i*.13+sin(frac*pi+i*.8)*.21,-2.1),
                scale=(1,.51+.42*abs(sin(frac*pi*17+i)),1))
    return [child]


def animate_bed(coll):
    bedroom(coll)
    child=actor(coll,"cleopa","Costică · pat",(1.70,-1.94,.43),1.17)
    start=BEATS["trezire"]["cues"][1]["start"]-4
    stop=BEATS["burtica"]["end"]-1
    stand(child,start-1)
    breathing(child,start,stop,.9)
    rig=child["rig"]
    for side,sign in (("R",-1),("L",1)):
        rest=relax_wrist(child,side)
        position=(sign*.41,.49)
        gesture=(sign*.43,.51)
        if side=="R":
            middle=BEATS["burtica"]["cues"][0]["start"]
            points=[(start,rest,(0,-1)),(start+28,position,(.68,.17)),
                    (BEATS["burtica"]["start"]+10,gesture,(1,.13)),
                    (middle+8,(-.42,.57),(.99,.07)),(middle+29,(-.40,.53),(.96,.09)),
                    (stop-6,gesture,(.95,.18)),(stop,gesture,(.95,.18))]
        else:
            points=[(start,rest,(0,-1)),(start+28,position,(-.88,.15)),
                    (BEATS["burtica"]["start"]+13,gesture,(-.96,.15)),(stop,gesture,(-.93,.20))]
        arms(child,side,points,seated=True)
        hand_pose(child,side,start+23,"cup")
    prop(rig,"eye_pose",start,2)
    prop(rig,"eye_pose",start+13,1)
    prop(rig,"eye_pose",start+21,0)
    blink(rig,beat_frame("burtica",.77))
    for f,bow,tilt in ((start,.17,-.125),(start+31,.04,-.06),
                       (BEATS["burtica"]["start"]+5,.1,-.135),(beat_frame("burtica",.54),0,.04),(stop,.065,-.076)):
        head(rig,f,bow,tilt)
    voice(child,cues("burtica","costica"))
    return [child]


def animate_yard(coll):
    farmyard(coll)
    rooster_=rooster(coll)
    rooster_["root"].location=(1.26,-.99,-2.73)
    rooster_["root"].scale=(1.38,1.38,1)
    pig_=pig(coll)
    trough(coll)
    pig_["root"].location=(-2.81,-3.17,-.05)
    pig_["root"].scale=(1.17,1.17,1)
    wake=BEATS["trezire"]["start"]
    end=BEATS["mihai"]["end"]-1
    gate(rooster_["beak"],wake+3,wake+23)
    for f,x in ((wake,0),(wake+8,-.25),(wake+15,-.34),(wake+26,.03),(wake+36,-.05)):
        key(rooster_["head"],f,turn=(0,0,x))
    key(rooster_["root"],BEATS["trezire"]["cues"][1]["start"],position=(1.26,-.99,-2.73),scale=(1.38,1.38,1))
    key(rooster_["root"],BEATS["troaca"]["start"]-3,position=(4.80,-.99,-2.73),scale=(.94,.94,1))
    grunt=BEATS["troaca"]["cues"][-1]["end"]+2
    first=BEATS["trezire"]["cues"][1]["start"]-6
    for obj,positions in (
        (pig_["open"],[(wake,True),(wake+37,False),(BEATS["troaca"]["start"],False),(grunt-6,False)]),
        (pig_["shut"],[(wake,False),(wake+37,True)]),
        (pig_["jaw"],[(wake,True),(wake+26,False),(wake+52,True),(grunt,False),(grunt+12,True)]),
    ):
        for f,hidden in positions:
            for attr in ("hide_render","hide_viewport"):
                setattr(obj,attr,hidden)
                obj.keyframe_insert(attr,frame=f)
        for curve in obj.animation_data.action.fcurves:
            for k in curve.keyframe_points:
                k.interpolation="CONSTANT"
    feeding = BEATS["troaca"]["start"]
    for f,t in ((wake,-.36),(wake+23,-.17),(wake+41,.16),(wake+63,.03),(first,-.12),
                (feeding,-.613),(grunt-12,-.623),(grunt,.14),(grunt+13,-.10),
                (beat_frame("mihai",.44),-.42),(end,-.56)):
        key(pig_["head"],f,turn=(0,0,t))
    gate(pig_["bite"],feeding,grunt-9)
    for frame in range(feeding,grunt-12,4):
        bite = .5-.5*cos((frame-feeding)*tau/18)
        key(pig_["chew"],frame,scale=(1,.21+.79*bite,1))
        key(pig_["head"],frame,position=(.56,.887-.025*bite,.185))
    key(pig_["head"],grunt,position=(.56,.887,.185))
    for f in range(wake,end+1,7):
        key(pig_["tail"],f,turn=(0,0,.22*sin((f-wake)*.15)))
    start=BEATS["troaca"]["start"]
    child=actor(coll,"cleopa","Costică · ogradă",(2.63,-1.49,.21),1.16,hat=True)
    shadow(child)
    reveal_actor(child,start,end+1)
    stand(child,start-3)
    breathing(child,start,end,.7)
    for f,bow,angle in ((start,0,.09),(beat_frame("troaca",.48),.045,.12),(grunt,.0,.05),
                        (BEATS["mihai"]["start"]+35,.01,-.086),(end,.014,-.03)):
        head(child["rig"],f,bow,angle)
    blink(child["rig"],beat_frame("troaca",.32))
    blink(child["rig"],beat_frame("mihai",.55))
    voice(child,cues("troaca","costica"))
    r=relax_wrist(child,"R")
    speech=BEATS["troaca"]["cues"][-1]
    arms(child,"R",[(start,r,(-.06,-1)),(speech["start"],r,(-.06,-1)),
                    (speech["start"]+18,(-.61,.54),(-.92,-.14)),
                    (speech["end"]+13,r,(-.06,-1)),(end,r,(-.06,-1))])
    hand_pose(child,"R",speech["start"]+8,"open")
    hand_pose(child,"R",speech["end"]+7,"rest")

    brother=actor(coll,"brother_01","Mihai · ogradă",(-.38,-1.48,-.61),1.13,look=1)
    m0=BEATS["mihai"]["start"]
    walk_end=m0+67
    position_paths(brother,[(m0,-3.42,0),(m0+14,-3.42,0),(walk_end,0,0),(end,0,0)])
    step(brother,m0+14,walk_end,2.5)
    stand(brother,m0)
    r=relax_wrist(brother,"R")
    line=cues("mihai","mihai")[0]
    arms(brother,"R",[(m0,r,(.02,-1)),(line["start"]-17,r,(.04,-1)),
                       (line["start"]+12,(-.12,1.00),(.83,.55)),
                       (line["end"]-8,(-.12,1.00),(.83,.55)),
                       (end+15,r,(.03,-1))])
    arms(brother,"L",[(m0,(.64,.61),(-.96,.24)),(end,(.64,.61),(-.96,.24))],True)
    prop_book(brother)
    blink(brother["rig"],beat_frame("mihai",.57))
    hand_pose(brother,"L",m0,"grip")
    hand_pose(brother,"R",line["start"]-4,"open")
    hand_pose(brother,"R",line["end"]+6,"rest")
    voice(brother,cues("mihai","mihai"))
    shadow(brother)
    reveal_actor(brother,m0,end+1)
    return [child,brother]


def animate_kitchen(coll):
    loaf,flame=kitchen(coll)
    begin=BEATS["cuptor"]["start"]
    end=BEATS["intai"]["end"]-1
    prayer_start=BEATS["la-icoane"]["start"]
    mother=actor(coll,"mother","Mama · bucătărie",(-1.72,-2.37,.08),1.22,look=1)
    child=actor(coll,"cleopa","Costică · bucătărie",(2.22,-2.47,1.14),1.15)
    brother=actor(coll,"brother_01","Mihai · bucătărie",(4.23,-2.40,.61),1.13,look=-1)
    father=actor(coll,"father","Tata · prag",(6.62,-2.62,1.67),1.30,look=-1)
    prop_book(brother,center=.32)
    short_beard(father)
    for a in (mother, child, brother, father):
        stand(a,begin)
        breathing(a,begin,prayer_start-1,a["home"].x)
    for k in range(begin,TIMING["end"]+1,10):
        key(flame,k,position=(.03*sin(k*.4),.025*sin(k*.6),0))
    settle=beat_frame("cuptor",.78)
    table_pane=(-.12,-2.56,0)
    key(loaf,begin,position=(-2.38,-1.56,0))
    key(loaf,begin+23,position=(-2.16,-1.49,0))
    key(loaf,settle-20,position=(-.24,-1.69,0))
    key(loaf,settle,position=table_pane)
    key(loaf,end,position=table_pane)
    position_paths(mother,[(begin,-1.84,0),(begin+23,-1.61,.02),
                           (settle-20,.66,-.10),(settle,1.15,-.54),
                           (settle+31,0,0),(end,0,0)])
    invite=BEATS["traista"]["cues"][0]
    # Maintain the grasp while the platter travels. The rest occurs after it touches the table.
    for side in ("L","R"):
        previous=None
        for f in range(begin,settle+1):
            bpy.context.scene.frame_set(f)
            grip = -.91 if side=="R" else .76
            point=Vector((loaf.location.x+grip,loaf.location.y-.142))
            point=(point-Vector((mother["rig"].location.x,mother["rig"].location.y)))/mother["size"]
            aim=Vector((.90,.28))
            if side=="L":
                aim=aim.lerp(Vector((.86,-.50)),smooth((f-settle+34)/34))
            previous=arm_key(mother["rig"],mother["p"],side,f,point,aim,previous)
        hand_pose(mother,side,begin,"cup")
        rest=relax_wrist(mother,side)
        f=settle+21
        arm_key(mother["rig"],mother["p"],side,f,rest,(0,-1))
        hand_pose(mother,side,f,"rest")
        if side=="L":
            arms(mother,side,[(f,rest,(0,-1)),(invite["start"]+3,rest,(0,-1)),
                             (invite["start"]+28,(.925,.793),(-.102,-.995)),
                             (invite["start"]+43,(1.25,.85),(.95,.28)),
                             (invite["end"]-23,(1.25,.85),(.95,.28)),
                             (invite["end"]-4,(.925,.793),(-.102,-.995)),
                             (invite["end"]+15,rest,(0,-1)),(end,rest,(0,-1))])
            hand_pose(mother,"L",invite["start"]+25,"open")
            hand_pose(mother,"L",invite["end"],"rest")
    for f,bow,tilt in ((begin,.06,-.086),(settle,.13,-.095),(invite["start"],.016,.043),(invite["end"],.026,.075),(end,.02,-.014)):
        head(mother["rig"],f,bow,tilt)
    blink(mother["rig"],settle+10)
    blink(mother["rig"],invite["end"]-14)
    voice(mother,[invite])

    st=steam_art(coll,"Abur de pâine")
    for f in range(begin,TIMING["end"]+1,8):
        bpy.context.scene.frame_set(f)
        position=loaf.location.copy()
        key(st,f,position=(position.x+.07*sin(f*.085),position.y+.51+.078*sin(f*.063),.022),
            scale=(1+.08*sin(f*.063),.82+.17*sin(f*.081),1))
    aroma=Art("Miros auriu",coll,(.25,-1.59),(1,1),z=1.09)
    aroma.line("M -.53 -.205 Q -.90 .38 -.38 .68 Q .31 1.133 1.021 .67 Q 1.223 .533 1.333 .797","eac98f",.073)
    aroma.line("M -.261 -.227 Q .023 .06 -.195 .273 Q -.422 .678 .220 .691 Q .621 .778 .863 .543","f6d79d",.057)
    for x,y,s in ((-.53,.38,.044),(.45,.96,.058),(.93,.78,.043),(.22,.41,.035)):
        aroma.diamond(x,y,s,s*1.32,"f2d19a")
    aura=aroma.finish()
    gate(aura,beat_frame("aproape",.22),BEATS["prag"]["start"])
    for f in range(beat_frame("aproape",.22),BEATS["prag"]["start"],10):
        key(aura,f,position=(.10*sin(f*.06),.105*sin(f*.057),0))

    approaching=BEATS["aproape"]["start"]
    stop=BEATS["prag"]["start"]+6
    # Use the child's own right hand, on the screen-left side nearest the loaf.
    arm=relax_wrist(child,"R")
    l=relax_wrist(child,"L")
    arms(child,"L",[(begin,l,(0,-1)),(approaching,(.47,.395),(-.8,-.45)),
                     (end,(.47,.395),(-.8,-.45))],True)
    # Keep the extended fingertips just beyond the rim of the platter.
    start_push=approaching+12
    reach_wrist=(-.79,.52)
    near=(-.88,.58)
    arms(child,"R",[(begin,arm,(0,-1)),(start_push,arm,(0,-1)),
                     (beat_frame("aproape",.33),reach_wrist,(-.96,.20)),
                     (stop,near,(-.99,.10)),(end,near,(-.99,.10))],True)
    hand_pose(child,"R",start_push+7,"reach")
    for f,bow,tilt in ((begin,0,.017),(invite["start"]+7,.035,.02),(approaching,.0,.028),
                       (beat_frame("aproape",.47),.074,.12),(stop,0,-.075),(end,.01,-.025)):
        head(child["rig"],f,bow,tilt)
    blink(child["rig"],invite["start"]+17)
    blink(child["rig"],beat_frame("aproape",.42))
    blink(child["rig"],beat_frame("intai",.66))
    voice(child,cues("aproape","costica"))
    prop(child["rig"],"mouth_pose",stop,3)
    prop(child["rig"],"mouth_pose",BEATS["intai"]["cues"][-1]["start"]+18,4)
    prop(child["rig"],"mouth_pose",end-24,0)

    arms(brother,"L",[(begin,(.47,.61),(-.96,.21)),(end,(.47,.61),(-.96,.21))],True)
    hand_pose(brother,"L",begin,"grip")
    blink(brother["rig"],invite["end"]-17)
    for f,tilt in ((begin,.014),(invite["end"],.08),(stop,-.095),(end,.06)):
        head(brother["rig"],f,.02,tilt)

    door=BEATS["prag"]["start"]
    arrival=door+45
    position_paths(father,[(begin,2.78,-.10),(door,1.56,-.10),(arrival,0,0),(end,0,0)])
    step(father,door,arrival,1.6,.23)
    ra=relax_wrist(father,"R")
    warns=cues("prag","tata")[0]
    arms(father,"R",[(begin,ra,(.03,-1)),(warns["start"]-11,ra,(.03,-1)),
                      (warns["start"]+6,(-.71,.541),(.944,-.329)),
                      (warns["start"]+23,(-.46,1.17),(-.20,.98)),
                      (warns["end"]-13,(-.46,1.17),(-.20,.98)),
                      (warns["end"]+5,(-.71,.541),(.944,-.329)),
                      (BEATS["intai"]["start"]+14,ra,(.03,-1)),(end,ra,(.03,-1))])
    hand_pose(father,"R",warns["start"]+9,"stop")
    hand_pose(father,"R",warns["end"]+8,"rest")
    for f,bow,tilt in ((door,0,-.04),(arrival,.06,.10),(warns["start"],0,.07),(end,.04,.08)):
        head(father["rig"],f,bow,tilt)
    voice(father,cues("prag","tata")+cues("intai","tata"))
    blink(father["rig"],warns["end"]+7)
    for a in (mother,child,brother):
        reveal_actor(a,begin,prayer_start)
    reveal_actor(father,door,prayer_start)
    kitchen_replies(mother,child,brother,father,end)
    return [mother,child,brother,father,*prayer_tableau(coll,prayer_start,TIMING["end"])]


def short_beard(father):
    p = father["p"]
    art = Art("Barbă scurtă", father["collection"],
              (p["look"]*.049,p["head_y"]), (p["head_w"]*p["look"],p["head_h"]), z=.605)
    art.shape("M -.60 -.47 Q -.53 -.59 -.31 -.60 Q -.19 -.62 -.09 -.64 Q .17 -.72 .39 -.61 Q .61 -.59 .76 -.45 Q .71 -.67 .46 -.77 Q .30 -.93 .11 -.88 Q -.10 -.97 -.33 -.81 Q -.51 -.69 -.60 -.47 Z",
              "58372a",p["hair_dark"],.025)
    art.line("M -.38 -.67 Q -.15 -.81 .03 -.81 M .28 -.80 Q .47 -.74 .52 -.67",
             p["hair_light"],.020)
    bind(art.finish(),father["rig"],"head")


def kitchen_replies(mother, child, brother, father, start):
    whisper, question = BEATS["farfuria"]["cues"]
    defense = BEATS["grasutu"]["cues"][0]
    lesson = BEATS["porcul-si-omul"]["cues"][0]
    ask, hour, surprise = BEATS["un-ceas"]["cues"]
    joke = BEATS["amin"]["cues"][0]
    prayer_start = BEATS["la-icoane"]["start"]
    growl = next(effect for effect in TIMING["effects"]
                 if effect["file"] == "burta.wav" and effect["start"] > surprise["end"])
    lesson_reaction = lesson["end"] + 3
    laugh = joke["end"] + 2

    rig = child["rig"]
    # Turn toward Mihai during the whisper, back toward the table after the cut.
    bone = rig.pose.bones["head"]
    for f, value in ((start,1),(BEATS["farfuria"]["start"],-1),(BEATS["grasutu"]["start"],1)):
        bone.scale.x = value
        bone.keyframe_insert("scale",index=0,frame=f,group="Priviri")
    for curve in channels(rig,child["action"]):
        if curve.data_path == bone.path_from_id("scale"):
            for point in curve.keyframe_points:
                point.interpolation = "CONSTANT"

    child_rest = relax_wrist(child,"R")
    belly = (-.38,.12)
    wrist_limit = 72*pi/180
    arms(child,"R",[
        (start,(-.88,.58),(-.99,.10)),
        (whisper["start"]+11,child_rest,(0,-1)),
        (defense["start"]+7,child_rest,(0,-1)),
        (defense["start"]+21,(-.94,.78),(-.92,.31)),
        (defense["end"],(-.94,.78),(-.92,.31)),
        (defense["end"]+13,child_rest,(0,-1)),
        (hour["end"]+1,child_rest,(0,-1)),
        (surprise["start"]+8,(-1.00,.52),(-.96,-.24)),
        (surprise["start"]+18,(-.80,.91),(-.20,.98)),
        (growl["start"]-8,(-.80,.91),(-.20,.98)),
        (growl["start"]+2,(-.88,.60),(-.98,.08)),
        (growl["start"]+16,belly,(.92,.34)),
        (joke["end"],belly,(.92,.34)),
        (prayer_start-1,belly,(.92,.34)),
    ],True,wrist_limit=wrist_limit)
    for f, pose in ((whisper["start"],"rest"),(defense["start"]+13,"open"),
                    (defense["end"]+10,"rest"),(surprise["start"]+5,"open"),
                    (growl["start"]+7,"cup")):
        hand_pose(child,"R",f,pose)
    arms(child,"L",[(start,(.47,.395),(-.8,-.45)),
                    (growl["start"]-2,(.47,.395),(-.8,-.45)),
                    (growl["start"]+9,(.40,.25),(-.72,-.68)),
                    (prayer_start-1,(.40,.25),(-.72,-.68))],True,wrist_limit=wrist_limit)
    hand_pose(child,"L",growl["start"]+5,"cup")
    for f,bow,tilt in (
        (whisper["start"],.065,-.13),(question["start"],.015,.08),
        (defense["start"]+5,.06,.08),(defense["end"],0,-.09),
        (lesson["start"]+8,0,-.07),(lesson["end"],.045,.09),
        (ask["start"],0,-.08),(hour["end"],.025,-.04),
        (surprise["start"]+9,-.04,-.12),(growl["start"]+10,.15,.15),
        (joke["start"]+12,.045,-.11),
    ):
        head(rig,f,bow,tilt)
    blink(rig,question["start"]+5)
    blink(rig,lesson_reaction+9)
    voice(child,[whisper,defense,ask,surprise])

    rig = father["rig"]
    rest = relax_wrist(father,"R")
    chin = (-.27,1.67)
    down = (-.87,.62)
    up = (-.92,1.56)
    duration = lesson["end"] - lesson["start"]
    down_at = lesson["start"] + round(duration*.55)
    up_at = lesson["start"] + round(duration*.78)
    arms(father,"R",[
        (start,rest,(.03,-1)),(lesson["start"]-32,rest,(.03,-1)),
        (lesson["start"]+2,chin,(.32,.95)),
        (lesson["start"]+15,(-.22,1.61),(.36,.93)),
        (lesson["start"]+28,(-.34,1.53),(.28,.96)),
        (down_at-21,(-.81,1.09),(-.68,-.72)),
        (down_at,down,(-.26,-.97)),(down_at+12,down,(-.26,-.97)),
        (up_at-13,(-.93,1.02),(-.80,.60)),
        (up_at,up,(-.12,.99)),(lesson["end"]-9,up,(-.12,.99)),
        (lesson["end"]+12,(-.91,1.01),(-.61,.55)),
        (lesson_reaction+35,rest,(.03,-1)),
        (joke["start"]-8,rest,(.03,-1)),(joke["start"]+14,(-.81,.78),(-.40,-.92)),
        (joke["end"]-3,(-.81,.78),(-.40,-.92)),
        (laugh+22,rest,(.03,-1)),(prayer_start-1,rest,(.03,-1)),
    ],wrist_limit=wrist_limit)
    for f, pose in ((lesson["start"]-7,"cup"),(lesson["start"]+30,"reach"),
                    (lesson_reaction+15,"rest"),(joke["start"]+4,"open"),(laugh+12,"rest")):
        hand_pose(father,"R",f,pose)
    for f,bow,tilt in (
        (whisper["start"],.04,.08),(question["start"]+3,.025,.17),
        (defense["end"],.05,.13),(lesson["start"]+4,.07,.10),
        (down_at,.13,.17),(up_at,-.035,-.09),(lesson["end"],.04,.10),
        (hour["start"]+3,.07,.12),(joke["start"]+6,.115,.14),
    ):
        head(rig,f,bow,tilt)
    for f in (defense["start"]+6,lesson["start"]-4,lesson["end"]+4,hour["end"]+7):
        blink(rig,f)
    voice(father,[question,lesson,hour,joke])

    rig = mother["rig"]
    rest = relax_wrist(mother,"R")
    cheek = (-.51,1.83)
    arms(mother,"R",[
        (start,rest,(0,-1)),(lesson_reaction-27,rest,(0,-1)),
        (lesson_reaction+10,cheek,(.52,.85)),
        (ask["start"]-3,cheek,(.52,.85)),(ask["start"]+29,rest,(0,-1)),
        (laugh-26,rest,(0,-1)),(laugh+12,cheek,(.52,.85)),
        (prayer_start-1,cheek,(.52,.85)),
    ],wrist_limit=wrist_limit)
    for f, pose in ((lesson_reaction+5,"cup"),(ask["start"]+12,"rest"),(laugh+8,"cup")):
        hand_pose(mother,"R",f,pose)
    scarf_fold(mother,lesson_reaction+9,ask["start"]+7)
    scarf_fold(mother,laugh+11,prayer_start)
    blink(rig,whisper["end"])
    for f,bow,tilt in ((start,.02,-.014),(lesson_reaction+10,.13,-.13),(ask["start"]+16,.025,-.05)):
        head(rig,f,bow,tilt)
    prop(rig,"mouth_pose",lesson_reaction+5,7)
    prop(rig,"mouth_pose",ask["start"]+12,0)

    rig = brother["rig"]
    blink(rig,whisper["end"]+2)
    head(rig,whisper["start"]+6,.08,.16)
    head(rig,question["end"],.02,.05)
    laugh_reaction(brother,lesson_reaction,ask["start"]+3,.16)
    for index,a in enumerate((father,brother,mother,child)):
        laugh_reaction(a,laugh+index*2,prayer_start-1,.12 if a is father else .17)


def laugh_reaction(a, start, end, tilt):
    rig = a["rig"]
    for f,bow,mouth,eyes in ((start,.03,7,1),(start+4,.11,1,2),
                             (start+9,.05,7,1),(start+13,.14,1,2),
                             (start+18,.055,7,1),(end,.028,0,0)):
        if f <= end:
            head(rig,f,bow,tilt)
            prop(rig,"mouth_pose",f,mouth)
            prop(rig,"eye_pose",f,eyes)


def scarf_fold(mother,start,end):
    art = Art("Colțul baticului ridicat",mother["collection"],(-.36,2.03),(1,1),z=.72)
    art.shape("M -.44 .22 Q -.29 .13 -.12 .13 Q .09 .09 .45 .10 Q .58 .08 .52 -.025 Q .42 -.18 .21 -.20 Q -.06 -.25 -.29 -.14 Q -.42 -.05 -.44 .22 Z",
              "f7e6bf","9a6a54",.032)
    art.line("M -.37 .08 Q -.18 -.01 .00 -.073 Q .19 -.12 .39 -.086","d09270",.024)
    art.diamond(.33,.014,.043,.039,"aa6552")
    obj = art.finish()
    bind(obj,mother["rig"],"head")
    gate(obj,start,end)


def second_icon(coll,start,end):
    art = Art("Icoana Maicii Domnului cu Pruncul",coll,(-7.55,2.44),(1,1),z=-3.17)
    art.rect(-.84,-1.08,.84,1.08,"80513c","55372d",.058)
    art.rect(-.72,-.96,.72,.96,"daad62","b57a4e",.047)
    art.rect(-.62,-.86,.62,.86,"e9be73","a06748",.022)
    art.oval(-.13,.31,.433,.446,"f2cd82","ad774a",.023)
    art.oval(.26,-.076,.288,.287,"f5d189","ad774a",.025)
    art.shape("M -.57 -.83 Q -.59 -.47 -.46 -.04 Q -.48 .47 -.20 .61 Q .08 .65 .18 .26 Q .25 -.05 .54 -.79 Z",
              "914e4b","683f3c",.045)
    art.line("M -.50 -.62 Q -.45 -.18 -.38 .20 Q -.31 .48 -.17 .49 Q -.00 .49 .09 .26",
             "c58d5d",.023)
    art.shape("M -.30 .29 Q -.14 .46 .007 .29 Q .086 .21 .042 .02 Q -.02 -.16 -.147 -.13 Q -.30 -.08 -.30 .29 Z",
              "eac091","a1694f",.019)
    art.line("M -.25 .21 Q -.22 .24 -.187 .204 M -.14 .21 Q -.10 .23 -.066 .191",
             "805244",.019)
    art.shape("M -.01 -.82 Q .00 -.44 .12 -.31 Q .25 -.22 .41 -.35 Q .55 -.58 .57 -.82 Z",
              "8a9890","596a64",.033)
    art.oval(.25,-.114,.186,.209,"eec699","a16c52",.025)
    art.line("M .093 -.061 Q .207 .162 .392 -.045","98704f",.042)
    art.line("M .158 -.123 Q .202 -.11 .222 -.137 M .274 -.133 Q .306 -.114 .336 -.143",
             "805244",.018)
    art.line("M .08 -.53 Q .216 -.43 .261 -.27","e5b689",.049)
    for x in (-.68,.68):
        for y in (-.92,.92):
            art.diamond(x,y,.034,.052,"f3cb7d")
    gate(art.finish(),start,end)


def prayer_tableau(coll,start,end):
    second_icon(coll,start,end+1)
    father = actor(coll,"father","Tata · rugăciune",(-3.64,-2.16,1.54),1.23,look=-1)
    mother = actor(coll,"mother","Mama · rugăciune",(-1.24,-2.43,1.49),1.13,look=-1)
    brother = actor(coll,"brother_01","Mihai · rugăciune",(1.00,-2.48,1.35),1.10,look=-1)
    child = actor(coll,"cleopa","Costică · rugăciune",(3.23,-2.49,1.56),1.09,look=-1)
    short_beard(father)
    book = Art("Carte de rugăciuni deschisă",father["collection"],(-.21,.93),(1,1),z=.62)
    book.shape("M -.78 .22 Q -.40 .35 0 .14 Q .40 .35 .78 .22 L .70 -.30 Q .35 -.22 0 -.38 Q -.35 -.22 -.70 -.30 Z",
               "784e40","54372c",.050)
    book.shape("M -.72 .25 Q -.35 .35 0 .16 Q .35 .35 .72 .25 L .65 -.24 Q .29 -.17 0 -.34 Q -.29 -.17 -.65 -.24 Z",
               "eed5a9","ac7c57",.034)
    book.line([(0,.16),(0,-.34)],"a77552",.023)
    for x in (-1,1):
        for y in (-.14,-.045,.05,.14):
            book.line([(x*.13,y),(x*.36,y+.07),(x*.55,y+.073)],"b38d66",.013)
    bind(book.finish(),father["rig"],"chest")
    for side,wrist,direction in (("L",(.44,.68),(-.69,.72)),("R",(-.84,.86),(.85,.52))):
        arm_key(father["rig"],father["p"],side,start,wrist,direction,wrist_limit=72*pi/180)
        hand_pose(father,side,start,"cup")
    choir = BEATS["la-icoane"]["cues"][-1]
    for index, a in enumerate((father,mother,brother,child)):
        rig = a["rig"]
        if a is not father:
            stand(a,start)
        reveal_actor(a,start,end+1)
        breathing(a,start,end,index)
        blink(rig,start+19+8*index)
        blink(rig,choir["end"]+7+3*index)
        head(rig,start,.09 if index<2 else .022,.12)
        head(rig,choir["start"]-12,.12 if index<2 else .044,.15)
        head(rig,choir["end"]+10,.13,.12)
        # The reader's lower, quieter voice begins beneath the narration.
        if index < 2:
            syllables(rig,start+35+index*10,choir["start"]-7,8+index,lead=index==0)
        voice(a,[choir])
    glance = BEATS["la-icoane"]["cues"][0]["end"]-35
    head(brother["rig"],glance,.12,.16)
    head(child["rig"],glance-7,.23,.21)
    prop(child["rig"],"eye_pose",glance-5,1)
    head(child["rig"],choir["start"]-3,.025,.14)
    prop(child["rig"],"eye_pose",choir["start"]-3,0)
    return [father,mother,brother,child]


def camera_cut(scene, name, frame, zone, center, width, duration, glide=(0,0,0)):
    data=bpy.data.cameras.new(name)
    obj=bpy.data.objects.new(name,data)
    scene.collection.objects.link(obj)
    obj.location=(ZONE[zone]+center[0],center[1],20)
    data.type="ORTHO"
    data.ortho_scale=width
    data.passepartout_alpha=1
    marker=scene.timeline_markers.new(name,frame=frame)
    marker.camera=obj
    if any(glide):
        obj.keyframe_insert("location",frame=frame)
        data.keyframe_insert("ortho_scale",frame=frame)
        obj.location.x+=glide[0]
        obj.location.y+=glide[1]
        data.ortho_scale+=glide[2]
        obj.keyframe_insert("location",frame=frame+duration-1)
        data.keyframe_insert("ortho_scale",frame=frame+duration-1)
    return obj


def cameras(scene):
    next_bed=BEATS["trezire"]["cues"][1]["start"]-4
    specs=[
        ("Satul în zori", BEATS["sat"]["start"], "village", (0,.23),16.0,(.15,-.05,-.27)),
        ("Cocoșul și purcelușul",BEATS["trezire"]["start"],"yard",(-.5,-.32),11.7,(.10,0,-.32)),
        ("Trezirea lui Costică",next_bed,"bed",(.27,-.70),12.0,(.14,.17,-.27)),
        ("Ghiorrr!",BEATS["burtica"]["start"],"bed",(1.47,-.24),7.25,(.04,0,-.12)),
        ("La troacă",BEATS["troaca"]["start"],"yard",(.27,-.51),11.0,(.10,0,-.18)),
        ("Mihai apare de după șură",BEATS["mihai"]["start"],"yard",(-.63,-.40),12.1,(.28,.04,-.11)),
        ("Pâinea caldă",BEATS["cuptor"]["start"],"kitchen",(-1.51,-.65),13.60,(.13,-.02,-.12)),
        ("Drumul spre școală",BEATS["traista"]["start"],"kitchen",(.96,-.60),10.2,(.09,.0,-.16)),
        ("Încă puțin",BEATS["aproape"]["start"],"kitchen",(1.33,-.96),8.16,(.12,-.04,-.22)),
        ("Tata în prag",BEATS["prag"]["start"],"kitchen",(2.50,-.47),11.96,(.19,.07,-.16)),
        ("Întâi ne rugăm",BEATS["intai"]["start"],"kitchen",(1.45,-.96),7.95,(.09,.03,-.23)),
        (BEATS["farfuria"]["title"],BEATS["farfuria"]["start"],"kitchen",(4.25,-.41),8.10,(.07,.05,-.12)),
        (BEATS["grasutu"]["title"],BEATS["grasutu"]["start"],"kitchen",(2.57,-.47),5.56,(.04,.01,-.11)),
        (BEATS["porcul-si-omul"]["title"],BEATS["porcul-si-omul"]["start"],"kitchen",(2.39,-.50),11.60,(.05,.04,-.17)),
        (BEATS["un-ceas"]["title"],BEATS["un-ceas"]["start"],"kitchen",(3.75,-.45),8.86,(.05,.04,-.13)),
        (BEATS["amin"]["title"],BEATS["amin"]["start"],"kitchen",(2.45,-.57),11.55,(.09,.01,-.10)),
        (BEATS["la-icoane"]["title"],BEATS["la-icoane"]["start"],"kitchen",(-2.04,-.18),13.80,(.21,.06,-.24)),
    ]
    cuts=[]
    for i,(name,start,zone,center,width,glide) in enumerate(specs):
        end=specs[i+1][1] if i+1 < len(specs) else TIMING["end"]+1
        camera=camera_cut(scene,name,start,zone,center,width,end-start,glide)
        cuts.append(dict(camera=camera,start=start))
    return cuts


def rounded(art,x,y,w,h,r,color,edge=None):
    l,b=x-w/2,y-h/2
    right,t=x+w/2,y+h/2
    art.shape(f"M {l+r} {b} L {right-r} {b} Q {right} {b} {right} {b+r} L {right} {t-r} Q {right} {t} {right-r} {t} L {l+r} {t} Q {l} {t} {l} {t-r} L {l} {b+r} Q {l} {b} {l+r} {b} Z",
              color,edge,.022)


def font_load(name):
    for root in (Path("/usr/share/fonts/truetype/dejavu"), ROOT/"fonts"):
        path=root/name
        if path.is_file():
            return bpy.data.fonts.load(str(path))
    raise FileNotFoundError(name)


def typography(name,body,typeface,size,color,coll,parent,location):
    curve=bpy.data.curves.new(name,"FONT")
    curve.body=body
    curve.font=typeface
    curve.size=size
    curve.align_x="CENTER"
    curve.align_y="CENTER"
    curve.space_line=1.06
    curve.materials.append(material(color))
    obj=bpy.data.objects.new(name,curve)
    coll.objects.link(obj)
    obj.parent=parent
    obj.location=location
    return obj


def titles(cuts):
    coll=collection("Titlu și efecte grafice")
    regular=font_load("DejaVuSans.ttf")
    bold=font_load("DejaVuSerif-Bold.ttf")
    shot=cuts[0]
    plate=empty("Copertă · titlu",coll,(-3.52,1.32,-.9),shot["camera"])
    art=Art("Plachetă de început",coll)
    rounded(art,.07,-.075,7.30,2.20,.31,"a68964")
    rounded(art,0,0,7.30,2.18,.31,"f4d9a6","8a6047")
    rounded(art,0,0,7.08,1.98,.23,"f7dfb0","d9a96e")
    for x in (-3.17,3.17):
        art.diamond(x,.07,.105,.143,"ac6c48")
        art.diamond(x,.07,.046,.059,"f7d293")
    sash=art.finish()
    sash.parent=plate
    title=typography("Titlu",PLAN["title"],bold,.74,COCOA,coll,plate,(0,.34,.038))
    subtitle=typography("Titlu secundar",PLAN["subtitle"],regular,.39,"74513d",coll,plate,(0,-.43,.042))
    title_end=BEATS["sat"]["cues"][0]["start"]+2
    for item in (sash,title,subtitle):
        gate(item,1,title_end)
    for frame,s in ((1,.96),(18,1),(title_end-9,1),(title_end-1,.95)):
        key(plate,frame,scale=(s,s,1))

    burta=next(effect for effect in TIMING["effects"] if effect["file"]=="burta.wav")
    shot=next(cut for cut in cuts if cut["start"]==BEATS["burtica"]["start"])
    bubble=empty("Bulă pentru Ghiorrr",coll,(-2.22,-.53,-1.02),shot["camera"])
    art=Art("Bulă de dialog",coll)
    art.shape("M -.937 .032 Q -.887 .43 -.188 .41 Q .578 .425 .884 .184 Q 1.104 -.18 .468 -.307 L .688 -.55 L .195 -.357 Q -.540 -.400 -.828 -.195 Q -.959 -.120 -.937 .032 Z",
              "f8dfaa","a56f51",.037)
    item=art.finish()
    item.parent=bubble
    letters=typography("Ghiorrr!","Ghiorrr!",bold,.323,"80513d",coll,bubble,(-.025,.041,.034))
    for obj in (item,letters):
        gate(obj,burta["start"],burta["end"]+1)
    for f,s,y in ((burta["start"],.73,-.59),(burta["start"]+5,1.06,-.52),(burta["end"],.99,-.49)):
        key(bubble,f,position=(-2.22,y,-1.02),scale=(s,s,1))


def make_sound_strips(scene):
    editor=scene.sequence_editor_create()
    seq=getattr(editor,"strips",None) or editor.sequences
    source=ROOT/"audio"
    bed=seq.new_sound("Lyria · coloană sonoră",str(source/"music-bed.mp3"),1,1)
    bed.frame_final_end=TIMING["end"]+1
    for beat in TIMING["beats"]:
        for cue in beat["cues"]:
            seq.new_sound(cue["speaker"]+" · "+cue["text"],str(source/cue["file"]),3,cue["start"])
    for effect in TIMING["effects"]:
        seq.new_sound("Efect · "+effect["file"],str(source/effect["file"]),2,effect["start"])
    for snd in bpy.data.sounds:
        snd.filepath="//../audio/"+Path(snd.filepath).name
    scene.render.use_sequencer=False
    scene.sync_mode="AUDIO_SYNC"


def main():
    scene=setup("Micuțul Cleopa · Pâinea care poate să aștepte",end=TIMING["end"])
    scene.render.resolution_x=1280
    scene.render.resolution_y=720
    scene.render.dither_intensity=0
    scene.display.render_aa="5"
    scene.render.image_settings.compression=22
    scene.frame_step=2
    scene.render.filepath="//../renders/frames/frame_"
    bpy.data.objects.remove(scene.camera,do_unlink=True)
    for zone,name,animate in (
        ("village","01 · Satul de pe deal",animate_village),("yard","02 · Ograda",animate_yard),
        ("bed","03 · Dormitor",animate_bed),("kitchen","04 · Bucătărie",animate_kitchen),
    ):
        coll=collection(name)
        actors=animate(coll)
        pivot=empty(name+" · origine decor",coll,(ZONE[zone],0,0))
        for obj in list(coll.all_objects):
            if obj != pivot and obj.parent is None:
                obj.parent=pivot
        for a in actors:
            finish_action(a["rig"],a["action"])
    cuts=cameras(scene)
    titles(cuts)
    make_sound_strips(scene)
    scene["momente"]=len(TIMING["beats"])
    scene["redare"]="24 fps · animație pe doi timpi"
    scene.frame_set(1)
    scene.camera=cuts[0]["camera"]
    path=ROOT/"scenes"/"painea_care_poate_sa_astepte.blend"
    path.parent.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    print("EPISODE_READY",TIMING["end"],flush=True)


if __name__=="__main__":
    main()
