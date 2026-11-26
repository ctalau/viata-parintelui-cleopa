# `video.json` — LEGO 3D films (default)

Read with `DESCRIPTOR.md` (common keys). Engine: `lib/engine/` + `lib/components/`. Gallery: `videos/_gallery`.

## Looks (minifigs)

`look` = preset + overrides. Presets (`lib/components/minifig.js → LOOKS`): `monk`, `elder-monk`,
`young-monk`, `villager`, `woman`, `child`.
Override keys: `skin`, `robe` (torso/arms colour), `legs`, `print` (`robe`|`tunic`), `belt`, `stripe`,
`hat` (`none`|`skufia`|`kamilavka`|`hood`|`headscarf`), `hatColor`, `bandColor`, `hair` (`short`), `hairColor`,
`beard` (`none`|`short`|`long`), `beardColor`, `browColor`, `age` (`child`|`young`|`adult`|`elder` → wrinkles, brow colour),
`halo` (not for the Pateric fathers — they are plain monks, AGENTS.md rule 15; the Saviour, the Mother of God, angels and apostles are never minifigs), `cross` (gold cross on chest), `lashes`, `scale`,
`style: "blocky"` (blocky town avatar — same joints, gestures and grip points as the minifig, faces printed on a flat front; `shoes` = colour of the shoe blocks), `hair: "long"` (shoulder-length), `cloak` (a mantle / *haină* over the shoulders and down the back, open in
front: `cloakColor`, `cloakTrim` = hem colour or `false`).
A **cast entry** can override the look for that scene only: `"cast": { "avva": { "at": "road", "look": { "cloak": false } } }`
— e.g. a garment given away: scene A he wears it, scene B (`"transition": "cut"`) he holds it as a `cloak` prop and gives it,
scene C the receiver wears it.
More look keys (all optional, old films unchanged): `hat: "cowl"` (a deep monastic cowl standing off the head, thick rim
round the face, falling onto the shoulders — reads better than `hood` for the old fathers), `hat: "turban"` (a village man's wrapped head cloth: fat wraps round a soft cap, a striped band `bandColor`, the loose end falling behind onto the shoulder; `hatColor`; `turbanFull: true` = a big wound turban: folds crossing over the forehead, a second striped cloth, a knot on top, a fringed loose end), `cordLong: true` with `cord` (a thick braided rope belt with a big knot and two long braided ends to the knees, knotted, with frayed tassels), `vest3d: true` with `vest` (a shaggy woolly vest in 3D, open in front, with a fringed hem), `fringe: true` with `hat: "cowl"` (tufts of hair, `hairColor`, peeping out under the cowl), `hat: "straw"` (a ploughman's
wide straw hat, `hatColor`, `bandColor`), `beard: "flowing"` (a detailed elder's beard, all 3D, nothing printed under it: a full chin, one layer of
overlapping tapered locks with strand grooves (two shades), and a moustache whose ends hang down beside the mouth; `beardShape` `round`|`forked`|`pointed`|`wavy` (curling tips)|`full` (a big wide beard: two layers of wavy locks, whiskers up the cheeks), `beardLength` 0.6..1.4 — give each father his own), `beard: "mustache"` (only a thick
moustache: an old farmer), `brows: "bushy"` (thick brows with a dark outline, so white/grey brows read), `eyes: "big"`,
`blush: false` (no pink cheeks — elders), `robeLong: true` (the robe falls to the feet), `cord` (a 3D tied rope belt with
knot and hanging ends, colour), `vest` (a sleeveless vest over the shirt, colour), `bag` (a shoulder bag at the hip + its
strap across the chest; `bagStrap`, `bagFlap`), `cape: true` with `cloak` (a short cape over both shoulders, its edges down
the front: a pilgrim). `hair: "curly"` (a mop of glossy round curls with a fringe — a young brother), `fabric` (knitted / woven cloth like the soft
capes of real minifigs: `true` = cowl, cloak, long robe and sleeves; `"cloak"` = only the cowl and the cloak; `fabricKind` /
`cloakKind`: `knit` (default) | `shaggy` (a big shaggy wool mantle over the upper arms with a ragged hem)). A `cowl` now also covers the top of the head down to the brows. A seated
figure with `robeLong` gets the robe draped over the knees, falling in folds to the ground (over the front of the seat; `lapFall` = a shorter fall, e.g. 0.5 for a tunic). Cast key **`"hands": "knees"`** = a seated figure rests both hands on his
knees (a listener). A held straight `staff` stands at the side of the body (the arm out a little), not in front of the face.
Library sheet of all of them: `npm run library` → `stills/library.jpg`.
Colours are names from `COLORS` in `lib/components/bricks.js` or `#rrggbb`.

