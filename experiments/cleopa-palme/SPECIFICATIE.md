# Varianta aleasă: brațe și palme 2.5D

Acest document descrie varianta recomandată după testul de stres de pe [`/palme/`](https://viata-parintelui-cleopa-seven.vercel.app/palme/). Implementarea de referință este în JavaScript, în [`studio/palme/`](../../studio/palme/). Orice port, de exemplu în Python pentru Blender, trebuie să dea aceleași numere. Comparația dintre variante este în [README](README.md).

## 1. Principiul

> Mișcarea se calculează în 3D. Imaginea se desenează în 2D.

Un **proxy 3D primitiv** (schelet cu volume simple) nu apare niciodată în imagine. El dă poziția umărului, a cotului, a încheieturii și a fiecărei falange, plus orientarea palmei și adâncimea. Tot ce se vede este desen plat, cu conturul și culorile seriei. Animația este limitată, pe doi, adică un desen nou la fiecare două cadre.

| Strat | Tehnica | Sursa de referință |
| --- | --- | --- |
| Mișcare | Proxy 3D: IK cu două oase pentru braț, cinematică directă pentru degete, chei de orientare și gest | `rig.js` |
| Corp, cap, haine | Desene plate; plasă 2D (skinning) doar pe piesele care nu se întorc: mâneca, fusta, baticul | `body.js`, `sleeves.py` din episod |
| Braț | Mânecă deformată după umărul, cotul și încheietura **proiectate** din proxy | `body.js` (`sleeveGroups`) |
| Palmă | **C**: volumele proxy-ului proiectate și desenate plat, cu contur | `hands.js` (`buildVolume`) |
| Poze-cheie | **A**: desene de autor care înlocuiesc C în cadrele ținute, ancorate la punctul de contact | `hands.js` (`buildSubstitution`), `hands.py` din episod |

## 2. Proxy-ul 3D

**Axe.** x spre stânga Mamei, adică spre dreapta ecranului când e cu fața. y în sus, z spre cameră. Mâna dreaptă anatomică este în stânga ecranului.

**Brațul.** Este un lanț IK cu două oase de lungime fixă (`twoBone`). Polul cotului cade în jos, în afară și înapoi: `(-0.6, -0.5, -0.55)` pentru dreapta, în oglindă pentru stânga. Lungimile se iau din profilul personajului, nu se inventează.

**Cadrul palmei.** Axa x merge spre degetul mare, y de-a lungul degetelor, z iese din dosul palmei. O cheie dă `dir` (încotro arată degetele) și `palm` (încotro privește palma). Baza se ortonormează în `handQuat`. Între chei, orientarea se interpolează cu **slerp**, nu pe componente.

**Palma** este învelitoarea a 7 sfere. **Degetele** sunt câte 3 capsule, cu raza descrescătoare `1, 0.93, 0.86`. Fiecare articulație se îndoaie în jurul axei laterale a degetului, spre palmă (`-z`). Unghiurile la curl = 1 sunt 88°, 100° și 70°. Degetul mare are metacarpianul în palmă și pivotează între poziția laterală și opoziție.

**Gesturile** sunt vectori de parametri, nu desene: `curl[4]`, `spread`, `opp`, `tcurl`, `pinch`. Între chei se interpolează liniar. Gesturile de bază sunt `deschis`, `relaxat`, `pumn`, `aratator`, `treiDegete` și `cupa`.

**Contactul.** O cheie poate fixa vârful (`tip: țintă`), nu încheietura. Încheietura se calculează ca `țintă − R · contactLocal`, apoi IK-ul ajunge la ea. La `treiDegete`, contactul este media vârfurilor degetului mare, arătătorului și mijlociului. Așa vârfurile stau exact pe frunte, piept și umeri.

**Proporții de desen animat.** Palma e de 1,3 ori mai mare decât anatomic, iar degetele sunt cu 15% mai groase (`HAND.scale`, `HAND.thickness`).

## 3. Palma C: volume desenate plat

1. **Proiecție ortografică.** O capsulă proiectată este exact o capsulă 2D: două cercuri cu raza neschimbată și tangentele lor. Învelitoarea sferelor devine învelitoarea cercurilor.
2. **Piese.** Palma și metacarpianul degetului mare formează o piesă. Fiecare deget pornește ca piesă proprie, „înrădăcinată” în palmă. O articulație îndoită **peste 40°** (`BEND_SPLIT`) începe o piesă nouă. Așa linia de contur apare doar la îndoituri, ca la un animator.
3. **Pictarea unei piese.** Întâi conturul tuturor formelor din piesă (forma mărită cu grosimea liniei), apoi umplerea. Formele aceleiași piese se contopesc fără cusături.
4. **Ordinea.** Piesele se pictează de la spate la față, după adâncimea medie. **Memoria de ordine** adaugă fiecărei piese `rangAnterior/n × 0,5 cm`, deci perechile aproape la aceeași adâncime nu se inversează din zgomot.
5. **Rădăcina.** Un deget înrădăcinat stă în fața palmei, dacă nu e clar în spatele ei, cu mai mult de 1,2 cm. Peste baza lui se pune un petic de culoarea pielii, tăiat după conturul palmei. Așa nu se vede capătul rotund al capsulei în interiorul palmei.
6. **Tonuri.** Piesele aflate în spatele palmei cu mai mult de 0,3 cm primesc tonul de umbră al pielii.
7. **Detalii prin reguli:**
   - **Unghie** pe falanga a treia, dacă dosul ei e spre cameră (`dorsal.z > 0,3`) și degetul nu e strâns în pumn (suma îndoirilor < 150°).
   - **Liniile palmei**, dacă palma privește spre cameră (`> 0,35`).

## 4. Pozele-cheie A

- Se folosesc doar unde palma stă pe ecran cel puțin 8 desene: mâna pe pâine, colțul baticului ținut, palmele în rugăciune.
- Desenul de autor se **ancorează la punctul de contact**. Rotația în planul ecranului se ia din proxy (`screenUp`). Scara vine din cameră.
- Trecerea C → A → C se face pe un desen de margine, nu prin dizolvare. Desenul A trebuie să aibă aceeași siluetă ca C în primul și ultimul cadru, cu IoU ≥ 0,85.
- Fără ancorare la contact, testul arată erori de până la 80 mm. Cu ancorare, eroarea se mută la încheietură, unde manșeta o acoperă.

## 5. Mâneca

Mâneca este desen, deformat după punctele **proiectate** S, E și W.

- În test, ea este un tub curbat prin S, E și W, cu lățimea fixă: 4,9 → 3,3 cm.
- În episod se păstrează plasa din `sleeves.py`. Oasele `upper_arm` și `forearm` primesc unghiul și scara segmentelor proiectate.
- Lățimea nu urmează perspectiva, deci cotul nu se pliază.
- Degetele care arată de la cameră (`y.z < −0,35`) se desenează sub manșetă, iar restul peste ea.

## 6. Mâna stângă

Mâna stângă nu are geometrie proprie. Este mâna dreaptă, desenată cu unghiul de cameră opus și oglindită față de axa corpului (`renderFrame`). Același lucru e valabil pentru A: desenele mâinii drepte se oglindesc.

## 7. Praguri de calitate

Pentru episod, praguri impecabile:

| Măsură | Prag |
| --- | --- |
| Eroare de contact (frunte, piept, umeri, obiecte) | ≤ 2 mm la scara personajului |
| Pâlpâire a ordinii pieselor (aceeași pereche, ≤ 4 cadre) | 0 |
| Salt de siluetă (Δ față de proxy > 20 de puncte), în afara unei treceri C ↔ A | 0 |
| Pliuri în plasa mânecii | 0 |
| Brațul în repaus: vârful degetului mijlociu deasupra genunchiului | ≥ 1 lățime de deget |
| Degetul mare de partea corectă (dreapta anatomică = stânga ecranului, palma spre cameră) | toate cadrele |
| Semnul crucii: frunte → piept → umărul drept → umărul stâng, cu palma dreaptă | ordinea și cele 4 contacte |
| Continuitate la tăietură: poziția încheieturii între ultimul și primul cadru | ≤ 3% din înălțimea cadrului, dacă nu e motivată |
