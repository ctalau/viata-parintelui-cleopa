---
name: render-runpod
description: Randează filmul episodului (desenele Blender + MP4-ul compact + foaia de contact) pe un GPU ieftin RunPod, în ~3 minute în loc de ~30 pe CPU, cu raport de timp și cost. Folosește-l pentru orice randare completă a filmului când RUNPOD_KEY este în mediu, pentru orice altă operație care ar dura peste 3 minute local și se poate accelera pe GPU (randări de probă, foi de cadre, verificări pe cadre randate), și când utilizatorul întreabă de RunPod.
---

# Randarea filmului pe RunPod

Adaptat din `ctalau/lego-shorts` (`/render-runpod`), pentru Blender în locul randării din Chromium.

O singură comandă face tot:

1. alege cel mai ieftin GPU disponibil;
2. pornește un pod;
3. trimite scena `.blend` împachetată, scripturile, sunetul și `timeline.json`;
4. randează desenele cu Workbench pe GPU, în mai multe procese Blender;
5. codează MP4-ul cu `export_episode.py` pe pod;
6. aduce înapoi **doar** MP4-ul și foaia de contact (cadrele PNG au 1,8 GB, prea mult pentru proxy-ul RunPod);
7. **oprește podul**;
8. tipărește timpii și costul.

```bash
npm run runpod -- render --workers 12          # → renders/painea_care_poate_sa_astepte.mp4 + renders/foaie_contact.jpg
npm run runpod -- render --to 241 --workers 12 # probă: doar desenele până la cadrul 241, fără MP4
npm run runpod -- gpus                         # prețurile GPU ≤ --max-price, întâi cele în stoc
npm run runpod -- spend                        # costul fiecărui pod (costs/runpod.jsonl, în afara Git)
```

Are nevoie de `RUNPOD_KEY` (sau `RUNPOD_API_KEY`) în mediu sau în `.env`. Cheia nu intră în Git.

## Înainte de randare

1. Scena e gata: `build_episode.py`, apoi `palme25d_bake.py`, `maneci_bake.py`, apoi `verify_episode.py` (lanțul din README-ul episodului).
2. Fă probe pe ce e greu, local: `randeaza_momente.py`, `zoom_mana.py`. Podul produce aceleași desene ca CPU-ul (măsurat mai jos). Încadrarea și gesturile se repară local, nu pe pod.
3. Randează pe RunPod **o dată**. O reluare costă sub un cent, dar nu se iterează pe pod.
4. După descărcare, verifică MP4-ul cu `ffprobe`: sub 5 MB, 768 × 432, 24 fps, stereo (`export_episode.py` scrie `MEDIA_OK`). Apoi rulează `npm run build` și `npm run check:preview`.

## Când folosim RunPod (regula celor 3 minute)

Orice operație care durează **peste ~3 minute pe CPU-ul containerului** și care se poate accelera pe GPU (sau pe
cele 100+ vCPU ale unei gazde RunPod) rulează pe un pod RunPod când `RUNPOD_KEY` e setată — nu se așteaptă local:

- randarea desenelor (filmul întreg sau un interval mare: `render`, `render --to`);
- foi de cadre / contact și randări de probă cu multe cadre (`randeaza_momente.py`, `zoom_mana.py`, foi pentru review);
- verificările care randează cadre (suprapuneri pe cadre randate, comparații de imagini).

Pentru un pas fără comandă dedicată: `up` → `push` scena și scripturile → `exec "cd /work/repo/... && blender -b ..."`
(mai multe procese Blender pe intervale de cadre) → `pull` doar rezultatele mici → **`down`**. Local rămân pașii scurți
(< 3 min) și cei care nu câștigă nimic pe GPU (`build_episode.py` ~15 s, coacerile Python într-un singur fir:
`palme25d_bake.py` ~3,5 min, `maneci_bake.py` ~6 min, `verify_episode.py` ~6 min — pe pod câștigă doar dacă le împarți
pe intervale de cadre). Notează în raport timpul local estimat și cel pe pod.

## Ce se întâmplă (`tools/runpod.mjs`, `tools/runpod/pod.mjs`, `tools/runpod/agent.mjs`)

