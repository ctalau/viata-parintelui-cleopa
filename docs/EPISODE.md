# `episodes/<id>/episode.json` — descriptorul unui episod

Sursa regiei: distribuția, scenele, camerele, gesturile, recuzita și suprapunerile. Timpii sunt **cadre la
24 fps** (cadrul 1 = 0 s), ca `timeline.json` și pistele audio. Un episod nou = un descriptor nou + audio;
nu e nevoie de Blender și nici de un script per episod.

```json
{
  "id": "002-semnul-crucii", "title": "Semnul crucii", "fps": 24, "frames": 408,
  "timeline": "timeline.json",
  "audio": { "mix": "audio/mix.m4a", "envelopes": "audio/envelopes.json" },
  "sets": { "bucatarie": { "asset": "bucatarie" } },
  "shots": [ { "name": "Înainte de masă", "at": 1, "set": "bucatarie", "center": [2.6, -0.4], "width": 11.2, "glide": [0.08, 0.02, -0.25] } ],
  "cast": {
    "costica": { "scene": "bucatarie", "character": "costica", "pos": [2.22, -2.47, 1.14], "size": 1.15, "interior": true,
                 "do": [ { "gesture": "cross", "at": 130 } ] }
  },
  "props": { "paine": { "scene": "bucatarie", "asset": "paine", "keys": [[1, [-0.12, -2.56, 0]]] } },
  "overlays": [ { "kind": "title", "shot": 0, "from": 1, "to": 70, "at": [-1.75, 1.95], "title": "Semnul crucii" } ],
  "logo": { "file": "/assets/branding/logo-scoala-mic.webp" }
}
```

## Cheile principale

| cheie | înțeles |
| --- | --- |
| `drawingStep` | numărul de cadre pe desen, de la începutul fiecărui plan. Episodul 1 folosește 1 (24 de desene pe secundă). Valoarea implicită este 2. Playerul și MP4-ul folosesc aceeași cadență. |
| `timeline` | `timeline.json`: capitolele (`beats` cu `start`, `end`, `title`) și replicile (`cues`: `file`, `speaker`, `text`, `start`, `end`), scrise de `prepare_timeline.py` din lungimile vocilor |
| `audio.mix` | pista redată de player și pusă în MP4; vocile și muzica rămân separate la editare |
| `audio.envelopes` | anvelopele vocilor pentru gură (`tools/engine/envelopes.py`) |
| `sets` | decorurile folosite (`assets/sets/<asset>.glb`); ancorele sunt în `<asset>.json` |
| `shots` | planurile: `at` (cadrul de început), `set`, `center` și `width` (camera ortografică, lățimea vizibilă), `glide` ([dx, dy, dlățime] pe durata planului) |
| `cast` | actorii (vezi mai jos) |
| `props` | recuzita și ambientul: `asset`, `pos` sau `keys` ([cadru, [x, y, z]]), `scale`, `visible` [de la, până la), `parts` (chei pe părțile animate: `turn`, `position`, `scale`, `hidden`), `ambient` (`steam` care urmează un obiect, `drift`, `flicker`), `part` (o parte a decorului) |
| `overlays` | `title` (placheta de început, `pop`: scara în timp) și `bubble` (`text`, `keys` [cadru, x, y, scară]), în unitățile planului |

## Un actor

| cheie | înțeles |
| --- | --- |
| `scene`, `character`, `pos`, `size`, `look`, `interior` | decorul, personajul (`assets/characters/<id>`), poziția (tălpile/șoldul și adâncimea), mărimea, direcția privirii (1 dreapta, −1 stânga), paleta de interior |
| `visible` | [de la, până la) cadre |
| `accessories`, `accessories_at` | variante permanente (`beard`, `cap`) și pe intervale (`["scarf", 2593, 2616]`) |
| `props` | recuzită ținută: `[{ "prop": "carte", "bone": "chest", "at": [x, y], "z": 0.47 }]` |
| `do` | gesturi din bibliotecă: `{ "gesture", "side", "at", "hold", "palm"? }` (vezi `docs/ENGINE.md`) |
| `arms` | poze-cheie ale brațului: `{ "side", "keys": [[cadru, [x, y], [dx, dy], z?, cot?]], "palm"?, "palmKeys"?, "limit"? }` (încheietura și direcția degetelor, în spațiul rigului). Opțional, `z` fixează adâncimea încheieturii și `cot` este un vector 3D din umăr care orientează planul îndoirii. `palmKeys` interpolează normala palmei între perechi `[cadru, [nx, ny, nz]]` |
| `arms[].strokes` | Fiecare interval `[primaPoză, ultimaPoză, plecare, sosire]` leagă pozele într-o singură mișcare. Încheietura urmează arcul proiectat cu viteza maximă la 40% din timpul de deplasare. Capetele traseului se țin până la plecare și după sosire. |
| `hands` | poza mâinii: `[cadru, "R"|"L", "rest|open|cup|grip|reach|extend|gather|present|prayer|point|touch|stop|cheek|cross"]` |
| `contacts` | vârful degetelor pe o țintă care se mișcă: `{ "side", "from", "to", "target": "prop:paine" | "head", "tip", "dir", "pose", "palm" }` |
| `head` | `[cadru, aplecare, înclinare]` |
| `blinks`, `face` | clipitul; chei pentru `eye_pose` și `mouth_pose` |
| `say` | replicile actorului (`timeline.json` → `cues.file`): gura urmează vocea |
| `move`, `steps`, `scale` | deplasarea pe scenă, pașii pe loc, mărimea în timp (apropierea de cameră) |
| `breathe` | `[de la, până la, fază]` — pieptul respiră discret |
| `flip` | `[cadru, ±1]` — capul întors (Costică spre Mihai) |
| `atTable` | palmele de sub muchia mesei trec în fața ei |

## Verificare

```bash
npm run stills -- <id> 1,200,400            # cadre de lucru
npm run check:engine -- <id>                # verificările; excepțiile motivate în episodes/<id>/allow.json
npm run export:mp4 -- <id> --jobs 3         # episodes/<id>/renders/<id>.mp4, apoi film.mp4
```
