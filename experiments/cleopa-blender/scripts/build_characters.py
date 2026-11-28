"""Original editable cut-out artwork and character-specific proportions."""
from math import sin, cos
import bpy

from build_rigs import armature, bind, marker
from vector_art import Art, collection

INK = '462921'
DETAIL = '985441'
CREAM = 'fff0d0'
SHADE = 'e7c396'
RED = 'ad4033'
GOLD = 'd79038'

BASE = dict(skin='f5b181', skin_shadow='e69367', blush='e78b69', eyes='73462e',
            hair='62341f', hair_light='8b522d', hair_dark='42251c', vest='6b422b',
            vest_light='955d38', vest_dark='492d25', shirt=CREAM, shade=SHADE,
            mouth='7c372d', look=1, head_w=.79, head_h=.80, body=.59,
            shoulder_x=.63, shoulder_y=1.42, head_y=2.17, upper=.80, lower=.84,
            hand=.33, leg=1.48)
DESIGNS = {
    'cleopa': dict(label='Constantin (Cleopa)', hair='e8a337', hair_light='ffcc5b',
                   hair_dark='ad632a', eyes='438ed0', vest='8a4e31', vest_light='ad6d42',
                   vest_dark='5d3328', head_w=.755, head_h=.78, shoulder_x=.53,
                   shoulder_y=1.26, head_y=1.99, body=.495, upper=.72, lower=.83,
                   hand=.31, leg=1.25, look=-1, freckles=True),
    'father': dict(label='Tatăl', hair='46291d', hair_light='6b4027', hair_dark='31201b',
                   vest='705037', vest_light='957249', vest_dark='4d3327', moustache=True,
                   head_w=.89, head_h=.89, head_y=2.48, shoulder_x=.76, shoulder_y=1.68,
                   body=.70, upper=.95, lower=1.04, hand=.39, leg=1.72),
    'brother_01': dict(label='Fratele mai mare I', hair='472a23', hair_light='6d4031',
                       hair_dark='32201e', vest='5d4039', vest_light='815951',
                       vest_dark='43302f', eyes='547b70', head_w=.76, head_h=.79,
                       head_y=2.18, upper=.82, lower=.91, look=1),
    'brother_02': dict(label='Fratele mai mare II', hair='864723', hair_light='b76e37',
                       hair_dark='613524', vest='825334', vest_light='aa7543',
                       vest_dark='5d3828', eyes='8c5530', head_w=.77, head_h=.81,
                       head_y=2.24, shoulder_x=.66, shoulder_y=1.50, upper=.85,
                       lower=.92, look=1, freckles=True),
    'mother': dict(label='Mama', hair='513029', hair_light='784738', hair_dark='382525',
                   eyes='81512f', vest='78433b', vest_light='ac6552', vest_dark='4f3030',
                   scarf=True, head_w=.80, head_h=.865, head_y=2.45, shoulder_x=.65,
                   shoulder_y=1.59, body=.56, upper=.87, lower=.98, hand=.345, leg=1.64, look=-1),
    'priest': dict(label='Preotul satului', hair='aca19d', hair_light='d6c6b7',
                   hair_dark='7b6c6c', eyes='705249', vest='38313a', vest_light='514452',
                   vest_dark='28242e', shirt='493d4a', shade='332a36', beard=True,
                   head_w=.83, head_h=.865, head_y=2.52, shoulder_x=.80, shoulder_y=1.66,
                   body=.73, upper=.94, lower=1.08, hand=.385, leg=1.72, look=-1),
}


def profile(name):
    return dict(BASE, **DESIGNS[name], id=name)


def attach(art, rig, bone):
    item = art.finish()
    bind(item, rig, bone)
    return item


def embroidery(art, x, y, s=1):
    art.diamond(x, y, .048*s, .055*s, RED)
    art.diamond(x, y, .021*s, .025*s, CREAM)
    art.diamond(x-.058*s, y, .021*s, .022*s, '665144')
    art.diamond(x+.058*s, y, .021*s, .022*s, '665144')


