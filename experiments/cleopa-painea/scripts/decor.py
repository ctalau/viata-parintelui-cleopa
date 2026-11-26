"""Editable painted sets and articulated animals, using the Cleopa cut-out palette."""
import random
from math import cos, sin, tau

import bpy

from build_environment import icon_corner, meal, plank, table, textile, walls, window
from vector_art import Art, collection

INK = "553226"
LIT = "fff0ca"
SUN = "ffda8a"


def empty(name, coll, position=(0, 0, 0), parent=None):
    obj = bpy.data.objects.new(name, None)
    coll.objects.link(obj)
    obj.parent = parent
    obj.location = position
    obj.empty_display_size = .23
    return obj


def place(art, parent=None):
    obj = art.finish()
    if parent:
        obj.parent = parent
    return obj


def sky(coll, sunrise=(-4.33, 2.51), yard=False):
    art = Art("Cer la răsărit", coll, z=-7)
    art.rect(-12, -7, 12, 7, "8fbfc1")
    art.shape("M -12 3.06 Q -5.79 2.48 -.39 3.33 Q 5.41 4.24 12 3.92 L 12 7 L -12 7 Z",
              "81afba")
    art.shape("M -12 .72 Q -6.3 1.84 -.75 1.94 Q 5.9 1.46 12 2.47 L 12 -4 L -12 -4 Z",
              "d5c7a0")
    art.shape("M -12 1.45 Q -5.63 2.32 -.74 2.07 Q 6.26 1.91 12 3.03 L 12 2.67 Q 6.92 1.35 -.5 1.70 Q -6.83 1.96 -12 1.09 Z",
              "eee1b2")
    x, y = sunrise
    art.oval(x, y, .83, .83, "efd497")
    art.oval(x, y, .70, .70, "f9df9e")
    art.oval(x, y, .575, .575, SUN)
    for y, x in ((3.64,-5.75),(2.99,1.78),(2.70,4.13),(1.73,-1.25)):
        art.line(f"M {x} {y} Q {x+1.05} {y+.15} {x+1.89} {y+.037}", "d5dec2", .048)
        art.line([(x+.35,y-.12),(x+1.37,y-.11)], "bdd4c4", .030)
    art.shape("M -12 -.19 Q -8.58 1.50 -5.01 1.39 Q -2.80 1.29 -.75 .82 Q 1.63 1.83 4.75 1.45 Q 8.49 1.34 12 .12 L 12 -4 L -12 -4 Z",
              "8fa790")
    art.shape("M -12 -.74 Q -7.30 .72 -5.15 .54 Q -2.97 .35 -.77 -.12 Q 3.62 1.03 7.02 .63 Q 9.40 .42 12 .71 L 12 -4 L -12 -4 Z",
              "729985")
    art.shape("M -12 -1.56 Q -7.66 .15 -4.88 -.41 Q -1.53 -.89 1.33 -.37 Q 5.31 .62 8.61 -.30 Q 10.51 -.82 12 -.57 L 12 -5 L -12 -5 Z",
              "a6ac77")
    art.shape("M -12 -2.11 Q -9.13 -.71 -5.24 -.84 Q .18 -.57 3.49 -1.09 Q 7.13 -.99 12 -.91 L 12 -6 L -12 -6 Z",
              "9da169")
    art.shape("M -12 -2.80 Q -6.02 -1.88 -1.48 -1.95 Q 5.37 -1.49 12 -2.14 L 12 -6 L -12 -6 Z",
              "b9a574" if yard else "b5a76d")
    path_color = "c7a77d" if yard else "d3b488"
    art.shape("M -5.68 -1.04 Q -4.00 -1.58 -2.73 -1.69 Q .83 -1.83 4.21 -2.50 Q 7.05 -2.69 8.77 -4.90 L 3.32 -6 Q 2.25 -4.39 .57 -3.62 Q -2.30 -2.35 -4.03 -1.83 Q -5.56 -1.33 -5.68 -1.04 Z",
              path_color)
    art.line("M -.09 -2.33 Q 2.84 -2.83 4.46 -3.67 Q 5.02 -3.92 5.48 -4.64", "b79770", .035)
    art.finish()


