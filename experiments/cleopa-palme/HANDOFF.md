# Handoff: brațe și palme 2.5D în „Pâinea care poate să aștepte”

Pentru agentul care preia lucrul. Citește mai întâi [`AGENTS.md`](../../AGENTS.md), skill-ul [`facut-episod`](../../.agents/skills/facut-episod/SKILL.md), [README-ul episodului](../cleopa-painea/README.md) și [specificația variantei](SPECIFICATIE.md). Instrucțiunile din `AGENTS.md` au prioritate față de acest document.

## 1. Misiunea

1. Scoate brațele volumetrice 3D ale Mamei din episod.
2. Pune în locul lor varianta 2.5D din `SPECIFICATIE.md`:
   - proxy 3D invizibil;
   - mâneci desenate, conduse de proiecția proxy-ului;
   - palme **C**, adică volume desenate plat;
   - poze-cheie **A**, adică desenele de autor din `hands.py`, ancorate la contact.
3. Faza 1 este Mama. Faza 2 sunt Costică, Mihai și Tata, cu același sistem.

Calitatea cerută este impecabilă: zero pâlpâiri, zero pliuri, contacte sub 2 mm și desenul seriei peste tot. Filmul MP4 și filmul Three.js trebuie să arate aceeași geometrie.

**În afara misiunii:** scenariul, vocile, muzica, decorurile, camerele și coregrafia. Pozițiile încheieturilor față de pâine, batic și traistă rămân cele regizate acum. Se schimbă doar cum sunt calculate și desenate brațele și palmele.

## 2. Ce există deja

| Piesă | Unde | Ce face azi |
| --- | --- | --- |
| Rigul 2D al familiei | `experiments/cleopa-blender/scripts/build_rigs.py` | Oasele `upper_arm.*`, `forearm.*`, `hand.*` sunt în planul XY. `solve_arm` calculează unghiurile și scara (scurtarea) cu un cot pseudo-3D. |
| Cheile de braț | `animate_prayer.py` (`arm_key`, `prop`) și `build_episode.py` (`arms`, `stand`, `relax_wrist`, `hand_pose`) | Coregrafia: încheietura în spațiul rigului, direcția palmei 2D, indexul desenului de mână. |
| Desenele de mână (abordarea A) | `experiments/cleopa-painea/scripts/hands.py` (`HAND_POSES`: rest, open, cup, grip, reach, stop) | Se comută cu proprietatea `hand_R_pose` / `hand_L_pose` și drivere `visible_if` din `build_characters.py`. |
| Mâneca desenată (plasă B) | `experiments/cleopa-painea/scripts/sleeves.py` (`bind_cloth`) | Plasă continuă de la corsaj la manșetă, cu ponderi pe chest, shoulder, upper_arm, forearm și hand. |
| Brațele volumetrice ale Mamei | `experiments/cleopa-painea/scripts/mama_volumetrica.py` | Tub 3D și palmă 3D, coaptă în shape keys. **Asta se înlocuiește.** |
| Verificarea lor | `verify_episode.py` → `verify_volumetric` | Se înlocuiește cu verificarea nouă. |
| Exportul web | `export_web_episode.py`, `export_web_characters.py` (`bake_shapes`) → `assets/film/` | Three.js redă desenele evaluate și shape keys. |
| Implementarea de referință C și A | `studio/palme/rig.js`, `hands.js`, `draw.js` | Funcții pure, testate în `tests/palme.test.mjs`. |

Convenții deja compatibile:
- Camerele episodului sunt ortografice și frontale, cu XY ca plan al imaginii și +Z spre cameră. Sunt aceleași axe ca în `rig.js`. Proiecția înseamnă doar `(x, y)`, iar adâncimea este `z`.
- Dreapta anatomică este în stânga ecranului.
- Scena se randează la 1280 × 720, cu un desen la fiecare două cadre.

## 3. Momentele Mamei

Aici se judecă rezultatul. Toate sunt în `build_episode.py`.