def legs(p, rig, coll):
    edge = INK
    for side, sign in (('R', -1), ('L', 1)):
        hip = sign*p['body']*.48
        length = p['leg']
        a = Art('Trouser · '+side, coll, (hip, 0), (p['body']/.59, length), z=-.05)
        a.shape('M -.204 .10 Q .01 .16 .205 .09 Q .192 -.23 .160 -.51 Q .16 -.63 .03 -.64 Q -.155 -.64 -.168 -.55 Z',
                p['shirt'], edge)
        a.shape('M -.164 -.46 Q -.04 -.55 .154 -.50 L .143 -.575 Q .03 -.615 -.154 -.559 Z', p['shade'])
        attach(a, rig, 'thigh.'+side)
        a = Art('Linen wraps · '+side, coll, (hip, -length*.55), (p['body']/.59*.83, length), z=-.03)
        a.shape('M -.198 .02 Q 0 -.02 .18 .015 L .15 -.455 Q 0 -.49 -.155 -.446 Z',
                CREAM if not p.get('beard') else p['shade'], edge)
        for k in range(3):
            y = -.10-k*.12
            a.line([(-.145,y+.046),(.146,y-.049)], '896148', .023)
            a.line([(.145,y+.049),(-.145,y-.047)], 'aa7a55', .023)
        attach(a, rig, 'shin.'+side)
        a = Art('Leather shoe · '+side, coll, (hip, -length), (sign, 1), z=.01)
        a.shape('M -.18 .08 Q .02 .14 .18 .055 Q .44 .022 .42 -.175 Q .37 -.23 -.16 -.21 Q -.23 -.18 -.18 .08 Z',
                '5e392b', edge, .033)
        a.line('M -.14 -.155 Q .10 -.188 .375 -.154', 'a47046', .027)
        attach(a, rig, 'foot.'+side)
    if p.get('scarf') or p.get('beard'):
        a = Art('Skirt' if p.get('scarf') else 'Cassock hem', coll, (0, 0), (p['body'], p['leg']), z=.06)
        a.shape('M -1 .18 Q 0 .30 1 .18 Q 1.14 -.47 1.30 -.91 Q 0 -1.08 -1.30 -.91 Z',
                p['vest_dark'], INK, .033)
        for x in (-.65, -.29, .40, .76):
            a.line([(x,.11),(x*1.27,-.89)], p['vest'], .024)
        if p.get('scarf'):
            for y in (-.67,-.77,-.86):
                a.line(f'M -1.17 {y} Q 0 {y-.13} 1.17 {y}', RED, .030)
                for k in range(-10, 11):
                    x = k*.104
                    a.diamond(x, y-.057+.051*x*x, .029,.026,GOLD if k%3 == 0 else RED)
        attach(a, rig, 'pelvis')


def outfit(p, rig, coll):
    sy = p.get('collar_y', p['shoulder_y'])
    shoulder = p['shoulder_x']
    b = p['body']
    waist = b if p.get('scarf') or p.get('beard') else b*.89
    a = Art('Lower tunic and waist', coll, (0, 0), (waist, 1), z=.065)
    a.shape('M -1.07 .57 Q 0 .65 1.07 .57 L 1.06 -.16 Q .05 -.25 -1.05 -.15 Z', p['shirt'], INK, .042)
    if not p.get('beard'):
        sash = 'a74f38' if p['id']=='cleopa' else p['vest_dark']
        a.shape('M -1.08 .55 Q 0 .49 1.08 .55 L 1.09 .29 Q -.02 .21 -1.09 .30 Z', sash, INK, .035)
        a.line('M -.92 .40 Q .03 .32 .94 .40', p['vest_light'], .027)
        if p['id']=='cleopa':
            a.shape('M .41 .43 L .85 .45 L .85 -.35 L .50 -.29 Z', sash, INK)
            for x in (.53,.62,.71,.80):
                a.line([(x,-.27),(x,-.36)], p['vest_dark'], .018)
        elif not p.get('scarf'):
            a.rect(-.19,.31,.16,.48,'9e784b',INK,.023)
            a.rect(-.115,.35,.08,.438,p['vest_dark'])
    attach(a, rig, 'pelvis')
    a = Art('Shirt and clothing panels', coll, (0, .52), (shoulder, sy-.52), z=.145)
    a.shape('M -.98 .81 Q -.78 .99 -.38 1.09 L .38 1.09 Q .78 .99 .98 .81 L .82 -.05 Q 0 -.12 -.82 -.05 Z',
            p['shirt'], INK, .036)
    if p.get('beard'):
        a.shape('M -.70 .95 L -.23 1.10 L .19 1.10 L .77 .94 L .62 -.08 L -.68 -.08 Z',
                p['vest_dark'])
        a.line('M 0 1.02 L .03 .04', p['vest_light'], .026)
        a.line('M -.42 .99 Q -.34 .68 .02 .43 Q .34 .71 .43 .99', 'd89c50', .032)
        a.shape('M -.052 .46 L .054 .46 L .054 .345 L .192 .345 L .192 .255 L .054 .255 L .054 .085 L -.052 .085 L -.052 .255 L -.183 .255 L -.183 .345 L -.052 .345 Z', 'eab458', INK, .025)
        a.line('M -.017 .42 L -.017 .12', 'ffdf91', .022)
    else:
        a.shape('M -.35 1.10 Q 0 1.02 .35 1.10 L .24 .86 Q 0 .80 -.25 .86 Z', 'fff7e4', INK, .026)
        a.line('M 0 .91 L 0 .23', 'c19873', .024)
        for x in (-.111,.111):
            for j in range(5):
                embroidery(a, x, .23+j*.123, .80)
        if not p.get('scarf'):
            for side in (-1, 1):
                a.scale = (shoulder*side, sy-.52)
                a.shape('M .34 1.095 Q .75 1.04 .94 .84 Q .78 .61 .83 .38 L .86 -.095 Q .56 -.18 .30 -.099 L .265 .67 Z',
                        p['vest'], INK, .048)
                a.shape('M .69 .94 Q .90 .89 .91 .81 Q .68 .44 .81 -.096 L .64 -.124 Q .51 .53 .69 .94 Z', p['vest_dark'])
                a.line('M .396 1.027 Q .337 .59 .376 .006 Q .535 -.031 .76 .007', p['vest_light'], .033)
                for j in range(5):
                    a.diamond(.381, .106+j*.145, .026,.030,GOLD if j%2==0 else p['vest_dark'])
            a.scale = (shoulder, sy-.52)
        else:
            for s in (-1,1):
                a.line([(s*.56,1.03),(s*.60,.07)], p['vest_dark'], .046)
                for j in range(5):
                    a.diamond(s*(.592-j*.006), .18+j*.151, .060,.053,RED)
    attach(a, rig, 'chest')
    a = Art('Neck', coll, (.047*p['look'], p['head_y']-.51), (.95,1), z=.26)
    a.shape('M -.29 .18 Q -.25 -.05 -.28 -.24 Q -.06 -.41 .28 -.23 L .24 .30 Z', p['skin_shadow'], INK, .032)
    a.shape('M -.19 .03 Q .025 -.14 .22 -.11 L .24 -.24 Q -.02 -.38 -.21 -.244 Z', p['skin'])
    attach(a, rig, 'neck')


