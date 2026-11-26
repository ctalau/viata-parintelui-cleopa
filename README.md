# Viața Părintelui Cleopa

Atelierul de animație al Școlii Evlaviei. Include episodul **Pâinea care poate să aștepte**, studiul de rugăciune la masă, biblioteca de riguri și inspectorul de scenă pentru animația 2.5D.

[Deschide atelierul public](https://viata-parintelui-cleopa-seven.vercel.app).

![Școala Evlaviei](assets/branding/badge-scoala.png)

## Pornire

Cu Node.js 24 și Git instalate, rulează:

```bash
git clone https://github.com/ctalau/viata-parintelui-cleopa.git
cd viata-parintelui-cleopa
bash scripts/setup.sh
npm run preview
```

Deschide [atelierul local](http://127.0.0.1:4173). Filmul se poate descărca și derula la orice capitol, de la satul în zori până la rugăciunea în familie. Playerul JavaScript are steag, bară de redare și salturi de ±5 s și ±0,5 s. Steagul pune pauză și preia momentul pentru formular. Formularul salvează observația împreună cu secunda aleasă și ID-ul episodului. În preview-ul local, `npm run feedback:export -- --local` citește notele din `.feedback/`.

Pentru producția de animație, instalează Blender 4.3.2 sau 4.5 LTS, Python 3 cu `venv`, FFmpeg, FFprobe și fonturile DejaVu. `bash scripts/setup.sh --animation` creează mediul virtual cu pachetele Python folosite la export. `source .venv/bin/activate` activează mediul. Pentru verificarea site-ului, folosește Chromium instalat prin `npx playwright install chromium` sau setează `CHROMIUM_BIN` la calea executabilului existent.

## Bibliotecă și producție

| Resursă | Cale |
| --- | --- |
| Episod, montaj, riguri și voci | [`experiments/cleopa-painea/`](experiments/cleopa-painea/) |
| Riguri ale familiei, veselă, casă, scenele de rugăciune și testul semnului crucii | [`experiments/cleopa-blender/`](experiments/cleopa-blender/) |
| Inspector de scenă pentru mobil | [Inspectorul public](https://viata-parintelui-cleopa-seven.vercel.app/inspectie/) |
| Instrucțiuni și skill pentru un episod | [`AGENTS.md`](AGENTS.md) · [facut-episod](.agents/skills/facut-episod/SKILL.md) |

`npm run check:cleopa` rulează smoke testul Blender, verifică rigurile și filmul, inclusiv suprapunerile la fiecare cadru. `npm test` testează validarea feedbackului. Cu preview-ul pornit, `npm run check:preview` verifică în Chromium redarea, capitolele, formularul, biblioteca, afișarea pe mobil și inspectorul de scenă. Poți da o adresă Vercel ca argument. Adaugă `--write-feedback` pentru a testa și salvarea, cu o observație etichetată ca test. Consultă README-ul episodului pentru refacerea vocii și a muzicii prin OpenRouter și exportul cadrelor.

## Inspectorul de scenă

Inspectorul urmărește planul „Încă puțin”. Redă fragmentul din film cu oasele proiectate prin camera Blender și cu grila evaluată a mânecii drepte. Modul Straturi izolează decorul, masa, pâinea, personajele și aburul într-un cadru ales din același plan. Datele JSON și imaginile WebP generate sunt versionate în `studio/inspectie/`, astfel încât buildul Vercel să ruleze cu Node.js.

După o modificare a scenei, regenerează datele și imaginile din rădăcina repo-ului.

```bash
blender -b experiments/cleopa-painea/scenes/painea_care_poate_sa_astepte.blend --python-exit-code 1 --python experiments/cleopa-painea/scripts/export_inspector.py
npm run build
```

## Vercel și feedback

Vercel construiește site-ul cu `npm ci` și `npm run build`, publicând `dist/` și funcția `POST /api/feedback`. Proiectul Vercel este conectat la acest repo, cu ramura de producție `main` și un **Vercel Blob privat** atașat pentru Production și Preview. Pentru o copie a proiectului, setează Node.js 24 și atașează un Blob privat înainte de primul deploy. Funcția scrie câte un JSON privat în `feedback/`, cu textul, momentul, episodul și data. Exportă-l cu `npm run feedback:export`, cu `BLOB_READ_WRITE_TOKEN` al magazinului setat local. `vercel env pull .env.local` permite apoi `node --env-file=.env.local tools/feedback-export.mjs`.
