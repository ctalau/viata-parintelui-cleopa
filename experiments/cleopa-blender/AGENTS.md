# Cleopa Animation — handoff pentru Codex

## 1. Misiune

Construiește în Blender o scenă 2D cut-out editabilă în care micul Constantin Ilie (viitorul Părinte Cleopa), tatăl, mama, doi frați mai mari și preotul satului se roagă înainte de masă și își fac semnul crucii în tradiția ortodoxă. Creează rig-uri reutilizabile pentru episoade ulterioare. Nu livra doar un storyboard, GIF generat sau un video care mimează animația prin panoramarea unei imagini statice.

Scena este o dramatizare artistică, nu o reconstrucție documentară a familiei reale. Numărul de frați din cadru, trăsăturile adulților și prezența preotului sunt alegeri de regie. Nu atribui dialoguri biografice neverificate. Cleopa trebuie să fie blond, cu ochi albaștri, conform cerinței utilizatorului.

## 2. Referințe locale și direcție artistică

| Fișier | Rol |
|---|---|
| `references/01_family_character_sheet.png` | Referința principală: identitatea tuturor celor șase personaje și compoziția mesei. |
| `references/02_cleopa_design.png` | Culorile, chipul și vestimentația copilului. |
| `references/03_rig_concept.png` | Concept de separare în piese, schelet și expresii. Nu este un rig funcțional. |
| `references/04_prayer_storyboard.png` | Atmosferă și intenție de mișcare; nu copia erorile anatomice sau ordinea gesturilor. |
| `references/05_simplified_style.png` | Direcție grafică mai plată; poate omite un frate, deci nu o folosi pentru numărul personajelor. |

Stil: cartoon 2D de familie, forme geometrice rotunjite, capete mari, siluete distincte, contururi curate, culori plate și maximum un strat discret de umbră. Păr în mase compacte; broderii reduse la motive simple; fără texturi fine, degete individuale articulate sau stofe simulate. Sat moldovenesc de început de secol XX, interior cald, lemn, icoană, candelă, fereastră, masă cu pâine și străchini. Nu copia personaje sau logo-uri PAW Patrol; urmărește doar principiul simplificării.

Personaje: `cleopa` (cel mai mic, blond, ochi albaștri); `father` (mustăcios, brunet, vestă); `mother` (batic, păr brunet, fustă tradițională); `brother_01` (brunet, mai înalt); `brother_02` (castaniu, puțin mai înalt); `priest` (barbă căruntă, reverendă închisă, cruce la gât). Diferențiază frații prin siluetă și culoare. Păstrează paleta și proporțiile între cadre.

## 3. Mediu și automatizare

Țintă: Blender 4.5 LTS sau o versiune stabilă compatibilă deja instalată. Verifică versiunea reală (`blender --version`), calea binarului, FFmpeg și spațiul disponibil. Blender este gratuit; nu este nevoie de Moho, pluginuri comerciale, servicii cloud sau modele 3D plătite.

**Strategie principală: Python `bpy` + Blender headless**, cu surse versionabile și build repetabil. MCP este opțional, util pentru inspecție interactivă, nu o dependență pentru rigging și randare. Nu încerca `import bpy` în Python de sistem: rulează scripturile în Blender. Din rădăcina proiectului:

```bash
blender -b --factory-startup --python-exit-code 1 --python scripts/smoke_test.py
blender -b --factory-startup --python-exit-code 1 --python scripts/build_scene.py
```

Primul script este inclus și testează armature, keyframes, salvare și randarea unui cadru; al doilea trebuie implementat de Codex. Pe Windows, folosește calea completă către `blender.exe` dacă nu este în PATH. Nu rula factory-startup în sesiunea interactivă cu documente nesalvate.

Documentație oficială: https://docs.blender.org/api/current/ și https://docs.blender.org/manual/en/latest/advanced/command_line/render.html . Pentru API-uri schimbate între versiuni (Actions, Eevee, Grease Pencil, SVG import), consultă documentația versiunii instalate. Nu accesa F-curves prin presupuneri despre layout-ul Actions; preferă `keyframe_insert` și API-ul corespunzător versiunii.

### MCP opțional

Proiect comunitar: https://github.com/ahujasid/mcp-for-blender . Verifică README și codul înainte de instalare. La data redactării, proiectul indică noul pachet `mcp-for-blender` (vechiul nume `blender-mcp` rămâne compatibil). Dacă utilizatorul aprobă instalarea și are `uvx`, instrucțiunile curente includ:

```bash
codex mcp add blender -- uvx mcp-for-blender
uvx mcp-for-blender install-addon
```

Activează add-on-ul în Blender Preferences, verifică serverul în sidebar-ul N și conexiunea în Codex după repornire. Nu presupune numele instrumentelor MCP; inspectează lista reală. Restricționează conexiunea la localhost, nu activa servicii externe de generare/descărcare de modele. Nu instala sau modifica setări globale fără aprobare. Dacă MCP nu funcționează, continuă cu CLI și `bpy`. Dacă lipsește Blender, implementează sursele și raportează exact ce rămâne netestat. Nu inventa un `.blend` sau o randare.

## 4. Structura proiectului

```text
AGENTS.md
README.md
references/                      # referințe read-only
scripts/smoke_test.py            # inclus; test minimal, nu scena finală
scripts/build_scene.py           # de implementat; orchestrare
scripts/build_characters.py
scripts/build_rigs.py
scripts/build_environment.py
scripts/animate_prayer.py
assets/characters/{id}/          # SVG sursă, manifest, .blend reutilizabil
assets/backgrounds/
assets/props/
assets/audio/
animations/timing.json           # inclus; repere inițiale
scenes/prayer_at_table.blend
renders/frames/frame_0001.png
renders/prayer_at_table.mp4
renders/prayer_at_table.gif
STATUS.md
```

Păstrează referințele nemodificate; căi relative, nume ASCII, ID-uri stabile. Fiecare build pornește de la un fișier gol sau curăță numai colecțiile generate, fără să distrugă fișierele utilizatorului. Salvează proiecte incrementale, împachetează eventualele imagini cu `bpy.ops.file.pack_all()` și verifică redeschiderea fișierului într-un proces nou.

## 5. Construirea personajelor și rig-urilor în Blender

### Arhitectura recomandată: 2D cut-out în spațiu 3D (2.5D)

Alege forme vectoriale construite ca obiecte `CURVE` cu umplere sau mesh-uri plate cu materiale emission; nu este necesar să modelezi personaje 3D volumetrice. Folosește forme Bezier/poligoane generate prin cod; SVG este opțional ca sursă editabilă. Camera ortografică privește planul XY din +Z; X este orizontal, Y vertical, Z controlează adâncimea/ordinea. Configurează o scenă de aproximativ 16 x 9 unități, camera la (0,0,20) cu rotație (0,0,0), `ortho_scale=16`, rezoluție 1920x1080. Menține setarea orizontală a camerei și verifică încadrarea efectivă. Personajele sunt construite în coordonate locale cu bazinul la origine. Folosește o singură convenție globală; nu amesteca planuri XY și XZ.

Materiale emission pentru culori plate, contururi desenate ca forme sau curbe separate, view transform Standard dacă disponibil, Eevee sau alt motor verificat. Controlează Z pentru evitarea z-fighting și a intersecțiilor. Fiecare contur trebuie să urmeze piesa sa. Mâna dreaptă trebuie să poată trece în fața feței/trunchiului; masa este în fața trunchiului inferior, dar nu trebuie să acopere gesturile. Nu face animație prin deformarea unei imagini aplatizate; redesenează părțile ascunse. Grease Pencil este alternativă doar dacă agentul verifică API-ul versiunii instalate; nu este cerut.

Pentru fiecare personaj, creează colecție `CHAR_<id>` cu armature `RIG_<id>`, control root și obiecte vizuale independente:

```text
pelvis, torso, neck, face, ears, hair_back, hair_front
brow.L, brow.R, eye.L, eye.R, mouth
upper_arm.R, forearm.R, hand.R
upper_arm.L, forearm.L, hand.L
thigh.R, shin.R, foot.R, thigh.L, shin.L, foot.L
clothing_overlays, beard_or_moustache, headscarf
```

