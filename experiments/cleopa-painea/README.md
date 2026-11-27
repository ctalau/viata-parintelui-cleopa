# Micuțul Cleopa · Pâinea care poate să aștepte

Episodul urmărește primele zece pagini ale cărții ilustrate și continuă cu dialogul furnizat în scenariu, de la șoapta către Mihai până la rugăciunea în familie. Decorurile, rigurile și paleta provin din experimentul cu rugăciunea la masă. [Vezi proiectul Blender inițial](../cleopa-blender/README.md)

| Pagina | Ce se vede |
| --- | --- |
| 1 | Satul Botoșanilor în zori, Costică în căciulă și rândunelele deasupra dealurilor. |
| 2 | Cocoșul cântă pe gard, Grăsuțu cască, iar Costică se trezește în pat cu mâinile la burtă. |
| 3 | Se aude burta. Costică îi șoptește să nu-l trezească pe tata. |
| 4 | Purcelușul mănâncă din troacă, apoi ridică râtul și grohăie. |
| 5 | Mihai vine dinspre șură cu o carte sub braț și-l cheamă pe Costică. |
| 6 | Mama duce pâinea de lângă cuptor, o așază pe masă și își retrage mâinile. |
| 7 | Mama arată pâinea și le amintește copiilor de traiste și de drumul la școală. |
| 8 | Costică întinde mâna către pâine. Firicelele de abur se adună într-un nor auriu. |
| 9 | Tata, un bărbat tânăr cu mustață, intră și le face semn copiilor să aștepte. |
| 10 | Mâna lui Costică rămâne deasupra pâinii în timp ce se aude îndemnul la rugăciune. |

| Continuare | Cadru și acțiune |
| --- | --- |
| Dar Grăsuțu a început-o… | În același loc, Costică retrage mâna de la pâine și se întoarce spre Mihai. Mihai păstrează cartea sub braț. Tata îl aude pe Costică. |
| Grăsuțu e fericit | Planul se strânge pe băieți. Costică se întoarce și explică, cu mâna liberă. |
| Porcul și omul | În plan de grup, tata își mângâie barba, apoi arată în jos și în sus. Mihai pufnește în râs. Mama își ridică un colț al baticului. |
| Un ceas întreg?! | Costică îl întreabă pe tata cât durează rugăciunea și tresare la răspuns. |
| Și burta zice Amin | Se aude ghiorăitul și Costică pune mâinile pe burtă. Tata spune poanta și familia râde. |
| La icoane | Într-un plan larg, familia stă cu fața spre icoane. Tata ține cartea deschisă. Copiii își îndreaptă privirea de la pâine către icoane și familia spune împreună un vers din «Tatăl nostru». |

Dialogul are formulări mai scurte pentru rostire și o intervenție mai blândă a tatălui în prag. Scenariul și distribuția sunt în `scenariu.json`. Episodul folosește aceleași voci Gemini 3.8 Flash TTS prin OpenRouter în toate momentele. Melodia instrumentală este generată cu Lyria 3 Clip. Corul a fost mixat din cele patru voci ale personajelor. Indicațiile de joc sunt folosite pentru animație și regie, iar ghiorăitul are pista sa de efect. Muzica este reluată cu suprapuneri și atenuată în timpul replicilor. Cele trei efecte sonore sunt sintetizate local. Gurile răspund la energia replicilor și la aproximarea vocalelor din text.