def sleeves(p, rig, coll):
    variants = {}
    for side, sign in (('R', -1), ('L', 1)):
        x = sign*p['shoulder_x']
        y = p['shoulder_y']
        width = p['body']*.46
        z = .72 if side=='R' else .10
        if p.get('beard'):
            width *= 1.13
        a = Art('Upper sleeve · '+side, coll, (x, y), (width, p['upper']), z=z)
        a.shape('M -1.01 -.21 Q -1.06 .07 -.55 .15 Q .24 .29 .77 .06 Q 1.03 -.03 1.01 -.33 L .90 -.93 Q .80 -1.16 .04 -1.18 Q -.76 -1.17 -.89 -.95 Z',
                p['shirt'], INK, .065)
        a.shape('M -.99 -.28 Q -.80 -.60 -.73 -.99 Q -.28 -1.17 .41 -1.05 Q -.15 -1.22 -.79 -1.13 Q -.95 -1.02 -.99 -.28 Z', p['shade'])
        if p.get('scarf'):
            a.line('M -.78 -.32 Q .02 -.43 .75 -.31', RED, .038)
            for i in range(-2,3):
                embroidery(a, i*.32, -.47, 1.7)
        attach(a, rig, 'upper_arm.'+side)
        a = Art('Forearm sleeve · '+side, coll, (x, y-p['upper']), (width, p['lower']), z=z+.10)
        a.shape('M -.88 .088 Q .01 .23 .90 .095 Q 1.04 -.01 .93 -.31 L .64 -.945 Q .39 -1.045 -.45 -1.038 Q -.68 -.996 -.70 -.93 L -.94 -.23 Q -1.00 -.00 -.88 .088 Z',
                p['shirt'], INK, .058)
        a.shape('M -.81 -.20 Q -.55 -.23 -.46 -.50 L -.32 -.93 L -.63 -.961 Q -.77 -.60 -.81 -.20 Z', p['shade'])
        a.shape('M -.70 -.82 Q .01 -.87 .71 -.815 L .65 -.937 Q .50 -1.035 -.55 -1.024 L -.69 -.968 Z',
                p['vest_dark'] if p.get('beard') else 'f6dfb7', INK, .031)
        if not p.get('beard'):
            for j in range(-2,3):
                a.diamond(j*.245, -.929, .087,.036,RED)
        attach(a, rig, 'forearm.'+side)
        wrist = y-p['upper']-p['lower']
        for pose in ('rest','open','prayer','cross_fingers'):
            a = Art(pose+' hand · '+side, coll, (x, wrist), (p['hand']*sign,p['hand']),z=z+.21)
            draw_hand(a, p, pose)
            variants[side, pose] = attach(a, rig, 'hand.'+side)
    return variants