Desenează toate componentele în poziție neutră, cu suprapuneri la umăr, cot și încheietură; mânecile ascund îmbinările. Pentru fiecare membru, originea/pivotul să fie la articulație. Seturi de mâini: `rest`, `open`, `prayer`, `cross_fingers`; ultima arată degetul mare, arătătorul și mijlociul unite, celelalte două pliate. Ochi: open, half, closed; gură: rest, A, E_I, O_U, M_B_P, F_V, L, smile. Pentru față, folosește obiecte alternative cu vizibilitate keyframed (CONSTANT pentru switch-uri) sau shape keys pe mesh cu topologie comună. Pentru vizibilitate setează și testează atât `hide_render` cât și `hide_viewport` ori un mecanism echivalent verificat; nu ascunde colecția rig-ului. Barba/baticul urmează capul. Nu oglindi automat mâna care face cruce.

### Schelet și controale

```text
root
  pelvis
    spine -> chest -> neck -> head
    thigh.R -> shin.R -> foot.R
    thigh.L -> shin.L -> foot.L
  [descendenți ai chest]
    upper_arm.R -> forearm.R -> hand.R
    upper_arm.L -> forearm.L -> hand.L
  ctrl_hand_ik.R / ctrl_hand_ik.L
  ctrl_elbow_pole.R / ctrl_elbow_pole.L
```

Construiește `Armature` cu `edit_bones.new`, head/tail în planul XY și parent ierarhic. Intră/ieși corect din Edit Mode; preferă API de date unde nu e nevoie de operatori. Nume `.R/.L` sunt anatomice: R apare în stânga ecranului în vederea frontală. Controlează fiecare rig prin propriile acțiuni sau NLA; nu partaja accidental Action activă între personaje.

Pentru piese rigide, bone-parent (`parent_type='BONE'`, `parent_bone=...`) păstrând transformarea world la atașare și verificând rest pose. Pentru mâneci flexibile, mesh cu Armature modifier și vertex groups explicite, nu dublu parenting deformant. Folosește IK pe antebraț cu chain_count=2; target este controlul încheieturii, pole target/angle calibrate per rig. Țintele/pole nu sunt copii ai lanțului controlat. Limitează mișcarea în plan și testează cotul, încheietura și reach. Dacă IK produce flips, implementează un solver analitic plan 2-bone: calculează cotul din distanță și lungimi, alege ramura consistentă, limitează ținta la reach, transformă coordonatele în spațiul armaturii; folosește FK keyframed în loc de IK pe același lanț. Nu amesteca două metode active simultan. Cheile de transformare se adaugă prin `pose_bone.keyframe_insert(data_path='rotation_euler', frame=...)` sau controalele IK; verifică modurile de rotație și unitățile.

Creează o probă pentru Cleopa în rest pose și la toate cele patru contacte. Pentru fiecare personaj definește repere locale `forehead`, `chest`, `shoulder_R`, `shoulder_L`, `hand_rest` și distanța palmă–vârf degete. Evaluează world transforms după `scene.frame_set` și depsgraph update; calculează poziția vârfului degetelor la contact. Ajustează țintele individual, inclusiv la schimbarea poziției capului. Nu folosi coordonate absolute identice la toți.

Salvează acțiuni `idle_breathe`, `blink`, `head_bow`, `pray_speech`, `cross_orthodox_R`, `sit_idle`; NLA numai dacă layering-ul canalelor nu generează conflicte. Dacă versiunea Blender folosește Action slots, respectă API-ul real. Picioarele sunt ascunse la masă; prioritizează rig superior complet funcțional la toate șase, apoi rig complet al lui Cleopa pentru reutilizare și restul dacă timpul permite. Marchează orice rig inferior nefinalizat.

## 6. Regia scenei

Cadru fix, 1920×1080, 24 fps, durată țintă 30 s (720 cadre, 1–720). Camera frontală ușor 3/4. Ordine pe ecran, stânga-dreapta: tata, frate 1, frate 2, Cleopa, mama, preotul. Ajustează pozițiile ca toate cele șase chipuri și mâinile drepte să fie vizibile. Așezați la masă, se liniștesc și se îndreaptă ușor; dacă picioarele sunt ascunse nu simula ridicări inutile. Masa și vasele sunt layere independente de personaje; masca frontală acoperă trunchiul inferior, nu mâinile în timpul crucii. Preotul participă; tatăl sau preotul conduce rugăciunea, ceilalți o rostesc discret ori ascultă și spun Amin. Nu adăuga cameră în mișcare în MVP.

### Semnul crucii — cerință obligatorie

