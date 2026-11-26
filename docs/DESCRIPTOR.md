# `video.json` — descriptor reference

Every film lives in `videos/<NNN-slug>/video.json`. The renderer, the voice tool and the
recorder all read **only** this file (+ the generated `audio/`). Everything is deterministic:
the same descriptor + audio always gives the same film.

**This file = what every film uses.** Then read ONLY the file of the film's style (`npm run next` prints this too):

| style | top level | read also |
|---|---|---|
| LEGO 3D (default) | — | [`DESCRIPTOR-lego.md`](DESCRIPTOR-lego.md): looks, sets + anchors, props |
| blocky toy town | `"style": "blocky"` | `DESCRIPTOR-lego.md` + [`DESCRIPTOR-blocky.md`](DESCRIPTOR-blocky.md) |
| 2D storybook | `"engine": "2d"` | [`DESCRIPTOR-2d.md`](DESCRIPTOR-2d.md) |
| 2D like the Pateric drawing | `"engine": "2d", "style": "pateric"` | `DESCRIPTOR-2d.md` + [`DESCRIPTOR-pateric.md`](DESCRIPTOR-pateric.md) |

Staging lessons learned (cameras, walks, postures, voices): `.claude/skills/plan-video/SKILL.md` → “Past issues”.

## Top level

