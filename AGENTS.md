# Viața Părintelui Cleopa · Școala Evlaviei

Pentru un episod, folosește [skill-ul `facut-episod`](.agents/skills/facut-episod/SKILL.md). Pentru randarea completă a filmului, când `RUNPOD_KEY` e în mediu, folosește [skill-ul `render-runpod`](.agents/skills/render-runpod/SKILL.md). Pentru scenele Blender ale familiei, citește și [instrucțiunile proiectului original](experiments/cleopa-blender/AGENTS.md).

- Pune experimentul și sursele reproductibile în `experiments/<episod>/`. Dă nume stabile personajelor, gesturilor, obiectelor și cadrelor. Refolosește biblioteca înainte să modelezi o variantă nouă.
- Spune povestea cu replici scurte și română firească. Populează fiecare plan cu acțiunea cerută de replică. Verifică orientarea personajelor, traiectoria obiectelor și continuitatea dintre cadre. Folosește culorile calde și siluetele clare ale seriei.
- Pentru decorurile ilustrate din `Micuțul Cleopa`, folosește cadrul 2, „Ograda în zori”, ca referință pentru stil, compoziție și separarea planurilor. Urmează [ghidul de ilustrație](experiments/cleopa-painea/assets/backgrounds/README.md).
- În Blender, pornește cu `bpy` și `--python-exit-code 1`. Verifică umărul, cotul și manșeta în gest și în repaus. Brațul relaxat se oprește clar deasupra genunchiului. Fixează punctele de sprijin și ajustează adâncimea întregului personaj înainte să schimbi adâncimea unei mâini. Motivează în fișier orice suprapunere intenționată.
- Pentru semnul crucii, palma dreaptă merge la frunte, piept, umărul drept și apoi la stângul personajului. Verifică fiecare contact și înclinarea de la final în camera activă.
- Păstrează pista românească și muzica separate la editare. Folosește cheia OpenRouter din mediu. Păstrează filmul curent fără subtitluri. Aplică sigla Școala Evlaviei din `assets/branding/` la preview și la materiale, conform cerinței episodului.
- Înainte de push, rulează `npm test`, `npm run build`, verificările specifice episodului și o redare de probă. Verifică și exportul compact cu `ffprobe`. După deploy, verifică redarea, derularea și formularul în browser. Păstrează cheile și fișierele de feedback în afara Git.