def house(art, x, y, size, shed=False):
    art.origin = (x, y)
    art.scale = (size, size)
    wall = "ae855a" if shed else "efe0b5"
    art.shape("M -1.30 -.05 L -1.25 .91 L -.47 1.53 L 1.25 1.03 L 1.31 -.03 Q .32 -.12 -1.30 -.05 Z",
              wall, "885f47", .043)
    art.shape("M .24 1.23 L 1.28 1.10 L 1.32 .01 L .26 -.08 Z",
              "957356" if shed else "c6b088")
    art.shape("M -.68 1.41 L -.71 1.87 L -.42 1.90 L -.29 1.47 Z", "99775d", INK, .035)
    art.shape("M -1.52 .96 Q -.88 1.42 -.55 1.72 Q .39 1.74 .88 1.58 L 1.52 1.04 L .43 .85 Q -.72 .92 -1.52 .96 Z",
              "a97a4b", "785337", .055)
    art.shape("M -1.41 .995 L -.57 1.69 Q .33 1.70 .88 1.575 L .33 1.00 Q -.63 .87 -1.41 .995 Z",
              "c29457")
    art.line("M -1.45 .97 Q -.12 .865 .42 .89", "e0b173", .07)
    for pos in (-1.01, -.74, -.48, -.22, .035, .26):
        art.line([(pos, .99), (pos+.48, 1.57)], "ae8051", .031)
    if shed:
        art.shape("M -.83 .00 L -.84 .837 L .02 .811 L .06 -.03 Z", "665040", INK, .045)
        for pos in (-.77, -.55, -.33, -.10, .55, .77, 1.0):
            art.line([(pos,.04),(pos-.014,.78)], "80604a", .031)
        art.line("M -.81 .09 L -.06 .72", "927252", .061)
    else:
        art.rect(-.98, .29, -.51, .76, "765343", "9a7451", .040)
        art.rect(-.915, .355, -.577, .696, "8eacaa")
        art.line([(-.751,.34),(-.751,.71)], "815d48", .057)
        art.line([(-.945,.522),(-.555,.522)], "815d48", .052)
        art.shape("M -.28 -.045 L -.265 .757 Q -.05 .826 .153 .724 L .188 -.069 Z",
                  "8d6448", "694d3c", .039)
        art.oval(.088, .323, .028, .031, "d0a260")
        art.line("M .39 .05 L 1.25 .06", "a38664", .058)


def tree(coll, x, y, scale, front=False):
    art = Art("Măr și frunze", coll, (x, y), (scale, scale), z=-1.1 if front else -5)
    art.shape("M -.22 .08 Q -.08 1.20 -.22 2.42 L -.48 3.17 L -.27 3.27 Q .02 2.89 .14 2.48 Q .37 2.97 .73 3.14 L .81 2.97 Q .37 2.54 .31 2.04 Q .16 1.14 .32 .05 Z",
              "876042", INK, .051)
    art.line("M -.086 .27 Q .036 1.47 -.008 2.36", "b07d4f", .043)
    formations = ((-.87,2.61,.73,.49),(-.65,3.02,.94,.61),(.15,3.54,1.05,.73),
                  (.97,3.22,.95,.62),(.90,2.68,1.06,.54),(.12,2.76,1.02,.72))
    for cx, cy, rx, ry in formations:
        art.oval(cx, cy, rx, ry, "748357", "657650", .036)
    for cx, cy, rx, ry in formations:
        art.oval(cx-.04, cy+.18, rx*.77, ry*.58, "8d9a63")
    for cx, cy in ((-.57,2.79),(-.69,3.06),(.14,3.18),(.67,3.01),(.97,2.63),(-.07,3.73)):
        art.oval(cx, cy, .081, .076, "d28d51")
        art.oval(cx-.022, cy+.022, .026, .017, "efb76b")
    art.finish()


def grasses(art, seed, xlim, ylim, color):
    rng = random.Random(seed)
    for i in range(33):
        x = rng.uniform(*xlim)
        y = rng.uniform(*ylim)
        radius = rng.uniform(.06,.17)
        art.line([(x-radius,y+.085),(x,y),(x+.089,y+.14)], color, .024)
        if i % 5 == 0:
            art.oval(x+.08,y+.145,.055,.034,"dfba6f")