Mâna **dreaptă a fiecărui personaj**, nu dreapta ecranului: frunte -> piept/abdomenul superior -> umărul drept propriu -> umărul stâng propriu -> mâna coboară. Pentru un personaj frontal, umărul drept apare în stânga imaginii. Menține sensul corect și pentru vederea 3/4. Mâna stângă rămâne jos, relaxată. Nu folosi palmele lipite ca gest implicit; poți menține mâinile discret împreunate sau relaxate în timpul rugăciunii. Nu lăsa mâna să traverseze interiorul feței sau al trunchiului; folosește ordinea layerelor și traseu arcuit natural. Nu copia storyboard-ul literal dacă gestul este greșit.

Repere IK relative la anatomia personajului: centru frunte, stern/abdomen superior, umărul R, umărul L. Poziționează ținta ținând cont de distanța încheietură–vârful degetelor. Verifică vizual fiecare contact. Easing la plecare/sosire, mici pauze în poziții, arcuri de mișcare, fără teleportare sau cot inversat. Decalaje discrete de 2–5 cadre între membrii familiei, fără a schimba ordinea gestului. Cleopa poate urmări tatăl cu o mică întârziere. Nu utiliza un singur rig instanțiat care sincronizează forțat keyframes pentru toți.

### Timing inițial

| Cadre la 24 fps (inclusive) | Acțiune |
|---|---|
| 1–24 | Priviri, liniștire, respirație. |
| 25–44 | Prima cruce: ridică mâna dreaptă și atinge fruntea. |
| 45–60 | Piept. |
| 61–76 | Umărul drept. |
| 77–92 | Umărul stâng. |
| 93–120 | Mâna coboară, privire smerită. |
| 121–576 | Rugăciune, clipit natural, respirație, vorbire/lip-sync discret. |
| 577–600 | Amin, scurtă pauză. |
| 601–620 | A doua cruce: frunte. |
| 621–636 | Piept. |
| 637–652 | Umărul drept. |
| 653–668 | Umărul stâng. |
| 669–720 | Mâna coboară, priviri și revenire naturală. |

Durata este provizorie. Dacă înregistrarea audio diferă, ajustează durata rugăciunii și mută blocul final păstrând mișcările lizibile. Evită mișcarea identică sincronizată a tuturor gurilor. Folosește chei intermediare doar când este necesar; lasă interpolarea să creeze mișcarea fluidă, nu schimbări discrete pentru întregul corp.

## 7. Audio și lip-sync

Text de lucru (variantă scurtă, în română; nu pretinde că este formula istorică a familiei): «Tatăl nostru, Care ești în ceruri, sfințească-se numele Tău; vie împărăția Ta; facă-se voia Ta, precum în cer, așa și pe pământ. Pâinea noastră cea de toate zilele dă-ne-o nouă astăzi. Și ne iartă nouă greșelile noastre, precum și noi iertăm greșiților noștri. Și nu ne duce pe noi în ispită, ci ne izbăvește de cel rău. Amin.»

Folosește o înregistrare furnizată sau autorizată; fără clonarea vocii unui om real. Dacă audio nu există, livrează previzualizare mută cu timing provizoriu, fișier text al rugăciunii și instrucțiuni pentru sincronizare; nu pretinde lip-sync final. Exportă WAV 48 kHz dacă este disponibil. Mapare viseme din audio sau manuală, bazată pe foneme. GIF-ul este mut prin definiție; MP4 poate include audio. Rugăciunea completă poate depăși intervalul provizoriu: nu accelera nefiresc.

## 8. Plan de execuție autonom

1. Inspectează toate imaginile locale și verifică mediul. Scrie `STATUS.md` cu capabilități și blocaje. Rulează scripts/smoke_test.py și testează MCP numai dacă este disponibil.
2. Construiește Cleopa în piese vectoriale și rig complet. Randează neutral, ochi închiși, mâna pe fiecare dintre cele patru repere ale crucii. Corectează goluri, deformări și sensul gestului.
3. Creează acțiunile reutilizabile. Randează un test de 4–5 s al crucii lui Cleopa și inspectează cadrele, nu doar logul de succes.
4. Adaptează rig-ul la frați și adulți, cu propriile lungimi de oase, artă și constrângeri. Nu reutiliza coordonate absolute ale copilului pentru adult.
5. Construiește decorul pe layere, pune toate personajele la masă, ajustează scara și ocluziunea. Testează siluetele și toate mâinile.
6. Animează scena completă, sincronizează audio dacă există. Randează draft, contact sheet și versiune finală. Verifică rezultatele vizual; repară defectele înainte de export.
7. Salvează fișierele editabile, sursele, scripturile, acțiunile și documentează ce a rămas manual. Nu opri execuția după simpla elaborare a planului dacă mediul permite implementarea.