## Sets and anchors (`set`, places)

* anchor name from the set layout. `desert-lavra`: `center`, `well`, `cell1`…`cellN` (spot in front of each
  cell door, facing the centre), `cellN.hut` (hut centre), `edge0`, `edge45`, … `edge315` (far on the dunes).
  `egypt-village` (a village by the Nile with a bakery stall and clay oven; the desert road comes in from +Z):
  `center` (market square), `bakery` (customer spot in front of the counter, facing the baker), `baker`
  (behind the counter), `counter` (put things on it with `"y": 2.4`), `oven`, `road` (village entrance),
  `roadFar` (far out on the desert road), `nile` (river bank), `house1`…`house5` (+ `.hut`), `edge0`…`edge315`.
  Tip: the stall's poles block two-shots at the counter — use `{ "shot": "wide", "on": [3,-5.4], "dist": 10, "angle": 68, "y": 3 }`.
  Things bought at the stall: put them on the counter (`"at": "counter", "y": 2.4`) and `give` them from there — a
  baker's hand held forward behind the counter is close to its top (the `clip` check tells you).
  `wheat-field` (an Egyptian wheat field at harvest; set options `"reaped": 0..1` = how much is cut, from the front row
  backwards, cut part gets stubble + sheaves; `"sheaves": false`; `"grown": 0..1` = how far the wheat has grown — `0` bare ploughed soil with furrows (sowing time; `"furrows": false` = bare soil nobody ploughed), ≈ `0.35` short green shoots, `1` ripe golden wheat (default); `"sparse": 0..1` = share of the field where nothing came up (a poor crop); `"tares": 0..1` = share of the stalks that are *neghină* (dark stalks with purple flowers among the wheat); `"colors": { "wheat": [...], "soil", "grass", "furrow", "tare" }` — a dry year: `"soil": "darkTan", "grass": "tan"`):
  `center` (open grass in front of the field, facing the camera), `field` (middle of the field), `fieldEdge`, `reapL`,
  `reapR` (in front of the still standing wheat, facing it — they move back as `reaped` grows), `tree` (in the shade of
  the big tree, a good place to sit), `threshing` (threshing floor with the pile of sheaves), `house` / `house.hut`
  (farmer), `road`, `roadFar`, `canal`, `edge0`…`edge315`. Tip: a `medium` shot on a reaper facing the field looks into the
  wheat — use `"world": true` with a small `angle` (camera from the open side).
* Set palettes — same shapes, other colours, so films don't all look alike: `{ "type": "desert-lavra", "palette": "rose" }`
  (`classic` mud + white domes, `rose` pink-ochre walls + nougat domes, `stone` grey walls + blue domes, `oasis` sand/white + turquoise domes, `terra` terracotta walls + green domes + olive path,
  `town` = a bright toy town: green lawn, grey sidewalk, green hills, each house one clean colour — cell1 sky blue, cell2 pink, cell3 yellow, cell4 lime — goes with `"style": "blocky"`,
  `ruby` = whitewashed walls, deep red domes and roofs, grey stone path, `amber` = ochre-yellow walls, blue domes, red-brown path, `lilac` = lavender and white walls, sky-blue domes and roofs, sandy path (soft and bright; goes well with the gold church dome), `olive` = sage-green and cream walls, terracotta domes, dry khaki ground: a lean, dusty lavra).
* `desert-lavra` with **`"church": N`**: cell N is the lavra's little **church** — bigger (11 × 8), a gold dome on a white
  drum with little windows, a big gold cross. Anchors `church` (in front of its door, = `cellN`) and `church.hut`.
  Use `"church": 3` (the cell at the back, its door facing the default camera); `"cells": 2` = a lavra with only two cells.
  Tip: cell1 stands at +Z — a camera `on: "church"` with `angle` 0 must keep `dist` ≤ 18, or it ends up inside cell1.
