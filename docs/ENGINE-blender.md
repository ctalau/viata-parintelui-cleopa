# The Blender engine (`"style": "blender"`) — how it works

Films in this style play live in the browser (three.js) like every other film. The difference is where the
characters, sets and props come from: they are **3D models built by Python scripts that run Blender without a
window** (no hand modelling, no `.blend` files in the repo). Each script writes a `.glb` file (a standard 3D file
format) into `assets/`; the browser loads those files and moves the figures.

What a film can ask for (looks, gestures, actions, sets, props): `docs/DESCRIPTOR-blender.md`.
Fixed measures every asset relies on (figure height, seat height, names of points in a set): `blender/common/CONTRACT.md`.
An illustrated, interactive walk-through of this document (live figure, elbow / beard / cloth / collision demos): `docs/blender-explainer/`.

```
blender/characters/*.py ──► assets/characters/monk.glb (+ .json) ─┐
blender/sets/*.py       ──► assets/sets/<name>.glb (+ .json)      ├─► lib/engine3/  (draws the film; a pure function of time)
blender/props/build.py  ──► assets/props/<name>.glb (+ .json)     ┘        ▲
videos/<id>/video.json ──► lib/engine/timeline.js (who does what, when — the same for every style) ─┘
```

## 0. A few words used below

| word | meaning here |
|---|---|
| **skeleton / bone** | the invisible "wire frame" inside a figure: pelvis, spine, chest, neck, head, upper arm, forearm, hand, fingers, thigh, shin, foot. Moving a bone moves the part of the body attached to it. |
| **clip** | one recorded movement of the skeleton, e.g. `walk`, `bow`, `cross` (the sign of the cross), `offer` (open hand forward). A clip is a list of bone positions over time. |
| **pose** | where every bone is at one moment. The engine builds the pose of each figure for every frame. |
| **layer / blending** | several clips can play at once (walking + carrying a basket + nodding). Each one is a *layer* with a **weight** from 0 (no effect) to 1 (full effect); the engine mixes them. A weight that jumps from 0 to 1 in one frame makes the body *jump* — weights must always change gradually. |
| **mask** | the part of the body a layer may move: a nod moves only the head, pointing moves only one arm. |
| **IK (reach)** | "put the hand *there*, and bend the elbow as needed" — instead of setting every joint by hand. Used when writing clips and at play time (handing over an object, picking a basket up). |
| **skinning / weights** | how much the cloth and skin follow each bone (a sleeve follows the arm, a cloak follows the shoulders a bit and hangs elsewhere). Written as rules in code, never painted by hand. |

## 1. Building the models (`blender/`)

| file | what it does |
|---|---|
| `common/bl.py` | small helpers around Blender; we always give coordinates the way the browser uses them, it converts |
| `common/sdf.py` | builds soft round shapes (beards, hair, hands) from simple formulas |
| `common/textures.py` | makes the surface detail pictures (weave, wool, stone grain) from code — always the same result |
| `common/rigkit.py` | **the rules that decide how cloth and skin follow the bones** (section 4) |
| `characters/monk_model.py` | the monk: skeleton, every body part and every look variant (hats, beards, cloaks), colours |
| `characters/clipkit.py` | the tools for writing clips: "the right hand goes here at 0.5 s", finger shapes, keeping hands out of the body |
| `characters/monk_clips.py` | every clip (idle, walk, hurry, sit, cross, pray, give, …) |
| `characters/build_monk.py` | puts it all into `monk.glb` + `monk.json` — `npm run assets` |
| `characters/nodul_albastru.py`, `characters/build_nodul_albastru.py` | build the three 053 portrait heads and their facial shape keys into `assets/characters/nodul-albastru.glb`. They attach to the shared monk rig. The group portrait uses the same Python source. |
| `characters/build_yarn_elder.py` | the yarn elder's head (look `head: "yarn"`, from cartoons-learning `demos/monk-head`): head, eyes, mouth morphs, wool beard locks (7 bones each), hood → `assets/characters/yarn-elder.glb`; `YARN_WOOL=soft` builds the earlier fluffy beard → `yarn-elder-soft.glb` (look `wool: "soft"`) |
| `sets/<name>.py`, `sets/kit/` | the places (cave, desert road…): ground, walls, marked spots (`anchors`, `seats`), invisible walls for the checks, skies — `python3 blender/sets/build.py <name>` |
| `props/build.py` | objects (basket, jug…), with the point where a hand holds them (`grip`) and their variants (`intact`, `broken`, `new`) — `python3 blender/props/build.py <name>` |
| `preview/render.mjs` | pictures of a set alone, with grey stand-ins for people |