## 9. Export

Configurează `scene.render.fps=24`, `fps_base=1`, `frame_start=1`, `frame_end=720` (sau durata revizuită), PNG, `resolution_percentage=100`. Pentru draft folosește 50% rezoluție și cadre selectate. Din rădăcină:

```bash
blender -b scenes/prayer_at_table.blend -o //../renders/frames/frame_#### -F PNG -f 44
blender -b scenes/prayer_at_table.blend -o //../renders/frames/frame_#### -F PNG -a
```

`//` este relativ la fișierul .blend. Creează directoarele înainte; `-f`/`-a` trebuie să fie ultimele argumente. Pentru contact sheet, generează imagini la cadrele 1,44,60,76,92,120,240,576,620,636,652,668,720 și inspectează-le. Pentru fiecare personaj, inspectează și cadrele decalate de contact. Salvează testul scurt al lui Cleopa separat de scena finală.

Blender: randează PNG-uri numerotate consecutiv de la 1, la 24 fps, `renders/frames/frame_0001.png` etc. Verifică numărul de cadre și că toate au aceeași rezoluție. Exemple FFmpeg (adaptează la numele reale; nu presupune că binarul este instalat):

```bash
ffmpeg -framerate 24 -start_number 1 -i renders/frames/frame_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 18 renders/prayer_at_table.mp4
ffmpeg -i renders/prayer_at_table.mp4 -vf "fps=12,scale=720:-1:flags=lanczos,palettegen" renders/palette.png
ffmpeg -i renders/prayer_at_table.mp4 -i renders/palette.png -lavfi "fps=12,scale=720:-1:flags=lanczos[x];[x][1:v]paletteuse" -loop 0 renders/prayer_at_table.gif
```

Pentru audio disponibil, înlocuiește prima comandă cu una care adaugă WAV ca intrare, mapează video/audio, codifică AAC și verifică duratele. Nu tăia rugăciunea prin `-shortest` fără verificare. GIF preview poate fi o versiune scurtă (doar semnul crucii) în plus față de scena completă, cu nume distinct.

## 10. Criterii de acceptanță

- [ ] Toate cele 6 personaje sunt vizibile și recognoscibile; Cleopa este blond cu ochi albaștri.
- [ ] Stil curat, simplu, stabil; nu apar personaje noi sau variații ale hainelor între cadre.
- [ ] Rig-uri cu oase și piese editabile; acțiunile de cruce și respirație sunt reutilizabile.
- [ ] Fiecare execută crucea cu mâna dreaptă: frunte, piept, umărul drept, umărul stâng; verifică în cadre separate.
- [ ] Nu există goluri la articulații, mâini suplimentare, membre inversate sau intersecții evidente cu masa și vasele.
- [ ] Clipitul, respirația, pauzele și diferențele mici de timing sunt naturale.
- [ ] Lip-sync verificat dacă există audio; altfel limitarea este menționată explicit.
- [ ] Proiectul `.blend` se redeschide în versiunea țintă și nu are assets lipsă (numai dacă mediul permite testul real).
- [ ] MP4 și GIF se redau; rezoluția, fps, durata și numărul de cadre sunt confirmate.
- [ ] `STATUS.md` conține comenzile folosite, fișierele create, testele, rezultatele, limitările și pașii rămași; nu declara un test trecut fără să-l fi executat.

## 11. Instrucțiune de start pentru Codex

Citește integral acest AGENTS.md și inspectează `references/`. Verifică întâi Blender CLI și bpy; MCP este opțional. Execută fazele de mai sus în ordine; pornește cu Cleopa și un test scurt al crucii, apoi finalizează scena cu familia. Creează efectiv sursele, rig-urile, keyframes și exporturile pe care mediul le permite. Lucrează incremental, inspectează renderurile, corectează problemele și consemnează orice blocaj. Prioritizează fișiere editabile și o animație coerentă în locul unui video aplatizat. Nu solicita decizii artistice minore; folosește valorile implicite documentate aici. Solicită acord numai când este necesar pentru instalare, privilegii, costuri sau alte acțiuni externe sensibile.