* `desert-road` (a road through the open desert — journeys, hermits far from the village; set options
  `"palette": "sand"` (golden dunes, default) | `"red"` (ochre-red rocky desert) | `"dusk"` (a cold, windy grey-blue rocky desert: slate sand, blue-grey rocks, grey cells with dark-blue domes) | `"salt"` (the white desert of Nitria: pale cream sand, white rocks, whitewashed cells with blue domes), `"granite"` (Sinai granite mountains: pale grey ground, dark grey + pink rocks, green scrub, grey-pink cells with dark domes), `"apricot"` (soft apricot-orange dunes, cream cells with dark-green domes — lovely at `night` and `morning`), `"cells": 0|1|2` = hermit cells at the back
  end of the road, `"oasis": false`, `"rock": false`, `"road": false` = the same place with **no road** (open sand where travellers lose their way;
  the same spot with `road` on in the next scene = "in the daylight the road could be seen again"), `"clear": [x, z, r]` = no small rocks within `r`
  of `[x, z]` — a clear spot where people sit / lie down for the night): the road winds from the back (-Z) to the front (+Z, towards the default
  camera). Anchors on the road (all facing +Z, along the road): `roadFar`, `farther`, `far`, `center`, `near`, `roadNear`;
  `rock` (in the shade of the big rock on the left, facing the road; `rock.big` = the rock), `oasis` (by the little pool with
  palms on the right, facing the road; `oasis.pool`), `cell1`, `cell2` (+ `.hut`, door spots facing the road), `edge0`…`edge315`.
  Tip: walkers coming towards the camera: `walk` from `[x, -15]` to `[x, 9]` (road centre x = 3·sin(z/11)); a wide shot
  `on: "center"` (angle 0) looks down the road with the cells at the back.
* `nile-bank` (a sandy bank of the Nile — the river runs along the back, far green bank behind it; a small hermit hut with a turquoise dome at the back right, a net-drying rack on the left, a rowing boat on the water, papyrus clumps and palms; a sandy path comes in from +Z; palette `sand` (default); skies morning/day/evening): anchors `center`, `hut` (= `cell1`, in front of the door, facing the camera side; `hut.hut` = the hut itself), `bank` (on the sand by the water, facing the camera, the river behind), `rack` (in front of the net rack; `rack.rack` = the rack), `boat` (the boat on the water), `shade` (under the left palm), `road`, `roadFar`, `edge0`…`edge315`.
  Tips: a person sits at the door on a stool: `"at": "hut+0,1.4"`, `posture: "sit"`, `seat: 1.6`; visitors arrive from `[-3,13]`; a wide shot `on: "hut"` `angle` -30 looks at the door with the path; the river is a backdrop for shots from the front `on: "bank"`, `angle` 0…20, `height` 3–5 (a close-up of someone standing at the water shows the river behind). Water, wet sand and land are separate flush pieces, so nothing z-fights.
* `desert-hermitage` (*chilia din pustie* — a lonely sandstone cell, the look of the poster „Ușa prieteniei”: sand/tan brick walls with a
  few terracotta bricks, a big arched doorway in a dark-red wooden frame with a warm glowing room inside, an arched window left of
  the door, a terracotta tiled roof with round eave tiles, a broken stepped wall on the left, a tall palm, golden dunes behind, grey
  boulders; a path comes in from the front left; sky day/evening/morning). **The door is a prop**: add
  `"usa": { "type": "plankDoor", "at": "door.hinge", "y": 0.2, "bend": 0 }` to every scene (0 = shut, 1 = swung open outwards; animate with
  `{ "prop": "usa", "bend": 1, "duration": 1.8 }`); `"door": 0..1` on the set = a static door instead. Anchors: `door` (right in front of the
  door, facing it — close enough to `knock`), `door.in` (in the doorway, facing out — put someone there behind the shut door, the door
  opening reveals him), `door.hinge`, `inside` (in the room, hidden), `window` / `window.in` (outside / inside the window: a face looking
  out; film it `{ "shot": "close", "angle": 0, "dist": 3.6 }`), `wait` (on the path left of the door), `palm` (in the palm's shade —
  sit around a `mat` there), `cell.hut`, `road`, `roadFar`, `edge0`…`edge315`. Tips: the opening door sweeps 2.9 studs round the hinge — keep
  people ≥ 3.5 from `door.hinge` before it opens; a close-up of someone facing the door from `door` puts the camera inside the cell → use a
  `wide` `world: true` shot from the side (`angle` −30…−60 = from the left); the poster view: `{ "shot": "wide", "on": [6.6, -2], "dist": 14,
  "height": 3, "angle": -32, "world": true, "y": 4 }`.