Running a script twice gives exactly the same file. All numbers in the scripts use the browser's axes: **Y is up, a
figure looks toward +Z, its left hand is toward +X, and it is 4.2 tall.**

### How a clip is written (`clipkit.py`)
A clip is a list of moments ("keys"). At each key you say where things are:
* a body part's turn: `c.k('chest', t, forward_tilt, turn, side_tilt)` (degrees);
* where a hand goes: `c.hand('R', t, position, space='chest', eff='palm')` — `space` = the body part the position is
  measured from (so a hand "on the chest" stays on the chest when the figure bows), `eff` = which point of the hand
  goes there (`wrist`, `palm`, finger `tips`…); the elbow bends by itself (IK);
* where a foot goes: `c.foot(...)`; a finger shape: `c.fing('R', t, 'cross')` (three fingers joined for the sign of the cross).

When the clip is saved, every in-between frame is computed and stored as plain joint angles. While computing, a hand
that would pass **through the body** between two keys is pushed out (the body is approximated by a few ovals); clips
where the hand really touches the body (the sign of the cross) allow a closer contact (`clip.touch`).

Extra facts stored with a clip and used when playing it: `hold` (the part of the clip that is stretched when the film
wants the gesture to last longer, e.g. the hands stay joined while praying), `events` (the length of one walking step,
the moment a hand lets go of an object), `loop` (walks and idles repeat), `base='sit'` (made for a seated figure).

## 2. Playing the film (`lib/engine3/`)

The picture at time `t` is computed **only from `t`** — nothing is remembered from the previous frame. That is why a
still, a jump in the web player and the YouTube render always show the same thing.

| file | what it does |
|---|---|
| `timeline3.js` | reads `video.json` with the common timeline code, using this style's timings and the marked spots of the sets |
| `assets.js`, `boot3.js` | loads the `.glb` files |
| `character.js` | one figure: a copy of the monk dressed in its look; mixes the layers into a pose; small corrections (below) |
| `anim.js` | **decides which clips play on a figure at `t`, and how strongly** (below) |
| `face.js` | the printed face (eyes, brows, mouth, blinking), drawn as a picture on the head |
| `yarnhead.js` | the yarn elder's head on the toy body: hung on the chest bone, driven by the head bone; eyes / lids / brows / moustache / mouth morphs from the face state; the wool beard **draped from scratch every frame** (lock lengths, neighbours, a tether, the chest, the forearms and hands) — the demo's inertia would carry state between frames |
| `stage3.js` | builds a scene (set, figures, props), places everything at `t`, and the camera |
| `look.js` | sky, light, shadows, haze, candle flames |
| `collide.js`, `checks3.js`, `clipcheck.js` | the automatic checks (section 5) |

### Which clips play, and how strongly (`anim.js`)
For each figure, in this order (later layers go on top):
1. **standing or sitting still** (`idle`, `sit_idle`), or sitting down / standing up;
2. **walking** — `walk`, or `hurry` (a brisk walk: longer, quicker steps, upright, small arm swing — a run with bent knees
   read as athletics). Two walks in a row are **one walk** (the compiler joins them and rounds the corner: two walks
   used to slow down to a stop at the waypoint). The figure keeps a **steady pace**: it speeds up during the first
   ≈ 0.4 s, walks evenly, and slows down during the last ≈ 0.4 s (`walkEase`). The step cycle follows the distance
   actually walked, so the feet never slide;
3. **little steps while turning on the spot**;
4. **carrying** something (the holding arm; the free arm hangs relaxed);
5. **gestures** from the film (`bow`, `offer`, `cross`, `pray`…) and from objects changing hands (give, take, put, pick up, drop);
6. **talking hands** — small automatic gestures during a longer line (below);
7. **listening** — the head tilts a little while someone else talks.

Rules that keep the movement natural (each one answers a real reviewer note):
* **A gesture grows out of the pose the figure is already in** (hands folded, hands on the knees) and melts back the
  same way, over the whole rise of the clip — never a quick detour through "arms down".
* **A gesture moves only what it needs**: a nod / shake moves the head, `offer` / `point` / `wave` one arm, the other
  arm stays where it was; `bow`, `cross` and others take the whole body when the figure stands still.
* **No layer may switch on or off in one frame.** Every weight rises and falls over a few tenths of a second
  (`windowW`, `talkW`): the listening tilt, the head turning to the speaker, the talking hands.
* **Talking hands are decided for the whole line, never frame by frame.** If the automatic gesture would meet another
  gesture of the same figure, a walk, sitting down / standing up, or a carried object, it is **not played at all**
  (cutting it off when the other gesture started made the hand jump). Seated figures keep their hands on their knees
  while they talk (a gesture made for standing looked like a pointless twitch when sitting).