| Moment | Cod | Mâini | Risc |
| --- | --- | --- | --- |
| Duce pâinea de la cuptor la masă | `animate_kitchen`, aproximativ liniile 470–495: `grip`, `aim`, `settle` | Ambele palme sub tavă, gestul `cup`. Tava urmează mâinile. | Contactul cu tava pe tot drumul. Degetele trec sub tavă, deci contează ordinea în adâncime: degetele în spatele tăvii, degetul mare în față. |
| Retrage mâinile, repaus | `relax_wrist`, `settle+21` | `rest` | Brațul relaxat se oprește clar deasupra genunchiului, iar manșeta e întreagă. |
| Invită copiii („traista”) | `arms(mother,"L",...)`, `invite` | Stânga: `open`, palma în sus, spre copii | Palma în sus, în ușoară perspectivă. Degetul mare trebuie să fie de partea corectă după oglindire. |
| Mâna la obraz, de două ori | `kitchen_replies`: `cheek`, `lesson_reaction`, `laugh` | Dreapta: `cup` la obraz | Contactul cu obrazul. Palma trece peste fața desenată, deci mâna trebuie să fie în fața capului, nu să-l taie. |
| Ridică un colț al baticului | `scarf_fold` | Dreapta ține colțul | Colțul baticului urmează vârful degetelor, nu capul. Azi e legat de osul `head`. |
| Rugăciunea, la icoane | `prayer_tableau` | `stand`, repaus | Repaus, respirație, simetrie stânga–dreapta. |

În faza 2 urmează:
- Costică întinde mâna spre pâine (`reach`), își pune mâinile pe burtă și explică cu mâna liberă;
- Tata face semnul de oprire (`stop`), își mângâie barba și arată în jos și în sus;
- Mihai ține cartea sub braț (`grip`).

## 4. Planul de lucru

### Pasul 0 · Linia de bază

- Rulează comenzile din README-ul episodului și salvează o foaie de contact cu momentele de mai sus, la 3 cadre fiecare: pregătire, contact și revenire.
- Rulează `check_overlaps.py --step 1 --json` și păstrează raportul ca referință.

### Pasul 1 · Portul Python, fără `bpy`

1. Creează `experiments/cleopa-painea/scripts/palme25d.py`, un port 1:1 al `rig.js` (proxy, IK, gesturi, `handLocal`) și al `hands.js` (`buildVolume` cu memorie, `screenUp`, ancorarea A).
2. Fișierul trebuie să conțină doar Python pur, ca să poată fi testat fără Blender.
3. Adaugă `tools/palme-fixtures.mjs`, care scrie în `tests/fixtures/palme/*.json` puncte proiectate, piese, ordine și contacte pentru toate testele de pe `/palme/`.
4. Adaugă un test Python care compară portul cu fixture-urile, cu toleranța `1e-6`.
5. Fără paritate, nu treci mai departe.

### Pasul 2 · Proxy-ul pe rigul episodului

- **Lungimi.** Ia `upper`, `lower` și `hand` din `character_profile`, iar umărul din `shoulder_x` și `shoulder_y`. Scalează `HAND` astfel încât distanța de la încheietură la încheietura degetului mijlociu să fie partea de palmă din `profile["hand"]`. Păstrează factorii de desen animat 1,3 și 1,15 numai dacă palma rezultată are aceeași mărime ca desenul `rest` actual. Verifică prin suprapunerea siluetelor.
- **Chei.** Adaugă la `arm_key` o adâncime pentru încheietură și o orientare 3D: `dir`, `palm` și gestul ca parametri. Regula implicită pentru chei vechi este:
  - `rest`: degetele în jos, palma spre coapsă;
  - `cup` / `grip`: palma în sus și înăuntru;
  - `open`: palma în sus, spre interlocutor;
  - `reach`: degetele spre țintă, palma în jos;
  - `stop`: degetele în sus, palma spre cameră.

  Tabelul de corespondență din `HAND_POSES` în gest + orientare se pune într-un singur loc și se motivează în fișier.
- **Contacte.** Tava, obrazul și colțul baticului devin ținte `tip`. Încheietura se calculează din contact, nu invers.
- **Brațul.** Înlocuiește partea pseudo-3D din `solve_arm`, adică ramura `wrist[1] > .66` și ramura `seated`, cu proiecția IK-ului 3D. Oasele primesc unghiul și scara segmentelor proiectate. Interfața către `arm_key` rămâne aceeași, ca restul coregrafiei să nu se schimbe.