| key | meaning |
|---|---|
| `id` | folder name, e.g. `001-strugurele-lui-macarie` |
| `title`, `source`, `lesson`, `audience`, `language` | metadata (title also used for the title card) |
| `format` | `{ "width": 1920, "height": 1080, "fps": 30 }` (landscape 16:9 by default; use 1080×1920 for vertical shorts) |
| `voiceModel` | OpenRouter TTS model, default `google/gemini-3.8-flash-tts` |
| `voiceTempo` | speed-up factor applied to all voices (pitch preserved), e.g. `1.1`; per character `voice.tempo` overrides |
| `style` | optional: `"blocky"` = the film is in a **blocky toy-town style** (Brookhaven-like): every figure gets `look.style: "blocky"` (square head, box torso/arms/legs) and every set is built smooth (`"smooth": true`, no studs). A cast/character look can still override it (`DESCRIPTOR-blocky.md`) |
| `engine` | optional: `"2d"` = the film is a **hand-drawn 2D cartoon** (see `DESCRIPTOR-2d.md`) instead of LEGO 3D: storybook characters, a painted set, the same timeline, voices, beats and actions |
| `render` | optional: `"vivid"` = the rich toy-photo look (like a poster illustration): glossy plastic reflecting a soft studio light, rounded brick edges and studs, ambient occlusion in the gaps, a glow round bright lights, a soft background on close shots, saturated warm colours, deeper skies and cartoon faces (big glossy eyes, open smiles visible under the moustache). Object form `{ "preset": "vivid", "exposure": 0.92, "env": 0.3, "bloom": 0.28, "ao": 0.9 \| false, "dof": 1 \| false }`. Heavier to render (phones get it without the post effects). Old films without it are unchanged |
| `logo` | default on: the Școala Evlaviei logo (lamp with olive branches, no text — `assets/branding/logo-scoala-mic.webp`) in the top-left corner of every frame; `false` = no logo; a name picks one of the old drawn toy-brick `LOGOS` in `lib/engine/overlay.js` (`flat`, `yellow`, `blue`, `bricks`, `monk`, `iso`). Posters never show it: they carry the badge (see `poster`) |
| `captions` | default `false` (4-year-olds don't read — the story must be told by voices, faces and gestures). `true` → speech bubbles at the bottom, for parents / silent autoplay |
| `music` | `{ "prompt": "...", "volume": 0.13 }` → `npm run music` creates `audio/music.mp3` (Lyria), looped under the voices. `false` = no music |
| `poster` | the catalog card / YouTube thumbnail (`poster.jpg`, `npm run poster -- videos/<id>`). **Preferably an object = a picture composed only for the poster**, not a frame of the film: `{ "set", "sky", "cast", "props", "camera", "do", "t" }` like one scene — the main characters side by side up front, facing the camera with happy faces, holding the main objects (the gift, the bread…), the key object on the ground in front, the set behind; `do` = gestures (`wave`, `offer`) caught at second `t` (1.2). A low `wide` camera (`height` ≈ 2.4, `dist` ≈ 10, `y` ≈ 3) fills the frame; keep the bottom-left corner free: every rendered poster gets the Școala Evlaviei badge there (`assets/branding/badge-scoala.png`, 25% of the width). A number = the second of the film to use instead; `"file"` = a hand-made poster is committed as `poster.jpg` and the tools never overwrite it |
| `youtube` | optional overrides for the upload: `{ "title", "description", "tags": [], "privacy", "categoryId" }` (defaults built from title/lesson/source, made for kids) |
| `characters` | map `id → character` (see below). `narrator` has no `look` (never shown) |
| `scenes` | ordered list of scenes |

## Characters

```json
"macarie": {
  "name": "Părintele Macarie",        // shown on caption chip (never „Sfântul …” — AGENTS.md rule 15)
  "color": "#c98a12",                 // caption chip / bubble border
  "look": { "preset": "elder-monk", "cross": true, "beardColor": "white" },
  "voice": { "voice": "Charon", "style": "Bunic blând și bun, voce caldă; ritm natural", "tempo": 1.0 }
}
```

Characters without `look` are **voice-only** (the narrator; the Saviour, the Mother of God, angels, apostles — AGENTS.md rule 15): they speak but must never be in a `cast`.

`look` = preset + overrides: LEGO / blocky → `DESCRIPTOR-lego.md`, 2D → `DESCRIPTOR-2d.md`. A **cast entry** can override the look for one scene
(`"cast": { "avva": { "at": "road", "look": { "cloak": false } } }`) — e.g. a garment given away.

`voice.voice` is a Gemini voice name: Zephyr, Puck, Charon, Kore, Fenrir, Leda, Orus, Aoede, Callirrhoe,
Autonoe, Enceladus, Iapetus, Umbriel, Algieba, Despina, Erinome, Algenib, Rasalgethi, Laomedeia, Achernar,
Alnilam, Schedar, Gacrux, Pulcherrima, Achird, Zubenelgenubi, Vindemiatrix, Sadachbia, Sadaltager, Sulafat.
`voice.style` is sent as TTS *instructions* (never put it in the text — it would be read aloud).

## Scenes

```json
{
  "id": "ioan",
  "set": { "type": "desert-lavra" },     // set builder (lib/components/sets.js)
  "sky": "day",                          // day | morning | evening | night | dream (glowing lilac night: dreams, visions)
  "transition": "fade",                  // fade (black) | white | cut — how this scene starts
  "lead": 0.3, "tail": 0.3,              // seconds of air before the first / after the last beat
  "cast":  { "ioan": { "at": "cell2+0,1", "posture": "sit", "emotion": "sick", "face": "macarie", "seat": 1.6 } },
  "props": { "grapes": { "type": "grapes", "in": "macarie", "hand": "R" },
             "mat":    { "type": "mat", "at": "cell2+0,1.4", "y": 0 } },
  "camera": { "shot": "medium", "on": "ioan" },   // camera at scene start
  "beats": [ ... ]
}
```

Only actors listed in `cast` exist in a scene (positions reset every scene).

### Places (`at`, `walk`, `place`, `on`, `face`)
* `[x, z]` world coordinates in studs.
* anchor name from the set layout — the anchors of each set are in `DESCRIPTOR-lego.md` / `DESCRIPTOR-2d.md`.
* `"anchor+dx,dz"` — offset in the anchor's local frame: `dz` forward (towards where the anchor faces),
  `dx` sideways. E.g. `cell1+0,-3.2` is just inside the door of cell 1.
* an actor id (for `walk`/`face`): walk up to that actor and stop `distance` (default 2.2) in front of them.
* **Walks keep people apart (2D sets):** a `walk` goes around the other people (in front of / behind them, where they are
  when the walker passes) and around the buildings, by itself — no hand-made waypoints (`"avoid": false` = straight line).
  Two walks of the same actor in one beat run one after the other (the second waits for the first). `"after": "<actor>"`
  on any action starts it when that actor's last walk is over (+ `at`), e.g. `{ "prop": "book", "show": true, "after": "x" }`.
  `npm run validate` warns when two people stand inside each other (at every beat start / end of a move).
* `face`: also a number in degrees (world heading: 0 = towards +Z) or `"camera"` = **the same as 0** (towards +Z, where the default wide shots stand) — it does NOT turn to the current shot's camera.

## Beats

Beats play **sequentially**. A beat lasts as long as its line (+ `pause`, default 0.35 s) and the
longest action that has `wait` ≠ false, or `duration` if longer.

```json
{ "say": "macarie", "text": "Mulțumesc, fiule!", "style": "foarte bucuros", "emotion": "joy",
  "sayAt": 0.8, "pause": 0.5, "duration": 3,
  "camera": { "shot": "two", "on": ["omul", "macarie"] },
  "card": { "title": "Sfârșit", "subtitle": "…", "y": 0.2 },
  "do": [ { "give": "grapes", "from": "omul", "to": "macarie" } ] }
```

* `say` / `text` — the line (voiced by `/voice`). `style` adds per-line delivery instructions.
  `emotion` sets the speaker's face from the start of the line. The speaker's mouth follows the audio loudness.
* `sayAt` — delay the line inside the beat (e.g. let a `give` start first).
* `with` — other characters say the same line together with the speaker (`"with": "zenon"` or a list): `/voice` voices it with
  every voice and mixes them into one file (aligned at the first word); all their mouths move. E.g. a prayer said together.
* `card` — big title text overlay for the duration of the beat.
* `sounds` — optional sound effect cues, e.g. `[{ "file": "clap.mp3", "at": 0.5, "duration": 0.24, "volume": 0.6 }]`.
  Files live in the film's `audio/` directory. `at` is seconds after the beat starts. Keep `duration` equal to the clip length.

### Actions (`do`: object or list). Common keys: `at` (delay in s), `wait` (false = don't extend the beat), `duration`.

| action | example |
|---|---|
| walk | `{ "actor": "ioan", "walk": "cell3+-9,3", "speed": 1.4, "style": "slow", "face": "pavel" }` (speed in studs/s, default 2.4; style `normal`/`slow`). Walking to an actor stops `distance` in front of them (within `maxAngle`, default 55°, of where they face; +1 if they sit) |
| hug | `{ "actor": "a", "hug": "b" }` — `a` walks to `b`'s side (the side he comes from; `"side": "left"/"right"` forces it, `distance` 1.65), both turn to face each other (heading ±90°) and hug for `duration` (2.8). Gap 2.0, the one who comes stands 0.35 nearer the camera. In 2D pateric both stay turned ≈ 45° to the camera, lean in and touch temple to temple (never face to face), arms around the other's shoulders and back; the pair may stand close (no `overlap`). Don't build a hug from `walk` + `face` + `gesture: hug` by hand |
| teleport | `{ "actor": "x", "place": "cell1" }` |
| turn | `{ "actor": "x", "face": "macarie" }` |
| gesture | `{ "actor": "x", "gesture": "wave", "hand": "L" }` — `wave nod shake bow cross pray jump bounce cough offer think knock clap point shrug look hug sniff eat wipe pour pick reap sow work cut hungry` (`sow` = sow grain: the left hand holds the seed `basket` (`"hand": "L"`, `filled`) at the hip, the right hand dips into it and flings the grain out in a wide arc, three throws — walk a few steps between two `sow`s; `pick` = pick fruit: the right hand reaches up to a branch and down to a basket, twice — stand ≈ 1.5 from the tree; `pour` = the right arm held forward, eyes down, to pour from a `jug` — tilt the jug with `{ "prop": "ulcior", "bend": 1, "duration": 0.7 }` and back with `"bend": 0`; `cut` = cut with the knife held in the right hand (`"hand": "L"` if the knife is in the left): the knife hand strokes, the other hand holds the leaf still — never `work` for someone holding a knife; `eat` = hand with food to the mouth and chew; `work` = busy hands in front at the lap (weaving, cutting leaves — good seated);
`hungry` = rubbing the tummy; `wipe` = wipe the brow, tired; `reap` = bend and sweep the sickle low, 3 strokes — hold the sickle in `"hand": "L"` and reap with `"hand": "L"` so the right hand stays free for the sign of the cross) |
| emotion | `{ "actor": "x", "emotion": "happy" }` — `neutral happy joy sad surprised thinking sick warm sleepy asleep angry ashamed` (`asleep` = eyes shut) (`angry` = brows pulled down + red cheeks, cross but never scary — a headscarf covers the brows, so give an angry character `hat: "none"` + `hair`; `ashamed` = eyes cast down, big blush: someone who did wrong and is sorry) |
| posture | `{ "actor": "x", "posture": "sit" }` — `stand sit lie kneel` (`seat` on the cast entry = seat height, 1.6 for a stool; `tilt` on the cast entry of a lying actor = degrees the torso rises at the waist, legs stay flat on the ground — `"tilt": 25` rests the head on the knees of someone sitting on the ground: the sitter faces 0, the lier faces 90 with his feet ≈ 3.65 to the side of the sitter's knees; `lift` on the cast entry of a lying actor = extra height above the ground, e.g. `"lift": 0.25` for someone lying on a `mat` over studs, so the body does not sink into them) |
| give | `{ "give": "grapes", "from": "a", "to": "b", "hand": "R" }` — prop flies hand to hand, both arms animate |
| put | `{ "put": "grapes", "on": "cell2", "y": 5 }` — prop flies to a place |
| show/hide | `{ "actor": "x", "show": false }` / `{ "prop": "grapes", "show": true }` |
| bend | `{ "prop": "copac", "bend": 1, "duration": 4 }` — animates a prop's own pose value from where it is to `bend` (0..1; start value = the prop option `bend`, else the prop's resting value: 0, but a `sack` rests full = 1 and a `bird` with `back` far = 1 — `bendRest()` in `props.js`; a new prop that rests elsewhere than 0 must be added there). Used by the `tree` (bows down / straightens up) |
| ride | `{ "actor": "sick", "ride": "agathon" }` — piggyback: `sick` rides on `agathon`'s back and follows him (walks included); the carrier holds the rider's legs. `{ "actor": "sick", "ride": false }` gets off (back to the rider's own place/posture — combine with `place`). Instant: do it on a camera cut. Cast key `"ride": "agathon"` starts a scene already riding |

`cross` is the Orthodox sign of the cross (forehead → chest → right shoulder → left shoulder, small bow).

### Props
`props` entries: `type` + options; `in`/`hand` (held) or `at`/`y` (placed); `visible: false` to show later with `show`.
The prop types: `DESCRIPTOR-lego.md` (3D) / `DESCRIPTOR-2d.md` (2D).

### Camera shots (`camera` on scene or beat)
| shot | keys |
|---|---|
| `wide` | `on` (anchor, `anchor+dx,dz`, actor, prop or [x,z]), `dist` 24, `height` 9, `angle` (deg, relative to the anchor's facing), `y` look-at height |
| `medium` | `on` actor; full figure. `dist` 9.5, `height` 2.2, `angle` 22 (or `"auto"`, see `close`) |
| `close` | `on` actor; face close-up. `dist` 4.4, `angle` 15 (rotate if another figure blocks the view). **`"angle": "auto"`** = the first of 15, -15, 30, -30 … ±90 whose line of sight is clear of every other actor (at the start and the end of the shot, so it never jumps) — use it for every close-up in a dialogue; it does not see walls, so check the stills |
| `two` | `on: [a, b]`; frames both, from the open middle of the set. `side: "flip"` for the other side |
| `prop` | `on` prop; close-up from the front of whoever holds it. `angle`, `dist` 3.2 |
| `top` | bird's-eye over the set centre. `dist`, `height`, `fov` |

`world: true` (wide/medium/close): `angle` is measured in world space (0 = camera at +Z) instead of from the subject's facing.

Common: `fov` (40), `move` (`push` `pull` `orbit` `rise` `drift`, spread over the life of the shot; `orbit` uses
`orbit` degrees), `ease` (seconds to glide from the previous shot instead of cutting).
A beat without `camera` keeps the previous shot.

## Generated files
* `audio/<hash>.wav` + `audio/lines.json` — one file per line, hash of model+voice+instructions+text+tempo.
  `lines.json` stores duration and a mouth envelope (30 fps). Edit a line → only that line is re-voiced.
* `audio/music.mp3` — background music.
* `poster.jpg` — 640×360 still for the web catalog and the YouTube thumbnail (`npm run poster`, committed).
* `youtube.json` — written by the upload: video id, URL, privacy, hash of `video.json`+`lines.json` (committed).
* `out/draft.mp4` (half res, `--draft`) and `out/<id>.mp4` (final 1920×1080) — **git-ignored**: films are watched on the
  web catalog (live render) and published on YouTube; MP4s only exist for a YouTube batch (`npm run publish`).
* `stills/` — review PNGs + `contact.jpg` (git-ignored).

## Checks
`npm run check -- videos/<id>` runs `lib/engine/checks.js` on the real scene (also after `npm run still` and before
`npm run record`): `zfight` flicker, `inside` prop in a body, `clip` arm/hand/head/torso or held prop going into the set; 2D: `overlap`, `inside`, `frame`, `blocked`, `back`, `layers` (pateric arms / props)
(counter, wall, palm, tree, small rocks — legs too…), `staging` (a gesture while the actor still walks, a turn right after arriving, a prop popping into view mid-shot, someone / something on screen for a flash), `cut` (a jump cut: same direction, only nearer), `blocked` subject hidden / camera in a wall, `shake`, `sunk` a prop on the ground sinking into the studs (0.17) or the path / square tiles (0.4) — it says the `y` to give it — and `inside` also for a standing actor in a prop on the ground (a stool he got up from, a basket on his path).
Every warning says the scene, the time and — for the set — which piece (`the set (palm)`, `(big rock)`, `(dunes)`, `(hut)`…);
fix the descriptor (or the component) until it prints "no problems found".
Blender films also get `skate` (a figure gliding over the ground without steps), `door` (a set door / gate leaf through a
figure; ≤ 0.15 is a minor contact) and `vanish` (a figure hidden while still in the picture, not on a cut); `npm run validate`
prints `staging` hints from the timeline alone (`close`, `set`, `cross`, `snap` — lib/engine3/stagelint.js).

Review loop without re-reading everything: `npm run still -- videos/<id> --only 3,12,40` (only those stills — the numbers of the
file names — on a big contact sheet) or `--scene drumul,tabara`. `npm run validate` also prints **Hints** (lines < 5 words,
sentences > 12 words). `npm run voice -- videos/<id> --check` separates real problems (⚠ re-voice) from transcription glitches (·).