* `cave-hermitage` (*peștera din stâncă* — the look of the poster „Avva Siluan și rugăciunea spusă altfel”: a big grey rock of chunky
  stone blocks on the right with an arched mouth of big voussoirs; inside, a dark brick back wall, a wooden shelf with a fat glowing
  candle; two stone seats at the mouth; a terraced sandstone hill with a little domed monastery and cypresses behind on the left,
  purple mountains, sunset-lit brick clouds, spiky plants and grey rocks in front; best with **`"sky": "sunset"`**). The icon on the
  back wall is a prop: `"icona": { "type": "icon", "src": "assets/icons/…", "at": "icon", "y": 3.6, "size": 1.8 }`. Anchors: `cave` (the
  elder's stone seat at the mouth: `"posture": "sit", "seat": 1.2`, `"face": -62`; set key `elderSeat` = a taller stone, e.g. 2.0, then `"seat": 2.0`), `seat` (the guest's stone, `"face": 62`), `cave.in`,
  `icon` (also a `face` target: turn to the icon), `shelf`, `door` (in the mouth, facing out), `pray`, `path`, `road`, `roadFar`,
  `edge0`…`edge315`. To sit down: walk next to the stone, then `place` on it + `posture: "sit"` (on a cut or a wide shot).
  The poster view (eye level, the sun and the monastery on the left): `{ "shot": "wide", "on": [1.8, -5.9], "dist": 7, "height": 0.5,
  "angle": 6, "world": true, "y": 3.4, "fov": 44 }`; goes with `"render": { "preset": "vivid", "dof": 4 }` (soft background).
* `monastery-yard` (*curtea mănăstirii* — the scene of „Avva Teodor și grâul cel bun”: a paved sandy court of studs with scattered
  round tiles; on the left the grey cave rock of the elder's cell, its mouth turned to the yard, a wooden bed and a burning torch
  inside; at the back a long sandstone wing with an arcade of six round arches on columns (dark doors in the gallery) and a domed
  bell tower; a roofed stone well on the right, palms, red-ochre mountains). Anchors: `cave` (in front of the cave mouth, facing the
  yard), `cave.in`, `door`, `store` (a free spot right of the cave — stand sacks of grain there, e.g. at `[-9.6, -8]` / `[-6.8, -8]`,
  `"y": 0.2`), `yard`, `arcade` (under the arches), `well`, `gate` / `road` / `roadFar` (front right), `center`, `edge0`…`edge315`.
  Set option `"clear": [[x, z, r], …]` = no raised round tiles there, only flat studs (where something falls or lies on the ground).
  Tips: the open middle of the yard is around `[-3, 2]`; a `wide` `world: true` shot `on` `[-4, -4]`, `dist` 26 shows the cave, the
  sacks and the arcade together; things near the cave mouth (`x` < -11) get close to the rock — the `clip` check tells you.
* Sky **`sunset`** (apus): an indigo → rose → gold sky, a big glowing sun low on the horizon on the left (its disc is separate from the
  warm key light, which comes low from the left), warm fog.
* `"smooth": true` on any set: built without studs (smooth plastic, ground without printed studs). Automatic in a `"style": "blocky"` film.

## Buildings and landscape pieces (`lib/components/landmarks.js`)