### Pasul 3 · Mâneca

- Păstrează plasa din `sleeves.py`, condusă de oasele de la pasul 2.
- Verifică la fiecare cadru că niciun triunghi nu se întoarce pe dos. Folosește același test de semn ca `buildMesh` în `hands.js`.
- Dacă antebrațul vine spre cameră și plasa se pliază, nu micșora lățimea. Lățimea rămâne fixă, ca la tub. Mută cotul pe polul relaxat, apoi motivează schimbarea în fișier.
- Manșeta acoperă încheietura în toate cadrele. Degetele care arată departe de cameră trec sub manșetă (`y.z < −0,35`).

### Pasul 4 · Palma C în Blender

Construiește câte un obiect `Palmă 2.5D · <personaj> · R/L` cu **topologie fixă**, ca să poată fi coaptă în shape keys și exportată prin `bake_shapes`:

- 16 piese: palma, metacarpianul degetului mare și 14 falange. Fiecare piesă e un inel fix de vârfuri: capsula 2D are două semicercuri, de exemplu 2 × 12 vârfuri. Palma e o învelitoare cu un număr fix de vârfuri, reeșantionată.
- Fiecare piesă are o coajă de contur (`INK`, grosimea liniei din `hands.py`, adică `.058` în unitățile desenului) și o umplere (`profile["skin"]` sau `profile["skin_shadow"]`).
- **Ordinea** se dă prin Z, în fiecare desen:
  - piesa cu rangul r are conturul la `z0 + 2rε` și umplerea la `z0 + (2r+1)ε`;
  - piesele contopite în aceeași piesă vizuală primesc **același** rang, ca umplerile să acopere contururile interioare;
  - ε trebuie să fie suficient de mare pentru Eevee și pentru Three.js. Verifică z-fighting în ambele.
- Peticele de rădăcină, unghiile și liniile palmei sunt piese fixe, scalate la zero când nu se văd.
- Bake se face doar pe desenele pare, ca restul rigului. Interpolarea între shape keys este **constantă**, pentru că trecerea liniară ar topi piesele.
- Ascunde desenele `hand.*` din `build_characters.py` cât timp C este activ.

### Pasul 5 · Pozele-cheie A

- Folosește desenele existente din `hands.py` în cadrele ținute din tabelul de la §3: tava, obrazul și colțul baticului.
- Ancorează-le la punctul de contact, cu rotația din `screenUp` și oglindite pentru mâna stângă.
- Comutarea C ↔ A se face prin proprietatea existentă `hand_*_pose` și un indice nou pentru „C”.
- Silueta A și silueta C trebuie să aibă IoU ≥ 0,85 în cadrul de trecere. Dacă nu ating pragul, ajustează desenul A, nu proxy-ul.

### Pasul 6 · Scoaterea variantei volumetrice

- Șterge pasul `mama_volumetrica.py` din lanțul de comenzi din `experiments/cleopa-painea/README.md` și din `README.md`, secțiunea „Mama cu brațe volumetrice în film”. Înlocuiește-l cu pasul nou, de exemplu `scripts/palme25d_bake.py`.
- Înlocuiește `verify_volumetric` cu `verify_palme25d` (§5).
- Nu șterge `experiments/cleopa-volum/` și nici `/volum/`. Sunt un alt experiment, iar biblioteca îl afișează.

### Pasul 7 · Faza 2

Aplică pașii 2–5 la Costică, Mihai și Tata, pe momentele din §3. Același cod se folosește pentru toți, cu profilul fiecărui personaj.

## 5. Verificări care trebuie scrise

Adaugă în `verify_episode.py` funcția `verify_palme25d`. Ea oprește build-ul cu mesajul în română, cadrul și camera:

1. **Lungimi.** Umăr–cot și cot–încheietură sunt constante în 3D, cu eroare ≤ 1e-4 unități de rig.
2. **Contacte.** Vârful de contact al tăvii, obrazului și colțului de batic e la ≤ 2 mm de țintă pe toată durata contactului. Conversia în mm se face la scara personajului.
3. **Tava** urmează mâinile: punctul de prindere al tăvii se mișcă la cel mult 0,5 mm față de contact între desene.
4. **Ordinea:**
   - zero pâlpâiri, adică aceeași pereche de piese suprapuse nu își schimbă locul de două ori în 4 cadre;
   - nicio pereche nu are diferența de Z sub ε/2.
5. **Pliuri:** zero triunghiuri întoarse în mâneci și în palme.
6. **Repaus:** vârful degetului mijlociu e deasupra genunchiului cu cel puțin o lățime de deget, în fiecare cadru de repaus.
7. **Lateralitate:** cu palma spre cameră, degetul mare drept e în stânga încheieturii, iar cel stâng în dreapta ei.
8. **Treceri C ↔ A:** IoU ≥ 0,85, iar `hand_*_pose` rămâne neschimbat cel puțin 2 desene.
9. **Rulează și `check_overlaps.py --step 1`.** Orice suprapunere nouă, de exemplu mâna peste obraz, intră în `--allow` cu `kind`, `camera`, `parts`, `start`, `end` și `reason`.

Semnul crucii nu apare în acest episod. Pentru o scenă cu rugăciune, testul `cruce` de pe `/palme/` este poarta de intrare: frunte, piept, umărul drept, umărul stâng, cu palma dreaptă și înclinarea finală verificată în camera activă.

## 6. Livrarea

1. `npm test`, inclusiv paritatea Python față de fixture-uri, și `npm run build`.
2. Comenzile Blender din README-ul episodului, în ordinea lor, cu `--python-exit-code 1`. `npm run check:cleopa` trebuie să fie verde: `scripts/check-cleopa.sh` rulează `verify_episode.py`, `check_overlaps.py --step 1` și `ffprobe`.
3. Redă întâi cadrele dificile: tava la jumătatea drumului, mâna la obraz, colțul baticului, invitația cu palma în sus. Apoi redă 2–3 cadre din fiecare gest. Compară cu foaia de la pasul 0 și pune ambele foi în `experiments/cleopa-palme/renders/`.
4. Filmul complet, `export_episode.py`. Verifică exportul compact cu `ffprobe`:
   - sub 5 MB;
   - 768 × 432;
   - 24 fps;
   - stereo.
5. `export_web_episode.py` → `assets/film/`. Cu `npm run preview` deschis, compară în browser cadrul Three.js cu cadrul randat de Blender, la tava și la obraz.
6. `npm run check:preview`: redarea, derularea și formularul.
7. Actualizează:
   - README-ul episodului, cu paragraful despre Mama și cu lanțul de comenzi;
   - README-ul rădăcină;
   - foaia de contact;
   - `.blend`-ul cu resursele împachetate.
8. După deploy, verifică în browser redarea, derularea la un capitol și trimiterea unei observații.

Cheile și feedbackul rămân în afara Git. Pista românească și muzica rămân separate. Filmul rămâne fără subtitluri.

## 7. Capcane cunoscute

- **Slerp, nu lerp,** pentru orientarea palmei. O răsucire de 180° interpolată pe componente trece prin zero și explodează.
- **Ordinea pieselor fără memorie** pâlpâie la degete aproape paralele. Testul a măsurat pâlpâiri în 25% din cadre înainte de memorie.
- **O plasă 2D pe degete** se pliază la pumn și la degetele spre cameră, în 46% din cadrele testului. Nu folosi skinning 2D pentru degete.
- **Desenele A ancorate la încheietură** ratează contactul cu până la 8 cm. Ancorează-le la contact.
- **Unghiile** pe vârfurile ascunse în pumn arată ca niște nasturi. Regula este suma îndoirilor < 150°.
- **Mâna stângă** e oglinda dreptei, cu unghiul de cameră opus. Nu construi o a doua geometrie.
- **Shape keys cu interpolare liniară** între desene amestecă piese din ranguri diferite. Folosește interpolare constantă.
- **Fără „rotunjiri”.** Dacă un cadru tot arată greșit cu valorile proxy-ului, corectează cheia sau desenul A, nu adăuga o excepție fără motiv scris.
