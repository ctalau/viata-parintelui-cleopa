# Ghid de ilustrație · Micuțul Cleopa

Cadrul 2, „Ograda în zori”, este referința pentru decorurile ilustrate ale episodului. Continuă aspectul de carte ilustrată din primul cadru și arată cum se combină decorul pictat cu personajele și recuzita animate.

## Stilul desenului

- Păstrează aspectul 2D de carte ilustrată. În prim-plan, folosește contururi brune și tușe vizibile în fibra lemnului, în șindrila acoperișului, pe pământ și în frunziș. În depărtare, simplifică formele și domolește contrastul pentru a lăsa lumina și dealurile să dea adâncime cadrului.
- Desenează personajele cu siluete clare, contururi brune mai fine, pete de culoare curate și umbre discrete. În cadrul 2, accentele luminoase de pe penele cocoșului și spinarea purcelușului urmează lumina răsăritului. Umbra scurtă de la sol leagă purcelușul și troaca de pământ. Detaliul mai bogat al decorului lasă ochii, ciocul și râtul ușor de citit în mișcare.

## Paleta cadrului 2

Mostrele provin din cadrul 291 al cronologiei Blender, în jurul secundei 12,1 din episod. Folosește-le ca repere de lumină și contrast și adaptează nuanțele la ora zilei și la interiorul sau exteriorul scenei. [Vezi cadrul în atelier](https://viata-parintelui-cleopa-seven.vercel.app/#cadru-2).

| Element | Nuanțe orientative |
| --- | --- |
| Lumina răsăritului | Galben unt `#FDF2AD` și auriu `#FDD76E` |
| Nori | Piersică `#FDD7B5` și roz cald `#F8CAC7` |
| Cer și dealuri | Albastru de cer `#A4CAF6` și albastru de deal `#77A2E6` |
| Vegetație | Verde gălbui `#C8BB38` și verde măsliniu `#99A548` |
| Pământ și lemn | Ocru portocaliu `#F19454`, ocru ars `#A15525` și brun închis `#834729` |
| Animale | Roz cald pentru Grăsuțu `#F3B39C` și auriu pentru cocoș `#EDB35D` |

## Compoziție

- Compune în format 16:9 și păstrează direcția luminii în decor, personaje și recuzită. În ograda moldovenească, eșalonează magazia, gardul, vegetația și dealurile în adâncime.
- Lasă spațiu pentru acțiunea principală și separă siluetele de zonele aglomerate ale decorului. În cadrul 2, cocoșul se profilează pe cer și își sprijină picioarele pe scândura de sus. Grăsuțu și troaca împart același plan al solului, iar marginea troacei lasă vizibile râtul și căscatul.
- Păstrează personajele și recuzita de joc ca obiecte Blender editabile. Așază decorurile în straturi când un personaj trebuie să poată trece printre ele. Verifică în camera activă contactul cu gardul sau solul, spațiul din jurul siluetelor și ordinea suprapunerilor.

## Satul în zori · Cadrul 1

`sat-in-zori.png` este decorul aprobat pentru primul moment, „sat”. Imaginea a fost derivată din propunerea vizuală cu șase decoruri, cu instrumentul de generare de imagini, folosind primul panou ca referință. Decorul nu conține personaje; Costică rămâne rigul editabil Blender existent, separat de imagine.

Direcția imaginii: un singur cadru panoramic 16:9; sat moldovenesc pe dealurile Botoșanilor la răsărit; copac mare în stânga, casă tradițională cu prispă în dreapta, garduri joase din lemn, bisericuță în depărtare, culori calde și contururi brune de carte ilustrată. Aleea se lărgește spre centrul prim-planului și rămâne liberă pentru băiat. Fără oameni, animale, text sau chenar.

În `build_episode.py`, Costică este așezat la `(0.10, -1.97, 0.19)`, cu scara `0.96`. Poziția fixează picioarele pe alee. Rigul, clipitul și respirația sunt păstrate. Placheta de titlu este ridicată pentru a nu acoperi căciula. Textura este împachetată în fișierul Blender.

Doar prima scenă, cadrele 1–252 (10,5 secunde), folosește acest decor. Pentru exportarea acestei modificări peste filmul existent:

```bash
blender -b scenes/painea_care_poate_sa_astepte.blend -o /cale/opening/frame_ -F PNG -s 1 -e 251 -j 2 -a
python3 scripts/replace_opening.py /cale/film-anterior.mp4 /cale/opening/
```

Exportul păstrează acțiunea ulterioară și copiază pista audio originală fără recodificare. Imaginea video este recodificată pentru a păstra limita de descărcare de 5 MB.

## Ograda în zori · Cadrul 2

- [Ilustrația completă](ograda-in-zori.png) fixează compoziția, paleta și lumina.
- [Peisajul și vegetația](ograda-peisaj.png) formează stratul opac din spate. Pictează și zonele pe care gardul le acoperă, ca peisajul să rămână continuu când deplasezi un strat.
- [Gardul și magazia](ograda-gard-magazie.png) formează stratul din față. Lemnul și clădirea sunt opace, iar golurile dintre scânduri și exteriorul contururilor sunt transparente. [Contururile SVG](ograda-gard-magazie.svg) decupează aceleași forme în geometria Blender.

Păstrează aceeași pânză, origine, scară și hartă UV pentru cele două straturi și pentru contururi. Fișierele-sursă ale ograzii au 1672 × 941 px. Pentru atelier, randează straturile la 1280 × 720 din aceeași cameră și la același cadru.

În colecția ograzii, peisajul are adâncimea locală Z de `-7`, iar gardul și magazia de `-3.2`. Proba cu tata la `-4.2` permite verificarea porțiunilor vizibile între scânduri și a celor acoperite de lemn. Pentru a exporta straturile atelierului sau a salva proba editabilă, rulează din directorul episodului.

```bash
blender -b scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 --python scripts/export_yard_layers.py
blender -b scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 --python scripts/preview_yard_depth.py -- /cale/tata-dincolo-de-gard.png
```

Comanda de export scrie imaginile în `renders/ograda-straturi/`. În [atelierul public](https://viata-parintelui-cleopa-seven.vercel.app/#cadru-2), sub player, **Editează straturile cadrului 2** deschide previzualizarea. Poți afișa, deplasa, reseta și descărca cele două straturi ale decorului. Ajustările se păstrează în browserul folosit.

Pentru a actualiza numai planul cu cocoșul și purcelușul în film, randează cadrele impare 253–419. Montajul înlocuiește cadrele 253–420 și copiază coloana sonoră din filmul anterior.

```bash
mkdir -p /cale/ograda
blender -b scenes/painea_care_poate_sa_astepte.blend -o /cale/ograda/frame_ -F PNG -s 253 -e 419 -j 2 -a
python3 scripts/replace_opening.py /cale/film-anterior.mp4 /cale/ograda/ --shot 2
```