def village(coll):
    sky(coll, sunrise=(-4.7, 2.64))
    art = Art("Satul de pe deal", coll, z=-4.8)
    for x,y,s in ((-5.95,-.97,.83),(-3.79,-.59,.61),(-2.0,-.61,.58),
                  (.72,-1.05,.61),(-7.62,-1.04,.75)):
        house(art,x,y,s)
    art.finish()
    art = Art("Biserică în depărtare", coll,(-.62,.22),(.72,.72),z=-5.2)
    art.shape("M -.69 -.36 L -.68 .52 L -.23 .53 L -.23 .85 L .25 .83 L .26 .47 L .80 .38 L .85 -.31 Z",
              "eddab0","9a8264",.038)
    art.shape("M -.34 .795 L .025 1.27 L .37 .798 Z","7f6061","6b544d",.036)
    art.shape("M .249 .49 L .542 .69 L .908 .387 L .389 .328 Z","987273","785b52",.030)
    art.line([(.019,1.22),(.019,1.53)],"745754",.044)
    art.line([(-.098,1.408),(.134,1.408)],"745754",.035)
    art.rect(-.055,.2,.11,.59,"8f8370")
    art.finish()
    tree(coll,6.71,-3.6,1.36,True)
    tree(coll,-7.87,-4.0,.84,True)
    art=Art("Iarbă și flori de câmp",coll,z=-.9)
    grasses(art,12,(-7.85,-3.75),(-4.08,-2.23),"829059")
    grasses(art,48,(5.35,8.2),(-4.12,-1.33),"879862")
    art.finish()


def fence(coll, y=-2.22):
    art=Art("Gard de lemn",coll,z=-3.17)
    for offset,line in ((.13,"8b674a"),(.58,"a47b53"),(.94,"94704e")):
        art.shape(f"M -9 {y+offset} Q -2.5 {y+offset+.07} 8.7 {y+offset-.12} L 8.7 {y+offset+.02} Q -2.8 {y+offset+.24} -9 {y+offset+.11} Z",
                  line,"78573d",.035)
        art.line(f"M -8.9 {y+offset+.06} Q -1 {y+offset+.17} 8.61 {y+offset-.035}", "bf9768", .031)
    for i in range(-9,10):
        x=i*.92
        art.shape(f"M {x-.13} {y-.44} L {x-.12} {y+1.05} L {x+.006} {y+1.182} L {x+.149} {y+1.073} L {x+.136} {y-.41} Z",
                  "a58054" if i%2 else "aa855c","74543b",.030)
        art.line([(x-.051,y-.30),(x-.025,y+1.011)],"c19c68",.023)
        art.oval(x+.021,y+.77,.037,.038,"705740")
    art.finish()


def farmyard(coll):
    sky(coll, sunrise=(4.41, 2.10), yard=True)
    tree(coll,6.7,-2.80,.95)
    fence(coll)
    art=Art("Șura cu acoperiș de paie",coll,z=-2.87)
    house(art, -6.12,-2.15,2.01,True)
    art.finish()
    art=Art("Curte bătătorită",coll,z=-2.7)
    art.shape("M -10 -3.20 Q -5.44 -2.80 -2.25 -2.86 Q .92 -2.76 5.73 -2.97 L 10 -3.24 L 10 -6.2 L -10 -6.2 Z",
              "c4a474")
    art.line("M -5.5 -3.04 Q -2.2 -3.03 -.61 -3.19 Q .49 -3.33 3.94 -3.22","ceb087",.038)
    grasses(art,18,(-8.2,8.3),(-4.46,-3.15),"a0965f")
    art.finish()


