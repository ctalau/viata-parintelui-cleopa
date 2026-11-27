"""Momentele Mamei din HANDOFF §3, cu câte trei desene: pregătire, contact, revenire.

Cadrele se calculează din `timeline.json` cu aceleași formule ca `build_episode.py`
și sunt rotunjite la desenele randate (cadre impare, animație pe doi).
Faza 2 adaugă momentele lui Costică, Mihai și Tata.
"""
from pathlib import Path
import json

EPISODE = Path(__file__).resolve().parents[2]/"cleopa-painea"
TIMING = json.loads((EPISODE/"timeline.json").read_text())
BEATS = {beat["id"]: beat for beat in TIMING["beats"]}


def beat_frame(id_, fraction):
    beat = BEATS[id_]
    return round(beat["start"]+fraction*(beat["end"]-beat["start"]-1))


def drawn(frame):
    return frame if frame % 2 else frame+1


def moments():
    begin = BEATS["cuptor"]["start"]
    settle = beat_frame("cuptor", .78)
    invite = BEATS["traista"]["cues"][0]
    lesson = BEATS["porcul-si-omul"]["cues"][0]
    ask = BEATS["un-ceas"]["cues"][0]
    joke = BEATS["amin"]["cues"][0]
    reaction, laugh = lesson["end"]+3, joke["end"]+2
    prayer = BEATS["la-icoane"]["start"]
    defense = BEATS["grasutu"]["cues"][0]
    warns = [c for c in BEATS["prag"]["cues"] if c["speaker"] == "tata"][0]
    duration = lesson["end"]-lesson["start"]
    growl = next(e["start"] for e in TIMING["effects"] if e["file"] == "burta.wav" and e["start"] > ask["end"])
    table = [
        ("tava", "Mama · bucătărie", "Duce pâinea la masă", (begin+4, (begin+settle)//2, settle-6)),
        ("repaus", "Mama · bucătărie", "Retrage mâinile", (settle+6, settle+21, settle+40)),
        ("invitatie", "Mama · bucătărie", "Invită copiii, palma în sus",
         (invite["start"]+20, invite["start"]+60, invite["end"]+15)),
        ("obraz", "Mama · bucătărie", "Mâna la obraz",
         (reaction-12, reaction+14, ask["start"]+29)),
        ("batic", "Mama · bucătărie", "Ridică un colț al baticului",
         (laugh-6, laugh+14, prayer-2)),
        ("rugaciune", "Mama · rugăciune", "La icoane, repaus",
         (prayer+20, prayer+220, prayer+430)),
        # Faza 2
        ("costica-pâine", "Costică · bucătărie", "Întinde mâna spre pâine",
         (BEATS["aproape"]["start"]+14, beat_frame("aproape", .33)+8, BEATS["prag"]["start"]+30)),
        ("costica-explica", "Costică · bucătărie", "Explică cu mâna liberă",
         (defense["start"]+10, defense["start"]+40, defense["end"]+14)),
        ("costica-burta", "Costică · bucătărie", "Mâinile pe burtă",
         (growl+2, growl+20, joke["end"])),
        ("tata-stop", "Tata · prag", "Semnul de oprire",
         (warns["start"]+2, warns["start"]+30, warns["end"]+6)),
        ("tata-barba", "Tata · prag", "Își mângâie barba, arată jos și sus",
         (lesson["start"]+8, lesson["start"]+round(duration*.55)+4, lesson["start"]+round(duration*.78)+6)),
        ("mihai-carte", "Mihai · bucătărie", "Ține cartea sub braț",
         (begin+20, BEATS["traista"]["start"]+40, BEATS["intai"]["start"]+40)),
    ]
    return [(id_, actor, title, tuple(drawn(f) for f in frames)) for id_, actor, title, frames in table]


if __name__ == "__main__":
    for row in moments():
        print(*row)
