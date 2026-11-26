# `video.json` — blocky toy-town films (`"style": "blocky"`)

Read with `DESCRIPTOR.md` + `DESCRIPTOR-lego.md` (same 3D engine, sets, props and anchors). Example film: `videos/007-fiertura-pentru-oaspeti`.

* Top level `"style": "blocky"`: every figure gets `look.style: "blocky"` — a Brookhaven-like avatar: square head, box torso / arms / legs,
  the face printed on a flat front, the same joints, gestures, grip points and emotions as the minifig; `shoes` = colour of the shoe blocks.
  A character or cast `look` can still override it.
* Every set is built **smooth** (`"smooth": true`): no studs, smooth plastic, ground without printed studs.
* The set that goes with it: `desert-lavra` palette **`town`** — a bright toy town: green lawn, grey sidewalk, green hills, each house one
  clean colour (cell1 sky blue, cell2 pink, cell3 yellow, cell4 lime). Other sets / palettes work too (they just lose their studs).
* Everything else (anchors, props, cameras, checks) is exactly as in `DESCRIPTOR-lego.md`.