def trough(coll):
    origin = (-1.73,-2.80)
    shadow = Art("Umbră sub troacă",coll,origin,z=-.29)
    shadow.oval(.08,-.52,1.35,.19,"ac926e")
    shadow.finish()

    # The back and the feed are behind the muzzle. Only the near rim
    # and planks cover the lower edge of the muzzle when it dips.
    back = Art("Troacă · interior și tărâțe",coll,origin,z=.046)
    back.shape("M -1.24 .01 L -.94 .28 L 1.01 .30 L 1.25 .06 Q -.07 -.08 -1.24 .01 Z",
               "b28757",INK,.045)
    back.shape("M -.98 .052 L -.82 .225 L .84 .23 L 1.01 .065 Q .12 -.022 -.98 .052 Z",
               "79553b")
    back.shape("M -.83 .052 L -.67 .151 Q .02 .196 .77 .155 L .96 .065 Q .17 -.008 -.83 .052 Z",
               "d6a86b")
    for i in range(18):
        x = -.74+i*.09
        back.oval(x,.090+.035*cos(i*2.8),.026,.014,"edc487")
    back.finish()

    front = Art("Troacă · muchie și perete din față",coll,origin,z=.326)
    front.shape("M -1.24 .01 Q -.08 -.068 1.25 .06 L .97 -.47 Q .16 -.59 -.99 -.48 Z",
                "916344",INK,.050)
    front.line("M -1.23 -.006 Q -.05 -.097 1.223 .038","c59b64",.074)
    front.line("M -1.12 -.151 Q .15 -.256 1.108 -.103","c09560",.033)
    front.line("M -.96 -.364 Q .12 -.433 .995 -.349","6c4834",.033)
    front.finish()


def pig(coll):
    root=empty("Grăsuțu · corp",coll)
    legs=[]
    for i,x in enumerate((-.80,.41,-.49,.68)):
        joint=empty(f"Grăsuțu · picior {i+1}",coll,(x,.59,.002*i),root)
        art=Art("Picior și copită",coll,z=-.12 if i<2 else .094)
        art.shape("M -.15 .08 Q -.22 -.13 -.182 -.30 L -.15 -.57 Q .01 -.63 .185 -.558 L .193 -.36 Q .11 -.21 .16 .07 Z",
                  "cd8a7b" if i<2 else "e5a18e","67443a",.040)
        art.shape("M -.145 -.454 Q .019 -.49 .171 -.450 L .173 -.585 Q -.016 -.626 -.153 -.551 Z",
                  "875f55","69463f",.030)
        art.line([(0,-.492),(.01,-.57)],"6b4842",.026)
        place(art,joint)
        legs.append(joint)
    art=Art("Grăsuțu · trunchi",coll,z=.03)
    art.oval(-.23,.803,1.08,.60,"e9a995","714b41",.057)
    art.shape("M -1.263 .712 Q -.935 .329 -.311 .419 Q .10 .359 .713 .732 Q .686 .281 -.092 .245 Q -.949 .233 -1.263 .712 Z","d89080")
    art.shape("M -.963 1.101 Q -.64 1.425 -.055 1.322 Q -.298 1.20 -.615 1.14 Q -.752 1.105 -.963 1.101 Z","f4bb9f")
    place(art,root)
    tail=empty("Grăsuțu · coadă",coll,(-1.18,.88,-.02),root)
    art=Art("Codiță",coll)
    art.line("M .06 -.02 Q -.35 -.03 -.39 .17 Q -.408 .336 -.25 .34 Q -.108 .319 -.181 .222","80514a",.087)
    art.line("M .039 .005 Q -.312 .024 -.346 .192 Q -.348 .314 -.243 .305 Q -.160 .293 -.194 .240","eaaa94",.042)
    place(art,tail)
    head=empty("Grăsuțu · cap",coll,(.56,.887,.185),root)
    art=Art("Chipul lui Grăsuțu",coll)
    art.shape("M -.28 -.235 Q -.617 .023 -.476 .452 Q -.456 .619 -.626 .82 Q -.459 .866 -.217 .653 Q -.059 .683 .113 .626 Q .377 .761 .592 .665 Q .656 .523 .472 .363 Q .625 .305 .748 .219 Q .96 .200 .979 .019 Q .972 -.186 .697 -.275 Q .379 -.512 -.006 -.386 Q -.178 -.356 -.28 -.235 Z",
              "f3b39c","754b42",.055)
    art.shape("M -.589 .797 Q -.398 .770 -.258 .618 Q -.414 .645 -.475 .591 Z","d89487")
    art.shape("M .183 .597 Q .353 .699 .54 .655 Q .497 .519 .374 .456 Z","d99085")
    art.oval(.707,-.018,.263,.165,"e79988","a36458",.028,angle=.12)
    art.oval(.779,.002,.048,.063,"87574d",angle=.3)
    art.oval(.627,-.027,.037,.051,"985e51",angle=.31)
    art.oval(.329,-.162,.114,.058,"e99889",angle=-.12)
    art.line("M .27 -.278 Q .46 -.310 .57 -.227","92594d",.032)
    place(art,head)
    art=Art("Grăsuțu · ochi deschis",coll,z=.026)
    art.oval(.364,.225,.125,.133,"fff1d7","7f554a",.032)
    art.oval(.394,.218,.062,.089,"5b4139")
    art.oval(.370,.251,.025,.029,"fff7eb")
    open_eye=place(art,head)
    art=Art("Grăsuțu · ochi închis",coll,z=.026)
    art.line("M .245 .214 Q .363 .132 .477 .218","72483e",.033)
    shut_eye=place(art,head)
    art=Art("Grăsuțu · gură căscată",coll,z=.039)
    art.oval(.498,-.284,.128,.097,"8a5148","a36a58",.022,angle=.10)
    art.oval(.521,-.325,.070,.035,"ce7f74")
    jaw=place(art,head)
    chew=empty("Grăsuțu · mestecat",coll,(.49,-.284,.044),head)
    art=Art("Grăsuțu · gură la troacă",coll)
    art.oval(0,0,.107,.057,"8e554a",angle=.13)
    bite=place(art,chew)
    return {"root":root,"head":head,"tail":tail,"open":open_eye,"shut":shut_eye,
            "jaw":jaw,"chew":chew,"bite":bite,"legs":legs}