def draw_hand(a, p, pose):
    shapes = {
        'rest': 'M -.27 .16 Q .04 .31 .31 .15 Q .46 .02 .46 -.22 Q .65 -.35 .49 -.54 Q .43 -.62 .28 -.59 Q .22 -.85 -.01 -.86 Q -.35 -.88 -.51 -.64 Q -.55 -.22 -.27 .16 Z',
        'open': 'M -.24 .17 Q .02 .29 .29 .16 Q .45 .06 .39 -.30 Q .64 -.27 .65 -.46 Q .59 -.57 .40 -.58 Q .31 -.91 .00 -.99 Q -.28 -1.00 -.44 -.77 Q -.55 -.46 -.42 -.18 Z',
        'prayer': 'M -.26 .17 Q .02 .25 .25 .14 Q .43 -.02 .41 -.37 L .24 -.89 Q .16 -1.02 -.04 -.96 Q -.15 -.94 -.37 -.46 Q -.47 -.20 -.26 .17 Z',
        'cross_fingers': 'M -.27 .17 Q .08 .28 .30 .13 Q .53 -.15 .45 -.40 Q .42 -.55 .22 -.62 L .115 -.79 Q .115 -.99 0 -1.00 Q -.131 -1.00 -.17 -.82 L -.29 -.70 Q -.53 -.69 -.48 -.43 Q -.47 -.12 -.27 .17 Z',
    }
    a.shape(shapes[pose], p['skin'], INK, .069)
    if pose=='cross_fingers':
        a.shape('M -.37 -.23 Q -.43 -.55 -.24 -.59 Q -.16 -.64 -.13 -.82 Q -.095 -.93 -.014 -.96 Q -.155 -.96 -.21 -.79 L -.30 -.71 Q -.53 -.63 -.46 -.35 Z', p['skin_shadow'])
        a.line('M .34 -.25 Q .10 -.32 .20 -.60', DETAIL, .058)
        a.line('M -.28 -.44 Q -.09 -.46 -.07 -.62 Q -.08 -.72 -.19 -.69', DETAIL, .052)
        a.line('M .042 -.60 Q -.015 -.74 .008 -.90', 'ffe0af', .050)
    elif pose=='rest':
        a.line('M .29 -.32 Q .17 -.48 .27 -.60', DETAIL, .054)
        a.line('M -.05 -.62 Q -.11 -.77 .02 -.81', DETAIL, .047)
    else:
        a.line('M .19 -.44 Q .04 -.58 .04 -.81', DETAIL, .048)


HAIR = {
    'cleopa': 'M -.96 -.24 Q -1.20 -.06 -.99 .22 L -1.07 .18 Q -1.07 .46 -.81 .65 L -.91 .61 Q -.62 1.04 -.19 .99 Q .04 1.05 .13 1.18 Q .24 1.10 .16 .97 Q .51 1.08 .88 .79 Q 1.06 .70 1.09 .47 Q .99 .59 .81 .58 Q 1.04 .43 .94 .18 Q .78 .38 .59 .45 Q .70 .56 .54 .64 Q .33 .32 .04 .37 Q .17 .50 .21 .64 Q -.05 .33 -.39 .32 Q -.30 .42 -.30 .51 Q -.48 .23 -.70 .13 Q -.79 .01 -.76 -.27 L -.91 -.36 Z',
    'father': 'M -.96 -.21 Q -1.12 .04 -1.00 .34 L -1.11 .23 Q -1.10 .55 -.84 .72 L -.98 .68 Q -.81 .89 -.48 .88 Q -.13 1.15 .23 1.02 Q .48 1.06 .65 .89 Q .94 .87 .99 .59 Q 1.05 .43 .96 .20 Q .91 .49 .66 .60 Q .54 .85 .33 .76 Q .20 .64 .04 .62 L .11 .76 Q -.20 .52 -.54 .51 Q -.76 .44 -.76 .05 L -.83 -.28 Z',
    'brother_01': 'M -.96 -.23 Q -1.11 -.02 -.99 .22 L -1.10 .15 Q -1.14 .42 -.90 .61 L -1.06 .55 Q -.89 .82 -.61 .84 Q -.48 1.07 -.21 1.02 Q -.25 .93 -.33 .90 Q .13 1.04 .57 1.04 L .39 .92 Q .73 .94 .90 .72 Q 1.08 .57 .99 .29 Q .87 .47 .63 .52 Q .61 .69 .45 .74 Q .29 .53 .06 .53 L .13 .67 Q -.17 .45 -.49 .40 Q -.77 .29 -.77 -.19 L -.85 -.33 Z',
    'brother_02': 'M -.95 -.25 Q -1.08 -.04 -.96 .23 L -1.08 .13 Q -1.08 .47 -.85 .65 L -.93 .59 Q -.78 .85 -.54 .83 Q -.13 1.13 .43 1.05 Q .39 .98 .29 .94 Q .65 .99 .86 .78 Q 1.02 .69 .99 .46 L .89 .58 Q 1.04 .38 .91 .19 Q .86 .40 .64 .47 Q .61 .68 .43 .71 Q .26 .46 .08 .46 Q .17 .55 .17 .69 Q -.14 .47 -.55 .46 Q -.71 .37 -.78 .12 L -.79 -.29 Z',
    'mother': 'M -.94 -.39 Q -1.09 .05 -.90 .46 Q -.65 1.03 -.12 .98 Q .43 1.05 .79 .66 Q .99 .39 .92 .11 Q .82 .43 .53 .52 Q .29 .63 .08 .83 Q -.15 .52 -.51 .27 Q -.74 .13 -.75 -.29 Q -.76 -.49 -.94 -.39 Z',
}


