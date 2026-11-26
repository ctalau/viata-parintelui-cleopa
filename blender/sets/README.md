# Blender sets (sets agent)
Build: `pip install bpy` (5.x), then `python3 blender/sets/build.py [desert-road|cave-hermitage|market-square|river-ford|harvest-field|nile-village|sheepfold|mountain-spring|desert-rock] [--no-bake]` and `python3 blender/props/build.py [basket|oil-lamp|jug|mat|sickle|wheat|sheaf|stook|sparrow|ram|crook|bow|donkey-pack|basket-dates|sack-bread|mat-roll]`. Deterministic (fixed seeds). Textures are numpy-generated (kit/tex.py), AO baked with Cycles. Preview: `node blender/preview/render.mjs <set> [--sky day] [--shots wide] [--quality final|draft]` → blender/preview/out/.

## desert-road
Skies: day, morning. Shots: wide, cell1, cell2, stones, road, reverse.

| anchor | pos | face | note |
|---|---|---|---|
| `cell1` | [-15.319, -0.0, -4.136] | 16.0 | in front of the door, facing out (towards the road) |
| `cell1-door` | [-16.09, 0.0, -6.828] | 16.0 | standing in the doorway, facing out (enter / leave the cell) |
| `cell2` | [16.024, -0.0, -4.581] | -14.0 | in front of the door, facing out (towards the road) |
| `cell2-door` | [16.702, -0.0, -7.298] | -14.0 | standing in the doorway, facing out (enter / leave the cell) |
| `far-left` | [-32.0, 0.0, 2.018] | 0.0 | far left on the road (facing the camera side +Z; turn with face) |
| `road-a` | [-9.0, -0.0, 3.536] | 0.0 | on the road, left of the middle (facing the camera side +Z; turn with face) |
| `road-mid` | [0.0, -0.0, 4.367] | 0.0 | middle of the road (facing the camera side +Z; turn with face) |
| `road-b` | [9.0, -0.0, 4.98] | 0.0 | on the road, right of the middle (facing the camera side +Z; turn with face) |
| `far-right` | [32.0, -0.0, 4.657] | 0.0 | far right on the road (facing the camera side +Z; turn with face) |
| `stones` | [3.0, -0.0, 4.206] | 0.0 | on the road just behind the stone patch, facing it (+Z): a basket dropped here lands on the stones |
| `offstage-left` | [-62.0, 3.453, 3.725] | 90.0 | out of frame, left end of the road (enter walking +X) |
| `offstage-right` | [62.0, 3.07, 2.19] | -90.0 | out of frame, right end of the road (enter walking -X) |
| `offstage-front` | [2.0, 7.148, 40.0] | 180.0 | out of frame towards the camera |
| `palm-shade` | [-6.5, -0.005, -19.5] | 20.0 | in the shade of the back palms, facing the camera |

Collision: col:cell1/col:cell2 (closed walls), col:palmN, col:rockN, col:bushN, col:stoneN (big stones of the patch), col:cellN-jar. The doors are separate nodes door:cell1 / door:cell2 with the origin on the hinge (rotate about +Y to open, negative angle opens outwards to the right). Ground meshes: ground (core, unique texture) and ground_far (dunes); both are walkable and raycastable. Decoration is never on the road / paths.

## cave-hermitage
Skies: evening, night. Shots: wide, seats, icon, side.

| anchor | pos | face | note |
|---|---|---|---|
| `seat-elder` | [-0.554, 0.0, -9.692] | 70.0 | stand here before sitting down on seat:elder |
| `seat-guest` | [0.554, 0.0, -9.692] | -70.0 | stand here before sitting down on seat:guest |
| `pray-a` | [-5.0, 0.0, -13.0] | 180.0 | praying spot left, facing the icon |
| `pray-b` | [-3.0, 0.0, -13.0] | 180.0 | praying spot right, facing the icon |
| `icon` | [-4.0, 2.78, -17.6] | 0.0 | the icon on its shelf (prop target; y = shelf top) |
| `inside` | [0.0, 0.0, -8.0] | 0.0 | middle of the cave, facing out |
| `entrance` | [0.0, 0.0, -3.5] | 0.0 | in the cave mouth, facing out |
| `outside` | [-2.0, 0.0, 5.0] | 180.0 | outside the mouth on the path, facing in |
| `path` | [-8.0, 0.0, 12.0] | 150.0 | on the path coming in from the front left |
| `offstage` | [-24.0, 0.0, 26.0] | 140.0 | out of frame, front left |
| seat `elder` | [-1.4, 0.62, -10.0] | 70.0 | top centre of the sitting stone |
| seat `guest` | [1.4, 0.62, -10.0] | -70.0 | top centre of the sitting stone |

