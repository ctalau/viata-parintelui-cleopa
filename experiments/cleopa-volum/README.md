# Mama volumetrică · Drumul la troiță

Un experiment cu tot corpul în 3D. Mama are cap, batic, păr, ochi, trunchi, brâu, fustă, mâneci, palme, obiele și opinci. Toate piesele sunt legate de un singur schelet și sunt exportate ca GLB cu skinning obișnuit. Episodul de probă pune modelul la încercare, plan după plan, pe un drum de sat cu o troiță.

[Deschide atelierul](https://viata-parintelui-cleopa-seven.vercel.app/volum/) · [Episodul de probă](https://viata-parintelui-cleopa-seven.vercel.app/volum/?test=episod)

## Fișa episodului

| Plan | Test | Ce se vede | Ce verificăm |
| --- | --- | --- | --- |
| 1 | `mers-spre-camera` | Mama coboară pe drum de departe până aproape de lentilă. | Tălpile stau pe urmă, perspectiva scurtează corpul, fusta trece peste genunchi și brațele se balansează. |
| 2 | `mers-profil` | Traversează drumul, văzută din lateral. | Brațul din spate trece pe după trunchi, opinca nu intră în fustă și sprijinul nu alunecă. |
| 3 | `intoarcere` | Se întoarce complet pe loc. | Silueta din spate, baticul, umerii și opincile, care nu se ating. |
| 4 | `semnul-crucii` | Dreapta merge la frunte, piept, umărul drept și umărul stâng, apoi Mama se înclină. | Vârful degetelor stă la cel mult 1,4 mm de fiecare punct de contact. |
| 5 | `intersectii` | Palme lipite, brațe încrucișate, mâna pe obraz și pe șold, apoi mâinile la spate. | Contactele motivate și orice intersecție neprevăzută. |
| 6 | `aplecare` | Se apleacă după găleată, o apucă de toartă și se ridică. | Tălpile rămân pe loc, mâna ajunge la toartă, iar găleata urmează mâna. |
| 7 | `brate-sus` | Ridică ambele brațe deasupra capului. | Umărul, mâneca și baticul la întinderea maximă. |
| 8 | `doi-pe-drum` | Două instanțe merg în sensuri opuse și se depășesc. | Ordinea în adâncime și distanța dintre ele. |

## Construcție

- `scripts/corp.py` creează scheletul și piesele. Fiecare piesă este o suprafață închisă din inele, cu ponderi care se amestecă scurt la articulații. Conturul este o coajă a aceleiași piese, umflată pe normale și întoarsă pe dos, cu back-face culling. Se vede doar pe margine, din orice unghi, și în Blender, și în Three.js.
- `scripts/miscare.py` calculează fiecare cadru în Python. Trunchiul folosește cinematică directă. Brațele și picioarele sunt lanțuri de două oase cu lungime fixă: genunchiul merge înainte, iar cotul înapoi, în afară și în jos. Talpa de sprijin rămâne exact pe urma ei. Când pasul e lung, coboară șoldurile, nu ridică tălpile. Contactele sunt puncte pe suprafețele deja poziționate, așa că mâna rămâne pe țintă și când corpul se mișcă.
- `scripts/build_volum.py` cheie fiecare test ca acțiune separată. Verifică alunecarea, contactele și intersecțiile și salvează `scenes/mama_volumetrica.blend`. Apoi exportă `assets/recuzita/mama-volum.glb`, drumul și găleata și scrie `studio/volum/teste.json`.
- `teste.json` descrie camerele, în axele Blender, și ordinea planurilor din episodul de probă.

## Verificări

La fiecare al doilea cadru, Blender construiește câte un BVH pentru piesele evaluate, fără coaja de contur. Apoi caută suprapuneri între palme, antebrațe, trunchi, cap, fustă, picioare și opinci. Fiecare contact intenționat are motivul scris în `ALLOWED`, în `build_volum.py`. Restul intervalelor sunt publicate ca observații în raportul de pe pagină. Build-ul se oprește dacă un membru nu ajunge la țintă cu mai mult de 2 mm sau dacă un contact al semnului crucii depășește 2 cm.

Ultima rulare a raportat două atingeri scurte, încă nerezolvate, în testul `intersectii`. Palma dreaptă atinge fusta în cadrele 161 și 197, iar antebrațul drept o atinge în cadrele 69–71, la trecerea de la palmele lipite la brațele încrucișate. La aplecare, fusta rigidă urmează bazinul și se ridică puțin la spate. O fustă cu oase proprii sau cu simulare de pânză este următorul pas.

## Comenzi

Din rădăcina repo-ului, cu Blender 4.5 LTS, Python 3 cu Pillow și FFmpeg:

```bash
npm run build:volum              # model, acțiuni, verificări, GLB, .blend și foi de cadre
blender -b --factory-startup --python-exit-code 1 --python experiments/cleopa-volum/scripts/build_volum.py -- --verifica
npm run build
npm run render:volum -- episod --width 768   # MP4 din Three.js: studio/volum/renders/episod.mp4
```