def eyes(p, rig, coll, cx, cy):
    results = {}
    look = p['look']
    for mode in ('open', 'half', 'closed'):
        for side, ex in (('R',-.337),('L',.341)):
            x = ex + look*.080
            sx = 1.05 if ex*look < 0 else .90
            a = Art('Eye '+mode+' · '+side, coll, (cx+p['head_w']*x, cy+p['head_h']*.108),
                    (p['head_w']*sx,p['head_h']),z=.55)
            if mode=='closed':
                a.line('M -.190 .012 Q -.016 -.120 .158 -.012 Q .181 .007 .193 .028', '582f28', .042)
                a.line('M -.137 -.009 Q -.185 .013 -.209 .028', '582f28', .020)
            else:
                a.shape(('M -.192 .007 Q -.189 .246 .011 .240 Q .189 .226 .191 .014 Q .150 -.128 .013 -.133 Q -.117 -.122 -.192 .007 Z'
                         if mode=='open' else
                         'M -.192 .052 Q .003 .088 .191 .047 Q .147 -.103 .009 -.112 Q -.132 -.099 -.192 .052 Z'), 'fff6e4', '542e27', .027)
                offset = look*.039
                if mode=='open':
                    a.oval(offset, .045, .125, .167, p['eyes'], '4e3a31', .014)
                    a.oval(offset+look*.007,.061,.073,.112,'251f24')
                    a.oval(offset-.044,.114,.042,.044,'fff8ef')
                    a.oval(offset+.047,-.011,.020,.023,'e7d4ba')
                    a.line('M -.191 .021 Q -.186 .229 -.012 .242 Q .096 .248 .159 .145', '4c2824', .034)
                else:
                    a.shape(f'M {offset-.105} .056 L {offset+.112} .051 Q {offset+.102} -.095 {offset} -.101 Q {offset-.093} -.083 {offset-.105} .056 Z',p['eyes'])
                    a.oval(offset,.009,.047,.055,'2d2324')
                    a.oval(offset-.027,.034,.019,.019,'fff8ef')
                    a.line('M -.190 .052 Q -.017 .084 .189 .047', '552f29', .036)
            results[mode,side] = attach(a,rig,'head')
    return results


def expressions(p, rig, coll, cx, cy):
    results = {}
    cy -= (.416 if not (p.get('beard') or p.get('moustache')) else .49)*p['head_h']
    if p.get('beard'):
        cy -= .025
    for pose in ('rest','A','E_I','O_U','M_B_P','F_V','L','smile'):
        a=Art('Mouth '+pose,coll,(cx+p['look']*.11,cy),(p['head_w']*.94,p['head_h']*.92),z=.62)
        if pose in ('rest','M_B_P','F_V'):
            a.line('M -.130 .019 Q .015 -.057 .159 .036' if pose=='rest' else
                   'M -.112 -.002 Q .011 -.032 .134 .006', p['mouth'], .027)
            if pose=='F_V':
                a.line('M -.053 .004 L .063 .010','fff0dc',.021)
        else:
            dims={'A':(.136,.121),'E_I':(.164,.055),'O_U':(.080,.098),
                  'L':(.113,.073),'smile':(.190,.097)}
            w,h=dims[pose]
            a.shape(f'M {-w} {h*.36} Q 0 {h*.88} {w} {h*.53} Q {w*.66} {-h*1.51} 0 {-h*1.01} Q {-w*.74} {-h*.85} {-w} {h*.36} Z','74392e', '6f3d32', .017)
            if pose in ('E_I','L','smile'):
                a.line([(-w*.63,h*.35),(w*.62,h*.47)],'fff0db',.032)
            a.oval(w*.07,-h*.565,w*.47,h*.24,'cf7666')
        results[pose]=attach(a,rig,'head')
    return results