Brick-built pieces with their origin on the ground, front facing +Z. Put them in **any set** with
`"set": { "type": "desert-road", "pieces": [{ "type": "chapel", "at": [x, z], "h": 90, "free": 8, ...options }] }`
(`h` = degrees; baked into the set, so solid for the `clip` check; on `desert-road` dunes and small rocks keep `free` studs away —
`"road": false, "oasis": false, "rock": false, "cells": 0` gives open sand), or as a prop (`"at": [x, z]`, `"face"` = degrees,
`"y": 0.2` on studs). Gallery scene `pateric-asset`; `npm run library` renders each one alone.
* Buildings: `hermitCell` (stone cell with a brown tiled gable roof, plank door, two windows, a stepped sandstone cliff behind;
  `rock: false`, `colors`, `roof`, `door`), `chapel` (small stone church 11 × 12 on a grey plinth: arched door, arched windows, terracotta
  roof, bell gable with a gold bell and cross; `walls`, `roof`, `door`), `gate` (monastery gate: big round arch 6 wide between two piers,
  tiled cap + gold cross, two wooden leaves `open` 0..1 (0.35), low side walls — 24 studs wide in all), `bellTower` (square bell tower 5 × 5
  on a grey plinth, open belfry with a gold bell, stepped terracotta roof, cross; `height` = rows of the shaft, 4), `stoneWell` (`roof: true` = taller posts under a little terracotta gable roof; round
  stone well, two posts, beam, roller with rope and a bucket, water inside), `wall` (low courtyard wall with a broken stepped top; `length` 9, `rows` 3).
* Landscape: `palm` (date palm, `height` 8, `seed`), `cypress` (`height` = layers, 11), `leafyTree` (Y trunk, wide layered crown — it
  does not bow; the bowing tree is the prop `tree`), `bush` (`size`, `flowers: false`), `rocks` (grey outcrop with peaks; `size`, `colors`),
  `hill` (tan tiers with a grass top; `radius` 7, `height` 4), `plowedPlot` (ogor: ridges and furrows in a grass border; `width` 12, `depth` 10),
  `wheatPatch` (`width` 8, `depth` 5, `color`), `pathTiles` (a paved strip; `length` 10, `width` 3, `studs` share, `colors`; `pieces: true` = the four loose tiles).
* Cave pieces: `caveRock` (the cave of `cave-hermitage` alone; `seats`, `colors`, `wall`, `glow: false`), `hillMonastery` (terraced
  hill with a monastery and cypresses — a far backdrop; `radius`, `height`, `walls`, `dome`), `mountains` (purple horizon), `spiky`
  (a spiky green plant; `size`), `stoneSeat` (a sitting stone, top at 1.2 → `seat: 1.2`).
* `cloister` (a long two-storey sandstone wing: an open gallery of round arches on columns along the front with dark doors at the
  back, arched windows above, a lean-to terracotta roof, a domed bell tower on its right end; `arches` (6), `walls`, `roof`,
  `tower: false`, `dome`; front at local z +4), `bellTower` with `dome: true | colour` = a round dome instead of the pyramid roof.
* Small props: `bucket` (găleată of staves with iron hoops, origin = top of the handle: hold it like the jug; `water: false`), `bench` (seat
  top at 1.6 → `seat: 1.6`), `amphora` (`size`, `color`), `cart` (căruță on two spoked wheels, shafts towards +Z; `load` = colour of a heap),
  `donkey` (măgăruș facing +Z; `saddle: false`, `sacks: true`, `blanket`), `campfire` (stones, logs, flickering flames + a soft light; `fire: false`, `light`),
  `hoe` (sapă) and `pitchfork` (furcă) — held like the staff; `staff` with `straight: true` = a plain walking staff with a knob (not a crook; `grip` = how high above its foot the hand holds it, 1.7 — seated ≈ 2.5 so it reaches the ground; `knob`, `knobSize`, `color`).

## Props