| Pas | Cum | Timp tipic |
| --- | --- | --- |
| Alegerea GPU-ului | GPU-uri din cloud community și secure, de cel mult `--max-price` (implicit 0,30 $/h). Întâi cele raportate în stoc, apoi cele mai ieftine. Tesla V100 e exclus. Opțional `--wait N` minute de reîncercări. Un pod facturat peste plafon e oprit imediat. | 2 s |
| Pornirea podului | Imaginea `mcr.microsoft.com/playwright:v1.63.0-noble` (Node pentru agent, Python). Agentul HTTP rulează pe portul 8000, iar fiecare cerere are token. | 20–30 s (3–4 min pe o gazdă fără imagine în cache) |
| Pregătirea | În paralel cu încărcarea: FFmpeg, Python cu Pillow și NumPy, fonturile DejaVu, bibliotecile EGL/GL și Blender 4.5.9. | ~20 s |
| Încărcarea | tar.gz cu scena (32 MB), `scripts`, `audio`, `timeline.json`, `scenariu.json` și `fonts`, în total 53 MB, trimis în bucăți de 2 MB, câte 8 deodată. | ~15 s |
| Randarea | `prepare_timeline.py` (mixajul), N procese `blender -b … -s S -e E -a` pe intervale de desene, apoi `export_episode.py`. | 2 min 03 s pentru 1685 de desene + ~30 s codare |
| Descărcarea și oprirea | MP4 + foaia de contact (6 MB), apoi `DELETE /pods/<id>`. | câteva secunde |

**Măsurat** (27.11.2026, filmul complet, 3370 de cadre pe doi, 1280 × 720): RTX 3070 community la 0,13 $/h, 12 procese Blender.

- pornirea podului: 27 s;
- pregătirea: 20 s;
- desenele: 2 min 03 s;
- desenele și codarea: 2 min 33 s;
- **total: 3 min 20 s, ≈ 0,007 $**.

Pe CPU-ul containerului, aceeași randare durează ~30 min.

Comparat cu MP4-ul randat pe CPU (llvmpipe), diferența medie a fost de ~3/255, la nivelul zgomotului de codare. Sub 0,7 % din pixeli au diferit cu peste 24/255. Desenele sunt aceleași.

## GPU-ul în Blender (ce am învățat)

- Podul are nevoie de `NVIDIA_DRIVER_CAPABILITIES=all` (grafică EGL, nu doar calcul). Tool-ul o setează.
- Comanda tipărește `GL renderer: …` după o randare Workbench de probă. Trebuie să apară `NVIDIA …`. Dacă apare `llvmpipe`, randarea rulează pe CPU.
- `gpu.platform.renderer_get()` nu răspunde în `blender -b` până nu se randează ceva. De aceea proba randează un cadru de 32 × 32.
- Workbench pe GPU e rapid. Restul timpului îl iau scrierea PNG-urilor și pornirea fiecărui proces Blender, deci mai multe procese ajută (gazdele au 100+ vCPU). Cu 12 procese: ~14 desene/s.

## Control manual

```bash
npm run runpod -- up                       # pornește un pod și așteaptă pregătirea (.runpod/pod.json, în afara Git)
npm run runpod -- push experiments/cleopa-painea/scenes/painea_care_poate_sa_astepte.blend
npm run runpod -- exec "nvidia-smi; cd /work/repo && ls"
npm run runpod -- pull /work/repo/<fișier> /tmp/<fișier>
npm run runpod -- status
npm run runpod -- down                     # oprește-l ÎNTOTDEAUNA la final: se facturează pe secundă
```

Opțiunile lui `render`:

- `--workers N` (implicit 6) și `--to CADRU` (probă, fără MP4);
- `--keep` (nu opri podul);
- `--gpu-types "NVIDIA GeForce RTX 3070,NVIDIA RTX A4000"`, `--max-price 0.3`, `--cloud community|secure|all`, `--wait N`;
- `--episode`, `--scene` (alt episod sau altă scenă).

## Reguli

- Fii econom: GPU-ul cel mai ieftin, fără volum de rețea, disc de 30 GB, podul oprit imediat după randare. Agentul se oprește singur după 20 de minute fără cereri.
- Dacă tool-ul se blochează, rulează `npm run runpod -- status` sau `down`. Caută poduri uitate cu `curl -H "Authorization: Bearer $RUNPOD_KEY" https://api.runpod.io/v2/pods`.
- Fiecare cerere către pod are un timeout, pentru că o cerere prin proxy-ul RunPod poate rămâne agățată.
- Raportează la final timpul de pornire, de pregătire și de randare și costul din „RunPod report”.
- Cheia, `.runpod/` și `costs/` rămân în afara Git. Cadrele PNG (`renders/frames/`) la fel.