def portrait(p, rig, coll):
    cx, cy = p['look']*.049, p['head_y']
    look, w, h = p['look'], p['head_w'], p['head_h']

    def layer(name, z):
        return Art(name, coll, (cx,cy), (w*look,h), z=z)

    a = layer('Hair silhouette', .30)
    if p.get('scarf'):
        a.shape('M -.70 .56 Q -1.10 .14 -1.05 -.60 L -1.32 -.91 Q -.98 -.99 -.72 -.85 Q -.77 -1.01 -.45 -1.01 Q -.17 -.84 -.27 -.66 L .59 -.59 Q .85 -.25 .75 .39 Z',
                p['hair_dark'], INK, .041)
        a.shape('M -.94 .62 Q -1.02 .02 -1.39 -.50 Q -1.45 -.67 -1.29 -.74 Q -.85 -.77 -.78 -.57 Q -.62 -.14 -.40 .03 Z',
                'd6ad84', INK, .036)
    elif p.get('beard'):
        a.shape('M -.95 .40 Q -1.15 .11 -.93 -.28 L -.91 -.49 L -.66 -.49 Q -.42 -.67 -.30 -.45 L .69 -.45 Q .92 -.40 .96 -.09 Q 1.03 .19 .88 .48 Z',
                p['hair_dark'], INK, .048)
    else:
        a.shape('M -.95 .17 Q -1.10 -.39 -.72 -.53 Q -.61 -.68 -.42 -.64 Q -.28 -.77 -.02 -.69 L .53 -.50 Q .91 -.54 .93 -.13 L .77 .48 Z',
                p['hair_dark'], INK, .039)
    attach(a, rig,'head')
    a=layer('Face', .41)
    a.shape('M -.78 .41 Q -.69 .83 -.19 .87 Q .25 .95 .60 .71 Q .85 .57 .85 .27 Q .83 .05 .95 -.16 Q .96 -.46 .69 -.65 Q .39 -.87 .06 -.83 Q -.40 -.85 -.63 -.62 Q -.87 -.40 -.78 .41 Z',
            p['skin'], INK, .043)
    a.shape('M -.76 .33 Q -.75 -.01 -.63 -.32 Q -.48 -.72 -.10 -.79 Q -.43 -.84 -.68 -.59 Q -.84 -.40 -.81 -.04 Z',p['skin_shadow'])
    a.shape('M .47 -.61 Q .67 -.58 .80 -.43 Q .70 -.67 .45 -.74 Q .17 -.84 -.04 -.79 Q .25 -.76 .47 -.61 Z',p['skin_shadow'])
    a.oval(-.49,-.267,.169,.097,p['blush'],angle=.12)
    a.oval(.682,-.269,.142,.083,p['blush'],angle=-.18)
    if p.get('freckles'):
        for x,y,r in ((-.42,-.25,.020),(-.33,-.29,.013),(-.26,-.24,.017),(.55,-.255,.014),(.63,-.295,.018),(.71,-.24,.019),(.16,-.11,.012),(.24,-.09,.012)):
            a.oval(x,y,r,r,'a9593b')
    attach(a,rig,'head')
    a=layer('Ears', .45)
    a.shape('M -.745 -.20 Q -.87 -.063 -.99 -.133 Q -1.145 -.225 -1.02 -.434 Q -.90 -.58 -.735 -.49 Q -.65 -.46 -.67 -.38 Z',
            p['skin'], INK, .033)
    a.line('M -.975 -.27 Q -.912 -.204 -.832 -.271 Q -.907 -.31 -.842 -.379', '9b553f', .035)
    if p.get('scarf'):
        a.oval(-.832,-.487,.027,.032,'f5c163',INK,.013)
    attach(a,rig,'head')
    a=layer('Nose', .58)
    a.shape('M .142 -.120 Q .243 -.031 .323 -.131 Q .451 -.228 .341 -.280 Q .220 -.325 .149 -.253 Q .121 -.231 .151 -.218 Z',p['skin'])
    a.line('M .258 -.102 Q .420 -.167 .379 -.224 Q .349 -.271 .248 -.272', 'a45a42', .025)
    a.line('M .194 -.155 Q .236 -.122 .275 -.142', 'ffd3a0', .019)
    attach(a,rig,'head')
    for ex, side in ((-.337,'R'),(.341,'L')):
        a=Art('Brow · '+side,coll,(cx+(ex+look*.08)*w,cy+.369*h),(w,h),z=.569)
        dark=p['hair_dark'] if not p.get('beard') else '77656a'
        a.shape('M -.194 -.019 Q -.185 .083 -.052 .084 Q .096 .106 .177 .002 Q .179 -.031 .094 -.003 Q -.047 .036 -.136 -.025 Q -.172 -.056 -.194 -.019 Z',dark)
        attach(a,rig,'head')
    if p.get('moustache') or p.get('beard'):
        a=layer('Beard and moustache' if p.get('beard') else 'Moustache', .607)
        if p.get('beard'):
            a.shape('M -.776 -.253 Q -.53 -.24 -.45 -.36 Q -.16 -.51 .11 -.40 Q .36 -.37 .49 -.307 Q .73 -.31 .88 -.20 Q .99 -.42 .817 -.62 Q .81 -.8 .62 -.91 Q .51 -1.043 .36 -1.003 Q .19 -1.134 .02 -1.057 Q -.20 -1.128 -.33 -1.003 Q -.77 -.96 -.854 -.52 Z',
                    p['hair_light'], '625350', .044)
            a.shape('M -.779 -.389 Q -.72 -.76 -.47 -.85 Q -.26 -1.05 -.036 -.991 Q -.28 -1.14 -.44 -1.028 Q -.68 -.991 -.77 -.827 Q -.857 -.649 -.779 -.389 Z',
                    p['hair'])
            for x,y in ((-.62,-.601),(-.47,-.70),(.52,-.68),(.70,-.59),(.24,-.77)):
                a.line(f'M {x} {y} Q {x+.03} {y-.13} {x-.047} {y-.24}', 'a79a96', .024)
        a.shape('M .227 -.286 Q .32 -.217 .47 -.32 Q .555 -.39 .70 -.354 Q .65 -.544 .448 -.506 Q .28 -.529 .208 -.423 Q .02 -.545 -.203 -.490 Q -.404 -.448 -.452 -.348 Q -.314 -.381 -.213 -.305 Q -.008 -.211 .227 -.286 Z',
                p['hair'] if p.get('beard') else '4a2b20', p['hair_dark'],.033)
        a.line('M -.331 -.396 Q -.167 -.428 .006 -.338 Q .078 -.318 .135 -.354', p['hair_light'], .029)
        a.line('M .321 -.337 Q .426 -.342 .517 -.411 Q .576 -.423 .619 -.402', p['hair_light'], .023)
        attach(a,rig,'head')
    a=layer('Front hair' if not p.get('beard') else 'Priest hat', .66)
    if p.get('beard'):
        a.shape('M -.897 .526 Q -.895 .87 -1.034 1.356 Q -1.01 1.60 -.322 1.668 Q .445 1.727 .915 1.423 Q .785 1.09 .751 .54 Q -.003 .71 -.897 .526 Z',
                '35303a','2c242c',.054)
        a.shape('M -.950 1.365 Q -.445 1.621 .299 1.571 Q .69 1.53 .821 1.42 Q .493 1.475 .09 1.43 Q -.403 1.39 -.919 1.234 Z','4d404b')
        a.line('M -.870 .570 Q -.150 .744 .708 .578', '75606b', .026)
        a.shape('M -.883 .51 Q -.97 .393 -.978 .238 L -.845 .116 Q -.812 .348 -.711 .494 Z',p['hair_light'],p['hair_dark'],.023)
    else:
        a.shape(HAIR[p['id']], p['hair'],p['hair_dark'],.039)
        if p['id']=='cleopa':
            a.shape('M -1.024 .298 Q -.85 .659 -.553 .774 Q -.162 .987 .043 .967 Q -.104 .886 -.088 .828 Q .254 .922 .526 .899 Q .828 .853 .969 .645 Q .721 .788 .507 .713 Q .714 .660 .776 .534 Q .639 .626 .456 .568 Q .521 .686 .512 .741 Q .301 .569 .102 .509 Q .247 .677 .233 .766 Q .019 .661 -.223 .524 Q -.19 .603 -.170 .695 Q -.494 .529 -.636 .280 Q -.673 .498 -.604 .600 Q -.822 .456 -1.024 .298 Z',
                    p['hair_light'])
            a.line('M -.769 .582 Q -.594 .781 -.371 .847', 'ffe08a', .028)
            a.line('M .263 .906 Q .479 .958 .658 .869', 'fff1ac', .024)
        elif not p.get('scarf'):
            a.shape('M -.97 .310 Q -.793 .674 -.544 .733 Q -.364 .888 -.018 .949 Q -.148 .861 -.142 .811 Q .213 .949 .527 .87 Q .716 .869 .832 .693 Q .615 .783 .439 .730 Q .291 .773 .174 .716 Q -.089 .593 -.387 .578 Q -.618 .548 -.73 .343 Q -.654 .549 -.642 .581 Q -.835 .429 -.97 .310 Z',p['hair_light'])
            a.line('M -.711 .716 Q -.529 .815 -.347 .843', p['hair_light'], .028)
        else:
            a.shape('M -1.033 .254 Q -1.105 .691 -.668 .941 Q -.25 1.18 .207 1.062 Q .718 .944 .872 .606 Q .51 .894 .096 .882 Q -.412 .941 -.768 .510 Q -.953 .275 -.912 -.065 L -.989 -.058 Q -1.04 .062 -1.033 .254 Z',
                    'fff0cc', INK,.035)
            a.line('M -.974 .194 Q -.991 .719 -.506 .946 Q -.085 1.131 .390 .956', 'd4926b', .029)
            for index in range(11):
                t=.13+index*.117
                x=-.145-.865*cos(t)
                y=.20+.827*sin(t)
                a.diamond(x,y,.045,.042,RED)
                a.oval(x+.043,y-.028,.018,.022,'67806a')
            a.line('M -.534 .597 Q -.200 .737 .055 .859',p['hair_light'],.031)
            a.line('M .164 .801 Q .374 .653 .513 .602',p['hair_light'],.029)
    attach(a,rig,'head')
    return eyes(p,rig,coll,cx,cy), expressions(p,rig,coll,cx,cy)


