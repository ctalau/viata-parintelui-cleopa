# `video.json` — 2D films drawn like the Pateric reference (`"engine": "2d", "style": "pateric"`)

Read with `DESCRIPTOR.md` + `DESCRIPTOR-2d.md`. Example film: `videos/025-pimen-si-fratele-alungat`.

* **`hermitage2d`** — a hermit's cell cut into a sandstone rock in a quiet stony desert, painted in a muted, warm
  book-illustration look (the shapes are the reference drawing's own SVG paths: `lib/engine2d/hermitage.js`,
  reference `videos/025-pimen-si-fratele-alungat/design/reference.svg`). Palette `sandstone` (default for this set): cream-peach
  skies with no blue and a hazy sun glow (`morning`, `day`, `evening`; `night` = moon and stars), wispy clouds, far birds,
  mauve-taupe hills, ochre sand in soft washes, a gentle vignette. Pieces: the rock with an arched cave door and a wooden cross
  (left, x −15), a flat sitting stone in the middle, a gully (*râpă*) between boulders on the right (the front stones hide the legs
  of someone sitting in it), tall leaning date palms that sway, pebbles, grass tufts, little desert flowers.
  Anchors: `cave` (in front of the door), `cave.door`, `seat` (cast `"posture": "sit", "seat": 0.8` — the stone hides the hem),
  `ravine`, `center`, `left` / `right`. `"seat": false` removes the stone, `"palms": [[x, z], …]` moves the palms.
* **Film style `"style": "pateric"`** (top level, 2D): the people are drawn **like the reference drawing**
  (`lib/engine2d/pateric.js`), not like the storybook character: a deep hood (`hatColor`), a narrow face with fine features,
  a short band of hair over the forehead under the hood, no locks along the face (`hairColor`, default the beard colour; `hair: "none"` = no hair), a short beard with a moustache (`beard: "short"`/`"none"`), straight heavy brows, small eyes (men's faces) or the old Avva's head (`beard: "long"`): a long fanned beard joined by sideburns, a full drooping moustache, bushy light
  brows with a grey edge, soft forehead lines and crow's feet, no blush and no hair band under the hood (it read as a nun's coif), a shoulder
  capelet and big sleeves (`mantle` colour, default a lighter robe), a wide bell robe (`robe`) with soft gradients and folds,
  a rope belt (`belt`), small hands folded in front of the waist when they are not gesturing. The bodies are the reference's
  three SVG bodies — standing, seated (on a stone or on the ground), kneeling — mapped through the same skeleton, so every
  gesture, walk, turn, nod, bow and held prop still works; the face is mirrored to the side the person faces. Made friendly for small
  children: dark eyes with one soft highlight under a short upper lid, a small round nose, a gentle smile line; men's
  faces: thick straight low brows, a full moustache, very light blush (short beard with a moustache, or the long beard); `joy` = happy arcs, `sad` / `ashamed` = heavy lids
  (+ a tear for `sad`), tilted brows, lip-sync. The skeleton turns only a little (the body is a fixed three-quarter drawing),
  so resting hands stay folded in front and never cross the robe; a hand raised above the shoulder goes out beside the hood.
  Point / give with the hand on the side of the person you face (the near hand). Use muted robes (olive-grey `#57554a`, brown `#8a7359`, `#655e4b`).
* **Vary the faces** (AGENTS.md rule 16): no two monks of a film with the same face, and not the same faces as the last
  pateric films (`npm run next` prints the faces used). Look keys (all optional; none = the reference face):
  `faceShape` `oval|round|long|narrow|wide` · `eyes` `normal|small|big|close|apart` · `brows` `straight|arched|bushy|thin|slanted`
  (slanted reads severe) · `nose` `button|small|big|long` · `beardStyle` — short beard: `short|pointed|full|round|goatee`;
  long beard: `long|wide|pointed|short`. Mix them with `skin`, `beardColor`, `hairColor`. Gallery: `videos/_gallery2d` → `pateric-faces`.
* Arms and props: arms at rest always lie under the hood's drape; a hand raised **at the face** (`wipe`, `think`, `eat`, the
  sign of the cross) brings its whole sleeve in front, a hand raised beside the hood keeps the sleeve behind the head. A held prop
  (candle, book) is drawn in front of the beard. **Hug**: use the `hug` action (`DESCRIPTOR.md`) — the two stand side by side,
  turn to each other (≈ 45° to the camera), lean in and touch temple to temple (never face to face), the arms around
  the other one's shoulders and back. The `layers` check (`npm run check`) flags an arm blinking in front of / behind the hood, a held prop
  behind the head, a hand at the face without its sleeve.
* **Lay people** (villagers, the poor, women, children — not monks): `"hat": "none"` = no hood: a bare head with a cap of hair
  (`hairColor`) and a neck; `"hat": "headscarf"` = a woman's kerchief (the hood shape in a lighter cloth, `hatColor`), with
  `beard: "none"`; `"mantle": false` = no monk's capelet (a plain tunic). A child: `preset: "child"`, `scale: 0.72`, `hat: "none"`.
  Give them brighter muted robes (terracotta `#9a5a3c`, plum `#7a6a8a`, green `#6f8a5a`) so they read apart from the monks.
  Gallery: `videos/_gallery2d` → `pateric-lay`. Example film: `030-fratele-sarac-care-a-inceput-sa-daruiasca`.