First version. The cave is open towards +Z (mouth 15 wide, 7.5 high): film from the front or from inside.

## river-ford
Skies: day, morning, evening. Shots: wide, ford, bank.

A green river through the desert, flowing along Z (towards the camera); the ford at z = 2 is crossed along X. The bed (`ground`) is walkable: feet go down into the water (≈ 0.6 deep at the ford, 0.8 in the middle elsewhere). `water.river` is a separate semi-transparent node with `anim: flow` (normal map scrolled downstream, lib/engine3/look.js). Anchors: bank-left, water-left, ford-mid, water-right, bank-right, path-left, path-right, offstage-left/right, downstream, upstream (positions in assets/sets/river-ford.json). Collision: col:palmN, col:reedsN, col:rockN, col:bushN. New kit pieces: critters.reeds (reed clump with cattails), critters.duck.

## harvest-field
Skies: morning, day, evening. Shots: wide, edge.

A golden wheat field (z < edge ≈ −3) built from tiles that share one mesh (front rows `wheat.bandN`, ears over a golden canopy `wheat.earsN`, `wheat.canopy`): every node has extras `anim: wind` (look.js bends the vertices by height² in waves across the world) and `field: standing`; the reaped state (`field: reaped`: `stubbleN`, `stookN`) is picked by the set option `reaped` (stage3). The farmer's house (door node `door:house`), two granaries, a fig tree, hens, a donkey, doves, butterflies. Wheat kit: `kit/wheat.py` (stalks with shared verts, sheaf, stook, sparrow, sickle). Anchors in assets/sets/harvest-field.json.

## nile-village
Skies: morning, day, evening. Shots: wide, door.

A green Nile village (film 046): the monk's white cell in the middle (door node `door:cell`, opens outwards; an open front window
right of the door, `pieces.cell(front_window=…)`, sill 2.9 high — a figure at anchor `window-in` looks out of it); the cell's
walls are thin collision boxes, so the inside is free (`cell-in` behind the door). A fig tree with a mud-brick bench (seats
`bench-a…d`), houses with turquoise doors, two pigeon towers (`critters.dovecote`, doves on the perches peck), goats and a kid
(`critters.goat_parts`: head `browse`, tail `swish`), hens, a donkey, a camel, a cat, a well, a vegetable garden, a pond with
ducks and reeds (`water.pond`, anim `flow`), butterflies, palms. Anchors in assets/sets/nile-village.json.

## sheepfold
Skies: day, morning, evening, night. Shots: wide, gate.

A green Cyprus hillside (film 047): an oval dry-stone sheepfold (a rubble core `tube` along the oval + three courses of
stones + capstones; open at the gateway) with a gate node `door:gate` (hinge on the left post, opens inwards), sheep
(`critters.sheep_parts`: wool = an ellipsoid covered with curls; head `browse` / `ruminate`, tail `swish`; a hopping lamb with
anim `hen` + `hop`), the shepherd's stone house (`door:hut`), straw beehives, an old olive tree (`critters.olive_tree`,
`perch_angle` = a bare branch under the leaves) with an owl (`critters.owl`, head `peck`), a bunny, cypresses
(`critters.cypress`), poppies, a far white town with a church. Props of the same kit: `ram` (`critters.sheep_parts(..., horns=True)`), `crook`.

## mountain-spring
Skies: morning, day, evening. Shots: wide, spring.

