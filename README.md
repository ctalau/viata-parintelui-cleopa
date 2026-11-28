# Viața Părintelui Cleopa

Atelierul de animație al Școlii Evlaviei. Include episodul **Pâinea care poate să aștepte**, studiul de rugăciune la masă, biblioteca de riguri și inspectorul de scenă pentru animația 2.5D.

[Deschide atelierul public](https://viata-parintelui-cleopa-seven.vercel.app).

![Școala Evlaviei](assets/branding/badge-scoala.png)

## Arhitectura

Blender creează actorii, decorurile și repertoriul de gesturi. JavaScript regizează filmul. Three.js îl animează și îl randează.

| Parte | Unde |
| --- | --- |
| Personaje, decoruri, recuzită (GLB reutilizabile) | [`assets/characters/`](assets/characters/), [`assets/sets/`](assets/sets/), [`assets/props/`](assets/props/) · [contractul](assets/CONTRACT.md) · construite de [`blender/`](blender/) (`npm run assets`) |
| Motorul (încărcare, regie, brațe și palme 2.5D, mâneci, gesturi, gură, camere, titluri, verificări) | [`lib/engine/`](lib/engine/) · [documentația](docs/ENGINE.md) |
| Episoadele (descriptorul, cronologia și audio) | [`episodes/`](episodes/) · [formatul descriptorului](docs/EPISODE.md) |
| Episodul 1, construit integral pe motor | [`episodes/001-painea-care-poate-sa-astepte/episode.json`](episodes/001-painea-care-poate-sa-astepte/episode.json) |
| Episod demonstrativ, scris doar ca descriptor | [`episodes/002-semnul-crucii/episode.json`](episodes/002-semnul-crucii/episode.json) · `/?ep=002-semnul-crucii` |

Playerul episodului, cadrele de verificare (`npm run stills`, `npm run check:engine`) și MP4-ul (`npm run export:mp4`) folosesc același motor și aceeași funcție `stage.setTime(t)`. Playerul nu mai descarcă geometria precalculată a planurilor (`assets/film/plan-*`, păstrată ca referință). Pipeline-ul Blender al episodului 1 (`experiments/cleopa-painea/`) rămâne referința vizuală; regia lui a fost migrată o singură dată cu `tools/migrate/`.

## Pornire

Cu Node.js 24 și Git instalate, rulează comenzile de mai jos. Pentru randare instalează și FFmpeg, care include FFprobe.

```bash
git clone https://github.com/ctalau/viata-parintelui-cleopa.git
cd viata-parintelui-cleopa
./setup.sh
npm run preview
```

Pe [pagina principală a atelierului](http://127.0.0.1:4173) se deschide direct „Pâinea care poate să aștepte”. Selectorul folosește catalogul generat din `episodes/`. Orice episod se poate deschide direct la `/?ep=<id>`. Playerul Three.js construiește planurile din GLB-uri și `episode.json`, sincronizate cu pista audio. Steagul pune pauză și deschide dialogul pentru o observație. Notele rămân în browser și se pot descărca în Markdown.

MP4-ul se generează numai la cererea explicită a utilizatorului, cu `npm run export:mp4 -- <episod> --jobs 3`. CLI-ul scrie implicit în `episodes/<episod>/renders/`, iar `--out` permite alegerea destinației.

Pentru producția de animație, instalează Blender 4.3.2 sau 4.5 LTS, Python 3 cu `venv`, FFmpeg, FFprobe și fonturile DejaVu. `./setup.sh --animation` creează mediul virtual cu pachetele Python folosite la export. `source .venv/bin/activate` activează mediul. `./setup.sh` pregătește și Chromium pentru randare. Poți folosi un Chromium existent cu `export CHROMIUM_BIN=/cale/către/chromium`. Pe un Linux minimal, instalează și bibliotecile de sistem pentru Chromium prin managerul distribuției sau cu `npx playwright install-deps chromium`. `./setup.sh --site` pregătește doar site-ul.

## Bibliotecă și producție

| Resursă | Cale |
| --- | --- |
| Episod, montaj, riguri și voci | [`experiments/cleopa-painea/`](experiments/cleopa-painea/) |
| Riguri ale familiei, veselă, casă, scenele de rugăciune și testul semnului crucii | [`experiments/cleopa-blender/`](experiments/cleopa-blender/) |
| Teste de articulații cu Mama | [Palmă, cot și umăr](https://viata-parintelui-cleopa-seven.vercel.app/articulatii/) |
| Asamblare de scene Three.js | [Atelierul Three.js](https://viata-parintelui-cleopa-seven.vercel.app/asamblare/) |
| Palme 2.5D: trei abordări în test de stres | [Palme 2.5D](https://viata-parintelui-cleopa-seven.vercel.app/palme/) · [`experiments/cleopa-palme/`](experiments/cleopa-palme/) |
| Corp complet volumetric și episodul de probă | [Corp volumetric](https://viata-parintelui-cleopa-seven.vercel.app/volum/) · [`experiments/cleopa-volum/`](experiments/cleopa-volum/) |
| Inspector de scenă pentru mobil | [Inspectorul public](https://viata-parintelui-cleopa-seven.vercel.app/inspectie/) |
| Instrucțiuni și skill pentru un episod | [`AGENTS.md`](AGENTS.md) · [facut-episod](.agents/skills/facut-episod/SKILL.md) |

`npm run check:cleopa` rulează smoke testul Blender, verifică rigurile de referință și suprapunerile la fiecare cadru. `npm test` testează validarea feedbackului. Cu preview-ul pornit, `npm run check:preview` verifică în Chromium redarea, capitolele, notele, biblioteca, afișarea pe mobil, inspectorul și asamblarea Three.js. Poți da o adresă Vercel ca argument. Consultă README-ul episodului pentru refacerea vocii și a muzicii prin OpenRouter și exportul cadrelor.

Prima pagină are secțiunea **Ateliere**, cu legături către toate atelierele. Când alegi un test, un gest, un clip sau un plan, acesta pornește imediat și se reia în buclă. Butonul de pauză și cursorul opresc bucla.

## Palme 2.5D

Ne întoarcem la modelul 2.5D, cu animație limitată ca în serialele cu piese plate. Corpul și capul rămân desene. Un schelet 3D primitiv, pe care nu-l vede nimeni, calculează umărul, cotul, încheietura și degetele. Proiecția lui conduce desenul. `/palme/` compară trei abordări pentru palme pe același schelet: substituție de desene, plasă 2D pe oase proiectate și volume proiectate, desenate plat. Le compară în șase teste de stres, cu metrici calculate în browser. Vezi [fișa experimentului](experiments/cleopa-palme/README.md), [specificația variantei alese](experiments/cleopa-palme/SPECIFICATIE.md) și [handoff-ul pentru episod](experiments/cleopa-palme/HANDOFF.md).

## Brațe și palme 2.5D în film

În episod, Mama are brațele și palmele 2.5D din [specificație](experiments/cleopa-palme/SPECIFICATIE.md). Coregrafia rămâne cea regizată, iar oasele 2D primesc unghiul și scurtarea segmentelor proiectate ale unui IK 3D cu lungimi fixe. Palma este desenată plat din volumele proxy-ului (C), cu contur, umbre, unghii și liniile palmei. În pozele ținute, desenul de autor (A) se ancorează la punctul de contact. Tava, obrazul și colțul baticului sunt contacte: încheietura se calculează din vârful degetelor. Mâneca e o singură bucată de la umăr la manșetă, rigidă pe braț și pe antebraț; `maneci_bake.py` rotunjește cotul pe fiecare desen (arc în exterior, pliu în interior, antebrațul pliat peste braț la îndoiri strânse). Între pozele regizate brațul se mișcă în unghiurile articulațiilor (umăr, cot, încheietură), nu în linie dreaptă: mâna merge pe arc, segmentele își păstrează lungimea și cotul nu sare dintr-o parte în alta. În scena Blender de referință, palmele sunt coapte în shape keys. În player, motorul reconstruiește palmele și mânecile la timpul cerut. `verify_episode.py` verifică lungimile, contactele, ordinea pieselor, pliurile, repausul, lateralitatea și trecerile C ↔ A.

```bash
cd experiments/cleopa-painea
blender -b --factory-startup --python-exit-code 1 --python scripts/build_episode.py
blender -b scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 --python scripts/palme25d_bake.py
blender -b scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 --python scripts/maneci_bake.py
```

## Corp volumetric

`/volum/` arată Mama cu tot corpul în 3D, pe un drum de sat. Capul este o sferă pe care este lipit desenul 2D al capului din episod. Hainele poartă aceleași desene ca în 2D, înfășurate pe volume, în șapte teste de stres. Testele cuprind mersul spre cameră, mersul din profil, întoarcerea pe loc, semnul crucii, atingerile și brațele încrucișate, aplecarea după găleată și brațele deasupra capului. Ultima probă are două personaje care se întâlnesc. „Drumul la troiță” le montează ca episod de probă. Blender verifică alunecarea tălpilor, distanța degetelor la fiecare contact și intersecțiile dintre piese. Raportul apare lângă fiecare test. Vezi [fișa experimentului](experiments/cleopa-volum/README.md).

## Cadre rapide (three.js + GLB)

`npm run cadru` arată orice cadru al episodului în câteva secunde, fără randarea Blender. Blender doar evaluează cadrele cerute și le exportă ca GLB-uri (`cadru_export.py`: desenele vizibile ale planului în coordonatele lumii, materiale neluminate, decorurile ca texturi externe). Three.js le asamblează și le randează în Chromium fără ecran, ca `npm run still` din lego-shorts. Rezultatul este `experiments/cleopa-painea/renders/cadre/foaie.jpg`: fiecare cadru etichetat (număr · plan · timp), apoi zoom pe brațele fiecărui personaj sau, cu `--maini`, pe fiecare mână cu manșeta. Cadrele întregi sunt în `cadru-NNNN.png`.

```bash
npm run cadru -- 1263 3301                     # scena salvată, ~5 s
npm run cadru -- 2590-2610:5 --build --maini   # după o schimbare în coregrafie, ~30 s
npm run cadru -- 3301 --coace --zoom Tata      # coacere parțială fără build; zoom doar pe Tata
```

`--build` reface scena (`build_episode.py`). Apoi palmele și mânecile se coc doar în jurul cadrelor cerute (±24 de cadre), într-o copie din `.cadru/`. Lanțul complet durează ~16 minute, iar ciclul acesta ~30 de secunde. Copia e marcată `coacere_partiala`, iar `verify_episode.py` și exportul playerului o refuză. Înainte de commit, rulează lanțul complet din README-ul episodului.

## Filmul în Three.js și foi de cadre

Playerul de pe pagina principală folosește descriptorul episodului și biblioteca GLB. Foile de cadre se pot genera direct din același motor. Pentru o comparație, dă comenzii `compare` calea către un MP4 de referință local.

```bash
npm run sheet -- episod 1 285 1485 3081 --columns 2 --out /tmp/foaie-cadre.png
npm run sheet -- mama-palma 1 21 31 53 73 96 --out /tmp/test-palma.png
npm run compare -- 001-painea-care-poate-sa-astepte /cale/referinta.mp4
```

Pe pagina Mamei, cele trei teste au surse Blender editabile. Capsula mânecii amestecă ponderi de piept, os de umăr și braț, iar osul umărului urmează parțial rotația brațului. În teste, un braț cu segmente de lungime fixă mișcă mâneca desenată continuu și palma cu formă interpolată. Cheile Bézier controlează brațul, cotul, orientarea palmei, flexia degetelor și deschiderea degetului mare. Fiecare test are o foaie de cadre lângă sursa Blender. În episod, filtrul de rotație adaugă chei intermediare acolo unde încheietura își schimbă direcția prea brusc. Reexportă fișierele cu următoarea comandă.

```bash
blender -b --factory-startup --python-exit-code 1 --python experiments/cleopa-painea/scripts/export_web_characters.py -- --stress
npm run build
```

## Gesturile Mamei

Primele patru sunt semnul crucii, ridicarea cănii, râsul cu mâna la gură și mustrarea cu arătătorul. Talerul cu pâine, ridicarea baticului și indicația spre traistă corespund acțiunilor din „Pâinea caldă”, „Porcul și omul” și „Drumul spre școală”.
[Compară cele două variante în atelier](https://viata-parintelui-cleopa-seven.vercel.app/comparatie-maini/).

```bash
blender -b --factory-startup --python-exit-code 1 --python experiments/cleopa-painea/scripts/export_web_characters.py -- --comparatie
npm run build
node tools/frames-hands.mjs cana 4 1 145 /tmp/mama-cana.png   # cadrele intermediare, 3D lângă 2D
node tools/frames-hands.mjs cana --sheet 3d 1,28,48,70,87,109,144 studio/comparatie-maini/foi/cana.webp
```

Ambele variante au aceeași coregrafie: încheietura urmează o curbă în spațiu prin cheile din `TRACKS`. Se oprește lin la contacte și în repaus și trece fără oprire prin punctele intermediare. Cotul atârnă în jos, puțin în afară și înapoi, ca un cot relaxat. Direcția lui se păstrează de la un cadru la altul, așa că nu sare peste mână. Modelul 3D folosește segmente fixe, iar mâneca și mâna au volum și degete îndoite individual. Desenul 2D este aceeași mișcare văzută din cameră, cu adâncime mai mică. Antebrațul se scurtează când vine spre cameră, dar nu se lungește niciodată. Ambele variante compun forma mânecii în jurul articulației și urmăresc aceleași repere ale feței și recuzitei. Blender salvează oasele cu chei și geometriile evaluate. Three.js redă GLB-urile la același timp și din aceeași cameră. Fișierele din `assets/proiectii/` conțin umărul, cotul, încheietura și axa palmei pentru fiecare al doilea cadru, cu coordonate XY normalizate în camera frontală și adâncime în unități Blender.

- **Rigul** este transferabil între personajele 2.5D cu aceleași nume și ierarhii de oase. Se potrivesc lungimile, pivoții și adâncimile la silueta fiecărui personaj.
- **Animația** își poate păstra ritmul și ordinea reperelor. Ajustează traiectoriile libere, contactele și dimensiunile obiectelor la mâna, umerii și capul noului personaj, apoi reevaluează deformarea.
- **Meshul** se poate refolosi direct pentru același desen. Metoda și topologia pot porni un alt costum, dar conturul, textura și deformările deja exportate sunt specifice proporțiilor Mamei. Regenerarea pornește din sursa Blender/Python, unde reperele rămân editabile.

## Inspectorul de scenă

Inspectorul urmărește planul „Încă puțin”. Redă fragmentul din film cu oasele proiectate prin camera Blender și cu grila evaluată a mânecii drepte. Modul Straturi izolează decorul, masa, pâinea, personajele și aburul într-un cadru ales din același plan. Datele JSON și imaginile WebP generate sunt versionate în `studio/inspectie/`, astfel încât buildul Vercel să ruleze cu Node.js.

După o modificare a scenei, regenerează datele și imaginile din rădăcina repo-ului.

```bash
blender -b experiments/cleopa-painea/scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 --python experiments/cleopa-painea/scripts/export_inspector.py
npm run build
```

## Recuzită reutilizabilă și randare Three.js

`assets/recuzita/` conține modele GLB cu geometria, culorile și texturile din episod, inclusiv Costică, Mama, Mihai și Tata. Au pivotul la mijlocul bazei, X spre dreapta, Y în sus și Z către camera frontală. Ordinea după adâncime se păstrează în model. `studio/asamblare/scenes/` conține descriptorii declarați în JSON. Pentru un clip nou, adaugă aici un fișier cu același nume ca `id` și reconstruiește site-ul. Buildul îl adaugă automat în selector.

Într-un clip, fiecare instanță are un `id` propriu, o cheie `asset` din catalog și o `position` în coordonate XYZ. `scale` schimbă scara uniform, iar `rotation` rotește piesa în plan, în grade. `parent` folosește ID-ul unei instanțe declarate mai sus și exprimă poziția copilului în coordonatele părintelui. În ambele clipuri, pâinea este copilul talerului. Un obiect poate avea și chei `keys` cu timp în secunde și poziție, în ordine crescătoare.

La personaje, `"action": "gest"` pornește acțiunea exportată în GLB. `actionStart` o decalează pe cronologia scenei, în secunde. Three.js evaluează acțiunea la timpul selectat, inclusiv la exportul fiecărui cadru. Modelele păstrează oasele, schimburile de ochi și mâini și forma evaluată a mânecii pe parcursul gestului. Sunt incluse gesturi scurte refolosibile, fără dialog.

```bash
# Același Three.js în Chromium fără interfață
npm run render:scene -- painea-pe-masa
npm run render:scene -- de-plecare --width 1920 --out /tmp/cadre-cleopa
```

Comanda folosește buildul din `dist/`. Rulează `npm run build` după o schimbare de JSON, JavaScript sau GLB. Comanda scrie un cadru PNG în `studio/asamblare/renders/`. Rulează din nou buildul ca să publici imaginea în atelier.

Pentru a actualiza sursa bibliotecii după o schimbare în Blender, regenerează GLB-urile și reconstruiește site-ul.

```bash
blender -b experiments/cleopa-painea/scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 --python experiments/cleopa-painea/scripts/export_web_props.py
blender -b --factory-startup --python-exit-code 1 --python experiments/cleopa-painea/scripts/export_web_characters.py
npm run build
```

## Vercel și feedback

Vercel construiește site-ul cu `npm ci` și `npm run build`, publicând `dist/` și funcția `POST /api/feedback`. Proiectul Vercel este conectat la acest repo, cu ramura de producție `main` și un **Vercel Blob privat** atașat pentru Production și Preview. Pentru o copie a proiectului, setează Node.js 24 și atașează un Blob privat înainte de primul deploy. Funcția scrie câte un JSON privat în `feedback/`, cu textul, momentul, episodul și data. Exportă-l cu `npm run feedback:export`, cu `BLOB_READ_WRITE_TOKEN` al magazinului setat local. `vercel env pull .env.local` permite apoi `node --env-file=.env.local tools/feedback-export.mjs`.