def rooster(coll):
    root=empty("Cocoș · corp",coll)
    art=Art("Cocoș · coadă și aripi",coll,z=.04)
    for y in (.18,.33,.50):
        art.shape(f"M -.18 .43 Q -.68 {y+.75} -1.12 {y+.53} Q -.98 {y+.94} -.59 {y+.78} Q -.28 {y+.69} -.12 .57 Z",
                  "56736d","405954",.042)
    art.oval(-.129,.514,.535,.392,"c98948","6c4935",.047)
    art.shape("M -.583 .684 Q -.279 .908 -.072 .747 Q .076 .650 -.119 .489 Q -.338 .376 -.523 .508 Z",
              "e0a85f","a16a41",.031)
    art.line("M -.47 .693 Q -.27 .642 -.165 .538","b47543",.035)
    for x in (-.24,.014):
        art.line([(x,.255),(x-.025,-.048),(x+.145,-.08)],"986337",.052)
        art.line([(x-.025,-.048),(x-.151,-.101)],"996337",.029)
    place(art,root)
    head=empty("Cocoș · gât și cap",coll,(.16,.60,.068),root)
    art=Art("Cocoș · creastă și cioc",coll)
    art.shape("M -.151 -.216 Q -.177 .054 -.094 .315 Q -.078 .507 .123 .530 Q .415 .489 .363 .235 Q .278 .145 .233 .024 Q .263 -.074 .205 -.259 Q -.009 -.318 -.151 -.216 Z",
              "edb35d","73503b",.048)
    art.shape("M -.032 .465 Q -.126 .655 .005 .673 Q .047 .687 .093 .578 Q .112 .764 .196 .717 Q .254 .699 .244 .566 Q .307 .675 .363 .620 Q .384 .572 .287 .479 Z",
              "ba5141","834235",.034)
    art.shape("M .189 .226 Q .371 .248 .388 .097 Q .401 -.018 .325 -.028 Q .232 .006 .291 .151 Z",
              "ba5141","97473c",.026)
    art.shape("M .315 .391 L .604 .305 L .326 .251 Z","f3be68","9c6737",.033)
    art.oval(.242,.388,.060,.067,"fbefcf","905e39",.019)
    art.oval(.259,.393,.026,.039,"49392d")
    art.line("M -.021 .267 Q .123 .226 .193 .163","d28e4a",.029)
    place(art,head)
    beak=Art("Cocoș · cioc deschis",coll,z=.08)
    beak.shape("M .322 .292 L .587 .196 L .317 .208 Z","e6a150","925833",.029)
    return {"root":root,"head":head,"beak":place(beak,head)}


