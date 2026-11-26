# Engine internals

Read this when a film needs something the library doesn't have, or when changing engine / component code.
To make a film you only need `docs/DESCRIPTOR.md` + the style file.

## Pipeline
```
videos/<NNN-slug>/video.json   ← the ONLY source of a film (script, characters, staging, camera)
        │
        ├─ voice    tools/voice.mjs   → audio/<hash>.wav + audio/lines.json   (OpenRouter, Gemini TTS)
        ├─ music    tools/music.mjs   → audio/music.mp3                       (OpenRouter, Lyria)
        ├─ web      tools/site.mjs    → dist/: catalog + /<id>/ player (lib/web/), deployed by Vercel
        ├─ poster   tools/record.mjs --poster → poster.jpg (catalog card + YouTube thumbnail)
        ├─ stills / checks / MP4   tools/record.mjs → stills/, out/*.mp4 (three.js in headless Chromium + ffmpeg)
        └─ YouTube  GitHub Action on push to main → RunPod render → tools/youtube.mjs → youtube.json (docs/PUBLISHING.md)
```
`tools/produce.mjs` (`npm run produce`) chains voices ∥ music → voice check → stills + checks → poster → site → spend.

## 3D engine (`lib/engine/`)
* `timeline.js` — **pure** compiler: descriptor + audio manifest → timed timeline. Runs in Node and in the browser.
  Beat length = audio length, so timing always follows the voices.
* `stage.js` — renders any time `t` as a pure function of `t` (no state between frames) → frames can be rendered in any
  order / in parallel, scrubbed in the player, or picked as stills.
* `checks.js` — **runtime checks** on the real three.js scene (`npm run check`, also run by `still`, `produce` and before every `record`):
  * `zfight` — coplanar overlapping faces → flicker;
  * `inside` — held / flying prop inside a body;
  * `clip` — an arm / hand / head / torso or a held prop going into the set (a counter, a wall, a palm);
  * `blocked` — subject of the shot hidden / camera inside something;
  * `shake` — camera going back and forth.

  When a new kind of problem shows up, add a check for it here, not only a row in the Past issues of `/plan-video`.
* `overlay.js` — captions, title cards, fades.
* `main.js` + `render.html` — browser entry of the recorder / checks.

## 2D cartoon engine (`lib/engine2d/`, `"engine": "2d"`)
* `stage2d.js` — same timeline, painted 2D picture, pan/zoom camera.
* `figure.js` — gentle storybook characters posed with the same gestures as the minifig.
* `scenery.js` — painted sky / dunes / lavra / palms + 2D props. `paint.js` — soft palette, helpers.
* `checks2d.js` — framing / hidden face / overlap checks.
* `hermitage.js` — the `hermitage2d` set (rock cell, seat stone, gully, palms) drawn from the SVG paths of a reference drawing.
* `pateric.js` + `"style": "pateric"` — people drawn like that reference (hood, narrow face, fanned beard, capelet, bell robe), on the same skeleton.

Player, recorder, poster and checks pick the engine automatically. Docs: `DESCRIPTOR-2d.md` / `-pateric.md`; gallery `videos/_gallery2d`.

## Shared component library (`lib/components/`)
Used by every film. What each one offers: `docs/DESCRIPTOR-lego.md`.
* `bricks.js` — palette `COLORS`, `Builder`, `rng(seed)`.
* `minifig.js` — looks, faces, gestures, postures, blocky avatar.
* `props.js` — `PROPS` (holdable props define `userData.hold`, the grip offset in the holder's frame).
* `sets.js` — `SETS`, `SKIES`, palettes; named pieces for the checks.
* `layouts.js` — anchors, pure (also used by the timeline in Node).

Adding something new (prop, gesture, set, hat): put it here, document it in the style's `docs/DESCRIPTOR-*.md`, and show it
in `videos/_gallery/video.json` — the test film with all presets, emotions and gestures, used to check library changes.
A new set also needs a layout + anchors in `layouts.js`.

## Engine rules
* **Determinism**: a pure function of time. No `Math.random()` (use `rng(seed)`), no `Date.now()`, no state between frames.
* Held props must not intersect bodies; the minifig carries with the forearm forward. Check a close-up still for every new holdable prop.
* Never let two bricks overlap with coplanar faces (z-fighting).
* Library changes that alter how old films look are fine, but say which films they affect.
* **The YouTube MP4 is rendered elsewhere** (RunPod, NVIDIA GPU, files sent in a tarball) than the reviewed stills (SwiftShader):
  * a file the page loads must be in `tools/lib/bundle.mjs` (`RENDER_FILES`; icon images are found from the descriptor) and a
    missing one must fail the render, never fall back to a placeholder;
  * shaders must not produce NaN/Inf (normalize of a possibly-zero vector, division by a depth / derivative): NVIDIA gives NaN
    where SwiftShader gives 0, and bokeh + bloom smear it into black blocks. Guard it (see `SAFE_BUMP`, `SCRUB_NAN` in `stage.js`);
  * after a RunPod render run `npm run compare -- videos/<id>` (MP4 vs preview; `publish` does it and skips a film that differs).
* A prop whose `bend` rests at another value than 0 (a full `sack`, a `bird` coming `back`) must say so in `bendRest()`
  (`props.js`): a `{ "prop", "bend" }` animation starts from that value (039: the sack filled up instead of emptying).
* `npm test` (`tests/*.test.mjs`, node:test) — render bundle, GPU safety, prop `bend` rest values, pot brick joints. Run it after
  changing the engine or the library; the YouTube workflow runs it before rendering.

## The Blender style (`"style": "blender"`)
GLB characters / sets / props built by Blender Python, runtime `lib/engine3/`, the validators and the **rigging process**
(shared skinning recipes `blender/common/rigkit.py`, range-of-motion test `npm run clipcheck`): **`docs/ENGINE-blender.md`**.
