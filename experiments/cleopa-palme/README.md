# Palme 2.5D · trei abordări în test de stres

Ne întoarcem la modelul 2.5D. Mama rămâne un set de desene plate, animate limitat, ca în serialele cu piese tăiate (*Bluey*, *Hello Kitty*, *Popeye*). Un schelet 3D primitiv, pe care nu îl vede nimeni, calculează mișcarea. Proiecția lui ortografică conduce desenul. Palmele sunt partea cea mai grea, așa că le comparăm în trei variante, pe același schelet.

[Deschide atelierul](https://viata-parintelui-cleopa-seven.vercel.app/palme/) · [Specificația variantei alese](SPECIFICATIE.md) · [Handoff pentru episod](HANDOFF.md) · sursele: [`studio/palme/`](../../studio/palme/) · test: [`tests/palme.test.mjs`](../../tests/palme.test.mjs)

## Straturile modelului

| Strat | Cum se mișcă |
| --- | --- |
| Schelet | Proxy 3D primitiv în `rig.js`: umăr, cot, încheietură, palmă din sfere și degete din capsule, cu trei falange. Brațul este un lanț IK cu două oase de lungime fixă. Cheile dau direcția degetelor, direcția palmei și gestul. La semnul crucii, cheia fixează punctul de contact, iar încheietura se calculează din el. |
| Corp și cap | Desene plate în planul corpului. La rotirea camerei, piesele se îngustează, iar trăsăturile feței alunecă spre partea întoarsă. |
| Brațe | Mânecă *rubber hose*: o curbă prin umărul, cotul și încheietura proiectate, cu lățime fixă. Nu se pliază la cot, iar mișcarea rămâne ușor de citit. |
| Palme | Trei abordări, mai jos. |

## Cele trei abordări pentru palme

- **A · Substituție de desene** (`substitutie`). Biblioteca are 6 gesturi × 12 vederi, deci 72 de desene. La fiecare cadru se elimină rotația în planul ecranului. Se alege apoi desenul cu gestul și vederea cele mai apropiate de schelet. Desenul se rotește, se scalează și se lipește la încheietură. Ca un animator cu foaia de mâini, păstrează un desen cel puțin două cadre. Trece la altul doar dacă diferența e clară. Aici desenele sunt generate din schelet, ca să poată fi comparate. În producție le redesenează un artist.
- **B · Plasă 2D pe oase proiectate** (`plasa`). Este procesul propus: proxy 3D, proiecție, deformare 2D. În limbaj tehnic se numește *skinning 2D* sau *linear blend skinning* pe o plasă triunghiulată, ca în Spine sau Live2D. Palma urmează o transformare afină dată de încheietură și de încheieturile arătătorului și degetului mic, proiectate. Fiecare falangă e un os 2D elastic între două articulații proiectate. Lungimea urmează perspectiva, lățimea rămâne fixă. Ponderile se amestecă 50/50 la fiecare articulație. Semnul determinantului afin decide dacă se vede palma sau dosul.
- **C · Volume desenate plat** (`volum`). Proiecția ortografică a unei capsule este exact o capsulă 2D, iar a unei învelitori de sfere este învelitoarea cercurilor. Piesele se pictează plat, de la spate la față: întâi toate contururile unei piese, apoi umplerea. Un deget drept face corp comun cu palma. O articulație îndoită peste 40° începe o piesă nouă, așa că linia de contur apare acolo unde ar desena-o un animator. Ordinea pieselor are memorie de 0,5 cm în adâncime. Unghiile, liniile palmei și umbrele pieselor din spate se adaugă după reguli.

## Testele de stres

| Test | Ce încearcă |
| --- | --- |
| `rasucire` | Palma se întoarce cu 180°, apoi stă orizontală, cu fața în sus și în jos. |
| `pumn` | Pumnul se strânge și se deschide, din față și din dos. |
| `aratare` | Arătătorul vine drept spre lentilă, apoi arată în lateral și în sus. |
| `salut` | Încheietura flutură de trei ori pe secundă. |
| `cruce` | Trei degete unite ating fruntea, pieptul, umărul drept și umărul stâng. |
| `orbita` | Camera trece de la −70° la +70° în jurul pumnului și al palmei. |

Pagina măsoară la fiecare cadru, la 24 fps, următoarele valori:

- silueta fiecărei variante față de silueta scheletului, prin IoU, într-o cameră care urmărește palma;
- salturile, adică un cadru care se schimbă cu cel puțin 20 de puncte mai mult decât referința;
- eroarea de contact la semnul crucii, în mm;
- pliurile plasei B;
- mutările și pâlpâirile liniei interioare la C.

## Rezultate (Chromium, 670 de cadre)

| | A · Substituție | B · Plasă 2D | C · Volume |
| --- | --- | --- | --- |
| Siluetă față de schelet | 83% | 83% | referința |
| Salturi | 43 | 3 | — |
| Pliuri | — | 306 cadre din 670 | — |
| Contact la semnul crucii | până la 80 mm | 0 mm | 0 mm |
| Linia interioară se mută / pâlpâie | — | — | 146 / 2 cadre |
| Desene de autor | 72 (36 folosite) | 1 (palmă și dos) | 0 |

**Recomandare.** Scheletul 3D primitiv rămâne sursa mișcării, a contactelor și a ordinii în adâncime. Corpul rămâne desenat, iar brațele sunt tuburi curbe.

- Pentru palme, **C** este baza.
- Peste C se pun **substituții A** pentru pozele-cheie ținute pe ecran. Acestea se ancorează la punctul de contact.
- Plasa **B** se folosește pentru piesele care nu se întorc: fusta, baticul și mâneca. Pentru degete nu se folosește.

Plasa nu poate inventa partea degetului pe care desenul nu o are. Când falangele proiectate se suprapun, triunghiurile se întorc.

## Comenzi

```bash
npm test                 # include tests/palme.test.mjs: IK, contactele crucii, rotația palmei, substituția, pliurile
npm run build && npm run preview
npm run check:preview    # deschide și /palme/, așteaptă raportul și verifică derularea
```

## În episod: brațe și palme 2.5D

Varianta aleasă este acum în filmul „Pâinea care poate să aștepte”, după [handoff](HANDOFF.md). Faza 1 este Mama, în toate planurile. Faza 2 sunt Costică, Mihai și Tata, în bucătărie.

| Piesă | Unde |
| --- | --- |
| Portul Python al `rig.js` și `hands.js`, plus stratul episodului | [`palme25d.py`](../cleopa-painea/scripts/palme25d.py) |
| Paritatea cu `/palme/`, la 1e-6, pe toate cele 670 de cadre ale testelor | [`tools/palme-fixtures.mjs`](../../tools/palme-fixtures.mjs), [`tests/palme25d_test.py`](../../tests/palme25d_test.py) |
| Oasele 2D primesc proiecția IK-ului 3D | `arm_key` în [`animate_prayer.py`](../cleopa-blender/scripts/animate_prayer.py) |
| Contactele (tava, obrazul) și coregrafia | [`build_episode.py`](../cleopa-painea/scripts/build_episode.py) |
| Palma C, poza A, colțul baticului | [`palme25d_bake.py`](../cleopa-painea/scripts/palme25d_bake.py) |
| Verificările §5 | `verify_palme25d` în [`verify_episode.py`](../cleopa-painea/scripts/verify_episode.py) |
| Foile de contact | [`renders/`](renders/): linia de bază, Mama, familia, cadrele dificile |

**Rezultat.** `verify_palme25d` trece pe toate cele 10 mâini. Lungimile sunt fixe (eroare 0). Contactul cu tava și cu obrazul alunecă cel mult 0,002 mm. Tava se mișcă față de degete cel mult 0,003 mm între desene. Nu există pâlpâiri, pliuri sau piese la mai puțin de ε/2. IoU la trecerea C → A este 0,993. `check_overlaps.py --step 1` găsește 0 intervale, ca linia de bază, deci nu e nevoie de excepții.

### Ce diferă de specificație și de ce

- **Mâna din `rig.js` este, anatomic, o mână stângă.** `handQuat` pune degetul mare la −(degete × palmă). Cu palma spre cameră și degetele în sus, degetul mare drept trebuie să fie spre mijlocul corpului, adică în dreapta ecranului. În episod, mâna stângă folosește proxy-ul direct, iar dreapta îl oglindește. Desenele din `hands.py` erau deja corecte. Atelierul `/palme/` și testul lui (`the palm turns`) au rămas neschimbate, ca paritatea să se păstreze. Merită corectate acolo.
- **Polul cotului** este (−0,45, −0,8, −0,4), nu (−0,6, −0,5, −0,55). În gesturile episodului (tava ținută aproape, mâna la obraz, invitația), polul din `/palme/` ridică cotul la nivelul umărului. Adâncimea încheieturii este cea care lasă cotul cel mai jos, cu ambele segmente proiectate de cel puțin 45 % din lungime. IK-ul rezolvă doar pozele regizate și contactele; între poze, `arms()` interpolează unghiurile articulațiilor. Când încheietura era trasă în linie dreaptă și rezolvată la fiecare cadru, antebrațul se scurta în trecere până la 7–15 % și cotul sărea pe partea cealaltă când mâna trecea pe lângă umăr. La contacte, cotul păstrează partea de la cadrul precedent (`CONTINUITY`).
- **Mărimea palmei.** Suprapunerea siluetelor pe desenele `rest`, `open` și `cup` dă 0,0655 × `profile["hand"]` pe centimetru. Asta este de 1,3 ori mărimea anatomică, deci factorul 1,3 rămâne. Degetele seriei sunt scurte și groase, iar grosimea care le potrivește este 1,6, nu 1,15 (IoU 0,82–0,87).
- **Mâneca e o singură bucată, cu cotul copt.** Plasa deformată de oase se întorcea pe dos la cot (135 de desene), iar varianta următoare, două piese rigide suprapuse la cot, arăta ca două cutii lipite. Acum mâneca e rigidă pe braț (rotită în jurul umărului, sub corsaj) și pe antebraț (cu manșeta), iar `maneci_bake.py` rotunjește cotul pe fiecare desen: arc în exterior, pliu în interior, antebrațul deasupra. Palma se întoarce sub manșetă.
- **Ordinea pieselor.** Memoria din `hands.js` (rang/n × 0,5 cm) pâlpâie când o articulație trece de 40° și se schimbă numărul de piese. În episod, o pereche care tocmai s-a inversat rămâne blocată 3 desene, apoi are histerezis de 1,5 cm încă 3 desene. După aceea contează din nou doar adâncimea. Un simplu histerezis lăsa degetul mare al Tatălui în spatele palmei. Fiecare treaptă de rang are 4 niveluri Z (contur, umplere, detalii, unghie), nu 2. ε este 4e-4 unități de rig, adică 2e-4 în lume.
- **Tava rămâne C pe tot drumul.** Degetele sunt sub taler, iar degetul mare e în fața lui, pe un nivel propriu între taler și pâine. Un desen A este o singură piesă plată și nu poate fi și în spatele, și în fața talerului.
- **Poza A la obraz este un desen nou, `cheek`.** Desenul `cup` atingea doar IoU 0,47 cu C. Conform handoff-ului s-a ajustat desenul, nu proxy-ul. `redeseneaza_a.py` trasează silueta C de la începutul pozei, iar desenul are aceeași linie, aceleași culori și linii între degete. Prima atingere a obrazului ține 7 desene, sub pragul de 8, deci rămâne C.
- **Mâna la față.** Când palma acoperă capul, antebrațul, manșeta și palma trec împreună cu 0,1 în fața părului și a baticului ridicat, printr-un shape key al mânecii. Ordinea manșetă–palmă nu se schimbă.
- **Întinderea.** Talerul purtat de Mama ajunge până la 99,6 % din lungimea brațului, iar încheietura nu mai este trasă înapoi.
- **`reach`** are palma în jos și puțin dinspre cameră. Cu palma exact în jos, degetele întinse se văd din muchie și mâna pare un pumn.

### Comenzi

```bash
node tools/palme-fixtures.mjs && python3 tests/palme25d_test.py     # paritatea cu /palme/
cd experiments/cleopa-painea
blender -b --factory-startup --python-exit-code 1 --python scripts/build_episode.py
blender -b scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 --python scripts/palme25d_bake.py
blender -b scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 --python scripts/maneci_bake.py
blender -b --factory-startup --python-exit-code 1 --python scripts/verify_episode.py
# foaia de contact a momentelor (faza 1 sau 2)
blender -b scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 \
  --python ../cleopa-palme/scripts/randeaza_momente.py -- --out /tmp/momente --faza 1
python3 ../cleopa-palme/scripts/foaie.py /tmp/momente ../cleopa-palme/renders/foaie.jpg "Palme 2.5D"
```