def bedroom(coll):
    art = Art("Dormitor · tencuială caldă",coll,z=-6.1)
    art.rect(-11,-6,11,6,"c59579")
    art.shape("M -10 4.81 Q -2 4.62 9.75 4.94 L 9.12 -2.90 Q 2.98 -2.19 -1.27 -1.55 Q -5.6 -1.80 -9.7 -2.17 Z","e4b78a")
    art.shape("M -10 -.92 Q -2.39 -1.12 2.84 -.64 Q 7.54 -.36 10 -.49 L 10 -6 L -10 -6 Z","ca9875")
    art.rect(-11,-6,11,-3.30,"986c55")
    plank(art,-11,3.95,11,4.76,"8e6047",False,18)
    plank(art,-11,-3.46,11,-3.07,"a27052",False,12)
    for x in (-7.43,7.21):
        plank(art,x-.24,-3.13,x+.28,4.03,"95654b",True,24)
    art.finish()
    art=Art("Fereastră de dimineață",coll,(-4.17,.63),(1,1),z=-4.9)
    art.rect(-1.63,-1.26,1.67,1.50,"9f6a47",INK,.056)
    art.rect(-1.40,-1.03,1.43,1.27,"93bfc4","704d3a",.041)
    art.oval(.62,.69,.341,.359,"fee0a0")
    art.shape("M -1.42 -.14 Q -.63 .389 -.16 .194 Q .63 -.036 1.45 .387 L 1.45 -1.03 L -1.42 -1.03 Z","8ba692")
    art.shape("M -1.39 -.49 Q -.74 -.18 .025 -.39 Q .82 -.63 1.43 -.15 L 1.43 -1.019 L -1.39 -1.019 Z","a4aa73")
    art.rect(-.09,-1.06,.075,1.32,"906147","70513f",.031)
    art.rect(-1.42,.029,1.43,.163,"916348","6e4b39",.032)
    art.shape("M -1.71 -1.08 L 1.72 -1.07 L 1.89 -1.30 L -1.85 -1.31 Z","ae7951",INK,.045)
    art.line([(-1.63,-1.209),(1.69,-1.209)],"cc9764",.050)
    art.finish()
    art=Art("Perdele din pânză",coll,(-4.18,.63),(1,1),z=-4.65)
    for sign in (-1,1):
        art.scale=(sign,1)
        art.shape("M .920 1.44 Q 1.13 1.51 1.36 1.44 L 1.73 1.49 L 1.64 -1.12 Q 1.25 -1.22 .959 -1.046 Q 1.105 -.47 1.024 .141 Q .922 .69 .920 1.44 Z","f5ddb1","98684f",.037)
        art.shape("M 1.234 1.45 Q 1.34 .457 1.29 .004 Q 1.26 -.47 1.21 -1.115 L 1.357 -1.155 Q 1.48 -.28 1.419 .236 Q 1.44 .922 1.40 1.456 Z","e4be90")
        for y in (.94,-.73):
            art.line([(1.03,y),(1.64,y)],"ac5e49",.027)
            for x in (1.145,1.34,1.52):
                textile(art,x,y+.11,.49)
    art.finish()
    art=Art("Pat de lemn și pernă",coll,z=-.38)
    art.shape("M -1.53 -3.61 L -1.28 -1.04 Q -.46 -.26 .87 -.52 Q 2.18 -.57 3.05 -.93 Q 4.61 -.86 5.91 -1.38 L 5.67 -3.55 Z",
              "a56f4e", INK,.055)
    art.line("M -1.22 -2.27 L -1.12 -1.14 Q -.39 -.49 .88 -.67 Q 2.03 -.67 3.09 -1.07 Q 4.47 -.97 5.73 -1.40","c9925e",.063)
    art.shape("M -.97 -1.49 Q -.56 -.96 .41 -.89 Q 1.44 -.83 2.28 -1.089 Q 2.71 -1.362 2.42 -1.76 Q 1.55 -1.98 .89 -1.896 Q -.52 -1.996 -.97 -1.49 Z",
              "f5dcad","a87d59",.043)
    art.line("M -.78 -1.55 Q .235 -1.88 1.723 -1.738 Q 2.15 -1.70 2.363 -1.55","e3be8e",.052)
    art.finish()
    art=Art("Plapumă țesută",coll,z=.81)
    art.shape("M -1.21 -1.79 Q .04 -1.56 1.34 -1.68 Q 2.98 -1.90 4.14 -1.58 L 5.88 -1.65 L 5.65 -3.34 Q 4.26 -3.68 2.92 -3.57 Q 1.54 -3.40 .44 -3.67 Q -.64 -3.72 -1.28 -3.35 Z",
              "8a9c86","624f45",.062)
    art.shape("M -1.23 -2.11 Q .11 -1.88 1.65 -2.06 Q 2.62 -2.19 3.81 -1.92 Q 4.92 -1.81 5.83 -2.02 L 5.65 -3.34 Q 4.43 -3.58 3.12 -3.57 Q 1.09 -3.44 .50 -3.66 Q -.70 -3.72 -1.26 -3.34 Z","758977")
    art.line("M -1.21 -1.89 Q .09 -1.66 1.42 -1.79 Q 2.99 -1.99 4.03 -1.70 Q 5.03 -1.62 5.74 -1.74","d0b886",.073)
    for y in (-2.35,-2.73,-3.09):
        art.line([(-1.16,y),(5.65,y+.045)],"a0a47f",.035)
        for i in range(18):
            x=-1.01+i*.378
            textile(art,x,y+.060,.72,True)
    art.finish()
    art=Art("Covor și ulcior mic",coll,z=-.21)
    art.oval(-2.56,-4.14,2.82,.195,"b58163")
    art.line([(-5.2,-4.15),(.05,-4.147)],"d1a17d",.036)
    art.shape("M -6.21 -2.92 L -5.22 -2.92 L -5.14 -3.39 L -6.26 -3.40 Z","9d6c4d",INK,.042)
    art.oval(-5.72,-2.55,.34,.37,"ac694f",INK,.036)
    art.oval(-5.72,-2.186,.23,.083,"c68458",INK,.035)
    art.line("M -5.973 -2.60 Q -5.739 -2.686 -5.455 -2.564","e3aa6a",.036)
    art.finish()


