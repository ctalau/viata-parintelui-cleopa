---
name: facut-episod
description: Produce și verifică un episod animat pentru Viața Părintelui Cleopa, de la textul sursă și storyboard la Blender 2.5D și preview în browser, voce și muzică OpenRouter și export compact.
---

# Producția unui episod

1. **Citește sursa.** Notează paginile cerute, oamenii, locurile, dialogul și firul acțiunii. Uită-te la imaginile de referință și la episodul anterior. Lasă o scurtă fișă a episodului în folderul de lucru.
2. **Scrie momentele.** Pentru fiecare, fixează intenția, pozițiile de start, replica, acțiunea vizibilă și camera. Urmărește dacă personajul ține ceva, dacă mâna folosită este liberă și dacă obiectul rămâne în locul în care a fost pus. Gândește tăietura astfel încât acțiunea să rămână lizibilă.
3. **Construiește scena 2.5D.** Folosește rigurile și scripturile din `experiments/cleopa-blender/` și modelul de episod din `experiments/cleopa-painea/`. Pentru decorurile pictate, urmează cadrul 2, „Ograda în zori”, și păstrează separat personajele, peisajul din spate și elementele care pot acoperi personajele. Folosește [ghidul de ilustrație](../../../experiments/cleopa-painea/assets/backgrounds/README.md). Randează întâi cadrul dificil și 2–3 cadre din gestul principal. Orice randare sau verificare pe cadre care ar dura peste 3 minute local merge pe RunPod (skill-ul `render-runpod`, „Când folosim RunPod”).
4. **Pregătește vocea și muzica.** Folosește `OPENROUTER_API_KEY` în mediu. Verifică modelul și setarea de voce din episodul anterior. Sincronizează audio cu `generate_audio.py` și `prepare_timeline.py`. Ascultă rezultatul, verifică ritmul replicilor și volumul muzicii sub dialog.
5. **Verifică animația.** Rulează `npm run check:cleopa`. Vezi cadre din pregătire, contact și revenire. Verifică mâinile în raport cu manșeta și capetele, profilul umărului, repausul și contactul cu podeaua. Orice suprapunere intenționată primește interval, cameră și explicație. Recitește gesturile după `AGENTS.md`.
6. **Exportă și verifică.** Salvează sursele, fișierul Blender editabil cu resursele împachetate, posterul, o foaie de contact și MP4-ul compact. Pentru filmele Blender, urmează comenzile din README-ul experimentului. `npm run build` și `npm run preview` servesc atelierul la `127.0.0.1:4173`. Testează filmul, derularea la un capitol și trimiterea unei observații. Indică în livrare linkul către film și către sursele din GitHub.