Mama are brațe și palme 2.5D ([specificația](../cleopa-palme/SPECIFICATIE.md), [handoff-ul](../cleopa-palme/HANDOFF.md)). Un proxy 3D, pe care nu-l vede nimeni, calculează brațul și palma, iar imaginea rămâne desen plat. `scripts/palme25d.py` este portul Python al atelierului `/palme/`, verificat față de el la 1e-6. `arm_key` dă oaselor 2D unghiul și scurtarea segmentelor proiectate ale unui IK 3D cu lungimi fixe și cheiază adâncimea încheieturii și direcția palmei. Adâncimea aleasă lasă cotul cât mai jos, cu ambele segmente lizibile. Tava, obrazul și colțul baticului sunt contacte: încheietura se calculează din vârful degetelor, iar tava și colțul baticului urmează degetele. `scripts/palme25d_bake.py` desenează la fiecare desen palma din volumele proiectate (C). Palma are 16 piese, contur, umbră pentru piesele din spate, unghii și liniile palmei, într-un obiect cu topologie fixă, copt în shape keys cu interpolare constantă. Ordinea pieselor se dă prin Z, cu histerezis, ca degetele aproape la aceeași adâncime să nu pâlpâie. Degetele care arată departe de cameră trec sub manșetă. Degetul mare ține talerul prin față, iar mâna care atinge fața trece, cu antebrațul și manșeta, în fața părului și a baticului. În poza ținută la obraz, desenul de autor `cheek` (A), redesenat după silueta C, se ancorează la contact. Mâna stângă e oglinda dreptei. Proxy-ul din `rig.js` este, anatomic, o mână stângă, deci mâna dreaptă îl folosește oglindit. Mâneca Mamei e plasa episodului, în două piese suprapuse la cot. Piesa antebrațului stă în față, iar manșeta urmează antebrațul, astfel că nici un braț îndoit spre obraz nu pliază plasa. La celelalte personaje, mânecile au câte o singură suprafață, deformată de trunchi, braț, antebraț și încheietură. Marginea dinspre umăr rămâne ancorată în haină. Brațele și antebrațele sunt scurtate, astfel încât degetele rămân vizibil deasupra genunchilor în repaus. Manșeta se deformează cu antebrațul și încheietura. Degetele au lungimi și curburi diferite în desenele de repaus, prindere, întindere și oprire. În repaus, respirația se vede discret în piept, cu picioarele pe loc. Troaca are o muchie frontală separată de interior, iar râtul lui Grăsuțu se vede deasupra tărâțelor.

## Redare și editare

- `renders/painea_care_poate_sa_astepte.mp4` este filmul cu voce și muzică. Copia de descărcat are sub 5 MB, 768 × 432 la 24 fps și sunet stereo. Scena se randează la 1280 × 720, cu un desen la fiecare două cadre.
- `scenes/painea_care_poate_sa_astepte.blend` are decorurile, camerele, rigurile, textul și pistele audio editabile. Marcajele de pe Timeline selectează camerele. Titlul și efectul grafic se editează în colecția `Titlu și efecte grafice`, iar sunetul în Video Sequencer.
- `assets/family_rigs.blend` conține cele șase riguri 2D cu proporțiile revizuite, marcate ca active de tip Collection. Folosește **File → Append → Collection** și repoziționează rigul, sau încarcă biblioteca în Asset Browser. Generează fișierul cu `blender -b --factory-startup --python-exit-code 1 --python scripts/build_family_library.py`.
- `renders/foaie_contact.jpg` prezintă toate cele 17 planuri de filmare ale celor 16 momente.

## Reproducere

Din acest folder, cu Blender 4.3.2, FFmpeg, Python 3, NumPy, Pillow și fonturile DejaVu. Scriptul Blender importă constructorii de personaje și decor din `../cleopa-blender/scripts`. Fișierul Blender salvat include fonturile, vocile și muzica.

```bash
python3 scripts/prepare_timeline.py
blender -b --factory-startup --python-exit-code 1 --python scripts/build_episode.py
blender -b scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 --python scripts/palme25d_bake.py
blender -b --factory-startup --python-exit-code 1 --python scripts/verify_episode.py
blender -b scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 --python scripts/check_overlaps.py -- --step 1
mkdir -p renders/frames
blender -b scenes/painea_care_poate_sa_astepte.blend -o //../renders/frames/frame_#### -F PNG -a
python3 scripts/export_episode.py
```

Vocile se pot regenera cu `OPENROUTER_API_KEY` setată în mediu. După o modificare în scenariu, `--force` primește ID-urile fișierelor WAV schimbate, fără extensie. De exemplu, pentru prima replică din pagina 2 se folosește `--force 02-01`.

```bash
python3 scripts/generate_audio.py
python3 scripts/prepare_timeline.py
python3 scripts/verify_openrouter.py
python3 scripts/prepare_timeline.py
```

## Verificarea suprapunerilor

`scripts/check_overlaps.py` proiectează contururile convexe ale capetelor și mâinilor în camera activă. Raportează intervalele în care se suprapun capetele, în care o mână acoperă sau e acoperită de capul altui personaj și în care se suprapun două mâini. Semnalează separat intersecțiile la adâncimi aproape egale. Implicit examinează cadrele randate, iar `--step 1` verifică și cadrele dintre ele.

`--json raport.json` salvează intervalele și procentul de suprapunere al conturului mai mic. `--report-only` afișează rezultatele fără a opri verificarea cu o eroare. Pentru o suprapunere intenționată, `--allow exceptii.json` acceptă o listă de excepții cu câmpurile `kind`, `camera`, `parts`, `start`, `end` și `reason`. Denumirile apar în raport, iar explicația și intervalul fac excepția specifică acelei mișcări.