def kitchen(coll):
    walls(coll)
    bpy.data.objects.remove(coll.objects["Chairs and lower wall"], do_unlink=True)
    window(coll)
    icon_corner(coll)
    art=Art("Bucătărie · podea și laviță",coll,z=-3.84)
    art.rect(-11,-5.6,11,-2.55,"9b674b")
    art.rect(-11,-2.55,11,-2.38,"ae7854")
    art.line([(-11,-2.57),(11,-2.57)],"734835",.045)
    art.line([(-11,-3.44),(11,-3.44)],"88583d",.045)
    plank(art,2.05,-2.78,5.18,-2.39,"986543",False,33)
    art.finish()
    art=Art("Prag · lumină din ogradă",coll,(5.83,-.24),(1,1),z=-3.12)
    art.shape("M -1.63 -3.12 L -1.60 2.48 L 1.64 2.48 L 1.62 -3.13 Z","86563d",INK,.069)
    art.rect(-1.36,-3.12,1.39,2.26,"e5c391","684936",.056)
    art.rect(-1.25,-2.62,1.27,2.13,"a4bdad")
    art.oval(.63,1.15,.32,.35,"ead796")
    art.shape("M -1.25 -.56 Q -.31 -.17 .25 -.37 Q 1.12 -.22 1.25 .095 L 1.28 -2.63 L -1.25 -2.63 Z","869971")
    art.shape("M .07 2.092 L 1.33 2.112 L 1.36 -2.76 L .64 -2.48 Z","c59d6a")
    art.line("M .09 2.03 L .661 -2.51","926441",.050)
    art.line("M .447 2.03 L .945 -2.60","ad8157",.040)
    art.rect(-1.59,-3.01,1.61,-2.80,"b27950","755039",.047)
    art.finish()
    art=Art("Cuptor zidit",coll,(-5.33,-1.34),(1,1),z=-.4)
    art.shape("M -1.76 -1.94 L -1.71 .63 Q -1.59 1.34 -.98 1.56 Q -.15 1.84 .60 1.57 Q 1.54 1.38 1.68 .643 L 1.68 -1.94 Q .41 -2.18 -1.76 -1.94 Z","f1d0a0","895941",.067)
    art.shape("M -1.68 -1.91 L -1.67 .547 Q -1.53 1.19 -.92 1.40 Q -1.34 .81 -1.31 -.55 L -1.26 -1.99 Z","d8a67d")
    art.shape("M -.989 -.359 L -.898 .335 Q -.800 .725 -.469 .841 Q .087 1.043 .493 .759 Q .752 .569 .751 .235 L .783 -.359 Z","b67853","a36747",.056)
    art.shape("M -.811 -.347 L -.737 .281 Q -.695 .526 -.443 .660 Q .047 .859 .391 .611 Q .594 .465 .589 .185 L .616 -.343 Z","6e443c","87503a",.039)
    art.shape("M -.77 -.337 Q -.44 -.167 .022 -.273 Q .387 -.174 .579 -.337 Z","c7774b")
    art.line("M -.644 -.26 Q -.257 -.359 .427 -.253","e6a065",.042)
    art.shape("M -1.44 -.404 L 1.18 -.414 L 1.19 -.594 L -1.46 -.579 Z","ac7853","88583f",.038)
    art.line([(-1.38,-.476),(1.106,-.481)],"ce9b68",.044)
    art.line("M -1.41 -1.419 Q -.14 -1.52 1.44 -1.427","d29d74",.040)
    art.finish()
    art=Art("Jar în cuptor",coll,(-5.33,-1.34),(1,1),z=-.28)
    art.shape("M -.542 -.321 Q -.679 -.045 -.393 .084 Q -.355 .163 -.375 .328 Q -.179 .228 -.198 .029 Q -.032 .140 -.019 .413 Q .234 .296 .202 .002 Q .305 .041 .347 .122 Q .474 -.069 .362 -.307 Z","e9904e")
    art.shape("M -.407 -.310 Q -.450 -.124 -.280 -.053 Q -.179 -.095 -.140 .096 Q .014 -.010 .027 -.118 Q .165 -.009 .204 .046 Q .295 -.111 .222 -.310 Z","ffc779")
    flame=art.finish()
    tabletop=collection("Masă și ștergar",coll)
    table(tabletop)
    for obj in tabletop.objects:
        obj.scale.x=.72
        obj.location.x=-1.85
    goods=collection("Pâine și vase",coll)
    meal(goods)
    loaf=empty("Pâine pe taler",goods)
    for obj in list(goods.objects):
        if obj.name.startswith(("Round scored bread","Woven loaf platter")):
            obj.parent=loaf
            obj.scale=(.76,.76,1)
            obj.location=(0,2.94*.76,0)
        elif obj.name.startswith("Painted pitcher"):
            obj.location=(-.46,.06,0)
        elif obj!=loaf:
            bpy.data.objects.remove(obj,do_unlink=True)
    art=Art("Două traiste lângă laviță",coll,z=.51)
    for x,y,s in ((3.86,-2.42,.67),(4.49,-2.43,.72)):
        art.origin=(x,y)
        art.scale=(s,s)
        art.line("M -.26 .16 Q -.19 .93 .354 .762 Q .526 .482 .278 .239","856349",.066)
        art.shape("M -.55 -.50 L -.47 .24 Q .01 .35 .461 .204 L .555 -.467 Q .062 -.636 -.55 -.50 Z","dbc095",INK,.049)
        art.shape("M -.472 .201 L .441 .183 L .365 -.135 Q .09 -.198 -.389 -.130 Z","f0d6a9","ad7956",.039)
        textile(art,.02,-.052,.98)
    art.finish()
    return loaf,flame


def steam_art(coll, name):
    root=empty(name,coll)
    art=Art(name+" · abur",coll)
    for x,y,s in ((-.55,0,1),(-.025,.075,1.20),(.51,-.035,.82)):
        art.origin=(x,y)
        art.scale=(s,s)
        art.shape("M -.041 0 Q .172 .197 .019 .389 Q -.137 .595 .068 .819 Q .013 .594 .135 .401 Q .293 .140 -.041 0 Z",
                  "f9dfaa")
        art.line("M .076 .316 Q .016 .492 .082 .573","fff0c2",.028)
    place(art,root)
    return root