* **Who speaks looks at the nearest listener, listeners look at who speaks**; when the talk passes from one to the
  other the head turns smoothly (the target is a weighted mix).
* Praying, crossing oneself and bowing close the eyes.
* **A gesture made while seated uses its `_sit` clip** when there is one (`offer_sit` rises from the knee to an open palm
  toward the guest): the standing clip starts from hanging arms, and mixed over the seated pose the hand went through the lap.
* **Turns**: a walk with a final facing bends in during its last steps, so it arrives already facing there (turning the
  body while still walking straight looked like walking sideways; turning after stopping looked like an afterthought); a turn bigger than 125° goes the way that shows the face to the camera.
* **Timing on the words**: `"word": "…"` starts an action on a word of the line (the phrases of the text are matched to
  the pauses of the voice), `"until": <beat>` holds a gesture to the end of a later line.
* **Candle and lamp lights**: only the few flames nearest the camera get a light; a light fades in / out as its flame
  becomes one of them (it used to switch on in one frame as the camera moved — „a bulb lights up behind the icon”).
* A **hug** stands the two on a line across the camera, so both are seen in profile (on a world axis one showed his back).
* `npm run validate` reads the motion from the timeline and prints `motion:` hints for a stop in the middle of a walk and
  for a turn with the back to the camera (`lib/engine3/motionlint.js`).

### Small corrections after mixing (`character.js`)
* `armIK` — puts a hand exactly on a point (two hands meet when an object is handed over; a hand reaches the basket handle);
* `guardHands` — a mix between two good poses can pass a hand through the belly: the hand is pushed back out;
* `craneHead` — a head that bows also comes a little forward, as a real neck does, so the chin does not sink into the chest;
* `solveBeard` — a long beard hangs down and slides over the chest instead of going into it.

### Objects (`stage3.js`)
An object is on the ground, in a hand (held at its `grip` point; `"carry": "side"` = it hangs upright by its handle),
or moving between the two:
* **put / pick up**: the hand goes to the handle and the object sits **exactly** on its spot at the moment it is let go / taken;
* **give**: both hands meet and the object turns gently toward the one who receives it;
* **drop**: it slips, falls in an arc and lands. If it breaks (it has a `broken` variant), it breaks **at the moment it
  hits the ground**, with a short crunch: the whole object squashes for a few frames and the broken one springs up
  out of the squash (so the change reads as a break, not as a swap).

## 3. Commands

```bash
npm run assets                                   # rebuild the monk (≈ 1 min, needs `pip install bpy`)
python3 blender/sets/build.py cave-hermitage     # rebuild one set        python3 blender/props/build.py basket
npm run clipcheck [-- --looks a,b --clips x,y]   # every clip in every look through the body tests (section 5)
npm run char -- --preset looks|faces|clips [--clips cross]        # picture sheets of the figure
node tools/char.mjs --tiles '[{"look":"zenon","clip":"hurry","t":0.2,"view":90,"shot":"full"}]' --cols 4 --out x.jpg
                                                 # any poses side by side; shot: full | bust | face | hands | fingers | low | wide
node blender/preview/render.mjs <set> --sky evening --shots wide,seats
npm run check / still / beats / review -- videos/<id>             # the film itself (AGENTS.md)
```

## 4. Making a figure that can move without breaking (the monk, and any new figure or garment)

The goal: **a figure that can play every clip in every look without a hand going into the head, the beard into the
chest, or an arm or leg poking through the cloth** — proven by an automatic test, not by looking at one picture.

1. **Skeleton.** Named joints in browser coordinates (`J` in the character script), standing, arms down. Keep the
   monk's bone names (`pelvis spine chest neck head`, `clav_ uparm_ forearm_ hand_`, `thigh_ shin_ foot_`, fingers)
   so the clip tools, the masks and the checks work unchanged.
2. **Parts.** Every piece is one named part: *rigid* (stuck to one bone: head, hat, fingers, boots) or *soft*
   (follows several bones: robe, cloak). Look variants (hair, beard, hat, cloak) are parts with a `group` / `variant`;
   only one per group is shown. The part's name tells the checks what it is (`hand_R`, `sleeve_L`, `head`, `beard`,
   `torso`, `skirt`, `leg`, `cloak` — `partClass` in `collide.js`).
3. **How cloth follows the bones — `blender/common/rigkit.py`** (no hand painting, only these rules):
   * `bands` — the body by height: low part follows the pelvis, middle the spine, top the chest;
   * `joint` — a soft bend across one joint (elbow, knee);
   * `follow` — cloth close to a limb follows that limb, less and less further away;
   * `garment` — **every layer worn over the body** (cloak, cape, apron, scarf): it follows the limbs it lies on and hangs
     from the body elsewhere. This is what stops an arm from coming out through a cloak: a raised arm *lifts* the cloth.
     Start with "fully follows within the limb's thickness + 0.15, not at all beyond twice that", and widen until step 5 passes;
   * `report` — checks every point of the mesh follows at most 4 bones and is not forgotten.
   The cut helps too: a long cloak is shaped so the arms hang in front of its edges (see the mantle in `monk_model.py`).
