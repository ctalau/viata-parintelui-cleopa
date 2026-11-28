# Contractul asset-urilor GLB

Personajele, decorurile și recuzita sunt GLB-uri reutilizabile între episoade. Blender le construiește
din scripturi (`blender/`), o singură dată; episoadele nu se exportă din Blender. Motorul (`lib/engine/`)
le încarcă, le clonează, le pune pe ancore, le animă și le randează.

## Unități și axe

* Stilul e 2.5D: desenele sunt plate, în planul **XY** al fiecărui asset (y în sus), iar **Z este
  adâncimea** (mai mare = mai aproape de cameră). Camera e ortografică și privește spre −Z.
* GLB-urile se exportă cu `export_yup=False`: coordonatele rămân cele din Blender (nu se rotesc).
* Unitatea e cea a seriei: Mama are ~3,9 unități înălțime la scara 1; personajele se scalează în episod
  (`size`, de obicei 1,1–1,3). Pe Z, motorul pune scara 0,5 a personajului (`root.scale.z`).
* Culorile sunt în emisie (materiale plate); motorul le transformă în `MeshBasicMaterial`.

## Personaje — `assets/characters/<id>.glb` + `<id>.json`

Construite de `blender/characters/build_characters.py` (Costică, Mama, Mihai, Tata).

* **Oase** (nume fixe, folosite de motor, gesturi și verificări):
  `root pelvis spine chest neck head`, `shoulder.R/L upper_arm.R/L forearm.R/L hand.R/L`,
  `thigh.R/L shin.R/L foot.R/L`. Oasele sunt plate; poza unui os = rotația în plan față de repaus și
  scurtarea pe axa osului. `forearm.*` și `hand.*` nu moștenesc scara părintelui; `shoulder.*` ia 38 % din
  rotația brațului (`lib/engine/character.js`, testat față de Blender în `tests/engine-fk.test.mjs`).
* **Desene rigide** legate de oase (cap, păr, piept, picioare) și **mâneca** (o plasă cu skin pe braț și
  antebraț; motorul îi rotunjește cotul la fiecare cadru).
* **Variante** — noduri cu `extras.variant = "<grup>=<nume>"`: `eye_pose` (open, half, closed),
  `mouth_pose` (rest, A, E_I, O_U, M_B_P, F_V, L, smile), `hand_R_pose` / `hand_L_pose` (desenele de autor
  ale mâinilor), `accessory` (cap, scarf). Motorul arată una pe grup (accesoriile: o listă).
* **`<id>.json`**: `profile` (umărul, lungimile brațului, mâna, capul, culorile), `bones` (repausul),
  `variants`, `palette.interior` (culorile hainelor și ale pielii în lumina bucătăriei), `sockets`.
* Palmele 2.5D nu sunt în GLB: motorul le construiește din proxy-ul 3D al mâinii (`lib/engine/palm25d.js`,
  la paritate cu `palme25d.py` și cu atelierul `/palme/`).

## Decoruri — `assets/sets/<id>.glb` + `<id>.json`

Construite de `blender/sets/build_sets.py` din aceleași funcții de decor ca episodul Blender (picturile din
`experiments/cleopa-painea/assets/backgrounds/`).

* `<id>.json`: `anchors` (`{ "<nume>": { "pos": [x, y, z], "size": s } }` — unde stă un personaj și cât de
  mare), `width` (lățimea picturii), `parts` (noduri animate de motor), `table` (bucătăria: muchia din
  spate a blatului și fața ștergarului — mâinile de pe masă trec în fața mesei).
* Părțile animate au `extras.part`: `flame` (jarul din cuptor), `icon2` (a doua icoană, comutată).

## Recuzită — `assets/props/<id>.glb` + `<id>.json`

* Originea e baza obiectului sau punctul lui natural (pâinea: centrul talerului).
* Un nod gol **`grip`** (sau `grip.L` / `grip.R`) = unde îl ține mâna.
* Animalele au părți animate (`extras.part`): cocoșul `head`, `beak`; Grăsuțu `head`, `jaw`, `open`,
  `shut`, `bite`, `chew`, `tail`. Descriptorul le dă chei de rotație, poziție, scară și vizibilitate.
* Recuzita ținută de un personaj se leagă de un os (`props: [{ prop, bone, at, z }]`).

## Reguli

* Un GLB nu conține animații de episod. Gesturile noi se scriu în `lib/engine/gestures.js` sau direct în
  descriptor; nu se reexportă personajul.
* O variantă nouă de personaj (haină, accesoriu) e o variantă marcată în același GLB, nu un GLB nou.
* După orice schimbare de asset: `npm run assets`, `npm test`, `npm run check:engine -- <episod>` și foaia
  comparativă a episoadelor care îl folosesc.
