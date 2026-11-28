---
name: render-runpod
description: Rulează probe Blender de referință și verificări accelerate pe un GPU RunPod când RUNPOD_KEY este disponibilă.
---

# Probe pe RunPod

Folosește RunPod pentru probe care ar dura peste trei minute local și care pot beneficia de GPU sau de mai multe nuclee. Episoadele se redau în Three.js. Exportul MP4 se face numai la cererea explicită a utilizatorului, cu `npm run export:mp4 -- <episod>`.

Comenzile folosesc `RUNPOD_KEY` (sau `RUNPOD_API_KEY`) din mediu sau din `.env`.

```bash
npm run runpod -- gpus
npm run runpod -- render --to 241 --workers 6 --keep
npm run runpod -- pull /work/repo/experiments/cleopa-painea/renders/frames/frame_0241.png /tmp/frame_0241.png
npm run runpod -- down
npm run runpod -- spend
```

`render` produce cadre PNG ale scenei Blender de referință. `--to` fixează ultimul cadru. Cu `--keep`, podul rămâne pornit ca să poți extrage doar cadrele necesare. Folosește `down` imediat după descărcare, deoarece podul se facturează pe secundă.

Pentru alte verificări, pornește podul cu `up`, încarcă sursele cu `push`, rulează comanda cu `exec`, adu rezultatele cu `pull` și închide podul cu `down`. `status` arată dacă podul mai rulează. Pentru Workbench, verifică în log că `GL renderer` indică NVIDIA. Include în raport timpii de pornire și randare și costul afișat de CLI.