EYES = ('open','half','closed')
MOUTHS = ('rest','A','E_I','O_U','M_B_P','F_V','L','smile')
HANDS = ('rest','open','prayer','cross_fingers')


def visible_if(obj, rig, property_name, index):
    for key in ('hide_render','hide_viewport'):
        driver = obj.driver_add(key).driver
        driver.type = 'SCRIPTED'
        variable = driver.variables.new()
        variable.name = 'variant'
        variable.type = 'SINGLE_PROP'
        variable.targets[0].id = rig
        variable.targets[0].data_path = f'["{property_name}"]'
        driver.expression = f'variant != {index}'


def create_character(name, *, overrides=None, sleeve_builder=sleeves, hand_poses=HANDS):
    p = profile(name)
    if overrides:
        p.update(overrides)
    coll = collection('CHAR_'+name)
    coll['character'] = p['label']
    rig = armature(p, coll)
    poses = {
        'forehead': ((.09*p['look'], p['head_y']+.535*p['head_h']), (.32,.95), 'head'),
        'chest': ((.047*p['look'],p['shoulder_y']-.412),(.58,.81),'chest'),
        'shoulder_R': ((-p['shoulder_x']*.78,p['shoulder_y']-.055),(-.57,.82),'chest'),
        'shoulder_L': ((p['shoulder_x']*.76,p['shoulder_y']-.095),(.88,.48),'chest'),
        'hand_rest': ((-p['shoulder_x']*.39,.435),(.94,-.36),'root'),
    }
    legs(p, rig, coll)
    outfit(p, rig, coll)
    hands = sleeve_builder(p, rig, coll)
    eyes_, mouths = portrait(p,rig,coll)
    for key, labels in (('eye_pose', EYES), ('mouth_pose', MOUTHS),
                        ('hand_R_pose', hand_poses), ('hand_L_pose', hand_poses)):
        rig[key] = 0
        rig.id_properties_ui(key).update(min=0, max=len(labels)-1,
                                        description=' / '.join(f'{i} {v}' for i,v in enumerate(labels)))
    for (mode,_),obj in eyes_.items():
        visible_if(obj,rig,'eye_pose', EYES.index(mode))
    for mode,obj in mouths.items():
        visible_if(obj,rig,'mouth_pose', MOUTHS.index(mode))
    for (side,mode),obj in hands.items():
        visible_if(obj,rig,'hand_'+side+'_pose',hand_poses.index(mode))
    markers = {key:marker(rig,coll,'MARK_'+key,point,bone) for key,(point,_,bone) in poses.items()}
    right_wrist = (-p['shoulder_x'],p['shoulder_y']-p['upper']-p['lower'])
    tip = marker(rig,coll,'CHECK_cross_tip.R',(right_wrist[0], right_wrist[1]-p['hand']), 'hand.R')
    for obj in list(coll.objects):
        if obj != rig:
            suffix = obj.name.rsplit('.',1)
            label = suffix[0] if len(suffix)==2 and suffix[-1].isdigit() else obj.name
            obj.name = f'{name} / {label}'
    return p, rig, coll, poses, markers, tip