4. **Clips.** Place the hand relative to the body part it moves with. When a look needs a different path (a long beard
   is in the way of the sign of the cross), make a variant named with a suffix (`cross_beard`, `pray_beard`: chosen
   automatically) rather than spoiling the common clip. Use `clip.touch` only for clips that must touch the body.
5. **The body test — `npm run clipcheck`** (≈ 3 min; after every change to a part, a cloth rule or a clip). Every clip ×
   every test look (`TEST_LOOKS` in `lib/engine3/clipcheck.js` — add one for every new hat / beard / garment) is
   sampled 15 times a second on the real posed figure:
   * `inside` — a hand in the head / beard / body, the beard in the chest;
   * `poke` — a leg out through the robe;
   * `through` — **cloth cutting through an arm or leg** (add a pair in `COVER_PAIRS` for every new kind of garment).
   Contacts that are meant to be (a beard resting on the robe) are measured against the figure standing still.
   It must print `no self-collision ✓` before a film uses the figure.
6. **Look at it.** `node tools/char.mjs --tiles …` for the poses that matter (sitting, the cross, praying, running, from
   the side and from behind); then the film's `npm run check` and the beat sheets.

When a test fails, fix it where it starts, in this order: the **cloth rule** → the **shape** of the part → the **clip**
(the hand's path, a variant for that look) → a **correction at play time**. Allowed overlaps are raised only for soft
things that really press flat (hair under a hand, cloth under a resting palm), with a comment saying why.

## 5. The checks of a film (`npm run check`)

`checks3.js` plays the whole film on the real scene (10–20 times a second) and reports, with time, scene and beat:
`self` (a hand in its own body…), `bodies` (two figures inside each other), `set` (a figure in a wall or rock),
`prop` (an object inside a body), `ground` (feet sunk or floating), `camera` (inside a wall, the speaker hidden, shaking),
and **`jerk`**: every figure at 30 frames a second, its hands and head measured relative to the figure itself (so
walking and turning don't count) — **a hand or head that jumps in one frame much more than in the frames around it**
means two poses that were not blended (a gesture cut off, a layer switched on at once). Fix those in `anim.js`
(weights that change gradually), not in the film.
**`snap`**: the head turning faster than a calm movement (> 220°/s over 4 frames, in the world, so a body pivoting on
the spot counts too). Turns take longer the bigger they are (`turnRate` in `timeline3.js`, also in the curve at the end
of a walk), and a look turns its DIRECTION around the head (a look from someone behind to a point ahead used to whip
through the side). What is left is usually the film: a `lookAt` at someone behind the back (the neck reaches ±70° —
turn the body with `face` instead).

## 6. Adding things
* **a gesture**: clip in `monk_clips.py` → its film word in `GESTURE_CLIPS` (`timeline3.js`) and which part of the body
  it moves (`HEAD_ONLY` / `ONE_ARM` / `FULL_BODY` in `anim.js`) → `npm run assets` → `npm run clipcheck` →
  `DESCRIPTOR-blender.md` → `videos/_gallery3`;
* **a garment / hat / beard**: part in `monk_model.py` with a `rigkit` rule → a look in `TEST_LOOKS` → section 4, steps 5–6;
* **a rigged prop from a sculpt** (`blender/props/donkey_fiesta.py`, the model for any other): import the sculpt (kept in
  `blender/props/src/`), weld its UV seams, scale and decimate it; add an armature whose bones all point up with no roll (the
  joints then export with identity rest rotations, so the engine's prop animations — pitch about X, yaw about Y, the same
  `anim` names as on a jointed prop — work unchanged); skin it **by rules** (regions by planes / distances, smoothstep blends,
  ≤ 4 bones); write the `anim` extras into the joints (`patch_glb`); parts that do not bend (saddle, lids, loads) are separate
  meshes, fitted to the sculpt by ray casts. In the engine a GLB with a skinned mesh is cloned with `SkeletonUtils.clone`
  (`stage3.js`), and the `prop` check reads its posed vertices (`applyBoneTransform`, `checks3.js`).
* **a new kind of figure** (child, villager, animal): its own `<name>_model.py` + `build_<name>.py` on the same tools
  (`bl`, `sdf`, `rigkit`, `clipkit`), the same bone names where the body matches, its own `TEST_LOOKS`.
