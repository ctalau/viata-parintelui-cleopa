# Satul în zori

`sat-in-zori.png` este decorul aprobat pentru primul moment, „sat”. Imaginea a fost derivată din propunerea vizuală cu șase decoruri, cu instrumentul de generare de imagini, folosind primul panou ca referință. Decorul nu conține personaje; Costică rămâne rigul editabil Blender existent, separat de imagine.

Direcția imaginii: un singur cadru panoramic 16:9; sat moldovenesc pe dealurile Botoșanilor la răsărit; copac mare în stânga, casă tradițională cu prispă în dreapta, garduri joase din lemn, bisericuță în depărtare, culori calde și contururi brune de carte ilustrată. Aleea se lărgește spre centrul prim-planului și rămâne liberă pentru băiat. Fără oameni, animale, text sau chenar.

În `build_episode.py`, Costică este așezat la `(0.10, -1.97, 0.19)`, cu scara `0.96`. Poziția fixează picioarele pe alee. Rigul, clipitul și respirația sunt păstrate. Placheta de titlu este ridicată pentru a nu acoperi căciula. Textura este împachetată în fișierul Blender.

Doar prima scenă, cadrele 1–252 (10,5 secunde), folosește acest decor. Pentru exportarea acestei modificări peste filmul existent:

```bash
blender -b scenes/painea_care_poate_sa_astepte.blend -o /cale/opening/frame_ -F PNG -s 1 -e 251 -j 2 -a
python3 scripts/replace_opening.py /cale/film-anterior.mp4 /cale/opening/
```

Exportul păstrează acțiunea ulterioară și copiază pista audio originală fără recodificare. Imaginea video este recodificată pentru a păstra limita de descărcare de 5 MB.
