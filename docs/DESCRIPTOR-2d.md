# `video.json` — 2D films (`"engine": "2d"`)

Read with `DESCRIPTOR.md` (common keys). For `"style": "pateric"` also read `DESCRIPTOR-pateric.md`.


A film with `"engine": "2d"` is drawn as a gentle 2D cartoon on a canvas (`lib/engine2d/`): the same compiled timeline
(voices, beats, `walk`, `face`, `gesture`, `emotion`, `posture`, `give`, `put`, `show`, cards, fades) — only the picture changes.
Pure function of `t`, like the 3D stage (scrubbing, stills, parallel frames all work). Played by the same web player and recorder.

* **Characters** (`figure.js`): big round head, large eyes (a calm matte iris with one small soft highlight, eyelids for the feelings, blinking),
  rosy cheeks, soft brown outlines (never black), a long robe with folds and a rope belt, wide sleeves, mitten hands, sandals.
  Posed as a tiny 3D skeleton with the **same gestures** as the minifig (`GESTURE_POSES`), then drawn flat, so a person can turn,
  nod, raise an arm towards the viewer, walk, sit cross-legged (`sit`), kneel, lie. Faces "cheat out" to the viewer: someone
  facing sideways still shows most of the face; only a person turned more than ~140° away shows the back of the head.
  Presets (`LOOKS2D`): `monk`, `elder-monk`, `young-monk`, `villager`, `woman`, `child`; look keys as in 3D (`robe`, `belt`,
  `collar`, `hat` `none|skufia|kamilavka|hood|headscarf`, `hatColor`, `veil: false` (kamilavka without the veil),
  `bandColor`, `hair` `short|long`, `hairColor`, `beard` `none|short|long`, `beardColor`, `browColor`, `eyeColor`, `skin`
  (`skin`, `lightSkin`, `tanSkin`, `darkSkin` or `#rrggbb`; the 3D `"yellow"` becomes `skin`), `age: "elder"` (white bushy brows,
  a smile line), `cross`, `lashes`, `sandals`, `scale`, `print: "tunic"` + `stripe`). Colours: the soft palette `PAL` in `paint.js`
  (same names as the 3D palette, plus `navy`, `plum`, `rose`, `terracotta`, `teal`).
* **Sets** (`scenery.js` + `layouts.js`): `{"type": "lavra2d", "palette": "terra" | "ochre" | "rose" | "white", "cells": 2–4,
  "church": true}` — a painted desert lavra seen from the front, like a stage: sky with sun / clouds (`morning`, `day`, `evening`)
  or moon and stars (`night`), or `dream` (a glowing lilac night with stars and a big soft light from above: dreams and visions —
  the voice of the Saviour / an angel comes "from the light", nobody is drawn, AGENTS.md rule 15), far mountains and two rows of dunes (parallax), sandy yard with paths, adobe cells in a row at the
  back (flat roofs with a soft parapet, arched wooden doors, little windows, roof beams, a pot of greenery), the church behind
  them in the middle — the only dome: a low, rounded Coptic mud-brick dome, warm ochre-gold, with a cross (faithful to Scetis), palms that sway, stones and tufts. x = left/right, z = depth (+z towards the viewer).
  Variety (AGENTS.md rule 12 — don't reuse the last lavra2d look): `"dome"`: `round` (default) | `drum` (a dome on a tall drum
  with little windows) | `bell` (no dome: a bell gable on the roof) | `twin` (a big and a small dome); `"roofs"`: `flat` (default) |
  `vault` (barrel-vaulted mud-brick cells) | `mixed`; `"varied": true` (cells of different widths / heights);
  `"palms": [[x, z], …]`. With 3 cells the middle cell stands in front of the church (its dome / gable shows above).
  Anchors: `center` (0,0), `cell1`…`cellN` (in front of each door, facing the viewer; 4 cells stand at x −27, −11, 11, 27, z −10),
  `cellN.hut`, `church` (in front of its door, z ≈ −11), `left` / `right` (far edges, to walk in / out), `well`.
* **Camera** (2D meaning of the same keys): the camera always looks straight ahead and moves (pans / dollies) instead of rotating.
  `wide` (`on`, `dist` 30 = distance in front of the subject, `height` 7 = camera height: higher shows more ground, `y` look height),
  `medium` (`dist` 12), `close` (`dist` 6.2; a face), `two` (frames both), `prop` (`dist` 4). `angle` (degrees) = a small sideways
  shift, `"angle": "auto"` = shift until nobody in front hides the face, `dx` = sideways shift in studs. `move`: `push`, `pull`,
  `pan` / `orbit` (sideways glide, `orbit` degrees), `rise`, `drift`; `ease` glides from the previous shot. `top` = a high `wide`.
* **Props** (`PROPS2D`): `figs` (a clay dish of small DRIED figs — brown, flattened, wrinkled: `count`, `color`; `dish: false, count: 1` = one fig in the hand),
  `basket` (`handle: false` = no handle yet; `count` 2–3 = a row of baskets on the ground), `handles` (a bundle of basket handles, braided palm-fibre arches: `count` 1–5), `jug`, `bread` (`dry`), `mat` (lies flat on the ground — sit a person on it at the same `at`), `candle` (flickers),
  `staff`, `book`, `garden` (a small vegetable bed — a mound of soil with rows of green onions; `grown` 0..1 = few small sprouts → a rich bed, `width` studs, default 4), `greens` (a bunch of garden greens — *verdețuri*, green onions tied with a red string; `count` 1–3 bunches), `coin` (a shining gold coin — a *galben*; `count` 2–6 = a little heap of coins, e.g. offered in the hand),
  `scroll` (a written note — *înscris* / *zapis*: a parchment sheet with lines of writing; `rolled: true` = a roll tied with a red string). Held props sit in the hand (`HOLD2D` = grip offsets); `give` flies them hand to hand on an arc.
* **Staging tips**: people in a row facing the viewer read best; for a dialogue stand them 2.5–4 apart and `face` each other
  (they still show their faces). Keep ≥ 1.6 between two people (else `overlap`). Close-ups: `"angle": "auto"` or `dx`. A close-up of
  someone jumping needs a bigger `dist` (the camera aims at the rest pose). Don't walk people through buildings (cells are 8 × 6).
* **Checks** (`checks2d.js`, run by `npm run check`): `frame` (the subject's face is cut by the frame), `blocked` (someone in
  front hides the face), `back` (a close-up shows the back of the head), `overlap` (two people inside each other),
  `inside` (a person inside a building).
* Hands: the sign of the cross shows three joined fingers, `point` a pointing finger; a raised hand is always drawn in front
  (its sleeve behind the head, so no face is covered). Brows: fine tapered arcs following the eye; `sad` adds one small tear.
* **Design board before filming**: `npm run board -- videos/<id>` renders `design/board.json` (shots = one-beat scenes with
  `label`, `set`, `sky`, `cast`, `props`, `camera`, `do`, `at`; extra/variant `characters`) into `design/board-vN.jpg`.
* Gallery: `videos/_gallery2d` (all presets, emotions, gestures, postures, props, night, the hermitage set + a "pateric" figure).
