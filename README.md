# Viața Părintelui Cleopa

Atelierul de animație al Școlii Evlaviei. Include episodul **Pâinea care poate să aștepte**, studiul de rugăciune la masă, biblioteca de riguri și inspectorul de scenă pentru animația 2.5D.

[Deschide atelierul public](https://viata-parintelui-cleopa-seven.vercel.app).

![Școala Evlaviei](assets/branding/badge-scoala.png)

## Pornire

Cu Node.js 24 și Git instalate, rulează comenzile de mai jos. Pentru randare instalează și FFmpeg, care include FFprobe.

```bash
git clone https://github.com/ctalau/viata-parintelui-cleopa.git
cd viata-parintelui-cleopa
./setup.sh
npm run preview
```

Deschide [atelierul local](http://127.0.0.1:4173). Playerul redă cele 17 planuri ale episodului în Three.js, sincronizate cu pista audio originală. Filmul MP4 randat în Blender este disponibil pentru descărcare și comparație. Playerul JavaScript are steag, bară de redare și salturi de ±5 s și ±0,5 s. Steagul pune pauză și preia momentul pentru formular. Formularul salvează observația împreună cu secunda aleasă și ID-ul episodului. În preview-ul local, `npm run feedback:export -- --local` citește notele din `.feedback/`.

Pentru producția de animație, instalează Blender 4.3.2 sau 4.5 LTS, Python 3 cu `venv`, FFmpeg, FFprobe și fonturile DejaVu. `./setup.sh --animation` creează mediul virtual cu pachetele Python folosite la export. `source .venv/bin/activate` activează mediul. `./setup.sh` pregătește și Chromium pentru randare. Poți folosi un Chromium existent cu `export CHROMIUM_BIN=/cale/către/chromium`. Pe un Linux minimal, instalează și bibliotecile de sistem pentru Chromium prin managerul distribuției sau cu `npx playwright install-deps chromium`. `./setup.sh --site` pregătește doar site-ul.

## Bibliotecă și producție

| Resursă | Cale |
| --- | --- |
| Episod, montaj, riguri și voci | [`experiments/cleopa-painea/`](experiments/cleopa-painea/) |
| Riguri ale familiei, veselă, casă, scenele de rugăciune și testul semnului crucii | [`experiments/cleopa-blender/`](experiments/cleopa-blender/) |
| Teste de articulații cu Mama | [Palmă, cot și umăr](https://viata-parintelui-cleopa-seven.vercel.app/articulatii/) |
| Asamblare de scene Three.js | [Atelierul Three.js](https://viata-parintelui-cleopa-seven.vercel.app/asamblare/) |
| Inspector de scenă pentru mobil | [Inspectorul public](https://viata-parintelui-cleopa-seven.vercel.app/inspectie/) |
| Instrucțiuni și skill pentru un episod | [`AGENTS.md`](AGENTS.md) · [facut-episod](.agents/skills/facut-episod/SKILL.md) |

`npm run check:cleopa` rulează smoke testul Blender, verifică rigurile și filmul, inclusiv suprapunerile la fiecare cadru. `npm test` testează validarea feedbackului. Cu preview-ul pornit, `npm run check:preview` verifică în Chromium redarea, capitolele, formularul, biblioteca, afișarea pe mobil, inspectorul și asamblarea Three.js. Poți da o adresă Vercel ca argument. Adaugă `--write-feedback` pentru a testa și salvarea, cu o observație etichetată ca test. Consultă README-ul episodului pentru refacerea vocii și a muzicii prin OpenRouter și exportul cadrelor.

## Filmul în Three.js și foi de cadre

Atelierul deschide planurile reale din episod. Exportul păstrează geometria, camera ortografică pe fiecare cadru, ordinea după adâncime, obiectele vizibile și pozițiile mesh-urilor evaluate. Playerul descarcă planurile pe rând, iar imaginea urmează timpul pistei audio. Modul „Scene de probă cu GLB” permite compoziții independente.

```bash
# După o modificare a scenei .blend, regenerează datele playerului.
blender -b experiments/cleopa-painea/scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 --python experiments/cleopa-painea/scripts/export_web_episode.py
npm run build

# Cadrele sunt numerotate de la 1. Compară Three.js și referința MP4.
npm run sheet -- episod 1 285 1485 3081 --source ambele --columns 2 --out /tmp/comparatie.png
npm run sheet -- mama-palma 1 21 31 53 73 96 --out /tmp/test-palma.png
```

Pe pagina Mamei, cele trei teste au surse Blender editabile. Capsula mânecii amestecă ponderi de piept, os de umăr și braț, iar osul umărului urmează parțial rotația brațului. În teste, un braț cu segmente de lungime fixă mișcă mâneca desenată continuu și palma cu formă interpolată. Cheile Bézier controlează brațul, cotul, orientarea palmei, flexia degetelor și deschiderea degetului mare. Fiecare test are o foaie de cadre lângă sursa Blender. În episod, filtrul de rotație adaugă chei intermediare acolo unde încheietura își schimbă direcția prea brusc. Reexportă fișierele cu următoarea comandă.

```bash
blender -b --factory-startup --python-exit-code 1 --python experiments/cleopa-painea/scripts/export_web_characters.py -- --stress
npm run build
```

## Gesturile Mamei

[Deschide cele șapte gesturi în atelier](https://viata-parintelui-cleopa-seven.vercel.app/articulatii/?set=gesturi).
Primele patru sunt semnul crucii, ridicarea cănii, râsul cu mâna la gură și mustrarea cu arătătorul. Talerul cu pâine, ridicarea baticului și indicația spre traistă corespund acțiunilor din „Pâinea caldă”, „Porcul și omul” și „Drumul spre școală”.

```bash
blender -b --factory-startup --python-exit-code 1 --python experiments/cleopa-painea/scripts/export_web_characters.py -- --gesturi
npm run build
```

Autorarea combină poziții de articulație interpolate cu rezolvarea cinematică a contactului. Opririle sunt descrise prin repere precum fruntea, gura, toarta sau marginile talerului. În timpul prinderii, poziția vasului și ținta mâinii se calculează din aceeași traiectorie. Între opriri se interpolează unghiurile, iar pentru contacte foarte apropiate se adaptează proiecția brațului. Mâneca și palma primesc deformări evaluate pe cadre, exportate în GLB ca morph targets. Ochii și gura folosesc desene discrete. Fișierele `mama-gest-*.blend` păstrează pozițiile, cheile și recuzita.

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
npm run render:scene -- de-plecare --width 1920 --fps 24
npm run render:scene -- de-plecare --still --out /tmp/cadre-cleopa
```

Comanda folosește buildul din `dist/`. Rulează `npm run build` după o schimbare de JSON, JavaScript sau GLB. Exportul scrie implicit la `studio/asamblare/renders/` și măsoară timpul până la PNG și până la MP4. Fiecare cadru de film se evaluează la timpul său, apoi FFmpeg comprimă imaginile în H.264. Rulează iar buildul pentru a include exporturile în site.

Pentru a actualiza sursa bibliotecii după o schimbare în Blender, regenerează GLB-urile și reconstruiește site-ul.

```bash
blender -b experiments/cleopa-painea/scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 --python experiments/cleopa-painea/scripts/export_web_props.py
blender -b --factory-startup --python-exit-code 1 --python experiments/cleopa-painea/scripts/export_web_characters.py
npm run build
```

## Vercel și feedback

Vercel construiește site-ul cu `npm ci` și `npm run build`, publicând `dist/` și funcția `POST /api/feedback`. Proiectul Vercel este conectat la acest repo, cu ramura de producție `main` și un **Vercel Blob privat** atașat pentru Production și Preview. Pentru o copie a proiectului, setează Node.js 24 și atașează un Blob privat înainte de primul deploy. Funcția scrie câte un JSON privat în `feedback/`, cu textul, momentul, episodul și data. Exportă-l cu `npm run feedback:export`, cu `BLOB_READ_WRITE_TOKEN` al magazinului setat local. `vercel env pull .env.local` permite apoi `node --env-file=.env.local tools/feedback-export.mjs`.