The old monk's garden with a spring high in a red desert mountain (film 048, Avva Antonie and the hunter's bow): a cave
cell dug into a red rock outcrop (`core.rock` + `pieces.boolean`: an arched doorway with a wooden door 1.6 deep, a little
window; boulders piled round it; collision `col:cell`, `col:cellrockN`), a reed awning with woven baskets
(`critters.basket_simple`, a dyed band on one) and doves, a clay jar, a vegetable garden and a melon bed (`critters.garden`), a spring: water
(`water.fall`, anim `flow`) pours from a cleft between red rocks into a small pool (`water.pond`) with a rim of stones and foam, reeds and doves drinking, date palms, flowering oleanders (pink blossoms on
`pieces.bush`), a walking tortoise (`critters.tortoise_parts`, anim `hen` with `speed` 0.2 and `legs`), a lizard, a hare (`critters.bunny`, scaled 1.2) by a bush, butterflies, near red cliffs
(`pieces.mesa` with the `redstone` sandstone tint) and far buttes. Two paths from the front left and right meet in the yard.
Prop of the same film: `bow` (`props/build.py`: variants s0 … s8 = the string drawn, see the clips `draw1…3` in `monk_clips.py`).

## props of film 049 — the pack donkey
`kit/donkey.py`: Urechilă (`donkey-pack`) in moving parts — head (`browse`, and a bray from the stage's `walkState`), ears (`ear`),
lids (`blink`), jaw (`jaw`), tail (`swish`), legs (`gait`: step with the distance walked), bell (`sway`) — and the loads it carries
(`basket-dates`, `mat-roll`, `sack-bread`): the same meshes make the free props and the loaded variants `l0 … l3`, and `SLOTS`
says where each hangs (exported as the prop meta `slots`, used by `put … "into"`). The saddle, blanket, girth and loads are fitted
to the body by ray casts against its ellipsoids (`_out`), so nothing floats above or sinks into the donkey.

## desert-rock
Skies: morning, day, evening. Shots: wide, schit.

„Piatra” (film 050, Avva Moise and the rain): a dry honey-stone place with the big Rock, the stone cell and — towards the camera
side — the white cell of the schit. Both cells are AI concept models (`assets/3d/chilie-piatra.glb`, `chilie-alba.glb`, see
`assets/3d/HANDOFF.md`) brought in by `kit/aimesh.py`: `load` → `drop_loose` (floating specks) → `cut` (the painted door: every face
inside the doorway outline, just behind the wall face) → `fit` (scale, model z of the door sill → ground) → `finish` (placed,
renamed, materials made matte/glossy). `house()` in `desert_rock.py` then adds the doorway's reveal (`_jamb`), a dark room behind it
(`_room`, faces inward, no front), a plank door leaf with iron straps and a ring on a hinge (`door:<name>`, origin = hinge, in front
of the wall face) and thin collision walls with the doorway free. The json carries `doorLeaves` for the validator. To use another
AI house: measure its door in the front view (`x0, x1`, top of the straight part, the sill z, the wall face y) and pass them to `house()`.

## bakery-yard
Skies: morning, day, evening. Shots: wide, table.

„Pităria” (film 051, Avva Teodor and the bread he made for six brothers): the bakery yard of a desert lavra. AI set dressing
(`assets/3d/pitarie-*.glb`, made with `node tools/image-to-3d-batch.mjs assets/3d/pitarie.json`: Nano Banana paints a 2×2
turntable sheet, Nano Banana cuts it out on chroma green (no shadows / pedestals), Hunyuan3D-2mv builds the shape — 1K sheet,
8 000 faces, 512 px texture for small things; 1K, 15 000, 1024 for medium; 2K, 30 000, 2048 for large) fitted by `ai_piece()`.
The oven is not part of the set: it is the prop `bread-oven` (`blender/props/bakery.py`, it changes state), placed by the film on
`OVEN`; the set keeps that spot free and gives the anchors `oven`, `oven-back`, `oven-side` round it. Kneaders stand at `table`
(the `dough-trough` prop on the table top, y 1.55). Props of the same film: `bread-oven`, `bread-peel`, `dough-trough`,
`bread-basket`, `flour-sack` (`python3 blender/props/build.py bread-oven …`).
