# Palme 2.5D · trei abordări în test de stres

Ne întoarcem la modelul 2.5D. Mama rămâne un set de desene plate, animate limitat, ca în serialele cu piese tăiate (*Bluey*, *Hello Kitty*, *Popeye*). Un schelet 3D primitiv, pe care nu îl vede nimeni, calculează mișcarea. Proiecția lui ortografică conduce desenul. Palmele sunt partea cea mai grea, așa că le comparăm în trei variante, pe același schelet.

[Deschide atelierul](https://viata-parintelui-cleopa-seven.vercel.app/palme/) · sursele: [`studio/palme/`](../../studio/palme/) · test: [`tests/palme.test.mjs`](../../tests/palme.test.mjs)

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
