# Blender pipeline contract (characters ↔ sets/props)

Both agents follow this file. Changes go under **Changes** at the bottom (dated), never by silently editing above.

## Units, axes
* **World units = the current engine's units** (`lib/components/minifig.js`, `MINIFIG_HEIGHT = 4.4`). 1 unit ≈ 1 "stud pitch ×1.25"; just think "the figure is 4.2 tall".
* Blender: author Z-up, export glTF with `export_yup=True` → **glTF/three.js Y-up**. Ground is `y = 0` at the set origin.
* A figure at rotation 0 **faces +Z** (three.js). In Blender that is **−Y** (glTF exporter maps Blender −Y → +Z). Anchors' / seats' facing = their local +Z in glTF (= Blender local −Y; in practice: rotate the empty so its −Y points where the actor should look, or simply set the empty's three.js rotation.y — the runtime reads the world quaternion and takes its +Z).
* Angles in video.json are degrees, `face: 0` = +Z, `face: 90` = +X (same as the existing engine).

## The character (owned by the characters agent; numbers are fixed now)
| measure | value |
|---|---|
| total height, bare head | **4.20** |
| total height with cowl / cap | ≈ 4.45 |
| eye height | 3.45 |
| shoulder height | 2.70 |
| hip (pelvis) height | 1.45 |
| knee height | 0.75 (legs are short, toy-like: thigh 0.70, shin 0.63) |
| footprint (standing, robe hem) | radius **0.95** around the origin |
| shoulder width (arms at rest) | 2.0 |
| walking clearance needed | a path 2.2 wide |
| **seat height** (top of a seat) | **0.62** (range 0.5–0.75 works; the sit clip is authored for 0.62, the runtime shifts the pelvis for others) |
| seat depth needed | ≥ 0.9 in front of `seat:` centre is free for the legs |
| door / arch for walking through | ≥ 5.2 high, ≥ 2.0 wide |
| two actors talking | 2.4–3.2 apart; give/take is authored at **2.3**, hug at **1.35** (pelvis to pelvis) |
| hand (grip) reach height when holding at the side | 1.55; carried in front 2.05 |

## Sets — `assets/sets/<name>.glb` + `assets/sets/<name>.json`
* Node names (exact prefixes, the runtime matches on them):
  * `anchor:<name>` — empty. Position = where an actor / prop / camera target stands (on the ground: y = ground height there). Facing = local +Z (three.js).
  * `seat:<name>` — empty at the **top-centre** of a sitting surface, +Z = facing of the sitter.
  * `cam:<name>` — optional empty for a preset camera position (its −Z looks at the subject, like a three.js camera), optional.
  * `col:<name>` — mesh, simplified **closed** collision shape (box / convex hull / low-poly) of walls, rocks, furniture, tree trunks. Hidden at runtime, used by the validator and the camera-inside-wall check. Everything a figure could walk into or a camera could end up inside needs one.
  * `ground` / `ground*` — mesh(es) of walkable surface. The runtime raycasts straight down onto them for feet. They must be **one-sided upward-facing**, without holes on paths, and without thin decorative geometry: grass blades, pebbles, flowers are **separate meshes not named ground*** and must be lower than **0.08** above the ground surface on paths and anchors, or cleared within radius 1.2 of every `anchor:` / `seat:` and along obvious paths.
* `assets/sets/<name>.json`: `{ "name", "anchors": { "<name>": { "pos":[x,y,z], "face": deg } }, "seats": {…}, "bounds": [[minx,miny,minz],[maxx,maxy,maxz]], "skies": ["morning","evening",…], "notes": "…" }` — the same data as the empties, so Node tools (validate, timeline) can read anchors without parsing GLB.
* No lights, no cameras in the GLB. Materials: glTF PBR (`KHR_materials_*` that three r170 supports are fine). Keep each GLB ≲ 6 MB, textures ≤ 2048², JPEG/WebP-in-glTF or PNG; no Draco/meshopt (the runtime ships no decoder).

## Props — `assets/props/<name>.glb`
* Origin at its **base centre** (rests on the ground at y = 0 when placed).
* Empty **`grip`** = where the hand holds it. The runtime puts the hand socket's origin on `grip` with the same orientation: grip local +Y = along the fingers' closing axis up (the handle direction), grip local +Z = away from the palm (forward of the hand). For a two-hand prop add `grip.L` and `grip.R`.
* Variants: separate named root nodes (`intact`, `broken`, `full`, `empty` …), the runtime shows one. Animation clips inside the prop are allowed (e.g. `fall`, `open`) and are evaluated with the same time-pure mixer.
* Optional `col` mesh (child) = simplified collision proxy; else the validator uses the bounding box.
* Optional `assets/props/<name>.json`: `{ "hands": 1|2, "carry": "side"|"front"|"chest", "variants": [...], "notes": "" }`.

## Look-dev — `lib/engine3/look.js` (sets agent)
`export function setupLook({ THREE, renderer, scene, camera, sky, set, quality })` → `{ render(t), resize(w, h), dispose() }`.
* `sky` = video.json scene `sky` string (`morning`, `day`, `evening`, `night`, …); `set` = the loaded set's root `Object3D` + its json at `set.userData.meta`.
* `render(t)` must draw the frame (renderer.render or a composer) and be a pure function of `t`.
* `quality` = `'final'` | `'draft'` (headless SwiftShader stills use draft: smaller shadow maps, no heavy post).
* Characters use `MeshStandardMaterial`/`MeshPhysicalMaterial` and cast + receive shadows; look.js must not override them.
* Until `look.js` exists the runtime uses its own fallback (`lib/engine3/look-fallback.js`).

## Characters (for reference of the sets agent)
`assets/characters/monk.glb` — one skinned figure with every clip; runtime clones it per actor. Sockets: `hand.R`, `hand.L`, `head_top`, `beard`, `chest`, `back`.

## Changes
* 2026-11-11 (characters): GLTFLoader strips `:` and `.` from node names — the runtime matches the ORIGINAL name in
  `object.userData.name` (`anchor:x`, `seat:x`, `col:x`, `ground*`, `grip`). Keep the exact prefixes.
* 2026-11-11 (characters): hug is authored at **1.55** pelvis to pelvis (not 1.35). Seated root = the FEET, 0.5 in front
  of the `seat:` centre (anchor `seat:<name>` in the layout means that point).
* 2026-11-11 (characters): sockets are `hand.R`, `hand.L`, `fingertips.R/L`, `head_top`, `beard_tip`, `chest_front`, `back`, `face`.
* Props without a GLB fall back to the procedural lego prop (grip guessed): please ship `assets/props/<name>.glb` with a `grip`.

### Changes / requests from sets (sets agent)
* 2026-11-11 — **three.js strips `:` from node names**: GLTFLoader sanitizes `anchor:cell1` → `.name = "anchorcell1"` and keeps
  the original in **`.userData.name`** (`"anchor:cell1"`). Match prefixes on `o.userData.name ?? o.name` (look.js does).
* 2026-11-11 — sets also export **`door:<cell>`** nodes (door leaf, origin on the hinge; rotate about +Y to open) and the json
  lists them under `"doors"`. Set json extras used by look.js: `"sky": { "<preset>": { sunAz, sunElev, … } }` (per-set sun
  direction), `"shadow": { center:[x,z], radius }` (max shadow area), `"lights": [{ pos, color, intensity, distance, flicker }]`
  (static warm lights, e.g. the cave's lamps), and `"shots"` (suggested cameras `{ pos, target, fov, note }`).
* 2026-11-11 — any mesh named `flame*` (props or sets) is treated by look.js as a lamp/candle flame: it gets a warm
  flickering point light (pure function of t) and bloom. Its optional `userData` (glTF extras) `lightColor`, `lightIntensity`,
  `lightDistance` tune it. Keep flames out of character GLBs.
