# Motorul Three.js (`lib/engine/`)

> Blender creează actorii, decorurile și repertoriul de gesturi. JavaScript regizează filmul. Three.js îl animează și îl randează.

Un episod = **GLB-uri reutilizabile** (`assets/`) + **descriptorul** `episodes/<id>/episode.json` + pista
audio. Același cod randează playerul web, cadrele de verificare și MP4-ul.

| modul | rol |
| --- | --- |
| `stage.js` | încarcă episodul, construiește scenele (decor, distribuție, recuzită), evaluează totul în `setTime(t)` |
| `character.js` | instanța unui personaj: FK 2D identic cu Blender, variante, paletă, mâneci și palme |
| `arm25d.js` | brațele 2.5D: IK 3D cu lungimi fixe proiectat pe oasele plate; interpolarea în articulații |
| `palm25d.js` | palma C: proxy-ul 3D al mâinii, proiecția, volumele, ordinea pieselor |
| `hand.js` | palma desenată plat pe nivelurile față de manșetă; tranzițiile pozelor mâinii |
| `sleeve.js` | mâneca dintr-o bucată, cu umărul racordat la bust, cotul rotunjit și curbura manșetei proiectată după înclinarea antebrațului |
| `gestures.js` | biblioteca de gesturi reutilizabile (relative la umăr și la lungimea brațului) |
| `lipsync.js` | gura după anvelopa vocii și textul replicii (ca `voice()` din Blender) |
| `overlays.js` | titluri, bule, sigla (atașate camerei, deci și în MP4) |
| `tracks.js` | interpolări pure (curbă monotonă de gradul cinci, pas, liniar) |
| `checks.js` | verificările pe scena reală |

## Determinism

`stage.setTime(t)` reface starea întregii scene numai din descriptor și din `t`: nu ține nimic de la cadrul
anterior (nici ordinea pieselor palmei, nici tranzițiile mâinii — ele se calculează din momentul ultimei
schimbări de poză). Playerul poate sări oriunde, iar exportul poate randa cadrele pe mai multe procese.
`tools/engine/check.mjs` verifică asta: aceleași imagini în ordine crescătoare și aleatoare.

## Brațele și palmele 2.5D

Ca în episodul Blender ([specificația palmelor](../experiments/cleopa-palme/SPECIFICATIE.md)): fiecare
poză-cheie a brațului (încheietura și direcția degetelor, în spațiul rigului) se rezolvă o dată cu IK 3D;
între poze se interpolează unghiurile umărului, cotului și încheieturii și cât vine fiecare segment spre
cameră. Brațele, capul, deplasarea și tranzițiile palmei folosesc curbe cu accelerare la pornire și
decelerare spre repaus. Curba păstrează viteza prin cheile intermediare când mișcarea continuă în aceeași
direcție și ajunge la viteză zero în repaus sau la schimbarea sensului. La contact, încheietura și vârful degetelor folosesc aceeași soluție IK. Palma C se desenează din proxy-ul
mâinii: piesele sub manșetă sau peste ea, degetul mare peste taler, unghiile numai pe dosul degetelor,
liniile palmei numai pe partea palmei. Mâna la față (semnul crucii, obrazul) și mâinile pe masă trec în
fața capului, respectiv a mesei, cu antebrațul și manșeta (rampa de adâncime a mânecii).

Paritatea cu Blender e testată: `tests/engine-fk.test.mjs`, `engine-arm25d.test.mjs`, `engine-palm25d.test.mjs`
(fixture-uri scrise de `tools/engine/*_fixture.py`, toleranța 1e-6).

În gest liber, direcția degetelor urmează și înclinarea antebrațului spre cameră. La schimbarea pozei,
degetele și rotația palmei trec în 12 cadre din starea atinsă în noua poziție. La un contact se păstrează
orientarea cerută de țintă. Verificarea `palm_turn` măsoară rotația palmei chiar dacă încheietura stă pe loc.

## Gesturile

`lib/engine/gestures.js` — un gest e o succesiune de poze relative la umăr (`in` spre mijlocul corpului,
`up` în sus, ca fracții din lungimea brațului), cu poza mâinii și orientarea palmei. Se potrivește oricărui
personaj. În descriptor: `"do": [{ "gesture": "stop", "side": "R", "at": 1773, "hold": 40 }]`.
Gesturile care pornesc din repaus preiau poziția ținută de braț la sfârșitul gestului precedent.

| gest | ce face |
| --- | --- |
| `stop` | palma ridicată spre cameră („O clipă!”), apoi coboară prin exterior |
| `think` | mâna la barbă, palma spre barbă |
| `pointDown`, `pointUp` | arată în jos (troaca) / în sus (cerul), aproape de corp |
| `amen` | brațul aproape întins pe lângă corp, palma deschisă |
| `offer`, `explain`, `raise` | invitație, explicație, mâna ridicată la vorbă |
| `surprised`, `hungry` | tresărire; mâinile pe burtă |
| `reach` | întinde mâna (spre pâine) |
| `wave` | salut |
| `holdBook`, `tableRest` | ține cartea la piept; palmele pe masă |
| `cross` | semnul crucii (AGENTS.md): frunte, piept, umărul drept, umărul stâng; trei degete împreunate |
| `pray` | mâinile împreunate la piept, capul plecat |
| `nod`, `bow`, `shakeHead`, `laugh` | capul (și fața, la râs) |

Un gest nou: adaugă pozele în `POSES` și secvența în `LIBRARY`, apoi verifică-l pe toate personajele cu
`npm run stills` și `npm run check:engine`.

## Comenzi

```bash
npm run assets                                  # personajele, decorurile și recuzita (Blender, o dată)
npm run stills -- <episod> 1172,1748            # cadre din motor → episodes/<episod>/renders/stills/
npm run check:engine -- <episod>                # verificările (iese cu 1 la probleme nepermise)
npm run compare -- <episod> <film-vechi.mp4>    # foaie comparativă pe planuri (motor | referință)
npm run export:mp4 -- <episod> --jobs 3         # MP4-ul compact (768 × 432, < 5 MB) din același motor
npm run cadru -- <cadre>                        # (vechi) cadre din scena Blender a episodului 1
```

## Limitări rămase

* Mersul e cel din episodul 1 (pași pe loc pe o traiectorie); nu există încă un mers cu pași reali între
  ancore și nici evitarea celorlalți.
* Ordinea pieselor palmei nu are histerezisul din bake-ul Blender (ar cere memorie între cadre); două
  degete aproape la aceeași adâncime pot schimba locul pentru un cadru.
* Desenele de autor ale mâinilor (A) nu mai sunt folosite în pozele ținute; palma C desenează și obrazul.
* În semnul crucii văzut din față, antebrațul trece prin dreptul ochiului drept.
* Verificarea suprapunerilor folosește învelitoarea convexă a desenelor capului (ca Blender), deci
  semnalează și atingeri de păr.
* Pista audio a episodului 1 e mixajul existent; o replică nouă se generează cu `generate_audio.py`.
