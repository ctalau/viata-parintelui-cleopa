# `"style": "blender"` — GLB toy monks (Blender-authored assets, three.js playback)

Runtime `lib/engine3/` (GLB characters / sets / props, baked clips; internals + rigging process: `docs/ENGINE-blender.md`). Same video.json as `DESCRIPTOR.md`
(scenes, cast, beats, say, do, camera, cards); differences below.

## Characters — `look`
`preset`: `elder` (cowl, long white beard, mantle) · `monk` (short hair + beard) · `young` (no beard) · `villager`.
The *Nodul albastru* presets `avva-or`, `calugar-barba-ascutita` and `frate-tanar-053` use the common
rig, clips and woven robe with their Python-built portrait heads. The second preset uses `hat: "kamilavka"`.
Use these presets alongside the other monks in any Blender film. [Figure library](../assets/3d/LIBRARY.md)

Keys: `skin` (default classic yellow; e.g. `darkSkin2` for Avva Moise), `robe`, `legs`, `belt` (colour or false),
`hat` none|cowl|openhood (the hood pushed back: forehead and brows in the light)|culion (soft cap + a veil falling at the sides and back onto the shoulders, the face open — the 040 poster; **don't use it any more**: it reads as a bald head with hair only at the sides — film 052 feedback)|cap|kamilavka + `hatColor`, `hair` none|short|curly|long|fringe + `hairColor`, `beard` none|short|full|fluffy (sculpted wavy locks over the chest, curled moustache; the locks start well below the lips, so the printed mouth shows whole and moves as he talks — from almost closed to the edge of that space on a detailed face; the beard swings forward a little as the head bows toward the chest; beards and sculpted brows are matte)|long
+ `beardColor`, `brows` normal|bushy|thin, `cloak` none|mantle|fleece + `cloakColor`, `age` young|adult|elder (wrinkles),
`faceShape` round|narrow|wide|long, `eyes` normal|small|big, `face: "detailed"` (the sculpted face of the 040 poster: fluffy brows and a button nose in relief — brows that rise and tilt with the expression (the only brows of the face), `brows: "bushy"` — wrinkles, smile lines, an open smile, a face that stays bright under a hood; `brows3d` / `nose3d` false turn the relief off), `beltStyle` band|rope (`rope` = a twisted cord with a knot and two tasselled ends, coloured by `belt`), `scale`. Colours: names in `lib/engine3/character.js` NAMED or `#hex`.
`head: "yarn"` = **the yarn elder** (the old monk's head of the cartoons-learning repo, `demos/monk-head`): glossy oval eyes
that blink, a mouth with real shapes (talking, smiling, surprise), wool brows and moustache, a long cream wool beard of 42 locks
that drapes over the chest and hands (the beard and the moustache are thick two-ply twisted wool ropes with a rope texture; they do not move with the talking mouth; `wool: "soft"` = the earlier monk's beard: plain fluffy wool locks — with `hood: "small"` the earlier small woven hood too), and a big hand-knitted hood (toy hat `yarnhood`, built in Blender: soft egg-shaped hood with a fat rolled brim round the face, its crown slumping back, a woven mantle over the shoulders that the arms lift — `mantleColor`, default the hood's colour); the body is the toy monk's, its tunic a coarse homespun weave (`knit: true` = knitted). `hood: "small"` = the old small woven hood. It replaces `hat` / `hair` / `beard` /
brows (the clips use the long-beard variants); `"hood": false` = no hood, the toy `hat` instead (`cap`, `kamilavka`…: film
`_short-002-pacea`); `cloak` + `cloakColor` (also the hood's colour, or `hoodColor`),
`beardColor` (white = cream wool), `skin`. Its mouth stays closed and calm at rest (it smiles only for `happy` / `joy`), and its brows follow the expression only (still while he talks). Film `_short-002-pacea`.
A `cloak` only in a colour close to the robe (a darker shade); laymen wear none.
Emotions: neutral happy warm joy sad surprised ashamed angry thinking sleepy (half-shut eyes) asleep (eyes shut: dozing, sleeping) sick.

`portrait: "ioan-colov"` and `portrait: "fratele-mare-colov"` attach the Scetis heads to the common rig.
The eyes have independent blink and gaze morphs. The younger portrait uses six speech shapes guided by the line and its
audio envelope. The elder reads `neutral`, `gentle`, `surprised`, `pray`, `thinking` and `gentle-shrewd` as E1–E6 and
speaks with a small opening of the jaw. Set `quietHands: true` on a spoken beat to omit the automatic talk gesture.

## Gestures (`do: { actor, gesture, hand?, duration? }`)
wave nod shake bow metanie (deep bow, right hand to the ground) reap (reaps wheat: bends, gathers stalks with one hand, the sickle sweeps under them, three strokes over 4.7 s — hold the `sickle` in `"hand": "L"` and reap with `"hand": "L"`, so the right hand stays free for the cross; pair it with a `wheat` patch `bend` 1 starting 0.35 s after the gesture, `duration` 3.6) cross (Orthodox; long beards get `cross_beard`) pray bless
offer point think shrug draw1 draw2 draw3 (`draw1` / `draw2` / `draw3` = draws a `bow` held in `"hand": "L"`, 3.6 s: the bow comes up, the right hand takes the string, the left arm pushes the bow out to his LEFT while the right hand draws the string to the chin, holds 1.4–2.4 s, lets it back slowly, lowers the bow — a little / more / to the full; the string follows his right hand by itself (no `bend` actions needed); start it with `"word": "Scârț", "at": -1` so the creak falls on the draw; he aims to his left, so turn him (`face`) so that nobody stands there; film 048) knead (`knead` = kneads dough in a trough on a table in front of him, 7 s, six pushes: leans over, both palms push down and forward into the dough and fold it back; stand at the `bakery-yard` anchor `table` behind the `dough-trough`; a shorter `duration` plays it faster; film 051) knead2 (`knead2` = kneads the dough the whole way, 7 s, after a Gemini Omni reference: two presses of both palms on the top (it flattens), the hands take its two ends and lift it (it sags in the middle) and lay it back, three pushes of the heels of the hands, then the hands cup its sides and round it into a ball — the dough itself deforms with the hands at runtime (`lib/engine3/dough.js`: it gives under the palms, follows the hands while they hold it, goes from a rough lump to the round ball over the gesture), on a `dough-trough` showing `shaggy` / `dough`; same place as `knead`; film 051) knock (`knock` = knocks on a door with the right fist, three raps, 2.5 s: stand ≈ 1.2 from the door leaf, facing it; time it with `"word": "Cioc"`) (`bless` = the Orthodox blessing, 3.6 s: the right hand forms IC XC — index straight, middle bent, thumb over the ring finger — and, lifted in front of the shoulder with the elbow low, draws a large cross toward the others: up, down, his left, his right; `wave` = a small wave with the elbow by the body) look listen joy/bounce (`joy` = a happy hop, hands up) laugh (`laugh` = laughs out loud, 2.6 s: hands on the belly, head back, the chest shaking with each „ha”, a bend forward at the end — use it for „au râs”, not `joy`) sad ashamed surprised talk/talk1..talk4 hug drop. `hand: "L"` uses the
mirrored clip where one exists. A longer `duration` stretches the clip's hold part.
Speaking actors make small talk gestures automatically; listeners tilt the head toward the speaker.
`swing-feet` plays on a seated figure. `hungry` brings a hand to the stomach. `hand-to-chest` keeps a hand
by the chest below a long beard.
Use a pelvis-mounted `scetis-cos` with the seated gesture `weave-lap`. Both hands stay on the rim between
stitches and during a `put` onto a support within reach. The hands follow the rim as its `bend` increases.
The `basket` variant of `scetis-scaunel` has a top at y = 0.93. Leave room between the weavers for their
elbows. Set `carryBlend` on a held prop to blend
arm poses around handoffs and prop visibility changes.
Use `pet` with `partner` set to a visible, stationary prop with `pet:start` and `pet:end` contact points
(for example `fenec`), and specify the actor's nearer hand. For `eat`, a held prop with a `bite` point gives
the actor an edge to bring to the mouth. Hold `scetis-jumatate` with `carry: "side"` and `lean: 0`.
Use `turn: 3.14159` for the first half. For the half that faces the other way on the board, select the named
contact with `grip: "grip.opus"` and use `turn: 0`. Use the same hand in the gesture and the prop.
For palm craft, `clapOnce` claps once in front of the beard, `weave` follows the rim of a basket (rim ≈ 1.9 high,
1.05 ahead of the actor), and `foldCloth` reaches for a weaving-tool roll (table ≈ 1.26 high, roll 1.1 ahead).

## Actions
walk (default speed 1.7, `style: "hurry"` or speed > 2.6 = a brisk walk, never a run; `style: "calm"` = an unhurried walk, small arm swing, for an old monk — best at speed 1.4–1.7). **A walk that starts when the
previous one of the same actor ends continues it** (one path, the corner rounded, no stop at the waypoint); the turn to a
final `face` (≤ 100°) happens during the last steps. A big turn (> 125°) goes the way that shows the face to the camera. The walk bends in during its last steps so it arrives facing
its `face` (no sideways steps). `"face": "<prop>"` turns toward a prop (where it lies, or who holds it). A `hug` lines the two
up across the beat's camera (both in profile).
`"word": "Stai"` on an action = start it on that word of the beat's line (timed from the voice; + `at` seconds);
`"until": 13` on a gesture = hold it to the end of beat 13's line (a prayer said over several beats). Seated figures play
`<gesture>_sit` clips where they exist (`offer`: the hand rises from the knee). `npm run validate` prints `motion:` hints
(someone stops and walks on, a turn with the back to the camera). face, posture sit/stand (sits on the nearest
`seat:` of a GLB set or a stool/rock prop; else at the cast `seat` height), give (give/take clips, hands meet by IK),
put (put_down), give without `from` from the ground (pick_up: a deep stoop, the right hand to the ground 0.78 in front and 0.3 to the right of the figure — put the prop there; a prop with a high handle, a basket, uses lift_up), hug (authored at 1.55), show/hide, lookAt (`"lookAt": "<actor>" | "camera" | [x, y, z] | null`: the head turns over 0.45 s and lets go as gently; a point below the eyes also lowers the eyes — aim at y ≈ 3 a few steps ahead rather than at the ground, a bowed head pushes a sculpted beard into the chest). People who talk in turns keep looking at each other between the lines (the look holds ~2.5 s after a line).

## Sets
`assets/sets/<name>.glb` + `.json` (contract: `blender/common/CONTRACT.md`); anchors by name, `seat:<name>` = where the
sitter's feet are. A set without a GLB falls back to the procedural lego set of that name.
`"set": { "type": "nile-village", "hide": ["donkey"] }` leaves out pieces of the set dressing by node name (with their children; the
colliders stay) — e.g. the set's own donkey when the film brings `donkey-pack` (film 049).

The Scetis sets are `scetis-cell`, `scetis-cell-interior` and `scetis-dunes`. The cell has the `cell` door
and the `elder`, `ioan` and `threshold` seats. Hide `door-lamp-flame` in daylight. The `olive-shade` anchor
in `scetis-dunes` sits under the olive crown in high sun. The `scetis-turturica` opens and flaps its wings
during a `put` with `fly: true`. The `scetis-soparla` follows a ground route with `walk: true`,
articulating its legs, neck and tail. The `ioan-mantie` prop offers `worn`, `folded`, `hung` and
`draped`. Mount `worn` with `wear: true` and hold `draped` with `carry: "side"`.
The `stand` variant of `scetis-candela` is a floor candlestick with one flame at y = 2.93.

Use `desert-flower` in one hand with `carry: "side", lean: 0`. A kneeling actor can plant it with
`plant-flower` and a simultaneous `put` with `reach: true`. Animate `bend` from 0 to 1 and back to make
the corolla nod. Set `word` to a spoken number to cue the nod on that word.

## Audio

A scene can set `ambience: { file, volume }`. The audio file plays under the scene and continues across consecutive scenes
with the same settings. A beat can set `musicGain` between 0 and 1 to lower the music smoothly. Add `word` to a sound cue
to estimate its start from the spoken word.

## Tools
`npm run assets` (rebuild monk.glb), `npm run char -- --preset looks|faces|clips --clips cross`, `npm run clipcheck`,
`npm run check` (film validator: self / bodies / set / prop / ground / camera), gallery `videos/_gallery3`.

## Props (GLB, `assets/props/<name>.glb` + `.json`)
`pouch` (a cloth money pouch tied with a rope, gold coins in the open top; hangs from the hand by its neck), `basket` (variants `intact` → `broken` when its `bend` passes 0.5: `{ "prop": "cos", "bend": 1, "duration": 0.1 }`; `"variant": "new"` =
the prettier one with a coloured band), `oil-lamp`, `jug`, `mat`; animals that move by themselves all film long, never in a visible loop (each copy has its own random-looking but deterministic rhythm, `seed` = prop option): `hen-brown`, `hen-white` (a plump hen ≈ 0.95 tall: walks to a new spot round where it is placed — `radius` 1.2 — then stands and pecks, looks about; keep walkers ≥ `radius` + 1 away), `donkey` (≈ 2.8 tall, red saddle blanket: grazes / looks about, swishes its tail), `camel` (lying down, red blanket: chews and turns its head, swishes its tail). `sickle` (hangs from the hand by the top of its handle, the blade hooking forward low by the stalks), `wheat` (a patch of standing wheat 2.6 × 1.5, ≈ 2.3 tall, swaying in the wind; reaped in steps by its `bend` 0 → 1: variants w0 … w3, the reaper's right side first, w3 = stubble and a sheaf lying on it; stand the reaper 1.6 in front of it, the patch with `face` 180 when he faces -Z; hands reaching into the stalks are not reported by the checks — prop meta `soft`), `sheaf` (a sheaf lying along X), `stook` (a claie of seven sheaves), `ram` (a little ram with curled horns, ≈ 1.05 tall; carried in both arms in front of the chest, `hands: 2`; on the ground it stands, head along +X — `face` turns it; its head looks about, its tail swishes; pick it up from the ground with `give` without `from`: put it 0.78 in front of and 0.3 to the right of the figure; film 047), `crook` (a shepherd's staff ≈ 4.6 tall with a hook; held upright in `"hand": "L"` with `"lean": 0`, so the right hand stays free for the cross and the blessing), `bow` (a hunter's bow 2.8 tall, red-wrapped handle, no arrow: hold it in `"hand": "L"` with `"lean": 0` — upright beside him, the string towards his right; its string follows the drawing hand (prop meta `string`: the nock sits on the fist, the limbs bend with the pull — nearest of 9 variants), see the gestures `draw1…3`; film 048), `sparrow` (≈ 0.4: hops round its spot — `radius` — and pecks; show sparrows on a cut, in the stubble after the reaping). `donkey-pack` (**Urechilă**, film 049: a detailed toy pack donkey ≈ 3.4 tall at the ears, facing +Z — big ears that twitch, glossy
eyes with lashes that blink, mane and forelock, cream muzzle with a smile, red bridle with pompoms, a collar with a swinging golden
bell, a striped saddle blanket, a wooden sawbuck pack saddle with pegs; head browses, tail swishes. It **walks** on its own legs:
`{ "put": "magar", "walk": true, "via": [[x, z], …], "on": [x, z], "face": 0, "speed": 1.8, "wait": false }` — along the route, easing in
and out, turned along the way (into `face` at the end when given; without `face` it stops facing along the last leg), legs stepping in
diagonal pairs, head up and nodding. It **brays**: `{ "prop": "magar", "gesture": "bray", "duration": 1.8 }` — head thrown up, ears
laid back, eyes shut, the jaw opening and shutting (put it on the beat of a voice-only character's „I-haaa!”); `"gesture": "look"` (with a `duration`) = head up, looking straight ahead, ears pricked — for a close-up of its face. Its **loads** hang
from the saddle by ropes, in steps (`bend`, variants l0 … l3): the props `basket-dates` (a woven basket heaped with dates, palm
leaves on top — its right side, -X), `mat-roll` (a rolled palm-leaf mat with dyed bands — across the top; hold it with `"turn": 1.5708`
so it hangs along the walk) and `sack-bread` (a burlap sack, round loaves in its open neck — its left side, +X), in this order. Load
one with `{ "put": "cos", "into": "magar", "after": "x", "at": 0.15, "duration": 1.4 }`: it goes to its slot on the donkey (prop meta
`slots`, wherever the donkey stands then), and when the hand lets go the donkey's next loaded step replaces it — nothing floats,
nothing overlaps. Stand the loader 1.1 beside the slot, facing it (donkey facing 0 at D: basket from [D.x − 2.25, D.z] facing 90,
mat from [D.x + 1.1, D.z] facing −90, sack from [D.x + 2.1, D.z] facing −90); a later scene starts it loaded with `"bend": 0.34 / 0.67 / 1`.
The loads are picked up from the ground with `give` (no `from`; meta `hangs` → the knee-bend clips): stand 0.78 behind and 0.3 to the
left of the prop. Film 049). `donkey-fiesta` (**Urechilă as filmed in 049 now**: the user's sculpted toy donkey (Meshy AI), **rigged and skinned** by `blender/props/donkey_fiesta.py` — ≈ 4.65 tall at the ears, back ≈ 2.3, facing +Z; grey with stripes, a big cream muzzle in an open smile, painted eyes with lashes, a brown mane, red bridle with yellow / blue pompoms, a golden bell on a red collar, a fiesta blanket under a wooden sawbuck pack saddle and a red girth). It is a drop-in for `donkey-pack`: the same `walk`, `bray`, `look`, loads (`into`, variants l0 … l3, the same slots within 0.05) and staging; on top, the neck bends with the head when it browses / brays, the knees bend as each leg swings forward, the tail swings in two parts, the lids blink. Its head is bigger and higher than donkey-pack's: film what lies on its back from its side (`world` angle ≈ −70 … −90), not from the front. Prop meta `steps: true` = the variants follow the `bend` in steps (generic). A prop with `"carry": "side"` hangs upright from the hand by its
handle. `{ "put": "cos", "on": [x, z], "y": 0.02, "drop": true }` = it SLIPS from the hand (clip `drop`), falls in an arc and
bounces (use it with a `bend` at the landing, ≈ 0.7 of the put time later). `"slip": true` instead of `"drop"` = he SLIPS (clip `slip`: a foot skids forward, the body drops and
leans back, both arms fly out, the right hand lets go of the prop, he steadies himself) — someone slipping in a river (film 043). Gesture `show` raises the held prop to show it.
Types without a GLB fall back to the procedural lego prop (e.g. `pouch`, `coins`): held, it hangs upright from the closed hand and leans off the robe like a `"carry": "side"` prop (`lean`, 0.4), handed over smoothly. A fallback lego set (`egypt-village`…) gets its flat brick groups (base plate, paving, road tiles) as ground and its walls / counters as `col:` boxes, so `npm run check` sees feet in the road and figures walking through a house.

The palm-craft library includes `palm-weave-basket` (interlaced reeds, grip on the rim) and `date-frond-bundle`
(variants `blue` and `plain`, along X, grip at the cord loop. For handovers use `"carry": "side", "turn": {"R": 1.571, "L": -1.571}, "lean": 0` so the leaves lie along the arm), `striped-clay-jar`,
`woven-reed-mat`, `drawstring-purse` and `stamped-coin`. A static held prop can use
`"carry": "belt"` to follow the actor at the hip named by `hand` while both hands stay free.
Animate `wooden-cashbox` from `bend: 0` (shut) to `bend: 1` (open), and `weaving-tool-roll` from
0 (open) to 1 (wrapped). These Blender props set `bendX` on the hinge nodes in degrees.
`hoopoe` bobs its crest and pecks. In close-up, `desert-hare` has whiskers, pale toes and dark-tipped ears that turn independently of its head. A `put` with `walk: true` makes it hop in whole bounds with a push-off and a planted landing.

Film 050 (made from the AI concept models of `assets/3d/`, scaled and pivoted by `blender/sets/kit/aimesh.py`): `water-jar` (a big glossy terracotta jar 1.6 tall with two handles; variants by `bend`: 0 = empty, a dark clay inside — 1 = full, blue water at the mouth; `"scale": 0.42` = a small jar held by its rim, `"lean": 0.3`), `rain-cloud` (a friendly puffy cloud ≈ 9 wide with a little smiling face towards +Z, origin = the belly; `bend` 0 = dry, 1 = rain streaks falling 9 below; hang it with `"y": 9.6` and fly it in), `lentil-pot` (a dark cooking pot with red lentils, 1.2 wide; on a `campfire` give it `"y": 0.3`), `campfire` (a ring of stones with sticks; `bend` 0 = cold, 1 = lit: flames with a flickering light).
Film 051 (the monastery bakery, `blender/props/bakery.py`): `bread-oven` (a domed clay bread oven on a stone platform — the AI model
`assets/3d/pitarie-cuptor.glb` (Nano Banana sheet → green cut-out → Hunyuan3D-2mv), ≈ 3.9 wide, 3.65 tall with its chimney, scaled so
its hearth is at 1.35; its painted mouth is found by its dark texture and cut open, and a hollow chamber is built behind it (an inner
vault facing in, the mouth's tunnel, a hearth floor); without the AI file the procedural oven is built instead —, an arched
brick-framed mouth ≈ 1.4 wide and 0.9 high at hearth height 1.35 facing +Z, the fire at the back left — `flame*` meshes, so the chamber glows and flickers —,
soot above the mouth, firewood in an arched alcove under the hearth, a wooden oven door leaning on its right side. `bend` in
steps: 0 fire · 0.2 raw1 (one raw loaf just inside the mouth) · 0.4 raw6 · 0.6 baked6 (golden) · 0.8 baked5 · 1 embers (empty,
small flames). Place it at the set's `oven` spot (`bakery-yard`: `[7.2, -6.2]`, `face: -25`)), `bread-peel` (a wooden bread peel
3.5 long held upright at the side by its handle, `"lean": 0`; **`"tilt": 90` lays it forward, flat at hand height**, the loaf on
top ≈ 3 ahead of the holder; variants by `bend`: 0 empty · 0.5 raw loaf · 1 baked loaf). **A loaf into the oven:** the baker
holds the peel tilted (`"tilt": 90` in the prop's descriptor, never upright with a loaf on it), stands at `oven-back`, walks to `oven` (speed 0.9, `face` = the oven's face + 180) — the blade slides into the
mouth —, then `"bend": 0.2` on the oven and `"bend": 0` on the peel at the same moment, and steps back (`"back": true`); taking a golden loaf out is
the same walk with the oven 0.6 → 0.8 and the peel 0 → 1; a `bread-basket` on the ground 2.7 in front of the mouth (oven-local
`[0, 2.7]`) is under the blade when he is back at `oven-back`: there the peel 1 → 0 and the basket 0 → 0.5 → 1 (the loaf drops in).
Show the fire with a camera into the mouth from the front right (≈ 35° off the mouth's axis, 2.8 away, low). `dough-trough` (a flat wooden kneading board with a low lip — „fund de lemn”, the hands knead on it, no wall to pass through — 2.0 long on
a floured table top, the shaped raw loaves to its right; put it on the table: `"at": [-3, -3.25], "y": 1.55`; 20 `bend` steps,
step i at bend i / 19: flour · shaggy · dough · loaves1 … loaves5 (one more loaf on the table, the dough smaller, each step) ·
loaves6 · flour6 · shaggy6 · dough6 (a second batch, the six loaves still there) · loaves7 … loaves12 · empty · five (five loaves, the board empty) — step a loaf per
counted word (`"word": "trei"`) so the loaves appear with the counting; kneaders stand 1.37 behind it (film 051's `gen.mjs`: `TV()`)), `bread-basket`
(the AI wicker basket of loaves, 0.95 tall: 0 empty · 0.5 a few loaves · 1 heaped with golden loaves), `flour-sack` (a small
tied burlap sack of flour with a rope loop, carried at the side). The loaves are the AI loaf (`assets/3d/pitarie-paine.glb`); the
raw ones are the same mesh with a pale dough texture.
**`"fly": true`** on a put from one place to another = it glides through the air (eases in and out, turns to `face`, bobs a little): `{ "put": "nor", "on": [7.5, -4.2], "y": 9.6, "face": 0, "fly": true, "duration": 6.5 }`.
**`"back": true`** on a walk = he steps backwards, still facing the way he faces (no turn; the walk cycle runs in reverse; short
and slow, ≤ 2.5 at speed ≤ 1) — a baker drawing the peel out of the oven: `{ "actor": "teodor", "walk": [4.07, -1.04], "back": true, "speed": 0.9 }` (film 051).
**`"upright": true`** on a two-handed held prop (`bread-basket` carried in both hands) keeps it level between the hands (only the
holder's heading turns it); **`"carry": "side"`** carries a two-handed prop in one hand, hanging upright (`"lean"` small, e.g. 0.12;
`"scale": 0.8` keeps it off the robe) so the other hand is free to wave. **`"tilt": 90`** on a held prop's descriptor = held tilted from the start.
**`tilt`** = a held prop leans forward about the hand, its top towards where the holder faces (pouring — the blender rig has no pour clip): `{ "prop": "ulcioras", "tilt": 95, "duration": 0.8 }`, then `"bend": 0` (now empty) and `"tilt": 0`; with `{ "actor": "x", "gesture": "offer", "duration": 3 }` the arm holds it out over the pot. Stand the pourer ≥ 1.7 from a campfire's centre (the stones), facing it (film 050).
**`"fixedScale": true`** keeps a GLB prop at its descriptor `scale` on the ground and in the hand, including during pickups and set-downs. When a worn prop has no explicit `scale`, it keeps the wearer's size.

**Doors** of the GLB cells (`desert-road`: `cell1`, `cell2`): `{ "door": "cell1", "open": 1, "duration": 1 }` swings the door open
(outwards, `open: 0` shuts it). Someone who comes out of the cell: cast entry inside, behind the closed door (`cell1`: `[-16.42, -7.98]`,
`"visible": false`), `show` him on the same `at` as the door, then walk straight out through the doorway (`[-15.87, -6.06]`) and on —
the door reveals him (film 042). Use `"after": "anuv"` to start the swing after Anuv reaches the door.
To start a scene with a door already open, set the scene's `"lead": 0` and use
`{ "door": "cell", "open": 1, "duration": 0, "at": 0 }` in its first beat.

## Sets (GLB) — anchors
House rules for every set (and every new one): **palms only with broad leaves** (`pieces.palm`, `fleshy` is the default — never the
thin pinnate fronds), and **every animal moves all the time** (glTF extra `anim`: `peck` birds, `drink` birds at the water's edge (on the bird: it leans forward from its feet, its `*.head` child dips the beak to the water, then lifts high to swallow; film it from the water side, facing the birds), `tail` cats, `browse` donkeys,
`ruminate` + `swish` camels, `lizard`, `peek` tortoise heads, `hen` (with `speed` and `legs`: a walking tortoise — `critters.tortoise_parts`, legs `*.legN` step in diagonal pairs) — `lib/engine3/look.js`; random-looking, never a visible loop, a
seed from the node's name). A new animal in `blender/sets/kit/critters.py` comes in moving parts (body + head / tail on pivots).
* `desert-road` (skies `day`, `morning`): `cell1`, `cell1-door`, `cell2`, `cell2-door`, `road-a`, `road-mid`, `road-b`, `stones`
  (the stone patch is just in front of it, +Z), `far-left`, `far-right`, `offstage-left/right/front`, `palm-shade`. The road runs
  along X at z ≈ 3.5–5; the cells stand at x ≈ ∓16, z ≈ −7, doors towards +Z. Usual camera side: +Z.
* `cave-hermitage` (skies `evening`, `night`): seats `seat:elder`, `seat:guest` (walk to `"seat:<name>"`, then `posture: sit` — the
  figure really sits down on the stone), `pray-a`, `pray-b` (facing the icon, `face: 180`), `icon`, `inside`, `entrance`, `outside`,
  `path`, `offstage`. Open towards +Z. The prayer corner is filmed from the icon's side:
  `{ "shot": "wide", "on": [-4, -12.6], "dist": 3.9, "angle": 180, "world": true, "height": 0.3, "y": 3.05, "fov": 50 }`.
* `market-square` (skies `morning`, `day`, `evening` = golden late afternoon with a lilac sky, like the 040 poster): the paved square of a walled town (film 040): crenellated sandstone
  walls with arched niches, a gate tower with a terracotta dome (back right), a fruit stall with a red striped awning (back
  left), a bread stall with an orange awning (back right), amphorae, a well (front left), palms. Anchors: `center`, `road`
  (the road comes in from the front, x ≈ 0, z 14…34), `road-far`, `fruit-stall`, `fruit-seller`, `bread-stall`, `amphorae`,
  `side-street` (front right, x > 26), `offstage-left`, `offstage-right`. Open towards +Z; film the square from +Z.
* `river-ford` (skies `day`, `morning`, `evening`): a green river through the desert (film 043), flowing along Z from the far
  dunes towards the camera, ≈ 10 wide, a shallow ford at z = 2 where people wade across along X (in profile to a +Z camera):
  the ground under the water is the walkable bed, the semi-transparent water hides the shins, its ripples flow downstream.
  Reeds with cattails, broad palms, ducks on the water, butterflies; on the left bank behind the path a well with a trough and clay
  pots, hens (also one on the right bank). Anchors: `bank-left` [-8.4, 2] (path comes in from the
  front left: `path-left`, `offstage-left`), `water-left`, `ford-mid` [0.4, 2] (the middle: water to the shins), `water-right`,
  `bank-right` [9.2, 2] (path goes on to the back right: `path-right`, `offstage-right`), `downstream` [0.9, 16] (towards the
  camera), `upstream`. Something dropped in the water (`put` … `drop`) lands on the bed under the water; then
  `{ "put": "punga", "on": "downstream", "y": 0.15, "float": true, "duration": 5 }` = the river carries it away (it drifts along the
  bed, turning slowly — a put from the ground to the ground with `float`; `"linear": true` = constant speed, to chain several legs of
  one drift without a stop).
* `harvest-field` (skies `morning`, `day`, `evening`; film 044): a golden wheat field by the Nile at harvest time across the back (edge z ≈ −3 + 0.5 sin(0.11x + 0.4) + 0.25 sin(0.31x)), swaying in the wind, poppies and cornflowers; a trampled straw margin in front of it, a dirt path along x (z ≈ 5–7) to the farmer's house on the right (door `door:house`, anchors `house`, `house-door`; inside behind the door ≈ [21.4, 1.7]) with two round granaries, a donkey, hens, doves on the roof; a big fig tree on the left (`tree`), butterflies. `"set": { "type": "harvest-field", "reaped": true }` = the cut field: stubble and stooks of sheaves (after the harvest). `"green": true` = the same field in spring, just sown (film 045): no tall wheat, thin sparse blades of young green wheat in rows on dark ploughed soil (`lib/engine3/youngfield.js`); wherever an actor walks through it the blades fall along the walk as the feet pass and stay down — a trodden path, nothing to stage by hand (walk through the middle of the field, z ≈ −6 … −10). Anchors: `reap-a/b/c` (reaper places on the margin, facing the wheat), `margin-left/right`, `center`, `road-left/mid/right`, `house`, `house-door`, `tree`, `offstage-left/right`. Reap on the margin with `wheat` patches whose back edge touches the field (e.g. centres [-1.6, -1.9], [1.0, -1.9], reapers at z −0.3); film the reaper from the side (`world` angle ≈ −60 / +55), never from behind the field.
* `nile-village` (skies `morning`, `day`, `evening`; film 046): a green village by the Nile with an old monk's little white cell in
  the middle (x = 6, front wall z = −5, door towards +Z): a turquoise door that opens (`{ "door": "cell", "open": 1 }`) and,
  right of it, an open window at face height — someone at `window-in` (inside, facing out) is seen through it („looks out of the
  window”); `cell-in` = just behind the closed door (start hidden there or walk there from the window, open the door, walk out
  through `[5.9, -1.4]`). A big fig tree (purple figs) on the left with a long mud-brick bench in its shade: seats `bench-a` …
  `bench-d` (x −13, −11, −9, −7, facing +Z: walk to the anchor of the same name, then `posture: sit`). Behind: white / pink houses
  with blue doors, two pigeon towers with doves, a well, a vegetable garden, goats with a kid, hens, a donkey, a resting camel, a
  ginger cat by the door, a pond with a duck family and reeds (right, [23, 3]), butterflies, palms. A dirt path comes in from the
  front left (`offstage-left`, `path-left`, `path-mid`, `path-near`) to the door. Other anchors: `cell`, `cell-door`, `window`,
  `knock`, `yard`, `tree`, `center`, `pond`, `garden`, `well`, `offstage-right`. Knock at the door from ≈ `[5.5, -4.0]` facing 180.
* `sheepfold` (skies `day`, `morning`, `evening`, `night`; film 047): a green hillside in Cyprus. In the middle a shepherd's
  oval dry-stone sheepfold (wall 1.5 high — a figure inside is seen from the waist up; centre [0, -9.5], half axes 7.5 × 5.5) with a
  wooden gate at the front (x = 0, z = -4; `{ "door": "gate", "open": 1 }` swings it inwards; the gateway is 3 wide, posts at
  x = ±1.6 — walk through at x ≈ 0…0.4). Sheep inside (heads browse, two lie and chew, a black one, a lamb that hops). Right: the
  shepherd's stone house (door `door:hut` at x = 19, front wall z = -6.5; `hut-in` = behind the closed door), straw beehives,
  hens. Front left: a big old olive tree with a little owl on a bare branch at [-12, 3.75, 0.25] (film it with
  `{ "shot": "wide", "on": [-12, 0.25], "dist": 4.6, "height": 3, "angle": 25, "world": true, "y": 3.95, "fov": 30 }`), a bunny,
  olive trees, dark cypresses, poppies, butterflies, a lizard, a tortoise, a stone trough; green hills with a white town and
  its church on a far hill. Anchors: `gate` (facing it), `gate-left/right`, `fold-in`, `fold`, `hut`, `hut-door`, `hut-in`,
  `tree`, `trough`, `center`, `path-left/mid/near` (the path from the left to the gate), `path-hut`, `offstage-left/right`.
  Someone at the gate reaching over it: stand at x = ±1.0…1.5, z ≈ -2.4. A small field of `wheat` props fits on the meadow
  at z ≈ 7, x 20…28 (film 047).
* `desert-rock` (skies `morning`, `day`, `evening`; film 050) — „Piatra”: a dry honey-coloured rocky place, no water anywhere. The
  **stone cell** (AI model `chilie-piatra` ×6.5: honey stones, log-and-thatch roof, a round window, a vine, doves on the roof) centre
  [4, -11], its doorway at [2.9, -6.7] towards +Z, door `door:cell` (plank leaf on a hinge on the LEFT at [1.64, -6.58], 2.7 long,
  opens outwards to the left — keep people ≥ 3.6 from the hinge while it swings; walk in and out along x = 2.9: stand at
  [4.2, -3.8], open, walk to [2.9, -5.4] then [2.9, -8.9] = `cell-in`); inside a dark room with a mat and a shelf with a cross —
  someone praying at [2.9, -10.4] facing 180 is seen through the open door from `{ "on": [2.9, -8.6], "dist": 10.5, "height": 3,
  "angle": 0, "world": true, "y": 3, "fov": 30 }`. The big **Rock** behind on the right [18.5, -16] with boulders and a lizard
  ([10.5, -11.3]: `{ "dist": 3.4, "height": 2.4, "angle": 20, "y": 2, "fov": 26 }`). Set dressing round the yard (AI models `assets/3d/piatra-*.glb`): a reed shade with baskets, a jug and a mat left of the cell, a bench, dates drying on a mat, a cross on a cairn, firewood behind the jars, flowering bushes; goats with a kid (left), hens, a camel resting (right, [21.5, 3]), a tortoise ([14.5, 15]). The yard x -10…15, z -6…12 is free. A path goes from
  the yard towards the camera side and curves left to the **schit**: the white domed cell (AI model `chilie-alba` ×7.5) at [-14, 36]
  turned 172° (its door `door:schit` towards -Z; hinge [-11.9, 31.2]; `schit-in` behind it, walk out along x = -13.35) — film it
  from the yard side looking +Z (`world` angle ≈ 180); a cat by its door, hens, a bench, baskets, a dovecote with doves on its left. Anchors: `cell`, `cell-door`, `cell-in`, `cell-deep`, `yard`, `center`,
  `rock`, `schit`, `schit-door`, `schit-in`, `path-near`, `path-mid`, `path-far`, `offstage-left`, `offstage-front`. The set json
  lists `doorLeaves` (hinge, length, outward normal) — `npm run validate` warns when someone stands in a leaf's swing.
* `mountain-spring` (skies `morning`, `day`, `evening`; film 048): the old monk's garden high in a red desert mountain — his cell on
  the left is a cave dug into a red rock outcrop (x ≈ -14, z ≈ -15, turned 14°: an arched wooden door deep in the doorway, a
  wooden cross over it, a little arched window; no door node), a reed awning beside it with baskets and doves on its roof, a clay jar, a spring on the right: water pours from a cleft between red rocks into a small turquoise pool with a rim of stones ([12.5, -6], radius 3.4, reeds, doves drinking on the rim), a
  vegetable garden between them ([-1.5, -12] + a small melon bed), date palms with broad leaves, flowering pink oleanders,
  flowers, butterflies, a tortoise that walks slowly round its spot ([-15.5, -3.5], film it with `{ "shot": "wide", "on": [-15, -3], "dist": 4.5, "height": 1,
  "angle": 20, "world": true, "y": 0.6, "fov": 34 }`), a lizard on a boulder, a desert hare by a bush at the front left
  ([-19, 12.2]), red cliffs behind. The sandy yard x -12…9, z -7…10 is free for acting. Two paths come in from the front: from
  the left (`offstage-left`, `path-left`, `path-left-near`) and from the right (`offstage-right`, `path-right`, `path-right-near`).
  Other anchors: `center`, `elder`, `cell`, `cell-door`, `cell-in`, `garden`, `spring`.
Exact positions: `assets/sets/<name>.json` / `blender/sets/README.md`. Rebuild: `python3 blender/sets/build.py [name]`,
`python3 blender/props/build.py`, `npm run assets` (characters; needs `pip install bpy`).

* `bakery-yard` (skies `morning`, `day`, `evening`; film 051) — „pităria”: the bakery yard of a desert lavra. The whitewashed
  bakery house (AI) back left, the kneading table (AI, 4.4 × 1.8, top 1.55) in the middle left — `table` = behind it over the
  trough, facing the camera; `table-r` = behind it on the right, over the shaped loaves; `table-front` —, the oven's place right of
  the middle (the film puts the `bread-oven` prop there: `[7.2, -6.2]`, `face: -25`) with `oven` (in front of the mouth, facing it,
  the right hand on the mouth's axis: the peel tilted 90° lays its loaf on the oven's first spot), `oven-back` (a step back — walk
  from here to `oven`), `oven-side` (a helper by the oven on the table side). Around: shelves of loaves, flour sacks, a hand mill,
  water jars, baskets of bread, a salt bowl and a jug on the table, firewood by the oven, a bench (`bench`) — all AI pieces
  (`tools/image-to-3d-batch.mjs`: Nano Banana sheet → Nano Banana cut-out on green → Hunyuan3D-2mv, the resolution by the
  object's size; `assets/3d/pitarie.json`) —, a low honey-stone wall, white cells and a church with a blue dome behind, palms, a cat
  by the oven, hens, doves on the roof, the wall and a dovecote, butterflies. The brothers come along the path from the left:
  `offstage-left` → `path-far` → `path-mid` → `path-near` → `yard`.

* `cell-room` (skies `morning`, `day`, `evening`; film 052) — the inside of a ROUND hermit's stone cell (centre [0, -2.5], inner
  radius 7.4, ceiling 8.6), open towards +Z like a doll's house (the wall runs from heading 55° round the back to 305°, a log post
  at each end): honey-stone walls and flagstone floor painted after the user's picture (`assets/textures/pimen-*.jpg`), round log
  beams along Z with sawn ends, a log ring round the wall top, an icon of the Saviour in a warm frame on the back wall ([0, -9.7],
  y 3.3…5.4) over a bench-table with books, a striped towel and a lit oil lamp, a striped rug before the icon. Three floor cushions
  in the front half — seats `yellow` [-4.6, -1.4] (faces 70), `red` [-1.6, -3.6] (20), `green` [1.6, -3.6] (-20), seat height 0.64:
  cast someone at `seat-<colour>` with `"posture": "sit"`, `posture: "stand"` gets him up there; the back half stays free between
  the icon and the door. Dressing: a low table with olives and a cup (`table`), clay jars, a blue jug, baskets, a stone bench, a
  cat asleep by the door. Doorway on the RIGHT (heading 90, x 7.4, z -2.5, 3.2 wide): `door-in` → `door` → `outside` →
  `offstage-out`; outside: an olive tree, flowering bushes, boulders, lilac hills. Prayer spots `pray-a`, `pray-b`, `pray-c`
  (facing the icon), `center`. **Cameras low** (`y` + `height` ≤ 4.5, from the open front or inside): higher ones put the ceiling
  beams in the foreground. Close-ups: `world` cameras (`"angle": "auto"` does not see the walls).
* `olive-hermitage` (skies `morning`, `day`, `evening`; film 052) — the cell among olive trees: the AI beehive-dome stone cell
  (`pimen-chilie` ×10.5, ≈ 16 across like the room inside, centre [-6, -10], its doorway looking +X at [1.14, -10], door `door:cell`
  opens outwards, `cell-in` behind it, `cell` in front), a sandy path with footprints from the door to the right, towards the
  camera ([17, 0]) and away over the hills (`path-1` … `path-6`; `acting.paths[0]` in the json), a big olive tree left of the cell
  (`tree`), more olives (matte, freshened leaves: `aimesh.foliage`), flowering bushes, boulders, a basket by the door, hens, doves,
  a tortoise by the path (`tortoise`, [6, 11.5]), a hare, butterflies, far little cells with crosses and lilac hills. Anchors:
  `cell`, `cell-door`, `cell-in`, `yard`, `path-1…6`, `tree`, `tortoise`.
* `palm-gardens` (film 053) — a domed masonry cell and two palm-shaded market stalls beside walled date gardens, connected by a sandy road lined with olives, flowers and boulders. Both stalls have wooden counters at y 1.20. At the cell, `door`, `threshold`,
  `work-basket`, `tool-cloth`, `seat:or` and `seat:pavel` mark the doorway, work table and bench. The road passes
  `home-road`, `road-bend`, `first-yard` and `road-east`. In the turquoise-gated garden, the `cashbox` anchor is
  on the table (y 1.31), beside `mat` and `jar`. Use `second-gate` for the arrival along +Z.

## Staging notes (learned on film 038)
* Two people talking stand along **X** (side by side to the +Z camera), not one behind the other: give the walker an explicit
  `[x, z]` next to the other and `face`, and film with a `wide` `world: true` shot at `angle` ≈ 0–10.
* Close-ups of seated people: `angle` −38 for the one facing +X, +38 for the one facing −X (camera on the open +Z side).
* The validator (`npm run check`) tests the real meshes: hands / beard / robe / props / ground / set colliders, every 0.05–0.1 s.
  Props can supply a closed `col:*` hull for actor penetration checks. A soft prop may list the actor part classes to check in `collisionParts`.
  By-design contacts (a beard or a cowl resting on the robe) are measured relative to the rest pose; a seated figure may sit on a
  `col:seat*` and its robe may pool 0.25 on the floor.

## Skete and palace (film 054)

* `skete-cell` is the rectangular cell at the skete. Its floor-level `rest` anchor is by the back wall. Walk through the threshold along z = −2.45 using `door-in`, `door` and `outside`. The door `cell` swings out with `open: -1`. Rebuild it and the church with `node blender/sets/arsenie-skete.mjs`.
* `skete-church` has a two-tier iconostasis and a sanctuary behind the royal doors at z = −4.9. The main entrance (`door`) is on the opposite wall at [0, 11.18]. Keep x between −1 and 1 through the threshold. Use `set: {"type":"skete-church","hide":["courtyard"]}` indoors and hide `interior` outdoors. In the courtyard `yard-door` and `path-out` mark the route across the yard. Two figures can share the stone bench at `seat:banca` and `seat:frate`. Approach those seats from the front (+Z), along their respective headings. Bench colliders can declare the names of their supporting seat anchors in `seats`. The validator then permits seating contact only for an actor using one of those anchors.
* Dress the nave with `skete-stalls` at [0, 0], `skete-nave-carpet` at [0, 0.55] and the tasselled `skete-royal-runner` at [0, 2.59], y = 0.011. The runner has a woven foliate medallion and aligns with the royal doors. The stall on the right at `seat:strana` can be used as a sitting anchor. Suspend the three rings of `skete-chandelier` at [0, 1.16], y = 9.15 and scale 1.22. `skete-cup-stand` holds a cup at height 0.73. Use `skete-tea-stand` and `clay-tea-cup` for tea at height 1.39. `skete-runner` and `skete-rug` are smaller patterned carpets. Rebuild these props, the reed mat, pillow, blanket and cup with `blender -b --python-exit-code 1 --python blender/props/skete-care.py`. To export individual props, pass their names after `--`.
* `constantinople-palace` has seven named acting positions (`teacher`, `pupil-1`, `pupil-2` and `servant-1` to `servant-4`) and a `bed` anchor. Use camera move `tilt-up` to tilt the view from the floor toward the columns with the camera fixed in place. Place the separate `palace-bed`, `palace-table`, `grape-bowl` and `candle-stand` props as needed. The bed has eight individually animated pillows. Prop gesture `bounce-1` through `bounce-8` lifts one cushion and settles it back. Put `word` on an action to time it to a spoken count.
* `small-pillow` has `flat` and `pressed` variants (`bend` 0 and 1). The `thin-blanket` is folded for carrying with `bend:0` and drapes across a reclining figure with `bend:1`. `hanging-lamp` and `candle-stand` use time-driven flames. A separate `votive-candle` catches light when its `bend` reaches 1. A `sheepdog` resting beside a `shepherd-stone` lifts its head on the prop gesture `look`. Each `sheep` can have its own `seed`.
* Actor posture `recline` lies on the side with the head toward local −X. `beddingHeight` in the cast sets an additional elevation for a stone or mattress. Posture `kneeling` brings both knees to the floor. Film option `poseTiming: "scaled"` fits seated transitions to their authored duration. `turnSpeed` caps a figure's turn in degrees per second and `look.headMotion` blends the face's rotation toward the upright pose.
* `floor-sit` lowers the hips with the feet planted. Follow it with `side-rest` to lower the character onto one hand and then onto their side. The head points toward local −X and `beddingHeight` sets the resting height. In this pose, `look.pillowRest: true` keeps the crown settled on a pressed cushion while the eyes and mouth animate, and lets the long beard hang toward the floor.
* `look.relaxedRobe: true` draws the hem closer to the knees as the actor settles into `floor-sit`. For a scene that starts with a figure already tucked in, use `look.underBlanket: true` on the cast entry and place a draped blanket over the hips. Use `look.underBlanket: "head-only"` to show the head and hood of a character covered up to the shoulders. Use `variant: "draped"` on a blanket when you animate the spread of cloth that is already open.
* `rollable-reed-mat` uses one prop for carrying, setting down and unfurling. Set it down at the foot of the mat and apply `{"prop":"mat","gesture":"unfurl","duration":1.7}`. It unrolls 6.67 units toward local −X. An actor's `unroll` gesture can name the mat as its `partner` and the hand that pushes it as `hand`. In later scenes use `bend: 1` at the same position and heading to start with it open. The `clay-cup` prop has a side grip for carrying water to a resting character.
* Partner gestures use `{"actor":"ioan","gesture":"help-up","partner":"arsenie","duration":2}`. The same form works for `support-walk`, `hand-on-shoulder`, `touch-hand`, `sip` and `kiss-hand`. `tuck-blanket` takes the identifier of an open blanket as its `partner`. Other care gestures are `cough`, `shiver`, `raise-elbow`, `elbow-bless`, `cross-arms`, `count3`, `eat` and `unroll`. Use `greet-bow` for a brief downward inclination of the head when greeting someone.
* `clay-tea-cup` uses a bent-arm carry pose, aligns the palm with the handle and gives `sip` a point on the rim to bring to the partner's lips. Author the gesture with the hand that carries the cup. Use `turn: 1.571` to point the cup forward and `lean: 0` to keep it level between sips.
* Put `epitrahil`, `gold-cuffs`, `prince-crown` or `gold-belt` in `look.accessories` to attach it to its rig bones. To take off the belt on camera, make it a held prop with `wear:true` and use a `put` action. Set `reach: true` on a `give` from a high surface or a `put` onto it for a standing reach. The `epitrahil` follows the robe at the chest and knees. `look.cloakClearance` adds room around a cloak at the shoulders and back. Gallery scenes `ingrijire-054`, `pastor-054` and `palat-054` demonstrate these assets.
* A memory uses scene `transition:"white"`, `fadeSeconds:0.6` and `vignette:true`. Set the transition again when returning to the present and leave the vignette off.