(`props` entries: `type` + options; `in`/`hand` or `at`/`y`, `visible: false` to show later with `show`)
`grapes`, `staff`, `jug` (clay jug held low; it pours: `bend` 0..1 tilts it forward and past half-way a stream of water falls from its mouth (`fall` = how far, 2.2 — 1.5 for someone kneeling; `water` colour); use with the `pour` gesture, kneel ≈ 2.3 studs from what you water), `basket` (`filled: <color>`; `leak: true` = a basket with a hole: a thin stream of grains keeps running out of the bottom (`leakColor`, `leakFall` = how far they fall, 2.4 — use 1.6 for a basket carried in the hand), e.g. `"filled": "sand", "leak": true`; `coins: true` = a heap of gold coins: a gift of money; `"scale": 0.8` when carried; `eggs: true` = eggs in it, `loaf: true` = a small loaf: a gift of food; `broken: true` = it can break: `bend` 0 whole … 1 broken — a torn gap in the side with loose strands, the handle snapped, squashed — `put` it on the ground, then `{ "prop": "cos", "bend": 1, "duration": 0.3 }`), `bread` (`dry: true` = hard, cracked desert bread;
`fresh: true` = golden loaf with rising steam, `steam: false` to turn it off), `cojoc` (sheepskin bundle with loaves,
`bread: "dry"|"fresh"`), `mat`, `stool`, `candle`, `book` (`color`; `ornate: true` = a precious book — bigger, gold corners, gold cross and a red stone: the costly Scriptures; `chest: true` = held in the right hand but centred in front of the chest (sets `userData.twoHands`: the stage raises the holder's other arm too, so it is a book held with both hands; any prop can ask for this); held books look right with `"scale": 0.8`, and the receiver of a held book must stand ≥ 3.2 away (`distance`) or the book touches him — the `inside` check tells you; put one on a `stool` with `"y": 1.6` as a lectern), `prayerRope`, `cross`, `sickle` (secera), `sheaf` (snop of wheat),
`pouch` (money pouch: the pay, a gift of money; `color`), `cloak` (a folded garment lying on the palm: a gift of clothes,
something sold at a stall; `color`, `trim`; the worn version is the look option `cloak`),
`pot` (a black cooking pot / ceaun on three stones over a small flickering fire: `smoke: "big"` = a tall column of smoke seen from far away (default), `"small"` = just steam, `false`; `fire: false`; `color`, `soup`),
`jail` (*temniță*, a gentle toy-like jail: a wooden barred porch built against a house door, open at the back — put it in
front of a house door with `"at": "house5+0,-0.6"` and the prisoner at the same spot; `"open": true` = its barred door is swung
open (keep two props and swap them with `show` on a camera cut to "open" it); `width` 5, `depth` 2.8, `color`, `bars`),
`bowl` (clay bowl of warm soup with a little steam, held flat on the palm — eat from it with the `eat` gesture; `soup`, `color`, `steam: false`),
`icon` (a real Orthodox icon on a wooden board with a gold frame and a soft light behind it, standing on its bottom edge,
facing the anchor's heading (`[x,z]` → facing +Z): `"src": "assets/icons/<file>.jpg"` (public domain, listed in
`assets/icons/SOURCES.md`), `size` = height in studs (4), `glow: false` = no light. Unlit, so it keeps its real colours at night.
This is how the Saviour, the Mother of God, angels and apostles are shown (the Pateric fathers are LEGO monks) — never as minifigs. Camera on it: a `wide` shot
`on` its `[x,z]` with `world: true`, `height` ≈ 0.5, `y` ≈ the icon's middle). To "change" a prop in the
middle of a scene (e.g. dry bread → fresh), keep two props and swap them with `show` on a camera cut.

`tray` (*tavă*, a round wooden tray with round fresh loaves and a small clay jug of wine — food brought as a gift, held in front with
both hands (`"in": "x", "hand": "R"`); `loaves` (3), `jug: false`; `bend` 0..1 = the loaves are taken one by one — swap with `show` of
`bread` props on a camera cut; on a mat `"y": 0.3`). `plankDoor` (a big arch-topped plank door with battens, round bolts and an iron ring;
origin = its hinge, it opens outwards with `bend` 0..1; `w`, `h`, `lift`, `color` — the door of `desert-hermitage`, also usable as a piece).
`sandCell` (the cell of `desert-hermitage` alone, as a piece: `door`, `colors`, `roof`, `frame`, `glow: false`).

`sack` (*sac*, a burlap sack standing open on the ground, its top rolled down, full to a heap: `fill` = `"wheat"` (golden — the good
wheat), `"poor"` (small grey-brown grains — the poor wheat), `"lentils"`, `"coins"` or a colour; `color` of the cloth, `height` 1.9;
`bend` 0..1 = how full — it rests full (1), so `{ "prop": "sac", "bend": 0.7 }` EMPTIES it a little: animate it down while someone takes from it, at the same time as the jar / basket it goes into fills (put that jar beside the sack, on the camera side, so the child sees both levels move); on studs `"y": 0.2`; carried in front with both hands
(`"hand": "R"`, `"scale": 0.7` — it hangs below the hands), `give` it from the ground to pick it up).
`grainJar` (*vas de lut*, a round terracotta pot for grain, held low in the hand like the jug; `bend` 0..1 = filled with grain
(`fill` `"poor"` (default) | `"wheat"` | colour) up to a heap above the rim; `bend` 1..2 = it **breaks**: `put` it on the ground
(`"y": 0.35`), then `{ "prop": "vas", "bend": 2, "duration": 0.4 }` — a broken bottom, shards flying out, the grain spilled in a heap;
`size`, `color`). `basket` with `onions: true` = a basket of red and golden onions with veined skins, roots and sprouts (a gift from the garden; `"scale": 0.7` carried); `bowl: true` = a wide low woven basket with a thick twisted rim and no handle. `jug` with `courses: true` = a toy-brick jug of curved courses with grooves and joints (`joint` colour). `candle` with `holder: true` = on a brass dish with a ring handle and wax drips. `book` with `leather: true` = leather binding, brass corners, raised spine bands, a clasp strap. `cross` with `base: true` = a standing wooden cross on a stepped base. `barrel` (a small wooden barrel of staves with iron hoops; `size`). `chapel` with `belfry: "dome"` = a domed belfry over the front, columns and an arch round the door, an amphora.
`scroll` (a rolled parchment tied with a cord, one end unrolled), `desk` (a low wooden writing table with an ink pot and a quill; top
at 1.6), `torch` (*făclie*, a standing torch on a post with a flickering flame and a warm light; `height` 3.2, `fire: false`), `bed`
(a monk's wooden bed with a straw mattress and a pillow, length along z; `length` 5).

`firewood` (a bundle of logs tied with two ropes — a load of lemne carried across the arms, `put` it down on the ground; `color`), `brick` (a clay brick, *cărămidă*, lying flat; `color`, default dark orange — small enough to hold in one hand and `give`), `knife` (a small work knife — the basket weaver's cuțit — held low with the blade pointing forward, never raised; `"scale": 0.75`
looks right in a minifig hand), `palmLeaves` (a tied bundle of long palm leaves for weaving baskets; `color`; `"scale": 0.45` = one leaf held in the other hand while cutting with the knife — knife and leaves are carried low, at the lap, so `cut` can move the arm), `grains` (a few grains
of barley/wheat on the open palm or on the ground; `n`, `spread`, `color` — keep `spread` ≤ 0.2 when it goes into a hand; film
it on the ground with a `wide` shot `on` its `[x,z]`, `world: true`, small `height`, `y` ≈ 0.3), `camel` (a friendly toy camel,
facing +Z; `sitting: true` = lying down, `sacks: true` = two sacks of grain on its sides, `blanket` colour, `color`; solid for the
`clip` check).

`breadJar` (a big clay storage jar / *chiup* standing on the ground; `full` 0..1: `0` = empty, a dark hollow inside; `1` = brimming with golden loaves heaped above the rim, with steam (`steam: false` to turn it off); `color`, `loafColor`. For the empty -> full miracle keep two jars at the same place and swap them with `show` on a camera cut; film it with a `prop` shot or a `wide` shot `on` its `[x,z]`, `world: true`, `height` ≈ 4, `y` ≈ 1.8).

`net` (*mreajă*, a fishing net: by default a rolled-up net — a rope-coloured roll with mesh rings, a flap of net hanging out and red/white floats — light, held low in one hand (`"hand": "L"`, `"scale": 0.9`; weaving it: `work`, `give` it); `spread: true` = the net lying flat on the ground (`width`, `depth`); `hung: true` = hanging from its top edge, origin at the top middle (`width`, `height`; the `nile-bank` net rack uses it); `color` = twine, `floats` = float colour).

`tree` (a big leafy tree standing on its own — put it anywhere with `at`; it can **bow down**: the trunk curves and the crown comes down towards where the prop faces (+Z for an `[x,z]` place), `bow` degrees (60; 40 keeps the crown above people standing 8 studs in front of it), animated with the `bend` action, 0 = upright, 1 = bowed; the crown sways a little; `height`, `leaves`, `trunk`, `seed`. Film the bow from the side: a `wide` shot `world: true` at 90° to the bow).

`lantern` (*felinar*, a hand-held brass lantern with warm glowing glass and a soft point light — a journey at night: carry it in
`"hand": "L"` (it hangs below the hand like the jug), put it on the ground with `at` at a night camp; `glow: false` = unlit (daytime), `light` = intensity (2.6), `color` = frame).

`sandTrail` (a trail of little sand heaps on the ground along `points` `[[x,z], …]` (world studs — no `at`); `follow: "<actor>"` = only the part behind that actor shows, so the trail grows as he walks along the points (with a leaking `basket`); `lift` = height of the ground under it (0.1 on studs, 0.42 on the tiles of the `desert-road` road), `color`, `step`).

`sapling` (Avva Ioan's dry wood that comes to life: a stick planted in a little mound of earth; its growth is `bend` 0..1 —
set it on the prop or animate it with `{ "prop": "pom", "bend": 1, "duration": 4 }`: 0 = a dry grey stick with three bare
twigs, ≈ 0.38 = green buds, ≈ 0.7 = a small leafy tree, 1 = full of round fruits (`fruit` colour, red); 1 → 2 = the fruits are picked (60 % gone at 2: animate it while people `pick`); `height` (3), `wet: true` = dark,
freshly watered earth; `"mound": false` = just the loose stick, carried in the hand before planting — swap it for the planted one while the planter bows; `"y": 0.2` on studs — keep it off the road tiles; people stand ≥ 3.5 studs from it, or the grown crown hides
their faces). `fruit` (one round fruit with a leaf, held in the hand and given out; `color`; `bend` 0..1 = eaten — animate it during `eat`, it is gone at 1); `basket` with `fruit: true` = a basket full of those fruits; `"fill": true` = it fills as it is picked into: `bend` 0 = empty … 1 = full (show it empty on the cut, animate `bend` during the `pick`).

`coins` (gold coins, *bănuți*, lying on the open palm or on the ground: `n` = how many (3) — up to 4 lie side by side ("only a few coins"), 6 and more make a little heap ("a whole handful"); `spread`, `color`; held on the palm like `grains` — show it on a camera cut to a `prop` shot, then `give` it).

`bird` (*pasăre*, a little toy bird: round dark-grey body, lighter belly, beak, bright eyes, fan tail — seen from afar it could be a pigeon or a crow; `color`, `belly`, `head`, `beak`. Origin = its feet: perch it with `y` (the `nile-bank` net rack crossbar: `"at": [-8.8, -8.04], "y": 7.62`; on studs `"y": 0.45` near tiles). Perched it looks around and bobs its head. It **flies** with `bend` 0..1 along an arc from the perch to `fly` = [dx, dy, dz] (local, default [12, 9, -22]; `arc` 3), wings flapping, facing where it flies; `"back": true` = it comes in to land: `"bend": 1` far away → animate to 0. To fly off again, swap it on a camera cut for a second bird (no `back`) at the same perch. `"scale": 2` on a high perch so children see it).

Props (`PROPS`): the landmarks above (cloister, hermitCell, chapel, gate, bellTower, stoneWell, wall, palm, cypress, leafyTree, bush, rocks, hill, plowedPlot, wheatPatch, bucket, bench, amphora, cart, donkey, campfire, pathTiles, hoe, pitchfork), sack, grainJar, scroll, desk, torch, bed, bird, coins, sapling, fruit, lantern, tree, sandTrail, net, breadJar, firewood, brick, knife, palmLeaves, grains, camel, jail, pot, bowl, icon, cloak, grapes, staff, jug, basket, bread, cojoc, rock, mat, stool, candle, book, prayerRope, cross, sickle, sheaf, pouch.
