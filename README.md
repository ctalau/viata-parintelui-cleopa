# Viața Părintelui Cleopa

Atelierul de animație al Școlii Evlaviei. Include episodul **Pâinea care poate să aștepte**, studiul de rugăciune la masă, biblioteca și un exemplu editabil pentru filmele cu monahi.

![Școala Evlaviei](assets/branding/badge-scoala.png)

## Pornire

Cu Node.js 24 și Git instalate, rulează:

```bash
git clone https://github.com/ctalau/viata-parintelui-cleopa.git
cd viata-parintelui-cleopa
bash scripts/setup.sh
npm run preview
```

Deschide [atelierul local](http://127.0.0.1:4173). Filmul se poate descărca și derula la oricare dintre cele zece momente. Formularul salvează observația împreună cu secunda aleasă și ID-ul episodului. În preview-ul local, `npm run feedback:export -- --local` citește notele din `.feedback/`.

Pentru producția de animație, instalează Blender 4.3.2 sau 4.5 LTS, Python 3 cu `venv`, FFmpeg, FFprobe și fonturile DejaVu. `bash scripts/setup.sh --animation` creează mediul virtual cu pachetele Python folosite la export. `source .venv/bin/activate` activează mediul.

## Bibliotecă și producție

| Resursă | Cale |
| --- | --- |
| Episod, montaj, riguri și voci | [`experiments/cleopa-painea/`](experiments/cleopa-painea/) |
| Riguri ale familiei, veselă, casă, scenele de rugăciune și testul semnului crucii | [`experiments/cleopa-blender/`](experiments/cleopa-blender/) |
| Modele de personaje, obiecte și decoruri GLB | [`assets/`](assets/) |
| Constructori `bpy` pentru decoruri, recuzită, rigul călugărilor și clipuri | [`blender/`](blender/) |
| Exemplu 2D interactiv, editabil în JSON | [`videos/001-demo-atelier/video.json`](videos/001-demo-atelier/video.json) |
| Documentația descriptorilor și a motoarelor 2D și 3D | [`docs/`](docs/) |
| Instrucțiuni și skill pentru un episod | [`AGENTS.md`](AGENTS.md) · [facut-episod](.agents/skills/facut-episod/SKILL.md) |

`npm run check:cleopa` rulează smoke testul Blender, verifică rigurile și filmul, inclusiv suprapunerile la fiecare cadru. `npm test` testează motorul și validarea feedbackului. `npm run validate -- videos/<id>` verifică descriptorul, iar `npm run preview:engine` deschide instrumentele motorului. Consultă README-ul episodului pentru refacerea vocii și a muzicii prin OpenRouter și exportul cadrelor.

## Vercel și feedback

Vercel construiește site-ul cu `npm ci` și `npm run build`, publicând `dist/` și funcția `POST /api/feedback`. Importă repo-ul cu ramura de producție `main`, instalează Node.js 24 în setările proiectului și atașează un **Vercel Blob privat** pentru feedback în mediile Production și Preview. Funcția scrie câte un JSON privat în `feedback/`, cu textul, momentul, episodul și data. Exportă-l cu `npm run feedback:export`, cu `BLOB_READ_WRITE_TOKEN` al magazinului setat local. `vercel env pull .env.local` permite apoi `node --env-file=.env.local tools/feedback-export.mjs`.
